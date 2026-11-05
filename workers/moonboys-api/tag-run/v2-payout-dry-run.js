// TAG RUN V2 — strictly READ-ONLY payout authorization preview.
// This does not reserve a cap, write D1, sign a transaction or make a WAX RPC.
// It runs even when funded draws and real payouts are disabled. A "candidate"
// is NEVER permission to broadcast: live two-person and chain reviews remain.
import {
  TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, assetKey, formatQuantity,
  parseIntegerUnits, sha256Text, validUtcDay
} from './v2-core.js';
import { authenticatedGroupId, isValidWaxAccount } from './core.js';

export const PAYOUT_DRY_RUN_ONLY = true;
const HEX = /^[0-9a-f]{64}$/;
const REASONS = Object.freeze({
  notAllowlisted: 'operator_asset_allowlist_missing',
  unapprovedAsset: 'asset_not_approved',
  missingReview: 'asset_review_evidence_missing',
  unconfirmedDonation: 'confirmed_donation_missing',
  unverifiedSnapshot: 'verified_snapshot_missing',
  badSnapshot: 'snapshot_budget_invalid',
  unreviewedPool: 'pool_not_review_only',
  capMissing: 'payout_cap_missing',
  capPaused: 'payout_cap_paused',
  capMismatch: 'payout_cap_mismatch',
  capExceeded: 'daily_cap_exceeded',
  transferExceeded: 'per_transfer_cap_exceeded',
  drawUnreviewed: 'draw_not_reviewed',
  bundleInvalid: 'bundle_unapproved_or_invalid',
  recipientUnregistered: 'registered_destination_missing',
  duplicate: 'bundle_already_reserved',
  overlapping: 'asset_has_unresolved_cap',
  operatorReview: 'operator_review_reference_missing'
});
const invalid = detail => { throw new Error('v2_dry_run_' + detail); };
const nonnegative = value => parseIntegerUnits(value);
const isText = v => typeof v === 'string' && v.trim().length > 0;
const validDigest = v => typeof v === 'string' && HEX.test(v);
const asNumber = (value, fallback = -1) =>
  Number.isSafeInteger(value) ? value : fallback;
const isRow = row => row === null || (row && typeof row === 'object' && !Array.isArray(row));

// Do not accept an unverified fetch failure as a "missing" approval.
// SELECT-only statements are used; a D1 read error propagates fail-closed.
async function first(db, sql, ...params) {
  if (!/^SELECT\s/i.test(sql) || sql.includes(';')) invalid('non_read_only_sql');
  const row = await db.prepare(sql).bind(...params).first();
  if (!isRow(row)) invalid('database_response_invalid');
  return row;
}
function exactPositive(value) {
  const units = nonnegative(value);
  return units > 0n ? units : null;
}
function safeUnits(value) {
  try { return nonnegative(value); } catch { return null; }
}
function allowAsset(allowlist, key) {
  return Array.isArray(allowlist) && allowlist.length <= 100 &&
    allowlist.every(v => typeof v === 'string') && allowlist.includes(key);
}
function calculateSnapshot(source, digest) {
  if (!source || source.status !== 'verified' ||
      !validDigest(source.snapshot_digest) || source.snapshot_digest !== digest ||
      source.wallet_account !== TIP_ACCOUNT ||
      asNumber(source.chain_irreversible_block) <= 0 ||
      !validDigest(source.chain_block_id)) return null;
  const onchain = safeUnits(source.onchain_units);
  const reserved = safeUnits(source.allocated_unpaid_units);
  const excluded = safeUnits(source.excluded_units);
  const spendable = safeUnits(source.spendable_units);
  const five = safeUnits(source.five_percent_units);
  if ([onchain, reserved, excluded, spendable, five].some(x => x === null) ||
      reserved + excluded > onchain || spendable !== onchain - reserved - excluded ||
      five !== spendable * 500n / 10000n || five === 0n) return null;
  return { five, spendable };
}

// Source arguments identify an existing reviewed draw and member bundle.
// Amount, destination, token units, and snapshot are read from D1, NOT CLI.
export async function previewReviewedPayoutAuthorization(env, {
  chatId, day, contract, symbol, precision, bundleIndex,
  operatorAllowlist = [], reviewDigest, reviewedBy, cryptoImpl
} = {}) {
  if (!env?.DB || !chatId || chatId !== authenticatedGroupId(env) ||
      !validUtcDay(day) || !Number.isInteger(precision) || precision < 0 ||
      precision > 8 || !Number.isSafeInteger(bundleIndex) ||
      bundleIndex < 0 || bundleIndex >= 20)
    invalid('selector_invalid');
  const key = assetKey(contract, symbol, precision);
  const db = env.DB;
  const reasons = new Set();
  if (!allowAsset(operatorAllowlist, key)) reasons.add(REASONS.notAllowlisted);
  if (!validDigest(reviewDigest) || !isText(reviewedBy))
    reasons.add(REASONS.operatorReview);

  const [pool, asset, deposit, snapshot, cap, draw, bundle, duplicate, overlap] =
    await Promise.all([
      first(db, 'SELECT wallet_account,status,daily_bps,historical_ticket_bps FROM tag_run_v2_pool_config WHERE config_id=1'),
      first(db, 'SELECT asset_key,eligibility,reviewed_by,verified_at FROM tag_run_v2_assets WHERE asset_key=?',key),
      first(db, "SELECT 1 AS found FROM tag_run_v2_deposits WHERE asset_key=? AND status='confirmed_donation' LIMIT 1",key),
      first(db, 'SELECT * FROM tag_run_v2_snapshots WHERE chat_id=? AND day_key=? AND asset_key=?',chatId,day,key),
      first(db, 'SELECT * FROM tag_run_v2_payout_caps WHERE chat_id=? AND day_key=? AND asset_key=?',chatId,day,key),
      first(db, 'SELECT status,reviewed_by FROM tag_run_v2_draws WHERE chat_id=? AND day_key=?',chatId,day),
      first(db, 'SELECT telegram_id,units,status FROM tag_run_v2_bundles WHERE chat_id=? AND day_key=? AND asset_key=? AND bundle_index=?',chatId,day,key,bundleIndex),
      first(db, 'SELECT intent_key FROM tag_run_v2_payout_intents WHERE chat_id=? AND day_key=? AND asset_key=? AND bundle_index=? LIMIT 1',chatId,day,key,bundleIndex),
      first(db,
        'SELECT 1 AS found FROM tag_run_v2_payout_caps c WHERE c.asset_key=? AND (c.chat_id!=? OR c.day_key!=?) ' +
        "AND (c.paused=0 OR EXISTS (SELECT 1 FROM tag_run_v2_payout_intents i " +
        'WHERE i.chat_id=c.chat_id AND i.day_key=c.day_key AND i.asset_key=c.asset_key ' +
        "AND i.status IN ('reserved','broadcast_unknown','reconciliation_review'))) LIMIT 1",
        key,chatId,day)
    ]);
  let wallet = null;
  if (bundle?.telegram_id && /^[0-9]{1,20}$/.test(String(bundle.telegram_id)))
    wallet = await first(db,
      'SELECT telegram_id,wax_account FROM tag_run_wallets WHERE telegram_id=?',
      String(bundle.telegram_id));

  if (!pool || pool.wallet_account !== TIP_ACCOUNT || pool.status !== 'review_only' ||
      pool.daily_bps !== 500 || pool.historical_ticket_bps !== 5000)
    reasons.add(REASONS.unreviewedPool);
  if (!asset || asset.asset_key !== key || asset.eligibility !== 'approved')
    reasons.add(REASONS.unapprovedAsset);
  if (!isText(asset?.reviewed_by) || !isText(asset?.verified_at))
    reasons.add(REASONS.missingReview);
  if (!deposit) reasons.add(REASONS.unconfirmedDonation);
  if (!cap) reasons.add(REASONS.capMissing);
  else if (cap.paused !== 0) reasons.add(REASONS.capPaused);
  if (!draw || draw.status !== 'reviewed' || !isText(draw.reviewed_by))
    reasons.add(REASONS.drawUnreviewed);
  const amount = safeUnits(bundle?.units);
  if (!bundle || bundle.status !== 'preview_only' ||
      !/^[0-9]{1,20}$/.test(String(bundle.telegram_id || '')) ||
      amount === null || amount === 0n)
    reasons.add(REASONS.bundleInvalid);
  if (!wallet || wallet.telegram_id !== String(bundle?.telegram_id) ||
      !isValidWaxAccount(wallet.wax_account) || wallet.wax_account === TIP_ACCOUNT)
    reasons.add(REASONS.recipientUnregistered);
  if (duplicate) reasons.add(REASONS.duplicate);
  if (overlap) reasons.add(REASONS.overlapping);

  const validSource = calculateSnapshot(snapshot, snapshot?.snapshot_digest);
  if (!snapshot || snapshot.status !== 'verified' ||
      !validDigest(snapshot.snapshot_digest)) reasons.add(REASONS.unverifiedSnapshot);
  else if (!validSource) reasons.add(REASONS.badSnapshot);

  let daily = null, remaining = null, per = null;
  if (cap) {
    const limit = safeUnits(cap.daily_limit_units);
    const committed = safeUnits(cap.committed_units);
    per = safeUnits(cap.per_transfer_limit_units);
    daily = validSource?.five ?? null;
    if (!validSource || !validDigest(cap.snapshot_digest) ||
        cap.snapshot_digest !== snapshot.snapshot_digest ||
        !isText(cap.authorized_by) || limit === null || committed === null ||
        per === null || per === 0n || per > limit || limit !== daily ||
        committed > limit || asNumber(cap.revision) < 0)
      reasons.add(REASONS.capMismatch);
    else remaining = limit - committed;
    if (amount !== null && amount > 0n) {
      if (per === null || amount > per) reasons.add(REASONS.transferExceeded);
      if (remaining === null || amount > remaining) reasons.add(REASONS.capExceeded);
    }
  }

  let intentKey = null, unsignedAction = null;
  if (reasons.size === 0) {
    intentKey = await sha256Text([
      chatId,day,key,bundleIndex,String(bundle.telegram_id),wallet.wax_account,
      amount.toString(),cap.snapshot_digest,reviewDigest
    ].join('|'),cryptoImpl);
    unsignedAction = Object.freeze({
      account: contract, name: 'transfer',
      authorization: [{actor: TIP_ACCOUNT, permission: 'tagrain'}],
      data: {
        from: TIP_ACCOUNT,to: wallet.wax_account,
        quantity: formatQuantity(amount.toString(),precision,symbol),
        memo: 'TAG RUN V2 ' + intentKey.slice(0,20)
      }
    });
  }
  return Object.freeze({
    mode: 'DRY_RUN_READ_ONLY',
    status: reasons.size ? 'BLOCKED' : 'REVIEW_CANDIDATE',
    reasonCodes: [...reasons],
    chainId: WAX_MAINNET_CHAIN_ID,
    assetKey: key, day, bundleIndex,
    snapshotDailyLimitUnits: daily?.toString() ?? null,
    remainingCapUnits: remaining?.toString() ?? null,
    bundleAmountUnits: amount?.toString() ?? null,
    receivingAccount: wallet?.wax_account ?? null,
    intentKey, unsignedAction,
    evidence: Object.freeze({
      operatorAllowlist: allowAsset(operatorAllowlist,key),
      assetReviewedInD1: isText(asset?.reviewed_by) && isText(asset?.verified_at),
      confirmedDonationInD1: Boolean(deposit),
      verifiedSnapshotInD1: Boolean(validSource),
      reviewedDrawInD1: draw?.status === 'reviewed' && isText(draw.reviewed_by),
      duplicateReserved: Boolean(duplicate),
      crossDayObligation: Boolean(overlap),
    }),
    reserveAttempted: false, signatureRequested: false,
    transactionBroadcast: false, releaseAuthorized: false,
    requiresIndependentFundingAndOnchainAuthorization: true
  });
}
