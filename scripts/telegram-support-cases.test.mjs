import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../workers/moonboys-api/deployment-entry.js';
import { supportRepairPath } from '../workers/moonboys-api/telegram/support-cases.js';

const schema = readFileSync(new URL('../workers/moonboys-api/migrations/133_support_cases.sql', import.meta.url), 'utf8');
const origin = 'https://api.cryptomoonboys.com';
const sitePr = 'https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/pull/999';
const sha = '1'.repeat(40);
const file = 'games/dead-run/styles.css';
const owner = 100;
const player = 200;

function setup(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  sqlite.exec(schema);
  sqlite.exec(readFileSync(new URL('../workers/moonboys-api/migrations/134_support_merge_approval.sql', import.meta.url), 'utf8'));
  const result = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, data) => {
    assert.match(String(url), /^https:\/\/api\.telegram\.org\/botfake\//);
    const body = JSON.parse(data.body);
    result.push({ url: String(url), ...body });
    return Response.json({ ok: true, result: { status: body.user_id === player ? 'member' : 'left' } });
  };
  t.after(() => { sqlite.close(); globalThis.fetch = original; });
  const env = {
    SUPPORT_CASES_ENABLED: 'true', SUPPORT_OWNER_TELEGRAM_ID: String(owner),
    SUPPORT_BRAIN_TOKEN: 'A'.repeat(64), TELEGRAM_WEBHOOK_SECRET: 'B'.repeat(64),
    TELEGRAM_BOT_TOKEN: 'fake', TELEGRAM_GROUP_CHAT_ID: '-999',
    DB: { prepare: sql => {
      const bind = (...args) => ({
        first: async () => sqlite.prepare(sql).get(...args),
        all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
        run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }),
      });
      return { ...bind(), bind };
    } },
  };
  const update = (actor, text, options = {}) => worker.fetch(new Request(`${origin}/telegram/webhook`, {
    method: 'POST', headers: options.unsigned ? {} : { 'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify(options.callback ? { callback_query: { id: "callback", data: text, from: { id: actor }, message: { chat: { id: actor, type: "private" } } } } : { message: {
      text, from: { id: actor }, chat: { id: options.group ? -999 : actor, type: options.group ? 'group' : 'private' },
      message_id: options.messageId ?? 123,
    } }),
  }), env, {});
  const bridge = (body, token = env.SUPPORT_BRAIN_TOKEN) => worker.fetch(new Request(`${origin}/internal/doctor-support`, {
    method: body ? 'POST' : 'GET', headers: { 'X-Doctor-Support-Token': token }, body: body && JSON.stringify(body),
  }), env, {});
  const row = () => sqlite.prepare('SELECT * FROM support_cases ORDER BY id DESC LIMIT 1').get();
  const move = (action, extra = {}, revision = row().revision) => bridge({ id: row().id, revision, action, ...extra });
  return { env, row, update, bridge, move, result };
}

test('webhook authentication, membership and duplicate delivery protect intake', async t => {
  const { row, update, bridge, result } = setup(t);
  assert.equal((await update(player, '/report example', { unsigned: true })).status, 401);
  assert.equal(row(), undefined);
  await update(900, '/report example');
  assert.equal(row(), undefined);
  await update(player, '/report example', { group: true });
  assert.equal(row(), undefined);
  await update(player, '/report Games page clips the text. github_pat_abcdefghijklmnopqrstuvwxyz');
  await update(player, '/report same update is retried');
  assert.equal(row().id, 1);
  assert.match(row().report, /\[redacted\]/);
  assert.equal(result.some(item => item.text?.includes('github_pat_')), false);
  assert.equal((await bridge(undefined, 'x'.repeat(64))).status, 401);
  const snapshot = await (await bridge()).json();
  assert.deepEqual(snapshot.cases, []);
  assert.deepEqual(snapshot.notices, [{ id: 1, revision: 1 }]);
});

test('the Brain scanner can only stage deduplicated Wiki link fixes for the owner', async t => {
  const { env, row, update, bridge } = setup(t);
  env.BRAIN_WIKI_SCAN_TOKEN = 'C'.repeat(64);
  const submit = (body, method = 'POST') => worker.fetch(new Request(`${origin}/internal/doctor-support`, {
    method, headers: { 'X-Brain-Wiki-Scan-Token': env.BRAIN_WIKI_SCAN_TOKEN },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }), env, {});
  const finding = { action: 'wiki_link', page: 'wiki/index.html', old: '/wiki/Old_Name.html',
    new: '/wiki/old-name.html', base_sha: sha };
  assert.equal((await submit({}, 'GET')).status, 405);
  assert.equal((await submit({ action: 'status', id: 1, revision: 1 })).status, 401);
  assert.equal((await submit({ ...finding, page: 'games/index.html' })).status, 400);
  assert.equal((await submit({ ...finding, new: '/wiki/unrelated.html' })).status, 400);
  assert.equal((await submit(finding)).status, 200);
  assert.equal((await submit({ ...finding, base_sha: '2'.repeat(40) })).status, 200);
  assert.equal(row().id, 1);
  assert.equal(row().base_sha, '2'.repeat(40));
  assert.equal(row().state, 'reviewed');
  assert.equal(row().reporter_notice, 0);
  await update(player, 'FIX #1 1');
  assert.equal(row().state, 'reviewed');
  await update(owner, 'FIX #1 1');
  assert.equal(row().state, 'approved');
  assert.equal((await (await bridge()).json()).cases[0].wiki_scan, 1);
  assert.equal((await submit(finding)).status, 200);
  assert.equal(row().state, 'approved');
  assert.equal(row().base_sha, '2'.repeat(40));
});

test('LOOK, revised findings, FIX, PR and verified resolution are separate transitions', async t => {
  const { row, update, move, result } = setup(t);
  await update(player, '/report Dead Run text clips on touchscreen.');
  await move('notify');
  assert.ok(result.some(item => item.chat_id === '100' && item.reply_markup.inline_keyboard[0][0].text === 'Look into it'));
  await update(player, 'LOOK #1');
  assert.equal(row().state, 'submitted');
  await update(owner, 'FIX #1 1');
  assert.equal(row().state, 'submitted');
  await update(owner, 'LOOK #1');
  assert.equal(row().state, 'look_requested');
  assert.equal((await move('review', { review: 'Diagnosis', fix: 'Change styling', paths: ['workers/moonboys-api/worker.js'], base_sha: sha })).status, 400);
  const review = { review: 'Diagnosis', fix: 'Wrap long control text', paths: [file], base_sha: sha };
  assert.equal((await move('review', review)).status, 200);
  const firstReview = row().revision;
  await update(owner, '/review 1 Is the touchscreen layout affected?');
  assert.match(row().feedback, /touchscreen/);
  assert.equal((await move('review', review)).status, 200);
  await update(owner, `FIX #1 ${firstReview}`);
  assert.equal(row().state, 'reviewed');
  await update(owner, `FIX #1 ${row().revision}`);
  assert.equal(row().state, 'approved');
  const approved = row().approved_revision;
  assert.equal((await move('status', { status: 'pr_opened_waiting_review', pr_url: 'https://other.example' })).status, 409);
  assert.equal((await move('status', { status: 'pr_opened_waiting_review', pr_url: sitePr })).status, 200);
  assert.equal(row().approved_revision, approved);
  const ready = { status: 'merge_ready', pr_url: sitePr, merge_head_sha: sha };
  assert.equal((await move('status', { ...ready, merge_head_sha: '' })).status, 409);
  assert.equal((await move('status', ready)).status, 200);
  await move('notify');
  const approval = result.at(-1).reply_markup.inline_keyboard[0][0];
  assert.equal(approval.text, 'Approve merge');
  await update(player, approval.callback_data, { callback: true });
  assert.equal(row().doctor_status, 'merge_ready');
  await move('status', { ...ready, merge_head_sha: '2'.repeat(40) });
  await update(owner, approval.callback_data, { callback: true });
  assert.equal(row().doctor_status, 'merge_ready');
  await update(owner, `support:merge:1:${row().revision}`, { callback: true, unsigned: true });
  assert.equal(row().doctor_status, 'merge_ready');
  await update(owner, `support:merge:1:${row().revision}`, { callback: true });
  assert.equal(row().doctor_status, 'merge_approved');
  assert.equal(row().merge_head_sha, '2'.repeat(40));
  assert.equal((await move('status', ready)).status, 409);
  await update(owner, '/resolved 1');
  assert.equal(row().state, 'tracking');
  assert.equal((await move('status', { status: 'merged', pr_url: sitePr })).status, 200);
  await move('notify');
  assert.equal(result.some(item => item.chat_id === '200' && item.text?.includes('live')), false);
  await update(owner, '/resolved 1');
  await move('notify');
  assert.ok(result.some(item => item.chat_id === '200' && item.text?.includes('live and verified')));
});

test('job scope excludes protected files, prefixes and hidden paths', () => {
  for (const path of ['games/dead-run/', 'games/dead-run/.hidden.js', 'games/dead-run/auth-client.js', 'games/dead-run/x/../index.html', 'js/avatar-builder-homepage-presets.mjs', '.github/config.yml']) {
    assert.equal(supportRepairPath(path), false, path);
  }
  for (const path of [file, 'games/block-topia/waterfront/faction-conversations.mjs', 'css/avatar-builder-test.css']) {
    assert.equal(supportRepairPath(path), true, path);
  }
});
