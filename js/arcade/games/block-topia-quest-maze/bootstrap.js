/**
 * bootstrap.js — Block Topia Quest Maze game module
 *
 * Self-contained Phaser 3 RPG dungeon-crawler. Contains all game scenes,
 * constants, utilities, and the arcade bootstrap lifecycle.
 *
 * Exported entry point: bootstrapBlockTopiaQuestMaze(root)
 * Called by game-shell.js via mountGame().
 *
 * Integrations:
 *  - /js/arcade-sync.js        (local high-score persistence)
 *  - /js/leaderboard-client.js (remote score submission)
 *  - /js/game-fullscreen.js    (fullscreen shell lifecycle hooks)
 *
 * Note: Phaser 3 is loaded as a classic CDN script before this module runs.
 */

import { BTQM_CONFIG }     from './config.js';
import { GameRegistry } from '/js/arcade/core/game-registry.js';
import { createGameAdapter, registerGameAdapter } from '/js/arcade/engine/game-adapter.js';

import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { createBtqmAudio } from './arcade-audio-btqm.js';
import { createFxSystem } from './fx-system.js';
import { recordRunStats, checkMilestones } from './meta-system.js';

// ─── ZONE DEFINITIONS ────────────────────────────────────────────────────────
const ZONES = [
  {
    id: 0, name: 'HODL or FOLD', subtitle: 'The Market Floor',
    floorColor: 0x2d4a1e, wallColor: 0x1a2e11, bgColor: 0x0d1a07, accentColor: 0x4caf50,
    enemies: [
      { name: 'Paper Hand Goblin', maxHp: 35, atk: 7,  def: 2, xp: 30,  gold: 8  },
      { name: 'FUD Spreader',      maxHp: 45, atk: 9,  def: 3, xp: 40,  gold: 10 },
    ],
    boss: { name: 'Paper Hand King', maxHp: 120, atk: 14, def: 5, xp: 150, gold: 40 },
    clearScore: 100,
  },
  {
    id: 1, name: 'Bear Market Siege', subtitle: 'The Frozen Cavern',
    floorColor: 0x1a2a4a, wallColor: 0x0d1929, bgColor: 0x060e1a, accentColor: 0x3498db,
    enemies: [
      { name: 'Bear Soldier',    maxHp: 65, atk: 12, def: 6, xp: 60, gold: 18 },
      { name: 'Market Crasher',  maxHp: 55, atk: 16, def: 3, xp: 70, gold: 20 },
    ],
    boss: { name: 'The Bear Lord', maxHp: 200, atk: 22, def: 8, xp: 280, gold: 80 },
    clearScore: 200,
  },
  {
    id: 2, name: 'FOMO Plague Escape', subtitle: 'The Panic Wastes',
    floorColor: 0x3d1454, wallColor: 0x230a30, bgColor: 0x0f0518, accentColor: 0x9b59b6,
    enemies: [
      { name: 'FOMO Ghost',    maxHp: 70, atk: 13, def: 4, xp: 75, gold: 22 },
      { name: 'Panic Seller',  maxHp: 80, atk: 15, def: 5, xp: 85, gold: 25 },
    ],
    boss: { name: 'FOMO Phantom Prime', maxHp: 260, atk: 28, def: 9, xp: 350, gold: 100 },
    clearScore: 350,
  },
  {
    id: 3, name: 'Rug Pull Recovery', subtitle: 'The Ruined Vaults',
    floorColor: 0x4a2a0a, wallColor: 0x2e1a06, bgColor: 0x120a03, accentColor: 0xe67e22,
    enemies: [
      { name: 'Rug Puller',    maxHp: 90, atk: 17, def: 6, xp: 100, gold: 28 },
      { name: 'Exit Scammer',  maxHp: 80, atk: 20, def: 4, xp: 95,  gold: 26 },
    ],
    boss: { name: 'The Rug Lord', maxHp: 320, atk: 30, def: 11, xp: 430, gold: 120 },
    clearScore: 500,
  },
  {
    id: 4, name: "Whale Lord's Challenge", subtitle: 'The Deep Sea Vault',
    floorColor: 0x0a2a4a, wallColor: 0x061929, bgColor: 0x030c15, accentColor: 0x1abc9c,
    enemies: [
      { name: 'Whale Minion',         maxHp: 120, atk: 20, def: 11, xp: 130, gold: 38 },
      { name: 'Market Manipulator',   maxHp: 100, atk: 24, def: 8,  xp: 140, gold: 42 },
    ],
    boss: { name: 'The Whale Lord', maxHp: 420, atk: 38, def: 16, xp: 580, gold: 160 },
    clearScore: 750,
  },
  {
    id: 5, name: 'Moon Mission', subtitle: 'The Final Ascent',
    floorColor: 0x1a1a3a, wallColor: 0x0a0a1e, bgColor: 0x030309, accentColor: 0xf39c12,
    enemies: [
      { name: 'NGMI Wraith',      maxHp: 140, atk: 26, def: 9,  xp: 150, gold: 48 },
      { name: 'Anti-Moon Troll',  maxHp: 160, atk: 24, def: 13, xp: 145, gold: 45 },
    ],
    boss: { name: 'NGMI Overlord', maxHp: 550, atk: 45, def: 20, xp: 800, gold: 220 },
    clearScore: 1000,
  },
];

// ─── ZONE MAPS (15 columns × 10 rows) ────────────────────────────────────────
// Tile codes: 0=wall, 1=floor, 2=encounter, 3=boss, 4=exit, 9=start
const ZONE_MAPS = [
  // Zone 0: HODL or FOLD
  [
    [0,0,0,0,0,0,0,4,0,0,0,0,0,0,0],
    [0,1,1,1,1,0,0,1,0,0,1,1,1,1,0],
    [0,1,2,1,1,0,0,1,0,0,1,3,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
    [0,1,1,1,1,0,0,1,0,0,1,1,1,1,0],
    [0,1,2,1,1,0,0,1,0,0,1,2,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
    [0,0,0,9,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Zone 1: Bear Market Siege — redesigned for full reachability
  [
    [0,0,0,0,0,0,0,0,4,0,0,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,2,1,1,1,0,0,0,1,1,1,2,1,0],
    [0,1,1,1,0,1,3,1,0,1,0,1,1,1,0],
    [0,1,0,1,0,1,1,1,0,1,0,1,0,1,0],
    [0,1,0,1,1,1,0,0,0,1,1,1,0,1,0],
    [0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,0,2,0,0,0,0,0,0,0,2,0,1,0],
    [0,1,9,1,1,1,1,1,1,1,1,1,1,1,0],
  ],
  // Zone 2: FOMO Plague Escape — enc at (8,3) connected via col 7
  [
    [0,0,4,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,1,0,0,1,1,1,1,1,0,0,1,0],
    [0,1,0,1,1,1,1,0,0,0,1,1,1,1,0],
    [0,1,2,0,0,0,1,1,2,0,0,0,0,1,0],
    [0,1,1,1,0,0,1,0,0,0,1,1,1,1,0],
    [0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,1,1,1,0,0,1,3,0,0,1,1,1,1,0],
    [0,1,0,0,0,1,1,0,0,1,0,0,2,1,0],
    [0,1,1,1,1,1,0,0,0,1,1,1,1,1,0],
    [0,0,0,0,0,9,0,0,0,0,0,0,0,0,0],
  ],
  // Zone 3: Rug Pull Recovery — boss col connected to corridor
  [
    [0,0,0,0,0,0,4,0,0,0,0,0,0,0,0],
    [0,1,1,1,0,0,1,0,0,1,1,1,1,1,0],
    [0,1,0,1,0,0,1,0,0,1,0,0,0,1,0],
    [0,1,2,1,1,1,1,1,1,1,1,3,0,1,0],
    [0,1,0,0,0,0,1,0,0,0,0,0,0,1,0],
    [0,1,1,1,1,0,1,0,1,1,1,1,1,1,0],
    [0,0,0,0,1,0,1,0,1,0,0,2,0,0,0],
    [0,1,1,1,1,1,1,1,1,0,1,1,1,1,0],
    [0,1,2,0,0,0,0,0,1,0,1,0,2,1,0],
    [0,1,9,0,0,0,0,0,0,0,1,1,1,1,0],
  ],
  // Zone 4: Whale Lord's Challenge
  [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,1,1,1,0,1,0,1,1,1,1,1,0],
    [0,1,2,0,0,1,0,1,0,1,0,0,2,1,0],
    [0,1,0,0,0,1,1,1,1,1,0,0,0,1,0],
    [0,1,1,1,0,0,0,1,0,0,0,1,1,1,0],
    [0,0,0,1,1,1,0,1,0,1,1,1,0,0,0],
    [0,1,1,1,0,1,1,1,1,1,0,1,1,1,0],
    [0,1,2,0,0,0,0,3,0,0,0,0,2,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,4,0,0,0,0,9,0,0,0,0,0,0,0],
  ],
  // Zone 5: Moon Mission
  [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,4,0],
    [0,1,1,1,1,0,1,1,1,1,0,1,1,1,0],
    [0,1,2,0,1,0,1,0,0,1,0,1,2,0,0],
    [0,1,0,0,1,1,1,0,0,1,1,1,0,0,0],
    [0,1,1,1,0,0,1,2,0,0,0,1,1,1,0],
    [0,0,0,1,1,0,1,0,0,0,0,0,0,1,0],
    [0,1,1,1,1,1,1,0,1,1,1,1,1,1,0],
    [0,1,3,0,0,0,1,0,1,0,0,0,2,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,0,0,0,9,0,0,0,0,0,0,0,0,0],
  ],
];

const TILE_SIZE = 40;
const GAME_ID = BTQM_CONFIG.id;
const FULL_CLEAR_BONUS = 900;
const MISS_HIT_VOLUME = 0.02;
const ENEMY_CRIT_VOLUME = 0.03;
const ENEMY_HIT_VOLUME = 0.02;

const BTQM_ASSET_MANIFEST_URL = '/art/btqm/manifest.json';
const BTQM_ASSET_KEY_PREFIX = 'btqm_generated_';
const BTQM_SAFE_ASSET_CATEGORIES = new Set(['icons', 'ui', 'objects', 'fx', 'player', 'enemies', 'bosses', 'tilesets']);
const BTQM_PLAYER_SHEET_IDS = new Set(['player-idle', 'player-walk', 'player-attack', 'player-hurt']);
const BTQM_FX_SHEET_IDS = new Set(['fx-slash', 'fx-crit', 'fx-poison', 'fx-bleed', 'fx-shield', 'fx-treasure']);
const BTQM_TILESET_FRAME_SIZE = 32;
const BTQM_TILESET_FRAMES = {
  floor: 0,
  wall: 1,
  encounter: 2,
  boss: 3,
  entry: 4,
  exit: 5,
};

const BTQM_PLAYER_ANIMATIONS = {
  'player-idle': { key: 'btqm-player-idle', frameRate: 4, repeat: -1 },
  'player-walk': { key: 'btqm-player-walk', frameRate: 8, repeat: -1 },
  'player-attack': { key: 'btqm-player-attack', frameRate: 10, repeat: 0 },
  'player-hurt': { key: 'btqm-player-hurt', frameRate: 8, repeat: 0 },
};

const BTQM_FX_ANIMATIONS = {
  'fx-slash': { key: 'btqm-fx-slash', frameRate: 16, repeat: 0 },
  'fx-crit': { key: 'btqm-fx-crit', frameRate: 16, repeat: 0 },
  'fx-poison': { key: 'btqm-fx-poison', frameRate: 12, repeat: 0 },
  'fx-bleed': { key: 'btqm-fx-bleed', frameRate: 12, repeat: 0 },
  'fx-shield': { key: 'btqm-fx-shield', frameRate: 12, repeat: 0 },
  'fx-treasure': { key: 'btqm-fx-treasure', frameRate: 12, repeat: 0 },
};

function warnBtqmAsset(message, detail) {
  if (detail) console.warn('[BTQM assets] ' + message, detail);
  else console.warn('[BTQM assets] ' + message);
}

function btqmAssetKey(id) {
  return BTQM_ASSET_KEY_PREFIX + String(id || '').replace(/[^a-z0-9_-]/gi, '_');
}

function getBtqmAssetRegistry(scene) {
  const existing = scene.registry.get('btqmAssets');
  if (existing) return existing;
  const registry = { manifestLoaded: false, generated: {}, objectTextures: {}, tilesets: {}, playerSheets: {}, playerFrameCounts: {}, playerAnimations: {}, fxSheets: {}, fxFrameCounts: {}, fxAnimations: {}, enemySheets: {}, enemyFrameCounts: {}, enemyAnimations: {}, bossSheets: {}, bossFrameCounts: {}, bossAnimations: {}, ui: {}, icons: {} };
  scene.registry.set('btqmAssets', registry);
  return registry;
}

function isBtqmGeneratedAsset(asset) {
  return !!(asset && asset.status === 'generated' && BTQM_SAFE_ASSET_CATEGORIES.has(asset.category));
}

function isValidBtqmGeneratedAssetPath(asset) {
  const output = asset && typeof asset.output === 'string' ? asset.output : '';
  return /^art\/btqm\/generated\/[a-z0-9/_-]+\.png$/i.test(output) &&
    !output.includes('..') &&
    !/[?#\\]/.test(output);
}

function getBtqmAssetUrl(asset) {
  return '/' + asset.output.replace(/^\/+/, '');
}

function isValidBtqmTileset(asset) {
  if (!asset || asset.category !== 'tilesets') return false;
  const size = asset.size || {};
  return size.width === 256 && size.height === 256 &&
    size.width % BTQM_TILESET_FRAME_SIZE === 0 &&
    size.height % BTQM_TILESET_FRAME_SIZE === 0;
}

function isValidBtqmTilesetZoneId(zoneId) {
  return Number.isInteger(zoneId) && zoneId >= 0 && zoneId < ZONES.length;
}

function isValidBtqmPlayerSheet(asset) {
  if (!asset || !BTQM_PLAYER_SHEET_IDS.has(asset.id)) return false;
  const size = asset.size || {};
  return size.height === 32 && size.width >= 32 && size.width % 32 === 0;
}

function getBtqmFrameCount(asset) {
  const size = asset && asset.size ? asset.size : {};
  return Math.floor((size.width || 0) / 32);
}

function getBtqmSheetFrameSize(asset) {
  const size = asset && asset.size ? asset.size : {};
  const manifestFrameWidth = asset && (asset.frameWidth || asset.frame?.width || size.frameWidth);
  const manifestFrameHeight = asset && (asset.frameHeight || asset.frame?.height || size.frameHeight);
  const frameHeight = Number(manifestFrameHeight || size.height || 0);
  const frameWidth = Number(manifestFrameWidth || (frameHeight > 0 ? frameHeight : 32));
  return { frameWidth, frameHeight };
}

function getBtqmSheetFrameCount(asset) {
  const size = asset && asset.size ? asset.size : {};
  const { frameWidth } = getBtqmSheetFrameSize(asset);
  if (!frameWidth || frameWidth < 1) return 0;
  return Math.floor((size.width || 0) / frameWidth);
}

function isValidBtqmCharacterSheet(asset, category) {
  if (!asset || asset.category !== category) return false;
  const size = asset.size || {};
  const { frameWidth, frameHeight } = getBtqmSheetFrameSize(asset);
  return frameHeight > 0 && frameWidth > 0 && size.height === frameHeight && size.width >= frameWidth && size.width % frameWidth === 0 && getBtqmSheetFrameCount(asset) >= 1;
}

function isValidBtqmFxSheet(asset) {
  if (!asset || !BTQM_FX_SHEET_IDS.has(asset.id)) return false;
  const size = asset.size || {};
  return size.height === 32 && size.width >= 32 && size.width % 32 === 0 && getBtqmFrameCount(asset) >= 1;
}

function markTextureNearest(scene, key) {
  const texture = scene.textures && scene.textures.exists(key) ? scene.textures.get(key) : null;
  if (texture && typeof texture.setFilter === 'function' && Phaser.Textures && Phaser.Textures.FilterMode) {
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

function registerBtqmAnimations(scene) {
  const assets = getBtqmAssetRegistry(scene);
  Object.keys(assets.playerSheets).forEach((id) => {
    const anim = BTQM_PLAYER_ANIMATIONS[id];
    const textureKey = assets.playerSheets[id];
    const frameCount = assets.playerFrameCounts[id] || 0;
    if (!anim || !textureKey || frameCount < 1 || !scene.textures.exists(textureKey) || scene.anims.exists(anim.key)) return;
    scene.anims.create({
      key: anim.key,
      frames: scene.anims.generateFrameNumbers(textureKey, {
        start: 0,
        end: frameCount - 1,
      }),
      frameRate: anim.frameRate,
      repeat: anim.repeat,
    });
    assets.playerAnimations[id] = anim.key;
  });
  Object.keys(assets.fxSheets).forEach((id) => {
    const anim = BTQM_FX_ANIMATIONS[id];
    const textureKey = assets.fxSheets[id];
    const frameCount = assets.fxFrameCounts[id] || 0;
    if (!anim || !textureKey || frameCount < 1 || !scene.textures.exists(textureKey) || scene.anims.exists(anim.key)) return;
    scene.anims.create({
      key: anim.key,
      frames: scene.anims.generateFrameNumbers(textureKey, {
        start: 0,
        end: frameCount - 1,
      }),
      frameRate: anim.frameRate,
      repeat: anim.repeat,
    });
    assets.fxAnimations[id] = anim.key;
  });
  Object.keys(assets.enemySheets).forEach((id) => {
    const textureKey = assets.enemySheets[id];
    const frameCount = assets.enemyFrameCounts[id] || 0;
    const animKey = 'btqm-' + id + '-idle';
    if (!textureKey || frameCount < 1 || !scene.textures.exists(textureKey) || scene.anims.exists(animKey)) return;
    scene.anims.create({
      key: animKey,
      frames: scene.anims.generateFrameNumbers(textureKey, {
        start: 0,
        end: frameCount - 1,
      }),
      frameRate: 6,
      repeat: -1,
    });
    assets.enemyAnimations[id] = animKey;
  });
  Object.keys(assets.bossSheets).forEach((id) => {
    const textureKey = assets.bossSheets[id];
    const frameCount = assets.bossFrameCounts[id] || 0;
    const animKey = 'btqm-' + id + '-idle';
    if (!textureKey || frameCount < 1 || !scene.textures.exists(textureKey) || scene.anims.exists(animKey)) return;
    scene.anims.create({
      key: animKey,
      frames: scene.anims.generateFrameNumbers(textureKey, {
        start: 0,
        end: frameCount - 1,
      }),
      frameRate: 5,
      repeat: -1,
    });
    assets.bossAnimations[id] = animKey;
  });
}

function getBtqmTexture(scene, fallbackKey, objectId) {
  const assets = getBtqmAssetRegistry(scene);
  const generatedKey = objectId ? assets.objectTextures[objectId] : null;
  return generatedKey && scene.textures.exists(generatedKey) ? generatedKey : fallbackKey;
}

function getBtqmTilesetTexture(scene, zoneId) {
  const assets = getBtqmAssetRegistry(scene);
  const generatedKey = assets.tilesets[zoneId];
  return generatedKey && scene.textures.exists(generatedKey) ? generatedKey : null;
}

function getBtqmTileSpriteFrame(scene, zoneId, tile) {
  const textureKey = getBtqmTilesetTexture(scene, zoneId);
  if (!textureKey) return null;
  if (tile === 0) return { textureKey, frame: BTQM_TILESET_FRAMES.wall };
  if (tile === 2) return { textureKey, frame: BTQM_TILESET_FRAMES.encounter };
  if (tile === 3) return { textureKey, frame: BTQM_TILESET_FRAMES.boss };
  if (tile === 4) return { textureKey, frame: BTQM_TILESET_FRAMES.exit };
  if (tile === 9) return { textureKey, frame: BTQM_TILESET_FRAMES.entry };
  return { textureKey, frame: BTQM_TILESET_FRAMES.floor };
}

function getBtqmTileDebugFallback(scene, zoneId, tile) {
  if (tile === 0) return 'tile_wall_' + zoneId;
  if (tile === 2) return getBtqmTexture(scene, 'tile_enc_' + zoneId, 'object-encounter-marker');
  if (tile === 3) return getBtqmTexture(scene, 'tile_boss_' + zoneId, 'object-boss-marker');
  if (tile === 4) return getBtqmTexture(scene, 'tile_exit', 'object-exit-portal');
  if (tile === 9) return getBtqmTexture(scene, 'tile_entry', 'object-entry-glyph');
  return 'tile_floor_' + zoneId;
}

function addBtqmMapTileSprite(scene, zoneId, tile, x, y, size) {
  const tileFrame = getBtqmTileSpriteFrame(scene, zoneId, tile);
  const fallbackKey = getBtqmTileDebugFallback(scene, zoneId, tile);
  const sprite = tileFrame
    ? scene.add.image(x, y, tileFrame.textureKey, tileFrame.frame)
    : scene.add.image(x, y, fallbackKey);
  if (tileFrame && typeof window !== 'undefined') window.BTQM_TILESET_RENDER_ACTIVE = true;
  sprite.setDisplaySize(size, size);
  sprite.setDepth(tileFrame ? 2 : 1);
  if (!tileFrame) {
    const debugBg = scene.add.rectangle(x, y, size, size, 0x4d174f, 0.42).setDepth(0);
    sprite.setData('btqmDebugBg', debugBg);
    sprite.setTint(0xff66ff);
  }
  return sprite;
}

function setBtqmTileSpriteTexture(scene, sprite, zoneId, tile, fallbackKey) {
  if (!sprite) return;
  const tileFrame = getBtqmTileSpriteFrame(scene, zoneId, tile);
  let debugBg = sprite.getData ? sprite.getData('btqmDebugBg') : null;
  if (tileFrame) {
    sprite.setTexture(tileFrame.textureKey, tileFrame.frame);
    sprite.clearTint();
    sprite.setDepth(2);
    if (debugBg) debugBg.setVisible(false);
    if (typeof window !== 'undefined') window.BTQM_TILESET_RENDER_ACTIVE = true;
    return;
  }
  if (!debugBg || !debugBg.active) {
    debugBg = scene.add.rectangle(
      sprite.x,
      sprite.y,
      Math.max(1, Math.round(sprite.displayWidth || TILE_SIZE)),
      Math.max(1, Math.round(sprite.displayHeight || TILE_SIZE)),
      0x4d174f,
      0.42
    ).setDepth(0);
    if (sprite.setData) sprite.setData('btqmDebugBg', debugBg);
  } else {
    debugBg.setVisible(true);
  }
  sprite.setTexture(fallbackKey || getBtqmTileDebugFallback(scene, zoneId, tile));
  sprite.setTint(0xff66ff);
  sprite.setDepth(1);
}

function btqmSlug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function getBtqmEnemyTexture(scene, enemyId) {
  const assets = getBtqmAssetRegistry(scene);
  const generatedKey = enemyId ? assets.enemySheets[enemyId] : null;
  return generatedKey && scene.textures.exists(generatedKey) ? generatedKey : null;
}

function getBtqmBossTexture(scene, bossId) {
  const assets = getBtqmAssetRegistry(scene);
  const generatedKey = bossId ? assets.bossSheets[bossId] : null;
  return generatedKey && scene.textures.exists(generatedKey) ? generatedKey : null;
}

function playBtqmGeneratedCharacterAnim(scene, sprite, animKey) {
  if (!sprite || !sprite.anims || !animKey || !scene.anims.exists(animKey)) return false;
  sprite.play(animKey, true);
  return true;
}

function addBtqmEnemySprite(scene, x, y, enemyId, fallbackKey) {
  const assets = getBtqmAssetRegistry(scene);
  const textureKey = getBtqmEnemyTexture(scene, enemyId) || fallbackKey;
  const sprite = scene.add.sprite(x, y, textureKey);
  markTextureNearest(scene, textureKey);
  playBtqmGeneratedCharacterAnim(scene, sprite, enemyId ? assets.enemyAnimations[enemyId] : null);
  return sprite;
}

function addBtqmBossSprite(scene, x, y, bossId, fallbackKey) {
  const assets = getBtqmAssetRegistry(scene);
  const textureKey = getBtqmBossTexture(scene, bossId) || fallbackKey;
  const sprite = scene.add.sprite(x, y, textureKey);
  markTextureNearest(scene, textureKey);
  playBtqmGeneratedCharacterAnim(scene, sprite, bossId ? assets.bossAnimations[bossId] : null);
  return sprite;
}

function getBtqmPlayerTexture(scene) {
  const assets = getBtqmAssetRegistry(scene);
  const generatedKey = assets.playerSheets['player-idle'];
  return generatedKey && scene.textures.exists(generatedKey) ? generatedKey : 'player';
}

function playBtqmPlayerAnim(scene, sprite, id, fallbackId) {
  if (!sprite || !sprite.anims) return false;
  const assets = getBtqmAssetRegistry(scene);
  const animKey = assets.playerAnimations[id] || assets.playerAnimations[fallbackId];
  if (!animKey || !scene.anims.exists(animKey)) return false;
  sprite.play(animKey, true);
  return true;
}

function addBtqmPlayerSprite(scene, x, y) {
  const textureKey = getBtqmPlayerTexture(scene);
  const sprite = scene.add.sprite(x, y, textureKey);
  markTextureNearest(scene, textureKey);
  playBtqmPlayerAnim(scene, sprite, 'player-idle');
  return sprite;
}

function preloadBtqmGeneratedAssets(scene) {
  const registry = getBtqmAssetRegistry(scene);
  const handleBtqmAssetLoadError = (file) => {
    const key = file && file.key ? file.key : '(unknown)';
    if (key === 'btqm_asset_manifest') warnBtqmAsset('manifest missing; using debug texture fallback.');
    else if (String(key).startsWith(BTQM_ASSET_KEY_PREFIX)) warnBtqmAsset('generated PNG missing; using debug texture fallback.', file.src || key);
  };

  scene.load.on('loaderror', handleBtqmAssetLoadError);
  scene.events.once('shutdown', () => {
    scene.load.off('loaderror', handleBtqmAssetLoadError);
  });

  scene.load.once('filecomplete-json-btqm_asset_manifest', () => {
    const manifest = scene.cache.json.get('btqm_asset_manifest');
    const assets = manifest && Array.isArray(manifest.assets) ? manifest.assets : [];
    registry.manifestLoaded = true;
    assets.filter(isBtqmGeneratedAsset).forEach((asset) => {
      if (!asset.output || !isValidBtqmGeneratedAssetPath(asset)) {
        warnBtqmAsset('generated manifest entry has invalid output path; skipping.', asset.id);
        return;
      }
      const textureKey = btqmAssetKey(asset.id);
      registry.generated[asset.id] = textureKey;

      if (asset.category === 'player') {
        if (!isValidBtqmPlayerSheet(asset)) {
          warnBtqmAsset('player sheet is not a valid 32px-high frame strip; keeping fallback.', asset.id);
          return;
        }
        registry.playerSheets[asset.id] = textureKey;
        registry.playerFrameCounts[asset.id] = getBtqmFrameCount(asset);
        scene.load.spritesheet(textureKey, getBtqmAssetUrl(asset), { frameWidth: 32, frameHeight: 32 });
        return;
      }

      if (asset.category === 'fx') {
        if (!isValidBtqmFxSheet(asset)) {
          warnBtqmAsset('FX sheet is not a valid 32px-high frame strip; keeping fallback.', asset.id);
          return;
        }
        registry.fxSheets[asset.id] = textureKey;
        registry.fxFrameCounts[asset.id] = getBtqmFrameCount(asset);
        scene.load.spritesheet(textureKey, getBtqmAssetUrl(asset), { frameWidth: 32, frameHeight: 32 });
        return;
      }

      if (asset.category === 'enemies') {
        if (!isValidBtqmCharacterSheet(asset, 'enemies')) {
          warnBtqmAsset('enemy sheet is not a valid frame strip; keeping debug fallback.', asset.id);
          return;
        }
        const { frameWidth, frameHeight } = getBtqmSheetFrameSize(asset);
        registry.enemySheets[asset.id] = textureKey;
        registry.enemyFrameCounts[asset.id] = getBtqmSheetFrameCount(asset);
        scene.load.spritesheet(textureKey, getBtqmAssetUrl(asset), { frameWidth, frameHeight });
        return;
      }

      if (asset.category === 'bosses') {
        if (!isValidBtqmCharacterSheet(asset, 'bosses')) {
          warnBtqmAsset('boss sheet is not a valid frame strip; keeping debug fallback.', asset.id);
          return;
        }
        const { frameWidth, frameHeight } = getBtqmSheetFrameSize(asset);
        registry.bossSheets[asset.id] = textureKey;
        registry.bossFrameCounts[asset.id] = getBtqmSheetFrameCount(asset);
        scene.load.spritesheet(textureKey, getBtqmAssetUrl(asset), { frameWidth, frameHeight });
        return;
      }

      if (asset.category === 'tilesets') {
        if (!isValidBtqmTilesetZoneId(asset.zoneId)) {
          warnBtqmAsset('tileset has invalid zoneId; keeping debug tile fallback.', asset.id);
          return;
        }
        if (registry.tilesets[asset.zoneId]) {
          warnBtqmAsset('duplicate tileset zone registration; keeping first generated tileset.', asset.id);
          return;
        }
        if (!isValidBtqmTileset(asset)) {
          warnBtqmAsset('tileset is not a valid 256px 32x32 sheet; keeping debug tile fallback.', asset.id);
          return;
        }
        registry.tilesets[asset.zoneId] = textureKey;
        scene.load.spritesheet(textureKey, getBtqmAssetUrl(asset), { frameWidth: BTQM_TILESET_FRAME_SIZE, frameHeight: BTQM_TILESET_FRAME_SIZE });
        return;
      }

      if (asset.category === 'objects') registry.objectTextures[asset.id] = textureKey;
      if (asset.category === 'ui') registry.ui[asset.id] = textureKey;
      if (asset.category === 'icons') registry.icons[asset.id] = textureKey;
      scene.load.image(textureKey, getBtqmAssetUrl(asset));
    });
  });

  scene.load.json('btqm_asset_manifest', BTQM_ASSET_MANIFEST_URL);
}

function finalizeBtqmGeneratedAssets(scene) {
  const assets = getBtqmAssetRegistry(scene);
  Object.values(assets.generated).forEach((key) => {
    if (scene.textures.exists(key)) markTextureNearest(scene, key);
  });
  registerBtqmAnimations(scene);
}

const btqmRuntime = {
  audio: null,
  runActive: false,
  runEnded: false,
  runSubmitted: false,
  score: 0,
  streak: 0,
  bossKills: 0,
  zoneClears: 0,
  battlesWon: 0,
  startedAt: 0,
  playerName: 'Guest',
  playerSurvived: true,
  // Director / meta tracking
  intensity: 0,
  highestIntensity: 0,
  upgradeCount: 0,
};

function getIdentityNameFallback() {
  const identity = typeof window !== 'undefined' ? window.MOONBOYS_IDENTITY : null;
  if (identity && typeof identity.getTelegramName === 'function') {
    const name = identity.getTelegramName();
    if (name && String(name).trim()) return String(name).trim();
  }
  return null;
}

function ensureAudio() {
  if (!btqmRuntime.audio) btqmRuntime.audio = createBtqmAudio();
  return btqmRuntime.audio;
}

function beginRun(playerName) {
  btqmRuntime.runActive = true;
  btqmRuntime.runEnded = false;
  btqmRuntime.runSubmitted = false;
  btqmRuntime.score = 0;
  btqmRuntime.streak = 0;
  btqmRuntime.bossKills = 0;
  btqmRuntime.zoneClears = 0;
  btqmRuntime.battlesWon = 0;
  btqmRuntime.startedAt = Date.now();
  btqmRuntime.playerSurvived = true;
  btqmRuntime.intensity = 0;
  btqmRuntime.highestIntensity = 0;
  btqmRuntime.upgradeCount = 0;
  btqmRuntime.playerName = String(playerName || getIdentityNameFallback() || ArcadeSync.getPlayer() || 'Guest');
}

function addRunScore(points) {
  const value = Math.max(0, Math.floor(Number(points) || 0));
  if (!value) return btqmRuntime.score;
  btqmRuntime.score += value;
  return btqmRuntime.score;
}

function syncDailyRunScore(daily) {
  if (!daily) return 0;
  daily.runScore = Math.max(0, Math.floor(btqmRuntime.score || 0));
  return daily.runScore;
}

function scoreForEncounter(enemy) {
  if (!enemy) return 0;
  const base = Math.floor((enemy.maxHp || 1) * 0.7 + (enemy.atk || 1) * 6 + (enemy.def || 0) * 4);
  return Math.max(18, base);
}

function scoreForBoss(zoneId) {
  const zone = ZONES[zoneId];
  const clearScore = zone ? zone.clearScore : 0;
  return Math.max(100, Math.floor(clearScore * 1.25));
}

function scoreForZoneClear(zoneId) {
  const zone = ZONES[zoneId];
  return zone ? Math.floor(zone.clearScore) : 0;
}

function scoreForSurvival(startedAt) {
  if (!startedAt) return 0;
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return Math.min(900, Math.floor(sec * 1.2));
}

function canSubmitIdentity() {
  if (typeof window === 'undefined') return false;
  const identity = window.MOONBOYS_IDENTITY;
  return !!(identity && typeof identity.isTelegramLinked === 'function' && identity.isTelegramLinked());
}

async function finalizeRunSubmission(force) {
  if (!btqmRuntime.runActive && !force) return;
  if (btqmRuntime.runSubmitted) return;
  btqmRuntime.score += scoreForSurvival(btqmRuntime.startedAt);
  const finalScore = Math.max(0, Math.floor(btqmRuntime.score || 0));
  btqmRuntime.runEnded = true;
  btqmRuntime.runSubmitted = true;
  btqmRuntime.runActive = false;
  const survivalSec = Math.max(0, Math.floor((Date.now() - (btqmRuntime.startedAt || Date.now())) / 1000));
  // Record run stats to per-game meta (maze_meta_v1)
  const runData = {
    score: finalScore,
    wave: btqmRuntime.zoneClears || 0,
    survival: survivalSec,
    bossesDefeated: btqmRuntime.bossKills || 0,
    upgradeCount: btqmRuntime.upgradeCount || 0,
    highestIntensity: btqmRuntime.highestIntensity || 0,
  };
  try {
    recordRunStats(runData);
    checkMilestones(runData);
  } catch (_) {}
  ArcadeSync.setPlayer(btqmRuntime.playerName || 'Guest');
  ArcadeSync.setHighScore(GAME_ID, finalScore);
  if (!canSubmitIdentity() || finalScore <= 0) return;
  await submitScore(btqmRuntime.playerName || 'Guest', finalScore, GAME_ID);
}

// ─── UTILITY FUNCTIONS ────────────────────────────────────────────────────────
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getUTCDate() {
  return new Date().toISOString().slice(0, 10);
}

function loadPlayer() {
  try {
    const raw = localStorage.getItem('btqm_player_v2');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return null;
}

function savePlayer(p) {
  try { localStorage.setItem('btqm_player_v2', JSON.stringify(p)); } catch(e) {}
}

function createPlayer(name) {
  return {
    name,
    level: 1,
    xp: 0,
    maxHp: 100,
    hp: 100,
    totalScore: 0,
    gold: 0,
    potions: 3,
    skillCharges: 2,
    lifetimeClears: 0,
    faction: 'hard-fork-rockers',
  };
}

function xpToNextLevel(level) {
  return level * 100;
}

function grantXP(player, amount) {
  player.xp += amount;
  while (player.xp >= xpToNextLevel(player.level)) {
    player.xp -= xpToNextLevel(player.level);
    player.level = Math.min(99, player.level + 1);
    player.maxHp = 100 + (player.level - 1) * 15;
    player.hp = player.maxHp;
  }
}

function loadDailyState() {
  const today = getUTCDate();
  try {
    const raw = localStorage.getItem('btqm_daily_v2_' + today);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.date === today) return s;
    }
  } catch(e) {}
  return {
    date: today,
    zoneClears: [false, false, false, false, false, false],
    runScore: 0,
    enemiesDefeated: 0,
    fullClearBonus: false,
    startedAt: Date.now(),
  };
}

function saveDailyState(s) {
  try { localStorage.setItem('btqm_daily_v2_' + s.date, JSON.stringify(s)); } catch(e) {}
}

function checkFullClear(daily) {
  if (daily.zoneClears.every(Boolean) && !daily.fullClearBonus) {
    daily.fullClearBonus = true;
    saveDailyState(daily);
    return true;
  }
  return false;
}

function exportWidgetData(player, daily) {
  const data = {
    playerName: player.name,
    level: player.level,
    dailyClears: daily.zoneClears.filter(Boolean).length,
    dailyScore: daily.runScore,
    zoneClears: daily.zoneClears,
    fullClear: daily.fullClearBonus,
    lastUpdated: Date.now(),
  };
  try { localStorage.setItem('btqm_widget_v1', JSON.stringify(data)); } catch(e) {}
}

function updateDailyBar(daily) {
  const bar = document.getElementById('btqm-daily-bar');
  if (!bar) return;
  const icons = daily.zoneClears.map((c, i) =>
    '<span class="btqm-zone-icon ' + (c ? 'cleared' : '') + '" title="' + ZONES[i].name + '">' + (c ? '✓' : String(i + 1)) + '</span>'
  ).join('');
  const bonus = daily.fullClearBonus ? '<span class="btqm-bonus-tag">2× FULL CLEAR!</span>' : '';
  const score = btqmRuntime.runActive
    ? Math.max(0, Math.floor(btqmRuntime.score || 0))
    : Math.max(0, Math.floor(daily.runScore || 0));
  bar.innerHTML = '<span class="btqm-bar-label">Today:</span> ' + icons + ' ' + bonus + ' <span class="btqm-score-tag">Score: ' + score + '</span>';
}

// ─── TEXTURE GENERATION HELPERS ──────────────────────────────────────────────

// Renders pixel-art rows into a Phaser texture.
// Every row string in `rows` must be the same length.
// Each character maps to a color in `palette`; '0' = transparent (skip).
function makeTexFromRows(scene, key, rows, palette, ps) {
  ps = ps || 4;
  const w = rows[0].length * ps;
  const h = rows.length * ps;
  const g = scene.add.graphics();
  rows.forEach((row, ry) => {
    for (let cx = 0; cx < row.length; cx++) {
      const ch = row[cx];
      if (ch === '0') continue;
      const col = palette[ch];
      if (col == null) continue;
      g.fillStyle(col, 1);
      g.fillRect(cx * ps, ry * ps, ps, ps);
    }
  });
  g.generateTexture(key, w, h);
  g.destroy();
}

// 8-wide × 8-tall enemy sprite
function genEnemyTex(scene, key, bodyColor, eyeColor, ps) {
  ps = ps || 4;
  makeTexFromRows(scene, key, [
    '0BBBBBB0',
    'BBBBBBBB',
    'BBEEBBBB',
    'BBEEBBBB',
    '0BBBBBB0',
    '0BBBBBB0',
    '0BB00BB0',
    '00B00B00',
  ], { B: bodyColor, E: eyeColor }, ps);
}

// 12-wide × 12-tall boss sprite (larger, crown on top)
function genBossTex(scene, key, bodyColor, eyeColor, crownColor, ps) {
  ps = ps || 4;
  makeTexFromRows(scene, key, [
    '000CCCC00000',
    '00CCCCCC0000',
    '0CCCCCCCC000',
    '0CBBBBBBCC00',
    '0CBEEBEBCC00',
    'CCBBBBBBBBCC',
    'CCBBBBBBBBCC',
    'CCBBBBBBBBCC',
    '0CCBBBBBBCC0',
    '00CCB00BCC00',
    '000B0000B000',
    '000B0000B000',
  ], { C: crownColor, B: bodyColor, E: eyeColor }, ps);
}

// Generates floor, wall, encounter, boss tiles for every zone + exit + entry
function genTiles(scene) {
  ZONES.forEach((zone, i) => {
    // Floor tile
    (function() {
      const g = scene.add.graphics();
      g.fillStyle(zone.floorColor, 1);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(0xffffff, 0.05);
      g.fillRect(0, 0, 32, 1);
      g.fillRect(0, 0, 1, 32);
      g.generateTexture('tile_floor_' + i, 32, 32);
      g.destroy();
    })();

    // Wall tile
    (function() {
      const g = scene.add.graphics();
      g.fillStyle(zone.wallColor, 1);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(0xffffff, 0.12);
      g.fillRect(0, 0, 32, 2);
      g.fillRect(0, 0, 2, 32);
      g.fillStyle(0x000000, 0.2);
      g.fillRect(30, 0, 2, 32);
      g.fillRect(0, 30, 32, 2);
      g.generateTexture('tile_wall_' + i, 32, 32);
      g.destroy();
    })();

    // Encounter tile (floor + red danger markers)
    (function() {
      const g = scene.add.graphics();
      g.fillStyle(zone.floorColor, 1);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(0xff0000, 0.18);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(0xff4444, 0.5);
      g.fillRect(4, 4, 24, 24);
      g.fillStyle(0xff0000, 0.3);
      g.fillRect(10, 10, 12, 12);
      g.generateTexture('tile_enc_' + i, 32, 32);
      g.destroy();
    })();

    // Boss tile (floor + gold border)
    (function() {
      const g = scene.add.graphics();
      g.fillStyle(zone.floorColor, 1);
      g.fillRect(0, 0, 32, 32);
      g.lineStyle(2, 0xf39c12, 0.9);
      g.strokeRect(2, 2, 28, 28);
      g.lineStyle(1, 0xf39c12, 0.4);
      g.strokeRect(5, 5, 22, 22);
      g.generateTexture('tile_boss_' + i, 32, 32);
      g.destroy();
    })();
  });

  // Exit tile (portal glow effect)
  (function() {
    const g = scene.add.graphics();
    g.fillStyle(0x030309, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x00ffff, 0.3);
    g.fillCircle(16, 16, 12);
    g.fillStyle(0x00ffff, 0.5);
    g.fillCircle(16, 16, 7);
    g.fillStyle(0x00ffff, 0.8);
    g.fillCircle(16, 16, 3);
    g.lineStyle(1, 0x00ffff, 0.6);
    g.strokeRect(1, 1, 30, 30);
    g.generateTexture('tile_exit', 32, 32);
    g.destroy();
  })();

  // Entry tile (player start — green glow)
  (function() {
    const g = scene.add.graphics();
    g.fillStyle(0x1a3a1a, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x00ff00, 0.2);
    g.fillCircle(16, 16, 10);
    g.lineStyle(1, 0x00ff00, 0.5);
    g.strokeRect(1, 1, 30, 30);
    g.generateTexture('tile_entry', 32, 32);
    g.destroy();
  })();
}



// Generates all sprite textures: player, zone enemies, bosses
function genSprites(scene) {
  // ── Player sprite (8×8 at ps=4 → 32×32) ──────────────────────────────────
  makeTexFromRows(scene, 'player', [
    '00AAAA00',
    '0AAAAAA0',
    '0BBBBBB0',
    '0BCBBCB0',
    '0BBBBBB0',
    '0DDDDDD0',
    '00DEDE00',
    '0E0000E0',
  ], { A: 0xf39c12, B: 0xf5cba7, C: 0x1a1a2e, D: 0x3498db, E: 0x1a1a2e }, 4);

  // ── Zone 0 — Hand-crafted pixel art ────────────────────────────────────────
  // enemy_0_0: Paper Hand Goblin
  makeTexFromRows(scene, 'enemy_0_0', [
    '0GGGGGG0',
    'GGGGGGGG',
    'GGWWWWGG',
    'GGWWWWGG',
    '0GGGGGG0',
    'G0GGGG0G',
    '0G0000G0',
    '00000000',
  ], { G: 0x27ae60, W: 0xffffff }, 4);

  // enemy_0_1: FUD Spreader
  makeTexFromRows(scene, 'enemy_0_1', [
    '0GGGGG00',
    '0GGGGG00',
    'GGGGGGG0',
    'GGWWWGG0',
    'GGGGGGG0',
    '0GGGGG00',
    'GG000GG0',
    '00000000',
  ], { G: 0x1e8449, W: 0xf39c12 }, 4);

  // boss_0: Paper Hand King (12×12 at ps=4 → 48×48)
  makeTexFromRows(scene, 'boss_0', [
    '000CCCCCC000',
    '00CCCCCCCC00',
    '0CCCCCCCCCC0',
    '0CCWWWWWWCC0',
    '0CCWCCCCWCC0',
    'CCCCCCCCCCCC',
    'CCGGGGGGGGCC',
    'CCGGGGGGGGCC',
    '0CCGGGGGGCC0',
    '00CCG00GCC00',
    '00G000000G00',
    '00G000000G00',
  ], { C: 0x27ae60, W: 0xffffff, G: 0x1e8449 }, 4);

  // ── Zones 1-5 — Generated sprites ─────────────────────────────────────────
  const zoneColors = [
    null,                                                        // zone 0 done above
    { body: 0x2980b9, eye: 0xeaf4fc, crown: 0x1a5276 },        // zone 1 blue
    { body: 0x8e44ad, eye: 0x00ffcc, crown: 0x6c3483 },        // zone 2 purple
    { body: 0xd35400, eye: 0xffd700, crown: 0xa04000 },        // zone 3 orange
    { body: 0x16a085, eye: 0x00ffff, crown: 0x0e6655 },        // zone 4 teal
    { body: 0xc0392b, eye: 0xf39c12, crown: 0x922b21 },        // zone 5 red/gold
  ];

  for (let i = 1; i <= 5; i++) {
    const c = zoneColors[i];
    genEnemyTex(scene, 'enemy_' + i + '_0', c.body, c.eye);
    // Second enemy variant: slightly darker body
    const darkerBody = blendColors(c.body, 0x000000, 0.25);
    genEnemyTex(scene, 'enemy_' + i + '_1', darkerBody, c.eye);
    genBossTex(scene, 'boss_' + i, c.body, c.eye, c.crown);
  }
}

// Blend two hex colors by ratio (0=a, 1=b)
function blendColors(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return (rr << 16) | (rg << 8) | rb;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE: BootScene — generates all textures, loads persistent state
// ─────────────────────────────────────────────────────────────────────────────
class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    // Texture generation happens here (Phaser graphics are available in preload).
    // These debug textures remain the boot-safe fallback for every runtime asset.
    genTiles(this);
    genSprites(this);
    preloadBtqmGeneratedAssets(this);
  }

  create() {
    finalizeBtqmGeneratedAssets(this);
    const player = loadPlayer();
    const daily  = loadDailyState();

    window.running = false;
    this.registry.set('player', player);
    this.registry.set('daily', daily);
    this.registry.set('currentZone', 0);

    updateDailyBar(daily);

    this.scene.start('TitleScene');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Returns the first accessible, uncleaned zone index for the current session.
// Zone 0 is always accessible. Zone i > 0 requires either lifetimeClears > 0
// or the previous zone to have been cleared today.
// ─────────────────────────────────────────────────────────────────────────────
function getFirstPlayableZone(player, daily) {
  for (let i = 0; i < ZONES.length; i++) {
    const accessible = i === 0 || (player && player.lifetimeClears > 0) || (daily.zoneClears[i - 1] === true);
    if (accessible && !daily.zoneClears[i]) return i;
  }
  return 0; // all zones cleared today — restart from zone 0
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE: TitleScene — title screen with HTML name-input overlay
// ─────────────────────────────────────────────────────────────────────────────
class TitleScene extends Phaser.Scene {
  constructor() { super('TitleScene'); }

  create() {
    const daily  = this.registry.get('daily');
    const player = this.registry.get('player');
    ensureAudio().setMusicLayer('world');

    // Signal to the fullscreen shell that the game is on the title screen.
    window.running = false;
    this.add.rectangle(320, 224, 640, 448, 0x030309);

    // Starfield
    const stars = this.add.graphics();
    for (let i = 0; i < 180; i++) {
      stars.fillStyle(0xffffff, Math.random() * 0.7 + 0.1);
      stars.fillRect(Phaser.Math.Between(0, 639), Phaser.Math.Between(0, 447), 1, 1);
    }

    // Glowing accent lines
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0xf39c12, 0.15);
    for (let y = 0; y < 448; y += 32) {
      gfx.lineBetween(0, y, 640, y);
    }
    for (let x = 0; x < 640; x += 32) {
      gfx.lineBetween(x, 0, x, 448);
    }

    // Title shadow
    this.add.text(322, 82, 'BLOCK TOPIA', {
      fontFamily: 'Courier New', fontSize: '38px', color: '#7d3800', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(322, 124, 'QUEST MAZE', {
      fontFamily: 'Courier New', fontSize: '38px', color: '#7d3800', fontStyle: 'bold'
    }).setOrigin(0.5);

    // Title text
    this.add.text(320, 80, 'BLOCK TOPIA', {
      fontFamily: 'Courier New', fontSize: '38px', color: '#f39c12', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(320, 122, 'QUEST MAZE', {
      fontFamily: 'Courier New', fontSize: '38px', color: '#f39c12', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(320, 160, 'A Crypto Moonboys RPG', {
      fontFamily: 'Courier New', fontSize: '14px', color: '#888888'
    }).setOrigin(0.5);

    // Daily status
    const cleared = daily.zoneClears.filter(Boolean).length;
    this.add.text(320, 190, 'Today: ' + cleared + '/6 zones cleared', {
      fontFamily: 'Courier New', fontSize: '13px', color: '#74b9ff'
    }).setOrigin(0.5);

    // Zone descriptions derived from ZONES constant (single source of truth)
    const zoneDescs = this.add.text(320, 230,
      ZONES.map((z, i) => 'Zone ' + (i + 1) + ': ' + z.name + ' — ' + z.subtitle).join('\n'),
    {
      fontFamily: 'Courier New', fontSize: '10px', color: '#666666', align: 'center',
      lineSpacing: 4
    }).setOrigin(0.5, 0);

    // Controls help
    this.add.text(320, 400, 'ARROWS/WASD — Move   ENTER/SPACE — Enter Zone   ESC — Main Menu', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#555555', align: 'center'
    }).setOrigin(0.5);

    this.add.text(320, 420, 'In battle: [1]Attack  [2]Skill  [3]Moon Strike  [4]Potion  [5]Flee', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#444444', align: 'center'
    }).setOrigin(0.5);

    // Blinking prompt
    const prompt = this.add.text(320, 380, '▶ Press ENTER or click to begin', {
      fontFamily: 'Courier New', fontSize: '13px', color: '#f39c12'
    }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Show the HTML overlay
    this.showNameOverlay(player, daily);
  }

  showNameOverlay(player, daily) {
    const overlay    = document.getElementById('btqm-name-overlay');
    const nameInput  = document.getElementById('btqm-name-input');
    const startBtn   = document.getElementById('btqm-start-btn');
    const continueBtn= document.getElementById('btqm-continue-btn');
    const preview    = document.getElementById('btqm-daily-preview');
    const errEl      = document.getElementById('btqm-name-err');

    const cleared = daily.zoneClears.filter(Boolean).length;
    preview.textContent = 'Daily Quest — ' + cleared + '/6 zones cleared today';

    if (player && player.name) {
      nameInput.value = player.name;
      continueBtn.style.display = 'inline-block';
      continueBtn.textContent = 'Continue as ' + player.name;
    } else {
      continueBtn.style.display = 'none';
    }

    overlay.style.display = 'flex';

    const doStart = () => {
      const name = nameInput.value.trim();
      if (name.length < 2 || name.length > 20) {
        errEl.style.display = 'block';
        return;
      }
      errEl.style.display = 'none';
      overlay.style.display = 'none';

      let p;
      if (!player || player.name !== name) {
        p = createPlayer(name);
      } else {
        p = { ...player };
        p.name = name;
        p.hp = p.maxHp;
      }
      savePlayer(p);
      this.registry.set('player', p);
      try { ArcadeSync.setPlayer(p.name); } catch(e) {}
      beginRun(p.name);

      const zoneId = getFirstPlayableZone(p, daily);
      this.registry.set('currentZone', zoneId);
      this.scene.start('ZoneScene', { zoneId });
    };

    // Remove old listeners to avoid duplicates if scene restarts
    const newStartBtn = startBtn.cloneNode(true);
    startBtn.parentNode.replaceChild(newStartBtn, startBtn);
    const newContBtn = continueBtn.cloneNode(true);
    continueBtn.parentNode.replaceChild(newContBtn, continueBtn);

    document.getElementById('btqm-start-btn').addEventListener('click', doStart);
    document.getElementById('btqm-continue-btn').addEventListener('click', doStart);

    document.getElementById('btqm-name-input').onkeydown = (e) => {
      if (e.key === 'Enter') doStart();
    };
  }

  shutdown() {
    // Hide overlay when scene shuts down
    const overlay = document.getElementById('btqm-name-overlay');
    if (overlay) overlay.style.display = 'none';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE: ZoneScene — tile-based dungeon explorer
// ─────────────────────────────────────────────────────────────────────────────
class ZoneScene extends Phaser.Scene {
  constructor() { super('ZoneScene'); }

  init(data) {
    this.zoneId = (data && data.zoneId != null) ? data.zoneId : 0;
  }

  create() {
    this.zone    = ZONES[this.zoneId];
    this.mapData = ZONE_MAPS[this.zoneId];
    this.player  = this.registry.get('player');
    this.daily   = this.registry.get('daily');
    this.audio   = ensureAudio();
    this.audio.setMusicLayer('dungeon');
    this.fx      = createFxSystem(this);

    this.clearedEncounters = new Set();
    this.bossDefeated = false;
    this.exitEnabled  = !!this.daily.zoneClears[this.zoneId];
    this.inBattle     = false;
    this.msgTimer     = null;

    const ROWS = this.mapData.length;       // 10
    const COLS = this.mapData[0].length;    // 15
    const TS   = TILE_SIZE;                 // 40
    if (typeof window !== 'undefined') window.BTQM_TILESET_RENDER_ACTIVE = false;

    // Find player start
    let startX = 0, startY = 0;
    outer: for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.mapData[r][c] === 9) { startX = c; startY = r; break outer; }
      }
    }

    // ── Render tile map ──────────────────────────────────────────────────────
    this.tileSprites = [];
    for (let r = 0; r < ROWS; r++) {
      this.tileSprites[r] = [];
      for (let c = 0; c < COLS; c++) {
        const tile = this.mapData[r][c];
        this.tileSprites[r][c] = addBtqmMapTileSprite(
          this,
          this.zoneId,
          tile,
          c * TS + TS / 2,
          r * TS + TS / 2,
          TS
        );
      }
    }

    // ── Player sprite ────────────────────────────────────────────────────────
    this.playerX = startX;
    this.playerY = startY;
    this.playerSprite = addBtqmPlayerSprite(
      this,
      startX * TS + TS / 2,
      startY * TS + TS / 2
    ).setDisplaySize(TS - 8, TS - 8).setDepth(10);

    // Player shadow
    this.playerShadow = this.add.ellipse(
      startX * TS + TS / 2, startY * TS + TS - 4,
      24, 8, 0x000000, 0.4
    ).setDepth(9);

    // ── Camera ───────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, COLS * TS, ROWS * TS);
    this.cameras.main.startFollow(this.playerSprite, true, 0.12, 0.12);

    // ── HUD (fixed to screen) ────────────────────────────────────────────────
    this.hudZone = this.add.text(8, 8,
      this.zone.name + ' — ' + this.zone.subtitle,
      {
        fontFamily: 'Courier New', fontSize: '10px', color: '#f39c12',
        backgroundColor: 'rgba(0,0,0,0.8)', padding: { x: 5, y: 3 }
      }
    ).setScrollFactor(0).setDepth(20);

    this.hudHp = this.add.text(632, 8, '',
      {
        fontFamily: 'Courier New', fontSize: '11px', color: '#2ecc71',
        backgroundColor: 'rgba(0,0,0,0.8)', padding: { x: 5, y: 3 }
      }
    ).setOrigin(1, 0).setScrollFactor(0).setDepth(20);

    this.hudGold = this.add.text(8, 430, '',
      {
        fontFamily: 'Courier New', fontSize: '10px', color: '#f39c12',
        backgroundColor: 'rgba(0,0,0,0.8)', padding: { x: 5, y: 3 }
      }
    ).setScrollFactor(0).setDepth(20);

    this.hudXp = this.add.text(632, 430, '',
      {
        fontFamily: 'Courier New', fontSize: '10px', color: '#74b9ff',
        backgroundColor: 'rgba(0,0,0,0.8)', padding: { x: 5, y: 3 }
      }
    ).setOrigin(1, 1).setScrollFactor(0).setDepth(20);

    this.updateHud();

    // Mini-map indicator
    this.hudEscHint = this.add.text(320, 8, 'ESC → Main Menu', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#555555',
      backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 4, y: 2 }
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20);

    // ── Message overlay ──────────────────────────────────────────────────────
    this.msgText = this.add.text(320, 224, '', {
      fontFamily: 'Courier New', fontSize: '13px', color: '#f39c12',
      backgroundColor: 'rgba(0,0,0,0.88)', padding: { x: 12, y: 8 },
      align: 'center', wordWrap: { width: 400 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(30).setVisible(false);

    // ── Keyboard controls ────────────────────────────────────────────────────
    this.cursors  = this.input.keyboard.createCursorKeys();
    this.wasd     = this.input.keyboard.addKeys({ up:'W', down:'S', left:'A', right:'D' });
    this.escKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on('down', () => {
      if (!this.inBattle) {
        this.fx.sceneTransition(() => {
          this.scene.stop('ZoneScene');
          this.scene.start('TitleScene');
        });
      }
    });

    this.moveCooldown = 0;

    // Entrance message
    this.showMessage('Zone ' + (this.zoneId + 1) + ': ' + this.zone.name + '\n' + this.zone.subtitle, 2000);

    this.applyTileFeedback();
    this.tweens.add({
      targets: this.playerSprite,
      y: this.playerSprite.y - 3,
      duration: 360,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  applyTileFeedback() {
    for (let r = 0; r < this.mapData.length; r++) {
      for (let c = 0; c < this.mapData[0].length; c++) {
        const tile = this.mapData[r][c];
        const sprite = this.tileSprites[r] && this.tileSprites[r][c];
        if (!sprite) continue;
        if (tile === 1) {
          this.tweens.add({
            targets: sprite,
            alpha: 0.88,
            duration: 380,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
            delay: (r + c) * 18,
          });
        } else if (tile === 2) {
          this.tweens.add({
            targets: sprite,
            alpha: 0.55,
            duration: 320,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        } else if (tile === 3) {
          this.tweens.add({
            targets: sprite,
            alpha: 0.45,
            scaleX: 1.06,
            scaleY: 1.06,
            duration: 300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      }
    }
  }

  showMessage(msg, duration) {
    duration = duration || 2000;
    this.msgText.setText(msg).setVisible(true);
    if (this.msgTimer) this.msgTimer.remove(false);
    this.msgTimer = this.time.delayedCall(duration, () => {
      if (this.msgText) this.msgText.setVisible(false);
    });
  }

  updateHud() {
    const p = this.player;
    const d = this.daily;
    const cleared = d.zoneClears.filter(Boolean).length;
    if (this.hudHp)   this.hudHp.setText('LVL ' + p.level + '   HP ' + p.hp + '/' + p.maxHp + ' ♥');
    if (this.hudGold) this.hudGold.setText('GOLD: ' + (p.gold || 0) + '   Potions: ' + p.potions + '   Skill: ' + p.skillCharges);
    if (this.hudXp)   this.hudXp.setText('XP ' + p.xp + '/' + xpToNextLevel(p.level) + '   [' + cleared + '/6]');
  }

  getTile(x, y) {
    if (y < 0 || y >= this.mapData.length)    return 0;
    if (x < 0 || x >= this.mapData[0].length) return 0;
    return this.mapData[y][x];
  }

  tryMove(dx, dy) {
    if (this.inBattle) return;
    const nx   = this.playerX + dx;
    const ny   = this.playerY + dy;
    const tile = this.getTile(nx, ny);
    if (tile === 0) {
      // Wall bump — brief shake
      this.cameras.main.shake(80, 0.005);
      return;
    }
    this.playerX = nx;
    this.playerY = ny;
    const TS = TILE_SIZE;
    const px = nx * TS + TS / 2;
    const py = ny * TS + TS / 2;
    this.playerSprite.setPosition(px, py);
    this.playerShadow.setPosition(px, py + TS / 2 - 4);
    if (playBtqmPlayerAnim(this, this.playerSprite, 'player-walk', 'player-idle')) {
      this.time.delayedCall(130, () => playBtqmPlayerAnim(this, this.playerSprite, 'player-idle'));
    }
    this.audio.playSfx('move');
    this.onStepOnTile(nx, ny, tile);
  }

  onStepOnTile(x, y, tile) {
    const posKey = x + ',' + y;

    if (tile === 2 && !this.clearedEncounters.has(posKey)) {
      const zone     = this.zone;
      const enemyIdx = Math.floor(Math.random() * zone.enemies.length);
      const enemyDef = zone.enemies[enemyIdx];
      const enemy    = { ...enemyDef, hp: enemyDef.maxHp, isBoss: false, texIdx: enemyIdx };
      this.startBattle(enemy, posKey, false);

    } else if (tile === 3 && !this.bossDefeated) {
      const boss = { ...this.zone.boss, hp: this.zone.boss.maxHp, isBoss: true, texIdx: 0 };
      this.startBattle(boss, posKey, true);

    } else if (tile === 4) {
      if (this.exitEnabled || this.bossDefeated) {
        this.exitZone();
      } else {
        this.showMessage('⚠  Defeat the boss first!\nLook for the golden-bordered tile.', 2500);
      }
    }
  }

  startBattle(enemy, posKey, isBoss) {
    this.inBattle = true;
    this.audio.setMusicLayer(isBoss ? 'boss' : 'battle');
    if (isBoss) {
      this.fx.bossEntry();
      this.audio.playSfx('bossEntry');
    }
    this.fx.transitionGlitch();
    this.scene.pause('ZoneScene');

    const self = this;

    this.scene.launch('BattleScene', {
      enemy,
      zoneId: this.zoneId,
      onVictory() {
        self.inBattle = false;
        self.player   = self.registry.get('player');
        self.daily    = self.registry.get('daily');

        if (isBoss) {
          self.bossDefeated = true;
          self.exitEnabled  = true;
          // Update tiles: clear boss tile, pulse exit tile
          for (let r = 0; r < self.mapData.length; r++) {
            for (let c = 0; c < self.mapData[0].length; c++) {
              const t = self.mapData[r][c];
              if (t === 3 && self.tileSprites[r] && self.tileSprites[r][c]) {
                setBtqmTileSpriteTexture(self, self.tileSprites[r][c], self.zoneId, 1, 'tile_floor_' + self.zoneId);
              }
              if (t === 4 && self.tileSprites[r] && self.tileSprites[r][c]) {
                setBtqmTileSpriteTexture(self, self.tileSprites[r][c], self.zoneId, 4, getBtqmTexture(self, 'tile_exit', 'object-exit-portal'));
                self.tweens.add({
                  targets: self.tileSprites[r][c],
                  alpha: 0.4, duration: 360, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                });
              }
            }
          }
          self.showMessage('🏆 BOSS DEFEATED!\nExit portal unlocked — find the cyan tile!', 3500);
        } else {
          self.clearedEncounters.add(posKey);
          const parts = posKey.split(',');
          const cx = parseInt(parts[0], 10);
          const cy = parseInt(parts[1], 10);
          if (self.tileSprites[cy] && self.tileSprites[cy][cx]) {
            setBtqmTileSpriteTexture(self, self.tileSprites[cy][cx], self.zoneId, 1, 'tile_floor_' + self.zoneId);
          }
          self.showMessage('Victory! Enemy defeated.', 1500);
        }

        self.updateHud();
        if (self.fx) {
          self.fx.setChainEnergy(btqmRuntime.streak);
        }
        updateDailyBar(self.daily);
        exportWidgetData(self.player, self.daily);
        self.audio.setMusicLayer('dungeon');
        self.scene.resume('ZoneScene');
      },
      onDefeat() {
        self.inBattle = false;
        self.player   = self.registry.get('player');
        self.updateHud();
        if (self.fx) self.fx.setChainEnergy(0);
        self.showMessage('💀 Defeated...\nYou survive with low HP. Retreat or fight on!', 2500);
        self.audio.setMusicLayer('dungeon');
        self.scene.resume('ZoneScene');
      },
      onFlee() {
        self.inBattle = false;
        btqmRuntime.streak = 0;
        if (self.fx) self.fx.setChainEnergy(0);
        self.showMessage('🏃 Fled the battle!', 1200);
        self.audio.setMusicLayer('dungeon');
        self.scene.resume('ZoneScene');
      },
    });
  }

  exitZone() {
    this.showMessage('✨ Zone cleared!\nReturning to menu...', 1400);
    this.time.delayedCall(1500, () => {
      this.fx.sceneTransition(() => {
        this.scene.stop('ZoneScene');
        this.scene.start('TitleScene');
      });
    });
  }

  update(time, delta) {
    if (this.inBattle) return;
    if (this.fx) {
      this.fx.update(delta);
      this.fx.updateStateFx({
        hpLow: this.player.hp / Math.max(1, this.player.maxHp) < 0.3,
        fullClear: !!this.daily.fullClearBonus,
      });
      this.fx.maybeTriggerChaosEvent();
    }
    this.moveCooldown -= delta;
    if (this.moveCooldown > 0) return;

    const up    = this.cursors.up.isDown    || this.wasd.up.isDown;
    const down  = this.cursors.down.isDown  || this.wasd.down.isDown;
    const left  = this.cursors.left.isDown  || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;

    if (up)         { this.tryMove(0, -1);  this.moveCooldown = 155; }
    else if (down)  { this.tryMove(0, 1);   this.moveCooldown = 155; }
    else if (left)  { this.tryMove(-1, 0);  this.moveCooldown = 155; }
    else if (right) { this.tryMove(1, 0);   this.moveCooldown = 155; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE: BattleScene — turn-based battle overlay
// ─────────────────────────────────────────────────────────────────────────────
class BattleScene extends Phaser.Scene {
  constructor() { super('BattleScene'); }

  init(data) {
    this.enemyData    = data.enemy;
    this.zoneId       = data.zoneId != null ? data.zoneId : 0;
    this.onVictoryCb  = data.onVictory  || null;
    this.onDefeatCb   = data.onDefeat   || null;
    this.onFleeCb     = data.onFlee     || null;
  }

  create() {
    this.player      = this.registry.get('player');
    this.daily       = this.registry.get('daily');
    this.zone        = ZONES[this.zoneId];
    this.audio       = ensureAudio();
    this.fx          = createFxSystem(this);
    this.audio.setMusicLayer(this.enemyData && this.enemyData.isBoss ? 'boss' : 'battle');

    this.enemy       = { ...this.enemyData };
    this.enemyMaxHp  = this.enemyData.maxHp;
    this.playerMaxHp = this.player.maxHp;

    this.battleLog   = [];
    this.playerTurn  = true;
    this.battleOver  = false;

    // ── Full-screen overlay ──────────────────────────────────────────────────
    this.add.rectangle(320, 224, 640, 448, 0x000000, 0.93);

    // Zone-colored border
    const border = this.add.graphics();
    border.lineStyle(3, this.zone.accentColor, 0.9);
    border.strokeRect(6, 6, 628, 436);
    border.lineStyle(1, this.zone.accentColor, 0.3);
    border.strokeRect(10, 10, 620, 428);

    // Corner decorations
    const cDec = this.add.graphics();
    cDec.fillStyle(this.zone.accentColor, 0.8);
    [[6,6],[628,6],[6,436],[628,436]].forEach(([cx,cy]) => {
      cDec.fillRect(cx - 2, cy - 2, 6, 6);
    });

    // ── Header ───────────────────────────────────────────────────────────────
    if (this.enemy.isBoss) {
      this.add.text(320, 18, '⚠  BOSS BATTLE  ⚠', {
        fontFamily: 'Courier New', fontSize: '15px', color: '#e74c3c', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.fx.bossEntry();
      this.audio.playSfx('bossEntry');
    } else {
      this.add.text(320, 18, '⚔  ENCOUNTER', {
        fontFamily: 'Courier New', fontSize: '13px', color: '#f39c12', fontStyle: 'bold'
      }).setOrigin(0.5);
    }

    // ── Enemy panel (right side) ─────────────────────────────────────────────
    const enemyPanelX = 430;
    const enemyTexKey = this.enemy.isBoss
      ? 'boss_' + this.zoneId
      : 'enemy_' + this.zoneId + '_' + (this.enemy.texIdx || 0);
    const enemySize = this.enemy.isBoss ? 120 : 88;

    const enemyAssetId = this.enemy.isBoss
      ? 'boss-' + btqmSlug(this.enemy.name)
      : 'enemy-' + btqmSlug(this.enemy.name);
    this.enemySprite = (this.enemy.isBoss
      ? addBtqmBossSprite(this, enemyPanelX, 110, enemyAssetId, enemyTexKey)
      : addBtqmEnemySprite(this, enemyPanelX, 110, enemyAssetId, enemyTexKey))
      .setDisplaySize(enemySize, enemySize);

    // Sprite idle bobbing
    this.tweens.add({
      targets: this.enemySprite,
      y: 110 - 5, duration: 900 + Math.random() * 400, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Enemy name
    this.add.text(enemyPanelX, 162, this.enemy.name, {
      fontFamily: 'Courier New', fontSize: '12px', color: '#e74c3c', fontStyle: 'bold'
    }).setOrigin(0.5);

    // Enemy stats
    this.add.text(enemyPanelX, 176, 'ATK ' + this.enemy.atk + '   DEF ' + this.enemy.def, {
      fontFamily: 'Courier New', fontSize: '9px', color: '#888888'
    }).setOrigin(0.5);

    // Enemy HP bar background
    this.add.rectangle(enemyPanelX, 193, 200, 12, 0x111111);
    this.add.rectangle(enemyPanelX, 193, 200, 12, 0x000000, 0).setStrokeStyle(1, 0x444444);
    // HP bar fill — origin (0, 0.5), x = enemyPanelX - 100
    this.enemyHpBar = this.add.rectangle(
      enemyPanelX - 100, 193, 200, 10, 0xe74c3c
    ).setOrigin(0, 0.5);

    this.enemyHpText = this.add.text(enemyPanelX, 207, '', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#e74c3c'
    }).setOrigin(0.5);

    // ── Player panel (left side) ─────────────────────────────────────────────
    const playerPanelX = 110;
    this.playerSprite = addBtqmPlayerSprite(this, playerPanelX, 110)
      .setDisplaySize(72, 72);

    this.tweens.add({
      targets: this.playerSprite,
      y: 110 - 3, duration: 1100, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.add.text(playerPanelX, 154, this.player.name, {
      fontFamily: 'Courier New', fontSize: '11px', color: '#2ecc71', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(playerPanelX, 168, 'LVL ' + this.player.level + '   Skill ' + this.player.skillCharges, {
      fontFamily: 'Courier New', fontSize: '9px', color: '#888888'
    }).setOrigin(0.5);

    // Player HP bar bg
    this.add.rectangle(playerPanelX, 183, 150, 12, 0x111111);
    // Player HP bar fill — origin (0, 0.5), x = playerPanelX - 75
    this.playerHpBar = this.add.rectangle(
      playerPanelX - 75, 183, 150, 10, 0x2ecc71
    ).setOrigin(0, 0.5);

    this.playerHpText = this.add.text(playerPanelX, 197, '', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#2ecc71'
    }).setOrigin(0.5);

    // ── VS divider ───────────────────────────────────────────────────────────
    this.add.text(272, 110, 'VS', {
      fontFamily: 'Courier New', fontSize: '20px', color: '#f39c12', fontStyle: 'bold'
    }).setOrigin(0.5);
    const vsDivGfx = this.add.graphics();
    vsDivGfx.lineStyle(1, 0x333333, 0.8);
    vsDivGfx.lineBetween(272, 50, 272, 220);

    // ── Battle log area ──────────────────────────────────────────────────────
    this.add.rectangle(320, 308, 600, 110, 0x0a0a18, 0.95);
    this.add.graphics().lineStyle(1, 0x333366, 0.6).strokeRect(20, 252, 600, 110);

    this.logTexts = [];
    for (let i = 0; i < 5; i++) {
      this.logTexts.push(this.add.text(28, 258 + i * 20, '', {
        fontFamily: 'Courier New', fontSize: '10px', color: '#cccccc'
      }));
    }

    // ── Action buttons ───────────────────────────────────────────────────────
    const btnY = 388;
    const btnConfigs = [
      { label: '⚔\nATTACK',     key: '1', x: 66,  action: 'attack'  },
      { label: '✨\nSKILL',      key: '2', x: 194, action: 'skill'   },
      { label: '🌙\nMOON',       key: '3', x: 320, action: 'faction' },
      { label: '🧪\nPOTION',     key: '4', x: 446, action: 'item'    },
      { label: '🏃\nFLEE',       key: '5', x: 574, action: 'flee'    },
    ];

    this.actionBtns = [];
    btnConfigs.forEach(cfg => {
      const isSkill  = cfg.action === 'skill';
      const isItem   = cfg.action === 'item';
      const disabled = (isSkill && this.player.skillCharges <= 0) ||
                       (isItem  && this.player.potions <= 0);

      const bg = this.add.rectangle(cfg.x, btnY, 108, 46,
        disabled ? 0x111111 : 0x1a1500, 0.9
      );
      bg.setStrokeStyle(1, disabled ? 0x333333 : this.zone.accentColor, disabled ? 0.3 : 0.7);

      const txt = this.add.text(cfg.x, btnY,
        '[' + cfg.key + '] ' + cfg.label.replace(/\n/g, ' '),
        {
          fontFamily: 'Courier New', fontSize: '11px',
          color: disabled ? '#444444' : '#f39c12',
          align: 'center', lineSpacing: 2,
        }
      ).setOrigin(0.5);

      if (!disabled) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover',  () => {
          bg.setFillStyle(0x3d2e00, 0.9);
          bg.setScale(1.03, 1.03);
        });
        bg.on('pointerout',   () => {
          bg.setFillStyle(0x1a1500, 0.9);
          bg.setScale(1, 1);
        });
        bg.on('pointerdown',  () => {
          bg.setScale(0.95, 0.95);
          this.time.delayedCall(100, () => bg.setScale(1, 1));
          this.doPlayerAction(cfg.action);
        });
        this.tweens.add({
          targets: bg,
          alpha: 0.82,
          duration: 320,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
      this.actionBtns.push({ bg, txt, action: cfg.action, disabled });
    });

    // ── Status bar ───────────────────────────────────────────────────────────
    this.statusText = this.add.text(320, 425, '', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#555555', align: 'center'
    }).setOrigin(0.5);

    // ── Keyboard input ───────────────────────────────────────────────────────
    this._keyHandler = (e) => {
      if (this.battleOver || !this.playerTurn) return;
      if (e.key === '1') this.doPlayerAction('attack');
      else if (e.key === '2') this.doPlayerAction('skill');
      else if (e.key === '3') this.doPlayerAction('faction');
      else if (e.key === '4') this.doPlayerAction('item');
      else if (e.key === '5') this.doPlayerAction('flee');
    };
    this.input.keyboard.on('keydown', this._keyHandler);

    // ── Turn indicator ────────────────────────────────────────────────────────
    this.turnText = this.add.text(320, 238, '', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#888888', align: 'center'
    }).setOrigin(0.5);

    // ── Initial update ────────────────────────────────────────────────────────
    this.updateBars();
    this.refreshButtons();
    this.addLog('Battle start! ' + this.enemy.name + ' appears!');
    this.setTurnIndicator(true);
  }

  addLog(msg) {
    this.battleLog.push(msg);
    if (this.battleLog.length > 5) this.battleLog.shift();
    this.battleLog.forEach((line, i) => {
      if (this.logTexts[i]) this.logTexts[i].setText(line);
    });
  }

  setTurnIndicator(isPlayer) {
    if (this.turnText) {
      this.turnText.setText(isPlayer ? '— YOUR TURN —' : '— ENEMY TURN —');
      this.turnText.setColor(isPlayer ? '#2ecc71' : '#e74c3c');
    }
  }

  updateBars() {
    const ePct = Math.max(0, this.enemy.hp) / this.enemyMaxHp;
    const pPct = Math.max(0, this.player.hp) / this.playerMaxHp;

    if (this.enemyHpBar)   this.enemyHpBar.setScale(Math.max(0, ePct), 1);
    if (this.playerHpBar)  this.playerHpBar.setScale(Math.max(0, pPct), 1);

    if (this.enemyHpText)  this.enemyHpText.setText('HP ' + Math.max(0, this.enemy.hp) + ' / ' + this.enemyMaxHp);
    if (this.playerHpText) this.playerHpText.setText('HP ' + Math.max(0, this.player.hp) + ' / ' + this.playerMaxHp);

    // Color changes for low HP
    if (pPct < 0.3 && this.playerHpBar) this.playerHpBar.setFillStyle(0xe74c3c);
    else if (pPct < 0.6 && this.playerHpBar) this.playerHpBar.setFillStyle(0xf39c12);
    else if (this.playerHpBar) this.playerHpBar.setFillStyle(0x2ecc71);
    if (this.fx) {
      this.fx.updateStateFx({
        hpLow: pPct < 0.3,
        bossFight: !!this.enemy.isBoss,
        fullClear: !!this.daily.fullClearBonus,
      });
    }
  }

  refreshButtons() {
    const skillDis = this.player.skillCharges <= 0;
    const itemDis  = this.player.potions <= 0;

    this.statusText.setText(
      '[1]ATK  [2]SKILL(' + this.player.skillCharges + ')  [3]MOON  [4]POTION(' + this.player.potions + 'x)  [5]FLEE'
    );

    this.actionBtns.forEach(({ bg, txt, action }) => {
      let disabled = false;
      if (action === 'skill') disabled = skillDis;
      if (action === 'item') disabled = itemDis;
      bg.removeAllListeners('pointerdown');
      txt.setColor(disabled ? '#444444' : '#f39c12');
      if (disabled) {
        bg.removeInteractive();
      } else {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', () => this.doPlayerAction(action));
      }
    });
  }

  flashSprite(sprite, flashColor, duration) {
    if (!sprite || !sprite.scene) return;
    sprite.setTint(flashColor);
    this.time.delayedCall(duration || 150, () => {
      if (sprite && sprite.scene) sprite.clearTint();
    });
  }

  doPlayerAction(action) {
    if (this.battleOver || !this.playerTurn) return;
    this.playerTurn = false;
    this.setTurnIndicator(false);

    const p = this.player;
    const e = this.enemy;

    if (action === 'attack') {
      playBtqmPlayerAnim(this, this.playerSprite, 'player-attack', 'player-idle');
      const dmg = randInt(8 + p.level * 2, 14 + p.level * 3);
      e.hp -= dmg;
      this.flashSprite(this.enemySprite, 0xff6666, 180);
      this.fx.hitImpact(this.enemySprite, dmg, { x: this.enemySprite.x, y: this.enemySprite.y - 46 });
      this.audio.playSfx('hit');
      this.addLog('You strike for ' + dmg + ' damage!');

    } else if (action === 'skill') {
      if (p.skillCharges <= 0) { this.playerTurn = true; this.setTurnIndicator(true); return; }
      playBtqmPlayerAnim(this, this.playerSprite, 'player-attack', 'player-idle');
      p.skillCharges--;
      const dmg = randInt(20 + p.level * 4, 30 + p.level * 5);
      e.hp -= dmg;
      this.flashSprite(this.enemySprite, 0x00ffff, 250);
      this.fx.criticalHit(this.enemySprite, dmg, { x: this.enemySprite.x, y: this.enemySprite.y - 46 });
      this.audio.playSfx('crit');
      this.addLog('✨ Skill strike! ' + dmg + ' critical damage!');
      this.refreshButtons();

    } else if (action === 'faction') {
      playBtqmPlayerAnim(this, this.playerSprite, 'player-attack', 'player-idle');
      if (Math.random() < 0.6) {
        const dmg = randInt(25 + p.level * 3, 38 + p.level * 4);
        e.hp -= dmg;
        this.flashSprite(this.enemySprite, 0xffd700, 220);
        this.fx.criticalHit(this.enemySprite, dmg, { x: this.enemySprite.x, y: this.enemySprite.y - 46 });
        this.audio.playSfx('crit');
        this.addLog('🌙 Moon Strike! ' + dmg + ' bonus damage!');
      } else {
        this.audio.playSfx('hit', { volume: MISS_HIT_VOLUME });
        this.addLog('🌙 Moon Strike missed! (40% miss chance)');
      }

    } else if (action === 'item') {
      if (p.potions <= 0) { this.playerTurn = true; this.setTurnIndicator(true); return; }
      p.potions--;
      const heal = 40 + p.level * 3;
      p.hp = Math.min(p.maxHp, p.hp + heal);
      this.audio.playSfx('potion');
      this.addLog('🧪 Potion! Restored ' + heal + ' HP.');
      this.updateBars();
      this.refreshButtons();
      savePlayer(p);
      this.time.delayedCall(700, () => this.doEnemyTurn());
      return;

    } else if (action === 'flee') {
      if (e.isBoss) {
        this.addLog('You cannot flee from a boss battle!');
        this.playerTurn = true;
        this.setTurnIndicator(true);
        return;
      }
      if (Math.random() < 0.7) {
        this.addLog('You successfully fled!');
        this.battleOver = true;
        this.time.delayedCall(900, () => this.endBattle('flee'));
        return;
      } else {
        this.addLog('Failed to flee! The enemy blocks your path.');
      }
    }

    this.updateBars();

    if (e.hp <= 0) {
      this.addLog(e.name + ' has been defeated!');
      this.battleOver = true;
      this.cameras.main.shake(200, 0.015);
      this.audio.playSfx('victory');
      this.time.delayedCall(1300, () => this.handleVictory());
      return;
    }

    this.time.delayedCall(320, () => playBtqmPlayerAnim(this, this.playerSprite, 'player-idle'));
    this.time.delayedCall(700, () => this.doEnemyTurn());
  }

  doEnemyTurn() {
    if (this.battleOver) return;
    this.setTurnIndicator(false);

    const p = this.player;
    const e = this.enemy;

    // Boss has a chance to use special attack
    let eDmg;
    let logMsg;

    if (e.isBoss && Math.random() < 0.2) {
      eDmg = Math.round(e.atk * 1.5 + randInt(0, 5));
      logMsg = e.name + ' uses POWER SLAM for ' + eDmg + '!';
      playBtqmPlayerAnim(this, this.playerSprite, 'player-hurt', 'player-idle');
      this.flashSprite(this.playerSprite, 0xff0000, 300);
      this.cameras.main.shake(300, 0.02);
      this.fx.criticalHit(this.playerSprite, eDmg, { x: this.playerSprite.x, y: this.playerSprite.y - 40 });
      this.audio.playSfx('crit', { volume: ENEMY_CRIT_VOLUME });
      this.time.delayedCall(320, () => playBtqmPlayerAnim(this, this.playerSprite, 'player-idle'));
    } else {
      eDmg = Math.max(1, randInt(Math.floor(e.atk * 0.8), Math.ceil(e.atk * 1.2)));
      logMsg = e.name + ' attacks for ' + eDmg + '!';
      playBtqmPlayerAnim(this, this.playerSprite, 'player-hurt', 'player-idle');
      this.flashSprite(this.playerSprite, 0xff4444, 180);
      this.fx.hitImpact(this.playerSprite, eDmg, { x: this.playerSprite.x, y: this.playerSprite.y - 40 });
      this.audio.playSfx('hit', { volume: ENEMY_HIT_VOLUME });
      this.time.delayedCall(320, () => playBtqmPlayerAnim(this, this.playerSprite, 'player-idle'));
    }

    p.hp -= eDmg;
    this.addLog(logMsg);
    this.updateBars();

    if (p.hp <= 0) {
      p.hp = 0;
      this.addLog('You have been defeated...');
      this.battleOver = true;
      this.time.delayedCall(1300, () => this.handleDefeat());
      return;
    }

    this.playerTurn = true;
    this.setTurnIndicator(true);
  }

  async handleVictory() {
    const p = this.player;
    const e = this.enemy;
    const d = this.daily;
    const levelBefore = p.level;

    grantXP(p, e.xp);
    p.gold = (p.gold || 0) + e.gold;
    d.enemiesDefeated = (d.enemiesDefeated || 0) + 1;
    addRunScore(scoreForEncounter(e));
    syncDailyRunScore(d);
    btqmRuntime.battlesWon += 1;
    btqmRuntime.streak += 1;
    this.fx.setChainEnergy(btqmRuntime.streak);

    if (e.isBoss) {
      d.zoneClears[this.zoneId] = true;
      addRunScore(scoreForBoss(this.zoneId));
      addRunScore(scoreForZoneClear(this.zoneId));
      syncDailyRunScore(d);
      btqmRuntime.bossKills += 1;
      btqmRuntime.zoneClears += 1;
      // Scale director intensity with zone progression
      btqmRuntime.intensity = Math.min(100, (btqmRuntime.zoneClears / 6) * 100);
      btqmRuntime.highestIntensity = Math.max(btqmRuntime.highestIntensity, btqmRuntime.intensity);
      p.lifetimeClears = (p.lifetimeClears || 0) + 1;
      p.skillCharges   = Math.min(p.skillCharges + 1, 3);
      if (p.potions < 3) p.potions++;

      saveDailyState(d);
      savePlayer(p);
      exportWidgetData(p, d);

      if (checkFullClear(d)) {
        addRunScore(FULL_CLEAR_BONUS);
        syncDailyRunScore(d);
        this.addLog('🎉 ALL 6 ZONES CLEARED! +' + FULL_CLEAR_BONUS + ' full-clear bonus!');
      }

      this.addLog('BOSS SLAIN! +' + e.xp + ' XP  +' + e.gold + ' Gold');
      this.addLog('Zone ' + (this.zoneId + 1) + ' CLEARED! Total score: ' + d.runScore);
    } else {
      saveDailyState(d);
      savePlayer(p);
      exportWidgetData(p, d);
      this.addLog('Victory! +' + e.xp + ' XP  +' + e.gold + ' Gold');
    }

    // Level-up display
    if (p.level > levelBefore) {
      this.fx.levelUp(this.playerSprite.x, this.playerSprite.y - 25);
      this.addLog('LVL ' + p.level + '  XP ' + p.xp + '/' + xpToNextLevel(p.level));
    }

    this.registry.set('player', p);
    this.registry.set('daily', d);

    this.time.delayedCall(1600, () => this.endBattle('victory'));
  }

  async handleDefeat() {
    const p = this.player;
    p.hp = Math.max(1, Math.floor(p.maxHp * 0.35));
    btqmRuntime.playerSurvived = false;
    btqmRuntime.streak = 0;
    this.fx.setChainEnergy(0);
    this.audio.playSfx('death');
    savePlayer(p);
    this.registry.set('player', p);
    this.addLog('You survived with ' + p.hp + ' HP. Regroup!');
    try { await finalizeRunSubmission(); } catch (err) { console.warn('[BTQM] run-end submit failed', err); }
    beginRun(p.name);
    this.time.delayedCall(1200, () => this.endBattle('defeat'));
  }

  endBattle(result) {
    this.input.keyboard.off('keydown', this._keyHandler);
    if (this.fx) this.fx.destroy();
    if (result === 'victory' && this.onVictoryCb) this.onVictoryCb();
    else if (result === 'defeat' && this.onDefeatCb) this.onDefeatCb();
    else if (result === 'flee'  && this.onFleeCb) this.onFleeCb();
    this.scene.stop('BattleScene');
  }

  update(time, delta) {
    if (this.fx) this.fx.update(delta);
  }
}


// Register game adapter with full system declarations for system-parity.
export const BTQM_ADAPTER = createGameAdapter({
  id: BTQM_CONFIG.id,
  name: BTQM_CONFIG.label,
  systems: { upgrade: true, director: true, event: true, mutation: true, boss: true, risk: true, meta: true, feedback: true },
  legacyBootstrap: function (root) {
    return bootstrapBlockTopiaQuestMaze(root);
  },
});

registerGameAdapter(BTQM_CONFIG, BTQM_ADAPTER, bootstrapBlockTopiaQuestMaze);

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bootstrap the Block Topia Quest Maze game.
 *
 * @param {Element} root - Anchor element for the game (e.g. .game-card).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapBlockTopiaQuestMaze(root) {
  let phaserGame = null;
  let _pausedByOverlay = [];

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async function init() {
    if (phaserGame) return;

    // ── Phaser game ──────────────────────────────────────────────────────────
    // The host page provides <div id="btqm-canvas"> inside .btqm-game-area
    // as the Phaser canvas parent. We resolve it relative to root for safety.
    const canvasContainer = root.querySelector('#btqm-canvas') ||
                            document.getElementById('btqm-canvas');

    phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 640,
      height: 448,
      parent: canvasContainer || root,
      pixelArt: true,
      antialias: false,
      antialiasGL: false,
      roundPixels: true,
      backgroundColor: '#0a0a1a',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [BootScene, TitleScene, ZoneScene, BattleScene],
    });

    // Tag the Phaser-generated canvas so game-fullscreen.js detectMeta()
    // finds the btqmCanvas entry in GAME_META.
    if (phaserGame.canvas) {
      phaserGame.canvas.id = 'btqmCanvas';
      phaserGame.canvas.style.imageRendering = 'pixelated';
    }

    // When the fullscreen overlay opens/closes, ask Phaser to refresh its scale
    // so input event coordinates remain accurate after the DOM moves.
    const overlayEl = document.getElementById('game-overlay');
    if (overlayEl) {
      new MutationObserver(function () {
        [150, 300, 600].forEach(function (delay) {
          setTimeout(function () {
            if (phaserGame && phaserGame.scale) phaserGame.scale.refresh();
          }, delay);
        });
      }).observe(overlayEl, { attributes: true, attributeFilter: ['class'] });
    }

    // ── Fullscreen shell button hooks ────────────────────────────────────────
    // START — show name-entry overlay; restart TitleScene if already playing
    var startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.onclick = function () { void start(); };
    }

    // PAUSE / RESUME — track only scenes paused by this button (not by game logic)
    var pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
      pauseBtn.onclick = function () {
        if (!window.running) return;
        if (_pausedByOverlay.length) resume();
        else pause();
      };
    }

    // RESET — return to TitleScene / name-entry
    var resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
      resetBtn.onclick = function () { void reset(); };
    }

    // ── Mobile d-pad ──────────────────────────────────────────────────────────
    const DPAD_KEY_MAP = {
      37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 13: 'Enter',
    };
    document.querySelectorAll('.dpad-btn').forEach(btn => {
      const keyCode = parseInt(btn.dataset.key, 10);
      const keyStr  = DPAD_KEY_MAP[keyCode] || String(keyCode);
      const fireKey = () => {
        const evt = new KeyboardEvent('keydown', {
          key: keyStr, code: keyStr, keyCode, which: keyCode,
          bubbles: true, cancelable: true,
        });
        document.dispatchEvent(evt);
      };
      btn.addEventListener('touchstart', e => { e.preventDefault(); fireKey(); }, { passive: false });
      btn.addEventListener('mousedown',  e => { e.preventDefault(); fireKey(); });
    });
  }

  async function switchToTitleScene() {
    if (!phaserGame) return;
    _pausedByOverlay = [];
    ['BattleScene', 'ZoneScene'].forEach(function (k) {
      if (phaserGame.scene.isActive(k) || phaserGame.scene.isPaused(k)) phaserGame.scene.stop(k);
    });
    if (!phaserGame.scene.isActive('TitleScene')) phaserGame.scene.start('TitleScene');
    window.running = false;
    const audio = ensureAudio();
    audio.setMusicLayer('world');
  }

  async function start() {
    if (!phaserGame) return;
    if (btqmRuntime.runActive && !btqmRuntime.runSubmitted) {
      try { await finalizeRunSubmission(true); } catch (err) { console.warn('[BTQM] start submit failed', err); }
    }
    await switchToTitleScene();
  }

  function pause() {
    if (!phaserGame || _pausedByOverlay.length) return;
    ['BattleScene', 'ZoneScene'].forEach(function (k) {
      if (phaserGame.scene.isActive(k)) {
        phaserGame.scene.pause(k);
        _pausedByOverlay.push(k);
      }
    });
    document.dispatchEvent(new CustomEvent('arcade-pause-change', { detail: { paused: true } }));
  }

  function resume() {
    if (!phaserGame || !_pausedByOverlay.length) return;
    _pausedByOverlay.forEach(function (k) {
      if (phaserGame.scene.isPaused(k)) phaserGame.scene.resume(k);
    });
    _pausedByOverlay = [];
    document.dispatchEvent(new CustomEvent('arcade-pause-change', { detail: { paused: false } }));
  }

  async function reset() {
    if (btqmRuntime.runActive && !btqmRuntime.runSubmitted) {
      try { await finalizeRunSubmission(true); } catch (err) { console.warn('[BTQM] reset submit failed', err); }
    }
    await switchToTitleScene();
  }

  async function destroy() {
    if (btqmRuntime.runActive && !btqmRuntime.runSubmitted) {
      try { await finalizeRunSubmission(true); } catch (err) { console.warn('[BTQM] destroy submit failed', err); }
    }
    const audio = ensureAudio();
    audio.destroy();
    btqmRuntime.audio = null;
    if (phaserGame) {
      phaserGame.destroy(true);
      phaserGame = null;
    }
  }
  function getScore() {
    return Math.max(0, Math.floor(btqmRuntime.score || 0));
  }

  // ── Public lifecycle object ────────────────────────────────────────────────

  return { init, start, pause, resume, reset, destroy, getScore };
}
