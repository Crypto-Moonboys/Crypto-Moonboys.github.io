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

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing section start: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `missing section end: ${endNeedle}`);
  return source.slice(start, end);
}

const html = read('wiki/gkniftyheads-nft-collection.html');
const visible = visibleText(html);
const statusClient = read('js/site-feed-status.js');
const rarityClient = read('js/gkniftyheads-rarity.js');
const css = read('css/wiki.css');
const templateShowcase = html.match(/<section class="gk-command-deck gk-showcase-section gk-template-rarity-showcase"[\s\S]*?<section class="gk-secondary-ranked-section"/)?.[0] || '';
const globalShowcase = html.match(/<section class="gk-command-deck gk-global-rarity-deck gk-showcase-section gk-global-rarity-showcase"[\s\S]*?<section class="gk-secondary-ranked-section"/)?.[0] || '';
const templateAuditSection = sliceBetween(html, '<details class="wiki-section gk-rarity-audit" data-rarity-audit>', '<section class="wiki-section gk-rarity-method">');
const globalAuditSection = sliceBetween(html, '<details class="wiki-section gk-rarity-audit gk-global-rarity-audit">', '<section class="wiki-section gk-rarity-utility">');
const utilitySection = sliceBetween(html, '<section class="wiki-section gk-rarity-utility">', '<section class="wiki-section gk-rarity-unissued">');
const unissuedSection = sliceBetween(html, '<section class="wiki-section gk-rarity-unissued">', '<details class="developer-details gk-rarity-developer-details">');

assert.doesNotMatch(html, /\[HERE\]\(url\)/, 'collection page must not show raw wiki/markdown link syntax');
assert.doesNotMatch(visible, /https:\/\/wax\.atomichub\.io\/market\?blockchain=/, 'visible page text must not paste the long Fun Coupon AtomicHub URL');
assert.doesNotMatch(visible, /https:\/\/neftyblocks\.com\/collection\/gkniftyheads\/blends/, 'visible page text must not paste the long NeftyBlocks blend URL');

assert.match(html, /<body class="page-wiki page-standard-shell page-gkniftyheads-collection"/, 'collection page should have a scoped body class for full-width hero shell');
assert.match(html, /<header class="page-hero wiki-living-hero gk-collection-hero">/, 'collection hero should use the How To Play full-width hero architecture');
assert.match(html, /class="howto-kicker gk-collection-kicker"[\s\S]*WAX NFT Collection/, 'collection hero should use How To Play kicker typography');
assert.match(html, /class="howto-glitch-title howto-pulse swarmsy-title"[\s\S]*GKniftyHEADS<br><span>NFT Collection<\/span>/, 'collection hero title should use How To Play glitch title treatment');
assert.match(html, /GKniftyHEADS is the WAX AtomicAssets collection layer of the Crypto Moonboys universe/, 'hero intro should be clean human-facing copy');
assert.match(html, /class="howto-route gk-collection-route"[\s\S]*COLLECTION HUB \/ COLLECTOR FLOW/, 'collection flow should live inside the hero route strip');
assert.match(html, /class="howto-btn"[^>]+>Buy \/ View Fun Coupons<\/a>/, 'Fun Coupon action button must render with How To Play button styling');
assert.match(html, /class="howto-btn howto-btn-secondary"[^>]+>Burn \/ Blend<\/a>/, 'NeftyBlocks blend action button must render with How To Play button styling');
assert.match(html, /class="howto-btn howto-btn-secondary"[^>]+>View AtomicHub<\/a>/, 'AtomicHub collection action button must render with How To Play button styling');
const collectionHero = sliceBetween(html, '<header class="page-hero wiki-living-hero gk-collection-hero">', '<script type="application/json" class="nft-search-terms"');
assert.doesNotMatch(collectionHero, /gk-info-card|wiki-action-button|<div class="page-title-line"/, 'collection hero should not contain nested cards, old wiki buttons, or article title chrome');
assert.match(html, /<nav class="breadcrumb" aria-label="Breadcrumb">[\s\S]*Home[\s\S]*&rarr;[\s\S]*NFTs[\s\S]*&rarr;[\s\S]*GKniftyHEADS NFT Collection/, 'breadcrumb should render clean Home -> NFTs -> collection hierarchy');
assert.doesNotMatch(html, /<span class="sep" aria-hidden="true">\?<\/span>/, 'breadcrumb separators must not render broken question marks');
assert.match(html, /gk-parent-hub-card[\s\S]*Primary parent[\s\S]*href="\/wiki\/crypto-moonboys\.html"[\s\S]*Crypto Moonboys/, 'collection page should identify Crypto Moonboys as the primary parent');
assert.match(html, /gk-universe-relationships[\s\S]*Crypto Moonboys Universe Path[\s\S]*Crypto Moonboys Origin[\s\S]*GKniftyHEADS Lore[\s\S]*GKniftyHEADS NFT Pages[\s\S]*HODL WARS Links/, 'page should surface canonical universe relationships above collector tools');
assert.match(html, /gk-collection-dashboard[\s\S]*Collection Control Panel[\s\S]*Collection Art[\s\S]*Daily Missions[\s\S]*Collection Stats/, 'collection art, daily missions, and stats should render as a balanced dashboard');

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
  html.indexOf('gk-template-rarity-showcase') < html.indexOf('Full Rarity Audit'),
  'template audit table should sit below the showcase cards',
);
assert.ok(
  html.indexOf('gk-global-rarity-showcase') < html.indexOf('Full Global Rarity Audit'),
  'global audit table should sit below the exact NFT showcase cards',
);
assert.match(templateAuditSection, /<summary>Full Rarity Audit<\/summary>/, 'template audit summary should be visitor-facing');
for (const band of ['Legendary', 'Ultra Rare', 'Rare', 'Uncommon', 'Common']) {
  assert.ok(templateAuditSection.includes(`<h4>${band}</h4>`), `template audit should include ${band} card group`);
}
assert.ok(templateAuditSection.includes('gk-audit-card-groups'), 'template audit should render grouped cards');
assert.ok(templateAuditSection.includes('Advanced raw rarity table'), 'template audit should keep advanced raw table fallback');
assert.match(globalAuditSection, /<summary>Full Global Rarity Audit<\/summary>/, 'global audit summary should be visitor-facing');
assert.ok(globalAuditSection.includes('gk-audit-card-groups'), 'global audit should render grouped cards');
assert.ok(globalAuditSection.includes('Advanced raw global rarity table'), 'global audit should keep advanced raw table fallback');
assert.match(html, /<section class="wiki-section gk-rarity-utility">[\s\S]*<summary>Utility \/ Open Mint \/ Infinite Supply<\/summary>/, 'utility/open mint section must remain collapsed');
assert.match(html, /<section class="wiki-section gk-rarity-unissued">[\s\S]*<summary>Unissued \/ Not Circulating<\/summary>/, 'unissued section must remain collapsed');
for (const phrase of ['gk-side-card-groups', 'Utility / Coupons', 'Open Mint / Infinite Supply', 'Advanced raw utility table']) {
  assert.ok(utilitySection.includes(phrase), `utility section should include ${phrase}`);
}
for (const phrase of ['gk-side-card-groups', 'Not Circulating', 'Advanced raw unissued table']) {
  assert.ok(unissuedSection.includes(phrase), `unissued section should include ${phrase}`);
}
assert.match(html, /data-feed-status-id="gkniftyheads_rarity"/, 'feed status badge must remain');
assert.doesNotMatch(html, /\[object Object\]/, 'market analytics should not render object values as text');
assert.doesNotMatch(templateAuditSection.slice(0, templateAuditSection.indexOf('Advanced raw rarity table')), /<table class="wiki-table gk-rarity-table/, 'template raw table should sit behind advanced details');
assert.doesNotMatch(globalAuditSection.slice(0, globalAuditSection.indexOf('Advanced raw global rarity table')), /<table class="wiki-table gk-asset-version-table/, 'global raw table should sit behind advanced details');

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

const waxRenderer = read('js/wax-collection-renderer.js');
assert.match(waxRenderer, /function shouldRenderFullBridgeData/, 'WAX bridge renderer should keep full bridge hydration behind a tracker-page guard');
assert.match(waxRenderer, /function shouldRenderBridgeStatus/, 'WAX bridge status card should also be behind a tracker-page guard');
assert.match(waxRenderer, /if \(!shouldRenderBridgeStatus\(collection\)\) return;/, 'static tracker pages should not append a WAX Bridge card');
assert.match(read('js/wax-collection-renderer.js'), /!hasStaticTracker\(\)/, 'static tracker pages should not append a duplicate WAX bridge tracker');
assert.match(rarityClient, /const auditCards = Array\.from\(ranking\.querySelectorAll\('\[data-rarity-audit\] \.gk-audit-card\[data-rarity-filter\]'\)\)/, 'rarity filters should include visible audit cards');
assert.match(rarityClient, /const auditGroups = Array\.from\(ranking\.querySelectorAll\('\[data-rarity-audit\] \.gk-audit-card-group'\)\)/, 'rarity filters should include audit card groups');
assert.match(rarityClient, /for \(const card of auditCards\) \{[\s\S]*card\.hidden = !matchesFilter\(card, normalized\);[\s\S]*for \(const group of auditGroups\)/, 'audit cards should hide using the same filter matcher as table rows');
assert.match(rarityClient, /group\.hidden = visibleCards\.length === 0/, 'empty audit card groups should hide after filtering');
assert.doesNotMatch(stripDetails(html), /WAX Bridge|wax-bridge-status|wax-bridge-collection-data/, 'collection/wiki page should not show infrastructure WAX Bridge cards');
assert.match(html, /<details class="wiki-rabbit-group wiki-rabbit-group--nft-siblings" data-related-group="Related NFT Templates">/, 'related NFT templates should be collapsed on the collection page');
assert.match(html, /gk-related-card-grid[\s\S]*Crypto Moonboys Origin[\s\S]*GKniftyHEADS Collection[\s\S]*NFT Template Pages[\s\S]*Connected Lore/, 'related pages should render as relationship cards');
assert.match(html, /citation-vote-panel gk-wiki-intelligence-panel[\s\S]*Wiki intelligence[\s\S]*Citation Credibility/, 'citation voting panel should use the wiki intelligence treatment');
assert.match(html, /gk-community-intelligence-panel[\s\S]*Community intelligence[\s\S]*Collector Notes[\s\S]*class="wiki-comments"/, 'comments should sit inside a community intelligence panel');

assert.match(css, /\.gk-collection-actions/, 'collection action row should have responsive styling');
assert.match(css, /body\.page-wiki\.page-gkniftyheads-collection #content\s*\{[\s\S]*padding-top:\s*0/, 'collection page should remove the large gap below navigation');
assert.match(css, /body\.page-wiki\.page-gkniftyheads-collection \.wiki-content\.nft-collection-article\s*\{[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;[\s\S]*box-shadow:\s*none/, 'collection article shell should not render as an outer card around the hero');
assert.match(css, /\.gk-collection-hero\s*\{[\s\S]*grid-template-columns:\s*minmax\(280px,\s*0\.86fr\) minmax\(360px,\s*1\.14fr\)[\s\S]*min-height:\s*clamp\(560px,\s*62vh,\s*780px\)[\s\S]*border-right:\s*0;[\s\S]*border-left:\s*0;[\s\S]*border-radius:\s*0/, 'collection hero should match How To Play full-width proportions');
assert.match(css, /\.gk-collection-hero::before\s*\{[\s\S]*background-image:[\s\S]*linear-gradient\(rgba\(86,\s*220,\s*255,\s*0\.06\) 1px,\s*transparent 1px\)/, 'collection hero should use the How To Play grid overlay');
assert.match(css, /\.gk-collection-title-wrap \.howto-glitch-title\s*\{[\s\S]*font-size:\s*clamp\(3rem,\s*6\.1vw,\s*6\.05rem\)[\s\S]*text-shadow:[\s\S]*rgba\(255,\s*106,\s*213,\s*0\.6\)/, 'collection title should match How To Play typography and glow');
assert.match(css, /\.gk-collection-route\s*\{[\s\S]*border-left:\s*5px solid #00ffcc[\s\S]*line-height:\s*1\.95/, 'collection route strip should match How To Play route styling');
assert.match(css, /\.gk-showcase-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'showcase rows should render as stable three-card grids on desktop');
assert.match(css, /\.gk-top-ranked-list--cards/, 'secondary ranked lists should render as responsive cards');
assert.match(css, /\.gk-rarity-audit\s*\{[\s\S]*background:\s*rgba\(7,\s*11,\s*18,\s*0\.46\)/, 'audit tables should be visually subdued below the showcase');
assert.match(css, /\.gk-audit-card-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'audit sections should present collector cards before raw tables');
assert.match(css, /\.gk-dashboard-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'collection dashboard should use a balanced three-card grid');
assert.match(css, /\.gk-wiki-intelligence-panel/, 'citation credibility should use the wiki intelligence card treatment');
assert.match(css, /\.gk-community-intelligence-panel/, 'comments should use the community intelligence card treatment');
assert.match(css, /\.developer-details/, 'developer-only schema details should have collapsed detail styling');

console.log('GKniftyHEADS collection page cleanup audit passed.');
