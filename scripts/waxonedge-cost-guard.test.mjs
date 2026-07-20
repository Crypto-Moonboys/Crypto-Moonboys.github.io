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
    route.includes('WAXONEDGE_CANDLE_BACKFILL_CRON_HOUR_INTERVAL') &&
    route.includes('candle_backfill_runs_every_6_hours_in_free_safe_mode'),
  'free-safe scheduled work must rotate quarter-hour tasks and throttle candle planning',
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
