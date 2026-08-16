import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

class SqliteD1Statement {
  constructor(database, sql, bindings = []) { this.database = database; this.sql = sql; this.bindings = bindings; }
  bind(...bindings) { return new SqliteD1Statement(this.database, this.sql, bindings); }
  async first() { return this.database.prepare(this.sql).get(...this.bindings) || null; }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.bindings);
    return { meta: { changes: result.changes } };
  }
}

class SqliteD1 {
  constructor(database) { this.database = database; }
  prepare(sql) { return new SqliteD1Statement(this.database, sql); }
}

const migration055 = await readFile(new URL('../workers/moonboys-api/migrations/055_telegram_pet_season_slots.sql', import.meta.url), 'utf8');
const migration056 = await readFile(new URL('../workers/moonboys-api/migrations/056_telegram_pet_instance_state.sql', import.meta.url), 'utf8');
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
  getPetProfile, savePetProfile,
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

db.prepare(`UPDATE telegram_pet_active_slots SET pet_id='pet:state-player:2026-q3:2' WHERE telegram_id='state-player'`).run();
assert.equal(await findActivePetSlot(d1, 'state-player'), null, 'a paid slot pointer must not be treated as active gameplay state before switching launches');
assert.equal(await writeActivePetInstance(d1, 'state-player', runtimePet), false, 'paid slots must not have instances auto-created or used');
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances WHERE slot_number=2`).get().count, 0, 'paid slot rows must remain without auto-created instances');

console.log('telegram-pets-per-pet-state.test.mjs passed');
