import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { database, asUser, alice, bob } from "./helpers/database";
import type { PGlite } from "@electric-sql/pglite";
let db: PGlite;
const item = "33333333-3333-4333-8333-333333333333";
const photo = "44444444-4444-4444-8444-444444444444";
const path = `${alice}/${item}/${photo}.jpg`;
beforeAll(async () => {
  db = await database();
  // The synthetic Storage fixture mirrors only the fields read by this feature.
  await db.exec(
    "alter table storage.objects add column if not exists created_at timestamptz default now()",
  );
  await asUser(db, alice);
  await db.query(
    "insert into public.items(id,title,price,category,condition) values ($1,'Privacy test',10,'Other','Good')",
    [item],
  );
  await db.query(
    "insert into public.item_photos(id,item_id,path,position) values ($1,$2,$3,0)",
    [photo, item, path],
  );
  await db.query(
    "insert into storage.objects(bucket_id,name,created_at) values ('item-photos',$1,now()-interval '3 days'),('item-photos',$2,now()-interval '2 days'),('item-photos',$3,now())",
    [
      path,
      `${alice}/${item}/old-unlinked.jpg`,
      `${alice}/${item}/upload-in-progress.jpg`,
    ],
  );
  await db.exec("reset role");
  await db.query(
    "insert into public.buyer_inquiries(item_id,channel,message,status,updated_at) values ($1,'marketplace','Old answered','Answered',now()-interval '40 days'),($1,'marketplace','Old open','Open',now()-interval '40 days'),($1,'marketplace','Recent closed','Closed',now())",
    [item],
  );
}, 30000);
afterAll(async () => {
  if (db) await db.close();
});
async function preview(days = 30) {
  return (
    await db.query<{ result: Record<string, number | string> }>(
      "select public.workspace_privacy_preview($1) result",
      [days],
    )
  ).rows[0].result;
}
it("previews only older completed history and old unlinked photos without changing any records", async () => {
  await asUser(db, alice);
  const before = await db.query(
    "select name from storage.objects order by name",
  );
  const result = await preview();
  expect(result).toMatchObject({
    items: 1,
    photo_references: 1,
    photo_objects: 3,
    questions: 3,
    history_candidates: 1,
    unlinked_photo_candidates: 1,
    window_days: 30,
  });
  expect((await preview(90)).history_candidates).toBe(0);
  expect(
    await db.query("select name from storage.objects order by name"),
  ).toEqual(before);
  expect(
    (await db.query("select count(*)::int n from public.buyer_inquiries"))
      .rows[0],
  ).toEqual({ n: 3 });
});
it("cannot reveal the other owner's inventory, inbox or private photo counts", async () => {
  await asUser(db, bob);
  expect(await preview()).toMatchObject({
    items: 0,
    photo_references: 0,
    photo_objects: 0,
    questions: 0,
    replies: 0,
    history_candidates: 0,
    unlinked_photo_candidates: 0,
  });
  await asUser(db, alice);
  await expect(preview(1)).rejects.toThrow(/window/i);
  await asUser(db, null);
  await expect(preview()).rejects.toThrow(/permission denied/i);
});
it("a fresh reply excludes an older closed conversation from the history preview", async () => {
  await asUser(db, alice);
  await db.exec("reset role");
  await db.query(
    "insert into public.suggested_replies(inquiry_id,body) select id,'Recent follow-up' from public.buyer_inquiries where message='Old answered'",
  );
  await asUser(db, alice);
  expect((await preview()).history_candidates).toBe(0);
});

it("runs the hosted rollback script without retaining its fixtures", async () => {
  await db.exec("reset role");
  const before = (await db.query("select count(*)::int n from auth.users"))
    .rows;
  await db.exec(
    readFileSync("scripts/acceptance/hosted-privacy-preview.sql", "utf8"),
  );
  expect(
    (await db.query("select count(*)::int n from auth.users")).rows,
  ).toEqual(before);
});
