// Automatic WAX signer for the explicitly selected isthatajoint@active model.
// The private key is accepted only from a Worker secret binding. Never log it,
// persist it, return it, or place it in wrangler.toml.
import {
  APIClient, FetchProvider, ABI, Action, Serializer, Transaction,
  SignedTransaction, PackedTransaction, PrivateKey
} from '@wharfkit/antelope';
import { TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID } from './v2-core.js';
import { WAX_CHAIN_API } from './v2-chain.js';
import { WAX_AUTHORITY_PROVIDERS } from './v2-wax-authority-review.js';

const HEX = /^[0-9a-f]{64}$/;
// WAX permits a one-hour transaction lifetime. Keep the frozen transaction
// valid through at least one 30-minute automation retry without re-signing it.
export const ACTIVE_TRANSACTION_LIFETIME_SECONDS = 3600;
const fail = reason => { throw new Error('v2_active_signer_' + reason); };

const canonicalTransferAbi = ABI.from({
  structs: [{
    name: 'transfer', base: '', fields: [
      { name: 'from', type: 'name' },
      { name: 'to', type: 'name' },
      { name: 'quantity', type: 'asset' },
      { name: 'memo', type: 'string' }
    ]
  }]
});

async function post(fetchImpl, host, method, body) {
  let response;
  try {
    response = await fetchImpl(host + '/v1/chain/' + method, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (_) { fail('wax_rpc_unavailable'); }
  if (response?.ok !== true) fail('wax_rpc_unavailable');
  try { return await response.json(); }
  catch (_) { fail('wax_rpc_malformed'); }
}

function activeAuthority(account, publicKeys) {
  if (account?.account_name !== TIP_ACCOUNT ||
      !Array.isArray(account.permissions)) fail('active_authority_unavailable');
  const rows = account.permissions.filter(row => row?.perm_name === 'active');
  if (rows.length !== 1) fail('active_authority_unavailable');
  const auth = rows[0]?.required_auth;
  if (!auth || !Number.isSafeInteger(auth.threshold) || auth.threshold < 1 ||
      !Array.isArray(auth.keys) || !Array.isArray(auth.accounts) ||
      !Array.isArray(auth.waits) || auth.accounts.length || auth.waits.length) {
    fail('active_authority_not_direct_key');
  }
  const match = auth.keys.find(entry =>
    publicKeys.includes(String(entry?.key || '')) &&
    Number.isSafeInteger(entry?.weight) && entry.weight >= auth.threshold
  );
  if (!match) fail('active_key_not_authorized');
  return JSON.stringify({
    threshold: auth.threshold,
    keys: auth.keys.map(entry => [String(entry.key), entry.weight])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  });
}

async function assertActiveKeyAuthority(privateKey, fetchImpl) {
  let key;
  try { key = PrivateKey.from(privateKey); }
  catch (_) { fail('private_key_invalid'); }
  const publicKey = key.toPublic();
  const publicKeys = [String(publicKey), publicKey.toLegacyString()];
  const observations = await Promise.all(WAX_AUTHORITY_PROVIDERS.map(async host => {
    const [info, account] = await Promise.all([
      post(fetchImpl, host, 'get_info', {}),
      post(fetchImpl, host, 'get_account', { account_name: TIP_ACCOUNT })
    ]);
    if (info?.chain_id !== WAX_MAINNET_CHAIN_ID) fail('wrong_chain');
    return activeAuthority(account, publicKeys);
  }));
  if (observations[0] !== observations[1]) fail('active_authority_disagreement');
  return key;
}

function assertRequest(request) {
  const action = request?.action;
  if (request?.chainId !== WAX_MAINNET_CHAIN_ID ||
      request?.from !== TIP_ACCOUNT || !HEX.test(request?.intentKey || '') ||
      !action || action.account !== request.contract || action.name !== 'transfer' ||
      !Array.isArray(action.authorization) || action.authorization.length !== 1 ||
      action.authorization[0]?.actor !== TIP_ACCOUNT ||
      action.authorization[0]?.permission !== 'active' ||
      action.data?.from !== TIP_ACCOUNT ||
      action.data?.to !== request.destination ||
      typeof action.data?.quantity !== 'string' ||
      typeof action.data?.memo !== 'string') fail('action_invalid');
  return action;
}

export async function prepareActiveKeyTransaction({
  request, privateKey, fetchImpl = fetch
} = {}) {
  const action = assertRequest(structuredClone(request));
  const key = await assertActiveKeyAuthority(privateKey, fetchImpl);
  const client = new APIClient({
    provider: new FetchProvider(WAX_CHAIN_API, { fetch: fetchImpl })
  });
  const info = await client.v1.chain.get_info();
  if (String(info.chain_id) !== WAX_MAINNET_CHAIN_ID) fail('wrong_chain');
  const data = Serializer.encode({
    object: action.data, abi: canonicalTransferAbi, type: 'transfer'
  });
  const encodedAction = Action.from({
    account: action.account,
    name: action.name,
    authorization: action.authorization,
    data
  });
  const transaction = Transaction.from({
    ...info.getTransactionHeader(ACTIVE_TRANSACTION_LIFETIME_SECONDS),
    context_free_actions: [],
    actions: [encodedAction],
    transaction_extensions: []
  });
  const signature = key.signDigest(transaction.signingDigest(info.chain_id));
  const signed = SignedTransaction.from({
    ...transaction, signatures: [signature]
  });
  const transactionId = String(signed.id);
  if (!HEX.test(transactionId)) fail('transaction_id_invalid');
  const signedTransactionJson = JSON.stringify(signed);
  if (signedTransactionJson.length < 100 || signedTransactionJson.length > 20000) {
    fail('signed_transaction_invalid');
  }
  return Object.freeze({ transactionId, signedTransactionJson });
}

export async function broadcastPreparedTransaction({
  transactionId, signedTransactionJson, beforeBroadcast,
  fetchImpl = fetch
} = {}) {
  if (!HEX.test(transactionId || '') ||
      typeof signedTransactionJson !== 'string' ||
      typeof beforeBroadcast !== 'function') fail('prepared_transaction_invalid');
  let signed;
  try { signed = SignedTransaction.from(JSON.parse(signedTransactionJson)); }
  catch (_) { fail('prepared_transaction_invalid'); }
  if (String(signed.id) !== transactionId) fail('transaction_id_mismatch');
  await beforeBroadcast();
  const packed = PackedTransaction.fromSigned(signed);
  let result;
  try {
    result = await post(fetchImpl, WAX_CHAIN_API, 'push_transaction',
      Serializer.objectify(packed));
  } catch (_) { fail('broadcast_unconfirmed'); }
  const returned = String(result?.transaction_id || result?.processed?.id || '');
  if (returned && returned !== transactionId) fail('transaction_id_mismatch');
  return Object.freeze({ transactionId, submitted: true });
}
