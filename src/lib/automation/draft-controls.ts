import { z } from "zod";
import { getSupabase } from "../supabase";
const uuid = z.uuid(),
  revision = z.string().regex(/^[1-9][0-9]*$/);
const date = z.iso.datetime({ offset: true });
const status = z.enum(["queued", "leased", "completed", "failed", "canceled"]);
const workerSchema = z.object({
  id: uuid,
  label: z.string(),
  expires_at: date,
  revoked_at: date.nullable(),
  last_seen_at: date.nullable(),
});
const jobSchema = z.object({
  id: uuid,
  inquiry_id: uuid,
  status,
  reason: z.string().nullable(),
  created_at: date,
  updated_at: date,
});
const stateSchema = z.object({
  paused: z.boolean(),
  revision,
  workers: z.array(workerSchema),
  jobs: z.array(jobSchema).max(100),
});
const enrollmentSchema = z.object({
  id: uuid,
  token: z.string().regex(/^[a-f0-9]{64}$/),
  expires_at: date,
});
export type QueueState = z.infer<typeof stateSchema>;
export type Enrollment = z.infer<typeof enrollmentSchema>;
const commandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("list") }).strict(),
  z
    .object({
      op: z.literal("enroll"),
      label: z.string().trim().min(1).max(80),
    })
    .strict(),
  z
    .object({
      op: z.literal("pause"),
      paused: z.boolean(),
      expected_revision: revision,
    })
    .strict(),
  z.object({ op: z.literal("enqueue"), id: uuid, inquiry_id: uuid }).strict(),
  z.object({ op: z.literal("revoke"), id: uuid }).strict(),
  z.object({ op: z.literal("cancel"), id: uuid }).strict(),
]);
type Rpc = (
  command: Record<string, unknown>,
) => Promise<{ data: unknown; error: { code?: string } | null }>;
const defaultRpc: Rpc = async (command) =>
  getSupabase().rpc("draft_queue", { command });
const uncertain =
  "Could not confirm the operation. Reload worker settings before trying again. For a missing enrollment key, revoke the unexpected worker before creating another. Check your connection and the draft queue migration.";
export function createQueueClient(rpc: Rpc = defaultRpc) {
  async function execute<T>(
    input: z.input<typeof commandSchema>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success)
      throw new Error(
        "Check the worker name, question and controls before trying again.",
      );
    let response;
    try {
      response = await rpc(parsed.data);
    } catch {
      throw new Error(uncertain);
    }
    if (response.error?.code === "40001")
      throw new Error(
        "These settings or question facts changed. Reload worker settings before trying again.",
      );
    if (response.error) throw new Error(uncertain);
    const result = schema.safeParse(response.data);
    if (!result.success) throw new Error(uncertain);
    return result.data;
  }
  return {
    list: () => execute({ op: "list" }, stateSchema),
    enroll: (label: string) =>
      execute({ op: "enroll", label }, enrollmentSchema),
    pause: (paused: boolean, expected_revision: string) =>
      execute(
        { op: "pause", paused, expected_revision },
        z.object({ paused: z.boolean(), revision }),
      ),
    enqueue: (id: string, inquiry_id: string) =>
      execute(
        { op: "enqueue", id, inquiry_id },
        z.object({ id: uuid, status }),
      ),
    revoke: (id: string) =>
      execute({ op: "revoke", id }, z.object({ revoked: z.literal(true) })),
    cancel: (id: string) =>
      execute({ op: "cancel", id }, z.object({ canceled: z.literal(true) })),
  };
}
