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
  const timers = new Map(), attempts = [], requests = [], saved = [], notices = [], handlers = {};
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
    haptic() {}, tell(message) { notices.push(message); }, words: value => value, drawWorld() {},
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
  return { ctx, timers, attempts, requests, saved, notices, handlers, player, tap, tick, response, resolveAction: value => resolveAction(value || response) };
}

for (const reducedMotion of [false,true]) {
  for (const radioOn of [false,true]) test(`Dance preserves radio ${radioOn?'on':'off'} (reduced motion ${reducedMotion})`,async()=>{
    const f=fixture({reducedMotion});
    if(radioOn) await f.ctx.setRadioEnabled(true,true);
    const attempts=f.attempts.length,pauses=f.player.pauses,saved=[...f.saved];
    await f.tap();await f.tick(10000);
    assert.equal(f.ctx.radioRequestedOn,radioOn);
    assert.equal(f.ctx.radioEnabled,radioOn);
    assert.equal(f.attempts.length,attempts,'Dance never calls play');
    assert.equal(f.player.pauses,pauses,'Dance ending never pauses music');
    assert.deepEqual(f.saved,saved,'Dance leaves the radio preference untouched');
    assert.equal(f.requests.length,1,'existing dance action still runs once');
  });
}
for (const reply of [{result:{accepted:false,reason:'blocked'}},{error:'unavailable'}]) test('failed Dance cannot stop manually playing radio: '+JSON.stringify(reply),async()=>{
  const f=fixture({reply});await f.ctx.setRadioEnabled(true,true);
  await f.tap();await f.tick(10000);
  assert.equal(f.ctx.radioEnabled,true);assert.equal(f.player.pauses,0);
});
test('pending Dance has no ownership of the radio control',async()=>{
  const f=fixture({pending:true});const action=f.tap();
  await f.ctx.toggleRadio();f.resolveAction();await action;await f.tick(10000);
  assert.equal(f.ctx.radioRequestedOn,true);assert.equal(f.player.pauses,0);
  await f.ctx.toggleRadio();assert.equal(f.ctx.radioRequestedOn,false);
});
test('a cold manual stream can connect while Dance ends without being cancelled',async()=>{
  const f=fixture({stallPlay:true});const playback=f.ctx.setRadioEnabled(true,true);
  await f.tap();await f.tick(4000);f.attempts[0].resolve();await playback;
  assert.equal(f.ctx.radioEnabled,true);assert.equal(f.player.pauses,0);
});
test('manual radio failure still restores the off state and offers a gesture retry',async()=>{
  const f=fixture({stallPlay:true});const playback=f.ctx.setRadioEnabled(true,true);
  f.attempts[0].reject({name:'NotAllowedError'});await playback;
  assert.equal(f.ctx.radioRequestedOn,false);assert.equal(f.ctx.radioNeedsGesture,true);
});
test('Radio off during Dance stays off after the pose completes',async()=>{
  const f=fixture();await f.ctx.setRadioEnabled(true,true);
  await f.tap();await f.ctx.toggleRadio();await f.tick(10000);
  assert.equal(f.ctx.radioRequestedOn,false);assert.equal(f.ctx.radioEnabled,false);
  assert.equal(f.player.pauses,1);assert.equal(f.attempts.length,1);
});
test('a Dance click never resumes blocked autoplay',()=>{
  const f=fixture();f.ctx.radioNeedsGesture=true;
  f.ctx.resumeRadioOnGesture({type:'click',isTrusted:true,target:{closest:selector=>selector.includes('[data-action="dance"]')}});
  assert.equal(f.attempts.length,0);
});
test('a local pose click never resumes blocked autoplay',()=>{
  const f=fixture();f.ctx.radioNeedsGesture=true;
  f.ctx.resumeRadioOnGesture({type:'click',isTrusted:true,target:{closest:selector=>selector.includes('[data-local-emote]')}});
  assert.equal(f.attempts.length,0);
});
test('manual radio timeout hides playback and ignores a late play resolution',async()=>{
  const f=fixture({stallPlay:true});const playback=f.ctx.setRadioEnabled(true,true);
  await f.tick(16000);assert.equal(f.ctx.radioRequestedOn,false);assert.equal(f.ctx.radioStatus,'error');
  f.attempts[0].resolve();await playback;
  assert.equal(f.ctx.radioEnabled,false);assert.equal(f.ctx.radioRequestedOn,false);
});
