import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  PET_WEEKLY_JOURNEY_OBJECTIVES,
  WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,
  WEEKLY_JOURNEY_TOTAL_OBJECTIVES,
  WEEKLY_JOURNEY_SOURCE_OBJECTIVES,
  finalizeWeeklyJourneyCrest,
  recordWeeklyJourneyObjectiveEvidence,
} from '../workers/moonboys-api/pets/weekly-journey.js';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';
import { __dailyMoonRunTestHooks, PET_DAILY_CHALLENGES } from '../workers/moonboys-api/pets/daily-moon-run.js';

const {
  processPetWeeklyBoss,
  processPetDailyChest,
  processPetMiniAppAction,
  processPetAction,
  getPetSeasonInfo,
  getPetWeeklyBoss,
  recordPetRunBankedEvent,
} = __petMediaTestHooks;

function getPetWeekKey(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

class Statement {
  constructor(d1, sql, args = []) { this.d1 = d1; this.db = d1.database; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.d1, this.sql, args); }
  async first() {
    this.d1.beforeFirst?.(this.sql, this.args);
    return this.db.prepare(this.sql).get(...this.args) || null;
  }
  async all() {
    const override = this.d1.beforeAll?.(this.sql, this.args);
    if (override !== undefined) return override;
    return { results: this.db.prepare(this.sql).all(...this.args) };
  }
  async run() {
    if (this.d1.failWrite?.test(this.sql)) throw new Error('injected_journey_write_failure');
    if (/INSERT\s+OR\s+IGNORE\s+INTO\s+telegram_pet_weekly_crests/i.test(this.sql)) {
      this.d1.beforeWeeklyCrestInsert?.(this.args);
    }
    if (/INSERT\s+OR\s+IGNORE\s+INTO\s+telegram_pet_events/i.test(this.sql) && /'daily_moon_run'/i.test(this.sql)) {
      this.d1.beforeDailyMoonRunEventInsert?.(this.args);
    }
    const result = this.db.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(result.changes || 0) } };
  }
}

class D1 {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.beforeWeeklyCrestInsert = null;
    this.beforeDailyMoonRunEventInsert = null;
    this.beforeWeeklyBossEventInsert = null;
    this.beforeFirst = null;
    this.beforeAll = null;
  }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) {
        if (/INSERT\s+OR\s+IGNORE\s+INTO\s+telegram_pet_events/i.test(statement.sql) && /'weekly_boss'/i.test(statement.sql)) {
          this.beforeWeeklyBossEventInsert?.(statement.args);
        }
        const prepared = this.database.prepare(statement.sql);
        if (/\bRETURNING\b/i.test(statement.sql)) {
          const rows = prepared.all(...statement.args);
          results.push({ results: rows, meta: { changes: rows.length } });
        } else {
          const result = prepared.run(...statement.args);
          results.push({ results: [], meta: { changes: Number(result.changes || 0) } });
        }
      }
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

const schema = await readFile(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const playerExpansionMigration = await readFile(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8');
const seasonCompletionMigration = await readFile(new URL('../workers/moonboys-api/migrations/058_telegram_pet_season_completion.sql', import.meta.url), 'utf8');
const seasonEconomyMigration = await readFile(new URL('../workers/moonboys-api/migrations/061_moonpet_season_economy_calibration.sql', import.meta.url), 'utf8');
const weeklyJourneyMigration = await readFile(new URL('../workers/moonboys-api/migrations/068_moonpet_weekly_journey_authority.sql', import.meta.url), 'utf8');
const permanentWeeklyMigration = await readFile(new URL('../workers/moonboys-api/migrations/085_permanent_pet_weekly_evidence.sql', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const weeklyJourneySource = await readFile(new URL('../workers/moonboys-api/pets/weekly-journey.js', import.meta.url), 'utf8');
const TEST_WEEKLY_SOURCE_TYPES = Object.freeze({
  weekly_care: 'feed',
  weekly_training: 'train',
  weekly_run: 'run_complete',
  weekly_boss_attempt: 'boss_fought',
  weekly_check_in: 'check_in',
});

for (const table of ['telegram_pet_weekly_journey_objectives', 'telegram_pet_weekly_journey_receipts']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must exist in canonical schema`);
  assert.ok(weeklyJourneyMigration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must exist in migration 068`);
}
assert.equal(WEEKLY_JOURNEY_REQUIRED_OBJECTIVES, 5, 'Weekly Journey Crest qualification intentionally requires all 5 objectives');
assert.equal(WEEKLY_JOURNEY_TOTAL_OBJECTIVES, 5, 'Weekly Journey has 5 objectives in PR #1231');
assert.equal(WEEKLY_JOURNEY_REQUIRED_OBJECTIVES, WEEKLY_JOURNEY_TOTAL_OBJECTIVES,
  'Weekly Journey authority requires all configured objectives; objective count drift must force an intentional threshold decision');
assert.match(weeklyJourneySource, /weekly_journey_threshold_drift/,
  'weekly journey source must enforce the full-completion authority invariant');
assert.doesNotMatch(workerSource, /body\.action === 'weekly_journey'|processWeeklyJourney|handleWeeklyJourney/i,
  'Weekly Journey must not add a direct client-progress route');
assert.match(workerSource, /recordWeeklyJourneyFromAcceptedPetEvent/,
  'Weekly Journey live progress must be wired through accepted source events');
assert.match(workerSource, /readAcceptedPetEventByKey\(db, telegramId, eventKey\)/,
  'Weekly Journey live progress must read back accepted persisted pet events');
assert.match(workerSource, /recordWeeklyJourneyObjectiveEvidence\(db, \{[\s\S]*source_event_key: acceptedEvent\.event_key/,
  'Weekly Journey live progress must pass the persisted event key into authority');
assert.match(workerSource, /progress_value: objective\.target/,
  'Weekly Journey live adapter may request target progress only for max objectives; authority clamps additive objectives');
assert.ok(workerSource.includes(".replace(/\\\\/g, '\\\\\\\\')"),
  'LIKE helper must escape literal backslashes explicitly before wildcard characters');
assert.ok(workerSource.includes(".replace(/%/g, '\\\\%')"),
  'LIKE helper must escape literal percent signs for SQLite LIKE');
assert.ok(workerSource.includes(".replace(/_/g, '\\\\_')"),
  'LIKE helper must escape literal underscores for SQLite LIKE');
assert.ok(workerSource.includes("metadata LIKE ? ESCAPE '\\\\'"),
  'weekly boss recovery must bind escaped metadata patterns with SQLite LIKE ESCAPE');
assert.doesNotMatch(workerSource, /OR\s+reason\s*=\s*['"]weekly_boss_attempt['"]/,
  'weekly boss recovery must not broaden accepted source matching by reason');
for (const [eventType, objectiveId] of Object.entries({
  feed: 'weekly_care',
  play: 'weekly_care',
  clean: 'weekly_care',
  sleep: 'weekly_care',
  train: 'weekly_training',
  run: 'weekly_run',
  run_complete: 'weekly_run',
  run_extract: 'weekly_run',
  daily_run: 'weekly_run',
  daily_moon_run: 'weekly_run',
  weekly_boss: 'weekly_boss_attempt',
  boss_fought: 'weekly_boss_attempt',
  weekly_boss_reward: 'weekly_boss_attempt',
  check_in: 'weekly_check_in',
  daily_check_in: 'weekly_check_in',
  weekly_check_in: 'weekly_check_in',
  daily_chest: 'weekly_check_in',
})) {
  assert.equal(WEEKLY_JOURNEY_SOURCE_OBJECTIVES[eventType], objectiveId, 'refresh and live actions must map the same source types');
  assert.match(workerSource, new RegExp(`${eventType}: '${objectiveId}'`),
    `${eventType} must map to ${objectiveId} for live Weekly Journey progression`);
}
assert.match(workerSource, /INSERT OR IGNORE INTO telegram_pet_events[\s\S]*'weekly_boss'[\s\S]*'accepted'[\s\S]*'weekly_boss_attempt'/,
  'weekly boss attempts must persist an accepted pet event before Weekly Journey progress can count');
assert.doesNotMatch(weeklyJourneyMigration, /\b(?:ALTER\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+telegram_)\b/i,
  'migration 068 must be additive only');
for (const indexName of [
  'idx_telegram_pet_weekly_journey_objectives_pet_week',
  'idx_telegram_pet_weekly_journey_objectives_source',
  'idx_telegram_pet_weekly_journey_receipts_pet_week',
  'idx_telegram_pet_weekly_journey_receipts_event_status',
  'idx_telegram_pet_weekly_journey_receipts_crest',
]) assert.ok(weeklyJourneyMigration.includes(indexName), `${indexName} must exist for D1 lookups and receipt recovery`);

function createDb() {
  const db = new D1();
  db.database.exec('PRAGMA foreign_keys=ON');
  db.database.exec(schema);
  db.database.exec(playerExpansionMigration);
  db.database.exec(seasonCompletionMigration);
  db.database.exec(seasonEconomyMigration);
  db.database.exec(weeklyJourneyMigration);
  db.database.exec(weeklyJourneyMigration);
  db.database.exec(permanentWeeklyMigration);
  assert.equal(db.database.prepare('PRAGMA foreign_key_check').all().length, 0, 'weekly journey migrations must be D1/sqlite-clean');
  return db;
}

function seedPlayer(db, telegramId, seasonKey = 'pet-s2026-001') {
  db.database.prepare('INSERT INTO telegram_users (telegram_id, xp, level) VALUES (?, 0, 1)').run(telegramId);
  db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_xp, level) VALUES (?, 0, 1)').run(telegramId);
  const petId = `pet-${telegramId}`;
  db.database.prepare(`INSERT INTO telegram_pet_season_slots
    (pet_id, telegram_id, season_key, slot_number, acquisition_type)
    VALUES (?, ?, ?, 1, 'free')`).run(petId, telegramId, seasonKey);
  db.database.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key)
    VALUES (?, ?, ?)`).run(telegramId, petId, seasonKey);
  db.database.prepare(`INSERT INTO telegram_pet_instances
    (pet_id, telegram_id, season_key, slot_number, source_profile_updated_at)
    VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)`).run(petId, telegramId, seasonKey);
  return petId;
}

function seedAdditionalPet(db, telegramId, petId, slotNumber = 2, seasonKey = 'pet-s2026-001') {
  db.database.prepare(`INSERT INTO telegram_pet_season_slots
    (pet_id, telegram_id, season_key, slot_number, acquisition_type)
    VALUES (?, ?, ?, ?, 'arcade_xp')`).run(petId, telegramId, seasonKey, slotNumber);
  db.database.prepare(`INSERT INTO telegram_pet_instances
    (pet_id, telegram_id, season_key, slot_number, source_profile_updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(petId, telegramId, seasonKey, slotNumber);
}

function seedBossPlayer(db, telegramId, seasonKey) {
  const petId = seedPlayer(db, telegramId, seasonKey);
  db.database.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json)
    VALUES (?,?,?,'young','{}','[]')`).run(petId, telegramId, petId);
  return petId;
}

function switchActivePet(db, telegramId, petId, seasonKey) {
  db.database.prepare(`UPDATE telegram_pet_active_slots
    SET pet_id=?, season_key=?
    WHERE telegram_id=?`).run(petId, seasonKey, telegramId);
}

function seedTerminalDailyMoonRun(db, { telegramId, petId, seasonKey, day, runId, status = 'extracted' }) {
  db.database.prepare(`INSERT INTO telegram_pet_runs
    (id, pet_id, telegram_id, run_id, season_key, status, current_room, max_room, score, depth, rooms_completed, ended_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 5, 120, 1, 1, ?, ?)`)
    .run(`run:${runId}`, petId, telegramId, runId, seasonKey, status, `${day}T12:00:00.000Z`, `${day}T12:00:00.000Z`);
  db.database.prepare(`INSERT INTO telegram_pet_daily_runs
    (telegram_id, pet_id, utc_day, seed, run_id, status, score, depth, completed_at)
    VALUES (?, ?, ?, 'daily-test-seed', ?, ?, 120, 1, ?)`)
    .run(telegramId, petId, day, runId, status, `${day}T12:00:00.000Z`);
}

function insertSourceEvent(db, {
  telegramId, petId, seasonKey = 'pet-s2026-001', day = '2026-01-05', eventKey, eventType = 'weekly_journey_test',
}) {
  db.database.prepare(`INSERT INTO telegram_pet_events
    (id, pet_id, telegram_id, event_type, event_key, season_key, day_key, week_key, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accepted')`)
    .run(`id:${eventKey}`, petId, telegramId, eventType, eventKey, seasonKey, day, `${seasonKey}:week`);
}

async function completeObjective(db, {
  telegramId, petId, seasonKey = 'pet-s2026-001', qualificationWeek = 1, objectiveId, day = '2026-01-05', progressValue = null,
  eventKey = null, eventType = null,
}) {
  const objective = PET_WEEKLY_JOURNEY_OBJECTIVES[objectiveId];
  const evidenceCount = eventKey || progressValue != null || objective.progress_mode !== 'add' ? 1 : objective.target;
  let result = null;
  for (let index = 0; index < evidenceCount; index += 1) {
    let sourceDay = day;
    if (objectiveId === 'weekly_check_in' && evidenceCount > 1) {
      const weekStart = Date.parse(getPetSeasonInfo(new Date(`${day}T12:00:00.000Z`)).start_at) + (qualificationWeek - 1) * 7 * 86400000;
      const firstDay = Math.max(weekStart, Date.parse(`${day}T00:00:00.000Z`) - 86400000);
      sourceDay = new Date(firstDay + index * 86400000).toISOString().slice(0, 10);
    }
    const sourceEventKey = eventKey || `${petId}:${seasonKey}:${qualificationWeek}:${objectiveId}:${day}:${index + 1}`;
    insertSourceEvent(db, { telegramId, petId, seasonKey, day: sourceDay, eventKey: sourceEventKey, eventType: eventType || TEST_WEEKLY_SOURCE_TYPES[objectiveId] });
    result = await recordWeeklyJourneyObjectiveEvidence(db, {
      telegram_id: telegramId,
      pet_id: petId,
      season_key: seasonKey,
      qualification_week: qualificationWeek,
      objective_id: objectiveId,
      source_event_key: sourceEventKey,
      progress_value: progressValue ?? objective.target,
      evidence: { authority: 'test_weekly_journey_authority', pet_id: petId, season_key: seasonKey, qualification_week: qualificationWeek },
      now: `${sourceDay}T12:00:00.000Z`,
    });
  }
  return result;
}

async function completeWeeklyJourney(db, telegramId, petId, options = {}) {
  const results = [];
  for (const objectiveId of Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES)) {
    results.push(await completeObjective(db, { telegramId, petId, objectiveId, ...options }));
  }
  return results;
}

const qualificationDb = createDb();
const qualificationPet = seedPlayer(qualificationDb, 'weekly-qualified');
const qualificationResults = await completeWeeklyJourney(qualificationDb, 'weekly-qualified', qualificationPet);
assert.equal(qualificationResults.at(-1).weekly_journey.accepted, true, 'Test 1: completed required objectives award a Weekly Crest');
assert.equal(qualificationResults.at(-1).weekly_journey.completed_objectives, 5, 'Test 1: Weekly Crest receipt records 5/5 completed objectives');
assert.equal(qualificationResults.at(-1).weekly_journey.required_objectives, 5, 'Test 1: Weekly Crest threshold is locked to 5/5');
assert.equal(qualificationDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_receipts
  WHERE pet_id=? AND season_key='pet-s2026-001' AND qualification_week=1 AND status='accepted'`).get(qualificationPet).count, 1,
  'Test 1: one accepted Weekly Journey receipt is persisted');
assert.deepEqual({ ...qualificationDb.database.prepare(`SELECT status, reason, completed_objectives FROM telegram_pet_weekly_journey_receipts
  WHERE pet_id=? AND season_key='pet-s2026-001' AND qualification_week=1`).get(qualificationPet) }, {
  status: 'accepted',
  reason: 'weekly_journey_qualified',
  completed_objectives: 5,
}, 'Test 1: 5/5 persists one authoritative accepted receipt');
assert.equal(qualificationDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests
  WHERE pet_id=? AND season_key='pet-s2026-001' AND qualification_week=1`).get(qualificationPet).count, 1,
  'Test 1: one Weekly Crest is awarded');

const partialDb = createDb();
const partialPet = seedPlayer(partialDb, 'weekly-partial');
await completeObjective(partialDb, { telegramId: 'weekly-partial', petId: partialPet, objectiveId: 'weekly_care' });
await completeObjective(partialDb, { telegramId: 'weekly-partial', petId: partialPet, objectiveId: 'weekly_training' });
assert.equal((await finalizeWeeklyJourneyCrest(partialDb, {
  telegram_id: 'weekly-partial', pet_id: partialPet, season_key: 'pet-s2026-001', qualification_week: 1,
})).accepted, false, 'Test 2: 2/5 completed objectives do not qualify');
assert.equal(partialDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests WHERE pet_id=?`).get(partialPet).count, 0,
  'Test 2: no Weekly Crest is awarded for partial progress');

const fourOfFiveDb = createDb();
const fourOfFivePet = seedPlayer(fourOfFiveDb, 'weekly-four-of-five');
for (const objectiveId of Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES).slice(0, 4)) {
  await completeObjective(fourOfFiveDb, { telegramId: 'weekly-four-of-five', petId: fourOfFivePet, objectiveId });
}
const fourOfFive = await finalizeWeeklyJourneyCrest(fourOfFiveDb, {
  telegram_id: 'weekly-four-of-five', pet_id: fourOfFivePet, season_key: 'pet-s2026-001', qualification_week: 1,
});
assert.deepEqual({
  accepted: fourOfFive.accepted,
  completed_objectives: fourOfFive.completed_objectives,
  required_objectives: fourOfFive.required_objectives,
  total_objectives: fourOfFive.total_objectives,
}, {
  accepted: false,
  completed_objectives: 4,
  required_objectives: 5,
  total_objectives: 5,
}, 'Test 2b: 4/5 is intentionally below the full weekly completion threshold');
assert.equal(fourOfFiveDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests WHERE pet_id=?`).get(fourOfFivePet).count, 0,
  'Test 2b: 4/5 does not award a Weekly Crest');
assert.equal(fourOfFiveDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_receipts
  WHERE pet_id=? AND status='accepted'`).get(fourOfFivePet).count, 0,
  'Test 2b: 4/5 does not create an accepted Crest receipt');

const isolationDb = createDb();
const petA = seedPlayer(isolationDb, 'weekly-isolation');
const petB = 'pet-weekly-isolation-b';
seedAdditionalPet(isolationDb, 'weekly-isolation', petB);
await completeWeeklyJourney(isolationDb, 'weekly-isolation', petA);
await completeObjective(isolationDb, { telegramId: 'weekly-isolation', petId: petB, objectiveId: 'weekly_care' });
assert.equal(isolationDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests
  WHERE pet_id=? AND qualification_week=1`).get(petA).count, 1, 'Test 3: Pet A receives its own Crest');
assert.equal(isolationDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests
  WHERE pet_id=?`).get(petB).count, 0, 'Test 3: Pet B does not receive Pet A authority');

const rolloverDb = createDb();
const rolloverPet = seedPlayer(rolloverDb, 'weekly-rollover');
await completeWeeklyJourney(rolloverDb, 'weekly-rollover', rolloverPet, { qualificationWeek: 1, day: '2026-01-05' });
const rolloverRetry = await finalizeWeeklyJourneyCrest(rolloverDb, {
  telegram_id: 'weekly-rollover',
  pet_id: rolloverPet,
  season_key: 'pet-s2026-001',
  qualification_week: 1,
  now: '2026-01-12T00:05:00.000Z',
});
assert.equal(rolloverRetry.duplicate, true, 'Test 4: week 2 retry returns the preserved week 1 authority');
assert.equal(rolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests
  WHERE pet_id=? AND season_key='pet-s2026-001' AND qualification_week=1`).get(rolloverPet).count, 1,
  'Test 4: week 1 authority remains intact');
assert.equal(rolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests
  WHERE pet_id=? AND season_key='pet-s2026-001' AND qualification_week=2`).get(rolloverPet).count, 0,
  'Test 4: retry after rollover does not contaminate week 2');

const duplicateDb = createDb();
const duplicatePet = seedPlayer(duplicateDb, 'weekly-duplicate');
await completeWeeklyJourney(duplicateDb, 'weekly-duplicate', duplicatePet);
const duplicateOne = await finalizeWeeklyJourneyCrest(duplicateDb, {
  telegram_id: 'weekly-duplicate', pet_id: duplicatePet, season_key: 'pet-s2026-001', qualification_week: 1,
});
const duplicateTwo = await finalizeWeeklyJourneyCrest(duplicateDb, {
  telegram_id: 'weekly-duplicate', pet_id: duplicatePet, season_key: 'pet-s2026-001', qualification_week: 1,
});
assert.equal(duplicateOne.crest_id, duplicateTwo.crest_id, 'Test 5: duplicate retries return the same authoritative Crest');
assert.equal(duplicateTwo.duplicate, true, 'Test 5: normal duplicate retry reports duplicate=true');
assert.equal(duplicateTwo.recovered, false, 'Test 5: normal duplicate retry is not receipt recovery');
assert.equal(duplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests WHERE pet_id=?`).get(duplicatePet).count, 1,
  'Test 5: duplicate retries do not award extra Crests');
assert.equal(duplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_receipts WHERE pet_id=?`).get(duplicatePet).count, 1,
  'Test 5: duplicate retries do not create duplicate receipts');

const recoveryDb = createDb();
const recoveryPet = seedPlayer(recoveryDb, 'weekly-recovery');
const recoveryInsertObjective = recoveryDb.database.prepare(`INSERT INTO telegram_pet_weekly_journey_objectives
  (event_id, telegram_id, pet_id, season_key, qualification_week, objective_id, source_event_key, source_event_type, progress_value, status, evidence)
  VALUES (?, 'weekly-recovery', ?, 'pet-s2026-001', 1, ?, ?, ?, ?, 'accepted', '{}')`);
for (const [objectiveId, objective] of Object.entries(PET_WEEKLY_JOURNEY_OBJECTIVES)) {
  const count = objective.progress_mode === 'add' ? objective.target : 1;
  for (let index = 0; index < count; index += 1) {
    const sourceEventKey = `weekly-recovery:${objectiveId}:${index + 1}`;
    insertSourceEvent(recoveryDb, { telegramId: 'weekly-recovery', petId: recoveryPet,
      eventKey: sourceEventKey, eventType: TEST_WEEKLY_SOURCE_TYPES[objectiveId],
      day: objectiveId === 'weekly_check_in' && index === 0 ? '2026-01-04' : '2026-01-05' });
    recoveryInsertObjective.run(
      `weekly-journey:objective:${recoveryPet}:pet-s2026-001:1:${objectiveId}:${sourceEventKey}`,
      recoveryPet,
      objectiveId,
      sourceEventKey,
      TEST_WEEKLY_SOURCE_TYPES[objectiveId],
      objective.progress_mode === 'add' ? 1 : objective.target,
    );
  }
}
let simulatedDuplicateCrest = false;
recoveryDb.beforeWeeklyCrestInsert = (args) => {
  if (simulatedDuplicateCrest) return;
  simulatedDuplicateCrest = true;
  recoveryDb.beforeWeeklyCrestInsert = null;
  recoveryDb.database.prepare(`INSERT INTO telegram_pet_weekly_crests
    (crest_id, pet_id, telegram_id, season_key, season_week, qualification_week, objective_id, evidence_key, earned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...args);
};
const recoveredReceipt = await finalizeWeeklyJourneyCrest(recoveryDb, {
  telegram_id: 'weekly-recovery',
  pet_id: recoveryPet,
  season_key: 'pet-s2026-001',
  qualification_week: 1,
  now: '2026-01-05T12:00:00.000Z',
});
assert.deepEqual({
  accepted: recoveredReceipt.accepted,
  duplicate: recoveredReceipt.duplicate,
  recovered: recoveredReceipt.recovered,
}, {
  accepted: true,
  duplicate: false,
  recovered: true,
}, 'Test 5a: missing receipt recovery from an authoritative duplicate Crest is recovered, not duplicate');
assert.equal(recoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_receipts WHERE pet_id=?`).get(recoveryPet).count, 1,
  'Test 5a: recovery rebuilds one Weekly Journey receipt');
assert.equal(recoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests WHERE pet_id=?`).get(recoveryPet).count, 1,
  'Test 5a: recovery does not duplicate Weekly Crests');

const concurrentDb = createDb();
const concurrentPet = seedPlayer(concurrentDb, 'weekly-concurrent');
for (const objectiveId of Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES).slice(0, 4)) {
  await completeObjective(concurrentDb, { telegramId: 'weekly-concurrent', petId: concurrentPet, objectiveId });
}
const raceObjectiveId = Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES).at(-1);
await completeObjective(concurrentDb, {
  telegramId: 'weekly-concurrent',
  petId: concurrentPet,
  objectiveId: raceObjectiveId,
  eventKey: 'weekly-concurrent-check-in-prior',
  day: '2026-01-04',
});
const raceEventKey = 'weekly-concurrent-final-objective';
insertSourceEvent(concurrentDb, {
  telegramId: 'weekly-concurrent',
  petId: concurrentPet,
  eventKey: raceEventKey,
  eventType: TEST_WEEKLY_SOURCE_TYPES[raceObjectiveId],
});
const raceRequest = {
  telegram_id: 'weekly-concurrent',
  pet_id: concurrentPet,
  season_key: 'pet-s2026-001',
  qualification_week: 1,
  objective_id: raceObjectiveId,
  source_event_key: raceEventKey,
  progress_value: PET_WEEKLY_JOURNEY_OBJECTIVES[raceObjectiveId].target,
  evidence: { authority: 'test_weekly_journey_authority', race: true },
  now: '2026-01-05T12:00:00.000Z',
};
const raceResults = await Promise.all([
  recordWeeklyJourneyObjectiveEvidence(concurrentDb, raceRequest),
  recordWeeklyJourneyObjectiveEvidence(concurrentDb, raceRequest),
]);
assert.equal(raceResults.filter((result) => result.accepted).length, 1,
  'Test 5b: concurrent duplicate evidence creates one objective record');
assert.equal(concurrentDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE pet_id=? AND objective_id=? AND source_event_key=?`).get(concurrentPet, raceObjectiveId, raceEventKey).count, 1,
  'Test 5b: concurrent duplicate evidence leaves one objective row only');
assert.equal(concurrentDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_receipts WHERE pet_id=?`).get(concurrentPet).count, 1,
  'Test 5b: concurrent duplicate evidence leaves one receipt only');
assert.equal(concurrentDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests WHERE pet_id=?`).get(concurrentPet).count, 1,
  'Test 5b: concurrent duplicate evidence leaves one Weekly Crest only');
await recordWeeklyJourneyObjectiveEvidence(concurrentDb, raceRequest);
assert.equal(concurrentDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE pet_id=? AND objective_id=? AND source_event_key=?`).get(concurrentPet, raceObjectiveId, raceEventKey).count, 1,
  'Test 5b: post-race retries are no-op for objective evidence');
assert.equal(concurrentDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_receipts WHERE pet_id=?`).get(concurrentPet).count, 1,
  'Test 5b: post-race retries are no-op for receipts');
assert.equal(concurrentDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests WHERE pet_id=?`).get(concurrentPet).count, 1,
  'Test 5b: post-race retries are no-op for Weekly Crests');

const spoofProgressDb = createDb();
const spoofProgressPet = seedPlayer(spoofProgressDb, 'weekly-spoof-progress');
insertSourceEvent(spoofProgressDb, {
  telegramId: 'weekly-spoof-progress',
  petId: spoofProgressPet,
  eventKey: 'weekly-spoof-progress-feed',
  eventType: 'feed',
});
const spoofProgressResult = await recordWeeklyJourneyObjectiveEvidence(spoofProgressDb, {
  telegram_id: 'weekly-spoof-progress',
  pet_id: spoofProgressPet,
  season_key: 'pet-s2026-001',
  qualification_week: 1,
  objective_id: 'weekly_care',
  source_event_key: 'weekly-spoof-progress-feed',
  progress_value: PET_WEEKLY_JOURNEY_OBJECTIVES.weekly_care.target,
  evidence: { authority: 'test_weekly_journey_authority', spoof_progress: true },
  now: '2026-01-05T12:00:00.000Z',
});
assert.equal(spoofProgressResult.accepted, true,
  'Test 5c: one valid care source event is accepted as evidence');
assert.equal(spoofProgressResult.progress, 1,
  'Test 5c: caller-supplied additive progress cannot exceed one unit per source event');
assert.equal(spoofProgressResult.weekly_journey.accepted, false,
  'Test 5c: one spoofed additive event does not complete the Weekly Journey');
assert.equal(spoofProgressDb.database.prepare(`SELECT SUM(progress_value) AS progress FROM telegram_pet_weekly_journey_objectives
  WHERE pet_id=? AND objective_id='weekly_care'`).get(spoofProgressPet).progress, 1,
  'Test 5c: persisted additive progress is one unit despite target-sized request progress');
assert.equal(spoofProgressDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests WHERE pet_id=?`).get(spoofProgressPet).count, 0,
  'Test 5c: additive progress spoofing cannot award a Weekly Crest');
assert.equal(spoofProgressDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_receipts
  WHERE pet_id=? AND status='accepted'`).get(spoofProgressPet).count, 0,
  'Test 5c: additive progress spoofing creates no accepted Crest receipt');

const canonicalRetryDb = createDb();
const canonicalRetryPet = seedPlayer(canonicalRetryDb, 'weekly-canonical-retry');
for (const objectiveId of Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES).filter((key) => key !== 'weekly_boss_attempt')) {
  await completeObjective(canonicalRetryDb, { telegramId: 'weekly-canonical-retry', petId: canonicalRetryPet, objectiveId });
}
insertSourceEvent(canonicalRetryDb, {
  telegramId: 'weekly-canonical-retry',
  petId: canonicalRetryPet,
  eventKey: 'weekly-canonical-boss',
  eventType: 'boss_fought',
});
const canonicalRequest = {
  telegram_id: 'weekly-canonical-retry',
  pet_id: canonicalRetryPet,
  season_key: 'pet-s2026-001',
  qualification_week: 1,
  objective_id: 'weekly_boss_attempt',
  source_event_key: 'weekly-canonical-boss',
  progress_value: PET_WEEKLY_JOURNEY_OBJECTIVES.weekly_boss_attempt.target,
  evidence: { authority: 'test_weekly_journey_authority', canonical_retry: true },
  now: '2026-01-05T12:00:00.000Z',
};
const canonicalFirst = await recordWeeklyJourneyObjectiveEvidence(canonicalRetryDb, canonicalRequest);
const canonicalRetry = await recordWeeklyJourneyObjectiveEvidence(canonicalRetryDb, {
  ...canonicalRequest,
  pet_id: ` ${canonicalRetryPet} `,
  season_key: ' pet-s2026-001 ',
});
assert.equal(canonicalFirst.weekly_journey.accepted, true,
  'Test 5d: canonical first submission awards the Weekly Crest');
assert.equal(canonicalRetry.duplicate, true,
  'Test 5d: whitespace retry resolves to the existing objective identity');
assert.equal(canonicalRetryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE pet_id=? AND objective_id='weekly_boss_attempt' AND source_event_key='weekly-canonical-boss'`).get(canonicalRetryPet).count, 1,
  'Test 5d: canonical retry writes one objective row only');
assert.equal(canonicalRetryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_receipts WHERE pet_id=?`).get(canonicalRetryPet).count, 1,
  'Test 5d: canonical retry writes one receipt only');
assert.equal(canonicalRetryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests WHERE pet_id=?`).get(canonicalRetryPet).count, 1,
  'Test 5d: canonical retry writes one Weekly Crest only');

const sourceBindingDb = createDb();
const sourceBindingPet = seedPlayer(sourceBindingDb, 'weekly-source-binding');
insertSourceEvent(sourceBindingDb, {
  telegramId: 'weekly-source-binding',
  petId: sourceBindingPet,
  eventKey: 'weekly-source-binding-feed',
  eventType: 'feed',
});
const sourceBindingResults = [];
for (const objectiveId of Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES)) {
  sourceBindingResults.push([objectiveId, await recordWeeklyJourneyObjectiveEvidence(sourceBindingDb, {
    telegram_id: 'weekly-source-binding',
    pet_id: sourceBindingPet,
    season_key: 'pet-s2026-001',
    qualification_week: 1,
    objective_id: objectiveId,
    source_event_key: 'weekly-source-binding-feed',
    progress_value: PET_WEEKLY_JOURNEY_OBJECTIVES[objectiveId].target,
    evidence: { authority: 'test_weekly_journey_authority', source_binding: true },
    now: '2026-01-05T12:00:00.000Z',
  })]);
}
assert.equal(sourceBindingResults.find(([objectiveId]) => objectiveId === 'weekly_care')[1].accepted, true,
  'Test 5e: feed source event is valid for weekly care');
assert.deepEqual(sourceBindingResults.filter(([objectiveId]) => objectiveId !== 'weekly_care').map(([objectiveId, result]) => [objectiveId, result.reason]), [
  ['weekly_training', 'weekly_journey_objective_source_mismatch'],
  ['weekly_run', 'weekly_journey_objective_source_mismatch'],
  ['weekly_boss_attempt', 'weekly_journey_objective_source_mismatch'],
  ['weekly_check_in', 'weekly_journey_objective_source_mismatch'],
], 'Test 5e: one feed event cannot satisfy unrelated weekly objectives');
assert.equal(sourceBindingDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE pet_id=?`).get(sourceBindingPet).count, 1,
  'Test 5e: source/objective mismatch writes only the valid objective row');
assert.equal(sourceBindingDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests WHERE pet_id=?`).get(sourceBindingPet).count, 0,
  'Test 5e: source/objective mismatch cannot manufacture a Weekly Crest');

const sourceVariantDb = createDb();
const sourceVariantPet = seedPlayer(sourceVariantDb, 'weekly-source-variants');
for (const [eventType, objectiveId] of [
  ['feed', 'weekly_care'],
  ['play', 'weekly_care'],
  ['clean', 'weekly_care'],
  ['sleep', 'weekly_care'],
  ['train', 'weekly_training'],
  ['run_extract', 'weekly_run'],
  ['run_complete', 'weekly_run'],
  ['weekly_boss', 'weekly_boss_attempt'],
  ['boss_fought', 'weekly_boss_attempt'],
  ['weekly_boss_reward', 'weekly_boss_attempt'],
  ['daily_chest', 'weekly_check_in'],
  ['daily_check_in', 'weekly_check_in'],
]) {
  const eventKey = `weekly-source-variant:${eventType}`;
  insertSourceEvent(sourceVariantDb, {
    telegramId: 'weekly-source-variants',
    petId: sourceVariantPet,
    eventKey,
    eventType,
  });
  const result = await recordWeeklyJourneyObjectiveEvidence(sourceVariantDb, {
    telegram_id: 'weekly-source-variants',
    pet_id: sourceVariantPet,
    season_key: 'pet-s2026-001',
    qualification_week: 1,
    objective_id: objectiveId,
    source_event_key: eventKey,
    progress_value: PET_WEEKLY_JOURNEY_OBJECTIVES[objectiveId].target,
    evidence: { authority: 'test_weekly_journey_authority', source_variant: eventType },
    now: '2026-01-05T12:00:00.000Z',
  });
  assert.equal(result.accepted, true, `Test 5f: ${eventType} must count toward ${objectiveId}`);
}
assert.equal(sourceVariantDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE pet_id=? AND status='accepted'`).get(sourceVariantPet).count, 12,
  'Test 5f: all live source variants persist one accepted weekly objective evidence row');

async function assertDirectActionPreparesCurrentSeason({ action, objectiveId, telegramId }) {
  const db = createDb();
  const now = new Date();
  const currentSeasonKey = getPetSeasonInfo(now).key;
  const oldSeasonKey = 'pet-s2025-004';
  const oldPet = seedPlayer(db, telegramId, oldSeasonKey);
  const eventKey = `weekly-rollover-direct:${telegramId}:${action}`;
  const result = await processPetAction(db, telegramId, action, {
    event_key: eventKey,
    source: 'telegram_bot',
    now,
  });
  assert.equal(result.accepted, true, `Test 5g: ${action} direct action is accepted after season rollover without Mini App state load`);
  const event = db.database.prepare(`SELECT pet_id, season_key, event_key, event_type, status FROM telegram_pet_events
    WHERE telegram_id=? AND event_key=? AND status='accepted'`).get(telegramId, eventKey);
  assert.equal(event?.season_key, oldSeasonKey, `Test 5g: ${action} source event keeps its creation season key`);
  assert.equal(event?.pet_id, oldPet, `Test 5g: ${action} source event does not use the original active pet`);
  assert.equal(db.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_season_slots
    WHERE telegram_id=? AND pet_id=? AND season_key=?`).get(telegramId, event.pet_id, oldSeasonKey).count, 1,
    `Test 5g: ${action} source event pet belongs to its original ownership slot`);
  assert.equal(db.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
    WHERE telegram_id=? AND pet_id=? AND season_key=? AND status='accepted'`).get(telegramId, oldPet, currentSeasonKey).count, 0,
    `Test 5g: ${action} writes no old-pet/new-season mismatched accepted event`);
  assert.equal(db.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
    WHERE telegram_id=? AND pet_id=? AND season_key=? AND objective_id=? AND source_event_key=? AND status='accepted'`)
    .get(telegramId, event.pet_id, oldSeasonKey, objectiveId, eventKey).count, 1,
    `Test 5g: ${action} records ongoing Weekly Journey evidence`);
  const replay = await processPetAction(db, telegramId, action, {
    event_key: eventKey,
    source: 'telegram_bot',
    now,
  });
  assert.equal(replay.duplicate, true, `Test 5g: ${action} direct action replay is idempotent`);
  assert.equal(db.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
    WHERE telegram_id=? AND event_key=? AND status='accepted'`).get(telegramId, eventKey).count, 1,
    `Test 5g: ${action} replay keeps one accepted source event`);
  assert.equal(db.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
    WHERE telegram_id=? AND objective_id=? AND source_event_key=? AND status='accepted'`).get(telegramId, objectiveId, eventKey).count, 1,
    `Test 5g: ${action} replay keeps one Weekly Journey objective row`);
}

await assertDirectActionPreparesCurrentSeason({
  action: 'feed',
  objectiveId: 'weekly_care',
  telegramId: 'weekly-rollover-direct-feed',
});
await assertDirectActionPreparesCurrentSeason({
  action: 'train',
  objectiveId: 'weekly_training',
  telegramId: 'weekly-rollover-direct-train',
});

const dailyChestRolloverDb = createDb();
const dailyChestRolloverTelegramId = 'weekly-rollover-daily-chest';
const dailyChestRolloverSeasonKey = 'pet-s2025-004';
const dailyChestRolloverOldPet = seedPlayer(dailyChestRolloverDb, dailyChestRolloverTelegramId, dailyChestRolloverSeasonKey);
const dailyChestRolloverEventKey = 'weekly-rollover-daily-chest-source';
const dailyChestRollover = await processPetDailyChest(dailyChestRolloverDb, dailyChestRolloverTelegramId, {
  event_key: dailyChestRolloverEventKey,
  source: 'telegram_command',
});
assert.equal(dailyChestRollover.accepted, true,
  'Test 5g2: Daily Chest is accepted after season rollover without Mini App state load');
const dailyChestRolloverEvent = dailyChestRolloverDb.database.prepare(`SELECT pet_id, season_key FROM telegram_pet_events
  WHERE telegram_id=? AND event_key=? AND event_type='daily_chest' AND status='accepted'`)
  .get(dailyChestRolloverTelegramId, dailyChestRolloverEventKey);
assert.equal(dailyChestRolloverEvent?.season_key, dailyChestRolloverSeasonKey,
  'Test 5g2: Daily Chest source event keeps its creation season key');
assert.equal(dailyChestRolloverEvent?.pet_id, dailyChestRolloverOldPet,
  'Test 5g2: Daily Chest source event does not use the original active pet');
assert.equal(dailyChestRolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_season_slots
  WHERE telegram_id=? AND pet_id=? AND season_key=?`).get(dailyChestRolloverTelegramId, dailyChestRolloverEvent.pet_id, dailyChestRolloverSeasonKey).count, 1,
  'Test 5g2: Daily Chest source event pet belongs to its original ownership slot');
assert.equal(dailyChestRolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND pet_id=? AND season_key=? AND event_type='daily_chest' AND status='accepted'`)
  .get(dailyChestRolloverTelegramId, dailyChestRolloverOldPet, getPetSeasonInfo(new Date()).key).count, 0,
  'Test 5g2: Daily Chest writes no old-pet/new-season mismatched accepted event');
assert.equal(dailyChestRolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND season_key=? AND objective_id='weekly_check_in' AND source_event_key=? AND status='accepted'`)
  .get(dailyChestRolloverTelegramId, dailyChestRolloverEvent.pet_id, dailyChestRolloverSeasonKey, dailyChestRolloverEventKey).count, 1,
  'Test 5g2: Daily Chest records current-season weekly_check_in evidence');
const dailyChestRolloverReplay = await processPetDailyChest(dailyChestRolloverDb, dailyChestRolloverTelegramId, {
  event_key: dailyChestRolloverEventKey,
  source: 'telegram_command',
});
assert.equal(dailyChestRolloverReplay.duplicate, true,
  'Test 5g2: Daily Chest rollover replay is idempotent');
assert.equal(dailyChestRolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND objective_id='weekly_check_in' AND source_event_key=? AND status='accepted'`)
  .get(dailyChestRolloverTelegramId, dailyChestRolloverEventKey).count, 1,
  'Test 5g2: Daily Chest rollover replay keeps one Weekly Journey objective row');

const dailyChestDuplicateDb = createDb();
const dailyChestTelegramId = 'weekly-daily-chest-duplicate';
const dailyChestSeasonKey = getPetSeasonInfo(new Date()).key;
const dailyChestPet = seedPlayer(dailyChestDuplicateDb, dailyChestTelegramId, dailyChestSeasonKey);
const dailyChestDay = new Date().toISOString().slice(0, 10);
const dailyChestEventKey = 'weekly-daily-chest-source';
insertSourceEvent(dailyChestDuplicateDb, {
  telegramId: dailyChestTelegramId,
  petId: dailyChestPet,
  seasonKey: dailyChestSeasonKey,
  day: dailyChestDay,
  eventKey: dailyChestEventKey,
  eventType: 'daily_chest',
});
const dailyChestReplay = await processPetDailyChest(dailyChestDuplicateDb, dailyChestTelegramId, { event_key: dailyChestEventKey });
assert.equal(dailyChestReplay.duplicate, true, 'Test 5g: accepted Daily Chest duplicate path is replay-safe');
assert.equal(dailyChestDuplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_check_in' AND status='accepted'`).get(dailyChestTelegramId, dailyChestPet).count, 1,
  'Test 5g: Daily Chest duplicate retries missing Weekly Journey evidence');
await processPetDailyChest(dailyChestDuplicateDb, dailyChestTelegramId, { event_key: dailyChestEventKey });
assert.equal(dailyChestDuplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_check_in' AND status='accepted'`).get(dailyChestTelegramId, dailyChestPet).count, 1,
  'Test 5g: repeated Daily Chest duplicate remains idempotent');

const dailyChestFreshRetryDb = createDb();
const dailyChestFreshTelegramId = 'weekly-daily-chest-fresh-retry';
const dailyChestFreshSeasonKey = getPetSeasonInfo(new Date()).key;
const dailyChestFreshPet = seedPlayer(dailyChestFreshRetryDb, dailyChestFreshTelegramId, dailyChestFreshSeasonKey);
const dailyChestOriginal = await processPetDailyChest(dailyChestFreshRetryDb, dailyChestFreshTelegramId, {
  event_key: 'weekly-daily-chest-original-key',
});
assert.equal(dailyChestOriginal.accepted, true, 'Test 5h: initial Daily Chest claim is accepted');
dailyChestFreshRetryDb.database.prepare(`DELETE FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_check_in'`).run(dailyChestFreshTelegramId, dailyChestFreshPet);
const dailyChestFreshRetry = await processPetDailyChest(dailyChestFreshRetryDb, dailyChestFreshTelegramId, {
  event_key: 'weekly-daily-chest-fresh-retry-key',
});
assert.equal(dailyChestFreshRetry.reason, 'daily_claimed', 'Test 5h: fresh Daily Chest retry remains same-day claimed');
assert.equal(dailyChestFreshRetryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='daily_chest' AND event_key='weekly-daily-chest-fresh-retry-key' AND status='accepted'`).get(dailyChestFreshTelegramId).count, 0,
  'Test 5h: fresh Daily Chest retry does not persist the retry key as accepted source evidence');
assert.equal(dailyChestFreshRetryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_check_in' AND status='accepted'`).get(dailyChestFreshTelegramId, dailyChestFreshPet).count, 1,
  'Test 5h: fresh Daily Chest retry recovers missing Weekly Journey evidence from same-day accepted source event');
assert.equal(dailyChestFreshRetryDb.database.prepare(`SELECT source_event_key FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_check_in'`).get(dailyChestFreshTelegramId, dailyChestFreshPet).source_event_key,
  'weekly-daily-chest-original-key',
  'Test 5h: fresh Daily Chest retry reuses original accepted same-day source event key');
await processPetDailyChest(dailyChestFreshRetryDb, dailyChestFreshTelegramId, {
  event_key: 'weekly-daily-chest-fresh-retry-key-two',
});
assert.equal(dailyChestFreshRetryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_check_in' AND status='accepted'`).get(dailyChestFreshTelegramId, dailyChestFreshPet).count, 1,
  'Test 5h: repeated fresh Daily Chest retries keep one Weekly Journey objective row');

const dailyMoonRunDb = createDb();
const dailyMoonRunTelegramId = 'weekly-daily-moon-run';
const dailyMoonRunSeasonKey = getPetSeasonInfo(new Date()).key;
const dailyMoonRunPet = seedPlayer(dailyMoonRunDb, dailyMoonRunTelegramId, dailyMoonRunSeasonKey);
const dailyMoonRunDay = new Date().toISOString().slice(0, 10);
const dailyMoonRunId = 'daily-moon-run-weekly-terminal';
seedTerminalDailyMoonRun(dailyMoonRunDb, {
  telegramId: dailyMoonRunTelegramId,
  petId: dailyMoonRunPet,
  seasonKey: dailyMoonRunSeasonKey,
  day: dailyMoonRunDay,
  runId: dailyMoonRunId,
  status: 'extracted',
});
const dailyMoonRunReplay = await processPetMiniAppAction(dailyMoonRunDb, dailyMoonRunTelegramId, { id: dailyMoonRunTelegramId }, {
  action: 'run_extract',
  run_id: dailyMoonRunId,
  request_id: 'daily-moon-run-retry-one',
}, '123456:test-token');
assert.equal(dailyMoonRunReplay.duplicate, true, 'Test 5h: Daily Moon Run terminal replay uses server duplicate path');
assert.equal(dailyMoonRunDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='daily_moon_run' AND status='accepted'`).get(dailyMoonRunTelegramId).count, 1,
  'Test 5h: Daily Moon Run terminal replay materializes one accepted source event');
assert.equal(dailyMoonRunDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_run' AND status='accepted'`).get(dailyMoonRunTelegramId, dailyMoonRunPet).count, 1,
  'Test 5h: Daily Moon Run terminal replay counts once toward weekly_run');
await processPetMiniAppAction(dailyMoonRunDb, dailyMoonRunTelegramId, { id: dailyMoonRunTelegramId }, {
  action: 'run_extract',
  run_id: dailyMoonRunId,
  request_id: 'daily-moon-run-retry-two',
}, '123456:test-token');
assert.equal(dailyMoonRunDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_run' AND status='accepted'`).get(dailyMoonRunTelegramId, dailyMoonRunPet).count, 1,
  'Test 5h: Daily Moon Run repeated terminal replay remains idempotent');
assert.equal(dailyMoonRunDb.database.prepare(`SELECT source_event_key FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_run'`).get(dailyMoonRunTelegramId, dailyMoonRunPet).source_event_key,
  `daily-moon-run:${dailyMoonRunTelegramId}:${dailyMoonRunId}:extracted`,
  'Test 5h: Daily Moon Run weekly evidence uses the persisted terminal source event key, not retry request ids');

const dailyMoonRunFailureDb = createDb();
const dailyMoonRunFailureTelegramId = 'weekly-daily-moon-run-best-effort';
const dailyMoonRunFailureSeasonKey = getPetSeasonInfo(new Date()).key;
const dailyMoonRunFailurePet = seedPlayer(dailyMoonRunFailureDb, dailyMoonRunFailureTelegramId, dailyMoonRunFailureSeasonKey);
const dailyMoonRunFailureDay = new Date().toISOString().slice(0, 10);
const dailyMoonRunFailureId = 'daily-moon-run-weekly-best-effort';
seedTerminalDailyMoonRun(dailyMoonRunFailureDb, {
  telegramId: dailyMoonRunFailureTelegramId,
  petId: dailyMoonRunFailurePet,
  seasonKey: dailyMoonRunFailureSeasonKey,
  day: dailyMoonRunFailureDay,
  runId: dailyMoonRunFailureId,
  status: 'extracted',
});
dailyMoonRunFailureDb.beforeDailyMoonRunEventInsert = () => {
  throw new Error('injected daily moon run weekly journey failure');
};
const dailyMoonRunFailureResult = await processPetMiniAppAction(dailyMoonRunFailureDb, dailyMoonRunFailureTelegramId, { id: dailyMoonRunFailureTelegramId }, {
  action: 'run_extract',
  run_id: dailyMoonRunFailureId,
  request_id: 'daily-moon-run-best-effort-one',
}, '123456:test-token');
assert.equal(dailyMoonRunFailureResult.accepted, true, 'Test 5i: Daily Moon Run terminal result remains accepted when Weekly Journey bookkeeping fails');
assert.equal(dailyMoonRunFailureResult.duplicate, true, 'Test 5i: Daily Moon Run terminal result returns normally with no uncaught Weekly Journey exception');
assert.equal(dailyMoonRunFailureDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='daily_moon_run' AND status='accepted'`).get(dailyMoonRunFailureTelegramId).count, 0,
  'Test 5i: failed auxiliary bookkeeping does not partially materialize a daily_moon_run source event');
assert.equal(dailyMoonRunFailureDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_run'`).get(dailyMoonRunFailureTelegramId, dailyMoonRunFailurePet).count, 0,
  'Test 5i: failed auxiliary bookkeeping writes no Weekly Journey objective');
dailyMoonRunFailureDb.beforeDailyMoonRunEventInsert = null;
const dailyMoonRunFailureRetry = await processPetMiniAppAction(dailyMoonRunFailureDb, dailyMoonRunFailureTelegramId, { id: dailyMoonRunFailureTelegramId }, {
  action: 'run_extract',
  run_id: dailyMoonRunFailureId,
  request_id: 'daily-moon-run-best-effort-two',
}, '123456:test-token');
assert.equal(dailyMoonRunFailureRetry.accepted, true, 'Test 5i: Daily Moon Run terminal retry remains accepted after auxiliary failure clears');
assert.equal(dailyMoonRunFailureDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='daily_moon_run' AND status='accepted'`).get(dailyMoonRunFailureTelegramId).count, 1,
  'Test 5i: retry materializes one accepted daily_moon_run source event');
assert.equal(dailyMoonRunFailureDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_run' AND status='accepted'`).get(dailyMoonRunFailureTelegramId, dailyMoonRunFailurePet).count, 1,
  'Test 5i: retry records weekly_run exactly once');
await processPetMiniAppAction(dailyMoonRunFailureDb, dailyMoonRunFailureTelegramId, { id: dailyMoonRunFailureTelegramId }, {
  action: 'run_extract',
  run_id: dailyMoonRunFailureId,
  request_id: 'daily-moon-run-best-effort-three',
}, '123456:test-token');
assert.equal(dailyMoonRunFailureDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_run' AND status='accepted'`).get(dailyMoonRunFailureTelegramId, dailyMoonRunFailurePet).count, 1,
  'Test 5i: recovered Daily Moon Run Weekly Journey evidence stays idempotent');

const runDuplicateRecoveryDb = createDb();
const runDuplicateRecoveryTelegramId = 'weekly-run-duplicate-recovery';
const runDuplicateRecoverySeasonKey = getPetSeasonInfo(new Date()).key;
const runDuplicateRecoveryPet = seedPlayer(runDuplicateRecoveryDb, runDuplicateRecoveryTelegramId, runDuplicateRecoverySeasonKey);
const runDuplicateRecoveryRunId = 'weekly-run-duplicate-recovery-run';
runDuplicateRecoveryDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, pet_id, telegram_id, run_id, season_key, status, current_room, max_room, depth, max_depth, score,
   unbanked_pet_xp, unbanked_moon_gold, unbanked_moon_crystals, unbanked_style_tokens, unbanked_items, rooms_completed)
  VALUES (?, ?, ?, ?, ?, 'extractable', 1, 5, 1, 5, 20, 18, 12, 0, 1, '{}', 1)`)
  .run(`run:${runDuplicateRecoveryRunId}`, runDuplicateRecoveryPet, runDuplicateRecoveryTelegramId, runDuplicateRecoveryRunId, runDuplicateRecoverySeasonKey);
const runDuplicateRecoveryRow = runDuplicateRecoveryDb.database.prepare(`SELECT * FROM telegram_pet_runs
  WHERE telegram_id=? AND run_id=?`).get(runDuplicateRecoveryTelegramId, runDuplicateRecoveryRunId);
const runDuplicateFirst = await recordPetRunBankedEvent(runDuplicateRecoveryDb, runDuplicateRecoveryTelegramId, runDuplicateRecoveryRow, {
  pet_id: runDuplicateRecoveryPet,
  telegram_id: runDuplicateRecoveryTelegramId,
}, { source: 'telegram_command' });
assert.equal(runDuplicateFirst.accepted, true,
  'Test 5j: first legacy run extraction reward is accepted');
assert.equal(runDuplicateRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_run' AND status='accepted'`)
  .get(runDuplicateRecoveryTelegramId, runDuplicateRecoveryPet).count, 1,
  'Test 5j: first legacy run extraction records weekly_run evidence');
runDuplicateRecoveryDb.database.prepare(`DELETE FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_run'`).run(runDuplicateRecoveryTelegramId, runDuplicateRecoveryPet);
const runDuplicateSettledRow = runDuplicateRecoveryDb.database.prepare(`SELECT * FROM telegram_pet_runs
  WHERE telegram_id=? AND run_id=?`).get(runDuplicateRecoveryTelegramId, runDuplicateRecoveryRunId);
const runDuplicateReplay = await recordPetRunBankedEvent(runDuplicateRecoveryDb, runDuplicateRecoveryTelegramId, runDuplicateSettledRow, {
  pet_id: runDuplicateRecoveryPet,
  telegram_id: runDuplicateRecoveryTelegramId,
}, { source: 'telegram_command' });
assert.equal(runDuplicateReplay.duplicate, true,
  'Test 5j: duplicate legacy run extraction reward returns duplicate authority');
assert.equal(runDuplicateRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_run' AND status='accepted'`)
  .get(runDuplicateRecoveryTelegramId, runDuplicateRecoveryPet).count, 1,
  'Test 5j: duplicate legacy run extraction recovers exactly one weekly_run evidence row');
await recordPetRunBankedEvent(runDuplicateRecoveryDb, runDuplicateRecoveryTelegramId, runDuplicateSettledRow, {
  pet_id: runDuplicateRecoveryPet,
  telegram_id: runDuplicateRecoveryTelegramId,
}, { source: 'telegram_command' });
assert.equal(runDuplicateRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_run' AND status='accepted'`)
  .get(runDuplicateRecoveryTelegramId, runDuplicateRecoveryPet).count, 1,
  'Test 5j: repeated duplicate legacy run extraction recovery remains idempotent');

const bossMemorySwitchDb = createDb();
const bossMemorySwitchTelegramId = 'weekly-boss-memory-switch';
const bossMemorySwitchSeasonKey = getPetSeasonInfo(new Date()).key;
const bossMemoryPetA = seedBossPlayer(bossMemorySwitchDb, bossMemorySwitchTelegramId, bossMemorySwitchSeasonKey);
const bossMemoryPetB = 'pet-weekly-boss-memory-switch-b';
seedAdditionalPet(bossMemorySwitchDb, bossMemorySwitchTelegramId, bossMemoryPetB, 2, bossMemorySwitchSeasonKey);
bossMemorySwitchDb.database.prepare(`UPDATE telegram_pet_profiles
  SET pet_xp=392040, level=100, energy=100, health=100, happiness=100, cleanliness=100
  WHERE telegram_id=?`).run(bossMemorySwitchTelegramId);
{
  const weekKey = getPetWeekKey(new Date());
  const boss = getPetWeeklyBoss(weekKey);
  bossMemorySwitchDb.database.prepare(`INSERT INTO telegram_pet_weekly_boss_progress
    (telegram_id, week_key, boss_id, damage, attempts)
    VALUES (?, ?, ?, ?, 1)`).run(bossMemorySwitchTelegramId, weekKey, boss.boss_id, Math.max(0, boss.hp - 120));
}
bossMemorySwitchDb.beforeWeeklyBossEventInsert = () => {
  switchActivePet(bossMemorySwitchDb, bossMemorySwitchTelegramId, bossMemoryPetB, bossMemorySwitchSeasonKey);
};
const bossMemorySwitch = await processPetWeeklyBoss(bossMemorySwitchDb, bossMemorySwitchTelegramId, 'strike', 'weekly-boss-memory-switch');
assert.equal(bossMemorySwitch.reason, 'boss_defeated', 'Test 5k: high-level weekly boss attempt defeats the boss');
assert.equal(bossMemorySwitchDb.database.prepare(`SELECT total_bosses_defeated FROM telegram_pet_memories WHERE pet_id=?`).get(bossMemoryPetA).total_bosses_defeated, 1,
  'Test 5k: weekly boss memory is written to the victorious pet captured at source event time');
assert.equal(bossMemorySwitchDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_memories WHERE pet_id=?`).get(bossMemoryPetB).count, 0,
  'Test 5k: active-pet switching cannot redirect weekly boss memory to the new active pet');
assert.equal(bossMemorySwitchDb.database.prepare(`SELECT unlocked_at IS NOT NULL AS unlocked FROM telegram_pet_achievements WHERE pet_id=? AND achievement_id='boss_breaker'`).get(bossMemoryPetA).unlocked, 0,
  'Test 5k: weekly boss achievement sync targets the victorious pet, not the switched active pet');
assert.equal(bossMemorySwitchDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_achievements WHERE pet_id=?`).get(bossMemoryPetB).count, 0,
  'Test 5k: switched active pet does not receive weekly boss achievement rows');

const bossMissingAuthorityDb = createDb();
const bossMissingAuthorityTelegramId = 'weekly-boss-missing-authority';
const bossMissingAuthorityPet = seedBossPlayer(bossMissingAuthorityDb, bossMissingAuthorityTelegramId, getPetSeasonInfo(new Date()).key);
bossMissingAuthorityDb.database.prepare(`UPDATE telegram_pet_profiles
  SET pet_xp=392040, level=100, energy=100, health=100, happiness=100, cleanliness=100
  WHERE telegram_id=?`).run(bossMissingAuthorityTelegramId);
bossMissingAuthorityDb.database.prepare(`DELETE FROM telegram_pet_active_slots WHERE telegram_id=?`).run(bossMissingAuthorityTelegramId);
const bossMissingAuthority = await processPetWeeklyBoss(bossMissingAuthorityDb, bossMissingAuthorityTelegramId, 'strike', 'weekly-boss-missing-authority');
assert.equal(bossMissingAuthority.accepted, false, 'Test 5l: weekly boss victory without pet authority must fail explicitly');
assert.equal(bossMissingAuthority.reason, 'weekly_boss_pet_authority_missing',
  'Test 5l: weekly boss missing pet authority must not be swallowed by best-effort identity catches');
assert.equal(bossMissingAuthorityDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='weekly_boss'`).get(bossMissingAuthorityTelegramId).count, 0,
  'Test 5l: weekly boss missing pet authority must not create a source event with an invalid authority pair');
assert.equal(bossMissingAuthorityDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_memories
  WHERE telegram_id=?`).get(bossMissingAuthorityTelegramId).count, 0,
  'Test 5l: weekly boss missing pet authority must not write boss memory');
assert.equal(bossMissingAuthorityDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_achievements
  WHERE telegram_id=?`).get(bossMissingAuthorityTelegramId).count, 0,
  'Test 5l: weekly boss missing pet authority must not sync achievements');
assert.equal(bossMissingAuthorityDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_memories
  WHERE pet_id=?`).get(bossMissingAuthorityPet).count, 0,
  'Test 5l: weekly boss missing pet authority must not fall back to account or stale pet identity rows');

const bossDuplicateDb = createDb();
const bossDuplicateTelegramId = 'weekly-boss-duplicate';
const bossDuplicateSeasonKey = getPetSeasonInfo(new Date()).key;
const bossDuplicatePet = seedBossPlayer(bossDuplicateDb, bossDuplicateTelegramId, bossDuplicateSeasonKey);
const bossDuplicatePetB = 'pet-weekly-boss-duplicate-b';
seedAdditionalPet(bossDuplicateDb, bossDuplicateTelegramId, bossDuplicatePetB, 2, bossDuplicateSeasonKey);
bossDuplicateDb.database.prepare(`UPDATE telegram_pet_profiles
  SET pet_xp=2500, level=20, energy=100, health=100, happiness=100, cleanliness=100
  WHERE telegram_id=?`).run(bossDuplicateTelegramId);
const bossFirst = await processPetWeeklyBoss(bossDuplicateDb, bossDuplicateTelegramId, 'strike', 'weekly-boss-original-key');
assert.equal(bossFirst.accepted, true, 'Test 5g: first weekly boss attempt is accepted');
const bossOriginalEvent = bossDuplicateDb.database.prepare(`SELECT day_key, week_key, metadata FROM telegram_pet_events
  WHERE telegram_id=? AND event_key='weekly-boss-original-key' AND event_type='weekly_boss' AND status='accepted'`).get(bossDuplicateTelegramId);
assert.ok(bossOriginalEvent?.week_key, 'Test 5g: first weekly boss attempt stores week authority');
const bossOriginalMetadata = JSON.parse(bossOriginalEvent.metadata);
assert.equal(bossDuplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='weekly_boss' AND status='accepted'`).get(bossDuplicateTelegramId).count, 1,
  'Test 5g: first weekly boss attempt persists one accepted weekly_boss source event');
bossDuplicateDb.database.prepare(`INSERT INTO telegram_pet_events
  (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
  VALUES ('!wrong-boss-source', ?, ?, 'weekly_boss', 'weekly-boss-wrong-key', 0, 0, ?, ?, ?, 'accepted', 'weekly_boss_attempt', ?)`)
  .run(bossDuplicatePet, bossDuplicateTelegramId, bossDuplicateSeasonKey, bossOriginalEvent.day_key, bossOriginalEvent.week_key,
    JSON.stringify({ source: 'pet_weekly_boss', boss_id: 'wrong-weekly-boss', action: 'strike', damage: 1 }));
bossDuplicateDb.database.prepare(`DELETE FROM telegram_pet_events
  WHERE telegram_id=? AND event_key='weekly-boss-original-key' AND event_type='weekly_boss'`).run(bossDuplicateTelegramId);
bossDuplicateDb.database.prepare(`DELETE FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_boss_attempt'`).run(bossDuplicateTelegramId, bossDuplicatePet);
bossDuplicateDb.database.prepare(`UPDATE telegram_pet_weekly_boss_progress
  SET defeated_at='2026-08-20T12:00:00.000Z', reward_claimed_at='2026-08-20T12:00:00.000Z'
  WHERE telegram_id=?`).run(bossDuplicateTelegramId);
bossDuplicateDb.database.prepare(`INSERT INTO telegram_pet_weekly_boss_victories_by_pet
  (telegram_id, week_key, boss_id, pet_id, season_key, victory_event_key, defeated_at)
  VALUES (?, ?, ?, ?, ?, ?, '2026-08-20T12:00:00.000Z')`)
  .run(bossDuplicateTelegramId, bossOriginalEvent.week_key, bossOriginalMetadata.boss_id, bossDuplicatePet, bossDuplicateSeasonKey,
    `${bossOriginalEvent.week_key}:${bossOriginalMetadata.boss_id}`);
switchActivePet(bossDuplicateDb, bossDuplicateTelegramId, bossDuplicatePetB, bossDuplicateSeasonKey);
const bossDuplicate = await processPetWeeklyBoss(bossDuplicateDb, bossDuplicateTelegramId, 'strike', 'weekly-boss-retry-different-key');
assert.equal(bossDuplicate.accepted, true, 'Test 5g: duplicate weekly boss retry remains accepted as a duplicate path');
assert.equal(bossDuplicate.duplicate, true, 'Test 5g: duplicate weekly boss retry is idempotent');
assert.equal(bossDuplicate.reason, 'boss_already_defeated', 'Test 5g: defeated duplicate recovery path is exercised');
assert.equal(bossDuplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='weekly_boss' AND event_key='weekly-boss-retry-different-key' AND status='accepted'`).get(bossDuplicateTelegramId).count, 0,
  'Test 5g: duplicate retry with a new request key does not persist that retry key as a source event');
assert.equal(bossDuplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='weekly_boss' AND event_key='weekly-boss-original-key' AND status='accepted'`).get(bossDuplicateTelegramId).count, 1,
  'Test 5g: duplicate retry backfills the original persisted weekly boss attempt source event');
assert.equal(bossDuplicateDb.database.prepare(`SELECT pet_id FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='weekly_boss' AND event_key='weekly-boss-original-key' AND status='accepted'`).get(bossDuplicateTelegramId).pet_id,
  bossDuplicatePet,
  'Test 5g: historical defeated retry backfills the persisted victory pet, not the current active pet');
assert.equal(bossDuplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_boss_attempt' AND status='accepted'`).get(bossDuplicateTelegramId, bossDuplicatePet).count, 1,
  'Test 5g: duplicate retry records weekly_boss_attempt for the persisted victory pet');
assert.equal(bossDuplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_boss_attempt' AND status='accepted'`).get(bossDuplicateTelegramId, bossDuplicatePetB).count, 0,
  'Test 5g: current active pet receives no historical boss objective evidence');
assert.equal(bossDuplicateDb.database.prepare(`SELECT source_event_key FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_boss_attempt'`).get(bossDuplicateTelegramId, bossDuplicatePet).source_event_key, 'weekly-boss-original-key',
  'Test 5g: duplicate retry does not count the incoming retry event key');

const bossUnattributedDuplicateDb = createDb();
const bossUnattributedTelegramId = 'weekly-boss-unattributed-duplicate';
const bossUnattributedSeasonKey = getPetSeasonInfo(new Date()).key;
const bossUnattributedPet = seedBossPlayer(bossUnattributedDuplicateDb, bossUnattributedTelegramId, bossUnattributedSeasonKey);
const bossUnattributedPetB = 'pet-weekly-boss-unattributed-b';
seedAdditionalPet(bossUnattributedDuplicateDb, bossUnattributedTelegramId, bossUnattributedPetB, 2, bossUnattributedSeasonKey);
bossUnattributedDuplicateDb.database.prepare(`UPDATE telegram_pet_profiles
  SET pet_xp=2500, level=20, energy=100, health=100, happiness=100, cleanliness=100
  WHERE telegram_id=?`).run(bossUnattributedTelegramId);
const bossUnattributedFirst = await processPetWeeklyBoss(bossUnattributedDuplicateDb, bossUnattributedTelegramId, 'strike', 'weekly-boss-unattributed-original-key');
assert.equal(bossUnattributedFirst.accepted, true, 'Test 5h: unattributed weekly boss fixture creates an accepted attempt');
bossUnattributedDuplicateDb.database.prepare(`UPDATE telegram_pet_weekly_boss_progress
  SET defeated_at=NULL, reward_claimed_at=NULL
  WHERE telegram_id=?`).run(bossUnattributedTelegramId);
bossUnattributedDuplicateDb.database.prepare(`DELETE FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='weekly_boss'`).run(bossUnattributedTelegramId);
bossUnattributedDuplicateDb.database.prepare(`DELETE FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND objective_id='weekly_boss_attempt'`).run(bossUnattributedTelegramId);
switchActivePet(bossUnattributedDuplicateDb, bossUnattributedTelegramId, bossUnattributedPetB, bossUnattributedSeasonKey);
const bossUnattributedReplay = await processPetWeeklyBoss(bossUnattributedDuplicateDb, bossUnattributedTelegramId, 'strike', 'weekly-boss-unattributed-retry-key');
assert.equal(bossUnattributedReplay.accepted, true, 'Test 5h: unattributed duplicate remains accepted/idempotent');
assert.equal(bossUnattributedReplay.duplicate, true, 'Test 5h: unattributed duplicate uses duplicate path');
assert.equal(bossUnattributedReplay.reason, 'daily_attempt_used', 'Test 5h: unattributed non-victory duplicate path is exercised');
assert.equal(bossUnattributedDuplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='weekly_boss' AND status='accepted'`).get(bossUnattributedTelegramId).count, 0,
  'Test 5h: historical non-victory duplicate without pet attribution does not backfill a weekly_boss source event');
assert.equal(bossUnattributedDuplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND objective_id='weekly_boss_attempt'`).get(bossUnattributedTelegramId).count, 0,
  'Test 5h: historical non-victory duplicate without pet attribution does not write Weekly Journey evidence');

const bossDefeatedBackfillDb = createDb();
const bossDefeatedTelegramId = 'weekly-boss-defeated-backfill';
const bossDefeatedSeasonKey = getPetSeasonInfo(new Date()).key;
const bossDefeatedPet = seedBossPlayer(bossDefeatedBackfillDb, bossDefeatedTelegramId, bossDefeatedSeasonKey);
bossDefeatedBackfillDb.database.prepare(`UPDATE telegram_pet_profiles
  SET pet_xp=2500, level=20, energy=100, health=100, happiness=100, cleanliness=100
  WHERE telegram_id=?`).run(bossDefeatedTelegramId);
const bossDefeatedFirst = await processPetWeeklyBoss(bossDefeatedBackfillDb, bossDefeatedTelegramId, 'strike', 'weekly-boss-defeated-original-key');
assert.equal(bossDefeatedFirst.accepted, true, 'Test 5i: defeated-boss backfill fixture creates a first accepted attempt');
const bossDefeatedOriginalEvent = bossDefeatedBackfillDb.database.prepare(`SELECT day_key, week_key, metadata FROM telegram_pet_events
  WHERE telegram_id=? AND event_key='weekly-boss-defeated-original-key' AND event_type='weekly_boss' AND status='accepted'`).get(bossDefeatedTelegramId);
const bossDefeatedMetadata = JSON.parse(bossDefeatedOriginalEvent.metadata);
bossDefeatedBackfillDb.database.prepare(`UPDATE telegram_pet_weekly_boss_progress
  SET defeated_at='2026-08-20T12:00:00.000Z', reward_claimed_at='2026-08-20T12:00:00.000Z'
  WHERE telegram_id=?`).run(bossDefeatedTelegramId);
bossDefeatedBackfillDb.database.prepare(`INSERT OR IGNORE INTO telegram_pet_weekly_boss_victories_by_pet
  (telegram_id, week_key, boss_id, pet_id, season_key, victory_event_key, defeated_at)
  VALUES (?, ?, ?, ?, ?, ?, '2026-08-20T12:00:00.000Z')`)
  .run(bossDefeatedTelegramId, bossDefeatedOriginalEvent.week_key, bossDefeatedMetadata.boss_id, bossDefeatedPet, bossDefeatedSeasonKey,
    `${bossDefeatedOriginalEvent.week_key}:${bossDefeatedMetadata.boss_id}`);
bossDefeatedBackfillDb.database.prepare(`DELETE FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='weekly_boss'`).run(bossDefeatedTelegramId);
bossDefeatedBackfillDb.database.prepare(`DELETE FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_boss_attempt'`).run(bossDefeatedTelegramId, bossDefeatedPet);
const bossDefeatedReplay = await processPetWeeklyBoss(bossDefeatedBackfillDb, bossDefeatedTelegramId, 'strike', 'weekly-boss-defeated-retry-key');
assert.equal(bossDefeatedReplay.reason, 'boss_already_defeated', 'Test 5i: defeated-boss duplicate path is exercised');
assert.equal(bossDefeatedBackfillDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='weekly_boss' AND event_key='weekly-boss-defeated-original-key' AND status='accepted'`).get(bossDefeatedTelegramId).count, 1,
  'Test 5i: defeated-boss duplicate path backfills one accepted weekly_boss source event');
assert.equal(bossDefeatedBackfillDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_boss_attempt' AND status='accepted'`).get(bossDefeatedTelegramId, bossDefeatedPet).count, 1,
  'Test 5i: defeated-boss duplicate path records weekly_boss_attempt once');
await processPetWeeklyBoss(bossDefeatedBackfillDb, bossDefeatedTelegramId, 'strike', 'weekly-boss-defeated-retry-key-two');
assert.equal(bossDefeatedBackfillDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_type='weekly_boss' AND event_key='weekly-boss-defeated-original-key' AND status='accepted'`).get(bossDefeatedTelegramId).count, 1,
  'Test 5i: defeated-boss repeated replay does not duplicate the backfilled source event');
assert.equal(bossDefeatedBackfillDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND objective_id='weekly_boss_attempt' AND status='accepted'`).get(bossDefeatedTelegramId, bossDefeatedPet).count, 1,
  'Test 5i: defeated-boss repeated replay keeps one weekly objective row');

const wrongPetDb = createDb();
const wrongPetA = seedPlayer(wrongPetDb, 'weekly-wrong-pet');
const wrongPetB = 'pet-weekly-wrong-pet-b';
seedAdditionalPet(wrongPetDb, 'weekly-wrong-pet', wrongPetB);
insertSourceEvent(wrongPetDb, {
  telegramId: 'weekly-wrong-pet',
  petId: wrongPetA,
  eventKey: 'weekly-wrong-pet-feed',
  eventType: 'feed',
});
const wrongPetResult = await recordWeeklyJourneyObjectiveEvidence(wrongPetDb, {
  telegram_id: 'weekly-wrong-pet',
  pet_id: wrongPetB,
  season_key: 'pet-s2026-001',
  qualification_week: 1,
  objective_id: 'weekly_care',
  source_event_key: 'weekly-wrong-pet-feed',
  progress_value: PET_WEEKLY_JOURNEY_OBJECTIVES.weekly_care.target,
  now: '2026-01-05T12:00:00.000Z',
});
assert.equal(wrongPetResult.reason, 'weekly_journey_pet_authority_mismatch',
  'Test 5g: source events for another pet cannot count');
assert.equal(wrongPetDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives WHERE pet_id=?`).get(wrongPetB).count, 0,
  'Test 5g: wrong-pet source event writes no weekly objective evidence');

const wrongWeekDb = createDb();
const wrongWeekPet = seedPlayer(wrongWeekDb, 'weekly-wrong-week');
insertSourceEvent(wrongWeekDb, {
  telegramId: 'weekly-wrong-week',
  petId: wrongWeekPet,
  eventKey: 'weekly-wrong-week-feed',
  eventType: 'feed',
  day: '2026-01-05',
});
const wrongWeekResult = await recordWeeklyJourneyObjectiveEvidence(wrongWeekDb, {
  telegram_id: 'weekly-wrong-week',
  pet_id: wrongWeekPet,
  season_key: 'pet-s2026-001',
  qualification_week: 2,
  objective_id: 'weekly_care',
  source_event_key: 'weekly-wrong-week-feed',
  progress_value: PET_WEEKLY_JOURNEY_OBJECTIVES.weekly_care.target,
  now: '2026-01-05T12:00:00.000Z',
});
assert.equal(wrongWeekResult.reason, 'weekly_journey_invalid_source_window',
  'Test 5h: source events from the wrong qualification week cannot count');
assert.equal(wrongWeekDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives WHERE pet_id=?`).get(wrongWeekPet).count, 0,
  'Test 5h: wrong-week source event writes no weekly objective evidence');

const seasonRolloverDb = createDb();
const oldSeasonPet = seedPlayer(seasonRolloverDb, 'weekly-season-old', 'pet-s2026-001');
seedAdditionalPet(seasonRolloverDb, 'weekly-season-old', 'pet-weekly-season-new', 1, 'pet-s2026-002');
insertSourceEvent(seasonRolloverDb, {
  telegramId: 'weekly-season-old',
  petId: oldSeasonPet,
  seasonKey: 'pet-s2026-001',
  day: '2026-03-30',
  eventKey: 'old-season-weekly-evidence',
});
const refusedSeasonReuse = await recordWeeklyJourneyObjectiveEvidence(seasonRolloverDb, {
  telegram_id: 'weekly-season-old',
  pet_id: oldSeasonPet,
  season_key: 'pet-s2026-002',
  qualification_week: 1,
  objective_id: 'weekly_care',
  source_event_key: 'old-season-weekly-evidence',
  progress_value: 5,
  now: '2026-04-01T00:05:00.000Z',
});
assert.equal(refusedSeasonReuse.accepted, false, 'Test 6: old-season pet evidence cannot be replayed into the new season');
assert.equal(refusedSeasonReuse.reason, 'weekly_journey_season_authority_mismatch');
assert.equal(seasonRolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE source_event_key='old-season-weekly-evidence'`).get().count, 0,
  'Test 6: rejected season mismatch does not write weekly objective evidence');
assert.equal(seasonRolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests
  WHERE season_key='pet-s2026-002'`).get().count, 0,
  'Test 6: rejected old evidence replay mints no new-season Weekly Crest');
assert.equal(seasonRolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_receipts
  WHERE season_key='pet-s2026-002' AND status='accepted'`).get().count, 0,
  'Test 6: rejected old evidence replay writes no successful receipt');
assert.equal(seasonRolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE season_key='pet-s2026-002'`).get().count, 0,
  'Test 6: rejected old evidence replay creates no cross-season progression');

const seasonMismatchDb = createDb();
const oldProgressPet = seedPlayer(seasonMismatchDb, 'weekly-season-mismatch-old', 'pet-s2026-001');
await completeWeeklyJourney(seasonMismatchDb, 'weekly-season-mismatch-old', oldProgressPet, { qualificationWeek: 13, day: '2026-03-30' });
const newSeasonPet = 'pet-weekly-season-mismatch-new';
seedAdditionalPet(seasonMismatchDb, 'weekly-season-mismatch-old', newSeasonPet, 1, 'pet-s2026-002');
insertSourceEvent(seasonMismatchDb, {
  telegramId: 'weekly-season-mismatch-old',
  petId: newSeasonPet,
  seasonKey: 'pet-s2026-001',
  day: '2026-03-30',
  eventKey: 'old-season-event-on-current-pet',
  eventType: 'weekly_care',
});
const seasonMismatch = await recordWeeklyJourneyObjectiveEvidence(seasonMismatchDb, {
  telegram_id: 'weekly-season-mismatch-old',
  pet_id: newSeasonPet,
  season_key: 'pet-s2026-002',
  qualification_week: 1,
  objective_id: 'weekly_care',
  source_event_key: 'old-season-event-on-current-pet',
  progress_value: 5,
  now: '2026-04-01T00:05:00.000Z',
});
assert.equal(seasonMismatch.reason, 'weekly_journey_season_authority_mismatch',
  'Test 6b: retrying old-season evidence after season rollover rejects with weekly season authority mismatch');
assert.equal(seasonMismatchDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests
  WHERE pet_id=? AND season_key='pet-s2026-002'`).get(newSeasonPet).count, 0,
  'Test 6b: season-mismatched retry mints no new-season Crest');
assert.equal(seasonMismatchDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_receipts
  WHERE pet_id=? AND season_key='pet-s2026-002' AND status='accepted'`).get(newSeasonPet).count, 0,
  'Test 6b: season-mismatched retry writes no success receipt');
assert.equal(seasonMismatchDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE pet_id=? AND season_key='pet-s2026-002'`).get(newSeasonPet).count, 0,
  'Test 6b: season-mismatched retry creates no cross-season progression');

const utcBoundaryDb = createDb();
const utcBoundaryPet = seedPlayer(utcBoundaryDb, 'weekly-utc-boundary');
const utcBoundaryResults = await completeWeeklyJourney(utcBoundaryDb, 'weekly-utc-boundary', utcBoundaryPet, {
  qualificationWeek: 1,
  day: '2026-01-07',
});
assert.equal(utcBoundaryResults.at(-1).weekly_journey.accepted, true,
  'Test 7: end-of-week UTC evidence can qualify the original week');
const utcBoundaryRetry = await finalizeWeeklyJourneyCrest(utcBoundaryDb, {
  telegram_id: 'weekly-utc-boundary',
  pet_id: utcBoundaryPet,
  season_key: 'pet-s2026-001',
  qualification_week: 1,
  now: '2026-01-08T00:00:02.000Z',
});
assert.equal(utcBoundaryRetry.duplicate, true,
  'Test 7: retry after UTC week rollover returns the original week authority');
const utcBoundaryEvidenceRetry = await recordWeeklyJourneyObjectiveEvidence(utcBoundaryDb, {
  telegram_id: 'weekly-utc-boundary',
  pet_id: utcBoundaryPet,
  season_key: 'pet-s2026-001',
  qualification_week: 1,
  objective_id: 'weekly_care',
  source_event_key: `${utcBoundaryPet}:pet-s2026-001:1:weekly_care:2026-01-07:1`,
  progress_value: PET_WEEKLY_JOURNEY_OBJECTIVES.weekly_care.target,
  now: '2026-01-08T00:00:02.000Z',
});
assert.equal(utcBoundaryEvidenceRetry.duplicate, true,
  'Test 7: retrying the same evidence event after UTC week rollover is a no-op');
assert.equal(utcBoundaryDb.database.prepare(`SELECT COUNT(DISTINCT objective_id) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE pet_id=? AND season_key='pet-s2026-001' AND qualification_week=1`).get(utcBoundaryPet).count, 5,
  'Test 7: boundary completed objectives remain attached to qualification week 1');
assert.equal(utcBoundaryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE pet_id=? AND season_key='pet-s2026-001' AND qualification_week=2`).get(utcBoundaryPet).count, 0,
  'Test 7: boundary retry creates no week 2 objective contamination');
assert.equal(utcBoundaryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests
  WHERE pet_id=? AND season_key='pet-s2026-001'`).get(utcBoundaryPet).count, 1,
  'Test 7: boundary retry does not duplicate Weekly Crests');

const weekTailDb = createDb();
const weekTailPet = seedPlayer(weekTailDb, 'weekly-tail', 'pet-s2026-003');
const weekTailEvidence = await completeObjective(weekTailDb, {
  telegramId: 'weekly-tail',
  petId: weekTailPet,
  seasonKey: 'pet-s2026-003',
  qualificationWeek: 13,
  objectiveId: 'weekly_care',
  day: '2026-09-30',
});
assert.equal(weekTailEvidence.accepted, true,
  'Test 8: final UTC day of a 92-day season is accepted as week 13 evidence');
assert.equal(weekTailDb.database.prepare(`SELECT qualification_week FROM telegram_pet_weekly_journey_objectives
  WHERE pet_id=? AND source_event_key=?`).get(weekTailPet, `${weekTailPet}:pet-s2026-003:13:weekly_care:2026-09-30:1`).qualification_week, 13,
  'Test 8: week 13 tail evidence preserves qualification_week 13');

const invalidDayDb = createDb();
const invalidDayPet = seedPlayer(invalidDayDb, 'weekly-invalid-day');
insertSourceEvent(invalidDayDb, {
  telegramId: 'weekly-invalid-day',
  petId: invalidDayPet,
  eventKey: 'weekly-invalid-day-evidence',
  eventType: 'feed',
  day: '2026-02-30',
});
const invalidDayResult = await recordWeeklyJourneyObjectiveEvidence(invalidDayDb, {
  telegram_id: 'weekly-invalid-day',
  pet_id: invalidDayPet,
  season_key: 'pet-s2026-001',
  qualification_week: 9,
  objective_id: 'weekly_care',
  source_event_key: 'weekly-invalid-day-evidence',
  progress_value: PET_WEEKLY_JOURNEY_OBJECTIVES.weekly_care.target,
  now: '2026-02-28T12:00:00.000Z',
});
assert.equal(invalidDayResult.reason, 'weekly_journey_invalid_source_window',
  'Test 9: malformed calendar days are rejected cleanly without crashing');
assert.equal(invalidDayDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives
  WHERE pet_id=?`).get(invalidDayPet).count, 0,
  'Test 9: invalid UTC day evidence writes no weekly objective row');

// The source action can succeed before objective writes fail. Refresh must
// rebuild that evidence for its original pet/day/week, without replaying XP.
for (const missing of ['all', 'earlier-care']) {
  const db = createDb(), owner = `missing-objectives-${missing}`;
  const petId = seedPlayer(db, owner);
  const days = { weekly_care: '2026-01-02', weekly_training: '2026-01-03', weekly_run: '2026-01-04', weekly_boss_attempt: '2026-01-05' };
  for (const [objectiveId, definition] of Object.entries(PET_WEEKLY_JOURNEY_OBJECTIVES)) {
    for (let index = 0; index < definition.target; index++) {
      const day = objectiveId === 'weekly_check_in' ? ['2026-01-01', '2026-01-06'][index] : days[objectiveId];
      const lost = missing === 'all' || objectiveId === 'weekly_care' && index === 0;
      db.failWrite = lost ? /INSERT OR IGNORE INTO telegram_pet_weekly_journey_objectives/ : null;
      const record = completeObjective(db, { telegramId: owner, petId, objectiveId, day, eventKey: `lost:${objectiveId}:${index}` });
      if (lost) await assert.rejects(record, /injected_journey_write_failure/);
      else await record;
    }
  }
  db.failWrite = null;
  for (const challengeId of ['daily_combat', 'daily_explorer']) await __dailyMoonRunTestHooks.recordChallengeEvidence(db, {
    telegram_id: owner, pet_id: petId, utc_day: days.weekly_care, challenge_id: challengeId,
    event_key: `saved:${challengeId}`, progress_value: PET_DAILY_CHALLENGES[challengeId].target,
    evidence: { authority: 'test_daily_journey_authority', pet_id: petId },
  });
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_crests').get().n, 0);
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_growth_marks').get().n, 0);
  // State initialization and evidence recovery both preserve the original pet.
  const sourceEvents = db.database.prepare('SELECT * FROM telegram_pet_events ORDER BY id').all();
  const sourceXp = db.database.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(petId).pet_xp;
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_journey_objectives WHERE pet_id=?').get(petId).n, 14,
    'bounded refreshes restore all accepted source events missing their Weekly Journey evidence');
  const crest = db.database.prepare('SELECT pet_id,qualification_week,season_key,earned_at FROM telegram_pet_weekly_crests').get();
  assert.deepEqual({ ...crest }, { pet_id: petId, qualification_week: 1, season_key: 'pet-s2026-001', earned_at: '2026-01-06T00:00:00.000Z' });
  const mark = db.database.prepare('SELECT pet_id,earned_day FROM telegram_pet_growth_marks').get();
  assert.deepEqual({ ...mark }, { pet_id: petId, earned_day: days.weekly_care });
  await Promise.all([__petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token'), __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token')]);
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_crests').get().n, 1);
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_growth_marks').get().n, 1);
  assert.deepEqual(db.database.prepare('SELECT * FROM telegram_pet_events ORDER BY id').all(), sourceEvents, 'recovery cannot replay paid source actions');
  assert.equal(db.database.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(petId).pet_xp, sourceXp);
}

// Invalid sources are excluded before the bounded evidence queue. Unrelated
// owners and pet/season tuples can never contribute to the authenticated pet.
{
  const db = createDb(), owner = 'evidence-queue';
  const petId = seedPlayer(db, owner), otherPet = seedPlayer(db, 'evidence-other');
  for (let index = 0; index < 60; index++) {
    const kind = index % 6, key = `invalid-source:${index}`;
    insertSourceEvent(db, { telegramId: owner, petId: kind === 0 ? otherPet : petId, eventKey: key,
      eventType: kind === 1 ? 'contract_complete' : 'train', day: kind === 2 ? '2026-01-32' : '2026-01-01',
      seasonKey: kind === 3 ? 'pet-s2026-002' : 'pet-s2026-001' });
    if (kind === 4) db.database.prepare("UPDATE telegram_pet_events SET status='rejected' WHERE event_key=?").run(key);
    if (kind === 5) db.database.prepare('UPDATE telegram_pet_events SET event_key=? WHERE event_key=?').run('x'.repeat(181) + index,key);
  }
  insertSourceEvent(db, { telegramId: 'evidence-other', petId: otherPet, eventKey: 'another-owner', eventType: 'train' });
  for (let index = 0; index < 51; index++) insertSourceEvent(db, {
    telegramId: owner, petId, eventKey: `valid-source:${String(index).padStart(2,'0')}`, eventType: 'train', day: '2026-01-06',
  });
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_journey_objectives').get().n, 20);
  for (let pass=1;pass<3;pass++) await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_journey_objectives').get().n, 51);
  assert.equal(db.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_weekly_journey_objectives WHERE source_event_key NOT LIKE 'valid-source:%'").get().n, 0);
}

// A week with a large evidence backlog waits for its earlier threshold
// evidence, without blocking an independently complete week.
{
  const db = createDb(), owner = 'evidence-backlog';
  const petId = seedPlayer(db, owner);
  db.failWrite = /INSERT OR IGNORE INTO telegram_pet_weekly_crests/;
  for (const [objectiveId, definition] of Object.entries(PET_WEEKLY_JOURNEY_OBJECTIVES)) {
    for (let index = 0; index < definition.target; index++) {
      const day = objectiveId === 'weekly_check_in' ? ['2026-01-04','2026-01-05'][index]
        : { weekly_care: '2026-01-06', weekly_training: '2026-01-06', weekly_run: '2026-01-03', weekly_boss_attempt: '2026-01-04' }[objectiveId];
      await completeObjective(db, { telegramId: owner, petId, objectiveId, day, eventKey: `late:${objectiveId}:${index}` })
        .catch((error) => assert.match(error.message, /injected_journey_write_failure/));
    }
  }
  for (const objectiveId of Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES)) await completeObjective(db, {
    telegramId: owner, petId, qualificationWeek: 2, objectiveId, day: '2026-01-12',
  }).catch((error) => assert.match(error.message, /injected_journey_write_failure/));
  db.failWrite = null;
  for (let index = 0; index < 63; index++) insertSourceEvent(db, { telegramId: owner, petId,
    eventKey: `earlier:${String(index).padStart(2,'0')}`, eventType: index < 60 ? 'feed' : 'train', day: index < 60 ? '2026-01-01' : '2026-01-02' });
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.deepEqual(db.database.prepare('SELECT qualification_week FROM telegram_pet_weekly_crests').all().map((r) => r.qualification_week), [2]);
  for (let pass=1;pass<4;pass++) await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.equal(db.database.prepare('SELECT earned_at FROM telegram_pet_weekly_crests WHERE qualification_week=1').get().earned_at, '2026-01-05T00:00:00.000Z');
}

// Refresh alone recovers both interruptions: before the crest and after the
// crest but before its receipt. Original periods survive rollover and switching.
for (const failWrite of [/INSERT OR IGNORE INTO telegram_pet_weekly_crests/, /INSERT OR IGNORE INTO telegram_pet_weekly_journey_receipts/]) {
  const db = createDb(), owner = 'weekly-refresh';
  const petId = seedPlayer(db, owner);
  for (const objectiveId of Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES).slice(0, -1)) await completeObjective(db, { telegramId: owner, petId, objectiveId });
  db.failWrite = failWrite;
  await assert.rejects(completeObjective(db, { telegramId: owner, petId, objectiveId: 'weekly_check_in' }), /injected_journey_write_failure/);
  db.failWrite = null;
  assert.equal(db.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_weekly_journey_receipts WHERE status='accepted'").get().n, 0);
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  const receipt = db.database.prepare("SELECT * FROM telegram_pet_weekly_journey_receipts WHERE status='accepted'").get();
  assert.ok(receipt?.crest_id, 'refresh settles fully evidenced weekly awards without another action');
  assert.equal(receipt.pet_id, petId); assert.equal(receipt.qualification_week, 1); assert.equal(receipt.season_key, 'pet-s2026-001');
  const crest = db.database.prepare('SELECT * FROM telegram_pet_weekly_crests').get();
  assert.match(crest.earned_at, /^2026-01-05/, 'a recovery must not use the current week as its earning date');
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_crests').get().n, 1);
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_journey_receipts').get().n, 1);
}

// Later qualifying actions must not move a recovered award beyond the first
// day all objectives crossed their individual thresholds.
for (const [failWrite, earnedAt] of [
  [/INSERT OR IGNORE INTO telegram_pet_weekly_crests/, '2026-01-05T00:00:00.000Z'],
  [/INSERT OR IGNORE INTO telegram_pet_weekly_journey_receipts/, '2026-01-05T12:00:00.000Z'],
]) {
  const db = createDb(), owner = 'weekly-threshold-date';
  const petId = seedPlayer(db, owner);
  const recordOne = (objectiveId, day, key) => completeObjective(db, {
    telegramId: owner, petId, objectiveId, day, eventKey: `threshold:${key}`,
  });
  db.failWrite = failWrite;
  for (let index = 0; index < 5; index++) await recordOne('weekly_care', index < 3 ? '2026-01-01' : '2026-01-02', `care:${index}`);
  for (let index = 0; index < 3; index++) await recordOne('weekly_training', index < 1 ? '2026-01-01' : '2026-01-03', `train:${index}`);
  // Insert out of source-day order: delivery/retry order cannot move a crossing.
  for (const [index, day] of ['2026-01-04', '2026-01-01', '2026-01-01'].entries()) await recordOne('weekly_run', day, `run:${index}`);
  await recordOne('weekly_boss_attempt', '2026-01-03', 'boss');
  await recordOne('weekly_check_in', '2026-01-02', 'cache:first');
  await assert.rejects(recordOne('weekly_check_in', '2026-01-05', 'cache:second'), /injected_journey_write_failure/);
  for (const objectiveId of Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES)) {
    await assert.rejects(recordOne(objectiveId, '2026-01-07', `late:${objectiveId}`), /injected_journey_write_failure/);
  }
  db.failWrite = null;
  if (failWrite.test('INSERT OR IGNORE INTO telegram_pet_weekly_crests')) {
    db.database.prepare("UPDATE telegram_pet_events SET status='rejected' WHERE telegram_id=? AND event_type='boss_fought'").run(owner);
    await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
    assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_crests WHERE pet_id=?').get(petId).n, 0,
      'all five objectives need an accepted source-backed threshold crossing before recovery can select a date');
    db.database.prepare("UPDATE telegram_pet_events SET status='accepted' WHERE telegram_id=? AND event_type='boss_fought'").run(owner);
  }
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  const crest = db.database.prepare('SELECT * FROM telegram_pet_weekly_crests WHERE pet_id=?').get(petId);
  assert.equal(crest?.earned_at, earnedAt,
    'recover the latest first threshold-crossing day or preserve the existing award timestamp; never use later surplus actions');
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.deepEqual(db.database.prepare('SELECT * FROM telegram_pet_weekly_crests WHERE pet_id=?').all(petId), [crest]);
}

// Five older scopes without enough accepted source evidence must not consume
// the recovery budget forever. Six recoverable scopes drain in batches of two.
{
  const db = createDb(), owner = 'weekly-recovery-queue';
  const petId = seedPlayer(db, owner);
  db.failWrite = /INSERT OR IGNORE INTO telegram_pet_weekly_crests/;
  for (let week = 1; week <= 11; week++) {
    const day = new Date(Date.UTC(2026, 0, 2 + (week - 1) * 7)).toISOString().slice(0, 10);
    const nextDay = new Date(Date.UTC(2026, 0, 3 + (week - 1) * 7)).toISOString().slice(0, 10);
    const request = { telegramId: owner, petId, qualificationWeek: week, day };
    for (const objectiveId of Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES).slice(0, -1)) await completeObjective(db, { ...request, objectiveId });
    await completeObjective(db, { ...request, objectiveId: 'weekly_check_in', eventKey: `queue:${week}:cache:first` });
    await assert.rejects(completeObjective(db, { ...request, day: nextDay, objectiveId: 'weekly_check_in', eventKey: `queue:${week}:cache:second` }), /injected_journey_write_failure/);
  }
  db.failWrite = null;
  const sourceKeys = (week, objectiveId = null) => db.database.prepare(`SELECT source_event_key FROM telegram_pet_weekly_journey_objectives
    WHERE telegram_id=? AND pet_id=? AND qualification_week=? AND (? IS NULL OR objective_id=?)`)
    .all(owner, petId, week, objectiveId, objectiveId).map((row) => row.source_event_key);
  for (const key of sourceKeys(1)) db.database.prepare('DELETE FROM telegram_pet_events WHERE telegram_id=? AND event_key=?').run(owner, key);
  for (const key of sourceKeys(2, 'weekly_training')) db.database.prepare("UPDATE telegram_pet_events SET status='rejected' WHERE telegram_id=? AND event_key=?").run(owner, key);
  // Some matching sources are insufficient if an additive objective no longer
  // reaches its target. Neither a different season nor a missing source pet counts.
  db.database.prepare('DELETE FROM telegram_pet_events WHERE telegram_id=? AND event_key=?').run(owner, sourceKeys(3, 'weekly_training')[0]);
  for (const key of sourceKeys(4, 'weekly_training')) db.database.prepare("UPDATE telegram_pet_events SET season_key='pet-s2026-002' WHERE telegram_id=? AND event_key=?").run(owner, key);
  for (const key of sourceKeys(5, 'weekly_training')) db.database.prepare('UPDATE telegram_pet_events SET pet_id=NULL WHERE telegram_id=? AND event_key=?').run(owner, key);
  const earnedWeeks = () => db.database.prepare('SELECT qualification_week FROM telegram_pet_weekly_crests WHERE pet_id=? ORDER BY qualification_week').all(petId).map((row) => row.qualification_week);
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.deepEqual(earnedWeeks(), [6, 7],
    'filter source-backed threshold crossings before the two-award bound');
  assert.equal(db.database.prepare('SELECT earned_at FROM telegram_pet_weekly_crests WHERE pet_id=? AND qualification_week=6').get(petId).earned_at,
    '2026-02-07T00:00:00.000Z', 'queue filtering preserves the original qualification day');
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.deepEqual(earnedWeeks(), [6, 7, 8, 9], 'the next two recoverable scopes settle on the next refresh');
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.deepEqual(earnedWeeks(), [6, 7, 8, 9, 10, 11], 'all six recoverable scopes eventually settle');
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.deepEqual(earnedWeeks(), [6, 7, 8, 9, 10, 11], 'repeat refreshes neither duplicate awards nor qualify missing evidence');
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_journey_receipts WHERE pet_id=?').get(petId).n, 6);
  for (const key of sourceKeys(2, 'weekly_training')) db.database.prepare("UPDATE telegram_pet_events SET status='accepted' WHERE telegram_id=? AND event_key=?").run(owner, key);
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.deepEqual(earnedWeeks(), [2, 6, 7, 8, 9, 10, 11], 'skipped scopes remain eligible if their accepted sources become available again');
  assert.equal(db.database.prepare('SELECT earned_at FROM telegram_pet_weekly_crests WHERE pet_id=? AND qualification_week=2').get(petId).earned_at,
    '2026-01-10T00:00:00.000Z');
}

{
  const db = createDb(), owner = 'weekly-season-refresh';
  const petId = seedPlayer(db, owner);
  db.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key,unlocked_at)
    VALUES (?,?,'legendary_moon_guardian',5,'fixture-legendary','2026-03-03T00:00:00Z')`).run(petId, owner);
  for (let day = 0; day < 60; day++) {
    const earned = new Date(Date.UTC(2026, 0, 1 + day)).toISOString();
    db.database.prepare(`INSERT INTO telegram_pet_growth_marks (mark_id,pet_id,telegram_id,season_key,milestone_type,evidence_key,earned_day,earned_at)
      VALUES (?,?,?,'pet-s2026-001','care_milestone',?,?,?)`).run(`fixture-mark:${day}`, petId, owner, `care:${day}`, earned.slice(0,10), earned);
  }
  for (let week = 1; week < 10; week++) db.database.prepare(`INSERT INTO telegram_pet_weekly_crests
    (crest_id,pet_id,telegram_id,season_key,season_week,qualification_week,objective_id,evidence_key)
    VALUES (?,?,?,'pet-s2026-001',?,?,'weekly_journey',?)`).run(`fixture-crest:${week}`, petId, owner, week, week, `weekly-journey:fixture:${week}`);
  const request = { telegramId: owner, petId, qualificationWeek: 10, day: '2026-03-05' };
  for (const objectiveId of Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES).slice(0, -1)) await completeObjective(db, { ...request, objectiveId });
  db.failWrite = /INSERT OR IGNORE INTO telegram_pet_season_completions/;
  await assert.rejects(completeObjective(db, { ...request, objectiveId: 'weekly_check_in' }), /injected_journey_write_failure/);
  db.failWrite = null;
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_crests').get().n, 10);
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_season_completions WHERE pet_id=?').get(petId).n, 1,
    'recovering the final earned Crest must also repair interrupted season completion');
  const completedAt = db.database.prepare('SELECT completed_at FROM telegram_pet_season_completions WHERE pet_id=?').get(petId).completed_at;
  await __petMediaTestHooks.buildPetMiniAppState(db, owner, 'fixture-token');
  assert.equal(db.database.prepare('SELECT completed_at FROM telegram_pet_season_completions WHERE pet_id=?').get(petId).completed_at, completedAt);
}

{
  const db = createDb(), owner = 'weekly-source-read-outage';
  const petId = seedPlayer(db, owner);
  const sourceEventKey = 'weekly-source-read-outage:feed';
  insertSourceEvent(db, { telegramId: owner, petId, eventKey: sourceEventKey, eventType: 'feed' });
  db.beforeFirst = (sql) => {
    if (/FROM telegram_pet_events\s+WHERE telegram_id=\? AND event_key=\?/i.test(sql)) throw new Error('injected_weekly_source_read_failure');
  };
  await assert.rejects(recordWeeklyJourneyObjectiveEvidence(db, {
    telegram_id: owner,
    pet_id: petId,
    season_key: 'pet-s2026-001',
    qualification_week: 1,
    objective_id: 'weekly_care',
    source_event_key: sourceEventKey,
  }), /injected_weekly_source_read_failure/,
  'a failed source event read must not be reported as missing evidence');
  db.beforeFirst = null;
  assert.equal(db.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives WHERE pet_id=?').get(petId).count, 0,
    'source event read outages cannot mutate Weekly Journey progress');
}

{
  const db = createDb(), owner = 'weekly-progress-read-outage';
  const petId = seedPlayer(db, owner);
  db.beforeAll = (sql) => {
    if (/FROM telegram_pet_weekly_journey_objectives/i.test(sql)) throw new Error('injected_weekly_progress_read_failure');
  };
  await assert.rejects(finalizeWeeklyJourneyCrest(db, {
    telegram_id: owner, pet_id: petId, season_key: 'pet-s2026-001', qualification_week: 1,
  }), /injected_weekly_progress_read_failure/,
  'a failed objective progress read must not be converted into zero progress');
  db.beforeAll = (sql) => (/FROM telegram_pet_weekly_journey_objectives/i.test(sql)
    ? { success: false, error: 'injected_resolved_weekly_progress_read_failure' }
    : undefined);
  await assert.rejects(finalizeWeeklyJourneyCrest(db, {
    telegram_id: owner, pet_id: petId, season_key: 'pet-s2026-001', qualification_week: 1,
  }), /pet_state_read_unavailable/,
  'a resolved D1 objective failure must not be converted into zero progress');
  db.beforeAll = null;
}

{
  const db = createDb(), owner = 'weekly-receipt-read-outage';
  const petId = seedPlayer(db, owner);
  await completeWeeklyJourney(db, owner, petId);
  db.beforeFirst = (sql) => {
    if (/FROM telegram_pet_weekly_journey_receipts/i.test(sql)) throw new Error('injected_weekly_receipt_read_failure');
  };
  await assert.rejects(finalizeWeeklyJourneyCrest(db, {
    telegram_id: owner, pet_id: petId, season_key: 'pet-s2026-001', qualification_week: 1,
  }), /injected_weekly_receipt_read_failure/,
  'a failed accepted receipt read must not start duplicate settlement');
  db.beforeFirst = null;
  assert.equal(db.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests WHERE pet_id=?').get(petId).count, 1);
}

{
  const db = createDb(), owner = 'weekly-crest-read-outage';
  const petId = seedPlayer(db, owner);
  await completeWeeklyJourney(db, owner, petId);
  db.database.prepare('DELETE FROM telegram_pet_weekly_journey_receipts WHERE pet_id=?').run(petId);
  db.beforeFirst = (sql) => {
    if (/FROM telegram_pet_weekly_crests/i.test(sql)) throw new Error('injected_weekly_crest_read_failure');
  };
  await assert.rejects(finalizeWeeklyJourneyCrest(db, {
    telegram_id: owner, pet_id: petId, season_key: 'pet-s2026-001', qualification_week: 1,
  }), /injected_weekly_crest_read_failure/,
  'a failed Crest authority read must not be converted into an absent Crest');
  db.beforeFirst = null;
  assert.equal(db.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_receipts WHERE pet_id=?').get(petId).count, 0,
    'Crest authority outages cannot write a misleading recovery receipt');
}

console.log('telegram-pets-weekly-journey.test.mjs passed');
