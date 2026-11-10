// PR2 — opt-in Telegram media transport. NOT wired into production routes.
// Never retry a photo after a transport error: Telegram may have delivered it.
// No Worker config, Images binding, DB writes, or live feature flags here.
export const TELEGRAM_PHOTO_CAPTION_LIMIT = 1024;
export const TELEGRAM_TEXT_LIMIT = 4096;
export const TELEGRAM_PHOTO_MAX_BYTES = 500_000;
const CHAT_ID = /^-?[0-9]{1,20}$/;
const TELEGRAM_FILE_ID = /^[A-Za-z0-9_-]{20,256}$/;
const THREAD_ID = /^[1-9][0-9]{0,12}$/;
const PHOTO_REJECTION_STATUS = new Set([400, 403, 404, 413, 422]);

function fail(reason) { throw new Error('telegram_media_' + reason); }

function validateChatId(value) {
  const id = String(value ?? '');
  if (!CHAT_ID.test(id)) fail('invalid_chat_id');
  return id;
}

function validateThreadId(value) {
  if (value === undefined || value === null) return undefined;
  const id = String(value);
  if (!THREAD_ID.test(id) || !Number.isSafeInteger(Number(id))) fail('invalid_thread_id');
  return Number(id);
}

function validateText(text) {
  if (typeof text !== 'string' || !text.length) fail('invalid_text');
  if (text.length > TELEGRAM_TEXT_LIMIT) fail('text_exceeds_4096');
  return text;
}

function copyOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    fail('invalid_options');
  }
  // Explicitly allow only existing Telegram fields that apply to both
  // sendMessage and sendPhoto; do not accept arbitrary untrusted API options.
  const payload = {};
  for (const name of [
    'parse_mode', 'caption_entities', 'entities', 'disable_notification',
    'protect_content', 'reply_to_message_id', 'allow_sending_without_reply',
    'message_thread_id', 'reply_markup'
  ]) {
    if (options[name] !== undefined && options[name] !== null) {
      payload[name] = options[name];
    }
  }
  if (payload.parse_mode !== undefined &&
      !['HTML', 'Markdown', 'MarkdownV2'].includes(payload.parse_mode)) {
    fail('invalid_parse_mode');
  }
  if (payload.message_thread_id !== undefined) {
    payload.message_thread_id = validateThreadId(payload.message_thread_id);
  }
  if (payload.entities !== undefined && !Array.isArray(payload.entities)) fail('invalid_entities');
  if (payload.caption_entities !== undefined && !Array.isArray(payload.caption_entities)) fail('invalid_caption_entities');
  if (payload.reply_markup !== undefined &&
      (typeof payload.reply_markup !== 'object' || Array.isArray(payload.reply_markup))) {
    fail('invalid_reply_markup');
  }
  return payload;
}

function telegramUrl(token, method) {
  if (typeof token !== 'string' || !/^[0-9]{4,20}:[A-Za-z0-9_-]{20,}$/.test(token)) {
    fail('invalid_bot_token');
  }
  return 'https://api.telegram.org/bot' + token + '/' + method;
}

function formValue(form, key, value) {
  if (value === undefined || value === null) return;
  if (typeof value === 'object') form.set(key, JSON.stringify(value));
  else form.set(key, String(value));
}

function validatePhoto(photo) {
  if (!photo || typeof photo !== 'object' || photo.mimeType !== 'image/jpeg' ||
      !(photo.bytes instanceof Uint8Array) ||
      photo.bytes.byteLength === 0 ||
      photo.bytes.byteLength > TELEGRAM_PHOTO_MAX_BYTES ||
      photo.width !== 640 || photo.height !== 640) {
    fail('invalid_photo');
  }
  return photo.bytes;
}

async function sendTelegramRequest(fetchImpl, url, init) {
  // A fetch throw, timeout or unreadable successful response is ambiguous.
  // Caller MUST NOT send a fallback after an ambiguous delivery.
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    return { status: 'uncertain', reason: 'transport_failure' };
  }
  let result;
  try {
    result = await response.json();
  } catch {
    return { status: 'uncertain', reason: 'unreadable_telegram_response' };
  }
  const messageId = result?.result?.message_id;
  // A malformed or missing acknowledgement is not proof of delivery.
  // Telegram message IDs are positive integers; reject null, strings,
  // fractions and unsafe numeric values without attempting a fallback.
  if (response.ok && result?.ok === true &&
      Number.isSafeInteger(messageId) && messageId > 0) {
    return {
      status: 'sent', telegramMessageId: messageId,
      telegramFileId: result.result.photo?.at(-1)?.file_id || null
    };
  }
  if (!response.ok && PHOTO_REJECTION_STATUS.has(response.status) && result?.ok === false) {
    return { status: 'rejected', reason: 'telegram_definitive_rejection' };
  }
  // 429, 5xx, unexpected 2xx and malformed acknowledgements: fail closed.
  return { status: 'uncertain', reason: 'telegram_unconfirmed' };
}

async function sendText({ token, chatId, text, options, fetchImpl }) {
  const payload = { chat_id: chatId, text, ...options };
  // Text-only API supports entities, not caption_entities. Convert rather
  // than silently discard formatting on a definitive photo rejection.
  if (payload.entities === undefined && payload.caption_entities !== undefined) {
    payload.entities = payload.caption_entities;
  }
  delete payload.caption_entities;
  const response = await sendTelegramRequest(fetchImpl, telegramUrl(token, 'sendMessage'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response;
}

function photoOptions(options) {
  const payload = { ...options };
  // Photo API supports caption_entities, not entities.
  if (payload.entities !== undefined && payload.caption_entities === undefined) {
    payload.caption_entities = payload.entities;
  }
  delete payload.entities;
  return payload;
}

// An explicit transport object is returned for every network result.
// The caller owns durable deduplication; 'uncertain' is terminal, not retryable.
// Text longer than Telegram's 1024-character photo caption limit is sent as
// one original sendMessage (no photo) to preserve full content atomically.
// The later coverage PR can add a separately reviewed long-text strategy.
export async function sendTelegramMoonboyMessage({
  token, chatId, text, photo, options = {}, fetchImpl = fetch
} = {}) {
  const id = validateChatId(chatId);
  const body = validateText(text);
  const safeOptions = copyOptions(options);
  // Do not make the network call if configuration is invalid.
  const textUrl = telegramUrl(token, 'sendMessage');
  const photoUrl = telegramUrl(token, 'sendPhoto');

  if (photo === undefined || photo === null || body.length > TELEGRAM_PHOTO_CAPTION_LIMIT) {
    const result = await sendText({ token, chatId: id, text: body, options: safeOptions, fetchImpl });
    return { ...result, method: 'sendMessage', photoSkipped: body.length > TELEGRAM_PHOTO_CAPTION_LIMIT };
  }

  // A confirmed Telegram file_id avoids both a paid image transformation and
  // a JPEG upload. It is accepted only from the bounded PR4 cache, never from
  // inbound Telegram/user data.
  if (photo && typeof photo === 'object' &&
      TELEGRAM_FILE_ID.test(String(photo.telegramFileId || ''))) {
    const payload = {
      chat_id: id, photo: String(photo.telegramFileId), caption: body,
      ...photoOptions(safeOptions)
    };
    const outcome = await sendTelegramRequest(fetchImpl, photoUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (outcome.status === 'sent') {
      return { ...outcome, method: 'sendPhoto', photoSkipped: false,
        fileIdReused: true };
    }
    if (outcome.status !== 'rejected') {
      return { ...outcome, method: 'sendPhoto', photoSkipped: false,
        fileIdReused: true };
    }
    const fallback = await sendText({
      token, chatId: id, text: body, options: safeOptions, fetchImpl
    });
    return { ...fallback, method: 'sendMessage', photoSkipped: true,
      fileIdReused: true, photoRejection: outcome.reason };
  }

  let bytes;
  try { bytes = validatePhoto(photo); }
  catch {
    // A definite pre-send image validation failure is safe to fall back.
    const result = await sendText({ token, chatId: id, text: body, options: safeOptions, fetchImpl });
    return { ...result, method: 'sendMessage', photoSkipped: true };
  }

  const form = new FormData();
  form.set('chat_id', id);
  form.set('caption', body);
  for (const [key, value] of Object.entries(photoOptions(safeOptions))) {
    formValue(form, key, value);
  }
  form.set('photo', new Blob([bytes], { type: 'image/jpeg' }), 'moonboy.jpg');
  const outcome = await sendTelegramRequest(fetchImpl, photoUrl, {
    method: 'POST', body: form
  });
  if (outcome.status === 'sent') return { ...outcome, method: 'sendPhoto', photoSkipped: false };
  if (outcome.status !== 'rejected') {
    return { ...outcome, method: 'sendPhoto', photoSkipped: false };
  }
  // Telegram explicitly rejected the upload (not a timeout or unknown error).
  // Fall back once to text, preserving the full original text and topic.
  const fallback = await sendText({
    token, chatId: id, text: body, options: safeOptions, fetchImpl
  });
  return { ...fallback, method: 'sendMessage', photoSkipped: true,
    photoRejection: outcome.reason };
}
