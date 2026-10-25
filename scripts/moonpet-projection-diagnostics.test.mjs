import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectionDiagnostics, projectionSamplingEnabled, projectionOperation } from '../workers/moonboys-api/pets/projection-diagnostics.js';
import { createDisplayedPetScope } from '../workers/moonboys-api/pets/displayed-pet-scope.js';
import { compareTraces, extractTraces, unionDuration } from './moonpet-projection-compare.mjs';
import { performanceFixture } from './moonpet-state-performance-fixture.mjs';

test('sampling requires server rate, near-term expiry and random selection; fails closed', () => {
  const now = Date.now(), env = {MOONPET_PROJECTION_SAMPLE_RATE:'0.1',MOONPET_PROJECTION_SAMPLE_UNTIL:new Date(now+60000).toISOString()};
  assert.equal(projectionSamplingEnabled(env,now,()=>0),true);
  assert.equal(projectionSamplingEnabled(env,now,()=>0.2),false);
  for (const rate of ['',0,-1,1,Infinity,'not-a-rate']) assert.equal(projectionSamplingEnabled({...env,MOONPET_PROJECTION_SAMPLE_RATE:rate},now,()=>0),false);
  for (const until of ['', 'bad',new Date(now).toISOString(),new Date(now+3600001).toISOString()]) assert.equal(projectionSamplingEnabled({...env,MOONPET_PROJECTION_SAMPLE_UNTIL:until},now,()=>0),false);
  assert.equal(projectionSamplingEnabled({},now,()=>0),false);
});

function mock() {
  let now=0; const events=[], submitted=[];
  const result={success:true,results:[{private:'player payload'}],meta:{duration:2}};
  const db={prepare(sql) { const s={sql,bind(){return s;},all(){now+=20;return Promise.resolve(result);},first(){now+=20;return Promise.resolve(result.results[0]);},run(){return s.all();}}; return s; },
    batch(statements){submitted.push(statements);now+=30;return Promise.resolve(statements.map(()=>result));}};
  const trace=createProjectionDiagnostics({requestId:'request-only',colo:'ORD',clock:()=>now,emit:e=>events.push(e)});
  return {db,trace,events,submitted,result,advance:n=>now+=n};
}
test('native batch receives native statements; one submission, shared labels, exact result, SQL coverage', async () => {
  const f=mock(), root=f.trace.rootDatabase(f.db);
  const a=f.trace.database(root,'inventory').prepare('secret-sql').bind('secret-token');
  const b=f.trace.database(root,'gear').prepare('private-sql').bind('telegram-id');
  const out=await root.batch([a,b]);
  assert.equal(out[0],f.result);assert.equal(f.submitted.length,1);
  assert.notEqual(f.submitted[0][0],a);
  await root.prepare('hidden').first();
  f.trace.finish('completed');f.trace.finish('completed');
  assert.equal(f.events.length,1);const e=f.events[0];
  assert.equal(e.calls.length,2);assert.equal(e.calls[0].batch_size,2);
  assert.deepEqual(e.calls[0].operations,{inventory:1,gear:1});
  assert.equal(e.calls[0].sql_reported_ms,4);assert.equal(e.calls[1].sql_reported_ms,undefined);
  assert.equal(e.calls[1].await_ms,20);assert.equal(e.colo,'ORD');
  assert.doesNotMatch(JSON.stringify(e),/secret|telegram|private|payload/);
});
test('coalesced ownership reads count actual batch with guard, not logical .first calls', async () => {
  const f=mock(),root=f.trace.rootDatabase(f.db);
  const scope=createDisplayedPetScope(root,'private-owner','private-pet','season',{coalesceReads:true,concurrentReads:true});
  const a=f.trace.database(scope.db,'gear').prepare('SELECT 1').first();
  const b=f.trace.database(scope.db,'materials').prepare('SELECT 2').all();
  await Promise.all([a,b]);f.trace.finish('completed');
  const e=f.events[0];assert.equal(e.calls.length,1);assert.equal(e.calls[0].batch_size,3);
  assert.deepEqual(e.calls[0].operations,{gear:1,materials:1,projection:1});
});
test('nested module labels replace their parent without duplicate D1 counting', async () => {
  const f=mock(),root=f.trace.rootDatabase(f.db),parent=f.trace.database(root,'guidance');
  await projectionOperation(f.trace,'economy',db=>db.prepare('secret').all(),parent);
  f.trace.finish('completed');assert.equal(f.events[0].calls.length,1);
  assert.equal(f.events[0].calls[0].operation,'economy');
});
test('failures and returned failures propagate unchanged; emitter failure is contained', async () => {
  const f=mock(),failure=Error('private-token');f.db.batch=()=>{throw failure;};
  const root=f.trace.rootDatabase(f.db);
  assert.throws(()=>root.batch([]),e=>e===failure);
  f.db.batch=()=>Promise.reject(failure);await assert.rejects(root.batch([]),e=>e===failure);
  f.db.batch=()=>Promise.resolve([{success:false,error:'private-token'}]);
  assert.equal((await root.batch([root.prepare('hidden')]))[0].success,false);
  f.trace.finish('failed');assert.deepEqual(f.events[0].calls.map(c=>c.outcome),['threw','threw','returned_failure']);
  assert.doesNotMatch(JSON.stringify(f.events),/private-token/);
  createProjectionDiagnostics({requestId:'x',emit:()=>{throw failure;}}).finish('failed');
});
test('trace limits are fixed, truncation explicit, and labels allowlisted', async () => {
  const f=mock(),root=f.trace.rootDatabase(f.db);
  for(let i=0;i<200;i++)await projectionOperation(f.trace,'profile',db=>db.prepare('hidden').all(),root);
  assert.throws(()=>f.trace.database(root,'username'),/invalid_projection_operation/);
  f.trace.finish('completed');assert.equal(f.events[0].calls.length,192);assert.equal(f.events[0].spans.length,80);
  assert.equal(f.events[0].dropped_calls,8);assert.equal(f.events[0].dropped_spans,120);
});
test('disabled helper preserves exact original promise and invocation', () => {
  const promise=Promise.resolve(42),db={};assert.equal(projectionOperation(null,'ignored',(arg)=>{assert.equal(arg,db);return promise;},db),promise);
});
test('overlap union and per-colo/count cohorts do not sum parallel paths or invent missing SQL', async () => {
  assert.equal(unionDuration([[0,10],[5,20],[25,30]]),25);
  const f=mock();await projectionOperation(f.trace,'profile',db=>db.prepare('hidden').all(),f.trace.rootDatabase(f.db));f.trace.finish('completed');
  const e=f.events[0], iad={...e,request_id:'iad',colo:'IAD',duration_ms:100};
  const text=JSON.stringify({logs:[{message:[JSON.stringify(e)]},{message:[JSON.stringify(e)]},{message:[JSON.stringify(iad)]}]});
  assert.equal(extractTraces(text).length,2);
  assert.equal(extractTraces('Wrangler banner\n'+JSON.stringify({logs:[{message:[JSON.stringify(e)]}]},null,2)+'\n'+JSON.stringify({logs:[{message:[JSON.stringify(iad)]}]},null,2)).length,2);
  const groups=compareTraces(extractTraces(text));assert.equal(groups.length,2);
  assert.equal(groups[1].observed_critical_path_ms.p50,100);
  assert.equal(groups[0].operations.find(r=>r.operation==='profile').d1_calls.p50,1);
});
test('observed dependency path attributes only post-dependency tails, with a bounded join blocker', () => {
  const span=(operation,start_ms,end_ms,dependencies=[])=>({operation,start_ms,end_ms,duration_ms:end_ms-start_ms,dependencies});
  const t={request_id:'synthetic',colo:'IAD',outcome:'completed',duration_ms:70,calls:[],spans:[
    span('profile',0,10),span('combat',10,20,['profile']),span('guidance',10,50,['profile']),
    span('presentation_join',10,50,['combat','guidance']),span('final_ownership',50,60,['presentation_join']),
    span('final_economy',60,70,['final_ownership'])]};
  const result=compareTraces([t])[0];
  assert.equal(result.observed_critical_path_ms.p50,70);
  assert.deepEqual(result.presentation_join_last_blockers,{guidance:1});
  assert.equal(result.operations.find(r=>r.operation==='guidance').join_blocking_tail_ms.p50,30);
  assert.equal(result.observed_dependency_paths[0].unattributed_ms,0);
  assert.equal(result.observed_dependency_paths[0].operations.reduce((n,s)=>n+s.post_dependency_tail_ms,0),70);
});
test('signed complete request has matching trace counts, correlation and no private content', async () => {
  const oldRandom=Math.random,oldFlag=process.env.MOONPET_PERF_PROJECTION_DIAGNOSTICS;
  const uuidDescriptor=Object.getOwnPropertyDescriptor(crypto,'randomUUID');
  Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=> '00000000-0000-4000-8000-000000000001'});
  Math.random=()=>0.01;process.env.MOONPET_PERF_PROJECTION_DIAGNOSTICS='1';
  const f=await performanceFixture({pets:3});
  try {
    const {events,report,state}=await f.measureHttp();
    assert.equal(state.hydration.full,true);
    const trace=report.projection_trace;assert.ok(trace);assert.equal(trace.outcome,'completed');
    const projection=events.find(e=>e.stage==='pet_state_projection');assert.equal(trace.request_id,projection.request_id);
    assert.equal(trace.calls.length,projection.d1_calls);
    assert.equal(trace.calls.reduce((n,c)=>n+c.sql_statements,0),projection.sql_statements);
    assert.equal(trace.dropped_calls,0);assert.equal(trace.dropped_spans,0);
    for(const id of ['combat','identity','roster','journey','economy','final_ownership','final_economy','presentation_join'])assert.ok(trace.spans.some(s=>s.operation===id),id);
    assert.doesNotMatch(JSON.stringify(trace),new RegExp(f.owner+'|fixture-token|first_name|telegram_id|pet_id|SELECT |UPDATE '));
  } finally {f.close();Math.random=oldRandom;if(uuidDescriptor)Object.defineProperty(crypto,'randomUUID',uuidDescriptor);else delete crypto.randomUUID;if(oldFlag===undefined)delete process.env.MOONPET_PERF_PROJECTION_DIAGNOSTICS;else process.env.MOONPET_PERF_PROJECTION_DIAGNOSTICS=oldFlag;}
});
