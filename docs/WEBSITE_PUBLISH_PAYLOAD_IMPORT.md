# Website Publish Payload Import Contract

The agent repo `HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE` provides website publish payloads at:

```text
website-publish-payloads/<slug>.json
```

Those payloads are `middle_content_only` content contracts. They are not complete HTML documents and must not include the website shell, page chrome, canonical boot scripts, or live runtime panels.

The website repo owns final rendering. Payload import must insert the agent-provided article middle content into the current website template/shell, then sync the site-owned index and feed surfaces.

## Payload Ownership

The agent repo provides:

- `slug`
- `title`
- `description`
- `category`
- `article_html`
- `citations`
- `see_also`
- `source_refs`
- `requested_update_reason`
- `last_updated_source`
- `publish_mode: middle_content_only`
- optional NFT fields for `page_type: nft_template`

The website repo owns:

- comments
- citation votes
- page votes
- Battle Heat card
- Daily Missions card
- left/right panels
- daily-loop singleton
- categories
- search
- timeline
- graph
- dashboard
- SAM page
- sitemap

## Validation Rules

`scripts/validate-website-publish-payloads.mjs` validates every `.json` file in `website-publish-payloads/`.

If `website-publish-payloads/` does not exist, validation exits with status `0` and prints a skip message.

Accepted payloads must use:

```json
{
  "publish_mode": "middle_content_only"
}
```

Required top-level fields:

- `slug`
- `title`
- `description`
- `category`
- `article_html`

`article_html` may contain normal article markup only. It must not contain:

- `<!DOCTYPE`
- `<html`
- `<head`
- `<body`
- `<script`
- canonical website boot script references
- legacy full-page agent shells

Optional array fields must be arrays when present:

- `source_refs`
- `citations`
- `see_also`

## NFT Template Payloads

When `page_type === "nft_template"`, the payload must include:

- `collection`
- `template_id`
- `media.type: "nft_image"`
- `media.placement: "battle_heat"`
- `media.image_url`
- `media.alt`
- `media.fallback_urls` as an array when present

NFT images are not rendered as loose body images. `media.placement: "battle_heat"` means the website renderer must preserve the image inside the hidden Battle Heat media template:

```html
<template data-battle-media="nft">
  <div class="nft-battle-media-template">
    <figure class="battle-page-media">
      ...
    </figure>
  </div>
</template>
```

## Importer

`scripts/import-website-publish-payloads.mjs` defaults to dry-run mode.

Dry-run mode:

- reads payloads
- validates them
- prints intended page paths such as `wiki/<slug>.html`
- prints affected sync surfaces:
  - categories
  - search
  - timeline
  - graph
  - dashboard
  - SAM page
  - sitemap
- does not write pages

Write mode is only enabled with `--write`. Write mode must use the current website template/shell from this repo, never an agent-provided full shell.

Actual feed/index generation can be implemented incrementally, but until then the importer must keep reporting planned affected surfaces so publishing does not silently skip categories, search, timeline, graph, dashboard, SAM page, or sitemap sync.
