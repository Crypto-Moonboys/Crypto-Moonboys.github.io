// TAG RUN V2 read-only inbound token receipt scanner.
// Not a donation ledger until human/custody review. Unknown assets remain
// quarantined; missing LIB/provenance fails closed. NO signing or transfers.
import { TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, assetKey, parseQuantity,
  sha256Text, validUtcDay } from './v2-core.js';
import { readWaxTipAccount, WAX_HYPERION, WAX_HYPERION_FALLBACKS,
  WAX_CHAIN_API } from './v2-chain.js';

const MAX_SCAN = 100;
const TX_ID = /^[a-f0-9]{64}$/i;
const SEQUENCE = /^(0|[1-9][0-9]{0,24})$/;
const TOKEN_QTY = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,8}))? ([A-Z]{1,7})$/;
export async function readInboundTipReceipts({ fetchImpl = fetch,
  cryptoImpl = globalThis.crypto, limit = MAX_SCAN,
  account = TIP_ACCOUNT } = {}) {
  if (account !== TIP_ACCOUNT) throw new Error('unexpected_tip_account');
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SCAN) {
    throw new Error('invalid_scan_limit');
  }
  const proof = await readWaxTipAccount({ fetchImpl, account });
  const params = new URLSearchParams({
    account, limit:String(limit), sort:'desc', 'act.name':'transfer',
    checkLib:'true' // Full actions: simple=true changes 'actions' to 'simple_actions'.
  });
  let page;
  for (const host of [WAX_HYPERION, ...WAX_HYPERION_FALLBACKS]) {
    let response;
    try {
      response = await fetchImpl(host +
        '/v2/history/get_actions?' + params.toString(), { method:'GET' });
    } catch (_) {
      continue;
    }
    if (!response?.ok) continue;
    try {
      page = await response.json();
    } catch (_) {
      throw new Error('wax_history_malformed');
    }
    if (!page || !Array.isArray(page.actions) || page.actions.length > limit) {
      throw new Error('wax_history_malformed');
    }
    break;
  }
  if (!page) throw new Error('wax_history_unavailable');
  // Full Hyperion actions generally have no block_id or irreversible flag.
  // Resolve block provenance from the authoritative WAX chain RPC, cache
  // repeated blocks and compare against the chain's LIB from get_info.
  const blockIds = new Map();
  async function verifiedBlockId(blockNum) {
    if (blockIds.has(blockNum)) return blockIds.get(blockNum);
    const response = await fetchImpl(WAX_CHAIN_API + '/v1/chain/get_block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_num_or_id: blockNum })
    });
    if (!response?.ok) throw new Error('wax_irreversible_block_unavailable');
    const block = await response.json();
    if (!block || block.block_num !== blockNum ||
        typeof block.id !== 'string' || !TX_ID.test(block.id)) {
      throw new Error('wax_irreversible_block_mismatch');
    }
    blockIds.set(blockNum, block.id.toLowerCase());
    return block.id.toLowerCase();
  }
  const receipts = [];
  for (const action of page.actions) {
    const transfer = action?.act;
    const data = transfer?.data;
    if (transfer?.name !== 'transfer' || data?.to !== account ||
        data?.from === account) continue;
    // Only chain-LIB-final blocks qualify as QUARANTINED receipt evidence.
    // The simple-mode 'irreversible' flag is not present on raw actions.
    if (!Number.isSafeInteger(action.block_num) ||
        action.block_num <= 0 ||
        action.block_num > proof.latestIrreversibleBlock ||
        !TX_ID.test(String(action.trx_id || ''))) continue;
    const blockId = await verifiedBlockId(action.block_num);
    // A provider-supplied block ID is optional in raw Hyperion records, but
    // reject it if present and inconsistent with the chain RPC.
    if (action.block_id != null &&
        (typeof action.block_id !== 'string' ||
         action.block_id.toLowerCase() !== blockId)) continue;
    // Hyperion global sequences may exceed JS Number.MAX_SAFE_INTEGER.
    // Never dedupe rounded numbers as though they were immutable chain IDs.
    if (typeof action.global_sequence === 'number' &&
        !Number.isSafeInteger(action.global_sequence)) continue;
    const sequence = String(action.global_sequence ?? '');
    if (!SEQUENCE.test(sequence)) continue;
    const quantity = String(data?.quantity || '');
    const match = quantity.match(TOKEN_QTY);
    if (!match) continue;
    const precision = (match[2] || '').length;
    let key, units;
    try {
      key = assetKey(transfer.account, match[3], precision);
      units = parseQuantity(quantity,precision,match[3]);
    } catch (_) { continue; }
    if (units === '0') continue;
    receipts.push({
      chainId:WAX_MAINNET_CHAIN_ID,globalSequence:sequence,
      transactionId:action.trx_id.toLowerCase(),
      blockNum:action.block_num,blockId,
      sender:String(data.from || ''),recipient:account,
      contract:transfer.account,symbol:match[3],precision,
      assetKey:key,units,
      memoDigest:await sha256Text(String(data.memo || ''),cryptoImpl),
      status:'quarantined'
    });
  }
  return {
    account, lastIrreversibleBlock:proof.latestIrreversibleBlock,
    // More records may be available: without a cursor backfill, NEVER
    // claim the historical donation inventory is complete.
    truncated:page.actions.length === limit,
    receipts
  };
}
export async function quarantineInboundTipReceipts(env, options={}) {
  const pausedObservation = options.allowPausedObservation === true &&
    env?.TAG_RUN_ENABLED === 'true' &&
    env?.TAG_RUN_WEEKLY_REWARDS_ENABLED === 'false' &&
    env?.TAG_RUN_V2_OBSERVATION_ENABLED === 'true' &&
    env?.TAG_RUN_V2_DRAWS_ENABLED === 'false' &&
    env?.TAG_RUN_V2_PAYOUTS_ENABLED === 'false';
  if ((env?.TAG_RUN_V2_POOL_ENABLED !== 'true' && !pausedObservation) ||
      env?.TAG_RUN_V2_TIP_ACCOUNT !== TIP_ACCOUNT || !env.DB) {
    return {status:'disabled'};
  }
  const cfg=await env.DB.prepare('SELECT status FROM tag_run_v2_pool_config WHERE config_id=1').first();
  if (!cfg || (cfg.status==='paused' && !pausedObservation)) return {status:'paused'};
  if (pausedObservation && cfg.status!=='paused') return {status:'paused'};
  const scan=await readInboundTipReceipts(options);
  let inserted=0;
  // This is an evidence-inventory action only, never a funding entitlement.
  // A resumed scan idempotently replays already seen action sequences.
  for(const receipt of scan.receipts){
    const assetWrite=await env.DB.prepare(
      'INSERT OR IGNORE INTO tag_run_v2_assets '+
      '(asset_key,chain_id,token_contract,token_symbol,token_precision,eligibility) '+
      "VALUES (?,?,?,?,?,'quarantined')"
    ).bind(receipt.assetKey,receipt.chainId,receipt.contract,
      receipt.symbol,receipt.precision).run();
    if(assetWrite?.success===false)throw new Error('quarantine_asset_write_failed');
    const write=await env.DB.prepare(
      'INSERT OR IGNORE INTO tag_run_v2_deposits '+
      '(chain_id,global_action_seq,transaction_id,block_num,block_id,'+
      'sender_account,recipient_account,asset_key,units,memo_digest,status) '+
      "VALUES (?,?,?,?,?,?,?,?,?,?,'quarantined')"
    ).bind(receipt.chainId,receipt.globalSequence,receipt.transactionId,
      receipt.blockNum,receipt.blockId,receipt.sender,receipt.recipient,
      receipt.assetKey,receipt.units,receipt.memoDigest).run();
    if(write?.success===false)throw new Error('quarantine_receipt_write_failed');
    inserted+=Number(write?.meta?.changes)>0 ? 1:0;
  }
  return {status:'quarantined_review_only',seen:scan.receipts.length,
    inserted,truncated:scan.truncated};
}
