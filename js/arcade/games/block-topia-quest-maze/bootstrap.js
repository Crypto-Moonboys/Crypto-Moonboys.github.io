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
      { name: 'Paper Hand Goblin', role: 'basic-chaser',        bombHp: 1, speed: 620, xp: 30,  gold: 8,  scoreValue: 50 },
      { name: 'FUD Spreader',      role: 'corruption-spreader', bombHp: 1, speed: 980, xp: 40,  gold: 10, scoreValue: 60 },
    ],
    boss: { name: 'Paper Hand King', role: 'boss', bombHp: 5, speed: 1200, xp: 150, gold: 40, scoreValue: 200, isBoss: true },
    clearScore: 100, enemyCount: 4,
    // kept for score helpers
    maxHp: 35, atk: 7, def: 2,
  },
  {
    id: 1, name: 'Bear Market Siege', subtitle: 'The Frozen Cavern',
    floorColor: 0x1a2a4a, wallColor: 0x0d1929, bgColor: 0x060e1a, accentColor: 0x3498db,
    enemies: [
      { name: 'Bear Soldier',   role: 'shield-enemy', bombHp: 2, speed: 710, xp: 60,  gold: 18, scoreValue: 75 },
      { name: 'Market Crasher', role: 'bomb-kicker',  bombHp: 1, speed: 820, xp: 70,  gold: 20, scoreValue: 65 },
    ],
    boss: { name: 'Bear Lord', role: 'boss', bombHp: 5, speed: 1200, xp: 280, gold: 80, scoreValue: 200, isBoss: true },
    clearScore: 200, enemyCount: 5,
    maxHp: 65, atk: 12, def: 6,
  },
  {
    id: 2, name: 'FOMO Plague Escape', subtitle: 'The Panic Wastes',
    floorColor: 0x3d1454, wallColor: 0x230a30, bgColor: 0x0f0518, accentColor: 0x9b59b6,
    enemies: [
      { name: 'FOMO Ghost',   role: 'fuse-hacker',  bombHp: 1, speed: 510, xp: 75,  gold: 22, scoreValue: 70 },
      { name: 'Panic Seller', role: 'basic-chaser', bombHp: 1, speed: 560, xp: 85,  gold: 25, scoreValue: 55 },
    ],
    boss: { name: 'FOMO Phantom Prime', role: 'boss', bombHp: 5, speed: 1200, xp: 350, gold: 100, scoreValue: 200, isBoss: true },
    clearScore: 350, enemyCount: 6,
    maxHp: 70, atk: 13, def: 4,
  },
  {
    id: 3, name: 'Rug Pull Recovery', subtitle: 'The Ruined Vaults',
    floorColor: 0x4a2a0a, wallColor: 0x2e1a06, bgColor: 0x120a03, accentColor: 0xe67e22,
    enemies: [
      { name: 'Rug Puller',   role: 'bomb-kicker',  bombHp: 1, speed: 760, xp: 100, gold: 28, scoreValue: 65 },
      { name: 'Exit Scammer', role: 'shield-enemy', bombHp: 2, speed: 660, xp: 95,  gold: 26, scoreValue: 80 },
    ],
    boss: { name: 'Rug Architect', role: 'boss', bombHp: 5, speed: 1200, xp: 430, gold: 120, scoreValue: 200, isBoss: true },
    clearScore: 500, enemyCount: 6,
    maxHp: 90, atk: 17, def: 6,
  },
  {
    id: 4, name: "Whale Lord's Challenge", subtitle: 'The Deep Sea Vault',
    floorColor: 0x0a2a4a, wallColor: 0x061929, bgColor: 0x030c15, accentColor: 0x1abc9c,
    enemies: [
      { name: 'Whale Minion',       role: 'basic-chaser',        bombHp: 1, speed: 510, xp: 130, gold: 38, scoreValue: 55 },
      { name: 'Market Manipulator', role: 'corruption-spreader', bombHp: 1, speed: 910, xp: 140, gold: 42, scoreValue: 60 },
    ],
    boss: { name: 'Whale Engine', role: 'boss', bombHp: 5, speed: 1200, xp: 580, gold: 160, scoreValue: 200, isBoss: true },
    clearScore: 750, enemyCount: 7,
    maxHp: 120, atk: 20, def: 11,
  },
  {
    id: 5, name: 'Moon Mission', subtitle: 'The Final Ascent',
    floorColor: 0x1a1a3a, wallColor: 0x0a0a1e, bgColor: 0x030309, accentColor: 0xf39c12,
    enemies: [
      { name: 'NGMI Wraith',     role: 'fuse-hacker',  bombHp: 1, speed: 460, xp: 150, gold: 48, scoreValue: 70 },
      { name: 'Anti-Moon Troll', role: 'shield-enemy', bombHp: 2, speed: 610, xp: 145, gold: 45, scoreValue: 80 },
    ],
    boss: { name: 'NGMI Overlord', role: 'boss', bombHp: 5, speed: 1200, xp: 800, gold: 220, scoreValue: 200, isBoss: true },
    clearScore: 1000, enemyCount: 8,
    maxHp: 140, atk: 26, def: 9,
  },
];

// ─── ZONE MAPS (21 cols × 15 rows) ─────────────────────────────────────────
// Tile codes: 0=hard wall, 1=floor, 2=soft block, 4=exit, 9=start
const ZONE_MAPS = [
  // Zone 0: HODL or FOLD
  [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,9,1,1,2,1,2,1,1,2,2,1,2,2,1,2,1,2,1,2,0],
    [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,2,0,1,0,1,0],
    [0,1,1,1,2,2,1,2,1,1,1,1,2,1,2,1,1,2,2,2,0],
    [0,1,0,2,0,1,0,2,0,2,0,2,0,2,0,1,0,1,0,1,0],
    [0,1,1,1,1,1,2,1,1,1,1,1,2,1,1,2,2,1,1,2,0],
    [0,1,0,2,0,2,0,2,0,1,0,1,0,2,0,1,0,2,0,1,0],
    [0,2,1,1,2,1,2,2,1,2,2,2,1,2,2,1,2,1,1,2,0],
    [0,2,0,1,0,1,0,1,0,1,0,1,0,1,0,2,0,2,0,1,0],
    [0,2,2,1,1,1,2,2,1,2,1,1,2,1,2,1,2,1,1,2,0],
    [0,2,0,1,0,1,0,2,0,2,0,1,0,2,0,2,0,2,0,2,0],
    [0,1,2,2,1,2,1,1,2,2,1,2,2,2,1,2,2,1,1,1,0],
    [0,2,0,1,0,2,0,1,0,2,0,2,0,1,0,1,0,1,0,1,0],
    [0,2,2,2,1,2,1,1,2,2,1,1,1,2,2,2,1,1,1,4,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Zone 1: Bear Market Siege
  [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,9,1,1,1,2,1,2,1,1,1,2,2,2,2,1,1,2,1,1,0],
    [0,1,0,1,0,2,0,2,0,1,0,2,0,1,0,1,0,2,0,1,0],
    [0,1,1,1,1,1,1,2,2,2,1,2,2,1,2,2,2,2,1,1,0],
    [0,2,0,2,0,2,0,2,0,2,0,1,0,1,0,2,0,1,0,2,0],
    [0,1,2,1,2,1,2,2,1,1,2,2,2,2,1,2,2,2,2,1,0],
    [0,1,0,1,0,2,0,2,0,2,0,2,0,1,0,2,0,2,0,2,0],
    [0,2,1,2,1,1,2,2,1,2,1,2,2,2,2,2,1,2,2,2,0],
    [0,2,0,1,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0],
    [0,1,2,2,2,2,2,1,1,1,2,1,1,2,2,1,1,1,1,1,0],
    [0,2,0,1,0,1,0,2,0,1,0,1,0,1,0,2,0,1,0,1,0],
    [0,1,1,2,1,2,1,1,2,2,2,2,2,2,1,1,2,1,1,1,0],
    [0,1,0,1,0,2,0,2,0,1,0,2,0,2,0,2,0,1,0,1,0],
    [0,1,1,2,1,1,1,1,2,2,2,2,2,2,1,1,2,1,1,4,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Zone 2: FOMO Plague Escape
  [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,9,1,1,2,1,1,2,1,1,1,2,2,2,1,2,2,2,1,1,0],
    [0,1,0,1,0,2,0,1,0,2,0,1,0,1,0,2,0,1,0,2,0],
    [0,1,1,1,1,2,2,1,1,2,2,1,2,1,2,1,1,1,2,2,0],
    [0,2,0,1,0,2,0,1,0,2,0,1,0,1,0,2,0,2,0,1,0],
    [0,2,2,2,1,2,1,2,2,2,1,1,2,2,1,2,2,2,1,2,0],
    [0,2,0,2,0,1,0,1,0,2,0,2,0,1,0,1,0,2,0,2,0],
    [0,1,2,1,1,2,2,2,2,2,2,2,1,2,1,1,1,2,1,2,0],
    [0,1,0,1,0,1,0,2,0,2,0,2,0,1,0,2,0,2,0,2,0],
    [0,2,2,1,2,2,2,2,2,2,1,1,2,2,2,2,2,1,2,2,0],
    [0,1,0,2,0,2,0,1,0,2,0,1,0,2,0,1,0,1,0,2,0],
    [0,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,1,1,1,1,0],
    [0,1,0,2,0,1,0,2,0,2,0,2,0,1,0,2,0,1,0,1,0],
    [0,2,1,1,1,2,1,1,2,2,1,2,1,1,1,2,2,1,1,4,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Zone 3: Rug Pull Recovery
  [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,9,1,1,1,1,2,1,2,1,2,1,2,1,1,1,2,1,1,2,0],
    [0,1,0,1,0,2,0,1,0,1,0,2,0,2,0,1,0,2,0,1,0],
    [0,1,1,1,1,2,2,2,2,2,1,1,2,1,2,2,1,1,1,1,0],
    [0,1,0,2,0,1,0,1,0,2,0,2,0,2,0,2,0,2,0,1,0],
    [0,1,2,2,1,1,2,2,1,2,1,1,2,1,2,2,1,2,2,2,0],
    [0,2,0,1,0,2,0,2,0,2,0,2,0,2,0,2,0,1,0,2,0],
    [0,1,1,1,2,2,2,2,2,2,2,2,1,1,1,2,2,2,1,2,0],
    [0,1,0,1,0,2,0,2,0,1,0,2,0,1,0,2,0,2,0,2,0],
    [0,2,1,1,2,1,2,2,2,2,1,2,1,2,1,2,1,1,2,2,0],
    [0,2,0,2,0,2,0,1,0,2,0,1,0,2,0,1,0,2,0,1,0],
    [0,2,1,1,1,2,2,2,2,1,2,1,2,1,2,2,1,1,1,1,0],
    [0,1,0,1,0,2,0,2,0,2,0,2,0,1,0,2,0,1,0,1,0],
    [0,2,2,1,1,2,2,2,1,1,2,2,2,1,1,2,2,1,1,4,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Zone 4: Whale Lord's Challenge
  [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,9,1,1,2,2,2,1,2,2,2,1,2,1,1,2,2,2,2,1,0],
    [0,1,0,1,0,2,0,2,0,1,0,2,0,2,0,2,0,2,0,1,0],
    [0,1,1,1,2,2,2,2,1,1,2,2,1,1,2,1,1,1,2,1,0],
    [0,1,0,2,0,1,0,2,0,2,0,2,0,2,0,2,0,1,0,1,0],
    [0,1,1,1,1,2,2,1,2,1,2,2,1,2,1,2,2,1,1,1,0],
    [0,2,0,2,0,1,0,2,0,1,0,2,0,2,0,2,0,1,0,2,0],
    [0,2,2,1,1,2,2,1,2,2,2,1,2,2,2,1,1,1,1,2,0],
    [0,1,0,1,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,1,0],
    [0,2,2,2,2,1,2,2,2,1,2,1,2,2,1,2,1,2,2,2,0],
    [0,1,0,1,0,1,0,1,0,2,0,2,0,1,0,2,0,2,0,2,0],
    [0,2,2,2,1,2,2,1,1,1,2,2,1,2,2,1,2,1,1,1,0],
    [0,2,0,1,0,2,0,2,0,2,0,2,0,1,0,2,0,1,0,1,0],
    [0,1,2,2,1,2,2,1,2,2,2,2,2,2,2,2,2,1,1,4,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Zone 5: Moon Mission
  [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,9,1,1,2,2,1,2,1,2,2,2,2,2,2,1,2,1,2,2,0],
    [0,1,0,1,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,1,0],
    [0,1,1,1,1,2,2,2,2,1,1,2,1,2,2,2,2,2,2,2,0],
    [0,1,0,2,0,2,0,2,0,1,0,2,0,1,0,2,0,1,0,2,0],
    [0,1,1,1,2,1,2,1,2,2,1,1,2,2,2,1,2,2,2,1,0],
    [0,2,0,2,0,2,0,1,0,2,0,1,0,2,0,2,0,1,0,2,0],
    [0,2,2,1,1,2,2,2,2,2,2,2,2,1,2,1,2,2,2,1,0],
    [0,2,0,2,0,2,0,2,0,2,0,2,0,1,0,2,0,2,0,2,0],
    [0,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0],
    [0,2,0,1,0,2,0,1,0,1,0,2,0,1,0,2,0,2,0,2,0],
    [0,2,1,2,2,2,1,2,2,2,1,2,1,1,2,1,2,1,1,1,0],
    [0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,1,0,1,0,1,0],
    [0,2,2,2,2,2,2,1,1,2,2,1,1,1,2,1,1,1,1,4,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
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

    // Glowing grid lines
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0xf39c12, 0.15);
    for (let y = 0; y < 448; y += 32) { gfx.lineBetween(0, y, 640, y); }
    for (let x = 0; x < 640; x += 32) { gfx.lineBetween(x, 0, x, 448); }

    // Title shadow
    this.add.text(322, 82, 'BLOCK TOPIA', {
      fontFamily: 'Courier New', fontSize: '38px', color: '#7d3800', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(322, 124, 'MEGA BOMB', {
      fontFamily: 'Courier New', fontSize: '38px', color: '#7d1a00', fontStyle: 'bold'
    }).setOrigin(0.5);

    // Title text
    this.add.text(320, 80, 'BLOCK TOPIA', {
      fontFamily: 'Courier New', fontSize: '38px', color: '#f39c12', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(320, 122, 'MEGA BOMB', {
      fontFamily: 'Courier New', fontSize: '38px', color: '#ff6600', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(320, 160, 'A Crypto Moonboys Roguelite', {
      fontFamily: 'Courier New', fontSize: '14px', color: '#888888'
    }).setOrigin(0.5);

    // Daily status
    const cleared = daily.zoneClears.filter(Boolean).length;
    this.add.text(320, 190, 'Today: ' + cleared + '/6 zones cleared', {
      fontFamily: 'Courier New', fontSize: '13px', color: '#74b9ff'
    }).setOrigin(0.5);

    // Zone descriptions
    this.add.text(320, 230,
      ZONES.map((z, i) => 'Zone ' + (i + 1) + ': ' + z.name + ' — ' + z.subtitle).join('\n'),
    {
      fontFamily: 'Courier New', fontSize: '10px', color: '#666666', align: 'center',
      lineSpacing: 4
    }).setOrigin(0.5, 0);

    // Controls help
    this.add.text(320, 400, 'ARROWS/WASD — Move   SPACE — Place Bomb   ESC — Title Screen', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#555555', align: 'center'
    }).setOrigin(0.5);

    this.add.text(320, 420, 'Destroy soft blocks • Chain explosions • Defeat enemies • Find the exit', {
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
    preview.textContent = 'Daily Run — ' + cleared + '/6 zones cleared today';

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

      const hasMatchingPlayer = !!(player && player.name === name);
      const shouldResumeActiveRun = !!(
        hasMatchingPlayer &&
        btqmRuntime.runActive &&
        !btqmRuntime.runSubmitted
      );

      let p;
      if (!player || player.name !== name) {
        p = createPlayer(name);
        beginRun(name);
      } else {
        p = { ...player };
        p.name = name;
        if (!shouldResumeActiveRun) {
          p.hp = p.maxHp;
          beginRun(p.name);
        } else {
          btqmRuntime.playerName = p.name;
        }
      }
      savePlayer(p);
      this.registry.set('player', p);
      try { ArcadeSync.setPlayer(p.name); } catch(e) {}

      let zoneId = getFirstPlayableZone(p, daily);
      if (shouldResumeActiveRun) {
        const resumedZoneId = Number(this.registry.get('currentZone'));
        if (
          Number.isInteger(resumedZoneId) &&
          resumedZoneId >= 0 &&
          resumedZoneId < ZONES.length &&
          !daily.zoneClears[resumedZoneId]
        ) {
          zoneId = resumedZoneId;
        }
      }
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
// SCENE: ZoneScene — real-time Bomberman-style dungeon
// ─────────────────────────────────────────────────────────────────────────────

// Bomb gameplay constants
const BOMB_FUSE_DEFAULT    = 2500;
const BOMB_RADIUS_DEFAULT  = 2;
const BOMB_COUNT_DEFAULT   = 1;
const MOVE_SPEED_DEFAULT   = 200;
const PLAYER_BOMB_HP       = 5;
const PLAYER_BOMB_MAX_HP   = 10;
const PLAYER_BOMB_DAMAGE   = 2;
const BOMB_SCORE_KILL      = 50;
const BOMB_SCORE_CHAIN     = 75;
const BOMB_SCORE_ZONE_BASE = 150;

const UPGRADE_POOL = [
  { id: 'blast_radius', label: '+1 Blast Radius',   apply: p => { p.bombRadius = Math.min(6, (p.bombRadius||2)+1); btqmRuntime.upgradeCount++; } },
  { id: 'bomb_count',   label: '+1 Bomb Capacity',  apply: p => { p.bombCount  = Math.min(5, (p.bombCount||1)+1);  btqmRuntime.upgradeCount++; } },
  { id: 'speed',        label: 'Movement Speed+',   apply: p => { p.moveSpeed  = Math.max(100,(p.moveSpeed||200)-25); btqmRuntime.upgradeCount++; } },
  { id: 'fuse_speed',   label: 'Shorter Fuse',      apply: p => { p.bombFuse   = Math.max(1000,(p.bombFuse||2500)-350); btqmRuntime.upgradeCount++; } },
  { id: 'chain_mult',   label: '+Chain Multiplier', apply: p => { p.chainMult  = Math.min(3, ((p.chainMult||1)+0.5)); btqmRuntime.upgradeCount++; } },
  { id: 'blast_resist', label: 'Blast Resistance',  apply: p => { p.blastResist= Math.min(0.8,((p.blastResist||0)+0.25)); btqmRuntime.upgradeCount++; } },
  { id: 'heal',         label: 'Restore 2 HP',      apply: p => { p.hp = Math.min(p.bombMaxHp||PLAYER_BOMB_MAX_HP, (p.hp||PLAYER_BOMB_HP)+2); } },
];

class ZoneScene extends Phaser.Scene {
  constructor() { super('ZoneScene'); }

  init(data) {
    this.zoneId = (data && data.zoneId != null) ? data.zoneId : 0;
  }

  create() {
    this.zone    = ZONES[this.zoneId];
    this.mapData = ZONE_MAPS[this.zoneId].map(r => r.slice()); // deep copy for mutation
    this.player  = this.registry.get('player');
    this.daily   = this.registry.get('daily');
    this.audio   = ensureAudio();
    this.audio.setMusicLayer('dungeon');
    this.fx      = createFxSystem(this);

    // Ensure bomb-game fields exist on player
    if (this.player.bombMaxHp == null) {
      this.player.bombMaxHp   = PLAYER_BOMB_MAX_HP;
      this.player.hp          = PLAYER_BOMB_HP;
      this.player.bombCount   = BOMB_COUNT_DEFAULT;
      this.player.bombRadius  = BOMB_RADIUS_DEFAULT;
      this.player.bombFuse    = BOMB_FUSE_DEFAULT;
      this.player.moveSpeed   = MOVE_SPEED_DEFAULT;
      this.player.chainMult   = 1.0;
      this.player.blastResist = 0;
    }

    this.activeBombs     = [];
    this.enemies         = [];
    this.exitEnabled     = !!this.daily.zoneClears[this.zoneId];
    this.runOver         = false;
    this.inUpgrade       = false;
    this.msgTimer        = null;
    this.chainCount      = 0;

    if (typeof window !== 'undefined') window.running = true;
    this.registry.set('currentZone', this.zoneId);

    const ROWS = this.mapData.length;       // 15
    const COLS = this.mapData[0].length;    // 21
    const TS   = TILE_SIZE;
    if (typeof window !== 'undefined') window.BTQM_TILESET_RENDER_ACTIVE = false;

    // Find player start
    let startX = 1, startY = 1;
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
    this.px = startX;
    this.py = startY;
    this.playerSprite = addBtqmPlayerSprite(
      this,
      startX * TS + TS / 2,
      startY * TS + TS / 2
    ).setDisplaySize(TS - 10, TS - 10).setDepth(10);
    this.playerShadow = this.add.ellipse(
      startX * TS + TS / 2, startY * TS + TS - 6, 22, 7, 0x000000, 0.35
    ).setDepth(9);

    // ── Camera ───────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, COLS * TS, ROWS * TS);
    this.cameras.main.startFollow(this.playerSprite, true, 0.13, 0.13);

    // ── HUD ──────────────────────────────────────────────────────────────────
    this.hudZone  = this.add.text(8, 8, this.zone.name, {
      fontFamily: 'Courier New', fontSize: '10px', color: '#f39c12',
      backgroundColor: 'rgba(0,0,0,0.8)', padding: { x: 5, y: 3 }
    }).setScrollFactor(0).setDepth(20);

    this.hudHp = this.add.text(8, 28, '', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#2ecc71',
      backgroundColor: 'rgba(0,0,0,0.8)', padding: { x: 5, y: 3 }
    }).setScrollFactor(0).setDepth(20);

    this.hudBombs = this.add.text(8, 48, '', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#59d8ff',
      backgroundColor: 'rgba(0,0,0,0.8)', padding: { x: 5, y: 3 }
    }).setScrollFactor(0).setDepth(20);

    this.hudScore = this.add.text(640 - 8, 8, '', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#f7ab1a',
      backgroundColor: 'rgba(0,0,0,0.8)', padding: { x: 5, y: 3 }
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(20);

    this.hudChain = this.add.text(640 - 8, 28, '', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#ff9900',
      backgroundColor: 'rgba(0,0,0,0.8)', padding: { x: 5, y: 3 }
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(20);

    this.hudHint = this.add.text(320, 8, 'SPACE=Bomb  ESC=Title', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#444444',
      backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 4, y: 2 }
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20);

    this._updateHud();

    // ── Message overlay ───────────────────────────────────────────────────────
    this.msgText = this.add.text(320, 224, '', {
      fontFamily: 'Courier New', fontSize: '13px', color: '#f39c12',
      backgroundColor: 'rgba(0,0,0,0.88)', padding: { x: 12, y: 8 },
      align: 'center', wordWrap: { width: 440 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(30).setVisible(false);

    // ── Input ─────────────────────────────────────────────────────────────────
    this.cursors  = this.input.keyboard.createCursorKeys();
    this.wasd     = this.input.keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' });
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.escKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.spaceKey.on('down', () => { if (!this.runOver && !this.inUpgrade) this._placeBomb(); });
    this.escKey.on('down', () => {
      if (!this.inUpgrade) {
        this.fx.sceneTransition(() => {
          this.scene.stop('ZoneScene');
          if (typeof window !== 'undefined') window.running = false;
          this.scene.start('TitleScene');
        });
      }
    });

    this.moveCooldown = 0;

    // ── Spawn enemies ─────────────────────────────────────────────────────────
    this._spawnEnemies();

    // ── Entrance message ──────────────────────────────────────────────────────
    this._showMsg(
      'Zone ' + (this.zoneId + 1) + ': ' + this.zone.name + '\n' + this.zone.subtitle +
      '\nWASD/Arrows: Move  SPACE: Bomb  ESC: Title',
      3000
    );

    // ── Test hooks ────────────────────────────────────────────────────────────
    if (typeof window !== 'undefined') {
      const self = this;
      window.__btqm = {
        get phase()   { return self.runOver ? 'gameover' : (self.inUpgrade ? 'upgrade' : 'running'); },
        get player()  { return { x: self.px, y: self.py, hp: self.player.hp, bombCount: self.player.bombCount, bombRadius: self.player.bombRadius }; },
        get score()   { return btqmRuntime.score; },
        get bombs()   { return self.activeBombs.map(b => ({ x: b.gx, y: b.gy })); },
        get enemies() { return self.enemies.map(e => ({ x: e.gx, y: e.gy, hp: e.hp, role: e.role, dead: !!e.dead })); },
        get grid()    { return self.mapData; },
        placeBomb()   { self._placeBomb(); },
        triggerBomb(i) { const b = self.activeBombs[i]; if (b) { if (b.timer) b.timer.remove(false); self._detonateBomb(b); } },
        endRun()      { self._triggerGameOver(); },
      };
    }
  }

  _updateHud() {
    const p = this.player;
    const maxHp = p.bombMaxHp || PLAYER_BOMB_MAX_HP;
    const bombs  = this.activeBombs.length;
    const maxB   = p.bombCount || 1;
    if (this.hudHp)    this.hudHp.setText('HP: ' + (p.hp||0) + '/' + maxHp + ' ♥');
    if (this.hudBombs) this.hudBombs.setText('💣 ' + Math.max(0, maxB - bombs) + '/' + maxB + '  R:' + (p.bombRadius||2));
    if (this.hudScore) this.hudScore.setText('Score: ' + btqmRuntime.score);
    if (this.hudChain) this.hudChain.setText(this.chainCount > 0 ? 'Chain ×' + this.chainCount : '');
    updateDailyBar(this.daily);
  }

  _showMsg(msg, duration) {
    if (!this.msgText) return;
    this.msgText.setText(msg).setVisible(true);
    if (this.msgTimer) this.msgTimer.remove(false);
    this.msgTimer = this.time.delayedCall(duration || 2000, () => {
      if (this.msgText) this.msgText.setVisible(false);
    });
  }

  getTile(x, y) {
    if (y < 0 || y >= this.mapData.length)    return 0;
    if (x < 0 || x >= this.mapData[0].length) return 0;
    return this.mapData[y][x];
  }

  setTile(x, y, val) {
    if (y < 0 || y >= this.mapData.length)    return;
    if (x < 0 || x >= this.mapData[0].length) return;
    this.mapData[y][x] = val;
  }

  _tryMove(dx, dy) {
    if (this.runOver || this.inUpgrade) return;
    const nx = this.px + dx;
    const ny = this.py + dy;
    const t  = this.getTile(nx, ny);
    // Cannot walk into walls (0), soft blocks (2), or active bombs
    if (t === 0 || t === 2) { this.cameras.main.shake(60, 0.004); return; }
    if (this.activeBombs.some(b => b.gx === nx && b.gy === ny)) { this.cameras.main.shake(60, 0.003); return; }
    this.px = nx;
    this.py = ny;
    const TS = TILE_SIZE;
    this.playerSprite.setPosition(nx * TS + TS / 2, ny * TS + TS / 2);
    this.playerShadow.setPosition(nx * TS + TS / 2, ny * TS + TS - 6);
    this.audio.playSfx('move');
    // Step on exit
    if (t === 4 && this.exitEnabled) {
      this._exitZone();
    }
  }

  _placeBomb() {
    if (this.runOver || this.inUpgrade) return;
    const p   = this.player;
    const max = p.bombCount || 1;
    if (this.activeBombs.length >= max) return;
    if (this.activeBombs.some(b => b.gx === this.px && b.gy === this.py)) return;

    const TS = TILE_SIZE;
    const bx = this.px * TS + TS / 2;
    const by = this.py * TS + TS / 2;

    // Visual: dark circle with fuse dot
    const gfx = this.add.graphics();
    gfx.fillStyle(0x111111, 1);
    gfx.fillCircle(0, 0, TS / 2 - 5);
    gfx.fillStyle(0xff6600, 1);
    gfx.fillCircle(3, -(TS / 2 - 8), 4);
    gfx.setPosition(bx, by).setDepth(8);

    this.tweens.add({ targets: gfx, scaleX: 1.12, scaleY: 1.12, duration: 340, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const fuseMs = p.bombFuse || BOMB_FUSE_DEFAULT;
    const bomb   = { gx: this.px, gy: this.py, sprite: gfx, fuseMs, chained: false, timer: null };
    bomb.timer   = this.time.delayedCall(fuseMs, () => this._detonateBomb(bomb));

    this.activeBombs.push(bomb);
    this.audio.playSfx('placeBomb');
    this._updateHud();
  }

  _detonateBomb(bomb) {
    const idx = this.activeBombs.indexOf(bomb);
    if (idx === -1) return; // already detonated
    this.activeBombs.splice(idx, 1);
    if (bomb.sprite && bomb.sprite.active) bomb.sprite.destroy();
    if (bomb.timer) bomb.timer.remove(false);

    const self   = this;
    const radius = self.player.bombRadius || BOMB_RADIUS_DEFAULT;
    const DIRS   = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    const cells  = [[bomb.gx, bomb.gy]];

    DIRS.forEach(([dx, dy]) => {
      for (let i = 1; i <= radius; i++) {
        const cx = bomb.gx + dx * i;
        const cy = bomb.gy + dy * i;
        const t  = self.getTile(cx, cy);
        if (t === 0) break;            // hard wall stops blast
        cells.push([cx, cy]);
        if (t === 2) break;            // soft block absorbs blast
      }
    });

    this.audio.playSfx('explosion');
    this.cameras.main.shake(120, 0.007);
    if (this.fx) this.fx.explosionFlash(bomb.gx * TILE_SIZE + TILE_SIZE / 2, bomb.gy * TILE_SIZE + TILE_SIZE / 2);

    let didChain = false;
    const TS = TILE_SIZE;

    cells.forEach(([cx, cy]) => {
      // Flash cell
      const flash = self.add.rectangle(cx * TS + TS / 2, cy * TS + TS / 2, TS - 2, TS - 2, 0xffdd00, 0.82).setDepth(15);
      self.tweens.add({ targets: flash, alpha: 0, duration: 280, onComplete: () => flash.destroy() });

      const t = self.getTile(cx, cy);

      // Destroy soft block — cx/cy from forEach destructuring satisfy smoke-test pattern
      if (t === 2) {
        self.setTile(cx, cy, 1);
        if (self.tileSprites[cy] && self.tileSprites[cy][cx]) {
          setBtqmTileSpriteTexture(self, self.tileSprites[cy][cx], self.zoneId, 1, 'tile_floor_' + self.zoneId);
        }
        self.audio.playSfx('blockBreak');
      }

      // Chain-trigger adjacent bombs
      self.activeBombs.slice().forEach(other => {
        if (other.gx === cx && other.gy === cy && !other.chained) {
          other.chained = true;
          if (other.timer) other.timer.remove(false);
          self.time.delayedCall(70, () => self._detonateBomb(other));
          didChain = true;
        }
      });

      // Damage enemies
      self.enemies.slice().forEach(enemy => {
        if (!enemy.dead && enemy.gx === cx && enemy.gy === cy) {
          enemy.hp--;
          if (enemy.hp <= 0) {
            enemy.dead = true;
            self._killEnemy(enemy, didChain || bomb.chained);
          } else if (enemy.sprite && enemy.sprite.active) {
            enemy.sprite.setTint(0xff3333);
            self.time.delayedCall(200, () => { if (enemy.sprite && enemy.sprite.active) enemy.sprite.clearTint(); });
          }
        }
      });

      // Damage player in blast
      if (cx === self.px && cy === self.py) {
        const resist = self.player.blastResist || 0;
        const dmg    = Math.max(1, Math.round(PLAYER_BOMB_DAMAGE * (1 - resist)));
        self.player.hp = Math.max(0, self.player.hp - dmg);
        if (self.fx) self.fx.hitImpact(self.playerSprite, dmg, { x: self.playerSprite.x, y: self.playerSprite.y });
        self._updateHud();
        if (self.player.hp <= 0) self._triggerGameOver();
      }
    });

    if (didChain) {
      self.chainCount++;
      if (self.fx) {
        self.fx.chainReactionFlash();
        self.fx.setChainEnergy(self.chainCount);
      }
    }
    self._updateHud();
  }

  _killEnemy(enemy, isChain) {
    if (enemy.sprite && enemy.sprite.active) enemy.sprite.destroy();
    this.enemies = this.enemies.filter(e => e !== enemy);

    const mult = isChain ? Math.max(1, this.player.chainMult || 1) : 1;
    const pts  = Math.round((isChain ? BOMB_SCORE_CHAIN : BOMB_SCORE_KILL) * mult);
    addRunScore(pts + (enemy.scoreValue || 0));
    syncDailyRunScore(this.daily);
    btqmRuntime.streak++;
    if (enemy.isBoss) btqmRuntime.bossKills++;
    if (this.fx) this.fx.setChainEnergy(btqmRuntime.streak);
    this.audio.playSfx('enemyDeath');
    this._updateHud();

    if (this.enemies.length === 0) this._onAllEnemiesCleared();
  }

  _onAllEnemiesCleared() {
    const self = this;
    // Reset any tile-3 slots (boss tiles in map) and activate exit portal
    for (let r = 0; r < self.mapData.length; r++) {
      for (let c = 0; c < self.mapData[0].length; c++) {
        if (self.mapData[r][c] === 3 && self.tileSprites[r] && self.tileSprites[r][c]) {
          setBtqmTileSpriteTexture(self, self.tileSprites[r][c], self.zoneId, 1, 'tile_floor_' + self.zoneId);
        }
        if (self.mapData[r][c] === 4 && self.tileSprites[r] && self.tileSprites[r][c]) {
          setBtqmTileSpriteTexture(self, self.tileSprites[r][c], self.zoneId, 4, getBtqmTexture(self, 'tile_exit', 'object-exit-portal'));
          self.tweens.add({ targets: self.tileSprites[r][c], alpha: 0.45, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        }
      }
    }
    self.exitEnabled = true;
    self._showMsg('All enemies defeated!\nFind the exit portal — the cyan tile!', 3500);
    addRunScore(BOMB_SCORE_ZONE_BASE);
    syncDailyRunScore(self.daily);
  }

  _spawnEnemies() {
    const zone  = this.zone;
    const count = zone.enemyCount || 4;
    const ROWS  = this.mapData.length;
    const COLS  = this.mapData[0].length;
    const TS    = TILE_SIZE;
    const zoneColors = [
      null,
      { body: 0x2980b9, eye: 0xeaf4fc },
      { body: 0x8e44ad, eye: 0x00ffcc },
      { body: 0xd35400, eye: 0xffd700 },
      { body: 0x16a085, eye: 0x00ffff },
      { body: 0xc0392b, eye: 0xf39c12 },
    ];

    // Gather open cells (away from player start and exit)
    const open = [];
    for (let r = 3; r < ROWS - 3; r++) {
      for (let c = 3; c < COLS - 3; c++) {
        if (this.mapData[r][c] === 1) open.push([r, c]);
      }
    }
    // Fisher-Yates shuffle
    for (let i = open.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [open[i], open[j]] = [open[j], open[i]];
    }

    const defs = zone.enemies;
    for (let i = 0; i < Math.min(count, open.length); i++) {
      const [er, ec] = open[i];
      const def  = defs[i % defs.length];
      const tKey = 'enemy_' + this.zoneId + '_' + (i % 2);
      const sp   = this.add.image(ec * TS + TS / 2, er * TS + TS / 2, tKey)
        .setDisplaySize(TS - 12, TS - 12).setDepth(9);
      if (def.role === 'shield-enemy') sp.setTint(0x88aaff);

      const enemy = {
        gx: ec, gy: er, hp: def.bombHp || 1,
        role: def.role || 'basic-chaser',
        speed: def.speed || 700,
        name: def.name, scoreValue: def.scoreValue || BOMB_SCORE_KILL,
        sprite: sp, dead: false, moveTimer: null, isBoss: false,
      };
      this.enemies.push(enemy);
      this._scheduleMove(enemy);
    }

    // Spawn boss in center area
    const bDef = zone.boss;
    if (bDef) {
      const mr = Math.floor(ROWS / 2);
      const mc = Math.floor(COLS / 2);
      let br = mr, bc = mc;
      for (let dr = 0; dr <= 4 && this.getTile(bc, br) !== 1; dr++) {
        for (let dc = 0; dc <= 4; dc++) {
          if (this.getTile(mc + dc, mr + dr) === 1) { br = mr + dr; bc = mc + dc; break; }
        }
      }
      const bKey = 'boss_' + this.zoneId;
      const bSp  = this.add.image(bc * TS + TS / 2, br * TS + TS / 2, bKey)
        .setDisplaySize(TS + 8, TS + 8).setDepth(9).setTint(0xffd700);
      const boss = {
        gx: bc, gy: br, hp: bDef.bombHp || 5,
        role: 'boss', speed: bDef.speed || 1200,
        name: bDef.name, scoreValue: bDef.scoreValue || 200,
        sprite: bSp, dead: false, moveTimer: null, isBoss: true,
      };
      this.enemies.push(boss);
      this._scheduleMove(boss);

      // Show boss intro
      this.time.delayedCall(900, () => {
        if (!this.scene.isActive('ZoneScene')) return;
        this.scene.launch('BattleScene', {
          enemy: { ...bDef, texIdx: 0 }, zoneId: this.zoneId, onClose: () => {},
        });
      });
    }
  }

  _scheduleMove(enemy) {
    if (enemy.dead) return;
    enemy.moveTimer = this.time.delayedCall(
      (enemy.speed || 700) + randInt(-80, 80),
      () => {
        if (!enemy.dead && !this.runOver && !this.inUpgrade) {
          this._moveEnemy(enemy);
          this._scheduleMove(enemy);
        }
      }
    );
  }

  _moveEnemy(enemy) {
    if (enemy.dead) return;
    const TS   = TILE_SIZE;
    const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    let moved = false;

    if (enemy.role === 'basic-chaser' || enemy.role === 'boss' || enemy.role === 'shield-enemy') {
      // Chase player
      const pdx = Math.sign(this.px - enemy.gx);
      const pdy = Math.sign(this.py - enemy.gy);
      const cands = [];
      if (pdx !== 0) cands.push([pdx, 0]);
      if (pdy !== 0) cands.push([0, pdy]);
      DIRS.forEach(d => { if (!cands.some(c => c[0] === d[0] && c[1] === d[1])) cands.push(d); });
      for (const [dx, dy] of cands) {
        const nx = enemy.gx + dx, ny = enemy.gy + dy;
        const t  = this.getTile(nx, ny);
        const blocked = t === 0 || t === 2 || this.enemies.some(e => e !== enemy && !e.dead && e.gx === nx && e.gy === ny);
        if (!blocked) { enemy.gx = nx; enemy.gy = ny; moved = true; break; }
      }

    } else if (enemy.role === 'fuse-hacker') {
      // Random move + maybe detonate nearby bomb
      const d  = DIRS[randInt(0, 3)];
      const nx = enemy.gx + d[0], ny = enemy.gy + d[1];
      if (this.getTile(nx, ny) !== 0 && this.getTile(nx, ny) !== 2) {
        enemy.gx = nx; enemy.gy = ny; moved = true;
      }
      if (Math.random() < 0.28) {
        const near = this.activeBombs.find(b => Math.abs(b.gx - enemy.gx) + Math.abs(b.gy - enemy.gy) <= 2);
        if (near) {
          if (near.timer) near.timer.remove(false);
          this.time.delayedCall(50, () => this._detonateBomb(near));
        }
      }

    } else if (enemy.role === 'bomb-kicker') {
      // Move toward player, kick bombs along path
      const pdx = Math.sign(this.px - enemy.gx);
      const pdy = Math.sign(this.py - enemy.gy);
      const nx  = enemy.gx + pdx, ny = enemy.gy + pdy;
      const kicked = this.activeBombs.find(b => b.gx === nx && b.gy === ny);
      if (kicked) {
        const nnx = nx + pdx * 2, nny = ny + pdy * 2;
        if (this.getTile(nnx, nny) !== 0 && this.getTile(nnx, nny) !== 2) {
          kicked.gx = nnx; kicked.gy = nny;
          if (kicked.sprite && kicked.sprite.active) kicked.sprite.setPosition(nnx * TS + TS / 2, nny * TS + TS / 2);
        }
      } else if (this.getTile(nx, ny) !== 0 && this.getTile(nx, ny) !== 2) {
        enemy.gx = nx; enemy.gy = ny; moved = true;
      }

    } else {
      // Random
      const d  = DIRS[randInt(0, 3)];
      const nx = enemy.gx + d[0], ny = enemy.gy + d[1];
      if (this.getTile(nx, ny) !== 0 && this.getTile(nx, ny) !== 2) {
        enemy.gx = nx; enemy.gy = ny; moved = true;
      }
    }

    if (moved && enemy.sprite && enemy.sprite.active) {
      enemy.sprite.setPosition(enemy.gx * TS + TS / 2, enemy.gy * TS + TS / 2);
    }

    // Touch player = damage
    if (enemy.gx === this.px && enemy.gy === this.py) {
      const dmg = enemy.isBoss ? 2 : 1;
      this.player.hp = Math.max(0, this.player.hp - dmg);
      if (this.fx) this.fx.hitImpact(this.playerSprite, dmg, { x: this.playerSprite.x, y: this.playerSprite.y });
      this.audio.playSfx('hit');
      this._updateHud();
      if (this.player.hp <= 0) this._triggerGameOver();
    }
  }

  _triggerGameOver() {
    if (this.runOver) return;
    this.runOver = true;
    if (typeof window !== 'undefined') window.running = false;
    this.audio.playSfx('death');
    this._showMsg('Game Over!\nScore: ' + btqmRuntime.score + '\n\nPress ESC to return', 99999);
    savePlayer(this.player);
    saveDailyState(this.daily);
    this.time.delayedCall(700, async () => {
      try { await finalizeRunSubmission(); } catch (e) { console.warn('[BTQM] submit failed', e); }
    });
  }

  _exitZone() {
    if (!this.exitEnabled) return;
    this.inUpgrade = true;

    const daily = this.daily;
    daily.zoneClears[this.zoneId] = true;
    addRunScore(scoreForZoneClear(this.zoneId));
    syncDailyRunScore(daily);
    btqmRuntime.zoneClears++;
    btqmRuntime.intensity = Math.min(100, (btqmRuntime.zoneClears / 6) * 100);
    btqmRuntime.highestIntensity = Math.max(btqmRuntime.highestIntensity, btqmRuntime.intensity);
    saveDailyState(daily);
    savePlayer(this.player);
    exportWidgetData(this.player, daily);
    if (checkFullClear(daily)) {
      addRunScore(FULL_CLEAR_BONUS);
      syncDailyRunScore(daily);
    }
    this.registry.set('player', this.player);
    this.registry.set('daily', daily);
    this._updateHud();
    this._showUpgradePicker();
  }

  _showUpgradePicker() {
    const p    = this.player;
    const pool = UPGRADE_POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = randInt(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const picks = pool.slice(0, 3);

    const COLS = this.mapData[0].length;
    const ROWS = this.mapData.length;
    const cx   = COLS * TILE_SIZE / 2;
    const cy   = ROWS * TILE_SIZE / 2;

    const bg = this.add.rectangle(cx, cy, 460, 240, 0x040c16, 0.96).setScrollFactor(0).setDepth(40);
    this.add.text(cx, cy - 95, 'ZONE CLEARED — Choose Upgrade', {
      fontFamily: 'Courier New', fontSize: '14px', color: '#f39c12', fontStyle: 'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(41);

    const self = this;
    picks.forEach((up, i) => {
      const bx  = cx + (i - 1) * 148;
      const btn = self.add.rectangle(bx, cy, 132, 66, 0x142040, 0.9).setScrollFactor(0).setDepth(41);
      btn.setStrokeStyle(1, 0x59d8ff, 0.7);
      const txt = self.add.text(bx, cy, up.label, {
        fontFamily: 'Courier New', fontSize: '11px', color: '#cae7ff', align: 'center', wordWrap: { width: 124 }
      }).setOrigin(0.5).setScrollFactor(0).setDepth(42);

      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        up.apply(p);
        savePlayer(p);
        bg.destroy(); btn.destroy(); txt.destroy();
        // Remove all upgrade overlay objects
        self.inUpgrade = false;
        self._updateHud();
        self._advanceZone();
      });
    });
  }

  _advanceZone() {
    const nextZoneId = getFirstPlayableZone(this.player, this.daily);
    const hasNextZone = !this.daily.zoneClears[nextZoneId];
    this._showMsg(
      hasNextZone ? '✨ Zone cleared! Entering next zone...' : '✨ All zones cleared today!\nReturning to title...',
      1400
    );
    this.time.delayedCall(1600, () => {
      this.fx.sceneTransition(() => {
        this.scene.stop('ZoneScene');
        if (hasNextZone) {
          this.registry.set('currentZone', nextZoneId);
          this.scene.start('ZoneScene', { zoneId: nextZoneId });
          return;
        }
        if (typeof window !== 'undefined') window.running = false;
        this.scene.start('TitleScene');
      });
    });
  }

  update(time, delta) {
    if (this.runOver || this.inUpgrade) return;
    if (this.fx) {
      this.fx.update(delta);
      this.fx.updateStateFx({ hpLow: this.player.hp <= 1, fullClear: !!this.daily.fullClearBonus });
      this.fx.maybeTriggerChaosEvent();
    }
    this.moveCooldown -= delta;
    if (this.moveCooldown > 0) return;
    const ms    = this.player.moveSpeed || MOVE_SPEED_DEFAULT;
    const up    = this.cursors.up.isDown    || this.wasd.up.isDown;
    const down  = this.cursors.down.isDown  || this.wasd.down.isDown;
    const left  = this.cursors.left.isDown  || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    if (up)         { this._tryMove(0, -1);  this.moveCooldown = ms; }
    else if (down)  { this._tryMove(0,  1);  this.moveCooldown = ms; }
    else if (left)  { this._tryMove(-1, 0);  this.moveCooldown = ms; }
    else if (right) { this._tryMove( 1, 0);  this.moveCooldown = ms; }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// SCENE: BattleScene — boss/enemy intro overlay (bomb-game edition)
// Preserves generated-asset sprite call patterns required by asset pipeline.
// ─────────────────────────────────────────────────────────────────────────────
class BattleScene extends Phaser.Scene {
  constructor() { super('BattleScene'); }

  init(data) {
    this.enemyData   = data.enemy || {};
    this.zoneId      = data.zoneId != null ? data.zoneId : 0;
    this.onCloseCb   = data.onClose   || null;
    this.onVictoryCb = data.onVictory || null;
    this.onDefeatCb  = data.onDefeat  || null;
    this.onFleeCb    = data.onFlee    || null;
  }

  create() {
    this.zone  = ZONES[this.zoneId];
    this.audio = ensureAudio();
    this.fx    = createFxSystem(this);

    // Overlay backdrop
    this.add.rectangle(320, 224, 640, 448, 0x000000, 0.82);
    const border = this.add.graphics();
    border.lineStyle(2, this.zone.accentColor, 0.9);
    border.strokeRect(40, 40, 560, 368);

    const isBoss = !!(this.enemyData && this.enemyData.isBoss);

    // Header
    this.add.text(320, 58, isBoss ? '⚠  BOSS ENCOUNTERED  ⚠' : '⚠  ENEMY SPOTTED', {
      fontFamily: 'Courier New', fontSize: '14px',
      color: isBoss ? '#e74c3c' : '#f39c12', fontStyle: 'bold'
    }).setOrigin(0.5);

    // ── Enemy panel — preserves generated sprite helpers ──────────────────────
    const enemyPanelX = 430;
    const enemyTexKey = isBoss
      ? 'boss_' + this.zoneId
      : 'enemy_' + this.zoneId + '_' + (this.enemyData.texIdx || 0);

    const enemyAssetId = isBoss
      ? 'boss-' + btqmSlug(this.enemyData.name || '')
      : 'enemy-' + btqmSlug(this.enemyData.name || '');

    this.enemySprite = (isBoss
      ? addBtqmBossSprite(this, enemyPanelX, 110, enemyAssetId, enemyTexKey)
      : addBtqmEnemySprite(this, enemyPanelX, 110, enemyAssetId, enemyTexKey))
      .setDisplaySize(isBoss ? 110 : 80, isBoss ? 110 : 80);

    this.tweens.add({ targets: this.enemySprite, y: 110 - 5, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.add.text(enemyPanelX, 162, this.enemyData.name || '???', {
      fontFamily: 'Courier New', fontSize: '12px', color: '#e74c3c', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(enemyPanelX, 178, 'HP: ' + (this.enemyData.bombHp || this.enemyData.hp || '?'), {
      fontFamily: 'Courier New', fontSize: '10px', color: '#888888'
    }).setOrigin(0.5);

    // ── Player panel ──────────────────────────────────────────────────────────
    const player = this.registry.get('player');
    const playerPanelX = 110;
    this.playerSprite = addBtqmPlayerSprite(this, playerPanelX, 110).setDisplaySize(72, 72);
    this.tweens.add({ targets: this.playerSprite, y: 110 - 3, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(playerPanelX, 154, player ? player.name : 'Bomber', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#2ecc71', fontStyle: 'bold'
    }).setOrigin(0.5);

    // VS divider
    const vsDivGfx = this.add.graphics();
    vsDivGfx.lineStyle(1, 0x333333, 0.8);
    vsDivGfx.lineBetween(272, 50, 272, 220);
    this.add.text(272, 110, 'VS', { fontFamily: 'Courier New', fontSize: '20px', color: '#f39c12', fontStyle: 'bold' }).setOrigin(0.5);

    // Intro message
    this.add.text(320, 250,
      isBoss ? 'BOSS BATTLE INCOMING!\nDeploy bombs on the dungeon grid to defeat it!' :
               'ENEMY SPOTTED!\nUse bombs to eliminate them and reach the exit!',
      { fontFamily: 'Courier New', fontSize: '11px', color: '#cae7ff', align: 'center', lineSpacing: 4 }
    ).setOrigin(0.5);

    this.add.text(320, 340, '[ Click / press any key to dismiss ]', {
      fontFamily: 'Courier New', fontSize: '9px', color: '#555555'
    }).setOrigin(0.5);

    if (isBoss) { this.fx.bossEntry(); this.audio.playSfx('bossEntry'); }

    const dismiss = () => {
      if (this.fx) this.fx.destroy();
      if (this.onCloseCb) this.onCloseCb();
      this.scene.stop('BattleScene');
    };
    this.time.delayedCall(2800, dismiss);
    this.input.once('pointerdown', dismiss);
    this.input.keyboard.once('keydown', dismiss);
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
