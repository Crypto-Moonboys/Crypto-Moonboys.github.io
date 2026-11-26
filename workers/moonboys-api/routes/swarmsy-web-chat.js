import { verifyTelegramIdentityFromBody } from '../blocktopia/auth.js';
import { verifyTelegramAuth } from '../telegram-group-membership.js';
import { findPublishedTemplateSupply, findPublicSwarmsySources } from '../shared/clan-leader-lore.js';

const UPSTREAM = 'https://swarmsy.cryptomoonboys.com/api/sparky-web/chat';
const MAX_MESSAGE = 2000;
const CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECRET = /^[A-Za-z0-9_-]{43,128}$/;
const CANON_REQUEST = /\b(?:canon(?:ical)?|lore|wiki|backstory|nfts?|collection|template|mint|ninth berth|bitcoin kid army|hodl(?: x)? warriors|all city bulls|nomad bears|gk\s*nifty\s*heads)\b/i;
const FACT_LOOKUP = /^(?:who|what|where|when|which|how many|tell me about|explain)\b/i;
const encoder = new TextEncoder();

async function readJson(message, limit) {
  if (!message.body || Number(message.headers.get('Content-Length')) > limit) {
    await message.body?.cancel();
    return null;
  }
  const reader = message.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      size += value.byteLength;
      if (size > limit) return null;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function upstreamSession(secret, telegramId, conversationId) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const bytes = await crypto.subtle.sign(
    'HMAC', key, encoder.encode(`swarmsy-web:v1:${telegramId}:${conversationId}`),
  );
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function handleSwarmsyWebChat(request, env, cors) {
  const headers = { ...cors, 'Cache-Control': 'no-store' };
  const respond = (payload, status = 200, extraHeaders = {}) =>
    Response.json(payload, { status, headers: { ...headers, ...extraHeaders } });

  // Keep the public response generic. Log only the failing stage and status,
  // with the Ray ID for correlation. Never log request content or credentials.
  const unavailable = (stage, status) => {
    console.warn(JSON.stringify({
      event: 'swarmsy_chat_unavailable',
      ray: request.headers.get('CF-Ray'),
      stage,
      ...(status === undefined ? {} : { upstream_status: status }),
    }));
    return respond({ error: 'chat_unavailable' }, 503);
  };

  if (request.headers.has('Origin') && !cors['Access-Control-Allow-Origin']) {
    return respond({ error: 'origin_not_allowed' }, 403);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      ...headers,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '300',
    } });
  }
  if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    return respond({ error: 'invalid_request' }, 415);
  }

  const body = await readJson(request, 16_384);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const conversationId = body?.conversation_id;
  if (!message || message.length > MAX_MESSAGE ||
      typeof conversationId !== 'string' || !CONVERSATION_ID.test(conversationId)) {
    return respond({ error: 'invalid_request' }, 400);
  }

  const identity = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
  if (!identity.telegramId) {
    if (identity.status === 503) return unavailable('telegram_session_lookup');
    if (identity.status === 403) return respond({ error: 'access_denied' }, 403);
    return respond({ error: 'connect_telegram' }, 401);
  }

  const token = env.SWARMSY_WEB_TOKEN;
  const sessionKey = env.SWARMSY_WEB_SESSION_KEY;
  if (!SECRET.test(token ?? '')) return unavailable('bridge_token_format');
  if (!SECRET.test(sessionKey ?? '') || token === sessionKey) return unavailable('session_key_config');
  if (!env.SWARMSY_USER_LIMIT || !env.SWARMSY_SITE_LIMIT) return unavailable('rate_limit_binding');

  let stage = 'rate_limit';
  try {
    const userAllowance = await env.SWARMSY_USER_LIMIT.limit({ key: identity.telegramId });
    const permitted = userAllowance.success && (await env.SWARMSY_SITE_LIMIT.limit({ key: 'swarmsy-web' })).success;
    if (!permitted) return respond({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });

    stage = 'prepare_request';
    const supply = await findPublishedTemplateSupply(message, body.template_context);
    if (supply) return respond(supply);

    const requestedCanon = body.public_canon === true || CANON_REQUEST.test(message);
    const [session, sources] = await Promise.all([
      upstreamSession(sessionKey, identity.telegramId, conversationId),
      (requestedCanon || FACT_LOOKUP.test(message))
        ? findPublicSwarmsySources(message, { exactSubject: !requestedCanon }).catch(() => []) : [],
    ]);
    const searchCanon = requestedCanon || sources.length > 0;

    stage = 'upstream_fetch';
    const response = await fetch(UPSTREAM, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(35_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, session, searchCanon, sources }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) return respond({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
      return unavailable('upstream_http', response.status);
    }
    stage = 'upstream_response';
    const payload = await readJson(response, 48_000);
    if (typeof payload?.reply !== 'string' || !payload.reply.trim()) return unavailable(stage);
    return respond({
      reply: payload.reply,
      sources: sources.map(({ title, url }) => ({ title, url })),
      canon: searchCanon ? (sources.length ? 'found' : 'unavailable') : 'off',
    });
  } catch {
    return unavailable(stage);
  }
}
