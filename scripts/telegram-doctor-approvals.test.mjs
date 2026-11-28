import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../workers/moonboys-api/deployment-entry.js';

test('Doctor Telegram approval is private, exact-head, revision-bound and fail closed', async t => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../workers/moonboys-api/migrations/137_doctor_telegram_approvals.sql', import.meta.url), 'utf8'));
  const original = globalThis.fetch, messages = [];
  globalThis.fetch = async (url, data) => {
    assert.match(String(url), /^https:\/\/api\.telegram\.org\/botfake\//);
    messages.push(JSON.parse(data.body));
    return Response.json({ ok: true });
  };
  t.after(() => { sqlite.close(); globalThis.fetch = original; });
  const env = { DOCTOR_APPROVALS_ENABLED: 'true', DOCTOR_APPROVAL_TOKEN: 'A'.repeat(64),
    SUPPORT_OWNER_TELEGRAM_ID: '100', TELEGRAM_WEBHOOK_SECRET: 'B'.repeat(64), TELEGRAM_BOT_TOKEN: 'fake',
    DB: { prepare: sql => {
      const bind = (...args) => ({ first: async () => sqlite.prepare(sql).get(...args),
        all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
        run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }) });
      return { ...bind(), bind };
    } } };
  const call = (body, token = env.DOCTOR_APPROVAL_TOKEN) => worker.fetch(new Request('https://api.cryptomoonboys.com/internal/doctor-approvals', {
    method: 'POST', headers: { 'X-Doctor-Approval-Token': token }, body: JSON.stringify(body)
  }), env, {});
  const click = (data, actor = 100, unsigned = false) => worker.fetch(new Request('https://api.cryptomoonboys.com/telegram/webhook', {
    method: 'POST', headers: unsigned ? {} : { 'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify({ callback_query: { id: 'cb', data, from: { id: actor }, message: { chat: { id: actor, type: 'private' } } } })
  }), env, {});
  const job = { repo: 'hodlkong64/they-call-me-the-daddy', job_key: '1'.repeat(64), pr_number: 123, head_sha: 'a'.repeat(40), base_sha: 'b'.repeat(40) };
  const state = async (action, value = job) => (await (await call({ ...value, action })).json()).state;
  assert.equal((await call({ ...job, action: 'ready' }, 'x'.repeat(64))).status, 401);
  assert.equal(await state('read'), 'missing');
  assert.equal(await state('ready'), 'ready');
  await call({ action: 'flush' });
  const buttons = messages.find(m => m.reply_markup).reply_markup.inline_keyboard;
  const approve = buttons[0][0].callback_data;
  assert.equal((await click(approve, 100, true)).status, 401);
  await click(approve, 200);
  assert.equal(await state('read'), 'ready');
  await click(approve);
  assert.equal(await state('read'), 'approved');
  assert.equal(await state('ready'), 'approved');
  const next = { ...job, head_sha: 'c'.repeat(40) };
  assert.equal(await state('ready', next), 'ready');
  assert.equal(await state('read'), 'missing');
  await click(approve);
  assert.equal(await state('read', next), 'ready');
  await call({ action: 'flush' });
  const fresh = messages.filter(m => m.reply_markup).at(-1).reply_markup.inline_keyboard;
  await click(fresh[1][0].callback_data);
  assert.equal(await state('ready', next), 'fix_requested');
  const movedBase = { ...next, base_sha: 'f'.repeat(40) };
  assert.equal((await call({ ...movedBase, action: 'ready' })).status, 409);
  assert.equal(await state('read', next), 'fix_requested');
  assert.equal(await state('read', movedBase), 'missing');
  await call({ action: 'flush' });
  await click(fresh[0][0].callback_data);
  assert.equal(await state('read', next), 'fix_requested');
  const third = { ...next, head_sha: 'd'.repeat(40) };
  assert.equal(await state('ready', third), 'ready');
  await call({ action: 'flush' });
  await click(messages.filter(m => m.reply_markup).at(-1).reply_markup.inline_keyboard[1][1].callback_data);
  assert.equal(await state('read', third), 'rejected');
  assert.equal((await call({ ...third, head_sha: 'e'.repeat(40), action: 'ready' })).status, 409);
  const event = { action: 'event', repo: job.repo, pr_number: 123, head_sha: job.head_sha, event_key: '9'.repeat(64), event: 'validation_passed' };
  await call(event); await call(event); await call({ action: 'flush' }); await call({ action: 'flush' });
  assert.equal(messages.filter(m => m.text?.includes('Isolated tests passed')).length, 1);
});
