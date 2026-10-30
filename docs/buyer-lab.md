# Buyer reply lab

A browser-local prototype of reply decisions and simulated outcomes. It does not read messages, use paid AI, connect OpenClaw/Hermes, post comments or send replies.

## Run and try

Use Node 22, run `npm ci`, enable `NEXT_PUBLIC_DEMO_MODE=true` in `.env.local`, and run `npm run dev`. Open `http://localhost:3000/buyer-lab` or choose **Try buyer replies** in the inventory demo banner. Without demo mode, the route explains that the lab is unavailable and does not load live inventory.

1. Choose **Resume simulation** and **Routine templates**.
2. Keep the headphone sample selected and add “How much?”. The asking price comes from saved inventory.
3. Choose **Simulate delivery**. Reload: the simulated result persists and cannot be submitted again.
4. Add “Available?”. Listed stock needs **Confirm demo item available**, then **Process again**. Confirmation expires after 24 hours and changes to item facts invalidate it.
5. Add a negotiation, reservation or complex question. It stays in review; you can edit a private draft and approve its exact text for simulation.
6. Try **Simulate uncertain result**. It freezes that outcome with no blind retry.
7. Select a channel's native-replies checkbox or take over a conversation. Custom simulation stops for that scope. These controls do not change platform settings or stop native replies.

Only invented questions belong here. Each UI sample creates a fresh conversation; unit tests cover same-conversation updates, replay and limits. Demo events are aged 20 seconds so the 15-second debounce does not slow manual testing. Public Group samples get synthetic post/comment IDs. Custom public text is disabled; only narrow factual templates can be simulated in routine-template mode.

## Implemented boundaries

- Validated synthetic inputs, deduplication, item matching, question/policy/fact revision checks.
- Narrow English/Filipino price and availability templates, private condition template; everything else needs review.
- Pause, per-conversation takeover, native-channel exclusion, 24-hour stale-message rejection, 15-second debounce and three routine replies per thread/hour.
- Atomic browser queue updates across tabs, claim tokens, locked completed/unknown results and interrupted-claim recovery.
- IndexedDB validation and visible storage errors; capped at 200 samples. Corrupt saved data is rejected rather than silently erased.
- Responsive accessible screen, editable private drafts, persisted simulation results. Draft edits must be approved before simulation.

## Not production-ready

This is a vertical slice of Tasks 2, 4 and 5, **not their completion**. There is no Supabase conversation/outbox migration, cloud authentication/ownership enforcement for this queue, enrollment, worker daemon, model provider, external sender, email reader, clipboard workflow, reconciliation with external evidence, monitor or pilot. Native features and personal-account integration permission remain unresolved; see [account evidence](research/channel-capability-evidence.md).

Queue operations serialize across tabs, but inventory is a separate browser database and is re-read immediately before each decision. That is sufficient for this no-send simulator, not an atomic live inventory/send guarantee. Do not attach a real sender to it. A server transaction and dedicated outbox are required before a live pilot.

Each browser/device has separate storage. This branch has not updated the shared Sites deployment. Clearing this site's browser storage removes its demo samples. No new dependencies or environment variables are required beyond existing demo mode.
