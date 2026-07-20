import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const route = readFileSync(new URL('../workers/moonboys-api/routes/waxonedge.js', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../workers/moonboys-api/wrangler.toml', import.meta.url), 'utf8');

assert.ok(
  wrangler.includes('crons = ["*/15 * * * *", "*/5 * * * *", "0 9 * * *"]'),
  'production WaxOnEdge cron must run on a quarter-hour cadence, not every minute',
);

assert.ok(
  worker.includes("cron === '*/15 * * * *'"),
  'moonboys-api scheduled handler must route the quarter-hour WaxOnEdge cron',
);

assert.ok(
  route.includes('minute % 15 !== 0') &&
    route.includes('WaxOnEdge free-safe cron is gated to quarter-hour work slices'),
  'legacy minute cron must be gated to quarter-hour work slices in free-safe mode',
);

assert.ok(
  route.includes('const rotationSlot = Math.floor(minute / 15) % 4') &&
    route.includes('legacy_ohlc_candle_generation_disabled') &&
    !route.includes('buildInternalDailyCandlesForPair(env.DB, pair)') &&
    !route.includes('const candleBackfill = await planWaxOnEdgeCandleBackfill(env);'),
  'free-safe scheduled work must rotate quarter-hour tasks without scheduled candle planning',
);

assert.ok(
  !route.includes('INSERT INTO waxonedge_chart_candles'),
  'active Worker code must not write legacy OHLC candles',
);

assert.ok(
  route.includes('INSERT OR IGNORE INTO waxonedge_price_snapshots') &&
    route.includes('priceSnapshotChanged') &&
    route.includes('waxonedge_price_snapshots'),
  'WaxOnEdge history must use lightweight price snapshots with meaningful-change gating',
);

assert.ok(
  route.includes("cron === 'waxonedge-candle-backfill'") &&
    route.includes('no_trade_scan') &&
    route.includes('no_new_candle_rows'),
  'legacy candle cron entrypoint must be a disabled no-op guard',
);

for (const tableName of ['waxonedge_pairs', 'waxonedge_tokens', 'waxonedge_token_stats']) {
  assert.ok(
    route.includes(`WHERE ${tableName}.`) || route.includes(`WHERE ${tableName} `),
    `${tableName} UPSERT/UPDATE statements must include no-op guards`,
  );
}

assert.ok(
  route.includes("if (status === 'skipped') return;"),
  'skipped WaxOnEdge sync runs must not append D1 audit rows',
);

assert.ok(
  route.includes('existing?.payload_json === payloadJson'),
  'WaxOnEdge snapshots must avoid rewriting unchanged payloads',
);

assert.ok(
  !route.includes('SELECT COUNT(*) FROM waxonedge_pairs\n           WHERE (token_a_contract = ? AND token_a_symbol = ?)'),
  'aggregate token updates must not run a per-token pair_count subquery',
);

console.log('WaxOnEdge cost guard tests PASSED.');
