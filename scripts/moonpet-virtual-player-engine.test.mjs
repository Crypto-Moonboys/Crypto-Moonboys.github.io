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
import { simulate as simulateNeglect } from './moonpet-neglect-simulator.mjs';
import { nextFailedRunOpportunity } from './moonpet-failed-run-recovery.js';
import { selectConservativeDailyChoice } from './moonpet-run-risk-policy.mjs';

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
      // Read *actual* permanent progression awards from Worker-backed D1
      // writes. This is a diagnostic, not a fake 240/44 milestone grant.
      const marks=f.sql.prepare('SELECT earned_day,earned_at FROM telegram_pet_growth_marks WHERE pet_id=?').all('virtual-'+player);
      const crests=f.sql.prepare('SELECT crest_id,earned_at FROM telegram_pet_weekly_crests WHERE pet_id=?').all('virtual-'+player);
      results[profile.key].growthMarks=marks.length;
      results[profile.key].weeklyCrests=crests.length;
      results[profile.key].uniqueMarkDays=new Set(marks.map(row=>row.earned_day || String(row.earned_at).slice(0,10))).size;
      const crestWeeks=f.sql.prepare('SELECT qualification_week FROM telegram_pet_weekly_crests WHERE pet_id=?').all('virtual-'+player);
      results[profile.key].distinctCrestWeeks=new Set(crestWeeks.map(row=>String(row.qualification_week))).size;
      assert.equal(results[profile.key].uniqueMarkDays,marks.length,'a pet cannot farm multiple Growth Marks on the same day');
      assert.equal(results[profile.key].distinctCrestWeeks,crests.length,'a pet cannot farm multiple Crests in the same qualification week');
      if(marks.length<240 || crests.length<44){
        const legendary=f.sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND evolution_id='legendary_moon_guardian'").get('virtual-'+player).n;
        assert.equal(legendary,0,'insufficient genuinely awarded evidence must never unlock Legendary');
      }
      results[profile.key].missingToLegendaryMarks=Math.max(0,240-marks.length);
      results[profile.key].missingToLegendaryCrests=Math.max(0,44-crests.length);
      assert.ok(marks.length<=days,'one daily Growth Mark maximum');
      assert.ok(crests.length<=Math.ceil(days/7)+1,'weekly Crests cannot exceed elapsed calendar weeks');
      assert.ok(results[profile.key].uniqueMarkDays<=marks.length);
      if(profile.key==='absent'){
        assert.equal(marks.length,0,'no fabricated Growth Marks for absent players');
        assert.equal(crests.length,0,'no fabricated Crests for absent players');
      }
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
    const readCount = table => f.sql.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE telegram_id=?`).get(worker.owner).n;
    const progressEvidence = {
      growthMarks: readCount('telegram_pet_growth_marks'),
      weeklyCrests: readCount('telegram_pet_weekly_crests'),
      dailyJourneyObjectives: readCount('telegram_pet_daily_journey_objectives'),
      dailyJourneyReceipts: readCount('telegram_pet_daily_journey_receipts'),
      completedChecklistDays: readCount('telegram_pet_daily_completion'),
    };
    assert.ok(Object.values(progressEvidence).every(n=>Number.isInteger(n)&&n>=0), 'progression uses real persisted server evidence');
    console.log('Moonpet multi-system Worker trace (not a complete journey):',JSON.stringify({
      progressEvidence,
      petXpBefore:before,petXpAfter:after,acceptedEvents:acceptedEvents.length,
      job:{accepted:job.accepted,reason:job.reason},
      timedWork:{startAccepted:background.accepted,claimAccepted:claim.accepted,claimReason:claim.reason},
      run:{accepted:run.accepted,reason:run.reason},attempts,
    }));
  }finally{f.close();t.mock.timers.reset();}
});


test('shadow-only 8x neglect simulation consumes REAL seven-day accepted Worker receipt histories',async t=>{
  t.mock.timers.enable({apis:['Date'],now:UTC_BASE});
  const f=makeFixture(()=>Date.now());
  const behaviours=[
    {key:'consistent',shouldCare:()=>true,actions:DAY},
    {key:'weekend',shouldCare:day=>[0,6].includes(new Date(UTC_BASE+day*DAY_MS).getUTCDay()),actions:DAY},
    {key:'minimal',shouldCare:()=>true,actions:['feed']},
    {key:'absent',shouldCare:()=>false,actions:[]},
  ];
  try{
    for(const behaviour of behaviours)f.createPlayer('shadow-'+behaviour.key);
    for(let day=0;day<7;day++){
      for(const behaviour of behaviours){
        if(!behaviour.shouldCare(day))continue;
        for(let i=0;i<behaviour.actions.length;i++){
          t.mock.timers.setTime(UTC_BASE+day*DAY_MS+i*10_000);
          const result=await f.action('shadow-'+behaviour.key,behaviour.actions[i]);
          assert.equal(result.accepted,true,JSON.stringify({day,key:behaviour.key,result}));
        }
      }
    }
    const results={};
    for(const behaviour of behaviours){
      const owner='shadow-'+behaviour.key;
      const accepted=f.accepted(owner);
      const careSchedule=[],xpSchedule=[];
      for(let day=0;day<7;day++){
        const key=new Date(UTC_BASE+day*DAY_MS).toISOString().slice(0,10);
        const dayEvents=accepted.filter(event=>event.created_at.slice(0,10)===key);
        careSchedule.push(new Set(dayEvents.filter(event=>DAY.includes(event.event_type)).map(event=>event.event_type)).size / DAY.length);
        xpSchedule.push(dayEvents.reduce((sum,event)=>sum+Number(event.pet_xp_awarded||0),0));
      }
      const simulated=simulateNeglect({days:7,careSchedule,grossPetXpSchedule:xpSchedule});
      results[behaviour.key]={careSchedule,xpSchedule,standingDebt:simulated.endingDebt,policyWithheldXp:simulated.futurePetXpWithheld};
    }
    assert.equal(results.consistent.standingDebt,0);
    assert.equal(results.absent.standingDebt,770);
    assert.ok(results.minimal.standingDebt>0);
    assert.ok(results.weekend.standingDebt>0);
    assert.ok(results.minimal.careSchedule.every(fraction=>fraction===1/3));
    assert.ok(results.consistent.xpSchedule.every(xp=>xp>0));
    assert.ok(results.absent.xpSchedule.every(xp=>xp===0));
    console.log('Moonpet REAL-receipt shadow neglect results (not live scoring):',JSON.stringify(results));
  }finally{f.close();t.mock.timers.reset();}
});


test('time-budgeted real Worker action scheduling: 15/30/60/180 minute candidates',async t=>{
  // Candidate policy, not a proven global XP optimum. All awards and gates are
  // evaluated by the real Worker at each virtual time. No XP is injected.
  // Human interaction spacing is 60 seconds, exceeding the 45-second normal
  // care cooldown. A blocked action consumes its allocated interaction slot.
  t.mock.timers.enable({apis:['Date'],now:UTC_BASE});
  const f=makeFixture(()=>Date.now());
  const budgets=[15,30,60,180];
  const actionPlan=[
    {action:'feed'}, {action:'play'}, {action:'clean'},
    {action:'train'}, {action:'daily_chest'},
    {action:'work',job_key:'street_artist'},
  ];
  try{
    const output=[];
    for(const minutes of budgets){
      const owner='virtual-budget-'+minutes;
      const pet=f.createPlayer(owner);
      let attempted=0,acceptedCount=0,rejected=0;
      const rejectionReasons={};
      const before=Number(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(pet.petId).pet_xp);
      for(let minute=0;minute<minutes;minute++){
        t.mock.timers.setTime(UTC_BASE+minute*60_000);
        const candidate=actionPlan[minute % actionPlan.length];
        attempted++;
        const result=await f.action(owner,candidate.action,{
          ...('job_key' in candidate ? {job_key:candidate.job_key} : {}),
          request_id:'budget-'+minutes+'-minute-'+minute,
        });
        if(result.accepted && !result.duplicate)acceptedCount++;
        else{
          rejected++;
          const reason=String(result.reason||'unknown');
          rejectionReasons[reason]=(rejectionReasons[reason]||0)+1;
        }
      }
      const after=Number(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(pet.petId).pet_xp);
      const actual=f.accepted(owner);
      const earned=after-before;
      assert.equal(attempted,acceptedCount+rejected);
      assert.ok(earned>=0,'actual saved Worker XP must never go negative');
      assert.ok(actual.length>0,'at least one real accepted action required');
      const receipts=actual.reduce((sum,event)=>sum+Number(event.pet_xp_awarded||0),0);
      // Some gameplay progression grants can have their own reward receipts:
      // report receipt and balance deltas separately rather than inventing parity.
      output.push({minutes,attempted,accepted:acceptedCount,rejected,rejectionReasons,
        earnedPetXp:earned,acceptedEventPetXp:receipts,finalPetXp:after});
    }
    assert.deepEqual(output.map(row=>row.minutes),budgets);
    assert.ok(output.every(row=>row.accepted>0));
    console.log('Moonpet REAL Worker time-budgeted candidate profiles (not XP maximum):',JSON.stringify(output));
  }finally{f.close();t.mock.timers.reset();}
});


test('guidance-aware candidate scheduler avoids spent cache and tired training over real Worker sessions',async t=>{
  // This is a bounded strategy improvement, not an optimal or exhaustive
  // gameplay solver. The authority remains the Worker and committed receipts.
  t.mock.timers.enable({apis:['Date'],now:UTC_BASE});
  const fixture=makeFixture(()=>Date.now());
  try{
    const budgets=[15,30,60,180],results=[];
    for(const minutes of budgets){
      const owner='virtual-adaptive-'+minutes;
      const {petId}=fixture.createPlayer(owner);
      let attempted=0,accepted=0,blocked=0,preventedCache=0,preventedTired=0;
      const rejectedReasons={},successfulEvents=[];
      const actions=['feed','play','clean','train','work'];
      let cacheConsumed=false;
      for(let minute=0;minute<minutes;minute++){
        t.mock.timers.setTime(UTC_BASE+minute*60_000);
        // Daily Cache is once per UTC day. Once accepted (or already claimed)
        // it is no longer a candidate for the remaining session.
        const canTryCache=!cacheConsumed && minute===4;
        let kind=canTryCache?'daily_chest':actions[minute%actions.length];
        const payload={request_id:'adaptive-'+minutes+'-'+minute};
        if(kind==='work')payload.job_key='street_artist';
        if(kind==='train'){
          const saved=fixture.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(petId);
          if(Number(saved.energy)<18){
            kind='play';
            preventedTired++;
          }
        }
        if(cacheConsumed && minute>=5) preventedCache++;
        const answer=await fixture.action(owner,kind,payload);
        attempted++;
        if(answer.accepted && !answer.duplicate){
          accepted++;
          successfulEvents.push(kind);
        } else {
          blocked++;
          const reason=String(answer.reason||'unknown');
          rejectedReasons[reason]=(rejectedReasons[reason]||0)+1;
        }
        if(kind==='daily_chest' && (answer.accepted || answer.reason==='daily_claimed')) cacheConsumed=true;
      }
      const eventRows=fixture.accepted(owner);
      const balance=fixture.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(petId);
      const cacheRows=eventRows.filter(event=>event.event_type==='daily_chest');
      assert.equal(cacheRows.length,1,'exactly one actual Daily Cache receipt per daily session');
      assert.equal(rejectedReasons.daily_claimed||0,0,'adaptive plan must not retry a claimed cache');
      assert.ok(accepted>0);
      assert.equal(attempted,accepted+blocked);
      assert.ok(eventRows.length>=accepted-1,'all recorded successes must have real Worker evidence');
      results.push({
        minutes,attempted,accepted,blocked,preventedCache,preventedTired,
        rejectionReasons:rejectedReasons,earnedPetXp:Number(balance.pet_xp)-200,
        savedEventPetXp:eventRows.reduce((sum,event)=>sum+Number(event.pet_xp_awarded||0),0),
      });
    }
    assert.deepEqual(results.map(result=>result.minutes),budgets);
    console.log('Moonpet adaptive Worker candidate scheduler (not a global maximum):',JSON.stringify(results));
  }finally{fixture.close();t.mock.timers.reset();}
});


test('365-day clock alone cannot fabricate Legendary, Growth Marks or Weekly Crests',async t=>{
  t.mock.timers.enable({apis:['Date'],now:UTC_BASE});
  const f=makeFixture(()=>Date.now());
  try{
    const pet=f.createPlayer('virtual-age-only');
    // The clock crossing the age threshold is not accepted progression
    // evidence. Do not seed fake Marks, Crests or evolution receipts.
    t.mock.timers.setTime(UTC_BASE+365*DAY_MS);
    const first=f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_growth_marks WHERE pet_id=?').get(pet.petId).n;
    const weekly=f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_crests WHERE pet_id=?').get(pet.petId).n;
    const legendary=f.sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND evolution_id='legendary_moon_guardian'").get(pet.petId).n;
    assert.equal(first,0,'age must not create any qualifying Growth Marks');
    assert.equal(weekly,0,'age must not create any qualifying Weekly Crests');
    assert.equal(legendary,0,'Legendary cannot be created merely by advancing the clock');
  }finally{f.close();t.mock.timers.reset();}
});


test('real Daily Run failure schedules next-day Worker eligibility without awarding fabricated progression',async t=>{
  // Deterministic outcome reproduces the existing daily-outcome-integrity
  // regression's 2026-10-02 under-rested combat scenario.
  const startAt=Date.parse('2026-10-02T12:00:00.000Z');
  t.mock.timers.enable({apis:['Date'],now:startAt});
  const f=makeFixture(()=>Date.now());
  try{
    const pet=f.createPlayer('virtual-failed-run');
    const start=await f.action(pet.owner,'daily_run_start',{request_id:'daily-failure-start'});
    assert.equal(start.accepted,true,JSON.stringify(start));
    const original=f.sql.prepare('SELECT run_id,pet_id,telegram_id,status,depth,score FROM telegram_pet_runs WHERE telegram_id=? ORDER BY rowid DESC LIMIT 1').get(pet.owner);
    assert.ok(original && original.pet_id===pet.petId);
    f.sql.prepare('UPDATE telegram_pet_instances SET last_decay_at=? WHERE pet_id=?')
      .run(new Date(startAt-48*3600_000).toISOString(),pet.petId);
    const shown=await hooks.buildPetMiniAppState(f.db,pet.owner,'fixture-token');
    const combat=shown.run?.choices?.find(choice=>choice.key==='fight');
    assert.ok(combat,'real Worker must expose a fight choice for this seeded daily room');
    const resolution=await f.action(pet.owner,'run_step',{
      run_id:original.run_id,choice_key:'fight',expected_step_index:0,request_id:'daily-failure-fight',
    });
    const terminal=f.sql.prepare('SELECT run_id,pet_id,telegram_id,status,depth,score FROM telegram_pet_runs WHERE run_id=?').get(original.run_id);
    assert.equal(resolution.reason,'daily_room_failed',JSON.stringify(resolution));
    assert.equal(terminal.status,'failed','original failed run must remain persisted');
    const evidenceBefore={
      marks:f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_growth_marks WHERE pet_id=?').get(pet.petId).n,
      crests:f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_crests WHERE pet_id=?').get(pet.petId).n,
    };
    const scheduled=nextFailedRunOpportunity({
      run:terminal,dayKey:'2026-10-02',now:new Date(startAt),
      choiceKeys:shown.run?.choices?.map(choice=>choice.key)||[],lastChoiceKey:'fight',
    });
    assert.equal(scheduled.mayAttemptNewDay,false);
    t.mock.timers.setTime(Date.parse('2026-10-03T12:00:00.000Z'));
    const eligible=nextFailedRunOpportunity({
      run:terminal,dayKey:'2026-10-02',now:new Date(),
      choiceKeys:shown.run?.choices?.map(choice=>choice.key)||[],lastChoiceKey:'fight',
    });
    assert.equal(eligible.mayAttemptNewDay,true);
    const next=await f.action(pet.owner,'daily_run_start',{request_id:'daily-recovery-next-day'});
    const saved=f.sql.prepare('SELECT run_id,pet_id,telegram_id,status,depth,score FROM telegram_pet_runs WHERE run_id=?').get(original.run_id);
    assert.deepEqual(saved,terminal,'Worker may not rewrite a failed historical Daily Run');
    assert.deepEqual({
      marks:f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_growth_marks WHERE pet_id=?').get(pet.petId).n,
      crests:f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_crests WHERE pet_id=?').get(pet.petId).n,
    },evidenceBefore,'scheduling or beginning a fresh attempt cannot mint progression awards');
    if(next.accepted){
      const nextSaved=f.sql.prepare("SELECT run_id,pet_id,telegram_id,status FROM telegram_pet_runs WHERE telegram_id=? AND run_id<>? ORDER BY rowid DESC LIMIT 1").get(pet.owner,original.run_id);
      assert.ok(nextSaved && nextSaved.run_id!==original.run_id,'next-day run gets its own persisted identity');
      assert.equal(nextSaved.pet_id,pet.petId);
      // Play the new official run using only server-advertised choices. A
      // failed room is final: never reroll, rewrite, or force a winning step.
      const steps=[];
      for(let attempt=0;attempt<10;attempt++){
        const active=f.sql.prepare('SELECT run_id,status,current_room,depth,score FROM telegram_pet_runs WHERE run_id=?').get(nextSaved.run_id);
        if(!['active','extractable'].includes(active.status))break;
        const live=await hooks.buildPetMiniAppState(f.db,pet.owner,'fixture-token');
        const available=Array.isArray(live.run?.choices)?live.run.choices:[];
        assert.ok(available.length>0,'active official run must advertise a real choice');
        const selection=selectConservativeDailyChoice(available);
        assert.ok(selection?.key,'chosen option must have an authoritative legal key');
        const choiceKey=selection.key;
        assert.equal(selection.guaranteedSuccess,false,'even the safest advertised option cannot force victory');
        const outcome=await f.action(pet.owner,'run_step',{
          run_id:nextSaved.run_id,choice_key:choiceKey,
          expected_step_index:Number(active.current_room),
          request_id:'daily-recovery-play-'+attempt,
        });
        assert.equal(outcome.accepted,true,JSON.stringify({attempt,choiceKey,outcome}));
        steps.push({step:attempt+1,choice:choiceKey,reason:outcome.reason});
        if(outcome.reason==='daily_room_failed')break;
      }
      const finished=f.sql.prepare('SELECT run_id,status,depth,score FROM telegram_pet_runs WHERE run_id=?').get(nextSaved.run_id);
      assert.ok(['completed','extracted','failed','active','extractable'].includes(finished.status));
      if(finished.status==='active'||finished.status==='extractable'){
        assert.equal(steps.length,10,'do not silently treat an unfinished short run as complete');
      }
      const priorAfter=f.sql.prepare('SELECT run_id,pet_id,telegram_id,status,depth,score FROM telegram_pet_runs WHERE run_id=?').get(original.run_id);
      assert.deepEqual(priorAfter,terminal,'subsequent gameplay never overwrites prior failed run');
      const marksAfter=f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_growth_marks WHERE pet_id=?').get(pet.petId).n;
      const crestsAfter=f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_crests WHERE pet_id=?').get(pet.petId).n;
      assert.ok(marksAfter<=1&&crestsAfter<=1,'new-day run cannot manufacture repeated daily/weekly evidence');
      console.log('Moonpet next-day real Worker run progression:',JSON.stringify({
        status:finished.status,depth:finished.depth,score:finished.score,steps,
        growthMarks:marksAfter,weeklyCrests:crestsAfter,
      }));
    }
    console.log('Moonpet real Worker failed-run next-day attempt:',JSON.stringify({
      first:{runId:terminal.run_id,status:terminal.status,depth:terminal.depth,score:terminal.score},
      next:{accepted:next.accepted,reason:next.reason||null,eligibleByCalendar:eligible.mayAttemptNewDay},
      marks:evidenceBefore.marks,crests:evidenceBefore.crests,
    }));
  }finally{f.close();t.mock.timers.reset();}
});


test('three-day real Worker Weekly Journey evidence: care training check-ins without inventing a Crest',async t=>{
  // This exercises only THREE of the five weekly objectives. Official
  // completed runs and boss attempts are deliberately NOT simulated here.
  const epoch=Date.parse('2026-11-02T08:00:00.000Z');
  t.mock.timers.enable({apis:['Date'],now:epoch});
  const fixture=makeFixture(()=>Date.now());
  try{
    const player=fixture.createPlayer('weekly-source-evidence');
    const accepted=[],rejected=[];
    for(let day=0;day<3;day++){
      for(const [index,action] of ['feed','play','clean','train'].entries()){
        t.mock.timers.setTime(epoch+day*DAY_MS+index*60_000);
        const result=await fixture.action(player.owner,action,{request_id:'weekly-'+day+'-'+action});
        const record={day,action,reason:result.reason||null};
        (result.accepted?accepted:rejected).push(record);
      }
      if(day<2){
        t.mock.timers.setTime(epoch+day*DAY_MS+5*60_000);
        const result=await fixture.action(player.owner,'daily_chest',{request_id:'weekly-'+day+'-cache'});
        (result.accepted?accepted:rejected).push({day,action:'daily_chest',reason:result.reason||null});
      }
    }
    const events=fixture.accepted(player.owner);
    const count=type=>events.filter(event=>event.event_type===type).length;
    const training=count('train');
    const caches=count('daily_chest');
    const checkInDays=new Set(events.filter(event=>event.event_type==='daily_chest').map(event=>event.created_at.slice(0,10))).size;
    const care=count('feed')+count('play')+count('clean');
    // Only genuinely accepted receipts can qualify. This diagnostic reports
    // an unmet goal instead of pretending that rejected Train earned credit.
    assert.ok(training<=3 && caches<=2 && care<=9);
    const rows=fixture.sql.prepare('SELECT * FROM telegram_pet_weekly_journey_objectives WHERE pet_id=?').all(player.petId);
    const crest=fixture.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_crests WHERE pet_id=?').get(player.petId).n;
    assert.equal(crest,0,'a partial Weekly Journey must not invent a Crest');
    const byObjective=rows.map(row=>({objective:row.objective_id||row.challenge_id||null,
      progress:row.progress_value??null,status:row.status??null}));
    console.log('Moonpet partial Weekly Journey REAL Worker evidence (run and boss NOT VERIFIED):',JSON.stringify({
      accepted:accepted.length,rejected,events:events.length,
      care,training,checkInDays,trainingTarget:3,trainingDeficit:Math.max(0,3-training),
      cacheTarget:2,cacheDeficit:Math.max(0,2-checkInDays),
      weeklyObjectiveRows:rows.length,byObjective,crests:crest,
      qualificationVerified:false,blocker:training<3?'training_receipts_missing':'run_and_boss_not_tested',
    }));
  }finally{fixture.close();t.mock.timers.reset();}
});
