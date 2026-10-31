import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeMoonpetRecovery } from './moonpet-recovery-profile.mjs';

test('aggregates full recovery latency and counts without exporting identity or raw records',()=>{
  const lines = Array.from({length:20},(_,index)=>JSON.stringify({
    event:'moonpet_state_timing',request_id:'private-'+index,telegram_id:'secret',
    mode:'full',stage:'state_recovery',outcome:'completed',
    duration_ms:index+1,d1_calls:30,sql_statements:55,sql:'private SQL'
  }));
  const report=summarizeMoonpetRecovery(lines.join('\n'));
  assert.equal(report.events.accepted,20);
  assert.equal(report.groups.length,1);
  assert.deepEqual(report.groups[0],{mode:'full',stage:'state_recovery',outcome:'completed',
    count:20,p50_ms:10,p95_ms:19,max_ms:20,median_sql_statements:55,median_d1_calls:30});
  const encoded=JSON.stringify(report);
  for(const secret of ['telegram_id','request_id','private-','secret','private SQL'])assert.ok(!encoded.includes(secret));
});

test('does not mix modes, stages, failed and completed attempts',()=>{
  const rows=[
    {mode:'full',stage:'state_recovery',outcome:'completed',duration_ms:400},
    {mode:'full',stage:'state_recovery',outcome:'failed',duration_ms:900},
    {mode:'core',stage:'state_recovery',outcome:'completed',duration_ms:50},
    {mode:'full',stage:'pet_state_projection',outcome:'completed',duration_ms:300},
  ];
  const result=summarizeMoonpetRecovery(rows.map(x=>JSON.stringify({event:'moonpet_state_timing',...x})).join('\n'));
  assert.equal(result.groups.length,4);
  assert.deepEqual(result.groups.map(x=>x.count),[1,1,1,1]);
  assert.equal(result.groups.find(x=>x.outcome==='failed').p50_ms,900);
});

test('filters malformed, unauthorized, unbounded and non-timing input',()=>{
  const rows=['not JSON','{}',JSON.stringify({event:'untrusted',telegram_id:'hidden'}),
    JSON.stringify({event:'moonpet_state_timing',mode:'full',stage:'other',outcome:'completed',duration_ms:1}),
    JSON.stringify({event:'moonpet_state_timing',mode:'full',stage:'total',outcome:'completed',duration_ms:-1}),
    JSON.stringify({event:'moonpet_state_timing',mode:'full',stage:'total',outcome:'completed',duration_ms:100,
      d1_calls:3.2,sql_statements:-4}),
  ];
  const result=summarizeMoonpetRecovery(rows.join('\n'));
  assert.deepEqual(result.events,{accepted:1,ignored:2,invalid:3});
  assert.equal(result.groups[0].median_d1_calls,null);
  assert.equal(result.groups[0].median_sql_statements,null);
});
