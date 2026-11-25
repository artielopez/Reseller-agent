# Phone code sign-in release — 25 November 2026

## Current disposition

Owner instruction: finish phone sign-in and deploy independently; do not merge without approval. Reuse `codex/phone-pwa`, PR #31 and the existing Artie/Janyl audience. This is publication authorization, not merge authorization.

**Publication is pending the Supabase Magic Link template save/read-back.** No deployment has been started. Sites version **20** remains live; version **22** is saved and ready. No new implementation or source packaging is needed for the already-reviewed candidate.

## Exact candidate and access

- Site: `appgprj_6ae71d6a9ff48191bf09daf78d72ca92`.
- Saved version 22: `appgprj_6ae71d6a9ff48191bf09daf78d72ca92~appgver_ba029eabebf881919154b4f254f3192f`.
- Source: `082b84d616fca8ba8baf1bbe420681af78c7a8ee`.
- Hosted archive SHA-256: `ac6542d955840be8eca7561d388640f266cc9e49c45073bbfcad39baacb9435f`, 124 files, 3,246,080 bytes. The saved-version read-back confirms this archive is retained and has no deployment yet. The old temporary local archive has expired; it is not required to deploy an already archive-backed saved version.
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

## Critical dependency

The Supabase connector still has no Auth-template editing method. The available browser tool cannot initialize because its configured Chrome executable is absent (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`). No browser was installed and no saved credentials/session files were read to bypass that limitation.

The owner was asked to open [Magic Link email templates](https://supabase.com/dashboard/project/ecusonvqyjnuwjhvcivb/auth/templates), save subject **Your Reseller Agent sign-in code** and a body displaying the literal `{{ .Token }}`, then reload and confirm both persisted. The tracked [complete template](../../supabase/templates/magic-link.html) is suitable; a minimal message with the same code/in-app instructions is functionally equivalent. Preserve SMTP, invitations, public-signup restrictions, token length/expiry and rate limits. Do not deploy a code-requesting UI while the email still contains only a link.

Current official docs confirm the shared OTP/Magic Link implementation and `verifyOtp({ email, token, type: 'email' })`: [passwordless email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless). The 25 November changelog review found no applicable change requiring an Auth flow redesign.

## Resume and release

1. Establish template save/read-back evidence. If the owner performs it, record it explicitly as owner-confirmed rather than an independent dashboard inspection.
2. Refresh the Site audience if it has changed. Deploy **saved version 22** to the same Site, without saving another increment or changing the audience. Keep PR #31 unmerged and auto-merge disabled.
3. Follow the returned deployment ID to a terminal result; record the exact receipt here. Preserve version 20 provenance for recovery, but do not roll back to a link-only UI against a code-only email without coordinating the template too.
4. Verify real delivery and an installed-iPhone sign-in/reopen using one deliberate code request. The owner enters the code privately; do not retrieve it from Gmail, log it or ask them to paste it in chat. Synthetic checks do not establish this actual-device acceptance.
5. Update the phone/selling guides and current status with the deployed result. No automatic buyer reading/sending, normal OpenClaw restart or model call belongs to this release.
