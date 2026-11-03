// TAG RUN V2 PR5. NODE-ONLY DISPOSABLE SQLITE REHEARSAL.
// Never import in Cloudflare Worker or a live payout command.
// No donor approvals, funded reservations, chain RPC, keys or token transfers.
export const ATOMIC_REHEARSAL_ONLY = true;
export const LIVE_RESERVATIONS_ENABLED = false;
export const TOKEN_TRANSFERS_ENABLED = false;
const HEX=/^[0-9a-f]{64}$/;
const UNITS=/^(0|[1-9][0-9]{0,77})$/;
const fail=reason=>{throw new Error('atomic_rehearsal_'+reason);};
const units=value=>{
  if(typeof value!=='string'||!UNITS.test(value)) fail('invalid_units');
  return BigInt(value);
};
const stateRow=(row)=>Object.freeze({
  intentKey:row.intent_key,state:row.state,account:row.destination_account,
  amountUnits:row.amount_units,mode:'simulation_only',
  funded:false,transferAttempted:false,chainConfirmed:false
});
const scope=(r)=>[r.chat_id,r.day_key,r.asset_key];
function atomic(db,fn) {
  // BEGIN IMMEDIATE serializes *offline SQLite* writers, including separate
  // connections to the same file; this is NOT a Cloudflare D1 API pattern.
  db.exec('BEGIN IMMEDIATE');
  try {
    const result=fn();
    db.exec('COMMIT');
    return result;
  } catch(e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
const sourceSql='SELECT intent_key,chat_id,day_key,asset_key,amount_units,'+
  'destination_account,status FROM tag_run_v2_payout_intents_rehearsal '+
  'WHERE intent_key=?';
const budgetSql='SELECT * FROM tag_run_v2_atomic_budget_rehearsal '+
  'WHERE chat_id=? AND day_key=? AND asset_key=?';
const holdSql='SELECT * FROM tag_run_v2_atomic_holds_rehearsal WHERE intent_key=?';

export function createSimulatedBudget(db,{
  chatId,dayKey,assetKey,dailyLimitUnits,maxTransferUnits,paused=true
}={}) {
  if(typeof chatId!=='string'||!chatId||
     typeof dayKey!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)||
     typeof assetKey!=='string'||!assetKey||typeof paused!=='boolean')
    fail('invalid_scope');
  const daily=units(dailyLimitUnits),max=units(maxTransferUnits);
  if(max===0n||max>daily) fail('invalid_cap');
  return atomic(db,()=>{
    db.prepare('INSERT INTO tag_run_v2_atomic_budget_rehearsal '+
      '(chat_id,day_key,asset_key,daily_limit_units,'+
      'per_transfer_limit_units,paused) VALUES (?,?,?,?,?,?)').run(
      chatId,dayKey,assetKey,daily.toString(),max.toString(),paused?1:0
    );
    return Object.freeze({mode:'simulation_only',funded:false,
      capUnits:daily.toString(),paused});
  });
}
export function setSimulatedPause(db,{
  chatId,dayKey,assetKey,paused=true
}={}) {
  if(typeof paused!=='boolean')fail('invalid_pause');
  return atomic(db,()=>{
    const result=db.prepare('UPDATE tag_run_v2_atomic_budget_rehearsal '+
      'SET paused=?,revision=revision+1 WHERE chat_id=? AND day_key=? '+
      'AND asset_key=? AND revision<9007199254740991').run(
      paused?1:0,chatId,dayKey,assetKey
    );
    if(result.changes!==1)fail('missing_budget');
    return Object.freeze({paused,mode:'simulation_only',funded:false});
  });
}
export function holdSimulatedIntent(db,{intentKey}={}) {
  if(typeof intentKey!=='string'||!HEX.test(intentKey))fail('invalid_intent_key');
  return atomic(db,()=>{
    const src=db.prepare(sourceSql).get(intentKey);
    if(!src||src.status!=='simulation_only')fail('source_missing');
    const amount=units(src.amount_units);
    if(amount===0n)fail('zero_amount');
    const existing=db.prepare(holdSql).get(intentKey);
    if(existing) {
      if(existing.amount_units!==src.amount_units||
         existing.destination_account!==src.destination_account||
         existing.chat_id!==src.chat_id||
         existing.day_key!==src.day_key||
         existing.asset_key!==src.asset_key)
        fail('idempotency_conflict');
      return Object.freeze({...stateRow(existing),replayed:true});
    }
    const b=db.prepare(budgetSql).get(...scope(src));
    if(!b)fail('budget_missing');
    if(b.mode!=='simulation_only'||b.paused!==0)fail('emergency_pause');
    const limit=units(b.daily_limit_units);
    const per=units(b.per_transfer_limit_units);
    const spent=units(b.allocated_units);
    const outstanding=units(b.outstanding_units);
    if(amount>per)fail('transfer_limit');
    if(spent+amount>limit)fail('daily_limit');
    if(outstanding>spent)fail('invalid_budget');
    const change=db.prepare('UPDATE tag_run_v2_atomic_budget_rehearsal '+
      'SET allocated_units=?,outstanding_units=?,revision=revision+1 '+
      'WHERE chat_id=? AND day_key=? AND asset_key=? AND revision=? '+
      'AND paused=0 AND allocated_units=? AND outstanding_units=?').run(
      (spent+amount).toString(),(outstanding+amount).toString(),
      ...scope(src),b.revision,b.allocated_units,b.outstanding_units
    );
    if(change.changes!==1)fail('concurrent_budget_change');
    db.prepare('INSERT INTO tag_run_v2_atomic_holds_rehearsal '+
      '(intent_key,chat_id,day_key,asset_key,amount_units,'+
      "destination_account,state) VALUES (?,?,?,?,?,?,'simulation_held')"
    ).run(intentKey,...scope(src),src.amount_units,src.destination_account);
    return Object.freeze({...stateRow(db.prepare(holdSql).get(intentKey)),
      replayed:false});
  });
}
export function markSimulatedUnknown(db,{intentKey}={}) {
  if(typeof intentKey!=='string'||!HEX.test(intentKey))fail('invalid_intent_key');
  return atomic(db,()=>{
    const h=db.prepare(holdSql).get(intentKey);
    if(!h)fail('hold_missing');
    if(h.state==='simulation_transfer_unknown'||
       h.state==='simulation_reconciliation_review')
      return Object.freeze({...stateRow(h),replayed:true});
    if(h.state!=='simulation_held')fail('invalid_transition');
    const result=db.prepare("UPDATE tag_run_v2_atomic_holds_rehearsal "+
      "SET state='simulation_transfer_unknown' "+
      "WHERE intent_key=? AND state='simulation_held'").run(intentKey);
    if(result.changes!==1)fail('concurrent_hold_change');
    return Object.freeze({...stateRow(db.prepare(holdSql).get(intentKey)),
      replayed:false});
  });
}
export function cancelSimulatedHold(db,{intentKey}={}) {
  if(typeof intentKey!=='string'||!HEX.test(intentKey))fail('invalid_intent_key');
  return atomic(db,()=>{
    const h=db.prepare(holdSql).get(intentKey);
    if(!h)fail('hold_missing');
    if(h.state!=='simulation_held')fail('cannot_release_unknown_or_cancelled');
    const b=db.prepare(budgetSql).get(...scope(h));
    if(!b)fail('budget_missing');
    const outstanding=units(b.outstanding_units);
    const amount=units(h.amount_units);
    if(outstanding<amount)fail('underflow');
    // Daily allocated amount remains spent, even after a cancellation:
    // cancelling is not a way to reset a daily payout cap.
    const result=db.prepare('UPDATE tag_run_v2_atomic_budget_rehearsal '+
      'SET outstanding_units=?,revision=revision+1 WHERE chat_id=? '+
      'AND day_key=? AND asset_key=? AND revision=? AND outstanding_units=?'
    ).run((outstanding-amount).toString(),...scope(h),
      b.revision,b.outstanding_units);
    if(result.changes!==1)fail('concurrent_budget_change');
    const state=db.prepare("UPDATE tag_run_v2_atomic_holds_rehearsal "+
      "SET state='simulation_cancelled' "+
      "WHERE intent_key=? AND state='simulation_held'").run(intentKey);
    if(state.changes!==1)fail('concurrent_hold_change');
    return Object.freeze({...stateRow(db.prepare(holdSql).get(intentKey)),
      replayed:false});
  });
}
export function inspectSimulatedBudget(db,{chatId,dayKey,assetKey}={}) {
  const b=db.prepare(budgetSql).get(chatId,dayKey,assetKey);
  if(!b)fail('budget_missing');
  const allocated=units(b.allocated_units),outstanding=units(b.outstanding_units),
    cap=units(b.daily_limit_units);
  if(allocated>cap||outstanding>allocated)fail('invalid_budget');
  return Object.freeze({
    mode:'simulation_only',funded:false,executable:false,
    signerAvailable:false,transferAttempted:false,confirmedOnChain:false,
    paused:Boolean(b.paused),dailyLimitUnits:b.daily_limit_units,
    allocatedUnits:b.allocated_units,outstandingUnits:b.outstanding_units,
    availableCapUnits:(cap-allocated).toString(),revision:b.revision
  });
}
