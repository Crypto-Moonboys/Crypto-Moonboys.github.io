import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const singletonSrc = fs.readFileSync(path.join(ROOT, 'js/core/daily-loop-state.js'), 'utf8');
const cspSrc = fs.readFileSync(path.join(ROOT, 'js/components/connection-status-panel.js'), 'utf8');
const applyShellSrc = fs.readFileSync(path.join(ROOT, 'scripts/apply-shell.mjs'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const graffpunksHtml = fs.readFileSync(path.join(ROOT, 'wiki/graffpunks.html'), 'utf8');
const packageJson = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
const truthMap = fs.readFileSync(path.join(ROOT, 'docs/LIVE_DAILY_LOOP_TRUTH_MAP.md'), 'utf8');

function createRuntime({ linked = false, auth = null, fetchImpl } = {}) {
  let linkedState = linked;
  let authState = auth;
  const listeners = new Map();
  const documentListeners = new Map();
  const busEvents = [];
  const windowObj = {
    MOONBOYS_API: {
      getApiBase: () => 'https://moonboys-api.test',
    },
    MOONBOYS_IDENTITY: {
      isTelegramLinked: () => linkedState,
      getTelegramId: () => '12345',
      getFreshTelegramAuth: () => Promise.resolve(authState),
      restoreLinkedTelegramAuth: () => Promise.resolve(authState ? { ok: true, telegram_auth: authState } : null),
      getSignedTelegramAuth: () => authState,
    },
    MOONBOYS_EVENT_BUS: {
      emit(name, detail) { busEvents.push({ name, detail }); },
    },
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    dispatchEvent(event) {
      for (const callback of listeners.get(event.type) || []) callback(event);
      return true;
    },
    setTimeout,
    clearTimeout,
    console,
  };
  windowObj.window = windowObj;
  const documentObj = {
    readyState: 'loading',
    addEventListener(name, callback) {
      if (!documentListeners.has(name)) documentListeners.set(name, []);
      documentListeners.get(name).push(callback);
    },
    dispatch(name) {
      for (const callback of documentListeners.get(name) || []) callback({ type: name });
    },
  };
  windowObj.document = documentObj;
  windowObj.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  windowObj.AbortController = AbortController;
  windowObj.fetch = fetchImpl;
  vm.runInNewContext(singletonSrc, windowObj, { filename: 'daily-loop-state.js' });
  return {
    window: windowObj,
    document: documentObj,
    busEvents,
    setLinked(value) { linkedState = !!value; },
    setAuth(value) { authState = value; },
  };
}

function response(payload, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
}

function dailyPayload(extra = {}) {
  return {
    ok: true,
    utc_day: '2026-06-30',
    current_utc_day_started_at: '2026-06-30T00:00:00.000Z',
    next_utc_reset_at: '2026-07-01T00:00:00.000Z',
    seconds_until_reset: 3600,
    identity: { linked: false, auth_mode: 'anonymous' },
    sam_status: {},
    faction_state: {},
    daily_missions: { items: [] },
    wiki_missions: { items: [] },
    arcade_daily_state: {},
    battle_chamber_activity: { recent_activity: [] },
    daily_wtf_status: { events: [] },
    missed_opportunities: { total_today: 0, total_all_time: 0, items: [] },
    telegram_digest_group_status: {},
    source_status: {
      daily_wtf_status: { state: 'preview', source: 'server_schedule' },
      daily_missions: { state: 'live_empty', source: 'worker_d1' },
      missed_opportunities: { state: 'live_empty', source: 'worker_d1' },
      battle_chamber_activity: { state: 'live_empty', source: 'worker_d1' },
    },
    ...extra,
  };
}

async function waitForCalls(calls, expectedCount) {
  for (let i = 0; i < 10 && calls.length < expectedCount; i += 1) {
    await Promise.resolve();
  }
  assert.equal(calls.length, expectedCount, `expected ${expectedCount} fetch call(s) to start`);
}

assert.ok(singletonSrc.includes('window.MOONBOYS_DAILY_LOOP = {'), 'singleton exposes MOONBOYS_DAILY_LOOP');
for (const method of ['getState', 'refresh', 'subscribe', 'invalidate', 'isReady']) {
  assert.ok(singletonSrc.includes(`${method}: ${method}`), `singleton exposes ${method}()`);
}

const anonCalls = [];
const anonRuntime = createRuntime({
  fetchImpl(url, options = {}) {
    anonCalls.push({ url: String(url), options });
    return response(dailyPayload());
  },
});
const anonState = await anonRuntime.window.MOONBOYS_DAILY_LOOP.refresh({ force: true });
assert.equal(anonCalls.length, 1);
assert.equal(anonCalls[0].url, 'https://moonboys-api.test/daily-loop/state');
assert.equal(anonCalls[0].options.method, 'GET');
assert.equal(anonCalls[0].url.includes('telegram_auth'), false, 'anonymous fetch must not put auth in query string');
assert.equal(anonState.fetch_status, 'ok');
assert.equal(anonRuntime.window.MOONBOYS_DAILY_LOOP.isReady(), true);

const linkedCalls = [];
const authPayload = { id: 12345, hash: 'signed-hash', auth_date: 1782780000 };
const linkedRuntime = createRuntime({
  linked: true,
  auth: authPayload,
  fetchImpl(url, options = {}) {
    linkedCalls.push({ url: String(url), options });
    return response(dailyPayload({ identity: { linked: true, auth_mode: 'telegram_verified' } }));
  },
});
await linkedRuntime.window.MOONBOYS_DAILY_LOOP.refresh({ force: true });
assert.equal(linkedCalls[0].options.method, 'POST');
assert.equal(linkedCalls[0].url, 'https://moonboys-api.test/daily-loop/state');
assert.equal(linkedCalls[0].url.includes('?'), false, 'linked fetch must not use query strings for auth');
assert.deepEqual(JSON.parse(linkedCalls[0].options.body), { telegram_auth: authPayload });

let resolveFetch;
let concurrentCallCount = 0;
const concurrentRuntime = createRuntime({
  fetchImpl() {
    concurrentCallCount += 1;
    return new Promise((resolve) => {
      resolveFetch = () => resolve(response(dailyPayload()));
    });
  },
});
const first = concurrentRuntime.window.MOONBOYS_DAILY_LOOP.refresh({ force: true });
const second = concurrentRuntime.window.MOONBOYS_DAILY_LOOP.refresh({ force: true });
await Promise.resolve();
resolveFetch();
await Promise.all([first, second]);
assert.equal(concurrentCallCount, 1);

let resolveAnonFetch;
const authRaceCalls = [];
const raceAuthPayload = { id: 12345, hash: 'race-hash', auth_date: 1782781111 };
const authRaceRuntime = createRuntime({
  linked: false,
  auth: null,
  fetchImpl(url, options = {}) {
    authRaceCalls.push({ url: String(url), options });
    if ((options.method || 'GET') === 'GET') {
      return new Promise((resolve) => {
        resolveAnonFetch = () => resolve(response(dailyPayload({ identity: { linked: false, auth_mode: 'anonymous' } })));
      });
    }
    return response(dailyPayload({ identity: { linked: true, auth_mode: 'telegram_verified' } }));
  },
});
const anonymousInFlight = authRaceRuntime.window.MOONBOYS_DAILY_LOOP.refresh({ force: true });
await waitForCalls(authRaceCalls, 1);
authRaceRuntime.setLinked(true);
authRaceRuntime.setAuth(raceAuthPayload);
const linkedAfterAuth = authRaceRuntime.window.MOONBOYS_DAILY_LOOP.refresh({ force: true });
assert.notEqual(anonymousInFlight, linkedAfterAuth, 'linked refresh must not reuse anonymous in-flight promise');
await linkedAfterAuth;
resolveAnonFetch();
await anonymousInFlight;
assert.equal(authRaceCalls.length, 2, 'auth restore during anonymous fetch starts a separate linked request');
assert.equal(authRaceCalls[0].options.method, 'GET');
assert.equal(authRaceCalls[1].options.method, 'POST');
assert.equal(authRaceCalls[1].url.includes('?'), false, 'linked auth after race must not use query strings');
assert.deepEqual(JSON.parse(authRaceCalls[1].options.body), { telegram_auth: raceAuthPayload });
const raceFinalState = await authRaceRuntime.window.MOONBOYS_DAILY_LOOP.getState();
assert.equal(raceFinalState.identity.auth_mode, 'telegram_verified', 'late anonymous response must not overwrite linked state');

let resolveLinkedFetch;
const linkedToAnonCalls = [];
const linkedToAnonRuntime = createRuntime({
  linked: true,
  auth: authPayload,
  fetchImpl(url, options = {}) {
    linkedToAnonCalls.push({ url: String(url), options });
    if ((options.method || 'GET') === 'POST') {
      return new Promise((resolve) => {
        resolveLinkedFetch = () => resolve(response(dailyPayload({ identity: { linked: true, auth_mode: 'telegram_verified' } })));
      });
    }
    return response(dailyPayload({ identity: { linked: false, auth_mode: 'anonymous' } }));
  },
});
const linkedInFlight = linkedToAnonRuntime.window.MOONBOYS_DAILY_LOOP.refresh({ force: true });
await waitForCalls(linkedToAnonCalls, 1);
linkedToAnonRuntime.setLinked(false);
linkedToAnonRuntime.setAuth(null);
const anonymousAfterUnlink = linkedToAnonRuntime.window.MOONBOYS_DAILY_LOOP.refresh({ force: true });
assert.notEqual(linkedInFlight, anonymousAfterUnlink, 'anonymous refresh must not reuse linked in-flight promise');
await anonymousAfterUnlink;
resolveLinkedFetch();
await linkedInFlight;
assert.equal(linkedToAnonCalls.length, 2, 'unlink during linked fetch starts a separate anonymous request');
assert.equal(linkedToAnonCalls[0].options.method, 'POST');
assert.equal(linkedToAnonCalls[1].options.method, 'GET');
const linkedToAnonFinalState = await linkedToAnonRuntime.window.MOONBOYS_DAILY_LOOP.getState();
assert.equal(linkedToAnonFinalState.identity.auth_mode, 'anonymous', 'late linked response must not overwrite anonymous state');

let resolveAuthRequiredFetch;
const authRequiredCalls = [];
const authRequiredRuntime = createRuntime({
  linked: true,
  auth: null,
  fetchImpl(url, options = {}) {
    authRequiredCalls.push({ url: String(url), options });
    if ((options.method || 'GET') === 'GET' && authRequiredCalls.length === 1) {
      return new Promise((resolve) => {
        resolveAuthRequiredFetch = () => resolve(response(dailyPayload()));
      });
    }
    return response(dailyPayload({ identity: { linked: false, auth_mode: 'anonymous' } }));
  },
});
const authRequiredInFlight = authRequiredRuntime.window.MOONBOYS_DAILY_LOOP.refresh({ force: true });
await waitForCalls(authRequiredCalls, 1);
authRequiredRuntime.setLinked(false);
const anonymousAfterAuthRequired = authRequiredRuntime.window.MOONBOYS_DAILY_LOOP.refresh({ force: true });
assert.notEqual(authRequiredInFlight, anonymousAfterAuthRequired, 'auth_required mode must be separate from anonymous mode');
await anonymousAfterAuthRequired;
resolveAuthRequiredFetch();
await authRequiredInFlight;
assert.equal(authRequiredCalls.length, 2, 'auth_required in-flight GET must not be reused for anonymous GET');

const expiredCalls = [];
const expiredRuntime = createRuntime({
  linked: true,
  auth: null,
  fetchImpl(url, options = {}) {
    expiredCalls.push({ url: String(url), options });
    return response(dailyPayload());
  },
});
const expiredState = await expiredRuntime.window.MOONBOYS_DAILY_LOOP.refresh({ force: true });
assert.equal(expiredCalls[0].options.method, 'GET');
assert.equal(expiredState.identity.auth_mode, 'auth_required');
assert.equal(expiredState.identity.relink_required, true);

const tickCalls = [];
const tickRuntime = createRuntime({
  fetchImpl(url, options = {}) {
    tickCalls.push({ url: String(url), options });
    return response(dailyPayload());
  },
});
await tickRuntime.window.MOONBOYS_DAILY_LOOP.refresh({ force: true });
tickRuntime.window.dispatchEvent(new tickRuntime.window.CustomEvent('moonboys:wtf-countdown-tick', { detail: { seconds: 10 } }));
await Promise.resolve();
assert.equal(tickCalls.length, 1, 'countdown tick must not trigger a new daily-loop fetch');

assert.ok(cspSrc.includes('getDailyLoopStateForRail'), 'right rail reads MOONBOYS_DAILY_LOOP before legacy state');
assert.ok(cspSrc.includes("shared.dailyLoopSource = 'daily-loop-state'"), 'right rail marks daily-loop as the preferred source');
assert.ok(cspSrc.includes("wtf.source_state === 'preview'") && cspSrc.includes("badgeLabel = 'PREVIEW'"), 'preview WTF source is labelled preview, not live');
assert.ok(cspSrc.includes("statusState === 'query_failed'") && cspSrc.includes("status: 'error'"), 'query_failed WTF source is rendered as unavailable/error, not live');
assert.ok(!cspSrc.includes("source_state === 'preview'") || !cspSrc.includes("badgeLabel = 'ACTIVE'; badgeClass = 'csp-wtf-badge--active';\n    } else if (wtf && wtf.source_state === 'preview'"), 'preview branch must not fall through to active live badge');

assert.ok(applyShellSrc.includes("'/js/core/daily-loop-state.js'"), 'canonical shell strips/reinserts daily-loop singleton');
assert.ok(indexHtml.indexOf('/js/core/moonboys-state.js') < indexHtml.indexOf('/js/core/daily-loop-state.js'), 'index loads daily-loop after moonboys-state');
assert.ok(indexHtml.indexOf('/js/core/daily-loop-state.js') < indexHtml.indexOf('/js/components/connection-status-panel.js'), 'index loads daily-loop before connection-status-panel');
assert.ok(graffpunksHtml.indexOf('/js/core/daily-loop-state.js') < graffpunksHtml.indexOf('/js/components/connection-status-panel.js'), 'wiki pages load daily-loop before connection-status-panel');
assert.ok(packageJson.includes('node scripts/daily-loop-frontend-state.test.mjs'), 'npm test includes daily-loop frontend singleton test');
assert.ok(truthMap.includes('Phase 2') && truthMap.includes('/js/core/daily-loop-state.js'), 'truth map documents Phase 2 frontend singleton');

console.log('daily-loop-frontend-state tests passed');
