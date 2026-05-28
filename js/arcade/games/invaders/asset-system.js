/**
 * asset-system.js - presentation-only sprite atlas support for Invaders 3008.
 *
 * The maps below are the single source of truth for sheet crops. Rendering code
 * must request a named rect and fall back to primitives when a sheet or rect is
 * unavailable; gameplay sizes, collision, timing, and hitboxes stay elsewhere.
 */

export const INVADERS_ASSET_PATHS = {
  enemies: '/games/invaders-3008/assets/enemies/enemy-sheet.png',
  bosses: '/games/invaders-3008/assets/bosses/boss-sheet.png',
  fx: '/games/invaders-3008/assets/fx/projectile-fx-sheet.png',
  ships: '/games/invaders-3008/assets/ships/player-ship-sheet.png',
  ui: '/games/invaders-3008/assets/ui/remaining-game-assets.png',
};

const rect = (x, y, w, h) => ({ x, y, w, h });

export const INVADERS_ATLAS_RECTS = {
  enemies: {
    basic: rect(34, 24, 82, 64),
    fast: rect(166, 29, 106, 56),
    tank: rect(312, 22, 116, 70),
    shooter: rect(463, 25, 90, 68),
    shield: rect(35, 137, 86, 70),
    bomber: rect(160, 138, 104, 70),
    hunter: rect(315, 140, 100, 70),
    zigzag: rect(461, 140, 96, 70),
    splitter: rect(35, 255, 82, 66),
    healer: rect(161, 254, 106, 68),
    sniper: rect(306, 272, 124, 38),
    kamikaze: rect(456, 256, 108, 68),
    cloaked: rect(43, 371, 74, 66),
    golden: rect(174, 366, 98, 68),
    cursed: rect(448, 366, 108, 74),
    mini_boss: rect(315, 140, 100, 70),
  },
  bosses: {
    theWall: rect(8, 48, 126, 38),
    theSplitter: rect(17, 119, 46, 44),
    theSniper: rect(12, 185, 130, 34),
    theSwarmKing: rect(21, 244, 48, 38),
    theGlitchCore: rect(22, 318, 100, 28),
    default: rect(18, 430, 84, 30),
  },
  ships: {
    player: rect(92, 24, 110, 34),
    drone: rect(296, 166, 178, 34),
    life: rect(302, 264, 236, 44),
  },
  fx: {
    bomb: rect(506, 70, 44, 48),
    hitFlash: rect(364, 198, 114, 66),
    particle: rect(264, 404, 110, 32),
  },
  ui: {
    upgradeCommon: rect(386, 118, 50, 78),
    upgradeRare: rect(438, 118, 50, 78),
    upgradeEpic: rect(490, 118, 50, 78),
    warning: rect(38, 120, 98, 72),
  },
};

function canUseImage() {
  return typeof Image !== 'undefined';
}

function loadSheet(src) {
  if (!canUseImage()) return { image: null, status: 'unsupported', src };
  const sheet = { image: new Image(), status: 'loading', src };
  sheet.image.onload = () => {
    sheet.source = createColorKeyCanvas(sheet.image);
    sheet.status = 'loaded';
  };
  sheet.image.onerror = () => { sheet.status = 'error'; };
  sheet.image.decoding = 'async';
  sheet.image.src = src;
  return sheet;
}

function createColorKeyCanvas(image) {
  if (typeof document === 'undefined') return image;
  const canvas = document.createElement('canvas');
  const width = image.naturalWidth || image.width || 0;
  const height = image.naturalHeight || image.height || 0;
  if (!width || !height) return image;
  canvas.width = width;
  canvas.height = height;
  const canvasCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!canvasCtx) return image;
  canvasCtx.drawImage(image, 0, 0);
  const pixels = canvasCtx.getImageData(0, 0, width, height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] <= 10 && data[i + 1] <= 10 && data[i + 2] <= 12) {
      data[i + 3] = 0;
    }
  }
  canvasCtx.putImageData(pixels, 0, 0);
  return canvas;
}

function rectFitsImage(image, crop) {
  const width = image.naturalWidth || image.width || 0;
  const height = image.naturalHeight || image.height || 0;
  return crop.x >= 0 && crop.y >= 0 && crop.w > 0 && crop.h > 0 &&
    crop.x + crop.w <= width && crop.y + crop.h <= height;
}

export function createInvadersAssetSystem(paths = INVADERS_ASSET_PATHS, maps = INVADERS_ATLAS_RECTS) {
  const sheets = {};
  for (const key in paths) {
    if (Object.prototype.hasOwnProperty.call(paths, key)) {
      sheets[key] = loadSheet(paths[key]);
    }
  }

  function getRect(sheetName, rectName) {
    return maps[sheetName] ? maps[sheetName][rectName] : null;
  }

  function draw(ctx, sheetName, rectName, dx, dy, dw, dh, options = {}) {
    const sheet = sheets[sheetName];
    const crop = getRect(sheetName, rectName);
    const image = sheet && sheet.image;
    if (!image || sheet.status !== 'loaded' || !crop || !rectFitsImage(image, crop)) return false;

    ctx.save();
    if (options.alpha !== undefined) ctx.globalAlpha *= options.alpha;
    if (options.glowColor) {
      ctx.shadowBlur = options.glowBlur || 0;
      ctx.shadowColor = options.glowColor;
    }
    ctx.drawImage(sheet.source || image, crop.x, crop.y, crop.w, crop.h, dx, dy, dw, dh);
    ctx.restore();
    return true;
  }

  function drawCentered(ctx, sheetName, rectName, cx, cy, targetW, targetH, options = {}) {
    const crop = getRect(sheetName, rectName);
    if (!crop) return false;
    const scale = Math.min(targetW / crop.w, targetH / crop.h);
    const dw = crop.w * scale;
    const dh = crop.h * scale;
    return draw(ctx, sheetName, rectName, cx - dw / 2, cy - dh / 2, dw, dh, options);
  }

  function getDebugInfo() {
    const sheetInfo = {};
    for (const key in sheets) {
      if (!Object.prototype.hasOwnProperty.call(sheets, key)) continue;
      const sheet = sheets[key];
      sheetInfo[key] = {
        src: sheet.src,
        status: sheet.status,
        width: sheet.image ? sheet.image.naturalWidth || sheet.image.width || 0 : 0,
        height: sheet.image ? sheet.image.naturalHeight || sheet.image.height || 0 : 0,
      };
    }

    return {
      paths: { ...paths },
      sheets: sheetInfo,
      maps,
    };
  }

  const api = { draw, drawCentered, getRect, getDebugInfo, maps, paths, sheets };
  if (typeof window !== 'undefined') {
    window.__INVADERS_3008_ATLAS__ = api;
  }
  return api;
}
