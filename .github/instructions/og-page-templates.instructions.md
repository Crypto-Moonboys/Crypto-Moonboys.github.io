# OG Page Templates

When creating or updating Crypto Moonboys pages, use the matching canonical page under `og-templates/` as the source shape. This applies to Copilot, Codex and external page agents such as `HODLKONG64/THEY-CALL-ME-THE-DADDY`.

- Normal wiki page: `/og-templates/wiki-page.html`.
- NFT collection page: `/og-templates/nft-collection-page.html`.
- Individual NFT template/item page: `/og-templates/nft-template-page.html`.
- Crypto token page: `/og-templates/crypto-token-page.html`.

The former duplicate files under `templates/og/` are retired. Do not recreate them, link to them or treat them as a separate template source.

Required invariants:

- Keep the shared SWARMSY shell assets and `body.page-wiki.page-standard-shell`.
- Keep the `header.wiki-hero` top card first inside the article.
- Keep the shared engagement scripts shown by the canonical template.
- Keep live vote/comment sections at the bottom.
- NFT pages must remain WAX AtomicAssets only and must preserve existing ranking/weighting semantics.
- Large NFT stats and template attributes must be collapsible, not open raw data dumps.
- Do not add fake buttons, placeholder routes, coming-soon copy, unsupported live claims, lore rewrites or gameplay changes while making template updates.
