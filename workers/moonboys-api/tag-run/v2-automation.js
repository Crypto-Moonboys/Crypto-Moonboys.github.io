// Scheduled TAG RUN V2 Community Pot automation.
// Unknown assets remain quarantined. Only explicitly approved, pinned standard
// token contracts can reach the active-key signer.
import { previousDay } from './core.js';
import { TIP_ACCOUNT, sha256Text } from './v2-core.js';
import {
  saveYesterdayParticipation, createAutomaticSnapshot
} from './v2-service.js';
import { quarantineInboundTipReceipts } from './v2-deposits.js';
import { reviewWaxTokenContract } from './v2-wax-authority-review.js';
import {
  commitDraw, revealDraw, reviewDraw
} from '../../../scripts/tag-run-v2-draw-workflow.mjs';
import {
  chooseFutureWaxBlock, readIrreversibleWaxBlock
} from '../../../scripts/tag-run-v2-draw-entropy.mjs';
import {
  initializeReviewedDailyCap, openReviewedDailyCap,
  reserveReviewedPayout, buildReviewedWaxTransfer,
  stagePreparedAutomaticPayout, loadPreparedAutomaticPayout,
  markIrreversiblyConfirmed
} from './v2-payout-executor.js';
import {
  prepareActiveKeyTransaction, broadcastPreparedTransaction
} from './v2-active-key-signer.js';
import {
  discoverAndVerifyIrreversibleWaxPayout
} from './v2-payout-chain-reconcile.js';

const HEX = /^[0-9a-f]{64}$/;
const fail = reason => { throw new Error('v2_automation_' + reason); };

function safeFailureReason(error) {
  const message = String(error?.message || '');
  return /^v2_[a-z0-9_]+$/.test(message) ? message : 'v2_automation_unexpected_error';
}

async function runIsolatedStep(result, step, action) {
  try {
    const value = await action();
    result.steps.push(Object.freeze({ step, ...(value || { status: 'idle' }) }));
    return true;
  } catch (error) {
    result.steps.push(Object.freeze({
      step, status: 'blocked', reason: safeFailureReason(error)
    }));
    return false;
  }
}

function preparedTransactionExpired(signedTransactionJson, nowMs) {
  try {
    const raw = String(JSON.parse(signedTransactionJson)?.expiration || '');
    const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)
      ? raw + 'Z' : raw;
    const expirationMs = Date.parse(normalized);
    return !Number.isFinite(expirationMs) || expirationMs <= nowMs;
  } catch (_) {
    return true;
  }
}

async function moveToReconciliationOnly(env, intent) {
  const result = await env.DB.prepare(
    "UPDATE tag_run_v2_payout_intents SET status='reconciliation_review'," +
    "updated_at=CURRENT_TIMESTAMP WHERE intent_key=? " +
    "AND status='broadcast_unknown' AND submission_tx_id=?"
  ).bind(intent.intent_key, intent.submission_tx_id).run();
  if (result?.success !== true || result.meta?.changes !== 1) {
    fail('reconciliation_review_conflict');
  }
}

function assertMode(env) {
  if (!env?.DB ||
      env.TAG_RUN_ENABLED !== 'true' ||
      env.TAG_RUN_WEEKLY_REWARDS_ENABLED !== 'false' ||
      env.TAG_RUN_V2_OBSERVATION_ENABLED !== 'false' ||
      env.TAG_RUN_V2_POOL_ENABLED !== 'true' ||
      env.TAG_RUN_V2_DRAWS_ENABLED !== 'true' ||
      env.TAG_RUN_V2_PAYOUTS_ENABLED !== 'true' ||
      env.TAG_RUN_V2_DRAW_REVIEW_RELEASE_APPROVED !== 'true' ||
      env.TAG_RUN_V2_EXECUTOR_RELEASE_APPROVED !== 'true' ||
      env.TAG_RUN_V2_AUTOMATION_ENABLED !== 'true' ||
      env.TAG_RUN_V2_AUTOMATION_RELEASE_APPROVED !== 'true' ||
      env.TAG_RUN_V2_SIGNER_PERMISSION !== 'active' ||
      env.TAG_RUN_V2_TIP_ACCOUNT !== TIP_ACCOUNT ||
      !/^-100[0-9]{5,20}$/.test(String(env.TELEGRAM_GROUP_CHAT_ID || '')) ||
      typeof env.TAG_RUN_V2_ACTIVE_PRIVATE_KEY !== 'string' ||
      env.TAG_RUN_V2_ACTIVE_PRIVATE_KEY.length < 40 ||
      typeof env.TAG_RUN_V2_AUTOMATION_SEED_KEY !== 'string' ||
      env.TAG_RUN_V2_AUTOMATION_SEED_KEY.length < 32) {
    fail('release_not_authorized');
  }
}

async function rows(db, sql, ...params) {
  const result = await db.prepare(sql).bind(...params).all();
  if (result?.success !== true || !Array.isArray(result.results)) {
    fail('database_read_unavailable');
  }
  return result.results;
}

async function dailySeed(env, day) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.TAG_RUN_V2_AUTOMATION_SEED_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const bytes = await crypto.subtle.sign(
    'HMAC', key,
    new TextEncoder().encode(
      'tag-run-v2:automatic-draw:v1|' + env.TELEGRAM_GROUP_CHAT_ID + '|' + day
    )
  );
  return [...new Uint8Array(bytes)]
    .map(value => value.toString(16).padStart(2, '0')).join('');
}

async function pinForAsset(env, assetKey) {
  const row = await env.DB.prepare(
    'SELECT asset_key,token_contract,token_symbol,token_precision,eligibility,' +
    'approved_code_hash,approved_abi_hash FROM tag_run_v2_assets WHERE asset_key=?'
  ).bind(assetKey).first();
  if (!row || row.eligibility !== 'approved' ||
      !HEX.test(row.approved_code_hash || '') ||
      !HEX.test(row.approved_abi_hash || '')) fail('asset_not_pinned');
  return row;
}

async function verifyPinned(env, {
  assetKey, contract, symbol, precision, expectedCodeHash, expectedAbiHash,
  fetchImpl
}) {
  const observed = await reviewWaxTokenContract({
    contract, symbol, precision, fetchImpl
  });
  if (observed.codeHash === expectedCodeHash &&
      observed.abiHash === expectedAbiHash) return observed;
  // A corroborated contract change is deterministic evidence, not an RPC
  // outage. Quarantine immediately so later ticks cannot sign it.
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE tag_run_v2_assets SET eligibility='quarantined'," +
      "verified_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE asset_key=? " +
      "AND eligibility='approved' AND approved_code_hash=? AND approved_abi_hash=?"
    ).bind(assetKey, expectedCodeHash, expectedAbiHash),
    env.DB.prepare(
      'INSERT INTO tag_run_v2_audit(event_key,event_type,reason,reviewed_by) ' +
      "VALUES(?,?,?,'automation:contract-pin:v1')"
    ).bind(
      'automation-contract-change:' + assetKey + ':' + crypto.randomUUID(),
      'asset_eligibility_quarantined',
      'Corroborated contract code or ABI changed after /poolapprove.'
    )
  ]);
  fail('contract_pin_changed');
}

async function startDaily(env, { nowMs, fetchImpl, cryptoImpl }) {
  const day = previousDay(nowMs);
  await saveYesterdayParticipation(env, { nowMs, maxDays: 7 });
  await quarantineInboundTipReceipts(env, { fetchImpl, cryptoImpl });
  await createAutomaticSnapshot(env, { day, fetchImpl, cryptoImpl, nowMs });
  const seed = await dailySeed(env, day);
  return commitDraw(env, {
    day, seedCommitment: await sha256Text(seed),
    committedBy: 'automation:commit:v1',
    chooseFutureBlock: () => chooseFutureWaxBlock({ fetchImpl }),
    verifyRelease: async () => assertMode(env), nowMs
  });
}

async function advanceOneDraw(env, row, { nowMs, fetchImpl }) {
  const chatId = String(env.TELEGRAM_GROUP_CHAT_ID);
  if (row.state === 'committed') {
    const seed = await dailySeed(env, row.day_key);
    try {
      await revealDraw(env, {
        day: row.day_key, seedHex: seed,
        readIrreversibleBlock: block =>
          readIrreversibleWaxBlock(block, { fetchImpl }),
        verifyRelease: async () => assertMode(env), nowMs
      });
    } catch (error) {
      if (String(error?.message || '').includes('entropy_unavailable') ||
          String(error?.message || '').includes('beacon_not_irreversible')) {
        return {
          status: 'waiting_for_irreversible_beacon', day: row.day_key
        };
      }
      throw error;
    }
  }
  const current = await env.DB.prepare(
    'SELECT state,inputs_digest FROM tag_run_v2_draw_workflows ' +
    'WHERE chat_id=? AND day_key=?'
  ).bind(chatId, row.day_key).first();
  if (current?.state === 'revealed') {
    await reviewDraw(env, {
      day: row.day_key, reviewedBy: 'automation:policy-review:v1',
      expectedInputsDigest: current.inputs_digest,
      verifyRelease: async () => assertMode(env), nowMs
    });
  }
  return { status: 'reviewed', day: row.day_key };
}

async function advanceDraw(env, { nowMs, fetchImpl }) {
  const chatId = String(env.TELEGRAM_GROUP_CHAT_ID);
  const queue = await rows(env.DB,
    "SELECT day_key,state FROM tag_run_v2_draw_workflows WHERE chat_id=? " +
    "AND state IN ('committed','revealed') ORDER BY day_key",
    chatId);
  if (!queue.length) return { status: 'idle' };

  const blocked = [];
  for (const row of queue) {
    try {
      const outcome = await advanceOneDraw(env, row, { nowMs, fetchImpl });
      if (outcome.status === 'reviewed') {
        return {
          ...outcome,
          skippedBlockedDraws: blocked.length
        };
      }
      blocked.push({
        day: row.day_key,
        status: outcome.status
      });
    } catch (error) {
      // Never weaken the immutable draw or its funding checks. Record this
      // candidate as blocked for the current tick and try a later day.
      blocked.push({
        day: row.day_key,
        status: 'blocked',
        reason: safeFailureReason(error)
      });
    }
  }
  return {
    status: 'draw_queue_waiting',
    blockedCount: blocked.length,
    blocked: blocked.slice(0, 20)
  };
}

async function createOrOpenCap(env) {
  const chatId = String(env.TELEGRAM_GROUP_CHAT_ID);
  const missing = await env.DB.prepare(
    'SELECT s.day_key,s.asset_key,a.token_contract,a.token_symbol,a.token_precision ' +
    'FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a ON a.asset_key=s.asset_key ' +
    'JOIN tag_run_v2_draws d ON d.chat_id=s.chat_id AND d.day_key=s.day_key ' +
    'LEFT JOIN tag_run_v2_payout_caps c ON c.chat_id=s.chat_id ' +
    'AND c.day_key=s.day_key AND c.asset_key=s.asset_key ' +
    "WHERE s.chat_id=? AND d.status='reviewed' AND s.status='verified' " +
    "AND s.daily_reward_units!='0' AND a.eligibility='approved' " +
    'AND c.asset_key IS NULL ORDER BY s.day_key,s.asset_key LIMIT 1'
  ).bind(chatId).first();
  if (missing) {
    const bundles = await rows(env.DB,
      'SELECT units FROM tag_run_v2_bundles WHERE chat_id=? AND day_key=? ' +
      'AND asset_key=? ORDER BY bundle_index',
      chatId, missing.day_key, missing.asset_key);
    if (!bundles.length) return { status: 'no_bundles' };
    const maximum = bundles.reduce((max, row) => {
      const value = BigInt(row.units);
      return value > max ? value : max;
    }, 0n);
    await initializeReviewedDailyCap(env, {
      chatId, day: missing.day_key,
      contract: missing.token_contract, symbol: missing.token_symbol,
      precision: missing.token_precision,
      authorizedBy: 'automation:cap-policy:v1',
      maxTransferUnits: maximum.toString()
    });
  }
  const paused = await env.DB.prepare(
    'SELECT c.day_key,c.asset_key FROM tag_run_v2_payout_caps c ' +
    'JOIN tag_run_v2_draws d ON d.chat_id=c.chat_id AND d.day_key=c.day_key ' +
    'JOIN tag_run_v2_snapshots s ON s.chat_id=c.chat_id ' +
    'AND s.day_key=c.day_key AND s.asset_key=c.asset_key ' +
    'JOIN tag_run_v2_assets a ON a.asset_key=c.asset_key ' +
    "WHERE c.chat_id=? AND c.paused=1 AND c.committed_units='0' " +
    "AND d.status='reviewed' AND s.status='verified' " +
    "AND s.reward_policy_bps=100 AND s.snapshot_digest=c.snapshot_digest " +
    "AND a.eligibility='approved' AND length(a.approved_code_hash)=64 " +
    "AND length(a.approved_abi_hash)=64 AND EXISTS (" +
    "SELECT 1 FROM tag_run_v2_pool_config p WHERE p.config_id=1 " +
    "AND p.status='review_only' AND p.wallet_account='isthatajoint' " +
    "AND p.active_daily_bps=100 AND p.active_policy_version=2) " +
    "AND EXISTS (SELECT 1 FROM tag_run_v2_bundles b " +
    "JOIN tag_run_wallets w ON w.telegram_id=b.telegram_id " +
    "LEFT JOIN tag_run_v2_payout_intents bi ON bi.chat_id=b.chat_id " +
    "AND bi.day_key=b.day_key AND bi.asset_key=b.asset_key " +
    "AND bi.bundle_index=b.bundle_index " +
    "WHERE b.chat_id=c.chat_id AND b.day_key=c.day_key " +
    "AND b.asset_key=c.asset_key AND b.status='preview_only' " +
    "AND bi.intent_key IS NULL) " +
    "AND NOT EXISTS (" +
    "SELECT 1 FROM tag_run_v2_payout_caps other " +
    "WHERE other.asset_key=c.asset_key " +
    "AND (other.chat_id!=c.chat_id OR other.day_key!=c.day_key) " +
    "AND (other.paused=0 OR EXISTS (" +
    "SELECT 1 FROM tag_run_v2_payout_intents oi " +
    "WHERE oi.chat_id=other.chat_id AND oi.day_key=other.day_key " +
    "AND oi.asset_key=other.asset_key " +
    "AND oi.status IN ('reserved','broadcast_unknown','reconciliation_review')))) " +
    "ORDER BY c.day_key,c.asset_key LIMIT 1"
  ).bind(chatId).first();
  if (paused) {
    try {
      await openReviewedDailyCap(env, {
        chatId, day: paused.day_key, assetKey: paused.asset_key
      });
    } catch (error) {
      if (String(error?.message || '').includes(
        'v2_payout_asset_obligations_unresolved'
      )) {
        return { status: 'waiting_for_prior_asset_obligations', ...paused };
      }
      throw error;
    }
    return { status: 'cap_opened', ...paused };
  }
  return missing ? { status: 'cap_created', ...missing } : { status: 'idle' };
}

async function reserveOne(env) {
  const chatId = String(env.TELEGRAM_GROUP_CHAT_ID);
  const bundle = await env.DB.prepare(
    'SELECT b.*,a.token_contract,a.token_symbol,a.token_precision,w.wax_account ' +
    'FROM tag_run_v2_bundles b JOIN tag_run_v2_assets a ON a.asset_key=b.asset_key ' +
    'JOIN tag_run_v2_payout_caps c ON c.chat_id=b.chat_id AND c.day_key=b.day_key ' +
    'AND c.asset_key=b.asset_key JOIN tag_run_wallets w ON w.telegram_id=b.telegram_id ' +
    'LEFT JOIN tag_run_v2_payout_intents i ON i.chat_id=b.chat_id AND i.day_key=b.day_key ' +
    'AND i.asset_key=b.asset_key AND i.bundle_index=b.bundle_index ' +
    "WHERE b.chat_id=? AND b.status='preview_only' AND a.eligibility='approved' " +
    'AND c.paused=0 AND i.intent_key IS NULL ' +
    'ORDER BY b.day_key,b.asset_key,b.bundle_index LIMIT 1'
  ).bind(chatId).first();
  if (!bundle) return { status: 'idle' };
  const authorizationDigest = await sha256Text(JSON.stringify({
    domain: 'tag-run-v2:automatic-reservation:v1',
    chatId, day: bundle.day_key, assetKey: bundle.asset_key,
    bundleIndex: bundle.bundle_index, telegramId: bundle.telegram_id,
    recipient: bundle.wax_account, units: bundle.units
  }));
  return reserveReviewedPayout(env, {
    chatId, day: bundle.day_key,
    contract: bundle.token_contract, symbol: bundle.token_symbol,
    precision: bundle.token_precision, bundleIndex: bundle.bundle_index,
    telegramId: bundle.telegram_id, receivingAccount: bundle.wax_account,
    amountUnits: bundle.units, authorizationDigest,
    approvedBy: 'automation:reservation-policy:v1'
  });
}

async function beforeBroadcast(env, intent, fetchImpl) {
  assertMode(env);
  const pin = await pinForAsset(env, intent.asset_key);
  const cap = await env.DB.prepare(
    'SELECT paused FROM tag_run_v2_payout_caps WHERE chat_id=? AND day_key=? AND asset_key=?'
  ).bind(intent.chat_id, intent.day_key, intent.asset_key).first();
  if (!cap || cap.paused !== 0) fail('emergency_pause');
  return verifyPinned(env, {
    assetKey: pin.asset_key, contract: pin.token_contract,
    symbol: pin.token_symbol, precision: pin.token_precision,
    expectedCodeHash: pin.approved_code_hash,
    expectedAbiHash: pin.approved_abi_hash, fetchImpl
  });
}

async function broadcastOne(env, fetchImpl, nowMs) {
  const outcomes = [];
  const retry = await env.DB.prepare(
    "SELECT i.* FROM tag_run_v2_payout_intents i " +
    "JOIN tag_run_v2_assets a ON a.asset_key=i.asset_key " +
    "JOIN tag_run_v2_payout_caps c ON c.chat_id=i.chat_id " +
    "AND c.day_key=i.day_key AND c.asset_key=i.asset_key " +
    "WHERE i.status='broadcast_unknown' AND i.submission_tx_id IS NOT NULL " +
    "AND i.signed_transaction_json IS NOT NULL AND a.eligibility='approved' " +
    "AND c.paused=0 AND i.updated_at<=datetime('now','-4 minutes') " +
    'ORDER BY i.updated_at,i.intent_key LIMIT 1'
  ).first();
  if (retry) {
    if (preparedTransactionExpired(retry.signed_transaction_json, nowMs)) {
      await moveToReconciliationOnly(env, retry);
      outcomes.push({
        status: 'expired_reconciliation_only', intentKey: retry.intent_key
      });
    } else {
      const prepared = await loadPreparedAutomaticPayout(env, {
        intentKey: retry.intent_key
      });
      try {
        await broadcastPreparedTransaction({
          transactionId: prepared.submissionTxId,
          signedTransactionJson: prepared.signedTransactionJson,
          beforeBroadcast: () => beforeBroadcast(env, retry, fetchImpl),
          fetchImpl
        });
        await env.DB.prepare(
          "UPDATE tag_run_v2_payout_intents SET updated_at=CURRENT_TIMESTAMP " +
          "WHERE intent_key=? AND status='broadcast_unknown'"
        ).bind(retry.intent_key).run();
        outcomes.push({
          status: 'same_transaction_rebroadcast', intentKey: retry.intent_key
        });
      } catch (error) {
        const reason = String(error?.message || '');
        if (!reason.includes('broadcast_unconfirmed') &&
            !reason.includes('wax_rpc_unavailable')) {
          await moveToReconciliationOnly(env, retry);
        } else {
          await env.DB.prepare(
            "UPDATE tag_run_v2_payout_intents SET updated_at=CURRENT_TIMESTAMP " +
            "WHERE intent_key=? AND status='broadcast_unknown'"
          ).bind(retry.intent_key).run();
        }
        outcomes.push({
          status: 'retry_unconfirmed', intentKey: retry.intent_key,
          reason: safeFailureReason(error)
        });
      }
    }
  }

  const intent = await env.DB.prepare(
    "SELECT i.* FROM tag_run_v2_payout_intents i " +
    "JOIN tag_run_v2_assets a ON a.asset_key=i.asset_key " +
    "JOIN tag_run_v2_payout_caps c ON c.chat_id=i.chat_id " +
    "AND c.day_key=i.day_key AND c.asset_key=i.asset_key " +
    "WHERE i.status='reserved' AND a.eligibility='approved' AND c.paused=0 " +
    'ORDER BY i.updated_at,i.intent_key LIMIT 1'
  ).first();
  if (!intent) {
    return outcomes.length
      ? { status: 'queue_serviced', outcomes }
      : { status: 'idle' };
  }
  try {
    const pin = await pinForAsset(env, intent.asset_key);
    await verifyPinned(env, {
      assetKey: pin.asset_key, contract: pin.token_contract,
      symbol: pin.token_symbol, precision: pin.token_precision,
      expectedCodeHash: pin.approved_code_hash,
      expectedAbiHash: pin.approved_abi_hash, fetchImpl
    });
    const request = buildReviewedWaxTransfer(intent, { permission: 'active' });
    const prepared = await prepareActiveKeyTransaction({
      request, privateKey: env.TAG_RUN_V2_ACTIVE_PRIVATE_KEY, fetchImpl
    });
    await stagePreparedAutomaticPayout(env, {
      intentKey: intent.intent_key,
      transactionId: prepared.transactionId,
      signedTransactionJson: prepared.signedTransactionJson,
      verifyPinnedContract: async options => verifyPinned(env, {
        ...options, assetKey: intent.asset_key, fetchImpl
      }),
      fetchImpl
    });
    try {
      await broadcastPreparedTransaction({
        ...prepared,
        beforeBroadcast: () => beforeBroadcast(env, intent, fetchImpl),
        fetchImpl
      });
    } catch (_) {
      // Frozen transaction remains available for same-ID retry/reconciliation.
    }
    outcomes.push({
      status: 'broadcast_unknown', intentKey: intent.intent_key
    });
  } catch (error) {
    await env.DB.prepare(
      "UPDATE tag_run_v2_payout_intents SET updated_at=CURRENT_TIMESTAMP " +
      "WHERE intent_key=? AND status='reserved'"
    ).bind(intent.intent_key).run();
    throw error;
  }
  return { status: 'queue_serviced', outcomes };
}

async function reconcileOne(env, fetchImpl) {
  const intent = await env.DB.prepare(
    "SELECT intent_key,submission_tx_id FROM tag_run_v2_payout_intents " +
    "WHERE status IN ('broadcast_unknown','reconciliation_review') " +
    "AND submission_tx_id IS NOT NULL " +
    "AND (reconcile_after IS NULL OR reconcile_after<=CURRENT_TIMESTAMP) " +
    "ORDER BY COALESCE(reconcile_after,'1970-01-01 00:00:00')," +
    'updated_at,intent_key LIMIT 1'
  ).first();
  if (!intent) return { status: 'idle' };
  try {
    const proof = await discoverAndVerifyIrreversibleWaxPayout({
      transactionId: intent.submission_tx_id, fetchImpl
    });
    await markIrreversiblyConfirmed(env, {
      intentKey: intent.intent_key,
      transactionId: intent.submission_tx_id,
      verifyIrreversibleAction: async () => proof
    });
    return { status: 'confirmed', intentKey: intent.intent_key };
  } catch (error) {
    const rotated = await env.DB.prepare(
      "UPDATE tag_run_v2_payout_intents " +
      "SET reconcile_after=datetime('now','+4 minutes') " +
      "WHERE intent_key=? " +
      "AND status IN ('broadcast_unknown','reconciliation_review')"
    ).bind(intent.intent_key).run();
    if (rotated?.success !== true || rotated.meta?.changes !== 1) {
      fail('reconciliation_retry_conflict');
    }
    return {
      status: 'waiting_for_irreversible_confirmation',
      intentKey: intent.intent_key,
      reason: safeFailureReason(error)
    };
  }
}

async function closeFinishedCap(env) {
  const chatId = String(env.TELEGRAM_GROUP_CHAT_ID);
  const cap = await env.DB.prepare(
    'SELECT c.chat_id,c.day_key,c.asset_key,c.revision FROM tag_run_v2_payout_caps c ' +
    "WHERE c.chat_id=? AND c.paused=0 " +
    'AND NOT EXISTS (SELECT 1 FROM tag_run_v2_payout_intents i ' +
    'WHERE i.chat_id=c.chat_id AND i.day_key=c.day_key AND i.asset_key=c.asset_key ' +
    "AND i.status!='confirmed') " +
    'AND NOT EXISTS (SELECT 1 FROM tag_run_v2_bundles b ' +
    'JOIN tag_run_wallets w ON w.telegram_id=b.telegram_id ' +
    'LEFT JOIN tag_run_v2_payout_intents i ON i.chat_id=b.chat_id ' +
    'AND i.day_key=b.day_key AND i.asset_key=b.asset_key ' +
    'AND i.bundle_index=b.bundle_index WHERE b.chat_id=c.chat_id ' +
    'AND b.day_key=c.day_key AND b.asset_key=c.asset_key AND i.intent_key IS NULL) ' +
    'ORDER BY c.day_key,c.asset_key LIMIT 1'
  ).bind(chatId).first();
  if (!cap) return { status: 'idle' };
  const result = await env.DB.prepare(
    'UPDATE tag_run_v2_payout_caps SET paused=1,revision=revision+1 ' +
    'WHERE chat_id=? AND day_key=? AND asset_key=? AND paused=0 AND revision=?'
  ).bind(cap.chat_id, cap.day_key, cap.asset_key, cap.revision).run();
  if (result?.success !== true || result.meta?.changes !== 1) {
    fail('cap_close_conflict');
  }
  return { status: 'cap_closed', day: cap.day_key, assetKey: cap.asset_key };
}

export async function runAutomaticCommunityPot(env, {
  dailyStart = false, nowMs = Date.now(), fetchImpl = fetch,
  cryptoImpl = globalThis.crypto
} = {}) {
  assertMode(env);
  const result = { mode: 'automatic', dailyStart, steps: [] };

  // Existing submissions and caps are serviced before attempting any new-day
  // work. Every stage is isolated: an empty day, unavailable beacon, blocked
  // cap or quarantined asset cannot freeze unrelated liabilities or assets.
  await runIsolatedStep(result, 'reconcile', () =>
    reconcileOne(env, fetchImpl));
  await runIsolatedStep(result, 'close_finished_cap', () =>
    closeFinishedCap(env));

  await runIsolatedStep(result, 'daily_setup', async () => {
    const targetDay = previousDay(nowMs);
    const existingDaily = await env.DB.prepare(
      'SELECT 1 AS present FROM tag_run_v2_draw_workflows ' +
      'WHERE chat_id=? AND day_key=?'
    ).bind(String(env.TELEGRAM_GROUP_CHAT_ID), targetDay).first();
    // A transient midnight RPC/D1 failure must not skip the day forever.
    if (dailyStart || !existingDaily) {
      return startDaily(env, { nowMs, fetchImpl, cryptoImpl });
    }
    return { status: 'already_started', day: targetDay };
  });
  await runIsolatedStep(result, 'advance_draw', () =>
    advanceDraw(env, { nowMs, fetchImpl }));
  await runIsolatedStep(result, 'create_or_open_cap', () =>
    createOrOpenCap(env));
  await runIsolatedStep(result, 'reserve', () => reserveOne(env));
  await runIsolatedStep(result, 'broadcast', () =>
    broadcastOne(env, fetchImpl, nowMs));
  return Object.freeze(result);
}
