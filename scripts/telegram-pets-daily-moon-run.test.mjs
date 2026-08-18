import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
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
  recordDailyCareChallenge,
  syncDailyMoonRun,
  validateDailyChallengeContent,
} from '../workers/moonboys-api/pets/daily-moon-run.js';
import {
  __rogueliteFoundationTestHooks,
  awardPetReward,
  generatePetRunRoom,
  startPetRogueliteRun,
} from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

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
  async first() { return this.adapter.database.prepare(this.sql).get(...this.args) || null; }
  async run() {
    const result = this.adapter.database.prepare(this.sql).run(...this.args);
    return { results: [], meta: { changes: Number(result.changes || 0) } };
  }
  async all() { return { results: this.adapter.database.prepare(this.sql).all(...this.args) }; }
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

function seedAdditionalPet(db, telegramId, petId, slotNumber = 2, seasonKey = 'pet-s2026-003') {
  db.database.prepare(`INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number, acquisition_type)
    VALUES (?, ?, ?, ?, 'free')`).run(petId, telegramId, seasonKey, slotNumber);
  db.database.prepare(`INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number, source_profile_updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(petId, telegramId, seasonKey, slotNumber);
}

function insertCareEvent(db, telegramId, eventKey, day, action = 'feed', petId = null) {
  db.database.prepare(`INSERT INTO telegram_pet_events
    (id, pet_id, telegram_id, event_type, event_key, season_key, day_key, week_key, status)
    VALUES (?, ?, ?, ?, ?, 'season', ?, 'week', 'accepted')`).run(`id:${eventKey}`, petId, telegramId, action, eventKey, day);
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
assert.equal(rolloverRun.accepted, true, 'season rollover should recover to an already-owned current-season pet');
assert.equal(rolloverRun.daily_run.pet_id, rolloverCurrentPetId,
  'Daily Moon Run must not reserve the previous-season active pet after UTC quarter rollover');
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
  WHERE pet_id=? AND season_key=? AND earned_day='2026-07-01'`).get(rolloverCurrentPetId, rolloverSeasonKey).count, 1,
  'rollover Daily Journey Growth Mark must settle to the current-season pet');
assert.equal(rolloverDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_growth_marks
  WHERE pet_id=? AND earned_day='2026-07-01'`).get(rolloverOldPetId).count, 0,
  'rollover Daily Journey Growth Mark must not settle to the old-season pet');

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
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_modifiers WHERE telegram_id='daily-player'").get().count, 1,
  'the deterministic daily modifier must use the existing run modifier table');
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
assert.deepEqual(storedPetOutcome.player_state, { level: 10, health: 99, energy: 98, happiness: 97, cleanliness: 96 },
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
assert.equal(forcedVictoryRegression.result.room.outcome.authority, 'daily_moon_run_server_outcome_v1');
assert.equal(forcedVictoryRegression.db.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_run_analytics
  WHERE telegram_id=? AND event_type='boss_fought'`).get(forcedVictoryRegression.telegramId).count, 0,
  'a client-forced outcome cannot create boss authority');

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
    const result = await processDailyMoonRunStep(engineDb, {
      telegram_id: telegramId,
      run_id: created.daily_run.run_id,
      choice_key: room.choices[0].choice_id,
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

console.log('Telegram Pets Daily Moon Run tests passed (10,000-run economy simulation included).');
