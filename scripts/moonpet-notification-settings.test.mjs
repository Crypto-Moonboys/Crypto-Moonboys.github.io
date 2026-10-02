import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

function fixture(owner = 'notification-owner') {
  const sql = new DatabaseSync(':memory:');
  for (const file of ['schema.sql', 'migrations/048_telegram_pet_player_expansion.sql', 'migrations/058_telegram_pet_season_completion.sql', 'migrations/061_moonpet_season_economy_calibration.sql']) {
    sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/' + file, import.meta.url), 'utf8'));
  }
  function failure(mode) {
    if (mode === 'throw') throw new Error('isolated_notification_failure');
    if (mode === 'failed') return { success: false, error: 'isolated_notification_failure', meta: { changes: 1 } };
    if (mode === 'missing') return { success: true };
    if (mode === 'missing_success') return { meta: { changes: 1 } };
    if (mode === 'null') return null;
    if (mode === 'zero') return { success: true, meta: { changes: 0 } };
    if (mode === 'malformed') return { success: true, meta: { changes: '1' } };
    if (mode === 'wrong_owner') return { telegram_id: 'another-owner', enabled: 0 };
    return undefined;
  }
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() {
      if (db.readFailure && this.query.includes('SELECT telegram_id, enabled')) return failure(db.readFailure);
      return sql.prepare(this.query).get(...this.args) || null;
    }
    async all() {
      if (db.readFailure && this.query.includes('telegram_pet_notification_settings')) return failure(db.readFailure);
      return { success: true, results: sql.prepare(this.query).all(...this.args) };
    }
    exec() {
      if (this.query.includes('INSERT INTO telegram_pet_notification_settings') && db.writeFailure) return failure(db.writeFailure);
      const statement = sql.prepare(this.query);
      if (statement.columns().length) {
        const results = statement.all(...this.args);
        return { success: true, results, meta: { changes: /\bRETURNING\b/i.test(this.query) ? results.length : 0 } };
      }
      return { success: true, results: [], meta: { changes: Number(statement.run(...this.args).changes) } };
    }
    async run() { return this.exec(); }
  }
  const db = { readFailure: null, writeFailure: null, prepare(query) { return new Statement(query); }, async batch(statements) {
    sql.exec('BEGIN');
    try { const results = statements.map(statement => statement.exec()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, 'Notification player');
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,energy) VALUES (?,200,100)').run(owner);
  sql.prepare("INSERT INTO telegram_seasons (name,start_date,end_date) VALUES ('Community','2000-01-01','2999-01-01')").run();
  const season = hooks.getPetSeasonInfo(new Date()).key;
  const petId = 'pet-' + owner;
  sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,1,'free')").run(petId, owner, season);
  sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at) VALUES (?,?,?,1,200,100,'0001-01-01 00:00:00')").run(petId, owner, season);
  sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,'young','vinyl_crab','{}','[]')").run(petId, owner, petId);
  sql.prepare('INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner, petId, season);
  return { sql, db, owner, act: enabled => hooks.processPetMiniAppAction(db, owner, { id: owner }, { action: 'notification_set', enabled }, 'fixture-token') };
}

for (const mode of ['failed', 'throw', 'missing', 'missing_success', 'null', 'zero', 'malformed']) test(`notification ${mode} write never acknowledges or changes the saved ON preference; retry commits once`, async () => {
  const f = fixture();
  await hooks.setPetNotificationPreference(f.db, f.owner, true);
  const before = f.sql.prepare('SELECT * FROM telegram_pet_notification_settings').get();
  f.db.writeFailure = mode;
  await assert.rejects(hooks.setPetNotificationPreference(f.db, f.owner, false), /unavailable|isolated_notification_failure/);
  const rejected = await f.act(false);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, 'notification_save_pending');
  assert.equal(rejected.refresh_state, true);
  assert.equal(rejected.preference, undefined, 'no unsaved preference may appear as authority');
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_notification_settings').get(), before);
  f.db.writeFailure = null;
  for (let retry = 0; retry < 2; retry++) {
    const saved = await f.act(false);
    assert.equal(saved.accepted, true);
    assert.equal(saved.preference.enabled, 0);
    assert.equal((await hooks.getPetNotificationPreference(f.db, f.owner)).enabled, 0);
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_notification_settings').get().n, 1);
});

test('saved ON, saved OFF and a successfully absent preference are distinguishable from unavailable state', async () => {
  const f = fixture();
  assert.deepEqual(await hooks.getPetNotificationPreference(f.db, f.owner), {
    telegram_id: f.owner, available: true, enabled: 0, last_notified_at: null, last_reason: null,
  });
  for (const enabled of [true, false, true]) {
    assert.equal((await f.act(enabled)).accepted, true);
    const state = await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token');
    assert.equal(state.notifications.available, true);
    assert.equal(state.notifications.enabled, enabled);
  }
});

for (const mode of ['failed', 'throw', 'missing', 'wrong_owner']) test(`notification ${mode} read exposes unavailable, preserves saved ON and recovers on retry`, async () => {
  const f = fixture();
  await hooks.setPetNotificationPreference(f.db, f.owner, true);
  f.db.readFailure = mode;
  const preference = await hooks.getPetNotificationPreference(f.db, f.owner);
  assert.equal(preference.available, false);
  assert.equal(preference.enabled, null);
  const state = await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token');
  assert.equal(state.notifications.available, false);
  assert.equal(state.notifications.enabled, null, 'a failed read must never report OFF');
  assert.equal(f.sql.prepare('SELECT enabled FROM telegram_pet_notification_settings').get().enabled, 1);
  f.db.readFailure = null;
  const retry = await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token');
  assert.equal(retry.notifications.available, true);
  assert.equal(retry.notifications.enabled, true);
});

test('account alert changes cannot change another account or gameplay balances', async () => {
  const f = fixture();
  await hooks.setPetNotificationPreference(f.db, 'another-owner', true);
  const before = f.sql.prepare('SELECT * FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
  await f.act(false);
  assert.equal((await hooks.getPetNotificationPreference(f.db, 'another-owner')).enabled, 1);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner), before);
});

test('Telegram command confirms only committed writes and reports unavailable reads truthfully', async () => {
  const f = fixture();
  const originalFetch = globalThis.fetch;
  const messages = [];
  globalThis.fetch = async (_url, options) => {
    messages.push(JSON.parse(options.body).text);
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  };
  try {
    await hooks.cmdPetNotify(f.db, 'fixture-token', f.owner, f.owner, 'on');
    assert.match(messages.at(-1), /alerts enabled/);
    for (const mode of ['failed', 'throw', 'zero']) {
      f.db.writeFailure = mode;
      await hooks.cmdPetNotify(f.db, 'fixture-token', f.owner, f.owner, 'off');
      assert.match(messages.at(-1), /save could not be confirmed/);
      assert.doesNotMatch(messages.at(-1), /alerts disabled/);
    }
    f.db.readFailure = 'failed';
    await hooks.cmdPetNotify(f.db, 'fixture-token', f.owner, f.owner, 'status');
    assert.match(messages.at(-1), /temporarily unavailable/);
    assert.doesNotMatch(messages.at(-1), /are disabled/);
    f.db.readFailure = f.db.writeFailure = null;
    await hooks.cmdPetNotify(f.db, 'fixture-token', f.owner, f.owner, 'status');
    assert.match(messages.at(-1), /are enabled/);
    await hooks.cmdPetNotify(f.db, 'fixture-token', f.owner, f.owner, 'off');
    assert.match(messages.at(-1), /alerts disabled/);
  } finally { globalThis.fetch = originalFetch; }
});

for (const mode of ['failed', 'throw', 'missing']) test(`scheduled notification ${mode} read fails closed without messages`, async () => {
  const f = fixture();
  f.db.readFailure = mode;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { assert.fail('unavailable preferences cannot authorize a message'); };
  try {
    const result = await hooks.runPetNeedsNotifications({ DB: f.db, TELEGRAM_BOT_TOKEN: 'fixture-token' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'pet_notification_state_unavailable');
    assert.equal(result.sent, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('Profile disables both alert controls during unavailable reads and renders authoritative ON/OFF after retry', () => {
  const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
  const code = client.split('// TEST-EXPORT: notificationControls:start')[1].split('// TEST-EXPORT: notificationControls:end')[0];
  const controls = [];
  const context = vm.createContext({ button(label, action, payload, options) {
    controls.push({ label, action, payload, options });
    return `<button${options.disabled ? ' disabled' : ''}>${label}</button>`;
  } });
  vm.runInContext(code, context);
  for (const snapshot of [undefined, {}, { enabled: false }, { available: false, enabled: null }, { available: false, enabled: true }]) {
    controls.length = 0;
    const html = context.renderPetNotificationControls(snapshot);
    assert.match(html, /STATE UNAVAILABLE/);
    assert.match(html, /Refresh to retry/);
    assert.doesNotMatch(html, /PROGRESSION ALERTS: OFFLINE/);
    assert.equal(controls.length, 2);
    assert.ok(controls.every(control => control.options.disabled && control.options.statusLabel === 'REFRESH REQUIRED'));
  }
  for (const enabled of [true, false, true]) {
    controls.length = 0;
    const html = context.renderPetNotificationControls({ available: true, enabled });
    assert.match(html, new RegExp('PROGRESSION ALERTS: ' + (enabled ? 'ONLINE' : 'OFFLINE')));
    assert.equal(controls[0].options.disabled, enabled);
    assert.equal(controls[1].options.disabled, !enabled);
    assert.equal(controls[0].payload.enabled, true);
    assert.equal(controls[1].payload.enabled, false);
  }
});

test('scheduled progression alerts capture the owned pet before loading achievements and respect saved OFF', async () => {
  const f = fixture();
  await hooks.setPetNotificationPreference(f.db, f.owner, true);
  const originalFetch = globalThis.fetch;
  const messages = [];
  globalThis.fetch = async (_url, options) => {
    messages.push(JSON.parse(options.body).text);
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  };
  try {
    const result = await hooks.runPetNeedsNotifications({ DB: f.db, TELEGRAM_BOT_TOKEN: 'fixture-token' });
    assert.equal(result.ok, true);
    assert.equal(result.sent, 1);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /new unlocks|Open Moonpet OS for the best next move/);
    const achievements = f.sql.prepare('SELECT pet_id,telegram_id,season_key FROM telegram_pet_achievements').all();
    assert.ok(achievements.length, 'the compatibility profile candidate must resolve to an owned pet for guidance');
    assert.ok(achievements.every(row => row.pet_id === 'pet-' + f.owner && row.telegram_id === f.owner && row.season_key === hooks.getPetSeasonInfo(new Date()).key));
    assert.equal(f.sql.prepare('SELECT last_reason FROM telegram_pet_notification_settings').get().last_reason, 'progress_ready');
    await hooks.setPetNotificationPreference(f.db, f.owner, false);
    const off = await hooks.runPetNeedsNotifications({ DB: f.db, TELEGRAM_BOT_TOKEN: 'fixture-token' });
    assert.equal(off.ok, true);
    assert.equal(off.considered, 0);
    assert.equal(off.sent, 0);
    assert.equal(messages.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});
