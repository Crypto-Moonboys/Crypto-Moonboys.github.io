import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { PET_DISTRICT_APPROACHES, PET_DISTRICT_ENCOUNTERS, PET_EVENT_CHAINS, PET_FACTION_BONUSES, PET_REGION_CONTENT, PET_SEASONAL_BOSSES } from '../workers/moonboys-api/pets/content-phase-4.js';
import { PET_COSMETIC_SINKS, PET_EQUIPMENT_UPGRADE_COSTS, PET_PRESTIGE_REQUIREMENTS } from '../workers/moonboys-api/pets/economy-phase-3.js';
import {
  applyPetFactionBonus, buildPetLiveSystemsState, getActiveSeasonalBoss, processPetCosmeticUnlock, processPetDistrictMission,
  processPetCraftRecipe, processPetEquipmentUpgrade, processPetEventChain, processPetPrestige, processPetSeasonalBoss,
} from '../workers/moonboys-api/pets/live-systems.js';
import {
  MOONPET_LIVE_SYSTEM_OWNERSHIP_CLASSIFICATION,
  validateMoonpetLiveSystemOwnershipClassification,
} from '../workers/moonboys-api/pets/live-system-ownership-classification.js';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';
import { awardPetReward, PET_REWARD_SOURCES } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { buildPetRegionDirectory, PET_REGION_LORE } from '../workers/moonboys-api/pets/game-content.js';
import {
  PET_ACCOUNT_WALLET_RECOVERY_REQUIRED_EVENT_KEY,
  PET_ACCOUNT_WALLET_RECOVERY_REQUIRED_SOURCE,
  PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY,
  PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE,
} from '../workers/moonboys-api/pets/wallet-reconciliation.js';

const root = new URL('../', import.meta.url);
const { mirrorActivePetInstanceToProfile, serializePet } = __petMediaTestHooks;
function normalizeSourceNewlines(source) {
  return source.replace(/\r\n?/g, '\n');
}

function normalizeSourceWhitespace(source) {
  return normalizeSourceNewlines(source).replace(/\s+/g, ' ').trim();
}

assert.equal(normalizeSourceNewlines('first\r\nsecond\rthird\nfourth'), 'first\nsecond\nthird\nfourth', 'source audits must normalize Windows and legacy line endings');
const worker = normalizeSourceNewlines(fs.readFileSync(new URL('workers/moonboys-api/worker.js', root), 'utf8'));
const client = normalizeSourceNewlines(fs.readFileSync(new URL('js/moonpet-mini-app.js', root), 'utf8'));
const schema = normalizeSourceNewlines(fs.readFileSync(new URL('workers/moonboys-api/schema.sql', root), 'utf8'));
const migration = normalizeSourceNewlines(fs.readFileSync(new URL('workers/moonboys-api/migrations/052_telegram_pet_live_systems.sql', root), 'utf8'));
const liveSystemsSource = normalizeSourceNewlines(fs.readFileSync(new URL('workers/moonboys-api/pets/live-systems.js', root), 'utf8'));
const rewardSource = normalizeSourceNewlines(fs.readFileSync(new URL('workers/moonboys-api/pets/roguelite-foundation.js', root), 'utf8'));
const workerSource = normalizeSourceWhitespace(worker);
const clientSource = normalizeSourceWhitespace(client);

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
assert.match(workerSource, /track_multiplier: 1 \+ Number\(factionBonus/, 'training faction bonus must change runtime Training XP');
assert.match(workerSource, /applyPetFactionBonus\(player1Scaled\.rewards/, 'Arena faction bonuses must be applied before settlement');
assert.equal(Object.keys(PET_EQUIPMENT_UPGRADE_COSTS).length, 9);
assert.equal(Object.keys(PET_COSMETIC_SINKS).length, 4);
assert.equal(PET_PRESTIGE_REQUIREMENTS.min_level, 100);
assert.equal(validateMoonpetLiveSystemOwnershipClassification(), true, 'live ownership classification must be deterministic and complete');
for (const key of [
  'care_actions', 'timed_activities', 'daily_chest', 'jobs', 'daily_journey', 'weekly_journey',
  'standard_moon_run', 'daily_moon_run', 'arena', 'kaiju', 'district_story_missions', 'seasonal_boss',
  'weekly_boss', 'achievements_identity_memories_personality', 'specialist_progression', 'equipment_progression',
  'crafting_material_inventory_market_bounties_expedition_cosmetics', 'mini_app_state_payload',
  'telegram_commands_api_actions_reward_helpers', 'prestige_breeding_lineage_fusion_sanctuary_advanced_traits',
]) {
  assert.ok(MOONPET_LIVE_SYSTEM_OWNERSHIP_CLASSIFICATION.some((row) => row.system_key === key), `${key} must be classified`);
}
for (const row of MOONPET_LIVE_SYSTEM_OWNERSHIP_CLASSIFICATION.filter((entry) => entry.status === 'live')) {
  assert.notEqual(row.authority_owner, 'future/post-season', `${row.system_key} must not use completed-season authority`);
  assert.doesNotMatch(row.expected_ownership_rule, /completed-season/i, `${row.system_key} must not require completed-season authority`);
}
for (const row of MOONPET_LIVE_SYSTEM_OWNERSHIP_CLASSIFICATION.filter((entry) => ['pet', 'mixed'].includes(entry.authority_owner))) {
  assert.ok(row.required_authority_keys.includes('pet_id'), `${row.system_key} must declare pet_id authority`);
  assert.ok(row.required_authority_keys.includes('season_key'), `${row.system_key} must declare season_key authority`);
}

for (const action of ['district_mission', 'event_chain', 'seasonal_boss', 'gear_upgrade', 'craft', 'cosmetic_unlock', 'prestige']) {
  assert.match(workerSource, new RegExp(`action === '${action}'`), `${action} needs a server action`);
  assert.ok(client.includes(`'${action}'`), `${action} needs a Mini App control`);
}
for (const source of ['pet_district', 'pet_event_chain', 'pet_seasonal_boss']) assert.ok(PET_REWARD_SOURCES.includes(source), `${source} must be authorized`);
assert.match(workerSource, /processPetEquipmentUpgrade\(db, telegramId, body\.item_key, eventKey\)/, 'gear upgrades must retain request idempotency');
assert.match(workerSource, /if \(!petRaw\) return \{ accepted: false, reason: 'pet_not_adopted' \}; const faction = await db\.prepare\('SELECT faction FROM blocktopia_progression/, 'event chains must reject users without a pet before inserting a system event');
assert.match(workerSource, /destination: 'economy'/, 'recommendations must provide explicit destinations');
assert.match(clientSource, /disabled: !item\.affordable \|\| item\.unlocked && !item\.repeatable/, 'Style Lab must disable unaffordable purchases');
assert.match(normalizeSourceWhitespace(liveSystemsSource), /ensurePetAccountWalletReadyForMutation[\s\S]*wallet_reconciliation_recovery_pending/,
  'live-system account-wallet sinks must use the shared reconcile-first guard and return the structured pending reason');
assert.match(normalizeSourceWhitespace(liveSystemsSource), /const authority = await resolveLivePetAuthority\(db, telegramId, pet\); if \(!authority\) return \{ accepted: false, reason: 'source_pet_authority_required' \}; const liveProgression = await getPetLiveProgressionState\(db, telegramId, pet, runtime, authority\);/,
  'district missions must reuse the already-resolved pet authority tuple for progression state');
assert.match(normalizeSourceWhitespace(liveSystemsSource), /INSERT OR IGNORE INTO telegram_pet_live_progression_state[\s\S]*SELECT \?, \?, \?, '\{\}', '\[\]', 0/,
  'live progression lazy creation must initialize empty rows instead of copying legacy account progress');
assert.match(normalizeSourceWhitespace(liveSystemsSource), /UPDATE telegram_pet_instances SET energy=energy-\?/,
  'pet action Energy settlement must debit the authoritative pet instance');
assert.match(normalizeSourceWhitespace(liveSystemsSource), /if \(reservation\.status === 'completed'\) return \{ state: 'completed', token: null \};/,
  'Energy settlement completed reservations must keep the structured object return contract');
assert.match(normalizeSourceWhitespace(liveSystemsSource), /UPDATE telegram_pet_live_progression_state SET prestige_count=prestige_count\+1/,
  'prestige settlement must write the live progression authority table');
assert.match(normalizeSourceWhitespace(rewardSource), /if \(\(petId && !petSeasonKey\) \|\| \(!petId && petSeasonKey\)\) throw new Error\('invalid_pet_reward_context'\)/,
  'seasonal boss reward authorization must fail closed for partial pet authority tuples');
assert.match(normalizeSourceWhitespace(rewardSource), /pet_id = '' AND telegram_id = \? AND pet_season_key = '' AND season_key = \? AND boss_key = \?/,
  'seasonal boss legacy authorization fallback must be limited to the empty pet tuple');
for (const table of ['telegram_pet_system_events', 'telegram_pet_live_progression_state', 'telegram_pet_event_chain_progress', 'telegram_pet_seasonal_boss_progress', 'telegram_pet_cosmetic_unlocks']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
}
for (const table of ['telegram_pet_system_events', 'telegram_pet_event_chain_progress', 'telegram_pet_seasonal_boss_progress', 'telegram_pet_cosmetic_unlocks']) assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`));

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
  const seasonKey = overrides.season_key || 'pet-s2026-003';
  const petId = overrides.pet_id || `pet:${id}:${seasonKey}:1`;
  runtimeDb.prepare('INSERT INTO telegram_users (telegram_id, xp, level) VALUES (?, 0, 1)').run(id);
  runtimeDb.prepare(`INSERT INTO telegram_pet_profiles
    (telegram_id, pet_xp, level, energy, moon_gold, moon_crystals, style_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, overrides.pet_xp ?? 392040, overrides.level ?? 100, overrides.energy ?? 100, overrides.moon_gold ?? 10000, overrides.moon_crystals ?? 100, overrides.style_tokens ?? 500);
  runtimeDb.prepare(`INSERT OR IGNORE INTO telegram_pet_season_slots
    (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
    VALUES (?, ?, ?, ?, 'free', 'live-system-fixture', 0, 'active')`).run(petId, id, seasonKey, overrides.slot_number || 1);
  runtimeDb.prepare(`INSERT OR IGNORE INTO telegram_pet_active_slots (telegram_id, pet_id, season_key)
    VALUES (?, ?, ?)`).run(id, petId, seasonKey);
  runtimeDb.prepare(`INSERT OR IGNORE INTO telegram_pet_instances
    (pet_id, telegram_id, season_key, slot_number, pet_xp, level, energy, source_profile_updated_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'live-system-fixture', 'active')`)
    .run(petId, id, seasonKey, overrides.slot_number || 1, overrides.pet_xp ?? 392040, overrides.level ?? 100, overrides.energy ?? 100);
  runtimeDb.prepare('INSERT INTO telegram_pet_progression_state (telegram_id, completed_regions_json) VALUES (?, ?)').run(id, JSON.stringify(['moon_alley', 'neon_rooftops', 'rugpull_mines', 'blockchain_sewers']));
  runtimeDb.prepare("INSERT INTO blocktopia_progression (telegram_id, faction) VALUES (?, 'blockstars')").run(id);
  return { pet_id: petId, season_key: seasonKey };
}

function seedLiveProgression(id, overrides = {}) {
  const seasonKey = overrides.season_key || 'pet-s2026-003';
  const petId = overrides.pet_id || `pet:${id}:${seasonKey}:${overrides.slot_number || 1}`;
  runtimeDb.prepare(`INSERT OR REPLACE INTO telegram_pet_live_progression_state
    (pet_id, telegram_id, season_key, region_mastery_json, completed_regions_json, prestige_count)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(
      petId,
      id,
      seasonKey,
      JSON.stringify(overrides.region_mastery_json || {}),
      JSON.stringify(overrides.completed_regions_json || []),
      overrides.prestige_count || 0,
    );
  return { pet_id: petId, season_key: seasonKey };
}

function livePet(id, overrides = {}) {
  return {
    pet_id: overrides.pet_id || `pet:${id}:${overrides.season_key || 'pet-s2026-003'}:${overrides.slot_number || 1}`,
    season_key: overrides.season_key || 'pet-s2026-003',
    level: overrides.level ?? 100,
    pet_xp: overrides.pet_xp ?? 392040,
    energy: overrides.energy ?? 100,
    moon_gold: overrides.moon_gold ?? 10000,
    moon_crystals: overrides.moon_crystals ?? 100,
    style_tokens: overrides.style_tokens ?? 500,
    ...overrides,
  };
}
function seedMaterials(id) {
  for (const material of ['scrap_metal', 'moon_fabric', 'crystal_shard', 'battery_cell', 'arena_token', 'spray_core']) {
    runtimeDb.prepare('INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES (?, ?, 100)').run(id, material);
  }
}
function insertWalletRecoveryRequired(id) {
  runtimeDb.prepare(`
    INSERT INTO telegram_pet_reward_claims
      (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata)
    VALUES (?, NULL, ?, ?, ?, '2026-08-18', 'pending', '{}', '{}', ?)
  `).run(`recovery-required:${id}`, id, PET_ACCOUNT_WALLET_RECOVERY_REQUIRED_SOURCE, PET_ACCOUNT_WALLET_RECOVERY_REQUIRED_EVENT_KEY,
    JSON.stringify({ outcome: 'recovery_required', reason: 'missing_wallet_snapshot' }));
}
function insertWalletReconciled(id) {
  runtimeDb.prepare(`
    INSERT INTO telegram_pet_reward_claims
      (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata, awarded_at)
    VALUES (?, NULL, ?, ?, ?, '2026-08-18', 'awarded', '{}', '{}', ?, CURRENT_TIMESTAMP)
  `).run(`wallet-reconciled:${id}`, id, PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE, PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY,
    JSON.stringify({ outcome: 'reconciled' }));
}
function seedUnprovableHistoricalWalletClaim(id) {
  const metadata = '{}';
  runtimeDb.prepare(`
    INSERT INTO telegram_pet_reward_claims
      (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata, awarded_at)
    VALUES (?, ?, ?, 'pet_job', ?, '2026-08-10', 'awarded', ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(`legacy-wallet:${id}`, `legacy-pet:${id}`, id, `legacy-wallet:${id}`,
    JSON.stringify({ moon_gold: 7 }), JSON.stringify({ moon_gold: 7 }), metadata);
  runtimeDb.prepare(`
    INSERT INTO telegram_pet_events
      (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
    VALUES (?, ?, ?, 'work', ?, 0, 0, 'pet-s2026-003', '2026-08-10', '2026-W33', 'accepted', 'legacy_wallet_reward', ?)
  `).run(`legacy-wallet-event:${id}`, `legacy-pet:${id}`, id, `legacy-wallet:${id}`, metadata);
}
seedPlayer('live-1');
seedLiveProgression('live-1', {
  completed_regions_json: ['moon_alley', 'neon_rooftops', 'rugpull_mines', 'blockchain_sewers'],
});
seedMaterials('live-1');
for (let index = 0; index < 3; index += 1) runtimeDb.prepare('INSERT INTO telegram_pet_equipment_progression (telegram_id, item_key, slot, mastery_tier) VALUES (?, ?, ?, 5)').run('live-1', `mastered_${index}`, `slot_${index}`);
runtimeDb.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id, item_key, slot) VALUES ('live-1', 'hoverboard', 'toy')").run();

const reward = (request) => awardPetReward(d1, request);
seedPlayer('serialized-authority');
const serializedRawPet = { ...livePet('serialized-authority'), telegram_id: 'serialized-authority', pet_name: 'Tuple Cat' };
const serializedActivePet = serializePet(serializedRawPet);
assert.equal(serializedActivePet.telegram_id, 'serialized-authority', 'serialized active pet must preserve telegram_id authority');
assert.equal(serializedActivePet.pet_id, serializedRawPet.pet_id, 'serialized active pet must preserve pet_id authority');
assert.equal(serializedActivePet.season_key, serializedRawPet.season_key, 'serialized active pet must preserve season_key authority');
const serializedRuntime = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='serialized-authority'").get();
const serializedState = await buildPetLiveSystemsState(d1, 'serialized-authority', serializedActivePet, serializedRuntime, [], []);
assert.equal(serializedState.regions.find((region) => region.key === 'moon_alley').available, true,
  'live-system state must accept complete serialized pet authority');
const serializedDistrict = await processPetDistrictMission(d1, 'serialized-authority', 'moon_alley', serializedActivePet, serializedRuntime, reward, null);
assert.equal(serializedDistrict.accepted, true, 'district missions must settle with serialized pet authority');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='serialized-authority' AND pet_id=? AND season_key=?")
  .get(serializedActivePet.pet_id, serializedActivePet.season_key).count, 1,
  'serialized district settlement must write the complete pet authority tuple');
const missingSeasonDistrict = await processPetDistrictMission(d1, 'serialized-authority-missing', 'moon_alley',
  { ...serializedActivePet, telegram_id: 'serialized-authority-missing', season_key: null },
  {}, reward, null);
assert.equal(missingSeasonDistrict.reason, 'source_pet_authority_required',
  'missing serialized season authority must fail closed before district settlement');
const wrongSeasonDistrict = await processPetDistrictMission(d1, 'serialized-authority', 'moon_alley',
  { ...serializedActivePet, season_key: 'pet-s2099-999' }, serializedRuntime, reward, null);
assert.equal(wrongSeasonDistrict.reason, 'source_pet_authority_required',
  'invalid serialized season authority must fail closed before district settlement');
assert.equal(runtimeDb.prepare("SELECT energy FROM telegram_pet_profiles WHERE telegram_id='serialized-authority'").get().energy, 90,
  'invalid serialized authority must not spend Energy after the valid district action');
assert.equal(runtimeDb.prepare("SELECT energy FROM telegram_pet_instances WHERE pet_id=? AND telegram_id='serialized-authority' AND season_key=?")
  .get(serializedActivePet.pet_id, serializedActivePet.season_key).energy, 90,
  'serialized district Energy must debit the authoritative pet instance');

const runtimeState = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='live-1'").get();
const district = await processPetDistrictMission(d1, 'live-1', 'moon_alley', livePet('live-1'), runtimeState, reward, 'nomad-bears');
assert.equal(district.accepted, true);
assert.equal(district.choice.key, 'tactical', 'cached clients must retain the balanced guaranteed path');
assert.equal(district.outcome.success, true);
assert.equal(runtimeDb.prepare("SELECT energy FROM telegram_pet_profiles WHERE telegram_id='live-1'").get().energy, 90);
assert.equal(runtimeDb.prepare("SELECT energy FROM telegram_pet_instances WHERE pet_id=? AND telegram_id='live-1' AND season_key=?").get(livePet('live-1').pet_id, livePet('live-1').season_key).energy, 90,
  'district Energy must be charged on the authoritative pet instance');
const districtReplay = await processPetDistrictMission(d1, 'live-1', 'moon_alley', livePet('live-1', { energy: 90 }), runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='live-1'").get(), reward, 'nomad-bears');
assert.equal(districtReplay.duplicate, true);
assert.equal(runtimeDb.prepare("SELECT energy FROM telegram_pet_profiles WHERE telegram_id='live-1'").get().energy, 90);
runtimeDb.prepare("UPDATE telegram_pet_profiles SET energy=100 WHERE telegram_id='live-1'").run();
const livePetOneInstance = runtimeDb.prepare("SELECT * FROM telegram_pet_instances WHERE pet_id=? AND telegram_id='live-1' AND season_key=?").get(livePet('live-1').pet_id, livePet('live-1').season_key);
await mirrorActivePetInstanceToProfile(d1, livePetOneInstance);
assert.equal(runtimeDb.prepare("SELECT energy FROM telegram_pet_profiles WHERE telegram_id='live-1'").get().energy, 90,
  'profile compatibility reload must mirror the instance Energy instead of refunding it');

const usedState = await buildPetLiveSystemsState(d1, 'live-1', livePet('live-1'), runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='live-1'").get(), [], []);
assert.equal(usedState.regions.find((region) => region.key === 'moon_alley').used_today, true, 'completed daily districts must be disabled in refreshed state');
assert.equal(usedState.regions.find((region) => region.key === 'neon_rooftops').mission.choices.length, 3);
assert.ok(usedState.regions.find((region) => region.key === 'neon_rooftops').mission.complication?.key, 'daily district missions must include a deterministic authored complication');
assert.equal(usedState.chains[0].scene.choices.length, 2);
assert.equal(usedState.equipment_sets.length, 3, 'live state must expose persistent loadout set progress');

seedPlayer('equipped-only');
const equippedOnlyState = await buildPetLiveSystemsState(d1, 'equipped-only', livePet('equipped-only', { equipped_toy: 'hoverboard' }), runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='equipped-only'").get(), [], []);
const equippedOnlySet = equippedOnlyState.equipment_sets.find((set) => set.key === 'street_runner');
assert.deepEqual(equippedOnlySet.owned, ['hoverboard'], 'an equipped set piece must count as owned without a progression row');
assert.deepEqual(equippedOnlySet.missing, ['crown_jacket', 'lucky_charm']);

seedPlayer('lease-race');
const leaseRuntime = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='lease-race'").get();
let concurrentDistrict = null;
let triggerConcurrentDistrict = true;
const interleavedReward = async (request) => {
  if (triggerConcurrentDistrict) {
    triggerConcurrentDistrict = false;
    concurrentDistrict = await processPetDistrictMission(d1, 'lease-race', 'moon_alley', livePet('lease-race', { energy: 90 }), leaseRuntime, reward, 'nomad-bears');
  }
  return reward(request);
};
assert.equal((await processPetDistrictMission(d1, 'lease-race', 'moon_alley', livePet('lease-race'), leaseRuntime, interleavedReward, 'nomad-bears')).accepted, true);
assert.equal(concurrentDistrict.reason, 'district_busy', 'a concurrent request must not own an active settlement lease');
assert.equal(JSON.parse(runtimeDb.prepare("SELECT region_mastery_json FROM telegram_pet_live_progression_state WHERE pet_id=?").get(livePet('lease-race').pet_id).region_mastery_json).moon_alley, 25, 'one district reservation may advance progression only once');
assert.equal(runtimeDb.prepare("SELECT energy FROM telegram_pet_profiles WHERE telegram_id='lease-race'").get().energy, 90, 'one district reservation may charge Energy only once');

seedPlayer('district-interleave');
seedLiveProgression('district-interleave', { region_mastery_json: { moon_alley: 100 }, completed_regions_json: ['moon_alley'] });
const interleaveRuntime = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='district-interleave'").get();
let nestedDistrict = null;
let triggerNestedDistrict = true;
const crossDistrictReward = async (request) => {
  if (triggerNestedDistrict) {
    triggerNestedDistrict = false;
    nestedDistrict = await processPetDistrictMission(d1, 'district-interleave', 'neon_rooftops', livePet('district-interleave', { energy: 90 }), interleaveRuntime, reward, 'nomad-bears');
  }
  return reward(request);
};
assert.equal((await processPetDistrictMission(d1, 'district-interleave', 'moon_alley', livePet('district-interleave'), interleaveRuntime, crossDistrictReward, 'nomad-bears')).accepted, true);
assert.equal(nestedDistrict.accepted, true);
const interleavedMastery = JSON.parse(runtimeDb.prepare("SELECT region_mastery_json FROM telegram_pet_live_progression_state WHERE pet_id=?").get(livePet('district-interleave').pet_id).region_mastery_json);
assert.equal(interleavedMastery.moon_alley, 125);
assert.equal(interleavedMastery.neon_rooftops, 25, 'concurrent districts must preserve both JSON mastery updates');

seedPlayer('alias-state', { level: 14, pet_xp: 1300 });
runtimeDb.prepare("UPDATE blocktopia_progression SET faction='graff-punks' WHERE telegram_id='alias-state'").run();
const aliasRuntime = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='alias-state'").get();
const aliasState = await buildPetLiveSystemsState(d1, 'alias-state', livePet('alias-state', { level: 14, pet_xp: 1300 }), aliasRuntime, [{ item_key: 'test_gear', item_level: 1 }], [{ material_key: 'scrap_metal', quantity: 100 }]);
assert.equal(aliasState.faction.key, 'graffpunks', 'live state must serialize canonical faction keys');
assert.equal(aliasState.upgrades[0].unlocked, false);
assert.equal(aliasState.upgrades[0].affordable, false, 'Level 15 server gate must be reflected in upgrade availability');

const chain = await processPetEventChain(d1, 'live-1', 'lost_delivery_drone', reward, 'graffpunks', null, livePet('live-1'));
assert.equal(chain.accepted, true);
assert.ok(chain.choice.key);
assert.ok(chain.result_copy);
assert.equal((await processPetEventChain(d1, 'live-1', 'lost_delivery_drone', reward, 'graffpunks', null, livePet('live-1'))).duplicate, true);

seedPlayer('live-switch');
const switchPetA = livePet('live-switch');
const switchPetB = { ...livePet('live-switch', { season_key: 'pet-s2026-004', slot_number: 1 }), pet_id: 'pet:live-switch:pet-s2026-004:1' };
runtimeDb.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
  VALUES (?, 'live-switch', ?, 1, 'free', 'switch-fixture', 0, 'active')`).run(switchPetB.pet_id, switchPetB.season_key);
runtimeDb.prepare(`INSERT INTO telegram_pet_instances
  (pet_id, telegram_id, season_key, slot_number, pet_xp, level, energy, source_profile_updated_at, status)
  VALUES (?, 'live-switch', ?, 1, 0, 1, 100, 'switch-fixture', 'active')`).run(switchPetB.pet_id, switchPetB.season_key);
const switchRuntime = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='live-switch'").get();
const switchDistrict = await processPetDistrictMission(d1, 'live-switch', 'moon_alley', switchPetA, switchRuntime, reward, null);
assert.equal(switchDistrict.accepted, true, 'Pet A can start and settle a live district mission');
runtimeDb.prepare("UPDATE telegram_pet_active_slots SET pet_id=?, season_key=? WHERE telegram_id='live-switch'").run(switchPetB.pet_id, switchPetB.season_key);
assert.equal((await processPetDistrictMission(d1, 'live-switch', 'moon_alley', switchPetA, switchRuntime, reward, null)).duplicate, true,
  'active Pet B from another season cannot redirect Pet A district replay');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='live-switch' AND pet_id=?").get(switchPetA.pet_id).count, 1,
  'live district Pet XP evidence stays on Pet A');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='live-switch' AND pet_id=?").get(switchPetB.pet_id).count, 0,
  'Pet B receives no pet-owned evidence from Pet A replay');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_live_progression_state WHERE pet_id=? AND json_extract(region_mastery_json, '$.moon_alley') > 0").get(switchPetA.pet_id).count, 1,
  'Pet A owns district mastery progress');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_live_progression_state WHERE pet_id=?").get(switchPetB.pet_id).count, 0,
  'Pet B in another season does not inherit Pet A live progression state');

seedPlayer('live-migration');
const migratedPetA = livePet('live-migration');
const migratedPetB = { ...livePet('live-migration', { season_key: 'pet-s2026-004', slot_number: 1 }), pet_id: 'pet:live-migration:pet-s2026-004:1' };
seedLiveProgression('live-migration', {
  region_mastery_json: { moon_alley: 100 },
  completed_regions_json: ['moon_alley'],
  prestige_count: 2,
});
runtimeDb.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
  VALUES (?, 'live-migration', ?, 1, 'free', 'migration-fixture', 0, 'active')`).run(migratedPetB.pet_id, migratedPetB.season_key);
runtimeDb.prepare(`INSERT INTO telegram_pet_instances
  (pet_id, telegram_id, season_key, slot_number, pet_xp, level, energy, source_profile_updated_at, status)
  VALUES (?, 'live-migration', ?, 1, 0, 1, 100, 'migration-fixture', 'active')`).run(migratedPetB.pet_id, migratedPetB.season_key);
runtimeDb.prepare("UPDATE telegram_pet_active_slots SET pet_id=?, season_key=? WHERE telegram_id='live-migration'").run(migratedPetB.pet_id, migratedPetB.season_key);
const migrationRuntime = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='live-migration'").get();
const petBState = await buildPetLiveSystemsState(d1, 'live-migration', migratedPetB, migrationRuntime, [], []);
assert.equal(petBState.regions.find((region) => region.key === 'moon_alley').mastery_xp, 0,
  'new pet live progression must start empty instead of lazily inheriting legacy mastery');
assert.equal(petBState.prestige.count, 0,
  'new pet live progression must start with zero prestige');
const petAState = await buildPetLiveSystemsState(d1, 'live-migration', migratedPetA, migrationRuntime, [], []);
assert.equal(petAState.regions.find((region) => region.key === 'moon_alley').mastery_xp, 100,
  'migration-designated pet must retain migrated mastery');
assert.equal(petAState.prestige.count, 2,
  'migration-designated pet must retain migrated prestige');

seedPlayer('chain-recovery');
let chainFailure = true;
const recoverableReward = async (request) => { if (chainFailure) { chainFailure = false; throw new Error('simulated interruption'); } return awardPetReward(d1, request); };
await assert.rejects(() => processPetEventChain(d1, 'chain-recovery', 'signal_hijack', recoverableReward, 'graffpunks', null, livePet('chain-recovery')), /simulated interruption/);
assert.equal((await processPetEventChain(d1, 'chain-recovery', 'signal_hijack', recoverableReward, 'graffpunks', null, livePet('chain-recovery'))).accepted, true, 'a settling chain must recover after reward interruption');

const goldBeforeUpgrade = runtimeDb.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='live-1'").get().moon_gold;
assert.equal((await processPetEquipmentUpgrade(d1, 'live-1', 'hoverboard', 'request-upgrade-1')).accepted, true);
assert.equal(runtimeDb.prepare("SELECT item_level FROM telegram_pet_equipment_progression WHERE telegram_id='live-1' AND item_key='hoverboard'").get().item_level, 2);
assert.equal((await processPetEquipmentUpgrade(d1, 'live-1', 'hoverboard', 'request-upgrade-1')).duplicate, true);
assert.equal(runtimeDb.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='live-1'").get().moon_gold, goldBeforeUpgrade - 80);

seedPlayer('live-upgrade-first-recovery');
seedMaterials('live-upgrade-first-recovery');
runtimeDb.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id, item_key, slot) VALUES ('live-upgrade-first-recovery', 'hoverboard', 'toy')").run();
seedUnprovableHistoricalWalletClaim('live-upgrade-first-recovery');
const firstRecoveryUpgrade = await processPetEquipmentUpgrade(d1, 'live-upgrade-first-recovery', 'hoverboard', 'request-upgrade-first-recovery');
assert.equal(firstRecoveryUpgrade.accepted, false, 'first wallet action after deployment must reconcile before spend');
assert.equal(firstRecoveryUpgrade.reason, 'wallet_reconciliation_recovery_pending');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='live-upgrade-first-recovery' AND source=? AND idempotency_key=? AND status='pending'").get(PET_ACCOUNT_WALLET_RECOVERY_REQUIRED_SOURCE, PET_ACCOUNT_WALLET_RECOVERY_REQUIRED_EVENT_KEY).count, 1,
  'first wallet action must create the private retryable recovery-required marker when historical snapshots are missing');
assert.equal(runtimeDb.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='live-upgrade-first-recovery'").get().moon_gold, 10000,
  'first recovery-gated wallet action must not debit the account wallet');
assert.equal(runtimeDb.prepare("SELECT item_level FROM telegram_pet_equipment_progression WHERE telegram_id='live-upgrade-first-recovery' AND item_key='hoverboard'").get().item_level, 1,
  'first recovery-gated wallet action must not mutate gear state');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_system_events WHERE telegram_id='live-upgrade-first-recovery' AND action_key='hoverboard'").get().count, 0,
  'first recovery-gated wallet action must not reserve a system event');

seedPlayer('live-upgrade-recovery-freeze');
seedMaterials('live-upgrade-recovery-freeze');
runtimeDb.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id, item_key, slot) VALUES ('live-upgrade-recovery-freeze', 'hoverboard', 'toy')").run();
insertWalletRecoveryRequired('live-upgrade-recovery-freeze');
const frozenLiveUpgrade = await processPetEquipmentUpgrade(d1, 'live-upgrade-recovery-freeze', 'hoverboard', 'request-upgrade-recovery-freeze');
assert.equal(frozenLiveUpgrade.accepted, false, 'pending historical recovery must freeze live equipment wallet spends');
assert.equal(frozenLiveUpgrade.reason, 'wallet_reconciliation_recovery_pending');
assert.equal(runtimeDb.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='live-upgrade-recovery-freeze'").get().moon_gold, 10000,
  'frozen live equipment spend must not debit the account wallet');
assert.equal(runtimeDb.prepare("SELECT item_level FROM telegram_pet_equipment_progression WHERE telegram_id='live-upgrade-recovery-freeze' AND item_key='hoverboard'").get().item_level, 1,
  'frozen live equipment spend must not upgrade gear');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_system_events WHERE telegram_id='live-upgrade-recovery-freeze' AND action_key='hoverboard'").get().count, 0,
  'frozen live equipment spend must not reserve a system event');
insertWalletReconciled('live-upgrade-recovery-freeze');
const thawedLiveUpgrade = await processPetEquipmentUpgrade(d1, 'live-upgrade-recovery-freeze', 'hoverboard', 'request-upgrade-recovery-freeze');
assert.equal(thawedLiveUpgrade.accepted, true, 'backfilled reconciliation proof must thaw live equipment wallet spends');
assert.equal(runtimeDb.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='live-upgrade-recovery-freeze'").get().moon_gold, 9920,
  'thawed live equipment spend must debit once after recovery');

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

runtimeDb.prepare("INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity) VALUES ('live-1', 'item', 'clean_wipe', 1000005)").run();
const fabricBeforeFullCraft = runtimeDb.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id='live-1' AND material_key='moon_fabric'").get().quantity;
const fullCraft = await processPetCraftRecipe(d1, 'live-1', 'clean_kit', 'request-craft-full');
assert.equal(fullCraft.reason, 'crafting_inventory_full');
assert.equal(runtimeDb.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id='live-1' AND asset_type='item' AND asset_key='clean_wipe'").get().quantity, 1000005, 'crafting must never lower a legacy balance above the canonical cap');
assert.equal(runtimeDb.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id='live-1' AND material_key='moon_fabric'").get().quantity, fabricBeforeFullCraft, 'a full output stack must not consume materials');

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

seedPlayer('live-cosmetic-recovery-freeze');
insertWalletRecoveryRequired('live-cosmetic-recovery-freeze');
const frozenLiveCosmetic = await processPetCosmeticUnlock(d1, 'live-cosmetic-recovery-freeze', 'profile_frame', 'request-cosmetic-recovery-freeze');
assert.equal(frozenLiveCosmetic.accepted, false, 'pending historical recovery must freeze live cosmetic wallet spends');
assert.equal(frozenLiveCosmetic.reason, 'wallet_reconciliation_recovery_pending');
assert.deepEqual(
  { ...runtimeDb.prepare("SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id='live-cosmetic-recovery-freeze'").get() },
  { moon_gold: 10000, moon_crystals: 100, style_tokens: 500 },
  'frozen live cosmetic spend must not debit account wallet currencies',
);
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_cosmetic_unlocks WHERE telegram_id='live-cosmetic-recovery-freeze'").get().count, 0,
  'frozen live cosmetic spend must not unlock cosmetics');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_system_events WHERE telegram_id='live-cosmetic-recovery-freeze' AND system_key='cosmetic'").get().count, 0,
  'frozen live cosmetic spend must not reserve a system event');
insertWalletReconciled('live-cosmetic-recovery-freeze');
const thawedLiveCosmetic = await processPetCosmeticUnlock(d1, 'live-cosmetic-recovery-freeze', 'profile_frame', 'request-cosmetic-recovery-freeze');
assert.equal(thawedLiveCosmetic.accepted, true, 'backfilled reconciliation proof must thaw live cosmetic wallet spends');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_cosmetic_unlocks WHERE telegram_id='live-cosmetic-recovery-freeze' AND cosmetic_key='profile_frame'").get().count, 1,
  'thawed live cosmetic spend must unlock once after recovery');

const renameBefore = runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_cosmetic_unlocks WHERE telegram_id='live-1' AND cosmetic_key='rename_badge'").get().count;
d1.afterReservation = () => { d1.afterReservation = null; runtimeDb.prepare("UPDATE telegram_pet_profiles SET style_tokens=0 WHERE telegram_id='live-1'").run(); };
assert.equal((await processPetCosmeticUnlock(d1, 'live-1', 'rename_badge', 'request-cosmetic-race')).accepted, false);
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_cosmetic_unlocks WHERE telegram_id='live-1' AND cosmetic_key='rename_badge'").get().count, renameBefore, 'stale cosmetic affordability must not grant an unlock');

const liveState = { prestige: { ready: true, count: 0 } };
const prestige = await processPetPrestige(d1, 'live-1', liveState, 'request-prestige-1', livePet('live-1'));
assert.equal(prestige.accepted, true);
assert.equal((await processPetPrestige(d1, 'live-1', { prestige: { ready: false, count: 1 } }, 'request-prestige-1', livePet('live-1'))).duplicate, true);
assert.equal(runtimeDb.prepare("SELECT prestige_count FROM telegram_pet_live_progression_state WHERE pet_id=? AND telegram_id='live-1' AND season_key=?").get(livePet('live-1').pet_id, livePet('live-1').season_key).prestige_count, 1);
assert.equal(runtimeDb.prepare("SELECT prestige_count FROM telegram_pet_progression_state WHERE telegram_id='live-1'").get().prestige_count, 0,
  'legacy progression table must not own current prestige writes');

seedPlayer('prestige-race');
seedLiveProgression('prestige-race', {
  completed_regions_json: ['moon_alley', 'neon_rooftops', 'rugpull_mines', 'blockchain_sewers'],
});
for (let index = 0; index < 3; index += 1) runtimeDb.prepare('INSERT INTO telegram_pet_equipment_progression (telegram_id, item_key, slot, mastery_tier) VALUES (?, ?, ?, 5)').run('prestige-race', `race_mastered_${index}`, `slot_${index}`);
d1.afterReservation = () => { d1.afterReservation = null; runtimeDb.prepare("UPDATE telegram_pet_profiles SET moon_gold=0 WHERE telegram_id='prestige-race'").run(); };
assert.equal((await processPetPrestige(d1, 'prestige-race', { prestige: { ready: true, count: 0 } }, 'request-prestige-race', livePet('prestige-race'))).accepted, false);
assert.equal(runtimeDb.prepare("SELECT prestige_count FROM telegram_pet_live_progression_state WHERE pet_id=? AND telegram_id='prestige-race' AND season_key=?").get(livePet('prestige-race').pet_id, livePet('prestige-race').season_key).prestige_count, 0, 'stale prestige affordability must not grant rank');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_material_balances WHERE telegram_id='prestige-race' AND material_key='mastery_token'").get().count, 0);

seedPlayer('energy-retry', { energy: 0 });
const tiredRuntime = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='energy-retry'").get();
assert.equal((await processPetDistrictMission(d1, 'energy-retry', 'moon_alley', livePet('energy-retry'), tiredRuntime, reward, null)).reason, 'pet_tired');
runtimeDb.prepare("UPDATE telegram_pet_profiles SET energy=100 WHERE telegram_id='energy-retry'").run();
runtimeDb.prepare("UPDATE telegram_pet_instances SET energy=100 WHERE pet_id=? AND telegram_id='energy-retry' AND season_key=?").run(livePet('energy-retry').pet_id, livePet('energy-retry').season_key);
assert.equal((await processPetDistrictMission(d1, 'energy-retry', 'moon_alley', livePet('energy-retry'), tiredRuntime, reward, null)).accepted, true, 'rejected Energy reservations must be safely retryable');

seedPlayer('invalid-district-choice');
const invalidDistrictRuntime = runtimeDb.prepare("SELECT * FROM telegram_pet_progression_state WHERE telegram_id='invalid-district-choice'").get();
const invalidDistrict = await processPetDistrictMission(d1, 'invalid-district-choice', 'moon_alley', livePet('invalid-district-choice'), invalidDistrictRuntime, reward, null, 'not_a_real_approach');
assert.equal(invalidDistrict.reason, 'district_approach_invalid');
assert.equal(runtimeDb.prepare("SELECT energy FROM telegram_pet_profiles WHERE telegram_id='invalid-district-choice'").get().energy, 100, 'invalid district choices must be rejected before Energy settlement');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_system_events WHERE telegram_id='invalid-district-choice'").get().count, 0);

seedPlayer('invalid-story-choice');
const invalidStory = await processPetEventChain(d1, 'invalid-story-choice', 'lost_delivery_drone', reward, null, 'not_a_real_choice', livePet('invalid-story-choice'));
assert.equal(invalidStory.reason, 'event_chain_choice_invalid');
assert.equal(runtimeDb.prepare("SELECT COUNT(*) AS count FROM telegram_pet_system_events WHERE telegram_id='invalid-story-choice'").get().count, 0);

let checkpointSetback = null;
for (let index = 0; index < 64 && !checkpointSetback; index += 1) {
  const telegramId = `checkpoint-setback-${index}`;
  seedPlayer(telegramId);
  seedLiveProgression(telegramId, { region_mastery_json: { moon_alley: 90 } });
  const checkpointRuntime = runtimeDb.prepare('SELECT * FROM telegram_pet_progression_state WHERE telegram_id=?').get(telegramId);
  const checkpointState = await buildPetLiveSystemsState(d1, telegramId, livePet(telegramId), checkpointRuntime, [], []);
  assert.equal(checkpointState.regions.find((region) => region.key === 'moon_alley').mission.boss, true, 'a possible 100-mastery crossing must present the district boss');
  const result = await processPetDistrictMission(d1, telegramId, 'moon_alley', livePet(telegramId), checkpointRuntime, reward, null, 'bold');
  if (!result.outcome.success) checkpointSetback = { telegramId, result };
}
assert.ok(checkpointSetback, 'deterministic district coverage must include a setback');
assert.equal(checkpointSetback.result.reason, 'district_mission_setback');
assert.ok(checkpointSetback.result.region.mastery_xp < 100, 'a setback must not cross a mastery checkpoint');
const checkpointProgress = runtimeDb.prepare('SELECT region_mastery_json, completed_regions_json FROM telegram_pet_live_progression_state WHERE pet_id=? AND telegram_id=?')
  .get(livePet(checkpointSetback.telegramId).pet_id, checkpointSetback.telegramId);
assert.ok(JSON.parse(checkpointProgress.region_mastery_json).moon_alley < 100);
assert.equal(JSON.parse(checkpointProgress.completed_regions_json).includes('moon_alley'), false, 'a setback must not unlock the next district');

const boss = getActiveSeasonalBoss();
seedPlayer('serialized-boss');
const serializedBossPet = serializePet({ ...livePet('serialized-boss'), telegram_id: 'serialized-boss', pet_name: 'Boss Tuple' });
runtimeDb.prepare('INSERT INTO telegram_pet_seasonal_boss_progress (pet_id, telegram_id, pet_season_key, season_key, boss_key, damage) VALUES (?, ?, ?, ?, ?, ?)')
  .run(serializedBossPet.pet_id, 'serialized-boss', serializedBossPet.season_key, boss.season_instance, boss.key, boss.hp - 1);
const serializedBossResult = await processPetSeasonalBoss(d1, 'serialized-boss', serializedBossPet, reward);
assert.equal(serializedBossResult.progress.defeated, true, 'seasonal boss must settle with serialized pet authority');
assert.ok(runtimeDb.prepare('SELECT reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE pet_id=? AND telegram_id=? AND pet_season_key=? AND season_key=? AND boss_key=?')
  .get(serializedBossPet.pet_id, 'serialized-boss', serializedBossPet.season_key, boss.season_instance, boss.key).reward_claimed_at,
  'serialized boss settlement must write the complete pet authority tuple');
assert.equal((await processPetSeasonalBoss(d1, 'serialized-boss', { ...serializedBossPet, season_key: '' }, reward)).reason, 'source_pet_authority_required',
  'missing serialized season authority must fail closed before boss settlement');
assert.equal((await processPetSeasonalBoss(d1, 'serialized-boss', { ...serializedBossPet, season_key: 'pet-s2099-999' }, reward)).reason, 'source_pet_authority_required',
  'invalid serialized season authority must fail closed before boss settlement');

seedPlayer('boss-authority');
const bossPetA = livePet('boss-authority');
const bossPetB = { ...livePet('boss-authority'), pet_id: 'pet:boss-authority:pet-s2026-003:2', slot_number: 2 };
runtimeDb.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
  VALUES (?, 'boss-authority', 'pet-s2026-003', 2, 'free', 'boss-authority-fixture', 0, 'active')`).run(bossPetB.pet_id);
runtimeDb.prepare(`INSERT INTO telegram_pet_instances
  (pet_id, telegram_id, season_key, slot_number, pet_xp, level, energy, source_profile_updated_at, status)
  VALUES (?, 'boss-authority', 'pet-s2026-003', 2, 0, 1, 100, 'boss-authority-fixture', 'active')`).run(bossPetB.pet_id);
runtimeDb.prepare('INSERT INTO telegram_pet_seasonal_boss_progress (pet_id, telegram_id, pet_season_key, season_key, boss_key, damage, defeated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)')
  .run(bossPetA.pet_id, 'boss-authority', bossPetA.season_key, boss.season_instance, boss.key, boss.hp);
const petBClaim = await awardPetReward(d1, {
  telegram_id: 'boss-authority',
  pet_id: bossPetB.pet_id,
  season_key: bossPetB.season_key,
  source: 'pet_seasonal_boss',
  idempotency_key: `pet-b-claim:${boss.season_instance}`,
  event_key: `pet-b-claim:${boss.season_instance}`,
  rewards: { pet_xp: 1 },
  context: { pet_id: bossPetB.pet_id, pet_season_key: bossPetB.season_key, season_key: boss.season_instance, boss_key: boss.key },
});
assert.equal(petBClaim.reason, 'reward_not_authorized', 'Pet B cannot claim Pet A seasonal boss defeat');
const missingAuthorityClaim = await awardPetReward(d1, {
  telegram_id: 'boss-authority',
  source: 'pet_seasonal_boss',
  idempotency_key: `missing-pet-claim:${boss.season_instance}`,
  event_key: `missing-pet-claim:${boss.season_instance}`,
  rewards: { pet_xp: 1 },
  context: { season_key: boss.season_instance, boss_key: boss.key },
});
assert.equal(missingAuthorityClaim.reason, 'reward_not_authorized',
  'modern seasonal boss rows cannot be claimed through missing pet authority');
await assert.rejects(() => awardPetReward(d1, {
  telegram_id: 'boss-authority',
  pet_id: bossPetA.pet_id,
  season_key: bossPetA.season_key,
  source: 'pet_seasonal_boss',
  idempotency_key: `partial-pet-claim:${boss.season_instance}`,
  rewards: { pet_xp: 1 },
  context: { pet_id: bossPetA.pet_id, season_key: boss.season_instance, boss_key: boss.key },
}), /invalid_pet_reward_context/, 'partial seasonal boss pet authority must fail closed');

seedPlayer('legacy-boss-authority');
runtimeDb.prepare("INSERT INTO telegram_pet_seasonal_boss_progress (pet_id, telegram_id, pet_season_key, season_key, boss_key, damage, defeated_at) VALUES ('', ?, '', ?, ?, ?, CURRENT_TIMESTAMP)")
  .run('legacy-boss-authority', boss.season_instance, boss.key, boss.hp);
const legacyBossClaim = await awardPetReward(d1, {
  telegram_id: 'legacy-boss-authority',
  source: 'pet_seasonal_boss',
  idempotency_key: `legacy-boss:${boss.season_instance}`,
  event_key: `legacy-boss:${boss.season_instance}`,
  rewards: { pet_xp: 1 },
  context: { season_key: boss.season_instance, boss_key: boss.key },
});
assert.equal(legacyBossClaim.accepted, true, 'legacy empty-tuple seasonal boss authorization remains compatible');

seedPlayer('boss-1');
runtimeDb.prepare('INSERT INTO telegram_pet_seasonal_boss_progress (pet_id, telegram_id, pet_season_key, season_key, boss_key, damage) VALUES (?, ?, ?, ?, ?, ?)')
  .run(livePet('boss-1').pet_id, 'boss-1', livePet('boss-1').season_key, boss.season_instance, boss.key, boss.hp - 1);
const bossResult = await processPetSeasonalBoss(d1, 'boss-1', livePet('boss-1'), reward);
assert.equal(bossResult.progress.defeated, true);
assert.ok(runtimeDb.prepare('SELECT reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE pet_id=? AND telegram_id=? AND pet_season_key=? AND season_key=? AND boss_key=?')
  .get(livePet('boss-1').pet_id, 'boss-1', livePet('boss-1').season_key, boss.season_instance, boss.key).reward_claimed_at);

seedPlayer('boss-recovery');
runtimeDb.prepare('INSERT INTO telegram_pet_seasonal_boss_progress (pet_id, telegram_id, pet_season_key, season_key, boss_key, damage, defeated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)')
  .run(livePet('boss-recovery').pet_id, 'boss-recovery', livePet('boss-recovery').season_key, boss.season_instance, boss.key, boss.hp);
const recovered = await processPetSeasonalBoss(d1, 'boss-recovery', livePet('boss-recovery'), reward);
assert.equal(recovered.reason, 'seasonal_boss_reward_recovered');
assert.ok(runtimeDb.prepare('SELECT reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE pet_id=? AND telegram_id=? AND pet_season_key=? AND season_key=? AND boss_key=?')
  .get(livePet('boss-recovery').pet_id, 'boss-recovery', livePet('boss-recovery').season_key, boss.season_instance, boss.key).reward_claimed_at);

assert.match(workerSource, /body\.approach_key/);
assert.match(workerSource, /body\.choice_key/);
assert.match(clientSource, /class="district-mission"/);
assert.match(clientSource, /class="story-scene"/);
console.log('telegram-pets-live-systems.test.mjs passed');
