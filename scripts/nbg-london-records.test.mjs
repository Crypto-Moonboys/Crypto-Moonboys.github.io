import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import { efficiencyRate, validFinish, handleNbgLondonRecords } from '../workers/leaderboard/nbg-london-records.js';
import { periodStart, endedPeriods, settleNbgLondonDue, settleNbgLondonPeriod } from '../workers/leaderboard/nbg-london-prizes.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON; CREATE TABLE telegram_users (telegram_id TEXT PRIMARY KEY);');
sqlite.exec("INSERT INTO telegram_users VALUES ('100'), ('200')");
sqlite.exec(readFileSync('workers/moonboys-api/migrations/098_nbg_london_records.sql', 'utf8'));
sqlite.exec(readFileSync('workers/moonboys-api/migrations/099_nbg_london_competition_prizes.sql', 'utf8'));
sqlite.exec(`CREATE TABLE telegram_anticheat_state(telegram_id TEXT PRIMARY KEY, is_blocked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE arcade_progression_state (
 telegram_id TEXT PRIMARY KEY, arcade_xp_total INTEGER DEFAULT 0, arcade_daily_xp INTEGER DEFAULT 0,
 arcade_daily_key TEXT, arcade_restriction_level INTEGER DEFAULT 0, restricted_until TEXT, updated_at TEXT);
CREATE TABLE arcade_xp_wallets (
 telegram_id TEXT PRIMARY KEY, arcade_xp_earned INTEGER DEFAULT 0, arcade_xp_spendable INTEGER DEFAULT 0,
 arcade_xp_spent INTEGER DEFAULT 0, updated_at TEXT);
CREATE TABLE arcade_progression_events (
 id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, client_run_id TEXT NOT NULL,
 game TEXT, raw_score INTEGER, local_meta_points INTEGER, normalized_points INTEGER,
 xp_awarded INTEGER, status TEXT, reason TEXT, processed_at TEXT);`);

let batchTail = Promise.resolve();
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
  },
  async batch(statements) {
    // Model D1's serialized atomic batches: overlapping requests cannot nest SQL transactions.
    const previous = batchTail;
    let release;
    batchTail = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    } finally {
      release();
    }
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
assert.equal(efficiencyRate(1201, 120000), 600.5, 'fractional XP rates must retain accurate ranking');
assert.ok(efficiencyRate(3005, 300500) > efficiencyRate(3000, 300001),
  'near-tie XP rates must compare exactly rather than round into incorrect order');
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

  assert.equal(periodStart(Date.UTC(2026, 9, 16, 1), 'daily'), Date.UTC(2026, 9, 16, 0));
  assert.equal(periodStart(Date.UTC(2026, 9, 15, 23, 59), 'daily'), Date.UTC(2026, 9, 15, 0));
  assert.equal(periodStart(Date.UTC(2026, 9, 14, 10), 'weekly'), Date.UTC(2026, 9, 12, 0));
  assert.ok(endedPeriods(Date.UTC(2026, 9, 16, 1)).some(period => period.kind === 'daily'));

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

  const competition = await api('/nbg-london/competition?period=daily');
  assert.equal(competition.status, 200, 'live daily standings are public');
  assert.ok(competition.standings.some(row => row.name === '@alpha'), 'period board displays Telegram names');
  assert.ok(competition.standings.some(row => row.total_xp >= 2000), 'completed runs accumulate XP for the period');
  assert.equal(competition.payout_enabled, false, 'beta payouts must default to disabled');
  assert.ok(competition.standings.every(row => row.prize_eligible === false),
    'client-reported beta XP must not qualify for any future prize');
  assert.equal(sqlite.prepare('SELECT SUM(trusted_xp) AS trusted FROM nbg_london_period_scores').get().trusted, 0,
    'untrusted historic run totals cannot be upgraded to trusted Arcade XP later');

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

  // Two simultaneous attempts to finish the same receipt must change standings once.
  const replayStart = await api('/nbg-london/run/start', { telegram_auth: { id: '100' } });
  assert.equal(replayStart.status, 200);
  fakeNow += 175000;
  const beforeConcurrent = sqlite.prepare(
    `SELECT total_xp,run_count FROM nbg_london_period_scores
     WHERE period_kind='daily' AND telegram_id='100' AND period_start_ms=?`
  ).get(periodStart(fakeNow, 'daily'));
  const concurrentBody = {
    telegram_auth: { id: '100' }, run_id: replayStart.run_id,
    complete: true, time_ms: 175000, xp: 400, coins: 12, secret_coins: 0
  };
  const finishes = await Promise.all([
    api('/nbg-london/run/finish', concurrentBody),
    api('/nbg-london/run/finish', concurrentBody)
  ]);
  assert.deepEqual(finishes.map(result => result.status).sort(), [200, 409],
    'concurrent finish attempts must have exactly one winner');
  const afterConcurrent = sqlite.prepare(
    `SELECT total_xp,run_count FROM nbg_london_period_scores
     WHERE period_kind='daily' AND telegram_id='100' AND period_start_ms=?`
  ).get(periodStart(fakeNow, 'daily'));
  assert.equal(afterConcurrent.total_xp, beforeConcurrent.total_xp + 400);
  assert.equal(afterConcurrent.run_count, beforeConcurrent.run_count + 1);
  fakeNow += 1000;

  // Only the overall top 3 receive Arcade XP on settlement; 4th/blocked get none.
  sqlite.exec("INSERT INTO telegram_users(telegram_id) VALUES ('300'), ('400'), ('500')");
  sqlite.exec("INSERT INTO telegram_anticheat_state(telegram_id, is_blocked) VALUES ('500', 1)");
  const cutoff = periodStart(fakeNow, 'daily');
  const previousStart = cutoff - 86400000;
  for (const [id, points] of [['100', 8000], ['200', 6500], ['300', 4000],
                               ['400', 3900], ['500', 9000]]) {
    sqlite.prepare(`INSERT INTO nbg_london_period_scores
       (period_kind, period_start_ms, telegram_id, display_name, total_xp, trusted_xp, verified_run_count, run_count, best_time_ms, updated_at_ms)
       VALUES('daily', ?, ?, ?, ?, ?, 1, 1, 100000, ?)`).run(previousStart, id, '@' + id, points, points, fakeNow);
  }
  const period = { kind: 'daily', start: previousStart, end: cutoff };
  const settledOnce = await settleNbgLondonPeriod(env, period, cutoff);
  assert.deepEqual(settledOnce.map(winner => [winner.telegram_id, winner.arcade_xp]),
    [['100', 100], ['200', 60], ['300', 30]], 'only 3 non-blocked prize winners per day');
  // A changed blocklist after payout must not reshuffle a frozen winning roster.
  sqlite.prepare('UPDATE telegram_anticheat_state SET is_blocked=0 WHERE telegram_id=?').run('500');
  const frozenRoster = sqlite.prepare(
    'SELECT telegram_id FROM nbg_london_prize_awards WHERE period_kind=? AND period_start_ms=? ORDER BY rank'
  ).all('daily', previousStart).map(row => row.telegram_id);
  assert.deepEqual(frozenRoster, ['100','200','300']);
  const settlementRetry = await settleNbgLondonPeriod(env, period, cutoff);
  assert.deepEqual(settlementRetry, [], 'cron retries must not issue duplicate payments');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM nbg_london_prize_awards').get().n, 3);
  assert.equal(sqlite.prepare('SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id = ?').get('100').arcade_xp_total, 100);
  assert.equal(sqlite.prepare('SELECT arcade_xp_spendable FROM arcade_xp_wallets WHERE telegram_id = ?').get('200').arcade_xp_spendable, 60);
  assert.equal(sqlite.prepare('SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id = ?').get('400'), undefined);
  assert.equal(sqlite.prepare('SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id = ?').get('500'), undefined);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM arcade_progression_events').get().n, 3);
  const previousRanks = await api('/nbg-london/competition?period=daily');
  assert.equal(previousRanks.status, 200, 'period board stays available after settlement');
  
  const weekly = { kind: 'weekly', start: periodStart(fakeNow, 'weekly') - 604800000,
    end: periodStart(fakeNow, 'weekly') };
  sqlite.prepare(`INSERT INTO nbg_london_period_scores
    (period_kind, period_start_ms, telegram_id, display_name, total_xp, trusted_xp, verified_run_count, run_count, best_time_ms, updated_at_ms)
    VALUES ('weekly', ?, '100', '@alpha', 1000, 1000, 1, 1, 100000, ?)`).run(weekly.start, fakeNow);
  const weeklyResult = await settleNbgLondonPeriod(env, weekly, weekly.end);
  assert.equal(weeklyResult[0]?.arcade_xp, 500, 'weekly prizes use separate rank ladder');
  const season = { kind: 'seasonal', start: periodStart(fakeNow, 'seasonal') - 7776000000,
    end: periodStart(fakeNow, 'seasonal') };
  sqlite.prepare(`INSERT INTO nbg_london_period_scores
    (period_kind, period_start_ms, telegram_id, display_name, total_xp, trusted_xp, verified_run_count, run_count, best_time_ms, updated_at_ms)
    VALUES ('seasonal', ?, '100', '@alpha', 1000, 1000, 1, 1, 100000, ?)`).run(season.start, fakeNow);
  assert.equal((await settleNbgLondonPeriod(env, season, season.end))[0]?.arcade_xp, 2500,
    '90-day season prizes require ended seasonal period');
  assert.equal(sqlite.prepare('SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id = ?').get('100').arcade_xp_total, 3100,
    'daily, weekly and season winnings credit the shared Arcade XP lifetime total');

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
