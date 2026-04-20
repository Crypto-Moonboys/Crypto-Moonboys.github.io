import { TELEGRAM_AUTH_MAX_AGE } from './config.js';

function logTelegramAuthFailure(event, context = {}) {
  console.log('[blocktopia][telegram_auth]', JSON.stringify({
    event,
    ...context,
    timestamp: new Date().toISOString(),
  }));
}

export async function verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth) {
  const tg = body?.telegram_auth;
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
  const now = Math.floor(Date.now() / 1000);
  if (now - parseInt(tg.auth_date, 10) > TELEGRAM_AUTH_MAX_AGE) {
    logTelegramAuthFailure('auth_expired', { telegramId: String(tg.id || '') });
    return { error: 'Telegram auth data has expired', status: 401 };
  }
  let valid = false;
  try {
    valid = await verifyTelegramAuth({
      id: tg.id,
      first_name: tg.first_name,
      last_name: tg.last_name,
      username: tg.username,
      photo_url: tg.photo_url,
      auth_date: tg.auth_date,
      hash: tg.hash,
    }, env.TELEGRAM_BOT_TOKEN);
  } catch (error) {
    logTelegramAuthFailure('verification_exception', {
      telegramId: String(tg.id || ''),
      message: error?.message || String(error),
    });
    return { error: 'Telegram auth verification failed', status: 401 };
  }
  if (!valid) {
    logTelegramAuthFailure('verification_rejected', { telegramId: String(tg.id || '') });
    return { error: 'Telegram auth verification failed', status: 401 };
  }
  return {
    telegramId: String(tg.id),
    user: {
      id: String(tg.id),
      username: tg.username || null,
      first_name: tg.first_name || null,
      last_name: tg.last_name || null,
    },
  };
}
