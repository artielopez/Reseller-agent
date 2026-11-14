# Worker health and buyer workflow

Owner-approved scope: work autonomously on worker recovery/health, easier drafting,
privacy and cleanup previews, account isolation, and release preparation. No merge.
Use the existing stack, subscription boundary and review-only queue. No model calls,
automatic sending, automatic deletion, new service or background worker activation.

## Execution sequence

1. Show honest worker/contact and job recovery information from the existing owner-scoped queue response. Distinguish paused, expired/revoked, no contact and old contact; never equate a valid key or recent contact with an online Mac or valid model login. Local time comparisons are advisory. Explain known failures without displaying raw provider errors. Test boundaries first.
2. Put a per-question draft request and status next to saved private questions. Retain an attempt ID across uncertain responses, prevent concurrent requests, and provide explicit draft reload with dirty-text protection. No automatic generation/retry, approval or sending. Add desktop/mobile cloud-contract browser tests, including late responses/account changes.
3. Add a read-only privacy/cleanup preview with explicit limitations. Inventory objects must not be deleted based on a browser snapshot or uncertain save. No active retention policy until deliberately configured. Strengthen owner-isolation tests where gaps are found.
4. Update recovery/release instructions and the status/acceptance register. Verify local lint/types/tests/build, perform one fresh independent review, and prepare a PR. Publish only through the established authorized Sites workflow, preserving its private audience. Do not merge.

## Ledger

- Start: clean `e50e99d`, new branch `codex/worker-health-workflow`. Existing worktree verified. Direct ledger retained from earlier tooling decision; no retry of the failing workspace helper.
- Design: existing queue already supplies database-managed `last_seen_at`, key expiry/revocation and latest 100 jobs. Derive an advisory health snapshot without a schema migration, heartbeat polling or new model calls. Subscription worker remains once-only and paused.
- Plan approval: the owner's explicit “go ahead ... autonomously ... only ... critical” authorizes implementation of the previously proposed scope; no redundant design approval requested.

- Steps 1–3: health tests RED (missing module) → GREEN; inline UI RED (missing panel) → GREEN. Saved-reply discard regression RED (old edits remained at same saved revision) → GREEN with deliberate remount. Privacy RPC/client/panel RED → GREEN. Uncertain enqueue identity and late account-response checks pass. Read-only preview deliberately replaces any destructive retention implementation; no deletion selection or automatic policy is introduced without a safe concurrency design.
- Validation: lint/types, 257 unit/database/process tests (six optional skips), 52 demo browser checks, 20 cloud-contract browser checks, production and worker builds pass. Fresh review and hosted release remain next.
- Final independent review: no Critical/Important findings; reviewer independently passed ten focused tests. Added and locally verified a rollback-only hosted acceptance script (one additional test); no Storage object mutations. No code fix pass required.
- Delivery: implementation committed `ee843e4`; final suite 258 passed/six optional skips. Hosted privacy migration/rollback checks and Sites v9 deployment succeeded. PR #28 is open, no auto-merge. Release/source/audience receipts recorded. Signed-in UI verification is blocked by disabled local browser use; owner action requested. Destructive retention, real channel adapters and physical-device recovery remain explicitly incomplete in the broader register.
