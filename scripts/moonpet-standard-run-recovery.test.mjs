import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getPetEquipmentUpgradeQuote, processPetEquipmentUpgrade } from '../workers/moonboys-api/pets/live-systems.js';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const now = new Date();
const currentSeason = hooks.getPetSeasonInfo(now).key;
const oldSeason = hooks.getPetSeasonInfo(new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 15))).key;
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
  for (const seasonMigration of ['058_telegram_pet_season_completion.sql', '061_moonpet_season_economy_calibration.sql']) {
    sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/' + seasonMigration, import.meta.url), 'utf8'));
  }
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { if (db.beforeFirst) await db.beforeFirst(this); return sql.prepare(this.query).get(...this.args) || null; }
    async all() { if (db.beforeAll) await db.beforeAll(this); return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      if (sql.prepare(this.query).columns().length && !/\bRETURNING\b/i.test(this.query)) return { results: sql.prepare(this.query).all(...this.args), meta: { changes: 0 } };
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { return this.exec(); }
  }
  const db = { failReward: false, rejectReward: false, invalidRewardReceipt: null, prepare(query) { return new Statement(query); }, async batch(statements) {
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
    let results;
    try { results = []; for (const s of statements) results.push(s.exec()); sql.exec('COMMIT'); }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
    if (this.invalidRewardReceipt && statements.at(-1)?.query.includes('RETURNING applied_rewards')) {
      const mode = this.invalidRewardReceipt;
      this.invalidRewardReceipt = null;
      if (mode === 'failed') results[results.length - 1] = { success: false, error: 'receipt_write_failed', results: [] };
      if (mode === 'missing') results[results.length - 1] = { ...results.at(-1), results: [] };
      if (mode === 'malformed') results[results.length - 1] = { ...results.at(-1), results: [{ applied_rewards: '{' }] };
    }
    if (this.afterBatch) await this.afterBatch(statements);
    return results;
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

test('the authenticated extraction API returns its exact paid receipt during an identity outage', async () => {
  const f=fixture('92031'); await f.state(); f.run('http-paid-ending');
  f.db.beforeBatch=statements=>{
    if(statements.some(s=>s.query.includes('INSERT OR IGNORE INTO telegram_pet_identity_events') && s.query.includes("'memory'"))) throw Error('identity_finish_unavailable');
  };
  const response=await worker.fetch(new Request('https://moonboys-api.test/telegram-pets/action',{
    method:'POST',headers:{'content-type':'application/json','x-pets-bot-secret':'pet-secret'},
    body:JSON.stringify({telegram_id:f.owner,action:'run_extract',run_id:'http-paid-ending',event_key:'http-extract'})
  }),{DB:f.db,TELEGRAM_PETS_BOT_SECRET:'pet-secret'});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.accepted,true); assert.equal(result.refresh_state,true);
  assert.equal(result.pet_xp_awarded,24); assert.equal(result.rewards.pet_xp,24); assert.equal(result.rewards.moon_gold,9);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?").get('current-'+f.owner).pet_xp,224);
  f.db.beforeBatch=null;
  await f.state();
  const retry=await dispatchRenderedPetAction(f.db,f.owner,{id:f.owner},{action:'run_extract',run_id:'http-paid-ending',request_id:'retry'},'fixture-token');
  assert.equal(retry.accepted,true); assert.equal(retry.duplicate,true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_extract'").get().n,1);
  assert.equal(f.sql.prepare("SELECT total_runs FROM telegram_pet_memories WHERE pet_id=?").get('current-'+f.owner).total_runs,1);
  assert.equal(f.sql.prepare("SELECT biggest_reward_amount FROM telegram_pet_memories WHERE pet_id=?").get('current-'+f.owner).biggest_reward_amount,9,
    'a duplicate repair records the original payout, even though it pays no new gold');
});

test('the authenticated extraction API preserves success when its final active-profile projection fails', async () => {
  const f=fixture('92032'); await f.state(); f.run('http-projection-ending');
  let interrupted=false;
  f.db.afterBatch=statements=>{
    if(!statements.some(s=>s.query.includes('INSERT OR IGNORE INTO telegram_pet_identity_events') && s.args.includes('http-projection-ending:terminal:memory'))) return;
    f.db.afterBatch=null;
    f.db.beforeFirst=s=>{
      if(!s.query.includes('FROM telegram_pet_active_slots a')) return;
      f.db.beforeFirst=null; interrupted=true; throw Error('paid_api_projection_unavailable');
    };
  };
  const response=await worker.fetch(new Request('https://moonboys-api.test/telegram-pets/action',{
    method:'POST',headers:{'content-type':'application/json','x-pets-bot-secret':'pet-secret'},
    body:JSON.stringify({telegram_id:f.owner,action:'run_extract',run_id:'http-projection-ending',event_key:'http-projection-extract'})
  }),{DB:f.db,TELEGRAM_PETS_BOT_SECRET:'pet-secret'});
  assert.equal(interrupted,true,'fail a real final projection after the terminal memory has committed');
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.accepted,true); assert.equal(result.refresh_state,true);
  assert.equal(result.pet_xp_awarded,24); assert.equal(result.rewards.moon_gold,9);
  const retry=await dispatchRenderedPetAction(f.db,f.owner,{id:f.owner},{action:'run_extract',run_id:'http-projection-ending',request_id:'retry'},'fixture-token');
  assert.equal(retry.accepted,true); assert.equal(retry.duplicate,true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_extract'").get().n,1);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?").get('current-'+f.owner).pet_xp,224);
});

for (const mode of ['failed', 'missing', 'malformed']) test(`Standard reward settlement rejects a ${mode} applied receipt`, async () => {
  const f = fixture(`invalid-receipt-${mode}`);
  await f.state(); f.run(`receipt-${mode}`);
  f.db.invalidRewardReceipt = mode;
  await assert.rejects(hooks.processPetRunExtract(f.db, f.owner, `receipt-${mode}`),
    mode === 'failed' ? /pet_state_write_unavailable/ : /pet_reward_receipt_unavailable/);
});

for(const win of [true,false]) test(`a ${win?'successful':'failed'} Standard step retains its saved cost through a projection outage`, async () => {
  const f=fixture('post-step-'+win); await f.state(); f.run('post-step',{depth:0});
  f.sql.exec('UPDATE telegram_pet_profiles SET moon_gold=1000');
  const choice=hooks.buildPetRunChoiceReplyMarkup({run_id:'post-step',depth:0,max_depth:100,unbanked_items:'{}'}).inline_keyboard[0][0].callback_data.split(':').at(-1);
  let interrupted=false;
  f.db.afterBatch=statements=>{
    if(!statements.some(s=>s.query.includes('INSERT OR IGNORE INTO telegram_pet_run_steps'))) return;
    f.db.afterBatch=null;
    f.db.beforeFirst=s=>{
      if(!s.query.includes('FROM telegram_pet_runs') || !s.query.includes('run_id = ?')) return;
      f.db.beforeFirst=null; interrupted=true; throw Error('post_step_projection_unavailable');
    };
  };
  const originalRandom=Math.random; Math.random=()=>win?0.99:0;
  let result;
  try { result=await hooks.processPetRunStep(f.db,f.owner,'post-step',choice,{event_key:'saved-cost'}); }
  finally { Math.random=originalRandom; }
  assert.equal(interrupted,true); assert.equal(result.accepted,true); assert.equal(result.refresh_state,true);
  const step=f.sql.prepare('SELECT * FROM telegram_pet_run_steps WHERE event_key=?').get('saved-cost');
  assert.equal(Boolean(step.success),win);
  const savedPet=f.sql.prepare('SELECT energy,pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('current-'+f.owner);
  assert.equal(savedPet.energy,100-JSON.parse(step.metadata).costs.energy);
  const retry=await hooks.processPetRunStep(f.db,f.owner,'post-step',choice,{event_key:'saved-cost'});
  assert.equal(retry.accepted,true); assert.equal(retry.duplicate,true);
  assert.deepEqual(f.sql.prepare('SELECT energy,pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('current-'+f.owner),savedPet);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_run_steps WHERE run_id=?').get('post-step').n,1);
});

test('a concurrent other-pet payout cannot overrun the account consolation cap or spend a rejected step', async () => {
  const f=fixture('run-account-cap'); await f.state(); f.run('cap-run',{depth:0});
  f.pet('cap-other',oldSeason,300);
  const choice=hooks.buildPetRunChoiceReplyMarkup({run_id:'cap-run',depth:0,max_depth:100,unbanked_items:'{}'}).inline_keyboard[0][0].callback_data.split(':').at(-1);
  f.db.beforeBatch=statements=>{
    if(!statements.some(s=>s.query.includes('INSERT OR IGNORE INTO telegram_pet_run_steps'))) return;
    f.db.beforeBatch=null;
    f.sql.prepare(`INSERT INTO telegram_pet_events
      (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status)
      VALUES ('concurrent-cap','cap-other',?,'test','concurrent-cap',1200,?,?,'test-week','accepted')`).run(f.owner,oldSeason,new Date().toISOString().slice(0,10));
  };
  const before=f.sql.prepare('SELECT energy,pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('current-'+f.owner);
  const originalRandom=Math.random; Math.random=()=>0;
  try {
    const changed=await hooks.processPetRunStep(f.db,f.owner,'cap-run',choice,{event_key:'capped-step'});
    assert.equal(changed.accepted,false); assert.equal(changed.reason,'run_state_changed');
    assert.deepEqual(f.sql.prepare('SELECT energy,pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('current-'+f.owner),before);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_run_steps WHERE run_id=?').get('cap-run').n,0);
    const retry=await hooks.processPetRunStep(f.db,f.owner,'cap-run',choice,{event_key:'capped-step'});
    assert.equal(retry.accepted,true); assert.equal(retry.reason,'run_failed'); assert.equal(retry.pet_xp_awarded,0);
    assert.equal(f.sql.prepare('SELECT SUM(pet_xp_awarded) n FROM telegram_pet_events WHERE telegram_id=? AND status=\'accepted\'').get(f.owner).n,1200);
    assert.equal(f.sql.prepare("SELECT pet_id FROM telegram_pet_events WHERE event_type='run_fail'").get().pet_id,'current-'+f.owner);
  } finally { Math.random=originalRandom; }
});

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

for (const kind of ['personality','memory']) test(`paid Standard ending repairs its missing ${kind} without another reward`, async () => {
  const f=fixture('paid-ending-'+kind), source='current-'+f.owner;
  await f.state(); f.run('paid-ending');
  f.db.beforeBatch=statements=>{
    if(statements.some(s=>s.query.includes('INSERT OR IGNORE INTO telegram_pet_identity_events') && s.query.includes("'"+kind+"'"))) throw Error('identity_finish_unavailable');
  };
  const result=await hooks.processPetRunExtract(f.db,f.owner,'paid-ending');
  assert.equal(result.accepted,true); assert.equal(result.refresh_state,true);
  assert.equal(result.pet_xp_awarded,24);
  const paid=f.sql.prepare("SELECT pet_xp_awarded FROM telegram_pet_events WHERE event_type='run_extract'").get();
  assert.equal(paid.pet_xp_awarded,24);
  f.db.beforeBatch=null;
  await f.state();
  const identities=()=>f.sql.prepare("SELECT event_kind,event_key FROM telegram_pet_identity_events WHERE event_key LIKE 'paid-ending:terminal:%' AND applied_at IS NOT NULL ORDER BY event_kind").all();
  assert.equal(identities().length,2,'payment must not hide an interrupted identity finish from recovery');
  assert.equal(f.sql.prepare('SELECT total_runs FROM telegram_pet_memories WHERE pet_id=?').get(source).total_runs,1);
  assert.equal(f.sql.prepare('SELECT biggest_reward_amount FROM telegram_pet_memories WHERE pet_id=?').get(source).biggest_reward_amount,9);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(source).pet_xp,224);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=daily')).entries[0].pet_xp,24);
  const before=identities(); await f.state();
  assert.deepEqual(identities(),before);
  assert.equal(f.sql.prepare('SELECT total_runs FROM telegram_pet_memories WHERE pet_id=?').get(source).total_runs,1);
});

test('a saved terminal payout recovered after a quarter boundary keeps its earning competition', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 1, 12) });
  const f = fixture('terminal-quarter');
  await f.state();
  f.run('quarter-ending');
  f.db.failReward = true;
  await assert.rejects(hooks.processPetRunExtract(f.db, f.owner, 'quarter-ending'), /interrupted_terminal_reward/);
  f.sql.prepare("UPDATE telegram_pet_runs SET completed_at='2026-09-30 23:59:00' WHERE run_id='quarter-ending'").run();
  const result = (await hooks.recoverPetStandardRunEndings(f.db, f.owner, 'quarter-ending'))[0];
  assert.equal(result.accepted, true);
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key=?')
    .get(f.owner, 'pet-s2026-003').season_xp, result.pet_xp_awarded);
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key=?')
    .get(f.owner, 'pet-s2026-004'), undefined);
  await hooks.recoverPetStandardRunEndings(f.db, f.owner, 'quarter-ending');
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_events WHERE event_type='run_extract'").get().n, 1);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('current-' + f.owner).pet_xp, 224);
});

test('a recovered Standard ending uses its saved day and week for the shared XP cap', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 28, 12) });
  const f = fixture('terminal-day-week');
  await f.state();
  f.run('week-ending');
  f.db.failReward = true;
  await assert.rejects(hooks.processPetRunExtract(f.db, f.owner, 'week-ending'), /interrupted_terminal_reward/);
  f.sql.prepare("UPDATE telegram_pet_runs SET completed_at='2026-09-27 23:59:00' WHERE run_id='week-ending'").run();
  f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status)
    VALUES ('prior-day-xp',? ,?,'test','prior-day-xp',1190,?,'2026-09-27','2026-W39','accepted')`)
    .run('current-' + f.owner, f.owner, currentSeason);
  const result = (await hooks.recoverPetStandardRunEndings(f.db, f.owner, 'week-ending'))[0];
  assert.equal(result.accepted, true);
  assert.equal(result.pet_xp_awarded, 10);
  const event = { ...f.sql.prepare("SELECT day_key,week_key,pet_xp_awarded FROM telegram_pet_events WHERE event_type='run_extract'").get() };
  assert.deepEqual(event, { day_key: '2026-09-27', week_key: '2026-W39', pet_xp_awarded: 10 });
  assert.equal(f.sql.prepare("SELECT SUM(pet_xp_awarded) total FROM telegram_pet_events WHERE telegram_id=? AND day_key='2026-09-27' AND status='accepted'").get(f.owner).total, 1200);
});

test('paid ending identity recovery retains the original day and archived pet', async t => {
  t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,8,27,12)});
  const f=fixture('historic-identity');
  await f.state(); f.pet('archived-source',oldSeason,100);
  f.run('historic-run',{petId:'archived-source',season:oldSeason});
  f.db.beforeBatch=statements=>{
    if(statements.some(s=>s.query.includes('INSERT OR IGNORE INTO telegram_pet_identity_events') && s.query.includes("'personality'"))) throw Error('identity_unavailable');
  };
  const result=await hooks.processPetRunExtract(f.db,f.owner,'historic-run');
  assert.equal(result.accepted,true); assert.equal(result.refresh_state,true);
  const source=f.sql.prepare("SELECT day_key,created_at FROM telegram_pet_events WHERE event_type='run_extract'").get();
  f.sql.prepare("UPDATE telegram_pet_instances SET status='archived' WHERE pet_id='archived-source'").run();
  f.sql.prepare("UPDATE telegram_pet_season_slots SET status='archived' WHERE pet_id='archived-source'").run();
  f.db.beforeBatch=null; t.mock.timers.tick(86400000);
  await f.state();
  const identity=f.sql.prepare("SELECT day_key,progress_delta FROM telegram_pet_identity_events WHERE pet_id='archived-source' AND event_kind='personality'").get();
  assert.ok(identity,'the source-backed repair can finish for an archived pet');
  assert.equal(identity.day_key,source.day_key);
  assert.equal(identity.progress_delta,2);
  const memories=f.sql.prepare("SELECT total_runs,first_extraction_at FROM telegram_pet_memories WHERE pet_id='archived-source'").get();
  assert.equal(memories.total_runs,1); assert.equal(memories.first_extraction_at,source.created_at);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='archived-source'").get().pet_xp,124);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('current-'+f.owner).pet_xp,200);
  await f.state();
  assert.equal(f.sql.prepare("SELECT total_runs FROM telegram_pet_memories WHERE pet_id='archived-source'").get().total_runs,1);
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
  assert.equal(event.season_key, oldSeason, 'failure receipt keeps the original run pet provenance');
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE season_key=?').get(currentSeason).season_xp, result.pet_xp_awarded);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_season_state WHERE season_key=?').get(oldSeason).n, 0);
  const item = f.sql.prepare("SELECT pet_id,season_key FROM telegram_pet_events WHERE event_type='run_item_use'").get();
  assert.equal(item.pet_id, 'old-run-pet'); assert.equal(item.season_key, oldSeason);
  const activity = await f.get('/telegram-pets/activity');
  for (const entry of activity.items.filter(e => ['run_fail','run_item_use'].includes(e.event_type))) assert.equal(entry.display_name, 'BOTTY');
  assert.equal((await f.get('/telegram-pets/leaderboard?period=seasonal')).entries[0].pet_xp, result.pet_xp_awarded);
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
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE season_key=?').get(currentSeason).season_xp, 24);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=seasonal')).entries[0].pet_xp, 24);
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
  const result = await dispatchRenderedPetAction(f.db, f.owner, { id: f.owner }, {
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

for(const [label,method,match] of [
  ['step replay','beforeFirst',q=>q.includes('SELECT * FROM telegram_pet_run_steps WHERE telegram_id = ? AND event_key = ?')],
  ['source pet','beforeFirst',q=>q==='SELECT * FROM telegram_pet_instances WHERE pet_id = ? LIMIT 1'],
  ['wallet','beforeFirst',q=>q==='SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id = ?'],
  ['inventory','beforeAll',q=>q.includes('FROM telegram_pet_inventory') && q.includes('quantity > 0')],
  ['daily XP cap','beforeFirst',q=>q.includes('SELECT COALESCE(SUM(pet_xp_awarded), 0) AS pet_xp') && q.includes('WHERE telegram_id = ?')],
]) test(`account audit: Standard Run ${label} outage cannot resolve against missing evidence`,async()=>{
  const f=fixture('run-read-'+label.replaceAll(' ','-')); await f.state(); f.run('read-run',{depth:0});
  f.sql.exec('UPDATE telegram_pet_profiles SET moon_gold=1000');
  const choice=hooks.buildPetRunChoiceReplyMarkup({run_id:'read-run',depth:0,max_depth:100,unbanked_items:'{}'}).inline_keyboard[0][0].callback_data.split(':').at(-1);
  if(label==='daily XP cap') f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status)
    VALUES ('cap',?,?,'feed','cap',1200,?,?,'test-week','accepted')`)
    .run('current-'+f.owner,f.owner,currentSeason,now.toISOString().slice(0,10));
  if(label==='inventory') f.sql.prepare("INSERT INTO telegram_pet_inventory (telegram_id,asset_type,asset_key,quantity) VALUES (?,'item','lucky_charm',1)").run(f.owner);
  const before=f.sql.prepare('SELECT * FROM telegram_pet_runs').get();
  let triggered=false;
  f.db[method]=s=>{if(match(s.query)){triggered=true;throw Error('run_required_read_unavailable');}};
  const originalRandom=Math.random; Math.random=()=>0;
  try { await assert.rejects(hooks.processPetRunStep(f.db,f.owner,'read-run',choice,{event_key:'read-step'}),/run_required_read_unavailable/); }
  finally { Math.random=originalRandom; }
  assert.equal(triggered,true); assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_runs').get(),before);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_run_steps').get().n,0);
  f.db[method]=null; Math.random=()=>0;
  try { assert.equal((await hooks.processPetRunStep(f.db,f.owner,'read-run',choice,{event_key:'read-step'})).reason,'run_failed'); }
  finally { Math.random=originalRandom; }
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_run_steps').get().n,1);
  if(label==='daily XP cap') assert.equal(f.sql.prepare("SELECT pet_xp_awarded FROM telegram_pet_events WHERE event_type='run_fail'").get().pet_xp_awarded,0);
  if(label==='inventory') assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE asset_key='lucky_charm'").get().quantity,0);
});

for(const win of [true,false]) test(`account audit: ${win?'successful':'failed'} Standard step cannot erase a concurrent care reward`,async()=>{
  const f=fixture('run-race-'+win); await f.state(); f.run('race-run',{depth:0});
  f.sql.exec('UPDATE telegram_pet_profiles SET moon_gold=1000');
  const choice=hooks.buildPetRunChoiceReplyMarkup({run_id:'race-run',depth:0,max_depth:100,unbanked_items:'{}'}).inline_keyboard[0][0].callback_data.split(':').at(-1);
  let saved,care,triggered=false;
  f.db.beforeBatch=async statements=>{
    for(const s of statements) assert.ok(s.args.length<=100,'D1 binding limit');
    if(!statements.some(s=>s.query.includes('INSERT OR IGNORE INTO telegram_pet_run_steps')))return;
    f.db.beforeBatch=null; triggered=true;
    care=await hooks.processPetAction(f.db,f.owner,'feed',{event_key:'concurrent-feed'});
    assert.equal(care.accepted,true);
    saved=f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get('current-'+f.owner);
  };
  const originalRandom=Math.random; Math.random=()=>win?0.99:0;
  let result;
  try { result=await hooks.processPetRunStep(f.db,f.owner,'race-run',choice,{event_key:'race-step'}); }
  finally { Math.random=originalRandom; }
  assert.equal(triggered,true); assert.equal(result.accepted,false,'stale step must not commit a snapshot from before the care reward');
  assert.equal(result.reason,'run_state_changed');
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get('current-'+f.owner),saved);
  assert.equal(f.sql.prepare('SELECT depth FROM telegram_pet_runs').get().depth,0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_run_steps').get().n,0);
  Math.random=()=>win?0.99:0;
  try { result=await hooks.processPetRunStep(f.db,f.owner,'race-run',choice,{event_key:'race-step'}); }
  finally { Math.random=originalRandom; }
  assert.equal(result.accepted,true);
  const earned=care.pet_xp_awarded+result.pet_xp_awarded;
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp,200+earned);
  for(const period of ['daily','weekly','seasonal']) assert.equal((await f.get('/telegram-pets/leaderboard?period='+period)).entries[0].pet_xp,earned,period);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,200+earned);
});

for(const change of ['upgrade','mastery','new row']) test(`account audit: concurrent equipped ${change} requires a fresh Standard outcome`,async()=>{
  const f=fixture('gear-race-'+change.replaceAll(' ','-'));
  f.sql.exec("UPDATE telegram_pet_instances SET pet_xp=100000,equipped_toy='hoverboard'; UPDATE telegram_pet_profiles SET pet_xp=100000,equipped_toy='hoverboard',moon_gold=10000");
  await f.state(); f.run('gear-race',{depth:0});
  for(const material of ['moon_dust','scrap_metal','crystal_shard','mastery_token','battery_cell']) f.sql.prepare('INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,?,100)').run(f.owner,material);
  if(change==='new row') f.sql.exec('DELETE FROM telegram_pet_equipment_progression');
  const choice=hooks.buildPetRunChoiceReplyMarkup({run_id:'gear-race',depth:0,max_depth:100,unbanked_items:'{}'}).inline_keyboard[0][0].callback_data.split(':').at(-1);
  let upgraded,triggered=false;
  const petBefore=f.sql.prepare('SELECT * FROM telegram_pet_instances').get();
  f.db.beforeBatch=async statements=>{
    for(const s of statements) assert.ok(s.args.length<=100,'D1 binding limit with equipped progression');
    if(!statements.some(s=>s.query.includes('INSERT OR IGNORE INTO telegram_pet_run_steps')))return;
    f.db.beforeBatch=null; triggered=true;
    if(change==='upgrade') {
      const result=await processPetEquipmentUpgrade(f.db, f.owner, 'hoverboard', 'upgrade-during-run', getPetEquipmentUpgradeQuote('hoverboard', 2));
      assert.equal(result.accepted,true,JSON.stringify(result));
    }else if(change==='mastery') f.sql.exec("UPDATE telegram_pet_equipment_progression SET mastery_xp=75,mastery_tier=1 WHERE item_key='hoverboard'");
    else f.sql.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot,item_level) VALUES (?,'hoverboard','toy',2)").run(f.owner);
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_instances').get(),petBefore,'the race changes progression without changing the pet row');
    upgraded=f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold;
  };
  const originalRandom=Math.random; Math.random=()=>0.99;
  try {
    const rejected=await hooks.processPetRunStep(f.db,f.owner,'gear-race',choice,{event_key:'gear-race-step'});
    assert.equal(triggered,true); assert.equal(rejected.accepted,false,'old equipment bonuses must not commit');
    assert.equal(rejected.reason,'run_state_changed');
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_run_steps').get().n,0);
    assert.equal(f.sql.prepare('SELECT depth FROM telegram_pet_runs').get().depth,0);
    assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,upgraded,'the rejected step cannot spend more wallet funds');
    const retry=await hooks.processPetRunStep(f.db,f.owner,'gear-race',choice,{event_key:'gear-race-step'});
    assert.equal(retry.accepted,true);
    const saved=JSON.parse(f.sql.prepare('SELECT metadata FROM telegram_pet_run_steps').get().metadata).equipment_snapshot.hoverboard;
    assert.equal(change==='mastery'?saved.mastery_xp:saved.item_level,change==='mastery'?75:2);
  }finally { Math.random=originalRandom; }
});

test('account audit: unrelated inventory and another owner equipment do not block a Standard step',async()=>{
  const f=fixture('gear-scope'); await f.state(); f.run('gear-scope-run',{depth:0});
  f.sql.exec("UPDATE telegram_pet_instances SET equipped_toy='hoverboard'; UPDATE telegram_pet_profiles SET equipped_toy='hoverboard',moon_gold=1000");
  f.sql.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,'hoverboard','toy'),(?,'moon_kibble','food')").run(f.owner,f.owner);
  f.sql.exec("INSERT INTO telegram_users (telegram_id) VALUES ('gear-other-owner'); INSERT INTO telegram_pet_profiles (telegram_id) VALUES ('gear-other-owner'); INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES ('gear-other-owner','hoverboard','toy')");
  const choice=hooks.buildPetRunChoiceReplyMarkup({run_id:'gear-scope-run',depth:0,max_depth:100,unbanked_items:'{}'}).inline_keyboard[0][0].callback_data.split(':').at(-1);
  let triggered=false;
  f.db.beforeBatch=statements=>{
    if(!statements.some(s=>s.query.includes('INSERT OR IGNORE INTO telegram_pet_run_steps')))return;
    triggered=true;f.db.beforeBatch=null;
    f.sql.exec("UPDATE telegram_pet_equipment_progression SET item_level=2 WHERE item_key='moon_kibble' OR telegram_id='gear-other-owner'");
  };
  const originalRandom=Math.random;Math.random=()=>0.99;
  try { assert.equal((await hooks.processPetRunStep(f.db,f.owner,'gear-scope-run',choice,{event_key:'gear-scope-step'})).accepted,true); }
  finally { Math.random=originalRandom; }
  assert.equal(triggered,true);
  const saved=JSON.parse(f.sql.prepare('SELECT metadata FROM telegram_pet_run_steps').get().metadata).equipment_snapshot;
  assert.deepEqual(Object.keys(saved),['hoverboard']);assert.equal(saved.hoverboard.item_level,1);
});
