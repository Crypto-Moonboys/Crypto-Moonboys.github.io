// TAG RUN V2: offline/read-only plan for eventual bot-to-registered-WAX-account payouts.
// The output is a deterministic WHAT-IF manifest, never an entitlement or an
// executable intent. Do not connect this module to a signer, ledger, or transfer API.
import { assetKey, parseIntegerUnits, sha256Text, TIP_ACCOUNT, validUtcDay,
  DAILY_BPS, MAX_ASSETS, MAX_BUNDLES_PER_ASSET } from './v2-core.js';
import { isValidWaxAccount } from './core.js';

const VALID_ID = /^[0-9]{1,20}$/;
const HEX_DIGEST = /^[a-f0-9]{64}$/i;
export const DIRECT_PAYOUT_PLAN_MODE = 'simulation_only';
export const DIRECT_PAYOUT_EXECUTION_AVAILABLE = false;

const failure = (message) => { throw new Error('payout_plan_' + message); };

export async function buildDirectWalletPayoutPlan({
  preview, destinations, cryptoImpl = globalThis.crypto
} = {}) {
  if (!preview || preview.status !== 'preview_only' ||
      !validUtcDay(preview.day) || preview.wallet !== TIP_ACCOUNT ||
      preview.dailyBps !== DAILY_BPS ||
      !Array.isArray(preview.budgets) || !Array.isArray(preview.bundles) ||
      !Array.isArray(destinations) || preview.budgets.length > MAX_ASSETS ||
      preview.bundles.length > MAX_ASSETS * MAX_BUNDLES_PER_ASSET ||
      !HEX_DIGEST.test(String(preview.seedCommitment || ''))) {
    failure('invalid_preview');
  }
  const budgets = new Map();
  for (const b of preview.budgets) {
    const key = assetKey(b?.contract,b?.symbol,b?.precision);
    if (key !== b.key || budgets.has(key)) failure('duplicate_or_invalid_budget');
    const amount = parseIntegerUnits(b.dailyBudgetUnits);
    const available = parseIntegerUnits(b.availableUnits);
    if (amount !== available * BigInt(DAILY_BPS) / 10000n ||
        available < 0n) failure('budget_not_reconciled');
    budgets.set(key,{ amount, remaining:amount });
  }
  const selected = new Map();
  for (const row of destinations) {
    const telegramId=String(row?.telegramId ?? '');
    const account=String(row?.account ?? '');
    if (!VALID_ID.test(telegramId) || selected.has(telegramId)) {
      failure('duplicate_or_invalid_telegram_destination');
    }
    if (account && (!isValidWaxAccount(account) || account === TIP_ACCOUNT)) {
      failure('invalid_destination_account');
    }
    selected.set(telegramId,{
      account, registered:row?.registered === true,
      // A WAX account may be user-selected without a signature. Chain
      // validation must be independently refreshed before any future payout.
      chainAccountChecked:row?.chainAccountChecked === true
    });
  }

  const slots = new Set(), allocations = [], missing = [];
  const totalByAsset = new Map();
  for (const b of preview.bundles) {
    if (b?.status !== 'preview_only' || b.day !== preview.day ||
        !VALID_ID.test(String(b.telegramId || '')) ||
        !Number.isSafeInteger(b.bundleIndex) || b.bundleIndex < 0 ||
        b.bundleIndex >= MAX_BUNDLES_PER_ASSET ||
        !['current','historical'].includes(b.pool)) failure('invalid_bundle');
    const budget=budgets.get(b.assetKey);
    if (!budget) failure('unknown_asset');
    const slot=b.assetKey + ':' + b.bundleIndex;
    if (slots.has(slot)) failure('duplicate_bundle_slot');
    slots.add(slot);
    const units=parseIntegerUnits(b.units);
    if (units <= 0n) failure('zero_bundle_amount');
    budget.remaining -= units;
    if (budget.remaining < 0n) failure('exceeds_daily_asset_budget');
    totalByAsset.set(b.assetKey,(totalByAsset.get(b.assetKey)||0n)+units);

    const destination=selected.get(String(b.telegramId));
    const missingReason=!destination || !destination.registered
      ? 'destination_not_registered'
      : !destination.account ? 'destination_account_missing'
      : !destination.chainAccountChecked ? 'destination_requires_fresh_chain_check' : null;
    const key=await sha256Text(
      [preview.day,b.assetKey,b.bundleIndex,b.telegramId,b.pool,b.units].join('|'),
      cryptoImpl
    );
    const row=Object.freeze({
      idempotencyKey:key, day:preview.day, assetKey:b.assetKey,
      bundleIndex:b.bundleIndex, telegramId:String(b.telegramId),
      ticketClass:b.pool, units:units.toString(),
      receivingAccount:destination?.account||null,
      status:'simulation_only',
      ... (missingReason ? { blocker:missingReason } : {})
    });
    allocations.push(row);
    if(missingReason) missing.push(row);
  }
  // Every value remains a preview. Even full coverage is NOT custody proof,
  // an approved donation, a finalized snapshot, or a spending authorization.
  const totals=Object.freeze([...budgets].map(([key,entry])=>Object.freeze({
    assetKey:key,dailyBudgetUnits:entry.amount.toString(),
    hypotheticalAllocatedUnits:(totalByAsset.get(key)||0n).toString(),
    hypotheticalUnallocatedUnits:entry.remaining.toString()
  })));
  return Object.freeze({
    status:DIRECT_PAYOUT_PLAN_MODE, executable:false,
    transferAttempted:false, wallet:TIP_ACCOUNT, day:preview.day,
    hypotheticalBundles:allocations.length, missingDestinations:missing.length,
    reviewedCustody:false, finalizedSnapshot:false,
    donationAuthorization:false, operatorSpendingAuthorization:false,
    entries:Object.freeze(allocations), totals,
    blockers:Object.freeze(['no_finalized_funding_or_custody_evidence',
      'no_approved_spending_authority','no_signer_or_transfer_executor',
      ...(missing.length ? ['some_destination_accounts_unconfirmed'] : [])])
  });
}
