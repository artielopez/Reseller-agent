# Stale-conflict retry-loop fix — 3 November 2026

Branch `codex/non-retryable-conflicts`, based on `a477bc8`. This defect was found while completing hosted concurrency acceptance, not by changing the product scope.

## Observed failure and cause

A synthetic worker submission raced an owner changing the item price. PostgreSQL rejected the stale context, but the HTTP call timed out instead of returning the conflict. Narrow, metadata-only logs showed repeated custom `40001` errors from `draft_worker` under **PostgREST 14.18**. They also revealed a separate existing `buyer_workspace` request repeatedly raising the same code. No request body, buyer text, key or source query was read into the report.

Supabase documents that custom `40001` business exceptions can cause an infinite transaction-retry loop in PostgREST 14, and recommends a normal exception or an HTTP-specific code such as `PT409`: [official troubleshooting article](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions).

This differs from actual database serialization failures, which PostgreSQL may legitimately report. Our app used that reserved code for stale revisions, contexts and conflicting retries. Repeating those operations cannot resolve their stale inputs.

## Fix

Incremental migration `20261102202606_non_retryable_conflicts.sql` changes only explicit custom `errcode='40001'` assignments to `PT409` in `buyer_workspace`, `draft_queue`, `draft_worker` and `seller_workspace`. The optional `delivery_simulation` function is updated only when installed. The migration preserves each current function body, ownership, ACL and configuration; prior migrations are not rewritten, and no rows or access rules are changed.

The three app adapters recognize both codes, preserving compatibility with older databases and giving the existing reload/review instructions. The worker's direct HTTP transport already avoids retries. Inspection and behavioral tests also confirm the **installed** Supabase JavaScript client does not replay POST RPCs after 409, 503 or a network failure; those tests passed before the fix. Its configuration is therefore unchanged. A broader online client-retry description did not match the installed implementation and was not used to justify an unnecessary change.

The official changelog was checked before release. No SDK/server upgrade or unrelated infrastructure change was made.

## Verification

- Regression tests failed first on legacy conflict codes and missing `PT409` guidance, then passed after the migration and adapter changes.
- The migration test covers all five RPCs locally, an actual stale queue command without mutation, and required-RPC privilege/configuration preservation during the replacement path when the optional simulation is absent. A reviewer noted the original privilege test only reapplied an already-current migration; it was strengthened to restore legacy definitions before replacement, and passed.
- Legacy/new conflict responses retain actionable buyer, seller and worker messages. POST RPC count remains one on 409, 503 and disconnection.
- Full lint/type checks, **236 tests** (six optional skips) and the production Webpack build passed. Initial test-only TypeScript narrowing and parallel database-fixture timeout issues were corrected; the latter uses a bounded 15-second test setup allowance, not a production timeout change.
- Independent review found no Critical/Important defects. Final browser/error-guidance and publication results are recorded in the release follow-up below.

## Hosted acceptance

The migration applied successfully as remote `20261102203123`, name `non_retryable_conflicts`. Read-back shows all four installed RPCs use `PT409`, none contains the old custom code, and their definer/search-path/execute grants match the prior snapshot. The optional delivery simulation remains absent. The previously looping inbox backend was no longer present on follow-up; **no cancel/terminate command or project restart was issued**.

Actual separate SQL and HTTP sessions overlapped, proven by PostgreSQL blocking-PID observations:

| Race                                                                   | Result                                                 | Persisted state                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| Pause before competing attempt admission                               | HTTP 401 / `42501`                                     | Canceled; zero attempts/replies                                          |
| Revoke before competing attempt admission                              | HTTP 401 / `42501`                                     | Revoked/canceled; zero attempts/replies                                  |
| Price change before competing submission                               | HTTP 409 / `PT409` after the held transaction released | Price 900; stale draft rejected; one prior app reservation; zero replies |
| Listing reservation takes the last shared slot before worker admission | HTTP 200 / `admitted: false`                           | Exactly 20 app reservations; worker attempt not started; zero replies    |

Pause/revoke passed before the code change. Stale submission reproduced the server failure; rerunning it after the migration passed. The quota case then passed. A narrow post-fix log window contained exactly one `PT409` from the synthetic stale submission and no `40001` entries. The deliberately held transaction accounts for the few seconds spent waiting; this is not a latency benchmark.

Every case used its own marked synthetic owner with no login/email, private short-lived worker capabilities and a retained peer process handle. Cleanup confirmed zero fixture rows in all nine checked tables and removed the mode-600 input file. No model, real inventory mutation, platform access or buyer sending occurred. The app attempt counter is not a provider charge.

## Reproduce and remaining limits

Use the existing [hosted concurrency procedure](hosted-concurrency-acceptance.md), replacing `held-session.sql` with `held-owner.sql` and selecting one of `pause`, `revoke`, `edit`, `quota`. Claim the synthetic job first. Admit an attempt before the edit case; reserve exactly 19 synthetic app attempts before the quota case. The delayed peer calls `start`, or identical synthetic `submit` for edit. Expected HTTP failures have peer exit code 1; distinguish those JSON responses from a transport timeout. Observe contention and verify durable state before guarded cleanup. Never blindly repeat an uncertain real request.

These cases validate the stated orderings, not every possible race or cancellation of a model already in flight. Reverse-order operations can already have committed before Pause; physical recovery, actual provider expiry, devices and permitted platform access remain separate gates.

## Release follow-up

Database and matching client fix are live. Sites version **7** was published successfully from pushed source `83965a590f3e1a1e5a3d50f0a2bea2f0af999dfc`, built from GitHub implementation `4ee55f0`. Deployment `appgdep_6ae8f502f74c819189ae2ac72a13031e` succeeded at 20:39 UTC on 2 November (3 November Manila). Read-back confirms version 7 and the unchanged custom audience: Artie owner, Janyl viewer.

Two local desktop/mobile stale-pause browser checks passed, alongside the hosted database checks above; this publication does not imply a new authenticated production browser session or full device acceptance. [PR #25](https://github.com/artielopez/Reseller-agent/pull/25) contains the reviewable implementation and evidence. No GitHub merge or auto-merge was performed.
