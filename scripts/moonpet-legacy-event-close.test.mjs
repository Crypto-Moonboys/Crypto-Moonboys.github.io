import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, clockFixture, hooks, httpAction } from './moonpet-audit-regression-fixture.mjs';

let sequence = 998400;
function setup(metadata = '{"repeat_reward_slot":3,"repeat_reward_mode":"event","old_note":"preserved"}') {
  const f = fixture(String(++sequence));
  const clock = clockFixture(f, '2026-10-06T00:00:00Z');
  const petId = 'current-' + f.owner;
  const event = 'legacy-' + f.owner;
  f.sql.prepare(`INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata)
    VALUES (?,?,?,'random_event',?,'old-competition','2026-10-01','2026-W40','pending',?)`).run(event,petId,f.owner,event,metadata);
  f.sql.prepare('UPDATE telegram_pet_events SET season_key=(SELECT season_key FROM telegram_pet_instances WHERE pet_id=?) WHERE id=?').run(petId,event);
  const body = { action: 'event_close', event_id: event, confirmed: true, confirm_event_id: event };
  const balances = () => JSON.stringify({
    profiles: f.sql.prepare('SELECT pet_xp,moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').all(),
    pets: f.sql.prepare('SELECT pet_id,pet_xp FROM telegram_pet_instances ORDER BY pet_id').all(),
    claims: f.sql.prepare('SELECT * FROM telegram_pet_reward_claims ORDER BY claim_id').all(),
    counters: f.sql.prepare('SELECT * FROM telegram_pet_repeat_reward_slots').all(),
  });
  return { ...f, clock, petId, event, body, balances };
}

test('confirmed close preserves balances, metadata and ordinal without releasing a reward slot', async () => {
  const f = setup();
  try {
    await f.state(); const before = f.balances();
    const original = f.sql.prepare('SELECT * FROM telegram_pet_events WHERE id=?').get(f.event);
    const response = await httpAction(f, f.body);
    assert.equal(response.body.result.accepted, true, JSON.stringify(response.body));
    assert.equal(response.body.result.reason, 'legacy_street_event_closed');
    assert.equal(f.balances(), before);
    const after = f.sql.prepare('SELECT * FROM telegram_pet_events WHERE id=?').get(f.event);
    assert.equal(after.status, 'cancelled'); assert.equal(after.metadata, original.metadata);
    assert.equal(after.pet_id, original.pet_id); assert.equal(after.event_key, original.event_key);
    assert.equal(JSON.parse(after.metadata).released_repeat_reward_slot, undefined);
    const repeat = await httpAction(f, f.body);
    assert.equal(repeat.body.result.accepted, true); assert.equal(repeat.body.result.duplicate, true);
    assert.equal(f.balances(), before);
  } finally { f.clock.restore(); f.sql.close(); }
});

test('a malformed retained outcome can be closed without rewriting its evidence', async () => {
  const f = setup('{broken historical metadata');
  try {
    const before = f.balances(); assert.equal((await hooks.closeUnverifiedStreetEvent(f.db, f.owner, f.body)).accepted, true);
    assert.equal(f.sql.prepare('SELECT metadata FROM telegram_pet_events WHERE id=?').get(f.event).metadata, '{broken historical metadata');
    assert.equal(f.balances(), before);
  } finally { f.clock.restore(); f.sql.close(); }
});

for (const reason of ['repeat_reward_slot:3', 'repeat_reward_slot:3:energy_paid:4']) test(`closing a real ${reason} reservation retains its evidence and is idempotent`, async () => {
  const f = setup('{"old_note":"original reservation has no synthetic ordinal"}');
  try {
    f.sql.prepare('UPDATE telegram_pet_events SET reason=? WHERE id=?').run(reason, f.event);
    f.sql.prepare("INSERT INTO telegram_pet_repeat_reward_slots(telegram_id,day_key,mode,claimed_count) VALUES (?,'2026-10-01','event',3)").run(f.owner);
    await f.state();
    const original = f.sql.prepare('SELECT * FROM telegram_pet_events WHERE id=?').get(f.event), before = f.balances();
    assert.equal((await httpAction(f, f.body)).body.result.accepted, true);
    const closed = f.sql.prepare('SELECT * FROM telegram_pet_events WHERE id=?').get(f.event);
    assert.equal(closed.reason, 'legacy_street_event_closed:' + reason);
    assert.equal(closed.metadata, original.metadata); assert.equal(closed.status, 'cancelled');
    assert.equal(f.balances(), before);
    assert.equal((await httpAction(f, f.body)).body.result.duplicate, true);
    assert.equal(f.sql.prepare('SELECT reason FROM telegram_pet_events WHERE id=?').get(f.event).reason, closed.reason);
    assert.equal(f.balances(), before);
  } finally { f.clock.restore(); f.sql.close(); }
});

test('a reservation reason changed concurrently cannot be overwritten by closure', async () => {
  const f = setup('{}');
  try {
    f.sql.prepare("UPDATE telegram_pet_events SET reason='repeat_reward_slot:3' WHERE id=?").run(f.event);
    f.db.beforeRun = s => {
      if (s.query.includes("reason='legacy_street_event_closed:")) f.sql.prepare("UPDATE telegram_pet_events SET reason='repeat_reward_slot:4' WHERE id=?").run(f.event);
    };
    const result = await hooks.closeUnverifiedStreetEvent(f.db, f.owner, f.body);
    assert.equal(result.accepted, false);
    const saved = f.sql.prepare('SELECT status,reason FROM telegram_pet_events WHERE id=?').get(f.event);
    assert.equal(saved.status, 'pending'); assert.equal(saved.reason, 'repeat_reward_slot:4');
  } finally { f.clock.restore(); f.sql.close(); }
});

test('closing the unverified source releases its deletion blocker and retains the original event', async () => {
  const f = setup();
  try {
    await f.state();
    assert.equal((await hooks.deletePetSlot(f.db,f.owner,{pet_id:f.petId,confirmed:true,confirm_pet_id:f.petId})).accepted,false);
    assert.equal((await hooks.closeUnverifiedStreetEvent(f.db,f.owner,f.body)).accepted,true);
    const deleted = await hooks.deletePetSlot(f.db,f.owner,{pet_id:f.petId,confirmed:true,confirm_pet_id:f.petId});
    assert.equal(deleted.accepted,true,JSON.stringify(deleted));
    const retained = f.sql.prepare('SELECT pet_id,status,metadata FROM telegram_pet_events WHERE id=?').get(f.event);
    assert.equal(retained.pet_id,f.petId); assert.equal(retained.status,'cancelled');
    assert.equal(JSON.parse(retained.metadata).old_note,'preserved');
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_instances').get().n,2);
  } finally { f.clock.restore(); f.sql.close(); }
});

test('close requires exact confirmation and ownership', async () => {
  const f = setup();
  try {
    for (const body of [{ event_id: f.event }, { ...f.body, confirm_event_id: 'wrong' }]) {
      assert.equal((await hooks.closeUnverifiedStreetEvent(f.db, f.owner, body)).accepted, false);
    }
    assert.equal((await hooks.closeUnverifiedStreetEvent(f.db, 'different-owner', f.body)).accepted, false);
    assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_events WHERE id=?').get(f.event).status, 'pending');
  } finally { f.clock.restore(); f.sql.close(); }
});

test('recorded rewards and pending claims cannot be forfeited through legacy close', async () => {
  for (const claimStatus of ['pending', 'awarded', null]) {
    const f = setup();
    try {
      if (claimStatus) f.sql.prepare(`INSERT INTO telegram_pet_reward_claims(claim_id,pet_id,telegram_id,source,idempotency_key,day_key,status)
        VALUES ('existing',?,?,'pet_event',?,'2026-10-01',?)`).run(f.petId,f.owner,f.event,claimStatus);
      else f.sql.prepare('UPDATE telegram_pet_events SET pet_xp_awarded=1 WHERE id=?').run(f.event);
      const before = f.balances();
      assert.equal((await hooks.closeUnverifiedStreetEvent(f.db, f.owner, f.body)).accepted, false);
      assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_events WHERE id=?').get(f.event).status, 'pending');
      assert.equal(f.balances(), before);
    } finally { f.clock.restore(); f.sql.close(); }
  }
});

test('saved recoverable outcomes and outcomes saved concurrently cannot be closed', async () => {
  const saved = JSON.stringify({ saved_event_decision: { version: 1, encounter_key: 'saved', choice_key: 'safe',
    kind: 'success', copy: 'Saved proof', rewards: {}, costs: {}, reward_draws: {}, cost_draws: {} } });
  for (const concurrent of [false, true]) {
    const f = setup(concurrent ? '{}' : saved);
    try {
      if (concurrent) f.db.beforeRun = s => {
        if (s.query.includes("reason='legacy_street_event_closed:")) f.sql.prepare('UPDATE telegram_pet_events SET metadata=? WHERE id=?').run(saved,f.event);
      };
      assert.equal((await hooks.closeUnverifiedStreetEvent(f.db, f.owner, f.body)).accepted, false);
      assert.equal(f.sql.prepare('SELECT metadata FROM telegram_pet_events WHERE id=?').get(f.event).metadata, saved);
      assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_events WHERE id=?').get(f.event).status, 'pending');
    } finally { f.clock.restore(); f.sql.close(); }
  }
});

test('switching pets or selecting an egg cannot redirect or block the original event close', async () => {
  const f = setup();
  try {
    const season = f.sql.prepare('SELECT season_key FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).season_key;
    f.pet('new-egg',season,200,2);
    f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE pet_id='new-egg'").run();
    f.active('new-egg',season);
    const result = await httpAction(f,f.body);
    assert.equal(result.body.result.accepted,true,JSON.stringify(result.body));
    assert.equal(f.sql.prepare('SELECT pet_id FROM telegram_pet_events WHERE id=?').get(f.event).pet_id,f.petId);
  } finally { f.clock.restore(); f.sql.close(); }
});
