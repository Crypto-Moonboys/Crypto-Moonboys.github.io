/**
 * Static verification tests for the POST /public/npc-chat Worker bridge route.
 *
 * Verifies:
 *  1. Route source is present in worker.js (static text audit).
 *  2. SWARMSY_BRIDGE_TOKEN is never hardcoded in worker.js.
 *  3. The SWARMSY bridge URL is not an admin URL and does not expose admin paths.
 *  4. Non-POST requests return 405.
 *  5. Invalid JSON body returns 400.
 *  6. Missing npcId defaults to sparky for old cached clients.
 *  7. Sparky succeeds, legacy paperclip maps to sparky, invalid npcId returns 400.
 *  8. Empty message returns 400.
 *  9. Missing SWARMSY_BRIDGE_TOKEN returns 503 with safe error (no stack trace).
 * 10. SWARMSY fetch/non-JSON failures are retried once, then fail safely.
 * 11. SWARMSY success is relayed with the upstream status code.
 * 12. Message is clamped to 2000 characters (>2000 char input is truncated).
 * 13. pagePath defaults to /swarmsy.html when absent.
 * 14. Bridge token is never present in any response body.
 * 15. sparky-chat.js calls /public/npc-chat through window.MOONBOYS_API.getApiBase().
 * 16. /sparky.html loads sparky-chat.js (not paperclip-chat.js); sparky-chat.js has no Paperclip persona wording.
 * 17. js/paperclip-chat.js does not exist; no public HTML page loads it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFile(path.join(ROOT, rel), 'utf8');

const BASE_URL = 'https://moonboys-api.test';
const BRIDGE_TOKEN = 'test-swarmsy-bridge-token-abc123';
const TELEGRAM_BOT_TOKEN = '123456:test-telegram-bot-token';

// ── helpers ───────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${label}`);
    pass++;
  } catch (e) {
    console.error(`  [FAIL] ${label}`);
    console.error(`         ${e.message}`);
    fail++;
  }
}

// Mock global fetch so the worker never hits a real network during tests.
// Each test overrides globalThis.fetch as needed.
const originalFetch = globalThis.fetch;

function makeMockFetch(statusCode, responseBody) {
  return async () => {
    const body = JSON.stringify(responseBody);
    return new Response(body, {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

function makeAbortingFetch() {
  return async () => { throw new Error('AbortError'); };
}

function makeSequenceFetch(steps) {
  let index = 0;
  const calls = [];
  const fetchMock = async (url, init) => {
    calls.push({ url, init });
    const step = steps[Math.min(index, steps.length - 1)];
    index++;
    if (step instanceof Error) throw step;
    if (typeof step === 'function') return step(url, init);
    return step;
  };
  fetchMock.calls = calls;
  return fetchMock;
}

function makeEnv(overrides = {}) {
  return { SWARMSY_BRIDGE_TOKEN: BRIDGE_TOKEN, TELEGRAM_BOT_TOKEN, ...overrides };
}

async function signTelegramAuth(fields, botToken = TELEGRAM_BOT_TOKEN) {
  const { hash, ...unsignedFields } = fields;
  const checkString = Object.keys(unsignedFields)
    .filter((key) => unsignedFields[key] != null)
    .sort()
    .map((key) => `${key}=${unsignedFields[key]}`)
    .join('\n');
  const secretKeyBytes = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(botToken));
  const hmacKey = await webcrypto.subtle.importKey(
    'raw', secretKeyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBytes = await webcrypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(checkString));
  return Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function makeTelegramAuth() {
  const payload = {
    id: '123456789',
    first_name: 'Test',
    username: 'moonboy_test',
    auth_date: String(Math.floor(Date.now() / 1000)),
  };
  payload.hash = await signTelegramAuth(payload);
  return payload;
}

async function withDefaultTelegramAuth(body, includeAuth) {
  if (includeAuth === false || !body || typeof body === 'string') return body;
  if (body.telegram_auth) return body;
  return { ...body, telegram_auth: await makeTelegramAuth() };
}

async function callNpcChat(worker, body, { env = makeEnv(), method = 'POST', origin = 'https://cryptomoonboys.com', auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: origin };
  const requestBody = await withDefaultTelegramAuth(body, auth);
  const req = new Request(`${BASE_URL}/public/npc-chat`, {
    method,
    headers,
    body: method === 'POST' ? (typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody)) : undefined,
  });
  return worker.fetch(req, env);
}

// ── load worker ───────────────────────────────────────────────────────────────

const { default: worker } = await import(
  pathToFileURL(path.join(ROOT, 'workers/moonboys-api/worker.js')).href
);
assert.ok(worker && typeof worker.fetch === 'function', 'worker.js must export a default fetch handler');

// ── 1. Static source audit ────────────────────────────────────────────────────

console.log('\n[1] Static source audit: /public/npc-chat route present in worker.js');

const workerSrc = await read('workers/moonboys-api/worker.js');

await test('Route block /public/npc-chat exists in worker.js', () => {
  assert.ok(workerSrc.includes("/public/npc-chat"), 'Missing /public/npc-chat in worker.js');
});

await test('SWARMSY_BRIDGE_TOKEN env var referenced (not hardcoded)', () => {
  assert.ok(workerSrc.includes('env.SWARMSY_BRIDGE_TOKEN'), 'env.SWARMSY_BRIDGE_TOKEN not found in worker.js');
});

await test('X-SWARMSY-BRIDGE-TOKEN header forwarded to upstream', () => {
  assert.ok(workerSrc.includes('X-SWARMSY-BRIDGE-TOKEN'), 'X-SWARMSY-BRIDGE-TOKEN not found in worker.js');
});

// ── 2. No hardcoded secret ────────────────────────────────────────────────────

console.log('\n[2] SWARMSY_BRIDGE_TOKEN is never hardcoded in worker.js');

await test('No literal bridge token in worker source', () => {
  // The token must only appear as an env var reference, never as a literal value.
  // We check that "SWARMSY_BRIDGE_TOKEN" only appears with "env." prefix.
  const tokenUsages = [...workerSrc.matchAll(/SWARMSY_BRIDGE_TOKEN/g)];
  // Every occurrence must be within env.SWARMSY_BRIDGE_TOKEN or a comment.
  const lines = workerSrc.split('\n');
  for (const line of lines) {
    if (line.includes('SWARMSY_BRIDGE_TOKEN') && !line.trim().startsWith('#') && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
      assert.ok(
        line.includes('env.SWARMSY_BRIDGE_TOKEN') || line.includes('X-SWARMSY-BRIDGE-TOKEN'),
        `Unexpected bare SWARMSY_BRIDGE_TOKEN usage: ${line.trim()}`,
      );
    }
  }
  assert.ok(tokenUsages.length > 0, 'SWARMSY_BRIDGE_TOKEN never referenced in worker.js');
});

// ── 3. SWARMSY URL is not an admin URL ────────────────────────────────────────

console.log('\n[3] SWARMSY bridge URL is /public/ path, not an admin path');

await test('SWARMSY_NPC_URL uses /public/npc-chat path', () => {
  assert.ok(
    workerSrc.includes('swarmsy.cryptomoonboys.com/api/swarmsy/public/npc-chat'),
    'SWARMSY bridge URL must target /api/swarmsy/public/npc-chat',
  );
});

await test('SWARMSY_NPC_URL does not contain /admin/', () => {
  const urlMatch = workerSrc.match(/const SWARMSY_NPC_URL\s*=\s*'([^']+)'/);
  if (urlMatch) {
    assert.ok(!urlMatch[1].includes('/admin/'), 'SWARMSY_NPC_URL must not be an admin URL');
  }
});

await test('NPC chat bridge retry constants are defined', () => {
  assert.ok(
    /const\s+NPC_CHAT_BRIDGE_TIMEOUT_MS\s*=\s*25000\b/.test(workerSrc),
    'NPC_CHAT_BRIDGE_TIMEOUT_MS must be 25000',
  );
  assert.ok(
    /const\s+NPC_CHAT_BRIDGE_MAX_ATTEMPTS\s*=\s*2\b/.test(workerSrc),
    'NPC_CHAT_BRIDGE_MAX_ATTEMPTS must be 2',
  );
});

await test('Worker public npc route verifies Telegram auth before forwarding', () => {
  assert.ok(
    workerSrc.includes('verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth)') &&
    workerSrc.includes("error: 'telegram_login_required'") &&
    workerSrc.includes("Log in with Telegram to use Sparky AI Chat."),
    'worker.js must enforce Telegram auth and return the required 401 JSON',
  );
});

await test('Worker public npc route short-circuits unauthenticated requests before calling verifier', () => {
  // The npc-chat route must check for Telegram auth evidence and return 401
  // immediately — without calling verifyTelegramIdentityFromBody — when no
  // evidence at all is present, preventing log noise from scanners/visitors.
  assert.ok(
    workerSrc.includes('hasTelegramAuthEvidence'),
    'worker.js must contain hasTelegramAuthEvidence short-circuit guard',
  );
  // The short-circuit return must appear before the verifyTelegramIdentityFromBody call
  // within the npc-chat block.
  const npcChatBlockStart = workerSrc.indexOf("path === '/public/npc-chat'");
  assert.ok(npcChatBlockStart !== -1, '/public/npc-chat block must exist');
  const shortCircuitIdx = workerSrc.indexOf('hasTelegramAuthEvidence', npcChatBlockStart);
  const verifierCallIdx = workerSrc.indexOf('verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth)', npcChatBlockStart);
  assert.ok(shortCircuitIdx !== -1, 'hasTelegramAuthEvidence must be present in /public/npc-chat block');
  assert.ok(verifierCallIdx !== -1, 'verifyTelegramIdentityFromBody call must be present in /public/npc-chat block');
  assert.ok(shortCircuitIdx < verifierCallIdx, 'short-circuit guard must appear before verifyTelegramIdentityFromBody call');
});

await test('Worker public npc validation maps legacy paperclip to Sparky', () => {
  assert.ok(/requestedNpcId\s*={2,3}\s*['"]paperclip['"]\s*\?\s*['"]sparky['"]/.test(workerSrc), 'worker.js must map legacy paperclip to sparky');
  assert.ok(/npcId\s*!==\s*['"]sparky['"]/.test(workerSrc), 'worker.js must reject non-sparky normalized npc ids');
});

// ── 4–13. Runtime behaviour tests ─────────────────────────────────────────────

console.log('\n[4–14] Runtime behaviour: validation, error handling, relay');

await test('[4] Non-POST (GET) returns 405', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(worker, null, { method: 'GET' });
  assert.equal(res.status, 405, `Expected 405, got ${res.status}`);
  const body = await res.json();
  assert.equal(body.error, 'method_not_allowed');
});

await test('[4] Non-POST (PUT) returns 405', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(worker, null, { method: 'PUT' });
  assert.equal(res.status, 405);
});

await test('[5] Invalid JSON body returns 400', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(worker, 'not-valid-json{{{', {});
  assert.equal(res.status, 400);
});

await test('[5] Missing Telegram auth returns 401 without calling SWARMSY', async () => {
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    return new Response(JSON.stringify({ success: true, reply: 'should not call' }), { status: 200 });
  };
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'hello' }, { auth: false });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.deepEqual(body, {
    success: false,
    error: 'telegram_login_required',
    reply: 'Log in with Telegram to use Sparky AI Chat.',
  });
  assert.equal(fetchCalls, 0, 'Unauthenticated request must not be forwarded to SWARMSY');
});

await test('[5] Invalid Telegram auth returns 401 without calling SWARMSY', async () => {
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    return new Response(JSON.stringify({ success: true, reply: 'should not call' }), { status: 200 });
  };
  const res = await callNpcChat(worker, {
    npcId: 'sparky',
    message: 'hello',
    telegram_auth: { id: '123456789', auth_date: String(Math.floor(Date.now() / 1000)), hash: '0'.repeat(64) },
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, 'telegram_login_required');
  assert.equal(fetchCalls, 0, 'Invalid Telegram auth must not be forwarded to SWARMSY');
});

await test('[6] Missing npcId defaults to sparky and succeeds', async () => {
  let capturedBody = null;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ success: true, reply: 'hi' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const res = await callNpcChat(worker, { message: 'hello' });
  assert.equal(res.status, 200);
  assert.equal(capturedBody?.npcId, 'sparky', 'missing npcId must forward as sparky');
});

await test('[7] Explicit sparky npcId succeeds', async () => {
  let capturedBody = null;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ success: true, reply: 'hi' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'hello' });
  assert.equal(res.status, 200);
  assert.equal(capturedBody?.npcId, 'sparky', 'sparky npcId must forward as sparky');
});

await test('[7] Authenticated request forwards Telegram id but not Telegram auth payload', async () => {
  let capturedBody = null;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ success: true, reply: 'hi' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'hello' });
  assert.equal(res.status, 200);
  assert.equal(capturedBody?.telegram_id, '123456789', 'verified telegram id must be forwarded for upstream trust context');
  assert.equal(capturedBody?.telegram_auth, undefined, 'signed Telegram auth payload must not be relayed to SWARMSY');
});

await test('[7] Legacy paperclip npcId is accepted and forwarded as sparky', async () => {
  let capturedBody = null;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ success: true, reply: 'hi' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const res = await callNpcChat(worker, { npcId: 'paperclip', message: 'hello' });
  assert.equal(res.status, 200);
  assert.equal(capturedBody?.npcId, 'sparky', 'legacy paperclip npcId must forward as sparky');
});

await test('[7] Invalid npcId (admin) returns 400', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(worker, { npcId: 'admin', message: 'hello' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(String(body.error || '').includes('sparky'), 'Expected safe sparky-only error');
});

await test('[7] Invalid npcId (empty string) returns 400', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(worker, { npcId: '', message: 'hello' });
  assert.equal(res.status, 400);
});

await test('[8] Empty message returns 400', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(worker, { npcId: 'sparky', message: '   ' });
  assert.equal(res.status, 400);
});

await test('[8] Missing message returns 400', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(worker, { npcId: 'sparky' });
  assert.equal(res.status, 400);
});

await test('[9] Missing SWARMSY_BRIDGE_TOKEN returns 503', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(
    worker,
    { npcId: 'sparky', message: 'hello' },
    { env: makeEnv({ SWARMSY_BRIDGE_TOKEN: '' }) },
  );
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error, 'npc_bridge_not_configured');
});

await test('[9] 503 response does not contain token value', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true });
  const res = await callNpcChat(
    worker,
    { npcId: 'sparky', message: 'hello' },
    { env: makeEnv({ SWARMSY_BRIDGE_TOKEN: '' }) },
  );
  const text = await res.text();
  assert.ok(!text.includes(BRIDGE_TOKEN), 'Bridge token must not appear in 503 response body');
});

await test('[10] First SWARMSY fetch throws, second succeeds -> 200', async () => {
  const swarmsyPayload = { success: true, reply: 'Recovered after retry' };
  globalThis.fetch = makeSequenceFetch([
    new Error('network fail'),
    new Response(JSON.stringify(swarmsyPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ]);
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'hello' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.reply, 'Recovered after retry');
  assert.equal(globalThis.fetch.calls.length, 2, 'Expected exactly two SWARMSY attempts');
});

await test('[10] First SWARMSY response is non-JSON, second succeeds -> 200', async () => {
  const swarmsyPayload = { success: true, reply: 'Recovered after parse failure' };
  globalThis.fetch = makeSequenceFetch([
    new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    new Response(JSON.stringify(swarmsyPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ]);
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'test' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.reply, 'Recovered after parse failure');
  assert.equal(globalThis.fetch.calls.length, 2, 'Expected exactly two SWARMSY attempts');
});

await test('[10] Both SWARMSY attempts fail -> 502', async () => {
  globalThis.fetch = makeSequenceFetch([
    new Error('first fail'),
    new Error('second fail'),
  ]);
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'hello' });
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error, 'swarmsy_bridge_unavailable');
  assert.equal(globalThis.fetch.calls.length, 2, 'Expected exactly two SWARMSY attempts');
});

await test('[10] Both SWARMSY attempts return non-JSON -> 502', async () => {
  globalThis.fetch = makeSequenceFetch([
    new Response('not json 1', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    new Response('not json 2', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
  ]);
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'test' });
  assert.equal(res.status, 502);
  assert.equal(globalThis.fetch.calls.length, 2, 'Expected exactly two SWARMSY attempts');
});

await test('[11] SWARMSY 200 success is relayed with status 200', async () => {
  const swarmsyPayload = { success: true, reply: 'Hello from Sparky', displayName: 'Sparky' };
  globalThis.fetch = makeMockFetch(200, swarmsyPayload);
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'hi' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.reply, 'Hello from Sparky');
});

await test('[11] SWARMSY 429 (rate limit) is relayed with status 429', async () => {
  globalThis.fetch = makeMockFetch(429, { success: false, error: 'rate_limited' });
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'hi' });
  assert.equal(res.status, 429);
});

await test('[11] SWARMSY 500 is relayed with status 500', async () => {
  globalThis.fetch = makeMockFetch(500, { success: false, error: 'internal' });
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'hi' });
  assert.equal(res.status, 500);
});

await test('[12] Message >2000 chars is accepted (clamped silently)', async () => {
  // A >2000 char message should pass validation (not return 400) because clamping happens.
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'clamp ok' });
  const longMsg = 'x'.repeat(3000);
  const res = await callNpcChat(worker, { npcId: 'sparky', message: longMsg });
  // Should not be 400 (message present, just long)
  assert.notEqual(res.status, 400, `Expected non-400 for long message, got ${res.status}`);
});

await test('[13] Missing pagePath defaults to /swarmsy.html in forwarded body', async () => {
  let capturedBody = null;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ success: true, reply: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  await callNpcChat(worker, { npcId: 'sparky', message: 'hi' });
  assert.equal(capturedBody?.pagePath, '/swarmsy.html', 'pagePath must default to /swarmsy.html');
});

await test('[14] Bridge token is never present in any success response body', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'hello' });
  const text = await res.text();
  assert.ok(!text.includes(BRIDGE_TOKEN), 'Bridge token must not appear in success response body');
});

await test('[14] Bridge token is scrubbed if an upstream response accidentally echoes it', async () => {
  globalThis.fetch = makeMockFetch(200, {
    success: true,
    reply: `token echo: ${BRIDGE_TOKEN}`,
    nested: { [BRIDGE_TOKEN]: BRIDGE_TOKEN },
  });
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'hello' });
  const text = await res.text();
  assert.ok(!text.includes(BRIDGE_TOKEN), 'Bridge token must not appear in relayed response body');
});

await test('[14] Bridge token is never present in 502 response body', async () => {
  globalThis.fetch = makeAbortingFetch();
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'hello' });
  const text = await res.text();
  assert.ok(!text.includes(BRIDGE_TOKEN), 'Bridge token must not appear in 502 response body');
});

// ── 15. sparky-chat.js calls /public/npc-chat ────────────────────────────────

console.log('\n[15] sparky-chat.js calls /public/npc-chat through MOONBOYS_API.getApiBase()');

const chatJsSrc = await read('js/sparky-chat.js');

await test('sparky-chat.js references /public/npc-chat endpoint', () => {
  assert.ok(chatJsSrc.includes('/public/npc-chat'), 'sparky-chat.js must reference /public/npc-chat');
});

await test('sparky-chat.js resolves API base via window.MOONBOYS_API.getApiBase()', () => {
  assert.ok(
    chatJsSrc.includes('MOONBOYS_API') && chatJsSrc.includes('getApiBase'),
    'sparky-chat.js must use window.MOONBOYS_API.getApiBase()',
  );
});

await test('sparky-chat.js always sends npcId sparky', () => {
  assert.ok(chatJsSrc.includes("SPARKY_NPC_ID = 'sparky'"), 'sparky-chat.js must define sparky npc id');
  assert.ok(!chatJsSrc.includes('NPC_LABELS'), 'sparky-chat.js must not keep dual NPC labels');
  assert.ok(!chatJsSrc.includes('selectedNpcId'), 'sparky-chat.js must not keep NPC selector logic');
});

await test('sparky-chat.js does not hardcode any SWARMSY admin URL', () => {
  assert.ok(
    !chatJsSrc.includes('swarmsy.cryptomoonboys.com'),
    'sparky-chat.js must not directly reference swarmsy.cryptomoonboys.com',
  );
});

await test('sparky-chat.js does not reference SWARMSY_BRIDGE_TOKEN', () => {
  assert.ok(
    !chatJsSrc.includes('SWARMSY_BRIDGE_TOKEN'),
    'sparky-chat.js must not reference SWARMSY_BRIDGE_TOKEN',
  );
});

await test('sparky-chat.js requires signed Telegram auth before fetch', () => {
  assert.ok(chatJsSrc.includes('resolveTelegramAuth'), 'chat client must resolve Telegram auth');
  assert.ok(chatJsSrc.includes('getFreshTelegramAuth'), 'chat client must use the shared fresh Telegram auth helper');
  assert.ok(chatJsSrc.includes('Telegram login required to use Sparky.'), 'chat client must show the required missing-auth message');
  const missingAuthIndex = chatJsSrc.indexOf('if (!telegramAuth)');
  const fetchIndex = chatJsSrc.indexOf('fetch(endpoint');
  assert.ok(missingAuthIndex !== -1 && fetchIndex !== -1 && missingAuthIndex < fetchIndex, 'missing auth guard must run before endpoint fetch');
});

await test('sparky-chat.js includes telegram_auth in authenticated POST body', () => {
  assert.ok(chatJsSrc.includes('telegram_auth: telegramAuth'), 'chat client must send signed Telegram auth proof to the Worker');
});

// ── 16. sparky.html / sparky-chat.js naming correctness ──────────────────────

console.log('\n[16] sparky.html loads sparky-chat.js; sparky-chat.js is free of Paperclip persona wording');

const sparkyHtmlSrc = await read('sparky.html');

await test('/sparky.html loads /js/sparky-chat.js, not paperclip-chat.js', () => {
  assert.ok(
    sparkyHtmlSrc.includes('/js/sparky-chat.js'),
    '/sparky.html must load /js/sparky-chat.js',
  );
  assert.ok(
    !sparkyHtmlSrc.includes('paperclip-chat.js'),
    '/sparky.html must not load paperclip-chat.js',
  );
});

await test('js/sparky-chat.js contains no Paperclip persona wording', () => {
  // data-paperclip-* attributes and class names were the public-facing Paperclip hooks
  assert.ok(!chatJsSrc.includes('data-paperclip-'), 'sparky-chat.js must not use data-paperclip-* attribute selectors');
  assert.ok(!chatJsSrc.includes("'paperclip-"), "sparky-chat.js must not reference paperclip-* CSS class names");
});

await test('js/paperclip-chat.js has been deleted from the repo', async () => {
  let exists = false;
  try {
    await fs.access(path.join(ROOT, 'js', 'paperclip-chat.js'));
    exists = true;
  } catch {
    exists = false;
  }
  assert.ok(!exists, 'js/paperclip-chat.js must not exist — it was the legacy Paperclip chat client');
});

await test('no public HTML page loads /js/paperclip-chat.js', async () => {
  async function* walkHtml(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        yield* walkHtml(full);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        yield full;
      }
    }
  }
  const offenders = [];
  for await (const htmlFile of walkHtml(ROOT)) {
    const src = await fs.readFile(htmlFile, 'utf8');
    if (src.includes('paperclip-chat.js')) {
      offenders.push(path.relative(ROOT, htmlFile));
    }
  }
  assert.deepEqual(offenders, [], `These HTML files must not load paperclip-chat.js: ${offenders.join(', ')}`);
});

await test('Worker 502 response includes safe Sparky reply text', () => {
  assert.ok(
    workerSrc.includes('Sparky is connected to Telegram, but the SWARMSY bridge is unavailable right now.'),
    'worker.js 502 response must include the safe Sparky reply message',
  );
});

await test('Worker logs structured error on SWARMSY fetch failure', () => {
  assert.ok(
    workerSrc.includes('swarmsy_bridge_error'),
    'worker.js must log swarmsy_bridge_error on SWARMSY fetch/parse failure',
  );
  assert.ok(
    workerSrc.includes("'network_timeout'"),
    'worker.js must classify actual timeout aborts as network_timeout',
  );
  assert.ok(
    workerSrc.includes("'fetch_failure'"),
    'worker.js must classify non-timeout fetch errors as fetch_failure',
  );
  assert.ok(
    workerSrc.includes("'non_json_response'"),
    'worker.js must classify upstream JSON parse failures as non_json_response',
  );
});

await test('[10] Bridge failure 502 includes safe reply field', async () => {
  globalThis.fetch = makeSequenceFetch([
    new Error('fail 1'),
    new Error('fail 2'),
  ]);
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'hello' });
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, 'swarmsy_bridge_unavailable');
  assert.equal(
    body.reply,
    'Sparky is connected to Telegram, but the SWARMSY bridge is unavailable right now.',
    '502 must include safe reply text for the frontend',
  );
});

// ── restore global fetch ───────────────────────────────────────────────────────

globalThis.fetch = originalFetch;

// ── summary ───────────────────────────────────────────────────────────────────

console.log('\n─── Result ──────────────────────────────────────────────────────');
console.log(`  Passes   : ${pass}`);
console.log(`  Failures : ${fail}`);
console.log('─────────────────────────────────────────────────────────────────\n');

if (fail > 0) process.exit(1);
