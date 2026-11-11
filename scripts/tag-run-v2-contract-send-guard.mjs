// Privileged local signer guard. This module cannot sign, write D1 or broadcast.
// Approval entries are a reviewed operator trust root, NEVER inferred from RPC.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assetKey, parseIntegerUnits, parseQuantity, TIP_ACCOUNT,
  WAX_MAINNET_CHAIN_ID } from '../workers/moonboys-api/tag-run/v2-core.js';
import { WAX_AUTHORITY_PROVIDERS, normalizeWaxPermission } from '../workers/moonboys-api/tag-run/v2-wax-authority-review.js';

const HEX = /^[a-f0-9]{64}$/;
const KEY = 'EOS8i9TNBsg1LYGntvSDKfzVhK3dmXZgkNbRPJ89n9fMMLC8iunGk';
const POLICY = new URL('./config/tag-run-v2-contract-approvals.json', import.meta.url);
const fail = reason => { throw Error('tag_run_contract_' + reason); };
const digest = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, function(_key, item) {
  if (item && typeof item === 'object' && !Array.isArray(item))
    return Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]]));
  return item;
});
const hash = value => typeof value === 'string' && HEX.test(value) && !/^0+$/.test(value);
const text = value => typeof value === 'string' && value.trim() === value &&
  value.length >= 3 && value.length <= 256;
const units = value => {
  try { return parseIntegerUnits(value); } catch { fail('invalid_debit_units'); }
};
export async function loadApprovedContractPolicy() {
  try {
    const data = await readFile(POLICY, 'utf8');
    if (Buffer.byteLength(data) > 65536) fail('policy_unavailable');
    return JSON.parse(data);
  } catch { fail('policy_unavailable'); }
}
export function describeGuardedTransfer(request) {
  const act = request?.action;
  const match = typeof act?.data?.quantity === 'string' &&
    act.data.quantity.match(/^(0|[1-9][0-9]*)(?:\.([0-9]{1,8}))? ([A-Z]{1,7})$/);
  if (!match || request.chainId !== WAX_MAINNET_CHAIN_ID || request.from !== TIP_ACCOUNT ||
      act.account !== request.contract || act.name !== 'transfer' ||
      act.data.from !== TIP_ACCOUNT || act.data.to !== request.destination ||
      !Array.isArray(act.authorization) || act.authorization.length !== 1 ||
      act.authorization[0]?.actor !== TIP_ACCOUNT || act.authorization[0]?.permission !== 'tagrain')
    fail('invalid_request');
  const precision = (match[2] || '').length, symbol = match[3];
  let key, amount;
  try {
    key = assetKey(request.contract, symbol, precision);
    amount = parseQuantity(act.data.quantity, precision, symbol);
  } catch { fail('invalid_request'); }
  if (amount !== request.amountUnits || units(amount) <= 0n ||
      units(amount) > 4611686018427387903n) fail('invalid_request');
  return {assetKey:key,contract:request.contract,symbol,precision,amountUnits:amount};
}
export function requireApprovedContract(policy, request, nowMs = Date.now()) {
  const want = describeGuardedTransfer(request);
  if (!policy || policy.schemaVersion !== 1 || !Array.isArray(policy.approvals) ||
      policy.approvals.length > 100 || !Number.isFinite(nowMs)) fail('invalid_policy');
  const seen = new Set();
  for (const entry of policy.approvals) {
    const parts = typeof entry?.assetKey === 'string' ? entry.assetKey.split(':') : [];
    let validKey = false;
    try { validKey = parts.length === 4 && parts[0] === WAX_MAINNET_CHAIN_ID &&
      assetKey(parts[1],parts[2],Number(parts[3])) === entry.assetKey; } catch {}
    const expiry = Date.parse(entry?.validUntil);
    if (!validKey || seen.has(entry.assetKey) || !hash(entry.codeHash) || !hash(entry.abiHash) ||
        !text(entry.auditReviewer) || !text(entry.auditReference) ||
        !Number.isFinite(expiry) || new Date(expiry).toISOString() !== entry.validUntil ||
        !['kingsofgraff-config-v1','audited-static-zero-fee-v1'].includes(entry.adapter) ||
        (entry.adapter === 'kingsofgraff-config-v1'
          ? parts[1] !== 'kingsofgraff' || !['absent','zero-fee-tradeable'].includes(entry.configState)
          : parts[1] === 'kingsofgraff' || entry.configState !== 'none')) fail('invalid_policy');
    seen.add(entry.assetKey);
  }
  const entry = policy.approvals.find(row => row.assetKey === want.assetKey);
  if (!entry) fail('independent_approval_missing');
  if (Date.parse(entry.validUntil) <= nowMs) fail('approval_expired');
  return {want,entry,policyDigest:digest(canonical(policy)),
    allowedContracts:[...new Set(policy.approvals.filter(row=>Date.parse(row.validUntil)>nowMs)
      .map(row=>row.assetKey.split(':')[1]))]};
}
// Nonzero fees are unsupported. Therefore total debit MUST equal the intent's
// exact already-reserved amount; there is no unrecorded fee allowance.
export function assertPayoutDebitAuthority(authority, request) {
  const want = describeGuardedTransfer(request);
  if (!authority || authority.amount_units !== want.amountUnits ||
      authority.reward_policy_bps !== 100 || authority.cap_reward_policy_bps !== 100)
    fail('debit_authority_invalid');
  const amount = units(authority.amount_units), committed = units(authority.committed_units),
    daily = units(authority.daily_limit_units), per = units(authority.per_transfer_limit_units),
    onchain = units(authority.onchain_units), reserved = units(authority.allocated_unpaid_units),
    excluded = units(authority.excluded_units), spendable = units(authority.spendable_units),
    budget = units(authority.daily_reward_units);
  if (onchain > 4611686018427387903n || reserved + excluded > onchain ||
      spendable !== onchain - reserved - excluded ||
      budget !== spendable / 100n || daily !== budget || amount > per || per > daily ||
      amount > committed || committed > daily) fail('total_debit_exceeds_reservation_or_cap');
  let obligations;
  try { obligations=JSON.parse(authority.outstanding_bundle_units_json); }
  catch { fail('debit_authority_invalid'); }
  if (!Array.isArray(obligations) || !obligations.length || obligations.length > 20000)
    fail('debit_authority_invalid');
  const owed=obligations.reduce((sum,value)=>sum+units(value),0n);
  if (owed < amount) fail('debit_authority_invalid');
  const held=reserved+committed;
  return {totalDebitUnits:amount.toString(),feeUnits:'0',
    requiredBalanceUnits:(excluded+(owed>held?owed:held)).toString()};
}
async function rpc(fetchImpl, host, method, body) {
  // All callers below use fixed read endpoints. No supplied URL or push method.
  let reader;
  try {
    const response = await fetchImpl(host + '/v1/chain/' + method, {
      method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
    });
    if (!response?.ok || !response.body?.getReader) fail('rpc_unavailable');
    reader = response.body.getReader();
    const chunks = []; let count = 0;
    for (;;) {
      const {value,done} = await reader.read();
      if (done) break;
      count += value.length;
      if (count > 524288) { await reader.cancel(); fail('rpc_unavailable'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { fail('rpc_unavailable'); }
  finally { reader?.releaseLock(); }
}
function authorityState(account, contract, allowedContracts) {
  if (account?.account_name !== TIP_ACCOUNT || !Array.isArray(account.permissions))
    fail('permission_invalid');
  const rows = account.permissions.filter(row=>row?.perm_name === 'tagrain');
  if (rows.length !== 1) fail('permission_invalid');
  const p = rows[0], a = p.required_auth;
  if (p.parent !== 'active' || a?.threshold !== 1 || !Array.isArray(a.keys) ||
      a.keys.length !== 1 || a.keys[0].key !== KEY || a.keys[0].weight !== 1 ||
      !Array.isArray(a.accounts) || a.accounts.length || !Array.isArray(a.waits) || a.waits.length ||
      !Array.isArray(p.linked_actions) || p.linked_actions.length > 100)
    fail('permission_invalid');
  const links = p.linked_actions.map(link=>{
    if (!allowedContracts.includes(link?.account) || link.action !== 'transfer')
      fail('permission_scope_invalid');
    return link.account;
  }).sort();
  if (new Set(links).size !== links.length || !links.includes(contract))
    fail('permission_scope_invalid');
  const controlling = {};
  for (const name of ['owner','active']) {
    const matches = account.permissions.filter(row=>row?.perm_name === name);
    if (matches.length !== 1) fail('permission_invalid');
    try { controlling[name] = normalizeWaxPermission(matches[0]); }
    catch { fail('permission_invalid'); }
  }
  if (controlling.owner.parent !== '' || controlling.active.parent !== 'owner')
    fail('permission_invalid');
  return {key:KEY,links,controlling};
}
async function inspectProvider(fetchImpl, host, approval, debit) {
  const {want,entry,allowedContracts} = approval;
  const post = (method, body) => rpc(fetchImpl,host,method,body);
  const info = await post('get_info',{});
  if (info?.chain_id !== WAX_MAINNET_CHAIN_ID ||
      !Number.isSafeInteger(info.last_irreversible_block_num) || info.last_irreversible_block_num < 1)
    fail('wrong_chain');
  const permission = authorityState(await post('get_account',{account_name:TIP_ACCOUNT}),
    want.contract,allowedContracts);
  const firstCode = await post('get_code_hash',{account_name:want.contract});
  if (firstCode?.account_name !== want.contract || firstCode.code_hash !== entry.codeHash)
    fail('code_hash_changed');
  const abi = await post('get_raw_abi',{account_name:want.contract});
  if (abi?.account_name !== want.contract || abi.code_hash !== entry.codeHash ||
      abi.abi_hash !== entry.abiHash || typeof abi.abi !== 'string' || !abi.abi.length ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(abi.abi) ||
      digest(Buffer.from(abi.abi,'base64')) !== entry.abiHash) fail('abi_hash_changed');
  let config = 'none';
  if (entry.adapter === 'kingsofgraff-config-v1') {
    const symbolBytes = Buffer.alloc(8); symbolBytes.write(want.symbol,0,'ascii');
    const symbolCode = symbolBytes.readBigUInt64LE().toString();
    const rows = await post('get_table_rows',{
      json:false,code:want.contract,scope:want.contract,table:'configs',
      key_type:'i64',index_position:'1',lower_bound:symbolCode,upper_bound:symbolCode,
      limit:2,reverse:false,show_payer:false
    });
    if (!rows || !Array.isArray(rows.rows) || rows.rows.length > 1 || rows.more !== false ||
        (rows.next_key !== undefined && rows.next_key !== '')) fail('config_unavailable');
    if (!rows.rows.length) config = 'absent';
    else {
      const raw = rows.rows[0];
      if (typeof raw !== 'string' || !/^[0-9a-f]+$/i.test(raw) || raw.length % 2)
        fail('config_unavailable');
      const data = Buffer.from(raw,'hex');
      if (data.length < 10 || !data.subarray(0,8).equals(symbolBytes)) fail('config_unavailable');
      if (data[8] !== 1) fail('token_transfer_restricted');
      // Known reviewed ABI: symbol_code:uint64, is_tradeable:bool,
      // tx_fees:vector<TX_FEE>. Only a canonical EMPTY vector is supported.
      if (data.length !== 10 || data[9] !== 0) fail('unsupported_transfer_fees');
      config = 'zero-fee-tradeable';
    }
    if (config !== entry.configState) fail('configuration_changed');
  }
  const balances = await post('get_currency_balance',{
    code:want.contract,account:TIP_ACCOUNT,symbol:want.symbol
  });
  const match = Array.isArray(balances) && balances.length === 1 &&
    typeof balances[0] === 'string' && balances[0].match(/^(0|[1-9][0-9]*)(?:\.([0-9]{1,8}))? ([A-Z]{1,7})$/);
  if (!match || match[3] !== want.symbol || (match[2] || '').length !== want.precision)
    fail('balance_unavailable');
  const balance = units(parseQuantity(balances[0],want.precision,want.symbol));
  if (balance > 4611686018427387903n) fail('balance_unavailable');
  if (balance < units(debit.requiredBalanceUnits)) fail('treasury_reservation_deficit');
  // Bracket the observation; a code change during these reads also blocks.
  const lastCode = await post('get_code_hash',{account_name:want.contract});
  if (lastCode?.account_name !== want.contract || lastCode.code_hash !== entry.codeHash)
    fail('code_hash_changed');
  return {codeHash:entry.codeHash,abiHash:entry.abiHash,config,permission,
    balanceUnits:balance.toString()};
}
export async function inspectApprovedPayoutContract({request,policy,debitAuthority,
  fetchImpl = fetch,nowMs = Date.now()} = {}) {
  const approval = requireApprovedContract(policy,request,nowMs);
  const debit = assertPayoutDebitAuthority(debitAuthority,request);
  const settled = await Promise.allSettled(WAX_AUTHORITY_PROVIDERS.map(host=>
    inspectProvider(fetchImpl,host,approval,debit)));
  const failed = settled.find(row=>row.status === 'rejected');
  if (failed) throw failed.reason;
  const [first,second] = settled.map(row=>row.value);
  if (canonical(first) !== canonical(second)) fail('provider_disagreement');
  // No balance is pinned across the wallet prompt: deposits may arrive.
  // Code, ABI, config, links and approval policy must remain identical.
  const {balanceUnits:_balance, ...securityState} = first;
  return Object.freeze({...debit,policyDigest:approval.policyDigest,
    stateDigest:digest(canonical(securityState)),observedBalanceUnits:first.balanceUnits});
}
export function assertUnchangedPayoutContract(before, after) {
  if (!before || !after || before.policyDigest !== after.policyDigest ||
      before.stateDigest !== after.stateDigest || before.totalDebitUnits !== after.totalDebitUnits ||
      before.feeUnits !== '0' || after.feeUnits !== '0') fail('configuration_changed');
}
