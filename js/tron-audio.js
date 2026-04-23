/**
 * Tron Audio Engine
 * Lightweight synthesized cues with user-gesture init and safe throttling.
 * Future asset plan: if branded SFX files are added, store them in /audio/tron/
 * and keep this synthesized path as a silent fallback for missing/unloaded files.
 */
(function () {
  'use strict';

  if (window.TRON_AUDIO) return;

  const AUDIO_KEY = 'tron_audio_enabled';
  const HOVER_COOLDOWN_MS = 140;
  const MIN_CONTEXT_RETRY_MS = 1200;

  let audioCtx = null;
  let ready = false;
  let enabled = true;
  let lastHoverAt = 0;
  let lastContextTryAt = 0;
  let ambientNode = null;
  let userInteracted = false;
  let unlockListenersBound = false;
  let resumePromise = null;

  function safeNow() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function readEnabledSetting() {
    try {
      const stored = localStorage.getItem(AUDIO_KEY);
      if (stored === '0') return false;
      if (stored === '1') return true;
    } catch (_) {}
    return true;
  }

  function writeEnabledSetting(v) {
    try { localStorage.setItem(AUDIO_KEY, v ? '1' : '0'); } catch (_) {}
  }

  function getContext(allowCreate) {
    if (audioCtx) return audioCtx;
    if (!allowCreate) return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }

  function ensureReady(opts = {}) {
    const fromGesture = !!opts.fromGesture;
    const allowCreate = !!opts.allowCreate;
    if (fromGesture) userInteracted = true;
    const now = safeNow();
    if (ready) return true;
    if (!fromGesture && now - lastContextTryAt < MIN_CONTEXT_RETRY_MS) return false;
    lastContextTryAt = now;
    const canBootContext = userInteracted || fromGesture;
    const ctx = getContext(allowCreate && canBootContext);
    if (!ctx) return false;
    if (ctx.state === 'closed') {
      audioCtx = null;
      return false;
    }
    if (ctx.state === 'suspended') {
      if (!canBootContext) return false;
      if (!resumePromise) {
        resumePromise = ctx.resume()
          .catch(() => {})
          .then(() => {
            ready = ctx.state === 'running';
            return ready;
          })
          .finally(() => {
            resumePromise = null;
          });
      }
      return false;
    }
    ready = ctx.state === 'running';
    return ready;
  }

  /**
   * Create a short attack/decay gain envelope for a tone burst.
   * attack/decay are seconds (small positive floats), peak is the max gain.
   */
  function envelopeGain(ctx, startAt, attack = 0.008, decay = 0.1, peak = 0.05) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startAt + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + attack + decay);
    return gain;
  }

  function playTone(opts) {
    if (!enabled || !ensureReady()) return;
    const ctx = audioCtx;
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = envelopeGain(ctx, now, opts.attack, opts.decay, opts.volume);
    osc.type = opts.type || 'triangle';
    osc.frequency.setValueAtTime(opts.freqStart, now);
    if (typeof opts.freqEnd === 'number' && opts.freqEnd !== opts.freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), now + (opts.glide || 0.08));
    }
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (opts.duration || 0.15));
  }

  function soundProfile(name) {
    switch (name) {
      case 'hover':
        return { freqStart: 920, freqEnd: 760, duration: 0.06, attack: 0.004, decay: 0.06, volume: 0.016, type: 'sine' };
      case 'click':
        return { freqStart: 640, freqEnd: 420, duration: 0.12, attack: 0.006, decay: 0.12, volume: 0.04, type: 'triangle' };
      case 'event':
        return { freqStart: 280, freqEnd: 1100, glide: 0.11, duration: 0.19, attack: 0.006, decay: 0.14, volume: 0.055, type: 'sawtooth' };
      case 'wake':
        return { freqStart: 520, freqEnd: 860, glide: 0.09, duration: 0.16, attack: 0.006, decay: 0.15, volume: 0.046, type: 'triangle' };
      default:
        return { freqStart: 480, freqEnd: 620, duration: 0.1, attack: 0.005, decay: 0.09, volume: 0.028, type: 'triangle' };
    }
  }

  function play(name, opts = {}) {
    if (!enabled) return;
    if (name === 'hover') {
      const now = safeNow();
      if (now - lastHoverAt < HOVER_COOLDOWN_MS) return;
      lastHoverAt = now;
    }
    const profile = Object.assign(soundProfile(name), opts || {});
    playTone(profile);
  }

  function stopAmbient() {
    if (!ambientNode || !audioCtx) return;
    try {
      ambientNode.gain.cancelScheduledValues(audioCtx.currentTime);
      ambientNode.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.08);
      setTimeout(() => {
        try { ambientNode.source.stop(); } catch (_) {}
        try { ambientNode.source.disconnect(); } catch (_) {}
        try { ambientNode.gain.disconnect(); } catch (_) {}
        ambientNode = null;
      }, 180);
    } catch (_) {
      ambientNode = null;
    }
  }

  function startAmbient() {
    if (!enabled || ambientNode || !ensureReady()) return;
    const ctx = audioCtx;
    if (!ctx) return;
    const source = ctx.createOscillator();
    const gain = ctx.createGain();
    source.type = 'sine';
    source.frequency.setValueAtTime(58, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0014, ctx.currentTime + 1.2);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    ambientNode = { source, gain };
  }

  function setEnabled(v) {
    enabled = !!v;
    writeEnabledSetting(enabled);
    if (!enabled) {
      stopAmbient();
    }
  }

  function bindUnlockListeners() {
    if (unlockListenersBound) return;
    window.addEventListener('pointerdown', init, { passive: true });
    window.addEventListener('keydown', init, { passive: true });
    window.addEventListener('touchstart', init, { passive: true });
    unlockListenersBound = true;
  }

  function removeUnlockListeners() {
    if (!unlockListenersBound) return;
    window.removeEventListener('pointerdown', init);
    window.removeEventListener('keydown', init);
    window.removeEventListener('touchstart', init);
    unlockListenersBound = false;
  }

  function init(event) {
    enabled = readEnabledSetting();
    const fromGesture = !!(event && event.isTrusted);
    if (event && !fromGesture) return;
    const unlocked = ensureReady({ allowCreate: fromGesture, fromGesture });
    if (unlocked) {
      removeUnlockListeners();
    } else if (resumePromise) {
      resumePromise.then((isReady) => {
        if (isReady) removeUnlockListeners();
      });
    }
  }

  bindUnlockListeners();

  window.TRON_AUDIO = {
    get ready() { return ready; },
    get enabled() { return enabled; },
    play,
    init,
    setEnabled,
    startAmbient,
    stopAmbient
  };
})();
