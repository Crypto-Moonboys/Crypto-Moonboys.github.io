import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration047 = fs.readFileSync(
  new URL('../workers/moonboys-api/migrations/047_fix_telegram_leaderboard_reward_constraint.sql', import.meta.url),
  'utf8',
);
const schemaWithoutLeaderboardUnique = schema.replace(
  /CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_leaderboard_unique_user_season\s+ON telegram_leaderboard\s*\(telegram_id, season_id\);\s*/i,
  '',
);
const { awardPetReward, processPetJob, processPetRandomEvent } = __petMediaTestHooks;
const conflictMismatch = /ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint/;

assert.notEqual(schemaWithoutLeaderboardUnique, schema, 'the production-like fixture must remove the canonical leaderboard unique index');
assert.doesNotMatch(schemaWithoutLeaderboardUnique, /idx_telegram_leaderboard_unique_user_season/i);
const migrationStatements = migration047
  .split(';')
  .map((statement) => statement.replace(/--.*$/gm, '').trim())
  .filter(Boolean);
assert.equal(migrationStatements.length, 1, 'migration 047 must contain only the leaderboard unique index');
assert.match(
  migrationStatements[0],
  /^CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_leaderboard_unique_user_season\s+ON telegram_leaderboard\s*\(telegram_id, season_id\)$/i,
);
assert.doesNotMatch(migrationStatements[0], /\b(?:ALTER|DROP|DELETE|UPDATE|INSERT)\b/i, 'migration 047 must not rewrite player data');
assert.doesNotMatch(migration047, /d1_migrations/i, 'migration 047 must leave migration bookkeeping to Wrangler');

class Statement {
  constructor(adapter, sql, args = []) { this.adapter = adapter; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.adapter, this.sql, args); }
  async first() { return this.adapter.database.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.adapter.database.prepare(this.sql).all(...this.args) }; }
  async run() {
    const result = this.adapter.database.prepare(this.sql).run(...this.args);
    return { results: [], meta: { changes: Number(result.changes || 0) } };
  }
}

class D1 {
  constructor({ leaderboardUnique = false } = {}) {
    this.database = new DatabaseSync(':memory:');
    this.database.exec(leaderboardUnique ? schema : schemaWithoutLeaderboardUnique);
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

function seedPlayer(db, telegramId) {
  const petId = `pet:${telegramId}:pet-s2026-003:1`;
  db.database.prepare('INSERT INTO telegram_users (telegram_id, xp, level) VALUES (?, 0, 1)').run(telegramId);
  db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_xp, level) VALUES (?, 0, 1)').run(telegramId);
  db.database.prepare(`INSERT INTO telegram_pet_season_slots
    (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
    VALUES (?, ?, 'pet-s2026-003', 1, 'free', 'profile_insert', 0, 'active')`).run(petId, telegramId);
  db.database.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key)
    VALUES (?, ?, 'pet-s2026-003')`).run(telegramId, petId);
  db.database.prepare(`INSERT INTO telegram_pet_instances
    (pet_id, telegram_id, season_key, slot_number, pet_xp, level, source_profile_updated_at, status)
    VALUES (?, ?, 'pet-s2026-003', 1, 0, 1, 'fixture', 'active')`).run(petId, telegramId);
}

function seedSeason(db) {
  db.database.prepare("INSERT INTO telegram_seasons (name, start_date, end_date, is_active) VALUES ('Live reward regression', '2026-01-01', '2027-01-01', 1)").run();
}

function scalar(db, sql, ...args) {
  return Number(db.database.prepare(sql).get(...args)?.value || 0);
}

// A dirty production database must fail closed. Migration 047 never deletes or
// merges duplicate player rows to make its precondition pass.
{
  const duplicateDb = new DatabaseSync(':memory:');
  duplicateDb.exec(`
    CREATE TABLE telegram_leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      season_id INTEGER NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO telegram_leaderboard (telegram_id, season_id, xp) VALUES ('duplicate-player', 1, 10);
    INSERT INTO telegram_leaderboard (telegram_id, season_id, xp) VALUES ('duplicate-player', 1, 20);
  `);
  assert.throws(() => duplicateDb.exec(migration047), /UNIQUE constraint failed/, 'duplicate leaderboard rows must block migration 047');
  assert.equal(duplicateDb.prepare('SELECT COUNT(*) AS value FROM telegram_leaderboard').get().value, 2, 'blocked migration must preserve every duplicate row');
  assert.equal(
    duplicateDb.prepare("SELECT COUNT(*) AS value FROM pragma_index_list('telegram_leaderboard') WHERE name = 'idx_telegram_leaderboard_unique_user_season'").get().value,
    0,
    'a failed precondition must not leave a partial unique index',
  );
}

// Reproduce the exact live awardPetReward() prepare failure through both public
// production settlement paths before applying migration 047.
{
  const jobDb = new D1();
  seedSeason(jobDb);
  seedPlayer(jobDb, 'pre-047-job');
  await assert.rejects(
    () => processPetJob(jobDb, 'pre-047-job', 'street_artist', { event_key: 'pre-047-job-callback', source: 'regression' }),
    conflictMismatch,
    'processPetJob() -> awardPetReward() must reproduce the live leaderboard conflict mismatch before 047',
  );

  const eventDb = new D1();
  seedSeason(eventDb);
  seedPlayer(eventDb, 'pre-047-event');
  await assert.rejects(
    () => processPetRandomEvent(eventDb, 'pre-047-event', 'fight_back', {
      event_key: 'alley_ambush-pre-047-event-callback', source: 'regression', now: new Date('2026-08-11T12:00:00Z'),
    }),
    conflictMismatch,
    'Pet Event settlement -> awardPetReward() must reproduce the live leaderboard conflict mismatch before 047',
  );
}

const db = new D1();
seedSeason(db);
db.database.exec(migration047);
const leaderboardIndex = db.database.prepare("SELECT name, \"unique\" AS is_unique FROM pragma_index_list('telegram_leaderboard') WHERE name = 'idx_telegram_leaderboard_unique_user_season'").get();
assert.deepEqual({ ...leaderboardIndex }, { name: 'idx_telegram_leaderboard_unique_user_season', is_unique: 1 });

for (const [jobKey, expectedPetXp] of Object.entries({ street_artist: 18, courier: 24, crystal_miner: 30, vault_guard: 36 })) {
  const telegramId = `job-${jobKey}`;
  const eventKey = `after-047-${jobKey}`;
  seedPlayer(db, telegramId);
  const result = await processPetJob(db, telegramId, jobKey, { event_key: eventKey, source: 'regression' });
  assert.equal(result.accepted, true, `${result.job?.title || jobKey} must settle after migration 047`);
  assert.equal(result.duplicate, false, `${result.job?.title || jobKey} must award its first callback`);
  assert.equal(result.pet_xp_awarded, expectedPetXp, `${result.job?.title || jobKey} must award its configured Pet XP`);
  const retry = await processPetJob(db, telegramId, jobKey, { event_key: eventKey, source: 'regression' });
  assert.equal(retry.duplicate, true, `${result.job?.title || jobKey} callback retries must be idempotent`);
  assert.equal(scalar(db, 'SELECT pet_xp AS value FROM telegram_pet_instances WHERE telegram_id = ?', telegramId), expectedPetXp);
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM telegram_pet_reward_claims WHERE telegram_id = ? AND source = 'pet_job'", telegramId), 1);
}

for (const [index, choice] of ['fight_back', 'run_route', 'hide_out'].entries()) {
  const telegramId = `event-choice-${index}`;
  const petId = `pet:${telegramId}:pet-s2026-003:1`;
  const eventKey = `alley_ambush-after-047-${index}`;
  seedPlayer(db, telegramId);
  const first = await processPetRandomEvent(db, telegramId, choice, {
    event_key: eventKey, source: 'regression', now: new Date('2026-08-11T12:00:00Z'),
  });
  assert.equal(first.accepted, true, `valid Pet Event choice ${choice} must settle after migration 047`);
  assert.equal(first.duplicate, false, `valid Pet Event choice ${choice} must award its first callback`);
  const identityBeforeRetry = {
    trait: { ...db.database.prepare('SELECT trait_id, progress FROM telegram_pet_personality_traits WHERE pet_id = ? AND telegram_id = ? AND season_key = ?').get(petId, telegramId, 'pet-s2026-003') },
    memory: { ...db.database.prepare('SELECT biggest_reward_amount, biggest_reward_currency, event_actions FROM telegram_pet_memories WHERE pet_id = ? AND telegram_id = ? AND season_key = ?').get(petId, telegramId, 'pet-s2026-003') },
  };
  const retry = await processPetRandomEvent(db, telegramId, choice, {
    event_key: eventKey, source: 'regression', now: new Date('2026-08-11T12:00:00Z'),
  });
  assert.equal(retry.duplicate, true, `Pet Event choice ${choice} must award a duplicate callback exactly zero times`);
  assert.deepEqual(
    {
      trait: { ...db.database.prepare('SELECT trait_id, progress FROM telegram_pet_personality_traits WHERE pet_id = ? AND telegram_id = ? AND season_key = ?').get(petId, telegramId, 'pet-s2026-003') },
      memory: { ...db.database.prepare('SELECT biggest_reward_amount, biggest_reward_currency, event_actions FROM telegram_pet_memories WHERE pet_id = ? AND telegram_id = ? AND season_key = ?').get(petId, telegramId, 'pet-s2026-003') },
    },
    identityBeforeRetry,
    `Pet Event choice ${choice} must keep personality progress and memories idempotent`,
  );
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM telegram_pet_reward_claims WHERE telegram_id = ? AND source <> 'wallet_reconciliation'", telegramId), 1);
}

// Keep reward authority coverage alongside the real Job/Event paths: caps,
// Community XP, leaderboard XP, inventory, and duplicate settlement are all
// asserted against awardPetReward(), not a simplified INSERT surrogate.
{
  const telegramId = 'authority-caps';
  const now = '2026-08-11T12:00:00.000Z';
  seedPlayer(db, telegramId);
  db.database.prepare(`INSERT INTO telegram_pet_events
    (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason)
    VALUES ('authority-prior', ?, 'test', 'authority-prior', 245, 1190, 'pet-s2026-003', '2026-08-11', '2026-W33', 'accepted', 'cap-fixture')`).run(telegramId);
  const request = {
    telegram_id: telegramId,
    source: 'pet_job',
    idempotency_key: 'authority-once',
    event_key: 'authority-once',
    event_type: 'work',
    reason: 'authority-regression',
    now,
    rewards: { pet_xp: 100, community_xp: 100, items: { moon_snack: 2 } },
  };
  const first = await awardPetReward(db, request);
  const retry = await awardPetReward(db, request);
  assert.deepEqual(
    { accepted: first.accepted, duplicate: first.duplicate, pet_xp_awarded: first.pet_xp_awarded, xp_awarded: first.xp_awarded },
    { accepted: true, duplicate: false, pet_xp_awarded: 10, xp_awarded: 5 },
    'awardPetReward() must retain the 1,200/day Pet XP and 250/day Community XP caps',
  );
  assert.equal(retry.duplicate, true, 'duplicate callback must be accepted without a second award');
  assert.equal(retry.pet_xp_awarded, 0);
  assert.equal(retry.xp_awarded, 0);
  assert.equal(scalar(db, 'SELECT pet_xp AS value FROM telegram_pet_profiles WHERE telegram_id = ?', telegramId), 10, 'Pet XP must apply exactly once');
  assert.equal(scalar(db, 'SELECT xp AS value FROM telegram_users WHERE telegram_id = ?', telegramId), 5, 'Community XP must apply exactly once');
  assert.equal(scalar(db, 'SELECT xp AS value FROM telegram_leaderboard WHERE telegram_id = ?', telegramId), 5, 'leaderboard XP must apply exactly once');
  assert.equal(scalar(db, "SELECT quantity AS value FROM telegram_pet_inventory WHERE telegram_id = ? AND asset_type = 'item' AND asset_key = 'moon_snack'", telegramId), 2, 'inventory must change exactly once');
  assert.equal(scalar(db, 'SELECT COUNT(*) AS value FROM telegram_xp_log WHERE telegram_id = ?', telegramId), 1, 'Community XP log must remain single-write');
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM telegram_pet_reward_claims WHERE telegram_id = ? AND source <> 'wallet_reconciliation'", telegramId), 1, 'reward authority must retain one gameplay claim per idempotency key');
}

assert.equal(db.database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
console.log('telegram-pets-live-reward-settlement.test.mjs passed');
