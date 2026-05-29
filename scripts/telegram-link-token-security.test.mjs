import assert from 'node:assert/strict';
import worker from '../workers/moonboys-api/worker.js';

const BASE_URL = 'https://moonboys-api.test';
const ADMIN_SECRET = 'test-admin-secret';
const TELEGRAM_BOT_TOKEN = '123456:test-bot-token';

class MockStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    const sql = this.sql.replace(/\s+/g, ' ').trim();
    if (sql.includes('FROM telegram_anticheat_state')) {
      const row = this.db.anticheat.get(String(this.args[0]));
      return row || null;
    }
    if (sql.includes('FROM telegram_link_tokens') && sql.includes('WHERE token = ?')) {
      const [token, now] = this.args;
      const row = this.db.tokens.find((item) => (
        item.token === token &&
        item.is_used === 0 &&
        item.expires_at > now
      ));
      return row ? { telegram_id: row.telegram_id } : null;
    }
    if (sql.includes('FROM telegram_users WHERE telegram_id = ?')) {
      return this.db.users.get(String(this.args[0])) || null;
    }
    throw new Error(`Unhandled first SQL: ${sql}`);
  }

  async run() {
    const sql = this.sql.replace(/\s+/g, ' ').trim();
    if (sql.startsWith('UPDATE telegram_link_tokens SET is_used = 1 WHERE telegram_id = ?')) {
      const telegramId = String(this.args[0]);
      for (const row of this.db.tokens) {
        if (row.telegram_id === telegramId && row.is_used === 0) row.is_used = 1;
      }
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO telegram_link_tokens')) {
      const [token, telegramId, expiresAt] = this.args;
      this.db.tokens.push({
        token: String(token),
        telegram_id: String(telegramId),
        expires_at: String(expiresAt),
        is_used: 0,
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE telegram_link_tokens SET is_used = 1 WHERE token = ?')) {
      const token = String(this.args[0]);
      const row = this.db.tokens.find((item) => item.token === token);
      if (row) row.is_used = 1;
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    throw new Error(`Unhandled run SQL: ${sql}`);
  }
}

class MockD1 {
  constructor() {
    this.users = new Map([
      ['123456789', {
        telegram_id: '123456789',
        username: 'moonboy',
        first_name: 'Moon',
        last_name: 'Boy',
      }],
    ]);
    this.anticheat = new Map();
    this.tokens = [];
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }
}

function makeEnv(db) {
  return {
    DB: db,
    ADMIN_SECRET,
    TELEGRAM_BOT_TOKEN,
  };
}

async function request(path, { method = 'GET', body, headers = {}, env } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return worker.fetch(new Request(`${BASE_URL}${path}`, init), env);
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

{
  const db = new MockD1();
  const res = await request('/telegram/link', {
    method: 'POST',
    body: { telegram_id: '123456789' },
    env: makeEnv(db),
  });
  assert.equal(res.status, 401, 'bare telegram_id mint must be rejected');
  assert.equal(db.tokens.length, 0, 'bare telegram_id request must not create a token');
}

{
  const db = new MockD1();
  const res = await request('/telegram/link', {
    method: 'POST',
    body: { telegram_id: '123456789', telegram_auth: { id: '123456789', hash: 'bad' } },
    env: makeEnv(db),
  });
  assert.equal(res.status, 401, 'malformed public auth must fail');
  assert.equal(db.tokens.length, 0, 'malformed public auth must not create a token');
}

{
  const db = new MockD1();
  const res = await request('/telegram/link', {
    method: 'POST',
    body: { telegram_id: '123456789', telegram_auth: { id: '987654321', auth_date: '9999999999', hash: '0'.repeat(64) } },
    env: makeEnv(db),
  });
  assert.equal(res.status, 401, 'public auth for another Telegram ID must fail');
  assert.equal(db.tokens.length, 0, 'mismatched public auth must not create a token');
}

{
  const db = new MockD1();
  db.tokens.push({
    token: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    telegram_id: '123456789',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    is_used: 0,
  });
  const res = await request('/telegram/link', {
    method: 'POST',
    headers: { 'X-Admin-Secret': ADMIN_SECRET },
    body: { telegram_id: '123456789' },
    env: makeEnv(db),
  });
  assert.equal(res.status, 200, 'trusted internal/admin link creation must work');
  const payload = await readJson(res);
  assert.equal(payload.ok, true);
  assert.match(payload.token, /^[0-9a-f-]{36}$/i);
  assert.equal(db.tokens[0].is_used, 1, 'previous unused tokens for the user must be invalidated');
}

{
  const db = new MockD1();
  const mint = await request('/telegram/link', {
    method: 'POST',
    headers: { 'X-Admin-Secret': ADMIN_SECRET },
    body: { telegram_id: '123456789' },
    env: makeEnv(db),
  });
  const minted = await readJson(mint);
  const confirm = await request(`/telegram/link/confirm?token=${minted.token}`, { env: makeEnv(db) });
  assert.equal(confirm.status, 200, 'valid token must confirm once');
  const confirmed = await readJson(confirm);
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.telegram_id, '123456789');
  assert.equal(db.tokens[0].is_used, 1, 'confirmed token must be marked used');

  const reuse = await request(`/telegram/link/confirm?token=${minted.token}`, { env: makeEnv(db) });
  assert.equal(reuse.status, 410, 'token reuse must fail');
}

{
  const db = new MockD1();
  const token = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  db.tokens.push({
    token,
    telegram_id: '123456789',
    expires_at: new Date(Date.now() - 60_000).toISOString(),
    is_used: 0,
  });
  const res = await request(`/telegram/link/confirm?token=${token}`, { env: makeEnv(db) });
  assert.equal(res.status, 410, 'expired token must fail');
}

console.log('Telegram link-token security tests PASSED.');
