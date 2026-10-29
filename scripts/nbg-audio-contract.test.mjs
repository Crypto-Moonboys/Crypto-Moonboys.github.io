#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audioRoot = path.join(root, 'game', 'assets', 'audio', 'nbg-dark-industrial');
const manifestPath = path.join(audioRoot, 'manifest.json');
const managerPath = path.join(root, 'game', 'nbg-audio.js');

const expectedEffects = [
  'ui_start', 'ui_confirm', 'ui_back', 'ui_pause', 'ui_resume', 'game_over',
  'level_complete', 'record_saved', 'record_rejected', 'jump_1', 'jump_2',
  'jump_3_backflip', 'land_soft', 'land_heavy', 'spray_attack', 'spray_hit',
  'rat_attack', 'rat_pounce', 'parachute_rat_drop', 'parachute_rat_land',
  'graffbot_fire', 'graffbot_hurt', 'balloon_release', 'balloon_burst',
  'pigeon_pass', 'enemy_defeat', 'enemy_stomp', 'player_hurt', 'player_fall',
  'health_restore', 'health_low', 'coin_small', 'coin_medium', 'coin_large',
  'coin_xl', 'coin_combo', 'secret_found', 'speed_boost_pickup',
  'speed_boost_end', 'mystery_box', 'star_box', 'checkpoint'
].sort();

const expectedEnemyIdentities = [
  'graffbot_walk', 'graffbot_idle', 'graffbot_spot',
  'london_rat_walk', 'london_rat_alert', 'brown_rat_walk', 'brown_rat_alert',
  'turquoise_rat_walk', 'turquoise_rat_alert',
  'parachute_rat_a_descent', 'parachute_rat_b_descent', 'parachute_rat_c_descent',
  'balloon_girl_walk', 'balloon_girl_presence', 'balloon_girl_spot',
  'pigeon_flight', 'pigeon_call'
].sort();

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    dispatchEvent(event) {
      for (const handler of listeners.get(event.type) || []) handler.call(this, event);
      return true;
    }
  };
}

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

function fakeAudioEnvironment(manifest, options = {}) {
  const document = Object.assign(createEventTarget(), { hidden: false });
  const window = Object.assign(createEventTarget(), {
    location: { href: 'https://example.test/games/nbg-london/' }
  });
  const stored = new Map();
  const pendingAssetFetches = [];
  const assetIds = new Map([
    ...Object.entries(manifest.effects || {}).map(([id, file]) => [file, id]),
    ...Object.entries(manifest.enemyIdentities || {}).map(([id, file]) => [file, id]),
    ...(manifest.music?.main ? [[manifest.music.main, 'music:main']] : [])
  ]);
  const encodedAsset = (url) => {
    const match = [...assetIds].find(([file]) => url.endsWith(file));
    return { id: match ? match[1] : 'unknown', slice() { return this; } };
  };
  window.localStorage = {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); }
  };

  const sources = [];
  const contexts = [];
  class FakeAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = {};
      contexts.push(this);
    }
    createGain() {
      const gain = {
        value: 1,
        ramps: [],
        setValueAtTime(value) { this.value = value; },
        cancelScheduledValues() {},
        linearRampToValueAtTime(value, time) {
          this.value = value;
          this.ramps.push({ value, time });
        }
      };
      return { gain, connect() {}, disconnect() {} };
    }
    createBufferSource() {
      const source = {
        loop: false,
        buffer: null,
        onended: null,
        connect(target) { source.destination = target; },
        disconnect() {},
        start(...args) { source.startArgs = args; sources.push(source); },
        stop(when) { source.stopped = true; source.stopAt = when; if (source.onended) source.onended(); }
      };
      return source;
    }
    decodeAudioData(data) { return Promise.resolve({ duration: 1, id: data.id }); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
  }
  window.AudioContext = FakeAudioContext;

  async function fetch(input) {
    const url = String(input);
    if (url.endsWith('/manifest.json')) {
      return { ok: true, status: 200, json: async () => manifest };
    }
    return {
      ok: true,
      status: 200,
      arrayBuffer: options.delayAssets ?
        () => new Promise((resolve) => pendingAssetFetches.push({ resolve, data: encodedAsset(url) })) :
        async () => encodedAsset(url)
    };
  }

  function releaseAssets() {
    for (const pending of pendingAssetFetches.splice(0)) pending.resolve(pending.data);
  }

  return { document, window, stored, sources, contexts, fetch, releaseAssets };
}

async function flushPromises(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('live audio payload contains exactly the approved compressed pack', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(Object.keys(manifest.effects).sort(), expectedEffects);
  assert.equal(Object.keys(manifest.effects).length, 42);
  assert.deepEqual(Object.keys(manifest.enemyIdentities).sort(), expectedEnemyIdentities);
  assert.equal(Object.keys(manifest.enemyIdentities).length, 17);
  assert.equal(manifest.music.main, 'music/main_theme_dark_industrial_loop.ogg');

  const referenced = [
    ...Object.values(manifest.effects),
    ...Object.values(manifest.enemyIdentities),
    manifest.music.main
  ];
  assert.equal(new Set(referenced).size, 60);
  for (const relative of referenced) {
    assert.equal(relative.endsWith('.ogg'), true, relative);
    assert.equal(relative.includes('..'), false, relative);
    const absolute = path.resolve(audioRoot, relative);
    assert.equal(absolute.startsWith(audioRoot + path.sep), true, relative);
    const bytes = await readFile(absolute);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'OggS', relative);
    assert.equal((await stat(absolute)).size > 100, true, relative);
  }

  const deployedFiles = [];
  for (const directory of ['sfx', 'music', 'enemy']) {
    for (const file of await readdir(path.join(audioRoot, directory))) {
      deployedFiles.push(file);
    }
  }
  assert.equal(deployedFiles.some((file) => file.toLowerCase().endsWith('.wav')), false);
});

test('audio manager unlocks only from interaction and separates bounded music/SFX playback', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const source = await readFile(managerPath, 'utf8');
  const env = fakeAudioEnvironment(manifest);
  const context = vm.createContext({
    window: env.window,
    document: env.document,
    fetch: env.fetch,
    CustomEvent: FakeCustomEvent,
    URL,
    Map,
    Object,
    Number,
    Promise,
    Date,
    Array,
    Math,
    console
  });

  vm.runInContext(source, context, { filename: 'game/nbg-audio.js' });
  assert.equal(env.contexts.length, 0, 'AudioContext must not be created on page load');
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().encodedAssets, 60);
  assert.equal(env.window.NBGAudio.getState().maxVoices, 12);

  env.document.dispatchEvent(new FakeCustomEvent('pointerdown'));
  await flushPromises();
  assert.equal(env.contexts.length, 1);
  assert.equal(env.contexts[0].state, 'running');

  env.window.dispatchEvent(new FakeCustomEvent('nbg-level-started'));
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().musicWanted, true);
  assert.equal(env.window.NBGAudio.getState().musicPlaying, true);
  assert.equal(env.sources.some((sourceNode) => sourceNode.loop === true), true);

  const beforeSecret = env.sources.length;
  env.window.dispatchEvent(new FakeCustomEvent('nbg-xp-collected', {
    detail: { coin: { secret: true, tier: 'xl' }, multiplier: 1 }
  }));
  await flushPromises();
  assert.equal(env.sources.length, beforeSecret, 'secret XP must not play a coin tier');
  env.window.dispatchEvent(new FakeCustomEvent('nbg-secret-found'));
  await flushPromises();
  assert.equal(env.sources.length, beforeSecret + 1);

  for (const tier of ['small', 'medium', 'large', 'xl']) {
    env.window.dispatchEvent(new FakeCustomEvent('nbg-xp-collected', {
      detail: { coin: { tier }, multiplier: 1 }
    }));
  }
  await flushPromises();
  assert.equal(env.sources.length, beforeSecret + 5, 'each normal coin tier must resolve once');

  const beforeRecord = env.sources.length;
  env.window.dispatchEvent(new FakeCustomEvent('nbg-record-result', {
    detail: { accepted: false, authoritative: false }
  }));
  await flushPromises();
  assert.equal(env.sources.length, beforeRecord, 'non-authoritative failures stay silent');
  env.window.dispatchEvent(new FakeCustomEvent('nbg-record-result', {
    detail: { accepted: false, authoritative: true }
  }));
  env.window.dispatchEvent(new FakeCustomEvent('nbg-record-result', {
    detail: { accepted: true, authoritative: true }
  }));
  await flushPromises();
  assert.equal(env.sources.length, beforeRecord + 2);

  for (const id of expectedEffects.slice(0, 20)) env.window.NBGAudio.playEffect(id);
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().activeVoices <= 12, true);

  env.window.NBGAudio.setLevels({ music: 0.25, sfx: 0.6 });
  env.window.NBGAudio.setMuted(true);
  assert.equal(JSON.parse(env.stored.get('nbg-audio-settings-v1')).muted, true);
  assert.equal(env.window.NBGAudio.getState().activeVoices, 0);
  env.window.NBGAudio.setMuted(false);
  await flushPromises();

  env.document.hidden = true;
  env.document.dispatchEvent(new FakeCustomEvent('visibilitychange'));
  await flushPromises();
  assert.equal(env.contexts[0].state, 'suspended');
  env.document.hidden = false;
  env.document.dispatchEvent(new FakeCustomEvent('visibilitychange'));
  await flushPromises();
  assert.equal(env.contexts[0].state, 'running');
});


test('enemy identities use bounded persistent proximity loops with complete lifecycle control', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const source = await readFile(managerPath, 'utf8');
  const env = fakeAudioEnvironment(manifest);
  const context = vm.createContext({
    window: env.window,
    document: env.document,
    fetch: env.fetch,
    CustomEvent: FakeCustomEvent,
    URL,
    Map,
    Set,
    Object,
    Number,
    Promise,
    Date,
    Array,
    Math,
    console
  });

  vm.runInContext(source, context, { filename: 'game/nbg-audio.js' });
  await flushPromises();
  env.document.dispatchEvent(new FakeCustomEvent('pointerdown'));
  await flushPromises();

  const dispatchFrame = (enemies) => {
    env.window.dispatchEvent(new FakeCustomEvent('nbg-enemy-audio-frame', {
      detail: { listener: { x: 0, y: 0 }, enemies }
    }));
  };
  const snapshot = (key, identity, overrides = {}) => ({
    key,
    identity,
    x: 20,
    y: 0,
    moving: true,
    state: 'moving',
    alive: true,
    visible: true,
    ...overrides
  });

  const loopMappings = [
    ['bot', {}, 'graffbot_walk'],
    ['bot', { moving: false, state: 'idle' }, 'graffbot_idle'],
    ['rat', {}, 'london_rat_walk'],
    ['brownRat', {}, 'brown_rat_walk'],
    ['turquoiseRat', {}, 'turquoise_rat_walk'],
    ['parachuteRatA', {}, 'parachute_rat_a_descent'],
    ['parachuteRatB', {}, 'parachute_rat_b_descent'],
    ['parachuteRatC', {}, 'parachute_rat_c_descent'],
    ['balloon', {}, 'balloon_girl_walk'],
    ['balloon', { moving: false, state: 'release' }, 'balloon_girl_presence'],
    ['pigeon', {}, 'pigeon_flight']
  ];

  for (const [identity, overrides, expected] of loopMappings) {
    dispatchFrame([snapshot({}, identity, overrides)]);
    await flushPromises();
    assert.deepEqual([...env.window.NBGAudio.getState().enemyLoopIds], [expected], identity);
    dispatchFrame([]);
    await flushPromises();
    assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 0, identity + ' stopped');
  }

  for (const alert of [
    'graffbot_spot', 'london_rat_alert', 'brown_rat_alert',
    'turquoise_rat_alert', 'balloon_girl_spot', 'pigeon_call'
  ]) {
    assert.equal(env.sources.some((node) => node.buffer?.id === alert && node.loop === false), true, alert);
  }

  const keys = Array.from({ length: 5 }, () => ({}));
  dispatchFrame([
    snapshot(keys[0], 'bot', { distance: 10 }),
    snapshot(keys[1], 'rat', { distance: 80 }),
    snapshot(keys[2], 'brownRat', { distance: 160 }),
    snapshot(keys[3], 'turquoiseRat', { distance: 240 }),
    snapshot(keys[4], 'pigeon', { distance: 320 })
  ]);
  await flushPromises();
  let state = env.window.NBGAudio.getState();
  assert.equal(state.activeEnemyLoops, 3);
  assert.equal(state.maxEnemyLoops, 3);
  assert.deepEqual([...state.enemyLoopIds], ['graffbot_walk', 'london_rat_walk', 'brown_rat_walk']);
  assert.equal(state.enemyLoopVolumes[0] > state.enemyLoopVolumes[1], true);
  assert.equal(state.enemyLoopVolumes[1] > state.enemyLoopVolumes[2], true);

  const loopStarts = env.sources.filter((node) => node.loop && node.buffer?.id !== 'music:main').length;
  for (let frame = 0; frame < 50; frame += 1) {
    dispatchFrame([
      snapshot(keys[0], 'bot', { distance: 10 }),
      snapshot(keys[1], 'rat', { distance: 80 }),
      snapshot(keys[2], 'brownRat', { distance: 160 }),
      snapshot(keys[3], 'turquoiseRat', { distance: 240 })
    ]);
  }
  await flushPromises();
  assert.equal(
    env.sources.filter((node) => node.loop && node.buffer?.id !== 'music:main').length,
    loopStarts,
    'stable enemies must reuse persistent voices'
  );
  assert.equal(env.window.NBGAudio.getState().enemyLoopSources <= 3, true);

  dispatchFrame([snapshot({}, 'rat', { visible: false })]);
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 0, 'offscreen enemies stay silent');
  dispatchFrame([snapshot({}, 'rat', { distance: 521 })]);
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 0, 'distant enemies stay silent');
  dispatchFrame([snapshot({}, 'rat', { moving: false, state: 'idle' })]);
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 0, 'stationary rats have no movement loop');
  dispatchFrame([snapshot({}, 'bot', { moving: false, state: 'combat' })]);
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 0, 'Graffbot fire suppresses movement audio');

  const lifecycleKey = {};
  dispatchFrame([snapshot(lifecycleKey, 'rat')]);
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 1);
  dispatchFrame([snapshot(lifecycleKey, 'rat', { alive: false })]);
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 0, 'death stops the loop');

  dispatchFrame([snapshot(lifecycleKey, 'rat')]);
  await flushPromises();
  env.document.dispatchEvent(new FakeCustomEvent('arcade-pause-change', { detail: { paused: true } }));
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 0, 'pause stops loops');
  env.document.dispatchEvent(new FakeCustomEvent('arcade-pause-change', { detail: { paused: false } }));
  dispatchFrame([snapshot(lifecycleKey, 'rat')]);
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 1, 'resume permits loops');

  env.document.hidden = true;
  env.document.dispatchEvent(new FakeCustomEvent('visibilitychange'));
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 0, 'hidden tab stops loops');
  env.document.hidden = false;
  env.document.dispatchEvent(new FakeCustomEvent('visibilitychange'));
  await flushPromises();
  dispatchFrame([snapshot(lifecycleKey, 'rat')]);
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 1);

  env.window.NBGAudio.setMuted(true);
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 0, 'mute stops loops');
  env.window.NBGAudio.setMuted(false);
  await flushPromises();
  dispatchFrame([snapshot(lifecycleKey, 'rat')]);
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 1);

  env.window.dispatchEvent(new FakeCustomEvent('nbg-level-reset'));
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 0, 'reset stops loops');
  dispatchFrame([snapshot(lifecycleKey, 'rat')]);
  await flushPromises();
  env.window.dispatchEvent(new FakeCustomEvent('pagehide'));
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 0, 'page exit stops loops');
});


test('reset cancels effects still waiting for asset preload and decode', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const source = await readFile(managerPath, 'utf8');
  const env = fakeAudioEnvironment(manifest, { delayAssets: true });
  const context = vm.createContext({
    window: env.window,
    document: env.document,
    fetch: env.fetch,
    CustomEvent: FakeCustomEvent,
    URL,
    Map,
    Object,
    Number,
    Promise,
    Date,
    Array,
    Math,
    console
  });

  vm.runInContext(source, context, { filename: 'game/nbg-audio.js' });
  await flushPromises();
  env.document.dispatchEvent(new FakeCustomEvent('pointerdown'));
  await flushPromises();
  env.window.dispatchEvent(new FakeCustomEvent('nbg-level-started'));
  env.window.dispatchEvent(new FakeCustomEvent('nbg-audio-cue', {
    detail: { id: 'jump_1' }
  }));
  env.window.dispatchEvent(new FakeCustomEvent('nbg-enemy-audio-frame', {
    detail: {
      listener: { x: 0, y: 0 },
      enemies: [{
        key: 'pending-rat', identity: 'rat', distance: 20, moving: true,
        state: 'moving', alive: true, visible: true
      }]
    }
  }));
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 1);
  env.window.dispatchEvent(new FakeCustomEvent('nbg-level-reset'));
  assert.equal(env.window.NBGAudio.getState().activeVoices, 0);
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 0);

  env.releaseAssets();
  await flushPromises(16);
  assert.equal(env.sources.length, 0, 'abandoned run effects must not start after reset');
  assert.equal(env.window.NBGAudio.getState().activeVoices, 0);
  assert.equal(env.window.NBGAudio.getState().musicPlaying, false);
});

test('runtime hooks are presentation-only and record sounds follow NBG server authority', async () => {
  const [runtime, manager, records, html, workerReplay] = await Promise.all([
    readFile(path.join(root, 'game', 'nbg-level1.js'), 'utf8'),
    readFile(managerPath, 'utf8'),
    readFile(path.join(root, 'game', 'nbg-london-leaderboards.js'), 'utf8'),
    readFile(path.join(root, 'games', 'nbg-london', 'index.html'), 'utf8'),
    readFile(path.join(root, 'workers', 'leaderboard', 'nbg-london-replay.js'), 'utf8')
  ]);

  for (const cue of [
    'jump_1', 'jump_2', 'jump_3_backflip', 'land_soft', 'land_heavy',
    'spray_attack', 'rat_attack', 'rat_pounce', 'parachute_rat_drop',
    'parachute_rat_land', 'graffbot_fire', 'balloon_release',
    'pigeon_pass', 'speed_boost_end'
  ]) {
    assert.equal(runtime.includes("'" + cue + "'"), true, cue);
  }
  assert.match(runtime, /Presentation-only cue bus/);
  assert.match(runtime, /nbg-enemy-audio-frame/);
  assert.match(runtime, /var identity = airborne \? enemy\.variant : enemy\.type/);
  assert.match(runtime, /rat\.variant === 'parachuteRatC' \? 'turquoiseRat' : 'brownRat'/);
  assert.doesNotMatch(manager, /NBGLevel1State|runReplayFrames|nextRunRandom/);
  assert.doesNotMatch(workerReplay, /NBGAudio|nbg-audio-cue|nbg-enemy-audio-frame|AudioContext/);
  assert.match(records, /authoritativeRejection/);
  assert.match(records, /accepted: true, authoritative: true/);
  assert.ok(html.indexOf('/game/nbg-audio.js') < html.indexOf('/game/nbg-level1.js'));
});
