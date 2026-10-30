# Owned drafting queue — execution stage

Continuation of Tasks 2 and 4 of the sales-assistant plan. This stage makes the provider-neutral draft boundary usable by a narrowly enrolled worker, without granting inbox access or sending. Supabase deployment still needs the selected project and owner connection; local database verification does not need credentials.

## Contract

- Reuse saved `buyer_inquiries` and `suggested_replies`; a drafting job references one private Open inquiry and an immutable server-derived context snapshot. No duplicated conversation store.
- Add owner controls (paused by default), worker enrollments (random 256-bit token, stored hash only, expiry/revocation) and leased draft jobs. Tokens grant claim/context/start/submit/fail only; no arbitrary database, inbox, approval or sending operation.
- Owner RPC: list, enroll, revoke, pause/resume, enqueue and cancel. Worker RPC: claim, current context, reserve one paid attempt, submit one review draft or fail. Ownership comes from authenticated owner or hashed enrollment, never command fields.
- State → worker → item → job lock order. Claim lasts 60 seconds. Expired claims fail without automatic retry. No renewed lease, reclaimed generation, or automatic replay after ambiguous provider work.
- Start reserves the existing 20-attempt Manila-day counter, shared with listing generation. A repeated start does not authorize another call. Invalidated context, pause, expiry and revocation reject work. Successful submit creates a Draft, never Approved/Answered. Idempotent exact-result retries return the same draft.
- Public comments remain manual/template only. Queues are private by RLS, direct writes revoked, worker hashes never listed. No service-role key, platform adapter, live worker or HTTP gateway is installed here.

## Scope ruling

Build durable manual-inquiry drafting first; event ingestion/connection tables, outbound delivery, native-mode coordination and daemon lifecycle remain subsequent parts of Tasks 2/3/5. Their permission-dependent interfaces cannot be replaced by this draft-only credential. Cost: later additive migrations remain necessary, but existing saved inquiries/drafts and ownership boundaries are reusable.

## Tests and acceptance

Test two-owner/anonymous isolation, forged owner fields, hash secrecy, default pause, expiration/revocation, simultaneous claims, context changes before start/submit, separate copy/Answered, shared quota, repeated start, idempotent submit, expired claims without replay, malformed payloads and public destination rejection. Add the previously deferred post-generation stale-context regression before worker wiring. Full lint/types/tests/build and one independent review precede PR delivery.

## Implemented interfaces

- `draft_queue(command)` requires the existing owner session. `list` returns paused/revision, workers without secrets, and the latest 100 jobs. `enroll` takes a label and returns a new token once (seven-day expiry, at most five active workers). `revoke` takes a worker ID. `pause` requires the current revision string and cancels pending jobs when pausing; resuming does not revive canceled jobs. `enqueue` takes a client UUID and owned inquiry ID; duplicate active jobs resolve to the existing job. `cancel` takes a job ID.
- `draft_worker(worker_token, command)` accepts only the enrolled capability. `claim` returns one lease/context or null. `context`, `start`, `submit` and `fail` require job and lease IDs. `start` returns `admitted: true` only once and only when the shared allowance permits. `submit` takes body/review_reason; successful repeated identical submissions return the same reply ID. No context rebasing or approval occurs.
- `createWorkerTransport` calls that fixed RPC with operator-configured HTTPS project URL, public anon key and draft token; never a service-role key. It rejects redirects, bounds request/response size, uses a ten-second network timeout and makes no automatic retries. These configuration inputs must never come from buyer text or a public request.
- `runDraftJob` runs one job with a separately verified injected runtime through `prepareAgentDraft`. It returns idle/completed/failed/unknown/unavailable. An uncertain submission is not repeated or marked delivered. There is no polling service or automatic runtime connection.
- Agent results appear in the existing inbox as “Agent draft — review required,” with their review note. Copy remains disabled until explicit approval; marking Answered remains separate.

## Operational limits

Database locking/role tests run in PGlite, which serializes its local connection; repeated concurrent call tests verify state transitions but do not substitute for separate-session hosted contention testing. No live Supabase migration or real agent invocation has occurred. An expired lease fails and remains visible; the owner must deliberately create a new job after reviewing the prior outcome. An already started provider request may still consume its reserved attempt when canceled; pause cannot recall an external in-flight inference.

Worker RPCs are callable using the public project key, but require the separate high-entropy enrollment token and establish owner from its hash. They are not a public model endpoint and have no send operation. Stolen worker credentials could read claimed job facts and consume the owner's remaining daily allowance until revoked or expired. Keep the token only in protected Mac configuration; never put it in browser code, Git, URLs or logs.

The previously deferred post-generation changed-context test now uses original context before generation and changed context afterward, and asserts the provider was invoked once. The regression passes.

## Review and verification

Independent review found two Important issues. Both were corrected before PR delivery:

- Final: fixed transaction-time expiration checks — lease admission, token expiry and result-submission tests first reproduced acceptance after actual expiry, then passed with `clock_timestamp()` checks after locks and before committing admission/results. Quota admission rolls back if its wait outlasts the lease; claim lifetime starts from current wall time and is capped by token expiry.
- Final: fixed expired-job cleanup lock inversion — a static lock-order regression first failed because a job UPDATE preceded the item lock. Cleanup now selects one candidate, locks its item and then its job, and only then changes expired state. The regression and behavioral expired-claim test pass. No real multi-session PostgreSQL service is available locally, so this is structural plus functional evidence, not an empirical deadlock reproduction.
- Final: minor (deferred): a pass that retires one expired/stale job returns no claim even when other jobs remain. `idle` means no draft admitted on this pass, not proof that the queue is empty. A future polling daemon must continue polling or expose a separate maintenance outcome; cost is another metadata call per retired job, with no model call.
- Final: Ruling: PGlite serializes its connection. Source-level lock-order verification and queue transition tests are sufficient for the review branch, but separate-session hosted contention acceptance remains required. Cost if wrong: transaction abort/retry behavior may remain undiscovered before hosted acceptance.
- Final: Ruling: hosted Supabase/PostgREST and migration compatibility are not established without the selected connected project. No live migration or service credentials were used. Cost if wrong: setup may need correction before production use.
- Final: Ruling: provider isolation/retention, live runtime behavior, enrollment UI and daemon operation are not claimed by this foundation. Keep runtime integration disabled until their later implementation and acceptance. Cost if wrong: enabling a general gateway prematurely could expose personal data or bypass resource limits.

Before review fixes: 108 unit/API/database tests, lint/types, Webpack production build and all 36 desktop/iPhone-size browser checks passed. The four new review regressions are included in the final suite recorded in the project status. Default local Turbopack remains blocked by the worktree's sandbox port restriction; CI continues using the normal build command.
