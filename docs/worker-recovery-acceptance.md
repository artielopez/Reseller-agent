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

## Recovery procedure

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
