import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getPetVisibleLevel } from '../workers/moonboys-api/pets/progression-phase-2.js';
import engine from '../js/moonpet-practice.js';
import { getPracticeBoard, processPracticeAction, advancePractice } from '../workers/moonboys-api/pets/practice-progression.js';
import { awardPetReward } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { readOwnedRelics, initializeRelicRoute, relicRouteChoices, relicRouteSuccess, relicSearchSalvage } from '../workers/moonboys-api/pets/relic-passives.js';
import { createContractState, contractChoices, advanceContract } from '../workers/moonboys-api/pets/continuing-contracts.js';
import { equipPetStyle } from '../workers/moonboys-api/pets/style-loadout.js';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const now = new Date();
const currentSeason = hooks.getPetSeasonInfo(now).key;
const oldSeason = hooks.getPetSeasonInfo(new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 15))).key;
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
  for (const migration of ['058_telegram_pet_season_completion.sql','061_moonpet_season_economy_calibration.sql']) sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/'+migration, import.meta.url),'utf8'));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() {
      if (db.beforeFirst) {
        const injected = await db.beforeFirst(this);
        if (injected !== undefined) return injected;
      }
      return sql.prepare(this.query).get(...this.args) || null;
    }
    async all() { if (db.beforeAll) return db.beforeAll(this); return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) await db.beforeRun(this); return this.exec(); }
  }
  const db = { beforeBatch: null, beforeFirst: null, beforeRun: null, failReward: false, rejectReward: false, prepare(query) { return new Statement(query); }, async batch(statements) {
    if (this.failReward && statements.some(s => /INSERT OR IGNORE INTO telegram_pet_reward_claims/.test(s.query))) {
      this.failReward = false;
      throw Error('interrupted_terminal_reward');
    }
    if (this.rejectReward && statements.some(s => /INSERT OR IGNORE INTO telegram_pet_reward_claims/.test(s.query))) {
      this.rejectReward = false;
      return statements.map(() => ({ results: [], meta: { changes: 0 } }));
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
  const act = body => hooks.processPetMiniAppAction(db,owner,{id:owner},body,'fixture-token');
  const reveal = id => sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,'elite_moonpet',3,'reveal')").run(id,owner);
  const state = () => hooks.buildPetMiniAppState(db, owner, 'fixture-token');
  const get = async path => { const response = await worker.fetch(new Request('https://moonboys-api.test' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, pet, active, act, reveal, state, get };
}
const petRow=f=>f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get('current-'+f.owner);
const board=f=>getPracticeBoard(f.db,f.owner,petRow(f));
const act=(f,body,when=new Date())=>processPracticeAction(f.db,f.owner,petRow(f),{pet_id:petRow(f).pet_id,...body},awardPetReward,when);
async function start(f,extra={}) {const b=await board(f);return act(f,{action:'practice_start',sequence:b.next_sequence,goal:'survivor',build:'bruiser',...extra});}
async function finish(f,when=new Date()) {
  for(let step=0;step<25;step++) {
    const b=await board(f),r=b.run;
    if(r.status!=='active')return r;
    const c=r.choices.find(c=>c.upgrade)||r.choices.find(c=>c.key==='bold');
    const result=await act(f,{action:'practice_step',run_id:r.run_id,revision:r.revision,choice:c.key},when);
    assert.equal(result.accepted,true,JSON.stringify(result));
  }
  throw Error('practice did not terminate');
}
function safeRolls(t) {t.mock.method(globalThis.crypto,'getRandomValues',arr=>{arr.fill(0);return arr;});}

test('official practice plays a whole circuit, syncs XP and activity, resumes, rejects stale and forged turns',async t=>{
  safeRolls(t);const f=fixture('training-loop');await f.state();
  const before=petRow(f),wallet=f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get();
  assert.equal((await start(f,{score:999999,seed:'client',state:{depth:12},rewards:{pet_xp:99999}})).accepted,true);
  let b=await board(f);assert.equal(b.run.seed,undefined);assert.equal(b.run.depth,0);
  const request={action:'practice_step',pet_id:before.pet_id,run_id:b.run.run_id,revision:0,choice:'bold'};
  const pair=await Promise.all([f.act(request),f.act(request)]);
  assert.equal(pair.filter(r=>r.accepted).length,1,'CAS admits only one concurrent turn');
  assert.equal((await board(f)).run.depth,1);
  assert.equal((await f.act({...request,revision:1,choice:'injected',state:{status:'completed'}})).accepted,false);
  assert.equal((await f.state()).practice.run.depth,1,'state reconstructs saved run');
  const r=await finish(f);assert.equal(r.status,'completed');assert.equal(r.xp_awarded,10);assert.ok(r.rank_points>0);
  assert.equal(petRow(f).pet_xp,before.pet_xp+10);
  assert.equal(petRow(f).energy,before.energy);
  assert.deepEqual(f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get(),wallet);
  assert.equal((await act(f,{action:'practice_claim',run_id:r.run_id})).pet_xp_awarded,0);
  for(const period of ['daily','weekly','seasonal','all_time']) {
    const data=await f.get('/telegram-pets/leaderboard?period='+period);
    assert.equal(data.entries[0].pet_xp,period==='all_time'?210:10,period);
    assert.equal((await hooks.buildPetMiniAppLeaderboard(f.db,f.owner,period,10)).entries[0].pet_xp,data.entries[0].pet_xp);
  }
  assert.ok((await f.get('/telegram-pets/activity')).items.some(row=>row.pet_xp_awarded===10||row.pet_xp===10));
  const events=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='practice_complete'").all();
  assert.equal(events.length,1);assert.equal(events[0].pet_xp_awarded,10);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_practice'").get().n,1);
});

test('practice three daily bonuses are account-wide; records continue and the next UTC day resets',async t=>{
  safeRolls(t);const f=fixture('training-cap');await f.state();
  for(let i=0;i<4;i++){await start(f);const r=await finish(f);assert.equal(r.xp_awarded,i<3?10:0);}
  assert.equal((await board(f)).completed,4);assert.equal((await board(f)).bonus_remaining,0);
  f.pet('second-'+f.owner,currentSeason,200,2);f.active('second-'+f.owner);
  const second=f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get('second-'+f.owner);
  assert.equal((await getPracticeBoard(f.db,f.owner,second)).bonus_remaining,0);
  f.active('current-'+f.owner);
  await start(f);const nextDay=new Date(Date.now()+86400000),r=await finish(f,nextDay);
  assert.equal(r.xp_awarded,10);
});

test('saved practice reward survives failure, pet switch and season rollover; foreign claims are rejected',async t=>{
  safeRolls(t);const f=fixture('training-recovery');await f.state();await start(f);
  f.db.failReward=true;
  const run=await finish(f);assert.equal(run.reward_pending,true);assert.equal(petRow(f).pet_xp,200);
  f.pet('other-'+f.owner,currentSeason,200,2);f.active('other-'+f.owner);
  const current=f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get('other-'+f.owner);
  assert.equal((await getPracticeBoard(f.db,f.owner,current)).pending_rewards.length,1);
  assert.equal((await processPracticeAction(f.db,'foreign',current,{action:'practice_claim',pet_id:petRow(f).pet_id,run_id:run.run_id},awardPetReward)).accepted,false);
  const result=await processPracticeAction(f.db,f.owner,current,{action:'practice_claim',pet_id:petRow(f).pet_id,run_id:run.run_id},awardPetReward,new Date(Date.UTC(now.getUTCFullYear()+1,0,15)));assert.equal(result.pet_xp_awarded,10);
  assert.equal(petRow(f).pet_xp,210);assert.equal(current.pet_xp,200);
});

test('practice capped receipt settles at actual XP and never replays on the next day',async t=>{
  safeRolls(t);const f=fixture('training-global-cap');await f.state();
  f.sql.prepare("INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status) VALUES ('cap',?,?,'run','cap',1200,?,?,?,'accepted')").run(petRow(f).pet_id,f.owner,currentSeason,now.toISOString().slice(0,10),'test');
  await start(f);const r=await finish(f);assert.equal(r.xp_awarded,0);assert.equal(r.reward_pending,false);assert.ok(r.rank_points>0);
  assert.equal((await act(f,{action:'practice_claim',run_id:r.run_id},new Date(Date.now()+86400000))).pet_xp_awarded,0);
});

test('extraction, missed goal, boss failure and hatch gates cannot create practice rewards',async t=>{
  safeRolls(t);const f=fixture('training-gates');await f.state();
  assert.equal((await start(f,{build:['bruiser']})).accepted,false);
  await start(f);
  let b=await board(f);await act(f,{action:'practice_step',run_id:b.run.run_id,revision:0,choice:'extract'});
  assert.equal((await board(f)).bonus_remaining,3);assert.equal(petRow(f).pet_xp,200);
  let s=engine.create('server','scout','collector');s.depth=11;s.salvage=0;
  assert.equal(advancePractice(s,'rest',s.turn,0,0).turn,s.turn,'rest cannot clear the boss');
  assert.equal(advancePractice(s,'safe',s.turn,99,0).status,'failed');
  const miss=advancePractice(s,'safe',s.turn,0,0);assert.equal(miss.status,'completed');assert.equal(engine.goalProgress(miss).completed,false);
  await start(f,{goal:'collector'});
  b=await board(f);
  const saved=JSON.parse(f.sql.prepare('SELECT state_json FROM telegram_pet_practice WHERE run_id=?').get(b.run.run_id).state_json);
  saved.depth=11; saved.salvage=0;
  f.sql.prepare('UPDATE telegram_pet_practice SET state_json=? WHERE run_id=?').run(JSON.stringify(saved),b.run.run_id);
  const missed=await act(f,{action:'practice_step',run_id:b.run.run_id,revision:b.run.revision,choice:'safe'});
  assert.equal(missed.pet_xp_awarded,0);assert.equal((await board(f)).run.status,'failed');
  assert.match((await board(f)).run.last,/goal was missed/);
  f.sql.exec("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg'");
  assert.equal((await board(f)).available,false);assert.equal((await start(f)).accepted,false);
});

test('all four styles equip and remove free, persist per pet, reject unowned/foreign/stale pets',async()=>{
  const f=fixture('style-controls');await f.state();const before=f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get();
  assert.equal((await f.act({action:'style_equip',pet_id:petRow(f).pet_id,cosmetic_key:'profile_frame',enabled:true})).accepted,false);
  for(const key of ['rename_badge','profile_frame','victory_pose','run_trail']) {
    f.sql.prepare('INSERT INTO telegram_pet_cosmetic_unlocks(telegram_id,cosmetic_key,quantity)VALUES(?,?,1)').run(f.owner,key);
    const req={action:'style_equip',pet_id:petRow(f).pet_id,cosmetic_key:key,enabled:true};
    assert.equal((await f.act(req)).accepted,true);assert.equal((await f.act(req)).accepted,true);
    assert.ok((await f.state()).style_loadout.equipped.includes(key));
    assert.equal((await f.act({...req,enabled:false})).accepted,true);
    assert.ok(!(await f.state()).style_loadout.equipped.includes(key));
    await f.act(req);
  }
  assert.deepEqual(f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get(),before);
  f.pet('style-second',currentSeason,200,2);f.active('style-second');
  assert.deepEqual((await f.state()).style_loadout.equipped,[]);
  assert.equal((await f.act({action:'style_equip',pet_id:petRow(f).pet_id,cosmetic_key:'profile_frame',enabled:true})).accepted,false);
  assert.equal((await f.act({action:'style_equip',pet_id:'foreign',cosmetic_key:'profile_frame',enabled:true})).accepted,false);
});

test('Practice and Style mutations fail closed on resolved D1 read failures',async()=>{
  const f=fixture('training-fail-closed'),pet=petRow(f);
  const failFirst=pattern=>{
    f.db.beforeFirst=statement=>{
      if(!pattern.test(statement.query))return undefined;
      f.db.beforeFirst=null;
      return {success:false,error:'simulated D1 outage'};
    };
  };
  failFirst(/SELECT 1 WHERE EXISTS/);
  await assert.rejects(()=>act(f,{action:'practice_start',sequence:1,goal:'survivor',build:'bruiser'}),/pet_state_read_unavailable/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_practice').get().n,0);

  failFirst(/INSERT OR IGNORE INTO telegram_pet_practice/);
  await assert.rejects(()=>act(f,{action:'practice_start',sequence:1,goal:'survivor',build:'bruiser'}),/pet_state_read_unavailable/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_practice').get().n,0,'failed RETURNING result cannot be advertised as a saved run');

  f.sql.prepare(`INSERT INTO telegram_pet_practice
    (run_id,pet_id,telegram_id,season_key,sequence,status,state_json,reward_xp,reward_day)
    VALUES ('saved-practice',?,?,?,?, 'completed',?,10,?)`)
    .run(pet.pet_id,f.owner,pet.season_key,1,JSON.stringify(engine.create('saved','bruiser','survivor')),now.toISOString().slice(0,10));
  failFirst(/SELECT c\.\* FROM telegram_pet_practice/);
  await assert.rejects(()=>act(f,{action:'practice_claim',run_id:'saved-practice'}),/pet_state_read_unavailable/);
  assert.equal(f.sql.prepare("SELECT reward_settled FROM telegram_pet_practice WHERE run_id='saved-practice'").get().reward_settled,0);

  f.sql.prepare("INSERT INTO telegram_pet_cosmetic_unlocks(telegram_id,cosmetic_key,quantity)VALUES(?,'profile_frame',1)").run(f.owner);
  failFirst(/INSERT INTO telegram_pet_style_loadouts/);
  await assert.rejects(()=>equipPetStyle(f.db,f.owner,pet,{pet_id:pet.pet_id,cosmetic_key:'profile_frame',enabled:true}),/pet_state_read_unavailable/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_style_loadouts').get().n,0,'failed style write cannot be reported as equipped');
});

test('all ten relics have effective route mechanics, while empty loadouts preserve old choices',()=>{
  const plain=engine.create('relic','bruiser','survivor');
  const s=initializeRelicRoute(structuredClone(plain),['bitcoin_heart','moon_battery']);assert.equal(s.health,plain.health+18);
  const choices=[{key:'bold',odds:60,damage:20,salvage:10},{key:'search',odds:60,damage:20,salvage:10},{key:'rest',odds:100,damage:0,salvage:0,detail:'Rest.'}];
  assert.deepEqual(relicRouteChoices(plain,choices),choices);
  let mods=relicRouteChoices({relics:['cyber_collar','chain_shield','lucky_coin','infinite_spray_can','hacker_lens']},choices,{graffiti:true});
  assert.equal(mods[0].odds,85);assert.equal(mods[0].damage,18);assert.equal(mods[1].odds,85);assert.equal(mods[3].key,'hidden');
  const ghost={relics:['ghost_tag']};assert.equal(relicRouteSuccess(ghost,false,true),false);assert.equal(relicRouteSuccess(ghost,false,false),true);assert.equal(relicRouteSuccess(ghost,false,false),false);
  assert.equal(relicSearchSalvage({relics:['golden_sticker']},'search',299),30);assert.equal(relicSearchSalvage({relics:['golden_sticker']},'search',300),0);
  const rest=initializeRelicRoute(engine.create('boots','scout','survivor'),['neon_boots']);rest.health=1;
  assert.equal(advancePractice(rest,'rest',rest.turn,0,10000).health,28);
  const contract=initializeRelicRoute(createContractState('scout','bruiser',1,'relics'),['hacker_lens','chain_shield','ghost_tag']);
  assert.ok(contractChoices(contract).some(c=>c.key==='hidden'));
  const advanced=advanceContract(contract,'hidden',99);assert.equal(advanced.state.relic_ghost_used,true);assert.equal(advanced.state.wins,1);
});

test('relic reads fail closed and new drops cannot alter an already saved run',async()=>{
  const f=fixture('relic-snapshot');await f.state();
  f.sql.prepare("INSERT INTO telegram_pet_relics(telegram_id,relic_id,rarity,effects_json)VALUES(?,'bitcoin_heart','rare','{\"start_energy\":9999}')").run(f.owner);
  await start(f);assert.equal((await board(f)).run.max_health,120,'use canonical rules, not stored effects');
  f.sql.prepare("INSERT INTO telegram_pet_relics(telegram_id,relic_id,rarity,effects_json)VALUES(?,'moon_battery','rare','{}')").run(f.owner);
  assert.equal((await board(f)).run.max_health,120,'saved snapshot is immutable');
  f.db.beforeAll=()=>({success:false,error:'outage'});await assert.rejects(()=>readOwnedRelics(f.db,f.owner));
});

test('migration 079 can be applied and rerun without losing saved training or owned styles',async()=>{
  const f=fixture('training-migration');await f.state();await start(f);
  f.sql.prepare("INSERT INTO telegram_pet_cosmetic_unlocks(telegram_id,cosmetic_key,quantity)VALUES(?,'profile_frame',1)").run(f.owner);
  await f.act({action:'style_equip',pet_id:petRow(f).pet_id,cosmetic_key:'profile_frame',enabled:true});
  const migration=fs.readFileSync(new URL('../workers/moonboys-api/migrations/079_moonpet_training_and_style.sql',import.meta.url),'utf8');
  const saved=(await board(f)).run.run_id;
  f.sql.exec(migration);f.sql.exec(migration);
  assert.equal((await board(f)).run.run_id,saved);assert.deepEqual((await f.state()).style_loadout.equipped,['profile_frame']);
  const tables=new DatabaseSync(':memory:');
  tables.exec('CREATE TABLE telegram_pet_instances(pet_id TEXT PRIMARY KEY); CREATE TABLE telegram_pet_season_slots(pet_id TEXT,telegram_id TEXT,season_key TEXT,UNIQUE(pet_id,telegram_id,season_key));');
  tables.exec(migration);tables.exec(migration);
  assert.equal(tables.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN ('telegram_pet_practice','telegram_pet_style_loadouts')").get().n,2);
});
