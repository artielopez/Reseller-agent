# Review map — updated 15 November 2026

The owner approved “Merge and deploy everything” on 15 November. Cumulative PR
#29 merged into `main` as `a2e0d73db216a9f6d7db2383ed8b11f1c2391718`.
The read-only ancestry check preserved all 21 heads of PRs #8–#28, and GitHub
subsequently recorded those included requests as merged too. No separate snapshot
merge, branch deletion or cherry-picking was needed. Sites version 19 is live.
[Exact release receipt](releases/2026-11-15-merged-cloud.md).

The table below remains a map of the integrated work. Later changes require their
own review scope; this approval does not activate automatic messaging or workers.

| Review area | Earlier PRs | Main evidence |
| --- | --- | --- |
| Owned queue and restricted worker | #8–#13 | Queue RLS/capability/lease tests; runtime isolation and process supervision |
| Simulation and seller terms | #14–#15 | Optional fake delivery remains separate; seller-context approval invalidation |
| Private cloud and sign-in | #16–#18 | Supabase setup, custom SMTP, private audience and invitation recovery |
| Subscription drafting and workflow | #19–#22 | Hosted queue checks and bounded OpenClaw trial; optional SIWC timeout remains unresolved |
| Photos and reliability | #23–#27 | Ten-photo limits, HTTP/concurrency/crash tests, PT409 fix, inventory CAS |
| Worker health | #28, worker-health-workflow | Per-question queue/status/reload, advisory health, read-only privacy preview |
| Current increment | #29, overnight-reliability | Request/save/session recovery, saved-question corrections and account-switch isolation |

## Release checks

- Match the source commit and hosted migration mapping; do not blindly push local migration history to the existing Supabase project.
- Apply the additive privacy-preview migration before exposing its UI. It adds no tables or writes. Older clients remain compatible; rolling back this UI does not require dropping the function.
- Keep inventory save-revision support when selecting any rollback version.
- Package the existing Sites project, preserve Artie/Janyl's custom audience, retain exact source/version/deployment receipts, and verify the new read-only panels using the signed-in owner session.
- Keep the draft worker paused and its trial capability revoked. Publishing a request button does not authorize a new model call or continuous operation.
- Do not equate automated tests with Janyl's own save/photo acceptance, actual ten-photo cloud upload, physical iPhone/Windows checks or physical Mac recovery. These remain in the acceptance register.
- Channel integration remains gated by permitted access. The Carousell inquiry stays unsent; the Beeper inquiry is awaiting its response. Group comments require separate coverage.

Released increment: [PR #28](https://github.com/artielopez/Reseller-agent/pull/28), implementation `ee843e4`; Sites version 9, source `2b7919c121c53d7cf08bc9bc825d94a687d60157`. The privacy migration and rollback-only hosted checks passed. Signed-in post-release UI check awaits local browser access. No merge/auto-merge.

Current release: merged [PR #29](https://github.com/artielopez/Reseller-agent/pull/29),
Sites **version 19**, source `963295ceef8e75a8ff0177b7deb727bfdd2c33db`.
Fresh release checks passed Sites types/build and 52 compiled desktop/mobile
contracts. The merged tree matches the previously verified head `b52af0a`;
physical-device and hosted-account acceptance remain separate.
