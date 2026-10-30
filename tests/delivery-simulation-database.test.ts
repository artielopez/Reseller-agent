import { afterAll, beforeAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import {
  FakeDeliveryAdapter,
  runDeliverySimulation,
} from "../src/lib/automation/delivery-simulation";
import { database, asUser, alice, bob } from "./helpers/database";
let db: PGlite;
const item = randomUUID(),
  inquiry = randomUUID(),
  reply = randomUUID(),
  thread = randomUUID();
async function command<T = Record<string, unknown>>(input: object) {
  return (
    await db.query<{ result: T }>(
      "select public.delivery_simulation($1::jsonb) result",
      [JSON.stringify(input)],
    )
  ).rows[0].result;
}
async function buyer(input: object) {
  return (
    await db.query<{ result: Record<string, unknown> }>(
      "select public.buyer_workspace($1::jsonb) result",
      [JSON.stringify(input)],
    )
  ).rows[0].result;
}
beforeAll(async () => {
  db = await database();
  await asUser(db, alice);
  await db.query(
    "insert into public.items(id,title,price,condition,category,status) values ($1,'Lamp',850,'Good','Other','Listed')",
    [item],
  );
  await buyer({
    op: "saveInquiry",
    expected_revision: null,
    input: {
      id: inquiry,
      item_id: item,
      channel: "marketplace",
      surface: "dm",
      buyer_name: "",
      message: "How much?",
      received_at: new Date(Date.now() - 30000).toISOString(),
    },
  });
  const saved = await buyer({ op: "get", id: inquiry });
  await buyer({
    op: "draft",
    id: reply,
    inquiry_id: inquiry,
    body: "The asking price is ₱850.",
    source: "template",
    context: saved.context,
  });
  await buyer({
    op: "approve",
    id: reply,
    expected_revision: "1",
    context: saved.context,
  });
}, 30000);
afterAll(async () => {
  if (db) await db.close();
});
it("starts paused and rejects anonymous access, privileged fields and real destination identities", async () => {
  expect(await command({ op: "state" })).toMatchObject({
    paused: true,
    revision: "1",
    jobs: [],
  });
  await expect(
    command({
      op: "thread",
      id: thread,
      channel: "marketplace",
      surface: "dm",
      account_id: "real",
      thread_id: "synthetic:thread",
      item_id: item,
    }),
  ).rejects.toThrow();
  await expect(command({ op: "state", owner_id: bob })).rejects.toThrow();
  await asUser(db, null);
  await expect(command({ op: "state" })).rejects.toThrow();
  await asUser(db, alice);
});
it("requires owned matching inquiry/reply and a separate exact synthetic source binding before enqueue", async () => {
  await command({
    op: "thread",
    id: thread,
    channel: "marketplace",
    surface: "dm",
    account_id: "synthetic:account",
    thread_id: "synthetic:thread",
    item_id: item,
  });
  await expect(
    command({
      op: "enqueue",
      id: randomUUID(),
      inquiry_id: inquiry,
      reply_id: reply,
    }),
  ).rejects.toThrow();
  await command({
    op: "source",
    thread_id: thread,
    inquiry_id: inquiry,
    message_id: "synthetic:question",
    source_revision: "9007199254740993",
    complete: true,
    deleted: false,
  });
  const id = randomUUID();
  expect(
    await command({ op: "enqueue", id, inquiry_id: inquiry, reply_id: reply }),
  ).toMatchObject({ id, status: "pending", simulation: true });
  expect(
    await command({ op: "enqueue", id, inquiry_id: inquiry, reply_id: reply }),
  ).toMatchObject({ id, status: "pending" });
  await asUser(db, bob);
  await expect(
    command({
      op: "enqueue",
      id: randomUUID(),
      inquiry_id: inquiry,
      reply_id: reply,
    }),
  ).rejects.toThrow();
  expect(await command({ op: "state" })).toMatchObject({ jobs: [] });
  await asUser(db, alice);
});
async function resume() {
  const state = await command<{ revision: string }>({ op: "state" });
  await command({
    op: "control",
    paused: false,
    expected_revision: state.revision,
  });
}
async function example(
  suffix: string,
  receivedAt = new Date(Date.now() - 30000).toISOString(),
) {
  const qid = randomUUID(),
    rid = randomUUID(),
    tid = randomUUID();
  const saved = await buyer({
    op: "saveInquiry",
    expected_revision: null,
    input: {
      id: qid,
      item_id: item,
      channel: "marketplace",
      surface: "dm",
      buyer_name: "",
      message: "Price?",
      received_at: receivedAt,
    },
  });
  await buyer({
    op: "draft",
    id: rid,
    inquiry_id: qid,
    body: "The asking price is ₱850.",
    source: "template",
    context: saved.context,
  });
  await buyer({
    op: "approve",
    id: rid,
    expected_revision: "1",
    context: saved.context,
  });
  await command({
    op: "thread",
    id: tid,
    channel: "marketplace",
    surface: "dm",
    account_id: "synthetic:account",
    thread_id: "synthetic:" + suffix,
    item_id: item,
  });
  await command({
    op: "source",
    thread_id: tid,
    inquiry_id: qid,
    message_id: "synthetic:q",
    source_revision: "1",
    complete: true,
    deleted: false,
  });
  await db.exec("reset role");
  await db.query(
    "update public.delivery_simulation_sources set observed_at=clock_timestamp()-interval '30 seconds' where inquiry_id=$1",
    [qid],
  );
  await asUser(db, alice);
  const id = randomUUID();
  await command({ op: "enqueue", id, inquiry_id: qid, reply_id: rid });
  return { id, qid, rid, tid };
}
it("fences two claimants, starts only once and requires exact evidence before synthetic confirmation", async () => {
  await resume();
  const e = await example("fences");
  const claims = await Promise.all([
    command<{ id: string; lease_id: string } | null>({ op: "claim", id: e.id }),
    command({ op: "claim", id: e.id }),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const claim = claims[0]!;
  expect(
    await command({ op: "start", id: e.id, lease_id: claim.lease_id }),
  ).toMatchObject({ id: e.id, status: "submitted", simulation: true });
  await expect(
    command({ op: "start", id: e.id, lease_id: claim.lease_id }),
  ).rejects.toThrow();
  await expect(
    command({
      op: "outcome",
      id: e.id,
      lease_id: claim.lease_id,
      outcome: "confirmed",
    }),
  ).rejects.toThrow();
  const evidence = {
    simulation_id: e.id,
    destination: (
      await command<{
        jobs: { id: string; candidate: { destination: unknown } }[];
      }>({ op: "state" })
    ).jobs.find((j) => j.id === e.id)!.candidate.destination,
    external_id: "synthetic:confirmation",
  };
  await expect(
    command({
      op: "outcome",
      id: e.id,
      lease_id: claim.lease_id,
      outcome: "confirmed",
      evidence: { ...evidence, simulation_id: randomUUID() },
    }),
  ).rejects.toThrow();
  expect(
    await command({
      op: "outcome",
      id: e.id,
      lease_id: claim.lease_id,
      outcome: "confirmed",
      evidence,
    }),
  ).toMatchObject({ status: "confirmed", simulation: true });
  expect(await command({ op: "claim", id: e.id })).toBeNull();
});
it("freezes an uncertain operation across a new caller and accepts only exact reconciliation evidence", async () => {
  const e = await example("uncertain");
  const claim = await command<{ lease_id: string }>({ op: "claim", id: e.id });
  await command({ op: "start", id: e.id, lease_id: claim.lease_id });
  await command({
    op: "outcome",
    id: e.id,
    lease_id: claim.lease_id,
    outcome: "unknown",
  });
  expect(await command({ op: "claim", id: e.id })).toBeNull();
  await expect(
    command({
      op: "enqueue",
      id: randomUUID(),
      inquiry_id: e.qid,
      reply_id: e.rid,
    }),
  ).rejects.toThrow();
  await expect(
    command({
      op: "reconcile",
      id: e.id,
      evidence: { external_id: "synthetic:text-matched" },
    }),
  ).rejects.toThrow();
  const state = await command<{
    jobs: { id: string; candidate: { destination: unknown } }[];
  }>({ op: "state" });
  const evidence = {
    simulation_id: e.id,
    destination: state.jobs.find((j) => j.id === e.id)!.candidate.destination,
    external_id: "synthetic:observed",
  };
  expect(await command({ op: "reconcile", id: e.id, evidence })).toMatchObject({
    status: "confirmed",
  });
});
it("invalidates unsent work on global pause and preserves submitted uncertainty", async () => {
  const e = await example("pause");
  const claim = await command<{ lease_id: string }>({ op: "claim", id: e.id });
  const state = await command<{ revision: string }>({ op: "state" });
  await command({
    op: "control",
    paused: true,
    expected_revision: state.revision,
  });
  await expect(
    command({ op: "start", id: e.id, lease_id: claim.lease_id }),
  ).rejects.toThrow();
  expect(await command({ op: "claim", id: e.id })).toBeNull();
  await resume();
});
it("retires an expired lease without reissuing it after restart", async () => {
  const e = await example("expiry");
  const claim = await command<{ lease_id: string }>({ op: "claim", id: e.id });
  await db.exec("reset role");
  await db.query(
    "update public.delivery_simulation_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",
    [e.id],
  );
  await asUser(db, alice);
  expect(await command({ op: "claim", id: e.id })).toBeNull();
  await expect(
    command({ op: "start", id: e.id, lease_id: claim.lease_id }),
  ).rejects.toThrow();
  const state = await command<{ jobs: { id: string; status: string }[] }>({
    op: "state",
  });
  expect(state.jobs.find((j) => j.id === e.id)?.status).toBe("canceled");
});
it("keeps raw writes/private helpers closed and rejects numeric revision/identifier inputs", async () => {
  await expect(
    db.query("update public.delivery_simulation_controls set paused=false"),
  ).rejects.toThrow();
  await expect(
    db.query("select public.delivery_simulation_candidate($1,$2,$3)", [
      alice,
      inquiry,
      reply,
    ]),
  ).rejects.toThrow();
  const state = await command<{ revision: string }>({ op: "state" });
  await expect(
    command({
      op: "control",
      paused: false,
      expected_revision: Number(state.revision),
    }),
  ).rejects.toThrow();
  await expect(command({ op: "claim" })).rejects.toThrow();
});
it("cancels source edits/deletions and refuses revision rollback beyond JavaScript integer precision", async () => {
  const e = await example("source-change");
  const claim = await command<{ lease_id: string }>({ op: "claim", id: e.id });
  await command({
    op: "source",
    thread_id: e.tid,
    inquiry_id: e.qid,
    message_id: "synthetic:q",
    source_revision: "9007199254740993",
    complete: true,
    deleted: true,
  });
  await expect(
    command({ op: "start", id: e.id, lease_id: claim.lease_id }),
  ).rejects.toThrow();
  await expect(
    command({
      op: "enqueue",
      id: randomUUID(),
      inquiry_id: e.qid,
      reply_id: e.rid,
    }),
  ).rejects.toThrow();
  await expect(
    command({
      op: "source",
      thread_id: e.tid,
      inquiry_id: e.qid,
      message_id: "synthetic:q",
      source_revision: "9007199254740992",
      complete: true,
      deleted: false,
    }),
  ).rejects.toThrow();
});
it("rechecks facts immediately before simulated submission and keeps copied approval separate", async () => {
  const e = await example("facts");
  const claim = await command<{ lease_id: string }>({ op: "claim", id: e.id });
  await db.query("update public.items set price=851 where id=$1", [item]);
  expect(
    await command({ op: "start", id: e.id, lease_id: claim.lease_id }),
  ).toMatchObject({ status: "canceled" });
  await db.query("update public.items set price=850 where id=$1", [item]);
  expect((await buyer({ op: "get", id: e.qid })).inquiry).toMatchObject({
    status: "Open",
  });
});
it("cancels takeover/native work and requires explicit native-disable confirmation", async () => {
  const e = await example("native");
  const claim = await command<{ lease_id: string }>({ op: "claim", id: e.id });
  await command({
    op: "threadControl",
    id: e.tid,
    paused: false,
    native: true,
    takeover: false,
    expected_revision: "1",
  });
  await expect(
    command({ op: "start", id: e.id, lease_id: claim.lease_id }),
  ).rejects.toThrow();
  await expect(
    command({
      op: "threadControl",
      id: e.tid,
      paused: false,
      native: false,
      takeover: false,
      expected_revision: "2",
    }),
  ).rejects.toThrow();
  await command({
    op: "threadControl",
    id: e.tid,
    paused: false,
    native: false,
    takeover: true,
    expected_revision: "2",
    confirm_native_disabled: true,
  });
  const id = randomUUID();
  await command({ op: "enqueue", id, inquiry_id: e.qid, reply_id: e.rid });
  expect(await command({ op: "claim", id })).toBeNull();
});
it("does not claim within the debounce and converts an expired submitted operation to unknown", async () => {
  const e = await example("debounce");
  await db.exec("reset role");
  await db.query(
    "update public.delivery_simulation_sources set observed_at=clock_timestamp() where inquiry_id=$1",
    [e.qid],
  );
  await asUser(db, alice);
  expect(await command({ op: "claim", id: e.id })).toBeNull();
  await db.exec("reset role");
  await db.query(
    "update public.delivery_simulation_sources set observed_at=clock_timestamp()-interval '30 seconds' where inquiry_id=$1",
    [e.qid],
  );
  await asUser(db, alice);
  const claim = await command<{ lease_id: string }>({ op: "claim", id: e.id });
  await command({ op: "start", id: e.id, lease_id: claim.lease_id });
  await db.exec("reset role");
  await db.query(
    "update public.delivery_simulation_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",
    [e.id],
  );
  await asUser(db, alice);
  expect(await command({ op: "claim", id: e.id })).toBeNull();
  const state = await command<{ jobs: { id: string; status: string }[] }>({
    op: "state",
  });
  expect(state.jobs.find((j) => j.id === e.id)?.status).toBe("unknown");
});
async function nextInThread(tid: string) {
  const qid = randomUUID(),
    rid = randomUUID(),
    id = randomUUID();
  const saved = await buyer({
    op: "saveInquiry",
    expected_revision: null,
    input: {
      id: qid,
      item_id: item,
      channel: "marketplace",
      surface: "dm",
      buyer_name: "",
      message: "How much?",
      received_at: new Date(Date.now() - 20000).toISOString(),
    },
  });
  await buyer({
    op: "draft",
    id: rid,
    inquiry_id: qid,
    body: "The asking price is ₱850.",
    source: "template",
    context: saved.context,
  });
  await buyer({
    op: "approve",
    id: rid,
    expected_revision: "1",
    context: saved.context,
  });
  await command({
    op: "source",
    thread_id: tid,
    inquiry_id: qid,
    message_id: "synthetic:" + qid,
    source_revision: "1",
    complete: true,
    deleted: false,
  });
  await db.exec("reset role");
  await db.query(
    "update public.delivery_simulation_sources set observed_at=clock_timestamp()-interval '20 seconds' where inquiry_id=$1",
    [qid],
  );
  await asUser(db, alice);
  await command({ op: "enqueue", id, inquiry_id: qid, reply_id: rid });
  return { id, qid, rid, tid };
}
async function finishConfirmed(id: string, leaseId: string) {
  const state = await command<{
    jobs: { id: string; candidate: { destination: unknown } }[];
  }>({ op: "state" });
  return command({
    op: "outcome",
    id,
    lease_id: leaseId,
    outcome: "confirmed",
    evidence: {
      simulation_id: id,
      destination: state.jobs.find((j) => j.id === id)!.candidate.destination,
      external_id: "synthetic:" + randomUUID(),
    },
  });
}
it("freezes all subsequent questions in an uncertain thread and retires an older question if newer input arrives", async () => {
  const old = await example("newer");
  const lease = await command<{ lease_id: string }>({
    op: "claim",
    id: old.id,
  });
  const next = await nextInThread(old.tid);
  expect(
    await command({ op: "start", id: old.id, lease_id: lease.lease_id }),
  ).toMatchObject({ status: "canceled" });
  const nextLease = await command<{ lease_id: string }>({
    op: "claim",
    id: next.id,
  });
  await command({ op: "start", id: next.id, lease_id: nextLease.lease_id });
  await command({
    op: "outcome",
    id: next.id,
    lease_id: nextLease.lease_id,
    outcome: "unknown",
  });
  const later = await nextInThread(old.tid);
  expect(await command({ op: "claim", id: later.id })).toBeNull();
});
it("limits template simulations to three per thread/hour and cannot repeat a confirmed source", async () => {
  let e: { id: string; qid: string; rid: string; tid: string } =
    await example("rate");
  for (let count = 0; count < 3; count++) {
    const lease = await command<{ lease_id: string }>({
      op: "claim",
      id: e.id,
    });
    expect(lease).not.toBeNull();
    await command({ op: "start", id: e.id, lease_id: lease.lease_id });
    await finishConfirmed(e.id, lease.lease_id);
    await expect(
      command({
        op: "enqueue",
        id: randomUUID(),
        inquiry_id: e.qid,
        reply_id: e.rid,
      }),
    ).rejects.toThrow();
    e = await nextInThread(e.tid);
  }
  expect(await command({ op: "claim", id: e.id })).toBeNull();
  const state = await command<{ jobs: { id: string; reason: string }[] }>({
    op: "state",
  });
  expect(state.jobs.find((j) => j.id === e.id)?.reason).toBe("template_limit");
});
it("requires a public comment destination and rejects custom public text even when approved for copying", async () => {
  const qid = randomUUID(),
    rid = randomUUID(),
    tid = randomUUID();
  const saved = await buyer({
    op: "saveInquiry",
    expected_revision: null,
    input: {
      id: qid,
      item_id: item,
      channel: "groups",
      surface: "group_comment",
      buyer_name: "",
      message: "Price?",
      received_at: new Date(Date.now() - 30000).toISOString(),
    },
  });
  await buyer({
    op: "draft",
    id: rid,
    inquiry_id: qid,
    body: "Meet me at a private address.",
    source: "manual",
    context: saved.context,
  });
  await buyer({
    op: "approve",
    id: rid,
    expected_revision: "1",
    context: saved.context,
  });
  await expect(
    command({
      op: "thread",
      id: tid,
      item_id: item,
      channel: "groups",
      surface: "group_comment",
      account_id: "synthetic:account",
      thread_id: "synthetic:public",
    }),
  ).rejects.toThrow();
  await command({
    op: "thread",
    id: tid,
    item_id: item,
    channel: "groups",
    surface: "group_comment",
    account_id: "synthetic:account",
    thread_id: "synthetic:public",
    post_id: "synthetic:post",
  });
  await expect(
    command({
      op: "source",
      thread_id: tid,
      inquiry_id: qid,
      message_id: "synthetic:q",
      source_revision: "1",
      complete: true,
      deleted: false,
    }),
  ).rejects.toThrow();
  await command({
    op: "source",
    thread_id: tid,
    inquiry_id: qid,
    message_id: "synthetic:q",
    source_revision: "1",
    complete: true,
    deleted: false,
    comment_id: "synthetic:comment",
  });
  const id = randomUUID();
  await command({ op: "enqueue", id, inquiry_id: qid, reply_id: rid });
  expect(await command({ op: "claim", id })).toBeNull();
  const state = await command<{ jobs: { id: string; reason: string }[] }>({
    op: "state",
  });
  expect(state.jobs.find((j) => j.id === id)?.reason).toBe(
    "public_text_not_allowed",
  );
});

it("runs the real persisted simulation through a fake lost acknowledgment and explicit reconciliation", async () => {
  const e = await example("executor");
  const adapter = new FakeDeliveryAdapter("lost_ack");
  expect(await runDeliverySimulation(command, e.id, adapter)).toBe("unknown");
  // New caller, same durable database: it cannot claim or resubmit this operation.
  expect(
    await runDeliverySimulation(
      (input) => command(input),
      e.id,
      new FakeDeliveryAdapter("confirmed"),
    ),
  ).toBe("idle");
  const evidence = adapter.confirmationFor(e.id);
  expect(evidence).not.toBeNull();
  expect(await command({ op: "reconcile", id: e.id, evidence })).toMatchObject({
    status: "confirmed",
    simulation: true,
  });
  expect((await buyer({ op: "get", id: e.qid })).inquiry).toMatchObject({
    status: "Open",
  });
});
it("simulates only the exact public price template with its original comment destination", async () => {
  const qid = randomUUID(),
    rid = randomUUID(),
    tid = randomUUID(),
    id = randomUUID();
  const saved = await buyer({
    op: "saveInquiry",
    expected_revision: null,
    input: {
      id: qid,
      item_id: item,
      channel: "groups",
      surface: "group_comment",
      buyer_name: "",
      message: "Price?",
      received_at: new Date(Date.now() - 30000).toISOString(),
    },
  });
  await buyer({
    op: "draft",
    id: rid,
    inquiry_id: qid,
    body: "The asking price is PHP 850.00.",
    source: "template",
    context: saved.context,
  });
  await buyer({
    op: "approve",
    id: rid,
    expected_revision: "1",
    context: saved.context,
  });
  await command({
    op: "thread",
    id: tid,
    item_id: item,
    channel: "groups",
    surface: "group_comment",
    account_id: "synthetic:account",
    thread_id: "synthetic:public-price",
    post_id: "synthetic:post",
  });
  await command({
    op: "source",
    thread_id: tid,
    inquiry_id: qid,
    message_id: "synthetic:q",
    source_revision: "1",
    complete: true,
    deleted: false,
    comment_id: "synthetic:comment",
  });
  await db.exec("reset role");
  await db.query(
    "update public.delivery_simulation_sources set observed_at=clock_timestamp()-interval '30 seconds' where inquiry_id=$1",
    [qid],
  );
  await asUser(db, alice);
  await command({ op: "enqueue", id, inquiry_id: qid, reply_id: rid });
  const adapter = new FakeDeliveryAdapter("confirmed");
  expect(await runDeliverySimulation(command, id, adapter)).toBe("confirmed");
  expect(adapter.confirmationFor(id)?.destination).toMatchObject({
    surface: "group_comment",
    post_id: "synthetic:post",
    comment_id: "synthetic:comment",
  });
});
it("rejects old backlog and incomplete capture; a pause cannot recall an already submitted simulation", async () => {
  const old = await example(
    "stale",
    new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  );
  expect(await command({ op: "claim", id: old.id })).toBeNull();
  const retired = await command<{ jobs: { id: string; reason: string }[] }>({
    op: "state",
  });
  expect(retired.jobs.find((j) => j.id === old.id)?.reason).toBe(
    "stale_source",
  );
  const incomplete = await example("incomplete");
  await command({
    op: "source",
    thread_id: incomplete.tid,
    inquiry_id: incomplete.qid,
    message_id: "synthetic:q",
    source_revision: "2",
    complete: false,
    deleted: false,
  });
  await expect(
    command({
      op: "enqueue",
      id: randomUUID(),
      inquiry_id: incomplete.qid,
      reply_id: incomplete.rid,
    }),
  ).rejects.toThrow();
  const submitted = await example("inflight");
  const lease = await command<{ lease_id: string }>({
    op: "claim",
    id: submitted.id,
  });
  await command({ op: "start", id: submitted.id, lease_id: lease.lease_id });
  const state = await command<{ revision: string }>({ op: "state" });
  await command({
    op: "control",
    paused: true,
    expected_revision: state.revision,
  });
  const paused = await command<{ jobs: { id: string; status: string }[] }>({
    op: "state",
  });
  expect(paused.jobs.find((j) => j.id === submitted.id)?.status).toBe(
    "submitted",
  );
  expect(await finishConfirmed(submitted.id, lease.lease_id)).toMatchObject({
    status: "confirmed",
  });
  await resume();
});
