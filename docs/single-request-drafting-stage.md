# Single-request drafting stage — 30 October 2026

Branch `codex/single-request-drafting`, based on `69be6ec` (PR #11). Previous goal turn was progress: actual synthetic runtime evidence established the need for this boundary. This stage is in progress, not deployed.

## Contract

- A loopback-only, short-lived model endpoint accepts a random capability for one draft job. It calls a trusted provider at most once, including concurrent requests and retries after failures. It has no platform or Supabase capability.
- Freeze the trusted worker's DraftInput before starting the endpoint. Runtime request text, model names, tools, headers and destinations cannot change the paid request. The model API key remains in the parent worker.
- The optional OpenAI provider sends one non-streaming Responses request to the fixed official URL, with no tools, no conversation/session chaining, explicit `store:false`, strict JSON output and 1,800 output tokens. No redirects or retries; bounded input/response and cancellation. Reject incomplete/refusal/tool-bearing/malformed output.
- Translate only validated body/reviewReason JSON into the local Chat Completions protocol OpenClaw uses. A successful CLI exit alone never admits a result; the future process adapter must also enforce runtime isolation and check attempted tools/turns/cleanup.
- No live service credentials, paid calls, daemon, agent installation, automatic approval or sending in this stage.

Ruling: the gateway forwards the worker's frozen facts/instructions, not the runtime's supplied messages. The runtime is an optional orchestrator; the restricted provider performs drafting. This prevents runtime metadata or untrusted request changes from expanding the data/capability surface. It also permits a simpler direct worker path later without requiring a general personal gateway.

## Verification plan

Failing tests first for concurrent/repeated requests, failed-provider retries, wrong token/origin/path, oversized/malformed input, cancellation, provider redirects/429/oversize/refusals/tools, and immutable trusted input. Exercise real loopback HTTP and actual installed OpenClaw with a fake provider; no real inference. Then lint/types/full tests/build and one independent review. UI is unchanged.

## Sources and limits

Installed SDK types and fetched official [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [data controls](https://developers.openai.com/api/docs/guides/your-data) informed the request shape. `store:false` does not establish zero provider retention or account eligibility. Live model compatibility, data settings and billing remain owner-specific acceptance items. No API-key helper is available in this session and no key is needed for synthetic tests.

## Implemented and checked

- `draft-gateway.ts`: one random 256-bit capability, 127.0.0.1 only, exact Host/path/auth checks, no browser Origin, 32 KiB/2-second request-body limit, 25-second lifetime. The first authenticated attempt consumes the capability before any await. A duplicate invalidates the result even if the first request succeeded. No mutation/enrollment/queue/provider URL is accepted from the runtime.
- `draft-provider.ts`: one direct fetch to the fixed OpenAI Responses URL with `redirect:error`; 20-second cancellation, 64 KiB response ceiling, no tools/previous response/conversation, strict text-only complete output. Provider errors are sanitized. The operator supplies the key/model to parent code; no environment or personal-agent credential discovery occurs.
- Draft input/output schemas are shared with the existing drafting boundary. This stage adds no public route or cloud UI action; the real worker process adapter and live acceptance remain pending.
- RED: provider and loopback tests failed against the unimplemented boundary. GREEN: permission, concurrent retry, output validation, malformed input, cancellation and deadline checks now pass. A further immediate-startup cancellation regression reproduced a hanging listener; registering cancellation after listener startup fixed it.
- Full suite: **130 unit/API/database tests passed**, with the two installed-runtime cases explicitly skipped by default. Lint/types and Webpack production build passed. Default local Turbopack remains affected by the documented sandbox restriction; CI retains the standard build. UI and SQL are unchanged.

The optional Mac-only integration uses the installed OpenClaw under the existing diagnostic sandbox policy and a fake upstream response:

```bash
RUN_OPENCLAW_PROBE=1 npx vitest run tests/openclaw-gateway.test.ts
```

It is separate from ordinary CI because CI does not have this personal machine's runtime installation. The API key in the test is synthetic; the production adapter's fetch is intercepted and makes no external request. Test helper capabilities go through stdin rather than process arguments. The helper prints only synthetic results and never admits a live worker.

Remaining gates: production process sandbox checks (including the previously deferred real home/write guards), durable job wiring, process/cleanup crash handling, selected Supabase project, real model/account/data-retention acceptance, and separately permitted channel intake. A one-request gateway is not permission to run an unrestricted personal gateway or send replies.

Installed-runtime integration: **2/2 passed** through the actual OpenClaw → loopback gateway → OpenAI adapter chain with a fake upstream fetch. Normal output used one upstream request and the worker's exact frozen input. Tool-bearing upstream output was rejected; OpenClaw failed rather than obtaining a usable draft, and upstream fetch remained at one call despite runtime retry behavior. Both cases left no prompt marker or temporary runtime directory. These checks do not establish real account compatibility or crash-safe cleanup.

## Independent review and final correction

One fresh read-only reviewer found an Important protocol gap: `maxHeadersCount:20` silently hid later headers, so an authenticated Origin header beyond the limit was not rejected. A raw HTTP regression reproduced **200 instead of 431**. The single fix pass keeps all headers within an 8 KiB byte ceiling, then explicitly rejects more than 20 header pairs before authentication/admission. The regression now rejects without invoking the provider; valid subsequent work remains possible. Bearer authentication was not bypassed by the original defect.

After the correction, lint/types, **131 standard tests** and **both installed-runtime integration tests** passed. The two runtime cases are still opt-in, not silently counted as ordinary CI. The reviewer also exercised partial-body disconnect, oversized-body disconnect and the body deadline without provider calls or uncaught errors; those were read-only exploratory checks, not newly committed test cases. No Critical findings or separate Minor findings were reported.

- Final: Ruling: production OS isolation/home/write guards and process-tree cleanup after crashes remain launcher work. Diagnostic sandbox success is not admission of a real worker. Cost if ignored: personal-data access or leftover local state.
- Final: Ruling: durable queue/result admission must be wired through the existing leases and shared daily allowance in the subsequent worker adapter. The endpoint itself does not reserve budget or verify an owner. Cost if ignored: paid requests outside the intended quota.
- Final: Ruling: real model compatibility, billing and provider retention require selected account acceptance. All upstream calls in tests were intercepted. Cost if ignored: incompatibility, unexpected spend or a retention assumption unsupported by the account.
- Final: Ruling: hosted Supabase, channel capture and sending remain outside this implemented boundary. No listener is started by the app and no real data or credentials are connected.

Final build: the Webpack production build passed after the header correction. No browser rerun was needed because this stage changes no rendered UI, client persistence or SQL. PR #11's final head `69be6ec` also passed its standard GitHub checks; new-branch CI is separate.
