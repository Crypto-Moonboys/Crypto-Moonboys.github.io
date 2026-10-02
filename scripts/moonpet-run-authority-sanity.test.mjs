import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import deployedWorker from '../workers/moonboys-api/deployment-entry.js';
import { createDailyMoonRun, syncDailyMoonRun, getDailyMoonRunReservation } from '../workers/moonboys-api/pets/daily-moon-run.js';

const currentSeason = hooks.getPetSeasonInfo(new Date()).key;
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
  for (const migration of ['058_telegram_pet_season_completion.sql','061_moonpet_season_economy_calibration.sql']) sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/'+migration, import.meta.url),'utf8'));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { db.statementCount++; if (db.beforeFirst) await db.beforeFirst(this); return sql.prepare(this.query).get(...this.args) || null; }
    async all() { db.statementCount++; if (db.beforeAll) await db.beforeAll(this); return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      db.statementCount++;
      if (sql.prepare(this.query).columns().length && !/\bRETURNING\b/i.test(this.query)) return { results: sql.prepare(this.query).all(...this.args), meta: { changes: 0 } };
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) await db.beforeRun(this); return this.exec(); }
  }
  const db = { statementCount: 0, beforeBatch: null, beforeRun: null, prepare(query) { return new Statement(query); }, async batch(statements) {
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
  const active = (id, season = currentSeason) => {
    sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=?,season_key=? WHERE telegram_id=?').run(id, season, owner);
    const p = sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(id);
    sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=?,equipped_food=?,level=? WHERE telegram_id=?').run(p.pet_xp, p.equipped_food, p.level, owner);
  };
  const act = body => dispatchRenderedPetAction(db,owner,{id:owner},body,'fixture-token');
  const reveal = id => sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,'elite_moonpet',3,'reveal')").run(id,owner);
  const state = () => hooks.buildPetMiniAppState(db, owner, 'fixture-token');
  const get = async path => { const response = await worker.fetch(new Request('https://moonboys-api.test' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, pet, active, act, reveal, state, get };
}

async function dailyFixture(owner) {
  const f=fixture(owner);
  await hooks.getPetProfile(f.db,owner);
  const result=await createDailyMoonRun(f.db,{telegram_id:owner});
  assert.equal(result.accepted,true);
  f.runId=result.daily_run.run_id;
  return f;
}
const runSnapshot=f=>({
  run:f.sql.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(f.runId),
  daily:f.sql.prepare('SELECT * FROM telegram_pet_daily_runs WHERE run_id=?').get(f.runId),
  steps:f.sql.prepare('SELECT * FROM telegram_pet_run_steps WHERE run_id=?').all(f.runId),
  claims:f.sql.prepare('SELECT * FROM telegram_pet_reward_claims WHERE telegram_id=?').all(f.owner),
});
const reservationQuery=q=>q.includes('r.seed AS run_seed') && q.includes('FROM telegram_pet_daily_runs');

for(const surface of ['mini','api']) test(`${surface} ID-less extract uses the active Daily engine and records its ending`,async()=>{
  const f=await dailyFixture(surface==='mini'?'97105':'97106');
  f.sql.prepare('UPDATE telegram_pet_runs SET depth=3,current_room=3 WHERE run_id=?').run(f.runId);
  const body={action:'run_extract',telegram_id:f.owner,request_id:'active-daily',event_key:'active-daily'};
  const invoke=async()=>{
    if(surface==='mini')return f.act(body);
    const response=await deployedWorker.fetch(new Request('https://moonboys.test/telegram-pets/action',{
      method:'POST',headers:{'Content-Type':'application/json','X-Pets-Bot-Secret':'fixture-secret'},body:JSON.stringify(body),
    }),{DB:f.db,TELEGRAM_PETS_BOT_SECRET:'fixture-secret'});
    return response.json();
  };
  const result=await invoke(); assert.equal(result.accepted,true);
  assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_daily_runs WHERE run_id=?').get(f.runId).status,'extracted');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_run_legacy'").get().n,0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='daily_moon_run' AND reason='daily_moon_run_extracted'").get().n,1);
});

for (const surface of ['mini','api']) for (const action of ['run_step','run_extract']) test(`${surface} ${action} must not fall back to Standard Run after a failed Daily reservation read`,async()=>{
  const f=await dailyFixture(surface==='mini'?(action==='run_step'?'97101':'97102'):(action==='run_step'?'97103':'97104'));
  f.sql.prepare('UPDATE telegram_pet_runs SET depth=3,current_room=3,unbanked_pet_xp=12 WHERE run_id=?').run(f.runId);
  const before=runSnapshot(f);
  f.db.beforeFirst=s=>{if(reservationQuery(s.query))throw Error('daily_reservation_unavailable');};
  const body={action,run_id:f.runId,choice_key:'fight',expected_step_index:3,request_id:'routing-failure',event_key:'routing-failure',telegram_id:f.owner};
  if(surface==='mini') await assert.rejects(f.act(body),/daily_reservation_unavailable/);
  else {
    await assert.rejects(deployedWorker.fetch(new Request('https://moonboys.test/telegram-pets/action',{
      method:'POST',headers:{'Content-Type':'application/json','X-Pets-Bot-Secret':'fixture-secret'},body:JSON.stringify(body),
    }),{DB:f.db,TELEGRAM_PETS_BOT_SECRET:'fixture-secret'}),/daily_reservation_unavailable/);
  }
  assert.deepEqual(runSnapshot(f),before,'classification failure must not resolve a room or close/pay the run');
  f.db.beforeFirst=null;
  const restored=await f.state();
  assert.equal(restored.run.daily,true);
});

for(const [label,method,match] of [
  ['Daily reservation','beforeFirst',reservationQuery],
  ['saved Daily room','beforeFirst',q=>q.includes('SELECT room_number, room_type, status, generated_data')],
]) test(`${label} read outage must preserve the previous state instead of changing the run board`,async()=>{
  const f=await dailyFixture('view-'+label.replaceAll(' ','-'));
  const before=await f.state(); assert.equal(before.run.daily,true);
  f.db[method]=s=>{if(match(s.query))throw Error('daily_board_unavailable');};
  await assert.rejects(f.state(),/daily_board_unavailable/);
  f.db[method]=null;
  const after=await f.state(); assert.deepEqual(after.run.choices,before.run.choices);
});

test('refresh repairs a reserved Daily Run whose first room never finished saving',async()=>{
  const f=await dailyFixture('missing-first-room');
  const saved=f.sql.prepare('SELECT * FROM telegram_pet_run_rooms WHERE run_id=?').get(f.runId);
  f.sql.prepare('DELETE FROM telegram_pet_run_rooms WHERE run_id=?').run(f.runId);
  const before=runSnapshot(f);
  const state=await f.state();
  assert.equal(state.run.daily,true);
  assert.ok(state.run.choices.length>0,'the reserved run must not strand its player on an empty board');
  const restored=f.sql.prepare('SELECT * FROM telegram_pet_run_rooms WHERE run_id=?').get(f.runId);
  assert.equal(restored.generated_data,saved.generated_data,'repair reuses the saved seed and room index');
  assert.deepEqual(runSnapshot(f),before,'repair does not advance, settle or reroll the run');
  await f.state();
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_run_rooms WHERE run_id=?').get(f.runId).n,1);
});

for(const path of ['resume','step','extract']) for(const explicit of [true,false]) test(`legacy ${path} cannot operate on an official Daily Run (${explicit?'explicit':'active'} ID)`,async()=>{
  const f=await dailyFixture('legacy-'+path+'-'+explicit);
  f.sql.prepare('UPDATE telegram_pet_runs SET depth=3,current_room=3,unbanked_pet_xp=12 WHERE run_id=?').run(f.runId);
  const before=runSnapshot(f),id=explicit?f.runId:'';
  const result=path==='resume'?await hooks.startOrResumePetRun(f.db,f.owner,{run_id:id}):path==='step'
    ?await hooks.processPetRunStep(f.db,f.owner,id,'fight',{event_key:'legacy-step'})
    :await hooks.processPetRunExtract(f.db,f.owner,id);
  assert.equal(result.accepted,false);
  assert.equal(result.reason,'daily_run_requires_mini_app');
  assert.deepEqual(runSnapshot(f),before);
});

for(const [label,method,match] of [
  ['boss victory','beforeFirst',q=>q.includes('SELECT 1 AS defeated FROM telegram_pet_run_analytics')],
  ['resolved rooms','beforeAll',q=>q.includes('SELECT room_id, room_number, room_type, status, generated_data, outcome_data')],
  ['leaderboard record','beforeFirst',q=>q.includes('SELECT * FROM telegram_pet_daily_leaderboard_records')],
  ['streak history','beforeAll',q=>q.includes('SELECT utc_day, status FROM telegram_pet_daily_runs')],
]) test(`failed ${label} lookup cannot permanently finalize incomplete Daily records`,async()=>{
  const f=await dailyFixture('records-'+label.replaceAll(' ','-'));
  f.sql.prepare("UPDATE telegram_pet_runs SET status='completed',current_room=10,depth=10,rooms_completed=10,score=900,completed_at=CURRENT_TIMESTAMP WHERE run_id=?").run(f.runId);
  f.sql.prepare("INSERT INTO telegram_pet_run_analytics (analytics_id,run_id,telegram_id,event_type,event_data) VALUES (?,?,?,'boss_fought',?)")
    .run(f.runId+':boss:win',f.runId,f.owner,JSON.stringify({boss_id:'alley_king',outcome:'win'}));
  f.sql.prepare("UPDATE telegram_pet_run_rooms SET status='resolved',outcome_data=? WHERE run_id=?").run(JSON.stringify({success:true}),f.runId);
  f.db[method]=s=>{if(match(s.query))throw Error('daily_evidence_unavailable');};
  await assert.rejects(syncDailyMoonRun(f.db,{telegram_id:f.owner,run_id:f.runId}),/daily_evidence_unavailable/);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_daily_analytics WHERE event_type='run_terminal'").get().n,0);
  f.db[method]=null;
  await syncDailyMoonRun(f.db,{telegram_id:f.owner,run_id:f.runId});
  const records=f.sql.prepare('SELECT boss_completions,runs_recorded FROM telegram_pet_daily_leaderboard_records WHERE telegram_id=?').get(f.owner);
  assert.deepEqual({...records},{boss_completions:1,runs_recorded:1});
  assert.equal(f.sql.prepare("SELECT boss_defeated FROM telegram_pet_daily_runs WHERE run_id=?").get(f.runId).boss_defeated,1);
  await syncDailyMoonRun(f.db,{telegram_id:f.owner,run_id:f.runId});
  assert.deepEqual(f.sql.prepare('SELECT boss_completions,runs_recorded FROM telegram_pet_daily_leaderboard_records WHERE telegram_id=?').get(f.owner),records);
});

for (const phase of ['reservation','creation receipt','condition']) test(`refresh finishes Daily initialization after interrupted ${phase}`, async()=>{
  const f=fixture('start-'+phase.replaceAll(' ','-'));
  await hooks.getPetProfile(f.db,f.owner);
  f.db.beforeBatch=statements=>{
    const match=phase==='reservation' ? 'INSERT OR IGNORE INTO telegram_pet_daily_runs'
      :phase==='creation receipt' ? 'INSERT OR IGNORE INTO telegram_pet_daily_analytics' : "'modifier_chosen'";
    if(statements.some(s=>s.query.includes(match)))throw Error('start_interrupted');
  };
  await assert.rejects(createDailyMoonRun(f.db,{telegram_id:f.owner}),/start_interrupted/);
  f.db.beforeBatch=null;
  const saved=f.sql.prepare('SELECT * FROM telegram_pet_runs WHERE telegram_id=?').get(f.owner);
  assert.ok(saved,'canonical run saved before the interruption');
  f.runId=saved.run_id;
  const state=await f.state();
  assert.equal(state.run.daily,true,'Daily start must not display Standard controls');
  assert.equal(state.daily_run.attempted,true,'daily summary must agree with the restored board');
  assert.ok(state.run.choices.length>0);
  assert.equal(state.run.tactics.conditions.length,1,'daily condition cannot disappear after a partial start');
  assert.equal(state.run.tactics.rules_version,2);
  const first=runSnapshot(f);
  await f.state();
  assert.deepEqual(runSnapshot(f),first,'refresh cannot spend or pay/advance a second time');
});

async function interruptedStart(f, now) {
  await hooks.getPetProfile(f.db,f.owner);
  f.db.beforeBatch=statements=>{if(statements.some(s=>s.query.includes('INSERT OR IGNORE INTO telegram_pet_daily_runs')))throw Error('start_interrupted');};
  await assert.rejects(createDailyMoonRun(f.db,{telegram_id:f.owner,now}),/start_interrupted/);
  f.db.beforeBatch=null;
  f.runId=f.sql.prepare('SELECT run_id FROM telegram_pet_runs WHERE telegram_id=?').get(f.owner).run_id;
}

test('interrupted Daily start stays on its source pet and date across a season change',async()=>{
  const f=fixture('old-daily-start');
  const oldDate=new Date(Date.UTC(new Date().getUTCFullYear()-1,0,15,23,59));
  const oldSeason=hooks.getPetSeasonInfo(oldDate).key;
  f.pet('old-daily-pet',oldSeason,300); f.active('old-daily-pet',oldSeason);
  await interruptedStart(f,oldDate);
  f.sql.prepare("UPDATE telegram_pet_instances SET status='archived' WHERE pet_id='old-daily-pet'").run();
  f.sql.prepare("UPDATE telegram_pet_season_slots SET status='archived' WHERE pet_id='old-daily-pet'").run();
  f.active('current-'+f.owner);
  const before=f.sql.prepare('SELECT pet_id,pet_xp FROM telegram_pet_instances ORDER BY pet_id').all();
  const state=await f.state();
  assert.equal(state.pet.pet_id,'current-'+f.owner);
  assert.equal(state.run.daily,true);
  const daily=f.sql.prepare('SELECT * FROM telegram_pet_daily_runs WHERE run_id=?').get(f.runId);
  assert.equal(daily.pet_id,'old-daily-pet');
  assert.equal(daily.utc_day,oldDate.toISOString().slice(0,10));
  assert.equal(state.daily_run.attempted,false,'yesterday/older reservation is not a new attempt today');
  assert.equal(state.daily_run.available,false,'the saved run still occupies the active run slot');
  assert.deepEqual(f.sql.prepare('SELECT pet_id,pet_xp FROM telegram_pet_instances ORDER BY pet_id').all(),before);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source LIKE 'roguelite_%' OR source='pet_run_legacy'").get().n,0);
});

test('overlapping refreshes repair one Daily start with one room and condition',async()=>{
  const f=fixture('overlap-daily-start'); await interruptedStart(f);
  const states=await Promise.all([f.state(),f.state()]);
  for(const state of states){assert.equal(state.run.daily,true);assert.equal(state.run.tactics.conditions.length,1);}
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_daily_runs').get().n,1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_run_rooms').get().n,1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_daily_analytics WHERE event_type='run_created'").get().n,1);
});

test('an action can repair a Daily start without a preceding Refresh',async()=>{
  const f=fixture('action-daily-start'); await interruptedStart(f);
  const result=await f.act({action:'run_step',choice_key:'search',expected_step_index:0,request_id:'repaired-step'});
  assert.equal(result.accepted,true);
  assert.match(result.reason,/daily_room_(resolved|failed)/);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_run_legacy'").get().n,0);
});

test('Daily setup outage propagates until the same saved attempt can recover',async()=>{
  const f=fixture('retry-daily-start'); await interruptedStart(f);
  const before=runSnapshot(f);
  f.db.beforeBatch=statements=>{if(statements.some(s=>s.query.includes('INSERT OR IGNORE INTO telegram_pet_daily_runs')))throw Error('still_unavailable');};
  await assert.rejects(f.state(),/still_unavailable/);
  assert.deepEqual(runSnapshot(f),before);
  f.db.beforeBatch=null;
  assert.equal((await f.state()).run.daily,true);
});

test('restoring a saved legacy Daily condition does not upgrade its existing rules or reroll the room',async()=>{
  const f=await dailyFixture('legacy-condition');
  f.sql.prepare('DELETE FROM telegram_pet_run_modifiers WHERE run_id=?').run(f.runId);
  f.sql.prepare("UPDATE telegram_pet_daily_analytics SET event_data=json_set(event_data,'$.modifier_id','double_loot') WHERE event_type='run_created'").run();
  const room=f.sql.prepare('SELECT * FROM telegram_pet_run_rooms WHERE run_id=?').get(f.runId);
  const state=await f.state();
  assert.equal(state.run.tactics.rules_version,1);
  assert.equal(state.run.tactics.conditions[0].key,'double_loot');
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_run_rooms WHERE run_id=?').get(f.runId),room);
});

for(const corruption of ['seed','source receipt','owner','played room']) test(`Daily start recovery rejects invalid ${corruption} evidence`,async()=>{
  const f=fixture('invalid-start-'+corruption.replaceAll(' ','-')); await interruptedStart(f);
  if(corruption==='seed')f.sql.prepare('UPDATE telegram_pet_runs SET seed=seed+1 WHERE run_id=?').run(f.runId);
  if(corruption==='source receipt')f.sql.prepare("DELETE FROM telegram_pet_run_analytics WHERE event_type='run_start'").run();
  if(corruption==='owner'){
    f.sql.exec('PRAGMA foreign_keys=OFF');
    f.sql.prepare("UPDATE telegram_pet_instances SET telegram_id='other' WHERE pet_id=?").run('current-'+f.owner);
  }
  if(corruption==='played room')f.sql.prepare(`INSERT INTO telegram_pet_run_rooms (room_id,pet_id,run_id,telegram_id,room_number,room_type,status,generated_data,outcome_data)
    VALUES (?,?,?,?,1,'choice_event','resolved','{}','{"success":true}')`).run(f.runId+':room:1','current-'+f.owner,f.runId,f.owner);
  const before=runSnapshot(f);
  await assert.rejects(getDailyMoonRunReservation(f.db,{telegram_id:f.owner,run_id:f.runId}),/daily_run_start_unavailable/);
  assert.deepEqual(runSnapshot(f),before,'no inferred reservation or payout without intact source evidence');
});

for(const surface of ['mini','api']) test(`${surface} lifecycle outage cannot bypass the hatch gate and start a Daily Run`,async()=>{
  const f=fixture(surface==='mini'?'97201':'97202');
  await hooks.getPetProfile(f.db,f.owner);
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE telegram_id=?").run(f.owner);
  f.db.beforeFirst=s=>{if(s.query.includes('SELECT l.*, s.season_key'))throw Error('hatch_authority_unavailable');};
  const body={action:'daily_run_start',telegram_id:f.owner,request_id:'egg-start'};
  if(surface==='mini')await assert.rejects(f.act(body),/hatch_authority_unavailable/);
  else await assert.rejects(deployedWorker.fetch(new Request('https://moonboys.test/telegram-pets/action',{
    method:'POST',headers:{'Content-Type':'application/json','X-Pets-Bot-Secret':'fixture-secret'},body:JSON.stringify(body),
  }),{DB:f.db,TELEGRAM_PETS_BOT_SECRET:'fixture-secret'}),/hatch_authority_unavailable/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_runs').get().n,0);
  f.db.beforeFirst=null;
  const denied=await f.act(body);
  assert.equal(denied.accepted,false);assert.equal(denied.reason,'moon_egg_must_hatch');
});
