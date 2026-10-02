import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac } from 'node:crypto';
import worker from '../workers/moonboys-api/worker.js';
import { awardCommunityXp, hasDailyCommunityClaim } from '../workers/moonboys-api/community-xp-awards.js';

const TOKEN = '123456:community-test-token';
const SECRET = 'community-test-webhook-secret-0000000000000000';
let nextOwner = 97361000;

function fixture(t) {
  const owner = String(++nextOwner);
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  for (const name of ['003_anticheat.sql', '048_telegram_pet_player_expansion.sql', '058_telegram_pet_season_completion.sql',
    '061_moonpet_season_economy_calibration.sql', '085_permanent_pet_weekly_evidence.sql', '089_community_xp_award_receipts.sql']) {
    sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/' + name, import.meta.url), 'utf8'));
  }
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, 'Community test');
  sql.exec("INSERT INTO telegram_seasons (id,name,start_date,end_date,is_active) VALUES (1,'Current','2000-01-01','2999-01-01',1)");
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() {
      const injected = await db.beforeFirst?.(this);
      return injected !== undefined ? injected : sql.prepare(this.query).get(...this.args) || null;
    }
    async all() {
      const injected = await db.beforeAll?.(this);
      return injected !== undefined ? injected : { success: true, results: sql.prepare(this.query).all(...this.args) };
    }
    exec() {
      if (sql.prepare(this.query).columns().length) return { success: true, results: sql.prepare(this.query).all(...this.args), meta: { changes: 0 } };
      return { success: true, results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { const injected = await db.beforeRun?.(this); return injected !== undefined ? injected : this.exec(); }
  }
  const db = {
    prepare: query => new Statement(query),
    async batch(statements) {
      const injected = await db.beforeBatch?.(statements);
      if (injected !== undefined) return injected;
      sql.exec('BEGIN');
      try { const result = statements.map(statement => statement.exec()); sql.exec('COMMIT'); return db.afterBatch?.(statements, result) ?? result; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const env = { DB: db, TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: SECRET, PET_MINI_APP_ENABLED: 'true' };
  const messages = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    messages.push(JSON.parse(options.body));
    return Response.json({ ok: true, result: { message_id: 1 } });
  });
  let updateId = 0;
  const webhook = async (text = '/daily', extra = {}) => {
    const response = await worker.fetch(new Request('https://moonboys-api.test/telegram/webhook', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
      body: JSON.stringify({ update_id: ++updateId, message: { message_id: updateId, from: { id: Number(owner), first_name: 'Community test' },
        chat: { id: Number(owner), type: 'private' }, text, ...extra } }),
    }), env);
    assert.equal(response.status, 200);
  };
  const arcade = async (id = 'run-one', game = 'snake', meta = 1000) => {
    const auth = { id: owner, first_name: 'Community test', auth_date: String(Math.floor(Date.now() / 1000)) };
    const check = Object.entries(auth).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
    auth.hash = createHmac('sha256', createHash('sha256').update(TOKEN).digest()).update(check).digest('hex');
    const response = await worker.fetch(new Request('https://moonboys-api.test/arcade/progression/sync', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ telegram_auth: auth,
        entries: [{ client_run_id: id, game, raw_score: 1000, meta_points: meta }] }),
    }), env);
    return { status: response.status, body: await response.json() };
  };
  const totals = () => ({
    account: sql.prepare('SELECT xp FROM telegram_users WHERE telegram_id=?').get(owner).xp,
    log: sql.prepare('SELECT COALESCE(SUM(xp_change),0) AS xp FROM telegram_xp_log WHERE telegram_id=?').get(owner).xp,
    board: sql.prepare('SELECT COALESCE(SUM(xp),0) AS xp FROM telegram_leaderboard WHERE telegram_id=?').get(owner).xp,
    receipts: sql.prepare('SELECT COUNT(*) AS n FROM telegram_community_xp_awards WHERE telegram_id=?').get(owner).n,
  });
  const heads = () => messages.filter(message => message.text).map(message => message.text.split('\n')[0]);
  t.after(() => sql.close());
  return { owner, sql, db, env, webhook, arcade, totals, heads, messages };
}

for (const [name, trigger] of [
  ['receipt', 'BEFORE INSERT ON telegram_community_xp_awards'],
  ['log', 'BEFORE INSERT ON telegram_xp_log'],
  ['account', 'BEFORE UPDATE OF xp ON telegram_users'],
  ['leaderboard', 'BEFORE INSERT ON telegram_leaderboard'],
]) test(`authenticated /daily rolls back ${name} statement failure and retries exactly once`, async t => {
  const f = fixture(t);
  f.sql.exec(`CREATE TRIGGER fail_award ${trigger} BEGIN SELECT RAISE(ABORT,'injected_award_failure'); END`);
  await f.webhook();
  assert.deepEqual(f.totals(), { account: 0, log: 0, board: 0, receipts: 0 });
  assert.ok(f.heads().some(text => text.includes('could not be confirmed')));
  assert.ok(!f.heads().some(text => text.includes('Daily XP claimed!')));
  f.sql.exec('DROP TRIGGER fail_award');
  await f.webhook(); await f.webhook();
  assert.deepEqual(f.totals(), { account: 20, log: 20, board: 20, receipts: 1 });
  assert.equal(f.heads().filter(text => text.includes('Daily XP claimed!')).length, 1);
  assert.equal(f.heads().filter(text => text.includes('already claimed')).length, 1);
});

for (const failure of ['thrown', 'resolved', 'malformed']) test(`/daily ${failure} claim read fails closed and daily-status is unavailable`, async t => {
  const f = fixture(t); await f.webhook();
  f.db.beforeFirst = statement => {
    if (!/SELECT id FROM telegram_xp_log/.test(statement.query)) return;
    if (failure === 'thrown') throw Error('injected_read_failure');
    return failure === 'resolved' ? { success: false, error: 'injected_read_failure' } : {};
  };
  const status = await worker.fetch(new Request(`https://moonboys-api.test/telegram/daily-status?telegram_id=${f.owner}`), f.env);
  assert.equal(status.status, 500);
  assert.equal((await status.json()).claimed, undefined);
  await f.webhook();
  assert.deepEqual(f.totals(), { account: 20, log: 20, board: 20, receipts: 1 });
  assert.ok(f.heads().at(-1).includes('could not be confirmed'));
  f.db.beforeFirst = null; await f.webhook();
  assert.ok(f.heads().at(-1).includes('already claimed'));
});

for (const failure of ['thrown', 'resolved', 'malformed']) test(`/daily ${failure} whole batch failure reports pending and can retry`, async t => {
  const f = fixture(t);
  f.db.beforeBatch = statements => {
    if (!statements.some(statement => /INSERT OR IGNORE INTO telegram_community_xp_awards/.test(statement.query))) return;
    if (failure === 'thrown') throw Error('injected_batch_failure');
    return statements.map(() => failure === 'resolved' ? { success: false, meta: { changes: 0 } } : {});
  };
  await f.webhook(); assert.deepEqual(f.totals(), { account: 0, log: 0, board: 0, receipts: 0 });
  assert.ok(f.heads().at(-1).includes('could not be confirmed'));
  f.db.beforeBatch = null; await f.webhook();
  assert.deepEqual(f.totals(), { account: 20, log: 20, board: 20, receipts: 1 });
});

test('two authenticated daily requests that both read unclaimed pay only once', async t => {
  const f = fixture(t); let arrivals = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  f.db.beforeFirst = async statement => {
    if (!/SELECT id FROM telegram_xp_log/.test(statement.query)) return;
    if (++arrivals === 2) release();
    await barrier;
  };
  await Promise.all([f.webhook(), f.webhook()]);
  assert.equal(arrivals, 2);
  assert.deepEqual(f.totals(), { account: 20, log: 20, board: 20, receipts: 1 });
  assert.equal(f.heads().filter(text => text.includes('Daily XP claimed!')).length, 1);
  assert.equal(f.heads().filter(text => text.includes('already claimed')).length, 1);
});

test('daily committed transaction with missing response metadata retries as a saved duplicate', async t => {
  const f = fixture(t);
  f.db.afterBatch = (statements, results) => statements.some(statement => /INSERT OR IGNORE INTO telegram_community_xp_awards/.test(statement.query))
    ? results.map(() => ({})) : results;
  await f.webhook();
  assert.ok(f.heads().at(-1).includes('could not be confirmed'));
  assert.deepEqual(f.totals(), { account: 20, log: 20, board: 20, receipts: 1 });
  f.db.afterBatch = null; await f.webhook();
  assert.ok(f.heads().at(-1).includes('already claimed'));
  assert.deepEqual(f.totals(), { account: 20, log: 20, board: 20, receipts: 1 });
});

for (const malformed of [{ success: false, results: [] }, {}, { results: [{}] }, { results: [{ id: '2' }] }]) {
  test(`unavailable Community season authority cannot become an unranked award: ${JSON.stringify(malformed)}`, async t => {
    const f = fixture(t);
    f.db.beforeAll = statement => /FROM telegram_seasons/.test(statement.query) ? malformed : undefined;
    await f.webhook();
    assert.deepEqual(f.totals(), { account: 0, log: 0, board: 0, receipts: 0 });
    assert.ok(f.heads().at(-1).includes('could not be confirmed'));
    f.db.beforeAll = null; await f.webhook();
    assert.deepEqual(f.totals(), { account: 20, log: 20, board: 20, receipts: 1 });
  });
}

test('daily midnight and Community intraday boundary use one captured earning timestamp', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-30T23:59:59.999Z') });
  const f = fixture(t);
  f.sql.exec("UPDATE telegram_seasons SET end_date='2026-10-01T00:00:00Z'; INSERT INTO telegram_seasons(id,name,start_date,end_date,is_active) VALUES (2,'Next','2026-10-01T00:00:00Z','2999-01-01',1)");
  f.db.beforeBatch = statements => {
    if (statements.some(statement => /INSERT OR IGNORE INTO telegram_community_xp_awards/.test(statement.query))) {
      t.mock.timers.setTime(new Date('2026-10-01T00:00:00.001Z').getTime());
    }
  };
  await f.webhook(); f.db.beforeBatch = null;
  const first = f.sql.prepare('SELECT * FROM telegram_community_xp_awards').get();
  assert.equal(first.claim_key, '2026-09-30'); assert.equal(first.season_id, 1);
  assert.equal(first.earned_at, '2026-09-30T23:59:59.999Z');
  assert.equal(await hasDailyCommunityClaim(f.db, f.owner), false);
  await f.webhook(); await f.webhook();
  assert.deepEqual(f.totals(), { account: 40, log: 40, board: 40, receipts: 2 });
  assert.deepEqual(f.sql.prepare('SELECT season_id,xp FROM telegram_leaderboard ORDER BY season_id').all().map(row => ({ ...row })),
    [{ season_id: 1, xp: 20 }, { season_id: 2, xp: 20 }]);
});

test('intraday season, no active season, duplicate amount and owner isolation are authoritative', async t => {
  const f = fixture(t);
  f.sql.exec("UPDATE telegram_seasons SET end_date='2026-10-02T12:00:00Z'; INSERT INTO telegram_seasons(id,name,start_date,end_date,is_active) VALUES(2,'Afternoon','2026-10-02T12:00:00Z','2026-10-03',1)");
  const now = new Date('2026-10-02T20:00:00Z');
  const first = await awardCommunityXp(f.db, f.owner, 9, 'wiki_mission_complete', 'source-one', { now });
  assert.equal(first.season_id, 2);
  const replay = await awardCommunityXp(f.db, f.owner, 999, 'wiki_mission_complete', 'source-one', { now: new Date('2027-01-01') });
  assert.equal(replay.duplicate, true); assert.equal(replay.original_xp, 9); assert.equal(replay.season_id, 2);
  f.sql.prepare('INSERT INTO telegram_users(telegram_id) VALUES(?)').run('another-owner');
  await awardCommunityXp(f.db, 'another-owner', 7, 'wiki_mission_complete', 'source-one', { now });
  assert.deepEqual(f.totals(), { account: 9, log: 9, board: 9, receipts: 1 });
  const noSeason = await awardCommunityXp(f.db, f.owner, 3, 'wiki_mission_complete', 'source-two', { now: new Date('2027-01-01') });
  assert.equal(noSeason.season_id, null); assert.deepEqual(f.totals(), { account: 12, log: 12, board: 9, receipts: 2 });
});

test('legacy logs remain untouched duplicates without fabricating repairs', async t => {
  const f = fixture(t);
  f.sql.prepare("INSERT INTO telegram_xp_log(telegram_id,action,xp_change,reference_id) VALUES(?,'first_start',50,NULL)").run(f.owner);
  const prior = f.sql.prepare('SELECT * FROM telegram_xp_log').all();
  const result = await awardCommunityXp(f.db, f.owner, 50, 'first_start');
  assert.equal(result.duplicate, true); assert.equal(result.legacy_receipt, true);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_xp_log').all(), prior);
  assert.deepEqual(f.totals(), { account: 0, log: 50, board: 0, receipts: 0 });
});

test('first launch never announces unsaved XP and group joins pay once concurrently', async t => {
  const f = fixture(t);
  f.sql.exec("CREATE TRIGGER fail_award BEFORE UPDATE OF xp ON telegram_users BEGIN SELECT RAISE(ABORT,'injected'); END");
  await f.webhook('/gkstart');
  assert.ok(!f.messages.some(message => message.text?.includes('You earned')));
  assert.ok(f.messages.some(message => message.text?.includes('first-launch XP could not be confirmed')));
  assert.deepEqual(f.totals(), { account: 0, log: 0, board: 0, receipts: 0 });
  f.sql.exec('DROP TRIGGER fail_award');
  await f.webhook('/gkstart'); await f.webhook('/gkstart');
  assert.equal(f.messages.filter(message => message.text?.includes('You earned')).length, 1);
  const earned = f.totals().account;
  assert.ok(earned > 0); assert.equal(f.totals().receipts, 1);
  const join = () => f.webhook('', { new_chat_members: [{ id: Number(f.owner), first_name: 'Community test' }] });
  await Promise.all([join(), join()]);
  const joinRows = f.sql.prepare("SELECT xp_change FROM telegram_xp_log WHERE action='group_join'").all();
  assert.equal(joinRows.length, 1); assert.equal(f.totals().account, earned + joinRows[0].xp_change);
});

for (const target of ['arcade_progression_events', 'arcade_game_enforcement_state', 'arcade_progression_state', 'arcade_xp_wallets']) {
  test(`Arcade accepted source and all XP roll back when ${target} fails`, async t => {
    const f = fixture(t);
    const operation = target === 'arcade_progression_events' || target === 'arcade_xp_wallets' ? 'INSERT' : 'UPDATE';
    f.sql.exec(`CREATE TRIGGER fail_source BEFORE ${operation} ON ${target} BEGIN SELECT RAISE(ABORT,'injected_source_failure'); END`);
    const failed = await f.arcade(); assert.equal(failed.status, 500, JSON.stringify(failed));
    assert.deepEqual(f.totals(), { account: 0, log: 0, board: 0, receipts: 0 });
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM arcade_progression_events').get().n, 0);
    f.sql.exec('DROP TRIGGER fail_source');
    const saved = await f.arcade(); assert.equal(saved.status, 200, JSON.stringify(saved));
    const xp = saved.body.synced.xp_awarded; assert.ok(xp > 0);
    const retry = await f.arcade('run-one', 'tetris', 999999); assert.equal(retry.status, 200);
    assert.equal(retry.body.results[0].status, 'duplicate');
    assert.deepEqual(f.totals(), { account: xp, log: xp, board: xp, receipts: 1 });
    const state = f.sql.prepare('SELECT * FROM arcade_progression_state').get();
    const wallet = f.sql.prepare('SELECT * FROM arcade_xp_wallets').get();
    assert.equal(state.arcade_xp_total, xp); assert.equal(state.arcade_daily_xp, xp);
    assert.equal(wallet.arcade_xp_earned, xp); assert.equal(wallet.arcade_xp_spendable, xp);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM arcade_progression_events').get().n, 1);
  });
}

test('different concurrent Arcade runs near cap cannot overpay or overwrite totals; capped zero XP persists', async t => {
  const f = fixture(t);
  const day = new Date().toISOString().slice(0, 10);
  f.sql.prepare('INSERT INTO arcade_progression_state(telegram_id,arcade_xp_total,arcade_daily_xp,arcade_daily_key) VALUES(?,2195,2195,?)').run(f.owner, day);
  let arrivals = 0, release; const barrier = new Promise(resolve => { release = resolve; });
  f.db.beforeBatch = async statements => {
    if (!statements.some(statement => /INSERT OR IGNORE INTO telegram_community_xp_awards/.test(statement.query))) return;
    if (++arrivals === 2) release(); await barrier;
  };
  const responses = await Promise.all([f.arcade('near-cap-a', 'snake'), f.arcade('near-cap-b', 'tetris')]);
  assert.deepEqual(responses.map(result => result.status).sort(), [200, 500]);
  f.db.beforeBatch = null;
  const loser = responses[0].status === 500 ? ['near-cap-a', 'snake'] : ['near-cap-b', 'tetris'];
  const retry = await f.arcade(...loser); assert.equal(retry.status, 200, JSON.stringify(retry));
  assert.equal(retry.body.results[0].status, 'accepted'); assert.equal(retry.body.results[0].xp_awarded, 0);
  assert.deepEqual(f.totals(), { account: 5, log: 5, board: 5, receipts: 2 });
  const state = f.sql.prepare('SELECT * FROM arcade_progression_state').get();
  assert.equal(state.arcade_daily_xp, 2200); assert.equal(state.arcade_xp_total, 2200);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM arcade_progression_events').get().n, 2);
  assert.equal(f.sql.prepare('SELECT arcade_xp_earned FROM arcade_xp_wallets').get().arcade_xp_earned, 5);
  assert.equal((await f.arcade(...loser)).body.results[0].status, 'duplicate');
});

for (const savedDailyXp of [0, 2195]) test(`canonical empty Arcade day initializes conservatively with ${savedDailyXp} saved daily XP`, async t => {
  const f = fixture(t);
  // Migration 014 and schema.sql both permit this historical default state.
  f.sql.prepare('INSERT INTO arcade_progression_state(telegram_id,arcade_xp_total,arcade_daily_xp) VALUES(?,5000,?)').run(f.owner, savedDailyXp);
  const result = await f.arcade(); assert.equal(result.status, 200, JSON.stringify(result));
  const earned = result.body.synced.xp_awarded;
  assert.ok(earned > 0); if (savedDailyXp) assert.equal(earned, 5);
  const saved = f.sql.prepare('SELECT * FROM arcade_progression_state').get();
  assert.equal(saved.arcade_xp_total, 5000 + earned);
  assert.equal(saved.arcade_daily_xp, savedDailyXp + earned);
  assert.equal(saved.arcade_daily_key, new Date().toISOString().slice(0, 10));
});

test('missing Arcade daily clock field stays unavailable rather than being treated as a schema default', async t => {
  const f = fixture(t);
  f.db.beforeFirst = statement => /FROM arcade_progression_state/.test(statement.query)
    ? { telegram_id: f.owner, arcade_xp_total: 5000, arcade_daily_xp: 0 } : undefined;
  const result = await f.arcade(); assert.equal(result.status, 500);
  assert.deepEqual(f.totals(), { account: 0, log: 0, board: 0, receipts: 0 });
});

test('Arcade successful retry after quarter rollover preserves saved source, season and XP', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-30T23:59:59Z') });
  const f = fixture(t);
  f.sql.exec("UPDATE telegram_seasons SET end_date='2026-10-01'; INSERT INTO telegram_seasons(id,name,start_date,end_date,is_active) VALUES(2,'Next','2026-10-01','2999-01-01',1)");
  const first = await f.arcade(); assert.equal(first.status, 200, JSON.stringify(first));
  const snapshot = f.sql.prepare('SELECT * FROM arcade_progression_events').all();
  t.mock.timers.setTime(new Date('2026-10-01T01:00:00Z').getTime());
  const replay = await f.arcade(); assert.equal(replay.status, 200, JSON.stringify(replay));
  assert.equal(replay.body.results[0].status, 'duplicate');
  assert.deepEqual(f.sql.prepare('SELECT * FROM arcade_progression_events').all(), snapshot);
  assert.equal(f.sql.prepare('SELECT season_id FROM telegram_community_xp_awards').get().season_id, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_leaderboard WHERE season_id=2').get().n, 0);
});

test('concurrent same Arcade run accepted before another denial is projected as its saved duplicate', async t => {
  const f = fixture(t);
  let phase = 0, resume, paused;
  const blocked = new Promise(resolve => { resume = resolve; });
  const reached = new Promise(resolve => { paused = resolve; });
  f.db.beforeFirst = async statement => {
    if (phase === 0 && /SELECT \* FROM arcade_progression_events/.test(statement.query)) { phase = 1; return null; }
    if (phase === 1 && /FROM arcade_progression_state/.test(statement.query)) {
      phase = 2; paused(); await blocked;
    }
  };
  const slower = f.arcade('ceiling-run', 'snake', 100000);
  await reached;
  const winner = await f.arcade('ceiling-run', 'snake', 100000);
  assert.equal(winner.status, 200, JSON.stringify(winner));
  assert.equal(winner.body.results[0].status, 'accepted');
  assert.ok(winner.body.results[0].cooldown_until);
  resume();
  const loser = await slower;
  assert.equal(loser.status, 200, JSON.stringify(loser));
  assert.equal(loser.body.results[0].status, 'duplicate');
  assert.equal(loser.body.synced.rejected, 0);
  const xp = winner.body.synced.xp_awarded;
  assert.deepEqual(f.totals(), { account: xp, log: xp, board: xp, receipts: 1 });
});

test('Arcade source settlement preserves wallet spending interleaved before its atomic batch', async t => {
  const f = fixture(t);
  const first = await f.arcade('wallet-first'); assert.equal(first.status, 200);
  const initial = first.body.synced.xp_awarded; assert.ok(initial >= 5);
  f.db.beforeBatch = statements => {
    if (statements.some(statement => /INSERT OR IGNORE INTO telegram_community_xp_awards/.test(statement.query))) {
      f.sql.prepare('UPDATE arcade_xp_wallets SET arcade_xp_spendable=arcade_xp_spendable-5,arcade_xp_spent=arcade_xp_spent+5 WHERE telegram_id=?').run(f.owner);
      f.db.beforeBatch = null;
    }
  };
  const second = await f.arcade('wallet-second'); assert.equal(second.status, 200);
  const wallet = f.sql.prepare('SELECT * FROM arcade_xp_wallets').get();
  assert.equal(wallet.arcade_xp_earned, initial + second.body.synced.xp_awarded);
  assert.equal(wallet.arcade_xp_spent, 5);
  assert.equal(wallet.arcade_xp_spendable, wallet.arcade_xp_earned - 5);
  await f.arcade('wallet-second');
  assert.deepEqual(f.sql.prepare('SELECT * FROM arcade_xp_wallets').get(), wallet);
});

test('legacy Arcade processing evidence stays pending for audit without guessed payout', async t => {
  const f = fixture(t);
  f.sql.prepare("INSERT INTO arcade_progression_events(id,telegram_id,client_run_id,game,status,reason) VALUES('legacy',?,'run-one','snake','processing','claim_pending')").run(f.owner);
  const before = f.sql.prepare('SELECT * FROM arcade_progression_events').all();
  const response = await f.arcade(); assert.equal(response.status, 200, JSON.stringify(response));
  assert.equal(response.body.results[0].status, 'pending');
  assert.equal(response.body.results[0].reason, 'legacy_award_requires_audit');
  assert.deepEqual(f.sql.prepare('SELECT * FROM arcade_progression_events').all(), before);
  assert.deepEqual(f.totals(), { account: 0, log: 0, board: 0, receipts: 0 });
});
