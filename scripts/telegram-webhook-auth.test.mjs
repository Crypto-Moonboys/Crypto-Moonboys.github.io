import assert from 'node:assert/strict';
import test from 'node:test';
import { timingSafeEqual } from 'node:crypto';
import worker from '../workers/moonboys-api/worker.js';
import deployedWorker from '../workers/moonboys-api/deployment-entry.js';
import { verifyTelegramWebhookSecret, TELEGRAM_WEBHOOK_SECRET_HEADER } from '../workers/moonboys-api/telegram-webhook-auth.js';

const SECRET = 'fixture-webhook-token_0123456789';
const message = (text) => ({ message: { message_id: 1, from: { id: 876543, first_name: 'Verified' }, chat: { id: -100123, type: 'group' }, text } });
const callback = { callback_query: { id: 'forged', from: { id: 876543 }, data: 'pet:run:saved-run:extract' } };
function requestFor(body, secret, path = '/telegram/webhook') {
  const headers = { 'content-type': 'application/json' };
  if (secret !== undefined) headers[TELEGRAM_WEBHOOK_SECRET_HEADER] = secret;
  return new Request(`https://moonboys-api.test${path}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

for (const [name, entry] of [['base', worker], ['production wrapper', deployedWorker]]) {
  for (const [label, secret, configured, status] of [
    ['missing header', undefined, SECRET, 401],
    ['incorrect header', 'wrong-token', SECRET, 401],
    ['same-length incorrect header', SECRET.replace(/^f/, 'x'), SECRET, 401],
    ['missing Worker secret', SECRET, undefined, 503],
    ['empty Worker secret', SECRET, '', 503],
    ['invalid Worker secret', SECRET, 'invalid value', 503],
  ]) {
    test(`${name}: ${label} rejects before parsing, profile writes, commands or reward repair`, async () => {
      const originalFetch = globalThis.fetch;
      let databaseCalls = 0, telegramCalls = 0;
      globalThis.fetch = async () => { telegramCalls += 1; throw Error('must not send'); };
      try {
        for (const body of [message('/petgear'), message('/gkban 123456'), callback, '{malformed']) {
          for (const path of ['/telegram/webhook', '/telegram/webhook/']) {
            const request = requestFor(body, secret, path);
            let reads = 0;
            request.json = async () => { reads += 1; throw Error('must not parse'); };
            request.clone = () => { reads += 1; throw Error('must not clone'); };
            const response = await entry.fetch(request, {
              TELEGRAM_WEBHOOK_SECRET: configured, TELEGRAM_BOT_TOKEN: 'fixture-bot-token',
              DB: { prepare() { databaseCalls += 1; throw Error('must not read or write'); } },
            });
            assert.equal(response.status, status);
            const responseText = await response.text();
            assert.ok(!responseText.includes(SECRET));
            assert.ok(!responseText.includes('wrong-token'));
            assert.equal(reads, 0);
            assert.equal(request.bodyUsed, false);
          }
        }
        assert.equal(databaseCalls, 0);
        assert.equal(telegramCalls, 0);
      } finally { globalThis.fetch = originalFetch; }
    });
  }

  test(`${name}: a correct secret permits the saved profile update and command response`, async () => {
    const writes = [], sends = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      sends.push({ url: String(url), body: JSON.parse(options.body) });
      return Response.json({ ok: true, result: { message_id: 10 } });
    };
    try {
      const response = await entry.fetch(requestFor(message('/help'), SECRET), {
        TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_BOT_TOKEN: 'fixture-bot-token',
        DB: { prepare(sql) { return { bind(...args) { return { async run() { writes.push({ sql, args }); return { success: true, meta: { changes: 1 } }; } }; } }; } },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
      assert.equal(writes.length, 1);
      assert.match(writes[0].sql, /INSERT INTO telegram_users/);
      assert.equal(writes[0].args[0], '876543');
      assert.equal(sends.length, 1);
      assert.match(sends[0].url, /\/sendMessage$/);
      assert.equal(sends[0].body.chat_id, '-100123');
    } finally { globalThis.fetch = originalFetch; }
  });
}

test('Workers native timing-safe comparison receives fixed-size digests for matching and mismatched tokens', async () => {
  let comparisons = 0;
  const nativeCrypto = { subtle: {
    digest: globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle),
    timingSafeEqual(left, right) {
      comparisons += 1;
      assert.equal(left.byteLength, 32);
      assert.equal(right.byteLength, 32);
      return timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
    },
  } };
  assert.equal((await verifyTelegramWebhookSecret(requestFor({}, SECRET), { TELEGRAM_WEBHOOK_SECRET: SECRET }, nativeCrypto)).ok, true);
  assert.equal((await verifyTelegramWebhookSecret(requestFor({}, 'short'), { TELEGRAM_WEBHOOK_SECRET: SECRET }, nativeCrypto)).ok, false);
  assert.equal(comparisons, 2);
});

test('verification infrastructure failure rejects without exposing the token', async () => {
  const result = await verifyTelegramWebhookSecret(requestFor({}, SECRET), { TELEGRAM_WEBHOOK_SECRET: SECRET }, {
    subtle: { async digest() { throw Error(SECRET); } },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result).includes(SECRET));
});
