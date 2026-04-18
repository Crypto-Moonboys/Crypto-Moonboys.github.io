/**
 * Tron Audio Engine
 * Lightweight synthesized cues with user-gesture init and safe throttling.
 * TODO(asset path): when adding real files, place them under /audio/tron/
 * and map them in soundProfile/play without changing callers.
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

  function getContext() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }

  function ensureReady() {
    const now = safeNow();
    if (ready) return true;
    if (now - lastContextTryAt < MIN_CONTEXT_RETRY_MS) return false;
    lastContextTryAt = now;
    const ctx = getContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
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
    const ctx = getContext();
    if (!ctx || !enabled || !ensureReady()) return;

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
    if (!ambientNode) return;
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
    const ctx = getContext();
    if (!ctx || !enabled || !ensureReady() || ambientNode) return;
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

  function init() {
    enabled = readEnabledSetting();
    ensureReady();
    window.removeEventListener('pointerdown', init);
    window.removeEventListener('keydown', init);
    window.removeEventListener('touchstart', init);
  }

  window.addEventListener('pointerdown', init, { once: true, passive: true });
  window.addEventListener('keydown', init, { once: true, passive: true });
  window.addEventListener('touchstart', init, { once: true, passive: true });

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
