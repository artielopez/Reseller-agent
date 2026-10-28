import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
const db = new PGlite();
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";
const payload = {
  id: itemId,
  title: "Lamp",
  description: "Scratch on base.",
  price: 500,
  category: "Home & living",
  condition: "Good",
  status: "Draft",
  photos: [],
  listings: ["carousell", "marketplace", "groups"].map((channel) => ({
    channel,
    title: "Lamp",
    description: "Scratch on base.",
    url: "",
    status: "Not posted",
  })),
};
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${alice}'), ('${bob}');
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon;
    grant all on storage.objects to authenticated, anon;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1)-1] $$;
  `);
  await db.exec(
    readFileSync("supabase/migrations/202610280001_initial.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
it("atomically saves an item with three channels and isolates another owner", async () => {
  await asUser(alice);
  await db.query("select public.save_inventory_item($1::jsonb)", [
    JSON.stringify(payload),
  ]);
  expect((await db.query("select * from public.items")).rows).toHaveLength(1);
  expect((await db.query("select * from public.listings")).rows).toHaveLength(
    3,
  );
  await asUser(bob);
  expect((await db.query("select * from public.items")).rows).toHaveLength(0);
  expect((await db.query("select * from public.listings")).rows).toHaveLength(
    0,
  );
  await expect(
    db.query("select public.save_inventory_item($1::jsonb)", [
      JSON.stringify({ ...payload, title: "Stolen" }),
    ]),
  ).rejects.toThrow();
  await asUser(alice);
  expect(
    (await db.query<{ title: string }>("select title from public.items"))
      .rows[0].title,
  ).toBe("Lamp");
});
it("rolls back all item changes if a channel is invalid", async () => {
  await asUser(alice);
  const bad = {
    ...payload,
    title: "Must roll back",
    listings: payload.listings.map((listing) => ({
      ...listing,
      status: "Published",
      url: "",
    })),
  };
  await expect(
    db.query("select public.save_inventory_item($1::jsonb)", [
      JSON.stringify(bad),
    ]),
  ).rejects.toThrow();
  expect(
    (await db.query<{ title: string }>("select title from public.items"))
      .rows[0].title,
  ).toBe("Lamp");
});
it("rejects cross-owner photo paths and malformed prices", async () => {
  await asUser(alice);
  const photoId = "44444444-4444-4444-8444-444444444444";
  await expect(
    db.query("select public.save_inventory_item($1::jsonb)", [
      JSON.stringify({
        ...payload,
        photos: [{ id: photoId, path: `${bob}/${itemId}/${photoId}.jpg` }],
      }),
    ]),
  ).rejects.toThrow();
  await expect(
    db.query("select public.save_inventory_item($1::jsonb)", [
      JSON.stringify({ ...payload, price: -1 }),
    ]),
  ).rejects.toThrow();
  await expect(
    db.query("select public.save_inventory_item($1::jsonb)", [
      JSON.stringify({ ...payload, price: 1.123 }),
    ]),
  ).rejects.toThrow();
});
it("enforces private storage folders for reads and writes", async () => {
  await asUser(alice);
  await db.query(
    "insert into storage.objects(bucket_id, name) values ($1, $2)",
    ["item-photos", `${alice}/${itemId}/photo.jpg`],
  );
  await expect(
    db.query("insert into storage.objects(bucket_id, name) values ($1, $2)", [
      "item-photos",
      `${bob}/${itemId}/photo.jpg`,
    ]),
  ).rejects.toThrow();
  await asUser(bob);
  expect((await db.query("select * from storage.objects")).rows).toHaveLength(
    0,
  );
});
it("limits AI requests durably and prevents users resetting their usage", async () => {
  await asUser(alice);
  for (let index = 0; index < 20; index++)
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select public.reserve_ai_generation() as allowed",
        )
      ).rows[0].allowed,
    ).toBe(true);
  expect(
    (
      await db.query<{ allowed: boolean }>(
        "select public.reserve_ai_generation() as allowed",
      )
    ).rows[0].allowed,
  ).toBe(false);
  await expect(db.exec("delete from public.ai_usage")).rejects.toThrow();
  await asUser(bob);
  expect(
    (
      await db.query<{ allowed: boolean }>(
        "select public.reserve_ai_generation() as allowed",
      )
    ).rows[0].allowed,
  ).toBe(true);
});
it("rejects anonymous writes and quota calls", async () => {
  await db.exec(
    "reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;",
  );
  await expect(
    db.query("select public.save_inventory_item($1::jsonb)", [
      JSON.stringify(payload),
    ]),
  ).rejects.toThrow();
  await expect(
    db.exec("select public.reserve_ai_generation()"),
  ).rejects.toThrow();
});
