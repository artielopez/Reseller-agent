import { z } from "zod";
import { getSupabase } from "./supabase";
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const windowDays = z.union([z.literal(30), z.literal(90), z.literal(180)]);
const previewSchema = z.object({
  as_of: z.iso.datetime({ offset: true }),
  cutoff: z.iso.datetime({ offset: true }),
  window_days: windowDays,
  items: count,
  photo_references: count,
  photo_objects: count,
  questions: count,
  replies: count,
  history_candidates: count,
  history_candidate_replies: count,
  unlinked_photo_candidates: count,
});
export type PrivacyPreview = z.infer<typeof previewSchema>;
type Rpc = (days: 30 | 90 | 180) => Promise<{ data: unknown; error: unknown }>;
const defaultRpc: Rpc = async (days) =>
  getSupabase()
    .rpc("workspace_privacy_preview", { window_days: days })
    .abortSignal(AbortSignal.timeout(15_000));
export function createPrivacyClient(rpc: Rpc = defaultRpc) {
  return {
    async preview(days: number): Promise<PrivacyPreview> {
      const window = windowDays.safeParse(days);
      if (!window.success) throw new Error("Choose 30, 90 or 180 days.");
      try {
        const result = await rpc(window.data);
        if (result.error) throw new Error();
        const parsed = previewSchema.parse(result.data);
        if (parsed.window_days !== days) throw new Error();
        return parsed;
      } catch {
        throw new Error(
          "Could not load the privacy preview. Check sign-in, connection and the privacy-preview migration, then try again. No data was changed.",
        );
      }
    },
  };
}
