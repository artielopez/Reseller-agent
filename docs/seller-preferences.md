# Seller terms and inbox review

This branch adds **Inbox review** and **Seller terms and reminder** to `/inbox`. It is not yet merged or deployed to the shared Sites demo.

Save your general pickup area, delivery notes and payment methods/conditions. All start blank; templates and worker drafts can use them in private replies. Public comment templates exclude these terms. They do not confirm receipt of payment, reserve an item or commit to a meeting. Every draft still needs human review and manual posting.

Changing terms makes earlier approvals unusable and requires a fresh draft/review. Existing saved draft text, original facts and unsaved editor text are retained. Changing only the reminder leaves reply approvals valid. Saving from an outdated tab fails and retains typed preferences; refresh settings explicitly to discard them and load the current version.

The summary counts **up to 200 latest saved questions**, matching the inbox scope. It shows Open questions, questions with a current approved reply ready to copy, questions with replies needing review, and questions received since the last explicit summary review (or today's Manila midnight). It does not count uncaptured Facebook or Carousell messages. Future-dated received times do not count as newly received. Marking the summary reviewed changes no question/reply status. Refresh to update counts.

An optional daily reminder is off by default. When enabled, it appears on opening/refreshing the inbox after the chosen **Asia/Manila** time, until the summary is marked reviewed that day. This is an in-app reminder only; there is no timer, notification delivery, email, daemon or external schedule.

## Setup and persistence

- Demo: preferences share the existing version-2 IndexedDB buyer store under a separate key; inventory/questions remain intact. They are browser-local and do not sync.
- Cloud: apply `202610310001_seller_preferences.sql` after the initial, buyer inbox and draft queue migrations. The optional delivery simulation migration is not required. This additive migration has not been applied to a hosted project.
- RLS permits owner reads; writes go only through authenticated `seller_workspace` with an optimistic revision. Terms have an independent revision. Draft-worker contexts include saved terms, and existing start/submit checks reject changed facts. Defaults do not invalidate legacy contexts.
- Copy and approval always recheck current facts. A summary is a snapshot, not authority to send a reply. No platform connection, automatic sending or paid model request is added.

## Acceptance still required

Hosted two-account/multi-session RLS and contention checks, physical iPhone/Safari, and real worker/model acceptance remain pending. Local PGlite and synthetic browser checks do not establish those live properties. Summary scope is intentionally bounded to the same 200 saved questions; there is no history report or external notification service.
