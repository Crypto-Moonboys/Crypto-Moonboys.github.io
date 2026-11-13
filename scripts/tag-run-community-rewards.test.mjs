import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import deployedWorker from '../workers/moonboys-api/worker-phase5-final.js';
import {
  TAG_RUN_RANKS, rankFor, weekOf, previousWeek, eligibleTagComment,
  isValidWaxAccount, parseTokenUnits, formatTokenUnits
} from '../workers/moonboys-api/tag-run/core.js';
import {
  isTagRunCommand, isSharedLegacyProfile, handleTagRunCommand, recordTagRunMessage,
  deliverTagRunRankAnnouncements, draftTagRunWeeklyRewards, postTagRunGroupBulletin
} from '../workers/moonboys-api/tag-run/handler.js';

const SCHEMA = readFileSync(
  new URL('../workers/moonboys-api/migrations/103_tag_run_street_cred_rewards.sql', import.meta.url), 'utf8'
);
const MEMBER_BLOCKS = readFileSync(
  new URL('../workers/moonboys-api/migrations/110_tag_run_admin_member_blocks.sql', import.meta.url), 'utf8'
);
const GROUP = '-1001234567890';
const ADMIN = '9000001';
const MEMBER = '9000002';
const MONDAY = Date.parse('2026-11-02T10:00:00.000Z');

function fixture(t, opts = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE telegram_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);
  sqlite.exec(SCHEMA);
  sqlite.exec(MEMBER_BLOCKS);
  const sent = [];
  const pending = [];
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { return sqlite.prepare(this.query).get(...this.args) || null; }
    async all() { return { success: true, results: sqlite.prepare(this.query).all(...this.args) }; }
    async run() {
      // Controlled interleaving at the exact SQL write boundary tests CAS
      // races between live admin commands, not just sequential operations.
      if (typeof DB.beforeRun === 'function') await DB.beforeRun(this);
      // Match Cloudflare D1 meta.changes, which counts writes in AFTER INSERT
      // triggers as well as the direct statement (unlike sqlite.run().changes).
      const before = sqlite.prepare('SELECT total_changes() AS n').get().n;
      sqlite.prepare(this.query).run(...this.args);
      const after = sqlite.prepare('SELECT total_changes() AS n').get().n;
      return { success: true, meta: { changes: after - before } };
    }
  }
  const DB = {
    prepare: sql => new Statement(sql),
    async batch(statements) {
      if (typeof DB.beforeBatch === 'function') await DB.beforeBatch();
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (let i = 0; i < statements.length; i++) {
          results.push(await statements[i].run());
          if (i === 0 && typeof DB.afterPlanInsert === 'function') await DB.afterPlanInsert();
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  const env = {
    DB, TAG_RUN_ENABLED: opts.enabled === false ? 'false' : 'true',
    TAG_RUN_WEEKLY_REWARDS_ENABLED: 'false',
    TELEGRAM_GROUP_CHAT_ID: GROUP, ADMIN_TELEGRAM_IDS: ADMIN,
    TELEGRAM_BOT_TOKEN: '123456:test-bot-token',
    TELEGRAM_BOT_USERNAME: 'WIKICOMSBOT'
  };
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/v1/chain/get_info')) {
      return { ok: true, json: async () => ({
        chain_id: '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4'
      }) };
    }
    if (url.endsWith('/v1/chain/get_account')) {
      const account = JSON.parse(options.body).account_name;
      if (typeof env.beforeWaxDestination === 'function') {
        return env.beforeWaxDestination(account);
      }
      return { ok: true, json: async () => ({ account_name:account }) };
    }
    if (url.includes('get_currency_stats')) {
      const request = JSON.parse(options.body);
      if (typeof env.beforeTokenRpc === 'function') await env.beforeTokenRpc(request);
      return {
        ok: true,
        json: async () => {
          if (request.code === 'kingsofgraff' && request.symbol === 'LFGK') {
            return { LFGK: { max_supply: '1000000000.0000 LFGK' } };
          }
          if (request.code === 'otherissuer' && request.symbol === 'ART') {
            return { ART: { max_supply: '10000000.00 ART' } };
          }
          return {};
        }
      };
    }
    assert.match(url, /\/sendMessage$/);
    sent.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true, result: { message_id: sent.length } }) };
  };
  let updateNumber = 0;
  const message = (text, { user = MEMBER, nowMs = MONDAY, chat = 'group',
    replyTo = null, isBot = false, messageId = null, username = null, ...extra } = {}) => ({
    message: {
      message_id: messageId ?? ++updateNumber,
      date: Math.floor(nowMs / 1000),
      chat: chat === 'private'
        ? { id: Number(user), type: 'private' } :
          { id: Number(GROUP), type: 'supergroup' },
      from: { id: Number(user), first_name: user === ADMIN ? 'Admin' : 'Tagger',
        username: username || (user === ADMIN ? 'admin_owner' :
          user === MEMBER ? 'target_user' : 'member_' + String(user).slice(-20)),
        is_bot: isBot },
      text,
      ...(replyTo ? { reply_to_message: { from: { id: Number(replyTo) } } } : {}),
      ...extra
    }
  });
  const score = async (update, nowMs = MONDAY) =>
    recordTagRunMessage(update, env, { nowMs, cryptoImpl: webcrypto });
  const command = async (cmd, opts = {}) => {
    const update = message(cmd, { ...opts, chat: opts.chat || 'private' });
    const result = await handleTagRunCommand(update, env, {
      nowMs: opts.nowMs ?? MONDAY, fetchImpl
    });
    return { handled: result, answer: sent.at(-1)?.text };
  };
  t.after(() => sqlite.close());
  return { sqlite, DB, env, sent, pending, fetchImpl, message, command, score };
}


test('private admins block and unblock a username without deleting audit history', async t => {
  const f = fixture(t);
  assert.equal(await f.score(f.message(
    'This first meaningful graffiti message records the member identity'
  )), true);
  assert.equal(f.sqlite.prepare(
    'SELECT username FROM telegram_users WHERE telegram_id=?'
  ).get(MEMBER).username, 'target_user');

  const blocked = await f.command('/block @TARGET_USER', { user: ADMIN });
  assert.match(blocked.answer, /TAG RUN MEMBER BLOCKED/);
  assert.equal(f.sqlite.prepare(
    'SELECT blocked FROM tag_run_member_blocks WHERE chat_id=? AND telegram_id=?'
  ).get(GROUP,MEMBER).blocked, 1);

  const whileBlocked = MONDAY + 60000;
  assert.equal(await f.score(f.message(
    'This valid message must earn nothing while the member is blocked',
    { nowMs: whileBlocked }
  ), whileBlocked), false);
  assert.equal(f.sqlite.prepare(
    'SELECT COUNT(*) AS n FROM tag_run_messages WHERE telegram_id=?'
  ).get(MEMBER).n, 1, 'historical receipt remains but no new score is written');
  assert.doesNotMatch((await f.command('/top')).answer, /Tagger/);

  assert.match((await f.command('/block @target_user')).answer,
    /authorised admins/, 'members cannot change block state');
  assert.match((await f.command('/block @target_user',
    { user: ADMIN, chat: 'group' })).answer, /authorised admins/,
    'admin controls stay private');
  assert.match((await f.command('/block @unknown_user',
    { user: ADMIN })).answer, /must have been seen|not.*known/i);

  const unblocked = await f.command('/unblock @target_user', { user: ADMIN });
  assert.match(unblocked.answer, /TAG RUN MEMBER UNBLOCKED/);
  const afterUnblock = MONDAY + 120000;
  assert.equal(await f.score(f.message(
    'Future Street Cred returns after the private admin unblocks the member',
    { nowMs: afterUnblock }
  ), afterUnblock), true);
  assert.equal(f.sqlite.prepare(
    'SELECT COUNT(*) AS n FROM tag_run_messages WHERE telegram_id=?'
  ).get(MEMBER).n, 2);
});


test('deployment is fail-closed and webhook secret validation precedes TAG RUN ingress', async t => {
  const f = fixture(t, { enabled: false });
  const ignored = f.message('/top');
  assert.equal(isTagRunCommand(ignored, f.env), false);
  assert.equal(await f.score(f.message('A thoughtful message about the crew')),
    false, 'TAG RUN must not write when disabled');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_messages').get().n, 0);
  assert.equal((await draftTagRunWeeklyRewards(f.env)).status, 'disabled');

  const wrapper = readFileSync(new URL('../workers/moonboys-api/worker-phase5-final.js',
    import.meta.url), 'utf8');
  const wrangler = readFileSync(new URL('../workers/moonboys-api/wrangler.toml',
    import.meta.url), 'utf8');
  const verify = wrapper.indexOf('await verifyTelegramWebhookSecret(request, env)');
  const parse = wrapper.indexOf('await readJsonSafe(request)');
  const command = wrapper.indexOf('isTagRunCommand(body, env)');
  assert(verify > 0 && verify < parse && parse < command,
    'webhook authentication must precede JSON parsing and TAG RUN handling');
  assert.match(wrapper, /recordTagRunMessage\(body, env\)/);
  assert.match(wrapper, /draftTagRunWeeklyRewards\(env\)/);
  assert.match(wrangler, /TAG_RUN_ENABLED = "true"/);
  assert.match(wrangler, /TAG_RUN_WEEKLY_REWARDS_ENABLED = "false"/);
  const migration = SCHEMA;
  assert.match(migration, /CHECK\(status = 'review_only'\)/);
  assert.doesNotMatch(migration, /private_key|wax_secret|transact\(|onchain_transfer/i);
});

test('rank ladder matches all 29 approved thresholds and preserves UTC Monday weeks', () => {
  assert.equal(TAG_RUN_RANKS.length, 29);
  assert.deepEqual(TAG_RUN_RANKS[0], [0, 'Newbie Tagger']);
  assert.deepEqual(TAG_RUN_RANKS.at(-1), [95000, 'Graffiti King']);
  assert.equal(rankFor(24).name, 'Newbie Tagger');
  assert.equal(rankFor(25).name, 'Fresh Ink');
  assert.equal(rankFor(94999).name, 'Graffiti Legend');
  assert.equal(rankFor(95000).name, 'Graffiti King');
  assert.equal(weekOf(Date.parse('2026-11-08T23:59:59Z')), '2026-11-02');
  assert.equal(weekOf(Date.parse('2026-11-09T00:00:00Z')), '2026-11-09');
  assert.equal(previousWeek(Date.parse('2026-11-09T00:00:00Z')), '2026-11-02');
  assert.equal(isValidWaxAccount('abcde.wam'), true);
  assert.equal(isValidWaxAccount('rXRPabcdef'), false);
  assert.equal(parseTokenUnits('10.25', 4), 102500);
  assert.equal(parseTokenUnits('10.12345', 4), null);
  assert.equal(formatTokenUnits(102500, 4), '10.2500');
});

test('meaningful group posts earn at most once, ignore bots, spam, replays and private chat', async t => {
  const f = fixture(t);
  assert.equal(eligibleTagComment({ message_id: 1, text: 'hi', from: { id: 1 } }), null);
  assert.equal(await f.score(f.message('This art has amazing movement in the background')), true);
  // Advance BOTH the Telegram message timestamp and scoring clock. The
  // 45-second cooldown has expired; only duplicate-content protection applies.
  const duplicateTime = MONDAY + 50000;
  assert.equal(await f.score(f.message('This art has amazing movement in the background',
    { nowMs: duplicateTime }), duplicateTime), false,
    'duplicate content remains blocked after the cooldown has expired');
  const original = f.message('Different fresh comment about the graffiti wall', { nowMs: MONDAY + 100000 });
  assert.equal(await f.score(original, MONDAY + 100000), true);
  assert.equal(await f.score(original, MONDAY + 100000), false, 'same Telegram message is deduplicated');
  assert.equal(await f.score(f.message('Another original response about drawing characters',
    { nowMs: MONDAY + 110000 }), MONDAY + 110000), false, '45 second cooldown');
  assert.equal(await f.score(f.message('Bots should not count as human chat messages',
    { nowMs: MONDAY + 170000, isBot: true }), MONDAY + 170000), false);
  assert.equal(await f.score(f.message('Forwarded stories should not be counted here',
    { nowMs: MONDAY + 220000, forward_origin: { type: 'user' } }), MONDAY + 220000), false);
  assert.equal(await f.score(f.message('Private chats do not count toward chat rank',
    { nowMs: MONDAY + 300000, chat: 'private' }), MONDAY + 300000), false);
  const totals = f.sqlite.prepare('SELECT SUM(points) AS points, COUNT(*) AS posts FROM tag_run_messages').get();
  assert.equal(totals.points, 20);
  assert.equal(totals.posts, 2);
  const lifetime = f.sqlite.prepare('SELECT score,posts FROM tag_run_member_totals').get();
  assert.equal(lifetime.score, 20);
  assert.equal(lifetime.posts, 2);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM tag_run_messages WHERE content_hash LIKE ?').get('%art%').count, 0,
    'raw message text must never be saved');
});

test('missing D1 binding is a retryable scoring failure, not a skipped eligible message', async t => {
  const f = fixture(t);
  delete f.env.DB;
  await assert.rejects(
    () => f.score(f.message('This legitimate long message must retain its point eligibility')),
    /tag_run_database_unavailable/
  );
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_messages').get().n, 0);
});

test('signed Telegram webhook returns retryable 503 on D1 scoring write failure', async () => {
  const secret = 'fixture-tag-run-webhook-secret_0123456789';
  const sent = [];
  const nowSec = Math.floor(Date.now() / 1000);
  const groupUpdate = {
    update_id: 177001,
    message: {
      message_id: 377001, date: nowSec,
      chat: { id: Number(GROUP), type: 'supergroup' },
      from: { id: Number(MEMBER), first_name: 'Tagger' },
      text: 'A legitimate original graffiti discussion should never lose points'
    }
  };
  const dbQueries = [];
  const env = {
    TAG_RUN_ENABLED: 'true', TELEGRAM_WEBHOOK_SECRET: secret,
    TELEGRAM_GROUP_CHAT_ID: GROUP, TELEGRAM_BOT_USERNAME: 'WIKICOMSBOT',
    DB: {
      prepare(sql) {
        dbQueries.push(sql);
        if (sql.includes('INSERT INTO telegram_users')) {
          return { bind() { return { async run() {
            return { success:true, meta:{ changes:1 } };
          } }; } };
        }
        if (!sql.includes('INSERT OR IGNORE INTO tag_run_messages')) {
          throw Error('unrelated database route executed after failed scoring');
        }
        return {
          bind() {
            return { async run() { throw Error('D1 temporarily unavailable'); } };
          }
        };
      }
    }
  };
  const request = new Request('https://moonboys-api.test/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': secret
    },
    body: JSON.stringify(groupUpdate)
  });
  const response = await deployedWorker.fetch(request, env, {
    waitUntil(task) { sent.push(task); }
  });
  assert.equal(response.status, 503, 'Telegram must be allowed to retry a failed scoring write');
  assert.equal(response.headers.get('Retry-After'), '5');
  assert.deepEqual(await response.json(), { error: 'tag_run_scoring_unavailable' });
  assert.equal(dbQueries.filter(sql => sql.includes('INSERT OR IGNORE INTO tag_run_messages')).length, 1);
  assert.equal(sent.length, 0, 'no celebration is queued when scoring never persisted');
});

test('rank thresholds in SQL match the 29 names in the runtime ladder', async t => {
  const f = fixture(t);
  const rows = f.sqlite.prepare('SELECT threshold,name FROM tag_run_rank_levels ' +
    'ORDER BY threshold ASC').all();
  assert.deepEqual(rows.map(row => [row.threshold, row.name]), TAG_RUN_RANKS);
});

test('rank-ups are atomic, celebrated once in the group and never replayed', async t => {
  const f = fixture(t);
  for (let i = 0; i < 6; i++) {
    const now = MONDAY + i * 50000;
    const update = f.message('Meaningful street culture discussion number ' + i + ' about our art',
      { nowMs: now });
    assert.equal(await f.score(update, now), true);
  }
  const totals = f.sqlite.prepare('SELECT score,posts FROM tag_run_member_totals ' +
    'WHERE telegram_id=?').get(MEMBER);
  assert.equal(totals.score, 60);
  assert.equal(totals.posts, 6);
  const outbox = () => f.sqlite.prepare('SELECT rank_threshold,rank_name,total_points,' +
    'status,attempt_count FROM tag_run_rank_announcements ORDER BY rank_threshold').all();
  assert.deepEqual(outbox().map(row => row.rank_threshold), [25,60]);
  assert.equal(outbox()[0].total_points, 30, 'rank crossing recorded at award time');
  assert.equal(outbox()[1].rank_name, 'Sticker Bandit');

  const [first, second] = await Promise.all([
    deliverTagRunRankAnnouncements(f.env, { fetchImpl: f.fetchImpl }),
    deliverTagRunRankAnnouncements(f.env, { fetchImpl: f.fetchImpl })
  ]);
  assert.equal(first.sent + second.sent, 2, 'concurrent consumers must claim each notice once');
  assert.equal(f.sent.length, 2);
  assert.deepEqual(f.sent.map(payload => payload.chat_id), [GROUP,GROUP]);
  assert.match(f.sent[0].text, /TAG RUN · RANK UP/);
  assert.match(f.sent[0].text, /Fresh Ink/);
  assert.match(f.sent[0].text, /Next rank at 60 pts/);
  assert.match(f.sent[1].text, /Sticker Bandit/);
  assert.match(f.sent[1].text, /Next rank at 100 pts/);
  assert(outbox().every(row => row.status === 'sent' && row.attempt_count === 1));
  assert.equal((await deliverTagRunRankAnnouncements(f.env,
    { fetchImpl: f.fetchImpl })).sent, 0, 'replayed cron never posts an old rank again');
  assert.equal(f.sent.length, 2);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_rank_announcements').get().n,
    2, 'rank 0 never produces a celebration');

  assert.match((await f.command('/tagalerts', { user: ADMIN })).answer,
    /No pending or uncertain celebrations/);
  assert.match((await f.command('/tagalerts')).answer,
    /authorised admins/, 'members cannot see admin delivery information');
});

test('uncertain Telegram delivery stays marked for admin review, never auto-retries', async t => {
  const f = fixture(t);
  for (let i = 0; i < 3; i++) {
    const now = MONDAY + i * 50000;
    await f.score(f.message('Talking about authentic graffiti art number ' + i,
      { nowMs: now }), now);
  }
  const failure = await deliverTagRunRankAnnouncements(f.env, {
    fetchImpl: async () => ({ ok: false, status: 429 })
  });
  assert.equal(failure.needsReview, 1);
  const row = f.sqlite.prepare('SELECT status,attempt_count FROM tag_run_rank_announcements').get();
  assert.equal(row.status, 'needs_review');
  assert.equal(row.attempt_count, 1);
  const again = await deliverTagRunRankAnnouncements(f.env, { fetchImpl: f.fetchImpl });
  assert.equal(again.sent, 0);
  assert.equal(f.sent.length, 0);
  assert.match((await f.command('/tagalerts', { user: ADMIN })).answer, /needs_review/);
});

test('daily limit 30, replies and first-next-day streak bonus accrue server side', async t => {
  const f = fixture(t);
  for (let i = 0; i < 35; i++) {
    const now = MONDAY + i * 50000;
    await f.score(f.message('Detailed graffiti idea number ' + i + ' from the art crew',
      { nowMs: now }), now);
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM tag_run_messages WHERE day_key=?').get('2026-11-02').n, 30);
  const nextDay = MONDAY + 24 * 3600000;
  const post = f.message('Responding with useful input to another crew member',
    { nowMs: nextDay, replyTo: ADMIN });
  assert.equal(await f.score(post,nextDay), true);
  const earned = f.sqlite.prepare('SELECT points FROM tag_run_messages WHERE message_id=?')
    .get(post.message.message_id);
  assert.equal(earned.points, 10 + 2 + 5);
  assert.equal(f.sqlite.prepare('SELECT SUM(points) n FROM tag_run_messages').get().n, 317);
  const lateSunday = Date.parse('2026-11-08T23:59:59Z');
  const earlyMonday = Date.parse('2026-11-09T00:00:01Z');
  assert.equal(await f.score(f.message('Long message sent just before the weekly cutover',
    { nowMs: lateSunday }), earlyMonday), false,
    'delivered-after-midnight message must not be misattributed to another UTC week');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM tag_run_messages WHERE week_key='2026-11-09'").get().n, 0);
});


test('D1 trigger-inclusive change counts still credit messages and enable immediate promotion delivery', async t => {
  const f = fixture(t);
  const first = f.message('An original discussion of the artwork with the whole group');
  assert.equal(await f.score(first), true, 'a qualifying first message has trigger changes >1');
  const tally = f.sqlite.prepare('SELECT score,posts FROM tag_run_member_totals').get();
  assert.equal(tally.score, 10);
  assert.equal(tally.posts, 1);
  assert.equal(await f.score(first), false, 'replayed message has zero changes');

  const second = f.message('Another meaningful post about the creative street art scene',
    { nowMs: MONDAY + 60000 });
  assert.equal(await f.score(second, MONDAY + 60000), true);
  const third = f.message('Third unique response about the texture and graffiti mural',
    { nowMs: MONDAY + 120000 });
  assert.equal(await f.score(third, MONDAY + 120000), true,
    'rank-up receipt and member totals triggers must not make acceptance false');
  const rank = f.sqlite.prepare('SELECT rank_name,status FROM tag_run_rank_announcements').get();
  assert.equal(rank.rank_name, 'Fresh Ink');
  assert.equal(rank.status, 'pending');
  const delivery = await deliverTagRunRankAnnouncements(f.env, { fetchImpl: f.fetchImpl });
  assert.equal(delivery.sent, 1, 'new rank is announced on immediate drain, not only cron');
  assert.match(f.sent.at(-1).text, /Fresh Ink/);
});

test('cooldown uses member day index, including messages crossing UTC midnight', async t => {
  const f = fixture(t);
  const prior = Date.parse('2026-11-08T23:59:50Z');
  const next = Date.parse('2026-11-09T00:00:10Z');
  assert.equal(await f.score(f.message('Sunday nighttime original graffiti drawing ideas',
    { nowMs: prior }),prior),true);
  assert.equal(await f.score(f.message('Monday morning original new sticker artwork suggestions',
    { nowMs: next }),next),false,
    'new UTC day must still enforce cooldown from the previous day');
  const later = Date.parse('2026-11-09T00:00:41Z');
  assert.equal(await f.score(f.message('Monday next contribution about more street graphics',
    { nowMs: later }),later),true);
  const rows=f.sqlite.prepare('SELECT day_key,week_key,points FROM tag_run_messages ' +
    'ORDER BY message_unix').all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].week_key, '2026-11-02');
  assert.equal(rows[1].week_key, '2026-11-09');
  assert.equal(rows[1].points, 15, 'previous-day streak bonus is retained');
  const manager=readFileSync(new URL('../workers/moonboys-api/tag-run/handler.js',
    import.meta.url),'utf8');
  assert.match(manager, /day_key>=\? AND message_unix>\?/);
  const plan=f.sqlite.prepare(
    'EXPLAIN QUERY PLAN SELECT 1 FROM tag_run_messages ' +
    'WHERE chat_id=? AND telegram_id=? AND day_key>=? AND message_unix>?'
  ).all(GROUP,MEMBER,'2026-11-08',Math.floor(prior/1000));
  assert.ok(plan.some(row => /tag_run_messages_member_day/.test(row.detail)),
    'cooldown query should use bounded member-day index rather than lifetime scan');
});

test('commands are verified-group/private only and rain registers WAX payout destinations', async t => {
  const f = fixture(t);
  assert.equal(isTagRunCommand(f.message('/profile', { chat: 'group' }), f.env), true);
  assert.equal(isTagRunCommand(f.message('/profile', { chat: 'private' }), f.env), true);
  assert.equal(isSharedLegacyProfile(f.message('/profile', { chat: 'private' }), f.env), true);
  for (const legacy of ['/PROFILE', '/profile extra', '/PROFILE detailed stats',
    '/profile@WIKICOMSBOT extra', '/PROFILE@wikicomsbot Something Else']) {
    assert.equal(isSharedLegacyProfile(f.message(legacy, { chat: 'private' }), f.env),
      true, legacy + ' must preserve original profile routing');
  }
  assert.equal(isSharedLegacyProfile(f.message('/profile@OTHERBOT extra', { chat: 'private' }),
    f.env), false, 'other bots are not intercepted');
  assert.equal(isSharedLegacyProfile(f.message('/tagprofile', { chat: 'private' }), f.env), false);
  assert.equal(isTagRunCommand(f.message('/tagprofile', { chat: 'group' }), f.env), true);
  assert.equal(isTagRunCommand(f.message('/daily'), f.env), false);
  assert.equal(isTagRunCommand(f.message('/help', { chat: 'private' }), f.env), false);
  const outsider = f.message('/profile', { chat: 'group' });
  outsider.message.chat.id = -1009999999999;
  assert.equal(isTagRunCommand(outsider, f.env), false, 'other groups cannot use TAG RUN');
  const groupRain = await f.command('/rain abcde.wam', { chat: 'group' });
  assert.match(groupRain.answer, /DM @/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_wallets').get().n, 0,
    'group commands may not register a payout account');
  const rain = await f.command('/rain abcde.wam');
  assert.equal(rain.handled, true);
  assert.match(rain.answer, /payout destination REGISTERED/);
  const wallet = f.sqlite.prepare('SELECT * FROM tag_run_wallets WHERE telegram_id=?').get(MEMBER);
  assert.equal(wallet.wax_account, 'abcde.wam');
  assert.equal(wallet.verification_status, 'pending');
  assert.match((await f.command('/rain rXRPabcdef')).answer, /Usage/);
  const status = await f.command('/rainstatus');
  assert.match(status.answer, /REGISTERED — WAX mainnet account confirmed/);
  assert.match(status.answer, /FUNDED PAYOUTS DISABLED/);
  const groupStatus = await f.command('/rainstatus',{chat:'group'});
  assert.match(groupStatus.answer,/Wallet details are private/);
  assert.doesNotMatch(groupStatus.answer,/abcde\.wam/);
  const failedDestination = f.sqlite.prepare('SELECT wax_account FROM tag_run_wallets ' +
    'WHERE telegram_id=?').get(MEMBER).wax_account;
  f.env.beforeWaxDestination = async () => ({ok:false,status:503});
  const unavailable = await f.command('/rain nonexist1234');
  assert.match(unavailable.answer,/registration was NOT changed/);
  assert.equal(f.sqlite.prepare('SELECT wax_account FROM tag_run_wallets ' +
    'WHERE telegram_id=?').get(MEMBER).wax_account,failedDestination);
  delete f.env.beforeWaxDestination;
  const privateProfile = await f.command('/profile');
  assert.match(privateProfile.answer, /Newbie Tagger/);
  assert.match(privateProfile.answer, /abcde\.wam/, 'member can inspect own registered WAX account privately');
  const groupProfile = await f.command('/profile', { chat: 'group' });
  assert.match(groupProfile.answer, /destination registered/);
  assert.doesNotMatch(groupProfile.answer, /abcde\.wam/, 'group profile must not reveal the WAX account');
  const ranks = await f.command('/ranks', { chat: 'group' });
  assert.match(ranks.answer, /0 — Newbie Tagger/);
  assert.match(ranks.answer, /95,000 — Graffiti King/);
});

test('overlapping /rain requests never let slower earlier validation replace newer account',async t=>{
  const f=fixture(t);
  let signalOlderStarted;
  const olderStarted=new Promise(resolve=>{ signalOlderStarted=resolve; });
  let resumeOlder;
  const blockOlder=new Promise(resolve=>{ resumeOlder=resolve; });
  f.env.beforeWaxDestination=async account=>{
    if(account==='olderaccount'){
      signalOlderStarted();
      await blockOlder;
    }
    return {ok:true,json:async()=>({account_name:account})};
  };
  const oldRequest=f.command('/rain olderaccount');
  await olderStarted;
  const newer=await f.command('/rain neweraccount');
  assert.match(newer.answer,/payout destination REGISTERED: neweraccount/);
  resumeOlder();
  const stale=await oldRequest;
  assert.match(stale.answer,/older \/rain request was ignored/);
  const row=f.sqlite.prepare('SELECT wax_account,registered_at FROM tag_run_wallets '+
    'WHERE telegram_id=?').get(MEMBER);
  assert.equal(row.wax_account,'neweraccount');
  assert.match(row.registered_at,/^2026-11-02 10:00:00\.[0-9]{15}$/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_wallets').get().n,1);
});

test('admin alone changes chain-verified token, weekly amounts and multipliers; draft is review-only', async t => {
  const f = fixture(t);
  assert.match((await f.command('/tagtoken LFGK kingsofgraff')).answer, /authorised admins/);
  assert.match((await f.command('/tagtoken LFGK kingsofgraff', { user: ADMIN })).answer,
    /Verified on WAX/);
  const cfg = () => f.sqlite.prepare('SELECT * FROM tag_run_reward_config').get();
  assert.equal(cfg().token_precision, 4);
  assert.equal(cfg().enabled, 0);
  assert.match((await f.command('/tagamount 10 1000', { user: ADMIN })).answer, /Weekly base set/);
  assert.equal(cfg().base_amount_units, 100000);
  assert.equal(cfg().max_weekly_units, 10000000);
  assert.match((await f.command('/tagenable', { user: ADMIN })).answer, /drafts require separate approval/);
  assert.equal(cfg().enabled, 1);
  for (let i = 0; i < 4; i++) {
    const user = String(8000000 + i);
    const time = MONDAY + i * 50000;
    await f.score(f.message('New contribution to street art number ' + i + ' from the crew',
      { user, nowMs: time }), time);
  }
  const before = await draftTagRunWeeklyRewards(f.env, {
    nowMs: Date.parse('2026-11-09T00:05:00Z')
  });
  assert.equal(before.status, 'disabled', 'cron flag is independently required');
  f.env.TAG_RUN_WEEKLY_REWARDS_ENABLED = 'true';
  const draft = await draftTagRunWeeklyRewards(f.env, {
    nowMs: Date.parse('2026-11-09T00:05:00Z')
  });
  assert.equal(draft.status, 'review_only');
  assert.equal(draft.recipientCount, 4);
  const row = f.sqlite.prepare('SELECT * FROM tag_run_weekly_plans').get();
  assert.equal(row.token_symbol, 'LFGK');
  assert.equal(row.planned_units, 1100000); // 5+3+2+1 times 10 tokens
  assert.equal(row.status, 'review_only');
  const allocations = f.sqlite.prepare('SELECT * FROM tag_run_weekly_allocations ORDER BY rank_position').all();
  assert.deepEqual(allocations.map(x=>x.amount_units), [500000, 300000, 200000, 100000]);
  assert(allocations.every(x=>x.status==='review_only'));
  assert(allocations.every(x=>x.wallet_verification_status==='pending'));
  assert.equal((await draftTagRunWeeklyRewards(f.env,
    { nowMs: Date.parse('2026-11-09T00:10:00Z') })).status, 'already_drafted');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM tag_run_weekly_allocations').get().n, 4);
  assert.match((await f.command('/rewards')).answer, /No tokens transfer automatically/);
  const preview = await f.command('/tagplan', {
    user: ADMIN, nowMs: Date.parse('2026-11-09T01:00:00Z')
  });
  assert.match(preview.answer, /REVIEW DRAFT/);
  assert.match(preview.answer, /110\.0000 LFGK/);
  assert.match(preview.answer, /NO transfers/);
  const invalidWeek = await f.command('/tagplan 2026-13-01', { user: ADMIN });
  assert.match(invalidWeek.answer, /Usage: \/tagplan/, 'invalid dates receive helpful usage rather than a generic failure');
});

test('reward schema keeps a monotonic admin revision in migration 103 and canonical bootstrap', () => {
  const source = readFileSync(new URL('../workers/moonboys-api/schema.sql',
    import.meta.url), 'utf8');
  const revision = /revision INTEGER NOT NULL DEFAULT 0 CHECK\(revision >= 0\)/;
  assert.match(SCHEMA, revision);
  assert.match(source, revision);
  assert.match(SCHEMA, /CREATE TABLE IF NOT EXISTS tag_run_reward_config/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS tag_run_reward_config/);
});

test('admin mutations bump revision and a repeated disable invalidates pending enables', async t => {
  const f = fixture(t);
  const cfg = () => f.sqlite.prepare('SELECT * FROM tag_run_reward_config WHERE chat_id=?')
    .get(GROUP);
  assert.match((await f.command('/tagbonus 5 3 2', { user: ADMIN })).answer,
    /Top-three multipliers updated/);
  assert.equal(cfg().revision,1,'bonus-only setup creates the initial config');
  assert.match((await f.command('/tagtoken LFGK kingsofgraff', { user: ADMIN })).answer,
    /Verified on WAX/);
  assert.equal(cfg().revision,2);
  assert.equal(cfg().enabled,0);
  assert.match((await f.command('/tagamount 10 1000', { user: ADMIN })).answer,
    /Weekly base set/);
  assert.equal(cfg().revision,3);
  assert.match((await f.command('/tagenable', { user: ADMIN })).answer,
    /drafts require separate approval/);
  assert.equal(cfg().revision,4);
  assert.equal(cfg().enabled,1);
  assert.match((await f.command('/tagdisable', { user: ADMIN })).answer,/disabled/);
  assert.equal(cfg().revision,5);
  assert.equal(cfg().enabled,0);
  assert.match((await f.command('/tagdisable', { user: ADMIN })).answer,/disabled/);
  assert.equal(cfg().revision,6,
    'repeated disable must advance revision even when already disabled');
  assert.equal(cfg().enabled,0);
});

test('stale /tagamount cannot apply old precision after /tagtoken changes WAX token', async t => {
  const f = fixture(t);
  const cfg = () => f.sqlite.prepare('SELECT * FROM tag_run_reward_config').get();
  await f.command('/tagtoken LFGK kingsofgraff', { user: ADMIN });
  f.DB.beforeRun = async statement => {
    if (!statement.query.startsWith('UPDATE tag_run_reward_config SET base_amount_units=')) return;
    f.DB.beforeRun = null;
    const change = await f.command('/tagtoken ART otherissuer', { user: ADMIN });
    assert.match(change.answer, /Verified on WAX/);
  };
  const result = await f.command('/tagamount 10 1000', { user: ADMIN });
  assert.match(result.answer,/No amounts changed/);
  assert.equal(cfg().token_symbol,'ART');
  assert.equal(cfg().token_contract,'otherissuer');
  assert.equal(cfg().token_precision,2);
  assert.equal(cfg().base_amount_units,0,
    'no 4-decimal LFGK quantities may be committed to 2-decimal ART');
  assert.equal(cfg().max_weekly_units,0);
  assert.equal(cfg().enabled,0);
  assert.equal(cfg().revision,2);
});

for (const concurrent of ['tagdisable', 'tagamount', 'tagbonus', 'tagtoken']) {
  test('pending /tagenable cannot override later admin /' + concurrent, async t => {
    const f = fixture(t);
    const cfg = () => f.sqlite.prepare('SELECT * FROM tag_run_reward_config').get();
    await f.command('/tagtoken LFGK kingsofgraff', { user: ADMIN });
    await f.command('/tagamount 10 1000', { user: ADMIN });
    assert.equal(cfg().enabled,0);
    f.DB.beforeRun = async statement => {
      if (!statement.query.startsWith('UPDATE tag_run_reward_config SET enabled=1')) return;
      f.DB.beforeRun = null;
      const command = concurrent === 'tagdisable' ? '/tagdisable'
        : concurrent === 'tagamount' ? '/tagamount 12 2000'
        : concurrent === 'tagbonus' ? '/tagbonus 4 2 1'
        : '/tagtoken ART otherissuer';
      const result = await f.command(command, { user: ADMIN });
      assert.doesNotMatch(result.answer,/No changes made/);
    };
    const response = await f.command('/tagenable', { user: ADMIN });
    assert.match(response.answer,/NOT enabled/);
    assert.equal(cfg().enabled,0,
      'out-of-date enable must not undo a later config change');
    if (concurrent === 'tagtoken') {
      assert.equal(cfg().token_symbol,'ART');
      assert.equal(cfg().base_amount_units,0);
    } else if (concurrent === 'tagamount') {
      assert.equal(cfg().base_amount_units,120000);
    } else if (concurrent === 'tagbonus') {
      assert.equal(cfg().top1_multiplier,4);
    }
  });
}

test('slow /tagtoken RPC cannot undo a newer disable command', async t => {
  const f = fixture(t);
  const cfg = () => f.sqlite.prepare('SELECT * FROM tag_run_reward_config').get();
  await f.command('/tagtoken LFGK kingsofgraff', { user: ADMIN });
  await f.command('/tagamount 10 1000', { user: ADMIN });
  await f.command('/tagenable', { user: ADMIN });
  assert.equal(cfg().enabled,1);
  f.env.beforeTokenRpc = async () => {
    f.env.beforeTokenRpc = null;
    const disabled = await f.command('/tagdisable', { user: ADMIN });
    assert.match(disabled.answer,/disabled/);
  };
  const result = await f.command('/tagtoken ART otherissuer', { user: ADMIN });
  assert.match(result.answer,/No changes made/);
  assert.equal(cfg().token_symbol,'LFGK','delayed external verification cannot overwrite newer admin state');
  assert.equal(cfg().token_precision,4);
  assert.equal(cfg().base_amount_units,100000);
  assert.equal(cfg().enabled,0);
});

test('late /tagbonus cannot overwrite newer token or disable changes', async t => {
  const f = fixture(t);
  const cfg = () => f.sqlite.prepare('SELECT * FROM tag_run_reward_config').get();
  await f.command('/tagtoken LFGK kingsofgraff', { user: ADMIN });
  f.DB.beforeRun = async statement => {
    if (!statement.query.startsWith('UPDATE tag_run_reward_config SET top1_multiplier=')) return;
    f.DB.beforeRun = null;
    await f.command('/tagtoken ART otherissuer', { user: ADMIN });
  };
  const result = await f.command('/tagbonus 4 2 1', { user: ADMIN });
  assert.match(result.answer,/No changes made/);
  assert.equal(cfg().token_symbol,'ART');
  assert.equal(cfg().top1_multiplier,5,
    'stale bonus command must not overwrite the current token config');
});

test('slow first /tagtoken RPC cannot override a disable that creates the config row', async t => {
  const f = fixture(t);
  const cfg = () => f.sqlite.prepare('SELECT * FROM tag_run_reward_config').get();
  f.env.beforeTokenRpc = async () => {
    f.env.beforeTokenRpc = null;
    await f.command('/tagdisable',{ user: ADMIN });
  };
  const result = await f.command('/tagtoken LFGK kingsofgraff', { user: ADMIN });
  assert.match(result.answer,/No changes made/);
  assert.equal(cfg().token_precision,null);
  assert.equal(cfg().revision,1);
  assert.equal(cfg().enabled,0);
});

test('weekly leaderboard uses latest member display name, not lexicographic MAX', async t => {
  const f = fixture(t);
  const user = '8888999';
  for (const [i, name] of ['Zoe', 'Alex'].entries()) {
    const nowMs = MONDAY + i * 60000;
    const update = f.message('A distinct thoughtful idea about the graffiti image ' + i,
      { user, nowMs });
    update.message.from.first_name = name;
    assert.equal(await f.score(update, nowMs), true);
  }
  const board = await f.command('/top', { chat: 'group', nowMs: MONDAY + 120000 });
  assert.match(board.answer, /Alex — 20 pts/);
  assert.doesNotMatch(board.answer, /Zoe/, 'the previous name must not appear in weekly results');
  const allTime = await f.command('/top all', { chat: 'group', nowMs: MONDAY + 120000 });
  assert.match(allTime.answer, /Alex — 20 pts/);
});

test('weekly /top rank labels use all-time Street Cred and reward tie-break matches displayed order', async t => {
  const f = fixture(t);
  f.sqlite.prepare('INSERT INTO tag_run_reward_config ' +
    '(chat_id,token_symbol,token_contract,token_precision,base_amount_units,' +
    'max_weekly_units,enabled) VALUES (?,?,?,?,?,?,1)')
    .run(GROUP, 'LFGK', 'kingsofgraff', 4, 100000, 10000000);
  const morePostsId = '8000009'; // Larger ID deliberately sorts last on ID alone.
  const fewerPostsId = '7000001';
  for (let i = 0; i < 6; i++) {
    const nowMs = MONDAY + (i * 60000);
    const update = f.message('Six unique original comments about street art number ' + i,
      { user: morePostsId, nowMs });
    update.message.from.first_name = 'MorePosts';
    assert.equal(await f.score(update, nowMs), true);
  }
  for (let i = 0; i < 5; i++) {
    const nowMs = MONDAY + (i * 60000);
    const update = f.message('Five thoughtful replies with extra street art info ' + i,
      { user: fewerPostsId, nowMs, replyTo: ADMIN });
    update.message.from.first_name = 'FewerPosts';
    assert.equal(await f.score(update, nowMs), true);
  }
  const board = await f.command('/top', { nowMs: MONDAY + 700000 });
  assert(board.answer.indexOf('1. MorePosts') < board.answer.indexOf('2. FewerPosts'));
  // The rank shown beside weekly points must come from lifetime Street Cred.
  f.sqlite.prepare('UPDATE tag_run_member_totals SET score=95000 WHERE telegram_id=?')
    .run(morePostsId);
  const promotedBoard = await f.command('/top', { nowMs: MONDAY + 700000 });
  assert.match(promotedBoard.answer, /MorePosts — 60 pts · Graffiti King/);
  f.env.TAG_RUN_WEEKLY_REWARDS_ENABLED = 'true';
  const drafted = await draftTagRunWeeklyRewards(f.env, { nowMs: Date.parse('2026-11-09T00:05:00Z') });
  assert.equal(drafted.status, 'review_only');
  const allocations = f.sqlite.prepare('SELECT telegram_id,rank_position,amount_units ' +
    'FROM tag_run_weekly_allocations ORDER BY rank_position').all();
  assert.deepEqual(allocations.map(x=>x.telegram_id), [morePostsId,fewerPostsId]);
  assert.deepEqual(allocations.map(x=>x.amount_units), [500000,300000]);
});

for (const [label, mutate] of [
  ['disable', (f) => f.sqlite.prepare(
    'UPDATE tag_run_reward_config SET enabled=0 WHERE chat_id=?').run(GROUP)],
  ['token replacement', async f => {
    const change = await f.command('/tagtoken LFGK kingsofgraff', { user: ADMIN });
    assert.match(change.answer, /Verified on WAX/);
  }],
  ['amount replacement', async f => {
    const change = await f.command('/tagamount 12 1000', { user: ADMIN });
    assert.match(change.answer, /Weekly base set/);
  }],
  ['bonus replacement', async f => {
    const change = await f.command('/tagbonus 4 2 1', { user: ADMIN });
    assert.match(change.answer, /Top-three multipliers updated/);
  }],
]) {
  test('weekly plan cannot freeze stale settings after admin ' + label, async t => {
    const f = fixture(t);
    f.sqlite.prepare('INSERT INTO tag_run_reward_config ' +
      '(chat_id,token_symbol,token_contract,token_precision,base_amount_units,' +
      'max_weekly_units,enabled) VALUES (?,?,?,?,?,?,1)')
      .run(GROUP,'LFGK','kingsofgraff',4,100000,10000000);
    assert.equal(await f.score(f.message('A real contribution to the art community')), true);
    f.DB.beforeBatch = async () => { f.DB.beforeBatch = null; await mutate(f); };
    f.env.TAG_RUN_WEEKLY_REWARDS_ENABLED='true';
    const draft = await draftTagRunWeeklyRewards(f.env,
      { nowMs: Date.parse('2026-11-09T00:05:00Z') });
    assert.equal(draft.status, 'not_configured');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_weekly_plans').get().n,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_weekly_allocations').get().n,0);
  });
}

test('weekly draft reads live token, budget and multipliers from same SQL statement', async t => {
  const f = fixture(t);
  f.sqlite.prepare('INSERT INTO tag_run_reward_config ' +
    '(chat_id,token_symbol,token_contract,token_precision,base_amount_units,' +
    'max_weekly_units,enabled) VALUES (?,?,?,?,?,?,1)')
    .run(GROUP,'LFGK','kingsofgraff',4,100000,10000000);
  assert.equal(await f.score(f.message('One active member discussing graffiti style')),true);
  f.DB.beforeBatch = async () => {
    f.DB.beforeBatch=null;
    f.sqlite.prepare('UPDATE tag_run_reward_config SET token_symbol=?,token_contract=?,' +
      'token_precision=?,base_amount_units=?,max_weekly_units=?,top1_multiplier=?,' +
      'top2_multiplier=?,top3_multiplier=?,enabled=1 WHERE chat_id=?')
      .run('NEW','othercontract',2,200,1000000,2,1,1,GROUP);
  };
  f.env.TAG_RUN_WEEKLY_REWARDS_ENABLED='true';
  const draft = await draftTagRunWeeklyRewards(f.env,
    { nowMs: Date.parse('2026-11-09T00:05:00Z') });
  assert.equal(draft.status,'review_only');
  const plan=f.sqlite.prepare('SELECT * FROM tag_run_weekly_plans').get();
  const allocation=f.sqlite.prepare('SELECT * FROM tag_run_weekly_allocations').get();
  assert.equal(plan.token_symbol,'NEW');
  assert.equal(plan.token_contract,'othercontract');
  assert.equal(plan.token_precision,2);
  assert.equal(plan.base_amount_units,200);
  assert.equal(plan.top1_multiplier,2);
  assert.equal(plan.planned_units,400);
  assert.equal(allocation.amount_units,400);
  assert.equal(plan.planned_units,allocation.amount_units);
});

test('a late score before the transaction cannot exceed the budget or include extra recipients', async t => {
  const f = fixture(t);
  f.sqlite.prepare('INSERT INTO tag_run_reward_config ' +
    '(chat_id,token_symbol,token_contract,token_precision,base_amount_units,' +
    'max_weekly_units,enabled) VALUES (?,?,?,?,?,?,1)')
    .run(GROUP, 'LFGK', 'kingsofgraff', 4, 100000, 500000);
  assert.equal(await f.score(f.message('One qualified comment about graffiti on Monday')), true);
  f.DB.beforeBatch = async () => {
    f.DB.beforeBatch = null;
    const nowMs = MONDAY + 60000;
    assert.equal(await f.score(f.message('Another eligible tagger posts before the budget snapshot',
      { user:'8000034', nowMs }), nowMs),true);
  };
  f.env.TAG_RUN_WEEKLY_REWARDS_ENABLED = 'true';
  const draft = await draftTagRunWeeklyRewards(f.env,
    { nowMs: Date.parse('2026-11-09T00:05:00Z') });
  assert.equal(draft.status, 'over_budget', 'budget must be validated inside the SQL INSERT');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_weekly_plans').get().n, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_weekly_allocations').get().n, 0);
});

test('allocations use the frozen ranked plan even if activity changes between batch statements', async t => {
  const f = fixture(t);
  f.sqlite.prepare('INSERT INTO tag_run_reward_config ' +
    '(chat_id,token_symbol,token_contract,token_precision,base_amount_units,' +
    'max_weekly_units,enabled) VALUES (?,?,?,?,?,?,1)')
    .run(GROUP, 'LFGK', 'kingsofgraff', 4, 100000, 1000000);
  assert.equal(await f.score(f.message('One member earned a qualifying street art comment')),true);
  f.DB.afterPlanInsert = async () => {
    f.DB.afterPlanInsert = null;
    const nowMs = MONDAY + 60000;
    assert.equal(await f.score(f.message('Another member speaks after the roster was frozen',
      { user:'8000054', nowMs }),nowMs),true);
  };
  f.env.TAG_RUN_WEEKLY_REWARDS_ENABLED = 'true';
  const draft = await draftTagRunWeeklyRewards(f.env,
    { nowMs: Date.parse('2026-11-09T00:05:00Z') });
  assert.equal(draft.status,'review_only');
  const plan = f.sqlite.prepare('SELECT * FROM tag_run_weekly_plans').get();
  const allocations = f.sqlite.prepare('SELECT * FROM tag_run_weekly_allocations').all();
  assert.equal(plan.recipient_count, 1);
  assert.equal(plan.planned_units, 500000);
  assert.equal(allocations.length, 1);
  assert.equal(allocations[0].amount_units, plan.planned_units);
  assert.equal(JSON.parse(plan.standings_json).length, 1, 'roster is immutable');
  assert.equal(f.sqlite.prepare('SELECT COUNT(DISTINCT telegram_id) AS n ' +
    'FROM tag_run_messages').get().n, 2,
    'late input exists but cannot alter the locked reward roster');
  assert.equal((await draftTagRunWeeklyRewards(f.env,
    { nowMs: Date.parse('2026-11-09T00:10:00Z') })).status,'already_drafted');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_weekly_allocations').get().n,1);
});

test('reward plans fail closed if the weekly token budget cannot cover every active member', async t => {
  const f = fixture(t);
  f.sqlite.prepare('INSERT INTO tag_run_reward_config (chat_id,token_symbol,token_contract,token_precision,base_amount_units,max_weekly_units,enabled) VALUES(?,?,?,?,?,?,1)')
    .run(GROUP,'LFGK','kingsofgraff',4,100000,500000);
  for (let i = 0; i < 3; i++) {
    const now = MONDAY + i * 50000;
    await f.score(f.message('Fresh feedback about the tags in scene number ' + i,
      { user: String(7000000+i), nowMs: now }), now);
  }
  f.env.TAG_RUN_WEEKLY_REWARDS_ENABLED = 'true';
  const draft = await draftTagRunWeeklyRewards(f.env,
    { nowMs: Date.parse('2026-11-09T00:05:00Z') });
  assert.equal(draft.status, 'over_budget');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM tag_run_weekly_allocations').get().n, 0);
});

test('four-hour bulletin publishes weekly top 10 and a bot introduction', async t => {
  const f = fixture(t);
  f.env.TELEGRAM_GROUP_THREAD_ID = '23456';
  // An actual accepted message populates both the weekly and all-time tables.
  await f.score(f.message('Fresh tags for the community', { nowMs: MONDAY }));
  const sent = await postTagRunGroupBulletin(f.env, {
    nowMs: MONDAY, fetchImpl: f.fetchImpl
  });
  assert.equal(sent.status, 'sent');
  assert.equal(sent.count, 1);
  const bulletin = f.sent.at(-1);
  assert.equal(String(bulletin.chat_id), GROUP);
  assert.equal(bulletin.message_thread_id, 23456,
    'scheduled bulletin must target the configured announcement topic');
  assert.match(bulletin.text, /THIS WEEK.S TOP 10/);
  assert.match(bulletin.text, /1\. Tagger — 10 pts/);
  assert.match(bulletin.text, /45-second cooldown/);
  assert.match(bulletin.text, /\/tagprofile/);
  assert.match(bulletin.text, /\/rain yourwaxaccount/);
  const wrangler = readFileSync(new URL('../workers/moonboys-api/wrangler.toml',
    import.meta.url), 'utf8');
  assert.match(wrangler, /"3 \*\/4 \* \* \*"/);
  const wrapper = readFileSync(new URL('../workers/moonboys-api/worker-phase5-final.js',
    import.meta.url), 'utf8');
  const plan = readFileSync(new URL('../workers/moonboys-api/scheduled/phase5-cron-plan.js',
    import.meta.url), 'utf8');
  assert.match(plan, /bulletin: '3 \*\/4 \* \* \*'/);
  assert.match(plan, /cron === MOONBOYS_CRON\.bulletin && env\.TAG_RUN_ENABLED === 'true'/);
  assert.match(wrapper, /if \(tasks\.bulletin\)[\s\S]*?postTagRunGroupBulletin\(env\)/);
  assert.match(wrapper, /phase5CronTasks\(event, env\)/);
});

test('four-hour bulletin never posts when scoring is disabled', async t => {
  const f = fixture(t, { enabled: false });
  assert.equal((await postTagRunGroupBulletin(f.env, {
    nowMs: MONDAY, fetchImpl: f.fetchImpl
  })).status, 'disabled');
  assert.equal(f.sent.length, 0);
});

test('four-hour bulletin omits unset or invalid Telegram topic IDs', async t => {
  const f = fixture(t);
  const nowMs = MONDAY;
  for (const threadId of [undefined, '', '0', '-1', 'not-a-topic', '12345678901234']) {
    if (threadId === undefined) delete f.env.TELEGRAM_GROUP_THREAD_ID;
    else f.env.TELEGRAM_GROUP_THREAD_ID = threadId;
    const result = await postTagRunGroupBulletin(f.env, {
      nowMs, fetchImpl: f.fetchImpl
    });
    assert.equal(result.status, 'sent');
    assert.equal(String(f.sent.at(-1).chat_id), GROUP);
    assert.equal(Object.hasOwn(f.sent.at(-1), 'message_thread_id'), false,
      'invalid topic IDs must never be sent to Telegram');
  }
});
