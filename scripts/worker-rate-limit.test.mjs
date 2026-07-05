import assert from 'node:assert/strict';
import worker from '../workers/moonboys-api/worker.js';

const BASE_URL = 'https://moonboys-api.test';

function makeEnv(overrides = {}) {
  return {
    RATE_LIMIT_PUBLIC_PER_MINUTE: '3',
    RATE_LIMIT_TELEGRAM_PER_MINUTE: '3',
    ...overrides,
  };
}

async function call(path, {
  method = 'POST',
  body = {},
  ip = '203.0.113.10',
  env = makeEnv(),
} = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'CF-Connecting-IP': ip,
    Origin: 'https://cryptomoonboys.com',
  };
  const init = { method, headers };
  if (method !== 'GET') init.body = JSON.stringify(body);
  return worker.fetch(new Request(`${BASE_URL}${path}`, init), env);
}

async function assertRateLimited(response, label) {
  assert.equal(response.status, 429, `${label} must return 429`);
  assert.equal(response.headers.get('Retry-After') !== null, true, `${label} must include Retry-After`);
  const json = await response.json();
  assert.equal(json.error, 'rate_limited', `${label} must return JSON error payload`);
  assert.equal(Number.isInteger(json.retry_after_seconds), true, `${label} must include retry_after_seconds`);
}

{
  const ip = '203.0.113.31';
  for (let i = 0; i < 3; i++) {
    const res = await call('/telegram/auth', { body: {}, ip });
    assert.notEqual(res.status, 429, `request ${i + 1} should be under the per-IP limit`);
  }
  await assertRateLimited(await call('/telegram/auth', { body: {}, ip }), 'per-IP burst');
}

{
  const telegramId = '777000111';
  for (let i = 0; i < 3; i++) {
    const res = await call('/telegram/auth', {
      body: { id: telegramId },
      ip: `203.0.113.${40 + i}`,
    });
    assert.notEqual(res.status, 429, `request ${i + 1} should be under the per-Telegram limit`);
  }
  await assertRateLimited(await call('/telegram/auth', {
    body: { id: telegramId },
    ip: '203.0.113.99',
  }), 'per-Telegram burst');
}

{
  const ip = '203.0.113.55';
  for (let i = 0; i < 3; i++) {
    const res = await call('/comments?page_id=test', { method: 'GET', ip });
    assert.notEqual(res.status, 429, `comments GET request ${i + 1} should be under the limit`);
  }
  await assertRateLimited(await call('/comments?page_id=test', { method: 'GET', ip }), 'comments GET burst');
}

console.log('Worker public route rate limit burst tests PASSED.');
