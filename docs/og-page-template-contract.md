# OG Page Template Contract

This repo has four original page template families. Agents that create or update pages, including agents from `HODLKONG64/THEY-CALL-ME-THE-DADDY`, must start from the matching file in `templates/og/` and keep the shared shell wiring intact.

## Required Templates

- `templates/og/wiki-page.html` for normal wiki knowledge pages.
- `templates/og/nft-collection-page.html` for WAX AtomicAssets collection pages.
- `templates/og/nft-template-page.html` for individual WAX NFT template/item pages.
- `templates/og/crypto-token-page.html` for crypto token pages that use approved live feed data.

## Public Template Guides

- `/og-templates/wiki-page.html` exposes the wiki page template guide.
- `/og-templates/nft-collection-page.html` exposes the NFT collection page template guide.
- `/og-templates/nft-template-page.html` exposes the individual NFT template/item page template guide.
- `/og-templates/crypto-token-page.html` exposes the crypto token page template guide.

The public guide pages must stay searchable and crawlable. They point agents and humans to the raw source templates in `templates/og/` without turning unresolved `{{PLACEHOLDER}}` source files into published article content.

## Shared Layout Rules

- Use `body.page-wiki.page-standard-shell` and load the same shared CSS/JS shell assets as the template.
- Keep the top `header.wiki-hero` as the first article card. It inherits the SWARMSY-style full-width glowing title treatment from `css/wiki.css`.
- Keep `js/battle-layer.js` loaded. It owns the engagement deck. NFT collection and NFT template pages must render media/art on the left and one Daily Missions card on the right with Battle Heat embedded inside that card.
- Keep citation voting and comments at the bottom of the page after article/related-path content.
- Put large NFT stats, rarity details, and template attributes behind the shared `og-collapsible-data` disclosure behavior. Do not dump every large data table open by default.
- Preserve card padding and spacing by using `wiki-section`, `wiki-card`, `wiki-stat-grid`, `wiki-table-wrap`, and `wiki-comments` instead of raw unstyled blocks.

## NFT Rules

- NFT collection and NFT template pages are WAX AtomicAssets pages only.
- Do not add non-WAX marketplace assumptions or price ranking unless a separate approved source and task explicitly requires it.
- Keep current collection weighting/ranking semantics from the existing generators and audits. Ranking should remain based on collection/template rarity, supply, burn/supply changes, and approved WAX data feeds.
- Heavy NFT data is for periodic ranking/logging and auditability. It should be available on the page, but collapsed unless the user asks to inspect it.

## Live Claims

- Live voting, comments, likes, and mission completion must use the existing backend feature flags and shared scripts.
- Token pages must not claim live prices, balances, or market state unless the page is wired to the approved live feed source shown in the template.
- Buttons must link to real routes or perform real actions. Do not add placeholder, coming-soon, or fake interaction copy.
