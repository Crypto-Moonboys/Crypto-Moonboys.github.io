import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createTelegramCommandMediaContext,
  readTelegramCommandMediaContext,
  unwrapTelegramBotToken,
} from '../workers/moonboys-api/telegram/command-media-context.js';
import { isMoonboyTelegramMediaEnabled } from
  '../workers/moonboys-api/telegram/moonboy-message-gateway.js';

const token = '123456789:abcdefghijklmnopqrstuvwxyzABCDE';

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

test('core commands and pet notifications require the explicit staged allowlist', () => {
  const base = {
    TELEGRAM_MOONBOY_PHOTOS_ENABLED: 'true',
    TELEGRAM_MOONBOY_MEDIA_MODE: 'canary',
    TELEGRAM_MOONBOY_CANARY_CHAT_ID: '123',
    TELEGRAM_BOT_TOKEN: token,
    IMAGES: { input() {} },
  };
  for (const messageKind of ['core-command', 'pet-notification']) {
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
  assert.match(source, /messageKind: 'core-command'/);
  assert.match(source, /logicalId: commandContext\.logicalId/);
  assert.match(source, /sequence: commandContext\.nextSequence\(\)/);
  assert.match(source, /messageKind: 'pet-notification'/);
  assert.match(source, /VALUES \(\?,\?,'needs_review'\)/);
  assert.match(source, /ensureTelegramGamesPinned\(unwrapTelegramBotToken\(botToken\)/);
  assert.match(source, /photoResult\.ok[\s\S]*sendTelegramMessage\(unwrapTelegramBotToken\(botToken\)/);
});

test('production remains cost-off and has no Images binding', () => {
  const wrangler = readFileSync(
    new URL('../workers/moonboys-api/wrangler.toml', import.meta.url), 'utf8');
  assert.match(wrangler, /TELEGRAM_MOONBOY_PHOTOS_ENABLED = "false"/);
  assert.match(wrangler, /TELEGRAM_MOONBOY_MEDIA_MODE = "off"/);
  assert.match(wrangler, /TELEGRAM_MOONBOY_MESSAGE_KINDS = ""/);
  assert.doesNotMatch(wrangler, /binding\s*=\s*"IMAGES"/);
});
