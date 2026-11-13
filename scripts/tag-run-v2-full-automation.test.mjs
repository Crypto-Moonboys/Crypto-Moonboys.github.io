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

test('automatic release still fails closed without its encrypted secrets', async () => {
  await assert.rejects(runAutomaticCommunityPot({}), /release_not_authorized/);
  const config = read('workers/moonboys-api/wrangler.toml');
  assert.match(config, /TAG_RUN_V2_OBSERVATION_ENABLED = "false"/);
  assert.match(config, /TAG_RUN_V2_DRAWS_ENABLED = "true"/);
  assert.match(config, /TAG_RUN_V2_PAYOUTS_ENABLED = "true"/);
  assert.match(config, /TAG_RUN_V2_AUTOMATION_ENABLED = "true"/);
  assert.match(config, /TAG_RUN_V2_AUTOMATION_RELEASE_APPROVED = "true"/);
  assert.doesNotMatch(config, /TAG_RUN_V2_ACTIVE_PRIVATE_KEY\s*=/);
  assert.doesNotMatch(config, /TAG_RUN_V2_AUTOMATION_SEED_KEY\s*=/);
});


test('automatic queue stages are isolated and rotate blocked obligations', () => {
  const automation = read(
    'workers/moonboys-api/tag-run/v2-automation.js'
  );
  const runner = automation.slice(
    automation.indexOf('export async function runAutomaticCommunityPot')
  );
  assert.ok(runner.indexOf("'reconcile'") < runner.indexOf("'daily_setup'"));
  for (const step of [
    'reconcile', 'close_finished_cap', 'daily_setup', 'advance_draw',
    'create_or_open_cap', 'reserve', 'broadcast'
  ]) {
    assert.match(runner, new RegExp("runIsolatedStep\\(result, '" + step + "'"));
  }

  // A newer cap is not opened while an older cap or unresolved intent for the
  // same asset exists. A race with the D1 overlap trigger is treated as wait.
  assert.match(automation, /waiting_for_prior_asset_obligations/);
  assert.match(automation, /other\.paused=0 OR EXISTS/);
  assert.match(automation, /oi\.status IN \('reserved','broadcast_unknown','reconciliation_review'\)/);

  // Unknown submissions are retried only as the exact frozen transaction,
  // expire into reconciliation-only state, and never prevent a reserved item
  // for another approved/open asset from being selected in the same tick.
  assert.match(automation, /expired_reconciliation_only/);
  assert.match(automation, /SET status='reconciliation_review'/);
  assert.match(automation, /status: 'same_transaction_rebroadcast'/);
  assert.match(automation, /WHERE i\.status='reserved' AND a\.eligibility='approved' AND c\.paused=0/);
  assert.match(automation, /status: 'queue_serviced', outcomes/);

  // Reconciliation and same-ID rebroadcast use independent clocks: a failed
  // finality lookup rotates fairly without suppressing the frozen-tx retry.
  assert.match(automation, /reconcile_after<=CURRENT_TIMESTAMP/);
  assert.match(automation, /SET reconcile_after=datetime\('now','\+4 minutes'\)/);
  assert.match(automation, /updated_at<=datetime\('now','-4 minutes'\)/);
  assert.match(automation, /reconciliation_retry_conflict/);
});

test('migration pins contracts and freezes one signed transaction before push', () => {
  const migration = read(
    'workers/moonboys-api/migrations/109_tag_run_v2_full_automation.sql'
  );
  for (const token of [
    'approved_code_hash', 'approved_abi_hash', 'submission_tx_id',
    'signed_transaction_json', 'reconcile_after',
    'v2_asset_contract_pin_required',
    'v2_payout_intent_immutable', "SET status='review_only'"
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
  const service = read('workers/moonboys-api/tag-run/v2-service.js');
  assert.match(service, /UPDATE tag_run_v2_payout_caps SET paused=1/);
  assert.match(service, /COMMUNITY POT EMERGENCY PAUSE ACTIVE/);
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
