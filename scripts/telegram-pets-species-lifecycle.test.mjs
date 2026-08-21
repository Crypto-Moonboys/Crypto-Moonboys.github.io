import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  MOONPET_SPECIES, createMoonEggLifecycle, getMoonpetLifecycle, hatchMoonpet, incubateMoonEgg, incubationAgeDays, morphMoonpetRare,
} from '../workers/moonboys-api/pets/species-lifecycle.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

assert.equal(incubationAgeDays({ created_at: '2026-08-01 00:00:00' }, '2026-08-08T00:00:00Z'), 7);
assert.equal(incubationAgeDays({ created_at: '2026-08-01T02:00:00+02:00' }, '2026-08-08T00:00:00Z'), 7,
  'D1 UTC timestamps and equivalent offset timestamps produce identical incubation age');

class Statement {
  constructor(adapter, sql, args = []) { this.adapter = adapter; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.adapter, this.sql, args); }
  async first() { return this.adapter.database.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.adapter.database.prepare(this.sql).all(...this.args) }; }
  async run() { const result = this.adapter.database.prepare(this.sql).run(...this.args); return { meta: { changes: Number(result.changes || 0) } }; }
}
class D1 {
  constructor() { this.database = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.database.exec('COMMIT'); return results; }
    catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
}
function provisionActivePet(database, telegramId) {
  database.exec(`
    CREATE TABLE telegram_pet_instances (pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, slot_number INTEGER DEFAULT 1, level INTEGER DEFAULT 1, pet_xp INTEGER DEFAULT 0, status TEXT DEFAULT 'active');
    CREATE TABLE telegram_pet_season_slots (pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, slot_number INTEGER DEFAULT 1, status TEXT DEFAULT 'active', updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE telegram_pet_active_slots (telegram_id TEXT PRIMARY KEY, pet_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_growth_marks (mark_id TEXT PRIMARY KEY, pet_id TEXT, telegram_id TEXT, season_key TEXT, milestone_type TEXT, evidence_key TEXT, earned_day TEXT, earned_at TEXT, UNIQUE(pet_id,season_key,earned_day));
    CREATE TABLE telegram_pet_weekly_crests (pet_id TEXT, telegram_id TEXT, season_key TEXT, qualification_week INTEGER);
    CREATE TABLE telegram_pet_lifecycle_by_pet (
      pet_id TEXT PRIMARY KEY, telegram_id TEXT, lifecycle_version INTEGER DEFAULT 1, identity_seed TEXT,
      phase TEXT DEFAULT 'egg', species_id TEXT, palette_id TEXT, marking_id TEXT, eye_style TEXT, temperament TEXT,
      innate_traits_json TEXT DEFAULT '[]', incubation_progress INTEGER DEFAULT 0, incubation_json TEXT DEFAULT '{}',
      rare_route_index INTEGER, rare_morph_id TEXT, hatched_at TEXT, adult_at TEXT, rare_morphed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE telegram_pet_lifecycle_events_by_pet (
      event_id TEXT PRIMARY KEY, pet_id TEXT, telegram_id TEXT, event_key TEXT, action TEXT,
      payload_json TEXT DEFAULT '{}', progress_delta INTEGER DEFAULT 0, day_key TEXT DEFAULT (strftime('%Y-%m-%d', 'now')),
      applied_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(pet_id, event_key)
    );
  `);
  const petId = `pet:${telegramId}:test:1`;
  database.prepare(`INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number) VALUES (?, ?, 'test', 1)`).run(petId, telegramId);
  database.prepare(`INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number) VALUES (?, ?, 'test', 1)`).run(petId, telegramId);
  database.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key) VALUES (?, ?, 'test')`).run(telegramId, petId);
}

const db = new D1();
db.database.exec(`
  CREATE TABLE telegram_pet_profiles (telegram_id TEXT PRIMARY KEY, species TEXT NOT NULL DEFAULT '', stage TEXT DEFAULT 'egg', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE telegram_pet_evolutions (telegram_id TEXT, stage INTEGER);
  CREATE TABLE telegram_pet_memories (pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, exploration_actions INTEGER DEFAULT 0, total_runs INTEGER DEFAULT 0,
    combat_actions INTEGER DEFAULT 0, total_bosses_defeated INTEGER DEFAULT 0, care_actions INTEGER DEFAULT 0, event_actions INTEGER DEFAULT 0,
    adventure_actions INTEGER DEFAULT 0);
  CREATE TABLE telegram_pet_personality_traits (pet_id TEXT, telegram_id TEXT, season_key TEXT, trait_id TEXT, unlocked_at TEXT);
  CREATE TABLE telegram_pet_evolutions_by_pet (pet_id TEXT, telegram_id TEXT, evolution_id TEXT, stage INTEGER);
`);
db.database.exec(await (await import('node:fs/promises')).readFile(new URL('../workers/moonboys-api/migrations/053_telegram_pet_species_lifecycle.sql', import.meta.url), 'utf8'));
db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id) VALUES (?)').run('new-player');
provisionActivePet(db.database, 'new-player');
assert.equal(db.database.prepare('SELECT species FROM telegram_pet_profiles WHERE telegram_id=?').get('new-player').species, '', 'new pet profiles must not default to a fake species');
db.database.prepare('DELETE FROM telegram_pet_lifecycle_by_pet WHERE telegram_id=?').run('new-player');
const created = await createMoonEggLifecycle(db, 'new-player', 'adopt:1');
assert.equal(Object.hasOwn(created, 'identity_seed'), false, 'private identity seed must never be returned');
let lifecycle = await getMoonpetLifecycle(db, 'new-player');
assert.equal(lifecycle.phase, 'egg');
assert.equal(lifecycle.species_id, null, 'species must stay secret before hatching');

for (const [index, care] of ['warm', 'talk', 'music', 'warm', 'talk', 'music'].entries()) {
  assert.equal((await incubateMoonEgg(db, 'new-player', care, `care:${index}`)).accepted, true);
}
for (const care of ['warm', 'talk', 'music', 'rest']) {
  assert.equal((await incubateMoonEgg(db, 'new-player', care, `cap:${care}`)).accepted, care === 'warm' || care === 'talk');
}
assert.equal((await incubateMoonEgg(db, 'new-player', 'rest', 'cap:blocked')).reason, 'incubation_daily_cap');
assert.equal((await incubateMoonEgg(db, 'new-player', 'music', 'care:0')).duplicate, true, 'request keys must be idempotent');
lifecycle = await getMoonpetLifecycle(db, 'new-player');
assert.equal(lifecycle.incubation.ready, false, 'strong engagement cannot compress incubation below seven days');
assert.equal((await hatchMoonpet(db, 'new-player', 'hatch:too-early')).reason, 'egg_not_ready');
db.database.prepare(`UPDATE telegram_pet_lifecycle_by_pet SET created_at=datetime('now','-7 days') WHERE telegram_id=?`).run('new-player');
for (let offset = 1; offset <= 6; offset += 1) {
  const awardDay = new Date(Date.now() + offset * 86400000);
  assert.equal((await incubateMoonEgg(db, 'new-player', 'warm', `growth-day:${offset}`, awardDay)).accepted, true);
}
assert.equal(db.database.prepare(`SELECT COUNT(DISTINCT earned_day) count FROM telegram_pet_growth_marks WHERE pet_id='pet:new-player:test:1'`).get().count, 7,
  'fresh eggs have a server-authoritative daily Growth Mark path before Street evolution');
lifecycle = await getMoonpetLifecycle(db, 'new-player');
assert.equal(lifecycle.incubation.ready, true, 'strong engagement enables the earliest day-seven hatch');
const hatched = await hatchMoonpet(db, 'new-player', 'hatch:1');
assert.equal(hatched.accepted, true);
assert.equal((await hatchMoonpet(db, 'new-player', 'hatch:1')).duplicate, true, 'hatching must be idempotent');
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_events_by_pet WHERE telegram_id=? AND action='hatch' AND applied_at IS NOT NULL").get('new-player').count, 1, 'hatch must have exactly one applied audit event');
assert.ok(Object.hasOwn(MOONPET_SPECIES, hatched.lifecycle.species_id));
assert.equal(hatched.lifecycle.innate_traits.length, 2);
assert.ok(hatched.lifecycle.preferences.length >= 1, 'identity must expose stable behaviour preferences');
assert.equal(db.database.prepare('SELECT species FROM telegram_pet_profiles WHERE telegram_id=?').get('new-player').species, hatched.lifecycle.species_id);
db.database.prepare(`UPDATE telegram_pet_lifecycle_by_pet SET phase='adult' WHERE telegram_id='new-player'`).run();
db.database.prepare(`INSERT OR REPLACE INTO telegram_pet_memories VALUES ('pet:new-player:test:1','new-player','test',100,100,100,100,100,100,100)`).run();
for (const trait of ['explorer', 'curious', 'street_fighter', 'loyal']) db.database.prepare(
  `INSERT INTO telegram_pet_personality_traits VALUES ('pet:new-player:test:1','new-player','test',?,CURRENT_TIMESTAMP)`,
).run(trait);
db.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet VALUES ('pet:new-player:test:1','new-player','moon_guardian',4)`).run();
assert.equal((await morphMoonpetRare(db, 'new-player', 'rare:before-legendary')).reason, 'rare_signal_not_ready',
  'rare morph cannot trigger at the former final stage before Legendary stage 5');
db.database.prepare(`INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number) VALUES ('pet:new-player:test:2', 'new-player', 'test', 2)`).run();
db.database.prepare(`INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number) VALUES ('pet:new-player:test:2', 'new-player', 'test', 2)`).run();
db.database.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet
  (pet_id, telegram_id, identity_seed, phase, species_id, rare_route_index)
  VALUES ('pet:new-player:test:2', 'new-player', 'pet-b-seed', 'adult', 'lunar_fox', 0)`).run();
db.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet VALUES ('pet:new-player:test:2','new-player','legendary_moon_guardian',5)`).run();
db.database.prepare(`UPDATE telegram_pet_active_slots SET pet_id='pet:new-player:test:2' WHERE telegram_id='new-player'`).run();
const petBRareAttempt = await morphMoonpetRare(db, 'new-player', 'rare:pet-b-no-identity');
assert.equal(petBRareAttempt.reason, 'rare_signal_not_ready',
  'rare morph readiness for Pet B must not use Pet A memories or personality traits');

db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id) VALUES (?)').run('guaranteed-player');
db.database.prepare(`INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number) VALUES ('pet:guaranteed-player:test:1', 'guaranteed-player', 'test', 1)`).run();
db.database.prepare(`INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number) VALUES ('pet:guaranteed-player:test:1', 'guaranteed-player', 'test', 1)`).run();
db.database.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key) VALUES ('guaranteed-player', 'pet:guaranteed-player:test:1', 'test')`).run();
db.database.prepare('DELETE FROM telegram_pet_lifecycle_by_pet WHERE telegram_id=?').run('guaranteed-player');
await createMoonEggLifecycle(db, 'guaranteed-player', 'adopt:guaranteed');
db.database.prepare(`UPDATE telegram_pet_lifecycle_by_pet SET created_at=datetime('now','-14 days') WHERE telegram_id=?`).run('guaranteed-player');
assert.equal((await hatchMoonpet(db, 'guaranteed-player', 'hatch:guaranteed')).accepted, true, 'day fourteen guarantees hatch without engagement acceleration');

const pendingDb = new D1();
pendingDb.database.exec(`
  CREATE TABLE telegram_pet_profiles (telegram_id TEXT PRIMARY KEY, species TEXT NOT NULL DEFAULT '', stage TEXT DEFAULT 'egg', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE telegram_pet_evolutions (telegram_id TEXT, stage INTEGER);
  CREATE TABLE telegram_pet_memories (pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, exploration_actions INTEGER DEFAULT 0, total_runs INTEGER DEFAULT 0,
    combat_actions INTEGER DEFAULT 0, total_bosses_defeated INTEGER DEFAULT 0, care_actions INTEGER DEFAULT 0, event_actions INTEGER DEFAULT 0,
    adventure_actions INTEGER DEFAULT 0);
  CREATE TABLE telegram_pet_personality_traits (pet_id TEXT, telegram_id TEXT, season_key TEXT, trait_id TEXT, unlocked_at TEXT);
`);
pendingDb.database.exec(await (await import('node:fs/promises')).readFile(new URL('../workers/moonboys-api/migrations/053_telegram_pet_species_lifecycle.sql', import.meta.url), 'utf8'));
pendingDb.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id) VALUES (?)').run('pending-player');
provisionActivePet(pendingDb.database, 'pending-player');
pendingDb.database.prepare('DELETE FROM telegram_pet_lifecycle_by_pet WHERE telegram_id=?').run('pending-player');
await createMoonEggLifecycle(pendingDb, 'pending-player', 'adopt:pending');
pendingDb.database.prepare(`INSERT INTO telegram_pet_lifecycle_events_by_pet
  (event_id, pet_id, telegram_id, event_key, action, payload_json, progress_delta)
  VALUES ('pending-event', 'pet:pending-player:test:1', 'pending-player', 'pending-care', 'incubate_warm', '{}', 2)`).run();
const pendingRetry = await incubateMoonEgg(pendingDb, 'pending-player', 'warm', 'pending-care');
assert.equal(pendingRetry.accepted, false, 'a reserved but unapplied lifecycle event must not be reported as an accepted duplicate');
assert.equal(pendingRetry.reason, 'incubation_conflict');

console.log('telegram-pets-species-lifecycle.test.mjs passed');
