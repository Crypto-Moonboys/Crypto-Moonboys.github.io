// TAG RUN V2 — WAX authority & contract observations; STRICTLY READ ONLY.
// This is NOT a signer, approval to linkauth, custody certificate, WASM audit,
// historical LIB snapshot, or authority to execute any payout.
import {
  TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, assetKey, parseQuantity
} from './v2-core.js';
import { isValidWaxAccount } from './core.js';

export const WAX_AUTHORITY_READ_ONLY = true;
export const WAX_AUTHORITY_PROVIDERS = Object.freeze([
  'https://wax.greymass.com',
  'https://wax.eosphere.io'
]);
const RPC_METHODS = Object.freeze([
  'get_info', 'get_account', 'get_abi', 'get_code_hash',
  'get_currency_stats', 'get_currency_balance'
]);
const CODE_HASH = /^[0-9a-f]{64}$/;
const KNOWN_TAGRAIN_KEY =
  'EOS8i9TNBsg1LYGntvSDKfzVhK3dmXZgkNbRPJ89n9fMMLC8iunGk';
const fail = label => { throw new Error('wax_auth_' + label); };
const isInt = v => Number.isSafeInteger(v) && v > 0;
const allowed = (host, method) => WAX_AUTHORITY_PROVIDERS.includes(host) &&
  RPC_METHODS.includes(method);
function validQuantity(qty, symbol, precision) {
  if (typeof qty !== 'string' || !Number.isInteger(precision) ||
      precision < 0 || precision > 8) return null;
  const match = qty.match(/^(0|[1-9][0-9]*)(?:\.([0-9]{1,8}))? ([A-Z]{1,7})$/);
  if (!match || match[3] !== symbol ||
      (match[2] || '').length !== precision) return null;
  try { return parseQuantity(qty, precision, symbol); }
  catch { return null; }
}
function normalizedAccount(row, contract) {
  if (row?.account_name !== TIP_ACCOUNT || !Array.isArray(row.permissions))
    fail('account_unavailable_or_invalid');
  const owner = row.permissions.find(p => p.perm_name === 'owner');
  const active = row.permissions.find(p => p.perm_name === 'active');
  const tagrain = row.permissions.find(p => p.perm_name === 'tagrain');
  if (!owner || !active || !tagrain) fail('required_permission_missing');
  const auth = tagrain.required_auth;
  if (!auth || !Array.isArray(auth.keys) ||
      !Array.isArray(auth.accounts) || !Array.isArray(auth.waits) ||
      !Array.isArray(tagrain.linked_actions)) fail('permission_data_incomplete');
  const keys = auth.keys.map(k => [k.key,k.weight]);
  const links = tagrain.linked_actions.map(x => [x.account,x.action])
    .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    parent: tagrain.parent, threshold: auth.threshold, keys,
    accounts: auth.accounts.length, waits: auth.waits.length, links,
    hasOwner: owner.perm_name === 'owner',
    hasActive: active.perm_name === 'active',
    exactOneKey: auth.threshold === 1 && keys.length === 1 &&
      keys[0][0] === KNOWN_TAGRAIN_KEY && keys[0][1] === 1 &&
      auth.accounts.length === 0 && auth.waits.length === 0,
    transferLinked: links.length === 1 && links[0][0] === contract &&
      links[0][1] === 'transfer',
    noUnexpectedLinks: links.length <= 1 &&
      links.every(([a,b])=>a===contract && b==='transfer')
  };
}
function normalizedAbi(row, contract) {
  if (row?.account_name !== contract || !row.abi ||
      !Array.isArray(row.abi.actions) || !Array.isArray(row.abi.structs))
    fail('contract_abi_unavailable');
  const matches = row.abi.actions.filter(a => a.name === 'transfer');
  if (matches.length !== 1 || typeof matches[0].type !== 'string')
    fail('contract_transfer_abi_missing');
  const types = row.abi.structs.filter(s => s.name === matches[0].type);
  if (types.length !== 1 || !Array.isArray(types[0].fields) ||
      (types[0].base && types[0].base !== ''))
    fail('nonstandard_transfer_abi');
  const fields = types[0].fields.map(f=>[f.name,f.type]);
  const expected = [['from','name'],['to','name'],
    ['quantity','asset'],['memo','string']];
  return { standardTransfer: JSON.stringify(fields) === JSON.stringify(expected),
    fields };
}
async function rpc(fetchImpl, host, method, data) {
  if (!allowed(host,method)) fail('rpc_method_or_host_not_permitted');
  let response;
  try {
    response = await fetchImpl(host + '/v1/chain/' + method, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
  } catch { fail(method + '_unavailable'); }
  if (response?.ok !== true) fail(method + '_unavailable');
  try { return await response.json(); }
  catch { fail(method + '_invalid_json'); }
}
async function observeProvider(fetchImpl, host, contract, symbol, precision) {
  // Only public read endpoints. No get_required_keys, no transaction methods.
  const info = await rpc(fetchImpl,host,'get_info',{});
  if (info?.chain_id !== WAX_MAINNET_CHAIN_ID ||
      !isInt(info.last_irreversible_block_num)) fail('wrong_chain_or_lib');
  const [account,abi,code,stats,balances] = await Promise.all([
    rpc(fetchImpl,host,'get_account',{account_name:TIP_ACCOUNT}),
    rpc(fetchImpl,host,'get_abi',{account_name:contract}),
    rpc(fetchImpl,host,'get_code_hash',{account_name:contract}),
    rpc(fetchImpl,host,'get_currency_stats',{code:contract,symbol}),
    rpc(fetchImpl,host,'get_currency_balance',{
      code:contract,account:TIP_ACCOUNT,symbol
    })
  ]);
  if (!code || (code.account_name && code.account_name !== contract) ||
      !CODE_HASH.test(code.code_hash || '') ||
      /^0+$/.test(code.code_hash)) fail('contract_code_hash_invalid');
  if (!stats || typeof stats !== 'object' || Array.isArray(stats) ||
      !stats[symbol] || !isValidWaxAccount(stats[symbol].issuer))
    fail('token_stats_missing');
  const supplyUnits = validQuantity(stats[symbol].supply,symbol,precision);
  const maxUnits = validQuantity(stats[symbol].max_supply,symbol,precision);
  if (supplyUnits === null || maxUnits === null ||
      BigInt(supplyUnits) > BigInt(maxUnits)) fail('token_precision_mismatch');
  if (!Array.isArray(balances) || balances.length > 1)
    fail('token_balance_unavailable');
  const balanceUnits = balances.length === 0 ? '0' :
    validQuantity(balances[0],symbol,precision);
  if (balanceUnits === null) fail('token_balance_precision_mismatch');
  return {
    chainId: info.chain_id,
    lastIrreversibleBlock: info.last_irreversible_block_num,
    account: normalizedAccount(account,contract),
    abi: normalizedAbi(abi,contract),
    codeHash: code.code_hash,
    token: {symbol,precision,issuer:stats[symbol].issuer,
      supplyUnits,maxUnits,balanceUnits}
  };
}
function compare(a,b) {
  // The two APIs can have different LIB numbers. An identical account,
  // code/ABI and current balance observation is required; disagreement
  // blocks rather than choosing whichever answer looks safer.
  for (const field of ['account','abi','codeHash','token']) {
    if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) return false;
  }
  return a.chainId === b.chainId;
}
function blocked(reason) {
  return Object.freeze({
    mode:'READ_ONLY_ONCHAIN_AUTHORITY_CHECK',status:'BLOCKED',
    reasonCodes:[reason],releaseAuthorized:false,signerConfigured:false,
    transferAttempted:false,transactionBroadcast:false,
    independentSourceAttestation:false,wasmAuthorizationAudited:false,
    historicalFinalityProven:false
  });
}
export async function reviewWaxTransferAuthority({
  contract,symbol,precision,expectedCodeHash=null,fetchImpl=fetch
}={}) {
  // An unpinned hash is an observation, not an accepted code audit.
  const key = assetKey(contract,symbol,precision);
  if (expectedCodeHash !== null &&
      (!CODE_HASH.test(expectedCodeHash) || /^0+$/.test(expectedCodeHash)))
    fail('invalid_expected_code_hash');
  if (typeof fetchImpl !== 'function') fail('fetch_unavailable');
  let evidence;
  try {
    evidence = await Promise.all(WAX_AUTHORITY_PROVIDERS.map(host =>
      observeProvider(fetchImpl,host,contract,symbol,precision)));
  } catch {
    return blocked('independent_wax_rpc_evidence_unavailable');
  }
  const [a,b] = evidence;
  const reasonCodes = [];
  if (!compare(a,b)) reasonCodes.push('independent_provider_state_disagreement');
  if (a.account.parent !== 'active' || !a.account.exactOneKey ||
      !b.account.exactOneKey) reasonCodes.push('tagrain_authority_mismatch');
  if (!a.account.noUnexpectedLinks || !b.account.noUnexpectedLinks)
    reasonCodes.push('tagrain_has_unexpected_action_links');
  if (!a.account.transferLinked || !b.account.transferLinked)
    reasonCodes.push('tagrain_transfer_action_not_linked');
  if (!a.abi.standardTransfer || !b.abi.standardTransfer)
    reasonCodes.push('nonstandard_token_transfer_abi');
  if (a.token.balanceUnits === '0' || b.token.balanceUnits === '0')
    reasonCodes.push('treasury_token_balance_empty');
  if (!expectedCodeHash) reasonCodes.push('independent_wasm_hash_approval_missing');
  else if (a.codeHash !== expectedCodeHash || b.codeHash !== expectedCodeHash)
    reasonCodes.push('contract_wasm_hash_not_approved');
  // These are a mandatory *separate* approval stage even if all RPC
  // observations match; a code hash/ABI cannot prove require_auth(from),
  // symbol-specific restrictions, donation provenance or finality.
  return Object.freeze({
    mode:'READ_ONLY_ONCHAIN_AUTHORITY_CHECK',
    status:reasonCodes.length?'BLOCKED':'MANUAL_REVIEW_REQUIRED',
    reasonCodes,
    assetKey:key,account:TIP_ACCOUNT,contract,symbol,precision,
    sourceHosts:[...WAX_AUTHORITY_PROVIDERS],
    codeHashObserved:a.codeHash,
    signedKeyScope:'isthatajoint@tagrain',
    actionScopeObserved:a.account.links,
    tokenBalanceUnits:a.token.balanceUnits,
    lastIrreversibleBlocks:evidence.map(x=>x.lastIrreversibleBlock),
    sameHeadStateObservation:compare(a,b),
    sharedContractActionRisk:contract==='kingsofgraff',
    releaseAuthorized:false,signerConfigured:false,
    transferAttempted:false,transactionBroadcast:false,
    independentSourceAttestation:false,wasmAuthorizationAudited:false,
    historicalFinalityProven:false,
    needsSeparateContractBytecodeReview:true,
    needsExplicitOwnerApprovalBeforeTransfers:true
  });
}
