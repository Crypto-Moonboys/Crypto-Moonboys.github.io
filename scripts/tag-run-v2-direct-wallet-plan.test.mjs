import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { assetKey, previewCommunityDraw, TIP_ACCOUNT } from
  '../workers/moonboys-api/tag-run/v2-core.js';
import { buildDirectWalletPayoutPlan, DIRECT_PAYOUT_EXECUTION_AVAILABLE,
  DIRECT_PAYOUT_PLAN_MODE } from
  '../workers/moonboys-api/tag-run/v2-direct-wallet-plan.js';

const KEY=assetKey('kingsofgraff','LFGK',4), SEED='ab'.repeat(32);
const input=()=>({
  day:'2026-11-02',wallet:TIP_ACCOUNT,seedHex:SEED,
  cryptoImpl:webcrypto,
  assets:[{key:KEY,contract:'kingsofgraff',symbol:'LFGK',precision:4,
    balanceUnits:'100000',reservedUnits:'0',excludedUnits:'0',approved:true,confirmed:true}],
  current:[{telegramId:'1111',points:10}],
  historical:[]
});
const preview=()=>previewCommunityDraw(input());
const destinations=[{telegramId:'1111',account:'gkniftyheads',
  registered:true,chainAccountChecked:true}];

test('real preview can produce deterministic proposed direct-to-registered-account plan',async()=>{
  const first=await buildDirectWalletPayoutPlan({
    preview:await preview(),destinations,cryptoImpl:webcrypto
  });
  const second=await buildDirectWalletPayoutPlan({
    preview:await preview(),destinations,cryptoImpl:webcrypto
  });
  assert.deepEqual(first,second);
  assert.equal(first.wallet,TIP_ACCOUNT);
  assert.equal(first.day,'2026-11-02');
  assert.equal(first.status,DIRECT_PAYOUT_PLAN_MODE);
  assert.equal(DIRECT_PAYOUT_EXECUTION_AVAILABLE,false);
  assert.equal(first.executable,false);
  assert.equal(first.transferAttempted,false);
  assert.equal(first.missingDestinations,0);
  assert(first.entries.every(e=>e.receivingAccount==='gkniftyheads' &&
    e.status==='simulation_only' && /^[a-f0-9]{64}$/.test(e.idempotencyKey)));
  assert.deepEqual(first.totals.map(t=>({
    budget:t.dailyBudgetUnits,allocated:t.hypotheticalAllocatedUnits,
    remaining:t.hypotheticalUnallocatedUnits
  })),[{budget:'5000',allocated:'5000',remaining:'0'}]);
  assert(first.blockers.includes('no_signer_or_transfer_executor'));
  assert(Object.isFrozen(first.entries));
});

test('missing or unchecked user-selected account is flagged without changing the destination',async()=>{
  for (const dest of [
    [],
    [{telegramId:'1111',account:'',registered:false,chainAccountChecked:false}],
    [{telegramId:'1111',account:'gkniftyheads',registered:true,chainAccountChecked:false}]
  ]) {
    const plan=await buildDirectWalletPayoutPlan({
      preview:await preview(),destinations:dest,cryptoImpl:webcrypto
    });
    assert.equal(plan.missingDestinations,20);
    assert(plan.entries.every(e=>e.blocker));
    assert.equal(plan.executable,false);
    assert.equal(plan.transferAttempted,false);
  }
});

test('distinct bundle allocations may share a winning member but duplicate slots cannot',async()=>{
  const data=await preview();
  const invalid={...data,bundles:[data.bundles[0],data.bundles[0]]};
  await assert.rejects(buildDirectWalletPayoutPlan({
    preview:invalid,destinations,cryptoImpl:webcrypto
  }),/payout_plan_duplicate_bundle_slot/);
});

test('a simulated allocation exceeding five percent cannot be proposed',async()=>{
  const data=await preview();
  const invalid={...data,bundles:[{...data.bundles[0],units:'5001'}]};
  await assert.rejects(buildDirectWalletPayoutPlan({
    preview:invalid,destinations,cryptoImpl:webcrypto
  }),/payout_plan_exceeds_daily_asset_budget/);
});

test('available units must match balance less all reserved and excluded units',async()=>{
  const original=await preview();
  const valid=await previewCommunityDraw({
    ...input(),
    assets:[{...input().assets[0],
      balanceUnits:'100000',reservedUnits:'20000',excludedUnits:'40000'}]
  });
  const reconciled=await buildDirectWalletPayoutPlan({
    preview:valid,destinations,cryptoImpl:webcrypto
  });
  assert.deepEqual(reconciled.totals.map(t=>({
    budget:t.dailyBudgetUnits,allocated:t.hypotheticalAllocatedUnits,
    remaining:t.hypotheticalUnallocatedUnits
  })),[{budget:'2000',allocated:'2000',remaining:'0'}]);

  // An attacker adjusting both availability and the daily budget can no
  // longer make a fabricated 5000-unit allocation appear under the cap.
  const inflated={...original,budgets:[{
    ...original.budgets[0],
    balanceUnits:'100000',reservedUnits:'20000',excludedUnits:'40000',
    availableUnits:'100000',dailyBudgetUnits:'5000'
  }]};
  await assert.rejects(buildDirectWalletPayoutPlan({
    preview:inflated,destinations,cryptoImpl:webcrypto
  }),/payout_plan_budget_not_reconciled/);
});

test('preview budget must reject reservation/exclusion deficits and forged balances',async()=>{
  const data=await preview(),base=data.budgets[0];
  for(const patch of [
    {balanceUnits:'100000',reservedUnits:'75000',excludedUnits:'40000',
      availableUnits:'0',dailyBudgetUnits:'0'},
    {balanceUnits:'120000',reservedUnits:'0',excludedUnits:'0',
      availableUnits:'100000',dailyBudgetUnits:'5000'},
    {balanceUnits:'100000',reservedUnits:'20000',excludedUnits:'40000',
      availableUnits:'40000',dailyBudgetUnits:'5000'},
    {reservedUnits:'not-an-integer'}
  ]) {
    await assert.rejects(buildDirectWalletPayoutPlan({
      preview:{...data,budgets:[{...base,...patch}]},
      destinations,cryptoImpl:webcrypto
    }),/payout_plan_|invalid_token_units/);
  }
});

test('the planner rejects fabricated budgets, unknown assets and executable statuses',async()=>{
  const data=await preview();
  for(const altered of [
    {...data,budgets:[{...data.budgets[0],dailyBudgetUnits:'5001'}]},
    {...data,bundles:[{...data.bundles[0],assetKey:'wrong'}]},
    {...data,bundles:[{...data.bundles[0],status:'locked'}]},
    {...data,status:'reviewed'},
    {...data,seedCommitment:'invalid'},
    {...data,wallet:'unapproved'}
  ]) {
    await assert.rejects(buildDirectWalletPayoutPlan({
      preview:altered,destinations,cryptoImpl:webcrypto
    }),/payout_plan_/);
  }
});

test('wrong or duplicate receiving accounts cannot be silently accepted',async()=>{
  const data=await preview();
  for(const choices of [
    [...destinations,...destinations],
    [{telegramId:'1111',account:TIP_ACCOUNT,registered:true}],
    [{telegramId:'1111',account:'bad..name',registered:true}]
  ]) {
    await assert.rejects(buildDirectWalletPayoutPlan({
      preview:data,destinations:choices,cryptoImpl:webcrypto
    }),/payout_plan_/);
  }
});

test('plan never writes to D1 or calls any transfer, custody, signing or broadcast API',async()=>{
  const plan=await buildDirectWalletPayoutPlan({
    preview:await preview(),destinations,cryptoImpl:webcrypto
  });
  assert(!Object.hasOwn(plan,'transaction'));
  assert(!Object.hasOwn(plan,'signature'));
  assert.equal(plan.executable,false);
  assert.equal(plan.donationAuthorization,false);
  assert.equal(plan.operatorSpendingAuthorization,false);
  assert(Object.isFrozen(plan));
});
