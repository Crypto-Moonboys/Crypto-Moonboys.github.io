#!/usr/bin/env node

import assert from 'node:assert/strict';
import { buildRanking } from './generate-gkniftyheads-rarity.mjs';

function fixture(overrides = {}) {
  return {
    title: 'Fixture Template',
    template_id: 900001,
    issued_supply: 10,
    live_supply: 8,
    live_supply_status: 'counted',
    max_supply: 10,
    rarity_trait: 'Fixture Rare',
    variation_trait: 'Fixture Variation',
    description: '#HODLWARS P2E game power lore text',
    url: '/wiki/gkniftyheads-fixture-900001.html',
    atomicassets_url: 'https://wax.api.atomicassets.io/atomicassets/v1/templates/gkniftyheads/900001',
    atomichub_url: 'https://wax.atomichub.io/market?collection_name=gkniftyheads&template_id=900001',
    listed_supply: 9999,
    marketplace_listing_count: 9999,
    floor_price: 9999,
    ...overrides,
  };
}

const model = buildRanking([
  fixture(),
  fixture({
    title: 'Control Template',
    template_id: 900002,
    issued_supply: 20,
    live_supply: 20,
    max_supply: 20,
    rarity_trait: 'Common Fixture',
    variation_trait: 'Common Variation',
    description: 'Fixed supply comparison template',
  }),
  fixture({
    title: 'Uncapped Template',
    template_id: 900003,
    issued_supply: 3,
    live_supply: 1,
    max_supply: 0,
    rarity_trait: 'Uncapped',
    variation_trait: 'Uncapped',
    description: 'Low current issue count but open max supply',
  }),
]);

const rankedFixture = model.ranked.find((row) => row.template_id === 900001);
assert.ok(rankedFixture, 'fixed max_supply template should be ranked');
assert.equal(rankedFixture.issued_supply, 10, 'issued_supply should remain the total ever issued');
assert.equal(rankedFixture.live_supply, 8, 'live_supply should use current AtomicAssets asset count');
assert.equal(rankedFixture.missing_or_burned_count, 2, 'missing_or_burned_count should be issued minus live supply');
assert.equal(rankedFixture.pre_baseline_missing_or_burned, 2, 'first scan delta should be labelled pre-baseline missing/burned');
assert.equal(rankedFixture.rarity_live_exposure, 8, 'trait exposure should use live_supply when counted');
assert.equal(rankedFixture.variation_live_exposure, 8, 'variation exposure should use live_supply when counted');
assert.notEqual(rankedFixture.final_score, 0, 'fixture should receive a rarity score');
assert.equal(rankedFixture.listed_supply, 9999, 'marketplace-looking fixture fields should be preserved as inert data only');
assert.equal(rankedFixture.live_supply_status, 'counted', 'fixture should retain counted live supply status');
assert.equal(model.utility.some((row) => row.template_id === 900003), true, 'max_supply=0 templates must remain excluded from limited ranking');
assert.equal(model.ranked.some((row) => row.template_id === 900003), false, 'uncapped max_supply=0 template must not be ranked even with low live_supply');

const issuedFallbackModel = buildRanking([
  fixture({
    template_id: 900004,
    live_supply: undefined,
    live_supply_status: 'issued_supply_fallback',
  }),
  fixture({
    template_id: 900005,
    issued_supply: 12,
    live_supply: undefined,
    live_supply_status: 'issued_supply_fallback',
    max_supply: 12,
    rarity_trait: 'Fallback Control',
    variation_trait: 'Fallback Control',
  }),
]);
const fallbackRow = issuedFallbackModel.ranked.find((row) => row.template_id === 900004);
assert.equal(fallbackRow.live_supply, 10, 'fallback mode should use issued supply as the scoring supply');
assert.equal(fallbackRow.missing_or_burned_count, null, 'fallback mode must not invent missing/burned counts');
assert.match(fallbackRow.live_data_status, /issued-supply fallback/, 'fallback rows must advertise issued-supply fallback mode');

assert.equal(
  JSON.stringify(model).includes('marketplace_listing_count') && model.ranked[0].live_supply !== model.ranked[0].marketplace_listing_count,
  true,
  'marketplace/listed counts must not be used as rarity supply'
);

console.log('GKniftyHEADS live supply scoring regression passed.');
