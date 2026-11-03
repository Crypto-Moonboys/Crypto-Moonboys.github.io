// TAG RUN V2: public, read-only WAX account inventory discovery.
// Hyperion discovers token identities; authoritative WAX chain RPC validates
// chain/account/each individual token amount. Neither source is an attestation
// of donation provenance, finality at a snapshot, or spending authority.
// This module MUST NOT contain signing, transfer, private keys or send actions.

import { TIP_ACCOUNT, assetKey, parseQuantity, WAX_MAINNET_CHAIN_ID } from './v2-core.js';
export const WAX_CHAIN_API = 'https://wax.greymass.com';
export const WAX_HYPERION = 'https://wax.eosrio.io';
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
  account = TIP_ACCOUNT, approvedAssets = [] } = {}) {
  const accountProof = await readWaxTipAccount({ fetchImpl, account });
  if (!Array.isArray(approvedAssets) || approvedAssets.length > MAX_DISCOVERED) {
    throw new Error('asset_allowlist_invalid');
  }
  const approved = new Set(approvedAssets);
  const seen = new Set(), discovered = [];
  // Hyperion's get_tokens defaults to 50 rows, with skip/limit implemented
  // upstream even though those arguments are absent from the public docs.
  // A short page is NOT proof of completion: deployments may cap the limit
  // below 50. Only an explicit empty page confirms the end of inventory.
  // Discover the ENTIRE bounded inventory before reading any token balances.
  let skip = 0;
  let completed = false;
  for (let page = 0; page <= MAX_DISCOVERED; page++) {
    const query = '?account=' + encodeURIComponent(account) +
      '&skip=' + skip + '&limit=' + TOKEN_PAGE_SIZE;
    const provider = await readJson(await fetchImpl(
      WAX_HYPERION + '/v2/state/get_tokens' + query, { method: 'GET' }
    ), 'wax_inventory');
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
      // Missing or malformed token identity cannot be silently discarded:
      // that would falsely report an apparently complete inventory.
      let key;
      try { key = assetKey(token?.contract, token?.symbol, token?.precision); }
      catch (_) { throw new Error('wax_inventory_malformed_token'); }
      if (seen.has(key)) throw new Error('wax_inventory_duplicate_asset');
      seen.add(key);
      discovered.push({ ...token, key });
    }
    // Advance by the number of records actually returned, not the requested
    // page size (which the Hyperion operator may clamp).
    skip += provider.tokens.length;
  }
  if (!completed) throw new Error('wax_inventory_incomplete_or_excessive');
  const assets = [];
  for (const token of discovered) {
    const key = token.key;
    if (!approved.has(key)) {
      assets.push({ key, contract: token.contract, symbol: token.symbol,
        precision: token.precision, status: 'quarantined_unknown_token' });
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
      status: 'observed_only', confirmed: false,
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
