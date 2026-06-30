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

console.log('relationship-hints-related-wiki-paths.test.mjs passed');
