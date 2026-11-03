import { z } from "zod";
import { contextSchema } from "../buyer/domain";
import { prepareAgentDraft, type DraftDependencies } from "./drafting";

export type WorkerTransport = (
  command: Record<string, unknown>,
) => Promise<unknown>;
const lease = { job_id: z.uuid(), lease_id: z.uuid() };
const commandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("claim") }).strict(),
  z.object({ op: z.literal("context"), ...lease }).strict(),
  z.object({ op: z.literal("start"), ...lease }).strict(),
  z
    .object({
      op: z.literal("submit"),
      ...lease,
      body: z.string().trim().min(1).max(2000),
      review_reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      op: z.literal("fail"),
      ...lease,
      reason: z.enum([
        "runtime_unverified",
        "provider_unavailable",
        "invalid_output",
        "timeout",
      ]),
    })
    .strict(),
]);
const claimSchema = z.object({
  id: z.uuid(),
  lease_id: z.uuid(),
  context: contextSchema,
  status: z.literal("leased"),
  lease_expires_at: z.iso.datetime({ offset: true }),
});

/** Call only with operator-configured Supabase URL/public key and a draft-only
 * enrollment token. No browser input may choose this URL or its credentials.
 * No retries, redirects, provider errors or response bodies are logged. */
export function createWorkerTransport(
  projectUrl: string,
  publicKey: string,
  token: string,
  fetcher: typeof fetch = fetch,
): WorkerTransport {
  const url = new URL(projectUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !publicKey ||
    !/^([a-f0-9]{64})$/.test(token)
  )
    throw new Error("Invalid worker configuration.");
  return async (raw) => {
    const encoded = JSON.stringify(raw);
    if (new TextEncoder().encode(encoded).length > 16384)
      throw new Error("Worker command is too large.");
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) throw new Error("Invalid worker command.");
    try {
      const response = await fetcher(url.origin + "/rest/v1/rpc/draft_worker", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          "Content-Type": "application/json",
          apikey: publicKey,
          Authorization: "Bearer " + publicKey,
        },
        body: JSON.stringify({ worker_token: token, command: parsed.data }),
      });
      if (!response.ok || !response.body) throw new Error("Request failed");
      const reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 65536) {
            await reader.cancel();
            throw new Error("Response too large");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const buffer = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }
      return JSON.parse(new TextDecoder().decode(buffer));
    } catch {
      throw new Error(
        "Worker request could not be confirmed. Check connection, enrollment and migration.",
      );
    }
  };
}

export type DraftJobOutcome =
  | { status: "idle" | "unavailable" }
  | { status: "failed" | "unknown"; jobId: string }
  | { status: "completed"; replyId: string };
/** One drafting job only. Does not poll, enroll, connect an agent, approve or send.
 * Runtime implementation must be separately verified before it is supplied. */
export async function runDraftJob(
  transport: WorkerTransport,
  runtime: Pick<DraftDependencies, "verifyRuntime" | "generate">,
): Promise<DraftJobOutcome> {
  let job: z.infer<typeof claimSchema>;
  try {
    const raw = await transport({ op: "claim" });
    if (raw === null) return { status: "idle" };
    job = claimSchema.parse(raw);
  } catch {
    return { status: "unavailable" };
  }
  const ref = { job_id: job.id, lease_id: job.lease_id };
  let verified = false;
  let draft: Awaited<ReturnType<typeof prepareAgentDraft>>;
  try {
    draft = await prepareAgentDraft(job.context, {
      verifyRuntime: async () => {
        verified = await runtime.verifyRuntime();
        return verified;
      },
      reloadContext: async () =>
        contextSchema.parse(await transport({ op: "context", ...ref })),
      reserveAttempt: async () =>
        z
          .object({ admitted: z.boolean() })
          .parse(await transport({ op: "start", ...ref })).admitted,
      generate: runtime.generate,
    });
  } catch {
    try {
      await transport({
        op: "fail",
        ...ref,
        reason: verified ? "provider_unavailable" : "runtime_unverified",
      });
    } catch {
      /* Expired/revoked or ambiguous job stays for owner reconciliation. */
    }
    return { status: "failed", jobId: job.id };
  }
  try {
    const result = z
      .object({ reply_id: z.uuid() })
      .parse(
        await transport({
          op: "submit",
          ...ref,
          body: draft.body,
          review_reason: draft.reviewReason,
        }),
      );
    return { status: "completed", replyId: result.reply_id };
  } catch {
    // The database may already have committed the draft. Never resubmit blindly
    // or create a second paid attempt; the owner can inspect the saved queue.
    return { status: "unknown", jobId: job.id };
  }
}
