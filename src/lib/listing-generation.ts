import { z } from "zod";
import { itemInputSchema, type Item } from "./domain";
import { getSupabase } from "./supabase";
import { withRequestDeadline } from "./request-deadline";

export function requestListingCopy(
  facts: Item,
  parent: AbortSignal,
): Promise<unknown> {
  return withRequestDeadline(
    async (signal) => {
      const { data, error } = await getSupabase().auth.getSession();
      signal.throwIfAborted();
      const token = data.session?.access_token;
      if (error || !token)
        throw new Error(
          "Your session expired. Sign in again before generating listing copy.",
        );
      const response = await fetch("/api/generate", {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(itemInputSchema.parse(facts)),
      });
      const result: unknown = await response.json();
      signal.throwIfAborted();
      if (!response.ok) {
        const failure = z.object({ error: z.string() }).safeParse(result);
        throw new Error(
          failure.success
            ? failure.data.error
            : "Generation failed. Please try again.",
        );
      }
      return result;
    },
    "Generation did not finish. Your item details are kept. Wait before trying again; this request may have used an AI attempt.",
    parent,
    45_000,
  );
}
