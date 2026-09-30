import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const PROBE = new URL('./moonpet-production-health-probe.mjs', import.meta.url);
const ALERT = new URL('./moonpet-production-health-alert.mjs', import.meta.url);
const WORKFLOW = readFileSync(new URL('../.github/workflows/moonpet-production-health.yml', import.meta.url), 'utf8');
const PROBE_SOURCE = readFileSync(PROBE, 'utf8');
const COMMIT = 'a'.repeat(40);
const BOT_TOKEN = '123456:canary-secret';
const TELEGRAM_ID = '9007199254740993';

function run(script, env = {}, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script.pathname], {
      cwd,
      env: { ...process.env, ...env },
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
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  assert.equal(supplied, createHmac('sha256', secret).update(checkString).digest('hex'));
}

function validState() {
  return {
    adopted: true,
    pet: { pet_id: 'health-pet', pet_xp: 10, energy: 90, health: 100 },
    capabilities: {}, cooldowns: { entries: [] }, inventory: [],
    guidance: { missions: [] }, season_slots: { slots: [] },
  };
}

async function withServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('scheduled workflow probes twice, deduplicates incidents and alerts only on state changes', () => {
  assert.match(WORKFLOW, /cron: "\*\/15 \* \* \* \*"/);
  assert.match(WORKFLOW, /^\s+workflow_dispatch:/m);
  assert.match(WORKFLOW, /permissions:[\s\S]*contents: read[\s\S]*issues: write/);
  assert.match(WORKFLOW, /environment: production/);
  assert.equal((WORKFLOW.match(/node scripts\/moonpet-production-health-probe\.mjs/g) || []).length, 2);
  assert.match(PROBE_SOURCE, /MOONPET_CANARY_ACTION: 'none'/);
  assert.match(PROBE_SOURCE, /MOONPET_CANARY_ALLOW_ACTION: '0'/);
  assert.match(WORKFLOW, /gh issue list --state open --label production-alert/);
  assert.match(WORKFLOW, /notify=failed/);
  assert.match(WORKFLOW, /notify=recovered/);
  assert.match(WORKFLOW, /secrets\.TELEGRAM_BOT_TOKEN/);
  assert.match(WORKFLOW, /secrets\.TELEGRAM_GROUP_CHAT_ID/);
});

test('health probe verifies health, provenance, authenticated state and both leaderboards without gameplay actions', async () => {
  const requests = [];
  await withServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push([request.method, request.url]);
    response.setHeader('content-type', 'application/json');
    if (request.url === '/health') return response.end(JSON.stringify({ ok: true }));
    if (request.url === '/deployment-info') return response.end(JSON.stringify({ commit: COMMIT }));
    if (request.url === '/telegram-pets/app/state') {
      verifyInitData(JSON.parse(body).init_data);
      return response.end(JSON.stringify({ ok: true, state: validState() }));
    }
    if (request.url === '/telegram-pets/app/leaderboard') {
      verifyInitData(JSON.parse(body).init_data);
      return response.end(JSON.stringify({ period: 'seasonal', entries: [] }));
    }
    if (request.url.startsWith('/telegram-pets/leaderboard?')) return response.end(JSON.stringify({ period: 'seasonal', entries: [] }));
    response.statusCode = 404; response.end('{}');
  }, async (baseUrl) => {
    const result = await run(PROBE, {
      MOONPET_CANARY_BASE_URL: baseUrl,
      MOONPET_CANARY_BOT_TOKEN: BOT_TOKEN,
      MOONPET_CANARY_TELEGRAM_ID: TELEGRAM_ID,
      MOONPET_HEALTH_SKIP_GIT_CHECK: '1',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).deployed_commit, COMMIT);
    assert.equal(requests.some(([, url]) => url === '/telegram-pets/app/action'), false);
    assert.doesNotMatch(result.stdout + result.stderr, /canary-secret|init_data/);
  });
});

test('Telegram alert sends the configured chat and optional topic without logging secrets', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'moonpet-health-'));
  writeFileSync(path.join(directory, 'report.json'), JSON.stringify({
    checked_at: '2026-09-30T05:00:00.000Z', deployed_commit: COMMIT,
    summary: 'Two consecutive production probes failed.',
  }));
  let received;
  await withServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received = { url: request.url, body: JSON.parse(body) };
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  }, async (apiBase) => {
    const result = await run(ALERT, {
      TELEGRAM_API_BASE_URL: apiBase,
      TELEGRAM_BOT_TOKEN: '999:alert-secret',
      TELEGRAM_GROUP_CHAT_ID: '-1001234567890',
      TELEGRAM_GROUP_THREAD_ID: '42',
      MOONPET_ALERT_STATE: 'failed',
      MOONPET_ALERT_RUN_URL: 'https://github.com/example/actions/runs/1',
      MOONPET_HEALTH_REPORT: 'report.json',
    }, directory);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(received.url, '/bot999:alert-secret/sendMessage');
    assert.equal(received.body.chat_id, '-1001234567890');
    assert.equal(received.body.message_thread_id, 42);
    assert.match(received.body.text, /MOONPET PRODUCTION ALERT/);
    assert.doesNotMatch(result.stdout + result.stderr, /alert-secret/);
  });
});
