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
  for (const name of readdirSync("supabase/migrations")
    .sort()
    .filter((n) => !n.includes("delivery_simulation"))) {
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

async function prefs(command: object) {
  return (
    await db.query<{
      result: {
        preferences: import("../src/lib/seller/preferences").Preferences;
        summary: {
          open: number;
          ready: number;
          needs_review: number;
          received: number;
          total: number;
        };
      };
    }>("select public.seller_workspace($1::jsonb) result", [
      JSON.stringify(command),
    ])
  ).rows[0].result;
}
const values = {
  pickup_area: "Quezon City",
  delivery_notes: "Confirm courier quote",
  payment_notes: "Cash on pickup",
  digest_enabled: false,
  digest_time: "09:00",
};
it("isolates preferences and validates owner writes, time, size and stale revisions", async () => {
  await asUser(alice);
  expect((await prefs({ op: "get" })).preferences.terms_revision).toBe("0");
  await expect(
    db.exec("update public.seller_preferences set pickup_area='Forged'"),
  ).rejects.toThrow();
  for (const patch of [
    { digest_time: "24:00" },
    { pickup_area: 123 },
    { pickup_area: "x".repeat(161) },
    { digest_enabled: "true" },
  ])
    await expect(
      prefs({
        op: "save",
        expected_revision: "0",
        input: { ...values, ...patch },
      }),
    ).rejects.toThrow();
  const saved = await prefs({
    op: "save",
    expected_revision: "0",
    input: values,
  });
  expect(saved.preferences).toMatchObject({
    revision: "1",
    terms_revision: "1",
    pickup_area: "Quezon City",
  });
  await expect(
    prefs({ op: "save", expected_revision: "0", input: values }),
  ).rejects.toThrow();
  await asUser(bob);
  expect((await prefs({ op: "get" })).preferences.pickup_area).toBe("");
  expect(
    (await db.query("select * from public.seller_preferences")).rows,
  ).toHaveLength(0);
  await db.exec(
    "reset role;select set_config('request.jwt.claim.sub','',false);set role anon",
  );
  await expect(prefs({ op: "get" })).rejects.toThrow();
});
it("binds both draft contexts to terms, preserves approval for reminders and invalidates it for terms", async () => {
  await asUser(alice);
  let t = await rpc({ op: "saveInquiry", input, expected_revision: null });
  expect(t.context.seller_terms?.pickup_area).toBe("Quezon City");
  await db.exec("reset role");
  const worker = (
    await db.query<{ ctx: unknown }>(
      "select public.draft_owned_context($1,$2) ctx",
      [alice, inquiry],
    )
  ).rows[0].ctx;
  expect(worker).toEqual(t.context);
  await asUser(alice);
  t = await rpc({
    op: "draft",
    id: reply,
    inquiry_id: inquiry,
    body: "Saved response",
    source: "manual",
    context: t.context,
  });
  t = await rpc({
    op: "approve",
    id: reply,
    expected_revision: t.replies[0].revision,
    context: t.context,
  });
  const before = t;
  let p = await prefs({
    op: "save",
    expected_revision: "1",
    input: { ...values, digest_enabled: true },
  });
  expect(p.preferences.terms_revision).toBe("1");
  expect(p.summary.ready).toBe(1);
  expect((await rpc({ op: "get", id: inquiry })).replies).toEqual(
    before.replies,
  );
  p = await prefs({ op: "review", expected_revision: "2" });
  expect(p.preferences.last_reviewed_at).toBeTruthy();
  expect((await rpc({ op: "get", id: inquiry })).replies).toEqual(
    before.replies,
  );
  p = await prefs({
    op: "save",
    expected_revision: "3",
    input: { ...values, pickup_area: "Pasig", digest_enabled: true },
  });
  expect(p.summary.ready).toBe(0);
  expect(p.summary.needs_review).toBeGreaterThan(0);
  t = await rpc({ op: "get", id: inquiry });
  expect(t.replies[0]).toMatchObject({
    body: "Saved response",
    status: "Draft",
    context: before.context,
  });
  expect(t.context.seller_terms?.revision).toBe("2");
  await expect(
    rpc({
      op: "copy",
      id: reply,
      expected_revision: before.replies[0].revision,
    }),
  ).rejects.toThrow();
  await expect(
    rpc({
      op: "approve",
      id: reply,
      expected_revision: t.replies[0].revision,
      context: t.context,
    }),
  ).rejects.toThrow();
});
