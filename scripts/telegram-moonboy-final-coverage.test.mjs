import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createTelegramCommandMediaContext,
  readTelegramCommandMediaContext,
  unwrapTelegramBotToken,
} from '../workers/moonboys-api/telegram/command-media-context.js';
import { isMoonboyTelegramMediaEnabled, sendControlledMoonboyTelegram } from
  '../workers/moonboys-api/telegram/moonboy-message-gateway.js';
import worker, { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

const token = '123456789:abcdefghijklmnopqrstuvwxyzABCDE';
const stickers = ['⚽', '💋', '🫁', '💉', '💊', '💣', '🗡', '🧱', '🐻', '⚽']
  .map((emoji, index) => ({ emoji, custom_emoji_id: String(5000000000000000000n + BigInt(index)) }));
const packEmoji = /<tg-emoji emoji-id="(\d+)">[^<]+<\/tg-emoji> /gu;

function stickerSet() {
  return Response.json({ ok: true, result: { sticker_type: 'custom_emoji', stickers } });
}

test('Daily Board sends four unique pack emojis in the existing group photo caption', async t => {
  const manifest = readFileSync(new URL('../data/avatar-builder-manifest.json', import.meta.url));
  const image = {
    transform: () => image,
    draw: () => image,
    output: async () => ({ response: () => new Response(new Uint8Array(384), {
      headers: { 'content-type': 'image/jpeg' }
    }) }),
  };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.endsWith('/getStickerSet')) return stickerSet();
    if (url.endsWith('/avatar-builder-manifest.json')) return new Response(manifest);
    if (url.includes('/img/avatar-builder/layers/')) {
      return new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46]), {
        headers: { 'content-type': 'image/webp' }
      });
    }
    calls.push({ url, body: init.body });
    return Response.json({ ok: true, result: { message_id: 700 } });
  });
  const env = {
    ADMIN_SECRET: 'fixture-admin',
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_GROUP_CHAT_ID: '-1001234567890',
    TELEGRAM_GROUP_THREAD_ID: '42',
    TELEGRAM_MOONBOY_PHOTOS_ENABLED: 'true',
    TELEGRAM_MOONBOY_MEDIA_MODE: 'group',
    TELEGRAM_MOONBOY_MESSAGE_KINDS: 'group-announcement',
    CLAN_OPERATIONS_ENABLED: 'true',
    CLAN_SIGNAL_XP_FROM: '2026-11-01T00:00:00.000Z',
    IMAGES: { input: () => image },
    DB: { prepare: () => ({ bind: name => ({
      first: async () => ({ name }), run: async () => ({ meta: { changes: 1 } }),
    }) }) },
  };
  const response = await worker.fetch(new Request('https://fixture.test/telegram/group-announcements/run', {
    method: 'POST',
    headers: { 'x-admin-secret': env.ADMIN_SECRET },
    body: JSON.stringify({ type: 'daily_summary', now: '2026-11-22T09:00:00.000Z' }),
  }), env);
  const summary = await response.json();
  assert.equal(response.status, 200, JSON.stringify(summary));
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/sendPhoto'));
  const form = calls[0].body;
  const caption = form.get('caption');
  const icons = [...caption.matchAll(packEmoji)];
  assert.equal(icons.length, 4);
  assert.equal(new Set(icons.map(match => match[1])).size, 4);
  assert.ok(caption.length > 1024, 'HTML tags push the raw caption over the limit');
  const clean = caption.replace(packEmoji, '');
  assert.match(clean, /<b>⚡ Battle Chamber Daily Board is live\.<\/b>/u);
  assert.match(clean, /community\.html#clan-operation/);
  assert.match(clean, /100 Community XP/);
  assert.equal(form.get('chat_id'), env.TELEGRAM_GROUP_CHAT_ID);
  assert.equal(form.get('message_thread_id'), env.TELEGRAM_GROUP_THREAD_ID);
  assert.equal(form.get('parse_mode'), 'HTML');
});

test('command artwork is blocked even with stale configuration enabling every kind', async () => {
  for (const mode of ['canary', 'group']) {
    const env = {
      TELEGRAM_BOT_TOKEN: token, TELEGRAM_MOONBOY_PHOTOS_ENABLED: 'true',
      TELEGRAM_MOONBOY_MEDIA_MODE: mode, TELEGRAM_MOONBOY_CANARY_CHAT_ID: '123',
      TELEGRAM_GROUP_CHAT_ID: '-1001',
      TELEGRAM_MOONBOY_MESSAGE_KINDS: 'core-command,tag-command,games-pin',
      IMAGES: { input() { assert.fail('commands must never render'); } }
    };
    for (const messageKind of ['core-command', 'tag-command', 'games-pin']) {
      const context = { chatId: mode === 'group' ? '-1001' : '123',
        chatKind: mode === 'group' ? 'group' : 'private', messageKind };
      assert.equal(isMoonboyTelegramMediaEnabled(env, context), false);
      assert.deepEqual(await sendControlledMoonboyTelegram({ env, ...context,
        seed: 'command-test:123:1:0', text: 'Reply',
        fetchImpl: async () => assert.fail('commands must not fetch images or send photos')
      }), { status: 'disabled' });
    }
  }
});

test('actual command/callback text gateway preserves routing and keyboard without artwork', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.endsWith('/getStickerSet')) {
      assert.equal(JSON.parse(init.body).name, 'GKMoonboys');
      return stickerSet();
    }
    calls.push({ url, body: JSON.parse(init.body) });
    return Response.json({ ok: true, result: { message_id: 7 } });
  });
  const env = { TELEGRAM_BOT_TOKEN: token, TELEGRAM_MOONBOY_PHOTOS_ENABLED: 'true',
    TELEGRAM_MOONBOY_MEDIA_MODE: 'group', TELEGRAM_GROUP_CHAT_ID: '-1001',
    TELEGRAM_MOONBOY_MESSAGE_KINDS: 'core-command',
    IMAGES: { input() { assert.fail('no command image'); } } };
  const keyboard = { inline_keyboard: [[{ text: 'Open', callback_data: 'pet:home' }]] };
  for (const group of [false, true]) {
    for (const callback of [false, true]) {
      const message = { message_id: 99, chat: { id: group ? -1001 : 123,
        type: group ? 'supergroup' : 'private' } };
      const update = callback ? { callback_query: { message } } : { message };
      const context = createTelegramCommandMediaContext(env, update);
      const result = await __petMediaTestHooks.sendTelegramMessage(context, message.chat.id,
        group ? '<b>Command reply</b>' : '<b>Command reply</b>\nFaction: graffpunks\n<pre>\nPreserve this\n</pre>',
        { message_thread_id: 42, reply_markup: keyboard });
      assert.equal(result.ok, true);
    }
  }
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.url, 'https://api.telegram.org/bot' + token + '/sendMessage');
    const icon = packEmoji;
    const icons = [...call.body.text.matchAll(icon)];
    const isPrivate = call.body.chat_id === 123;
    assert.equal(icons.length, isPrivate ? 2 : 1);
    assert.equal(new Set(icons.map(match => match[1])).size, icons.length);
    assert.equal(icons[0].index, 0);
    if (isPrivate) assert.equal(icons[1].index, call.body.text.indexOf('\n') + 1);
    assert.equal(call.body.text.replace(icon, ''), isPrivate
      ? '<b>Command reply</b>\nFaction: GraffPUNKS\n<pre>\nPreserve this\n</pre>'
      : '<b>Command reply</b>');
    assert.equal(call.body.parse_mode, 'HTML');
    assert.equal(call.body.message_thread_id, 42);
    assert.deepEqual(call.body.reply_markup, keyboard);
  }
});

test('command context is request-scoped, token-compatible and deterministic per update', () => {
  const env = { TELEGRAM_BOT_TOKEN: token };
  const update = {
    update_id: 90,
    message: { message_id: 44, chat: { id: 123, type: 'private' } },
  };
  const first = createTelegramCommandMediaContext(env, update);
  const second = createTelegramCommandMediaContext(env, update);
  assert.equal(String(first), token);
  assert.equal(unwrapTelegramBotToken(first), token);
  assert.equal(readTelegramCommandMediaContext(first), first);
  assert.equal(first.logicalId, '44');
  assert.equal(first.chatKind, 'private');
  assert.deepEqual([first.nextSequence(), first.nextSequence()], [0, 1]);
  assert.equal(second.nextSequence(), 0);
});

test('callback and group contexts use stable Telegram message identity', () => {
  const context = createTelegramCommandMediaContext(
    { TELEGRAM_BOT_TOKEN: token },
    { callback_query: { message: {
      message_id: 75, chat: { id: -1001, type: 'supergroup' }
    } } }
  );
  assert.equal(context.logicalId, '75');
  assert.equal(context.chatKind, 'group');
});

test('updates and pet notifications require the explicit staged allowlist', () => {
  const base = {
    TELEGRAM_MOONBOY_PHOTOS_ENABLED: 'true',
    TELEGRAM_MOONBOY_MEDIA_MODE: 'canary',
    TELEGRAM_MOONBOY_CANARY_CHAT_ID: '123',
    TELEGRAM_BOT_TOKEN: token,
    IMAGES: { input() {} },
  };
  for (const messageKind of ['pet-notification', 'daily-digest', 'group-announcement']) {
    assert.equal(isMoonboyTelegramMediaEnabled(base, {
      chatId: '123', chatKind: 'private', messageKind
    }), false);
    assert.equal(isMoonboyTelegramMediaEnabled({
      ...base, TELEGRAM_MOONBOY_MESSAGE_KINDS: messageKind
    }, { chatId: '123', chatKind: 'private', messageKind }), true);
  }
});

test('Worker centralizes all command text while preserving existing-media and pin exceptions', () => {
  const source = readFileSync(
    new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
  assert.match(source, /const tok = createTelegramCommandMediaContext\(env, update\)/);
  assert.doesNotMatch(source, /messageKind: 'core-command'/);
  assert.match(source, /botToken = unwrapTelegramBotToken\(botToken\)/);
  assert.match(source, /messageKind: 'pet-notification'/);
  assert.match(source, /signal: requestOptions\.signal/);
  assert.match(source, /VALUES \(\?,\?,'needs_review'\)/);
  assert.match(source, /ensureTelegramGamesPinned\(unwrapTelegramBotToken\(botToken\)/);
  assert.match(source, /photoResult\.ok[\s\S]*sendTelegramMessage\(unwrapTelegramBotToken\(botToken\)/);
});

test('production preserves approved group delivery with the Images binding', () => {
  const wrangler = readFileSync(
    new URL('../workers/moonboys-api/wrangler.toml', import.meta.url), 'utf8');
  assert.match(wrangler, /TELEGRAM_MOONBOY_PHOTOS_ENABLED = "true"/);
  assert.match(wrangler, /TELEGRAM_MOONBOY_MEDIA_MODE = "group"/);
  assert.match(wrangler, /TELEGRAM_MOONBOY_MESSAGE_KINDS = "daily-digest,group-announcement,pet-notification"/);
  assert.match(wrangler, /\[images\][\s\S]*?binding\s*=\s*"IMAGES"/);
});
