# Durable delivery simulation — execution stage

Branch `codex/durable-delivery-simulation`, based on `cd67914` (PR #13). The previous goal turn made implementation/review/delivery progress. Final PR #13 CI and deployed demo status were revalidated; Supabase remains unavailable. The full plan's Tasks 2/5 explicitly permit durable synthetic outbox work without a channel adapter, so cloud activation is not a blocker to this independent work.

## Scope and contract

Implement an additive, owner-authenticated database simulation of controlled delivery. Do not connect a real sender, add a network delivery adapter, reuse draft-worker credentials for delivery, or reinterpret manual inbox approval as permission to send. Existing inventory, inquiry and reply records supply content; explicit simulation commands bind them to synthetic account/thread/message destinations. Keep the existing browser-only lab intact.

- All new namespaces and RPCs explicitly say simulation; external account/message IDs must begin `synthetic:`. No `live` mode or anonymous capability.
- Reuse existing owned item/inquiry/reply data. Duplicate only the immutable candidate text/context needed to audit precisely what the fake sender received. Source metadata stays separate; revisions are decimal strings at the interface.
- Global paused control plus per-thread native/takeover controls. Each change increments a revision and invalidates unsubmitted candidates. Native-to-custom simulation switching requires an explicit confirmation that native mode was disabled; no real platform setting is changed.
- Source binding links one saved inquiry to one exact synthetic destination/message identity. Unmatched items, incomplete/deleted sources, mismatched public/private destinations and owner/native activity block dispatch. Source edits invalidate candidates; unknown submissions freeze the thread even if the underlying inquiry changes.
- Queue exact reviewed reply/context with a separate explicit simulation action. Claim returns one fence/lease. Start rechecks every context/control/destination and durably marks submitted before the fake adapter is called. No automatic requeue of an expired claim or submitted/unknown result.
- Use database wall clock: 15-second debounce, 24-hour backlog cutoff, three template simulations/thread/hour. Public comments support only the exact public-safe price template; custom public text is rejected. No new approved sales terms.
- Outcomes are synthetic submitted/confirmed/unknown/failed; confirmed requires exact synthetic external evidence. Unknown cannot be retried. Reconciliation accepts only evidence tied to the exact simulation ID and destination; matching text is not enough. Pausing cancels pending/claimed work but cannot recall a submitted fake operation.

## Interface pre-flight

| Producer → consumer | Contract / ruling |
| --- | --- |
| Existing buyer RPC → simulation queue | Owned inquiry/reply IDs and context revisions; normal inbox approval remains clipboard-only. A separate simulation enqueue is mandatory and never grants real delivery authority. |
| Simulation queue → fake executor | Opaque simulation ID, lease token, exact destination/text; executor durably starts once before calling its in-memory adapter. No HTTP adapter or worker-token grant. |
| Fake outcome → database | Exact candidate identity and synthetic evidence; unknown remains frozen across process restart. No blind resubmit. |

Ruling: implement this stage as a server-persisted simulation over the existing inbox, not a connector or a second buyer-content store. The cost is that real captured-event ingestion and a released delivery transport still require their own permission-gated integration. This advances the approved fake-sender tests without presenting manual input as complete platform coverage.

## Execution steps

1. Write failing database tests for owner isolation, exact synthetic identity and explicit enqueue; add migration and scoped RPC.
2. Add fenced claim/start/outcome/reconciliation transitions and tests for stale facts, duplicate workers, pause/native/takeover, edited/deleted/incomplete sources, wrong surface, lost acknowledgment and restart.
3. Add a strictly in-memory fake executor and adapter-level tests. Extend setup/status/acceptance documents; no live worker startup or UI claims.
4. Run affected/full tests, lint/types/app/worker build, then one fresh final review and one Important/Critical fix pass. Publish a new PR against main; no merge.


## Execution evidence

- Database tests failed on the absent RPC, then passed after additive schema/owner binding implementation. Transition cases failed on unsupported operations, then passed after claim/start/outcome handling.
- Ruling: debounce includes server-observed source time, not just the user-entered received time. Test fixtures explicitly advance synthetic observation timestamps; otherwise a newly captured old question correctly waits. Cost: a fresh manual capture waits 15 seconds before simulation.
- Numeric revision input was erroneously accepted via PostgreSQL text extraction. The regression failed before centralized field-type validation and passed afterward; large external source revisions remain decimal strings/numeric comparisons without JavaScript rounding.
- Fake executor tests failed against stubs, then passed. The real SQL -> fake executor -> lost acknowledgment -> new caller -> explicit reconciliation path passed and leaves the inquiry Open.
- Public success coverage exposed numeric scale formatting (`850` vs `850.00`); fixed the server's canonical public price formatter and verified both successful price-only simulation and rejected private/custom public text.
- Focused verification: 21 tests pass. Full suite: **161 tests passed, 6 existing optional runtime tests skipped**. Lint, application types, worker compilation and Webpack production build passed. UI is unchanged; browser suites remain in CI. Fresh final review is pending. No hosted migration or real channel/model request was made.


## Final review and fix pass

A fresh read-only review (`review_durable_simulation`, GPT-6 Astra high) covered `cd67914..9e43ff2`, all focused cases and existing buyer RPC/trigger lock paths. No Critical or Minor findings. One Important finding was accepted: an initially valid lease could expire during item/inquiry/reply locking or context evaluation before the submitted update.

Final: fixed late lease admission — a 1-second remaining lease plus a 1.1-second context wrapper reproduced submitted-after-expiry (RED). The actual submitted UPDATE now checks the current wall clock and fence; expiration persists canceled/claim_expired without returning a candidate (GREEN). The regression asserts that the delayed context path was actually entered, not merely that an already-expired lease was rejected. Focused suite **22/22**, full suite **162 passed / 6 existing optional runtime cases skipped**, lint/types/worker compilation passed. No second review was requested. This elapsed-time test is not evidence of real separate-session contention.

Final: Ruling: hosted Auth/PostgREST and actual separate-session locking/deadlocks remain separate acceptance gates. Cost if wrong: the future hosted workflow could fail under contention despite PGlite's serial-session tests; no live delivery is enabled.

Final: Ruling: process/OS crash recovery and durable external reconciliation remain outside this in-memory fake-adapter increment. SQL state survives a fresh caller in the tests, but that is not an OS crash or a real provider receipt store. Cost: production restart/reconciliation behavior still requires an actual permitted adapter and acceptance.

Final: Ruling: channel access, native-response observation, authenticated external evidence and real sending remain unimplemented and unreleased. Cost: this validates control flow only and does not reduce live message-reading or sending work yet.

Final: Ruling: synthetic-history deletion/retention remains a lifecycle gate before broader use. Foreign keys restrict deletion of bound items/inquiries/replies, and this lab has no cleanup RPC; the current app has no item-delete UI. Cost: an administrator must deliberately clear dependent simulation records before deleting bound source records. Do not present this optional engineering migration as a completed retention feature.

Post-fix production Webpack build passed. The initial implementation head `9e43ff2` passed [GitHub Application checks](https://github.com/artielopez/Reseller-agent/actions/runs/41082346272), including both browser suites; the reviewed fix will receive its own CI run. [PR #14](https://github.com/artielopez/Reseller-agent/pull/14) remains unmerged with no auto-merge.

Final reviewed fix head `aa16a97` passed [GitHub Application checks](https://github.com/artielopez/Reseller-agent/actions/runs/41083789242), including the default Turbopack production build, worker compilation and both browser suites. The PR is ready for owner review, not merged. No hosted migration, real sender, new account access or change to the existing Sites demo occurred.
