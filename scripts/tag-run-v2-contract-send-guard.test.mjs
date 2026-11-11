import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  loadApprovedContractPolicy, requireApprovedContract, assertPayoutDebitAuthority,
  inspectApprovedPayoutContract, assertUnchangedPayoutContract
} from './tag-run-v2-contract-send-guard.mjs';
import { makeAnchorConsoleSigner, runOwnerPayout } from './tag-run-v2-owner-payout.mjs';
import { buildReviewedWaxTransfer } from '../workers/moonboys-api/tag-run/v2-payout-executor.js';
import { assetKey, TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, formatQuantity } from '../workers/moonboys-api/tag-run/v2-core.js';
import { contractPolicy, debitAuthority, contractRpc, CODE, ABI } from './fixtures/tag-run-v2/contract-send-fixture.mjs';

const ID = 'a'.repeat(64), GROUP = '-1001234567890';
const intent = {intent_key:ID,status:'reserved',asset_key:assetKey('kingsofgraff','LFGK',4),
  amount_units:'100',receiving_account:'gkniftyheads'};
const request = buildReviewedWaxTransfer(intent);
const inspect = (options={}) => inspectApprovedPayoutContract({request,policy:contractPolicy(),
  debitAuthority:debitAuthority(),fetchImpl:contractRpc(),...options});
const rawConfig = (symbol='LFGK',tradeable=1,fees='00') => {
  const bytes=Buffer.alloc(9);bytes.write(symbol,0,'ascii');bytes[8]=tradeable;
  return bytes.toString('hex')+fees;
};
function signed(push=async()=>({transaction_id:ID})) {
  return {signer:{actor:TIP_ACCOUNT,permission:'tagrain'},
    chain:{chainId:WAX_MAINNET_CHAIN_ID,client:{v1:{chain:{push_transaction:push}}}},
    signatures:['SIG_K1_fixture'],transaction:{actions:[{...request.action,data:'00000000'}],
      context_free_actions:[],transaction_extensions:[],delay_sec:0},
    resolvedTransaction:{actions:[structuredClone(request.action)],context_free_actions:[],
      transaction_extensions:[],delay_sec:0}};
}
const modules = Link => async name => {
  if(name==='anchor-link')return {default:Link};
  if(name==='anchor-link-console-transport')return {default:class Transport{}};
  if(name==='@wharfkit/antelope')return {SignedTransaction:{from:tx=>({...tx,id:ID})},
    ABI:{from:v=>v},Serializer:{encode:()=>({toString:()=> '00000000'})}};
  throw Error('unexpected module');
};
function makeSigner(Link, state={}, options={}) {
  return makeAnchorConsoleSigner({importModule:modules(Link),fetchImpl:contractRpc(state),
    beforeSign:async()=>debitAuthority(),beforeBroadcast:async()=>debitAuthority(),
    loadContractPolicy:async()=>contractPolicy(),...options});
}

test('checked-in registry is empty and missing approval makes zero RPC calls',async()=>{
  const policy=await loadApprovedContractPolicy();
  assert.deepEqual(policy,{schemaVersion:1,approvals:[]});
  let calls=0;
  await assert.rejects(inspect({policy,fetchImpl:async()=>{calls++;}}),/independent_approval_missing/);
  assert.equal(calls,0);
});
test('policy requires exact token identity, audited code/ABI pins and review provenance',()=>{
  for(const mutate of [p=>{p.approvals[0].assetKey=assetKey('kingsofgraff','DUMPIT',8);},
    p=>{delete p.approvals[0].auditReviewer;},p=>{delete p.approvals[0].auditReference;},
    p=>{p.approvals[0].codeHash='0'.repeat(64);},p=>{p.approvals[0].abiHash='observed';},
    p=>{p.approvals.push({...p.approvals[0]});},p=>{p.schemaVersion=2;}]){
    const p=contractPolicy();mutate(p);
    assert.throws(()=>requireApprovedContract(p,request),/invalid_policy|independent_approval_missing/);
  }
});
test('expired approval and unsupported fee adapters fail closed',()=>{
  const p=contractPolicy();p.approvals[0].validUntil='2026-01-01T00:00:00.000Z';
  assert.throws(()=>requireApprovedContract(p,request),/approval_expired/);
  p.approvals[0].adapter='audited-static-zero-fee-v1';p.approvals[0].configState='none';
  assert.throws(()=>requireApprovedContract(p,request),/invalid_policy/);
});
test('two independent reads produce zero fee debit equal to exact reservation',async()=>{
  const result=await inspect();
  assert.equal(result.totalDebitUnits,'100');assert.equal(result.feeUnits,'0');
  assert.equal(result.requiredBalanceUnits,'100');
});
test('wrong amount/precision cannot reuse an approved identity or debit authority',async()=>{
  const altered={...request,amountUnits:'101'};
  await assert.rejects(inspect({request:altered}),/invalid_request/);
  const other=buildReviewedWaxTransfer({...intent,asset_key:assetKey('kingsofgraff','LFGK',8)});
  await assert.rejects(inspect({request:other}),/independent_approval_missing/);
});
test('fee or amount cannot exceed per-transfer, cumulative daily or 1% snapshot budget',()=>{
  for(const change of [{amount_units:'101'},{committed_units:'99'},{committed_units:'1001'},
    {per_transfer_limit_units:'99'},{daily_limit_units:'1001'},{daily_reward_units:'1001'},
    {cap_reward_policy_bps:500},{reward_policy_bps:500},{spendable_units:'99999'},
    {onchain_units:'0'}]){
    assert.throws(()=>assertPayoutDebitAuthority({...debitAuthority(),...change},request),
      /debit_authority_invalid|total_debit_exceeds_reservation_or_cap/);
  }
});
test('BigInt reservation and balance checks preserve units above JS-safe range',async()=>{
  const amount='9007199254740993', total=(BigInt(amount)*100n).toString();
  const req=buildReviewedWaxTransfer({...intent,amount_units:amount});
  const authority={...debitAuthority(),outstanding_bundle_units_json:JSON.stringify([amount]),amount_units:amount,committed_units:amount,
    daily_limit_units:amount,per_transfer_limit_units:amount,onchain_units:total,
    spendable_units:total,daily_reward_units:amount};
  const result=await inspect({request:req,debitAuthority:authority,
    fetchImpl:contractRpc({balance:formatQuantity(total,4,'LFGK')})});
  assert.equal(result.totalDebitUnits,amount);
});
test('current balance protects existing reservations and excluded funds',async()=>{
  const authority={...debitAuthority(),onchain_units:'100200',allocated_unpaid_units:'100',excluded_units:'100'};
  await assert.rejects(inspect({debitAuthority:authority,
    fetchImpl:contractRpc({balance:'0.0299 LFGK'})}),/treasury_reservation_deficit/);
  assert.equal((await inspect({debitAuthority:authority,
    fetchImpl:contractRpc({balance:'0.0300 LFGK'})})).requiredBalanceUnits,'300');
});
test('code changes or ABI byte/hash mismatches block either provider',async()=>{
  await assert.rejects(inspect({fetchImpl:contractRpc({codeHash:'c'.repeat(64)})}),/code_hash_changed/);
  for(const update of [r=>({...r,abi_hash:'c'.repeat(64)}),r=>({...r,abi:'ZmFrZQ=='}),r=>({...r,abi:''})]){
    await assert.rejects(inspect({fetchImpl:contractRpc({override:({method,result})=>
      method==='get_raw_abi'?update(result):result})}),/abi_hash_changed/);
  }
});
test('code replacement during provider observation blocks end-of-read bracket',async()=>{
  const counts=new Map();
  await assert.rejects(inspect({fetchImpl:contractRpc({override:({host,method,result})=>{
    if(method==='get_code_hash'){
      const count=(counts.get(host)||0)+1;counts.set(host,count);
      if(count===2)return {...result,code_hash:'c'.repeat(64)};
    }return result;
  }})}),/code_hash_changed/);
});
test('configuration reads use raw exact symbol-code bounds and never live ABI JSON',async()=>{
  const calls=[];await inspect({fetchImpl:contractRpc({calls})});
  const queries=calls.filter(c=>c.method==='get_table_rows');assert.equal(queries.length,2);
  for(const {body} of queries){assert.equal(body.json,false);assert.equal(body.limit,2);
    assert.equal(body.lower_bound,'1262962252');assert.equal(body.upper_bound,body.lower_bound);}
});
test('explicitly reviewed zero-fee tradeable row passes; presence drift blocks',async()=>{
  const state={configHex:rawConfig()};
  await assert.rejects(inspect({fetchImpl:contractRpc(state)}),/configuration_changed/);
  const policy=contractPolicy();policy.approvals[0].configState='zero-fee-tradeable';
  assert.equal((await inspect({policy,fetchImpl:contractRpc(state)})).feeUnits,'0');
  await assert.rejects(inspect({policy}),/configuration_changed/);
});
test('nonempty fee vectors, restrictions, wrong symbols and malformed rows reject',async()=>{
  const p=contractPolicy();p.approvals[0].configState='zero-fee-tradeable';
  for(const [raw,error] of [[rawConfig('LFGK',1,'01'+'00'.repeat(12)),/unsupported_transfer_fees/],
    [rawConfig('LFGK',0),/token_transfer_restricted/],[rawConfig('DUMPIT'),/config_unavailable/],
    ['bad hex',/config_unavailable/],[rawConfig()+'00',/unsupported_transfer_fees/]]){
    await assert.rejects(inspect({policy:p,fetchImpl:contractRpc({configHex:raw})}),error);
  }
});
test('incomplete, duplicate and JSON-decoded config responses cannot pass as empty',async()=>{
  for(const table of [{rows:[],more:true},{rows:[rawConfig(),rawConfig()],more:false},
    {rows:[{code:'LFGK',is_tradeable:1,tx_fees:[]}],more:false},
    {rows:[],more:false,next_key:'continuation'},{}]){
    await assert.rejects(inspect({fetchImpl:contractRpc({override:({method,result})=>
      method==='get_table_rows'?table:result})}),/config_unavailable/);
  }
});
test('provider balance disagreement, incorrect chain or permission scope blocks',async()=>{
  await assert.rejects(inspect({fetchImpl:contractRpc({override:({host,method,result})=>
    host==='wax.eosphere.io'&&method==='get_currency_balance'?['999999.0000 LFGK']:result})}),/provider_disagreement/);
  await assert.rejects(inspect({fetchImpl:contractRpc({override:({method,result})=>
    method==='get_info'?{...result,chain_id:'0'.repeat(64)}:result})}),/wrong_chain/);
  await assert.rejects(inspect({fetchImpl:contractRpc({links:[{account:'kingsofgraff',action:'issue'}]})}),/permission_scope_invalid/);
});
test('RPC outage, oversized body and invalid JSON expose only bounded errors',async()=>{
  for(const fetchImpl of [async()=>{throw Error('secret fixture token');},
    async()=>new Response('invalid json'),async()=>new Response('x'.repeat(524289))]){
    await assert.rejects(inspect({fetchImpl}),error=>
      error.message==='tag_run_contract_rpc_unavailable');
  }
});
test('independently reviewed static zero-fee contracts use no kingsofgraff tables',async()=>{
  const req=buildReviewedWaxTransfer({...intent,asset_key:assetKey('eosio.token','WAX',8)});
  const p=contractPolicy();p.approvals.push({...p.approvals[0],assetKey:req.chainId+':eosio.token:WAX:8',
    adapter:'audited-static-zero-fee-v1',configState:'none'});
  const calls=[];
  await inspect({request:req,policy:p,fetchImpl:contractRpc({calls,balance:'1.00000000 WAX',
    links:[{account:'kingsofgraff',action:'transfer'},{account:'eosio.token',action:'transfer'}]})});
  assert.equal(calls.some(c=>c.method==='get_table_rows'),false);
});
test('policy digest catches changed review approval even with unchanged chain state',async()=>{
  const before=await inspect();const p=contractPolicy();p.approvals[0].auditReference='different review';
  const after=await inspect({policy:p});
  assert.throws(()=>assertUnchangedPayoutContract(before,after),/configuration_changed/);
});

for(const [label,change] of [
  ['contract code',s=>{s.codeHash='c'.repeat(64);}],
  ['ABI',s=>{s.abiHash='c'.repeat(64);}],
  ['transfer fees',s=>{s.configHex=rawConfig('LFGK',1,'01'+'00'.repeat(12));}],
  ['tradeability',s=>{s.configHex=rawConfig('LFGK',0);}],
  ['configuration presence',s=>{s.configHex=rawConfig();}],
  ['treasury balance',s=>{s.balance='0.0001 LFGK';}]
])test(label+' change during an open Anchor prompt prevents broadcast',{timeout:3000},async()=>{
  let enter,approve,pushes=0,signs=0;
  const entered=new Promise(r=>{enter=r;}),approval=new Promise(r=>{approve=r;});
  class Link {async transact(){signs++;enter();return approval;}}
  const state={};const signer=await makeSigner(Link,state);const attempt=signer(request);
  await entered;change(state);approve(signed(async()=>{pushes++;return {transaction_id:ID};}));
  await assert.rejects(attempt,/tag_run_contract_/);assert.equal(signs,1);assert.equal(pushes,0);
});
test('approval removal while Anchor is open blocks instead of accepting cached policy',async()=>{
  let p=contractPolicy(),pushes=0;
  class Link {async transact(){p.approvals=[];return signed(async()=>{pushes++;return {transaction_id:ID};});}}
  const signer=await makeSigner(Link,{}, {loadContractPolicy:async()=>structuredClone(p)});
  await assert.rejects(signer(request),/independent_approval_missing/);assert.equal(pushes,0);
});
test('code/fee checks happen before requesting the first wallet signature',async()=>{
  let signs=0;
  class Link {async transact(){signs++;return signed();}}
  const signer=await makeSigner(Link,{codeHash:'c'.repeat(64)});
  await assert.rejects(signer(request),/code_hash_changed/);assert.equal(signs,0);
});
test('pause while final RPC checks are running blocks at the last D1 guard',async()=>{
  let signedAlready=false,paused=false,pushes=0;
  class Link {async transact(){signedAlready=true;return signed(async()=>{pushes++;return {transaction_id:ID};});}}
  const state={override:({method,result})=>{if(signedAlready&&method==='get_raw_abi')paused=true;return result;}};
  const signer=await makeSigner(Link,state,{beforeBroadcast:async()=>{
    if(paused)throw Error('payout paused during RPC');return debitAuthority();
  }});
  await assert.rejects(signer(request),/payout paused during RPC/);assert.equal(pushes,0);
});
test('reservation increase during final RPC must still be covered by observed balance',async()=>{
  let guards=0,pushes=0;
  class Link {async transact(){return signed(async()=>{pushes++;return {transaction_id:ID};});}}
  const signer=await makeSigner(Link,{balance:'0.0100 LFGK'},{beforeBroadcast:async()=>{
    guards++;return {...debitAuthority(),committed_units:guards===1?'100':'200'};
  }});
  await assert.rejects(signer(request),/treasury_reservation_deficit/);assert.equal(pushes,0);
});
test('caller mutation cannot change the frozen request while Anchor is open',{timeout:3000},async()=>{
  let enter,approve;const entered=new Promise(r=>{enter=r;}),approval=new Promise(r=>{approve=r;});
  class Link {async transact(){enter();return approval;}}
  const input=structuredClone(request),signer=await makeSigner(Link),attempt=signer(input);
  await entered;input.action.data.to='attacker1234';input.destination='attacker1234';approve(signed());
  assert.deepEqual(await attempt,{transactionId:ID});
});

const settings = () => ({bindings:[{name:'DB',type:'d1',database_id:'8a36e17a-18fa-4b98-90e1-3f269164b166'},
  ...Object.entries({TAG_RUN_ENABLED:'true',TAG_RUN_WEEKLY_REWARDS_ENABLED:'false',
    TAG_RUN_V2_OBSERVATION_ENABLED:'false',TAG_RUN_V2_POOL_ENABLED:'true',TAG_RUN_V2_DRAWS_ENABLED:'true',
    TAG_RUN_V2_PAYOUTS_ENABLED:'true',TAG_RUN_V2_EXECUTOR_RELEASE_APPROVED:'true',TAG_RUN_V2_TIP_ACCOUNT:TIP_ACCOUNT})
    .map(([name,text])=>({name,type:'plain_text',text}))]});
function ownerFlow(state={}) {
  const frozen={...intent,chat_id:GROUP,day_key:'2026-11-02',snapshot_digest:'f'.repeat(64)};
  const chain=contractRpc(state);state.ledger='reserved';state.logs=[];state.signs=0;state.pushes=0;state.queries=[];
  const api=result=>new Response(JSON.stringify({success:true,result}));
  const fetchImpl=async(url,options={})=>{
    if(url.endsWith('/settings'))return api(settings());
    if(url.endsWith('/query')){
      const {sql}=JSON.parse(options.body);state.queries.push(sql);let row;
      if(sql.startsWith('SELECT * FROM tag_run_v2_payout_intents'))row={...frozen,status:state.ledger};
      else if(sql.startsWith('SELECT wallet_account,status,daily_bps'))row={wallet_account:TIP_ACCOUNT,status:'review_only',
        daily_bps:500,active_daily_bps:100,active_policy_version:2,historical_ticket_bps:5000};
      else if(sql.startsWith('SELECT paused FROM tag_run_v2_payout_caps'))row={paused:0};
      else if(sql.startsWith('SELECT s.status,s.snapshot_digest'))row={status:'verified',snapshot_digest:frozen.snapshot_digest,eligibility:'approved'};
      else if(sql.startsWith('SELECT i.intent_key,i.amount_units'))row={intent_key:ID,...debitAuthority()};
      else if(sql.startsWith("UPDATE tag_run_v2_payout_intents SET status='broadcast_unknown'")){
        state.ledger='broadcast_unknown';return api([{success:true,results:[],meta:{changes:1}}]);
      }else throw Error('unexpected query');
      return api([{success:true,results:[row],meta:{changes:0}}]);
    }
    if(url.endsWith('/get_account')&&JSON.parse(options.body).account_name==='gkniftyheads')
      return new Response(JSON.stringify({account_name:'gkniftyheads'}));
    return chain(url,options);
  };
  class Link {async transact(){state.signs++;state.changeDuringPrompt?.();return signed(async()=>{
    state.pushes++;return {transaction_id:ID};
  });}}
  return {vars:{CLOUDFLARE_API_TOKEN:'fixture-auth-token',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),
    TAG_RUN_OPERATOR_GROUP_ID:GROUP},fetchImpl,confirmation:async()=>{},
    signerFactory:options=>makeAnchorConsoleSigner({...options,importModule:modules(Link)}),
    loadContractPolicy:async()=>contractPolicy(),log:text=>state.logs.push(JSON.parse(text))};
}
test('real owner flow reads debit authority before signing and twice before broadcast',async()=>{
  const state={},options=ownerFlow(state);
  await runOwnerPayout(['send','--intent',ID,'--live'],options);
  assert.equal(state.signs,1);assert.equal(state.pushes,1);assert.equal(state.ledger,'broadcast_unknown');
  assert.equal(state.queries.filter(s=>s.startsWith('SELECT i.intent_key,i.amount_units')).length,3);
  assert.equal(state.logs[0].confirmed,false);
  // Compile the actual new owner query against canonical D1 schema, not
  // a mock-only table definition, including its positional bind count.
  const sqlite=new DatabaseSync(':memory:');
  try {
    sqlite.exec(readFileSync(new URL('../workers/moonboys-api/schema.sql',import.meta.url),'utf8'));
    const sql=state.queries.find(s=>s.startsWith('SELECT i.intent_key,i.amount_units'));
    assert.deepEqual(sqlite.prepare(sql).all(ID,GROUP,intent.asset_key,intent.receiving_account,intent.amount_units),[]);
  } finally {sqlite.close();}
});
test('real owner flow holds UNKNOWN without retry when code changes during approval',async()=>{
  const state={},options=ownerFlow(state);state.changeDuringPrompt=()=>{state.codeHash='c'.repeat(64);};
  const previous=process.exitCode;
  try {await runOwnerPayout(['send','--intent',ID,'--live'],options);}
  finally {process.exitCode=previous;}
  assert.equal(state.signs,1);assert.equal(state.pushes,0);assert.equal(state.ledger,'broadcast_unknown');
  assert.equal(state.logs[0].manualReconciliationRequired,true);
});
test('missing production approval blocks owner flow before confirmation, signing or UNKNOWN',async()=>{
  const state={},options=ownerFlow(state);delete options.loadContractPolicy;
  options.confirmation=async()=>{throw Error('confirmation must not run');};
  await assert.rejects(runOwnerPayout(['send','--intent',ID,'--live'],options),/independent_approval_missing/);
  assert.equal(state.signs,0);assert.equal(state.pushes,0);assert.equal(state.ledger,'reserved');
});

test('approval changes during presign RPC reads are caught before Anchor opens',async()=>{
  let p=contractPolicy(),signs=0;
  class Link {async transact(){signs++;return signed();}}
  const state={override:({method,result})=>{
    if(method==='get_currency_balance')p.approvals=[];
    return result;
  }};
  const signer=await makeSigner(Link,state,{loadContractPolicy:async()=>structuredClone(p)});
  await assert.rejects(signer(request),/independent_approval_missing/);assert.equal(signs,0);
});
test('permission key or link revocation while Anchor is open also prevents push',async()=>{
  let pushes=0;
  const state={};
  class Link {async transact(){state.links=[];return signed(async()=>{pushes++;return {transaction_id:ID};});}}
  const signer=await makeSigner(Link,state);
  await assert.rejects(signer(request),/permission_scope_invalid/);assert.equal(pushes,0);
});

test('owner/active controller disagreement between providers blocks actual signer guard',async()=>{
  const state={override:({host,method,result})=>{
    if(host==='wax.eosphere.io'&&method==='get_account')
      result.permissions.find(p=>p.perm_name==='owner').required_auth.keys[0].key='different_public_controller';
    return result;
  }};
  await assert.rejects(inspect({fetchImpl:contractRpc(state)}),/provider_disagreement/);
});
test('controller changes agreed by both providers during Anchor prompt still block',async()=>{
  let changed=false,pushes=0;
  class Link {async transact(){changed=true;return signed(async()=>{pushes++;return {transaction_id:ID};});}}
  const state={override:({method,result})=>{
    if(changed&&method==='get_account')
      result.permissions.find(p=>p.perm_name==='active').required_auth.threshold=2;
    return result;
  }};
  const signer=await makeSigner(Link,state);
  await assert.rejects(signer(request),/configuration_changed/);assert.equal(pushes,0);
});

test('unregistered and not-yet-intented winner bundles remain protected treasury liabilities',async()=>{
  const authority={...debitAuthority(),outstanding_bundle_units_json:'["100","900"]'};
  await assert.rejects(inspect({debitAuthority:authority,fetchImpl:contractRpc({balance:'0.0999 LFGK'})}),/treasury_reservation_deficit/);
  const result=await inspect({debitAuthority:authority,fetchImpl:contractRpc({balance:'0.1000 LFGK'})});
  assert.equal(result.requiredBalanceUnits,'1000');assert.equal(result.totalDebitUnits,'100');
});

test('missing, malformed, oversized or insufficient bundle liabilities block debit authority',()=>{
  for(const value of [undefined,'not-json','null','[]','["99"]','["-1"]','[100]',JSON.stringify(Array(20001).fill('1'))])
    assert.throws(()=>assertPayoutDebitAuthority({...debitAuthority(),outstanding_bundle_units_json:value},request));
});
