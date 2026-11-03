// TAG RUN: account name existence validation for user-directed destinations.
// A successful chain query proves account existence, NOT ownership of the account.
// No signature, transaction, approval, or transfer is performed here.
import { isValidWaxAccount } from './core.js';
import { WAX_CHAIN_API } from './v2-chain.js';
import { WAX_MAINNET_CHAIN_ID } from './v2-core.js';

export async function checkWaxDestination(account, fetchImpl = fetch) {
  if (!isValidWaxAccount(account)) {
    return { status: 'invalid' };
  }
  const post = async (path, body) => {
    let response;
    try {
      response = await fetchImpl(WAX_CHAIN_API + '/v1/chain/' + path, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
    } catch (_) {
      throw new Error('wax_destination_rpc_unavailable');
    }
    if (!response?.ok) {
      // A failed account lookup is NOT sufficient evidence of a missing
      // account: it might be rate limiting or upstream unavailability.
      throw new Error('wax_destination_rpc_unavailable');
    }
    try {
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('invalid_data');
      }
      return data;
    } catch (_) {
      throw new Error('wax_destination_rpc_unavailable');
    }
  };
  const info = await post('get_info',{});
  if (info.chain_id !== WAX_MAINNET_CHAIN_ID) {
    throw new Error('wax_destination_wrong_chain');
  }
  // EOSIO get_account typically returns 500 for a nonexistent account.
  // Reject without writing rather than assuming it exists.
  const accountData = await post('get_account',{account_name:account});
  if (accountData.account_name !== account) {
    throw new Error('wax_destination_account_mismatch');
  }
  return { status:'exists', account, ownershipProven:false };
}
