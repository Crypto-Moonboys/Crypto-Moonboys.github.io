import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildDailyLoopState,
  handleDailyLoopStateRoute,
  summarizeDailyLoopHealth,
} from '../workers/moonboys-api/routes/daily-loop-state.js';

const workerSrc = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const routeSrc = fs.readFileSync(new URL('../workers/moonboys-api/routes/daily-loop-state.js', import.meta.url), 'utf8');

const REQUIRED_SOURCE_KEYS = [
  'identity',
  'sam_status',
  'faction_state',
  'daily_missions',
  'wiki_missions',
  'arcade_daily_state',
  'battle_chamber_activity',
  'daily_wtf_status',
  'missed_opportunities',
  'telegram_digest_group_status',
];

const VALID_SOURCE_STATES = new Set([
  'live',
  'live_empty',
  'preview',
  'migration_pending',
  'query_failed',
  'unavailable',
]);

function makeMockDb({ existingTables = [] } = {}) {
  const tables = new Set(existingTables);
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return makeStatement(sql, params, tables);
        },
        first() {
          return makeStatement(sql, [], tables).first();
        },
        all() {
          return makeStatement(sql, [], tables).all();
        },
      };
    },
  };
}

function makeStatement(sql, params, tables) {
  return {
    async first() {
      if (String(sql).includes('sqlite_master')) {
        const tableName = params[0];
        return tables.has(tableName) ? { name: tableName } : null;
      }
      return null;
    },
    async all() {
      return { results: [] };
    },
  };
}

function functionBlock(source, name, asyncPrefix = false) {
  const needle = `${asyncPrefix ? 'async ' : ''}function ${name}(`;
  const start = source.indexOf(needle);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf(') {', start);
  assert.notEqual(bodyStart, -1, `${name} must have a body`);
  let depth = 0;
  let opened = false;
  for (let i = bodyStart + 2; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') {
      depth += 1;
      opened = true;
    } else if (char === '}') {
      depth -= 1;
      if (opened && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

function assertDailyLoopShape(state) {
  assert.equal(state.ok, true, 'daily-loop state should be ok');
  for (const key of [
    'utc_day',
    'current_utc_day_started_at',
    'next_utc_reset_at',
    'seconds_until_reset',
    'source_status',
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(state, key), `state must include ${key}`);
  }
  assert.equal(typeof state.utc_day, 'string', 'utc_day must be a string');
  assert.equal(typeof state.next_utc_reset_at, 'string', 'next_utc_reset_at must be a string');
  assert.equal(typeof state.seconds_until_reset, 'number', 'seconds_until_reset must be a number');
  for (const key of REQUIRED_SOURCE_KEYS) {
    assert.ok(state.source_status[key], `source_status must include ${key}`);
    assert.ok(VALID_SOURCE_STATES.has(state.source_status[key].state), `${key} source status must be known`);
  }
}

assert.ok(routeSrc.includes("path !== '/daily-loop/state'"), '/daily-loop/state route guard must exist');
assert.ok(workerSrc.includes("import { buildDailyLoopState, handleDailyLoopStateRoute } from './routes/daily-loop-state.js';"), 'Worker must import daily-loop route handler');
assert.ok(workerSrc.includes('handleDailyLoopStateRoute(request, env'), 'Worker fetch path must delegate daily-loop requests to handleDailyLoopStateRoute');

assert.ok(routeSrc.includes("request.method === 'GET'"), 'daily-loop route must keep a GET branch');
assert.ok(routeSrc.includes("'POST'"), 'daily-loop route must keep POST support');
assert.ok(routeSrc.includes('verifyTelegramIdentityFromBody'), 'daily-loop POST must keep Telegram auth verification');

const offlineState = await buildDailyLoopState({
  DB: makeMockDb(),
}, { now: '2026-06-30T12:34:56.000Z' });
assertDailyLoopShape(offlineState);

const offlineHealth = summarizeDailyLoopHealth(offlineState);
assert.equal(offlineHealth.utc_day, offlineState.utc_day, 'health summary keeps utc_day');
assert.equal(offlineHealth.seconds_until_reset, offlineState.seconds_until_reset, 'health summary keeps reset countdown');
assert.equal(offlineHealth.linked, false, 'offline public state is not linked');
assert.ok(offlineHealth.source_status_summary, 'health summary includes source status summary');
for (const key of REQUIRED_SOURCE_KEYS) {
  assert.ok(key in offlineHealth.source_status_summary, `health summary includes ${key}`);
}

const debugResponse = await handleDailyLoopStateRoute(
  new Request('https://moonboys-api.test/daily-loop/state?debug=1', { method: 'GET' }),
  { DB: makeMockDb() },
  {
    json(payload) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    err(message, status = 500) {
      return new Response(JSON.stringify({ ok: false, error: message }), { status });
    },
  },
);
assert.equal(debugResponse.status, 200, 'debug GET should return 200 in mock mode');
const debugPayload = await debugResponse.json();
assertDailyLoopShape(debugPayload);
assert.ok(debugPayload.debug, '?debug=1 should include compact debug health');
assert.deepEqual(Object.keys(debugPayload.debug).sort(), [
  'linked',
  'live_count',
  'migration_pending_count',
  'preview_count',
  'query_failed_count',
  'seconds_until_reset',
  'source_status_summary',
  'unavailable_count',
  'utc_day',
].sort(), 'debug summary must expose only safe aggregate keys');
assert.equal(JSON.stringify(debugPayload.debug).includes('telegram_auth'), false, 'debug summary must not expose Telegram auth');
assert.equal(JSON.stringify(debugPayload.debug).includes('metadata_json'), false, 'debug summary must not expose raw metadata_json');

const sourceFormatter = functionBlock(workerSrc, 'formatSourceStatusForTelegram');
assert.ok(!sourceFormatter.includes('LIVE'), 'Telegram source formatter must not print LIVE for fallback states');
for (const expected of ['preview/scheduled', 'no activity yet', 'migration pending', 'sync unavailable', 'unavailable']) {
  assert.ok(sourceFormatter.includes(expected), `Telegram source formatter must include honest copy: ${expected}`);
}

const liveBaseUrl = process.env.DAILY_LOOP_LIVE_BASE_URL;
if (liveBaseUrl) {
  const liveUrl = `${String(liveBaseUrl).replace(/\/$/, '')}/daily-loop/state`;
  const res = await fetch(liveUrl, { method: 'GET' });
  assert.equal(res.status, 200, `live daily-loop GET should return 200 from ${liveUrl}`);
  const payload = await res.json();
  assert.equal(payload.ok, true, 'live daily-loop payload should be ok');
  assert.equal(typeof payload.utc_day, 'string', 'live payload must include utc_day');
  assert.equal(typeof payload.next_utc_reset_at, 'string', 'live payload must include next reset');
  assert.equal(typeof payload.seconds_until_reset, 'number', 'live payload must include numeric reset countdown');
  assert.ok(payload.source_status && typeof payload.source_status === 'object', 'live payload must include source_status');
  for (const [key, status] of Object.entries(payload.source_status)) {
    assert.ok(status?.state, `live source_status.${key}.state must not be empty`);
    assert.ok(VALID_SOURCE_STATES.has(status.state), `live source_status.${key}.state must be known`);
  }
  console.log(`daily-loop-live-smoke live GET passed: ${liveUrl}`);
} else {
  console.log('daily-loop-live-smoke live GET skipped: DAILY_LOOP_LIVE_BASE_URL not set');
}

console.log('daily-loop-live-smoke tests passed');
