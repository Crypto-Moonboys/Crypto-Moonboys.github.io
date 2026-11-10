import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOwnerCommand, validateDeployedPayoutSettings, makeD1RestAdapter,
  makeAnchorConsoleSigner, runOwnerPayout,
  assertAnchorTransfer, assertSignedAnchorTransfer, anchorResultTransactionId
} from './tag-run-v2-owner-payout.mjs';
import { WAX_MAINNET_CHAIN_ID, TIP_ACCOUNT, assetKey } from
  '../workers/moonboys-api/tag-run/v2-core.js';
import { buildReviewedWaxTransfer } from
  '../workers/moonboys-api/tag-run/v2-payout-executor.js';

import { contractPolicy, debitAuthority, contractRpc } from
  './fixtures/tag-run-v2/contract-send-fixture.mjs';
const ID='a'.repeat(64);
const D1='8a36e17a-18fa-4b98-90e1-3f269164b166';
const settings=Object.freeze({
  TAG_RUN_ENABLED:'true',
  TAG_RUN_WEEKLY_REWARDS_ENABLED:'false',
  TAG_RUN_V2_OBSERVATION_ENABLED:'false',
  TAG_RUN_V2_POOL_ENABLED:'true',
  TAG_RUN_V2_DRAWS_ENABLED:'true',
  TAG_RUN_V2_PAYOUTS_ENABLED:'true',
  TAG_RUN_V2_EXECUTOR_RELEASE_APPROVED:'true',
  TAG_RUN_V2_TIP_ACCOUNT:TIP_ACCOUNT
});
const makeSettings=(flags={})=>({
  bindings:[
    {name:'DB',type:'d1',id:D1},
    ...Object.entries({...settings,...flags}).map(([name,text])=>({
      name,type:'plain_text',text
    }))
  ]
});
const intent={intent_key:ID,status:'reserved',
  asset_key:assetKey('kingsofgraff','LFGK',4),
  receiving_account:'gkniftyheads',amount_units:'100'};
const request=buildReviewedWaxTransfer(intent);
function mockSigned({
  action=request.action, push=async()=>({transaction_id:ID}),
  signer={actor:TIP_ACCOUNT,permission:'tagrain'}, processed=undefined
}={}) {
  return {
    signer, processed,
    chain:{chainId:WAX_MAINNET_CHAIN_ID,client:{v1:{chain:{
      push_transaction:push
    }}}},
    signatures:['SIG_K1_fixture'],
    transaction:{
      actions:[{account:action.account,name:action.name,
        authorization:action.authorization,data:'00000000'}],
      context_free_actions:[],transaction_extensions:[],delay_sec:0
    },
    resolvedTransaction:{
      actions:[action],context_free_actions:[],
      transaction_extensions:[],delay_sec:0
    }
  };
}
const fakeAnchorModules = Link => async name => {
  if (name === 'anchor-link') return {default:Link};
  if (name === 'anchor-link-console-transport')
    return {default:class Transport{}};
  if (name === '@wharfkit/antelope') return {
    SignedTransaction:{from:tx=>({ ...tx,id:ID })},
    ABI:{from:source=>source},
    Serializer:{encode:({object})=>({
      toString:()=>object.to === request.destination ? '00000000' : 'ffffffff'
    })}
  };
  throw Error('unapproved mock import');
};
const mockWaxRpc = contractRpc();

test('all mutations require an explicit live flag',()=>{
  for(const command of ['send','reserve','create-cap','open-cap','reconcile']){
    assert.throws(()=>parseOwnerCommand([command,'--intent',ID]),
      /explicit_live_flag_required/);
  }
  assert.equal(parseOwnerCommand(['status','--intent',ID]).command,'status');
  assert.throws(()=>parseOwnerCommand(['send','--live','--live']),
    /invalid_option/);
});

test('operator refuses incomplete or conflicting deployed release flags',()=>{
  assert.equal(validateDeployedPayoutSettings(makeSettings())
    .TAG_RUN_V2_PAYOUTS_ENABLED,'true');
  assert.throws(()=>validateDeployedPayoutSettings(
    makeSettings({TAG_RUN_V2_PAYOUTS_ENABLED:'false'})),
    /deployed_release_not_authorized/);
  assert.throws(()=>validateDeployedPayoutSettings({
    bindings:[{name:'DB',type:'d1',id:'wrong'}]
  }),/worker_d1_binding_mismatch/);
  // The current Cloudflare API returns database_id and treats id as a
  // deprecated optional alias. Both shapes must be accepted.
  const modern=makeSettings();
  modern.bindings[0]={name:'DB',type:'d1',database_id:D1};
  assert.equal(validateDeployedPayoutSettings(modern)
    .TAG_RUN_V2_PAYOUTS_ENABLED,'true');
  modern.bindings[0].id='wrong';
  assert.throws(()=>validateDeployedPayoutSettings(modern),
    /worker_d1_binding_mismatch/);
});

test('signer enforces exact WAX chain and delegated tagrain permission',()=>{
  const action=assertAnchorTransfer(request);
  assert.equal(action.authorization[0].permission,'tagrain');
  assert.equal(action.data.to,'gkniftyheads');
  assert.throws(()=>assertAnchorTransfer({
    ...request,chainId:'f'.repeat(64)
  }),/signer_action_invalid/);
  assert.throws(()=>assertAnchorTransfer({
    ...request,action:{...request.action,
      authorization:[{actor:TIP_ACCOUNT,permission:'active'}]}
  }),/signer_action_invalid/);
  assert.throws(()=>assertAnchorTransfer({
    ...request,action:{...request.action,
      data:{...request.action.data,to:'wrongaccount'}}
  }),/signer_action_invalid/);
  assert.equal(request.chainId,WAX_MAINNET_CHAIN_ID);
});

test('a broadcast transaction ID never means irreversible confirmation',()=>{
  assert.equal(anchorResultTransactionId({response:{transaction_id:ID}}),ID);
  assert.equal(anchorResultTransactionId({processed:{id:'unverified'}}),null);
  assert.equal(anchorResultTransactionId({}),null);
});


test('D1 HTTP adapter binds values and checks successful query envelopes',async()=>{
  let body;
  const db=makeD1RestAdapter({accountId:'a'.repeat(32),
    token:'fixture-auth-token',
    fetchImpl:async(_url,opts)=>{
      body=JSON.parse(opts.body);
      return {ok:true,json:async()=>({success:true,result:[
        {success:true,results:[{intent_key:ID}],meta:{changes:0}}
      ]})};
    }
  });
  const row=await db.prepare('SELECT * FROM intents WHERE intent_key=?')
    .bind(ID).first();
  assert.equal(row.intent_key,ID);
  assert.deepEqual(body.params,[ID]);
  assert.equal(body.sql,'SELECT * FROM intents WHERE intent_key=?');
});

test('atomic remote D1 batch is one request with two statements',async()=>{
  let body;
  const db=makeD1RestAdapter({accountId:'a'.repeat(32),
    token:'fixture-auth-token',
    fetchImpl:async(_url,opts)=>{
      body=JSON.parse(opts.body);
      return {ok:true,json:async()=>({success:true,result:[
        {success:true,results:[],meta:{changes:1}},
        {success:true,results:[],meta:{changes:1}}
      ]})};
    }
  });
  await db.batch([
    db.prepare('UPDATE caps SET spent=?').bind('100'),
    db.prepare('INSERT INTO intents VALUES(?)').bind(ID)
  ]);
  assert.equal(body.batch.length,2);
  assert.deepEqual(body.batch[1].params,[ID]);
});

test('Anchor signs offline then rechecks authority before the ONE network broadcast',async()=>{
  let submitted,options,construct;
  const order=[];
  class Link{
    constructor(value){construct=value;}
    async transact(value,opts){
      order.push('anchor-sign');
      submitted=value;options=opts;
      return mockSigned({push:async()=>{
        order.push('broadcast');
        return {transaction_id:ID};
      }});
    }
  }
  const signer=await makeAnchorConsoleSigner({
    loadContractPolicy:async()=>contractPolicy(),
    beforeSign:async()=>debitAuthority(),
    importModule:fakeAnchorModules(Link),
    fetchImpl:mockWaxRpc,
    beforeBroadcast:async signedRequest=>{
      order.push('fresh-release-and-D1-check');
      assert.equal(signedRequest.intentKey,ID);
      return debitAuthority();
    }
  });
  const receipt=await signer(request);
  assert.deepEqual(receipt,{transactionId:ID});
  assert.equal(construct.chains[0].chainId,WAX_MAINNET_CHAIN_ID);
  assert.deepEqual(submitted.actions,[request.action]);
  assert.deepEqual(options,{broadcast:false,noModify:true});
  assert.deepEqual(order,['anchor-sign','fresh-release-and-D1-check','fresh-release-and-D1-check','broadcast']);
});

test('Anchor rejects missing delegated permission before signing',async()=>{
  let created=false;
  class Link{constructor(){created=true;}}
  await assert.rejects(makeAnchorConsoleSigner({
    loadContractPolicy:async()=>contractPolicy(),
    beforeSign:async()=>debitAuthority(),
    importModule:fakeAnchorModules(Link),
    beforeBroadcast:async()=>debitAuthority(),
    fetchImpl:async url=>({ok:true,json:async()=>url.endsWith('get_info')
      ?{chain_id:WAX_MAINNET_CHAIN_ID}
      :{account_name:TIP_ACCOUNT,permissions:[{perm_name:'active'}]}})
  }),/restricted_wax_permission_missing/);
  assert.equal(created,false);
});

test('signer requires a post-approval broadcasting guard',async()=>{
  await assert.rejects(makeAnchorConsoleSigner({
    loadContractPolicy:async()=>contractPolicy(),
    beforeSign:async()=>debitAuthority(),
    importModule:async()=>{throw Error('must not import');}
  }),/broadcast_guard_required/);
});

test('emergency revocation while Anchor approval is open prevents the push',async()=>{
  let approve, pushes=0, guardCalls=0, revoked=false;
  const approval=new Promise(resolve=>{approve=resolve;});
  class Link {
    async transact(){return await approval;}
  }
  const signer=await makeAnchorConsoleSigner({
    loadContractPolicy:async()=>contractPolicy(),
    beforeSign:async()=>debitAuthority(),
    importModule:fakeAnchorModules(Link),fetchImpl:mockWaxRpc,
    beforeBroadcast:async()=>{
      guardCalls++;
      if(revoked)throw Error('owner revoked payouts while Anchor was open');
      return debitAuthority();
    }
  });
  const attempt=signer(request);
  // The signed response is delayed: simulated user is still in Anchor.
  revoked=true;
  approve(mockSigned({push:async()=>{
    pushes++;
    return {transaction_id:ID};
  }}));
  await assert.rejects(attempt,/owner revoked payouts while Anchor was open/);
  assert.equal(guardCalls,1);
  assert.equal(pushes,0);
});

test('revoked D1 cap after approval also blocks the broadcast',async()=>{
  let paused=false,pushes=0;
  class Link {
    async transact(){
      paused=true;
      return mockSigned({push:async()=>{
        pushes++;
        return {transaction_id:ID};
      }});
    }
  }
  const signer=await makeAnchorConsoleSigner({
    loadContractPolicy:async()=>contractPolicy(),
    beforeSign:async()=>debitAuthority(),
    importModule:fakeAnchorModules(Link),fetchImpl:mockWaxRpc,
    beforeBroadcast:async()=>{
      if(paused)throw Error('broadcast_authorization_revoked');
    }
  });
  await assert.rejects(signer(request),/broadcast_authorization_revoked/);
  assert.equal(pushes,0);
});

test('modified Anchor transaction and extra actions never reach broadcaster',async()=>{
  const changed={
    ...request.action,
    data:{...request.action.data,to:'attacker1234'}
  };
  for(const signed of [
    mockSigned({action:changed}),
    mockSigned({processed:{id:ID}}),
    {...mockSigned(),signer:{actor:TIP_ACCOUNT,permission:'active'}},
    {...mockSigned(),resolvedTransaction:{
      ...mockSigned().resolvedTransaction,
      actions:[request.action,request.action]
    }},
    {...mockSigned(),transaction:{
      ...mockSigned().transaction,
      // The decoded display remains correct, but signed raw bytes were changed.
      actions:[{...mockSigned().transaction.actions[0],data:'ffffffff'}]
    }}
  ]){
    let pushed=false,checked=false;
    signed.chain.client.v1.chain.push_transaction=async()=>{pushed=true;};
    class Link {async transact(){return signed;}}
    const signer=await makeAnchorConsoleSigner({
    loadContractPolicy:async()=>contractPolicy(),
    beforeSign:async()=>debitAuthority(),
      importModule:fakeAnchorModules(Link),fetchImpl:mockWaxRpc,
      beforeBroadcast:async()=>{checked=true;}
    });
    await assert.rejects(signer(request),
      /anchor_signed_(transaction_modified|response_invalid)/);
    assert.equal(checked,false);
    assert.equal(pushed,false);
  }
});

test('push error does not trigger a second broadcast or automatic retry',async()=>{
  let pushes=0;
  class Link {
    async transact(){
      return mockSigned({push:async()=>{
        pushes++;
        throw Error('network timing uncertain');
      }});
    }
  }
  const signer=await makeAnchorConsoleSigner({
    loadContractPolicy:async()=>contractPolicy(),
    beforeSign:async()=>debitAuthority(),
    importModule:fakeAnchorModules(Link),fetchImpl:mockWaxRpc,
    beforeBroadcast:async()=>debitAuthority()
  });
  await assert.rejects(signer(request),/network timing uncertain/);
  assert.equal(pushes,1);
});

test('missing approval flags prevent any payout ledger mutation',async()=>{
  let calls=0;
  const vars={CLOUDFLARE_API_TOKEN:'fixture-auth-token',
    CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),
    TAG_RUN_OPERATOR_GROUP_ID:'-1001234567890'};
  await assert.rejects(runOwnerPayout(['send','--intent',ID,'--live'],{
    vars,fetchImpl:async()=>{
      calls++;
      return {ok:true,json:async()=>({success:true,
        result:makeSettings({TAG_RUN_V2_PAYOUTS_ENABLED:'false'})})};
    },
    confirmation:async()=>{throw Error('prompt should never run');},
    signerFactory:async()=>{throw Error('signer should never run');}
  }),/deployed_release_not_authorized/);
  assert.equal(calls,1);
});



test('owner SEND rechecks deployed flags after wallet approval, before broadcast',async()=>{
  const group='-1001234567890';
  const frozen={
    ...intent,chat_id:group,day_key:'2026-11-02',
    snapshot_digest:'f'.repeat(64)
  };
  let deployedReads=0,queries=0,signed=0,pushed=0,state='reserved';
  const response=(result)=>({ok:true,json:async()=>({success:true,result})});
  const fetchImpl=async(url,options={})=>{
    if(url.endsWith('/workers/scripts/moonboys-api/settings')){
      deployedReads++;
      return response(makeSettings(deployedReads>=3
        ?{TAG_RUN_V2_PAYOUTS_ENABLED:'false'}:{}));
    }
    if(url.endsWith('/query')){
      queries++;
      const sql=JSON.parse(options.body).sql;
      let row;
      if(sql.startsWith('SELECT * FROM tag_run_v2_payout_intents')){
        row={...frozen,status:state};
      } else if(sql.startsWith('SELECT wallet_account,status,daily_bps')){
        row={wallet_account:TIP_ACCOUNT,status:'review_only',
          daily_bps:500,active_daily_bps:100,active_policy_version:2,historical_ticket_bps:5000};
      } else if(sql.startsWith('SELECT paused FROM tag_run_v2_payout_caps')){
        row={paused:0};
      } else if(sql.startsWith('SELECT s.status,s.snapshot_digest')){
        row={status:'verified',snapshot_digest:frozen.snapshot_digest,
          eligibility:'approved'};
      } else if(sql.startsWith("UPDATE tag_run_v2_payout_intents SET status='broadcast_unknown'")){
        state='broadcast_unknown';
        return response([{success:true,results:[],meta:{changes:1}}]);
      } else {
        throw Error('unexpected D1 SQL in fixture');
      }
      return response([{success:true,results:row?[row]:[],meta:{changes:0}}]);
    }
    if(url.endsWith('/get_info')){
      return {ok:true,json:async()=>({chain_id:WAX_MAINNET_CHAIN_ID})};
    }
    if(url.endsWith('/get_account')){
      return {ok:true,json:async()=>({account_name:frozen.receiving_account})};
    }
    throw Error('unexpected API URL');
  };
  const previous=process.exitCode;
  try {
    await runOwnerPayout(['send','--intent',ID,'--live'],{
      vars:{CLOUDFLARE_API_TOKEN:'fixture-cloudflare-token',
        CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),
        TAG_RUN_OPERATOR_GROUP_ID:group},
      fetchImpl,
      loadContractPolicy:async()=>contractPolicy(),
      confirmation:async()=>{},
      signerFactory:async({beforeBroadcast})=>async(request)=>{
        signed++;
        // Simulate successful Anchor approval returning a signature.
        // The owner runner, not the test signer, controls the fresh gate.
        await beforeBroadcast(request);
        pushed++;
        return {transactionId:ID};
      },
      log:()=>{}
    });
  } finally {process.exitCode=previous;}
  assert.equal(deployedReads,3,'initial, pre-lock and post-sign checks');
  assert.equal(state,'broadcast_unknown');
  assert.equal(signed,1);
  assert.equal(pushed,0,'revocation must stop the network submission');
  assert.ok(queries>=5);
});

test('an already-broadcast payout can be reconciled while new sends are paused',()=>{
  const halted=makeSettings({
    TAG_RUN_V2_POOL_ENABLED:'false',
    TAG_RUN_V2_DRAWS_ENABLED:'false',
    TAG_RUN_V2_PAYOUTS_ENABLED:'false',
    TAG_RUN_V2_OBSERVATION_ENABLED:'true',
    TAG_RUN_V2_EXECUTOR_RELEASE_APPROVED:'false'
  });
  assert.throws(()=>validateDeployedPayoutSettings(halted),
    /deployed_release_not_authorized/);
  const permitted=validateDeployedPayoutSettings(halted,{reconciliationOnly:true});
  assert.equal(permitted.TAG_RUN_ENABLED,'true');
  assert.equal(permitted.TAG_RUN_V2_PAYOUTS_ENABLED,undefined);
});
