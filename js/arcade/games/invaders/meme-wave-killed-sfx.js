(function () {
  if (typeof window === 'undefined' || window.__INVADERS_WAVE_KILLED_SFX__) return;
  window.__INVADERS_WAVE_KILLED_SFX__ = true;

  const ASSET_VERSION = 'meme-wave-seven-killed-sfx-20260722';
  const ASSET_BASE = '/art/invaders/generated/';
  const MEME_WAVE_SIZE = 7;
  const MEME_FILES = [
    'invader meme one.png',
    'invader meme two.png',
    'invader meme 3.png',
    'invader meme 4.png',
    'invader meme 5.png',
    'invader meme 6.png',
    'invader meme 7.png',
    'invader meme 8.png',
    'invader meme 9.png',
    'invader meme 10.png',
    'invader meme 11.png',
    'invader meme 12.png',
    'invader meme 13.png',
    'invader meme 14.png',
    'invader meme 15.png',
    'invader meme 16.png',
    'invader meme 17.png',
    'invader meme 18.png',
    'invader meme 19.png',
    'invader meme 20.png',
    'invader meme 21.png',
    'invader meme 22.png',
    'invader meme 23.png',
    'invader meme 24.png',
    'invader meme 25.png',
    'invader meme 26.png',
    'invader meme 27.png',
    'invader meme 28.png',
    'invader meme 29.png',
    'invader meme 30.png',
    'invader meme 31.png',
    'invader meme 32.png',
    'invader meme 33.png',
    'invader meme 34.png',
    'invader meme 35.png',
    'invader meme 36.png',
    'invader meme 37.png',
  ];
  const KILLED_SOUND_SRCS = [
    '/games/invaders-3008/killed%20one.mp3',
    '/games/invaders-3008/killed%20two.mp3',
    '/games/invaders-3008/killed%20three.mp3',
    '/games/invaders-3008/killed%20four.mp3',
    '/games/invaders-3008/killed%20five.mp3',
    '/games/invaders-3008/killed%20six.mp3',
    '/games/invaders-3008/killed%20seven.mp3',
  ];
  const SOUND_VOLUME = 0.175;
  const SOUND_POOL_SIZE = 3;

  const memeImages = MEME_FILES.map((file) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = `${ASSET_BASE}${encodeURIComponent(file)}?v=${ASSET_VERSION}`;
    return image;
  });
  const soundPools = KILLED_SOUND_SRCS.map(() => []);
  const sourceSlots = new Map();
  const recentHitKeys = new Map();
  let currentWave = 1;
  let soundSlots = shuffleSlots(currentWave);
  let soundCursor = 0;
  let lastSoundAt = 0;
  let lastHudSyncAt = 0;

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function shuffleSlots(wave) {
    const slots = KILLED_SOUND_SRCS.map((_, index) => index);
    let seed = (Math.max(1, Number(wave) || 1) * 2654435761) >>> 0;
    for (let i = slots.length - 1; i > 0; i--) {
      seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + i) >>> 0;
      const j = seed % (i + 1);
      const tmp = slots[i];
      slots[i] = slots[j];
      slots[j] = tmp;
    }
    return slots;
  }

  function setWave(wave) {
    const next = Math.max(1, Number(wave) || 1);
    if (next === currentWave) return;
    currentWave = next;
    soundSlots = shuffleSlots(currentWave);
    recentHitKeys.clear();
  }

  function syncWaveFromHud() {
    const now = performance.now();
    if (now - lastHudSyncAt < 250) return;
    lastHudSyncAt = now;
    const waveText = document.getElementById('wave')?.textContent || '';
    const parsed = Number.parseInt(waveText, 10);
    if (Number.isFinite(parsed)) setWave(parsed);
  }

  function slotForSource(src) {
    const key = String(src || '').split('?')[0];
    if (!sourceSlots.has(key)) sourceSlots.set(key, hashString(key) % MEME_WAVE_SIZE);
    return sourceSlots.get(key);
  }

  function waveMemeIndex(slot) {
    const start = ((currentWave - 1) * MEME_WAVE_SIZE) % MEME_FILES.length;
    return (start + Math.abs(slot)) % MEME_FILES.length;
  }

  function isMemeCandidate(image) {
    const src = String(image && (image.currentSrc || image.src) || '').toLowerCase();
    return src.includes('/art/invaders/generated/') &&
      !src.includes('boss') &&
      !src.includes('bitcoin') &&
      !src.includes('btc-') &&
      !src.includes('god-bomb') &&
      !src.includes('explosion') &&
      !src.includes('level-');
  }

  function isHitFilter(filter) {
    const text = String(filter || '');
    const brightness = /brightness\(([^)]+)\)/.exec(text);
    const contrast = /contrast\(([^)]+)\)/.exec(text);
    return (brightness && Number.parseFloat(brightness[1]) > 1.05) ||
      (contrast && Number.parseFloat(contrast[1]) > 1.12);
  }

  function playKilledSound(slot, hitKey) {
    const arcadeAudio = window.ArcadeAudio;
    if (arcadeAudio?.isMuted?.() || window._arcadeMuted || typeof Audio === 'undefined') return;

    const now = performance.now();
    if (now - lastSoundAt < 22) return;
    if (now - (recentHitKeys.get(hitKey) || 0) < 95) return;
    lastSoundAt = now;
    recentHitKeys.set(hitKey, now);
    for (const [key, seenAt] of recentHitKeys) {
      if (now - seenAt > 700) recentHitKeys.delete(key);
    }

    const soundIndex = soundSlots[Math.abs(slot) % MEME_WAVE_SIZE] % KILLED_SOUND_SRCS.length;
    const pool = soundPools[soundIndex];
    if (pool.length < SOUND_POOL_SIZE) {
      const audio = new Audio(KILLED_SOUND_SRCS[soundIndex]);
      audio.preload = 'auto';
      pool.push(audio);
    }
    const audio = pool[soundCursor % pool.length];
    soundCursor += 1;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = SOUND_VOLUME;
      audio.play().catch(function () {});
    } catch (_) {}
  }

  const proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  if (!proto) return;

  const previousFillText = proto.fillText;
  proto.fillText = function (text, ...args) {
    if (this.canvas && this.canvas.id === 'invCanvas') {
      const match = /^(?:BOSS )?WAVE\s+(\d+)$/i.exec(String(text || ''));
      if (match) setWave(Number.parseInt(match[1], 10));
    }
    return previousFillText.call(this, text, ...args);
  };

  const previousDrawImage = proto.drawImage;
  proto.drawImage = function (image, ...args) {
    if (this.canvas && this.canvas.id === 'invCanvas' && isMemeCandidate(image) && args.length >= 4) {
      syncWaveFromHud();
      const dx = Number(args[0]);
      const dy = Number(args[1]);
      const dw = Number(args[2]);
      const dh = Number(args[3]);
      if ([dx, dy, dw, dh].every(Number.isFinite)) {
        const src = image.currentSrc || image.src || '';
        const slot = slotForSource(src);
        const replacement = memeImages[waveMemeIndex(slot)];
        if (replacement && replacement.complete && replacement.naturalWidth > 0) {
          if (isHitFilter(this.filter)) {
            playKilledSound(slot, `${slot}:${Math.round(dx / 4)}:${Math.round(dy / 4)}`);
          }
          const ratio = replacement.naturalWidth / replacement.naturalHeight;
          const targetH = Math.max(18, Math.min(31, dh * 1.06));
          const targetW = Math.min(dw * 1.1, targetH * ratio);
          const cx = dx + dw / 2;
          const cy = dy + dh / 2;
          this.save();
          this.imageSmoothingEnabled = false;
          previousDrawImage.call(this, replacement, cx - targetW / 2, cy - targetH / 2, targetW, targetH);
          this.restore();
          return;
        }
      }
    }
    return previousDrawImage.call(this, image, ...args);
  };
})();
