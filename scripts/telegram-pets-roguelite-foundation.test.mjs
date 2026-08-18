import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  PET_ROGUELITE_BOSSES,
  PET_ROGUELITE_ENEMIES,
  PET_ROGUELITE_REGIONS,
  PET_ROGUELITE_RELICS,
  PET_ROGUELITE_ROOMS,
  PET_RUN_MODIFIERS,
  __rogueliteFoundationTestHooks,
  abandonPetRun,
  awardPetReward,
  buildPetProfileDeltas,
  completePetRun,
  createPetRunRoom,
  choosePetRunModifier,
  extractPetRogueliteRun,
  failPetRun,
  generatePetRunRoom,
  persistPetRunRoomOutcome,
  resolvePetRunRoom,
  rewardPetRogueliteBoss,
  rewardPetRunRoom,
  startPetRogueliteRun,
  validatePetRelicContent,
  validatePetRogueliteContent,
  validatePetRunModifier,
} from '../workers/moonboys-api/pets/roguelite-foundation.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/042_telegram_pet_roguelite_foundation.sql', import.meta.url), 'utf8');
const petIdMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/066_moonpet_run_pet_id_authority.sql', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const rogueliteFoundation = fs.readFileSync(new URL('../workers/moonboys-api/pets/roguelite-foundation.js', import.meta.url), 'utf8');
const workerFunction = (name) => {
  const start = worker.indexOf(`async function ${name}`);
  const next = worker.indexOf('\nasync function ', start + 1);
  return worker.slice(start, next < 0 ? worker.length : next);
};
const foundationFunction = (name) => {
  const start = rogueliteFoundation.indexOf(`export async function ${name}`);
  const next = rogueliteFoundation.indexOf('\nexport ', start + 1);
  return rogueliteFoundation.slice(start, next < 0 ? rogueliteFoundation.length : next);
};
assert.match(petIdMigration, /ALTER TABLE telegram_pet_runs ADD COLUMN pet_id TEXT/);
assert.doesNotMatch(petIdMigration, /(?:DROP|DELETE|TRIGGER|telegram_pet_(?:kaiju|arena|weekly|identity|season_reward))/i,
  'migration 066 must remain nullable, additive, and scoped to run-owned tables');
const runStepAuthoritySource = workerFunction('processPetRunStep');
assert.doesNotMatch(runStepAuthoritySource, /getPetProfile\s*\(/, 'run steps cannot re-read the active pet selector');
assert.match(runStepAuthoritySource, /getPetInstanceWithAtomicDecay\(db, run\.pet_id\)/, 'run steps must load the stored run pet');
assert.match(foundationFunction('completePetRun'), /pet_id:\s*requireRunPetId\(run\)/, 'completion settlement requires run.pet_id');
assert.match(foundationFunction('extractPetRogueliteRun'), /pet_id:\s*requireRunPetId\(run\)/, 'extraction settlement requires run.pet_id');


class Statement {
  constructor(adapter, sql, args = []) { this.adapter = adapter; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.adapter, this.sql, args); }
  async first() { return this.adapter.database.prepare(this.sql).get(...this.args) || null; }
  async run() {
    if (/INSERT OR IGNORE INTO telegram_pet_run_analytics/i.test(this.sql) && String(this.args[0] || '').endsWith(':win')) {
      this.adapter.bossWinAnalyticsInsertAttempts += 1;
    }
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
    this.bossWinAnalyticsInsertAttempts = 0;
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
  const petId = `pet-${telegramId}`;
  db.database.prepare(`INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number, acquisition_type) VALUES (?, ?, 'pet-s2026-001', 1, 'free')`).run(petId, telegramId);
  db.database.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key) VALUES (?, ?, 'pet-s2026-001')`).run(telegramId, petId);
  db.database.prepare(`INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number, source_profile_updated_at) VALUES (?, ?, 'pet-s2026-001', 1, CURRENT_TIMESTAMP)`).run(petId, telegramId);
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
for (const status of ['active', 'completed', 'failed', 'abandoned', 'extracted']) assert.ok(migration.includes(`'${status}'`));
assert.deepEqual(Object.values(PET_ROGUELITE_REGIONS).map(({ name }) => name), ['Moon Alley']);
for (const region of Object.values(PET_ROGUELITE_REGIONS)) {
  for (const field of ['difficulty', 'room_pool', 'enemy_pool', 'boss_pool', 'reward_pool']) assert.ok(region[field], `region must expose ${field}`);
  for (const forbidden of ['xp', 'level', 'progression', 'currency']) assert.equal(region[forbidden], undefined, `regions cannot add a separate ${forbidden} system`);
}
assert.ok(Object.keys(PET_ROGUELITE_ROOMS).length >= 20, 'Moon Alley must ship at least twenty authored room definitions');
assert.ok(Object.values(PET_ROGUELITE_ROOMS).every(({ description, objective, threat, engine_choices, room_type }) =>
  description && objective && Number(threat) >= 1 && Array.isArray(engine_choices) && engine_choices.length >= (room_type === 'boss' ? 1 : 2)),
  'every authored room must explain its fiction, objective, threat and meaningful choices');
assert.ok(Object.keys(PET_ROGUELITE_ENEMIES).length >= 9, 'Moon Alley must ship at least nine enemy identities');
assert.ok(Object.keys(PET_ROGUELITE_BOSSES).length >= 3, 'Moon Alley must ship at least three boss identities');
assert.equal(Object.keys(PET_ROGUELITE_RELICS).length, 10, 'Moon Alley must ship ten persistent relic definitions');
assert.equal(Object.keys(PET_RUN_MODIFIERS).length, 10, 'Moon Alley must ship ten temporary run modifiers');
assert.equal(validatePetRogueliteContent(), true);
for (const filename of ['regions.json', 'rooms.json', 'enemies.json', 'bosses.json', 'relics.json', 'modifiers.json']) {
  assert.ok(fs.existsSync(new URL(`../workers/moonboys-api/pets/content/${filename}`, import.meta.url)), `${filename} must remain separate from Worker core logic`);
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
assert.equal(capDb.database.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id = 'cap-player' AND material_key = 'scrap_metal'").get().quantity, 2);
capDb.database.prepare("UPDATE telegram_pet_material_balances SET quantity = 9998 WHERE telegram_id = 'cap-player' AND material_key = 'scrap_metal'").run();
await awardPetReward(capDb, {
  telegram_id: 'cap-player', source: 'pet_action', idempotency_key: 'material-stack-cap', now: '2026-08-10T12:01:00Z',
  rewards: { materials: { scrap_metal: 5 } },
});
assert.equal(capDb.database.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id = 'cap-player' AND material_key = 'scrap_metal'").get().quantity, 9999,
  'unified rewards must clamp canonical material stacks to 9,999');

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
roomNeedsDb.database.prepare("UPDATE telegram_pet_instances SET health = 45, hunger = 50 WHERE pet_id = 'pet-room-needs-player'").run();
roomNeedsDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status)
  VALUES ('room-needs-row', 'room-needs-player', 'room-needs-run', 'season', 'active')`).run();
roomNeedsDb.database.prepare(`INSERT INTO telegram_pet_run_rooms (room_id, run_id, telegram_id, room_number, room_type, status)
  VALUES ('room-recovery', 'room-needs-run', 'room-needs-player', 1, 'loot', 'resolved')`).run();
await rewardPetRunRoom(roomNeedsDb, { run_id: 'room-needs-run', telegram_id: 'room-needs-player', pet_id: 'pet-room-needs-player' },
  { room_id: 'room-recovery', room: 1, room_type: 'loot', status: 'resolved' }, { health: 7, hunger: 12 });
assert.deepEqual(
  { ...roomNeedsDb.database.prepare("SELECT health, hunger FROM telegram_pet_instances WHERE pet_id = 'pet-room-needs-player'").get() },
  { health: 52, hunger: 38 },
  'roguelite room health and hunger recovery must remain explicit positive rewards',
);
roomNeedsDb.database.prepare(`INSERT INTO telegram_pet_run_rooms (room_id, run_id, telegram_id, room_number, room_type, status)
  VALUES ('room-cost', 'room-needs-run', 'room-needs-player', 2, 'battle', 'resolved')`).run();
await rewardPetRunRoom(roomNeedsDb, { run_id: 'room-needs-run', telegram_id: 'room-needs-player', pet_id: 'pet-room-needs-player' },
  { room_id: 'room-cost', room: 2, room_type: 'battle', status: 'resolved' }, {}, { hunger: 9 });
assert.equal(roomNeedsDb.database.prepare("SELECT hunger FROM telegram_pet_instances WHERE pet_id = 'pet-room-needs-player'").get().hunger, 47,
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

assert.equal(validatePetRunModifier(PET_RUN_MODIFIERS.low_energy), true);
assert.equal(validatePetRunModifier({ effects: { energy_cost_modifier: -5 } }), true, 'temporary energy cost modifiers are valid content');
assert.throws(() => validatePetRunModifier({ effects: { pet_xp: 999 } }), /cannot_change_permanent_rewards/);
assert.throws(() => validatePetRunModifier({ effects: { nested: { completion_reward_pct: 999 } } }), /cannot_change_permanent_rewards/);
assert.throws(() => validatePetRunModifier({ effects: { energy_recovery_pct: { pet_xp_multiplier: 99 } } }), /cannot_change_permanent_rewards/);
assert.throws(() => validatePetRunModifier({ effects: { reward_cap: 999999 } }), /cannot_change_permanent_rewards/);
assert.throws(() => validatePetRunModifier({ effects: { permanent_stats: { battle_power: 999 } } }), /cannot_change_permanent_rewards/);
assert.throws(() => validatePetRunModifier({ effects: { xp_multiplier: 10 } }), /cannot_change_permanent_rewards/);
assert.throws(() => validatePetRunModifier({ effects: { daily_cap_bonus: true } }), /cannot_change_permanent_rewards/);
assert.throws(() => validatePetRelicContent({ rarity: 'rare', effects: { xp_multiplier: 2 } }), /cannot_change_reward_authority/);
const generated = generatePetRunRoom({ run_id: 'room-run', seed: 3, current_room: 4, max_room: 5 });
assert.equal(generated.room_type, 'boss');
assert.equal(generated.name, 'Alley King Throne');
assert.equal(generated.boss_id, 'alley_king');
assert.equal(resolvePetRunRoom(generated, { success: true, score: 20 }).status, 'resolved');
assert.deepEqual(Array.from({ length: 10 }, (_, index) => generatePetRunRoom({
  run_id: 'moon-alley-route', region: 'moon_alley', seed: 9, current_room: index, max_room: 10,
}).name), [
  'Alley Entrance', 'Graffiti Wall', 'Rival Encounter', 'Hidden Cache', 'Street Market',
  'Underground Tunnel', 'Police Heat', 'Neon Shortcut', 'Chrome Crew Captain', 'Alley King Throne',
], 'a default Moon Alley run must traverse the complete authored vertical slice');

const startDb = seedPlayer('start-player');
const started = await startPetRogueliteRun(startDb, { telegram_id: 'start-player', run_id: 'moon-alley-start', seed: 42 });
assert.deepEqual({ region: started.region, difficulty: started.difficulty, max_room: started.max_room }, { region: 'moon_alley', difficulty: 1, max_room: 10 });
const startedRow = startDb.database.prepare("SELECT * FROM telegram_pet_runs WHERE run_id='moon-alley-start'").get();
assert.equal(startedRow.pet_id, 'pet-start-player', 'run start must capture the active immutable pet');
await createPetRunRoom(startDb, startedRow);
await choosePetRunModifier(startDb, startedRow, 'low_energy');
startDb.database.prepare(`INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number, acquisition_type)
  VALUES ('pet-start-player-second', 'start-player', 'pet-s2026-001', 2, 'free')`).run();
startDb.database.prepare(`INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number, source_profile_updated_at)
  VALUES ('pet-start-player-second', 'start-player', 'pet-s2026-001', 2, CURRENT_TIMESTAMP)`).run();
startDb.database.prepare("UPDATE telegram_pet_active_slots SET pet_id='pet-start-player-second' WHERE telegram_id='start-player'").run();
const duplicateStartAfterSwitch = await startPetRogueliteRun(startDb, { telegram_id: 'start-player', run_id: 'moon-alley-start', seed: 999, max_room: 3 });
assert.equal(duplicateStartAfterSwitch.duplicate, true);
assert.equal(duplicateStartAfterSwitch.pet_id, 'pet-start-player', 'duplicate start must return persisted run authority, not the active selector');
assert.deepEqual({ region: duplicateStartAfterSwitch.region, difficulty: duplicateStartAfterSwitch.difficulty,
  seed: duplicateStartAfterSwitch.seed, max_room: duplicateStartAfterSwitch.max_room },
{ region: 'moon_alley', difficulty: 1, seed: 42, max_room: 10 }, 'duplicate start must echo persisted run configuration, not retry defaults');
assert.equal(startDb.database.prepare("SELECT pet_id FROM telegram_pet_run_modifiers WHERE run_id='moon-alley-start'").get().pet_id, 'pet-start-player');
const switchedRun = { ...startedRow, current_room: 1, score: 10 };
await completePetRun(startDb, switchedRun, { pet_xp: 17 }, { rooms_completed: 1 });
for (const table of ['telegram_pet_run_rooms', 'telegram_pet_run_analytics']) {
  assert.ok(startDb.database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE run_id='moon-alley-start' AND pet_id='pet-start-player'`).get().count > 0,
    `${table} must inherit the run pet instead of the switched active pet`);
}
assert.equal(startDb.database.prepare("SELECT pet_id FROM telegram_pet_reward_claims WHERE source='roguelite_completion'").get().pet_id, 'pet-start-player',
  'completion after an active-pet switch must settle to the run owner');
assert.equal(startDb.database.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='pet-start-player'").get().pet_xp, 17);
assert.equal(startDb.database.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='pet-start-player-second'").get().pet_xp, 0);
const secondPetRun = await startPetRogueliteRun(startDb, { telegram_id: 'start-player', run_id: 'second-pet-run', seed: 43 });
assert.equal(secondPetRun.pet_id, 'pet-start-player-second');
const secondPetRunRow = startDb.database.prepare("SELECT * FROM telegram_pet_runs WHERE run_id='second-pet-run'").get();
await completePetRun(startDb, { ...secondPetRunRow, current_room: 2, score: 20 }, { pet_xp: 5 }, { rooms_completed: 2 });
assert.equal(startDb.database.prepare("SELECT runs_completed FROM telegram_pet_run_history WHERE telegram_id='start-player'").get().runs_completed, 2,
  'account-scoped history may aggregate multiple pets only without attributing the row to one pet_id');
assert.equal(startDb.database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('telegram_pet_run_history') WHERE name='pet_id'").get().count, 0,
  'account-scoped run history must not label mixed aggregate counters with the latest pet_id');



const roomConcurrencyDb = seedPlayer('room-concurrency-player');
roomConcurrencyDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, telegram_id, run_id, season_key, region, difficulty, seed, status, current_room, max_room)
  VALUES ('room-concurrency-row', 'room-concurrency-player', 'room-concurrency-run', 'season', 'moon_alley', 1, 7, 'active', 0, 10)`).run();
roomConcurrencyDb.database.prepare(`INSERT INTO telegram_pet_run_rooms
  (room_id, run_id, telegram_id, room_number, room_type, status, generated_data)
  VALUES ('room-concurrency-run:1', 'room-concurrency-run', 'room-concurrency-player', 1, 'choice_event', 'pending', '{}')`).run();
const pendingRoom = { room_id: 'room-concurrency-run:1', room: 1, room_type: 'choice_event', status: 'pending' };
const concurrentRooms = await Promise.all(Array.from({ length: 12 }, () => persistPetRunRoomOutcome(
  roomConcurrencyDb,
  { run_id: 'room-concurrency-run', telegram_id: 'room-concurrency-player', pet_id: 'pet-room-concurrency-player' },
  pendingRoom,
  { success: true, score: 10 },
)));
assert.equal(concurrentRooms.filter(({ duplicate }) => !duplicate).length, 1, 'concurrent room resolution must accept one callback only');
assert.equal(roomConcurrencyDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_analytics WHERE analytics_id = 'room-concurrency-run:1:resolved'").get().count, 1,
  'duplicate room callbacks must produce one room completion analytics event');

const roomFailureDb = seedPlayer('room-failure-player');
roomFailureDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status)
  VALUES ('room-failure-row', 'room-failure-player', 'room-failure-run', 'season', 'active')`).run();
roomFailureDb.database.prepare(`INSERT INTO telegram_pet_run_rooms (room_id, run_id, telegram_id, room_number, room_type, status, generated_data)
  VALUES ('room-failure-run:1', 'room-failure-run', 'room-failure-player', 1, 'battle', 'pending', '{}')`).run();
await persistPetRunRoomOutcome(roomFailureDb, { run_id: 'room-failure-run', telegram_id: 'room-failure-player', pet_id: 'pet-room-failure-player' },
  { room_id: 'room-failure-run:1', room: 1, room_type: 'battle', status: 'pending' }, { success: false, reason: 'defeated' });
assert.equal(roomFailureDb.database.prepare("SELECT json_extract(event_data, '$.outcome.success') AS success FROM telegram_pet_run_analytics WHERE analytics_id = 'room-failure-run:1:resolved'").get().success, 0,
  'failed rooms must remain visible to backend analytics');

const legacyAuthorityDb = seedPlayer('legacy-authority-player');
legacyAuthorityDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, telegram_id, run_id, season_key, status, current_room, score)
  VALUES ('legacy-authority-row', 'legacy-authority-player', 'legacy-authority-run', 'season', 'active', 2, 10)`).run();
const refusedLegacyAuthority = await extractPetRogueliteRun(legacyAuthorityDb,
  legacyAuthorityDb.database.prepare("SELECT * FROM telegram_pet_runs WHERE run_id='legacy-authority-run'").get(), { pet_xp: 50 }, { rooms_completed: 2 });
assert.equal(refusedLegacyAuthority.accepted, false);
assert.equal(refusedLegacyAuthority.reason, 'run_pet_authority_required');
assert.equal(legacyAuthorityDb.database.prepare("SELECT status FROM telegram_pet_runs WHERE run_id='legacy-authority-run'").get().status, 'active',
  'missing run pet_id must be rejected before terminal state is claimed');
assert.equal(legacyAuthorityDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='legacy-authority-player'").get().count, 0);

const runDb = seedPlayer('run-player');
runDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, telegram_id, run_id, season_key, region, difficulty, seed, status, current_room, max_room, score)
  VALUES ('run-row', 'run-player', 'run-foundation', 'season', 'moon_alley', 1, 42, 'active', 5, 5, 100)`).run();
runDb.database.prepare(`INSERT INTO telegram_pet_run_modifiers (run_id, telegram_id, modifier_id, effects_json)
  VALUES ('run-foundation', 'run-player', 'low_energy', '{"energy_cost_modifier":5}')`).run();
const run = { run_id: 'run-foundation', telegram_id: 'run-player', pet_id: 'pet-run-player', started_at: new Date(Date.now() - 5000).toISOString(), current_room: 5, score: 100 };
const completions = await Promise.all(Array.from({ length: 8 }, () => completePetRun(runDb, run, { pet_xp: 80, community_xp: 20, moon_gold: 40, moon_crystals: 3, style_tokens: 2 }, { rooms_completed: 5, boss_fought: 'alley_king' })));
assert.equal(runDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE source = 'roguelite_completion'").get().count, 1, 'duplicate completion callbacks cannot duplicate completion rewards');
assert.equal(runDb.database.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id = 'pet-run-player'").get().pet_xp, 80);
assert.deepEqual({ ...runDb.database.prepare("SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_instances WHERE pet_id = 'pet-run-player'").get() },
  { moon_gold: 40, moon_crystals: 3, style_tokens: 2 }, 'concurrent completion callbacks must award each currency exactly once');
assert.equal(runDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_modifiers WHERE run_id = 'run-foundation'").get().count, 0, 'temporary modifiers disappear when a run ends');
assert.equal(completions.filter(({ duplicate }) => !duplicate).length, 1);

const failedDb = seedPlayer('failed-player');
failedDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status) VALUES ('failed-row', 'failed-player', 'failed-run', 'season', 'active')`).run();
failedDb.database.prepare(`INSERT INTO telegram_pet_run_modifiers (run_id, telegram_id, modifier_id, effects_json) VALUES ('failed-run', 'failed-player', 'fast_enemies', '{"enemy_speed_pct":20}')`).run();
await failPetRun(failedDb, { run_id: 'failed-run', telegram_id: 'failed-player', pet_id: 'pet-failed-player', current_room: 2, score: 4 }, { death_reason: 'health_depleted', rooms_completed: 2 });
assert.equal(failedDb.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_reward_claims').get().count, 0, 'failed runs cannot grant completion rewards');
assert.equal(failedDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_modifiers WHERE run_id = 'failed-run'").get().count, 0, 'failed run modifiers must disappear');
const failedExtraction = await extractPetRogueliteRun(failedDb, { run_id: 'failed-run', telegram_id: 'failed-player', pet_id: 'pet-failed-player', current_room: 2, score: 4 }, { materials: { neon_scrap: 10 } });
assert.equal(failedExtraction.status, 'failed', 'a failed run cannot be reopened by extraction');
assert.equal(failedExtraction.reward, null, 'a failed extraction cannot award loot');
const abandonedDb = seedPlayer('abandoned-player');
abandonedDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status) VALUES ('abandoned-row', 'abandoned-player', 'abandoned-run', 'season', 'active')`).run();
abandonedDb.database.prepare(`INSERT INTO telegram_pet_run_modifiers (run_id, telegram_id, modifier_id, effects_json) VALUES ('abandoned-run', 'abandoned-player', 'hidden_route', '{"hidden_route":true}')`).run();
await abandonPetRun(abandonedDb, { run_id: 'abandoned-run', telegram_id: 'abandoned-player', pet_id: 'pet-abandoned-player', current_room: 1, score: 1 });
assert.equal(abandonedDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_modifiers WHERE run_id = 'abandoned-run'").get().count, 0, 'abandoned run modifiers must disappear');

const extractionDb = seedPlayer('extraction-player');
extractionDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, telegram_id, run_id, season_key, status, current_room, max_room, score)
  VALUES ('extraction-row', 'extraction-player', 'extraction-run', 'season', 'active', 7, 10, 70)`).run();
const extractions = await Promise.all(Array.from({ length: 8 }, () => extractPetRogueliteRun(extractionDb,
  { run_id: 'extraction-run', telegram_id: 'extraction-player', pet_id: 'pet-extraction-player', current_room: 7, score: 70 },
  { materials: { scrap_metal: 4 } }, { rooms_completed: 7 })));
assert.equal(extractions.filter(({ duplicate }) => !duplicate).length, 1, 'duplicate extraction callbacks must finalize once');
assert.equal(extractionDb.database.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id = 'extraction-player' AND material_key = 'scrap_metal'").get().quantity, 4);
assert.deepEqual({ ...extractionDb.database.prepare(`SELECT json_extract(event_data, '$.status') AS status,
  json_extract(event_data, '$.depth') AS depth, json_extract(event_data, '$.rewards.materials.scrap_metal') AS scrap_metal
FROM telegram_pet_run_analytics WHERE analytics_id = 'extraction-run:end'`).get() }, { status: 'extracted', depth: 7, scrap_metal: 4 },
  'run-end analytics must expose successful extraction for extraction-rate aggregation');

let bossRunId = null;
let bossRoomId = null;
let expectedBossRewards = null;
for (let index = 0; index < 1000; index += 1) {
  const candidateRunId = `boss-relic-run-${index}`;
  const candidateRoomId = `${candidateRunId}:10`;
  const candidateRewards = __rogueliteFoundationTestHooks.buildPetBossRewards(
    PET_ROGUELITE_BOSSES.alley_king,
    { run_id: candidateRunId },
    { room_id: candidateRoomId },
  );
  if (Object.keys(candidateRewards.relics).length > 0) {
    bossRunId = candidateRunId;
    bossRoomId = candidateRoomId;
    expectedBossRewards = candidateRewards;
    break;
  }
}
assert.ok(bossRunId && bossRoomId && expectedBossRewards, 'test fixture must find a deterministic Alley King relic discovery');
const expectedRelics = Object.keys(expectedBossRewards.relics);
const bossWinAnalyticsId = `${bossRunId}:boss:${bossRoomId}:alley_king:win`;

const bossDb = seedPlayer('boss-player');
bossDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status)
  VALUES ('boss-row', 'boss-player', ?, 'season', 'active')`).run(bossRunId);
bossDb.database.prepare(`INSERT INTO telegram_pet_run_rooms (room_id, run_id, telegram_id, room_number, room_type, status)
  VALUES (?, ?, 'boss-player', 10, 'boss', 'resolved')`).run(bossRoomId, bossRunId);
const bossCallbacks = await Promise.all(Array.from({ length: 8 }, () => rewardPetRogueliteBoss(
  bossDb, { run_id: bossRunId, telegram_id: 'boss-player', pet_id: 'pet-boss-player' }, 'alley_king',
)));
const bossReward = bossCallbacks.find(({ duplicate }) => !duplicate);
assert.equal(bossCallbacks.filter(({ duplicate }) => !duplicate).length, 1, 'concurrent boss callbacks must produce one authoritative settlement');
assert.equal(bossCallbacks.filter(({ duplicate }) => duplicate).length, 7, 'losing concurrent boss callbacks must be reported as duplicates');
assert.equal(bossReward.pet_xp_awarded, 0, 'repeatable bosses must not be a Pet XP farming source');
assert.equal(bossReward.xp_awarded, 0, 'repeatable bosses must not be a Community XP farming source');
assert.equal(bossDb.database.prepare("SELECT source FROM telegram_pet_reward_claims WHERE telegram_id = 'boss-player'").get().source, 'roguelite_boss', 'boss rewards must be routed through the unified reward service');
assert.equal(bossDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id = 'boss-player' AND source = 'roguelite_boss'").get().count, 1, 'duplicate boss callbacks cannot duplicate rewards');
assert.equal(bossDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_relics WHERE telegram_id = 'boss-player'").get().count, 1,
  'the authoritative callback must persist the deterministic relic discovery');
assert.equal(bossDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_analytics WHERE event_type = 'boss_fought'").get().count, 2,
  'backend analytics must record one boss attempt and one boss win despite duplicate callbacks');
assert.equal(bossDb.bossWinAnalyticsInsertAttempts, 1, 'only the authoritative boss settlement may attempt the boss-win analytics insert');
const bossWinAnalytics = JSON.parse(bossDb.database.prepare('SELECT event_data FROM telegram_pet_run_analytics WHERE analytics_id = ?').get(bossWinAnalyticsId).event_data);
assert.deepEqual(bossWinAnalytics.rewards.materials, expectedBossRewards.materials, 'boss-win analytics must retain authoritative materials');
assert.deepEqual(bossWinAnalytics.rewards.items, expectedBossRewards.items, 'boss-win analytics must retain the evolution fragment');
assert.deepEqual(bossWinAnalytics.relics_discovered, expectedRelics, 'boss-win analytics must retain the authoritative relic discovery');
assert.ok(Object.keys(bossWinAnalytics.rewards.materials).length > 0 && bossWinAnalytics.relics_discovered.length > 0,
  'boss-win analytics payload cannot be empty duplicate reward data');
assert.match(foundationFunction('rewardPetRogueliteBoss'), /if \(awarded\.accepted && !awarded\.duplicate\) \{[\s\S]*?:win/,
  'duplicate boss callbacks must not compete to write zeroed boss-win analytics');

const bossWinBeforeDuplicateRetry = JSON.stringify(bossWinAnalytics);
const duplicateBossRetry = await rewardPetRogueliteBoss(bossDb, { run_id: bossRunId, telegram_id: 'boss-player', pet_id: 'pet-boss-player' }, 'alley_king');
assert.equal(duplicateBossRetry.duplicate, true, 'an explicit boss retry after settlement must remain duplicate');
assert.equal(bossDb.bossWinAnalyticsInsertAttempts, 1, 'a duplicate boss retry cannot attempt another boss-win analytics insert');
assert.equal(bossDb.database.prepare('SELECT event_data FROM telegram_pet_run_analytics WHERE analytics_id = ?').get(bossWinAnalyticsId).event_data,
  bossWinBeforeDuplicateRetry, 'a duplicate boss retry cannot replace authoritative analytics with an empty payload');

const bossRetryDb = seedPlayer('boss-retry-player');
bossRetryDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status)
  VALUES ('boss-retry-row', 'boss-retry-player', ?, 'season', 'active')`).run(bossRunId);
bossRetryDb.database.prepare(`INSERT INTO telegram_pet_run_rooms (room_id, run_id, telegram_id, room_number, room_type, status)
  VALUES (?, ?, 'boss-retry-player', 10, 'boss', 'resolved')`).run(bossRoomId, bossRunId);
bossRetryDb.failBatchNumber = 1;
await assert.rejects(() => rewardPetRogueliteBoss(bossRetryDb,
  { run_id: bossRunId, telegram_id: 'boss-retry-player', pet_id: 'pet-boss-retry-player' }, 'alley_king'), /injected_batch_failure/,
  'a failed boss reward settlement must surface without writing win analytics');
assert.equal(bossRetryDb.bossWinAnalyticsInsertAttempts, 0, 'failed reward settlement cannot attempt boss-win analytics');
assert.equal(bossRetryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_analytics WHERE json_extract(event_data, '$.outcome') = 'win'").get().count, 0,
  'failed reward settlement cannot create a boss-win event');
assert.equal(bossRetryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE source = 'roguelite_boss'").get().count, 0,
  'failed reward settlement must remain retryable without a partial claim');
bossRetryDb.failBatchNumber = 0;
const recoveredBossReward = await rewardPetRogueliteBoss(bossRetryDb,
  { run_id: bossRunId, telegram_id: 'boss-retry-player', pet_id: 'pet-boss-retry-player' }, 'alley_king');
assert.equal(recoveredBossReward.accepted, true);
assert.equal(recoveredBossReward.duplicate, false, 'retry after a failed boss reward must become the authoritative settlement');
assert.equal(bossRetryDb.bossWinAnalyticsInsertAttempts, 1, 'successful reward retry must write boss-win analytics exactly once');
const recoveredBossAnalytics = JSON.parse(bossRetryDb.database.prepare('SELECT event_data FROM telegram_pet_run_analytics WHERE analytics_id = ?').get(bossWinAnalyticsId).event_data);
assert.deepEqual(recoveredBossAnalytics.rewards.materials, expectedBossRewards.materials, 'recovered boss analytics must retain correct rewards');
assert.deepEqual(recoveredBossAnalytics.relics_discovered, expectedRelics, 'recovered boss analytics must retain correct relic discovery');
assert.deepEqual({ ...bossDb.database.prepare("SELECT health, hunger FROM telegram_pet_instances WHERE pet_id = 'pet-boss-player'").get() },
  { health: 71, hunger: 25 }, 'Alley King rewards must preserve the unified authority health derivation and cannot inject need bonuses');
const boundedRoomCurrency = await awardPetReward(bossDb, {
  telegram_id: 'boss-player', source: 'roguelite_room', idempotency_key: 'bounded-room-currency',
  context: { run_id: bossRunId, room_id: bossRoomId }, rewards: { moon_gold: 999999, moon_crystals: 999999, style_tokens: 999999 },
});
assert.deepEqual({ moon_gold: boundedRoomCurrency.rewards.moon_gold, moon_crystals: boundedRoomCurrency.rewards.moon_crystals, style_tokens: boundedRoomCurrency.rewards.style_tokens },
  { moon_gold: 100, moon_crystals: 5, style_tokens: 5 }, 'roguelite room currency payouts must have service-level per-claim bounds');

const recoveryDb = seedPlayer('recovery-player');
recoveryDb.database.prepare(`INSERT INTO telegram_pet_runs
  (id, telegram_id, run_id, season_key, status, current_room, max_room) VALUES ('recovery-row', 'recovery-player', 'recovery-run', 'season', 'active', 5, 5)`).run();
recoveryDb.database.prepare(`INSERT INTO telegram_pet_run_modifiers (run_id, telegram_id, modifier_id, effects_json)
  VALUES ('recovery-run', 'recovery-player', 'hidden_route', '{"hidden_route":true}')`).run();
const recoveryRun = { run_id: 'recovery-run', telegram_id: 'recovery-player', pet_id: 'pet-recovery-player', current_room: 5, score: 100 };
recoveryDb.failBatchNumber = 2;
await assert.rejects(() => completePetRun(recoveryDb, recoveryRun,
  { pet_xp: 30, community_xp: 5, moon_gold: 25, moon_crystals: 2, style_tokens: 1, materials: { dark_alloy: 3 }, items: { evolution_catalyst: 1 }, relics: { alpha_collar: { rarity: 'rare', effects: { battle_power_pct: 15 } } } },
  { rooms_completed: 5, boss_fought: 'alley_king' }), /injected_batch_failure/);
assert.equal(recoveryDb.database.prepare("SELECT status FROM telegram_pet_runs WHERE run_id = 'recovery-run'").get().status, 'completed');
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id = 'recovery-player'").get().count, 0);
recoveryDb.failBatchNumber = 0;
await Promise.all(Array.from({ length: 8 }, () => completePetRun(recoveryDb, recoveryRun,
  { pet_xp: 30, community_xp: 5, moon_gold: 25, moon_crystals: 2, style_tokens: 1, materials: { dark_alloy: 3 }, items: { evolution_catalyst: 1 }, relics: { alpha_collar: { rarity: 'rare', effects: { battle_power_pct: 15 } } } },
  { rooms_completed: 5, boss_fought: 'alley_king' })));
assert.deepEqual({ ...recoveryDb.database.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id = 'pet-recovery-player'").get() }, { pet_xp: 30 });
assert.deepEqual({ ...recoveryDb.database.prepare("SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_instances WHERE pet_id = 'pet-recovery-player'").get() },
  { moon_gold: 25, moon_crystals: 2, style_tokens: 1 }, 'retry after partial completion failure must award currencies exactly once');
assert.equal(recoveryDb.database.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id = 'recovery-player' AND material_key = 'dark_alloy'").get().quantity, 3);
assert.equal(recoveryDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'recovery-player' AND asset_type = 'item'").get().quantity, 1);
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_relics WHERE telegram_id = 'recovery-player'").get().count, 1);
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_run_modifiers WHERE run_id = 'recovery-run'").get().count, 0);

const economyDb = seedPlayer('economy-player');
for (let index = 0; index < 260; index += 1) {
  const runId = `economy-${index}`, roomId = `${runId}:boss`;
  economyDb.database.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status) VALUES (?, 'economy-player', ?, 'season', 'active')`).run(`row-${index}`, runId);
  economyDb.database.prepare(`INSERT INTO telegram_pet_run_rooms (room_id, run_id, telegram_id, room_number, room_type, status) VALUES (?, ?, 'economy-player', 5, 'boss', 'resolved')`).run(roomId, runId);
  await rewardPetRogueliteBoss(economyDb, { run_id: runId, telegram_id: 'economy-player', pet_id: 'pet-economy-player' }, 'alley_king');
  economyDb.database.prepare("UPDATE telegram_pet_runs SET status = 'failed' WHERE run_id = ?").run(runId);
}
assert.equal(economyDb.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id = 'economy-player'").get().pet_xp, 0, 'repeated boss clears cannot farm Pet XP');
assert.equal(economyDb.database.prepare("SELECT xp FROM telegram_users WHERE telegram_id = 'economy-player'").get().xp, 0, 'repeated boss clears cannot farm Community XP');
assert.ok(economyDb.database.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM telegram_pet_reward_assets WHERE asset_type = 'material'").get().total <= 40, 'roguelite materials remain bounded');
assert.ok(economyDb.database.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM telegram_pet_reward_assets WHERE asset_type = 'item'").get().total <= 10, 'roguelite items remain bounded');
assert.ok(economyDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_relics WHERE telegram_id = 'economy-player'").get().count <= 10, 'boss farming cannot duplicate relic ownership');

let simulatedMaterials = 0;
let simulatedItems = 0;
const simulatedRelics = new Set();
for (let index = 0; index < 10000; index += 1) {
  const rewards = __rogueliteFoundationTestHooks.buildPetBossRewards(
    PET_ROGUELITE_BOSSES.alley_king,
    { run_id: `simulated-moon-alley-${index}` },
    { room_id: `simulated-moon-alley-${index}:10` },
  );
  assert.equal(rewards.pet_xp, 0, '10,000-run simulation cannot create repeatable Pet XP');
  assert.equal(rewards.community_xp, 0, '10,000-run simulation cannot create repeatable Community XP');
  const requestedMaterials = Object.values(rewards.materials).reduce((total, amount) => total + amount, 0);
  const requestedItems = Object.values(rewards.items).reduce((total, amount) => total + amount, 0);
  simulatedMaterials += Math.min(requestedMaterials, Math.max(0, __rogueliteFoundationTestHooks.DAILY_ROGUELITE_MATERIAL_CAP - simulatedMaterials));
  simulatedItems += Math.min(requestedItems, Math.max(0, __rogueliteFoundationTestHooks.DAILY_ROGUELITE_ITEM_CAP - simulatedItems));
  for (const relicId of Object.keys(rewards.relics)) simulatedRelics.add(relicId);
}
assert.ok(simulatedMaterials <= 40, '10,000 Moon Alley runs cannot inflate materials beyond the authority cap');
assert.ok(simulatedItems <= 10, '10,000 Moon Alley runs cannot inflate items beyond the authority cap');
assert.ok(simulatedRelics.size <= Object.keys(PET_ROGUELITE_RELICS).length, '10,000 Moon Alley runs preserve unique relic ownership');

console.log('Telegram Pets roguelite foundation tests passed.');
