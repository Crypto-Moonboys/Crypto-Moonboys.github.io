(function () {
  if (typeof window === 'undefined' || window.__INVADERS_RANDOM_ASSET_LAYER__) return;
  window.__INVADERS_RANDOM_ASSET_LAYER__ = true;

  const ASSET_VERSION = 'invaders-lean-sprites-20260716';
  const ASSET_BASE = '/art/invaders/generated/';
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

  const proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  if (!proto) return;

  const previousFillText = proto.fillText;
  const previousDrawImage = proto.drawImage;

  proto.fillText = function (text, ...args) {
    if (this.canvas && this.canvas.id === 'invCanvas' && isBossLabel(text) && args.length >= 2) {
      const config = chooseBossConfig(text, Number(args[0]), Number(args[1]));
      drawBossPng(this, config, Number(args[0]), Number(args[1]), previousDrawImage);
    }
    return previousFillText.call(this, text, ...args);
  };
})();
