import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { PET_INSTANCE_AUTHORITY_VERSION } from '../workers/moonboys-api/pets/wallet-reconciliation.js';

const sqlite = new DatabaseSync(':memory:');
for (const file of ['schema.sql', 'migrations/048_telegram_pet_player_expansion.sql', 'migrations/058_telegram_pet_season_completion.sql']) {
  sqlite.exec(fs.readFileSync(new URL('../workers/moonboys-api/' + file, import.meta.url), 'utf8'));
}
let beforeBatch = null, failSql = null, tail = Promise.resolve();
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { return sqlite.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() {
    if (failSql && failSql.test(this.sql)) { failSql = null; throw Error('simulated cache transaction failure'); }
    if (sqlite.prepare(this.sql).columns().length && !/\bRETURNING\b/i.test(this.sql)) return { results: sqlite.prepare(this.sql).all(...this.args), meta: { changes: 0 } };
    if (/\bRETURNING\b/i.test(this.sql)) { const results = sqlite.prepare(this.sql).all(...this.args); return { results, meta: { changes: results.length } }; }
    const result = sqlite.prepare(this.sql).run(...this.args); return { results: [], meta: { changes: Number(result.changes) } };
  }
}
const db = {
  prepare(sql) { return new Statement(sql); },
  batch(statements) {
    const task = tail.then(async () => {
      if (beforeBatch) await beforeBatch(statements);
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
    tail = task.catch(() => {}); return task;
  },
};
async function seed(id, xp = 3240, energy = 80) {
  sqlite.prepare('INSERT INTO telegram_users (telegram_id, first_name, xp, level) VALUES (?, ?, 0, 1)').run(id, id);
  sqlite.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_name, pet_xp, energy, moon_gold) VALUES (?, ?, ?, ?, 100)').run(id, id, xp, energy);
  await hooks.ensurePetStarterSeasonSlot(db, id);
  const pet = await hooks.ensureActivePetInstance(db, id);
  sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json)
    VALUES (?,?,?,'young','{}','[]')`).run(pet.pet_id, id, id);
  return pet;
}
function secondPet(owner, source) {
  const id = source.pet_id + '-other';
  sqlite.prepare(`INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type)
    VALUES (?,?,?,2,'arcade_xp')`).run(id, owner, source.season_key);
  sqlite.prepare(`INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at)
    VALUES (?,?,?,2,0,30,?)`).run(id, owner, source.season_key, PET_INSTANCE_AUTHORITY_VERSION);
  sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json)
    VALUES (?,?,?,'young','{}','[]')`).run(id, owner, id);
  return id;
}
function switchTo(owner, petId) {
  sqlite.prepare('UPDATE telegram_pet_active_slots SET pet_id=? WHERE telegram_id=?').run(petId, owner);
  sqlite.prepare('UPDATE telegram_pet_profiles SET pet_xp=0,energy=30 WHERE telegram_id=?').run(owner);
}

function atCacheSettlement(callback) {
  beforeBatch = (statements) => { if (statements[0].sql.includes('daily_chest_pending')) { beforeBatch = null; callback(); } };
}
function acceptedXp(owner, pet, amount, key = 'earlier-xp') {
  const date = new Date().toISOString().slice(0, 10);
  sqlite.prepare(`INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status)
    VALUES (?,?,?,'train',?,?,?,?,'test-week','accepted')`).run(key + owner, pet.pet_id, owner, key, amount, pet.season_key, date);
}
const seasonOnly = process.argv.includes('--season-only');
if (!seasonOnly) {
  const owner = 'cache-concurrent-xp', pet = await seed(owner);
  beforeBatch = (statements) => {
    if (!statements[0].sql.includes('daily_chest_pending')) return;
    beforeBatch = null;
    sqlite.prepare('UPDATE telegram_pet_instances SET pet_xp=pet_xp+30,source_profile_updated_at=? WHERE pet_id=?').run(PET_INSTANCE_AUTHORITY_VERSION, pet.pet_id);
  };
  const result = await hooks.processPetDailyChest(db, owner, { event_key: 'cache-with-new-xp' });
  assert.equal(result.accepted, true);
  assert.equal(sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(pet.pet_id).pet_xp, 3310,
    'Daily Cache must add its 40 XP without overwriting the 30 XP earned after preflight');
}

const switchOwner = 'cache-pet-switch', sourcePet = await seed(switchOwner), otherPet = secondPet(switchOwner, sourcePet);
atCacheSettlement(() => switchTo(switchOwner, otherPet));
const switched = await hooks.processPetDailyChest(db, switchOwner, { event_key: 'switched-cache' });
assert.equal(switched.pet.pet_id, sourcePet.pet_id);
assert.equal(sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet.pet_id).pet_xp, 3280);
assert.equal(sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(otherPet).pet_xp, 0);
assert.equal(sqlite.prepare('SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id=?').get(switchOwner).pet_xp, 0);
const switchedRetry = await hooks.processPetDailyChest(db, switchOwner, { event_key: 'switched-cache' });
assert.equal(switchedRetry.duplicate, true); assert.equal(switchedRetry.pet.pet_id, sourcePet.pet_id);
assert.equal(switchedRetry.pet.moon_gold, 140);

const replayOwner = 'cache-mini-replay', replayPet = await seed(replayOwner), replayOther = secondPet(replayOwner, replayPet);
const miniRequest = { action: 'daily_chest', request_id: 'cache-receipt' };
beforeBatch = (statements) => {
  if (!statements.some((s) => s.sql.includes('INSERT INTO telegram_pet_specialist_events') && s.args.includes('daily_chest'))) return;
  beforeBatch = null; throw Error('interrupted Bond delivery after cache settlement');
};
assert.equal((await dispatchRenderedPetAction(db, replayOwner, { id: replayOwner }, miniRequest, 'test-token')).accepted, true);
switchTo(replayOwner, replayOther);
assert.equal((await dispatchRenderedPetAction(db, replayOwner, { id: replayOwner }, miniRequest, 'test-token')).duplicate, true);
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE pet_id=? AND action='daily_chest'").get(replayOther).n, 0,
  'replaying a cache receipt must not award Bond progression to the newly selected pet');
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE pet_id=? AND action='daily_chest'").get(replayPet.pet_id).n, 1,
  'a retry can finish interrupted Bond delivery for the original pet');
await dispatchRenderedPetAction(db, replayOwner, { id: replayOwner }, miniRequest, 'test-token');
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE pet_id=? AND action='daily_chest'").get(replayPet.pet_id).n, 1);

for (const xp of [1190, 1200, 1250]) {
  const owner = 'cache-cap-' + xp, pet = await seed(owner);
  atCacheSettlement(() => acceptedXp(owner, pet, xp));
  const result = await hooks.processPetDailyChest(db, owner, { event_key: 'cap-cache' });
  assert.equal(result.accepted, true); assert.equal(result.pet_xp_awarded, Math.max(0, 1200 - xp));
  assert.equal(result.pet.pet_xp, 3240 + Math.max(0, 1200 - xp));
  assert.equal(result.pet.moon_gold, 140, 'hitting the XP cap does not remove the fixed currency reward');
}
const accountCapOwner = 'cache-account-cap', capPet = await seed(accountCapOwner), capOther = secondPet(accountCapOwner, capPet);
acceptedXp(accountCapOwner, { ...capPet, pet_id: capOther }, 1200);
assert.equal((await hooks.processPetDailyChest(db, accountCapOwner, { event_key: 'shared-cache-cap' })).pet_xp_awarded, 0, 'preserve the existing account/day Daily Cache XP cap');

await seed('cache-parallel');
const parallel = await Promise.all([0, 1, 2].map((n) => hooks.processPetDailyChest(db, 'cache-parallel', { event_key: 'parallel-' + n })));
assert.equal(parallel.filter((r) => r.accepted && !r.duplicate).length, 1);
assert.equal(sqlite.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get('cache-parallel').moon_gold, 140);
await seed('cache-same-request');
const same = await Promise.all([0, 1].map(() => hooks.processPetDailyChest(db, 'cache-same-request', { event_key: 'same-request' })));
assert.equal(same.filter((r) => r.accepted && !r.duplicate).length, 1); assert.equal(same.filter((r) => r.duplicate).length, 1);

const rollbackOwner = 'cache-rollback', rollbackPet = await seed(rollbackOwner);
failSql = /UPDATE telegram_pet_profiles SET\s+\(pet_xp,level,stage/;
await assert.rejects(hooks.processPetDailyChest(db, rollbackOwner, { event_key: 'rollback-cache' }), /simulated cache transaction failure/);
assert.equal(sqlite.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(rollbackOwner).moon_gold, 100);
assert.equal(sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(rollbackPet.pet_id).pet_xp, 3240);
assert.equal((await hooks.processPetDailyChest(db, rollbackOwner, { event_key: 'rollback-cache' })).accepted, true);
const cacheState = await hooks.buildPetMiniAppState(db, rollbackOwner, 'test-token');
assert.equal(cacheState.guidance.daily_cache.available, false); assert.equal(cacheState.guidance.daily_cache.claimed, true);
assert.equal(cacheState.guidance.daily_cache.receipt.pet_xp_awarded, 40);
assert.ok(cacheState.cooldowns.entries.some((entry) => entry.key === 'daily_cache_reset'));
const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
assert.equal((await hooks.processPetDailyChest(db, rollbackOwner, { event_key: 'tomorrow-cache', now: tomorrow })).accepted, true);
assert.equal(sqlite.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(rollbackOwner).moon_gold, 180);

const staleOwner = 'cache-archived-source', stalePet = await seed(staleOwner);
atCacheSettlement(() => sqlite.prepare("UPDATE telegram_pet_instances SET status='archived' WHERE pet_id=?").run(stalePet.pet_id));
assert.equal((await hooks.processPetDailyChest(db, staleOwner, { event_key: 'archived-cache' })).accepted, false);
assert.equal(sqlite.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(staleOwner).moon_gold, 100);

const seasonOwner = 'season-cache-recovery', seasonPet = await seed(seasonOwner);
sqlite.prepare(`INSERT INTO telegram_pet_season_state (telegram_id,season_key,season_xp)
  VALUES (?,?,1000) ON CONFLICT(telegram_id,season_key) DO UPDATE SET season_xp=1000`).run(seasonOwner, seasonPet.season_key);
sqlite.prepare(`INSERT INTO telegram_pet_reward_claims
  (claim_id,telegram_id,source,idempotency_key,day_key,status,requested_rewards,applied_rewards,metadata)
  VALUES (?,?,'wallet_reconciliation_recovery_required','moonpet_wallet_reconcile_recovery_required:v1',?,'pending','{}','{}','{}')`)
  .run('freeze-season-cache', seasonOwner, new Date().toISOString().slice(0, 10));
const blockedSeason = await hooks.claimPetSeasonReward(db, seasonOwner, 'street', 'season-cache-blocked');
assert.equal(blockedSeason.accepted, false);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM telegram_pet_season_reward_claims WHERE telegram_id=?').get(seasonOwner).n, 0,
  'a rejected reward must not be marked claimed or disappear from the season board');
sqlite.prepare("DELETE FROM telegram_pet_reward_claims WHERE claim_id='freeze-season-cache'").run();
// A marker left by the old implementation is not proof of payment.
sqlite.prepare(`INSERT INTO telegram_pet_season_reward_claims (telegram_id,season_key,tier_id,event_key)
  VALUES (?,?,'street','legacy-unpaid-marker')`).run(seasonOwner, seasonPet.season_key);
const beforeSeason = await hooks.buildPetMiniAppState(db, seasonOwner, 'test-token');
assert.equal(beforeSeason.guidance.season.tiers.find((t) => t.tier_id === 'street').claimed_at, null);
const paidSeason = await hooks.claimPetSeasonReward(db, seasonOwner, 'street', 'season-cache-retry');
assert.equal(paidSeason.accepted, true); assert.equal(paidSeason.duplicate, false);
assert.equal(sqlite.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(seasonOwner).moon_gold, 180);
assert.equal((await hooks.claimPetSeasonReward(db, seasonOwner, 'street', 'season-cache-retry-2')).duplicate, true);
assert.equal(sqlite.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(seasonOwner).moon_gold, 180);
assert.ok((await hooks.buildPetMiniAppState(db, seasonOwner, 'test-token')).guidance.season.tiers.find((t) => t.tier_id === 'street').claimed_at);
sqlite.prepare('DELETE FROM telegram_pet_season_reward_claims WHERE telegram_id=?').run(seasonOwner);
assert.ok((await hooks.buildPetMiniAppState(db, seasonOwner, 'test-token')).guidance.season.tiers.find((t) => t.tier_id === 'street').claimed_at,
  'payment remains authoritative if the compatibility marker was not written');

sqlite.close();
console.log('Moonpet Daily Cache and season reward settlement tests passed.');
