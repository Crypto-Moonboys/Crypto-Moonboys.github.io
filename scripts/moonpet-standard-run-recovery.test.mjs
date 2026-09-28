import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const now = new Date();
const currentSeason = hooks.getPetSeasonInfo(now).key;
const oldSeason = hooks.getPetSeasonInfo(new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 15))).key;
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { return this.exec(); }
  }
  const db = { failReward: false, rejectReward: false, prepare(query) { return new Statement(query); }, async batch(statements) {
    if (this.beforeBatch) await this.beforeBatch(statements);
    if (this.failReward && statements.some(s => /INSERT OR IGNORE INTO telegram_pet_reward_claims/.test(s.query))) {
      this.failReward = false;
      throw Error('interrupted_terminal_reward');
    }
    if (this.rejectReward && statements.some(s => /INSERT OR IGNORE INTO telegram_pet_reward_claims/.test(s.query))) {
      this.rejectReward = false;
      return statements.map(() => ({ results: [], meta: { changes: 0 } }));
    }
    sql.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(s.exec()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, 'Test player');
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,energy) VALUES (?,200,100)').run(owner);
  sql.prepare("INSERT INTO telegram_seasons (name,start_date,end_date) VALUES ('Community','2000-01-01','2999-01-01')").run();
  function pet(id, season = currentSeason, xp = 200) {
    sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,1,'free')").run(id, owner, season);
    sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at) VALUES (?,?,?,1,?,100,'0001-01-01 00:00:00')").run(id, owner, season, xp);
    sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,'young','vinyl_crab','{}','[]')").run(id, owner, id);
  }
  pet('current-' + owner);
  sql.prepare('INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner, 'current-' + owner, currentSeason);
  function run(id, { petId = 'current-' + owner, season = currentSeason, status = 'active', depth = 2, xp = 24, gold = 9, evidence = true } = {}) {
    sql.prepare(`INSERT INTO telegram_pet_runs (id,run_id,telegram_id,pet_id,season_key,status,depth,current_room,max_depth,max_room,unbanked_pet_xp,unbanked_moon_gold)
      VALUES (?,?,?,?,?,?,?,?,100,100,?,?)`).run(id, id, owner, petId, season, status, depth, depth, xp, gold);
    if (evidence && depth > 0) sql.prepare(`INSERT INTO telegram_pet_run_steps (id,run_id,telegram_id,pet_id,step_index,choice_key,choice_type,event_key,success)
      VALUES (?,?,?,?,?,'fight','fight',?,1)`).run(id + '-step', id, owner, petId, depth, id + '-step');
    return id;
  }
  const state = () => hooks.buildPetMiniAppState(db, owner, 'fixture-token');
  const get = async path => { const response = await worker.fetch(new Request('https://moonboys-api.test' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, pet, run, state, get };
}

test('two persistently failing Standard endings yield the state budget to later payouts and retry on wraparound', async () => {
  const f = fixture('standard-fair');
  await f.state();
  for (const id of ['a-blocked', 'b-blocked', 'c-ready']) f.run(id, { status: 'extracted' });
  f.db.beforeBatch = statements => {
    if (statements.some(s => s.query.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims') && s.args.some(arg => typeof arg === 'string' && /[ab]-blocked/.test(arg)))) throw Error('persistent_standard_failure');
  };
  await f.state();
  await f.state();
  const events = () => f.sql.prepare("SELECT event_key,pet_id,pet_xp_awarded FROM telegram_pet_events WHERE event_type='run_extract' ORDER BY event_key").all();
  assert.equal(events().length, 1, 'later extraction must recover despite the two failed oldest endings');
  assert.match(events()[0].event_key, /c-ready$/);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=daily')).entries[0].pet_xp, 24);
  f.db.beforeBatch = null;
  await f.state(); await f.state();
  assert.equal(events().length, 3, 'failed records remain retryable');
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp, 272);
  const paid = events(); await f.state(); assert.deepEqual(events(), paid);
});

test('failed saved run XP and item activity keep the original pet and season', async () => {
  const f = fixture('81001');
  f.pet('old-run-pet', oldSeason, 100);
  f.sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES ('old-run-pet',?,'elite_moonpet',3,'reveal')").run(f.owner);
  f.sql.prepare("INSERT INTO telegram_pet_inventory (telegram_id,asset_type,asset_key,quantity) VALUES (?,'item','lucky_charm',1)").run(f.owner);
  f.run('old-failure', { petId: 'old-run-pet', season: oldSeason, depth: 0 });
  const choice = hooks.buildPetRunChoiceReplyMarkup({ run_id: 'old-failure', depth: 0, max_depth: 100, unbanked_items: '{}' }).inline_keyboard[0][0].callback_data.split(':').at(-1);
  const originalRandom = Math.random;
  Math.random = () => 0;
  let result;
  try { result = await hooks.processPetRunStep(f.db, f.owner, 'old-failure', choice, { event_key: 'old-failure-step', expected_step_index: 1 }); }
  finally { Math.random = originalRandom; }
  assert.equal(result.reason, 'run_failed');
  assert.ok(result.pet_xp_awarded > 0);
  const event = f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='run_fail'").get();
  assert.equal(event.season_key, oldSeason, 'failure XP belongs to the run season, not the refresh season');
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE season_key=?').get(oldSeason).season_xp, result.pet_xp_awarded);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_season_state WHERE season_key=?').get(currentSeason).n, 0);
  const item = f.sql.prepare("SELECT pet_id,season_key FROM telegram_pet_events WHERE event_type='run_item_use'").get();
  assert.equal(item.pet_id, 'old-run-pet'); assert.equal(item.season_key, oldSeason);
  const activity = await f.get('/telegram-pets/activity');
  for (const entry of activity.items.filter(e => ['run_fail','run_item_use'].includes(e.event_type))) assert.equal(entry.display_name, 'BOTTY');
  assert.deepEqual((await f.get('/telegram-pets/leaderboard?period=seasonal')).entries, []);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=daily')).entries[0].pet_xp, result.pet_xp_awarded);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp, 300 + result.pet_xp_awarded);
  await hooks.processPetRunStep(f.db, f.owner, 'old-failure', choice, { event_key: 'old-failure-step', expected_step_index: 1 });
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_fail'").get().n, 1);
});

test('refresh recovers extraction closed before its reward batch', async () => {
  const f = fixture('81002');
  await f.state();
  f.run('interrupted-extract');
  f.db.failReward = true;
  await assert.rejects(hooks.processPetRunExtract(f.db, f.owner, 'interrupted-extract'), /interrupted_terminal_reward/);
  assert.equal(f.sql.prepare("SELECT status FROM telegram_pet_runs WHERE run_id='interrupted-extract'").get().status, 'extracted');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_extract'").get().n, 0);
  const refreshed = await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_extract' AND status='accepted'").get().n, 1, 'refresh must recover the hidden payout');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_weekly_journey_objectives WHERE objective_id='weekly_run' AND status='accepted'").get().n, 1, 'the recovered accepted finish reaches Weekly Journey');
  assert.equal(refreshed.guidance.missions.find(m => m.key.startsWith('pet-daily-adventure:')).completed, true, 'the daily mission sees the recovered finish');
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp, 224);
  await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_extract'").get().n, 1);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, 9);
});

test('refresh settles a saved final standard room without another step or extraction', async () => {
  const f = fixture('81003');
  await f.state();
  f.run('final-room-saved', { depth: 100, status: 'extractable' });
  await f.state();
  assert.equal(f.sql.prepare("SELECT status FROM telegram_pet_runs WHERE run_id='final-room-saved'").get().status, 'completed');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_complete'").get().n, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_run_steps WHERE run_id='final-room-saved'").get().n, 1);
  await f.state();
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp, 224);
});

test('old-pet completion recovery updates original-season rewards and all public totals once', async () => {
  const f = fixture('81004');
  await f.state();
  f.pet('archived-run-pet', oldSeason, 100);
  f.sql.prepare("UPDATE telegram_pet_instances SET status='archived' WHERE pet_id='archived-run-pet'").run();
  f.sql.prepare("UPDATE telegram_pet_season_slots SET status='archived' WHERE pet_id='archived-run-pet'").run();
  f.sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES ('archived-run-pet',?,'elite_moonpet',3,'reveal')").run(f.owner);
  f.run('completed-old-pet', { petId: 'archived-run-pet', season: oldSeason, status: 'completed', depth: 100 });
  await Promise.all([hooks.recoverPetStandardRunEndings(f.db, f.owner), hooks.recoverPetStandardRunEndings(f.db, f.owner)]);
  const claim = f.sql.prepare("SELECT pet_id,season_key,pet_xp_awarded,xp_awarded FROM telegram_pet_events WHERE event_type='run_complete'").get();
  assert.equal(claim.pet_id, 'archived-run-pet'); assert.equal(claim.season_key, oldSeason);
  assert.equal(claim.pet_xp_awarded, 24); assert.equal(claim.xp_awarded, 80);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?").get('current-' + f.owner).pet_xp, 200);
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE season_key=?').get(oldSeason).season_xp, 24);
  assert.deepEqual((await f.get('/telegram-pets/leaderboard?period=seasonal')).entries, []);
  for (const period of ['daily','weekly']) assert.equal((await f.get('/telegram-pets/leaderboard?period=' + period)).entries[0].pet_xp, 24);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp, 324);
  assert.equal((await f.get('/telegram/leaderboard')).entries[0].xp, 80);
  assert.equal((await f.get('/telegram-pets/activity')).items[0].display_name, 'BOTTY');
  await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_run_legacy'").get().n, 1);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, 9);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_extract'").get().n, 0);
});

test('unrecoverable source records are excluded before the five-run limit', async () => {
  const f = fixture('81005');
  await f.state();
  for (let i = 0; i < 7; i++) {
    f.run('invalid-' + i, { status: 'extracted', evidence: i !== 0 });
    if (i === 1) f.sql.prepare("UPDATE telegram_pet_runs SET season_key='wrong-season' WHERE run_id=?").run('invalid-' + i);
    if (i === 2) f.sql.prepare("UPDATE telegram_pet_runs SET pet_id='foreign-pet' WHERE run_id=?").run('invalid-' + i);
    if (i === 3) f.sql.prepare('UPDATE telegram_pet_run_steps SET success=0 WHERE run_id=?').run('invalid-' + i);
    if (i === 4) f.sql.prepare("UPDATE telegram_pet_run_steps SET pet_id='foreign-pet' WHERE run_id=?").run('invalid-' + i);
    if (i === 5) f.sql.prepare(`INSERT INTO telegram_pet_daily_runs (telegram_id,pet_id,utc_day,seed,run_id,status)
      VALUES (?,?,'2000-01-01','test',?,'extracted')`).run(f.owner, 'current-' + f.owner, 'invalid-' + i);
    if (i === 6) f.sql.prepare(`INSERT INTO telegram_pet_run_rooms (room_id,pet_id,run_id,telegram_id,room_number,room_type,status)
      VALUES (?, ?, ?, ?, 1, 'loot', 'resolved')`).run('canonical-room', 'current-' + f.owner, 'invalid-' + i, f.owner);
  }
  f.run('valid-after-invalid', { status: 'extracted' });
  const results = await hooks.recoverPetStandardRunEndings(f.db, f.owner);
  assert.equal(results.length, 1); assert.equal(results[0].run.run_id, 'valid-after-invalid');
  assert.equal(results[0].accepted, true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_extract'").get().n, 1);
});

test('bounded recovery drains across refreshes and retries interruption without double payment', async () => {
  const f = fixture('81006');
  await f.state();
  for (let i = 0; i < 7; i++) f.run('backlog-' + i, { status: 'extracted' });
  f.db.failReward = true;
  let results = await hooks.recoverPetStandardRunEndings(f.db, f.owner);
  assert.equal(results.filter(r => r.accepted).length, 4, 'one interrupted reward must not stop other candidates');
  results = await hooks.recoverPetStandardRunEndings(f.db, f.owner);
  assert.equal(results.filter(r => r.accepted).length, 3);
  assert.deepEqual(await hooks.recoverPetStandardRunEndings(f.db, f.owner), []);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_extract'").get().n, 7);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, 63);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('current-' + f.owner).pet_xp, 368);
});

test('closed historical short runs retain their original completion and reward caps', async () => {
  const f = fixture('81007');
  await f.state();
  f.run('historical-short', { status: 'completed', depth: 5 });
  f.sql.prepare('UPDATE telegram_pet_runs SET max_depth=5,max_room=5 WHERE run_id=?').run('historical-short');
  f.sql.prepare(`INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,xp_awarded,season_key,day_key,week_key,status)
    VALUES ('cap',?,?,'feed','cap',1195,249,?,?,'week','accepted')`).run('current-' + f.owner, f.owner, currentSeason, now.toISOString().slice(0,10));
  const [result] = await hooks.recoverPetStandardRunEndings(f.db, f.owner);
  assert.equal(result.accepted, true); assert.equal(result.reason, 'run_completed');
  assert.equal(result.pet_xp_awarded, 5); assert.equal(result.xp_awarded, 1);
  assert.deepEqual(await hooks.recoverPetStandardRunEndings(f.db, f.owner), []);
  assert.equal(f.sql.prepare('SELECT SUM(pet_xp_awarded) n FROM telegram_pet_events').get().n, 1200);
  assert.equal(f.sql.prepare('SELECT SUM(xp_awarded) n FROM telegram_pet_events').get().n, 250);
});

test('a rejected final-room reward reports its real reason and remains recoverable', async () => {
  const f = fixture('81008');
  await f.state();
  f.run('final-rejection', { depth: 99 });
  f.db.rejectReward = true;
  const random = Math.random;
  Math.random = () => 0.999;
  let result;
  try { result = await hooks.processPetRunStep(f.db, f.owner, 'final-rejection', 'boss', { event_key: 'last-boss', expected_step_index: 100 }); }
  finally { Math.random = random; }
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'reward_not_authorized', 'do not replace a rejected reward with run_completed');
  assert.equal(f.sql.prepare("SELECT status FROM telegram_pet_runs WHERE run_id='final-rejection'").get().status, 'completed');
  const [recovered] = await hooks.recoverPetStandardRunEndings(f.db, f.owner);
  assert.equal(recovered.accepted, true); assert.equal(recovered.reason, 'run_completed');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_run_steps WHERE run_id='final-rejection'").get().n, 2);
});

for (const [index, action] of ['run_step', 'run_extract'].entries()) test(action + ' settles a saved final room with the same rewards as refresh', async () => {
  const f = fixture('8101' + index);
  await f.state();
  f.run('saved-ending-action', { depth: 100, status: 'extractable' });
  const result = await hooks.processPetMiniAppAction(f.db, f.owner, { id: f.owner }, {
    action, run_id: 'saved-ending-action', choice_key: 'boss', expected_step_index: 101, event_key: 'new-request',
  }, 'fixture-token');
  assert.equal(result.accepted, true); assert.equal(result.reason, 'run_completed');
  assert.equal(result.settlement_recovered, true);
  assert.equal(result.pet_xp_awarded, 24); assert.equal(result.xp_awarded, 80);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_run_steps WHERE run_id='saved-ending-action'").get().n, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_extract'").get().n, 0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_runtime_events WHERE action IN ('run_step','run_extract')").get().n, 0, 'recovering saved work cannot mint another action award');
  await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_complete'").get().n, 1);
});
