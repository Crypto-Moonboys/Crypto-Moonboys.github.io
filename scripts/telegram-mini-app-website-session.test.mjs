import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { handleTelegramWebsiteAuth } from '../workers/moonboys-api/telegram-website-auth.js';
import { API, SITE, ID, BOT_TOKEN, now, fixture, session } from './lib/telegram-website-auth-fixtures.mjs';

function proof(user = { id: Number(ID), username: 'test_returning', first_name: 'Returning' }, time = now()) {
  const params = new URLSearchParams({ auth_date: String(time), user: JSON.stringify(user), query_id: 'unique-fixture' });
  const check = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => k + '=' + v).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
function request(env, initData, { origin = SITE, host = API, cookie = '', db = env.DB } = {}) {
  return handleTelegramWebsiteAuth(new Request(host + '/telegram/website/mini-app-session', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ init_data: initData }),
  }), { ...env, DB: db });
}
function sessionCookie(response) {
  const cookies = response.headers.getSetCookie();
  return cookies.find(s => s.startsWith('__Host-moonboys_session='))?.split(';')[0] || '';
}
function counts(sqlite) {
  return ['telegram_website_sessions', 'telegram_mini_app_login_replay'].map(table =>
    sqlite.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n);
}

test('Mini App creates the existing website credential and preserves player progression', async () => {
  const { env, sqlite } = fixture();
  const before = sqlite.prepare('SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id=?').get(ID).arcade_xp_total;
  const first = await request(env, proof());
  assert.equal(first.status, 200, await first.clone().text());
  assert.match(first.headers.get('Set-Cookie') || '', /__Host-moonboys_session=.*Secure; HttpOnly; SameSite=Strict/);
  const payload = await first.json();
  assert.equal(payload.linked, true);
  assert.equal(payload.telegram_id, ID);
  assert.equal(payload.telegram_auth.id, ID);
  assert.match(payload.telegram_auth.hash, /^s1_/);
  assert.ok(payload.csrf_token);
  const cookie = sessionCookie(first);
  assert.ok(cookie);
  assert.equal((await session(env, cookie)).status, 200);
  assert.equal(sqlite.prepare('SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id=?').get(ID).arcade_xp_total, before);
  assert.deepEqual(counts(sqlite), [1, 1]);
  // The same verified identity is idempotent even though the proof was consumed.
  const second = await request(env, proof(), { cookie });
  assert.equal(second.status, 200, await second.clone().text());
  assert.equal(second.headers.get('Set-Cookie'), null);
  assert.deepEqual(counts(sqlite), [1, 1]);
});

test('Mini App signatures cannot be replayed, including case-variant hex or lost cookies', async () => {
  const { env, sqlite } = fixture();
  const signed = proof();
  assert.equal((await request(env, signed)).status, 200);
  assert.equal((await request(env, signed)).status, 503); // UNIQUE constraint caught as unavailable, no cookie
  const upper = new URLSearchParams(signed);
  upper.set('hash', upper.get('hash').toUpperCase());
  const reused = await request(env, upper.toString());
  assert.equal(reused.status, 503);
  assert.equal(reused.headers.get('Set-Cookie'), null);
  assert.deepEqual(counts(sqlite), [1, 1]);
  const expiresAt = sqlite.prepare('SELECT expires_at FROM telegram_mini_app_login_replay').get().expires_at;
  assert.equal(expiresAt, Number(new URLSearchParams(signed).get('auth_date')) + 301);
});

test('Mini App rejects invalid, duplicate, expired, future and malformed launch evidence', async () => {
  const { env, sqlite } = fixture();
  const good = proof(), damaged = new URLSearchParams(good);
  damaged.set('user', JSON.stringify({ id: 55 }));
  const bad = [
    damaged.toString(), good + '&hash=' + new URLSearchParams(good).get('hash'),
    proof(undefined, now() - 301), proof(undefined, now() + 301),
    'user=broken&auth_date=' + now(), '',
  ];
  for (const value of bad) {
    const response = await request(env, value);
    assert.equal(response.status, 401, value);
    assert.equal(response.headers.get('Set-Cookie'), null);
  }
  assert.deepEqual(counts(sqlite), [0, 0]);
});

test('Mini App enforces allowed website origins, exact API hostname, blocked users and account switching', async () => {
  const { env, sqlite } = fixture();
  const signed = proof();
  assert.equal((await request(env, signed, { origin: 'https://malicious.example' })).status, 403);
  assert.equal((await request(env, signed, { host: 'https://different-api.example' })).status, 503);
  assert.deepEqual(counts(sqlite), [0, 0]);
  sqlite.prepare('INSERT INTO telegram_anticheat_state (telegram_id, is_blocked) VALUES (?, 1)').run(ID);
  assert.equal((await request(env, signed)).status, 403);
  sqlite.prepare('DELETE FROM telegram_anticheat_state WHERE telegram_id = ?').run(ID);
  const first = await request(env, signed);
  assert.equal(first.status, 200);
  const cookie = sessionCookie(first);
  // The caller's signed account B cannot inherit the existing A cookie.
  const other = await request(env, proof({ id: 987654321, first_name: 'Other' }), { cookie });
  assert.equal(other.status, 409);
  assert.equal(other.headers.get('Set-Cookie'), null);
  assert.deepEqual(counts(sqlite), [1, 1]);
});

test('Mini App D1 write failures never issue an unconfirmed website cookie', async () => {
  const { env, sqlite } = fixture();
  const failed = await request(env, proof(), {
    db: { ...env.DB, prepare: sql => env.DB.prepare(sql), batch: async () => { throw new Error('simulated database failure'); } },
  });
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('Set-Cookie'), null);
  assert.deepEqual(counts(sqlite), [0, 0]);
});


test('same-account website cookie restores after fresh-launch expiry without trusting a different account', async () => {
  const { env, sqlite } = fixture();
  const freshProof = proof();
  const first = await request(env, freshProof);
  assert.equal(first.status, 200, await first.clone().text());
  const cookie = sessionCookie(first);
  assert.ok(cookie);
  const olderProof = proof(undefined, now() - 600);
  const existing = await request(env, olderProof, { cookie });
  assert.equal(existing.status, 200, await existing.clone().text());
  assert.equal((await existing.json()).telegram_id, ID);
  assert.equal(existing.headers.get('Set-Cookie'), null, 'Already valid session does not rotate cookie');
  assert.deepEqual(counts(sqlite), [1, 1], 'Existing cookie restoration consumes no extra launch replay');

  const unbound = await request(env, olderProof);
  assert.equal(unbound.status, 401, 'Old signature never issues a new cookie session');
  assert.equal(unbound.headers.get('Set-Cookie'), null);
  const switched = await request(env, proof({ id: 987654321, first_name: 'Other' }, now() - 600), { cookie });
  assert.equal(switched.status, 409, 'Old signed proof cannot swap an active website session');
  const tooOld = await request(env, proof(undefined, now() - 3601), { cookie });
  assert.equal(tooOld.status, 401, 'Cookie-bound signature still has a maximum validation age');
  assert.deepEqual(counts(sqlite), [1, 1]);
});

test('failed credential INSERT rolls back replay, account metadata and session, allowing identical proof retry', async () => {
  const { env, sqlite } = fixture();
  const signed = proof();
  const before = sqlite.prepare('SELECT username, first_name FROM telegram_users WHERE telegram_id=?').get(ID);
  const injectedDb = {
    prepare(sql) { return env.DB.prepare(sql); },
    batch(statements) {
      assert.equal(statements.length, 5, 'Replay, user, website session, credential and cleanup must be one batch');
      const sabotaged = statements.map((statement, index) => index === 4
        ? { run: async () => { throw new Error('credential insert temporarily failed'); } }
        : statement);
      return env.DB.batch(sabotaged);
    },
  };
  const failed = await request(env, signed, { db: injectedDb });
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('Set-Cookie'), null);
  assert.deepEqual(counts(sqlite), [0, 0], 'Transaction rollback leaves no replay or orphan session');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_website_credentials').get().n, 0);
  assert.deepEqual(sqlite.prepare('SELECT username, first_name FROM telegram_users WHERE telegram_id=?').get(ID), before,
    'Failed issuance does not alter returning account metadata');

  const recovered = await request(env, signed);
  assert.equal(recovered.status, 200, await recovered.clone().text());
  assert.ok(sessionCookie(recovered), 'Original signed proof can recover after an aborted batch');
  assert.deepEqual(counts(sqlite), [1, 1]);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_website_credentials').get().n, 1);
});
