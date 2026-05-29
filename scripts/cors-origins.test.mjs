/**
 * CORS origins alignment test.
 *
 * Verifies that:
 *  1. moonboys-api Worker DEFAULT_CORS_ALLOWED_ORIGINS contains all 3 production HTTPS origins.
 *  2. moonboys-api runtime fetch() reflects each allowed origin and does NOT reflect unknown origins.
 *  3. moonboys-api CORS_ALLOWED_ORIGINS env override still replaces the default list.
 *  4. Block Topia server default ALLOWED_ORIGINS contains all 3 production HTTPS origins.
 *  5. Block Topia server CORS_ORIGIN env override still replaces the default list.
 *  6. Block Topia server allows localhost in non-production (IS_PRODUCTION = false) mode.
 *  7. js/api-config.js PRODUCTION_HOSTS recognises all 3 production hostnames.
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

for (const origin of PRODUCTION_ORIGINS) {
  await test(`worker.fetch reflects allowed origin: ${origin}`, async () => {
    const res = await workerHealth(origin);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), origin);
  });
}

await test('worker.fetch does NOT reflect unknown origin', async () => {
  const res = await workerHealth('https://evil.example.com');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

// ── 3. Worker CORS_ALLOWED_ORIGINS env override ───────────────────────────────

console.log('\n[3] moonboys-api CORS_ALLOWED_ORIGINS env override replaces default list');

await test('env override: single custom origin is reflected', async () => {
  const custom = 'https://staging.example.com';
  const res = await workerHealth(custom, { CORS_ALLOWED_ORIGINS: custom });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), custom);
});

await test('env override: production origins are NOT reflected when override is set to different value', async () => {
  const custom = 'https://staging.example.com';
  for (const origin of PRODUCTION_ORIGINS) {
    const res = await workerHealth(origin, { CORS_ALLOWED_ORIGINS: custom });
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), null,
      `Production origin '${origin}' must not be reflected when override is '${custom}'`);
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

// ── 7. js/api-config.js PRODUCTION_HOSTS ──────────────────────────────────────

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

// ── summary ───────────────────────────────────────────────────────────────────

console.log('\n─── Result ──────────────────────────────────────────────────────');
console.log(`  Passes : ${pass}`);
console.log(`  Failures : ${fail}`);
console.log('─────────────────────────────────────────────────────────────────\n');

if (fail > 0) process.exit(1);
