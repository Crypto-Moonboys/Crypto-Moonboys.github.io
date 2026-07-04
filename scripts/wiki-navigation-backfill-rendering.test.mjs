#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runGenerateRelatedWikiPaths } from './generate-related-wiki-paths.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-nav-backfill-'));

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

function relatedSection(html) {
  return html.match(/<!-- RELATED_WIKI_PATHS:BEGIN -->[\s\S]*?<!-- RELATED_WIKI_PATHS:END -->/i)?.[0] || '';
}

function categoryBlock(html) {
  return html.match(/<div\b[^>]*class=["'][^"']*\bcategory-tags\b[^"']*["'][\s\S]*?<\/div>/i)?.[0] || '';
}

function relatedGroup(section, title) {
  const starts = [...String(section || '').matchAll(/<div\b[^>]*class=["'][^"']*\bwiki-rabbit-group\b[^"']*["'][^>]*>/gi)];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index;
    const end = starts[index + 1]?.index ?? section.search(/\s*<\/section>/i);
    const html = section.slice(start, end === -1 ? undefined : end);
    if (html.includes(`data-related-group="${title}"`)) return html;
  }
  return '';
}

function manualBlock(html) {
  return html.match(/<!-- MANUAL_CONTENT:BEGIN -->[\s\S]*?<!-- MANUAL_CONTENT:END -->/i)?.[0] || '';
}

function articlePage(title, body = '') {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `<!DOCTYPE html><html><body><main id="content">
<article class="wiki-content">
<!-- MANUAL_CONTENT:BEGIN -->
<h1>${title}</h1>
<p>${body || `${title} manual fixture text.`}</p>
<!-- MANUAL_CONTENT:END -->
<!-- SAM_CONTENT:BEGIN -->
<p>Existing SAM fixture text.</p>
<!-- SAM_CONTENT:END -->
</article>
<!-- RELATED_WIKI_PATHS:BEGIN -->
<section class="wiki-section related-wiki-paths" data-related-wiki-paths="true">
  <h2>Related Wiki Paths</h2>
  <ul class="wiki-rabbit-list"><li><a href="/wiki/old.html">Old list</a></li></ul>
</section>
<!-- RELATED_WIKI_PATHS:END -->
<div class="category-tags" aria-label="Article categories"><a href="/categories/lore.html">Lore</a></div>
<div class="wiki-comments" data-page-id="${slug}"></div>
</main></body></html>`;
}

const indexEntries = [
  ['/wiki/crypto-moonboys.html', 'Crypto Moonboys', 'community-people', ['crypto', 'moonboys']],
  ['/wiki/gkniftyheads.html', 'GKniftyHEADS', 'lore', ['gkniftyheads']],
  ['/wiki/gkniftyheads-nft-collection.html', 'GKniftyHEADS NFT Collection', 'nfts-digital-art', ['gkniftyheads', 'nft']],
  ['/wiki/gkniftyheads-nova-shadow-shredder-784419.html', 'Nova Shadow Shredder', 'nfts-digital-art', ['gkniftyheads', 'nft']],
  ['/wiki/graffpunks.html', 'GraffPUNKS', 'factions', ['faction']],
  ['/wiki/hodl-wars.html', 'HODL WARS', 'gaming', ['game']],
  ['/wiki/fallback-only.html', 'Fallback Only', 'lore', ['lore']],
  ['/wiki/no-citations.html', 'No Citations', 'lore', ['lore']],
];

write('wiki/crypto-moonboys.html', articlePage('Crypto Moonboys', 'Owner-approved manual hub text.'));
write('wiki/gkniftyheads.html', articlePage('GKniftyHEADS'));
write('wiki/gkniftyheads-nft-collection.html', `<!DOCTYPE html><html><body><main id="content"><article class="wiki-content" data-page-type="nft_collection"><h1>GKniftyHEADS NFT Collection</h1><p>Collection page.</p></article><div class="category-tags" aria-label="Article categories"><a href="/categories/nfts.html">NFTs</a></div><div class="wiki-comments" data-page-id="collection"></div></main></body></html>`);
write('wiki/gkniftyheads-nova-shadow-shredder-784419.html', `<!DOCTYPE html><html><body><main id="content">
<article class="wiki-content nft-template-article" data-page-type="nft_template" data-collection="gkniftyheads">
<!-- MANUAL_CONTENT:BEGIN --><h1>Nova Shadow Shredder</h1><p>Manual NFT note.</p><!-- MANUAL_CONTENT:END -->
<section class="wiki-section"><h2>Sources</h2><ul class="sources-list"><li><a href="https://wax.example/source">Atomic source</a></li></ul></section>
</article>
<div class="category-tags nft-category-tags" aria-label="NFT categories"><a href="/categories/nfts.html">NFTs</a></div>
<div class="wiki-comments" data-page-id="gkniftyheads-nova-shadow-shredder-784419"></div>
</main></body></html>`);
write('wiki/graffpunks.html', articlePage('GraffPUNKS'));
write('wiki/hodl-wars.html', articlePage('HODL WARS'));
write('wiki/fallback-only.html', articlePage('Fallback Only'));
write('wiki/no-citations.html', '<!DOCTYPE html><html><body><main id="content"><article class="wiki-content"><h1>No Citations</h1><p>No sources here.</p></article><div class="wiki-comments" data-page-id="no-citations"></div></main></body></html>');

for (const relPath of [
  'categories/community-people.html',
  'categories/lore.html',
  'categories/nfts.html',
  'categories/wax-nfts.html',
  'categories/nfts-digital-art.html',
  'categories/gkniftyheads.html',
  'categories/factions.html',
  'categories/gaming.html',
  'categories/technology.html',
  'categories/cryptocurrencies.html',
  'timeline.html',
  'graph.html',
  'dashboard.html',
]) {
  write(relPath, '<!DOCTYPE html><html><body>fixture</body></html>');
}

writeJson('js/wiki-index.json', indexEntries.map(([url, title, category, tags]) => ({
  title,
  desc: `${title} fixture description.`,
  url,
  category,
  tags,
  rank_score: 100,
  rank_signals: { category },
  search_index: { tokens: tags },
})));

writeJson('js/wiki-relationship-hints.json', {
  '/wiki/crypto-moonboys.html': {
    relationship_hints: {
      project_hubs: [
        { url: '/wiki/gkniftyheads.html', name: 'GKniftyHEADS' },
        { url: 'https://example.com/external', name: 'External Ignored' },
        { url: '/wiki/missing.html', name: 'Missing Ignored' },
      ],
      collections: [{ url: '/wiki/gkniftyheads-nft-collection.html', name: 'GKniftyHEADS NFT Collection' }],
      categories: [{ url: '/categories/nfts.html', name: 'NFTs' }],
    },
  },
  '/wiki/gkniftyheads-nova-shadow-shredder-784419.html': {
    relationship_hints: {
      collections: [{ url: '/wiki/gkniftyheads-nft-collection.html', name: 'GKniftyHEADS NFT Collection' }],
      project_hubs: [{ url: '/wiki/crypto-moonboys.html', name: 'Crypto Moonboys' }],
      factions: [{ url: '/wiki/graffpunks.html', name: 'GraffPUNKS' }],
      games: [{ url: '/wiki/hodl-wars.html', name: 'HODL WARS' }],
      categories: [
        { url: '/categories/nfts.html', name: 'NFTs' },
        { url: '/categories/wax-nfts.html', name: 'WAX NFTs' },
      ],
    },
  },
});

const result = runGenerateRelatedWikiPaths(root);
assert.ok(result.written >= 4, 'generator should backfill fixture pages');

const cryptoHtml = fs.readFileSync(path.join(root, 'wiki/crypto-moonboys.html'), 'utf8');
const cryptoSection = relatedSection(cryptoHtml);
assert.ok(cryptoHtml.includes('Owner-approved manual hub text.'), 'manual content is preserved');
assert.ok(cryptoHtml.includes('Existing SAM fixture text.'), 'SAM content is preserved separately');
assert.ok(!manualBlock(cryptoHtml).includes('RELATED_WIKI_PATHS'), 'related paths are not captured as manual truth');
assert.ok(cryptoSection.includes('wiki-rabbit-grid'), 'related paths render as grids');
assert.ok(cryptoSection.includes('wiki-rabbit-card'), 'related paths render cards');
assert.ok(!cryptoSection.includes('wiki-rabbit-list'), 'legacy list markup is removed');
assert.equal(hrefs(cryptoSection)[0], '/wiki/gkniftyheads.html', 'explicit hinted links render before fallback links');
assert.ok(!cryptoSection.includes('https://example.com/external'), 'external relationship hints are ignored');
assert.ok(!cryptoSection.includes('/wiki/missing.html'), 'broken internal relationship hints are ignored');
assert.ok(!/\.html\.html/.test(cryptoSection), '.html.html links do not render');
assert.ok(categoryBlock(cryptoHtml).includes('/categories/nfts.html'), 'Crypto Moonboys keeps broad category tags');

const fallbackHtml = fs.readFileSync(path.join(root, 'wiki/fallback-only.html'), 'utf8');
assert.ok(relatedSection(fallbackHtml).includes('wiki-rabbit-card'), 'old page without relationship hints gets fallback cards');

const nftHtml = fs.readFileSync(path.join(root, 'wiki/gkniftyheads-nova-shadow-shredder-784419.html'), 'utf8');
const nftSection = relatedSection(nftHtml);
for (const expected of [
  '/wiki/gkniftyheads-nft-collection.html',
  '/wiki/crypto-moonboys.html',
  '/wiki/graffpunks.html',
  '/wiki/hodl-wars.html',
  '/categories/nfts.html',
  '/categories/wax-nfts.html',
]) {
  assert.ok(nftSection.includes(`href="${expected}"`), `NFT related cards include ${expected}`);
}
assert.ok(nftSection.includes('wiki-rabbit-group--categories'), 'NFT related categories render in a compact category group');
assert.ok(nftSection.includes('wiki-rabbit-chip-grid'), 'NFT related categories use chip grid markup');
assert.ok(nftSection.includes('wiki-rabbit-chip'), 'NFT related categories use compact chips');
assert.ok(!relatedGroup(nftSection, 'Related Categories').includes('wiki-rabbit-card'), 'NFT related categories do not render as large cards');
for (const expected of [
  '/categories/nfts.html',
  '/categories/wax-nfts.html',
  '/categories/nfts-digital-art.html',
  '/categories/gkniftyheads.html',
]) {
  assert.ok(categoryBlock(nftHtml).includes(`href="${expected}"`), `NFT category tags include ${expected}`);
}
assert.ok(nftHtml.includes('Vote on citations to strengthen the credibility of this intelligence file.'), 'citation vote panel renders for pages with sources');
assert.ok(nftHtml.includes('data-citation-vote-panel="true"'), 'citation panel is machine-auditable');
assert.ok(nftHtml.includes('class="cite-vote"'), 'citation panel exposes existing cite-vote hook');
assert.ok((nftSection.match(/\/wiki\/gkniftyheads-.+-\d{5,}\.html/g) || []).length <= 8, 'NFT card output is capped');

const noCitationHtml = fs.readFileSync(path.join(root, 'wiki/no-citations.html'), 'utf8');
assert.ok(!noCitationHtml.includes('data-citation-vote-panel="true"'), 'citation panel does not render without citations');

const css = fs.readFileSync(path.join(process.cwd(), 'css/wiki.css'), 'utf8');
const battleCss = fs.readFileSync(path.join(process.cwd(), 'css/battle-layer.css'), 'utf8');
assert.ok(/\.category-grid\s*\{[\s\S]*?minmax\(min\(100%, 285px\), 1fr\)/.test(css), 'category index cards use wider responsive tracks');
assert.ok(/\.category-card\s*\{[\s\S]*?align-items:\s*flex-start/.test(css), 'category cards avoid cramped vertical centering');
assert.ok(/\.category-card\s+\.cat-desc\s*\{[\s\S]*?overflow-wrap:\s*anywhere/.test(css), 'category descriptions wrap naturally');
assert.ok(/\.wiki-rabbit-card\s*\{[\s\S]*?min-height:\s*68px/.test(css), 'Related Wiki Paths cards stay compact');
assert.ok(/\.wiki-rabbit-group--nft-siblings\s+\.wiki-rabbit-grid\s*\{[\s\S]*?190px/.test(css), 'More from collection keeps distinct sibling-card sizing');
assert.ok(/\.infobox\s*\{[\s\S]*?width:\s*min\(240px, 32vw\)/.test(css), 'right-side info cards are compact instead of forcing wide dead space');
assert.ok(/\.infobox-image\s+span\s*\{[\s\S]*?font-size:\s*2\.6rem/.test(css), 'emoji info cards do not dominate the hero area');
assert.ok(!/\.infobox-image\s+span\s*\{[\s\S]*?!important/.test(css), 'emoji info card sizing does not require cascade-war priority');
assert.ok(!css.includes('.battle-engagement-deck {'), 'wiki.css no longer owns final engagement deck layout');
assert.ok(battleCss.includes('.wiki-engagement-module .battle-deck.battle-engagement-deck'), 'battle-layer.css owns final engagement module layout');

console.log('wiki-navigation-backfill-rendering.test.mjs passed');
