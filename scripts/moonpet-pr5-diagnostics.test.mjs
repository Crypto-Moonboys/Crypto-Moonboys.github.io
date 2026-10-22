import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { nativeBenchmarkSnapshot, freezeBenchmarkTime } from './moonpet-pr5-native-benchmark.mjs';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/moonpet-pr5-baseline.json',import.meta.url)));
for(const scenario of ['three','history'])test('diagnostic ledger reconciles every '+scenario+' projection call, SQL family and plan',()=>{
 const raw=execFileSync(process.execPath,['scripts/moonpet-pr5-latency-audit.mjs',process.cwd(),scenario],{encoding:'utf8',maxBuffer:8*1024*1024});
 const report=JSON.parse(raw),p=report.projection;
 assert.equal(report.diagnostic_only,true);assert.equal(p.includes_clock_shim_overhead,true);assert.equal(p.clock,'fixture_js_date_callbacks');assert.equal(report.query_benchmark.clock,'native_sqlite_frozen_literals');assert.equal(report.query_benchmark.all_results_match_clock_shim,true);assert.equal(p.d1_calls,scenario==='three'?100:96);assert.equal(p.sql_statements,scenario==='three'?156:152);
 assert.equal(report.calls.length,p.d1_calls);assert.equal(report.calls.reduce((n,c)=>n+c.sql_statements,0),p.sql_statements);
 assert.equal(report.families.reduce((n,f)=>n+f.executions,0),p.sql_statements);assert.equal(Object.values(report.modules).reduce((n,m)=>n+m.sql_statements,0),p.sql_statements);
 const ids=new Set(report.families.map(f=>f.id));for(const [i,call]of report.calls.entries()){assert.equal(call.index,i+1);assert.equal(call.outcome,'completed');assert.ok(call.start_ms<=call.end_ms);assert.ok(call.families.every(id=>ids.has(id)));}
 assert.equal(p.guarded_batches,16);assert.ok(p.binding_interval_union_ms<=p.wall_ms);assert.ok(p.sqlite_execution_union_ms<=p.wall_ms);
 assert.ok(report.plans.length>50);assert.ok(report.plans.some(p=>p.module==='atomic_guard'));for(const plan of report.plans){assert.equal(plan.clock,'native_sqlite_frozen_literals');assert.equal(plan.result_parity,true);assert.ok(ids.has(plan.family));assert.ok(plan.plan.length>0);assert.ok(plan.local_select_ms.min<=plan.local_select_ms.median);assert.ok(plan.local_select_ms.median<=plan.local_select_ms.max);}
 for(const secret of ['980301','fixture-space-2','fixture-space-3','fixture-token','SELECT *','headers','args'])assert.equal(raw.includes(secret),false,secret);
});
for(const expected of baseline.cases)test('diagnostic PR preserves first/retry response and saved state: '+expected.scenario,()=>{
 const actual=JSON.parse(execFileSync(process.execPath,['scripts/moonpet-pr4-parity-case.mjs',expected.scenario],{encoding:'utf8'}));
 for(const k of ['first_response_hash','first_persisted_hash','retry_response_hash','retry_persisted_hash'])assert.equal(actual[k],expected[k],k);
 for(const phase of ['first','second']){assert.equal(actual[phase].calls,expected[phase].calls);assert.equal(actual[phase].statements,expected[phase].statements);}
});

test('native benchmark backup excludes connection date callbacks and preserves saved rows',async()=>{
 const source=new DatabaseSync(':memory:');source.exec("CREATE TABLE saved(value TEXT); INSERT INTO saved VALUES ('preserved')");
 source.function('julianday',{varargs:true},()=>{throw Error('clock_shim_must_not_run');});
 const copy=await nativeBenchmarkSnapshot(source);
 try{assert.equal(copy.db.prepare("SELECT value FROM saved").get().value,'preserved');assert.equal(copy.db.prepare("SELECT julianday('2000-01-01') AS day").get().day,2451544.5);assert.throws(()=>copy.db.exec("DELETE FROM saved"),/readonly/);assert.ok(copy.db.prepare('PRAGMA function_list').all().filter(f=>['datetime','date','strftime','julianday'].includes(f.name)).every(f=>f.builtin===1));}finally{copy.close();source.close();}
});
test('frozen SQL changes only explicit clock inputs and current timestamp keywords',()=>{
 const iso='2026-10-21T12:00:00.000Z';
 assert.equal(freezeBenchmarkTime('SELECT "CURRENT_TIMESTAMP",[CURRENT_TIMESTAMP]',iso),'SELECT "CURRENT_TIMESTAMP",[CURRENT_TIMESTAMP]');
 assert.equal(freezeBenchmarkTime("SELECT date('now'),strftime('%s','now'),julianday(created_at),CURRENT_TIMESTAMP,'now','CURRENT_TIMESTAMP' -- CURRENT_TIMESTAMP\n",iso),"SELECT date('2026-10-21T12:00:00.000Z'),strftime('%s','2026-10-21T12:00:00.000Z'),julianday(created_at),'2026-10-21 12:00:00','now','CURRENT_TIMESTAMP' -- CURRENT_TIMESTAMP\n");
});
