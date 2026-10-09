import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { authDigest, handleTelegramWebsiteAuth } from '../../workers/moonboys-api/telegram-website-auth.js';

const API = 'https://api.example.test';
const SITE = 'https://example.test';
const ISSUER = 'https://oauth.telegram.org';
const ID = '123456789';
const BOT_TOKEN = 'test:bot-secret';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'telegram-test', alg: 'RS256', use: 'sig' };
const now = () => Math.floor(Date.now() / 1000);

class D1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(readFileSync('workers/moonboys-api/schema.sql', 'utf8'));
    this.sqlite.exec(readFileSync('workers/moonboys-api/migrations/003_anticheat.sql', 'utf8'));
    this.sqlite.exec('PRAGMA foreign_keys = ON');
  }
  prepare(sql) {
    const database = this.sqlite;
    return {
      bind(...args) {
        const statement = database.prepare(sql);
        return {
          first: async () => statement.get(...args) || null,
          all: async () => ({ results: statement.all(...args), success: true }),
          run: async () => ({ success: true, meta: { changes: Number(statement.run(...args).changes) } }),
        };
      },
      first: async () => database.prepare(sql).get() || null,
      all: async () => ({ results: database.prepare(sql).all(), success: true }),
      run: async () => ({ success: true, meta: { changes: Number(database.prepare(sql).run().changes) } }),
    };
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.sqlite.exec('COMMIT'); return results; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
function fixture() {
  const DB = new D1();
  const sqlite = DB.sqlite;
  sqlite.exec(`INSERT INTO telegram_users (telegram_id, username, first_name, xp, level, wallet_address) VALUES ('${ID}', 'original', 'Returning', 420, 4, 'existing-ownership-link');
    INSERT INTO arcade_progression_state (telegram_id, arcade_xp_total) VALUES ('${ID}', 6300);
    INSERT INTO arcade_xp_wallets (telegram_id, arcade_xp_earned, arcade_xp_spendable, arcade_xp_spent) VALUES ('${ID}', 6300, 6000, 300);
    INSERT INTO blocktopia_progression (telegram_id, xp, gems, tier) VALUES ('${ID}', 884, 27, 3);
    INSERT INTO telegram_faction_members (telegram_id, faction_id) VALUES ('${ID}', 1);
    INSERT INTO telegram_pet_profiles (telegram_id, pet_name, pet_xp, level) VALUES ('${ID}', 'Existing Moonpet', 900, 9);
    INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number, acquisition_type) VALUES ('original-pet', '${ID}', 'existing-season', 1, 'free');
    INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number, source_profile_updated_at) VALUES ('original-pet', '${ID}', 'existing-season', 1, '2026-01-01');
    INSERT INTO telegram_pet_achievements (pet_id, telegram_id, season_key, achievement_id, progress, target) VALUES ('original-pet', '${ID}', 'existing-season', 'original-achievement', 3, 3);
    INSERT INTO telegram_pet_reward_claims (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status) VALUES ('original-reward', 'original-pet', '${ID}', 'existing-source', 'existing-receipt', '2026-01-01', 'awarded');
    INSERT INTO telegram_pet_reward_assets (claim_id, asset_type, asset_key, amount) VALUES ('original-reward', 'material', 'existing-material', 4);`);
  const data = new Map();
  const env = { DB, TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_WEBSITE_LOGIN_ENABLED: 'true', TELEGRAM_WEBSITE_AUTH_ORIGIN: API, TELEGRAM_WEBSITE_ORIGINS: SITE,
    TELEGRAM_OIDC_CLIENT_ID: 'test-client', TELEGRAM_OIDC_CLIENT_SECRET: 'test-client-secret',
    LEADERBOARD: { get: async key => data.get(key) || null, put: async (key, value) => data.set(key, value), delete: async key => data.delete(key) } };
  return { DB, env, sqlite };
}
async function jwt(overrides = {}) {
  return new SignJWT({ id: Number(ID), nonce: 'test-nonce', given_name: 'Verified', preferred_username: 'renamed', ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'telegram-test' })
    .setIssuer(overrides.iss || ISSUER).setAudience(overrides.aud || 'test-client')
    .setSubject(overrides.sub || 'different-oidc-subject').setIssuedAt(overrides.iat ?? now()).setExpirationTime(overrides.exp ?? now() + 3600).sign(privateKey);
}
function cookieValue(response, name) {
  const line = response.headers.getSetCookie().find(v => v.startsWith(name + '='));
  return line && line.split(';')[0];
}
async function start(env, sessionCookie, returnTo = SITE + '/gkniftyheads-incubator.html') {
  const response = await handleTelegramWebsiteAuth(new Request(API + '/telegram/website/start?return_to=' + encodeURIComponent(returnTo), { headers: sessionCookie ? { Cookie: sessionCookie } : {} }), env);
  assert.equal(response.status, 302);
  const authorization = new URL(response.headers.get('Location'));
  assert.equal(authorization.origin, ISSUER);
  assert.equal(authorization.searchParams.get('scope'), 'openid profile');
  assert.equal(authorization.searchParams.get('response_type'), 'code');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  return { response, authorization, cookie: cookieValue(response, '__Host-moonboys_login') };
}
function provider(authorization, claims = {}, tokenError = false) {
  return async (input, options) => {
    const url = String(input);
    if (url === ISSUER + '/.well-known/jwks.json') return Response.json({ keys: [jwk] });
    assert.equal(url, ISSUER + '/token');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Basic ' + btoa('test-client:test-client-secret'));
    assert.equal(options.body.get('redirect_uri'), API + '/telegram/website/callback');
    assert.equal(options.body.get('grant_type'), 'authorization_code');
    assert.equal(await authDigest(options.body.get('code_verifier')), authorization.searchParams.get('code_challenge'));
    if (tokenError) return Response.json({ error: 'provider_error' }, { status: 400 });
    return Response.json({ access_token: 'must-not-leak', id_token: await jwt({ nonce: authorization.searchParams.get('nonce'), ...claims }) });
  };
}
async function callback(env, login, claims = {}, headers = {}, fetchImpl = provider(login.authorization, claims)) {
  const url = API + '/telegram/website/callback?code=test-code&state=' + login.authorization.searchParams.get('state');
  return handleTelegramWebsiteAuth(new Request(url, { headers: { Cookie: login.cookie, ...headers } }), env, fetchImpl);
}
async function session(env, cookie, origin = SITE) {
  return handleTelegramWebsiteAuth(new Request(API + '/telegram/website/session', { headers: { Cookie: cookie, Origin: origin } }), env);
}
async function loggedIn(env) {
  const login = await start(env);
  const response = await callback(env, login);
  assert.equal(response.status, 303, await response.text());
  const cookie = cookieValue(response, '__Host-moonboys_session');
  const bootstrap = await session(env, cookie);
  assert.equal(bootstrap.status, 200, await bootstrap.clone().text());
  return { cookie, data: await bootstrap.json(), callback: response };
}

export { API, SITE, ISSUER, ID, BOT_TOKEN, jwk, now, fixture, jwt, start, callback, session, loggedIn, provider };
