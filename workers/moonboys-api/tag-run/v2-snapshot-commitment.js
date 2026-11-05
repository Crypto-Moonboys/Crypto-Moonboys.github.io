// TAG RUN V2 canonical multi-token draw snapshot commitment v1.
// No D1 writes, WAX RPC, wallet keys or transaction signing.
import { MAX_ASSETS, TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, assetKey, parseIntegerUnits, sha256Text, validUtcDay } from './v2-core.js';

export const SNAPSHOT_COMMITMENT_DOMAIN = 'tag-run-v2:snapshot-set:v2';
const DIGEST = /^[0-9a-f]{64}$/;
const LEGACY_DOMAIN = 'tag-run-v2:snapshot-set:v1';
const SHARED_FIELDS = ['onchain_units','allocated_unpaid_units','excluded_units','spendable_units'];
const FIELDS = [...SHARED_FIELDS,'daily_reward_units'];
const LEGACY_FIELDS = [...SHARED_FIELDS,'five_percent_units'];
const isDigest = v => typeof v === 'string' && DIGEST.test(v);
const integer = v => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

function snapshotPayload({chatId,day,rows},legacy) {
  if (typeof chatId !== 'string' || !/^-?[0-9]{1,24}$/.test(chatId) ||
      !validUtcDay(day) || !Array.isArray(rows) || rows.length < 1 ||
      rows.length > MAX_ASSETS) throw Error('invalid_snapshot_set');
  const seen = new Set();
  const snapshots = rows.map(row => {
    if (!row || row.status !== 'verified' ||
        row.wallet_account !== TIP_ACCOUNT ||
        row.chain_id !== WAX_MAINNET_CHAIN_ID ||
        !integer(row.chain_irreversible_block) ||
        !isDigest(row.chain_block_id) || !isDigest(row.snapshot_digest) ||
        typeof row.token_contract !== 'string' ||
        typeof row.token_symbol !== 'string' ||
        !Number.isInteger(row.token_precision)) throw Error('invalid_snapshot_evidence');
    const key = assetKey(row.token_contract,row.token_symbol,row.token_precision);
    if (key !== row.asset_key || seen.has(key)) throw Error('invalid_or_duplicate_snapshot_asset');
    seen.add(key);
    if (legacy ? (row.reward_policy_bps !== undefined && row.reward_policy_bps !== 500) : row.reward_policy_bps !== 100)
      throw Error('snapshot_policy_version_mismatch');
    const amounts = (legacy ? LEGACY_FIELDS : FIELDS).map(field => parseIntegerUnits(row[field]));
    const [onchain,reserved,excluded,spendable,daily] = amounts;
    if (reserved + excluded > onchain ||
        spendable !== onchain - reserved - excluded ||
        daily !== spendable * BigInt(legacy ? 500 : 100) / 10000n)
      throw Error('invalid_snapshot_budget');
    return [
      key,row.snapshot_digest,row.chain_irreversible_block,row.chain_block_id,
      ...amounts.map(n=>n.toString())
    ];
  }).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  // Canonical JSON array, not object serialization. Domain + chain + group +
  // UTC day and every snapshot's source/block/balance fields are committed.
  return JSON.stringify([
    legacy ? LEGACY_DOMAIN : SNAPSHOT_COMMITMENT_DOMAIN,WAX_MAINNET_CHAIN_ID,TIP_ACCOUNT,chatId,day,snapshots
  ]);
}
export function canonicalSnapshotSetPayload(input) {
  return snapshotPayload(input,false);
}
export async function canonicalSnapshotSetDigest(input,cryptoImpl) {
  return sha256Text(canonicalSnapshotSetPayload(input),cryptoImpl);
}
// Legacy v1 is available only to authenticate historical 5% commitments.
// Never use it as the current payout eligibility validator.
export function canonicalLegacySnapshotSetPayload(input) {
  return snapshotPayload(input,true);
}
export async function canonicalLegacySnapshotSetDigest(input,cryptoImpl) {
  return sha256Text(canonicalLegacySnapshotSetPayload(input),cryptoImpl);
}
