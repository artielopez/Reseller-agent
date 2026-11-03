import { z } from "zod";
import { openDemoDb } from "./demo-db";
import { demoMode } from "./config";
import { demoItems } from "./demo";
import {
  itemInputSchema,
  validateItem,
  type Item,
  type Listing,
  type Photo,
} from "./domain";
import { getSupabase } from "./supabase";
import { withRequestDeadline } from "./request-deadline";

const BUCKET = "item-photos";
const staleSave = () =>
  new Error(
    "This item changed elsewhere. Copy any unsaved edits, then reload inventory and reopen the item.",
  );
const saveReceipt = z.object({
  saveRevision: z.uuid(),
  updatedAt: z.string(),
  replyContextRevision: z.string().regex(/^[1-9][0-9]*$/),
});
// Read, seed/upgrade and write in one transaction: tabs cannot save over an
// inventory snapshot read before another tab committed its changes.
async function demoInventory<T>(
  work: (items: Item[]) => { items: Item[]; result: T },
): Promise<T> {
  const db = await openDemoDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("inventory", "readwrite");
      const store = transaction.objectStore("inventory");
      const request = store.get("items");
      let result: T;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const items: Item[] = (request.result ?? demoItems()).map(
            (item: Item) => ({
              ...item,
              saveRevision: item.saveRevision || crypto.randomUUID(),
            }),
          );
          const next = work(items);
          result = next.result;
          store.put(next.items, "items");
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () =>
        reject(
          failure ||
            new Error(
              "Could not save to browser storage. Your device may be out of space.",
            ),
        );
      transaction.onabort = () =>
        reject(failure || new Error("Save was interrupted. Please try again."));
    });
  } finally {
    db.close();
  }
}
type ItemRow = {
  id: string;
  title: string;
  description: string;
  price: number;
  category: Item["category"];
  condition: Item["condition"];
  status: Item["status"];
  updated_at: string;
  save_revision: string;
  item_photos: { id: string; path: string; position: number }[];
  listings: Listing[];
};
export async function listItems(): Promise<Item[]> {
  if (demoMode) {
    return demoInventory((items) => ({ items, result: items }));
  }
  return withRequestDeadline(
    readCloudItems,
    "Could not finish loading inventory and private photos. Check your connection, then reload inventory.",
  );
}
async function readCloudItems(signal: AbortSignal): Promise<Item[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("items")
    .select("*, item_photos(*), listings(*)")
    .order("updated_at", { ascending: false })
    .abortSignal(signal);
  signal.throwIfAborted();
  if (error)
    throw new Error(
      "Could not load inventory. Check your connection and Supabase migration setup.",
    );
  return Promise.all(
    (data as ItemRow[]).map(async (row) => {
      const sorted = row.item_photos.sort((a, b) => a.position - b.position);
      const { data: signed, error: imageError } = sorted.length
        ? await supabase.storage.from(BUCKET).createSignedUrls(
            sorted.map((photo) => photo.path),
            86400,
          )
        : { data: [], error: null };
      if (imageError)
        throw new Error(
          "Could not load private photos. Refresh or check storage policies.",
        );
      const photos = sorted.map((photo, index) => ({
        id: photo.id,
        path: photo.path,
        url: signed?.[index]?.signedUrl || "",
      }));
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        price: Number(row.price),
        category: row.category,
        condition: row.condition,
        status: row.status,
        updatedAt: row.updated_at,
        saveRevision: row.save_revision,
        photos,
        listings: row.listings,
      };
    }),
  );
}
export async function saveItem(
  item: Item,
  previous?: Item,
  parent?: AbortSignal,
): Promise<Item> {
  validateItem(item);
  const saved = { ...item, updatedAt: new Date().toISOString() };
  if (demoMode) {
    return demoInventory((items) => {
      const stored = items.find((i) => i.id === item.id);
      if ((stored?.saveRevision ?? null) !== (item.saveRevision ?? null))
        throw staleSave();
      saved.saveRevision = crypto.randomUUID();
      saved.replyContextRevision = stored
        ? (
            BigInt(stored.replyContextRevision || "1") +
            (JSON.stringify(itemInputSchema.parse(stored)) ===
            JSON.stringify(itemInputSchema.parse(saved))
              ? BigInt(0)
              : BigInt(1))
          ).toString()
        : "1";
      return {
        items: [saved, ...items.filter((entry) => entry.id !== item.id)],
        result: saved,
      };
    });
  }
  const supabase = getSupabase();
  const uploaded: string[] = [];
  const photos: Photo[] = [];
  let saveAttempted = false;
  let definitivelyRejected = false;
  try {
    // Ten compressed photos may take longer on mobile than a metadata request.
    // Stop starting new work after two minutes, even if Auth/Storage ignores abort.
    await withRequestDeadline(
      async (signal) => {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        signal.throwIfAborted();
        if (authError || !user)
          throw new Error("Your session expired. Sign in again to save.");
        for (const photo of item.photos) {
          signal.throwIfAborted();
          if (photo.path) {
            photos.push(photo);
            continue;
          }
          if (!photo.url.startsWith("data:image/jpeg;base64,"))
            throw new Error("Please upload a JPEG, PNG or WebP photo.");
          const blob = await (await fetch(photo.url, { signal })).blob();
          signal.throwIfAborted();
          const id = crypto.randomUUID();
          const path = `${user.id}/${item.id}/${id}.jpg`;
          const { error } = await supabase.storage
            .from(BUCKET)
            .upload(path, blob, { contentType: "image/jpeg", upsert: false });
          signal.throwIfAborted();
          if (error)
            throw new Error(
              "Photo upload failed. Check your connection and try again.",
            );
          uploaded.push(path);
          photos.push({ ...photo, id, path });
        }
        signal.throwIfAborted();
        saveAttempted = true;
        const { data, error } = await supabase
          .rpc("save_inventory_item_checked", {
            payload: {
              ...saved,
              saveRevision: item.saveRevision ?? null,
              photos: photos.map(({ id, path }) => ({ id, path })),
            },
          })
          .abortSignal(signal);
        signal.throwIfAborted();
        if (error) {
          definitivelyRejected = [
            "PT409",
            "22023",
            "23514",
            "23505",
            "42501",
          ].includes(error.code);
          if (error.code === "PT409") throw staleSave();
          throw new Error(
            "Could not confirm the save. Check your connection and database setup, then reload inventory before retrying.",
          );
        }
        Object.assign(saved, saveReceipt.parse(data));
      },
      "Could not confirm the save. Keep your edits, then reload inventory before retrying; the save may have completed.",
      parent,
      120_000,
    );
  } catch (error) {
    if (
      !parent?.aborted &&
      uploaded.length &&
      (!saveAttempted || definitivelyRejected)
    ) {
      // Only a definitively rejected transaction (or no RPC attempt) permits cleanup.
      // Missing metadata after a network failure cannot rule out a later commit.
      try {
        await withRequestDeadline(
          async (signal) => {
            const { data: referenced, error: lookupError } = await supabase
              .from("item_photos")
              .select("path")
              .in("path", uploaded)
              .abortSignal(signal);
            signal.throwIfAborted();
            if (!lookupError) {
              const retained = new Set(
                (referenced || []).map((photo) => photo.path),
              );
              const unused = uploaded.filter((path) => !retained.has(path));
              if (unused.length)
                await supabase.storage.from(BUCKET).remove(unused);
            }
          },
          "Photo cleanup did not finish.",
          undefined,
          5_000,
        );
      } catch {
        /* Offline: prefer orphaned files over breaking saved photos. */
      }
    }
    throw error;
  }
  const removed =
    previous?.photos.flatMap((photo) =>
      photo.path && !photos.some((current) => current.path === photo.path)
        ? [photo.path]
        : [],
    ) || [];
  // Cleanup is best-effort after the atomic database save. Never report a saved item as unsaved.
  if (removed.length) {
    try {
      await withRequestDeadline(
        () => supabase.storage.from(BUCKET).remove(removed),
        "Photo cleanup did not finish.",
        undefined,
        5_000,
      );
    } catch {
      /* The item is saved; orphan cleanup can be retried separately. */
    }
  }
  return { ...saved, photos };
}
