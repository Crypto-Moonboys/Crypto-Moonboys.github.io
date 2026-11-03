import assert from 'node:assert/strict';
import test from 'node:test';
import { assetKey } from '../workers/moonboys-api/tag-run/v2-core.js';
import {
  evaluateRegisteredWalletPayout, PAYOUT_ROUTE, PAYOUTS_IMPLEMENTED
} from '../workers/moonboys-api/tag-run/v2-payout-policy.js';

const HASH='a'.repeat(64);
const source={
  env:{
    TAG_RUN_V2_POOL_ENABLED:'true',
    TAG_RUN_V2_DRAWS_ENABLED:'true',
    TAG_RUN_V2_PAYOUTS_ENABLED:'true',
    TAG_RUN_V2_OBSERVATION_ENABLED:'false'
  },
  wallet:{
    telegram_id:'1111',wax_account:'memberwax123',verification_status:'verified',
    verified_at:'2026-11-03T00:00:00Z'
  },
  allocation:{
    telegramId:'1111',recipientAccount:'memberwax123',
    contract:'kingsofgraff',symbol:'LFGK',precision:4,
    assetKey:assetKey('kingsofgraff','LFGK',4),
    units:'1234567',status:'locked',snapshotDigest:HASH,
    rulesDigest:HASH,receiptsDigest:HASH
  },
  authority:{
    walletOwnershipProofValid:true,custodyVerified:true,
    donationConsentVerified:true,historicalSnapshotFinalized:true,
    assetApproved:true,legalReviewApproved:true,
    separateSpendingApproval:true,spendingLimitUnits:2000000,
    idempotencyAndReconciliationVerified:true
  }
};
const evaluate=(patch={})=>evaluateRegisteredWalletPayout({
  ...source,...patch,
  env:{...source.env,...(patch.env||{})},
  wallet:{...source.wallet,...(patch.wallet||{})},
  allocation:{...source.allocation,...(patch.allocation||{})},
  authority:{...source.authority,...(patch.authority||{})}
});

test('route is registered WAX account with no signer and no executable transfer',()=>{
  assert.equal(PAYOUT_ROUTE,'telegram_registered_wax_account');
  assert.equal(PAYOUTS_IMPLEMENTED,false);
  const decision=evaluate();
  assert.equal(decision.allowed,false);
  assert.equal(decision.recipientAccount,'memberwax123');
  assert.equal(decision.transferAttempted,false);
  assert(decision.blockers.includes('signer_and_transfer_system_not_implemented'));
  assert(Object.isFrozen(decision));
});

test('all existing funded gates OFF enforce payout block',()=>{
  const decision=evaluate({env:{
    TAG_RUN_V2_POOL_ENABLED:'false',
    TAG_RUN_V2_DRAWS_ENABLED:'false',
    TAG_RUN_V2_PAYOUTS_ENABLED:'false',
    TAG_RUN_V2_OBSERVATION_ENABLED:'true'
  }});
  for(const reason of ['payout_gate_disabled','draw_gate_disabled',
    'pool_gate_disabled','observation_mode_active']) {
    assert(decision.blockers.includes(reason),reason);
  }
});

test('a typed account or stolen Telegram ID is not wallet ownership proof',()=>{
  assert(evaluate({wallet:{verification_status:'pending',verified_at:null}})
    .blockers.includes('recipient_wallet_ownership_unverified'));
  assert(evaluate({authority:{walletOwnershipProofValid:false}})
    .blockers.includes('recipient_wallet_ownership_unverified'));
  assert(evaluate({wallet:{telegram_id:'2222'}})
    .blockers.includes('recipient_identity_mismatch'));
  assert(evaluate({wallet:{wax_account:'wrongaccount'}})
    .blockers.includes('recipient_wallet_ownership_unverified'));
});

test('invalid wallet or own custody account cannot be a payout recipient',()=>{
  assert(evaluate({wallet:{wax_account:'bad..name'}})
    .blockers.includes('recipient_wallet_invalid'));
  assert(evaluate({wallet:{wax_account:'isthatajoint'}})
    .blockers.includes('recipient_wallet_invalid'));
});

test('no allocation, wrong asset precision or zero units cannot be funded',()=>{
  for(const allocation of [
    {status:'preview_only'},
    {snapshotDigest:null},
    {assetKey:'invalid'},
    {units:'0'},
    {units:'1.5'}
  ]) {
    const decision=evaluate({allocation});
    assert(decision.allowed===false);
    assert(decision.blockers.includes('finalized_allocation_missing') ||
      decision.blockers.includes('allocation_asset_or_units_invalid'));
  }
});

test('independent custody, consent, legal and spending gates are all mandatory',()=>{
  for(const field of [
    'custodyVerified','donationConsentVerified','historicalSnapshotFinalized',
    'assetApproved','legalReviewApproved','separateSpendingApproval',
    'idempotencyAndReconciliationVerified'
  ]) {
    const decision=evaluate({authority:{[field]:false}});
    assert(decision.blockers.includes('operator_authorities_incomplete'),field);
  }
  assert(evaluate({authority:{spendingLimitUnits:0}})
    .blockers.includes('operator_authorities_incomplete'));
});

test('spending ceiling blocks exact base units above limit, not below or equal',()=>{
  for(const units of ['99','100']) {
    const decision=evaluate({
      allocation:{units},authority:{spendingLimitUnits:100}
    });
    assert.equal(decision.allowed,false,'payouts stay hard disabled');
    assert.equal(decision.transferAttempted,false);
    assert.equal(decision.blockers.includes('allocation_exceeds_spending_limit'),false,
      'allocation '+units+' is within the limit');
  }
  const over=evaluate({
    allocation:{units:'101'},authority:{spendingLimitUnits:100}
  });
  assert(over.blockers.includes('allocation_exceeds_spending_limit'));
  assert.equal(over.allowed,false);
  assert.equal(over.transferAttempted,false);
});

test('spending comparison uses BigInt without unsafe number coercion',()=>{
  const limit=Number.MAX_SAFE_INTEGER;
  const equal=evaluate({
    allocation:{units:String(limit)},authority:{spendingLimitUnits:limit}
  });
  assert.equal(equal.blockers.includes('allocation_exceeds_spending_limit'),false);
  const exceeded=evaluate({
    allocation:{units:(BigInt(limit)+1n).toString()},
    authority:{spendingLimitUnits:limit}
  });
  assert(exceeded.blockers.includes('allocation_exceeds_spending_limit'));
  assert.equal(exceeded.transferAttempted,false);
  const invalid=evaluate({authority:{spendingLimitUnits:limit+1}});
  assert(invalid.blockers.includes('operator_authorities_incomplete'));
  assert.equal(invalid.allowed,false);
});

test('preflight cannot be bypassed by setting every input to approved',()=>{
  const result=evaluate();
  assert.equal(result.allowed,false);
  assert.equal(result.transferAttempted,false);
  assert(result.blockers.includes('signer_and_transfer_system_not_implemented'));
});
