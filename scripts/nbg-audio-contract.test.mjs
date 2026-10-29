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

function fakeAudioEnvironment(manifest) {
  const document = Object.assign(createEventTarget(), { hidden: false });
  const window = Object.assign(createEventTarget(), {
    location: { href: 'https://example.test/games/nbg-london/' }
  });
  const stored = new Map();
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
      return {
        gain: { value: 1, setValueAtTime(value) { this.value = value; } },
        connect() {},
        disconnect() {}
      };
    }
    createBufferSource() {
      const source = {
        loop: false,
        buffer: null,
        onended: null,
        connect() {},
        disconnect() {},
        start() { sources.push(source); },
        stop() { if (source.onended) source.onended(); }
      };
      return source;
    }
    decodeAudioData() { return Promise.resolve({ duration: 1 }); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
  }
  window.AudioContext = FakeAudioContext;

  async function fetch(input) {
    const url = String(input);
    if (url.endsWith('/manifest.json')) {
      return { ok: true, status: 200, json: async () => manifest };
    }
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) };
  }

  return { document, window, stored, sources, contexts, fetch };
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
  assert.equal(manifest.music.main, 'music/main_theme_dark_industrial_loop.ogg');

  const referenced = [...Object.values(manifest.effects), manifest.music.main];
  assert.equal(new Set(referenced).size, 43);
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
  for (const directory of ['sfx', 'music']) {
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
  assert.equal(env.window.NBGAudio.getState().encodedAssets, 43);
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
  assert.doesNotMatch(manager, /NBGLevel1State|runReplayFrames|nextRunRandom/);
  assert.doesNotMatch(workerReplay, /NBGAudio|nbg-audio-cue|AudioContext/);
  assert.match(records, /authoritativeRejection/);
  assert.match(records, /accepted: true, authoritative: true/);
  assert.ok(html.indexOf('/game/nbg-audio.js') < html.indexOf('/game/nbg-level1.js'));
});
