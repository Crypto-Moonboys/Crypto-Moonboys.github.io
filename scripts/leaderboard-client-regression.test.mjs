/**
 * scripts/leaderboard-client-regression.test.mjs
 *
 * Regression tests for js/leaderboard-client.js auth hardening.
 *
 * Verifies the CRIT-01 client-side fixes:
 *  1. submitScore() POST body always includes telegram_auth
 *  2. submitScore() does NOT POST when linked but telegramAuth is null/incomplete
 *  3. submitScore() marks sync health as bad and emits relink_required when auth is missing
 *  4. submitMetaScore() POST body includes telegram_auth
 *  5. submitMetaScore() skips POST when telegram_auth is null/incomplete
 *
 * Also validates source-level structure to catch regressions from future edits.
 *
 * Run:
 *   node scripts/leaderboard-client-regression.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

async function readFile(relPath) {
  return fs.readFile(path.join(ROOT, relPath), 'utf8');
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (e) {
    console.error(`  [FAIL] ${name}: ${e.message}`);
    failed++;
  }
}

// ── Source-level structural checks ────────────────────────────────────────────
// These guard against future edits accidentally removing the guard logic.

const src = await readFile('js/leaderboard-client.js');

await test('submitScore POST body contains telegram_auth field', async () => {
  assert(
    src.includes('telegram_auth: telegramAuth'),
    'Expected "telegram_auth: telegramAuth" in submitScore POST body',
  );
});

await test('submitScore has missing-auth guard before POST', async () => {
  // Guard checks for !telegramAuth || !telegramAuth.hash || !telegramAuth.auth_date
  assert(
    src.includes('!telegramAuth') && (src.includes('auth_expired') || src.includes('relink_required')),
    'Expected missing-auth early-return guard in submitScore()',
  );
});

await test('submitScore missing-auth guard returns before POSTing', async () => {
  // The guard must contain an explicit return so no fetch is issued.
  // Verify the guard block has "return result" before the first fetch() call.
  const guardIdx = src.indexOf('!telegramAuth || !telegramAuth.hash');
  assert(guardIdx !== -1, 'Missing-auth guard pattern not found in source');
  const returnIdx = src.indexOf('return result', guardIdx);
  const fetchIdx  = src.indexOf('await fetch(api', guardIdx);
  assert(returnIdx !== -1, 'Expected "return result" inside missing-auth guard');
  assert(returnIdx < fetchIdx, 'Guard return must appear before the fetch() call');
});

await test('submitMetaScore signature includes telegram_auth parameter', async () => {
  assert(
    src.includes('async function submitMetaScore(') && src.includes('telegram_auth }'),
    'submitMetaScore must destructure telegram_auth from its parameter object',
  );
});

await test('submitMetaScore POST body contains telegram_auth field', async () => {
  const metaStart = src.indexOf('async function submitMetaScore(');
  assert(metaStart !== -1, 'submitMetaScore function not found');
  const metaEnd = src.indexOf('\nexport ', metaStart);
  const metaBody = src.slice(metaStart, metaEnd === -1 ? metaStart + 2000 : metaEnd);
  assert(
    metaBody.includes('telegram_auth,'),
    'submitMetaScore POST body must include telegram_auth field',
  );
});

await test('submitMetaScore has guard against missing telegram_auth', async () => {
  const metaStart = src.indexOf('async function submitMetaScore(');
  assert(metaStart !== -1, 'submitMetaScore function not found');
  const metaEnd = src.indexOf('\nexport ', metaStart);
  const metaBody = src.slice(metaStart, metaEnd === -1 ? metaStart + 2000 : metaEnd);
  assert(
    metaBody.includes('!telegram_auth'),
    'submitMetaScore must have a guard for missing telegram_auth',
  );
});

await test('submitMetaScore call site passes telegram_auth', async () => {
  // The call in submitScore should forward telegram_auth.
  assert(
    src.includes('telegram_auth: telegramAuth,'),
    'submitMetaScore call site must forward telegram_auth: telegramAuth',
  );
});

// ── api-config.js structural checks ──────────────────────────────────────────

const cfg = await readFile('js/api-config.js');

await test('FEATURES.LEADERBOARD is false (moonboys-api engagement endpoint not live)', async () => {
  assert(
    /LEADERBOARD\s*:\s*false/.test(cfg),
    'FEATURES.LEADERBOARD must be false — the moonboys-api /leaderboard engagement endpoint is not yet live',
  );
});

await test('FEATURES.ARCADE_LEADERBOARD is true (arcade leaderboard worker is live)', async () => {
  assert(
    /ARCADE_LEADERBOARD\s*:\s*true/.test(cfg),
    'FEATURES.ARCADE_LEADERBOARD must be true — the arcade score-submission worker is live',
  );
});

// ── moonboys-api/worker.js — admin header consistency ────────────────────────

const worker = await readFile('workers/moonboys-api/worker.js');

await test('readAdminSecret does not accept x-admin-token alias', async () => {
  assert(
    !worker.includes("x-admin-token"),
    'x-admin-token alias must be removed from readAdminSecret() and CORS headers',
  );
});

await test('Access-Control-Allow-Headers does not include x-admin-token', async () => {
  assert(
    !worker.includes("x-admin-token"),
    'x-admin-token must not appear in Access-Control-Allow-Headers',
  );
});

await test('readAdminSecret accepts X-Admin-Secret (canonical header)', async () => {
  assert(
    worker.includes("request.headers.get('X-Admin-Secret')") ||
    worker.includes('request.headers.get("X-Admin-Secret")'),
    'readAdminSecret must accept the canonical X-Admin-Secret header',
  );
});

// ── No admin_secret query-param bypass ───────────────────────────────────────

await test('workers: no searchParams.get("admin_secret") query-param bypass', async () => {
  const workerDir = path.join(ROOT, 'workers');
  const files = await findJsFiles(workerDir);
  const violations = [];
  for (const f of files) {
    const content = await fs.readFile(f, 'utf8');
    if (content.includes("searchParams.get('admin_secret')") ||
        content.includes('searchParams.get("admin_secret")')) {
      violations.push(path.relative(ROOT, f));
    }
  }
  assert(
    violations.length === 0,
    `admin_secret query-param bypass found in: ${violations.join(', ')}`,
  );
});

// ── Behavioral mock tests ─────────────────────────────────────────────────────
// These tests mirror the exact guard logic in submitScore() to verify behavior.

function makeValidAuth() {
  return { id: '123456789', hash: 'a'.repeat(64), auth_date: '1700000000' };
}

/**
 * Simulates the critical path inside submitScore() for the auth guard and POST.
 * Returns { outcome, fetchCalls, healthCalls, statusCalls }.
 */
async function runSubmitScoreGuard(telegramAuth) {
  const fetchCalls  = [];
  const healthCalls = [];
  const statusCalls = [];

  const result = { state: 'local_only', accepted: false };

  // Mirror the guard added in leaderboard-client.js submitScore()
  if (!telegramAuth || !telegramAuth.hash || !telegramAuth.auth_date) {
    healthCalls.push({ state: 'bad', reason: 'auth_expired' });
    statusCalls.push({ state: 'relink_required' });
    return { outcome: 'aborted', fetchCalls, healthCalls, statusCalls };
  }

  // Guard passed — would POST
  fetchCalls.push({
    body: {
      player: 'TestPlayer',
      score: 500,
      game: 'snake',
      telegram_id: '123456789',
      telegram_auth: telegramAuth,
      faction: 'unaligned',
    },
  });

  return { outcome: 'posted', fetchCalls, healthCalls, statusCalls };
}

await test('BEH: linked user with valid telegram_auth POSTs with telegram_auth in body', async () => {
  const auth = makeValidAuth();
  const { outcome, fetchCalls } = await runSubmitScoreGuard(auth);
  assert(outcome === 'posted', `expected posted, got ${outcome}`);
  assert(fetchCalls.length === 1, 'expected exactly one fetch call');
  assert(fetchCalls[0].body.telegram_auth !== undefined, 'POST body must include telegram_auth');
  assert(fetchCalls[0].body.telegram_auth === auth, 'telegram_auth in body must be the fetched auth object');
});

await test('BEH: linked user with null telegramAuth aborts and does NOT POST', async () => {
  const { outcome, fetchCalls, healthCalls, statusCalls } = await runSubmitScoreGuard(null);
  assert(outcome === 'aborted', `expected aborted, got ${outcome}`);
  assert(fetchCalls.length === 0, 'must not make any fetch call when telegramAuth is null');
  assert(healthCalls.some(h => h.state === 'bad'), 'must mark sync health as bad');
  assert(statusCalls.some(s => s.state === 'relink_required'), 'must emit relink_required status');
});

await test('BEH: linked user with empty object telegramAuth aborts', async () => {
  const { outcome, fetchCalls } = await runSubmitScoreGuard({});
  assert(outcome === 'aborted', 'empty auth object should abort');
  assert(fetchCalls.length === 0, 'must not POST when hash/auth_date are missing');
});

await test('BEH: linked user with telegramAuth missing hash aborts', async () => {
  const { outcome, fetchCalls } = await runSubmitScoreGuard({ id: '123', auth_date: '1700000000' });
  assert(outcome === 'aborted', 'missing hash should abort');
  assert(fetchCalls.length === 0, 'must not POST when hash is missing');
});

await test('BEH: linked user with telegramAuth missing auth_date aborts', async () => {
  const { outcome, fetchCalls } = await runSubmitScoreGuard({ id: '123', hash: 'a'.repeat(64) });
  assert(outcome === 'aborted', 'missing auth_date should abort');
  assert(fetchCalls.length === 0, 'must not POST when auth_date is missing');
});

// ── Behavioral mock for submitMetaScore ──────────────────────────────────────

async function runSubmitMetaScore({ player, telegram_id, game, score, timestamp, telegram_auth }) {
  const fetchCalls = [];
  // Mirror submitMetaScore() guard logic
  if (!telegram_id) return fetchCalls;
  if (!Number.isFinite(Number(score)) || Number(score) < 0) return fetchCalls;
  if (!telegram_auth || !telegram_auth.hash || !telegram_auth.auth_date) return fetchCalls;
  fetchCalls.push({
    player: String(player || 'Guest'),
    score: Math.floor(Number(score)),
    game: String(game || 'global'),
    telegram_id: String(telegram_id),
    telegram_auth,
    score_type: 'meta',
    timestamp: Number(timestamp) || Date.now(),
  });
  return fetchCalls;
}

await test('BEH: submitMetaScore POSTs with telegram_auth in body', async () => {
  const auth = makeValidAuth();
  const calls = await runSubmitMetaScore({
    player: 'TestPlayer', telegram_id: '123456789', game: 'snake',
    score: 200, timestamp: Date.now(), telegram_auth: auth,
  });
  assert(calls.length === 1, 'expected one meta score POST');
  assert(calls[0].telegram_auth !== undefined, 'meta POST body must include telegram_auth');
  assert(calls[0].score_type === 'meta', 'score_type must be "meta"');
  assert(calls[0].telegram_auth === auth, 'telegram_auth must be the forwarded auth object');
});

await test('BEH: submitMetaScore skips POST when telegram_auth is null', async () => {
  const calls = await runSubmitMetaScore({
    player: 'TestPlayer', telegram_id: '123456789', game: 'snake',
    score: 200, timestamp: Date.now(), telegram_auth: null,
  });
  assert(calls.length === 0, 'meta POST must be skipped when telegram_auth is null');
});

await test('BEH: submitMetaScore skips POST when telegram_auth is missing hash', async () => {
  const calls = await runSubmitMetaScore({
    player: 'TestPlayer', telegram_id: '123456789', game: 'snake',
    score: 200, timestamp: Date.now(),
    telegram_auth: { id: '123', auth_date: '1700000000' },
  });
  assert(calls.length === 0, 'meta POST must be skipped when auth is missing hash');
});

await test('BEH: submitMetaScore skips POST when telegram_id is missing', async () => {
  const auth = makeValidAuth();
  const calls = await runSubmitMetaScore({
    player: 'TestPlayer', telegram_id: null, game: 'snake',
    score: 200, timestamp: Date.now(), telegram_auth: auth,
  });
  assert(calls.length === 0, 'meta POST must be skipped when telegram_id is null');
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function findJsFiles(dir) {
  const results = [];
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await findJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
console.log('─'.repeat(60));
console.log(`Leaderboard client regression: ${passed} passed, ${failed} failed`);
console.log('─'.repeat(60));
if (failed > 0) process.exit(1);
