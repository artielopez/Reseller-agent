# Reseller Agent project plan

Updated 30 October 2026. [Status and evidence](project-status.md) · [Imported handoff](project-handoff.md) · [Sales-assistant plan](superpowers/plans/2026-10-29-sales-assistant.md) · [Manual buyer foundation](superpowers/plans/2026-10-28-buyer-replies.md)

## Current assignment

The owner confirmed use of a personal Facebook profile and wants both Group comments and private messages captured, processed and answered promptly with minimal engagement. OpenClaw and Hermes on the Mac mini are available resources. The owner subsequently said **“Go ahead and work on it”**, authorizing implementation and account feasibility checks. The [new design](superpowers/specs/2026-10-29-sales-assistant-design.md), [research update](research/personal-account-automation-update.md) and [conditional staged plan](superpowers/plans/2026-10-29-sales-assistant.md) are the current roadmap. The [synthetic buyer lab](buyer-lab.md) and manual inbox were merged and deployed to the private Sites demo on 30 October. Live sending remains disabled and needs a permitted channel and release decision. Native Marketplace replies and a Beeper personal-Messenger bridge are candidates to investigate, not verified integrations for this account. Group comments and Carousell have separate unresolved access gates.

The manual inquiry/review milestone below is retained as a foundation and fallback. Its no-sending boundary applies to that milestone; it does not redefine the owner's newer objective. No existing runtime restriction is relaxed by planning. [Account-specific evidence](research/channel-capability-evidence.md) records the completed desktop check and unresolved mobile/native and integration questions. The [shared manual inbox stage](shared-inbox-stage.md) implements saved questions, draft editing, approval and clipboard copy, merged through PR #7. Its Supabase adapter/migration and local demo are implemented; hosted acceptance is pending. Next: resolve access gates before custom connector investment; cloud outbox and restricted-agent work remain separate milestones. Native replies and custom sending use separate modes; the app cannot promise to pause external native features.

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

The following is the broader target from the handoff. The current [execution slice](shared-inbox-stage.md) implements manual questions and template/manual draft review. Paid AI replies, editable received time, inquiry edit UI and dismiss controls remain deferred; their presence below is a plan, not a completion claim.

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
