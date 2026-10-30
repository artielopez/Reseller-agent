# Reseller Agent

A mobile-first workspace for selling personal secondhand items in the Philippines. Keep inventory and photos together, draft copy for Carousell, Facebook Marketplace and Facebook Groups, then copy and post it yourself.

Built with Next.js App Router, TypeScript, Tailwind CSS, Supabase and the server-side OpenAI Responses API. No scraping, platform credentials, automatic posting or buyer-message access.

## Project continuity

See the [current status](docs/project-status.md), [project plan](docs/project-plan.md), and [buyer reply implementation plan](docs/superpowers/plans/2026-10-28-buyer-replies.md). The [imported handoff](docs/project-handoff.md) is a historical reference. The browser-local [buyer reply lab](docs/buyer-lab.md) now tests sample questions, review rules and simulated delivery at `/buyer-lab`. The [saved buyer inbox](docs/shared-inbox-stage.md) at `/inbox` supports manually entered questions and reviewed clipboard replies in demo or Supabase mode. Live capture and a delivery queue are not implemented. A separate Mac worker can draft explicitly queued saved private questions after cloud/runtime setup. Pull requests remain unmerged until the owner approves.

## Try it in demo mode

**Hosted demo:** [Open Reseller Agent on ChatGPT Sites](https://reseller-agent-demo.pandabur.chatgpt.site). Sign in with the same ChatGPT account that owns the Site. This link works across computers and phones, but inventory/photos remain in each browser's storage and do not sync. Drafts are deterministic templates; there is no paid AI or Supabase connection in this demo.

Requires Node.js 22 and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. No accounts, API keys or paid services are needed.

The demo starts with four clearly labeled sample items and original SVG illustrations. Add your own items, upload multiple photos, generate template copy, edit each channel, record publication URLs and change inventory statuses. Demo changes and photos persist in **IndexedDB in this browser only**. They do not sync across devices and can be lost if browser storage is cleared. Use browser site-data controls to reset the demo. There is no automatic demo-to-cloud import.

The banner identifies demo mode. The generation result explicitly says **no AI was used**. Setting `NEXT_PUBLIC_DEMO_MODE=true` disables cloud access and paid AI even if credentials exist. If both Supabase values are absent, the app also defaults to demo mode; a partially configured Supabase project shows an error.

## Set up your private cloud workspace

### 1. Create Supabase and apply the migrations

1. Create a Supabase project and securely retain its database password.
2. In its SQL Editor, run the full contents of [`supabase/migrations/202610280001_initial.sql`](supabase/migrations/202610280001_initial.sql) **once** on the new project. The script creates the tables, RLS policies, save/quota functions and the private `item-photos` bucket. Do not create a public photo bucket.
3. Then run [`202610300001_buyer_inbox.sql`](supabase/migrations/202610300001_buyer_inbox.sql) once. For an existing project that already applied the initial migration, apply only this new migration. It adds revision/context safeguards and restricts buyer writes to the authenticated RPC. Existing question/reply text is retained; old Approved replies become Draft because they lack a verified context snapshot. Create a fresh draft before approving them again.
4. Apply [`202610300002_draft_queue.sql`](supabase/migrations/202610300002_draft_queue.sql) for the draft-only worker foundation. It adds paused controls, expiring/revocable worker enrollments and leased drafting jobs. It starts no worker and grants no platform access or sending.
5. Alternatively, with the Supabase CLI: run `supabase init`, `supabase link --project-ref YOUR_PROJECT_REF`, and `supabase db push` from this repository. Review the target project before pushing migrations. Generated local Supabase credentials must stay out of Git.
6. Copy the project URL and **public anon key** from the project's API settings. Do not use the service-role or secret key. This application does not require either.

All inventory rows and image paths are scoped to the signed-in user. The browser uses Supabase Auth and its public anon key; PostgreSQL and Storage enforce ownership. The save RPC uses the caller's privileges and saves the item, photo metadata and three channel records in one transaction.

### 2. Configure sign-in for your account

1. In Supabase Authentication, enable the email provider.
2. Set **Site URL** to your final app URL, and add `http://localhost:3000` plus your exact deployment URL to **Redirect URLs**.
3. Add your email account using Authentication → Users → Add user (create an email-confirmed user or invite your email). Configure redirects before sending an invitation.
4. **Disable public new-user signups** in the project's authentication settings. This is a personal workspace. The app's sign-in uses `shouldCreateUser: false`, but that alone cannot disable direct public signups through Supabase.
5. Keep the default magic-link email template, or ensure it uses Supabase's confirmation URL. If using custom SMTP, configure and test delivery. Supabase's default email service has delivery/rate restrictions; use authorized addresses during setup.

Use the app's email-link sign-in. A password is not required in the app. Open the emailed link on the device where you want to work. Sign in separately on your iPhone and computer to see the same inventory. The Supabase browser client processes the sign-in URL and refreshes the session. No cookie middleware is needed: private data is fetched after sign-in, and AI requests independently validate the bearer token server-side.

### 3. Set environment variables

Edit `.env.local` (ignored by Git):

```dotenv
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
OPENAI_API_KEY=YOUR_SERVER_ONLY_KEY
OPENAI_MODEL=gpt-6-luna
```

Restart the dev server after changing environment variables. `NEXT_PUBLIC_*` variables are embedded at build time, so rebuild/redeploy when changing them.

`OPENAI_API_KEY` is optional. Without it, the signed-in cloud workspace works and generation returns clearly labeled templates. With it, the server requests structured title/description output for all three channels. Only the written item facts are sent to OpenAI, **not photos**. Responses use `store: false`. Your provider's account and retention policies still apply. Review AI copy for accuracy before posting.

The model is configurable. The default is [`gpt-6-luna`](https://developers.openai.com/api/docs/models/gpt-6-luna), with reasoning disabled to keep this focused drafting request fast and bounded. If overriding, choose a Responses API model that supports structured outputs and `reasoning.effort: none`; ensure your OpenAI project has access and API billing enabled. No background jobs or continuous AI polling run. Each click makes at most one provider request, capped at 1,800 output tokens, with a 25-second timeout and no automatic retries. A database counter allows **20 paid generation attempts per user per Manila calendar day**, including failed attempts. Configure project budgets/alerts in your OpenAI dashboard too; this request limit is not a currency cap. Keep signups disabled to bound who can consume your key.

## Everyday workflow

1. Select **Add item**. Add up to six JPEG, PNG or WebP photos and enter the title, PHP asking price, condition, category and flaws. Photos are optional for a draft.
2. Select **Generate listing copy**. Review and edit the Carousell, Marketplace and Groups tabs. Regeneration asks before replacing existing copy.
3. **Save item**, then copy its title, description or full post into the platform. Add the photos through the platform's normal posting flow.
4. Paste the published URL into the matching channel, choose **Published**, and save. Copying does not mark anything published.
5. Track the overall item as **Draft → Ready → Listed → Reserved → Sold** as appropriate. All statuses remain manually selectable. Marking an item sold does not remove external listings; update each platform yourself.

Publication status and overall inventory status are separate. A published channel requires an HTTPS URL for the correct platform domain. External links are not fetched or verified by this app. The Sold summary totals **asking prices**, not payment receipts or actual sale proceeds.

Photos are resized to a maximum 1,600-pixel edge and re-encoded as JPEG before storage, reducing size and removing camera metadata. The input limit is 10 MB per photo; stored files are limited to 2 MB. For iPhone HEIC files, export JPEG first or use a compatible capture/export format. Cloud images use private signed URLs valid for 24 hours; reload a long-open page if they expire.

## Buyer questions and replies

Open **Open buyer inbox** from inventory, or visit `/inbox`:

1. Select a saved item, channel and private message or public Group comment. Paste the question, optionally add a buyer name, and save it. Received time is recorded as now.
2. Review the saved item facts. Prepare a labeled template or write your own draft. Templates are deterministic, not AI responses to the question; review and tailor the text.
3. Save edits, approve the exact saved text, then copy it. A changed price, item status or other relevant fact invalidates approval. Reload and create a fresh draft when context changes.
4. Paste and send through the original platform yourself. Mark **Answered** separately afterward. Copying does not send or mark a question answered.

Cloud mode stores owned questions and drafts in Supabase; sign in on each device and use **Reload inbox** to refresh. There is no realtime subscription. Demo uses IndexedDB version 2, preserving existing inventory while adding local questions; it never syncs across devices. The hosted Sites demo includes the manual inbox and synthetic lab; its data remains browser-local.

The inbox shows the latest 200 questions; demo storage is capped at 200 questions and 2,000 drafts. There is no inquiry edit/delete UI or connector yet. The [draft worker foundation](docs/owned-draft-queue-stage.md) is available for integration; cloud-only [worker settings](docs/worker-controls-stage.md) support enrollment, pause/resume and manual queue management. The optional foreground OpenClaw adapter is implemented; no live worker is configured or running. Public-comment templates omit the item description, but manually written text still needs your review. The app does not start OpenAI, OpenClaw or Hermes buyer inference in this stage. A separately configured restricted worker remains necessary. Approval authorizes copying only.

## Deploy

### ChatGPT Sites demo

The Sites version is a separate static export of this app. Demo generation runs in the browser, and the export excludes all API routes and hard-codes demo mode with empty Supabase settings. The full application's server-side AI and Supabase behavior remain available for a separate cloud deployment.

Run `node scripts/prepare-sites-demo.mjs` to create or refresh the isolated source checkout at `.sites/reseller-agent-demo` (ignored by this repository). It copies only selected source/configuration files, never local environment files, Git metadata or browser data. Existing Site identity and source Git metadata in that directory are preserved. The generated README records the application source revision. Install its locked dependencies and build it; `out/` is the static output. Use the Sites skill's source/version/deployment workflow to publish that exact build, reusing the existing `project_id` in `.openai/hosting.json`.

For browser verification, serve the exported `out/` directory locally and run `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 npm run test:e2e` against that server. The URL override skips starting Next.js and tests the actual static files.

See [current status](docs/project-status.md) for Site identity and deployment evidence. On a fresh computer, reopen that existing Site with the Sites source helper instead of registering another Site. Updating the source repository does not automatically republish the Site. Publishing the demo does not merge any GitHub PR.

### Full cloud application

Deploy to Vercel or another host that supports a Next.js Node.js server. A static export cannot run the AI route.

**Vercel:** Import `artielopez/Reseller-agent`, select Next.js, and set the environment variables above for the desired environment. Use Node.js 22, build command `npm run build`, and the default Next.js output. Deploy the reviewed branch as a preview or merge the PR to main when ready for production. Add each allowed deployment origin to Supabase Auth Redirect URLs. Do not deploy private data to a shared demo project.

**Other Node.js hosts:** run `npm ci`, `npm run build`, and `npm start` behind HTTPS. Expose the port required by your host (`PORT` defaults to 3000). Set environment variables before building and running.

HTTPS (or localhost) is needed for clipboard access. If clipboard permission is denied, the app explains how to copy manually. No paid hosting plan is inherently required by the code; review your providers' current usage limits and terms rather than assuming unlimited free capacity.

## Verification

```sh
npm run lint          # ESLint, no warnings permitted
npm run typecheck     # strict TypeScript
npm test              # domain, API boundary and PostgreSQL/RLS tests
npm run build         # production build
npm run check         # all four commands above
npx playwright install chromium
npm run test:e2e       # desktop and iPhone-size Chromium workflows
```

Tests never use paid AI or cloud credentials. Database tests execute the real migrations in PGlite (PostgreSQL in WASM) with local stand-ins for Supabase's `auth` and `storage` schemas. They cover cross-user isolation, atomic saves, invalid input, private storage policy and the daily quota. This does not replace a real Supabase Auth/Storage integration test. Browser tests run demo mode, including photo upload, generation, editing, publication tracking and reload persistence. GitHub Actions runs the checks on PRs and main.

After configuring your real services, follow the [live acceptance checklist](docs/mvp-checklist.md#live-acceptance-checklist). No real Supabase or OpenAI credentials were supplied during initial implementation, so email delivery, hosted storage and paid generation require that final check.

## Code map

- `src/components/` — responsive workspace, item editor and sign-in UI.
- `src/lib/domain.ts` — shared types, validation and deterministic template generation.
- `src/lib/repository.ts` — IndexedDB demo persistence and Supabase photo/save operations.
- `src/lib/buyer/` — validated inbox commands, demo/cloud adapters, exact context checks and templates.
- `src/components/buyer-inbox.tsx` — manual inquiry, saved draft, approval and copy UI.
- `src/lib/photos.ts` — client-side resizing and JPEG re-encoding.
- `src/lib/generation.ts` — bounded request parsing, authentication gate, quota and safe API responses.
- `src/app/api/generate/route.ts` — server-only OpenAI integration and verified Supabase identity.
- `supabase/migrations/` — tables, constraints, ownership policies and database functions.
- `tests/`, `e2e/` — automated behavior and security tests.

See [MVP checklist and limitations](docs/mvp-checklist.md) and [architecture notes](docs/architecture.md).

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Supabase email-link sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithotp), [Supabase Storage access policies](https://supabase.com/docs/guides/storage/security/access-control), and [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

### Draft worker settings (cloud only)

After all three migrations are applied, sign in and open **Buyer inbox → Worker settings**. Create a named worker key only when setting up a dedicated restricted worker. Save the one-time key securely and hide it; it expires in seven days and can be revoked. Do not use a general personal-agent chat to store it. Nothing starts automatically.

Drafting begins paused. Once the restricted runtime is configured and verified, deliberately resume, choose an Open private question and queue a draft. Pausing cancels outstanding jobs; resuming does not restart them. Refresh settings for job progress and reload the inbox to review completed drafts. If an enrollment fails ambiguously, reload and revoke the unexpected worker before creating a replacement. The Sites demo intentionally has no worker settings.

`npm run test:e2e:cloud` runs the cloud UI against synthetic Auth/RPC responses on port 3018. It uses fake public configuration, requires no credentials and does not replace hosted Supabase acceptance. Run it separately from another Next development server in this checkout.

The [single-request drafting boundary](docs/single-request-drafting-stage.md) adds a worker-only loopback endpoint and optional bounded OpenAI provider. It holds the model key in parent code and limits each endpoint to one provider invocation, even if an agent retries. It is not started by the app. The foreground launcher and durable queue wiring are implemented; live model/cloud acceptance remains pending. Mac developers can run its synthetic installed-runtime checks with `RUN_OPENCLAW_PROBE=1 npx vitest run tests/openclaw-gateway.test.ts`.

The optional foreground [Mac draft worker](docs/mac-draft-worker.md) processes explicitly queued saved private questions into review drafts. It requires private cloud setup and separate acceptance; it does not connect personal buyer channels or send messages.
