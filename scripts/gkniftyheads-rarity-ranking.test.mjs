#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const { buildRanking } = await import(`file://${path.join(root, 'scripts', 'generate-gkniftyheads-rarity.mjs').replace(/\\/g, '/')}`);

function adaptiveFixture(overrides) {
  return {
    title: `Adaptive ${overrides.template_id}`,
    template_id: overrides.template_id,
    issued_supply: overrides.issued_supply ?? 100,
    max_supply: overrides.max_supply ?? 100,
    live_supply: overrides.live_supply ?? 100,
    live_supply_status: 'counted',
    live_supply_source: 'atomicassets_assets_count',
    rarity_trait: overrides.rarity_trait ?? 'Not supplied',
    variation_trait: overrides.variation_trait ?? 'Not supplied',
    missing_or_burned_count: overrides.missing_or_burned_count ?? Math.max(0, (overrides.issued_supply ?? 100) - (overrides.live_supply ?? 100)),
    pre_baseline_missing_or_burned: overrides.missing_or_burned_count ?? Math.max(0, (overrides.issued_supply ?? 100) - (overrides.live_supply ?? 100)),
    url: `/wiki/adaptive-${overrides.template_id}.html`,
    atomicassets_url: '',
    atomichub_url: '',
  };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const rarity = readJson('data/gkniftyheads/template-rarity.json');
const integrityAudit = readJson('data/gkniftyheads/template-integrity-audit.json');
const live = readJson('data/gkniftyheads/live-asset-rarity.json');
const assetState = readJson('data/gkniftyheads/asset-state-cache.json');
const survivingMintRanks = readJson('data/gkniftyheads/surviving-mint-ranks.json');
const traits = readJson('data/gkniftyheads/trait-exposure.json');
const sync = readJson('data/gkniftyheads/sync-status.json');
const collectionHtml = read('wiki/gkniftyheads-nft-collection.html');
const clientJs = read('js/gkniftyheads-rarity.js');
const wikiCss = read('css/wiki.css');
const generatorJs = read('scripts/generate-gkniftyheads-rarity.mjs');

const adaptiveModel = buildRanking([
  adaptiveFixture({ template_id: 900001, live_supply: 100, rarity_trait: 'Alpha', variation_trait: 'Red' }),
  adaptiveFixture({ template_id: 900002, live_supply: 90, rarity_trait: 'Beta', variation_trait: 'Not supplied' }),
  adaptiveFixture({ template_id: 900003, live_supply: 80, rarity_trait: 'Not supplied', variation_trait: 'Blue' }),
  adaptiveFixture({ template_id: 900004, issued_supply: 100, live_supply: 10, rarity_trait: 'Not supplied', variation_trait: 'Not supplied' }),
  adaptiveFixture({ template_id: 900005, issued_supply: 10, max_supply: 100, live_supply: 10, rarity_trait: 'Not supplied', variation_trait: 'Not supplied', missing_or_burned_count: 0 }),
]);
const adaptiveById = new Map(adaptiveModel.ranked.map((row) => [row.template_id, row]));
assert.deepEqual(adaptiveById.get(900001).score_weights_used, { supplyScore: 50, rarityScore: 25, variationScore: 20, burnScore: 5 }, 'full meaningful metadata should use 50/25/20/5');
assert.deepEqual(adaptiveById.get(900002).score_weights_used, { supplyScore: 70, rarityScore: 25, variationScore: 0, burnScore: 5 }, 'missing variation should redistribute 20 points to supply');
assert.deepEqual(adaptiveById.get(900003).score_weights_used, { supplyScore: 75, rarityScore: 0, variationScore: 20, burnScore: 5 }, 'missing rarity should redistribute 25 points to supply');
assert.deepEqual(adaptiveById.get(900004).score_weights_used, { supplyScore: 95, rarityScore: 0, variationScore: 0, burnScore: 5 }, 'missing rarity and variation should produce 95/0/0/5');
assert.equal(adaptiveById.get(900004).rarity_trait_scoring_enabled, false, 'Not supplied is not scored as a rare rarity trait');
assert.equal(adaptiveById.get(900004).variation_trait_scoring_enabled, false, 'Not supplied is not scored as a rare variation trait');
assert.ok(adaptiveById.get(900004).burn_score_component > adaptiveById.get(900005).burn_score_component, 'thin metadata with burns should receive a higher burn component than equivalent no-burn thin metadata');
assert.ok(adaptiveById.get(900004).final_score > adaptiveById.get(900005).final_score, 'thin metadata with burns should rank higher than equivalent no-burn thin metadata');

const repeatedTraitModel = buildRanking([
  adaptiveFixture({ template_id: 901001, live_supply: 3, rarity_trait: 'Same', variation_trait: 'Same' }),
  adaptiveFixture({ template_id: 901002, live_supply: 4, rarity_trait: 'Same', variation_trait: 'Same' }),
]);
assert.ok(repeatedTraitModel.ranked.every((row) => row.rarity_trait_scoring_enabled === false), 'same rarity trait repeated across all ranked templates should disable rarity scoring');
assert.ok(repeatedTraitModel.ranked.every((row) => row.variation_trait_scoring_enabled === false), 'same variation trait repeated across all ranked templates should disable variation scoring');
assert.ok(repeatedTraitModel.ranked.every((row) => row.score_weights_used.supplyScore === 95), 'repeated trait layers should reassign trait weight to supply');

const ranked = rarity.ranked_templates;
const utility = rarity.utility_open_mint_templates;
const unissued = rarity.unissued_templates;
const allTemplates = [...ranked, ...utility, ...unissued];

function findByTemplateId(rows, templateId) {
  return rows.find((row) => row.template_id === templateId);
}

assert.equal(rarity.collection, 'gkniftyheads');
assert.equal(integrityAudit.collection, 'gkniftyheads', 'template integrity audit should be generated for GKniftyHEADS');
assert.equal(integrityAudit.total_local_templates, allTemplates.length, 'integrity audit should account for the full local template set used by the rarity table');
assert.equal(integrityAudit.total_atomicassets_confirmed_templates, allTemplates.length, 'every rarity table template must be confirmed by AtomicAssets');
assert.deepEqual(integrityAudit.missing_from_atomicassets, [], 'no local-only template should enter the committed rarity dataset');
assert.deepEqual(integrityAudit.excluded_from_rarity, [], 'the committed dataset should not include templates excluded by source-of-truth conflicts');
assert.ok(allTemplates.every((row) => integrityAudit.included_in_rarity.includes(row.template_id)), 'ranking data must only include AtomicAssets-confirmed template IDs');
for (const templateId of [776007, 776055, 776057]) {
  assert.ok(integrityAudit.included_in_rarity.includes(templateId), `template ${templateId} must be individually checked against AtomicAssets`);
  const auditRecord = [
    ...integrityAudit.duplicate_title_image_groups.flatMap((group) => group.templates),
    ...integrityAudit.local_page_conflicts,
  ].find((row) => row.template_id === templateId);
  assert.ok(
    auditRecord || allTemplates.some((row) => row.template_id === templateId),
    `template ${templateId} must not be trusted from local wiki data alone`,
  );
}
assert.equal(rarity.ranking_formula.price_used, false, 'rarity score must not use price');
assert.equal(rarity.ranking_formula.market_data_used, false, 'rarity score must not use market data');
assert.equal(rarity.ranking_formula.adaptive_weighting, true, 'GKniftyHEADS should use adaptive weighted scoring');
assert.deepEqual(rarity.ranking_formula.base_score_weights, {
  live_supply_scarcity: 50,
  rarity_trait_or_name_exposure_scarcity: 25,
  variation_trait_or_metadata_exposure_scarcity: 20,
  missing_burned_supply_bonus: 5,
}, 'GKniftyHEADS base adaptive score weights must stay documented in JSON');
assert.match(rarity.live_data_status, /atomicassets live asset count/i, 'live data status must identify AtomicAssets live asset counts when the cache is populated');
assert.equal(rarity.stats.templates_scanned, allTemplates.length, 'stats must match the generated template set');
assert.equal(typeof rarity.stats.live_assets_counted, 'number', 'live-count mode should expose real counted live assets');
assert.equal(rarity.stats.live_templates_counted, allTemplates.length, 'all template rows should have live supply cache counts');
assert.equal(rarity.stats.fallback_issued_supply_counted, 0, 'live-count mode should not count issued-supply fallback rows');
assert.equal(rarity.stats.ranked_limited_templates, 27, 'image rendering must not change ranked limited-template classification');
assert.equal(rarity.stats.utility_open_mint_templates, 97, 'image rendering must not change utility/open mint classification');
assert.equal(rarity.stats.unissued_templates, 19, 'image rendering must not change unissued classification');
assert.ok(rarity.stats.ranked_limited_templates > 20, 'ranked limited templates should not collapse to the old over-aggressive 20-template set');
assert.ok(rarity.stats.utility_open_mint_templates < 104, 'utility/open mint bucket should not contain the old over-aggressive 104-template set');
assert.ok(ranked.every((row) => row.max_supply > 0), 'every ranked limited template must have fixed max_supply > 0');
assert.equal(ranked.some((row) => row.max_supply === 0), false, 'max_supply=0 templates must not appear in ranked_templates');
assert.ok(allTemplates.every((row) => typeof row.image_url === 'string'), 'template rarity data should expose image_url for every generated row');
assert.ok(allTemplates.every((row) => Array.isArray(row.image_sources)), 'template rarity data should expose image_sources for every generated row');
assert.ok(allTemplates.every((row) => row.image_sources.length > 0 || row.image_url === ''), 'rows with image_url should carry image source candidates');
assert.ok(allTemplates.every((row) => typeof row.thumbnail_url === 'string'), 'template rarity data should expose thumbnail_url for every generated row');
assert.ok(allTemplates.every((row) => row.image_url === '' || row.thumbnail_url), 'rows with source images should have a table image source');
assert.ok(ranked.every((row) => row.price_used === false), 'ranked rows must explicitly exclude price');
assert.ok(ranked.every((row) => row.market_data_used === false), 'ranked rows must explicitly exclude market data');
assert.ok(ranked.every((row) => row.rarity_trait_scoring_enabled === true), 'current meaningful GKniftyHEADS rarity traits should remain scored');
assert.ok(ranked.every((row) => row.variation_trait_scoring_enabled === true), 'current meaningful GKniftyHEADS variation traits should remain scored');
assert.ok(ranked.every((row) => row.score_weights_used?.supplyScore === 50 && row.score_weights_used?.rarityScore === 25 && row.score_weights_used?.variationScore === 20 && row.score_weights_used?.burnScore === 5), 'meaningful GKniftyHEADS traits should preserve 50/25/20/5 weights');
assert.ok(ranked.every((row) => typeof row.supply_score_component === 'number' && typeof row.rarity_score_component === 'number' && typeof row.variation_score_component === 'number' && typeof row.burn_score_component === 'number'), 'ranked rows must expose adaptive score components');
assert.ok(ranked.every((row) => row.rarity_trait !== 'Not supplied' || row.rarity_trait_scoring_enabled === false), 'Not supplied rarity must never be scored as rare');
assert.ok(ranked.every((row) => row.variation_trait !== 'Not supplied' || row.variation_trait_scoring_enabled === false), 'Not supplied variation must never be scored as rare');
assert.ok(allTemplates.some((row) => row.thumbnail_url.startsWith('/img/gkniftyheads/thumbs/')), 'generated rows should use local thumbnail URLs where available');
assert.ok(allTemplates.every((row) => !row.thumbnail_url.startsWith('/img/gkniftyheads/thumbs/') || row.thumbnail_url.endsWith(`${row.template_id}.webp`)), 'local thumbnail URLs should use deterministic template_id paths');
assert.ok(allTemplates.every((row) => !row.thumbnail_url.startsWith('/img/gkniftyheads/thumbs/') || fs.existsSync(path.join(root, row.thumbnail_url.replace(/^\//, '')))), 'committed local thumbnail URLs must point to real files');
assert.match(generatorJs, /wax\.api\.atomicassets\.io\/atomicassets\/v1\/templates\/gkniftyheads\/\$\{row\.template_id\}/, 'generator should use the AtomicAssets template API as the primary image metadata source');
assert.match(generatorJs, /cloudflare-ipfs\.com\/ipfs/, 'generator should try the full IPFS gateway set for thumbnail retries');

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
assert.match(bitman.image_url, /^https:\/\/.+ipfs\//, 'Bitman should inherit its NFT image from the child template page');
assert.equal(bitman.thumbnail_url, '/img/gkniftyheads/thumbs/784220.webp', 'Bitman should use a deterministic local table thumbnail');
assert.ok(bitman.image_sources.some((source) => source.includes('atomichub-ipfs.com/ipfs/')), 'Bitman image sources should include AtomicAssets-derived gateway candidates');

const bitSkull = findByTemplateId(utility, 784280);
assert.ok(bitSkull, 'Bit-Skull 784280 must be excluded when current data says max_supply=0');
assert.equal(bitSkull.max_supply, 0, 'Bit-Skull 784280 fixture should preserve uncapped max_supply=0');
assert.equal(findByTemplateId(ranked, 784280), undefined, 'Bit-Skull 784280 may only be ranked when it has fixed max_supply > 0');

const uncappedTemplate = findByTemplateId(utility, 776099);
assert.ok(uncappedTemplate, 'Uncapped template 776099 must be classified as utility/open mint');
assert.equal(uncappedTemplate.max_supply, 0, 'template 776099 fixture should preserve max_supply=0');
assert.equal(findByTemplateId(ranked, 776099), undefined, 'template 776099 must not be ranked when max_supply=0');

assert.equal(findByTemplateId(utility, 784220), undefined, 'P2E/Play2Earn wording alone must not classify fixed-supply Bitman 784220 as utility');

assert.equal(ranked.some((row) => row.issued_supply <= 0), false, 'unissued templates must not be ranked');
assert.ok(unissued.length > 0, 'unissued templates should be tracked separately');
assert.ok(unissued.every((row) => row.issued_supply === 0), 'unissued bucket should only contain zero issued supply templates');

const oneOfOneCount = ranked.filter((row) => row.live_supply === 1).length;
assert.ok(oneOfOneCount > 0, 'ranked data should include 1/1 templates');
assert.ok(ranked.slice(0, oneOfOneCount).every((row) => row.live_supply === 1), '1/1 templates should lead the ranked table unless excluded as utility/open mint');
assert.ok(ranked.filter((row) => row.live_supply === 1).every((row) => row.band === 'Legendary'), '1/1 ranked templates should be labelled Legendary');
const nonLegendaryRanked = ranked.filter((row) => row.live_supply !== 1);
if (nonLegendaryRanked.length > 0) {
  assert.ok(nonLegendaryRanked.some((row) => row.band === 'Ultra Rare'), 'non-1/1 ranked templates should include at least one Ultra Rare row');
  assert.ok(ranked.some((row) => row.band === 'Ultra Rare' && row.live_supply !== 1), 'Legendary rows must not consume Ultra Rare percentile slots');
  assert.match(collectionHtml, /data-rarity-filter="ranked ultra-rare"/, 'Ultra Rare filter must have generated rows when non-1/1 ranked templates exist');
}

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

assert.match(live.status, /atomicassets live asset count/i, 'live asset rarity status should identify counted mode');
assert.match(live.note, /pre_baseline_missing_or_burned|first-scan delta/i, 'live asset data contract should identify first-scan missing/burned semantics');
assert.equal(live.template_counts.length, allTemplates.length, 'live asset rarity should include per-template count summaries when counted');
assert.ok(fs.existsSync(path.join(root, 'data/gkniftyheads/asset-state-cache.json')), 'asset snapshots require the real asset-state cache file');
assert.match(assetState.source_urls.latest_created_assets, /atomicassets\/v1\/assets\?collection_name=gkniftyheads&sort=created&order=desc&limit=1000/, 'asset-state cache must declare latest-created source');
assert.match(assetState.source_urls.recently_updated_live_assets, /atomicassets\/v1\/assets\?collection_name=gkniftyheads&burned=false&sort=updated&order=desc&limit=1000/, 'asset-state cache must declare updated-live source');
assert.match(assetState.source_urls.recently_updated_burned_assets, /atomicassets\/v1\/assets\?collection_name=gkniftyheads&burned=true&sort=updated&order=desc&limit=1000/, 'asset-state cache must declare updated-burned source');
assert.match(assetState.source_urls.template_assets_backfill, /template_id=\{template_id\}.*sort=template_mint/, 'asset-state cache must declare rotating template backfill source');
if (live.assets.length > 0) {
  assert.ok(assetState.assets.length > 0, 'live asset snapshots are allowed only when backed by real asset-state cache assets');
  assert.equal(live.assets.length, assetState.assets.length, 'live asset rarity snapshots should mirror the real asset-state cache asset count');
  assert.ok(survivingMintRanks.templates.length > 0, 'populated asset snapshots should produce surviving mint rank groups');
  assert.ok(live.assets.every((asset) => asset.original_mint_number !== undefined), 'asset snapshots must expose permanent original_mint_number');
  assert.ok(live.assets.filter((asset) => asset.burned).every((asset) => asset.surviving_mint_rank === null || asset.surviving_mint_rank === undefined), 'burned assets must not receive current surviving_mint_rank');
}
assert.ok(allTemplates.every((row) => Object.hasOwn(row, 'asset_state_status')), 'template rarity rows must expose asset_state_status');
assert.ok(allTemplates.every((row) => row.live_supply_source === 'atomicassets_assets_count'), 'rarity maths must keep using AtomicAssets _count live supply');
assert.ok(allTemplates.every((row) => row.live_supply_status === 'counted'), 'rarity rows should remain backed by counted live supply');
for (const row of allTemplates.filter((entry) => entry.asset_state_status === 'asset_state_mismatch')) {
  assert.match(row.asset_state_mismatch || '', /asset-state live supply .* differs from _count live supply/, 'asset-state mismatches must be recorded explicitly');
  assert.notEqual(row.live_supply_from_asset_state, row.live_supply, 'mismatch rows should keep asset-state supply separate from _count live supply');
}
for (const error of assetState.errors || []) {
  assert.ok(error.source_key || error.source, 'asset-state errors must surface the source key');
  assert.ok(error.source_url, 'asset-state errors must surface the source URL');
}
assert.equal(sync.wax_get_info.used_for, 'future scan checkpoint metadata only');
assert.match(sync.burn_tracking_status, /baseline pending/i, 'first burn scan must be a baseline, not fake history');

assert.match(collectionHtml, /GKniftyHEADS Template Rarity Ranking/);
assert.match(collectionHtml, /separate AtomicAssets template IDs may share the same artwork\/name/, 'page copy should make clear this ranks templates, not unique artwork');
assert.match(collectionHtml, /Original mint numbers never change/, 'page must explain that original mint numbers are permanent');
assert.match(collectionHtml, /surviving mint rank/, 'page must explain surviving mint rank separately from original mint numbers');
assert.match(collectionHtml, /pre-baseline missing\/burned, a current supply delta/, 'missing/burned wording must identify the first scan as a current supply delta');
assert.doesNotMatch(
  collectionHtml,
  /mint numbers?\s+(?:move up|change|renumber|renumbered)|higher mints?\s+(?:move up|become lower|become mint)/i,
  'page must not imply burns change original mint numbers'
);
assert.match(live.note, /original_mint_number is permanent/, 'live data note must use original_mint_number terminology');
assert.match(live.note, /surviving_mint_rank may be tracked separately/, 'live data note must use surviving_mint_rank terminology');
assert.match(collectionHtml, /Live rarity data unavailable\. Showing raw template list only\. This is not the final rarity ranking\./);
assert.match(collectionHtml, /<section class="wiki-section gk-rarity-raw-fallback" data-rarity-fallback hidden>/);
assert.match(collectionHtml, /GKNIFTYHEADS_RAW_TEMPLATE_TABLE:BEGIN/);
assert.match(collectionHtml, /<th>Live Supply<\/th>/, 'live-count mode table should label counted supply as Live Supply');
assert.match(collectionHtml, /<th>Rarity Exposure<\/th>/, 'live-count mode table should label rarity exposure without fallback wording');
assert.match(collectionHtml, /<th>Variation Exposure<\/th>/, 'live-count mode table should label variation exposure without fallback wording');
assert.doesNotMatch(collectionHtml, /<th>Issued Supply Fallback<\/th>|Rarity Exposure \(Fallback\)|Variation Exposure \(Fallback\)/, 'live-count mode must not use fallback table labels');
assert.match(collectionHtml, /Fallback issued supply counted/, 'fallback stat should be separated from live asset counts');
assert.match(collectionHtml, /<strong>124463<\/strong><span>Live assets counted<\/span>/, 'live asset count should show the counted AtomicAssets total');
assert.ok(collectionHtml.indexOf('GKniftyHEADS Template Rarity Ranking') < collectionHtml.indexOf('All NFTs / Templates'), 'raw template table should only appear after the ranking fallback wrapper');
assert.match(collectionHtml, /<section class="wiki-section gk-rarity-utility">[\s\S]*<tr data-rarity-filter="utility-open-mint">/, 'utility side table must render populated rows');
assert.match(collectionHtml, /<section class="wiki-section gk-rarity-unissued">[\s\S]*<tr data-rarity-filter="unissued">/, 'unissued side table must render populated rows');
const rankedTableHead = collectionHtml.match(/<table class="wiki-table gk-rarity-table">[\s\S]*?<thead>([\s\S]*?)<\/thead>/)?.[1] || '';
assert.doesNotMatch(rankedTableHead, /<th>Rank<\/th>/, 'ranked table should not have a separate Rank column');
assert.doesNotMatch(rankedTableHead, /<th>Band<\/th>/, 'ranked table should not have a separate Band column');
assert.match(rankedTableHead, /<tr>\s*<th>NFT<\/th>/, 'ranked table should start with the NFT column');
assert.match(collectionHtml, /<div class="gk-rarity-nft-meta">[\s\S]*?<span class="gk-rarity-rank">Rank #1<\/span>[\s\S]*?<span class="rarity-band rarity-band--legendary">Legendary<\/span>/, 'rank and rarity band should render inside the NFT card');
assert.match(collectionHtml, /<tr data-rarity-filter="ranked[\s\S]*?<img class="gk-rarity-nft-image"[^>]+loading="lazy"[^>]+decoding="async"[^>]+referrerpolicy="no-referrer"/, 'ranked rows must render lazy NFT images');
assert.match(collectionHtml, /<section class="wiki-section gk-rarity-utility">[\s\S]*?<img class="gk-rarity-nft-image"/, 'utility/open mint rows must render NFT images');
assert.match(collectionHtml, /<section class="wiki-section gk-rarity-unissued">[\s\S]*?<img class="gk-rarity-nft-image"/, 'unissued rows must render NFT images');
assert.match(collectionHtml, /<img class="gk-rarity-nft-image" src="\/img\/gkniftyheads\/thumbs\/784220\.webp"/, 'table images should prefer local generated thumbnails when available');
assert.doesNotMatch(collectionHtml, /<img class="gk-rarity-nft-image" src="https:\/\/[^"]+ipfs\/bafybeiewutfd74l4ix7cn6nyijriq5nfkojihk7uqucnzhmhup52jhssgy"/, 'table images should not load the full Bitman IPFS original when a thumbnail exists');
assert.match(collectionHtml, /alt="[^"]*Bitman[^"]*"/, 'NFT row image alt text should use the NFT title');
assert.match(generatorJs, /gk-rarity-nft-image-placeholder[\s\S]*Image unavailable/, 'renderer should include a clean image placeholder fallback when an image is missing');
assert.match(wikiCss, /\.gk-rarity-nft-image\s*\{[\s\S]*width:\s*265px;[\s\S]*max-width:\s*100%;[\s\S]*height:\s*auto;[\s\S]*object-fit:\s*contain;/, 'NFT row images must be sized to 265px without cropping or stretching');
assert.match(wikiCss, /\.gk-rarity-nft-cell\s*\{[\s\S]*min-width:\s*300px;/, 'NFT column should be wide enough for the image card');
assert.match(wikiCss, /\.gk-rarity-table\s*\{[\s\S]*min-width:\s*860px;/, 'rank/band column removal should reduce the ranked table width');
assert.match(collectionHtml, /src="\/js\/gkniftyheads-rarity\.js"/, 'collection page must load rarity fallback/filter client');
assert.match(clientJs, /fetch\('\/data\/gkniftyheads\/template-rarity\.json'/, 'client should verify generated rarity JSON is available');
assert.match(clientJs, /data-rarity-fallback/, 'client should reveal raw fallback on JSON failure');
assert.match(clientJs, /gk-rarity-table tbody \[data-rarity-filter\]/, 'client filtering must be scoped to the main leaderboard rows');
assert.doesNotMatch(clientJs, /querySelectorAll\('\[data-rarity-filter\]'\)/, 'client must not collect side-table rows for the default all-ranked filter');
assert.match(clientJs, /focusingUtility/, 'client should focus the utility side section when that filter is clicked');
assert.match(clientJs, /focusingUnissued/, 'client should focus the unissued side section when that filter is clicked');

assert.ok(ranked.every((row) => row.url.startsWith('/wiki/gkniftyheads-') && row.url.endsWith('.html')), 'ranked rows should link to local template pages');
assert.ok(allTemplates.every((row) => row.atomicassets_url.includes('wax.api.atomicassets.io/atomicassets/v1/templates/gkniftyheads/')), 'AtomicAssets template links must be preserved');
assert.ok(allTemplates.every((row) => row.atomichub_url.includes('wax.atomichub.io/market?collection_name=gkniftyheads&template_id=')), 'AtomicHub market links must be preserved');
assert.equal(/\.html\.html/.test(collectionHtml), false, 'collection page must not contain .html.html links');

const forbiddenPriceSignals = /\b(floor price|market price|sale price|wax price|usd price|last sale)\b/i;
assert.equal(forbiddenPriceSignals.test(collectionHtml), false, 'collection page must not expose price ranking signals');
assert.equal(forbiddenPriceSignals.test(JSON.stringify(rarity)), false, 'rarity data must not expose price ranking signals');

console.log('GKniftyHEADS rarity ranking audit passed.');
