import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { authDigest } from '../workers/moonboys-api/telegram-website-auth.js';
import { createHmac } from 'node:crypto';
import { performanceFixture, seedRecoveryEvidence } from './moonpet-state-performance-fixture.mjs';
import { createDisplayedPetScope } from '../workers/moonboys-api/pets/displayed-pet-scope.js';
import { createPetStateTimings } from '../workers/moonboys-api/pets/state-timings.js';
import { evaluatePetSeasonCompletion } from '../workers/moonboys-api/pets/season-completion.js';
import { MOONPET_D1_PERFORMANCE_BUDGETS as budgets } from './moonpet-d1-performance-budget.mjs';

for (const pets of [1, 3]) test(`warm ${pets}-pet state preserves wallets/roster within the unchanged budget`, async () => {
  const f = await performanceFixture({ pets });
  try {
    const before = f.sql.prepare('SELECT pet_id,pet_xp FROM telegram_pet_instances ORDER BY pet_id').all();
    const { state, report } = await f.measure();
    assert.equal(state.season_slots.slots.filter(s => s.pet).length, pets);
    assert.equal(state.pet.moon_gold, 1000);
    assert.equal(state.pet.moon_crystals, 100);
    assert.deepEqual(f.sql.prepare('SELECT pet_id,pet_xp FROM telegram_pet_instances ORDER BY pet_id').all(), before);
    assert.ok(report.statements <= budgets.warm_state_max_statements);
    assert.ok(report.stages.some(s => s.stage === 'ownership_verification'));
  } finally { f.close(); }
});

test('saved recovery evidence settles once and does not replay primary rewards', async () => {
  const f = await performanceFixture();
  try {
    seedRecoveryEvidence(f);
    const wallet = () => f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens,pet_xp FROM telegram_pet_profiles').get();
    const before = wallet();
    const first = await f.measure();
    assert.ok(first.report.statements <= budgets.recovery_refresh_max_statements);
    const evidence = f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_journey_objectives').get().n;
    assert.equal(evidence, 5);
    await f.measure();
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_journey_objectives').get().n, evidence);
    assert.deepEqual(wallet(), before);
  } finally { f.close(); }
});

test('switching the selected pet during grouped reads fails closed, then refreshes the new pet', async () => {
  const f = await performanceFixture({ pets: 3 });
  try {
    let switched = false;
    f.db.beforeBatch = statements => {
      if (!switched && statements.length > 2 && statements.at(-1).query.includes('AS displayed_pet_authority')) {
        switched = true; f.active('fixture-space-2', 'pet-s2026-004');
      }
    };
    await assert.rejects(f.measure(), /pet_state_source_changed/);
    assert.equal(switched, true);
    f.db.beforeBatch = null;
    const { state } = await f.measure();
    assert.equal(state.pet.pet_id, 'fixture-space-2');
    assert.equal(state.season_slots.active_pet_id, state.pet.pet_id);
  } finally { f.close(); }
});

test('a missing optional table cannot poison the mandatory core/full read group', async () => {
  const f = await performanceFixture();
  try {
    f.sql.exec('DROP TABLE telegram_pet_garden_plots');
    for (const mode of ['core', 'full']) {
      const { state } = await f.measure(mode);
      assert.equal(state.adopted, true);
      assert.equal(state.pet_garden.available, false);
    }
  } finally { f.close(); }
});

test('a missing saved room is restored, while malformed saved room content is never regenerated', async () => {
  const f = await performanceFixture();
  try {
    assert.equal((await f.act({ action: 'daily_run_start', request_id: 'performance-daily-run' })).accepted, true);
    const good = (await f.measure()).state;
    const saved = f.sql.prepare('SELECT * FROM telegram_pet_run_rooms WHERE run_id=? AND room_number=1').get(good.run.run_id);
    assert.ok(saved);
    f.sql.prepare('DELETE FROM telegram_pet_run_rooms WHERE run_id=? AND room_number=1').run(saved.run_id);
    const restored = (await f.measure()).state;
    assert.deepEqual(restored.run.choices, good.run.choices);
    f.sql.prepare("UPDATE telegram_pet_run_rooms SET generated_data='{}' WHERE run_id=? AND room_number=1").run(saved.run_id);
    const wallet = f.sql.prepare('SELECT moon_gold,moon_crystals,pet_xp FROM telegram_pet_profiles').get();
    await assert.rejects(f.measure(), /pet_state_read_unavailable/);
    assert.equal(f.sql.prepare('SELECT generated_data FROM telegram_pet_run_rooms WHERE run_id=? AND room_number=1').get(saved.run_id).generated_data, '{}');
    assert.deepEqual(f.sql.prepare('SELECT moon_gold,moon_crystals,pet_xp FROM telegram_pet_profiles').get(), wallet);
  } finally { f.close(); }
});

test('malformed consolidated evidence cannot become zero lifetime progress', async () => {
  const f = await performanceFixture();
  try {
    f.db.beforeFirst = s => s.query.includes('WITH growth AS') ? { growth_earned: 'invalid' } : undefined;
    await assert.rejects(evaluatePetSeasonCompletion(f.db, 'current-' + f.owner, 'pet-s2026-004', new Date(), { telegram_id: f.owner }), /pet_state_read_unavailable/);
  } finally { f.close(); }
});

function scoped(f, extra = {}) {
  return createDisplayedPetScope(f.db, f.owner, 'current-' + f.owner, 'pet-s2026-004', { coalesceReads: true, ...extra });
}

test('adjacent reads share one atomic guard; writes and explicit batches remain barriers', async () => {
  const f = await performanceFixture();
  try {
    const scope = scoped(f), batches = [];
    f.db.beforeBatch = entries => batches.push(entries.length);
    const q = () => scope.db.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').bind(f.owner);
    const rows = await Promise.all([q().first('moon_gold'), q().all()]);
    assert.equal(rows[0], 1000); assert.equal(rows[1].results[0].moon_gold, 1000);
    assert.deepEqual(batches, [3]);
    batches.length = 0;
    const values = await Promise.all([
      q().first('moon_gold'),
      scope.db.prepare('UPDATE telegram_pet_profiles SET moon_gold=moon_gold+1 WHERE telegram_id=?').bind(f.owner).run(),
      q().first('moon_gold'),
    ]);
    assert.equal(values[0], 1000); assert.equal(values[2], 1001);
    assert.deepEqual(batches, [2, 2, 2]);
    const returning = await scope.db.prepare('UPDATE telegram_pet_profiles SET moon_gold=moon_gold+1 WHERE telegram_id=? RETURNING moon_gold').bind(f.owner).first();
    assert.equal(returning.moon_gold, 1002);
  } finally { f.close(); }
});

test('legacy callers retain separate batches, and grouped reads are bounded', async () => {
  const f = await performanceFixture();
  try {
    const legacy = scoped(f, { coalesceReads: false });
    const sizes = []; f.db.beforeBatch = entries => sizes.push(entries.length);
    await Promise.all([legacy.db.prepare('SELECT 1').first(), legacy.db.prepare('SELECT 2').first()]);
    assert.deepEqual(sizes, [2, 2]);
    sizes.length = 0;
    const scope = scoped(f);
    await Promise.all(Array.from({ length: 33 }, () => scope.db.prepare('SELECT 1').first()));
    assert.deepEqual(sizes, [17, 17, 2]);
  } finally { f.close(); }
});

test('failed D1 result rejects all grouped consumers and sticky ownership failures prevent later writes', async () => {
  const f = await performanceFixture({ pets: 3 });
  try {
    let scope = scoped(f);
    const original = f.db.batch;
    f.db.batch = async statements => (await original(statements)).map((row, index) => index === 0 ? { success: false, results: [] } : row);
    const failures = await Promise.allSettled([scope.db.prepare('SELECT 1').first(), scope.db.prepare('SELECT 2').all()]);
    assert.ok(failures.every(result => result.status === 'rejected' && result.reason.message === 'pet_state_read_unavailable'));
    f.db.batch = original;
    scope = scoped(f);
    f.active('fixture-space-2', 'pet-s2026-004');
    await assert.rejects(scope.db.prepare('SELECT 1').first(), /moonpet_displayed_pet_changed/);
    f.active('current-' + f.owner, 'pet-s2026-004');
    await assert.rejects(scope.db.prepare('UPDATE telegram_pet_profiles SET moon_gold=0').run(), /moonpet_displayed_pet_changed/);
    assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, 1000);
  } finally { f.close(); }
});

test('separate account scopes sharing one D1 database never share a read group', async () => {
  const f = await performanceFixture();
  try {
    const other = '980302', id = 'other-owned-pet';
    f.sql.prepare('INSERT INTO telegram_users(telegram_id) VALUES(?)').run(other);
    f.sql.prepare('INSERT INTO telegram_pet_profiles(telegram_id,moon_gold) VALUES(?,7)').run(other);
    f.sql.prepare("INSERT INTO telegram_pet_season_slots(pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES(?,?,'pet-s2026-004',1,'free')").run(id, other);
    f.sql.prepare("INSERT INTO telegram_pet_instances(pet_id,telegram_id,season_key,slot_number,source_profile_updated_at) VALUES(?,?,'pet-s2026-004',1,'0001-01-01 00:00:00')").run(id, other);
    f.sql.prepare("INSERT INTO telegram_pet_active_slots(telegram_id,pet_id,season_key) VALUES(?,?,'pet-s2026-004')").run(other, id);
    const one = scoped(f), two = createDisplayedPetScope(f.db, other, id, 'pet-s2026-004', { coalesceReads: true });
    const rows = await Promise.all([one.db.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').bind(f.owner).first(),
      two.db.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').bind(other).first()]);
    assert.deepEqual(rows.map(row => row.moon_gold), [1000, 7]);
  } finally { f.close(); }
});

test('timing fields are allowlisted and diagnostic failures cannot change state outcomes', async () => {
  const events = []; let clock = 0;
  const trace = createPetStateTimings({ mode: 'private-player-value', clock: () => clock, emit: event => events.push(event) });
  const value = await trace.measure('authentication', () => { clock = 12; return 'private-credential'; });
  assert.equal(value, 'private-credential');
  await assert.rejects(trace.measure('pet_state_projection', () => { throw Error('private-account-value'); }));
  await assert.rejects(trace.measure('private-stage-value', () => 1), /invalid_state_timing_stage/);
  trace.finish('private-outcome-value');
  for (const event of events) {
    assert.deepEqual(Object.keys(event).sort(), ['duration_ms','event','mode','outcome','request_id','stage'].sort());
    assert.equal(event.mode, 'full');
    assert.match(event.request_id, /^[0-9a-f-]{36}$/);
    assert.ok(!JSON.stringify(event).includes('private-'));
  }
  const broken = createPetStateTimings({ emit: () => { throw Error('logging unavailable'); } });
  assert.equal(await broken.measure('authentication', () => 7), 7);
});

test('authenticated HTTP state records every major stage without account identifiers or credentials', async () => {
  const f = await performanceFixture();
  const original = console.info, events = [];
  try {
    console.info = value => { if (typeof value === 'string' && value.includes('moonpet_state_timing')) events.push(JSON.parse(value)); };
    const token = '123456:performance-fixture-secret';
    const fields = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: Number(f.owner), first_name: 'Private fixture name' }) });
    const check = [...fields].sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => key + '=' + value).join('\n');
    fields.set('hash', createHmac('sha256', createHmac('sha256','WebAppData').update(token).digest()).update(check).digest('hex'));
    const response = await f.worker.fetch(new Request('https://fixture.test/telegram-pets/app/state', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({init_data:fields.toString()}) }), { DB:f.db, TELEGRAM_BOT_TOKEN:token });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state.adopted, true);
    for (const stage of ['authentication','d1_bootstrap','ownership_verification','state_recovery','daily_settlement','weekly_settlement','pet_state_projection','response_serialization','total']) assert.ok(events.some(e => e.stage === stage), stage);
    const logged = JSON.stringify(events);
    for (const secret of [f.owner,'current-' + f.owner, token, 'Private fixture name', fields.get('hash')]) assert.equal(logged.includes(secret), false);
    assert.equal(new Set(events.map(e => e.request_id)).size, 1);
    assert.equal(events.at(-1).outcome, 'completed');
  } finally { console.info = original; f.close(); }
});


test('website credentials switch accounts on the same database and expired proof performs no state recovery', async () => {
  const f = await performanceFixture(), original = console.info, events = [];
  try {
    console.info = value => { if (typeof value === 'string' && value.includes('moonpet_state_timing')) events.push(JSON.parse(value)); };
    f.sql.exec(readFileSync(new URL('../workers/moonboys-api/migrations/003_anticheat.sql', import.meta.url), 'utf8'));
    const other = '980302', id = 'website-other-pet';
    f.sql.prepare('INSERT INTO telegram_users(telegram_id) VALUES(?)').run(other);
    f.sql.prepare('INSERT INTO telegram_pet_profiles(telegram_id,moon_gold) VALUES(?,7)').run(other);
    f.sql.prepare("INSERT INTO telegram_pet_season_slots(pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES(?,?,'pet-s2026-004',1,'free')").run(id, other);
    f.sql.prepare("INSERT INTO telegram_pet_instances(pet_id,telegram_id,season_key,slot_number,source_profile_updated_at) VALUES(?,?,'pet-s2026-004',1,'0001-01-01 00:00:00')").run(id, other);
    f.sql.prepare("INSERT INTO telegram_pet_active_slots(telegram_id,pet_id,season_key) VALUES(?,?,'pet-s2026-004')").run(other, id);
    const credentials = [];
    const now = Math.floor(Date.now() / 1000);
    for (const [index, owner] of [f.owner, other].entries()) {
      const proof = 's1_' + (index ? 'B' : 'A').repeat(43), session = 'fixture-session-' + index;
      f.sql.prepare('INSERT INTO telegram_website_sessions(session_hash,telegram_id,csrf_hash,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?)')
        .run(session, owner, 'unused-fixture-csrf', now, now, now + 3600);
      f.sql.prepare('INSERT INTO telegram_website_credentials(token_hash,session_hash,expires_at) VALUES(?,?,?)').run(await authDigest(proof), session, now + 300);
      credentials.push({ id: owner, hash: proof, auth_date: now });
    }
    const request = auth => f.worker.fetch(new Request('https://fixture.test/telegram-pets/app/state', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: auth, telegram_id: f.owner }),
    }), { DB: f.db });
    const one = await request(credentials[0]), two = await request(credentials[1]);
    assert.equal(one.status, 200); assert.equal(two.status, 200);
    assert.equal((await one.json()).state.pet.pet_id, 'current-' + f.owner);
    const switched = (await two.json()).state;
    assert.equal(switched.pet.pet_id, id); assert.equal(switched.pet.moon_gold, 7);
    assert.equal(new Set(events.map(e => e.request_id)).size, 2);
    const logged = JSON.stringify(events);
    for (const value of [f.owner, other, id, ...credentials.map(c => c.hash)]) assert.equal(logged.includes(value), false);
    events.length = 0;
    f.sql.prepare('DELETE FROM telegram_website_credentials').run();
    assert.equal((await request(credentials[0])).status, 401);
    assert.equal(events.at(-1).outcome, 'rejected');
    assert.equal(events.some(e => e.stage === 'state_recovery' || e.stage === 'd1_bootstrap'), false);
  } finally { console.info = original; f.close(); }
});
