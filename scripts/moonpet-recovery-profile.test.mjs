import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeMoonpetRecovery } from './moonpet-recovery-profile.mjs';

const event=(id,mode,stage,outcome,duration_ms,extra={})=>JSON.stringify({
  event:'moonpet_state_timing',request_id:id,mode,stage,outcome,duration_ms,...extra
});
test('twenty completed requests aggregate recovery latency without exporting identity',()=>{
  const lines=[];
  for(let index=0;index<20;index++){
    const id='private-'+index;
    lines.push(event(id,'full','state_recovery','completed',index+1,{telegram_id:'secret',d1_calls:30,sql_statements:55,sql:'private SQL'}));
    lines.push(event(id,'full','total','completed',index+100));
  }
  const report=summarizeMoonpetRecovery(lines.join('\n'));
  assert.equal(report.events.accepted,40);
  assert.equal(report.groups.length,2);
  const recovery=report.groups.find(g=>g.stage==='state_recovery');
  assert.deepEqual(recovery,{mode:'full',stage:'state_recovery',outcome:'completed',count:20,
    p50_ms:10,p95_ms:19,max_ms:20,median_sql_statements:55,median_d1_calls:30});
  for(const secret of ['telegram_id','request_id','private-','secret','private SQL'])
    assert.ok(!JSON.stringify(report).includes(secret));
});

test('successful recovery followed by failed projection is not completed recovery',()=>{
  const rows=[
    event('failed-later','full','state_recovery','completed',400),
    event('failed-later','full','pet_state_projection','failed',900),
    event('success','full','state_recovery','completed',60),
    event('failed-later','full','total','failed',950),
    event('success','full','total','completed',100)
  ];
  const report=summarizeMoonpetRecovery(rows.join('\n'));
  const recoveries=report.groups.filter(g=>g.stage==='state_recovery');
  assert.equal(recoveries.length,2);
  assert.equal(recoveries.find(g=>g.outcome==='completed').p50_ms,60);
  assert.equal(recoveries.find(g=>g.outcome==='failed').p50_ms,400);
});

test('missing final event or duplicate/conflicting request is excluded',()=>{
  const rows=[
    event('missing','full','state_recovery','completed',1000),
    event('duplicate','full','state_recovery','completed',200),
    event('duplicate','full','total','completed',230),
    event('duplicate','full','total','failed',240),
    event('different-mode','full','state_recovery','completed',300),
    event('different-mode','core','total','completed',400)
  ];
  const report=summarizeMoonpetRecovery(rows.join('\n'));
  assert.equal(report.groups.length,0);
  assert.deepEqual(report.events,{accepted:6,ignored:0,invalid:0,incomplete:1,ambiguous:2});
});

test('duplicate stages, even identical ones, never overweight percentile samples',()=>{
  const rows=[
    event('duplicate-identical','full','state_recovery','completed',900),
    event('duplicate-identical','full','state_recovery','completed',900),
    event('duplicate-identical','full','total','completed',1000),
    event('duplicate-divergent','full','state_recovery','completed',700),
    event('duplicate-divergent','full','state_recovery','completed',710),
    event('duplicate-divergent','full','total','completed',800),
    event('unique','full','state_recovery','completed',20),
    event('unique','full','total','completed',30)
  ];
  const report=summarizeMoonpetRecovery(rows.join('\\n'));
  assert.deepEqual(report.events,{accepted:8,ignored:0,invalid:0,incomplete:0,ambiguous:2});
  const recovery=report.groups.find(group=>group.stage==='state_recovery');
  assert.equal(recovery.count,1);
  assert.equal(recovery.p50_ms,20);
  assert.equal(recovery.p95_ms,20);
  assert.equal(report.groups.find(group=>group.stage==='total').count,1);
});

test('malformed, invalid, non-timing rows are rejected and missing D1 counts remain null',()=>{
  const rows=['not JSON','{}',JSON.stringify({event:'untrusted',telegram_id:'hidden'}),
    event('invalid','full','other','completed',1),
    event('negative','full','total','completed',-1),
    event('valid','full','total','completed',100,{d1_calls:3.2,sql_statements:-4})];
  const report=summarizeMoonpetRecovery(rows.join('\n'));
  assert.deepEqual(report.events,{accepted:1,ignored:2,invalid:3,incomplete:0,ambiguous:0});
  assert.equal(report.groups[0].median_d1_calls,null);
  assert.equal(report.groups[0].median_sql_statements,null);
});
