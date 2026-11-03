import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { assetKey, TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID } from
  '../workers/moonboys-api/tag-run/v2-core.js';
import {
  ATOMIC_REHEARSAL_ONLY, LIVE_RESERVATIONS_ENABLED, TOKEN_TRANSFERS_ENABLED,
  createSimulatedBudget, setSimulatedPause, holdSimulatedIntent,
  cancelSimulatedHold, markSimulatedUnknown, inspectSimulatedBudget
} from './tag-run-v2-atomic-budget-rehearsal.mjs';

const KEY=assetKey('kingsofgraff','LFGK',4),
  DAY='2026-11-02',CHAT='-1001234567890',
  ids=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)];
const budget=(daily='200',max='100')=>({
  chatId:CHAT,dayKey:DAY,assetKey:KEY,
  dailyLimitUnits:daily,maxTransferUnits:max,paused:false
});
function fixture(t,amounts=['100','100','100'],dbPath=':memory:',autoClose=true){
  const db=new DatabaseSync(dbPath);
  if(autoClose)t.after(()=>db.close());
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('PRAGMA recursive_triggers=OFF');
  for(const name of [
    '../workers/moonboys-api/migrations/104_tag_run_v2_community_token_pot.sql',
    './fixtures/tag-run-v2-accounting-rehearsal.sql',
    './fixtures/tag-run-v2-atomic-budget-rehearsal.sql'
  ]) db.exec(readFileSync(new URL(name,import.meta.url),'utf8'));
  db.prepare('INSERT INTO tag_run_v2_assets '+
    '(asset_key,chain_id,token_contract,token_symbol,token_precision) '+
    'VALUES (?,?,?,?,?)').run(KEY,WAX_MAINNET_CHAIN_ID,'kingsofgraff','LFGK',4);
  const insert=db.prepare('INSERT INTO tag_run_v2_payout_intents_rehearsal '+
    '(intent_key,chat_id,day_key,asset_key,bundle_index,telegram_id,'+
    'ticket_class,destination_account,destination_digest,amount_units,'+
    'snapshot_digest,source_receipts_digest) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  for(let i=0;i<ids.length;i++){
    insert.run(ids[i],CHAT,DAY,KEY,i,'1111','current','gkniftyheads',
      'd'.repeat(64),amounts[i],'e'.repeat(64),'f'.repeat(64));
  }
  return db;
}
const counters=db=>inspectSimulatedBudget(db,{
  chatId:CHAT,dayKey:DAY,assetKey:KEY
});

test('fixture is offline only, never a production D1 migration or signer',()=>{
  const sql=readFileSync(new URL(
    './fixtures/tag-run-v2-atomic-budget-rehearsal.sql',import.meta.url),'utf8');
  assert(!existsSync(new URL(
    '../workers/moonboys-api/migrations/107_tag_run_v2_atomic_budget.sql',
    import.meta.url)));
  assert.match(sql,/WITHOUT ROWID/);
  assert.match(sql,/simulation_only/);
  assert.equal(ATOMIC_REHEARSAL_ONLY,true);
  assert.equal(LIVE_RESERVATIONS_ENABLED,false);
  assert.equal(TOKEN_TRANSFERS_ENABLED,false);
});

test('transactional synthetic holds enforce exact cap and reject duplicate allocation',t=>{
  const db=fixture(t);
  createSimulatedBudget(db,budget());
  const first=holdSimulatedIntent(db,{intentKey:ids[0]});
  assert.equal(first.state,'simulation_held');
  assert.equal(first.account,'gkniftyheads');
  assert.equal(first.funded,false);
  assert.equal(first.transferAttempted,false);
  assert.equal(holdSimulatedIntent(db,{intentKey:ids[0]}).replayed,true);
  holdSimulatedIntent(db,{intentKey:ids[1]});
  assert.equal(counters(db).allocatedUnits,'200');
  assert.equal(counters(db).outstandingUnits,'200');
  assert.equal(counters(db).availableCapUnits,'0');
  assert.throws(()=>holdSimulatedIntent(db,{intentKey:ids[2]}),
    /atomic_rehearsal_daily_limit/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM tag_run_v2_atomic_holds_rehearsal')
    .get().n,2);
  assert.equal(counters(db).allocatedUnits,'200');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('emergency pause blocks new holds but preserves prior incident evidence',t=>{
  const db=fixture(t);
  createSimulatedBudget(db,budget());
  holdSimulatedIntent(db,{intentKey:ids[0]});
  setSimulatedPause(db,{...budget(),paused:true});
  assert.throws(()=>holdSimulatedIntent(db,{intentKey:ids[1]}),
    /atomic_rehearsal_emergency_pause/);
  const uncertain=markSimulatedUnknown(db,{intentKey:ids[0]});
  assert.equal(uncertain.state,'simulation_transfer_unknown');
  assert.equal(markSimulatedUnknown(db,{intentKey:ids[0]}).replayed,true);
  assert.throws(()=>cancelSimulatedHold(db,{intentKey:ids[0]}),
    /atomic_rehearsal_cannot_release_unknown_or_cancelled/);
  assert.equal(counters(db).outstandingUnits,'100');
  assert.equal(counters(db).paused,true);
  assert.equal(counters(db).confirmedOnChain,false);
  assert.equal(counters(db).transferAttempted,false);
});

test('cancellation releases outstanding but NEVER refills daily cap',t=>{
  const db=fixture(t);
  createSimulatedBudget(db,budget('100','100'));
  holdSimulatedIntent(db,{intentKey:ids[0]});
  const cancelled=cancelSimulatedHold(db,{intentKey:ids[0]});
  assert.equal(cancelled.state,'simulation_cancelled');
  assert.equal(counters(db).outstandingUnits,'0');
  assert.equal(counters(db).allocatedUnits,'100');
  assert.equal(counters(db).availableCapUnits,'0');
  assert.throws(()=>holdSimulatedIntent(db,{intentKey:ids[1]}),
    /atomic_rehearsal_daily_limit/);
  assert.throws(()=>cancelSimulatedHold(db,{intentKey:ids[0]}),
    /atomic_rehearsal_cannot_release_unknown_or_cancelled/);
  assert.equal(holdSimulatedIntent(db,{intentKey:ids[0]}).state,
    'simulation_cancelled');
});

test('failed allocation rolls back both budget and intent and leaves no side effects',t=>{
  const db=fixture(t);
  createSimulatedBudget(db,budget('1000','100'));
  const original=counters(db);
  // Fail specifically at hold INSERT, AFTER the conditional budget UPDATE.
  // An early limit check would not test transaction rollback.
  db.exec("CREATE TRIGGER pr5_inject_hold_insert_failure "+
    "BEFORE INSERT ON tag_run_v2_atomic_holds_rehearsal "+
    "WHEN NEW.intent_key='"+ids[1]+"' "+
    "BEGIN SELECT RAISE(ABORT,'forced_post_budget_failure'); END");
  assert.throws(()=>holdSimulatedIntent(db,{intentKey:ids[1]}),
    /forced_post_budget_failure/);
  const after=counters(db);
  assert.equal(after.revision,original.revision);
  assert.equal(after.allocatedUnits,original.allocatedUnits);
  assert.equal(after.outstandingUnits,original.outstandingUnits);
  assert.equal(after.availableCapUnits,original.availableCapUnits);
  assert.equal(db.prepare('SELECT count(*) AS n FROM tag_run_v2_atomic_holds_rehearsal')
    .get().n,0);
  // A different intent still succeeds using the untouched budget.
  assert.equal(holdSimulatedIntent(db,{intentKey:ids[0]}).state,
    'simulation_held');
  assert.equal(counters(db).allocatedUnits,'100');
});

test('large integer amounts use BigInt and preserve base units without rounding',t=>{
  const big='9007199254740993',bigLimit='18014398509481986';
  const db=fixture(t,[big,big,'1']);
  createSimulatedBudget(db,budget(bigLimit,big));
  holdSimulatedIntent(db,{intentKey:ids[0]});
  holdSimulatedIntent(db,{intentKey:ids[1]});
  assert.equal(counters(db).allocatedUnits,bigLimit);
  assert.equal(counters(db).availableCapUnits,'0');
  assert.throws(()=>holdSimulatedIntent(db,{intentKey:ids[2]}),
    /atomic_rehearsal_daily_limit/);
});

test('SQL refuses recipient rewriting, REPLACE and illicit funded states',t=>{
  const db=fixture(t);
  createSimulatedBudget(db,budget());
  holdSimulatedIntent(db,{intentKey:ids[0]});
  const replace=db.prepare('INSERT OR REPLACE INTO tag_run_v2_atomic_holds_rehearsal '+
    '(intent_key,chat_id,day_key,asset_key,amount_units,'+
    'destination_account,state) VALUES (?,?,?,?,?,?,?)');
  // Keep account equal to the immutable source so the duplicate-key
  // guard is the ONLY deliberate failure, independent of trigger order.
  assert.throws(()=>replace.run(ids[0],CHAT,DAY,KEY,'100',
    'gkniftyheads','simulation_held'),/atomic_rehearsal_duplicate_hold/);
  // Distinct intent exercises the source-account guard independently.
  assert.throws(()=>replace.run(ids[1],CHAT,DAY,KEY,'100',
    'otherwax','simulation_held'),/atomic_rehearsal_source_mismatch/);
  assert.throws(()=>db.prepare('UPDATE tag_run_v2_atomic_holds_rehearsal '+
    "SET destination_account='otherwax' WHERE intent_key=?").run(ids[0]),
    /atomic_rehearsal_hold_immutable/);
  assert.throws(()=>db.prepare('DELETE FROM tag_run_v2_atomic_holds_rehearsal')
    .run(),/atomic_rehearsal_hold_immutable/);
  assert.throws(()=>db.prepare('UPDATE tag_run_v2_atomic_holds_rehearsal '+
    "SET mode='funded' WHERE intent_key=?").run(ids[0]),
    /atomic_rehearsal_hold_immutable|CHECK/);
  assert.throws(()=>db.prepare('UPDATE tag_run_v2_atomic_budget_rehearsal '+
    "SET mode='funded'").run(),/CHECK/);
});

test('INSERT OR REPLACE cannot reset spent cap or pause while hold is unknown',t=>{
  const db=fixture(t);
  createSimulatedBudget(db,budget('100','100'));
  holdSimulatedIntent(db,{intentKey:ids[0]});
  markSimulatedUnknown(db,{intentKey:ids[0]});
  setSimulatedPause(db,{...budget(),paused:true});
  const before=counters(db);
  const holdBefore=db.prepare('SELECT * FROM tag_run_v2_atomic_holds_rehearsal '+
    'WHERE intent_key=?').get(ids[0]);
  const replace=db.prepare('INSERT OR REPLACE INTO tag_run_v2_atomic_budget_rehearsal '+
    '(chat_id,day_key,asset_key,daily_limit_units,per_transfer_limit_units,'+
    'allocated_units,outstanding_units,revision,paused) '+
    'VALUES (?,?,?,?,?,?,?,?,?)');
  assert.throws(()=>replace.run(CHAT,DAY,KEY,
    '100','100','0','0',0,0),/atomic_rehearsal_duplicate_budget/);
  assert.deepEqual(counters(db),before);
  assert.equal(db.prepare('SELECT state FROM tag_run_v2_atomic_holds_rehearsal '+
    'WHERE intent_key=?').get(ids[0]).state,holdBefore.state);
  assert.equal(counters(db).outstandingUnits,'100');
  assert.equal(counters(db).allocatedUnits,'100');
  assert.equal(counters(db).unknownFloorUnits,'100');
  assert.equal(counters(db).paused,true);
  assert.throws(()=>holdSimulatedIntent(db,{intentKey:ids[1]}),
    /atomic_rehearsal_emergency_pause/);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('direct UPDATE cannot wipe spent cap, unresolved incident floor or pause',t=>{
  const db=fixture(t);
  createSimulatedBudget(db,budget('100','100'));
  holdSimulatedIntent(db,{intentKey:ids[0]});
  markSimulatedUnknown(db,{intentKey:ids[0]});
  setSimulatedPause(db,{...budget(),paused:true});
  const original=counters(db);
  const hold=db.prepare('SELECT state FROM tag_run_v2_atomic_holds_rehearsal '+
    'WHERE intent_key=?').get(ids[0]).state;
  const sql='UPDATE tag_run_v2_atomic_budget_rehearsal SET ';
  for(const mutation of [
    "allocated_units='0',outstanding_units='0',unknown_floor_units='0',revision=0,paused=0",
    "allocated_units='0',outstanding_units='0',revision=revision+1",
    "outstanding_units='0',revision=revision+1",
    "unknown_floor_units='0',revision=revision+1",
    "paused=0,revision=0",
    "daily_limit_units='999999999',revision=revision+1",
    "per_transfer_limit_units='999999999',revision=revision+1"
  ]) {
    assert.throws(()=>db.exec(sql+mutation),
      /atomic_rehearsal_budget_immutable/,mutation);
    assert.deepEqual(counters(db),original);
  }
  assert.equal(db.prepare('SELECT state FROM tag_run_v2_atomic_holds_rehearsal '+
    'WHERE intent_key=?').get(ids[0]).state,hold);
  assert.equal(original.availableCapUnits,'0');
  assert.equal(original.unknownFloorUnits,'100');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('UPDATE OR REPLACE cannot move fresh scope onto spent paused scope',t=>{
  const db=fixture(t);
  createSimulatedBudget(db,budget('100','100'));
  holdSimulatedIntent(db,{intentKey:ids[0]});
  markSimulatedUnknown(db,{intentKey:ids[0]});
  setSimulatedPause(db,{...budget(),paused:true});
  const spent=counters(db);
  const otherChat='-1009999999999';
  createSimulatedBudget(db,{...budget('500','100'),chatId:otherChat});
  const replacement='UPDATE OR REPLACE tag_run_v2_atomic_budget_rehearsal '+
    'SET chat_id=? WHERE chat_id=? AND day_key=? AND asset_key=?';
  assert.throws(()=>db.prepare(replacement).run(
    CHAT,otherChat,DAY,KEY),/atomic_rehearsal_budget_immutable/);
  assert.deepEqual(counters(db),spent);
  const other=inspectSimulatedBudget(db,{
    chatId:otherChat,dayKey:DAY,assetKey:KEY
  });
  assert.equal(other.allocatedUnits,'0');
  assert.equal(other.paused,false);
  assert.equal(spent.unknownFloorUnits,'100');
  assert.equal(db.prepare('SELECT state FROM tag_run_v2_atomic_holds_rehearsal '+
    'WHERE intent_key=?').get(ids[0]).state,'simulation_transfer_unknown');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_atomic_budget_rehearsal')
    .get().n,2);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('cancel a known hold without releasing a different unresolved incident',t=>{
  const db=fixture(t);
  createSimulatedBudget(db,budget('300','100'));
  holdSimulatedIntent(db,{intentKey:ids[0]});
  holdSimulatedIntent(db,{intentKey:ids[1]});
  markSimulatedUnknown(db,{intentKey:ids[0]});
  const afterUnknown=counters(db);
  assert.equal(afterUnknown.unknownFloorUnits,'100');
  assert.equal(afterUnknown.outstandingUnits,'200');
  cancelSimulatedHold(db,{intentKey:ids[1]});
  const afterCancel=counters(db);
  assert.equal(afterCancel.allocatedUnits,'200');
  assert.equal(afterCancel.outstandingUnits,'100');
  assert.equal(afterCancel.unknownFloorUnits,'100');
  assert.throws(()=>db.exec('UPDATE tag_run_v2_atomic_budget_rehearsal '+
    "SET outstanding_units='0',revision=revision+1"),
    /atomic_rehearsal_budget_immutable/);
  assert.equal(counters(db).outstandingUnits,'100');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('independent worker connections serialize last allocation and idempotent retry',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'tag-run-pr5-'));
  const file=join(dir,'atomic-rehearsal.sqlite');
  const db=fixture(t,['100','100','100'],file,false);
  t.after(()=>{
    db.close();
    rmSync(dir,{recursive:true,force:true});
  });
  createSimulatedBudget(db,budget('100','100'));
  const gate=new SharedArrayBuffer(8);
  const flags=new Int32Array(gate);
  // Independent Node workers each own a SQLite connection to one shared
  // temporary file; a barrier triggers both BEGIN IMMEDIATE attempts together.
  const workerScript=[
    "const {parentPort,workerData}=require('node:worker_threads');",
    "const {DatabaseSync}=require('node:sqlite');",
    "(async()=>{",
    " const db=new DatabaseSync(workerData.file);",
    " try {",
    "  db.exec('PRAGMA foreign_keys=ON');",
    "  db.exec('PRAGMA busy_timeout=5000');",
    "  const {holdSimulatedIntent}=await import(workerData.moduleUrl);",
    "  const gate=new Int32Array(workerData.gate);",
    "  Atomics.add(gate,0,1);",
    "  Atomics.wait(gate,1,0,5000);",
    "  try {",
    "   const result=holdSimulatedIntent(db,{intentKey:workerData.intentKey});",
    "   parentPort.postMessage({ok:true,intentKey:workerData.intentKey,replayed:result.replayed,state:result.state});",
    "  } catch(error) {",
    "   parentPort.postMessage({ok:false,intentKey:workerData.intentKey,error:String(error)});",
    "  }",
    " } finally { db.close(); }",
    "})().catch(error=>parentPort.postMessage({fatal:String(error)}));"
  ].join('\n');
  const moduleUrl=new URL('./tag-run-v2-atomic-budget-rehearsal.mjs',
    import.meta.url).href;
  const pending=ids.slice(0,2).map(intentKey=>{
    const w=new Worker(workerScript,{eval:true,workerData:{
      file,intentKey,moduleUrl,gate
    }});
    return {
      outcome:new Promise((resolve,reject)=>{
        w.once('message',resolve);
        w.once('error',reject);
      }),
      exit:new Promise((resolve,reject)=>{
        w.once('exit',code=>code===0?resolve():reject(
          new Error('sqlite-worker-exit-'+code)));
      })
    };
  });
  try {
    for(let i=0;Atomics.load(flags,0)<2&&i<500;i++){
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(Atomics.load(flags,0),2,
      'both independent worker connections reached the contention barrier');
    Atomics.store(flags,1,1);
    Atomics.notify(flags,1,2);
    const outcomes=await Promise.all(pending.map(p=>p.outcome));
    await Promise.all(pending.map(p=>p.exit));
    assert.equal(outcomes.filter(x=>x.ok).length,1,JSON.stringify(outcomes));
    const winner=outcomes.find(x=>x.ok);
    const loser=outcomes.find(x=>!x.ok);
    assert.equal(winner.state,'simulation_held');
    assert.match(loser.error,/atomic_rehearsal_daily_limit/);
    assert.equal(holdSimulatedIntent(db,{intentKey:winner.intentKey}).replayed,true);
    assert.throws(()=>holdSimulatedIntent(db,{intentKey:loser.intentKey}),
      /atomic_rehearsal_daily_limit/);
    const report=counters(db);
    assert.equal(report.allocatedUnits,'100');
    assert.equal(report.outstandingUnits,'100');
    assert.equal(report.availableCapUnits,'0');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+
      'tag_run_v2_atomic_holds_rehearsal').get().n,1);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  } finally {
    Atomics.store(flags,1,1);
    Atomics.notify(flags,1,2);
  }
});

test('fail-closed on invalid identities, cap shapes and missing budgets',t=>{
  const db=fixture(t);
  assert.throws(()=>holdSimulatedIntent(db,{intentKey:ids[0]}),
    /atomic_rehearsal_budget_missing/);
  assert.throws(()=>createSimulatedBudget(db,budget('100','101')),
    /atomic_rehearsal_invalid_cap/);
  assert.throws(()=>createSimulatedBudget(db,budget('00100','10')),
    /atomic_rehearsal_invalid_units/);
  createSimulatedBudget(db,budget());
  assert.throws(()=>createSimulatedBudget(db,budget()),
    /atomic_rehearsal_duplicate_budget/);
  assert.throws(()=>holdSimulatedIntent(db,{intentKey:'invalid'}),
    /atomic_rehearsal_invalid_intent_key/);
});
