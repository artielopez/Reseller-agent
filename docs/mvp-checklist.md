# MVP implementation checklist

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
- [x] Clearly labeled credential-free demo with persistent browser data and template generation.
- [x] Environment examples, setup/deployment instructions and GitHub Actions checks.
- [x] Validation, actionable failure messages, input labels, keyboard focus and reduced-motion styling.
- [x] Unit/API boundary tests, PostgreSQL/RLS tests and browser workflow tests.

## Known limitations

- Real Supabase email delivery, Storage API behavior and paid OpenAI generation need credentials and a live acceptance pass. Local PostgreSQL tests use stand-ins for Supabase-owned schemas, not a hosted Supabase stack.
- Phone-size browser tests emulate an iPhone viewport in Chromium. Physical iPhone/Safari compatibility should be checked before regular use.
- There is no direct platform posting, scraping, platform synchronization, automatic reply generation or message sending.
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

1. Confirm both migrations completed and the `item-photos` bucket is **private**.
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

Buyer inbox limits: latest 200 questions shown, no realtime updates or inquiry edit/delete UI; demo caps at 200 questions/2,000 drafts. Templates do not interpret questions. Public text requires seller review. OpenClaw/Hermes, real inbox capture, cloud outbox and automatic sending remain unimplemented. Local database tests do not establish hosted Auth/PostgREST acceptance.
