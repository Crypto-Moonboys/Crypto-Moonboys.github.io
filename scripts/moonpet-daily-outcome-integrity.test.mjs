import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { syncDailyMoonRun, __dailyMoonRunTestHooks as dailyHooks } from '../workers/moonboys-api/pets/daily-moon-run.js';
import { previewDailyChoice, readDailyModifiers } from '../workers/moonboys-api/pets/daily-run-tactics.js';
import { readPetInstanceWithAtomicCareDecay } from '../workers/moonboys-api/pets/care-decay.js';

const fixedTime = Date.parse('2026-10-02T12:00:00Z');
const currentSeason = hooks.getPetSeasonInfo(new Date(fixedTime)).key;
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.function('current_timestamp', () => new Date().toISOString().slice(0,19).replace('T',' '));
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
  for (const migration of ['058_telegram_pet_season_completion.sql','061_moonpet_season_economy_calibration.sql']) sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/'+migration, import.meta.url),'utf8'));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { db.statementCount++; if (db.beforeFirst) { const reply = await db.beforeFirst(this); if (reply !== undefined) return reply; } return sql.prepare(this.query).get(...this.args) || null; }
    async all() { db.statementCount++; if (db.beforeAll) { const reply = await db.beforeAll(this); if (reply !== undefined) return reply; } return { results: sql.prepare(this.query).all(...this.args) }; }
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
    if (this.beforeBatch) { const reply = await this.beforeBatch(statements); if (reply !== undefined) return reply; }
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
  const state = () => hooks.buildPetMiniAppState(db, owner, 'fixture-token');
  return { sql, db, owner, pet, active, act, state };
}

test.beforeEach(() => test.mock.timers.enable({ apis: ['Date'], now: fixedTime }));
test.afterEach(() => test.mock.timers.reset());
const savedOutcome = (f,run,room=1) => JSON.parse(f.sql.prepare('SELECT outcome_data FROM telegram_pet_run_rooms WHERE run_id=? AND room_number=?').get(run,room).outcome_data);
function care(f, id, values={}) {
  const v={hunger:0,health:100,energy:100,happiness:100,cleanliness:100,last_decay_at:new Date().toISOString(),...values};
  f.sql.prepare('UPDATE telegram_pet_instances SET hunger=?,health=?,energy=?,happiness=?,cleanliness=?,last_decay_at=? WHERE pet_id=?')
    .run(v.hunger,v.health,v.energy,v.happiness,v.cleanliness,v.last_decay_at,id);
  if(f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner).pet_id===id)
    f.sql.prepare('UPDATE telegram_pet_profiles SET hunger=?,health=?,energy=?,happiness=?,cleanliness=?,last_decay_at=? WHERE telegram_id=?')
      .run(v.hunger,v.health,v.energy,v.happiness,v.cleanliness,v.last_decay_at,f.owner);
}
const start = async f => { const r=await f.act({action:'daily_run_start',request_id:'start'}); assert.equal(r.accepted,true); return r; };
const combatCount = (f,id='current-'+f.owner) => f.sql.prepare("SELECT COALESCE(SUM(progress_value),0) n FROM telegram_pet_daily_journey_objectives WHERE pet_id=? AND challenge_id='daily_combat'").get(id).n;

test('Daily room resolution persists 48-hour care decay and agrees with the displayed losing chance', async()=>{
  const f=fixture('daily-decay-fixed'), id='current-'+f.owner;
  f.pet('decay-other',currentSeason,200,2); f.pet('decay-third',currentSeason,300,3);
  await f.state(); const started=await start(f), run=started.daily_run.run_id;
  care(f,id,{last_decay_at:new Date(fixedTime-48*3600000).toISOString()});
  const beforeOthers=f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id<>? ORDER BY pet_id').all(id);
  const shown=await f.state(); const preview=shown.run.choices.find(c=>c.key==='fight'); assert.equal(preview.success_chance_bps,7360);
  const result=await f.act({action:'run_step',run_id:run,choice_key:'fight',expected_step_index:0,request_id:'fight'});
  const outcome=savedOutcome(f,run);
  assert.equal(result.reason,'daily_room_failed'); assert.equal(outcome.success,false); assert.equal(outcome.score,0);
  assert.equal(outcome.risk_roll_bps,7476); assert.equal(outcome.success_chance_bps,preview.success_chance_bps);
  assert.deepEqual(outcome.player_state,{pet_id:id,season_key:currentSeason,level:3,health:0,energy:0,happiness:0,cleanliness:0});
  assert.equal(f.sql.prepare('SELECT score FROM telegram_pet_runs WHERE run_id=?').get(run).score,0);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id<>? ORDER BY pet_id').all(id),beforeOthers);
  await f.act({action:'run_step',run_id:run,choice_key:'search',expected_step_index:0,request_id:'retry'});
  assert.deepEqual(savedOutcome(f,run),outcome,'a retry cannot reroll after care or another selected pet');
});

test('Daily outcome rejects a concurrent source-care change and retries from the new snapshot',async()=>{
  const f=fixture('daily-care-race'), id='current-'+f.owner; await f.state(); const started=await start(f), run=started.daily_run.run_id;
  care(f,id,{hunger:80,health:55,energy:30,happiness:60,cleanliness:70});
  let acceptedCare;
  f.db.beforeFirst=async s=>{if(!s.query.startsWith('UPDATE telegram_pet_run_rooms SET status'))return;
    f.db.beforeFirst=null; acceptedCare=await hooks.processPetAction(f.db,f.owner,'feed',{event_key:'concurrent-care'});
  };
  const move={action:'run_step',run_id:run,choice_key:'explore',expected_step_index:0,request_id:'old-snapshot'};
  const rejected=await f.act(move); assert.equal(acceptedCare.accepted,true);
  assert.equal(rejected.accepted,false); assert.equal(rejected.reason,'daily_run_pet_state_changed'); assert.equal(rejected.refresh_state,true);
  assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_run_rooms WHERE room_id=?').get(started.room.room_id).status,'pending');
  const afterCare=f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(id);
  const retry=await f.act({...move,request_id:'new-snapshot'}); assert.equal(retry.accepted,true);
  assert.equal(savedOutcome(f,run).player_state.health,afterCare.health);
  assert.equal(savedOutcome(f,run).player_state.energy,afterCare.energy);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_key='concurrent-care'").get().n,1);
});

test('Daily resolution and its retry retain the original source during A to B to A switching',async()=>{
  const f=fixture('daily-source-race'), id='current-'+f.owner; f.pet('source-other',currentSeason,200,2); f.pet('source-third',currentSeason,300,3);
  await f.state(); const started=await start(f); care(f,id,{last_decay_at:new Date(fixedTime-48*3600000).toISOString()});
  const otherBefore=f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get('source-other');
  let switched=false;
  f.db.beforeFirst=s=>{if(!s.query.startsWith('UPDATE telegram_pet_run_rooms SET status'))return; f.db.beforeFirst=null; f.active('source-other'); switched=true;};
  const move={action:'run_step',run_id:started.daily_run.run_id,choice_key:'fight',expected_step_index:0,request_id:'source'};
  const result=await f.act(move); assert.equal(switched,true); assert.equal(result.reason,'daily_room_failed');
  assert.equal(savedOutcome(f,started.daily_run.run_id).player_state.pet_id,id);
  assert.equal(savedOutcome(f,started.daily_run.run_id).player_state.energy,0);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get('source-other'),otherBefore);
  f.active(id); await f.act({...move,request_id:'source-retry'});
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_run_rooms WHERE run_id=?').get(started.daily_run.run_id).n,1);
});

test('atomic care decay cannot erase care committed after its read and cannot use another ownership tuple',async()=>{
  const f=fixture('daily-atomic-care'), id='current-'+f.owner;
  care(f,id,{last_decay_at:new Date(fixedTime-48*3600000).toISOString()});
  let changed=false;
  f.db.beforeRun=s=>{if(!s.query.startsWith('UPDATE telegram_pet_instances'))return; f.db.beforeRun=null; changed=true; care(f,id,{energy:77,happiness:66,cleanliness:55,health:74});};
  const current=await readPetInstanceWithAtomicCareDecay(f.db,{pet_id:id,telegram_id:f.owner,season_key:currentSeason});
  assert.equal(changed,true); assert.equal(current.energy,77); assert.equal(current.health,74);
  assert.equal(await readPetInstanceWithAtomicCareDecay(f.db,{pet_id:id,telegram_id:'foreign',season_key:currentSeason}),null);
  assert.equal(await readPetInstanceWithAtomicCareDecay(f.db,{pet_id:id,telegram_id:f.owner,season_key:'pet-s2025-001'}),null);
});

test('a Daily run resumed after quarter rollover decays its saved permanent pet without changing ownership',async()=>{
  test.mock.timers.setTime(Date.parse('2026-09-30T12:00:00Z'));
  const f=fixture('daily-quarter-source'), source='previous-quarter', sourceSeason='pet-s2026-003';
  f.pet(source,sourceSeason,200,2); f.pet('third-quarter-source',currentSeason,300,3);
  f.active(source,sourceSeason); care(f,source); const started=await start(f);
  test.mock.timers.setTime(fixedTime);
  f.db.beforeFirst=s=>{if(!s.query.startsWith('UPDATE telegram_pet_run_rooms SET status'))return; f.db.beforeFirst=null; f.active('current-'+f.owner);};
  const result=await f.act({action:'run_step',run_id:started.daily_run.run_id,choice_key:'explore',expected_step_index:0,request_id:'rollover'});
  assert.equal(result.accepted,true);
  const outcome=savedOutcome(f,started.daily_run.run_id);
  assert.equal(outcome.player_state.pet_id,source); assert.equal(outcome.player_state.season_key,sourceSeason); assert.equal(outcome.player_state.energy,0);
  assert.equal(f.sql.prepare('SELECT season_key FROM telegram_pet_instances WHERE pet_id=?').get(source).season_key,sourceSeason);
  assert.equal(f.sql.prepare('SELECT utc_day FROM telegram_pet_daily_runs WHERE run_id=?').get(started.daily_run.run_id).utc_day,'2026-09-30');
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get('third-quarter-source').energy,100);
});

async function completeEnemyRooms(f, combat) {
  const id='current-'+f.owner;
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=392040,level=100 WHERE pet_id=?').run(id);
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=392040,level=100 WHERE telegram_id=?').run(f.owner);
  care(f,id); const started=await start(f); const counted=[];
  for(let step=0;step<9;step++) {
    const run=f.sql.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(started.daily_run.run_id);
    const room=hooks.generatePetRunRoom(run), pet=f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(id), modifiers=await readDailyModifiers(f.db,run);
    const enemyRoom=['battle','elite'].includes(room.room_type);
    const wanted=combat?{rival_encounter:'challenge',police_heat:'confront',elite_encounter:'fight',drone_enforcer:'elite',subway_champion:'fight'}[room.content_id]:room.choices.find(c=>['escape','sneak_past','sneak'].includes(c.choice_id))?.choice_id;
    const choice=room.choices.find(c=>c.choice_id===wanted)||[...room.choices].sort((a,b)=>previewDailyChoice(pet,room,b.choice_id,modifiers).success_chance_bps-previewDailyChoice(pet,room,a.choice_id,modifiers).success_chance_bps)[0];
    const result=await f.act({action:'run_step',run_id:run.run_id,choice_key:choice.choice_id,expected_step_index:step,request_id:'step-'+step});
    assert.equal(result.accepted,true); assert.equal(result.reason,'daily_room_resolved',JSON.stringify(result));
    if(enemyRoom) { counted.push(combatCount(f)); assert.equal(savedOutcome(f,run.run_id,step+1).enemy_defeated,combat); }
  }
  return {started,counted};
}

test('three real evasions never grant Defeat 3 enemies progress, including recovery and retries',async()=>{
  test.mock.timers.setTime(Date.parse('2026-10-03T12:00:00Z'));
  const f=fixture('daily-evasion'); const {started,counted}=await completeEnemyRooms(f,false);
  assert.deepEqual(counted,[0,0,0]); const rooms=f.sql.prepare('SELECT * FROM telegram_pet_run_rooms WHERE run_id=? ORDER BY room_number').all(started.daily_run.run_id);
  await syncDailyMoonRun(f.db,{telegram_id:f.owner,run_id:started.daily_run.run_id});
  await syncDailyMoonRun(f.db,{telegram_id:f.owner,run_id:started.daily_run.run_id});
  assert.equal(combatCount(f),0); assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_run_rooms WHERE run_id=? ORDER BY room_number').all(started.daily_run.run_id),rooms);
});

test('three real combat victories count once and stay with the original pet on recovery',async()=>{
  test.mock.timers.setTime(Date.parse('2026-10-03T12:00:00Z'));
  const f=fixture('daily-combat'); f.pet('combat-other',currentSeason,200,2);
  const {started,counted}=await completeEnemyRooms(f,true); assert.deepEqual(counted,[1,2,3]);
  f.active('combat-other'); await syncDailyMoonRun(f.db,{telegram_id:f.owner,run_id:started.daily_run.run_id});
  await syncDailyMoonRun(f.db,{telegram_id:f.owner,run_id:started.daily_run.run_id});
  assert.equal(combatCount(f),3); assert.equal(combatCount(f,'combat-other'),0);
});

for(const kind of ['combat','escape','unknown','failed']) test(`legacy ${kind} room evidence is handled conservatively without rewriting history`,async()=>{
  const f=fixture('daily-legacy-'+kind), id='current-'+f.owner; const started=await start(f), run=started.daily_run.run_id;
  const choice=kind==='combat'?'challenge':kind==='escape'?'sneak_past':undefined;
  const generated={content_id:'rival_encounter',enemy_id:'rival_moonpet',choices:[{choice_id:'challenge'},{choice_id:'sneak_past'}]};
  const outcome={success:kind!=='failed',...(choice?{choice_id:choice}:{})};
  f.sql.prepare("INSERT INTO telegram_pet_run_rooms (room_id,pet_id,run_id,telegram_id,room_number,room_type,status,generated_data,outcome_data) VALUES (?,?,?,?,3,'battle','resolved',?,?)")
    .run(run+':legacy',id,run,f.owner,JSON.stringify(generated),JSON.stringify(outcome));
  f.sql.prepare('UPDATE telegram_pet_runs SET current_room=3,depth=3 WHERE run_id=?').run(run);
  if(kind==='escape') await dailyHooks.recordChallengeEvidence(f.db,{telegram_id:f.owner,pet_id:id,season_key:currentSeason,utc_day:'2026-10-02',challenge_id:'daily_combat',event_key:'retained-historical-escape',progress_value:1,evidence:{legacy:true}});
  const historical=f.sql.prepare('SELECT * FROM telegram_pet_run_rooms WHERE room_id=?').get(run+':legacy');
  await syncDailyMoonRun(f.db,{telegram_id:f.owner,run_id:run}); await syncDailyMoonRun(f.db,{telegram_id:f.owner,run_id:run});
  assert.equal(combatCount(f),['combat','escape'].includes(kind)?1:0);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_run_rooms WHERE room_id=?').get(run+':legacy'),historical);
  if(kind==='escape') assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_daily_journey_objectives WHERE event_key='retained-historical-escape'").get().n,1);
});
