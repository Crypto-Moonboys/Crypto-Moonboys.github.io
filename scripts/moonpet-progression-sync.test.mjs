import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { applyPetRuntimeAward, getOrCreatePetRuntimeState } from '../workers/moonboys-api/pets/runtime-phase-5a.js';
import deployedWorker from '../workers/moonboys-api/deployment-entry.js';
import worker, { applyPetRuntimeCommandAward, __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

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
    async first() { if (db.beforeFirst) await db.beforeFirst(this); return sql.prepare(this.query).get(...this.args) || null; }
    async all() { if (db.beforeAll) await db.beforeAll(this); return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) await db.beforeRun(this); return this.exec(); }
  }
  const db = { beforeBatch: null, beforeRun: null, prepare(query) { return new Statement(query); }, async batch(statements) {
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
  const active = (id, season = currentSeason) => {
    sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=?,season_key=? WHERE telegram_id=?').run(id, season, owner);
    const p = sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(id);
    sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=?,equipped_food=?,level=? WHERE telegram_id=?').run(p.pet_xp, p.equipped_food, p.level, owner);
  };
  const act = body => hooks.processPetMiniAppAction(db,owner,{id:owner},body,'fixture-token');
  const reveal = id => sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,'elite_moonpet',3,'reveal')").run(id,owner);
  const state = () => hooks.buildPetMiniAppState(db, owner, 'fixture-token');
  const get = async path => { const response = await worker.fetch(new Request('https://moonboys-api.test' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, pet, active, act, reveal, state, get };
}

function authority(f) { return { pet_id: 'current-'+f.owner, season_key: currentSeason }; }
function runtime(f,key,day,action='feed',options={}) { return applyPetRuntimeAward(f.db,f.owner,key,action,{...authority(f),day_key:day,...options}); }
function progress(f) { return f.sql.prepare('SELECT * FROM telegram_pet_specialist_progression WHERE pet_id=?').get('current-'+f.owner); }
async function api(f,body,secret='pet-secret') {
  const response=await deployedWorker.fetch(new Request('https://moonboys-api.test/telegram-pets/action',{
    method:'POST', headers:{'content-type':'application/json','x-pets-bot-secret':secret},
    body:JSON.stringify({telegram_id:f.owner,...body})
  }),{DB:f.db,TELEGRAM_PETS_BOT_SECRET:'pet-secret'});
  return { status:response.status, ...await response.json() };
}

test('a job retry after switching pets cannot credit the new pet',async()=>{
  const f=fixture('84001'); f.pet('second-job',currentSeason,300,2);
  const body={action:'work',job_key:'street_artist',request_id:'job-retry'};
  assert.equal((await f.act(body)).accepted,true);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'second-job')).accepted,true);
  assert.equal((await f.act(body)).duplicate,true);
  assert.equal(f.sql.prepare('SELECT SUM(job_xp) xp FROM telegram_pet_specialist_progression').get().xp,14);
  assert.equal(progress(f).job_xp,14);
});

test('old-day recovery preserves current daily allowance and both historical caps',async()=>{
  const f=fixture('84002');
  await runtime(f,'old-1','2026-09-26','feed',{track_multiplier:40});
  await runtime(f,'new-1','2026-09-27','feed',{track_multiplier:40});
  const before=progress(f);
  const recovered=await runtime(f,'old-2','2026-09-26');
  assert.deepEqual(recovered.tracks,{});
  assert.equal(progress(f).daily_key,'2026-09-27');
  assert.equal(progress(f).care_daily,300);
  assert.equal((await runtime(f,'new-2','2026-09-27')).tracks.care,undefined);
  assert.equal(progress(f).care_xp,before.care_xp);
});

test('a stale state read cannot reset a newer daily counter',async()=>{
  const f=fixture('84003');
  await runtime(f,'old','2026-09-26');
  f.db.beforeRun=async statement=>{
    if(!statement.query.includes('UPDATE telegram_pet_specialist_progression')) return;
    f.db.beforeRun=null;
    await runtime(f,'new','2026-09-27');
  };
  const state=await getOrCreatePetRuntimeState(f.db,f.owner,'2026-09-27',authority(f));
  assert.equal(state.care_daily,8);
  const historical=await getOrCreatePetRuntimeState(f.db,f.owner,'2026-09-26',authority(f));
  assert.equal(historical.daily_key,'2026-09-27');
  assert.equal(historical.care_daily,8);
});

test('the deployed API credits only pet-scoped progression and repairs it on retry',async()=>{
  const f=fixture('84004');
  const body={action:'work',job_key:'street_artist',event_key:'api-job'};
  const first=await api(f,body);
  assert.equal(first.accepted,true,JSON.stringify(first));
  assert.equal(progress(f).job_xp,14);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_runtime_events').get().n,0);
  // Simulate a primary reward committed before the specialist transaction.
  f.sql.exec('DELETE FROM telegram_pet_specialist_events; DELETE FROM telegram_pet_specialist_progression;');
  f.pet('second-api',currentSeason,300,2);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'second-api')).accepted,true);
  const retry=await api(f,body);
  assert.equal(retry.duplicate,true);
  assert.equal(progress(f).job_xp,14);
  assert.equal(f.sql.prepare('SELECT SUM(job_xp) xp FROM telegram_pet_specialist_progression').get().xp,14);
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(progress(f).job_xp,14);
});

test('timed activity retains a recoverable claim until specialist progression commits',async()=>{
  const f=fixture('84005');
  assert.equal((await f.act({action:'activity_start',activity_type:'train'})).accepted,true);
  f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-30 minutes')").run();
  f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  const first=await f.act({action:'activity_claim'});
  assert.equal(first.reason,'activity_reward_recovery_pending');
  const xpBefore=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp;
  f.sql.exec('DROP TRIGGER fail_specialist');
  const retry=await f.act({action:'activity_claim'});
  assert.equal(retry.accepted,true,JSON.stringify(retry));
  assert.equal(progress(f).training_xp,18);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp,xpBefore);
  assert.equal((await f.act({action:'activity_claim'})).reason,'no_active_activity');
});


test('overlapping specialist claims clamp both tracks and duplicate keys exactly once',async()=>{
  const f=fixture('84006');
  const day='2026-09-27';
  await getOrCreatePetRuntimeState(f.db,f.owner,day,authority(f));
  f.sql.prepare('UPDATE telegram_pet_specialist_progression SET care_xp=298,care_daily=298,bond_xp=178,bond_daily=178').run();
  const results=await Promise.all(['one','two','one'].map(key=>runtime(f,key,day)));
  assert.equal(results.filter(r=>r.duplicate).length,1);
  assert.equal(results.reduce((n,r)=>n+(r.tracks.care||0),0),2);
  assert.equal(results.reduce((n,r)=>n+(r.tracks.bond||0),0),2);
  assert.equal(progress(f).care_xp,300); assert.equal(progress(f).bond_xp,180);
  const receipts=f.sql.prepare('SELECT payload_json FROM telegram_pet_specialist_events').all().map(r=>JSON.parse(r.payload_json));
  assert.equal(receipts.reduce((n,r)=>n+r.awarded_tracks.care,0),2);
  assert.ok(receipts.every(r=>r.day_key===day));
  await runtime(f,'tomorrow','2026-09-28');
  assert.deepEqual((await runtime(f,'late',day)).tracks,{},'historical allowance retains a preexisting daily counter captured in the receipt');
});

test('historical legacy receipts constrain recovery without rewriting earning history',async()=>{
  const f=fixture('84007');
  await getOrCreatePetRuntimeState(f.db,f.owner,'2026-09-27',authority(f));
  f.sql.prepare("INSERT INTO telegram_pet_specialist_events (id,pet_id,telegram_id,season_key,event_key,action,payload_json,created_at) VALUES ('legacy',?,?,?,'legacy','feed',?,'2026-09-26 12:00:00')")
    .run(authority(f).pet_id,f.owner,currentSeason,JSON.stringify({tracks:{care:300,bond:180}}));
  const recovered=await runtime(f,'recover','2026-09-26');
  assert.deepEqual(recovered.tracks,{});
  assert.equal(progress(f).daily_key,'2026-09-27');
  assert.equal(f.sql.prepare("SELECT payload_json FROM telegram_pet_specialist_events WHERE id='legacy'").get().payload_json,JSON.stringify({tracks:{care:300,bond:180}}));
});

test('specialist batch failure rolls back its receipt, tracks, traits and materials',async()=>{
  const f=fixture('84008');
  f.sql.exec("CREATE TRIGGER reject_material BEFORE INSERT ON telegram_pet_material_balances BEGIN SELECT RAISE(ABORT,'material_failure'); END");
  await assert.rejects(runtime(f,'retry','2026-09-27','job',{drop_roll:0}),/material_failure/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,0);
  f.sql.exec('DROP TRIGGER reject_material');
  const first=await runtime(f,'retry','2026-09-27','job',{drop_roll:0});
  const duplicate=await runtime(f,'retry','2026-09-27','job',{drop_roll:0});
  assert.equal(first.ok,true); assert.equal(duplicate.duplicate,true);
  assert.equal(progress(f).job_xp,14);
  assert.equal(first.material.quantity_awarded,1);
  assert.deepEqual(JSON.parse(progress(f).traits_json),first.traits);
});

test('deployed retry uses the accepted event day and ignores client-supplied material rolls',async()=>{
  const f=fixture('84009');
  const body={action:'work',job_key:'street_artist',event_key:'  spaced-key  ',drop_roll:0,material_amount:25};
  assert.equal((await api(f,body)).accepted,true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_material_balances').get().n,0);
  f.sql.exec('DELETE FROM telegram_pet_specialist_events; DELETE FROM telegram_pet_specialist_progression;');
  f.sql.prepare("UPDATE telegram_pet_events SET day_key='2026-09-26' WHERE event_key=?").run(body.event_key);
  await runtime(f,'today','2026-09-27','job');
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(progress(f).daily_key,'2026-09-27');
  assert.equal(progress(f).job_daily,14);
  assert.equal(progress(f).job_xp,28);
  const receipt=f.sql.prepare("SELECT payload_json FROM telegram_pet_specialist_events WHERE event_key LIKE 'runtime:api:%'").get();
  assert.equal(JSON.parse(receipt.payload_json).day_key,'2026-09-26');
});

test('deployed repair cannot change reward type or infer a pet for legacy source events',async()=>{
  const f=fixture('84010');
  const body={action:'work',job_key:'street_artist',event_key:'accepted-job'};
  await api(f,body);
  f.sql.exec('DELETE FROM telegram_pet_specialist_events; DELETE FROM telegram_pet_specialist_progression;');
  assert.equal((await api(f,{action:'feed',event_key:body.event_key})).duplicate,true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,0);
  f.sql.prepare('UPDATE telegram_pet_events SET pet_id=NULL WHERE event_key=?').run(body.event_key);
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,0);
  assert.equal((await api(f,{...body,event_key:'missing'},'wrong-secret')).status,401);
  assert.equal((await api(f,{...body,event_key:'x'.repeat(121)})).status,400);
});

test('deployed Standard Run step retry repairs the original run pet only',async()=>{
  const f=fixture('84011'); f.pet('second-run',currentSeason,300,2);
  f.sql.prepare("INSERT INTO telegram_pet_runs (id,run_id,telegram_id,pet_id,season_key,status,depth,current_room) VALUES ('run','run',?,?,?,'active',1,1)")
    .run(f.owner,authority(f).pet_id,currentSeason);
  f.sql.prepare("INSERT INTO telegram_pet_run_steps (id,run_id,telegram_id,pet_id,step_index,choice_key,choice_type,event_key,success,created_at,metadata) VALUES ('step','run',?,?,1,'fight','fight','saved-step',1,'2026-09-26 12:00:00','{\"source\":\"telegram_pets_api\"}')")
    .run(f.owner,authority(f).pet_id);
  f.active('second-run');
  const body={action:'run_step',run_id:'run',choice_key:'fight',event_key:'saved-step',expected_step_index:1};
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(progress(f).adventure_xp,10);
  assert.equal(progress(f).daily_key,'2026-09-26');
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp,10);
});

test('timed recovery across midnight uses its saved claim date',async()=>{
  const f=fixture('84012');
  assert.equal((await f.act({action:'activity_start',activity_type:'work'})).accepted,true);
  const claimTime=new Date(now.getTime()-86400000);
  const sourceDay=claimTime.toISOString().slice(0,10), currentDay=now.toISOString().slice(0,10);
  f.sql.prepare('UPDATE telegram_pet_activity_sessions SET started_at=?,ends_at=?').run(new Date(claimTime.getTime()-1800000).toISOString(),new Date(claimTime.getTime()+3600000).toISOString());
  f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  assert.equal((await hooks.claimPetActivitySession(f.db,f.owner,{now:claimTime})).reason,'activity_reward_recovery_pending');
  f.sql.exec('DROP TRIGGER fail_specialist');
  await runtime(f,'today',currentDay,'job');
  assert.equal((await f.act({action:'activity_claim'})).accepted,true);
  assert.equal(progress(f).job_daily,14);
  assert.equal(progress(f).job_xp,34);
  const receipt=f.sql.prepare("SELECT payload_json FROM telegram_pet_specialist_events WHERE action='timed_work'").get();
  assert.equal(JSON.parse(receipt.payload_json).day_key,sourceDay);
});


test('Daily Cache specialist recovery retains its original day and pet',async()=>{
  const f=fixture('84013'); f.pet('cache-second',currentSeason,300,2);
  const body={action:'daily_chest',request_id:'cache-retry'};
  assert.equal((await f.act(body)).accepted,true);
  f.sql.exec('DELETE FROM telegram_pet_specialist_events; DELETE FROM telegram_pet_specialist_progression;');
  f.sql.prepare("UPDATE telegram_pet_events SET day_key='2026-09-26' WHERE event_type='daily_chest'").run();
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'cache-second')).accepted,true);
  assert.equal((await f.act(body)).duplicate,true);
  assert.equal(progress(f).bond_xp,8);
  assert.equal(progress(f).daily_key,'2026-09-26');
  assert.equal(f.sql.prepare('SELECT SUM(bond_xp) xp FROM telegram_pet_specialist_progression').get().xp,8);
});

test('job replay leaves quest evidence, public activity and both XP leaderboards in sync',async()=>{
  const f=fixture('84014'); f.reveal(authority(f).pet_id);
  const body={action:'work',job_key:'street_artist',request_id:'public-job'};
  const first=await f.act(body);
  assert.equal(first.accepted,true);
  const before=await f.get('/telegram-pets/activity');
  assert.equal(before.items.find(e=>e.event_type==='work').display_name,'BOTTY');
  const publicBoard=await f.get('/telegram-pets/leaderboard?period=seasonal');
  assert.equal(publicBoard.entries[0].pet_xp,first.pet_xp_awarded);
  assert.deepEqual((await f.state()).leaderboard,publicBoard.entries.map(({player_display_name,username,last_active_label,...entry})=>entry));
  const quests=f.sql.prepare('SELECT * FROM telegram_pet_weekly_journey_objectives ORDER BY rowid').all();
  assert.equal((await f.act(body)).duplicate,true);
  const stableActivity=items=>items.map(({time_ago,...item})=>item);
  assert.deepEqual(stableActivity((await f.get('/telegram-pets/activity')).items),stableActivity(before.items));
  for(const period of ['daily','weekly','seasonal']) assert.equal((await f.get('/telegram-pets/leaderboard?period='+period)).entries[0].pet_xp,first.pet_xp_awarded);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,200+first.pet_xp_awarded);
  assert.equal((await f.get('/telegram/leaderboard')).entries[0].xp,first.xp_awarded);
  assert.equal(f.sql.prepare('SELECT COALESCE(SUM(xp_change),0) xp FROM telegram_xp_log').get().xp,first.xp_awarded);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_weekly_journey_objectives ORDER BY rowid').all(),quests);
});


test('special care actions award the same specialist tracks through the deployed API',async()=>{
  for(const [index,action,care,bond] of [[1,'energy_drink',1,1],[2,'dance',2,3],[3,'cuddles',2,6]]) {
    const f=fixture('8410'+index);
    const result=await api(f,{action,event_key:'special-'+action});
    assert.equal(result.accepted,true,JSON.stringify(result));
    assert.equal(progress(f)?.care_xp,care);
    assert.equal(progress(f)?.bond_xp,bond);
    assert.equal((await api(f,{action,event_key:'special-'+action})).duplicate,true);
    assert.equal(progress(f).bond_xp,bond);
  }
});

function standardRun(f,id,depth=2) {
  f.sql.prepare(`INSERT INTO telegram_pet_runs (id,run_id,telegram_id,pet_id,season_key,status,depth,current_room,max_depth,max_room,unbanked_pet_xp,unbanked_moon_gold)
    VALUES (?,?,?,?,?,'extractable',?,?,100,100,24,9)`).run(id,id,f.owner,authority(f).pet_id,currentSeason,depth,depth);
  f.sql.prepare(`INSERT INTO telegram_pet_run_steps (id,run_id,telegram_id,pet_id,step_index,choice_key,choice_type,event_key,success,metadata)
    VALUES (?,?,?,?,?,'fight','fight',?,1,'{"source":"telegram_pets_api"}')`).run(id+'-prior',id,f.owner,authority(f).pet_id,depth,id+'-prior');
}

for (const persistent of [false,true]) test(`Standard extraction repairs its canonical receipt after ${persistent?'persistent':'one'} specialist failure`,async()=>{
  const f=fixture(persistent?'84202':'84201'); standardRun(f,'extract-repair');
  let failed=false;
  f.db.beforeBatch=async statements=>{
    if(statements.some(s=>s.query.includes('INSERT INTO telegram_pet_specialist_events')) && (persistent||!failed)) {
      failed=true; throw Error('interrupted_extraction_specialist');
    }
  };
  const body={action:'run_extract',run_id:'extract-repair',event_key:'client-extract-key'};
  const first=await api(f,body);
  assert.equal(first.accepted,true,JSON.stringify(first));
  assert.ok(failed);
  assert.equal(f.sql.prepare("SELECT event_key FROM telegram_pet_events WHERE event_type='run_extract'").get().event_key,hooks.buildPetRunExtractEventKey(f.owner,body.run_id));
  const paid=f.sql.prepare('SELECT pet_xp,moon_gold FROM telegram_pet_instances').get();
  if(persistent) {
    assert.equal(progress(f)?.adventure_xp||0,0);
    f.db.beforeBatch=null;
    f.pet('extract-second',currentSeason,300,2); f.active('extract-second');
    assert.equal((await api(f,body)).accepted,true);
  }
  assert.equal(progress(f)?.adventure_xp,24);
  assert.equal((await api(f,{...body,event_key:'replacement-client-key'})).accepted,true);
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp,24);
  assert.deepEqual(f.sql.prepare('SELECT pet_xp,moon_gold FROM telegram_pet_instances WHERE pet_id=?').get(authority(f).pet_id),paid);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_extract'").get().n,1);
});

for(const changedKey of [false,true]) test(`final Standard Run step repairs on first successful settlement with ${changedKey?'a new':'the original'} request key`,async()=>{
  const f=fixture(changedKey?'84204':'84203'); standardRun(f,'final-repair',99);
  f.sql.exec("CREATE TRIGGER fail_ending BEFORE INSERT ON telegram_pet_reward_claims WHEN NEW.source='pet_run_legacy' BEGIN SELECT RAISE(ABORT,'interrupted_final_reward'); END");
  const body={action:'run_step',run_id:'final-repair',choice_key:'boss',expected_step_index:100,event_key:'saved-final-step'};
  const random=Math.random; Math.random=()=>0.999;
  try { await assert.rejects(api(f,body),/interrupted_final_reward/); }
  finally { Math.random=random; }
  assert.equal(f.sql.prepare("SELECT depth FROM telegram_pet_runs WHERE run_id='final-repair'").get().depth,100);
  assert.equal(progress(f)?.adventure_xp||0,0);
  f.sql.exec('DROP TRIGGER fail_ending');
  // Recovery may happen on another day and with another pet selected.
  f.sql.prepare("UPDATE telegram_pet_run_steps SET created_at='2026-09-26 12:00:00' WHERE event_key='saved-final-step'").run();
  f.pet('final-second',currentSeason,300,2); f.active('final-second');
  const retry=await api(f,{...body,event_key:changedKey?'new-finish-request':body.event_key});
  assert.equal(retry.accepted,true,JSON.stringify(retry));
  assert.equal(retry.settlement_recovered,true);
  assert.equal(progress(f)?.adventure_xp,10);
  assert.equal(progress(f).daily_key,'2026-09-26');
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp,10);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_complete'").get().n,1);
});

test('Mini App and API extraction retries share one saved reward identity',async()=>{
  const f=fixture('84205'); standardRun(f,'shared-extract');
  assert.equal((await f.act({action:'run_extract',run_id:'shared-extract',request_id:'mini-extract'})).accepted,true);
  assert.equal(progress(f).adventure_xp,24);
  assert.equal((await api(f,{action:'run_extract',run_id:'shared-extract',event_key:'api-retry'})).accepted,true);
  assert.equal(progress(f).adventure_xp,24);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE action='run_extract'").get().n,1);
});

test('historical extraction without a saved runtime identity cannot mint a new award under a different request key',async()=>{
  const f=fixture('84206'); standardRun(f,'legacy-extract');
  await api(f,{action:'run_extract',run_id:'legacy-extract',event_key:'old-client-key'});
  f.sql.prepare("UPDATE telegram_pet_events SET metadata=json_remove(metadata,'$.context.runtime_event_key') WHERE event_type='run_extract'").run();
  f.sql.prepare("UPDATE telegram_pet_specialist_events SET event_key='runtime:api:old-client-key' WHERE action='run_extract'").run();
  assert.equal((await api(f,{action:'run_extract',run_id:'legacy-extract',event_key:'new-client-key'})).accepted,true);
  assert.equal(progress(f).adventure_xp,24);
  await deployedWorker.fetch(new Request('https://moonboys-api.test/telegram/webhook',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query:{id:'legacy-retry',from:{id:f.owner},data:'pet:run:legacy-extract:extract'}})}),{DB:f.db});
  assert.equal(progress(f).adventure_xp,24,'a callback cannot reinterpret an old API award as new progress');
});

test('saved final-step repair does not repay an already credited step or award extraction progress',async()=>{
  const f=fixture('84207'); standardRun(f,'credited-final',100);
  f.sql.prepare("UPDATE telegram_pet_runs SET status='completed' WHERE run_id='credited-final'").run();
  const key='credited-final-prior',day=now.toISOString().slice(0,10);
  await runtime(f,'runtime:api:'+key,day,'run_step');
  const before=progress(f);
  const result=await api(f,{action:'run_step',run_id:'credited-final',choice_key:'boss',event_key:'new-client-key'});
  assert.equal(result.accepted,true); assert.equal(result.settlement_recovered,true);
  assert.equal(progress(f).adventure_xp,10);
  assert.equal(progress(f).traits_json,before.traits_json);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE action='run_extract'").get().n,0);
});


test('an uncredited historical API extraction repairs when no ambiguous legacy award exists',async()=>{
  const f=fixture('84208'); standardRun(f,'unpaid-legacy');
  f.sql.exec("CREATE TRIGGER fail_extract_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  const body={action:'run_extract',run_id:'unpaid-legacy',event_key:'legacy-client-key'};
  assert.equal((await api(f,body)).accepted,true);
  f.sql.exec('DROP TRIGGER fail_extract_specialist');
  f.sql.prepare("UPDATE telegram_pet_events SET metadata=json_remove(metadata,'$.context.runtime_event_key') WHERE event_type='run_extract'").run();
  assert.equal((await api(f,body)).accepted,true);
  assert.equal(progress(f).adventure_xp,24);
  assert.equal((await api(f,{...body,event_key:'another-retry'})).accepted,true);
  assert.equal(progress(f).adventure_xp,24);
});

for (const finish of [false, true]) test(`Mini App repairs ${finish ? 'final step' : 'extraction'} progression on refresh after a failed specialist write`, async () => {
  const f = fixture(finish ? '84302' : '84301'); standardRun(f, 'mini-repair', finish ? 99 : 2);
  // The already-played room has its normal existing award.
  await runtime(f, 'runtime:api:mini-repair-prior', now.toISOString().slice(0,10), 'run_step');
  f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  const body = finish ? {action:'run_step',run_id:'mini-repair',choice_key:'boss',expected_step_index:100,request_id:'finish'}
    : {action:'run_extract',run_id:'mini-repair',request_id:'extract'};
  const random = Math.random; Math.random = () => 0.999;
  try { assert.equal((await f.act(body)).accepted, true); } finally { Math.random = random; }
  assert.equal(progress(f).adventure_xp, 10);
  const paid = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(authority(f).pet_id);
  f.sql.exec('DROP TRIGGER fail_specialist');
  f.pet('mini-second', currentSeason, 300, 2); f.active('mini-second');
  await f.state();
  assert.equal(progress(f).adventure_xp, finish ? 20 : 34);
  await f.state(); await f.act({...body,request_id:'changed-request'});
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp, finish ? 20 : 34);
  assert.deepEqual(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(authority(f).pet_id), paid);
});

test('Mini App terminal reward recovery credits its saved final step on the original day', async () => {
  const f = fixture('84303'); standardRun(f,'mini-ending',99);
  await runtime(f,'runtime:api:mini-ending-prior',now.toISOString().slice(0,10),'run_step');
  f.sql.exec("CREATE TRIGGER fail_ending BEFORE INSERT ON telegram_pet_reward_claims WHEN NEW.source='pet_run_legacy' BEGIN SELECT RAISE(ABORT,'interrupted_final_reward'); END");
  const body={action:'run_step',run_id:'mini-ending',choice_key:'boss',expected_step_index:100,request_id:'mini-final'};
  const random=Math.random; Math.random=()=>0.999;
  try { await assert.rejects(f.act(body),/interrupted_final_reward/); } finally { Math.random=random; }
  f.sql.exec('DROP TRIGGER fail_ending');
  f.sql.prepare("UPDATE telegram_pet_run_steps SET created_at='2026-09-26 12:00:00' WHERE step_index=100").run();
  const result=await f.act({...body,request_id:'new-request'});
  assert.equal(result.accepted,true);
  assert.equal(progress(f).adventure_xp,20);
  assert.equal(progress(f).adventure_daily,10,'recovery does not consume today’s allowance');
});

test('a saved raid victory repairs specialist progression on refresh for its original pet', async () => {
  const f=fixture('84304');
  f.sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress
    (pet_id,telegram_id,pet_season_key,season_key,boss_key,damage,defeated_at,reward_claimed_at)
    VALUES (?,?,?,'season1:w2959','neon_titan',900,'2026-09-26 12:00:00',CURRENT_TIMESTAMP)`)
    .run(authority(f).pet_id,f.owner,currentSeason);
  f.pet('raid-second',currentSeason,300,2); f.active('raid-second');
  await f.state();
  assert.equal(progress(f)?.adventure_xp,30);
  assert.equal(progress(f).arena_xp,8);
  assert.equal(progress(f).daily_key,'2026-09-26');
  await f.state();
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp,30);
});

test('API cannot pay a Mini App room again by replaying its saved request key', async () => {
  const f=fixture('84305'); standardRun(f,'shared-step');
  const random=Math.random; Math.random=()=>0.999;
  let result;
  try { result=await f.act({action:'run_step',run_id:'shared-step',choice_key:'fight',expected_step_index:3,request_id:'mini-room'}); }
  finally { Math.random=random; }
  assert.equal(result.accepted,true);
  const key=f.sql.prepare('SELECT event_key FROM telegram_pet_run_steps WHERE step_index=3').get().event_key;
  const before=progress(f).adventure_xp;
  assert.equal((await api(f,{action:'run_step',run_id:'shared-step',choice_key:'fight',expected_step_index:3,event_key:key})).duplicate,true);
  assert.equal(progress(f).adventure_xp,before);
});

for (const action of ['district_mission', 'event_chain']) test(`${action} repairs the saved specialist award after a new request ID`, async () => {
  const { PET_EVENT_CHAINS } = await import('../workers/moonboys-api/pets/content-phase-4.js');
  const f=fixture(action==='event_chain'?'84307':'84306');
  f.sql.exec('UPDATE telegram_pet_instances SET pet_xp=1000000; UPDATE telegram_pet_profiles SET pet_xp=1000000;');
  const body={action,region_key:'moon_alley',chain_key:Object.keys(PET_EVENT_CHAINS)[0],request_id:'original-explore'};
  f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  const first=await f.act(body);
  assert.equal(first.accepted,true,JSON.stringify(first));
  assert.equal(progress(f)?.adventure_xp||0,0);
  const paid=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp;
  f.sql.exec('DROP TRIGGER fail_specialist');
  assert.equal((await f.act({...body,request_id:'retry-new-key'})).duplicate,true);
  assert.equal(progress(f)?.adventure_xp,14);
  await f.state();
  assert.equal(progress(f).adventure_xp,14);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp,paid);
});

for (const extract of [false,true]) test(`Official Daily ${extract?'extraction':'room'} survives specialist failure and pet switching`, async () => {
  const { __dailyMoonRunTestHooks: daily } = await import('../workers/moonboys-api/pets/daily-moon-run.js');
  const f=fixture(extract?'84309':'84308');
  f.sql.prepare("UPDATE telegram_pet_instances SET equipped_outfit='moon_armor'").run();
  f.sql.prepare("UPDATE telegram_pet_profiles SET equipped_outfit='moon_armor'").run();
  f.sql.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,'moon_armor','outfit')").run(f.owner);
  const created=await f.act({action:'daily_run_start'});
  assert.equal(created.accepted,true,JSON.stringify(created));
  const run=f.sql.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(created.daily_run.run_id);
  const room=created.room;
  // Choose a deterministic successful fixture seed; play still uses the real
  // authoritative resolver and persisted room, rather than mocking its result.
  let choice;
  for(let seed=1;seed<=100 && !choice;seed++) {
    run.seed=seed;
    for(const option of room.choices) if((await daily.resolveAuthoritativeDailyRoomOutcome(f.db,run,room,option.choice_id)).success) { choice=option.choice_id; break; }
  }
  assert.ok(choice);
  f.sql.prepare('UPDATE telegram_pet_runs SET seed=? WHERE run_id=?').run(run.seed,run.run_id);
  if(!extract) f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  const step=await f.act({action:'run_step',run_id:run.run_id,choice_key:choice,expected_step_index:0,request_id:'daily-room'});
  assert.equal(step.reason,'daily_room_resolved',JSON.stringify(step));
  if(extract) {
    f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
    assert.equal((await f.act({action:'run_extract',run_id:run.run_id,request_id:'daily-extract'})).accepted,true);
  }
  const before=progress(f)?.adventure_xp||0;
  assert.equal(before,extract?10:0);
  f.sql.exec('DROP TRIGGER fail_specialist');
  f.pet('daily-second',currentSeason,300,2); f.active('daily-second');
  await f.state();
  assert.equal(progress(f).adventure_xp,extract?34:10);
  assert.equal(f.sql.prepare("SELECT mastery_xp FROM telegram_pet_equipment_progression WHERE item_key='moon_armor'").get().mastery_xp,extract?2:1);
  await f.state();
  if(extract) await api(f,{action:'run_extract',run_id:run.run_id,event_key:'api-daily-retry'});
  else await api(f,{action:'run_step',run_id:run.run_id,choice_key:choice,expected_step_index:0,event_key:'api-daily-retry'});
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp,extract?34:10);
});

test('new Daily boss settlement repairs only its saved step on refresh or finish', async () => {
  const { createPetRunRoom, persistPetRunRoomOutcome } = await import('../workers/moonboys-api/pets/roguelite-foundation.js');
  const f=fixture('84310');
  const created=await f.act({action:'daily_run_start'});
  const run=f.sql.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(created.daily_run.run_id);
  run.current_room=9; run.depth=9;
  f.sql.prepare('UPDATE telegram_pet_runs SET current_room=9,depth=9 WHERE run_id=?').run(run.run_id);
  const room=await createPetRunRoom(f.db,run);
  await persistPetRunRoomOutcome(f.db,run,room,{success:true,score:100,choice_id:room.choices[0].choice_id,runtime_event_key:`runtime:daily-step:${room.room_id}`});
  f.sql.prepare("UPDATE telegram_pet_run_rooms SET resolved_at='2026-09-26 12:00:00' WHERE room_id=?").run(room.room_id);
  f.sql.prepare('UPDATE telegram_pet_runs SET current_room=10,depth=10 WHERE run_id=?').run(run.run_id);
  const result=await f.act({action:'run_extract',run_id:run.run_id,request_id:'finish-saved'});
  assert.equal(result.reason,'daily_run_completed');
  assert.equal(progress(f).adventure_xp,10);
  assert.equal(progress(f).daily_key,'2026-09-26');
  await f.state();
  await api(f,{action:'run_extract',run_id:run.run_id,event_key:'finish-again'});
  assert.equal(progress(f).adventure_xp,10);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE action='run_extract'").get().n,0);
});

test('story retries retain the first reserved identity when primary settlement fails', async () => {
  const { PET_EVENT_CHAINS } = await import('../workers/moonboys-api/pets/content-phase-4.js');
  const f=fixture('84311');
  const body={action:'event_chain',chain_key:Object.keys(PET_EVENT_CHAINS)[0],request_id:'reserved-story'};
  f.sql.exec("CREATE TRIGGER fail_primary BEFORE INSERT ON telegram_pet_reward_claims WHEN NEW.source='pet_event_chain' BEGIN SELECT RAISE(ABORT,'primary-story-failure'); END");
  await assert.rejects(f.act(body),/primary-story-failure/);
  f.sql.exec('DROP TRIGGER fail_primary');
  assert.equal((await f.act({...body,request_id:'different-retry'})).accepted,true);
  assert.equal(progress(f).adventure_xp,14);
  assert.match(f.sql.prepare("SELECT event_key FROM telegram_pet_specialist_events WHERE action='explore'").get().event_key,/reserved-story$/);
  await f.state();
  assert.equal(progress(f).adventure_xp,14);
});

test('Adventure API retry restores its original pet progression once', async () => {
  const f=fixture('84312');
  const encounter=hooks.resolvePetAdventureEncounter('moon_alley');
  const body={action:'adventure',adventure_key:encounter.choices[0].key,event_key:'moon_alley'};
  f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  assert.equal((await api(f,body)).accepted,true);
  f.sql.exec('DROP TRIGGER fail_specialist');
  f.pet('adventure-second',currentSeason,300,2); f.active('adventure-second');
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(progress(f).adventure_xp,14);
  await f.state();
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp,14);
  assert.equal((await api(f,{...body,event_key:'x'.repeat(121)})).status,400);
});

test('recovery filters invalid owners before its bound and drains paid candidates on later refreshes', async () => {
  const f=fixture('84313'); standardRun(f,'queue',1);
  f.sql.prepare('DELETE FROM telegram_pet_run_steps').run();
  for(let i=0;i<47;i++) f.sql.prepare(`INSERT INTO telegram_pet_run_steps
    (id,pet_id,telegram_id,run_id,step_index,choice_key,choice_type,event_key,success,metadata,created_at)
    VALUES (?,?,?,'queue',?,'fight','fight',?,1,'{"source":"telegram_pets_api"}','2026-09-26 12:00:00')`)
    .run('queue-'+i,i<25?'missing-pet':authority(f).pet_id,f.owner,i+1,'queue-'+i);
  await f.state();
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,20);
  await f.state();
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,22);
  assert.equal(progress(f).adventure_xp,220);
  await f.state();
  assert.equal(progress(f).adventure_xp,220);
});

test('an earlier season raid stays visible and claimable while the selected pet is an egg', async () => {
  const f=fixture('84314'); f.pet('old-raid','pet-s2026-002',5000,1); f.reveal('old-raid');
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE pet_id=?").run(authority(f).pet_id);
  f.sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress
    (pet_id,telegram_id,pet_season_key,season_key,boss_key,damage,defeated_at)
    VALUES ('old-raid',?,'pet-s2026-002','neon_uprising:w2900','neon_titan',900,'2026-05-12 12:00:00')`).run(f.owner);
  const snapshot=await f.state();
  const claim=snapshot.live_systems.seasonal_boss.pending_rewards.find(r=>r.pet_id==='old-raid');
  assert.ok(claim,'old season rewards remain reachable from the current pet');
  const result=await f.act({action:'seasonal_boss_claim',...claim});
  assert.equal(result.accepted,true,JSON.stringify(result));
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='old-raid'").get().pet_xp,5150);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(authority(f).pet_id).pet_xp,200);
  assert.equal((await f.state()).live_systems.seasonal_boss.pending_rewards.length,0);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=daily')).entries[0].pet_xp,150);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=weekly')).entries[0].pet_xp,150);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,5350);
  assert.equal(f.sql.prepare("SELECT season_xp FROM telegram_pet_season_state WHERE season_key='pet-s2026-002'").get().season_xp,150);
  assert.equal((await f.get('/telegram-pets/activity')).items.find(e=>e.event_type==='seasonal_boss').display_name,'BOTTY');

  const total=f.sql.prepare('SELECT SUM(pet_xp) xp FROM telegram_pet_instances').get().xp;
  assert.equal((await f.act({action:'seasonal_boss_claim',...claim})).duplicate,true);
  assert.equal(f.sql.prepare('SELECT SUM(pet_xp) xp FROM telegram_pet_instances').get().xp,total);
  assert.equal((await f.act({action:'seasonal_boss_claim',...claim,pet_id:'unowned'})).accepted,false);
});


test('historical oversized Adventure keys cannot create a second award during refresh', async () => {
  const f=fixture('84315'), key='a'.repeat(120), day=now.toISOString().slice(0,10);
  f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata)
    VALUES ('legacy-long',?,?,'adventure',?,?,?,'week','accepted','{"context":{"source":"telegram_pets_api"}}')`)
    .run(authority(f).pet_id,f.owner,key,currentSeason,day);
  await runtime(f,'runtime:api:'+key+'-legacy-suffix',day,'explore');
  await f.state();
  assert.equal(progress(f).adventure_xp,14);
});

for (const [index, [action, track, amount]] of [['feed','care',8], ['work','job',14], ['daily_chest','bond',8]].entries()) {
  test(`${action} repairs interrupted progression on refresh and rejects cross-surface double credit`, async () => {
    const f = fixture('8451' + index);
    f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
    const first = await f.act({ action, job_key: 'street_artist', request_id: 'ordinary-refresh' });
    assert.equal(first.accepted, true);
    const event = f.sql.prepare('SELECT event_key FROM telegram_pet_events WHERE status=\'accepted\' AND event_type=?').get(action);
    f.sql.exec('DROP TRIGGER fail_specialist');
    f.pet('ordinary-replacement', currentSeason, 200, 2); f.active('ordinary-replacement');
    await f.state();
    assert.equal(progress(f)?.[track + '_xp'], amount);
    assert.equal((await api(f, { action, job_key: 'street_artist', event_key: event.event_key })).duplicate, true);
    assert.equal(progress(f)[track + '_xp'], amount);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n, 1);
  });
  test(`${action} API replay of a successful Mini App action cannot award another specialist receipt`, async () => {
    const f = fixture('8452' + index);
    assert.equal((await f.act({ action, job_key: 'street_artist', request_id: 'ordinary-replay' })).accepted, true);
    const event = f.sql.prepare('SELECT event_key FROM telegram_pet_events WHERE status=\'accepted\' AND event_type=?').get(action);
    assert.equal((await api(f, { action, job_key: 'street_artist', event_key: event.event_key })).duplicate, true);
    assert.equal(progress(f)[track + '_xp'], amount);
  });
}

test('a paid Weekly Boss victory repairs missing specialist progression on refresh', async () => {
  const f = fixture('84040');
  f.sql.exec('UPDATE telegram_pet_instances SET pet_xp=3240; UPDATE telegram_pet_profiles SET pet_xp=3240;');
  const preview = await hooks.processPetWeeklyBoss(f.db, f.owner, '');
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id,week_key,boss_id,damage,attempts)
    VALUES (?,?,?,?,1)`).run(f.owner, preview.week_key, preview.boss.boss_id, preview.boss.hp - 1);
  f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  const victory = await hooks.processPetWeeklyBoss(f.db, f.owner, 'strike', 'weekly-saved-victory');
  assert.equal(victory.reason, 'boss_defeated');
  assert.equal(victory.reward.accepted, true);
  f.sql.exec('DROP TRIGGER fail_specialist');
  f.pet('weekly-replacement', currentSeason, 200, 2); f.active('weekly-replacement');
  await f.state();
  assert.equal(progress(f)?.adventure_xp, 30);
  assert.equal(progress(f)?.arena_xp, 8);
  const receipt = f.sql.prepare("SELECT * FROM telegram_pet_specialist_events WHERE action='run_boss'").get();
  assert.equal(receipt.pet_id, authority(f).pet_id);
  await f.state();
  assert.equal(progress(f).adventure_xp, 30);
});

for (const missing of ['memory', 'crest']) test(`Weekly Boss refresh repairs interrupted ${missing} after its main reward is paid`, async () => {
  const f = fixture('weekly-' + missing);
  f.sql.exec('UPDATE telegram_pet_instances SET pet_xp=3240; UPDATE telegram_pet_profiles SET pet_xp=3240;');
  const preview = await hooks.processPetWeeklyBoss(f.db, f.owner, '');
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id,week_key,boss_id,damage,attempts)
    VALUES (?,?,?,?,1)`).run(f.owner, preview.week_key, preview.boss.boss_id, preview.boss.hp - 1);
  const table = missing === 'memory' ? 'telegram_pet_memories' : 'telegram_pet_weekly_crests';
  f.sql.exec(`CREATE TRIGGER fail_finish BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'interrupted_finish'); END`);
  const attempt = hooks.processPetWeeklyBoss(f.db, f.owner, 'strike', 'weekly-' + missing);
  if (missing === 'memory') await assert.rejects(attempt, /interrupted_finish/);
  else assert.equal((await attempt).reason, 'boss_defeated');
  assert.ok(f.sql.prepare('SELECT reward_claimed_at FROM telegram_pet_weekly_boss_progress').get().reward_claimed_at);
  f.sql.exec('DROP TRIGGER fail_finish');
  const gold = f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold;
  await f.state();
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_crests').get().n, 1);
  assert.equal(f.sql.prepare('SELECT total_bosses_defeated n FROM telegram_pet_memories WHERE pet_id=?').get(authority(f).pet_id)?.n, 1);
  assert.equal(progress(f)?.adventure_xp, 30);
  await f.state();
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, gold);
  assert.equal(f.sql.prepare('SELECT total_bosses_defeated n FROM telegram_pet_memories WHERE pet_id=?').get(authority(f).pet_id).n, 1);
});

function savedWeeklyVictory(f, day, petId = authority(f).pet_id) {
  const at = new Date(day + 'T12:00:00Z');
  const iso = new Date(at); iso.setUTCHours(0,0,0,0); iso.setUTCDate(iso.getUTCDate() + 4 - (iso.getUTCDay() || 7));
  const week = `${iso.getUTCFullYear()}-W${String(Math.ceil(((iso - Date.UTC(iso.getUTCFullYear(),0,1)) / 86400000 + 1) / 7)).padStart(2,'0')}`;
  const season = hooks.getPetSeasonInfo(at).key, boss = hooks.getPetWeeklyBoss(week);
  const key = 'saved-weekly:' + petId + ':' + day;
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id,week_key,boss_id,damage,attempts,defeated_at,reward_claimed_at)
    VALUES (?,?,?,?,1,?,?)`).run(f.owner, week, boss.boss_id, boss.hp, at.toISOString(), at.toISOString());
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_victories_by_pet (telegram_id,week_key,boss_id,pet_id,season_key,victory_event_key,defeated_at)
    VALUES (?,?,?,?,?,?,?)`).run(f.owner, week, boss.boss_id, petId, season, key, at.toISOString());
  f.sql.prepare(`INSERT INTO telegram_pet_events (id,telegram_id,pet_id,season_key,event_type,event_key,day_key,week_key,status,reason,metadata,created_at)
    VALUES (?,?,?,?,'weekly_boss',?,?,?,'accepted','weekly_boss_attempt',?,?)`)
    .run(key, f.owner, petId, season, key, day, week, JSON.stringify({source:'pet_weekly_boss',boss_id:boss.boss_id}), at.toISOString());
  return { pet_id: petId, season, week, boss, key, at };
}

test('Weekly Boss recovery preserves the original date and achievements for an archived victor', async () => {
  const f = fixture('84530');
  const day = (now.getUTCFullYear() - 1) + '-01-15';
  const season = hooks.getPetSeasonInfo(new Date(day)).key;
  f.pet('archived-weekly', season, 3200);
  f.sql.prepare("UPDATE telegram_pet_instances SET status='archived' WHERE pet_id='archived-weekly'").run();
  f.sql.prepare("UPDATE telegram_pet_season_slots SET status='archived' WHERE pet_id='archived-weekly'").run();
  const saved = savedWeeklyVictory(f, day, 'archived-weekly');
  const before = await f.get('/telegram-pets/leaderboard?period=all_time');
  await f.state();
  const receipt = f.sql.prepare("SELECT * FROM telegram_pet_specialist_events WHERE action='run_boss'").get();
  assert.equal(receipt.pet_id, 'archived-weekly');
  assert.equal(JSON.parse(receipt.payload_json).day_key, day);
  const crest = f.sql.prepare('SELECT * FROM telegram_pet_weekly_crests').get();
  assert.equal(crest.pet_id, 'archived-weekly'); assert.equal(crest.earned_at, saved.at.toISOString());
  const memory = f.sql.prepare("SELECT * FROM telegram_pet_memories WHERE pet_id='archived-weekly'").get();
  assert.equal(memory.total_bosses_defeated, 1); assert.equal(memory.first_boss_victory_at, saved.at.toISOString());
  assert.equal(f.sql.prepare("SELECT progress FROM telegram_pet_achievements WHERE pet_id='archived-weekly' AND achievement_id='boss_breaker'").get()?.progress, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").get().n, 1);
  await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE action='run_boss'").get().n, 1);
  assert.deepEqual((await f.get('/telegram-pets/leaderboard?period=all_time')).entries, before.entries);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, 1000);
});

for (const lookup of ['authority','memory']) test(`Weekly Boss ${lookup} lookup failure must leave completion open for repair`, async () => {
  const f = fixture('weekly-lookup-' + lookup);
  savedWeeklyVictory(f, now.toISOString().slice(0,10));
  let failed = false;
  f.db.beforeFirst = async statement => {
    if (!(lookup === 'authority'
      ? statement.query.startsWith('SELECT s.pet_id, s.telegram_id, s.season_key, s.slot_number')
      : statement.query.startsWith('SELECT total_runs, total_bosses_defeated FROM telegram_pet_memories'))) return;
    f.db.beforeFirst = null; failed = true; throw Error('interrupted_achievement_lookup');
  };
  await f.state();
  assert.equal(failed, true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").get().n, 0);
  await f.state();
  assert.equal(f.sql.prepare("SELECT progress FROM telegram_pet_achievements WHERE pet_id=? AND achievement_id='boss_breaker'").get(authority(f).pet_id)?.progress,1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").get().n, 1);
  assert.equal(progress(f).adventure_xp,30);
});

test('Weekly Boss completion-marker failure retries without repeating any award', async () => {
  const f = fixture('84531');
  savedWeeklyVictory(f, now.toISOString().slice(0,10));
  f.sql.exec("CREATE TRIGGER fail_finish_marker BEFORE INSERT ON telegram_pet_system_events WHEN NEW.system_key='weekly_boss_finish' BEGIN SELECT RAISE(ABORT,'interrupted_finish_marker'); END");
  await f.state();
  assert.equal(progress(f).adventure_xp, 30);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_crests').get().n, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").get().n, 0);
  f.sql.exec('DROP TRIGGER fail_finish_marker');
  await f.state();
  assert.equal(progress(f).adventure_xp, 30);
  assert.equal(f.sql.prepare('SELECT total_bosses_defeated n FROM telegram_pet_memories').get().n, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_crests').get().n, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").get().n, 1);
});

test('unbacked Weekly Boss victories cannot fill the recovery queue ahead of a valid victory', async () => {
  const f = fixture('84532'), pets = new Map();
  for (let index=0; index<22; index++) {
    const day = new Date(Date.UTC(now.getUTCFullYear()-1,0,15+index*7)).toISOString().slice(0,10);
    const season = hooks.getPetSeasonInfo(new Date(day)).key;
    if (!pets.has(season)) { pets.set(season, 'weekly-'+season); f.pet(pets.get(season), season); }
    const saved = savedWeeklyVictory(f, day, pets.get(season));
    if (index<21) f.sql.prepare('DELETE FROM telegram_pet_events WHERE event_key=?').run(saved.key);
  }
  await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE action='run_boss'").get().n, 1);
  assert.equal(f.sql.prepare('SELECT SUM(total_bosses_defeated) n FROM telegram_pet_memories').get().n, 1);
});

test('new Telegram command receipts retain their exact specialist identity for refresh and API retries', async () => {
  const f = fixture('84533');
  const options = (action) => ({event_key:'bot-primary-'+action, source:'telegram_command', runtime_event_key:'runtime:bot-original-'+action});
  assert.equal((await hooks.processPetAction(f.db,f.owner,'feed',options('feed'))).accepted,true);
  assert.equal((await hooks.processPetJob(f.db,f.owner,'street_artist',options('work'))).accepted,true);
  assert.equal((await hooks.processPetDailyChest(f.db,f.owner,options('daily_chest'))).accepted,true);
  await f.state();
  assert.equal(progress(f).care_xp,8); assert.equal(progress(f).job_xp,14); assert.equal(progress(f).bond_xp,13);
  for (const action of ['feed','work','daily_chest']) {
    assert.equal((await api(f,{action,event_key:options(action).event_key,job_key:'street_artist'})).duplicate,true);
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,3);
  assert.ok(f.sql.prepare('SELECT event_key FROM telegram_pet_specialist_events').all().every(row=>row.event_key.startsWith('runtime:bot-original-')));
});

test('already paid whitespace keys cannot starve recovery behind the batch limit', async () => {
  const f=fixture('84316'); standardRun(f,'spaces',21);
  f.sql.prepare('DELETE FROM telegram_pet_run_steps').run();
  for(let i=0;i<21;i++) {
    const key='spaces-'+i+' \t';
    f.sql.prepare(`INSERT INTO telegram_pet_run_steps
      (id,pet_id,telegram_id,run_id,step_index,choice_key,choice_type,event_key,success,metadata)
      VALUES (?,?,?,'spaces',?,'fight','fight',?,1,'{"source":"telegram_pets_api"}')`)
      .run('spaces-'+i,authority(f).pet_id,f.owner,i+1,key);
    if(i<20) await runtime(f,'runtime:api:'+key,now.toISOString().slice(0,10),'run_step');
  }
  await f.state();
  assert.equal(progress(f).adventure_xp,210);
});

test('Mini App shop purchases create gear progression and preserve it on API replay', async () => {
  const f = fixture('84601');
  const body = { action: 'buy', item_key: 'moon_kibble', request_id: 'gear-buy' };
  assert.equal((await f.act(body)).accepted, true);
  const gear = f.sql.prepare('SELECT * FROM telegram_pet_equipment_progression WHERE telegram_id=?').get(f.owner);
  assert.equal(gear?.item_key, 'moon_kibble');
  assert.equal((await f.state()).gear.some(row => row.item_key === 'moon_kibble'), true);
  const eventKey = f.sql.prepare("SELECT event_key FROM telegram_pet_events WHERE event_type='buy'").get().event_key;
  assert.equal((await api(f, { action: 'buy', item_key: 'moon_kibble', event_key: eventKey })).duplicate, true);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, 955);
});

test('equipped gear mastery is persisted once with specialist awards and public totals remain unchanged on retry', async () => {
  const f = fixture('gear-mastery');
  assert.equal((await f.act({ action: 'buy', item_key: 'moon_kibble' })).accepted, true);
  const body = { action: 'feed', request_id: 'gear-feed' };
  assert.equal((await f.act(body)).accepted, true);
  const gear = () => f.sql.prepare("SELECT * FROM telegram_pet_equipment_progression WHERE item_key='moon_kibble'").get();
  assert.equal(gear()?.mastery_xp, 1);
  assert.equal(gear()?.item_xp, 1);
  const xp = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp;
  await f.act(body); await f.state();
  assert.equal(gear().mastery_xp, 1);
  assert.equal(progress(f).care_xp, 8);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_equipment_events').get().n, 1);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp, xp);
});

test('gear write failure rolls back the specialist receipt so refresh can repair the whole award', async () => {
  const f = fixture('gear-rollback');
  await f.act({ action: 'buy', item_key: 'moon_kibble' });
  f.sql.exec("CREATE TRIGGER fail_gear BEFORE INSERT ON telegram_pet_equipment_events BEGIN SELECT RAISE(ABORT,'gear_failure'); END");
  assert.equal((await f.act({ action: 'feed', request_id: 'gear-failed-feed' })).accepted, true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n, 0);
  const xp = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp;
  f.sql.exec('DROP TRIGGER fail_gear');
  await f.state(); await f.state();
  assert.equal(progress(f).care_xp, 8);
  assert.equal(f.sql.prepare('SELECT mastery_xp FROM telegram_pet_equipment_progression').get().mastery_xp, 1);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp, xp);
});

for (const lookup of ['equipment','faction']) test(`specialist ${lookup} read failure cannot close an incomplete award`, async () => {
  const f = fixture('gear-read-' + lookup);
  await f.act({ action: 'buy', item_key: 'moon_kibble' });
  let failed = false;
  const hook = lookup === 'equipment' ? 'beforeAll' : 'beforeFirst';
  f.db[hook] = async statement => {
    if (!(lookup === 'equipment' ? statement.query.includes('FROM telegram_pet_equipment_progression') : statement.query === 'SELECT faction FROM blocktopia_progression WHERE telegram_id=?')) return;
    f.db[hook] = null; failed = true; throw Error('runtime_dependency_unavailable');
  };
  const first = await applyPetRuntimeCommandAward(f.db, f.owner, 'runtime:dependency', 'train', authority(f));
  assert.equal(failed, true);
  assert.equal(first, null);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n, 0);
  assert.equal((await applyPetRuntimeCommandAward(f.db, f.owner, 'runtime:dependency', 'train', authority(f))).ok, true);
  assert.equal(progress(f).training_xp, 12);
});

test('purchased gear levels and mastery change equipped care and Arena effects', async () => {
  const f = fixture('gear-effects');
  f.sql.prepare("UPDATE telegram_pet_instances SET equipped_food='moon_kibble',equipped_weapon='laser_claws',source_profile_updated_at='moonpet-instance-v1'").run();
  f.sql.prepare("UPDATE telegram_pet_profiles SET equipped_food='moon_kibble',equipped_weapon='laser_claws'").run();
  for (const [key, slot] of [['moon_kibble','food'],['laser_claws','weapon']]) f.sql.prepare('INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,?,?)').run(f.owner,key,slot);
  const basePet = await hooks.getPetProfile(f.db, f.owner);
  const baseRewards = { pet_xp: 10, moon_gold: 0, style_tokens: 0 }, baseRule = { hunger: -10, energy: 0, happiness: 0 };
  hooks.applyPetItemActionBonuses(basePet, 'feed', baseRule, baseRewards);
  f.sql.prepare('UPDATE telegram_pet_equipment_progression SET item_level=10,mastery_xp=5000,mastery_tier=5').run();
  const upgradedPet = await hooks.getPetProfile(f.db, f.owner);
  const rewards = { pet_xp: 10, moon_gold: 0, style_tokens: 0 }, rule = { hunger: -10, energy: 0, happiness: 0 };
  hooks.applyPetItemActionBonuses(upgradedPet, 'feed', rule, rewards);
  assert.ok(rewards.pet_xp > baseRewards.pet_xp);
  assert.ok(rule.hunger < baseRule.hunger);
  assert.ok(hooks.calculatePetArenaPower(upgradedPet,'fixed') > hooks.calculatePetArenaPower(basePet,'fixed'));
});

test('a failed gear registration rolls the whole purchase back', async () => {
  const f = fixture('gear-shop-rollback');
  f.sql.exec("CREATE TRIGGER fail_gear_purchase BEFORE INSERT ON telegram_pet_equipment_progression BEGIN SELECT RAISE(ABORT,'gear_purchase_failure'); END");
  await assert.rejects(f.act({ action:'buy', item_key:'moon_kibble' }), /gear_purchase_failure/);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,1000);
  assert.equal(f.sql.prepare('SELECT equipped_food FROM telegram_pet_instances').get().equipped_food,null);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='buy'").get().n,0);
});

test('ownership recovery restores earlier purchased gear without spending or guessing mastery', async () => {
  const f = fixture('gear-owned');
  await f.act({ action:'buy', item_key:'moon_kibble' });
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=10000').run();
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=10000').run();
  assert.equal((await f.act({ action:'buy', item_key:'nebula_snack' })).accepted,true);
  const balance = f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold;
  f.sql.exec('DELETE FROM telegram_pet_equipment_progression');
  const snapshot = await f.state();
  assert.deepEqual(snapshot.gear.map(row=>row.item_key).sort(),['moon_kibble','nebula_snack']);
  assert.ok(snapshot.gear.every(row=>row.mastery_xp===0));
  await f.state();
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,balance);
});

test('saved care credits its original equipment after replacement and pet switching', async () => {
  const f = fixture('gear-source');
  await f.act({ action:'buy', item_key:'moon_kibble' });
  f.sql.exec("CREATE TRIGGER fail_saved_gear BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'saved_gear_failure'); END");
  await f.act({ action:'feed', request_id:'old-gear-feed' });
  f.sql.exec('DROP TRIGGER fail_saved_gear');
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=10000').run();
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=10000').run();
  assert.equal((await f.act({ action:'buy', item_key:'nebula_snack' })).accepted,true);
  f.pet('new-gear-pet',currentSeason,300,2);
  await hooks.switchActivePetSeasonSlot(f.db,f.owner,'new-gear-pet');
  await f.state();
  const rows = f.sql.prepare('SELECT item_key,mastery_xp FROM telegram_pet_equipment_progression').all();
  assert.equal(rows.find(row=>row.item_key==='moon_kibble').mastery_xp,1);
  assert.equal(rows.find(row=>row.item_key==='nebula_snack').mastery_xp,0);
  assert.equal(progress(f).care_xp,8);
});

test('legacy specialist recovery cannot give newly purchased gear invented historical mastery', async () => {
  const f = fixture('gear-legacy');
  await f.act({ action:'feed', request_id:'legacy-feed' });
  f.sql.exec("DELETE FROM telegram_pet_specialist_events; DELETE FROM telegram_pet_specialist_progression; UPDATE telegram_pet_events SET metadata=json_remove(metadata,'$.equipment_snapshot') WHERE event_type='feed'");
  await f.act({ action:'buy', item_key:'moon_kibble' });
  await f.state();
  assert.equal(progress(f).care_xp,8);
  assert.equal(f.sql.prepare('SELECT mastery_xp FROM telegram_pet_equipment_progression').get().mastery_xp,0);
});

test('gear mastery threshold and daily/weekly/public action totals stay consistent', async () => {
  const f = fixture('gear-public');
  await f.act({action:'buy',item_key:'moon_kibble'});
  f.sql.prepare('UPDATE telegram_pet_equipment_progression SET mastery_xp=74').run();
  const first = await f.act({action:'feed',request_id:'tier-feed'});
  assert.equal(f.sql.prepare('SELECT mastery_tier FROM telegram_pet_equipment_progression').get().mastery_tier,1);
  for (const period of ['daily','weekly','seasonal']) {
    const board = await f.get('/telegram-pets/leaderboard?period='+period);
    assert.equal(board.entries[0].pet_xp,first.pet_xp_awarded);
  }
  const state = await f.state();
  assert.equal(state.gear[0].mastery_xp,75);
  assert.equal(state.guidance.missions.find(m=>m.key.startsWith('pet-daily-feed:')).completed,true);
  const activity = await f.get('/telegram-pets/activity');
  assert.equal(activity.items.filter(row=>row.event_type==='feed').length,1);
});

test('Standard Run previews use upgraded source gear without borrowing the active pet loadout', async () => {
  const f = fixture('gear-run-preview');
  f.sql.prepare("UPDATE telegram_pet_instances SET equipped_toy='hoverboard'").run();
  f.sql.prepare("UPDATE telegram_pet_profiles SET equipped_toy='hoverboard'").run();
  f.sql.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,'hoverboard','toy')").run(f.owner);
  const base = await hooks.getPetProfile(f.db,f.owner);
  f.sql.prepare('UPDATE telegram_pet_equipment_progression SET item_level=10,mastery_xp=5000').run();
  const upgraded = await hooks.getPetProfile(f.db,f.owner);
  const run = {depth:1,difficulty:1}, choice = {key:'sneak',type:'sneak',base_risk:0.3,rewards:{moon_gold:[10,10]},costs:{}};
  const first = hooks.serializePetRunChoicePreview(run,choice,base,[],base);
  const second = hooks.serializePetRunChoicePreview(run,choice,upgraded,[],upgraded);
  assert.ok(second.risk_percent < first.risk_percent);
  assert.notDeepEqual(second.reward_preview,first.reward_preview);
  f.pet('other-run-pet',currentSeason,300,2);
  await hooks.switchActivePetSeasonSlot(f.db,f.owner,'other-run-pet');
  const other = await hooks.getPetProfile(f.db,f.owner);
  assert.deepEqual(other.equipment_progression,{});
});

test('training faction bonus survives a failed dependency read and is credited once', async () => {
  const f = fixture('gear-faction-bonus');
  f.sql.prepare("INSERT INTO blocktopia_progression (telegram_id,faction) VALUES (?,'hard-fork-rockers')").run(f.owner);
  f.db.beforeFirst = async statement => {
    if(statement.query !== 'SELECT faction FROM blocktopia_progression WHERE telegram_id=?') return;
    f.db.beforeFirst=null; throw Error('faction_read_failed');
  };
  assert.equal(await applyPetRuntimeCommandAward(f.db,f.owner,'runtime:faction','train',authority(f)),null);
  await applyPetRuntimeCommandAward(f.db,f.owner,'runtime:faction','train',authority(f));
  await applyPetRuntimeCommandAward(f.db,f.owner,'runtime:faction','train',authority(f));
  assert.equal(progress(f).training_xp,13);
});

test('Arena completion repairs frozen gear and specialist XP after an interrupted award', async () => {
  const f = fixture('gear-arena');
  f.sql.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,'laser_claws','weapon')").run(f.owner);
  const match = {battle_id:'arena-gear',match_id:'arena-gear',mode:'pet_arena',player1_telegram_id:f.owner,
    player1_pet_id:authority(f).pet_id,player1_season_key:currentSeason,
    player1_pet_snapshot_json:JSON.stringify({equipment_progression:{laser_claws:{item_key:'laser_claws',slot:'weapon',item_level:1,mastery_xp:0}}})};
  f.sql.exec("CREATE TRIGGER fail_arena_gear BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'arena_specialist_failure'); END");
  const result=await hooks.awardPetKaijuPlayerResult(f.db,f.owner,match,'arena_win',{pet_xp:20,moon_gold:10});
  assert.equal(result.accepted,true,JSON.stringify(result));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,0);
  const gold=f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold;
  f.sql.exec('DROP TRIGGER fail_arena_gear');
  await f.state(); await f.state();
  assert.equal(progress(f).arena_xp,20);
  assert.equal(f.sql.prepare('SELECT mastery_xp FROM telegram_pet_equipment_progression').get().mastery_xp,1);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,gold);
});

test('Mini App equipment upgrade spends once, completes its mission and appears publicly without XP inflation', async () => {
  const f=fixture('gear-upgrade-action');
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=100000').run();
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=100000').run();
  await f.act({action:'buy',item_key:'moon_kibble'});
  const before=(await f.state()).gear.find(row=>row.item_key==='moon_kibble');
  assert.equal(before.item_level,1);
  for(const material of ['moon_dust','scrap_metal','crystal_shard','mastery_token','battery_cell']) {
    f.sql.prepare('INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,?,100)').run(f.owner,material);
  }
  const body={action:'gear_upgrade',item_key:'moon_kibble',request_id:'upgrade-once'};
  const result=await f.act(body);
  assert.equal(result.accepted,true,JSON.stringify(result));
  const gold=f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold;
  assert.equal((await f.act(body)).duplicate,true);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,gold);
  const state=await f.state();
  assert.equal(state.gear.find(row=>row.item_key==='moon_kibble').item_level,2);
  assert.equal(state.guidance.missions.find(m=>m.key.startsWith('pet-daily-shop:')).completed,true);
  const events=(await f.get('/telegram-pets/activity')).items.filter(row=>row.event_type==='equipment_upgrade');
  assert.equal(events.length,1);
  assert.match(events[0].text,/upgraded Moon Kibble/);
  assert.equal(events[0].pet_xp_awarded,0);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,100000);
});

for (const [choice, matching] of [['fight','laser_claws'],['sneak','hoverboard'],['rest','crystal_bowl'],['boss','crown_jacket']]) {
  test(`saved Standard ${choice} keeps its equipment action and original specialist award`, async () => {
    const f=fixture('gear-choice-'+choice);
    standardRun(f,'choice-run',choice==='boss'?10:2);
    const loadout=[['laser_claws','weapon'],['hoverboard','toy'],['crystal_bowl','food'],[choice==='boss'?'crown_jacket':'moon_armor','outfit']];
    const snapshot=Object.fromEntries(loadout.map(([item_key,slot])=>[item_key,{item_key,slot,item_level:1,mastery_xp:0}]));
    for(const [key,slot] of loadout) f.sql.prepare('INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,?,?)').run(f.owner,key,slot);
    f.sql.prepare('UPDATE telegram_pet_run_steps SET choice_key=?,choice_type=?,metadata=?').run(choice,choice,JSON.stringify({source:'telegram_pets_api',equipment_snapshot:snapshot}));
    f.pet('choice-other',currentSeason,300,2); f.active('choice-other');
    await f.state(); await f.state();
    assert.equal(progress(f).adventure_xp,10,'a boss room remains a step award, not a standalone boss award');
    const receipt=JSON.parse(f.sql.prepare('SELECT payload_json FROM telegram_pet_specialist_events').get().payload_json);
    assert.equal(receipt.action,'run_step');
    assert.equal(receipt.equipment_action,'run_'+choice);
    const gear=f.sql.prepare('SELECT item_key,mastery_xp FROM telegram_pet_equipment_progression').all();
    for(const row of gear) assert.equal(row.mastery_xp,row.item_key===matching||row.item_key==='moon_armor'?1:0,row.item_key);
  });
}

for(const [item,slot] of [['crown_jacket','outfit'],['hoverboard','toy']]) test(`Arena ${slot} power uses both paid levels and mastery`, async () => {
  const f=fixture('gear-arena-'+slot);
  f.sql.prepare(`UPDATE telegram_pet_instances SET equipped_${slot}=?,source_profile_updated_at='moonpet-instance-v1'`).run(item);
  f.sql.prepare(`UPDATE telegram_pet_profiles SET equipped_${slot}=?`).run(item);
  f.sql.prepare('INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,?,?)').run(f.owner,item,slot);
  const power=async()=>hooks.calculatePetArenaPower(await hooks.getPetProfile(f.db,f.owner),'fixed');
  const base=await power();
  f.sql.prepare('UPDATE telegram_pet_equipment_progression SET item_level=10').run();
  const leveled=await power();
  assert.ok(leveled>base);
  f.sql.prepare('UPDATE telegram_pet_equipment_progression SET mastery_xp=5000,mastery_tier=5').run();
  assert.ok(await power()>leveled);
});

for(const surface of ['API','Telegram']) for(const action of ['feed','work']) {
  test(`immediate ${surface} ${action} credits saved gear when a concurrent purchase replaces it`, async () => {
    const f=fixture('847'+(surface==='API'?'1':'2')+(action==='feed'?'1':'2'));
    f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=10000').run();
    f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=10000').run();
    const [original,replacement]=action==='feed'?['moon_kibble','nebula_snack']:['street_hoodie','moon_armor'];
    assert.equal((await f.act({action:'buy',item_key:original})).accepted,true);
    const batch=f.db.batch.bind(f.db);
    let replaced=false;
    f.db.batch=async statements=>{
      const result=await batch(statements);
      if(!replaced && f.sql.prepare("SELECT 1 FROM telegram_pet_events WHERE event_type=? AND status='accepted'").get(action)) {
        replaced=true;
        assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,0);
        assert.equal((await f.act({action:'buy',item_key:replacement})).accepted,true);
      }
      return result;
    };
    const body={action,job_key:'street_artist',event_key:'concurrent-gear'};
    const originalFetch=globalThis.fetch;
    const invoke=surface==='API'?async()=>assert.equal((await api(f,body)).accepted,true):async()=>{
      const response=await worker.fetch(new Request('https://moonboys-api.test/telegram/webhook',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:{message_id:1,
          chat:{id:Number(f.owner),type:'private'},from:{id:Number(f.owner),first_name:'Test player'},
          text:action==='feed'?'/feed':'/petwork street_artist'}})
      }),{DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-only-token',PET_MINI_APP_ENABLED:'false'});
      assert.equal(response.status,200);
    };
    globalThis.fetch=async url=>{
      assert.match(String(url),/^https:\/\/api\.telegram\.org\/botfixture-only-token\//);
      return new Response(JSON.stringify({ok:true,result:{message_id:1}}),{headers:{'content-type':'application/json'}});
    };
    try { await invoke(); await invoke(); } finally { globalThis.fetch=originalFetch; }
    assert.equal(replaced,true,'replacement happened after the accepted primary receipt');
    await f.state();
    const gear=Object.fromEntries(f.sql.prepare('SELECT item_key,mastery_xp FROM telegram_pet_equipment_progression').all().map(row=>[row.item_key,row.mastery_xp]));
    assert.equal(gear[original],1);
    assert.equal(gear[replacement],0);
    assert.equal(progress(f)[action==='feed'?'care_xp':'job_xp'],action==='feed'?8:14);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,1);
  });
}
