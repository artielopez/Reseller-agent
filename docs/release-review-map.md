# Review map — 3 November 2026

No merge or auto-merge is authorized for this increment. The owner must approve a concrete final PR/head before merge. Sites publication is a separate, previously authorized delivery path.

The open GitHub requests #8–#27 all target `main` and preserve successive development snapshots. The worker-health branch continues from #27 head `e50e99d`; it includes the accumulated work. Do not merge each snapshot independently or cherry-pick overlapping migrations. For final integration, review the latest cumulative PR against `main`, verify that all earlier branch heads remain ancestors, then obtain owner approval. Only after the approved integration succeeds should superseded requests be closed. No PR was closed, rebased or merged during this preparation.

| Review area | Earlier PRs | Main evidence |
| --- | --- | --- |
| Owned queue and restricted worker | #8–#13 | Queue RLS/capability/lease tests; runtime isolation and process supervision |
| Simulation and seller terms | #14–#15 | Optional fake delivery remains separate; seller-context approval invalidation |
| Private cloud and sign-in | #16–#18 | Supabase setup, custom SMTP, private audience and invitation recovery |
| Subscription drafting and workflow | #19–#22 | Hosted queue checks and bounded OpenClaw trial; optional SIWC timeout remains unresolved |
| Photos and reliability | #23–#27 | Ten-photo limits, HTTP/concurrency/crash tests, PT409 fix, inventory CAS |
| Current increment | worker-health-workflow | Per-question queue/status/reload, advisory health, read-only privacy preview |

## Release checks

- Match the source commit and hosted migration mapping; do not blindly push local migration history to the existing Supabase project.
- Apply the additive privacy-preview migration before exposing its UI. It adds no tables or writes. Older clients remain compatible; rolling back this UI does not require dropping the function.
- Keep inventory save-revision support when selecting any rollback version.
- Package the existing Sites project, preserve Artie/Janyl's custom audience, retain exact source/version/deployment receipts, and verify the new read-only panels using the signed-in owner session.
- Keep the draft worker paused and its trial capability revoked. Publishing a request button does not authorize a new model call or continuous operation.
- Do not equate automated tests with Janyl's own save/photo acceptance, actual ten-photo cloud upload, physical iPhone/Windows checks or physical Mac recovery. These remain in the acceptance register.
- Channel integration remains gated by permitted access. The Carousell inquiry stays unsent; the Beeper inquiry is awaiting its response. Group comments require separate coverage.
