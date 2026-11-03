# Inventory save conflicts

Task 6 two-device acceptance, 3 November 2026. Branch `codex/inventory-save-conflicts`, based on `7f92480` (PR #26).

## Defect and behavior

The original inventory RPC unconditionally updated an existing item. An older editor could overwrite a newer device's price, photos and listing copy. Database and two-tab browser regressions reproduced that behavior before the fix.

Every saved inventory item now has an opaque UUID save revision, separate from its buyer-facts revision. Existing edits must supply the revision loaded with that editor; the atomic database update compares it and returns an explicit `PT409` on conflict. Photo-only and listing-only saves advance it too. A versioned edit cannot recreate a missing item. A failed conflict leaves the database unchanged and the editor's unsaved text visible, with instructions to copy needed edits and reload/reopen.

`save_inventory_item_checked` returns the exact transaction's new save revision, timestamp and buyer-facts revision. The client does not invent its version or fetch a possibly newer version in a separate request. Both RPCs remain security invoker with empty search paths and authenticated-only execution; existing RLS/path constraints remain in force. The legacy UUID-returning RPC enforces the same guard, so an already-open older app cannot bypass it. Unversioned creation can create only a previously absent ID; it cannot replace an existing item.

The credential-free demo seeds/upgrades, compares and saves in one IndexedDB read/write transaction. This removes its previous read/write gap across tabs. Existing stored demo items receive revisions when first read. Buyer-facts revision behavior remains separate.

## Upload uncertainty

A missing photo metadata row immediately after a lost HTTP response cannot prove that the transaction will never commit. The earlier cleanup could delete an upload before a delayed commit referenced it. After an uncertain save the app now retains uploaded objects. Only a definitively rejected PostgreSQL transaction (or no RPC attempt) permits the existing unreferenced-object cleanup. A successful metadata save still handles explicitly removed photos as before. Orphan cleanup remains a separate unreleased operation; retained uploads are preferable to broken saved images.

## Checks and deployment

The unversioned overwrite, stale-device browser save, server receipt preservation and uncertain-upload cleanup regressions failed first. Final local lint/types, **247 tests** (six optional skips), all **52 desktop/mobile browser checks** and the production Webpack build passed. The full browser run covers buyer workflows that share demo persistence. Independent review found no Critical/Important issues; hosted release evidence is below. The native Mac picker still did not pass additional photo files to the cloud app; no save was submitted and the existing two-photo fixture stayed unchanged. Emulated photo tests do not replace that pending actual cloud check.

Pre-release hosted catalog checks confirm the current save RPC is invoker, authenticated-only, with an empty search path; items have RLS and no save-revision column yet. Security advisors retain the existing intentional definer-entry-point and leaked-password-protection notices. No permission change was made. The official [function guidance](https://supabase.com/docs/guides/database/functions) and changelog were checked; this increment uses existing invoker/RLS/RPC mechanisms without dependency or database-version upgrades.

Migration `202611030001_inventory_save_revision.sql` is additive and applied remotely as `20261103030151`, name `inventory_save_revision`. The matching client was built/reviewed first, then the migration and client were released together. Old open editors will fail existing-item saves and must reload; do not roll back to a client that lacks revision support while the guard remains active. No prior applied migration is rewritten, no stored item content is erased, and no owner grants or access audience should change.

## Execution rulings

Use an opaque UUID rather than the buyer-context revision: photos and listing copy are part of the inventory save contract but deliberately outside model fact invalidation. Cost: clients must preserve one additional returned value and stale editors need reload/re-entry; no automatic merge is attempted.

Reject unknown-outcome cleanup instead of inferring failure from a read that may race a commit. Cost: interrupted saves may leave private orphan objects for later deliberate cleanup. Never retry the write or generate a new item ID automatically after an uncertain response.

## Review and release — 3 November 2026

Fresh independent review of `7f92480..da14cd4` found no Critical, Important or required Minor changes. Accepted limits: this guard covers application RPC writes, not arbitrary owner direct-table mutations; already-open old demo bundles must close/reload; orphan collection is separate. Future integrations must use the guarded RPC or provide equivalent protection. Hosted and physical-device verification were outside the reviewer’s read-only remit.

Sites version **8** deployed successfully from source `318fc4add54b47ebeab24da29216e11c5c65973b`, deployment `appgdep_6ae94eb5e6fc819187c45ee06b10cc43`. Sites type checks and Worker build passed. Audience read-back remains custom, Artie owner/Janyl viewer. The first migration tool confirmation expired without applying anything; a read confirmed absence, and the renewed call succeeded once. No GitHub merge.

Hosted catalog checks verify both save RPCs are security invoker, empty-search-path and authenticated-only. The revision trigger function has no direct anon/authenticated execution grant. Items retain RLS; both existing items received a revision and all eight photo rows remained. Security advisors retain only the previously recorded definer/password warnings.

[`hosted-inventory-revision.sql`](../scripts/acceptance/hosted-inventory-revision.sql) passed against real hosted PostgreSQL with synthetic owners in one rolled-back transaction: exact receipt fields, photo-only token advancement without buyer-facts changes, stale and unversioned legacy rejection, photo preservation and cross-owner rejection. Follow-up found zero fixture items and the original two items/eight photos. This is sequential SQL acceptance, not overlapping hosted contention or Auth login.

Signed-in Chrome acceptance on the clearly labelled test lamp also passed: the pre-update bundle could not save; the new bundle saved the current revision; another tab retaining the prior revision rejected a PHP 100 overwrite with the actionable conflict message and kept its unsaved text. Reload retained PHP 900 and both existing photos decoded successfully. The real resale item was untouched. Same-browser tabs are not physical two-device or Janyl-isolation proof.
