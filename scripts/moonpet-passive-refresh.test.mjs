import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
function block(name) {
  const start = client.indexOf('// TEST-EXPORT: ' + name + ':start');
  const end = client.indexOf('// TEST-EXPORT: ' + name + ':end', start);
  assert.ok(start >= 0 && end > start);
  return client.slice(start, end);
}
const base = () => ({ adopted: true, pet: { pet_id: 'pet-one', season_key: 'lifetime-one', pet_xp: 200 },
  arena: { battle_id: 'battle-one', status: 'active', current_round: 1 }, arena_queue: null, arena_result: null,
  kaiju: { match: null, queue: null, cards: [] }, guidance: { activity: null, missions: [{ title: 'keep' }] },
  inventory: [{ item_key: 'keep' }], cooldowns: { entries: [] }, hydration: { full: true } });
const patch = round => ({ adopted: true, pet_id: 'pet-one', season_key: 'lifetime-one',
  arena: { battle_id: 'battle-one', status: 'active', current_round: round }, arena_queue: null, arena_result: null,
  kaiju: { match: null, queue: null, cards: [] }, activity: null, server_time: '2026-10-06T00:00:00Z' });
function context(overrides = {}) {
  let now = 10000, generation = 0;
  const calls = [], pending = [], messages = [], haptics = [], timers = [];
  const ctx = { Date: { now: () => now, parse: Date.parse }, Number, Boolean, String, Math,
    performance: { now: () => now }, lastSeasonServerRefreshAt: now, seasonRefreshPending: false, seasonRefreshRetryAt: 0,
    state: base(), activeScreen: 'explore', busy: false, noticesBusy: false,
    lastPassiveRefreshAt: 0, passiveRefreshInFlight: false, cooldownRefreshInFlight: false, seasonRefreshBusy: false,
    fastActionStateRefreshInFlight: false, fastActionStateDirty: false, fastActionStateRefreshTimer: 0,
    window: { clearTimeout: () => {}, setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; } },
    screen: { scrollTop: 0 },
    fullStateHydrationPromise: null, authenticationFailure: false, serverClockOffsetMs: 0,
    stateNeedsFullHydration: s => Boolean(s && s.hydration && s.hydration.full === false), beginStateRequest: () => ++generation,
    stateRequestGate: { isCurrent: n => n === generation },
    multiplayerFingerprint: s => JSON.stringify([s.arena, s.arena_queue, s.kaiju]),
    stateRefreshPayload: () => ({}), render: () => { ctx.renders++; }, renders: 0,
    tell: value => messages.push(value), haptic: value => haptics.push(value), showPendingNotices: async () => {},
    setStateSnapshot: (state, n) => { if (n !== generation) return false; ctx.state = state; ctx.lastSeasonServerRefreshAt = now; return true; },
    post: (path, body) => new Promise((resolve, reject) => { calls.push({ path, body }); pending.push({ resolve, reject }); }),
    ...overrides };
  vm.createContext(ctx); vm.runInContext(block('passiveLiveRefresh'), ctx);
  vm.runInContext(block('seasonalStateRefresh'), ctx);
  return { ctx, calls, pending, messages, haptics, timers, at: time => { now = time; }, advance: () => ++generation };
}

function requestRuntime(f) {
  let now = 0, sequence = 0;
  const requests = [], timers = new Map();
  Object.assign(f.ctx, {
    apiBase: 'https://moonboys-api.test', AbortController, authBody: () => ({ init_data: 'fixture' }),
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, body: JSON.parse(options.body), signal: options.signal, resolve, reject,
        respond: (data, status = 200) => resolve({ ok: status >= 200 && status < 300, status, json: async () => data }) });
    }),
  });
  vm.runInContext(block('apiRequest'), f.ctx);
  return { requests, timers, tick: async ms => {
    now += ms;
    for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    await new Promise(resolve => setImmediate(resolve));
  } };
}

for (const phase of ['fetch', 'body']) test(`a stalled live ${phase} is aborted and releases polling after manual recovery`, async () => {
  const f = context(), net = requestRuntime(f);
  const read = f.ctx.refreshLiveState();
  const stalled = net.requests[0];
  let finishBody;
  if (phase === 'body') {
    stalled.resolve({ ok: true, status: 200, json: () => new Promise(resolve => { finishBody = resolve; }) });
    await net.tick(0);
  }
  assert.equal(f.ctx.passiveRefreshInFlight, true);
  // Install a successful manual read while the old transport ignores abort.
  const manualGeneration = f.ctx.beginStateRequest();
  const manual = f.ctx.post('/telegram-pets/app/state', {});
  const fresh = base(); fresh.pet.pet_xp = 300; fresh.arena.current_round = 8;
  net.requests[1].respond({ state: fresh });
  assert.equal(f.ctx.setStateSnapshot((await manual).state, manualGeneration), true);
  f.at(40000); await net.tick(30000); await read;
  assert.equal(stalled.signal.aborted, true);
  assert.equal(f.ctx.passiveRefreshInFlight, false);
  assert.equal(f.ctx.state.pet.pet_xp, 300);
  assert.equal(net.timers.size, 0);
  // A late old body cannot publish stale state or block subsequent requests.
  if (phase === 'body') finishBody({ state: patch(2) }); else stalled.respond({ error: 'mini_app_auth_expired' }, 401);
  await net.tick(0);
  assert.equal(f.ctx.state.arena.current_round, 8);
  assert.equal(f.ctx.authenticationFailure, false, 'an aborted late response cannot expire the recovered session');
  f.at(45000); const next = f.ctx.refreshLiveState();
  assert.equal(net.requests.length, 3);
  net.requests[2].respond({ state: patch(9) }); await next;
  assert.equal(f.ctx.state.arena.current_round, 9);
});

test('a live timeout releases queued season, cooldown and care-state refreshes', async () => {
  const f = context({ cooldownRefreshFailures: 0, cooldownRefreshTimer: 0, lastCooldownRefreshKey: '' });
  Object.assign(f.ctx, { serverNowMs: () => 10000, collectCooldownEntries: () => [] });
  vm.runInContext(block('cooldownRefresh'), f.ctx);
  vm.runInContext(block('fastActionResponse'), f.ctx);
  const net = requestRuntime(f), read = f.ctx.refreshLiveState();
  f.ctx.lastSeasonServerRefreshAt = 1;
  f.at(400000); await f.ctx.refreshSeasonSnapshot(false);
  assert.equal(f.ctx.seasonRefreshPending, true);
  await net.tick(30000); await read;
  const season = f.ctx.refreshSeasonSnapshot(false);
  net.requests[1].respond({ state: base() }); await season;
  assert.equal(f.ctx.seasonRefreshPending, false);
  const cooldown = f.ctx.refreshExpiredCooldownState();
  net.requests[2].respond({ state: base() }); await cooldown;
  f.ctx.fastActionStateDirty = true;
  const care = f.ctx.refreshFastActionState();
  net.requests[3].respond({ state: base() }); await care;
  assert.equal(f.ctx.fastActionStateDirty, false);
  for (const flag of ['passiveRefreshInFlight', 'seasonRefreshBusy', 'cooldownRefreshInFlight', 'fastActionStateRefreshInFlight']) assert.equal(f.ctx[flag], false);
});

for (const kind of ['season', 'cooldown', 'care']) test(`a stalled ${kind} full body releases its guard and preserves retry work`, async () => {
  const f = context({ cooldownRefreshFailures: 0, cooldownRefreshTimer: 0, lastCooldownRefreshKey: '', fastActionStateDirty: true });
  Object.assign(f.ctx, { serverNowMs: () => 10000 });
  vm.runInContext(block('cooldownRefresh'), f.ctx);
  vm.runInContext(block('fastActionResponse'), f.ctx);
  const net = requestRuntime(f);
  const read = kind === 'season' ? f.ctx.refreshSeasonSnapshot(true)
    : kind === 'cooldown' ? f.ctx.refreshExpiredCooldownState() : f.ctx.refreshFastActionState();
  net.requests[0].resolve({ ok: true, status: 200, json: () => new Promise(() => {}) });
  await net.tick(0);
  await net.tick(59999);
  assert.equal(net.requests[0].signal.aborted, false);
  await net.tick(1); await read;
  assert.equal(net.requests[0].signal.aborted, true);
  const flag = kind === 'season' ? 'seasonRefreshBusy' : kind === 'cooldown' ? 'cooldownRefreshInFlight' : 'fastActionStateRefreshInFlight';
  assert.equal(f.ctx[flag], false);
  assert.equal(f.ctx.state.pet.pet_xp, 200);
  if (kind === 'season') assert.equal(f.ctx.seasonRefreshPending, true);
  if (kind === 'cooldown') assert.equal(f.ctx.cooldownRefreshFailures, 1);
  if (kind === 'care') assert.equal(f.ctx.fastActionStateDirty, true);
});

test('the request deadline bounds the entire read-only retry sequence', async () => {
  const f = context(), net = requestRuntime(f);
  const read = f.ctx.post('/telegram-pets/app/state', {});
  const rejected = assert.rejects(read, error => error.code === 'request_timeout');
  await net.tick(59500);
  net.requests[0].respond({ error: 'mini_app_state_failed' }, 503);
  await net.tick(0); await net.tick(250);
  assert.equal(net.requests.length, 2);
  assert.equal(net.requests[0].signal, net.requests[1].signal);
  await net.tick(250); await rejected;
  assert.equal(net.requests[1].signal.aborted, true);
  assert.equal(net.timers.size, 0);
});

test('timed-out mutations never replay automatically and completed requests clear their deadlines', async () => {
  const f = context(), net = requestRuntime(f);
  const action = f.ctx.post('/telegram-pets/app/action', { action: 'event_close', request_id: 'same-action' });
  const rejected = assert.rejects(action, error => error.code === 'request_timeout');
  net.requests[0].resolve({ ok: true, status: 200, json: () => new Promise(() => {}) });
  await net.tick(60000); await rejected;
  assert.equal(net.requests.length, 1);
  assert.equal(net.requests[0].signal.aborted, true);
  const completed = f.ctx.post('/telegram-pets/app/state', {});
  net.requests[1].respond({ state: base() });
  await completed;
  assert.equal(net.timers.size, 0);
  await net.tick(60000);
  assert.equal(net.requests[1].signal.aborted, false);
});

test('a 7.5-second response renders and overlapping five-second polls start no new request', async () => {
  const f = context();
  const first = f.ctx.refreshLiveState();
  f.at(15000); await f.ctx.refreshLiveState();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.mode, 'live');
  f.at(17500); f.pending[0].resolve({ state: patch(2) }); await first;
  assert.equal(f.ctx.state.arena.current_round, 2);
  assert.equal(f.ctx.renders, 1);
  assert.equal(f.ctx.passiveRefreshInFlight, false);
  assert.equal(f.ctx.state.inventory[0].item_key, 'keep');
  assert.equal(f.ctx.state.guidance.missions[0].title, 'keep');
  assert.equal(f.ctx.state.pet.pet_xp, 200);
  f.at(20000); await f.ctx.refreshLiveState(); assert.equal(f.calls.length, 1);
  f.at(22500); const next = f.ctx.refreshLiveState();
  f.pending[1].resolve({ state: patch(3) }); await next;
  assert.equal(f.ctx.state.arena.current_round, 3);
});

test('stale and wrong-pet patches cannot overwrite the current screen', async () => {
  for (const stale of [true, false]) {
    const f = context(); const read = f.ctx.refreshLiveState();
    const data = patch(4);
    if (stale) f.advance(); else data.pet_id = 'other-pet';
    f.pending[0].resolve({ state: data }); await read;
    assert.equal(f.ctx.state.arena.current_round, 1);
    assert.equal(f.ctx.renders, 0);
    assert.equal(f.ctx.passiveRefreshInFlight, false);
  }
});

test('terminal combat transition performs full recovery before publishing rewards', async () => {
  const f = context(); const read = f.ctx.refreshLiveState();
  const terminal = patch(2); terminal.arena = null; terminal.arena_result = { battle_id: 'battle-one', status: 'completed' };
  f.pending[0].resolve({ state: terminal });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].body)), {});
  assert.equal(f.ctx.state.pet.pet_xp, 200);
  const recovered = base(); recovered.arena = null; recovered.arena_result = terminal.arena_result; recovered.pet.pet_xp = 225;
  f.pending[1].resolve({ state: recovered }); await read;
  assert.equal(f.ctx.state.pet.pet_xp, 225);
  assert.equal(f.ctx.renders, 1);
});

test('an older Worker full response remains playable during a coordinated release', async () => {
  const f = context(); const read = f.ctx.refreshLiveState();
  const older = base(); older.arena.current_round = 2;
  f.pending[0].resolve({ state: older }); await read;
  assert.equal(f.ctx.state.arena.current_round, 2);
  assert.equal(f.ctx.renders, 1); assert.equal(f.calls.length, 1);
});

test('a rapid replay from another device recovers the previous match before publishing the next one', async () => {
  const f = context(); const read = f.ctx.refreshLiveState();
  const replay = patch(1); replay.arena.battle_id = 'next-battle';
  replay.arena_result = { battle_id: 'battle-one', status: 'completed' };
  f.pending[0].resolve({ state: replay });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 2); assert.equal(f.ctx.state.pet.pet_xp, 200);
  const recovered = base(); recovered.arena = replay.arena; recovered.arena_result = replay.arena_result; recovered.pet.pet_xp = 225;
  f.pending[1].resolve({ state: recovered }); await read;
  assert.equal(f.ctx.state.arena.battle_id, 'next-battle'); assert.equal(f.ctx.state.pet.pet_xp, 225);
});

test('an egg selected after another pet can still recover or close its saved Street Events', () => {
  const ctx = { state: { adopted: true, lifecycle: { phase: 'egg' }, pending_street_events: [{ event_id: 'original-one', recoverable: true }, { event_id: 'original-two', close_available: true }] },
    firstSessionExploreMarkup: () => '<egg-guide>', renderPlayNow: () => '<play>',
    petActionRefreshRequired: false, cooldownRemainingSeconds: () => 0,
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;'),
    panel: (title, body) => title + body };
  vm.createContext(ctx);
  vm.runInContext(block('actionAvailability'), ctx);
  vm.runInContext(client.slice(client.indexOf('  function button('), client.indexOf('  var panelOpenState')), ctx);
  vm.runInContext(client.slice(client.indexOf('  function renderExplore()'), client.indexOf('  function renderWork()')), ctx);
  const markup = ctx.renderExplore();
  assert.match(markup, /egg-guide/);
  assert.match(markup, /data-action="event_recover" data-payload="\{&quot;event_id&quot;:&quot;original-one&quot;\}"/);
  assert.match(markup, /data-action="event_close" data-payload="\{&quot;event_id&quot;:&quot;original-two&quot;\}"/);
  assert.doesNotMatch(markup, / disabled|HATCH REQUIRED/);
  assert.match(ctx.button('NEW EVENT', 'random_event', {}), / disabled/, 'new event gameplay remains hatch-gated');
  ctx.petActionRefreshRequired = true;
  assert.match(ctx.button('RECOVER', 'event_recover', {}), / disabled/, 'unconfirmed-save guard still applies');
});

test('an incomplete live response cannot clear authoritative activity or combat', async () => {
  const f = context(); const read = f.ctx.refreshLiveState();
  const incomplete = patch(2); delete incomplete.activity;
  f.pending[0].resolve({ state: incomplete }); await read;
  assert.equal(f.ctx.state.arena.current_round, 1); assert.equal(f.ctx.renders, 0);
});

test('a different device selecting another pet requests its full save instead of merging identities', async () => {
  const f = context(); const read = f.ctx.refreshLiveState();
  const change = patch(8); change.pet_id = 'new-pet'; change.hydration = { mode: 'live', full: false };
  f.pending[0].resolve({ state: change });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 2); assert.equal(f.ctx.state.pet.pet_id, 'pet-one');
  const full = base(); full.pet.pet_id = 'new-pet'; full.pet.pet_xp = 500; full.arena = null;
  f.pending[1].resolve({ state: full }); await read;
  assert.equal(f.ctx.state.pet.pet_id, 'new-pet'); assert.equal(f.ctx.state.pet.pet_xp, 500);
});

test('passive polling yields to hydration, cooldown, season and user actions', async () => {
  for (const flag of ['busy', 'noticesBusy', 'fastActionStateRefreshInFlight', 'cooldownRefreshInFlight', 'seasonRefreshBusy', 'fullStateHydrationPromise']) {
    const f = context({ [flag]: true }); await f.ctx.refreshLiveState(); assert.equal(f.calls.length, 0, flag);
  }
});

test('poll failure retains state, releases the in-flight guard and waits from completion', async () => {
  const f = context(); const read = f.ctx.refreshLiveState();
  f.at(17500); f.pending[0].reject(Error('read outage')); await read;
  assert.equal(f.ctx.state.arena.current_round, 1); assert.equal(f.ctx.passiveRefreshInFlight, false);
  f.at(20000); await f.ctx.refreshLiveState(); assert.equal(f.calls.length, 1);
});

test('cooldown retries back off, honor Retry-After, stop and resume after manual state refresh', async () => {
  const timers = [], messages = []; let calls = 0, retryAfter = 0;
  const ctx = { Date, Number, Array, Math: Object.assign(Object.create(Math), { random: () => 0 }),
    state: { adopted: true, cooldowns: { next_expires_at: '2020-01-01T00:00:00Z', entries: [{ expires_at: '2020-01-01T00:00:00Z' }] } },
    busy: false, noticesBusy: false, cooldownRefreshInFlight: false, cooldownRefreshFailures: 0,
    passiveRefreshInFlight: false, fastActionStateRefreshInFlight: false, seasonRefreshBusy: false, fullStateHydrationPromise: null,
    cooldownRefreshTimer: 0, lastCooldownRefreshKey: '', activeScreen: 'home',
    window: { clearTimeout: () => {}, setTimeout: (_fn, delay) => { timers.push(delay); return timers.length; } },
    serverNowMs: () => Date.now(), stateRefreshPayload: () => ({}), beginStateRequest: () => 1,
    tell: msg => messages.push(msg), post: async () => { calls++; throw Object.assign(Error('outage'), { retryAfterSeconds: retryAfter }); } };
  vm.createContext(ctx); vm.runInContext(block('cooldownRefresh'), ctx);
  await ctx.refreshExpiredCooldownState(); assert.equal(timers[0], 2000);
  retryAfter = 12; await ctx.refreshExpiredCooldownState(); assert.equal(timers[1], 12000);
  await ctx.refreshExpiredCooldownState(); await ctx.refreshExpiredCooldownState();
  assert.equal(calls, 3); assert.equal(timers.length, 2); assert.match(messages[0], /TAP REFRESH/);
  ctx.cooldownRefreshFailures = 0; retryAfter = 0;
  await ctx.refreshExpiredCooldownState(); assert.equal(calls, 4); assert.equal(timers[2], 2000);
});

test('a slow care-action full refresh cannot be superseded by live polling', async () => {
  const f = context({ fastActionStateDirty: true });
  vm.runInContext(block('fastActionResponse'), f.ctx);
  const care = f.ctx.refreshFastActionState();
  assert.equal(f.calls.length, 1);
  f.at(15000); await f.ctx.refreshLiveState();
  assert.equal(f.calls.length, 1);
  const full = base(); full.inventory = [{ item_key: 'after-care' }]; full.pet.pet_xp = 225;
  f.at(17500); f.pending[0].resolve({ state: full }); await care;
  assert.equal(f.ctx.fastActionStateDirty, false);
  assert.equal(f.ctx.fastActionStateRefreshInFlight, false);
  assert.equal(f.ctx.state.inventory[0].item_key, 'after-care');
  f.at(20000); const live = f.ctx.refreshLiveState();
  f.pending[1].resolve({ state: patch(2) }); await live;
  assert.equal(f.ctx.state.inventory[0].item_key, 'after-care');
  assert.equal(f.ctx.state.pet.pet_xp, 225);
});

test('a scheduled care-action refresh yields to an existing live poll then finishes', async () => {
  const f = context(); vm.runInContext(block('fastActionResponse'), f.ctx);
  const live = f.ctx.refreshLiveState();
  f.ctx.fastActionStateDirty = true;
  await f.ctx.refreshFastActionState();
  assert.equal(f.calls.length, 1);
  assert.equal(f.timers.at(-1).delay, 500);
  f.pending[0].resolve({ state: patch(2) }); await live;
  const care = f.ctx.refreshFastActionState();
  assert.equal(f.calls.length, 2);
  const full = base(); full.inventory = [{ item_key: 'after-care' }];
  f.pending[1].resolve({ state: full }); await care;
  assert.equal(f.ctx.state.inventory[0].item_key, 'after-care');
  assert.equal(f.ctx.fastActionStateDirty, false);
});

test('care-action full refresh yields to cooldown, season and module reads', async () => {
  for (const flag of ['cooldownRefreshInFlight', 'seasonRefreshBusy', 'fullStateHydrationPromise']) {
    const f = context({ fastActionStateDirty: true, [flag]: true });
    vm.runInContext(block('fastActionResponse'), f.ctx);
    await f.ctx.refreshFastActionState();
    assert.equal(f.calls.length, 0, flag);
    assert.equal(f.ctx.fastActionStateDirty, true);
    assert.ok(f.timers.length, flag);
  }
});

test('a timed activity notifies once on readiness and stays quiet on later polls', async () => {
  const initial = base(); initial.guidance.activity = { id: 'training-one', status: 'active', ready: false };
  const f = context({ activeScreen: 'work', state: initial }); f.at(20000);
  const ready = patch(1); ready.activity = { id: 'training-one', status: 'active', ready: true };
  const first = f.ctx.refreshLiveState(); f.pending[0].resolve({ state: ready }); await first;
  f.at(40000); const second = f.ctx.refreshLiveState(); f.pending[1].resolve({ state: ready }); await second;
  assert.equal(f.calls.length, 2, 'readiness alone does not trigger full recovery');
  assert.deepEqual(f.messages, ['TIMED ACTIVITY REWARD READY.']);
  assert.deepEqual(f.haptics, ['success']);
});

test('an already-ready timed activity does not re-notify when Work polls', async () => {
  const initial = base(); initial.guidance.activity = { id: 'training-one', status: 'active', ready: true };
  const f = context({ activeScreen: 'work', state: initial }); f.at(20000);
  const ready = patch(1); ready.activity = initial.guidance.activity;
  const read = f.ctx.refreshLiveState(); f.pending[0].resolve({ state: ready }); await read;
  assert.equal(f.messages.length, 0); assert.equal(f.haptics.length, 0);
});

for (const transition of ['claimed', 'replacement', 'status']) test(`cross-device activity ${transition} loads balances, XP and care before publishing`, async () => {
  const initial = base(); initial.guidance.activity = { id: 'training-one', status: 'active', ready: true };
  const f = context({ activeScreen: 'work', state: initial }); f.at(20000);
  const live = patch(1);
  live.activity = transition === 'claimed' ? null : { id: transition === 'replacement' ? 'training-two' : 'training-one', status: transition === 'status' ? 'completed' : 'active', ready: false };
  const read = f.ctx.refreshLiveState(); f.pending[0].resolve({ state: live });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 2);
  assert.equal(f.ctx.state.guidance.activity.id, 'training-one');
  assert.equal(f.ctx.state.pet.pet_xp, 200);
  const full = base(); full.guidance.activity = live.activity;
  full.pet = { ...full.pet, pet_xp: 260, moon_gold: 55, energy: 73 };
  f.pending[1].resolve({ state: full }); await read;
  assert.equal(f.ctx.state.pet.pet_xp, 260); assert.equal(f.ctx.state.pet.moon_gold, 55);
  assert.equal(f.ctx.state.pet.energy, 73); assert.equal(f.ctx.state.guidance.activity?.id ?? null, live.activity?.id ?? null);
});

test('failed full recovery after a cross-device activity claim retains the saved screen for retry', async () => {
  const initial = base(); initial.guidance.activity = { id: 'training-one', status: 'active', ready: true };
  const f = context({ activeScreen: 'work', state: initial }); f.at(20000);
  const read = f.ctx.refreshLiveState(); f.pending[0].resolve({ state: patch(1) });
  await new Promise(resolve => setImmediate(resolve));
  f.pending[1].reject(Error('recovery unavailable')); await read;
  assert.equal(f.ctx.state.guidance.activity.id, 'training-one');
  assert.equal(f.ctx.state.pet.pet_xp, 200); assert.equal(f.ctx.renders, 0);
  f.at(40000); const retry = f.ctx.refreshLiveState();
  f.pending[2].resolve({ state: patch(1) });
  await new Promise(resolve => setImmediate(resolve));
  const full = base(); full.pet.pet_xp = 260;
  f.pending[3].resolve({ state: full }); await retry;
  assert.equal(f.ctx.state.guidance.activity, null); assert.equal(f.ctx.state.pet.pet_xp, 260);
});

for (const system of ['arena', 'kaiju']) test(`${system}: an unchanged match with committed decisions triggers full recovery`, async () => {
  const initial = base(), live = patch(1);
  if (system === 'kaiju') {
    initial.arena = null; live.arena = null;
    initial.kaiju.match = { match_id: 'kaiju-one', status: 'selecting', own_card_locked: true };
    live.kaiju.match = initial.kaiju.match;
  }
  live.recovery_needed = true;
  const f = context({ state: initial }); const read = f.ctx.refreshLiveState();
  f.pending[0].resolve({ state: live }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 2); assert.equal(f.ctx.state.pet.pet_xp, 200);
  const full = base(); full.pet.pet_xp = 260; full.arena = null;
  if (system === 'kaiju') full.kaiju.result = { match_id: 'kaiju-one', status: 'completed' };
  else full.arena_result = { battle_id: 'battle-one', status: 'completed' };
  f.pending[1].resolve({ state: full }); await read;
  assert.equal(f.ctx.state.pet.pet_xp, 260); assert.equal(f.ctx.renders, 1);
});

for (const returnScreen of ['explore', 'work']) test(`pet-switch recovery remains full after visiting Missions and returning to ${returnScreen}`, async () => {
  const f = context(); vm.runInContext(block('coreStateHydration'), f.ctx);
  const read = f.ctx.refreshLiveState();
  f.ctx.activeScreen = 'missions';
  const change = patch(8); change.pet_id = 'new-pet'; change.hydration = { mode: 'live', full: false };
  f.pending[0].resolve({ state: change }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].body)), {}, 'recovery requests full state regardless of the current tab');
  f.ctx.activeScreen = returnScreen;
  const full = base(); full.pet.pet_id = 'new-pet'; full.pet.pet_xp = 500;
  full.guidance.activity = { id: 'training-two', status: 'active', ready: false };
  f.pending[1].resolve({ state: full }); await read;
  assert.equal(f.ctx.state.hydration.full, true); assert.equal(f.ctx.state.pet.pet_id, 'new-pet');
  assert.equal(f.ctx.state.inventory[0].item_key, 'keep'); assert.equal(f.ctx.stateNeedsScreenHydration(f.ctx.state, returnScreen), false);
  f.at(30000); const next = f.ctx.refreshLiveState();
  assert.equal(f.calls.length, 3, 'live polling resumes on the returned screen');
  const update = patch(2); update.pet_id = 'new-pet'; update.activity = full.guidance.activity;
  f.pending[2].resolve({ state: update }); await next;
});

test('terminal recovery also stays full when the player visits Missions during a live poll', async () => {
  const f = context(); vm.runInContext(block('coreStateHydration'), f.ctx);
  const read = f.ctx.refreshLiveState(); f.ctx.activeScreen = 'missions';
  const terminal = patch(1); terminal.arena = null; terminal.arena_result = { battle_id: 'battle-one', status: 'completed' };
  f.pending[0].resolve({ state: terminal }); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].body)), {});
  f.ctx.activeScreen = 'explore';
  const full = base(); full.arena = null; full.arena_result = terminal.arena_result; full.pet.pet_xp = 260;
  f.pending[1].resolve({ state: full }); await read;
  assert.equal(f.ctx.state.hydration.full, true); assert.equal(f.ctx.state.pet.pet_xp, 260);
});

for (const source of ['identity', 'combat']) test(`${source} recovery rejects an unexpected partial snapshot and keeps the hydrated save`, async () => {
  const f = context(); const read = f.ctx.refreshLiveState();
  const live = patch(1);
  if (source === 'identity') { live.pet_id = 'new-pet'; live.hydration = { mode: 'live', full: false }; }
  else live.recovery_needed = true;
  f.pending[0].resolve({ state: live }); await new Promise(resolve => setImmediate(resolve));
  const partial = base(); partial.hydration = { mode: 'missions', full: false, modules: ['missions'] }; partial.pet.pet_xp = 999;
  f.pending[1].resolve({ state: partial }); await read;
  assert.equal(f.ctx.state.hydration.full, true); assert.equal(f.ctx.state.pet.pet_xp, 200); assert.equal(f.ctx.renders, 0);
});

test('aligned five-second live and thirty-second season timers cannot starve five-minute full reads', async () => {
  const f = context(); let fullReads = 0;
  for (let step = 1; step <= 126; step++) {
    f.at(10000 + step * 5000);
    const before = f.calls.length, read = f.ctx.refreshLiveState();
    if (step % 6 === 0) f.ctx.tickSeasonDisplay();
    assert.equal(f.calls.length, before + 1, 'exactly one serialized request starts per tick');
    if (f.calls.at(-1).body.mode === 'live') f.pending.at(-1).resolve({ state: patch(step) });
    else {
      fullReads++;
      const full = base(); full.season = { key: 'fresh-' + fullReads };
      f.pending.at(-1).resolve({ state: full });
    }
    await read;
    assert.equal(f.ctx.passiveRefreshInFlight, false); assert.equal(f.ctx.seasonRefreshBusy, false);
  }
  assert.equal(fullReads, 2); assert.equal(f.ctx.state.season.key, 'fresh-2');
  assert.equal(f.ctx.seasonRefreshPending, false);
});

test('a due season tick during an existing slow live read queues the full save for the next poll', async () => {
  const f = context(); f.at(309999); const live = f.ctx.refreshLiveState();
  f.at(310000); await f.ctx.refreshSeasonSnapshot(false);
  assert.equal(f.ctx.seasonRefreshPending, true); assert.equal(f.calls.length, 1);
  f.at(310001); f.pending[0].resolve({ state: patch(2) }); await live;
  f.at(315000); const fullRead = f.ctx.refreshLiveState();
  assert.equal(f.calls.length, 2); assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].body)), {});
  const full = base(); full.season = { key: 'next-quarter' };
  f.pending[1].resolve({ state: full }); await fullRead;
  assert.equal(f.ctx.state.season.key, 'next-quarter'); assert.equal(f.ctx.seasonRefreshPending, false);
});

test('a forced visibility refresh blocked by live polling is retained until the next serialized read', async () => {
  const f = context(); const live = f.ctx.refreshLiveState();
  await f.ctx.refreshSeasonSnapshot(true);
  assert.equal(f.ctx.seasonRefreshPending, true); assert.equal(f.calls.length, 1);
  f.pending[0].resolve({ state: patch(2) }); await live;
  f.at(20000); const forced = f.ctx.refreshLiveState();
  assert.equal(f.calls.length, 2); assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].body)), {});
  f.pending[1].resolve({ state: base() }); await forced;
  assert.equal(f.ctx.seasonRefreshPending, false);
});

test('failed scheduled full reads retry after thirty seconds while lean combat polls continue', async () => {
  const f = context(); f.at(310000); const failed = f.ctx.refreshLiveState();
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].body)), {});
  f.pending[0].reject(Error('season refresh unavailable')); await failed;
  assert.equal(f.ctx.seasonRefreshPending, true); assert.equal(f.ctx.seasonRefreshRetryAt, 340000);
  f.at(315000); const live = f.ctx.refreshLiveState();
  assert.equal(f.calls[1].body.mode, 'live'); f.pending[1].resolve({ state: patch(2) }); await live;
  f.at(340000); const retry = f.ctx.refreshLiveState();
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[2].body)), {});
  f.pending[2].resolve({ state: base() }); await retry;
  assert.equal(f.ctx.seasonRefreshPending, false); assert.equal(f.ctx.seasonRefreshRetryAt, 0);
});

test('a scheduled full read rejects partial state even after a tab switch', async () => {
  const f = context(); f.at(310000); f.ctx.activeScreen = 'missions';
  const read = f.ctx.refreshSeasonSnapshot(false);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].body)), {});
  f.ctx.activeScreen = 'explore';
  const partial = base(); partial.hydration = { mode: 'missions', full: false, modules: ['missions'] };
  f.pending[0].resolve({ state: partial }); await read;
  assert.equal(f.ctx.state.hydration.full, true); assert.equal(f.ctx.seasonRefreshPending, true);
});
