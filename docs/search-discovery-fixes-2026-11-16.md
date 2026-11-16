# Search discovery repair — 16 November 2026

## Findings and implemented changes

- Creator Studio (`/gpt-users.html`) was absent from the approved root-page registry, committed sitemap and internal search index. Add it to the shared generator configuration, alongside the other selected public entry routes. The WAX landing page and Moonboy Builder already appeared in the sitemap but were missing from the registry/search index. Eight additional sitemap URLs and ten additional search entries are now present: 468 sitemap URLs and 439 search entries. No previously listed sitemap URL was removed.
- Add visible, ordinary HTML links to Creator Studio, Moonboy Builder, project information, WAXP, Graffiti Kings, Darren Cullen, Charlie Buster and the GKniftyHEADS collection on the homepage. Keep the original WAX entry button, artwork-free hero and moved-section deep links. The article hub now offers a static guide list alongside its existing dynamic search, including explicit separation of the fictional Queen Sarah from artist biography.
- Complete missing sharing metadata on the selected root pages. The community entry page also lacked an explicit canonical and robots declaration; it now declares its own existing public route. Existing page titles, descriptions, account controls, login and runtime scripts are retained.
- Remove four repeated copies of the same WebPage JSON-LD object from each of `paths.html` and `hubs.html`. Each describes itself once.
- Mark the editorial dashboard `noindex, follow`. Exclude the raw `_article-template.html` scaffold from the Pages artifact, while keeping its source robots default intact so the importer can continue creating indexable real articles. The four intentional public OG template guides remain published and indexed.
- Remove 17 cryptocurrency-category cards pointing to nonexistent articles. Existing source-cited records, including the XRP Ledger guide, remain available. Unknown issuer/ticker identities are not redirected to unrelated assets.
- Restore the old Tokens directory route as a redirect to the current cryptocurrency/token category. Restore Liquidity Pools as a redirect to the existing DeFi AMM section. Fragment navigation is used in the refresh/fallback, not in the canonical URL.
- Replace six broken artist-name hyperlinks in three NFT-template pages with their existing plain-text labels. Retain their relationship-hint wording, NFT identities and descriptions; do not turn inferred name matches into real biographies or fictional identities. Correct the general token-directory link in the NFT explainer. All four changed existing wiki documents retain identical reader-facing text.
- Regenerate the search index and site counters with the existing generators. Twenty-two existing search records have recalculated signals; no ranking formula or gameplay scoring changed. Generated indexes remain subject to the existing publication approvals and disclosure boundary.

## Verification actually completed

- `npm run seo:test`: 50 non-wiki sitemap landing pages plus discovery checks and all 14 canonical/metadata tests passed.
- `node scripts/wiki-index-drift-regression.test.mjs`: 41 checks passed, including every approved public entry route.
- `node scripts/homepage-route-split.test.mjs`: passed; one primary WAX CTA, preserved deep links and both route canonicals.
- `node scripts/wiki-aliases.test.mjs`: passed.
- `node scripts/wiki-html-hygiene.test.mjs`: 418 indexable wiki pages checked, 53 redirects/noindex pages skipped, zero failures.
- `node scripts/prepare-pages-artifact.mjs public-site` and `node scripts/seo-sitemap-audit.mjs --root public-site --strict`: 468/468 sitemap pages checked, zero errors, zero warnings. This is metadata/disclosure verification of the prepared artifact, not proof of complete asset hydration or production deployment.
- `node --test scripts/sparky-pages-artifact.test.mjs`: both artifact tests passed, including Creator Studio discovery and private scaffold exclusion.
- `npm run test:canon`: all 94 archive texts verified, four Python corruption tests passed, all 20 JavaScript regressions passed, and the final canon guard passed for 471 wiki pages. Historical baseline blobs missing from the partial checkout were cached from the exact recorded commit and verified against Git object hashes; no approval baselines or tests were weakened.
- Functional preservation check passed. A separate HTML text comparison confirmed identical reader-facing text for all four changed existing wiki documents.
- A read-only static-link scan checked 537 locally available public HTML files against tracked/new repository paths: zero missing internal destinations. This does not test external sites, generated JavaScript links, every fragment, or private API responses.
- `git diff --check`: passed.

Earlier attempts encountered missing resources in the sparse checkout; the required resources were hydrated and the affected checks were rerun successfully. No test was disabled or adjusted to conceal a runtime failure.

## Limits and release

Local Chromium launch failed, so mobile/desktop browser visual checks, traces, Lighthouse and real-user Core Web Vitals are not verified. The root retains its media-free first section, but no speed improvement is claimed. Review the new homepage directory on mobile and desktop before release.

The source checkout is partial; the metadata and SPARKY resource tests do not establish that every unrelated game/image asset was locally copied. Normal full-checkout Pages publishing remains authoritative and must retain its Worker compatibility gate. Full Linux, Worker/game suites and production deployment were not run because this change does not modify those runtime systems.

HYPD exposes sitemap processing, search performance and individual URL inspection, not Search Console Manual Actions, Security Issues, HTTPS/field Core Web Vitals reports or indexing submission. Those reports have not been marked clear. Nothing in this patch guarantees Google indexing or ranking.

After GK review and merge, let normal Pages publication complete. Verify the live Creator Studio sitemap entry, homepage guide links, Tokens/Liquidity redirects and scaffold exclusion. Use Search Console Live Test / Request indexing for Creator Studio, WAX onboarding and the key project/artist pages first. Allow Google to recrawl and judge results from fresh URL inspections rather than old exclusion counts. Existing intentionally removed and unresolved 404s remain in the disposition ledger.

## Primary guidance

- [Google: sitemap and indexing limits](https://developers.google.com/search/help/crawling-index-faq)
- [Google: canonical URLs and consistent internal links](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google: crawlable HTML links](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
