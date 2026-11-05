import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { assetKey, previewCommunityDraw, TIP_ACCOUNT } from
  '../workers/moonboys-api/tag-run/v2-core.js';
import { buildDirectWalletPayoutPlan } from
  '../workers/moonboys-api/tag-run/v2-direct-wallet-plan.js';
import { prepareV2PayoutRehearsal } from
  '../workers/moonboys-api/tag-run/v2-accounting-rehearsal.js';
import { simulateV2PayoutLifecycle, LEDGER_EXECUTION_AVAILABLE } from
  '../workers/moonboys-api/tag-run/v2-ledger-lifecycle-rehearsal.js';

const HASH='a'.repeat(64),BLOCK='b'.repeat(64);
const KEY=assetKey('kingsofgraff','LFGK',4), DAY='2026-11-02';
const cap=(daily='400',max='100')=>({
  assetKey:KEY,dayKey:DAY,dailyLimitUnits:daily,maxTransferUnits:max
});
const event=(intentKey,action,n)=>({
  intentKey,action,eventId:n.toString(16).padStart(64,'0')
});
async function createRehearsal(){
  const preview=await previewCommunityDraw({
    day:DAY,wallet:TIP_ACCOUNT,seedHex:'cd'.repeat(32),cryptoImpl:webcrypto,
    assets:[{key:KEY,contract:'kingsofgraff',symbol:'LFGK',precision:4,
      balanceUnits:'100000',reservedUnits:'20000',excludedUnits:'40000',
      approved:true,confirmed:true}],
    current:[{telegramId:'1111',points:12}],historical:[]
  });
  const plan=await buildDirectWalletPayoutPlan({
    preview,destinations:[{telegramId:'1111',account:'gkniftyheads',
      registered:true,chainAccountChecked:true}],cryptoImpl:webcrypto
  });
  const snapshots=[{assetKey:KEY,contract:'kingsofgraff',symbol:'LFGK',
    precision:4,day:DAY,evidenceDigest:HASH,blockId:BLOCK,
    irreversibleBlockNum:1234567,status:'unverified',
    onchainUnits:'100000',reservedUnits:'20000',
    excludedUnits:'40000',availableUnits:'40000',dailyRewardUnits:'400'}];
  return prepareV2PayoutRehearsal({
    chatId:'-1001234567890',plan,snapshots,
    receiptsDigest:HASH,cryptoImpl:webcrypto
  });
}
const simulate=(rehearsal,opts={})=>simulateV2PayoutLifecycle({
  rehearsal,limits:[cap()],paused:false,cryptoImpl:webcrypto,...opts
});

test('pure ledger applies simulated cap, freeze and no-transfer invariants',async()=>{
  const source=await createRehearsal(),a=source.intents[0];
  const result=await simulate(source,{
    events:[event(a.intent_key,'simulate_hold',1)]
  });
  assert.equal(LEDGER_EXECUTION_AVAILABLE,false);
  assert.equal(result.mode,'simulation_only');
  assert.equal(result.executable,false);
  assert.equal(result.funded,false);
  assert.equal(result.signerAvailable,false);
  assert.equal(result.realReservationsCreated,false);
  assert.equal(result.chainTransfersConfirmed,false);
  assert.equal(result.transferAttempted,false);
  assert.equal(result.entries[0].state,'simulation_held');
  assert.equal(result.entries[0].receivingAccount,'gkniftyheads');
  assert.equal(result.entries[0].confirmedOnChain,false);
  assert.equal(result.caps[0].simulatedHeldUnits,'20');
  assert.equal(result.caps[0].fundedReservedUnits,'0');
  assert.equal(result.caps[0].actualTransferredUnits,'0');
  assert(Object.isFrozen(result.entries[0]));
  assert(Object.isFrozen(result.caps[0]));
});

test('emergency pause rejects new simulated holds but allows incident review',async()=>{
  const source=await createRehearsal(),key=source.intents[0].intent_key;
  await assert.rejects(simulate(source,{
    paused:true,events:[event(key,'simulate_hold',1)]
  }),/ledger_rehearsal_emergency_pause/);
  const report=await simulate(source,{paused:true,events:[]});
  assert.equal(report.paused,true);
  assert.equal(report.entries[0].state,'simulation_proposed');
});

test('paused mode replays accepted historical hold/unknown and permits incident review, but no new hold',async()=>{
  const source=await createRehearsal(),first=source.intents[0],second=source.intents[1];
  const original=[
    event(first.intent_key,'simulate_hold',1),
    event(first.intent_key,'simulate_unknown',2)
  ].map((e,i)=>({...e,appendSeq:i+1}));
  await assert.rejects(simulate(source,{
    historicalEvents:[original[1],original[0]],paused:true
  }),/ledger_rehearsal_historical_append_order_invalid/);
  await assert.rejects(simulate(source,{
    historicalEvents:[{...original[0],appendSeq:null}],paused:true
  }),/ledger_rehearsal_historical_append_order_invalid/);
  const past=await simulate(source,{historicalEvents:original,paused:true});
  assert.equal(past.entries[0].state,'simulation_transfer_unknown');
  assert.equal(past.caps[0].simulatedHeldUnits,'20');
  assert.equal(past.caps[0].fundedReservedUnits,'0');
  const reviewEvent={...event(first.intent_key,'simulate_reconcile',3),
    transactionId:'c'.repeat(64),chainActionSequence:'12345',
    blockId:'d'.repeat(64),blockNum:1000,account:'gkniftyheads',
    assetKey:KEY,units:'20'};
  const reviewed=await simulate(source,{
    historicalEvents:original,paused:true,events:[reviewEvent]
  });
  assert.equal(reviewed.entries[0].state,'simulation_reconciliation_review');
  assert.equal(reviewed.caps[0].simulatedHeldUnits,'20');
  assert.equal(reviewed.entries[0].confirmedOnChain,false);
  assert.equal(reviewed.caps[0].actualTransferredUnits,'0');
  await assert.rejects(simulate(source,{
    historicalEvents:original,paused:true,
    events:[event(second.intent_key,'simulate_hold',4)]
  }),/ledger_rehearsal_emergency_pause/);
  await assert.rejects(simulate(source,{
    historicalEvents:original,paused:true,
    events:[{...original[0],action:'simulate_cancel'}]
  }),/ledger_rehearsal_conflicting_idempotency_key/);
  await assert.rejects(simulate(source,{
    historicalEvents:original,paused:true,
    events:[event(first.intent_key,'simulate_cancel',5)]
  }),/ledger_rehearsal_cannot_cancel_uncertain_transfer/);
});

test('intent hash binds amount, class, snapshot, receipt and recipient fields',async()=>{
  const source=await createRehearsal(),first=source.intents[0];
  for(const changes of [
    {amount_units:'99'},
    {amount_units:'101'},
    {ticket_class:'historical'},
    {snapshot_digest:'b'.repeat(64)},
    {source_receipts_digest:'b'.repeat(64)},
    {chat_id:'-1001234567891'},
    {bundle_index:18},
    {destination_account:'otherwax'}
  ]){
    const altered={...source,intents:[
      {...first,...changes},...source.intents.slice(1)
    ]};
    await assert.rejects(simulate(altered),
      /ledger_rehearsal_(?:intent_commitment_mismatch|destination_digest_mismatch|duplicate_bundle_slot)/,
      JSON.stringify(changes)+' must not reuse the original intent key');
  }
});

test('daily and per-transfer cap checks use exact integer arithmetic',async()=>{
  const source=await createRehearsal(),first=source.intents[0].intent_key,
    second=source.intents[1].intent_key;
  await assert.rejects(simulate(source,{limits:[cap('19','19')],
    events:[event(first,'simulate_hold',1)]}),
  /ledger_rehearsal_per_transfer_cap_exceeded/);
  await assert.rejects(simulate(source,{limits:[cap('30','20')],
    events:[event(first,'simulate_hold',1),event(second,'simulate_hold',2)]}),
  /ledger_rehearsal_daily_cap_exceeded/);
  const exact=await simulate(source,{limits:[cap('40','20')],
    events:[event(first,'simulate_hold',1),event(second,'simulate_hold',2)]});
  assert.equal(exact.caps[0].simulatedHeldUnits,'40');
  const released=await simulate(source,{limits:[cap('20','20')],
    events:[event(first,'simulate_hold',1),event(first,'simulate_cancel',2),
      event(second,'simulate_hold',3)]});
  assert.equal(released.caps[0].simulatedHeldUnits,'20');
  assert.equal(released.caps[0].simulatedReleasedUnits,'20');
  assert.equal(released.entries[0].state,'simulation_cancelled');
});

test('exact retries are idempotent, altered repeats or duplicate holds are rejected',async()=>{
  const source=await createRehearsal(),key=source.intents[0].intent_key;
  const request=event(key,'simulate_hold',5);
  const same=await simulate(source,{events:[request,request]});
  assert.deepEqual(same.entries[0].eventIds,[request.eventId]);
  assert.equal(same.caps[0].simulatedHeldUnits,'20');
  await assert.rejects(simulate(source,{
    events:[request,{...request,action:'simulate_cancel'}]
  }),/ledger_rehearsal_conflicting_idempotency_key/);
  await assert.rejects(simulate(source,{
    events:[request,event(key,'simulate_hold',6)]
  }),/ledger_rehearsal_duplicate_hold/);
});

test('uncertain transfer never releases funds or allows blind retry/cancellation',async()=>{
  const source=await createRehearsal(),key=source.intents[0].intent_key;
  const pending=[event(key,'simulate_hold',1),event(key,'simulate_unknown',2)];
  const held=await simulate(source,{events:pending});
  assert.equal(held.entries[0].state,'simulation_transfer_unknown');
  assert.equal(held.caps[0].simulatedHeldUnits,'20');
  await assert.rejects(simulate(source,{
    events:[...pending,event(key,'simulate_cancel',3)]
  }),/ledger_rehearsal_cannot_cancel_uncertain_transfer/);
  await assert.rejects(simulate(source,{
    events:[...pending,event(key,'simulate_hold',3)]
  }),/ledger_rehearsal_duplicate_hold/);
});

test('unverified chain reconciliation is only a review marker, not confirmed payment',async()=>{
  const source=await createRehearsal(),a=source.intents[0],b=source.intents[1];
  const reconcile=(key,n)=>({...event(key,'simulate_reconcile',n),
    transactionId:'c'.repeat(64),chainActionSequence:'12345',
    blockId:'d'.repeat(64),blockNum:1000,account:'gkniftyheads',
    assetKey:KEY,units:'20'});
  const one=[event(a.intent_key,'simulate_hold',1),
    event(a.intent_key,'simulate_unknown',2),
    reconcile(a.intent_key,3)];
  const result=await simulate(source,{events:one});
  assert.equal(result.entries[0].state,'simulation_reconciliation_review');
  assert.equal(result.entries[0].confirmedOnChain,false);
  assert.equal(result.caps[0].simulatedHeldUnits,'20');
  assert.equal(result.caps[0].actualTransferredUnits,'0');
  await assert.rejects(simulate(source,{events:[
    ...one,event(b.intent_key,'simulate_hold',4),
    event(b.intent_key,'simulate_unknown',5),reconcile(b.intent_key,6)
  ]}),/ledger_rehearsal_chain_action_reused/);
  await assert.rejects(simulate(source,{events:[
    ...one.slice(0,2),{...reconcile(a.intent_key,3),account:'wrongaccount'}
  ]}),/ledger_rehearsal_reconciliation_evidence_invalid/);
});

test('forged source, wallet change, malformed cap and snapshot status fail closed',async()=>{
  const source=await createRehearsal(),a=source.intents[0];
  for(const mutated of [
    {...source,funded:true},
    {...source,executable:true},
    {...source,transferAttempted:true},
    {...source,intents:[{...a,destination_account:['gkniftyheads']}]},
    {...source,intents:[{...a,destination_account:'wrongaccount'}]},
    {...source,intents:[{...a,intent_key:'not-a-digest'}]},
    {...source,intents:[a,a]}
  ]){
    await assert.rejects(simulate(mutated),/ledger_rehearsal_/);
  }
  for(const invalidLimits of [
    [cap('100','0')],[cap('100','200')],[cap(),cap()],
    [{...cap(),dayKey:'2026-11-01'}]
  ]){
    await assert.rejects(simulate(source,{limits:invalidLimits}),/ledger_rehearsal_/);
  }
});

test('no signer, database access or WAX transfer is exposed by the module',async()=>{
  const source=await createRehearsal();
  const result=await simulate(source);
  for(const field of ['sign','broadcast','push_transaction','transfer',
    'approve','reserve','claim','transactionHash']){
    assert.equal(Object.hasOwn(result,field),false,field);
  }
  assert(result.blockers.includes('no_production_atomic_reservation_ledger'));
  assert.equal(result.funded,false);
  assert.equal(result.entries.length,20);
});