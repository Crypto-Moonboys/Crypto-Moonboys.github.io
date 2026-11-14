import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleTelegramConnectivity, probePublicEgress } from '../workers/moonboys-api/telegram-connectivity.js';

const API = 'https://api.cryptomoonboys.com/telegram/connectivity';
const request = (method = 'GET', origin = 'https://cryptomoonboys.com') =>
  new Request(API, { method, headers: { Origin: origin } });

test('fixed-target egress probe requests only tokenless public URLs', async () => {
  const urls = [];
  const results = await probePublicEgress(async (url, opts) => {
    urls.push(url);
    assert.equal(opts.method, 'GET');
    assert.equal(opts.redirect, 'manual');
    assert.ok(opts.signal);
    return new Response(null, { status: url.includes('telegram') ? 404 : 200 });
  }, { now: () => 1234 });
  assert.deepEqual(urls, [
    'https://api.telegram.org/',
    'https://api.telegram.org/bot000000000:INVALID_DIAGNOSTIC_TOKEN/getMe',
    'https://example.com/',
  ]);
  assert.deepEqual(results, {
    telegram_public: { outcome: 'http_response', status_class: '4xx', duration_ms: 0 },
    telegram_invalid_bot_getme: { outcome: 'http_response', status_class: '4xx', duration_ms: 0 },
    external_control: { outcome: 'http_response', status_class: '2xx', duration_ms: 0 },
  });
  assert.doesNotMatch(JSON.stringify(results), /bot\d+:|chat_id|token|secret/i);
});

test('network and timeout categories do not leak raw upstream errors', async () => {
  const calls = [];
  const results = await probePublicEgress(async url => {
    calls.push(url);
    const error = new Error('Sensitive fixture: token 123:secret');
    error.name = calls.length === 1 ? 'TimeoutError' : 'TypeError';
    throw error;
  }, { now: () => 100 });
  assert.equal(results.telegram_public.outcome, 'timeout');
  assert.equal(results.telegram_invalid_bot_getme.outcome, 'network_error');
  assert.equal(results.external_control.outcome, 'network_error');
  assert.doesNotMatch(JSON.stringify(results), /123:secret|Sensitive fixture/);
});

test('diagnostic route never claims membership is verified', async () => {
  const response = await handleTelegramConnectivity(request(), async () =>
    new Response(null, { status: 404 }), { now: () => 100 });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://cryptomoonboys.com');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.diagnostic_only, true);
  assert.equal(data.membership_verified, false);
  assert.equal(Object.keys(data.targets).length, 3);
  assert.equal(data.targets.telegram_invalid_bot_getme.outcome, 'http_response');
});

test('wrong origin or method cannot trigger outbound probes', async () => {
  let calls = 0;
  const probe = async () => { calls++; throw Error('must not run'); };
  const disallowed = await handleTelegramConnectivity(request('GET', 'https://evil.example'), probe);
  assert.equal(disallowed.status, 403);
  assert.equal(disallowed.headers.get('Access-Control-Allow-Origin'), null);
  const post = await handleTelegramConnectivity(request('POST'), probe);
  assert.equal(post.status, 405);
  const unrelated = await handleTelegramConnectivity(new Request('https://api.cryptomoonboys.com/telegram/group-membership', {
    headers: { Origin: 'https://cryptomoonboys.com' },
  }), probe);
  assert.equal(unrelated, null);
  assert.equal(calls, 0);
});


test('invalid Bot API target is synthetic and remains independent of production secrets', async () => {
  const urls = [];
  const response = await handleTelegramConnectivity(request(), async url => {
    urls.push(url);
    return new Response(null, { status: url.includes('INVALID_DIAGNOSTIC_TOKEN') ? 401 : 200 });
  }, { now: () => 100 });
  const body = await response.json();
  assert.deepEqual(body.targets.telegram_invalid_bot_getme, {
    outcome: 'http_response', status_class: '4xx', duration_ms: 0,
  });
  assert.equal(body.membership_verified, false);
  assert.ok(urls[1].endsWith('/bot000000000:INVALID_DIAGNOSTIC_TOKEN/getMe'));
  assert.ok(urls.every(url => !url.includes('REAL_BOT_SECRET') && !url.includes('groupId')));
  // The published, non-sensitive field name telegram_invalid_bot_getme is
  // intentional; reject only actual token/URL payloads, never that field.
  assert.doesNotMatch(JSON.stringify(body),
    /INVALID_DIAGNOSTIC_TOKEN|bot000000000:|REAL_BOT_SECRET|api\.telegram\.org\/bot/i);
});

test('all three outbound checks start without waiting for another check timeout', async () => {
  const started = [];
  const pending = [];
  const promise = probePublicEgress(url => {
    started.push(url);
    return new Promise(resolve => pending.push(resolve));
  }, { now: () => 100 });
  // No timer required: async map launches all three fetches immediately.
  assert.equal(started.length, 3);
  for (const resolve of pending) resolve(new Response(null, { status: 404 }));
  const results = await promise;
  assert.equal(Object.keys(results).length, 3);
});
