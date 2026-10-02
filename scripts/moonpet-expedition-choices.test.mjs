import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { PET_EXPEDITION_TIERS, getPetExpedition, resolvePetExpeditionReward } from '../workers/moonboys-api/pets/economy-expansion.js';
import { PET_INSTANCE_AUTHORITY_VERSION } from '../workers/moonboys-api/pets/wallet-reconciliation.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
sqlite.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
for (const seasonMigration of ['058_telegram_pet_season_completion.sql', '061_moonpet_season_economy_calibration.sql']) {
  sqlite.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/' + seasonMigration, import.meta.url), 'utf8'));
}
let beforeBatch = null, tail = Promise.resolve();
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { return sqlite.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() {
    if (sqlite.prepare(this.sql).columns().length && !/\bRETURNING\b/i.test(this.sql)) return { results: sqlite.prepare(this.sql).all(...this.args), meta: { changes: 0 } };
    if (/\bRETURNING\b/i.test(this.sql)) { const results = sqlite.prepare(this.sql).all(...this.args); return { results, meta: { changes: results.length } }; }
    const result = sqlite.prepare(this.sql).run(...this.args); return { results: [], meta: { changes: Number(result.changes) } };
  }
}
const db = {
  prepare(sql) { return new Statement(sql); },
  batch(statements) {
    const task = tail.then(async () => {
      if (beforeBatch && statements[0].sql.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims') && statements[0].args.includes('pet_expedition')) {
        const change = beforeBatch; beforeBatch = null; await change();
      }
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
    tail = task.catch(() => {}); return task;
  },
};
async function seed(id, xp = 23040, energy = 100, phase = 'young') {
  sqlite.prepare('INSERT INTO telegram_users (telegram_id, first_name, xp, level) VALUES (?, ?, 0, 1)').run(id, id);
  sqlite.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_name, pet_xp, energy, moon_gold) VALUES (?, ?, ?, ?, 100)').run(id, id, xp, energy);
  await hooks.ensurePetStarterSeasonSlot(db, id);
  const pet = await hooks.ensureActivePetInstance(db, id);
  sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id, telegram_id, identity_seed, phase, incubation_json, innate_traits_json)
    VALUES (?, ?, ?, ?, '{}', '[]')`).run(pet.pet_id, id, id, phase);
  return pet;
}
const owner = 'expedition-owner';
const pet = await seed(owner);
const perform = (key, destination = '', player = owner, now = new Date()) => hooks.runPetCrystalExpedition(db, player, now, key, destination);
const accepted = await perform('original');
assert.equal(accepted.accepted, true);
const event = sqlite.prepare("SELECT pet_id, season_key FROM telegram_pet_events WHERE telegram_id=? AND event_type='economy_expedition'").get(owner);
assert.equal(event.pet_id, pet.pet_id, 'Expedition XP and energy must settle against the captured pet');
assert.equal(event.season_key, pet.season_key);
assert.equal((await perform('second')).accepted, true);
assert.equal((await perform('third')).accepted, true);
const retry = await perform('third');
assert.equal(retry.accepted, true, 'the last accepted attempt must remain retryable after the daily limit');
assert.equal(retry.duplicate, true);
assert.equal(retry.pet_xp_awarded, 0);
assert.equal((await perform('fourth')).reason, 'expedition_daily_limit');
const afterLimit = await hooks.buildPetMiniAppState(db, owner, 'test-token');
assert.ok(afterLimit.guidance.economy.expedition_options.every((entry) => !entry.available));
assert.equal(afterLimit.guidance.economy.expedition_history.length, 3);
assert.ok(afterLimit.cooldowns.entries.some((entry) => entry.key === 'expedition_reset'));
const tomorrow = new Date(Date.now() + 86400000);
assert.equal((await perform('third', 'dust_tunnels', owner, tomorrow)).duplicate, true, 'a receipt survives UTC rollover and a changed destination');
assert.equal((await hooks.getPetEconomyState(db, owner, null, tomorrow)).expedition_attempts_left, 3);

await seed('low-energy', 23040, 12);
const lowEnergy = await hooks.getPetEconomyState(db, 'low-energy');
assert.deepEqual(lowEnergy.expedition_options.map((entry) => entry.available), [true, false, false]);
assert.match(lowEnergy.guidance_actions.find((entry) => entry.key === 'economy:expedition').title, /Dust Tunnels/);
assert.equal((await perform('cheap-route', 'dust_tunnels', 'low-energy')).accepted, true, 'higher-level pets can choose a cheaper earlier destination');
await seed('low-level', 0);
assert.deepEqual((await hooks.getPetEconomyState(db, 'low-level')).expedition_options.map((entry) => entry.unlocked), [true, false, false]);
for (const key of ['guardian_rift', 'crystal_caves', '__proto__', {}, null, 1]) {
  assert.equal((await perform('locked-' + String(key), key, 'low-level')).reason, 'expedition_locked');
}
assert.equal(getPetExpedition(25).key, 'guardian_rift', 'older clients retain their original default destination');
for (const destination of PET_EXPEDITION_TIERS) {
  const id = 'destination-' + destination.key;
  const target = await seed(id);
  const result = await dispatchRenderedPetAction(db, id, { id }, { action: 'expedition', request_id: 'chosen-destination',
    pet_id: target.pet_id, expedition_key: destination.key, rewards: { moon_gold: 999999 }, energy_cost: 0 }, 'test-token');
  assert.equal(result.accepted, true);
  assert.equal(result.expedition.key, destination.key);
  const expected = resolvePetExpeditionReward(new Date().toISOString().slice(0, 10), id, 1, 25, destination.key);
  assert.equal(result.rewards.moon_gold, expected.reward.moon_gold, 'client reward overrides must be ignored');
  const settledPet = sqlite.prepare('SELECT pet_xp,energy FROM telegram_pet_instances WHERE pet_id=?').get(target.pet_id);
  assert.equal(settledPet.pet_xp, 23052);
  assert.equal(settledPet.energy, 100 - destination.energy);
  const stored = sqlite.prepare("SELECT metadata FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_expedition'").get(id);
  assert.equal(JSON.parse(stored.metadata).context.expedition_key, destination.key);
}

const switchOwner = 'switch-in-flight';
const original = await seed(switchOwner);
const otherPet = original.pet_id + '-other';
sqlite.prepare(`INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type)
  VALUES (?,?,?,2,'arcade_xp')`).run(otherPet, switchOwner, original.season_key);
sqlite.prepare(`INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at)
  VALUES (?,?,?,2,120,3,?)`).run(otherPet, switchOwner, original.season_key, PET_INSTANCE_AUTHORITY_VERSION);
sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json)
  VALUES (?,?,?,'young','{}','[]')`).run(otherPet, switchOwner, otherPet);
beforeBatch = () => {
  sqlite.prepare('UPDATE telegram_pet_active_slots SET pet_id=? WHERE telegram_id=?').run(otherPet, switchOwner);
  sqlite.prepare('UPDATE telegram_pet_profiles SET pet_xp=120,energy=3 WHERE telegram_id=?').run(switchOwner);
};
const switched = await perform('source-pet', 'guardian_rift', switchOwner);
assert.equal(switched.accepted, true, 'an in-flight expedition keeps its captured pet and cost');
assert.deepEqual({ ...sqlite.prepare('SELECT pet_xp,energy FROM telegram_pet_instances WHERE pet_id=?').get(original.pet_id) }, { pet_xp: 23052, energy: 76 });
assert.deepEqual({ ...sqlite.prepare('SELECT pet_xp,energy FROM telegram_pet_instances WHERE pet_id=?').get(otherPet) }, { pet_xp: 120, energy: 3 });
const switchedRetry = await perform('source-pet', 'dust_tunnels', switchOwner);
assert.equal(switchedRetry.duplicate, true);
assert.equal(switchedRetry.expedition.key, 'guardian_rift');
assert.equal(switchedRetry.receipt.pet_id, original.pet_id);
assert.equal(switchedRetry.receipt.energy_cost, 24);
assert.equal((await hooks.runPetCrystalExpedition(db, switchOwner, new Date(), 'stale-ui', 'dust_tunnels', original.pet_id)).reason, 'expedition_pet_changed');

await seed('egg-expedition', 23040, 100, 'egg');
assert.equal((await perform('egg-request', 'dust_tunnels', 'egg-expedition')).reason, 'moon_egg_must_hatch');
for (const change of ['energy', 'level']) {
  const id = 'changed-' + change, target = await seed(id);
  beforeBatch = () => sqlite.prepare('UPDATE telegram_pet_instances SET ' + (change === 'energy' ? 'energy=0' : 'pet_xp=0') + ',source_profile_updated_at=? WHERE pet_id=?').run(PET_INSTANCE_AUTHORITY_VERSION, target.pet_id);
  const result = await perform('changed-request', 'guardian_rift', id);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, change === 'energy' ? 'pet_tired' : 'expedition_state_changed');
  assert.equal(result.expedition.energy, 24, 'a rejected destination must still report its actual energy requirement');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_expedition'").get(id).n, 0);
  assert.equal(sqlite.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(id).moon_gold, 100);
}

const race = 'expedition-race';
await seed(race);
const racing = await Promise.all([1, 2, 3, 4].map((i) => perform('race-' + i, 'dust_tunnels', race)));
assert.equal(racing.filter((entry) => entry.accepted).length, 1, 'distinct concurrent requests cannot reuse one attempt ordinal');
assert.ok(racing.filter((entry) => !entry.accepted).every((entry) => entry.reason === 'expedition_state_changed'));
assert.equal((await perform('race-next', 'dust_tunnels', race)).accepted, true);
const lastSlot = await Promise.all([1, 2].map((i) => perform('last-slot-' + i, 'dust_tunnels', race)));
assert.equal(lastSlot.filter((entry) => entry.accepted).length, 1);
assert.equal(lastSlot.find((entry) => !entry.accepted).reason, 'expedition_daily_limit');
const attempts = sqlite.prepare("SELECT json_extract(metadata,'$.context.attempt') attempt FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_expedition' ORDER BY attempt").all(race);
assert.deepEqual(attempts.map((entry) => entry.attempt), [1, 2, 3]);
const same = 'same-expedition-key';
await seed(same);
const duplicates = await Promise.all(['dust_tunnels', 'guardian_rift'].map((key) => perform('same-key', key, same)));
assert.equal(duplicates.filter((entry) => entry.accepted && !entry.duplicate).length, 1);
assert.equal(duplicates.filter((entry) => entry.duplicate).length, 1);
assert.equal(duplicates[0].expedition.key, duplicates[1].expedition.key, 'conflicting duplicate choices must return the original destination');

const cappedOwner = 'capped-expedition', cappedPet = await seed(cappedOwner);
sqlite.prepare(`INSERT INTO telegram_pet_events
  (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status,metadata)
  VALUES ('cap-evidence',?,?,'fixture','cap-evidence',1199,?,?,'fixture','accepted','{}')`)
  .run(cappedPet.pet_id, cappedOwner, cappedPet.season_key, new Date().toISOString().slice(0, 10));
const capped = await perform('capped', 'dust_tunnels', cappedOwner);
assert.equal(capped.accepted, true);
assert.equal(capped.pet_xp_awarded, 1, 'destination selection must retain the source pet daily XP cap');
assert.equal(sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(cappedPet.pet_id).pet_xp, 23041);

sqlite.prepare(`INSERT INTO telegram_pet_reward_claims
  (claim_id,telegram_id,source,idempotency_key,day_key,status,requested_rewards,applied_rewards,metadata)
  VALUES ('legacy-expedition',?,'pet_expedition','legacy-expedition','2026-01-01','awarded','{}','{"moon_gold":24,"pet_xp":12}',?)`)
  .run(owner, JSON.stringify({ context: { expedition_key: 'dust_tunnels', energy_cost: 12, attempt: 1 } }));
const legacy = await perform('legacy-expedition', 'guardian_rift');
assert.equal(legacy.duplicate, true);
assert.equal(legacy.receipt.pet_id, null, 'historical account receipts must not be reassigned to the current pet');
assert.equal(legacy.receipt.rewards.moon_gold, 24);
assert.equal(legacy.pet_xp_awarded, 0);

sqlite.close();
console.log('Moonpet expedition choices, ownership and retry tests passed.');
