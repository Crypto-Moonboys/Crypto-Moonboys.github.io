// TAG RUN V2: public, read-only WAX account inventory discovery.
// Hyperion discovers token identities; authoritative WAX chain RPC validates
// chain/account/each individual token amount. Neither source is an attestation
// of donation provenance, finality at a snapshot, or spending authority.
// This module MUST NOT contain signing, transfer, private keys or send actions.

import { TIP_ACCOUNT, assetKey, parseQuantity, WAX_MAINNET_CHAIN_ID } from './v2-core.js';
export const WAX_CHAIN_API = 'https://wax.greymass.com';
// Hyperion's public hosts are independent and may be unavailable separately.
// Fail over only for transport / non-2xx failures; never accept malformed or
// partial inventory as empty. Every retry starts from skip=0 on one host.
export const WAX_HYPERION = 'https://wax.eosrio.io';
export const WAX_HYPERION_FALLBACKS = Object.freeze([
  'https://wax.eosusa.io',
  'https://wax.eosphere.io'
]);
const MAX_DISCOVERED = 100;
const TOKEN_PAGE_SIZE = 50;

async function readJson(response, name) {
  if (!response || response.ok !== true) throw new Error(name + '_unavailable');
  const body = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(name + '_malformed');
  }
  return body;
}
async function postChain(path, data, fetchImpl) {
  return readJson(await fetchImpl(WAX_CHAIN_API + '/v1/chain/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }), 'wax_' + path);
}
export async function readWaxTipAccount({ fetchImpl = fetch, account = TIP_ACCOUNT } = {}) {
  if (account !== TIP_ACCOUNT) throw new Error('unexpected_tip_account');
  const chain = await postChain('get_info', {}, fetchImpl);
  if (chain.chain_id !== WAX_MAINNET_CHAIN_ID ||
      !Number.isSafeInteger(chain.last_irreversible_block_num) ||
      chain.last_irreversible_block_num <= 0) {
    throw new Error('wax_wrong_chain_or_missing_finality');
  }
  const result = await postChain('get_account', { account_name: account }, fetchImpl);
  if (result.account_name !== account) throw new Error('wax_tip_account_missing');
  return {
    account,
    chainId: chain.chain_id,
    latestIrreversibleBlock: chain.last_irreversible_block_num,
    // Account existence does not prove project custody or donation authority.
    verifiedCustody: false
  };
}
export async function discoverWaxTipTokens({ fetchImpl = fetch,
  account = TIP_ACCOUNT, approvedAssets = [], observeAll = false } = {}) {
  const accountProof = await readWaxTipAccount({ fetchImpl, account });
  if (!Array.isArray(approvedAssets) || approvedAssets.length > MAX_DISCOVERED) {
    throw new Error('asset_allowlist_invalid');
  }
  const approved = new Set(approvedAssets);
  // Do not mix pages from different indexers. If a provider is unreachable or
  // returns a non-2xx response at ANY page, discard that attempt and restart
  // the entire inventory on the next documented WAX mainnet Hyperion host.
  // Incomplete, duplicate, or malformed 2xx payloads remain hard failures.
  let discovered;
  let unavailable = false;
  for (const host of [WAX_HYPERION, ...WAX_HYPERION_FALLBACKS]) {
    const seen = new Set(), candidate = [];
    let skip = 0, completed = false, providerUnavailable = false;
    for (let page = 0; page <= MAX_DISCOVERED; page++) {
      const query = '?account=' + encodeURIComponent(account) +
        '&skip=' + skip + '&limit=' + TOKEN_PAGE_SIZE;
      let response;
      try {
        response = await fetchImpl(
          host + '/v2/state/get_tokens' + query, { method: 'GET' }
        );
      } catch (_) {
        providerUnavailable = true;
        break;
      }
      if (!response?.ok) {
        providerUnavailable = true;
        break;
      }
      const provider = await readJson(response, 'wax_inventory');
      if (provider.account !== account ||
          !Array.isArray(provider.tokens) ||
          provider.tokens.length > TOKEN_PAGE_SIZE) {
        throw new Error('wax_inventory_incomplete_or_excessive');
      }
      if (provider.tokens.length === 0) {
        completed = true;
        break;
      }
      if (skip + provider.tokens.length > MAX_DISCOVERED) {
        throw new Error('wax_inventory_incomplete_or_excessive');
      }
      for (const token of provider.tokens) {
        let key;
        try { key = assetKey(token?.contract, token?.symbol, token?.precision); }
        catch (_) { throw new Error('wax_inventory_malformed_token'); }
        if (seen.has(key)) throw new Error('wax_inventory_duplicate_asset');
        seen.add(key);
        candidate.push({ ...token, key });
      }
      skip += provider.tokens.length;
    }
    if (providerUnavailable) {
      unavailable = true;
      continue;
    }
    if (!completed) throw new Error('wax_inventory_incomplete_or_excessive');
    discovered = candidate;
    break;
  }
  if (!discovered) {
    throw new Error(unavailable ? 'wax_inventory_unavailable' :
      'wax_inventory_incomplete_or_excessive');
  }
  const assets = [];
  for (const token of discovered) {
    const key = token.key;
    if (!approved.has(key) && !observeAll) {
      assets.push({ key, contract: token.contract, symbol: token.symbol,
        precision: token.precision, status: 'quarantined_unknown_token' });
      continue;
    }
    // Observation-only pilot may inspect positive balances of UNKNOWN tokens.
    // This NEVER promotes them to the eligible allowlist or inserts a
    // verified historical snapshot. An absent chain balance on a zero-balance
    // Hyperion entry is not proof of transferability or custody.
    if (!approved.has(key) && observeAll && token.amount === 0) {
      assets.push({ key, contract: token.contract, symbol: token.symbol,
        precision: token.precision, status: 'quarantined_zero_unverified' });
      continue;
    }
    const balancesResponse = await fetchImpl(
      WAX_CHAIN_API + '/v1/chain/get_currency_balance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: token.contract, account,
          symbol: token.symbol })
      }
    );
    if (!balancesResponse?.ok) throw new Error('wax_currency_balance_unavailable');
    const balances = await balancesResponse.json();
    if (!Array.isArray(balances) || balances.length !== 1 ||
        typeof balances[0] !== 'string') {
      throw new Error('wax_currency_balance_malformed');
    }
    // Strictly match the on-chain quantity precision to the Hyperion identity:
    // parseQuantity intentionally pads fractions elsewhere, which would turn
    // a 4-decimal chain amount into an inflated 8-decimal observed balance.
    const chainQuantity = balances[0].match(
      /^(?:0|[1-9][0-9]*)(?:\.([0-9]{1,8}))? ([A-Z]{1,7})$/
    );
    if (!chainQuantity || chainQuantity[2] !== token.symbol ||
        (chainQuantity[1] || '').length !== token.precision) {
      throw new Error('wax_currency_precision_mismatch');
    }
    const balanceUnits = parseQuantity(balances[0], token.precision, token.symbol);
    assets.push({
      key, contract: token.contract, symbol: token.symbol,
      precision: token.precision, balanceUnits,
      // Current chain balance is not an immutable last-irreversible-block
      // snapshot and cannot be used to reserve funds or auto-allocate tokens.
      status: approved.has(key) ? 'observed_only' : 'observed_quarantined',
      confirmed: false,
      snapshotBlock: accountProof.latestIrreversibleBlock
    });
  }
  return {
    account, chainId: accountProof.chainId,
    latestIrreversibleBlock: accountProof.latestIrreversibleBlock,
    custodyVerified: false, snapshotFinalityVerified: false,
    assets
  };
}
