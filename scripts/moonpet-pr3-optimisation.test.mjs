import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performanceFixture } from './moonpet-state-performance-fixture.mjs';
import { seedPr3Recovery, qualifyingWeekly } from './moonpet-pr3-fixture.mjs';
import { recoverPetJourneyAwards } from '../workers/moonboys-api/pets/journey-recovery.js';
const baseline=readFileSync(new URL('./fixtures/moonpet-weekly-recovery-before-pr3.sql',import.meta.url),'utf8');
async function currentQuery(){const queries=[];await recoverPetJourneyAwards({prepare(sql){return {bind(...args){this.args=args;return this;},async all(){queries.push({sql,args:this.args});return {results:[]};}};}},'980301');return queries.find(q=>q.sql.includes('SELECT eligible.*')&&q.sql.includes('JOIN telegram_pet_weekly_journey_objectives o')).sql;}
for(const pets of [1,3]) test('full projection retains PR3 and PR4 call reductions for '+pets+' pets',async()=>{
 const f=await performanceFixture({pets});try{const {report,state}=await f.measure();assert.equal(state.adopted,true);assert.equal(report.calls,pets===1?112:120);assert.ok(report.statements<=180);}finally{f.close();}
});
test('weekly period readiness has exact candidate/cursor parity for archived, rejected, pending and settled evidence',async()=>{
 const f=await performanceFixture({pets:3});try{
  await seedPr3Recovery(f);
  f.sql.exec("UPDATE telegram_pet_season_slots SET journey_clock='created_at',created_at='2026-10-01 00:00:00'");
  await qualifyingWeekly(f,'fixture-space-2','pet-s2026-004');
  await qualifyingWeekly(f,'fixture-space-3','pet-s2026-004');
  const current=await currentQuery();
  const compare=()=>{for(const limit of [1,5,100]){const args=[f.owner,5,f.owner,'moonpet:journey-recovery:weekly',limit];assert.deepEqual(f.sql.prepare(current).all(...args),f.sql.prepare(baseline).all(...args));}};
  compare();assert.equal(f.sql.prepare(current).all(f.owner,5,f.owner,'moonpet:journey-recovery:weekly',100).length,3);
  for(const table of ['telegram_pet_season_slots','telegram_pet_instances'])f.sql.prepare('UPDATE '+table+" SET status='archived' WHERE pet_id=?").run('current-'+f.owner);
  f.active('fixture-space-2','pet-s2026-004');compare();
  f.sql.prepare("INSERT INTO telegram_pet_recovery_cursors(telegram_id,setting_key,setting_value) VALUES(?,'moonpet:journey-recovery:weekly','pet-s2026-004:03:fixture-space-2')").run(f.owner);compare();
  f.sql.exec("UPDATE telegram_pet_events SET status='rejected' WHERE event_type='train'");compare();
  f.sql.exec("UPDATE telegram_pet_events SET status='accepted' WHERE event_type='train'");
  f.sql.prepare("INSERT INTO telegram_pet_events(id,telegram_id,pet_id,season_key,event_type,event_key,day_key,status) VALUES('pending-source',?,?,'pet-s2026-004','feed','pending-source','2026-10-15','accepted')").run(f.owner,'current-'+f.owner);compare();
  await f.measureHttp();compare();await f.measureHttp();compare();
 }finally{f.close();}
});

const { execFileSync } = await import('node:child_process');
const parityBaseline=JSON.parse(readFileSync(new URL('./fixtures/moonpet-pr3-baseline-parity.json',import.meta.url),'utf8'));
for(const expected of parityBaseline.cases)test('baseline response and reward parity: '+expected.scenario,()=>{
 const actual=JSON.parse(execFileSync(process.execPath,['scripts/moonpet-pr3-parity-case.mjs',expected.scenario],{encoding:'utf8',env:{...process.env,MOONPET_PERF_SOURCE_ROOT:process.cwd()}}));
 for(const key of ['first_response_hash','first_persisted_hash','retry_response_hash','retry_persisted_hash'])assert.equal(actual[key],expected[key],key);
 assert.equal(actual.second.calls,expected.retry_calls-26);assert.equal(actual.second.statements,expected.retry_statements+1);
 assert.equal(actual.first.calls,expected.calls-26);assert.equal(actual.first.statements,expected.statements+1);
});

test('all business seed clocks are pinned before first warm-up and lifecycle age follows only the fixture clock',async()=>{
 const f=await performanceFixture({pets:3,warm:false});try{
  for(const table of ['telegram_users','telegram_pet_profiles','telegram_pet_instances','telegram_pet_lifecycle_by_pet','telegram_pet_season_slots','telegram_pet_active_slots']){
   const columns=f.sql.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name);
   for(const key of ['created_at','updated_at','last_decay_at'].filter(key=>columns.includes(key)))
    for(const row of f.sql.prepare('SELECT '+key+' FROM '+table).all())assert.equal(row[key],'2026-10-21 12:00:00',table+'.'+key);
  }
  f.advance(7*86400000);
  const {state}=await f.measureHttp();assert.equal(state.lifecycle.incubation.age_days,7);
 }finally{f.close();}
});
