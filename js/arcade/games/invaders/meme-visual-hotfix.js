(function () {
  if (typeof window === 'undefined' || window.__INVADERS_RANDOM_ASSET_LAYER__) return;
  window.__INVADERS_RANDOM_ASSET_LAYER__ = true;

  const ASSET_VERSION = 'invaders-no-outline-stable-20260716';
  const BUNKER_VERSION = 'btc-bunkers-20260722';
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
  const bunkerImages = Array.from({ length: 10 }, (_, index) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = `${ASSET_BASE}invaders-btc-${index + 1}.png?v=${BUNKER_VERSION}`;
    return image;
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
  let bunkerBlocks = [];
  let bunkerFlushQueued = false;
  const bunkerSlotMaxBlocks = new Map();

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

  function bunkerStageLoaded() {
    const image = bunkerImages[0];
    return image && image.complete && image.naturalWidth > 0;
  }

  function isBunkerBlockRect(ctx, x, y, w, h) {
    if (!ctx || !ctx.canvas || ctx.canvas.id !== 'invCanvas') return false;
    if (!bunkerStageLoaded()) return false;
    const fill = String(ctx.fillStyle || '').replace(/\s+/g, '');
    const nx = Number(x);
    const ny = Number(y);
    const nw = Number(w);
    const nh = Number(h);
    if (![nx, ny, nw, nh].every(Number.isFinite)) return false;
    if (!/^rgb\(0,\d+,0\)$/.test(fill)) return false;
    if (nw < 4 || nw > 16 || nh < 4 || nh > 14) return false;
    return ny > ctx.canvas.height * 0.58 && ny < ctx.canvas.height - 58;
  }

  function queueBunkerBlock(ctx, x, y, w, h) {
    const fill = String(ctx.fillStyle || '').replace(/\s+/g, '');
    const green = Number((fill.match(/^rgb\(0,(\d+),0\)$/) || [])[1] || 185);
    bunkerBlocks.push({
      ctx,
      x: Number(x),
      y: Number(y),
      w: Number(w),
      h: Number(h),
      health: Math.max(0, Math.min(1, (green - 100) / 85)),
    });

    if (!bunkerFlushQueued) {
      bunkerFlushQueued = true;
      queueMicrotask(flushBtcBunkers);
    }
  }

  function groupBunkerBlocks(blocks) {
    const sorted = blocks.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const groups = [];
    for (const block of sorted) {
      let group = groups[groups.length - 1];
      if (!group || block.x - group.maxX > 22) {
        group = { blocks: [], minX: block.x, minY: block.y, maxX: block.x + block.w, maxY: block.y + block.h };
        groups.push(group);
      }
      group.blocks.push(block);
      group.minX = Math.min(group.minX, block.x);
      group.minY = Math.min(group.minY, block.y);
      group.maxX = Math.max(group.maxX, block.x + block.w);
      group.maxY = Math.max(group.maxY, block.y + block.h);
    }
    return groups;
  }

  function drawBtcBunker(ctx, group, slotIndex) {
    const maxSeen = Math.max(bunkerSlotMaxBlocks.get(slotIndex) || 0, group.blocks.length);
    bunkerSlotMaxBlocks.set(slotIndex, maxSeen);

    const avgColorHealth = group.blocks.reduce((sum, block) => sum + block.health, 0) / Math.max(1, group.blocks.length);
    const countHealth = group.blocks.length / Math.max(1, maxSeen);
    const healthRatio = Math.max(0, Math.min(1, Math.min(avgColorHealth, countHealth)));
    if (healthRatio <= 0.025) return;

    const damageRatio = 1 - healthRatio;
    const stage = Math.max(0, Math.min(9, Math.floor(damageRatio * 10)));
    const image = bunkerImages[stage] || bunkerImages[0];
    if (!image || !image.complete || image.naturalWidth <= 0) return;

    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const oldW = group.maxX - group.minX;
    const oldH = group.maxY - group.minY;
    const targetH = Math.max(oldH + 22, Math.min(70, oldW * 0.82));
    const targetW = Math.min(oldW + 44, targetH * sourceRatio);
    const cx = group.minX + oldW / 2;
    const bottom = group.maxY + 13;
    const time = performance.now() * 0.001;
    const pulse = 0.96 + Math.sin(time * 5 + slotIndex * 1.7) * 0.025;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.45 + healthRatio * 0.55;
    ctx.shadowBlur = 12 + damageRatio * 20;
    ctx.shadowColor = damageRatio > 0.5 ? '#ffb000' : '#ffd84d';
    previousDrawImage.call(
      ctx,
      image,
      cx - (targetW * pulse) / 2,
      bottom - targetH * pulse,
      targetW * pulse,
      targetH * pulse,
    );
    ctx.restore();
  }

  function flushBtcBunkers() {
    bunkerFlushQueued = false;
    const blocks = bunkerBlocks;
    bunkerBlocks = [];
    if (!blocks.length) return;

    const byCanvas = new Map();
    for (const block of blocks) {
      const key = block.ctx && block.ctx.canvas;
      if (!key) continue;
      if (!byCanvas.has(key)) byCanvas.set(key, []);
      byCanvas.get(key).push(block);
    }

    for (const canvasBlocks of byCanvas.values()) {
      const ctx = canvasBlocks[0].ctx;
      groupBunkerBlocks(canvasBlocks).slice(0, 4).forEach((group, index) => {
        drawBtcBunker(ctx, group, index);
      });
    }
  }

  const proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  if (!proto) return;

  const previousFillText = proto.fillText;
  const previousDrawImage = proto.drawImage;
  const previousStrokeRect = proto.strokeRect;
  const previousStroke = proto.stroke;
  const previousFillRect = proto.fillRect;

  proto.fillRect = function (x, y, w, h) {
    if (isBunkerBlockRect(this, x, y, w, h)) {
      queueBunkerBlock(this, x, y, w, h);
      return;
    }
    return previousFillRect.apply(this, arguments);
  };

  proto.drawImage = function (image, ...args) {
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
