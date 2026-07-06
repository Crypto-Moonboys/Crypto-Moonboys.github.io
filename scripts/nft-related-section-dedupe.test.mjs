#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runGenerateRelatedWikiPaths } from './generate-related-wiki-paths.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nft-related-dedupe-'));

function write(relPath, content) {
  const filePath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(relPath, data) {
  write(relPath, `${JSON.stringify(data, null, 2)}\n`);
}

function hrefs(html) {
  return [...String(html || '').matchAll(/\bhref=["']([^"']+)["']/gi)].map((match) => match[1]);
}

function relatedSection(slug) {
  const html = fs.readFileSync(path.join(root, 'wiki', `${slug}.html`), 'utf8');
  return html.match(/<!-- RELATED_WIKI_PATHS:BEGIN -->[\s\S]*?<!-- RELATED_WIKI_PATHS:END -->/i)?.[0] || '';
}

function group(section, title) {
  const starts = [...section.matchAll(/<(?:div|details)\b[^>]*class=["'][^"']*\bwiki-rabbit-group\b[^"']*["'][^>]*>/gi)];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index;
    const end = starts[index + 1]?.index ?? section.search(/\s*<\/section>/i);
    const html = section.slice(start, end === -1 ? undefined : end);
    if (html.includes(`data-related-group="${title}"`)) return html;
  }
  return '';
}

function nftPage(slug, title, terms) {
  return `<!DOCTYPE html><html><body><main id="content">
<article class="wiki-content nft-template-article" data-page-type="nft_template" data-collection="gkniftyheads" data-template-id="${slug.match(/(\d+)$/)?.[1] || '100000'}">
  <h1>${title}</h1>
  <p>${title} is a GKniftyHEADS NFT template.</p>
  <template class="nft-battle-media-template" data-battle-media="nft" data-page-id="${slug}">
    <figure class="battle-page-media nft-template-media-card">
      <img class="wiki-hero-image nft-image" src="/img/sample-nft.png" alt="${title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback-srcs="[]">
    </figure>
  </template>
  <script type="application/json" class="nft-search-terms">${JSON.stringify([title, 'gkniftyheads', 'rarity', ...terms])}</script>
  <table><tbody><tr><th>rarity</th><td>${terms.join(' ')}</td></tr><tr><th>variation</th><td>${terms[0] || 'plain'}</td></tr></tbody></table>
</article>
<div class="category-tags" aria-label="NFT categories"><a href="/categories/nfts.html">NFTs</a></div>
<div class="wiki-comments" data-page-id="${slug}"></div>
</main></body></html>`;
}

const staticPages = [
  ['wiki/crypto-moonboys.html', 'Crypto Moonboys'],
  ['wiki/gkniftyheads.html', 'GKniftyHEADS'],
  ['wiki/gkniftyheads-nft-collection.html', 'GKniftyHEADS NFT Collection'],
  ['wiki/graffpunks.html', 'GraffPUNKS'],
  ['wiki/hodl-wars.html', 'HODL WARS'],
];
for (const [relPath, title] of staticPages) {
  write(relPath, `<!DOCTYPE html><html><body><main><article class="wiki-content"><h1>${title}</h1><p>${title} fixture.</p></article><div class="wiki-comments" data-page-id="${title}"></div></main></body></html>`);
}

const nftFixtures = [
  ['gkniftyheads-nova-shadow-shredder-784419', 'Nova Shadow Shredder', ['shadow', 'shifter', 'echo', 'fury', 'hodlwars']],
  ['gkniftyheads-shadow-shifter-cousin-784420', 'Shadow Shifter Cousin', ['shadow', 'shifter', 'echo', 'fury', 'hodlwars']],
  ['gkniftyheads-shadow-only-cousin-784421', 'Shadow Only Cousin', ['shadow', 'sentinel']],
  ['gkniftyheads-bright-fallback-784422', 'Bright Fallback', ['bright', 'plain']],
  ['gkniftyheads-plain-origin-784500', 'Plain Origin', ['orange']],
  ['gkniftyheads-plain-neighbor-784501', 'Plain Neighbor', ['blue']],
];
for (const [slug, title, terms] of nftFixtures) write(`wiki/${slug}.html`, nftPage(slug, title, terms));

for (const relPath of [
  'categories/nfts.html',
  'categories/wax-nfts.html',
  'categories/nfts-digital-art.html',
  'categories/gkniftyheads.html',
  'categories/factions.html',
  'categories/gaming.html',
  'timeline.html',
  'graph.html',
]) {
  write(relPath, '<!DOCTYPE html><html><body>fixture</body></html>');
}

writeJson('js/wiki-index.json', [
  ['/wiki/crypto-moonboys.html', 'Crypto Moonboys', 'community-people', ['crypto', 'moonboys']],
  ['/wiki/gkniftyheads.html', 'GKniftyHEADS', 'lore', ['gkniftyheads']],
  ['/wiki/gkniftyheads-nft-collection.html', 'GKniftyHEADS NFT Collection', 'nfts-digital-art', ['collection']],
  ['/wiki/graffpunks.html', 'GraffPUNKS', 'factions', ['faction']],
  ['/wiki/hodl-wars.html', 'HODL WARS', 'gaming', ['game']],
  ...nftFixtures.map(([slug, title]) => [`/wiki/${slug}.html`, title, 'nfts-digital-art', ['gkniftyheads', 'nft']]),
].map(([url, title, category, tags], index) => ({
  title,
  desc: `${title} fixture.`,
  url,
  category,
  tags,
  rank_score: 100 - index,
  rank_signals: { category },
  search_index: { tokens: tags },
})));

writeJson('js/wiki-relationship-hints.json', {
  '/wiki/gkniftyheads-nova-shadow-shredder-784419.html': {
    relationship_hints: {
      project_hubs: [{ url: '/wiki/crypto-moonboys.html', name: 'Crypto Moonboys' }],
      collections: [{ url: '/wiki/gkniftyheads-nft-collection.html', name: 'GKniftyHEADS NFT Collection' }],
      factions: [
        { url: '/wiki/graffpunks.html', name: 'GraffPUNKS' },
        { url: '/wiki/gkniftyheads-shadow-shifter-cousin-784420.html', name: 'Sibling should not be contextual' },
      ],
      games: [{ url: '/wiki/hodl-wars.html', name: 'HODL WARS' }],
      categories: [{ url: '/categories/nfts.html', name: 'NFTs' }],
    },
  },
});

const result = runGenerateRelatedWikiPaths(root);
assert.ok(result.written >= 3, 'generator should update NFT fixtures');

const section = relatedSection('gkniftyheads-nova-shadow-shredder-784419');
assert.ok(section, 'target NFT gets Related Wiki Paths');
assert.ok(!/\.html\.html/.test(section), 'no .html.html links');
assert.ok(!/\bhref=["']https?:\/\//i.test(section), 'no external links in Related Wiki Paths');

const more = group(section, 'More from GKniftyHEADS');
assert.ok(more, 'NFT page gets a clearly labelled collection-sibling group');
assert.ok(more.includes('wiki-rabbit-group--nft-siblings'), 'More group is visually distinct from contextual Related Wiki Paths');
assert.ok(more.includes('wiki-rabbit-card--nft-sibling'), 'More group uses NFT sibling card markup');
const moreHrefs = hrefs(more);
assert.ok(moreHrefs.length <= 8, 'More group stays capped');
assert.ok(moreHrefs.length > 0, 'More group falls back to collection siblings');
assert.ok(moreHrefs.every((href) => /^\/wiki\/gkniftyheads-.+-\d{5,}\.html$/i.test(href)), 'More group contains only NFT template URLs');
assert.equal(moreHrefs[0], '/wiki/gkniftyheads-shadow-shifter-cousin-784420.html', 'similar trait sibling ranks before generic collection fallback');

const contextual = section.replace(more, '');
for (const expected of [
  '/wiki/crypto-moonboys.html',
  '/wiki/gkniftyheads-nft-collection.html',
  '/wiki/graffpunks.html',
  '/wiki/hodl-wars.html',
  '/categories/nfts.html',
]) {
  assert.ok(contextual.includes(`href="${expected}"`), `contextual groups include ${expected}`);
}
assert.ok(!contextual.includes('/wiki/gkniftyheads-shadow-shifter-cousin-784420.html'), 'sibling NFT hint is not repeated in contextual groups');
assert.ok(contextual.includes('wiki-rabbit-group--categories'), 'Related Categories group has a compact category group class');
assert.ok(contextual.includes('wiki-rabbit-chip-grid'), 'Related Categories renders compact chip grid markup');
assert.ok(contextual.includes('wiki-rabbit-chip'), 'Related Categories renders compact chips');
assert.ok(!group(section, 'Related Categories').includes('wiki-rabbit-card'), 'Related Categories does not render as large cards');

const allHrefs = hrefs(section);
assert.equal(allHrefs.length, new Set(allHrefs).size, 'no URL repeats across NFT related groups');

const fallbackSection = relatedSection('gkniftyheads-plain-origin-784500');
const fallbackMore = group(fallbackSection, 'More from GKniftyHEADS');
assert.ok(fallbackMore, 'fallback NFT page still gets a collection-sibling group');
assert.ok(hrefs(fallbackMore).every((href) => /^\/wiki\/gkniftyheads-.+-\d{5,}\.html$/i.test(href)), 'fallback More group still contains only NFT template URLs');

const targetHtml = fs.readFileSync(path.join(root, 'wiki/gkniftyheads-nova-shadow-shredder-784419.html'), 'utf8');
const templateBlock = targetHtml.match(/<template\b[^>]*class=["'][^"']*\bnft-battle-media-template\b[\s\S]*?<\/template>/i)?.[0] || '';
assert.ok(templateBlock.includes('data-battle-media="nft"'), 'NFT Battle Heat template remains present');
assert.ok(/<img\b[^>]*class=["'][^"']*\bnft-image\b/i.test(templateBlock), 'NFT image remains inside Battle Heat template');
assert.ok(!targetHtml.replace(templateBlock, '').match(/<img\b[^>]*class=["'][^"']*\bnft-image\b/i), 'no loose NFT image outside Battle Heat template');

const css = fs.readFileSync(path.join(process.cwd(), 'css/wiki.css'), 'utf8');
const battleLayer = fs.readFileSync(path.join(process.cwd(), 'js/battle-layer.js'), 'utf8');
const battleCss = fs.readFileSync(path.join(process.cwd(), 'css/battle-layer.css'), 'utf8');
assert.ok(battleLayer.includes('battle-shell--heat'), 'Battle Heat keeps a semantic shell class');
assert.ok(battleLayer.includes('battle-shell--missions'), 'Daily Missions keeps a semantic shell class');
assert.ok(battleLayer.includes('battle-deck battle-engagement-deck'), 'Battle Heat and Daily Missions render in one compact engagement area');
assert.ok(battleLayer.includes('wiki-engagement-module'), 'Battle Heat and Daily Missions are wrapped in one shared engagement module');
assert.ok(
  battleLayer.includes("pageType === 'nft_collection'") &&
    battleLayer.includes("pageType === 'nft_template'") &&
    battleLayer.includes("buildCollectionEngagementHTML(pageId, engagement)") &&
    battleLayer.includes("buildTemplateMediaShell() + buildMissionHTML(pageId, engagement)"),
  'NFT collection pages use the art/about/missions engagement layout while template pages keep art plus Daily Missions'
);
assert.ok(battleCss.includes('.wiki-engagement-module .battle-deck.battle-engagement-deck'), 'final compact engagement rules live in battle-layer.css');
assert.ok(
  battleCss.lastIndexOf('.wiki-engagement-module .battle-deck.battle-engagement-deck') > battleCss.indexOf('.battle-deck {'),
  'compact engagement rules appear after the base .battle-deck rule'
);
assert.ok(battleCss.includes('.battle-shell--heat:not(:has(.battle-page-media))'), 'non-NFT Battle Heat avoids giant empty media-panel treatment');
assert.ok(css.includes('.nft-template-article .battle-shell--heat'), 'Battle Heat keeps NFT-page-specific styling');
assert.ok(battleCss.includes('.battle-deck.battle-engagement-deck .battle-shell--missions'), 'Daily Missions compact styles are scoped under the shared engagement deck');
assert.ok(battleCss.includes('overflow: visible'), 'Daily Missions compact mode avoids internal scrollbars');
assert.ok(!/\.nft-template-article\s+\.battle-shell--missions\s+\.mission-stack\s*\{[\s\S]*?overflow:\s*auto/i.test(css), 'NFT Daily Missions no longer force an internal scrollbar');
assert.ok(!/\.battle-deck\.battle-engagement-deck\s+\.battle-shell--missions\s+\.mission-stack\s*\{[\s\S]*?overflow:\s*auto/i.test(battleCss), 'shared Daily Missions compact rules do not force an internal scrollbar');
assert.ok(css.includes('.wiki-stat strong:empty::before'), 'blank NFT stats render a visible fallback');
assert.ok(css.includes('content: "Not supplied"'), 'blank Schema-style stats use Not supplied fallback copy');

console.log('nft-related-section-dedupe.test.mjs passed');
