import { TELEGRAM_AUTH_MAX_AGE } from './config.js';

function logTelegramAuthFailure(event, context = {}) {
  console.log('[blocktopia][telegram_auth]', JSON.stringify({
    event,
    ...context,
    timestamp: new Date().toISOString(),
  }));
}

function parseTelegramAuthPayload(rawValue) {
  if (!rawValue) return null;
  if (typeof rawValue === 'object') return rawValue;
  if (typeof rawValue !== 'string') return null;
  try {
    return JSON.parse(rawValue);
  } catch (_) {}
  try {
    const normalized = rawValue.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4;
    const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
    return JSON.parse(atob(padded));
  } catch (_) {}
  return null;
}

function readTelegramAuthPayloadFromBody(body) {
  if (!body) return null;
  if (typeof body === 'string') return parseTelegramAuthPayload(body);
  if (typeof body !== 'object') return null;
  if (body.telegram_auth !== undefined) return parseTelegramAuthPayload(body.telegram_auth);
  if (body.id || body.auth_date || body.hash) return parseTelegramAuthPayload(body);
  return null;
}

export async function verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth) {
  const tg = readTelegramAuthPayloadFromBody(body);
  if (!tg || typeof tg !== 'object') {
    logTelegramAuthFailure('missing_payload');
    return { error: 'verified telegram_auth payload required', status: 401 };
  }
  const required = ['id', 'auth_date', 'hash'];
  for (const key of required) {
    if (!tg[key]) {
      logTelegramAuthFailure('missing_required_field', { key, telegramId: String(tg.id || '') });
      return { error: `telegram_auth.${key} required`, status: 401 };
    }
  }
  const telegramId = String(tg.id || '').trim();
  const authDate = String(tg.auth_date || '').trim();
  const hash = String(tg.hash || '').trim();
  if (!/^\d{1,20}$/.test(telegramId)) {
    logTelegramAuthFailure('invalid_telegram_id', { telegramId });
    return { error: 'telegram_auth.id invalid', status: 401 };
  }
  if (!/^\d{1,12}$/.test(authDate)) {
    logTelegramAuthFailure('invalid_auth_date', { telegramId });
    return { error: 'telegram_auth.auth_date invalid', status: 401 };
  }
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    logTelegramAuthFailure('invalid_hash_shape', { telegramId });
    return { error: 'telegram_auth.hash invalid', status: 401 };
  }
  const now = Math.floor(Date.now() / 1000);
  const authDateSeconds = parseInt(authDate, 10);
  if (authDateSeconds - now > 300) {
    logTelegramAuthFailure('auth_date_from_future', { telegramId });
    return { error: 'telegram_auth.auth_date invalid', status: 401 };
  }
  if (now - authDateSeconds > TELEGRAM_AUTH_MAX_AGE) {
    logTelegramAuthFailure('auth_expired', { telegramId });
    return { error: 'Telegram auth data has expired', status: 401 };
  }
  let valid = false;
  try {
    valid = await verifyTelegramAuth({
      id: telegramId,
      first_name: tg.first_name,
      last_name: tg.last_name,
      username: tg.username,
      photo_url: tg.photo_url,
      auth_date: authDate,
      hash,
    }, env.TELEGRAM_BOT_TOKEN);
  } catch (error) {
    logTelegramAuthFailure('verification_exception', {
      telegramId,
      message: error?.message || String(error),
    });
    return { error: 'Telegram auth verification failed', status: 401 };
  }
  if (!valid) {
    logTelegramAuthFailure('verification_rejected', { telegramId });
    return { error: 'Telegram auth verification failed', status: 401 };
  }
  return {
    telegramId,
    authPayload: {
      id: telegramId,
      first_name: tg.first_name || null,
      last_name: tg.last_name || null,
      username: tg.username || null,
      photo_url: tg.photo_url || null,
      auth_date: authDate,
      hash,
    },
    user: {
      id: telegramId,
      username: tg.username || null,
      first_name: tg.first_name || null,
      last_name: tg.last_name || null,
    },
  };
}
