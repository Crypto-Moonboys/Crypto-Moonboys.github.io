(function () {
  if (typeof window === 'undefined' || window.__INVADERS_MEME_VISUAL_HOTFIX__) return;
  window.__INVADERS_MEME_VISUAL_HOTFIX__ = true;

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
