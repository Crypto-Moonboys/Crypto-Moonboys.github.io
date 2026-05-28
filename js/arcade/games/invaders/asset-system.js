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
    basic: rect(0, 0, 144, 88),
    fast: rect(144, 0, 144, 88),
    tank: rect(288, 0, 144, 88),
    shooter: rect(432, 0, 144, 88),
    shield: rect(0, 116, 144, 88),
    bomber: rect(144, 116, 144, 88),
    hunter: rect(288, 116, 144, 88),
    zigzag: rect(432, 116, 144, 88),
    splitter: rect(0, 232, 144, 88),
    healer: rect(144, 232, 144, 88),
    sniper: rect(288, 232, 144, 88),
    kamikaze: rect(432, 232, 144, 88),
    cloaked: rect(0, 348, 144, 88),
    golden: rect(144, 348, 144, 88),
    cursed: rect(432, 348, 144, 88),
    mini_boss: rect(288, 116, 144, 88),
  },
  bosses: {
    theWall: rect(4, 46, 126, 40),
    theSplitter: rect(14, 110, 52, 54),
    theSniper: rect(12, 178, 122, 42),
    theSwarmKing: rect(14, 240, 58, 60),
    theGlitchCore: rect(14, 308, 112, 48),
    theBomber: rect(12, 374, 136, 58),
    default: rect(12, 426, 88, 36),
  },
  ships: {
    player: rect(92, 24, 110, 34),
    drone: rect(296, 166, 178, 34),
    life: rect(302, 264, 236, 44),
  },
  fx: {
    playerBullet: rect(12, 70, 92, 34),
    enemyBullet: rect(296, 66, 76, 62),
    bomb: rect(506, 70, 44, 48),
    powerupRapid: rect(24, 296, 28, 28),
    powerupSpread: rect(58, 296, 28, 28),
    powerupShield: rect(430, 198, 48, 54),
    powerupMultiplier: rect(218, 292, 84, 34),
    powerupSlow: rect(372, 292, 116, 58),
    hitFlash: rect(364, 198, 114, 66),
    particle: rect(264, 404, 110, 32),
    asteroid: rect(24, 146, 86, 86),
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
  sheet.image.onload = () => { sheet.status = 'loaded'; };
  sheet.image.onerror = () => { sheet.status = 'error'; };
  sheet.image.decoding = 'async';
  sheet.image.src = src;
  return sheet;
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
    ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, dx, dy, dw, dh);
    ctx.restore();
    return true;
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

  const api = { draw, getRect, getDebugInfo, maps, paths, sheets };
  if (typeof window !== 'undefined') {
    window.__INVADERS_3008_ATLAS__ = api;
  }
  return api;
}
