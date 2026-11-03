import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { assetKey, sha256Text, TIP_ACCOUNT,
  WAX_MAINNET_CHAIN_ID } from '../workers/moonboys-api/tag-run/v2-core.js';
import {
  inspectWaxFundingEvidence, FUNDING_EVIDENCE_MODE,
  FUNDING_TRANSFERS_ENABLED, DEFAULT_CORROBORATORS
} from '../workers/moonboys-api/tag-run/v2-funding-evidence-review.js';
import {
  reconcileUnapprovedFunding, FUNDING_REVIEW_STATUS
} from '../workers/moonboys-api/tag-run/v2-funding-review-summary.js';

const BLOCK='b'.repeat(64),TX='a'.repeat(64);
const ASSET=assetKey('kingsofgraff','LFGK',4);
const memo='community gift';
async function receipt(seq='12345',amount='15000') {
  return {chainId:WAX_MAINNET_CHAIN_ID,globalSequence:seq,
    transactionId:TX,blockNum:123,blockId:BLOCK,
    sender:'gkniftyheads',recipient:TIP_ACCOUNT,
    contract:'kingsofgraff',symbol:'LFGK',precision:4,
    assetKey:ASSET,units:amount,
    memoDigest:await sha256Text(memo,webcrypto),status:'quarantined'};
}
function network({receiptRow,actions,modifyInfo,modifyBlock,modifyAccount,
  modifyStats,modifyBalances,secondAction,failAt}={}) {
  const calls=[];
  const evidence=receiptRow;
  const originalAction={
    global_sequence:evidence.globalSequence,block_num:evidence.blockNum,
    trx_id:evidence.transactionId,block_id:evidence.blockId,
    act:{account:evidence.contract,name:'transfer',
      data:{from:evidence.sender,to:evidence.recipient,
        quantity:'1.5000 LFGK',memo}}
  };
  const action=actions || [originalAction];
  const responses={
    get_info:{chain_id:WAX_MAINNET_CHAIN_ID,
      last_irreversible_block_num:125,last_irreversible_block_id:'d'.repeat(64),
      ...modifyInfo},
    get_account:{account_name:TIP_ACCOUNT,...modifyAccount},
    get_block:{block_num:123,id:BLOCK,...modifyBlock},
    get_currency_stats:{LFGK:{
      supply:'1000.0000 LFGK',max_supply:'100000000.0000 LFGK'
    },...modifyStats},
    get_currency_balance:modifyBalances === undefined
      ? ['1000.0000 LFGK'] : modifyBalances
  };
  const fetchImpl=async (url,options)=>{
    calls.push({url,options});
    const method=url.split('/').pop();
    if(failAt && (url.includes(failAt) || method===failAt)) {
      return {ok:false,status:503};
    }
    if(url.includes('/v1/chain/')) {
      return {ok:true,json:async()=>responses[method]};
    }
    if(url.includes('/v2/history/get_actions?')) {
      if(secondAction && url.startsWith(DEFAULT_CORROBORATORS[1])) {
        return {ok:true,json:async()=>({actions:secondAction})};
      }
      return {ok:true,json:async()=>({actions:action})};
    }
    throw new Error('unexpected endpoint '+url);
  };
  return {fetchImpl,calls,originalAction};
}
async function inspect(r,net){
  return inspectWaxFundingEvidence({
    receipts:Array.isArray(r)?r:[r],fetchImpl:net.fetchImpl,
    cryptoImpl:webcrypto
  });
}

test('two independent WAX indexers corroborate quarantined receipt against irreversible block and token stats',async()=>{
  const r=await receipt(),net=network({receiptRow:r});
  const proof=await inspect(r,net);
  assert.equal(FUNDING_TRANSFERS_ENABLED,false);
  assert.equal(proof.status,FUNDING_EVIDENCE_MODE);
  assert.equal(proof.account,TIP_ACCOUNT);
  assert.equal(proof.rpcLastIrreversibleBlock,125);
  assert.equal(proof.observations.length,1);
  assert.equal(proof.observations[0].corroborators,2);
  assert.equal(proof.observations[0].blockReferenceIrreversible,true);
  assert.equal(proof.observations[0].merkleInclusionProven,false);
  assert.equal(proof.observations[0].donationApproved,false);
  assert.equal(proof.observations[0].spendable,false);
  assert.equal(proof.observedBalances[0].currentHeadBalanceUnits,'10000000');
  assert.equal(proof.observedBalances[0].eligibleDonationUnits,'0');
  assert.equal(proof.historicalSnapshotFinalized,false);
  assert.equal(proof.treasuryCustodyVerified,false);
  assert.equal(proof.transferAttempted,false);
  assert.equal(net.calls.filter(x=>x.url.includes('/v2/history/get_actions?')).length,2);
  assert.equal(net.calls.filter(x=>x.url.includes('/v1/chain/get_block')).length,1);
  assert(net.calls.every(x=>!x.url.includes('/push_transaction') &&
    !x.url.includes('/sign_transaction')));
  assert(Object.isFrozen(proof));
  assert(Object.isFrozen(proof.observations));
});

test('accounting view does not promote any observed token into approved donations or payouts',async()=>{
  const r=await receipt(),net=network({receiptRow:r});
  const proof=await inspect(r,net);
  const summary=reconcileUnapprovedFunding({inspection:proof,
    knownExclusions:[{assetKey:ASSET,excludedUnits:'3000',reservedUnits:'2000'}]});
  assert.equal(summary.status,FUNDING_REVIEW_STATUS);
  assert.equal(summary.spendingEnabled,false);
  assert.equal(summary.fundsApproved,false);
  assert.equal(summary.historicalBalanceFinalized,false);
  assert.equal(summary.transferAttempted,false);
  assert.deepEqual(summary.assets.map(x=>({
    received:x.corroboratedHistoricalInboundUnits,
    head:x.currentHeadBalanceUnits,remaining:x.unverifiedHeadRemainderUnits,
    approved:x.independentlyApprovedDonationUnits,
    budget:x.fundedRewardBudgetUnits
  })),[{received:'15000',head:'10000000',
    remaining:'9995000',approved:'0',budget:'0'}]);
  assert(Object.isFrozen(summary.assets[0]));
});

test('malformed, conflicting, partial or missing history from either provider fails closed',async()=>{
  const r=await receipt();
  for(const altered of [
    [{...network({receiptRow:r}).originalAction,
      act:{account:'kingsofgraff',name:'transfer',
        data:{from:r.sender,to:TIP_ACCOUNT,quantity:'1.4000 LFGK',memo}}}],
    [],
    [network({receiptRow:r}).originalAction,
      network({receiptRow:r}).originalAction],
    [{...network({receiptRow:r}).originalAction,block_num:124}],
    [{...network({receiptRow:r}).originalAction,
      act:{account:'kingsofgraff',name:'transfer',
        data:{from:r.sender,to:TIP_ACCOUNT,quantity:'1.5000 LFGK',memo:'changed'}}}]
  ]) {
    const net=network({receiptRow:r,secondAction:altered});
    await assert.rejects(inspect(r,net),/funding_proof_/);
  }
  const failing=network({receiptRow:r,failAt:DEFAULT_CORROBORATORS[1]});
  await assert.rejects(inspect(r,failing),/funding_proof_historical_provider_unavailable/);
});

test('wrong chain, insufficient LIB, bad block, invalid precision and malformed head balance fail closed',async()=>{
  const r=await receipt();
  const fixtures=[
    {modifyInfo:{chain_id:'wrong'}},
    {modifyInfo:{last_irreversible_block_num:122}},
    {modifyBlock:{id:'c'.repeat(64)}},
    {modifyAccount:{account_name:'wrongaccount'}},
    {modifyStats:{LFGK:{supply:'1000.00 LFGK',
      max_supply:'100000000.0000 LFGK'}}},
    {modifyBalances:['1000.000 LFGK']},
    {modifyBalances:['1.0000 LFGK','2.0000 LFGK']}
  ];
  for(const extra of fixtures) {
    await assert.rejects(inspect(r,network({receiptRow:r,...extra})),
      /funding_proof_/);
  }
});

test('unsafe global sequence, duplicate chain event and untrusted provider identity fail closed',async()=>{
  const r=await receipt();
  for(const mutation of [
    {...r,globalSequence:'012345'},
    {...r,globalSequence:12345},
    {...r,status:'confirmed_donation'},
    {...r,recipient:'notourwallet'},
    {...r,assetKey:'wrong'},
    {...r,units:'0'}
  ]) {
    await assert.rejects(inspect(mutation,network({receiptRow:r})),
      /funding_proof_|invalid_token_units/);
  }
  await assert.rejects(inspect([r,r],network({receiptRow:r})),
    /funding_proof_duplicate_chain_action/);
  await assert.rejects(inspectWaxFundingEvidence({
    receipts:[r],fetchImpl:network({receiptRow:r}).fetchImpl,
    cryptoImpl:webcrypto,corroborators:[
      DEFAULT_CORROBORATORS[0],DEFAULT_CORROBORATORS[0]]
  }),/funding_proof_corroborators_not_independent/);
});

test('one chain block and token contract are queried once across multiple receipts',async()=>{
  const a=await receipt('12345'),b=await receipt('12346');
  const net=network({receiptRow:a});
  // Vary only sequence while retaining action fields and matching memo/amount.
  const original=net.fetchImpl;
  net.fetchImpl=async (url,opts)=>{
    if(url.includes('/v2/history/get_actions?')) {
      const seq=new URL(url).searchParams.get('global_sequence');
      const action={...net.originalAction,global_sequence:seq};
      return {ok:true,json:async()=>({actions:[action]})};
    }
    return original(url,opts);
  };
  const proof=await inspect([b,a],net);
  assert.deepEqual(proof.observations.map(x=>x.globalSequence),['12345','12346']);
  assert.equal(net.calls.filter(x=>x.url.endsWith('/get_block')).length,1);
  assert.equal(net.calls.filter(x=>x.url.endsWith('/get_currency_balance')).length,1);
  assert.equal(net.calls.filter(x=>x.url.endsWith('/get_currency_stats')).length,1);
});

test('funding reconciler fails closed on forged approval, duplicate records, unknown assets and balance deficits',async()=>{
  const r=await receipt(),net=network({receiptRow:r});
  const original=await inspect(r,net);
  for(const inspection of [
    {...original,fundingApproved:true},
    {...original,historicalSnapshotFinalized:true},
    {...original,observations:[...original.observations,...original.observations]},
    {...original,observations:[{...original.observations[0],donationApproved:true}]},
    {...original,observedBalances:[{...original.observedBalances[0],assetApproved:true}]},
    {...original,observedBalances:[]}
  ]){
    assert.throws(()=>reconcileUnapprovedFunding({inspection}),/funding_review_/);
  }
  assert.throws(()=>reconcileUnapprovedFunding({
    inspection:original,
    knownExclusions:[{assetKey:ASSET,reservedUnits:'9999999',excludedUnits:'2'}]
  }),/funding_review_current_head_deficit/);
  assert.throws(()=>reconcileUnapprovedFunding({
    inspection:original,
    knownExclusions:[{assetKey:ASSET,reservedUnits:'1',excludedUnits:'0'},
      {assetKey:ASSET,reservedUnits:'1',excludedUnits:'0'}]
  }),/funding_review_duplicate_or_unknown_exclusion/);
});

test('all network operations remain bounded read-only, never write D1 or use wallet signing',async()=>{
  const r=await receipt(),net=network({receiptRow:r});
  await inspect(r,net);
  const posts=net.calls.filter(x=>x.options?.method==='POST');
  assert(posts.length>0);
  assert(posts.every(x=>x.url.includes('/v1/chain/') &&
    /^get_(info|account|block|currency_stats|currency_balance)$/.test(
      x.url.split('/').pop())));
  assert(net.calls.filter(x=>x.url.includes('/v2/history/get_actions?'))
    .every(x=>x.options.method==='GET'));
});