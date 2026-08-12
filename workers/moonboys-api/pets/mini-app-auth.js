const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeHexEqual(left, right) {
  const a = String(left || '').toLowerCase();
  const b = String(right || '').toLowerCase();
  if (a.length !== 64 || b.length !== 64) return false;
  if (typeof crypto?.subtle?.timingSafeEqual === 'function') {
    const decode = (value) => Uint8Array.from(value.match(/.{2}/g) || [], (pair) => Number.parseInt(pair, 16));
    return crypto.subtle.timingSafeEqual(decode(a), decode(b));
  }
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

async function hmacSha256(keyBytes, value) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(value));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlToText(value) {
  const normalized = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return decodeURIComponent(Array.from(atob(padded), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
}

export async function issuePetMiniAppChallenge(payload, botToken, options = {}) {
  if (!botToken) return null;
  const nowSeconds = Math.floor(Number(options.now_ms || Date.now()) / 1000);
  const lifetime = Math.max(60, Math.min(900, Number(options.max_age_seconds || 600)));
  const body = bytesToBase64Url(encoder.encode(JSON.stringify({
    v: 1,
    type: String(payload?.type || ''),
    telegram_id: String(payload?.telegram_id || ''),
    encounter_key: String(payload?.encounter_key || ''),
    event_key: String(payload?.event_key || ''),
    exp: nowSeconds + lifetime,
  })));
  const signature = bytesToHex(await hmacSha256(encoder.encode(String(botToken)), `MoonpetChallenge\n${body}`));
  return `${body}.${signature}`;
}

export async function verifyPetMiniAppChallenge(token, botToken, expected = {}, options = {}) {
  const [body, suppliedSignature, ...extra] = String(token || '').split('.');
  if (!body || !/^[a-f0-9]{64}$/i.test(suppliedSignature || '') || extra.length || !botToken) return { ok: false, reason: 'mini_app_challenge_invalid' };
  const expectedSignature = bytesToHex(await hmacSha256(encoder.encode(String(botToken)), `MoonpetChallenge\n${body}`));
  if (!constantTimeHexEqual(expectedSignature, suppliedSignature)) return { ok: false, reason: 'mini_app_challenge_rejected' };
  let payload;
  try { payload = JSON.parse(base64UrlToText(body)); } catch { return { ok: false, reason: 'mini_app_challenge_invalid' }; }
  const nowSeconds = Math.floor(Number(options.now_ms || Date.now()) / 1000);
  if (payload?.v !== 1 || !Number.isSafeInteger(payload.exp) || payload.exp < nowSeconds || payload.exp > nowSeconds + 1200) return { ok: false, reason: 'mini_app_challenge_expired' };
  if (String(payload.type) !== String(expected.type) || String(payload.telegram_id) !== String(expected.telegram_id)) return { ok: false, reason: 'mini_app_challenge_mismatch' };
  return { ok: true, payload };
}

export async function verifyTelegramMiniAppInitData(initDataRaw, botToken, options = {}) {
  const initData = String(initDataRaw || '');
  if (!initData || initData.length > 8192 || !botToken) return { ok: false, reason: 'mini_app_auth_required' };

  const params = new URLSearchParams(initData);
  const seen = new Set();
  for (const [key] of params) {
    if (seen.has(key)) return { ok: false, reason: 'mini_app_auth_duplicate_field' };
    seen.add(key);
  }

  const suppliedHash = String(params.get('hash') || '').toLowerCase();
  const authDate = Number(params.get('auth_date'));
  const userRaw = params.get('user');
  if (!/^[a-f0-9]{64}$/.test(suppliedHash) || !Number.isSafeInteger(authDate) || !userRaw) {
    return { ok: false, reason: 'mini_app_auth_invalid' };
  }

  const nowSeconds = Math.floor(Number(options.now_ms || Date.now()) / 1000);
  const maxAgeSeconds = Math.max(60, Math.min(86400, Number(options.max_age_seconds || 3600)));
  if (authDate - nowSeconds > 300 || nowSeconds - authDate > maxAgeSeconds) {
    return { ok: false, reason: 'mini_app_auth_expired' };
  }

  const checkString = Array.from(params.entries())
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = await hmacSha256(encoder.encode('WebAppData'), String(botToken));
  const expectedHash = bytesToHex(await hmacSha256(secret, checkString));
  if (!constantTimeHexEqual(expectedHash, suppliedHash)) return { ok: false, reason: 'mini_app_auth_rejected' };

  let user;
  try { user = JSON.parse(userRaw); } catch { return { ok: false, reason: 'mini_app_user_invalid' }; }
  const telegramId = String(user?.id || '').trim();
  if (!/^\d{1,20}$/.test(telegramId)) return { ok: false, reason: 'mini_app_user_invalid' };

  return {
    ok: true,
    telegramId,
    authDate,
    queryId: String(params.get('query_id') || ''),
    user: {
      id: telegramId,
      username: user.username || null,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      language_code: user.language_code || null,
    },
  };
}
