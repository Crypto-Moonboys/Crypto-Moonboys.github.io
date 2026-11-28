import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../workers/moonboys-api/deployment-entry.js';

test('Doctor Telegram approval is private, exact-head, revision-bound and fail closed', async t => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../workers/moonboys-api/migrations/137_doctor_telegram_approvals.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../workers/moonboys-api/migrations/138_doctor_approval_audit.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../workers/moonboys-api/migrations/139_doctor_auto_release.sql', import.meta.url), 'utf8'));
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
  const click = (data, actor = 100, unsigned = false, type = 'private') => worker.fetch(new Request('https://api.cryptomoonboys.com/telegram/webhook', {
    method: 'POST', headers: unsigned ? {} : { 'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify({ callback_query: { id: 'cb', data, from: { id: actor }, message: { chat: { id: actor, type } } } })
  }), env, {});
  const job = { repo: 'hodlkong64/they-call-me-the-daddy', job_key: '1'.repeat(64), pr_number: 123, head_sha: 'a'.repeat(40), base_sha: 'b'.repeat(40) };
  const state = async (action, value = job) => (await (await call({ ...value, action })).json()).state;
  const audit = () => sqlite.prepare('SELECT * FROM doctor_approval_audit ORDER BY approval_id, revision, recorded_at').all();
  assert.equal((await call({ ...job, action: 'ready' }, 'x'.repeat(64))).status, 401);
  assert.equal(await state('read'), 'missing');
  assert.equal(await state('ready'), 'ready');
  await call({ action: 'flush' });
  const buttons = messages.find(m => m.reply_markup).reply_markup.inline_keyboard;
  const approve = buttons[0][0].callback_data;
  assert.equal((await click(approve, 100, true)).status, 401);
  await click(approve, 200);
  await click(approve, 100, false, 'group');
  assert.equal(audit().length, 0);
  assert.equal(await state('read'), 'ready');
  await Promise.all([click(approve), click(approve)]);
  assert.equal(await state('read'), 'approved');
  assert.equal(messages.filter(m => m.text === 'Decision recorded for this commit.').length, 1);
  const [decision] = audit();
  assert.equal(audit().length, 1);
  assert.equal(decision.actor_telegram_id, '100');
  assert.equal(decision.revision, 2);
  assert.equal(decision.source_revision, 1);
  assert.equal(decision.repo, job.repo);
  assert.equal(decision.pr_number, job.pr_number);
  assert.equal(decision.head_sha, job.head_sha);
  assert.equal(decision.base_sha, job.base_sha);
  assert.ok(Math.abs(decision.recorded_at - Date.now()) < 5000);
  assert.equal((await (await call({ ...job, action: 'read' })).json()).actor_telegram_id, undefined);
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
  assert.deepEqual(audit().map(row => [row.action, row.head_sha, row.actor_telegram_id]), [
    ['approved', job.head_sha, '100'], ['fix_requested', next.head_sha, '100'], ['rejected', third.head_sha, '100']
  ]);
  assert.throws(() => sqlite.exec('DELETE FROM doctor_approval_audit'), /append-only/);

  const mergeSha = '9'.repeat(40);
  for (const legacy of [false, true]) {
    const mergeJob = { ...job, job_key: (legacy ? '3' : '2').repeat(64) };
    assert.equal(await state('ready', mergeJob), 'ready');
    await call({ action: 'flush' });
    const button = messages.filter(m => m.reply_markup).at(-1).reply_markup.inline_keyboard[0][0];
    await click(button.callback_data);
    assert.equal((await call({ ...mergeJob, action: 'merged', merge_sha: 'invalid' })).status, 400);
    if (legacy) assert.equal(await state('merged', mergeJob), 'merged');
    const receipt = { ...mergeJob, merge_sha: mergeSha };
    assert.equal(await state('merged', receipt), 'merged');
    assert.equal(await state('merged', receipt), 'merged');
    assert.equal((await call({ ...receipt, action: 'merged', merge_sha: '8'.repeat(40) })).status, 409);
    const evidence = audit().filter(row => row.approval_id === (legacy ? 3 : 2) && row.merge_sha);
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].action, legacy ? 'merge_evidence' : 'merged');
    assert.equal(evidence[0].merge_sha, mergeSha);
  }
  const autoJob = { ...job, job_key: '7'.repeat(64), repo: 'crypto-moonboys/crypto-moonboys.github.io', allow_auto: true };
  await call({ ...autoJob, action: 'ready' });
  await call({ action: 'flush' });
  const auto = messages.filter(m => m.reply_markup).at(-1).reply_markup.inline_keyboard.flat().find(button => button.text === 'Auto');
  assert.ok(auto);
  await click(auto.callback_data, 200);
  assert.equal(await state('read', autoJob), 'ready');
  await click(auto.callback_data);
  assert.equal((await (await call({ ...autoJob, action: 'read' })).json()).decision_mode, 'auto');
  assert.equal(audit().at(-1).decision_mode, 'auto');
  const changedAutoHead = { ...autoJob, head_sha: 'f'.repeat(40) };
  await call({ ...changedAutoHead, action: 'ready' });
  await click(auto.callback_data);
  assert.equal(await state('read', changedAutoHead), 'ready');

  const event = { action: 'event', repo: job.repo, pr_number: 123, head_sha: job.head_sha, event_key: '9'.repeat(64), event: 'validation_passed' };
  await call(event); await call(event); await call({ action: 'flush' }); await call({ action: 'flush' });
  assert.equal(messages.filter(m => m.text?.includes('Isolated tests passed')).length, 1);
});
