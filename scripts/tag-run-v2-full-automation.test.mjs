import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assetKey, WAX_MAINNET_CHAIN_ID } from
  '../workers/moonboys-api/tag-run/v2-core.js';
import { phase5CronTasks, MOONBOYS_CRON } from
  '../workers/moonboys-api/scheduled/phase5-cron-plan.js';
import { buildReviewedWaxTransfer, PAYOUT_EXECUTOR_AUTO_ENABLED } from
  '../workers/moonboys-api/tag-run/v2-payout-executor.js';
import { runAutomaticCommunityPot } from
  '../workers/moonboys-api/tag-run/v2-automation.js';
import { prepareActiveKeyTransaction, broadcastPreparedTransaction } from
  '../workers/moonboys-api/tag-run/v2-active-key-signer.js';
import { PrivateKey } from '@wharfkit/antelope';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('automation cron remains behind both explicit release switches', () => {
  const base = {
    TAG_RUN_ENABLED: 'true',
    TAG_RUN_V2_AUTOMATION_ENABLED: 'true',
    TAG_RUN_V2_AUTOMATION_RELEASE_APPROVED: 'false'
  };
  assert.equal(phase5CronTasks({ cron: MOONBOYS_CRON.timed }, base).automationTick, false);
  base.TAG_RUN_V2_AUTOMATION_RELEASE_APPROVED = 'true';
  assert.equal(phase5CronTasks({ cron: MOONBOYS_CRON.timed }, base).automationTick, true);
  assert.equal(phase5CronTasks({ cron: MOONBOYS_CRON.bulletin }, base).automationTick, false);
});

test('active-key transfer is exact and never defaults from caller data', () => {
  assert.equal(PAYOUT_EXECUTOR_AUTO_ENABLED, true);
  const intent = {
    status: 'reserved', intent_key: 'a'.repeat(64),
    receiving_account: 'gkniftyheads',
    asset_key: assetKey('kingsofgraff', 'LFGK', 4),
    amount_units: '12345'
  };
  const request = buildReviewedWaxTransfer(intent, { permission: 'active' });
  assert.equal(request.chainId, WAX_MAINNET_CHAIN_ID);
  assert.deepEqual(request.action.authorization, [{
    actor: 'isthatajoint', permission: 'active'
  }]);
  assert.deepEqual(request.action.data, {
    from: 'isthatajoint', to: 'gkniftyheads',
    quantity: '1.2345 LFGK',
    memo: 'TAG RUN V2 ' + intent.intent_key.slice(0, 20)
  });
});

test('automatic runner fails closed without flags and encrypted secrets', async () => {
  await assert.rejects(runAutomaticCommunityPot({}), /release_not_authorized/);
  const config = read('workers/moonboys-api/wrangler.toml');
  assert.match(config, /TAG_RUN_V2_AUTOMATION_ENABLED = "false"/);
  assert.match(config, /TAG_RUN_V2_AUTOMATION_RELEASE_APPROVED = "false"/);
  assert.doesNotMatch(config, /TAG_RUN_V2_ACTIVE_PRIVATE_KEY\s*=/);
  assert.doesNotMatch(config, /TAG_RUN_V2_AUTOMATION_SEED_KEY\s*=/);
});

test('migration pins contracts and freezes one signed transaction before push', () => {
  const migration = read(
    'workers/moonboys-api/migrations/109_tag_run_v2_full_automation.sql'
  );
  for (const token of [
    'approved_code_hash', 'approved_abi_hash', 'submission_tx_id',
    'signed_transaction_json', 'v2_asset_contract_pin_required',
    'v2_payout_intent_immutable'
  ]) assert.match(migration, new RegExp(token));
  const signer = read(
    'workers/moonboys-api/tag-run/v2-active-key-signer.js'
  );
  assert.match(signer, /TAG RUN V2/);
  assert.doesNotMatch(signer, /console\.(?:log|warn|error)\s*\(/);
  const automation = read(
    'workers/moonboys-api/tag-run/v2-automation.js'
  );
  assert.match(automation, /stagePreparedAutomaticPayout/);
  assert.match(automation, /discoverAndVerifyIrreversibleWaxPayout/);
});


test('active-key signer persists and broadcasts the exact packed transaction', async () => {
  const privateKey = PrivateKey.generate('K1');
  const publicKey = privateKey.toPublic();
  const publicKeys = [String(publicKey), publicKey.toLegacyString()];
  let expectedTransactionId = null;
  let pushed = null;
  const info = {
    server_version: 'test', chain_id: WAX_MAINNET_CHAIN_ID,
    head_block_num: 1000, last_irreversible_block_num: 990,
    last_irreversible_block_id: '000003de' + '22'.repeat(28),
    head_block_id: '000003e8' + '11'.repeat(28),
    head_block_time: '2026-11-12T23:00:00.000',
    head_block_producer: 'testproducer', virtual_block_cpu_limit: 1000000,
    virtual_block_net_limit: 1000000, block_cpu_limit: 100000,
    block_net_limit: 100000
  };
  const fetchImpl = async (url, options = {}) => {
    const method = String(url).split('/').at(-1);
    if (method === 'get_info') return Response.json(info);
    if (method === 'get_account') return Response.json({
      account_name: 'isthatajoint', permissions: [{
        perm_name: 'active', parent: 'owner', required_auth: {
          threshold: 1,
          keys: [{ key: publicKeys[0], weight: 1 }],
          accounts: [], waits: []
        }
      }]
    });
    if (method === 'push_transaction') {
      pushed = JSON.parse(String(options.body));
      return Response.json({ transaction_id: expectedTransactionId });
    }
    throw new Error('unexpected mock WAX endpoint: ' + url);
  };
  const intent = {
    status: 'reserved', intent_key: 'b'.repeat(64),
    receiving_account: 'gkniftyheads',
    asset_key: assetKey('kingsofgraff', 'LFGK', 4),
    amount_units: '12345'
  };
  const request = buildReviewedWaxTransfer(intent, { permission: 'active' });
  const prepared = await prepareActiveKeyTransaction({
    request, privateKey: String(privateKey), fetchImpl
  });
  expectedTransactionId = prepared.transactionId;
  assert.match(prepared.transactionId, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(prepared.signedTransactionJson, new RegExp(String(privateKey)));
  let checked = 0;
  const result = await broadcastPreparedTransaction({
    ...prepared, fetchImpl,
    beforeBroadcast: async () => { checked += 1; }
  });
  assert.equal(checked, 1);
  assert.equal(result.transactionId, prepared.transactionId);
  assert.equal(result.submitted, true);
  assert.match(pushed.packed_trx, /^[0-9a-f]+$/);
  assert.equal(Array.isArray(pushed.signatures), true);
  assert.equal(pushed.signatures.length, 1);
});
