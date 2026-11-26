import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';
import { handleSwarmsyWebChat } from '../workers/moonboys-api/routes/swarmsy-web-chat.js';

const origin = 'https://cryptomoonboys.com';
const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
const conversation = '01234567-0123-4123-8123-012345678901';
const nextConversation = '11234567-0123-4123-8123-012345678901';
const botToken = '123:test-token';
const token = 'T'.repeat(64);

function signedTelegram(id) {
  const auth_date = String(Math.floor(Date.now() / 1000));
  const key = createHash('sha256').update(botToken).digest();
  const hash = createHmac('sha256', key).update(`auth_date=${auth_date}\nid=${id}`).digest('hex');
  return { id, auth_date, hash };
}

function env(overrides = {}) {
  const allowance = { limit: async () => ({ success: true }) };
  return {
    TELEGRAM_BOT_TOKEN: botToken,
    SWARMSY_WEB_TOKEN: token,
    SWARMSY_WEB_SESSION_KEY: 'K'.repeat(64),
    SWARMSY_USER_LIMIT: allowance,
    SWARMSY_SITE_LIMIT: allowance,
    ...overrides,
  };
}

function request(body, method = 'POST', requestOrigin = origin) {
  return new Request('https://api.cryptomoonboys.com/swarmsy/chat', {
    method,
    headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function chat(overrides = {}) {
  return {
    telegram_auth: signedTelegram('123'),
    conversation_id: conversation,
    message: 'Plan a campaign.',
    ...overrides,
  };
}

test('only verified Telegram users reach the dedicated SPARKY server', async context => {
  const upstream = context.mock.method(globalThis, 'fetch', async () => Response.json({ reply: 'Ready' }));
  const unsigned = await handleSwarmsyWebChat(request(chat({ telegram_auth: { id: '123' } })), env(), cors);
  assert.equal(unsigned.status, 401);
  const forged = await handleSwarmsyWebChat(request(chat({
    telegram_auth: { ...signedTelegram('123'), id: '999' },
  })), env(), cors);
  assert.equal(forged.status, 401);
  assert.equal(upstream.mock.callCount(), 0);
  const notConfigured = await handleSwarmsyWebChat(request(chat()), env({ SWARMSY_WEB_SESSION_KEY: token }), cors);
  assert.equal(notConfigured.status, 503);
  const rateLimited = await handleSwarmsyWebChat(request(chat()), env({
    SWARMSY_USER_LIMIT: { limit: async () => ({ success: false }) },
  }), cors);
  assert.equal(rateLimited.status, 429);
  assert.equal(upstream.mock.callCount(), 0);
});

test('allows expected CORS preflight and rejects other origins and oversized bodies', async () => {
  const preflight = await handleSwarmsyWebChat(request(undefined, 'OPTIONS'), env(), cors);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  const foreign = await handleSwarmsyWebChat(request(chat(), 'POST', 'https://other.example'), env(), {});
  assert.equal(foreign.status, 403);
  const large = await handleSwarmsyWebChat(request(chat({ extra: 'x'.repeat(17_000) })), env(), cors);
  assert.equal(large.status, 400);
});

test('website sign-in maps the verified ID and denies revoked or blocked sessions', async context => {
  const upstream = context.mock.method(globalThis, 'fetch', async () => Response.json({ reply: 'Ready' }));
  const websiteAuth = { id: '123', hash: 's1_' + 'A'.repeat(43) };
  function db(row) {
    return { prepare: () => ({ bind: () => ({ first: async () => row }) }) };
  }
  const valid = await handleSwarmsyWebChat(request(chat({ telegram_auth: websiteAuth })), env({
    DB: db({ telegram_id: '123' }),
  }), cors);
  assert.equal(valid.status, 200);
  const revoked = await handleSwarmsyWebChat(request(chat({ telegram_auth: websiteAuth })), env({ DB: db(null) }), cors);
  assert.equal(revoked.status, 401);
  const blocked = await handleSwarmsyWebChat(request(chat({ telegram_auth: websiteAuth })), env({
    DB: db({ telegram_id: '123', is_blocked: 1 }),
  }), cors);
  assert.equal(blocked.status, 403);
  assert.equal(upstream.mock.callCount(), 1);
});

test('uses opaque, account-bound sessions and never shares Telegram credentials or upstream extras', async context => {
  const sessions = [];
  const upstream = context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://swarmsy.cryptomoonboys.com/api/sparky-web/chat');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    const payload = JSON.parse(options.body);
    assert.deepEqual(Object.keys(payload).sort(), ['message', 'searchCanon', 'session', 'sources']);
    assert.equal(payload.searchCanon, false);
    assert.deepEqual(payload.sources, []);
    assert.match(payload.session, /^[0-9a-f]{64}$/);
    sessions.push(payload.session);
    return Response.json({ reply: 'Ready', sources: ['https://brain.cryptomoonboys.com/api/context'], token });
  });
  for (const body of [
    chat({ workspace: 'admin' }), chat(), chat({ telegram_auth: signedTelegram('999') }),
    chat({ conversation_id: nextConversation }),
  ]) {
    const response = await handleSwarmsyWebChat(request(body), env(), cors);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reply: 'Ready', sources: [], canon: 'off' });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  assert.equal(upstream.mock.callCount(), 4);
  assert.equal(sessions[0], sessions[1]);
  assert.equal(new Set(sessions).size, 3);
});

test('does not follow upstream redirects with the bridge token', async context => {
  const upstream = context.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.redirect, 'manual');
    return Response.redirect('https://example.com/redirected', 307);
  });
  const response = await handleSwarmsyWebChat(request(chat()), env(), cors);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'chat_unavailable' });
  assert.equal(upstream.mock.callCount(), 1);
});

test('deeper lookup sends published wiki excerpts and rejects private, redirect and noindex sources', async context => {
  const title = 'The Ninth Berth';
  const wiki = '/wiki/the-ninth-berth.html';
  const noindex = '/wiki/the-ninth-berth-hidden.html';
  const redirect = '/wiki/the-ninth-berth-redirect.html';
  const privatePath = '/admin/the-ninth-berth.html';
  const text = 'The Ninth Berth is in the Waterfront. The old gate is listed in the public record.';
  const contacts = [];
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    const { origin: host, pathname } = new URL(url);
    contacts.push(url);
    if (host !== origin) {
      const payload = JSON.parse(options.body);
      assert.equal(payload.searchCanon, true);
      assert.deepEqual(payload.sources, [{ title, url: origin + wiki, excerpt: text }]);
      return Response.json({ reply: 'It is in the Waterfront.' });
    }
    if (pathname === '/brain-feed/index.json') return new Response(null, { status: 404 });
    if (pathname === '/js/wiki-index.json') {
      return Response.json([
        { title, url: wiki }, { title, url: noindex }, { title, url: redirect }, { title, url: privatePath },
      ]);
    }
    if (pathname === '/sitemap.xml') return new Response('<urlset></urlset>');
    if (pathname === '/js/leader-lore-sources.json') return Response.json([wiki, noindex, redirect, privatePath]);
    if (pathname === wiki) return new Response(`<html><main><p>${text}</p></main></html>`);
    if (pathname === noindex) return new Response(`<html><main><p>${text}</p></main></html>`, {
      headers: { 'X-Robots-Tag': 'noindex' },
    });
    if (pathname === redirect) return Response.redirect('https://brain.cryptomoonboys.com/');
    throw new Error('unexpected request: ' + url);
  });
  const response = await handleSwarmsyWebChat(request(chat({ message: 'Where is the Ninth Berth?' })), env(), cors);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    reply: 'It is in the Waterfront.',
    canon: 'found',
    sources: [{ title, url: origin + wiki }],
  });
  assert.ok(contacts.includes(origin + noindex));
  assert.ok(contacts.includes(origin + redirect));
  assert.ok(contacts.every(url => !url.includes('brain.cryptomoonboys.com') && !url.includes(privatePath)));
});

test('uses the current published Brain snapshot on each request, including NFT sources', async context => {
  const route = '/data/gkniftyheads/live-template-supply.json';
  const urls = [];
  let update = 1;
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    urls.push(url);
    const title = 'Ninth Berth NFT template supply';
    const kind = 'nft';
    const body = JSON.stringify({ supplies: [
      { template_id: 999999, live_supply: 88, source_url: 'https://example.com/nft' },
      { template_id: 773225, issued_supply: 20, live_supply: update },
    ] }, null, 2);
    const expected = `template_id: 773225; issued_supply: 20; live_supply: ${update}`;
    const record = JSON.stringify({ path: route, title, kind, body }) + '\n';
    const sha256 = createHash('sha256').update(record).digest('hex');
    if (url.endsWith('/brain-feed/index.json')) {
      assert.equal(options.cache, 'no-store');
      return Response.json({
        schema_version: 1, revision: String(update).repeat(40),
        records: [{ path: route, title, description: body, kind, sha256, bytes: Buffer.byteLength(record) }],
      });
    }
    if (url.endsWith('/brain-feed/records/' + sha256 + '.json')) return new Response(record);
    assert.equal(url, 'https://swarmsy.cryptomoonboys.com/api/sparky-web/chat');
    const sent = JSON.parse(options.body);
    assert.deepEqual(sent.sources, [{ title, url: origin + route, excerpt: expected }]);
    return Response.json({ reply: expected });
  });
  for (update of [1, 2]) {
    const result = await handleSwarmsyWebChat(request(chat({ message: 'How many copies are in template 773225? https://cryptomoonboys.com/data/gkniftyheads/live-template-supply.json' })), env(), cors);
    assert.equal(result.status, 200);
    const value = await result.json();
    assert.equal(value.canon, 'found');
    assert.equal(value.reply, `template_id: 773225; issued_supply: 20; live_supply: ${update}`);
    assert.deepEqual(value.sources, [{ title: 'Ninth Berth NFT template supply', url: origin + route }]);
  }
  assert.equal(new Set(urls.filter(url => url.includes('/brain-feed/records/'))).size, 2);
});

test('answers an exact NFT supply question from the verified snapshot without relying on the model', async context => {
  const path = '/data/gkniftyheads/live-template-supply.json';
  const title = 'GKniftyHEADS template supply';
  const kind = 'nft';
  const checkedAt = '2026-11-26T12:45:07.298Z';
  let live = 20;
  let status = 'ok';
  let tampered = false;
  let record;
  let sha256;
  const fetched = context.mock.method(globalThis, 'fetch', async url => {
    if (url === origin + '/brain-feed/index.json') {
      record = JSON.stringify({ path, title, kind, body: JSON.stringify({
        collection: 'gkniftyheads',
        supplies: [
          { template_id: 999999, issued_supply: 91, live_supply: 88, live_supply_status: 'ok' },
          { template_id: 773225, issued_supply: 20, live_supply: live, live_supply_status: status, last_checked_at: checkedAt },
        ],
      }) });
      sha256 = createHash('sha256').update(record).digest('hex');
      return Response.json({
        schema_version: 1, revision: sha256.slice(0, 40),
        records: [{ path, title, description: '', kind, sha256, bytes: Buffer.byteLength(record) }],
      });
    }
    assert.equal(url, origin + '/brain-feed/records/' + sha256 + '.json');
    return new Response(tampered ? record.replace('gkniftyheads', 'xxxxxxxxxxxx') : record);
  });
  const message = 'How many issued and live copies does GKniftyHEADS template 773225 have';
  const send = (question = message) => handleSwarmsyWebChat(request(chat({ message: question })), env(), cors);
  const unsigned = await handleSwarmsyWebChat(request(chat({ message, telegram_auth: {} })), env(), cors);
  assert.equal(unsigned.status, 401);
  assert.equal(fetched.mock.callCount(), 0);

  assert.deepEqual(await (await send()).json(), {
    reply: 'The published supply for GKniftyHEADS template 773225 is **20 issued and 20 live** (checked 2026-11-26 UTC).',
    sources: [{ title, url: origin + path }],
    canon: 'found',
  });
  live = 0;
  assert.match((await (await send()).json()).reply, /20 issued and 0 live/);
  status = 'unavailable';
  assert.equal((await (await send()).json()).canon, 'unavailable');
  assert.match((await (await send('What is the issued supply for GKniftyHEADS template #773225?')).json()).reply, /20 issued/);
  assert.equal((await (await send(message.replace('773225', '111111'))).json()).canon, 'unavailable');
  tampered = true;
  assert.equal((await (await send()).json()).canon, 'unavailable');
});
