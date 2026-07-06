# OG Page Templates

When creating or updating Crypto Moonboys pages, use the matching template in `templates/og/` as the source shape. This applies to Copilot, Codex, and external page agents such as `HODLKONG64/THEY-CALL-ME-THE-DADDY`.

- Normal wiki page: `templates/og/wiki-page.html`.
- NFT collection page: `templates/og/nft-collection-page.html`.
- Individual NFT template/item page: `templates/og/nft-template-page.html`.
- Crypto token page: `templates/og/crypto-token-page.html`.

Required invariants:

- Keep the shared SWARMSY shell assets and `body.page-wiki.page-standard-shell`.
- Keep the `header.wiki-hero` top card first inside the article.
- Keep `js/battle-layer.js`, `js/engagement.js`, and `js/comments.js` wired.
- Keep live vote/comment sections at the bottom.
- NFT pages must remain WAX AtomicAssets only and must preserve existing ranking/weighting semantics.
- Large NFT stats and template attributes must be collapsible, not open raw data dumps.
- Do not add fake buttons, placeholder routes, coming-soon copy, UI redesigns, lore rewrites, or gameplay changes while making template updates.
