const SOUND_LIBRARY = {
  'invaders-shoot':     { kind: 'tone',  type: 'square',   freqStart: 620, freqEnd: 341, duration: 0.05, volume: 0.03 },
  'invaders-hit':       { kind: 'tone',  type: 'triangle', freqStart: 180, freqEnd: 99,  duration: 0.07, volume: 0.04 },
  'invaders-explosion': { kind: 'tone',  type: 'sawtooth', freqStart: 90,  freqEnd: 60,  duration: 0.18, volume: 0.05 },
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
};

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
  window._arcadeMuted = muted;
  if (muted) stopAllSounds();
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
