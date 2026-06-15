import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createState,
  normalizeLiveTradeRow,
  normalizeTradeVolume,
  observeLiveTrade,
  snapshotPayload,
  VERIFIED_TRADE_STREAMS,
} from '../src/index.mjs';

const tacoSwapStream = VERIFIED_TRADE_STREAMS.find((stream) => stream.source === 'swap.taco');

function swapRow(overrides = {}) {
  const { data: dataOverrides = {}, ...rowOverrides } = overrides;
  return {
    action: 'exchangelog',
    timestamp: '2026-06-15T10:00:00',
    transaction_id: 'negative-volume-regression',
    global_sequence: 731,
    data: {
      id: '42',
      contract: 'token.shil',
      quantity_in: '100.0000 SHIL',
      quantity_out: '-2.50000000 WAX',
      ...dataOverrides,
    },
    ...rowOverrides,
  };
}

test('negative AMM quantities become positive trade volume while preserving direction', () => {
  const trade = normalizeLiveTradeRow(swapRow(), tacoSwapStream);

  assert.equal(trade.symbol, 'SHIL');
  assert.equal(trade.quote_symbol, 'WAX');
  assert.equal(trade.volume, 2.5);
  assert.equal(trade.side, 'swap');
  assert.equal(trade.direction, 'out');
  assert.equal(trade.price, null);
});

test('snapshot rows never expose signed live volume from AMM trades', () => {
  const state = createState();
  const trade = normalizeLiveTradeRow(swapRow(), tacoSwapStream);

  observeLiveTrade(state, trade);
  const snapshot = snapshotPayload(state);
  const row = snapshot.tokens.find((token) => token.symbol === 'SHIL');

  assert.ok(row);
  assert.equal(row.last_trade_volume, 2.5);
  assert.ok(row.last_trade_volume >= 0);
  assert.equal(row.last_trade_direction, 'out');
  assert.equal(row.uses_fake_live_data, false);
  assert.equal(snapshot.uses_fake_live_data, false);
});

test('live update path normalizes signed volume before downstream rolling metrics aggregate it', () => {
  const state = createState();

  const update = observeLiveTrade(state, {
    trade_id: 'manual-negative-volume',
    source: 'swap.taco',
    stream_source: 'swap.taco::exchangelog',
    pair_id: '42',
    contract: 'token.shing',
    symbol: 'SHING',
    quote_contract: 'eosio.token',
    quote_symbol: 'WAX',
    price: 0.25,
    volume: -7.75,
    side: 'swap',
    direction: 'out',
    traded_at: '2026-06-15T10:01:00.000Z',
  });

  assert.equal(update.last_trade_volume, 7.75);
  assert.ok(update.last_trade_volume >= 0);
  assert.equal(update.last_trade_direction, 'out');
});

test('1D candle volume inputs use magnitude-only live volume', () => {
  const oneDayCandleVolume = ['-1.0000', -2.5, 0, '3.2500']
    .map(normalizeTradeVolume)
    .reduce((sum, volume) => sum + volume, 0);

  assert.equal(oneDayCandleVolume, 6.75);
  assert.ok(oneDayCandleVolume >= 0);
});

test('WAX token rows remain valid when signed AMM input is the selected volume side', () => {
  const trade = normalizeLiveTradeRow(swapRow({
    data: {
      contract: 'eosio.token',
      quantity_in: '-1.00000000 WAX',
      quantity_out: '250.0000 TLM',
    },
  }), tacoSwapStream);
  const state = createState();

  const update = observeLiveTrade(state, trade);

  assert.equal(trade.symbol, 'WAX');
  assert.equal(trade.volume, 1);
  assert.equal(trade.direction, 'out');
  assert.equal(update.token_key, 'eosio.token::WAX');
  assert.equal(update.last_trade_volume, 1);
  assert.ok(update.last_trade_volume >= 0);
});
