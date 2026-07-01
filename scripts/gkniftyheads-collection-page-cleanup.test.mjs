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

assert.doesNotMatch(html, /\[HERE\]\(url\)/, 'collection page must not show raw wiki/markdown link syntax');
assert.doesNotMatch(visible, /https:\/\/wax\.atomichub\.io\/market\?blockchain=/, 'visible page text must not paste the long Fun Coupon AtomicHub URL');
assert.doesNotMatch(visible, /https:\/\/neftyblocks\.com\/collection\/gkniftyheads\/blends/, 'visible page text must not paste the long NeftyBlocks blend URL');

assert.match(html, /GKniftyHEADS is a WAX AtomicAssets collection hub/, 'hero intro should be clean human-facing copy');
assert.match(html, /class="wiki-action-button"[^>]+>Buy \/ View GKniftyHEADS Fun Coupons<\/a>/, 'Fun Coupon action button must render');
assert.match(html, /class="wiki-action-button"[^>]+>Burn \/ Blend on NeftyBlocks<\/a>/, 'NeftyBlocks blend action button must render');
assert.match(html, /class="wiki-action-button"[^>]+>View Collection on AtomicHub<\/a>/, 'AtomicHub collection action button must render');

assert.match(html, /GKniftyHEADS Template Rarity Ranking/, 'template rarity ranking must remain on the page');
assert.match(html, /<section class="wiki-section gk-rarity-utility">[\s\S]*Utility \/ Open Mint \/ Infinite Supply/, 'utility/open mint section must remain');
assert.match(html, /<section class="wiki-section gk-rarity-unissued">[\s\S]*Unissued \/ Not Circulating/, 'unissued section must remain');
assert.match(html, /data-feed-status-id="gkniftyheads_rarity"/, 'feed status badge must remain');

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

assert.match(css, /\.gk-collection-actions/, 'collection action row should have responsive styling');
assert.match(css, /\.developer-details/, 'developer-only schema details should have collapsed detail styling');

console.log('GKniftyHEADS collection page cleanup audit passed.');
