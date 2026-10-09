import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { generateKeyPair, SignJWT } from 'jose';
import { authDigest, handleTelegramWebsiteAuth, validateTelegramIdToken, verifyWebsiteCredential } from '../workers/moonboys-api/telegram-website-auth.js';
import { verifyTelegramIdentityFromBody } from '../workers/moonboys-api/blocktopia/auth.js';
import apiWorker from '../workers/moonboys-api/worker.js';
import leaderboardWorker from '../workers/leaderboard-worker.js';

import { API, SITE, ISSUER, ID, BOT_TOKEN, jwk, now, fixture, jwt, start, callback, session, loggedIn, provider } from './lib/telegram-website-auth-fixtures.mjs';

function preservationSnapshot(sqlite) {
  return JSON.stringify(['arcade_progression_state', 'arcade_xp_wallets', 'blocktopia_progression', 'telegram_faction_members', 'telegram_pet_profiles', 'telegram_pet_season_slots', 'telegram_pet_instances', 'telegram_pet_achievements', 'telegram_pet_reward_claims', 'telegram_pet_reward_assets']
    .map(table => sqlite.prepare(`SELECT * FROM ${table}`).all()));
}

test('migration 090 is additive and idempotent for existing accounts and retained ownership data', () => {
  const { sqlite } = fixture();
  const migration = readFileSync('workers/moonboys-api/migrations/090_telegram_website_sessions.sql', 'utf8');
  assert.ok(readFileSync('workers/moonboys-api/schema.sql', 'utf8').endsWith(migration));
  const snapshot = preservationSnapshot(sqlite);
  const users = JSON.stringify(sqlite.prepare('SELECT * FROM telegram_users').all());
  for (const table of ['telegram_website_credentials', 'telegram_website_sessions', 'telegram_login_transactions', 'telegram_oidc_accounts']) sqlite.exec('DROP TABLE ' + table);
  sqlite.exec(migration);
  sqlite.exec(migration);
  assert.equal(preservationSnapshot(sqlite), snapshot);
  assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM telegram_users').all()), users);
});

test('verified website credential is accepted by the existing leaderboard without changing XP awards', async () => {
  const { env, sqlite } = fixture();
  const { data } = await loggedIn(env);
  const response = await leaderboardWorker.fetch(new Request(API + '/', { method: 'POST', body: JSON.stringify({ telegram_auth: data.telegram_auth, telegram_id: ID, player: 'Verified', game: 'snake', score: 25 }) }), env);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).accepted, true);
  assert.equal(sqlite.prepare('SELECT arcade_xp_total FROM arcade_progression_state').get().arcade_xp_total, 6300);
});

async function hmac(keyBytes, value) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}
function hex(bytes) { return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''); }

test('legacy website auth and bot-link confirmation retain the same account after OIDC login', async () => {
  const { env, sqlite } = fixture();
  await loggedIn(env);
  const snapshot = preservationSnapshot(sqlite);
  const fields = { id: ID, first_name: 'Returning', auth_date: now() };
  const key = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(BOT_TOKEN)));
  const hash = hex(await hmac(key, Object.keys(fields).sort().map(key => key + '=' + fields[key]).join('\n')));
  const login = await apiWorker.fetch(new Request(API + '/telegram/auth', { method: 'POST', body: JSON.stringify({ ...fields, hash }) }), env);
  assert.equal(login.status, 200);
  const legacy = await login.json();
  const confirmed = await apiWorker.fetch(new Request(API + '/telegram/link/confirm', { method: 'POST', body: JSON.stringify({ telegram_auth: legacy.telegram_auth }) }), env);
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).telegram_id, ID);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_users').get().n, 1);
  assert.equal(preservationSnapshot(sqlite), snapshot);
});

test('Mini App initData cannot conflict with a verified website session', async () => {
  const { env } = fixture();
  const { data } = await loggedIn(env);
  const user = JSON.stringify({ id: 987654321, first_name: 'Other account' });
  const authDate = now();
  const secret = await hmac(new TextEncoder().encode('WebAppData'), BOT_TOKEN);
  const hash = hex(await hmac(secret, 'auth_date=' + authDate + '\nuser=' + user));
  const initData = new URLSearchParams({ user, auth_date: String(authDate), hash }).toString();
  const response = await apiWorker.fetch(new Request(API + '/telegram-pets/app/state', { method: 'POST', body: JSON.stringify({ init_data: initData, telegram_auth: data.telegram_auth }) }), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'telegram_id_mismatch');
});

test('returning login preserves account row ID, XP, wallet link, pets, factions and achievements; repeats do not duplicate accounts', async () => {
  const { env, sqlite } = fixture();
  const original = sqlite.prepare('SELECT * FROM telegram_users').get();
  const snapshot = preservationSnapshot(sqlite);
  const login = await loggedIn(env);
  const user = sqlite.prepare('SELECT * FROM telegram_users').get();
  for (const key of ['id', 'telegram_id', 'xp', 'level', 'created_at', 'wallet_address']) assert.equal(user[key], original[key]);
  assert.equal(user.username, 'renamed');
  assert.equal(preservationSnapshot(sqlite), snapshot);
  assert.equal(login.data.telegram_id, ID);
  assert.equal(sqlite.prepare('SELECT telegram_id FROM telegram_oidc_accounts').get().telegram_id, ID);
  assert.equal(sqlite.prepare('SELECT subject FROM telegram_oidc_accounts').get().subject, 'different-oidc-subject');
  await loggedIn(env);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_users').get().n, 1);
  assert.equal(preservationSnapshot(sqlite), snapshot);
  assert.match(login.callback.headers.getSetCookie().join(' '), /Secure; HttpOnly; SameSite=Strict/);
  assert.equal(login.callback.headers.get('Location'), SITE + '/gkniftyheads-incubator.html');
  assert.equal(login.callback.headers.get('Cache-Control'), 'no-store');
});

test('a new verified ID creates only one account, without XP or ownership awards', async () => {
  const { env, sqlite } = fixture();
  for (let i = 0; i < 2; i++) {
    const response = await callback(env, await start(env), { id: 222222, sub: 'new-subject' });
    assert.equal(response.status, 303);
  }
  const user = sqlite.prepare("SELECT * FROM telegram_users WHERE telegram_id = '222222'").get();
  assert.equal(user.xp, 0);
  assert.equal(user.wallet_address, null);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_users').get().n, 2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM telegram_pet_profiles WHERE telegram_id = '222222'").get().n, 0);
});

test('authorization state is browser-bound, consumed atomically and cannot be replayed', async () => {
  const { env } = fixture();
  const login = await start(env);
  const wrong = await callback(env, login, {}, { Cookie: '__Host-moonboys_login=' + 'A'.repeat(43) });
  assert.equal(wrong.status, 401);
  assert.equal((await callback(env, login)).status, 303);
  assert.equal((await callback(env, login)).status, 401);
});

test('expired transactions and provider failures cannot create a session or retry consumed state', async () => {
  const { env, sqlite } = fixture();
  let login = await start(env);
  sqlite.exec('UPDATE telegram_login_transactions SET expires_at = 1');
  assert.equal((await callback(env, login)).status, 401);
  login = await start(env);
  assert.equal((await callback(env, login, {}, {}, provider(login.authorization, {}, true))).status, 401);
  assert.equal((await callback(env, login)).status, 401);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_website_sessions').get().n, 0);
});

test('OIDC subject/id conflicts and switching a live identity fail without creating or changing another player', async () => {
  const { env, sqlite } = fixture();
  const existing = await loggedIn(env);
  const before = preservationSnapshot(sqlite);
  for (const claims of [{ id: 999999, sub: 'different-oidc-subject' }, { id: Number(ID), sub: 'wrong-subject' }]) {
    assert.equal((await callback(env, await start(env), claims)).status, 409);
  }
  const login = await start(env, existing.cookie);
  assert.equal((await callback(env, login, { id: 999999, sub: 'other-player' }, { Cookie: login.cookie + '; ' + existing.cookie })).status, 409);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_users').get().n, 1);
  assert.equal(preservationSnapshot(sqlite), before);
});

for (const [name, claims] of [
  ['issuer', { iss: 'https://untrusted.example' }], ['audience', { aud: 'wrong-client' }],
  ['expiration', { exp: now() - 10 }], ['future issuance', { iat: now() + 300 }], ['nonce', { nonce: 'wrong-nonce' }],
  ['missing numeric id', { id: undefined }], ['username as id', { id: 'renamed' }], ['unsafe numeric id', { id: Number.MAX_SAFE_INTEGER + 1 }],
]) test('rejects invalid OIDC ' + name, async () => {
  const fetchImpl = async () => Response.json({ keys: [jwk] });
  await assert.rejects(validateTelegramIdToken(await jwt(claims), { clientId: 'test-client' }, 'test-nonce', fetchImpl));
});

test('rejects wrong JWT signature and unsigned tokens', async () => {
  const { privateKey: otherKey } = await generateKeyPair('RS256');
  const token = await new SignJWT({ id: Number(ID), nonce: 'test-nonce' }).setProtectedHeader({ alg: 'RS256', kid: 'telegram-test' })
    .setIssuer(ISSUER).setAudience('test-client').setSubject('subject').setIssuedAt().setExpirationTime('1h').sign(otherKey);
  const fetchImpl = async () => Response.json({ keys: [jwk] });
  await assert.rejects(validateTelegramIdToken(token, { clientId: 'test-client' }, 'test-nonce', fetchImpl));
  await assert.rejects(validateTelegramIdToken(btoa('{"alg":"none"}') + '.' + btoa('{"id":123456789}') + '.', { clientId: 'test-client' }, 'test-nonce', fetchImpl));
});

test('session bootstrap and renewal require exact origin; renewal and logout require CSRF', async () => {
  const { env } = fixture();
  const { cookie, data } = await loggedIn(env);
  assert.equal((await session(env, cookie, 'https://attacker.example')).status, 403);
  assert.equal((await session(env, cookie, '')).status, 403);
  for (const action of ['renew', 'logout']) {
    for (const csrf of ['', 'invalid']) {
      const response = await handleTelegramWebsiteAuth(new Request(API + '/telegram/website/' + action, { method: 'POST', headers: { Cookie: cookie, Origin: SITE, 'X-Moonboys-CSRF': csrf } }), env);
      assert.equal(response.status, 403);
    }
  }
  const renewed = await handleTelegramWebsiteAuth(new Request(API + '/telegram/website/renew', { method: 'POST', headers: { Cookie: cookie, Origin: SITE, 'X-Moonboys-CSRF': data.csrf_token } }), env);
  assert.equal(renewed.status, 200);
  assert.equal(renewed.headers.get('Access-Control-Allow-Origin'), SITE);
  assert.equal(renewed.headers.get('Access-Control-Allow-Credentials'), 'true');
  const next = await renewed.json();
  assert.notEqual(next.telegram_auth.hash, data.telegram_auth.hash);
  assert.equal(next.csrf_token, data.csrf_token, 'tabs retain a stable session-bound CSRF secret');
});

test('expiry, idle timeout and logout invalidate session credentials in both Worker adapters', async () => {
  const { env, sqlite } = fixture();
  const { cookie, data } = await loggedIn(env);
  const proof = data.telegram_auth;
  assert.equal((await verifyWebsiteCredential(proof, env)).telegramId, ID);
  assert.equal((await verifyWebsiteCredential(proof, env, '999999')).status, 403);
  assert.equal((await verifyWebsiteCredential({ ...proof, id: '999999' }, env)).status, 403);
  const original = sqlite.prepare('SELECT * FROM telegram_website_sessions').get();
  sqlite.exec('UPDATE telegram_website_credentials SET expires_at = 1');
  assert.equal((await verifyWebsiteCredential(proof, env)).status, 401);
  const refreshed = await session(env, cookie);
  const fresh = await refreshed.json();
  sqlite.exec('UPDATE telegram_website_sessions SET last_seen_at = 1');
  assert.equal((await session(env, cookie)).status, 401);
  assert.equal((await verifyWebsiteCredential(fresh.telegram_auth, env)).status, 401);
  sqlite.prepare('UPDATE telegram_website_sessions SET last_seen_at = ?, expires_at = 1').run(original.last_seen_at);
  assert.equal((await session(env, cookie)).status, 401);
  sqlite.prepare('UPDATE telegram_website_sessions SET expires_at = ?').run(original.expires_at);
  const logout = await handleTelegramWebsiteAuth(new Request(API + '/telegram/website/logout', { method: 'POST', headers: { Cookie: cookie, Origin: SITE, 'X-Moonboys-CSRF': data.csrf_token } }), env);
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal((await verifyTelegramIdentityFromBody({ telegram_auth: fresh.telegram_auth }, env, () => { throw new Error('session must not use HMAC'); })).status, 401);
  const score = await leaderboardWorker.fetch(new Request(API + '/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player: 'Verified', telegram_id: ID, telegram_auth: fresh.telegram_auth, game: 'snake', score: 25 }) }), env);
  assert.equal(score.status, 401);
});

test('website status restore never upgrades a session into a legacy HMAC credential', async () => {
  const { env } = fixture();
  const { data } = await loggedIn(env);
  const response = await apiWorker.fetch(new Request(API + '/telegram/user/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegram_id: ID, telegram_auth: data.telegram_auth }) }), env);
  assert.equal(response.status, 200);
  const restored = await response.json();
  assert.equal(restored.telegram_auth.hash, data.telegram_auth.hash);
  assert.equal(restored.xp, 420);
  const unverified = await apiWorker.fetch(new Request(API + '/telegram/user/status', { method: 'POST', body: JSON.stringify({ telegram_id: ID }) }), env);
  assert.equal((await unverified.json()).telegram_auth, undefined);
});

test('blocked accounts and D1 failures fail closed, and blocked sessions can log out', async () => {
  const { env, sqlite } = fixture();
  const { cookie, data } = await loggedIn(env);
  sqlite.prepare('INSERT INTO telegram_anticheat_state (telegram_id, is_blocked) VALUES (?, 1)').run(ID);
  assert.equal((await verifyWebsiteCredential(data.telegram_auth, env)).status, 403);
  assert.equal((await callback(env, await start(env))).status, 403);
  assert.equal((await session(env, cookie)).status, 403);
  const logout = await handleTelegramWebsiteAuth(new Request(API + '/telegram/website/logout', { method: 'POST', headers: { Cookie: cookie, Origin: SITE, 'X-Moonboys-CSRF': data.csrf_token } }), env);
  assert.equal(logout.status, 200);
  const broken = { ...env, DB: { prepare() { throw new Error('database offline'); } } };
  assert.equal((await verifyWebsiteCredential(data.telegram_auth, broken)).status, 503);
  assert.equal((await session(broken, cookie)).status, 503);
});

test('off switch, wrong API host, redirects and duplicate callback fields are rejected', async () => {
  const { env } = fixture();
  assert.equal((await handleTelegramWebsiteAuth(new Request(API + '/telegram/website/start'), { ...env, TELEGRAM_WEBSITE_LOGIN_ENABLED: 'false' })).status, 503);
  assert.equal((await handleTelegramWebsiteAuth(new Request('https://worker.workers.dev/telegram/website/start'), env)).status, 503);
  assert.equal((await handleTelegramWebsiteAuth(new Request(API + '/telegram/website/start?return_to=https://attacker.example'), env)).status, 400);
  const login = await start(env);
  const url = API + '/telegram/website/callback?code=a&code=b&state=' + login.authorization.searchParams.get('state');
  assert.equal((await handleTelegramWebsiteAuth(new Request(url, { headers: { Cookie: login.cookie } }), env)).status, 401);
});
