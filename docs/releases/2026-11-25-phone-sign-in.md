# Phone code sign-in release — 25 November 2026

## Current disposition

Owner instruction: finish phone sign-in and deploy independently; do not merge without approval. Reuse `codex/phone-pwa`, PR #31 and the existing Artie/Janyl audience. This is publication authorization, not merge authorization.

**Sites version 22 is live.** The owner confirmed saving the requested Magic Link subject/body and reloading to check they persisted before publication. This is owner-confirmed template read-back, not an independent dashboard inspection. No new implementation or source packaging was needed for the already-reviewed candidate.

Deployment `appgdep_6b0684ba42948191b47be503f3d76cce` **succeeded** at **2026-11-25 06:48:46 UTC / 14:48:46 UTC+8**, environment revision **1**, at [Reseller Agent](https://reseller-agent-cloud.pandabur.chatgpt.site). Subsequent access read-back confirms the same custom Artie owner/Janyl viewer audience, policy revision **2**. PR #31 is still open and auto-merge is disabled.

## Exact candidate and access

- Site: `appgprj_6ae71d6a9ff48191bf09daf78d72ca92`.
- Saved version 22: `appgprj_6ae71d6a9ff48191bf09daf78d72ca92~appgver_ba029eabebf881919154b4f254f3192f`.
- Source: `082b84d616fca8ba8baf1bbe420681af78c7a8ee`.
- Hosted archive SHA-256: `ac6542d955840be8eca7561d388640f266cc9e49c45073bbfcad39baacb9435f`, 124 files, 3,246,080 bytes. The saved-version read-back confirmed this archive before deployment. The old temporary local archive has expired; it was not required to deploy an already archive-backed saved version.
- Local Sites checkout is clean at that exact source; its compiled artifact was tested unchanged.
- Current custom access read-back: Artie owner, Janyl viewer. Preserve this policy and environment configuration.
- Supabase project `ecusonvqyjnuwjhvcivb`: **ACTIVE_HEALTHY**; health advisors returned no notices.

## Fresh verification

- `npm run check`: lint, types, **309 tests passed**, six optional skips, and production build passed. The initial sandboxed attempt could not bind loopback listeners (16 failures); the authorized network-capable rerun passed without source changes. These were execution-environment failures, not fixed product defects.
- `npx playwright test --config playwright.sites-production.config.ts`: **74 passed** against the exact compiled candidate, desktop/mobile synthetic cloud contracts. Includes same-app code verification/session reopening, expired/uncertain verification, account isolation and accessibility checks.
- `RESELLER_PWA_SITES=1 npx playwright test --config playwright.pwa.config.ts`: **four passed**, including actual service-worker offline recovery and cache-content checks. These use isolated synthetic browsers, not the owner's signed-in browser or a physical iPhone.
- Main and prepared Sites `npm audit --omit=dev --json`: **zero findings** each. This does not claim a clean development-tooling audit.
- GitHub head `04335983f817227bd109274435906dbcf188cae0` passed Application checks run **44184799831**. Subsequent changes for this release checkpoint are documentation only.
- No real sign-in email, model request, worker activation, credential extraction or account/access change was made.

## Email-template dependency — resolved by owner

The Supabase connector still has no Auth-template editing method. The available browser tool cannot initialize because its configured Chrome executable is absent (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`). No browser was installed and no saved credentials/session files were read to bypass that limitation.

The owner was asked to open [Magic Link email templates](https://supabase.com/dashboard/project/ecusonvqyjnuwjhvcivb/auth/templates), save subject **Your Reseller Agent sign-in code** and a body displaying the literal `{{ .Token }}`, then reload and confirm both persisted. The owner replied **“saved and checked”** before deployment. The tracked [complete template](../../supabase/templates/magic-link.html) is suitable; the requested minimal message with the same code/in-app instructions is functionally equivalent. No SMTP, invitation, public-signup, token length/expiry or rate-limit change was requested or made by the agent.

Current official docs confirm the shared OTP/Magic Link implementation and `verifyOtp({ email, token, type: 'email' })`: [passwordless email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless). The 25 November changelog review found no applicable change requiring an Auth flow redesign.

## Actual-device acceptance — owner reported

The owner was asked to reopen the Home Screen app, request one code if signed out, enter it privately, then close/reopen and confirm the correct inventory; the question explicitly offered reporting an already-signed-in session instead. The owner replied **“works.”** Record this as **owner-reported successful iPhone code sign-in/reopen acceptance**, including the requested email step, not as an independently observed browser session. No real email request was made by the agent, and no code was read or logged. No additional logout/email request is needed to repeat the accepted check.

The phone sign-in fix is deployed and accepted by the owner. Ten-photo/cross-device/second-user acceptance and the broader permitted-channel/AI-worker work remain separate; this report does not close those gates.

Keep PR #31 unmerged. Preserve version 20 provenance for recovery, but do not roll back to a link-only UI against a code-only email without coordinating the template too. No automatic buyer reading/sending, normal OpenClaw restart or model call belongs to this release.
