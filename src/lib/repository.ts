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

const BUCKET = "item-photos";
async function demoRead(): Promise<Item[] | undefined> {
  const db = await openDemoDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("inventory")
        .objectStore("inventory")
        .get("items");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error("Could not read demo inventory."));
    });
  } finally {
    db.close();
  }
}
async function demoWrite(items: Item[]): Promise<void> {
  const db = await openDemoDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("inventory", "readwrite");
      transaction.objectStore("inventory").put(items, "items");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          new Error(
            "Could not save to browser storage. Your device may be out of space.",
          ),
        );
      transaction.onabort = () =>
        reject(new Error("Save was interrupted. Please try again."));
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
  item_photos: { id: string; path: string; position: number }[];
  listings: Listing[];
};
export async function listItems(): Promise<Item[]> {
  if (demoMode) {
    const items = await demoRead();
    if (items) return items;
    const initial = demoItems();
    await demoWrite(initial);
    return initial;
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("items")
    .select("*, item_photos(*), listings(*)")
    .order("updated_at", { ascending: false });
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
        photos,
        listings: row.listings,
      };
    }),
  );
}
export async function saveItem(item: Item, previous?: Item): Promise<Item> {
  validateItem(item);
  const saved = { ...item, updatedAt: new Date().toISOString() };
  if (demoMode) {
    const items = await listItems();
    const stored = items.find((i) => i.id === item.id);
    saved.replyContextRevision = stored
      ? (
          BigInt(stored.replyContextRevision || "1") +
          (JSON.stringify(itemInputSchema.parse(stored)) ===
          JSON.stringify(itemInputSchema.parse(saved))
            ? BigInt(0)
            : BigInt(1))
        ).toString()
      : "1";
    await demoWrite([saved, ...items.filter((entry) => entry.id !== item.id)]);
    return saved;
  }
  const supabase = getSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    throw new Error("Your session expired. Sign in again to save.");
  const uploaded: string[] = [];
  const photos: Photo[] = [];
  try {
    for (const photo of item.photos) {
      if (photo.path) {
        photos.push(photo);
        continue;
      }
      if (!photo.url.startsWith("data:image/jpeg;base64,"))
        throw new Error("Please upload a JPEG, PNG or WebP photo.");
      const blob = await (await fetch(photo.url)).blob();
      const id = crypto.randomUUID();
      const path = `${user.id}/${item.id}/${id}.jpg`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error)
        throw new Error(
          "Photo upload failed. Check your connection and try again.",
        );
      uploaded.push(path);
      photos.push({ ...photo, id, path });
    }
    const { error } = await supabase.rpc("save_inventory_item", {
      payload: {
        ...saved,
        photos: photos.map(({ id, path }) => ({ id, path })),
      },
    });
    if (error)
      throw new Error(
        "Could not confirm the save. Check your connection and database setup, then reload inventory before retrying.",
      );
  } catch (error) {
    if (uploaded.length) {
      // A network error can occur after commit. Never delete an image still referenced
      // by committed metadata, and preserve uploads if confirmation is unavailable.
      try {
        const { data: referenced, error: lookupError } = await supabase
          .from("item_photos")
          .select("path")
          .in("path", uploaded);
        if (!lookupError) {
          const retained = new Set(
            (referenced || []).map((photo) => photo.path),
          );
          const unused = uploaded.filter((path) => !retained.has(path));
          if (unused.length) await supabase.storage.from(BUCKET).remove(unused);
        }
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
      await supabase.storage.from(BUCKET).remove(removed);
    } catch {
      /* The item is saved; orphan cleanup can be retried separately. */
    }
  }
  return { ...saved, photos };
}
