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

Supabase Site URL and its sole exact Redirect URL are now `https://reseller-agent-cloud.pandabur.chatgpt.site`. Public signup remains disabled. Sites currently adds an owner-only ChatGPT access gate; Supabase provides the separate application session and data ownership. No identity claim from Sites is used to bypass Supabase RLS.

**Artie's application invitation was sent.** The dashboard lists the owner app user and a read-only Auth count confirmed one invited user, zero confirmed users immediately after sending. This was the initial state; the recovery follow-up below records the subsequent successful activation and sign-in. The owner was asked to open the cloud Site and complete ChatGPT access before following the Supabase email on the same device, so the outer access gate does not interrupt the email-link return flow.

**Janyl has not yet been invited.** The project has no custom SMTP sender, and Supabase's default sender is restricted to organization team addresses. The owner explicitly chose private app access for Janyl and proper email delivery, rather than Supabase organization membership. Do not add her to the database/admin team as an email workaround. Her email is confirmed in the conversation, not stored in the repository. Her Sites viewer grant should be added when the app invitation can be completed; adding it may itself send a Sites email.

The owner supplied artielopez.com, managed by Cloudflare, for the email service. Resend's [Supabase SMTP integration](https://resend.com/docs/send-with-supabase-smtp) requires a verified domain and a provider credential entered securely. Resend is now signed in and the sender subdomain is verified after the three owner-approved DNS additions. No paid subscription or SMTP credential was created. Do not claim both invitations were delivered or that authenticated user acceptance is complete.

## Verification

- Main app lint and type checks passed.
- **171 standard tests passed; six optional installed-runtime tests skipped.** An initial sandbox run could not bind the local drafting gateway; the authorized loopback-enabled run passed.
- Main Next.js Webpack production build passed.
- Isolated Sites TypeScript check and Worker production build passed.
- Browser inspection of the built cloud inventory and inbox confirmed private sign-in screens, without demo data. Live Sites owner sign-in completed and the deployed app screen rendered successfully.
- Requests to the built `/api/generate` endpoint with no token and an invalid token both returned HTTP 401 with the intended sign-in error.
- A stricter Worker type definition exposed untyped generation JSON. The app now validates the response envelope and source label with Zod before using the existing copy schema. Error bodies are checked before displaying their message.
- Full authenticated save/photo/inbox flows, physical iPhone acceptance and two-user HTTP/Storage isolation remain pending until app sign-in is available. Earlier hosted database isolation checks remain recorded in `cloud-workspace-setup.md`; they do not replace these checks.

The optional fake-delivery lab migration is still absent. No real worker, paid model, buyer reader or sender was activated.

## Reproduction and next work

Initialize the supported Sites starter in the dedicated checkout only once, preserve `.openai/hosting.json`, then run `node scripts/prepare-sites-cloud.mjs` from the application root. Refresh the dedicated lockfile when copied dependency versions change, install with the Sites helper, inject public build configuration from ignored environment files, and use the source workflow helper for checks/build/commit/push/package. Publish the exact returned artifact and source commit. Do not run the static demo preparation script against the cloud checkout.

Next: finish email-service/domain setup, add Janyl's Sites viewer access and Supabase app invitation, then verify both accounts' own-data workflows. [Multi-organization MCP findings](supabase-mcp-access.md) are separate from app sign-in.

## Invitation recovery follow-up

The owner's mobile screenshot was traced to an expired invitation, followed by `signup_disabled` for ordinary OTP login on the still-unconfirmed account. The pending invitation was renewed through the dashboard's Send invitation flow; database timestamps verified success. A generic confirmation-resend button did not advance the send timestamp and was not counted as successful recovery.

The deployed app now distinguishes invitation activation from later sign-ins and displays fixed, actionable messages for expired redirects and known Auth failure codes. It never displays raw error descriptions, tokens or arbitrary provider text. URL feedback is hydration-safe and reacts to hash/history navigation. Four focused regression tests plus lint/types and the Worker build passed. Published source `97d16365d48ec5e17dbf7e893d5cadd9405f79fc`, deployment `appgdep_6ae867cbdfd88191b88038ef3e39fc8c` succeeded; a later read-only Auth query confirmed one email-confirmed user and one user with a successful sign-in timestamp. The owner account is activated. [PR #18](https://github.com/artielopez/Reseller-agent/pull/18) remains open and unmerged; implementation head `46f8730` passed GitHub Application checks.

The owner supplied artielopez.com. Its DNS uses Cloudflare and root MX records point to Google. Resend setup will use auth.artielopez.com, preserving existing root mail/DNS. Resend is signed in and the dedicated sender domain is verified. Cloudflare login is now confirmed. The owner approved the three DNS verification records at action time. They are now saved and resolve with the exact expected public DNS values; Resend now reports **Verified** for the domain. No credential was created. The owner handoff is prepared with a Resend key named `Reseller Agent Supabase Auth`, permission **Sending access**, restricted to `auth.artielopez.com`; the Add button has not been submitted. The owner must create/copy the key and enter/save it directly in Supabase, never in chat. The unsaved Supabase form specifies `login@auth.artielopez.com`, sender name Reseller Agent, `smtp.resend.com`, port 465 and username `resend`; the credential is absent and custom SMTP has not been enabled in the saved configuration. The generated records are one DKIM TXT at `resend._domainkey.auth` and DNS-only CNAMEs `rsend.auth` → `rsend-apne1.forge.rmta.net` and `send.auth` → `send.forge.rmta.net`. Copy the DKIM value directly from the domain dashboard. Receiving remains disabled. Do not add the optional root DMARC suggestion without inspecting the existing root email policy. Domain ID: `4d8ac982-4c85-4fa8-9686-4414051f64ec` (Tokyo).
