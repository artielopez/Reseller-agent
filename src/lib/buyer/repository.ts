import { z } from "zod";
import {
  defaultPreferences,
  preferencesSchema,
  termsContext,
} from "../seller/preferences";
import { demoMode } from "../config";
import { openDemoDb } from "../demo-db";
import { getSupabase } from "../supabase";
import { listItems } from "../repository";
import type { Item } from "../domain";
import {
  parseCommand,
  inquirySchema,
  threadSchema,
  type Command,
} from "./domain";
import { localCommand } from "./local";

async function execute(input: Command): Promise<unknown> {
  const command = parseCommand(input);
  if (!demoMode) {
    const { data, error } = await getSupabase().rpc("buyer_workspace", {
      command,
    });
    if (error) {
      if (error.code === "40001")
        throw new Error(
          "This question, draft or item changed. Reload the inbox and prepare a fresh draft.",
        );
      if (error.code === "P0002" || error.code === "42501")
        throw new Error(
          "Record unavailable or session expired. Sign in and reload.",
        );
      if (error.code === "22023")
        throw new Error(
          "Check the question, reply and approval before trying again.",
        );
      throw new Error(
        "Could not confirm the inbox operation. Reload before retrying; check connection and the buyer inbox migration.",
      );
    }
    return data;
  }
  await listItems(); // Seed existing inventory if needed, before opening the atomic transaction.
  const db = await openDemoDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["inventory", "buyer"], "readwrite");
      const inventory = tx.objectStore("inventory").get("items"),
        saved = tx.objectStore("buyer").get("state"),
        preferences = tx.objectStore("buyer").get("preferences");
      let count = 0,
        result: unknown,
        failure: unknown;
      const loaded = () => {
        if (++count !== 3) return;
        try {
          const output = localCommand(
            saved.result,
            inventory.result as Item[],
            command,
            undefined,
            termsContext(
              preferencesSchema.parse(
                preferences.result ?? defaultPreferences(),
              ),
            ),
          );
          result = output.result;
          tx.objectStore("buyer").put(output.state, "state");
        } catch (e) {
          failure = e;
          tx.abort();
        }
      };
      inventory.onsuccess = loaded;
      saved.onsuccess = loaded;
      preferences.onsuccess = loaded;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () =>
        reject(
          failure instanceof Error
            ? failure
            : new Error("Could not save local inbox. Reload before retrying."),
        );
    });
  } finally {
    db.close();
  }
}
export async function listInquiries() {
  return z.array(inquirySchema).parse(await execute({ op: "list" }));
}
export async function readThread(id: string) {
  return threadSchema.parse(await execute({ op: "get", id }));
}
export async function mutateThread(
  command: Exclude<Command, { op: "list" } | { op: "get" } | { op: "copy" }>,
) {
  return threadSchema.parse(await execute(command));
}
export async function approvedText(id: string, expected_revision: string) {
  return z
    .object({ body: z.string(), revision: z.string() })
    .parse(await execute({ op: "copy", id, expected_revision }));
}
