import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
const radio = source.split('// TEST-EXPORT: radioPlayback:start')[1].split('// TEST-EXPORT: radioPlayback:end')[0];
const animation = source.slice(source.indexOf('  function actionAnimationFamily('), source.indexOf('  function hatchArtTransitionActive('));
const action = source.slice(source.indexOf('  async function runAction('), source.indexOf('  function switchScreen('));
const lifecycle = source.slice(source.indexOf("  window.addEventListener('pagehide'"), source.indexOf('  window.MoonpetBetaAppearance = '));
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function fixture({ reducedMotion = false, fast = true, stallPlay = false, reply, pending = false } = {}) {
  let now = 0, nextId = 0, gesture = false, resolveAction;
  const timers = new Map(), attempts = [], requests = [], saved = [], handlers = {};
  const api = { setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, clearInterval() {}, addEventListener(name, fn) { handlers[name] = fn; } };
  const player = { error: null, paused: true, pauses: 0, loads: 0, play() {
    this.paused = false;
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    attempts.push({ resolve, reject, gesture, at: now });
    if (!stallPlay) resolve();
    return promise;
  }, pause() { this.paused = true; this.pauses++; }, load() { this.loads++; this.error = null; } };
  const state = { adopted: true, pet: { pet_id: 'dance-pet', energy: 80 }, lifecycle: { phase: 'young' }, guidance: {} };
  const response = reply || (fast ? { result: { accepted: true }, state_pending: true } : { result: { accepted: true }, state });
  const mutation = pending ? new Promise(resolve => { resolveAction = resolve; }) : Promise.resolve(response);
  const ctx = { window: api, performance: { now: () => now }, document: { hidden: false, addEventListener(name, fn) { handlers[name] = fn; } },
    radioPlayer: player, radioRequestedOn: false, radioEnabled: false, radioRequestGeneration: 0,
    radioRetryNeedsLoad: false, radioNeedsGesture: false, state, busy: false, petActionRefreshRequired: false,
    authenticationFailure: false, activeScreen: 'home', animationMode: 'idle', animationUntil: 0,
    actionSequence: 0, actionStartedAt: 0, sleepLatched: false, reducedMotion,
    reducedMotionAnimationTimer: 0, scoreTimer: 0, audioEnabled: false, performanceSent: true,
    saveRadioPreference: value => saved.push(value), syncMoonpetScore() {}, renderCanvasTools() {},
    haptic() {}, tell() {}, words: value => value, drawWorld() {},
    lifecycleCeremonyActive: () => false, shouldUseFastActionResponse: () => fast, playOptionsReady: () => true,
    beginStateRequest: () => 1, stateRequestGate: { isCurrent: () => true }, crypto: { randomUUID: () => 'dance-request' },
    post(path, payload) { requests.push({ path, payload }); return mutation; },
    patchFastActionState: value => value, resultMessage: () => 'SAVED', render() {}, scheduleFastActionStateRefresh() {},
    setSleepLatch(value) { ctx.sleepLatched = value; }, mergeActionResultCooldown: value => value,
    setStateSnapshot(value) { ctx.state = value; return true; }, planLifecycleCeremony: () => null,
    startLifecycleCeremony() {}, showPendingNotices: async () => {}, refreshSeasonSnapshot() {},
  };
  vm.createContext(ctx); vm.runInContext(radio + animation + action + lifecycle, ctx);
  const tap = (name = 'dance') => { gesture = true; try { return ctx.runAction(name, {}); } finally { gesture = false; } };
  const tick = async duration => {
    const end = now + duration;
    for (;;) {
      const first = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!first) break;
      now = first[1].at; timers.delete(first[0]); first[1].fn(); await flush();
    }
    now = end; await flush();
  };
  return { ctx, timers, attempts, requests, saved, handlers, player, tap, tick, response, resolveAction: value => resolveAction(value || response) };
}

for (const reducedMotion of [false, true]) test(`Dance starts in the tap and stops at its actual pose deadline (reduced motion ${reducedMotion})`, async () => {
  const f = fixture({ reducedMotion });
  const work = f.tap();
  assert.equal(f.attempts.length, 1); assert.equal(f.attempts[0].gesture, true);
  assert.equal(f.ctx.animationMode, 'dance'); assert.equal(f.ctx.animationUntil, 3600);
  await work; assert.equal(f.ctx.radioEnabled, true);
  await f.tick(3599); assert.equal(f.player.paused, false);
  await f.tick(1); assert.equal(f.player.paused, true); assert.equal(f.ctx.radioRequestedOn, false);
  if (reducedMotion) assert.equal(f.ctx.animationMode, 'idle');
  assert.deepEqual(f.saved, [], 'automatic dance start/stop keeps the manual preference');
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].payload.action, 'dance');
  assert.equal(f.timers.size, 0);
});

test('a slow accepted Dance uses the accepted animation deadline and still unlocks audio in the tap', async () => {
  const f = fixture({ fast: false, pending: true }); f.ctx.sleepLatched = true;
  const work = f.tap(); await flush();
  assert.equal(f.attempts[0].gesture, true); assert.equal(f.ctx.actionSequence, 0);
  await f.tick(500); f.resolveAction(); await work;
  assert.equal(f.ctx.sleepLatched, false); assert.equal(f.ctx.animationUntil, 4100);
  await f.tick(3599); assert.equal(f.ctx.radioEnabled, true);
  await f.tick(1); assert.equal(f.ctx.radioEnabled, false); assert.equal(f.timers.size, 0);
});

test('a replacement pose stops dance radio immediately', async () => {
  const f = fixture(); await f.tap(); await f.tick(500);
  f.ctx.animateAction('feed', true, 2800);
  assert.equal(f.ctx.animationMode, 'feed'); assert.equal(f.ctx.radioEnabled, false);
  assert.equal(f.timers.size, 0); assert.deepEqual(f.saved, []);
});

test('restarting a dance cannot let its old completion stop the new dance', async () => {
  const f = fixture(); await f.tap();
  const stale = [...f.timers.values()][0].fn;
  await f.tick(1000); await f.tap(); stale();
  assert.equal(f.ctx.radioEnabled, true);
  await f.tick(2600); assert.equal(f.ctx.radioEnabled, true);
  await f.tick(1000); assert.equal(f.ctx.radioEnabled, false);
});

test('an extended pose cannot be stopped by its stale sequence timer', async () => {
  const f = fixture(); await f.tap(); const stale = [...f.timers.values()][0].fn;
  await f.tick(500); f.ctx.animateAction('dance', true, 3600); stale();
  assert.equal(f.ctx.radioEnabled, true); await f.tick(3600); assert.equal(f.ctx.radioEnabled, false);
});

test('the Radio control overrides dance ownership and protects new manual playback from stale timers', async () => {
  const f = fixture(); await f.tap(); const stale = [...f.timers.values()][0].fn;
  await f.ctx.toggleRadio(); assert.equal(f.ctx.radioEnabled, false);
  await f.ctx.toggleRadio(); stale(); await f.tick(3600);
  assert.equal(f.ctx.radioEnabled, true); assert.deepEqual(f.saved, [false, true]);
});

test('a station already playing still stops when the requested Dance finishes', async () => {
  const f = fixture(); await f.ctx.setRadioEnabled(true, false); await f.tap(); await f.tick(3600);
  assert.equal(f.ctx.radioEnabled, false); assert.deepEqual(f.saved, [true]);
});

test('rejected and unconfirmed Dance responses stop temporary playback without replaying the mutation', async () => {
  for (const reply of [{ result: { accepted: false, reason: 'cooldown' }, state_pending: true }, {}]) {
    const f = fixture({ reply }); await f.tap();
    assert.equal(f.ctx.radioEnabled, false); assert.equal(f.player.paused, true);
    assert.equal(f.ctx.animationMode, 'blocked'); assert.equal(f.requests.length, 1); assert.deepEqual(f.saved, []);
  }
});

test('late media success cannot restart radio after the dance deadline', async () => {
  const f = fixture({ stallPlay: true }); await f.tap(); await f.tick(3600);
  f.attempts[0].resolve(); await flush();
  assert.equal(f.ctx.radioEnabled, false); assert.equal(f.player.paused, true); assert.deepEqual(f.saved, []);
});

test('temporary playback failure cannot arm unrelated first-tap autoplay', async () => {
  const f = fixture({ stallPlay: true }); await f.tap();
  f.attempts[0].reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })); await flush();
  assert.equal(f.ctx.radioNeedsGesture, false); assert.equal(f.ctx.radioRequestedOn, false);
  f.ctx.resumeRadioOnGesture({ type: 'click', isTrusted: true });
  assert.equal(f.attempts.length, 1); assert.equal(f.timers.size, 0); assert.deepEqual(f.saved, []);
});

test('Dance owns its gesture instead of first-tap autoplay persisting an On preference', async () => {
  const f = fixture(); f.ctx.radioNeedsGesture = true;
  f.ctx.resumeRadioOnGesture({ type: 'click', isTrusted: true, target: { closest: selector => selector.includes('[data-action="dance"]') } });
  assert.equal(f.attempts.length, 0); await f.tap(); await f.tick(3600); assert.deepEqual(f.saved, []);
});

for (const event of ['pagehide', 'visibilitychange']) test(`${event} stops the dance and prevents restored-page radio replay`, async () => {
  const f = fixture(); await f.tap();
  if (event === 'visibilitychange') f.ctx.document.hidden = true;
  f.handlers[event](); assert.equal(f.ctx.radioRequestedOn, false); assert.equal(f.player.paused, true);
  f.handlers.pageshow({ persisted: true }); await flush();
  assert.equal(f.attempts.length, 1); assert.deepEqual(f.saved, []); assert.equal(f.timers.size, 0);
});

test('pending action abandonment has a bounded radio deadline', async () => {
  const f = fixture({ fast: false, pending: true }); const work = f.tap(); await f.tick(65000);
  assert.equal(f.ctx.radioEnabled, false); f.resolveAction(); await work;
  assert.equal(f.ctx.radioEnabled, false, 'a late action cannot replay media outside the original tap');
});

test('busy controls and unrelated actions never start dance radio', async () => {
  const f = fixture(); f.ctx.busy = true; await f.tap(); f.ctx.busy = false; await f.tap('feed');
  assert.equal(f.attempts.length, 0); assert.equal(f.requests.length, 1);
});
