import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import {
  TAG_RUN_RANKS, rankFor, weekOf, previousWeek, eligibleTagComment,
  isValidWaxAccount, parseTokenUnits, formatTokenUnits
} from '../workers/moonboys-api/tag-run/core.js';
import {
  isTagRunCommand, handleTagRunCommand, recordTagRunMessage,
  draftTagRunWeeklyRewards
} from '../workers/moonboys-api/tag-run/handler.js';

const SCHEMA = readFileSync(
  new URL('../workers/moonboys-api/migrations/103_tag_run_street_cred_rewards.sql', import.meta.url), 'utf8'
);
const GROUP = '-1001234567890';
const ADMIN = '9000001';
const MEMBER = '9000002';
const MONDAY = Date.parse('2026-11-02T10:00:00.000Z');

function fixture(t, opts = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  const sent = [];
  const pending = [];
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { return sqlite.prepare(this.query).get(...this.args) || null; }
    async all() { return { success: true, results: sqlite.prepare(this.query).all(...this.args) }; }
    async run() {
      const result = sqlite.prepare(this.query).run(...this.args);
      return { success: true, meta: { changes: Number(result.changes) } };
    }
  }
  const DB = {
    prepare: sql => new Statement(sql),
    async batch(statements) {
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
    if (url.includes('get_currency_stats')) {
      const request = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => request.code === 'kingsofgraff' && request.symbol === 'LFGK'
          ? { LFGK: { max_supply: '1000000000.0000 LFGK' } } : {}
      };
    }
    assert.match(url, /\/sendMessage$/);
    sent.push(JSON.parse(options.body));
    return { ok: true };
  };
  let updateNumber = 0;
  const message = (text, { user = MEMBER, nowMs = MONDAY, chat = 'group',
    replyTo = null, isBot = false, messageId = null, ...extra } = {}) => ({
    message: {
      message_id: messageId ?? ++updateNumber,
      date: Math.floor(nowMs / 1000),
      chat: chat === 'private'
        ? { id: Number(user), type: 'private' } :
          { id: Number(GROUP), type: 'supergroup' },
      from: { id: Number(user), first_name: user === ADMIN ? 'Admin' : 'Tagger', is_bot: isBot },
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
  return { sqlite, DB, env, sent, pending, message, command, score };
}


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
  assert.match(wrangler, /TAG_RUN_ENABLED = "false"/);
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
  assert.equal(await f.score(f.message('This art has amazing movement in the background', { nowMs: MONDAY + 50000 })), false,
    'duplicate text within one day earns nothing');
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
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM tag_run_messages WHERE content_hash LIKE ?').get('%art%').count, 0,
    'raw message text must never be saved');
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
});

test('commands are verified-group/private only and rain registers unverified WAX accounts', async t => {
  const f = fixture(t);
  assert.equal(isTagRunCommand(f.message('/profile', { chat: 'group' }), f.env), true);
  assert.equal(isTagRunCommand(f.message('/profile', { chat: 'private' }), f.env), true);
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
  assert.match(rain.answer, /PENDING verification/);
  const wallet = f.sqlite.prepare('SELECT * FROM tag_run_wallets WHERE telegram_id=?').get(MEMBER);
  assert.equal(wallet.wax_account, 'abcde.wam');
  assert.equal(wallet.verification_status, 'pending');
  assert.match((await f.command('/rain rXRPabcdef')).answer, /Usage/);
  assert.match((await f.command('/profile')).answer, /Newbie Tagger/);
  const ranks = await f.command('/ranks', { chat: 'group' });
  assert.match(ranks.answer, /0 — Newbie Tagger/);
  assert.match(ranks.answer, /95,000 — Graffiti King/);
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
  assert.match((await f.command('/tagenable', { user: ADMIN })).answer, /review/);
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
