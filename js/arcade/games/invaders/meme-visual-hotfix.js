(function () {
  if (typeof window === 'undefined' || window.__INVADERS_RANDOM_ASSET_LAYER__) return;
  window.__INVADERS_RANDOM_ASSET_LAYER__ = true;

  const ASSET_VERSION = 'meme-wave-seven-strobe-crash-sfx-20260723';
  const ASSET_BASE = '/art/invaders/generated/';
  const MEME_WAVE_SIZE = 7;
  const INVADERS_AUDIO_MASTER_SCALE = 0.3;
  const MEME_FILES = [
    'invader meme one.png','invader meme two.png','invader meme 3.png','invader meme 4.png',
    'invader meme 5.png','invader meme 6.png','invader meme 7.png','invader meme 8.png',
    'invader meme 9.png','invader meme 10.png','invader meme 11.png','invader meme 12.png',
    'invader meme 13.png','invader meme 14.png','invader meme 15.png','invader meme 16.png',
    'invader meme 17.png','invader meme 18.png','invader meme 19.png','invader meme 20.png',
    'invader meme 21.png','invader meme 22.png','invader meme 23.png','invader meme 24.png',
    'invader meme 25.png','invader meme 26.png','invader meme 27.png','invader meme 28.png',
    'invader meme 29.png','invader meme 30.png','invader meme 31.png','invader meme 32.png',
    'invader meme 33.png','invader meme 34.png','invader meme 35.png','invader meme 36.png',
    'invader meme 37.png',
  ];
  const BOSS_FILES = [
    'invader meme boss.png','invader meme boss 2.png','invader meme boss 3.png',
    'invader meme boss 4.png','invader meme boss 5.png',
  ];
  const BOSS_LABELS = [
    'CYBER TROLL','CORRUPT APE','LASER CAT','SHIBA WARLORD','GLITCH UNICORN',
    'SHIBA DOOM RIDER','THE WALL','THE SPLITTER','THE SNIPER','THE SWARM KING',
    'THE GLITCH CORE','THE BOMBER','BOSS',
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
  const ALIEN_DROP_SOUND_SRC = '/games/invaders-3008/shit%20drop.mp3';
  const RARE_SHIP_SOUND_SRC = '/games/invaders-3008/rare%20ships.mp3';
  const STROBE_CRASH_SOUND_SRC = '/games/invaders-3008/strobe%20crash.mp3';

  const memeImages = MEME_FILES.map((file) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = `${ASSET_BASE}${encodeURIComponent(file)}?v=${ASSET_VERSION}`;
    return image;
  });
  const bossColors = ['#56f0ff', '#ff9b2f', '#ff3fd4', '#f7c948', '#ad5cff'];
  const bossImages = BOSS_FILES.map((file, index) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = `${ASSET_BASE}${encodeURIComponent(file)}?v=${ASSET_VERSION}`;
    return {
      image,
      color: bossColors[index % bossColors.length],
      secondary: bossColors[(index + 2) % bossColors.length],
      width: index === 0 ? 150 : 138,
      height: index === 0 ? 102 : 96,
    };
  });

  const sourceSlots = new Map();
  const recentHitKeys = new Map();
  const killedSoundPools = KILLED_SOUND_SRCS.map(() => []);
  const alienDropSoundPool = [];
  const rareShipSoundPool = [];
  const strobeCrashSoundPool = [];
  let currentWave = 1;
  let killedSoundSlots = shuffleSlots(currentWave);
  let killedSoundCursor = 0;
  let alienDropSoundCursor = 0;
  let rareShipSoundCursor = 0;
  let strobeCrashSoundCursor = 0;
  let lastKilledSoundAt = 0;
  let lastAlienDropSoundAt = 0;
  let lastRareShipSoundAt = 0;
  let lastStrobeCrashSoundAt = 0;
  let lastHudSyncAt = 0;
  let frameInvaderDrawCount = 0;
  let activeBoss = null;

  function clampVolume(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function patchAudioParam(param) {
    if (!param || param.__INVADERS_AUDIO_SCALE_PATCHED__) return;
    Object.defineProperty(param, '__INVADERS_AUDIO_SCALE_PATCHED__', { value: true });
    for (const methodName of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) {
      if (typeof param[methodName] !== 'function') continue;
      const original = param[methodName].bind(param);
      param[methodName] = function (value, ...args) {
        return original(clampVolume(value) * INVADERS_AUDIO_MASTER_SCALE, ...args);
      };
    }
  }

  function installInvadersAudioScale() {
    if (window.__INVADERS_AUDIO_MASTER_SCALE_PATCHED__) return;
    window.__INVADERS_AUDIO_MASTER_SCALE_PATCHED__ = true;
    const mediaProto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
    const volumeDescriptor = mediaProto && Object.getOwnPropertyDescriptor(mediaProto, 'volume');
    if (volumeDescriptor && typeof volumeDescriptor.set === 'function' && typeof volumeDescriptor.get === 'function') {
      Object.defineProperty(mediaProto, 'volume', {
        configurable: true,
        enumerable: volumeDescriptor.enumerable,
        get() { return volumeDescriptor.get.call(this); },
        set(value) { volumeDescriptor.set.call(this, clampVolume(value) * INVADERS_AUDIO_MASTER_SCALE); },
      });
    }
    for (const ContextCtor of [window.AudioContext, window.webkitAudioContext]) {
      if (!ContextCtor || !ContextCtor.prototype || ContextCtor.prototype.__INVADERS_GAIN_SCALE_PATCHED__) continue;
      const originalCreateGain = ContextCtor.prototype.createGain;
      if (typeof originalCreateGain !== 'function') continue;
      Object.defineProperty(ContextCtor.prototype, '__INVADERS_GAIN_SCALE_PATCHED__', { value: true });
      ContextCtor.prototype.createGain = function (...args) {
        const gainNode = originalCreateGain.apply(this, args);
        patchAudioParam(gainNode && gainNode.gain);
        return gainNode;
      };
    }
  }

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
    killedSoundSlots = shuffleSlots(currentWave);
    recentHitKeys.clear();
  }

  function syncWaveFromHud() {
    const now = performance.now();
    if (now - lastHudSyncAt < 250) return;
    lastHudSyncAt = now;
    const parsed = Number.parseInt(document.getElementById('wave')?.textContent || '', 10);
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

  function generatedAssetSrc(image) {
    return String(image && (image.currentSrc || image.src) || '');
  }

  function isGeneratedInvaderSprite(image) {
    const src = generatedAssetSrc(image).toLowerCase();
    return src.includes('/art/invaders/generated/') &&
      !src.includes('boss') &&
      !src.includes('bitcoin') &&
      !src.includes('btc-') &&
      !src.includes('god-bomb') &&
      !src.includes('explosion') &&
      !src.includes('level-');
  }

  function isMemeCandidate(image) {
    return isGeneratedInvaderSprite(image);
  }

  function isHitFilter(filter) {
    const text = String(filter || '');
    const brightness = /brightness\(([^)]+)\)/.exec(text);
    const contrast = /contrast\(([^)]+)\)/.exec(text);
    return (brightness && Number.parseFloat(brightness[1]) > 1.05) ||
      (contrast && Number.parseFloat(contrast[1]) > 1.12);
  }

  function playPooledSound(src, pool, cursorRef, volume, reset) {
    const arcadeAudio = window.ArcadeAudio;
    if (arcadeAudio?.isMuted?.() || window._arcadeMuted || typeof Audio === 'undefined') return cursorRef;
    if (pool.length < 4) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      pool.push(audio);
    }
    const audio = pool[cursorRef % pool.length];
    try {
      if (reset !== false) {
        audio.pause();
        audio.currentTime = 0;
      }
      audio.volume = volume;
      audio.play().catch(function () {});
    } catch (_) {}
    return cursorRef + 1;
  }

  function playKilledSound(slot, hitKey) {
    const now = performance.now();
    if (now - lastKilledSoundAt < 22) return;
    if (now - (recentHitKeys.get(hitKey) || 0) < 95) return;
    lastKilledSoundAt = now;
    recentHitKeys.set(hitKey, now);
    for (const [key, seenAt] of recentHitKeys) {
      if (now - seenAt > 700) recentHitKeys.delete(key);
    }
    const soundIndex = killedSoundSlots[Math.abs(slot) % MEME_WAVE_SIZE] % KILLED_SOUND_SRCS.length;
    killedSoundCursor = playPooledSound(KILLED_SOUND_SRCS[soundIndex], killedSoundPools[soundIndex], killedSoundCursor, 0.175);
  }

  function playAlienDropSound() {
    const now = performance.now();
    if (now - lastAlienDropSoundAt < 80) return;
    lastAlienDropSoundAt = now;
    alienDropSoundCursor = playPooledSound(ALIEN_DROP_SOUND_SRC, alienDropSoundPool, alienDropSoundCursor, 0.1875);
  }

  function playRareShipSound() {
    const now = performance.now();
    if (now - lastRareShipSoundAt < 900) return;
    lastRareShipSoundAt = now;
    rareShipSoundCursor = playPooledSound(RARE_SHIP_SOUND_SRC, rareShipSoundPool, rareShipSoundCursor, 0.195);
  }

  function playStrobeCrashSound() {
    const now = performance.now();
    if (now - lastStrobeCrashSoundAt < 120) return;
    lastStrobeCrashSoundAt = now;
    strobeCrashSoundCursor = playPooledSound(STROBE_CRASH_SOUND_SRC, strobeCrashSoundPool, strobeCrashSoundCursor, 0.175);
  }

  function stopRareShipSoundLoop(clearTracked) {
    for (const audio of rareShipSoundPool) {
      try { audio.pause(); audio.currentTime = 0; } catch (_) {}
    }
  }

  function looksLikeEnemyDropBullet(item) {
    if (!item || typeof item !== 'object') return false;
    const vy = Number(item.vy), y = Number(item.y), w = Number(item.w), h = Number(item.h);
    if (!Number.isFinite(vy) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return false;
    if (vy <= 0 || w > 6 || h < 8 || h > 16) return false;
    const canvasH = Number(document.getElementById('invCanvas')?.height) || 960;
    return y < canvasH - 95;
  }

  function looksLikeRareShip(item) {
    if (!item || typeof item !== 'object') return false;
    // Only the top rogue mini boss gets the custom rare-ships MP3. Normal wave
    // golden invaders are also typed "golden" and made the old loop misfire.
    if (item.type !== 'mini_boss') return false;
    const x = Number(item.x), y = Number(item.y), w = Number(item.w), h = Number(item.h);
    return [x, y, w, h].every(Number.isFinite) && y <= 48 && w >= 24 && h >= 20;
  }

  function isFullInvadersBackgroundFill(ctx, x, y, w, h) {
    return ctx && ctx.canvas && ctx.canvas.id === 'invCanvas' &&
      x === 0 && y === 0 && w === ctx.canvas.width && h === ctx.canvas.height &&
      typeof ctx.fillStyle !== 'string';
  }

  function isHeavyExplosionParticleFill(ctx, w, h) {
    if (!ctx || !ctx.canvas || ctx.canvas.id !== 'invCanvas') return false;
    if (Number(ctx.globalAlpha) >= 0.99 || Number(w) > 8 || Number(h) > 8) return false;
    const color = String(ctx.fillStyle || '').toLowerCase();
    return ['#ff6b2b','#f7c948','#ffd43b','#ff4fd1','#ff4444','#ff3333','#ff8888','#80d8ff','#2ec5ff'].includes(color);
  }

  function shouldAllowHeavyExplosionLayer() {
    return frameInvaderDrawCount > 0 && frameInvaderDrawCount <= 10;
  }

  function isBossLabel(text) {
    const label = String(text || '').toUpperCase();
    return BOSS_LABELS.some((bossLabel) => label === bossLabel || label.includes(bossLabel));
  }

  function chooseBossConfig(label, x, y) {
    const now = performance.now();
    const key = `${String(label || '').toUpperCase()}|${Math.round(Number(y) || 0)}`;
    if (!activeBoss || activeBoss.key !== key || now - activeBoss.lastSeen > 2500) {
      const seed = Math.abs(Math.sin(now * 0.001 + (Number(x) || 0) * 0.017 + key.length * 3.17));
      activeBoss = { key, lastSeen: now, config: bossImages[Math.floor(seed * bossImages.length) % bossImages.length] };
    }
    activeBoss.lastSeen = now;
    return activeBoss.config;
  }

  function drawBossEffects(ctx, config, cx, y, w, h, time) {
    const pulse = 0.5 + Math.sin(time * 8.5) * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = config.color;
    ctx.fillStyle = config.secondary;
    ctx.shadowBlur = 24 + pulse * 28;
    ctx.shadowColor = config.color;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const a = time * (1.7 + i * 0.18) + i * Math.PI * 0.4;
      ctx.globalAlpha = 0.18 + pulse * 0.14;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (w * 0.48), y + h * 0.52 + Math.sin(a) * (h * 0.38), 5 + pulse * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 4; i++) {
      const yy = y + 8 + i * (h / 4) + Math.sin(time * 10 + i) * 4;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.58 + Math.sin(time * 14 + i) * 8, yy);
      ctx.lineTo(cx + w * 0.58 + Math.cos(time * 11 + i) * 8, yy + Math.sin(time * 7 + i) * 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBossPng(ctx, config, cx, labelY, drawImage) {
    const image = config && config.image;
    if (!image || !image.complete || image.naturalWidth <= 0) return;
    const time = performance.now() * 0.001;
    const pulse = 1 + Math.sin(time * 5.5 + cx * 0.01) * 0.055;
    const visualW = config.width * pulse;
    const visualH = config.height * pulse;
    const x = Number(cx) - visualW / 2 + Math.sin(time * 36) * 2.5;
    const y = Number(labelY) + 14 - Math.max(16, visualH * 0.2) + Math.sin(time * 4.2) * 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 22 + Math.sin(time * 9) * 8;
    ctx.shadowColor = config.color;
    drawBossEffects(ctx, config, Number(cx), y, visualW, visualH, time);
    drawImage.call(ctx, image, x, y, visualW, visualH);
    ctx.restore();
  }

  function shouldSuppressInvaderOutline(ctx, x, y, w, h) {
    if (!ctx || !ctx.canvas || ctx.canvas.id !== 'invCanvas') return false;
    if (Number(w) > 70 || Number(h) > 60 || Number(y) > 430) return false;
    return Number(ctx.lineWidth) <= 2 && Number(ctx.shadowBlur) > 0;
  }

  installInvadersAudioScale();

  const previousArrayPush = Array.prototype.push;
  Array.prototype.push = function (...items) {
    const result = previousArrayPush.apply(this, items);
    if (items.some(looksLikeEnemyDropBullet)) playAlienDropSound();
    if (items.some(looksLikeRareShip)) playRareShipSound();
    return result;
  };

  document.addEventListener('arcade-mute-change', (event) => {
    if (event?.detail?.muted) stopRareShipSoundLoop(false);
  });
  document.addEventListener('arcade-pause-change', (event) => {
    if (event?.detail?.paused) stopRareShipSoundLoop(false);
  });

  const proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  if (!proto) return;

  const previousFillText = proto.fillText;
  const previousDrawImage = proto.drawImage;
  const previousStrokeRect = proto.strokeRect;
  const previousStroke = proto.stroke;
  const previousFillRect = proto.fillRect;

  proto.drawImage = function (image, ...args) {
    if (this.canvas && this.canvas.id === 'invCanvas' && isGeneratedInvaderSprite(image)) {
      frameInvaderDrawCount += 1;
    }
    if (this.canvas && this.canvas.id === 'invCanvas' && isMemeCandidate(image) && args.length >= 4) {
      syncWaveFromHud();
      const dx = Number(args[0]), dy = Number(args[1]), dw = Number(args[2]), dh = Number(args[3]);
      if ([dx, dy, dw, dh].every(Number.isFinite)) {
        const src = generatedAssetSrc(image);
        const slot = slotForSource(src);
        const replacement = memeImages[waveMemeIndex(slot)];
        if (replacement && replacement.complete && replacement.naturalWidth > 0) {
          if (isHitFilter(this.filter)) {
            playKilledSound(slot, `${slot}:${Math.round(dx / 4)}:${Math.round(dy / 4)}`);
            if (shouldAllowHeavyExplosionLayer()) playStrobeCrashSound();
          }
          const ratio = replacement.naturalWidth / replacement.naturalHeight;
          const targetH = Math.max(18, Math.min(31, dh * 1.06));
          const targetW = Math.min(dw * 1.1, targetH * ratio);
          const cx = dx + dw / 2, cy = dy + dh / 2;
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

  proto.fillRect = function (x, y, w, h) {
    if (isFullInvadersBackgroundFill(this, x, y, w, h)) frameInvaderDrawCount = 0;
    if (isHeavyExplosionParticleFill(this, w, h) && !shouldAllowHeavyExplosionLayer()) {
      const alpha = this.globalAlpha;
      this.globalAlpha = 1;
      try {
        return previousFillRect.apply(this, arguments);
      } finally {
        this.globalAlpha = alpha;
      }
    }
    return previousFillRect.apply(this, arguments);
  };

  proto.strokeRect = function (x, y, w, h) {
    if (shouldSuppressInvaderOutline(this, x, y, w, h)) return;
    return previousStrokeRect.apply(this, arguments);
  };

  proto.stroke = function (...args) {
    if (shouldSuppressInvaderOutline(this, 0, 0, 50, 50)) return;
    return previousStroke.apply(this, args);
  };

  proto.fillText = function (text, ...args) {
    if (this.canvas && this.canvas.id === 'invCanvas') {
      const waveMatch = /^(?:BOSS )?WAVE\s+(\d+)$/i.exec(String(text || ''));
      if (waveMatch) setWave(Number.parseInt(waveMatch[1], 10));
      if (isBossLabel(text) && args.length >= 2) {
        drawBossPng(this, chooseBossConfig(text, Number(args[0]), Number(args[1])), Number(args[0]), Number(args[1]), previousDrawImage);
      }
    }
    return previousFillText.call(this, text, ...args);
  };
})();
