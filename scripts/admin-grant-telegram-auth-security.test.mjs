import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import worker from '../workers/moonboys-api/worker.js';

const BASE_URL = 'https://moonboys-api.test';
const TELEGRAM_BOT_TOKEN = '123456:test-bot-token';
const ADMIN_SECRET = 'test-admin-secret';
const ADMIN_ID = '111111111';
const NON_ADMIN_ID = '222222222';
const TARGET_ID = '999999999';

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

  normalizedSql() {
    return this.sql.replace(/\s+/g, ' ').trim();
  }

  async first() {
    const sql = this.normalizedSql();
    if (sql.includes('FROM telegram_users WHERE telegram_id = ?')) {
      const telegramId = String(this.args[0]);
      return this.db.telegramUsers.get(telegramId) || null;
    }
    if (sql.includes('FROM telegram_anticheat_state WHERE telegram_id = ?')) {
      const telegramId = String(this.args[0]);
      return this.db.anticheat.get(telegramId) || null;
    }
    if (sql.includes('FROM telegram_activity_log') && sql.includes("action = 'link_confirmed'")) {
      const telegramId = String(this.args[0]);
      return this.db.linkConfirmed.get(telegramId) || null;
    }
    if (sql.includes('SELECT arcade_xp_total FROM arcade_progression_state')) {
      const telegramId = String(this.args[0]);
      const row = this.db.arcadeProgression.get(telegramId);
      return row ? { arcade_xp_total: row.arcade_xp_total } : null;
    }
    if (sql.includes('FROM blocktopia_progression WHERE telegram_id = ?')) {
      const telegramId = String(this.args[0]);
      const row = this.db.blocktopiaProgression.get(telegramId);
      return row ? { telegram_id: telegramId, xp: row.xp, gems: row.gems, tier: 1 } : null;
    }
    throw new Error(`Unhandled first SQL: ${sql}`);
  }

  async all() {
    const sql = this.normalizedSql();
    if (sql.includes('PRAGMA table_info(blocktopia_progression)')) {
      return { results: [] };
    }
    throw new Error(`Unhandled all SQL: ${sql}`);
  }

  async run() {
    const sql = this.normalizedSql();

    if (sql.startsWith('INSERT INTO blocktopia_progression (') && sql.includes('ON CONFLICT(telegram_id) DO NOTHING')) {
      const telegramId = String(this.args[0]);
      if (!this.db.blocktopiaProgression.has(telegramId)) {
        this.db.blocktopiaProgression.set(telegramId, { xp: 0, gems: 0 });
      }
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('UPDATE blocktopia_progression SET xp = ?, gems = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?')) {
      const [xp, gems, telegramIdRaw] = this.args;
      const telegramId = String(telegramIdRaw);
      this.db.blocktopiaProgression.set(telegramId, { xp: Number(xp), gems: Number(gems) });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('INSERT INTO arcade_progression_state') && sql.includes('ON CONFLICT(telegram_id)')) {
      const [telegramIdRaw, grantXp] = this.args;
      const telegramId = String(telegramIdRaw);
      const row = this.db.arcadeProgression.get(telegramId) || { arcade_xp_total: 0 };
      row.arcade_xp_total += Number(grantXp) || 0;
      this.db.arcadeProgression.set(telegramId, row);
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('INSERT INTO blocktopia_progression_events')) {
      this.db.auditEvents.push({
        telegram_id: String(this.args[1]),
        admin_telegram_id: String(this.args[7]),
        reason: this.args[8] == null ? null : String(this.args[8]),
      });
      return { success: true, meta: { changes: 1 } };
    }

    throw new Error(`Unhandled run SQL: ${sql}`);
  }
}

class MockD1 {
  constructor() {
    this.telegramUsers = new Map();
    this.anticheat = new Map();
    this.linkConfirmed = new Map();
    this.blocktopiaProgression = new Map();
    this.arcadeProgression = new Map();
    this.auditEvents = [];
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }
}

function makeEnv(db, { adminIds = ADMIN_ID } = {}) {
  return {
    DB: db,
    TELEGRAM_BOT_TOKEN,
    ADMIN_SECRET,
    ADMIN_TELEGRAM_IDS: adminIds,
  };
}

function signTelegramAuth(fields, botToken = TELEGRAM_BOT_TOKEN) {
  const normalized = Object.entries(fields)
    .filter(([, value]) => value != null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  return createHmac('sha256', secret).update(normalized).digest('hex');
}

function buildTelegramAuth(id, { ageSeconds = 0, tamperHash = false } = {}) {
  const authDate = String(Math.floor(Date.now() / 1000) - Math.max(0, ageSeconds));
  const base = {
    id: String(id),
    first_name: 'Admin',
    username: 'moonboy_admin',
    auth_date: authDate,
  };
  const hash = signTelegramAuth(base);
  if (!tamperHash) return { ...base, hash };
  const last = hash.slice(-1).toLowerCase();
  const replacement = last === '0' ? '1' : '0';
  return { ...base, hash: `${hash.slice(0, -1)}${replacement}` };
}

async function request(path, { method = 'POST', body, headers = {}, env } = {}) {
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

function seedLinkedUser(db, telegramId, { username = 'moonboy_admin' } = {}) {
  const id = String(telegramId);
  db.telegramUsers.set(id, {
    telegram_id: id,
    username,
    first_name: 'Admin',
    last_name: null,
    xp: 0,
    level: 1,
    created_at: '2026-01-01T00:00:00.000Z',
  });
  db.linkConfirmed.set(id, { action: 'link_confirmed', created_at: '2026-01-01T00:00:00.000Z' });
}

{
  const db = new MockD1();
  const res = await request('/admin/arcade/grant-xp', {
    body: { telegram_id: TARGET_ID, xp: 10 },
    env: makeEnv(db),
  });
  assert.equal(res.status, 401, 'arcade admin grant requires telegram_auth');
}

{
  const db = new MockD1();
  const res = await request('/admin/blocktopia/grant-xp', {
    body: { telegram_id: TARGET_ID, xp: 10 },
    headers: { 'X-Admin-Secret': ADMIN_SECRET },
    env: makeEnv(db),
  });
  assert.equal(res.status, 401, 'admin grant must reject X-Admin-Secret-only browser requests');
}

{
  const db = new MockD1();
  const malformedAuth = buildTelegramAuth(ADMIN_ID, { tamperHash: true });
  const malformed = await request('/admin/blocktopia/grant-xp', {
    body: { telegram_auth: malformedAuth, telegram_id: TARGET_ID, xp: 10 },
    env: makeEnv(db),
  });
  assert.equal(malformed.status, 401, 'malformed telegram_auth must fail for admin grant');

  const expiredAuth = buildTelegramAuth(ADMIN_ID, { ageSeconds: 60 * 60 * 24 * 30 });
  const expired = await request('/admin/arcade/grant-xp', {
    body: { telegram_auth: expiredAuth, telegram_id: TARGET_ID, xp: 10 },
    env: makeEnv(db),
  });
  assert.equal(expired.status, 401, 'expired telegram_auth must fail for admin grant');
}

{
  const db = new MockD1();
  seedLinkedUser(db, ADMIN_ID);

  const getStatus = await request(`/telegram/user/status?telegram_id=${ADMIN_ID}`, {
    method: 'GET',
    env: makeEnv(db),
  });
  assert.equal(getStatus.status, 200, 'status GET should still resolve linked profile by telegram_id');
  const getStatusJson = await readJson(getStatus);
  assert.equal(getStatusJson.linked, true, 'linked profile should remain discoverable');
  assert.equal(
    Object.prototype.hasOwnProperty.call(getStatusJson, 'telegram_auth'),
    false,
    'status GET must not include signed auth from bare telegram_id',
  );

  const postStatus = await request('/telegram/user/status', {
    body: { telegram_id: ADMIN_ID },
    env: makeEnv(db),
  });
  assert.equal(postStatus.status, 200, 'status POST by telegram_id can return profile state');
  const postStatusJson = await readJson(postStatus);
  assert.equal(postStatusJson.linked, true, 'status POST should still report linked state');
  assert.equal(
    Object.prototype.hasOwnProperty.call(postStatusJson, 'telegram_auth'),
    false,
    'status POST without restore evidence must not include signed auth',
  );

  const malformedRestore = await request('/telegram/user/status', {
    body: { telegram_id: ADMIN_ID, telegram_auth: { id: ADMIN_ID, auth_date: String(Math.floor(Date.now() / 1000)) } },
    env: makeEnv(db),
  });
  assert.equal(malformedRestore.status, 200, 'status POST with malformed restore evidence should fail closed');
  const malformedRestoreJson = await readJson(malformedRestore);
  assert.equal(
    Object.prototype.hasOwnProperty.call(malformedRestoreJson, 'telegram_auth'),
    false,
    'malformed restore evidence must not return signed auth',
  );

  const expiredRestore = await request('/telegram/user/status', {
    body: { telegram_id: ADMIN_ID, telegram_auth: buildTelegramAuth(ADMIN_ID, { ageSeconds: 60 * 60 * 24 * 30 }) },
    env: makeEnv(db),
  });
  assert.equal(expiredRestore.status, 200, 'status POST with expired restore evidence should fail closed');
  const expiredRestoreJson = await readJson(expiredRestore);
  assert.equal(
    Object.prototype.hasOwnProperty.call(expiredRestoreJson, 'telegram_auth'),
    false,
    'expired restore evidence must not return signed auth',
  );

  const invalidRestore = await request('/telegram/user/status', {
    body: { telegram_id: ADMIN_ID, telegram_auth: { ...buildTelegramAuth(ADMIN_ID), hash: 'invalid-signature' } },
    env: makeEnv(db),
  });
  assert.equal(invalidRestore.status, 200, 'status POST with invalid restore evidence should fail closed');
  const invalidRestoreJson = await readJson(invalidRestore);
  assert.equal(
    Object.prototype.hasOwnProperty.call(invalidRestoreJson, 'telegram_auth'),
    false,
    'invalid restore evidence must not return signed auth',
  );

  const mismatchedRestore = await request('/telegram/user/status', {
    body: { telegram_id: NON_ADMIN_ID, telegram_auth: buildTelegramAuth(ADMIN_ID) },
    env: makeEnv(db),
  });
  assert.equal(mismatchedRestore.status, 401, 'mismatched restore evidence must be rejected');

  const abuseAttempt = await request('/admin/arcade/grant-xp', {
    body: {
      telegram_auth: postStatusJson.telegram_auth,
      telegram_id: TARGET_ID,
      xp: 10,
    },
    env: makeEnv(db),
  });
  assert.equal(abuseAttempt.status, 401, 'grant route must reject tokenless auth from public status lookup');
}

{
  const db = new MockD1();
  seedLinkedUser(db, ADMIN_ID);
  const restoreEvidence = buildTelegramAuth(ADMIN_ID);
  const restore = await request('/telegram/user/status', {
    body: { telegram_auth: restoreEvidence },
    env: makeEnv(db),
  });
  assert.equal(restore.status, 200, 'status restore with signed evidence should succeed');
  const restoreJson = await readJson(restore);
  assert.equal(restoreJson.linked, true);
  assert.equal(restoreJson.telegram_auth && String(restoreJson.telegram_auth.id), ADMIN_ID, 'restore should return signed auth for proven owner');
  assert.ok(restoreJson.telegram_auth && restoreJson.telegram_auth.hash, 'restore should return signed hash');
  assert.equal(
    String(restoreJson.telegram_auth && restoreJson.telegram_auth.auth_date),
    String(restoreEvidence.auth_date),
    'restore must preserve evidence auth_date instead of extending token lifetime',
  );

  const rerestore = await request('/telegram/user/status', {
    body: { telegram_auth: restoreJson.telegram_auth },
    env: makeEnv(db),
  });
  assert.equal(rerestore.status, 200, 'restore can revalidate currently valid evidence');
  const rerestoreJson = await readJson(rerestore);
  assert.equal(
    String(rerestoreJson.telegram_auth && rerestoreJson.telegram_auth.auth_date),
    String(restoreJson.telegram_auth && restoreJson.telegram_auth.auth_date),
    'restore must not roll auth_date forward on repeated restore',
  );

  const arcadeGrant = await request('/admin/arcade/grant-xp', {
    body: {
      telegram_auth: restoreJson.telegram_auth,
      telegram_id: TARGET_ID,
      xp: 10,
    },
    env: makeEnv(db),
  });
  assert.equal(arcadeGrant.status, 200, 'restored signed auth should work for allowlisted admin grant');
}

{
  const db = new MockD1();
  const nonAdminAuth = buildTelegramAuth(NON_ADMIN_ID);
  const res = await request('/admin/blocktopia/grant-xp', {
    body: { telegram_auth: nonAdminAuth, telegram_id: TARGET_ID, xp: 10 },
    env: makeEnv(db, { adminIds: ADMIN_ID }),
  });
  assert.equal(res.status, 403, 'non-allowlisted telegram user must be rejected');
}

{
  const db = new MockD1();
  const adminAuth = buildTelegramAuth(ADMIN_ID);
  const btRes = await request('/admin/blocktopia/grant-xp', {
    body: {
      telegram_auth: adminAuth,
      telegram_id: TARGET_ID,
      admin_telegram_id: NON_ADMIN_ID,
      xp: 17,
      gems: 3,
      reason: 'test grant',
    },
    env: makeEnv(db),
  });
  assert.equal(btRes.status, 200, 'allowlisted signed auth must succeed for blocktopia grant');
  const btJson = await readJson(btRes);
  assert.equal(btJson.ok, true);
  assert.equal(btJson.admin_telegram_id, ADMIN_ID, 'response must use verified admin identity');
  assert.equal(db.auditEvents.at(-1)?.admin_telegram_id, ADMIN_ID, 'audit log must use verified admin identity');

  const arcadeRes = await request('/admin/arcade/grant-xp', {
    body: {
      telegram_auth: adminAuth,
      telegram_id: TARGET_ID,
      admin_telegram_id: NON_ADMIN_ID,
      xp: 55,
      reason: 'arcade test grant',
    },
    env: makeEnv(db),
  });
  assert.equal(arcadeRes.status, 200, 'allowlisted signed auth must succeed for arcade grant');
  const arcadeJson = await readJson(arcadeRes);
  assert.equal(arcadeJson.ok, true);
  assert.equal(arcadeJson.admin_telegram_id, ADMIN_ID, 'arcade response must ignore spoofed admin_telegram_id');
  assert.equal(db.auditEvents.at(-1)?.admin_telegram_id, ADMIN_ID, 'arcade audit must use verified admin identity');
}

{
  const source = await readFile(new URL('../js/admin-blocktopia-tools.js', import.meta.url), 'utf8');
  assert(!source.includes('X-Admin-Secret'), 'admin frontend must not send X-Admin-Secret');
  assert(!source.includes('arcade-admin-secret'), 'admin frontend must not reference arcade-admin-secret field');
  assert(!source.includes('bt-admin-secret'), 'admin frontend must not reference bt-admin-secret field');
  assert(!source.includes('if (ctx.authExpired) return'), 'frontend should attempt forced refresh before rejecting stale cached auth');
}

{
  const db = new MockD1();
  const validTelegramAuth = buildTelegramAuth(ADMIN_ID);
  const res = await request('/telegram/link', {
    body: { telegram_id: ADMIN_ID, telegram_auth: validTelegramAuth },
    env: makeEnv(db),
  });
  assert.equal(res.status, 401, '/telegram/link must remain protected by ADMIN_SECRET header');
}

console.log('Admin grant Telegram auth security tests PASSED.');
