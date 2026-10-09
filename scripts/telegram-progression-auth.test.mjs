import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

// Execute the actual browser modules; only translate their root-relative imports.
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('/js/') ? pathToFileURL(resolve('.' + specifier)).href : specifier, context);
} });
const missions = await import('../js/arcade/systems/faction-missions.js');
const war = await import('../js/arcade/systems/faction-war-system.js');
const modifiers = await import('../js/arcade/systems/cross-game-modifier-system.js');
const streaks = await import('../js/arcade/systems/faction-streaks.js');
const wtf = await import('../js/arcade/systems/daily-wtf-event-system.js');
const sync = await import('../js/arcade/systems/player-progress-sync.js');
hooks.deregister();

const ID = '123456789';
const fresh = { id: ID, hash: 's1_' + 'B'.repeat(43), auth_date: Math.floor(Date.now() / 1000), expires_at: Math.floor(Date.now() / 1000) + 300 };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 12; i++) await tick(); }

function browser({ authImpl, fetchImpl = async () => Response.json({ ok: true }) } = {}) {
  const storage = new Map(), calls = [], events = [], nodes = new Map();
  let accountId = ID, linked = false, auth = { ...fresh, hash: 's1_' + 'A'.repeat(43), expires_at: 1 }, renewals = 0;
  function node() {
    return { style: {}, children: [], listeners: {}, setAttribute() {},
      appendChild(child) { this.children.push(child); if (child.id) nodes.set(child.id, child); },
      replaceChildren() { this.children = []; }, remove() { nodes.delete(this.id); },
      addEventListener(name, callback) { this.listeners[name] = callback; } };
  }
  const gate = { getTelegramId: () => accountId, getTelegramAuth: () => auth,
    isTelegramLinked: () => linked, getSignedTelegramAuth: () => linked ? auth : null,
    async getFreshTelegramAuth() {
      renewals++;
      const next = await (authImpl ? authImpl(renewals) : fresh);
      if (next) { auth = next; accountId = next.id; linked = true; }
      return next;
    } };
  globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  globalThis.window = { MOONBOYS_IDENTITY: gate, MOONBOYS_API: { BASE_URL: 'https://api.test' }, dispatchEvent: event => events.push(event) };
  globalThis.document = { body: node(), getElementById: id => nodes.get(id), createElement: node };
  globalThis.fetch = async (...args) => { calls.push(args); return fetchImpl(...args); };
  return { calls, events, gate, nodes, get renewals() { return renewals; }, switchAccount(id) { accountId = id; } };
}

const writers = [
  ['daily missions', '/player/daily-missions/progress', () => { const m = missions.getDailyMissions('graffpunks')[0]; missions.recordMissionProgress('graffpunks', m.type, 1); }],
  ['faction contributions and proof', '/faction/signal/contribute', () => war.recordContribution('graffpunks', 'score_submission', 3)],
  ['modifier selection', '/player/modifiers/active', () => modifiers.setActiveModifier(modifiers.MODIFIER_DEFS[0].id)],
  ['modifier clearing', '/player/modifiers/active', () => modifiers.clearActiveModifier()],
  ['WTF check-in', '/wtf/events/check-in', () => wtf.checkInWtfEvent('test-event')],
  ['WTF completion', '/wtf/events/complete', () => wtf.completeWtfEvent('test-event', 'arcade_run', 'run-1')],
  ['WTF option selection', '/wtf/events/choose-option', () => wtf.chooseWtfOption('test-event', 'choice-1')],
];

for (const [name, route, write] of writers) {
  test(`${name} awaits renewal even when an expired website proof currently appears unlinked`, async () => {
    let finish;
    const b = browser({ authImpl: () => new Promise(resolve => { finish = resolve; }) });
    const pending = write();
    await settle();
    assert.equal(b.calls.length, 0, 'no unauthenticated or stale-proof mutation');
    assert.ok(finish, 'writer must reach asynchronous authentication despite the linked flag');
    // Subsequent proof/feed/read calls may also request fresh auth.
    window.MOONBOYS_IDENTITY.getFreshTelegramAuth = async () => fresh;
    window.MOONBOYS_IDENTITY.isTelegramLinked = () => true;
    finish(fresh);
    await pending;
    await settle();
    const matching = b.calls.filter(([url]) => url.endsWith(route));
    assert.equal(matching.length, 1);
    assert.equal(JSON.parse(matching[0][1].body).telegram_auth.hash, fresh.hash);
    if (name.startsWith('faction')) {
      const proof = b.calls.find(([url]) => url.endsWith('/battle-chamber/event'));
      assert.equal(JSON.parse(proof[1].body).clout_delta, 0, 'clout ownership remains unchanged');
    }
  });
}

test('mission completion proof also waits for fresh auth', async () => {
  const b = browser();
  const mission = missions.getDailyMissions('graffpunks')[0];
  missions.recordMissionProgress('graffpunks', mission.type, mission.target);
  await settle();
  const proof = b.calls.find(([url]) => url.endsWith('/battle-chamber/event'));
  assert.ok(proof);
  assert.equal(JSON.parse(proof[1].body).telegram_auth.hash, fresh.hash);
  assert.equal(JSON.parse(proof[1].body).clout_delta, 0);
});

test('failed auth preflight retains unsent updates and exposes a safe retry', async () => {
  let offline = true;
  const b = browser({ authImpl: () => offline ? null : fresh });
  const result = await sync.syncPlayerProgress('/player/daily-missions/progress', { mission_id: 'test', amount: 1 });
  assert.equal(result.retryable, true);
  assert.equal(b.renewals, 2);
  assert.equal(b.calls.length, 0);
  assert.equal(b.events.at(-1).detail.error, 'progression_auth_unavailable');
  const notice = b.nodes.get('moonboys-progression-sync-notice');
  assert.equal(notice.children.at(-1).textContent, 'Retry updates');
  offline = false;
  await notice.children.at(-1).listeners.click();
  assert.equal(b.calls.length, 1);
  assert.equal(JSON.parse(b.calls[0][1].body).amount, 1);
  assert.equal(b.nodes.has('moonboys-progression-sync-notice'), false);
});

test('transient preflight recovery submits only once', async () => {
  const b = browser({ authImpl: attempt => attempt === 1 ? null : fresh });
  assert.equal((await sync.syncPlayerProgress('/faction/signal/contribute', { contribution: 3 })).ok, true);
  assert.equal(b.renewals, 2);
  assert.equal(b.calls.length, 1);
});

test('a queued update cannot cross accounts during renewal or explicit retry', async () => {
  const b = browser({ authImpl: () => ({ ...fresh, id: '987654321' }) });
  const result = await sync.syncPlayerProgress('/faction/signal/contribute', { contribution: 3 });
  assert.equal(result.error, 'progression_identity_changed');
  assert.equal(b.calls.length, 0);
  await sync.retryPendingProgression();
  assert.equal(b.calls.length, 0);
});

test('safe pending retries stay pinned to their original account', async () => {
  let nextAuth = null;
  const b = browser({ authImpl: () => nextAuth });
  assert.equal((await sync.syncPlayerProgress('/player/daily-missions/progress', { amount: 1 })).retryable, true);
  nextAuth = { ...fresh, id: '987654321' };
  const [result] = await sync.retryPendingProgression();
  assert.equal(result.error, 'progression_identity_changed');
  assert.equal(b.calls.length, 0);
});

test('latest modifier selection supersedes an unsent older choice and preserves request order', async () => {
  let offline = true;
  const b = browser({ authImpl: () => offline ? null : fresh });
  await sync.syncPlayerProgress('/player/modifiers/active', { active_modifier_id: 'old' }, { selection: true });
  offline = false;
  await sync.syncPlayerProgress('/player/modifiers/active', { active_modifier_id: 'new' }, { selection: true });
  await sync.retryPendingProgression();
  assert.deepEqual(b.calls.map(([, options]) => JSON.parse(options.body).active_modifier_id), ['new']);
});

test('guest and unlinked legacy players retain local-only gameplay', async () => {
  const b = browser({ authImpl: () => null });
  b.switchAccount(null);
  b.gate.getTelegramAuth = () => null;
  assert.equal((await sync.syncPlayerProgress('/player/modifiers/active', {})).skipped, true);
  assert.equal(b.calls.length, 0);
  b.switchAccount(ID);
  const legacy = { ...fresh, hash: 'a'.repeat(64) };
  b.gate.getTelegramAuth = () => legacy;
  b.gate.getFreshTelegramAuth = async () => legacy;
  b.gate.getSignedTelegramAuth = () => legacy;
  b.gate.isTelegramLinked = () => false;
  assert.equal((await sync.syncPlayerProgress('/player/modifiers/active', {})).skipped, true);
  assert.equal(b.calls.length, 0);
  b.gate.isTelegramLinked = () => true;
  await sync.syncPlayerProgress('/player/modifiers/active', {});
  assert.equal(JSON.parse(b.calls[0][1].body).telegram_auth.hash, legacy.hash);
});

test('a shared display ID change cannot redirect an action from this tab\'s retained proof', async () => {
  const b = browser({ authImpl: () => ({ ...fresh, id: '987654321' }) });
  b.switchAccount('987654321');
  assert.equal((await sync.syncPlayerProgress('/faction/signal/contribute', {})).error, 'progression_identity_changed');
  assert.equal(b.calls.length, 0);
});

test('expired cookie sessions keep unsent updates pinned until verified authentication returns', async () => {
  const b = browser({ authImpl: () => null });
  b.gate.getFreshTelegramAuth = async () => { b.switchAccount(null); b.gate.getTelegramAuth = () => null; return null; };
  assert.equal((await sync.syncPlayerProgress('/player/daily-missions/progress', {})).retryable, true);
  assert.equal(b.calls.length, 0);
  b.gate.getFreshTelegramAuth = async () => { b.switchAccount(ID); return fresh; };
  b.gate.isTelegramLinked = () => true;
  assert.equal((await sync.retryPendingProgression())[0].ok, true);
  assert.equal(b.calls.length, 1);
});

test('safe Daily WTF retries retain completion events and refresh behavior', async () => {
  let offline = true;
  const b = browser({ authImpl: () => offline ? null : fresh,
    fetchImpl: async url => Response.json(url.endsWith('/complete') ? { ok: true, xp_burst: { xp: 50 }, chain_options: [{ id: 'choice-1' }] } : { ok: true }) });
  assert.equal((await wtf.completeWtfEvent('test-event', 'arcade_run', 'run-1')).retryable, true);
  offline = false;
  await sync.retryPendingProgression();
  assert.equal(b.calls.filter(([url]) => url.endsWith('/complete')).length, 1);
  assert.ok(b.calls.some(([url]) => url.endsWith('/today')));
  for (const type of ['moonboys:wtf-event-complete', 'moonboys:xp-burst', 'moonboys:roguelite-options-unlocked']) {
    assert.equal(b.events.filter(event => event.type === type).length, 1);
  }
});

test('Daily WTF keeps its existing authenticated legacy access without adding a bot-link prerequisite', async () => {
  const b = browser();
  const legacy = { ...fresh, hash: 'a'.repeat(64) };
  b.gate.getFreshTelegramAuth = async () => legacy;
  b.gate.getSignedTelegramAuth = () => legacy;
  b.gate.isTelegramLinked = () => false;
  await wtf.checkInWtfEvent('test-event');
  assert.equal(JSON.parse(b.calls[0][1].body).telegram_auth.hash, legacy.hash);
});

test('server hydration waits for renewal before testing activation', async () => {
  const b = browser();
  await missions.hydrateMissionsFromServer();
  await modifiers.hydrateModifiersFromServer();
  await streaks.hydrateStreaksFromServer();
  assert.deepEqual(b.calls.map(([url]) => new URL(url).pathname), ['/player/daily-missions', '/player/modifiers', '/player/state']);
  assert.ok(b.calls.every(([, options]) => JSON.parse(options.body).telegram_auth.hash === fresh.hash));
});

for (const failure of ['network', 'HTTP failure', 'invalid response']) {
  test(`${failure} after a progression submission is surfaced without replay`, async () => {
    const b = browser({ fetchImpl: async () => {
      if (failure === 'network') throw new Error('response lost');
      if (failure === 'invalid response') return new Response('{');
      return Response.json({ error: 'database_unavailable' }, { status: 503 });
    } });
    const result = await sync.syncPlayerProgress('/faction/signal/contribute', { contribution: 3 });
    assert.equal(result.ok, false);
    assert.equal(result.retryable, false);
    assert.equal(b.calls.length, 1);
    await sync.retryPendingProgression();
    assert.equal(b.calls.length, 1);
    assert.ok(b.nodes.has('moonboys-progression-sync-notice'));
  });
}
