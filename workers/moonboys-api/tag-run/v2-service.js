// TAG RUN V2 Community Pot commands, participation and funding snapshots.
// Automatic signing lives in the separately gated scheduled automation module;
// private keys are accepted only through encrypted Worker secret bindings.
import { previousDay } from './core.js';
import {
  TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, MAX_POINTS_PER_DAY, MAX_HISTORICAL_WEIGHT,
  assetKey, parseIntegerUnits, sha256Text, drawSeed, previewCommunityDraw,
  validUtcDay
} from './v2-core.js';
import { discoverWaxTipTokens } from './v2-chain.js';
import { quarantineInboundTipReceipts } from './v2-deposits.js';
import { irreversibleSnapshotDigest, readIrreversibleTokenBalances } from
  './v2-funding-controls.js';
import { OBSERVATION_ADMIN_COMMANDS, observationEnabled,
  handleV2ObservationCommand } from './v2-pilot.js';
import { reviewWaxTokenContract } from './v2-wax-authority-review.js';

export const V2_COMMANDS = new Set([
  'pool', 'myrewards', 'poolstatus', 'poolscan', 'drawpreview', 'drawaudit', 'poolpause',
  'poolapprove', 'poolquarantine', 'pooldonation', 'poolsnapshot',
  ...OBSERVATION_ADMIN_COMMANDS
]);
export const V2_ADMIN_COMMANDS = new Set([
  'poolstatus', 'poolscan', 'drawpreview', 'drawaudit', 'poolpause',
  'poolapprove', 'poolquarantine', 'pooldonation', 'poolsnapshot',
  ...OBSERVATION_ADMIN_COMMANDS
]);
const isV2Available = env => env?.TAG_RUN_ENABLED === 'true' &&
  env?.TAG_RUN_V2_POOL_ENABLED === 'true' && !!env?.DB &&
  env?.TAG_RUN_V2_TIP_ACCOUNT === TIP_ACCOUNT;

async function configFor(db) {
  return db.prepare('SELECT wallet_account,daily_bps,active_daily_bps,active_policy_version,historical_ticket_bps,status,revision ' +
    'FROM tag_run_v2_pool_config WHERE config_id=1').first();
}

// A failed D1 read must never be presented as an empty wallet, allowlist,
// or draw audit. Cloudflare D1 .all() returns { success, results }.
function requiredRows(result, label) {
  if (result?.success !== true || !Array.isArray(result.results)) {
    throw new Error(label + '_unavailable');
  }
  return result.results;
}

const ASSET_ADMIN_COMMANDS = new Set(['poolapprove', 'poolquarantine']);
const FUNDING_ADMIN_COMMANDS = new Set(['pooldonation', 'poolsnapshot']);
const APPROVAL_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,79}$/;
const GLOBAL_ACTION_SEQUENCE = /^[1-9][0-9]{0,24}$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

function parseAssetAdminArgs(name, args) {
  const raw = String(args || '').trim();
  if (!raw || CONTROL_CHARACTER.test(raw)) return null;
  const parts = raw.split(/\s+/u);
  if ((name === 'poolapprove' && parts.length !== 4) ||
      (name === 'poolquarantine' && parts.length < 4)) return null;
  const [contract, symbol, precisionText, ...detailParts] = parts;
  if (!/^[0-8]$/.test(precisionText)) return null;
  let key;
  try { key = assetKey(contract, symbol, Number(precisionText)); }
  catch (_) { return null; }
  const detail = detailParts.join(' ');
  if (name === 'poolapprove' && !APPROVAL_REFERENCE.test(detail)) return null;
  if (name === 'poolquarantine' &&
      (detail.length < 3 || detail.length > 160)) return null;
  return { key, contract, symbol, precision: Number(precisionText), detail };
}

function successfulBatch(results) {
  return Array.isArray(results) && results.length === 2 &&
    results.every(result => result?.success === true &&
      result?.meta?.changes === 1);
}

function parseFundingAdminArgs(name, args) {
  const raw = String(args || '').trim();
  if (!raw || CONTROL_CHARACTER.test(raw)) return null;
  const parts = raw.split(/\s+/u);
  if (parts.length !== 2 || !APPROVAL_REFERENCE.test(parts[1])) return null;
  if (name === 'pooldonation' && !GLOBAL_ACTION_SEQUENCE.test(parts[0])) {
    return null;
  }
  if (name === 'poolsnapshot' && !validUtcDay(parts[0])) return null;
  return { selector: parts[0], reference: parts[1] };
}

function fundingControlsReady(env, cfg) {
  return cfg && cfg.wallet_account === TIP_ACCOUNT &&
    ['paused', 'review_only'].includes(cfg.status) &&
    cfg.daily_bps === 500 && cfg.active_daily_bps === 100 &&
    cfg.active_policy_version === 2 && cfg.historical_ticket_bps === 5000 &&
    env?.TAG_RUN_WEEKLY_REWARDS_ENABLED === 'false';
}

function exactUnits(value, label) {
  try { return parseIntegerUnits(value); }
  catch (_) { throw new Error(label + '_invalid'); }
}

async function handleDonationApproval(_env, options, _parsed) {
  await options.send(
    'Individual tip approval is not required. Token eligibility is controlled by ' +
    '/poolapprove and /poolquarantine. Approved tokens use the verified irreversible ' +
    'isthatajoint balance; unknown or quarantined tokens are excluded. ' +
    'Approved token balances enter the automatic 1% daily cycle.'
  );
  return true;
}

function snapshotInsert(db, row, chatId, day, cutoffBlock, cutoffBlockId) {
  return db.prepare(
    'INSERT INTO tag_run_v2_snapshots ' +
    '(chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,' +
    'chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,' +
    'spendable_units,five_percent_units,snapshot_digest,status,' +
    'reward_policy_bps,daily_reward_units) VALUES (' +
    '(SELECT ? WHERE EXISTS (SELECT 1 FROM tag_run_v2_assets a ' +
    'WHERE a.asset_key=? AND a.chain_id=? AND a.token_contract=? ' +
    'AND a.token_symbol=? AND a.token_precision=? ' +
    "AND a.eligibility='approved' AND length(a.reviewed_by)>0 " +
    'AND length(a.verified_at)>0 ' +
    'AND EXISTS (SELECT 1 FROM tag_run_v2_pool_config p ' +
    'WHERE p.config_id=1 AND p.wallet_account=\'isthatajoint\' ' +
    "AND p.status IN ('paused','review_only') AND p.daily_bps=500 " +
    'AND p.active_daily_bps=100 AND p.active_policy_version=2 ' +
    'AND p.historical_ticket_bps=5000) ' +
    'AND NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE NOT EXISTS (' +
    'SELECT 1 FROM tag_run_v2_deposits d WHERE d.chain_id=json_extract(j.value,\'$.chain_id\') ' +
    'AND d.global_action_seq=json_extract(j.value,\'$.global_action_seq\') ' +
    'AND d.transaction_id=json_extract(j.value,\'$.transaction_id\') ' +
    'AND d.block_num=json_extract(j.value,\'$.block_num\') ' +
    'AND d.block_id=json_extract(j.value,\'$.block_id\') ' +
    'AND d.asset_key=json_extract(j.value,\'$.asset_key\') ' +
    'AND d.units=json_extract(j.value,\'$.units\') ' +
    'AND d.memo_digest=json_extract(j.value,\'$.memo_digest\') ' +
    "AND d.status='confirmed_donation' " +
    'AND d.reviewed_at=json_extract(j.value,\'$.reviewed_at\'))) ' +
    'AND (SELECT COUNT(*) FROM tag_run_v2_payout_intents i ' +
    "WHERE i.asset_key=a.asset_key AND i.status='confirmed')" +
    '=json_array_length(?) ' +
    'AND NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE NOT EXISTS (' +
    'SELECT 1 FROM tag_run_v2_payout_intents i WHERE ' +
    'i.intent_key=json_extract(j.value,\'$.intent_key\') ' +
    'AND i.asset_key=json_extract(j.value,\'$.asset_key\') ' +
    'AND i.amount_units=json_extract(j.value,\'$.amount_units\') ' +
    'AND i.signed_tx_id=json_extract(j.value,\'$.signed_tx_id\') ' +
    'AND i.updated_at=json_extract(j.value,\'$.updated_at\') ' +
    "AND i.status='confirmed')) " +
    'AND (SELECT COUNT(*) FROM tag_run_v2_bundles b ' +
    'JOIN tag_run_v2_draws d ON d.chat_id=b.chat_id AND d.day_key=b.day_key ' +
    'LEFT JOIN tag_run_v2_payout_intents i ON i.chat_id=b.chat_id ' +
    'AND i.day_key=b.day_key AND i.asset_key=b.asset_key ' +
    'AND i.bundle_index=b.bundle_index WHERE b.asset_key=a.asset_key ' +
    "AND d.status='reviewed' AND (i.status IS NULL OR i.status!='confirmed'))" +
    '=json_array_length(?) ' +
    'AND NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE NOT EXISTS (' +
    'SELECT 1 FROM tag_run_v2_bundles b JOIN tag_run_v2_draws d ' +
    'ON d.chat_id=b.chat_id AND d.day_key=b.day_key ' +
    'LEFT JOIN tag_run_v2_payout_intents i ON i.chat_id=b.chat_id ' +
    'AND i.day_key=b.day_key AND i.asset_key=b.asset_key ' +
    'AND i.bundle_index=b.bundle_index WHERE ' +
    'b.chat_id=json_extract(j.value,\'$.chat_id\') ' +
    'AND b.day_key=json_extract(j.value,\'$.day_key\') ' +
    'AND b.asset_key=json_extract(j.value,\'$.asset_key\') ' +
    'AND b.bundle_index=json_extract(j.value,\'$.bundle_index\') ' +
    'AND b.units=json_extract(j.value,\'$.units\') ' +
    "AND d.status='reviewed' AND (i.status IS NULL OR i.status!='confirmed'))))" +
    '),?,?,?,?,?,?,?,?,?,?,?,\'verified\',100,?)'
  ).bind(chatId, row.asset_key, WAX_MAINNET_CHAIN_ID, row.token_contract,
    row.token_symbol, row.token_precision, row.donations_json,
    row.confirmed_payouts_json, row.confirmed_payouts_json,
    row.outstanding_json, row.outstanding_json,
    day, row.asset_key, TIP_ACCOUNT,
    cutoffBlock, cutoffBlockId, row.onchain_units,
    row.allocated_unpaid_units, row.excluded_units, row.spendable_units,
    '0', row.snapshot_digest, row.daily_reward_units);
}

async function handleSnapshotApproval(env, options, parsed) {
  const { telegramId, chatId, send, fetchImpl, cryptoImpl, nowMs } = options;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  if (parsed.selector >= today) {
    await send('Snapshot refused: choose a completed UTC day. Nothing changed.');
    return true;
  }
  const cfg = await configFor(env.DB);
  if (!fundingControlsReady(env, cfg)) {
    await send('Snapshot refused: the verified 1% Community Pot must be paused, ' +
      'with draws and payouts off.');
    return true;
  }
  const existing = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM tag_run_v2_snapshots WHERE chat_id=? AND day_key=?'
  ).bind(chatId, parsed.selector).first();
  if (!existing || !Number.isSafeInteger(Number(existing.n)) || Number(existing.n) < 0) {
    throw new Error('snapshot_existing_read_unavailable');
  }
  if (Number(existing.n) > 0) {
    await send('Verified snapshot set already exists for ' + parsed.selector +
      '. It was not replaced; the automatic cycle will reuse the stored set.');
    return true;
  }
  const approvedResult = await env.DB.prepare(
    'SELECT asset_key,chain_id,token_contract,token_symbol,token_precision,' +
    'reviewed_by,verified_at FROM tag_run_v2_assets ' +
    "WHERE eligibility='approved' ORDER BY asset_key LIMIT 101"
  ).all();
  const assets = requiredRows(approvedResult, 'snapshot_approved_asset_read');
  if (!assets.length) {
    await send('Snapshot refused: no approved token assets. Quarantined assets ' +
      'remain excluded.');
    return true;
  }
  if (assets.length > 100 || assets.some(asset =>
    asset.chain_id !== WAX_MAINNET_CHAIN_ID || !asset.reviewed_by ||
    !asset.verified_at)) throw new Error('snapshot_approved_asset_invalid');

  const [confirmedPayoutResult, outstandingResult,
    quarantinedCount] = await Promise.all([
    env.DB.prepare(
      'SELECT i.intent_key,i.asset_key,i.amount_units,i.signed_tx_id,' +
      'i.updated_at FROM tag_run_v2_payout_intents i ' +
      'JOIN tag_run_v2_assets a ON a.asset_key=i.asset_key ' +
      "WHERE i.status='confirmed' AND a.eligibility='approved' " +
      'ORDER BY i.asset_key,i.updated_at,i.intent_key LIMIT 20001'
    ).all(),
    env.DB.prepare(
      'SELECT b.chat_id,b.day_key,b.asset_key,b.bundle_index,b.units ' +
      'FROM tag_run_v2_bundles b ' +
      'JOIN tag_run_v2_draws d ON d.chat_id=b.chat_id AND d.day_key=b.day_key ' +
      'JOIN tag_run_v2_assets a ON a.asset_key=b.asset_key ' +
      'LEFT JOIN tag_run_v2_payout_intents i ON i.chat_id=b.chat_id ' +
      'AND i.day_key=b.day_key AND i.asset_key=b.asset_key ' +
      'AND i.bundle_index=b.bundle_index WHERE d.status=\'reviewed\' ' +
      "AND a.eligibility='approved' " +
      "AND (i.status IS NULL OR i.status!='confirmed') " +
      'ORDER BY b.asset_key,b.chat_id,b.day_key,b.bundle_index LIMIT 20001'
    ).all(),
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM tag_run_v2_assets WHERE eligibility!='approved'"
    ).first()
  ]);
  const confirmedPayouts = requiredRows(confirmedPayoutResult,
    'snapshot_confirmed_payout_read');
  const outstanding = requiredRows(outstandingResult, 'snapshot_obligation_read');
  if (confirmedPayouts.length > 20000 ||
      outstanding.length > 20000 ||
      !quarantinedCount ||
      !Number.isSafeInteger(Number(quarantinedCount.n)) ||
      Number(quarantinedCount.n) < 0) throw new Error('snapshot_source_limit');

  let evidence;
  try {
    evidence = await readIrreversibleTokenBalances({
      assets, fetchImpl, nowMs
    });
  } catch (_) {
    await send('Snapshot refused: two WAX history providers did not agree on ' +
      'the exact token balances at a common irreversible block. Nothing changed.');
    return true;
  }
  const rows = [];
  for (const asset of assets) {
    const balanceEvidence = evidence.balances.find(
      item => item.assetKey === asset.asset_key);
    if (!balanceEvidence) throw new Error('snapshot_evidence_missing');
    const onchain = exactUnits(balanceEvidence.balanceUnits, 'snapshot_balance');
    // Token approval is the funding gate. Every unit in the independently
    // verified irreversible wallet balance is eligible unless already reserved.
    // Individual inbound tips do not require a second human approval.
    const eligibleDonations = [];
    let confirmedSpent = 0n;
    const assetConfirmedPayouts = confirmedPayouts.filter(
      item => item.asset_key === asset.asset_key);
    for (const payout of assetConfirmedPayouts) {
      const amount = exactUnits(payout.amount_units, 'snapshot_confirmed_payout');
      if (amount <= 0n ||
          !/^[0-9a-f]{64}$/.test(String(payout.intent_key || '')) ||
          !/^[0-9a-f]{64}$/.test(String(payout.signed_tx_id || '')) ||
          typeof payout.updated_at !== 'string' || !payout.updated_at) {
        throw new Error('snapshot_confirmed_payout_invalid');
      }
      confirmedSpent += amount;
    }
    let allocated = 0n;
    const assetOutstanding = outstanding.filter(
      item => item.asset_key === asset.asset_key);
    for (const obligation of assetOutstanding) {
      allocated += exactUnits(obligation.units, 'snapshot_obligation');
    }
    // Confirmed transfers are already reflected in this later chain balance.
    // Subtracting them again would double-debit the pot. Only unpaid reservations
    // reduce the currently spendable approved-token balance.
    const excluded = 0n;
    if (allocated > onchain) {
      await send('Snapshot refused: approved ' + asset.token_symbol + ' balance ' +
        'cannot cover its unpaid reward obligations. Nothing changed.');
      return true;
    }
    const spendable = onchain - allocated;
    const daily = spendable / 100n;
    const digestEvidence = {
      ...balanceEvidence, cutoffBlock: evidence.cutoffBlock,
      cutoffBlockId: evidence.cutoffBlockId
    };
    const row = {
      ...asset, onchain_units: onchain.toString(),
      confirmed_spent_units: confirmedSpent.toString(),
      allocated_unpaid_units: allocated.toString(),
      excluded_units: excluded.toString(), spendable_units: spendable.toString(),
      daily_reward_units: daily.toString(), state_block: balanceEvidence.stateBlock,
      state_block_id: balanceEvidence.stateBlockId,
      donations_json: JSON.stringify(eligibleDonations.map(deposit => ({
        chain_id: deposit.chain_id,
        global_action_seq: String(deposit.global_action_seq),
        transaction_id: deposit.transaction_id, block_num: deposit.block_num,
        block_id: deposit.block_id, asset_key: deposit.asset_key,
        units: deposit.units, memo_digest: deposit.memo_digest,
        reviewed_at: deposit.reviewed_at
      }))),
      confirmed_payouts_json: JSON.stringify(assetConfirmedPayouts.map(payout => ({
        intent_key: payout.intent_key, asset_key: payout.asset_key,
        amount_units: payout.amount_units, signed_tx_id: payout.signed_tx_id,
        updated_at: payout.updated_at
      }))),
      outstanding_json: JSON.stringify(assetOutstanding.map(obligation => ({
        chat_id: obligation.chat_id, day_key: obligation.day_key,
        asset_key: obligation.asset_key, bundle_index: obligation.bundle_index,
        units: obligation.units
      })))
    };
    row.snapshot_digest = await irreversibleSnapshotDigest({
      chatId, day: parsed.selector, asset, evidence: digestEvidence,
      confirmedSpentUnits: row.confirmed_spent_units,
      allocatedUnpaidUnits: row.allocated_unpaid_units,
      excludedUnits: row.excluded_units, spendableUnits: row.spendable_units,
      dailyRewardUnits: row.daily_reward_units, cryptoImpl
    });
    rows.push(row);
  }

  const actor = 'telegram:' + String(telegramId);
  const eventKey = 'telegram-snapshot:verified:' + chatId + ':' +
    parsed.selector + ':' + globalThis.crypto.randomUUID();
  const reason = JSON.stringify({
    domain: 'tag-run-v2:telegram-snapshot-approval:v1',
    day: parsed.selector, chat_id: chatId,
    cutoff_block: evidence.cutoffBlock,
    cutoff_block_id: evidence.cutoffBlockId,
    approved_assets: rows.map(row => ({
      asset_key: row.asset_key, snapshot_digest: row.snapshot_digest,
      state_block: row.state_block, state_block_id: row.state_block_id,
      onchain_units: row.onchain_units,
      confirmed_spent_units: row.confirmed_spent_units,
      allocated_unpaid_units: row.allocated_unpaid_units,
      excluded_units: row.excluded_units,
      daily_reward_units: row.daily_reward_units
    })),
    quarantined_assets_excluded: Number(quarantinedCount.n),
    review: parsed.reference
  });
  const countSql = "(SELECT COUNT(*) FROM tag_run_v2_assets WHERE eligibility='approved')";
  const auditSql =
    'INSERT INTO tag_run_v2_audit (event_key,event_type,reason,reviewed_by) ' +
    'SELECT ?,?,?,? WHERE ' + countSql + '=? UNION ALL ' +
    'SELECT ?,?,?,? WHERE ' + countSql + '<>? UNION ALL ' +
    'SELECT ?,?,?,? WHERE ' + countSql + '<>?';
  const auditArgs = [eventKey, 'snapshot_verified', reason, actor, rows.length,
    eventKey, 'snapshot_verified', reason, actor, rows.length,
    eventKey, 'snapshot_verified', reason, actor, rows.length];
  let results;
  try {
    results = await env.DB.batch([
      ...rows.map(row => snapshotInsert(env.DB, row, chatId, parsed.selector,
        evidence.cutoffBlock, evidence.cutoffBlockId)),
      env.DB.prepare(auditSql).bind(...auditArgs)
    ]);
  } catch (_) { results = null; }
  if (!Array.isArray(results) || results.length !== rows.length + 1 ||
      results.some(result => result?.success !== true ||
        result?.meta?.changes !== 1)) {
    await send('Snapshot write failed atomically; no partial snapshot set was ' +
      'approved. Check D1 and retry.');
    return true;
  }
  await send('VERIFIED IRREVERSIBLE 1% SNAPSHOT SET\nUTC day: ' +
    parsed.selector + '\nCommon WAX cutoff block: ' + evidence.cutoffBlock +
    '\nApproved assets included: ' + rows.length +
    '\nQuarantined/suspended assets excluded: ' + Number(quarantinedCount.n) +
    '\nReview reference: ' + parsed.reference +
    '\nThe automatic commit/reveal and payout cycle will consume this frozen set.');
  return true;
}


export async function createAutomaticSnapshot(env, {
  day, fetchImpl = fetch, cryptoImpl = globalThis.crypto,
  nowMs = Date.now()
} = {}) {
  const chatId = String(env?.TELEGRAM_GROUP_CHAT_ID || '').trim();
  if (!validUtcDay(day) || !/^-100[0-9]{5,20}$/.test(chatId)) {
    throw new Error('automatic_snapshot_arguments_invalid');
  }
  const messages = [];
  await handleSnapshotApproval(env, {
    telegramId: 'automation', chatId,
    send: async message => { messages.push(String(message)); },
    fetchImpl, cryptoImpl, nowMs
  }, {
    selector: day,
    reference: 'automatic-' + day.replaceAll('-', '')
  });
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM tag_run_v2_snapshots WHERE chat_id=? AND day_key=?'
  ).bind(chatId, day).first();
  const count = Number(row?.n);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('automatic_snapshot_not_created');
  }
  return Object.freeze({ status: 'verified', chatId, day, assets: count,
    message: messages.at(-1) || '' });
}

async function handleFundingAdminCommand(env, options) {
  if (options.name === 'pooldonation') {
    return handleDonationApproval(env, options, null);
  }
  const parsed = parseFundingAdminArgs(options.name, options.args);
  if (!parsed) {
    await options.send(options.name === 'pooldonation'
      ? 'Usage: /pooldonation global-action-sequence review-reference\n' +
        'Example: /pooldonation 123456789 donation-review-2026-11-12'
      : 'Usage: /poolsnapshot YYYY-MM-DD review-reference\n' +
        'Example: /poolsnapshot 2026-11-11 snapshot-review-2026-11-12');
    return true;
  }
  return options.name === 'pooldonation'
    ? handleDonationApproval(env, options, parsed)
    : handleSnapshotApproval(env, options, parsed);
}

async function handleAssetAdminCommand(env, options) {
  const { name, args, telegramId, send, fetchImpl } = options;
  const parsed = parseAssetAdminArgs(name, args);
  if (!parsed) {
    await send(name === 'poolapprove'
      ? 'Usage: /poolapprove contract SYMBOL precision review-reference\n' +
        'Example: /poolapprove kingsofgraff LFGK 4 review-2026-11-12'
      : 'Usage: /poolquarantine contract SYMBOL precision reason\n' +
        'Example: /poolquarantine kingsofgraff LFGK 4 unexpected-transfer-fee');
    return true;
  }
  const row = await env.DB.prepare(
    'SELECT asset_key,chain_id,token_contract,token_symbol,token_precision,' +
    'eligibility,approved_code_hash,approved_abi_hash FROM tag_run_v2_assets WHERE asset_key=?'
  ).bind(parsed.key).first();
  if (!row || row.chain_id !== WAX_MAINNET_CHAIN_ID ||
      row.token_contract !== parsed.contract ||
      row.token_symbol !== parsed.symbol ||
      row.token_precision !== parsed.precision) {
    await send('Token identity is not in the observed WAX inventory. Run /poolobserve first, ' +
      'then use the exact contract, uppercase symbol and precision shown there.');
    return true;
  }
  if (name === 'poolapprove' && row.eligibility === 'approved' &&
      /^[0-9a-f]{64}$/.test(String(row.approved_code_hash || '')) &&
      /^[0-9a-f]{64}$/.test(String(row.approved_abi_hash || ''))) {
    await send(parsed.symbol + ' @ ' + parsed.contract +
      ' is already approved for the Community Pot. Every independently verified ' +
      'irreversible wallet unit is eligible automatically; individual tips need no approval. ' +
      'Its pinned code/ABI hashes remain the automatic payout authority.');
    return true;
  }
  if (name === 'poolquarantine' && row.eligibility === 'quarantined') {
    await send(parsed.symbol + ' @ ' + parsed.contract + ' is already quarantined.');
    return true;
  }

  const actor = 'telegram:' + String(telegramId);
  const identity = 'asset_key=' + parsed.key + '; contract=' + parsed.contract +
    '; symbol=' + parsed.symbol + '; precision=' + parsed.precision;
  let reason;
  let verifiedAt;
  let contractReview = null;
  if (name === 'poolapprove') {
    const cfg = await configFor(env.DB);
    if (!cfg || cfg.wallet_account !== TIP_ACCOUNT ||
        !['paused', 'review_only'].includes(cfg.status) ||
        cfg.daily_bps !== 500 || cfg.active_daily_bps !== 100 ||
        cfg.active_policy_version !== 2 || cfg.historical_ticket_bps !== 5000) {
      await send('Approval refused: the verified 1% Community Pot policy must be paused, ' +
        'with draws and payouts off.');
      return true;
    }
    let proof;
    try {
      [proof, contractReview] = await Promise.all([
        discoverWaxTipTokens({
          fetchImpl, account: TIP_ACCOUNT, approvedAssets: [parsed.key]
        }),
        reviewWaxTokenContract({
          fetchImpl, contract: parsed.contract,
          symbol: parsed.symbol, precision: parsed.precision
        })
      ]);
    } catch (_) {
      await send('Approval refused: live WAX chain and token identity recheck failed. ' +
        'Nothing changed; retry later or quarantine the token.');
      return true;
    }
    const live = proof.assets.find(asset => asset.key === parsed.key);
    if (proof.chainId !== WAX_MAINNET_CHAIN_ID || !live ||
        live.status !== 'observed_only' ||
        live.contract !== parsed.contract || live.symbol !== parsed.symbol ||
        live.precision !== parsed.precision ||
        contractReview?.assetKey !== parsed.key ||
        contractReview?.independentlyCorroborated !== true) {
      await send('Approval refused: the exact token identity and standard transfer contract ' +
        'were not confirmed by both WAX providers. Nothing changed.');
      return true;
    }
    verifiedAt = true;
    reason = identity +
      '; token eligibility approved after live WAX identity recheck at irreversible block ' +
      proof.latestIrreversibleBlock + '; review=' + parsed.detail +
      '; code_hash=' + contractReview.codeHash +
      '; abi_hash=' + contractReview.abiHash +
      '; all irreversible wallet units become Community Pot eligible.';
  } else {
    verifiedAt = false;
    reason = identity +
      '; token eligibility quarantined by Telegram admin; reason=' + parsed.detail +
      '; existing audit history retained.';
  }

  const eventKey = 'telegram-asset:' + name + ':' + parsed.key + ':' +
    globalThis.crypto.randomUUID();
  let results;
  try {
    results = await env.DB.batch([
      env.DB.prepare(
        "UPDATE tag_run_v2_assets SET eligibility=?," +
        (verifiedAt
          ? 'verified_at=CURRENT_TIMESTAMP,approved_code_hash=?,approved_abi_hash=?,'
          : 'verified_at=NULL,') +
        'reviewed_by=?,updated_at=CURRENT_TIMESTAMP WHERE asset_key=? ' +
        'AND chain_id=? AND token_contract=? AND token_symbol=? ' +
        'AND token_precision=? AND eligibility=?'
      ).bind(
        name === 'poolapprove' ? 'approved' : 'quarantined',
        ...(verifiedAt ? [contractReview.codeHash, contractReview.abiHash] : []),
        actor, parsed.key, WAX_MAINNET_CHAIN_ID, parsed.contract,
        parsed.symbol, parsed.precision, row.eligibility
      ),
      env.DB.prepare(
        'INSERT INTO tag_run_v2_audit ' +
        '(event_key,event_type,reason,reviewed_by) ' +
        'SELECT ?,?,?,? WHERE changes()=1'
      ).bind(eventKey,
        name === 'poolapprove'
          ? 'asset_eligibility_approved'
          : 'asset_eligibility_quarantined',
        reason, actor)
    ]);
  } catch (_) {
    results = null;
  }
  if (!successfulBatch(results)) {
    await send('Token control failed atomically; nothing was approved or quarantined. ' +
      'Check D1 and retry.');
    return true;
  }
  if (name === 'poolapprove') {
    await send('APPROVED FOR COMMUNITY POT\n' +
      parsed.symbol + ' @ ' + parsed.contract + ' · precision ' + parsed.precision +
      '\nLive WAX identity: rechecked\nReview reference: ' + parsed.detail +
      '\nAll irreversible wallet units of this token are eligible; individual tips need no approval.' +
      '\nContract code hash: ' + contractReview.codeHash +
      '\nContract ABI hash: ' + contractReview.abiHash +
      '\nAutomatic rewards use this pinned contract only.');
  } else {
    await send('QUARANTINED NOW\n' +
      parsed.symbol + ' @ ' + parsed.contract + ' · precision ' + parsed.precision +
      '\nReason: ' + parsed.detail +
      '\nFuture snapshot, draw, reservation and signing checks reject this token immediately.');
  }
  return true;
}

// /drawpreview reads historical weights from completed UTC participation days.
// If a catch-up job is still backfilling, a seemingly valid preview would
// silently exclude eligible historical members. Even a missing cursor blocks.
async function historicalBackfillComplete(db, chatId, day) {
  const cursor = await db.prepare(
    'SELECT last_completed_day_key FROM tag_run_v2_capture_cursors WHERE chat_id=?'
  ).bind(chatId).first();
  if (cursor === null) return false;
  if (!cursor || typeof cursor.last_completed_day_key !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(cursor.last_completed_day_key)) {
    throw new Error('participation_capture_cursor_unavailable');
  }
  const timestamp = Date.parse(cursor.last_completed_day_key + 'T00:00:00.000Z');
  if (!Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== cursor.last_completed_day_key) {
    throw new Error('participation_capture_cursor_invalid');
  }
  // Requiring completion through the target UTC day is stronger than merely
  // checking the prior-day backlog, and ensures initial capture also ran.
  return cursor.last_completed_day_key >= day;
}
function nextUtcDay(day) {
  const timestamp = Date.parse(String(day) + 'T00:00:00.000Z');
  if (!Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== day) {
    throw new Error('invalid_capture_cursor_day');
  }
  return new Date(timestamp + 86400000).toISOString().slice(0, 10);
}
export async function saveYesterdayParticipation(env, options = {}) {
  const pilot = observationEnabled(env);
  if (!isV2Available(env) && !pilot) return { status: 'disabled' };
  const cfg = await configFor(env.DB);
  if (!cfg || (cfg.status === 'paused' && !pilot)) return { status: 'paused' };
  if (pilot && (cfg.wallet_account !== TIP_ACCOUNT || cfg.status !== 'paused' ||
      (cfg.daily_bps !== 500 || cfg.active_daily_bps !== 100 || cfg.active_policy_version !== 2) || cfg.historical_ticket_bps !== 5000)) {
    throw new Error('observation_config_not_paused_and_verified');
  }
  const chatId = String(env.TELEGRAM_GROUP_CHAT_ID || '').trim();
  const yesterday = previousDay(options.nowMs ?? Date.now());
  const maxDays = Math.min(7, Math.max(1,
    Number.isSafeInteger(options.maxDays) ? options.maxDays : 7));
  const checkpoint = await env.DB.prepare(
    'SELECT last_completed_day_key FROM tag_run_v2_capture_cursors WHERE chat_id=?'
  ).bind(chatId).first();
  // A resolved D1 read error can be a truthy object, not just a thrown
  // exception. It MUST NOT be interpreted as "no checkpoint".
  if (checkpoint !== null &&
      (!checkpoint || !validUtcDay(checkpoint.last_completed_day_key))) {
    throw new Error('participation_capture_cursor_unavailable');
  }
  // First V2 activation backfills the earliest still-preserved V1 receipt,
  // not just yesterday. Subsequent failures replay the day after the most
  // recently completed checkpoint before processing newer UTC days.
  const oldest = checkpoint ? null : await env.DB.prepare(
    'SELECT MIN(day_key) AS first_day FROM tag_run_messages ' +
    'WHERE chat_id=? AND day_key<=?'
  ).bind(chatId, yesterday).first();
  if (!checkpoint &&
      (!oldest || !Object.prototype.hasOwnProperty.call(oldest,'first_day') ||
       (oldest.first_day != null && !validUtcDay(oldest.first_day)))) {
    throw new Error('participation_oldest_source_day_unavailable');
  }
  let day = checkpoint?.last_completed_day_key
    ? nextUtcDay(checkpoint.last_completed_day_key)
    : String(oldest?.first_day || yesterday);
  if (day > yesterday) {
    return { status: 'up_to_date', day: yesterday,
      eligible: 0, inserted: 0, processedDays: 0, backlogRemaining: false };
  }
  let inserted = 0, eligible = 0, processedDays = 0;
  let lastCompleted = checkpoint?.last_completed_day_key || null;
  while (day <= yesterday && processedDays < maxDays) {
    const result = await env.DB.prepare(
      'SELECT telegram_id,message_id,points FROM tag_run_messages ' +
      'WHERE chat_id=? AND day_key=? ORDER BY telegram_id,message_id LIMIT 30001'
    ).bind(chatId, day).all();
    if (result?.success === false || !Array.isArray(result?.results)) {
      throw new Error('participation_receipts_unavailable');
    }
    const rows = result.results;
    if (rows.length > 30000) throw new Error('participation_receipt_limit_exceeded');
    const members = new Map();
    for (const row of rows) {
      const id = String(row.telegram_id);
      if (!/^[0-9]{1,20}$/.test(id) ||
          !Number.isSafeInteger(row.message_id) ||
          !Number.isSafeInteger(row.points) ||
          row.points < 1 || row.points > 17) {
        throw new Error('malformed_daily_receipt');
      }
      if (!members.has(id)) members.set(id, { points: 0, receipts: [] });
      const member = members.get(id);
      member.points += row.points;
      if (member.points > MAX_POINTS_PER_DAY || member.receipts.length >= 30) {
        throw new Error('daily_participation_authority_mismatch');
      }
      member.receipts.push([row.message_id,row.points]);
    }
    // One canonical day's receipt digest plus one set-based INSERT avoids
    // thousands of per-member D1 round trips on a busy Telegram group.
    // Every row of this UTC day refers to the same immutable source digest.
    const digest = await sha256Text(JSON.stringify({
      chatId, day, receipts: rows.map(r =>
        [String(r.telegram_id),r.message_id,r.points])
    }), options.cryptoImpl);
    const write = await env.DB.prepare(
      'INSERT OR IGNORE INTO tag_run_v2_participation ' +
      '(chat_id,day_key,telegram_id,earned_weight,source_receipts_digest) ' +
      'SELECT chat_id,day_key,telegram_id,SUM(points),? FROM tag_run_messages ' +
      'WHERE chat_id=? AND day_key=? GROUP BY chat_id,day_key,telegram_id'
    ).bind(digest,chatId,day).run();
    if (write?.success === false ||
        !Number.isSafeInteger(write?.meta?.changes) ||
        write.meta.changes < 0) throw new Error('participation_write_failed');
    const audit = await env.DB.prepare(
      'SELECT COUNT(*) AS recorded, ' +
      'SUM(CASE WHEN source_receipts_digest<>? THEN 1 ELSE 0 END) AS bad_digest ' +
      'FROM tag_run_v2_participation WHERE chat_id=? AND day_key=?'
    ).bind(digest,chatId,day).first();
    if (!audit || Number(audit.recorded) !== members.size ||
        Number(audit.bad_digest || 0) !== 0) {
      throw new Error('participation_reconciliation_failed');
    }
    inserted += write.meta.changes;
    // Checkpoint advances only AFTER all participants for this day were
    // recorded. A D1 failure leaves the cursor unchanged; the next run
    // replays INSERT OR IGNORE, including any partially written rows.
    const done = await env.DB.prepare(
      'INSERT INTO tag_run_v2_capture_cursors (chat_id,last_completed_day_key) ' +
      'VALUES (?,?) ON CONFLICT(chat_id) DO UPDATE SET ' +
      'last_completed_day_key=excluded.last_completed_day_key, ' +
      'updated_at=CURRENT_TIMESTAMP WHERE excluded.last_completed_day_key>' +
      'tag_run_v2_capture_cursors.last_completed_day_key'
    ).bind(chatId,day).run();
    if (done?.success === false) throw new Error('capture_checkpoint_write_failed');
    eligible += members.size;
    processedDays++;
    lastCompleted = day;
    day = nextUtcDay(day);
  }
  return { status: 'recorded', day: lastCompleted, eligible, inserted,
    processedDays, backlogRemaining: day <= yesterday };
}
async function pendingWeight(db, chatId, telegramId) {
  const query = await db.prepare(
    'SELECT earned_weight,spent_historical_weight FROM tag_run_v2_participation ' +
    'WHERE chat_id=? AND telegram_id=?'
  ).bind(chatId,telegramId).all();
  if (query?.success !== true || !Array.isArray(query?.results) ||
      query.results.length > 3660) throw new Error('pending_participation_unavailable');
  return query.results.reduce((total,row) => {
    const earned=row.earned_weight,spent=row.spent_historical_weight;
    if (!Number.isSafeInteger(earned) || earned < 0 ||
        earned > MAX_POINTS_PER_DAY || !Number.isSafeInteger(spent) ||
        spent < 0 || spent > earned) {
      throw new Error('pending_participation_invalid');
    }
    return total + earned - spent;
  },0);
}
async function drawInput(db, chatId, day) {
  const [snapshots, recent, backlog] = await Promise.all([
    db.prepare('SELECT s.*,a.token_contract,a.token_symbol,a.token_precision,' +
      'a.eligibility FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a ' +
      'ON s.asset_key=a.asset_key WHERE s.chat_id=? AND s.day_key=? ' +
      "AND s.status='verified' AND a.eligibility='approved' LIMIT 101")
      .bind(chatId,day).all(),
    db.prepare('SELECT telegram_id,SUM(points) AS points FROM tag_run_messages ' +
      'WHERE chat_id=? AND day_key=? GROUP BY telegram_id ORDER BY telegram_id LIMIT 2001')
      .bind(chatId,day).all(),
    db.prepare('SELECT telegram_id, SUM(earned_weight-spent_historical_weight) AS points ' +
      'FROM tag_run_v2_participation WHERE chat_id=? AND day_key<? ' +
      'GROUP BY telegram_id HAVING points>0 ORDER BY telegram_id LIMIT 2001')
      .bind(chatId,day).all()
  ]);
  if ([snapshots,recent,backlog].some(r => r?.success === false ||
      !Array.isArray(r?.results))) throw new Error('draw_input_unavailable');
  if (snapshots.results.length > 100 || recent.results.length > 2000 ||
      backlog.results.length > 2000) throw new Error('draw_input_limit_exceeded');
  return {
    assets: snapshots.results.map(a => ({
      contract:a.token_contract,symbol:a.token_symbol,precision:a.token_precision,
      key:a.asset_key,balanceUnits:a.onchain_units,reservedUnits:a.allocated_unpaid_units,
      excludedUnits:a.excluded_units,approved:true,confirmed:true
    })),
    current: recent.results.map(r=>({
      telegramId:r.telegram_id,points:Number(r.points)
    })),
    historical:backlog.results.map(r=>({
      telegramId:r.telegram_id,points:Math.min(MAX_HISTORICAL_WEIGHT,Number(r.points))
    }))
  };
}
export async function handleTagRunV2Command(env, options) {
  const { name, args = '', isAdmin, isPrivate, chatId, telegramId, send,
    nowMs = Date.now(), fetchImpl = fetch,
    cryptoImpl = globalThis.crypto } = options;
  if (V2_ADMIN_COMMANDS.has(name) && (!isAdmin || !isPrivate)) {
    await send('Community Pot administration is restricted to authorised bot DMs.');
    return true;
  }
  if (ASSET_ADMIN_COMMANDS.has(name)) {
    return await handleAssetAdminCommand(env, {
      name,args,telegramId,send,fetchImpl
    });
  }
  if (FUNDING_ADMIN_COMMANDS.has(name)) {
    return await handleFundingAdminCommand(env, {
      name,args,telegramId,chatId,send,fetchImpl,cryptoImpl,nowMs
    });
  }
  if (OBSERVATION_ADMIN_COMMANDS.has(name)) {
    return await handleV2ObservationCommand(env, {
      name,isAdmin,isPrivate,chatId,telegramId,send,nowMs,fetchImpl,
      capture: captureOptions => saveYesterdayParticipation(env,captureOptions)
    });
  }
  if (name === 'poolscan' && observationEnabled(env)) {
    try {
      const result = await quarantineInboundTipReceipts(env, {
        fetchImpl, allowPausedObservation: true
      });
      if (result.status !== 'quarantined_review_only') {
        throw new Error('paused_observation_scan_unavailable');
      }
      await send('TAG RUN V2 · INBOUND SCAN (QUARANTINE ONLY)\n' +
        'Irreversible inbound candidates: ' + result.seen +
        '\nNew quarantined receipts: ' + result.inserted +
        '\nHistory scan incomplete: ' + (result.truncated ? 'YES' : 'UNKNOWN') +
        '\nUse /poolapprove or /poolquarantine for each exact token identity. ' +
        'This scan itself does not draw, sign or transfer tokens.');
    } catch (error) {
      await send('Community Pot scan unavailable: ' +
        String(error?.message || error).slice(0,120) +
        '. No donation was approved and no transfer was attempted.');
    }
    return true;
  }
  // Master #1697: let a member inspect their own REAL unfunded Street
  // Cred participation during the observation-only pilot. Never expose
  // member records in the group, authorize funded draws, or write D1.
  if (name === 'myrewards' && !isPrivate) {
    await send('DM the bot with /myrewards to view your own participation. ' +
      'No token payouts are enabled.');
    return true;
  }
  if (name === 'myrewards' && observationEnabled(env)) {
    const cfg = await configFor(env.DB);
    if (!cfg || cfg.wallet_account !== TIP_ACCOUNT ||
        cfg.status !== 'paused' || (cfg.daily_bps !== 500 || cfg.active_daily_bps !== 100 || cfg.active_policy_version !== 2) ||
        cfg.historical_ticket_bps !== 5000) {
      throw new Error('observation_config_not_paused_and_verified');
    }
    const pending=await pendingWeight(env.DB,chatId,telegramId);
    await send('TAG RUN · YOUR COMMUNITY POT (READ-ONLY)\n' +
      'Unfunded participation weight: '+pending+' points (not tokens).\n' +
      'Only completed UTC days count toward this historical total.\n' +
      'Historical activity can receive up to 50% of draw-ticket weight ' +
      'when current and past participants both qualify.\n' +
      'Pool: PAUSED. Assets: QUARANTINED. Draws: OFF. Transfers: OFF.\n' +
      'No funds, token debt, reward promise or payout is recorded.');
    return true;
  }
  if (!isV2Available(env)) {
    await send('TAG RUN V2 Community Token Pot is not active yet. ' +
      'Street Cred and the 29 ranks continue normally. No token payouts are enabled.');
    return true;
  }
  const cfg = await configFor(env.DB);
  if (!cfg || cfg.wallet_account !== TIP_ACCOUNT) {
    await send('Community Pot configuration is not verified; no donations requested.');
    return true;
  }
  if (name === 'pool') {
    if (cfg.status === 'paused') {
      await send('Community Pot V2 is paused pending wallet custody and chain checks. ' +
        'Do not send tokens yet. Street Cred remains active.');
      return true;
    }
    const rows = await env.DB.prepare(
      'SELECT a.token_symbol,a.token_contract,s.spendable_units,s.day_key ' +
      'FROM tag_run_v2_assets a JOIN tag_run_v2_snapshots s ' +
      'ON s.asset_key=a.asset_key WHERE s.chat_id=? ' +
      "AND a.eligibility='approved' AND s.status='verified' " +
      'AND s.day_key = (SELECT MAX(latest.day_key) ' +
      'FROM tag_run_v2_snapshots latest WHERE latest.chat_id=s.chat_id ' +
      "AND latest.asset_key=s.asset_key AND latest.status='verified') " +
      'ORDER BY s.day_key DESC,a.token_symbol,a.token_contract LIMIT 20'
    ).bind(chatId).all();
    const balances = requiredRows(rows, 'pool_balance_read');
    const lines = balances.map(r=>r.token_symbol+' @ '+
      r.token_contract+' — '+r.spendable_units+' smallest units ('+r.day_key+')');
    await send('TAG RUN · AUTOMATIC COMMUNITY TOKEN POT\n' +
      'Pot status: '+cfg.status+'. Wallet: '+TIP_ACCOUNT+
      '\nDaily review pool: at most 1% of each approved unreserved token.'+
      '\n'+(lines.join('\n')||'No independently verified eligible token balances yet.')+
      '\nStreet Cred is permanent. Token bonuses are not guaranteed.');
    return true;
  }
  if (name === 'myrewards') {
    const pending = await pendingWeight(env.DB,chatId,telegramId);
    await send('TAG RUN · YOUR COMMUNITY POT\n' +
      'Unfunded participation weight: '+pending+' points (not a token balance).'+
      '\nHistorical activity receives up to 50% of ticket weight when current ' +
      'and past participants both qualify.\n'+
      'Approved token rewards run automatically; use /rainstatus to check your registered WAX destination.');
    return true;
  }
  if (name === 'poolpause') {
    const writes = await env.DB.batch([
      env.DB.prepare(
        "UPDATE tag_run_v2_pool_config SET status='paused',revision=revision+1," +
        "updated_at=CURRENT_TIMESTAMP WHERE config_id=1 AND status!='paused'"
      ),
      env.DB.prepare(
        'UPDATE tag_run_v2_payout_caps SET paused=1,revision=revision+1 ' +
        'WHERE paused=0'
      )
    ]);
    if (!Array.isArray(writes) || writes.length !== 2 ||
        writes.some(result => result?.success !== true)) {
      throw new Error('pool_pause_write_failed');
    }
    await send('COMMUNITY POT EMERGENCY PAUSE ACTIVE\\n' +
      'New snapshots, draws, reservations, signing and broadcast retries are stopped. ' +
      'Street Cred continues; already submitted transactions remain reconciliation-only.');
    return true;
  }
  if (name === 'poolscan') {
    if (cfg.status === 'paused') {
      await send('Community Pot paused; scanning is not enabled.');
      return true;
    }
    try {
      const result = await quarantineInboundTipReceipts(env, { fetchImpl });
      await send('TAG RUN V2 · INBOUND SCAN (QUARANTINE ONLY)\n' +
        'Irreversible inbound candidates: ' + result.seen +
        '\nNew quarantined receipts: ' + result.inserted +
        '\nHistory scan incomplete: ' + (result.truncated ? 'YES' : 'UNKNOWN') +
        '\nApproved identities fund automatically; this scan itself does not draw, sign or transfer.');
    } catch (error) {
      await send('Community Pot scan unavailable: ' +
        String(error?.message || error).slice(0,120) +
        '. No donation was approved and no transfer was attempted.');
    }
    return true;
  }
  if (name === 'poolstatus') {
    const allow = await env.DB.prepare(
      "SELECT asset_key FROM tag_run_v2_assets WHERE eligibility='approved' LIMIT 101"
    ).all();
    const approvedAssets = requiredRows(allow, 'pool_allowlist_read');
    if (approvedAssets.length > 100) throw new Error('approved_asset_limit');
    let inventory;
    try {
      inventory = await discoverWaxTipTokens({
        fetchImpl,approvedAssets:approvedAssets.map(r=>r.asset_key)
      });
    } catch (err) {
      await send('Community Pot RPC check failed closed: '+
        String(err?.message || 'unavailable').slice(0,120)+
        '. No token allocation or transfer attempted.');
      return true;
    }
    await send('TAG RUN V2 · AUTOMATIC POT INVENTORY\n'+
      'Wallet exists on WAX mainnet: '+inventory.account+
      '\nDiscovered assets: '+inventory.assets.length+
      '\nApproved observed: '+inventory.assets.filter(x=>x.status==='observed_only').length+
      '\nQuarantined/unknown: '+inventory.assets.filter(x=>x.status!=='observed_only').length+
      '\nOnly approved, contract-pinned identities can enter automatic snapshots and payouts.');
    return true;
  }
  if (name === 'drawaudit') {
    const rows = await env.DB.prepare(
      'SELECT day_key,status,created_at FROM tag_run_v2_draws ' +
      'WHERE chat_id=? ORDER BY day_key DESC LIMIT 10'
    ).bind(chatId).all();
    const records = requiredRows(rows, 'pool_draw_audit_read');
    await send('TAG RUN V2 · REVIEW-ONLY DRAW AUDIT\n' +
      (records.map(r=>r.day_key+' · '+r.status).join('\n')||
        'No review-only draw records. No payout records exist.'));
    return true;
  }
  if (name === 'drawpreview') {
    if (cfg.status !== 'review_only') {
      await send('V2 draw preview is paused until custody and asset review are complete.');
      return true;
    }
    // The approved V2 foundation has fixed 1% daily and 50% historical
    // probability. Reject unexpected DB settings rather than silently
    // simulating different rates from those displayed to members.
    if ((cfg.daily_bps !== 500 || cfg.active_daily_bps !== 100 || cfg.active_policy_version !== 2) || cfg.historical_ticket_bps !== 5000) {
      throw new Error('v2_draw_rule_configuration_mismatch');
    }
    const day = previousDay(nowMs);
    if (!(await historicalBackfillComplete(env.DB, chatId, day))) {
      await send('TAG RUN V2 · DRAW PREVIEW BLOCKED\n' +
        'Historical Street Cred participation is still being backfilled ' +
        'through ' + day + ' UTC. No draw was simulated, token bundle ' +
        'allocated or token transferred. Retry after catch-up completes.');
      return true;
    }
    const input = await drawInput(env.DB,chatId,day);
    if (!input.assets.length) {
      await send('No independently verified token snapshots for '+day+
        '. No token amounts have been allocated.');
      return true;
    }
    const seedHex = drawSeed();
    const preview = await previewCommunityDraw({
      day,...input,seedHex
    });
    await send('TAG RUN V2 · UNSAVED SIMULATION ONLY\n'+
      'Day: '+day+'\nApproved assets: '+preview.budgets.length+
      '\nHypothetical token bundles: '+preview.bundles.length+
      '\nHistorical ticket cap: 50%\n'+
      'Commitment: '+preview.seedCommitment.slice(0,16)+'…'+
      '\nThis is not a committed, independently auditable draw, '+
      'token debt, or payout. No funds are moved.');
    return true;
  }
  return false;
}
