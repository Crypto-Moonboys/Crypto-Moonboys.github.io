import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isMoonboyTelegramMediaEnabled, moonboyTelegramMessageSeed,
  sendControlledMoonboyTelegram
} from '../workers/moonboys-api/telegram/moonboy-message-gateway.js';
import {
  handleTagRunCommand, postTagRunGroupBulletin, deliverTagRunRankAnnouncements
} from '../workers/moonboys-api/tag-run/handler.js';

const manifest = JSON.parse(readFileSync(
  new URL('../data/avatar-builder-manifest.json', import.meta.url), 'utf8'));
const token = '123456789:abcdefghijklmnopqrstuvwxyzABCDE';
const privateChat = '123456789';
const groupChat = '-1001234567890';
const enabled = (overrides = {}) => ({
  TELEGRAM_MOONBOY_PHOTOS_ENABLED: 'true',
  TELEGRAM_MOONBOY_MEDIA_MODE: 'canary',
  TELEGRAM_MOONBOY_CANARY_CHAT_ID: privateChat,
  TELEGRAM_GROUP_CHAT_ID: groupChat, TELEGRAM_GROUP_THREAD_ID: '456',
  TELEGRAM_BOT_USERNAME: 'WIKICOMSBOT', TELEGRAM_BOT_TOKEN: token,
  TAG_RUN_ENABLED: 'true', DB: {}, IMAGES: fakeImages(), ...overrides
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
function harness({failManifest = false,photoFailure = false,
  malformedPhotoAck = false} = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith('/data/avatar-builder-manifest.json')) {
        if (failManifest) return new Response('missing', { status: 404 });
        return new Response(JSON.stringify(manifest), {
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.includes('/img/avatar-builder/layers/')) {
        return new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46]), {
          headers: { 'content-type': 'image/webp' }
        });
      }
      if (url.endsWith('/sendPhoto') && photoFailure) throw new Error('timeout after upload');
      if (url.endsWith('/sendPhoto') && malformedPhotoAck) {
        // Telegram accepted a message ID, but the malformed photo property
        // throws inside PR2's file_id extraction. This is post-send uncertainty.
        return new Response(JSON.stringify({
          ok: true, result: { message_id: 345, photo: {} }
        }), { headers: { 'content-type': 'application/json' } });
      }
      if (url.endsWith('/sendMessage') || url.endsWith('/sendPhoto')) {
        return new Response(JSON.stringify({
          ok: true, result: {
            message_id: 345,
            ...(url.endsWith('/sendPhoto') ? {
              photo: [{ file_id: 'photo-cache-id' }]
            } : {})
          }
        }), { headers: { 'content-type': 'application/json' } });
      }
      throw new Error('unexpected URL: ' + url);
    }
  };
}
const callsOf = (h, path) => h.calls.filter(x => x.url.includes(path));
function update(command = '/taghelp', messageId = 88) {
  return { message: {
    message_id: messageId, date: 1794340800,
    chat: { id: Number(privateChat), type: 'private' },
    from: { id: Number(privateChat), is_bot: false },
    text: command
  } };
}

test('media feature defaults OFF even with a valid binding and Telegram token', () => {
  const env = enabled({ TELEGRAM_MOONBOY_PHOTOS_ENABLED: 'false' });
  assert.equal(isMoonboyTelegramMediaEnabled(env, {
    chatId: privateChat, chatKind: 'private', messageKind: 'tag-command'
  }), false);
  assert.equal(isMoonboyTelegramMediaEnabled(enabled({
    TELEGRAM_MOONBOY_MEDIA_MODE: 'off'
  }), { chatId: privateChat, chatKind: 'private', messageKind: 'tag-command' }), false);
  assert.equal(isMoonboyTelegramMediaEnabled(enabled({ IMAGES: null }), {
    chatId: privateChat, chatKind: 'private', messageKind: 'tag-command'
  }), false);
});

test('private canary is exact-id and private-only; no unrelated chat gets images', () => {
  const env = enabled();
  assert.equal(isMoonboyTelegramMediaEnabled(env, {
    chatId: privateChat, chatKind: 'private', messageKind: 'tag-command'
  }), true);
  for (const context of [
    { chatId: groupChat, chatKind: 'group', messageKind: 'tag-bulletin' },
    { chatId: '123456788', chatKind: 'private', messageKind: 'tag-command' },
    { chatId: privateChat, chatKind: 'group', messageKind: 'tag-command' },
    { chatId: privateChat, chatKind: 'private', messageKind: 'daily-digest' },
    { chatId: 'not-an-id', chatKind: 'private', messageKind: 'tag-command' }
  ]) {
    assert.equal(isMoonboyTelegramMediaEnabled(env, context), false,
      JSON.stringify(context));
  }
});

test('group mode requires the official configured group; no arbitrary group', () => {
  const env = enabled({ TELEGRAM_MOONBOY_MEDIA_MODE: 'group' });
  assert.equal(isMoonboyTelegramMediaEnabled(env, {
    chatId: groupChat, chatKind: 'group', messageKind: 'tag-bulletin'
  }), true);
  assert.equal(isMoonboyTelegramMediaEnabled(env, {
    chatId: '-100987654321', chatKind: 'group', messageKind: 'tag-bulletin'
  }), false);
  assert.equal(isMoonboyTelegramMediaEnabled(env, {
    chatId: privateChat, chatKind: 'private', messageKind: 'tag-command'
  }), false);
});

test('stable numeric public message seed never includes Telegram text or wallet details', () => {
  const seed = moonboyTelegramMessageSeed('tag-command', privateChat, 88, 0);
  assert.equal(seed, 'tag-command:123456789:88:0');
  assert.equal(seed, moonboyTelegramMessageSeed('tag-command', privateChat, 88, 0));
  assert.notEqual(seed, moonboyTelegramMessageSeed('tag-command', privateChat, 89, 0));
  assert.throws(() => moonboyTelegramMessageSeed('tag-command', 'owner@example.com', 88),
    /telegram_media_invalid_seed/);
});

test('disabled integration never fetches images or reaches Telegram', async () => {
  const h = harness();
  const outcome = await sendControlledMoonboyTelegram({
    env: enabled({ TELEGRAM_MOONBOY_PHOTOS_ENABLED: 'false' }),
    chatId: privateChat, chatKind: 'private', messageKind: 'tag-command',
    seed: 'tag-command:123456789:88:0', text: 'message', fetchImpl: h.fetchImpl
  });
  assert.equal(outcome.status, 'disabled');
  assert.equal(h.calls.length, 0);
});

test('enabled private canary composes actual nine homepage layers and sends one JPEG', async () => {
  const h = harness();
  const outcome = await sendControlledMoonboyTelegram({
    env: enabled(), chatId: privateChat, chatKind: 'private',
    messageKind: 'tag-command', seed: 'tag-command:123456789:88:0',
    text: 'TAG RUN · rank profile', fetchImpl: h.fetchImpl
  });
  assert.equal(outcome.status, 'sent');
  assert.equal(outcome.method, 'sendPhoto');
  assert.equal(outcome.telegramFileId, 'photo-cache-id');
  assert.equal(callsOf(h, '/data/avatar-builder-manifest.json').length, 1);
  assert.equal(callsOf(h, '/img/avatar-builder/layers/').length, 9);
  assert.equal(callsOf(h, '/sendPhoto').length, 1);
  assert.equal(callsOf(h, '/sendMessage').length, 0);
  assert.equal(callsOf(h, '/sendPhoto')[0].init.body.get('caption'), 'TAG RUN · rank profile');
});

test('missing manifest fails BEFORE Telegram photo request so legacy path can send text', async () => {
  const h = harness({ failManifest: true });
  const outcome = await sendControlledMoonboyTelegram({
    env: enabled(), chatId: privateChat, chatKind: 'private',
    messageKind: 'tag-command', seed: 'tag-command:123456789:88:0',
    text: 'TAG RUN', fetchImpl: h.fetchImpl
  });
  assert.equal(outcome.status, 'composition_failed');
  assert.equal(callsOf(h, '/sendPhoto').length, 0);
  assert.equal(callsOf(h, '/sendMessage').length, 0);
});

test('long Telegram text skips the paid render and leaves existing text path intact', async () => {
  const h = harness();
  const outcome = await sendControlledMoonboyTelegram({
    env: enabled(), chatId: privateChat, chatKind: 'private',
    messageKind: 'tag-command', seed: 'tag-command:123456789:88:0',
    text: 'x'.repeat(1025), fetchImpl: h.fetchImpl
  });
  assert.equal(outcome.status, 'disabled');
  assert.equal(h.calls.length, 0);
});

test('real TAG RUN /taghelp replies remain text-only when feature OFF', async () => {
  const h = harness();
  const result = await handleTagRunCommand(update(), enabled({
    TELEGRAM_MOONBOY_PHOTOS_ENABLED: 'false'
  }), { fetchImpl: h.fetchImpl });
  assert.equal(result, true);
  assert.equal(h.calls.length, 1);
  assert.equal(callsOf(h, '/sendMessage').length, 1);
  assert.equal(callsOf(h, '/sendPhoto').length, 0);
  assert.equal(callsOf(h, '/data/avatar-builder-manifest.json').length, 0);
  assert.match(JSON.parse(h.calls[0].init.body).text, /TAG RUN/);
});

test('real TAG RUN /taghelp replies get Moonboy JPEG only in private canary', async () => {
  const h = harness();
  const result = await handleTagRunCommand(update(), enabled(), { fetchImpl: h.fetchImpl });
  assert.equal(result, true);
  assert.equal(callsOf(h, '/sendPhoto').length, 1);
  assert.equal(callsOf(h, '/sendMessage').length, 0);
  assert.equal(callsOf(h, '/img/avatar-builder/layers/').length, 9);
  assert.match(callsOf(h, '/sendPhoto')[0].init.body.get('caption'), /TAG RUN/);
});

test('post-photo transport exception cannot produce a second /taghelp reply', async () => {
  const h = harness({ malformedPhotoAck: true });
  const result = await handleTagRunCommand(update(), enabled(), { fetchImpl: h.fetchImpl });
  assert.equal(result, true);
  assert.equal(callsOf(h, '/sendPhoto').length, 1,
    'Telegram may have accepted this photo already');
  assert.equal(callsOf(h, '/sendMessage').length, 0,
    'command handler must not emit its temporary-error text after upload');
});

test('private canary image composition failure preserves original text-only TAG RUN reply', async () => {
  const h = harness({ failManifest: true });
  await handleTagRunCommand(update(), enabled(), { fetchImpl: h.fetchImpl });
  assert.equal(callsOf(h, '/sendPhoto').length, 0);
  assert.equal(callsOf(h, '/sendMessage').length, 1);
});

test('four-hour TAG RUN bulletin keeps text delivery OFF and topic routing when group media OFF', async () => {
  const h = harness();
  const db = { prepare: () => ({bind: () => ({all: async () => ({results: []})})}) };
  const outcome = await postTagRunGroupBulletin(enabled({
    DB: db, TELEGRAM_MOONBOY_PHOTOS_ENABLED: 'false'
  }), { nowMs: Date.parse('2026-11-10T16:03:00Z'), fetchImpl: h.fetchImpl });
  assert.equal(outcome.status, 'sent');
  const sent = callsOf(h, '/sendMessage');
  assert.equal(sent.length, 1);
  assert.equal(JSON.parse(sent[0].init.body).message_thread_id, 456);
  assert.equal(callsOf(h, '/img/avatar-builder/layers/').length, 0);
});

test('four-hour TAG RUN bulletin photo uses configured group thread in explicit group mode', async () => {
  const h = harness();
  const db = { prepare: () => ({bind: () => ({all: async () => ({results: []})})}) };
  const outcome = await postTagRunGroupBulletin(enabled({
    DB: db, TELEGRAM_MOONBOY_MEDIA_MODE: 'group'
  }), { nowMs: Date.parse('2026-11-10T16:03:00Z'), fetchImpl: h.fetchImpl });
  assert.equal(outcome.status, 'sent');
  const sent = callsOf(h, '/sendPhoto');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].init.body.get('message_thread_id'), '456');
  assert.equal(callsOf(h, '/sendMessage').length, 0);
});

test('uncertain bulletin send cannot duplicate with a text fallback', async () => {
  const h = harness({ photoFailure: true });
  const db = { prepare: () => ({bind: () => ({all: async () => ({results: []})})}) };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const result = await postTagRunGroupBulletin(enabled({
      DB: db, TELEGRAM_MOONBOY_MEDIA_MODE: 'group'
    }), { nowMs: Date.parse('2026-11-10T16:03:00Z'), fetchImpl: h.fetchImpl });
    assert.equal(result.status, 'unconfirmed');
    assert.equal(callsOf(h, '/sendPhoto').length, 1);
    assert.equal(callsOf(h, '/sendMessage').length, 0);
  } finally {
    console.warn = warn;
  }
});

function rankDb(row) {
  const transitions = [];
  return {
    transitions,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() { return { results: [row] }; },
            async run() {
              transitions.push({ sql, args });
              return { meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };
}
const rank = {
  chat_id: groupChat, telegram_id: privateChat,
  rank_threshold: 25, rank_name: 'Fresh Ink',
  display_name: 'Tagger', total_points: 25, source_message_id: 400
};

test('rank-up receipt retains exactly-once attempt and sent receipt in explicit group mode', async () => {
  const h = harness();
  const db = rankDb(rank);
  const result = await deliverTagRunRankAnnouncements(enabled({
    DB: db, TELEGRAM_MOONBOY_MEDIA_MODE: 'group'
  }), { fetchImpl: h.fetchImpl });
  assert.equal(result.sent, 1);
  assert.equal(result.needsReview, 0);
  assert.equal(callsOf(h, '/sendPhoto').length, 1);
  assert.equal(callsOf(h, '/sendMessage').length, 0);
  assert.equal(db.transitions.length, 2);
  assert.match(db.transitions[0].sql, /status='attempted'/);
  assert.match(db.transitions[1].sql, /status='sent'/);
  assert.equal(db.transitions[1].args[0], 345);
  assert.equal(callsOf(h, '/sendPhoto')[0].init.body.get('message_thread_id'), '456');
});

test('malformed photo acknowledgement sends rank receipt to needs_review without retry', async () => {
  const h = harness({ malformedPhotoAck: true });
  const db = rankDb(rank);
  const result = await deliverTagRunRankAnnouncements(enabled({
    DB: db, TELEGRAM_MOONBOY_MEDIA_MODE: 'group'
  }), { fetchImpl: h.fetchImpl });
  assert.equal(result.sent, 0);
  assert.equal(result.needsReview, 1);
  assert.equal(callsOf(h, '/sendPhoto').length, 1);
  assert.equal(callsOf(h, '/sendMessage').length, 0);
  assert.match(db.transitions[1].sql, /status='needs_review'/);
});

test('rank-up photo timeout produces needs_review, never a duplicate text post', async () => {
  const h = harness({ photoFailure: true });
  const db = rankDb(rank);
  const result = await deliverTagRunRankAnnouncements(enabled({
    DB: db, TELEGRAM_MOONBOY_MEDIA_MODE: 'group'
  }), { fetchImpl: h.fetchImpl });
  assert.equal(result.sent, 0);
  assert.equal(result.needsReview, 1);
  assert.equal(callsOf(h, '/sendPhoto').length, 1);
  assert.equal(callsOf(h, '/sendMessage').length, 0);
  assert.match(db.transitions[1].sql, /status='needs_review'/);
});

test('approved Images binding is present while live media remains off by default', () => {
  const wrangler = readFileSync(new URL(
    '../workers/moonboys-api/wrangler.toml', import.meta.url), 'utf8');
  assert.match(wrangler, /TELEGRAM_MOONBOY_PHOTOS_ENABLED\s*=\s*"false"/);
  assert.match(wrangler, /TELEGRAM_MOONBOY_MEDIA_MODE\s*=\s*"off"/);
  assert.match(wrangler, /\[images\][\s\S]*?binding\s*=\s*"IMAGES"/);
  const handler = readFileSync(new URL(
    '../workers/moonboys-api/tag-run/handler.js', import.meta.url), 'utf8');
  assert.match(handler, /sendControlledMoonboyTelegram/);
  assert.match(handler, /messageKind: 'tag-command'/);
  assert.match(handler, /messageKind: 'tag-bulletin'/);
  assert.match(handler, /messageKind: 'tag-rank'/);
});
