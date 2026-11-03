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
