import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { getOrCreatePetRuntimeState } from '../workers/moonboys-api/pets/runtime-phase-5a.js';
import { getPetXpRequiredForVisibleLevel } from '../workers/moonboys-api/pets/progression-phase-2.js';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const now = new Date();
const currentSeason = hooks.getPetSeasonInfo(now).key;
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
  for (const migration of ['058_telegram_pet_season_completion.sql','061_moonpet_season_economy_calibration.sql']) sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/'+migration, import.meta.url),'utf8'));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { if (db.beforeFirst) { const injected=await db.beforeFirst(this); if(injected!==undefined)return injected; } return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      if (this.query.includes('UPDATE telegram_pet_activity_sessions') && this.query.includes("status = 'expired'") && db.expiryFailure) {
        db.expiryAttempts++;
        if (db.expiryFailure === 'thrown') throw Error('expiry_write_outage');
        if (db.expiryFailure === 'resolved') return { success: false, error: 'expiry_write_outage', meta: { changes: 0 } };
        if (db.expiryFailure === 'malformed') return { success: true };
        return { success: true, meta: { changes: 0 }, results: [] };
      }
      if (sql.prepare(this.query).columns().length && !/\bRETURNING\b/i.test(this.query)) return { results: sql.prepare(this.query).all(...this.args), meta: { changes: 0 } };
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) await db.beforeRun(this); return this.exec(); }
  }
  const db = { expiryFailure: null, expiryAttempts: 0, beforeBatch: null, beforeRun: null, failReward: false, rejectReward: false, prepare(query) { return new Statement(query); }, async batch(statements) {
    if (this.failReward && statements.some(s => /INSERT OR IGNORE INTO telegram_pet_reward_claims/.test(s.query))) {
      this.failReward = false;
      throw Error('interrupted_terminal_reward');
    }
    if (this.rejectReward && statements.some(s => /INSERT OR IGNORE INTO telegram_pet_reward_claims/.test(s.query))) {
      this.rejectReward = false;
      return statements.map(() => ({ results: [], meta: { changes: 0 } }));
    }
    for (const statement of statements) {
      if (/^\s*SELECT\b/i.test(statement.query)) {
        if (this.beforeFirst) { const reply = await this.beforeFirst(statement); if (reply?.success === false) throw Error('pet_state_read_unavailable'); }
        if (this.beforeAll) { const reply = await this.beforeAll(statement); if (reply?.success === false) throw Error('pet_state_read_unavailable'); }
      } else if (this.beforeRun) await this.beforeRun(statement);
    }
    if (this.beforeBatch) await this.beforeBatch(statements);
    sql.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(s.exec()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, 'Test player');
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,energy) VALUES (?,200,100)').run(owner);
  sql.prepare("INSERT INTO telegram_seasons (name,start_date,end_date) VALUES ('Community','2000-01-01','2999-01-01')").run();
  function pet(id, season = currentSeason, xp = 200, slot = 1) {
    sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,?,'free')").run(id, owner, season, slot);
    sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at) VALUES (?,?,?,?,?,100,'0001-01-01 00:00:00')").run(id, owner, season, slot, xp);
    sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,'young','vinyl_crab','{}','[]')").run(id, owner, id);
  }
  pet('current-' + owner);
  sql.prepare('INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner, 'current-' + owner, currentSeason);
  sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=1000,moon_crystals=100,style_tokens=100 WHERE telegram_id=?').run(owner);
  const act = body => dispatchRenderedPetAction(db,owner,{id:owner},body,'fixture-token');
  const state = () => hooks.buildPetMiniAppState(db, owner, 'fixture-token');
  return { sql, db, owner, pet, act, state };
}

const clientSource = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
const client = vm.createContext({ cooldownMetadata: () => null });
vm.runInContext(clientSource.match(/  function activityClaimButtonOptions\(activity\) \{[\s\S]*?\n  \}/)[0], client);
const claimOptions = activity => client.activityClaimButtonOptions(activity);
const activityRow = f => f.sql.prepare('SELECT * FROM telegram_pet_activity_sessions WHERE telegram_id=? ORDER BY created_at DESC').get(f.owner);
const progress = f => ({
  pets: f.sql.prepare('SELECT pet_id,season_key,pet_xp,health,hunger,cleanliness,energy,happiness FROM telegram_pet_instances ORDER BY pet_id').all(),
  wallet: f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get(),
  awards: f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_activity' AND status='awarded'").get().n,
});

for (const level of [12, 19, 20]) test(`Rooftop Courier shows and enforces the existing Level 20 gate at level ${level}`, async () => {
  const f = fixture('job-gate-' + level), id = 'current-' + f.owner;
  const xp = getPetXpRequiredForVisibleLevel(level);
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=?,level=?').run(xp, level);
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=?,level=?').run(xp, level);
  f.sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,'street_moonpet',1,'qualified')").run(id, f.owner);
  await getOrCreatePetRuntimeState(f.db, f.owner, now.toISOString().slice(0, 10), { pet_id: id, season_key: currentSeason });
  f.sql.prepare('UPDATE telegram_pet_specialist_progression SET adventure_xp=750').run();
  const state = await f.state(), job = state.guidance.jobs.find(job => job.key === 'rooftop_courier');
  assert.equal(job.min_level, 20); assert.equal(job.min_evolution_stage, 1);
  assert.equal(job.current_xp, 750); assert.equal(job.required_xp, 750);
  assert.equal(job.available, level >= 20);
  assert.equal(hooks.PET_JOBS.rooftop_courier.min_level, 20, 'raw catalog and guidance share the effective requirement');
  const result = await f.act({ action: 'work', job_key: job.key, request_id: 'job-gate' });
  assert.equal(result.accepted, level >= 20);
  if (level < 20) { assert.equal(result.reason, 'job_locked'); assert.equal(result.required_level, 20); }
  else { assert.equal(result.pet_xp_awarded, 34); assert.equal(result.pet.pet_id, id); }
  assert.equal(hooks.PET_JOBS.mural_commission.min_level, 30, 'an existing higher job gate is retained');
  f.sql.close();
});

for (const type of ['sleep', 'train', 'work', 'explore']) {
  for (const failure of ['thrown', 'resolved', 'malformed', 'no_op']) test(`${type}: ${failure} expiration cannot publish or pay an expired activity`, async () => {
    const f = fixture('expired-' + type + '-' + failure);
    const started = await f.act({ action: 'activity_start', activity_type: type, request_id: 'start' });
    assert.equal(started.accepted, true);
    const cap = hooks.buildPetActivityOptions().find(entry => entry.key === type).cap_seconds;
    f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now',?),ends_at=datetime('now','-25 hours')")
      .run('-' + (25 * 3600 + cap) + ' seconds');
    const expired = activityRow(f), before = progress(f);
    f.db.expiryFailure = failure;
    await assert.rejects(f.state(), /expiry_write_outage|pet_state_write_unavailable|pet_activity_state_unavailable/);
    await assert.rejects(hooks.buildPetMiniAppCoreState(f.db, f.owner), /expiry_write_outage|pet_state_write_unavailable|pet_activity_state_unavailable/);
    const summary = hooks.buildPetActivitySummary(expired);
    assert.equal(summary.ready, false); assert.equal(summary.preview, null); assert.equal(summary.unavailable, true);
    assert.equal(claimOptions(summary).disabled, true, 'even a directly supplied stale row cannot enable the client button');
    await assert.rejects(f.act({ action: 'activity_claim', session_id: started.session.id, request_id: 'expired-claim' }), /expiry_write_outage|pet_state_write_unavailable|pet_activity_state_unavailable/);
    assert.ok(f.db.expiryAttempts >= 3);
    assert.deepEqual(progress(f), before);
    assert.deepEqual(activityRow(f), expired, 'failed expiration preserves the original row and source metadata');
    f.db.expiryFailure = null;
    assert.equal((await f.state()).guidance.activity, null);
    const history = activityRow(f);
    assert.equal(history.status, 'expired'); assert.equal(history.metadata, expired.metadata); assert.equal(history.id, expired.id);
    assert.equal((await f.act({ action: 'activity_claim', session_id: started.session.id, request_id: 'expired-claim' })).reason, 'no_active_activity');
    assert.equal((await f.act({ action: 'activity_start', activity_type: type, request_id: 'new-activity' })).accepted, true);
    assert.deepEqual(progress(f), before);
    f.sql.close();
  });

  test(`${type}: interrupted source-pet reward stays recoverable beyond expiration and pays once`, async () => {
    const f = fixture('recover-' + type), source = 'current-' + f.owner;
    f.pet('pet-b', currentSeason, 300, 2); f.pet('pet-c', currentSeason, 400, 3);
    const started = await f.act({ action: 'activity_start', activity_type: type, request_id: 'start' });
    assert.equal(started.accepted, true);
    f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-30 minutes')").run();
    let interrupted = false;
    f.db.beforeRun = statement => {
      if (!interrupted && statement.query.includes('UPDATE telegram_pet_activity_sessions') && statement.query.includes('SET metadata = ?')) {
        interrupted = true; throw Error('settlement_ack_interrupted');
      }
    };
    const result = await f.act({ action: 'activity_claim', session_id: started.session.id, request_id: 'claim' });
    assert.equal(result.accepted, true); assert.equal(result.refresh_state, true); assert.equal(interrupted, true);
    assert.equal(result.pet.pet_id, source); assert.equal(result.pet.season_key, currentSeason);
    const paid = progress(f), original = activityRow(f);
    assert.equal(paid.awards, 1);
    const accepted = f.sql.prepare("SELECT pet_id,season_key FROM telegram_pet_events WHERE event_type='activity_claim' AND status='accepted'").get();
    assert.equal(accepted.pet_id, source); assert.equal(accepted.season_key, currentSeason);
    f.db.beforeRun = null;
    f.sql.prepare("UPDATE telegram_pet_activity_sessions SET ends_at=datetime('now','-25 hours')").run();
    const summary = hooks.buildPetActivitySummary(activityRow(f));
    assert.equal(summary.recovery_pending, true); assert.equal(summary.ready, true); assert.equal(claimOptions(summary).disabled, false);
    assert.deepEqual(summary.preview, JSON.parse(original.metadata).computed);
    const recovered = await f.act({ action: 'activity_claim', session_id: started.session.id, request_id: 'claim' });
    assert.equal(recovered.accepted, true); assert.equal(recovered.duplicate, true); assert.equal(recovered.pet.pet_id, source);
    assert.deepEqual(progress(f), paid);
    for (const id of ['pet-b', 'pet-c']) {
      assert.equal((await hooks.switchActivePetSeasonSlot(f.db, f.owner, id)).accepted, true);
      const beforeRetry = progress(f);
      assert.equal((await f.act({ action: 'activity_claim', session_id: started.session.id, request_id: 'claim' })).reason, 'no_active_activity');
      assert.deepEqual(progress(f), beforeRetry);
    }
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE pet_id IN ('pet-b','pet-c')").get().n, 0);
    f.sql.close();
  });
}

test('activity summary matches the inclusive second-precision claim deadline', () => {
  const deadline = new Date('2026-10-02T12:00:00Z');
  const row = { activity_type: 'train', status: 'active', started_at: '2026-10-01T10:00:00Z', ends_at: '2026-10-01 12:00:00' };
  assert.equal(hooks.buildPetActivitySummary(row, new Date(deadline.getTime() + 999)).ready, true);
  assert.equal(hooks.buildPetActivitySummary(row, new Date(deadline.getTime() + 1000)).ready, false);
  assert.equal(hooks.buildPetActivitySummary({ ...row, ends_at: null }, deadline).ready, false);
});


test('ISO and SQLite end timestamps expire identically without changing settled history', async () => {
  const f = fixture('activity-expiry-formats');
  const at = new Date('2026-10-02T12:00:00Z');
  for (const [id, status, endsAt] of [
    ['iso', 'active', '2026-10-01T11:59:59.000Z'],
    ['sqlite', 'active', '2026-10-01 11:59:59'],
    ['boundary', 'active', '2026-10-01T12:00:00.000Z'],
    ['settled', 'completed', '2026-10-01T11:59:59.000Z'],
  ]) {
    f.sql.prepare(`INSERT INTO telegram_pet_activity_sessions
      (id,telegram_id,activity_type,started_at,ends_at,status,metadata)
      VALUES (?,?,'train','2026-10-01 09:59:59',?,?,'{"preserved":true}')`).run(id, f.owner, endsAt, status);
    await hooks.expireOldPetActivitySessions(f.db, f.owner, at);
  }
  const settled = f.sql.prepare("SELECT * FROM telegram_pet_activity_sessions WHERE id='settled'").get();
  await hooks.expireOldPetActivitySessions(f.db, f.owner, at);
  assert.deepEqual(f.sql.prepare('SELECT id,status FROM telegram_pet_activity_sessions ORDER BY id').all().map(row => ({ ...row })), [
    { id: 'boundary', status: 'active' }, { id: 'iso', status: 'expired' },
    { id: 'settled', status: 'completed' }, { id: 'sqlite', status: 'expired' },
  ]);
  assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_activity_sessions WHERE id='settled'").get(), settled);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_activity_sessions').get().n, 4);
  f.sql.close();
});
