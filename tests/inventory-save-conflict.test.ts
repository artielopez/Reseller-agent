import { afterAll, beforeAll, expect, it } from "vitest";
import { database, asUser, alice, bob } from "./helpers/database";
import { emptyItem } from "../src/lib/domain";
let db: Awaited<ReturnType<typeof database>>;
beforeAll(async () => {
  db = await database();
  await asUser(db, alice);
}, 15000);
afterAll(async () => {
  await db?.close();
});
const payload = () => ({
  ...emptyItem(),
  title: "Synthetic conflict lamp",
  photos: [],
});
it("does not let an unversioned legacy editor overwrite an existing item", async () => {
  const original = payload();
  await db.query("select public.save_inventory_item($1::jsonb)", [
    JSON.stringify(original),
  ]);
  await expect(
    db.query("select public.save_inventory_item($1::jsonb)", [
      JSON.stringify({ ...original, price: 1 }),
    ]),
  ).rejects.toMatchObject({ code: "PT409" });
});
async function save(input: unknown) {
  return (
    await db.query<{ result: { saveRevision: string; updatedAt: string } }>(
      "select public.save_inventory_item_checked($1::jsonb) result",
      [JSON.stringify(input)],
    )
  ).rows[0].result;
}
it("rejects a stale price save without overwriting any newer item, listing or photo data", async () => {
  const original = payload();
  const initial = await save(original);
  const first = { ...original, ...initial, price: 900 };
  const updated = await save(first);
  expect(updated.saveRevision).not.toBe(initial.saveRevision);
  await expect(
    save({ ...original, ...initial, title: "STALE", price: 100 }),
  ).rejects.toMatchObject({ code: "PT409" });
  const row = (
    await db.query<{ title: string; price: string }>(
      "select title,price from public.items where id=$1",
      [original.id],
    )
  ).rows[0];
  expect(row).toMatchObject({ title: original.title, price: "900" });
  // Old clients cannot silently bypass the same guard through the legacy RPC.
  await expect(
    db.query("select public.save_inventory_item($1::jsonb)", [
      JSON.stringify(original),
    ]),
  ).rejects.toMatchObject({ code: "PT409" });
});
it("advances the save token for listing-only and photo-only edits, with exact returned server state", async () => {
  const original = payload();
  const initial = await save(original);
  const listingOnly = {
    ...original,
    ...initial,
    listings: original.listings.map((l) => ({
      ...l,
      description: "Revised copy",
    })),
  };
  const listed = await save(listingOnly);
  const photoId = crypto.randomUUID();
  const photo = { id: photoId, path: `${alice}/${original.id}/${photoId}.jpg` };
  const photographed = await save({
    ...listingOnly,
    ...listed,
    photos: [photo],
  });
  expect(
    new Set([
      initial.saveRevision,
      listed.saveRevision,
      photographed.saveRevision,
    ]).size,
  ).toBe(3);
  await expect(
    save({ ...listingOnly, ...listed, photos: [] }),
  ).rejects.toMatchObject({ code: "PT409" });
  expect(
    (
      await db.query("select * from public.item_photos where item_id=$1", [
        original.id,
      ])
    ).rows,
  ).toHaveLength(1);
});
it("does not recreate a missing versioned item or disclose/mutate another owner's item", async () => {
  await expect(
    save({ ...payload(), saveRevision: crypto.randomUUID() }),
  ).rejects.toMatchObject({ code: "PT409" });
  const original = payload();
  const version = await save(original);
  await asUser(db, bob);
  await expect(
    save({ ...original, ...version, title: "not owned" }),
  ).rejects.toMatchObject({ code: "PT409" });
  expect(
    (await db.query("select * from public.items where id=$1", [original.id]))
      .rows,
  ).toHaveLength(0);
  await asUser(db, alice);
  expect(
    (
      await db.query("select title from public.items where id=$1", [
        original.id,
      ])
    ).rows[0],
  ).toEqual({ title: original.title });
});
