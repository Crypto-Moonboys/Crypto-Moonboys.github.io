#!/usr/bin/env node
// Owner-operated TAG RUN V2 WAX settlement. Never mounted in the public Worker.
// This tool can submit a REAL WAX transfer only after live release flags,
// reviewed D1 funding, a frozen payout intent and a second local Anchor approval.
// It never stores WAX keys; Anchor prompts on the owner's own computer.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  initializeReviewedDailyCap, reserveReviewedPayout,
  handoffApprovedPayout, buildReviewedWaxTransfer,
  markIrreversiblyConfirmed
} from '../workers/moonboys-api/tag-run/v2-payout-executor.js';
import { verifyIrreversibleWaxPayout } from '../workers/moonboys-api/tag-run/v2-payout-chain-reconcile.js';
import { WAX_CHAIN_API } from '../workers/moonboys-api/tag-run/v2-chain.js';
import {
  assetKey, TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID
} from '../workers/moonboys-api/tag-run/v2-core.js';

const DB_ID = '8a36e17a-18fa-4b98-90e1-3f269164b166';
const SCRIPT = 'moonboys-api';
const HEX = /^[a-f0-9]{64}$/;
const SEQ = /^[1-9][0-9]{0,24}$/;
const REQUIRED_FLAGS = Object.freeze({
  TAG_RUN_ENABLED: 'true',
  TAG_RUN_WEEKLY_REWARDS_ENABLED: 'false',
  TAG_RUN_V2_OBSERVATION_ENABLED: 'false',
  TAG_RUN_V2_POOL_ENABLED: 'true',
  TAG_RUN_V2_DRAWS_ENABLED: 'true',
  TAG_RUN_V2_PAYOUTS_ENABLED: 'true',
  TAG_RUN_V2_EXECUTOR_RELEASE_APPROVED: 'true',
  TAG_RUN_V2_TIP_ACCOUNT: TIP_ACCOUNT
});
const ALLOWED = new Set([
  'intent', 'day', 'chat', 'contract', 'symbol', 'precision',
  'max-units', 'approved-by', 'bundle', 'member', 'recipient',
  'units', 'auth-digest', 'tx', 'sequence', 'live'
]);

const fail = reason => { throw new Error('tag_run_owner_' + reason); };
const only = (value, pattern, reason) => {
  if (typeof value !== 'string' || !pattern.test(value)) fail(reason);
  return value;
};
const int = (value, max, reason) => {
  if (!/^(0|[1-9][0-9]*)$/.test(String(value ?? ''))) fail(reason);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > max) fail(reason);
  return number;
};
function redactError(error) {
  // Never echo Cloudflare HTTP bodies, bearer tokens or raw SQL on errors.
  return error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]') : 'unknown_failure';
}

export function parseOwnerCommand(argv) {
  const command = argv[0];
  if (!['status', 'create-cap', 'open-cap', 'reserve', 'send', 'reconcile'].includes(command))
    fail('unknown_command');
  const options = {};
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--') || !ALLOWED.has(key.slice(2)) || key.slice(2) in options)
      fail('invalid_option');
    if (key === '--live') {
      options.live = true;
    } else {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--'))
        fail('missing_option_value');
      options[key.slice(2)] = argv[++i];
    }
  }
  if (command !== 'status' && options.live !== true) fail('explicit_live_flag_required');
  return { command, options };
}

function getOperatorCredentials(vars) {
  const token = only(vars.CLOUDFLARE_API_TOKEN, /^\S{12,}$/, 'cloudflare_token_missing');
  const accountId = only(vars.CLOUDFLARE_ACCOUNT_ID, /^[a-f0-9]{32}$/, 'account_id_missing');
  const group = only(vars.TAG_RUN_OPERATOR_GROUP_ID, /^-100[0-9]{5,20}$/, 'group_id_missing');
  return { token, accountId, group };
}

function jsonApi(fetchImpl, token, url, body) {
  return (async () => {
    let response;
    try {
      response = await fetchImpl(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: 'Bearer ' + token,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch (_) {
      fail('cloudflare_unavailable');
    }
    if (!response?.ok) fail('cloudflare_request_failed');
    let result;
    try { result = await response.json(); } catch (_) { fail('cloudflare_invalid_json'); }
    if (result?.success !== true || result.errors?.length) fail('cloudflare_operation_failed');
    return result.result;
  })();
}

export function validateDeployedPayoutSettings(settings, { reconciliationOnly = false } = {}) {
  if (!settings || !Array.isArray(settings.bindings)) fail('worker_settings_unavailable');
  const bindings = new Map();
  for (const binding of settings.bindings) {
    if (!binding || typeof binding.name !== 'string') continue;
    if (bindings.has(binding.name)) fail('duplicate_worker_binding');
    bindings.set(binding.name, binding);
  }
  const d1 = bindings.get('DB');
  // Cloudflare's current binding model uses database_id; id is a
  // deprecated optional alias. Reject conflicting aliases rather than
  // accepting whichever happens to be populated.
  if (!d1 || d1.type !== 'd1' ||
    (d1.database_id ?? d1.id) !== DB_ID ||
    (d1.database_id && d1.id && d1.database_id !== d1.id))
    fail('worker_d1_binding_mismatch');
  const flags = {};
  for (const [name, expected] of Object.entries(REQUIRED_FLAGS)) {
    // Operator may settle an UNKNOWN already-sent transfer while funded
    // payouts are paused. Proof still requires two independent indexers.
    if (reconciliationOnly && ![
      'TAG_RUN_ENABLED', 'TAG_RUN_WEEKLY_REWARDS_ENABLED',
      'TAG_RUN_V2_TIP_ACCOUNT'
    ].includes(name)) continue;
    const entry = bindings.get(name);
    if (!entry || entry.type !== 'plain_text' || entry.text !== expected)
      fail('deployed_release_not_authorized_' + name);
    flags[name] = entry.text;
  }
  return flags;
}

export function makeD1RestAdapter({ accountId, token, fetchImpl = fetch }) {
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + accountId +
    '/d1/database/' + DB_ID + '/query';
  const post = body => jsonApi(fetchImpl, token, url, body);
  function statement(sql, args = []) {
    return {
      sql, args,
      bind(...values) { return statement(sql, values); },
      async first() {
        const rows = await execute(sql, args);
        return rows.results[0] ?? null;
      },
      async all() {
        return await execute(sql, args);
      },
      async run() {
        return await execute(sql, args);
      }
    };
  }
  async function execute(sql, params) {
    if (typeof sql !== 'string' || !sql.trim() || sql.includes(';'))
      fail('invalid_database_statement');
    if (!Array.isArray(params) || params.some(value =>
      value === null || !['string', 'number'].includes(typeof value)))
      fail('invalid_database_params');
    const result = await post({ sql, params: params.map(String) });
    if (!Array.isArray(result) || result.length !== 1 ||
      result[0]?.success !== true || !Array.isArray(result[0]?.results))
      fail('invalid_d1_statement_response');
    return result[0];
  }
  return {
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      if (!Array.isArray(statements) || statements.length !== 2 ||
        statements.some(s => !s || typeof s.sql !== 'string' ||
          !Array.isArray(s.args) || s.sql.includes(';')))
        fail('invalid_atomic_batch');
      // Cloudflare D1 HTTP batch; both SQL statements must be atomic.
      const result = await post({ batch: statements.map(s => ({
        sql: s.sql, params: s.args.map(String)
      })) });
      if (!Array.isArray(result) || result.length !== 2 ||
        result.some(s => s?.success !== true || !Array.isArray(s.results)))
        fail('invalid_atomic_batch_response');
      return result;
    }
  };
}

export function assertAnchorTransfer(request) {
  const act = request?.action;
  if (request?.chainId !== WAX_MAINNET_CHAIN_ID ||
    request?.from !== TIP_ACCOUNT ||
    !HEX.test(request?.intentKey || '') ||
    !act || act.name !== 'transfer' ||
    act.account !== request.contract ||
    !Array.isArray(act.authorization) || act.authorization.length !== 1 ||
    act.authorization[0]?.actor !== TIP_ACCOUNT ||
    act.authorization[0]?.permission !== 'tagrain' ||
    act.data?.from !== TIP_ACCOUNT ||
    act.data?.to !== request.destination ||
    typeof act.data?.quantity !== 'string' ||
    !/^(0|[1-9][0-9]*)(\.[0-9]{1,8})? [A-Z]{1,7}$/.test(act.data.quantity) ||
    act.data.memo !== 'TAG RUN V2 ' + request.intentKey.slice(0, 20))
    fail('signer_action_invalid');
  return act;
}


/**
 * Validate the ACTUAL signed Anchor result, not just the original prompt.
 * Anchor Link promises a decoded resolvedTransaction. No co-signer action,
 * additional authorization, modified recipient, quantity or memo is allowed.
 */
export function assertSignedAnchorTransfer(result, request) {
  const want = assertAnchorTransfer(request);
  const same = (a, b) => a !== undefined && a !== null && String(a) === String(b);
  if (!result || result.processed != null ||
      !same(result.chain?.chainId, WAX_MAINNET_CHAIN_ID) ||
      !same(result.signer?.actor, TIP_ACCOUNT) ||
      !same(result.signer?.permission, 'tagrain') ||
      !Array.isArray(result.signatures) || result.signatures.length < 1)
    fail('anchor_signed_response_invalid');
  const tx = result.transaction;
  const decoded = result.resolvedTransaction;
  if (!tx || !decoded ||
      !Array.isArray(tx.actions) || tx.actions.length !== 1 ||
      !Array.isArray(decoded.actions) || decoded.actions.length !== 1 ||
      !Array.isArray(tx.context_free_actions) || tx.context_free_actions.length ||
      !Array.isArray(decoded.context_free_actions) || decoded.context_free_actions.length ||
      !Array.isArray(tx.transaction_extensions) || tx.transaction_extensions.length ||
      !Array.isArray(decoded.transaction_extensions) || decoded.transaction_extensions.length ||
      !same(tx.delay_sec, '0') || !same(decoded.delay_sec, '0'))
    fail('anchor_signed_transaction_modified');
  for (const action of [tx.actions[0], decoded.actions[0]]) {
    if (!same(action?.account, want.account) ||
        !same(action?.name, want.name) ||
        !Array.isArray(action.authorization) || action.authorization.length !== 1 ||
        !same(action.authorization[0]?.actor, TIP_ACCOUNT) ||
        !same(action.authorization[0]?.permission, 'tagrain'))
      fail('anchor_signed_transaction_modified');
  }
  const data = decoded.actions[0].data;
  const fields = ['from', 'to', 'quantity', 'memo'];
  if (!data || typeof data !== 'object' ||
      Object.keys(data).sort().join(',') !== fields.sort().join(',') ||
      fields.some(key => !same(data[key], want.data[key])))
    fail('anchor_signed_transaction_modified');
  return result;
}

export function anchorResultTransactionId(response) {
  const candidates = [response?.transaction?.id, response?.transactionId,
    response?.transaction_id, response?.processed?.id, response?.response?.transaction_id];
  for (const item of candidates) {
    const value = typeof item === 'string' ? item : item?.toString?.();
    if (HEX.test(value || '')) return value;
  }
  return null; // UNKNOWN still requires independent immutable finality proof.
}

export async function makeAnchorConsoleSigner({
  importModule = name => import(name), fetchImpl = fetch,
  // A fresh, independently authenticated release AND D1 authority check.
  // REQUIRED: this is called AFTER wallet approval, immediately before push.
  beforeBroadcast
} = {}) {
  if (typeof beforeBroadcast !== 'function')
    fail('broadcast_guard_required');
  let Link, Transport, SignedTransaction, ABI, Serializer;
  try {
    const [linkModule, transportModule, antelope] = await Promise.all([
      importModule('anchor-link'),
      importModule('anchor-link-console-transport'),
      importModule('@wharfkit/antelope')
    ]);
    Link = linkModule.default || linkModule.AnchorLink;
    Transport = transportModule.default || transportModule.ConsoleTransport;
    SignedTransaction = antelope.SignedTransaction;
    ABI = antelope.ABI;
    Serializer = antelope.Serializer;
    if (typeof Link !== 'function' || typeof Transport !== 'function' ||
        typeof SignedTransaction?.from !== 'function' ||
        typeof ABI?.from !== 'function' ||
        typeof Serializer?.encode !== 'function')
      fail('anchor_adapter_invalid');
  } catch (_) {
    fail('anchor_dependencies_missing');
  }
  // Validate WAX chain and restricted permission before D1 is set to UNKNOWN.
  const post = async (method, body) => {
    let response;
    try {
      response = await fetchImpl(WAX_CHAIN_API + '/v1/chain/' + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (_) { fail('wax_rpc_unavailable'); }
    if (!response?.ok) fail('wax_rpc_unavailable');
    try { return await response.json(); } catch (_) { fail('wax_rpc_malformed'); }
  };
  const info = await post('get_info', {});
  if (info?.chain_id !== WAX_MAINNET_CHAIN_ID) fail('wrong_wax_chain');
  const account = await post('get_account', { account_name: TIP_ACCOUNT });
  if (account?.account_name !== TIP_ACCOUNT ||
    !Array.isArray(account.permissions) ||
    !account.permissions.some(x => x.perm_name === 'tagrain'))
    fail('restricted_wax_permission_missing');

  const link = new Link({
    transport: new Transport(),
    chains: [{ chainId: WAX_MAINNET_CHAIN_ID, nodeUrl: WAX_CHAIN_API }],
    storage: null
  });
  return async request => {
    const action = assertAnchorTransfer(request);
    // Anchor only SIGNS and returns its result. A pending QR/Anchor approval
    // can NEVER broadcast the transaction on its own. Do not change to true.
    const signed = await link.transact({ actions: [action] }, {
      broadcast: false, noModify: true
    });
    assertSignedAnchorTransfer(signed, request);
    // Verify the RAW action bytes that will be broadcast, independently of
    // the decoded/wallet-displayed fields. Every supported token must use
    // the standard fungible-token transfer ABI; nonstandard layouts fail shut.
    const canonicalTransferAbi = ABI.from({
      structs:[{name:'transfer',base:'',fields:[
        {name:'from',type:'name'},
        {name:'to',type:'name'},
        {name:'quantity',type:'asset'},
        {name:'memo',type:'string'}
      ]}]
    });
    const expectedBytes = Serializer.encode({
      object:action.data,abi:canonicalTransferAbi,type:'transfer'
    });
    if (String(signed.transaction.actions[0].data) !== String(expectedBytes))
      fail('anchor_signed_transaction_modified');
    // Use the same transaction representation as Anchor Link internally.
    // Never reconstruct an action from CLI arguments.
    const tx = SignedTransaction.from({
      ...signed.transaction, signatures: signed.signatures
    });
    if (!HEX.test(String(tx?.id || ''))) fail('anchor_transaction_invalid');
    if (typeof signed.chain?.client?.v1?.chain?.push_transaction !== 'function')
      fail('anchor_broadcast_unavailable');

    // LAST release gate: this executes after signing/approval has finished.
    // It checks freshly deployed flags plus D1 UNKNOWN, pool/cap pause,
    // approved asset, snapshot, draw and member destination.
    // Any rejection leaves UNKNOWN for manual reconciliation; no push.
    await beforeBroadcast(request);

    // Exactly one submission attempt. Never automatically repeat on error,
    // timeout, ambiguous response or cancellation.
    const pushed = await signed.chain.client.v1.chain.push_transaction(tx);
    const responseId = anchorResultTransactionId(pushed);
    if (responseId && responseId !== String(tx.id))
      fail('anchor_transaction_id_mismatch');
    return { transactionId: responseId || String(tx.id) };
  };
}

export async function confirmExactly(text, { input = stdin, output = stdout } = {}) {
  if (!input.isTTY || !output.isTTY) fail('interactive_tty_required');
  const rl = createInterface({ input, output });
  try {
    const response = await rl.question('Type exactly "' + text + '" to authorize: ');
    if (response !== text) fail('operator_approval_rejected');
  } finally { rl.close(); }
}

export async function runOwnerPayout(argv, {
  vars = process.env, fetchImpl = fetch,
  confirmation = confirmExactly, signerFactory = makeAnchorConsoleSigner,
  log = console.log
} = {}) {
  const { command, options: o } = parseOwnerCommand(argv);
  const auth = getOperatorCredentials(vars);
  const base = 'https://api.cloudflare.com/client/v4/accounts/' + auth.accountId;
  const db = makeD1RestAdapter({ accountId: auth.accountId, token: auth.token, fetchImpl });
  // Read-only status works even while production payments remain disabled.
  if (command === 'status') {
    only(o.intent, HEX, 'intent_key_missing');
    const intent = await db.prepare('SELECT * FROM tag_run_v2_payout_intents WHERE intent_key=?')
      .bind(o.intent).first();
    if (!intent) fail('intent_not_found');
    const action = buildReviewedWaxTransfer({ ...intent, status: 'reserved' });
    log(JSON.stringify({
      status: intent.status, intentKey: intent.intent_key,
      destination: action.destination, quantity: action.action.data.quantity,
      contract: action.contract, confirmed: intent.status === 'confirmed'
    }));
    return;
  }

  const settings = await jsonApi(fetchImpl, auth.token,
    base + '/workers/scripts/' + SCRIPT + '/settings');
  const flags = validateDeployedPayoutSettings(settings, {
    reconciliationOnly: command === 'reconcile'
  });
  const env = Object.freeze({
    ...flags, DB: db, TELEGRAM_GROUP_CHAT_ID: auth.group
  });
  const chat = o.chat || auth.group;
  if (chat !== auth.group) fail('group_mismatch');
  if (command === 'create-cap') {
    const precision = int(o.precision, 8, 'invalid_precision');
    const key = assetKey(o.contract, o.symbol, precision);
    only(o.day, /^\d{4}-\d{2}-\d{2}$/, 'invalid_day');
    only(o['max-units'], /^[1-9][0-9]{0,77}$/, 'invalid_transfer_ceiling');
    only(o['approved-by'], /^.{3,128}$/, 'reviewer_missing');
    await confirmation('CREATE CAP ' + o.day + ' ' + key + ' MAX ' + o['max-units']);
    const cap = await initializeReviewedDailyCap(env, {
      chatId: chat, day: o.day, contract: o.contract, symbol: o.symbol,
      precision, authorizedBy: o['approved-by'], maxTransferUnits: o['max-units']
    });
    log(JSON.stringify(cap));
    return;
  }
  if (command === 'open-cap') {
    const precision = int(o.precision, 8, 'invalid_precision');
    const key = assetKey(o.contract, o.symbol, precision);
    only(o.day, /^\d{4}-\d{2}-\d{2}$/, 'invalid_day');
    await confirmation('OPEN CAP ' + o.day + ' ' + key);
    const result = await db.prepare(
      'UPDATE tag_run_v2_payout_caps SET paused=0,revision=revision+1 ' +
      "WHERE chat_id=? AND day_key=? AND asset_key=? AND paused=1 AND committed_units='0' " +
      "AND EXISTS (SELECT 1 FROM tag_run_v2_pool_config p " +
      "WHERE p.config_id=1 AND p.status='review_only' AND p.wallet_account='isthatajoint') " +
      "AND EXISTS (SELECT 1 FROM tag_run_v2_snapshots s " +
      "JOIN tag_run_v2_assets a ON a.asset_key=s.asset_key " +
      "WHERE s.chat_id=tag_run_v2_payout_caps.chat_id " +
      "AND s.day_key=tag_run_v2_payout_caps.day_key " +
      "AND s.asset_key=tag_run_v2_payout_caps.asset_key " +
      "AND s.status='verified' AND a.eligibility='approved' " +
      "AND s.snapshot_digest=tag_run_v2_payout_caps.snapshot_digest)"
    ).bind(chat, o.day, key).run();
    if (result?.meta?.changes !== 1) fail('cap_not_opened');
    log('CAP OPENED; each member reservation remains separately reviewed');
    return;
  }
  if (command === 'reserve') {
    const precision = int(o.precision, 8, 'invalid_precision');
    const bundleIndex = int(o.bundle, 19, 'invalid_bundle');
    const key = assetKey(o.contract, o.symbol, precision);
    only(o.day, /^\d{4}-\d{2}-\d{2}$/, 'invalid_day');
    only(o.member, /^[0-9]{1,20}$/, 'invalid_member');
    only(o.recipient, /^[a-z1-5.]{1,12}$/, 'invalid_recipient');
    only(o.units, /^[1-9][0-9]{0,77}$/, 'invalid_units');
    only(o['auth-digest'], HEX, 'auth_digest_missing');
    only(o['approved-by'], /^.{3,128}$/, 'reviewer_missing');
    await confirmation('RESERVE ' + o.units + ' ' + key + ' TO ' + o.recipient);
    const reserved = await reserveReviewedPayout(env, {
      chatId: chat, day: o.day, contract: o.contract, symbol: o.symbol,
      precision, bundleIndex, telegramId: o.member,
      receivingAccount: o.recipient, amountUnits: o.units,
      authorizationDigest: o['auth-digest'], approvedBy: o['approved-by']
    });
    log(JSON.stringify(reserved));
    return;
  }
  if (command === 'send') {
    only(o.intent, HEX, 'intent_key_missing');
    // Source is frozen, already-reviewed D1; never accept a caller's action,
    // quantity, destination or token contract as a signing request.
    const intent = await db.prepare(
      'SELECT * FROM tag_run_v2_payout_intents WHERE intent_key=?'
    ).bind(o.intent).first();
    if (!intent || intent.status !== 'reserved') fail('intent_not_reserved');
    const action = buildReviewedWaxTransfer(intent);
    await confirmation('SEND ' + o.intent + ' ' +
      action.action.data.quantity + ' TO ' + action.destination);
    // Dependency, chain and permission checks MUST finish before the
    // executor atomically changes reserved -> broadcast_unknown.
    const verifyReleaseAuthorization = async () => {
      const currentSettings = await jsonApi(fetchImpl, auth.token,
        base + '/workers/scripts/' + SCRIPT + '/settings');
      validateDeployedPayoutSettings(currentSettings);
    };
    const beforeBroadcast = async request => {
      // Do not rely on any pre-sign flags: pause may occur while Anchor is open.
      await verifyReleaseAuthorization();
      const row = await db.prepare(
        'SELECT i.intent_key FROM tag_run_v2_payout_intents i ' +
        'JOIN tag_run_v2_payout_caps c ON c.chat_id=i.chat_id ' +
        'AND c.day_key=i.day_key AND c.asset_key=i.asset_key ' +
        'JOIN tag_run_v2_pool_config p ON p.config_id=1 ' +
        'JOIN tag_run_v2_snapshots s ON s.chat_id=i.chat_id ' +
        'AND s.day_key=i.day_key AND s.asset_key=i.asset_key ' +
        'JOIN tag_run_v2_assets a ON a.asset_key=i.asset_key ' +
        'JOIN tag_run_v2_draws d ON d.chat_id=i.chat_id AND d.day_key=i.day_key ' +
        'JOIN tag_run_wallets w ON w.telegram_id=i.telegram_id ' +
        "WHERE i.intent_key=? AND i.status='broadcast_unknown' " +
        'AND i.signed_tx_id IS NULL AND i.chat_id=? ' +
        'AND i.asset_key=? AND i.receiving_account=? AND i.amount_units=? ' +
        "AND c.paused=0 AND c.snapshot_digest=i.snapshot_digest " +
        "AND p.status='review_only' AND p.wallet_account='isthatajoint' " +
        'AND p.daily_bps=500 AND p.historical_ticket_bps=5000 ' +
        "AND s.status='verified' AND s.snapshot_digest=i.snapshot_digest " +
        "AND a.eligibility='approved' AND d.status='reviewed' " +
        'AND d.reviewed_by IS NOT NULL AND length(d.reviewed_by)>0 ' +
        'AND w.wax_account=i.receiving_account'
      ).bind(o.intent, auth.group, intent.asset_key,
        intent.receiving_account, intent.amount_units).first();
      if (!row || row.intent_key !== o.intent)
        fail('broadcast_authorization_revoked');
    };
    const signer = await signerFactory({ fetchImpl, beforeBroadcast });
    const result = await handoffApprovedPayout(env, {
      intentKey: o.intent, signAndBroadcast: signer,
      verifyReleaseAuthorization, fetchImpl
    });
    // Even a known tx ID is NOT a confirmed payout without two-indexer LIB.
    log(JSON.stringify(result));
    if (result.manualReconciliationRequired) process.exitCode = 2;
    return;
  }
  if (command === 'reconcile') {
    only(o.intent, HEX, 'intent_key_missing');
    only(o.tx, HEX, 'transaction_id_missing');
    only(o.sequence, SEQ, 'global_sequence_missing');
    await confirmation('CONFIRM ' + o.intent + ' TX ' + o.tx);
    const result = await markIrreversiblyConfirmed(env, {
      intentKey: o.intent, transactionId: o.tx,
      verifyIrreversibleAction: () => verifyIrreversibleWaxPayout({
        transactionId: o.tx, globalSequence: o.sequence, fetchImpl
      })
    });
    log(JSON.stringify(result));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runOwnerPayout(process.argv.slice(2)).catch(error => {
    console.error('[tag-run-v2-owner] ' + redactError(error));
    process.exitCode = 1;
  });
}
