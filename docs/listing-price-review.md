# Listing price review — 2 November 2026

Base: `0881796`, following unmerged PR #20. Branch: `codex/listing-price-review`.

The hosted acceptance lamp was saved at PHP 900 while its editable channel copy still said PHP 850. There was no nearby warning. Fix this without overwriting seller wording or changing publication records.

Ruling: show the current asking price beside each channel's copy and flag explicit peso amounts that differ. This is an advisory text check, not a semantic assertion that a shipping charge or discount is wrong. It works for existing saved copy after reload without a database migration. Amounts written in words or unsupported notation may be missed; always remind the seller to review every detail. No automatic text replacement or extra approval step.

Steps: reproduce the price-change/reload/channel behavior in a browser regression; implement the small advisory check; run unit/browser checks, lint, types and build; fresh review; update status and deliver a reviewable PR. No GitHub merge.

Verification: browser reproduction failed before implementation (missing review panel). Final standard suite: 220 passed, six optional skips. Desktop/mobile inventory and price-review browser suite: 14 passed. Lint, types and Webpack production build passed. Fresh review found a comma-punctuation parsing issue; three added regressions failed, then passed after the fix. No remaining important finding from that review. Cloud publication pending.
