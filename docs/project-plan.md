# Reseller Agent project plan

Updated 4 November 2026. [Status and evidence](project-status.md) · [Imported handoff](project-handoff.md) · [Sales-assistant plan](superpowers/plans/2026-10-29-sales-assistant.md) · [Manual buyer foundation](superpowers/plans/2026-10-28-buyer-replies.md)

## Current assignment

Active seven-hour independent work window: see the [overnight work queue and evidence](overnight-work-2026-11-04.md). Finish concrete reliability/workflow gaps without waiting for participant or platform responses; preserve the external acceptance boundaries. No merge or owner interruptions during the sleep window. The overnight changes are live in Sites version 13: bounded owner RPC/inventory save/read waits, recoverable sign-in, account-bound request cancellation, bounded listing/photo preparation, recoverable sign-out and guarded saved-question editing. Draft PR #29 remains unmerged.

The owner approved autonomous work on worker health/recovery, the buyer-drafting workflow, privacy/cleanup previews, isolation checks and release preparation, with no merge. The [current increment](worker-health-workflow.md) implements advisory contact/job health, per-question draft requests and guarded reply reload, plus a read-only owner-scoped privacy preview. Local checks and independent review passed. Sites version 9 and the additive privacy migration are released; signed-in screen verification is blocked by disabled local browser use. PR #28 remains unmerged. [Execution plan](superpowers/plans/2026-11-03-worker-health-workflow.md) · [release map](release-review-map.md).

Janyl’s first app activation is now verified by her supplied mobile dashboard and Supabase Auth at 11:39 UTC+8 on 3 November. Fresh 3 November read-back now confirms one owned item, one photo row and its matching private Storage object. Her device reload/image decoding and full two-owner HTTP/Storage isolation remain separate.

Current shared-app increment: [inventory save conflicts](inventory-save-conflicts.md), protecting newer saved item/photo/listing data from an older device's editor. Includes safe handling of uncertain photo saves. Local checks and independent review passed; the coordinated database/client release is live in Sites version 8. Hosted SQL and signed-in two-tab stale-save checks passed. This advances two-device acceptance without claiming physical-device or second-user completion.

Current recovery increment: [worker parent-crash handling](worker-parent-crash-recovery.md). Actual synthetic SIGKILL tests exposed surviving subprocesses after caller or supervisor loss. A group known before target startup now lets either surviving process stop it. Review's Important finding was reproduced and fixed; final full tests and installed isolated-runtime checks passed. No unattended activation or provider-cancellation claim follows from local process cleanup.

Latest reliability fix: [non-retryable business conflicts](non-retryable-conflicts.md), deployed in Sites version 7 with the matching database migration. Hosted control races uncovered PostgREST looping on custom `40001`; the tested incremental database fix uses `PT409`, and client adapters preserve actionable reload guidance. Guards/permissions remain unchanged. PR #25 is open for review. This advances real recovery acceptance without enabling channel intake/sending.

Current channel checkpoint: the owner declined sending the [Carousell inquiry](carousell-access-support-draft.md). The requested current terms check confirms explicit restrictions on automated access and messaging; custom Carousell integration stays unavailable under this evidence. Native/manual assistance is separate. Beeper has been contacted separately.

Current Task 6 artifacts: [acceptance register](automation-acceptance.md) and [operating guide](automation-operations.md). The register tracks the full original scope and explicitly separates implemented manual assistance, tested synthetic boundaries and unresolved live automation gates. No whole-task completion or automatic release is inferred from these documents.

Reliability continuation, 3 November: Task 6 now includes four passing real-local-HTTP fault cases around committed queue operations, with no inference replay or duplicate drafts. See [recovery acceptance](worker-recovery-acceptance.md). Three hosted concurrent claim/start/identical-submit cases now also passed with observed lock contention; see [hosted concurrency acceptance](hosted-concurrency-acceptance.md). Local compiled-CLI signal/lock recovery and active process-group cancellation now also have [acceptance evidence](worker-recovery-acceptance.md#local-process-lifecycle-acceptance--3-november-2026). Physical restart/provider expiry, interrupted real inference and other hosted races remain separate gates. The owner-approved [Beeper support inquiry](channel-access-support-draft.md) has been sent; connector implementation still depends on supported access and coverage.

Latest completed increment: ten photos per item are deployed in cloud version 6, with matching database limits and passing local browser/hosted database checks. Actual ten-image cloud upload remains pending because of Mac picker automation trouble. Buyer questions are entered manually through **Open buyer inbox** and linked to a saved item.

Latest acceptance: Mac Chrome saved and reloaded two synthetic photos in private cloud storage; the old-price warning is deployed in cloud version 5. The existing OpenClaw account and no-inference broker preflight are verified, and the owner-approved model-training opt-out is saved. One owner-selected question has now completed the [supervised existing-login trial](subscription-worker-trial.md), saving an Agent Draft that the owner subsequently approved; the worker remains paused and its temporary enrollment revoked. The owner reported completing the manual reply, and cloud read-back confirms the question is Answered. Next: Janyl's activation, physical-device/two-user acceptance, and permitted marketplace intake/sending. A separate SIWC connection is optional hardening for future unattended use, not a blocker for the bounded supervised trial. Earlier zero-photo and blanket synthetic-only entries are historical.

The owner confirmed use of a personal Facebook profile and wants both Group comments and private messages captured, processed and answered promptly with minimal engagement. OpenClaw and Hermes on the Mac mini are available resources. The owner subsequently said **“Go ahead and work on it”**, authorizing implementation and account feasibility checks. The [new design](superpowers/specs/2026-10-29-sales-assistant-design.md), [research update](research/personal-account-automation-update.md) and [conditional staged plan](superpowers/plans/2026-10-29-sales-assistant.md) are the current roadmap. The [synthetic buyer lab](buyer-lab.md) and manual inbox were merged and deployed to the private Sites demo on 30 October. Live sending remains disabled and needs a permitted channel and release decision. Native Marketplace replies and a Beeper personal-Messenger bridge are candidates to investigate, not verified integrations for this account. Group comments and Carousell have separate unresolved access gates.

The manual inquiry/review milestone below is retained as a foundation and fallback. Its no-sending boundary applies to that milestone; it does not redefine the owner's newer objective. No existing runtime restriction is relaxed by planning. [Account-specific evidence](research/channel-capability-evidence.md) records the completed desktop check and unresolved mobile/native and integration questions. The [shared manual inbox stage](shared-inbox-stage.md) implements saved questions, draft editing, approval and clipboard copy, merged through PR #7. Its Supabase adapter/migration and local demo are implemented; hosted acceptance is pending. Next: resolve access gates before custom connector investment; cloud outbox and restricted-agent work remain separate milestones. Native replies and custom sending use separate modes; the app cannot promise to pause external native features.

### Initial hosted setup — 1 November (historical)

The owner selected a dedicated Free organization, **Artie's Projects**, and its new Singapore **Reseller Agent** project is provisioned. Four application migrations and hosted database/anonymous HTTP checks passed; see the [cloud setup record](cloud-workspace-setup.md). The owner also requested Janyl's separate inventory: keep invitations restricted and use existing per-user ownership, with no shared household view or dashboard access implied. Next work is the app accounts, a shared cloud URL with exact Auth redirects, authenticated photo/persistence checks and physical-device acceptance. The existing private Sites link remains a separate browser-local demo. No automatic buyer reader/sender or real drafting worker has been activated.

### Shared cloud continuation — 1 November

The owner explicitly authorized finishing the shared cloud app and sign-in flow, sending app invitations to Artie and Janyl, and checking multi-organization MCP access. The [cloud app is published](shared-cloud-release.md), Auth redirects are configured, and custom Resend SMTP is working through the verified auth.artielopez.com subdomain. Artie is activated and has signed in. Janyl has private Sites viewer access and her Supabase app invitation is delivered; she remains an ordinary app user with her own inventory. Next is her invitation acceptance and both users' authenticated photo/persistence checks. No Supabase team/admin access was granted. Multi-organization MCP needs a separately scoped credential and verification, while the existing Artie's Projects connector remains working.

### Buyer drafting continuation — 2 November

The owner prefers existing OpenClaw or Hermes subscription access instead of a new paid API key. [Hosted draft queue acceptance](hosted-draft-acceptance.md) verifies the database boundary with rolled-back synthetic fixtures. The profile-bound OAuth adapter then passed an actual synthetic cloud round trip: saved question → sandboxed Mac worker → Agent Draft → explicit UI review/manual-copy fallback. Its acceptance enrollment is revoked and the queue paused. The reviewed implementation is in PR #20; the separately approved cloud navigation/copy fixes are published. Next: photo persistence, Janyl's activation, physical-device acceptance and the real-buyer subscription release gates. See [trial boundaries](subscription-worker-trial.md) and [remaining subscription controls](research/subscription-drafting.md#remaining-controls-investigation--2-november). The installed Codex transport does not provide the requested upstream output-token cap, and the public completion API does not expose retry/transport selection. App-specific Sign in with ChatGPT is a candidate for enforceable allowance controls, not a configured replacement. Preserve review-only replies and channel access gates; no general-agent configuration change or automatic sending is authorized by this route choice.

### Earlier assignment and completed delivery

Take over the existing repository, make the local demo available, maintain this plan and the status tracker, and prepare the buyer reply implementation plan. Do not merge without the owner's explicit approval.

On 28 October the owner also requested a shared demo link, then explicitly selected ChatGPT Sites. That authorizes publishing a credential-free demo. It does not authorize merging PRs, connecting real inventory services, or expanding access to other people. The Site remains owner-private and can be opened from the owner's Windows, Mac or iPhone while signed into the same ChatGPT account.

The existing inventory/listing MVP is in PR 1. Its original buyer requirement was a data model, which exists. The handoff proposes a user-facing buyer workflow as the next milestone; preparing that implementation does not mean it has been built or released.

## Delivery sequence

| Stage                                              | Deliverable                                                                                 | Completion evidence                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Workspace and planning (current assignment)     | Current checkout, credential-free demo, baseline checks, shared status, concrete buyer plan | Recorded commands/results, working local URL, reviewable documentation |
| 2. Manual inquiries (implemented locally)          | Enter and reopen buyer questions for saved items, with demo/cloud persistence               | Reload persistence, validation, owner-isolation tests                  |
| 3. Reviewed replies (templates/manual implemented) | Generate or write, edit, approve, copy, manually mark answered                              | Approval invalidation and copy/status separation tests                 |
| 4. Verification                                    | Full regression suite and documented limitations                                            | Passing checks for actual implementation commit                        |
| 5. Hosted acceptance                               | Selected Supabase/hosting setup and optional paid OpenAI verification                       | Desktop + physical iPhone acceptance with actual services              |
| 6. Owner review                                    | Reviewable PRs, setup steps and evidence                                                    | Explicit owner merge decision; deployment is a separate action         |

Stages 2–4 now have a template/manual implementation with local verification; hosted acceptance and owner merge review remain pending. Hosted credentials are not a blocker for planning or demo development. Do not request secrets in chat or put them in tracked files.

## Next milestone: buyer replies

The following is the broader target from the handoff. The current [execution slice](shared-inbox-stage.md) implements manual questions and template/manual draft review. Paid API replies, editable received time and dismiss controls remain deferred; saved-question editing is implemented in the overnight increment; their presence below is a plan, not a completion claim.

### Seller workflow

1. Open a **saved** inventory item and its Buyer inquiries view. Save or discard item edits before entering it.
2. Manually paste a question, choose Carousell, Facebook Marketplace or Facebook Groups, optionally enter a buyer name, and confirm received time. Save as Open.
3. Choose Generate reply or write a reply yourself. Show the saved item facts and original question beside the draft. Label templates and AI distinctly.
4. Edit and save the draft, explicitly approve the saved text, then choose Copy approved reply. Editing either the reply or relevant context requires fresh review.
5. Send through the platform yourself. Mark the inquiry Answered manually afterward, or Closed without sending. Copying changes neither inquiry status nor marketplace state.

### Boundaries and decisions

- No scraping, inbox access, platform passwords, sending endpoint, background generation or automatic sending.
- Keep the current stack and existing tables; add an incremental migration, never rewrite the applied initial migration.
- In cloud mode, verify the Supabase user and resolve item/inquiry facts from owned records on the server. Client-supplied item facts are not trusted for reply generation.
- Demo uses browser storage and deterministic templates only, with a clear demo banner. No API key is needed; no paid request occurs even if a server key exists.
- Cloud mode with no OpenAI key offers labeled templates. Provider failure shows an error and preserves work; it does not silently claim template output is AI.
- Share the existing **20 paid attempts per user per Asia/Manila day** between listing and reply generation, including provider failures. Templates, manual edits, approval and copying consume no allowance.
- Keep the existing **16 KiB** request cap, **25-second** provider timeout, **zero automatic retries**, server-only credentials and `store: false`. Use at most **1,800 output tokens** and the configured model; verify model compatibility at implementation time.
- Treat buyer messages and seller text as untrusted data. Use supplied facts only. Never infer authenticity, warranties, accessories, pickup locations or delivery terms. Do not promise availability, accept a discount, reserve an item or commit to payment on the seller's behalf.
- No new seller-policy settings in this milestone. Explicit terms can be recorded in the saved item description. Unknown terms stay unanswered and appear in a separate seller-review note, never as an invented promise.
- Exclude buyer names, IDs and received times from the model payload. Send only the question, channel and necessary saved item facts. Do not log message bodies, drafts, tokens or keys. Show a brief disclosure before cloud AI drafting.
- Support multiple inquiries and multiple reply drafts. Generate creates a new Draft; it never replaces an approved reply. Offer a manual draft without requiring AI. Dismissed drafts remain visible in history; no deletion UI is required.
- Existing DB limits remain: optional buyer name up to 200 characters, nonblank message and reply up to 10,000 characters. Validate the 16 KiB serialized request byte limit too, including Unicode. Read legacy records without truncation; require correction before saving invalid legacy whitespace-only content.
- Inventory facts and inquiry context carry database-managed revisions. Approvals bind to the exact saved reply revision and item/inquiry context. Relevant edits invalidate approval transactionally, including edits from another device.
- Re-review a stale draft against the current facts before approval; do not simply clear a stale badge. Copy rechecks saved approval/context, and clipboard failure leaves status unchanged. Text already copied outside the app cannot be recalled.
- Open, Answered and Closed are manually selectable. Reply generation/approval/copy is available only for Open inquiries; reopen deliberately to continue. No business claim should depend on an automatically inferred status.

### Acceptance criteria

- Inquiry and reply data survives reload in demo and cloud modes, with no mixing between signed-in accounts or demo/cloud stores.
- Missing IDs, invalid entries and oversized requests fail clearly; anonymous and cross-owner reads/writes fail without disclosing another user's records.
- Unsaved text survives generation/network/clipboard failures. Account changes clear private state and ignore late responses from the previous account.
- Reply edits reset Approved to Draft. Price, condition, title, description, category or inventory status changes invalidate related approvals; inquiry edits do likewise. Photo/listing-copy changes alone do not invalidate replies because those fields are not supplied to drafting.
- Approval, copy and Answered remain separate, deliberate actions. No pending/failed save may enable approval or copy.
- Desktop and phone-size browser flows, keyboard controls and automated accessibility checks pass alongside existing inventory tests. Actual Safari, hosted Auth/Storage and live provider behavior remain separate acceptance checks.

## Branch and review strategy

The owner approved the existing stack with “Merge and commit.” PR 3 (Sites demo) was merged into PR 2's planning branch, PR 2 into the MVP branch, and PR 1 into `main`. The tested application, planning documents and demo support are now on `main`; see the [status record](project-status.md#completed-integration) for exact merge commits.

Future implementation should branch from the latest `main` (for example `codex/buyer-replies`), use a new PR, and obtain explicit approval before its merge. The prior approval applies to the existing release, not future features. Preserve the independent Sites identity and source checkout when updating the hosted demo.

## Maintaining the project

`docs/project-status.md` is the single shared status record. Update it after meaningful work, with date, actual branch/commit, check results, next action and owner dependencies. Keep historical handoff content unchanged. Mark tasks Done only with evidence; a plan is not a passing feature test. Read plans and repository instructions together before implementation.

No Dot connection, scheduled monitor or external task assignment exists. A coordinator can read these documents later; do not imply automatic synchronization. Dependency/secret CI scanning is a separate proposed hardening task, not a prerequisite for this documentation handoff or an already-running protection.

The owner approved merge/deploy and a continuation goal on 30 October. PR #7 is merged; the updated private demo is deployed. New [agent drafting preparation](agent-drafting-stage.md) stays on a separate feature branch. Supabase connection/target and verified restricted runtime remain pending.

Continuation: [owned draft queue stage](owned-draft-queue-stage.md) implements durable draft-only worker capability and shared quota while hosted access is pending. This is part of Tasks 2/4, not completion of event ingestion, outbound delivery, runtime isolation or live acceptance. Next independent work is owner queue controls and the dedicated runtime feasibility harness.

Owner [worker controls](worker-controls-stage.md) are now implemented on `codex/draft-worker-controls`, following PR #9. They expose the existing draft-only RPC without starting a runtime. Next independent work is isolated runtime feasibility; selected Supabase access still gates hosted acceptance.

The [runtime experiment](research/runtime-isolation-probe.md) establishes a synthetic OpenClaw path, but found an internal second model request after a rejected tool. Require a single-use model connection before connecting the restricted runtime; do not treat a successful CLI exit or tool-deny configuration as quota enforcement.

The [single-request drafting stage](single-request-drafting-stage.md) implements the local connection limit and bounded optional OpenAI provider. Next is the production worker process adapter and owned queue wiring, including cancellation/cleanup and validated runtime policy; live inference still requires cloud/model setup.

The [Mac worker stage](mac-draft-worker-stage.md) now wires the queue to a restricted OpenClaw foreground launcher with check/once/watch commands and manual crash recovery. Local synthetic end-to-end acceptance passes; hosted setup, actual model compatibility/usage, revocation under real concurrency and physical-device checks are next. Hermes parity is optional future work, not a prerequisite for this one-runtime pilot. Personal-channel ingestion/sending remains outside the current authorized implementation.

The [durable delivery simulation stage](durable-delivery-stage.md) continues Tasks 2/5 using only synthetic destinations and an in-memory fake adapter over owner-scoped saved inbox records. This work is explicitly allowed by the approved plan before channel access is available. Hosted activation is waiting on owner input, but that dependency does not block this local state-machine/persistence work. No live release or transport is added.

## Seller terms and review continuation — 31 October

The [seller preferences stage](seller-preferences-stage.md) implements the independently useful owner controls from Task 4: general private-reply terms, current saved-question summary and optional in-app Manila-time review reminder. Defaults are blank/off. This extends the earlier manual milestone's deliberate no-settings scope; it grants no automatic sending or negotiation authority. The [usage guide](seller-preferences.md) records cloud setup and limitations. Existing Supabase/channel activation gates remain unchanged. Background/external digests and unattended replies remain deferred pending permitted integrations and owner release decisions.
