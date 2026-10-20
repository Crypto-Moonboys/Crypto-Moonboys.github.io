import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import {
  CHAT_MENU_CLEANUP_RUN_LIMIT,
  CHAT_MENU_CLEANUP_SEED_LIMIT,
  CHAT_MENU_CLEANUP_MAX_ATTEMPTS,
  resetLegacyTelegramChatMenu,
  runTelegramChatMenuCleanup,
} from '../workers/moonboys-api/telegram-chat-menu-cleanup.js';

const migration = readFileSync(new URL('../workers/moonboys-api/migrations/102_telegram_chat_menu_cleanup.sql', import.meta.url), 'utf8');
const canonical = readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');

function fixture(ids = []) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE telegram_users (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT UNIQUE NOT NULL);`);
  sqlite.exec(migration);
  const insert = sqlite.prepare('INSERT INTO telegram_users (telegram_id) VALUES (?)');
  for (const id of ids) insert.run(String(id));
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          const stmt = sqlite.prepare(sql);
          return {
            run: async () => ({ success: true, meta: { changes: Number(stmt.run(...args).changes) } }),
            all: async () => ({ success: true, results: stmt.all(...args) }),
            first: async () => stmt.get(...args) || null,
          };
        },
      };
    },
  };
  return { sqlite, env: { DB, TELEGRAM_BOT_TOKEN: 'test:telegram_token' } };
}
function telegramOk(chatId, calls) {
  return async (url, options) => {
    assert.match(url, /^https:\/\/api\.telegram\.org\/bot[^/]+\/setChatMenuButton$/);
    assert.equal(options.method, 'POST');
    assert.ok(options.signal, 'Each Telegram reset must have a request deadline');
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload.menu_button, { type: 'commands' });
    calls.push(payload.chat_id);
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
}
function status(sqlite, id) {
  return sqlite.prepare('SELECT state, attempts, next_attempt_at, last_error_code, finished_at FROM telegram_chat_menu_cleanup WHERE telegram_id = ?').get(String(id));
}
test('migration 102 is present in the canonical schema and the Worker scheduled handler', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS telegram_chat_menu_cleanup/);
  assert.match(canonical, /CREATE TABLE IF NOT EXISTS telegram_chat_menu_cleanup/);
  assert.match(worker, /import \{ runTelegramChatMenuCleanup \} from '\.\/telegram-chat-menu-cleanup\.js'/);
  const scheduled = worker.slice(worker.indexOf('async scheduled(event, env, _ctx)'), worker.indexOf('// ── Telegram bot command handler'));
  assert.match(scheduled, /shouldRunChatMenuCleanup = !cron \|\| cron === '\*\/5 \* \* \* \*'/);
  assert.match(scheduled, /await runTelegramChatMenuCleanup\(env\)/);
});

test('scheduled rollout resets every previously registered private chat without a new user command', async () => {
  const ids = Array.from({ length: 95 }, (_, i) => String(70000001 + i));
  const { env, sqlite } = fixture(ids);
  const calls = [];
  const reset = telegramOk(null, calls);
  const time = 1800000000;
  const first = await runTelegramChatMenuCleanup(env, { now: time, fetchImpl: reset });
  assert.equal(first.ok, true);
  assert.equal(first.seeded, CHAT_MENU_CLEANUP_SEED_LIMIT, 'Migration must not enqueue the entire user table in one cron');
  assert.equal(first.considered, CHAT_MENU_CLEANUP_RUN_LIMIT);
  assert.equal(first.cleared, CHAT_MENU_CLEANUP_RUN_LIMIT);
  let more = true, rounds = 1;
  while (more && rounds < 16) {
    const result = await runTelegramChatMenuCleanup(env, { now: time, fetchImpl: reset });
    rounds++;
    more = result.considered > 0;
  }
  assert.equal(calls.length, ids.length);
  assert.equal(new Set(calls).size, ids.length, 'Completed users must not be reset repeatedly');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM telegram_chat_menu_cleanup WHERE state='cleared'").get().n, ids.length);
  const last = await runTelegramChatMenuCleanup(env, { now: time, fetchImpl: reset });
  assert.equal(last.considered, 0, 'Restarted cron must not reprocess cleared users');
  sqlite.prepare('INSERT INTO telegram_users (telegram_id) VALUES (?)').run('70000200');
  const newUser = await runTelegramChatMenuCleanup(env, { now: time, fetchImpl: reset });
  assert.equal(newUser.considered, 1, 'The rollout must also catch users registered between migration and deployment');
  assert.deepEqual(calls.at(-1), '70000200');
});

test('Telegram rate limiting uses bounded durable backoff; permanent failures do not block other users', async () => {
  const { env, sqlite } = fixture(['7001', '7002', '7003']);
  const calls = [];
  const fetchImpl = async (url, options) => {
    const id = JSON.parse(options.body).chat_id;
    calls.push(id);
    if (id === '7001' && calls.filter(x => x === id).length === 1)
      return { ok: false, status: 429, json: async () => ({
        ok: false, error_code: 429, description: 'secret upstream data',
        parameters: { retry_after: 7200 },
      }) };
    if (id === '7002') return { ok: false, status: 403, json: async () => ({ ok: false, error_code: 403 }) };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const now = 1800000000;
  const first = await runTelegramChatMenuCleanup(env, { fetchImpl, now });
  assert.deepEqual({ retry: first.retry, unavailable: first.unavailable, cleared: first.cleared }, { retry: 1, unavailable: 1, cleared: 1 });
  assert.equal(status(sqlite, '7001').next_attempt_at, now + 7200,
    'Server-requested flood-control delay must override shorter local exponential backoff');
  assert.equal(status(sqlite, '7002').last_error_code, 'bot_blocked');
  assert.equal(status(sqlite, '7002').finished_at, now);
  assert.doesNotMatch(JSON.stringify(sqlite.prepare('SELECT * FROM telegram_chat_menu_cleanup').all()), /secret upstream data/);
  const early = await runTelegramChatMenuCleanup(env, { fetchImpl, now: now + 20 });
  assert.equal(early.considered, 0, 'Retries must wait for durable backoff');
  const stillLimited = await runTelegramChatMenuCleanup(env, { fetchImpl, now: now + 7199 });
  assert.equal(stillLimited.considered, 0, 'The chat must not be retried a second before Telegram allows it');
  const later = await runTelegramChatMenuCleanup(env, { fetchImpl, now: now + 7200 });
  assert.equal(later.cleared, 1);
  assert.equal(status(sqlite, '7001').attempts, 2);
});

test('Telegram retry_after starts after delayed response, not cron start', async () => {
  const startedAt = 1800000000;
  let responseClock = startedAt;
  const { env, sqlite } = fixture(['99112234']);
  let requests = 0;
  const fetchImpl = async () => {
    requests++;
    // Simulate later Telegram response after slow network/chunk processing.
    responseClock += 23;
    if (requests === 1) {
      return { ok: false, status: 429, json: async () => ({
        ok: false, error_code: 429, parameters: { retry_after: 7200 },
      }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const options = { fetchImpl, clock: () => responseClock };
  const result = await runTelegramChatMenuCleanup(env, { ...options, now: startedAt });
  assert.equal(result.retry, 1);
  assert.equal(status(sqlite, '99112234').next_attempt_at, startedAt + 23 + 7200,
    'The full flood-control window starts after the response arrives');
  assert.equal(status(sqlite, '99112234').attempts, 1);
  const premature = await runTelegramChatMenuCleanup(env, {
    ...options, now: startedAt + 7200,
  });
  assert.equal(premature.considered, 0,
    'Cron must not spend another attempt at the old start-relative deadline');
  const justBefore = await runTelegramChatMenuCleanup(env, {
    ...options, now: startedAt + 7222,
  });
  assert.equal(justBefore.considered, 0);
  assert.equal(requests, 1, 'Not a single early Telegram retry');
  const recovered = await runTelegramChatMenuCleanup(env, {
    ...options, now: startedAt + 7223,
  });
  assert.equal(recovered.cleared, 1);
  assert.equal(requests, 2);
  assert.equal(status(sqlite, '99112234').finished_at, startedAt + 7223,
    'Completion timestamps also represent response completion rather than cron start');
});

test('429 with missing or malformed retry_after uses ordinary bounded backoff', async () => {
  const { env, sqlite } = fixture(['99112233']);
  const r = await runTelegramChatMenuCleanup(env, {
    now: 1800000000,
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({
      ok: false, error_code: 429, parameters: { retry_after: -40 },
    }) }),
  });
  assert.equal(r.retry, 1);
  assert.equal(status(sqlite, '99112233').next_attempt_at, 1800000300);
});

test('failed Telegram requests exhaust retries and do not spin forever or requeue after restarts', async () => {
  const { env, sqlite } = fixture(['98989898']);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(JSON.parse(options.body).chat_id);
    throw new Error('network secrets must not be written');
  };
  let now = 1800000000;
  for (let attempt = 0; attempt < CHAT_MENU_CLEANUP_MAX_ATTEMPTS; attempt++) {
    const result = await runTelegramChatMenuCleanup(env, { now, fetchImpl });
    assert.equal(result.considered, 1);
    if (attempt < CHAT_MENU_CLEANUP_MAX_ATTEMPTS - 1) {
      assert.equal(result.retry, 1);
      now += 300 * 2 ** attempt;
    } else assert.equal(result.exhausted, 1);
  }
  assert.equal(status(sqlite, '98989898').state, 'exhausted');
  assert.equal(status(sqlite, '98989898').attempts, CHAT_MENU_CLEANUP_MAX_ATTEMPTS);
  assert.equal((await runTelegramChatMenuCleanup(env, { fetchImpl, now: now + 50000 })).considered, 0);
  assert.equal(calls.length, CHAT_MENU_CLEANUP_MAX_ATTEMPTS);
  assert.doesNotMatch(JSON.stringify(sqlite.prepare('SELECT * FROM telegram_chat_menu_cleanup').all()), /network secrets/);
});

test('invalid stored Telegram IDs never result in Bot API calls', async () => {
  const { env, sqlite } = fixture(['not-a-number', '9988']);
  const calls = [];
  const r = await runTelegramChatMenuCleanup(env, { fetchImpl: telegramOk(null, calls), now: 1800000000 });
  assert.equal(r.unavailable, 1);
  assert.equal(r.cleared, 1);
  assert.deepEqual(calls, ['9988']);
  assert.equal(status(sqlite, 'not-a-number').last_error_code, 'invalid_telegram_id');
});

test('missing database/token fails clearly and cannot send chat resets', async () => {
  assert.equal((await runTelegramChatMenuCleanup({})).error, 'chat_menu_cleanup_not_configured');
  const invalid = await resetLegacyTelegramChatMenu('token', 'chat-invalid', () => { throw Error('must not call fetch'); });
  assert.deepEqual(invalid, { ok: false, retryable: false, category: 'invalid_telegram_id' });
});
