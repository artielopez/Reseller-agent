# Merged cloud release — 15 November 2026

Owner instruction: “Merge and deploy everything.” This supersedes the previous
no-merge restriction for the completed cumulative work and this release record.

- GitHub PR #29 head: `b52af0a6106b9f34fdfd6be5c9997c0c25d403e9`.
- Merge commit: `a2e0d73db216a9f6d7db2383ed8b11f1c2391718`.
- Merged at 2026-11-14 18:13:16 UTC (15 November 02:13:16 Manila).
- All 21 included PR heads (#8–#28) verified as ancestors before merging; GitHub
  records them as merged. Merge tree matches the passing feature head exactly.
- Sites project: `appgprj_6ae71d6a9ff48191bf09daf78d72ca92`.
- Sites source: `963295ceef8e75a8ff0177b7deb727bfdd2c33db`.
- Version **19**: `appgprj_6ae71d6a9ff48191bf09daf78d72ca92~appgver_5c7778d2bec48191978b874a3f98047c`.
- Deployment: `appgdep_6af8a529d0308191be00bca72a8ebc34`, **succeeded** at
  2026-11-14 18:15:27 UTC; environment revision 1 unchanged.
- URL: https://reseller-agent-cloud.pandabur.chatgpt.site
- Audience: Artie owner, Janyl viewer; their application inventories stay separate.

## Verification

The exact feature head passed GitHub checks (run `41730402429`: 292 tests with
six optional skips, lint/types, builds and Next browser suites). Merge CI run
`43625370624` passed at 2026-11-14 18:17:03 UTC after publication, including
application checks/builds and both Next browser suites.

Prepared from merged main with the existing source-copy script and supported
Sites 1.1.6 workflow. Dependency inputs and application source were unchanged
from the previously deployed version; the source README now records the merge
commit. The helper ran Typescript checks and a production Worker build, then
pushed and packaged the exact source. The output contains the intended public
Supabase configuration, without synthetic browser-test settings.

Fresh `npx playwright test --config playwright.sites-production.config.ts` passed
**52/52** desktop/mobile recovery and account-isolation checks against the rebuilt
artifact. The fixture uses invented accounts and blocks unhandled backend/write
HTTP requests. Log: `/tmp/reseller-merged-release-browser.log`. No credentials,
real account session, cloud-row changes or model requests were used.

## Remaining boundaries

No schema update, enrollment, allowance change, normal OpenClaw restart or worker
auto-start was needed. Existing subscription drafting remains supervised; actual
provider/device checks and supported channel intake/delivery remain outstanding.
This release does not turn on automatic reading/sending. The scheduled overnight
heartbeat stays paused. See the acceptance register for the unfinished broader
project rather than interpreting this merge as completion of every pilot gate.
