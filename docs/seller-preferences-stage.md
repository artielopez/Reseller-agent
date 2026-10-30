# Seller reply preferences and in-app review — execution stage

Branch `codex/seller-reply-preferences`, based on `bdf6541` (PR #14). Previous goal turn made implementation/review/delivery progress; final PR #14 checks passed and Supabase remains unconnected. The approved sales-assistant plan's Task 4 still permits user-facing settings and exception-review work independently of channel access. This stage builds those usable controls, not another delivery simulator.

## Scope

Add owner-scoped seller terms for private drafts (general pickup area, delivery notes, payment methods/conditions), plus an optional daily in-app review reminder and a current inbox summary. Business fields start blank. The owner supplies actual terms; these preferences neither grant sending authority nor invent negotiation/payment/meeting commitments. No external notification, scheduled daemon, background message reading or sending is created. The reminder only appears when opening/refreshing the inbox after the chosen Manila time.

Use existing app styling and accessible mobile controls. The summary covers the same latest 200 saved questions the inbox shows: Open, current approved replies ready to copy, questions with drafts needing review, and questions received since the last explicit review (or today's Manila midnight). It makes no claim about uncaptured platform messages. Marking the summary reviewed changes no inquiry/reply status.

## Data and safety contract

- New additive migration `202610310001_seller_preferences.sql`; no dependency on the optional delivery-simulation migration. Reuse the existing Supabase Auth/RLS boundary and owner-authenticated RPC.
- Preferences have an optimistic decimal-string revision. Saved terms have a separate revision so changing only reminder settings or review time does not invalidate replies.
- Until terms are first saved, reply context remains backward-compatible. Thereafter, exact terms/revision join the trusted buyer/draft-worker context. Term changes invalidate prior approvals; copy/approve/start/submit still compare fresh context. Private templates and AI drafting use only saved terms. Public templates and public drafting restrictions exclude them.
- Demo uses a separate key in the existing version-2 buyer object store, preserving inventory and saved inquiries. Preference reads/writes, current facts and approval invalidation share IndexedDB transactions. No new account or paid request.
- Preference save failures, stale revisions and background refresh preserve typed edits. Account changes clear state and ignore late responses. Include unsaved preferences in sign-out/navigation protection. Saving terms preserves unsaved reply text and immediately marks cached reply context stale without remounting the reply editor.
- No automatic availability confirmation, discount floor, reservation, exact address, payment receipt confirmation or live policy release is introduced. Existing facts-only drafting rules remain.

## Interface pre-flight

| Producer → consumer | Contract/ruling |
| --- | --- |
| Preferences RPC/local store → buyer context | Optional saved-terms object with independent revision; absent until terms have changed. Existing unsaved/default terms do not reset old context. |
| Buyer context → template/agent | Private replies may use explicit saved terms; public templates never include them. Model payload excludes preference revision, owner identifiers and reminder metadata. |
| Preferences UI → review editor | Update only cached context after terms save; retain edited text and old draft snapshot/revision so approval/copy is disabled until fresh review. |
| Inbox records → review summary | Aggregate latest 200 owned saved questions only; reminder is in-app on refresh, not a scheduled external notification. |

Ruling: keep business terms blank and reminders off by default. The owner can supply terms through the implemented UI; this is not a blocker to building it and does not infer approval to use them for unattended sending. Cost: unanswered business details still require owner input before real use.

## Execution steps

1. Fail-first tests for preference validation/revisions, private/public context and reminder timing; implement domain/local behavior.
2. Add owner RPC/migration, context integration and tests for ownership, stale writes, approval invalidation, digest-only changes and data preservation.
3. Implement persistent demo/cloud repository and mobile preferences/summary panel with unsaved/account-change protection; add targeted browser tests.
4. Update setup/checklist/status, run full checks/build/browser suites, one fresh final review and one Important/Critical fix pass; publish a reviewable PR, no merge or live account activation.

## Evidence in progress

- Preference validation/defaults/revisions and Manila timing: 3 RED then GREEN cases. Private terms/context integration: 3 RED then GREEN cases. Owner/database acceptance: 2 RED then GREEN cases, applying the migration without optional delivery simulation.
- Full local suite: 171 passed, 6 optional installed-runtime cases skipped; lint/types, worker compilation and Webpack production build passed. Four new desktop/mobile preference checks passed before final styling. Full final browser suites are rerunning with isolated artifact directories after concurrent runs collided in Playwright's shared output folder; this was a test-runner artifact error, not a UI assertion failure.
- Next: final browser evidence, one fresh reviewer, any Critical/Important fixes and reviewable PR. No live setup or sending.

## Final review and fix pass

One fresh read-only review of `bdf6541..9d6a3c2` found no Critical and one Important defect: retained clipboard fallback text and pending copy completions could outlive approval invalidation after terms changed. No Minor findings. Both visible-fallback and delayed-clipboard-rejection regressions were reproduced RED in a production browser. The fix gates fallback/notices on current eligibility and fences asynchronous copy completions against the latest committed UI context, while retaining editor text. A clipboard write already handed to the operating system cannot be recalled; the app does not claim otherwise. One fix pass; no second reviewer.

Review rulings:
- Hosted separate-session contention/two-account service acceptance stays pending; local database checks are not proof of live contention.
- Actual model/runtime and physical iPhone/Safari acceptance stays pending; synthetic browser/runtime fixtures are not those live checks.
- External notifications, platform ingestion/sending and history beyond 200 questions stay outside this stage as documented; no release authority is inferred.
- Unrelated PR #8–14 behavior remains governed by its existing evidence; this review covers regressions introduced by saved terms/context and inbox UI.

The account-switch test assertion was corrected to check the old form is no longer visible (the new account's collapsed form may already exist), then verify blank new-account values after the delayed old save. Mobile visual inspection also corrected checkbox alignment and the primary save-button style.

Final fix-pass verification: **171 standard tests passed**, 6 optional installed-runtime tests skipped; lint, types, worker build and Webpack production build passed. **44 production demo browser checks and 10 synthetic cloud browser checks passed**, including both new RED→GREEN regression cases on desktop and mobile. Reviewable PR publication and exact-head CI remain the final delivery steps.
