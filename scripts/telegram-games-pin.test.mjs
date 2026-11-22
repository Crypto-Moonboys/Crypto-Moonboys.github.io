import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ensureTelegramGamesPinned } from '../workers/moonboys-api/telegram-games-pin.js';

const GAMES = 'https://cryptomoonboys.com/games/telegram/?v=20261019-miniapp-login-v1';
const PIN_TEXT = 'Crypto Moonboys Games\nQuick access to your games.';
function mockTelegram({ existingPin = null, errors = {}, pinSucceeded = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const method = url.split('/').at(-1);
    const args = JSON.parse(options.body);
    calls.push({ method, args });
    assert.equal(options.method, 'POST');
    assert.ok(options.signal, 'Every Telegram call needs a deadline');
    assert.equal(args.chat_id, '123456789');
    if (errors[method]) {
      return { ok: false, json: async () => ({ ok: false, error_code: 503 }) };
    }
    let result = true;
    if (method === 'getChat') result = { pinned_message: existingPin };
    if (method === 'sendMessage') {
      assert.equal(args.text, PIN_TEXT);
      assert.equal(args.disable_notification, true);
      assert.deepEqual(args.reply_markup.inline_keyboard, [
        [{ text: 'OPEN GAMES', web_app: { url: GAMES } }],
      ]);
      result = { message_id: 9001 };
    }
    if (method === 'pinChatMessage') {
      assert.equal(args.message_id, 9001);
      assert.equal(args.disable_notification, true);
      result = pinSucceeded;
    }
    if (method === 'deleteMessage') {
      assert.equal(args.message_id, 9001);
    }
    return { ok: true, json: async () => ({ ok: true, result }) };
  };
  return { calls, fetchImpl };
}

test('first /start creates one quiet Games shortcut when no message is pinned', async () => {
  const mock = mockTelegram();
  const result = await ensureTelegramGamesPinned('bot:test', '123456789', GAMES, mock);
  assert.deepEqual(result, { ok: true, status: 'pinned' });
  assert.deepEqual(mock.calls.map(c => c.method), ['getChat', 'sendMessage', 'pinChatMessage']);
});

test('newer user pin prevents duplicate Games shortcut even if an older Games pin exists', async () => {
  const mock = mockTelegram({ existingPin: { text: 'Newer pinned message' } });
  assert.deepEqual(await ensureTelegramGamesPinned('bot:test', '123456789', GAMES, mock),
    { ok: true, status: 'other_pin_present' });
  assert.deepEqual(mock.calls.map(c => c.method), ['getChat']);
});

test('returning /start or /games with Games already pinned never sends a duplicate', async () => {
  const mock = mockTelegram({ existingPin: {
    text: PIN_TEXT,
    reply_markup: { inline_keyboard: [[{ text: 'OPEN GAMES', web_app: { url: GAMES } }]] },
  } });
  assert.deepEqual(await ensureTelegramGamesPinned('bot:test', '123456789', GAMES, mock),
    { ok: true, status: 'already_pinned' });
  assert.deepEqual(mock.calls.map(c => c.method), ['getChat']);
});

test('Games pin adds pack emojis and recognizes the delivered custom-emoji text', async () => {
  const token = '123456789:abcdefghijklmnopqrstuvwxyzABCDE';
  const expectedMarkup = { inline_keyboard: [[{ text: 'OPEN GAMES', web_app: { url: GAMES } }]] };
  const calls = [];
  let pinnedMessage;
  const fetchImpl = async (url, init) => {
    const method = url.split('/').at(-1);
    calls.push(method);
    const args = JSON.parse(init.body);
    if (method === 'getChat') return Response.json({ ok: true, result: { pinned_message: pinnedMessage } });
    if (method === 'getStickerSet') {
      return Response.json({ ok: true, result: { sticker_type: 'custom_emoji', stickers: [
        { emoji: '🧱', custom_emoji_id: '1' }, { emoji: '⚽', custom_emoji_id: '2' },
      ] } });
    }
    if (method === 'sendMessage') {
      assert.equal(args.parse_mode, 'HTML');
      assert.deepEqual(args.reply_markup, expectedMarkup);
      const entities = [];
      const text = args.text.replace(/<\/?b>/g, '').replace(
        /<tg-emoji emoji-id="(\d+)">([^<]+)<\/tg-emoji>/gu, (full, id, emoji, rawOffset) => {
          const removedMarkup = entities.reduce((total, entity) => total + entity.markupLength, 0);
          entities.push({ type: 'custom_emoji', custom_emoji_id: id, offset: rawOffset - removedMarkup,
            length: emoji.length, markupLength: full.length - emoji.length });
          return emoji;
        });
      assert.equal(entities.length, 2);
      pinnedMessage = { text, entities, reply_markup: expectedMarkup };
      return Response.json({ ok: true, result: { message_id: 9001 } });
    }
    assert.equal(method, 'pinChatMessage');
    return Response.json({ ok: true, result: true });
  };
  assert.equal((await ensureTelegramGamesPinned(token, '123456789', GAMES, { fetchImpl })).status, 'pinned');
  assert.equal((await ensureTelegramGamesPinned(token, '123456789', GAMES, { fetchImpl })).status, 'already_pinned');
  assert.deepEqual(calls, ['getChat', 'getStickerSet', 'sendMessage', 'pinChatMessage', 'getChat']);
});

test('failed getChat avoids spamming the player with an untracked shortcut', async () => {
  const mock = mockTelegram({ errors: { getChat: true } });
  assert.equal((await ensureTelegramGamesPinned('bot:test', '123456789', GAMES, mock)).status,
    'chat_lookup_failed');
  assert.deepEqual(mock.calls.map(c => c.method), ['getChat']);
});

test('rejected pin removes only the newly sent shortcut, without touching other pins', async () => {
  const mock = mockTelegram({ pinSucceeded: false });
  assert.equal((await ensureTelegramGamesPinned('bot:test', '123456789', GAMES, mock)).status,
    'pin_failed');
  assert.deepEqual(mock.calls.map(c => c.method),
    ['getChat', 'sendMessage', 'pinChatMessage', 'deleteMessage']);
  assert.ok(!mock.calls.some(c => c.method === 'unpinChatMessage'));
});

test('invalid target or URL never invokes Telegram API', async () => {
  const mock = mockTelegram();
  assert.equal((await ensureTelegramGamesPinned('bot:test', '-123', GAMES, mock)).status,
    'invalid_input');
  assert.equal((await ensureTelegramGamesPinned('bot:test', '123456789', 'http://insecure.test', mock)).status,
    'invalid_input');
  assert.deepEqual(mock.calls, []);
});

test('Worker pins only private /start and /games and retains group safe buttons', () => {
  const source = readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ ensureTelegramGamesPinned \} from '\.\/telegram-games-pin\.js'/);
  const pin = source.slice(source.indexOf('async function pinGamesForPrivateChat'),
    source.indexOf('function petMiniAppLaunchUrl'));
  assert.match(pin, /if \(String\(chatType\) !== 'private'\) return;/,
    'Never pin messages in groups without user consent');
  assert.match(pin, /await ensureTelegramGamesPinned\(unwrapTelegramBotToken\(botToken\), chatId, TELEGRAM_GAMES_MENU_URL\)/);
  assert.match(pin, /async function cmdGamesLauncher[\s\S]*await pinGamesForPrivateChat\(botToken, chatId, chatType\)/);
  const welcome = source.slice(source.indexOf('async function cmdGkStart'),
    source.indexOf('async function cmdGkHelp'));
  assert.match(welcome, /await pinGamesForPrivateChat\(tok, chatId, chatType\)/);
  assert.match(source, /case 'start':[^\n]*cmdGkStart\(db, tok, chatId, telegramId, fromUser, chatType\)/);
  assert.match(source, /case 'games':[^\n]*cmdGamesLauncher\(tok, chatId, chatType\)/);
  assert.match(source, /function telegramGamesChatButton\(chatType = 'private'\)/);
});
