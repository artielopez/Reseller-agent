# Shared buyer inbox stage — 30 October 2026

The owner requested continuation after the next-step proposal. Work stays on `codex/shared-buyer-inbox`, based on PR #6; no merge or live sending.

## Execution decisions

- Continue access research without installing a bridge, subscribing to CarouBiz, contacting support or exposing an agent gateway. Native mobile entitlement needs the actual mobile account UI; desktop emulation cannot prove it.
- Build the manual reviewed inbox as the useful shared-data foundation while connector permission remains unresolved. Reuse `buyer_inquiries` and `suggested_replies`, not a second cloud message store. Each inquiry is one manually recorded question; future connection/thread/event tables will reference its ID when ingestion is permitted. No worker/outbox/enrollment completeness claim.
- Add one authenticated, bounded command RPC for list/read/save/approve/copy/status. Derive ownership from auth.uid(), lock item → inquiry → reply, retain immutable context snapshots, and invalidate approvals on relevant item/inquiry edits. Deny direct inquiry/reply writes. Revision strings preserve bigint precision.
- The first provider is a labeled deterministic template or manually written draft. No paid model or agent connection in this stage. This avoids extending the generation quota until restricted inference is ready.
- Cloud uses the existing Supabase session. Demo uses the existing inventory IndexedDB in an additive version upgrade so reading facts and saving/copying a reply share one transaction. No demo/cloud sync or automatic import. The separate synthetic lab remains unchanged.
- UI: manually record question with item/channel/private-vs-public destination; inspect facts, create/edit a draft, approve exact text, copy only a fresh approved draft; mark Answered separately. Public drafts require explicit review and are never automatically sent.

## Verification contract

Test owner isolation, anonymous/direct-write rejection, stale revisions, changed item facts after drafting, approval invalidation, idempotent creates, copy-vs-Answered separation, malformed inputs and upgrade preservation. Browser tests cover local reload, approval/copy, changed facts, public scope and accessibility. Run lint/types/full tests/build and the browser suite. Final independent review required by executing-plans skill. Preserve the worktree and create a review PR targeting main.

Use direct test commands and this execution record; the prior helper script was stopped after a permission-error loop and is not needed.

## Implemented and verified

The route, demo/cloud repositories, incremental migration and review/copy workflow are implemented. Question editing and a dismiss UI are not part of this slice. Received time defaults to now. Cloud stores records centrally but needs explicit reload on another device; no realtime sync is claimed. The UI shows the latest 200 questions, with demo caps of 200 questions and 2,000 drafts.

Independent review fixes preserve raw saved description text in context matching, normalize legacy nullable buyer names, retain unrelated unsaved drafts and guard explicit sign-out/navigation. Legacy Approved replies lose approval but retain their body; fresh drafting is required because no historical context was saved.

Verification on 30 October: lint, TypeScript, 76 unit/API/database tests and Webpack production build passed. Default Turbopack build was blocked by a local sandbox port-binding restriction. All 34 browser checks passed against the production build, covering desktop and iPhone-size Chromium. The new inbox contributed eight checks. Hosted Supabase acceptance, actual Safari and external agent/platform integration remain pending. No live migration, deployment, merge, account connection or sending occurred.

Use the [README setup](../README.md#set-up-your-private-cloud-workspace) and [live checklist](mvp-checklist.md#live-acceptance-checklist) before relying on cloud synchronization. The normal CI build command remains unchanged so GitHub can verify Turbopack in its runner.
