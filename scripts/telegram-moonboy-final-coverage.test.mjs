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
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

const token = '123456789:abcdefghijklmnopqrstuvwxyzABCDE';

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
      const stickers = ['⚽', '💋', '🫁', '💉', '💊', '💣', '🗡', '🧱', '🐻']
        .map((emoji, index) => ({ emoji, custom_emoji_id: String(index + 1) }));
      return Response.json({ ok: true, result: { sticker_type: 'custom_emoji', stickers } });
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
        '<b>Command reply</b>', { message_thread_id: 42, reply_markup: keyboard });
      assert.equal(result.ok, true);
    }
  }
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.url, 'https://api.telegram.org/bot' + token + '/sendMessage');
    assert.match(call.body.text, /^<tg-emoji emoji-id="[1-9]">.+<\/tg-emoji> <b>Command reply<\/b>$/u);
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
