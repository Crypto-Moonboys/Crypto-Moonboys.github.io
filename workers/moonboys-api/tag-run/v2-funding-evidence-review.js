// TAG RUN V2 PR3: independent, READ-ONLY corroboration of quarantined WAX
// receipt evidence. This is not a proof of donation consent, chain action
// Merkle inclusion, treasury private-key control, or a historical balance.
// Never use the output as a funded/approved snapshot or a spending instruction.
import {
  TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, assetKey, parseQuantity,
  parseIntegerUnits, sha256Text
} from './v2-core.js';
import { isValidWaxAccount } from './core.js';
import {
  WAX_CHAIN_API, WAX_HYPERION, WAX_HYPERION_FALLBACKS
} from './v2-chain.js';

export const FUNDING_EVIDENCE_MODE = 'quarantined_correlated_read_only';
export const FUNDING_TRANSFERS_ENABLED = false;
export const DEFAULT_CORROBORATORS = Object.freeze([
  WAX_HYPERION, WAX_HYPERION_FALLBACKS[0]
]);
const HEX = /^[a-f0-9]{64}$/;
const SEQUENCE = /^[1-9][0-9]{0,24}$/;
const QUANTITY = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,8}))? ([A-Z]{1,7})$/;
const MAX_RECEIPTS = 20;
const fail = code => { throw new Error('funding_proof_' + code); };

async function postJson(fetchImpl, method, body) {
  let response;
  try {
    response = await fetchImpl(WAX_CHAIN_API + '/v1/chain/' + method, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
  } catch (_) { fail(method + '_unavailable'); }
  if (!response || response.ok !== true) fail(method + '_unavailable');
  try { return await response.json(); }
  catch (_) { fail(method + '_malformed'); }
}
async function getJson(fetchImpl, url) {
  let response;
  try { response = await fetchImpl(url,{method:'GET'}); }
  catch (_) { fail('historical_provider_unavailable'); }
  if (!response || response.ok !== true) fail('historical_provider_unavailable');
  try { return await response.json(); }
  catch (_) { fail('historical_provider_malformed'); }
}
function tokenUnits(quantity, symbol, precision) {
  if (typeof quantity !== 'string') fail('quantity_malformed');
  const match = quantity.match(QUANTITY);
  if (!match || match[3] !== symbol ||
      (match[2] || '').length !== precision) fail('quantity_precision_mismatch');
  return parseQuantity(quantity,precision,symbol);
}
function normalizedSequence(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    fail('unsafe_history_sequence');
  if (typeof value !== 'string' && typeof value !== 'number')
    fail('unsafe_history_sequence');
  const result=String(value);
  if (!SEQUENCE.test(result)) fail('unsafe_history_sequence');
  return result;
}
function receiptIdentity(receipt) {
  if (!receipt || receipt.status !== 'quarantined' ||
      receipt.chainId !== WAX_MAINNET_CHAIN_ID ||
      typeof receipt.globalSequence !== 'string' ||
      !SEQUENCE.test(receipt.globalSequence) ||
      typeof receipt.transactionId !== 'string' ||
      !HEX.test(receipt.transactionId) ||
      !Number.isSafeInteger(receipt.blockNum) || receipt.blockNum <= 0 ||
      typeof receipt.blockId !== 'string' || !HEX.test(receipt.blockId) ||
      typeof receipt.sender !== 'string' || !isValidWaxAccount(receipt.sender) ||
      typeof receipt.recipient !== 'string' ||
      receipt.recipient !== TIP_ACCOUNT || receipt.sender === TIP_ACCOUNT ||
      typeof receipt.contract !== 'string' ||
      typeof receipt.symbol !== 'string' ||
      typeof receipt.assetKey !== 'string' ||
      typeof receipt.units !== 'string' ||
      typeof receipt.memoDigest !== 'string' || !HEX.test(receipt.memoDigest))
    fail('receipt_invalid');
  let expected;
  try { expected=assetKey(receipt.contract,receipt.symbol,receipt.precision); }
  catch (_) { fail('receipt_invalid'); }
  if (receipt.assetKey !== expected ||
      parseIntegerUnits(receipt.units) === 0n) fail('receipt_invalid');
  return receipt.globalSequence;
}
function assertCorroboratorHosts(hosts) {
  if (!Array.isArray(hosts) || hosts.length !== 2 ||
      hosts.some(x => typeof x !== 'string' ||
        ![WAX_HYPERION,...WAX_HYPERION_FALLBACKS].includes(x)) ||
      hosts[0] === hosts[1]) fail('corroborators_not_independent');
}
function actionMatches(action,receipt,blockId) {
  const transfer=action?.act;
  const data=transfer?.data;
  if (normalizedSequence(action?.global_sequence) !== receipt.globalSequence ||
      action?.block_num !== receipt.blockNum ||
      typeof action?.trx_id !== 'string' ||
      action.trx_id.toLowerCase() !== receipt.transactionId ||
      (action?.block_id != null &&
        (typeof action.block_id !== 'string' ||
         action.block_id.toLowerCase() !== blockId)) ||
      transfer?.account !== receipt.contract ||
      transfer?.name !== 'transfer' || !data ||
      data.from !== receipt.sender || data.to !== receipt.recipient ||
      typeof data.memo !== 'string') return false;
  const quantity=data.quantity;
  return tokenUnits(quantity,receipt.symbol,receipt.precision)===receipt.units;
}

// Only checks that an external indexer reports the action within a verified
// irreversible chain block; it is NOT a cryptographic Merkle inclusion proof.
async function corroborateReceipt(fetchImpl, host, receipt, blockId, cryptoImpl) {
  const params=new URLSearchParams({
    account:TIP_ACCOUNT,global_sequence:receipt.globalSequence,
    'act.name':'transfer',sort:'desc',limit:'2',checkLib:'true'
  });
  const history=await getJson(fetchImpl,host+'/v2/history/get_actions?'+params);
  if (!history || !Array.isArray(history.actions) ||
      history.actions.length !== 1) fail('history_action_missing_or_ambiguous');
  const action=history.actions[0];
  if (!actionMatches(action,receipt,blockId)) fail('history_action_mismatch');
  if (await sha256Text(action.act.data.memo,cryptoImpl) !== receipt.memoDigest)
    fail('history_memo_mismatch');
}
function assertTokenStats(stats,receipt) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats) ||
      !stats[receipt.symbol] || typeof stats[receipt.symbol] !== 'object') {
    fail('token_stats_missing');
  }
  const token=stats[receipt.symbol];
  // The current token supply and max supply both carry the same immutable
  // symbol precision. This is not a proof that a token is approved as a prize.
  tokenUnits(token.supply,receipt.symbol,receipt.precision);
  tokenUnits(token.max_supply,receipt.symbol,receipt.precision);
}
function currentBalance(response,receipt) {
  if (!Array.isArray(response) || response.length > 1)
    fail('current_balance_malformed');
  if (response.length===0) return '0';
  return tokenUnits(response[0],receipt.symbol,receipt.precision);
}

export async function inspectWaxFundingEvidence({
  receipts, fetchImpl = fetch, cryptoImpl = globalThis.crypto,
  corroborators = DEFAULT_CORROBORATORS
} = {}) {
  if (!Array.isArray(receipts) || receipts.length < 1 ||
      receipts.length > MAX_RECEIPTS) fail('receipt_limit');
  assertCorroboratorHosts(corroborators);
  const seen=new Set();
  for(const receipt of receipts) {
    const seq=receiptIdentity(receipt);
    if (seen.has(seq)) fail('duplicate_chain_action');
    seen.add(seq);
  }
  const info=await postJson(fetchImpl,'get_info',{});
  if (!info || info.chain_id !== WAX_MAINNET_CHAIN_ID ||
      !Number.isSafeInteger(info.last_irreversible_block_num) ||
      info.last_irreversible_block_num <= 0) fail('wrong_chain_or_missing_lib');
  const account=await postJson(fetchImpl,'get_account',{
    account_name:TIP_ACCOUNT
  });
  if (!account || account.account_name !== TIP_ACCOUNT)
    fail('treasury_account_missing');
  const blocks=new Map(),tokens=new Map();
  const observations=[];
  // Sort immutable evidence for reproducible report digests and to ensure
  // input order cannot alter the audit result.
  const ordered=[...receipts].sort((a,b) =>
    BigInt(a.globalSequence)<BigInt(b.globalSequence) ? -1 :
    BigInt(a.globalSequence)>BigInt(b.globalSequence) ? 1 : 0);
  for(const receipt of ordered) {
    if (receipt.blockNum > info.last_irreversible_block_num)
      fail('receipt_not_irreversible');
    if (!blocks.has(receipt.blockNum)) {
      const block=await postJson(fetchImpl,'get_block',{
        block_num_or_id:receipt.blockNum
      });
      if (!block || block.block_num !== receipt.blockNum ||
          typeof block.id !== 'string' || !HEX.test(block.id.toLowerCase()))
        fail('chain_block_malformed');
      blocks.set(receipt.blockNum,block.id.toLowerCase());
    }
    const blockId=blocks.get(receipt.blockNum);
    if (blockId !== receipt.blockId) fail('receipt_block_mismatch');
    if (receipt.blockNum===info.last_irreversible_block_num &&
        typeof info.last_irreversible_block_id === 'string' &&
        info.last_irreversible_block_id.toLowerCase() !== blockId)
      fail('chain_lib_id_mismatch');

    for(const host of corroborators)
      await corroborateReceipt(fetchImpl,host,receipt,blockId,cryptoImpl);

    if (!tokens.has(receipt.assetKey)) {
      const stats=await postJson(fetchImpl,'get_currency_stats',{
        code:receipt.contract,symbol:receipt.symbol
      });
      assertTokenStats(stats,receipt);
      const balance=await postJson(fetchImpl,'get_currency_balance',{
        code:receipt.contract,account:TIP_ACCOUNT,symbol:receipt.symbol
      });
      tokens.set(receipt.assetKey,Object.freeze({
        assetKey:receipt.assetKey,contract:receipt.contract,
        symbol:receipt.symbol,precision:receipt.precision,
        currentHeadBalanceUnits:currentBalance(balance,receipt),
        // Standard chain RPC does not return the token balance AT the LIB
        // used above. Never treat current head balance as a cutoff snapshot.
        historicalBalanceFinalized:false,eligibleDonationUnits:'0',
        custodyControlVerified:false,assetApproved:false
      }));
    }
    const digest=await sha256Text([
      receipt.chainId,receipt.globalSequence,receipt.transactionId,
      receipt.blockNum,blockId,receipt.assetKey,receipt.units,
      receipt.memoDigest
    ].join('|'),cryptoImpl);
    observations.push(Object.freeze({
      proofDigest:digest,globalSequence:receipt.globalSequence,
      transactionId:receipt.transactionId,
      blockNum:receipt.blockNum,blockId,
      sender:receipt.sender,recipient:receipt.recipient,
      assetKey:receipt.assetKey,units:receipt.units,
      memoDigest:receipt.memoDigest,
      corroborators:2,blockReferenceIrreversible:true,
      status:FUNDING_EVIDENCE_MODE,donationApproved:false,
      merkleInclusionProven:false,spendable:false
    }));
  }
  const observedBalances=Object.freeze([...tokens.values()].sort((a,b)=>
    a.assetKey.localeCompare(b.assetKey)));
  return Object.freeze({
    status:FUNDING_EVIDENCE_MODE,account:TIP_ACCOUNT,
    chainId:WAX_MAINNET_CHAIN_ID,
    rpcLastIrreversibleBlock:info.last_irreversible_block_num,
    observations:Object.freeze(observations),observedBalances,
    chainReferenceChecked:true,
    // Two agreeing history providers do not establish donation consent, an
    // immutable historical balance, account custody control, or a chain proof.
    provenanceCrossChecked:true,donationConsentVerified:false,
    treasuryCustodyVerified:false,historicalSnapshotFinalized:false,
    fundingApproved:false,signerAvailable:false,transferAttempted:false
  });
}