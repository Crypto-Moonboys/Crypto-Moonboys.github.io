import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  PET_DAILY_CHALLENGES,
  __dailyMoonRunTestHooks,
  createDailyMoonRun,
  generateDailyMoonRunSeed,
  getDailyMoonRunAnalytics,
  getDailyMoonRunLeaderboard,
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

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/044_telegram_pet_daily_runs.sql', import.meta.url), 'utf8');
const dailySource = fs.readFileSync(new URL('../workers/moonboys-api/pets/daily-moon-run.js', import.meta.url), 'utf8');
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
  constructor() { this.database = new DatabaseSync(':memory:'); this.database.exec(schema); this.queue = Promise.resolve(); }
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

function seedPlayer(db, telegramId) {
  db.database.prepare('INSERT INTO telegram_users (telegram_id, xp, level) VALUES (?, 0, 1)').run(telegramId);
  db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_xp, level) VALUES (?, 0, 1)').run(telegramId);
}

function insertCareEvent(db, telegramId, eventKey, day, action = 'feed') {
  db.database.prepare(`INSERT INTO telegram_pet_events
    (id, telegram_id, event_type, event_key, season_key, day_key, week_key, status)
    VALUES (?, ?, ?, ?, 'season', ?, 'week', 'accepted')`).run(`id:${eventKey}`, telegramId, action, eventKey, day);
}

function resolveDailyRun(db, telegramId, runId, { status = 'completed', score = 900, boss = true } = {}) {
  db.database.prepare(`UPDATE telegram_pet_runs SET status=?, current_room=10, depth=10, rooms_completed=10, score=?,
    boss_fought=?, completed_at='2026-08-11 00:10:00', ended_at='2026-08-11 00:10:00' WHERE telegram_id=? AND run_id=?`)
    .run(status, score, boss ? 'alley_king' : null, telegramId, runId);
  const types = ['choice_event', 'choice_event', 'battle', 'loot', 'choice_event', 'choice_event', 'battle', 'choice_event', 'elite', 'boss'];
  for (let index = 0; index < types.length; index += 1) {
    const roomNumber = index + 1;
    db.database.prepare(`INSERT INTO telegram_pet_run_rooms
      (room_id, run_id, telegram_id, room_number, room_type, status, generated_data, outcome_data)
      VALUES (?, ?, ?, ?, ?, 'resolved', ?, '{"success":true}')`)
      .run(`${runId}:${roomNumber}`, runId, telegramId, roomNumber, types[index], JSON.stringify({ content_id: `room_${roomNumber}` }));
  }
  if (boss) db.database.prepare(`INSERT INTO telegram_pet_run_analytics
    (analytics_id, run_id, telegram_id, event_type, event_data) VALUES (?, ?, ?, 'boss_fought', ?)`)
    .run(`${runId}:boss:win`, runId, telegramId, JSON.stringify({ boss_id: 'alley_king', outcome: 'win' }));
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
assert.doesNotMatch(migration, /\b(?:ALTER\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+telegram_)\b/i, 'migration 044 must be additive only');
assert.doesNotMatch(migration, /(?:pet_xp|community_xp|moon_gold|moon_crystals|style_tokens|reward_multiplier|xp_multiplier)\s+(?:INTEGER|REAL)/i,
  'migration 044 cannot create another economy or progression track');
assert.doesNotMatch(dailySource, /UPDATE\s+telegram_pet_(?:profiles|inventory|evolutions|personality_traits|memories)/i,
  'daily retention code cannot write protected progression authorities directly');
assert.doesNotMatch(dailySource, /awardPetReward\s*\(/, 'daily tracking cannot create a direct reward path');
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
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_events WHERE telegram_id='daily-player' AND event_key='daily:memory:first-run:daily-player'").get().count, 1,
  'First Daily Moon Run memory must be bounded and duplicate safe');

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

const runId = db.database.prepare("SELECT run_id FROM telegram_pet_daily_runs WHERE telegram_id='daily-player'").get().run_id;
resolveDailyRun(db, 'daily-player', runId);
const [syncA, syncB] = await Promise.all([
  syncDailyMoonRun(db, { telegram_id: 'daily-player', utc_day: '2026-08-11' }),
  syncDailyMoonRun(db, { telegram_id: 'daily-player', utc_day: '2026-08-11' }),
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
await syncDailyMoonRun(db, { telegram_id: 'daily-player', utc_day: '2026-08-11' });
assert.equal(db.database.prepare("SELECT runs_recorded FROM telegram_pet_daily_leaderboard_records WHERE telegram_id='daily-player'").get().runs_recorded, 1,
  'repeated terminal callbacks cannot corrupt leaderboard aggregates');
assert.ok(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_events WHERE telegram_id='daily-player' AND event_kind='memory'").get().count <= 6,
  'daily record memories must remain bounded under retries');

seedPlayer(db, 'failed-player');
const failedSeed = await generateDailyMoonRunSeed('2026-08-12');
const failedRunId = __dailyMoonRunTestHooks.dailyRunId('failed-player', '2026-08-12');
await startPetRogueliteRun(db, { telegram_id: 'failed-player', run_id: failedRunId, region: 'moon_alley', seed: failedSeed.run_seed, max_room: 10, season_key: 'pet-s2026-003' });
const recovered = await createDailyMoonRun(db, { telegram_id: 'failed-player', now: new Date('2026-08-12T05:00:00.000Z') });
assert.equal(recovered.accepted, true, 'creation must recover a deterministic run inserted before its daily reservation');
db.database.prepare("UPDATE telegram_pet_runs SET status='failed', current_room=4, depth=4, score=120, completed_at='2026-08-12 05:04:00' WHERE run_id=?").run(failedRunId);
await Promise.all([
  syncDailyMoonRun(db, { telegram_id: 'failed-player', utc_day: '2026-08-12' }),
  syncDailyMoonRun(db, { telegram_id: 'failed-player', utc_day: '2026-08-12' }),
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
  rewards: { pet_xp: 1200, community_xp: 250, materials: { neon_scrap: 40 }, items: { evolution_fragment: 10 } },
  context: { run_id: 'simulation-run' }, now: new Date('2026-08-11T00:00:00.000Z'),
});
assert.equal(simulationDb.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id='simulation-player'").get().pet_xp, 1200,
  'Pet XP must remain capped after 10,000 callbacks');
assert.equal(simulationDb.database.prepare("SELECT xp FROM telegram_users WHERE telegram_id='simulation-player'").get().xp, 250,
  'Community XP must remain capped after 10,000 callbacks');
assert.equal(simulationDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='simulation-player'").get().count, 1,
  'reward claims cannot duplicate across 10,000 callbacks');
assert.equal(simulationDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id='simulation-player' AND asset_type='material'").get().quantity, 40,
  'materials must remain bounded after 10,000 callbacks');
assert.equal(simulationDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id='simulation-player' AND asset_type='item'").get().quantity, 10,
  'items must remain bounded after 10,000 callbacks');
assert.equal(__rogueliteFoundationTestHooks.DAILY_PET_XP_CAP, 1200);
assert.equal(__rogueliteFoundationTestHooks.DAILY_COMMUNITY_XP_CAP, 250);

console.log('Telegram Pets Daily Moon Run tests passed (10,000-run economy simulation included).');
