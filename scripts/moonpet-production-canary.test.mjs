import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SCRIPT = new URL('./moonpet-production-canary.mjs', import.meta.url);
const WORKFLOW = readFileSync(new URL('../.github/workflows/moonpet-production-canary.yml', import.meta.url), 'utf8');
const COMMIT = 'a'.repeat(40);
const TOKEN = '123456:test-canary-secret';
const TELEGRAM_ID = '987654321';

function runCanary(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT.pathname], {
      env: { ...process.env, MOONPET_EXPECTED_COMMIT: COMMIT, MOONPET_CANARY_BOT_TOKEN: TOKEN,
        MOONPET_CANARY_TELEGRAM_ID: TELEGRAM_ID, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function verifyInitData(value) {
  const params = new URLSearchParams(value);
  const supplied = params.get('hash');
  params.delete('hash');
  const checkString = [...params.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${key}=${item}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest('hex');
  assert.equal(supplied, expected);
  assert.equal(String(JSON.parse(params.get('user')).id), TELEGRAM_ID);
}

function validState() {
  return {
    adopted: true,
    pet: { pet_id: 'canary-pet', pet_xp: 100, energy: 90, health: 100 },
    capabilities: { arena: { active: false } },
    cooldowns: { entries: [] },
    inventory: [],
    guidance: { missions: [] },
    season_slots: { slots: [] },
  };
}

async function withServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('canary workflow is manual-only and keeps credentials in secrets and POST bodies', () => {
  assert.match(WORKFLOW, /^\s*workflow_dispatch:/m);
  assert.doesNotMatch(WORKFLOW, /^\s*(pull_request|push|schedule|workflow_run):/m);
  assert.match(WORKFLOW, /secrets\.MOONPET_CANARY_BOT_TOKEN/);
  assert.match(WORKFLOW, /secrets\.MOONPET_CANARY_TELEGRAM_ID/);
  const source = readFileSync(SCRIPT, 'utf8');
  assert.doesNotMatch(source, /searchParams\.(?:set|append)\([^\n]*init_data/);
  assert.match(source, /MOONPET_CANARY_ALLOW_WRITES/);
});

test('canary refuses even state reads without explicit write acknowledgment', async () => {
  const result = await runCanary({ MOONPET_CANARY_BASE_URL: 'http://127.0.0.1:1', MOONPET_CANARY_ALLOW_WRITES: '0' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ALLOW_WRITES=1 is required/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('canary validates deployment, signed state, private leaderboard and public leaderboard', async () => {
  const requests = [];
  await withServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method, url: request.url, body });
    response.setHeader('content-type', 'application/json');
    if (request.url === '/deployment-info') return response.end(JSON.stringify({ commit: COMMIT }));
    if (request.url === '/telegram-pets/app/state') {
      const parsed = JSON.parse(body); verifyInitData(parsed.init_data);
      return response.end(JSON.stringify({ ok: true, state: validState() }));
    }
    if (request.url === '/telegram-pets/app/leaderboard') {
      const parsed = JSON.parse(body); verifyInitData(parsed.init_data);
      return response.end(JSON.stringify({ period: 'seasonal', entries: [{ rank: 1, pet_id: 'leader', pet_xp: 500 }], self: null }));
    }
    if (request.url.startsWith('/telegram-pets/leaderboard?')) return response.end(JSON.stringify({ period: 'seasonal', entries: [{ rank: 1, pet_id: 'leader', pet_xp: 500 }] }));
    response.statusCode = 404; response.end('{}');
  }, async (baseUrl) => {
    const result = await runCanary({ MOONPET_CANARY_BASE_URL: baseUrl, MOONPET_CANARY_ALLOW_WRITES: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, true);
    assert.deepEqual(requests.map(({ method, url }) => [method, url]), [
      ['GET', '/deployment-info'],
      ['POST', '/telegram-pets/app/state'],
      ['POST', '/telegram-pets/app/leaderboard'],
      ['GET', '/telegram-pets/leaderboard?period=seasonal&limit=10'],
    ]);
    assert.ok(requests.every(({ url }) => !url.includes('init_data') && !url.includes(TOKEN)));
    assert.doesNotMatch(result.stdout + result.stderr, /test-canary-secret|init_data/);
  });
});

test('canary checks provenance before auth and guards optional gameplay actions', async () => {
  let requestCount = 0;
  await withServer((_request, response) => {
    requestCount += 1;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ commit: 'b'.repeat(40) }));
  }, async (baseUrl) => {
    const mismatch = await runCanary({ MOONPET_CANARY_BASE_URL: baseUrl, MOONPET_CANARY_ALLOW_WRITES: '1' });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /does not match/);
    assert.equal(requestCount, 1);
    const guarded = await runCanary({ MOONPET_CANARY_BASE_URL: baseUrl, MOONPET_CANARY_ALLOW_WRITES: '1', MOONPET_CANARY_ACTION: 'feed' });
    assert.notEqual(guarded.status, 0);
    assert.match(guarded.stderr, /ALLOW_ACTION=1 is required/);
    assert.equal(requestCount, 1, 'action guard must fail before any network request');
  });
});

test('explicit action mode uses a commit-stable idempotency key', async () => {
  let actionBody = null;
  await withServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    response.setHeader('content-type', 'application/json');
    if (request.url === '/deployment-info') return response.end(JSON.stringify({ commit: COMMIT }));
    if (request.url === '/telegram-pets/app/state') return response.end(JSON.stringify({ ok: true, state: validState() }));
    if (request.url === '/telegram-pets/app/leaderboard') return response.end(JSON.stringify({ period: 'seasonal', entries: [] }));
    if (request.url.startsWith('/telegram-pets/leaderboard?')) return response.end(JSON.stringify({ period: 'seasonal', entries: [] }));
    if (request.url === '/telegram-pets/app/action') {
      actionBody = JSON.parse(body); verifyInitData(actionBody.init_data);
      return response.end(JSON.stringify({ ok: true, result: { accepted: true, duplicate: false, reason: 'pet_feed' }, state: validState() }));
    }
    response.statusCode = 404; response.end('{}');
  }, async (baseUrl) => {
    const result = await runCanary({ MOONPET_CANARY_BASE_URL: baseUrl, MOONPET_CANARY_ALLOW_WRITES: '1',
      MOONPET_CANARY_ACTION: 'feed', MOONPET_CANARY_ALLOW_ACTION: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(actionBody.action, 'feed');
    assert.equal(actionBody.request_id, `production-canary:${COMMIT}:feed`);
  });
});
