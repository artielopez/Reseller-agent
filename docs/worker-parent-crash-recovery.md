# Worker parent-crash recovery

Task 6 continuation, 3 November 2026. Branch `codex/worker-parent-crash`, based on `affee36` (PR #25). This closes one local process-lifetime defect; it does not release unattended operation.

## Reproduction and change

A compiled production `runProcess` caller launched a synthetic target and descendant, both ignoring SIGTERM. Killing the caller with SIGKILL left both processes alive beyond the three-second observation window. Its timeout and cleanup lived in the killed caller, so they could no longer stop the detached group. The test removed only its own remaining group.

`runProcess` now starts a small independent Node supervisor over a private IPC pipe. The supervisor owns the target process group, output limit, timeout and termination escalation. Loss of the caller's pipe aborts the group, escalates to SIGKILL after 200 ms and checks disappearance. It exits after draining cleanup. It also handles ordinary cancellation, target exit and missing executables. The existing caller receives a result only after cleanup; uncertain/failing supervision yields the existing generic error.

The supervisor receives no inherited environment, credentials or buyer text on its command line. Its static source is passed to Node; command arguments, explicit target environment and input travel over IPC. The target still runs without a shell and receives only the caller's selected environment. The supervisor is trusted local application code, not the sandboxed agent. OpenClaw's sandbox and provider boundaries are unchanged.

## Evidence

- `tests/worker-parent-crash.test.ts` failed first with both synthetic processes still alive, then passed with the target, descendant and supervisor all gone after caller SIGKILL. It uses the compiled production process launcher, actual OS signals and no model/network/account credentials.
- Process regressions cover preserved UTF-8 stdin/output, explicit environment, nonzero exit, missing executable, output limit, timeout, cancellation and descendants after normal target exit.
- The first focused run exposed macOS EPERM during an already-exiting process-group cleanup. Preserving the prior ESRCH/EPERM signaling handling resolved that regression; final group absence still requires ESRCH. An inaccessible/surviving group never counts as successful cleanup.
- Lint and type checks passed. The full suite passed **239 tests**, with six optional tests skipped. An initial sandboxed run could not bind the synthetic HTTP listeners; the authorized loopback-capable rerun passed.
- Five installed-runtime checks passed with the actual isolated OpenClaw installation, synthetic facts and fake model responses: denied file/network access, exact draft round trip, in-flight cancellation, database-to-runtime integration and failed preflight cleanup. These made no real provider or cloud calls. Independent review is pending.

## Limits and operation

This proves parent loss during synthetic active subprocess work. It does not prove provider-side cancellation, refund/avoidance of an already admitted request, physical Mac restart/sleep, simultaneous supervisor failure, or termination of a process that deliberately escapes its group. The installed runtime is trusted; arbitrary hostile processes are outside this contract. No real buyer/model call was used for this acceptance.

A killed caller cannot remove its private run directories or release `worker.lock`. Those remain for deliberate inspection; no automatic cleanup or stale-lock eviction was added. Reconcile the cloud job before another attempt. Never infer that a missing local process means the provider did no work, and never replay inference automatically. The queue remains paused and the supervised-trial enrollment revoked.

No cloud schema/UI deployment is needed for this Mac worker change. No ordinary OpenClaw installation, profile, gateway, service or startup configuration is modified. GitHub changes remain reviewable and unmerged.

## Execution ruling

Continue the existing Task 6 recovery work with a failing synthetic OS-process regression before changing the launcher. An independent supervisor is necessary because SIGKILL cannot run caller cleanup. The cost is one short-lived Node process per invocation; simultaneous supervisor/OS failure still requires manual recovery. Keep that limit explicit rather than claiming provider cancellation or unattended readiness.
