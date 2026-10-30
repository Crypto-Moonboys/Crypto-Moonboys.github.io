import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  checkTelegramGroupMember,
  handleTelegramGroupMembership,
} from '../workers/moonboys-api/telegram-group-membership.js';

const TOKEN = '123456:group-membership-fixture-token';
const GROUP = '-1001234567890';
const OWNER = '123456789';
const SITE = 'https://cryptomoonboys.com';
const API = 'https://api.cryptomoonboys.com/telegram/group-membership';

function auth(id = OWNER) {
  const fields = {
    id: String(id),
    first_name: 'Fixture',
    username: 'fixture_member',
    auth_date: String(Math.floor(Date.now() / 1000)),
  };
  const check = Object.keys(fields).sort()
    .map(key => key + '=' + fields[key]).join('\n');
  const secret = createHash('sha256').update(TOKEN).digest();
  return {
    ...fields,
    hash: createHmac('sha256', secret).update(check).digest('hex'),
  };
}

function miniAppInitData(id = OWNER) {
  const user = JSON.stringify({ id: Number(id), first_name: 'Mini App Fixture', username: 'fixture_member' });
  const authDate = String(Math.floor(Date.now() / 1000));
  const params = new URLSearchParams({
    auth_date: authDate,
    query_id: 'fixture-query',
    user,
  });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + '=' + value).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

function env(overrides = {}) {
  return {
    TELEGRAM_BOT_TOKEN: TOKEN,
    TELEGRAM_GROUP_CHAT_ID: GROUP,
    // Legacy HMAC auth never enters website credential D1 reads, but the live
    // endpoint intentionally requires the configured production DB binding.
    DB: {},
    ...overrides,
  };
}

function request(body = { telegram_auth: auth() }, init = {}) {
  return new Request(API, {
    method: 'POST',
    headers: {
      Origin: SITE,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    body: JSON.stringify(body),
    ...init,
  });
}

function telegram(status, { isMember } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, body });
    if (/\/getMe$/.test(url)) {
      return new Response(JSON.stringify({
        ok: true,
        result: { id: 123456, is_bot: true, first_name: 'WikiComs', username: 'WIKICOMSBOT' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      ok: true,
      result: {
        status,
        user: { id: Number(OWNER), is_bot: false, first_name: 'Fixture' },
        ...(status === 'restricted' ? { is_member: isMember === true } : {}),
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetchImpl };
}

for (const status of ['creator', 'administrator', 'member']) {
  test('accepts Telegram ChatMember status ' + status, async () => {
    const mock = telegram(status);
    const response = await handleTelegramGroupMembership(request(), env(), mock.fetchImpl);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true, member: true, status, group: '@gkniftyheads',
    });
    assert.equal(mock.calls.length, 1);
    assert.match(mock.calls[0].url, /\/getChatMember$/);
    assert.deepEqual(mock.calls[0].body, {
      chat_id: GROUP, user_id: Number(OWNER),
    });
  });
}

test('accepts signed Telegram Mini App initData for native game membership checks', async () => {
  const mock = telegram('member');
  const response = await handleTelegramGroupMembership(
    request({ init_data: miniAppInitData() }),
    env(),
    mock.fetchImpl,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true, member: true, status: 'member', group: '@gkniftyheads',
  });
  const lookup = mock.calls.find(call => /\/getChatMember$/.test(call.url));
  assert.deepEqual(lookup.body, { chat_id: GROUP, user_id: Number(OWNER) });
});

test('restricted user counts only when Telegram says is_member=true', async () => {
  for (const [isMember, expected] of [[true, true], [false, false]]) {
    const mock = telegram('restricted', { isMember });
    const response = await handleTelegramGroupMembership(request(), env(), mock.fetchImpl);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).member, expected);
  }
});

for (const status of ['left', 'kicked']) {
  test('blocks ChatMember status ' + status, async () => {
    const mock = telegram(status);
    const response = await handleTelegramGroupMembership(request(), env(), mock.fetchImpl);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true, member: false, status, group: '@gkniftyheads',
    });
  });
}

test('fails closed when Telegram membership lookup is unavailable', async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ ok: false, description: 'not enough rights' }),
    { status: 400, headers: { 'Content-Type': 'application/json' } }
  );
  const response = await handleTelegramGroupMembership(request(), env(), fetchImpl);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'telegram_group_membership_unavailable');
});

test('rejects unverified Telegram identity before calling Telegram Bot API', async () => {
  let called = false;
  const response = await handleTelegramGroupMembership(
    request({ telegram_auth: { id: OWNER, auth_date: '1', hash: '0'.repeat(64) } }),
    env(),
    async () => { called = true; throw Error('must not call'); }
  );
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test('requires production group and bot configuration', async () => {
  for (const overrides of [
    { TELEGRAM_BOT_TOKEN: '' },
    { TELEGRAM_GROUP_CHAT_ID: '' },
    { DB: null },
  ]) {
    const response = await handleTelegramGroupMembership(request(), env(overrides), async () => {
      throw Error('must not call Telegram');
    });
    assert.equal(response.status, 503);
  }
});

test('CORS and readiness handling fail closed', async () => {
  const disallowed = await handleTelegramGroupMembership(
    new Request(API, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: auth() }),
    }),
    env(),
    async () => { throw Error('must not call'); }
  );
  assert.equal(disallowed.status, 403);
  assert.equal(disallowed.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(disallowed.headers.get('Access-Control-Allow-Credentials'), null);

  // The Telegram launcher fetches this cross-origin route with
  // credentials: 'include'. Browsers require ACA-Credentials on both
  // preflight and actual responses or throw an opaque Failed to fetch.
  const allowed = await handleTelegramGroupMembership(
    request({ init_data: miniAppInitData() }), env(), telegram('member').fetchImpl
  );
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), SITE);
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), 'true');

  const options = await handleTelegramGroupMembership(new Request(API, {
    method: 'OPTIONS', headers: { Origin: SITE },
  }), env());
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('Access-Control-Allow-Origin'), SITE);
  assert.equal(options.headers.get('Access-Control-Allow-Credentials'), 'true');

  const admin = telegram('administrator');
  const get = await handleTelegramGroupMembership(new Request(API, {
    method: 'GET', headers: { Origin: SITE },
  }), env(), admin.fetchImpl);
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), {
    ok:true, configured:true, bot_admin:true,
    bot_status:'administrator', bot_username:'WIKICOMSBOT',
    native_init_data:true, all_games_gate_version:1,
    group:'@gkniftyheads'
  });
  const adminMembershipCall = admin.calls.find(call => /\/getChatMember$/.test(call.url));
  assert.deepEqual(adminMembershipCall.body, {
    chat_id:GROUP, user_id:123456,
  });

  const ordinary = telegram('member');
  const notAdmin = await handleTelegramGroupMembership(new Request(API, {
    method: 'GET', headers: { Origin: SITE },
  }), env(), ordinary.fetchImpl);
  assert.equal(notAdmin.status, 503);
  assert.deepEqual(await notAdmin.json(), {
    ok:false,
    error:'telegram_group_membership_bot_not_admin',
    bot_status:'member',
    bot_username:'WIKICOMSBOT'
  });
});

test('direct checker rejects unsafe Telegram numeric ids', async () => {
  const result = await checkTelegramGroupMember(env(), '99999999999999999999', async () => {
    throw Error('must not call');
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});
