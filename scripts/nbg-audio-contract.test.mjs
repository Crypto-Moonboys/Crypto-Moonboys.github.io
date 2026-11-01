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
  'rat_attack', 'rat_pounce', 'brown_rat_punch', 'turquoise_rat_kick', 'turquoise_rat_punch', 'parachute_rat_drop', 'parachute_rat_land',
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
const expectedAssetCount = expectedEffects.length + expectedEnemyIdentities.length;

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
  const requests = [];
  const remainingFailures = new Map(Object.entries(options.assetFailures || {}));
  const assetIds = new Map([
    ...Object.entries(manifest.effects || {}).map(([id, file]) => [file, id]),
    ...Object.entries(manifest.enemyIdentities || {}).map(([id, file]) => [file, id]),
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
  const musicElements = [];
  let gestureActive = false;
  class FakeMusicAudio {
    constructor() {
      this.paused = true;
      this.volume = 1;
      this.src = '';
      this.loop = false;
      this.onended = null;
      this.onerror = null;
      this.playCount = 0;
      this.firstPlayInGesture = false;
      musicElements.push(this);
    }
    play() {
      if (this.playCount === 0) this.firstPlayInGesture = gestureActive;
      this.paused = false; this.playCount++; return Promise.resolve();
    }
    pause() { this.paused = true; }
    load() {}
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    finish() { this.paused = true; if (this.onended) this.onended(); }
  }
  window.Audio = FakeMusicAudio;
  class FakeAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = {};
      this.gains = [];
      this.mediaNodes = [];
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
      const node = { gain, connect() {}, disconnect() {} };
      this.gains.push(node);
      return node;
    }
    createMediaElementSource(element) {
      if (this.mediaNodes.some(node => node.element === element)) throw new Error('media source reused');
      const node = { element, destination: null, connect(target) { this.destination = target; } };
      this.mediaNodes.push(node);
      return node;
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

  async function fetch(input, init = {}) {
    const url = String(input);
    requests.push({ url, cache: init.cache || 'default' });
    if (url.includes('/manifest.json')) {
      return { ok: true, status: 200, json: async () => manifest };
    }
    const data = encodedAsset(url);
    const remaining = Number(remainingFailures.get(data.id) || 0);
    if (remaining > 0) {
      remainingFailures.set(data.id, remaining - 1);
      return { ok: false, status: 503, arrayBuffer: async () => data };
    }
    return {
      ok: true,
      status: 200,
      arrayBuffer: (options.delayAssets || options.stallAssetId === data.id) ?
        () => new Promise((resolve) => pendingAssetFetches.push({ resolve, data })) :
        async () => data
    };
  }

  function releaseAssets() {
    for (const pending of pendingAssetFetches.splice(0)) pending.resolve(pending.data);
  }

  return {
    document: Object.assign(document, {
      dispatchGesture(type) {
        gestureActive = true;
        try { document.dispatchEvent(new FakeCustomEvent(type)); } finally { gestureActive = false; }
      }
    }),
    window, stored, sources, contexts, musicElements, requests, fetch, releaseAssets
  };
}

async function flushPromises(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('live audio payload contains exactly the approved compressed pack', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(Object.keys(manifest.effects).sort(), expectedEffects);
  assert.equal(Object.keys(manifest.effects).length, expectedEffects.length);
  assert.deepEqual(Object.keys(manifest.enemyIdentities).sort(), expectedEnemyIdentities);
  assert.equal(Object.keys(manifest.enemyIdentities).length, expectedEnemyIdentities.length);
  assert.deepEqual(manifest.music.tracks, [
    'music/Rolling In Dark (6).mp3',
    'music/Rolling In Dark (1).mp3'
  ]);

  const referenced = [
    ...Object.values(manifest.effects),
    ...Object.values(manifest.enemyIdentities)
  ];
  assert.equal(new Set(referenced).size, expectedAssetCount);
  for (const track of manifest.music.tracks) {
    assert.ok(track.endsWith('.mp3'));
    const absolute = path.resolve(audioRoot, track);
    assert.ok(absolute.startsWith(audioRoot + path.sep));
    const bytes = await readFile(absolute);
    assert.ok(bytes.length > 1000000, 'song must contain a substantial MP3 payload');
    assert.ok(bytes.subarray(0, 3).toString('ascii') === 'ID3' ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0), 'MP3 header');
  }
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
  assert.equal(env.window.NBGAudio.getState().encodedAssets, expectedAssetCount);
  assert.equal(env.window.NBGAudio.getState().maxVoices, 12);

  env.document.dispatchGesture('pointerdown');
  assert.equal(env.musicElements.length, 1, 'music player is constructed synchronously in pointer gesture');
  assert.equal(env.musicElements[0].firstPlayInGesture, true, 'iOS first play runs in user gesture');
  assert.equal(env.contexts[0].mediaNodes.length, 1, 'one media source node is connected');
  assert.equal(env.contexts[0].mediaNodes[0].destination, env.contexts[0].gains[1], 'music routes into Web Audio music gain');
  assert.equal(env.contexts[0].gains[1].gain.value, 0, 'pre-game music must be silent');
  await flushPromises();
  assert.equal(env.contexts.length, 1);
  assert.equal(env.contexts[0].state, 'running');

  env.window.dispatchEvent(new FakeCustomEvent('nbg-level-started'));
  await flushPromises();
  assert.equal(env.window.NBGAudio.getState().musicWanted, true);
  assert.equal(env.window.NBGAudio.getState().musicPlaying, true);
  assert.equal(env.musicElements.length, 1);
  assert.match(env.musicElements[0].src, /Rolling%20In%20Dark%20\(6\)\.mp3$/);
  assert.equal(env.musicElements[0].loop, false);
  assert.equal(env.requests.some(({ url }) => url.endsWith('.mp3')), false, 'songs are not preloaded into SFX cache');

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
  assert.equal(env.musicElements[0].volume, 1, 'HTML element volume is kept at unity for iOS');
  assert.equal(env.contexts[0].gains[1].gain.value, 0.25, 'music volume is applied through Web Audio');
  env.window.NBGAudio.setLevels({ music: 0, sfx: 0.6 });
  assert.equal(env.contexts[0].gains[1].gain.value, 0, 'music slider 0 must mute music independently of effects');
  assert.equal(env.contexts[0].gains[2].gain.value, 0.6, 'music slider 0 must not alter effects');
  env.window.NBGAudio.setLevels({ music: 0.25, sfx: 0.6 });
  env.window.NBGAudio.setMuted(true);
  assert.equal(env.musicElements[0].paused, true, 'mute pauses current song');
  assert.equal(env.contexts[0].gains[1].gain.value, 0, 'mute also silences gain');
  assert.equal(JSON.parse(env.stored.get('nbg-audio-settings-v1')).muted, true);
  assert.equal(env.window.NBGAudio.getState().activeVoices, 0);
  env.window.NBGAudio.setMuted(false);
  await flushPromises();
  assert.equal(env.musicElements[0].paused, false, 'unmute resumes');
  env.musicElements[0].finish();
  assert.match(env.musicElements[0].src, /Rolling%20In%20Dark%20\(1\)\.mp3$/, 'second song follows first');
  env.musicElements[0].finish();
  assert.match(env.musicElements[0].src, /Rolling%20In%20Dark%20\(6\)\.mp3$/, 'playlist cycles');
  assert.equal(env.musicElements.length, 1, 'single music element plays sequentially');
  env.document.hidden = true;
  env.document.dispatchEvent(new FakeCustomEvent('visibilitychange'));
  await flushPromises();
  assert.equal(env.contexts[0].state, 'suspended');
  assert.equal(env.musicElements[0].paused, true, 'hidden page pauses music');
  env.document.hidden = false;
  env.document.dispatchEvent(new FakeCustomEvent('visibilitychange'));
  await flushPromises();
  assert.equal(env.contexts[0].state, 'running');
  assert.equal(env.musicElements[0].paused, false, 'visible page resumes music');
  env.window.dispatchEvent(new FakeCustomEvent('nbg-level-complete'));
  assert.equal(env.window.NBGAudio.getState().musicPlaying, false);
  assert.equal(env.musicElements[0].paused, true);
  env.window.dispatchEvent(new FakeCustomEvent('nbg-level-started'));
  await flushPromises();
  assert.equal(env.musicElements.length, 1, 'replays reuse the gesture-unlocked music element');
  assert.equal(env.contexts[0].mediaNodes.length, 1, 'only one iOS MediaElementAudioSourceNode is ever created');
  assert.match(env.musicElements[0].src, /Rolling%20In%20Dark%20\(6\)\.mp3$/, 'fresh run starts first song');
  env.window.dispatchEvent(new FakeCustomEvent('nbg-game-over'));
  assert.equal(env.musicElements[0].paused, true, 'death stops music');
  assert.equal(env.contexts[0].gains[1].gain.value, 0, 'terminal state silences gain');
});


test('NBG music and effects mute independently with balanced default levels', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const source = await readFile(managerPath, 'utf8');
  const env = fakeAudioEnvironment(manifest);
  const elements = new Map();
  const bar = {
    insertBefore(button, master) {
      assert.equal(master.id, 'overlay-btn-mute');
      elements.set(button.id, button);
    }
  };
  const master = { id: 'overlay-btn-mute' };
  elements.set('overlay-ctrl-bar', bar);
  elements.set('overlay-btn-mute', master);
  env.document.getElementById = id => elements.get(id) || null;
  env.document.createElement = tag => {
    assert.equal(tag, 'button');
    const button = {
      attrs: {},
      addEventListener(name, fn) { this[name] = fn; },
      setAttribute(name, value) { this.attrs[name] = value; },
      querySelector() { return { set textContent(value) {} }; }
    };
    return button;
  };
  const context = vm.createContext({
    window: env.window, document: env.document, fetch: env.fetch,
    CustomEvent: FakeCustomEvent, URL, Map, Set, Object,
    Number, Promise, Date, Array, Math, console
  });
  vm.runInContext(source, context, { filename: 'game/nbg-audio.js' });
  await flushPromises();
  const api = env.window.NBGAudio;
  assert.equal(api.getState().musicLevel, 0.70);
  assert.equal(api.getState().sfxLevel, 0.45);
  assert.equal(elements.size, 4, 'Two NBG-only mute buttons are installed in toolbar');
  assert.equal(elements.get('nbg-music-mute').attrs['aria-pressed'], 'false');
  assert.equal(elements.get('nbg-sfx-mute').attrs['aria-pressed'], 'false');

  env.document.dispatchGesture('pointerdown');
  await flushPromises();
  env.window.dispatchEvent(new FakeCustomEvent('nbg-level-started'));
  await flushPromises();
  const graph = env.contexts[0];
  assert.equal(graph.gains[1].gain.value, 0.70, 'music gain is independent');
  assert.equal(graph.gains[2].gain.value, 0.45, 'effects gain is independent');
  assert.equal(env.musicElements[0].paused, false);
  const musicSrc = env.musicElements[0].src;

  elements.get('nbg-music-mute').click();
  assert.equal(api.getState().musicMuted, true);
  assert.equal(api.getState().sfxMuted, false);
  assert.equal(graph.gains[1].gain.value, 0);
  assert.equal(graph.gains[2].gain.value, 0.45);
  assert.equal(env.musicElements[0].paused, true);
  assert.equal(elements.get('nbg-music-mute').attrs['aria-pressed'], 'true');
  const effectBefore = env.sources.length;
  api.playEffect('ui_confirm');
  await flushPromises();
  assert.equal(env.sources.length, effectBefore + 1, 'effects stay enabled when music is muted');
  elements.get('nbg-music-mute').click();
  await flushPromises();
  assert.equal(env.musicElements[0].src, musicSrc, 'unmute resumes the same track');
  assert.equal(env.musicElements[0].paused, false);
  assert.equal(graph.gains[1].gain.value, 0.70);

  elements.get('nbg-sfx-mute').click();
  assert.equal(api.getState().musicMuted, false);
  assert.equal(api.getState().sfxMuted, true);
  assert.equal(graph.gains[2].gain.value, 0);
  assert.equal(graph.gains[1].gain.value, 0.70);
  assert.equal(env.musicElements[0].paused, false, 'music continues while effects are muted');
  assert.equal(api.getState().activeVoices, 0, 'active effects are stopped');
  const afterEffectsMute = env.sources.length;
  api.playEffect('ui_confirm');
  await flushPromises();
  assert.equal(env.sources.length, afterEffectsMute, 'muted effects cannot start new voices');
  assert.equal(elements.get('nbg-sfx-mute').attrs['aria-pressed'], 'true');

  api.setMuted(true);
  assert.equal(graph.gains[0].gain.value, 0, 'master mute still overrides both channels');
  api.setMuted(false);
  assert.equal(graph.gains[2].gain.value, 0, 'master unmute does not change effects-only mute');
  elements.get('nbg-sfx-mute').click();
  assert.equal(graph.gains[2].gain.value, 0.45);
  const saved = JSON.parse(env.stored.get('nbg-audio-settings-v1'));
  assert.equal(saved.musicMuted, false);
  assert.equal(saved.sfxMuted, false);

  env.window.dispatchEvent(new FakeCustomEvent('nbg-level-complete'));
  assert.equal(api.getState().musicPlaying, false);
  assert.equal(graph.gains[1].gain.value, 0);
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

  const loopStarts = env.sources.filter((node) => node.loop).length;
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
    env.sources.filter((node) => node.loop).length,
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


test('enemy identity preload refreshes only the manifest and keeps audio cacheable', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const source = await readFile(managerPath, 'utf8');
  assert.match(source, /manifest\.json\?v=/);
  const env = fakeAudioEnvironment(manifest);
  const context = vm.createContext({ window: env.window, document: env.document,
    fetch: env.fetch, CustomEvent: FakeCustomEvent, URL, Map, Set, Object,
    Number, Promise, Date, Array, Math, console });
  vm.runInContext(source, context, { filename: 'game/nbg-audio.js' });
  await flushPromises(12);

  const manifestRequests = env.requests.filter(({ url }) => url.includes('/manifest.json'));
  const assetRequests = env.requests.filter(({ url }) => !url.includes('/manifest.json'));
  assert.equal(manifestRequests.length, 1);
  assert.equal(manifestRequests[0].url.includes('?v=two-song-music-v1'), true);
  assert.equal(manifestRequests[0].cache, 'no-store');
  assert.equal(assetRequests.length, expectedAssetCount);
  assert.equal(assetRequests.every(({ cache }) => cache === 'force-cache'), true);
  assert.equal(env.window.NBGAudio.getState().encodedAssets, expectedAssetCount);
  assert.equal(env.window.NBGAudio.getState().enemyAssetsLoaded, expectedEnemyIdentities.length);
  assert.deepEqual([...env.window.NBGAudio.getState().failedAssets], []);

  env.document.dispatchEvent(new FakeCustomEvent('pointerdown'));
  await flushPromises();
  env.window.dispatchEvent(new FakeCustomEvent('nbg-enemy-audio-frame', {
    detail: { listener: { x: 100, y: 100 }, enemies: [
      { key: 'near-bot', identity: 'bot', x: 115, y: 100, moving: true,
        state: 'moving', alive: true, visible: true }
    ] }
  }));
  await flushPromises(12);
  assert.deepEqual([...env.window.NBGAudio.getState().enemyLoopIds], ['graffbot_walk']);
  assert.equal(env.window.NBGAudio.getState().enemyLoopSources, 1);
  assert.equal(
    env.sources.some((node) => node.loop === true && node.buffer?.id === 'graffbot_walk'),
    true
  );
});

test('enemy loop retries a transient per-file failure without redownloading the pack', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const source = await readFile(managerPath, 'utf8');
  const env = fakeAudioEnvironment(manifest, { assetFailures: { graffbot_walk: 2 } });
  let nowMs = 1000;
  class TestDate extends Date {
    static now() { return nowMs; }
  }
  const quietConsole = { warn() {}, log() {}, error() {} };
  const context = vm.createContext({ window: env.window, document: env.document,
    fetch: env.fetch, CustomEvent: FakeCustomEvent, URL, Map, Set, Object,
    Number, Promise, Date: TestDate, Array, Math, console: quietConsole });
  vm.runInContext(source, context, { filename: 'game/nbg-audio.js' });
  await flushPromises(12);

  let state = env.window.NBGAudio.getState();
  assert.equal(state.encodedAssets, expectedAssetCount - 1);
  assert.equal(state.enemyAssetsLoaded, 16);
  assert.equal(state.failedAssets.some(([id]) => id === 'graffbot_walk'), true);

  env.document.dispatchEvent(new FakeCustomEvent('pointerdown'));
  await flushPromises();
  const frame = new FakeCustomEvent('nbg-enemy-audio-frame', {
    detail: { listener: { x: 100, y: 100 }, enemies: [
      { key: 'retry-bot', identity: 'bot', x: 115, y: 100, moving: true,
        state: 'moving', alive: true, visible: true }
    ] }
  });
  env.window.dispatchEvent(frame);
  await flushPromises(12);
  assert.equal(env.window.NBGAudio.getState().activeEnemyLoops, 0);
  assert.deepEqual(
    env.requests.filter(({ url }) => url.endsWith('/enemy/graffbot_walk.ogg'))
      .map(({ cache }) => cache),
    ['force-cache', 'reload']
  );

  nowMs += 4000;
  env.window.dispatchEvent(frame);
  await flushPromises(12);
  state = env.window.NBGAudio.getState();
  assert.equal(state.encodedAssets, expectedAssetCount);
  assert.equal(state.enemyAssetsLoaded, expectedEnemyIdentities.length);
  assert.equal(state.failedAssets.some(([id]) => id === 'graffbot_walk'), false);
  assert.deepEqual([...state.enemyLoopIds], ['graffbot_walk']);
  assert.equal(state.enemyLoopSources, 1);
  assert.deepEqual(
    env.requests.filter(({ url }) => url.endsWith('/enemy/graffbot_walk.ogg'))
      .map(({ cache }) => cache),
    ['force-cache', 'reload', 'reload']
  );
});

test('Graffbot movement begins while unrelated audio downloads remain stalled', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const source = await readFile(managerPath, 'utf8');
  const env = fakeAudioEnvironment(manifest, { stallAssetId: 'coin_xl' });
  const context = vm.createContext({ window: env.window, document: env.document,
    fetch: env.fetch, CustomEvent: FakeCustomEvent, URL, Map, Set, Object,
    Number, Promise, Date, Array, Math, console });
  vm.runInContext(source, context, { filename: 'game/nbg-audio.js' });
  await flushPromises(10);
  assert.equal(env.window.NBGAudio.getState().encodedAssets, expectedAssetCount - 1,
    'unrelated coin file remains stalled');
  env.document.dispatchEvent(new FakeCustomEvent('pointerdown'));
  await flushPromises();
  env.window.dispatchEvent(new FakeCustomEvent('nbg-enemy-audio-frame', {
    detail: { listener: { x: 100, y: 100 }, enemies: [
      { key: 'graffbot', identity: 'bot', x: 120, y: 100,
        moving: true, state: 'moving', alive: true, visible: true }
    ] }
  }));
  await flushPromises(12);
  assert.equal(env.window.NBGAudio.getState().enemyLoopSources, 1);
  assert.equal(env.sources.some(node => node.loop && node.buffer?.id === 'graffbot_walk'), true);
  env.releaseAssets();
  await flushPromises();
});

test('each rat attack animation has a unique audio cue, without changing combat timing', async () => {
  const runtime = await readFile(path.join(root, 'game', 'nbg-level1.js'), 'utf8');
  const manager = await readFile(managerPath, 'utf8');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const mappings = {
    ratBladeFlurry: 'rat_attack',
    ratViperPounce: 'rat_pounce',
    brownRatPunch: 'brown_rat_punch',
    turquoiseRatKick: 'turquoise_rat_kick',
    turquoiseRatPunch: 'turquoise_rat_punch'
  };
  for (const [animation, cue] of Object.entries(mappings)) {
    assert.match(runtime, new RegExp(animation + ": '" + cue + "'"));
    assert.ok(manifest.effects[cue], cue + ' in manifest');
  }
  assert.equal(new Set(Object.values(mappings)).size, 5);
  const priorities = { brown_rat_punch: 70, turquoise_rat_kick: 72, turquoise_rat_punch: 70 };
  for (const cue of ['brown_rat_punch', 'turquoise_rat_kick', 'turquoise_rat_punch']) {
    assert.match(manager, new RegExp(cue + ': ' + priorities[cue] + '(?:,|\\n)'));
    const payload = await readFile(path.join(audioRoot, manifest.effects[cue]));
    assert.equal(manifest.effects[cue].endsWith('.ogg'), true, cue + ' compressed path');
    assert.equal(payload.subarray(0, 4).toString('ascii'), 'OggS', cue + ' OGG header');
    assert.ok(payload.length > 1000, cue + ' should contain audio');
  }
});
