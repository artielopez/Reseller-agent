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
- Full verification: lint, app typecheck, worker compilation, **140 standard tests (6 optional skipped by default)**, and Webpack production build passed. The six optional installed-runtime cases also passed separately (seven tests including the baseline unconfigured guard). UI/SQL unchanged in this stage; existing browser checks were not redundantly rerun locally. CI retains them and now compiles the worker too. Fresh review and its single fix pass are recorded below.


## Final review and fix pass

Fresh read-only review (`review_mac_worker`, GPT-6 Astra high) covered `4fac5e8..492cef4` plus documentation corrections. No Critical findings. One Important listener-cleanup finding was accepted: evaluating both control-listener creations before recording either leaked the first listener if the second bind failed.

Final: fixed startup listener leak — `closes the first preflight listener if creating the second fails` reproduced `listening: true` (RED), then passed after registering each listener immediately (GREEN). All seven installed-runtime tests passed in the same run. Full final suite/build results accompany the delivery below. No second review was requested.

Final: minor (deferred): runtime cleanup tests assert the state directory's canary removal, but do not directly assert removal of the specific `/private/tmp/reseller-draft-run-*` directory on success/cancellation. Production code awaits its removal; a regression omitting that cleanup would not be caught by these assertions. Add a precise run-directory assertion in a future test improvement; never sweep unrelated temporary directories.

Final: Ruling: hosted Auth/PostgREST, real separate-session contention, paid model compatibility and retention remain acceptance gates, not claims established by fake HTTP/PGlite/provider tests. Cost if wrong: rejected or mis-accounted live jobs/data exposure; no live activation until verified.

Final: Ruling: channel ingestion/sending, Hermes parity, autostart and automatic crash recovery remain excluded. The foreground OpenClaw pilot provides draft preparation for explicitly queued saved private questions only. Cost: manual intake/review and terminal/recovery work remain, so this is not the eventual unattended sales assistant.

Final: Ruling: same-user malicious processes, compromised trusted runtime/dependency directories and OS exploits are outside this boundary's threat model. Cost: this local sandbox cannot promise isolation against those actors; trusted installation/administrator is required.

Final: Ruling: physical iPhone/Safari acceptance remains pending because this stage changes no UI and local emulation is insufficient. Cost: device-specific cloud interaction problems may remain undiscovered until the live checklist.


## Delivery

[PR #13](https://github.com/artielopez/Reseller-agent/pull/13) is open against main, auto-merge disabled, reviewed implementation/fix head `b088565`. GitHub checks were running at delivery. Final post-fix verification: **140 standard tests passed (6 opt-in cases skipped by default)**; **all seven tests in the four installed-runtime files passed**; lint/app typecheck/worker compilation/Webpack production build passed. The existing private Sites demo was not changed by this backend/worker increment.

This continuation made implementation and delivery progress. Remaining activation depends on owner-selected Supabase access, private hosting and real provider configuration/acceptance. No live worker is configured. Other automatic personal-channel functionality remains unavailable without separately established account permission/coverage.
