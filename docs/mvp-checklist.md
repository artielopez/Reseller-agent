# MVP implementation checklist

Implementation below describes the reviewable repository; [current release status](project-status.md) distinguishes shipped demo behavior from pending cloud features.

## Implemented

- [x] Next.js App Router, TypeScript and Tailwind foundation.
- [x] Responsive mobile/desktop inventory dashboard, search and status filters.
- [x] Add and edit items: title, condition, category, PHP asking price, description and multiple photos.
- [x] Client-side image resizing/JPEG re-encoding, input limits and photo removal.
- [x] Server-side AI title/description generation with editable outputs for three channels.
- [x] Carousell, Facebook Marketplace and Facebook Groups copy variants.
- [x] Copy title, description or complete post, with a clipboard-failure message.
- [x] Draft, Ready, Listed, Reserved and Sold inventory states.
- [x] Manual per-channel publication status and validated listing URLs.
- [x] Supabase email-link authentication for pre-created accounts.
- [x] Owner-isolated database tables, private image storage and atomic metadata saves.
- [x] Buyer inquiry and suggested reply tables with owner isolation; no message access or sending.
- [x] Manual saved buyer inbox, private/public destination labels, editable templates/manual drafts, explicit approval and revalidated clipboard copy.
- [x] Additive migration and demo storage upgrade; stale-context invalidation, guarded unsaved edits and separate Answered status.
- [x] Draft-only owned queue, expiring worker enrollment, shared attempt cap and cloud controls.
- [x] Restricted foreground Mac/OpenClaw worker, one-use model endpoint, check/once/watch commands and synthetic end-to-end acceptance. Hosted/model activation pending.
- [x] Clearly labeled credential-free demo with persistent browser data and template generation.
- [x] Environment examples, setup/deployment instructions and GitHub Actions checks.
- [x] Validation, actionable failure messages, input labels, keyboard focus and reduced-motion styling.
- [x] Unit/API boundary tests, PostgreSQL/RLS tests and browser workflow tests.

## Known limitations

- Real Supabase email delivery, Storage API behavior and paid OpenAI generation need credentials and a live acceptance pass. Local PostgreSQL tests use stand-ins for Supabase-owned schemas, not a hosted Supabase stack.
- Phone-size browser tests emulate an iPhone viewport in Chromium. Physical iPhone/Safari compatibility should be checked before regular use.
- There is no direct platform posting, scraping, platform synchronization, automatic channel capture or message sending. An optional separately configured worker generates review drafts only for explicitly queued saved private questions.
- Generation uses written facts only. It does not infer brand, condition or price from photos, research market prices, or verify model claims.
- Item facts and listing copy are separate. Regenerate or edit channel copy after changing price, condition or description. All three variants must be reviewed.
- Up to six photos per item. HEIC is unsupported; export as JPEG first. There is no drag-to-reorder; the first photo is the cover. Removing the cover promotes the next photo.
- Demo data stays on one browser and can be removed by browser storage cleanup. There is no demo-to-cloud import, export/backup UI or item-delete UI yet.
- Inventory saves use last-write-wins; buyer saves/approvals use revision checks. Avoid editing the same item on two devices at the same time. Database saves are atomic, but Storage operations are separate; interrupted uploads/cleanup can leave unused objects. Periodically compare bucket paths against `item_photos.path` before manually removing any orphan files.
- Saved photo URLs expire after 24 hours. Refresh the page to request new signed URLs.
- One record per channel per item. Facebook Groups stores one combined channel record, not a separate record for every group.
- Statuses and URLs are manual records, not externally verified. Marking an item sold or a channel removed does not change the actual marketplace listing.
- The Sold summary uses asking prices, not actual payment records. Expenses, profits, sold dates, shipping and payment handling are outside this MVP.
- The AI cap is per user, not a currency budget. Disable public signups and configure provider budgets/alerts. Failed paid-generation attempts consume the daily allowance.
- Changing hosting/Supabase configuration may require rebuilding and updating Auth redirect URLs. No live deployment is provisioned by this repository.

## Live acceptance checklist

Complete after setting up Supabase and optional OpenAI credentials:

1. Confirm the three application migrations (through `202610300002_draft_queue.sql`) completed and the `item-photos` bucket is **private**.
2. Disable public signups, create/invite your account, and verify email-link sign-in and sign-out on desktop and iPhone.
3. Add an item with two photos, reload, and sign in on the other device; confirm fields and photos sync.
4. Use a second test account to verify the first account's inventory and images are inaccessible.
5. Remove one photo, save, and confirm it disappears after reload; check the corresponding storage object was removed.
6. With no OpenAI key, confirm generation says templates were used. With a key, generate once and confirm the response is labeled AI, keeps the price/flaws, and remains editable.
7. Verify text copied on iPhone pastes correctly into the native platform posting form. Add photos through that platform yourself.
8. Record a real listing URL and publication status, save, reopen and check all three channels independently.
9. Mark an item Reserved, then Sold; update/remove the external listing yourself and record its channel state.
10. Verify invalid URLs/prices are rejected, and a connection failure leaves the unsaved editor available for retry.

11. In `/inbox`, save a question and draft on desktop, reload on iPhone and verify both appear. Check a second account cannot read or change them.
12. Approve a reply, change the linked item price/status on the other device, then verify copying is blocked until fresh drafting/review. Copying must leave the question Open.
13. Verify clipboard fallback, canceled sign-out/navigation with unsaved edits, session expiration and account switching. Check older migrated records load and require new approval.

Buyer inbox limits: latest 200 questions shown, no realtime updates or inquiry edit/delete UI; demo caps at 200 questions/2,000 drafts. Templates do not interpret questions. Public text requires seller review. The OpenClaw foreground drafting adapter has local synthetic acceptance; Hermes, real inbox capture, cloud outbox and automatic sending remain unimplemented. Local database tests do not establish hosted Auth/PostgREST acceptance.


## Restricted worker hosted acceptance (pending)

Use a dedicated synthetic item/question and an explicit model choice before real buyer text. Follow [Mac setup](mac-draft-worker.md). Record actual versions, project/deployment, time and sanitized pass/fail evidence; do not record keys or question text in the tracker.

1. Verify enroll/revoke/pause/queue actions require the correct signed-in owner, a second owner cannot inspect or mutate the first owner's records, and the one-time worker key cannot call owner controls or read inventory outside its lease.
2. Run credential-free preflight. Keep cloud drafting paused; `worker:once` must claim nothing and incur no model usage.
3. Resume, enqueue one synthetic private question and run once. Confirm one shared attempt, one saved Draft, source `agent`, and no approval, copy, Answered update or sending. Confirm the model's actual structured-output compatibility and usage in the provider account.
4. Start two separately enrolled workers on the same queued job using real concurrent database sessions. Confirm only one lease/model attempt. A second worker in the same local state directory must be rejected by the lock.
5. Test pause/revoke, item edits and inquiry closure during generation: stale/revoked work cannot be submitted as an approved or current draft. A call already admitted may still be charged; record that distinction.
6. Test shared quota exhaustion, provider refusal/timeout, expired enrollment/lease and a disconnected submission. Uncertain outcomes must stop polling, never blindly retry, and be reconciled from the saved queue before owner action.
7. Test Ctrl+C while idle and during generation. Confirm child process cleanup before restart. On deliberate crash simulation, inspect retained private state/lock and follow manual recovery; do not claim automatic recovery or install an autostart service.
8. On desktop and physical iPhone/Safari, reload the inbox, review/edit a generated Draft, approve and copy deliberately, then mark Answered separately. Confirm account switching and expired sessions do not reveal another owner's drafts.

Existing PGlite, fake HTTP/provider and Chromium tests do not satisfy this checklist. Actual platform account intake/send integration remains a separate permission and feasibility decision.

The optional fourth migration supports a [durable fake-delivery engineering lab](durable-delivery-simulation.md). Local synthetic tests are separate from any live sending claim; it is not connected to the app UI or Mac draft worker.
