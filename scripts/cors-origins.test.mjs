/**
 * CORS origins alignment test.
 *
 * Verifies that:
 *  1. moonboys-api Worker DEFAULT_CORS_ALLOWED_ORIGINS contains all 3 production HTTPS origins.
 *  2. moonboys-api runtime fetch() reflects each allowed origin and does NOT reflect unknown origins.
 *  3. moonboys-api runtime CORS responses include Vary: Origin to prevent cache mixups.
 *  4. moonboys-api CORS_ALLOWED_ORIGINS env override still replaces the default list.
 *  5. Block Topia server default ALLOWED_ORIGINS contains all 3 production HTTPS origins.
 *  6. Block Topia server CORS_ORIGIN env override still replaces the default list.
 *  7. Block Topia server allows localhost in non-production (IS_PRODUCTION = false) mode.
 *  8. js/api-config.js PRODUCTION_HOSTS recognises all 3 production hostnames.
 *  9. blocktopia-district worker source still advertises X-Admin-Secret (browser-facing admin PUT routes).
 * 10. Other narrowed workers (anti-cheat, leaderboard, engagement, realtime) do not advertise X-Admin-Secret.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFile(path.join(ROOT, rel), 'utf8');

const PRODUCTION_ORIGINS = [
  'https://cryptomoonboys.com',
  'https://www.cryptomoonboys.com',
  'https://crypto-moonboys.github.io',
];

const PRODUCTION_HOSTS = [
  'cryptomoonboys.com',
  'www.cryptomoonboys.com',
  'crypto-moonboys.github.io',
];

// ── helpers ───────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${label}`);
    pass++;
  } catch (err) {
    console.error(`  [FAIL] ${label}`);
    console.error(`         ${err.message}`);
    fail++;
  }
}

// ── 1. Worker source: DEFAULT_CORS_ALLOWED_ORIGINS ───────────────────────────

console.log('\n[1] moonboys-api DEFAULT_CORS_ALLOWED_ORIGINS contains all 3 production HTTPS origins');

const workerSrc = await read('workers/moonboys-api/worker.js');

// Extract the array literal from DEFAULT_CORS_ALLOWED_ORIGINS
const defaultCorsMatch = workerSrc.match(/const DEFAULT_CORS_ALLOWED_ORIGINS\s*=\s*\[([\s\S]*?)\];/);
assert.ok(defaultCorsMatch, 'DEFAULT_CORS_ALLOWED_ORIGINS not found in worker.js');
const defaultCorsBlock = defaultCorsMatch[1];
const workerDefaultOrigins = [...defaultCorsBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);

for (const origin of PRODUCTION_ORIGINS) {
  await test(`Worker default list includes ${origin}`, () => {
    assert.ok(workerDefaultOrigins.includes(origin),
      `DEFAULT_CORS_ALLOWED_ORIGINS is missing ${origin}. Found: ${JSON.stringify(workerDefaultOrigins)}`);
  });
}

// ── 2. Worker runtime fetch: reflects allowed origins, does not reflect unknown ──

console.log('\n[2] moonboys-api runtime fetch() reflects each allowed origin / rejects unknown');

const { default: worker } = await import(pathToFileURL(path.join(ROOT, 'workers/moonboys-api/worker.js')).href);
assert.ok(worker && typeof worker.fetch === 'function', 'worker.js must export a default fetch handler');

async function workerHealth(origin, env = {}) {
  const headers = origin ? { Origin: origin } : {};
  const req = new Request('https://api.cryptomoonboys.com/health', { headers });
  return worker.fetch(req, env);
}

async function workerPreflight(origin, requestHeaders = 'Content-Type', env = {}) {
  const headers = {
    Origin: origin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': requestHeaders,
  };
  const req = new Request('https://api.cryptomoonboys.com/admin/blocktopia/grant-xp', {
    method: 'OPTIONS',
    headers,
  });
  return worker.fetch(req, env);
}

for (const origin of PRODUCTION_ORIGINS) {
  await test(`worker.fetch reflects allowed origin: ${origin}`, async () => {
    const res = await workerHealth(origin);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(res.headers.get('Vary'), 'Origin');
  });
}

await test('worker.fetch does NOT reflect unknown origin', async () => {
  const res = await workerHealth('https://evil.example.com');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(res.headers.get('Vary'), 'Origin');
});

await test('worker CORS allow-headers keeps Content-Type and removes admin-secret names', async () => {
  const res = await workerHealth(PRODUCTION_ORIGINS[0]);
  const allowHeaders = String(res.headers.get('Access-Control-Allow-Headers') || '');
  const normalized = allowHeaders.toLowerCase();
  assert.ok(normalized.includes('content-type'), `Content-Type must remain allowed. Found: ${allowHeaders}`);
  assert.equal(normalized.includes('x-admin-secret'), false, `x-admin-secret must not be browser-allowed. Found: ${allowHeaders}`);
});

await test('worker OPTIONS preflight still works for Content-Type application/json requests', async () => {
  const res = await workerPreflight(PRODUCTION_ORIGINS[0], 'Content-Type');
  assert.equal(res.status, 204);
  const allowHeaders = String(res.headers.get('Access-Control-Allow-Headers') || '');
  assert.ok(
    allowHeaders.toLowerCase().includes('content-type'),
    `OPTIONS preflight must allow Content-Type. Found: ${allowHeaders}`,
  );
  assert.equal(res.headers.get('Vary'), 'Origin');
});

// ── 3. Worker CORS_ALLOWED_ORIGINS env override ───────────────────────────────

console.log('\n[3] moonboys-api CORS_ALLOWED_ORIGINS env override replaces default list');

await test('env override: single custom origin is reflected', async () => {
  const custom = 'https://staging.example.com';
  const res = await workerHealth(custom, { CORS_ALLOWED_ORIGINS: custom });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), custom);
  assert.equal(res.headers.get('Vary'), 'Origin');
});

await test('env override: production origins are NOT reflected when override is set to different value', async () => {
  const custom = 'https://staging.example.com';
  for (const origin of PRODUCTION_ORIGINS) {
    const res = await workerHealth(origin, { CORS_ALLOWED_ORIGINS: custom });
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), null,
      `Production origin '${origin}' must not be reflected when override is '${custom}'`);
    assert.equal(res.headers.get('Vary'), 'Origin');
  }
});

await test('worker.js uses env.CORS_ALLOWED_ORIGINS to build allowed list', () => {
  assert.ok(
    workerSrc.includes('env.CORS_ALLOWED_ORIGINS') || workerSrc.includes('env && env.CORS_ALLOWED_ORIGINS'),
    'worker.js must read CORS_ALLOWED_ORIGINS from env'
  );
});

// ── 4. Block Topia server: default ALLOWED_ORIGINS ───────────────────────────

console.log('\n[4] Block Topia server default ALLOWED_ORIGINS contains all 3 production HTTPS origins');

const serverSrc = await read('server/block-topia/src/index.js');

// Extract default ALLOWED_ORIGINS array (the branch when rawCorsOrigins is falsy)
const allowedMatch = serverSrc.match(/const ALLOWED_ORIGINS\s*=\s*rawCorsOrigins[\s\S]*?:\s*\[([\s\S]*?)\];/);
assert.ok(allowedMatch, 'ALLOWED_ORIGINS default array not found in index.js');
const allowedBlock = allowedMatch[1];
const serverDefaultOrigins = [...allowedBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);

for (const origin of PRODUCTION_ORIGINS) {
  await test(`Block Topia default list includes ${origin}`, () => {
    assert.ok(serverDefaultOrigins.includes(origin),
      `ALLOWED_ORIGINS default is missing ${origin}. Found: ${JSON.stringify(serverDefaultOrigins)}`);
  });
}

// ── 5. Block Topia CORS_ORIGIN env override ───────────────────────────────────

console.log('\n[5] Block Topia CORS_ORIGIN env override replaces default list');

await test('server/index.js reads CORS_ORIGIN env var to build ALLOWED_ORIGINS', () => {
  assert.ok(serverSrc.includes('process.env.CORS_ORIGIN'),
    'server/block-topia/src/index.js must read CORS_ORIGIN from process.env');
});

await test('server/index.js splits CORS_ORIGIN on comma', () => {
  assert.ok(serverSrc.includes('.split(\',\')') || serverSrc.includes(".split(',')"),
    'server/block-topia/src/index.js must split CORS_ORIGIN on commas');
});

// ── 6. Block Topia localhost allowance in dev mode ────────────────────────────

console.log('\n[6] Block Topia server allows localhost in non-production mode');

await test('server/index.js has localhost/127.0.0.1 CORS allowance in dev path', () => {
  assert.ok(
    serverSrc.includes('localhost') && serverSrc.includes('127.0.0.1') && serverSrc.includes('IS_PRODUCTION'),
    'server/block-topia/src/index.js must allow localhost in non-production mode'
  );
});

await test('server/index.js guards localhost allowance with !IS_PRODUCTION', () => {
  assert.ok(
    serverSrc.includes('!IS_PRODUCTION'),
    'localhost CORS bypass must be guarded by !IS_PRODUCTION'
  );
});

// ── 8. js/api-config.js PRODUCTION_HOSTS ──────────────────────────────────────

console.log('\n[7] js/api-config.js PRODUCTION_HOSTS recognises all 3 production hostnames');

const apiConfigSrc = await read('js/api-config.js');

const hostsMatch = apiConfigSrc.match(/var PRODUCTION_HOSTS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
assert.ok(hostsMatch, 'PRODUCTION_HOSTS not found in js/api-config.js');
const hostsBlock = hostsMatch[1];
const configHosts = [...hostsBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);

for (const host of PRODUCTION_HOSTS) {
  await test(`api-config.js PRODUCTION_HOSTS includes '${host}'`, () => {
    assert.ok(configHosts.includes(host),
      `PRODUCTION_HOSTS is missing '${host}'. Found: ${JSON.stringify(configHosts)}`);
  });
}

// ── 9. Worker CORS allow-headers: per-worker audit ───────────────────────────

console.log('\n[9] Per-worker CORS allow-headers audit');

const districtSrc = await read('workers/blocktopia-district/worker.js');

await test('blocktopia-district CORS advertises X-Admin-Secret (browser-facing admin PUT routes)', () => {
  const allowHeadersMatch = districtSrc.match(/['"]Access-Control-Allow-Headers['"]\s*:\s*['"]([^'"]+)['"]/);
  assert.ok(allowHeadersMatch, 'Access-Control-Allow-Headers not found in blocktopia-district/worker.js');
  const allowHeaders = allowHeadersMatch[1].toLowerCase();
  assert.ok(
    allowHeaders.includes('x-admin-secret'),
    `blocktopia-district must advertise X-Admin-Secret for browser admin PUT routes. Found: ${allowHeadersMatch[1]}`,
  );
  assert.ok(
    allowHeaders.includes('content-type'),
    `blocktopia-district must still allow Content-Type. Found: ${allowHeadersMatch[1]}`,
  );
});

const narrowedWorkers = [
  { path: 'workers/anti-cheat/worker.js', name: 'anti-cheat' },
  { path: 'workers/blocktopia-leaderboard/worker.js', name: 'blocktopia-leaderboard' },
  { path: 'workers/blocktopia-engagement/worker.js', name: 'blocktopia-engagement' },
  { path: 'workers/blocktopia-realtime/worker.js', name: 'blocktopia-realtime' },
];

for (const { path: workerPath, name } of narrowedWorkers) {
  const src = await read(workerPath);
  await test(`${name} CORS does not advertise X-Admin-Secret (no browser-facing secret-only admin routes)`, () => {
    const allowHeadersMatch = src.match(/['"]Access-Control-Allow-Headers['"]\s*:\s*['"]([^'"]+)['"]/);
    assert.ok(allowHeadersMatch, `Access-Control-Allow-Headers not found in ${workerPath}`);
    const allowHeaders = allowHeadersMatch[1].toLowerCase();
    assert.equal(
      allowHeaders.includes('x-admin-secret'),
      false,
      `${name} must not advertise X-Admin-Secret in browser CORS. Found: ${allowHeadersMatch[1]}`,
    );
  });
}

// ── 11. DEPLOY_STATUS.json: stub-blocked workers must not be marked deployable ─

console.log('\n[11] DEPLOY_STATUS.json: stub-blocked workers are not marked deploy:true');

const deployStatusRaw = await read('workers/DEPLOY_STATUS.json');
const deployStatus = JSON.parse(deployStatusRaw);

for (const [folder, entry] of Object.entries(deployStatus)) {
  if (entry.status === 'stub-blocked') {
    await test(`${folder} is stub-blocked and deploy:false in DEPLOY_STATUS.json`, () => {
      assert.equal(entry.deploy, false,
        `${folder} is marked stub-blocked but deploy is not false`);
    });
  }
  if (entry.status === 'live-deployable') {
    await test(`${folder} is live-deployable and deploy:true in DEPLOY_STATUS.json`, () => {
      assert.equal(entry.deploy, true,
        `${folder} is marked live-deployable but deploy is not true`);
    });
  }
}

// ── 12. WORKER_DEPLOY_TRUTH_MAP.md: stub-blocked workers not listed as deployable ─

console.log('\n[12] WORKER_DEPLOY_TRUTH_MAP.md: stub-blocked workers not presented as deployable');

const truthMapSrc = await read('docs/WORKER_DEPLOY_TRUTH_MAP.md');

const stubBlockedFolders = Object.entries(deployStatus)
  .filter(([, e]) => e.status === 'stub-blocked')
  .map(([folder]) => folder);

for (const folder of stubBlockedFolders) {
  const workerName = folder.split('/').pop();
  await test(`${folder} — truth map shows stub-blocked, not live-deployable`, () => {
    // The truth map must contain stub-blocked marker for this worker
    assert.ok(
      truthMapSrc.includes('stub-blocked') && truthMapSrc.includes(workerName),
      `${folder} must appear in truth map as stub-blocked`,
    );
    // The truth map must not list it under "Deploy now? Yes"
    // Verify the row containing this worker name does not say "Yes" in the deploy column
    // (it should say **No**)
    const lines = truthMapSrc.split('\n');
    const workerRow = lines.find(l => l.includes(`workers/${workerName}`) && l.includes('stub-blocked'));
    assert.ok(workerRow, `${folder} must have a table row marked stub-blocked in truth map`);
    const cells = workerRow.split('|').map(cell => cell.trim()).filter(Boolean);
    const deployNowCell = cells[6] || '';
    assert.ok(
      /^\*{0,2}No\*{0,2}$/.test(deployNowCell),
      `${folder} stub-blocked row must say No in the Deploy now? column. Found row: ${workerRow?.trim()}`,
    );
  });
}

// ── summary ───────────────────────────────────────────────────────────────────

console.log('\n─── Result ──────────────────────────────────────────────────────');
console.log(`  Passes : ${pass}`);
console.log(`  Failures : ${fail}`);
console.log('─────────────────────────────────────────────────────────────────\n');

if (fail > 0) process.exit(1);
