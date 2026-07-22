(function () {
  if (typeof window === 'undefined' || window.__INVADERS_BTC_BUNKER_VISUAL_FIX__) return;
  window.__INVADERS_BTC_BUNKER_VISUAL_FIX__ = true;

  const ASSET_BASE = '/art/invaders/generated/';
  const VERSION = 'btc-bunker-visual-fix-20260722';
  const bunkerImages = Array.from({ length: 10 }, (_, index) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = `${ASSET_BASE}invaders-btc-${index + 1}.png?v=${VERSION}`;
    return image;
  });

  let queuedBlocks = [];
  let flushQueued = false;
  const maxBlocksBySlot = new Map();

  function parseGreenHealth(fillStyle) {
    const fill = String(fillStyle || '').replace(/\s+/g, '').toLowerCase();
    let green = null;

    let match = fill.match(/^rgb\((\d+),(\d+),(\d+)\)$/);
    if (match) {
      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);
      if (r === 0 && b === 0 && g >= 80) green = g;
    }

    match = fill.match(/^#([0-9a-f]{6})$/);
    if (match) {
      const r = parseInt(match[1].slice(0, 2), 16);
      const g = parseInt(match[1].slice(2, 4), 16);
      const b = parseInt(match[1].slice(4, 6), 16);
      if (r === 0 && b === 0 && g >= 80) green = g;
    }

    match = fill.match(/^#([0-9a-f]{3})$/);
    if (match) {
      const r = parseInt(match[1][0] + match[1][0], 16);
      const g = parseInt(match[1][1] + match[1][1], 16);
      const b = parseInt(match[1][2] + match[1][2], 16);
      if (r === 0 && b === 0 && g >= 80) green = g;
    }

    if (green === null) return null;
    return Math.max(0, Math.min(1, (green - 100) / 85));
  }

  function isBunkerRect(ctx, x, y, w, h) {
    if (!ctx || !ctx.canvas || ctx.canvas.id !== 'invCanvas') return false;
    const image = bunkerImages[0];
    if (!image || !image.complete || image.naturalWidth <= 0) return false;

    const nx = Number(x);
    const ny = Number(y);
    const nw = Number(w);
    const nh = Number(h);
    if (![nx, ny, nw, nh].every(Number.isFinite)) return false;
    if (nw < 8 || nw > 16 || nh < 6 || nh > 12) return false;
    if (ny < ctx.canvas.height - 150 || ny > ctx.canvas.height - 85) return false;
    return parseGreenHealth(ctx.fillStyle) !== null;
  }

  function queueBlock(ctx, x, y, w, h) {
    queuedBlocks.push({
      ctx,
      x: Number(x),
      y: Number(y),
      w: Number(w),
      h: Number(h),
      health: parseGreenHealth(ctx.fillStyle) ?? 1,
    });
    if (!flushQueued) {
      flushQueued = true;
      queueMicrotask(flushBunkers);
    }
  }

  function groupBlocks(blocks) {
    const sorted = blocks.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const groups = [];
    for (const block of sorted) {
      let group = groups[groups.length - 1];
      if (!group || block.x - group.maxX > 24) {
        group = { blocks: [], minX: block.x, minY: block.y, maxX: block.x + block.w, maxY: block.y + block.h };
        groups.push(group);
      }
      group.blocks.push(block);
      group.minX = Math.min(group.minX, block.x);
      group.minY = Math.min(group.minY, block.y);
      group.maxX = Math.max(group.maxX, block.x + block.w);
      group.maxY = Math.max(group.maxY, block.y + block.h);
    }
    return groups.slice(0, 4);
  }

  function drawBunker(ctx, group, slot) {
    const maxSeen = Math.max(maxBlocksBySlot.get(slot) || 0, group.blocks.length);
    maxBlocksBySlot.set(slot, maxSeen);

    const colorHealth = group.blocks.reduce((sum, block) => sum + block.health, 0) / Math.max(1, group.blocks.length);
    const countHealth = group.blocks.length / Math.max(1, maxSeen);
    const health = Math.max(0, Math.min(1, Math.min(colorHealth, countHealth)));
    if (health <= 0.02) return;

    const stage = Math.max(0, Math.min(9, Math.floor((1 - health) * 10)));
    const image = bunkerImages[stage] || bunkerImages[0];
    if (!image || !image.complete || image.naturalWidth <= 0) return;

    const oldW = group.maxX - group.minX;
    const oldH = group.maxY - group.minY;
    const ratio = image.naturalWidth / image.naturalHeight;
    const targetH = Math.max(54, Math.min(72, oldH + 34));
    const targetW = Math.min(oldW + 56, targetH * ratio);
    const cx = group.minX + oldW / 2;
    const bottom = group.maxY + 17;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5 + health * 0.5;
    ctx.shadowBlur = 14 + (1 - health) * 18;
    ctx.shadowColor = health < 0.45 ? '#ff9b00' : '#ffd84d';
    originalDrawImage.call(ctx, image, cx - targetW / 2, bottom - targetH, targetW, targetH);
    ctx.restore();
  }

  function flushBunkers() {
    flushQueued = false;
    const blocks = queuedBlocks;
    queuedBlocks = [];
    if (!blocks.length) return;

    const byCanvas = new Map();
    for (const block of blocks) {
      const canvas = block.ctx && block.ctx.canvas;
      if (!canvas) continue;
      if (!byCanvas.has(canvas)) byCanvas.set(canvas, []);
      byCanvas.get(canvas).push(block);
    }

    for (const canvasBlocks of byCanvas.values()) {
      const ctx = canvasBlocks[0].ctx;
      groupBlocks(canvasBlocks).forEach((group, index) => drawBunker(ctx, group, index));
    }
  }

  const proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  if (!proto) return;

  const originalFillRect = proto.fillRect;
  const originalDrawImage = proto.drawImage;

  proto.fillRect = function (x, y, w, h) {
    if (isBunkerRect(this, x, y, w, h)) {
      queueBlock(this, x, y, w, h);
      return;
    }
    return originalFillRect.apply(this, arguments);
  };
})();
