(function () {
  if (typeof window === 'undefined' || window.__INVADERS_RANDOM_ASSET_LAYER__) return;
  window.__INVADERS_RANDOM_ASSET_LAYER__ = true;

  const ASSET_VERSION = 'invaders-random-assets-20260716';
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
  const invaderColors = [
    '#ff3158', '#ffd43b', '#ff6b2b', '#ff2ed1', '#ad5cff',
    '#2ee8ff', '#ff4fd1', '#ff7849', '#9cff31', '#f7c948',
  ];
  const invaderImages = invaderFiles.map((file) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = `${ASSET_BASE}${encodeURIComponent(file)}?v=${ASSET_VERSION}`;
    return { file, image };
  });
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
  const invaderSkinByCell = new Map();

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

    ctx.globalAlpha = 0.2 + pulse * 0.15;
    ctx.strokeRect(cx - w * 0.56, y - 4, w * 1.12, h + 8);
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
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = config.secondary;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 4, y - 4, visualW + 8, visualH + 8);
    ctx.restore();
  }

  function isOldMemeInvaderImage(image) {
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

  function chooseInvaderSkin(x, y, w, h) {
    const gridX = Math.round(Number(x) / 6);
    const gridY = Math.round(Number(y) / 6);
    const key = `${gridX}|${gridY}|${Math.round(Number(w))}|${Math.round(Number(h))}`;
    let skin = invaderSkinByCell.get(key);
    if (skin === undefined) {
      const seed = Math.abs(Math.sin(gridX * 12.9898 + gridY * 78.233 + Number(w) * 4.17) * 43758.5453);
      skin = Math.floor((seed - Math.floor(seed)) * invaderImages.length) % invaderImages.length;
      invaderSkinByCell.set(key, skin);
      if (invaderSkinByCell.size > 220) {
        const first = invaderSkinByCell.keys().next().value;
        invaderSkinByCell.delete(first);
      }
    }
    return skin;
  }

  function drawInvaderAura(ctx, x, y, w, h, skin) {
    const color = invaderColors[skin % invaderColors.length];
    const time = performance.now() * 0.001;
    const pulse = 0.5 + Math.sin(time * 7 + skin) * 0.5;
    const cx = Number(x) + Number(w) / 2;
    const cy = Number(y) + Number(h) / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.22 + pulse * 0.16;
    ctx.shadowBlur = 8 + pulse * 10;
    ctx.shadowColor = color;
    if (skin % 4 === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(w, h) * (0.58 + pulse * 0.12), 0, Math.PI * 2);
      ctx.stroke();
    } else if (skin % 4 === 1) {
      ctx.strokeRect(Number(x) - 3 - pulse * 2, Number(y) - 3 - pulse * 2, Number(w) + 6 + pulse * 4, Number(h) + 6 + pulse * 4);
    } else if (skin % 4 === 2) {
      for (let i = 0; i < 4; i++) {
        const a = time * 3 + skin + i * Math.PI / 2;
        ctx.fillRect(cx + Math.cos(a) * 20 - 1, cy + Math.sin(a) * 15 - 1, 3, 3);
      }
    } else {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - 22, cy + i * 7 + pulse * 2);
        ctx.lineTo(cx + 22, cy + i * 7 - pulse * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  if (!proto) return;

  const previousFillText = proto.fillText;
  const previousDrawImage = proto.drawImage;
  proto.drawImage = function (image, ...args) {
    if (this.canvas && this.canvas.id === 'invCanvas' && isOldMemeInvaderImage(image) && args.length >= 4) {
      const dx = Number(args[0]);
      const dy = Number(args[1]);
      const dw = Number(args[2]);
      const dh = Number(args[3]);
      if ([dx, dy, dw, dh].every(Number.isFinite)) {
        const skin = chooseInvaderSkin(dx, dy, dw, dh);
        const replacement = invaderImages[skin] && invaderImages[skin].image;
        if (replacement && replacement.complete && replacement.naturalWidth > 0) {
          const ratio = replacement.naturalWidth / replacement.naturalHeight;
          const targetH = Math.max(34, dh * 1.42);
          const targetW = Math.min(54, targetH * ratio);
          const cx = dx + dw / 2;
          const cy = dy + dh / 2;
          drawInvaderAura(this, dx, dy, dw, dh, skin);
          this.save();
          this.imageSmoothingEnabled = false;
          this.filter = `drop-shadow(0 0 7px ${invaderColors[skin % invaderColors.length]})`;
          previousDrawImage.call(this, replacement, cx - targetW / 2, cy - targetH / 2, targetW, targetH);
          this.restore();
          return;
        }
      }
    }
    return previousDrawImage.call(this, image, ...args);
  };

  proto.fillText = function (text, ...args) {
    if (this.canvas && this.canvas.id === 'invCanvas' && isBossLabel(text) && args.length >= 2) {
      const config = chooseBossConfig(text, Number(args[0]), Number(args[1]));
      drawBossPng(this, config, Number(args[0]), Number(args[1]), previousDrawImage);
    }
    return previousFillText.call(this, text, ...args);
  };
})();
