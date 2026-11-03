# Hosted workspace setup — 1 November 2026

This is the initial 1 November setup snapshot, except for the migration mapping maintained below. Later sign-in, email, account and release evidence is in [current status](project-status.md). Do not interpret the initial unprovisioned-user or localhost statements as current configuration.

## Actual resources

- Organization: **Artie's Projects**, `oitbiothcymcqgcocyqo`, Personal / Free. The owner's explicit organization choice supersedes earlier SoleVault proposals.
- Project: **Reseller Agent**, `ecusonvqyjnuwjhvcivb`, Singapore (`ap-southeast-1`), reported `ACTIVE_HEALTHY` after creation.
- [Supabase dashboard](https://supabase.com/dashboard/project/ecusonvqyjnuwjhvcivb).
- API URL: `https://ecusonvqyjnuwjhvcivb.supabase.co`.
- All ten public application tables have RLS enabled. The `item-photos` bucket is private, JPEG-only, with a 2 MiB limit.
- Email provider enabled; public signup, anonymous sign-in and manual account linking disabled; email confirmation enabled. No application user provisioned yet.
- Auth Site URL is still the default `http://localhost:3000`; no extra redirect URL exists. Configure the final shared cloud URL before sending an invitation. The Sites demo URL is not a cloud-auth destination.

The current ChatGPT Supabase connector lists only Artie's Projects. Its OAuth authorization replaced the earlier SoleVault scope. [Supabase's maintainer explanation](https://github.com/supabase/mcp/issues/304) describes the single-organization hosted OAuth restriction. A separate local CLI/MCP arrangement can use appropriately scoped multi-organization access; it has not been configured. Existing SoleVault projects were not modified.

## Applied migration history

The connected Supabase tool applied exact repository SQL, assigning its own remote version identifiers:

| Local file in `supabase/migrations/`  | Remote version   | Remote name                   |
| ------------------------------------- | ---------------- | ----------------------------- |
| `202610280001_initial.sql`            | `20261101105011` | `reseller_initial`            |
| `202610300001_buyer_inbox.sql`        | `20261101105020` | `reseller_buyer_inbox`        |
| `202610300002_draft_queue.sql`        | `20261101105027` | `reseller_draft_queue`        |
| `202610310001_seller_preferences.sql` | `20261101105034` | `reseller_seller_preferences` |
| `20261102183945_ten_item_photos.sql`  | `20261102184444` | `ten_item_photos`             |

Additional mapping verified 3 November: local `20261102202606_non_retryable_conflicts.sql` → remote `20261102203123`, name `non_retryable_conflicts`. This is the sixth required migration; existing function permissions are preserved.

Additional mapping verified 3 November: local `202611030001_inventory_save_revision.sql` → remote `20261103030151`, name `inventory_save_revision`. This is the seventh required migration; existing-item edits require a save revision and the matching Sites version 8 client.

The optional `202610300003_delivery_simulation.sql` is not applied: no app screen or drafting worker uses that engineering lab.

**Do not blindly run `supabase db push` on this project.** Local filenames and remote history identifiers differ. Use this mapping to inspect what already exists; reconcile history deliberately before adopting CLI-managed pushes. Do not reapply the initial migration, rename applied files, or assume the optional simulation is deployed. No migration-history repair was performed.

## Verification performed

[`scripts/acceptance/hosted-database.sql`](../scripts/acceptance/hosted-database.sql) ran against the actual hosted database. It creates synthetic users and content inside one transaction, exercises PostgreSQL roles, then rolls back:

- Save/read owned inventory and its three listing channels.
- Save a buyer question and draft, approve, and copy without marking the question answered.
- Preserve approval when only reminder settings change; reject stale approved copy and return the reply to Draft after seller terms change.
- Reject a different owner's inventory/thread access; return only their own inbox and preferences.
- Verify the worker defaults to paused, anonymous inbox access fails, and an invalid worker capability is rejected.
- Verify the private photo bucket's type/size restrictions.

The result was `passed: owned inventory/inbox/terms; stale-copy rejection; paused worker; anonymous/token rejection; private bucket`. A separate post-rollback read confirmed zero users, items, inquiries, replies, workers and preferences.

Real HTTP requests using only the project publishable key also rejected anonymous inventory reads, anonymous inbox RPC access and an invalid worker token: HTTP 401 / PostgreSQL `42501`. Auth's public settings endpoint confirmed `disable_signup: true` and email enabled. The local Next.js cloud preview rendered the private email-link sign-in screen without demo content.

These checks do **not** establish emailed login, an authenticated JWT round trip, photo upload/download isolation, real separate-session contention, paid model behavior or physical iPhone use. Those remain acceptance work. The SQL script requires administrative test execution and must be submitted as one transaction, never statement-by-statement with an intervening commit. On error, roll back the session before continuing.

Security Advisor reports no missing-RLS warning, but flags intentional SECURITY DEFINER RPC exposure:

- One [anonymous-executable warning](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable): `draft_worker`, which validates its scoped, hashed, expiring worker capability. Invalid-token rejection passed over SQL and HTTP. No worker is enrolled.
- Five [authenticated-executable warnings](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): `buyer_workspace`, `draft_queue`, `draft_worker`, `reserve_ai_generation`, `seller_workspace`. They are deliberate bounded application entrypoints with owner/capability checks. This is not a finding-free security scan or a substitute for ongoing privilege review.

## Local configuration

Ignored `.env.cloud.local` was created with file mode 600. It contains the project URL and modern publishable key under the existing `NEXT_PUBLIC_SUPABASE_ANON_KEY` variable; no service-role, secret or model key was fetched. The existing demo `.env.local` is preserved. Never commit either file.

To launch the cloud preview without replacing demo configuration, from this checkout using Node 22:

```sh
node -e 'process.loadEnvFile(".env.cloud.local"); const child=require("node:child_process").spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port","3023"],{stdio:"inherit",env:process.env}); child.on("exit",code=>process.exit(code??1));'
```

This loads environment variables before starting Next. Directly launching Next with Node's `--env-file` failed because the development child process propagated that argument into `NODE_OPTIONS`; the command above passed. Port 3023 is local to the Mac mini, not a Windows/shared URL. It is not currently an approved Auth redirect.

## Artie and Janyl

The owner confirmed their email for their app account and requested Janyl's separate inventory. The existing per-user schema supports this without a second Supabase project: each signed-in user owns their items, photos, listing records, buyer inquiries, reply drafts and preferences. There is no shared-household inventory or owner impersonation UI. Administrative dashboard access is different from app access and should not be given to an app user merely to sign in.

Keep registration invitation-only. The owner account has not yet been invited; wait until a working cloud URL and matching Auth redirects are available. The owner has now supplied Janyl's email in the conversation for her invitation; keep personal contact details out of the repository. No invitation has been sent to either person.

Read-only Sites verification confirms the existing owner-private demo supports external visitor invitations, currently with none. Granting Janyl access to that demo would only share the demo interface: it would not connect her data to Supabase. A cloud publication needs its own tested configuration and supported identity flow. Preserve the demo's audience until an actual sharing change is authorized with a recipient.

## Remaining release work

1. Publish a tested cloud-capable app URL; preserve the separate credential-free demo. The current Sites export explicitly disables Supabase and server API routes. Evaluate the supported Sites server/identity path before changing that contract; do not simply rename the demo or claim it syncs.
2. Configure exact Auth Site/redirect URLs, provision the authorized app users and verify email-link login. Use the owner-confirmed email addresses for the invitations. No passwords or API keys in chat.
3. Complete authenticated inventory, photo, inbox and preference checks from separate browser/device accounts, including cross-account photo rejection and sign-out/state clearing.
4. Obtain review/release approval for unmerged application branches. This operational setup PR is based on PR #15, and includes that unmerged stack when compared with main.
5. Configure a dedicated restricted worker and optional model key only after hosted user acceptance; then verify live quota, cancellation and revocation. Keep workers paused until then. No platform reading/sending is enabled by any of this setup.
