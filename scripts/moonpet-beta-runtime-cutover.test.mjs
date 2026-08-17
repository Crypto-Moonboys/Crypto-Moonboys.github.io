import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = fs.readFileSync(
  new URL('../workers/moonboys-api/migrations/064_moonpet_beta_runtime_cutover.sql', import.meta.url),
  'utf8',
);

const resetTables = [...migration.matchAll(/^DELETE FROM ([a-z0-9_]+);$/gm)].map((match) => match[1]);
assert.equal(new Set(resetTables).size, resetTables.length, 'each runtime table must be reset once');
assert.ok(resetTables.length > 0, 'the cutover must explicitly enumerate its bounded runtime tables');
assert.doesNotMatch(migration, /CREATE\s+TRIGGER|DROP\s+TABLE|ALTER\s+TABLE/i,
  'the reset must not add pet_id enforcement or rebuild unrelated schemas');
assert.match(migration, /UPDATE\s+telegram_pet_instances\s+SET/i,
  'the cutover must reset mirrored gameplay fields on pet instances as well as profiles');

const preservedTables = [
  'telegram_users',
  'telegram_link_tokens',
  'telegram_pet_season_slots',
  'telegram_pet_active_slots',
  'telegram_pet_lifecycle_by_pet',
  'telegram_pet_evolutions_by_pet',
  'telegram_pet_growth_marks',
  'telegram_pet_weekly_crests',
  'telegram_pet_season_completions',
  'telegram_pet_sanctuary',
  'telegram_pet_cosmetic_unlocks',
  'arcade_progression_state',
  'arcade_progression_events',
  'arcade_xp_wallets',
];
for (const table of preservedTables) {
  assert.ok(!resetTables.includes(table), `${table} must remain outside the beta reset boundary`);
}
assert.ok(!resetTables.includes('telegram_pet_instances'), 'pet instance ownership rows must be preserved, not deleted');

const db = new DatabaseSync(':memory:');
for (const table of [...resetTables, ...preservedTables]) {
  db.exec(`CREATE TABLE ${table} (sentinel TEXT PRIMARY KEY)`);
  db.prepare(`INSERT INTO ${table} (sentinel) VALUES (?)`).run(table);
}
db.exec(`CREATE TABLE telegram_pet_profiles (
  telegram_id TEXT PRIMARY KEY, pet_name TEXT, species TEXT, stage TEXT,
  pet_xp INTEGER, level INTEGER, hunger INTEGER, happiness INTEGER, cleanliness INTEGER,
  energy INTEGER, health INTEGER, streak_days INTEGER, moon_gold INTEGER, moon_crystals INTEGER,
  style_tokens INTEGER, equipped_food TEXT, equipped_toy TEXT, equipped_outfit TEXT,
  equipped_armor TEXT, equipped_weapon TEXT, equipped_charm TEXT, last_active_day TEXT,
  last_decay_at TEXT, updated_at TEXT
)`);
db.exec(`INSERT INTO telegram_pet_profiles VALUES (
  'tg-1', 'Kept Callsign', 'lunar_fox', 'adult', 900, 9, 1, 2, 3, 4, 5, 6,
  700, 80, 90, 'food', 'toy', 'outfit', 'armor', 'weapon', 'charm', '2026-08-16',
  '2026-08-16', '2026-08-16'
)`);

db.exec(`CREATE TABLE telegram_pet_instances (
  pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, slot_number INTEGER,
  pet_name TEXT, species TEXT, stage TEXT, status TEXT,
  pet_xp INTEGER, level INTEGER, hunger INTEGER, happiness INTEGER, cleanliness INTEGER,
  energy INTEGER, health INTEGER, streak_days INTEGER, moon_gold INTEGER, moon_crystals INTEGER,
  style_tokens INTEGER, equipped_food TEXT, equipped_toy TEXT, equipped_outfit TEXT,
  equipped_armor TEXT, equipped_weapon TEXT, equipped_charm TEXT, last_active_day TEXT,
  last_decay_at TEXT, source_profile_updated_at TEXT, created_at TEXT, updated_at TEXT
)`);
db.exec(`INSERT INTO telegram_pet_instances VALUES (
  'pet-1', 'tg-1', 'pet-s2026-003', 1, 'Instance Callsign', 'lunar_fox', 'adult', 'active',
  1200, 12, 2, 3, 4, 5, 6, 7, 900, 100, 110, 'inst-food', 'inst-toy', 'inst-outfit',
  'inst-armor', 'inst-weapon', 'inst-charm', '2026-08-16', '2026-08-16', '2026-08-16',
  '2026-08-01', '2026-08-16'
)`);

db.exec('BEGIN IMMEDIATE');
try {
  db.exec(migration);
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

for (const table of resetTables) {
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0,
    `${table} beta runtime must be empty after cutover`);
}
for (const table of preservedTables) {
  assert.equal(db.prepare(`SELECT sentinel FROM ${table}`).get().sentinel, table,
    `${table} must survive the runtime cutover`);
}
const profile = db.prepare(`SELECT pet_name, species, stage, pet_xp, level, hunger, happiness,
  cleanliness, energy, health, streak_days, moon_gold, moon_crystals, style_tokens,
  equipped_food, last_active_day FROM telegram_pet_profiles`).get();
assert.deepEqual({ ...profile }, {
  pet_name: 'Kept Callsign', species: 'lunar_fox', stage: 'adult', pet_xp: 0, level: 1,
  hunger: 25, happiness: 70, cleanliness: 70, energy: 70, health: 75, streak_days: 0,
  moon_gold: 0, moon_crystals: 0, style_tokens: 0, equipped_food: null, last_active_day: null,
}, 'profile identity must survive while mixed-in legacy gameplay state is reset');

const instance = db.prepare(`SELECT pet_id, telegram_id, season_key, slot_number, pet_name, species,
  stage, status, pet_xp, level, hunger, happiness, cleanliness, energy, health, streak_days,
  moon_gold, moon_crystals, style_tokens, equipped_food, equipped_toy, equipped_outfit,
  equipped_armor, equipped_weapon, equipped_charm, last_active_day FROM telegram_pet_instances`).get();
assert.deepEqual({ ...instance }, {
  pet_id: 'pet-1', telegram_id: 'tg-1', season_key: 'pet-s2026-003', slot_number: 1,
  pet_name: 'Instance Callsign', species: 'lunar_fox', stage: 'adult', status: 'active',
  pet_xp: 0, level: 1, hunger: 25, happiness: 70, cleanliness: 70, energy: 70, health: 75,
  streak_days: 0, moon_gold: 0, moon_crystals: 0, style_tokens: 0, equipped_food: null,
  equipped_toy: null, equipped_outfit: null, equipped_armor: null, equipped_weapon: null,
  equipped_charm: null, last_active_day: null,
}, 'pet instance ownership/identity must survive while mirrored beta gameplay fields are reset');

const marker = db.prepare('SELECT cutover_key, policy_version, reason FROM telegram_pet_runtime_cutovers').get();
assert.deepEqual({ ...marker }, {
  cutover_key: 'moonpet-beta-pet-id-2026-08',
  policy_version: 1,
  reason: 'Discard unsafe beta runtime before bounded pet_id writer conversions',
});
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger'").get().count, 0,
  'the cutover must not enable pet_id enforcement before writer conversion');

console.log(`Moonpet beta runtime cutover rehearsal passed (${resetTables.length} reset tables, ${preservedTables.length} preserved tables).`);
