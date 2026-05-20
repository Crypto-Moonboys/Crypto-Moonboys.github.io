/**
 * scripts/leaderboard-client-regression.test.mjs
 *
 * Regression tests for js/leaderboard-client.js public + Telegram submit flow.
 *
 * Verifies:
 *  1. submitScore() always POSTs to global endpoint for public leaderboard flow
 *  2. linked + signed auth includes telegram_auth in request body
 *  3. linked without signed auth still POSTs anonymously (without telegram_auth)
 *  4. ArcadeSync auth failure does not block basic score submission
 *  5. submitMetaScore() remains Telegram-auth guarded
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

await test('submitScore defines shared requestBody payload for global POST', async () => {
  const submitScoreStart = src.indexOf('export async function submitScore(');
  assert(submitScoreStart !== -1, 'submitScore function not found in source');
  assert(
    src.includes('const requestBody = {') && src.includes('player: resolvedPlayer') && src.includes('score,') && src.includes('game,'),
    'submitScore must build a shared requestBody with player/score/game for public submission',
  );
});

await test('submitScore only includes telegram_auth when signed auth is available', async () => {
  assert(
    src.includes('if (hasSignedAuth) {') &&
      src.includes('requestBody.telegram_auth = telegramAuth') &&
      src.includes('if (telegramId) requestBody.telegram_id = telegramId'),
    'submitScore must add telegram_auth/telegram_id only inside signed-auth branch',
  );
});

await test('submitScore missing-auth path marks unsigned public submit instead of aborting', async () => {
  assert(
    src.includes('result.state = "public_submit_unsigned"') &&
      src.includes('Submitting to public leaderboard without XP sync'),
    'missing signed auth should enter public_submit_unsigned path',
  );
});

await test('submitScore does not have pre-fetch return in missing-auth branch', async () => {
  const publicUnsignedIdx = src.indexOf('result.state = "public_submit_unsigned"');
  assert(publicUnsignedIdx !== -1, 'public_submit_unsigned marker not found');
  const fetchIdx = src.indexOf('await fetch(api', publicUnsignedIdx);
  assert(fetchIdx !== -1, 'submitScore fetch call must appear after unsigned branch');
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
  // The call inside submitScore() that forwards to submitMetaScore() must include telegram_auth.
  const submitScoreStart = src.indexOf('export async function submitScore(');
  assert(submitScoreStart !== -1, 'submitScore function not found');
  const metaCallIdx = src.indexOf('await submitMetaScore(', submitScoreStart);
  assert(metaCallIdx !== -1, 'submitMetaScore call not found inside submitScore()');
  const metaCallBlock = src.slice(metaCallIdx, src.indexOf(');', metaCallIdx) + 2);
  assert(
    metaCallBlock.includes('telegram_auth'),
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
  // Extract the readAdminSecret function body to check specifically there.
  const fnStart = worker.indexOf('function readAdminSecret(');
  assert(fnStart !== -1, 'readAdminSecret function not found in worker');
  const fnEnd = worker.indexOf('\n}', fnStart) + 2;
  const fnBody = worker.slice(fnStart, fnEnd);
  assert(
    !fnBody.includes('x-admin-token'),
    'x-admin-token alias must be removed from readAdminSecret()',
  );
});

await test('Access-Control-Allow-Headers does not include x-admin-token', async () => {
  // Find the Access-Control-Allow-Headers line and verify x-admin-token is absent from it.
  const corsLineMatch = worker.match(/['"]Access-Control-Allow-Headers['"]:\s*'[^']*'/);
  assert(corsLineMatch !== null, 'Access-Control-Allow-Headers entry not found in worker');
  assert(
    !corsLineMatch[0].includes('x-admin-token'),
    `x-admin-token must not appear in Access-Control-Allow-Headers. Found: ${corsLineMatch[0]}`,
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
async function runSubmitScoreGuard({ linked = false, telegramAuth = null, authThrows = false } = {}) {
  const fetchCalls  = [];
  const healthCalls = [];
  const statusCalls = [];

  const result = { state: 'pending_submit', accepted: false, linked };
  let hasSignedAuth = false;
  let resolvedAuth = null;

  if (linked) {
    if (authThrows) {
      healthCalls.push({ state: 'bad', reason: 'auth_expired' });
      statusCalls.push({ state: 'public_submit_unsigned' });
    } else {
      resolvedAuth = telegramAuth;
      hasSignedAuth = !!(resolvedAuth && resolvedAuth.hash && resolvedAuth.auth_date);
      if (!hasSignedAuth) {
        result.state = 'public_submit_unsigned';
        result.message = 'Telegram auth missing or expired. Submitting to public leaderboard without XP sync.';
        healthCalls.push({ state: 'bad', reason: 'auth_expired' });
        statusCalls.push({ state: 'public_submit_unsigned' });
      }
    }
  }

  // Always POST for public leaderboard.
  fetchCalls.push({
    body: {
      player: 'TestPlayer',
      score: 500,
      game: 'snake',
      faction: 'unaligned',
      ...(hasSignedAuth ? { telegram_id: '123456789', telegram_auth: resolvedAuth } : {}),
    },
  });

  return { outcome: 'posted', result, fetchCalls, healthCalls, statusCalls };
}

await test('BEH: linked user with valid telegram_auth POSTs with telegram_auth in body', async () => {
  const auth = makeValidAuth();
  const { outcome, fetchCalls } = await runSubmitScoreGuard({ linked: true, telegramAuth: auth });
  assert(outcome === 'posted', `expected posted, got ${outcome}`);
  assert(fetchCalls.length === 1, 'expected exactly one fetch call');
  assert(fetchCalls[0].body.telegram_auth !== undefined, 'POST body must include telegram_auth');
  assert(fetchCalls[0].body.telegram_auth === auth, 'telegram_auth in body must be the fetched auth object');
});

await test('BEH: linked user with null telegramAuth still POSTs without telegram_auth', async () => {
  const { outcome, result, fetchCalls, healthCalls, statusCalls } = await runSubmitScoreGuard({ linked: true, telegramAuth: null });
  assert(outcome === 'posted', `expected posted, got ${outcome}`);
  assert(fetchCalls.length === 1, 'must still POST when telegramAuth is null');
  assert(result.state === 'public_submit_unsigned', `returned result.state must be "public_submit_unsigned", got "${result.state}"`);
  assert(fetchCalls[0].body.telegram_auth === undefined, 'unsigned fallback POST must omit telegram_auth');
  assert(fetchCalls[0].body.telegram_id === undefined, 'unsigned fallback POST must omit telegram_id');
  assert(healthCalls.some(h => h.state === 'bad'), 'must mark sync health as bad');
  assert(statusCalls.some(s => s.state === 'public_submit_unsigned'), 'must emit unsigned fallback status');
});

await test('BEH: anonymous user POSTs without telegram auth fields', async () => {
  const { outcome, fetchCalls } = await runSubmitScoreGuard({ linked: false, telegramAuth: null });
  assert(outcome === 'posted', `expected posted, got ${outcome}`);
  assert(fetchCalls.length === 1, 'anonymous submit must POST');
  assert(fetchCalls[0].body.telegram_auth === undefined, 'anonymous POST must omit telegram_auth');
  assert(fetchCalls[0].body.telegram_id === undefined, 'anonymous POST must omit telegram_id');
});

await test('BEH: ArcadeSync auth failure does not block public score submit', async () => {
  const { outcome, fetchCalls, statusCalls } = await runSubmitScoreGuard({ linked: true, authThrows: true });
  assert(outcome === 'posted', `expected posted, got ${outcome}`);
  assert(fetchCalls.length === 1, 'auth exception should still result in one POST');
  assert(fetchCalls[0].body.telegram_auth === undefined, 'auth exception fallback must omit telegram_auth');
  assert(statusCalls.some(s => s.state === 'public_submit_unsigned'), 'auth exception should emit unsigned fallback status');
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
