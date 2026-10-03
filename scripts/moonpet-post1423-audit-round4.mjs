// Historical baseline-only diagnostic (cae48482af09f535ffddc0b1881d62f4a6b00e03); not fixed-head CI.
// All database writes and authenticated Worker requests are local fixtures.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { fixture, clockFixture, hooks, worker } from './moonpet-audit-regression-fixture.mjs';
import { readPetLeaderboard } from '../workers/moonboys-api/pets/leaderboard.js';

const token = '123456:local-regression-token', observations = [];
const print = console.log.bind(console);
console.log = (...args) => console.error(...args);
let sequence = 995000;
function setup(count) {
  const f = fixture(String(++sequence), 'pet-s2026-003'), clock = clockFixture(f, '2026-10-06T12:00:00.000Z');
  f.pet('other', 'pet-s2026-002', 10000, 2);
  if (count === 3) f.pet('third', 'pet-s2025-001', 10000, 3);
  f.sql.prepare('UPDATE telegram_pet_instances SET last_decay_at=?').run(clock.now());
  return { f, clock, source: 'current-' + f.owner, other: count === 3 ? 'third' : 'other' };
}
async function action(f, body) {
  const fields = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: Number(f.owner), first_name: 'Audit fixture' }) });
  const check = [...fields.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  fields.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(token).digest()).update(check).digest('hex'));
  const selected = f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner);
  const response = await worker.fetch(new Request('https://moonboys-api.test/telegram-pets/app/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `198.18.1.${Number(f.owner) % 250 + 1}` },
    body: JSON.stringify({ init_data: fields.toString(), displayed_pet_id: selected.pet_id, response_mode: 'result_only', ...body }),
  }), { DB: f.db, TELEGRAM_BOT_TOKEN: token });
  return { status: response.status, body: await response.json() };
}
const state = f => hooks.buildPetMiniAppState(f.db, f.owner, token);
const economics = f => ({
  pets: f.sql.prepare('SELECT pet_id,pet_xp FROM telegram_pet_instances ORDER BY pet_id').all(),
  wallet: f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get(),
  user: f.sql.prepare('SELECT xp FROM telegram_users').get().xp,
  community_board: f.sql.prepare('SELECT season_id,xp FROM telegram_leaderboard ORDER BY season_id').all(),
  competition: f.sql.prepare('SELECT season_key,season_xp FROM telegram_pet_season_state WHERE season_xp>0 ORDER BY season_key').all(),
  items: f.sql.prepare('SELECT asset_key,quantity FROM telegram_pet_inventory ORDER BY asset_key').all(),
});

const targets = {
  feed_pet: { action: 'feed', xp: 6, target: 'UPDATE OF pet_xp ON telegram_pet_instances', condition: 'NEW.pet_xp>OLD.pet_xp' },
  feed_competition: { action: 'feed', xp: 6, target: 'INSERT ON telegram_pet_season_state', condition: 'NEW.season_xp>0' },
  feed_community: { action: 'feed', xp: 6, target: 'UPDATE OF xp ON telegram_users', condition: 'NEW.xp>OLD.xp' },
  feed_wallet: { action: 'feed', xp: 6, target: 'UPDATE OF moon_gold ON telegram_pet_profiles', condition: 'NEW.moon_gold>OLD.moon_gold' },
  item_pet: { action: 'use_item', xp: 4, target: 'UPDATE OF pet_xp ON telegram_pet_instances', condition: 'NEW.pet_xp>OLD.pet_xp' },
  item_debit: { action: 'use_item', xp: 4, target: 'UPDATE OF quantity ON telegram_pet_inventory', condition: 'NEW.quantity<OLD.quantity' },
  trade_pet: { action: 'trade', xp: 6, target: 'UPDATE OF pet_xp ON telegram_pet_instances', condition: 'NEW.pet_xp>OLD.pet_xp' },
  trade_debit: { action: 'trade', xp: 1, target: 'UPDATE OF moon_gold ON telegram_pet_profiles', condition: 'NEW.moon_gold<OLD.moon_gold' },
};

// A12: core actions seal acceptance/payment without proving every required write.
for (const count of [2, 3]) for (const [name, spec] of Object.entries(targets)) for (const mode of ['healthy', 'ignore', 'abort']) {
  const { f, clock, source, other } = setup(count), random = Math.random;
  try {
    Math.random = () => name === 'trade_debit' ? 0 : 0.99;
    if (spec.action === 'use_item') f.sql.prepare("INSERT INTO telegram_pet_inventory(telegram_id,asset_type,asset_key,quantity) VALUES(?,'item','moon_snack',1)").run(f.owner);
    // Initialize legitimate compatibility/wallet state before installing faults.
    await state(f);
    const before = economics(f), otherBefore = before.pets.filter(p => p.pet_id !== source);
    if (mode !== 'healthy') f.sql.exec(`CREATE TRIGGER audit_core BEFORE ${spec.target} WHEN ${spec.condition}
      BEGIN SELECT RAISE(${mode === 'ignore' ? 'IGNORE' : "ABORT,'audit_core_failure'"}); END`);
    const request = { action: spec.action, item_key: 'moon_snack', wager: 50, request_id: 'core-' + name };
    const first = await action(f, request), initial = economics(f);
    assert.equal(first.body.result?.accepted === true, mode !== 'abort');
    if (mode === 'abort') {
      assert.equal(first.status, 500);
      assert.deepEqual(initial, before, 'thrown required write rolls back the entire action');
    } else {
      assert.equal(first.body.result.pet_xp_awarded, spec.xp);
      const pet = initial.pets.find(p => p.pet_id === source), missedPet = mode === 'ignore' && name.endsWith('_pet');
      assert.equal(pet.pet_xp, 10000 + (missedPet ? 0 : spec.xp));
      assert.equal(initial.competition.reduce((sum, row) => sum + row.season_xp, 0), mode === 'ignore' && name === 'feed_competition' ? 0 : spec.xp);
      if (spec.action === 'feed') {
        assert.equal(initial.user, mode === 'ignore' && name === 'feed_community' ? 0 : 2);
        assert.equal(initial.community_board[0].xp, 2);
        assert.equal(initial.wallet.moon_gold, mode === 'ignore' && name === 'feed_wallet' ? 1000 : 1005);
      }
      if (spec.action === 'use_item') assert.equal(initial.items.find(i => i.asset_key === 'moon_snack').quantity, mode === 'ignore' && name === 'item_debit' ? 1 : 0);
      if (spec.action === 'trade') assert.equal(initial.wallet.moon_gold, name === 'trade_debit' ? mode === 'ignore' ? 1000 : 950 : 1037);
    }
    if (mode !== 'healthy') f.sql.exec('DROP TRIGGER audit_core');
    const retry = await action(f, request);
    assert.equal(retry.body.result.accepted, true);
    assert.equal(Boolean(retry.body.result.duplicate), mode !== 'abort');
    const settled = economics(f);
    if (mode !== 'abort') assert.deepEqual(settled, initial, 'accepted receipt prevents repair/reapplication');
    else {
      assert.equal(settled.pets.find(p => p.pet_id === source).pet_xp, 10000 + spec.xp);
      assert.equal(settled.competition[0].season_xp, spec.xp);
    }
    assert.deepEqual(settled.pets.filter(p => p.pet_id !== source), otherBefore);
    assert.equal((await action(f, { action: 'switch_pet_slot', pet_id: other })).body.result.accepted, true);
    await state(f);
    assert.equal((await action(f, { action: 'switch_pet_slot', pet_id: source })).body.result.accepted, true);
    await state(f);
    assert.deepEqual(economics(f), settled, 'healthy refresh/pet switches retain the mismatch');
    const rankings = {};
    for (const period of ['daily', 'weekly', 'seasonal', 'all_time']) {
      const board = await readPetLeaderboard(f.db, { period, owner: f.owner, now: new Date() });
      rankings[period] = board.rows.find(row => row.telegram_id === f.owner)?.pet_xp || 0;
    }
    assert.equal(rankings.daily, spec.xp); assert.equal(rankings.weekly, spec.xp);
    assert.equal(rankings.seasonal, mode === 'ignore' && name === 'feed_competition' ? 0 : spec.xp);
    assert.equal(rankings.all_time, count * 10000 + (mode === 'ignore' && name.endsWith('_pet') ? 0 : spec.xp));
    observations.push({ id: 'A12', pets: count, target: name, mode, first_accepted: first.body.result?.accepted || false,
      paid_pet_xp: settled.pets.find(p => p.pet_id === source).pet_xp - 10000, user_xp: settled.user,
      gold: settled.wallet.moon_gold, snack_count: settled.items.find(i => i.asset_key === 'moon_snack')?.quantity ?? null, rankings });
    // A second genuinely new use also awards effects while the debit is ignored.
    // This is conditional on the injected fault, not a healthy free-item exploit.
    if (name === 'item_debit' && mode === 'ignore') {
      f.sql.exec(`CREATE TRIGGER audit_core BEFORE ${spec.target} WHEN ${spec.condition} BEGIN SELECT RAISE(IGNORE); END`);
      assert.equal((await action(f, { ...request, request_id: 'new-use' })).body.result.accepted, true);
      assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE asset_key='moon_snack'").get().quantity, 1);
      assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(source).pet_xp, 10008);
    }
  } finally { Math.random = random; clock.restore(); f.sql.close(); }
}

// A9 extension: a missed terminal acknowledgement replays additive progress.
// Story writes an absolute next step, providing a control against overgeneralizing.
for (const count of [2, 3]) for (const kind of ['district', 'story', 'raid']) for (const mode of ['healthy', 'ignore', 'abort']) {
  const { f, clock, source, other } = setup(count);
  try {
    f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=500000').run();
    f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=500000').run();
    const snapshot = await state(f), region = snapshot.regions.find(r => r.available), chain = snapshot.live_systems.chains[0];
    const system = { district: 'district', story: 'event_chain', raid: 'seasonal_boss' }[kind];
    const request = { district: { action: 'district_mission', region_key: region.key, approach_key: 'careful' },
      story: { action: 'event_chain', chain_key: chain.key, choice_key: chain.scene.choices[0].key },
      raid: { action: 'seasonal_boss', move: 'strike', pet_id: source } }[kind];
    const progress = () => kind === 'district' ? JSON.parse(f.sql.prepare('SELECT region_mastery_json FROM telegram_pet_live_progression_state WHERE pet_id=?').get(source).region_mastery_json)[region.key] || 0
      : kind === 'story' ? f.sql.prepare('SELECT step_index FROM telegram_pet_event_chain_progress WHERE pet_id=?').get(source)?.step_index || 0
        : f.sql.prepare('SELECT damage FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get(source)?.damage || 0;
    if (mode !== 'healthy') f.sql.exec(`CREATE TRIGGER audit_finish BEFORE UPDATE OF status ON telegram_pet_system_events
      WHEN NEW.status='completed' AND NEW.system_key='${system}' BEGIN SELECT RAISE(${mode === 'ignore' ? 'IGNORE' : "ABORT,'audit_finish_failure'"}); END`);
    const others = economics(f).pets.filter(p => p.pet_id !== source);
    const first = await action(f, request), initialProgress = progress();
    assert.equal(first.body.result.accepted, true);
    assert.equal(Boolean(first.body.result.reward_pending), mode !== 'healthy');
    assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE system_key=?').get(system).status, mode === 'healthy' ? 'completed' : 'settling');
    assert.equal(initialProgress > 0, mode !== 'abort');
    if (mode !== 'healthy') f.sql.exec('DROP TRIGGER audit_finish');
    const paid = economics(f), energy = f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(source).energy;
    clock.advance(181000);
    // Background recovery must use the saved source after an actual API switch.
    assert.equal((await action(f, { action: 'switch_pet_slot', pet_id: other })).body.result.accepted, true);
    await state(f); await state(f);
    const recovered = progress();
    if (mode === 'ignore') assert.equal(recovered, kind === 'story' ? initialProgress : initialProgress * 2);
    else if (mode === 'healthy') assert.equal(recovered, initialProgress);
    else assert.ok(recovered > 0);
    assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE system_key=?').get(system).status, 'completed');
    assert.deepEqual(economics(f), paid, 'completion retry cannot repay XP/currencies or credit another pet');
    assert.ok(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(source).energy > energy - 1, 'recovery must not charge the saved energy twice');
    assert.deepEqual(economics(f).pets.filter(p => p.pet_id !== source), others);
    await state(f); assert.equal(progress(), recovered);
    assert.equal((await action(f, { action: 'switch_pet_slot', pet_id: source })).body.result.accepted, true);
    assert.equal((await action(f, request)).body.result.duplicate, true);
    assert.equal(progress(), recovered);
    observations.push({ id: 'A9_extension', pets: count, kind, mode, initial_progress: initialProgress, recovered_progress: recovered });
  } finally { clock.restore(); f.sql.close(); }
}
console.log = print;
print(JSON.stringify({ cases: observations.length, observations }, null, 2));
