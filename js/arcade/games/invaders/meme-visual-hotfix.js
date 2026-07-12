(function () {
  if (typeof window === 'undefined' || window.__INVADERS_MEME_BOSS_PNG_LAYER__) return;
  window.__INVADERS_MEME_BOSS_PNG_LAYER__ = true;

  const BOSS_VERSION = 'meme-boss-pngs-20260712';
  const BOSS_BASE = '/art/invaders/generated/';
  const bossConfigs = [
    {
      labels: ['CYBER TROLL', 'THE WALL'],
      file: 'corrupted cyber troll enemy boss.png',
      color: '#56f0ff',
      secondary: '#ff3158',
      width: 142,
      height: 92,
      effect: 'firewall',
    },
    {
      labels: ['CORRUPT APE', 'THE SPLITTER'],
      file: 'corrupted meme ape boss.png',
      color: '#ff9b2f',
      secondary: '#42f56c',
      width: 118,
      height: 92,
      effect: 'clone',
    },
    {
      labels: ['LASER CAT', 'THE SNIPER'],
      file: 'corrupted meme cat boss.png',
      color: '#ff3fd4',
      secondary: '#ffffff',
      width: 130,
      height: 88,
      effect: 'target',
    },
    {
      labels: ['SHIBA WARLORD', 'THE SWARM KING'],
      file: 'shiba meme warrior boss-1.png',
      color: '#f7c948',
      secondary: '#ff6b2b',
      width: 124,
      height: 92,
      effect: 'pack',
    },
    {
      labels: ['GLITCH UNICORN', 'THE GLITCH CORE'],
      file: 'corrupted meme unicorn enemy boss.png',
      color: '#ad5cff',
      secondary: '#2ee8ff',
      width: 132,
      height: 96,
      effect: 'glitch',
    },
    {
      labels: ['SHIBA DOOM RIDER', 'THE BOMBER'],
      file: 'shiba meme warrior boss-2.png',
      color: '#ff3158',
      secondary: '#ffd43b',
      width: 132,
      height: 96,
      effect: 'bomb',
    },
  ].map((config) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = `${BOSS_BASE}${encodeURI(config.file)}?v=${BOSS_VERSION}`;
    return { ...config, image };
  });

  function findBossConfig(label) {
    const text = String(label || '').toUpperCase();
    return bossConfigs.find((config) => config.labels.some((item) => text === item || text.includes(item)));
  }

  function effect(ctx, config, cx, top, width, height, time) {
    const bottom = top + height;
    const pulse = 0.5 + Math.sin(time * 7.5) * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineWidth = 2;
    ctx.strokeStyle = config.color;
    ctx.fillStyle = config.color;
    ctx.shadowBlur = 24 + pulse * 22;
    ctx.shadowColor = config.color;
    if (config.effect === 'firewall') {
      for (let i = 0; i < 4; i++) ctx.fillRect(cx - width * 0.62, top + 8 + i * (height / 4) + Math.sin(time * 5 + i) * 2, width * 1.24, 2);
      ctx.globalAlpha = 0.22;
      ctx.strokeRect(cx - width * 0.62, top + 2, width * 1.24, height - 4);
    } else if (config.effect === 'clone') {
      ctx.globalAlpha = 0.22;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + dir * (width * 0.36 + pulse * 8), top + height * 0.5, 18 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (config.effect === 'target') {
      ctx.globalAlpha = 0.32;
      for (let r = 18; r <= 52; r += 17) {
        ctx.beginPath();
        ctx.arc(cx, top + height * 0.5, r + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillRect(cx - 1, top - 7, 2, height + 14);
      ctx.fillRect(cx - width * 0.55, top + height * 0.5 - 1, width * 1.1, 2);
    } else if (config.effect === 'pack') {
      ctx.globalAlpha = 0.28;
      for (let i = 0; i < 5; i++) {
        const x = cx - width * 0.46 + i * width * 0.23;
        ctx.beginPath();
        ctx.moveTo(x, bottom + 8);
        ctx.lineTo(x + 8, bottom + 20 + Math.sin(time * 10 + i) * 4);
        ctx.lineTo(x + 16, bottom + 8);
        ctx.stroke();
      }
    } else if (config.effect === 'glitch') {
      ctx.globalAlpha = 0.34;
      for (let i = 0; i < 7; i++) {
        ctx.strokeStyle = i % 2 ? config.secondary : config.color;
        const y = top + 6 + i * 12;
        ctx.beginPath();
        ctx.moveTo(cx - width * 0.6 + Math.sin(time * 14 + i) * 8, y);
        ctx.lineTo(cx + width * 0.6 + Math.cos(time * 11 + i) * 8, y + Math.sin(time * 8 + i) * 4);
        ctx.stroke();
      }
    } else if (config.effect === 'bomb') {
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 6; i++) {
        const angle = time * 2.2 + i * Math.PI / 3;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * (width * 0.45), top + height * 0.5 + Math.sin(angle) * (height * 0.36), 5 + pulse * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawBoss(ctx, config, cx, labelY, drawImage) {
    const image = config && config.image;
    if (!image || !image.complete || image.naturalWidth <= 0) return;
    const time = performance.now() * 0.001;
    const top = Number(labelY) + 14;
    const pulse = 1 + Math.sin(time * 5.5 + cx * 0.01) * 0.045;
    const shake = config.effect === 'glitch' ? Math.sin(time * 37) * 4 : 0;
    const visualW = config.width * pulse;
    const visualH = config.height * pulse;
    const x = Number(cx) - visualW / 2 + shake;
    const y = top - Math.max(18, visualH * 0.2) + Math.sin(time * 4.2) * 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 20 + Math.sin(time * 8) * 6;
    ctx.shadowColor = config.color;
    effect(ctx, config, Number(cx), y, visualW, visualH, time);
    drawImage.call(ctx, image, x, y, visualW, visualH);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = config.secondary;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 3, y - 3, visualW + 6, visualH + 6);
    ctx.restore();
  }

  const proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  if (!proto) return;
  const previousFillText = proto.fillText;
  const drawImage = proto.drawImage;
  proto.fillText = function (text, ...args) {
    if (this.canvas && this.canvas.id === 'invCanvas') {
      const config = findBossConfig(text);
      if (config && args.length >= 2) drawBoss(this, config, Number(args[0]), Number(args[1]), drawImage);
    }
    return previousFillText.call(this, text, ...args);
  };
})();
