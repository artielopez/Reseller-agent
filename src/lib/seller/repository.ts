import { demoMode } from "../config";
import { openDemoDb } from "../demo-db";
import { listItems } from "../repository";
import { getSupabase } from "../supabase";
import { withRequestDeadline } from "../request-deadline";
import {
  localSellerWorkspace,
  sellerCommandSchema,
  workspaceSchema,
  type SellerCommand,
  type SellerWorkspace,
} from "./workspace";
export async function sellerWorkspace(
  input: SellerCommand,
  parent?: AbortSignal,
): Promise<SellerWorkspace> {
  const command = sellerCommandSchema.parse(input);
  if (!demoMode) {
    const uncertain =
      "Could not confirm the preferences operation. Reload settings before retrying; your edits are kept.";
    const { data, error } = await withRequestDeadline(
      (signal) =>
        getSupabase().rpc("seller_workspace", { command }).abortSignal(signal),
      uncertain,
      parent,
    ).catch(() => {
      throw new Error(uncertain);
    });
    if (error)
      throw new Error(
        ["40001", "PT409"].includes(error.code)
          ? "Preferences changed elsewhere. Reload settings; your edits are kept."
          : "Could not load or save preferences. Check your connection and seller preferences migration. Your edits are kept.",
      );
    return workspaceSchema.parse(data);
  }
  await listItems();
  const db = await openDemoDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["inventory", "buyer"], "readwrite"),
        store = tx.objectStore("buyer");
      const inventory = tx.objectStore("inventory").get("items"),
        buyer = store.get("state"),
        preferences = store.get("preferences");
      let loaded = 0,
        result: SellerWorkspace,
        failure: unknown;
      const ready = () => {
        if (++loaded !== 3) return;
        try {
          const output = localSellerWorkspace(
            preferences.result,
            buyer.result,
            inventory.result,
            command,
          );
          result = output.result;
          store.put(output.state, "state");
          store.put(result.preferences, "preferences");
        } catch (e) {
          failure = e;
          tx.abort();
        }
      };
      inventory.onsuccess = buyer.onsuccess = preferences.onsuccess = ready;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () =>
        reject(
          failure instanceof Error
            ? failure
            : new Error(
                "Could not save local preferences. Your edits are kept.",
              ),
        );
    });
  } finally {
    db.close();
  }
}
