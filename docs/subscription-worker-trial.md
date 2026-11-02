# Subscription-backed draft trial

This is a supervised **one-question** trial, not unattended buyer automation. Synthetic direct and cloud queue-to-Mac-to-Agent-Draft acceptance have passed. The owner explicitly requested reuse of the existing Mac mini OpenClaw codebase/setup. One owner-selected real question completed under the conditions below on 3 November; its Agent Draft remains unapproved.

## Existing connection decision — 3 November

Use the existing, explicitly pinned OpenAI OAuth profile for Artie's supervised trial. A separate SIWC registration remains an optional route for future provider-side app limits; its consent timeout does not block this bounded existing-login route. Current checks show the profile belongs to Artie and has a future expiry, while ChatGPT shows 46% allowance remaining, zero credits and automatic reload off. The owner approved disabling model training and the UI now shows it off. These are point-in-time observations, not a permanent per-worker spending cap or zero-retention guarantee.

Before each real trial, require all of the following: the owner selects a saved owned item and question; the operator reviews the exact minimal model input (no buyer name, private contact details, payment credentials or unnecessary personal data); the cloud owner and OAuth account match; the allowance/credit observation is refreshed and attested for no more than one hour; and the exact input hash is pinned. Run only one foreground queue pass. Save an unapproved draft for human review, then pause/revoke the temporary enrollment. No automatic sending, retries, watch mode, or API-key fallback. Janyl must use her own authorized model account for her requests; Artie's subscription is not a shared household inference service.

This narrows the earlier blanket synthetic-only gate to the actual risk: an operator-supervised, explicitly selected question with bounded time/output and no purchase path. The existing code already enforces the payload hash, expiring attestation, OAuth profile, model/tool boundary and once-only command; those controls are unchanged. Provider-side token/request caps remain unavailable and must not be claimed. Unattended operation and automatic marketplace intake/sending remain separate unreleased work.

## Boundary

- Installed OpenClaw is pinned to `2026.9.6`; its Node executable defaults to `/opt/homebrew/bin/node` (Node 24). Parent worker remains Node 22. No installation or global configuration is changed.
- The repository plugin calls the public `runtime.llm.complete` capability with `requiredAuthMode: oauth`, model `openai/gpt-6-sol@<trusted-profile-id>`, strict JSON output and no tools. It never starts a general agent session. Only the trusted framework resolves/refreshes its existing OAuth credential.
- The parent broker constructs temporary configuration and binds each completion to the designated OAuth profile with the supported model suffix. Configured profile order alone is insufficient: the host can prefer stored order or repair a missing profile. The hard suffix makes a mismatched selection fail before inference. The spawn environment contains no API keys and uses explicit configuration without channels, hooks or memory. The installed CLI can still load its own global dotenv file; OAuth-only mode and the hard profile binding prevent API-key or alternate-account dispatch. Do not describe the trusted broker as credential-free. Its HOME remains the owner's home for framework-managed authentication; it is a trusted provider process, not an OS-isolated personal-file sandbox. The model is given text only and no file/browser/shell tools.
- The existing sandboxed runtime remains in place and only reaches the parent one-use local draft endpoint. Saved facts and model input are frozen in the parent. Daily admission, before/after context checks, unapproved draft persistence, cancellation, process-group cleanup and worker locking are retained.
- The supplied plugin disables inference by default. Subscription CLI mode accepts only `once`, never `watch`. An exact input SHA-256 pins the trial to the reviewed payload; changed or arbitrary buyer input fails before inference.
- The operator must inspect the correct subscription account's included allowance, verify zero credits and automatic reload off, then set an expiry no more than one hour ahead. This attestation expires locally and must not renew automatically. It is **not a provider-enforced spending cap**. Stop if identity, allowance or billing state is uncertain.

## Setup for a supervised trial

Use `.env.worker.example` as the configuration reference. Set `RESELLER_DRAFT_PROVIDER=subscription`, the existing OpenAI OAuth profile ID, the short-lived verification timestamp and the exact reviewed payload hash. Remove `OPENAI_API_KEY`, `CODEX_API_KEY` and `OPENAI_MODEL`. Use only a publishable/anon Supabase key and an owner-enrolled, draft-only worker token. Never use a service-role key or commit the environment file. The installed repository plugin path is derived from the compiled worker's location; it is not chosen by buyer data.

Run `npm run worker:check` for the existing sandbox preflight (no cloud or inference). `npm run worker:once` builds and handles at most one cloud job. Before claiming, the subscription broker checks host/plugin compatibility without inference. After the trial, pause the owner's queue and revoke its acceptance-only enrollment. Retain job and usage records for reconciliation. Do not rerun an uncertain outcome automatically.

The default `api` route remains available for explicitly configured API deployments. It is separate from the chosen subscription route and cannot be selected as a fallback.

## Cloud acceptance

The owner’s labelled synthetic lamp was saved through the live app at PHP 850, then changed to PHP 900. A saved private Marketplace question entered the owner-only queue. One foreground worker pass completed through the existing sandbox and the exact profile-bound OAuth broker. Hosted result: job `f408f8ec-7598-46e5-8a66-16959afff82f` completed, source `agent`, status `Draft`, correct PHP 900 asking price and disclosed mark. The daily app allowance was admitted by the queue before inference. Nothing was approved or sent by the worker. The deployed UI later displayed the Agent Draft; it was explicitly approved for the synthetic copy test, and the manual-copy fallback worked. The question remained Open.

Afterward the queue was paused, acceptance enrollment `91e428af-1704-4b03-8df4-1938b557788c` revoked, and private helper/payload files removed. No worker lock remained. The saved fixture and real usage/job audit remain; no uncertain attempt was retried.

## Evidence and limits

On 2 November the ChatGPT usage UI showed 59% weekly allowance remaining, zero credits and automatic reload off. One real synthetic direct completion produced the expected PHP 850 draft, with one real app attempt reserved beforehand. No buyer message was transmitted or sent. This is an observation of that account at that time, not a durable budget guarantee. A later secret-free `models auth list --provider openai --json` check reported the sole OAuth profile email as the owner's Gmail address, matching the signed-in ChatGPT account.

The adapter makes one host call and has no retry loop. The host transport has recovery paths, so an exact network-request count has not been established. Provider retention is not zero. The 1,800-token host setting is advisory, with a separate strict application output-size limit; do not infer a universal upstream token guarantee. These gaps keep unattended operation disabled; a real supervised trial requires the conditions above. Hermes is not a configured fallback.

## Real-question acceptance — 3 November

One supervised cloud-to-Mac-to-Draft pass completed using the existing OpenClaw subscription connection, after exact minimal-input review/hash pinning and fresh account/allowance checks. The private app retains the question, facts, answer and audit records; none of that content or its production identifiers is reproduced here. The reply remains an unapproved Agent Draft for human review.

After completion, read-back confirmed the queue paused and temporary enrollment revoked. The worker exited, its lock was released and its private helper removed. No API-key fallback, retry, background process, copy or outgoing buyer message occurred. This establishes one supervised real draft, not automatic marketplace access, sending or a permanent spending guarantee.
