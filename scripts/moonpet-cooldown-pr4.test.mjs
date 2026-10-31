import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the shipped cooldown controller rather than a rewritten simulation.
const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
const start = client.indexOf('// TEST-EXPORT: cooldownRefresh:start');
const end = client.indexOf('// TEST-EXPORT: cooldownRefresh:end', start);
assert.ok(start >= 0 && end > start, 'cooldown refresh source must remain available');
const cooldownSource = client.slice(start, end);
const now = Date.parse('2026-10-31T12:00:00Z');
const expiredA = '2026-10-31T11:59:00Z';
const expiredB = '2026-10-31T11:59:40Z';

function snapshot(expiresAt) {
  return {
    adopted: true,
    cooldowns: { next_expires_at: expiresAt, entries: [{ key: 'care:feed', expires_at: expiresAt }] },
    guidance: { activity: null },
    regions: [],
    live_systems: { chains: [] },
  };
}

function harness() {
  const pending = new Map(), scheduled = [], messages = [];
  let nextTimerId = 0, postCalls = 0, renders = 0;
  const ctx = {
    Date, Number, Math,
    document: { hidden: false },
    state: snapshot(expiredA),
    cooldownRefreshTimer: 0, cooldownRefreshFailures: 0, lastCooldownRefreshKey: '',
    busy: false, noticesBusy: false, cooldownRefreshInFlight: false,
    passiveRefreshInFlight: false, fastActionStateRefreshInFlight: false,
    seasonRefreshBusy: false, fullStateHydrationPromise: null,
    activeScreen: 'home',
    window: {
      clearTimeout(id) { pending.delete(id); },
      setTimeout(fn, delay) {
        const id = ++nextTimerId;
        pending.set(id, { fn, delay });
        scheduled.push(delay);
        return id;
      },
    },
    serverNowMs: () => now,
    stateRefreshPayload: () => ({}),
    beginStateRequest: () => 1,
    post: async () => {
      postCalls += 1;
      return { state: snapshot(ctx.state.cooldowns.next_expires_at) };
    },
    setStateSnapshot(next) {
      ctx.state = next;
      // The shipped state installer schedules the next expiry on every
      // accepted authoritative snapshot, even if it retains the same key.
      ctx.scheduleCooldownRefresh();
      return true;
    },
    screen: { scrollTop: 0 },
    render: () => { renders += 1; },
    tell: msg => messages.push(msg),
    showPendingNotices: async () => {},
    stateNeedsFullHydration: () => false,
  };
  vm.createContext(ctx);
  vm.runInContext(cooldownSource, ctx);
  return {
    ctx, scheduled, messages,
    get pending() { return pending; },
    get postCalls() { return postCalls; },
    get renders() { return renders; },
    async fireNext() {
      const next = pending.entries().next().value;
      assert.ok(next, 'a scheduled expiry must exist');
      pending.delete(next[0]);
      next[1].fn();
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

test('processed expiry creates no repeating one-second timer and preserves authoritative read', async () => {
  const f = harness();
  await f.ctx.refreshExpiredCooldownState();
  assert.equal(f.postCalls, 1);
  assert.equal(f.renders, 1);
  assert.equal(f.pending.size, 1, 'accepted snapshot may schedule one expiry revisit');
  await f.fireNext();
  assert.equal(f.postCalls, 1, 'same expiry must not replay the authoritative read');
  assert.equal(f.pending.size, 0, 'same expiry must not run a one-second timer forever');
  assert.equal(f.scheduled.some(ms => ms === 1000), false, 'duplicate expiry cannot schedule repeated 1s wakes');
});

test('new expiry key still refreshes, and busy state still requeues', async () => {
  const f = harness();
  await f.ctx.refreshExpiredCooldownState();
  await f.fireNext();
  f.ctx.state = snapshot(expiredB);
  f.ctx.busy = true;
  await f.ctx.refreshExpiredCooldownState();
  assert.equal(f.postCalls, 1, 'busy state must not issue a competing read');
  assert.ok(f.scheduled.includes(1000), 'busy path still retries');
  f.ctx.busy = false;
  await f.fireNext();
  assert.equal(f.postCalls, 2, 'new expired key receives its own authoritative read');
  assert.equal(f.renders, 2);
});
