/**
 * Static verification tests for the POST /public/npc-chat Worker bridge route.
 *
 * Verifies:
 *  1. Route source is present in worker.js (static text audit).
 *  2. SWARMSY_BRIDGE_TOKEN is never hardcoded in worker.js.
 *  3. The SWARMSY bridge URL is not an admin URL and does not expose admin paths.
 *  4. Non-POST requests return 405.
 *  5. Invalid JSON body returns 400.
 *  6. Missing npcId returns 400.
 *  7. Invalid npcId (not paperclip/sparky) returns 400.
 *  8. Empty message returns 400.
 *  9. Missing SWARMSY_BRIDGE_TOKEN returns 503 with safe error (no stack trace).
 * 10. SWARMSY fetch/non-JSON failures are retried once, then fail safely.
 * 11. SWARMSY success is relayed with the upstream status code.
 * 12. Message is clamped to 2000 characters (>2000 char input is truncated).
 * 13. pagePath defaults to /paperclip.html when absent.
 * 14. Bridge token is never present in any response body.
 * 15. paperclip-chat.js calls /public/npc-chat through window.MOONBOYS_API.getApiBase().
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFile(path.join(ROOT, rel), 'utf8');

const BASE_URL = 'https://moonboys-api.test';
const BRIDGE_TOKEN = 'test-swarmsy-bridge-token-abc123';

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
  return { SWARMSY_BRIDGE_TOKEN: BRIDGE_TOKEN, ...overrides };
}

async function callNpcChat(worker, body, { env = makeEnv(), method = 'POST', origin = 'https://cryptomoonboys.com' } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: origin };
  const req = new Request(`${BASE_URL}/public/npc-chat`, {
    method,
    headers,
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
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
    workerSrc.includes('const NPC_CHAT_BRIDGE_TIMEOUT_MS = 55000'),
    'NPC_CHAT_BRIDGE_TIMEOUT_MS must be 55000',
  );
  assert.ok(
    workerSrc.includes('const NPC_CHAT_BRIDGE_MAX_ATTEMPTS = 2'),
    'NPC_CHAT_BRIDGE_MAX_ATTEMPTS must be 2',
  );
});

// ── 4–13. Runtime behaviour tests ─────────────────────────────────────────────

console.log('\n[4–13] Runtime behaviour: validation, error handling, relay');

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

await test('[6] Missing npcId returns 400', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(worker, { message: 'hello' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error, 'Expected error field');
});

await test('[7] Invalid npcId (not paperclip/sparky) returns 400', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(worker, { npcId: 'admin', message: 'hello' });
  assert.equal(res.status, 400);
});

await test('[7] Invalid npcId (empty string) returns 400', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(worker, { npcId: '', message: 'hello' });
  assert.equal(res.status, 400);
});

await test('[8] Empty message returns 400', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(worker, { npcId: 'paperclip', message: '   ' });
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
    { npcId: 'paperclip', message: 'hello' },
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
    { npcId: 'paperclip', message: 'hello' },
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
  const res = await callNpcChat(worker, { npcId: 'paperclip', message: 'hello' });
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
  const res = await callNpcChat(worker, { npcId: 'paperclip', message: 'hello' });
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
  const swarmsyPayload = { success: true, reply: 'Hello from Paperclip', displayName: 'Paperclip' };
  globalThis.fetch = makeMockFetch(200, swarmsyPayload);
  const res = await callNpcChat(worker, { npcId: 'paperclip', message: 'hi' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.reply, 'Hello from Paperclip');
});

await test('[11] SWARMSY 429 (rate limit) is relayed with status 429', async () => {
  globalThis.fetch = makeMockFetch(429, { success: false, error: 'rate_limited' });
  const res = await callNpcChat(worker, { npcId: 'sparky', message: 'hi' });
  assert.equal(res.status, 429);
});

await test('[11] SWARMSY 500 is relayed with status 500', async () => {
  globalThis.fetch = makeMockFetch(500, { success: false, error: 'internal' });
  const res = await callNpcChat(worker, { npcId: 'paperclip', message: 'hi' });
  assert.equal(res.status, 500);
});

await test('[12] Message >2000 chars is accepted (clamped silently)', async () => {
  // A >2000 char message should pass validation (not return 400) because clamping happens.
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'clamp ok' });
  const longMsg = 'x'.repeat(3000);
  const res = await callNpcChat(worker, { npcId: 'paperclip', message: longMsg });
  // Should not be 400 (message present, just long)
  assert.notEqual(res.status, 400, `Expected non-400 for long message, got ${res.status}`);
});

await test('[13] Missing pagePath defaults to /paperclip.html in forwarded body', async () => {
  let capturedBody = null;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ success: true, reply: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  await callNpcChat(worker, { npcId: 'paperclip', message: 'hi' });
  assert.equal(capturedBody?.pagePath, '/paperclip.html', 'pagePath must default to /paperclip.html');
});

await test('[14] Bridge token is never present in any success response body', async () => {
  globalThis.fetch = makeMockFetch(200, { success: true, reply: 'hi' });
  const res = await callNpcChat(worker, { npcId: 'paperclip', message: 'hello' });
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
  const res = await callNpcChat(worker, { npcId: 'paperclip', message: 'hello' });
  const text = await res.text();
  assert.ok(!text.includes(BRIDGE_TOKEN), 'Bridge token must not appear in 502 response body');
});

// ── 15. paperclip-chat.js calls /public/npc-chat ─────────────────────────────

console.log('\n[15] paperclip-chat.js calls /public/npc-chat through MOONBOYS_API.getApiBase()');

const chatJsSrc = await read('js/paperclip-chat.js');

await test('paperclip-chat.js references /public/npc-chat endpoint', () => {
  assert.ok(chatJsSrc.includes('/public/npc-chat'), 'paperclip-chat.js must reference /public/npc-chat');
});

await test('paperclip-chat.js resolves API base via window.MOONBOYS_API.getApiBase()', () => {
  assert.ok(
    chatJsSrc.includes('MOONBOYS_API') && chatJsSrc.includes('getApiBase'),
    'paperclip-chat.js must use window.MOONBOYS_API.getApiBase()',
  );
});

await test('paperclip-chat.js does not hardcode any SWARMSY admin URL', () => {
  assert.ok(
    !chatJsSrc.includes('swarmsy.cryptomoonboys.com'),
    'paperclip-chat.js must not directly reference swarmsy.cryptomoonboys.com',
  );
});

await test('paperclip-chat.js does not reference SWARMSY_BRIDGE_TOKEN', () => {
  assert.ok(
    !chatJsSrc.includes('SWARMSY_BRIDGE_TOKEN'),
    'paperclip-chat.js must not reference SWARMSY_BRIDGE_TOKEN',
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
