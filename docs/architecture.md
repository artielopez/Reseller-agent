# Architecture and decisions

## Small application, explicit boundaries

A single Next.js app serves the mobile and desktop workspace. A client-side inventory editor uses Supabase's browser SDK for authentication, database access and private storage. PostgreSQL row-level security is the authorization boundary; hiding UI is not treated as access control. All cloud data requests use the signed-in user's token. The only custom backend endpoint is `POST /api/generate`, which verifies identity with Supabase before any paid work.

Using the same provider for auth, database and images avoids operating a separate API server, job queue or media service. There is no service-role key in this application. OpenAI credentials live only on the server.

## Persistence

- `items`: facts, PHP asking price and the five inventory states.
- `item_photos`: ordered private object paths; at most six positions per item. The first photo is the cover.
- `listings`: one row per item/channel, independently editable title/description, manual publication state, URL and publication timestamp.
- `buyer_inquiries`: manually recorded questions linked to an owned item, with explicit private/public surface and database-managed revision. No platform ingestion is implemented.
- `suggested_replies`: manual/template drafts linked to an owned inquiry, with immutable item/question context and revision-bound approval. No send action exists.
- `ai_usage`: user/day counter for paid generation attempts. Readable by its owner; mutable only through a constrained security-definer quota function.

Composite foreign keys prevent a child row from referencing another owner's item or inquiry. Every application table has RLS. The Storage bucket is private, accepts JPEGs up to 2 MB, and restricts reads/inserts/deletes to the user's folder. Clients cannot overwrite objects. Signed URLs are short-lived bearer links (24 hours); anyone given one can view that photo until expiry, so avoid sharing them publicly.

`save_inventory_item` executes with caller privileges. It writes the item, replaces photo metadata, and upserts all three listings in a transaction. A failed channel validation rolls everything back. Storage upload cannot be part of a PostgreSQL transaction: images upload first, then metadata commits, and removed images are cleaned up afterward. Interrupted operations can leave orphan files; see limitations.

The demo repository uses IndexedDB to hold complete item records and compressed photo data. It never calls Supabase. It uses the same validation and editor as cloud mode. Demo entries do not migrate automatically to a signed-in account.

Demo listing generation also runs locally in the browser, so the same UI can be exported as a static Site. `scripts/prepare-sites-demo.mjs` prepares an isolated Next.js export with API routes omitted and constant demo-only configuration. ChatGPT Sites hosts this separate output; the canonical app retains its Node.js API route for cloud use. Each browser/origin has its own inventory, including when opening the hosted Site on different devices.

## Generation

The route accepts only bounded JSON item facts (16 KiB request maximum). Unknown properties are stripped by validation. A server dependency boundary handles verified authentication, durable quota reservation and provider calls independently, allowing API failure paths to be tested without a paid service.

Demo mode and live mode without an OpenAI key return deterministic channel-specific templates marked `source: template`. Paid mode returns `source: ai` after validating structured output. Provider failures return a safe error rather than quietly substituting a successful-looking template. Item text is supplied as data, with explicit instructions to preserve facts and disclosed defects. The model has no tools or access to the database, photos, buyer accounts or posting APIs. Human review is still required: schema validation cannot establish factual accuracy.

## Editing and publication

Item facts and generated copy are deliberately separate. Changing the price or description does not silently rewrite existing channel text. Regeneration asks before replacing all channel copy. Every save includes all three channels. Copying text or opening a platform does not change publication status; the seller explicitly records the URL/status after posting.

The application does not reconcile external platform state. Inventory status is also manually set, so a reserved item can still have active listings. This is transparent in the UI and leaves the seller in control of cross-platform updates.

## Cost and operational limits

Images are resized locally; no image transformation service is required. The app makes one AI request per generation click and no background requests. The limit is 20 requests per user per Asia/Manila day, with a bounded output and no retries. Disable public Supabase signups, use a project-specific OpenAI key and configure account budgets/alerts. Providers' free tiers and commercial terms may change.

Last-write-wins saves are appropriate for an initial personal workspace, but simultaneous editing on two devices can overwrite changes. A future revision can add optimistic concurrency with `updated_at` or a revision counter. No realtime subscription, analytics service or external font/image host is required.

## Reviewed buyer inbox

`/inbox` uses the existing authenticated Supabase client and the `buyer_workspace(jsonb)` RPC. This security-definer function explicitly filters every operation by `auth.uid()`, caps command size at 16 KiB, locks item → inquiry → reply, and rejects stale revisions/context. Direct authenticated buyer-table writes are revoked; RLS still scopes reads. Helper functions are not client-callable. Database triggers invalidate approvals when relevant item/question facts change, even outside the UI. IDs make inquiry/draft creation retries idempotent when content is identical.

Cloud context preserves exact saved text, including whitespace. Legacy nullable buyer names normalize to an empty string; old approvals without snapshots return to Draft with text intact. Copy rechecks approval and context in the database, but cannot recall text already on the clipboard. Marking Answered is a separate manual action.

The browser demo upgrades the existing IndexedDB to version 2 and evaluates inbox commands in one transaction spanning inventory and buyer stores. Cloud and demo data stay separate. Account changes unmount private UI; explicit sign-out and navigation protect unsaved text. Session expiry clears private UI immediately. All buyer replies are labeled templates or manual text; no paid model, worker, outbound queue or sending endpoint is added. Existing inventory saves still use last-write-wins; buyer mutations use revision checks.
