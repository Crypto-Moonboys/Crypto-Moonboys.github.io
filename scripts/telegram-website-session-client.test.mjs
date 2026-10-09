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
function browser({ seed = {}, storage = new Map(Object.entries(seed)), fetchImpl = async () => Response.json(sessionData()), capability = { ok: true, enabled: true }, config = { BASE_URL: 'https://api.cryptomoonboys.com' }, readyState = 'complete' } = {}) {
  const calls = [], events = [], timers = [], navigation = [];
  const deadlines = new Map();
  let timerId = 0;
  const location = { hostname: 'cryptomoonboys.com', origin: 'https://cryptomoonboys.com', pathname: '/games/', search: '',
    assign: value => navigation.push(value), reload: () => navigation.push('reload') };
  const listeners = {};
  const windowListeners = new Map();
  const nodes = new Map();
  const appendChild = node => { if (node.id) nodes.set(node.id, node); };
  const window = { location, MOONBOYS_API: config, setInterval: fn => timers.push(fn),
    setTimeout: (fn, milliseconds) => { assert.equal(milliseconds, 8000); const id = ++timerId; deadlines.set(id, fn); return id; }, clearTimeout: id => deadlines.delete(id),
    addEventListener(name, fn) { const callbacks = windowListeners.get(name) || []; callbacks.push(fn); windowListeners.set(name, callbacks); },
    dispatchEvent: event => { events.push(event); for (const callback of windowListeners.get(event.type) || []) callback(event); }, alert() {} };
  const document = { readyState, hidden: false, addEventListener(name, fn) { listeners[name] = fn; }, getElementById(id) { return nodes.get(id) || null; },
    createElement() { return { style: {}, appendChild, setAttribute() {}, querySelector() { return { addEventListener() {}, focus() {} }; }, addEventListener() {} }; },
    head: { appendChild }, body: { appendChild } };
  const context = vm.createContext({ window, document, setTimeout: () => 0, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    fetch: async (...args) => { calls.push(args); return args[0].endsWith('/capabilities') ? typeof capability === 'function' ? capability(...args) : Response.json(capability) : fetchImpl(...args); }, AbortController, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, console });
  vm.runInContext(source, context);
  return { gate: window.MOONBOYS_IDENTITY, storage, calls, events, timers, navigation, document, window, listeners, deadlines, context };
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
  assert.equal(b.calls[0][1].credentials, 'omit');
  assert.match(b.calls[0][0], /\/telegram\/website\/capabilities$/);
  assert.equal(b.calls[1][1].credentials, 'include');
  assert.match(b.calls[1][0], /\/telegram\/website\/session$/);
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
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  finish(Response.json(sessionData()));
  assert.equal((await gateResult).ok, true);
});

test('fresh-auth renewal uses cookie plus CSRF and rotates only the in-memory access credential', async () => {
  const b = browser({ fetchImpl: async url => Response.json(sessionData(url.endsWith('/renew') ? 'B' : 'A')) });
  await b.gate.ready;
  const proof = await b.gate.getFreshTelegramAuth({ force: true });
  assert.equal(proof.hash, 's1_' + 'B'.repeat(43));
  assert.equal(b.calls.at(-1)[1].method, 'POST');
  assert.equal(b.calls.at(-1)[1].headers['X-Moonboys-CSRF'], 'csrf-test');
  assert.equal(b.calls.at(-1)[1].credentials, 'include');
  assert.equal(JSON.stringify([...b.storage]).includes('s1_'), false);
});

test('expired sessions clear website activation and cannot fall back to stale browser proof', async () => {
  let expired = false;
  const b = browser({ fetchImpl: async () => expired ? Response.json({ error: 'website_session_expired' }, { status: 401 }) : Response.json(sessionData()) });
  await b.gate.ready;
  expired = true;
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

for (const expired of [false, true]) {
  test(`a differing legacy callback cannot replace ${expired ? 'expired access to' : 'fresh access to'} a website account`, async () => {
    const b = browser();
    await b.gate.ready;
    if (expired) b.gate.getTelegramAuth().expires_at = 1;
    const proof = b.gate.getTelegramAuth();
    const storage = JSON.stringify([...b.storage]);
    const legacy = { id: '987654321', auth_date: Math.floor(Date.now() / 1000), hash: 'b'.repeat(64) };
    const saved = b.gate.saveTelegramIdentity(legacy.id, 'Different account', legacy);
    assert.equal(b.gate.getTelegramId(), ID);
    assert.equal(b.gate.getTelegramAuth(), proof);
    assert.equal(saved, false);
    assert.equal(b.gate.setTelegramLinked(legacy.id, legacy, 'Different account'), false);
    assert.equal(b.gate.saveTelegramIdentity(ID, 'Conflicting proof', legacy), false);
    assert.equal(b.gate.setTelegramLinked(ID, legacy, 'Conflicting proof'), false);
    assert.equal(JSON.stringify([...b.storage]), storage);
  });

  test(`a same-ID legacy callback preserves ${expired ? 'expired' : 'fresh'} website proof and renewal`, async () => {
    const b = browser();
    await b.gate.ready;
    if (expired) b.gate.getTelegramAuth().expires_at = 1;
    const proof = b.gate.getTelegramAuth();
    const storage = JSON.stringify([...b.storage]);
    const legacy = { id: ID, auth_date: Math.floor(Date.now() / 1000), hash: 'b'.repeat(64) };
    b.gate.saveTelegramIdentity(ID, 'Legacy name', legacy);
    assert.equal(b.gate.getTelegramAuth(), proof);
    assert.equal(b.gate.setTelegramLinked(ID, legacy, 'Legacy name'), !expired);
    assert.equal(JSON.stringify([...b.storage]), storage);
    assert.equal((await b.gate.getFreshTelegramAuth({ force: true })).id, ID);
    assert.equal(b.calls.at(-1)[1].headers['X-Moonboys-CSRF'], 'csrf-test');
    assert.equal(b.storage.get('moonboys_tg_session_mode'), 'website');
  });
}

test('legacy callbacks cannot change identity while website bootstrap is pending', async () => {
  let finish;
  const b = browser({ capability: () => new Promise(resolve => { finish = resolve; }) });
  const legacy = { id: '987654321', auth_date: Math.floor(Date.now() / 1000), hash: 'b'.repeat(64) };
  const saved = b.gate.saveTelegramIdentity(legacy.id, 'Legacy', legacy);
  const linked = b.gate.setTelegramLinked(legacy.id, legacy, 'Legacy');
  const stored = JSON.stringify([...b.storage]);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  finish(Response.json({ ok: true, enabled: true }));
  await b.gate.ready;
  assert.equal(saved, false);
  assert.equal(linked, false);
  assert.equal(stored, '[]');
  assert.equal(b.gate.getTelegramId(), ID);
});

test('switching to a legacy account requires confirmed website logout', async () => {
  let failLogout = true;
  const b = browser({ fetchImpl: async url => url.endsWith('/logout')
    ? Response.json(failLogout ? { error: 'unavailable' } : { ok: true }, { status: failLogout ? 503 : 200 }) : Response.json(sessionData()) });
  await b.gate.ready;
  const legacy = { id: '987654321', auth_date: Math.floor(Date.now() / 1000), hash: 'b'.repeat(64) };
  await assert.rejects(b.gate.logout(), /Logout could not be confirmed/);
  assert.equal(b.gate.setTelegramLinked(legacy.id, legacy, 'Legacy'), false);
  assert.equal(b.gate.getTelegramId(), ID);
  failLogout = false;
  await b.gate.logout();
  assert.equal(b.gate.saveTelegramIdentity(legacy.id, 'Legacy', legacy), true);
  assert.equal(b.gate.setTelegramLinked(legacy.id, legacy, 'Legacy'), true);
  assert.equal(b.gate.getSignedTelegramAuth().id, legacy.id);
  assert.equal(b.storage.get('moonboys_tg_session_mode'), undefined);
});

test('logout after a rollback reload obtains CSRF without issuing or restoring gameplay proof', async () => {
  for (const csrf of ['logout-csrf', null]) {
    const b = browser({ capability: { ok: true, enabled: false },
      seed: { moonboys_tg_id: ID, moonboys_tg_linked: '1', moonboys_tg_session_mode: 'website' },
      fetchImpl: async (url, options) => {
        assert.match(url, /\/logout$/);
        return Response.json(options.method === 'POST' ? { ok: true } : { ok: true, csrf_token: csrf });
      } });
    await b.gate.ready;
    assert.equal(b.gate.getTelegramAuth(), null);
    await b.gate.logout();
    assert.equal(b.calls[1][1].credentials, 'include');
    assert.equal(b.calls[1][1].method, undefined);
    assert.equal(b.calls[2][1].method, 'POST');
    assert.equal(b.calls[2][1].headers['X-Moonboys-CSRF'] || null, csrf);
    assert.equal(b.gate.getTelegramId(), null);
    assert.equal(b.navigation.at(-1), 'reload');
    assert.equal(b.calls.some(([url]) => /\/(session|renew)$/.test(url)), false);
  }
});

test('unconfirmed logout preparation retains identity without sending a revocation request', async () => {
  for (const response of [Response.json({ error: 'unavailable' }, { status: 503 }), Response.json({ ok: true })]) {
    const b = browser({ capability: { ok: true, enabled: false },
      seed: { moonboys_tg_id: ID, moonboys_tg_session_mode: 'website' }, fetchImpl: async () => response });
    await b.gate.ready;
    await assert.rejects(b.gate.logout(), /Logout could not be confirmed/);
    assert.equal(b.gate.getTelegramId(), ID);
    assert.equal(b.storage.get('moonboys_tg_session_mode'), 'website');
    assert.equal(b.calls.filter(([, options]) => options.method === 'POST').length, 0);
    assert.equal(b.navigation.length, 0);
  }
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
  await b.gate.loginWithTelegram();
  assert.match(b.navigation[0], /^https:\/\/api\.cryptomoonboys\.com\/telegram\/website\/start\?return_to=/);
  const before = b.calls.length;
  b.document.hidden = true;
  b.timers[0]();
  assert.equal(b.calls.length, before);
});

test('game bootstrap waits for API configuration loaded later in the document', async () => {
  const b = browser({ config: null, readyState: 'loading' });
  assert.equal(b.calls.length, 0);
  b.window.MOONBOYS_API = { BASE_URL: 'https://api.cryptomoonboys.com' };
  b.listeners.DOMContentLoaded?.();
  assert.equal((await b.gate.ready).telegram_id, ID);
  assert.equal((await b.gate.getFreshTelegramAuth()).id, ID);
});

test('missing or disabled API configuration settles bootstrap without recursion or requests', async () => {
  for (const config of [{}, { BASE_URL: null }]) {
    const b = browser({ config, readyState: 'loading' });
    const proof = b.gate.getFreshTelegramAuth();
    b.listeners.DOMContentLoaded();
    assert.equal(await b.gate.ready, null);
    assert.equal(await proof, null);
    assert.equal(b.calls.length, 0);
    await b.gate.loginWithTelegram();
    assert.match(b.navigation.at(-1), /^https:\/\/t\.me\/WIKICOMSBOT/);
  }
});

test('disabled or unknown website capability keeps legacy proof and sends login to the bot', async () => {
  const proof = { id: ID, auth_date: Math.floor(Date.now() / 1000), hash: 'a'.repeat(64) };
  for (const capability of [{ ok: true, enabled: false }, { error: 'unavailable' }]) {
    const b = browser({ capability, seed: { moonboys_tg_id: ID, moonboys_tg_linked: '1', moonboys_tg_auth: JSON.stringify(proof) } });
    const login = b.gate.loginWithTelegram();
    assert.equal(await b.gate.ready, null);
    await login;
    assert.equal(b.calls.length, 1, 'disabled rollout must not request session bootstrap');
    assert.equal(b.gate.getSignedTelegramAuth().hash, proof.hash);
    assert.match(b.navigation.at(-1), /^https:\/\/t\.me\/WIKICOMSBOT/);
  }
});

test('stalled capability or session bootstrap aborts and settles every identity waiter', async () => {
  for (const stage of ['capability', 'session', 'capability body', 'session body']) {
    const stall = () => new Promise(() => {});
    const fetchImpl = stage.endsWith('body') ? () => ({ ok: true, json: stall }) : stall;
    const b = browser(stage.startsWith('capability') ? { capability: fetchImpl } : { fetchImpl });
    const proof = b.gate.getFreshTelegramAuth();
    const login = b.gate.loginWithTelegram();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(b.deadlines.size, 1);
    const signal = b.calls.at(-1)[1].signal;
    [...b.deadlines.values()][0]();
    assert.equal(await b.gate.ready, null);
    assert.equal(await proof, null);
    await login;
    assert.equal(signal.aborted, true);
    assert.equal(b.deadlines.size, 0);
    assert.match(b.navigation.at(-1), /^https:\/\/t\.me\/WIKICOMSBOT/);
  }
});

test('a stalled logout aborts without clearing identity or claiming confirmed revocation', async () => {
  const b = browser({ fetchImpl: url => url.endsWith('/logout') ? new Promise(() => {}) : Response.json(sessionData()) });
  await b.gate.ready;
  const logout = b.gate.logout();
  await new Promise(resolve => setImmediate(resolve));
  const signal = b.calls.at(-1)[1].signal;
  [...b.deadlines.values()][0]();
  await assert.rejects(logout, /Logout could not be confirmed/);
  assert.equal(signal.aborted, true);
  assert.equal(b.gate.isTelegramLinked(), true);
  assert.equal(b.navigation.length, 0);
});

test('faction status sends refreshed website credentials only in a POST body', async () => {
  const b = browser({ fetchImpl: url => Response.json(url.endsWith('/faction/status') ? { faction: 'graffpunks', faction_xp: 19 } : sessionData()) });
  await b.gate.ready;
  vm.runInContext(readFileSync('js/faction-alignment.js', 'utf8'), b.context);
  const status = await b.window.MOONBOYS_FACTION.loadStatus();
  assert.equal(status.faction, 'graffpunks');
  assert.equal(status.telegram_id, ID);
  const [url, options] = b.calls.at(-1);
  assert.equal(url, 'https://api.cryptomoonboys.com/faction/status');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(options.body).telegram_auth.hash, b.gate.getSignedTelegramAuth().hash);
  assert.equal(JSON.stringify([...b.storage]).includes('s1_'), false);
  assert.equal(b.calls.some(([requestUrl]) => requestUrl.includes('s1_') || requestUrl.includes('telegram_auth=')), false);
});

test('transient renewal failures retain capability and recover without a page reload', async () => {
  for (const failure of ['network', 'malformed JSON', 'malformed payload', 'missing CSRF', 'missing expiry', 'server error']) {
    let renewals = 0;
    const b = browser({ fetchImpl: url => {
      if (!url.endsWith('/renew')) return Response.json(sessionData());
      if (++renewals > 1) return Response.json(sessionData('B'));
      if (failure === 'network') throw new Error('temporary outage');
      if (failure === 'malformed JSON') return new Response('{', { headers: { 'Content-Type': 'application/json' } });
      if (failure === 'malformed payload') return Response.json({ ok: true });
      if (failure === 'missing CSRF') return Response.json({ ...sessionData(), csrf_token: undefined });
      if (failure === 'missing expiry') { const data = sessionData(); delete data.telegram_auth.expires_at; return Response.json(data); }
      return Response.json({ error: 'unavailable' }, { status: 503 });
    } });
    await b.gate.ready;
    b.gate.getTelegramAuth().expires_at = Math.floor(Date.now() / 1000) - 1;
    assert.equal(await b.gate.getFreshTelegramAuth(), null);
    assert.equal(b.storage.get('moonboys_tg_session_mode'), 'website');
    const recovered = await b.gate.getFreshTelegramAuth();
    assert.equal(recovered.hash, 's1_' + 'B'.repeat(43), failure);
    assert.equal(renewals, 2);
    assert.equal(b.gate.isTelegramLinked(), true);
    assert.equal(b.navigation.length, 0);
  }
});

test('a failed capability probe can recover an existing cookie session on a later request', async () => {
  let probes = 0;
  const b = browser({ seed: { moonboys_tg_session_mode: 'website' }, capability: () => {
    if (++probes === 1) throw new Error('temporary outage');
    return Response.json({ ok: true, enabled: true });
  } });
  assert.equal(await b.gate.ready, null);
  assert.equal((await b.gate.getFreshTelegramAuth()).id, ID);
  assert.equal(probes, 2);
  assert.equal(b.gate.isTelegramLinked(), true);
});

test('an expired access credential renews before a protected action decides the account is unlinked', async () => {
  const b = browser({ fetchImpl: url => Response.json(sessionData(url.endsWith('/renew') ? 'B' : 'A')) });
  await b.gate.ready;
  b.document.hidden = true;
  b.gate.getTelegramAuth().expires_at = Math.floor(Date.now() / 1000) - 1;
  assert.equal(b.gate.isTelegramLinked(), true, 'short proof expiry retains verified activation until the cookie session is rejected');
  assert.equal(b.gate.getSignedTelegramAuth(), null);
  let allowed = 0;
  await b.gate.requireLinkedAccount(() => allowed++);
  assert.equal(allowed, 1);
  assert.equal(b.gate.isTelegramLinked(), true);
  assert.equal(b.document.getElementById('tg-sync-gate-modal'), null);
  assert.ok(b.calls.some(([url]) => url.endsWith('/renew')));
});

test('visible-tab renewal retries after an interrupted refresh and preserves expiry rejection', async () => {
  let renewals = 0;
  const b = browser({ fetchImpl: url => {
    if (!url.endsWith('/renew')) return renewals > 2 ? Response.json({ error: 'website_session_expired' }, { status: 401 }) : Response.json(sessionData());
    if (++renewals === 1) throw new Error('temporary outage');
    return renewals === 2 ? Response.json(sessionData('B')) : Response.json({ error: 'website_session_expired' }, { status: 401 });
  } });
  await b.gate.ready;
  b.gate.getTelegramAuth().expires_at = Math.floor(Date.now() / 1000) - 1;
  b.document.hidden = false;
  b.listeners.visibilitychange();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.gate.isTelegramLinked(), true, 'transient renewal failure retains verified activation');
  assert.equal(b.gate.getSignedTelegramAuth(), null);
  b.timers[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.gate.isTelegramLinked(), true);
  assert.equal(renewals, 2);
  b.gate.getTelegramAuth().expires_at = Math.floor(Date.now() / 1000) - 1;
  let allowed = 0;
  await b.gate.requireLinkedAccount(() => allowed++);
  assert.equal(allowed, 0);
  assert.equal(b.gate.isTelegramLinked(), false);
  assert.equal(b.document.getElementById('tg-sync-gate-modal').style.display, 'flex');
});

for (const status of [401, 403]) {
 for (const changedId of [false, true]) {
  test(`renewal ${status} re-bootstraps a replaced shared cookie before clearing cross-tab identity (${changedId ? 'new account' : 'same account'})`, async () => {
    const storage = new Map();
    let cookieSession = sessionData();
    const fetchImpl = async (url, options) => {
      if (url.endsWith('/renew') && options.headers['X-Moonboys-CSRF'] !== cookieSession.csrf_token) {
        return Response.json({ error: 'old_session' }, { status });
      }
      return Response.json(cookieSession);
    };
    const first = browser({ storage, fetchImpl });
    const second = browser({ storage, fetchImpl });
    await Promise.all([first.gate.ready, second.gate.ready]);
    cookieSession = { ...sessionData('B'), csrf_token: 'new-cookie-csrf' };
    if (changedId) {
      cookieSession.telegram_id = '987654321';
      cookieSession.telegram_auth.id = '987654321';
    }
    assert.equal((await second.gate.getFreshTelegramAuth({ force: true })).hash, cookieSession.telegram_auth.hash);
    const recovered = await first.gate.getFreshTelegramAuth(changedId ? {} : { force: true });
    assert.equal(recovered.hash, cookieSession.telegram_auth.hash);
    assert.equal(recovered.id, cookieSession.telegram_id);
    assert.deepEqual(first.calls.slice(-2).map(([url]) => url.split('/').at(-1)), ['renew', 'session']);
    assert.equal(first.calls.at(-1)[1].headers?.['X-Moonboys-CSRF'], undefined);
    assert.equal(storage.get('moonboys_tg_session_mode'), 'website');
    assert.equal(second.gate.isTelegramLinked(), true);
    await first.gate.getFreshTelegramAuth({ force: true });
    assert.equal(first.calls.at(-1)[1].headers['X-Moonboys-CSRF'], 'new-cookie-csrf');
  });
 }
}

test('a failed cross-tab session bootstrap retains identity and can recover on the next attempt', async () => {
  let sessions = 0;
  const b = browser({ fetchImpl: url => {
    if (url.endsWith('/renew')) return Response.json({ error: 'stale_csrf' }, { status: 403 });
    if (++sessions === 2) return Response.json({ error: 'unavailable' }, { status: 503 });
    return Response.json(sessionData(sessions > 2 ? 'B' : 'A'));
  } });
  await b.gate.ready;
  assert.equal(await b.gate.getFreshTelegramAuth({ force: true }), null);
  assert.equal(b.storage.get('moonboys_tg_session_mode'), 'website');
  assert.equal((await b.gate.getFreshTelegramAuth({ force: true })).hash, sessionData('B').telegram_auth.hash);
  assert.equal(sessions, 3, 'one bootstrap per authorization failure');
});

for (const stage of ['capability', 'session']) {
  for (const legacy of [false, true]) {
    test(`fresh authentication retries a failed initial ${stage} probe without a website marker (${legacy ? 'legacy fallback' : 'guest'})`, async () => {
      let capabilities = 0, sessions = 0, offline = true;
      const proof = { id: ID, auth_date: Math.floor(Date.now() / 1000), hash: 'a'.repeat(64) };
      const b = browser({ seed: legacy ? { moonboys_tg_id: ID, moonboys_tg_linked: '1', moonboys_tg_auth: JSON.stringify(proof) } : {},
        capability: () => { capabilities++; if (offline && stage === 'capability') throw new Error('offline'); return Response.json({ ok: true, enabled: true }); },
        fetchImpl: () => { sessions++; if (offline) throw new Error('offline'); return Response.json(sessionData()); } });
      await b.gate.ready;
      assert.equal(b.storage.get('moonboys_tg_session_mode'), undefined);
      const fallback = await b.gate.getFreshTelegramAuth();
      assert.equal(fallback && fallback.hash, legacy ? proof.hash : null, 'failed probe preserves legacy fallback');
      offline = false;
      assert.equal((await b.gate.getFreshTelegramAuth()).hash, sessionData().telegram_auth.hash);
      assert.equal(capabilities, stage === 'capability' ? 3 : 1);
      assert.equal(sessions, stage === 'session' ? 3 : 1);
      assert.equal(b.storage.get('moonboys_tg_session_mode'), 'website');
      assert.equal(b.storage.get('moonboys_tg_auth'), undefined);
    });
  }
}

test('protected gates retry an unhealthy initial cookie probe before displaying login', async () => {
  let sessions = 0;
  const b = browser({ fetchImpl: url => {
    if (url.endsWith('/session') && ++sessions === 1) throw new Error('offline');
    return Response.json(sessionData());
  } });
  await b.gate.ready;
  let allowed = 0;
  await b.gate.requireLinkedAccount(() => allowed++);
  assert.equal(allowed, 1);
  assert.equal(b.document.getElementById('tg-sync-gate-modal'), null);
});

function loadProfile(b) {
  const busListeners = new Map();
  b.window.MOONBOYS_EVENT_BUS = { on(name, callback) { busListeners.set(name, callback); } };
  vm.runInContext(readFileSync('js/core/moonboys-state.js', 'utf8'), b.context);
  return { state: b.window.MOONBOYS_STATE, emit(name, detail) { busListeners.get(name)?.(detail); } };
}

function progressionData(xp = 6300) { return { ok: true, progression: { arcade_xp_total: xp } }; }

test('late verified cookie recovery retries guest profile hydration and fetches authoritative XP once', async () => {
  let offline = true;
  const b = browser({ fetchImpl: url => {
    if (url.endsWith('/blocktopia/progression')) return Response.json(progressionData());
    if (offline) throw new Error('temporary outage');
    return Response.json(sessionData());
  } });
  const { state } = loadProfile(b);
  await state.hydrateState();
  assert.equal(state.getState().source, 'guest');
  offline = false;
  await b.gate.getFreshTelegramAuth();
  await state.hydrateState();
  assert.equal(state.getState().source, 'server');
  assert.equal(state.getState().xp, 6300);
  for (let i = 0; i < 3; i++) b.window.dispatchEvent({ type: 'moonboys:telegram-session', detail: { telegram_id: ID } });
  await state.hydrateState();
  assert.equal(b.calls.filter(([url]) => url.endsWith('/blocktopia/progression')).length, 1);
});

test('concurrent profile hydration shares one fetch and preserves an in-flight live XP update', async () => {
  let finish;
  const b = browser({ fetchImpl: url => url.endsWith('/blocktopia/progression') ? new Promise(resolve => { finish = resolve; }) : Response.json(sessionData()) });
  await b.gate.ready;
  const { state, emit } = loadProfile(b);
  const first = state.hydrateState();
  const second = state.hydrateState();
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  for (let i = 0; i < 3; i++) b.window.dispatchEvent({ type: 'moonboys:telegram-session', detail: { telegram_id: ID } });
  emit('xp:update', { total: 6400 });
  finish(Response.json(progressionData()));
  await Promise.all([first, second]);
  assert.equal(state.getState().xp, 6400);
  assert.equal(state.getState().source, 'server');
  assert.equal(b.calls.filter(([url]) => url.endsWith('/blocktopia/progression')).length, 1);
});

test('a verified-session event during a failed auth wait schedules one hydration retry', async () => {
  let finish;
  const b = browser({ fetchImpl: url => Response.json(url.endsWith('/blocktopia/progression') ? progressionData() : sessionData()) });
  await b.gate.ready;
  b.gate.getFreshTelegramAuth = () => new Promise(resolve => { finish = resolve; });
  const { state } = loadProfile(b);
  const pending = state.hydrateState();
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  b.gate.getFreshTelegramAuth = async () => sessionData().telegram_auth;
  for (let i = 0; i < 3; i++) b.window.dispatchEvent({ type: 'moonboys:telegram-session', detail: { telegram_id: ID } });
  finish(null);
  assert.equal((await pending).source, 'server');
  assert.equal(state.getState().xp, 6300);
  assert.equal(state.getState().source, 'server');
  assert.equal(b.calls.filter(([url]) => url.endsWith('/blocktopia/progression')).length, 1);
});

test('unverified session events cannot hydrate authoritative profile data', async () => {
  const b = browser({ capability: { ok: true, enabled: false } });
  const { state } = loadProfile(b);
  await state.hydrateState();
  b.window.dispatchEvent({ type: 'moonboys:telegram-session', detail: { telegram_id: ID } });
  await state.hydrateState();
  assert.equal(state.getState().linked, false);
  assert.equal(b.calls.some(([url]) => url.endsWith('/blocktopia/progression')), false);
});

test('a late response for a previous account cannot overwrite the recovered profile', async () => {
  let finish;
  const b = browser({ fetchImpl: (url, options) => {
    if (!url.endsWith('/blocktopia/progression')) return Response.json(sessionData());
    const id = JSON.parse(options.body).telegram_auth.id;
    return id === ID ? new Promise(resolve => { finish = resolve; }) : Response.json(progressionData(7777));
  } });
  await b.gate.ready;
  const { state } = loadProfile(b);
  const pending = state.hydrateState();
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  const next = { ...sessionData().telegram_auth, id: '987654321' };
  b.storage.set('moonboys_tg_id', next.id);
  b.gate.getFreshTelegramAuth = async () => next;
  b.gate.getSignedTelegramAuth = () => next;
  b.window.dispatchEvent({ type: 'moonboys:telegram-session', detail: { telegram_id: next.id } });
  finish(Response.json(progressionData(6300)));
  assert.equal((await pending).xp, 7777);
  assert.equal(state.getState().xp, 7777);
  assert.equal(b.calls.filter(([url]) => url.endsWith('/blocktopia/progression')).length, 2);
});

test('a verified account change replaces already hydrated profile values with that account\'s XP', async () => {
  let xp = 6300;
  const b = browser({ fetchImpl: url => Response.json(url.endsWith('/blocktopia/progression') ? progressionData(xp) : sessionData()) });
  await b.gate.ready;
  const { state } = loadProfile(b);
  await state.hydrateState();
  const next = { ...sessionData().telegram_auth, id: '987654321' };
  xp = 17;
  b.storage.set('moonboys_tg_id', next.id);
  b.gate.getFreshTelegramAuth = async () => next;
  b.gate.getSignedTelegramAuth = () => next;
  b.window.dispatchEvent({ type: 'moonboys:telegram-session', detail: { telegram_id: next.id } });
  await state.hydrateState();
  assert.equal(state.getState().xp, 17);
  assert.equal(state.getState().source, 'server');
});

function loadScoreClient(b) {
  // Run the complete score/auth transport code with presentation modules stubbed.
  vm.runInContext(readFileSync('js/arcade-sync.js', 'utf8').replace(/^export /gm, ''), b.context);
  vm.runInContext('ArcadeSync.syncPendingArcadeProgress = async function () { return { skipped: true }; };', b.context);
  b.context.ArcadeMeta = { trackGameResult: () => ({ tracked: false }) };
  b.context.console = { warn() {}, info() {}, error() {} };
  vm.runInContext(readFileSync('js/leaderboard-client.js', 'utf8').replace(/^import .*;\s*$/gm, '').replace(/^export /gm, ''), b.context);
  return (...args) => b.context.submitScore(...args);
}

for (const renewalFailure of [false, true]) {
  test(`expired website proof reaches score renewal after ${renewalFailure ? 'a transient timer failure' : 'a hidden-tab expiry'}`, async () => {
    let renewals = 0;
    const b = browser({ config: { BASE_URL: 'https://api.cryptomoonboys.com', LEADERBOARD_URL: 'https://leaderboard.test' },
      fetchImpl: url => {
        if (url.endsWith('/renew')) {
          if (++renewals === 1 && renewalFailure) throw new Error('temporary outage');
          return Response.json(sessionData('B'));
        }
        if (url === 'https://leaderboard.test') return Response.json({ accepted: true });
        if (url.endsWith('/faction/earn')) return Response.json({ ok: true });
        return Response.json(sessionData());
      } });
    await b.gate.ready;
    b.document.hidden = true;
    b.gate.getTelegramAuth().expires_at = 1;
    if (renewalFailure) assert.equal(await b.gate.getFreshTelegramAuth(), null);
    const result = await loadScoreClient(b)('Returning player', 1000, 'snake');
    assert.equal(result.accepted, true);
    assert.equal(result.state, 'accepted_score');
    const scores = b.calls.filter(([url]) => url === 'https://leaderboard.test');
    assert.equal(scores.length, 1);
    assert.equal(JSON.parse(scores[0][1].body).telegram_auth.hash, sessionData('B').telegram_auth.hash);
    assert.equal(JSON.parse(scores[0][1].body).telegram_id, ID);
    assert.equal(b.storage.has('moonboys_arcade_pending_progress_v1'), false);
  });
}

test('score renewal rejects a confirmed expired cookie before any score write', async () => {
  let expired = false;
  const b = browser({ config: { BASE_URL: 'https://api.cryptomoonboys.com', LEADERBOARD_URL: 'https://leaderboard.test' },
    fetchImpl: () => expired ? Response.json({ error: 'expired' }, { status: 401 }) : Response.json(sessionData()) });
  await b.gate.ready;
  b.gate.getTelegramAuth().expires_at = 1;
  expired = true;
  const result = await loadScoreClient(b)('Returning player', 1000, 'snake');
  assert.equal(result.accepted, false);
  assert.equal(result.state, 'auth_required');
  assert.equal(b.gate.isTelegramLinked(), false);
  assert.equal(b.calls.some(([url]) => url === 'https://leaderboard.test'), false);
});
