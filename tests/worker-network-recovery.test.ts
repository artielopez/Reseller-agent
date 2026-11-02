import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { database, asUser, alice } from "./helpers/database";
import {
  createWorkerTransport,
  runDraftJob,
} from "../src/lib/automation/draft-worker";
import { runWorkerLoop } from "../src/worker/runner";

// Real loopback HTTP + production transport/parser + migrated SQL. Only the
// upstream hostname is redirected by this test's fetch adapter; production
// still requires HTTPS. No cloud credentials, installed agent or model calls.
async function fixture(dropAfter: "claim" | "start" | "submit" | null) {
  const db = await database();
  const commands: string[] = [];
  const server = createServer(async (request, response) => {
    try {
      let body = "";
      for await (const chunk of request) body += chunk;
      const { worker_token, command } = JSON.parse(body);
      commands.push(command.op);
      const result = (
        await db.query<{ result: unknown }>(
          "select public.draft_worker($1,$2::jsonb) result",
          [worker_token, JSON.stringify(command)],
        )
      ).rows[0].result;
      // Deliberately lose acknowledgment AFTER the transaction committed.
      if (command.op === dropAfter) {
        dropAfter = null;
        response.destroy();
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
    } catch {
      response.writeHead(503);
      response.end("Synthetic unavailable endpoint");
    }
  });
  const owner = async <T = Record<string, unknown>>(command: object) =>
    (
      await db.query<{ result: T }>(
        "select public.draft_queue($1::jsonb) result",
        [JSON.stringify(command)],
      )
    ).rows[0].result;
  try {
    await asUser(db, alice);
    const itemId = randomUUID(),
      inquiryId = randomUUID(),
      jobId = randomUUID();
    await db.query(
      "insert into public.items(id,title,price,condition,category,status) values ($1,'Synthetic recovery lamp',850,'Good','Other','Listed')",
      [itemId],
    );
    await db.query("select public.buyer_workspace($1::jsonb)", [
      JSON.stringify({
        op: "saveInquiry",
        expected_revision: null,
        input: {
          id: inquiryId,
          item_id: itemId,
          channel: "marketplace",
          surface: "dm",
          buyer_name: "",
          message: "Price?",
          received_at: "2026-10-30T00:00:00Z",
        },
      }),
    ]);
    const enrolled = await owner<{ token: string }>({
      op: "enroll",
      label: "Synthetic recovery worker",
    });
    const state = await owner<{ revision: string }>({ op: "list" });
    await owner({
      op: "pause",
      paused: false,
      expected_revision: state.revision,
    });
    await owner({ op: "enqueue", id: jobId, inquiry_id: inquiryId });
    await asUser(db, null);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const transport = createWorkerTransport(
      "https://synthetic.supabase.co",
      "sb_publishable_synthetic",
      enrolled.token,
      async (url, init) => {
        expect(String(url)).toBe(
          "https://synthetic.supabase.co/rest/v1/rpc/draft_worker",
        );
        return fetch(origin + "/rest/v1/rpc/draft_worker", init);
      },
    );
    const runtime = {
      verifyRuntime: vi.fn(async () => true),
      generate: vi.fn(async () => ({
        body: "The saved asking price is ₱850.",
        reviewReason: "Synthetic recovery test; human review required.",
      })),
    };
    const closeServer = async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    };
    const snapshot = async () => {
      await asUser(db, alice);
      const job = (
        await db.query<{
          status: string;
          attempt_started: boolean;
          reason: string | null;
        }>(
          "select status,attempt_started,reason from public.draft_jobs where id=$1",
          [jobId],
        )
      ).rows[0];
      const replies = (
        await db.query(
          "select status,source,approved_at from public.suggested_replies",
        )
      ).rows;
      const usage = (
        await db.query<{ requests: number }>(
          "select requests from public.ai_usage",
        )
      ).rows.reduce((sum, row) => sum + row.requests, 0);
      await asUser(db, null);
      return { job, replies, usage };
    };
    return {
      db,
      transport,
      runtime,
      commands,
      jobId,
      snapshot,
      closeServer,
      close: async () => {
        await closeServer();
        await db.close();
      },
    };
  } catch (error) {
    server.closeAllConnections();
    server.close();
    await db.close();
    throw error;
  }
}

it.each([
  ["claim", "unavailable", "leased", false, 0, 0],
  ["start", "failed", "failed", true, 1, 0],
  ["submit", "unknown", "completed", true, 1, 1],
] as const)(
  "lost %s acknowledgment stops the loop and never replays admitted work",
  async (stage, outcome, status, started, usage, replies) => {
    const f = await fixture(stage);
    const wait = vi.fn(async () => {}),
      close = vi.fn(async () => {});
    try {
      expect(
        await runWorkerLoop({
          watch: true,
          signal: new AbortController().signal,
          job: () => ({
            run: () => runDraftJob(f.transport, f.runtime),
            close,
          }),
          wait,
          report: () => {},
        }),
      ).toBe(outcome);
      expect(wait).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(1);
      expect(f.commands.filter((op) => op === stage)).toHaveLength(1);
      const before = await f.snapshot();
      expect(before.job).toMatchObject({ status, attempt_started: started });
      expect(before.usage).toBe(usage);
      expect(before.replies).toHaveLength(replies);
      if (replies)
        expect(before.replies).toEqual([
          { status: "Draft", source: "agent", approved_at: null },
        ]);
      expect(f.runtime.generate).toHaveBeenCalledTimes(replies);
      if (stage === "submit") expect(f.commands).not.toContain("fail");

      // Simulate a new operator invocation after the outage, not an auto-retry.
      expect(await runDraftJob(f.transport, f.runtime)).toEqual({
        status: "idle",
      });
      expect(await f.snapshot()).toEqual(before);
      expect(f.runtime.generate).toHaveBeenCalledTimes(replies);
      if (stage === "claim") {
        // Simulated time passage, with no wall-clock sleep or claim replay.
        await f.db.exec("reset role");
        await f.db.query(
          "update public.draft_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",
          [f.jobId],
        );
        await asUser(f.db, null);
        expect(await runDraftJob(f.transport, f.runtime)).toEqual({
          status: "idle",
        });
        expect((await f.snapshot()).job).toMatchObject({
          status: "failed",
          reason: "lease_expired",
          attempt_started: false,
        });
        expect(f.runtime.generate).not.toHaveBeenCalled();
      }
    } finally {
      await f.close();
    }
  },
  15000,
);

it("a disconnected endpoint leaves a queued question untouched and makes no model call", async () => {
  const f = await fixture(null);
  try {
    const before = await f.snapshot();
    await f.closeServer();
    expect(await runDraftJob(f.transport, f.runtime)).toEqual({
      status: "unavailable",
    });
    expect(await f.snapshot()).toEqual(before);
    expect(f.commands).toEqual([]);
    expect(f.runtime.generate).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
}, 15000);
