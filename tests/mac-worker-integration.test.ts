import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { database, asUser, alice } from "./helpers/database";
import { createOpenClawRuntime } from "../src/worker/openclaw";
import {
  runDraftJob,
  createWorkerTransport,
} from "../src/lib/automation/draft-worker";
import { createOpenAIDraftProvider } from "../src/lib/automation/draft-provider";
const enabled =
  process.env.RUN_OPENCLAW_PROBE === "1" && process.platform === "darwin";
it.skipIf(!enabled)(
  "takes a real database lease through the HTTP adapter, installed runtime and fake model into one unapproved Draft",
  async () => {
    const db = await database();
    const stateDir = await mkdtemp(join(process.cwd(), ".worker-test-"));
    const answer = {
      body: "The saved price is ₱850.",
      reviewReason: "Synthetic integration. Review before sending.",
    };
    const upstream = vi.fn<typeof fetch>(async () =>
      Response.json({
        status: "completed",
        error: null,
        incomplete_details: null,
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: JSON.stringify(answer) }],
          },
        ],
      }),
    );
    const runtime = createOpenClawRuntime(
      {
        stateDir,
        installRoot: "/opt/homebrew/lib/node_modules/openclaw",
        nodePath: "/opt/homebrew/bin/node",
      },
      createOpenAIDraftProvider(
        "synthetic-parent-key",
        "configured-model",
        upstream,
      ),
    );
    const owner = async (command: object) =>
      (
        await db.query<{ result: Record<string, unknown> }>(
          "select public.draft_queue($1::jsonb) result",
          [JSON.stringify(command)],
        )
      ).rows[0].result;
    try {
      await asUser(db, alice);
      const item = randomUUID(),
        inquiry = randomUUID();
      await db.query(
        "insert into public.items(id,title,price,condition,category,status) values ($1,'Lamp',850,'Good','Other','Listed')",
        [item],
      );
      await db.query("select public.buyer_workspace($1::jsonb)", [
        JSON.stringify({
          op: "saveInquiry",
          expected_revision: null,
          input: {
            id: inquiry,
            item_id: item,
            channel: "marketplace",
            surface: "dm",
            buyer_name: "Synthetic buyer",
            message: "How much?",
            received_at: "2026-10-30T00:00:00Z",
          },
        }),
      ]);
      const enrolled = await owner({
        op: "enroll",
        label: "Synthetic runtime",
      });
      const state = await owner({ op: "list" });
      await owner({
        op: "pause",
        paused: false,
        expected_revision: state.revision,
      });
      await owner({ op: "enqueue", id: randomUUID(), inquiry_id: inquiry });
      await asUser(db, null);
      // HTTP itself is stubbed; RPC, parsing, lease and model/provider boundaries are real.
      const http = vi.fn<typeof fetch>(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const result = (
          await db.query<{ result: unknown }>(
            "select public.draft_worker($1,$2::jsonb) result",
            [body.worker_token, JSON.stringify(body.command)],
          )
        ).rows[0].result;
        return Response.json(result);
      });
      const transport = createWorkerTransport(
        "https://synthetic.supabase.co",
        "sb_publishable_synthetic",
        String(enrolled.token),
        http,
      );
      expect((await runDraftJob(transport, runtime)).status).toBe("completed");
      await runtime.close();
      expect(upstream).toHaveBeenCalledTimes(1);
      expect((await runDraftJob(transport, runtime)).status).toBe("idle");
      expect(upstream).toHaveBeenCalledTimes(1);
      await asUser(db, alice);
      const replies = (
        await db.query<{ status: string; source: string; body: string }>(
          "select status,source,body from public.suggested_replies",
        )
      ).rows;
      expect(replies).toEqual([
        { status: "Draft", source: "agent", body: answer.body },
      ]);
      expect(
        (
          await db.query<{ requests: number }>(
            "select requests from public.ai_usage",
          )
        ).rows[0].requests,
      ).toBe(1);
      expect(await readdir(stateDir)).toEqual([]);
    } finally {
      await runtime.close();
      await db.close();
      await rm(stateDir, { recursive: true, force: true });
    }
  },
  40000,
);
