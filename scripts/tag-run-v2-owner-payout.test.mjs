import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOwnerCommand, validateDeployedPayoutSettings,
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
