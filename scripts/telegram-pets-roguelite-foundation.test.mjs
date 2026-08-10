import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  PET_ROGUELITE_REGIONS,
  PET_RUN_MODIFIERS,
  awardPetReward,
  completePetRun,
  failPetRun,
  generatePetRunRoom,
  resolvePetRunRoom,
  rewardPetRogueliteBoss,
  validatePetRunModifier,
} from '../workers/moonboys-api/pets/roguelite-foundation.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/042_telegram_pet_roguelite_foundation.sql', import.meta.url), 'utf8');

class Statement {
  constructor(adapter, sql, args = []) { this.adapter = adapter; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.adapter, this.sql, args); }
  async first() { return this.adapter.database.prepare(this.sql).get(...this.args) || null; }
  async run() {
    const result = this.adapter.database.prepare(this.sql).run(...this.args);
    return { results: [], meta: { changes: Number(result.changes || 0) } };
  }
}

class D1 {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.database.exec(schema);
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

function seedPlayer(telegramId) {
  const db = new D1();
  db.database.prepare('INSERT INTO telegram_users (telegram_id, xp, level) VALUES (?, 0, 1)').run(telegramId);
  db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_xp, level) VALUES (?, 0, 1)').run(telegramId);
  db.database.prepare(`INSERT INTO telegram_seasons (name, start_date, end_date, is_active) VALUES ('Roguelite test', '2026-01-01', '2027-01-01', 1)`).run();
  return db;
}

for (const token of ['telegram_pet_reward_claims', 'telegram_pet_run_modifiers', 'telegram_pet_relics', 'telegram_pet_run_history', 'telegram_pet_run_analytics']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${token}`), `${token} must exist in canonical schema`);
  assert.ok(migration.includes(`CREATE TABLE ${token}`), `${token} must exist in migration 042`);
}
for (const field of ['run_id', 'telegram_id', 'region', 'difficulty', 'seed', 'current_room', 'max_room', 'status', 'started_at', 'ended_at', 'score']) {
  assert.ok(migration.includes(field), `run migration must preserve ${field}`);
}
for (const status of ['active', 'completed', 'failed', 'abandoned']) assert.ok(migration.includes(`'${status}'`));
assert.deepEqual(Object.values(PET_ROGUELITE_REGIONS).map(({ name }) => name), ['Moon Alley', 'Neon District', 'Dark Chain Sector']);

const capDb = seedPlayer('cap-player');
capDb.database.prepare(`INSERT INTO telegram_pet_events
  (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason)
  VALUES ('prior', 'cap-player', 'test', 'prior', 245, 1190, 'season', '2026-08-10', '2026-W33', 'accepted', 'test')`).run();
const capped = await awardPetReward(capDb, {
  telegram_id: 'cap-player', source: 'test_mode', idempotency_key: 'cap', now: '2026-08-10T12:00:00Z',
  rewards: { pet_xp: 1000, community_xp: 100, moon_gold: 7, moon_crystals: 2, style_tokens: 3, materials: { scrap_metal: 2 }, items: { moon_snack: 1 } },
});
assert.equal(capped.pet_xp_awarded, 10, 'unified reward service must clamp Pet XP to the existing 1,200 daily cap');
assert.equal(capped.xp_awarded, 5, 'unified reward service must clamp Community XP to the existing 250 daily cap');
assert.deepEqual({ ...capDb.database.prepare('SELECT pet_xp, moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id = ?').get('cap-player') }, { pet_xp: 10, moon_gold: 7, moon_crystals: 2, style_tokens: 3 });
assert.equal(capDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'cap-player' AND asset_type = 'material' AND asset_key = 'scrap_metal'").get().quantity, 2);

const duplicateDb = seedPlayer('duplicate-player');
const duplicateClaims = await Promise.all(Array.from({ length: 12 }, () => awardPetReward(duplicateDb, {
  telegram_id: 'duplicate-player', source: 'concurrent_test', idempotency_key: 'same-callback', now: '2026-08-10T12:00:00Z',
  rewards: { pet_xp: 50, community_xp: 10, moon_gold: 25 },
})));
assert.equal(duplicateClaims.filter(({ duplicate }) => !duplicate).length, 1, 'concurrent callbacks may finalize one reward only');
assert.equal(duplicateDb.database.prepare("SELECT pet_xp, moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'duplicate-player'").get().pet_xp, 50);
assert.equal(duplicateDb.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'duplicate-player'").get().moon_gold, 25);
assert.equal(duplicateDb.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_reward_claims').get().count, 1);

assert.equal(validatePetRunModifier(PET_RUN_MODIFIERS.moon_battery), true);
assert.throws(() => validatePetRunModifier({ effects: { pet_xp: 999 } }), /cannot_change_permanent_rewards/);
assert.throws(() => validatePetRunModifier({ effects: { nested: { completion_reward_pct: 999 } } }), /cannot_change_permanent_rewards/);
const generated = generatePetRunRoom({ run_id: 'room-run', seed: 3, current_room: 4, max_room: 5 });
assert.equal(generated.room_type, 'boss');
assert.equal(resolvePetRunRoom(generated, { success: true, score: 20 }).status, 'resolved');

const runDb = seedPlayer('run-player');
runDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, telegram_id, run_id, season_key, region, difficulty, seed, status, current_room, max_room, score)
  VALUES ('run-row', 'run-player', 'run-foundation', 'season', 'moon_alley', 1, 42, 'active', 5, 5, 100)`).run();
runDb.database.prepare(`INSERT INTO telegram_pet_run_modifiers (run_id, telegram_id, modifier_id, effects_json)
  VALUES ('run-foundation', 'run-player', 'moon_battery', '{"energy_recovery_pct":20}')`).run();
const run = { run_id: 'run-foundation', telegram_id: 'run-player', started_at: new Date(Date.now() - 5000).toISOString(), current_room: 5, score: 100 };
const completions = await Promise.all(Array.from({ length: 8 }, () => completePetRun(runDb, run, { pet_xp: 80, community_xp: 20, moon_gold: 40 }, { rooms_completed: 5, boss_fought: 'alley_scrapper' })));
assert.equal(runDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE source = 'roguelite_completion'").get().count, 1, 'duplicate completion callbacks cannot duplicate completion rewards');
assert.equal(runDb.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id = 'run-player'").get().pet_xp, 80);
assert.equal(runDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_modifiers WHERE run_id = 'run-foundation'").get().count, 0, 'temporary modifiers disappear when a run ends');
assert.equal(completions.filter(({ duplicate }) => !duplicate).length, 1);

const failedDb = seedPlayer('failed-player');
failedDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status) VALUES ('failed-row', 'failed-player', 'failed-run', 'season', 'active')`).run();
await failPetRun(failedDb, { run_id: 'failed-run', telegram_id: 'failed-player', current_room: 2, score: 4 }, { death_reason: 'health_depleted', rooms_completed: 2 });
assert.equal(failedDb.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_reward_claims').get().count, 0, 'failed runs cannot grant completion rewards');

const bossDb = seedPlayer('boss-player');
bossDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status) VALUES ('boss-row', 'boss-player', 'boss-run', 'season', 'active')`).run();
const bossReward = await rewardPetRogueliteBoss(bossDb, { run_id: 'boss-run', telegram_id: 'boss-player' }, 'alley_scrapper');
assert.equal(bossReward.pet_xp_awarded, 60);
assert.equal(bossDb.database.prepare("SELECT source FROM telegram_pet_reward_claims WHERE telegram_id = 'boss-player'").get().source, 'roguelite_boss', 'boss rewards must be routed through the unified reward service');

console.log('Telegram Pets roguelite foundation tests passed.');
