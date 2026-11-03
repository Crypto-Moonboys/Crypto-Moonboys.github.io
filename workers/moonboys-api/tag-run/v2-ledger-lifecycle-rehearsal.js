// TAG RUN V2 PR4: pure, OFFLINE-only simulation of a future payout ledger.
// No D1, WAX RPC, signer, broadcasting, transfer or funded obligation.
// No code in this module can authorize payment, even with a forged flag.
import {
  TIP_ACCOUNT, parseIntegerUnits, validUtcDay, sha256Text,
  MAX_ASSETS, MAX_BUNDLES_PER_ASSET
} from './v2-core.js';
import { isValidWaxAccount } from './core.js';

export const LEDGER_MODE = 'simulation_only';
export const LEDGER_EXECUTION_AVAILABLE = false;
const HEX = /^[0-9a-f]{64}$/;
const MEMBER = /^[0-9]{1,20}$/;
const ACTION_SEQ = /^[1-9][0-9]{0,24}$/;
const MAX_INTENTS = MAX_ASSETS * MAX_BUNDLES_PER_ASSET;
const fail = reason => { throw new Error('ledger_rehearsal_' + reason); };
const validHash = value => typeof value === 'string' && HEX.test(value);
const uint = value => parseIntegerUnits(value);
const sumKey = (asset,day) => day + '|' + asset;

function verifyInput(rehearsal, limits, events, historicalEvents) {
  if (!rehearsal || rehearsal.status !== LEDGER_MODE ||
      rehearsal.executable !== false || rehearsal.transferAttempted !== false ||
      rehearsal.reservable !== false || rehearsal.funded !== false ||
      rehearsal.reviewed !== false || rehearsal.wallet !== TIP_ACCOUNT ||
      !validUtcDay(rehearsal.day) || !Array.isArray(rehearsal.intents) ||
      rehearsal.intents.length > MAX_INTENTS || !Array.isArray(limits) ||
      limits.length > MAX_ASSETS || !Array.isArray(events) ||
      !Array.isArray(historicalEvents) ||
      events.length + historicalEvents.length > MAX_INTENTS * 5)
    fail('untrusted_input');
}

export async function simulateV2PayoutLifecycle({
  rehearsal, limits = [], events = [], historicalEvents = [],
  paused = true, cryptoImpl = globalThis.crypto
} = {}) {
  verifyInput(rehearsal,limits,events,historicalEvents);
  if (typeof paused !== 'boolean') fail('pause_state_invalid');
  const perAsset=new Map();
  for (const limit of limits) {
    const key=sumKey(limit?.assetKey,limit?.dayKey);
    if (typeof limit?.assetKey !== 'string' || limit.dayKey !== rehearsal.day ||
        perAsset.has(key)) fail('invalid_or_duplicate_limit');
    const dailyLimit=uint(limit.dailyLimitUnits);
    const maxTransfer=uint(limit.maxTransferUnits);
    // A configured cap is a simulated ceiling, not funding evidence.
    if (maxTransfer === 0n || maxTransfer > dailyLimit)
      fail('invalid_spending_ceiling');
    perAsset.set(key,{assetKey:limit.assetKey,dayKey:limit.dayKey,
      limit:dailyLimit,maxTransfer,outstanding:0n,
      cumulativeAllocated:0n,released:0n});
  }
  const intents=new Map(), slots=new Set();
  for (const row of rehearsal.intents) {
    if (!row || row.status !== LEDGER_MODE ||
        row.day_key !== rehearsal.day ||
        typeof row.chat_id !== 'string' || !row.chat_id ||
        !validHash(row.intent_key) || intents.has(row.intent_key) ||
        typeof row.asset_key !== 'string' ||
        !Number.isSafeInteger(row.bundle_index) || row.bundle_index < 0 ||
        row.bundle_index >= MAX_BUNDLES_PER_ASSET ||
        typeof row.telegram_id !== 'string' || !MEMBER.test(row.telegram_id) ||
        !['current','historical'].includes(row.ticket_class) ||
        typeof row.destination_account !== 'string' ||
        !isValidWaxAccount(row.destination_account) ||
        row.destination_account === TIP_ACCOUNT ||
        !validHash(row.destination_digest) ||
        !validHash(row.snapshot_digest) ||
        !validHash(row.source_receipts_digest)) {
      fail('invalid_or_duplicate_intent');
    }
    const slot = [row.chat_id,row.day_key,row.asset_key,row.bundle_index].join('|');
    if (slots.has(slot)) fail('duplicate_bundle_slot');
    slots.add(slot);
    const amount=uint(row.amount_units);
    if (amount === 0n) fail('zero_amount');
    const expected=await sha256Text(
      [row.telegram_id,row.destination_account,row.day_key].join('|'),
      cryptoImpl);
    if (expected !== row.destination_digest) fail('destination_digest_mismatch');
    // PR2's full immutable commitment includes ticket class, amount, frozen
    // recipient, snapshot and source-receipt digests. Validate it BEFORE any
    // lifecycle event: a valid-looking hash is not sufficient evidence.
    const originalKey=await sha256Text([
      row.chat_id,row.day_key,row.asset_key,row.bundle_index,row.telegram_id,
      row.ticket_class,amount.toString(),row.destination_account,
      row.destination_digest,row.snapshot_digest,row.source_receipts_digest
    ].join('|'),cryptoImpl);
    if (originalKey !== row.intent_key) fail('intent_commitment_mismatch');
    if (!perAsset.has(sumKey(row.asset_key,row.day_key))) fail('missing_asset_cap');
    intents.set(row.intent_key,{
      key:row.intent_key, assetKey:row.asset_key,
      telegramId:row.telegram_id, dayKey:row.day_key,
      account:row.destination_account, amount,
      status:'simulation_proposed', history:[]
    });
  }
  const seenEvents=new Map(), proofAssignments=new Map();
  // Validate ALL append positions before attempting any replay transitions.
  // Otherwise an out-of-order cancellation could fail with a misleading
  // state error before the later non-monotonic sequence is reached.
  let previousAppendSeq=0;
  for(const historic of historicalEvents) {
    if (!Number.isSafeInteger(historic?.appendSeq) ||
        historic.appendSeq <= previousAppendSeq) {
      fail('historical_append_order_invalid');
    }
    previousAppendSeq=historic.appendSeq;
  }
  // The caller must supply accepted, immutable events from the append-only
  // rehearsal journal separately from fresh requests. Replaying prior history
  // rebuilds an existing hold while paused; NEW holds are still prohibited.
  // This is an offline simulation, not an authorization to trust client events.
  for (const [historical,stream] of [[true,historicalEvents],[false,events]]) {
    for(const e of stream) {
    // Append order was checked for the complete historical stream above.
    // Events still retain their exact accepted journal insertion order.
    if (!e || !validHash(e.eventId) || !validHash(e.intentKey) ||
        !['simulate_hold','simulate_cancel','simulate_unknown',
          'simulate_reconcile'].includes(e.action)) fail('invalid_event');
    const intent=intents.get(e.intentKey);
    if (!intent) fail('unknown_intent');
    const fingerprint=JSON.stringify([
      e.intentKey,e.action,e.transactionId ?? null,
      e.chainActionSequence ?? null,e.blockId ?? null,
      e.blockNum ?? null,e.account ?? null,e.assetKey ?? null,
      e.units ?? null
    ]);
    if (seenEvents.has(e.eventId)) {
      if (seenEvents.get(e.eventId)!==fingerprint)
        fail('conflicting_idempotency_key');
      continue; // exact replay: no double-hold, release or reconciliation
    }
    const budget=perAsset.get(sumKey(intent.assetKey,intent.dayKey));
    if(e.action==='simulate_hold') {
      if (paused && !historical) fail('emergency_pause');
      if(intent.status!=='simulation_proposed') fail('duplicate_hold');
      if(intent.amount > budget.maxTransfer) fail('per_transfer_cap_exceeded');
      if(budget.outstanding+intent.amount > budget.limit)
        fail('daily_cap_exceeded');
      budget.outstanding+=intent.amount;
      budget.cumulativeAllocated+=intent.amount;
      intent.status='simulation_held';
    } else if(e.action==='simulate_cancel') {
      if(intent.status!=='simulation_held') fail('cannot_cancel_uncertain_transfer');
      budget.outstanding-=intent.amount;
      budget.released+=intent.amount;
      intent.status='simulation_cancelled';
    } else if(e.action==='simulate_unknown') {
      if(intent.status!=='simulation_held') fail('unknown_requires_held_intent');
      intent.status='simulation_transfer_unknown';
    } else {
      // This is an untrusted, submitted diagnostic. It never confirms that
      // a real blockchain transfer succeeded or frees the simulated hold.
      if(intent.status!=='simulation_transfer_unknown') fail('review_requires_unknown');
      if (typeof e.transactionId !== 'string' || !validHash(e.transactionId) ||
          typeof e.chainActionSequence !== 'string' ||
          !ACTION_SEQ.test(e.chainActionSequence) ||
          typeof e.blockId !== 'string' || !validHash(e.blockId) ||
          !Number.isSafeInteger(e.blockNum) || e.blockNum <= 0 ||
          e.account !== intent.account || e.assetKey !== intent.assetKey ||
          e.units !== intent.amount.toString()) fail('reconciliation_evidence_invalid');
      const chainKey=e.transactionId+'|'+e.chainActionSequence;
      if (proofAssignments.has(chainKey)) fail('chain_action_reused');
      proofAssignments.set(chainKey,intent.key);
      intent.status='simulation_reconciliation_review';
    }
    intent.history.push(e.eventId);
    seenEvents.set(e.eventId,fingerprint);
    }
  }
  const entries=Object.freeze([...intents.values()].map(v=>Object.freeze({
    intentKey:v.key,assetKey:v.assetKey,dayKey:v.dayKey,
    telegramId:v.telegramId,receivingAccount:v.account,
    amountUnits:v.amount.toString(),state:v.status,
    eventIds:Object.freeze([...v.history]),funded:false,
    transferable:false,confirmedOnChain:false
  })));
  const caps=Object.freeze([...perAsset.values()].map(c=>Object.freeze({
    assetKey:c.assetKey,dayKey:c.dayKey,dailyLimitUnits:c.limit.toString(),
    maxTransferUnits:c.maxTransfer.toString(),
    simulatedHeldUnits:c.outstanding.toString(),
    simulatedAllocatedUnits:c.cumulativeAllocated.toString(),
    simulatedReleasedUnits:c.released.toString(),
    fundedReservedUnits:'0',actualTransferredUnits:'0'
  })));
  return Object.freeze({
    mode:LEDGER_MODE,executable:false,funded:false,
    paused,transferAttempted:false,signerAvailable:false,
    realReservationsCreated:false,chainTransfersConfirmed:false,
    entries,caps,
    blockers:Object.freeze([
      'no_approved_donation_and_historical_balance',
      'no_authorized_treasury_custody_or_spending',
      'no_production_atomic_reservation_ledger',
      'no_verified_chain_transaction_reconciliation',
      'no_signer_or_transfer_executor'
    ])
  });
}