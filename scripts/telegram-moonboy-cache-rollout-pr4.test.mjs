import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isMoonboyTelegramMediaEnabled, moonboyTelegramMessageSeed,
  sendControlledMoonboyTelegram
} from '../workers/moonboys-api/telegram/moonboy-message-gateway.js';
import {
  MOONBOY_MEDIA_CACHE_VERSION,
  readMoonboyMediaCache, cacheMoonboyPortrait, cacheMoonboyTelegramFileId
} from '../workers/moonboys-api/telegram/moonboy-media-cache.js';

const manifest = JSON.parse(readFileSync(
  new URL('../data/avatar-builder-manifest.json', import.meta.url), 'utf8'));
const token = '123456789:abcdefghijklmnopqrstuvwxyzABCDE';
const privateChat = '123456789';
const groupChat = '-1001234567890';
const branchEnv = (overrides = {}) => ({
  TELEGRAM_MOONBOY_PHOTOS_ENABLED: 'true',
  TELEGRAM_MOONBOY_MEDIA_MODE: 'canary',
  TELEGRAM_MOONBOY_CANARY_CHAT_ID: privateChat,
  TELEGRAM_MOONBOY_MESSAGE_KINDS: 'daily-digest,group-announcement',
  TELEGRAM_GROUP_CHAT_ID: groupChat,
  TELEGRAM_BOT_TOKEN: token,
  IMAGES: fakeImages(),
  ...overrides
});

function fakeImages() {
  return {
    input(stream) {
      assert.equal(typeof stream?.getReader, 'function');
      return {
        transform({ width, height }) {
          assert.equal(width, 640);
          assert.equal(height, 640);
          return this;
        },
        draw(other, opts) {
          assert.ok(other);
          assert.equal(opts.left, 0);
          assert.equal(opts.top, 0);
          return this;
        },
        async output() {
          return { response: () => new Response(new Uint8Array(384), {
            headers: { 'content-type': 'image/jpeg' }
          }) };
        }
      };
    }
  };
}

function fakeCache({ failMatch = false, failPut = false } = {}) {
  const rows = new Map();
  return {
    rows,
    async match(request) {
      if (failMatch) throw new Error('cache unavailable');
      const response = rows.get(request.url);
      return response ? response.clone() : undefined;
    },
    async put(request, response) {
      if (failPut) throw new Error('cache unavailable');
      rows.set(request.url, response.clone());
    }
  };
}

function telegramHarness({ photoStatus = 200, photoBody = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/data/avatar-builder-manifest.json')) {
      return new Response(JSON.stringify(manifest), {
        headers: { 'content-type': 'application/json' }
      });
    }
    if (url.includes('/img/avatar-builder/layers/')) {
      return new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46]), {
        headers: { 'content-type': 'image/webp' }
      });
    }
    if (url.endsWith('/sendPhoto')) {
      const body = photoBody || (photoStatus >= 400
        ? { ok: false, error_code: photoStatus }
        : { ok: true, result: {
            message_id: 345,
            photo: [{ file_id: 'telegram-file-id-1234567890' }]
          } });
      return new Response(JSON.stringify(body), {
        status: photoStatus, headers: { 'content-type': 'application/json' }
      });
    }
    if (url.endsWith('/sendMessage')) {
      return new Response(JSON.stringify({
        ok: true, result: { message_id: 346 }
      }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected URL ' + url);
  };
  return { calls, fetchImpl };
}

test('new base Worker kinds require an explicit staged allowlist', () => {
  const noKinds = branchEnv({ TELEGRAM_MOONBOY_MESSAGE_KINDS: '' });
  assert.equal(isMoonboyTelegramMediaEnabled(noKinds, {
    chatId: privateChat, chatKind: 'private', messageKind: 'daily-digest'
  }), false);
  assert.equal(isMoonboyTelegramMediaEnabled(branchEnv(), {
    chatId: privateChat, chatKind: 'private', messageKind: 'daily-digest'
  }), true);
  assert.equal(isMoonboyTelegramMediaEnabled(branchEnv({
    TELEGRAM_MOONBOY_MEDIA_MODE: 'group'
  }), {
    chatId: groupChat, chatKind: 'group', messageKind: 'group-announcement'
  }), true);
});

test('legacy TAG RUN kinds retain PR3 opt-in behavior without the new list', () => {
  const env = branchEnv({ TELEGRAM_MOONBOY_MESSAGE_KINDS: '' });
  assert.equal(isMoonboyTelegramMediaEnabled(env, {
    chatId: privateChat, chatKind: 'private', messageKind: 'tag-command'
  }), true);
});

test('v2 portraits do not reuse v1 media cache entries or Telegram file_ids', async () => {
  assert.equal(MOONBOY_MEDIA_CACHE_VERSION, 'v2');
  const cache = fakeCache();
  const seed = 'tag-command:123:gender-migration:0';
  const stale = new Request('https://cryptomoonboys.com/__telegram_moonboy_cache__/v1/telegram-file/' +
    encodeURIComponent(seed));
  cache.rows.set(stale.url, new Response(JSON.stringify({
    version: 'v1', file_id: 'telegram-file-id-1234567890'
  }), { headers: { 'content-type': 'application/json' } }));
  assert.equal((await readMoonboyMediaCache(cache, seed)).hit, false);
});

test('first logical send renders once and stores JPEG plus confirmed file_id', async () => {
  const cache = fakeCache();
  const telegram = telegramHarness();
  const result = await sendControlledMoonboyTelegram({
    env: branchEnv(), chatId: privateChat, chatKind: 'private',
    messageKind: 'daily-digest',
    seed: moonboyTelegramMessageSeed('daily-digest', privateChat, '2026-11-10'),
    text: 'Daily digest', cacheImpl: cache, fetchImpl: telegram.fetchImpl
  });
  assert.equal(result.status, 'sent');
  assert.equal(result.fileIdReused, undefined);
  assert.equal(telegram.calls.filter(call => call.url.endsWith('/sendPhoto')).length, 1);
  assert.equal(cache.rows.size, 2);
});

test('second logical send reuses Telegram file_id without manifest, layers or JPEG upload', async () => {
  const cache = fakeCache();
  const seed = moonboyTelegramMessageSeed('daily-digest', privateChat, '2026-11-10');
  await cacheMoonboyTelegramFileId(cache, seed, 'telegram-file-id-1234567890');
  const telegram = telegramHarness();
  const result = await sendControlledMoonboyTelegram({
    env: branchEnv(), chatId: privateChat, chatKind: 'private',
    messageKind: 'daily-digest', seed, text: 'Daily digest',
    cacheImpl: cache, fetchImpl: telegram.fetchImpl
  });
  assert.equal(result.status, 'sent');
  assert.equal(result.fileIdReused, true);
  assert.equal(telegram.calls.some(call =>
    call.url.endsWith('/data/avatar-builder-manifest.json')), false);
  assert.equal(telegram.calls.some(call =>
    call.url.includes('/img/avatar-builder/layers/')), false);
  const photo = telegram.calls.find(call => call.url.endsWith('/sendPhoto'));
  assert.equal(JSON.parse(photo.init.body).photo, 'telegram-file-id-1234567890');
});

test('cached JPEG is reused without another Images composition', async () => {
  const cache = fakeCache();
  const seed = moonboyTelegramMessageSeed('daily-digest', privateChat, '2026-11-11');
  assert.equal(await cacheMoonboyPortrait(cache, seed, {
    bytes: new Uint8Array(128), mimeType: 'image/jpeg', width: 640, height: 640
  }), true);
  const telegram = telegramHarness();
  const result = await sendControlledMoonboyTelegram({
    env: branchEnv({ IMAGES: { input() { throw new Error('must not render'); } } }),
    chatId: privateChat, chatKind: 'private', messageKind: 'daily-digest',
    seed, text: 'Cached portrait', cacheImpl: cache,
    fetchImpl: telegram.fetchImpl
  });
  assert.equal(result.status, 'sent');
  assert.equal(telegram.calls.some(call =>
    call.url.endsWith('/data/avatar-builder-manifest.json')), false);
});

test('invalid cache records are ignored without dropping the message', async () => {
  const cache = fakeCache();
  const seed = moonboyTelegramMessageSeed('daily-digest', privateChat, '2026-11-12');
  const badKey = [...cache.rows.keys()][0];
  assert.equal(badKey, undefined);
  const read = await readMoonboyMediaCache(cache, seed);
  assert.deepEqual(read, { hit: false, source: 'miss' });
  const telegram = telegramHarness();
  const result = await sendControlledMoonboyTelegram({
    env: branchEnv(), chatId: privateChat, chatKind: 'private',
    messageKind: 'daily-digest', seed, text: 'Render after miss',
    cacheImpl: cache, fetchImpl: telegram.fetchImpl
  });
  assert.equal(result.status, 'sent');
});

test('cache API failures remain non-fatal and render normally', async () => {
  const telegram = telegramHarness();
  const result = await sendControlledMoonboyTelegram({
    env: branchEnv(), chatId: privateChat, chatKind: 'private',
    messageKind: 'daily-digest',
    seed: moonboyTelegramMessageSeed('daily-digest', privateChat, '2026-11-13'),
    text: 'Cache unavailable', cacheImpl: fakeCache({ failMatch: true, failPut: true }),
    fetchImpl: telegram.fetchImpl
  });
  assert.equal(result.status, 'sent');
});

test('cached file_id uncertainty is terminal and never falls back to text', async () => {
  const cache = fakeCache();
  const seed = moonboyTelegramMessageSeed('daily-digest', privateChat, '2026-11-14');
  await cacheMoonboyTelegramFileId(cache, seed, 'telegram-file-id-1234567890');
  const telegram = telegramHarness({
    photoStatus: 200, photoBody: { ok: true, result: { message_id: null } }
  });
  const result = await sendControlledMoonboyTelegram({
    env: branchEnv(), chatId: privateChat, chatKind: 'private',
    messageKind: 'daily-digest', seed, text: 'Uncertain cached send',
    cacheImpl: cache, fetchImpl: telegram.fetchImpl
  });
  assert.equal(result.status, 'uncertain');
  assert.equal(telegram.calls.filter(call => call.url.endsWith('/sendPhoto')).length, 1);
  assert.equal(telegram.calls.filter(call => call.url.endsWith('/sendMessage')).length, 0);
});

test('definitive cached file_id rejection falls back exactly once to text', async () => {
  const cache = fakeCache();
  const seed = moonboyTelegramMessageSeed('daily-digest', privateChat, '2026-11-15');
  await cacheMoonboyTelegramFileId(cache, seed, 'telegram-file-id-1234567890');
  const telegram = telegramHarness({ photoStatus: 400 });
  const result = await sendControlledMoonboyTelegram({
    env: branchEnv(), chatId: privateChat, chatKind: 'private',
    messageKind: 'daily-digest', seed, text: 'Definitive rejection',
    cacheImpl: cache, fetchImpl: telegram.fetchImpl
  });
  assert.equal(result.status, 'sent');
  assert.equal(result.method, 'sendMessage');
  assert.equal(telegram.calls.filter(call => call.url.endsWith('/sendPhoto')).length, 1);
  assert.equal(telegram.calls.filter(call => call.url.endsWith('/sendMessage')).length, 1);
});

test('long caption bypasses render and cache before network', async () => {
  const telegram = telegramHarness();
  const result = await sendControlledMoonboyTelegram({
    env: branchEnv(), chatId: privateChat, chatKind: 'private',
    messageKind: 'daily-digest',
    seed: moonboyTelegramMessageSeed('daily-digest', privateChat, '2026-11-16'),
    text: 'x'.repeat(1025), cacheImpl: fakeCache(), fetchImpl: telegram.fetchImpl
  });
  assert.deepEqual(result, { status: 'disabled' });
  assert.equal(telegram.calls.length, 0);
});

test('base Worker routes digest and announcement receipts through PR4 gateway', () => {
  const source = readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
  assert.match(source, /sendBaseWorkerMoonboyMessage/);
  assert.match(source, /messageKind: 'daily-digest', logicalId: utcDay/);
  assert.match(source, /messageKind: 'group-announcement'/);
  assert.match(source, /logicalId: candidate\.announcement_key/);
  assert.match(source, /status NOT IN \('sent', 'needs_review'\)/);
  assert.match(source, /finalizeDailyDigestLog\(db, telegramId, utcDay, 'needs_review'/);
  assert.match(source, /finalizeTelegramGroupAnnouncement\(env\.DB, candidate, 'needs_review'/);
});

test('production defaults preserve approved group artwork classes', () => {
  const wrangler = readFileSync(
    new URL('../workers/moonboys-api/wrangler.toml', import.meta.url), 'utf8');
  assert.match(wrangler, /TELEGRAM_MOONBOY_PHOTOS_ENABLED = "true"/);
  assert.match(wrangler, /TELEGRAM_MOONBOY_MEDIA_MODE = "group"/);
  assert.match(wrangler, /TELEGRAM_MOONBOY_MESSAGE_KINDS = "daily-digest,group-announcement,pet-notification,core-command"/);
  assert.match(wrangler, /\[images\][\s\S]*?binding\s*=\s*"IMAGES"/);
});
