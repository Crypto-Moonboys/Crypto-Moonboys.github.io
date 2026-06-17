# Agent Web Canon Handover

This repository serves the public Crypto Moonboys website and wiki pages. It must not be treated as the source of truth for canon decisions.

## Source of truth

- SAM repo `finalcannon.md` and approved SAM canon decisions are the source of truth for canon promotion.
- Live wiki pages are not automatic canon.
- A page existing in `/wiki/` does not mean it should stay approved, indexed, graphed, or regenerated.

## Wiki cleanup rules

- Alias-only pages must not be approved as canonical pages.
- Duplicate aliases should resolve to the canonical slug or be removed from indexable surfaces.
- Deleted or blocked wiki pages must be removed from:
  - `sitemap.xml`
  - `js/wiki-index.json`
  - `js/entity-map.json`
  - `js/entity-graph.json`
  - game/data question packs if they reference wiki URLs
- Do not preserve slug landfill logs. Cleanup summaries must be counts-only.
- Main non-wiki pages are exempt from wiki cleanup unless explicitly requested. Examples: homepage, about pages, category pages, dashboards, games, search, static assets, and worker/source directories.

## Unsafe alias collapses

Do not collapse distinct concepts unless SAM canon explicitly approves the collapse.

Currently unsafe:

- `hodl-x-warriors` must not collapse into `hodl-warriors`.
- `midevil-hero-arena` must not collapse into `midevilpunks`.
- `bitcoin-x-kids` must not collapse into `bitcoin-kids`.

Respect the locked DB-1 / DB-2 split:

- Bitcoin X Kids = inside Block Topia walls only.
- Bitcoin Kids = Alfie Blaze escaped rebels only.

## Noise prevention

Blocked patterns must prevent synthetic and anti-bot scrape pages from being approved, indexed, graphed, or regenerated.

Examples:

- `sam-*`
- `*-via-*`
- `*enable-javascript*`
- `*captcha*`
- `*access-denied*`
- `*just-a-moment*`
- `*are-you-human*`

## Deployment rule

Do not manually deploy GitHub Pages after canon cleanup until:

1. approved-page slugs are cleaned,
2. unsafe taxonomy aliases are removed,
3. purge/audit summaries pass,
4. sitemap/index/graph files have no stale deleted-page references,
5. SAM manual run has passed brand-gate expectations.
