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
const diagnostic = (host, stage, code) => Object.freeze({
  provider: WAX_AUTHORITY_PROVIDERS.includes(host) ? host : 'unknown',
  stage: RPC_METHODS.includes(stage) ? stage : 'validation',
  code: /^[a-z0-9_]{1,90}$/.test(code) ? code : 'unexpected_validation_error'
});
const knownError = error => {
  const message = error instanceof Error ? error.message : '';
  return /^wax_auth_[a-z0-9_]{1,90}$/.test(message)
    ? message.slice('wax_auth_'.length) : 'unexpected_validation_error';
};
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
// Every controlling authority is compared between independent providers.
// Normalize authority arrays as sets (order is not security-relevant), but
// never discard a key, delegated permission, wait, threshold or action link.
function normalizedPermission(entry) {
  const auth = entry?.required_auth;
  if (!entry || typeof entry.perm_name !== 'string' ||
      typeof entry.parent !== 'string' || !auth ||
      !Number.isSafeInteger(auth.threshold) || auth.threshold < 1 ||
      !Array.isArray(auth.keys) || !Array.isArray(auth.accounts) ||
      !Array.isArray(auth.waits) || !Array.isArray(entry.linked_actions))
    fail('permission_data_incomplete');
  const sort = array => array.sort((a,b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const keys = sort(auth.keys.map(k => {
    if (typeof k?.key !== 'string' || !k.key ||
        !Number.isSafeInteger(k.weight) || k.weight < 1)
      fail('permission_key_invalid');
    return [k.key,k.weight];
  }));
  const accounts = sort(auth.accounts.map(a => {
    if (typeof a?.permission?.actor !== 'string' ||
        typeof a?.permission?.permission !== 'string' ||
        !a.permission.actor || !a.permission.permission ||
        !Number.isSafeInteger(a.weight) || a.weight < 1)
      fail('permission_delegate_invalid');
    return [a.permission.actor,a.permission.permission,a.weight];
  }));
  const waits = sort(auth.waits.map(w => {
    if (!Number.isSafeInteger(w?.wait_sec) || w.wait_sec < 0 ||
        !Number.isSafeInteger(w?.weight) || w.weight < 1)
      fail('permission_wait_invalid');
    return [w.wait_sec,w.weight];
  }));
  const links = sort(entry.linked_actions.map(link => {
    if (typeof link?.account !== 'string' || !link.account ||
        typeof link?.action !== 'string' || !link.action)
      fail('permission_link_invalid');
    return [link.account,link.action];
  }));
  return {parent:entry.parent,threshold:auth.threshold,
    keys,accounts,waits,links};
}
function normalizedAccount(row, contract) {
  if (row?.account_name !== TIP_ACCOUNT || !Array.isArray(row.permissions))
    fail('account_unavailable_or_invalid');
  const named = name => row.permissions.filter(p => p?.perm_name === name);
  const ownerRows = named('owner'),activeRows = named('active'),
    tagrainRows = named('tagrain');
  if (ownerRows.length !== 1 || activeRows.length !== 1 ||
      tagrainRows.length !== 1) fail('required_permission_missing');
  const owner = normalizedPermission(ownerRows[0]);
  const active = normalizedPermission(activeRows[0]);
  const tagrain = normalizedPermission(tagrainRows[0]);
  const {keys,accounts,waits,links} = tagrain;
  return {
    parent: tagrain.parent,threshold:tagrain.threshold,
    keys,accounts:accounts.length,waits:waits.length,links,
    // Keep complete controlling authority state, not only the names.
    // Otherwise two disagreeing account controllers can look identical.
    ownerAuthority:owner,activeAuthority:active,
    parentHierarchyValid:owner.parent === '' && active.parent === 'owner',
    exactOneKey:tagrain.threshold === 1 && keys.length === 1 &&
      keys[0][0] === KNOWN_TAGRAIN_KEY && keys[0][1] === 1 &&
      accounts.length === 0 && waits.length === 0,
    transferLinked:links.length === 1 && links[0][0] === contract &&
      links[0][1] === 'transfer',
    noUnexpectedLinks:links.length <= 1 &&
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
  } catch { fail('rpc_transport_failure'); }
  if (response?.ok !== true) fail('rpc_http_failure');
  try { return await response.json(); }
  catch { fail('rpc_invalid_json'); }
}
async function observedStep(host, stage, work) {
  try { return await work(); }
  catch(error) {
    // Only bounded, predefined labels are exposed. Never forward RPC error
    // bodies, URLs with credentials, arbitrary messages, keys or payloads.
    const wrapped = new Error('wax_auth_observation_failed');
    wrapped.diagnostic = error?.diagnostic ??
      diagnostic(host,stage,knownError(error));
    throw wrapped;
  }
}
async function observeProvider(fetchImpl, host, contract, symbol, precision) {
  // Only public read endpoints. No get_required_keys, no transaction methods.
  const info = await observedStep(host,'get_info',async () => {
    const result = await rpc(fetchImpl,host,'get_info',{});
    if (result?.chain_id !== WAX_MAINNET_CHAIN_ID ||
        !isInt(result.last_irreversible_block_num)) fail('wrong_chain_or_lib');
    return result;
  });
  const tasks = [
    ['get_account',{account_name:TIP_ACCOUNT}],
    ['get_abi',{account_name:contract}],
    ['get_code_hash',{account_name:contract}],
    ['get_currency_stats',{code:contract,symbol}],
    ['get_currency_balance',{code:contract,account:TIP_ACCOUNT,symbol}]
  ];
  // Sequential stage-specific checks make failure reporting deterministic.
  // Each call remains read-only and the provider host is fixed.
  const responses = [];
  for (const [method,data] of tasks) {
    responses.push(await observedStep(host,method,async () =>
      rpc(fetchImpl,host,method,data)));
  }
  const [account,abi,code,stats,balances] = responses;
  const {codeHash,supplyUnits,maxUnits,balanceUnits} =
    await observedStep(host,'validation',async () => {
      const codeHash = await observedStep(host,'get_code_hash',async () => {
        if (!code || (code.account_name && code.account_name !== contract) ||
            !CODE_HASH.test(code.code_hash || '') || /^0+$/.test(code.code_hash))
          fail('contract_code_hash_invalid');
        return code.code_hash;
      });
      const [supplyUnits,maxUnits] =
        await observedStep(host,'get_currency_stats',async () => {
          if (!stats || typeof stats !== 'object' || Array.isArray(stats) ||
              !stats[symbol] || !isValidWaxAccount(stats[symbol].issuer))
            fail('token_stats_missing');
          const supply = validQuantity(stats[symbol].supply,symbol,precision);
          const max = validQuantity(stats[symbol].max_supply,symbol,precision);
          if (supply === null || max === null || BigInt(supply) > BigInt(max))
            fail('token_precision_mismatch');
          return [supply,max];
        });
      const balanceUnits =
        await observedStep(host,'get_currency_balance',async () => {
          if (!Array.isArray(balances) || balances.length > 1)
            fail('token_balance_unavailable');
          const amount = balances.length === 0 ? '0' :
            validQuantity(balances[0],symbol,precision);
          if (amount === null) fail('token_balance_precision_mismatch');
          return amount;
        });
      return {codeHash,supplyUnits,maxUnits,balanceUnits};
    });
  const accountState = await observedStep(host,'get_account',async () =>
    normalizedAccount(account,contract));
  const abiState = await observedStep(host,'get_abi',async () =>
    normalizedAbi(abi,contract));
  return {
    chainId: info.chain_id,
    lastIrreversibleBlock: info.last_irreversible_block_num,
    account: accountState,
    abi: abiState,
    codeHash,
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
  const observations = await Promise.allSettled(
    WAX_AUTHORITY_PROVIDERS.map(host =>
      observeProvider(fetchImpl,host,contract,symbol,precision)));
  const diagnostics = observations.flatMap((item,index) =>
    item.status === 'rejected' ? [
      item.reason?.diagnostic ??
      diagnostic(WAX_AUTHORITY_PROVIDERS[index],'validation',
        knownError(item.reason))
    ] : []);
  if (diagnostics.length) return Object.freeze({
    ...blocked('independent_wax_rpc_evidence_unavailable'),
    diagnostics
  });
  const evidence = observations.map(item => item.value);
  const [a,b] = evidence;
  const reasonCodes = [];
  if (!compare(a,b)) reasonCodes.push('independent_provider_state_disagreement');
  if (a.account.parent !== 'active' || b.account.parent !== 'active' ||
      !a.account.parentHierarchyValid || !b.account.parentHierarchyValid ||
      !a.account.exactOneKey || !b.account.exactOneKey)
    reasonCodes.push('tagrain_authority_mismatch');
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
