// TAG RUN V2 PR2: construct immutable OFFLINE payout-intent rehearsal rows.
// This is NOT a funded ledger. No DB connection, signer, custody access, token
// reservation, transfer, or production command is reachable from this module.
import { assetKey, parseIntegerUnits, sha256Text, validUtcDay,
  DAILY_BPS, TIP_ACCOUNT, MAX_ASSETS, MAX_BUNDLES_PER_ASSET } from './v2-core.js';
import { isValidWaxAccount } from './core.js';

export const REHEARSAL_STATUS = 'simulation_only';
export const REHEARSAL_EXECUTABLE = false;
const HASH = /^[a-f0-9]{64}$/;
const MEMBER = /^[0-9]{1,20}$/;
const fail = reason => { throw new Error('rehearsal_' + reason); };
const digest = value => typeof value === 'string' && HASH.test(value);
const nonempty = value => typeof value === 'string' && value.length > 0;
const safeUnits = value => parseIntegerUnits(value);

export async function prepareV2PayoutRehearsal({
  chatId, plan, snapshots, receiptsDigest, cryptoImpl = globalThis.crypto
} = {}) {
  if (!nonempty(chatId) || !plan || plan.status !== REHEARSAL_STATUS ||
      plan.executable !== false || plan.transferAttempted !== false ||
      plan.wallet !== TIP_ACCOUNT || !validUtcDay(plan.day) ||
      !digest(receiptsDigest) || !Array.isArray(plan.entries) ||
      !Array.isArray(plan.totals) || !Array.isArray(snapshots) ||
      plan.entries.length > MAX_ASSETS * MAX_BUNDLES_PER_ASSET ||
      plan.hypotheticalBundles !== plan.entries.length ||
      plan.missingDestinations !== 0 ||
      plan.totals.length > MAX_ASSETS || plan.totals.length !== snapshots.length) {
    fail('invalid_input');
  }
  const budgetByAsset = new Map();
  for (const snapshot of snapshots) {
    const key = assetKey(snapshot?.contract,snapshot?.symbol,snapshot?.precision);
    if (snapshot.assetKey !== key || budgetByAsset.has(key) ||
        snapshot.day !== plan.day || !digest(snapshot.evidenceDigest) ||
        !digest(snapshot.blockId) ||
        !Number.isSafeInteger(snapshot.irreversibleBlockNum) ||
        snapshot.irreversibleBlockNum <= 0 ||
        snapshot.status !== 'unverified') {
      fail('invalid_snapshot_evidence');
    }
    const onchain = safeUnits(snapshot.onchainUnits);
    const reserved = safeUnits(snapshot.reservedUnits);
    const excluded = safeUnits(snapshot.excludedUnits);
    const available = safeUnits(snapshot.availableUnits);
    const daily = safeUnits(snapshot.fivePercentUnits);
    if (reserved + excluded > onchain ||
        available !== onchain-reserved-excluded ||
        daily !== available * BigInt(DAILY_BPS)/10000n) {
      fail('snapshot_units_not_reconciled');
    }
    budgetByAsset.set(key,{snapshot,daily,spent:0n});
  }
  const totalsSeen = new Set();
  for (const t of plan.totals) {
    const state = budgetByAsset.get(t.assetKey);
    if (!state || totalsSeen.has(t.assetKey) ||
        safeUnits(t.dailyBudgetUnits)!==state.daily ||
        safeUnits(t.hypotheticalAllocatedUnits)+safeUnits(t.hypotheticalUnallocatedUnits)!==state.daily) {
      fail('plan_totals_mismatch');
    }
    totalsSeen.add(t.assetKey);
  }
  const slots = new Set();
  const intents = [];
  for (const entry of plan.entries) {
    if (entry?.status !== REHEARSAL_STATUS ||
        entry.day !== plan.day || !MEMBER.test(String(entry.telegramId ?? '')) ||
        !Number.isSafeInteger(entry.bundleIndex) || entry.bundleIndex < 0 ||
        entry.bundleIndex >= MAX_BUNDLES_PER_ASSET ||
        !['current','historical'].includes(entry.ticketClass) ||
        !digest(entry.idempotencyKey) ||
        !isValidWaxAccount(entry.receivingAccount) ||
        entry.receivingAccount === TIP_ACCOUNT || entry.blocker) {
      fail('invalid_recipient_or_bundle');
    }
    const state = budgetByAsset.get(entry.assetKey);
    const slot = String(entry.assetKey)+':'+entry.bundleIndex;
    if (!state || slots.has(slot)) fail('duplicate_or_unknown_slot');
    slots.add(slot);
    const amount = safeUnits(entry.units);
    if (amount === 0n) fail('zero_allocation');
    const expectedSourceKey = await sha256Text(
      [plan.day,entry.assetKey,entry.bundleIndex,entry.telegramId,
       entry.ticketClass,entry.units].join('|'),cryptoImpl);
    if (expectedSourceKey !== entry.idempotencyKey) fail('source_intent_key_mismatch');
    state.spent += amount;
    if (state.spent > state.daily) fail('daily_budget_exceeded');
    const destinationDigest = await sha256Text(
      [entry.telegramId,entry.receivingAccount,plan.day].join('|'),cryptoImpl);
    const intentKey = await sha256Text([
      chatId, plan.day, entry.assetKey, entry.bundleIndex, entry.telegramId,
      entry.ticketClass, amount.toString(), entry.receivingAccount,
      destinationDigest, state.snapshot.evidenceDigest, receiptsDigest
    ].join('|'),cryptoImpl);
    intents.push(Object.freeze({
      intent_key:intentKey,chat_id:chatId,day_key:plan.day,
      asset_key:entry.assetKey,bundle_index:entry.bundleIndex,
      telegram_id:String(entry.telegramId),destination_account:entry.receivingAccount,
      destination_digest:destinationDigest,amount_units:amount.toString(),
      snapshot_digest:state.snapshot.evidenceDigest,
      source_receipts_digest:receiptsDigest,status:REHEARSAL_STATUS
    }));
  }
  for(const [key,state] of budgetByAsset) {
    const sum=plan.totals.find(x=>x.assetKey===key);
    if (state.spent!==safeUnits(sum.hypotheticalAllocatedUnits) ||
        state.daily-state.spent!==safeUnits(sum.hypotheticalUnallocatedUnits)) {
      fail('allocation_totals_mismatch');
    }
  }
  return Object.freeze({
    status:REHEARSAL_STATUS, executable:false, transferAttempted:false,
    reservable:false, funded:false, reviewed:false, wallet:TIP_ACCOUNT,
    day:plan.day, intents:Object.freeze(intents),
    blockers:Object.freeze(['donation_evidence_unverified','finality_unverified',
      'custody_unverified','funding_not_reserved','operator_spending_not_authorized',
      'transfer_executor_not_implemented'])
  });
}
