import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
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
function fixture(t,amounts=['100','100','100']){
  const db=new DatabaseSync(':memory:');
  t.after(()=>db.close());
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
  const db=fixture(t,['100','101','100']);
  createSimulatedBudget(db,budget('1000','100'));
  const revision=counters(db).revision;
  assert.throws(()=>holdSimulatedIntent(db,{intentKey:ids[1]}),
    /atomic_rehearsal_transfer_limit/);
  assert.equal(counters(db).revision,revision);
  assert.equal(counters(db).allocatedUnits,'0');
  assert.equal(db.prepare('SELECT count(*) AS n FROM tag_run_v2_atomic_holds_rehearsal')
    .get().n,0);
  assert.equal(holdSimulatedIntent(db,{intentKey:ids[0]}).state,
    'simulation_held');
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
  assert.throws(()=>replace.run(ids[0],CHAT,DAY,KEY,'100',
    'otherwax','simulation_held'),/atomic_rehearsal_duplicate_hold/);
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

test('fail-closed on invalid identities, cap shapes and missing budgets',t=>{
  const db=fixture(t);
  assert.throws(()=>holdSimulatedIntent(db,{intentKey:ids[0]}),
    /atomic_rehearsal_budget_missing/);
  assert.throws(()=>createSimulatedBudget(db,budget('100','101')),
    /atomic_rehearsal_invalid_cap/);
  assert.throws(()=>createSimulatedBudget(db,budget('00100','10')),
    /atomic_rehearsal_invalid_units/);
  createSimulatedBudget(db,budget());
  assert.throws(()=>createSimulatedBudget(db,budget()),/UNIQUE constraint failed/);
  assert.throws(()=>holdSimulatedIntent(db,{intentKey:'invalid'}),
    /atomic_rehearsal_invalid_intent_key/);
});
