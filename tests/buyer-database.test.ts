import { inquirySchema, threadSchema } from "../src/lib/buyer/domain";
import type { Thread } from "../src/lib/buyer/domain";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
const db = new PGlite();
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222";
const item = "33333333-3333-4333-8333-333333333333",
  inquiry = "44444444-4444-4444-8444-444444444444",
  reply = "55555555-5555-4555-8555-555555555555";
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
// RPC results are validated separately by the client schema; tests inspect SQL behavior.
async function rpc<T = Thread>(command: object) {
  return (
    await db.query<{ result: T }>(
      "select public.buyer_workspace($1::jsonb) as result",
      [JSON.stringify(command)],
    )
  ).rows[0].result;
}
const input = {
  id: inquiry,
  item_id: item,
  channel: "marketplace",
  surface: "dm",
  buyer_name: "Sample buyer",
  message: "How much?",
  received_at: "2026-10-30T00:00:00Z",
};
beforeAll(async () => {
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values ('${alice}'),('${bob}');create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant all on storage.objects to authenticated,anon;create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;`,
  );
  for (const name of readdirSync("supabase/migrations").sort()) {
    if (name === "202610300001_buyer_inbox.sql")
      await db.exec(
        `insert into public.items(id,owner_id,title,price,condition,category) values ('99999999-9999-4999-8999-999999999991','${alice}','Legacy lamp',500,'Good','Other');insert into public.buyer_inquiries(id,owner_id,item_id,channel,message) values ('99999999-9999-4999-8999-999999999992','${alice}','99999999-9999-4999-8999-999999999991','carousell','Legacy question');insert into public.suggested_replies(owner_id,inquiry_id,body,status) values ('${alice}','99999999-9999-4999-8999-999999999992','Legacy reply text','Approved');`,
      );
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
  }
  await asUser(alice);
  await db.query(
    "insert into public.items(id,title,price,category,condition) values ($1,'Lamp',850,'Other','Good')",
    [item],
  );
}, 30000);
afterAll(() => db.close());
it("creates and reloads manual inquiries idempotently without exposing other owners", async () => {
  await asUser(alice);
  const a = await rpc({ op: "saveInquiry", input, expected_revision: null });
  expect(a.inquiry.revision).toBe("1");
  expect(
    (await rpc({ op: "saveInquiry", input, expected_revision: null })).inquiry
      .id,
  ).toBe(inquiry);
  await asUser(bob);
  expect(await rpc({ op: "list" })).toEqual([]);
  await expect(rpc({ op: "get", id: inquiry })).rejects.toThrow();
  await expect(
    rpc({ op: "saveInquiry", input, expected_revision: null }),
  ).rejects.toThrow();
  await asUser(alice);
  await expect(
    rpc({
      op: "saveInquiry",
      input: { ...input, message: "Conflicting retry" },
      expected_revision: null,
    }),
  ).rejects.toThrow();
});
it("rejects anonymous access, direct forged approvals and forged source claims", async () => {
  await asUser(alice);
  await expect(
    db.query(
      "insert into public.suggested_replies(inquiry_id,body,status) values ($1,'Forged','Approved')",
      [inquiry],
    ),
  ).rejects.toThrow();
  await expect(
    rpc({
      op: "draft",
      id: reply,
      inquiry_id: inquiry,
      body: "Hi",
      source: "ai",
      context: {},
    }),
  ).rejects.toThrow();
  await db.exec(
    "reset role;select set_config('request.jwt.claim.sub','',false);set role anon",
  );
  await expect(rpc({ op: "list" })).rejects.toThrow();
});
it("binds approved drafts to reviewed facts and copying never marks answered", async () => {
  await asUser(alice);
  const t = await rpc({ op: "get", id: inquiry });
  const d = await rpc({
    op: "draft",
    id: reply,
    inquiry_id: inquiry,
    body: "The asking price is ₱850.",
    source: "manual",
    context: t.context,
  });
  expect(d.replies[0].status).toBe("Draft");
  const a = await rpc({
    op: "approve",
    id: reply,
    expected_revision: d.replies[0].revision,
    context: t.context,
  });
  expect(a.replies[0].status).toBe("Approved");
  const copied = await rpc<{ body: string }>({
    op: "copy",
    id: reply,
    expected_revision: a.replies[0].revision,
  });
  expect(copied.body).toContain("850");
  expect((await rpc({ op: "get", id: inquiry })).inquiry.status).toBe("Open");
  await db.query(
    "update public.items set price=900,reply_context_revision=999 where id=$1",
    [item],
  );
  const changed = await rpc({ op: "get", id: inquiry });
  expect(changed.context.item_revision).toBe("2");
  expect(changed.replies[0].status).toBe("Draft");
  await expect(
    rpc({ op: "copy", id: reply, expected_revision: a.replies[0].revision }),
  ).rejects.toThrow();
  await expect(
    rpc({
      op: "approve",
      id: reply,
      expected_revision: changed.replies[0].revision,
      context: changed.context,
    }),
  ).rejects.toThrow();
  await expect(
    rpc({
      op: "draft",
      id: crypto.randomUUID(),
      inquiry_id: inquiry,
      body: "Old price",
      source: "manual",
      context: t.context,
    }),
  ).rejects.toThrow();
});
it("rejects stale edits and invalidates approval on inquiry edits", async () => {
  await asUser(alice);
  let t = await rpc({ op: "get", id: inquiry });
  const id = crypto.randomUUID();
  t = await rpc({
    op: "draft",
    id,
    inquiry_id: inquiry,
    body: "Let me check.",
    source: "manual",
    context: t.context,
  });
  const r = t.replies.find((r: { id: string }) => r.id === id)!;
  t = await rpc({
    op: "approve",
    id,
    expected_revision: r.revision,
    context: t.context,
  });
  await expect(
    rpc({ op: "edit", id, body: "Stale", expected_revision: r.revision }),
  ).rejects.toThrow();
  t = await rpc({
    op: "saveInquiry",
    input: { ...input, message: "Can you deliver?" },
    expected_revision: t.inquiry.revision,
  });
  expect(
    t.replies.every((r: { status: string }) => r.status !== "Approved"),
  ).toBe(true);
  await expect(
    rpc({
      op: "status",
      id: inquiry,
      status: "Answered",
      expected_revision: "1",
    }),
  ).rejects.toThrow();
  t = await rpc({
    op: "status",
    id: inquiry,
    status: "Answered",
    expected_revision: t.inquiry.revision,
  });
  expect(t.inquiry.status).toBe("Answered");
});
it("validates public/private scope, blank text and payload size", async () => {
  await asUser(alice);
  for (const patch of [
    { message: "   " },
    { channel: "other" },
    { surface: "group_comment" },
    { received_at: "infinity" },
    { buyer_name: "x".repeat(201) },
  ])
    await expect(
      rpc({
        op: "saveInquiry",
        input: { ...input, id: crypto.randomUUID(), ...patch },
        expected_revision: null,
      }),
    ).rejects.toThrow();
  await expect(rpc({ op: "list", junk: "😀".repeat(5000) })).rejects.toThrow();
});

it("rejects non-string content and relative timestamps at the database boundary", async () => {
  await asUser(alice);
  for (const patch of [
    { message: 123 },
    { message: { text: "Hi" } },
    { received_at: "yesterday" },
  ])
    await expect(
      rpc({
        op: "saveInquiry",
        input: { ...input, id: crypto.randomUUID(), ...patch },
        expected_revision: null,
      }),
    ).rejects.toThrow();
});
it("only one simultaneous approval with the same revision wins", async () => {
  await asUser(alice);
  let t = await rpc({ op: "get", id: inquiry });
  t = await rpc({
    op: "status",
    id: inquiry,
    status: "Open",
    expected_revision: t.inquiry.revision,
  });
  const id = crypto.randomUUID();
  t = await rpc({
    op: "draft",
    id,
    inquiry_id: inquiry,
    body: "Please check the saved listing.",
    source: "manual",
    context: t.context,
  });
  const r = t.replies.find((r) => r.id === id)!;
  const outcomes = await Promise.allSettled(
    [1, 2].map(() =>
      rpc({
        op: "approve",
        id,
        expected_revision: r.revision,
        context: t.context,
      }),
    ),
  );
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(1);
});
it("does not invalidate reviewed replies for unrelated item timestamp changes", async () => {
  await asUser(alice);
  const before = await rpc({ op: "get", id: inquiry });
  await db.query(
    "update public.items set updated_at=now(),reply_context_revision=9999 where id=$1",
    [item],
  );
  const after = await rpc({ op: "get", id: inquiry });
  expect(after.context.item_revision).toBe(before.context.item_revision);
  expect(after.replies).toEqual(before.replies);
});

it("loads legacy nullable buyer names and preserves legacy reply text without trusting approval", async () => {
  await asUser(alice);
  const entries = await rpc<unknown[]>({ op: "list" });
  expect(() => entries.map((e) => inquirySchema.parse(e))).not.toThrow();
  const t = threadSchema.parse(
    await rpc({ op: "get", id: "99999999-9999-4999-8999-999999999992" }),
  );
  expect(t.replies[0].body).toBe("Legacy reply text");
  expect(t.replies[0].status).toBe("Draft");
});
it("round-trips exact saved whitespace through the client context schema", async () => {
  await asUser(alice);
  await db.query(
    "update public.items set description='Scratch. ' || chr(10) where id=$1",
    [item],
  );
  const t = threadSchema.parse(await rpc({ op: "get", id: inquiry }));
  await expect(
    rpc({
      op: "draft",
      id: crypto.randomUUID(),
      inquiry_id: inquiry,
      body: "Let me check.",
      source: "manual",
      context: t.context,
    }),
  ).resolves.toHaveProperty("replies");
});
