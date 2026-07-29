# OG Page Template Contract

This repo has four original page template families. Agents that create or update pages, including agents from `HODLKONG64/THEY-CALL-ME-THE-DADDY`, must use the matching canonical page under `og-templates/` as the visual and structural reference while keeping the shared shell wiring intact.

## Canonical Templates

- `/og-templates/wiki-page.html` for normal wiki knowledge pages.
- `/og-templates/nft-collection-page.html` for WAX AtomicAssets collection pages.
- `/og-templates/nft-template-page.html` for individual WAX NFT template/item pages.
- `/og-templates/crypto-token-page.html` for crypto token pages that use approved live feed data.

These four public pages are the only canonical OG templates. The former duplicate files under `templates/og/` have been retired and must not be recreated, linked or treated as a second source of truth.

## Shared Layout Rules

- Use `body.page-wiki.page-standard-shell` and load the same shared CSS/JS shell assets as the matching canonical template.
- Keep the top `header.wiki-hero` as the first article card. It inherits the SWARMSY-style full-width glowing title treatment from `css/wiki.css`.
- Keep `js/battle-layer.js` loaded where shown by the canonical template. It owns the engagement deck. NFT collection and NFT template pages must render media/art on the left and one Daily Missions card on the right with Battle Heat embedded inside that card.
- Keep citation voting and comments at the bottom of the page after article/related-path content.
- Put large NFT stats, rarity details and template attributes behind the shared `og-collapsible-data` disclosure behaviour. Do not dump every large data table open by default.
- Preserve card padding and spacing by using the classes and hierarchy shown by the matching canonical `/og-templates/` page instead of raw unstyled blocks.

## NFT Rules

- NFT collection and NFT template pages are WAX AtomicAssets pages only.
- Do not add non-WAX marketplace assumptions or price ranking unless a separate approved source and task explicitly requires it.
- Keep current collection weighting/ranking semantics from the existing generators and audits. Ranking should remain based on collection/template rarity, supply, burn/supply changes and approved WAX data feeds.
- Heavy NFT data is for periodic ranking/logging and auditability. It should be available on the page, but collapsed unless the user asks to inspect it.

## Live Claims

- Live voting, comments, likes and mission completion must use the existing backend feature flags and shared scripts.
- Token pages must not claim live prices, balances or market state unless the page is wired to an approved live feed source.
- Buttons must link to real routes or perform real actions. Do not add placeholder, coming-soon or fake interaction copy.
