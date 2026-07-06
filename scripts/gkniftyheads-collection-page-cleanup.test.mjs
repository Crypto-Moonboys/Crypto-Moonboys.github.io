#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function stripDetails(html) {
  return html.replace(/<details\b[\s\S]*?<\/details>/gi, '');
}

function visibleText(html) {
  return stripDetails(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const html = read('wiki/gkniftyheads-nft-collection.html');
const visible = visibleText(html);
const statusClient = read('js/site-feed-status.js');
const css = read('css/wiki.css');
const templateShowcase = html.match(/<section class="gk-command-deck gk-showcase-section gk-template-rarity-showcase"[\s\S]*?<section class="gk-secondary-ranked-section"/)?.[0] || '';
const globalShowcase = html.match(/<section class="gk-command-deck gk-global-rarity-deck gk-showcase-section gk-global-rarity-showcase"[\s\S]*?<section class="gk-secondary-ranked-section"/)?.[0] || '';

assert.doesNotMatch(html, /\[HERE\]\(url\)/, 'collection page must not show raw wiki/markdown link syntax');
assert.doesNotMatch(visible, /https:\/\/wax\.atomichub\.io\/market\?blockchain=/, 'visible page text must not paste the long Fun Coupon AtomicHub URL');
assert.doesNotMatch(visible, /https:\/\/neftyblocks\.com\/collection\/gkniftyheads\/blends/, 'visible page text must not paste the long NeftyBlocks blend URL');

assert.match(html, /GKniftyHEADS is a WAX AtomicAssets collection hub/, 'hero intro should be clean human-facing copy');
assert.match(html, /class="wiki-action-button"[^>]+>Buy \/ View GKniftyHEADS Fun Coupons<\/a>/, 'Fun Coupon action button must render');
assert.match(html, /class="wiki-action-button"[^>]+>Burn \/ Blend on NeftyBlocks<\/a>/, 'NeftyBlocks blend action button must render');
assert.match(html, /class="wiki-action-button"[^>]+>View Collection on AtomicHub<\/a>/, 'AtomicHub collection action button must render');

assert.match(html, /GKniftyHEADS Rarity Tracker/, 'rarity tracker must remain on the page');
assert.match(html, /gk-template-rarity-showcase[\s\S]*Template Rarity: Top 3[\s\S]*Rank #1[\s\S]*Rank #2[\s\S]*Rank #3/, 'template rarity top-three showcase cards must lead the ranking section');
assert.match(html, /gk-global-rarity-showcase[\s\S]*Exact NFT Global Rarity: Top 3[\s\S]*Global #1[\s\S]*Global #2[\s\S]*Global #3/, 'global exact NFT top-three showcase cards must lead the asset ranking section');
assert.doesNotMatch(templateShowcase, /gk-command-traits|Variation trait|Missing \/ burned|Issued supply/, 'template showcase cards should stay collector-focused, not mini audit tables');
assert.doesNotMatch(globalShowcase, /gk-command-traits|Template rank|Surviving mint rank|Asset \d{6,}/, 'global showcase cards should stay collector-focused, not mini audit tables');
assert.match(templateShowcase, /gk-showcase-key-trait[\s\S]*Key trait/, 'template showcase cards should keep one key trait line');
assert.match(globalShowcase, /gk-showcase-key-trait[\s\S]*Key trait/, 'global showcase cards should keep one key trait line');
assert.match(html, /<h3>Top Ranked Templates<\/h3>/, 'top ranked templates should be the main table section');
assert.match(html, /<h3>Best Exact NFT Versions<\/h3>/, 'asset version ranking should use the collector-facing title');
assert.ok(
  html.indexOf('gk-template-rarity-showcase') < html.indexOf('Full Rarity Audit Table'),
  'template audit table should sit below the showcase cards',
);
assert.ok(
  html.indexOf('gk-global-rarity-showcase') < html.indexOf('Full Global Rarity Audit Table'),
  'global audit table should sit below the exact NFT showcase cards',
);
assert.match(html, /<section class="wiki-section gk-rarity-utility">[\s\S]*<summary>Utility \/ Open Mint \/ Infinite Supply<\/summary>/, 'utility/open mint section must remain collapsed');
assert.match(html, /<section class="wiki-section gk-rarity-unissued">[\s\S]*<summary>Unissued \/ Not Circulating<\/summary>/, 'unissued section must remain collapsed');
assert.match(html, /data-feed-status-id="gkniftyheads_rarity"/, 'feed status badge must remain');
assert.doesNotMatch(html, /\[object Object\]/, 'market analytics should not render object values as text');

const visibleMethodMatches = visible.match(/How rarity works|Rarity Method/g) || [];
assert.equal(visibleMethodMatches.length, 1, 'visible page should contain one concise rarity-method block');
assert.doesNotMatch(visible, /Original mint numbers never change[\s\S]*Original mint numbers never change/, 'mint-number explanation should not be repeated visibly');
assert.match(html, /<th>Asset Rank<\/th><th>NFT<\/th><th>Asset Score<\/th><th>Asset ID<\/th><th>Template ID<\/th><th>Original Mint Number<\/th><th>Surviving Mint Rank<\/th><th>Live Supply<\/th>/, 'asset table should omit owner/template debug columns');

assert.match(html, /<h2 id="schemas">Schema Summary<\/h2>/, 'schema section should be a readable summary');
assert.match(html, /<tr><th>Schema<\/th><th>Display Name<\/th><th>Purpose \/ Notes<\/th><th>Created<\/th><\/tr>/, 'schema table should use visitor-facing columns');
assert.match(html, /<td><code>bmhodlwarsyo<\/code><\/td>\s*<td>HODL WARS Battle Mechs<\/td>/, 'known schema slug should have readable display name');
assert.match(html, /<td><code>gkniftyheads<\/code><\/td>\s*<td>GKniftyHEADS<\/td>/, 'core schema should have readable display name');
assert.doesNotMatch(stripDetails(html), /\[\{&#x27;name&#x27;:|'\s*name\s*'/, 'raw schema JSON/format must not be visible outside collapsed developer details');
assert.match(html, /<details class="developer-details gk-schema-developer-details">[\s\S]*Developer schema field details/, 'raw schema details should remain collapsed for developers');

assert.match(statusClient, /Rarity snapshot active - live supply counted - burn baseline active/, 'public GKniftyHEADS badge should show live-counted mode when feed status reports counted supply');
assert.match(statusClient, /Rarity snapshot active - issued-supply fallback - live burn scan pending/, 'public GKniftyHEADS badge should retain a fallback label when live counts are unavailable');
assert.match(statusClient, /node\.textContent = label\(status\)/, 'badge visible text should use visitor-safe label');
assert.match(statusClient, /node\.setAttribute\('title', detailLabel\(status\)\)/, 'detailed feed errors should stay in title text');
assert.doesNotMatch(statusClient, /node\.textContent = detailLabel/, 'detailed feed errors must not become visible badge text');

assert.match(read('js/wax-collection-renderer.js'), /function shouldRenderFullBridgeData/, 'WAX bridge renderer should keep full bridge hydration behind a tracker-page guard');
assert.match(read('js/wax-collection-renderer.js'), /!hasStaticTracker\(\)/, 'static tracker pages should not append a duplicate WAX bridge tracker');
assert.match(html, /<details class="wiki-rabbit-group wiki-rabbit-group--nft-siblings" data-related-group="Related NFT Templates">/, 'related NFT templates should be collapsed on the collection page');

assert.match(css, /\.gk-collection-actions/, 'collection action row should have responsive styling');
assert.match(css, /\.gk-showcase-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'showcase rows should render as stable three-card grids on desktop');
assert.match(css, /\.gk-top-ranked-list--cards/, 'secondary ranked lists should render as responsive cards');
assert.match(css, /\.gk-rarity-audit\s*\{[\s\S]*background:\s*rgba\(7,\s*11,\s*18,\s*0\.46\)/, 'audit tables should be visually subdued below the showcase');
assert.match(css, /\.developer-details/, 'developer-only schema details should have collapsed detail styling');

console.log('GKniftyHEADS collection page cleanup audit passed.');
