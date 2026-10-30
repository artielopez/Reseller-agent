# Mac draft worker — execution stage

Branch `codex/mac-draft-worker`, based on `4fac5e8`. Previous goal turn was progress: the single-request gateway/provider and real installed-runtime tests passed. PR #12 was subsequently created successfully; its final head `4fac5e8` passed GitHub checks.

## Scope

Implement a usable Mac-only command-line draft worker: preflight without service credentials, one-job run, and serial foreground polling. Reuse the existing owned leases/shared quota, restricted loopback model gate and bounded OpenAI provider. It reads only explicitly queued saved private questions, produces Draft replies, and stops on uncertain results. It does not read Facebook/Carousell, send, approve, install a launch service or start a live worker during development.

The launcher uses a fresh private run directory, explicit config, a sanitized child environment, no tools/plugins/channels/context injection and a macOS sandbox. Real OpenAI/Supabase keys stay in the parent. Verify the actual home-read and outside-run-write restrictions with synthetic canaries, and verify permitted/denied loopback ports before claiming runtime verification. Kill the entire owned process group on cancellation/timeout/exit; require runtime cleanup and validated single-turn output before accepting the gateway result.

Use an owner-private state directory and exclusive worker lock. Do not automatically delete ambiguous stale locks or another process's state. A crash can require operator cleanup; there is no unattended service installation in this stage. Capture no raw runtime logs or question text in CLI output.

## Execution plan

1. Fail-first tests for bounded process launch/cancel/child cleanup and state isolation.
2. Runtime preflight and single-run adapter, with real installed OpenClaw and fake provider checks.
3. CLI/config/lock/serial polling, including end-to-end synthetic database-to-Draft integration.
4. Lint/types/full tests/build, one fresh review and a single fix pass if needed. Keep cloud and real-model acceptance explicitly pending.

Ruling: this stage provides a foreground worker and explicit stop/recovery behavior. Autostart, reboot recovery and channel ingestion require their own acceptance; silently adding a launch service with unconfigured credentials would not advance usable deployment.


## Evidence and rulings

- Process helper RED→GREEN: orphan-group teardown and split Unicode stdout exposed two issues, fixed with actual child-process tests. Four process tests pass.
- Runtime stub failed admission as expected. Actual installed OpenClaw passes home-content denial, outside-run writes, allowed/denied loopback probes, config validation, one-use generation and cancellation draining. No real credentials used.
- Loader diagnosis: metadata-only file access and literal public ancestor directory reads are needed by this macOS loader. Broad boot-image read exceptions were removed. Empty `OPENSSL_CONF=/dev/null` avoids inheriting machine-level configuration. Ruling: permit file metadata while denying private contents; cost if wrong is filesystem metadata disclosure, not permission to read private contents. This assumes trusted local runtime/administrator, not hostile same-user code.
- Config/lock and serial-runner tests failed against stubs before implementation and now pass. Existing ambiguous locks are retained; cleanup precedes each subsequent poll.
- Full synthetic PGlite queue → transport adapter → actual OpenClaw → one-use endpoint → fake OpenAI adapter → Draft passed, with exactly one shared attempt and no second inference when the queue is empty. Installed-runtime cancellation test passed. No hosted or real-model acceptance implied.
- `npm run worker:check` passed against the actual installation with an ignored, owner-private worktree state directory. No credentials or service request used.
- Full verification: lint, app typecheck, worker compilation, **140 standard tests (5 optional skipped by default)**, and Webpack production build passed. The five optional installed-runtime cases also passed separately (six tests including the baseline unconfigured guard). UI/SQL unchanged in this stage; existing browser checks were not redundantly rerun locally. CI retains them and now compiles the worker too. Fresh review remains pending.
