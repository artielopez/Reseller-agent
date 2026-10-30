# Restricted drafting preparation — 30 October 2026

This continues Task 4 of the sales-assistant plan after the owner's merge/deploy/continue instruction. PR #7 was merged at `ec93fa7`; the same application tree was exported and deployed to the existing private Site after 34 static browser checks.

## Execution decisions

- Ruling: implement the provider-neutral draft boundary before a live OpenClaw/Hermes adapter. Installed OpenClaw documents full operator HTTP access and ignores `store`/`max_tool_calls`; Hermes is now version-verified but its tool and retention isolation is not. A real transport must supply verified runtime isolation, server-derived current context and the shared durable allowance before admission. No boolean from a browser may attest runtime safety. Cost if wrong: adapter integration requires revision; no real messages or calls are admitted by this preparation.
- Ruling: public comments remain template/manual review only. An unverified model must not receive the full private description for a public destination. Cost: public AI drafting is deferred.
- Boundary contract: validate owned context, strip record IDs from provider input, place facts/question in a data envelope, require runtime verification, reserve one paid attempt, invoke once with a 25-second deadline, reject malformed/oversized output, and recheck exact context after generation. Every accepted output remains a draft requiring human review; no approval/copy/send mutation occurs.
- No actual runtime transport, route, worker credential, queue or app button is introduced by this slice. Synthetic dependency tests prove orchestration, not runtime isolation, factual accuracy or hosted quota wiring. This preparation must not be represented as a connected agent.

## Required verification

Failing tests first for denied runtime, exhausted allowance, bounded input/output, no IDs/buyer names sent, malformed or instruction-bearing output, public destination rejection, stale context, one attempt on failure and deadline cancellation. Then full lint/types/unit tests/build. One independent review before PR delivery.

## Owner dependencies

Supabase plugin connection and target project are requested; do not collect secrets in chat. A real restricted agent needs a dedicated state directory, empty tools/plugins/channels, no personal memory, verified transcript retention and a chosen model/billing source. Do not copy credentials or enable the owner's general gateway. Native eligibility and permitted platform access remain independent gates before ingestion or sending.

## Verification and review

The initial focused test run failed because the module was absent. After implementation, all **13 drafting tests** passed. Full lint and TypeScript passed; all **89 unit/API/database tests** passed. The local default build again hit its sandbox port-binding restriction; the Webpack production build passed. This module has no application caller, so the already verified and deployed UI is unchanged.

Independent reviewer found no Critical or Important defects and independently reran the 13 focused tests.

- Final: minor (deferred): the test named “changed during generation” currently changes context at the first check. Add a distinct post-generation changed-context regression before wiring a live provider; the existing post-generation context-unavailable case does run after generation. Cost: less regression coverage for that branch, not an observed implementation defect.
- Final: Ruling: runtime tool isolation, retention, cancellation and billing are unverified because no transport exists. Keep both runtimes disconnected; require dedicated runtime evidence before admission. Cost if wrong: integrating prematurely could expose personal data or exceed intended resource limits.
- Final: Ruling: hosted ownership/shared quota are trusted future adapter responsibilities, not properties established by these synthetic dependencies. Do not expose this boundary as a public route before authenticated ownership and durable quota tests pass. Cost if wrong: unauthorized access or uncontrolled usage.
- Final: Ruling: factual accuracy and prompt-injection resistance are not established by schema validation. Every output remains a review draft, with public comments excluded. Cost if wrong: seller review may miss inaccurate text; no automated sending is provided.
- Final: Ruling: the reviewer did not rerun deployment or the full suite. Executor evidence above and the separate static deployment record cover those checks; no live runtime/cloud acceptance is implied. Cost if wrong: environment-specific issues remain until hosted/device acceptance.
