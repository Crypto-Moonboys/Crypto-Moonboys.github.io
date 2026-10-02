import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { mock } from 'node:test';
import {
  PET_DAILY_CHALLENGES,
  __dailyMoonRunTestHooks,
  createDailyMoonRun,
  extractDailyMoonRun,
  generateDailyMoonRunSeed,
  getDailyMoonRunAnalytics,
  getDailyMoonRunLeaderboard,
  getDailySeasonId,
  processDailyMoonRunStep,
  recoverDailyMoonRunEnding,
  recordDailyCareChallenge,
  syncDailyMoonRun,
  validateDailyChallengeContent,
} from '../workers/moonboys-api/pets/daily-moon-run.js';
import {
  __rogueliteFoundationTestHooks,
  awardPetReward,
  createPetRunRoom,
  generatePetRunRoom,
  persistPetRunRoomOutcome,
  startPetRogueliteRun,
} from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';
import moonboysApiWorker from '../workers/moonboys-api/deployment-entry.js';
import { DAILY_RUN_CONDITIONS, DAILY_RUN_RULES_ID, DAILY_RUN_TACTICS, chooseDailyRunTactic, dailyTacticalBoard, previewDailyChoice, readDailyModifiers } from '../workers/moonboys-api/pets/daily-run-tactics.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/044_telegram_pet_daily_runs.sql', import.meta.url), 'utf8');
const journeyMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/067_moonpet_daily_journey_authority.sql', import.meta.url), 'utf8');
const seasonCompletionMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/058_telegram_pet_season_completion.sql', import.meta.url), 'utf8');
const seasonEconomyMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/061_moonpet_season_economy_calibration.sql', import.meta.url), 'utf8');
const dailySource = fs.readFileSync(new URL('../workers/moonboys-api/pets/daily-moon-run.js', import.meta.url), 'utf8');
const rogueliteSource = fs.readFileSync(new URL('../workers/moonboys-api/pets/roguelite-foundation.js', import.meta.url), 'utf8');
const seasonAuthoritySource = fs.readFileSync(new URL('../workers/moonboys-api/pets/season-authority.js', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const challenges = JSON.parse(fs.readFileSync(new URL('../workers/moonboys-api/pets/content/daily-challenges.json', import.meta.url), 'utf8'));

class Statement {
  constructor(adapter, sql, args = []) { this.adapter = adapter; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.adapter, this.sql, args); }
  async first() {
    await this.adapter.beforeFirst?.(this.sql, this.args);
    if (this.adapter.failFirst?.test(this.sql)) return { success: false, error: 'injected_daily_first_failure' };
    return this.adapter.database.prepare(this.sql).get(...this.args) || null;
  }
  async run() {
    if (this.adapter.failEndingWrite?.(this.sql, this.args)) throw new Error('injected_ending_write_failure');
    if (this.adapter.failWrite?.test(this.sql)) throw new Error('injected_journey_write_failure');
    const result = this.adapter.database.prepare(this.sql).run(...this.args);
    return { results: [], meta: { changes: Number(result.changes || 0) } };
  }
  async all() {
    if (this.adapter.failAll?.(this.sql, this.args)) return { success: false, error: 'injected_daily_read_failure' };
    const result = { results: this.adapter.database.prepare(this.sql).all(...this.args) };
    await this.adapter.afterAll?.(this.sql);
    return result;
  }
}

class D1 {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.database.exec(schema);
    this.database.exec(seasonCompletionMigration);
    this.database.exec(seasonEconomyMigration);
    this.database.exec(journeyMigration);
    this.queue = Promise.resolve();
  }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    const execute = () => {
      this.database.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((statement) => {
          const prepared = this.database.prepare(statement.sql);
          if (/\bRETURNING\b/i.test(statement.sql)) {
            const rows = prepared.all(...statement.args);
            return { results: rows, meta: { changes: rows.length } };
          }
          const result = prepared.run(...statement.args);
          return { results: [], meta: { changes: Number(result.changes || 0) } };
        });
        this.database.exec('COMMIT');
        return results;
      } catch (error) {
        this.database.exec('ROLLBACK');
        throw error;
      }
    };
    const result = this.queue.then(execute);
    this.queue = result.catch(() => {});
    return result;
  }
}

function seedPlayer(db, telegramId, seasonKey = 'pet-s2026-003') {
  db.database.prepare('INSERT INTO telegram_users (telegram_id, xp, level) VALUES (?, 0, 1)').run(telegramId);
  db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_xp, level) VALUES (?, 0, 1)').run(telegramId);
  const petId = `pet-${telegramId}`;
  db.database.prepare(`INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number, acquisition_type) VALUES (?, ?, ?, 1, 'free')`).run(petId, telegramId, seasonKey);
  db.database.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key) VALUES (?, ?, ?)`).run(telegramId, petId, seasonKey);
  db.database.prepare(`INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number, source_profile_updated_at) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)`).run(petId, telegramId, seasonKey);
}

// Resolved D1 failures in each ownership read must stop before run/evidence writes.
for (const [kind, query] of [
  ['active', /SELECT a.pet_id, a.season_key/],
  ['fallback', /SELECT s.pet_id, s.season_key/],
  ['explicit-evidence', /SELECT s.pet_id,s.telegram_id,s.season_key/],
  ['daily-evidence', /SELECT r.pet_id,r.telegram_id,i.season_key/],
]) {
  const failedDb = new D1(), owner = `read-failure-${kind}`;
  seedPlayer(failedDb, owner);
  if (kind === 'fallback') failedDb.database.prepare('DELETE FROM telegram_pet_active_slots WHERE telegram_id=?').run(owner);
  failedDb.failFirst = query;
  const operation = kind.endsWith('evidence')
    ? __dailyMoonRunTestHooks.recordChallengeEvidence(failedDb, {
      telegram_id: owner, utc_day: '2026-08-11', event_key: `failed:${kind}`,
      challenge_id: Object.keys(PET_DAILY_CHALLENGES)[0], progress_value: 1,
      ...(kind === 'explicit-evidence' ? { pet_id: `pet-${owner}` } : {}),
    })
    : createDailyMoonRun(failedDb, { telegram_id: owner, now: new Date('2026-08-11T12:00:00Z') });
  await assert.rejects(operation, /pet_state_read_unavailable/, kind + ' must fail safely');
  for (const table of ['telegram_pet_runs', 'telegram_pet_daily_runs', 'telegram_pet_daily_journey_objectives', 'telegram_pet_daily_challenge_events', 'telegram_pet_daily_challenge_progress', 'telegram_pet_daily_analytics']) {
    assert.equal(failedDb.database.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n, 0, kind + ' leaves ' + table + ' unchanged');
  }
}

function seedAdditionalPet(db, telegramId, petId, slotNumber = 2, seasonKey = 'pet-s2026-003') {
  db.database.prepare(`INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number, acquisition_type)
    VALUES (?, ?, ?, ?, 'free')`).run(petId, telegramId, seasonKey, slotNumber);
  db.database.prepare(`INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number, source_profile_updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(petId, telegramId, seasonKey, slotNumber);
}

for (const [label,query] of [
  ['outcome stats',/SELECT pet_xp, level, health, energy, happiness, cleanliness/],
  ['equipment snapshot',/SELECT \* FROM telegram_pet_instances WHERE pet_id=\?/],
]) {
  const adapter=new D1(), owner=`daily-required-${label}`, now=new Date('2026-08-11T12:00:00Z');
  seedPlayer(adapter,owner);
  const started=await createDailyMoonRun(adapter,{telegram_id:owner,now});
  adapter.failFirst=query;
  await assert.rejects(processDailyMoonRunStep(adapter,{telegram_id:owner,run_id:started.daily_run.run_id,choice_key:started.room.choices[0].choice_id,expected_step_index:0,now}),/pet_state_read_unavailable/,label);
  assert.equal(adapter.database.prepare('SELECT status FROM telegram_pet_run_rooms WHERE room_id=?').get(started.room.room_id).status,'pending','an unavailable pet cannot consume its official room');
  assert.equal(adapter.database.prepare('SELECT current_room FROM telegram_pet_runs WHERE run_id=?').get(started.daily_run.run_id).current_room,0);
}

{
  const adapter=new D1(), request={utc_day:'2026-08-11'};
  assert.deepEqual((await getDailyMoonRunLeaderboard(adapter,request)).entries,[],'a successful empty leaderboard stays valid');
  adapter.failAll=()=>true;
  await assert.rejects(getDailyMoonRunLeaderboard(adapter,request),/pet_state_read_unavailable/);
  await assert.rejects(getDailyMoonRunAnalytics(adapter,request),/pet_state_read_unavailable/);
  adapter.failAll=null; adapter.failFirst=/SELECT COUNT\(\*\) AS participation/;
  await assert.rejects(getDailyMoonRunAnalytics(adapter,request),/pet_state_read_unavailable/);
}

function insertCareEvent(db, telegramId, eventKey, day, action = 'feed', petId = null) {
  const sourceSeason = petId ? db.database.prepare('SELECT season_key FROM telegram_pet_season_slots WHERE pet_id=?').get(petId)?.season_key || 'season' : 'season';
  db.database.prepare(`INSERT INTO telegram_pet_events
    (id, pet_id, telegram_id, event_type, event_key, season_key, day_key, week_key, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'week', 'accepted')`).run(`id:${eventKey}`, petId, telegramId, action, eventKey, sourceSeason, day);
}

function resolveDailyRun(db, telegramId, runId, { status = 'completed', score = 900, boss = true } = {}) {
  db.database.prepare(`UPDATE telegram_pet_runs SET status=?, current_room=10, depth=10, rooms_completed=10, score=?,
    boss_fought=?, completed_at='2026-08-11 00:10:00', ended_at='2026-08-11 00:10:00' WHERE telegram_id=? AND run_id=?`)
    .run(status, score, boss ? 'alley_king' : null, telegramId, runId);
  const types = ['choice_event', 'choice_event', 'battle', 'loot', 'choice_event', 'choice_event', 'battle', 'choice_event', 'elite', 'boss'];
  for (let index = 0; index < types.length; index += 1) {
    const roomNumber = index + 1;
    db.database.prepare(`INSERT OR REPLACE INTO telegram_pet_run_rooms
      (room_id, run_id, telegram_id, room_number, room_type, status, generated_data, outcome_data)
      VALUES (?, ?, ?, ?, ?, 'resolved', ?, '{"success":true}')`)
      .run(`${runId}:${roomNumber}`, runId, telegramId, roomNumber, types[index], JSON.stringify({ content_id: `room_${roomNumber}` }));
  }
  if (boss) db.database.prepare(`INSERT INTO telegram_pet_run_analytics
    (analytics_id, run_id, telegram_id, event_type, event_data) VALUES (?, ?, ?, 'boss_fought', ?)`)
    .run(`${runId}:boss:win`, runId, telegramId, JSON.stringify({ boss_id: 'alley_king', outcome: 'win' }));
}

async function recordFullJourneyObjective(db, { telegramId, petId, day, challengeId, eventKey = null }) {
  return __dailyMoonRunTestHooks.recordChallengeEvidence(db, {
    telegram_id: telegramId,
    pet_id: petId,
    utc_day: day,
    challenge_id: challengeId,
    event_key: eventKey || `test:${petId}:${day}:${challengeId}`,
    progress_value: PET_DAILY_CHALLENGES[challengeId].target,
    evidence: { authority: 'test_daily_journey_authority', pet_id: petId },
  });
}

for (const table of [
  'telegram_pet_daily_runs',
  'telegram_pet_daily_challenge_progress',
  'telegram_pet_daily_challenge_events',
  'telegram_pet_daily_leaderboard_records',
  'telegram_pet_seasonal_challenge_state',
  'telegram_pet_seasonal_achievements',
  'telegram_pet_daily_analytics',
]) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must exist in canonical schema`);
  assert.ok(migration.includes(`CREATE TABLE ${table}`), `${table} must exist in migration 044`);
}
for (const table of ['telegram_pet_daily_journey_objectives', 'telegram_pet_daily_journey_receipts']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must exist in canonical schema`);
  assert.ok(journeyMigration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must exist in migration 067`);
}
assert.doesNotMatch(migration, /\b(?:ALTER\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+telegram_)\b/i, 'migration 044 must be additive only');
assert.doesNotMatch(journeyMigration, /\b(?:ALTER\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+telegram_)\b/i, 'migration 067 must be additive only');
assert.doesNotMatch(migration, /(?:pet_xp|community_xp|moon_gold|moon_crystals|style_tokens|reward_multiplier|xp_multiplier)\s+(?:INTEGER|REAL)/i,
  'migration 044 cannot create another economy or progression track');
assert.doesNotMatch(dailySource, /UPDATE\s+telegram_pet_(?:profiles|inventory|evolutions|personality_traits|memories)/i,
  'daily retention code cannot write protected progression authorities directly');
assert.doesNotMatch(dailySource, /awardPetReward\s*\(/, 'daily tracking cannot create a direct reward path');
assert.match(dailySource, /getMoonpetSeasonKey/, 'Daily Moon Run must use the canonical Moonpet season key helper');
assert.match(rogueliteSource, /getMoonpetSeasonKey\(now\)/, 'reward settlement fallback must use the canonical Moonpet season key helper');
assert.doesNotMatch(`${dailySource}\n${rogueliteSource}`, /dayOfYear|Math\.floor\(dayOfYear \/ 90\)/,
  'Moonpet runtime paths must not recreate independent 90-day season keys');
assert.match(seasonAuthoritySource, /Math\.floor\(date\.getUTCMonth\(\) \/ 3\)/,
  'canonical Moonpet season authority must remain UTC calendar-quarter based');
const dailyStepRoute = workerSource.slice(workerSource.indexOf("body.action === 'run_step'"), workerSource.indexOf("body.action === 'run_extract'"));
assert.match(dailyStepRoute, /getDailyMoonRunReservation/, 'run_step must identify daily reservations before choosing an engine');
assert.match(dailyStepRoute, /processDailyMoonRunStep/, 'daily run_step must route through the roguelite room adapter');
assert.match(dailyStepRoute, /processPetRunStep/, 'non-daily runs must preserve the existing legacy compatibility path');
assert.doesNotMatch(dailyStepRoute, /success:\s*body\.success/, 'daily run_step must not forward client-controlled outcomes');
assert.doesNotMatch(dailySource, /request\.success/, 'daily room resolution must ignore client-controlled success fields');
assert.doesNotMatch(dailySource, /request\.expected_room/, 'daily room resolution must accept only the expected step index as concurrency intent');
const dailySyncRoute = workerSource.slice(workerSource.indexOf("body.action === 'daily_run_sync'"), workerSource.indexOf("body.action === 'evolve'"));
assert.match(dailySyncRoute, /utc_day:\s*body\.utc_day/);
assert.match(dailySyncRoute, /run_id:\s*body\.run_id/, 'daily sync must forward the reservation date authority or run ID');
assert.equal(validateDailyChallengeContent(challenges), true);
assert.equal(Object.keys(PET_DAILY_CHALLENGES).length, 5);

const migrationDb = new DatabaseSync(':memory:');
migrationDb.exec(schema.split('-- Crypto Moonboy Pets daily retention foundation.')[0]);
migrationDb.prepare("INSERT INTO telegram_users (telegram_id, xp, level) VALUES ('migration-player', 77, 1)").run();
migrationDb.prepare("INSERT INTO telegram_pet_profiles (telegram_id, pet_xp, level, moon_gold) VALUES ('migration-player', 88, 1, 99)").run();
const beforeMigration = migrationDb.prepare("SELECT pet_xp, moon_gold FROM telegram_pet_profiles WHERE telegram_id='migration-player'").get();
migrationDb.exec(migration);
assert.deepEqual({ ...migrationDb.prepare("SELECT pet_xp, moon_gold FROM telegram_pet_profiles WHERE telegram_id='migration-player'").get() }, { ...beforeMigration },
  'migration 044 must preserve existing Pet XP and economy values');
assert.equal(migrationDb.prepare('PRAGMA foreign_key_check').all().length, 0);

const sameSeedA = await generateDailyMoonRunSeed('2026-08-11');
const sameSeedB = await generateDailyMoonRunSeed('2026-08-11');
const nextSeed = await generateDailyMoonRunSeed('2026-08-12');
assert.deepEqual(sameSeedA, sameSeedB, 'same UTC day must produce the same global seed');
assert.notEqual(sameSeedA.seed, nextSeed.seed, 'different UTC days must produce new seeds');
assert.match(sameSeedA.seed, /^2026-08-11-\d+$/);
await assert.rejects(() => generateDailyMoonRunSeed('2026-02-31'), /invalid_daily_run_day/);
assert.equal(getDailySeasonId('2026-03-31'), 'pet-s2026-001', 'Daily Moon Run must keep March 31 in Q1');
assert.equal(getDailySeasonId('2026-04-01'), 'pet-s2026-002', 'Daily Moon Run must switch to Q2 on April 1 UTC');
assert.equal(getDailySeasonId('2026-06-30'), 'pet-s2026-002', 'Daily Moon Run must keep June 30 in Q2');
assert.equal(getDailySeasonId('2026-07-01'), 'pet-s2026-003', 'Daily Moon Run must switch to Q3 on July 1 UTC');
assert.equal(getDailySeasonId('2026-09-30'), 'pet-s2026-003', 'Daily Moon Run must keep September 30 in Q3');
assert.equal(getDailySeasonId('2026-10-01'), 'pet-s2026-004', 'Daily Moon Run must switch to Q4 on October 1 UTC');
assert.equal(getDailySeasonId('2026-12-31'), 'pet-s2026-004', 'Daily Moon Run must never produce pet-sYYYY-005 at year end');

const rolloverDb = new D1();
const rolloverTelegramId = 'rollover-player';
const previousSeasonKey = getDailySeasonId('2026-06-30');
const rolloverSeasonKey = getDailySeasonId('2026-07-01');
const rolloverNow = new Date('2026-07-01T00:05:00.000Z');
seedPlayer(rolloverDb, rolloverTelegramId, previousSeasonKey);
const rolloverOldPetId = `pet-${rolloverTelegramId}`;
const rolloverCurrentPetId = 'pet-rollover-player-current';
seedAdditionalPet(rolloverDb, rolloverTelegramId, rolloverCurrentPetId, 1, rolloverSeasonKey);
const rolloverRun = await createDailyMoonRun(rolloverDb, { telegram_id: rolloverTelegramId, now: rolloverNow });
assert.equal(rolloverRun.accepted, true, 'season rollover keeps the selected owned pet');
assert.equal(rolloverRun.daily_run.pet_id, rolloverOldPetId,
  'Daily Moon Run reserves the selected pet using its original ownership');
assert.equal(rolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_runs
  WHERE telegram_id=? AND season_key=? AND pet_id=?`).get(rolloverTelegramId, rolloverSeasonKey, rolloverOldPetId).count, 0,
  'season rollover must never persist a Daily Run with mismatched old-season pet_id and new season_key');
assert.deepEqual({ ...rolloverDb.database.prepare(`SELECT pet_id, season_key FROM telegram_pet_active_slots WHERE telegram_id=?`).get(rolloverTelegramId) },
  { pet_id: rolloverOldPetId, season_key: previousSeasonKey },
  'Daily Moon Run rollover must not bypass the state-safe active pet handoff by switching the active pointer directly');
resolveDailyRun(rolloverDb, rolloverTelegramId, rolloverRun.daily_run.run_id);
const rolloverSync = await syncDailyMoonRun(rolloverDb, {
  telegram_id: rolloverTelegramId,
  utc_day: '2026-07-01',
  now: rolloverNow,
});
assert.equal(rolloverSync.challenge_results.some((result) => result.daily_journey?.accepted), true,
  'valid current-season Daily Run authority must preserve Daily Journey qualification after rollover');
assert.equal(rolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id=? AND season_key=? AND earned_day='2026-07-01'`).get(rolloverOldPetId, previousSeasonKey).count, 1,
  'Daily Journey Growth Mark stays with the selected original pet');
assert.equal(rolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id=? AND earned_day='2026-07-01'`).get(rolloverCurrentPetId).count, 0,
  'Daily Journey Growth Mark cannot move to an unselected new pet');

const rolloverDuplicateDb = new D1();
const rolloverDuplicateTelegramId = 'rollover-duplicate-player';
seedPlayer(rolloverDuplicateDb, rolloverDuplicateTelegramId, previousSeasonKey);
const rolloverDuplicateOldPetId = `pet-${rolloverDuplicateTelegramId}`;
const rolloverDuplicateCurrentPetId = 'pet-rollover-duplicate-player-current';
seedAdditionalPet(rolloverDuplicateDb, rolloverDuplicateTelegramId, rolloverDuplicateCurrentPetId, 1, rolloverSeasonKey);
const rolloverDuplicateRunId = `daily:2026-07-01:${rolloverDuplicateTelegramId}`;
rolloverDuplicateDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, pet_id, telegram_id, run_id, season_key, region, difficulty, seed, status, current_room, max_room, depth, max_depth)
  VALUES ('rollover-duplicate-run', ?, ?, ?, ?, 'moon_alley', 1, 12345, 'active', 0, 10, 0, 10)`)
  .run(rolloverDuplicateOldPetId, rolloverDuplicateTelegramId, rolloverDuplicateRunId, rolloverSeasonKey);
const refusedRolloverDuplicate = await createDailyMoonRun(rolloverDuplicateDb, { telegram_id: rolloverDuplicateTelegramId, now: rolloverNow });
assert.equal(refusedRolloverDuplicate.accepted, false,
  'Daily Moon Run must reject deterministic run reuse when existing pet authority mismatches the requested current-season pet');
assert.equal(refusedRolloverDuplicate.reason, 'run_pet_authority_mismatch');
assert.equal(rolloverDuplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_runs
  WHERE telegram_id=? AND utc_day='2026-07-01'`).get(rolloverDuplicateTelegramId).count, 0,
  'mismatched deterministic run reuse must not create a Daily Run reservation');
assert.equal(rolloverDuplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_runs
  WHERE telegram_id=? AND run_id=? AND pet_id=? AND season_key=?`).get(rolloverDuplicateTelegramId, rolloverDuplicateRunId, rolloverDuplicateOldPetId, rolloverSeasonKey).count, 1,
  'mismatched deterministic run reuse must not overwrite or migrate the existing run');

const staleReservationDb = new D1();
const staleReservationTelegramId = 'stale-reservation-player';
seedPlayer(staleReservationDb, staleReservationTelegramId, previousSeasonKey);
const staleReservationOldPetId = `pet-${staleReservationTelegramId}`;
const staleReservationCurrentPetId = 'pet-stale-reservation-player-current';
seedAdditionalPet(staleReservationDb, staleReservationTelegramId, staleReservationCurrentPetId, 1, rolloverSeasonKey);
const staleReservationRunId = `daily:2026-07-01:${staleReservationTelegramId}`;
staleReservationDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, pet_id, telegram_id, run_id, season_key, region, difficulty, seed, status, current_room, max_room, depth, max_depth)
  VALUES ('stale-reservation-run', ?, ?, ?, ?, 'moon_alley', 1, 12345, 'active', 0, 10, 0, 10)`)
  .run(staleReservationOldPetId, staleReservationTelegramId, staleReservationRunId, rolloverSeasonKey);
staleReservationDb.database.prepare(`INSERT INTO telegram_pet_daily_runs
  (telegram_id, pet_id, utc_day, seed, run_id, status, score, depth, boss_defeated)
  VALUES (?, ?, '2026-07-01', '2026-07-01-12345', ?, 'active', 0, 0, 0)`)
  .run(staleReservationTelegramId, staleReservationOldPetId, staleReservationRunId);
const refusedStaleReservation = await createDailyMoonRun(staleReservationDb, { telegram_id: staleReservationTelegramId, now: rolloverNow });
assert.equal(refusedStaleReservation.accepted, false,
  'existing Daily Run reservations must be revalidated before reuse after season rollover');
assert.equal(refusedStaleReservation.reason, 'daily_run_pet_authority_mismatch');
assert.equal(staleReservationDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_challenge_events
  WHERE telegram_id=? AND utc_day='2026-07-01'`).get(staleReservationTelegramId).count, 0,
  'stale Daily Run reservation rejection must not record challenge evidence');
assert.equal(staleReservationDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND utc_day='2026-07-01'`).get(staleReservationTelegramId).count, 0,
  'stale Daily Run reservation rejection must not record Daily Journey objectives');
assert.equal(staleReservationDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE telegram_id=?`).get(staleReservationTelegramId).count, 0,
  'stale Daily Run reservation rejection must not award Growth Marks');

const raceReservationDb = new D1();
const raceReservationTelegramId = 'race-reservation-player';
seedPlayer(raceReservationDb, raceReservationTelegramId, previousSeasonKey);
const raceReservationOldPetId = `pet-${raceReservationTelegramId}`;
const raceReservationCurrentPetId = 'pet-race-reservation-player-current';
seedAdditionalPet(raceReservationDb, raceReservationTelegramId, raceReservationCurrentPetId, 1, rolloverSeasonKey);
const raceReservationRunId = `daily:2026-07-01:${raceReservationTelegramId}`;
const originalRaceReservationBatch = raceReservationDb.batch.bind(raceReservationDb);
let injectedRaceReservation = false;
raceReservationDb.batch = async (statements) => {
  if (!injectedRaceReservation && statements.some((statement) => /INSERT OR IGNORE INTO telegram_pet_daily_runs/.test(statement.sql))) {
    injectedRaceReservation = true;
    raceReservationDb.database.prepare(`UPDATE telegram_pet_runs SET pet_id=?, season_key=? WHERE telegram_id=? AND run_id=?`)
      .run(raceReservationCurrentPetId, rolloverSeasonKey, raceReservationTelegramId, raceReservationRunId);
    raceReservationDb.database.prepare(`INSERT INTO telegram_pet_daily_runs
      (telegram_id, pet_id, utc_day, seed, run_id, status, score, depth, boss_defeated)
      VALUES (?, ?, '2026-07-01', '2026-07-01-12345', ?, 'active', 0, 0, 0)`)
      .run(raceReservationTelegramId, raceReservationCurrentPetId, raceReservationRunId);
  }
  return originalRaceReservationBatch(statements);
};
const refusedRaceReservation = await createDailyMoonRun(raceReservationDb, { telegram_id: raceReservationTelegramId, now: rolloverNow });
assert.equal(refusedRaceReservation.accepted, false,
  'losing a Daily Run reservation race must not return the persisted stale authority as valid');
assert.equal(refusedRaceReservation.reason, 'daily_run_pet_authority_mismatch');
assert.equal(raceReservationDb.database.prepare(`SELECT pet_id FROM telegram_pet_daily_runs
  WHERE telegram_id=? AND utc_day='2026-07-01'`).get(raceReservationTelegramId).pet_id, raceReservationCurrentPetId,
  'race regression fixture must leave the wrong pet reservation persisted for validation');
assert.equal(raceReservationDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_analytics
  WHERE telegram_id=? AND utc_day='2026-07-01'`).get(raceReservationTelegramId).count, 0,
  'losing a Daily Run reservation race must not record Daily Run analytics for stale authority');
assert.equal(raceReservationDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND utc_day='2026-07-01'`).get(raceReservationTelegramId).count, 0,
  'losing a Daily Run reservation race must not record Daily Journey objectives');
assert.equal(raceReservationDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE telegram_id=?`).get(raceReservationTelegramId).count, 0,
  'losing a Daily Run reservation race must not award Growth Marks');

const db = new D1();
seedPlayer(db, 'daily-player');
const now = new Date('2026-08-11T00:00:00.000Z');
const [createdA, createdB] = await Promise.all([
  createDailyMoonRun(db, { telegram_id: 'daily-player', now }),
  createDailyMoonRun(db, { telegram_id: 'daily-player', now }),
]);
assert.equal(createdA.accepted, true);
assert.equal(createdB.accepted, true);
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_daily_runs WHERE telegram_id='daily-player'").get().count, 1,
  'duplicate daily run creation must reserve one official run');
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_runs WHERE telegram_id='daily-player'").get().count, 1,
  'daily creation must reuse the existing run engine exactly once');
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_modifiers WHERE telegram_id='daily-player'").get().count, 2,
  'one condition plus the pinned rules version must use the existing run modifier table');
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_rooms WHERE telegram_id='daily-player'").get().count, 1,
  'daily creation must materialize its first room through the roguelite room engine');
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_events WHERE telegram_id='daily-player' AND event_key='daily:memory:first-run:daily-player'").get().count, 1,
  'First Daily Moon Run memory must be bounded and duplicate safe');

const freshExtractionDb = new D1();
seedPlayer(freshExtractionDb, 'fresh-extraction-player');
const freshExtractionRun = await createDailyMoonRun(freshExtractionDb, { telegram_id: 'fresh-extraction-player', now });
assert.equal(freshExtractionRun.daily_run.pet_id, 'pet-fresh-extraction-player', 'Daily Moon Run creation must capture pet_id');
freshExtractionDb.database.prepare(`INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number, acquisition_type)
  VALUES ('pet-fresh-extraction-player-second', 'fresh-extraction-player', 'pet-s2026-003', 2, 'free')`).run();
freshExtractionDb.database.prepare(`INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number, source_profile_updated_at)
  VALUES ('pet-fresh-extraction-player-second', 'fresh-extraction-player', 'pet-s2026-003', 2, CURRENT_TIMESTAMP)`).run();
freshExtractionDb.database.prepare("UPDATE telegram_pet_active_slots SET pet_id='pet-fresh-extraction-player-second' WHERE telegram_id='fresh-extraction-player'").run();
freshExtractionDb.database.prepare("UPDATE telegram_pet_profiles SET pet_xp=0, level=1, health=1, energy=1, happiness=1, cleanliness=1 WHERE telegram_id='fresh-extraction-player'").run();
freshExtractionDb.database.prepare("UPDATE telegram_pet_instances SET pet_xp=900, level=10, health=99, energy=98, happiness=97, cleanliness=96 WHERE pet_id='pet-fresh-extraction-player'").run();
freshExtractionDb.database.prepare("UPDATE telegram_pet_instances SET pet_xp=0, level=1, health=2, energy=2, happiness=2, cleanliness=2 WHERE pet_id='pet-fresh-extraction-player-second'").run();
const storedPetOutcome = await __dailyMoonRunTestHooks.resolveAuthoritativeDailyRoomOutcome(freshExtractionDb,
  { ...freshExtractionRun.daily_run, telegram_id: 'fresh-extraction-player', seed: 7 },
  { room: 1, content_id: 'authority-room', room_type: 'choice_event' }, 'safe');
assert.deepEqual(storedPetOutcome.player_state, { level: 5, health: 99, energy: 98, happiness: 97, cleanliness: 96 },
  'Daily outcome authority must use the stored run pet rather than stale profile or active-pet state');

const freshExtraction = await extractDailyMoonRun(freshExtractionDb, {
  telegram_id: 'fresh-extraction-player', run_id: freshExtractionRun.daily_run.run_id, now,
});
assert.equal(freshExtraction.accepted, false, 'a fresh Daily Moon Run cannot extract before resolving a room');
assert.equal(freshExtraction.reason, 'daily_run_empty');
assert.equal(freshExtractionDb.database.prepare("SELECT status FROM telegram_pet_runs WHERE telegram_id='fresh-extraction-player'").get().status, 'active',
  'rejected zero-room extraction must leave the authoritative run active');
assert.equal(freshExtractionDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_daily_analytics WHERE telegram_id='fresh-extraction-player' AND event_type='run_terminal'").get().count, 0,
  'rejected zero-room extraction must not create terminal daily evidence');
freshExtractionDb.database.prepare("UPDATE telegram_pet_runs SET depth=1, current_room=1 WHERE telegram_id='fresh-extraction-player'").run();
const switchedExtraction = await extractDailyMoonRun(freshExtractionDb, {
  telegram_id: 'fresh-extraction-player', run_id: freshExtractionRun.daily_run.run_id, now,
});
assert.equal(switchedExtraction.accepted, true);
assert.equal(freshExtractionDb.database.prepare("SELECT pet_id FROM telegram_pet_reward_claims WHERE source='roguelite_completion'").get().pet_id,
  'pet-fresh-extraction-player', 'Daily extraction after switching pets must settle to the stored daily-run pet');


const legacyDailyDb = new D1();
seedPlayer(legacyDailyDb, 'legacy-daily-player');
legacyDailyDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, telegram_id, run_id, season_key, status) VALUES ('legacy-daily-row', 'legacy-daily-player',
  'daily:2026-08-11:legacy-daily-player', 'pet-s2026-003', 'active')`).run();
const refusedLegacyDaily = await createDailyMoonRun(legacyDailyDb, { telegram_id: 'legacy-daily-player', now });
assert.equal(refusedLegacyDaily.accepted, false);
assert.equal(refusedLegacyDaily.reason, 'run_pet_authority_required', 'legacy Daily Moon Run backing rows must fail closed instead of throwing');
assert.equal(legacyDailyDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_daily_runs WHERE telegram_id='legacy-daily-player'").get().count, 0);

let forcedVictoryRegression = null;
for (let day = 1; day <= 40 && !forcedVictoryRegression; day += 1) {
  const forcedDb = new D1();
  const telegramId = `forced-outcome-${day}`;
  seedPlayer(forcedDb, telegramId);
  forcedDb.database.prepare(`UPDATE telegram_pet_profiles SET health=0, energy=0, happiness=0, cleanliness=0 WHERE telegram_id=?`).run(telegramId);
  const forcedNow = new Date(Date.UTC(2026, 8, day, 12));
  const forcedRun = await createDailyMoonRun(forcedDb, { telegram_id: telegramId, now: forcedNow });
  const pending = forcedDb.database.prepare(`SELECT generated_data FROM telegram_pet_run_rooms
    WHERE telegram_id=? AND run_id=? AND room_number=1`).get(telegramId, forcedRun.daily_run.run_id);
  const room = JSON.parse(pending.generated_data);
  const result = await processDailyMoonRunStep(forcedDb, {
    telegram_id: telegramId,
    run_id: forcedRun.daily_run.run_id,
    choice_key: room.choices[0].choice_id,
    expected_step_index: 0,
    success: true,
    now: forcedNow,
  });
  if (result.reason === 'daily_room_failed') forcedVictoryRegression = { db: forcedDb, telegramId, result };
}
assert.ok(forcedVictoryRegression, 'the deterministic authority fixture must include a server-resolved failure');
assert.equal(forcedVictoryRegression.result.room.outcome.success, false,
  'client success=true cannot force a Daily Moon Run victory');
assert.equal(forcedVictoryRegression.result.room.outcome.authority, 'daily_moon_run_server_outcome_v2');
assert.equal(forcedVictoryRegression.db.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_run_analytics
  WHERE telegram_id=? AND event_type='boss_fought'`).get(forcedVictoryRegression.telegramId).count, 0,
  'a client-forced outcome cannot create boss authority');

const staleLevelDailyDb = new D1();
const staleLevelDailyTelegramId = 'daily-stale-level-player';
seedPlayer(staleLevelDailyDb, staleLevelDailyTelegramId);
staleLevelDailyDb.database.prepare(`UPDATE telegram_pet_instances
  SET pet_xp=5000, level=51, health=100, energy=100, happiness=100, cleanliness=100
  WHERE pet_id=?`).run(`pet-${staleLevelDailyTelegramId}`);
const staleLevelDailyNow = new Date(Date.UTC(2026, 7, 19, 12));
const staleLevelDailyRun = await createDailyMoonRun(staleLevelDailyDb, { telegram_id: staleLevelDailyTelegramId, now: staleLevelDailyNow });
const staleLevelPendingRoom = staleLevelDailyDb.database.prepare(`SELECT generated_data FROM telegram_pet_run_rooms
  WHERE telegram_id=? AND run_id=? AND room_number=1`).get(staleLevelDailyTelegramId, staleLevelDailyRun.daily_run.run_id);
const staleLevelRoom = JSON.parse(staleLevelPendingRoom.generated_data);
const staleLevelDailyResult = await processDailyMoonRunStep(staleLevelDailyDb, {
  telegram_id: staleLevelDailyTelegramId,
  run_id: staleLevelDailyRun.daily_run.run_id,
  choice_key: staleLevelRoom.choices[0].choice_id,
  expected_step_index: 0,
  now: staleLevelDailyNow,
});
assert.equal(staleLevelDailyResult.room.outcome.player_state.level, 12,
  'Daily Moon Run outcome authority must derive level from pet_xp instead of stale stored level');
assert.notEqual(staleLevelDailyResult.room.outcome.player_state.level, 51,
  'Daily Moon Run success chance inputs cannot retain old persisted levels');

insertCareEvent(db, 'daily-player', 'care-one', '2026-08-11');
const [careA, careB] = await Promise.all([
  recordDailyCareChallenge(db, { telegram_id: 'daily-player', event_key: 'care-one', now }),
  recordDailyCareChallenge(db, { telegram_id: 'daily-player', event_key: 'care-one', now }),
]);
assert.equal(Number(careA.accepted) + Number(careB.accepted), 1, 'concurrent duplicate challenge evidence must apply once');
assert.equal(db.database.prepare("SELECT progress FROM telegram_pet_daily_challenge_progress WHERE telegram_id='daily-player' AND challenge_id='daily_care'").get().progress, 1);
for (const [index, action] of ['play', 'clean'].entries()) {
  const key = `care-${index + 2}`;
  insertCareEvent(db, 'daily-player', key, '2026-08-11', action);
  await recordDailyCareChallenge(db, { telegram_id: 'daily-player', event_key: key, now });
}
await recordDailyCareChallenge(db, { telegram_id: 'daily-player', event_key: 'care-one', now });
assert.equal(db.database.prepare("SELECT progress FROM telegram_pet_daily_challenge_progress WHERE telegram_id='daily-player' AND challenge_id='daily_care'").get().progress, 3,
  'duplicate challenge claim cannot add progress after completion');
assert.equal(db.database.prepare("SELECT completed_daily_challenges FROM telegram_pet_seasonal_challenge_state WHERE telegram_id='daily-player'").get().completed_daily_challenges, 1,
  'challenge completion must be counted atomically once');

const careRecoveryDb = new D1();
const careRecoveryTelegramId = 'care-objective-recovery';
const careRecoveryNow = new Date();
const careRecoveryDay = careRecoveryNow.toISOString().slice(0, 10);
seedPlayer(careRecoveryDb, careRecoveryTelegramId, getDailySeasonId(careRecoveryDay));
await __petMediaTestHooks.ensureActivePetInstance(careRecoveryDb, careRecoveryTelegramId);
const careRecoveryPetId = `pet-${careRecoveryTelegramId}`;
const careRecoveryRun = await createDailyMoonRun(careRecoveryDb, { telegram_id: careRecoveryTelegramId, now: careRecoveryNow });
insertCareEvent(careRecoveryDb, careRecoveryTelegramId, 'callback:feed:recover-objective', careRecoveryDay, 'feed', careRecoveryPetId);
careRecoveryDb.database.prepare(`DELETE FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND utc_day=? AND challenge_id='daily_care'`).run(careRecoveryTelegramId, careRecoveryDay);
const recoveredCare = await __petMediaTestHooks.processPetAction(careRecoveryDb, careRecoveryTelegramId, 'feed', {
  event_key: 'callback:feed:recover-objective',
  source: 'telegram_callback',
});
assert.equal(recoveredCare.duplicate, true, 'accepted care action replay must remain an idempotent duplicate');
assert.equal(careRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_key='callback:feed:recover-objective' AND status='accepted'`).get(careRecoveryTelegramId).count, 1,
  'care objective recovery must not duplicate the accepted care event');
assert.equal(careRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND utc_day=? AND challenge_id='daily_care' AND event_key='care:callback:feed:recover-objective'`)
  .get(careRecoveryTelegramId, careRecoveryPetId, careRecoveryDay).count, 1,
  'accepted care action replay must restore the missing Daily Journey objective');
for (const [index, action] of ['play', 'clean'].entries()) {
  const key = `callback:${action}:recover-objective`;
  insertCareEvent(careRecoveryDb, careRecoveryTelegramId, key, careRecoveryDay, action, careRecoveryPetId);
  await recordDailyCareChallenge(careRecoveryDb, { telegram_id: careRecoveryTelegramId, event_key: key, now: careRecoveryNow });
}
resolveDailyRun(careRecoveryDb, careRecoveryTelegramId, careRecoveryRun.daily_run.run_id);
const careRecoverySync = await syncDailyMoonRun(careRecoveryDb, {
  telegram_id: careRecoveryTelegramId,
  utc_day: careRecoveryDay,
  now: careRecoveryNow,
});
assert.equal(careRecoverySync.challenge_results.some((result) => result.daily_journey?.accepted), true,
  'restored care objective must allow Daily Journey Growth Mark qualification to continue normally');
assert.equal(careRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id=? AND earned_day=?`).get(careRecoveryPetId, careRecoveryDay).count, 1,
  'care objective recovery must not create duplicate Growth Marks');

const postBatchCareRecoveryDb = new D1();
const postBatchCareRecoveryTelegramId = 'care-post-batch-recovery';
const postBatchCareEventNow = new Date('2026-08-11T23:59:50.000Z');
const postBatchCareRetryNow = new Date('2026-08-12T00:01:00.000Z');
const postBatchCareEventDay = postBatchCareEventNow.toISOString().slice(0, 10);
const postBatchCareRetryDay = postBatchCareRetryNow.toISOString().slice(0, 10);
seedPlayer(postBatchCareRecoveryDb, postBatchCareRecoveryTelegramId, getDailySeasonId(postBatchCareEventDay));
await __petMediaTestHooks.ensureActivePetInstance(postBatchCareRecoveryDb, postBatchCareRecoveryTelegramId);
const postBatchCareRecoveryPetId = `pet-${postBatchCareRecoveryTelegramId}`;
const postBatchCareRecoveryRun = await createDailyMoonRun(postBatchCareRecoveryDb, {
  telegram_id: postBatchCareRecoveryTelegramId,
  now: postBatchCareEventNow,
});
await recordFullJourneyObjective(postBatchCareRecoveryDb, {
  telegramId: postBatchCareRecoveryTelegramId,
  petId: postBatchCareRecoveryPetId,
  day: postBatchCareEventDay,
  challengeId: 'daily_combat',
  eventKey: 'post-batch-rollover:combat',
});
await recordFullJourneyObjective(postBatchCareRecoveryDb, {
  telegramId: postBatchCareRecoveryTelegramId,
  petId: postBatchCareRecoveryPetId,
  day: postBatchCareEventDay,
  challengeId: 'daily_explorer',
  eventKey: 'post-batch-rollover:explorer',
});
for (const action of ['play', 'clean']) {
  const key = `callback:${action}:post-batch-recovery`;
  insertCareEvent(postBatchCareRecoveryDb, postBatchCareRecoveryTelegramId, key, postBatchCareEventDay, action, postBatchCareRecoveryPetId);
  await recordDailyCareChallenge(postBatchCareRecoveryDb, { telegram_id: postBatchCareRecoveryTelegramId, event_key: key, utc_day: postBatchCareEventDay, now: postBatchCareEventNow });
}
const originalPostBatch = postBatchCareRecoveryDb.batch.bind(postBatchCareRecoveryDb);
let injectedPostBatchDuplicate = false;
postBatchCareRecoveryDb.batch = async (statements) => {
  if (!injectedPostBatchDuplicate && statements.some((statement) => /INSERT OR IGNORE INTO telegram_pet_events/.test(statement.sql))) {
    injectedPostBatchDuplicate = true;
    insertCareEvent(postBatchCareRecoveryDb, postBatchCareRecoveryTelegramId, 'callback:feed:post-batch-recovery', postBatchCareEventDay, 'feed', postBatchCareRecoveryPetId);
  }
  return originalPostBatch(statements);
};
const recoveredPostBatchCare = await __petMediaTestHooks.processPetAction(postBatchCareRecoveryDb, postBatchCareRecoveryTelegramId, 'feed', {
  event_key: 'callback:feed:post-batch-recovery',
  source: 'telegram_callback',
  now: postBatchCareRetryNow,
});
assert.equal(recoveredPostBatchCare.duplicate, true,
  'post-batch accepted care duplicate must return idempotent duplicate success');
assert.equal(postBatchCareRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_key='callback:feed:post-batch-recovery' AND status='accepted'`).get(postBatchCareRecoveryTelegramId).count, 1,
  'post-batch accepted care duplicate recovery must not duplicate the care event');
assert.equal(postBatchCareRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND utc_day=? AND challenge_id='daily_care' AND event_key='care:callback:feed:post-batch-recovery'`)
  .get(postBatchCareRecoveryTelegramId, postBatchCareRecoveryPetId, postBatchCareEventDay).count, 1,
  'post-batch accepted care duplicate must recover missing Daily Journey objective evidence on the original event UTC day');
assert.equal(postBatchCareRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND utc_day=? AND challenge_id='daily_care'`).get(postBatchCareRecoveryTelegramId, postBatchCareRetryDay).count, 0,
  'post-batch accepted care duplicate retry must not create objective evidence on the retry UTC day');
resolveDailyRun(postBatchCareRecoveryDb, postBatchCareRecoveryTelegramId, postBatchCareRecoveryRun.daily_run.run_id);
const postBatchCareRecoverySync = await syncDailyMoonRun(postBatchCareRecoveryDb, {
  telegram_id: postBatchCareRecoveryTelegramId,
  utc_day: postBatchCareEventDay,
  now: postBatchCareRetryNow,
});
assert.equal(postBatchCareRecoverySync.accepted, true,
  'post-batch recovered care evidence remains compatible with later Daily Moon Run sync');
assert.equal(postBatchCareRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_receipts
  WHERE telegram_id=? AND pet_id=? AND utc_day=? AND status='accepted'`)
  .get(postBatchCareRecoveryTelegramId, postBatchCareRecoveryPetId, postBatchCareEventDay).count, 1,
  'post-batch recovered care evidence must settle one accepted Daily Journey receipt');
assert.equal(postBatchCareRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id=? AND earned_day=?`).get(postBatchCareRecoveryPetId, postBatchCareEventDay).count, 1,
  'post-batch care recovery must award exactly one Growth Mark');
assert.equal(postBatchCareRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id=? AND earned_day=?`).get(postBatchCareRecoveryPetId, postBatchCareRetryDay).count, 0,
  'post-batch care recovery must not award a Growth Mark on the retry UTC day');
const repeatedPostBatchCare = await __petMediaTestHooks.processPetAction(postBatchCareRecoveryDb, postBatchCareRecoveryTelegramId, 'feed', {
  event_key: 'callback:feed:post-batch-recovery',
  source: 'telegram_callback',
  now: postBatchCareRetryNow,
});
assert.equal(repeatedPostBatchCare.duplicate, true,
  'additional post-batch care retries must remain idempotent duplicate successes');
assert.equal(postBatchCareRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND utc_day=? AND challenge_id='daily_care' AND event_key='care:callback:feed:post-batch-recovery'`)
  .get(postBatchCareRecoveryTelegramId, postBatchCareRecoveryPetId, postBatchCareEventDay).count, 1,
  'additional post-batch care retries must not duplicate Daily Journey objective evidence');
assert.equal(postBatchCareRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND utc_day=? AND challenge_id='daily_care'`).get(postBatchCareRecoveryTelegramId, postBatchCareRetryDay).count, 0,
  'additional post-batch care retries must still leave the retry UTC day empty');
assert.equal(postBatchCareRecoveryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id=? AND earned_day=?`).get(postBatchCareRecoveryPetId, postBatchCareEventDay).count, 1,
  'additional post-batch care retries must not duplicate Growth Marks');

const tripleRetryDb = new D1();
const tripleRetryTelegramId = 'care-triple-retry';
const tripleRetryDay = '2026-08-13';
const tripleRetryNow = new Date(`${tripleRetryDay}T10:00:00.000Z`);
seedPlayer(tripleRetryDb, tripleRetryTelegramId, getDailySeasonId(tripleRetryDay));
await __petMediaTestHooks.ensureActivePetInstance(tripleRetryDb, tripleRetryTelegramId);
const tripleRetryPetId = `pet-${tripleRetryTelegramId}`;
for (const action of ['play', 'clean']) {
  const key = `callback:${action}:triple-retry`;
  insertCareEvent(tripleRetryDb, tripleRetryTelegramId, key, tripleRetryDay, action, tripleRetryPetId);
  await recordDailyCareChallenge(tripleRetryDb, { telegram_id: tripleRetryTelegramId, event_key: key, utc_day: tripleRetryDay, now: tripleRetryNow });
}
insertCareEvent(tripleRetryDb, tripleRetryTelegramId, 'callback:feed:triple-retry', tripleRetryDay, 'feed', tripleRetryPetId);
const recoveredTripleRetryCare = await __petMediaTestHooks.processPetAction(tripleRetryDb, tripleRetryTelegramId, 'feed', {
  event_key: 'callback:feed:triple-retry',
  source: 'telegram_callback',
  now: tripleRetryNow,
});
assert.equal(recoveredTripleRetryCare.duplicate, true,
  'triple retry: second attempt must recover from the persisted accepted care event');
const repeatedTripleRetryCare = await __petMediaTestHooks.processPetAction(tripleRetryDb, tripleRetryTelegramId, 'feed', {
  event_key: 'callback:feed:triple-retry',
  source: 'telegram_callback',
  now: tripleRetryNow,
});
assert.equal(repeatedTripleRetryCare.duplicate, true,
  'triple retry: third attempt remains an idempotent duplicate success');
assert.equal(tripleRetryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND utc_day=? AND challenge_id='daily_care' AND event_key='care:callback:feed:triple-retry'`)
  .get(tripleRetryTelegramId, tripleRetryPetId, tripleRetryDay).count, 1,
  'triple retry: recovered care objective evidence is stored once only');
assert.equal(tripleRetryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_receipts
  WHERE telegram_id=? AND pet_id=? AND utc_day=?`).get(tripleRetryTelegramId, tripleRetryPetId, tripleRetryDay).count, 0,
  'triple retry: care retries before qualification do not create receipts');
assert.equal(tripleRetryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE telegram_id=? AND pet_id=? AND earned_day=?`).get(tripleRetryTelegramId, tripleRetryPetId, tripleRetryDay).count, 0,
  'triple retry: care retries before qualification do not create Growth Marks');
await recordFullJourneyObjective(tripleRetryDb, {
  telegramId: tripleRetryTelegramId,
  petId: tripleRetryPetId,
  day: tripleRetryDay,
  challengeId: 'daily_combat',
  eventKey: 'triple-retry:combat',
});
await recordFullJourneyObjective(tripleRetryDb, {
  telegramId: tripleRetryTelegramId,
  petId: tripleRetryPetId,
  day: tripleRetryDay,
  challengeId: 'daily_explorer',
  eventKey: 'triple-retry:explorer',
});
assert.equal(tripleRetryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_receipts
  WHERE telegram_id=? AND pet_id=? AND utc_day=?`).get(tripleRetryTelegramId, tripleRetryPetId, tripleRetryDay).count, 1,
  'triple retry: final qualification writes one receipt only');
assert.equal(tripleRetryDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE telegram_id=? AND pet_id=? AND earned_day=?`).get(tripleRetryTelegramId, tripleRetryPetId, tripleRetryDay).count, 1,
  'triple retry: final qualification awards one Growth Mark only');

const concurrentCareDb = new D1();
const concurrentCareTelegramId = 'care-concurrent-duplicate';
const concurrentCareDay = '2026-08-14';
const concurrentCareNow = new Date(`${concurrentCareDay}T10:00:00.000Z`);
seedPlayer(concurrentCareDb, concurrentCareTelegramId, getDailySeasonId(concurrentCareDay));
await __petMediaTestHooks.ensureActivePetInstance(concurrentCareDb, concurrentCareTelegramId);
const concurrentCarePetId = `pet-${concurrentCareTelegramId}`;
await recordFullJourneyObjective(concurrentCareDb, {
  telegramId: concurrentCareTelegramId,
  petId: concurrentCarePetId,
  day: concurrentCareDay,
  challengeId: 'daily_combat',
  eventKey: 'concurrent-care:combat',
});
await recordFullJourneyObjective(concurrentCareDb, {
  telegramId: concurrentCareTelegramId,
  petId: concurrentCarePetId,
  day: concurrentCareDay,
  challengeId: 'daily_explorer',
  eventKey: 'concurrent-care:explorer',
});
for (const action of ['play', 'clean']) {
  const key = `callback:${action}:concurrent-care`;
  insertCareEvent(concurrentCareDb, concurrentCareTelegramId, key, concurrentCareDay, action, concurrentCarePetId);
  await recordDailyCareChallenge(concurrentCareDb, { telegram_id: concurrentCareTelegramId, event_key: key, utc_day: concurrentCareDay, now: concurrentCareNow });
}
await Promise.all([
  __petMediaTestHooks.processPetAction(concurrentCareDb, concurrentCareTelegramId, 'feed', {
    event_key: 'callback:feed:concurrent-care',
    source: 'telegram_callback',
    now: concurrentCareNow,
  }),
  __petMediaTestHooks.processPetAction(concurrentCareDb, concurrentCareTelegramId, 'feed', {
    event_key: 'callback:feed:concurrent-care',
    source: 'telegram_callback',
    now: concurrentCareNow,
  }),
]);
assert.equal(concurrentCareDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_key='callback:feed:concurrent-care' AND status='accepted'`).get(concurrentCareTelegramId).count, 1,
  'concurrent duplicate care requests must persist one accepted event');
assert.equal(concurrentCareDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND utc_day=? AND challenge_id='daily_care' AND event_key='care:callback:feed:concurrent-care'`)
  .get(concurrentCareTelegramId, concurrentCarePetId, concurrentCareDay).count, 1,
  'concurrent duplicate care requests must persist one Daily Journey evidence record');
assert.equal(concurrentCareDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE telegram_id=? AND pet_id=? AND earned_day=?`).get(concurrentCareTelegramId, concurrentCarePetId, concurrentCareDay).count, 1,
  'concurrent duplicate care requests must award one Growth Mark only');

const careDayRolloverDb = new D1();
const careDayRolloverTelegramId = 'care-day-rollover-recovery';
const careEventNow = new Date('2026-08-11T23:59:50.000Z');
const careRetryNow = new Date('2026-08-12T00:01:00.000Z');
const careEventDay = careEventNow.toISOString().slice(0, 10);
const careRetryDay = careRetryNow.toISOString().slice(0, 10);
seedPlayer(careDayRolloverDb, careDayRolloverTelegramId, getDailySeasonId(careEventDay));
await __petMediaTestHooks.ensureActivePetInstance(careDayRolloverDb, careDayRolloverTelegramId);
const careDayRolloverPetId = `pet-${careDayRolloverTelegramId}`;
insertCareEvent(careDayRolloverDb, careDayRolloverTelegramId, 'callback:feed:day-rollover', careEventDay, 'feed', careDayRolloverPetId);
const recoveredAfterUtcRollover = await __petMediaTestHooks.processPetAction(careDayRolloverDb, careDayRolloverTelegramId, 'feed', {
  event_key: 'callback:feed:day-rollover',
  source: 'telegram_callback',
  now: careRetryNow,
});
assert.equal(recoveredAfterUtcRollover.duplicate, true,
  'accepted care replay after UTC rollover must remain an idempotent duplicate');
assert.equal(careDayRolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_events
  WHERE telegram_id=? AND event_key='callback:feed:day-rollover' AND status='accepted'`).get(careDayRolloverTelegramId).count, 1,
  'care replay after UTC rollover must not duplicate the accepted care event');
assert.equal(careDayRolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND utc_day=? AND challenge_id='daily_care' AND event_key='care:callback:feed:day-rollover'`)
  .get(careDayRolloverTelegramId, careDayRolloverPetId, careEventDay).count, 1,
  'care replay after UTC rollover must restore the objective on the original event UTC day');
assert.equal(careDayRolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND utc_day=? AND challenge_id='daily_care'`).get(careDayRolloverTelegramId, careRetryDay).count, 0,
  'care replay after UTC rollover must not create a Daily Journey objective on the retry UTC day');

const perPetIsolationDb = new D1();
const perPetIsolationTelegramId = 'care-per-pet-isolation';
const perPetIsolationDay = '2026-08-15';
const perPetIsolationNow = new Date(`${perPetIsolationDay}T10:00:00.000Z`);
seedPlayer(perPetIsolationDb, perPetIsolationTelegramId, getDailySeasonId(perPetIsolationDay));
seedAdditionalPet(perPetIsolationDb, perPetIsolationTelegramId, 'pet-care-per-pet-isolation-b', 2, getDailySeasonId(perPetIsolationDay));
await __petMediaTestHooks.ensureActivePetInstance(perPetIsolationDb, perPetIsolationTelegramId);
const perPetIsolationPetA = `pet-${perPetIsolationTelegramId}`;
const perPetIsolationPetB = 'pet-care-per-pet-isolation-b';
await recordFullJourneyObjective(perPetIsolationDb, {
  telegramId: perPetIsolationTelegramId,
  petId: perPetIsolationPetA,
  day: perPetIsolationDay,
  challengeId: 'daily_combat',
  eventKey: 'per-pet-isolation:combat',
});
await recordFullJourneyObjective(perPetIsolationDb, {
  telegramId: perPetIsolationTelegramId,
  petId: perPetIsolationPetA,
  day: perPetIsolationDay,
  challengeId: 'daily_explorer',
  eventKey: 'per-pet-isolation:explorer',
});
for (const action of ['play', 'clean']) {
  const key = `callback:${action}:per-pet-isolation`;
  insertCareEvent(perPetIsolationDb, perPetIsolationTelegramId, key, perPetIsolationDay, action, perPetIsolationPetA);
  await recordDailyCareChallenge(perPetIsolationDb, { telegram_id: perPetIsolationTelegramId, event_key: key, utc_day: perPetIsolationDay, now: perPetIsolationNow });
}
insertCareEvent(perPetIsolationDb, perPetIsolationTelegramId, 'callback:feed:per-pet-isolation', perPetIsolationDay, 'feed', perPetIsolationPetA);
perPetIsolationDb.database.prepare(`UPDATE telegram_pet_active_slots SET pet_id=?, season_key=? WHERE telegram_id=?`)
  .run(perPetIsolationPetB, getDailySeasonId(perPetIsolationDay), perPetIsolationTelegramId);
const perPetIsolationRetry = await __petMediaTestHooks.processPetAction(perPetIsolationDb, perPetIsolationTelegramId, 'feed', {
  event_key: 'callback:feed:per-pet-isolation',
  source: 'telegram_callback',
  now: perPetIsolationNow,
});
assert.equal(perPetIsolationRetry.duplicate, true,
  'per-pet isolation: duplicate retry through Pet B must recover Pet A evidence');
assert.equal(perPetIsolationDb.database.prepare(`SELECT COUNT(DISTINCT challenge_id) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND utc_day=?`).get(perPetIsolationTelegramId, perPetIsolationPetA, perPetIsolationDay).count, 3,
  'per-pet isolation: Pet A owns the recovered Daily Journey progression');
assert.equal(perPetIsolationDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND utc_day=?`).get(perPetIsolationTelegramId, perPetIsolationPetB, perPetIsolationDay).count, 0,
  'per-pet isolation: Pet B duplicate/retry activity does not receive Pet A objectives');
assert.equal(perPetIsolationDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE telegram_id=? AND pet_id=? AND earned_day=?`).get(perPetIsolationTelegramId, perPetIsolationPetA, perPetIsolationDay).count, 1,
  'per-pet isolation: Pet A receives the Daily Journey Growth Mark');
assert.equal(perPetIsolationDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE telegram_id=? AND pet_id=?`).get(perPetIsolationTelegramId, perPetIsolationPetB).count, 0,
  'per-pet isolation: Pet B remains unchanged by Pet A duplicate recovery');

const seasonRolloverReplayDb = new D1();
const seasonRolloverReplayTelegramId = 'care-season-rollover-replay';
const oldSeasonDay = '2026-03-31';
const newSeasonDay = '2026-04-01';
const oldSeasonKey = getDailySeasonId(oldSeasonDay);
const newSeasonKey = getDailySeasonId(newSeasonDay);
seedPlayer(seasonRolloverReplayDb, seasonRolloverReplayTelegramId, oldSeasonKey);
const seasonRolloverOldPetId = `pet-${seasonRolloverReplayTelegramId}`;
const seasonRolloverNewPetId = 'pet-care-season-rollover-replay-new';
seedAdditionalPet(seasonRolloverReplayDb, seasonRolloverReplayTelegramId, seasonRolloverNewPetId, 2, newSeasonKey);
seasonRolloverReplayDb.database.prepare(`UPDATE telegram_pet_active_slots SET pet_id=?, season_key=? WHERE telegram_id=?`)
  .run(seasonRolloverNewPetId, newSeasonKey, seasonRolloverReplayTelegramId);
await recordFullJourneyObjective(seasonRolloverReplayDb, {
  telegramId: seasonRolloverReplayTelegramId,
  petId: seasonRolloverNewPetId,
  day: newSeasonDay,
  challengeId: 'daily_combat',
  eventKey: 'season-rollover-replay:new-season-combat',
});
await recordFullJourneyObjective(seasonRolloverReplayDb, {
  telegramId: seasonRolloverReplayTelegramId,
  petId: seasonRolloverNewPetId,
  day: newSeasonDay,
  challengeId: 'daily_explorer',
  eventKey: 'season-rollover-replay:new-season-explorer',
});
insertCareEvent(seasonRolloverReplayDb, seasonRolloverReplayTelegramId, 'callback:feed:season-rollover-replay', oldSeasonDay, 'feed', seasonRolloverOldPetId);
const seasonRolloverReplay = await __petMediaTestHooks.processPetAction(seasonRolloverReplayDb, seasonRolloverReplayTelegramId, 'feed', {
  event_key: 'callback:feed:season-rollover-replay',
  source: 'telegram_callback',
  now: new Date(`${newSeasonDay}T00:01:00.000Z`),
});
assert.equal(seasonRolloverReplay.duplicate, true,
  'season rollover replay: old accepted care event remains idempotent after the new season starts');
assert.equal(seasonRolloverReplayDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND season_key=? AND utc_day=? AND challenge_id='daily_care'`)
  .get(seasonRolloverReplayTelegramId, seasonRolloverNewPetId, newSeasonKey, newSeasonDay).count, 0,
  'season rollover replay: old event must not become new-season Daily Journey care evidence');
assert.equal(seasonRolloverReplayDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE telegram_id=? AND pet_id=? AND season_key=? AND earned_day=?`)
  .get(seasonRolloverReplayTelegramId, seasonRolloverNewPetId, newSeasonKey, newSeasonDay).count, 0,
  'season rollover replay: old event must not mint a cross-season Growth Mark');
assert.equal(seasonRolloverReplayDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives
  WHERE telegram_id=? AND pet_id=? AND season_key=? AND utc_day=? AND challenge_id='daily_care'`)
  .get(seasonRolloverReplayTelegramId, seasonRolloverOldPetId, oldSeasonKey, oldSeasonDay).count, 1,
  'season rollover replay: any recovery remains scoped to the original old-season event day');

const runId = db.database.prepare("SELECT run_id FROM telegram_pet_daily_runs WHERE telegram_id='daily-player'").get().run_id;
resolveDailyRun(db, 'daily-player', runId);
const [syncA, syncB] = await Promise.all([
  syncDailyMoonRun(db, { telegram_id: 'daily-player', utc_day: '2026-08-11', now }),
  syncDailyMoonRun(db, { telegram_id: 'daily-player', utc_day: '2026-08-11', now }),
]);
assert.equal(syncA.accepted && syncB.accepted, true, 'concurrent terminal synchronization must recover successfully');
const daily = db.database.prepare("SELECT * FROM telegram_pet_daily_runs WHERE telegram_id='daily-player'").get();
assert.deepEqual({ status: daily.status, score: daily.score, depth: daily.depth, boss_defeated: daily.boss_defeated },
  { status: 'completed', score: 900, depth: 10, boss_defeated: 1 });
const records = db.database.prepare("SELECT * FROM telegram_pet_daily_leaderboard_records WHERE telegram_id='daily-player'").get();
assert.equal(records.runs_recorded, 1, 'concurrent daily completion must update records once');
assert.equal(records.boss_completions, 1);
assert.equal(records.highest_score, 900);
assert.equal(records.deepest_run, 10);
assert.equal(records.streak_length, 1);
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_daily_analytics WHERE telegram_id='daily-player' AND event_type='run_terminal'").get().count, 1);
for (const challengeId of ['daily_combat', 'daily_explorer', 'daily_boss']) {
  const progress = db.database.prepare('SELECT progress, completed_at FROM telegram_pet_daily_challenge_progress WHERE telegram_id=? AND challenge_id=?').get('daily-player', challengeId);
  assert.ok(progress?.completed_at, `${challengeId} must reconcile from authoritative run evidence`);
}
await syncDailyMoonRun(db, { telegram_id: 'daily-player', utc_day: '2026-08-11', now });
assert.equal(db.database.prepare("SELECT runs_recorded FROM telegram_pet_daily_leaderboard_records WHERE telegram_id='daily-player'").get().runs_recorded, 1,
  'repeated terminal callbacks cannot corrupt leaderboard aggregates');
assert.ok(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_events WHERE telegram_id='daily-player' AND event_kind='memory'").get().count <= 6,
  'daily record memories must remain bounded under retries');

const dailyIdentityDb = new D1();
const dailyIdentityTelegramId = 'daily-identity-switch';
const dailyIdentityNow = new Date('2026-08-12T09:00:00.000Z');
seedPlayer(dailyIdentityDb, dailyIdentityTelegramId);
const dailyIdentityPetA = `pet-${dailyIdentityTelegramId}`;
const dailyIdentityPetB = 'pet-daily-identity-switch-b';
seedAdditionalPet(dailyIdentityDb, dailyIdentityTelegramId, dailyIdentityPetB, 2, getDailySeasonId('2026-08-12'));
const dailyIdentityRun = await createDailyMoonRun(dailyIdentityDb, { telegram_id: dailyIdentityTelegramId, now: dailyIdentityNow });
dailyIdentityDb.database.prepare(`UPDATE telegram_pet_active_slots SET pet_id=?, season_key=? WHERE telegram_id=?`)
  .run(dailyIdentityPetB, getDailySeasonId('2026-08-12'), dailyIdentityTelegramId);
resolveDailyRun(dailyIdentityDb, dailyIdentityTelegramId, dailyIdentityRun.daily_run.run_id, { status: 'completed', score: 1200, boss: true });
const dailyIdentitySync = await syncDailyMoonRun(dailyIdentityDb, {
  telegram_id: dailyIdentityTelegramId,
  utc_day: '2026-08-12',
  now: dailyIdentityNow,
});
assert.equal(dailyIdentitySync.reason, 'daily_run_synchronized', 'daily identity switch fixture reaches terminal sync');
assert.equal(dailyIdentityDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_identity_events WHERE pet_id=? AND event_kind='memory'`).get(dailyIdentityPetA).count > 0, true,
  'Daily Moon Run terminal memories stay on the stored daily run pet after active switch');
assert.equal(dailyIdentityDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_memories WHERE pet_id=?`).get(dailyIdentityPetB).count, 0,
  'Daily Moon Run active-pet switch cannot create Pet B memories from Pet A daily run');
assert.equal(dailyIdentityDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_identity_events WHERE pet_id=?`).get(dailyIdentityPetB).count, 0,
  'Daily Moon Run active-pet switch cannot create Pet B identity events from Pet A daily run');

const engineDb = new D1();
for (const telegramId of ['engine-player-a', 'engine-player-b']) seedPlayer(engineDb, telegramId);
const engineDay = new Date('2026-09-01T08:00:00.000Z');
const engineRuns = [];
for (const telegramId of ['engine-player-a', 'engine-player-b']) {
  const created = await createDailyMoonRun(engineDb, { telegram_id: telegramId, now: engineDay });
  const fingerprints = [];
  for (let roomIndex = 0; roomIndex < 10; roomIndex += 1) {
    const pending = engineDb.database.prepare(`SELECT generated_data FROM telegram_pet_run_rooms
      WHERE telegram_id=? AND run_id=? AND room_number=?`).get(telegramId, created.daily_run.run_id, roomIndex + 1);
    assert.ok(pending, `daily room ${roomIndex + 1} must be persisted by createPetRunRoom`);
    const room = JSON.parse(pending.generated_data);
    fingerprints.push(`${room.content_id}:${room.enemy_id || room.boss_id || ''}`);
    const storedRun = engineDb.database.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(created.daily_run.run_id);
    const fixtureOutcomes = await Promise.all(room.choices.map((choice) => __dailyMoonRunTestHooks.resolveAuthoritativeDailyRoomOutcome(engineDb, storedRun, room, choice.choice_id)));
    const winningChoice = room.choices.find((choice, index) => fixtureOutcomes[index].success);
    assert.ok(winningChoice, `completion fixture needs a server-valid winning choice in room ${roomIndex + 1}`);
    const result = await processDailyMoonRunStep(engineDb, {
      telegram_id: telegramId,
      run_id: created.daily_run.run_id,
      choice_key: winningChoice.choice_id,
      expected_step_index: roomIndex,
      success: true,
      now: engineDay,
    });
    assert.equal(result.accepted, true, `daily room ${roomIndex + 1} must resolve through the roguelite engine`);
  }
  engineRuns.push({ telegramId, runId: created.daily_run.run_id, fingerprints });
}
assert.deepEqual(engineRuns[0].fingerprints, engineRuns[1].fingerprints,
  'players on the same UTC day must receive identical deterministic rooms, enemies, and boss');
for (const { telegramId, runId } of engineRuns) {
  assert.equal(engineDb.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_run_rooms WHERE run_id=?').get(runId).count, 10,
    'daily completion must use the ten canonical Moon Alley room records');
  assert.equal(engineDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_run_analytics
    WHERE run_id=? AND event_type='boss_fought' AND json_extract(event_data,'$.outcome')='win'`).get(runId).count, 1,
    'daily boss resolution must record canonical boss win analytics');
  assert.equal(engineDb.database.prepare('SELECT status FROM telegram_pet_runs WHERE telegram_id=? AND run_id=?').get(telegramId, runId).status, 'completed');
  assert.equal(engineDb.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_run_steps WHERE telegram_id=? AND run_id=?').get(telegramId, runId).count, 0,
    'daily rooms must never enter the legacy step table');
}

assert.deepEqual(__dailyMoonRunTestHooks.calculateStreaks([
  { utc_day: '2026-08-11', status: 'completed' },
  { utc_day: '2026-08-12', status: 'extracted' },
  { utc_day: '2026-08-13', status: 'failed' },
], '2026-08-13'), { current: 0, longest: 2 }, 'a failed current day must reset current streak and preserve longest streak');
assert.deepEqual(__dailyMoonRunTestHooks.calculateStreaks([
  { utc_day: '2026-08-11', status: 'completed' },
  { utc_day: '2026-08-12', status: 'completed' },
  { utc_day: '2026-08-14', status: 'completed' },
], '2026-08-14'), { current: 1, longest: 2 }, 'a skipped UTC day must reset the streak');

const midnightDb = new D1();
seedPlayer(midnightDb, 'midnight-player');
const midnightCreated = await createDailyMoonRun(midnightDb, { telegram_id: 'midnight-player', now: new Date('2026-08-11T23:59:59.000Z') });
midnightDb.database.prepare(`UPDATE telegram_pet_runs SET status='failed', current_room=1, depth=1,
  completed_at='2026-08-12 00:00:01', ended_at='2026-08-12 00:00:01' WHERE run_id=?`).run(midnightCreated.daily_run.run_id);
const midnightSync = await syncDailyMoonRun(midnightDb, {
  telegram_id: 'midnight-player',
  run_id: midnightCreated.daily_run.run_id,
  now: new Date('2026-08-12T00:00:02.000Z'),
});
assert.equal(midnightSync.accepted, true);
assert.equal(midnightSync.daily_run.utc_day, '2026-08-11', 'sync must derive the reserved UTC day from the run ID after midnight');
assert.equal(midnightDb.database.prepare("SELECT status FROM telegram_pet_daily_runs WHERE telegram_id='midnight-player' AND utc_day='2026-08-11'").get().status, 'failed');

seedPlayer(db, 'failed-player');
const failedSeed = await generateDailyMoonRunSeed('2026-08-12');
const failedRunId = __dailyMoonRunTestHooks.dailyRunId('failed-player', '2026-08-12');
await startPetRogueliteRun(db, { telegram_id: 'failed-player', run_id: failedRunId, region: 'moon_alley', seed: failedSeed.run_seed, max_room: 10, season_key: 'pet-s2026-003' });
const recovered = await createDailyMoonRun(db, { telegram_id: 'failed-player', now: new Date('2026-08-12T05:00:00.000Z') });
assert.equal(recovered.accepted, true, 'creation must recover a deterministic run inserted before its daily reservation');
db.database.prepare("UPDATE telegram_pet_runs SET status='failed', current_room=4, depth=4, score=120, completed_at='2026-08-12 05:04:00' WHERE run_id=?").run(failedRunId);
await Promise.all([
  syncDailyMoonRun(db, { telegram_id: 'failed-player', utc_day: '2026-08-12', now: new Date('2026-08-12T05:05:00.000Z') }),
  syncDailyMoonRun(db, { telegram_id: 'failed-player', utc_day: '2026-08-12', now: new Date('2026-08-12T05:05:00.000Z') }),
]);
assert.equal(db.database.prepare("SELECT status FROM telegram_pet_daily_runs WHERE telegram_id='failed-player'").get().status, 'failed');
assert.equal(db.database.prepare("SELECT runs_recorded FROM telegram_pet_daily_leaderboard_records WHERE telegram_id='failed-player'").get().runs_recorded, 1,
  'failed daily run recovery must remain idempotent');

const leaderboard = await getDailyMoonRunLeaderboard(db, { utc_day: '2026-08-11', limit: 25 });
assert.equal(leaderboard.entries[0].telegram_id, 'daily-player');
assert.equal(leaderboard.entries[0].rank, 1);
assert.equal(leaderboard.entries[0].score, 900);
const analytics = await getDailyMoonRunAnalytics(db, { utc_day: '2026-08-11' });
assert.equal(analytics.daily_participation, 1);
assert.equal(analytics.completion_rate, 1);
assert.equal(analytics.average_depth, 10);
assert.equal(analytics.boss_win_percentage, 100);
assert.equal(analytics.challenge_completion_percentage.length, 5, 'analytics must report every configured daily challenge, including zero-progress challenges');

const journeyDb = new D1();
seedPlayer(journeyDb, 'journey-player', 'pet-s2026-001');
const journeyNow = new Date('2026-01-15T10:00:00.000Z');
const journeyRun = await createDailyMoonRun(journeyDb, { telegram_id: 'journey-player', now: journeyNow });
resolveDailyRun(journeyDb, 'journey-player', journeyRun.daily_run.run_id, { status: 'completed', score: 800, boss: true });
const journeySync = await syncDailyMoonRun(journeyDb, { telegram_id: 'journey-player', utc_day: '2026-01-15', now: journeyNow });
assert.equal(journeySync.accepted, true);
assert.equal(journeyDb.database.prepare(`SELECT COUNT(DISTINCT challenge_id) AS count FROM telegram_pet_daily_journey_objectives
  WHERE pet_id='pet-journey-player' AND utc_day='2026-01-15' AND status='accepted'`).get().count, 3,
  'Test 1: Pet A completing 3/5 records three participating-pet objectives');
assert.equal(journeyDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id='pet-journey-player' AND season_key='pet-s2026-001' AND earned_day='2026-01-15'`).get().count, 1,
  'Test 1: Pet A receives one Growth Mark');
assert.equal(journeyDb.database.prepare(`SELECT status FROM telegram_pet_daily_journey_receipts
  WHERE pet_id='pet-journey-player' AND utc_day='2026-01-15' AND status='accepted'`).get().status, 'accepted',
  'Test 1: qualification receipt is accepted');
assert.equal(journeyDb.database.prepare(`SELECT completed_objectives FROM telegram_pet_daily_journey_receipts
  WHERE pet_id='pet-journey-player' AND utc_day='2026-01-15' AND status='accepted'`).get().completed_objectives, 3,
  'Test 1: Growth Mark qualification counts completed objectives, not raw accepted events');
await syncDailyMoonRun(journeyDb, { telegram_id: 'journey-player', utc_day: '2026-01-15', now: journeyNow });
assert.equal(journeyDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id='pet-journey-player' AND season_key='pet-s2026-001' AND earned_day='2026-01-15'`).get().count, 1,
  'Test 2: repeated completion cannot mint a second Growth Mark');
assert.equal(journeyDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_receipts
  WHERE pet_id='pet-journey-player' AND utc_day='2026-01-15' AND status='rejected' AND reason='daily_journey_growth_mark_duplicate'`).get().count, 1,
  'Test 2: duplicate completion writes a rejected receipt');

const recoveryDb = new D1();
seedPlayer(recoveryDb, 'recovery-player', 'pet-s2026-001');
recoveryDb.database.prepare(`INSERT INTO telegram_pet_growth_marks
  (mark_id, pet_id, telegram_id, season_key, milestone_type, evidence_key, earned_day, earned_at)
  VALUES ('growth:pet-recovery-player:pet-s2026-001:daily_moon_run_milestone:daily-run:2026-01-19:3-of-5',
    'pet-recovery-player', 'recovery-player', 'pet-s2026-001', 'daily_moon_run_milestone',
    'daily-run:2026-01-19:3-of-5', '2026-01-19', '2026-01-19T00:00:00.000Z')`).run();
const recoveryRun = await createDailyMoonRun(recoveryDb, { telegram_id: 'recovery-player', now: new Date('2026-01-19T10:00:00.000Z') });
resolveDailyRun(recoveryDb, 'recovery-player', recoveryRun.daily_run.run_id, { status: 'completed', score: 800, boss: true });
const recoverySync = await syncDailyMoonRun(recoveryDb, {
  telegram_id: 'recovery-player', utc_day: '2026-01-19', now: new Date('2026-01-19T10:05:00.000Z'),
});
assert.equal(recoverySync.challenge_results.at(-1).daily_journey.accepted, true,
  'missing accepted receipt recovers when the exact Daily Journey Growth Mark already exists');
assert.equal(recoverySync.challenge_results.at(-1).daily_journey.recovered, true,
  'receipt recovery is explicit in the settlement result');
assert.deepEqual({ ...recoveryDb.database.prepare(`SELECT status, reason, growth_mark_id FROM telegram_pet_daily_journey_receipts
  WHERE pet_id='pet-recovery-player' AND utc_day='2026-01-19'`).get() }, {
  status: 'accepted',
  reason: 'daily_journey_qualified',
  growth_mark_id: 'growth:pet-recovery-player:pet-s2026-001:daily_moon_run_milestone:daily-run:2026-01-19:3-of-5',
}, 'recovered Daily Journey receipt is accepted and points at the real existing Growth Mark');

const preexistingMarkDb = new D1();
seedPlayer(preexistingMarkDb, 'preexisting-mark-player', 'pet-s2026-001');
preexistingMarkDb.database.prepare(`INSERT INTO telegram_pet_growth_marks
  (mark_id, pet_id, telegram_id, season_key, milestone_type, evidence_key, earned_day, earned_at)
  VALUES ('growth:preexisting-authority-row', 'pet-preexisting-mark-player', 'preexisting-mark-player',
    'pet-s2026-001', 'care_milestone', 'care:already-earned', '2026-01-18', '2026-01-18T08:00:00.000Z')`).run();
const preexistingRun = await createDailyMoonRun(preexistingMarkDb, { telegram_id: 'preexisting-mark-player', now: new Date('2026-01-18T10:00:00.000Z') });
resolveDailyRun(preexistingMarkDb, 'preexisting-mark-player', preexistingRun.daily_run.run_id, { status: 'completed', score: 800, boss: true });
const preexistingSync = await syncDailyMoonRun(preexistingMarkDb, {
  telegram_id: 'preexisting-mark-player', utc_day: '2026-01-18', now: new Date('2026-01-18T10:05:00.000Z'),
});
assert.equal(preexistingSync.challenge_results.at(-1).daily_journey.reason, 'daily_journey_growth_mark_duplicate',
  'same-day Growth Mark duplicates are rejected by Daily Journey receipts');
assert.equal(preexistingMarkDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id='pet-preexisting-mark-player' AND earned_day='2026-01-18'`).get().count, 1,
  'same-day Daily Journey duplicate does not insert a second Growth Mark');
const preexistingReceipt = preexistingMarkDb.database.prepare(`SELECT status, reason, growth_mark_id FROM telegram_pet_daily_journey_receipts
  WHERE pet_id='pet-preexisting-mark-player' AND utc_day='2026-01-18'`).get();
assert.deepEqual({ ...preexistingReceipt }, {
  status: 'rejected',
  reason: 'daily_journey_growth_mark_duplicate',
  growth_mark_id: 'growth:preexisting-authority-row',
}, 'duplicate Daily Journey receipt references the existing authoritative Growth Mark');
assert.equal(preexistingMarkDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE mark_id='growth:pet-preexisting-mark-player:pet-s2026-001:daily_moon_run_milestone:daily-run:2026-01-18:3-of-5'`).get().count, 0,
  'duplicate Daily Journey receipt never references or creates the generated fake mark id');

seedAdditionalPet(journeyDb, 'journey-player', 'pet-journey-player-b', 2, 'pet-s2026-001');
seedAdditionalPet(journeyDb, 'journey-player', 'pet-journey-player-c', 3, 'pet-s2026-001');
journeyDb.database.prepare("UPDATE telegram_pet_active_slots SET pet_id='pet-journey-player-b' WHERE telegram_id='journey-player'").run();
await syncDailyMoonRun(journeyDb, { telegram_id: 'journey-player', utc_day: '2026-01-15', now: journeyNow });
assert.equal(journeyDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id='pet-journey-player' AND earned_day='2026-01-15'`).get().count, 1,
  'Test 3: retry after active-pet switch leaves the reward on original Pet A');
assert.equal(journeyDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id='pet-journey-player-b'`).get().count, 0,
  'Test 3: active Pet B cannot steal Pet A Daily Journey reward');

const twoObjectiveDb = new D1();
seedPlayer(twoObjectiveDb, 'two-objective-player', 'pet-s2026-001');
const twoObjectiveNow = new Date('2026-01-16T10:00:00.000Z');
const twoObjectiveRun = await createDailyMoonRun(twoObjectiveDb, { telegram_id: 'two-objective-player', now: twoObjectiveNow });
resolveDailyRun(twoObjectiveDb, 'two-objective-player', twoObjectiveRun.daily_run.run_id, { status: 'completed', score: 700, boss: false });
insertCareEvent(twoObjectiveDb, 'two-objective-player', 'partial-care-one', '2026-01-16', 'feed', 'pet-two-objective-player');
insertCareEvent(twoObjectiveDb, 'two-objective-player', 'partial-care-two', '2026-01-16', 'play', 'pet-two-objective-player');
await recordDailyCareChallenge(twoObjectiveDb, { telegram_id: 'two-objective-player', event_key: 'partial-care-one', now: twoObjectiveNow });
const partialCare = await recordDailyCareChallenge(twoObjectiveDb, { telegram_id: 'two-objective-player', event_key: 'partial-care-two', now: twoObjectiveNow });
await syncDailyMoonRun(twoObjectiveDb, { telegram_id: 'two-objective-player', utc_day: '2026-01-16', now: twoObjectiveNow });
assert.equal(partialCare.daily_journey.completed_objectives, 0, 'Test 4: 2/3 accepted care events do not complete the care objective');
assert.equal(twoObjectiveDb.database.prepare(`SELECT COUNT(DISTINCT challenge_id) AS count FROM telegram_pet_daily_journey_objectives
  WHERE pet_id='pet-two-objective-player' AND utc_day='2026-01-16' AND status='accepted'`).get().count, 3,
  'Test 4: partial accepted care evidence is present but must not count as a completed objective');
assert.equal(twoObjectiveDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id='pet-two-objective-player'`).get().count, 0,
  'Test 4: 2/5 objectives does not award a Growth Mark');

const multiPetDb = new D1();
seedPlayer(multiPetDb, 'multi-pet-player', 'pet-s2026-001');
seedAdditionalPet(multiPetDb, 'multi-pet-player', 'pet-multi-pet-player-b', 2, 'pet-s2026-001');
const petAObjectiveIds = ['daily_combat', 'daily_explorer', 'daily_boss'];
for (const challengeId of petAObjectiveIds) await __dailyMoonRunTestHooks.recordChallengeEvidence(multiPetDb, {
  telegram_id: 'multi-pet-player', pet_id: 'pet-multi-pet-player', utc_day: '2026-01-17', challenge_id: challengeId,
  event_key: `pet-a:${challengeId}`, progress_value: PET_DAILY_CHALLENGES[challengeId].target,
  evidence: { authority: 'test_daily_journey_authority', pet_id: 'pet-multi-pet-player' },
});
const petBResults = [];
for (const challengeId of petAObjectiveIds) petBResults.push(await __dailyMoonRunTestHooks.recordChallengeEvidence(multiPetDb, {
  telegram_id: 'multi-pet-player', pet_id: 'pet-multi-pet-player-b', utc_day: '2026-01-17', challenge_id: challengeId,
  event_key: `pet-b:${challengeId}`, progress_value: PET_DAILY_CHALLENGES[challengeId].target,
  evidence: { authority: 'test_daily_journey_authority', pet_id: 'pet-multi-pet-player-b' },
}));
assert.equal(multiPetDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id='pet-multi-pet-player' AND earned_day='2026-01-17'`).get().count, 1,
  "Test 5: Pet A gets today's Growth Mark");
assert.equal(multiPetDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id='pet-multi-pet-player-b' AND earned_day='2026-01-17'`).get().count, 1,
  'Test 5: Pet B independently qualifies on the same account');
assert.equal(petBResults.at(-1).daily_journey.accepted, true, 'Test 5: Pet B qualification is accepted independently');

// Mandatory 10,000-run economy and determinism simulation. Daily tracking adds
// no reward source; existing authority is exercised with 10,000 duplicate
// completion callbacks to prove caps and asset idempotency still hold.
const simulationDb = new D1();
seedPlayer(simulationDb, 'simulation-player');
simulationDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, telegram_id, run_id, season_key, region, difficulty, seed, status, current_room, max_room, depth, max_depth)
  VALUES ('simulation-row', 'simulation-player', 'simulation-run', 'pet-s2026-003', 'moon_alley', 1, 123, 'completed', 10, 10, 10, 10)`).run();
const officialKeys = new Set();
const challengeClaims = new Set();
const memoryKeys = new Set();
const roomFingerprints = new Map();
for (let index = 0; index < 10000; index += 1) {
  const dayNumber = (index % 365) + 1;
  const date = new Date(Date.UTC(2026, 0, dayNumber));
  const day = date.toISOString().slice(0, 10);
  const seed = await generateDailyMoonRunSeed(day);
  const rooms = [];
  let run = { run_id: `simulation:${day}`, seed: seed.run_seed, region: 'moon_alley', current_room: 0, max_room: 10 };
  for (let roomIndex = 0; roomIndex < 10; roomIndex += 1) {
    const room = generatePetRunRoom(run);
    rooms.push(`${room.content_id}:${room.enemy_id || room.boss_id || ''}`);
    run = { ...run, current_room: room.room };
  }
  const fingerprint = rooms.join('|');
  if (roomFingerprints.has(day)) assert.equal(roomFingerprints.get(day), fingerprint, 'same daily seed must reproduce the same rooms, enemies and boss');
  else roomFingerprints.set(day, fingerprint);
  officialKeys.add(`simulation-player:${day}`);
  challengeClaims.add(`simulation-player:${day}:daily_boss`);
  memoryKeys.add('daily:memory:boss-victory:simulation-player');
}
assert.equal(officialKeys.size, 365, 'one official daily run key must survive repeated simulation attempts');
assert.equal(challengeClaims.size, 365, 'challenge completion keys must be duplicate safe per UTC day');
assert.equal(memoryKeys.size, 1, 'milestone memories cannot spam across 10,000 runs');
for (let index = 0; index < 10000; index += 1) await awardPetReward(simulationDb, {
  telegram_id: 'simulation-player', source: 'roguelite_completion', idempotency_key: 'simulation-run',
  rewards: { pet_xp: 1200, community_xp: 250, materials: { scrap_metal: 40 }, items: { moon_snack: 10 } },
  context: { run_id: 'simulation-run' }, now: new Date('2026-08-11T00:00:00.000Z'),
});
assert.equal(simulationDb.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id='simulation-player'").get().pet_xp, 1200,
  'Pet XP must remain capped after 10,000 callbacks');
assert.equal(simulationDb.database.prepare("SELECT xp FROM telegram_users WHERE telegram_id='simulation-player'").get().xp, 250,
  'Community XP must remain capped after 10,000 callbacks');
assert.equal(simulationDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='simulation-player' AND source <> 'wallet_reconciliation'").get().count, 1,
  'reward claims cannot duplicate across 10,000 callbacks');
assert.equal(simulationDb.database.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id='simulation-player' AND material_key='scrap_metal'").get().quantity, 40,
  'materials must remain bounded after 10,000 callbacks');
assert.equal(simulationDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id='simulation-player' AND asset_type='item'").get().quantity, 10,
  'items must remain bounded after 10,000 callbacks');
assert.equal(__rogueliteFoundationTestHooks.DAILY_PET_XP_CAP, 1200);
assert.equal(__rogueliteFoundationTestHooks.DAILY_COMMUNITY_XP_CAP, 250);

// Meaningful risk/score choices, versioned rules and checkpoint authority.
const previewPet = { pet_xp: 0, health: 50, energy: 50, happiness: 50, cleanliness: 50 };
const v2Rows = [{ modifier_id: DAILY_RUN_RULES_ID, effects_json: '{}' }];
for (const roomType of ['choice_event', 'loot', 'battle', 'elite', 'boss']) {
  const room = { room_type: roomType };
  const safe = previewDailyChoice(previewPet, room, 'sneak', v2Rows);
  const balanced = previewDailyChoice(previewPet, room, 'explore', v2Rows);
  const bold = previewDailyChoice(previewPet, room, 'fight', v2Rows);
  assert.ok(safe.success_chance_bps > bold.success_chance_bps);
  assert.ok(safe.score < balanced.score && balanced.score < bold.score, 'risk must change run score');
  assert.equal(previewDailyChoice(previewPet, room, 'sneak', []).score, previewDailyChoice(previewPet, room, 'fight', []).score, 'pre-update runs retain scoring');
  for (const key of Object.keys(DAILY_RUN_TACTICS)) {
    const rows = [...v2Rows, { modifier_id: 'daily_tactic_3', effects_json: JSON.stringify({ tactic_id: key }) }];
    const after = previewDailyChoice(previewPet, room, 'explore', rows);
    assert.notEqual(after.success_chance_bps, balanced.success_chance_bps, 'every tactic changes room odds');
    assert.notEqual(after.score, balanced.score, 'every tactic changes room score');
  }
}
for (let seed = 1; seed <= 300; seed++) assert.ok(Object.hasOwn(DAILY_RUN_CONDITIONS, __dailyMoonRunTestHooks.dailyModifierId(seed)), 'new runs exclude dormant conditions');
for (let current_room = 0; current_room < 9; current_room++) {
  const room = generatePetRunRoom({ run_id: 'approach-audit', current_room, max_room: 10, region: 'moon_alley', seed: 10 });
  const choices = room.choices.map((choice) => previewDailyChoice(previewPet, room, choice.choice_id, v2Rows));
  assert.equal(new Set(choices.map((choice) => choice.approach)).size, room.choices.length, `each option in ${room.content_id} needs a distinct approach`);
  assert.equal(new Set(choices.map((choice) => choice.score)).size, room.choices.length, `each option in ${room.content_id} needs a distinct score`);
}
for (const [id, effects] of [['fast_enemies', { enemy_speed_pct: 20 }], ['low_energy', { energy_cost_modifier: 5 }], ['lucky_run', { event_outcome_pct: 15 }]]) {
  assert.notEqual(previewDailyChoice(previewPet, { room_type: 'battle' }, 'fight', [...v2Rows, { modifier_id: id, effects_json: JSON.stringify(effects) }]).success_chance_bps,
    previewDailyChoice(previewPet, { room_type: 'battle' }, 'fight', v2Rows).success_chance_bps);
}
async function tacticFixture(id) {
  const adapter = new D1(); seedPlayer(adapter, id);
  const created = await createDailyMoonRun(adapter, { telegram_id: id, now });
  const run = adapter.database.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(created.daily_run.run_id);
  return { adapter, run };
}
const tacticalFixture = await tacticFixture('tactical-player');
const tacticalDb = tacticalFixture.adapter, tacticalRun = tacticalFixture.run;
const requestTactic = (key, checkpoint = 3) => ({ run_id: tacticalRun.run_id, checkpoint, tactic_id: key, score: 999999, rewards: { pet_xp: 999999 } });
assert.equal((await chooseDailyRunTactic(tacticalDb, 'tactical-player', requestTactic('guardian'))).accepted, false, 'cannot draft early');
tacticalDb.database.prepare('UPDATE telegram_pet_runs SET current_room=3,depth=3 WHERE run_id=?').run(tacticalRun.run_id);
assert.equal((await chooseDailyRunTactic(tacticalDb, 'intruder', requestTactic('guardian'))).accepted, false);
assert.equal((await chooseDailyRunTactic(tacticalDb, 'tactical-player', requestTactic('__proto__'))).accepted, false);
const simultaneousTactics = await Promise.all(['guardian', 'striker', 'scavenger'].map((key) => chooseDailyRunTactic(tacticalDb, 'tactical-player', requestTactic(key))));
assert.equal(simultaneousTactics.filter((result) => result.accepted).length, 1, 'one immutable choice per checkpoint');
assert.equal((await chooseDailyRunTactic(tacticalDb, 'tactical-player', requestTactic('guardian'))).accepted, false, 'replay cannot add a second bonus');
let tacticalRows = await readDailyModifiers(tacticalDb, tacticalRun);
let tacticalBoard = dailyTacticalBoard({ ...tacticalRun, current_room: 3 }, tacticalRows);
assert.equal(tacticalBoard.offers.length, 0); assert.equal(tacticalBoard.selected.length, 1);
assert.equal(tacticalBoard.selected[0].key, 'guardian');
assert.equal(dailyTacticalBoard({ ...tacticalRun, current_room: 6 }, tacticalRows).offers.length, 3);
tacticalDb.database.prepare('UPDATE telegram_pet_runs SET current_room=6,depth=6 WHERE run_id=?').run(tacticalRun.run_id);
assert.equal((await chooseDailyRunTactic(tacticalDb, 'tactical-player', requestTactic('scavenger', 6))).accepted, true);
tacticalRows = await readDailyModifiers(tacticalDb, tacticalRun);
assert.equal(dailyTacticalBoard({ ...tacticalRun, current_room: 6 }, tacticalRows).selected.length, 2);
assert.equal(tacticalDb.database.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(tacticalRun.pet_id).pet_xp, 0);
assert.equal(tacticalDb.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_reward_claims').get().count, 0, 'drafting cannot award economy rewards');
tacticalDb.database.prepare("UPDATE telegram_pet_runs SET status='failed' WHERE run_id=?").run(tacticalRun.run_id);
assert.equal((await chooseDailyRunTactic(tacticalDb, 'tactical-player', requestTactic('guardian', 6))).accepted, false);

// A failed build read cannot silently turn an official v2 run into a legacy
// room resolution with different odds and score, or discard its saved tactic.
{
  const f = await tacticFixture('daily-modifier-read-failure');
  f.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=3,depth=3 WHERE run_id=?').run(f.run.run_id);
  f.run.current_room = 3; f.run.depth = 3;
  const room = await createPetRunRoom(f.adapter, f.run);
  assert.equal((await chooseDailyRunTactic(f.adapter, f.run.telegram_id, { run_id: f.run.run_id, checkpoint: 3, tactic_id: 'guardian' })).accepted, true);
  f.adapter.failAll = sql => sql.includes('SELECT modifier_id, effects_json FROM telegram_pet_run_modifiers');
  const request = { telegram_id: f.run.telegram_id, run_id: f.run.run_id, choice_key: room.choices[0].choice_id, expected_step_index: 3, now };
  await assert.rejects(processDailyMoonRunStep(f.adapter, request), /pet_state_read_unavailable/);
  assert.equal(f.adapter.database.prepare('SELECT status FROM telegram_pet_run_rooms WHERE room_id=?').get(room.room_id).status, 'pending');
  assert.equal(f.adapter.database.prepare('SELECT current_room FROM telegram_pet_runs WHERE run_id=?').get(f.run.run_id).current_room, 3);
  f.adapter.failAll = null;
  const resumed = await processDailyMoonRunStep(f.adapter, request);
  assert.equal(resumed.room.outcome.authority, 'daily_moon_run_server_outcome_v2');
  assert.equal(resumed.room.outcome.daily_tactics[0].key, 'guardian');
}

{
  const f = await tacticFixture('daily-tactic-write-failure');
  f.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=3,depth=3 WHERE run_id=?').run(f.run.run_id);
  const request = { run_id: f.run.run_id, checkpoint: 3, tactic_id: 'guardian' };
  f.adapter.failFirst = /INSERT OR IGNORE INTO telegram_pet_run_modifiers/;
  await assert.rejects(chooseDailyRunTactic(f.adapter, f.run.telegram_id, request), /pet_state_read_unavailable/);
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) n FROM telegram_pet_run_modifiers WHERE run_id=? AND modifier_id='daily_tactic_3'").get(f.run.run_id).n, 0);
  f.adapter.failFirst = null;
  assert.equal((await chooseDailyRunTactic(f.adapter, f.run.telegram_id, request)).accepted, true);
}

// Old pending runs keep the old condition and rules even when resumed.
const oldFixture = await tacticFixture('old-tactical-player');
oldFixture.adapter.database.prepare('DELETE FROM telegram_pet_run_modifiers WHERE run_id=?').run(oldFixture.run.run_id);
oldFixture.adapter.database.prepare(`INSERT INTO telegram_pet_run_modifiers (run_id,pet_id,telegram_id,modifier_id,effects_json) VALUES (?,?,?,'glass_cannon','{"damage_dealt_pct":40,"damage_taken_pct":40}')`)
  .run(oldFixture.run.run_id, oldFixture.run.pet_id, oldFixture.run.telegram_id);
await createDailyMoonRun(oldFixture.adapter, { telegram_id: oldFixture.run.telegram_id, now });
const oldRows = await readDailyModifiers(oldFixture.adapter, oldFixture.run);
assert.equal(oldRows.length, 1); assert.equal(oldRows[0].modifier_id, 'glass_cannon');
assert.equal(dailyTacticalBoard({ ...oldFixture.run, current_room: 3 }, oldRows).offers.length, 0);

// A tactic chosen between outcome calculation and commit invalidates the stale calculation.
const race = await tacticFixture('tactic-race-player');
race.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=3,depth=3 WHERE run_id=?').run(race.run.run_id);
race.run.current_room = 3; race.run.depth = 3;
const raceRoom = await createPetRunRoom(race.adapter, race.run);
const staleOutcome = await __dailyMoonRunTestHooks.resolveAuthoritativeDailyRoomOutcome(race.adapter, race.run, raceRoom, raceRoom.choices[0].choice_id);
assert.equal((await chooseDailyRunTactic(race.adapter, race.run.telegram_id, { run_id: race.run.run_id, checkpoint: 3, tactic_id: 'striker' })).accepted, true);
const staleCommit = await persistPetRunRoomOutcome(race.adapter, race.run, raceRoom, staleOutcome);
assert.equal(staleCommit.status, 'pending', 'no outcome may commit with an outdated build');
const freshOutcome = await __dailyMoonRunTestHooks.resolveAuthoritativeDailyRoomOutcome(race.adapter, race.run, raceRoom, raceRoom.choices[0].choice_id);
assert.equal(freshOutcome.daily_tactics[0].key, 'striker');
const actualPet = race.adapter.database.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(race.run.pet_id);
const actualPreview = previewDailyChoice(actualPet, raceRoom, raceRoom.choices[0].choice_id, await readDailyModifiers(race.adapter, race.run));
assert.equal(freshOutcome.success_chance_bps, actualPreview.success_chance_bps);
assert.equal(freshOutcome.score, freshOutcome.success ? actualPreview.score : 0, 'preview and resolution share the same formula');
const freshCommit = await persistPetRunRoomOutcome(race.adapter, race.run, raceRoom, freshOutcome);
assert.notEqual(freshCommit.status, 'pending');

// Opposing simultaneous outcomes must return the actual winning stored outcome.
const competing = await tacticFixture('competing-room-player');
const competingRoom = await createPetRunRoom(competing.adapter, competing.run);
const competingResults = await Promise.all([
  persistPetRunRoomOutcome(competing.adapter, competing.run, competingRoom, { success: false, score: 0, daily_tactic_count: 0 }),
  persistPetRunRoomOutcome(competing.adapter, competing.run, competingRoom, { success: true, score: 999, daily_tactic_count: 0 }),
]);
assert.equal(competingResults[0].status, 'failed'); assert.equal(competingResults[1].status, 'failed');
assert.equal(competingResults[1].outcome.score, 0, 'losing request cannot invent success or inflate score');

// Endless-run previews must use the same source-pet equipment as resolution.
const previewDb = new D1();
previewDb.database.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
const previewOwner = 'source-preview-player';
const previewSeason = getDailySeasonId(new Date().toISOString().slice(0, 10));
seedPlayer(previewDb, previewOwner, previewSeason);
seedAdditionalPet(previewDb, previewOwner, 'preview-pet-b', 2, previewSeason);
for (const petId of [`pet-${previewOwner}`, 'preview-pet-b']) {
  previewDb.database.prepare(`UPDATE telegram_pet_instances SET stage='young',energy=80,source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id=?`).run(petId);
  previewDb.database.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json) VALUES (?,?,?,'young','{}','[]')`).run(petId, previewOwner, petId);
}
previewDb.database.prepare("UPDATE telegram_pet_instances SET equipped_food='crystal_bowl' WHERE pet_id=?").run(`pet-${previewOwner}`);
const previewStarted = await __petMediaTestHooks.startOrResumePetRun(previewDb, previewOwner);
assert.equal(previewStarted.accepted, true);
const sourcePreview = await __petMediaTestHooks.buildPetMiniAppState(previewDb, previewOwner, 'fixture-token');
assert.ok(sourcePreview.run.choices.some((choice) => choice.advantages.includes('GEAR SHIELD')));
previewDb.database.prepare('UPDATE telegram_pet_active_slots SET pet_id=? WHERE telegram_id=?').run('preview-pet-b', previewOwner);
const switchedPreview = await __petMediaTestHooks.buildPetMiniAppState(previewDb, previewOwner, 'fixture-token');
assert.equal(switchedPreview.pet.pet_id, 'preview-pet-b');
assert.equal(switchedPreview.run.source_pet.active, false);
assert.equal(switchedPreview.run.source_pet.pet_id, `pet-${previewOwner}`);
assert.deepEqual(switchedPreview.run.choices, sourcePreview.run.choices, 'changing active pets must not change the saved run preview');
// A paid standard choice uses the account wallet even after switching pets.
previewDb.database.prepare('UPDATE telegram_pet_profiles SET moon_gold=0 WHERE telegram_id=?').run(previewOwner);
let poorRun;
for (let seed = 1; seed <= 100; seed++) {
  previewDb.database.prepare('UPDATE telegram_pet_runs SET seed=? WHERE run_id=?').run(seed, previewStarted.run.run_id);
  poorRun = (await __petMediaTestHooks.buildPetMiniAppState(previewDb, previewOwner, 'fixture-token')).run;
  if (poorRun.choices.some((choice) => choice.key === 'trade')) break;
}
assert.equal(poorRun.choices.find((choice) => choice.key === 'trade')?.available, false);
assert.ok(poorRun.choices.some((choice) => choice.available), 'free run alternatives remain playable');
const rejectedTrade = await dispatchRenderedPetAction(previewDb, previewOwner, { id: previewOwner }, { action: 'run_step', run_id: poorRun.run_id, choice_key: 'trade', expected_step_index: poorRun.expected_step_index }, 'fixture-token');
assert.equal(rejectedTrade.reason, 'insufficient_run_cost', 'projection matches the authoritative rejection');
previewDb.database.prepare('UPDATE telegram_pet_profiles SET moon_gold=12 WHERE telegram_id=?').run(previewOwner);
const fundedRun = (await __petMediaTestHooks.buildPetMiniAppState(previewDb, previewOwner, 'fixture-token')).run;
assert.equal(fundedRun.choices.find((choice) => choice.key === 'trade').affordability, 'available');
assert.equal(fundedRun.depth, poorRun.depth, 'previewing or rejecting costs cannot advance the run');
previewDb.database.prepare('UPDATE telegram_pet_runs SET pet_id=NULL WHERE run_id=?').run(previewStarted.run.run_id);
const orphanPreview = await __petMediaTestHooks.buildPetMiniAppState(previewDb, previewOwner, 'fixture-token');
assert.equal(orphanPreview.adopted, true, 'an old orphaned run must not break the Mini App');
assert.equal(orphanPreview.run.source_available, false);
assert.deepEqual(orphanPreview.run.choices, []);

// A refresh must finish an interrupted award from persisted evidence, even
// after the account has moved to a new pet/season. No new gameplay is needed.
{
  const recoveryDb = new D1();
  recoveryDb.database.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
  seedPlayer(recoveryDb, 'journey-refresh', 'pet-s2026-002');
  seedPlayer(recoveryDb, 'other-journey-owner', 'pet-s2026-002');
  for (const owner of ['journey-refresh', 'other-journey-owner']) {
    for (const challengeId of ['daily_combat', 'daily_explorer']) await recordFullJourneyObjective(recoveryDb, {
      telegramId: owner, petId: `pet-${owner}`, day: '2026-06-30', challengeId,
    });
    recoveryDb.failWrite = /INSERT OR IGNORE INTO telegram_pet_daily_journey_receipts/;
    await assert.rejects(recordFullJourneyObjective(recoveryDb, {
      telegramId: owner, petId: `pet-${owner}`, day: '2026-06-30', challengeId: 'daily_extraction',
    }), /injected_journey_write_failure/);
    recoveryDb.failWrite = null;
  }
  const recoveryMarksBefore = recoveryDb.database.prepare('SELECT * FROM telegram_pet_growth_marks ORDER BY mark_id').all();
  await __petMediaTestHooks.buildPetMiniAppState(recoveryDb, 'journey-refresh', 'fixture-token');
  assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_daily_journey_receipts WHERE telegram_id='journey-refresh' AND status='accepted'").get().n, 1,
    'refresh recovers a previously earned Journey receipt without replaying gameplay');
  assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_daily_journey_receipts WHERE telegram_id='other-journey-owner'").get().n, 0,
    'refresh cannot recover or mutate another owner');
  await __petMediaTestHooks.buildPetMiniAppState(recoveryDb, 'journey-refresh', 'fixture-token');
  assert.deepEqual(recoveryDb.database.prepare('SELECT * FROM telegram_pet_growth_marks ORDER BY mark_id').all(), recoveryMarksBefore,
    'refresh preserves original marks and dates, with no duplicate or current-day award');
  // Repair a legacy accepted receipt whose mark lookup was interrupted, without
  // replacing its identity or paying the same earned mark again.
  recoveryDb.database.prepare("UPDATE telegram_pet_daily_journey_receipts SET growth_mark_id=NULL WHERE telegram_id='journey-refresh' AND status='accepted'").run();
  await __petMediaTestHooks.buildPetMiniAppState(recoveryDb, 'journey-refresh', 'fixture-token');
  assert.ok(recoveryDb.database.prepare("SELECT growth_mark_id FROM telegram_pet_daily_journey_receipts WHERE telegram_id='journey-refresh' AND status='accepted'").get().growth_mark_id);
  assert.deepEqual(recoveryDb.database.prepare('SELECT * FROM telegram_pet_growth_marks ORDER BY mark_id').all(), recoveryMarksBefore);

}

// An interruption after saving the final room must resume settlement, not
// generate an eleventh boss or require the player to win the ending twice.
// Completed-run refreshes must use the same Q3 server clock as their fixtures.
mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-08-20T12:00:00Z') });

async function endingFixture(owner, options = {}) {
  const adapter = options.adapter || new D1();
  const now = options.now || new Date('2026-08-20T12:00:00Z');
  if (!options.adapter) {
    adapter.database.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
    seedPlayer(adapter, owner);
    adapter.database.prepare("UPDATE telegram_pet_instances SET stage='young',source_profile_updated_at='0001-01-01 00:00:00' WHERE telegram_id=?").run(owner);
    adapter.database.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json) VALUES (?,?,?,'young','{}','[]')").run(`pet-${owner}`,owner,owner);
  }
  const created = await createDailyMoonRun(adapter, { telegram_id: owner, now });
  adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=9,depth=9,score=123 WHERE run_id=?').run(created.daily_run.run_id);
  const run = adapter.database.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(created.daily_run.run_id);
  const room = await createPetRunRoom(adapter, run);
  await persistPetRunRoomOutcome(adapter, run, room, { success: true, score: 100, choice_id: room.choices[0].choice_id });
  return { adapter, owner, now, run, room, request: { telegram_id: owner, run_id: run.run_id, choice_key: room.choices[0].choice_id, expected_step_index: 9, now } };
}

for (const boundary of ['boss','history','records','saved run']) {
  const f=await endingFixture(`daily-final-read-${boundary}`);
  f.adapter.database.prepare("UPDATE telegram_pet_runs SET status='completed',current_room=10,depth=10,score=223,completed_at=CURRENT_TIMESTAMP WHERE run_id=?").run(f.run.run_id);
  if (boundary==='history') f.adapter.failAll=sql=>sql.includes('SELECT utc_day, status FROM telegram_pet_daily_runs');
  else f.adapter.failFirst=boundary==='boss' ? /SELECT 1 AS defeated FROM telegram_pet_run_analytics/
    : boundary==='records' ? /SELECT \* FROM telegram_pet_daily_leaderboard_records/ : /SELECT d\.\*, r\.season_key, r\.status AS authoritative_status, r\.region/;
  await assert.rejects(syncDailyMoonRun(f.adapter,f.request),/pet_state_read_unavailable/,boundary);
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) n FROM telegram_pet_daily_analytics WHERE telegram_id=? AND event_type='run_terminal'").get(f.owner).n,0,'unavailable evidence cannot seal terminal records');
  assert.equal(f.adapter.database.prepare('SELECT boss_defeated FROM telegram_pet_daily_runs WHERE telegram_id=?').get(f.owner).boss_defeated,0,'failed evidence cannot fabricate a boss victory');
  f.adapter.failFirst=null; f.adapter.failAll=null;
  await syncDailyMoonRun(f.adapter,f.request);
  const records=f.adapter.database.prepare('SELECT streak_length,longest_streak,boss_completions,runs_recorded FROM telegram_pet_daily_leaderboard_records WHERE telegram_id=?').get(f.owner);
  assert.deepEqual({...records},{streak_length:1,longest_streak:1,boss_completions:0,runs_recorded:1});
  await syncDailyMoonRun(f.adapter,f.request);
  assert.equal(f.adapter.database.prepare('SELECT runs_recorded FROM telegram_pet_daily_leaderboard_records WHERE telegram_id=?').get(f.owner).runs_recorded,1);
}

for (const [boundary,query] of [['ownership',/SELECT 1 AS valid FROM telegram_pet_runs/],['saved room',/SELECT room_id, pet_id, run_id, telegram_id, room_number/]]) {
  const f=await endingFixture(`daily-recovery-read-${boundary}`);
  f.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=10,depth=10 WHERE run_id=?').run(f.run.run_id);
  f.adapter.failFirst=query;
  await assert.rejects(recoverDailyMoonRunEnding(f.adapter,f.request),/pet_state_read_unavailable/,boundary);
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='roguelite_boss'").get(f.owner).n,0,'unavailable source evidence cannot pay a boss');
  assert.equal(f.adapter.database.prepare('SELECT status FROM telegram_pet_runs WHERE run_id=?').get(f.run.run_id).status,'active');
  f.adapter.failFirst=null;
  assert.equal((await recoverDailyMoonRunEnding(f.adapter,f.request)).accepted,true);
}

// A resolved D1 read failure is not an empty room ledger. Finalization must
// stay retryable so daily objectives and terminal records cannot be lost.
{
  const f = await endingFixture('daily-room-read-retry');
  f.adapter.database.prepare("UPDATE telegram_pet_runs SET status='completed',current_room=10,depth=10,score=223,completed_at=CURRENT_TIMESTAMP WHERE run_id=?").run(f.run.run_id);
  f.adapter.failAll = sql => sql.includes('FROM telegram_pet_run_rooms WHERE run_id = ?');
  await assert.rejects(syncDailyMoonRun(f.adapter, f.request), /pet_state_read_unavailable/);
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_daily_analytics WHERE event_type='run_terminal' AND telegram_id=?").get(f.owner).n, 0,
    'a failed room ledger read must not finalize Daily Run records');
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_daily_journey_objectives WHERE challenge_id='daily_explorer' AND telegram_id=?").get(f.owner).n, 0);
  f.adapter.failAll = null;
  await syncDailyMoonRun(f.adapter, f.request);
  await syncDailyMoonRun(f.adapter, f.request);
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_daily_analytics WHERE event_type='run_terminal' AND telegram_id=?").get(f.owner).n, 1,
    'retry finalizes Daily Run records exactly once');
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_daily_journey_objectives WHERE challenge_id='daily_explorer' AND telegram_id=? AND status='accepted'").get(f.owner).n, 1,
    'retry restores official Daily Journey objective credit exactly once');
}

// Finish Saved Daily Run is settlement recovery, just like refresh. It must
// never grant the extraction-only XP, traits or equipment progression.
let endingAwardOwner = 9342000;
async function invokeEndingAction(f, surface, action, suffix = 'first') {
  const body = { ...f.request, action, event_key: `ending-award:${suffix}`, request_id: `ending-award:${suffix}` };
  if (surface === 'mini') return dispatchRenderedPetAction(f.adapter, f.owner, { id: f.owner }, body, 'fixture-token');
  const response = await moonboysApiWorker.fetch(new Request('https://moonboys.test/telegram-pets/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pets-Bot-Secret': 'fixture-secret' }, body: JSON.stringify(body),
  }), { DB: f.adapter, TELEGRAM_PETS_BOT_SECRET: 'fixture-secret' });
  assert.equal(response.status, 200);
  return response.json();
}
function endingRuntimeState(f) {
  return {
    progression: f.adapter.database.prepare('SELECT adventure_xp,traits_json FROM telegram_pet_specialist_progression WHERE pet_id=?').get(f.run.pet_id),
    events: f.adapter.database.prepare('SELECT action,payload_json FROM telegram_pet_specialist_events WHERE pet_id=? ORDER BY event_key').all(f.run.pet_id),
    legacy_events: f.adapter.database.prepare('SELECT action,payload_json FROM telegram_pet_runtime_events WHERE telegram_id=? ORDER BY event_key').all(f.owner),
  };
}
for (const surface of ['mini', 'api', 'refresh']) {
  for (const mode of surface === 'refresh' ? ['finish'] : ['finish', 'step', 'extract']) {
    const f = await endingFixture(String(++endingAwardOwner));
    f.adapter.database.prepare(`INSERT INTO telegram_pet_specialist_progression (pet_id,telegram_id,season_key,adventure_xp,traits_json)
      VALUES (?,?,?,37,'{}')`).run(f.run.pet_id,f.owner,f.run.season_key);
    const before = endingRuntimeState(f);
    if (mode === 'finish') {
      f.adapter.failWrite = /INSERT OR IGNORE INTO telegram_pet_run_analytics[\s\S]*'boss_fought'/;
      await assert.rejects(processDailyMoonRunStep(f.adapter, f.request), /injected_journey_write_failure/);
      f.adapter.failWrite = null;
      if (surface === 'refresh') await __petMediaTestHooks.buildPetMiniAppState(f.adapter, f.owner, 'fixture-token');
      else {
        const finished = await invokeEndingAction(f, surface, 'run_extract');
        assert.equal(finished.reason, 'daily_run_completed');
        assert.equal(finished.duplicate, false, 'first completion must exercise the runtime award gate');
        await invokeEndingAction(f, surface, 'run_extract', 'retry');
      }
      assert.equal(f.adapter.database.prepare('SELECT status FROM telegram_pet_runs WHERE run_id=?').get(f.run.run_id).status, 'completed');
      assert.deepEqual(endingRuntimeState(f), before, `${surface} settlement recovery must not award extraction progression`);
      assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_reward_claims WHERE source='roguelite_boss' AND status='awarded'").get().n, 1);
    } else {
      // Ordinary play resolves a new room and saves its canonical award key.
      // The unmarked legacy room above is reserved for settlement-only cases.
      if (mode === 'step') f.adapter.database.prepare('DELETE FROM telegram_pet_run_rooms WHERE room_id=?').run(f.room.room_id);
      if (mode === 'extract') {
        f.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=1,depth=1 WHERE run_id=?').run(f.run.run_id);
        f.adapter.database.prepare('DELETE FROM telegram_pet_run_rooms WHERE run_id=?').run(f.run.run_id);
      }
      const result = await invokeEndingAction(f, surface, mode === 'step' ? 'run_step' : 'run_extract');
      assert.equal(result.accepted, true);
      const after = endingRuntimeState(f);
      assert.equal(after.progression.adventure_xp - before.progression.adventure_xp, mode === 'step' ? 10 : 24,
        `${surface} ordinary ${mode} keeps its existing Adventure XP`);
      assert.equal(after.events.length, 1);
      assert.deepEqual(after.legacy_events, [], 'deployed wrapper must not add a second unscoped award');
      const plan = JSON.parse(after.events[0].payload_json);
      assert.equal(plan.action, mode === 'step' ? 'run_step' : 'run_extract');
      assert.equal(plan.equipment_action, plan.action);
      assert.deepEqual(JSON.parse(after.progression.traits_json), plan.traits);
    }
  }
}
const interruptedEnding = await endingFixture('ending-retry');
interruptedEnding.adapter.failWrite = /INSERT OR IGNORE INTO telegram_pet_run_analytics[\s\S]*'boss_fought'/;
await assert.rejects(processDailyMoonRunStep(interruptedEnding.adapter, interruptedEnding.request), /injected_journey_write_failure/);
interruptedEnding.adapter.failWrite = null;
const resumedEnding = await processDailyMoonRunStep(interruptedEnding.adapter, interruptedEnding.request);
assert.equal(resumedEnding.reason, 'daily_run_completed', 'saved final-room retry must complete instead of returning stale_daily_room');
assert.equal(interruptedEnding.adapter.database.prepare('SELECT current_room FROM telegram_pet_runs WHERE run_id=?').get(interruptedEnding.run.run_id).current_room, 10);
assert.equal(interruptedEnding.adapter.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_run_rooms WHERE run_id=? AND room_number>10').get(interruptedEnding.run.run_id).count, 0);

// A saved room result owns the next transition even when its score/death write
// failed. Extracting on retry cannot discard it or convert a death into a win.
for (const failed of [true, false]) {
  const f = await endingFixture(`extract-saved-room-${failed}`);
  f.adapter.database.prepare('DELETE FROM telegram_pet_run_rooms WHERE run_id=?').run(f.run.run_id);
  f.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=1,depth=1,score=25 WHERE run_id=?').run(f.run.run_id);
  const run = f.adapter.database.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(f.run.run_id);
  const room = await createPetRunRoom(f.adapter, run);
  await persistPetRunRoomOutcome(f.adapter, run, room, { success: !failed, score: failed ? 0 : 37, choice_id: room.choices[0].choice_id });
  const batch = f.adapter.batch.bind(f.adapter);
  if (failed) f.adapter.batch = async statements => {
    if (statements[0].sql.includes('UPDATE telegram_pet_runs SET status =')) throw Error('saved_room_terminal_offline');
    return batch(statements);
  };
  else f.adapter.failWrite = /UPDATE telegram_pet_runs SET current_room/;
  await assert.rejects(processDailyMoonRunStep(f.adapter, { telegram_id: f.owner, run_id: run.run_id, choice_key: room.choices[0].choice_id, expected_step_index: 1, now: f.now }), /saved_room_terminal_offline|injected_journey_write_failure/);
  f.adapter.batch = batch; f.adapter.failWrite = null;
  await extractDailyMoonRun(f.adapter, { telegram_id: f.owner, run_id: run.run_id, now: f.now });
  const ended = f.adapter.database.prepare('SELECT status,current_room,depth,score FROM telegram_pet_runs WHERE run_id=?').get(run.run_id);
  assert.equal(ended.status, failed ? 'failed' : 'extracted', 'extraction must honor the saved room outcome');
  assert.equal(ended.current_room, failed ? 1 : 2);
  assert.equal(ended.depth, failed ? 1 : 2);
  assert.equal(ended.score, failed ? 25 : 62, 'a resolved room keeps its score before extraction');
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='roguelite_completion'").get(f.owner).n, failed ? 0 : 1);
}

{
  const f = await endingFixture('extract-unadvanced-final-boss');
  const ended = await extractDailyMoonRun(f.adapter, { telegram_id: f.owner, run_id: f.run.run_id, now: f.now });
  assert.equal(ended.reason, 'daily_run_completed', 'a saved final victory must finish rather than become an early extraction');
  assert.equal(f.adapter.database.prepare('SELECT current_room FROM telegram_pet_runs WHERE run_id=?').get(f.run.run_id).current_room, 10);
  assert.equal(f.adapter.database.prepare('SELECT score FROM telegram_pet_runs WHERE run_id=?').get(f.run.run_id).score, 223);
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='roguelite_boss'").get(f.owner).n, 1);
  assert.equal(f.adapter.database.prepare("SELECT idempotency_key FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='roguelite_completion'").get(f.owner).idempotency_key, f.run.run_id);
}
for (const failed of [true, false]) {
  const f = await endingFixture(`extract-concurrent-room-${failed}`);
  f.adapter.database.prepare('DELETE FROM telegram_pet_run_rooms WHERE run_id=?').run(f.run.run_id);
  f.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=1,depth=1,score=25 WHERE run_id=?').run(f.run.run_id);
  const run = f.adapter.database.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(f.run.run_id);
  const room = await createPetRunRoom(f.adapter, run);
  const batch = f.adapter.batch.bind(f.adapter);
  let injected = false;
  f.adapter.batch = async statements => {
    if (!injected && statements[0].sql.includes('UPDATE telegram_pet_runs SET status =')) {
      injected = true;
      await persistPetRunRoomOutcome(f.adapter, run, room, { success: !failed, score: failed ? 0 : 37, choice_id: room.choices[0].choice_id });
    }
    return batch(statements);
  };
  const request = { telegram_id: f.owner, run_id: run.run_id, now: f.now };
  const result = await extractDailyMoonRun(f.adapter, request);
  assert.equal(injected, true);
  if (!failed) {
    assert.equal(result.reason, 'daily_run_room_settlement_pending', 'continued contention produces a bounded retry');
    assert.equal(result.refresh_state, true);
    assert.equal(f.adapter.database.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='roguelite_completion'").get(f.owner).n, 0);
    await extractDailyMoonRun(f.adapter, request);
  }
  const ended = f.adapter.database.prepare('SELECT status,current_room,score FROM telegram_pet_runs WHERE run_id=?').get(run.run_id);
  assert.equal(ended.status, failed ? 'failed' : 'extracted', 'the terminal transaction must recheck newly saved room evidence');
  assert.equal(ended.current_room, failed ? 1 : 2);
  assert.equal(ended.score, failed ? 25 : 62);
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='roguelite_completion'").get(f.owner).n, failed ? 0 : 1);
}

for (const legacy of [true, false]) {
  const f = await endingFixture(`extract-wins-room-race-${legacy}`);
  f.adapter.database.prepare('DELETE FROM telegram_pet_run_rooms WHERE run_id=?').run(f.run.run_id);
  f.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=1,depth=1,score=25 WHERE run_id=?').run(f.run.run_id);
  if (legacy) f.adapter.database.prepare('DELETE FROM telegram_pet_run_modifiers WHERE run_id=? AND modifier_id=?').run(f.run.run_id, DAILY_RUN_RULES_ID);
  const run = f.adapter.database.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(f.run.run_id);
  const room = await createPetRunRoom(f.adapter, run);
  let injected = false;
  f.adapter.beforeFirst = async sql => {
    if (injected || !sql.includes('UPDATE telegram_pet_run_rooms SET status =')) return;
    injected = true;
    const extracted = await extractDailyMoonRun(f.adapter, { telegram_id: f.owner, run_id: run.run_id, now: f.now });
    assert.equal(extracted.accepted, true);
  };
  await processDailyMoonRunStep(f.adapter, { telegram_id: f.owner, run_id: run.run_id, choice_key: room.choices[0].choice_id, expected_step_index: 1, now: f.now });
  assert.equal(injected, true);
  assert.equal(f.adapter.database.prepare('SELECT status FROM telegram_pet_run_rooms WHERE room_id=?').get(room.room_id).status, 'pending',
    'a room cannot resolve after extraction wins, including retained v1 Daily runs');
  assert.equal(f.adapter.database.prepare('SELECT COUNT(*) n FROM telegram_pet_run_rooms WHERE run_id=? AND room_number>2').get(run.run_id).n, 0);
  assert.equal(f.adapter.database.prepare('SELECT status FROM telegram_pet_runs WHERE run_id=?').get(run.run_id).status, 'extracted');
  assert.equal(f.adapter.database.prepare('SELECT score FROM telegram_pet_runs WHERE run_id=?').get(run.run_id).score, 25);
}

// Early extraction can commit before daily/weekly records. It is no longer an
// active run and has no final boss, so the final-boss recovery queue misses it.
{
  const f = await endingFixture('early-ending-records');
  f.adapter.database.prepare('DELETE FROM telegram_pet_run_rooms WHERE run_id=?').run(f.run.run_id);
  f.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=0,depth=0,score=0 WHERE run_id=?').run(f.run.run_id);
  const run = f.adapter.database.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(f.run.run_id);
  const room = await createPetRunRoom(f.adapter, run);
  await persistPetRunRoomOutcome(f.adapter, run, room, { success: true, score: 25, choice_id: room.choices[0].choice_id });
  f.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=1,depth=1,score=25 WHERE run_id=?').run(f.run.run_id);
  f.adapter.failWrite = /UPDATE telegram_pet_daily_runs SET status =/;
  await assert.rejects(dispatchRenderedPetAction(f.adapter, f.owner, { id: f.owner }, {
    action: 'run_extract', run_id: run.run_id,
  }, 'fixture-token'), /injected_journey_write_failure/);
  f.adapter.failWrite = null;
  assert.equal(f.adapter.database.prepare('SELECT status FROM telegram_pet_runs WHERE run_id=?').get(run.run_id).status, 'extracted');
  const wallet = f.adapter.database.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
  await __petMediaTestHooks.buildPetMiniAppState(f.adapter, f.owner, 'fixture-token');
  assert.equal(f.adapter.database.prepare('SELECT status FROM telegram_pet_daily_runs WHERE run_id=?').get(run.run_id).status, 'extracted',
    'refresh must settle early extraction records even though there is no final boss room');
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_daily_journey_objectives WHERE pet_id=? AND utc_day='2026-08-20' AND challenge_id='daily_extraction'").get(run.pet_id).n, 1);
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_weekly_journey_objectives WHERE pet_id=? AND objective_id='weekly_run'").get(run.pet_id).n, 1);
  await __petMediaTestHooks.buildPetMiniAppState(f.adapter, f.owner, 'fixture-token');
  assert.deepEqual(f.adapter.database.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner), wallet);
  const records = f.adapter.database.prepare('SELECT runs_recorded,extraction_successes,boss_completions FROM telegram_pet_daily_leaderboard_records WHERE telegram_id=?').get(f.owner);
  assert.deepEqual({ ...records }, { runs_recorded: 1, extraction_successes: 1, boss_completions: 0 });
  assert.equal(f.adapter.database.prepare('SELECT COUNT(*) AS n FROM telegram_pet_specialist_events WHERE telegram_id=?').get(f.owner).n, 1);
  assert.equal(f.adapter.database.prepare('SELECT adventure_xp FROM telegram_pet_specialist_progression WHERE pet_id=?').get(run.pet_id).adventure_xp, 24,
    'refresh repairs the saved extraction award once after terminal synchronization failed');
}

// A terminal commit can precede both identity and the canonical completion
// receipt. Refresh must repair that source before sealing early Daily records.
for (const sealedRecords of [false, true]) {
  const f = await endingFixture(`early-extraction-before-receipt-${sealedRecords}`);
  f.adapter.database.prepare('DELETE FROM telegram_pet_run_rooms WHERE run_id=?').run(f.run.run_id);
  f.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=0,depth=0,score=0 WHERE run_id=?').run(f.run.run_id);
  const run = f.adapter.database.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(f.run.run_id);
  const room = await createPetRunRoom(f.adapter, run);
  await persistPetRunRoomOutcome(f.adapter, run, room, { success: true, score: 25, choice_id: room.choices[0].choice_id });
  f.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=1,depth=1,score=25 WHERE run_id=?').run(f.run.run_id);
  f.adapter.failFirst = /SELECT 1 AS corrupt FROM telegram_pet_personality_traits/;
  await assert.rejects(extractDailyMoonRun(f.adapter, { telegram_id: f.owner, run_id: run.run_id, now: f.now }), /moonpet_identity_authority_tuple_mismatch/);
  f.adapter.failFirst = null;
  assert.equal(f.adapter.database.prepare('SELECT status FROM telegram_pet_runs WHERE run_id=?').get(run.run_id).status, 'extracted');
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='roguelite_completion'").get(f.owner).n, 0);
  if (sealedRecords) {
    // Previous refreshes finalized Daily records and accepted the source event
    // without retrying extraction, hiding this run from every later refresh.
    await syncDailyMoonRun(f.adapter, { telegram_id: f.owner, run_id: run.run_id, now: f.now });
    f.adapter.database.prepare(`INSERT INTO telegram_pet_events
      (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status)
      VALUES (?,?,?,'daily_moon_run',?,?,'2026-08-20','2026-W34','accepted')`)
      .run(`old-terminal-${f.owner}`,run.pet_id,f.owner,`daily-moon-run:${f.owner}:${run.run_id}:extracted`,run.season_key);
  }
  const otherPet = `${run.pet_id}-other`;
  seedAdditionalPet(f.adapter, f.owner, otherPet);
  f.adapter.database.prepare('UPDATE telegram_pet_active_slots SET pet_id=? WHERE telegram_id=?').run(otherPet, f.owner);
  await __petMediaTestHooks.buildPetMiniAppState(f.adapter, f.owner, 'fixture-token');
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_reward_claims WHERE telegram_id=? AND pet_id=? AND source='roguelite_completion' AND idempotency_key=? AND status='awarded'").get(f.owner, run.pet_id, `${run.run_id}:extract`).n, 1,
    'early terminal recovery must restore the completion receipt required by safe deletion');
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_identity_events WHERE pet_id=? AND event_key=?").get(run.pet_id, `${run.run_id}:terminal:memory`).n, 1);
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_identity_events WHERE pet_id=? AND event_key=?").get(otherPet, `${run.run_id}:terminal:memory`).n, 0);
  assert.equal(f.adapter.database.prepare('SELECT status FROM telegram_pet_daily_runs WHERE run_id=?').get(run.run_id).status, 'extracted');
  const wallet = f.adapter.database.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
  await __petMediaTestHooks.buildPetMiniAppState(f.adapter, f.owner, 'fixture-token');
  assert.deepEqual(f.adapter.database.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner), wallet);
  assert.equal(f.adapter.database.prepare('SELECT runs_recorded FROM telegram_pet_daily_leaderboard_records WHERE telegram_id=?').get(f.owner).runs_recorded, 1);
}

// Exercise both sides of each non-atomic boundary, then recover through the
// actual state route after switching pets. Persisted evidence owns all credit.
for (const status of ['failed', 'abandoned']) for (const sourceOwned of [true, false]) {
  const f = await endingFixture(`early-${status}-${sourceOwned}`);
  f.adapter.database.prepare('DELETE FROM telegram_pet_run_rooms WHERE run_id=?').run(f.run.run_id);
  f.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=0,depth=0,score=0 WHERE run_id=?').run(f.run.run_id);
  const run = f.adapter.database.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(f.run.run_id);
  const room = await createPetRunRoom(f.adapter, run);
  await persistPetRunRoomOutcome(f.adapter, run, room, { success: true, score: 25, choice_id: room.choices[0].choice_id });
  f.adapter.database.prepare('UPDATE telegram_pet_runs SET status=?,current_room=1,depth=1,score=25 WHERE run_id=?').run(status,run.run_id);
  if (!sourceOwned) f.adapter.database.prepare('UPDATE telegram_pet_run_rooms SET pet_id=NULL WHERE run_id=?').run(run.run_id);
  await __petMediaTestHooks.getPetProfile(f.adapter, f.owner); // complete the independent wallet migration before the baseline
  const claims = f.adapter.database.prepare('SELECT * FROM telegram_pet_reward_claims WHERE telegram_id=? ORDER BY claim_id').all(f.owner);
  await __petMediaTestHooks.buildPetMiniAppState(f.adapter, f.owner, 'fixture-token');
  assert.equal(f.adapter.database.prepare('SELECT status FROM telegram_pet_daily_runs WHERE run_id=?').get(run.run_id).status, sourceOwned ? status : 'active');
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_weekly_journey_objectives WHERE pet_id=? AND objective_id='weekly_run'").get(run.pet_id).n, 0,
    'failed or abandoned runs do not become successful weekly finishes');
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_daily_journey_objectives WHERE pet_id=? AND challenge_id IN ('daily_extraction','daily_boss')").get(run.pet_id).n, 0);
  assert.deepEqual(f.adapter.database.prepare('SELECT * FROM telegram_pet_reward_claims WHERE telegram_id=? ORDER BY claim_id').all(f.owner), claims);
}

for (const fault of ['reward', 'win', 'terminal', 'sync', 'rejected', 'legacy-completed', 'legacy-extracted']) {
  const f = await endingFixture('ending-' + fault);
  const originalBatch = f.adapter.batch.bind(f.adapter);
  let blocked = true;
  f.adapter.batch = async (statements) => {
    if (blocked && statements[0].args.includes('roguelite_boss') && ['reward', 'rejected', 'legacy-completed', 'legacy-extracted'].includes(fault)) {
      if (fault === 'rejected') return statements.map(() => ({ results: [], meta: { changes: 0 } }));
      throw new Error('injected_ending_batch_failure');
    }
    if (blocked && fault === 'terminal' && statements[0].sql.includes('UPDATE telegram_pet_runs SET status =')) throw new Error('injected_ending_batch_failure');
    return originalBatch(statements);
  };
  f.adapter.failEndingWrite = (sql, args) => blocked && (
    fault === 'win' && sql.includes('INSERT OR IGNORE INTO telegram_pet_run_analytics') && args.some((value) => String(value).endsWith(':alley_king:win'))
    || fault === 'sync' && sql.includes('UPDATE telegram_pet_daily_runs SET status ='));
  if (fault === 'rejected') {
    const rejected = await processDailyMoonRunStep(f.adapter, f.request);
    assert.equal(rejected.reason, 'daily_boss_reward_pending');
    assert.equal(f.adapter.database.prepare('SELECT status FROM telegram_pet_runs WHERE run_id=?').get(f.run.run_id).status, 'active');
  } else await assert.rejects(processDailyMoonRunStep(f.adapter, f.request), /injected_ending/);
  const pending = await __petMediaTestHooks.buildPetMiniAppState(f.adapter, f.owner, 'fixture-token');
  if (!['sync'].includes(fault)) {
    assert.equal(pending.run.settlement_pending, true);
    assert.deepEqual(pending.run.choices, [], 'a won ending cannot offer another boss choice');
  }
  blocked = false;
  if (fault.startsWith('legacy-')) {
    f.adapter.database.prepare("UPDATE telegram_pet_runs SET status=?, completed_at='2026-08-20 12:30:00' WHERE run_id=?").run(fault.slice(7),f.run.run_id);
    await syncDailyMoonRun(f.adapter, f.request); // old code finalized these records without a paid boss win
  }
  seedAdditionalPet(f.adapter, f.owner, 'other-' + f.owner);
  f.adapter.database.prepare('UPDATE telegram_pet_active_slots SET pet_id=? WHERE telegram_id=?').run('other-' + f.owner, f.owner);
  const before = f.adapter.database.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('other-' + f.owner);
  if (fault === 'rejected') {
    const finished = await dispatchRenderedPetAction(f.adapter, f.owner, { id: f.owner }, { action: 'run_extract', run_id: f.run.run_id }, 'fixture-token');
    assert.equal(finished.reason, 'daily_run_completed', 'Finish Saved Daily Run must preserve a completed boss ending');
  }
  await __petMediaTestHooks.buildPetMiniAppState(f.adapter, f.owner, 'fixture-token');
  const settled = f.adapter.database.prepare('SELECT status,current_room,score FROM telegram_pet_runs WHERE run_id=?').get(f.run.run_id);
  assert.equal(settled.status, fault === 'legacy-extracted' ? 'extracted' : 'completed');
  assert.equal(settled.current_room, 10); assert.equal(settled.score, 223, 'recovery cannot add final-room score again');
  assert.equal(f.adapter.database.prepare('SELECT boss_defeated FROM telegram_pet_daily_runs WHERE run_id=?').get(f.run.run_id).boss_defeated, 1);
  assert.equal(f.adapter.database.prepare('SELECT boss_completions,runs_recorded FROM telegram_pet_daily_leaderboard_records WHERE telegram_id=?').get(f.owner).boss_completions, 1);
  assert.equal(f.adapter.database.prepare('SELECT boss_records FROM telegram_pet_seasonal_challenge_state WHERE telegram_id=? AND season_id=?').get(f.owner, f.run.season_key).boss_records, 1);
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS n FROM telegram_pet_seasonal_achievements WHERE telegram_id=? AND achievement_id='daily_boss_victory'").get(f.owner).n, 1);

  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_daily_journey_objectives WHERE pet_id=? AND utc_day='2026-08-20' AND challenge_id='daily_boss' AND status='accepted'").get(f.run.pet_id).count, 1);
  const evidence = f.adapter.database.prepare("SELECT pet_id,season_key,day_key FROM telegram_pet_events WHERE telegram_id=? AND event_type='daily_moon_run'").get(f.owner);
  assert.equal(evidence.pet_id, f.run.pet_id); assert.equal(evidence.season_key, f.run.season_key); assert.equal(evidence.day_key, '2026-08-20');
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_weekly_journey_objectives WHERE pet_id=? AND objective_id='weekly_run' AND status='accepted'").get(f.run.pet_id).count, 1);
  assert.deepEqual(f.adapter.database.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('other-' + f.owner), before);
  const receipt = f.adapter.database.prepare("SELECT * FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='roguelite_boss'").get(f.owner);
  assert.ok(receipt && receipt.status === 'awarded');
  const win = JSON.parse(f.adapter.database.prepare("SELECT event_data FROM telegram_pet_run_analytics WHERE analytics_id=?").get(`${f.run.run_id}:boss:${f.room.room_id}:alley_king:win`).event_data);
  assert.deepEqual(win.rewards, JSON.parse(receipt.applied_rewards), 'recovered boss analytics use the durable awarded payload');
  const wallet = f.adapter.database.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
  await Promise.all([__petMediaTestHooks.buildPetMiniAppState(f.adapter, f.owner, 'fixture-token'), __petMediaTestHooks.buildPetMiniAppState(f.adapter, f.owner, 'fixture-token')]);
  assert.deepEqual(f.adapter.database.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner), wallet);
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='roguelite_boss'").get(f.owner).count, 1);
  assert.equal(f.adapter.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_run_rooms WHERE run_id=? AND room_number>10').get(f.run.run_id).count, 0);
  await Promise.all([syncDailyMoonRun(f.adapter, f.request), syncDailyMoonRun(f.adapter, f.request)]);
  const finalRecords = f.adapter.database.prepare('SELECT boss_completions,runs_recorded FROM telegram_pet_daily_leaderboard_records WHERE telegram_id=?').get(f.owner);
  assert.equal(finalRecords.boss_completions, 1); assert.equal(finalRecords.runs_recorded, 1);
  assert.equal(f.adapter.database.prepare('SELECT boss_records FROM telegram_pet_seasonal_challenge_state WHERE telegram_id=? AND season_id=?').get(f.owner, f.run.season_key).boss_records, 1);

}

// Even after the old terminal event and recovered win exist, an interrupted
// aggregate repair must remain in the refresh queue until its ledger is true.
const repairEnding = await endingFixture('ending-record-retry');
repairEnding.adapter.database.prepare("UPDATE telegram_pet_runs SET current_room=10,depth=10,score=223,status='completed' WHERE run_id=?").run(repairEnding.run.run_id);
await syncDailyMoonRun(repairEnding.adapter, repairEnding.request);
repairEnding.adapter.database.prepare(`INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status)
  VALUES ('old-ending-event',?,?,'daily_moon_run',?,?,'2026-08-20','2026-W34','accepted')`)
  .run(repairEnding.run.pet_id,repairEnding.owner,`daily-moon-run:${repairEnding.owner}:${repairEnding.run.run_id}:completed`,repairEnding.run.season_key);
const repairBatch = repairEnding.adapter.batch.bind(repairEnding.adapter);
repairEnding.adapter.batch = async (statements) => {
  if (statements.some((statement) => statement.sql.includes('SET boss_completions=boss_completions+1'))) throw Error('interrupted_boss_record_repair');
  return repairBatch(statements);
};
await assert.rejects(recoverDailyMoonRunEnding(repairEnding.adapter, repairEnding.request), /interrupted_boss_record_repair/);
repairEnding.adapter.batch = repairBatch;
await __petMediaTestHooks.buildPetMiniAppState(repairEnding.adapter, repairEnding.owner, 'fixture-token');
assert.equal(repairEnding.adapter.database.prepare('SELECT boss_completions FROM telegram_pet_daily_leaderboard_records WHERE telegram_id=?').get(repairEnding.owner).boss_completions,1);
assert.equal(repairEnding.adapter.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE source='roguelite_boss'").get().count,1);

// Ending recovery requires the persisted owner, pet, season and won boss room.
for (const invalid of ['owner', 'pet', 'season', 'failed', 'boss']) {
  const f = await endingFixture('invalid-ending-' + invalid);
  f.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=10,depth=10,score=223 WHERE run_id=?').run(f.run.run_id);
  if (invalid === 'pet') f.adapter.database.prepare('UPDATE telegram_pet_run_rooms SET pet_id=NULL WHERE room_id=?').run(f.room.room_id);
  if (invalid === 'season') f.adapter.database.prepare("UPDATE telegram_pet_runs SET season_key='pet-s2026-001' WHERE run_id=?").run(f.run.run_id);
  if (invalid === 'failed') f.adapter.database.prepare("UPDATE telegram_pet_run_rooms SET status='failed',outcome_data=? WHERE room_id=?").run(JSON.stringify({success:false}),f.room.room_id);
  if (invalid === 'boss') f.adapter.database.prepare("UPDATE telegram_pet_run_rooms SET generated_data=json_set(generated_data,'$.boss_id','missing-boss') WHERE room_id=?").run(f.room.room_id);
  assert.equal(await recoverDailyMoonRunEnding(f.adapter, { ...f.request, telegram_id: invalid === 'owner' ? 'another-owner' : f.owner }), null);
  assert.equal(f.adapter.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE source='roguelite_boss'").get().count, 0);
}
// Five older source-less endings cannot consume the recovery budget ahead of
// the sixth valid ending. Refresh must inspect source-backed candidates first.
const queueEnding = await endingFixture('ending-queue');
queueEnding.adapter.database.prepare('UPDATE telegram_pet_runs SET current_room=10,depth=10,score=223 WHERE run_id=?').run(queueEnding.run.run_id);
for (let index = 1; index <= 5; index++) {
  const runId = 'invalid-old-ending-' + index;
  queueEnding.adapter.database.prepare(`INSERT INTO telegram_pet_runs (id,run_id,telegram_id,pet_id,season_key,status,current_room,max_room,depth,score)
    VALUES (?,?,?,?,?,'completed',10,10,10,223)`).run(runId,runId,queueEnding.owner,queueEnding.run.pet_id,queueEnding.run.season_key);
  queueEnding.adapter.database.prepare(`INSERT INTO telegram_pet_daily_runs (telegram_id,pet_id,utc_day,seed,run_id,status) VALUES (?,?,?,?,?,'active')`)
    .run(queueEnding.owner,queueEnding.run.pet_id,'2026-08-0'+index,'old-seed',runId);
  queueEnding.adapter.database.prepare(`INSERT INTO telegram_pet_run_rooms (room_id,run_id,telegram_id,room_number,room_type,status,generated_data,outcome_data)
    VALUES (?,?,?,10,'boss','resolved',?,?)`).run(runId+':10',runId,queueEnding.owner,JSON.stringify({boss_id:'alley_king'}),JSON.stringify({success:true}));
}
await __petMediaTestHooks.buildPetMiniAppState(queueEnding.adapter, queueEnding.owner, 'fixture-token');
assert.equal(queueEnding.adapter.database.prepare('SELECT status FROM telegram_pet_runs WHERE run_id=?').get(queueEnding.run.run_id).status,'completed');
assert.equal(queueEnding.adapter.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE source='roguelite_boss'").get().count, 1);

// A permanently failing oldest source must not monopolize either one-record
// state queue. Test the real state path and fresh D1 wrappers between requests.
for (const kind of ['endings', 'records']) {
  const owner = `daily-fair-${kind}`;
  const sources = [];
  let adapter;
  for (let index = 0; index < 3; index++) {
    const f = await endingFixture(owner, { adapter, now: new Date(`2026-08-${20 + index}T12:00:00Z`) });
    adapter = f.adapter;
    if (kind === 'endings') {
      adapter.database.prepare("UPDATE telegram_pet_runs SET status='completed',current_room=10,depth=10,score=223 WHERE run_id=?").run(f.run.run_id);
    } else {
      adapter.database.prepare('DELETE FROM telegram_pet_run_rooms WHERE run_id=?').run(f.run.run_id);
      const run = { ...f.run, current_room: 0, depth: 0 };
      const room = await createPetRunRoom(adapter, run);
      await persistPetRunRoomOutcome(adapter, run, room, { success: true, score: 25, choice_id: room.choices[0].choice_id });
      adapter.database.prepare("UPDATE telegram_pet_runs SET status='abandoned',current_room=1,depth=1,score=25 WHERE run_id=?").run(f.run.run_id);
    }
    sources.push(f);
  }
  seedPlayer(adapter, `other-${owner}`);
  adapter.database.prepare("INSERT INTO telegram_pet_recovery_cursors (telegram_id,setting_key,setting_value) VALUES (?,?,'untouched')")
    .run(`other-${owner}`, `moonpet:daily-recovery:${kind}`);
  const blocked = new Set(sources.slice(0, 2).map(f => f.run.run_id));
  const attempts = [];
  const failSource = (sql, args) => {
    const isAttempt = kind === 'endings'
      ? sql.includes("'boss_fought'") && String(args[0]).endsWith(':attempt')
      : sql.includes('UPDATE telegram_pet_daily_runs SET status =');
    if (!isAttempt) return false;
    const runId = sources.find(f => args.includes(f.run.run_id))?.run.run_id;
    if (runId) attempts.push(runId);
    return blocked.has(runId);
  };
  adapter.failEndingWrite = failSource;
  const recover = () => __petMediaTestHooks.buildPetMiniAppState(adapter, owner, 'fixture-token');
  for (let pass = 0; pass < 3; pass++) {
    attempts.length = 0;
    await recover();
    assert.deepEqual(attempts, [sources[pass].run.run_id], `${kind}: later runs must get a turn while older sources keep failing`);
    // A fresh D1 wrapper has no request-local retry history to help it.
    adapter = Object.assign(Object.create(D1.prototype), { database: adapter.database, queue: Promise.resolve(), failEndingWrite: failSource });
  }
  assert.equal(adapter.database.prepare('SELECT status FROM telegram_pet_daily_runs WHERE run_id=?').get(sources[2].run.run_id).status,
    kind === 'endings' ? 'completed' : 'abandoned');
  assert.equal(adapter.database.prepare('SELECT runs_recorded FROM telegram_pet_daily_leaderboard_records WHERE telegram_id=?').get(owner).runs_recorded, 1);
  // Wrap around and retain failed sources; the cursor is not a success marker.
  // Force overlapping requests to select the same old cursor. Only one may
  // advance it and attempt settlement; the stale request must yield.
  let selected = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  adapter.afterAll = async sql => {
    if (!sql.includes(`cursor.setting_key='moonpet:daily-recovery:${kind}'`)) return;
    if (++selected === 2) release();
    await barrier;
  };
  attempts.length = 0;
  await Promise.all([recover(), recover()]);
  adapter.afterAll = null;
  assert.deepEqual(attempts, [sources[0].run.run_id]);
  assert.equal(adapter.database.prepare('SELECT status FROM telegram_pet_daily_runs WHERE run_id=?').get(sources[0].run.run_id).status, 'active');
  blocked.clear();
  await recover();
  await recover();
  assert.equal(adapter.database.prepare('SELECT runs_recorded FROM telegram_pet_daily_leaderboard_records WHERE telegram_id=?').get(owner).runs_recorded, 3);
  const receipts = adapter.database.prepare('SELECT * FROM telegram_pet_reward_claims WHERE telegram_id=? ORDER BY claim_id').all(owner);
  const xp = adapter.database.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE telegram_id=?').get(owner);
  const cursors = adapter.database.prepare('SELECT * FROM telegram_pet_recovery_cursors ORDER BY telegram_id,setting_key').all();
  attempts.length = 0;
  await Promise.all([recover(), recover()]);
  assert.deepEqual(attempts, []);
  assert.deepEqual(adapter.database.prepare('SELECT * FROM telegram_pet_reward_claims WHERE telegram_id=? ORDER BY claim_id').all(owner), receipts);
  assert.deepEqual(adapter.database.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE telegram_id=?').get(owner), xp);
  assert.deepEqual(adapter.database.prepare('SELECT * FROM telegram_pet_recovery_cursors ORDER BY telegram_id,setting_key').all(), cursors, 'empty queues do not write cursors');
  assert.equal(adapter.database.prepare('SELECT setting_value FROM telegram_pet_recovery_cursors WHERE telegram_id=?').get(`other-${owner}`).setting_value, 'untouched');
}

mock.timers.reset();
console.log('Telegram Pets Daily Moon Run tests passed (10,000-run economy simulation; versioned tactics, risk/score previews, concurrent outcome authority and fair recovery included).');
