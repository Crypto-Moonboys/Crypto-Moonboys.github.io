import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const block = name => between('// TEST-EXPORT: ' + name + ':start', '// TEST-EXPORT: ' + name + ':end');
const full = () => ({ adopted: true, pet: { pet_id: 'pet-a', season_key: 'lifetime-a', callsign: 'A' }, hydration: { full: true }, cooldowns: { entries: [] } });
const partial = () => ({ ...full(), hydration: { full: false, mode: 'missions', modules: ['missions'] } });
function clientContext() {
  let now = 10000, sequence = 0;
  const requests = [], messages = [], timers = new Map();
  const ctx = {
    state: full(), activeScreen: 'missions', busy: false, noticesBusy: false, authenticationFailure: false,
    petActionRefreshRequired: false, fastActionStateDirty: true, fastActionStateRefreshInFlight: false, fastActionStateRefreshTimer: 0,
    fastActionStateRefreshFailures: 0, fastActionStateRefreshRetryAt: 0, FAST_ACTION_STATE_MAX_AUTO_RETRIES: 3,
    passiveRefreshInFlight: false, cooldownRefreshInFlight: false, seasonRefreshBusy: false, fullStateHydrationPromise: null,
    fullStateHydrationFailures: 0, fullStateHydrationRetryDelayMs: 0, fullStateHydrationRetryTimer: 0, FULL_STATE_HYDRATION_MAX_AUTO_RETRIES: 3,
    cooldownRefreshFailures: 0, cooldownRefreshTimer: 0, lastCooldownRefreshKey: '', seasonSnapshotReceivedAt: 0, lastSeasonServerRefreshAt: 0,
    serverClockOffsetMs: 0, sleepLatched: false, reducedMotion: false, renderedPetId: 'pet-a', renderedPetName: 'A', requestedFocus: '', requestedFocusScreen: 'missions', SCREEN_ORDER: ['home','missions','explore','work','profile'],
    Date: { now: () => now, parse: Date.parse }, performance: { now: () => now }, screen: { scrollTop: 0, innerHTML: '' },
    window: { clearTimeout(id) { timers.delete(id); }, setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, delay, at: now + delay }); return id; } },
    document: { getElementById: () => null }, panel: (title, body) => title + body, routeButton: label => label,
    captureEditableState: () => null, rememberPanels() {}, renderHud() {}, renderNav() {}, renderCanvasTools() {}, restoreEditableState() {},
    renderRecommended: () => '', renderPetSpaces: () => '', screens: { home: () => 'READY', explore: () => 'READY', work: () => 'READY', profile: () => 'READY', missions: () => 'READY' }, applyRequestedFocus() {}, words: s => s,
    tell(message) { messages.push(message); }, haptic() {}, showPendingNotices: async () => {}, playOptionsReady: () => true,
    crypto: { randomUUID: () => 'local-action' }, actionAnimationFamily: () => 'equip', animateAction() {},
    lifecycleCeremonyActive: () => false, FAST_ACTION_RESPONSE_ACTIONS: new Set(['feed', 'play', 'clean']),
    mergeActionResultCooldown: snapshot => snapshot, resultMessage: () => 'accepted', planLifecycleCeremony: () => null, startLifecycleCeremony() {},
    readSleepLatch: () => false, hatchArtTransitionActive: () => false, selectBotArtForState: async () => {}, serverNowMs: () => Date.now(),
    post: (path, body) => new Promise((resolve, reject) => requests.push({ path, body, resolve, reject })),
  };
  vm.createContext(ctx);
  vm.runInContext(block('stateRequestGate'), ctx);
  ctx.stateRequestGate = ctx.createStateRequestGate();
  ctx.beginStateRequest = () => ctx.stateRequestGate.begin();
  vm.runInContext(block('coreStateHydration') + block('cooldownRefresh') + block('fastActionResponse'), ctx);
  vm.runInContext(between('  function setStateSnapshot(', '  // TEST-EXPORT: cooldownRefresh:start'), ctx);
  vm.runInContext(between('  function render(options)', '  // TEST-EXPORT: actionResultFeedback:start'), ctx);
  vm.runInContext(between('  async function syncState()', '  function applyRequestedFocus()'), ctx);
  vm.runInContext(between('  async function runAction(', '  screen.addEventListener('), ctx);
  return { ctx, requests, timers, messages, now: () => now, tick: async ms => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now && timers.has(id)) {
      timers.delete(id); const running = timer.fn(); if (running && running.then) ctx.timerPromise = running;
    }
    await new Promise(resolve => setImmediate(resolve));
  } };
}

for (const path of ['manual', 'care', 'cooldown', 'action']) for (const target of ['explore', 'work', 'profile']) {
  test(`${path}: a Missions response hydrates ${target} after a tab switch`, async () => {
    const f = clientContext();
    const operation = path === 'manual' ? f.ctx.syncState() : path === 'care' ? f.ctx.refreshFastActionState()
      : path === 'action' ? f.ctx.runAction('buy', { item_key: 'moon_snack' }) : f.ctx.refreshExpiredCooldownState();
    assert.equal(f.requests[0].body.mode || f.requests[0].body.state_mode, 'missions');
    f.ctx.switchScreen(target);
    f.requests[0].resolve({ state: partial(), result: { accepted: true } }); await operation;
    await f.tick(0);
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[1].path, '/telegram-pets/app/state');
    assert.equal(f.requests[1].body.mode, undefined);
    const hydration = f.ctx.fullStateHydrationPromise;
    f.requests[1].resolve({ state: full() }); await hydration;
    assert.equal(f.ctx.stateNeedsScreenHydration(f.ctx.state, target), false);
    assert.match(f.ctx.screen.innerHTML, /READY/);
    assert.equal(f.ctx.fullStateHydrationPromise, null);
    assert.equal(f.timers.size, 0);
    if (path === 'action') assert.equal(f.requests.filter(r => r.path.endsWith('/action')).length, 1);
  });
}

test('remaining on Missions keeps its lightweight projection without a full read', async () => {
  const f = clientContext(), read = f.ctx.syncState();
  f.requests[0].resolve({ state: partial() }); await read; await f.tick(0);
  assert.equal(f.requests.length, 1);
  assert.equal(f.timers.size, 0);
  assert.match(f.ctx.screen.innerHTML, /READY/);
});

test('stale partial snapshots cannot replace a full save or schedule hydration', () => {
  const f = clientContext(), stale = f.ctx.beginStateRequest(); f.ctx.beginStateRequest();
  f.ctx.activeScreen = 'explore';
  assert.equal(f.ctx.setStateSnapshot(partial(), stale), false);
  assert.equal(f.timers.size, 0);
  assert.equal(f.ctx.state.hydration.full, true);
});

test('queued hydration waits for active refresh guards and coalesces snapshots', async () => {
  for (const guard of ['busy', 'noticesBusy', 'passiveRefreshInFlight', 'cooldownRefreshInFlight', 'seasonRefreshBusy', 'fastActionStateRefreshInFlight']) {
    const f = clientContext(); f.ctx.activeScreen = 'explore'; f.ctx[guard] = true;
    f.ctx.setStateSnapshot(partial(), f.ctx.beginStateRequest()); f.ctx.queueActiveScreenHydration();
    assert.equal(f.timers.size, 1);
    await f.tick(0); assert.equal(f.requests.length, 0);
    f.ctx[guard] = false; await f.tick(500);
    assert.equal(f.requests.length, 1);
    const read = f.ctx.fullStateHydrationPromise; f.requests[0].resolve({ state: full() }); await read;
    assert.equal(f.timers.size, 0);
  }
});

test('a changed source hydrates only its authoritative newly selected save', async () => {
  const f = clientContext(); f.ctx.activeScreen = 'profile';
  const changed = partial(); changed.pet = { pet_id: 'pet-b', season_key: 'lifetime-b' };
  f.ctx.setStateSnapshot(changed, f.ctx.beginStateRequest()); await f.tick(0);
  const read = f.ctx.fullStateHydrationPromise, authoritative = full(); authoritative.pet = changed.pet;
  f.requests[0].resolve({ state: authoritative }); await read;
  assert.equal(f.ctx.state.pet.pet_id, 'pet-b');
  assert.equal(f.ctx.state.hydration.full, true);
});

test('tab-switch hydration backs off, stops after three failures and recovers manually', async () => {
  const f = clientContext(); f.ctx.activeScreen = 'work';
  f.ctx.setStateSnapshot(partial(), f.ctx.beginStateRequest()); await f.tick(0);
  for (let i = 0; i < 3; i++) {
    const read = f.ctx.fullStateHydrationPromise; f.requests[i].reject(Error('offline')); await read;
    if (i < 2) await f.tick(i === 0 ? 750 : 1500);
  }
  assert.equal(f.ctx.fullStateHydrationFailures, 3);
  assert.equal(f.timers.size, 0);
  assert.match(f.ctx.screen.innerHTML, /RETRY MODULE/);
  const manual = f.ctx.hydrateFullState('work', { manual: true });
  f.requests[3].resolve({ state: full() }); await manual;
  assert.match(f.ctx.screen.innerHTML, /READY/);
});

test('care retries honour Retry-After even when navigation requests an earlier refresh', async () => {
  const f = clientContext(); f.ctx.activeScreen = 'home';
  const read = f.ctx.refreshFastActionState();
  f.requests[0].reject(Object.assign(Error('rate limited'), { retryAfterSeconds: 60 })); await read;
  assert.equal([...f.timers.values()][0].delay, 60000);
  f.ctx.scheduleFastActionStateRefresh(0); await f.tick(59000);
  assert.equal(f.requests.length, 1);
  await f.tick(1000); assert.equal(f.requests.length, 2);
  f.requests[1].resolve({ state: full() }); await f.ctx.timerPromise;
  assert.equal(f.ctx.fastActionStateDirty, false);
  assert.equal(f.ctx.fastActionStateRefreshFailures, 0);
  assert.equal(f.timers.size, 0);
});

test('care reads back off, pause after three failures and reset after manual recovery', async () => {
  const f = clientContext(); f.ctx.activeScreen = 'home';
  let read = f.ctx.refreshFastActionState();
  for (let i = 0; i < 3; i++) {
    f.requests[i].reject(Error('offline')); await read;
    if (i < 2) {
      const retry = [...f.timers.values()][0];
      assert.ok(retry.delay >= 2000 * 2 ** i && retry.delay < 2400 * 2 ** i);
      await f.tick(retry.delay); read = f.ctx.timerPromise;
    }
  }
  assert.equal(f.ctx.fastActionStateRefreshFailures, 3);
  assert.equal(f.ctx.fastActionStateDirty, true);
  assert.equal(f.timers.size, 0);
  assert.match(f.messages.at(-1), /CARE SYNC PAUSED/);
  await f.ctx.refreshFastActionState(); f.ctx.scheduleFastActionStateRefresh(0);
  assert.equal(f.requests.length, 3); assert.equal(f.timers.size, 0);
  const manual = f.ctx.syncState(); f.requests[3].resolve({ state: full() }); await manual;
  assert.equal(f.ctx.fastActionStateRefreshFailures, 0); assert.equal(f.ctx.fastActionStateDirty, false);
  f.ctx.scheduleFastActionStateRefresh(0); await f.tick(0);
  f.requests[4].resolve({ state: full() }); await f.ctx.timerPromise;
  assert.equal(f.timers.size, 0);
});

test('a late failed care read cannot restart retries after a newer accepted snapshot', async () => {
  const f = clientContext(); f.ctx.activeScreen = 'home';
  const old = f.ctx.refreshFastActionState();
  f.ctx.setStateSnapshot(full(), f.ctx.beginStateRequest());
  f.requests[0].reject(Error('late timeout')); await old;
  assert.equal(f.ctx.fastActionStateDirty, false);
  assert.equal(f.ctx.fastActionStateRefreshFailures, 0);
  assert.equal(f.timers.size, 0);
});
