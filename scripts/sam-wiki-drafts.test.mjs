import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../workers/moonboys-api/deployment-entry.js';

const origin = 'https://api.cryptomoonboys.com';
const migration = readFileSync(new URL('../workers/moonboys-api/migrations/135_sam_wiki_drafts.sql', import.meta.url), 'utf8');
const head = '1'.repeat(40);
const payload = { slug: 'nomad-bears', title: 'Nomad Bears', description: 'A proposed lore expansion.',
  publish_mode: 'middle_content_only', article_html: '<section><p>New lore</p></section>' };

test('SAM drafts require a separate intake credential, current Codex review and the owner’s private approval', async t => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
  sqlite.exec(migration);
  const deliveries = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(String(url), /^https:\/\/api\.telegram\.org\/botfake\//);
    deliveries.push(JSON.parse(options.body));
    return Response.json({ ok: true });
  });
  t.after(() => sqlite.close());
  const env = {
    SAM_WIKI_DRAFTS_ENABLED: 'true', SUPPORT_OWNER_TELEGRAM_ID: '100',
    SUPPORT_BRAIN_TOKEN: 'A'.repeat(64), TELEGRAM_WEBHOOK_SECRET: 'B'.repeat(64),
    SAM_WIKI_DRAFT_TOKEN: 'C'.repeat(64), TELEGRAM_BOT_TOKEN: 'fake',
    DB: { prepare: sql => {
      const bind = (...args) => ({ first: async () => sqlite.prepare(sql).get(...args),
        all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
        run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }) });
      return { ...bind(), bind };
    } },
  };
  const queue = (body, intake = false) => worker.fetch(new Request(origin + '/internal/sam-wiki-drafts', {
    method: body ? 'POST' : 'GET', body: body && JSON.stringify(body),
    headers: intake ? { 'X-SAM-Wiki-Draft-Token': env.SAM_WIKI_DRAFT_TOKEN }
      : { 'X-Doctor-Support-Token': env.SUPPORT_BRAIN_TOKEN },
  }), env, {});
  const row = () => sqlite.prepare('SELECT * FROM sam_wiki_drafts WHERE id = 1').get();
  const move = (action, extra = {}) => queue({ id: 1, revision: row().revision, action, ...extra });
  const telegram = (data, actor = 100, options = {}) => worker.fetch(new Request(origin + '/telegram/webhook', {
    method: 'POST', headers: options.unsigned ? {} : { 'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify(options.command
      ? { message: { text: data, from: { id: actor }, chat: { id: actor, type: 'private' } } }
      : { callback_query: { id: 'callback', data, from: { id: actor }, message: { chat: { id: actor, type: 'private' } } } }),
  }), env, {});
  const draft = { base_sha: '2'.repeat(40), payload };
  assert.equal((await queue(undefined, true)).status, 405);
  assert.equal((await queue(draft)).status, 400);
  assert.equal((await queue(draft, true)).status, 200);
  assert.equal((await queue(draft, true)).status, 200);
  assert.equal((await (await queue()).json()).cases.length, 1);
  assert.equal((await move('status', { state: 'ready' })).status, 409);
  assert.equal((await move('status', { state: 'reviewing', pr_number: 999, head_sha: head, review_id: 888 })).status, 200);
  assert.equal((await telegram('samwiki:merge:1:2', 100, { unsigned: true })).status, 401);
  await telegram('samwiki:close:1:2', 200);
  await telegram('samwiki:merge:1:2');
  assert.equal(row().state, 'reviewing');
  assert.equal((await move('status', { state: 'ready', head_sha: 'a'.repeat(40) })).status, 400);
  assert.equal((await move('status', { state: 'ready' })).status, 200);
  await move('notify');
  assert.deepEqual(deliveries.at(-1).reply_markup.inline_keyboard[0].map(button => button.text), ['Merge', 'Edit', 'Leave', 'Close']);
  assert.equal(deliveries.at(-1).chat_id, '100');
  await telegram('samwiki:edit:1:3');
  await telegram('/sam_edit 1 3 Make the scene longer.', 100, { command: true });
  assert.equal(row().feedback, 'Make the scene longer.');
  assert.equal(row().state, 'editing');
  const revised = { ...payload, article_html: '<section><p>Revised lore</p></section>' };
  assert.equal((await move('prepare_edit', { payload: revised })).status, 200);
  assert.equal((await move('status', { state: 'reviewing', head_sha: '3'.repeat(40), review_id: 889 })).status, 200);
  await telegram('samwiki:merge:1:3');
  assert.equal(row().state, 'reviewing');
  assert.equal(JSON.parse(row().payload).article_html, revised.article_html);
  assert.equal((await move('status', { state: 'ready' })).status, 200);
  await telegram(`samwiki:leave:1:${row().revision}`);
  assert.equal(row().state, 'left');
  await telegram(`samwiki:merge:1:${row().revision}`);
  assert.equal(row().state, 'merging');
  const preRefresh = row().revision;
  assert.equal((await move('refresh_base', { base_sha: '4'.repeat(40) })).status, 200);
  assert.equal(row().state, 'queued');
  assert.equal(row().reviewed, 0);
  await telegram(`samwiki:merge:1:${preRefresh}`);
  assert.equal(row().state, 'queued');
  assert.equal((await move('status', { state: 'reviewing', head_sha: '5'.repeat(40), review_id: 890 })).status, 200);
  assert.equal((await move('status', { state: 'ready' })).status, 200);
  await telegram(`samwiki:merge:1:${row().revision}`);
  assert.equal((await move('status', { state: 'merge_queued' })).status, 200);
  assert.equal((await move('status', { state: 'merged' })).status, 200);
  assert.equal(row().state, 'merged');
});
