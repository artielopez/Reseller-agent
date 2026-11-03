# Worker health, draft requests and privacy review

## Buyer workflow

Open **Buyer inbox**, save or open a private question, then use **AI draft for this question**. The panel shows recorded worker activity and the latest job for this question. **Request AI draft** queues the saved facts; it does not start OpenClaw/Hermes, sign into a provider, approve a reply or send it. Paused queues and non-Open/public questions cannot request work. An existing queued/leased job blocks another inline request.

Use **Refresh draft status** to check durable state. There is no automatic polling or retry. An uncertain request disables further requests until a successful refresh; its original request ID is retained for a deliberate retry. A completed attempt permits an explicitly requested new draft. The database remains authoritative if another device changes the state.

**Load saved replies** reloads only the selected question. It asks before discarding unsaved reply edits and preserves unrelated question text and seller-preference edits. Review the loaded draft and current facts, save changes, approve the exact text, then copy and send through the original platform yourself. Mark Answered separately. The existing revision/context and read-time approval checks remain in effect.

## What health means

The UI uses database-recorded contact/job timestamps from the existing owner-scoped queue. It distinguishes pause, missing active keys, no contact, old contact, recent contact and a clock ahead of the device. A local 30-second timer ages the display; it makes no network/model calls. Five minutes is an advisory contact window, **not** an uptime SLA or process heartbeat. A one-shot worker normally stops after its pass. A valid key or recent contact does not establish provider authentication, remaining subscription allowance, or a currently running Mac.

Last completed draft means the newest completed job within the returned latest 100 jobs. Missing history is not proof that no earlier draft ever succeeded. Recovery text is allowlisted; raw failure reasons/provider payloads are never displayed. A stuck lease still requires reconciliation; refreshing the page does not expire it in the database.

Continue using the [supervised subscription procedure](subscription-worker-trial.md). Keep drafting paused outside an authorized bounded trial, verify the intended provider account/allowance privately, and never delete a crash lock merely because it is old. No background worker, normal OpenClaw configuration change, paid API fallback or outage email was added.

## Privacy review

**Privacy and stored data → Preview stored data** returns owner-only counts directly from the database, including inventory, photo records/objects, questions and replies. The selector chooses 30/90/180-day history previews; it does not save or activate a retention policy. Closed/Answered history is a candidate only if the question, replies and job activity are all older than the window, with no queued/leased job. Open history is excluded.

Possibly unused photo objects must be older than 24 hours and lack a saved reference in that snapshot. A delayed or uncertain save could still reference them later. The UI offers **no deletion action**. A future deletion implementation needs exact selection/confirmation, fresh concurrency protection, and Storage API deletion—not deletion of Storage metadata through SQL. No actual existing data is removed by this increment.

The RPC is `SECURITY INVOKER`, uses `auth.uid()` plus existing RLS, accepts no owner ID, returns counts/timestamps only, and grants execution only to authenticated users. It does not add a SECURITY DEFINER entrypoint or weaken existing policies. See migration `20261103072649_workspace_privacy_preview.sql`.

Verified against current [Supabase Storage schema guidance](https://supabase.com/docs/guides/storage/schema/design): metadata may be queried directly, but object mutations must use the Storage API. The 3 November changelog scan found no new SQL/RLS requirement affecting this preview; no extension, TLS or database upgrade was performed.

## Verification

Before implementation, the health module, privacy RPC/client and browser panels failed their respective regressions as absent. The first saved-reply reload test exposed a real local-state issue: accepting discard retained edits when the saved revision was unchanged. A deliberate reload now remounts the reply editor, and the regression passes.

Local lint/types, 257 tests (six optional skips), all 52 ordinary desktop/mobile browser checks, all 20 cloud-contract browser checks, Next production build and worker build passed. Cloud-contract tests use synthetic HTTP responses, not real user sessions. Database tests exercise real migrations in PGlite with synthetic roles/Storage metadata, including owner isolation and no-delete behavior. They do not replace hosted or physical-device acceptance.

One fresh independent review found no blocking issues and independently passed the ten new health/privacy tests. The hosted rollback acceptance script also passed a subsequent local regression (one additional test). Hosted migration verification and Sites release evidence will be recorded below when complete.
