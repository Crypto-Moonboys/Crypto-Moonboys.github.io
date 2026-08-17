import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureGameplayAuthority, requirePersistedGameplayAuthority, requirePersistedPlayerAuthority } from '../workers/moonboys-api/pets/gameplay-authority.js';

const migration = readFileSync(new URL('../workers/moonboys-api/migrations/064_moonpet_runtime_pet_id_authority.sql', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
for (const column of ['telegram_pet_activity_sessions ADD COLUMN pet_id', 'telegram_pet_runs ADD COLUMN pet_id', 'telegram_pet_daily_runs ADD COLUMN pet_id',
  'telegram_pet_arena_queue ADD COLUMN pet_id', 'player1_pet_id', 'telegram_pet_kaiju_queue ADD COLUMN pet_id', 'telegram_pet_reward_claims ADD COLUMN pet_id',
  'telegram_pet_personality_traits ADD COLUMN pet_id', 'telegram_pet_memories ADD COLUMN pet_id', 'telegram_pet_boss_victories ADD COLUMN pet_id']) {
  assert.ok(migration.includes(column), `migration must persist ${column}`);
}
assert.match(migration, /CREATE TABLE telegram_pet_reward_authority/, 'reward settlement must have immutable pet authority');
for (const guard of ['require_activity_pet_id', 'require_run_pet_id', 'require_daily_run_pet_id', 'require_arena_battle_pet_id', 'require_kaiju_match_pet_id', 'require_identity_event_pet_id']) {
  assert.ok(migration.includes(`CREATE TRIGGER ${guard}`), `new writes must be guarded by ${guard}`);
}
assert.match(migration, /No historical row is backfilled from today's\s+-- active selector/, 'legacy account-only rows must remain readable without invented ownership');
assert.doesNotMatch(migration, /UPDATE\s+telegram_pet_\w+\s+SET\s+pet_id/i, 'migration must never remap old gameplay to the currently active pet');

let activePet = 'pet-a';
const db = { prepare() { return { bind(owner) { return { async first() { return { pet_id: activePet, telegram_id: owner, season_key: 's1' }; } }; } }; } };
const activity = await captureGameplayAuthority(db, 'owner');
const dailyRun = await captureGameplayAuthority(db, 'owner');
const arena = { player1_telegram_id: 'owner', player1_pet_id: activity.pet_id, player2_telegram_id: 'rival', player2_pet_id: 'pet-rival', season_key: 's1' };
const kaiju = { telegram_id: 'owner', pet_id: activity.pet_id, season_key: 's1' };
activePet = 'pet-b';
assert.equal(requirePersistedGameplayAuthority(activity, 'owner').pet_id, 'pet-a', 'activity stays with participating pet');
assert.equal(requirePersistedGameplayAuthority(dailyRun, 'owner').pet_id, 'pet-a', 'daily run stays with participating pet');
assert.equal(requirePersistedPlayerAuthority(arena, 1, 'owner').pet_id, 'pet-a', 'Arena stays with participating pet');
assert.equal(requirePersistedGameplayAuthority(kaiju, 'owner').pet_id, 'pet-a', 'Kaiju stays with participating pet');
assert.equal(requirePersistedGameplayAuthority(activity, 'owner').pet_id, requirePersistedGameplayAuthority(activity, 'owner').pet_id, 'duplicate retries preserve pet_id');
assert.throws(() => requirePersistedGameplayAuthority(activity, 'rival'), /persisted_pet_authority_required/, 'reward settlement cannot credit another owner/pet');
assert.throws(() => requirePersistedGameplayAuthority({ telegram_id: 'legacy' }, 'legacy'), /persisted_pet_authority_required/, 'legacy rows are readable but cannot settle new rewards');

const rewardWrapper = worker.slice(worker.indexOf('async function awardPetReward'), worker.indexOf('async function getPetActiveSlotPendingWork'));
assert.doesNotMatch(rewardWrapper, /findActivePetSlot|readActivePetInstance|getPetProfile|mirrorPetProfileToActiveInstance/, 'reward settlement must not read the active selector');
console.log('Moonpet immutable pet_id authority checks passed.');
