import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, clockFixture, hooks, httpAction } from './moonpet-audit-regression-fixture.mjs';
import { getPetDailyBounties } from '../workers/moonboys-api/pets/economy-expansion.js';

function snapshot(f) {
  return {
    wallet: f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').all(),
    pets: f.sql.prepare('SELECT pet_id,pet_xp,energy FROM telegram_pet_instances ORDER BY pet_id').all(),
    receipts: f.sql.prepare('SELECT * FROM telegram_pet_reward_claims ORDER BY claim_id').all(),
  };
}
function progress(f, day) {
  for (const bounty of getPetDailyBounties(day)) for (let i = 0; i < bounty.required; i++) {
    const id = `${day}:${bounty.key}:${i}`;
    f.sql.prepare(`INSERT INTO telegram_pet_events
      (id,telegram_id,pet_id,event_type,event_key,season_key,day_key,week_key,status)
      VALUES (?,?,?,?,?,?,?,'2026-W41','accepted')`)
      .run(id, f.owner, 'current-' + f.owner, bounty.event_types[0], id, 'pet-s2026-004', day);
  }
}

for (const action of ['bounty_claim', 'market_buy', 'expedition']) test(`${action}: an unpaid previous-day button cannot consume today's board`, async () => {
  const f = fixture('99110' + ['bounty_claim', 'market_buy', 'expedition'].indexOf(action));
  const clock = clockFixture(f, '2026-10-11T23:59:59Z');
  try {
    progress(f, '2026-10-12');
    const bounty = getPetDailyBounties('2026-10-11').find(b => getPetDailyBounties('2026-10-12').some(next => b.key === next.key));
    assert.ok(bounty, 'exercise the dangerous same-key daily rotation');
    const board = await hooks.getPetEconomyState(f.db, f.owner, null, new Date('2026-10-12T00:00:00Z'));
    const body = { action, day_key: '2026-10-11', bounty_key: bounty.key,
      offer_key: board.market_offers.find(o => o.available).key,
      expedition_key: board.expedition_options.find(e => e.available).key,
      pet_id: board.pet.pet_id, request_id: 'old-unpaid-' + action };
    clock.advance(1000);
    const before = snapshot(f), response = await httpAction(f, body);
    assert.equal(response.status, 409);
    assert.equal(response.body.result.accepted, false, JSON.stringify(response.body));
    assert.equal(response.body.result.reason, 'economy_day_changed');
    assert.equal(response.body.result.refresh_state, true);
    assert.deepEqual(snapshot(f), before, 'no new payment, cost, XP or receipt');
    assert.equal((await hooks.getPetEconomyState(f.db, f.owner)).expedition_attempts_left, 3);
  } finally { clock.restore(); f.sql.close(); }
});

for (const action of ['bounty_claim', 'market_buy', 'expedition']) test(`${action}: lost acknowledgement survives midnight and a pet switch without another payout`, async () => {
  const f = fixture('99120' + ['bounty_claim', 'market_buy', 'expedition'].indexOf(action));
  const clock = clockFixture(f, '2026-10-11T23:59:59Z');
  try {
    f.pet('replacement', 'pet-s2025-001', 10000, 2);
    progress(f, '2026-10-11');
    const board = await hooks.getPetEconomyState(f.db, f.owner);
    const body = { action, day_key: board.day_key, bounty_key: board.bounties[0].key,
      offer_key: board.market_offers.find(o => o.available).key,
      expedition_key: board.expedition_options.find(e => e.available).key,
      pet_id: board.pet.pet_id, request_id: 'paid-original-' + action };
    const first = await httpAction(f, body);
    assert.equal(first.body.result.accepted, true, JSON.stringify(first.body));
    clock.advance(1000); f.active('replacement', 'pet-s2025-001');
    const before = snapshot(f);
    for (let i = 0; i < 2; i++) {
      const retry = await httpAction(f, body);
      assert.equal(retry.body.result.accepted, true, JSON.stringify(retry.body));
      assert.equal(retry.body.result.duplicate, true);

      assert.deepEqual(snapshot(f), before);
    }
    const source = { bounty_claim: 'pet_bounty', market_buy: 'pet_market', expedition: 'pet_expedition' }[action];
    const saved = f.sql.prepare('SELECT * FROM telegram_pet_reward_claims WHERE source=?').get(source);
    const context = JSON.parse(saved.metadata).context;
    const recovered = action === 'bounty_claim'
      ? await hooks.claimPetEconomyBounty(f.db, f.owner, body.bounty_key, new Date(), body.day_key)
      : action === 'market_buy'
        ? await hooks.buyPetMarketOffer(f.db, f.owner, body.offer_key, new Date(), context.request_key, body.day_key)
        : await hooks.runPetCrystalExpedition(f.db, f.owner, new Date(), saved.idempotency_key, body.expedition_key, body.pet_id, body.day_key);
    assert.equal(recovered.accepted, true); assert.equal(recovered.duplicate, true);
    assert.equal(recovered.receipt.day_key, '2026-10-11');
    assert.equal(recovered.receipt.pet_id, board.pet.pet_id);
    assert.deepEqual(snapshot(f), before);
    const next = await hooks.getPetEconomyState(f.db, f.owner);
    assert.equal(next.day_key, '2026-10-12');
    assert.equal(next.expedition_attempts_left, 3);
  } finally { clock.restore(); f.sql.close(); }
});

test('bounty receipt failure rejects closed without guessing an unpaid claim', async () => {
  const f = fixture('991301'), clock = clockFixture(f, '2026-10-11T23:59:59Z');
  try {
    progress(f, '2026-10-11'); const before = snapshot(f);
    f.db.beforeFirst = statement => {
      if (statement.query.includes("source='pet_bounty'")) return { success: false, error: 'receipt-unavailable' };
    };
    await assert.rejects(hooks.claimPetEconomyBounty(f.db, f.owner, getPetDailyBounties('2026-10-11')[0].key, new Date(), '2026-10-11'), /pet_state_read_unavailable/);
    assert.deepEqual(snapshot(f), before);
  } finally { clock.restore(); f.sql.close(); }
});

test('lightweight state always schedules the daily board and Monday rotation, including leap/year boundaries', () => {
  for (const [at, day, week] of [
    ['2026-10-11T23:59:59Z', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z'],
    ['2026-10-12T00:00:00Z', '2026-10-13T00:00:00.000Z', '2026-10-19T00:00:00.000Z'],
    ['2028-02-28T23:59:59Z', '2028-02-29T00:00:00.000Z', '2028-03-06T00:00:00.000Z'],
    ['2026-12-31T23:59:59Z', '2027-01-01T00:00:00.000Z', '2027-01-04T00:00:00.000Z'],
  ]) {
    const state = hooks.buildPetMiniAppCooldownSummary({ now: new Date(at) });
    assert.equal(state.entries.find(e => e.key === 'account_day_reset').expires_at, day);
    assert.equal(state.entries.find(e => e.key === 'account_week_reset').expires_at, week);
    assert.equal(state.next_expires_at, day);
  }
});

test('dated bot Coach claims cannot redirect a saved board and fit Telegram callback limits', async () => {
  const f = fixture('991501'), clock = clockFixture(f, '2026-10-11T23:59:59Z');
  try {
    progress(f, '2026-10-11');
    const board = await hooks.getPetEconomyState(f.db, f.owner);
    const claim = board.guidance_actions.find(a => a.key.startsWith('bounty:'));
    assert.match(claim.callback_data, /:2026-10-11$/);
    assert.ok(Buffer.byteLength(claim.callback_data) <= 64);
  } finally { clock.restore(); f.sql.close(); }
});
