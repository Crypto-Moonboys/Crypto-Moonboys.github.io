#!/usr/bin/env node
/**
 * Moonpet virtual-player engine smoke/attendance harness.
 * Runs production Moonpet action dispatch through in-memory SQLite.
 * NEVER connects to production D1, Telegram, or real accounts.
 *
 * Usage: node --test scripts/moonpet-virtual-player-engine.test.mjs
 * Extend to full 365-day / 10k-player campaigns only after this real-action
 * fixture, clock parity, and throughput have been verified.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';

const UTC_BASE = Date.parse('2026-11-01T08:00:00.000Z');
const DAY_MS = 86_400_000;
const DAY = ['feed', 'play', 'clean'];
const SQL_FILES = [
  'schema.sql',
  'migrations/048_telegram_pet_player_expansion.sql',
  'migrations/058_telegram_pet_season_completion.sql',
  'migrations/061_moonpet_season_economy_calibration.sql',
];

function makeFixture(now) {
  const storage = new DatabaseSync(':memory:');
  const timestamp = () => new Date(now()).toISOString().replace('T',' ').slice(0,19);
  const clockSql = sql => sql
    .replace(/\bCURRENT_TIMESTAMP\b/g, "'" + timestamp() + "'")
    .replace(/'now'/g, "'" + timestamp() + "'");
  const sql = {
    prepare(query) { return storage.prepare(clockSql(query)); },
    exec(query) { return storage.exec(clockSql(query)); },
  };
  for (const file of SQL_FILES) sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/' + file, import.meta.url), 'utf8'));

  class Statement {
    constructor(query,args=[]) { this.query=query; this.args=args; }
    bind(...args) { return new Statement(this.query,args); }
    async first() { return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return {success:true,results:sql.prepare(this.query).all(...this.args)}; }
    exec() {
      const statement=sql.prepare(this.query);
      if (statement.columns().length) {
        const results=statement.all(...this.args);
        return {success:true,results,meta:{changes:/\bRETURNING\b/i.test(this.query)?results.length:0}};
      }
      const result=statement.run(...this.args);
      return {success:true,results:[],meta:{changes:Number(result.changes)}};
    }
    async run() { return this.exec(); }
  }
  const db={
    prepare(query){return new Statement(query);},
    async batch(statements){
      sql.exec('BEGIN IMMEDIATE');
      try{
        const result=statements.map(statement=>statement.exec());
        sql.exec('COMMIT');
        return result;
      }catch(error){sql.exec('ROLLBACK');throw error;}
    },
  };
  function createPlayer(owner){
    sql.prepare('INSERT INTO telegram_users(telegram_id,first_name,xp,level) VALUES (?,?,0,1)').run(owner,owner);
    sql.prepare('INSERT INTO telegram_pet_profiles(telegram_id,pet_xp,energy) VALUES (?,200,100)').run(owner);
    sql.prepare("INSERT OR IGNORE INTO telegram_seasons(name,start_date,end_date) VALUES ('Community','2000-01-01','2999-01-01')").run();
    const season=hooks.getPetSeasonInfo(new Date(now())).key,petId='virtual-'+owner;
    sql.prepare("INSERT INTO telegram_pet_season_slots(pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,1,'free')").run(petId,owner,season);
    sql.prepare("INSERT INTO telegram_pet_instances(pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at) VALUES (?,?,?,1,200,100,'0001-01-01 00:00:00')").run(petId,owner,season);
    sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet(pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,'young','vinyl_crab','{}','[]')").run(petId,owner,petId);
    sql.prepare("INSERT INTO telegram_pet_active_slots(telegram_id,pet_id,season_key) VALUES (?,?,?)").run(owner,petId,season);
    return {owner,petId};
  }
  const accepted = owner => sql.prepare("SELECT event_type, created_at, pet_xp_awarded FROM telegram_pet_events WHERE telegram_id=? AND status='accepted' ORDER BY created_at,id").all(owner);
  const action = (owner,kind,payload={}) => dispatchRenderedPetAction(db,owner,{id:owner},{action:kind,...payload},'fixture-token');
  return {sql,db,storage,createPlayer,accepted,action,close:()=>storage.close()};
}

test('virtual UTC days execute real accepted care and cooldown enforcement',async t=>{
  // Use the same fake JS time for Worker timestamps and SQLite clock functions.
  t.mock.timers.enable({apis:['Date'],now:UTC_BASE});
  const f=makeFixture(()=>Date.now());
  try {
    const p=f.createPlayer('virtual-regular');
    const rows=[];
    for(let day=0;day<7;day++){
      t.mock.timers.setTime(UTC_BASE+day*DAY_MS);
      let completed=0;
      for(const care of DAY){
        const result=await f.action(p.owner,care);
        assert.equal(result.accepted,true,JSON.stringify({day,care,result}));
        completed++;
        // Human can complete a different action immediately, but a duplicate
        // of the SAME action inside its 45-second cooldown must be rejected.
        const repeat=await f.action(p.owner,care);
        assert.equal(repeat.accepted,false,'cooldown must reject duplicate same-action care');
      }
      rows.push({day:day+1,completed});
    }
    assert.equal(rows.length,7);
    assert.ok(rows.every(row=>row.completed===3));
    const accepted=f.accepted(p.owner).filter(row=>DAY.includes(row.event_type));
    assert.equal(accepted.length,21,'only accepted care receipts count, not button attempts');
    assert.equal(new Set(accepted.map(row=>row.created_at.slice(0,10))).size,7);
    const saved=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(p.petId);
    assert.ok(Number(saved.pet_xp)>200,'real Worker care actions must persist XP');
  } finally {f.close();t.mock.timers.reset();}
});

test('virtual absence never invents accepted care',async t=>{
  t.mock.timers.enable({apis:['Date'],now:UTC_BASE});
  const f=makeFixture(()=>Date.now());
  try {
    const p=f.createPlayer('virtual-absent');
    t.mock.timers.setTime(UTC_BASE);
    assert.equal((await f.action(p.owner,'feed')).accepted,true);
    t.mock.timers.setTime(UTC_BASE+7*DAY_MS);
    const accepted=f.accepted(p.owner).filter(row=>DAY.includes(row.event_type));
    assert.equal(accepted.length,1);
    assert.equal(new Set(accepted.map(row=>row.created_at.slice(0,10))).size,1);
    // Attaching a debt simulator to this evidence is deliberately future work:
    // no runtime neglect ledger or midnight settlement exists in this PR.
  } finally {f.close();t.mock.timers.reset();}
});


test('optional accelerated real-engine cohort: attendance and genuine persisted XP across configurable days', async t => {
  // Opt-in heavy scenario: MOONPET_VIRTUAL_DAYS=365 node --test scripts/moonpet-virtual-player-engine.test.mjs
  // Each player performs only real dispatches; no source-synthetic XP credits.
  const days=Number(process.env.MOONPET_VIRTUAL_DAYS || 0);
  if (!days) return t.skip('set MOONPET_VIRTUAL_DAYS=365 to run long-lived, real-action cohort');
  assert.ok(Number.isInteger(days) && days>=1 && days<=365);
  t.mock.timers.enable({apis:['Date'],now:UTC_BASE});
  const profiles=[
    {key:'complete',shouldCare:()=>true,actions:DAY},
    {key:'weekend',shouldCare:day=>[0,6].includes(new Date(UTC_BASE+day*DAY_MS).getUTCDay()),actions:DAY},
    {key:'minimal',shouldCare:()=>true,actions:['feed']},
    {key:'absent',shouldCare:()=>false,actions:[]},
  ];
  // Separate accounts in one isolated SQLite database; no real Telegram or D1.
  const f=makeFixture(()=>Date.now());
  try{
    for(const profile of profiles) f.createPlayer('virtual-'+profile.key);
    const results={};
    for(const profile of profiles)results[profile.key]={attempted:0,accepted:0,rejected:0,activeDays:0};
    for(let day=0;day<days;day++){
      for(const profile of profiles){
        if(!profile.shouldCare(day))continue;
        const player='virtual-'+profile.key;
        results[profile.key].activeDays++;
        for(let i=0;i<profile.actions.length;i++){
          // Ten-second human interaction/transition delay; own cooldown enforcement
          // remains controlled by the real Worker, never by this loop.
          t.mock.timers.setTime(UTC_BASE+day*DAY_MS+i*10_000);
          results[profile.key].attempted++;
          const receipt=await f.action(player,profile.actions[i]);
          if(receipt.accepted)results[profile.key].accepted++;
          else results[profile.key].rejected++;
        }
      }
    }
    for(const profile of profiles){
      const player='virtual-'+profile.key;
      const accepted=f.accepted(player).filter(row=>DAY.includes(row.event_type));
      assert.equal(accepted.length,results[profile.key].accepted,'accepted action totals derive from real saved receipts');
      const saved=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE telegram_id=?').get(player);
      assert.ok(saved && Number(saved.pet_xp)>=200);
      results[profile.key].petXp=Number(saved.pet_xp);
    }
    assert.equal(results.absent.accepted,0);
    assert.ok(results.complete.accepted>=results.minimal.accepted);
    assert.ok(results.complete.accepted>=results.weekend.accepted);
    console.log('Moonpet real-engine virtual cohort (not a complete gameplay optimizer):',JSON.stringify({days,results}));
  }finally{f.close();t.mock.timers.reset();}
});


test('expanded virtual workload: real care, training, cache, job, timed work and run start',async t=>{
  t.mock.timers.enable({apis:['Date'],now:UTC_BASE});
  const f=makeFixture(()=>Date.now());
  try {
    const worker=f.createPlayer('virtual-workload'),runner=f.createPlayer('virtual-runner');
    const before=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(worker.petId).pet_xp;
    const attempts=[];
    async function dispatch(owner,kind,payload={}){
      const result=await f.action(owner,kind,{request_id:'virtual-'+owner+'-'+kind+'-'+attempts.length,...payload});
      attempts.push({owner,kind,accepted:result.accepted,reason:result.reason||null,petXpAwarded:result.pet_xp_awarded??null});
      return result;
    }
    for(const care of ['feed','play','clean','train']){
      const accepted=await dispatch(worker.owner,care);
      assert.equal(accepted.accepted,true,JSON.stringify({care,accepted}));
    }
    const cache=await dispatch(worker.owner,'daily_chest');
    assert.equal(cache.accepted,true,JSON.stringify(cache));
    const replay=await dispatch(worker.owner,'daily_chest');
    assert.ok(replay.duplicate || !replay.accepted,'Daily Cache cannot pay twice');
    const job=await dispatch(worker.owner,'work',{job_key:'street_artist'});
    assert.ok(typeof job.accepted==='boolean','job must return an authoritative acceptance decision');
    const background=await dispatch(worker.owner,'activity_start',{activity_type:'work'});
    assert.equal(background.accepted,true,JSON.stringify(background));
    t.mock.timers.setTime(UTC_BASE+6*60_000);
    const claim=await dispatch(worker.owner,'activity_claim');
    assert.ok(typeof claim.accepted==='boolean','timed Work claim must return a real Worker result');
    const run=await dispatch(runner.owner,'run_start');
    assert.ok(typeof run.accepted==='boolean','Run start must use the live Worker gate');
    const after=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(worker.petId).pet_xp;
    assert.ok(after>before,'real accepted actions produce persisted Pet XP');
    const acceptedEvents=f.accepted(worker.owner);
    for(const action of ['feed','play','clean','train','daily_chest']){
      assert.ok(acceptedEvents.some(event=>event.event_type===action),action+' must have an accepted server receipt');
    }
    const duplicateCaches=acceptedEvents.filter(event=>event.event_type==='daily_chest');
    assert.equal(duplicateCaches.length,1,'repeating cache may not create duplicate accepted receipts');
    assert.ok(acceptedEvents.reduce((total,event)=>total+Number(event.pet_xp_awarded||0),0)>0);
    console.log('Moonpet multi-system Worker trace (not a complete journey):',JSON.stringify({
      petXpBefore:before,petXpAfter:after,acceptedEvents:acceptedEvents.length,
      job:{accepted:job.accepted,reason:job.reason},
      timedWork:{startAccepted:background.accepted,claimAccepted:claim.accepted,claimReason:claim.reason},
      run:{accepted:run.accepted,reason:run.reason},attempts,
    }));
  }finally{f.close();t.mock.timers.reset();}
});
