import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { applyPetRuntimeAward, getOrCreatePetRuntimeState } from '../workers/moonboys-api/pets/runtime-phase-5a.js';
import deployedWorker from '../workers/moonboys-api/deployment-entry.js';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

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
    async first() { return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
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
  f.sql.prepare("INSERT INTO telegram_pet_run_steps (id,run_id,telegram_id,pet_id,step_index,choice_key,choice_type,event_key,success,created_at) VALUES ('step','run',?,?,1,'fight','fight','saved-step',1,'2026-09-26 12:00:00')")
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
