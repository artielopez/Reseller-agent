# Sites dependency maintenance — 4 November 2026

The Next.js repository and the retained Sites/Vinext source have separate lockfiles.
Auditing only the main repository does not cover the deployed adapter. In particular,
some packages declared as development dependencies (React Server Components and
Vinext) contribute to the Worker build and must be included in the review.

## Reviewed patch baseline

The separate Sites production audit initially reported six affected packages
(one critical, three high and two moderate). After the changes below,
`npm audit --omit=dev` reports zero advisories. This is a registry snapshot, not a
claim of exploitability before the patch or a security certification afterward.

| Dependency | Previous | Patched |
| --- | --- | --- |
| Next / eslint-config-next | 16.3.4 | 16.4.3 |
| React / React DOM / react-server-dom-webpack | 19.2.6 | 19.2.9 |
| Vite | 8.0.13 | 8.1.6 |
| sharp | 0.35.4 | 0.35.5 |
| undici | 7.24.8 | 7.30.1 |
| source-map-js | 1.2.1 | 1.2.2 |
| fast-uri | 3.1.7 | 3.1.9 |
| baseline-browser-mapping | 2.10.30 | 2.11.35 |
| image-size (Vinext override) | 2.0.2 | 2.0.4 |

The source preparation script preserves these reviewed framework/override pins.
The Sites lockfile also refreshes ws to 8.21.0 and compatible brace-expansion,
browserslist, js-yaml and Babel transitive patches. React, React DOM and RSC stay
matched. Vinext, Cloudflare integration, hosting identity and audience are retained.
Miniflare's exact undici pin required an override: a normal targeted update left
the vulnerable version installed, and its optional OpenAI peer initially retained
a second copy. The final installed tree resolves both to 7.30.1.

Primary advisory evidence: [Next ImageResponse](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j),
[React Server Functions](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g),
[sharp/librsvg](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)
and [undici shared-cache redirects](https://github.com/nodejs/undici/security/advisories/GHSA-4w7w-5xrc-9h26).
The app does not implement an ImageResponse route or shared undici cache. That
observation limits those specific paths; it does not establish that every adapter
path is unaffected. No exploit was attempted against the hosted app.

## Verification and remaining work

The patched adapter passes all **42 desktop/mobile cloud-contract checks** using
synthetic Auth/RPC responses. `playwright.sites.config.ts` starts an owned local
Vinext server on port 3019 with fake public configuration and no model key. It
does not access the owner's signed-in browser, real Supabase data or buyer services.
Run it separately from other browser suites:

```sh
npx playwright test --config playwright.sites.config.ts
```

The broader audit still reports **26 affected packages (24 moderate, two low)**,
with no high/critical findings. Its remaining root advisories involve minimatch,
esbuild, satori and fflate, including inherited adapter/tooling findings. Do not
describe the entire Sites dependency tree as finding-free. Follow-up needs a
reviewed adapter/toolchain upgrade or compatible transitive fixes, followed by
the same checks. Do not use `npm audit fix --force`: its proposed downgrade of
ESLint or Drizzle is not an acceptable compatibility strategy.

For future maintenance, open the existing source with the Sites helper, run
`node scripts/prepare-sites-cloud.mjs` from the main repository, refresh the
Sites lockfile only for reviewed package changes, then run the supported Sites
`install-dependencies.mjs` helper. Keep inputs unchanged during installation.
Run both production and full audits in **each** repository, inspect affected
runtime paths, then run types, relevant tests and the supported Worker build.
Package/publish the exact pushed Sites source through the normal helper. A local
manifest or GitHub commit alone does not update the hosted app.

Signed-in cloud/physical-device acceptance remains separate from these synthetic
adapter checks. Release provenance is recorded in the overnight ledger.

## Follow-up patch and triage — 04:55 Manila

The next compatible patch resolves fflate 0.7.4 to 0.7.5 and the recent esbuild
copies used by Vite, tsx and Wrangler to 0.28.1. Range-scoped overrides preserve
Drizzle's older build API; installed-tree inspection caught an initially retained
0.28.0 copy before release. The full Sites audit now reports **23 moderate
affected packages**, with no low/high/critical findings. Counts include dependent
packages inheriting one underlying advisory; they are not 23 distinct defects.

The remaining roots are:

- **minimatch:** used by the lint toolchain with repository/configuration globs.
  The app does not expose a buyer-supplied glob interface. The maintainer's
  [advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249)
  identifies pattern amplification and a fix in 11.0.1. Existing lint plugins call
  the legacy function export, so a global major override is not a reviewed fix.
  Main-repository full audit also reports 16 moderate affected packages inherited
  from this root; its production audit was clean. No main dependency was changed.
- **legacy esbuild 0.18.20:** retained by Drizzle's old ESM loader. This app uses
  Supabase SQL migrations and does not invoke Drizzle or esbuild's serving API.
  The remaining advisory concerns that serving API. Keep preview servers owned,
  local and temporary; do not force the legacy loader onto a different build API
  solely to change an audit count. The newer Windows serving-path fix is applied
  to the active modern build copies. [Maintainer advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-g7r4-m6w7-qqqr).
- **satori:** inherited from Vinext's ImageResponse support. The application has
  no ImageResponse/OG-image route and does not render buyer text through Satori.
  A later adapter upgrade can remove this finding, but requires reviewing the
  matched React/RSC/plugin changes and repeating the adapter acceptance checks.

These observations narrow the known paths; they do not waive the findings or
prove all framework code is unreachable. No exploit was run, no dependency was
hidden from the audit and no platform permission was changed.
