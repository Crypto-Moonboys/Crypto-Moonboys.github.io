import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  PET_SEASON_COMPLETION_CONFIG, awardPetGrowthMark, awardPetWeeklyCrest,
  evaluatePetSeasonCompletion, getPetSeasonWeek, isPetLegendary,
} from '../workers/moonboys-api/pets/season-completion.js';

class Statement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.db, this.sql, args); }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() { const result = this.db.prepare(this.sql).run(...this.args); return { meta: { changes: result.changes } }; }
}
class D1 { constructor(db) { this.db = db; } prepare(sql) { return new Statement(this.db, sql); } }

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE telegram_pet_profiles (telegram_id TEXT PRIMARY KEY);
CREATE TABLE telegram_pet_instances (pet_id TEXT PRIMARY KEY, telegram_id TEXT, level INTEGER, pet_xp INTEGER);
CREATE TABLE telegram_pet_season_slots (pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT);
CREATE TABLE telegram_pet_evolutions_by_pet (pet_id TEXT, telegram_id TEXT, evolution_id TEXT, stage INTEGER, unlock_event_key TEXT, unlocked_at TEXT, PRIMARY KEY(pet_id,evolution_id));
CREATE TABLE telegram_pet_boss_victories (telegram_id TEXT, boss_id TEXT, victories INTEGER, PRIMARY KEY(telegram_id,boss_id));
CREATE TABLE telegram_pet_material_balances (telegram_id TEXT, material_key TEXT, quantity INTEGER, PRIMARY KEY(telegram_id,material_key));
CREATE TABLE telegram_pet_inventory (telegram_id TEXT, asset_type TEXT, asset_key TEXT, quantity INTEGER, PRIMARY KEY(telegram_id,asset_type,asset_key));
CREATE TABLE telegram_pet_relics (telegram_id TEXT, relic_id TEXT);
INSERT INTO telegram_pet_profiles VALUES ('owner'), ('attacker');
INSERT INTO telegram_pet_instances VALUES ('pet-a','owner',50,4900), ('pet-b','owner',1,0), ('forged','attacker',50,4900);
INSERT INTO telegram_pet_season_slots VALUES ('pet-a','owner','s1'), ('pet-b','owner','s1'), ('forged','attacker','s1');`);
sqlite.exec(await readFile(new URL('../workers/moonboys-api/migrations/058_telegram_pet_season_completion.sql', import.meta.url), 'utf8'));
const db = new D1(sqlite);

assert.equal(getPetSeasonWeek({ start_at: '2026-01-01T00:00:00Z' }, new Date('2026-01-08T00:00:00Z')), 2);
assert.equal(await isPetLegendary(db, 'pet-a', 's1'), false, 'level alone is never Legendary authority');
for (const [stage, evolution] of ['moon_egg', 'street_moonpet', 'cyber_moonpet', 'elite_moonpet', 'legendary_moon_guardian'].entries()) {
  sqlite.prepare('INSERT INTO telegram_pet_evolutions_by_pet VALUES (?,?,?,?,?,?)').run('pet-a', 'owner', evolution, stage, `unlock-${stage}`, `2026-01-0${stage + 1}T00:00:00Z`);
}
assert.equal(await isPetLegendary(db, 'pet-a', 's1'), true, 'the final persisted per-pet evolution is Legendary authority');
assert.equal(await isPetLegendary(db, 'pet-b', 's1'), false, 'Pet A evolution must not advance Pet B');

const mark = { pet_id: 'pet-a', telegram_id: 'owner', season_key: 's1', milestone: 'boss', evidence_key: 'boss:first-clear' };
assert.equal((await awardPetGrowthMark(db, mark)).accepted, true);
assert.equal((await awardPetGrowthMark(db, mark)).duplicate, true, 'replayed growth evidence is idempotent');
assert.equal((await awardPetGrowthMark(db, { ...mark, pet_id: 'forged' })).accepted, false, 'foreign pet IDs are rejected');
const crest = { pet_id: 'pet-a', telegram_id: 'owner', season_key: 's1', season_week: 1, objective: 'weekly_boss', evidence_key: 'weekly-boss:s1:1' };
assert.equal((await awardPetWeeklyCrest(db, crest)).accepted, true);
assert.equal((await awardPetWeeklyCrest(db, { ...crest, evidence_key: 'weekly-boss:s1:1:replay' })).duplicate, true, 'weekly objective cannot award twice');

let state = await evaluatePetSeasonCompletion(db, 'pet-a', 's1', new Date('2026-02-01'), { telegram_id: 'owner' });
assert.equal(state.legendary, true);
assert.equal(state.season_complete, false, 'Legendary alone cannot bypass the season journey');
for (let week = 2; week <= PET_SEASON_COMPLETION_CONFIG.required_weekly_crests; week += 1) await awardPetWeeklyCrest(db, { ...crest, season_week: week, evidence_key: `weekly-boss:s1:${week}` });
state = await evaluatePetSeasonCompletion(db, 'pet-a', 's1', new Date('2026-02-28'), { telegram_id: 'owner' });
assert.equal(state.season_complete, true);
assert.equal(state.sanctuary_eligible, true);
const completedAt = state.completed_at;
state = await evaluatePetSeasonCompletion(db, 'pet-a', 's1', new Date('2026-03-01'), { telegram_id: 'owner' });
assert.equal(state.completed_at, completedAt, 'repeat evaluation preserves the immutable completion timestamp');
assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM telegram_pet_season_completions WHERE pet_id=?').get('pet-a').count, 1);
assert.equal((await evaluatePetSeasonCompletion(db, 'pet-a', 's1', new Date(), { telegram_id: 'attacker' })), null, 'ownership is checked from D1, not stale client state');
assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM telegram_pet_growth_marks WHERE pet_id=?').get('pet-b').count, 0, 'Pet B remains isolated');

console.log('telegram pet season completion tests passed');
