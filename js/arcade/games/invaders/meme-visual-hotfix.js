(function () {
  if (typeof window === 'undefined' || window.__INVADERS_RANDOM_ASSET_LAYER__) return;
  window.__INVADERS_RANDOM_ASSET_LAYER__ = true;

  const ASSET_VERSION = 'invaders-no-outline-stable-20260716';
  const ASSET_BASE = '/art/invaders/generated/';
  const invaderFiles = [
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
  const invaderImages = invaderFiles.map((file) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = `${ASSET_BASE}${encodeURIComponent(file)}?v=${ASSET_VERSION}`;
    return { file, image };
  });
  const sourceSkinMap = new Map();
  const bossFiles = [
    'invader meme boss.png',
    'invader meme boss 2.png',
    'invader meme boss 3.png',
    'invader meme boss 4.png',
    'invader meme boss 5.png',
  ];
  const bossColors = ['#56f0ff', '#ff9b2f', '#ff3fd4', '#f7c948', '#ad5cff'];
  const bossImages = bossFiles.map((file, index) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = `${ASSET_BASE}${encodeURIComponent(file)}?v=${ASSET_VERSION}`;
    return {
      file,
      image,
      color: bossColors[index % bossColors.length],
      secondary: bossColors[(index + 2) % bossColors.length],
      width: index === 0 ? 150 : 138,
      height: index === 0 ? 102 : 96,
    };
  });

  const bossLabels = [
    'CYBER TROLL',
    'CORRUPT APE',
    'LASER CAT',
    'SHIBA WARLORD',
    'GLITCH UNICORN',
    'SHIBA DOOM RIDER',
    'THE WALL',
    'THE SPLITTER',
    'THE SNIPER',
    'THE SWARM KING',
    'THE GLITCH CORE',
    'THE BOMBER',
    'BOSS',
  ];

  let activeBoss = null;
  let frameInvaderDrawCount = 0;
  let lastAlienDropSoundAt = 0;
  let alienDropSoundCursor = 0;
  const ALIEN_DROP_SOUND_SRC = '/games/invaders-3008/shit%20drop.mp3';
  const ALIEN_DROP_SOUND_POOL_SIZE = 6;
  const alienDropSoundPool = [];
  let rareShipSoundCursor = 0;
  let rareShipSoundTimer = null;
  let lastRareShipSoundAt = 0;
  const RARE_SHIP_SOUND_SRC = '/games/invaders-3008/rare%20ships.mp3';
  const RARE_SHIP_SOUND_POOL_SIZE = 4;
  const RARE_SHIP_REPEAT_MS = 1350;
  const rareShipSoundPool = [];
  const trackedRareShips = new Set();

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function stableSkinForSource(src) {
    const key = String(src || '').split('?')[0];
    if (!sourceSkinMap.has(key)) {
      sourceSkinMap.set(key, hashString(key) % invaderImages.length);
    }
    return sourceSkinMap.get(key);
  }

  function isNativeMemeEnemyImage(image) {
    const src = String(image && (image.currentSrc || image.src) || '');
    return src.includes('/art/invaders/generated/') &&
      !src.includes('invader%20meme') &&
      !src.includes('invader meme') &&
      !src.includes('boss') &&
      !src.includes('bitcoin') &&
      !src.includes('btc-') &&
      !src.includes('god-bomb') &&
      !src.includes('explosion') &&
      !src.includes('level-');
  }

  function isGeneratedInvaderSprite(image) {
    const src = String(image && (image.currentSrc || image.src) || '').toLowerCase();
    return src.includes('/art/invaders/generated/') &&
      !src.includes('boss') &&
      !src.includes('bitcoin') &&
      !src.includes('btc-') &&
      !src.includes('god-bomb') &&
      !src.includes('explosion') &&
      !src.includes('level-');
  }

  function isFullInvadersBackgroundFill(ctx, x, y, w, h) {
    return ctx &&
      ctx.canvas &&
      ctx.canvas.id === 'invCanvas' &&
      x === 0 &&
      y === 0 &&
      w === ctx.canvas.width &&
      h === ctx.canvas.height &&
      typeof ctx.fillStyle !== 'string';
  }

  function isHeavyExplosionParticleFill(ctx, w, h) {
    if (!ctx || !ctx.canvas || ctx.canvas.id !== 'invCanvas') return false;
    if (Number(ctx.globalAlpha) >= 0.99 || Number(w) > 8 || Number(h) > 8) return false;
    const color = String(ctx.fillStyle || '').toLowerCase();
    return color === '#ff6b2b' ||
      color === '#f7c948' ||
      color === '#ffd43b' ||
      color === '#ff4fd1' ||
      color === '#ff4444' ||
      color === '#ff3333' ||
      color === '#ff8888' ||
      color === '#80d8ff' ||
      color === '#2ec5ff';
  }

  function shouldAllowHeavyExplosionLayer() {
    return frameInvaderDrawCount > 0 && frameInvaderDrawCount <= 10;
  }

  function playAlienDropSound() {
    const now = performance.now();
    if (now - lastAlienDropSoundAt < 80) return;
    lastAlienDropSoundAt = now;
    const arcadeAudio = window.ArcadeAudio;
    if (arcadeAudio?.isMuted?.() || window._arcadeMuted) return;
    if (typeof Audio === 'undefined') return;
    if (alienDropSoundPool.length < ALIEN_DROP_SOUND_POOL_SIZE) {
      const audio = new Audio(ALIEN_DROP_SOUND_SRC);
      audio.preload = 'auto';
      alienDropSoundPool.push(audio);
    }
    const audio = alienDropSoundPool[alienDropSoundCursor % alienDropSoundPool.length];
    alienDropSoundCursor += 1;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0.375;
      audio.play().catch(function () {});
    } catch (_) {
      // Audio can fail before first user gesture on some browsers; ignore safely.
    }
  }

  function playRareShipSound() {
    const now = performance.now();
    if (now - lastRareShipSoundAt < 250) return;
    lastRareShipSoundAt = now;
    const arcadeAudio = window.ArcadeAudio;
    if (arcadeAudio?.isMuted?.() || window._arcadeMuted) return;
    if (typeof Audio === 'undefined') return;
    if (rareShipSoundPool.length < RARE_SHIP_SOUND_POOL_SIZE) {
      const audio = new Audio(RARE_SHIP_SOUND_SRC);
      audio.preload = 'auto';
      rareShipSoundPool.push(audio);
    }
    const audio = rareShipSoundPool[rareShipSoundCursor % rareShipSoundPool.length];
    rareShipSoundCursor += 1;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0.39;
      audio.play().catch(function () {});
    } catch (_) {
      // Audio can fail before first user gesture on some browsers; ignore safely.
    }
  }

  function isRareShipAlive(ship) {
    if (!ship || typeof ship !== 'object') return false;
    const hp = Number(ship.hp ?? 1);
    const y = Number(ship.y);
    const canvas = document.getElementById('invCanvas');
    const canvasH = Number(canvas && canvas.height) || 960;
    if (!Number.isFinite(hp) || hp <= 0) return false;
    if (ship.alive === false) return false;
    if (Number.isFinite(y) && y > canvasH + 40) return false;
    return true;
  }

  function pruneTrackedRareShips() {
    for (const ship of Array.from(trackedRareShips)) {
      if (!isRareShipAlive(ship)) trackedRareShips.delete(ship);
    }
    return trackedRareShips.size;
  }

  function stopRareShipSoundLoop(clearTracked) {
    if (rareShipSoundTimer) {
      clearInterval(rareShipSoundTimer);
      rareShipSoundTimer = null;
    }
    if (clearTracked !== false) trackedRareShips.clear();
    for (const audio of rareShipSoundPool) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (_) {}
    }
  }

  function ensureRareShipSoundLoop() {
    pruneTrackedRareShips();
    if (!trackedRareShips.size) return;
    playRareShipSound();
    if (rareShipSoundTimer) return;
    rareShipSoundTimer = setInterval(function () {
      if (!pruneTrackedRareShips()) {
        stopRareShipSoundLoop();
        return;
      }
      playRareShipSound();
    }, RARE_SHIP_REPEAT_MS);
  }

  function looksLikeEnemyDropBullet(item) {
    if (!item || typeof item !== 'object') return false;
    const vy = Number(item.vy);
    const y = Number(item.y);
    const w = Number(item.w);
    const h = Number(item.h);
    if (!Number.isFinite(vy) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return false;
    if (vy <= 0 || w > 6 || h < 8 || h > 16) return false;
    const canvas = document.getElementById('invCanvas');
    const canvasH = Number(canvas && canvas.height) || 960;
    return y < canvasH - 95;
  }

  function looksLikeRareShip(item) {
    if (!item || typeof item !== 'object') return false;
    if (item.type !== 'golden' && item.type !== 'mini_boss') return false;
    const x = Number(item.x);
    const y = Number(item.y);
    const w = Number(item.w);
    const h = Number(item.h);
    return [x, y, w, h].every(Number.isFinite) && w >= 24 && h >= 20 && isRareShipAlive(item);
  }

  const previousArrayPush = Array.prototype.push;
  Array.prototype.push = function (...items) {
    const result = previousArrayPush.apply(this, items);
    if (items.some(looksLikeEnemyDropBullet)) playAlienDropSound();
    for (const item of items) {
      if (looksLikeRareShip(item)) trackedRareShips.add(item);
    }
    if (trackedRareShips.size) ensureRareShipSoundLoop();
    return result;
  };

  document.addEventListener('arcade-mute-change', function (event) {
    if (event?.detail?.muted) stopRareShipSoundLoop(false);
  });

  document.addEventListener('arcade-pause-change', function (event) {
    if (event?.detail?.paused) stopRareShipSoundLoop(false);
  });

  function isBossLabel(text) {
    const label = String(text || '').toUpperCase();
    return bossLabels.some((bossLabel) => label === bossLabel || label.includes(bossLabel));
  }

  function chooseBossConfig(label, x, y) {
    const now = performance.now();
    const key = `${String(label || '').toUpperCase()}|${Math.round(Number(y) || 0)}`;
    if (!activeBoss || activeBoss.key !== key || now - activeBoss.lastSeen > 2500) {
      const seed = Math.abs(Math.sin(now * 0.001 + (Number(x) || 0) * 0.017 + key.length * 3.17));
      activeBoss = {
        key,
        lastSeen: now,
        config: bossImages[Math.floor(seed * bossImages.length) % bossImages.length],
      };
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
      const px = cx + Math.cos(a) * (w * 0.48);
      const py = y + h * 0.52 + Math.sin(a) * (h * 0.38);
      ctx.globalAlpha = 0.18 + pulse * 0.14;
      ctx.beginPath();
      ctx.arc(px, py, 5 + pulse * 5, 0, Math.PI * 2);
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
    const shake = Math.sin(time * 36) * 2.5;
    const x = Number(cx) - visualW / 2 + shake;
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
    if (this.canvas && this.canvas.id === 'invCanvas' && isNativeMemeEnemyImage(image) && args.length >= 4) {
      const dx = Number(args[0]);
      const dy = Number(args[1]);
      const dw = Number(args[2]);
      const dh = Number(args[3]);
      if ([dx, dy, dw, dh].every(Number.isFinite)) {
        const replacement = invaderImages[stableSkinForSource(image.currentSrc || image.src)]?.image;
        if (replacement && replacement.complete && replacement.naturalWidth > 0) {
          const ratio = replacement.naturalWidth / replacement.naturalHeight;
          const targetH = Math.max(18, Math.min(30, dh * 1.04));
          const targetW = Math.min(dw * 1.08, targetH * ratio);
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

  proto.fillRect = function (x, y, w, h) {
    if (isFullInvadersBackgroundFill(this, x, y, w, h)) {
      frameInvaderDrawCount = 0;
    }

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
    if (this.canvas && this.canvas.id === 'invCanvas' && isBossLabel(text) && args.length >= 2) {
      const config = chooseBossConfig(text, Number(args[0]), Number(args[1]));
      drawBossPng(this, config, Number(args[0]), Number(args[1]), previousDrawImage);
    }
    return previousFillText.call(this, text, ...args);
  };
})();