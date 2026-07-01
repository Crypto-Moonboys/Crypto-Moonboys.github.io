#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseAtomicAssetsCount,
  runGenerateGkniftyheadsRarity,
} from './generate-gkniftyheads-rarity.mjs';
import { updateGkniftyheadsLiveSupplyCache } from './update-gkniftyheads-live-supply-cache.mjs';
import { updateGkniftyheadsTemplateMetadataCache } from './update-gkniftyheads-template-metadata-cache.mjs';
import { updateGkniftyheadsAssetStateCache } from './update-gkniftyheads-asset-state-cache.mjs';

assert.equal(parseAtomicAssetsCount({ data: '1' }), 1, 'AtomicAssets count parser must handle data as a string number');
assert.equal(parseAtomicAssetsCount({ data: 1 }), 1, 'AtomicAssets count parser must handle data as a number');
assert.equal(parseAtomicAssetsCount({ count: '2' }), 2, 'AtomicAssets count parser must handle count as a string');
assert.equal(parseAtomicAssetsCount({ data: { count: 3 } }), 3, 'AtomicAssets count parser must handle data.count');

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-rarity-staged-'));
  fs.mkdirSync(path.join(root, 'wiki'), { recursive: true });
  const collectionHtml = `<!doctype html><html><body>
        <!-- GKNIFTYHEADS_RAW_TEMPLATE_TABLE:BEGIN -->
        <section class="wiki-section">
          <h2 id="all-nfts">All NFTs / Templates</h2>
          <table class="wiki-table nft-template-table">
            <tr><td><a href="/wiki/gkniftyheads-fixture-900001.html">Fixture Live Count</a></td><td>900001</td><td>gkniftyheads</td><td>10</td><td>10</td><td><a href="https://wax.api.atomicassets.io/atomicassets/v1/templates/gkniftyheads/900001">AtomicAssets</a></td><td><a href="https://wax.atomichub.io/market?collection_name=gkniftyheads&template_id=900001">AtomicHub</a></td></tr>
            <tr><td><a href="/wiki/gkniftyheads-control-900002.html">Control Template</a></td><td>900002</td><td>gkniftyheads</td><td>20</td><td>20</td><td><a href="https://wax.api.atomicassets.io/atomicassets/v1/templates/gkniftyheads/900002">AtomicAssets</a></td><td><a href="https://wax.atomichub.io/market?collection_name=gkniftyheads&template_id=900002">AtomicHub</a></td></tr>
            <tr><td><a href="/wiki/gkniftyheads-uncapped-900003.html">Uncapped Template</a></td><td>900003</td><td>gkniftyheads</td><td>1</td><td>0</td><td><a href="https://wax.api.atomicassets.io/atomicassets/v1/templates/gkniftyheads/900003">AtomicAssets</a></td><td><a href="https://wax.atomichub.io/market?collection_name=gkniftyheads&template_id=900003">AtomicHub</a></td></tr>
            <tr><td><a href="/wiki/gkniftyheads-local-only-900004.html">Local Only Stale Template</a></td><td>900004</td><td>gkniftyheads</td><td>5</td><td>5</td><td><a href="https://wax.api.atomicassets.io/atomicassets/v1/templates/gkniftyheads/900004">AtomicAssets</a></td><td><a href="https://wax.atomichub.io/market?collection_name=gkniftyheads&template_id=900004">AtomicHub</a></td></tr>
          </table>
        </section>
        <!-- GKNIFTYHEADS_RAW_TEMPLATE_TABLE:END -->
        <script data-cfasync="false" src="/js/battle-layer.js"></script>
  </body></html>`;
  fs.writeFileSync(path.join(root, 'wiki', 'gkniftyheads-nft-collection.html'), collectionHtml, 'utf8');
  for (const [file, rarity, variation] of [
    ['gkniftyheads-fixture-900001.html', 'Fixture Rare', 'Fixture Variation'],
    ['gkniftyheads-control-900002.html', 'Common Fixture', 'Common Variation'],
    ['gkniftyheads-uncapped-900003.html', 'Uncapped', 'Uncapped'],
    ['gkniftyheads-local-only-900004.html', 'Local Only', 'Local Only'],
  ]) {
    fs.writeFileSync(path.join(root, 'wiki', file), `<table><tr><th>rarity</th><td>${rarity}</td></tr><tr><th>variation</th><td>${variation}</td></tr><tr><th>DESCRIPTION</th><td>#HODLWARS P2E lore only</td></tr></table>`, 'utf8');
  }
  fs.mkdirSync(path.join(root, 'data', 'gkniftyheads'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'gkniftyheads', 'template-metadata-cache.json'), JSON.stringify({
    collection: 'gkniftyheads',
    templates: [
      {
        template_id: 900001,
        exists_on_atomicassets: true,
        metadata_status: 'ok',
        title: 'Shared Fixture',
        immutable_data_name: 'Shared Fixture',
        issued_supply: 10,
        max_supply: 10,
        schema_name: 'gkniftyheads',
        image_url: 'https://ipfs.hivebp.io/ipfs/bafysharedfixture',
        image_sources: ['https://ipfs.hivebp.io/ipfs/bafysharedfixture'],
        immutable_data_image_fields: { img: 'bafysharedfixture' },
        last_checked_at: new Date().toISOString(),
      },
      {
        template_id: 900002,
        exists_on_atomicassets: true,
        metadata_status: 'ok',
        title: 'Shared Fixture',
        immutable_data_name: 'Shared Fixture',
        issued_supply: 20,
        max_supply: 20,
        schema_name: 'gkniftyheads',
        image_url: 'https://ipfs.hivebp.io/ipfs/bafysharedfixture',
        image_sources: ['https://ipfs.hivebp.io/ipfs/bafysharedfixture'],
        immutable_data_image_fields: { img: 'bafysharedfixture' },
        last_checked_at: new Date().toISOString(),
      },
      {
        template_id: 900003,
        exists_on_atomicassets: true,
        metadata_status: 'ok',
        title: 'Uncapped Template',
        immutable_data_name: 'Uncapped Template',
        issued_supply: 1,
        max_supply: 0,
        schema_name: 'gkniftyheads',
        image_url: 'https://ipfs.hivebp.io/ipfs/bafyunccappedfixture',
        image_sources: ['https://ipfs.hivebp.io/ipfs/bafyunccappedfixture'],
        immutable_data_image_fields: { img: 'bafyunccappedfixture' },
        last_checked_at: new Date().toISOString(),
      },
      {
        template_id: 900004,
        exists_on_atomicassets: false,
        metadata_status: 'error',
        error: 'template not found on AtomicAssets',
      },
    ],
  }, null, 2), 'utf8');
  return root;
}

function atomicTemplate(row, overrides = {}) {
  return {
    template_id: String(row.template_id),
    issued_supply: String(overrides.issued_supply ?? row.issued_supply),
    max_supply: String(overrides.max_supply ?? row.max_supply),
    schema_name: overrides.schema_name || row.schema || 'gkniftyheads',
    immutable_data: {
      name: overrides.name || row.title,
      img: overrides.img || `bafy${row.template_id}`,
    },
  };
}

const batchRoot = makeRoot();
const batchRows = [
  { template_id: 900001, title: 'Fixture Live Count', issued_supply: 10, max_supply: 10, schema: 'gkniftyheads', atomicassets_url: 'https://wax.api.atomicassets.io/atomicassets/v1/templates/gkniftyheads/900001', atomichub_url: '', url: '/wiki/gkniftyheads-fixture-900001.html' },
  { template_id: 900002, title: 'Control Template', issued_supply: 20, max_supply: 20, schema: 'gkniftyheads', atomicassets_url: 'https://wax.api.atomicassets.io/atomicassets/v1/templates/gkniftyheads/900002', atomichub_url: '', url: '/wiki/gkniftyheads-control-900002.html' },
];
let batchCalls = 0;
let singleCalls = 0;
await updateGkniftyheadsTemplateMetadataCache(batchRoot, {
  forceRefresh: true,
  rows: batchRows,
  batchSize: 100,
  fetchTemplatesBatch: async (rows, url) => {
    batchCalls += 1;
    assert.match(url, /\/atomicassets\/v1\/templates\?collection_name=gkniftyheads&ids=900001,900002&limit=1000/, 'metadata updater must attempt ids= batch fetch before single-template fallback');
    return { data: rows.map((row) => atomicTemplate(row)) };
  },
  fetchTemplate: async () => {
    singleCalls += 1;
    throw new Error('single-template fallback should not run after complete batch success');
  },
});
let batchCache = JSON.parse(fs.readFileSync(path.join(batchRoot, 'data', 'gkniftyheads', 'template-metadata-cache.json'), 'utf8'));
assert.equal(batchCalls, 1, 'batched template fetch should run once for the fixture batch');
assert.equal(singleCalls, 0, 'single-template fetch should not run when ids= batch succeeds');
assert.equal(batchCache.templates.find((row) => row.template_id === 900001).metadata_fetch_mode, 'batch_ids', 'successful batch rows should record batch_ids fetch mode');

const fallbackBatchRoot = makeRoot();
const callOrder = [];
await updateGkniftyheadsTemplateMetadataCache(fallbackBatchRoot, {
  forceRefresh: true,
  rows: batchRows,
  batchSize: 100,
  concurrency: 1,
  fetchTemplatesBatch: async () => {
    callOrder.push('batch');
    throw new Error('ids batching unsupported fixture');
  },
  fetchTemplate: async (row) => {
    callOrder.push(`single:${row.template_id}`);
    return { data: atomicTemplate(row) };
  },
});
batchCache = JSON.parse(fs.readFileSync(path.join(fallbackBatchRoot, 'data', 'gkniftyheads', 'template-metadata-cache.json'), 'utf8'));
assert.deepEqual(callOrder, ['batch', 'single:900001', 'single:900002'], 'single-template fallback should run after batched fetch fails');
assert.equal(batchCache.templates.find((row) => row.template_id === 900001).metadata_fetch_mode, 'single_template_fallback', 'fallback rows should record single_template_fallback fetch mode');

const cacheReuseRoot = makeRoot();
let unexpectedFetch = false;
const cacheReuseResult = await updateGkniftyheadsTemplateMetadataCache(cacheReuseRoot, {
  rows: [batchRows[0]],
  fetchTemplatesBatch: async () => {
    unexpectedFetch = true;
    throw new Error('fresh confirmed cache should not be batch-refetched');
  },
  fetchTemplate: async () => {
    unexpectedFetch = true;
    throw new Error('fresh confirmed cache should not be single-refetched');
  },
});
assert.equal(unexpectedFetch, false, 'fresh confirmed template metadata should be reused without AtomicAssets calls');
assert.equal(cacheReuseResult.skipped_fresh, 1, 'metadata updater should report fresh confirmed cache reuse');

const root = makeRoot();
let sawPartialWrite = false;
await updateGkniftyheadsLiveSupplyCache(root, {
  concurrency: 1,
  rows: [
    { template_id: 900001, issued_supply: 10 },
    { template_id: 900002, issued_supply: 20 },
  ],
  countTemplate: async (row) => {
    if (row.template_id === 900001) return 8;
    const cache = JSON.parse(fs.readFileSync(path.join(root, 'data', 'gkniftyheads', 'live-template-supply.json'), 'utf8'));
    sawPartialWrite = cache.supplies.some((entry) => entry.template_id === 900001 && entry.live_supply_status === 'ok');
    return 20;
  },
});
assert.equal(sawPartialWrite, true, 'live supply cache should write partial progress before all templates finish');

function asset(assetId, templateId, mint, burned = false, owner = 'owner.gm') {
  return {
    asset_id: String(assetId),
    template: { template_id: String(templateId) },
    template_mint: String(mint),
    burned: burned ? 'true' : 'false',
    owner,
    updated_at_time: '1782920000000',
    created_at_time: '1782910000000',
    transferred_at_time: '1782925000000',
  };
}

await updateGkniftyheadsAssetStateCache(root, {
  rows: [
    { template_id: 900001, issued_supply: 10 },
    { template_id: 900002, issued_supply: 20 },
  ],
  fetchJson: async (url, { sourceKey }) => {
    assert.match(url, /page=1/, 'asset-state fetches should use paginated AtomicAssets asset URLs');
    if (sourceKey === 'latest_created_assets') return { data: [asset('a9', 900001, 9)] };
    if (sourceKey === 'recently_updated_live_assets') return { data: [
      asset('a1', 900001, 1),
      asset('a2', 900001, 2),
      asset('a4', 900001, 4, false, 'fresh.owner'),
      asset('a5', 900001, 5),
      asset('a6', 900001, 6),
      asset('a7', 900001, 7),
      asset('a8', 900001, 8),
    ] };
    if (sourceKey === 'recently_updated_burned_assets') return { data: [asset('a3', 900001, 3, true, '')] };
    return { data: [] };
  },
});
let assetCache = JSON.parse(fs.readFileSync(path.join(root, 'data', 'gkniftyheads', 'asset-state-cache.json'), 'utf8'));
let mintRanks = JSON.parse(fs.readFileSync(path.join(root, 'data', 'gkniftyheads', 'surviving-mint-ranks.json'), 'utf8'));
assert.equal(assetCache.assets.some((row) => row.asset_id === 'a9'), true, 'new asset from latest_created_assets should be added to cache');
assert.equal(assetCache.assets.find((row) => row.asset_id === 'a3').burned, true, 'burned asset delta should update burned=true');
assert.equal(assetCache.assets.find((row) => row.asset_id === 'a4').owner, 'fresh.owner', 'live asset delta should update owner/current metadata');
const rankedA4 = mintRanks.templates.find((row) => row.template_id === 900001).assets.find((row) => row.asset_id === 'a4');
assert.equal(rankedA4.original_mint_number, 4, 'original mint numbers never mutate after lower mints burn');
assert.equal(rankedA4.surviving_mint_rank, 3, 'mint #4 should become surviving_mint_rank 3 when mint #3 is burned');
assert.equal(mintRanks.templates.find((row) => row.template_id === 900001).assets.find((row) => row.asset_id === 'a3').surviving_mint_rank, undefined, 'burned assets must not receive current surviving_mint_rank');

await updateGkniftyheadsAssetStateCache(root, {
  rows: [{ template_id: 900001, issued_supply: 10 }],
  fetchJson: async () => {
    throw new Error('fixture AtomicAssets outage');
  },
});
assetCache = JSON.parse(fs.readFileSync(path.join(root, 'data', 'gkniftyheads', 'asset-state-cache.json'), 'utf8'));
assert.equal(assetCache.assets.some((row) => row.asset_id === 'a9'), true, 'failed AtomicAssets delta scan should preserve previous good cache assets');
assert.equal(assetCache.errors.some((row) => /fixture AtomicAssets outage/.test(row.error)), true, 'failed delta scan should record the source error');

await runGenerateGkniftyheadsRarity(root);
const liveHtml = fs.readFileSync(path.join(root, 'wiki', 'gkniftyheads-nft-collection.html'), 'utf8');
const liveJson = JSON.parse(fs.readFileSync(path.join(root, 'data', 'gkniftyheads', 'template-rarity.json'), 'utf8'));
const integrityAudit = JSON.parse(fs.readFileSync(path.join(root, 'data', 'gkniftyheads', 'template-integrity-audit.json'), 'utf8'));
const fixture = liveJson.ranked_templates.find((row) => row.template_id === 900001);
assert.match(liveHtml, /<th>Live Supply<\/th>/, 'page should label live supply only when cached live counts exist');
assert.doesNotMatch(liveHtml, /<th>Issued Supply Fallback<\/th>/, 'live-counted page should not label counted supply as fallback');
assert.equal(fixture.issued_supply, 10, 'issued_supply should remain visible as total ever issued');
assert.equal(fixture.live_supply, 8, 'renderer should use cached live_supply');
assert.equal(fixture.pre_baseline_missing_or_burned, 2, 'renderer should preserve pre-baseline missing/burned count');
assert.equal(fixture.rarity_live_exposure, 8, 'scoring exposure should use cached live_supply');
assert.equal(fixture.live_supply_from_asset_state, 8, 'asset-state live_supply should be exposed when cache matches _count');
assert.equal(fixture.asset_state_status, 'ok', 'asset-state live_supply should match template _count in the happy path');
assert.equal(fixture.burned_assets_count, 1, 'asset-state burned asset count should be exposed on rarity rows');
assert.match(liveHtml, /Asset state cache/, 'page should expose asset state cache status');
assert.match(liveHtml, /Original mint numbers never change\. Burns do not renumber NFTs/, 'page should explain permanent original mint numbers');
assert.match(liveHtml, /surviving mint rank/, 'page should explain surviving mint rank');
assert.equal(liveJson.ranked_templates.some((row) => row.template_id === 900003), false, 'max_supply=0 templates must stay out of limited ranking');
assert.equal(liveJson.ranked_templates.some((row) => row.template_id === 900004), false, 'local-only stale templates must not enter ranked_templates');
assert.equal(integrityAudit.missing_from_atomicassets.some((row) => row.template_id === 900004), true, 'integrity audit should report local-only templates missing from AtomicAssets');
assert.equal(integrityAudit.excluded_from_rarity.some((row) => row.template_id === 900004 && row.reason === 'missing_from_atomicassets'), true, 'missing AtomicAssets templates should be excluded from rarity');
assert.equal(integrityAudit.duplicate_title_image_groups.some((group) => {
  const ids = group.templates.map((row) => row.template_id).sort((a, b) => a - b);
  return ids.includes(900001) && ids.includes(900002);
}), true, 'integrity audit should report duplicate title/image groups across valid AtomicAssets templates');

const mismatchRoot = makeRoot();
await updateGkniftyheadsLiveSupplyCache(mismatchRoot, {
  concurrency: 1,
  rows: [{ template_id: 900001, issued_supply: 10 }],
  countTemplate: async () => 8,
});
await updateGkniftyheadsAssetStateCache(mismatchRoot, {
  rows: [{ template_id: 900001, issued_supply: 10 }],
  fetchJson: async (url, { sourceKey }) => {
    if (sourceKey === 'recently_updated_live_assets') return { data: [
      asset('m1', 900001, 1),
      asset('m2', 900001, 2),
      asset('m4', 900001, 4),
    ] };
    return { data: [] };
  },
});
await runGenerateGkniftyheadsRarity(mismatchRoot);
const mismatchJson = JSON.parse(fs.readFileSync(path.join(mismatchRoot, 'data', 'gkniftyheads', 'template-rarity.json'), 'utf8'));
const mismatchRow = mismatchJson.ranked_templates.find((row) => row.template_id === 900001);
assert.equal(mismatchRow.live_supply, 8, 'asset-state mismatch must not override _count live supply used for current rarity maths');
assert.equal(mismatchRow.live_supply_from_asset_state, 3, 'asset-state mismatch should preserve the independently counted asset-state supply');
assert.equal(mismatchRow.asset_state_status, 'asset_state_mismatch', 'mismatch between asset-state live_supply and _count must be recorded');

const fallbackRoot = makeRoot();
await runGenerateGkniftyheadsRarity(fallbackRoot);
const fallbackHtml = fs.readFileSync(path.join(fallbackRoot, 'wiki', 'gkniftyheads-nft-collection.html'), 'utf8');
const fallbackJson = JSON.parse(fs.readFileSync(path.join(fallbackRoot, 'data', 'gkniftyheads', 'template-rarity.json'), 'utf8'));
assert.match(fallbackHtml, /<th>Issued Supply Fallback<\/th>/, 'missing live cache should label supply as issued-supply fallback');
assert.doesNotMatch(fallbackHtml, /<th>Live Supply<\/th>/, 'fallback page must not silently label issued supply as live supply');
assert.match(fallbackJson.live_data_status, /issued-supply fallback/, 'fallback JSON should report issued-supply fallback');

console.log('GKniftyHEADS staged rarity pipeline regression passed.');
