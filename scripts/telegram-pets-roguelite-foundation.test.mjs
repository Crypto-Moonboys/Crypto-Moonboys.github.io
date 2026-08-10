import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  PET_ROGUELITE_REGIONS,
  PET_RUN_MODIFIERS,
  abandonPetRun,
  awardPetReward,
  buildPetProfileDeltas,
  completePetRun,
  failPetRun,
  generatePetRunRoom,
  resolvePetRunRoom,
  rewardPetRogueliteBoss,
  rewardPetRunRoom,
  validatePetRunModifier,
} from '../workers/moonboys-api/pets/roguelite-foundation.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/042_telegram_pet_roguelite_foundation.sql', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const workerFunction = (name) => {
  const start = worker.indexOf(`async function ${name}`);
  const next = worker.indexOf('\nasync function ', start + 1);
  return worker.slice(start, next < 0 ? worker.length : next);
};

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
    this.batchCount = 0;
    this.failBatchNumber = 0;
  }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    const execute = () => {
      this.batchCount += 1;
      if (this.batchCount === this.failBatchNumber) throw new Error('injected_batch_failure');
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
for (const region of Object.values(PET_ROGUELITE_REGIONS)) {
  for (const field of ['difficulty', 'enemy_pool', 'event_pool', 'boss_pool', 'reward_pool']) assert.ok(region[field], `region must expose ${field}`);
  for (const forbidden of ['xp', 'level', 'progression', 'currency']) assert.equal(region[forbidden], undefined, `regions cannot add a separate ${forbidden} system`);
}

await assert.rejects(() => awardPetReward(seedPlayer('bad-source'), {
  telegram_id: 'bad-source', source: 'future_unreviewed_mode', idempotency_key: 'bypass', rewards: { pet_xp: 1 },
}), /invalid_pet_reward_request/, 'unregistered gameplay sources cannot bypass the unified authority');
for (const [path, fn, source] of [
  ['Events', 'processPetRandomEvent', 'pet_event'], ['Kaiju', 'awardPetKaijuPlayerResult', 'pet_kaiju'],
  ['Jobs', 'processPetJob', 'pet_job'], ['Activities', 'claimPetActivitySession', 'pet_activity'],
  ['Adventure', 'processPetAdventure', 'pet_adventure'], ['Arena', 'awardPetKaijuPlayerResult', 'pet_arena'],
  ['legacy runs', 'recordPetRunBankedEvent', 'pet_run_legacy'],
]) {
  const body = workerFunction(fn);
  assert.ok(body.includes('awardPetReward(db') && body.includes(`source: '${source}'`), `${path} rewards cannot bypass awardPetReward()`);
}
const arenaCompletion = workerFunction('completePetArenaBattle');
assert.ok(arenaCompletion.indexOf('awardPetKaijuPlayerResult') < arenaCompletion.lastIndexOf('return { accepted:true'),
  'duplicate Arena completion callbacks must retry idempotent reward settlement before returning');

const capDb = seedPlayer('cap-player');
capDb.database.prepare(`INSERT INTO telegram_pet_events
  (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason)
  VALUES ('prior', 'cap-player', 'test', 'prior', 245, 1190, 'season', '2026-08-10', '2026-W33', 'accepted', 'test')`).run();
const capped = await awardPetReward(capDb, {
  telegram_id: 'cap-player', source: 'pet_action', idempotency_key: 'cap', now: '2026-08-10T12:00:00Z',
  rewards: { pet_xp: 1000, community_xp: 100, moon_gold: 7, moon_crystals: 2, style_tokens: 3, materials: { scrap_metal: 2 }, items: { moon_snack: 1 } },
});
assert.equal(capped.pet_xp_awarded, 10, 'unified reward service must clamp Pet XP to the existing 1,200 daily cap');
assert.equal(capped.xp_awarded, 5, 'unified reward service must clamp Community XP to the existing 250 daily cap');
assert.deepEqual({ ...capDb.database.prepare('SELECT pet_xp, moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id = ?').get('cap-player') }, { pet_xp: 10, moon_gold: 7, moon_crystals: 2, style_tokens: 3 });
assert.equal(capDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'cap-player' AND asset_type = 'material' AND asset_key = 'scrap_metal'").get().quantity, 2);

assert.equal(buildPetProfileDeltas({}, { hunger: 9 }).hunger, 9, 'a positive hunger cost must increase the hunger value');
assert.equal(buildPetProfileDeltas({ hunger: 12 }, {}).hunger, -12, 'a positive hunger reward must decrease the hunger value');

const healthDb = seedPlayer('health-player');
healthDb.database.prepare("UPDATE telegram_pet_profiles SET health = 40, hunger = 50, happiness = 70, cleanliness = 70, energy = 70 WHERE telegram_id = 'health-player'").run();
await awardPetReward(healthDb, {
  telegram_id: 'health-player', source: 'pet_activity', idempotency_key: 'sleep-health',
  rewards: {}, profile_deltas: { health: 15 },
});
assert.deepEqual(
  { ...healthDb.database.prepare("SELECT health, hunger FROM telegram_pet_profiles WHERE telegram_id = 'health-player'").get() },
  { health: 55, hunger: 50 },
  'an explicit sleep/activity health reward must persist instead of being overwritten by derived health',
);

const roomNeedsDb = seedPlayer('room-needs-player');
roomNeedsDb.database.prepare("UPDATE telegram_pet_profiles SET health = 45, hunger = 50 WHERE telegram_id = 'room-needs-player'").run();
roomNeedsDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status)
  VALUES ('room-needs-row', 'room-needs-player', 'room-needs-run', 'season', 'active')`).run();
roomNeedsDb.database.prepare(`INSERT INTO telegram_pet_run_rooms (room_id, run_id, telegram_id, room_number, room_type, status)
  VALUES ('room-recovery', 'room-needs-run', 'room-needs-player', 1, 'loot', 'resolved')`).run();
await rewardPetRunRoom(roomNeedsDb, { run_id: 'room-needs-run', telegram_id: 'room-needs-player' },
  { room_id: 'room-recovery', room: 1, room_type: 'loot', status: 'resolved' }, { health: 7, hunger: 12 });
assert.deepEqual(
  { ...roomNeedsDb.database.prepare("SELECT health, hunger FROM telegram_pet_profiles WHERE telegram_id = 'room-needs-player'").get() },
  { health: 52, hunger: 38 },
  'roguelite room health and hunger recovery must remain explicit positive rewards',
);
roomNeedsDb.database.prepare(`INSERT INTO telegram_pet_run_rooms (room_id, run_id, telegram_id, room_number, room_type, status)
  VALUES ('room-cost', 'room-needs-run', 'room-needs-player', 2, 'battle', 'resolved')`).run();
await rewardPetRunRoom(roomNeedsDb, { run_id: 'room-needs-run', telegram_id: 'room-needs-player' },
  { room_id: 'room-cost', room: 2, room_type: 'battle', status: 'resolved' }, {}, { hunger: 9 });
assert.equal(roomNeedsDb.database.prepare("SELECT hunger FROM telegram_pet_profiles WHERE telegram_id = 'room-needs-player'").get().hunger, 47,
  'a roguelite room hunger cost must increase hunger');

const duplicateDb = seedPlayer('duplicate-player');
const duplicateClaims = await Promise.all(Array.from({ length: 12 }, () => awardPetReward(duplicateDb, {
  telegram_id: 'duplicate-player', source: 'pet_job', idempotency_key: 'same-callback', now: '2026-08-10T12:00:00Z',
  rewards: { pet_xp: 50, community_xp: 10, moon_gold: 25 },
})));
assert.equal(duplicateClaims.filter(({ duplicate }) => !duplicate).length, 1, 'concurrent callbacks may finalize one reward only');
assert.equal(duplicateDb.database.prepare("SELECT pet_xp, moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'duplicate-player'").get().pet_xp, 50);
assert.equal(duplicateDb.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id = 'duplicate-player'").get().moon_gold, 25);
assert.equal(duplicateDb.database.prepare("SELECT stage FROM telegram_pet_profiles WHERE telegram_id = 'duplicate-player'").get().stage, 'hatchling', 'unified rewards must preserve Pet stage progression');
assert.equal(duplicateDb.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_reward_claims').get().count, 1);

assert.equal(validatePetRunModifier(PET_RUN_MODIFIERS.moon_battery), true);
assert.throws(() => validatePetRunModifier({ effects: { pet_xp: 999 } }), /cannot_change_permanent_rewards/);
assert.throws(() => validatePetRunModifier({ effects: { nested: { completion_reward_pct: 999 } } }), /cannot_change_permanent_rewards/);
assert.throws(() => validatePetRunModifier({ effects: { energy_recovery_pct: { pet_xp_multiplier: 99 } } }), /cannot_change_permanent_rewards/);
assert.throws(() => validatePetRunModifier({ effects: { reward_cap: 999999 } }), /cannot_change_permanent_rewards/);
assert.throws(() => validatePetRunModifier({ effects: { permanent_stats: { battle_power: 999 } } }), /cannot_change_permanent_rewards/);
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
const completions = await Promise.all(Array.from({ length: 8 }, () => completePetRun(runDb, run, { pet_xp: 80, community_xp: 20, moon_gold: 40, moon_crystals: 3, style_tokens: 2 }, { rooms_completed: 5, boss_fought: 'alley_scrapper' })));
assert.equal(runDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE source = 'roguelite_completion'").get().count, 1, 'duplicate completion callbacks cannot duplicate completion rewards');
assert.equal(runDb.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id = 'run-player'").get().pet_xp, 80);
assert.deepEqual({ ...runDb.database.prepare("SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id = 'run-player'").get() },
  { moon_gold: 40, moon_crystals: 3, style_tokens: 2 }, 'concurrent completion callbacks must award each currency exactly once');
assert.equal(runDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_modifiers WHERE run_id = 'run-foundation'").get().count, 0, 'temporary modifiers disappear when a run ends');
assert.equal(completions.filter(({ duplicate }) => !duplicate).length, 1);

const failedDb = seedPlayer('failed-player');
failedDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status) VALUES ('failed-row', 'failed-player', 'failed-run', 'season', 'active')`).run();
failedDb.database.prepare(`INSERT INTO telegram_pet_run_modifiers (run_id, telegram_id, modifier_id, effects_json) VALUES ('failed-run', 'failed-player', 'cyber_eyes', '{"critical_chance_pct":15}')`).run();
await failPetRun(failedDb, { run_id: 'failed-run', telegram_id: 'failed-player', current_room: 2, score: 4 }, { death_reason: 'health_depleted', rooms_completed: 2 });
assert.equal(failedDb.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_reward_claims').get().count, 0, 'failed runs cannot grant completion rewards');
assert.equal(failedDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_modifiers WHERE run_id = 'failed-run'").get().count, 0, 'failed run modifiers must disappear');
const abandonedDb = seedPlayer('abandoned-player');
abandonedDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status) VALUES ('abandoned-row', 'abandoned-player', 'abandoned-run', 'season', 'active')`).run();
abandonedDb.database.prepare(`INSERT INTO telegram_pet_run_modifiers (run_id, telegram_id, modifier_id, effects_json) VALUES ('abandoned-run', 'abandoned-player', 'ghost_mode', '{"avoid_first_enemy":true}')`).run();
await abandonPetRun(abandonedDb, { run_id: 'abandoned-run', telegram_id: 'abandoned-player', current_room: 1, score: 1 });
assert.equal(abandonedDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_modifiers WHERE run_id = 'abandoned-run'").get().count, 0, 'abandoned run modifiers must disappear');

const bossDb = seedPlayer('boss-player');
bossDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status) VALUES ('boss-row', 'boss-player', 'boss-run', 'season', 'active')`).run();
bossDb.database.prepare(`INSERT INTO telegram_pet_run_rooms (room_id, run_id, telegram_id, room_number, room_type, status)
  VALUES ('boss-room', 'boss-run', 'boss-player', 5, 'boss', 'resolved')`).run();
const bossReward = await rewardPetRogueliteBoss(bossDb, { run_id: 'boss-run', telegram_id: 'boss-player' }, 'alley_scrapper');
assert.equal(bossReward.pet_xp_awarded, 0, 'repeatable bosses must not be a Pet XP farming source');
assert.equal(bossReward.xp_awarded, 0, 'repeatable bosses must not be a Community XP farming source');
assert.equal(bossDb.database.prepare("SELECT source FROM telegram_pet_reward_claims WHERE telegram_id = 'boss-player'").get().source, 'roguelite_boss', 'boss rewards must be routed through the unified reward service');
assert.equal(bossDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_relics WHERE telegram_id = 'boss-player'").get().count, 1);
assert.deepEqual({ ...bossDb.database.prepare("SELECT health, hunger FROM telegram_pet_profiles WHERE telegram_id = 'boss-player'").get() },
  { health: 79, hunger: 17 }, 'boss health and hunger recovery must use the same profile reward direction');
const boundedRoomCurrency = await awardPetReward(bossDb, {
  telegram_id: 'boss-player', source: 'roguelite_room', idempotency_key: 'bounded-room-currency',
  context: { run_id: 'boss-run', room_id: 'boss-room' }, rewards: { moon_gold: 999999, moon_crystals: 999999, style_tokens: 999999 },
});
assert.deepEqual({ moon_gold: boundedRoomCurrency.rewards.moon_gold, moon_crystals: boundedRoomCurrency.rewards.moon_crystals, style_tokens: boundedRoomCurrency.rewards.style_tokens },
  { moon_gold: 100, moon_crystals: 5, style_tokens: 5 }, 'roguelite room currency payouts must have service-level per-claim bounds');

const recoveryDb = seedPlayer('recovery-player');
recoveryDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, telegram_id, run_id, season_key, status, current_room, max_room) VALUES ('recovery-row', 'recovery-player', 'recovery-run', 'season', 'active', 5, 5)`).run();
recoveryDb.database.prepare(`INSERT INTO telegram_pet_run_modifiers (run_id, telegram_id, modifier_id, effects_json)
  VALUES ('recovery-run', 'recovery-player', 'ghost_mode', '{"avoid_first_enemy":true}')`).run();
const recoveryRun = { run_id: 'recovery-run', telegram_id: 'recovery-player', current_room: 5, score: 100 };
recoveryDb.failBatchNumber = 2;
await assert.rejects(() => completePetRun(recoveryDb, recoveryRun,
  { pet_xp: 30, community_xp: 5, moon_gold: 25, moon_crystals: 2, style_tokens: 1, materials: { dark_alloy: 3 }, items: { evolution_catalyst: 1 }, relics: { alpha_collar: { rarity: 'rare', effects: { battle_power_pct: 15 } } } },
  { rooms_completed: 5, boss_fought: 'alley_scrapper' }), /injected_batch_failure/);
assert.equal(recoveryDb.database.prepare("SELECT status FROM telegram_pet_runs WHERE run_id = 'recovery-run'").get().status, 'completed');
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id = 'recovery-player'").get().count, 0);
recoveryDb.failBatchNumber = 0;
await Promise.all(Array.from({ length: 8 }, () => completePetRun(recoveryDb, recoveryRun,
  { pet_xp: 30, community_xp: 5, moon_gold: 25, moon_crystals: 2, style_tokens: 1, materials: { dark_alloy: 3 }, items: { evolution_catalyst: 1 }, relics: { alpha_collar: { rarity: 'rare', effects: { battle_power_pct: 15 } } } },
  { rooms_completed: 5, boss_fought: 'alley_scrapper' })));
assert.deepEqual({ ...recoveryDb.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id = 'recovery-player'").get() }, { pet_xp: 30 });
assert.deepEqual({ ...recoveryDb.database.prepare("SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id = 'recovery-player'").get() },
  { moon_gold: 25, moon_crystals: 2, style_tokens: 1 }, 'retry after partial completion failure must award currencies exactly once');
assert.equal(recoveryDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'recovery-player' AND asset_type = 'material'").get().quantity, 3);
assert.equal(recoveryDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'recovery-player' AND asset_type = 'item'").get().quantity, 1);
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_relics WHERE telegram_id = 'recovery-player'").get().count, 1);
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_modifiers WHERE run_id = 'recovery-run'").get().count, 0);

const economyDb = seedPlayer('economy-player');
for (let index = 0; index < 260; index += 1) {
  const runId = `economy-${index}`, roomId = `${runId}:boss`;
  economyDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status) VALUES (?, 'economy-player', ?, 'season', 'active')`).run(`row-${index}`, runId);
  economyDb.database.prepare(`INSERT INTO telegram_pet_run_rooms (room_id, run_id, telegram_id, room_number, room_type, status) VALUES (?, ?, 'economy-player', 5, 'boss', 'resolved')`).run(roomId, runId);
  await rewardPetRogueliteBoss(economyDb, { run_id: runId, telegram_id: 'economy-player' }, 'alley_scrapper');
  economyDb.database.prepare("UPDATE telegram_pet_runs SET status = 'failed' WHERE run_id = ?").run(runId);
}
assert.equal(economyDb.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id = 'economy-player'").get().pet_xp, 0, 'repeated boss clears cannot farm Pet XP');
assert.equal(economyDb.database.prepare("SELECT xp FROM telegram_users WHERE telegram_id = 'economy-player'").get().xp, 0, 'repeated boss clears cannot farm Community XP');
assert.ok(economyDb.database.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM telegram_pet_reward_assets WHERE asset_type = 'material'").get().total <= 40, 'roguelite materials remain bounded');
assert.ok(economyDb.database.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM telegram_pet_reward_assets WHERE asset_type = 'item'").get().total <= 10, 'roguelite items remain bounded');
assert.equal(economyDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_relics WHERE telegram_id = 'economy-player'").get().count, 1, 'boss farming cannot duplicate relic ownership');

console.log('Telegram Pets roguelite foundation tests passed.');
