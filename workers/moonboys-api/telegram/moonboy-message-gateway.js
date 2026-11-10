// PR3 — controlled bot Telegram photo canary integration.
// No change to existing Telegram delivery while the feature is disabled.
// This module only handles text-only messages; never intercept existing photos.
import {
  loadHomepageMoonboyManifest, composeTelegramMoonboy
} from './moonboy-portrait.js';
import {
  sendTelegramMoonboyMessage, TELEGRAM_PHOTO_CAPTION_LIMIT
} from './moonboy-photo-transport.js';
import {
  readMoonboyMediaCache, cacheMoonboyPortrait, cacheMoonboyTelegramFileId
} from './moonboy-media-cache.js';

const ID = /^-?[0-9]{1,20}$/;
const SEED = /^[A-Za-z0-9_.:|/-]{1,200}$/;
const LEGACY_DEFAULT_KIND = new Set(['tag-command', 'tag-bulletin', 'tag-rank']);
const APPROVED_KIND = new Set([
  ...LEGACY_DEFAULT_KIND,
  'daily-digest', 'group-announcement', 'games-pin', 'core-command'
]);

function messageKindEnabled(env, messageKind) {
  if (!APPROVED_KIND.has(messageKind)) return false;
  if (LEGACY_DEFAULT_KIND.has(messageKind)) return true;
  const configured = String(env?.TELEGRAM_MOONBOY_MESSAGE_KINDS || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  return configured.includes(messageKind);
}

// Fail-closed allowlist: a private Telegram canary may only run in the
// explicitly chosen private chat; a later controlled group rollout needs both
// the group mode and an exact match to the existing official group setting.
// No opt-in setting, no Images binding, or no declared context = no render.
export function isMoonboyTelegramMediaEnabled(env, {
  chatId, chatKind, messageKind
} = {}) {
  if (env?.TELEGRAM_MOONBOY_PHOTOS_ENABLED !== 'true' ||
      !env?.IMAGES?.input || !messageKindEnabled(env, messageKind)) return false;
  const destination = String(chatId ?? '');
  if (!ID.test(destination)) return false;
  const mode = String(env?.TELEGRAM_MOONBOY_MEDIA_MODE || 'off');
  if (mode === 'canary') {
    const chosen = String(env?.TELEGRAM_MOONBOY_CANARY_CHAT_ID || '');
    return chatKind === 'private' && !destination.startsWith('-') &&
      ID.test(chosen) && !chosen.startsWith('-') &&
      destination === chosen;
  }
  if (mode === 'group') {
    const group = String(env?.TELEGRAM_GROUP_CHAT_ID || '');
    return chatKind === 'group' && destination.startsWith('-') &&
      ID.test(group) && group.startsWith('-') && destination === group;
  }
  return false;
}

// Only stable, public numeric identifiers appear in the seed. Never include
// message text, wallet IDs, passwords, bot tokens or private account details.
export function moonboyTelegramMessageSeed(kind, chatId, logicalId, sequence = 0) {
  const result = [kind, chatId, logicalId, sequence].map(String).join(':');
  if (!SEED.test(result)) throw new Error('telegram_media_invalid_seed');
  return result;
}

// Return {status:'disabled'} if the original send path MUST handle this.
// Return {status:'composition_failed'} if the original send path can safely
// send text (no Telegram request has occurred).
// Return Telegram transport outcome after any send attempt: status:'uncertain'
// is terminal and MUST NEVER result in a second text or photo attempt.
export async function sendControlledMoonboyTelegram({
  env, chatId, chatKind, messageKind, seed, text,
  options = {}, fetchImpl = fetch, cryptoImpl = globalThis.crypto,
  cacheImpl = undefined
} = {}) {
  if (!isMoonboyTelegramMediaEnabled(env, { chatId, chatKind, messageKind })) {
    return { status: 'disabled' };
  }
  if (typeof text !== 'string' || text.length === 0 ||
      text.length > TELEGRAM_PHOTO_CAPTION_LIMIT) {
    // PR2 deliberately sends long captions as text only; avoid a nine-layer
    // paid composition that would not be used.
    return { status: 'disabled' };
  }
  if (typeof seed !== 'string' || !SEED.test(seed)) {
    return { status: 'composition_failed', reason: 'invalid_seed' };
  }
  const startedAt = Date.now();
  let cacheSource = 'miss';
  let rendered = false;
  let portrait;
  try {
    const cached = await readMoonboyMediaCache(cacheImpl, seed);
    cacheSource = cached.source || 'miss';
    if (cached.telegramFileId) {
      portrait = { telegramFileId: cached.telegramFileId };
    } else if (cached.portrait) {
      portrait = cached.portrait;
    } else {
      const manifest = await loadHomepageMoonboyManifest(fetchImpl);
      portrait = await composeTelegramMoonboy({
        images: env.IMAGES, manifest, seed, fetchImpl, cryptoImpl
      });
      rendered = true;
      await cacheMoonboyPortrait(cacheImpl, seed, portrait);
    }
  } catch {
    // Cache, manifest and image creation happen before Telegram. A failure is
    // definitive, so the exact legacy text route remains safe.
    console.log('telegram_moonboy_media', JSON.stringify({
      message_kind: messageKind, status: 'composition_failed',
      cache: cacheSource, rendered, duration_ms: Date.now() - startedAt
    }));
    return { status: 'composition_failed', reason: 'render_unavailable' };
  }
  // After transport starts, even a thrown exception can follow a successful
  // Telegram upload/acknowledgement. Never let it trigger a duplicate message.
  try {
    const outcome = await sendTelegramMoonboyMessage({
      token: env.TELEGRAM_BOT_TOKEN, chatId, text, photo: portrait,
      options, fetchImpl
    });
    if (outcome.status === 'sent' && outcome.telegramFileId) {
      await cacheMoonboyTelegramFileId(cacheImpl, seed, outcome.telegramFileId);
    }
    console.log('telegram_moonboy_media', JSON.stringify({
      message_kind: messageKind, status: outcome.status,
      cache: cacheSource, rendered,
      render_bytes: rendered ? portrait?.bytes?.byteLength || 0 : 0,
      file_id_reused: outcome.fileIdReused === true,
      method: outcome.method || null,
      duration_ms: Date.now() - startedAt
    }));
    return outcome;
  } catch {
    console.log('telegram_moonboy_media', JSON.stringify({
      message_kind: messageKind, status: 'uncertain',
      cache: cacheSource, rendered, duration_ms: Date.now() - startedAt
    }));
    return {
      status: 'uncertain', reason: 'photo_transport_exception',
      method: 'sendPhoto', photoSkipped: false
    };
  }
}
