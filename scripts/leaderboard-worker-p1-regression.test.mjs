import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(pathToFileURL(path.join(ROOT, 'workers/leaderboard/deployment-entry.js')).href)).default;

const BASE_URL = 'https://leaderboard.cryptomoonboys.test';
const TELEGRAM_BOT_TOKEN = 'test-bot-token-1234567890abcdef';

class MockKV {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async put(key, value) {
    this.store.set(key, String(value));
  }
}

class MockStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql.replace(/\s+/g, ' ').trim();
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    const telegramId = String(this.args[0] || '');
    if (this.sql.includes('FROM telegram_users')) {
      return this.db.telegramUsers.get(telegramId) || null;
    }
    if (this.sql.includes('FROM telegram_anticheat_state')) {
      return this.db.anticheat.get(telegramId) || null;
    }
    if (this.sql.includes('FROM telegram_activity_log')) {
      return this.db.linkConfirmed.get(telegramId) || null;
    }
    if (this.sql.includes('FROM blocktopia_progression')) {
      return this.db.blocktopiaProgression.get(telegramId) || null;
    }
    throw new Error(`Unhandled first() SQL: ${this.sql}`);
  }
}

class MockD1 {
  constructor() {
    this.telegramUsers = new Map();
    this.anticheat = new Map();
    this.linkConfirmed = new Map();
    this.blocktopiaProgression = new Map();
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }
}

function makeEnv(db = new MockD1(), kv = new MockKV()) {
  return {
    DB: db,
    LEADERBOARD: kv,
    TELEGRAM_BOT_TOKEN,
  };
}

function signTelegramAuth(fields, botToken = TELEGRAM_BOT_TOKEN) {
  const checkString = Object.entries(fields)
    .filter(([, value]) => value != null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  return createHmac('sha256', secret).update(checkString).digest('hex');
}

function buildTelegramAuth(id, { ageSeconds = 0 } = {}) {
  const authDate = String(Math.floor(Date.now() / 1000) - Math.max(0, ageSeconds));
  const payload = {
    id: String(id),
    first_name: 'Moon',
    last_name: 'Boy',
    username: `moonboy_${id}`,
    auth_date: authDate,
  };
  return { ...payload, hash: signTelegramAuth(payload) };
}

function seedLinkedUser(db, telegramId, { firstName = 'Moon', lastName = 'Boy', username = `moonboy_${telegramId}` } = {}) {
  const id = String(telegramId);
  db.telegramUsers.set(id, {
    telegram_id: id,
    username,
    first_name: firstName,
    last_name: lastName,
  });
  db.linkConfirmed.set(id, {
    action: 'link_confirmed',
    created_at: '2026-01-01T00:00:00.000Z',
  });
}

async function request(pathName, { method = 'GET', body, env } = {}) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return worker.fetch(new Request(`${BASE_URL}${pathName}`, init), env);
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

async function readStoredBoard(env, key) {
  return JSON.parse((await env.LEADERBOARD.get(`leaderboard:${key}`)) || '[]');
}

{
  const db = new MockD1();
  db.telegramUsers.set('111', {
    telegram_id: '111',
    username: 'first_score_user',
    first_name: 'First',
    last_name: 'Score',
  });
  const env = makeEnv(db);
  const response = await request('/score', {
    method: 'POST',
    env,
    body: {
      game: 'meme-swarm-3008',
      player: 'First Score',
      score: 120,
      telegram_auth: buildTelegramAuth('111'),
    },
  });
  const json = await readJson(response);
  assert.equal(response.status, 200, 'registered signed Telegram user must be able to save their first Arcade score');
  assert.equal(json.status, 'ok');
  const stored = await readStoredBoard(env, 'meme-swarm-3008');
  assert.equal(stored.length, 1, 'first accepted score must create a leaderboard row');
  assert.equal(stored[0].telegram_id, '111');
  assert.equal(stored[0].score, 120);
}

{
  const db = new MockD1();
  seedLinkedUser(db, '222', { username: 'linked_alpha' });
  const env = makeEnv(db);
  const response = await request('/score', {
    method: 'POST',
    env,
    body: {
      game: 'snake',
      player: 'Linked Alpha',
      score: 900,
      telegram_auth: buildTelegramAuth('222'),
    },
  });
  const json = await readJson(response);
  assert.equal(response.status, 200, 'fully linked account should be accepted');
  assert.equal(json.status, 'ok');
  const stored = await readStoredBoard(env, 'snake');
  assert.equal(stored.length, 1);
  assert.equal(stored[0].telegram_id, '222');
  assert.equal(stored[0].score, 900);
}

{
  const db = new MockD1();
  seedLinkedUser(db, '222', { username: 'legacy_owner' });
  seedLinkedUser(db, '333', { username: 'fresh_player' });
  const env = makeEnv(db);
  await env.LEADERBOARD.put('leaderboard:snake', JSON.stringify([
    { player: 'Guest-2222', score: 800, telegram_id: '222', rank: 1 },
  ]));
  const response = await request('/score', {
    method: 'POST',
    env,
    body: {
      game: 'snake',
      player: 'Fresh Player',
      score: 700,
      telegram_auth: buildTelegramAuth('333'),
    },
  });
  assert.equal(response.status, 200);
  const stored = await readStoredBoard(env, 'snake');
  assert.equal(stored.length, 2, 'another user write must not delete legacy authenticated rows');
  assert(stored.some((entry) => entry.telegram_id === '222' && entry.score === 800), 'legacy authenticated row must survive another user write');
}

{
  const db = new MockD1();
  seedLinkedUser(db, '222', { firstName: 'Verified', lastName: 'Player', username: 'verified_player' });
  const env = makeEnv(db);
  await env.LEADERBOARD.put('leaderboard:snake', JSON.stringify([
    { player: 'Player_1234', score: 950, telegram_id: '222', rank: 1 },
  ]));
  const response = await request('/score', {
    method: 'POST',
    env,
    body: {
      game: 'snake',
      player: 'Verified Player',
      score: 600,
      telegram_auth: buildTelegramAuth('222'),
    },
  });
  const json = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(json.leaderboard.previous_best, 950, 'existing higher best must be preserved');
  const stored = await readStoredBoard(env, 'snake');
  const entry = stored.find((row) => row.telegram_id === '222');
  assert(entry, 'verified user row must still exist');
  assert.equal(entry.score, 950, 'lower follow-up submission must not reduce prior best');
  assert.equal(entry.player, 'Verified Player', 'next verified submission must migrate legacy guest-like display name');
}

{
  const env = makeEnv(new MockD1());
  await env.LEADERBOARD.put('leaderboard:snake', JSON.stringify([
    { player: 'Guest-2222', score: 800, telegram_id: '222', rank: 1 },
    { player: 'Player_1234', score: 750, telegram_id: '333', rank: 2 },
  ]));
  const response = await request('/?game=snake', { env });
  const json = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(json.length, 2, 'public reads should keep authenticated rows visible');
  assert(json.every((entry) => !/^Guest-|^Player_\d+$/i.test(entry.player)), 'public reads must not expose guest-like player names');
  const raw = await readStoredBoard(env, 'snake');
  assert.deepEqual(
    raw,
    [
      { player: 'Guest-2222', score: 800, telegram_id: '222', rank: 1 },
      { player: 'Player_1234', score: 750, telegram_id: '333', rank: 2 },
    ],
    'public sanitization must not delete or rewrite raw authenticated score history',
  );
}

console.log('Leaderboard worker P1 regressions passed.');
