# Reseller Agent on your phone

## Install on iPhone

1. Open [your cloud workspace](https://reseller-agent-cloud.pandabur.chatgpt.site) in **Safari**. If the link opened inside an email app, choose Open in Safari first. Complete the existing hosting sign-in if requested.
2. Tap **Share → Add to Home Screen**. If shown, enable **Open as Web App**, then tap **Add**.
3. Open the new **Reseller Agent** icon while online. Sign in inside that app if requested.

An old Home Screen shortcut may retain its old icon or browser behavior. Keep any unsaved work, then remove only the shortcut and add it again. Do not clear website data to refresh an icon.

## Sign in with an email code

Email-code sign-in is published in **Sites version 22** on 25 November 2026. The owner confirmed the matching email template was saved/read back before publication. PR #31 remains unmerged. [Release receipt](releases/2026-11-25-phone-sign-in.md). Older emails may contain only a link; request a fresh code when signing in.

To sign in:

1. Open the Reseller Agent Home Screen icon and enter your email.
2. Tap **Email me a sign-in code**.
3. Read the newest email on any device and return to the PWA.
4. Enter its code in **Email sign-in code**, then tap **Verify code and sign in**.

This creates the session in the app where you enter the code. You do not need to open a URL in Safari. Codes are single-use; an expired/invalid code requires a fresh request. Codes are cleared after submission and are never stored or logged by the app. A timed-out verification is not repeated while its SDK request remains pending.

The optional **Sign in inside this app** details section remains a fallback for old sign-in emails and unused invitations. New accounts must first accept their invitation. The hosting gate can also request its existing sign-in when first opening the icon.

### Operator setup and recovery

The owner confirmed the live Magic Link subject **Your Reseller Agent sign-in code** and a code message containing `{{ .Token }}` were saved/read back. The complete equivalent template is `supabase/templates/magic-link.html`. If restoring/recreating configuration, open Authentication → Email templates → Magic Link and use that template/subject. Preserve the current email provider, invitation settings, signup restrictions, token length/expiry and rate limits. This template sends a code without a browser link. Coordinate email/app rollback: a link-only UI cannot use a code-only email. An ordinary request uses `signInWithOtp` with `shouldCreateUser: false`; verification uses `verifyOtp({ email, token, type: 'email' })`.

Do not use a database update or extract credentials to bypass dashboard access. The Supabase MCP integration available here does not expose email-template updates. Configuration and delivery must be verified separately from synthetic browser tests.

## What works offline

Inventory, photo uploads, sign-in and buyer drafting require internet access. The app does **not** queue writes, generate replies or send messages offline. If a connection drops while editing, keep that screen open and reconnect before saving. Closing/reloading can lose unsaved edits.

After one successful online load, supported browsers can show a plain reconnect page when the app is reopened offline. **Try again** returns to the workspace after the connection is restored. Browser storage eviction or blocked service workers can prevent this fallback; the online app still works.

Only this generic offline page is stored in the service worker's cache. It does not cache inventory, private photos, buyer messages, sign-in callbacks or API responses. Existing Supabase session storage is unchanged. The separate clearly labeled demo still keeps its sample/user-entered data in browser IndexedDB as documented in the README.

Updates load when online. Worker updates do not force a reload over unsaved edits. Close and reopen the app after saving work if a previously installed worker is waiting to update.

## Verification and remaining device check

The regression suite checks manifest/icon delivery, real browser service-worker installation, offline navigation and recovery, cache contents, and synthetic email-link sign-in persistence/error recovery. Mobile browser emulation is **not** a physical iPhone installation test.

Remaining acceptance on an actual iPhone:

- Add the current cloud site to Home Screen and check its icon and standalone launch.
- Sign in in the installed app, close/reopen, and confirm the correct private inventory.
- Save an item with up to ten photos; reopen and verify them.
- Turn off connectivity, confirm the warning/reconnect screen, restore connectivity and reopen the inventory.
- Open the buyer inbox and confirm review/copy works. This does not enable automatic platform reading/sending.

Engineering checks:

```sh
npx vitest run tests/pwa-auth.test.ts tests/pwa-worker.test.ts
npx playwright test --config playwright.pwa.config.ts
npm run test:e2e:cloud
# After building the existing Sites artifact:
RESELLER_PWA_SITES=1 npx playwright test --config playwright.pwa.config.ts
```

Recreate committed icons with `node scripts/generate-pwa-icons.mjs`; the original vector is `public/favicon.svg`. Keep app responses out of `public/sw.js` caches. Change the offline cache version when modifying the cached offline page. Next uses its response-header configuration; Sites also receives static `_headers` for service-worker/manifest revalidation.

References: [Apple's Home Screen instructions](https://support.apple.com/en-gb/guide/iphone/iphea86e5236/27/ios/27), [WebKit on separate web-app storage](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/), [Supabase token-hash verification](https://supabase.com/docs/reference/javascript/auth-verifyotp).
