import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../workers/moonboys-api/worker-phase5-final.js';
import { claimTagRunCommand, runClaimedTagRunCommand } from '../workers/moonboys-api/tag-run/command-delivery.js';

const SECRET = 'command-delivery-fixture-secret_0123456789';
const GROUP = '-1001234567890';
function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  for (const file of ['103_tag_run_street_cred_rewards.sql', '113_tag_run_command_receipts.sql']) {
    sql.exec(readFileSync(new URL('../workers/moonboys-api/migrations/' + file, import.meta.url), 'utf8'));
  }
  const DB = { prepare(query) {
    return { bind(...args) {
      return {
        async run() { return { success: true, meta: { changes: sql.prepare(query).run(...args).changes } }; },
        async first() { return sql.prepare(query).get(...args) || null; },
        async all() { return { results: sql.prepare(query).all(...args) }; }
      };
    } };
  } };
  return { sql, env: { DB, TAG_RUN_ENABLED: 'true', TELEGRAM_GROUP_CHAT_ID: GROUP,
    TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_BOT_TOKEN: '123456:fixture',
    TELEGRAM_BOT_USERNAME: 'WIKICOMSBOT', TELEGRAM_MOONBOY_PHOTOS_ENABLED: 'true',
    TELEGRAM_MOONBOY_MEDIA_MODE: 'group', IMAGES: { input() { throw new Error('must not render'); } } } };
}
function update(text = '/top', group = false, id = 1) {
  return { update_id: id, message: { message_id: id, date: Math.floor(Date.now() / 1000),
    text, from: { id: 9000002, first_name: 'Tester' },
    chat: { id: group ? Number(GROUP) : 9000002, type: group ? 'supergroup' : 'private' } } };
}
function request(body, secret = SECRET) {
  return new Request('https://moonboys-api.test/telegram/webhook', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify(body) });
}

for (const group of [false, true]) {
  for (const command of ['/top', '/top all', '/rank', '/tagprofile']) {
    test(`${command}: ${group ? 'group' : 'private'} retries acknowledge before slow delivery and post once`, async t => {
      const { sql, env } = fixture(t);
      const pending = [];
      let sends = 0;
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      t.mock.method(globalThis, 'fetch', async (url, init) => {
        assert.ok(String(url).endsWith('/sendMessage'));
        assert.ok(init.signal instanceof AbortSignal);
        const text = JSON.parse(init.body).text;
        assert.match(text, command.startsWith('/top') ? /TOP 10/ : /TAG RUN PROFILE/);
        assert.doesNotMatch(text, /temporarily unavailable/);
        sends++;
        await gate;
        return Response.json({ ok: true, result: { message_id: 99 } });
      });
      const body = update(command, group);
      const ctx = { waitUntil(p) { pending.push(p); } };
      // Race ten independent authenticated webhook deliveries against one D1
      // database, including retries while the original Telegram send is blocked.
      const replies = await Promise.all(Array.from({ length: 10 }, () => worker.fetch(request(body), env, ctx)));
      assert.ok(replies.every(r => r.status === 200));
      assert.equal(pending.length, 1);
      // Reaching here before release proves response does not await delivery.
      release();
      await Promise.all(pending);
      assert.equal(sends, 1);
      assert.equal((await worker.fetch(request(body), env, ctx)).status, 200);
      assert.equal(pending.length, 1);
      assert.equal(sql.prepare('SELECT count(*) AS n FROM tag_run_command_receipts').get().n, 1);
      assert.equal(sql.prepare('SELECT status FROM tag_run_command_receipts').get().status, 'completed');
    });
  }
}

test('claim failure returns 503 before command effects; unauthenticated requests never claim', async t => {
  const { sql, env } = fixture(t);
  assert.equal((await worker.fetch(request(update(), 'wrong'), env, {})).status, 401);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM tag_run_command_receipts').get().n, 0);
  sql.exec('DROP TABLE tag_run_command_receipts');
  let sends = 0;
  t.mock.method(globalThis, 'fetch', async () => { sends++; throw new Error('unexpected'); });
  assert.equal((await worker.fetch(request(update()), env, {})).status, 503);
  assert.equal(sends, 0);
});

test('terminal claims survive ambiguous delivery, completion failure, changed update IDs and isolate restarts', async t => {
  const { env } = fixture(t);
  const body = update();
  assert.equal(await claimTagRunCommand(body, env), true);
  let executions = 0;
  await runClaimedTagRunCommand(body, env, async () => { executions++; throw new Error('ambiguous'); });
  // No process-local state is involved in claims.
  assert.equal(await claimTagRunCommand(body, { ...env }), false);
  assert.equal(await claimTagRunCommand({ ...body, update_id: 2 }, env), false);
  const next = update('/top', false, 3);
  assert.equal(await claimTagRunCommand(next, env), true);
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = query => {
    if (query.startsWith('UPDATE')) throw new Error('D1 unavailable');
    return prepare(query);
  };
  await runClaimedTagRunCommand(next, env, async () => { executions++; });
  assert.equal(await claimTagRunCommand(next, env), false);
  assert.equal(executions, 2);
});

test('different bot namespaces and new user messages can execute; invalid identities fail closed', async t => {
  const { env } = fixture(t);
  const body = update();
  assert.equal(await claimTagRunCommand(body, env), true);
  assert.equal(await claimTagRunCommand(body, { ...env, TELEGRAM_BOT_TOKEN: '654321:fixture' }), true);
  assert.equal(await claimTagRunCommand(update('/top', false, 2), env), true);
  await assert.rejects(claimTagRunCommand({ ...body, update_id: undefined }, env), /identity_invalid/);
});

test('a lost send acknowledgement cannot send an error fallback or repeat on webhook retry', async t => {
  const { env } = fixture(t);
  const pending = [];
  let sends = 0;
  t.mock.method(globalThis, 'fetch', async () => { sends++; throw new Error('accepted but ack lost'); });
  const body = update('/taghelp');
  const ctx = { waitUntil(p) { pending.push(p); } };
  assert.equal((await worker.fetch(request(body), env, ctx)).status, 200);
  await Promise.all(pending);
  assert.equal((await worker.fetch(request(body), env, ctx)).status, 200);
  assert.equal(sends, 1);
});

test('synchronous fallback still deduplicates commands without an execution context', async t => {
  const { env } = fixture(t);
  let sends = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    sends++;
    return Response.json({ ok: true, result: { message_id: 99 } });
  });
  const body = update('/taghelp');
  assert.equal((await worker.fetch(request(body), env)).status, 200);
  assert.equal((await worker.fetch(request(body), env)).status, 200);
  assert.equal(sends, 1);
});
