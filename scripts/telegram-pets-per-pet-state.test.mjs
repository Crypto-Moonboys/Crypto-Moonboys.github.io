import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';
import {
  applyPetRuntimeAward,
  getOrCreatePetRuntimeState,
} from '../workers/moonboys-api/pets/runtime-phase-5a.js';

class SqliteD1Statement {
  constructor(database, sql, bindings = []) { this.database = database; this.sql = sql; this.bindings = bindings; }
  bind(...bindings) { return new SqliteD1Statement(this.database, this.sql, bindings); }
  async first() { return this.database.prepare(this.sql).get(...this.bindings) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.bindings) }; }
  async run() {
    if (/\bRETURNING\b/i.test(this.sql)) {
      const results = this.database.prepare(this.sql).all(...this.bindings);
      const changes = this.database.prepare('SELECT changes() AS changes').get().changes;
      return { results, meta: { changes } };
    }
    const result = this.database.prepare(this.sql).run(...this.bindings);
    return { meta: { changes: result.changes } };
  }
}

class SqliteD1 {
  constructor(database) { this.database = database; }
  prepare(sql) { return new SqliteD1Statement(this.database, sql); }
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
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

const migration055 = await readFile(new URL('../workers/moonboys-api/migrations/055_telegram_pet_season_slots.sql', import.meta.url), 'utf8');
const migration056 = await readFile(new URL('../workers/moonboys-api/migrations/056_telegram_pet_instance_state.sql', import.meta.url), 'utf8');
const migration053 = await readFile(new URL('../workers/moonboys-api/migrations/053_telegram_pet_species_lifecycle.sql', import.meta.url), 'utf8');
const migration057 = await readFile(new URL('../workers/moonboys-api/migrations/057_telegram_pet_lifecycle_pet_id.sql', import.meta.url), 'utf8');
const migration039 = await readFile(new URL('../workers/moonboys-api/migrations/039_telegram_pet_runtime_progression.sql', import.meta.url), 'utf8');
const migration073 = await readFile(new URL('../workers/moonboys-api/migrations/073_moonpet_per_pet_specialist_progression.sql', import.meta.url), 'utf8');
const worker = await readFile(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const rogueliteFoundation = await readFile(new URL('../workers/moonboys-api/pets/roguelite-foundation.js', import.meta.url), 'utf8');
const walletReconciliation = await readFile(new URL('../workers/moonboys-api/pets/wallet-reconciliation.js', import.meta.url), 'utf8');

assert.doesNotMatch(migration056, /CREATE\s+TRIGGER/i, 'migration 056 must not rely on trigger DDL');
assert.match(
  migration056,
  /CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_pet_owner_tuple\s+ON telegram_pet_season_slots\(pet_id, telegram_id, season_key, slot_number\)/,
  'migration 056 must provide a unique parent key for the complete pet ownership tuple',
);
const atomicDecaySource = worker.slice(worker.indexOf('async function getPetProfileWithAtomicDecay'), worker.indexOf('async function getPetInstanceWithAtomicDecay'));
assert.equal(
  (atomicDecaySource.match(/reconcilePetInstanceWalletToProfile/g) || []).length,
  0,
  'getPetProfileWithAtomicDecay must rely on getPetProfile reconciliation and not repeat the wallet hot-path batch',
);
assert.equal((worker.match(/async function reconcilePetInstanceWalletToProfile/g) || []).length, 0,
  'worker.js must import the shared wallet reconciliation helper instead of duplicating it');
assert.equal((rogueliteFoundation.match(/async function reconcilePetInstanceWalletToProfile/g) || []).length, 0,
  'roguelite-foundation.js must import the shared wallet reconciliation helper instead of duplicating it');
assert.match(walletReconciliation, /source = \? AND idempotency_key = \?/,
  'wallet reconciliation marker must stay in private reward claims, not public pet events');
assert.doesNotMatch(walletReconciliation, /current_moon_gold|current_moon_crystals|current_style_tokens|replayMissingSnapshotRowsFromTerminal/i,
  'wallet reconciliation must not infer capped wallet history from current terminal instance balances');
assert.match(walletReconciliation, /wallet_reconciliation_recovery_required/,
  'wallet reconciliation must privately mark unprovable legacy history as recovery-required without committing the success marker');
assert.match(walletReconciliation, /WHERE e\.telegram_id = c\.telegram_id\s+AND e\.pet_id = c\.pet_id\s+AND e\.status = 'accepted'\s+AND e\.metadata = c\.metadata/,
  'wallet reconciliation must prove historical pet-id wallet transitions from accepted event evidence');
assert.match(walletReconciliation, /accepted_pet_id_reward_claim_ledger/,
  'wallet reconciliation must remain ledger-derived, not profile-baseline-derived');
assert.doesNotMatch(walletReconciliation, /i\.moon_gold - telegram_pet_profiles\.moon_gold|i\.moon_crystals - telegram_pet_profiles\.moon_crystals|i\.style_tokens - telegram_pet_profiles\.style_tokens/,
  'wallet reconciliation must not derive deltas from current instance wallet minus current profile wallet');
const savePetProfileSource = worker.slice(worker.indexOf('async function savePetProfile'), worker.indexOf('async function getPetWindowTotals'));
assert.doesNotMatch(savePetProfileSource, /\bmoon_gold\s*=|\bmoon_crystals\s*=|\bstyle_tokens\s*=/,
  'savePetProfile must not write account-wallet columns from stale whole-profile snapshots');
assert.match(worker, /PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY[\s\S]*accountWalletRecoveryResolvedSql[\s\S]*reconcilePetInstanceWalletToProfile/,
  'worker must import the shared wallet reconciliation event key and recovery predicate');
assert.match(walletReconciliation, /export function accountWalletRecoveryResolvedSql[\s\S]*PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE[\s\S]*PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY/,
  'wallet module must own the shared recovery marker source/key SQL');
assert.match(worker, /e\.event_key <> \?/,
  'activity feed must bind the shared wallet reconciliation marker key instead of duplicating the literal');
const weeklyBossStart = worker.indexOf('async function processPetWeeklyBoss');
const weeklyBossEnd = worker.indexOf('async function getPetSeasonRewardState', weeklyBossStart);
const weeklyBoss = worker.slice(weeklyBossStart, weeklyBossEnd);
assert.notEqual(weeklyBoss.indexOf('await mirrorPetProfileToActiveInstance(db, telegramId)'), -1, 'weekly boss must explicitly sync its profile-only mutation');
assert.ok(
  weeklyBoss.indexOf('await mirrorPetProfileToActiveInstance(db, telegramId)') < weeklyBoss.lastIndexOf('pet: await getPetProfile(db, telegramId)'),
  'weekly boss must sync its direct profile Energy deduction to the active instance before returning pet state',
);
assert.match(worker, /if \(result\.accepted && !result\.duplicate\) result\.lifecycle = await syncMoonpetLifecycleStage\(db, telegramId, next\.stage\);/, 'runtime evolve handling must only sync lifecycle on a newly unlocked evolution');
assert.match(worker, /if \(result\.accepted && !result\.duplicate\) \{\s+const identity = await getMoonpetIdentitySummary\(env\.DB, telegramId\)\.catch\(\(\) => null\);\s+result\.lifecycle = await syncMoonpetLifecycleStage\(env\.DB, telegramId, identity\?\.current_stage\?\.stage \|\| 0\);\s+\}/, 'API evolve handling must not advance lifecycle for duplicate owner-level evolution unlocks');
assert.match(worker, /if \(!result\.duplicate\) await syncMoonpetLifecycleStage\(db, telegramId, next\.stage\);/, 'command evolve handling must not advance lifecycle for duplicate owner-level evolution unlocks');
const rosterSummarySource = worker.slice(
  worker.indexOf('async function buildPetSeasonSlotSummary'),
  worker.indexOf('async function buyPetSeasonSlot'),
);
assert.doesNotMatch(rosterSummarySource, /mirrorActivePetInstanceToProfile|mirror_profile/, 'read-only roster construction must have no compatibility-profile mirror path');
assert.doesNotMatch(rosterSummarySource, /(?:INSERT|UPDATE|DELETE)\s/i, 'read-only roster construction must contain no database mutation');
assert.doesNotMatch(rosterSummarySource, /ensurePetStarterSeasonSlot|getOrCreateArcadeProgressionState|getPetInstanceWithAtomicDecay/, 'roster construction must not call helpers with hidden writes');
assert.doesNotMatch(rosterSummarySource, /\.\.\.current/, 'roster construction must not spread pet-instance state over season-slot authority');
assert.match(rosterSummarySource, /mergePetInstanceDisplayFields\(row, applyPetDecay\(\{ \.\.\.row \}, now\)\)/, 'roster construction must merge only an in-memory decay preview through the explicit pet display allowlist');
const miniAppStateSource = worker.slice(worker.indexOf('async function buildPetMiniAppState'), worker.indexOf('async function processPetMiniAppAction'));
assert.ok(
  miniAppStateSource.indexOf('await preparePetMiniAppState(db, telegramId)') < miniAppStateSource.indexOf('buildPetSeasonSlotSummary(db, telegramId)'),
  'normal Mini App state flow must bootstrap the current season before building the read-only roster projection',
);
const prepareMiniAppStateSource = worker.slice(worker.indexOf('async function preparePetMiniAppState'), worker.indexOf('const PET_SEASON_EXTRA_SLOT_COSTS'));
const pendingWorkSource = worker.slice(worker.indexOf('async function getPetActiveSlotPendingWork'), worker.indexOf('async function ensurePetStarterSeasonSlot'));
const switchActivePetSource = worker.slice(worker.indexOf('async function switchActivePetSeasonSlot'), worker.indexOf('async function getOrCreatePetProfile'));
assert.match(worker, /async function getPetActiveSlotPendingWork/, 'pending active-slot guard helper must exist');
assert.match(prepareMiniAppStateSource, /await getPetActiveSlotPendingWork\(db, owner, now\)/, 'automatic season rollover must use the shared pending-work guard before advancing the active pointer');
assert.match(switchActivePetSource, /await getPetActiveSlotPendingWork\(db, owner, options\.now \|\| new Date\(\)\)/, 'explicit pet switching must use the same pending-work guard helper');
assert.match(pendingWorkSource, /telegram_pet_kaiju_matches WHERE \(player1_telegram_id=\? OR player2_telegram_id=\?\)/,
  'active pet switching must guard Kaiju pending work through participant columns');
assert.doesNotMatch(pendingWorkSource, /telegram_pet_kaiju_matches WHERE telegram_id=\?/,
  'active pet switching must not query the nonexistent Kaiju telegram_id column');
assert.match(
  migration057,
  /CREATE TABLE IF NOT EXISTS telegram_pet_evolutions_by_pet/,
  'migration 057 must create per-pet evolution storage',
);
assert.match(
  migration057,
  /PRIMARY KEY \(pet_id, evolution_id\)[\s\S]*UNIQUE \(pet_id, stage\)[\s\S]*UNIQUE \(pet_id, unlock_event_key\)/,
  'migration 057 must enforce per-pet evolution uniqueness',
);
assert.match(
  migration057,
  /INSERT OR IGNORE INTO telegram_pet_evolutions_by_pet[\s\S]*FROM telegram_pet_evolutions e[\s\S]*JOIN telegram_pet_season_slots s ON s\.telegram_id=e\.telegram_id AND s\.slot_number=1/,
  'migration 057 must backfill starter-slot evolution rows from the legacy owner table',
);
assert.match(
  migration056,
  /FOREIGN KEY \(pet_id, telegram_id, season_key, slot_number\)\s+REFERENCES telegram_pet_season_slots\(pet_id, telegram_id, season_key, slot_number\)\s+ON DELETE CASCADE/,
  'pet instances must reference the complete season-slot ownership tuple',
);

const db = new DatabaseSync(':memory:');
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE telegram_pet_profiles (
    telegram_id TEXT PRIMARY KEY,
    pet_name TEXT NOT NULL DEFAULT 'Moonpet', species TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL DEFAULT 'egg', pet_xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1, hunger INTEGER NOT NULL DEFAULT 25,
    happiness INTEGER NOT NULL DEFAULT 70, cleanliness INTEGER NOT NULL DEFAULT 70,
    energy INTEGER NOT NULL DEFAULT 70, health INTEGER NOT NULL DEFAULT 75,
    streak_days INTEGER NOT NULL DEFAULT 0, moon_gold INTEGER NOT NULL DEFAULT 0,
    moon_crystals INTEGER NOT NULL DEFAULT 0, style_tokens INTEGER NOT NULL DEFAULT 0,
    equipped_food TEXT, equipped_toy TEXT, equipped_outfit TEXT,
    equipped_armor TEXT, equipped_weapon TEXT, equipped_charm TEXT,
    last_active_day TEXT, last_decay_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE telegram_pet_season_state (
    telegram_id TEXT NOT NULL, season_key TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (telegram_id, season_key)
  );
  CREATE TABLE telegram_pet_evolutions (
    telegram_id TEXT NOT NULL,
    evolution_id TEXT NOT NULL,
    stage INTEGER NOT NULL,
    unlock_event_key TEXT NOT NULL,
    cosmetic_unlocks TEXT NOT NULL DEFAULT '[]',
    achievement_unlocks TEXT NOT NULL DEFAULT '[]',
    materials_consumed INTEGER NOT NULL DEFAULT 0,
    unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (telegram_id, evolution_id),
    UNIQUE (telegram_id, stage),
    UNIQUE (telegram_id, unlock_event_key)
  );
`);

db.prepare(`INSERT INTO telegram_pet_profiles (
  telegram_id, pet_name, species, stage, pet_xp, level, hunger, happiness,
  cleanliness, energy, health, streak_days, moon_gold, moon_crystals,
  style_tokens, equipped_food, equipped_toy, equipped_outfit, equipped_armor,
  equipped_weapon, equipped_charm, last_active_day, last_decay_at, created_at,
  updated_at
) VALUES (${Array(25).fill('?').join(', ')})`).run(
  'state-player', 'Nova', 'neon_raccoon', 'adult', 4321, 12, 31, 82, 63,
  54, 91, 8, 777, 44, 19, 'pizza', 'orb', 'jacket', 'shell', 'laser',
  'star', '2026-08-15', '2026-08-15T12:00:00Z', '2026-01-02T03:04:05Z',
  '2026-08-16T01:02:03Z',
);
db.prepare('INSERT INTO telegram_pet_season_state (telegram_id, season_key, updated_at) VALUES (?, ?, ?)')
  .run('state-player', '2026-q3', '2026-08-15T00:00:00Z');
db.prepare(`INSERT INTO telegram_pet_evolutions
  (telegram_id, evolution_id, stage, unlock_event_key, cosmetic_unlocks, achievement_unlocks, materials_consumed, unlocked_at)
  VALUES
  ('state-player', 'moon_egg', 0, 'legacy:moon-egg', '[]', '[]', 1, '2026-01-02T03:04:05Z'),
  ('state-player', 'street_moonpet', 1, 'legacy:street', '[]', '[]', 1, '2026-02-03T04:05:06Z')`).run();

db.exec(migration055);
db.exec(migration056);
db.exec(migration056);
db.exec(migration053);
db.exec(migration057);
db.exec(migration057);
assert.equal(db.prepare(`SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id='pet:state-player:2026-q3:1'`).get().phase, 'adult', 'migration must retain the starter lifecycle');
assert.deepEqual(
  db.prepare(`SELECT evolution_id, stage FROM telegram_pet_evolutions_by_pet WHERE pet_id='pet:state-player:2026-q3:1' ORDER BY stage`).all().map((row) => ({ ...row })),
  [{ evolution_id: 'moon_egg', stage: 0 }, { evolution_id: 'street_moonpet', stage: 1 }],
  'migration must backfill starter evolution rows onto the starter pet instance only',
);

assert.equal(db.prepare('SELECT COUNT(*) AS count FROM telegram_pet_instances').get().count, 1, 'exactly one starter-slot instance must be backfilled');
const instance = db.prepare('SELECT * FROM telegram_pet_instances').get();
assert.deepEqual(
  [instance.pet_id, instance.telegram_id, instance.season_key, instance.slot_number, instance.status],
  ['pet:state-player:2026-q3:1', 'state-player', '2026-q3', 1, 'active'],
  'the backfill must represent the active starter season slot',
);
assert.deepEqual(
  {
    pet_name: instance.pet_name, species: instance.species, stage: instance.stage,
    pet_xp: instance.pet_xp, level: instance.level, hunger: instance.hunger,
    happiness: instance.happiness, cleanliness: instance.cleanliness,
    energy: instance.energy, health: instance.health, streak_days: instance.streak_days,
    moon_gold: instance.moon_gold, moon_crystals: instance.moon_crystals,
    style_tokens: instance.style_tokens, equipped_food: instance.equipped_food,
    equipped_toy: instance.equipped_toy, equipped_outfit: instance.equipped_outfit,
    equipped_armor: instance.equipped_armor, equipped_weapon: instance.equipped_weapon,
    equipped_charm: instance.equipped_charm, last_active_day: instance.last_active_day,
    last_decay_at: instance.last_decay_at, source_profile_updated_at: instance.source_profile_updated_at,
    created_at: instance.created_at, updated_at: instance.updated_at,
  },
  {
    pet_name: 'Nova', species: 'neon_raccoon', stage: 'adult', pet_xp: 4321,
    level: 12, hunger: 31, happiness: 82, cleanliness: 63, energy: 54,
    health: 91, streak_days: 8, moon_gold: 777, moon_crystals: 44,
    style_tokens: 19, equipped_food: 'pizza', equipped_toy: 'orb',
    equipped_outfit: 'jacket', equipped_armor: 'shell', equipped_weapon: 'laser',
    equipped_charm: 'star', last_active_day: '2026-08-15',
    last_decay_at: '2026-08-15T12:00:00Z', source_profile_updated_at: '2026-08-16T01:02:03Z',
    created_at: '2026-01-02T03:04:05Z', updated_at: '2026-08-16T01:02:03Z',
  },
  'the starter instance must copy profile identity, progression, stats, currencies, gear, and timestamps',
);

db.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent)
  VALUES (?, ?, ?, ?, ?, ?, ?)`)
  .run('pet:state-player:2026-q3:2', 'state-player', '2026-q3', 2, 'arcade_xp', 'manual-paid-slot', 500);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM telegram_pet_instances').get().count, 1, 'manually adding a paid slot must not auto-create an instance');

db.prepare('INSERT INTO telegram_pet_profiles (telegram_id, species) VALUES (?, ?)')
  .run('other-player', 'neon_raccoon');
assert.throws(
  () => db.prepare(`INSERT INTO telegram_pet_instances
    (pet_id, telegram_id, season_key, slot_number, source_profile_updated_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run('pet:state-player:2026-q3:2', 'other-player', '2026-q3', 2, '2026-08-16T02:00:00Z'),
  /FOREIGN KEY constraint failed/,
  'an instance must not combine one player\'s pet_id with another player\'s ownership tuple',
);

const {
  findActivePetSlot, readActivePetInstance, writeActivePetInstance,
  getPetProfile, savePetProfile, preparePetMiniAppState, buildPetSeasonSlotSummary, buyPetSeasonSlot, switchActivePetSeasonSlot,
  getMoonpetLifecycle, incubateMoonEgg,
  getMoonpetIdentitySummary, serializePet,
} = __petMediaTestHooks;
const d1 = new SqliteD1(db);

function seedPendingRolloverPlayer(id, overrides = {}) {
  const petId = `pet:${id}:2026-q3:1`;
  const petName = overrides.pet_name || `${id}-starter`;
  const petXp = overrides.pet_xp ?? 120;
  const moonGold = overrides.moon_gold ?? 25;
  const energy = overrides.energy ?? 70;
  const health = overrides.health ?? 75;
  const updatedAt = overrides.updated_at || '2026-08-15T12:00:00Z';
  db.prepare(`INSERT INTO telegram_pet_profiles
    (telegram_id, pet_name, species, stage, pet_xp, level, energy, moon_gold, health, updated_at)
    VALUES (?, ?, 'neon_raccoon', 'adult', ?, 5, ?, ?, ?, ?)`)
    .run(id, petName, petXp, energy, moonGold, health, updatedAt);
  db.prepare(`INSERT INTO telegram_pet_season_slots
    (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
    VALUES (?, ?, '2026-q3', 1, 'free', 'profile_insert', 0, 'active')`)
    .run(petId, id);
  db.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key) VALUES (?, ?, '2026-q3')`)
    .run(id, petId);
  db.prepare(`INSERT INTO telegram_pet_instances
    (pet_id, telegram_id, season_key, slot_number, pet_name, species, stage, pet_xp, level, energy, moon_gold, health, source_profile_updated_at, updated_at)
    VALUES (?, ?, '2026-q3', 1, ?, 'neon_raccoon', 'adult', ?, 5, ?, ?, ?, ?, ?)`)
    .run(petId, id, petName, petXp, energy, moonGold, health, updatedAt, updatedAt);
  return petId;
}

const missingWalletPetId = seedPendingRolloverPlayer('missing-wallet', { pet_name: 'No Wallet Overlay', pet_xp: 321, moon_gold: 17, energy: 66 });
const missingProfileWalletD1 = {
  prepare(sql) {
    if (/SELECT \* FROM telegram_pet_profiles WHERE telegram_id = \?/i.test(sql)) {
      return { bind: () => ({ first: async () => null }) };
    }
    return d1.prepare(sql);
  },
  batch(statements) { return d1.batch(statements); },
};
const missingWalletRead = await getPetProfile(missingProfileWalletD1, 'missing-wallet');
assert.deepEqual(
  { pet_id: missingWalletRead.pet_id, pet_name: missingWalletRead.pet_name, pet_xp: missingWalletRead.pet_xp, moon_gold: missingWalletRead.moon_gold, energy: missingWalletRead.energy },
  { pet_id: missingWalletPetId, pet_name: 'No Wallet Overlay', pet_xp: 321, moon_gold: 17, energy: 66 },
  'active pet reads must remain safe when the profile wallet projection is missing',
);

db.prepare(`UPDATE telegram_pet_instances SET pet_name='Instance Nova', pet_xp=5100, level=52,
  moon_gold=901, energy=88, last_decay_at=?, source_profile_updated_at='2026-08-16 02:59:59',
  updated_at='2026-08-16 03:00:00' WHERE telegram_id='state-player'`).run(new Date().toISOString());
db.prepare(`UPDATE telegram_pet_profiles SET pet_name='Stale Profile', pet_xp=1, level=1,
  moon_gold=2, energy=3 WHERE telegram_id='state-player'`).run();
const runtimePet = await getPetProfile(d1, 'state-player');
assert.deepEqual(
  { pet_name: runtimePet.pet_name, pet_xp: runtimePet.pet_xp, level: runtimePet.level, moon_gold: runtimePet.moon_gold, energy: runtimePet.energy },
  { pet_name: 'Instance Nova', pet_xp: 5100, level: 52, moon_gold: 2, energy: 88 },
  'gameplay reads must use the active starter pet instance while showing the account wallet from the profile authority',
);
assert.deepEqual(
  { ...db.prepare(`SELECT pet_name, pet_xp, level, moon_gold, energy FROM telegram_pet_profiles WHERE telegram_id='state-player'`).get() },
  { pet_name: 'Instance Nova', pet_xp: 5100, level: 52, moon_gold: 2, energy: 88 },
  'instance reads must mirror pet-owned legacy profile payload fields without overwriting the account wallet',
);

db.prepare(`UPDATE telegram_pet_instances SET source_profile_updated_at='2026-08-16T03:00:00.500Z' WHERE telegram_id='state-player'`).run();
db.prepare(`UPDATE telegram_pet_profiles SET energy=64, updated_at='2026-08-16 03:00:00' WHERE telegram_id='state-player'`).run();
const profileMutationPet = await getPetProfile(d1, 'state-player');
assert.equal(profileMutationPet.energy, 64, 'a newer profile-only gameplay mutation must not be overwritten by stale instance state');
assert.equal(
  db.prepare(`SELECT energy FROM telegram_pet_instances WHERE telegram_id='state-player'`).get().energy,
  64,
  'a same-second profile-only gameplay mutation must synchronize to the active instance before the read returns',
);
const syncedProfileUpdatedAt = db.prepare(`SELECT updated_at FROM telegram_pet_profiles WHERE telegram_id='state-player'`).get().updated_at;
await getPetProfile(d1, 'state-player');
assert.equal(
  db.prepare(`SELECT updated_at FROM telegram_pet_profiles WHERE telegram_id='state-player'`).get().updated_at,
  syncedProfileUpdatedAt,
  'compatibility reads must not rewrite profile updated_at when state is already synchronized',
);

runtimePet.pet_name = 'Saved Nova';
runtimePet.pet_xp = 5200;
runtimePet.moon_crystals = 55;
runtimePet.energy = 77;
await savePetProfile(d1, runtimePet);
assert.deepEqual(
  { ...db.prepare(`SELECT pet_name, pet_xp, moon_crystals, energy FROM telegram_pet_instances WHERE telegram_id='state-player'`).get() },
  { pet_name: 'Saved Nova', pet_xp: 5200, moon_crystals: 44, energy: 77 },
  'gameplay writes must update pet-owned active instance fields without treating wallet crystals as per-pet',
);
assert.deepEqual(
  { ...db.prepare(`SELECT pet_name, pet_xp, moon_crystals, energy FROM telegram_pet_profiles WHERE telegram_id='state-player'`).get() },
  { pet_name: 'Saved Nova', pet_xp: 5200, moon_crystals: 44, energy: 77 },
  'gameplay writes must preserve pet-owned profile fields without overwriting account-wallet authority',
);

db.prepare(`DELETE FROM telegram_pet_instances WHERE telegram_id='state-player'`).run();
const recreated = await readActivePetInstance(d1, 'state-player');
assert.equal(recreated.pet_name, 'Saved Nova', 'a missing active starter instance must be recreated from its compatibility profile');

const missingSwitch = await switchActivePetSeasonSlot(d1, 'state-player', 2, { now: new Date('2026-08-16T12:00:00Z') });
assert.equal(missingSwitch.accepted, false, 'a paid slot missing its pet instance must be rejected');

db.exec(`CREATE TABLE arcade_progression_state (
  telegram_id TEXT PRIMARY KEY, arcade_xp_total INTEGER NOT NULL DEFAULT 0,
  arcade_daily_xp INTEGER NOT NULL DEFAULT 0, arcade_daily_key TEXT NOT NULL DEFAULT '',
  arcade_restriction_level INTEGER NOT NULL DEFAULT 0, restricted_until INTEGER,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`CREATE TABLE arcade_xp_wallets (
  telegram_id TEXT PRIMARY KEY, arcade_xp_earned INTEGER NOT NULL DEFAULT 0,
  arcade_xp_spendable INTEGER NOT NULL DEFAULT 0, arcade_xp_spent INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
db.prepare(`INSERT INTO arcade_progression_state (telegram_id, arcade_xp_total) VALUES ('state-player', 1500)`).run();
db.prepare(`INSERT INTO arcade_xp_wallets (telegram_id, arcade_xp_earned, arcade_xp_spendable) VALUES ('state-player', 1500, 1500)`).run();
const rolloverNow = new Date('2026-08-16T12:00:00Z');
const rolloverReadChangesBefore = db.prepare('SELECT total_changes() AS count').get().count;
const unpreparedRolloverRoster = await buildPetSeasonSlotSummary(d1, 'state-player', rolloverNow);
assert.equal(unpreparedRolloverRoster.slots[0].unlocked, false, 'a roster read alone must not synthesize a missing current-season starter');
assert.equal(db.prepare('SELECT total_changes() AS count').get().count, rolloverReadChangesBefore, 'an unprepared rollover roster read must perform zero database mutations');
db.prepare(`UPDATE telegram_pet_profiles SET pet_name='Outgoing Final', pet_xp=7777, moon_gold=654,
  health=62, equipped_weapon='outgoing-final-weapon', updated_at='2099-01-01 00:00:00'
  WHERE telegram_id='state-player'`).run();
assert.equal(await preparePetMiniAppState(d1, 'state-player', rolloverNow), true, 'Mini App state preparation must bootstrap an adopted player into the current season');
assert.deepEqual(
  { ...db.prepare(`SELECT pet_name, pet_xp, moon_gold, health, equipped_weapon FROM telegram_pet_instances
    WHERE telegram_id='state-player' AND season_key='2026-q3' AND slot_number=1`).get() },
  { pet_name: 'Outgoing Final', pet_xp: 7777, moon_gold: 2, health: 62, equipped_weapon: 'outgoing-final-weapon' },
  'rollover preparation must reconcile final pet-owned legacy writes onto the outgoing pet before moving the pointer',
);
assert.deepEqual(
  { ...db.prepare(`SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='state-player'`).get() },
  { moon_gold: 654 },
  'rollover preparation must preserve Moon Gold on the account wallet authority',
);
assert.deepEqual(
  { ...db.prepare(`SELECT season_key, slot_number, acquisition_type, status FROM telegram_pet_season_slots
    WHERE telegram_id='state-player' AND season_key='pet-s2026-003' AND slot_number=1`).get() },
  { season_key: 'pet-s2026-003', slot_number: 1, acquisition_type: 'free', status: 'active' },
  'state preparation must create the current-season free starter slot',
);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances
  WHERE telegram_id='state-player' AND season_key='pet-s2026-003' AND slot_number=1`).get().count, 1, 'state preparation must create the current-season starter pet instance');
assert.deepEqual(
  { ...db.prepare(`SELECT pet_name, pet_xp, moon_gold, health, equipped_weapon FROM telegram_pet_instances
    WHERE telegram_id='state-player' AND season_key='pet-s2026-003' AND slot_number=1`).get() },
  { pet_name: 'Moonpet', pet_xp: 0, moon_gold: 0, health: 75, equipped_weapon: null },
  'the new-season starter must use fresh defaults rather than inheriting the outgoing pet mutation',
);
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='state-player'`).get().pet_id, 'pet:state-player:pet-s2026-003:1', 'state preparation must advance the active pointer from the previous season');
const preparedRolloverRoster = await buildPetSeasonSlotSummary(d1, 'state-player', rolloverNow);
assert.equal(preparedRolloverRoster.season.key, 'pet-s2026-003', 'the subsequent roster must describe the current season');
assert.equal(preparedRolloverRoster.slots[0].unlocked, true, 'the subsequent roster must expose the bootstrapped starter');
assert.equal(preparedRolloverRoster.slots[2].purchase_enabled, false, 'slot 3 must stay disabled until slot 2 is owned');
assert.equal(preparedRolloverRoster.slots[2].purchase_disabled_reason, 'previous_pet_slot_required', 'slot 3 must explain the sequential purchase gate');
assert.equal(preparedRolloverRoster.slots[2].affordable, false, 'slot 3 must not be marked affordable before slot 2 exists');
const rolloverSeasonKey = preparedRolloverRoster.season.key;
const boughtSecond = await buyPetSeasonSlot(d1, 'state-player', 2, { now: new Date('2026-08-16T12:00:00Z') });
assert.equal(boughtSecond.accepted, true, 'slot 2 purchase must succeed with enough Arcade XP');
assert.equal(boughtSecond.season_slots.slots[2].purchase_enabled, true, 'slot 3 must become purchasable immediately after slot 2 is owned');
assert.equal(boughtSecond.season_slots.slots[2].purchase_disabled_reason, null, 'slot 3 purchase lock reason must clear once slot 2 is owned');
assert.equal(db.prepare(`SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id='pet:state-player:pet-s2026-003:2'`).get().phase, 'egg', 'a purchased pet must receive a fresh egg lifecycle');
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='state-player'`).get().pet_id, 'pet:state-player:pet-s2026-003:1', 'purchase must not auto-switch');
assert.equal((await getMoonpetLifecycle(d1, 'state-player')).phase, 'egg', 'a rollover starter must receive a fresh egg lifecycle');
db.exec(`CREATE TABLE telegram_pet_activity_sessions (
  id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, activity_type TEXT NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ends_at DATETIME NOT NULL,
  claimed_at DATETIME, status TEXT NOT NULL DEFAULT 'active', metadata TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
db.prepare(`INSERT INTO telegram_pet_activity_sessions (id, telegram_id, activity_type, ends_at, status)
  VALUES ('active-before-switch', 'state-player', 'train', '2026-08-16 13:00:00', 'active')`).run();
const activityBlocked = await switchActivePetSeasonSlot(d1, 'state-player', 2, { now: new Date('2026-08-16T12:00:00Z') });
assert.equal(activityBlocked.reason, 'pet_activity_active', 'switching must be blocked while a timed activity is active');
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='state-player'`).get().pet_id, 'pet:state-player:pet-s2026-003:1', 'a blocked switch must leave the active pet unchanged');
db.prepare(`UPDATE telegram_pet_activity_sessions SET status='cancelled' WHERE id='active-before-switch'`).run();
const switched = await switchActivePetSeasonSlot(d1, 'state-player', 2, { now: new Date('2026-08-16T12:00:00Z') });
assert.equal(switched.accepted, true, 'switching to an owned active paid pet must succeed');
assert.equal((await getMoonpetLifecycle(d1, 'state-player')).phase, 'egg', 'switching to a purchased pet must expose its egg lifecycle');
assert.equal((await getMoonpetIdentitySummary(d1, 'state-player')).current_stage.evolution_id, 'moon_egg', 'a switched paid pet must not inherit the starter evolution stage');
await incubateMoonEgg(d1, 'state-player', 'warm', 'paid-pet-incubation');
assert.equal(db.prepare(`SELECT incubation_progress FROM telegram_pet_lifecycle_by_pet WHERE pet_id='pet:state-player:pet-s2026-003:2'`).get().incubation_progress, 2, 'incubation must progress the active paid pet only');
assert.equal(db.prepare(`SELECT incubation_progress FROM telegram_pet_lifecycle_by_pet WHERE pet_id='pet:state-player:pet-s2026-003:1'`).get().incubation_progress, 0, 'paid-pet incubation must not change the fresh rollover starter lifecycle');
assert.equal((await getPetProfile(d1, 'state-player')).pet_name, 'Moonpet', 'gameplay reads must follow the switched fresh pet');
assert.equal(db.prepare(`SELECT pet_name FROM telegram_pet_profiles WHERE telegram_id='state-player'`).get().pet_name, 'Moonpet', 'switching must mirror the selected pet to the legacy profile');
const paidIdentity = await getMoonpetIdentitySummary(d1, 'state-player');
assert.equal(paidIdentity.current_stage.evolution_id, 'moon_egg', 'paid pet identity must not reuse the owner-scoped evolution unlocks');
assert.deepEqual(paidIdentity.personalities, [], 'paid pet identity must not reuse the owner-scoped personality unlocks');
assert.equal(paidIdentity.memories, null, 'paid pet identity must not reuse the owner-scoped memory payload');
assert.equal(serializePet(await getPetProfile(d1, 'state-player'), paidIdentity).evolution_stage, 0, 'serialized paid pets must not expose starter evolution stage');
const paidPet = await getPetProfile(d1, 'state-player');
paidPet.energy = 42;
await savePetProfile(d1, paidPet);
db.prepare(`UPDATE telegram_pet_profiles SET pet_xp=73, moon_gold=81, equipped_weapon='paid-blaster',
  health=63, updated_at='2098-01-01 00:00:00' WHERE telegram_id='state-player'`).run();
await switchActivePetSeasonSlot(d1, 'state-player', 1, { now: new Date('2026-08-16T12:00:00Z') });
assert.equal((await getPetProfile(d1, 'state-player')).pet_name, 'Moonpet', 'switching back must restore the fresh rollover starter state');
assert.equal((await getMoonpetLifecycle(d1, 'state-player')).phase, 'egg', 'switching back must restore the fresh rollover starter lifecycle');
assert.equal(db.prepare(`SELECT energy FROM telegram_pet_instances WHERE season_key='pet-s2026-003' AND slot_number=2 AND telegram_id='state-player'`).get().energy, 42, 'writes must affect only the active paid pet');
assert.deepEqual(
  { ...db.prepare(`SELECT pet_xp, moon_gold, equipped_weapon, health FROM telegram_pet_instances
    WHERE season_key='pet-s2026-003' AND slot_number=2 AND telegram_id='state-player'`).get() },
  { pet_xp: 73, moon_gold: 0, equipped_weapon: 'paid-blaster', health: 63 },
  'switching must reconcile newer legacy pet-owned writes to the old active instance before moving the pointer',
);
assert.deepEqual(
  { ...db.prepare(`SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='state-player'`).get() },
  { moon_gold: 81 },
  'switching must keep newer Moon Gold on the account wallet authority',
);
const boughtThird = await buyPetSeasonSlot(d1, 'state-player', 3, { now: new Date('2026-08-16T12:00:00Z') });
assert.equal(boughtThird.accepted, true, 'slot 3 purchase must succeed with enough Arcade XP');
assert.equal(db.prepare(`SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id='state-player'`).get().arcade_xp_total, 1500, 'lifetime Arcade XP must not be spent');
assert.deepEqual({ ...db.prepare(`SELECT arcade_xp_spendable, arcade_xp_spent FROM arcade_xp_wallets WHERE telegram_id='state-player'`).get() }, { arcade_xp_spendable: 0, arcade_xp_spent: 1500 }, 'paid slots must debit only the spendable wallet exactly once');
assert.deepEqual({ ...db.prepare(`SELECT pet_name, pet_xp, energy FROM telegram_pet_instances WHERE season_key='pet-s2026-003' AND slot_number=3 AND telegram_id='state-player'`).get() }, { pet_name: 'Moonpet', pet_xp: 0, energy: 70 }, 'a purchased pet must be a fresh instance');

const rosterNow = new Date();
const dormantDecayStart = new Date(rosterNow.getTime() - (2 * 60 * 60 * 1000)).toISOString();
db.prepare(`UPDATE telegram_pet_instances SET hunger=20, happiness=80, cleanliness=70,
  energy=60, health=75, pet_xp=345, last_decay_at=?
  WHERE telegram_id='state-player' AND slot_number=2`).run(dormantDecayStart);
db.prepare(`UPDATE telegram_pet_instances SET last_decay_at=?
  WHERE telegram_id='state-player' AND slot_number=1`).run(rosterNow.toISOString());
const starterBeforeRoster = { ...db.prepare(`SELECT pet_xp, hunger, happiness, cleanliness, energy, health
  FROM telegram_pet_instances WHERE telegram_id='state-player' AND slot_number=1`).get() };
const decayAwareRoster = await buildPetSeasonSlotSummary(d1, 'state-player', rosterNow);
const dormantSlot = decayAwareRoster.slots[1];
assert.deepEqual(
  { pet_xp: dormantSlot.pet.pet_xp, hunger: dormantSlot.pet.hunger, happiness: dormantSlot.pet.happiness, cleanliness: dormantSlot.pet.cleanliness, energy: dormantSlot.pet.energy, health: dormantSlot.pet.health },
  { pet_xp: 345, hunger: 29, happiness: 74, cleanliness: 64, energy: 56, health: 66 },
  'roster summary must apply the canonical decay calculation to each dormant pet instance',
);
assert.equal(
  db.prepare(`SELECT last_decay_at FROM telegram_pet_instances WHERE telegram_id='state-player' AND slot_number=2`).get().last_decay_at,
  dormantDecayStart,
  'roster decay must be a read-only preview and must not persist hidden pet-instance mutations',
);
assert.deepEqual(
  { ...db.prepare(`SELECT pet_xp, hunger, happiness, cleanliness, energy, health
    FROM telegram_pet_instances WHERE telegram_id='state-player' AND slot_number=1`).get() },
  starterBeforeRoster,
  'resolving dormant roster decay must not mutate the other pet instance',
);
const switchedToDormant = await switchActivePetSeasonSlot(d1, 'state-player', 2, { now: rosterNow });
assert.equal(switchedToDormant.accepted, true, 'the decay-resolved dormant pet must remain switchable');
const dormantDetail = await getPetProfile(d1, 'state-player');
assert.deepEqual(
  { pet_xp: dormantDetail.pet_xp, hunger: dormantDetail.hunger, happiness: dormantDetail.happiness, cleanliness: dormantDetail.cleanliness, energy: dormantDetail.energy, health: dormantDetail.health },
  { pet_xp: dormantSlot.pet.pet_xp, hunger: dormantSlot.pet.hunger, happiness: dormantSlot.pet.happiness, cleanliness: dormantSlot.pet.cleanliness, energy: dormantSlot.pet.energy, health: dormantSlot.pet.health },
  'switching to a dormant pet must show the same authoritative stats as its roster card',
);
assert.deepEqual(
  { ...db.prepare(`SELECT pet_xp, hunger, happiness, cleanliness, energy, health
    FROM telegram_pet_instances WHERE telegram_id='state-player' AND slot_number=1`).get() },
  starterBeforeRoster,
  'switching to the dormant pet must not copy or mutate the starter pet state',
);
db.prepare(`UPDATE telegram_pet_instances SET hunger=15, last_decay_at=?
  WHERE telegram_id='state-player' AND slot_number IN (1, 2, 3)`).run(dormantDecayStart);
const readOnlyRosterChangesBefore = db.prepare('SELECT total_changes() AS count').get().count;
const readOnlyRoster = await buildPetSeasonSlotSummary(d1, 'state-player', rosterNow);
assert.equal(readOnlyRoster.slots.length, 3, 'the read-only roster must return all three pet projections');
assert.ok(readOnlyRoster.slots.every((slot) => slot.pet.hunger > 15), 'each roster card must preview canonical decay');
assert.equal(db.prepare('SELECT total_changes() AS count').get().count, readOnlyRosterChangesBefore, 'a roster read must not mutate any database table');
db.prepare(`UPDATE telegram_pet_profiles SET pet_xp=9999, moon_gold=8888, moon_crystals=777,
  style_tokens=666, equipped_food='new-food', equipped_toy='new-toy',
  equipped_outfit='new-outfit', equipped_armor='new-armor', equipped_weapon='new-weapon',
  equipped_charm='new-charm', hunger=11, happiness=98, cleanliness=97, energy=99,
  health=96, updated_at='2099-01-01 00:00:00'
  WHERE telegram_id='state-player'`).run();
await buildPetSeasonSlotSummary(d1, 'state-player', rosterNow);
assert.deepEqual(
  { ...db.prepare(`SELECT pet_xp, moon_gold, moon_crystals, style_tokens, equipped_food,
      equipped_toy, equipped_outfit, equipped_armor, equipped_weapon, equipped_charm,
      hunger, happiness, cleanliness, energy, health, updated_at
    FROM telegram_pet_profiles WHERE telegram_id='state-player'`).get() },
  {
    pet_xp: 9999, moon_gold: 8888, moon_crystals: 777, style_tokens: 666,
    equipped_food: 'new-food', equipped_toy: 'new-toy', equipped_outfit: 'new-outfit',
    equipped_armor: 'new-armor', equipped_weapon: 'new-weapon', equipped_charm: 'new-charm',
    hunger: 11, happiness: 98, cleanliness: 97, energy: 99, health: 96,
    updated_at: '2099-01-01 00:00:00',
  },
  'a stale roster read must not revert newer XP, currencies, equipment, or stat state in the compatibility profile',
);
db.prepare(`UPDATE telegram_pet_season_slots SET status='archived'
  WHERE pet_id='pet:state-player:pet-s2026-003:3'`).run();
db.prepare(`UPDATE telegram_pet_instances SET status='active'
  WHERE pet_id='pet:state-player:pet-s2026-003:3'`).run();
const archivedRoster = await buildPetSeasonSlotSummary(d1, 'state-player', rosterNow);
assert.equal(archivedRoster.slots[2].status, 'archived', 'instance status must not overwrite authoritative archived season-slot status');
assert.equal((await switchActivePetSeasonSlot(d1, 'state-player', 3, { now: rosterNow })).accepted, false, 'an archived season slot must remain unavailable to active-pet switching');
assert.equal((await buyPetSeasonSlot(d1, 'state-player', 3, { now: new Date('2026-08-16T12:00:00Z') })).reason, 'pet_slot_already_owned', 'duplicate purchase must be rejected without another deduction');
assert.deepEqual({ ...db.prepare(`SELECT arcade_xp_spendable, arcade_xp_spent FROM arcade_xp_wallets WHERE telegram_id='state-player'`).get() }, { arcade_xp_spendable: 0, arcade_xp_spent: 1500 }, 'a duplicate purchase retry must not debit the wallet twice');
assert.equal((await buyPetSeasonSlot(d1, 'state-player', 4, { now: new Date('2026-08-16T12:00:00Z') })).reason, 'invalid_pet_slot', 'slot 4 must be rejected');
assert.equal((await switchActivePetSeasonSlot(d1, 'other-player', 'pet:state-player:2026-q3:3', { now: new Date('2026-08-16T12:00:00Z') })).accepted, false, 'another owner cannot switch to the player pet');

db.prepare(`INSERT INTO telegram_pet_profiles (telegram_id, pet_name) VALUES ('poor-player', 'Poor starter')`).run();
db.prepare(`INSERT INTO arcade_progression_state (telegram_id, arcade_xp_total) VALUES ('poor-player', 499)`).run();
db.prepare(`INSERT INTO arcade_xp_wallets (telegram_id, arcade_xp_earned, arcade_xp_spendable) VALUES ('poor-player', 499, 499)`).run();
const insufficient = await buyPetSeasonSlot(d1, 'poor-player', 2, { now: new Date('2026-08-16T12:00:00Z') });
assert.equal(insufficient.reason, 'insufficient_arcade_xp', 'insufficient Arcade XP must reject a paid slot purchase');
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_season_slots WHERE telegram_id='poor-player' AND slot_number=2`).get().count, 0, 'insufficient XP must not create the paid slot');
assert.equal(db.prepare(`SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id='poor-player'`).get().arcade_xp_total, 499, 'a rejected purchase must not deduct Arcade XP');

db.prepare(`INSERT INTO telegram_pet_profiles (telegram_id, pet_name) VALUES ('lifetime-only-player', 'Lifetime only')`).run();
db.prepare(`INSERT INTO arcade_progression_state (telegram_id, arcade_xp_total) VALUES ('lifetime-only-player', 99999)`).run();
const lifetimeOnly = await buyPetSeasonSlot(d1, 'lifetime-only-player', 2, { now: new Date('2026-08-16T12:00:00Z') });
assert.equal(lifetimeOnly.reason, 'insufficient_arcade_xp', 'lifetime XP alone must never authorize a paid slot');

db.prepare(`INSERT INTO telegram_pet_profiles (telegram_id, pet_name) VALUES ('wallet-attacker', 'Attacker')`).run();
db.prepare(`INSERT INTO arcade_xp_wallets (telegram_id, arcade_xp_earned, arcade_xp_spendable) VALUES ('wallet-victim', 500, 500)`).run();
assert.equal((await buyPetSeasonSlot(d1, 'wallet-attacker', 2, { now: rolloverNow })).reason, 'insufficient_arcade_xp', 'a Telegram user cannot use another owner wallet');
assert.equal(db.prepare(`SELECT arcade_xp_spendable FROM arcade_xp_wallets WHERE telegram_id='wallet-victim'`).get().arcade_xp_spendable, 500, 'another owner wallet must remain untouched');

db.exec(`CREATE TABLE telegram_pet_runs (
  run_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  status TEXT NOT NULL
)`);
db.exec(`CREATE TABLE telegram_pet_arena_battles (
  battle_id TEXT PRIMARY KEY,
  player1_telegram_id TEXT NOT NULL,
  player2_telegram_id TEXT,
  status TEXT NOT NULL
)`);
db.exec(`CREATE TABLE telegram_pet_kaiju_matches (
  match_id TEXT PRIMARY KEY,
  player1_telegram_id TEXT NOT NULL,
  player2_telegram_id TEXT,
  status TEXT NOT NULL
)`);

db.prepare(`INSERT INTO telegram_pet_kaiju_matches (match_id, player1_telegram_id, player2_telegram_id, status)
  VALUES ('kaiju-switch-p1', 'state-player', 'kaiju-rival', 'active')`).run();
const kaijuPlayer1Blocked = await switchActivePetSeasonSlot(d1, 'state-player', 1, { now: rolloverNow });
assert.equal(kaijuPlayer1Blocked.reason, 'pet_kaiju_active', 'active pet switching must be blocked while player1 has unfinished Kaiju work');
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='state-player'`).get().pet_id, 'pet:state-player:pet-s2026-003:2',
  'a player1 Kaiju block must leave the active pet unchanged');
db.prepare(`UPDATE telegram_pet_kaiju_matches SET status='completed' WHERE match_id='kaiju-switch-p1'`).run();
db.prepare(`INSERT INTO telegram_pet_kaiju_matches (match_id, player1_telegram_id, player2_telegram_id, status)
  VALUES ('kaiju-switch-p2', 'kaiju-rival', 'state-player', 'selecting')`).run();
const kaijuPlayer2Blocked = await switchActivePetSeasonSlot(d1, 'state-player', 1, { now: rolloverNow });
assert.equal(kaijuPlayer2Blocked.reason, 'pet_kaiju_active', 'active pet switching must be blocked while player2 has unfinished Kaiju work');
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='state-player'`).get().pet_id, 'pet:state-player:pet-s2026-003:2',
  'a player2 Kaiju block must leave the active pet unchanged');
db.prepare(`UPDATE telegram_pet_kaiju_matches SET status='completed' WHERE match_id='kaiju-switch-p2'`).run();

const activityRolloverPet = seedPendingRolloverPlayer('rollover-activity', { pet_name: 'Activity Prime', pet_xp: 150, moon_gold: 30, health: 72 });
db.prepare(`INSERT INTO telegram_pet_activity_sessions (id, telegram_id, activity_type, started_at, ends_at, status)
  VALUES ('rollover-activity-session', 'rollover-activity', 'train', '2026-08-16 10:00:00', '2026-08-16 13:00:00', 'active')`).run();
assert.equal(await preparePetMiniAppState(d1, 'rollover-activity', rolloverNow), true, 'rollover preparation must still succeed when pending work defers pointer movement');
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='rollover-activity'`).get().pet_id, activityRolloverPet, 'an active timed activity must retain the previous-season active pointer');
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_season_slots WHERE telegram_id='rollover-activity' AND season_key=?`).get(rolloverSeasonKey).count, 0, 'blocked rollover must not create or activate the new-season starter yet');
db.prepare(`UPDATE telegram_pet_profiles SET pet_xp=333, moon_gold=444, health=61, updated_at='2099-01-01 00:00:00'
  WHERE telegram_id='rollover-activity'`).run();
db.prepare(`UPDATE telegram_pet_activity_sessions SET status='completed', metadata='{}' WHERE id='rollover-activity-session'`).run();
assert.equal(await preparePetMiniAppState(d1, 'rollover-activity', rolloverNow), true, 'the next bootstrap after activity settlement must advance rollover safely');
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='rollover-activity'`).get().pet_id, `pet:rollover-activity:${rolloverSeasonKey}:1`, 'activity clearance must allow the current-season starter to become active');
assert.deepEqual(
  { ...db.prepare(`SELECT pet_xp, moon_gold, health FROM telegram_pet_instances WHERE pet_id=?`).get(activityRolloverPet) },
  { pet_xp: 333, moon_gold: 30, health: 61 },
  'outgoing activity settlement must reconcile pet-owned state onto the previous-season pet before the rollover pointer moves',
);
assert.deepEqual(
  { ...db.prepare(`SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='rollover-activity'`).get() },
  { moon_gold: 444 },
  'outgoing activity settlement must keep Moon Gold on the account wallet authority',
);
assert.deepEqual(
  { ...db.prepare(`SELECT pet_xp, moon_gold, health FROM telegram_pet_instances WHERE telegram_id='rollover-activity' AND season_key=? AND slot_number=1`).get(rolloverSeasonKey) },
  { pet_xp: 0, moon_gold: 0, health: 75 },
  'work started by the previous-season pet must not leak onto the new-season starter',
);

const runRolloverPet = seedPendingRolloverPlayer('rollover-run');
db.prepare(`INSERT INTO telegram_pet_runs (run_id, telegram_id, status) VALUES ('run-rollover-active', 'rollover-run', 'active')`).run();
assert.equal(await preparePetMiniAppState(d1, 'rollover-run', rolloverNow), true, 'run-gated rollover preparation must return successfully while deferring activation');
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='rollover-run'`).get().pet_id, runRolloverPet, 'an active roguelite run must retain the previous-season active pointer');
db.prepare(`UPDATE telegram_pet_runs SET status='completed' WHERE run_id='run-rollover-active'`).run();
assert.equal(await preparePetMiniAppState(d1, 'rollover-run', rolloverNow), true, 'clearing the active run must allow rollover on the next bootstrap');
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='rollover-run'`).get().pet_id, `pet:rollover-run:${rolloverSeasonKey}:1`, 'after run clearance the current-season starter must become active');

const arenaRolloverPet = seedPendingRolloverPlayer('rollover-arena');
db.prepare(`INSERT INTO telegram_pet_arena_battles (battle_id, player1_telegram_id, player2_telegram_id, status)
  VALUES ('arena-rollover-active', 'rollover-arena', 'arena-rival', 'active')`).run();
assert.equal(await preparePetMiniAppState(d1, 'rollover-arena', rolloverNow), true, 'arena-gated rollover preparation must return successfully while deferring activation');
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='rollover-arena'`).get().pet_id, arenaRolloverPet, 'a pending arena battle must retain the previous-season active pointer');
db.prepare(`UPDATE telegram_pet_arena_battles SET status='completed' WHERE battle_id='arena-rollover-active'`).run();
assert.equal(await preparePetMiniAppState(d1, 'rollover-arena', rolloverNow), true, 'clearing the arena battle must allow rollover on the next bootstrap');
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='rollover-arena'`).get().pet_id, `pet:rollover-arena:${rolloverSeasonKey}:1`, 'after arena clearance the current-season starter must become active');

const kaijuRolloverPet = seedPendingRolloverPlayer('rollover-kaiju');
db.prepare(`INSERT INTO telegram_pet_kaiju_matches (match_id, player1_telegram_id, player2_telegram_id, status)
  VALUES ('kaiju-rollover-active', 'kaiju-rival', 'rollover-kaiju', 'active')`).run();
assert.equal(await preparePetMiniAppState(d1, 'rollover-kaiju', rolloverNow), true, 'kaiju-gated rollover preparation must return successfully while deferring activation');
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='rollover-kaiju'`).get().pet_id, kaijuRolloverPet, 'a pending kaiju match must retain the previous-season active pointer');
db.prepare(`UPDATE telegram_pet_kaiju_matches SET status='completed' WHERE match_id='kaiju-rollover-active'`).run();
assert.equal(await preparePetMiniAppState(d1, 'rollover-kaiju', rolloverNow), true, 'clearing the kaiju match must allow rollover on the next bootstrap');
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='rollover-kaiju'`).get().pet_id, `pet:rollover-kaiju:${rolloverSeasonKey}:1`, 'after kaiju clearance the current-season starter must become active');

const specialistDb = new DatabaseSync(':memory:');
specialistDb.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE telegram_pet_profiles (
    telegram_id TEXT PRIMARY KEY,
    pet_name TEXT NOT NULL DEFAULT 'Moonpet', species TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL DEFAULT 'egg', pet_xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1, hunger INTEGER NOT NULL DEFAULT 25,
    happiness INTEGER NOT NULL DEFAULT 70, cleanliness INTEGER NOT NULL DEFAULT 70,
    energy INTEGER NOT NULL DEFAULT 70, health INTEGER NOT NULL DEFAULT 75,
    streak_days INTEGER NOT NULL DEFAULT 0, moon_gold INTEGER NOT NULL DEFAULT 0,
    moon_crystals INTEGER NOT NULL DEFAULT 0, style_tokens INTEGER NOT NULL DEFAULT 0,
    equipped_food TEXT, equipped_toy TEXT, equipped_outfit TEXT,
    equipped_armor TEXT, equipped_weapon TEXT, equipped_charm TEXT,
    last_active_day TEXT, last_decay_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE telegram_pet_season_state (
    telegram_id TEXT NOT NULL, season_key TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (telegram_id, season_key)
  );
`);
specialistDb.prepare(`INSERT INTO telegram_pet_profiles (telegram_id, pet_name, moon_gold)
  VALUES ('specialist-owner', 'Pet A', 123)`).run();
specialistDb.prepare(`INSERT INTO telegram_pet_season_state (telegram_id, season_key)
  VALUES ('specialist-owner', '2026-q3')`).run();
specialistDb.exec(migration055);
specialistDb.exec(migration056);
specialistDb.exec(migration039);
specialistDb.exec(migration073);
specialistDb.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent)
  VALUES ('pet:specialist-owner:2026-q3:2', 'specialist-owner', '2026-q3', 2, 'arcade_xp', 'paid-specialist-slot', 500)`).run();
specialistDb.prepare(`INSERT INTO telegram_pet_instances
  (pet_id, telegram_id, season_key, slot_number, pet_name, source_profile_updated_at)
  VALUES ('pet:specialist-owner:2026-q3:2', 'specialist-owner', '2026-q3', 2, 'Pet B', CURRENT_TIMESTAMP)`).run();
specialistDb.prepare(`INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity)
  VALUES ('specialist-owner', 'crystal_shard', 4)`).run();
const specialistD1 = new SqliteD1(specialistDb);
const petA = { pet_id: 'pet:specialist-owner:2026-q3:1', season_key: '2026-q3' };
const petB = { pet_id: 'pet:specialist-owner:2026-q3:2', season_key: '2026-q3' };
await applyPetRuntimeAward(specialistD1, 'specialist-owner', 'per-pet:care:a:1', 'feed', { ...petA, day_key: '2026-08-22', trait_amount: 4 });
await applyPetRuntimeAward(specialistD1, 'specialist-owner', 'per-pet:care:a:2', 'feed', { ...petA, day_key: '2026-08-22', trait_amount: 4 });
let petAState = await getOrCreatePetRuntimeState(specialistD1, 'specialist-owner', '2026-08-22', petA);
let petBState = await getOrCreatePetRuntimeState(specialistD1, 'specialist-owner', '2026-08-22', petB);
assert.equal(petAState.care_xp, 16, 'Pet A earns its own Care specialist XP');
assert.equal(JSON.parse(petAState.traits_json).loyal, 8, 'Pet A earns its own learned aptitude progress');
assert.equal(petAState.care_daily, 16, 'Pet A daily specialist counter records Pet A awards');
assert.equal(petBState.care_xp, 0, 'switching to Pet B must not inherit Pet A specialist XP');
assert.deepEqual(JSON.parse(petBState.traits_json), {}, 'switching to Pet B must not inherit Pet A learned aptitudes');
await applyPetRuntimeAward(specialistD1, 'specialist-owner', 'per-pet:care:b:1', 'feed', { ...petB, day_key: '2026-08-22', trait_amount: 2 });
await applyPetRuntimeAward(specialistD1, 'specialist-owner', 'per-pet:run:b:1', 'run_extract', { ...petB, day_key: '2026-08-22', drop_roll: 0, material_amount: 2 });
petBState = await getOrCreatePetRuntimeState(specialistD1, 'specialist-owner', '2026-08-22', petB);
petAState = await getOrCreatePetRuntimeState(specialistD1, 'specialist-owner', '2026-08-22', petA);
assert.equal(petBState.care_xp, 8, 'Pet B can earn Care specialist XP independently');
assert.equal(petBState.adventure_xp, 24, 'Pet B earns its own Adventure specialist XP from run extraction');
assert.equal(petBState.care_daily, 8, 'Pet B daily specialist counter is separate from Pet A');
assert.equal(petAState.care_xp, 16, 'switching back to Pet A restores Pet A specialist XP');
assert.equal(JSON.parse(petAState.traits_json).loyal, 8, 'switching back to Pet A restores Pet A aptitudes');
assert.equal(specialistDb.prepare(`SELECT quantity FROM telegram_pet_material_balances
  WHERE telegram_id='specialist-owner' AND material_key='crystal_shard'`).get().quantity, 6,
  'materials remain shared account-owned balances while specialist progress is pet-owned');
assert.equal(specialistDb.prepare(`SELECT moon_gold FROM telegram_pet_profiles
  WHERE telegram_id='specialist-owner'`).get().moon_gold, 123,
  'account wallet balances remain account-owned during specialist awards');
assert.equal(specialistDb.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_specialist_events
  WHERE pet_id='pet:specialist-owner:2026-q3:1'`).get().count, 2,
  'specialist unlock evidence is recorded under Pet A');
assert.equal(specialistDb.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_specialist_events
  WHERE pet_id='pet:specialist-owner:2026-q3:2'`).get().count, 2,
  'specialist unlock evidence is recorded under Pet B');
assert.equal(specialistDb.prepare(`SELECT care_xp FROM telegram_pet_progression_state
  WHERE telegram_id='specialist-owner'`).get().care_xp, 0,
  'legacy owner specialist mirrors must not receive pet-scoped awards');

console.log('telegram-pets-per-pet-state.test.mjs passed');
