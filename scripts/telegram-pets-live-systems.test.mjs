import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { PET_DISTRICT_APPROACHES, PET_DISTRICT_ENCOUNTERS, PET_EVENT_CHAINS, PET_FACTION_BONUSES, PET_REGION_CONTENT, PET_SEASONAL_BOSSES } from '../workers/moonboys-api/pets/content-phase-4.js';
import { PET_COSMETIC_SINKS, PET_EQUIPMENT_UPGRADE_COSTS, PET_PRESTIGE_REQUIREMENTS } from '../workers/moonboys-api/pets/economy-phase-3.js';
import {
  applyPetFactionBonus, buildPetLiveSystemsState, getActiveSeasonalBoss, processPetCosmeticUnlock, processPetDistrictMission,
  processPetCraftRecipe, processPetEquipmentUpgrade, processPetEventChain, processPetPrestige, processPetSeasonalBoss,
} from '../workers/moonboys-api/pets/live-systems.js';
import { awardPetReward, PET_REWARD_SOURCES } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { buildPetRegionDirectory, PET_REGION_LORE } from '../workers/moonboys-api/pets/game-content.js';

const root = new URL('../', import.meta.url);
const worker = fs.readFileSync(new URL('workers/moonboys-api/worker.js', root), 'utf8');
const client = fs.readFileSync(new URL('js/moonpet-mini-app.js', root), 'utf8');
const schema = fs.readFileSync(new URL('workers/moonboys-api/schema.sql', root), 'utf8');
const migration = fs.readFileSync(new URL('workers/moonboys-api/migrations/052_telegram_pet_live_systems.sql', root), 'utf8');

assert.equal(Object.keys(PET_REGION_CONTENT).length, 6);
assert.ok(Object.values(PET_REGION_LORE).every((region) => region.status === 'live'), 'all six districts must be live');
const unlocked = buildPetRegionDirectory(100, { moon_alley: 100, neon_rooftops: 300, rugpull_mines: 700, blockchain_sewers: 1400, kaiju_district: 3000 });
assert.ok(unlocked.every((region) => region.playable), 'district gates must use the preceding district mastery');
assert.equal(Object.keys(PET_DISTRICT_ENCOUNTERS).length, 18, 'every district encounter needs an authored brief');
assert.equal(Object.keys(PET_DISTRICT_APPROACHES).length, 3, 'district missions need three risk profiles');
assert.ok(Object.values(PET_DISTRICT_ENCOUNTERS).every((entry) => entry.title && entry.objective && entry.opponent?.name && entry.threat >= 1));
assert.equal(Object.keys(PET_EVENT_CHAINS).length, 4);
assert.ok(Object.values(PET_EVENT_CHAINS).every((chain) => chain.title && chain.steps.every((step) => chain.step_content?.[step]?.choices?.length === 2)));
assert.equal(Object.keys(PET_SEASONAL_BOSSES).length, 4);
assert.ok(getActiveSeasonalBoss(new Date('2026-08-12T00:00:00Z')).hp >= 900);
assert.notEqual(getActiveSeasonalBoss(new Date('2026-08-12T00:00:00Z')).season_instance, getActiveSeasonalBoss(new Date('2026-09-09T00:00:00Z')).season_instance, 'boss persistence must reset on later rotations');
assert.equal(Object.keys(PET_FACTION_BONUSES).length, 9);
assert.ok(applyPetFactionBonus({ moon_gold: 100 }, 'blockstars', 'jobs').rewards.moon_gold > 100);
assert.equal(applyPetFactionBonus({ pet_xp: 100 }, 'diamond-hands', 'training').bonus.faction, 'hard-fork-rockers', 'legacy faction aliases must normalize');
assert.deepEqual(Object.keys(applyPetFactionBonus({ pet_xp: 100 }, 'diamond-hands', 'training').bonus.effect), ['training_xp_pct'], 'only implemented faction effects may be advertised');
for (const [faction, definition] of Object.entries(PET_FACTION_BONUSES)) {
  const applied = applyPetFactionBonus({ moon_gold: 100, pet_xp: 100 }, faction, definition.system);
  assert.ok(applied.bonus, `${faction} must resolve in its declared gameplay system`);
  if (definition.system !== 'training') assert.ok(applied.rewards.moon_gold > 100 || applied.rewards.pet_xp > 100, `${faction} must change a live reward`);
}
assert.match(worker, /track_multiplier: 1 \+ Number\(factionBonus/, 'training faction bonus must change runtime Training XP');
assert.match(worker, /applyPetFactionBonus\(player1Scaled\.rewards/, 'Arena faction bonuses must be applied before settlement');
assert.equal(Object.keys(PET_EQUIPMENT_UPGRADE_COSTS).length, 9);
assert.equal(Object.keys(PET_COSMETIC_SINKS).length, 4);
assert.equal(PET_PRESTIGE_REQUIREMENTS.min_level, 100);

for (const action of ['district_mission', 'event_chain', 'seasonal_boss', 'gear_upgrade', 'craft', 'cosmetic_unlock', 'prestige']) {
  assert.match(worker, new RegExp(`action === '${action}'`), `${action} needs a server action`);
  assert.ok(client.includes(`'${action}'`), `${action} needs a Mini App control`);
}
for (const source of ['pet_district', 'pet_event_chain', 'pet_seasonal_boss']) assert.ok(PET_REWARD_SOURCES.includes(source), `${source} must be authorized`);
assert.match(worker, /processPetEquipmentUpgrade\(db, telegramId, body\.item_key, eventKey\)/, 'gear upgrades must retain request idempotency');
assert.match(worker, /if \(!petRaw\) return \{ accepted: false, reason: 'pet_not_adopted' \};\n    const faction = await db\.prepare\('SELECT faction FROM blocktopia_progression/, 'event chains must reject users without a pet before inserting a system event');
assert.match(worker, /destination: 'economy'/, 'recommendations must provide explicit destinations');
assert.match(client, /disabled: !item\.affordable \|\| item\.unlocked && !item\.repeatable/, 'Style Lab must disable unaffordable purchases');
for (const table of ['telegram_pet_system_events', 'telegram_pet_event_chain_progress', 'telegram_pet_seasonal_boss_progress', 'telegram_pet_cosmetic_unlocks']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
}

const db = new DatabaseSync(':memory:');
db.exec(schema);
db.prepare("INSERT INTO telegram_users (telegram_id, xp, level) VALUES ('live-player', 0, 1)").run();
db.prepare("INSERT INTO telegram_pet_profiles (telegram_id) VALUES ('live-player')").run();
db.exec(migration);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name LIKE 'telegram_pet_%'").get().count > 0, true);
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);

class D1Statement {
  constructor(owner, sql) { this.owner = owner; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  run() {
    const result = this.owner.raw.prepare(this.sql).run(...this.args);
    if (/INSERT OR IGNORE INTO telegram_pet_system_events/i.test(this.sql) && Number(result.changes || 0) > 0) this.owner.afterReservation?.();
    return Promise.resolve({ meta: { changes: Number(result.changes || 0) } });
  }
  first() { return Promise.resolve(this.owner.raw.prepare(this.sql).get(...this.args) || null); }
  all() { return Promise.resolve({ results: this.owner.raw.prepare(this.sql).all(...this.args) }); }
}
class D1Database {
  constructor(raw) { this.raw = raw; this.afterReservation = null; }
  prepare(sql) { return new D1Statement(this, sql); }
  async batch(statements) {
    this.raw.exec('BEGIN');
    try {
      const output = statements.map((entry) => {
        if (/\bRETURNING\b/i.test(entry.sql)) {
          const rows = this.raw.prepare(entry.sql).all(...entry.args);
          return { results: rows, meta: { changes: rows.length } };
        }
        const result = this.raw.prepare(entry.sql).run(...entry.args);
        return { meta: { changes: Number(result.changes || 0) } };
      });
      this.raw.exec('COMMIT');
      return output;
    } catch (error) {
      this.raw.exec('ROLLBACK');
      throw error;
    }
  }
}

const runtimeDb = new DatabaseSync(':memory:');
runtimeDb.exec(schema);
const d1 = new D1Database(runtimeDb);
function seedPlayer(id, overrides = {}) {
  runtimeDb.prepare('INSERT INTO telegram_users (telegram_id, xp, level) VALUES (?, 0, 1)').run(id);
  runtimeDb.prepare(`INSERT INTO telegram_pet_profiles
    (telegram_id, pet_xp, level, energy, moon_gold, moon_crystals, style_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, overrides.pet_xp ?? 9900, overrides.level ?? 100, overrides.energy ?? 100, overrides.moon_gold ?? 10000, overrides.moon_crystals ?? 100, overrides.style_tokens ?? 500);
  runtimeDb.prepare('INSERT INTO telegram_pet_progression_state (telegram_id, completed_regions_json) VALUES (?, ?)').run(id, JSON.stringify(['moon_alley', 'neon_rooftops', 'rugpull_mines', 'blockchain_sewers']));
  runtimeDb.prepare("INSERT INTO blocktopia_progression (telegram_id, faction) VALUES (?, 'blockstars')").run(id);
}
seedPlayer('live-1');
for (const material of ['scrap_metal', 'moon_fabric', 'crystal_shard', 'battery_cell', 'arena_token', 'spray_core']) runtimeDb.prepare('INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES (?, ?, 100)').run('live-1', material);
for (let index = 0; index < 3; index += 1) runtimeDb.prepare('INSERT INTO telegram_pet_equipment_progression (telegram_id, item_key, slot, mastery_tier) VALUES (?, ?, ?, 5)').run('live-1', `mastered_${index}`, `slot_${index}`);
runtimeDb.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id, item_key, slot) VALUES ('live-1', 'hoverboard', 'toy')").run();

const reward = (request) => awardPetReward(d1, request);
const runtimeState = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='live-1'").get();
const district = await processPetDistrictMission(d1, 'live-1', 'moon_alley', { level: 100, energy: 100 }, runtimeState, reward, 'nomad-bears');
assert.equal(district.accepted, true);
assert.equal(district.choice.key, 'tactical', 'cached clients must retain the balanced guaranteed path');
assert.equal(district.outcome.success, true);
assert.equal(runtimeDb.prepare("SELECT energy FROM telegram_pet_profiles WHERE telegram_id='live-1'").get().energy, 90);
const districtReplay = await processPetDistrictMission(d1, 'live-1', 'moon_alley', { level: 100, energy: 90 }, runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='live-1'").get(), reward, 'nomad-bears');
assert.equal(districtReplay.duplicate, true);
assert.equal(runtimeDb.prepare("SELECT energy FROM telegram_pet_profiles WHERE telegram_id='live-1'").get().energy, 90);

const usedState = await buildPetLiveSystemsState(d1, 'live-1', { level: 100, moon_gold: 10000, moon_crystals: 100, style_tokens: 500 }, runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='live-1'").get(), [], []);
assert.equal(usedState.regions.find((region) => region.key === 'moon_alley').used_today, true, 'completed daily districts must be disabled in refreshed state');
assert.equal(usedState.regions.find((region) => region.key === 'neon_rooftops').mission.choices.length, 3);
assert.ok(usedState.regions.find((region) => region.key === 'neon_rooftops').mission.complication?.key, 'daily district missions must include a deterministic authored complication');
assert.equal(usedState.chains[0].scene.choices.length, 2);
assert.equal(usedState.equipment_sets.length, 3, 'live state must expose persistent loadout set progress');

seedPlayer('lease-race');
const leaseRuntime = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='lease-race'").get();
let concurrentDistrict = null;
let triggerConcurrentDistrict = true;
const interleavedReward = async (request) => {
  if (triggerConcurrentDistrict) {
    triggerConcurrentDistrict = false;
    concurrentDistrict = await processPetDistrictMission(d1, 'lease-race', 'moon_alley', { level: 100, energy: 90 }, leaseRuntime, reward, 'nomad-bears');
  }
  return reward(request);
};
assert.equal((await processPetDistrictMission(d1, 'lease-race', 'moon_alley', { level: 100, energy: 100 }, leaseRuntime, interleavedReward, 'nomad-bears')).accepted, true);
assert.equal(concurrentDistrict.reason, 'district_busy', 'a concurrent request must not own an active settlement lease');
assert.equal(runtimeDb.prepare("SELECT adventure_xp FROM telegram_pet_progression_state WHERE telegram_id='lease-race'").get().adventure_xp, 25, 'one district reservation may advance progression only once');
assert.equal(runtimeDb.prepare("SELECT energy FROM telegram_pet_profiles WHERE telegram_id='lease-race'").get().energy, 90, 'one district reservation may charge Energy only once');

seedPlayer('district-interleave');
runtimeDb.prepare("UPDATE telegram_pet_progression_state SET region_mastery_json=? WHERE telegram_id='district-interleave'").run(JSON.stringify({ moon_alley: 100 }));
const interleaveRuntime = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='district-interleave'").get();
let nestedDistrict = null;
let triggerNestedDistrict = true;
const crossDistrictReward = async (request) => {
  if (triggerNestedDistrict) {
    triggerNestedDistrict = false;
    nestedDistrict = await processPetDistrictMission(d1, 'district-interleave', 'neon_rooftops', { level: 100, energy: 90 }, interleaveRuntime, reward, 'nomad-bears');
  }
  return reward(request);
};
assert.equal((await processPetDistrictMission(d1, 'district-interleave', 'moon_alley', { level: 100, energy: 100 }, interleaveRuntime, crossDistrictReward, 'nomad-bears')).accepted, true);
assert.equal(nestedDistrict.accepted, true);
const interleavedMastery = JSON.parse(runtimeDb.prepare("SELECT region_mastery_json FROM telegram_pet_progression_state WHERE telegram_id='district-interleave'").get().region_mastery_json);
assert.equal(interleavedMastery.moon_alley, 125);
assert.equal(interleavedMastery.neon_rooftops, 25, 'concurrent districts must preserve both JSON mastery updates');

seedPlayer('alias-state', { level: 14, pet_xp: 1300 });
runtimeDb.prepare("UPDATE blocktopia_progression SET faction='graff-punks' WHERE telegram_id='alias-state'").run();
const aliasRuntime = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='alias-state'").get();
const aliasState = await buildPetLiveSystemsState(d1, 'alias-state', { level: 14, moon_gold: 10000, moon_crystals: 100, style_tokens: 500 }, aliasRuntime, [{ item_key: 'test_gear', item_level: 1 }], [{ material_key: 'scrap_metal', quantity: 100 }]);
assert.equal(aliasState.faction.key, 'graffpunks', 'live state must serialize canonical faction keys');
assert.equal(aliasState.upgrades[0].unlocked, false);
assert.equal(aliasState.upgrades[0].affordable, false, 'Level 15 server gate must be reflected in upgrade availability');

const chain = await processPetEventChain(d1, 'live-1', 'lost_delivery_drone', reward, 'graffpunks');
assert.equal(chain.accepted, true);
assert.ok(chain.choice.key);
assert.ok(chain.result_copy);
assert.equal((await processPetEventChain(d1, 'live-1', 'lost_delivery_drone', reward, 'graffpunks')).duplicate, true);

seedPlayer('chain-recovery');
let chainFailure = true;
const recoverableReward = async (request) => { if (chainFailure) { chainFailure = false; throw new Error('simulated interruption'); } return awardPetReward(d1, request); };
await assert.rejects(() => processPetEventChain(d1, 'chain-recovery', 'signal_hijack', recoverableReward, 'graffpunks'), /simulated interruption/);
assert.equal((await processPetEventChain(d1, 'chain-recovery', 'signal_hijack', recoverableReward, 'graffpunks')).accepted, true, 'a settling chain must recover after reward interruption');

const goldBeforeUpgrade = runtimeDb.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='live-1'").get().moon_gold;
assert.equal((await processPetEquipmentUpgrade(d1, 'live-1', 'hoverboard', 'request-upgrade-1')).accepted, true);
assert.equal(runtimeDb.prepare("SELECT item_level FROM telegram_pet_equipment_progression WHERE telegram_id='live-1' AND item_key='hoverboard'").get().item_level, 2);
assert.equal((await processPetEquipmentUpgrade(d1, 'live-1', 'hoverboard', 'request-upgrade-1')).duplicate, true);
assert.equal(runtimeDb.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='live-1'").get().moon_gold, goldBeforeUpgrade - 80);

const scrapBeforeCraft = runtimeDb.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id='live-1' AND material_key='scrap_metal'").get().quantity;
const crafted = await processPetCraftRecipe(d1, 'live-1', 'street_rations', 'request-craft-1');
assert.equal(crafted.accepted, true);
assert.equal(runtimeDb.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id='live-1' AND asset_type='item' AND asset_key='moon_snack'").get().quantity, 2);
assert.equal(runtimeDb.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id='live-1' AND material_key='scrap_metal'").get().quantity, scrapBeforeCraft - 2);
assert.equal((await processPetCraftRecipe(d1, 'live-1', 'street_rations', 'request-craft-1')).duplicate, true, 'craft retries must not mint twice');

d1.afterReservation = () => { d1.afterReservation = null; runtimeDb.prepare("UPDATE telegram_pet_material_balances SET quantity=0 WHERE telegram_id='live-1' AND material_key='battery_cell'").run(); };
const racedCraft = await processPetCraftRecipe(d1, 'live-1', 'battery_pack', 'request-craft-race');
assert.equal(racedCraft.accepted, false);
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_inventory WHERE telegram_id='live-1' AND asset_type='item' AND asset_key='energy_drink'").get().count, 0, 'stale affordability must not mint a crafted item');

runtimeDb.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id, item_key, slot) VALUES ('live-1', 'race_item', 'toy')").run();
d1.afterReservation = () => { d1.afterReservation = null; runtimeDb.prepare("UPDATE telegram_pet_material_balances SET quantity=0 WHERE telegram_id='live-1' AND material_key='scrap_metal'").run(); };
const racedUpgrade = await processPetEquipmentUpgrade(d1, 'live-1', 'race_item', 'request-upgrade-race');
assert.equal(racedUpgrade.accepted, false);
assert.equal(runtimeDb.prepare("SELECT item_level FROM telegram_pet_equipment_progression WHERE telegram_id='live-1' AND item_key='race_item'").get().item_level, 1, 'stale affordability must not grant an upgrade');

runtimeDb.prepare("UPDATE telegram_pet_material_balances SET quantity=100 WHERE telegram_id='live-1' AND material_key='scrap_metal'").run();
const cosmetic = await processPetCosmeticUnlock(d1, 'live-1', 'profile_frame', 'request-cosmetic-1');
assert.equal(cosmetic.accepted, true);
assert.equal((await processPetCosmeticUnlock(d1, 'live-1', 'profile_frame', 'request-cosmetic-1')).duplicate, true);
assert.equal((await processPetCosmeticUnlock(d1, 'live-1', 'profile_frame', 'request-cosmetic-2')).reason, 'cosmetic_owned');

const renameBefore = runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_cosmetic_unlocks WHERE telegram_id='live-1' AND cosmetic_key='rename_badge'").get().count;
d1.afterReservation = () => { d1.afterReservation = null; runtimeDb.prepare("UPDATE telegram_pet_profiles SET style_tokens=0 WHERE telegram_id='live-1'").run(); };
assert.equal((await processPetCosmeticUnlock(d1, 'live-1', 'rename_badge', 'request-cosmetic-race')).accepted, false);
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_cosmetic_unlocks WHERE telegram_id='live-1' AND cosmetic_key='rename_badge'").get().count, renameBefore, 'stale cosmetic affordability must not grant an unlock');

const liveState = { prestige: { ready: true, count: 0 } };
const prestige = await processPetPrestige(d1, 'live-1', liveState, 'request-prestige-1');
assert.equal(prestige.accepted, true);
assert.equal((await processPetPrestige(d1, 'live-1', { prestige: { ready: false, count: 1 } }, 'request-prestige-1')).duplicate, true);
assert.equal(runtimeDb.prepare("SELECT prestige_count FROM telegram_pet_progression_state WHERE telegram_id='live-1'").get().prestige_count, 1);

seedPlayer('prestige-race');
for (let index = 0; index < 3; index += 1) runtimeDb.prepare('INSERT INTO telegram_pet_equipment_progression (telegram_id, item_key, slot, mastery_tier) VALUES (?, ?, ?, 5)').run('prestige-race', `race_mastered_${index}`, `slot_${index}`);
d1.afterReservation = () => { d1.afterReservation = null; runtimeDb.prepare("UPDATE telegram_pet_profiles SET moon_gold=0 WHERE telegram_id='prestige-race'").run(); };
assert.equal((await processPetPrestige(d1, 'prestige-race', { prestige: { ready: true, count: 0 } }, 'request-prestige-race')).accepted, false);
assert.equal(runtimeDb.prepare("SELECT prestige_count FROM telegram_pet_progression_state WHERE telegram_id='prestige-race'").get().prestige_count, 0, 'stale prestige affordability must not grant rank');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_material_balances WHERE telegram_id='prestige-race' AND material_key='mastery_token'").get().count, 0);

seedPlayer('energy-retry', { energy: 0 });
const tiredRuntime = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='energy-retry'").get();
assert.equal((await processPetDistrictMission(d1, 'energy-retry', 'moon_alley', { level: 100, energy: 100 }, tiredRuntime, reward, null)).reason, 'pet_tired');
runtimeDb.prepare("UPDATE telegram_pet_profiles SET energy=100 WHERE telegram_id='energy-retry'").run();
assert.equal((await processPetDistrictMission(d1, 'energy-retry', 'moon_alley', { level: 100, energy: 100 }, tiredRuntime, reward, null)).accepted, true, 'rejected Energy reservations must be safely retryable');

seedPlayer('invalid-district-choice');
const invalidDistrictRuntime = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='invalid-district-choice'").get();
const invalidDistrict = await processPetDistrictMission(d1, 'invalid-district-choice', 'moon_alley', { level: 100, energy: 100 }, invalidDistrictRuntime, reward, null, 'not_a_real_approach');
assert.equal(invalidDistrict.reason, 'district_approach_invalid');
assert.equal(runtimeDb.prepare("SELECT energy FROM telegram_pet_profiles WHERE telegram_id='invalid-district-choice'").get().energy, 100, 'invalid district choices must be rejected before Energy settlement');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_system_events WHERE telegram_id='invalid-district-choice'").get().count, 0);

seedPlayer('invalid-story-choice');
const invalidStory = await processPetEventChain(d1, 'invalid-story-choice', 'lost_delivery_drone', reward, null, 'not_a_real_choice');
assert.equal(invalidStory.reason, 'event_chain_choice_invalid');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_system_events WHERE telegram_id='invalid-story-choice'").get().count, 0);

let checkpointSetback = null;
for (let index = 0; index < 64 && !checkpointSetback; index += 1) {
  const telegramId = `checkpoint-setback-${index}`;
  seedPlayer(telegramId);
  runtimeDb.prepare('UPDATE telegram_pet_progression_state SET region_mastery_json=?, completed_regions_json=? WHERE telegram_id=?')
    .run(JSON.stringify({ moon_alley: 90 }), '[]', telegramId);
  const checkpointRuntime = runtimeDb.prepare('SELECT * FROM telegram_pet_progression_state WHERE telegram_id=?').get(telegramId);
  const checkpointState = await buildPetLiveSystemsState(d1, telegramId, { level: 100, energy: 100, moon_gold: 10000 }, checkpointRuntime, [], []);
  assert.equal(checkpointState.regions.find((region) => region.key === 'moon_alley').mission.boss, true, 'a possible 100-mastery crossing must present the district boss');
  const result = await processPetDistrictMission(d1, telegramId, 'moon_alley', { level: 100, energy: 100 }, checkpointRuntime, reward, null, 'bold');
  if (!result.outcome.success) checkpointSetback = { telegramId, result };
}
assert.ok(checkpointSetback, 'deterministic district coverage must include a setback');
assert.equal(checkpointSetback.result.reason, 'district_mission_setback');
assert.ok(checkpointSetback.result.region.mastery_xp < 100, 'a setback must not cross a mastery checkpoint');
const checkpointProgress = runtimeDb.prepare('SELECT region_mastery_json, completed_regions_json FROM telegram_pet_progression_state WHERE telegram_id=?').get(checkpointSetback.telegramId);
assert.ok(JSON.parse(checkpointProgress.region_mastery_json).moon_alley < 100);
assert.equal(JSON.parse(checkpointProgress.completed_regions_json).includes('moon_alley'), false, 'a setback must not unlock the next district');

seedPlayer('boss-1');
const boss = getActiveSeasonalBoss();
runtimeDb.prepare('INSERT INTO telegram_pet_seasonal_boss_progress (telegram_id, season_key, boss_key, damage) VALUES (?, ?, ?, ?)').run('boss-1', boss.season_instance, boss.key, boss.hp - 1);
const bossResult = await processPetSeasonalBoss(d1, 'boss-1', { level: 100, energy: 100 }, reward);
assert.equal(bossResult.progress.defeated, true);
assert.ok(runtimeDb.prepare('SELECT reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE telegram_id=? AND season_key=? AND boss_key=?').get('boss-1', boss.season_instance, boss.key).reward_claimed_at);

seedPlayer('boss-recovery');
runtimeDb.prepare('INSERT INTO telegram_pet_seasonal_boss_progress (telegram_id, season_key, boss_key, damage, defeated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)').run('boss-recovery', boss.season_instance, boss.key, boss.hp);
const recovered = await processPetSeasonalBoss(d1, 'boss-recovery', { level: 100, energy: 100 }, reward);
assert.equal(recovered.reason, 'seasonal_boss_reward_recovered');
assert.ok(runtimeDb.prepare('SELECT reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE telegram_id=? AND season_key=? AND boss_key=?').get('boss-recovery', boss.season_instance, boss.key).reward_claimed_at);

assert.match(worker, /body\.approach_key/);
assert.match(worker, /body\.choice_key/);
assert.match(client, /class="district-mission"/);
assert.match(client, /class="story-scene"/);
console.log('telegram-pets-live-systems.test.mjs passed');
