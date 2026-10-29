import { verifyTelegramIdentityFromBody } from './blocktopia/auth.js';
import { verifyTelegramMiniAppInitData } from './pets/mini-app-auth.js';

const PATH = '/telegram/group-membership';
const ALLOWED_ORIGINS = new Set([
  'https://cryptomoonboys.com',
  'https://www.cryptomoonboys.com',
  'https://crypto-moonboys.github.io',
]);
const ACTIVE_STATUSES = new Set(['creator', 'administrator', 'member']);

function cors(request) {
  const origin = String(request.headers.get('Origin') || '').trim();
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  return { origin, headers };
}

function json(headers, data, status = 200) {
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), { status, headers });
}

function authCheckString(fields) {
  return Object.keys(fields || {})
    .filter(key => key !== 'hash' && fields[key] != null)
    .sort()
    .map(key => key + '=' + fields[key])
    .join('\n');
}

async function verifyTelegramAuth(fields, botToken) {
  if (!fields || !botToken || !fields.hash) return false;
  const supplied = String(fields.hash).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const suppliedBytes = new Uint8Array(32);
  for (let i = 0; i < suppliedBytes.length; i += 1) {
    suppliedBytes[i] = parseInt(supplied.slice(i * 2, i * 2 + 2), 16);
  }
  const secret = await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(String(botToken)));
  const key = await crypto.subtle.importKey('raw', secret,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, suppliedBytes,
    new TextEncoder().encode(authCheckString(fields)));
}

function isActiveMember(member) {
  if (!member || typeof member.status !== 'string') return false;
  if (ACTIVE_STATUSES.has(member.status)) return true;
  return member.status === 'restricted' && member.is_member === true;
}

async function readTelegramBotIdentity(token, fetchImpl = fetch) {
  try {
    const response = await fetchImpl('https://api.telegram.org/bot' + token + '/getMe', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok !== true || !body.result) return null;
    return {
      id: String(body.result.id || ''),
      username: String(body.result.username || ''),
    };
  } catch {
    return null;
  }
}

export async function checkTelegramGroupMember(env, telegramId, fetchImpl = fetch) {
  const groupId = String(env?.TELEGRAM_GROUP_CHAT_ID || '').trim();
  const token = String(env?.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token || !groupId) {
    return { ok: false, error: 'telegram_group_membership_not_configured', status: 503 };
  }
  if (!/^\d{1,20}$/.test(String(telegramId || ''))) {
    return { ok: false, error: 'telegram_auth_invalid', status: 401 };
  }
  const userId = Number(telegramId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return { ok: false, error: 'telegram_auth_invalid', status: 401 };
  }

  let response;
  try {
    response = await fetchImpl('https://api.telegram.org/bot' + token + '/getChatMember', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: groupId, user_id: userId }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { ok: false, error: 'telegram_group_membership_unavailable', status: 503 };
  }

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true || !body.result) {
    return { ok: false, error: 'telegram_group_membership_unavailable', status: 503 };
  }
  return {
    ok: true,
    member: isActiveMember(body.result),
    chat_member_status: String(body.result.status || ''),
  };
}

async function verifyMembershipActor(body, env, verifyLegacyAuth) {
  const initData = typeof body?.init_data === 'string' ? body.init_data.trim() : '';
  if (initData) {
    if (!env?.TELEGRAM_BOT_TOKEN) {
      return { error: 'telegram_group_membership_not_configured', status: 503 };
    }
    const verified = await verifyTelegramMiniAppInitData(initData, env.TELEGRAM_BOT_TOKEN, {
      max_age_seconds: 3600,
    });
    if (!verified.ok) {
      return { error: verified.reason || 'mini_app_auth_rejected', status: 401 };
    }
    return { telegramId: verified.telegramId, source: 'telegram_mini_app' };
  }
  return verifyTelegramIdentityFromBody(body, env, verifyLegacyAuth);
}

export async function handleTelegramGroupMembership(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  if (url.pathname.replace(/\/$/, '') !== PATH) return null;
  const { origin, headers } = cors(request);

  if (!ALLOWED_ORIGINS.has(origin)) {
    return json(headers, { ok: false, error: 'website_origin_required' }, 403);
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  // Public readiness probe used only to guarantee Worker-before-Pages rollout.
  // It checks the bot's OWN status in the configured group and exposes no
  // identity or secret. Telegram only guarantees other-user membership checks
  // when this bot is an administrator.
  if (request.method === 'GET') {
    const token = String(env?.TELEGRAM_BOT_TOKEN || '').trim();
    const groupId = String(env?.TELEGRAM_GROUP_CHAT_ID || '').trim();
    const botMatch = token.match(/^(\d+):/);
    const botId = botMatch ? botMatch[1] : '';
    if (!env?.DB || !token || !groupId || !botId) {
      return json(headers, { ok: false, error: 'telegram_group_membership_not_configured' }, 503);
    }
    const [botStatus, botIdentity] = await Promise.all([
      checkTelegramGroupMember(env, botId, fetchImpl),
      readTelegramBotIdentity(token, fetchImpl),
    ]);
    if (!botStatus.ok) {
      return json(headers, {
        ok: false,
        error: botStatus.error,
        bot_username: botIdentity?.username || null,
      }, botStatus.status || 503);
    }
    if (!['creator', 'administrator'].includes(botStatus.chat_member_status)) {
      return json(headers, {
        ok: false,
        error: 'telegram_group_membership_bot_not_admin',
        bot_status: botStatus.chat_member_status,
        bot_username: botIdentity?.username || null,
      }, 503);
    }
    return json(headers, {
      ok: true,
      configured: true,
      bot_admin: true,
      bot_status: botStatus.chat_member_status,
      bot_username: botIdentity?.username || null,
      native_init_data: true,
      all_games_gate_version: 1,
      group: '@gkniftyheads',
    });
  }

  if (request.method !== 'POST') return json(headers, { ok: false, error: 'method_not_allowed' }, 405);
  if (!env?.DB || !env?.TELEGRAM_BOT_TOKEN || !env?.TELEGRAM_GROUP_CHAT_ID) {
    return json(headers, { ok: false, error: 'telegram_group_membership_not_configured' }, 503);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return json(headers, { ok: false, error: 'invalid_request' }, 400);
  }
  if (Number(request.headers.get('Content-Length') || 0) > 10000) {
    return json(headers, { ok: false, error: 'invalid_request' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(headers, { ok: false, error: 'invalid_request' }, 400);
  }

  const verified = await verifyMembershipActor(body, env, verifyTelegramAuth);
  if (verified?.error) {
    return json(headers, { ok: false, error: verified.error }, verified.status || 401);
  }
  if (!verified?.telegramId) {
    return json(headers, { ok: false, error: 'verified Telegram identity required' }, 401);
  }

  const membership = await checkTelegramGroupMember(env, verified.telegramId, fetchImpl);
  if (!membership.ok) {
    return json(headers, { ok: false, error: membership.error }, membership.status || 503);
  }

  return json(headers, {
    ok: true,
    member: membership.member,
    status: membership.chat_member_status,
    group: '@gkniftyheads',
  });
}
