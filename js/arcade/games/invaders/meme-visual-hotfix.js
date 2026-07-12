(function () {
  if (typeof window === 'undefined' || window.__INVADERS_MEME_VISUAL_HOTFIX__) return;
  window.__INVADERS_MEME_VISUAL_HOTFIX__ = true;

  const CANNON_LEVEL_COUNT = 9;
  const CANNON_VERSION = 'bitcoin-cannon-levels-20260712';
  const CANNON_BASE = '/art/invaders/generated/';
  let cannonLevel = 1;
  let upgradePromptSeenUntil = 0;

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
    this.restore();
    return result;
  };
})();
