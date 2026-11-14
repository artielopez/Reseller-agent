# Worker recovery acceptance

Plan: [sales assistant Task 6](superpowers/plans/2026-10-29-sales-assistant.md). Scope: loss of connectivity around the existing draft queue, not marketplace sending. Started 3 November 2026 on `codex/worker-recovery-acceptance`, based on `43d9a05`.

## Evidence boundary

`tests/worker-network-recovery.test.ts` uses a real loopback HTTP server and real fetch, the production worker transport/parser and worker loop, and all migrations applied to PGlite. The synthetic bridge executes the production draft RPC as the anonymous worker role. Only its upstream hostname is redirected inside the test; production still requires HTTPS. A deterministic fake model records call count. No account credentials, cloud rows, OpenClaw login, model usage or outgoing messages are involved.

These characterize existing behavior; no production code changed. The tests intentionally destroy the response socket after a SQL operation commits, so the worker cannot know whether that operation succeeded. This exercises uncertainty at the real network boundary rather than merely throwing from a mocked transport.

| Fault                                    | Verified worker result | Durable result                                          | Model calls | Restart behavior                                                                                   |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| Endpoint disconnected before claim       | unavailable            | Job remains queued; no attempt reserved                 | 0           | Operator must restore connectivity and inspect state                                               |
| Claim acknowledgment lost after commit   | unavailable            | Job remains leased; no attempt reserved                 | 0           | Another pass does not reclaim it; after simulated lease expiry, a later claim retires it as failed |
| Attempt acknowledgment lost after commit | failed                 | Job failed; one app attempt remains consumed            | 0           | Another pass is idle; no inference replay                                                          |
| Draft acknowledgment lost after commit   | unknown                | One unapproved Draft and completed job; one app attempt | 1 fake call | Another pass is idle; no duplicate draft or generation                                             |

All four focused cases passed. Lint, type checks and the full suite passed: **225 tests, six optional skips**. A fresh read-only reviewer found no Critical/Important test defects and verified the production SQL/transport boundaries. No build or UI retest was needed for this test/documentation-only increment. These are acceptance/characterization tests, not claims of a newly fixed defect or a RED→GREEN implementation. The earlier normal-generation and installed-runtime checks remain separate evidence.

## Local process lifecycle acceptance — 3 November 2026

`tests/worker-cli-lifecycle.test.ts` compiles the production CLI and launches actual Node processes with a fresh private state directory and an explicit synthetic environment. A preload replaces only fetch and denies any destination except the fake queue. The installed OpenClaw path is deliberately absent; no normal account configuration is read. These are actual OS-signal/CLI/lock checks with synthetic transport, not hosted or model tests.

- SIGTERM after an idle claim: CLI exits normally, releases its lock, and a new once process can start and claim only once.
- SIGINT while an empty-queue response is pending: the CLI drains that response, exits normally and releases its lock without polling again.
- SIGKILL after an idle claim: the exact lock and owner metadata remain; a new process exits with failure before making any request. The test removes only its fixture after both process close handles establish termination. This is explicit test cleanup, not an automatic recovery feature.
- A separate production `runProcess` test aborts an active leader and descendant that both ignore SIGTERM. Escalation removes both PIDs before returning a safe failure.

All eight focused process/CLI tests passed (four new cases). No production behavior changed. The initial checks found an unused test import and a circular inferred test type, both corrected. Final lint/type checks and the full suite passed: **229 tests, six optional skips**. A fresh read-only review found no Critical/Important defects; no build/browser rerun was needed for this test-only increment. Physical restart/sleep, killing a parent during actual inference, real provider expiry and cleanup of an interrupted real run remain separate acceptance gates. The CLI cases deliberately have no claimed work; they do not prove cancellation of an admitted provider request.

Ruling: execute the existing process contract as characterization/acceptance, without weakening production code to create a failing baseline. Failure to cover a real runtime phase remains an explicit limit rather than permission for unattended startup.

## In-flight owner changes — 4 November 2026

Four additional cases use the same actual loopback HTTP transport, production
worker/drafting logic and fully migrated PGlite database. The synthetic model
waits after the shared attempt is reserved. While it is pending, the owner pauses
the queue, revokes its enrollment, cancels the job, or changes the item's price.
The model then returns its now-invalid output.

All four cases verify that the worker stops without another poll, submits no
reply, retains exactly one consumed app attempt, and does not invoke the model
again on a deliberate later run. Pause/revoke/cancel preserve the canceled job;
changed facts leave a failed job. Every case has zero saved replies. Real owner
RPCs are used for queue controls and the worker resumes under the anonymous role.

These are characterization/acceptance tests of existing behavior, not a newly
implemented cancellation feature. The synthetic model is allowed to finish:
there is **no claim that pause or revoke cancels an admitted provider request or
refunds its usage**. Concurrent hosted transaction lock orderings, physical
restart and actual provider cancellation remain separate gates.

Focused HTTP recovery suite: **8 passed** (four prior faults plus four new
in-flight cases). Full suite: **292 passed**, six optional skips; lint/type checks
pass. No production code, schema, credentials or cloud data changed, so browser
and production-build suites were not rerun for this test/documentation increment.

## Recovery procedure

The later [parent-crash fix](worker-parent-crash-recovery.md) addresses loss of the process-launcher caller during active synthetic work. Its independent supervisor drains the target group; physical/provider failures and retained run-directory/lock inspection remain separate requirements.

1. Stop the foreground worker. Subscription mode supports one pass only and must not be installed as an automatic watcher or login service.
2. Open Inbox → Worker settings → Reload worker settings. If state cannot be loaded, leave work stopped. Do not repeatedly press enroll or queue in response to an ambiguous failure.
3. For a completed job, inspect its saved draft. An `unknown` local outcome can still mean a successful database save. Do not queue the same question again merely because acknowledgment was lost.
4. For a leased job, let its lease expire and reconcile its state before deciding whether a new attempt is needed. Expiry alone does not update its displayed status, and Reload worker settings does not retire it. A later worker claim retires the expired job instead of replaying it. Keep work paused until the operator can identify that exact stale job; never resume an unattended loop merely to clear it. A consumed app attempt is not proof that the model produced an answer, nor is it a bill.
5. For failed/canceled jobs, review the reason and current facts before deliberately creating another job. Pause/revocation do not revive canceled work.
6. Check the installed-runtime preflight, matched account, included allowance, zero credits and auto-reload setting again. Use a new short-lived attestation and the exact reviewed input hash for any later subscription trial.
7. After a supervised trial, pause the queue and revoke its temporary enrollment. Inspect and clean only that worker's lock/run directory after confirming its processes have stopped; never delete a lock solely because it is old or a PID appears absent.

## Still required

Physical Mac restart/sleep and external connectivity loss; actual provider session expiry; remaining hosted races (the [one-job claim/start/identical-submit concurrency cases](hosted-concurrency-acceptance.md) have now passed); alert deduplication; two-user device acceptance; and permitted platform intake/delivery. Do not represent local network tests as proof of those scenarios or enable unattended operation from these results.

## Execution ledger

- Task 6 partial: four network-fault characterization cases added and passed, without production changes or inference.
- Ruling: characterize the existing recovery contract rather than deliberately weaken production behavior to manufacture a failing baseline. Cost if wrong: an untested external or process boundary still needs separate acceptance; the evidence boundary above states those gaps.
- Research follow-up: official Beeper Desktop API, Meta native Marketplace replies, Carousell PH auto-replies and Supabase multi-organization token documentation rechecked. No new permission or account capability was established. The owner explicitly approved the concrete Beeper support inquiry; Gmail confirmed it sent. A response is pending.

- Final review: clarified that only a subsequent claim retires an expired lease. The reviewer marked this minor; treated as an important operator-recovery ambiguity because waiting/reloading alone cannot clear it. The existing claim-loss test exercises the exact retirement behavior; no production fix was needed.
