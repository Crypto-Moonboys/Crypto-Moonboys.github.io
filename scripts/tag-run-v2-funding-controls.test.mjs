import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, assetKey, sha256Text
} from '../workers/moonboys-api/tag-run/v2-core.js';
import { handleTagRunV2Command } from
  '../workers/moonboys-api/tag-run/v2-service.js';
import { loadDrawInputs } from './tag-run-v2-draw-workflow.mjs';

const read = name => readFileSync(new URL(
  '../workers/moonboys-api/migrations/' + name, import.meta.url), 'utf8');
const MIGRATIONS = [
  '103_tag_run_street_cred_rewards.sql',
  '104_tag_run_v2_community_token_pot.sql',
  '105_tag_run_v2_payout_execution.sql',
  '106_tag_run_v2_one_percent_policy.sql',
  '107_tag_run_v2_persisted_draws.sql',
  '108_tag_run_v2_allowlist_funding.sql',
  '109_tag_run_v2_full_automation.sql',
  '110_tag_run_admin_member_blocks.sql'
];
const GROUP = '-1001234567890';
const ADMIN = '1111';
const DAY = '2026-11-11';
const NOW = Date.parse('2026-11-12T16:00:00Z');
const CONTRACT = 'kingsofgraff';
const SYMBOL = 'LFGK';
const ASSET = assetKey(CONTRACT, SYMBOL, 4);
const QUARANTINED = assetKey('wuffi', 'WUF', 4);
const TX = 'a'.repeat(64);
const CUTOFF = 120;
const STATE_BLOCK = 110;
const RECEIPT_BLOCK = 100;
const blockId = (number, char) =>
  number.toString(16).padStart(8, '0') + char.repeat(56);
const CUTOFF_ID = blockId(CUTOFF, 'b');
const STATE_ID = blockId(STATE_BLOCK, 'c');
const RECEIPT_ID = blockId(RECEIPT_BLOCK, 'd');

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON;');
  for (const migration of MIGRATIONS) sqlite.exec(read(migration));
  t.after(() => sqlite.close());
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() { return sqlite.prepare(sql).get(...args) || null; },
            async all() {
              return { success: true, results: sqlite.prepare(sql).all(...args) };
            },
            async run() {
              const result = sqlite.prepare(sql).run(...args);
              return { success: true, meta: { changes: result.changes } };
            }
          };
        },
        async first() { return sqlite.prepare(sql).get() || null; },
        async all() {
          return { success: true, results: sqlite.prepare(sql).all() };
        },
        async run() {
          const result = sqlite.prepare(sql).run();
          return { success: true, meta: { changes: result.changes } };
        }
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE;');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT;');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK;');
        throw error;
      }
    }
  };
  const env = {
    DB, TAG_RUN_ENABLED: 'true', TAG_RUN_WEEKLY_REWARDS_ENABLED: 'false',
    TAG_RUN_V2_OBSERVATION_ENABLED: 'true', TAG_RUN_V2_POOL_ENABLED: 'false',
    TAG_RUN_V2_DRAWS_ENABLED: 'false', TAG_RUN_V2_PAYOUTS_ENABLED: 'false',
    TAG_RUN_V2_TIP_ACCOUNT: TIP_ACCOUNT, TELEGRAM_GROUP_CHAT_ID: GROUP
  };
  sqlite.prepare(
    'INSERT INTO tag_run_v2_assets ' +
    '(asset_key,chain_id,token_contract,token_symbol,token_precision,' +
    'eligibility,verified_at,reviewed_by,approved_code_hash,approved_abi_hash) ' +
    'VALUES (?,?,?,?,?,\'approved\',CURRENT_TIMESTAMP,?,?,?)'
  ).run(ASSET, WAX_MAINNET_CHAIN_ID, CONTRACT, SYMBOL, 4,
    'telegram:' + ADMIN, 'c'.repeat(64), 'd'.repeat(64));
  sqlite.prepare(
    'INSERT INTO tag_run_v2_assets ' +
    '(asset_key,chain_id,token_contract,token_symbol,token_precision,' +
    "eligibility) VALUES (?,?,?,?,?,'quarantined')"
  ).run(QUARANTINED, WAX_MAINNET_CHAIN_ID, 'wuffi', 'WUF', 4);
  return { sqlite, DB, env };
}

async function addReceipt(f, { asset = ASSET, sequence = '123',
  status = 'quarantined', units = '100000' } = {}) {
  const memo = 'community gift';
  f.sqlite.prepare(
    'INSERT INTO tag_run_v2_deposits ' +
    '(chain_id,global_action_seq,transaction_id,block_num,block_id,' +
    'sender_account,recipient_account,asset_key,units,memo_digest,status,' +
    'reviewed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(WAX_MAINNET_CHAIN_ID, sequence, TX, RECEIPT_BLOCK, RECEIPT_ID,
    'gkniftyheads', TIP_ACCOUNT, asset, units,
    await sha256Text(memo, webcrypto), status,
    status === 'confirmed_donation' ? '2026-11-12T12:00:00Z' : null);
}

function addConfirmedPayout(f, { units = '1000' } = {}) {
  const oldDay = '2026-11-10';
  const snapshot = '8'.repeat(64);
  const intent = '7'.repeat(64);
  f.sqlite.prepare(
    "UPDATE tag_run_v2_pool_config SET status='review_only',revision=revision+1"
  ).run();
  f.sqlite.prepare(
    'INSERT INTO tag_run_v2_snapshots ' +
    '(chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,' +
    'chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,' +
    'spendable_units,five_percent_units,snapshot_digest,status,' +
    'reward_policy_bps,daily_reward_units) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,100,?)'
  ).run(GROUP, oldDay, ASSET, TIP_ACCOUNT, 90, '5'.repeat(64),
    '100000', '0', '0', '100000', '0', snapshot, 'verified', '1000');
  f.sqlite.prepare(
    'INSERT INTO tag_run_v2_draws ' +
    '(chat_id,day_key,status,seed_commitment,rules_digest,weights_digest,' +
    'snapshots_digest,reviewed_by,reward_policy_bps) ' +
    "VALUES (?,?,'reviewed',?,?,?,?,?,100)"
  ).run(GROUP, oldDay, '1'.repeat(64), '2'.repeat(64),
    '3'.repeat(64), snapshot, 'historical-reviewer');
  f.sqlite.prepare(
    'INSERT INTO tag_run_v2_bundles ' +
    '(chat_id,day_key,asset_key,bundle_index,telegram_id,ticket_class,units) ' +
    "VALUES (?,?,?,0,'2222','current',?)"
  ).run(GROUP, oldDay, ASSET, units);
  f.sqlite.prepare(
    "INSERT INTO tag_run_wallets (telegram_id,wax_account) VALUES ('2222','paidmember11')"
  ).run();
  f.sqlite.prepare(
    'INSERT INTO tag_run_v2_payout_caps ' +
    '(chat_id,day_key,asset_key,snapshot_digest,daily_limit_units,' +
    'per_transfer_limit_units,authorized_by,reward_policy_bps) ' +
    "VALUES (?,?,?,?,?,?,'historical-approval',100)"
  ).run(GROUP, oldDay, ASSET, snapshot, '1000', '1000');
  f.sqlite.prepare(
    'UPDATE tag_run_v2_payout_caps SET paused=0,revision=revision+1 ' +
    'WHERE chat_id=? AND day_key=? AND asset_key=?'
  ).run(GROUP, oldDay, ASSET);
  f.sqlite.prepare(
    'UPDATE tag_run_v2_payout_caps SET committed_units=?,last_reserved_units=?,' +
    'last_intent_key=?,revision=revision+1 ' +
    'WHERE chat_id=? AND day_key=? AND asset_key=?'
  ).run(units, units, intent, GROUP, oldDay, ASSET);
  f.sqlite.prepare(
    'INSERT INTO tag_run_v2_payout_intents ' +
    '(intent_key,chat_id,day_key,asset_key,bundle_index,telegram_id,' +
    'receiving_account,amount_units,snapshot_digest,authorization_digest,' +
    "status,signed_tx_id,approved_by) VALUES (?,?,?,?,0,'2222',?,?,?,?,'reserved',NULL,?)"
  ).run(intent, GROUP, oldDay, ASSET, 'paidmember11', units, snapshot,
    '9'.repeat(64), 'historical-approval');
  f.sqlite.prepare(
    "UPDATE tag_run_v2_payout_intents SET status='broadcast_unknown'," +
    'updated_at=CURRENT_TIMESTAMP WHERE intent_key=?'
  ).run(intent);
  f.sqlite.prepare(
    "UPDATE tag_run_v2_payout_intents SET status='confirmed',signed_tx_id=?," +
    'updated_at=CURRENT_TIMESTAMP WHERE intent_key=?'
  ).run('6'.repeat(64), intent);
  f.sqlite.prepare(
    "UPDATE tag_run_v2_pool_config SET status='paused',revision=revision+1"
  ).run();
}

function network({ mismatchHistory = false, unavailable = false } = {}) {
  const calls = [];
  const memo = 'community gift';
  const action = {
    global_sequence: '123', block_num: RECEIPT_BLOCK,
    trx_id: TX, block_id: RECEIPT_ID,
    act: { account: CONTRACT, name: 'transfer', data: {
      from: 'gkniftyheads', to: TIP_ACCOUNT,
      quantity: '10.0000 LFGK', memo
    } }
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (unavailable) return { ok: false, json: async () => ({}) };
    if (url.endsWith('/get_info')) return { ok: true, json: async () => ({
      chain_id: WAX_MAINNET_CHAIN_ID, head_block_num: 125,
      last_irreversible_block_num: CUTOFF,
      last_irreversible_block_id: CUTOFF_ID,
      head_block_time: new Date(NOW).toISOString()
    }) };
    if (url.endsWith('/get_account')) return { ok: true, json: async () => ({
      account_name: TIP_ACCOUNT
    }) };
    if (url.endsWith('/get_block')) {
      const block = JSON.parse(options.body).block_num_or_id;
      const ids = new Map([
        [CUTOFF, CUTOFF_ID], [STATE_BLOCK, STATE_ID],
        [RECEIPT_BLOCK, RECEIPT_ID]
      ]);
      return { ok: true, json: async () => ({ block_num: block, id: ids.get(block) }) };
    }
    if (url.endsWith('/get_abi')) return {
      ok: true, json: async () => ({
        account_name: CONTRACT,
        abi: {
          actions: [{ name: 'transfer', type: 'transfer' }],
          structs: [{ name: 'transfer', base: '', fields: [
            { name: 'from', type: 'name' }, { name: 'to', type: 'name' },
            { name: 'quantity', type: 'asset' }, { name: 'memo', type: 'string' }
          ] }]
        }
      })
    };
    if (url.endsWith('/get_code_hash')) return {
      ok: true, json: async () => ({
        account_name: CONTRACT, code_hash: 'c'.repeat(64)
      })
    };
    if (url.endsWith('/get_currency_stats')) return {
      ok: true, json: async () => ({ LFGK: {
        supply: '1000.0000 LFGK', max_supply: '1000000.0000 LFGK',
        issuer: 'gkniftyheads'
      } })
    };
    if (url.endsWith('/get_currency_balance')) return {
      ok: true, json: async () => ['10.0000 LFGK']
    };
    if (url.includes('/v2/history/get_actions?')) return {
      ok: true, json: async () => ({ actions: [action] })
    };
    if (url.includes('/v2/history/get_deltas?')) {
      const other = mismatchHistory && url.startsWith('https://wax.eosphere.io');
      return { ok: true, json: async () => ({
        lib: CUTOFF, last_indexed_block: 125, total: { value: 1 },
        deltas: [{
          code: CONTRACT, scope: TIP_ACCOUNT, table: 'accounts',
          primary_key: '1262962252', block_num: STATE_BLOCK,
          block_id: STATE_ID, present: 1,
          data: { balance: other ? '9.0000 LFGK' : '10.0000 LFGK' }
        }]
      }) };
    }
    throw new Error('unexpected request ' + url);
  };
  return { fetchImpl, calls };
}

async function admin(f, name, args, options = {}) {
  const messages = [];
  const result = await handleTagRunV2Command(f.env, {
    name, args, isAdmin: options.isAdmin ?? true,
    isPrivate: options.isPrivate ?? true,
    chatId: GROUP, telegramId: ADMIN,
    send: async message => messages.push(message), nowMs: NOW,
    fetchImpl: options.fetchImpl || network().fetchImpl,
    cryptoImpl: webcrypto
  });
  return { result, messages };
}

test('approved token makes individual tip approval unnecessary', async t => {
  const f = fixture(t);
  await addReceipt(f);
  const rpc = network();
  const result = await admin(f, 'pooldonation', '', {
    fetchImpl: rpc.fetchImpl
  });
  assert.equal(result.result, true);
  assert.match(result.messages[0], /Individual tip approval is not required/);
  assert.match(result.messages[0], /poolapprove/);
  assert.match(result.messages[0], /poolquarantine/);
  assert.equal(f.sqlite.prepare(
    "SELECT status FROM tag_run_v2_deposits WHERE global_action_seq='123'"
  ).get().status, 'quarantined');
  assert.equal(rpc.calls.length, 0);
  assert.equal(f.sqlite.prepare(
    "SELECT COUNT(*) AS n FROM tag_run_v2_audit WHERE event_type='donation_approved'"
  ).get().n, 0);
  const alreadyApproved = await admin(f, 'poolapprove',
    CONTRACT + ' ' + SYMBOL + ' 4 review-2026-11-12');
  assert.match(alreadyApproved.messages[0], /already approved for the Community Pot/);
  assert.match(alreadyApproved.messages[0], /individual tips need no approval/);
});

test('verified snapshot includes approved assets, excludes quarantine and feeds persisted draw inputs', async t => {
  const f = fixture(t);
  await addReceipt(f, { status: 'quarantined' });
  const rpc = network();
  const result = await admin(f, 'poolsnapshot', DAY + ' snapshot-review-1697', {
    fetchImpl: rpc.fetchImpl
  });
  assert.match(result.messages[0], /VERIFIED IRREVERSIBLE 1% SNAPSHOT SET/);
  assert.match(result.messages[0], /Approved assets included: 1/);
  assert.match(result.messages[0], /Quarantined\/suspended assets excluded: 1/);
  assert.match(result.messages[0], /Payouts: OFF/);
  const snapshots = f.sqlite.prepare(
    'SELECT * FROM tag_run_v2_snapshots ORDER BY asset_key'
  ).all();
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].asset_key, ASSET);
  assert.equal(snapshots[0].chain_irreversible_block, CUTOFF);
  assert.equal(snapshots[0].chain_block_id, CUTOFF_ID);
  assert.equal(snapshots[0].onchain_units, '100000');
  assert.equal(snapshots[0].excluded_units, '0');
  assert.equal(snapshots[0].spendable_units, '100000');
  assert.equal(snapshots[0].daily_reward_units, '1000');
  assert.equal(snapshots[0].reward_policy_bps, 100);
  assert.equal(snapshots[0].status, 'verified');
  assert.match(snapshots[0].snapshot_digest, /^[0-9a-f]{64}$/);
  const audit = f.sqlite.prepare(
    "SELECT reason FROM tag_run_v2_audit WHERE event_type='snapshot_verified'"
  ).get();
  const evidence = JSON.parse(audit.reason);
  assert.equal(evidence.cutoff_block, CUTOFF);
  assert.equal(evidence.approved_assets[0].state_block, STATE_BLOCK);
  assert.equal(evidence.quarantined_assets_excluded, 1);
  assert.equal(rpc.calls.filter(call => call.url.includes('/get_deltas?')).length, 2);
  assert(rpc.calls.every(call => !/push_transaction|sign_transaction/.test(call.url)));

  f.sqlite.prepare(
    'INSERT INTO tag_run_v2_capture_cursors (chat_id,last_completed_day_key) VALUES (?,?)'
  ).run(GROUP, DAY);
  f.sqlite.prepare(
    'INSERT INTO tag_run_v2_participation ' +
    '(chat_id,day_key,telegram_id,earned_weight,source_receipts_digest) ' +
    'VALUES (?,?,?,?,?)'
  ).run(GROUP, DAY, ADMIN, 10, 'e'.repeat(64));
  f.sqlite.exec("UPDATE tag_run_v2_pool_config SET status='review_only'");
  const input = await loadDrawInputs(f.DB, GROUP, DAY);
  assert.deepEqual(input.snapshots.map(row => row.asset_key), [ASSET]);
  assert.deepEqual(input.deposits.map(row => row.global_action_seq), []);
  assert.equal(input.snapshots[0].daily_reward_units, '1000');
});

test('approved wallet balance is eligible without per-tip provenance', async t => {
  const f = fixture(t);
  await addReceipt(f, { status: 'confirmed_donation', units: '100000' });
  addConfirmedPayout(f, { units: '1000' });
  await addReceipt(f, {
    sequence: '124', status: 'quarantined', units: '1000'
  });
  const result = await admin(f, 'poolsnapshot',
    DAY + ' spent-backing-review-1697');
  assert.match(result.messages[0], /VERIFIED IRREVERSIBLE 1% SNAPSHOT SET/);
  const snapshot = f.sqlite.prepare(
    'SELECT onchain_units,allocated_unpaid_units,excluded_units,' +
    'spendable_units,daily_reward_units FROM tag_run_v2_snapshots ' +
    'WHERE chat_id=? AND day_key=? AND asset_key=?'
  ).get(GROUP, DAY, ASSET);
  assert.deepEqual({ ...snapshot }, {
    onchain_units: '100000', allocated_unpaid_units: '0',
    excluded_units: '0', spendable_units: '100000',
    daily_reward_units: '1000'
  });
  const audit = JSON.parse(f.sqlite.prepare(
    "SELECT reason FROM tag_run_v2_audit WHERE event_type='snapshot_verified'"
  ).get().reason);
  assert.equal(audit.approved_assets[0].confirmed_spent_units, '1000');
});

test('access control remains private-admin and provider disagreement blocks snapshots', async t => {
  const f = fixture(t);
  await addReceipt(f);
  for (const access of [
    { isAdmin: false, isPrivate: true },
    { isAdmin: true, isPrivate: false }
  ]) {
    const rpc = network();
    const result = await admin(f, 'pooldonation', '', {
      ...access, fetchImpl: rpc.fetchImpl
    });
    assert.match(result.messages[0], /authorised bot DMs/);
    assert.equal(rpc.calls.length, 0);
  }
  const deprecated = await admin(f, 'pooldonation', '');
  assert.match(deprecated.messages[0], /Individual tip approval is not required/);
  assert.equal(f.sqlite.prepare(
    "SELECT status FROM tag_run_v2_deposits WHERE global_action_seq='123'"
  ).get().status, 'quarantined');

  const mismatch = await admin(f, 'poolsnapshot', DAY + ' review-1697', {
    fetchImpl: network({ mismatchHistory: true }).fetchImpl
  });
  assert.match(mismatch.messages[0], /did not agree/);
  assert.equal(f.sqlite.prepare(
    'SELECT COUNT(*) AS n FROM tag_run_v2_snapshots'
  ).get().n, 0);
});

test('snapshot rows and audit roll back together and a saved day is never replaced', async t => {
  const f = fixture(t);
  await addReceipt(f, { status: 'confirmed_donation' });
  f.sqlite.exec(
    "CREATE TRIGGER fail_snapshot_audit BEFORE INSERT ON tag_run_v2_audit " +
    "WHEN NEW.event_type='snapshot_verified' BEGIN " +
    "SELECT RAISE(ABORT,'forced snapshot audit failure'); END;"
  );
  const failed = await admin(f, 'poolsnapshot', DAY + ' rollback-review-1697');
  assert.match(failed.messages[0], /failed atomically/);
  assert.equal(f.sqlite.prepare(
    'SELECT COUNT(*) AS n FROM tag_run_v2_snapshots'
  ).get().n, 0);
  f.sqlite.exec('DROP TRIGGER fail_snapshot_audit');
  await admin(f, 'poolsnapshot', DAY + ' first-review-1697');
  const before = f.sqlite.prepare('SELECT * FROM tag_run_v2_snapshots').get();
  const retryRpc = network({ unavailable: true });
  const retry = await admin(f, 'poolsnapshot', DAY + ' second-review-1697', {
    fetchImpl: retryRpc.fetchImpl
  });
  assert.match(retry.messages[0], /already exists/);
  assert.equal(retryRpc.calls.length, 0);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM tag_run_v2_snapshots').get(), before);
});

test('receipt status changes do not revoke an approved token snapshot', async t => {
  const f = fixture(t);
  await addReceipt(f, { status: 'confirmed_donation' });
  const batch = f.env.DB.batch.bind(f.env.DB);
  let changed = false;
  f.env.DB.batch = async statements => {
    if (!changed) {
      changed = true;
      f.sqlite.prepare(
        "UPDATE tag_run_v2_deposits SET status='refund_review' " +
        "WHERE global_action_seq='123'"
      ).run();
    }
    return batch(statements);
  };
  const result = await admin(f, 'poolsnapshot', DAY + ' race-review-1697');
  assert.match(result.messages[0], /VERIFIED IRREVERSIBLE 1% SNAPSHOT SET/);
  assert.equal(f.sqlite.prepare(
    'SELECT COUNT(*) AS n FROM tag_run_v2_snapshots'
  ).get().n, 1);
  assert.equal(f.sqlite.prepare(
    "SELECT status FROM tag_run_v2_deposits WHERE global_action_seq='123'"
  ).get().status, 'refund_review');
});

test('funding controls reject malformed selectors and any enabled payout gate', async t => {
  const f = fixture(t);
  for (const [name, args] of [
    ['poolsnapshot', '2026-02-30 review-1697'],
    ['poolsnapshot', '2026-11-12 review-1697']
  ]) {
    const result = await admin(f, name, args);
    assert.match(result.messages[0], name === 'poolsnapshot' &&
      args.startsWith('2026-11-12') ? /completed UTC day/ : /Usage:/);
  }
  await addReceipt(f);
  f.env.TAG_RUN_V2_PAYOUTS_ENABLED = 'true';
  const rpc = network();
  const deprecated = await admin(f, 'pooldonation', '', {
    fetchImpl: rpc.fetchImpl
  });
  assert.match(deprecated.messages[0], /Individual tip approval is not required/);
  assert.equal(rpc.calls.length, 0);
});
