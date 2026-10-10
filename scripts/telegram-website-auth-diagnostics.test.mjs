import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { authDigest, handleTelegramWebsiteAuth } from '../workers/moonboys-api/telegram-website-auth.js';
import { API, SITE, ISSUER, ID, jwk, jwt, fixture, start, callback, provider, session } from './lib/telegram-website-auth-fixtures.mjs';

async function capture(operation) {
  const events = [];
  const info = console.info;
  console.info = line => events.push(JSON.parse(line));
  try { return { response: await operation(), events }; }
  finally { console.info = info; }
}
function failure(events, stage, category) {
  const failed = events.filter(event => event.outcome === 'failed');
  assert.equal(failed.length, 1);
  assert.equal(failed[0].stage, stage);
  assert.equal(failed[0].category, category);
  for (const event of events) {
    assert.deepEqual(Object.keys(event).sort(), ['action', 'event', 'outcome', 'request_id', 'stage', ...(event.category ? ['category'] : []), ...(event.provider_http_status ? ['provider_http_status'] : [])].sort());
    assert.match(event.request_id, /^[0-9a-f-]{36}$/);
  }
}

test('missing login cookie is distinguished without consuming the valid transaction', async () => {
  const { env, sqlite } = fixture();
  const login = await start(env);
  const { response, events } = await capture(() => callback(env, login, {}, { Cookie: '' }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'invalid_login_callback' });
  failure(events, 'callback_validation', 'login_cookie_missing_or_invalid');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_login_transactions').get().n, 1);
  assert.equal((await callback(env, login)).status, 303);
});

test('provider failure and consumed state have distinct diagnostic stages', async () => {
  const { env } = fixture();
  const login = await start(env);
  const first = await capture(() => callback(env, login, {}, {}, provider(login.authorization, {}, true)));
  assert.equal(first.response.status, 401);
  failure(first.events, 'provider_exchange', 'telegram_token_exchange_failed');
  assert.equal(first.events.at(-1).provider_http_status, 400);
  const next = await capture(() => callback(env, login));
  assert.equal(next.response.status, 401);
  failure(next.events, 'd1_transaction_consumption', 'login_expired_or_replayed');
  assert.notEqual(first.events[0].request_id, next.events[0].request_id);
});

for (const [name, message, category] of [
  ['missing schema', 'D1_ERROR: no such table: private_table', 'd1_schema_missing'],
  ['foreign key', 'D1_ERROR: FOREIGN KEY constraint failed', 'd1_foreign_key'],
  ['uniqueness', 'D1_ERROR: UNIQUE constraint failed: private_table.secret', 'd1_unique_constraint'],
  ['required column', 'D1_ERROR: NOT NULL constraint failed: private_table.secret', 'd1_not_null_constraint'],
  ['unknown database failure', 'private SQL and secret values', 'd1_operation_failed'],
]) test(name + ' reports only a fixed category, leaves existing account intact and issues no cookie', async () => {
  const { env, DB, sqlite } = fixture();
  const login = await start(env);
  const before = sqlite.prepare('SELECT * FROM telegram_users').get();
  DB.batch = async () => { throw new Error(message + ' test-code must-not-leak test-client-secret'); };
  const { response, events } = await capture(() => callback(env, login));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'website_login_unavailable' });
  failure(events, 'd1_account_session_creation', category);
  assert.equal(response.headers.get('Location'), null);
  assert.equal(response.headers.getSetCookie().some(line => line.startsWith('__Host-moonboys_session=')), false);
  assert.deepEqual(sqlite.prepare('SELECT * FROM telegram_users').get(), before);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_website_sessions').get().n, 0);
  const output = JSON.stringify(events);
  for (const secret of [message, 'test-code', 'must-not-leak', 'test-client-secret', ID, login.cookie, login.authorization.searchParams.get('state')]) assert.equal(output.includes(secret), false);
});

test('unconfirmed D1 mutation results cannot issue a session', async () => {
  const { env, DB } = fixture();
  const login = await start(env);
  DB.batch = async statements => statements.map(() => ({ success: false, error: 'private SQL' }));
  const { response, events } = await capture(() => callback(env, login));
  assert.equal(response.status, 503);
  failure(events, 'd1_account_session_creation', 'd1_batch_unconfirmed');
});

test('callback succeeds with the actual local D1 API, migration 090 and existing player', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ name: 'oidc-d1-test', modules: true,
    script: 'export default { fetch() { return new Response("fixture"); } };',
    compatibilityDate: '2026-04-12', d1Databases: { DB: 'oidc-test-only' } }));
  try {
    const { env, sqlite } = fixture();
    const DB = await mf.getD1Database('DB');
    for (const name of ['telegram_users', 'telegram_activity_log', 'telegram_anticheat_state']) {
      await DB.prepare(sqlite.prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?').get('table', name).sql).run();
    }
    const migration = readFileSync('workers/moonboys-api/migrations/090_telegram_website_sessions.sql', 'utf8').replace(/^\s*--.*$/gm, '');
    await DB.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => DB.prepare(sql)));
    await DB.prepare('INSERT INTO telegram_users (telegram_id, username, xp, wallet_address) VALUES (?, ?, ?, ?)').bind(ID, 'original', 420, 'existing-ownership-link').run();
    const original = await DB.prepare('SELECT * FROM telegram_users WHERE telegram_id = ?').bind(ID).first();
    env.DB = DB;
    for (let attempt = 0; attempt < 2; attempt++) {
      const login = await start(env);
      const { response, events } = await capture(() => callback(env, login));
      assert.equal(response.status, 303, await response.clone().text());
      assert.equal(events.at(-1).stage, 'session_redirect');
      assert.equal(events.at(-1).outcome, 'completed');
      assert.equal(response.headers.get('X-Moonboys-Auth-Request-Id'), events[0].request_id);
      const sessionCookie = response.headers.getSetCookie().find(line => line.startsWith('__Host-moonboys_session=')).split(';')[0];
      assert.equal((await session(env, sessionCookie)).status, 200);
      const current = await DB.prepare('SELECT * FROM telegram_users WHERE telegram_id = ?').bind(ID).first();
      for (const key of ['id', 'telegram_id', 'xp', 'level', 'wallet_address', 'created_at']) assert.equal(current[key], original[key]);
    }
  } finally { await mf.dispose(); }
});


test('concurrent callback handling creates exactly one session and exchanges the code once', async () => {
  const { env, sqlite } = fixture();
  const login = await start(env);
  let exchanges = 0;
  const upstream = provider(login.authorization);
  const fetchImpl = async (...args) => {
    if (String(args[0]).endsWith('/token')) exchanges++;
    return upstream(...args);
  };
  const responses = await Promise.all([callback(env, login, {}, {}, fetchImpl), callback(env, login, {}, {}, fetchImpl)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [303, 401]);
  assert.equal(exchanges, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_website_sessions').get().n, 1);
});

test('callback completes inside workerd with real fetch semantics for the token exchange', async () => {
  // The Node fixtures inject fetch; workerd rejects RequestInit values Node accepts.
  const { build } = await import('esbuild');
  const { outputFiles: [bundle] } = await build({ write: false, bundle: true, format: 'esm', platform: 'browser', conditions: ['workerd', 'worker', 'browser'],
    stdin: { resolveDir: 'workers/moonboys-api', contents: `import { handleTelegramWebsiteAuth } from './telegram-website-auth.js';
      export default { fetch: (request, env) => handleTelegramWebsiteAuth(request, env) };` } });
  let authorization = null;
  const tokenRequests = [];
  const mf = new Miniflare(convertV4MiniflareOptions({ name: 'oidc-workerd-test', modules: true, script: bundle.text,
    compatibilityDate: '2026-04-12', d1Databases: { DB: 'oidc-workerd-test-only' },
    bindings: { TELEGRAM_WEBSITE_LOGIN_ENABLED: 'true', TELEGRAM_WEBSITE_AUTH_ORIGIN: API, TELEGRAM_WEBSITE_ORIGINS: SITE,
      TELEGRAM_OIDC_CLIENT_ID: 'test-client', TELEGRAM_OIDC_CLIENT_SECRET: 'test-client-secret' },
    outboundService: async request => {
      const url = new URL(request.url);
      if (url.href === ISSUER + '/.well-known/jwks.json') return Response.json({ keys: [jwk] });
      assert.equal(url.href, ISSUER + '/token');
      const body = new URLSearchParams(await request.text());
      tokenRequests.push(body);
      assert.equal(request.headers.get('Authorization'), 'Basic ' + btoa('test-client:test-client-secret'));
      assert.equal(await authDigest(body.get('code_verifier')), authorization.searchParams.get('code_challenge'));
      return Response.json({ id_token: await jwt({ nonce: authorization.searchParams.get('nonce') }) });
    } }));
  try {
    const { sqlite } = fixture();
    const DB = await mf.getD1Database('DB');
    for (const name of ['telegram_users', 'telegram_activity_log', 'telegram_anticheat_state']) {
      await DB.prepare(sqlite.prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?').get('table', name).sql).run();
    }
    const migration = readFileSync('workers/moonboys-api/migrations/090_telegram_website_sessions.sql', 'utf8').replace(/^\s*--.*$/gm, '');
    await DB.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => DB.prepare(sql)));
    await DB.prepare('INSERT INTO telegram_users (telegram_id, username, xp, wallet_address) VALUES (?, ?, ?, ?)').bind(ID, 'original', 420, 'existing-ownership-link').run();
    const original = await DB.prepare('SELECT * FROM telegram_users WHERE telegram_id = ?').bind(ID).first();
    const started = await mf.dispatchFetch(API + '/telegram/website/start?return_to=' + encodeURIComponent(SITE + '/gkniftyheads-incubator.html'), { redirect: 'manual' });
    assert.equal(started.status, 302);
    authorization = new URL(started.headers.get('Location'));
    const loginCookie = started.headers.getSetCookie().find(line => line.startsWith('__Host-moonboys_login=')).split(';')[0];
    const response = await mf.dispatchFetch(API + '/telegram/website/callback?code=test-code&state=' + authorization.searchParams.get('state'),
      { redirect: 'manual', headers: { Cookie: loginCookie } });
    assert.equal(response.status, 303, await response.clone().text());
    assert.equal(response.headers.get('Location'), SITE + '/gkniftyheads-incubator.html');
    assert.equal(tokenRequests.length, 1);
    const sessionCookie = response.headers.getSetCookie().find(line => line.startsWith('__Host-moonboys_session=')).split(';')[0];
    const bootstrap = await mf.dispatchFetch(API + '/telegram/website/session', { headers: { Cookie: sessionCookie, Origin: SITE } });
    assert.equal(bootstrap.status, 200, await bootstrap.clone().text());
    assert.equal((await bootstrap.json()).telegram_id, ID);
    const current = await DB.prepare('SELECT * FROM telegram_users WHERE telegram_id = ?').bind(ID).first();
    for (const key of ['id', 'telegram_id', 'xp', 'level', 'wallet_address', 'created_at']) assert.equal(current[key], original[key]);
  } finally { await mf.dispose(); }
});

test('Telegram OAuth errors returned with HTTP 200 fail at the provider exchange stage', async () => {
  const { env } = fixture();
  const login = await start(env);
  const { response, events } = await capture(() => callback(env, login, {}, {}, async () => Response.json({ error: 'invalid_grant' })));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'telegram_token_exchange_failed' });
  failure(events, 'provider_exchange', 'telegram_token_exchange_failed');
  assert.equal(events.at(-1).provider_http_status, 200);
});

test('token endpoint redirects are rejected rather than followed', async () => {
  const { env, sqlite } = fixture();
  const login = await start(env);
  const requests = [];
  const fetchImpl = async (input, options) => {
    requests.push(String(input));
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://attacker.example/token' } });
  };
  const { response, events } = await capture(() => callback(env, login, {}, {}, fetchImpl));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'telegram_token_exchange_failed' });
  failure(events, 'provider_exchange', 'telegram_token_exchange_failed');
  assert.deepEqual(requests, ['https://oauth.telegram.org/token']);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_website_sessions').get().n, 0);
});
