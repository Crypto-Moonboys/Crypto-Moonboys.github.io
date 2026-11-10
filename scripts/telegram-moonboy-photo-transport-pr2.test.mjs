import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TELEGRAM_PHOTO_CAPTION_LIMIT, TELEGRAM_PHOTO_MAX_BYTES,
  sendTelegramMoonboyMessage
} from '../workers/moonboys-api/telegram/moonboy-photo-transport.js';

const token = '123456789:abcdefghijklmnopqrstuvwxyzABCDE';
const chatId = '-1001234567890';
const topic = 9876;
const photo = () => ({
  mimeType: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  width: 640, height: 640
});
const ok = (id, photoId) => new Response(JSON.stringify({
  ok: true, result: { message_id: id, ...(photoId ? { photo: [{ file_id: photoId }] } : {}) }
}), { status: 200, headers: { 'Content-Type': 'application/json' } });
const reject = (status = 400) => new Response(JSON.stringify({
  ok: false, error_code: status, description: 'Bad Request: photo rejected'
}), { status, headers: { 'Content-Type': 'application/json' } });
const harness = (...responses) => {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const item = responses[calls.length - 1];
      if (item instanceof Error) throw item;
      if (typeof item === 'function') return item(url, init);
      return item || ok(calls.length);
    }
  };
};
const base = (h, overrides = {}) => ({
  token, chatId, text: 'TAG RUN · STREET CRED', photo: photo(),
  options: { message_thread_id: topic, disable_notification: true,
    reply_markup: { inline_keyboard: [[{ text: 'Open', url: 'https://cryptomoonboys.com/' }]] } },
  fetchImpl: h.fetchImpl, ...overrides
});
const jsonBody = call => JSON.parse(call.init.body);

test('sends exactly one JPEG photo with original caption, topic and reply markup', async () => {
  const h = harness(ok(42, 'file-id-42'));
  const result = await sendTelegramMoonboyMessage(base(h));
  assert.deepEqual(result, {
    status: 'sent', telegramMessageId: 42, telegramFileId: 'file-id-42',
    method: 'sendPhoto', photoSkipped: false
  });
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /\/sendPhoto$/);
  assert.equal(h.calls[0].init.method, 'POST');
  assert.equal(h.calls[0].init.headers, undefined, 'multipart boundary must be auto-generated');
  const form = h.calls[0].init.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get('chat_id'), chatId);
  assert.equal(form.get('caption'), 'TAG RUN · STREET CRED');
  assert.equal(form.get('message_thread_id'), String(topic));
  assert.equal(form.get('disable_notification'), 'true');
  assert.deepEqual(JSON.parse(form.get('reply_markup')), base(h).options.reply_markup);
  const image = form.get('photo');
  assert.equal(image.type, 'image/jpeg');
  assert.equal(image.name, 'moonboy.jpg');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), photo().bytes);
});

test('HTML formatting, reply target and topic are preserved for photo', async () => {
  const h = harness();
  await sendTelegramMoonboyMessage(base(h, {
    text: '<b>Rank up!</b>',
    options: { parse_mode: 'HTML', message_thread_id: topic,
      reply_to_message_id: 17, allow_sending_without_reply: true,
      protect_content: true }
  }));
  const form = h.calls[0].init.body;
  assert.equal(form.get('caption'), '<b>Rank up!</b>');
  assert.equal(form.get('parse_mode'), 'HTML');
  assert.equal(form.get('message_thread_id'), String(topic));
  assert.equal(form.get('reply_to_message_id'), '17');
  assert.equal(form.get('allow_sending_without_reply'), 'true');
  assert.equal(form.get('protect_content'), 'true');
});

test('text entities map to caption_entities for sendPhoto', async () => {
  const h = harness();
  const entities = [{ type: 'bold', offset: 0, length: 4 }];
  await sendTelegramMoonboyMessage(base(h, {
    text: 'Rank up!', options: { message_thread_id: topic, entities }
  }));
  const form = h.calls[0].init.body;
  assert.deepEqual(JSON.parse(form.get('caption_entities')), entities);
  assert.equal(form.get('entities'), null);
});

test('caption longer than 1024 uses one full text message before photo attempt', async () => {
  const h = harness();
  const text = 'X'.repeat(TELEGRAM_PHOTO_CAPTION_LIMIT + 1);
  const result = await sendTelegramMoonboyMessage(base(h, { text }));
  assert.equal(result.status, 'sent');
  assert.equal(result.method, 'sendMessage');
  assert.equal(result.photoSkipped, true);
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /\/sendMessage$/);
  assert.equal(jsonBody(h.calls[0]).text, text);
  assert.equal(jsonBody(h.calls[0]).message_thread_id, topic);
});

test('1024 character caption boundary still sends photo', async () => {
  const h = harness();
  const text = 'Y'.repeat(TELEGRAM_PHOTO_CAPTION_LIMIT);
  const result = await sendTelegramMoonboyMessage(base(h, { text }));
  assert.equal(result.method, 'sendPhoto');
  assert.equal(h.calls[0].init.body.get('caption'), text);
});

test('no image uses sendMessage with original topic and formatting', async () => {
  const h = harness();
  const result = await sendTelegramMoonboyMessage(base(h, {
    photo: null, options: { message_thread_id: topic, parse_mode: 'HTML' }
  }));
  assert.equal(result.method, 'sendMessage');
  assert.equal(jsonBody(h.calls[0]).text, 'TAG RUN · STREET CRED');
  assert.equal(jsonBody(h.calls[0]).parse_mode, 'HTML');
  assert.equal(jsonBody(h.calls[0]).message_thread_id, topic);
});

test('invalid photo bytes fall back before sending any image', async () => {
  const h = harness();
  const result = await sendTelegramMoonboyMessage(base(h, {
    photo: { ...photo(), bytes: new Uint8Array(TELEGRAM_PHOTO_MAX_BYTES + 1) }
  }));
  assert.equal(result.method, 'sendMessage');
  assert.equal(result.photoSkipped, true);
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /\/sendMessage$/);
});

test('definitive Telegram photo rejection falls back once to original text', async () => {
  const h = harness(reject(400), ok(83));
  const result = await sendTelegramMoonboyMessage(base(h));
  assert.equal(result.status, 'sent');
  assert.equal(result.method, 'sendMessage');
  assert.equal(result.telegramMessageId, 83);
  assert.equal(result.photoRejection, 'telegram_definitive_rejection');
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[0].url, /\/sendPhoto$/);
  assert.match(h.calls[1].url, /\/sendMessage$/);
  assert.equal(jsonBody(h.calls[1]).message_thread_id, topic);
});

test('network timeout after photo attempt is uncertain and NEVER triggers text duplicate', async () => {
  const h = harness(new Error('timeout'));
  const result = await sendTelegramMoonboyMessage(base(h));
  assert.deepEqual(result, {
    status: 'uncertain', reason: 'transport_failure',
    method: 'sendPhoto', photoSkipped: false
  });
  assert.equal(h.calls.length, 1);
});

test('HTTP 429, 5xx, malformed acknowledgements are uncertain, not retryable', async () => {
  for (const response of [
    reject(429), reject(500),
    new Response('<html>unknown</html>', { status: 200 }),
    new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
  ]) {
    const h = harness(response);
    const result = await sendTelegramMoonboyMessage(base(h));
    assert.equal(result.status, 'uncertain');
    assert.equal(h.calls.length, 1);
  }
});

test('text fallback timeout also remains uncertain, without an extra retry', async () => {
  const h = harness(reject(413), new Error('connection reset'));
  const result = await sendTelegramMoonboyMessage(base(h));
  assert.equal(result.status, 'uncertain');
  assert.equal(result.method, 'sendMessage');
  assert.equal(h.calls.length, 2);
});

test('caption_entities survive a definitive photo rejection as text entities', async () => {
  const h = harness(reject(400), ok(99));
  const entities = [{ type: 'bold', offset: 0, length: 3 }];
  const result = await sendTelegramMoonboyMessage(base(h, {
    text: 'New rank', options: { message_thread_id: topic, caption_entities: entities }
  }));
  assert.equal(result.method, 'sendMessage');
  assert.equal(h.calls.length, 2);
  assert.deepEqual(jsonBody(h.calls[1]).entities, entities);
  assert.equal(jsonBody(h.calls[1]).caption_entities, undefined);
});

test('invalid token, chat, thread, parse mode or oversized text fail before network', async () => {
  const cases = [
    { token: 'unsafe/bot/token' },
    { chatId: '123\n456' },
    { options: { message_thread_id: 'bad' } },
    { options: { parse_mode: 'INVALID' } },
    { text: 'A'.repeat(4097) }
  ];
  for (const overrides of cases) {
    const h = harness();
    await assert.rejects(sendTelegramMoonboyMessage(base(h, overrides)),
      /telegram_media_/);
    assert.equal(h.calls.length, 0);
  }
});

test('image send is opt-in: no production routes or paid Images binding enabled', () => {
  const transport = readFileSync(new URL(
    '../workers/moonboys-api/telegram/moonboy-photo-transport.js', import.meta.url), 'utf8');
  assert.equal(transport.includes('env.DB.prepare'), false);
  assert.equal(transport.includes('push_transaction'), false);
  assert.equal(transport.includes('TAG_RUN_V2_PAYOUTS_ENABLED'), false);
  const wrangler = readFileSync(new URL(
    '../workers/moonboys-api/wrangler.toml', import.meta.url), 'utf8');
  assert.equal(wrangler.includes('binding = "IMAGES"'), false);
});
