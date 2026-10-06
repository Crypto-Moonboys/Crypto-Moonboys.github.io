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
  const calls = [], pending = [], messages = [];
  const ctx = { Date: { now: () => now, parse: Date.parse }, Number, Boolean, String, Math,
    state: base(), activeScreen: 'explore', busy: false, noticesBusy: false,
    lastPassiveRefreshAt: 0, passiveRefreshInFlight: false, cooldownRefreshInFlight: false, seasonRefreshBusy: false,
    fullStateHydrationPromise: null, authenticationFailure: false, serverClockOffsetMs: 0,
    stateNeedsFullHydration: () => false, beginStateRequest: () => ++generation,
    stateRequestGate: { isCurrent: n => n === generation },
    multiplayerFingerprint: s => JSON.stringify([s.arena, s.arena_queue, s.kaiju]),
    stateRefreshPayload: () => ({}), render: () => { ctx.renders++; }, renders: 0,
    tell: value => messages.push(value), haptic: () => {}, showPendingNotices: async () => {},
    setStateSnapshot: (state, n) => { if (n !== generation) return false; ctx.state = state; return true; },
    post: (path, body) => new Promise((resolve, reject) => { calls.push({ path, body }); pending.push({ resolve, reject }); }),
    ...overrides };
  vm.createContext(ctx); vm.runInContext(block('passiveLiveRefresh'), ctx);
  return { ctx, calls, pending, messages, at: time => { now = time; }, advance: () => ++generation };
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
  for (const flag of ['busy', 'noticesBusy', 'cooldownRefreshInFlight', 'seasonRefreshBusy', 'fullStateHydrationPromise']) {
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
    passiveRefreshInFlight: false, seasonRefreshBusy: false, fullStateHydrationPromise: null,
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
