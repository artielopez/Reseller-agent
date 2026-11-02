# Shared cloud app — 1 November 2026

## Deployment

[Open Reseller Agent cloud](https://reseller-agent-cloud.pandabur.chatgpt.site).

The new cloud Site is separate from the existing credential-free browser-local demo. The owner explicitly authorized finishing the cloud app/sign-in flow and sending invitations to the two named app users. This authorizes this cloud publication; no GitHub PR was merged.

- Sites project: `appgprj_6ae71d6a9ff48191bf09daf78d72ca92`.
- Source checkout: `.sites/reseller-agent-cloud` (ignored in the GitHub repository; independently versioned in Sites).
- GitHub source base: `344c928` plus the response-validation/preparation changes now on this feature branch; the initial generated README did not label the local changes. The preparation script now records dirty source explicitly. The exact independently published Sites commit below is authoritative.
- Published source: `a56253240f1719fcac14bed2046b7fe9714a9c67`.
- Saved version: `appgprj_6ae71d6a9ff48191bf09daf78d72ca92~appgver_73b15f99b5648191b9f0a2b43f3c857b`.
- Deployment: `appgdep_6ae71f1c1d8c8191b1dec884a022c8a0`, native status **succeeded**.
- Environment revision 1: cloud mode, Supabase URL and publishable key. No service-role or OpenAI key configured. The public key is bundled for the browser as required, but excluded from source files and masked in hosted environment tools.
- Supabase project: `ecusonvqyjnuwjhvcivb` in Artie's Projects.

The repository remains a Next.js App Router app. Sites hosts the same source through its supported Vinext/Cloudflare Worker adapter, retaining the server-side `/api/generate` endpoint. The preparation script copies only application source/public files into an initialized Sites starter, retains hosting identity/integration helpers, and never copies credentials or browser data. The dedicated source repository owns its locked adapter dependencies.

## Sign-in and invitations

Supabase Site URL and its sole exact Redirect URL are now `https://reseller-agent-cloud.pandabur.chatgpt.site`. Public signup remains disabled. Sites adds a private ChatGPT access gate allowing the owner and Janyl as a viewer; Supabase provides the separate application session and data ownership. No identity claim from Sites is used to bypass Supabase RLS.

**Artie's application invitation was sent.** The dashboard lists the owner app user and a read-only Auth count confirmed one invited user, zero confirmed users immediately after sending. This was the initial state; the recovery follow-up below records the subsequent successful activation and sign-in. The owner was asked to open the cloud Site and complete ChatGPT access before following the Supabase email on the same device, so the outer access gate does not interrupt the email-link return flow.

**Janyl's invitation is delivered.** The owner completed the prepared Resend credential handoff and saved custom SMTP. The Supabase dashboard confirms a stored password and custom SMTP enabled. Sending her app invitation succeeded, and Resend's Sending list reports **Delivered**, subject “You've been invited,” message ID `01a19bea-5fc8-7342-8cae-9054359b1698`. This verifies SMTP delivery to the recipient server, not that she has opened the email.

Sites access revision 2 retains audience `custom`, preserves the owner and adds Janyl as an external **viewer**. No editor or Supabase team/admin role was granted. A subsequent read-only Auth query returned two app users, two invited users, one confirmed user and one signed-in user. Artie is activated; Janyl's activation is pending. She should open the cloud Site with the invited ChatGPT account first, then follow the newest invitation on the same device.

The verified email sender is `login@auth.artielopez.com` through Resend. The owner created and securely entered the sending-only credential; it was not read, copied into chat or stored by the agent. No paid subscription was created.

## Verification

- Main app lint and type checks passed.
- **171 standard tests passed; six optional installed-runtime tests skipped.** An initial sandbox run could not bind the local drafting gateway; the authorized loopback-enabled run passed.
- Main Next.js Webpack production build passed.
- Isolated Sites TypeScript check and Worker production build passed.
- Browser inspection of the built cloud inventory and inbox confirmed private sign-in screens, without demo data. Live Sites owner sign-in completed and the deployed app screen rendered successfully.
- Requests to the built `/api/generate` endpoint with no token and an invalid token both returned HTTP 401 with the intended sign-in error.
- A stricter Worker type definition exposed untyped generation JSON. The app now validates the response envelope and source label with Zod before using the existing copy schema. Error bodies are checked before displaying their message.
- Full authenticated save/photo/inbox flows, physical iPhone acceptance and two-user HTTP/Storage isolation remain pending user acceptance. Earlier hosted database isolation checks remain recorded in `cloud-workspace-setup.md`; they do not replace these checks.

The optional fake-delivery lab migration is still absent. No real worker, paid model, buyer reader or sender was activated.

## Reproduction and next work

Initialize the supported Sites starter in the dedicated checkout only once, preserve `.openai/hosting.json`, then run `node scripts/prepare-sites-cloud.mjs` from the application root. Refresh the dedicated lockfile when copied dependency versions change, install with the Sites helper, inject public build configuration from ignored environment files, and use the source workflow helper for checks/build/commit/push/package. Publish the exact returned artifact and source commit. Do not run the static demo preparation script against the cloud checkout.

Next: confirm Janyl's invitation acceptance and verify both accounts' own-data workflows, including photo persistence and physical-device use. [Multi-organization MCP findings](supabase-mcp-access.md) are separate from app sign-in.

## Invitation recovery follow-up

The owner's mobile screenshot was traced to an expired invitation, followed by `signup_disabled` for ordinary OTP login on the still-unconfirmed account. The pending invitation was renewed through the dashboard's Send invitation flow; database timestamps verified success. A generic confirmation-resend button did not advance the send timestamp and was not counted as successful recovery.

The deployed app now distinguishes invitation activation from later sign-ins and displays fixed, actionable messages for expired redirects and known Auth failure codes. It never displays raw error descriptions, tokens or arbitrary provider text. URL feedback is hydration-safe and reacts to hash/history navigation. Four focused regression tests plus lint/types and the Worker build passed. Published source `97d16365d48ec5e17dbf7e893d5cadd9405f79fc`, deployment `appgdep_6ae867cbdfd88191b88038ef3e39fc8c` succeeded; a later read-only Auth query confirmed one email-confirmed user and one user with a successful sign-in timestamp. The owner account is activated. [PR #18](https://github.com/artielopez/Reseller-agent/pull/18) remains open and unmerged; implementation head `46f8730` passed GitHub Application checks.

The owner supplied artielopez.com. Its DNS uses Cloudflare and root MX records point to Google. Resend setup will use auth.artielopez.com, preserving existing root mail/DNS. Resend is signed in and the dedicated sender domain is verified. Cloudflare login is now confirmed. The owner approved the three DNS verification records at action time. They are now saved and resolve with the exact expected public DNS values; Resend now reports **Verified** for the domain. The owner completed the credential handoff for `Reseller Agent Supabase Auth`, prepared with **Sending access** restricted to `auth.artielopez.com`. The saved Supabase configuration uses `login@auth.artielopez.com`, sender name Reseller Agent, `smtp.resend.com`, port 465 and username `resend`; custom SMTP is enabled and the stored password remains hidden. The generated records are one DKIM TXT at `resend._domainkey.auth` and DNS-only CNAMEs `rsend.auth` → `rsend-apne1.forge.rmta.net` and `send.auth` → `send.forge.rmta.net`. Copy the DKIM value directly from the domain dashboard. Receiving remains disabled. Do not add the optional root DMARC suggestion without inspecting the existing root email policy. Domain ID: `4d8ac982-4c85-4fa8-9686-4414051f64ec` (Tokyo).

## End-to-end readiness publication — 2 November

The owner explicitly approved publishing the inbox-navigation and copy-recovery fixes after automatic review blocked the separate Sites source push. This approval did not authorize a GitHub merge. Sites source `dfcbc9438b381fc093524645e61eca2534853ea0`, saved version `appgprj_6ae71d6a9ff48191bf09daf78d72ca92~appgver_cc4eab61697c8191bda9e7b6bfe9ad81`, deployment `appgdep_6ae88c7039748191b186764364d7cef6` succeeded. Environment revision remains 1 and access remains custom for Artie/Janyl.

Live browser acceptance confirmed inventory persistence, normal inbox-link navigation, the actual saved subscription-generated Agent Draft, explicit review approval and manual-copy recovery. The synthetic item’s changed price invalidated the earlier template approval in the database. The AI draft was initially saved unapproved by the worker; later UI approval was part of the explicit synthetic acceptance test. Nothing was sent, and the question remains Open. The acceptance worker is revoked and queue paused. Photos, Janyl activation and physical-device checks remain incomplete.

Main verification: 203 standard tests, lint, app/worker types and Webpack production build. Four installed OpenClaw OAuth integration tests passed. Final rebuilt demo passed 20 focused desktop/phone-sized browser checks. Sites types/Worker build passed. [PR #20](https://github.com/artielopez/Reseller-agent/pull/20) is open/unmerged; its implementation head is `81e6213`, and GitHub checks were still running at the last read.
