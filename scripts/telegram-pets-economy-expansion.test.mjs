import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  PET_DAILY_BOUNTIES,
  PET_ECONOMY_ROUTES,
  PET_EXPEDITION_TIERS,
  PET_MARKET_OFFERS,
  buildPetEconomyGuidanceActions,
  formatPetEconomyValue,
  getPetDailyBounties,
  getPetMarketOffers,
  resolvePetExpeditionReward,
} from '../workers/moonboys-api/pets/economy-expansion.js';
import { PET_CRAFTING_MATERIALS, normalizePetMaterial } from '../workers/moonboys-api/pets/economy-phase-3.js';
import { PET_ECONOMY_REACHABILITY_CLASSIFICATIONS, buildPetEconomyReachabilityAudit } from '../workers/moonboys-api/pets/economy-reachability-audit.js';
import { choosePetNextAction } from '../workers/moonboys-api/pets/player-guidance.js';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

assert.ok(PET_ECONOMY_ROUTES.length >= 15, 'economy audit must cover the complete earn/spend/upgrade/unlock loop');
assert.ok(PET_DAILY_BOUNTIES.length >= 10, 'daily board needs enough variety to rotate');
assert.ok(PET_MARKET_OFFERS.length >= 12, 'market needs a deep rotating catalogue');
assert.ok(PET_EXPEDITION_TIERS.length >= 3, 'expeditions must grow with player level');

const firstBoard = getPetDailyBounties('2026-08-12');
assert.equal(firstBoard.length, 4);
assert.deepEqual(firstBoard, getPetDailyBounties('2026-08-12'), 'daily bounty selection must be deterministic');
assert.notDeepEqual(firstBoard.map(({ key }) => key), getPetDailyBounties('2026-08-13').map(({ key }) => key), 'daily boards should rotate');
assert.equal(new Set(firstBoard.map(({ key }) => key)).size, 4);
assert.deepEqual(getPetDailyBounties('2026-08-12', 1), getPetDailyBounties('2026-08-12', 99), 'level-ups cannot replace the fixed daily bounty board');
assert.ok(PET_DAILY_BOUNTIES.every(({ min_level = 1 }) => min_level <= 1), 'every bounty in the fixed board pool must be available to starters');
const currentBetaEventTypes = new Set([
  'feed', 'play', 'clean', 'sleep', 'train', 'work', 'random_event', 'activity_claim',
  'run_complete', 'run_extract', 'adventure', 'daily_chest', 'kaiju_battle',
  'use_item', 'use_item_reward',
]);
for (const bounty of PET_DAILY_BOUNTIES) {
  assert.ok(bounty.event_types.every((eventType) => currentBetaEventTypes.has(eventType)), `${bounty.key} bounty must reference current beta actions only`);
}

const starterMarket = getPetMarketOffers('2026-08-12', 1);
assert.equal(getPetMarketOffers('2026-08-12', 43).length, 4);
assert.deepEqual(getPetMarketOffers('2026-08-12', 43), getPetMarketOffers('2026-08-12', 43));
assert.deepEqual(starterMarket, getPetMarketOffers('2026-08-12', 99), 'level-ups cannot replace the fixed daily market stock');
const canonicalMarketItems = new Set(['moon_snack', 'clean_wipe', 'energy_drink', 'adventure_map', 'lucky_charm', 'style_patch']);
const canonicalCurrencies = new Set(['moon_gold', 'moon_crystals', 'style_tokens']);
for (const offer of PET_MARKET_OFFERS) {
  assert.ok(Object.keys(offer.cost).length > 0, `${offer.key} must have a purchase cost`);
  assert.ok(Object.keys(offer.cost).every((key) => canonicalCurrencies.has(key)), `${offer.key} must charge account-owned wallet currencies only`);
  for (const material of Object.keys(offer.reward.materials || {})) assert.ok(normalizePetMaterial(material), `${offer.key} must not reward invalid material ${material}`);
  for (const item of Object.keys(offer.reward.items || {})) assert.ok(canonicalMarketItems.has(item), `${offer.key} must not reward invalid item ${item}`);
}

const expedition = resolvePetExpeditionReward('2026-08-12', 'player-1', 1, 43);
assert.equal(expedition.expedition.key, 'guardian_rift');
assert.deepEqual(expedition, resolvePetExpeditionReward('2026-08-12', 'player-1', 1, 43), 'server settlement must be replay-safe');
for (const tier of PET_EXPEDITION_TIERS) {
  assert.ok(tier.energy > 0, `${tier.key} expedition must charge Energy`);
  assert.ok(tier.rewards.length >= 3, `${tier.key} expedition needs deterministic reward variety`);
  for (const reward of tier.rewards) {
    for (const material of Object.keys(reward.materials || {})) assert.ok(PET_CRAFTING_MATERIALS[material], `${tier.key} expedition must not create invalid material ${material}`);
  }
}

const actions = buildPetEconomyGuidanceActions({
  pet: { energy: 90 },
  bounties: [{ key: 'care_pair', title: 'Care Pair', complete: true, claimed: false, progress: 2, required: 2, reward: { moon_gold: 30 } }],
  expedition: { title: 'Crystal Caves', energy: 18 },
  expedition_attempts_left: 2,
  market_offers: [{ key: 'battery_pack', title: 'Battery Pack', purchased: false, affordable: true, cost: { moon_gold: 120 }, reward: { items: { energy_drink: 2 } } }],
});
assert.deepEqual(actions.map(({ key }) => key), ['bounty:care_pair', 'economy:expedition', 'market:battery_pack']);
for (const action of actions) {
  assert.ok(action.title && action.detail && action.label && action.callback_data, 'every future economy upgrade must supply the complete Coach contract');
  assert.ok(action.callback_data.length <= 64, 'Telegram callback data must remain within its real platform limit');
}
assert.match(actions[0].detail, /2\/2/);
assert.match(actions[0].detail, /30 .*gold/);
assert.equal(choosePetNextAction({ pet: { health: 100, hunger: 0, cleanliness: 100, energy: 90, happiness: 100 }, economy_actions: actions }).key, 'bounty:care_pair');
assert.equal(choosePetNextAction({ pet: { health: 10, hunger: 0, cleanliness: 100, energy: 90, happiness: 100 }, economy_actions: actions }).key, 'health', 'urgent care must still outrank economy grinding');
assert.match(formatPetEconomyValue({ moon_gold: 12, moon_crystals: 1, materials: { scrap_metal: 2 } }), /12 .*gold.*1 .*crystals.*2 scrap metal/);

const rewardFoundation = fs.readFileSync(new URL('../workers/moonboys-api/pets/roguelite-foundation.js', import.meta.url), 'utf8');
for (const source of ['pet_bounty', 'pet_expedition', 'pet_market']) assert.match(rewardFoundation, new RegExp(`'${source}'`));
assert.match(rewardFoundation, /moon_gold >= \? AND moon_crystals >= \? AND style_tokens >= \?/, 'currency exchanges must be authorized before rewards are created');
assert.match(rewardFoundation, /source = 'pet_expedition'[\s\S]*status IN \('pending', 'awarded'\)\) < 3/, 'the expedition cap must be reserved inside reward settlement');
assert.match(rewardFoundation, /telegram_pet_profiles WHERE telegram_id = \? AND energy >= \?/, 'the full expedition Energy cost must be reserved atomically');

const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
for (const command of ['peteconomy', 'petbounties', 'petexpedition', 'petmarket']) assert.match(worker, new RegExp(`case ['"]${command}['"]`));
assert.match(worker, /economy_actions: economy\?\.guidance_actions \|\| \[\]/, 'all economy additions must flow through Coach');
assert.match(worker, /action === ['"]bounty_claim['"]/, 'Mini App bounty claim action must reach the server');
assert.match(worker, /action === ['"]expedition['"]/, 'Mini App expedition action must reach the server');
assert.match(worker, /action === ['"]market_buy['"]/, 'Mini App market purchase action must reach the server');
assert.match(worker, /rewards:\s*\{\s*moon_gold:\s*40,\s*style_tokens:\s*2\s*\}/, 'daily chest runtime settlement must award gold and style only');
assert.doesNotMatch(worker, /daily_chest[\s\S]{0,800}moon_crystals:\s*[1-9]/, 'daily chest runtime settlement must not award Moon Crystals');
const audit = buildPetEconomyReachabilityAudit();
for (const kind of ['market_offer', 'daily_bounty', 'crystal_expedition']) {
  for (const surface of audit.surfaces.filter((entry) => entry.kind === kind)) {
    assert.equal(surface.classification, PET_ECONOMY_REACHABILITY_CLASSIFICATIONS.LIVE_REACHABLE, `${surface.key} ${kind} must be live and reachable`);
  }
}
assert.equal(audit.surfaces.find((entry) => entry.kind === 'currency' && entry.key === 'moon_crystals').sources.includes('daily_chest'), false,
  'audit currency metadata must not claim Daily Chest creates Moon Crystals');

class D1Adapter {
  constructor(database) { this.database = database; }
  prepare(sql) {
    const statement = this.database.prepare(sql);
    let values = [];
    return {
      bind(...params) { values = params; return this; },
      async first() { return statement.get(...values) || null; },
      async all() { return { results: statement.all(...values).map((row) => ({ ...row })) }; },
      async run() {
        if (/\bRETURNING\b/i.test(sql)) {
          const rows = statement.all(...values);
          return { results: rows, meta: { changes: rows.length } };
        }
        const result = statement.run(...values);
        return { results: [], meta: { changes: Number(result.changes || 0) } };
      },
    };
  }
  async batch(statements) {
    this.database.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
sqlite.prepare(`INSERT INTO telegram_users (telegram_id, xp, level) VALUES ('economy-player', 0, 1)`).run();
sqlite.prepare(`INSERT INTO telegram_pet_profiles
  (telegram_id, pet_xp, level, health, hunger, happiness, cleanliness, energy, moon_gold, moon_crystals, style_tokens, last_decay_at)
  VALUES ('economy-player', 4300, 44, 100, 0, 100, 100, 100, 2000, 20, 50, ?)`).run(new Date().toISOString());
sqlite.prepare(`INSERT INTO telegram_seasons (name, start_date, end_date, is_active)
  VALUES ('Economy test', '2026-01-01', '2027-01-01', 1)`).run();
const d1 = new D1Adapter(sqlite);
const currentDay = new Date().toISOString().slice(0, 10);
const bounty = getPetDailyBounties(currentDay)[0];
for (let index = 0; index < bounty.required; index += 1) {
  sqlite.prepare(`INSERT INTO telegram_pet_events
    (id, telegram_id, event_type, event_key, season_key, day_key, week_key, status, reason, metadata)
    VALUES (?, 'economy-player', ?, ?, 'test-season', ?, 'test-week', 'accepted', 'test', '{}')`)
    .run(`event-${index}`, bounty.event_types[0], `event-${index}`, currentDay);
}
const readyState = await hooks.getPetEconomyState(d1, 'economy-player');
assert.equal(readyState.bounties.find(({ key }) => key === bounty.key).complete, true);
const bountyClaim = await hooks.claimPetEconomyBounty(d1, 'economy-player', bounty.key);
assert.equal(bountyClaim.accepted, true);
assert.equal((await hooks.claimPetEconomyBounty(d1, 'economy-player', bounty.key)).duplicate, true, 'a bounty cannot pay twice');

const beforeEnergy = sqlite.prepare(`SELECT energy FROM telegram_pet_profiles WHERE telegram_id = 'economy-player'`).get().energy;
const expeditionClaim = await hooks.runPetCrystalExpedition(d1, 'economy-player', new Date(), 'request-expedition-1');
assert.equal(expeditionClaim.accepted, true);
assert.equal(sqlite.prepare(`SELECT energy FROM telegram_pet_profiles WHERE telegram_id = 'economy-player'`).get().energy, beforeEnergy - expeditionClaim.expedition.energy);
const repeatedExpedition = await hooks.runPetCrystalExpedition(d1, 'economy-player', new Date(), 'request-expedition-1');
assert.equal(repeatedExpedition.duplicate, true);
assert.equal(sqlite.prepare(`SELECT energy FROM telegram_pet_profiles WHERE telegram_id = 'economy-player'`).get().energy, beforeEnergy - expeditionClaim.expedition.energy, 'a repeated expedition callback cannot charge Energy twice');
assert.equal((await hooks.runPetCrystalExpedition(d1, 'economy-player', new Date(), 'request-expedition-2')).accepted, true);
assert.equal((await hooks.runPetCrystalExpedition(d1, 'economy-player', new Date(), 'request-expedition-3')).accepted, true);
assert.equal((await hooks.runPetCrystalExpedition(d1, 'economy-player', new Date(), 'request-expedition-4')).reason, 'expedition_daily_limit');

sqlite.prepare(`UPDATE telegram_pet_profiles SET energy = 10 WHERE telegram_id = 'economy-player'`).run();
const rejectedEnergyClaim = await hooks.awardPetReward(d1, {
  telegram_id: 'economy-player', source: 'pet_expedition', idempotency_key: 'energy-guard-review',
  event_key: 'energy-guard-review', rewards: { moon_gold: 999 }, profile_deltas: { energy: -24 },
  context: { day_key: '2099-01-01', energy_cost: 24 }, now: new Date('2099-01-01T00:00:00.000Z'),
});
assert.equal(rejectedEnergyClaim.accepted, false, 'an expedition reward cannot reserve when the full Energy cost is unavailable');
assert.equal(sqlite.prepare(`SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'economy-player'`).get().moon_gold < 2999, true, 'rejected expedition must not pay its reward');

const offer = (await hooks.getPetEconomyState(d1, 'economy-player')).market_offers.find(({ affordable }) => affordable);
assert.ok(offer);
const marketClaim = await hooks.buyPetMarketOffer(d1, 'economy-player', offer.key);
assert.equal(marketClaim.accepted, true);
assert.equal((await hooks.buyPetMarketOffer(d1, 'economy-player', offer.key)).duplicate, true, 'daily market stock cannot be bought twice');

console.log('telegram pets economy expansion tests passed');
