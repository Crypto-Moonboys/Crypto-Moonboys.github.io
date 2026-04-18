import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';

const MUSIC_SPECS = {
  world: [
    { id: 'btqm-world-pad', spec: { kind: 'tone', type: 'triangle', freqStart: 96, freqEnd: 96, duration: null, loop: true, volume: 0.0065 } },
    { id: 'btqm-world-air', spec: { kind: 'tone', type: 'sine', freqStart: 192, freqEnd: 194, duration: null, loop: true, volume: 0.0045 } },
  ],
  dungeon: [
    { id: 'btqm-dungeon-bass', spec: { kind: 'tone', type: 'sawtooth', freqStart: 84, freqEnd: 84, duration: null, loop: true, volume: 0.007 } },
    { id: 'btqm-dungeon-hum', spec: { kind: 'tone', type: 'triangle', freqStart: 132, freqEnd: 130, duration: null, loop: true, volume: 0.004 } },
  ],
  battle: [
    { id: 'btqm-battle-drive', spec: { kind: 'tone', type: 'square', freqStart: 126, freqEnd: 126, duration: null, loop: true, volume: 0.007 } },
    { id: 'btqm-battle-lead', spec: { kind: 'tone', type: 'triangle', freqStart: 252, freqEnd: 258, duration: null, loop: true, volume: 0.0048 } },
  ],
  boss: [
    { id: 'btqm-boss-low', spec: { kind: 'tone', type: 'sawtooth', freqStart: 74, freqEnd: 74, duration: null, loop: true, volume: 0.008 } },
    { id: 'btqm-boss-grit', spec: { kind: 'tone', type: 'square', freqStart: 148, freqEnd: 145, duration: null, loop: true, volume: 0.0045 } },
  ],
};

const SFX = {
  move: { kind: 'tone', type: 'square', freqStart: 420, freqEnd: 360, duration: 0.05, volume: 0.016 },
  hit: { kind: 'tone', type: 'sawtooth', freqStart: 220, freqEnd: 130, duration: 0.12, volume: 0.03 },
  crit: { kind: 'tone', type: 'triangle', freqStart: 860, freqEnd: 420, duration: 0.14, volume: 0.04 },
  potion: { kind: 'tone', type: 'sine', freqStart: 360, freqEnd: 640, duration: 0.14, volume: 0.025 },
  death: { kind: 'tone', type: 'sawtooth', freqStart: 140, freqEnd: 52, duration: 0.22, volume: 0.04 },
  victory: { kind: 'tone', type: 'triangle', freqStart: 280, freqEnd: 760, duration: 0.2, volume: 0.04 },
  bossEntry: { kind: 'tone', type: 'sawtooth', freqStart: 88, freqEnd: 58, duration: 0.2, volume: 0.05 },
};

function stopHandles(handles) {
  while (handles.length) {
    const handle = handles.pop();
    try {
      if (handle && typeof handle.stop === 'function') handle.stop();
    } catch (_) {}
  }
}

export function createBtqmAudio() {
  const musicHandles = [];
  let currentLayer = null;
  let destroyed = false;

  function setMusicLayer(layer) {
    if (destroyed) return;
    if (layer === currentLayer) return;
    currentLayer = layer;
    stopHandles(musicHandles);
    if (!layer || isMuted()) return;
    const specs = MUSIC_SPECS[layer] || [];
    specs.forEach(({ id, spec }) => {
      const handle = playSound(id, spec);
      if (handle) musicHandles.push(handle);
    });
  }

  function playSfx(name, overrides) {
    if (destroyed || isMuted()) return null;
    const spec = SFX[name];
    if (!spec) return null;
    return playSound('btqm-' + name, { ...spec, ...(overrides || {}) });
  }

  function stopAll() {
    stopHandles(musicHandles);
    stopAllSounds();
  }

  function destroy() {
    destroyed = true;
    stopAll();
    currentLayer = null;
  }

  return { setMusicLayer, playSfx, stopAll, destroy };
}
