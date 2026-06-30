#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const rarity = readJson('data/gkniftyheads/template-rarity.json');
const live = readJson('data/gkniftyheads/live-asset-rarity.json');
const traits = readJson('data/gkniftyheads/trait-exposure.json');
const sync = readJson('data/gkniftyheads/sync-status.json');
const collectionHtml = read('wiki/gkniftyheads-nft-collection.html');
const clientJs = read('js/gkniftyheads-rarity.js');

const ranked = rarity.ranked_templates;
const utility = rarity.utility_open_mint_templates;
const unissued = rarity.unissued_templates;
const allTemplates = [...ranked, ...utility, ...unissued];

function findByTemplateId(rows, templateId) {
  return rows.find((row) => row.template_id === templateId);
}

assert.equal(rarity.collection, 'gkniftyheads');
assert.equal(rarity.ranking_formula.price_used, false, 'rarity score must not use price');
assert.match(rarity.live_data_status, /fallback/i, 'live data status must be explicit fallback while live scan is unavailable');
assert.equal(rarity.stats.templates_scanned, allTemplates.length, 'stats must match the generated template set');
assert.equal(rarity.stats.live_assets_counted, null, 'fallback mode must not present issued supply as real live asset count');
assert.equal(typeof rarity.stats.fallback_issued_supply_counted, 'number', 'fallback mode should expose fallback issued supply separately');
assert.ok(rarity.stats.ranked_limited_templates > 20, 'ranked limited templates should not collapse to the old over-aggressive 20-template set');
assert.ok(rarity.stats.utility_open_mint_templates < 104, 'utility/open mint bucket should not contain the old over-aggressive 104-template set');

const funCoupon = findByTemplateId(utility, 782888);
assert.ok(funCoupon, 'FUN COUPON template 782888 must be classified as utility/open mint');
assert.equal(ranked.some((row) => row.template_id === 782888), false, 'FUN COUPON must not be ranked as scarce');
assert.equal(funCoupon.max_supply, 0, 'FUN COUPON fixture should preserve max_supply=0');
assert.equal(funCoupon.issued_supply, 123450, 'FUN COUPON fixture should preserve mass issued supply');

const bitman = findByTemplateId(ranked, 784220);
assert.ok(bitman, 'Bitman 784220 must be ranked despite Play2Earn/P2E lore wording');
assert.equal(findByTemplateId(utility, 784220), undefined, 'Bitman 784220 must not be classified as utility/open mint');
assert.equal(bitman.issued_supply, 1, 'Bitman fixture should preserve 1/1 issued supply');
assert.equal(bitman.max_supply, 1, 'Bitman fixture should preserve fixed max supply');

const bitSkull = findByTemplateId(ranked, 784280);
assert.ok(bitSkull, 'Bit-Skull 784280 must be ranked despite #P2E/HODLWARS game wording');
assert.equal(findByTemplateId(utility, 784280), undefined, 'Bit-Skull 784280 must not be classified as utility/open mint');

const rankedFourMint = [783375, 783377, 783411, 783412].filter((templateId) => findByTemplateId(ranked, templateId));
assert.ok(rankedFourMint.length >= 1, 'at least one known 4-mint HODLWARS/P2E template must stay ranked');
assert.equal(findByTemplateId(utility, 783375), undefined, 'P2E/#HODLWARS wording alone must not classify template 783375 as utility');

assert.equal(ranked.some((row) => row.issued_supply <= 0), false, 'unissued templates must not be ranked');
assert.ok(unissued.length > 0, 'unissued templates should be tracked separately');
assert.ok(unissued.every((row) => row.issued_supply === 0), 'unissued bucket should only contain zero issued supply templates');

const oneOfOneCount = ranked.filter((row) => row.live_supply === 1).length;
assert.ok(oneOfOneCount > 0, 'ranked data should include 1/1 templates');
assert.ok(ranked.slice(0, oneOfOneCount).every((row) => row.live_supply === 1), '1/1 templates should lead the ranked table unless excluded as utility/open mint');
assert.ok(ranked.filter((row) => row.live_supply === 1).every((row) => row.band === 'Legendary'), '1/1 ranked templates should be labelled Legendary');

for (const trait of traits.rarity_traits) {
  const expected = ranked
    .filter((row) => row.rarity_trait === trait.trait)
    .reduce((sum, row) => sum + row.live_supply, 0);
  assert.equal(trait.exposure_supply, expected, `rarity exposure for ${trait.trait} must be supply exposure`);
}

for (const trait of traits.variation_traits) {
  const expected = ranked
    .filter((row) => row.variation_trait === trait.trait)
    .reduce((sum, row) => sum + row.live_supply, 0);
  assert.equal(trait.exposure_supply, expected, `variation exposure for ${trait.trait} must be supply exposure`);
}

assert.equal(live.assets.length, 0, 'live asset rarity should not fake asset snapshots');
assert.match(live.status, /fallback/i, 'live asset rarity status should identify fallback mode');
assert.match(live.note, /original_mint|surviving_mint_rank/i, 'live asset data contract should reserve mint rank fields');
assert.equal(sync.wax_get_info.used_for, 'future scan checkpoint metadata only');
assert.match(sync.burn_tracking_status, /baseline pending/i, 'first burn scan must be a baseline, not fake history');

assert.match(collectionHtml, /GKniftyHEADS Collection Rarity Ranking/);
assert.match(collectionHtml, /Live rarity data unavailable\. Showing raw template list only\. This is not the final rarity ranking\./);
assert.match(collectionHtml, /<section class="wiki-section gk-rarity-raw-fallback" data-rarity-fallback hidden>/);
assert.match(collectionHtml, /GKNIFTYHEADS_RAW_TEMPLATE_TABLE:BEGIN/);
assert.match(collectionHtml, /Issued Supply Fallback/, 'fallback mode table should not label fallback supply as live supply');
assert.match(collectionHtml, /Rarity Exposure \(Fallback\)/, 'fallback mode table should label rarity exposure honestly');
assert.match(collectionHtml, /Variation Exposure \(Fallback\)/, 'fallback mode table should label variation exposure honestly');
assert.doesNotMatch(collectionHtml, /<th>Live Supply<\/th>|Rarity Live Exposure|Variation Live Exposure/, 'fallback table must not use live-scan labels');
assert.match(collectionHtml, /Fallback issued supply counted/, 'fallback stat should be separated from live asset counts');
assert.match(collectionHtml, /<strong>Not scanned<\/strong><span>Live assets counted<\/span>/, 'live asset count should be shown as not scanned in fallback mode');
assert.ok(collectionHtml.indexOf('GKniftyHEADS Collection Rarity Ranking') < collectionHtml.indexOf('All NFTs / Templates'), 'raw template table should only appear after the ranking fallback wrapper');
assert.match(collectionHtml, /src="\/js\/gkniftyheads-rarity\.js"/, 'collection page must load rarity fallback/filter client');
assert.match(clientJs, /fetch\('\/data\/gkniftyheads\/template-rarity\.json'/, 'client should verify generated rarity JSON is available');
assert.match(clientJs, /data-rarity-fallback/, 'client should reveal raw fallback on JSON failure');

assert.ok(ranked.every((row) => row.url.startsWith('/wiki/gkniftyheads-') && row.url.endsWith('.html')), 'ranked rows should link to local template pages');
assert.ok(allTemplates.every((row) => row.atomicassets_url.includes('wax.api.atomicassets.io/atomicassets/v1/templates/gkniftyheads/')), 'AtomicAssets template links must be preserved');
assert.ok(allTemplates.every((row) => row.atomichub_url.includes('wax.atomichub.io/market?collection_name=gkniftyheads&template_id=')), 'AtomicHub market links must be preserved');
assert.equal(/\.html\.html/.test(collectionHtml), false, 'collection page must not contain .html.html links');

const forbiddenPriceSignals = /\b(floor price|market price|sale price|wax price|usd price|last sale)\b/i;
assert.equal(forbiddenPriceSignals.test(collectionHtml), false, 'collection page must not expose price ranking signals');
assert.equal(forbiddenPriceSignals.test(JSON.stringify(rarity)), false, 'rarity data must not expose price ranking signals');

console.log('GKniftyHEADS rarity ranking audit passed.');
