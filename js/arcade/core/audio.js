const SOUND_LIBRARY = {
  'invaders-shoot':     { kind: 'tone',  type: 'square',   freqStart: 620, freqEnd: 341, duration: 0.05, volume: 0.03 },
  'invaders-hit':       { kind: 'tone',  type: 'triangle', freqStart: 180, freqEnd: 99,  duration: 0.07, volume: 0.04 },
  'invaders-explosion': { kind: 'tone',  type: 'sawtooth', freqStart: 90,  freqEnd: 60,  duration: 0.18, volume: 0.05 },
  'invaders-powerup':   { kind: 'tone',  type: 'triangle', freqStart: 660, freqEnd: 1320, duration: 0.14, volume: 0.045 },
  'invaders-player-damage': { kind: 'chord', tones: [
    { type: 'sawtooth', freqStart: 220, freqEnd: 110, duration: 0.18, volume: 0.05, delay: 0.00 },
    { type: 'square',   freqStart: 180, freqEnd: 90,  duration: 0.14, volume: 0.04, delay: 0.03 },
  ]},
  'invaders-boss-warning': { kind: 'chord', tones: [
    { type: 'sawtooth', freqStart: 160, freqEnd: 80,  duration: 0.22, volume: 0.06, delay: 0.00 },
    { type: 'square',   freqStart: 240, freqEnd: 120, duration: 0.18, volume: 0.04, delay: 0.06 },
  ]},
  'invaders-game-over': { kind: 'chord', tones: [
    { type: 'sawtooth', freqStart: 360, freqEnd: 160, duration: 0.28, volume: 0.05, delay: 0.00 },
    { type: 'sawtooth', freqStart: 280, freqEnd: 120, duration: 0.26, volume: 0.04, delay: 0.08 },
    { type: 'triangle', freqStart: 220, freqEnd: 80,  duration: 0.24, volume: 0.04, delay: 0.18 },
  ]},
  'hexgl-start':        { kind: 'tone',  type: 'triangle', freqStart: 440, freqEnd: 660, duration: 0.09, volume: 0.05 },
  'hexgl-reset':        { kind: 'tone',  type: 'sawtooth', freqStart: 300, freqEnd: 170, duration: 0.12, volume: 0.04 },
  'hexgl-submit':       { kind: 'tone',  type: 'sine',     freqStart: 620, freqEnd: 880, duration: 0.12, volume: 0.06 },
  'hexgl-error':        { kind: 'tone',  type: 'sawtooth', freqStart: 320, freqEnd: 180, duration: 0.14, volume: 0.04 },
  'hexgl-exit':         { kind: 'tone',  type: 'triangle', freqStart: 520, freqEnd: 300, duration: 0.10, volume: 0.04 },
  'hexgl-countdown-1':  { kind: 'tone',  type: 'square',   freqStart: 380, freqEnd: 380, duration: 0.08, volume: 0.032 },
  'hexgl-countdown-2':  { kind: 'tone',  type: 'square',   freqStart: 480, freqEnd: 480, duration: 0.08, volume: 0.032 },
  'hexgl-countdown-3':  { kind: 'tone',  type: 'square',   freqStart: 600, freqEnd: 600, duration: 0.08, volume: 0.032 },
  'hexgl-go': {
    kind: 'chord',
    tones: [
      { type: 'sine', freqStart: 880,  freqEnd: 880,  duration: 0.22, volume: 0.05, delay: 0.000 },
      { type: 'sine', freqStart: 1108, freqEnd: 1108, duration: 0.22, volume: 0.05, delay: 0.022 },
      { type: 'sine', freqStart: 1320, freqEnd: 1320, duration: 0.22, volume: 0.05, delay: 0.044 },
    ],
  },
  'hexgl-ambient':      { kind: 'tone',  type: 'sine',     freqStart: 82,  freqEnd: 82,  duration: null, volume: 0.006, loop: true },
  'pac-chain-pellet':      { kind: 'tone', type: 'square',   freqStart: 700, freqEnd: 560, duration: 0.035, volume: 0.025 },
  'pac-chain-power':       { kind: 'tone', type: 'sawtooth', freqStart: 320, freqEnd: 880, duration: 0.12,  volume: 0.05  },
  'pac-chain-ghost-eaten': { kind: 'tone', type: 'triangle', freqStart: 960, freqEnd: 520, duration: 0.10,  volume: 0.04  },
  'pac-chain-hit':         { kind: 'tone', type: 'sawtooth', freqStart: 180, freqEnd: 70,  duration: 0.16,  volume: 0.05  },
  'pac-chain-level-complete': { kind: 'chord', tones: [
    { type: 'sine', freqStart: 523, freqEnd: 523, duration: 0.16, volume: 0.05,  delay: 0.00 },
    { type: 'sine', freqStart: 659, freqEnd: 659, duration: 0.16, volume: 0.045, delay: 0.14 },
    { type: 'sine', freqStart: 784, freqEnd: 784, duration: 0.16, volume: 0.05,  delay: 0.28 },
    { type: 'sine', freqStart: 1047, freqEnd: 1047, duration: 0.28, volume: 0.055, delay: 0.42 },
  ]},
  'pac-chain-death': { kind: 'chord', tones: [
    { type: 'sawtooth', freqStart: 440, freqEnd: 110, duration: 0.32, volume: 0.05, delay: 0.00 },
    { type: 'sawtooth', freqStart: 330, freqEnd: 82,  duration: 0.30, volume: 0.04, delay: 0.06 },
    { type: 'triangle', freqStart: 220, freqEnd: 55,  duration: 0.28, volume: 0.035, delay: 0.14 },
  ]},
  'snake-start':        { kind: 'tone',  type: 'triangle', freqStart: 420, freqEnd: 840, duration: 0.10, volume: 0.045 },
  'snake-turn':         { kind: 'tone',  type: 'square',   freqStart: 580, freqEnd: 520, duration: 0.03, volume: 0.024 },
  'snake-eat':          { kind: 'tone',  type: 'triangle', freqStart: 820, freqEnd: 1160, duration: 0.06, volume: 0.036 },
  'snake-combo':        { kind: 'chord', tones: [
    { type: 'sine', freqStart: 760,  freqEnd: 760,  duration: 0.11, volume: 0.042, delay: 0 },
    { type: 'sine', freqStart: 980,  freqEnd: 980,  duration: 0.11, volume: 0.036, delay: 0.02 },
    { type: 'sine', freqStart: 1240, freqEnd: 1240, duration: 0.11, volume: 0.03,  delay: 0.04 },
  ]},
  'snake-boost':        { kind: 'tone',  type: 'sawtooth', freqStart: 290, freqEnd: 930, duration: 0.11, volume: 0.042 },
  'snake-multiplier':   { kind: 'tone',  type: 'triangle', freqStart: 520, freqEnd: 1220, duration: 0.12, volume: 0.044 },
  'snake-ghost':        { kind: 'tone',  type: 'sine',     freqStart: 460, freqEnd: 290, duration: 0.18, volume: 0.034 },
  'snake-chaos':        { kind: 'tone',  type: 'sawtooth', freqStart: 840, freqEnd: 120, duration: 0.18, volume: 0.048 },
  'snake-game-over':    { kind: 'chord', tones: [
    { type: 'sawtooth', freqStart: 300, freqEnd: 160, duration: 0.24, volume: 0.042, delay: 0 },
    { type: 'triangle', freqStart: 240, freqEnd: 120, duration: 0.22, volume: 0.035, delay: 0.03 },
  ]},
  'meta-quest-complete': { kind: 'chord', tones: [
    { type: 'sine',     freqStart: 660,  freqEnd: 660,  duration: 0.16, volume: 0.05,  delay: 0.00 },
    { type: 'triangle', freqStart: 880,  freqEnd: 880,  duration: 0.16, volume: 0.045, delay: 0.03 },
    { type: 'sine',     freqStart: 1180, freqEnd: 1180, duration: 0.18, volume: 0.04,  delay: 0.06 },
  ]},
  'meta-streak-up':      { kind: 'tone',  type: 'triangle', freqStart: 520, freqEnd: 1040, duration: 0.11, volume: 0.046 },
  'meta-event-trigger':  { kind: 'chord', tones: [
    { type: 'sawtooth', freqStart: 420, freqEnd: 620, duration: 0.13, volume: 0.04, delay: 0.00 },
    { type: 'square',   freqStart: 720, freqEnd: 980, duration: 0.11, volume: 0.03, delay: 0.02 },
  ]},
  'meta-near-miss':      { kind: 'tone',  type: 'square',   freqStart: 360, freqEnd: 330, duration: 0.08, volume: 0.03  },
  'meta-comeback-prompt': { kind: 'chord', tones: [
    { type: 'sine',     freqStart: 560, freqEnd: 740, duration: 0.11, volume: 0.04, delay: 0.00 },
    { type: 'triangle', freqStart: 760, freqEnd: 980, duration: 0.10, volume: 0.03, delay: 0.03 },
  ]},
  'meta-chain-unlock':    { kind: 'tone',  type: 'triangle', freqStart: 680, freqEnd: 1210, duration: 0.12, volume: 0.04 },
  'meta-featured-window': { kind: 'tone',  type: 'sine',     freqStart: 420, freqEnd: 860, duration: 0.10, volume: 0.032 },
  'meta-streak-save-warning': { kind: 'tone', type: 'square', freqStart: 340, freqEnd: 280, duration: 0.09, volume: 0.032 },
};

// Keep a defensive default here so module-driven game pages remain safe even if
// game-fullscreen.js has not been evaluated yet.
if (typeof window !== 'undefined' && typeof window._arcadeMuted === 'undefined') {
  window._arcadeMuted = false;
}

let audioCtx = null;
const activeSounds = new Set();

function getAudioContext() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    audioCtx = new Ctx();
  } catch (_) {
    audioCtx = null;
  }
  return audioCtx;
}

function unregister(handle) {
  activeSounds.delete(handle);
}

function register(handle) {
  activeSounds.add(handle);
  return handle;
}

function stopHandle(handle) {
  if (!handle) return;
  try {
    if (typeof handle.stop === 'function') handle.stop();
  } catch (_) {}
  unregister(handle);
}

function createToneHandle(ctx, tone, baseTime) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const startAt = baseTime + (tone.delay || 0);
  const duration = typeof tone.duration === 'number' ? Math.max(0.001, tone.duration) : null;
  const volume = typeof tone.volume === 'number' ? tone.volume : 0.04;
  const freqStart = Math.max(20, Number(tone.freqStart || 440));
  const freqEnd = Math.max(20, Number(tone.freqEnd || freqStart));
  osc.type = tone.type || 'sine';
  osc.frequency.setValueAtTime(freqStart, startAt);
  if (duration) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, startAt + duration);
  }
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
  if (duration) {
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  }
  osc.connect(gain);
  gain.connect(ctx.destination);
  const handle = register({
    stop() {
      try { osc.stop(); } catch (_) {}
      try { osc.disconnect(); } catch (_) {}
      try { gain.disconnect(); } catch (_) {}
      unregister(handle);
    },
  });
  osc.onended = function () { unregister(handle); };
  osc.start(startAt);
  if (!tone.loop && duration) osc.stop(startAt + duration + 0.01);
  return handle;
}

function resolveSound(id, options) {
  const base = SOUND_LIBRARY[id] || {};
  if (base.kind === 'chord') {
    return {
      kind: 'chord',
      tones: (base.tones || []).map((tone) => ({ ...tone })),
    };
  }
  return { ...base, ...options };
}

export function isMuted() {
  return !!window._arcadeMuted;
}

export function stopAllSounds() {
  Array.from(activeSounds).forEach(stopHandle);
}

export function setMuted(muted, options) {
  const opts = options || {};
  const nextMuted = !!muted;
  window._arcadeMuted = nextMuted;
  if (nextMuted) stopAllSounds();
  if (opts.emitEvent !== false) {
    document.dispatchEvent(new CustomEvent('arcade-mute-change', {
      detail: { muted: nextMuted },
    }));
  }
  return nextMuted;
}

export function playSound(id, options) {
  if (isMuted()) return null;
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(function () {});
  }
  const sound = resolveSound(id, options || {});
  if (!sound || !sound.kind) return null;
  const now = ctx.currentTime;
  if (sound.kind === 'tone') {
    return createToneHandle(ctx, sound, now);
  }
  if (sound.kind === 'chord') {
    const children = (sound.tones || []).map(function (tone) {
      return createToneHandle(ctx, tone, now);
    });
    const groupHandle = register({
      stop() {
        children.forEach(stopHandle);
        unregister(groupHandle);
      },
    });
    return groupHandle;
  }
  return null;
}

document.addEventListener('arcade-mute-change', function (event) {
  const muted = !!event?.detail?.muted;
  setMuted(muted, { emitEvent: false });
});

document.addEventListener('arcade-pause-change', function (event) {
  if (event?.detail?.paused) stopAllSounds();
});

if (typeof window !== 'undefined') {
  window.ArcadeAudio = {
    playSound,
    stopAllSounds,
    setMuted,
    isMuted,
  };
}
