# Wiki ranking rules

## Locked philosophy

The wiki search system is **mixed**:

- **query relevance first** in `js/wiki.js`
- **deterministic authority/base order second** from generated `rank_score`

That means the frontend decides whether a page matches the query, but the generator decides the stable fallback order.

## Source of truth

Generated JSON is the source of truth for ranking inputs:

- `js/wiki-index.json`
- `js/entity-map.json`
- `js/site-stats.json`

The frontend must not invent ranking authority heuristics that are missing from generated data.

## Stable ordering

For same-score search results, order must be:

1. query score
2. `rank_score`
3. title
4. URL

This prevents random tie flips between runs or browsers.

## Canonical article hub

`/search.html` is the canonical article hub.

`/articles.html` is legacy-only and must redirect to `/search.html`.

`/wiki/index.html` is not part of the canonical system and must not exist or appear in generated data.

## Category weighting

`CATEGORY_PRIORITY` in `scripts/generate-wiki-index.js` is locked and deliberate.

Do not casually change category weights. Any change alters deterministic ranking behaviour across the whole wiki.

## Editorial policy

No manual editorial boosts.

Ranking must come from repo-grounded deterministic fields only.

## Debugging

To inspect ranking on the live search page, use:

- `?debug=ranking`
- or `?rankdebug=1`
- or set `window.WIKI_RANK_DEBUG = true`

The debug panel shows:

- title
- final query score
- `rank_score`
- `rank_signals`

## Validation

Generated assets must fail fast when malformed.

Use:

```bash
node scripts/generate-wiki-index.js
node scripts/generate-sitemap.js
node scripts/generate-site-stats.js
node scripts/generate-entity-map.js
node scripts/validate-generated-assets.js
```
