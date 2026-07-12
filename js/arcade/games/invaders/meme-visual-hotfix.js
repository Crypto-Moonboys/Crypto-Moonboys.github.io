(function () {
  if (typeof window === 'undefined' || window.__INVADERS_MEME_VISUAL_HOTFIX__) return;
  window.__INVADERS_MEME_VISUAL_HOTFIX__ = true;

  const CANNON_LEVEL_COUNT = 9;
  const CANNON_VERSION = 'bitcoin-cannon-levels-20260712';
  const CANNON_BASE = '/art/invaders/generated/';
  const BOMB_VERSION = 'bitcoin-bomb-skins-20260712';
  const EXPLOSION_VERSION = 'reactive-hit-lights-20260712';
  let cannonLevel = 1;
  let upgradePromptSeenUntil = 0;
  let activeBombSkin = -1;
  let lastBombSeenAt = 0;
  let queuedBombSkin = -1;
  let pendingBombArc = null;
  const backgroundHitPulses = [];
  let lastBackgroundPulseAt = 0;

  function cannonSrc(level) {
    const slug = level === 7 ? 'bitcoin-blaster-tank' : 'bitcoin-cannon';
    return `${CANNON_BASE}invaders-3008-level-${level}-${slug}-transparent.png?v=${CANNON_VERSION}`;
  }

  const cannonImages = Array.from({ length: CANNON_LEVEL_COUNT }, (_, idx) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = cannonSrc(idx + 1);
    return image;
  });

  const explosionImages = {
    btc: new Image(),
    punk: new Image(),
  };
  explosionImages.btc.decoding = 'async';
  explosionImages.punk.decoding = 'async';
  explosionImages.btc.src = `/art/invaders/generated/invaders-3008-btc-explosion.png?v=${EXPLOSION_VERSION}`;
  explosionImages.punk.src = `/art/invaders/generated/invaders-3008-punk-explosion.png?v=${EXPLOSION_VERSION}`;

  function classifyExplosionSprite(fillStyle) {
    const color = String(fillStyle || '').toLowerCase();
    if (color === '#ff6b2b' || color === '#f7c948' || color === '#ffd43b') return 'btc';
    if (
      color === '#ff4fd1' ||
      color === '#ff4444' ||
      color === '#ff3333' ||
      color === '#ff8888' ||
      color === '#80d8ff' ||
      color === '#2ec5ff'
    ) return 'punk';
    return null;
  }

  function drawExplosionSpriteParticle(ctx, x, y, w, h, kind) {
    const image = explosionImages[kind];
    if (!image || !image.complete || image.naturalWidth <= 0) return;

    const t = performance.now() * 0.001;
    const seed = Math.sin((x + 17.3) * 12.9898 + (y + 41.7) * 78.233) * 43758.5453;
    const jitter = seed - Math.floor(seed);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const base = Math.max(16, Math.min(72, (w + h) * (4.2 + jitter * 5.5)));
    const flashes = kind === 'btc' ? 3 : 4;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < flashes; i++) {
      const phase = t * (18 + i * 5) + jitter * 9.7 + i * 1.13;
      const strobe = (Math.sin(phase) + 1) / 2;
      if (strobe < 0.24 && i > 0) continue;
      const size = base * (0.72 + i * 0.38 + strobe * 0.42);
      const ratio = image.naturalWidth / image.naturalHeight;
      const visualW = ratio >= 1 ? size : size * ratio;
      const visualH = ratio >= 1 ? size / ratio : size;
      const angle = Math.sin(phase * 0.71) * 0.35 + i * 0.22;
      const ox = Math.cos(phase + i) * (3 + i * 2.5);
      const oy = Math.sin(phase * 1.17 + i) * (3 + i * 2.5);
      ctx.globalAlpha = Math.min(0.95, (Number(ctx.globalAlpha) || 1) * (0.38 + strobe * 0.46));
      ctx.shadowBlur = kind === 'btc' ? 18 + i * 5 : 24 + i * 7;
      ctx.shadowColor = kind === 'btc' ? '#ffd43b' : (i % 2 ? '#2ee8ff' : '#ff2ed1');
      ctx.translate(cx + ox, cy + oy);
      ctx.rotate(angle);
      originalDrawImage.call(ctx, image, -visualW / 2, -visualH / 2, visualW, visualH);
      ctx.rotate(-angle);
      ctx.translate(-(cx + ox), -(cy + oy));
    }
    ctx.restore();
  }

  function rememberBackgroundHitPulse(x, y, color, strength = 1) {
    const now = performance.now();
    if (now - lastBackgroundPulseAt < 18 && backgroundHitPulses.length > 0) return;
    lastBackgroundPulseAt = now;
    backgroundHitPulses.push({
      x,
      y,
      color: String(color || '#ff4fd1'),
      born: now,
      life: 520 + Math.random() * 220,
      strength,
    });
    while (backgroundHitPulses.length > 28) backgroundHitPulses.shift();
  }

  function drawReactiveBackgroundPulses(ctx, W, H) {
    const now = performance.now();
    for (let i = backgroundHitPulses.length - 1; i >= 0; i--) {
      const pulse = backgroundHitPulses[i];
      const age = now - pulse.born;
      const t = age / pulse.life;
      if (t >= 1) {
        backgroundHitPulses.splice(i, 1);
        continue;
      }

      const ease = Math.pow(1 - t, 1.8);
      const strobe = 0.55 + Math.sin(now * 0.055 + i * 2.4) * 0.45;
      const radius = 70 + pulse.strength * 46 + t * 130;
      const gx = Math.max(0, Math.min(W, pulse.x));
      const gy = Math.max(0, Math.min(H, pulse.y));
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
      grad.addColorStop(0, pulse.color + Math.round(95 * ease * (0.65 + strobe * 0.35)).toString(16).padStart(2, '0'));
      grad.addColorStop(0.34, pulse.color + Math.round(48 * ease).toString(16).padStart(2, '0'));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      originalFillRect.call(ctx, 0, 0, W, H);

      if (i % 3 === 0 && strobe > 0.72) {
        ctx.globalAlpha = 0.08 * ease;
        ctx.fillStyle = pulse.color;
        originalFillRect.call(ctx, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }
  }

  const bombImages = [
    'invaders-3008-btc-fire.png',
    'invaders-3008-btc-fire-2.png',
    'invaders-3008-god-bomb.png',
  ].map((file) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = `/art/invaders/generated/${file}?v=${BOMB_VERSION}`;
    return image;
  });

  function randomBombSkin() {
    return Math.floor(Math.random() * bombImages.length);
  }

  function getActiveBombSkin() {
    const now = performance.now();
    if (now - lastBombSeenAt > 300) {
      activeBombSkin = queuedBombSkin >= 0 ? queuedBombSkin : randomBombSkin();
      queuedBombSkin = -1;
    }
    lastBombSeenAt = now;
    return Math.max(0, activeBombSkin);
  }

  function setCannonLevel(level) {
    cannonLevel = Math.max(1, Math.min(CANNON_LEVEL_COUNT, Number(level) || 1));
  }

  function advanceCannonLevel() {
    setCannonLevel(cannonLevel + 1);
  }

  function isInvadersPlayerShipImage(image) {
    const src = String(image && image.currentSrc || image && image.src || '');
    return src.includes('/games/invaders-3008/assets/ships/player-ship.png');
  }

  function resetCannonSoon() {
    setTimeout(() => setCannonLevel(1), 0);
  }

  window.__INVADERS_SET_CANNON_LEVEL__ = setCannonLevel;

  window.addEventListener('keydown', (event) => {
    if (event.key === 'b' || event.key === 'B') {
      queuedBombSkin = randomBombSkin();
    }
    if (!/^[123]$/.test(event.key)) return;
    if (performance.now() > upgradePromptSeenUntil) return;
    advanceCannonLevel();
  }, true);

  window.addEventListener('click', (event) => {
    const id = event.target && event.target.id;
    if (id === 'startBtn' || id === 'resetBtn') resetCannonSoon();
  }, true);

  const imageProto = window.HTMLImageElement && window.HTMLImageElement.prototype;
  const srcDescriptor = imageProto && Object.getOwnPropertyDescriptor(imageProto, 'src');
  if (srcDescriptor && srcDescriptor.set && srcDescriptor.get) {
    Object.defineProperty(imageProto, 'src', {
      configurable: true,
      enumerable: srcDescriptor.enumerable,
      get: srcDescriptor.get,
      set(value) {
        let next = value;
        if (typeof next === 'string' && next.includes('/games/invaders-3008/assets/ships/player-ship.png')) {
          next = '/games/invaders-3008/assets/ships/player-ship.png?v=bitcoin-cannon-level-1-20260712';
        }
        srcDescriptor.set.call(this, next);
      },
    });
  }

  const ctxProto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  if (!ctxProto) return;

  const originalDrawImage = ctxProto.drawImage;
  ctxProto.drawImage = function (image, ...args) {
    if (this.canvas && this.canvas.id === 'invCanvas' && isInvadersPlayerShipImage(image)) {
      const cannon = cannonImages[cannonLevel - 1];
      if (cannon && cannon.complete && cannon.naturalWidth > 0 && args.length >= 4) {
        const dx = Number(args[0]);
        const dy = Number(args[1]);
        const dw = Number(args[2]);
        const dh = Number(args[3]);
        if ([dx, dy, dw, dh].every(Number.isFinite)) {
          const targetH = dh + Math.min(18, (cannonLevel - 1) * 2);
          const targetW = cannon.naturalWidth * (targetH / cannon.naturalHeight);
          const cx = dx + dw / 2;
          const bottom = dy + dh;
          this.save();
          this.imageSmoothingEnabled = false;
          this.shadowBlur = 10 + cannonLevel * 2;
          this.shadowColor = cannonLevel >= 8 ? '#ff4fd1' : cannonLevel >= 5 ? '#f7c948' : '#2ee8ff';
          originalDrawImage.call(this, cannon, cx - targetW / 2, bottom - targetH, targetW, targetH);
          this.restore();
          return;
        }
      }
    }
    return originalDrawImage.call(this, image, ...args);
  };

  const originalArc = ctxProto.arc;
  ctxProto.arc = function (x, y, radius, ...args) {
    pendingBombArc = null;
    if (
      this.canvas &&
      this.canvas.id === 'invCanvas' &&
      Math.abs(Number(radius) - 18) < 0.75 &&
      this.fillStyle === '#ff6b2b' &&
      this.shadowColor === '#ff6b2b' &&
      Number(this.shadowBlur) >= 20
    ) {
      pendingBombArc = { x: Number(x), y: Number(y), radius: Number(radius), skin: getActiveBombSkin() };
    }
    return originalArc.call(this, x, y, radius, ...args);
  };

  const originalFill = ctxProto.fill;
  ctxProto.fill = function (...args) {
    if (pendingBombArc && this.canvas && this.canvas.id === 'invCanvas') {
      const bomb = bombImages[pendingBombArc.skin % bombImages.length];
      if (bomb && bomb.complete && bomb.naturalWidth > 0) {
        const t = performance.now() * 0.001;
        const size = pendingBombArc.radius * (3.15 + pendingBombArc.skin * 0.22) * (1 + Math.sin(t * 10) * 0.08);
        const ratio = bomb.naturalWidth / bomb.naturalHeight;
        const visualW = ratio >= 1 ? size : size * ratio;
        const visualH = ratio >= 1 ? size / ratio : size;
        this.save();
        this.translate(pendingBombArc.x, pendingBombArc.y);
        this.rotate(Math.sin(t * 7 + pendingBombArc.y * 0.03) * 0.18);
        this.imageSmoothingEnabled = false;
        this.globalCompositeOperation = 'screen';
        this.shadowBlur = 22 + pendingBombArc.skin * 8;
        this.shadowColor = pendingBombArc.skin === 2 ? '#ff2ed1' : pendingBombArc.skin === 1 ? '#ff6b2b' : '#f7c948';
        originalDrawImage.call(this, bomb, -visualW / 2, -visualH / 2, visualW, visualH);
        this.restore();
        pendingBombArc = null;
        return;
      }
    }
    pendingBombArc = null;
    return originalFill.call(this, ...args);
  };

  const originalFillText = ctxProto.fillText;
  ctxProto.fillText = function (text, ...args) {
    if (this.canvas && this.canvas.id === 'invCanvas') {
      const label = String(text || '');
      if (label.includes('Choose an upgrade')) {
        upgradePromptSeenUntil = performance.now() + 8000;
      } else if (label === 'Press Start' || label === 'GAME OVER') {
        setCannonLevel(1);
      }
    }
    return originalFillText.call(this, text, ...args);
  };

  const originalStrokeRect = ctxProto.strokeRect;
  ctxProto.strokeRect = function (x, y, w, h) {
    if (this.canvas && this.canvas.id === 'invCanvas' && w <= 54 && h <= 42 && x >= -8 && y >= -8) {
      return;
    }
    return originalStrokeRect.apply(this, arguments);
  };

  const originalFillRect = ctxProto.fillRect;
  ctxProto.fillRect = function (x, y, w, h) {
    const explosionKind =
      this.canvas &&
      this.canvas.id === 'invCanvas' &&
      Number(this.globalAlpha) < 0.99 &&
      Number(w) <= 8 &&
      Number(h) <= 8
        ? classifyExplosionSprite(this.fillStyle)
        : null;
    if (explosionKind) {
      drawExplosionSpriteParticle(this, Number(x), Number(y), Number(w), Number(h), explosionKind);
      rememberBackgroundHitPulse(Number(x), Number(y), this.fillStyle, explosionKind === 'btc' ? 1.35 : 1);
    }

    const isInvadersFullBackground =
      this.canvas &&
      this.canvas.id === 'invCanvas' &&
      x === 0 &&
      y === 0 &&
      w === this.canvas.width &&
      h === this.canvas.height &&
      typeof this.fillStyle !== 'string';

    const result = originalFillRect.apply(this, arguments);
    if (!isInvadersFullBackground) return result;

    const time = performance.now() * 0.001;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const colors = ['#ff3158', '#ffd43b', '#2ee8ff', '#ad5cff', '#42f56c', '#ff2ed1'];

    this.save();
    this.globalCompositeOperation = 'screen';
    for (let i = 0; i < colors.length; i++) {
      const t = time * (0.25 + i * 0.08) + i * 1.7;
      const gx = W * (0.5 + Math.sin(t) * (0.36 - i * 0.018));
      const gy = H * (0.42 + Math.cos(t * 1.31) * (0.32 - i * 0.012));
      const radius = 120 + Math.sin(time * (0.47 + i * 0.09) + i) * 28;
      const grad = this.createRadialGradient(gx, gy, 0, gx, gy, radius);
      grad.addColorStop(0, colors[i] + '55');
      grad.addColorStop(0.42, colors[(i + 2) % colors.length] + '20');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      this.fillStyle = grad;
      originalFillRect.call(this, 0, 0, W, H);
    }
    drawReactiveBackgroundPulses(this, W, H);
    this.restore();
    return result;
  };
})();
