// TAG RUN V2 future direct-to-registered-WAX-account payout policy.
// Pure, intentionally non-executable preflight. It never sends, signs,
// broadcasts, reserves, or records a token transfer. No feature flag can
// bypass these prerequisites: custody, donor consent, finalized settlement,
// legal policy and wallet ownership must all be independently established.
import { assetKey, parseIntegerUnits, TIP_ACCOUNT } from './v2-core.js';
import { isValidWaxAccount } from './core.js';

const safePositiveInteger = value => Number.isSafeInteger(value) && value > 0;
const validDigest = value => typeof value === 'string' &&
  /^[a-f0-9]{64}$/i.test(value);

export const PAYOUT_ROUTE = 'telegram_registered_wax_account';
export const PAYOUTS_IMPLEMENTED = false; // There is deliberately no signer or transmitter.

export function evaluateRegisteredWalletPayout({
  env, wallet, allocation, authority
} = {}) {
  const blockers = [];
  // An enabled flag alone must never be treated as permission or as a
  // working payout system. This module cannot execute transactions.
  if (!PAYOUTS_IMPLEMENTED) blockers.push('signer_and_transfer_system_not_implemented');
  if (env?.TAG_RUN_V2_PAYOUTS_ENABLED !== 'true') blockers.push('payout_gate_disabled');
  if (env?.TAG_RUN_V2_DRAWS_ENABLED !== 'true') blockers.push('draw_gate_disabled');
  if (env?.TAG_RUN_V2_POOL_ENABLED !== 'true') blockers.push('pool_gate_disabled');
  if (env?.TAG_RUN_V2_OBSERVATION_ENABLED === 'true') blockers.push('observation_mode_active');

  const telegramId = String(allocation?.telegramId ?? '');
  const walletId = String(wallet?.telegram_id ?? '');
  const account = String(wallet?.wax_account ?? '');
  if (!/^[0-9]{1,20}$/.test(telegramId) || telegramId !== walletId) {
    blockers.push('recipient_identity_mismatch');
  }
  if (!isValidWaxAccount(account) || account === TIP_ACCOUNT) {
    blockers.push('recipient_wallet_invalid');
  }
  if (wallet?.verification_status !== 'verified' ||
      !wallet?.verified_at || wallet?.wax_account !== allocation?.recipientAccount ||
      authority?.walletOwnershipProofValid !== true) {
    blockers.push('recipient_wallet_ownership_unverified');
  }

  try {
    if (allocation?.assetKey !== assetKey(allocation?.contract,
        allocation?.symbol, allocation?.precision) ||
        parseIntegerUnits(allocation?.units) <= 0n) {
      blockers.push('allocation_asset_or_units_invalid');
    }
  } catch (_) {
    blockers.push('allocation_asset_or_units_invalid');
  }

  if (allocation?.status !== 'locked' ||
      !validDigest(allocation?.snapshotDigest) ||
      !validDigest(allocation?.rulesDigest) ||
      !validDigest(allocation?.receiptsDigest)) {
    blockers.push('finalized_allocation_missing');
  }
  if (authority?.custodyVerified !== true ||
      authority?.donationConsentVerified !== true ||
      authority?.historicalSnapshotFinalized !== true ||
      authority?.assetApproved !== true ||
      authority?.legalReviewApproved !== true ||
      authority?.separateSpendingApproval !== true ||
      !safePositiveInteger(authority?.spendingLimitUnits) ||
      authority?.idempotencyAndReconciliationVerified !== true) {
    blockers.push('operator_authorities_incomplete');
  }
  // Never imply preflight approves a payout. Signer deliberately absent.
  return Object.freeze({
    route: PAYOUT_ROUTE,
    allowed: false,
    blockers: Object.freeze([...new Set(blockers)]),
    recipientAccount: isValidWaxAccount(account) ? account : null,
    transferAttempted: false
  });
}
