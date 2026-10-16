import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import { efficiencyRate, validFinish, handleNbgLondonRecords } from '../workers/leaderboard/nbg-london-records.js';
import { periodStart, endedPeriods, settleNbgLondonDue, settleNbgLondonPeriod } from '../workers/leaderboard/nbg-london-prizes.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE telegram_users (
  telegram_id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1, updated_at TEXT
);
CREATE TABLE telegram_seasons (
  id INTEGER PRIMARY KEY, name TEXT, start_date TEXT, end_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE telegram_leaderboard (
  telegram_id TEXT NOT NULL, season_id INTEGER NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0, updated_at TEXT,
  PRIMARY KEY(telegram_id, season_id)
);
CREATE TABLE telegram_xp_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT NOT NULL,
  action TEXT NOT NULL, xp_change INTEGER NOT NULL, reference_id TEXT, created_at TEXT
);
INSERT INTO telegram_seasons(id,name,start_date,end_date,is_active)
 VALUES (1,'NBG-test-active','2020-01-01T00:00:00.000Z','2090-01-01T00:00:00.000Z',1);`);
sqlite.exec("INSERT INTO telegram_users VALUES ('100'), ('200')");
sqlite.exec(readFileSync('workers/moonboys-api/migrations/098_nbg_london_records.sql', 'utf8'));
sqlite.exec(readFileSync('workers/moonboys-api/migrations/099_nbg_london_competition_prizes.sql', 'utf8'));
sqlite.exec(readFileSync('workers/moonboys-api/migrations/089_community_xp_award_receipts.sql', 'utf8'));
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
const kvBans = new Set();
const env = { DB, LEADERBOARD: {
  get: async key => kvBans.has(key) ? 'lifetime' : null
} };
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
// Keep SQLite's authoritative UTC clock aligned with the simulated HTTP time.
// Without this UDF, the finish claim reads the real UTC date, making a future
// test fixture fail nondeterministically after its fixed 2027 cutoff.
sqlite.function('strftime', { deterministic: false }, (format, time) => {
  if (format === '%s' && time === 'now') return String(Math.floor(fakeNow / 1000));
  throw new Error('Unexpected SQLite clock call in NBG fixture');
});
assert.equal(Number(sqlite.prepare("SELECT strftime('%s','now') AS epoch").get().epoch) * 1000,
  fakeNow, 'D1 SQL cutoff and JavaScript period math must share the test clock');
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

  // Prize standings must use trusted-XP ranking, even when the practice
  // leader has more total reported XP than the verified winner.
  sqlite.prepare(`UPDATE nbg_london_period_scores
    SET trusted_xp=300, verified_run_count=1
    WHERE period_kind='daily' AND period_start_ms=? AND telegram_id='200'`)
    .run(periodStart(fakeNow, 'daily'));
  env.NBG_LONDON_PRIZES_ENABLED = 'true';
  env.NBG_LONDON_SCORE_AUTHORITY_ENABLED = 'true';
  const verifiedBoard = await api('/nbg-london/competition?period=daily');
  assert.equal(verifiedBoard.payout_enabled, true);
  assert.equal(verifiedBoard.ranking_basis, 'trusted_xp');
  assert.deepEqual(verifiedBoard.standings.map(({ rank, name, prize_rank, prize_eligible }) =>
    ({ rank, name, prize_rank, prize_eligible })),
    [{ rank: 1, name: '@bravo', prize_rank: 1, prize_eligible: true }],
    'the first verified prize winner must receive the first-place prize despite unverified leaders');
  assert.equal(verifiedBoard.prizes[verifiedBoard.standings[0].prize_rank - 1], 100);
  delete env.NBG_LONDON_PRIZES_ENABLED;
  delete env.NBG_LONDON_SCORE_AUTHORITY_ENABLED;

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
  assert.equal(sqlite.prepare("SELECT xp FROM telegram_users WHERE telegram_id='100'").get().xp, 100,
    'daily prize must credit shared Community XP alongside Arcade XP');
  assert.equal(sqlite.prepare("SELECT level FROM telegram_users WHERE telegram_id='100'").get().level, 2,
    'Community level must reflect the prize credited by the shared helper');
  assert.equal(sqlite.prepare("SELECT xp FROM telegram_leaderboard WHERE telegram_id='100' AND season_id=1").get().xp, 100,
    'active Community season receives the same credited XP');
  assert.equal(sqlite.prepare("SELECT SUM(xp_change) AS xp FROM telegram_xp_log WHERE action='nbg_london_prize'").get().xp, 190,
    'three prize receipts must have matching Community XP audit logs');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM telegram_community_xp_awards").get().n, 3,
    'shared Community award receipts must be exactly once');
  const previousRanks = await api('/nbg-london/competition?period=daily');
  assert.equal(previousRanks.status, 200, 'period board stays available after settlement');
  
  const weekly = { kind: 'weekly', start: periodStart(fakeNow, 'weekly') - 604800000,
    end: periodStart(fakeNow, 'weekly') };
  sqlite.prepare(`INSERT INTO nbg_london_period_scores
    (period_kind, period_start_ms, telegram_id, display_name, total_xp, trusted_xp, verified_run_count, run_count, best_time_ms, updated_at_ms)
    VALUES ('weekly', ?, '100', '@alpha', 1000, 1000, 1, 1, 100000, ?)`).run(weekly.start, fakeNow);
  // Block the winner AFTER the atomic roster freeze, before any payout statement.
  // The frozen rank remains immutable, but the blocked user is never paid.
  const originalBatch = env.DB.batch;
  let frozeWeekly = false;
  env.DB.batch = async function (statements) {
    const result = await originalBatch.call(this, statements);
    if (!frozeWeekly && sqlite.prepare(
      "SELECT 1 FROM nbg_london_prize_periods WHERE period_kind='weekly' AND period_start_ms=?"
    ).get(weekly.start)) {
      frozeWeekly = true;
      sqlite.prepare('INSERT INTO telegram_anticheat_state (telegram_id, is_blocked) VALUES (?,1) ON CONFLICT(telegram_id) DO UPDATE SET is_blocked=1').run('100');
    }
    return result;
  };
  const weeklyHeld = await settleNbgLondonPeriod(env, weekly, weekly.end);
  env.DB.batch = originalBatch;
  assert.deepEqual(weeklyHeld, [], 'blocked frozen winner must not receive a payout');
  assert.equal(sqlite.prepare(
    "SELECT paid_at_ms FROM nbg_london_prize_awards WHERE period_kind='weekly' AND period_start_ms=?"
  ).get(weekly.start).paid_at_ms, null, 'blocked prize must remain unpaid and retryable');
  sqlite.prepare('UPDATE telegram_anticheat_state SET is_blocked=0 WHERE telegram_id=?').run('100');
  const weeklyResult = await settleNbgLondonPeriod(env, weekly, weekly.end + 86400000);
  assert.equal(weeklyResult[0]?.arcade_xp, 500, 'eligible frozen weekly winner gets exactly one prize after unblocking');
  assert.deepEqual(await settleNbgLondonPeriod(env, weekly, weekly.end + 86400000), [],
    'retry cannot pay the same frozen weekly winner twice');
  assert.equal(sqlite.prepare("SELECT xp FROM telegram_users WHERE telegram_id='100'").get().xp, 600,
    'retry of already paid weekly prize must not double-credit Community XP');
  const season = { kind: 'seasonal', start: periodStart(fakeNow, 'seasonal') - 7776000000,
    end: periodStart(fakeNow, 'seasonal') };
  sqlite.prepare(`INSERT INTO nbg_london_period_scores
    (period_kind, period_start_ms, telegram_id, display_name, total_xp, trusted_xp, verified_run_count, run_count, best_time_ms, updated_at_ms)
    VALUES ('seasonal', ?, '100', '@alpha', 1000, 1000, 1, 1, 100000, ?)`).run(season.start, fakeNow);
  assert.equal((await settleNbgLondonPeriod(env, season, season.end))[0]?.arcade_xp, 2500,
    '90-day season prizes require ended seasonal period');
  assert.equal(sqlite.prepare('SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id = ?').get('100').arcade_xp_total, 3100,
    'daily, weekly and season winnings credit the shared Arcade XP lifetime total');
  assert.equal(sqlite.prepare("SELECT xp FROM telegram_users WHERE telegram_id='100'").get().xp, 3100,
    'Community lifetime XP must match the same winning Arcade XP receipts');
  assert.equal(sqlite.prepare("SELECT xp FROM telegram_leaderboard WHERE telegram_id='100' AND season_id=1").get().xp, 3100,
    'Community seasonal standing must include daily weekly and seasonal NBG payouts');
  assert.equal(sqlite.prepare("SELECT SUM(xp_change) AS xp FROM telegram_xp_log WHERE telegram_id='100' AND action='nbg_london_prize'").get().xp, 3100);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM telegram_community_xp_awards WHERE telegram_id='100'").get().n, 3,
    'retries must not duplicate Community award receipts');

  // Existing unverified high-score snapshots stay excluded even if payout flags
  // are enabled after a future server-authoritative scoring cutover.
  const oldPracticeStart = previousStart - 86400000;
  sqlite.prepare(`INSERT INTO nbg_london_period_scores
    (period_kind, period_start_ms, telegram_id, display_name, total_xp, run_count, best_time_ms, updated_at_ms)
    VALUES ('daily', ?, '400', '@practice', 999999, 1, 65000, ?)`).run(oldPracticeStart, fakeNow);
  const oldPractice = { kind: 'daily', start: oldPracticeStart, end: oldPracticeStart + 86400000 };
  assert.deepEqual(await settleNbgLondonPeriod(env, oldPractice, cutoff), [],
    'fabricated old beta XP cannot gain retroactive Arcade prizes');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM nbg_london_prize_awards').get().n, 5,
    'no extra prizes may be minted for unverified older runs');

  // Fifty KV-only banned, frozen unpaid periods must NOT occupy the retry
  // batch even when the D1 block write failed. The shared KV is authoritative.
  sqlite.prepare('UPDATE telegram_anticheat_state SET is_blocked=0 WHERE telegram_id=?').run('500');
  kvBans.add('anticheat:blocked:500');
  const freeze = sqlite.prepare(`INSERT INTO nbg_london_prize_periods
    (period_kind,period_start_ms,period_end_ms,frozen_at_ms,freeze_token)
    VALUES ('daily',?,?,?,?)`);
  const award = sqlite.prepare(`INSERT INTO nbg_london_prize_awards
    (event_id,period_kind,period_start_ms,rank,telegram_id,prize_arcade_xp,settled_at_ms)
    VALUES (?,'daily',?,1,?,100,?)`);
  for (let i = 0; i < 50; i++) {
    const start = oldPracticeStart - (i + 20) * 86400000;
    freeze.run(start, start + 86400000, fakeNow, 'blocked-freeze-' + i);
    award.run('blocked-daily-' + i, start, '500', fakeNow);
  }
  const eligibleStart = oldPracticeStart - 5 * 86400000;
  freeze.run(eligibleStart, eligibleStart + 86400000, fakeNow, 'eligible-freeze');
  award.run('eligible-daily-award', eligibleStart, '300', fakeNow);
  const recovered = await settleNbgLondonDue(env, fakeNow);
  assert.ok(recovered.some(periodResult =>
    periodResult.period_start_ms === eligibleStart &&
    periodResult.payouts.some(prize => prize.telegram_id === '300' && prize.arcade_xp === 100)),
  'newer unblocked payout must settle despite fifty older blocked unpaid periods');
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS n FROM nbg_london_prize_awards WHERE telegram_id='500' AND paid_at_ms IS NULL"
  ).get().n, 50, 'blocked receipts remain unpaid and retryable after unblocking');
  assert.equal(sqlite.prepare(
    "SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id='300'"
  ).get().arcade_xp_total, 130, 'eligible award credits the existing shared Arcade XP wallet once');
  assert.deepEqual((await settleNbgLondonDue(env, fakeNow)).flatMap(report => report.payouts), [],
    'retrying the recovered period cannot credit it twice');
  kvBans.delete('anticheat:blocked:500');

  // KV-only bans must affect initial winner selection BEFORE assigning ranks.
  const kvPeriodStart = oldPracticeStart - 3 * 86400000;
  for (const [id, points] of [['500', 90000], ['300', 70000], ['400', 60000]]) {
    sqlite.prepare(`INSERT INTO nbg_london_period_scores
      (period_kind,period_start_ms,telegram_id,display_name,total_xp,trusted_xp,
       verified_run_count,run_count,best_time_ms,updated_at_ms)
      VALUES('daily',?,?,?,?,?,1,1,100000,?)`
    ).run(kvPeriodStart, id, '@' + id, points, points, fakeNow);
  }
  kvBans.add('anticheat:blocked:500');
  const kvFreezePayouts = await settleNbgLondonPeriod(env, {
    kind: 'daily', start: kvPeriodStart, end: kvPeriodStart + 86400000
  }, fakeNow);
  assert.deepEqual(kvFreezePayouts.map(prize => [prize.telegram_id, prize.arcade_xp]),
    [['300', 100], ['400', 60]],
    'KV-only banned player must not steal first rank when D1 block is absent');
  assert.equal(sqlite.prepare(
    'SELECT COUNT(*) AS n FROM nbg_london_prize_awards WHERE period_kind=? AND period_start_ms=? AND telegram_id=?'
  ).get('daily', kvPeriodStart, '500').n, 0,
  'KV-only banned player cannot enter frozen winner roster');
  kvBans.delete('anticheat:blocked:500');

  // A winner frozen while clean but banned in KV before retry cannot be paid.
  const frozenKvStart = oldPracticeStart - 4 * 86400000;
  freeze.run(frozenKvStart, frozenKvStart + 86400000, fakeNow, 'frozen-kv-only');
  award.run('frozen-kv-award', frozenKvStart, '500', fakeNow);
  kvBans.add('anticheat:blocked:500');
  assert.deepEqual(await settleNbgLondonPeriod(env, {
    kind: 'daily', start: frozenKvStart, end: frozenKvStart + 86400000
  }, fakeNow), [], 'KV-only blocked frozen winner receives no shared Arcade XP');
  assert.equal(sqlite.prepare(
    "SELECT paid_at_ms FROM nbg_london_prize_awards WHERE event_id='frozen-kv-award'"
  ).get().paid_at_ms, null);
  kvBans.delete('anticheat:blocked:500');
  assert.deepEqual(await settleNbgLondonPeriod(env, {
    kind: 'daily', start: frozenKvStart, end: frozenKvStart + 86400000
  }, fakeNow), [{ rank: 1, telegram_id: '500', arcade_xp: 100 }],
  'KV-only ban removal may resume the same frozen award exactly once');

  const shortRun = await api('/nbg-london/run/start', { telegram_auth: { id: '100' } });
  fakeNow += 2000;
  const impossible = await api('/nbg-london/run/finish', {
    telegram_auth: { id: '100' }, run_id: shortRun.run_id,
    complete: true, time_ms: 2000, xp: 999999, coins: 300, secret_coins: 6
  });
  assert.equal(impossible.status, 422, 'impossibly fast client reports are rejected');
  assert.equal((await api('/nbg-london/leaderboard?metric=xp')).records[0].xp, 2000,
    'rejected results cannot overwrite verified bests');

  // A prior freeze winning the database race must reject a late finish before
  // writing even the all-time best: the active period cannot be revised.
  const lateStart = await api('/nbg-london/run/start', { telegram_auth: { id: '100' } });
  fakeNow += 120000;
  const activeDaily = periodStart(fakeNow, 'daily');
  sqlite.prepare(`INSERT INTO nbg_london_prize_periods
    (period_kind, period_start_ms, period_end_ms, frozen_at_ms, freeze_token)
    VALUES ('daily', ?, ?, ?, ?)`).run(activeDaily, activeDaily + 86400000, fakeNow, 'frozen-test-token');
  const late = await api('/nbg-london/run/finish', {
    telegram_auth: { id: '100' }, run_id: lateStart.run_id,
    complete: true, time_ms: 120000, xp: 999000, coins: 20, secret_coins: 0
  });
  assert.equal(late.status, 409, 'finish arriving after a period freeze must fail atomically');
  assert.equal((await api('/nbg-london/leaderboard?metric=xp')).records[0].xp, 2000,
    'late receipt must not modify the all-time record');
  assert.equal(sqlite.prepare(
    "SELECT total_xp FROM nbg_london_period_scores WHERE period_kind='daily' AND period_start_ms=? AND telegram_id='100'"
  ).get(activeDaily).total_xp, afterConcurrent.total_xp,
    'late receipt must not change the already frozen daily total');
  // Public boards must screen BOTH anti-cheat stores before selecting top 20
  // and assigning ranks, including bans applied after records were saved.
  fakeNow += 86400000;
  const displayPeriod = periodStart(fakeNow, 'daily');
  const insertUser = sqlite.prepare('INSERT INTO telegram_users (telegram_id) VALUES (?)');
  const insertRecord = sqlite.prepare(`INSERT INTO nbg_london_records
    (telegram_id,display_name,fastest_ms,fastest_xp,speed_xp_rate,speed_xp_ms,
     speed_xp_xp,best_xp,best_xp_ms,updated_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insertPeriod = sqlite.prepare(`INSERT INTO nbg_london_period_scores
    (period_kind,period_start_ms,telegram_id,display_name,total_xp,trusted_xp,
     verified_run_count,run_count,best_time_ms,updated_at_ms)
    VALUES ('daily',?,?,?,?,?,1,1,?,?)`);
  for (let i = 0; i < 25; i += 1) {
    const id = String(700 + i);
    const name = '@score' + id;
    const time = 90000 + i * 1000;
    insertUser.run(id);
    insertRecord.run(id, name, time, 9000 - i, 800 - i * 2,
      time, 9000 - i, 9000 - i, time, fakeNow);
    insertPeriod.run(displayPeriod, id, name, 50000 - i * 100,
      50000 - i * 100, time, fakeNow);
  }
  kvBans.add('anticheat:blocked:700');
  sqlite.prepare('INSERT INTO telegram_anticheat_state (telegram_id,is_blocked) VALUES (?,1)').run('701');
  env.NBG_LONDON_PRIZES_ENABLED = 'true';
  env.NBG_LONDON_SCORE_AUTHORITY_ENABLED = 'true';
  const publicContest = await api('/nbg-london/competition?period=daily');
  assert.equal(publicContest.status, 200);
  assert.equal(publicContest.ranking_basis, 'trusted_xp');
  assert.equal(publicContest.standings.length, 20);
  assert.equal(publicContest.standings[0].name, '@score702');
  assert.equal(publicContest.standings[0].prize_rank, 1);
  assert.equal(publicContest.standings[2].prize_rank, 3);
  assert.ok(publicContest.standings.every(row =>
    !['@score700', '@score701'].includes(row.name)),
  'both KV-only and D1-only bans must be removed before assigning prize ranks');
  assert.ok(publicContest.standings.some(row => row.name === '@score721'),
    'the 22nd raw competitor should enter the top 20 after banned leaders are removed');
  delete env.NBG_LONDON_PRIZES_ENABLED;
  delete env.NBG_LONDON_SCORE_AUTHORITY_ENABLED;
  const practiceContest = await api('/nbg-london/competition?period=daily');
  assert.equal(practiceContest.standings[0].name, '@score702');
  assert.equal(practiceContest.standings[0].prize_eligible, false);
  for (const metric of ['fastest', 'speed_xp', 'xp']) {
    const board = await api('/nbg-london/leaderboard?metric=' + metric);
    assert.equal(board.status, 200);
    assert.equal(board.records.length, 20);
    assert.equal(board.records[0].name, metric === 'speed_xp' ? '@alpha' : '@score702',
      'existing legitimate personal bests must keep their correct per-metric ranking');
    assert.ok(board.records.some(row => row.name === '@score720'),
      'the 21st raw competitor should backfill the 20-person board after both bans');
    assert.ok(board.records.every(row => !['@score700', '@score701'].includes(row.name)),
      'bans after submission must suppress stored all-time results publicly');
  }
  const originalKv = env.LEADERBOARD;
  env.LEADERBOARD = null;
  assert.equal((await api('/nbg-london/competition?period=daily')).status, 503,
    'public contest cannot expose unsafe results when anti-cheat KV is unavailable');
  assert.equal((await api('/nbg-london/leaderboard?metric=xp')).status, 503,
    'public lifetime board must fail closed when anti-cheat KV is unavailable');
  env.LEADERBOARD = originalKv;

} finally {
  Date.now = nowOriginal;
  sqlite.close();
}
console.log('[PASS] NBG London authenticated all-time leaderboards');
