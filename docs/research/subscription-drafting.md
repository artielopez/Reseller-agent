# Subscription-backed buyer drafts — 2 November 2026

## Decision and current evidence

The owner asked to reuse OpenClaw or Hermes to avoid additional model costs. Use an existing subscription allowance, with no API-key or paid-provider fallback and no automatic credit purchase. Prefer OpenClaw for the first adapter because the existing restricted worker already has installed-runtime tests. Hermes remains an alternative, not a second simultaneous worker.

Read-only local inspection found:

| Installation      | Safe metadata observed                                        | What this establishes                                                                                          |
| ----------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| OpenClaw 2026.9.6 | Default/resolved `openai/gpt-6-sol`; OpenAI OAuth status `ok` | A configured subscription-capable route and locally valid login metadata; no inference or account billing test |
| Hermes            | `model.provider: openai-codex`, `model.default: gpt-6-sol`    | Subscription provider selected; Hermes login validity was not checked                                          |

Only provider/model/type/status fields were retained. No credential values or personal agent history were read or copied. The general OpenClaw configuration has additional model/provider fallbacks, including providers with API-key/token authentication. It is unsuitable to inherit unchanged for a no-additional-cost trial. Neither installation was reconfigured.

[OpenClaw's official setup guide](https://docs.openclaw.ai/providers/openai/setup) supports ChatGPT/Codex sign-in separately from API-key billing. [Hermes' official quickstart](https://hermes-agent.nousresearch.com/docs/getting-started/quickstart) also lists OpenAI Codex subscription access. These are supported routes to investigate, not proof of this account's model entitlement or remaining allowance.

[OpenClaw's cost documentation](https://docs.openclaw.ai/providers/openai/coverage-and-cost) distinguishes subscription quota and credits from Platform API billing. A subscription is not unlimited use. Before inference, establish that the selected route will not consume paid overage/credits when included allowance runs out; stop if this cannot be enforced. An OAuth label or a reported zero/absent cost estimate is not a spending guarantee.

## Why the current worker needs an adapter

The existing `src/worker/main.ts` uses OpenClaw as a restricted runtime, but its parent process calls `createOpenAIDraftProvider`, which requires an API key. The child only reaches a one-use local endpoint. Switching a model name cannot convert that API request to subscription access.

The [documented one-shot CLI](https://docs.openclaw.ai/cli/agent) can use existing framework-managed authentication. However, its ordinary defaults can include tools and ambient configuration. [Model failover](https://docs.openclaw.ai/concepts/model-failover) includes auth rotation and same-model recovery as well as model fallback. Merely choosing `--model` or checking that the final output reports one assistant turn does not prove one inference request or prevent API-key fallback. Preserve the current worker's stronger boundaries until replacement controls are tested.

## Implementation sequence

1. **Prove a supported subscription-only route without buyer data.** Use a dedicated, pinned configuration and framework-owned login handling. Do not extract OAuth tokens into our app or copy the user's complete agent state. Verify no API credentials, alternate auth profiles, paid fallback, provider override, credit overage or hidden recovery can be selected. If the installed public interface cannot enforce the existing single-request contract, record that limitation and keep the adapter disabled rather than weakening the contract silently.
2. **Add a provider behind the existing draft interface.** Preserve owned saved facts, output validation, shared daily attempt admission, time/output bounds, cancellation, secret-free logs and stale-context checks. Do not let the buyer choose model, config, endpoint, tools, files or auth. The subscription subprocess must have no browser, shell, marketplace, messaging, memory or general personal-file access. Account/profile credentials stay with the trusted auth broker, not model tools.
3. **Test failure paths offline before a synthetic model trial.** Invalid/expired OAuth, exhausted quota, paid fallback candidate, missing telemetry, extra provider attempts, malformed output, tool requests, cancellation, crash leftovers and changed seller terms must fail closed. A fake provider test does not establish live subscription billing or retention.
4. **Run one synthetic question after the cost boundary is verified.** Record selected auth mode, model, request count, result validation and cleanup without secrets. Then connect one paused, owner-enrolled cloud worker and verify one reviewed Draft. Do not start a background daemon or process real buyer data from a successful login check alone.
5. **Accept the real workflow separately.** Start with questions pasted into the private app and owner review/copy. Automatic reading/replying still needs a permitted, account-specific channel integration; subscription access does not grant Facebook or Carousell permissions. Keep public Group comments distinct from private messages and Janyl's inventory distinct from Artie's.

Template/manual replies already work without model charges. They remain available when the subscription adapter is disabled or its allowance is exhausted, with their existing label; do not label a template as AI output. There is no automatic failover from OpenClaw to Hermes in this proposal.

## Release state

The first adapter and one real synthetic OAuth-only trial now work locally (2 November). Installed OpenClaw 2026.9.6 returned a valid PHP 850 draft using `api.runtime.llm.complete`, `requiredAuthMode: oauth`, pinned `openai/gpt-6-sol` and strict structured output. The framework resolves its own existing login; no token was extracted, and the subprocess inherited no API key. One app attempt was reserved before inference. The owner signed into ChatGPT; its Usage screen showed 59% weekly allowance, zero credits and automatic reload off. No settings or purchases were changed.

The adapter invokes the host completion capability once, with a 20-second deadline, no tools, no retry and no model/auth fallback. This does **not** prove a single underlying network request: the installed transport has recovery paths. Provider retention and ongoing quota/credit enforcement are not yet certified. Do not process real buyer data or enable unattended operation on this evidence alone.

`src/worker/subscription-broker.ts` constructs private temporary configuration, permits one OAuth profile, strips inherited environment, validates host version, and cleans/drains owned processes. It is a trusted authentication broker, not the model's tool environment. The existing sandboxed runtime remains the model-facing boundary. `RESELLER_DRAFT_PROVIDER=subscription` is a foreground `once` trial only, requiring an operator-observed allowance attestation expiring within one hour. This timestamp is a local operational gate, **not a monetary cap**, and must never be refreshed automatically. The default plugin remains inference-disabled. A subsequent synthetic cloud queue/model round trip passed through the existing sandbox: saved question → profile-bound OAuth completion → unapproved Agent Draft. Its enrollment is revoked and queue paused. No real-buyer or sending release is claimed.
