// Read-only accounting of cross-checked but UNAPPROVED receipt evidence.
// No consent decision, immutable token cutoff balance, reserve or payout is
// implied by summing inbound history or observing a live account balance.
import { parseIntegerUnits, TIP_ACCOUNT, MAX_ASSETS,
  WAX_MAINNET_CHAIN_ID } from './v2-core.js';
import { FUNDING_EVIDENCE_MODE } from './v2-funding-evidence-review.js';

export const FUNDING_REVIEW_STATUS = 'unverified_reconciliation_only';
const fail = message => { throw new Error('funding_review_' + message); };
const SEQUENCE = /^[1-9][0-9]{0,24}$/;
const HEX = /^[0-9a-f]{64}$/;
export function reconcileUnapprovedFunding({
  inspection, knownExclusions = []
} = {}) {
  if (!inspection || inspection.status !== FUNDING_EVIDENCE_MODE ||
      inspection.account !== TIP_ACCOUNT ||
      inspection.chainId !== WAX_MAINNET_CHAIN_ID ||
      inspection.fundingApproved !== false ||
      inspection.donationConsentVerified !== false ||
      inspection.treasuryCustodyVerified !== false ||
      inspection.historicalSnapshotFinalized !== false ||
      inspection.transferAttempted !== false ||
      inspection.chainReferenceChecked !== true ||
      inspection.provenanceCrossChecked !== true ||
      !Array.isArray(inspection.observations) ||
      !Array.isArray(inspection.observedBalances) ||
      !Array.isArray(knownExclusions) ||
      inspection.observations.length > 20 ||
      inspection.observedBalances.length > MAX_ASSETS ||
      knownExclusions.length > MAX_ASSETS) fail('untrusted_evidence');
  const byAsset=new Map();
  for(const row of inspection.observedBalances) {
    if (typeof row?.assetKey !== 'string' || byAsset.has(row.assetKey) ||
        row.historicalBalanceFinalized !== false ||
        row.custodyControlVerified !== false ||
        row.assetApproved !== false ||
        row.eligibleDonationUnits !== '0') fail('balance_not_authorized');
    const amount=parseIntegerUnits(row.currentHeadBalanceUnits);
    byAsset.set(row.assetKey,{assetKey:row.assetKey,
      head:amount,received:0n,excluded:0n,reserved:0n});
  }
  const seen=new Set();
  for(const receipt of inspection.observations) {
    if (!receipt || receipt.status !== FUNDING_EVIDENCE_MODE ||
        receipt.spendable !== false ||
        receipt.donationApproved !== false ||
        receipt.blockReferenceIrreversible !== true ||
        receipt.merkleInclusionProven !== false ||
        receipt.corroborators !== 2 ||
        typeof receipt.globalSequence !== 'string' ||
        !SEQUENCE.test(receipt.globalSequence) ||
        typeof receipt.proofDigest !== 'string' ||
        !HEX.test(receipt.proofDigest) ||
        seen.has(receipt.globalSequence)) fail('receipt_not_quarantined');
    seen.add(receipt.globalSequence);
    const asset=byAsset.get(receipt.assetKey);
    if (!asset) fail('receipt_asset_not_observed');
    const amount=parseIntegerUnits(receipt.units);
    if (amount<=0n) fail('invalid_receipt_units');
    asset.received+=amount;
  }
  const excluded=new Set();
  for(const row of knownExclusions) {
    if (!row || typeof row.assetKey !== 'string' ||
        excluded.has(row.assetKey) || !byAsset.has(row.assetKey)) {
      fail('duplicate_or_unknown_exclusion');
    }
    excluded.add(row.assetKey);
    const asset=byAsset.get(row.assetKey);
    asset.excluded=parseIntegerUnits(row.excludedUnits);
    asset.reserved=parseIntegerUnits(row.reservedUnits);
    if (asset.excluded + asset.reserved > asset.head)
      fail('current_head_deficit');
  }
  const assets=Object.freeze([...byAsset.values()]
    .sort((a,b)=>a.assetKey.localeCompare(b.assetKey))
    .map(a=>Object.freeze({
      assetKey:a.assetKey,
      // Neither a historical inbound sum nor a current account balance is a
      // finalized treasury snapshot or a verified donation.
      corroboratedHistoricalInboundUnits:a.received.toString(),
      currentHeadBalanceUnits:a.head.toString(),
      observedReservedUnits:a.reserved.toString(),
      observedExcludedUnits:a.excluded.toString(),
      unverifiedHeadRemainderUnits:(a.head-a.excluded-a.reserved).toString(),
      independentlyApprovedDonationUnits:'0',
      fundedRewardBudgetUnits:'0',
      status:'quarantined_review_only'
    })));
  return Object.freeze({
    status:FUNDING_REVIEW_STATUS, account:TIP_ACCOUNT,
    assets, fundsApproved:false,
    historicalBalanceFinalized:false, donationConsentVerified:false,
    recipientAllocationsCreated:false, transferAttempted:false,
    spendingEnabled:false,
    blockers:Object.freeze([
      'no_donor_consent_review',
      'no_historical_cutoff_balance_proof',
      'no_custody_control_attestation',
      'no_funded_reservation_or_spending_approval',
      'no_payout_executor'
    ])
  });
}