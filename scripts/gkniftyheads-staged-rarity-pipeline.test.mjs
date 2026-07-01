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
  ]) {
    fs.writeFileSync(path.join(root, 'wiki', file), `<table><tr><th>rarity</th><td>${rarity}</td></tr><tr><th>variation</th><td>${variation}</td></tr><tr><th>DESCRIPTION</th><td>#HODLWARS P2E lore only</td></tr></table>`, 'utf8');
  }
  return root;
}

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

await runGenerateGkniftyheadsRarity(root);
const liveHtml = fs.readFileSync(path.join(root, 'wiki', 'gkniftyheads-nft-collection.html'), 'utf8');
const liveJson = JSON.parse(fs.readFileSync(path.join(root, 'data', 'gkniftyheads', 'template-rarity.json'), 'utf8'));
const fixture = liveJson.ranked_templates.find((row) => row.template_id === 900001);
assert.match(liveHtml, /<th>Live Supply<\/th>/, 'page should label live supply only when cached live counts exist');
assert.doesNotMatch(liveHtml, /<th>Issued Supply Fallback<\/th>/, 'live-counted page should not label counted supply as fallback');
assert.equal(fixture.issued_supply, 10, 'issued_supply should remain visible as total ever issued');
assert.equal(fixture.live_supply, 8, 'renderer should use cached live_supply');
assert.equal(fixture.pre_baseline_missing_or_burned, 2, 'renderer should preserve pre-baseline missing/burned count');
assert.equal(fixture.rarity_live_exposure, 8, 'scoring exposure should use cached live_supply');
assert.equal(liveJson.ranked_templates.some((row) => row.template_id === 900003), false, 'max_supply=0 templates must stay out of limited ranking');

const fallbackRoot = makeRoot();
await runGenerateGkniftyheadsRarity(fallbackRoot);
const fallbackHtml = fs.readFileSync(path.join(fallbackRoot, 'wiki', 'gkniftyheads-nft-collection.html'), 'utf8');
const fallbackJson = JSON.parse(fs.readFileSync(path.join(fallbackRoot, 'data', 'gkniftyheads', 'template-rarity.json'), 'utf8'));
assert.match(fallbackHtml, /<th>Issued Supply Fallback<\/th>/, 'missing live cache should label supply as issued-supply fallback');
assert.doesNotMatch(fallbackHtml, /<th>Live Supply<\/th>/, 'fallback page must not silently label issued supply as live supply');
assert.match(fallbackJson.live_data_status, /issued-supply fallback/, 'fallback JSON should report issued-supply fallback');

console.log('GKniftyHEADS staged rarity pipeline regression passed.');
