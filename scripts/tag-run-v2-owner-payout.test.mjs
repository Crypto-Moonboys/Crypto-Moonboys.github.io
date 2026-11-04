import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOwnerCommand, validateDeployedPayoutSettings, makeD1RestAdapter,
  makeAnchorConsoleSigner, runOwnerPayout,
  assertAnchorTransfer, anchorResultTransactionId
} from './tag-run-v2-owner-payout.mjs';
import { WAX_MAINNET_CHAIN_ID, TIP_ACCOUNT, assetKey } from
  '../workers/moonboys-api/tag-run/v2-core.js';
import { buildReviewedWaxTransfer } from
  '../workers/moonboys-api/tag-run/v2-payout-executor.js';

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

test('Anchor adapter signs and broadcasts exactly one immutable action',async()=>{
  let submitted,options,construct;
  class Link{
    constructor(value){construct=value;}
    async transact(value,opts){
      submitted=value;options=opts;
      return {response:{transaction_id:ID}};
    }
  }
  class Transport{}
  const signer=await makeAnchorConsoleSigner({
    importModule:async name=>name==='anchor-link'
      ?{default:Link}:{default:Transport},
    fetchImpl:async url=>({ok:true,json:async()=>url.endsWith('get_info')
      ?{chain_id:WAX_MAINNET_CHAIN_ID}
      :{account_name:TIP_ACCOUNT,permissions:[{perm_name:'tagrain'}]}})
  });
  const receipt=await signer(request);
  assert.deepEqual(receipt,{transactionId:ID});
  assert.equal(construct.chains[0].chainId,WAX_MAINNET_CHAIN_ID);
  assert.deepEqual(submitted.actions,[request.action]);
  assert.deepEqual(options,{broadcast:true,noModify:true});
});

test('Anchor rejects missing delegated permission before signing',async()=>{
  let created=false;
  class Link{constructor(){created=true;}}
  await assert.rejects(makeAnchorConsoleSigner({
    importModule:async name=>name==='anchor-link'
      ?{default:Link}:{default:class Transport{}},
    fetchImpl:async url=>({ok:true,json:async()=>url.endsWith('get_info')
      ?{chain_id:WAX_MAINNET_CHAIN_ID}
      :{account_name:TIP_ACCOUNT,permissions:[{perm_name:'active'}]}})
  }),/restricted_wax_permission_missing/);
  assert.equal(created,false);
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
