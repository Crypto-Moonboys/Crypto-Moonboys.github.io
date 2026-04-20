import { TELEGRAM_AUTH_MAX_AGE } from './config.js';

export async function verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth) {
  const tg = body?.telegram_auth;
  if (!tg || typeof tg !== 'object') {
    return { error: 'verified telegram_auth payload required', status: 401 };
  }
  const required = ['id', 'auth_date', 'hash'];
  for (const key of required) {
    if (!tg[key]) return { error: `telegram_auth.${key} required`, status: 401 };
  }
  const now = Math.floor(Date.now() / 1000);
  if (now - parseInt(tg.auth_date, 10) > TELEGRAM_AUTH_MAX_AGE) {
    return { error: 'Telegram auth data has expired', status: 401 };
  }
  const valid = await verifyTelegramAuth({
    id: tg.id,
    first_name: tg.first_name,
    last_name: tg.last_name,
    username: tg.username,
    photo_url: tg.photo_url,
    auth_date: tg.auth_date,
    hash: tg.hash,
  }, env.TELEGRAM_BOT_TOKEN);
  if (!valid) return { error: 'Telegram auth verification failed', status: 401 };
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
