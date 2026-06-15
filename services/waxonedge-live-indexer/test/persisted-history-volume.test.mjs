import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  createState,
  normalizePersistedTrade,
  saveObservedHistory,
  snapshotPayload,
} from '../src/index.mjs';

function tempHistoryPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waxonedge-live-history-'));
  return path.join(dir, 'history.json');
}

function persistedTrade(overrides = {}) {
  const now = new Date().toISOString();
  return {
    trade_id: 'persisted-negative-shil',
    source: 'swap.taco',
    stream_source: 'swap.taco::exchangelog',
    og_source: 'taco',
    pair_id: 'SHILWAX',
    contract: 'token.shil',
    symbol: 'SHIL',
    quote_contract: 'eosio.token',
    quote_symbol: 'WAX',
    price: 0.000001,
    volume: -29385.411838,
    side: 'swap',
    traded_at: now,
    observed_at: now,
    ...overrides,
  };
}

test('persisted negative trade volume loads as positive magnitude with derived direction', () => {
  const trade = normalizePersistedTrade(persistedTrade());

  assert.equal(trade.volume, 29385.411838);
  assert.equal(trade.direction, 'out');
  assert.ok(trade.volume >= 0);
});

test('persisted direction is preserved while volume is normalized', () => {
  const trade = normalizePersistedTrade(persistedTrade({
    direction: 'in',
    volume: -29385.411838,
  }));

  assert.equal(trade.volume, 29385.411838);
  assert.equal(trade.direction, 'in');
});

test('rehydrated snapshot and fresh-history metrics never expose signed persisted volume', () => {
  const historyPath = tempHistoryPath();
  const now = new Date().toISOString();
  fs.writeFileSync(historyPath, `${JSON.stringify({
    history_started_at: now,
    trades: [persistedTrade({
      trade_id: 'persisted-negative-shing',
      contract: 'token.shing',
      symbol: 'SHING',
      volume: -29385.411838,
      traded_at: now,
      observed_at: now,
    })],
  })}\n`);

  const state = createState({
    history_path: historyPath,
    hyperion_api: '',
    state_history_endpoint: '',
    waxnode_endpoint: '',
    stream_enabled: false,
    history_save_ms: 0,
    shared_secret_configured: false,
    secret_header: 'x-waxonedge-live-secret',
  });
  const snapshot = snapshotPayload(state);
  const row = snapshot.tokens.find((token) => token.symbol === 'SHING');

  assert.ok(row);
  assert.equal(row.last_trade_volume, 29385.411838);
  assert.equal(row.last_trade_direction, 'out');
  assert.ok(row.last_trade_volume >= 0);
  for (const field of [
    'fresh_history_volume_1h',
    'fresh_history_volume_24h',
    'fresh_history_volume_7d',
    'fresh_history_volume_30d',
  ]) {
    assert.equal(row[field], 29385.411838);
    assert.ok(row[field] >= 0, `${field} should be non-negative`);
  }
  assert.equal(snapshot.uses_fake_live_data, false);
});

test('saving rehydrated history persists normalized positive volume', async () => {
  const historyPath = tempHistoryPath();
  const now = new Date().toISOString();
  fs.writeFileSync(historyPath, `${JSON.stringify({
    history_started_at: now,
    trades: [persistedTrade({ traded_at: now, observed_at: now })],
  })}\n`);

  const state = createState({
    history_path: historyPath,
    hyperion_api: '',
    state_history_endpoint: '',
    waxnode_endpoint: '',
    stream_enabled: false,
    history_save_ms: 0,
    shared_secret_configured: false,
    secret_header: 'x-waxonedge-live-secret',
  });

  await saveObservedHistory(state);
  const saved = JSON.parse(fs.readFileSync(historyPath, 'utf8'));

  assert.equal(saved.trades[0].volume, 29385.411838);
  assert.equal(saved.trades[0].direction, 'out');
  assert.ok(saved.trades[0].volume >= 0);
});
