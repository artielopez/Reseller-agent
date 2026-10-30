import { beforeAll, afterAll, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { database, asUser, alice, bob } from "./helpers/database";
import { threadSchema, type ReplyContext } from "../src/lib/buyer/domain";
import { runDraftJob } from "../src/lib/automation/draft-worker";
let db: PGlite;
const item = randomUUID(),
  inquiry = randomUUID();
let token: string, workerId: string;
type Job = {
  id: string;
  lease_id: string;
  context: ReplyContext;
  status: string;
  reply_id?: string;
};
async function owner<T = Record<string, unknown>>(command: object) {
  return (
    await db.query<{ result: T }>(
      "select public.draft_queue($1::jsonb) result",
      [JSON.stringify(command)],
    )
  ).rows[0].result;
}
async function worker<T = Job | null>(command: object, key = token) {
  return (
    await db.query<{ result: T }>(
      "select public.draft_worker($1,$2::jsonb) result",
      [key, JSON.stringify(command)],
    )
  ).rows[0].result;
}
async function setPause(paused: boolean) {
  const state = await owner<{ revision: string }>({ op: "list" });
  return owner({ op: "pause", paused, expected_revision: state.revision });
}
async function enqueue() {
  await asUser(db, alice);
  return owner<Job>({ op: "enqueue", id: randomUUID(), inquiry_id: inquiry });
}
beforeAll(async () => {
  db = await database();
  await asUser(db, alice);
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
        buyer_name: "",
        message: "How much?",
        received_at: "2026-10-30T00:00:00Z",
      },
    }),
  ]);
}, 30000);
afterAll(async () => {
  if (db) await db.close();
});
it("enrolls a narrow credential, stores only its hash and starts paused", async () => {
  const e = await owner<{ id: string; token: string }>({
    op: "enroll",
    label: "Mac mini",
  });
  token = e.token;
  workerId = e.id;
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  const state = await owner<{ paused: boolean; workers: unknown[] }>({
    op: "list",
  });
  expect(state.paused).toBe(true);
  expect(JSON.stringify(state)).not.toContain(token);
  expect(JSON.stringify(state)).not.toContain("token_hash");
  await expect(
    db.query("select token_hash from public.draft_workers"),
  ).rejects.toThrow();
  await enqueue();
  await asUser(db, null);
  expect(await worker({ op: "claim" })).toBeNull();
});
it("isolates owners and rejects anonymous control and forged command ownership", async () => {
  await asUser(db, bob);
  const state = await owner<{ jobs: unknown[]; workers: unknown[] }>({
    op: "list",
  });
  expect(state.jobs).toEqual([]);
  expect(state.workers).toEqual([]);
  await expect(
    owner({ op: "enqueue", id: randomUUID(), inquiry_id: inquiry }),
  ).rejects.toThrow();
  await expect(owner({ op: "revoke", id: workerId })).rejects.toThrow();
  await asUser(db, null);
  await expect(owner({ op: "list" })).rejects.toThrow();
  await expect(worker({ op: "claim", owner_id: alice })).rejects.toThrow();
  await expect(worker({ op: "claim" }, "0".repeat(64))).rejects.toThrow();
});
it("claims once, shares listing quota, rejects duplicate start, and saves only an unapproved draft", async () => {
  await asUser(db, alice);
  await setPause(false);
  await db.query("select public.reserve_ai_generation()");
  await asUser(db, null);
  const claims = await Promise.all([
    worker({ op: "claim" }),
    worker({ op: "claim" }),
  ]);
  const claimed = claims.filter(Boolean);
  expect(claimed).toHaveLength(1);
  const claim = claimed[0];
  expect(claim?.status).toBe("leased");
  expect(await worker({ op: "claim" })).toBeNull();
  const command = { job_id: claim!.id, lease_id: claim!.lease_id };
  expect(await worker({ op: "start", ...command })).toEqual({ admitted: true });
  expect(await worker({ op: "start", ...command })).toEqual({
    admitted: false,
  });
  const submission = {
    op: "submit",
    ...command,
    body: "The asking price is ₱850.",
    review_reason: "Confirm details before copying.",
  };
  const result = await worker<{ reply_id: string }>(submission);
  expect(await worker(submission)).toEqual(result);
  await expect(
    worker({ ...submission, body: "Different text" }),
  ).rejects.toThrow();
  await asUser(db, alice);
  const usage = await db.query<{ requests: number }>(
    "select requests from public.ai_usage",
  );
  expect(usage.rows[0].requests).toBe(2);
  const saved = await db.query<{ status: string; source: string }>(
    "select status,source from public.suggested_replies where id=$1",
    [result.reply_id],
  );
  expect(saved.rows[0]).toEqual({ status: "Draft", source: "agent" });
  expect(
    (
      await db.query<{ status: string }>(
        "select status from public.buyer_inquiries where id=$1",
        [inquiry],
      )
    ).rows[0].status,
  ).toBe("Open");
});
it("does not grant another worker the first worker's lease", async () => {
  await enqueue();
  const e = await owner<{ token: string }>({
    op: "enroll",
    label: "Other worker",
  });
  await asUser(db, null);
  const claim = (await worker({ op: "claim" }))!;
  await expect(
    worker(
      { op: "context", job_id: claim.id, lease_id: claim.lease_id },
      e.token,
    ),
  ).rejects.toThrow();
  await worker({
    op: "fail",
    job_id: claim.id,
    lease_id: claim.lease_id,
    reason: "runtime_unverified",
  });
});
it("checks saved facts before allowance and result acceptance", async () => {
  await enqueue();
  await asUser(db, null);
  let claim = (await worker({ op: "claim" }))!;
  await asUser(db, alice);
  await db.query("update public.items set price=900 where id=$1", [item]);
  await asUser(db, null);
  await expect(
    worker({ op: "start", job_id: claim.id, lease_id: claim.lease_id }),
  ).rejects.toThrow();
  await asUser(db, alice);
  await owner({ op: "cancel", id: claim.id });
  await enqueue();
  await asUser(db, null);
  claim = (await worker({ op: "claim" }))!;
  await worker({ op: "start", job_id: claim.id, lease_id: claim.lease_id });
  await asUser(db, alice);
  await db.query("update public.items set status='Sold' where id=$1", [item]);
  await asUser(db, null);
  await expect(
    worker({
      op: "submit",
      job_id: claim.id,
      lease_id: claim.lease_id,
      body: "Available",
      review_reason: "Review",
    }),
  ).rejects.toThrow();
  await asUser(db, alice);
  await owner({ op: "cancel", id: claim.id });
});
it("rejects paused, revoked and expired worker access", async () => {
  await enqueue();
  await asUser(db, null);
  const claim = (await worker({ op: "claim" }))!;
  await asUser(db, alice);
  await setPause(true);
  await asUser(db, null);
  await expect(
    worker({ op: "context", job_id: claim.id, lease_id: claim.lease_id }),
  ).rejects.toThrow();
  await asUser(db, alice);
  await setPause(false);
  await owner({ op: "revoke", id: workerId });
  await asUser(db, null);
  await expect(worker({ op: "claim" })).rejects.toThrow();
  await asUser(db, alice);
  const e = await owner<{ id: string; token: string }>({
    op: "enroll",
    label: "Replacement",
  });
  token = e.token;
  workerId = e.id;
  await db.exec("reset role");
  await db.query(
    "update public.draft_workers set expires_at=now()-interval '1 second' where id=$1",
    [workerId],
  );
  await asUser(db, null);
  await expect(worker({ op: "claim" })).rejects.toThrow();
  await asUser(db, alice);
  const next = await owner<{ id: string; token: string }>({
    op: "enroll",
    label: "Fresh",
  });
  token = next.token;
  workerId = next.id;
});
it("does not automatically replay expired leases", async () => {
  await enqueue();
  await asUser(db, null);
  const claim = (await worker({ op: "claim" }))!;
  await db.exec("reset role");
  await db.query(
    "update public.draft_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
    [claim.id],
  );
  await asUser(db, null);
  expect(await worker({ op: "claim" })).toBeNull();
  await expect(
    worker({ op: "start", job_id: claim.id, lease_id: claim.lease_id }),
  ).rejects.toThrow();
  await asUser(db, alice);
  expect(
    (
      await db.query(
        "select status,reason from public.draft_jobs where id=$1",
        [claim.id],
      )
    ).rows[0],
  ).toEqual({ status: "failed", reason: "lease_expired" });
});
it("enforces the shared daily ceiling and accepts no direct writes", async () => {
  await enqueue();
  await db.exec("reset role");
  await db.query("update public.ai_usage set requests=20 where owner_id=$1", [
    alice,
  ]);
  await asUser(db, null);
  const claim = (await worker({ op: "claim" }))!;
  expect(
    await worker({ op: "start", job_id: claim.id, lease_id: claim.lease_id }),
  ).toEqual({ admitted: false });
  await expect(
    worker({
      op: "submit",
      job_id: claim.id,
      lease_id: claim.lease_id,
      body: "x",
      review_reason: "x",
    }),
  ).rejects.toThrow();
  await asUser(db, alice);
  await expect(
    db.query("update public.draft_jobs set status='completed'"),
  ).rejects.toThrow();
  await owner({ op: "cancel", id: claim.id });
});
it("rejects public or closed questions, unsupported operations and oversized payloads", async () => {
  await asUser(db, alice);
  await db.exec("reset role");
  await db.query(
    "update public.buyer_inquiries set channel='groups',surface='group_comment' where id=$1",
    [inquiry],
  );
  await asUser(db, alice);
  await expect(enqueue()).rejects.toThrow();
  await expect(
    owner({ op: "enroll", label: "x".repeat(17000) }),
  ).rejects.toThrow();
  await asUser(db, null);
  await expect(worker({ op: "send", body: "hi" })).rejects.toThrow();
});

it("runs the actual queue-to-inbox flow with a synthetic provider and keeps approval separate", async () => {
  await asUser(db, alice);
  const qid = randomUUID();
  await db.query("select public.buyer_workspace($1::jsonb)", [
    JSON.stringify({
      op: "saveInquiry",
      expected_revision: null,
      input: {
        id: qid,
        item_id: item,
        channel: "marketplace",
        surface: "dm",
        buyer_name: "",
        message: "What is the condition?",
        received_at: "2026-10-30T00:00:00Z",
      },
    }),
  ]);
  await owner({ op: "enqueue", id: randomUUID(), inquiry_id: qid });
  await db.exec("reset role");
  await db.query("update public.ai_usage set requests=1 where owner_id=$1", [
    alice,
  ]);
  await asUser(db, null);
  const outcome = await runDraftJob((command) => worker(command), {
    verifyRuntime: async () => true,
    generate: async () => ({
      body: "Condition is Good. The item is marked sold.",
      reviewReason: "Synthetic test; review saved facts.",
    }),
  });
  expect(outcome.status).toBe("completed");
  await asUser(db, alice);
  const result = (
    await db.query<{ result: unknown }>(
      "select public.buyer_workspace($1::jsonb) result",
      [JSON.stringify({ op: "get", id: qid })],
    )
  ).rows[0].result;
  const thread = threadSchema.parse(result);
  expect(thread.replies[0].source).toBe("agent");
  expect(thread.replies[0].status).toBe("Draft");
  expect(thread.replies[0].review_note).toContain("Synthetic test");
  await expect(
    db.query("select public.buyer_workspace($1::jsonb)", [
      JSON.stringify({
        op: "copy",
        id: thread.replies[0].id,
        expected_revision: thread.replies[0].revision,
      }),
    ]),
  ).rejects.toThrow();
});
it("requires the current controls revision and denies helper access", async () => {
  await asUser(db, alice);
  await expect(
    owner({ op: "pause", paused: false, expected_revision: "0" }),
  ).rejects.toThrow();
  await expect(
    db.query("select public.draft_owned_context($1,$2)", [alice, inquiry]),
  ).rejects.toThrow();
  await asUser(db, null);
  await expect(db.query("select * from public.draft_jobs")).rejects.toThrow();
});
async function leasedPrivateJob() {
  await asUser(db, alice);
  const qid = randomUUID();
  await db.query("select public.buyer_workspace($1::jsonb)", [
    JSON.stringify({
      op: "saveInquiry",
      expected_revision: null,
      input: {
        id: qid,
        item_id: item,
        channel: "marketplace",
        surface: "dm",
        buyer_name: "",
        message: "Review timing",
        received_at: "2026-10-30T00:00:00Z",
      },
    }),
  ]);
  await owner({ op: "enqueue", id: randomUUID(), inquiry_id: qid });
  await asUser(db, null);
  return (await worker({ op: "claim" }))!;
}
it("rejects a lease that expires after transaction start but before admission", async () => {
  const claim = await leasedPrivateJob();
  await db.exec("reset role; begin");
  try {
    await db.query(
      "update public.draft_jobs set lease_expires_at=now()+interval '100 milliseconds' where id=$1",
      [claim.id],
    );
    await db.exec("set role anon");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await expect(
      worker({ op: "start", job_id: claim.id, lease_id: claim.lease_id }),
    ).rejects.toThrow("Lease unavailable");
  } finally {
    await db.exec("rollback");
  }
  await asUser(db, alice);
  await owner({ op: "cancel", id: claim.id });
});
it("rejects a worker token that expires after transaction start", async () => {
  await asUser(db, alice);
  const e = await owner<{ id: string; token: string }>({
    op: "enroll",
    label: "Timing test",
  });
  await db.exec("reset role; begin");
  try {
    await db.query(
      "update public.draft_workers set expires_at=now()+interval '100 milliseconds' where id=$1",
      [e.id],
    );
    await db.exec("set role anon");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await expect(worker({ op: "claim" }, e.token)).rejects.toThrow(
      "Worker unavailable",
    );
  } finally {
    await db.exec("rollback");
  }
});
it("rejects committing a result after actual lease expiry within a transaction", async () => {
  const claim = await leasedPrivateJob();
  await worker({ op: "start", job_id: claim.id, lease_id: claim.lease_id });
  await db.exec("reset role; begin");
  try {
    await db.query(
      "update public.draft_jobs set lease_expires_at=now()+interval '100 milliseconds' where id=$1",
      [claim.id],
    );
    await db.exec("set role anon");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await expect(
      worker({
        op: "submit",
        job_id: claim.id,
        lease_id: claim.lease_id,
        body: "Review me",
        review_reason: "Review",
      }),
    ).rejects.toThrow("Lease unavailable");
  } finally {
    await db.exec("rollback");
  }
  await asUser(db, alice);
  await owner({ op: "cancel", id: claim.id });
});
it("keeps the claim's item lock ahead of job mutation, including expiration cleanup", async () => {
  // Static lock-order regression: PGlite cannot reproduce a separate-session deadlock.
  const definition = (
    await db.query<{ body: string }>(
      "select pg_get_functiondef('public.draft_worker(text,jsonb)'::regprocedure) body",
    )
  ).rows[0].body
    .replace(/\s+/g, " ")
    .toLowerCase();
  const itemLock = definition.indexOf("perform 1 from public.items");
  expect(itemLock).toBeGreaterThan(0);
  expect(definition.indexOf("update public.draft_jobs")).toBeGreaterThan(
    itemLock,
  );
});
