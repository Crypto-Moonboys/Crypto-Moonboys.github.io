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
    state: base(), activeScreen: 'explore', busy: false, noticesBusy: false,
    lastPassiveRefreshAt: 0, passiveRefreshInFlight: false, cooldownRefreshInFlight: false, seasonRefreshBusy: false,
    fastActionStateRefreshInFlight: false, fastActionStateDirty: false, fastActionStateRefreshTimer: 0,
    window: { clearTimeout: () => {}, setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; } },
    screen: { scrollTop: 0 },
    fullStateHydrationPromise: null, authenticationFailure: false, serverClockOffsetMs: 0,
    stateNeedsFullHydration: () => false, beginStateRequest: () => ++generation,
    stateRequestGate: { isCurrent: n => n === generation },
    multiplayerFingerprint: s => JSON.stringify([s.arena, s.arena_queue, s.kaiju]),
    stateRefreshPayload: () => ({}), render: () => { ctx.renders++; }, renders: 0,
    tell: value => messages.push(value), haptic: value => haptics.push(value), showPendingNotices: async () => {},
    setStateSnapshot: (state, n) => { if (n !== generation) return false; ctx.state = state; return true; },
    post: (path, body) => new Promise((resolve, reject) => { calls.push({ path, body }); pending.push({ resolve, reject }); }),
    ...overrides };
  vm.createContext(ctx); vm.runInContext(block('passiveLiveRefresh'), ctx);
  return { ctx, calls, pending, messages, haptics, timers, at: time => { now = time; }, advance: () => ++generation };
}

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
  assert.deepEqual(f.calls[1].body, {});
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
  const ctx = { state: { pending_street_events: [{ event_id: 'original-one', recoverable: true }, { event_id: 'original-two', close_available: true }] },
    firstSessionExploreMarkup: () => '<egg-guide>', renderPlayNow: () => '<play>',
    button: (label, action, payload) => action + ':' + payload.event_id,
    panel: (title, body) => title + body };
  vm.createContext(ctx);
  vm.runInContext(client.slice(client.indexOf('  function renderExplore()'), client.indexOf('  function renderWork()')), ctx);
  const markup = ctx.renderExplore();
  assert.match(markup, /egg-guide/); assert.match(markup, /event_recover:original-one/);
  assert.match(markup, /event_close:original-two/);
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
