// Consolidated regression: durable event decisions and transactional ending delivery,
// including known defects, alongside healthy/retry controls. No production access.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { fixture, clockFixture, hooks, worker } from './moonpet-audit-regression-fixture.mjs';
import { getPetEquipmentUpgradeQuote } from '../workers/moonboys-api/pets/live-systems.js';

const token = '123456:local-regression-token';
const observations = [];
let ownerSequence = 982000;
// Fault-injection Worker logs go to stderr so stdout remains machine-readable.
const print = console.log.bind(console);
console.log = (...args) => console.error(...args);

function setup(count) {
  const owner = String(++ownerSequence);
  const f = fixture(owner, 'pet-s2026-003');
  const clock = clockFixture(f, '2026-10-03T12:00:00.000Z');
  f.pet('second', 'pet-s2026-002', 10000, 2);
  if (count === 3) f.pet('third', 'pet-s2025-001', 10000, 3);
  f.sql.prepare('UPDATE telegram_pet_instances SET last_decay_at=?').run(clock.now());
  return { f, clock, source: 'current-' + owner, other: count === 3 ? 'third' : 'second',
    otherSeason: count === 3 ? 'pet-s2025-001' : 'pet-s2026-002' };
}
const wallet = f => f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get();
const materials = f => f.sql.prepare('SELECT material_key,quantity FROM telegram_pet_material_balances ORDER BY material_key').all();
const otherXp = (f, source) => f.sql.prepare('SELECT pet_id,pet_xp FROM telegram_pet_instances WHERE pet_id<>? ORDER BY pet_id').all(source);
const state = f => hooks.buildPetMiniAppState(f.db, f.owner, token);

async function httpAction(f, body) {
  const fields = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: Number(f.owner), first_name: 'Audit fixture' }) });
  const check = [...fields.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  fields.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(token).digest()).update(check).digest('hex'));
  const selected = f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner);
  const response = await worker.fetch(new Request('https://moonboys-api.test/telegram-pets/app/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `198.18.0.${Number(f.owner) % 250 + 1}` },
    body: JSON.stringify({ init_data: fields.toString(), displayed_pet_id: selected.pet_id, response_mode: 'result_only', ...body }),
  }), { DB: f.db, TELEGRAM_BOT_TOKEN: token });
  return { status: response.status, body: await response.json() };
}

// A6: an ordinary unaffordable roll or a thrown payout strands a reservation.
for (const count of [2, 3]) for (const mode of ['healthy', 'outage', 'conditional']) {
  const { f, clock, source, other, otherSeason } = setup(count);
  const random = Math.random;
  try {
    let snapshot;
    if (mode === 'conditional') {
      f.sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=3').run();
      Math.random = () => 0.4; // Select the actual eligible Black Market Tip.
      snapshot = await state(f);
      assert.equal(snapshot.encounter.key, 'black_market_tip');
      const preview = snapshot.encounter.choices.find(c => c.key === 'follow_lead').preview;
      assert.equal(preview.available, true);
      assert.equal(preview.affordability, 'conditional');
      Math.random = () => 0.99; // Normal branch, 8-Gold cost, only 3 owned.
    } else snapshot = await state(f);
    const encounter = snapshot.encounter;
    const choice = mode === 'conditional' ? 'follow_lead'
      : encounter.choices.find(c => c.preview.available !== false).key;
    const request = { action: 'random_event', challenge_token: encounter.challenge_token, choice };
    const originalBatch = f.db.batch.bind(f.db);
    let interrupted = false;
    if (mode === 'outage') f.db.batch = async statements => {
      if (!interrupted && statements.some(s => s.query.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims') && s.args.includes('pet_event'))) {
        interrupted = true;
        throw Error('audit_interrupted_street_event_payment');
      }
      return originalBatch(statements);
    };
    const beforeWallet = wallet(f), beforeOthers = otherXp(f, source);
    const first = await httpAction(f, request);
    const reservation = f.sql.prepare("SELECT id,pet_id,status,event_key FROM telegram_pet_events WHERE event_type='random_event'").get();
    assert.equal(reservation.pet_id, source);
    assert.equal(reservation.status, mode === 'conditional' ? 'cancelled' : mode === 'healthy' ? 'accepted' : 'pending');
    if (mode === 'outage') { assert.equal(first.status, 500); assert.equal(interrupted, true); }
    else assert.equal(first.body.result.accepted, mode === 'healthy');
    if (mode !== 'healthy') assert.deepEqual(wallet(f), beforeWallet);
    Math.random = random;
    if (mode === 'outage') for (let index=0;index<5;index++) {
      f.sql.prepare(`INSERT INTO telegram_pet_events(id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata,created_at)
        VALUES(?,?,'random_event',?,'pet-s2026-003','2026-10-03','2026-W40','pending','{}','2000-01-01 00:00:00')`).run('old-audit-'+index,f.owner,'old-audit-'+index);
    }
    clock.advance(601000);
    f.active(other, otherSeason);
    const refreshed = await state(f);
    const retry = await httpAction(f, request);
    assert.equal(retry.body.result.reason, 'mini_app_challenge_expired');
    const remaining = f.sql.prepare("SELECT status FROM telegram_pet_events WHERE event_type='random_event'").get().status;
    assert.equal(remaining, mode === 'conditional' ? 'cancelled' : mode === 'healthy' ? 'accepted' : 'pending');
    const visible = refreshed.pending_street_events.some(row => row.event_id === reservation.id);
    assert.equal(visible, mode === 'outage');
    if (mode === 'outage') {
      const frozen = f.sql.prepare('SELECT metadata FROM telegram_pet_events WHERE id=?').get(reservation.id).metadata;
      assert.ok(JSON.parse(frozen).saved_event_decision);
      const denied = await hooks.processPetRandomEvent(f.db, 'different-owner', '', { saved_event_id: reservation.id });
      assert.equal(denied.accepted, false);assert.equal(denied.reason, 'street_event_source_missing');
      const recovered = await httpAction(f, { action: 'event_recover', event_id: reservation.id });
      assert.equal(recovered.body.result.accepted, true, JSON.stringify(recovered));
      assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_events WHERE id=?').get(reservation.id).status, 'accepted');
      const paid = wallet(f);
      assert.equal((await httpAction(f, { action: 'event_recover', event_id: reservation.id })).body.result.duplicate, true);
      assert.deepEqual(wallet(f), paid);
    }
    if (mode === 'conditional') {
      assert.equal(first.body.result.reason, 'street_event_unaffordable');
      assert.equal(f.sql.prepare("SELECT claimed_count FROM telegram_pet_repeat_reward_slots WHERE mode='event'").get().claimed_count, 1);
      assert.equal((await httpAction(f, { action: 'event_recover', event_id: reservation.id })).body.result.accepted, false);
    }
    assert.deepEqual(otherXp(f, source), beforeOthers);
    observations.push({ id: 'A6', pets: count, mode, original_status: reservation.status,
      retry_reason: retry.body.result.reason, reservation_after_refresh: remaining, recovery_visible: visible });
  } finally { Math.random = random; clock.restore(); f.sql.close(); }
}

// A7: successful zero-row output writes leave spent costs and completed receipts.
for (const count of [2, 3]) for (const kind of ['craft', 'upgrade', 'cosmetic']) for (const fault of ['cost', 'output', 'finish']) for (const mode of ['healthy', 'ignore', 'abort']) {
  const { f, clock, source, other, otherSeason } = setup(count);
  try {
    for (const key of ['scrap_metal', 'moon_fabric', 'crystal_shard'])
      f.sql.prepare('INSERT INTO telegram_pet_material_balances(telegram_id,material_key,quantity) VALUES(?,?,20)').run(f.owner, key);
    if (kind === 'upgrade') assert.equal((await httpAction(f, { action: 'buy', item_key: 'moon_kibble', request_id: 'initial-gear' })).body.result.accepted, true);
    const triggerTarget = fault === 'finish' ? 'UPDATE OF status ON telegram_pet_system_events' : fault === 'cost'
      ? { craft: 'UPDATE OF quantity ON telegram_pet_material_balances', upgrade: 'UPDATE OF moon_gold ON telegram_pet_profiles', cosmetic: 'UPDATE OF style_tokens ON telegram_pet_profiles' }[kind]
      : { craft: 'INSERT ON telegram_pet_inventory', upgrade: 'UPDATE OF item_level ON telegram_pet_equipment_progression', cosmetic: 'INSERT ON telegram_pet_cosmetic_unlocks' }[kind];
    const triggerWhen = fault === 'finish' ? "WHEN NEW.status='completed'" : fault === 'cost' ? { craft: 'WHEN NEW.quantity<OLD.quantity', upgrade: 'WHEN NEW.moon_gold<OLD.moon_gold', cosmetic: 'WHEN NEW.style_tokens<OLD.style_tokens' }[kind] : '';
    if (mode !== 'healthy') f.sql.exec(`CREATE TRIGGER audit_output BEFORE ${triggerTarget} ${triggerWhen} BEGIN SELECT RAISE(${mode === 'ignore' ? 'IGNORE' : "ABORT,'audit_output_failure'"}); END`);
    const request = { craft: { action: 'craft', recipe_key: 'street_rations' },
      upgrade: { action: 'gear_upgrade', item_key: 'moon_kibble', ...getPetEquipmentUpgradeQuote('moon_kibble', 2) },
      cosmetic: { action: 'cosmetic_unlock', cosmetic_key: 'profile_frame' } }[kind];
    request.request_id = 'output-once';
    const before = { wallet: wallet(f), materials: materials(f) }, beforeOthers = otherXp(f, source);
    const output = () => kind === 'craft' ? f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE asset_key='moon_snack'").get()?.quantity || 0
      : kind === 'upgrade' ? f.sql.prepare("SELECT item_level FROM telegram_pet_equipment_progression WHERE item_key='moon_kibble'").get()?.item_level || 0
        : f.sql.prepare("SELECT quantity FROM telegram_pet_cosmetic_unlocks WHERE cosmetic_key='profile_frame'").get()?.quantity || 0;
    const first = await httpAction(f, request), initialOutput = output();
    const after = { wallet: wallet(f), materials: materials(f) };
    const event = f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE system_key=?').get({ craft: 'crafting', upgrade: 'equipment_upgrade', cosmetic: 'cosmetic' }[kind]);
    if (mode !== 'healthy') { assert.equal(first.status, 500); assert.deepEqual(after, before); assert.notEqual(event.status, 'completed'); }
    else {
      assert.equal(event.status, 'completed');
      assert.notDeepEqual(after, before);
      assert.equal(initialOutput, kind === 'cosmetic' ? 1 : 2);
      assert.equal(first.body.result.accepted, true);
    }
    if (mode !== 'healthy') f.sql.exec('DROP TRIGGER audit_output');
    f.active(other, otherSeason);
    const retry = await httpAction(f, request);
    assert.equal(retry.body.result.accepted, true);
    assert.equal(Boolean(retry.body.result.duplicate), mode === 'healthy');
    assert.equal(output(), kind === 'cosmetic' ? 1 : 2);
    const paid = { wallet: wallet(f), materials: materials(f) };
    assert.equal((await httpAction(f, request)).body.result.duplicate, true);
    assert.deepEqual({ wallet: wallet(f), materials: materials(f) }, paid);
    assert.deepEqual(otherXp(f, source), beforeOthers);
    observations.push({ id: 'A7', pets: count, kind, mode, first_accepted: first.body.result?.accepted ?? false,
      source_status: event.status, before, after, initial_output: initialOutput, output_after_retry: output() });
  } finally { clock.restore(); f.sql.close(); }
}

// A8: an unproven Growth Mark duplicate closes a timed claim irrecoverably.
for (const count of [2, 3]) for (const mode of ['healthy', 'ignore', 'abort', 'existing_mark']) {
  const { f, clock, source, other, otherSeason } = setup(count);
  try {
    if (mode === 'existing_mark') assert.equal((await hooks.awardActivePetActivityGrowthMark(f.db, f.owner, 'earlier-same-day', new Date(), { pet_id: source, season_key: 'pet-s2026-003' })).accepted, true);
    const start = await httpAction(f, { action: 'activity_start', activity_type: 'work' });
    assert.equal(start.body.result.accepted, true);
    const sessionId = start.body.result.session.id;
    clock.advance(301000);
    if (['ignore', 'abort'].includes(mode)) f.sql.exec(`CREATE TRIGGER audit_mark BEFORE INSERT ON telegram_pet_growth_marks BEGIN SELECT RAISE(${mode === 'ignore' ? 'IGNORE' : "ABORT,'audit_mark_failure'"}); END`);
    const beforeOthers = otherXp(f, source);
    const claim = await httpAction(f, { action: 'activity_claim', session_id: sessionId });
    assert.equal(claim.body.result.accepted, true);
    const saved = JSON.parse(f.sql.prepare('SELECT metadata FROM telegram_pet_activity_sessions').get().metadata);
    assert.equal(saved.claim_state, ['ignore', 'abort'].includes(mode) ? 'claiming' : 'settled');
    const marks = () => f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_growth_marks WHERE pet_id=?').get(source).n;
    assert.equal(marks(), ['ignore', 'abort'].includes(mode) ? 0 : 1);
    if (['ignore', 'abort'].includes(mode)) f.sql.exec('DROP TRIGGER audit_mark');
    const paidWallet = wallet(f), paidXp = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(source).pet_xp;
    f.active(other, otherSeason);
    await state(f);
    const retry = await httpAction(f, { action: 'activity_claim', session_id: sessionId });
    assert.equal(retry.body.result.accepted, ['ignore', 'abort'].includes(mode));
    assert.equal(marks(), 1);
    assert.deepEqual(wallet(f), paidWallet);
    assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(source).pet_xp, paidXp);
    assert.deepEqual(otherXp(f, source), beforeOthers);
    observations.push({ id: 'A8', pets: count, mode, claim_state: saved.claim_state,
      growth_marks_after_retry: marks(), retry_reason: retry.body.result.reason });
  } finally { clock.restore(); f.sql.close(); }
}

// A9: district/story/raid ending receipts can close without saved progression.
for (const count of [2, 3]) for (const kind of ['district', 'story', 'raid']) for (const mode of ['healthy', 'ignore', 'abort']) {
  const { f, clock, source, other, otherSeason } = setup(count);
  try {
    f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=500000').run();
    f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=500000').run();
    const snapshot = await state(f);
    const region = snapshot.regions.find(r => r.available);
    const chain = snapshot.live_systems.chains[0];
    const request = { district: { action: 'district_mission', region_key: region.key, approach_key: 'careful' },
      story: { action: 'event_chain', chain_key: chain.key, choice_key: chain.scene.choices[0].key },
      raid: { action: 'seasonal_boss', move: 'strike', pet_id: source } }[kind];
    const target = { district: 'UPDATE OF region_mastery_json ON telegram_pet_live_progression_state',
      story: 'INSERT ON telegram_pet_event_chain_progress', raid: 'INSERT ON telegram_pet_seasonal_boss_progress' }[kind];
    if (mode !== 'healthy') f.sql.exec(`CREATE TRIGGER audit_progress BEFORE ${target} BEGIN SELECT RAISE(${mode === 'ignore' ? 'IGNORE' : "ABORT,'audit_progress_failure'"}); END`);
    const beforeOthers = otherXp(f, source);
    const first = await httpAction(f, request);
    assert.equal(first.body.result.accepted, true);
    const system = { district: 'district', story: 'event_chain', raid: 'seasonal_boss' }[kind];
    const event = () => f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE system_key=?').get(system).status;
    const progress = () => kind === 'district' ? JSON.parse(f.sql.prepare('SELECT region_mastery_json FROM telegram_pet_live_progression_state WHERE pet_id=?').get(source).region_mastery_json)[region.key] || 0
      : kind === 'story' ? f.sql.prepare('SELECT step_index FROM telegram_pet_event_chain_progress WHERE pet_id=?').get(source)?.step_index || 0
        : f.sql.prepare('SELECT damage FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get(source)?.damage || 0;
    assert.equal(event(), mode === 'healthy' ? 'completed' : 'settling');
    if (mode === 'healthy') assert.ok(progress() > 0);
    else assert.equal(progress(), 0);
    if (mode !== 'healthy') f.sql.exec('DROP TRIGGER audit_progress');
    const paidWallet = wallet(f);
    clock.advance(181000);
    f.active(other, otherSeason);
    await state(f);
    assert.ok(progress() > 0);
    assert.equal(event(), 'completed');
    assert.deepEqual(wallet(f), paidWallet);
    assert.deepEqual(otherXp(f, source), beforeOthers);
    // The original pet is selected again only to exercise a normal input retry.
    f.active(source, 'pet-s2026-003');
    const retry = await httpAction(f, request);
    assert.equal(retry.body.result.duplicate, true);
    observations.push({ id: 'A9', pets: count, kind, mode, first_reason: first.body.result.reason,
      first_pending: Boolean(first.body.result.reward_pending), progress_after_recovery: progress(), retry_reason: retry.body.result.reason });
  } finally { clock.restore(); f.sql.close(); }
}

// Unassigned and incomplete historical reservations stay visible for audit.
for (const legacyPet of [null, 'owned']) {
  const { f, clock, source } = setup(3);
  try {
    f.sql.prepare(`INSERT INTO telegram_pet_events(id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata)
      VALUES('legacy-event',?,?,'random_event','legacy-key','pet-s2026-003','2026-10-02','2026-W40','pending','{}')`).run(legacyPet ? source : null, f.owner);
    const original = f.sql.prepare("SELECT * FROM telegram_pet_events WHERE id='legacy-event'").get();
    const snapshot = await state(f), pending = snapshot.pending_street_events.find(row => row.event_id === 'legacy-event');
    assert.equal(pending.audit_required, true);assert.equal(pending.recoverable, false);
    const denied = await httpAction(f, { action: 'event_recover', event_id: 'legacy-event' });
    assert.equal(denied.body.result.accepted, false);assert.equal(denied.body.result.reason, 'street_event_audit_required');
    assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_events WHERE id='legacy-event'").get(), original);
    observations.push({ id: 'A6_legacy', pet: legacyPet });
  } finally { clock.restore(); f.sql.close(); }
}

console.log = print;
print('Consolidated endings: ' + observations.length + ' regression cases passed.');
