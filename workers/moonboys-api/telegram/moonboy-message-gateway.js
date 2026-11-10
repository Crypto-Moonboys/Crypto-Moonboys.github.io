// PR3 — controlled bot Telegram photo canary integration.
// No change to existing Telegram delivery while the feature is disabled.
// This module only handles text-only messages; never intercept existing photos.
import {
  loadHomepageMoonboyManifest, composeTelegramMoonboy
} from './moonboy-portrait.js';
import {
  sendTelegramMoonboyMessage, TELEGRAM_PHOTO_CAPTION_LIMIT
} from './moonboy-photo-transport.js';

const ID = /^-?[0-9]{1,20}$/;
const SEED = /^[A-Za-z0-9_.:|/-]{1,200}$/;
const APPROVED_KIND = new Set(['tag-command', 'tag-bulletin', 'tag-rank']);

// Fail-closed allowlist: a private Telegram canary may only run in the
// explicitly chosen private chat; a later controlled group rollout needs both
// the group mode and an exact match to the existing official group setting.
// No opt-in setting, no Images binding, or no declared context = no render.
export function isMoonboyTelegramMediaEnabled(env, {
  chatId, chatKind, messageKind
} = {}) {
  if (env?.TELEGRAM_MOONBOY_PHOTOS_ENABLED !== 'true' ||
      !env?.IMAGES?.input || !APPROVED_KIND.has(messageKind)) return false;
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
  options = {}, fetchImpl = fetch, cryptoImpl = globalThis.crypto
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
  let portrait;
  try {
    const manifest = await loadHomepageMoonboyManifest(fetchImpl);
    portrait = await composeTelegramMoonboy({
      images: env.IMAGES, manifest, seed, fetchImpl, cryptoImpl
    });
  } catch {
    // This catch wraps ONLY manifest/image creation. Zero Telegram requests
    // happened, so the legacy text send is safe. Do not include secrets or
    // member text in logs.
    return { status: 'composition_failed', reason: 'render_unavailable' };
  }
  // After transport starts, even a thrown exception can follow a successful
  // Telegram upload/acknowledgement. Do not let an exception escape into a
  // command handler's existing error-reply catch; that would post twice.
  // Always classify transport exceptions as terminal uncertainty.
  try {
    return await sendTelegramMoonboyMessage({
      token: env.TELEGRAM_BOT_TOKEN, chatId, text, photo: portrait,
      options, fetchImpl
    });
  } catch {
    return {
      status: 'uncertain', reason: 'photo_transport_exception',
      method: 'sendPhoto', photoSkipped: false
    };
  }
}
