import { z } from "zod";
import { demoMode } from "../config";
import { channels } from "../domain";
import { eventSchema, initialState, type State, type Entry } from "./engine";

// eventSchema is strict; validate the event projection separately below.
const stateSchema = z.object({
  version: z.literal(1),
  settings: z.object({
    paused: z.boolean(),
    mode: z.enum(["review", "simulate"]),
    nativeChannels: z.array(z.enum(channels)),
    revision: z.number().int().positive(),
  }),
  events: z.array(z.unknown()).max(200),
  takeovers: z.array(z.string()),
  availability: z.array(
    z.object({
      itemId: z.string(),
      facts: z.string(),
      at: z.number().finite().nonnegative(),
    }),
  ),
});
const metadataSchema = z.object({
  status: z.enum([
    "captured",
    "review",
    "ready",
    "claimed",
    "simulated",
    "unknown",
  ]),
  reason: z.string(),
  reply: z
    .object({
      body: z.string().max(10000),
      source: z.enum(["template", "human"]),
      facts: z.string(),
      policyRevision: z.number().int().positive(),
      eventRevision: z.number().int().positive(),
    })
    .nullable(),
  claim: z.string().nullable(),
  completedAt: z.number().finite().nullable(),
});
export function restoreState(value: unknown): State {
  const s = stateSchema.parse(value);
  const events = s.events.map((raw) => {
    const meta = metadataSchema.parse(raw);
    const { status, reason, reply, claim, completedAt, ...event } =
      raw as Entry;
    void status;
    void reason;
    void reply;
    void claim;
    void completedAt;
    const parsed = { ...eventSchema.parse(event), ...meta };
    // The simulator commits claim + completion in one transaction. A persisted
    // claim therefore means an interrupted/older writer; never retry it.
    if (parsed.status === "claimed") {
      parsed.status = "unknown";
      parsed.reason = "Interrupted simulation — automatic retry is blocked.";
    }
    if (
      ["ready", "simulated", "unknown"].includes(parsed.status) &&
      !parsed.reply
    )
      throw new Error("Invalid saved reply.");
    return parsed;
  });
  if (new Set(events.map((e) => e.id)).size !== events.length)
    throw new Error("Duplicate saved question IDs.");
  return { ...s, events };
}

function openDb(): Promise<IDBDatabase> {
  if (!demoMode)
    return Promise.reject(
      new Error("Buyer lab is available only in demo mode."),
    );
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("reseller-agent-buyer-lab", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onerror = () =>
      reject(
        new Error(
          "Browser storage is unavailable. Allow site storage and reload.",
        ),
      );
    request.onblocked = () =>
      reject(new Error("Close older buyer lab tabs, then reload."));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
// All read-modify-write work is synchronous inside one IndexedDB transaction.
// Concurrent tabs serialize here; there is no browser-localStorage lock or sender.
export async function changeDemoState(
  change: (state: State) => State,
): Promise<State> {
  const db = await openDb();
  try {
    return await new Promise<State>((resolve, reject) => {
      const tx = db.transaction("state", "readwrite"),
        store = tx.objectStore("state");
      let result: State, failure: unknown;
      const request = store.get("current");
      request.onsuccess = () => {
        try {
          result = change(
            request.result === undefined
              ? initialState()
              : restoreState(request.result),
          );
          store.put(result, "current");
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () =>
        reject(
          failure instanceof Error
            ? failure
            : new Error(
                "Could not save the buyer lab. Reload before trying again.",
              ),
        );
    });
  } finally {
    db.close();
  }
}
export const readDemoState = () => changeDemoState((state) => state);
