# Mac draft worker

This foreground worker processes explicitly queued private buyer questions from your saved Reseller Agent inbox. It saves **Draft** replies for your review. It does not read Facebook or Carousell, post, approve, copy, send, or install a background service. The shared Sites demo cannot enroll a worker; it has browser-local data only.

## Prerequisites

- A private cloud instance of the app, Supabase Auth and all three checked-in migrations applied in order. Hosted acceptance is still pending. Do not use a service-role or secret Supabase key.
- Parent application Node 22 and `npm ci`. The worker compiles with the existing TypeScript dependency; there is no additional package.
- macOS, `/usr/bin/sandbox-exec`, a trusted OpenClaw **2026.9.6** install and its Node 24 executable. That installed version is the tested version; a changed version is rejected until revalidated. Paths are operator-controlled, never supplied by a buyer.
- An OpenAI API key and an explicitly selected model supporting Responses structured output and `reasoning.effort: none`. Real model/account compatibility and billing are not yet tested. The request sets `store: false`; this is not a zero-retention guarantee. See [provider acceptance](single-request-drafting-stage.md).

## Check without credentials

```sh
npm run worker:check
```

This creates a private state directory (default `~/.reseller-agent-worker`), takes an exclusive lock, validates the restricted runtime config, and checks actual denied home-file reads, denied writes outside the temporary run directory, one allowed loopback port and another denied port. It makes no cloud/model request. Normal completion releases the lock. A failure stops admission, without a permissive fallback.

Custom paths can be provided using the variables in `.env.worker.example`. The `check` command does not load `.env.worker`; use shell environment variables for custom paths during that check.

## Configure and run deliberately

1. In the cloud Inbox's worker controls, enroll a Mac worker. Copy its one-time enrollment key; it expires after seven days and can be revoked there. Keep the queue paused during setup.
2. Copy `.env.worker.example` to `.env.worker` and run `chmod 600 .env.worker`. Fill in the project URL, public key, enrollment key, OpenAI key and explicit model. This ignored file belongs to the parent process. Do not paste it into OpenClaw, chat, an issue or a support log.
3. For initial acceptance, use a synthetic inventory item and private question, resume drafting in the app, and queue only that question. Run:

```sh
npm run worker:once
```

4. Confirm exactly one Draft, no approval or sending, and one shared daily attempt. Review real hosted ownership, quota, revocation, pause, stale facts and failure behavior before processing real data.
5. Once accepted, `npm run worker:watch` polls every 15 seconds, serially, while the terminal remains open. It stays quiet when idle. Ctrl+C stops it and drains owned child cleanup. It stops on a failed/unavailable job or uncertain submission; it does not automatically replay inference or resubmit. A single idle pass does not prove the entire queue is empty: an expired/stale job can be retired in that pass.

Both run commands compile first and then load `.env.worker` using Node. No worker was started with live credentials during development. The owner may independently pause or revoke in the app. An already admitted model call can still incur a charge; a draft whose submission was in flight at shutdown may already be saved. Inspect the queue before deciding what to retry.

## Boundaries and recovery

The parent alone handles the Supabase token, OpenAI key, saved question and inventory facts. The child gets an ephemeral loopback capability and a constant instruction. Its one-use model endpoint ignores child-supplied prompts and uses the parent's frozen facts. Only one provider invocation is admitted, with strict output/token/time limits; errors are not retried. The child sees the generated answer, which may contain buyer-related information, only within its private temporary run state.

The runtime has no tools, plugins, channels, injected memory or bootstrap context. Its environment is explicitly constructed, including an empty OpenSSL configuration. Its filesystem policy permits public OS/runtime code and its own fresh run directory, with writes confined to that directory and `/dev/null`. File metadata checks are permitted because the macOS loader needs them; **private file contents remain denied**. These controls assume a trusted local administrator, runtime installation and public dependency directories. They are not isolation from a malicious same-user local process or OS exploit.

Normal completion/cancellation kills the owned process group, confirms it disappeared, closes the model endpoint and removes the temporary directory. Output is bounded and never printed; CLI output contains no questions, model answers or keys. Abrupt parent/OS failure or forced kill can leave a private `/private/tmp/reseller-draft-run-*` directory or `worker.lock`. Crash recovery and unattended startup are **not** accepted yet.

If startup says it cannot finish safely:

- Keep the queue paused. Inspect the owner-private `worker.lock/owner.json` for the PID/start time, and determine whether that exact worker and its descendants still exist. Do not delete a lock simply because its PID appears absent or old.
- Stop only the identified Reseller Agent worker/process group. Inspect the queue for completed or uncertain results. Never automatically replay a reserved job.
- Only after confirming no related worker/child is active, remove that stale lock and that run's private directory, if present. Do not remove another runtime's directories or use broad `pkill`/wildcard cleanup.
- Fix missing paths/version/permissions/configuration, rerun the credential-free check, and start with one synthetic question again. A machine crash requires this manual inspection; there is no automatic stale-lock eviction.

For development, `RUN_OPENCLAW_PROBE=1 npx vitest run tests/mac-runtime.test.ts tests/mac-worker-integration.test.ts` runs installed-runtime checks with fake model responses and an in-memory SQL database. These do not prove hosted Auth/PostgREST, real separate-session contention, real model availability, iPhone use or channel permission. Hermes is not wired into this launcher.
