import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';

const ISSUER = 'https://oauth.telegram.org';
const PREFIX = '/telegram/website/';
const SESSION_COOKIE = '__Host-moonboys_session';
const LOGIN_COOKIE = '__Host-moonboys_login';
export const WEBSITE_ACCESS_SECONDS = 300;
export const WEBSITE_IDLE_SECONDS = 1800;
export const WEBSITE_SESSION_SECONDS = 86400;
const LOGIN_SECONDS = 600;
const encoder = new TextEncoder();
const jwksByFetch = new WeakMap();

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function randomToken() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function authDigest(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
function nowSeconds() { return Math.floor(Date.now() / 1000); }
function cookie(request, name) {
  const values = (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(name + '='));
  if (values.length !== 1) return null;
  const value = values[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
function setCookie(name, value, age, sameSite = 'Strict') {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=${sameSite}; Max-Age=${age}`;
}
function config(env) {
  if (env.TELEGRAM_WEBSITE_LOGIN_ENABLED !== 'true' || !env.TELEGRAM_OIDC_CLIENT_ID || !env.TELEGRAM_OIDC_CLIENT_SECRET || !env.DB) return null;
  const origin = env.TELEGRAM_WEBSITE_AUTH_ORIGIN || 'https://api.cryptomoonboys.com';
  const origins = (env.TELEGRAM_WEBSITE_ORIGINS || 'https://cryptomoonboys.com,https://www.cryptomoonboys.com').split(',').map(v => v.trim());
  if (![origin, ...origins].every(v => { try { return new URL(v).origin === v && new URL(v).protocol === 'https:'; } catch { return false; } })) return null;
  return { origin, origins, clientId: String(env.TELEGRAM_OIDC_CLIENT_ID), clientSecret: String(env.TELEGRAM_OIDC_CLIENT_SECRET), redirectUri: origin + PREFIX + 'callback' };
}
function headersFor(request, cfg) {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Vary': 'Origin' });
  if (cfg?.origins.includes(request.headers.get('Origin'))) {
    headers.set('Access-Control-Allow-Origin', request.headers.get('Origin'));
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Moonboys-CSRF');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  return headers;
}
function reply(headers, data, status = 200) {
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), { status, headers });
}
function fail(code, status = 401) { throw Object.assign(new Error(code), { status }); }

export async function validateTelegramIdToken(token, cfg, nonce, fetchImpl = fetch) {
  if (typeof token !== 'string' || token.length > 16384) fail('invalid_id_token');
  let jwks = jwksByFetch.get(fetchImpl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(ISSUER + '/.well-known/jwks.json'), { [customFetch]: fetchImpl, timeoutDuration: 5000 });
    jwksByFetch.set(fetchImpl, jwks);
  }
  const { payload } = await jwtVerify(token, jwks, {
    issuer: ISSUER, audience: cfg.clientId, algorithms: ['RS256'],
    requiredClaims: ['sub', 'iat', 'exp', 'nonce', 'id'], maxTokenAge: '10m', clockTolerance: 30,
  });
  if (payload.aud !== cfg.clientId || payload.nonce !== nonce || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255) fail('invalid_id_token');
  if (payload.exp <= nowSeconds() || payload.iat > nowSeconds() + 30) fail('invalid_id_token');
  // OIDC subject and Bot API numeric user ID are different identifiers.
  if (typeof payload.id === 'number' && !Number.isSafeInteger(payload.id)) fail('invalid_telegram_id');
  const id = String(payload.id);
  if (!/^[1-9]\d{0,19}$/.test(id)) fail('invalid_telegram_id');
  return { id, subject: payload.sub, username: typeof payload.preferred_username === 'string' ? payload.preferred_username.slice(0, 64) : null,
    first_name: typeof payload.given_name === 'string' ? payload.given_name.slice(0, 128) : typeof payload.name === 'string' ? payload.name.slice(0, 128) : null,
    last_name: typeof payload.family_name === 'string' ? payload.family_name.slice(0, 128) : null };
}

async function readSession(request, env, allowExpired = false) {
  const secret = cookie(request, SESSION_COOKIE);
  if (!secret) return null;
  const sessionHash = await authDigest(secret);
  return env.DB.prepare(`SELECT s.*, u.username, u.first_name, u.last_name
    FROM telegram_website_sessions s JOIN telegram_users u ON u.telegram_id = s.telegram_id
    WHERE s.session_hash = ? ${allowExpired ? '' : 'AND s.revoked_at IS NULL AND s.expires_at > ? AND s.last_seen_at > ?'}`)
    .bind(...(allowExpired ? [sessionHash] : [sessionHash, nowSeconds(), nowSeconds() - WEBSITE_IDLE_SECONDS])).first();
}

// The s1_ namespace survives older clients that copy only id/hash/auth_date.
// These are opaque, five-minute credentials, never Telegram HMAC payloads.
export function isWebsiteCredential(auth) { return typeof auth?.hash === 'string' && auth.hash.startsWith('s1_'); }
export async function verifyWebsiteCredential(auth, env, claimedId) {
  if (!isWebsiteCredential(auth)) return null;
  if (!/^s1_[A-Za-z0-9_-]{43}$/.test(auth.hash) || !env.DB) return { error: 'website_session_invalid', status: 401 };
  try {
    const row = await env.DB.prepare(`SELECT s.telegram_id, u.username, u.first_name, u.last_name, a.is_blocked
      FROM telegram_website_credentials c JOIN telegram_website_sessions s ON s.session_hash = c.session_hash
      JOIN telegram_users u ON u.telegram_id = s.telegram_id
      LEFT JOIN telegram_anticheat_state a ON a.telegram_id = s.telegram_id
      WHERE c.token_hash = ? AND c.expires_at > ? AND s.revoked_at IS NULL AND s.expires_at > ? AND s.last_seen_at > ?`)
      .bind(await authDigest(auth.hash), nowSeconds(), nowSeconds(), nowSeconds() - WEBSITE_IDLE_SECONDS).first();
    if (!row) return { error: 'website_session_expired', status: 401 };
    if (String(auth.id) !== row.telegram_id || (claimedId != null && String(claimedId) !== row.telegram_id)) return { error: 'telegram_id_mismatch', status: 403 };
    if (Number(row.is_blocked) === 1) return { error: 'account_blocked', status: 403 };
    return { telegramId: row.telegram_id, authPayload: auth, user: { id: row.telegram_id, username: row.username, first_name: row.first_name, last_name: row.last_name } };
  } catch { return { error: 'website_session_unavailable', status: 503 }; }
}

async function issueCredential(env, session, csrf, headers, renew = false) {
  const now = nowSeconds();
  const hash = 's1_' + randomToken();
  // Guard every renewal against concurrent logout, idle expiry and absolute expiry.
  const results = await env.DB.batch([
    env.DB.prepare(`DELETE FROM telegram_website_credentials WHERE expires_at <= ?`).bind(now),
    env.DB.prepare(`UPDATE telegram_website_sessions SET last_seen_at = MAX(last_seen_at, ?)
      WHERE session_hash = ? AND revoked_at IS NULL AND expires_at > ? AND last_seen_at > ?`)
      .bind(renew ? now : session.last_seen_at, session.session_hash, now, now - WEBSITE_IDLE_SECONDS),
    env.DB.prepare(`INSERT INTO telegram_website_credentials (token_hash, session_hash, expires_at)
      SELECT ?, session_hash, ? FROM telegram_website_sessions
      WHERE session_hash = ? AND revoked_at IS NULL AND expires_at > ? AND last_seen_at > ?`)
      .bind(await authDigest(hash), Math.min(now + WEBSITE_ACCESS_SECONDS, session.expires_at), session.session_hash, now, now - WEBSITE_IDLE_SECONDS),
  ]);
  if (results[2]?.meta?.changes !== 1) fail('website_session_expired');
  return reply(headers, { ok: true, linked: true, source: 'telegram_oidc', telegram_id: session.telegram_id,
    display_name: session.first_name || session.username || 'Telegram player', csrf_token: csrf,
    telegram_auth: { id: session.telegram_id, first_name: session.first_name, last_name: session.last_name, username: session.username,
      auth_date: now, hash, expires_at: Math.min(now + WEBSITE_ACCESS_SECONDS, session.expires_at) },
    session_expires_at: session.expires_at });
}

export async function handleTelegramWebsiteAuth(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  const cfg = config(env);
  const headers = headersFor(request, cfg);
  if (!cfg || url.origin !== cfg.origin) return reply(headers, { error: 'website_login_not_configured' }, 503);
  const action = url.pathname.slice(PREFIX.length);
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (action === 'start' && request.method === 'GET') {
      const returnUrl = new URL(url.searchParams.get('return_to') || cfg.origins[0] + '/gkniftyheads-incubator.html');
      if (!cfg.origins.includes(returnUrl.origin) || returnUrl.username || returnUrl.password) fail('invalid_return_url', 400);
      // Never carry browser credentials into the stored return URL.
      returnUrl.hash = '';
      ['code', 'state', 'token', 'telegram_auth', 'auth_evidence'].forEach(key => returnUrl.searchParams.delete(key));
      const state = randomToken(), browser = randomToken(), verifier = randomToken(), nonce = randomToken();
      const session = await readSession(request, env);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM telegram_login_transactions WHERE expires_at <= ?').bind(nowSeconds()),
        env.DB.prepare('DELETE FROM telegram_website_sessions WHERE expires_at <= ? OR last_seen_at <= ?').bind(nowSeconds(), nowSeconds() - WEBSITE_IDLE_SECONDS),
        env.DB.prepare(`INSERT INTO telegram_login_transactions (state_hash, browser_hash, verifier, nonce, return_url, expected_telegram_id, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(await authDigest(state), await authDigest(browser), verifier, nonce, returnUrl.href, session?.telegram_id || null, nowSeconds() + LOGIN_SECONDS),
      ]);
      const auth = new URL(ISSUER + '/auth');
      auth.search = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', scope: 'openid profile',
        state, nonce, code_challenge: await authDigest(verifier), code_challenge_method: 'S256' }).toString();
      headers.set('Location', auth.href);
      headers.append('Set-Cookie', setCookie(LOGIN_COOKIE, browser, LOGIN_SECONDS, 'Lax'));
      return new Response(null, { status: 302, headers });
    }
    if (action === 'callback' && request.method === 'GET') {
      const state = url.searchParams.get('state'), code = url.searchParams.get('code'), browser = cookie(request, LOGIN_COOKIE);
      headers.append('Set-Cookie', setCookie(LOGIN_COOKIE, '', 0, 'Lax'));
      if (!browser || !/^[A-Za-z0-9_-]{43}$/.test(state || '') || !code || code.length > 4096 ||
        url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length !== 1 || url.searchParams.has('error')) fail('invalid_login_callback');
      // Atomic consumption before the token exchange prevents concurrent/replayed callbacks.
      const tx = await env.DB.prepare(`DELETE FROM telegram_login_transactions
        WHERE state_hash = ? AND browser_hash = ? AND expires_at > ? RETURNING *`)
        .bind(await authDigest(state), await authDigest(browser), nowSeconds()).first();
      if (!tx) fail('login_expired_or_replayed');
      const response = await fetchImpl(ISSUER + '/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + btoa(cfg.clientId + ':' + cfg.clientSecret) },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri, client_id: cfg.clientId, code_verifier: tx.verifier }) });
      if (!response.ok) fail('telegram_token_exchange_failed');
      const tokens = await response.json();
      const identity = await validateTelegramIdToken(tokens.id_token, cfg, tx.nonce, fetchImpl);
      if (tx.expected_telegram_id && tx.expected_telegram_id !== identity.id) fail('logout_before_switching_accounts', 409);
      const binding = await env.DB.prepare(`SELECT subject, telegram_id FROM telegram_oidc_accounts
        WHERE issuer = ? AND client_id = ? AND (subject = ? OR telegram_id = ?)`)
        .bind(ISSUER, cfg.clientId, identity.subject, identity.id).first();
      if (binding && (binding.subject !== identity.subject || binding.telegram_id !== identity.id)) fail('telegram_identity_conflict', 409);
      const ac = await env.DB.prepare('SELECT is_blocked FROM telegram_anticheat_state WHERE telegram_id = ?').bind(identity.id).first();
      if (Number(ac?.is_blocked) === 1) fail('account_blocked', 403);
      const secret = randomToken(), sessionHash = await authDigest(secret), csrf = await authDigest('csrf:' + secret), now = nowSeconds();
      const ownsBinding = `EXISTS (SELECT 1 FROM telegram_oidc_accounts WHERE issuer = ? AND client_id = ? AND subject = ? AND telegram_id = ?)`;
      const bindingArgs = [ISSUER, cfg.clientId, identity.subject, identity.id];
      const results = await env.DB.batch([
        env.DB.prepare(`INSERT INTO telegram_oidc_accounts (issuer, client_id, subject, telegram_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`).bind(...bindingArgs, now),
        env.DB.prepare(`INSERT INTO telegram_users (telegram_id, username, first_name, last_name)
          SELECT ?, ?, ?, ? WHERE ${ownsBinding}
          ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name, last_name = excluded.last_name, updated_at = CURRENT_TIMESTAMP`)
          .bind(identity.id, identity.username, identity.first_name, identity.last_name, ...bindingArgs),
        env.DB.prepare(`INSERT INTO telegram_activity_log (telegram_id, action, metadata)
          SELECT ?, 'link_confirmed', ? WHERE ${ownsBinding}`)
          .bind(identity.id, JSON.stringify({ source: 'telegram_oidc' }), ...bindingArgs),
        env.DB.prepare(`INSERT INTO telegram_website_sessions (session_hash, telegram_id, csrf_hash, created_at, last_seen_at, expires_at)
          SELECT ?, ?, ?, ?, ?, ? WHERE ${ownsBinding}
          AND NOT EXISTS (SELECT 1 FROM telegram_anticheat_state WHERE telegram_id = ? AND is_blocked = 1)`)
          .bind(sessionHash, identity.id, await authDigest(csrf), now, now, now + WEBSITE_SESSION_SECONDS, ...bindingArgs, identity.id),
      ]);
      if (results[3]?.meta?.changes !== 1) fail('telegram_identity_conflict', 409);
      // Invalidate the prior cookie session on a successful fresh login.
      const oldSecret = cookie(request, SESSION_COOKIE);
      if (oldSecret) await env.DB.prepare('UPDATE telegram_website_sessions SET revoked_at = ? WHERE session_hash = ?').bind(now, await authDigest(oldSecret)).run();
      headers.append('Set-Cookie', setCookie(SESSION_COOKIE, secret, WEBSITE_SESSION_SECONDS));
      headers.set('Location', tx.return_url);
      return new Response(null, { status: 303, headers });
    }
    if (!cfg.origins.includes(request.headers.get('Origin'))) fail('website_origin_required', 403);
    const session = await readSession(request, env, action === 'logout');
    if (!session) {
      headers.append('Set-Cookie', setCookie(SESSION_COOKIE, '', 0));
      fail('website_session_expired');
    }
    const ac = await env.DB.prepare('SELECT is_blocked FROM telegram_anticheat_state WHERE telegram_id = ?').bind(session.telegram_id).first();
    if (Number(ac?.is_blocked) === 1 && action !== 'logout') {
      await env.DB.prepare('UPDATE telegram_website_sessions SET revoked_at = ? WHERE session_hash = ?').bind(nowSeconds(), session.session_hash).run();
      headers.append('Set-Cookie', setCookie(SESSION_COOKIE, '', 0));
      fail('account_blocked', 403);
    }
    if (action === 'session' && request.method === 'GET') {
      // Bootstrap does not extend idle life. Renewal requires the returned CSRF secret.
      const csrf = await authDigest('csrf:' + cookie(request, SESSION_COOKIE));
      return await issueCredential(env, session, csrf, headers);
    }
    if ((action === 'renew' || action === 'logout') && request.method === 'POST') {
      const csrf = request.headers.get('X-Moonboys-CSRF') || '';
      if (!csrf || await authDigest(csrf) !== session.csrf_hash) fail('csrf_verification_failed', 403);
      if (action === 'logout') {
        await env.DB.prepare('UPDATE telegram_website_sessions SET revoked_at = ? WHERE session_hash = ?').bind(nowSeconds(), session.session_hash).run();
        headers.append('Set-Cookie', setCookie(SESSION_COOKIE, '', 0));
        return reply(headers, { ok: true });
      }
      return await issueCredential(env, session, csrf, headers, true);
    }
    return reply(headers, { error: 'not_found' }, 404);
  } catch (error) {
    // Never emit provider tokens, authorization codes, cookie values or SQL errors.
    return reply(headers, { error: error.status ? error.message : 'website_login_unavailable' }, error.status || 503);
  }
}
