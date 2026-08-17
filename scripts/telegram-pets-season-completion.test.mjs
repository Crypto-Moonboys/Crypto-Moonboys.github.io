import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  PET_SEASON_COMPLETION_CONFIG, awardPetGrowthMark, awardPetWeeklyCrest,
  evaluatePetSeasonCompletion, getPetSeasonWeek, isPetLegendary, reconcileEvolutionGrowthMarks,
} from '../workers/moonboys-api/pets/season-completion.js';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

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
CREATE TABLE telegram_pet_season_slots (pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, slot_number INTEGER, status TEXT, acquisition_type TEXT);
CREATE TABLE telegram_pet_instances (pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, slot_number INTEGER, level INTEGER, pet_xp INTEGER, status TEXT,
  FOREIGN KEY(telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE);
CREATE TABLE telegram_pet_active_slots (telegram_id TEXT PRIMARY KEY, pet_id TEXT, season_key TEXT);
CREATE TABLE telegram_pet_evolutions_by_pet (pet_id TEXT, telegram_id TEXT, evolution_id TEXT, stage INTEGER, unlock_event_key TEXT, unlocked_at TEXT, PRIMARY KEY(pet_id,evolution_id));
CREATE TABLE telegram_pet_boss_victories (telegram_id TEXT, boss_id TEXT, victories INTEGER, PRIMARY KEY(telegram_id,boss_id));
CREATE TABLE telegram_pet_material_balances (telegram_id TEXT, material_key TEXT, quantity INTEGER, PRIMARY KEY(telegram_id,material_key));
CREATE TABLE telegram_pet_inventory (telegram_id TEXT, asset_type TEXT, asset_key TEXT, quantity INTEGER, PRIMARY KEY(telegram_id,asset_type,asset_key));
CREATE TABLE telegram_pet_relics (telegram_id TEXT, relic_id TEXT);
INSERT INTO telegram_pet_profiles VALUES ('owner'), ('attacker'), ('production-owner');
INSERT INTO telegram_pet_season_slots VALUES ('pet-a','owner','s1',1,'active','free'), ('pet-b','owner','s1',2,'active','arcade_xp'), ('forged','attacker','s1',1,'active','free'), ('production-pet','production-owner','pet-s2026-001',1,'active','free'), ('production-pet-b','production-owner','pet-s2026-001',2,'active','arcade_xp');
INSERT INTO telegram_pet_instances VALUES ('pet-a','owner','s1',1,50,4900,'active'), ('pet-b','owner','s1',2,1,0,'active'), ('forged','attacker','s1',1,50,4900,'active'), ('production-pet','production-owner','pet-s2026-001',1,5,400,'active'), ('production-pet-b','production-owner','pet-s2026-001',2,5,400,'active');`);
sqlite.exec(await readFile(new URL('../workers/moonboys-api/migrations/058_telegram_pet_season_completion.sql', import.meta.url), 'utf8'));
sqlite.exec(await readFile(new URL('../workers/moonboys-api/migrations/061_moonpet_season_economy_calibration.sql', import.meta.url), 'utf8'));
const db = new D1(sqlite);

assert.equal(getPetSeasonWeek({ start_at: '2026-01-01T00:00:00Z' }, new Date('2026-01-08T00:00:00Z')), 2);
assert.equal(await isPetLegendary(db, 'pet-a', 's1'), false, 'level alone is never Legendary authority');
for (const [stage, evolution] of ['moon_egg', 'street_moonpet', 'cyber_moonpet', 'elite_moonpet', 'moon_guardian', 'legendary_moon_guardian'].entries()) {
  sqlite.prepare('INSERT INTO telegram_pet_evolutions_by_pet VALUES (?,?,?,?,?,?)').run('pet-a', 'owner', evolution, stage, `unlock-${stage}`, `2026-01-0${stage + 1}T00:00:00Z`);
}
assert.equal(await isPetLegendary(db, 'pet-a', 's1'), true, 'the final persisted per-pet evolution is Legendary authority');
assert.equal(await isPetLegendary(db, 'pet-b', 's1'), false, 'Pet A evolution must not advance Pet B');
sqlite.prepare(`INSERT INTO telegram_pet_evolutions_by_pet VALUES ('pet-b','attacker','legendary_moon_guardian',5,'forged-owner','2026-01-01')`).run();
assert.equal((await isPetLegendary(db, 'pet-b', 's1')), false, 'a mismatched evolution owner cannot grant Legendary state');
await reconcileEvolutionGrowthMarks(db, 'pet-a', 's1');
assert.equal((await hooks.getPetSeasonInfo(new Date('2026-12-31T23:59:59Z'))).key, 'pet-s2026-004');
assert.equal((await hooks.getPetSeasonInfo(new Date('2027-01-01T00:00:00Z'))).key, 'pet-s2027-001');
for (const [before, after, beforeKey, afterKey] of [
  ['2026-03-31T23:59:59Z', '2026-04-01T00:00:00Z', 'pet-s2026-001', 'pet-s2026-002'],
  ['2026-06-30T23:59:59Z', '2026-07-01T00:00:00Z', 'pet-s2026-002', 'pet-s2026-003'],
  ['2026-09-30T23:59:59Z', '2026-10-01T00:00:00Z', 'pet-s2026-003', 'pet-s2026-004'],
]) assert.deepEqual([hooks.getPetSeasonInfo(new Date(before)).key, hooks.getPetSeasonInfo(new Date(after)).key], [beforeKey, afterKey]);
assert.equal((Date.parse(hooks.getPetSeasonInfo(new Date('2024-02-29')).end_at) - Date.parse(hooks.getPetSeasonInfo(new Date('2024-02-29')).start_at)) / 86400000, 91, 'leap-year Q1 is a full quarter');

const mark = { pet_id: 'pet-a', telegram_id: 'owner', season_key: 's1', milestone: 'boss', evidence_key: 'boss:first-clear' };
assert.equal((await awardPetGrowthMark(db, mark)).accepted, true);
assert.equal((await awardPetGrowthMark(db, mark)).duplicate, true, 'replayed growth evidence is idempotent');
assert.equal((await awardPetGrowthMark(db, { ...mark, pet_id: 'forged' })).accepted, false, 'foreign pet IDs are rejected');
const malformedTimestampMark = await awardPetGrowthMark(db, {
  ...mark, pet_id: 'forged', telegram_id: 'attacker', milestone: 'evolution', evidence_key: 'evolution:street:malformed', earned_at: 'not-a-persisted-date',
});
assert.equal(malformedTimestampMark.accepted, true, 'malformed persisted evolution timestamps fall back safely during settlement');
assert.match(sqlite.prepare(`SELECT earned_at FROM telegram_pet_growth_marks WHERE mark_id=?`).get(malformedTimestampMark.mark_id).earned_at,
  /^\d{4}-\d{2}-\d{2}T/, 'timestamp fallback is a valid server ISO timestamp');
const crest = { pet_id: 'pet-a', telegram_id: 'owner', season_key: 's1', season_week: 1, objective: 'weekly_boss', evidence_key: 'weekly-boss:s1:1' };
assert.equal((await awardPetWeeklyCrest(db, crest)).accepted, true);
assert.equal((await awardPetWeeklyCrest(db, { ...crest, evidence_key: 'weekly-boss:s1:1:replay' })).duplicate, true, 'weekly objective cannot award twice');
assert.equal((await awardPetWeeklyCrest(db, { ...crest, objective: 'weekly_journey', evidence_key: 'weekly-journey:s1:1' })).duplicate, true, 'a pet earns at most one Crest in a week');

let state = await evaluatePetSeasonCompletion(db, 'pet-a', 's1', new Date('2026-02-01'), { telegram_id: 'owner' });
assert.equal(state.legendary, true);
assert.equal(state.season_complete, false, 'Legendary alone cannot bypass the season journey');
assert.equal(state.weekly_crests.earned, 1, 'two objectives in week one count as one qualifying week');
for (let day = 6; day <= PET_SEASON_COMPLETION_CONFIG.required_growth_marks; day += 1) await awardPetGrowthMark(db, {
  ...mark, milestone: 'care', evidence_key: `care:day-${day}`, earned_at: new Date(Date.UTC(2026, 0, day, 12)).toISOString(),
});
for (let week = 2; week < PET_SEASON_COMPLETION_CONFIG.required_weekly_crests; week += 1) await awardPetWeeklyCrest(db, { ...crest, season_week: week, evidence_key: `weekly-boss:s1:${week}` });
state = await evaluatePetSeasonCompletion(db, 'pet-a', 's1', new Date('2026-02-21'), { telegram_id: 'owner' });
assert.equal(state.weekly_crests.earned, 9);
assert.equal(state.season_complete, false, 'nine distinct qualifying weeks remain incomplete');
sqlite.prepare(`INSERT INTO telegram_pet_growth_marks
  (mark_id,pet_id,telegram_id,season_key,milestone_type,evidence_key,earned_day,earned_at)
  VALUES ('historical-unqualified','pet-a','owner','s1','care_milestone','care:historical',NULL,'2025-01-01')`).run();
sqlite.prepare(`INSERT INTO telegram_pet_weekly_crests
  (crest_id,pet_id,telegram_id,season_key,season_week,qualification_week,objective_id,evidence_key,earned_at)
  VALUES ('historical-crest','pet-a','owner','s1',10,NULL,'weekly_journey','weekly-journey:historical','2025-01-01')`).run();
state = await evaluatePetSeasonCompletion(db, 'pet-a', 's1', new Date('2026-02-21'), { telegram_id: 'owner' });
assert.equal(state.growth_marks.earned, 60, 'unqualified historical duplicate Marks cannot bypass calendar pacing');
assert.equal(state.weekly_crests.earned, 9, 'unqualified historical Crests cannot bypass calendar pacing');
assert.equal(state.season_complete, false);
await awardPetWeeklyCrest(db, { ...crest, season_week: 10, evidence_key: 'weekly-boss:s1:10' });
state = await evaluatePetSeasonCompletion(db, 'pet-a', 's1', new Date('2026-02-28'), { telegram_id: 'owner' });
assert.equal(state.season_complete, true);
assert.equal(state.sanctuary_eligible, true);
assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM telegram_pet_season_completions WHERE pet_id='pet-a'`).get().count, 1, 'authoritative awards finalize completion without opening the Mini App');
const completedAt = state.completed_at;
state = await evaluatePetSeasonCompletion(db, 'pet-a', 's1', new Date('2026-03-01'), { telegram_id: 'owner' });
assert.equal(state.completed_at, completedAt, 'repeat evaluation preserves the immutable completion timestamp');
assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM telegram_pet_season_completions WHERE pet_id=?').get('pet-a').count, 1);
assert.equal((await evaluatePetSeasonCompletion(db, 'pet-a', 's1', new Date(), { telegram_id: 'attacker' })), null, 'ownership is checked from D1, not stale client state');
assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM telegram_pet_growth_marks WHERE pet_id=?').get('pet-b').count, 0, 'Pet B remains isolated');
sqlite.prepare(`INSERT INTO telegram_pet_season_slots VALUES ('pet-next','owner','pet-s2026-002',1,'active','free')`).run();
sqlite.prepare(`INSERT INTO telegram_pet_instances VALUES ('pet-next','owner','pet-s2026-002',1,1,0,'active')`).run();
sqlite.prepare(`INSERT INTO telegram_pet_active_slots VALUES ('owner','pet-next','pet-s2026-002')`).run();
assert.equal((await evaluatePetSeasonCompletion(db, 'pet-a', 's1', new Date(), { telegram_id: 'owner' })).sanctuary_eligible, true, 'rollover does not erase persisted completion eligibility');

sqlite.prepare(`INSERT INTO telegram_pet_active_slots VALUES ('production-owner','production-pet','pet-s2026-001')`).run();
const productionCrest = await hooks.recordWeeklyBossVictoryCrest(db, 'production-owner', '2026-W06', 'alley_king', 'persisted-boss-event', new Date('2026-02-05'));
assert.equal(productionCrest.accepted || productionCrest.duplicate, true, 'the production weekly boss settlement hook awards an active-pet crest');
sqlite.prepare(`UPDATE telegram_pet_active_slots SET pet_id='production-pet-b' WHERE telegram_id='production-owner'`).run();
assert.equal((await hooks.awardStoredWeeklyBossVictoryCrest(db, 'production-owner', '2026-W06', 'alley_king', new Date('2026-02-05'))).duplicate, true);
assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM telegram_pet_weekly_crests WHERE pet_id='production-pet'`).get().count, 1, 'recovery remains owned by victorious Pet A');
assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM telegram_pet_weekly_crests WHERE pet_id='production-pet-b'`).get().count, 0, 'active Pet B cannot steal Pet A victory crest');
assert.equal((await hooks.awardStoredWeeklyBossVictoryCrest({ prepare() { throw new Error('migration unavailable'); } }, 'production-owner', '2026-W06', 'alley_king')).non_fatal, true, 'crest storage failure cannot break boss settlement');

assert.throws(() => sqlite.prepare(`INSERT INTO telegram_pet_growth_marks
  (mark_id,pet_id,telegram_id,season_key,milestone_type,evidence_key,earned_day,earned_at)
  VALUES ('foreign','pet-a','attacker','s1','boss_milestone','boss:foreign','2025-08-17','2025-08-17')`).run(), /FOREIGN KEY/);
sqlite.prepare(`DELETE FROM telegram_pet_instances WHERE pet_id='pet-a'`).run();
for (const table of ['telegram_pet_growth_marks', 'telegram_pet_weekly_crests', 'telegram_pet_season_completions']) assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM ${table} WHERE pet_id='pet-a'`).get().count, 0, `${table} cascades on pet deletion`);
await awardPetGrowthMark(db, { pet_id: 'pet-b', telegram_id: 'owner', season_key: 's1', milestone: 'care', evidence_key: 'care:profile-delete' });
sqlite.prepare(`DELETE FROM telegram_pet_profiles WHERE telegram_id='owner'`).run();
assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM telegram_pet_growth_marks WHERE telegram_id='owner'`).get().count, 0, 'profile deletion leaves no orphaned evidence');

console.log('telegram pet season completion tests passed');
