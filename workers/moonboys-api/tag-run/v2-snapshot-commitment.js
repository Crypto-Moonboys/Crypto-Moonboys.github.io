// TAG RUN V2 canonical multi-token draw snapshot commitment v1.
// No D1 writes, WAX RPC, wallet keys or transaction signing.
import { MAX_ASSETS, TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, assetKey, parseIntegerUnits, sha256Text, validUtcDay } from './v2-core.js';

export const SNAPSHOT_COMMITMENT_DOMAIN = 'tag-run-v2:snapshot-set:v1';
const DIGEST = /^[0-9a-f]{64}$/;
const FIELDS = ['onchain_units','allocated_unpaid_units','excluded_units','spendable_units','five_percent_units'];
const isDigest = v => typeof v === 'string' && DIGEST.test(v);
const integer = v => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

export function canonicalSnapshotSetPayload({chatId,day,rows}) {
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
    const amounts = FIELDS.map(field => parseIntegerUnits(row[field]));
    const [onchain,reserved,excluded,spendable,five] = amounts;
    if (reserved + excluded > onchain ||
        spendable !== onchain - reserved - excluded ||
        five !== spendable * 500n / 10000n)
      throw Error('invalid_snapshot_budget');
    return [
      key,row.snapshot_digest,row.chain_irreversible_block,row.chain_block_id,
      ...amounts.map(n=>n.toString())
    ];
  }).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  // Canonical JSON array, not object serialization. Domain + chain + group +
  // UTC day and every snapshot's source/block/balance fields are committed.
  return JSON.stringify([
    SNAPSHOT_COMMITMENT_DOMAIN,WAX_MAINNET_CHAIN_ID,TIP_ACCOUNT,chatId,day,snapshots
  ]);
}
export async function canonicalSnapshotSetDigest(input,cryptoImpl) {
  return sha256Text(canonicalSnapshotSetPayload(input),cryptoImpl);
}
