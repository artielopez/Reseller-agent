# Hosted draft queue acceptance — 2 November 2026

The existing draft queue passed a rollback-only check in the dedicated Reseller Agent Supabase project `ecusonvqyjnuwjhvcivb`. This advances hosted acceptance; it does not establish a working Mac-to-cloud-to-model connection or marketplace automation.

## Reproducible evidence

Run the entire `scripts/acceptance/hosted-draft-queue.sql` file as one transaction through the project SQL interface. It requires a privileged maintenance connection to create synthetic Auth fixtures and switch PostgreSQL roles. Never run only selected statements or commit the fixtures. No real account IDs, enrollment tokens or message text are printed. On error, roll back the transaction before reusing that session.

The actual hosted run returned the final `passed` row after rollback. It checked:

- Paused enrollment, anonymous control rejection and two-owner queue isolation.
- Worker-scoped leases, duplicate claim rejection and single start admission.
- Shared listing/drafting allowance, including denial after 20 reserved attempts.
- An unapproved agent Draft result with the inquiry still Open.
- Idempotent identical submission and rejection of conflicting retries.
- Rejection after seller terms change, pending-job cancellation on pause and revoked-token rejection.

Read-only counts before and after were identical: two existing Auth users; zero items, inquiries, replies, workers, jobs and AI usage rows. Synthetic accounts, capabilities and usage were rolled back. No real worker was enrolled, no question sent to AI, and no buyer message sent.

`tests/hosted-draft-acceptance.test.ts` runs the exact SQL file against the local migrated PGlite fixture and verifies rollback. It passed (one test). The existing installed-runtime checks also passed:

```sh
RUN_OPENCLAW_PROBE=1 npx vitest run tests/mac-runtime.test.ts tests/mac-worker-integration.test.ts tests/mac-preflight-failure.test.ts tests/draft-queue-database.test.ts
```

Result: four files, 20 tests passed. Runtime: OpenClaw 2026.9.6, child Node 24.21.0, parent Node 22.23.1. These tests use synthetic provider responses and local database fixtures, not live inference. Worker compilation and targeted ESLint passed. An initial standalone check with `/private/tmp` as the state directory was rejected as designed; the successful tests use home-scoped state so denied home reads can be verified. No guard was relaxed.

The final standard suite passed: **176 tests**, six optional installed-runtime tests skipped by the default command (their separate opt-in run is recorded above). The first sandboxed full run could not bind localhost (`EPERM`); rerunning with loopback permission passed without code changes. A fresh app build was not rerun for this SQL/test/documentation-only increment; this is not a new production deployment.

## What remains

The SQL run uses actual `authenticated` and `anon` roles with synthetic JWT claims in one maintenance session. It does not test real signed-in HTTP requests, independent concurrent sessions, Storage access, physical devices, sleep/restart or a live model. Janyl's sign-in and two-user app acceptance remain separate checks.

The owner's latest cost preference is to reuse an existing OpenClaw/Hermes subscription, without buying API credits. The current worker still requires an API-key provider; **do not follow that setup path for this trial**. See [subscription route findings and implementation gates](research/subscription-drafting.md). Neither a valid agent login nor these database tests prove the replacement adapter is ready.
