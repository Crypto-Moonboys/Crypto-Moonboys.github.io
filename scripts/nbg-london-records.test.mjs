import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import { efficiencyRate, validFinish, handleNbgLondonRecords } from '../workers/leaderboard/nbg-london-records.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON; CREATE TABLE telegram_users (telegram_id TEXT PRIMARY KEY);');
sqlite.exec("INSERT INTO telegram_users VALUES ('100'), ('200')");
sqlite.exec(readFileSync('workers/moonboys-api/migrations/098_nbg_london_records.sql', 'utf8'));

const DB = {
  prepare(sql) {
    return {
      bind(...args) {
        const stmt = sqlite.prepare(sql);
        return {
          first: async () => stmt.get(...args) || null,
          all: async () => ({ results: stmt.all(...args) }),
          run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } })
        };
      },
      all: async () => ({ results: sqlite.prepare(sql).all() }),
    };
  }
};
const env = { DB, LEADERBOARD: { get: async () => null } };
const verify = async body => {
  const id = String(body?.telegram_auth?.id || '');
  if (!['100', '200'].includes(id)) return { ok: false, status: 403, error: 'telegram_sync_required' };
  return { ok: true, telegramId: id,
    linkedAccount: { username: id === '100' ? 'alpha' : 'bravo', first_name: 'Server' } };
};
function request(path, body) {
  return new Request('https://moonboys-leaderboard.sercullen.workers.dev' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Origin: 'https://cryptomoonboys.com', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
}
async function api(path, body) {
  const response = await handleNbgLondonRecords(request(path, body), env, verify);
  return { status: response.status, ...(await response.json()) };
}

assert.equal(efficiencyRate(800, 120_000), 400, 'speed + XP must rank XP earned per minute');
assert.equal(validFinish({ complete: true, time_ms: 120000, xp: 600, coins: 25, secret_coins: 0 }, 120500), true);
assert.equal(validFinish({ complete: true, time_ms: 1500, xp: 600, coins: 25, secret_coins: 0 }, 1500), false);
assert.equal(validFinish({ complete: true, time_ms: 120000, xp: 600, coins: 25, secret_coins: 0 }, 350000), false);

const nowOriginal = Date.now;
let fakeNow = 1_800_000_000_000;
Date.now = () => fakeNow;
try {
  assert.equal((await api('/nbg-london/run/start', {})).status, 403, 'guests cannot create ranked runs');

  async function submit(id, timeMs, xp) {
    const started = await api('/nbg-london/run/start', { telegram_auth: { id } });
    assert.equal(started.status, 200, 'linked Telegram player may start');
    assert.equal(started.player, id === '100' ? '@alpha' : '@bravo', 'server controls displayed identity');
    fakeNow += timeMs;
    const submitted = await api('/nbg-london/run/finish', {
      telegram_auth: { id }, run_id: started.run_id, complete: true,
      time_ms: timeMs, xp, coins: 30, secret_coins: 1,
      player: 'fake-guest-name'
    });
    assert.equal(submitted.status, 200, 'verified completed run saves');
    assert.equal(submitted.player, id === '100' ? '@alpha' : '@bravo', 'client cannot spoof leaderboard name');
    const replay = await api('/nbg-london/run/finish', {
      telegram_auth: { id }, run_id: started.run_id, complete: true,
      time_ms: timeMs, xp, coins: 30, secret_coins: 1
    });
    assert.equal(replay.status, 409, 'run id cannot be submitted twice');
    fakeNow += 1000;
  }

  await submit('100', 125000, 850);
  await submit('200', 115000, 350);
  await submit('100', 105000, 200);
  await submit('100', 120000, 2000);

  const myBest = await api('/nbg-london/me', { telegram_auth: { id: '100' } });
  assert.equal(myBest.player, '@alpha', 'personal results use server-verified username');
  assert.equal(myBest.records.fastest_ms, 105000);
  assert.equal(myBest.records.best_xp, 2000);
  assert.equal(myBest.records.speed_xp_rate, 1000);
  assert.equal((await api('/nbg-london/me', {})).status, 403,
    'personal best endpoint must not disclose anonymous account records');

  const fastest = await api('/nbg-london/leaderboard?metric=fastest');
  const speedXp = await api('/nbg-london/leaderboard?metric=speed_xp');
  const highest = await api('/nbg-london/leaderboard?metric=xp');
  assert.deepEqual(fastest.records.map(row => [row.name, row.time_ms, row.xp]),
    [['@alpha', 105000, 200], ['@bravo', 115000, 350]], 'fastest uses shortest run per player');
  assert.deepEqual(speedXp.records.map(row => row.name), ['@alpha', '@bravo'],
    'speed + XP ranks highest XP earned per minute');
  assert.equal(speedXp.records[0].xp, 2000, 'combined leaderboard retains the high-efficiency run');
  assert.equal(highest.records[0].xp, 2000, 'highest XP uses personal best');
  assert.equal(highest.records.length, 2, 'all-time leaderboard has one entry per Telegram account');
  assert.equal((await api('/nbg-london/leaderboard?metric=other')).status, 400);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM nbg_london_records').get().count, 2);

  const unlinked = await handleNbgLondonRecords(request('/nbg-london/run/start', { telegram_auth: { id: '100' } }),
    env, async () => ({ ok: false, error: 'telegram_link_required', status: 403 }));
  assert.equal(unlinked.status, 403, 'unlinked identity must fail closed');

  const shortRun = await api('/nbg-london/run/start', { telegram_auth: { id: '100' } });
  fakeNow += 2000;
  const impossible = await api('/nbg-london/run/finish', {
    telegram_auth: { id: '100' }, run_id: shortRun.run_id,
    complete: true, time_ms: 2000, xp: 999999, coins: 300, secret_coins: 6
  });
  assert.equal(impossible.status, 422, 'impossibly fast client reports are rejected');
  assert.equal((await api('/nbg-london/leaderboard?metric=xp')).records[0].xp, 2000,
    'rejected results cannot overwrite verified bests');
} finally {
  Date.now = nowOriginal;
  sqlite.close();
}
console.log('[PASS] NBG London authenticated all-time leaderboards');
