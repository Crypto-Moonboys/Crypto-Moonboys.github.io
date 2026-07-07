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
const rarityGenerator = read('scripts/generate-gkniftyheads-rarity.mjs');
const css = read('css/wiki.css');
const sharedHeaderHtml = read('wiki/components/header.html');
const siteShell = read('js/site-shell.js');
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
assert.match(html, /<div class="howto-hero-actions gk-collection-actions" role="group" aria-label="GKniftyHEADS collection actions">/, 'collection action buttons should expose their grouped aria label');
assert.match(html, /class="howto-btn"[^>]+>Buy \/ View Fun Coupons<\/a>/, 'Fun Coupon action button must render with How To Play button styling');
assert.match(html, /class="howto-btn howto-btn-secondary"[^>]+>Burn \/ Blend<\/a>/, 'NeftyBlocks blend action button must render with How To Play button styling');
assert.match(html, /class="howto-btn howto-btn-secondary"[^>]+>View AtomicHub<\/a>/, 'AtomicHub collection action button must render with How To Play button styling');
const collectionHero = sliceBetween(html, '<header class="page-hero wiki-living-hero gk-collection-hero">', '<script type="application/json" class="nft-search-terms"');
assert.doesNotMatch(collectionHero, /gk-info-card|wiki-action-button|<div class="page-title-line"/, 'collection hero should not contain nested cards, old wiki buttons, or article title chrome');
assert.doesNotMatch(collectionHero, /gk-parent-hub-card|Primary parent/, 'collection hero should not repeat the parent relationship card');
assert.match(html, /<nav class="breadcrumb" aria-label="Breadcrumb">[\s\S]*Home[\s\S]*&rarr;[\s\S]*NFTs[\s\S]*&rarr;[\s\S]*GKniftyHEADS NFT Collection/, 'breadcrumb should render clean Home -> NFTs -> collection hierarchy');
assert.doesNotMatch(html, /<span class="sep" aria-hidden="true">\?<\/span>/, 'breadcrumb separators must not render broken question marks');
assert.match(html, /<div class="article-meta gk-collection-meta-anchor" hidden><\/div>/, 'article like widget should keep a hidden hook without visible duplicate chips');
assert.doesNotMatch(visible, /NFT Collection NFTs 143 templates/, 'article meta chips should not duplicate the dashboard labels');
assert.doesNotMatch(html, /gk-universe-relationships|Crypto Moonboys Universe Path/, 'canonical universe path section should not duplicate Related Pages');
assert.doesNotMatch(html, /gk-collection-dashboard|Collection Research Panel/, 'static collection dashboard should not duplicate the live dashboard');
assert.doesNotMatch(html, /id="collection-summary"|Collection Summary|NFT templates found|Total issued template supply/, 'collection summary stat dump should not repeat NFT counts above the rarity tools');

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
assert.match(html, /data-feed-status-id="gkniftyheads_rarity" hidden aria-hidden="true"/, 'feed status hook must remain hidden so the status sentence does not duplicate the dashboard');
assert.doesNotMatch(visible, /Rarity snapshot active - live supply counted - burn baseline active|Feed status loading/, 'feed status sentence should not be visible on the collection page');
assert.doesNotMatch(html, /\[object Object\]/, 'market analytics should not render object values as text');
assert.doesNotMatch(templateAuditSection.slice(0, templateAuditSection.indexOf('Advanced raw rarity table')), /<table class="wiki-table gk-rarity-table/, 'template raw table should sit behind advanced details');
assert.doesNotMatch(globalAuditSection.slice(0, globalAuditSection.indexOf('Advanced raw global rarity table')), /<table class="wiki-table gk-asset-version-table/, 'global raw table should sit behind advanced details');

const visibleMethodMatches = visible.match(/How rarity works|Rarity Method/g) || [];
assert.equal(visibleMethodMatches.length, 1, 'visible page should contain one concise rarity-method block');
assert.doesNotMatch(visible, /Original mint numbers never change[\s\S]*Original mint numbers never change/, 'mint-number explanation should not be repeated visibly');
assert.match(html, /<th>Asset Rank<\/th><th>NFT<\/th><th>Asset Score<\/th><th>Asset ID<\/th><th>Template ID<\/th><th>Original Mint Number<\/th><th>Surviving Mint Rank<\/th><th>Live Supply<\/th>/, 'asset table should omit owner/template debug columns');

assert.match(html, /<details class="wiki-section gk-schema-summary">[\s\S]*<summary><span id="schemas" role="heading" aria-level="2">Schema Summary<\/span><\/summary>/, 'schema section should be collapsed behind a valid summary heading');
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
assert.match(rarityGenerator, /data-feed-status-id="gkniftyheads_rarity" hidden aria-hidden="true"/, 'rarity generator should preserve the hidden feed status hook on refresh');
assert.doesNotMatch(rarityGenerator, /data-feed-status-id="gkniftyheads_rarity">Rarity snapshot active/, 'rarity generator should not re-emit a visible feed status sentence');

const waxRenderer = read('js/wax-collection-renderer.js');
const battleLayer = read('js/battle-layer.js');
const battleCss = read('css/battle-layer.css');
const connectionStatusPanel = read('js/components/connection-status-panel.js');
const globalPlayerHeader = read('js/components/global-player-header.js');
assert.match(battleLayer, /function buildCollectionAboutHTML\(\)[\s\S]*GKNIFTYHEADS[\s\S]*THE ORIGINAL\. THE ICONIC\. THE 3008\.[\s\S]*living digital archive/, 'collection engagement deck should include the focused center About The Collection card');
assert.doesNotMatch(battleLayer, /gk-collection-about-stats|gk-collection-link-grid|Explore GKNIFTYHEADS|877,527|<span><strong>143<\/strong><small>Templates/, 'collection engagement deck should not repeat stats or duplicate navigation cards');
assert.match(battleLayer, /buildCollectionMediaShell\(\) \+ buildCollectionAboutHTML\(\) \+ buildMissionHTML\(pageId, engagement\)/, 'collection engagement deck should render art, about, and daily missions in order');
assert.match(battleLayer, /function movePageLikeIntoMissions\(\)[\s\S]*\.page-like-widget[\s\S]*\.battle-engagement-deck--collection \.battle-shell--missions \.battle-shell-inner[\s\S]*mission-like-row[\s\S]*role', 'group'[\s\S]*Article signal[\s\S]*insertBefore\(wrap, heat \? heat\.nextSibling : missions\.firstChild\)/, 'collection article like widget should move into Daily Missions as a labelled group without duplicating hooks');
assert.match(battleCss, /battle-engagement-deck--collection\s*\{[\s\S]*grid-template-columns:\s*minmax\(280px,\s*\.92fr\) minmax\(420px,\s*1\.34fr\) minmax\(260px,\s*\.74fr\)/, 'collection engagement deck should use the desktop three-column art/about/missions layout');
assert.match(battleCss, /@media \(max-width:\s*1180px\)[\s\S]*battle-engagement-deck--collection\s*\{[\s\S]*grid-template-columns:\s*1fr[\s\S]*battle-shell--media\s*\{[\s\S]*order:\s*1[\s\S]*gk-collection-about-card\s*\{[\s\S]*order:\s*2[\s\S]*battle-shell--missions\s*\{[\s\S]*order:\s*3/, 'collection engagement deck should stack art, about, missions on tablet/mobile');
assert.match(battleCss, /gkCollectionCardPulse[\s\S]*gkCollectionEdgeSweep[\s\S]*gkCollectionTitleFlow/, 'collection dashboard should include CSS-only glow and title animations');
assert.match(battleCss, /gk-collection-about-title\s*\{[\s\S]*font-size:\s*clamp\(3\.1rem,\s*5\.8vw,\s*5\.5rem\)[\s\S]*animation:\s*gkCollectionTitleFlow 12s linear infinite/, 'collection title should be larger and slower on desktop');
assert.match(battleCss, /battle-engagement-deck--collection \.battle-shell--missions\s*\{[\s\S]*align-self:\s*stretch;[\s\S]*display:\s*flex/, 'Daily Missions card should stretch to the art card height while staying in the narrow column');
assert.match(battleCss, /animation:\s*gkCollectionCardPulse 8\.8s ease-in-out infinite[\s\S]*animation:\s*gkCollectionEdgeSweep 10\.5s linear infinite/, 'collection card glow should be slowed down for a premium treatment');
assert.match(battleCss, /mission-like-row\s*\{[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;/, 'Daily Missions article like row should not draw a box behind the heart');
assert.match(battleCss, /mission-like-row \.like-icon\s*\{[\s\S]*animation:\s*gkMissionHeartPulse 1\.9s ease-in-out infinite/, 'Daily Missions heart should pulse subtly');
assert.match(battleCss, /mission-like-row \.like-btn\s*\{[\s\S]*min-height:\s*44px;[\s\S]*padding:\s*0 8px;/, 'Daily Missions like button should keep an accessible touch target without restoring the old box');
assert.match(battleCss, /prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none/, 'collection dashboard animations should respect reduced motion');
assert.match(sharedHeaderHtml, /id="moonboys-global-status-badge"[\s\S]*aria-live="polite"/, 'shared wiki header should include the Telegram/live sync badge slot');
assert.match(siteShell, /id="moonboys-global-status-badge"[\s\S]*aria-live="polite"/, 'runtime fallback header should include the Telegram/live sync badge slot');
assert.match(connectionStatusPanel, /var wrap = document\.getElementById\('moonboys-global-status-badge'\)[\s\S]*mountBadge\(wrap\)/, 'connection status panel should mount into an existing header badge slot');
assert.match(globalPlayerHeader, /if \(header && !badge\)[\s\S]*panel\.mountBadge\(badge\)[\s\S]*!badge\.querySelector\('\.csp-badge'\)/, 'global player header should recreate or remount the Telegram badge after shared header swaps');
assert.match(waxRenderer, /function shouldRenderFullBridgeData/, 'WAX bridge renderer should keep full bridge hydration behind a tracker-page guard');
assert.match(waxRenderer, /function shouldRenderBridgeStatus/, 'WAX bridge status card should also be behind a tracker-page guard');
assert.match(waxRenderer, /if \(!shouldRenderBridgeStatus\(collection\)\) return;/, 'static tracker pages should not append a WAX Bridge card');
assert.match(read('js/wax-collection-renderer.js'), /!hasStaticTracker\(\)/, 'static tracker pages should not append a duplicate WAX bridge tracker');
assert.match(rarityClient, /const auditCards = Array\.from\(ranking\.querySelectorAll\('\[data-rarity-audit\] \.gk-audit-card\[data-rarity-filter\]'\)\)/, 'rarity filters should include visible audit cards');
assert.match(rarityClient, /const auditGroups = Array\.from\(ranking\.querySelectorAll\('\[data-rarity-audit\] \.gk-audit-card-group'\)\)/, 'rarity filters should include audit card groups');
assert.match(rarityClient, /for \(const card of auditCards\) \{[\s\S]*card\.hidden = !matchesFilter\(card, normalized\);[\s\S]*for \(const group of auditGroups\)/, 'audit cards should hide using the same filter matcher as table rows');
assert.match(rarityClient, /group\.hidden = visibleCards\.length === 0/, 'empty audit card groups should hide after filtering');
assert.doesNotMatch(stripDetails(html), /WAX Bridge|wax-bridge-status|wax-bridge-collection-data/, 'collection/wiki page should not show infrastructure WAX Bridge cards');
assert.match(html, /gk-related-card-grid[\s\S]*Crypto Moonboys Origin[\s\S]*GKniftyHEADS Collection[\s\S]*NFT Template Pages[\s\S]*Connected Lore/, 'related pages should render as relationship cards');
assert.match(html, /Canonical connections[\s\S]*Wiki Relationship Map/, 'collection page relationship section should be titled as a map, not another related-pages dump');
assert.doesNotMatch(html, /Related NFT Templates|wiki-rabbit-card--nft-sibling|gkniftyheads-.+-\d{5,}\.html[\s\S]*is an NFT template in the gkniftyheads WAX AtomicAssets collection/, 'collection page should not render the generated related NFT template list');
assert.match(read('js/wiki.js'), /const existingRelationshipMap = document\.querySelector\('\[data-related-wiki-paths="true"\]'\);[\s\S]*renderRelatedPagesIntoRelationshipMap\(existingRelationshipMap, related, indexByUrl, MAX_DESC_LENGTH\);[\s\S]*return;/, 'runtime related pages should merge into an existing relationship map instead of rendering a separate Related Pages list');
assert.match(read('js/wiki.js'), /data-related-group="Graph Related Pages"[\s\S]*Connected Wiki Nodes[\s\S]*wiki-rabbit-grid/, 'runtime related links should render as relationship-map cards');
assert.doesNotMatch(html, /citation-vote-panel|Citation Credibility|data-cite-id="citation-panel"/, 'collection page should not render a separate citation credibility card');
assert.match(html, /<ul class="sources-list">[\s\S]*wax\.api\.atomicassets\.io[\s\S]*waxitems\.com/, 'sources list should remain the visible citation home');
assert.match(battleLayer, /document\.querySelectorAll\('\.citations-list li, \.source-ref-list li, \.sources-list li'\)/, 'sources-list items should receive inline citation vote controls');
assert.match(html, /gk-community-intelligence-panel[\s\S]*class="wiki-comments"/, 'comments should sit inside a community intelligence panel');
assert.doesNotMatch(html, /<p class="gk-command-kicker">Community intelligence<\/p>|id="gk-community-intelligence-title">Collector Notes<\/h2>/, 'comments wrapper should not render duplicate community/collector labels');
assert.doesNotMatch(read('js/comments.js'), /comments-battle-kicker">Community intelligence/, 'comments dashboard should not duplicate the community intelligence kicker');

assert.match(css, /\.gk-collection-actions/, 'collection action row should have responsive styling');
assert.match(css, /body\.page-wiki\.page-gkniftyheads-collection #content\s*\{[\s\S]*padding-top:\s*0/, 'collection page should remove the large gap below navigation');
assert.match(css, /\.nft-collection-article > \.breadcrumb\s*\{[\s\S]*position:\s*absolute;[\s\S]*background:\s*transparent;[\s\S]*border:\s*0/, 'collection breadcrumb should overlay the hero instead of creating a gap band');
assert.match(css, /body\.page-wiki\.page-gkniftyheads-collection \.wiki-content\.nft-collection-article\s*\{[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;[\s\S]*box-shadow:\s*none/, 'collection article shell should not render as an outer card around the hero');
assert.match(css, /\.gk-collection-hero\s*\{[\s\S]*grid-template-columns:\s*minmax\(280px,\s*0\.86fr\) minmax\(360px,\s*1\.14fr\)[\s\S]*min-height:\s*clamp\(560px,\s*62vh,\s*780px\)[\s\S]*border-right:\s*0;[\s\S]*border-left:\s*0;[\s\S]*border-radius:\s*0/, 'collection hero should match How To Play full-width proportions');
assert.match(css, /\.gk-collection-hero\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*min-height:\s*clamp\(560px,\s*62vh,\s*780px\)/, 'collection hero should contain glow layers before they bleed into navigation');
assert.match(css, /\.gk-collection-hero::before\s*\{[\s\S]*background-image:[\s\S]*linear-gradient\(rgba\(86,\s*220,\s*255,\s*0\.06\) 1px,\s*transparent 1px\)/, 'collection hero should use the How To Play grid overlay');
assert.match(css, /\.gk-collection-title-wrap \.howto-glitch-title\s*\{[\s\S]*font-size:\s*clamp\(3rem,\s*6\.1vw,\s*6\.05rem\)[\s\S]*text-shadow:[\s\S]*rgba\(255,\s*106,\s*213,\s*0\.6\)/, 'collection title should match How To Play typography and glow');
assert.match(css, /\.gk-collection-route\s*\{[\s\S]*border-left:\s*5px solid #00ffcc[\s\S]*line-height:\s*1\.95/, 'collection route strip should match How To Play route styling');
assert.match(css, /\.gk-showcase-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'showcase rows should render as stable three-card grids on desktop');
assert.match(css, /\.gk-top-ranked-list--cards/, 'secondary ranked lists should render as responsive cards');
assert.match(css, /\.gk-rarity-audit\s*\{[\s\S]*background:\s*rgba\(7,\s*11,\s*18,\s*0\.46\)/, 'audit tables should be visually subdued below the showcase');
assert.match(css, /\.gk-audit-card-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'audit sections should present collector cards before raw tables');
assert.match(css, /\.gk-wiki-intelligence-panel/, 'citation credibility should use the wiki intelligence card treatment');
assert.match(css, /\.gk-community-intelligence-panel/, 'comments should use the community intelligence card treatment');
assert.match(css, /\.developer-details/, 'developer-only schema details should have collapsed detail styling');

console.log('GKniftyHEADS collection page cleanup audit passed.');
