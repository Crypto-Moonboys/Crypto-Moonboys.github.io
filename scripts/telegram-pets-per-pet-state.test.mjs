import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

class SqliteD1Statement {
  constructor(database, sql, bindings = []) { this.database = database; this.sql = sql; this.bindings = bindings; }
  bind(...bindings) { return new SqliteD1Statement(this.database, this.sql, bindings); }
  async first() { return this.database.prepare(this.sql).get(...this.bindings) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.bindings) }; }
  async run() {
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
const worker = await readFile(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');

assert.doesNotMatch(migration056, /CREATE\s+TRIGGER/i, 'migration 056 must not rely on trigger DDL');
assert.match(
  migration056,
  /CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_pet_owner_tuple\s+ON telegram_pet_season_slots\(pet_id, telegram_id, season_key, slot_number\)/,
  'migration 056 must provide a unique parent key for the complete pet ownership tuple',
);
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

db.exec(migration055);
db.exec(migration056);
db.exec(migration056);
db.exec(migration053);
db.exec(migration057);
db.exec(migration057);
assert.equal(db.prepare(`SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id='pet:state-player:2026-q3:1'`).get().phase, 'adult', 'migration must retain the starter lifecycle');

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
  getPetProfile, savePetProfile, buyPetSeasonSlot, switchActivePetSeasonSlot,
  getMoonpetLifecycle, incubateMoonEgg,
  getMoonpetIdentitySummary, serializePet,
} = __petMediaTestHooks;
const d1 = new SqliteD1(db);

db.prepare(`UPDATE telegram_pet_instances SET pet_name='Instance Nova', pet_xp=5100, level=52,
  moon_gold=901, energy=88, last_decay_at=?, source_profile_updated_at='2026-08-16 02:59:59',
  updated_at='2026-08-16 03:00:00' WHERE telegram_id='state-player'`).run(new Date().toISOString());
db.prepare(`UPDATE telegram_pet_profiles SET pet_name='Stale Profile', pet_xp=1, level=1,
  moon_gold=2, energy=3 WHERE telegram_id='state-player'`).run();
const runtimePet = await getPetProfile(d1, 'state-player');
assert.deepEqual(
  { pet_name: runtimePet.pet_name, pet_xp: runtimePet.pet_xp, level: runtimePet.level, moon_gold: runtimePet.moon_gold, energy: runtimePet.energy },
  { pet_name: 'Instance Nova', pet_xp: 5100, level: 52, moon_gold: 901, energy: 88 },
  'gameplay reads must use the active starter pet instance instead of stale profile state',
);
assert.deepEqual(
  { ...db.prepare(`SELECT pet_name, pet_xp, level, moon_gold, energy FROM telegram_pet_profiles WHERE telegram_id='state-player'`).get() },
  { pet_name: 'Instance Nova', pet_xp: 5100, level: 52, moon_gold: 901, energy: 88 },
  'instance reads must mirror the legacy profile payload fields',
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
  { pet_name: 'Saved Nova', pet_xp: 5200, moon_crystals: 55, energy: 77 },
  'gameplay writes must update the active pet instance',
);
assert.deepEqual(
  { ...db.prepare(`SELECT pet_name, pet_xp, moon_crystals, energy FROM telegram_pet_profiles WHERE telegram_id='state-player'`).get() },
  { pet_name: 'Saved Nova', pet_xp: 5200, moon_crystals: 55, energy: 77 },
  'gameplay writes must preserve the mirrored legacy profile',
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
db.prepare(`INSERT INTO arcade_progression_state (telegram_id, arcade_xp_total) VALUES ('state-player', 1500)`).run();
const boughtSecond = await buyPetSeasonSlot(d1, 'state-player', 2, { now: new Date('2026-08-16T12:00:00Z') });
assert.equal(boughtSecond.accepted, true, 'slot 2 purchase must succeed with enough Arcade XP');
assert.equal(db.prepare(`SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id='pet:state-player:pet-s2026-003:2'`).get().phase, 'egg', 'a purchased pet must receive a fresh egg lifecycle');
assert.equal(db.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='state-player'`).get().pet_id, 'pet:state-player:pet-s2026-003:1', 'purchase must not auto-switch');
assert.equal((await getMoonpetLifecycle(d1, 'state-player')).phase, 'adult', 'migration-safe lifecycle creation must preserve a legacy starter as adult');
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
assert.equal(db.prepare(`SELECT incubation_progress FROM telegram_pet_lifecycle_by_pet WHERE pet_id='pet:state-player:pet-s2026-003:1'`).get().incubation_progress, 12, 'paid-pet incubation must not change the starter lifecycle');
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
await switchActivePetSeasonSlot(d1, 'state-player', 1, { now: new Date('2026-08-16T12:00:00Z') });
assert.equal((await getPetProfile(d1, 'state-player')).pet_name, 'Saved Nova', 'switching back must restore the starter pet independent state');
assert.equal((await getMoonpetLifecycle(d1, 'state-player')).phase, 'adult', 'switching back must restore the starter lifecycle');
assert.equal(db.prepare(`SELECT energy FROM telegram_pet_instances WHERE season_key='pet-s2026-003' AND slot_number=2 AND telegram_id='state-player'`).get().energy, 42, 'writes must affect only the active paid pet');
const boughtThird = await buyPetSeasonSlot(d1, 'state-player', 3, { now: new Date('2026-08-16T12:00:00Z') });
assert.equal(boughtThird.accepted, true, 'slot 3 purchase must succeed with enough Arcade XP');
assert.equal(db.prepare(`SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id='state-player'`).get().arcade_xp_total, 0, 'Arcade XP must be deducted exactly once');
assert.deepEqual({ ...db.prepare(`SELECT pet_name, pet_xp, energy FROM telegram_pet_instances WHERE season_key='pet-s2026-003' AND slot_number=3 AND telegram_id='state-player'`).get() }, { pet_name: 'Moonpet', pet_xp: 0, energy: 70 }, 'a purchased pet must be a fresh instance');
assert.equal((await buyPetSeasonSlot(d1, 'state-player', 3, { now: new Date('2026-08-16T12:00:00Z') })).reason, 'pet_slot_already_owned', 'duplicate purchase must be rejected without another deduction');
assert.equal((await buyPetSeasonSlot(d1, 'state-player', 4, { now: new Date('2026-08-16T12:00:00Z') })).reason, 'invalid_pet_slot', 'slot 4 must be rejected');
assert.equal((await switchActivePetSeasonSlot(d1, 'other-player', 'pet:state-player:2026-q3:3', { now: new Date('2026-08-16T12:00:00Z') })).accepted, false, 'another owner cannot switch to the player pet');
db.prepare(`UPDATE telegram_pet_season_slots SET status='archived' WHERE pet_id='pet:state-player:pet-s2026-003:3'`).run();
assert.equal((await switchActivePetSeasonSlot(d1, 'state-player', 3, { now: new Date('2026-08-16T12:00:00Z') })).accepted, false, 'an archived season slot cannot become active');

db.prepare(`INSERT INTO telegram_pet_profiles (telegram_id, pet_name) VALUES ('poor-player', 'Poor starter')`).run();
db.prepare(`INSERT INTO arcade_progression_state (telegram_id, arcade_xp_total) VALUES ('poor-player', 499)`).run();
const insufficient = await buyPetSeasonSlot(d1, 'poor-player', 2, { now: new Date('2026-08-16T12:00:00Z') });
assert.equal(insufficient.reason, 'insufficient_arcade_xp', 'insufficient Arcade XP must reject a paid slot purchase');
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_season_slots WHERE telegram_id='poor-player' AND slot_number=2`).get().count, 0, 'insufficient XP must not create the paid slot');
assert.equal(db.prepare(`SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id='poor-player'`).get().arcade_xp_total, 499, 'a rejected purchase must not deduct Arcade XP');

console.log('telegram-pets-per-pet-state.test.mjs passed');
