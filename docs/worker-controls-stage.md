# Owner worker controls — 30 October 2026

Branch `codex/draft-worker-controls`, based on `22858da` (PR #9). Implementation is in progress; not deployed.

## Scope and acceptance

Add cloud-only inbox controls for the existing draft queue: explicit worker enrollment/revocation, pause/resume with revision checking, select an Open private question to queue, and cancel/view recent jobs. Never install or start an agent, read platform messages, approve a draft or send a reply from these controls.

Worker keys are shown once in component memory, cleared on close/account switch and never persisted, logged or placed in a URL. A copied key remains in the owner's clipboard until replaced. Enrollment failures must not retry automatically; reload and revoke an unexpected worker before enrolling again. Every mutation refreshes server state, with failures preventing another mutation until a successful reload.

Ruling: implement an expandable panel inside the owner-keyed inbox, sharing its authentication lifecycle. Keep it absent in the credential-free demo because enrollment there would imply a real worker connection. Existing unsaved question/reply text must survive panel operations.

Ruling: cloud browser tests use synthetic Auth/PostgREST responses, isolated in a separate Playwright configuration. This proves client behavior only; PGlite covers database authorization and hosted Auth acceptance is still pending.

## Execution evidence

- Plan/installed Next client directive guide read; branch created from a clean tree.
- Next: failing browser cases, implementation, focused/full checks, independent final review, reviewable PR. Existing skill workspace helper remains bypassed per the recorded automatic-review rejection; direct commands and this tracked record carry evidence.

- RED: the owner workflow failed because Worker settings was absent; four boundary tests failed against the placeholder. GREEN: validated owner client and panel now pass all four unit cases and eight desktop/mobile browser cases.
- Initial browser failures were fixture issues: ambiguous Cancel selector, duplicate synthetic worker IDs, and a storage-only account change that omitted the SDK's BroadcastChannel event. Corrected the fixtures to match the installed Auth SDK. Lint also caught the render-time clock read; expiry labels now use the last refreshed timestamp.
- Verified failed enrollment does not auto-retry or lose question text; stale settings disable mutations until reload; pause cancels queued work without revival; late enrollment after account switch does not reveal the old key. Accessibility and mobile overflow checks pass.
- Full unit/API/database suite: **116 passed**. Cloud browser suite: **8 passed** with synthetic accounts. No Supabase connector is available yet; hosted acceptance is not claimed.
