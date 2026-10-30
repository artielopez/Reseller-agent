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
