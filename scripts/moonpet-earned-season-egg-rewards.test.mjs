import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, hooks, clockFixture } from './moonpet-audit-regression-fixture.mjs';

const oldQuarter = 'pet-s2026-003', quarter = 'pet-s2026-004';
const protectedState = f => ({
  pets: f.sql.prepare(`SELECT pet_id,season_key,pet_xp,level,stage,hunger,happiness,cleanliness,energy,health,
    streak_days,last_active_day,last_decay_at FROM telegram_pet_instances ORDER BY pet_id`).all(),
  lifecycle: f.sql.prepare('SELECT * FROM telegram_pet_lifecycle_by_pet ORDER BY pet_id').all(),
  scores: f.sql.prepare('SELECT telegram_id,season_key,season_xp,daily_xp,weekly_xp FROM telegram_pet_season_state ORDER BY season_key').all(),
});
const claim = (f, season_key = oldQuarter, request_id = 'earned-tier') => f.act({ action: 'season_claim',
  tier_id: 'street', season_key, request_id });

async function eggs(f, count) {
  for (let slot = 2; slot <= count; slot++) f.pet(`owned-${slot}`, oldQuarter, 200 * slot, slot);
  const owned = f.sql.prepare("SELECT * FROM telegram_pet_instances WHERE status='active' ORDER BY slot_number").all();
  for (const pet of owned) {
    f.active(pet.pet_id, pet.season_key);
    const deleted = await f.act({ action: 'delete_pet_slot', pet_id: pet.pet_id, confirm_pet_id: pet.pet_id, confirmed: true });
    assert.equal(deleted.accepted, true, JSON.stringify(deleted));
  }
  for (const source of [oldQuarter, quarter]) f.sql.prepare('INSERT INTO telegram_pet_season_state(telegram_id,season_key,season_xp) VALUES(?,?,300)').run(f.owner, source);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_lifecycle_by_pet l JOIN telegram_pet_instances i USING(pet_id) WHERE i.status='active' AND l.phase='egg'").get().n, count);
  // Establish the same authoritative projection the player reviews before a claim.
  await hooks.getPetSeasonRewardState(f.db, f.owner);
}

for (const count of [1, 2, 3]) test(`${count} replacement eggs can collect old and current earned tiers without pet progress`, async t => {
  const f = fixture(`95310${count}`), clock = clockFixture(f);
  t.after(() => { clock.restore(); f.sql.close(); });
  await eggs(f, count);
  const original = protectedState(f), wallet = f.sql.prepare('SELECT moon_gold,style_tokens FROM telegram_pet_profiles').get();
  const results = await Promise.all([claim(f), claim(f)]);
  assert.ok(results.every(result => result.accepted));
  assert.equal(results.filter(result => !result.duplicate).length, 1);
  assert.deepEqual(protectedState(f), original, 'currency settlement cannot decay or advance an egg');
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, wallet.moon_gold + 80);
  assert.equal(f.sql.prepare('SELECT style_tokens FROM telegram_pet_profiles').get().style_tokens, wallet.style_tokens + 1);
  const other = f.sql.prepare("SELECT pet_id,season_key FROM telegram_pet_instances WHERE status='active' ORDER BY slot_number DESC").get();
  f.active(other.pet_id, other.season_key);
  assert.equal((await claim(f, oldQuarter, 'new-request-same-tier')).duplicate, true);
  assert.equal((await claim(f, quarter, 'earned-tier')).reason, 'season_claim_source_mismatch');
  assert.equal((await claim(f, quarter, 'new-quarter-tier')).accepted, true);
  assert.deepEqual(protectedState(f), original);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_season_reward' AND status='awarded'").get().n, 2);
  const receipts = f.sql.prepare("SELECT idempotency_key,applied_rewards FROM telegram_pet_reward_claims WHERE source='pet_season_reward' ORDER BY idempotency_key").all();
  assert.deepEqual(receipts.map(row => row.idempotency_key), [oldQuarter, quarter].map(q => `season_reward:${f.owner}:${q}:street`));
  assert.ok(receipts.every(row => JSON.parse(row.applied_rewards).pet_xp === 0));
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_instances WHERE status='archived'").get().n, count, 'historical ownership remains');
});

for (const race of ['switch', 'hatch', 'delete']) test(`egg season settlement rejects a concurrent ${race}`, async t => {
  const f = fixture(`95320${['switch','hatch','delete'].indexOf(race)}`), clock = clockFixture(f);
  t.after(() => { clock.restore(); f.sql.close(); });
  await eggs(f, 2);
  const selected = f.sql.prepare('SELECT pet_id,season_key FROM telegram_pet_active_slots').get();
  const wallet = f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold;
  let injected = false;
  f.db.beforeBatch = statements => {
    if (!statements[0].args.includes('pet_season_reward')) return;
    injected = true; f.db.beforeBatch = null;
    if (race === 'hatch') f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='young' WHERE pet_id=?").run(selected.pet_id);
    else if (race === 'delete') f.sql.prepare("UPDATE telegram_pet_instances SET status='archived' WHERE pet_id=?").run(selected.pet_id);
    else { const other = f.sql.prepare("SELECT pet_id,season_key FROM telegram_pet_instances WHERE status='active' AND pet_id<>?").get(selected.pet_id); f.active(other.pet_id, other.season_key); }
  };
  assert.equal((await claim(f)).accepted, false);
  assert.equal(injected, true);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, wallet);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_season_reward'").get().n, 0);
});

test('failed egg currency transaction rolls back and retries once; source and policy cannot be forged', async t => {
  const f = fixture('953300'), clock = clockFixture(f);
  t.after(() => { clock.restore(); f.sql.close(); });
  await eggs(f, 1);
  const original = protectedState(f), wallet = f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold;
  for (const season of ['pet-s2026-005','pet-s2027-001','foreign:pet-s2026-003','pet-s2025-001']) assert.equal((await claim(f, season, season)).accepted, false);
  assert.equal((await f.act({action:'season_claim',tier_id:'street',request_id:'missing-quarter'})).reason,'season_source_required');
  assert.equal((await f.act({action:'season_claim',tier_id:'not-a-tier',season_key:oldQuarter})).reason,'invalid_season_tier');
  f.sql.exec("CREATE TRIGGER fail_currency BEFORE UPDATE OF moon_gold ON telegram_pet_profiles WHEN NEW.moon_gold>OLD.moon_gold BEGIN SELECT RAISE(ABORT,'currency_interruption'); END");
  await assert.rejects(claim(f), /currency_interruption/);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, wallet);
  assert.deepEqual(protectedState(f), original);
  f.sql.exec('DROP TRIGGER fail_currency');
  assert.equal((await claim(f)).accepted, true);
  assert.equal((await claim(f)).duplicate, true);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, wallet + 80);
  const other = fixture('953301'); t.after(() => other.sql.close());
  assert.equal((await claim(other)).accepted, false, 'another account has no entitlement');
  const pet = f.sql.prepare('SELECT pet_id,season_key FROM telegram_pet_active_slots').get();
  await assert.rejects(hooks.awardPetReward(f.db, {telegram_id:f.owner,...pet,source:'pet_action',idempotency_key:'forged-policy',
    currency_only_egg_season_reward:true,rewards:{pet_xp:100}}), /invalid_pet_reward_context/);
});

test('hatched claim retains the existing claim-time evolution Style bonus', async t => {
  const f = fixture('953400'), clock = clockFixture(f); t.after(() => { clock.restore(); f.sql.close(); });
  const pet = f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots').get(); f.reveal(pet.pet_id);
  f.sql.prepare('INSERT INTO telegram_pet_season_state(telegram_id,season_key,season_xp) VALUES(?,?,300)').run(f.owner,oldQuarter);
  const state = await hooks.getPetSeasonRewardState(f.db,f.owner);
  assert.equal(state.evolution_stage,3);
  const result = await claim(f);
  assert.equal(result.accepted,true); assert.equal(result.receipt_rewards.style_tokens,4);
});
