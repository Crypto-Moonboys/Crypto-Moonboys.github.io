#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEGACY_PRESERVED_CONTENT_NOTE,
  MANUAL_CONTENT_BEGIN,
  MANUAL_CONTENT_END,
  SAM_CONTENT_BEGIN,
  runImport,
} from './import-website-publish-payloads.mjs';
import { runGenerateRelatedWikiPaths } from './generate-related-wiki-paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'website-payload-hints-e2e-'));
const payloadDir = path.join(root, 'website-publish-payloads');

function write(relPath, content) {
  const filePath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(relPath, data) {
  write(relPath, JSON.stringify(data, null, 2) + '\n');
}

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function articlePage(slug, title, category = 'lore', body = '') {
  return `<!DOCTYPE html><html><head><title>${title} - Crypto Moonboys Wiki</title><meta name="description" content="${title} fixture"></head><body><main id="content"><article class="wiki-content"><h1>${title}</h1><p>${body || `${title} fixture body.`}</p></article><div class="category-tags" aria-label="Article categories"><a href="/categories/${category}.html">${category}</a></div><div class="wiki-comments" data-page-id="${slug}"></div></main></body></html>`;
}

function relatedSection(html) {
  return html.match(/<!-- RELATED_WIKI_PATHS:BEGIN -->[\s\S]*?<!-- RELATED_WIKI_PATHS:END -->/i)?.[0] || '';
}

function groupSection(section, groupName) {
  const escaped = groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return section.match(new RegExp(`<div\\b[^>]*data-related-group=["']${escaped}["'][\\s\\S]*?<\\/div>`, 'i'))?.[0] || '';
}

function hrefs(html) {
  return [...String(html || '').matchAll(/\bhref=["']([^"']+)["']/gi)].map((match) => match[1]);
}

function assertIncludes(relPath, fragment, message) {
  assert.ok(read(relPath).includes(fragment), message || `${relPath} should include ${fragment}`);
}

fs.copyFileSync(path.join(ROOT, '_article-template.html'), path.join(root, '_article-template.html'));

for (const relPath of [
  'timeline.html',
  'graph.html',
  'dashboard.html',
  'community.html',
  'games/index.html',
  'games/leaderboard.html',
  'categories/lore.html',
  'categories/nfts.html',
  'categories/wax-nfts.html',
  'categories/nfts-digital-art.html',
  'categories/gaming.html',
  'categories/gkniftyheads.html',
  'categories/factions.html',
]) {
  write(relPath, '<!DOCTYPE html><html><body><main id="content"><div class="article-list" aria-label="Articles"></div></main></body></html>');
}

for (const [slug, title, category] of [
  ['crypto-moonboys', 'Crypto Moonboys', 'lore'],
  ['gkniftyheads', 'GKniftyHEADS', 'gkniftyheads'],
  ['gkniftyheads-nft-collection', 'GKniftyHEADS NFT Collection', 'nfts-digital-art'],
  ['graffpunks', 'GraffPUNKS', 'factions'],
  ['hodl-wars', 'HODL WARS', 'gaming'],
  ['block-topia', 'Block Topia', 'gaming'],
  ['fallback-only', 'Fallback Only', 'lore'],
]) {
  write(`wiki/${slug}.html`, articlePage(slug, title, category));
}

write('wiki/manual-only-e2e.html', `<!DOCTYPE html><html><head><title>Manual Only E2E</title><meta name="description" content="Manual-only e2e page."></head><body><main id="content"><article class="wiki-content">
${MANUAL_CONTENT_BEGIN}
<h1>Manual Only E2E</h1>
<p>Manual-only E2E page must stay in synced surfaces without a payload.</p>
${MANUAL_CONTENT_END}
</article><div class="category-tags" aria-label="Article categories"><a href="/categories/lore.html">Lore</a></div><div class="wiki-comments" data-page-id="manual-only-e2e"></div></main></body></html>`);

write('wiki/paper-hands.html', `<!DOCTYPE html><html><head><title>Paper Hands - Crypto Moonboys Wiki</title><meta name="description" content="Existing manual page."></head><body><main id="content"><article class="wiki-content">
<h1>Paper Hands</h1>
<p>OWNER MANUAL TEXT MUST SURVIVE THE FULL PIPELINE.</p>
<!-- RELATED_WIKI_PATHS:BEGIN --><section><p>OLD GENERATED RELATED LINKS MUST NOT BECOME MANUAL TRUTH.</p></section><!-- RELATED_WIKI_PATHS:END -->
<div id="bible-content"></div>
</article><div class="category-tags" aria-label="Article categories"><a href="/categories/lore.html">Lore</a></div><div class="wiki-comments" data-page-id="paper-hands"></div></main></body></html>`);

const lorePayload = {
  slug: 'paper-hands',
  title: 'Paper Hands',
  description: 'SAM payload e2e update for an existing manual page.',
  category: 'Lore',
  article_html: '<section class="wiki-section"><h2>SAM Update</h2><p>SAM PAYLOAD TEXT IS SEPARATE FROM MANUAL CONTENT.</p></section>',
  citations: [],
  see_also: [],
  source_refs: [],
  requested_update_reason: 'e2e relationship hints test',
  last_updated_source: 'e2e fixture',
  publish_mode: 'middle_content_only',
  relationship_hints: {
    project_hubs: [
      { url: '/wiki/block-topia.html', name: 'Block Topia', relationship: 'explicit first project hub' },
      { url: 'https://example.com/external', name: 'External ignored' },
      { url: '/wiki/missing-page.html', name: 'Missing ignored' },
      { url: '/wiki/crypto-moonboys.html.html', name: 'Crypto Moonboys normalized' },
    ],
    collections: [{ slug: 'gkniftyheads-nft-collection', name: 'GKniftyHEADS NFT Collection' }],
    factions: [{ slug: 'graffpunks', name: 'GraffPUNKS' }],
    games: [{ slug: 'hodl-wars', name: 'HODL WARS' }],
    lore: [{ slug: 'crypto-moonboys', name: 'Crypto Moonboys' }],
    categories: [{ slug: 'nfts', name: 'NFTs' }, { slug: 'wax-nfts', name: 'WAX NFTs' }],
  },
};

const nftPayload = {
  slug: 'gkniftyheads-nova-shadow-shredder-784419',
  title: 'GKniftyHEADS Nova Shadow Shredder',
  description: 'NFT template e2e fixture with relationship hints.',
  category: 'NFTs Digital Art',
  article_html: '<p class="lead-paragraph">NFT template e2e article body.</p>',
  citations: [],
  see_also: [],
  source_refs: [],
  requested_update_reason: 'e2e relationship hints test',
  last_updated_source: 'e2e fixture',
  publish_mode: 'middle_content_only',
  page_type: 'nft_template',
  collection: 'gkniftyheads',
  template_id: '784419',
  tags: ['gkniftyheads', 'nft'],
  media: {
    type: 'nft_image',
    placement: 'battle_heat',
    image_url: 'https://example.com/nova-shadow.png',
    alt: 'Nova Shadow Shredder NFT image',
    fallback_urls: ['https://example.com/nova-shadow.webp'],
  },
  relationship_hints: {
    collections: [
      { url: '/wiki/gkniftyheads-nft-collection.html', name: 'GKniftyHEADS NFT Collection' },
      { url: '/wiki/gkniftyheads.html', name: 'GKniftyHEADS' },
    ],
    project_hubs: [{ url: '/wiki/crypto-moonboys.html', name: 'Crypto Moonboys' }],
    factions: [{ url: '/wiki/graffpunks.html', name: 'GraffPUNKS' }],
    games: [{ url: '/wiki/hodl-wars.html', name: 'HODL WARS' }],
    categories: [
      { url: '/categories/nfts.html', name: 'NFTs' },
      { url: '/categories/wax-nfts.html', name: 'WAX NFTs' },
    ],
  },
};

writeJson('website-publish-payloads/paper-hands.json', lorePayload);
writeJson('website-publish-payloads/gkniftyheads-nova-shadow-shredder-784419.json', nftPayload);

runImport({
  payloadDir,
  rootDir: root,
  write: true,
  logger: () => {},
});
runGenerateRelatedWikiPaths(root);

const paperHtml = read('wiki/paper-hands.html');
const manualBegin = paperHtml.indexOf(MANUAL_CONTENT_BEGIN);
const manualEnd = paperHtml.indexOf(MANUAL_CONTENT_END);
const samBegin = paperHtml.indexOf(SAM_CONTENT_BEGIN);
assert.ok(paperHtml.includes('OWNER MANUAL TEXT MUST SURVIVE THE FULL PIPELINE.'), 'existing manual text is preserved');
assert.ok(paperHtml.includes(LEGACY_PRESERVED_CONTENT_NOTE), 'legacy-preserved note is added to unmarked existing content');
assert.ok(manualBegin >= 0 && manualEnd > manualBegin, 'manual section is wrapped');
assert.ok(samBegin > manualEnd, 'SAM_CONTENT is separate and below manual content');
assert.ok(paperHtml.includes('SAM PAYLOAD TEXT IS SEPARATE FROM MANUAL CONTENT.'), 'SAM content is written');
const manualBlock = paperHtml.slice(manualBegin, manualEnd);
assert.ok(!manualBlock.includes('OLD GENERATED RELATED LINKS MUST NOT BECOME MANUAL TRUTH.'), 'old Related Wiki Paths block is not captured as manual truth');
assert.match(paperHtml, /<div class="wiki-comments" data-page-id="paper-hands"><\/div>/, 'comments block survives render');
assert.match(paperHtml, /<div class="category-tags" aria-label="Article categories">/, 'category tags survive render');

const persistedHints = JSON.parse(read('js/wiki-relationship-hints.json'));
assert.ok(persistedHints['/wiki/paper-hands.html'], 'lore relationship_hints are persisted');
assert.ok(persistedHints['/wiki/gkniftyheads-nova-shadow-shredder-784419.html'], 'NFT relationship_hints are persisted');
assert.ok(!JSON.stringify(persistedHints).includes('https://example.com/external'), 'external hinted URLs are not persisted');
assert.ok(!JSON.stringify(persistedHints).includes('.html.html'), '.html.html URLs are normalized before persistence');

const paperRelated = relatedSection(paperHtml);
assert.ok(paperRelated, 'generate-related-wiki-paths consumes persisted hints for manual/SAM page');
const coreProjectGroup = groupSection(paperRelated, 'Core Project Links');
assert.equal(hrefs(coreProjectGroup)[0], '/wiki/block-topia.html', 'explicit hinted project hub renders before fallback links');
for (const expected of [
  '/wiki/gkniftyheads-nft-collection.html',
  '/wiki/graffpunks.html',
  '/wiki/hodl-wars.html',
  '/wiki/crypto-moonboys.html',
  '/categories/nfts.html',
  '/categories/wax-nfts.html',
]) {
  assert.ok(paperRelated.includes(`href="${expected}"`), `hinted link renders: ${expected}`);
}
assert.ok(!paperRelated.includes('https://example.com/external'), 'external hinted URLs are ignored in rendered links');
assert.ok(!paperRelated.includes('/wiki/missing-page.html'), 'broken internal hinted URLs are ignored in rendered links');
assert.ok(!/\.html\.html/.test(paperRelated), '.html.html links do not render');

for (const relPath of [
  'js/wiki-index.json',
  'js/timeline-data.json',
  'js/graph-data.json',
  'categories/lore.html',
  'sitemap.xml',
]) {
  assertIncludes(relPath, 'manual-only-e2e', `manual-only page must enter ${relPath}`);
}

const fallbackSection = relatedSection(read('wiki/fallback-only.html'));
assert.ok(fallbackSection.includes('Core Project Links'), 'pages without relationship_hints still get fallback Related Wiki Paths');
assert.ok(fallbackSection.includes('/wiki/crypto-moonboys.html'), 'fallback Related Wiki Paths include project hub when no hints exist');

const nftRelated = relatedSection(read('wiki/gkniftyheads-nova-shadow-shredder-784419.html'));
for (const expected of [
  '/wiki/gkniftyheads-nft-collection.html',
  '/wiki/crypto-moonboys.html',
  '/wiki/gkniftyheads.html',
  '/categories/nfts.html',
  '/categories/wax-nfts.html',
  '/wiki/graffpunks.html',
  '/wiki/hodl-wars.html',
]) {
  assert.ok(nftRelated.includes(`href="${expected}"`), `NFT hinted/fallback link renders: ${expected}`);
}
assert.ok(!/<img\b[^>]*\bnft-image\b/i.test(read('wiki/gkniftyheads-nova-shadow-shredder-784419.html').replace(/<template\b[\s\S]*?<\/template>/i, '')), 'NFT image remains inside Battle Heat template after e2e import');

console.log('e2e-website-payload-relationship-hints.test.mjs passed');
