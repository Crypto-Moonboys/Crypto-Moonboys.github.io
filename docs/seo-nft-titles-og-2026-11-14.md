# SEO follow-up: WAX NFT page titles and social metadata

Reviewed: 14 November 2026. This follows `docs/seo-audit-2026-11-14.md` and the merged canonical Pages-artifact repair.

## Confirmed defects

- Several distinct `gkniftyheads` NFT template pages share the same character name and consequently an identical `<title>` and `og:title`. E.g. `wiki/gkniftyheads-tommy-the-titan-tucci-783369.html` and `wiki/gkniftyheads-tommy-the-titan-tucci-783372.html`. These are **different on-chain WAX templates**, not accidental duplicate template records. The page articles correctly retain their respective `data-collection` and `data-template-id` attributes.
- `moonboy-builder.html` and `wiki/noballgamess-nft-collection.html` lack complete Open Graph title/description and supporting share-card tags in the source. The Pages canonical builder already adds missing canonicals but does not populate editorial social descriptions.
- `scripts/noballgamess-tracker-lib.mjs` generates a complete copy of the NoBallGames collection HTML, so a fix to the generated page alone would be overwritten on the next scheduled rarity refresh.

## Changes

1. **Published-copied NFT head metadata only:** `scripts/seo-publish-canonicals.mjs` now groups sitemap pages with the exact same original title, then disambiguates the duplicates only when the page is an explicit WAX `nft_template` and the template ID/collection match the canonical filename. The published title and `og:title` receive a verified collection + template ID suffix. The meta description and `og:description` gain the same factual ID. The page H1, content, media, game/engagement code, rarity data, rankings, URLs, canonical links and repository source HTML remain unchanged.
2. **Ordinary articles:** Duplicate non-NFT titles are recorded as editorial warnings and never rewritten using guessed identifiers. A malformed/mismatched NFT identity is a build error before writing the artifact.
3. **Public tool and tracker:** `moonboy-builder.html` and `wiki/noballgamess-nft-collection.html` have self-consistent canonical, robots, `og:type`, `og:url`, `og:title`, `og:description`, `og:image` and Twitter card/image/title/description tags, using an existing public logo asset.
4. **Regeneration-safe:** The identical NoBallGames metadata is added to the `renderPage()` HTML in `scripts/noballgamess-tracker-lib.mjs`. Only the static head is adjusted; ranking weights, feed input data, calculations, refresh and transfer behavior are unchanged. A regression test verifies that the generator's literal head equals the committed page head.
5. **Visibility and tests:** Pages artifact preparation now prints the count of disambiguated WAX template titles. Regression checks include the known duplicate Tommy Tucci template pair, idempotence, body byte parity, mismatched-identity rejection, separate OG titles/descriptions, the published NoBallGames generator match, and the public share-card metadata.

## Build and verification

Use the PR branch, not `main`, for pre-merge checks:

```bash
npm ci
npm run seo:test
node scripts/prepare-pages-artifact.mjs public-site
npm run seo:audit -- --root public-site --json
npm run ci:wiki
```

The source audit `npm run seo:audit` intentionally still shows duplicate titles on protected source wiki files: these title suffixes are inserted into the copied **Pages deployment artifact**. Use `--root public-site` for the actual crawl-facing result. Do not regenerate or overwrite the protected wiki simply to silence source-only audit warnings.

Code inspection and focused in-memory function smoke tests on two authentic NFT pages showed separate output titles/descriptions, unchanged article bodies and idempotence. Full Node/CI and Pages artifact generation are **not claimed as executed** until their logs are supplied.

## Limitations

- These fixes strengthen distinct-page metadata and social preview compatibility; they do not ensure Google indexing, snippet selection or rankings.
- Real canonical/redirect behavior, Search Console coverage, live crawler rendering, 404/soft-404 checks and Core Web Vitals still require live evidence.
- A generic public Crypto Moonboys logo is used for the sharing image. Distinct NFT-specific card images can be added later only after stable, rights-cleared per-template public image URLs are verified.
- No NFT price, live supply, mint count, rarity claim or client/holder relationship is fabricated.

No automatic merge, production deploy, Worker change or D1 migration is in scope.
