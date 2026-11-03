// TAG RUN V2 read-only inbound token receipt scanner.
// Not a donation ledger until human/custody review. Unknown assets remain
// quarantined; missing LIB/provenance fails closed. NO signing or transfers.
import { TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, assetKey, parseQuantity,
  sha256Text, validUtcDay } from './v2-core.js';
import { readWaxTipAccount, WAX_HYPERION } from './v2-chain.js';

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
    checkLib:'true', simple:'true'
  });
  const response = await fetchImpl(WAX_HYPERION +
    '/v2/history/get_actions?' + params.toString(), { method:'GET' });
  if (!response?.ok) throw new Error('wax_history_unavailable');
  const page = await response.json();
  if (!page || !Array.isArray(page.actions) || page.actions.length > limit) {
    throw new Error('wax_history_malformed');
  }
  const receipts = [];
  for (const action of page.actions) {
    const transfer = action?.act;
    const data = transfer?.data;
    if (transfer?.name !== 'transfer' || data?.to !== account ||
        data?.from === account) continue;
    // Only immutable / chain-confirmed actions are eligible for a
    // QUARANTINED inbound ledger. No unconfirmed action is accepted.
    if (action.irreversible !== true ||
        !Number.isSafeInteger(action.block_num) ||
        action.block_num <= 0 ||
        action.block_num > proof.latestIrreversibleBlock ||
        typeof action.block_id !== 'string' ||
        !TX_ID.test(action.block_id) ||
        !TX_ID.test(action.trx_id)) continue;
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
      blockNum:action.block_num,blockId:action.block_id.toLowerCase(),
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
  if (env?.TAG_RUN_V2_POOL_ENABLED !== 'true' ||
      env?.TAG_RUN_V2_TIP_ACCOUNT !== TIP_ACCOUNT || !env.DB) {
    return {status:'disabled'};
  }
  const cfg=await env.DB.prepare('SELECT status FROM tag_run_v2_pool_config WHERE config_id=1').first();
  if (!cfg || cfg.status==='paused') return {status:'paused'};
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
