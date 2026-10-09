#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runGenerateRelatedWikiPaths } from './generate-related-wiki-paths.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relationship-hints-rabbit-'));

function write(relPath, content) {
  const filePath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(relPath, data) {
  write(relPath, JSON.stringify(data, null, 2) + '\n');
}

function article(title, body = '') {
  return `<!DOCTYPE html><html><head><title>${title} - Crypto Moonboys Wiki</title><meta name="description" content="${title} fixture"></head><body><main id="content"><article class="wiki-content"><h1>${title}</h1><p>${body || `${title} fixture article.`}</p></article><div class="category-tags" aria-label="Article categories"><a href="/categories/lore.html">Lore</a></div><div class="wiki-comments" data-page-id="${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"></div></main></body></html>`;
}

function hrefs(html) {
  return [...html.matchAll(/\bhref=["']([^"']+)["']/gi)].map((match) => match[1]);
}

function relatedSection(html) {
  return html.match(/<!-- RELATED_WIKI_PATHS:BEGIN -->[\s\S]*?<!-- RELATED_WIKI_PATHS:END -->/i)?.[0] || '';
}

function firstGroup(section) {
  return section.match(/<div\b[^>]*class=["'][^"']*\bwiki-rabbit-group\b[\s\S]*?<\/div>/i)?.[0] || '';
}

const pages = [
  ['/wiki/crypto-moonboys.html', 'Crypto Moonboys', 'lore', ['crypto', 'moonboys']],
  ['/wiki/gkniftyheads.html', 'GKniftyHEADS', 'lore', ['gkniftyheads']],
  ['/wiki/gkniftyheads-nft-collection.html', 'GKniftyHEADS NFT Collection', 'nfts-digital-art', ['gkniftyheads', 'collection']],
  ['/wiki/gkniftyheads-nova-shadow-shredder-784419.html', 'GKniftyHEADS Nova Shadow Shredder', 'nfts-digital-art', ['gkniftyheads', 'nft']],
  ['/wiki/block-topia.html', 'Block Topia', 'gaming', ['game']],
  ['/wiki/graffpunks.html', 'GraffPUNKS', 'factions', ['faction']],
  ['/wiki/charlie-buster.html', 'Charlie Buster', 'community-people', ['character']],
  ['/wiki/hodl-wars.html', 'HODL WARS', 'gaming', ['game']],
  ['/wiki/waxp.html', 'WAXP', 'cryptocurrencies', ['token']],
  ['/wiki/paper-hands.html', 'Paper Hands', 'lore', ['lore']],
  ['/wiki/fallback-only.html', 'Fallback Only', 'lore', ['lore']],
];

for (const [url, title] of pages) {
  const extra = url.includes('gkniftyheads-nova')
    ? '<article class="wiki-content nft-template-article" data-page-type="nft_template" data-collection="gkniftyheads"><h1>GKniftyHEADS Nova Shadow Shredder</h1><p>NFT template fixture.</p></article>'
    : null;
  write(url.replace(/^\//, ''), extra
    ? `<!DOCTYPE html><html><body><main id="content">${extra}</main></body></html>`
    : article(title));
}

for (const relPath of [
  'categories/lore.html',
  'categories/nfts.html',
  'categories/wax-nfts.html',
  'categories/nfts-digital-art.html',
  'categories/factions.html',
  'categories/gaming.html',
  'categories/gkniftyheads.html',
  'timeline.html',
  'graph.html',
  'dashboard.html',
]) {
  write(relPath, '<!DOCTYPE html><html><body>fixture</body></html>');
}

writeJson('js/wiki-index.json', pages.map(([url, title, category, tags]) => ({
  title: `${title} - Crypto Moonboys Wiki`,
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
    slug: 'crypto-moonboys',
    url: '/wiki/crypto-moonboys.html',
    relationship_hints: {
      project_hubs: [
        { url: '/wiki/block-topia.html', name: 'Block Topia', relationship: 'explicit project hub' },
        { url: 'https://example.com/external', name: 'External ignored' },
        { url: '/wiki/missing-page.html', name: 'Missing ignored' },
        { url: '/wiki/gkniftyheads.html.html', name: 'GKniftyHEADS normalized' },
      ],
      collections: [{ slug: 'gkniftyheads-nft-collection', name: 'GKniftyHEADS NFT Collection' }],
      factions: [{ slug: 'graffpunks', name: 'GraffPUNKS' }],
      characters: [{ slug: 'charlie-buster', name: 'Charlie Buster' }],
      games: [{ slug: 'hodl-wars', name: 'HODL WARS' }],
      tokens: [{ slug: 'waxp', name: 'WAXP' }],
      lore: [{ slug: 'paper-hands', name: 'Paper Hands' }],
      categories: [
        { slug: 'nfts', name: 'NFTs' },
        { slug: 'wax-nfts', name: 'WAX NFTs' },
      ],
      tags: [{ slug: 'gaming', name: 'Gaming' }],
    },
  },
  '/wiki/gkniftyheads-nova-shadow-shredder-784419.html': {
    slug: 'gkniftyheads-nova-shadow-shredder-784419',
    url: '/wiki/gkniftyheads-nova-shadow-shredder-784419.html',
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
assert.ok(result.written >= 3, 'generator should update hinted and fallback pages');

const cryptoHtml = fs.readFileSync(path.join(root, 'wiki', 'crypto-moonboys.html'), 'utf8');
const cryptoSection = relatedSection(cryptoHtml);
assert.ok(cryptoSection, 'Crypto Moonboys root page gets related paths');
assert.match(firstGroup(cryptoSection), /data-related-group="Core Project Links"/);
assert.ok(hrefs(firstGroup(cryptoSection))[0] === '/wiki/block-topia.html', 'explicit project_hubs render before generic fallback links');
for (const expected of [
  '/wiki/gkniftyheads-nft-collection.html',
  '/wiki/graffpunks.html',
  '/wiki/charlie-buster.html',
  '/wiki/hodl-wars.html',
  '/wiki/waxp.html',
  '/wiki/paper-hands.html',
  '/categories/nfts.html',
  '/categories/wax-nfts.html',
  '/categories/gaming.html',
]) {
  assert.ok(cryptoSection.includes(`href="${expected}"`), `hinted link renders: ${expected}`);
}
assert.ok(!cryptoSection.includes('https://example.com/external'), 'external hint URLs are ignored');
assert.ok(!cryptoSection.includes('/wiki/missing-page.html'), 'broken internal hint URLs are ignored');
assert.ok(!/\.html\.html/.test(cryptoSection), '.html.html links are impossible');

const fallbackHtml = fs.readFileSync(path.join(root, 'wiki', 'fallback-only.html'), 'utf8');
const fallbackSection = relatedSection(fallbackHtml);
assert.ok(fallbackSection.includes('Core Project Links'), 'pages without relationship hints keep fallback related paths');

const nftHtml = fs.readFileSync(path.join(root, 'wiki', 'gkniftyheads-nova-shadow-shredder-784419.html'), 'utf8');
const nftSection = relatedSection(nftHtml);
for (const expected of [
  '/wiki/gkniftyheads-nft-collection.html',
  '/wiki/crypto-moonboys.html',
  '/wiki/graffpunks.html',
  '/wiki/hodl-wars.html',
  '/categories/nfts.html',
  '/categories/wax-nfts.html',
]) {
  assert.ok(nftSection.includes(`href="${expected}"`), `NFT hinted link renders: ${expected}`);
}

// A scoped lore update must preserve curated groups on unrelated NFT pages
// and other articles. Invalid selections must fail before any mutation.
const untouched = new Map(['crypto-moonboys', 'gkniftyheads-nova-shadow-shredder-784419'].map(slug => [slug, fs.readFileSync(path.join(root, 'wiki', `${slug}.html`), 'utf8')]));
write('wiki/fallback-only.html', article('Fallback Only', 'A newly edited lore article.'));
const scoped = runGenerateRelatedWikiPaths(root, { pages: ['fallback-only'] });
assert.equal(scoped.written, 1);
assert.ok(relatedSection(fs.readFileSync(path.join(root, 'wiki/fallback-only.html'), 'utf8')));
for (const [slug, html] of untouched) assert.equal(fs.readFileSync(path.join(root, 'wiki', `${slug}.html`), 'utf8'), html, `scoped update preserves ${slug}`);
const beforeInvalid = fs.readFileSync(path.join(root, 'wiki/fallback-only.html'), 'utf8');
assert.throws(() => runGenerateRelatedWikiPaths(root, { pages: ['fallback-only', 'missing-page'] }));
assert.throws(() => runGenerateRelatedWikiPaths(root, { pages: [] }));
assert.throws(() => runGenerateRelatedWikiPaths(root, { pages: ['../fallback-only'] }));
assert.equal(fs.readFileSync(path.join(root, 'wiki/fallback-only.html'), 'utf8'), beforeInvalid, 'invalid selections fail before writing');

// Existing generated paths may sit inside an ownership wrapper. Updating them
// must not relocate that block or consume neighbouring engagement components.
const functionalTail = `<!-- CITATION_VOTE_PANEL:BEGIN -->
<section class="citation-vote-panel" data-citation-vote-panel="true"><h2>Citation Credibility</h2><div><span class="cite-vote" data-page-id="fallback-only" data-cite-id="citation-panel"></span></div></section>
<!-- CITATION_VOTE_PANEL:END -->
<section data-citation-vote-panel="true"><span class="cite-vote" data-cite-id="unmarked"></span></section>
<script src="/js/engagement.js"></script>`;
const protectedHtml = beforeInvalid.replace('<!-- RELATED_WIKI_PATHS:BEGIN -->', '<!-- SAM:BEGIN:related -->\n<!-- RELATED_WIKI_PATHS:BEGIN -->')
  .replace('<!-- RELATED_WIKI_PATHS:END -->', '<!-- RELATED_WIKI_PATHS:END -->\n<!-- SAM:END:related -->')
  .replace('<div class="wiki-comments"', `${functionalTail}\n<div class="wiki-comments"`);
write('wiki/fallback-only.html', protectedHtml);
runGenerateRelatedWikiPaths(root, { pages: ['fallback-only'] });
const preserved = fs.readFileSync(path.join(root, 'wiki/fallback-only.html'), 'utf8');
const outsideRelated = html => html.replace(/<!-- RELATED_WIKI_PATHS:BEGIN -->[\s\S]*?<!-- RELATED_WIKI_PATHS:END -->/, 'RELATED');
assert.equal(outsideRelated(preserved), outsideRelated(protectedHtml), 'nested wrappers, both citation panels, comments, categories and scripts remain byte-identical');
assert.equal(runGenerateRelatedWikiPaths(root, { pages: ['fallback-only'] }).written, 0, 'repeated generation does not accumulate whitespace or move components');

const curatedNft = nftHtml.replace(/<span class="wiki-rabbit-card-desc">[\s\S]*?<\/span>/, '<span class="wiki-rabbit-card-desc">Curated collection description; preserve its wording.</span>');
write('wiki/gkniftyheads-nova-shadow-shredder-784419.html', curatedNft);
// This NFT's sibling card uses a registered NFT URL and a deliberately older
// description than the search index; a scoped lore rebuild must retain it.
const nftCard = '<a class="wiki-rabbit-card" href="/wiki/gkniftyheads-nova-shadow-shredder-784419.html" role="listitem"><span class="wiki-rabbit-card-title">NFT</span><span class="wiki-rabbit-card-desc">Curated NFT wording.</span></a>';
const oldPaths = `<!-- RELATED_WIKI_PATHS:BEGIN --><section><div class="wiki-rabbit-group" data-related-group="Related Wiki Pages">${nftCard}</div></section><!-- RELATED_WIKI_PATHS:END -->`;
const updatedIndex = JSON.parse(fs.readFileSync(path.join(root, 'js/wiki-index.json'), 'utf8'));
const nftEntry = updatedIndex.find(entry => entry.url === '/wiki/gkniftyheads-nova-shadow-shredder-784419.html');
nftEntry.tags = ['lore'];
nftEntry.rank_score = 10000;
writeJson('js/wiki-index.json', updatedIndex);
write('wiki/fallback-only.html', protectedHtml.replace(/<!-- RELATED_WIKI_PATHS:BEGIN -->[\s\S]*?<!-- RELATED_WIKI_PATHS:END -->/, oldPaths));
runGenerateRelatedWikiPaths(root, { pages: ['fallback-only'] });
const generated = relatedSection(fs.readFileSync(path.join(root, 'wiki/fallback-only.html'), 'utf8'));
assert.ok(generated.includes('Curated NFT wording.'), 'existing NFT card descriptions survive lore regeneration');
assert.match(generated, /class="wiki-rabbit-group" data-related-group="Related Wiki Pages"/, 'existing group classes are preserved');
assert.equal(fs.readFileSync(path.join(root, 'wiki/gkniftyheads-nova-shadow-shredder-784419.html'), 'utf8'), curatedNft, 'NFT article is byte-identical after a scoped lore rebuild');

// Inferred relations may omit existing curated navigation entirely. The group
// and its nested layout/disclosure state must survive, not just shared titles.
const curatedRoutes = '<details open class="wiki-rabbit-group curated-history" data-related-group="Curated History"><summary>History</summary><div class="wiki-rabbit-grid" role="list"><div><a class="wiki-rabbit-card" href="/wiki/paper-hands.html">Local history</a><a class="wiki-rabbit-card" href="/timeline.html">Timeline</a><a class="wiki-rabbit-card" href="/graph.html?mode=hero">World map</a></div></div></details>';
const categoryCards = '<div class="wiki-rabbit-group" data-related-group="Related Categories"><h3>Related Categories</h3><div class="wiki-rabbit-grid" role="list"><a class="wiki-rabbit-card" href="/categories/lore.html"><span class="wiki-rabbit-card-title">Lore</span></a></div></div>';
const existingPage = fs.readFileSync(path.join(root, 'wiki/fallback-only.html'), 'utf8');
write('wiki/fallback-only.html', existingPage.replace('      </section>\n<!-- RELATED_WIKI_PATHS:END -->', `${curatedRoutes}${categoryCards}\n      </section>\n<!-- RELATED_WIKI_PATHS:END -->`));
runGenerateRelatedWikiPaths(root, { pages: ['fallback-only'] });
const curatedResult = relatedSection(fs.readFileSync(path.join(root, 'wiki/fallback-only.html'), 'utf8'));
assert.ok(curatedResult.includes(curatedRoutes), 'unmatched curated navigation remains byte-identical, with nested divs and open details');
assert.equal(hrefs(curatedResult).filter(url => url === '/wiki/paper-hands.html').length, 1, 'curated destinations take precedence over inferred links');
assert.equal(hrefs(curatedResult).filter(url => url === '/timeline.html').length, 1, 'curated timeline is not duplicated in project links');
assert.equal(hrefs(curatedResult).filter(url => url === '/graph.html?mode=hero').length, 1, 'curated query-string destination is not duplicated in project links');
assert.match(curatedResult, /data-related-group="Related Categories">[\s\S]*?<div class="wiki-rabbit-grid" role="list">[\s\S]*?<a class="wiki-rabbit-card"/, 'existing category card grid does not become a chip grid');
assert.equal(runGenerateRelatedWikiPaths(root, { pages: ['fallback-only'] }).written, 0, 'curated group preservation is stable on repeated generation');

// Existing anchors and accessible section headings are part of navigation,
// including on articles without canonical ownership markers.
const latestHtml = fs.readFileSync(path.join(root, 'wiki/fallback-only.html'), 'utf8');
const customHeader = '<section class="wiki-rabbit-holes curated-routes" data-related-wiki-paths="true" role="region" aria-labelledby="fallback-related"><h2 id="fallback-related" class="curated-title">Curated Related Paths</h2><p class="curated-intro">Follow the surviving local records.</p>';
const customHtml = latestHtml.replace(/<section\b[^>]*data-related-wiki-paths="true"[^>]*>\s*<h2\b[^>]*>[\s\S]*?<\/h2>\s*<p\b[^>]*>[\s\S]*?<\/p>/, customHeader);
assert.notEqual(customHtml, latestHtml, 'fixture replaces the existing generated section header');
write('wiki/fallback-only.html', customHtml);
runGenerateRelatedWikiPaths(root, { pages: ['fallback-only'] });
const customResult = relatedSection(fs.readFileSync(path.join(root, 'wiki/fallback-only.html'), 'utf8'));
for (const fragment of ['<section class="wiki-rabbit-holes curated-routes" data-related-wiki-paths="true" role="region" aria-labelledby="fallback-related">', '<h2 id="fallback-related" class="curated-title">Curated Related Paths</h2>', '<p class="curated-intro">Follow the surviving local records.</p>']) {
  assert.ok(customResult.includes(fragment), `existing section header survives: ${fragment}`);
}
assert.equal(runGenerateRelatedWikiPaths(root, { pages: ['fallback-only'] }).written, 0, 'custom anchor and header preservation remains stable');

console.log('relationship-hints-related-wiki-paths.test.mjs passed');
