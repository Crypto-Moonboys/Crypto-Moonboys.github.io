// TAG RUN V2 private-admin funding evidence helpers. These functions perform
// bounded, read-only WAX/Hyperion checks. They never sign, broadcast, reserve,
// draw or pay tokens.
import {
  DAILY_BPS, TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, assetKey, parseQuantity,
  sha256Text
} from './v2-core.js';
import { WAX_AUTHORITY_PROVIDERS } from './v2-wax-authority-review.js';
import { WAX_HYPERION, WAX_HYPERION_FALLBACKS } from './v2-chain.js';

export const SNAPSHOT_EVIDENCE_DOMAIN =
  'tag-run-v2:irreversible-balance-snapshot:v1';
export const SNAPSHOT_HISTORY_PROVIDERS = Object.freeze([
  WAX_HYPERION, WAX_HYPERION_FALLBACKS[1]
]);

const HEX = /^[0-9a-f]{64}$/;
const fail = reason => { throw new Error('v2_funding_control_' + reason); };

async function jsonResponse(response, label) {
  if (!response || response.ok !== true) fail(label + '_unavailable');
  let body;
  try { body = await response.json(); }
  catch (_) { fail(label + '_malformed'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail(label + '_malformed');
  }
  return body;
}

async function chainPost(fetchImpl, host, method, body) {
  let response;
  try {
    response = await fetchImpl(host + '/v1/chain/' + method, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (_) { fail('chain_' + method + '_unavailable'); }
  return jsonResponse(response, 'chain_' + method);
}

function freshHeadTime(value, nowMs) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value.endsWith('Z') ? value : value + 'Z');
  return Number.isFinite(parsed) && Math.abs(nowMs - parsed) <= 30000;
}

async function authorityInfo(fetchImpl, host, nowMs) {
  const info = await chainPost(fetchImpl, host, 'get_info', {});
  if (info.chain_id !== WAX_MAINNET_CHAIN_ID ||
      !Number.isSafeInteger(info.head_block_num) || info.head_block_num < 1 ||
      !Number.isSafeInteger(info.last_irreversible_block_num) ||
      info.last_irreversible_block_num < 1 ||
      info.last_irreversible_block_num > info.head_block_num ||
      !freshHeadTime(info.head_block_time, nowMs)) {
    fail('chain_info_invalid');
  }
  return info;
}

async function agreedBlock(fetchImpl, block, cache) {
  if (!Number.isSafeInteger(block) || block < 1) fail('block_invalid');
  if (cache.has(block)) return cache.get(block);
  const ids = await Promise.all(WAX_AUTHORITY_PROVIDERS.map(async host => {
    const row = await chainPost(fetchImpl, host, 'get_block', {
      block_num_or_id: block
    });
    const id = String(row?.id || '').toLowerCase();
    if (row?.block_num !== block || !HEX.test(id) ||
        parseInt(id.slice(0, 8), 16) !== block) fail('block_invalid');
    return id;
  }));
  if (ids[0] !== ids[1]) fail('block_provider_mismatch');
  cache.set(block, ids[0]);
  return ids[0];
}

// eosio.token-style accounts tables use symbol_code::raw() as their primary
// key. Hyperion stores that uint64 key as a base-10 string.
export function waxSymbolCodeRaw(symbol) {
  if (!/^[A-Z]{1,7}$/.test(String(symbol || ''))) fail('symbol_invalid');
  let value = 0n;
  for (let i = 0; i < symbol.length; i++) {
    value |= BigInt(symbol.charCodeAt(i)) << (8n * BigInt(i));
  }
  return value.toString();
}

function totalValue(total) {
  if (Number.isSafeInteger(total)) return total;
  if (Number.isSafeInteger(total?.value)) return total.value;
  return null;
}

function normalizeHistoricalDelta(body, asset, cutoff) {
  if ((body.lib != null &&
        (!Number.isSafeInteger(body.lib) || body.lib < cutoff)) ||
      !Number.isSafeInteger(body.last_indexed_block) ||
      body.last_indexed_block < cutoff || !Array.isArray(body.deltas) ||
      body.deltas.length > 2 || totalValue(body.total) === null) {
    fail('history_incomplete');
  }
  if (body.deltas.length === 0) {
    if (totalValue(body.total) !== 0) fail('history_incomplete');
    return { balanceUnits: '0', stateBlock: 0,
      stateBlockId: '0'.repeat(64), present: 0 };
  }
  const rows = body.deltas;
  if (rows.length === 2 && rows[0]?.block_num < rows[1]?.block_num) {
    fail('history_unsorted');
  }
  const row = rows[0];
  const id = String(row?.block_id || '').toLowerCase();
  const expectedPrimary = waxSymbolCodeRaw(asset.token_symbol);
  if (!row || row.code !== asset.token_contract || row.scope !== TIP_ACCOUNT ||
      row.table !== 'accounts' || String(row.primary_key) !== expectedPrimary ||
      !Number.isSafeInteger(row.block_num) || row.block_num < 1 ||
      row.block_num > cutoff || !HEX.test(id) ||
      ![0, 1].includes(row.present)) fail('history_row_invalid');
  let balanceUnits = '0';
  if (row.present === 1) {
    try {
      balanceUnits = parseQuantity(row.data?.balance,
        asset.token_precision, asset.token_symbol);
    } catch (_) { fail('history_balance_invalid'); }
  }
  return { balanceUnits, stateBlock: row.block_num,
    stateBlockId: id, present: row.present };
}

async function historicalBalance(fetchImpl, host, asset, cutoff) {
  const query = new URLSearchParams({
    code: asset.token_contract, scope: TIP_ACCOUNT, table: 'accounts',
    primary_key: waxSymbolCodeRaw(asset.token_symbol), before: String(cutoff),
    sort: 'desc', limit: '2'
  });
  let response;
  try {
    response = await fetchImpl(host + '/v2/history/get_deltas?' + query, {
      method: 'GET'
    });
  } catch (_) { fail('history_unavailable'); }
  const body = await jsonResponse(response, 'history');
  return normalizeHistoricalDelta(body, asset, cutoff);
}

function sameEvidence(left, right) {
  return left.balanceUnits === right.balanceUnits &&
    left.stateBlock === right.stateBlock &&
    left.stateBlockId === right.stateBlockId &&
    left.present === right.present;
}

export async function readIrreversibleTokenBalances({
  assets, fetchImpl = fetch, nowMs = Date.now()
} = {}) {
  if (!Array.isArray(assets) || assets.length < 1 || assets.length > 100) {
    fail('asset_limit');
  }
  const seen = new Set();
  const normalized = assets.map(row => {
    const key = assetKey(row?.token_contract, row?.token_symbol,
      row?.token_precision);
    if (row.asset_key !== key || seen.has(key)) fail('asset_invalid');
    seen.add(key);
    return row;
  }).sort((a, b) => a.asset_key.localeCompare(b.asset_key));
  const infos = await Promise.all(WAX_AUTHORITY_PROVIDERS.map(host =>
    authorityInfo(fetchImpl, host, nowMs)));
  const cutoff = Math.min(...infos.map(row => row.last_irreversible_block_num));
  const blockCache = new Map();
  const cutoffBlockId = await agreedBlock(fetchImpl, cutoff, blockCache);
  const observed = await Promise.all(normalized.map(async asset => {
    const proofs = await Promise.all(SNAPSHOT_HISTORY_PROVIDERS.map(host =>
      historicalBalance(fetchImpl, host, asset, cutoff)));
    if (!sameEvidence(proofs[0], proofs[1])) fail('history_provider_mismatch');
    return { asset, proof: proofs[0] };
  }));
  const stateBlockIds = new Map();
  await Promise.all([...new Set(observed.map(row => row.proof.stateBlock)
    .filter(block => block > 0))].map(async block => {
    stateBlockIds.set(block, await agreedBlock(fetchImpl, block, blockCache));
  }));
  const balances = observed.map(({ asset, proof }) => {
    if (proof.stateBlock > 0 &&
        stateBlockIds.get(proof.stateBlock) !== proof.stateBlockId) {
      fail('history_block_mismatch');
    }
    return Object.freeze({
      assetKey: asset.asset_key,
      balanceUnits: proof.balanceUnits,
      stateBlock: proof.stateBlock,
      stateBlockId: proof.stateBlockId,
      present: proof.present
    });
  });
  return Object.freeze({
    chainId: WAX_MAINNET_CHAIN_ID, account: TIP_ACCOUNT,
    cutoffBlock: cutoff, cutoffBlockId,
    providers: SNAPSHOT_HISTORY_PROVIDERS,
    balances: Object.freeze(balances)
  });
}

export async function irreversibleSnapshotDigest({
  chatId, day, asset, evidence, confirmedSpentUnits,
  allocatedUnpaidUnits, excludedUnits, spendableUnits, dailyRewardUnits,
  cryptoImpl = globalThis.crypto
}) {
  return sha256Text(JSON.stringify([
    SNAPSHOT_EVIDENCE_DOMAIN, WAX_MAINNET_CHAIN_ID, TIP_ACCOUNT, chatId, day,
    asset.asset_key, asset.token_contract, asset.token_symbol,
    asset.token_precision, evidence.cutoffBlock, evidence.cutoffBlockId,
    evidence.balanceUnits, evidence.stateBlock, evidence.stateBlockId,
    confirmedSpentUnits, allocatedUnpaidUnits, excludedUnits, spendableUnits,
    DAILY_BPS, dailyRewardUnits, ...SNAPSHOT_HISTORY_PROVIDERS
  ]), cryptoImpl);
}
