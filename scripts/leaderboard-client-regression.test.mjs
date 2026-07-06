/**
 * scripts/leaderboard-client-regression.test.mjs
 *
 * Regression tests for js/leaderboard-client.js signed Telegram submit flow.
 *
 * Verifies:
 *  1. submitScore() stops unlinked users before write/local-save paths
 *  2. linked + signed auth includes telegram_auth in request body
 *  3. linked without signed auth does not POST
 *  4. ArcadeSync auth failure blocks score submission
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
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

async function readFile(relPath) {
  return fs.readFile(path.join(ROOT, relPath), 'utf8');
}

async function loadApiConfigForHost(hostname, overrides = {}) {
  const source = await readFile('js/api-config.js');
  const location = {
    protocol: 'https:',
    hostname,
    origin: `https://${hostname}`,
  };
  const windowObj = {
    location,
    MOONBOYS_API: {},
    ...overrides,
  };
  const context = {
    window: windowObj,
    location,
    console: { log() {}, warn() {}, error() {}, info() {} },
    Date,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'js/api-config.js' });
  return windowObj.MOONBOYS_API;
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
const arcadeSyncSrc = await readFile('js/arcade-sync.js');
const submitScoreStart = src.indexOf('export async function submitScore(');
const submitMetaStart = src.indexOf('\nasync function submitMetaScore(', submitScoreStart);
const submitScoreBody = submitScoreStart >= 0
  ? src.slice(submitScoreStart, submitMetaStart > 0 ? submitMetaStart : submitScoreStart + 12000)
  : '';

await test('submitScore defines shared requestBody payload for signed POST', async () => {
  assert(submitScoreStart !== -1, 'submitScore function not found in source');
  assert(
    submitScoreBody.includes('const requestBody = {') &&
      submitScoreBody.includes('player: resolvedPlayer') &&
      submitScoreBody.includes('score,') &&
      submitScoreBody.includes('game,'),
    'submitScore must build a shared requestBody with player/score/game for signed submission',
  );
});

await test('submitScore only includes telegram_auth when signed auth is available', async () => {
  assert(
    submitScoreBody.includes('if (hasSignedAuth) {') &&
      submitScoreBody.includes('requestBody.telegram_auth = telegramAuth') &&
      submitScoreBody.includes('if (effectiveTelegramId) requestBody.telegram_id = effectiveTelegramId'),
    'submitScore must add telegram_auth/telegram_id only inside signed-auth branch, using effectiveTelegramId',
  );
});

await test('submitScore missing-auth path returns auth_required before POST', async () => {
  assert(
    submitScoreBody.includes('result.state = "auth_required"') &&
      submitScoreBody.includes('Fresh Telegram auth is required to save scores and earn XP.') &&
      submitScoreBody.includes('return result;'),
    'missing signed auth should enter auth_required path and return before POST',
  );
});

await test('submitScore has no unsigned public fallback states', async () => {
  assert(
    !submitScoreBody.includes('public_submit_unsigned') &&
      !submitScoreBody.includes('public_score_submitted') &&
      !submitScoreBody.includes('Public score submitted') &&
      !submitScoreBody.includes('competitive progression succeeded'),
    'unsigned public fallback states/copy must be absent',
  );
});

await test('submitScore has pre-fetch return in missing-auth branch', async () => {
  const authRequiredIdx = submitScoreBody.indexOf('result.state = "auth_required"');
  assert(authRequiredIdx !== -1, 'auth_required marker not found');
  const returnIdx = submitScoreBody.indexOf('return result;', authRequiredIdx);
  const fetchIdx = submitScoreBody.indexOf('await fetch(api', authRequiredIdx);
  assert(returnIdx !== -1 && fetchIdx !== -1 && returnIdx < fetchIdx, 'missing-auth branch must return before fetch');
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
  assert(submitScoreStart !== -1, 'submitScore function not found');
  const metaCallIdx = submitScoreBody.indexOf('await submitMetaScore(');
  assert(metaCallIdx !== -1, 'submitMetaScore call not found inside submitScore()');
  const callEnd = submitScoreBody.indexOf(');', metaCallIdx);
  const metaCallBlock = submitScoreBody.slice(metaCallIdx, callEnd + 2);
  assert(
    metaCallBlock.includes('telegram_auth'),
    'submitMetaScore call site must forward telegram_auth: telegramAuth',
  );
});

await test('callFactionEarn uses restored signed Telegram auth path', async () => {
  assert(
    src.includes('const telegramAuth = await ArcadeSync.getTelegramAuth();') &&
      !src.includes('const telegramAuth = gate.getTelegramAuth();'),
    'faction earn must use ArcadeSync.getTelegramAuth() (signed/restored), not stale gate.getTelegramAuth()',
  );
});

await test('faction earn only runs when linked + signed auth are present', async () => {
  assert(
    submitScoreBody.includes('if (linked && hasSignedAuth) {') &&
      submitScoreBody.includes('const factionEarn = await callFactionEarn("score_accept", score);'),
    'faction earn side-effect must be gated by linked + signed auth',
  );
});

await test('pending progression sync requires signed auth and avoids false synced emits when skipped', async () => {
  assert(
    submitScoreBody.includes('const shouldSyncPending = linked && hasSignedAuth && pendingBeforeSync > 0;') &&
      submitScoreBody.includes('if (!syncSummary?.skipped) {') &&
      submitScoreBody.includes('state: "progression_synced"'),
    'pending sync must require signed auth and only emit progression_synced on non-skipped sync',
  );
});

// ── api-config.js structural checks ──────────────────────────────────────────

const cfg = await readFile('js/api-config.js');

await test('api-config centralizes endpoint helpers and production-host fallback policy', async () => {
  assert(
    cfg.includes('getApiBaseInfo') &&
      cfg.includes('getLeaderboardApiInfo') &&
      cfg.includes('context.isProduction') &&
      cfg.includes("'crypto-moonboys.github.io'"),
    'api-config.js must expose shared endpoint helpers and gate production fallback to live hosts',
  );
});

for (const hostname of ['cryptomoonboys.com', 'www.cryptomoonboys.com', 'crypto-moonboys.github.io']) {
  await test(`api-config resolves production Worker base for ${hostname}`, async () => {
    const api = await loadApiConfigForHost(hostname);
    const info = api.getApiBaseInfo();
    assert.equal(info.url, api.PRODUCTION_BASE_URL, `expected production base fallback for ${hostname}`);
    assert.equal(info.state, 'production_fallback', `expected production_fallback state for ${hostname}`);
  });

  await test(`api-config resolves production leaderboard Worker for ${hostname}`, async () => {
    const api = await loadApiConfigForHost(hostname);
    const info = api.getLeaderboardApiInfo();
    assert.equal(info.url, api.PRODUCTION_LEADERBOARD_URL, `expected production leaderboard fallback for ${hostname}`);
    assert.equal(info.state, 'production_fallback', `expected production_fallback leaderboard state for ${hostname}`);
  });
}

await test('api-config keeps local/dev contexts pending without explicit config', async () => {
  const api = await loadApiConfigForHost('localhost');
  const baseInfo = api.getApiBaseInfo();
  const leaderboardInfo = api.getLeaderboardApiInfo();
  assert.equal(baseInfo.url, '', 'localhost base API should stay empty without explicit config');
  assert.equal(baseInfo.state, 'config_required', 'localhost base API should stay config_required without explicit config');
  assert.equal(leaderboardInfo.url, '', 'localhost leaderboard API should stay empty without explicit config');
  assert.equal(leaderboardInfo.state, 'config_required', 'localhost leaderboard API should stay config_required without explicit config');
});

await test('api-config exposes disabled-specific copy when endpoint is explicitly disabled', async () => {
  const api = await loadApiConfigForHost('cryptomoonboys.com', {
    MOONBOYS_API: { BASE_URL: null, LEADERBOARD_URL: null },
  });
  const baseInfo = api.getApiBaseInfo();
  const leaderboardInfo = api.getLeaderboardApiInfo();
  assert.equal(baseInfo.state, 'disabled', 'base API should report disabled state when BASE_URL is null');
  assert.equal(baseInfo.summary, 'Endpoint disabled', 'base API should expose disabled summary');
  assert.equal(leaderboardInfo.state, 'disabled', 'leaderboard API should report disabled state when LEADERBOARD_URL is null');
  assert.equal(leaderboardInfo.detail, 'API endpoint disabled for this context', 'leaderboard API should expose disabled detail copy');
});

await test('feature modules no longer carry hardcoded production Worker fallbacks', async () => {
  assert(
    !src.includes('moonboys-leaderboard.sercullen.workers.dev') &&
      !arcadeSyncSrc.includes('moonboys-api.sercullen.workers.dev'),
    'leaderboard-client.js and arcade-sync.js must consume shared api-config helpers instead of hardcoded Worker URLs',
  );
});

await test('api-config no longer labels runtime timestamp as BUILD_DATE', async () => {
  assert(
    !cfg.includes('BUILD_DATE: new Date().toISOString()') &&
      cfg.includes('RUNTIME_LOADED_AT: new Date().toISOString()'),
    'api-config.js must reserve BUILD_DATE for injected/static data and use RUNTIME_LOADED_AT for per-page-load timestamps',
  );
});

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
async function runSubmitScoreGuard({ linked = false, telegramAuth = null, authThrows = false, apiAvailable = true, apiState = 'configured' } = {}) {
  const fetchCalls  = [];
  const healthCalls = [];
  const statusCalls = [];

  const result = { state: 'pending_submit', accepted: false, linked };
  let hasSignedAuth = false;
  let resolvedAuth = null;

  if (!linked) {
    result.state = 'login_required';
    result.message = 'Log in with Telegram to save scores and earn XP.';
    healthCalls.push({ state: 'bad', reason: 'not_linked' });
    statusCalls.push({ state: 'login_required' });
    return { outcome: 'rejected', result, fetchCalls, healthCalls, statusCalls };
  }

  if (authThrows) {
    result.state = 'auth_required';
    result.message = 'Fresh Telegram auth is required to save scores and earn XP.';
    healthCalls.push({ state: 'bad', reason: 'auth_expired' });
    statusCalls.push({ state: 'auth_required' });
    return { outcome: 'rejected', result, fetchCalls, healthCalls, statusCalls };
  }

  resolvedAuth = telegramAuth;
  hasSignedAuth = !!(resolvedAuth && resolvedAuth.hash && resolvedAuth.auth_date);
  if (!hasSignedAuth) {
    result.state = 'auth_required';
    result.message = 'Fresh Telegram auth is required to save scores and earn XP.';
    healthCalls.push({ state: 'bad', reason: 'auth_expired' });
    statusCalls.push({ state: 'auth_required' });
    return { outcome: 'rejected', result, fetchCalls, healthCalls, statusCalls };
  }

  if (!apiAvailable) {
    result.state = 'sync_pending';
    result.message = apiState === 'disabled'
      ? 'Endpoint disabled. Sync pending.'
      : (apiState === 'config_required' ? 'API config required. Sync pending.' : 'Server unavailable. Sync pending.');
    statusCalls.push({ state: result.state });
    return { outcome: 'skipped', result, fetchCalls, healthCalls, statusCalls };
  }

  fetchCalls.push({
    body: {
      player: 'TestPlayer',
      score: 500,
      game: 'snake',
      faction: 'unaligned',
      telegram_id: '123456789',
      telegram_auth: resolvedAuth,
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

await test('BEH: linked user with null telegramAuth does not POST', async () => {
  const { outcome, result, fetchCalls, healthCalls, statusCalls } = await runSubmitScoreGuard({ linked: true, telegramAuth: null });
  assert(outcome === 'rejected', `expected rejected, got ${outcome}`);
  assert(fetchCalls.length === 0, 'must not POST when telegramAuth is null');
  assert(result.state === 'auth_required', `returned result.state must be "auth_required", got "${result.state}"`);
  assert(healthCalls.some(h => h.state === 'bad'), 'must mark sync health as bad');
  assert(statusCalls.some(s => s.state === 'auth_required'), 'must emit auth_required status');
});

await test('BEH: anonymous user is rejected without a POST', async () => {
  const { outcome, result, fetchCalls, statusCalls } = await runSubmitScoreGuard({ linked: false, telegramAuth: null });
  assert(outcome === 'rejected', `expected rejected, got ${outcome}`);
  assert(result.state === 'login_required', `expected login_required, got ${result.state}`);
  assert(fetchCalls.length === 0, 'anonymous submit must not POST');
  assert(statusCalls.some(s => s.state === 'login_required'), 'must emit login_required status');
});

await test('BEH: ArcadeSync auth failure blocks score submit', async () => {
  const { outcome, fetchCalls, statusCalls } = await runSubmitScoreGuard({ linked: true, authThrows: true });
  assert(outcome === 'rejected', `expected rejected, got ${outcome}`);
  assert(fetchCalls.length === 0, 'auth exception must not POST');
  assert(statusCalls.some(s => s.state === 'auth_required'), 'auth exception should emit auth_required status');
});
await test('BEH: linked user without write API stays pending and does not POST', async () => {
  const { outcome, result, fetchCalls, statusCalls } = await runSubmitScoreGuard({
    linked: true,
    telegramAuth: makeValidAuth(),
    apiAvailable: false,
    apiState: 'config_required',
  });
  assert(outcome === 'skipped', `expected skipped, got ${outcome}`);
  assert(fetchCalls.length === 0, 'linked no-config write path must not POST to leaderboard worker');
  assert(result.state === 'sync_pending', `expected sync_pending, got ${result.state}`);
  assert(statusCalls.some(s => s.state === 'sync_pending'), 'linked no-config write path must emit sync_pending');
});

await test('BEH: guest user without write API is rejected before local-only save', async () => {
  const { outcome, result, fetchCalls, statusCalls } = await runSubmitScoreGuard({
    linked: false,
    apiAvailable: false,
    apiState: 'config_required',
  });
  assert(outcome === 'rejected', `expected rejected, got ${outcome}`);
  assert(fetchCalls.length === 0, 'guest no-config path must not POST to leaderboard worker');
  assert(result.state === 'login_required', `expected login_required, got ${result.state}`);
  assert(statusCalls.some(s => s.state === 'login_required'), 'guest no-config path must emit login_required');
});
await test('BEH: disabled write API reports disabled copy instead of server unavailable', async () => {
  const { outcome, result, fetchCalls, statusCalls } = await runSubmitScoreGuard({
    linked: true,
    telegramAuth: makeValidAuth(),
    apiAvailable: false,
    apiState: 'disabled',
  });
  assert(outcome === 'skipped', `expected skipped, got ${outcome}`);
  assert(fetchCalls.length === 0, 'disabled write path must not POST');
  assert.equal(result.message, 'Endpoint disabled. Sync pending.', 'disabled write path should report disabled-specific pending copy');
  assert(statusCalls.some(s => s.state === 'sync_pending'), 'disabled write path must still emit sync_pending');
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

// ── Source-level checks for PR #638 security/integrity fixes ─────────────────

const workerLbSrc = await readFile('workers/leaderboard-worker.js');

await test('Worker: upsertEntry deduplicates authenticated entries by telegram_id', async () => {
  const fnStart = workerLbSrc.indexOf('function upsertEntry(');
  assert(fnStart !== -1, 'upsertEntry not found in leaderboard-worker.js');
  const fnEnd = workerLbSrc.indexOf('\nfunction ', fnStart + 1);
  const fnBody = workerLbSrc.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 4000);
  assert(
    fnBody.includes('newEntry.telegram_id') &&
      fnBody.includes('e.telegram_id') &&
      /String\(e\.telegram_id\).*===.*String\(newEntry\.telegram_id\)/.test(fnBody),
    'upsertEntry must match authenticated entries by telegram_id using String comparison',
  );
});

await test('Worker: upsertEntry anonymous match excludes rows that have telegram_id', async () => {
  const fnStart = workerLbSrc.indexOf('function upsertEntry(');
  assert(fnStart !== -1, 'upsertEntry not found in leaderboard-worker.js');
  const fnEnd = workerLbSrc.indexOf('\nfunction ', fnStart + 1);
  const fnBody = workerLbSrc.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 4000);
  assert(
    fnBody.includes('!e.telegram_id'),
    'upsertEntry anonymous matching must exclude rows that have a telegram_id to prevent hijacking',
  );
});

await test('Worker: anti-cheat block check runs against verified telegramId', async () => {
  const blockCheckIdx = workerLbSrc.indexOf('anticheat:blocked:${telegramId}');
  assert(blockCheckIdx !== -1, 'anticheat block check pattern not found in worker');
  assert(
    workerLbSrc.includes('const telegramId = identity.telegramId;') &&
      workerLbSrc.includes('const blockStatus = await env.LEADERBOARD.get(`anticheat:blocked:${telegramId}`);'),
    'anti-cheat block check must use the verified Telegram identity from resolveSubmissionIdentity()',
  );
});

await test('Block Topia leaderboard worker compares Telegram HMAC case-insensitively', async () => {
  const blocktopiaWorkerSrc = await readFile('workers/blocktopia-leaderboard/worker.js');
  const hmacStart = blocktopiaWorkerSrc.indexOf('async function verifyTelegramHmac(');
  assert(hmacStart !== -1, 'verifyTelegramHmac not found in blocktopia leaderboard worker');
  const hmacEnd = blocktopiaWorkerSrc.indexOf('\n}', hmacStart) + 2;
  const hmacBody = blocktopiaWorkerSrc.slice(hmacStart, hmacEnd);
  assert(
    hmacBody.includes('String(hash).toLowerCase()'),
    'blocktopia leaderboard worker must normalize Telegram hash case before comparison',
  );
});

await test('Worker: recomputeAggregate keys profiles by identity namespace, not display name', async () => {
  const recomputeStart = workerLbSrc.indexOf('async function recomputeAggregate(');
  assert(recomputeStart !== -1, 'recomputeAggregate not found in leaderboard-worker.js');
  const recomputeEnd = workerLbSrc.indexOf('\nasync function ', recomputeStart + 1);
  const recomputeBody = workerLbSrc.slice(recomputeStart, recomputeEnd > 0 ? recomputeEnd : recomputeStart + 5000);
  assert(
    recomputeBody.includes('identityMap') &&
      recomputeBody.includes('getAggregateIdentityKey(entry)') &&
      recomputeBody.includes('identity_key: identityKey') &&
      recomputeBody.includes('anon:') &&
      recomputeBody.includes('tg:'),
    'recomputeAggregate must build aggregate rows by identity key namespace (tg:* / anon:*), not by player display name',
  );
});

await test('Worker: aggregate entries preserve telegram_id metadata when identity is authenticated', async () => {
  const recomputeStart = workerLbSrc.indexOf('async function recomputeAggregate(');
  assert(recomputeStart !== -1, 'recomputeAggregate not found in leaderboard-worker.js');
  const recomputeEnd = workerLbSrc.indexOf('\nasync function ', recomputeStart + 1);
  const recomputeBody = workerLbSrc.slice(recomputeStart, recomputeEnd > 0 ? recomputeEnd : recomputeStart + 5000);
  assert(
    recomputeBody.includes("profile.telegram_id ? { telegram_id: profile.telegram_id } : {}"),
    'aggregate entries should include telegram_id metadata for authenticated profiles',
  );
});

await test('Client: effectiveTelegramId falls back to telegramAuth.id when local id is missing', async () => {
  assert(
    submitScoreBody.includes('const effectiveTelegramId = hasSignedAuth') &&
      submitScoreBody.includes('telegramAuth && String(telegramAuth.id || "").trim()'),
    'submitScore must define effectiveTelegramId that derives from telegramAuth.id as fallback',
  );
});

await test('Client: requestBody uses effectiveTelegramId not raw telegramId', async () => {
  // Verify the request body block uses effectiveTelegramId.
  const reqBodyIdx = submitScoreBody.indexOf('const requestBody = {');
  assert(reqBodyIdx !== -1, 'requestBody definition not found');
  // The `if (telegramId)` pattern must NOT appear after the requestBody block
  // (would mean it still uses the raw, potentially-null local id).
  const afterReq = submitScoreBody.slice(reqBodyIdx, reqBodyIdx + 500);
  assert(
    afterReq.includes('effectiveTelegramId') &&
      !afterReq.includes('if (telegramId) requestBody.telegram_id = telegramId'),
    'requestBody must use effectiveTelegramId, not the raw telegramId local variable',
  );
});

await test('Client: meta sync call uses effectiveTelegramId', async () => {
  const metaCallIdx = submitScoreBody.indexOf('await submitMetaScore(');
  assert(metaCallIdx !== -1, 'submitMetaScore call not found in submitScore()');
  const callEnd = submitScoreBody.indexOf(');', metaCallIdx);
  const callBlock = submitScoreBody.slice(metaCallIdx, callEnd + 2);
  assert(
    callBlock.includes('telegram_id: effectiveTelegramId'),
    'submitMetaScore call must pass effectiveTelegramId, not raw telegramId',
  );
});

await test('Client: no duplicate score_accepted emit after blocktopia else branch', async () => {
  // After the blocktopia XP sync block closes, there must not be an immediately
  // following emitArcadeSubmissionStatus with state:"score_accepted".
  const blocktopiaCondIdx = submitScoreBody.indexOf('linked && hasSignedAuth && gameKey === "blocktopia"');
  assert(blocktopiaCondIdx !== -1, 'blocktopia XP sync block not found');
  // Extract ~600 chars after the condition to cover the end of the block
  const afterBlock = submitScoreBody.slice(blocktopiaCondIdx, blocktopiaCondIdx + 1200);
  // Check that the only score_accepted messages appear before the blocktopia block,
  // not duplicated in an else after it.
  const elseScoreAcceptedIdx = afterBlock.lastIndexOf('"score_accepted"');
  const xpAwardedIdx = afterBlock.indexOf('"xp_awarded"');
  // There should be at most one score_accepted in this window, and it should
  // be INSIDE the try (xp_awarded path), not in a trailing else.
  // The safest check: no standalone `} else {` block containing state:"score_accepted"
  assert(
    !afterBlock.includes('} else {\n        emitArcadeSubmissionStatus') ||
      elseScoreAcceptedIdx === -1 ||
      elseScoreAcceptedIdx < xpAwardedIdx,
    'score_accepted must not be emitted a second time in an else branch after the blocktopia XP block',
  );
});

await test('Client: error copy does not claim submission was retried', async () => {
  assert(
    !submitScoreBody.includes('Score submission retried as public when auth is restored'),
    'error copy must not claim submission was retried unless an actual retry path is implemented',
  );
});

await test('Client: auth-expired error copy is accurate', async () => {
  assert(
    submitScoreBody.includes('Telegram sync expired. Score submission failed; relink or refresh auth.'),
    'auth-expired error copy must accurately describe the outcome (submission failed, not retried)',
  );
});

await test('Crystal Quest: completion message is plain valid text (no mojibake)', async () => {
  const cqSrc = await readFile('js/arcade/games/crystal-quest/bootstrap.js');
  // The corrupted bytes 0xc3 0xb0 0xc5 0xb8 etc encode as ðŸ† in Latin-1-interpreted UTF-8.
  // Check that neither the literal mojibake sequence nor the raw byte sequence is present.
  assert(
    !cqSrc.includes('\u00f0\u0178\u008f\u2020') &&
      !cqSrc.includes('\xc3\xb0\xc5\xb8') &&
      cqSrc.includes('Run complete. Score submitted to leaderboard.'),
    'Crystal Quest completion string must not contain mojibake and must contain valid plain-text copy',
  );
});

await test('Crystal Quest and Block Topia bootstrap no longer include unused canSubmitIdentity helper', async () => {
  const cqSrc = await readFile('js/arcade/games/crystal-quest/bootstrap.js');
  const btqmSrc = await readFile('js/arcade/games/block-topia-quest-maze/bootstrap.js');
  assert(
    !cqSrc.includes('function canSubmitIdentity(') &&
      !btqmSrc.includes('function canSubmitIdentity('),
    'unused canSubmitIdentity helper should be removed from both bootstraps',
  );
});

// ── Behavioral mock for worker upsertEntry ────────────────────────────────────
// Mirrors the fixed upsertEntry() logic in leaderboard-worker.js for
// behavioral assertion. Keep this in sync with the worker implementation.

function upsertEntryBehavior(existing, newEntry, limit = 100) {
  let list = Array.isArray(existing) ? existing.slice() : [];
  let idx = -1;
  if (newEntry.telegram_id) {
    idx = list.findIndex(
      (e) => e.telegram_id && String(e.telegram_id) === String(newEntry.telegram_id),
    );
  } else {
    const nameLower = newEntry.player.toLowerCase();
    idx = list.findIndex(
      (e) => !e.telegram_id &&
        typeof e.player === 'string' &&
        e.player.toLowerCase() === nameLower,
    );
  }
  if (idx !== -1) {
    if (newEntry.score > (Number(list[idx].score) || 0)) {
      list[idx] = { ...list[idx], ...newEntry };
    } else {
      if (newEntry.faction) list[idx].faction = newEntry.faction;
      if (newEntry.telegram_id && newEntry.player) list[idx].player = newEntry.player;
    }
  } else {
    list.push(newEntry);
  }
  list.sort((a, b) => {
    const diff = (Number(b.score) || 0) - (Number(a.score) || 0);
    return diff !== 0 ? diff : String(a.player).localeCompare(String(b.player));
  });
  return list.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));
}

await test('BEH upsertEntry: authenticated entry dedupes by telegram_id not name', async () => {
  const existing = [
    { player: 'Alice', score: 1000, telegram_id: 'tg_001', rank: 1 },
  ];
  const updated = upsertEntryBehavior(existing,
    { player: 'AliceRenamed', score: 1500, telegram_id: 'tg_001' });
  assert(updated.length === 1, 'must not create a second row for the same telegram_id');
  assert(updated[0].score === 1500, 'must update score on telegram_id match');
  assert(updated[0].player === 'AliceRenamed', 'must update display name on telegram_id match');
});

await test('BEH upsertEntry: anonymous submission cannot overwrite authenticated record by same name', async () => {
  const existing = [
    { player: 'CryptoKing', score: 5000, telegram_id: 'tg_999', rank: 1 },
  ];
  // Anonymous submission with same display name
  const updated = upsertEntryBehavior(existing,
    { player: 'CryptoKing', score: 9000 /* no telegram_id */ });
  assert(updated.length === 2, 'anonymous entry with same name must create a new row, not overwrite authenticated record');
  const authRow = updated.find((e) => e.telegram_id === 'tg_999');
  assert(authRow, 'authenticated row must still exist');
  assert(authRow.score === 5000, 'authenticated row score must not be overwritten by anonymous submission');
});

await test('BEH upsertEntry: anonymous entries dedupe among themselves by name', async () => {
  const existing = [
    { player: 'GuestA', score: 200, rank: 1 }, // no telegram_id
  ];
  const updated = upsertEntryBehavior(existing,
    { player: 'GuestA', score: 300 /* no telegram_id */ });
  assert(updated.length === 1, 'anonymous entries with the same name must dedupe');
  assert(updated[0].score === 300, 'score must update when new score is higher');
});

await test('BEH upsertEntry: authenticated entries deduplicate by telegram_id across name changes', async () => {
  // Player changed their display name but kept the same telegram_id.
  const existing = [
    { player: 'OldName', score: 2000, telegram_id: 'tg_42', rank: 1 },
    { player: 'AnotherUser', score: 1000, telegram_id: 'tg_07', rank: 2 },
  ];
  const updated = upsertEntryBehavior(existing,
    { player: 'NewName', score: 1500, telegram_id: 'tg_42' });
  assert(updated.length === 2, 'renaming must not create a third row');
  const row = updated.find((e) => e.telegram_id === 'tg_42');
  assert(row, 'telegram_id row must still exist after rename');
  assert(row.player === 'NewName', 'display name must be updated to NewName');
  assert(row.score === 2000, 'score must remain 2000 — rename with lower score must not reduce the best');
});

await test('BEH upsertEntry: two different users sharing a display name each get their own row', async () => {
  const existing = [
    { player: 'Satoshi', score: 3000, telegram_id: 'tg_A', rank: 1 },
  ];
  // Second user also named Satoshi but different telegram_id
  const updated = upsertEntryBehavior(existing,
    { player: 'Satoshi', score: 4000, telegram_id: 'tg_B' });
  assert(updated.length === 2, 'two different telegram_ids must produce two rows even with the same display name');
  const rowA = updated.find((e) => e.telegram_id === 'tg_A');
  const rowB = updated.find((e) => e.telegram_id === 'tg_B');
  assert(rowA && rowA.score === 3000, 'original user record must be unchanged');
  assert(rowB && rowB.score === 4000, 'second user must have their own row');
});

await test('BEH: effectiveTelegramId fallback derives id from telegramAuth.id', async () => {
  // Mirror the effectiveTelegramId logic in submitScore().
  function resolveEffectiveTelegramId(hasSignedAuth, telegramId, telegramAuth) {
    return hasSignedAuth
      ? (telegramId || (telegramAuth && String(telegramAuth.id || '').trim()) || null)
      : null;
  }
  // Local telegramId available
  assert(resolveEffectiveTelegramId(true, '111', { id: '222', hash: 'x', auth_date: 'y' }) === '111',
    'must prefer local telegramId when available');
  // Local telegramId missing; fall back to auth.id
  assert(resolveEffectiveTelegramId(true, null, { id: '222', hash: 'x', auth_date: 'y' }) === '222',
    'must derive id from telegramAuth.id when local id is missing');
  // Local telegramId empty string; fall back to auth.id
  assert(resolveEffectiveTelegramId(true, '', { id: '333', hash: 'x', auth_date: 'y' }) === '333',
    'must derive id from telegramAuth.id when local id is empty string');
  // No signed auth; must return null regardless
  assert(resolveEffectiveTelegramId(false, '111', { id: '222', hash: 'x', auth_date: 'y' }) === null,
    'must return null when hasSignedAuth is false');
  // Signed auth present but telegramAuth.id is empty; return null
  assert(resolveEffectiveTelegramId(true, null, { id: '', hash: 'x', auth_date: 'y' }) === null,
    'must return null when both local id and auth.id are empty');
});

// ── Behavioral mock for aggregate identity-key recomputation ───────────────────

function aggregateIdentityKeyBehavior(entry) {
  const telegramId = String(entry?.telegram_id || '').trim();
  if (telegramId) return `tg:${telegramId}`;
  const player = String(entry?.player || '').trim();
  if (!player) return null;
  return `anon:${player.toLowerCase()}`;
}

function recomputeAggregateBehavior(gameEntriesByGame, games) {
  const identityMap = {};
  for (const game of games) {
    const rows = gameEntriesByGame[game] || [];
    for (const entry of rows) {
      const identityKey = aggregateIdentityKeyBehavior(entry);
      if (!identityKey) continue;
      if (!identityMap[identityKey]) {
        identityMap[identityKey] = {
          identity_key: identityKey,
          player: String(entry.player || '').trim(),
          telegram_id: entry.telegram_id ? String(entry.telegram_id) : null,
          scores: {},
        };
      }
      const profile = identityMap[identityKey];
      const score = Number(entry.score) || 0;
      profile.scores[game] = Math.max(Number(profile.scores[game]) || 0, score);
      const latestName = String(entry.player || '').trim();
      if (latestName) profile.player = latestName;
    }
  }
  return Object.values(identityMap).map((profile) => ({
    identity_key: profile.identity_key,
    player: profile.player,
    telegram_id: profile.telegram_id,
    total: games.reduce((sum, g) => sum + (Number(profile.scores[g]) || 0), 0),
    scores: { ...profile.scores },
  }));
}

await test('BEH aggregate: two Telegram users sharing display name remain separate aggregate entries', async () => {
  const games = ['snake', 'tetris'];
  const rows = recomputeAggregateBehavior({
    snake: [
      { player: 'Satoshi', score: 100, telegram_id: '111' },
      { player: 'Satoshi', score: 200, telegram_id: '222' },
    ],
    tetris: [],
  }, games);
  assert(rows.length === 2, 'same display name with different telegram_id must remain separate aggregate rows');
  assert(rows.some((r) => r.identity_key === 'tg:111' && r.total === 100), 'tg:111 aggregate row should exist with own total');
  assert(rows.some((r) => r.identity_key === 'tg:222' && r.total === 200), 'tg:222 aggregate row should exist with own total');
});

await test('BEH aggregate: anonymous user with same name as Telegram user does not merge', async () => {
  const games = ['snake', 'tetris'];
  const rows = recomputeAggregateBehavior({
    snake: [{ player: 'Moonboy', score: 300, telegram_id: '999' }],
    tetris: [{ player: 'Moonboy', score: 50 }],
  }, games);
  assert(rows.length === 2, 'anonymous and telegram identities with same name must remain separate rows');
  const tgRow = rows.find((r) => r.identity_key === 'tg:999');
  const anonRow = rows.find((r) => r.identity_key === 'anon:moonboy');
  assert(tgRow && tgRow.total === 300, 'telegram identity total must include only telegram rows');
  assert(anonRow && anonRow.total === 50, 'anonymous identity total must include only anonymous rows');
});

await test('BEH aggregate: same Telegram user rename updates same aggregate identity', async () => {
  const games = ['snake', 'tetris'];
  const rows = recomputeAggregateBehavior({
    snake: [{ player: 'OldAlias', score: 100, telegram_id: '123' }],
    tetris: [{ player: 'NewAlias', score: 120, telegram_id: '123' }],
  }, games);
  assert(rows.length === 1, 'same telegram_id across renamed display names must remain one aggregate row');
  const row = rows[0];
  assert(row.identity_key === 'tg:123', 'aggregate identity key should be telegram-based');
  assert(row.total === 220, 'aggregate total should sum scores across games for same telegram identity');
  assert(row.player === 'NewAlias', 'latest display name metadata should be preserved');
});

await test('BEH aggregate: totals are keyed by identity, not display name', async () => {
  const games = ['snake', 'tetris'];
  const rows = recomputeAggregateBehavior({
    snake: [
      { player: 'Guest', score: 40 },
      { player: 'Guest', score: 80, telegram_id: '777' },
    ],
    tetris: [
      { player: 'Guest', score: 60 },
      { player: 'Guest', score: 90, telegram_id: '777' },
    ],
  }, games);
  const anon = rows.find((r) => r.identity_key === 'anon:guest');
  const tg = rows.find((r) => r.identity_key === 'tg:777');
  assert(anon && anon.total === 100, 'anonymous total should be 40 + 60');
  assert(tg && tg.total === 170, 'telegram total should be 80 + 90');
  assert(rows.length === 2, 'display-name collision should not collapse separate identities');
});



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
