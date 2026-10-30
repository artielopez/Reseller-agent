import { z } from "zod";
import { channels } from "../domain";
export type SimulationTransport = (
  command: Record<string, unknown>,
) => Promise<unknown>;
const syntheticId = z.string().regex(/^synthetic:.{1,150}$/);
const destinationSchema = z
  .object({
    channel: z.enum(channels),
    surface: z.enum(["dm", "group_comment"]),
    account_id: syntheticId,
    thread_id: syntheticId,
    message_id: syntheticId,
    post_id: syntheticId.nullable(),
    comment_id: syntheticId.nullable(),
  })
  .strict()
  .refine((d) =>
    d.surface === "dm"
      ? d.post_id === null && d.comment_id === null
      : d.channel === "groups" && d.post_id !== null && d.comment_id !== null,
  );
const candidateSchema = z
  .object({
    simulation: z.literal(true),
    body: z.string().min(1).max(10000),
    destination: destinationSchema,
  })
  .catchall(z.json());
type Candidate = z.infer<typeof candidateSchema>;
type Evidence = {
  simulation_id: string;
  destination: Candidate["destination"];
  external_id: string;
};
type FakeResult =
  | { outcome: "confirmed"; evidence: Evidence }
  | { outcome: "unknown" | "failed" };
function bounded(value: unknown) {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 65536)
    throw new Error("Simulation response too large.");
  return value;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, data]) => JSON.stringify(key) + ":" + canonical(data))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
/** In-memory external-service stand-in. No URL, credentials, network, browser or
 * real sending capability. Its receipts simulate an external confirmation log. */
export class FakeDeliveryAdapter {
  #receipts = new Map<string, Evidence>();
  #attempted = new Set<string>();
  constructor(private readonly mode: "confirmed" | "lost_ack" | "rejected") {}
  async submit(id: string, raw: unknown): Promise<FakeResult> {
    z.uuid().parse(id);
    const candidate = candidateSchema.parse(bounded(raw));
    if (this.#attempted.has(id))
      throw new Error("Fake submission must not be repeated.");
    this.#attempted.add(id);
    if (this.mode === "rejected") return { outcome: "failed" };
    const evidence = {
      simulation_id: id,
      destination: structuredClone(candidate.destination),
      external_id: "synthetic:" + crypto.randomUUID(),
    };
    this.#receipts.set(id, evidence);
    return this.mode === "lost_ack"
      ? { outcome: "unknown" }
      : { outcome: "confirmed", evidence: structuredClone(evidence) };
  }
  confirmationFor(id: string): Evidence | null {
    const found = this.#receipts.get(id);
    return found ? structuredClone(found) : null;
  }
}
/** Runs one explicit simulation. A start or outcome response may be lost after
 * commit: never invoke the fake adapter or repeat a write on that uncertainty. */
export async function runDeliverySimulation(
  transport: SimulationTransport,
  id: string,
  adapter: FakeDeliveryAdapter,
): Promise<
  "idle" | "unavailable" | "canceled" | "unknown" | "confirmed" | "failed"
> {
  const claimSchema = z
    .object({
      id: z.uuid(),
      lease_id: z.uuid(),
      status: z.literal("claimed"),
      candidate: candidateSchema,
      simulation: z.literal(true),
    })
    .strict();
  let claim: z.infer<typeof claimSchema>;
  try {
    z.uuid().parse(id);
    if (!(adapter instanceof FakeDeliveryAdapter)) return "unavailable";
    const raw = await transport({ op: "claim", id });
    if (raw === null) return "idle";
    claim = claimSchema.parse(bounded(raw));
    if (claim.id !== id) return "unavailable";
  } catch {
    return "unavailable";
  }
  const ref = { id, lease_id: claim.lease_id };
  try {
    const start = z
      .discriminatedUnion("status", [
        z
          .object({
            id: z.uuid(),
            status: z.literal("submitted"),
            simulation: z.literal(true),
            candidate: candidateSchema,
          })
          .strict(),
        z
          .object({
            id: z.uuid(),
            status: z.enum(["canceled", "unknown"]),
            simulation: z.literal(true),
          })
          .strict(),
      ])
      .parse(bounded(await transport({ op: "start", ...ref })));
    if (start.id !== id) return "unknown";
    if (start.status !== "submitted") return start.status;
    if (canonical(start.candidate) !== canonical(claim.candidate))
      return "unknown";
  } catch {
    return "unknown";
  }
  let result: FakeResult;
  try {
    result = await adapter.submit(id, claim.candidate);
  } catch {
    result = { outcome: "unknown" };
  }
  try {
    const saved = z
      .object({
        id: z.uuid(),
        status: z.enum(["confirmed", "unknown", "failed"]),
        simulation: z.literal(true),
      })
      .strict()
      .parse(
        bounded(
          await transport({
            op: "outcome",
            ...ref,
            outcome: result.outcome,
            ...(result.outcome === "confirmed"
              ? { evidence: result.evidence }
              : {}),
          }),
        ),
      );
    return saved.id === id && saved.status === result.outcome
      ? saved.status
      : "unknown";
  } catch {
    return "unknown";
  }
}
