import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync('js/identity-gate.js', 'utf8');
const ID = '123456789';
function sessionData(suffix = 'A') {
  return { ok: true, linked: true, telegram_id: ID, display_name: 'Returning player', csrf_token: 'csrf-test',
    telegram_auth: { id: ID, first_name: 'Returning', auth_date: Math.floor(Date.now() / 1000), hash: 's1_' + suffix.repeat(43), expires_at: Math.floor(Date.now() / 1000) + 300 } };
}
function browser({ seed = {}, fetchImpl = async () => Response.json(sessionData()) } = {}) {
  const storage = new Map(Object.entries(seed));
  const calls = [], events = [], timers = [], navigation = [];
  const location = { hostname: 'cryptomoonboys.com', origin: 'https://cryptomoonboys.com', pathname: '/games/', search: '',
    assign: value => navigation.push(value), reload: () => navigation.push('reload') };
  const window = { location, MOONBOYS_API: { BASE_URL: 'https://api.cryptomoonboys.com' }, setInterval: fn => timers.push(fn),
    dispatchEvent: event => events.push(event), alert() {} };
  const document = { readyState: 'complete', hidden: false, addEventListener() {}, getElementById() { return null; },
    createElement() { return { appendChild() {}, setAttribute() {}, querySelector() { return { addEventListener() {}, focus() {} }; }, addEventListener() {} }; },
    head: { appendChild() {} }, body: { appendChild() {} } };
  const context = vm.createContext({ window, document, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    fetch: async (...args) => { calls.push(args); return fetchImpl(...args); }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, console });
  vm.runInContext(source, context);
  return { gate: window.MOONBOYS_IDENTITY, storage, calls, events, timers, navigation, document };
}

test('bootstrap activates verified identity, preserves memory-only proof and avoids a mandatory bot link', async () => {
  const b = browser({ seed: { moonboys_tg_id: '999999', moonboys_tg_auth: '{"id":"999999"}' } });
  const result = await b.gate.ready;
  assert.equal(result.telegram_id, ID);
  assert.equal(b.gate.getIdentityTier(), 'telegram_linked');
  assert.equal(b.gate.getSignedTelegramAuth().hash, sessionData().telegram_auth.hash);
  assert.equal(b.storage.get('moonboys_tg_id'), ID);
  assert.equal(b.storage.get('moonboys_tg_auth'), undefined);
  assert.equal(b.storage.get('MOONBOYS_TELEGRAM_AUTH'), undefined);
  assert.equal(JSON.stringify([...b.storage]).includes('s1_'), false);
  assert.equal(JSON.stringify([...b.storage]).includes('csrf-test'), false);
  assert.equal(b.calls[0][1].credentials, 'include');
  assert.match(b.calls[0][0], /\/telegram\/website\/session$/);
  const competitive = await b.gate.enforceCompetitiveArcadePageGate({ game_id: 'snake' });
  assert.equal(competitive.ok, true);
  assert.equal(competitive.verified_by_server, true);
  assert.equal(competitive.telegram_id, ID);
  assert.equal(b.calls.some(([url]) => url.includes('/telegram/link/confirm')), false);
  assert.equal(b.events.filter(event => event.type === 'moonboys:telegram-session').length, 1, 'renewal cannot create refresh event loops');
});

test('competitive page waits for cookie restoration before deciding identity tier', async () => {
  let finish;
  const b = browser({ fetchImpl: url => url.endsWith('/session') ? new Promise(resolve => { finish = resolve; }) : Response.json(sessionData()) });
  const gateResult = b.gate.enforceCompetitiveArcadePageGate({ game_id: 'snake' });
  finish(Response.json(sessionData()));
  assert.equal((await gateResult).ok, true);
});

test('fresh-auth renewal uses cookie plus CSRF and rotates only the in-memory access credential', async () => {
  const b = browser({ fetchImpl: async url => Response.json(sessionData(url.endsWith('/renew') ? 'B' : 'A')) });
  await b.gate.ready;
  const proof = await b.gate.getFreshTelegramAuth({ force: true });
  assert.equal(proof.hash, 's1_' + 'B'.repeat(43));
  assert.equal(b.calls[1][1].method, 'POST');
  assert.equal(b.calls[1][1].headers['X-Moonboys-CSRF'], 'csrf-test');
  assert.equal(b.calls[1][1].credentials, 'include');
  assert.equal(JSON.stringify([...b.storage]).includes('s1_'), false);
});

test('expired sessions clear website activation and cannot fall back to stale browser proof', async () => {
  const b = browser({ fetchImpl: async url => url.endsWith('/renew') ? Response.json({ error: 'website_session_expired' }, { status: 401 }) : Response.json(sessionData()) });
  await b.gate.ready;
  assert.equal(await b.gate.getFreshTelegramAuth({ force: true }), null);
  assert.equal(b.gate.isTelegramLinked(), false);
  assert.equal(b.gate.getSignedTelegramAuth(), null);
  assert.equal(b.storage.get('moonboys_tg_session_mode'), undefined);
});

test('legacy bot-linked identity remains available when no website session exists', async () => {
  const proof = { id: ID, auth_date: Math.floor(Date.now() / 1000), hash: 'a'.repeat(64) };
  const b = browser({ seed: { moonboys_tg_id: ID, moonboys_tg_linked: '1', moonboys_tg_auth: JSON.stringify(proof) },
    fetchImpl: async () => Response.json({ error: 'website_session_expired' }, { status: 401 }) });
  await b.gate.ready;
  assert.equal(b.gate.isTelegramLinked(), true);
  assert.equal((await b.gate.getFreshTelegramAuth()).hash, proof.hash);
});

test('a local website flag or an opaque credential in legacy storage cannot activate access', async () => {
  for (const extra of [{ moonboys_tg_session_mode: 'website' }, { moonboys_tg_auth: JSON.stringify(sessionData().telegram_auth) }]) {
    const b = browser({ seed: { moonboys_tg_id: ID, moonboys_tg_linked: '1', ...extra }, fetchImpl: async () => Response.json({ error: 'website_session_expired' }, { status: 401 }) });
    await b.gate.ready;
    assert.equal(b.gate.getSignedTelegramAuth(), null);
    assert.equal(b.gate.getSyncState().good, false);
  }
});

test('logout waits for server revocation before clearing identity and reloading', async () => {
  const b = browser();
  await b.gate.ready;
  await b.gate.logout();
  assert.match(b.calls.at(-1)[0], /\/logout$/);
  assert.equal(b.calls.at(-1)[1].headers['X-Moonboys-CSRF'], 'csrf-test');
  assert.equal(b.gate.isTelegramLinked(), false);
  assert.equal(b.navigation.at(-1), 'reload');
});

test('a failed logout retains identity and reports that revocation is unconfirmed', async () => {
  const b = browser({ fetchImpl: async url => url.endsWith('/logout') ? Response.json({ error: 'offline' }, { status: 503 }) : Response.json(sessionData()) });
  await b.gate.ready;
  await assert.rejects(b.gate.logout(), /Logout could not be confirmed/);
  assert.equal(b.gate.isTelegramLinked(), true);
  assert.equal(b.navigation.length, 0);
});

test('desktop/mobile login uses a browser redirect and hidden pages do not renew', async () => {
  const b = browser();
  await b.gate.ready;
  b.gate.loginWithTelegram();
  assert.match(b.navigation[0], /^https:\/\/api\.cryptomoonboys\.com\/telegram\/website\/start\?return_to=/);
  const before = b.calls.length;
  b.document.hidden = true;
  b.timers[0]();
  assert.equal(b.calls.length, before);
});
