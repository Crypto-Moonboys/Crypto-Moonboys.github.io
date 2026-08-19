import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  PET_WEEKLY_JOURNEY_OBJECTIVES,
  WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,
  WEEKLY_JOURNEY_TOTAL_OBJECTIVES,
  finalizeWeeklyJourneyCrest,
  recordWeeklyJourneyObjectiveEvidence,
} from '../workers/moonboys-api/pets/weekly-journey.js';

class Statement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.db, this.sql, args); }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(result.changes || 0) } };
  }
}

class D1 {
  constructor() {
    this.database = new DatabaseSync(':memory:');
  }
  prepare(sql) { return new Statement(this.database, sql); }
}

const schema = await readFile(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const seasonCompletionMigration = await readFile(new URL('../workers/moonboys-api/migrations/058_telegram_pet_season_completion.sql', import.meta.url), 'utf8');
const seasonEconomyMigration = await readFile(new URL('../workers/moonboys-api/migrations/061_moonpet_season_economy_calibration.sql', import.meta.url), 'utf8');
const weeklyJourneyMigration = await readFile(new URL('../workers/moonboys-api/migrations/068_moonpet_weekly_journey_authority.sql', import.meta.url), 'utf8');
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
assert.match(weeklyJourneySource, /intentionally a 5\/5 foundation authority/,
  'weekly journey source must document that the threshold is intentionally 5/5');
assert.match(weeklyJourneySource, /exposed only\s+\/\/ through test hooks/,
  'weekly journey source must document the foundation-only production exposure decision');
assert.doesNotMatch(workerSource, /body\.action === 'weekly_journey'|processWeeklyJourney|handleWeeklyJourney/i,
  'Weekly Journey PR #1231 must remain foundation-only with no live player-facing route');
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
  db.database.exec(seasonCompletionMigration);
  db.database.exec(seasonEconomyMigration);
  db.database.exec(weeklyJourneyMigration);
  db.database.exec(weeklyJourneyMigration);
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
    const sourceEventKey = eventKey || `${petId}:${seasonKey}:${qualificationWeek}:${objectiveId}:${day}:${index + 1}`;
    insertSourceEvent(db, { telegramId, petId, seasonKey, day, eventKey: sourceEventKey, eventType: eventType || TEST_WEEKLY_SOURCE_TYPES[objectiveId] });
    result = await recordWeeklyJourneyObjectiveEvidence(db, {
      telegram_id: telegramId,
      pet_id: petId,
      season_key: seasonKey,
      qualification_week: qualificationWeek,
      objective_id: objectiveId,
      source_event_key: sourceEventKey,
      progress_value: progressValue ?? objective.target,
      evidence: { authority: 'test_weekly_journey_authority', pet_id: petId, season_key: seasonKey, qualification_week: qualificationWeek },
      now: `${day}T12:00:00.000Z`,
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
assert.equal(duplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_crests WHERE pet_id=?`).get(duplicatePet).count, 1,
  'Test 5: duplicate retries do not award extra Crests');
assert.equal(duplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_receipts WHERE pet_id=?`).get(duplicatePet).count, 1,
  'Test 5: duplicate retries do not create duplicate receipts');

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

console.log('telegram-pets-weekly-journey.test.mjs passed');
