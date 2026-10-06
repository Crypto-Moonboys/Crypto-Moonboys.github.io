import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const loaderSource = fs.readFileSync(new URL('../js/moonpet-bot-art-loader.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
const rendererSource = fs.readFileSync(new URL('../js/moonpet-bot-art-renderer.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function clock() {
  let now = 10000, sequence = 0;
  const timers = new Map();
  const api = {
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  return { api, timers, now: () => now, tick: async ms => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now && timers.has(id)) {
      timers.delete(id); timer.fn();
    }
    await flush();
  } };
}

function artContext(fault = null, action = false) {
  const time = clock(), requests = [], images = [], stalls = [];
  const registryPath = '/data/moonpet-bot-art-registry.json';
  const manifestPath = '/test/manifest.json';
  const registry = { default_bot: 'TEST', bots: { TEST: {
    canonical_species_ids: ['test_species'], status: 'complete', manifest_path: manifestPath,
    evolution_art: { stage_1: { status: 'complete', manifest_path: manifestPath } },
  } } };
  const asset = role => ({ role, png_path: `/test/${role}.png`, atlas_path: `/test/${role}.json`, review_status: 'approved_visual_review' });
  const manifest = { character_name: 'TEST', cache_version: 'test', runtime_role_map: { idle: 'front_idle' },
    assets: [asset('front_idle'), ...(action ? [asset('front_dance')] : [])] };
  const atlas = { frames: [{ frame: { x: 0, y: 0, w: 32, h: 32 } }] };
  const payload = path => path === registryPath ? registry : path === manifestPath ? manifest : atlas;
  const stalled = (path, phase) => fault && fault.enabled !== false && fault.path === path && fault.phase === phase;
  class TestImage {
    constructor() { images.push(this); }
    set src(url) {
      this.url = url;
      if (!stalled(url.split('?')[0], 'image')) queueMicrotask(() => this.onload && this.onload());
    }
    removeAttribute(name) { if (name === 'src') this.removed = true; }
  }
  const ctx = { window: {}, AbortController, Image: TestImage, ...time.api,
    fetch: async (url, options) => {
      const path = url.split('?')[0], request = { path, signal: options.signal };
      requests.push(request);
      if (stalled(path, 'fetch')) {
        const pending = deferred(); stalls.push({ ...pending, phase: 'fetch', path }); return pending.promise;
      }
      return { ok: true, status: 200, json: async () => {
        if (stalled(path, 'body')) {
          const pending = deferred(); stalls.push({ ...pending, phase: 'body', path }); return pending.promise;
        }
        return payload(path);
      } };
    },
  };
  vm.createContext(ctx); vm.runInContext(loaderSource, ctx);
  return { ...time, requests, images, stalls, payload,
    load: () => ctx.window.MoonpetBotArtLoader.loadMoonpetBotArt({ speciesId: 'test_species', evolutionStage: 1 }) };
}

for (const path of ['/data/moonpet-bot-art-registry.json', '/test/manifest.json']) for (const phase of ['fetch', 'body']) {
  test(`${path}: a stalled ${phase} aborts at 15 seconds and permits a fresh load`, async () => {
    const fault = { path, phase }, f = artContext(fault);
    const failure = assert.rejects(f.load(), /timed out/);
    await flush(); await f.tick(14999);
    assert.equal(f.requests.find(r => r.path === path).signal.aborted, false);
    await f.tick(1); await failure;
    assert.equal(f.requests.find(r => r.path === path).signal.aborted, true);
    assert.equal(f.timers.size, 0);
    fault.enabled = false;
    const recovered = await f.load(); await recovered.preload;
    assert.equal(recovered.ready, true);
    assert.equal(f.requests.filter(r => r.path === path).length, 2);
    assert.equal(f.timers.size, 0);
  });
}

for (const phase of ['fetch', 'body']) {
  test(`idle atlas: a stalled ${phase} returns a failed pack and clears its cache`, async () => {
    const fault = { path: '/test/front_idle.json', phase }, f = artContext(fault);
    const read = f.load(); await flush(); await f.tick(15000);
    const failed = await read; await failed.preload;
    assert.equal(failed.ready, false);
    assert.match(failed.errors.join('\n'), /front_idle.*timed out/);
    assert.equal(f.requests.find(r => r.path === fault.path).signal.aborted, true);
    assert.equal(f.timers.size, 0);
    fault.enabled = false;
    const recovered = await f.load(); await recovered.preload;
    assert.equal(recovered.ready, true);
    assert.equal(f.requests.filter(r => r.path === '/test/manifest.json').length, 2);
  });
}

test('a stalled idle PNG detaches its handlers and permits an uncached retry', async () => {
  const fault = { path: '/test/front_idle.png', phase: 'image' }, f = artContext(fault);
  const read = f.load(); await flush();
  const image = f.images[0];
  await f.tick(15000); const failed = await read; await failed.preload;
  assert.equal(failed.ready, false);
  assert.match(failed.errors.join('\n'), /front_idle.*timed out/);
  assert.equal(image.removed, true);
  assert.equal(image.onload, null); assert.equal(image.onerror, null);
  assert.equal(f.timers.size, 0);
  fault.enabled = false;
  const recovered = await f.load(); await recovered.preload;
  assert.equal(recovered.ready, true);
  assert.equal(f.images.length, 2);
});

for (const [path, phase] of [['/test/front_dance.json', 'fetch'], ['/test/front_dance.json', 'body'], ['/test/front_dance.png', 'image']]) {
  test(`action art: stalled ${phase} preserves idle and settles background preload`, async () => {
    const fault = { path, phase }, f = artContext(fault, true);
    const pack = await f.load(); await flush();
    assert.equal(pack.ready, true);
    assert.ok(pack.assetsByRole.front_idle);
    await f.tick(15000); await pack.preload;
    assert.equal(pack.assetsByRole.front_dance, undefined);
    assert.match(pack.errors.join('\n'), /front_dance.*timed out/);
    assert.equal(f.timers.size, 0);
    fault.enabled = false;
    const recovered = await f.load(); await recovered.preload;
    assert.ok(recovered.assetsByRole.front_idle); assert.ok(recovered.assetsByRole.front_dance);
    assert.equal(f.requests.filter(r => r.path === '/test/manifest.json').length, 2);
  });
}

for (const phase of ['fetch', 'body']) {
  test(`late registry ${phase} completion cannot poison a recovered cache`, async () => {
    const fault = { path: '/data/moonpet-bot-art-registry.json', phase }, f = artContext(fault);
    const failure = assert.rejects(f.load(), /timed out/); await flush(); await f.tick(15000); await failure;
    fault.enabled = false;
    const recovered = await f.load(); await recovered.preload;
    const badRegistry = { default_bot: 'WRONG', bots: {} };
    f.stalls[0].resolve(phase === 'fetch' ? { ok: true, json: async () => badRegistry } : badRegistry);
    await flush();
    const cached = await f.load(); await cached.preload;
    assert.equal(cached.resolvedBot, 'TEST'); assert.equal(cached.ready, true);
    assert.equal(f.requests.filter(r => r.path === fault.path).length, 2);
    assert.equal(f.timers.size, 0);
  });
}

test('healthy art clears deadlines and reuses its loaded pack', async () => {
  const f = artContext(null, true), pack = await f.load(); await pack.preload;
  assert.equal(pack.ready, true); assert.equal(f.timers.size, 0);
  const count = f.requests.length;
  const cached = await f.load(); await cached.preload;
  assert.equal(f.requests.length, count);
  assert.equal(cached.assetsByRole.front_idle, pack.assetsByRole.front_idle);
});

function hatchContext() {
  const time = clock(), loads = [], selected = [], drawn = [], actions = [];
  const ctx = { window: { ...time.api, MoonpetBotArtLoader: { loadMoonpetBotArt() {
    const pending = deferred(); loads.push(pending); return pending.promise;
  } } }, performance: { now: time.now }, console: { info() {} },
  state: { pet: { pet_id: 'pet-a', xp: 12 }, lifecycle: { phase: 'street' } },
  hatchArtTransitionUntil: 0, hatchArtTransitionTimer: 0, hatchStageOnePreloadPromise: null, hatchArtTransitionGeneration: 0,
  animationUntil: Infinity, animationMode: 'hatch', actionSequence: 0, actionStartedAt: time.now(), reducedMotionAnimationTimer: 0,
  sleepLatched: false, reducedMotion: true, busy: false, petActionRefreshRequired: false, authenticationFailure: false, activeScreen: 'home',
  lifecycleCeremonyActive: () => false, shouldUseFastActionResponse: () => false, playOptionsReady: () => true,
  crypto: { randomUUID: () => 'hatch-request' }, haptic() {}, tell() {}, words: value => value,
  beginStateRequest: () => 1, stateRequestGate: { isCurrent: () => true },
  post: async (path, payload) => { actions.push({ path, payload }); return ctx.actionResponse; },
  mergeActionResultCooldown: snapshot => snapshot, setStateSnapshot(snapshot) { ctx.state = snapshot; return true; },
  render() {}, resultMessage: () => 'accepted', showPendingNotices: async () => {},
  planLifecycleCeremony: () => null, startLifecycleCeremony() {},
  botArtIdentity: snapshot => ({ pet_id: snapshot.pet.pet_id }), hatchAnimationDuration: () => 3200,
  syncDanceRadioAnimation() {},
  selectBotArtForState: async snapshot => { selected.push(snapshot); }, drawWorld: now => drawn.push(now),
  };
  vm.createContext(ctx);
  const start = clientSource.indexOf('// TEST-EXPORT: hatchArtTransition:start');
  const end = clientSource.indexOf('// TEST-EXPORT: hatchArtTransition:end');
  const animation = clientSource.slice(clientSource.indexOf('  function actionAnimationFamily('), clientSource.indexOf('  function hatchArtTransitionActive('));
  const action = clientSource.slice(clientSource.indexOf('  async function runAction('), clientSource.indexOf('  function switchScreen('));
  vm.runInContext(animation + clientSource.slice(start, end) + action, ctx);
  return { ...time, ctx, loads, selected, drawn, actions, acceptedHatch: async () => {
    ctx.state = { ...ctx.state, lifecycle: { phase: 'egg' } };
    ctx.actionResponse = { result: { accepted: true }, state: { ...ctx.state, lifecycle: { phase: 'street' } } };
    await ctx.runAction('hatch', {});
  } };
}

async function renderHeldEgg(f) {
  const roleContext = { window: {} };
  vm.runInNewContext(loaderSource, roleContext);
  const frames = Array.from({ length: 25 }, (_, index) => ({ x: index * 32, y: 0, w: 32, h: 32, index }));
  const assetsByRole = {
    egg_hatch: { frames, image: {}, fps: 12, one_shot: true, loop: false },
    egg_idle: { frames: [frames[0]], image: {}, fps: 12, loop: true },
  };
  const window = { MoonpetBotArtLoader: {
    eggRoleForAnimationMode: roleContext.window.MoonpetBotArtLoader.eggRoleForAnimationMode,
    loadMoonpetBotArt: async () => ({ ready: true, assetsByRole, requestedEvolution: 'stage_0',
      resolvedEvolution: 'stage_0', resolvedBot: 'EGGYONE', errors: [], preload: Promise.resolve() }),
  } };
  vm.runInNewContext(rendererSource, { window, performance: f.ctx.performance });
  const renderer = window.MoonpetBotArtRenderer;
  await renderer.initMoonpetBotArtRenderer({ evolutionStage: 0 });
  const canvas = { save() {}, restore() {}, drawImage() {} };
  f.ctx.drawWorld = time => {
    assert.equal(renderer.renderMoonpetBot(canvas, f.ctx.animationMode, 0, 0, 1, time, {
      active: f.ctx.sleepLatched || f.ctx.animationUntil > time,
      startedAt: f.ctx.actionStartedAt, lifecycle: f.ctx.state.lifecycle,
    }), true);
  };
  return () => renderer.getMoonpetBotArtRendererState().lastRender;
}

for (const release of ['preload', 'failure', 'deadline', 'motion-enabled']) {
  test(`${release}: accepted Hatch holds its final rendered frame past reduced-motion completion`, async () => {
    const f = hatchContext();
    if (release === 'motion-enabled') f.ctx.reducedMotion = false;
    const rendered = await renderHeldEgg(f); await f.acceptedHatch();
    await f.tick(3220); await f.tick(230);
    f.ctx.drawWorld(f.now());
    assert.equal(f.ctx.animationMode, 'hatch');
    assert.equal(f.ctx.animationUntil, Infinity);
    assert.ok(f.ctx.hatchArtTransitionUntil > f.now());
    assert.equal(rendered().role, 'egg_hatch'); assert.equal(rendered().frameIndex, 24);
    await f.tick(2000); f.ctx.drawWorld(f.now());
    assert.equal(rendered().role, 'egg_hatch'); assert.equal(rendered().frameIndex, 24);
    assert.equal(f.selected.length, 0);
    if (release === 'deadline') await f.tick(f.ctx.hatchArtTransitionUntil - f.now());
    else {
      if (release === 'failure') f.loads[0].reject(Error('stage art unavailable'));
      else f.loads[0].resolve({ ready: true });
      await flush();
    }
    assert.equal(f.ctx.hatchArtTransitionUntil, 0);
    assert.equal(f.ctx.animationUntil, 0); assert.equal(f.ctx.animationMode, 'idle');
    assert.equal(f.selected[0], f.ctx.state); assert.equal(f.ctx.state.pet.xp, 12);
    assert.equal(f.actions.length, 1); assert.equal(f.timers.size, 0);
  });
}

test('a stalled hatch preload releases the visual lock after the reveal deadline', async () => {
  const f = hatchContext(), saved = f.ctx.state;
  assert.equal(f.ctx.startHatchArtTransition(3200, saved), 3200);
  await f.tick(3220);
  assert.equal(Number.isFinite(f.ctx.hatchArtTransitionUntil), true);
  await f.tick(9999); assert.equal(f.selected.length, 0);
  await f.tick(1);
  assert.equal(f.ctx.hatchArtTransitionUntil, 0);
  assert.equal(f.ctx.animationUntil, 0); assert.equal(f.ctx.animationMode, 'idle');
  assert.equal(f.selected[0], saved); assert.equal(f.ctx.state.pet.xp, 12);
  assert.equal(f.drawn.length, 1); assert.equal(f.timers.size, 0);
  f.loads[0].resolve({ ready: true }); await flush();
  assert.equal(f.selected.length, 1);
});

for (const rejected of [false, true]) {
  test(`a ${rejected ? 'failed' : 'ready'} preload releases after the hatch animation`, async () => {
    const f = hatchContext(); f.ctx.sleepLatched = true;
    f.ctx.startHatchArtTransition(3200, f.ctx.state);
    if (rejected) f.loads[0].reject(Error('asset failed')); else f.loads[0].resolve({ ready: true });
    await flush(); assert.equal(f.selected.length, 0);
    await f.tick(3220);
    assert.equal(f.ctx.hatchArtTransitionUntil, 0); assert.equal(f.ctx.animationMode, 'sleep');
    assert.equal(f.selected.length, 1); assert.equal(f.timers.size, 0);
  });
}

test('completion of an older hatch cannot clear a newer transition', async () => {
  const f = hatchContext(); f.ctx.startHatchArtTransition(3200, f.ctx.state); await f.tick(3220);
  f.ctx.startHatchArtTransition(3200, f.ctx.state);
  const until = f.ctx.hatchArtTransitionUntil;
  f.loads[0].resolve({ ready: true }); await flush();
  assert.equal(f.ctx.hatchArtTransitionUntil, until); assert.equal(f.selected.length, 0);
  await f.tick(3220); f.loads[1].resolve({ ready: true }); await flush();
  assert.equal(f.ctx.hatchArtTransitionUntil, 0); assert.equal(f.selected.length, 1);
  assert.equal(f.timers.size, 0);
});

test('a delayed hatch reveal selects the current saved pet after a switch', async () => {
  const f = hatchContext(); f.ctx.startHatchArtTransition(3200, f.ctx.state); await f.tick(3220);
  const selectedPet = { pet: { pet_id: 'pet-b', xp: 900 }, lifecycle: { phase: 'adult' } };
  f.ctx.state = selectedPet; f.loads[0].resolve({ ready: true }); await flush();
  assert.equal(f.selected[0], selectedPet); assert.equal(f.ctx.state.pet.xp, 900);
  assert.equal(f.ctx.hatchArtTransitionUntil, 0); assert.equal(f.timers.size, 0);
});

test('the accepted Hatch handler binds the reveal to its final animation sequence', async () => {
  const f = hatchContext(); await f.acceptedHatch();
  assert.equal(f.ctx.actionSequence, 2);
  assert.equal(f.ctx.animationUntil, Infinity);
  assert.equal(f.loads.length, 1);
  await f.tick(3220); await f.tick(10000);
  assert.equal(f.ctx.hatchArtTransitionUntil, 0);
  assert.equal(f.ctx.animationUntil, 0); assert.equal(f.ctx.animationMode, 'idle');
  assert.equal(f.selected[0], f.ctx.state);
  assert.equal(f.ctx.state.pet.xp, 12);
  assert.equal(f.actions.length, 1); assert.equal(f.actions[0].payload.action, 'hatch');
  assert.equal(f.timers.size, 0);
});

for (const release of ['deadline', 'preload']) for (const [action, accepted, mode, duration] of [
  ['dance', true, 'dance', 3600], ['feed', true, 'feed', 2800],
  ['sleep', true, 'sleep', Infinity], ['dance', false, 'blocked', 2800],
]) {
  test(`hatch ${release} preserves a newer ${mode} animation`, async () => {
    const f = hatchContext(); await f.acceptedHatch();
    await f.tick(3220); await f.tick(9999);
    f.ctx.sleepLatched = action === 'sleep';
    f.ctx.animateAction(action, accepted, Number.isFinite(duration) ? duration : 2800);
    const newer = { until: f.ctx.animationUntil, mode: f.ctx.animationMode,
      sequence: f.ctx.actionSequence, started: f.ctx.actionStartedAt };
    assert.equal(newer.mode, mode); assert.ok(newer.until > f.now());
    if (release === 'deadline') await f.tick(1);
    else { f.loads[0].resolve({ ready: true }); await flush(); }
    assert.equal(f.ctx.hatchArtTransitionUntil, 0);
    assert.equal(f.ctx.animationUntil, newer.until); assert.equal(f.ctx.animationMode, newer.mode);
    assert.equal(f.ctx.actionStartedAt, newer.started); assert.equal(f.ctx.actionSequence, newer.sequence);
    assert.equal(f.selected[0], f.ctx.state); assert.equal(f.ctx.state.pet.xp, 12);
    assert.equal(f.actions.length, 1);
    if (Number.isFinite(duration)) {
      assert.ok(f.timers.has(f.ctx.reducedMotionAnimationTimer), 'the new action keeps its own completion timer');
      await f.tick(duration); assert.equal(f.ctx.animationMode, 'idle');
    } else assert.equal(f.ctx.animationMode, 'sleep');
    f.loads[0].resolve({ ready: true }); await flush();
    assert.equal(f.selected.length, 1); assert.equal(f.timers.size, 0);
  });
}
