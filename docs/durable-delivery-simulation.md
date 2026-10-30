# Durable delivery simulation

This is a database-backed engineering lab for the controlled-outbox stage of the sales-assistant plan. It complements the browser-only `/buyer-lab`. It has **no real sender, channel reader, release switch, worker credential grant or UI integration**. The foreground Mac draft worker does not call it. Normal inbox approval still authorizes clipboard copying only.

## Stored data and identity

Optional migration `202610300003_delivery_simulation.sql` adds four owner-isolated tables and an authenticated `delivery_simulation(jsonb)` RPC. Only an authenticated owner can run simulation commands; the narrow draft-worker key and anonymous callers cannot. Existing inventory, questions and replies remain the content source. The outbox stores an immutable candidate copy for exact-text/context auditing, not a second editable inbox.

A synthetic thread binds an owned item to channel, account, thread and public/private surface. A public comment also requires its post and exact comment ID. All external identifiers must start `synthetic:`; real IDs are rejected. The separate source binding references an existing owned inquiry, stable synthetic message ID and decimal-string revision. Reordered/conflicting revisions, changed destinations and cross-owner bindings are rejected. Incomplete/deleted sources cannot become candidates.

The separate `enqueue` action explicitly requests a simulation of a current Approved reply. This is not a sending permission. Future real capture/release/transport work requires its own permission checkpoint and reviewed integration; never attach a real sender to this RPC or to the existing browser simulator.

## State and failure behavior

- Controls start paused. `control` changes the global pause and revision; `threadControl` covers thread pause, native mode and seller takeover. Control/source changes cancel unsubmitted work. Switching out of native simulation mode requires `confirm_native_disabled: true`; it does not change any actual platform setting.
- `claim` returns a single 60-second fence/lease. `start` rechecks current facts, reply/source/control revisions, exact destination, owner activity, native mode and other in-flight/unknown operations in the thread. It durably records `submitted` before the fake adapter executes.
- Fresh observations wait 15 seconds; questions older than 24 hours are retired. At most three template simulations per thread/hour are admitted. Newer questions invalidate older pending responses. Confirmed source versions cannot be queued again.
- Public custom text is rejected even if approved for copying. The only public simulation template is `The asking price is PHP 850.00.` with the exact current numeric price formatted to two decimal places. It excludes descriptions, addresses and buyer identifiers. This lab does not classify intent or authorize an automatic live price response.
- Expired claims are canceled, not reassigned. An expired submitted operation becomes `unknown` when revisited; subsequent operations in that thread remain blocked. Pausing cannot recall an already submitted simulation.
- `confirmed` requires a synthetic receipt tied to the exact simulation ID and destination, with a synthetic external ID. Explicit reconciliation of `submitted`/`unknown` needs that same evidence; matching text is insufficient. An unknown result cannot move back to pending, and is never retried. A known fake rejection can be recorded as failed; no automatic retry follows.

`FakeDeliveryAdapter` is an in-memory external-service stand-in with confirmed/lost-acknowledgment/rejected outcomes. It has no URL or networking implementation. `runDeliverySimulation` only calls that class, never a live transport. A lost start acknowledgment prevents even the fake adapter call. A lost outcome acknowledgment reports unknown without repeating submission or writing another outcome.

## Run locally

```sh
npx vitest run tests/delivery-simulation.test.ts tests/delivery-simulation-database.test.ts
```

The tests use synthetic records and PGlite with the actual additive migrations. They cover owner isolation, closed table writes/private helpers, exact numeric-string revisions, two claim attempts, changes between claim/start, native/takeover/pause, source deletion/incompleteness, public destination separation, rate/debounce/backlog limits, lost acknowledgment and explicit reconciliation. A fresh caller sees persisted unknown state and cannot resubmit.

These tests do not prove separate-session PostgreSQL contention, process/OS crash recovery, hosted Auth/PostgREST, complete platform capture or real delivery semantics. The fake receipt log is memory-only; it is not an external provider's durable acknowledgment service. The next hosted checklist must use separate database sessions and remain synthetic. No migration was applied to a hosted project during development.

History lifecycle is not implemented: simulation foreign keys restrict deleting bound items, inquiries or replies, and there is no owner cleanup RPC. An administrator must deliberately remove dependent lab records before removing those source records. Decide and test retention/cleanup before broader use; do not apply the optional lab migration expecting automatic cleanup.
