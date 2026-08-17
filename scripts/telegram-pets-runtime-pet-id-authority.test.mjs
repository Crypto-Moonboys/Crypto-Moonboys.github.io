import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureGameplayAuthority, requirePersistedGameplayAuthority, requirePersistedPlayerAuthority } from '../workers/moonboys-api/pets/gameplay-authority.js';

const migration = readFileSync(new URL('../workers/moonboys-api/migrations/064_moonpet_runtime_pet_id_authority.sql', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const rewards = readFileSync(new URL('../workers/moonboys-api/pets/roguelite-foundation.js', import.meta.url), 'utf8');
const identity = readFileSync(new URL('../workers/moonboys-api/pets/moonpet-identity.js', import.meta.url), 'utf8');
const daily = readFileSync(new URL('../workers/moonboys-api/pets/daily-moon-run.js', import.meta.url), 'utf8');
const block = (source, start, end = '\nasync function ') => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing source block ${start}`);
  return source.slice(from, to < 0 ? source.length : to);
};

for (const table of ['telegram_pet_activity_sessions', 'telegram_pet_runs', 'telegram_pet_run_steps', 'telegram_pet_daily_runs',
  'telegram_pet_arena_queue', 'telegram_pet_arena_battles', 'telegram_pet_kaiju_queue', 'telegram_pet_kaiju_matches',
  'telegram_pet_reward_claims', 'telegram_pet_events', 'telegram_pet_identity_events', 'telegram_pet_weekly_boss_progress',
  'telegram_pet_weekly_boss_events', 'telegram_pet_season_reward_claims']) {
  assert.match(migration, new RegExp(`(?:ALTER TABLE|CREATE TABLE) ${table}`), `${table} must persist pet authority`);
}
const guards = [...migration.matchAll(/CREATE TRIGGER (require_[a-z_]+_pet_id)/g)].map((match) => match[1]);
assert.deepEqual(guards.sort(), [
  'require_activity_pet_id', 'require_boss_victory_pet_id', 'require_arena_battle_pet_id', 'require_arena_queue_pet_id', 'require_daily_run_pet_id',
  'require_daily_analytics_pet_id', 'require_identity_analytics_pet_id', 'require_identity_event_pet_id', 'require_kaiju_match_pet_id', 'require_kaiju_queue_pet_id', 'require_pet_event_pet_id',
  'require_memory_pet_id', 'require_personality_pet_id', 'require_reward_asset_pet_id', 'require_reward_claim_pet_id', 'require_run_analytics_pet_id', 'require_run_history_pet_id', 'require_run_pet_id', 'require_run_room_pet_id', 'require_run_step_pet_id', 'require_season_reward_pet_id',
  'require_weekly_boss_event_pet_id', 'require_weekly_boss_progress_pet_id',
].sort(), 'every authoritative trigger must remain covered by this audit');
assert.doesNotMatch(migration, /UPDATE\s+telegram_pet_\w+\s+SET\s+pet_id/i, 'legacy rows must never be assigned to today’s active selector');

const rewardWrapper = block(worker, 'async function awardPetReward');
assert.doesNotMatch(rewardWrapper, /telegram_pet_profiles|findActivePetSlot|readActivePetInstance|getPetProfile|mirrorPetProfileToActiveInstance|source_profile_updated_at/,
  'delayed settlement must neither read nor copy the active compatibility profile');
assert.match(rewards, /const stateTable = petId \? 'telegram_pet_instances' : 'telegram_pet_profiles'/,
  'pet-authoritative rewards must update the persisted instance directly');
assert.match(rewards, /WHERE \$\{stateKey\} = \? AND EXISTS/, 'reward deltas must target the persisted state key');
assert.match(rewardWrapper, /reward_pet_authority_mismatch/, 'duplicate settlement must reject a different participating pet');

const runStart = block(rewards, 'export async function startPetRogueliteRun', '\nexport async function');
assert.match(runStart, /captureGameplayAuthority/);
assert.match(runStart, /runAuthorityColumn/);
const runStep = block(worker, 'async function processPetRunStep');
assert.match(runStep, /run\.pet_id \? await db\.prepare\('SELECT \* FROM telegram_pet_instances/);
assert.match(runStep, /telegram_pet_run_steps[\s\S]*run\.pet_id \? ', pet_id'/);
assert.doesNotMatch(runStep, /mirrorPetProfileToActiveInstance/);
assert.match(daily, /telegram_pet_daily_runs[\s\S]*authoritativeRun\.pet_id \? ', pet_id'/);

const arenaQueue = block(worker, 'async function queuePetArenaMiniApp');
const arenaCommand = block(worker, 'async function cmdPetArena');
const arenaBattle = block(worker, 'async function createPetArenaBattle');
assert.match(arenaQueue, /telegram_pet_arena_queue[\s\S]*pet\.pet_id/);
assert.match(arenaCommand, /telegram_pet_arena_queue \(id,chat_id,telegram_id\$\{pet\.pet_id \? ',pet_id'/);
assert.match(arenaCommand, /pet_id: opponent\.pet_id/);
assert.match(worker, /pet_id: String\(pet\?\.pet_id \|\| ''\)/, 'Arena snapshots must preserve pet_id');
assert.match(arenaBattle, /authorityColumns[\s\S]*opponentAuthorityColumns/);
assert.match(arenaBattle, /hasPetAuthority[\s\S]*p1\.pet_id[\s\S]*p2\.pet_id/, 'Arena H2H must persist both queued pet ids');

const kaijuMatchmaking = block(worker, 'async function matchmakePetKaijuMiniApp');
const kaijuCommand = block(worker, 'async function cmdPetKaiju');
assert.match(kaijuMatchmaking, /SET player2_telegram_id=\?\$\{queuedAuthority\.pet_id \? ', player2_pet_id=\?'/);
assert.match(kaijuCommand, /SET player2_telegram_id = \?, player2_pet_id = \?/);
assert.match(block(worker, 'async function awardPetKaijuPlayerResult'), /requirePersistedPlayerAuthority/, 'Kaiju settlement must use its stored side authority');

assert.match(identity, /recordMoonpetBehaviour[\s\S]*identityColumn[\s\S]*telegram_pet_identity_events/);
assert.match(identity, /recordMoonpetMemory[\s\S]*identityColumn[\s\S]*telegram_pet_identity_events/);
assert.match(block(worker, 'async function processPetWeeklyBoss'), /telegram_pet_weekly_boss_progress \(telegram_id, pet_id, week_key/);
assert.match(block(worker, 'async function settlePetWeeklyBossReward'), /pet_id: progress\.pet_id/);
assert.match(block(worker, 'async function claimPetSeasonReward'), /persistedReward\?\.pet_id[\s\S]*captureGameplayAuthority[\s\S]*pet_id: authority\.pet_id/);

let activePet = 'pet-a';
const db = { prepare() { return { bind(owner) { return { async first() { return { pet_id: activePet, telegram_id: owner, season_key: 's1' }; } }; } }; } };
const activity = await captureGameplayAuthority(db, 'owner');
const arena = { player1_telegram_id: 'owner', player1_pet_id: 'pet-a', player2_telegram_id: 'rival', player2_pet_id: 'pet-rival', season_key: 's1' };
activePet = 'pet-b';
assert.equal(requirePersistedGameplayAuthority(activity, 'owner').pet_id, 'pet-a', 'switching pets cannot steal delayed activity ownership');
assert.equal(requirePersistedPlayerAuthority(arena, 1, 'owner').pet_id, 'pet-a');
assert.equal(requirePersistedPlayerAuthority(arena, 2, 'rival').pet_id, 'pet-rival');
assert.throws(() => requirePersistedGameplayAuthority(activity, 'rival'), /persisted_pet_authority_required/);
assert.equal(requirePersistedGameplayAuthority(activity, 'owner').pet_id, requirePersistedGameplayAuthority(activity, 'owner').pet_id,
  'duplicate retries preserve the original pet id after a selector switch');
console.log('Moonpet immutable pet_id authority checks passed.');

// Runtime settlement regression: switching the selector before a duplicate retry
// cannot mutate the selected pet or copy the compatibility profile.
const { DatabaseSync } = await import('node:sqlite');
const { awardPetReward: settleReward } = await import('../workers/moonboys-api/pets/roguelite-foundation.js');
class Statement {
  constructor(database, sql, args = []) { this.database = database; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.database, this.sql, args); }
  async first() { return this.database.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.args) }; }
  async run() { const result = this.database.prepare(this.sql).run(...this.args); return { meta: { changes: Number(result.changes || 0) }, results: [] }; }
}
class D1 {
  constructor(database) { this.database = database; }
  prepare(sql) { return new Statement(this.database, sql); }
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const output = statements.map((statement) => {
        const query = this.database.prepare(statement.sql);
        if (/\bRETURNING\b/i.test(statement.sql)) { const rows = query.all(...statement.args); return { results: rows, meta: { changes: rows.length } }; }
        const result = query.run(...statement.args); return { results: [], meta: { changes: Number(result.changes || 0) } };
      });
      this.database.exec('COMMIT'); return output;
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
}
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=OFF');
sqlite.exec(readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
sqlite.exec(readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
sqlite.exec(migration);
sqlite.prepare(`INSERT INTO telegram_users(telegram_id, username, first_name) VALUES('switch-owner','switch-owner','Switch')`).run();
sqlite.prepare(`INSERT INTO telegram_pet_profiles(telegram_id, pet_name, moon_gold, pet_xp) VALUES('switch-owner','Compatibility',900,900)`).run();
for (const [petId, slot] of [['pet-a', 1], ['pet-b', 2]]) {
  sqlite.prepare(`INSERT INTO telegram_pet_season_slots(pet_id,telegram_id,season_key,slot_number,acquisition_type,source_event_key,status)
    VALUES(?,'switch-owner','s1',?,'free',?,'active')`).run(petId, slot, `seed:${petId}`);
  sqlite.prepare(`INSERT INTO telegram_pet_instances(pet_id,telegram_id,season_key,slot_number,pet_name,source_profile_updated_at,moon_gold,pet_xp)
    VALUES(?,'switch-owner','s1',?,?,CURRENT_TIMESTAMP,10,0)`).run(petId, slot, petId);
}
sqlite.prepare(`INSERT INTO telegram_pet_active_slots(telegram_id,pet_id,season_key) VALUES('switch-owner','pet-a','s1')`).run();
const runtimeDb = new D1(sqlite);
const firstReward = await settleReward(runtimeDb, { telegram_id: 'switch-owner', pet_id: 'pet-a', source: 'pet_job', idempotency_key: 'delayed-a', rewards: { pet_xp: 25, moon_gold: 7 }, now: '2026-08-17T00:00:00Z' });
assert.equal(firstReward.accepted, true);
sqlite.prepare(`UPDATE telegram_pet_active_slots SET pet_id='pet-b' WHERE telegram_id='switch-owner'`).run();
const retryReward = await settleReward(runtimeDb, { telegram_id: 'switch-owner', pet_id: 'pet-a', source: 'pet_job', idempotency_key: 'delayed-a', rewards: { pet_xp: 25, moon_gold: 7 }, now: '2026-08-17T00:00:00Z' });
assert.equal(retryReward.duplicate, true);
assert.deepEqual({ ...sqlite.prepare(`SELECT pet_xp,moon_gold FROM telegram_pet_instances WHERE pet_id='pet-a'`).get() }, { pet_xp: 25, moon_gold: 17 });
assert.deepEqual({ ...sqlite.prepare(`SELECT pet_xp,moon_gold FROM telegram_pet_instances WHERE pet_id='pet-b'`).get() }, { pet_xp: 0, moon_gold: 10 });
assert.deepEqual({ ...sqlite.prepare(`SELECT pet_xp,moon_gold FROM telegram_pet_profiles WHERE telegram_id='switch-owner'`).get() }, { pet_xp: 900, moon_gold: 900 });
