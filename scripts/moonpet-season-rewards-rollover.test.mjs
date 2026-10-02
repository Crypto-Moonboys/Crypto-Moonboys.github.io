import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { buildPetGuidanceCandidates, choosePetNextAction } from '../workers/moonboys-api/pets/player-guidance.js';
import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';

const beforeRollover = new Date('2026-09-30T23:59:59.999Z');
const afterRollover = new Date('2026-10-01T00:00:00.001Z');
const originalSeason = hooks.getPetSeasonInfo(beforeRollover).key;
const currentSeason = hooks.getPetSeasonInfo(afterRollover).key;
async function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  for (const file of ['schema.sql', 'migrations/048_telegram_pet_player_expansion.sql', 'migrations/058_telegram_pet_season_completion.sql']) {
    sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/' + file, import.meta.url), 'utf8'));
  }
  let beforeBatch = null, failedRead = null, failedWrite = null, tail = Promise.resolve();
  class Statement {
    constructor(query, args = []) { this.sql = query; this.args = args; }
    bind(...args) { return new Statement(this.sql, args); }
    async first() { if (failedRead?.test(this.sql)) throw Error('failed season read'); return sql.prepare(this.sql).get(...this.args) || null; }
    async all() { if (failedRead?.test(this.sql)) return { success: false, results: [] }; return { success: true, results: sql.prepare(this.sql).all(...this.args) }; }
    async run() {
      if (failedWrite?.test(this.sql)) { failedWrite = null; throw Error('failed season write'); }
      if (sql.prepare(this.sql).columns().length) { const results = sql.prepare(this.sql).all(...this.args); return { success: true, results, meta: { changes: /\bRETURNING\b/i.test(this.sql) ? results.length : 0 } }; }
      return { success: true, results: [], meta: { changes: Number(sql.prepare(this.sql).run(...this.args).changes) } };
    }
  }
  const db = {
    prepare(query) { return new Statement(query); },
    batch(statements) {
      const result = tail.then(async () => {
        if (beforeBatch) await beforeBatch(statements);
        sql.exec('BEGIN IMMEDIATE');
        try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results; }
        catch (error) { sql.exec('ROLLBACK'); throw error; }
      });
      tail = result.catch(() => {}); return result;
    },
  };
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, owner);
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_name,pet_xp,energy,moon_gold) VALUES (?,?,3240,80,100)').run(owner, owner);
  await hooks.ensurePetStarterSeasonSlot(db, owner, beforeRollover);
  const pet = await hooks.ensureActivePetInstance(db, owner);
  sql.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json)
    VALUES (?,?,?,'young','{}','[]')`).run(pet.pet_id, owner, owner);
  function xp(season, amount) {
    sql.prepare(`INSERT INTO telegram_pet_season_state (telegram_id,season_key,season_xp) VALUES (?,?,?)
      ON CONFLICT(telegram_id,season_key) DO UPDATE SET season_xp=excluded.season_xp`).run(owner, season, amount);
  }
  const options = { now: afterRollover, season_key: originalSeason, require_source_season: true };
  return { sql, db, owner, pet, xp, options,
    gold: () => sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(owner).moon_gold,
    beforeBatch(callback) { beforeBatch = callback; }, failRead(pattern) { failedRead = pattern; }, failWrite(pattern) { failedWrite = pattern; },
  };
}

test('a tier unlocked just before rollover stays visible and pays its original season exactly once afterward', async () => {
  const f = await fixture('season-boundary');
  f.xp(originalSeason, 249);
  assert.equal((await hooks.getPetSeasonRewardState(f.db, f.owner, { now: beforeRollover })).tiers[0].unlocked, false);
  const earning = await hooks.awardPetReward(f.db, { telegram_id: f.owner, pet_id: f.pet.pet_id, season_key: f.pet.season_key,
    source: 'pet_action', idempotency_key: 'boundary-xp', event_key: 'boundary-xp', event_type: 'train', rewards: { pet_xp: 1 }, now: beforeRollover });
  assert.equal(earning.accepted, true);
  const before = await hooks.getPetSeasonRewardState(f.db, f.owner, { now: beforeRollover });
  assert.equal(before.tiers[0].unlocked, true);
  const after = await hooks.getPetSeasonRewardState(f.db, f.owner, { now: afterRollover });
  assert.equal(after.season.key, currentSeason); assert.equal(after.season_xp, 0); assert.equal(after.tiers[0].unlocked, false);
  const saved = after.historical_seasons[0];
  assert.equal(saved.season_key, originalSeason); assert.equal(saved.season_xp, 250);
  assert.equal(saved.tiers[0].season_key, originalSeason); assert.equal(saved.tiers[0].claimed_at, null);
  const guidance = { pet: { health: 100, hunger: 0, cleanliness: 100, energy: 100, happiness: 100 }, season: { key: currentSeason, tiers: after.all_tiers } };
  assert.equal(buildPetGuidanceCandidates(guidance)[0].callback_data, `pet:season:claim:street:${originalSeason}`);
  assert.equal(choosePetNextAction(guidance).callback_data, `pet:season:claim:street:${originalSeason}`);
  const claim = await hooks.claimPetSeasonReward(f.db, f.owner, 'street', 'boundary-claim', f.options);
  assert.equal(claim.accepted, true); assert.equal(claim.season_key, originalSeason); assert.equal(f.gold(), 180);
  assert.ok(claim.state.historical_seasons[0].tiers[0].claimed_at);
  assert.equal(claim.state.tiers[0].claimed_at, null);
  const retry = await hooks.claimPetSeasonReward(f.db, f.owner, 'street', 'boundary-retry', f.options);
  assert.equal(retry.duplicate, true); assert.equal(f.gold(), 180);
  const receipt = f.sql.prepare("SELECT * FROM telegram_pet_reward_claims WHERE source='pet_season_reward'").get();
  assert.equal(receipt.idempotency_key, `season_reward:${f.owner}:${originalSeason}:street`);
  assert.equal(JSON.parse(receipt.metadata).context.season_key, originalSeason);
  assert.equal(f.sql.prepare('SELECT season_key FROM telegram_pet_season_reward_claims').get().season_key, originalSeason);
  assert.equal(f.sql.prepare('SELECT season_key FROM telegram_pet_instances WHERE pet_id=?').get(f.pet.pet_id).season_key, f.pet.season_key);
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE season_key=?').get(originalSeason).season_xp, 250);
  f.xp(currentSeason, 250);
  assert.equal((await hooks.claimPetSeasonReward(f.db, f.owner, 'street', 'current-claim', { ...f.options, season_key: currentSeason })).accepted, true);
  assert.equal(f.gold(), 260); f.sql.close();
});

test('claim sources cannot be omitted by the Mini App, forged, moved to another user, or redirected by request replay', async () => {
  const f = await fixture('season-source'); f.xp(originalSeason, 250); f.xp(currentSeason, 250);
  const noSource = await dispatchRenderedPetAction(f.db, f.owner, { id: f.owner }, { action: 'season_claim', tier_id: 'street', request_id: 'missing-source' }, 'token');
  assert.equal(noSource.reason, 'season_source_required'); assert.equal(f.gold(), 100);
  for (const season_key of ['pet-s2026-005', 'pet-s2027-001', 'another-user:pet-s2026-003', 'pet-s2025-001']) {
    assert.equal((await hooks.claimPetSeasonReward(f.db, f.owner, 'street', 'invalid-' + season_key, { ...f.options, season_key })).accepted, false);
  }
  assert.equal((await hooks.claimPetSeasonReward(f.db, f.owner, 'street', 'immutable-request', f.options)).accepted, true);
  assert.equal((await hooks.claimPetSeasonReward(f.db, f.owner, 'street', 'immutable-request', { ...f.options, season_key: currentSeason })).reason, 'season_claim_source_mismatch');
  assert.equal(f.gold(), 180);
  f.sql.prepare(`INSERT INTO telegram_pet_season_reward_claims (telegram_id,season_key,tier_id,event_key)
    VALUES (?,?,'street','legacy-immutable-request')`).run(f.owner, 'pet-s2026-002');
  assert.equal((await hooks.claimPetSeasonReward(f.db, f.owner, 'street', 'legacy-immutable-request', { ...f.options, season_key: currentSeason })).reason, 'season_claim_source_mismatch');
  assert.equal(f.gold(), 180);
  const other = await fixture('season-other');
  assert.equal((await hooks.claimPetSeasonReward(other.db, other.owner, 'street', 'immutable-request', other.options)).reason, 'season_tier_locked');
  assert.equal(other.gold(), 100); other.sql.close(); f.sql.close();
});

test('season eligibility and request provenance are checked inside the atomic payout', async () => {
  const f = await fixture('season-transaction'); f.xp(originalSeason, 250); f.xp(currentSeason, 250);
  let changed = false;
  f.beforeBatch((statements) => {
    if (changed || !statements.some((s) => s.sql.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims'))) return;
    changed = true; f.xp(originalSeason, 249);
  });
  assert.equal((await hooks.claimPetSeasonReward(f.db, f.owner, 'street', 'xp-race', f.options)).accepted, false);
  assert.equal(f.gold(), 100); f.xp(originalSeason, 250); f.beforeBatch(null);
  const claims = await Promise.all([originalSeason, currentSeason].map((season_key) =>
    hooks.claimPetSeasonReward(f.db, f.owner, 'street', 'same-concurrent-request', { ...f.options, season_key })));
  assert.equal(claims.filter((claim) => claim.accepted).length, 1); assert.equal(f.gold(), 180);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_season_reward' AND status='awarded'").get().n, 1);
  f.sql.close();
});

test('failed delivery retries safely and historical read failures do not hide saved claims', async () => {
  const f = await fixture('season-recovery'); f.xp(originalSeason, 250);
  f.failWrite(/INSERT OR IGNORE INTO telegram_pet_reward_claims/);
  await assert.rejects(hooks.claimPetSeasonReward(f.db, f.owner, 'street', 'interrupted-request', f.options), /failed season write/);
  assert.equal(f.gold(), 100);
  const recovered = await hooks.claimPetSeasonReward(f.db, f.owner, 'street', 'interrupted-request', f.options);
  assert.equal(recovered.accepted, true); assert.equal(f.gold(), 180);
  f.failRead(/SELECT season_key, season_xp FROM telegram_pet_season_state/);
  await assert.rejects(hooks.getPetSeasonRewardState(f.db, f.owner, { now: afterRollover }), /pet_state_read_unavailable/);
  f.failRead(null);
  assert.ok((await hooks.getPetSeasonRewardState(f.db, f.owner, { now: afterRollover })).historical_seasons[0].tiers[0].claimed_at);
  assert.equal(f.gold(), 180); f.sql.close();
});

test('historical paid receipts remain visible without a legacy season aggregate and never unlock other tiers', async () => {
  const f = await fixture('season-receipt-history');
  f.sql.prepare(`INSERT INTO telegram_pet_reward_claims
    (claim_id,pet_id,telegram_id,source,idempotency_key,day_key,status,requested_rewards,applied_rewards,metadata,awarded_at)
    VALUES ('retained-history',?,?,'pet_season_reward',?,'2026-09-30','awarded','{}','{"moon_gold":80}','{}','2026-09-30 23:59:59')`)
    .run(f.pet.pet_id, f.owner, `season_reward:${f.owner}:${originalSeason}:street`);
  const state = await hooks.getPetSeasonRewardState(f.db, f.owner, { now: afterRollover });
  assert.equal(state.historical_seasons[0].season_key, originalSeason);
  assert.equal(state.historical_seasons[0].tiers.length, 1);
  assert.equal(state.historical_seasons[0].tiers[0].claimed_at, '2026-09-30 23:59:59');
  assert.equal(state.historical_seasons[0].tiers[0].unlocked, false);
  assert.equal((await hooks.claimPetSeasonReward(f.db, f.owner, 'neon', 'not-earned', f.options)).reason, 'season_tier_locked');
  assert.equal(f.gold(), 100);
  assert.equal(f.sql.prepare("SELECT applied_rewards FROM telegram_pet_reward_claims WHERE claim_id='retained-history'").get().applied_rewards, '{"moon_gold":80}');
  f.sql.close();
});
