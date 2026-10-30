# Personal Sales Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task only after implementation is requested. Steps use checkbox (`- [ ]`) syntax for tracking. The owner later authorized implementation with “Go ahead and work on it.” This document itself grants no account connection, sending, deployment or merge permission. See the execution update below.

**Goal:** Progress toward automatic intake, processing and routine replies for the owner's personal resale conversations, with human attention reserved for exceptions and explicit coverage limits.

**Architecture:** Reuse the inventory app and Supabase ownership boundary; introduce a durable message/outbox workflow and one outbound Mac mini worker. A restricted OpenClaw or Hermes profile drafts; deterministic application rules authorize any delivery. Native platform replies are evaluated first; each custom connector is conditional on access and compatibility evidence.

**Tech Stack:** Existing Next.js/TypeScript/Tailwind/Supabase, TypeScript Mac worker, existing Vitest/PGlite/Playwright, optional documented Beeper API. New dependencies and hosting are chosen only after the access checkpoint; do not install during planning.

**Spec:** [Personal resale assistant design](../specs/2026-10-29-sales-assistant-design.md). [Research update](../../research/personal-account-automation-update.md) supplies evidence and limitations.

## Global constraints

- Execution is authorized. Only evidence-backed individual steps may be marked complete; the synthetic vertical slice does not complete the cloud/worker tasks.
- No scraping, unauthorized message access, private endpoint reverse engineering, stealth techniques or automatic sending before a permitted channel and explicit release decision exist.
- Credentials remain outside Git, frontend bundles and logs. Buyer text is untrusted.
- Demo remains labeled, browser-local and credential-free; sends are simulated.
- Preserve owner-scoped records, revision invalidation and additive migrations. Do not rewrite applied migrations.
- Preserve the initial 20 paid attempts per owner/day in Asia/Manila, shared across listing, reply and paid agent calls; templates require no paid generation. A future increase requires an explicit cost decision.
- Read the installed Next.js guides under `node_modules/next/dist/docs/` before app code changes. Verify APIs against installed agent versions before writing adapters.
- Keep changes on `codex/` feature branches with reviewable PRs. No merge or auto-merge without owner approval.

## Review focus

1. A new personal chat has no trustworthy item ID: quarantine rather than send using a guessed match (Tasks 2, 3).
2. The owner/native responder answers or stock changes after drafting: invalidate queued work and recheck before dispatch (Tasks 2, 5).
3. A send succeeds remotely but its response is lost: mark unknown, reconcile, and never blindly retry (Task 5).
4. A Group comment contains private details or is mistaken for a DM: reject public disclosure and validate destination type (Tasks 4, 5).
5. A Mac reconnect misses events or replays a backlog: reconcile cursors, deduplicate, expire stale responses and show actual coverage (Tasks 3, 6).

## Order and scope gates

Task 1 is the first assignment. It produces a go/no-go report before connector code. Tasks 2 and 4 can be developed with synthetic fixtures after approval even when some channels remain unavailable. Task 3 implements only a connector whose access checkpoint has passed. Task 5 can be tested against a fake sender but live delivery remains disabled. Task 6 admits one channel at a time; no release can represent unavailable channels as complete.

The [earlier manual buyer plan](2026-10-28-buyer-replies.md) remains useful for domain schemas, reviewed drafts, RLS/revisions, demo persistence and clipboard fallback. Before implementing Task 2, reconcile its tables/RPCs with the message/outbox schema below in one migration design. Do not implement both plans independently or drop the existing manual safety properties. Its manual-only sending scope applies to that fallback, not the newly proposed long-term objective.

## Proposed file responsibilities and contracts

Paths below are planned, not present functionality. Migration timestamps must be chosen after inspecting then-current migrations.

- `src/lib/buyer/domain.ts` and `src/lib/buyer/repository.ts`: prior manual workflow and owned facts.
- `src/lib/automation/domain.ts`: `CapturedEvent`, `ConversationRef`, `SellerPolicy`, `ReplyCandidate`, `DeliveryOutcome`, validation and revision keys.
- `src/lib/automation/policy.ts`: `evaluateReply(context: DecisionContext): Decision`, returning `ignore`, `review` with reason, or `template` with template ID and validated fields. No network/agent calls.
- `src/lib/automation/repository.ts`: owner-bound event ingestion, leasing, draft/context revision checks, outbox transitions and pause controls.
- `src/lib/automation/agent.ts`: `DraftProvider.generate(context: DraftContext): Promise<DraftResult>`; validated text, reason and usage, with no delivery capability.
- `src/lib/automation/worker-auth.ts` and `src/app/api/worker/[operation]/route.ts`: narrow worker enrollment, owner binding, revocation, job claim/result/heartbeat and capture submission. Never proxy arbitrary Supabase or agent commands.
- `worker/src/main.ts`, `worker/src/adapters/beeper.ts`, `worker/src/adapters/notifications.ts`, `worker/src/agent-client.ts`, `worker/src/outbox.ts`: process lifecycle, permitted adapters, restricted inference and single delivery executor. Do not create a browser connector until its separate gate passes.
- `src/components/buyer-inquiries.tsx`, `src/components/reply-editor.tsx`, `src/components/automation-settings.tsx`: exception queue, supervised response review, source links, rules and pause/takeover controls, integrated into existing `workspace.tsx`.
- `tests/automation-*.test.ts`, `e2e/automation.spec.ts`, `tests/fixtures/buyer-events/`: synthetic tests and evaluation cases; never commit real chats.

`ConversationRef` distinguishes `dm` from `group_comment` and includes channel, source account and thread ID; comments additionally require post and parent/comment IDs. `CapturedEvent` carries source message ID/revision, direction, timestamp, completeness, body and optional verified listing reference. Ownership comes from authenticated worker enrollment, never from an event's supplied owner ID. `ReplyCandidate` binds exact destination/text to message/item/policy revisions and authorization source (human or released rule). `DeliveryOutcome` is `submitted`, `confirmed`, `unknown` or `failed`, with external IDs/evidence when available. Persist IDs as opaque strings; revisions as decimal strings, not lossy JavaScript numbers.

### Task 1: Establish account-specific feasibility without building

**Files:** Create `docs/research/channel-capability-evidence.md`; update research, design and tracker.

**Produces:** Per-channel capability record: permission basis, allowed operations, account/region, source completeness, item IDs, public/private destinations, acknowledgment semantics, native responder visibility and blockers. No credentials in the report.

- [x] Check Marketplace native availability replies on the owner's account in an authorized read-only desktop session; no toggle or publishing. No seller AI control was visible on the inspected surfaces; mobile/later-stage eligibility remains unverified. See account evidence.
- [ ] Confirm Carousell account type, relevant email examples and native-reply eligibility. Draft any support questions about authorized integration for owner review; do not send them without instruction.
- [ ] Establish Beeper/Meta access basis before a live integration; confirm API entitlement, local/cloud connection mode, Marketplace/message-request and listing-ID support. If testing requires installation/account connection, make that a separately described future pilot rather than silently expanding a read-only check.
- [ ] Record the local agent versions, available restricted execution interfaces and retention controls. Hermes version check currently fails on an install lock; resolve only if authorized later, not by broad permission changes. Do not inspect unrelated memories/private chats.
- [ ] Compare options and mark each read/send/comment operation verified, unavailable or unverified. If dependable authorized personal-message access cannot be established, recommend native replies plus partial assisted handling; stop custom connector investment.
- [ ] Obtain the owner's business-rule choices before a live reply pilot; persist exact approved terms, not inferred discount or meeting permissions. Commit evidence and revised design for review.

### Task 2: Build the owned queue and seller controls using synthetic data

**Files:** Create automation domain/repository/worker-auth, an additive migration, `tests/automation-domain.test.ts`, `tests/automation-database.test.ts`, `tests/automation-auth.test.ts`; integrate prior buyer foundation where needed.

**Interfaces:** `ingestEvent(enrollment, event)`, `claimJob(enrollment, leaseId)`, `recordCandidate(jobId, expectedRevisions, candidate)`, `setConversationMode(owner, ref, mode)`. A lease is scoped to the enrolled owner and capability; expired/revoked leases cannot submit work.

- [ ] Write failing tests for cross-owner IDs, forged worker ownership, duplicate/upsert/delete events, unknown listing binding and account change. Assert stable-event uniqueness and that ambiguous bindings never become sendable.
- [ ] Run focused tests and verify failure because the new interfaces/schema do not exist.
- [ ] Implement additive owned tables for channel connections, sale thread/post links, message versions, seller policies, jobs, outbox and audit metadata. Reuse existing inquiries/replies as their reviewed UI representation; record an explicit mapping, do not duplicate content without a reason. Add RLS, revision checks, unique keys and transactional leasing. Worker tokens are hashed, revocable, limited to owner/capabilities; no Supabase service-role key on the Mac.
- [ ] Add tests for pause/revocation, stale item/message/policy revisions, simultaneous claims, and no automatic transition from copying to Answered. Implement those guards.
- [ ] Run focused tests, existing database/repository tests and type checks. Commit the foundation with all delivery disabled.

### Task 3: Add one permitted intake adapter and completeness tracking

**Files:** Create Mac worker lifecycle and the selected adapter, worker route, `tests/automation-intake.test.ts`; use synthetic fixtures first.

**Interfaces:** `IntakeAdapter.reconcile(cursor): Promise<CaptureBatch>` where a batch includes events, next cursor, completeness and health; optional `subscribe(onEvent)` is an accelerator, not the source of truth.

- [ ] Write failing tests for duplicate/reordered events, reconnect gaps, edited/deleted questions, unrelated chats, hidden message requests, missing listing metadata and incomplete notifications. Assert incomplete intake cannot authorize a reply.
- [ ] Run focused tests; implement only the Task 1 approved adapter behind a default-off capability flag. For Beeper, verify the current documented SDK version, use cursor reconciliation and scoped subscriptions; never subscribe the AI to the entire personal inbox.
- [ ] Separate candidate discovery from enrolled sale-thread processing; never cloud-upload unrelated chat text. Require owner mapping if trusted listing IDs are absent. For notifications, parse only an explicitly authorized sender/folder and preserve partial-coverage labels; do not follow arbitrary embedded links or treat email as permission to send through the source platform.
- [ ] Run fixture tests and restart/reconnect tests. Commit with live collection off; enabling a permitted read-only pilot belongs to Task 6.

### Task 4: Implement deterministic routine replies and restricted drafting

**Files:** Create policy and agent interfaces, worker agent client, `tests/automation-policy.test.ts`, `tests/automation-agent.test.ts`, seller-settings and exception components, `e2e/automation.spec.ts`.

**Interfaces:** `evaluateReply` and `DraftProvider.generate` as above; provider returns a schema-validated draft or failure, never a send instruction. Persist settings through owner-authenticated mutations with revisions.

- [ ] Write failing tests covering price/condition facts, stock confirmation older than 24 hours, mixed intent, unknown measurements, Tagalog/English questions, negotiation, exact-address requests, prompt injection, links and public/private data separation. Assert uncertain inputs enter review and monetary amounts remain exact.
- [ ] Implement fixed routine templates and rule validation; AI-only classification cannot authorize dispatch. Add an optional isolated OpenClaw draft adapter first, Hermes only after its tool/retention checks pass. Test that no shell, browser, sending or configuration tool is reachable and no other buyer's memory is available.
- [ ] Enforce a common generation budget, bounded input/output, deadline and loop limits; templates on explicit fallback only. Test malformed outputs, agent unavailable, unknown usage, exhausted quota and expired context. Do not assume an API's `store: false` suppresses local agent transcripts.
- [ ] Implement mobile exception review with Approve, Edit, Take over, source link and reason. Add daily digest settings but no external notification channel until separately selected; keep in-app alerts usable. Test keyboard/axe, failure recovery and stale approvals.
- [ ] Run focused tests, affected prior buyer tests, type/lint and browser checks. Commit; all buyer sends remain disabled.

### Task 5: Build and test a single controlled outbox

**Files:** Create worker outbox and a fake delivery adapter, `tests/automation-delivery.test.ts`; extend repository and worker routes. A live adapter is allowed only after its permission gate, and is disabled until release.

**Interfaces:** `DeliveryAdapter.submit(candidate): Promise<DeliveryOutcome>` and `reconcile(candidate, externalId?): Promise<DeliveryOutcome>`. Worker claims carry fencing tokens; external APIs that do not support idempotency cannot be promised exactly-once delivery.

- [ ] Write failing tests for two workers, retry after successful-send response loss, native/owner reply since draft, price edit, deleted comment, wrong destination kind, paused thread, global pause, expired lease and stale backlog. Assert at most one dispatch claim and no retry of an unknown result.
- [ ] Implement persisted states and revision/policy checks immediately before submission. Use one sender per conversation; disable automatic transport/SDK retries for sends. Require explicit external evidence for confirmation; pending or ambiguous acknowledgment remains submitted/unknown, never “sent successfully.”
- [ ] Enforce the proposed 15-second debounce, three automatic replies/thread/hour ceiling, no proactive follow-ups and no automatic comment-to-DM initiation. These are application constraints, not platform permission evidence.
- [ ] Test exclusive native/custom operating modes: native-enabled scope rejects custom dispatch; switching requires confirmed native disablement. Show native features as externally managed, and make Pause clear that it cannot stop platform-native replies without a verified control API.
- [ ] Test crash before/after submit and before confirmation recording. Reconcile uncertain sends without guessing from identical text alone; unsupported reconciliation escalates and freezes the thread. Test Pause acknowledgment and show any in-flight delivery that cannot be recalled.
- [ ] Run delivery/database/owner-isolation tests and full regression checks. Commit the simulated outbox; do not enable production sending.

### Task 6: Validate real operation and release incrementally

**Files:** Create `docs/automation-acceptance.md` and `docs/automation-operations.md`; update README/checklist/status. Add narrowly scoped startup configuration only when implementation/deployment is requested.

**Produces:** Evidence tied to actual source commits, per-channel release decision and measured owner workload.

- [ ] Verify authenticated hosted app/Supabase with two-owner isolation and physical iPhone/Windows use. The current static Sites demo cannot substitute for worker/backend acceptance.
- [ ] Test Mac restart, login/sleep, loss of internet, expired account session, revoked token, budget exhaustion and outage alert deduplication. Keep local ports private; never publish the general agent gateway.
- [ ] Run the design's read-only pilot: seven days and at least 30 verified events, extend for low volume; compare with source-platform observations. Measure missed messages and first-item-mapping burden. No sending.
- [ ] Run supervised sending only after separate authorization and permission/capability evidence. Review at least 30 responses; verify public comments independently of DMs. Record duplicates, wrong destinations, factual errors and unknown outcomes.
- [ ] Present measured coverage, owner minutes, latency and cost with remaining gaps. Request a specific release decision for routine templates on a named channel. No escalation to negotiations, payments or reservations.
- [ ] If approved, activate a narrow release, verify a kill switch and review daily for its first week. Keep unmatched/partial/uncertain cases in review. Failed access or reliability gates leave the affected channel disabled, not silently replaced by browser automation.
- [ ] Commit actual verification results and a reviewable PR; merge only on owner approval. Document rollback: disable sender, revoke worker token, reconcile in-flight actions, retain manual source links.

## Review result and next action

Planning is complete as a conditional staged proposal; access feasibility remains unproven. The design is not a live integration result. Native execution task-by-task is the default proposed approach for this small codebase; no runtime agents or monitors were started. Owner authorized execution after planning. Task 1 desktop checks and a synthetic vertical slice are recorded in [execution progress](../../implementation-progress.md). Do not jump to installing Beeper, connecting personal accounts or enabling agent APIs.

## Execution update — 29 October 2026

[Account evidence](../../research/channel-capability-evidence.md) and the [buyer lab](../../buyer-lab.md) are prepared on `codex/buyer-foundation`. Tasks 2, 4 and 5 are **partial**: browser-local validated events, narrow templates, editable private drafts, policy controls and simulated outbox only. The owner-scoped Supabase queue/migration, worker enrollment and daemon, agent isolation, external connectors and live acceptance remain unimplemented. Task 3 and live parts of Tasks 5–6 are blocked by unresolved permitted access. Existing manual buyer cloud/copy workflow is still planned. No plan checkbox claims these broader tasks complete.

## Execution update — 30 October 2026

PR #7 merged and the existing private Sites demo was updated after owner approval. Saved manual inquiry/draft/approval/copy workflow is implemented. [Draft preparation](../../agent-drafting-stage.md) adds a provider-neutral boundary, and [owned drafting queue](../../owned-draft-queue-stage.md) adds the draft-only portion of Tasks 2/4: hashed expiring enrollment, owner pause/revocation, exact-context leases, shared allowance and review-draft persistence. No live runtime or daemon is connected. Event ingestion, connection/thread mapping, seller policies, true outbound outbox, native-mode coordination and hosted/device acceptance remain incomplete; the draft queue is not a substitute for those requirements. Owner Supabase connection/target is pending, but local queue UI/runtime harness work can continue.
