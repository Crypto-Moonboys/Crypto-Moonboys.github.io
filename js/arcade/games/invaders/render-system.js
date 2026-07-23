/**
 * render-system.js — all canvas drawing for Invaders 3008.
 *
 * Exports createRenderer(ctx, W, H) which returns a renderer object.
 * The renderer is pure canvas writes — it never mutates game state.
 */

import { POWERUP_COLORS, POWERUP_ICONS, POWERUP_DURATION } from './powerup-system.js';
import { WAVE_BOSS, BUNKER_BLOCK_W, BUNKER_BLOCK_H } from './invader-system.js';
import { UPGRADE_DEFS, UPGRADE_COLORS, RARITY_COLORS } from './upgrade-system.js';
import { BOSS_ARCHETYPE_DEFS } from './boss-archetypes.js';

// Boss phase colour palette — shared between drawBoss() and the phase label.
const BOSS_PHASE_COLORS = ['#ff4444', '#ff8800', '#ff0055'];

// ── Player-ship sprite loader ─────────────────────────────────────────────────
// Loads a transparent PNG asset for the player ship.
// Falls back to full primitive rendering when the asset is missing, still
// loading, or invalid.  No gameplay logic is touched.
//
// PLAYER_SHIP_ASSET_W / _H are the hitbox contract dimensions that must match
// SHIP_W/SHIP_H in bootstrap.js.  The loaded sprite is drawn at its natural
// (visual) dimensions, anchored to the hitbox's bottom-centre, so wider
// artwork (e.g. Bitcoin Cannon) is presented without distortion while keeping
// collision boundaries unchanged.
const PLAYER_SHIP_ASSET_W = 36;
const PLAYER_SHIP_ASSET_H = 20;
const PLAYER_SHIP_VISUAL_H = 40;
const PLAYER_SHIP_ASSET_SRC = '/games/invaders-3008/assets/ships/player-ship.png?v=bitcoin-cannon-level-1-20260711';

const _playerShip = (() => {
  if (typeof Image === 'undefined') return { status: 'unsupported', image: null };
  const entry = { status: 'loading', image: new Image() };
  entry.image.decoding = 'async';
  entry.image.onload = () => {
    const h = entry.image.naturalHeight;
    if (h > 0) {
      entry.status = 'ready';
    } else {
      entry.status = 'error';
      console.warn('[invaders] player-ship asset reported zero height. Using primitive fallback.');
    }
  };
  entry.image.onerror = () => { entry.status = 'error'; };
  entry.image.src = PLAYER_SHIP_ASSET_SRC;
  return entry;
})();

/** Returns the loaded player-ship Image, or null when the primitive should be used. */
function getPlayerShipImage() {
  return _playerShip.status === 'ready' ? _playerShip.image : null;
}

/** Exposed for integration tests only — do not use in gameplay code. */
export const __playerShipLoader = _playerShip;

// ── Bitcoin projectile sprite loader ──────────────────────────────────────────
const BITCOIN_PROJECTILE_SRC = '/art/invaders/generated/invaders-3008-bitcoin-projectile-transparent.png?v=bitcoin-projectile-wtf-20260711';
const _bitcoinProjectile = (() => {
  if (typeof Image === 'undefined') return { status: 'unsupported', image: null };
  const entry = { status: 'loading', image: new Image() };
  entry.image.decoding = 'async';
  entry.image.onload = () => { entry.status = entry.image.naturalWidth > 0 ? 'ready' : 'error'; };
  entry.image.onerror = () => { entry.status = 'error'; };
  entry.image.src = BITCOIN_PROJECTILE_SRC;
  return entry;
})();

// Full Meme Swarm — individual transparent PNGs supplied for Invaders 3008.
// The order is a stable gameplay contract: an invader's seed deterministically
// selects one sprite, so its identity never changes between frames.
const MEME_ENEMY_FILES = [
  '41810c66-ee60-46d0-8766-6095a9956746.png',
  'e-bitcoin.png',
  'invaders-3008-ape-1.png', 'invaders-3008-ape-2.png', 'invaders-3008-ape-3.png',
  'invaders-3008-catlash-2.png', 'invaders-3008-catlash.png',
  'invaders-3008-davy.png', 'invaders-3008-frank-1.png', 'invaders-3008-frank-2.png',
  'invaders-3008-godammm.png', 'invaders-3008-og-bear.png',
  'invaders-3008-og-bob-bot.png', 'invaders-3008-og-boby-bobber.png',
  'invaders-3008-og-king-gee.png', 'invaders-3008-ogbull.png',
  'invaders-3008-pepe.png', 'invaders-3008-pepe2.png',
  'invaders-3008-shib-1.png', 'invaders-3008-shib-2.png', 'invaders-3008-shib-3.png',
  'invaders-3008-uni-1.png', 'invaders-3008-uni-2.png', 'invaders-3008-uni-3.png',
  'invaders-dfrog-1.png',
];
const MEME_FX_COLORS = [
  '#ff3158','#ffd43b','#ff6b2b','#ff2ed1','#ad5cff',
  '#2ee8ff','#ff4fd1','#ff7849','#9cff31','#f7c948',
  '#ff173d','#9b7bff','#00e5ff','#ff9f1c','#f72585',
  '#ff3b30','#42f56c','#18d966','#ff8c42','#f0d44b',
  '#ff3f81','#bc6cff','#00d9ff','#fc49a3','#65ff45',
];

const _memeEnemies = MEME_ENEMY_FILES.map((file) => {
  if (typeof Image === 'undefined') return { status: 'unsupported', image: null, file };
  const entry = { status: 'loading', image: new Image(), file };
  entry.image.decoding = 'async';
  entry.image.onload = () => { entry.status = entry.image.naturalWidth > 0 ? 'ready' : 'error'; };
  entry.image.onerror = () => { entry.status = 'error'; };
  entry.image.src = '/art/invaders/generated/' + file + '?v=meme-swarm-png-20260712';
  return entry;
});


// ── BTC bunker sprite loader ──────────────────────────────────────────────────
const BTC_BUNKER_ASSET_VERSION = 'btc-bunkers-native-20260722';
const BTC_BUNKER_ASSETS = Array.from({ length: 10 }, (_, index) => {
  if (typeof Image === 'undefined') return { status: 'unsupported', image: null, stage: index + 1 };
  const entry = { status: 'loading', image: new Image(), stage: index + 1 };
  entry.image.decoding = 'async';
  entry.image.onload = () => { entry.status = entry.image.naturalWidth > 0 ? 'ready' : 'error'; };
  entry.image.onerror = () => { entry.status = 'error'; };
  entry.image.src = `/art/invaders/generated/invaders-btc-${index + 1}.png?v=${BTC_BUNKER_ASSET_VERSION}`;
  return entry;
});
const BTC_BUNKER_FALLBACK_RATIO = 1.85;
const _bunkerVisualState = typeof WeakMap === 'undefined' ? null : new WeakMap();

function getBtcBunkerImage(stage) {
  const entry = BTC_BUNKER_ASSETS[stage - 1] || BTC_BUNKER_ASSETS[0];
  return entry && entry.status === 'ready' ? entry.image : null;
}

function getBunkerVisualState(bunker) {
  if (!_bunkerVisualState || !bunker) return null;

  let state = _bunkerVisualState.get(bunker);
  const remainingMaxHp = bunker.reduce((sum, blk) => sum + Math.max(0, Number(blk.maxHp) || 0), 0);
  const remainingHp = bunker.reduce((sum, blk) => sum + Math.max(0, Number(blk.hp) || 0), 0);
  if (!state) {
    state = { maxHp: remainingMaxHp, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    _bunkerVisualState.set(bunker, state);
  }

  state.maxHp = Math.max(state.maxHp || 0, remainingMaxHp, remainingHp);
  for (const blk of bunker) {
    const x = Number(blk.x);
    const y = Number(blk.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    state.minX = Math.min(state.minX, x);
    state.minY = Math.min(state.minY, y);
    state.maxX = Math.max(state.maxX, x + BUNKER_BLOCK_W);
    state.maxY = Math.max(state.maxY, y + BUNKER_BLOCK_H);
  }

  return state;
}

/** Exposed for integration tests only — do not use in gameplay code. */
export const __btcBunkerLoader = BTC_BUNKER_ASSETS;

function memeSpriteIndex(inv) {
  const seed = Number.isFinite(inv.seed) ? inv.seed : 0;
  const row = Number.isFinite(inv.row) ? inv.row : 0;
  return Math.abs(Math.floor(seed * 10007 + row * 97)) % MEME_ENEMY_FILES.length;
}


/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W  canvas logical width
 * @param {number} H  canvas logical height
 */
export function createRenderer(ctx, W, H) {

  // ── Internal helpers ────────────────────────────────────────────────────────

  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

  function drawHitTint(x, y, w, h, hitFrac) {
    if (hitFrac <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.42, hitFrac * 0.42);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  // ── Ship ─────────────────────────────────────────────────────────────────────

  function drawShipPrimitive(x, y, w, h) {
    ctx.fillStyle = '#2ec5ff';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w,     y + h);
    ctx.lineTo(x,         y + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a8eaff';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.55, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(x + w / 2 - 4, y + h - 6, 8, 6);
    ctx.fillStyle = '#1a9acc';
    ctx.fillRect(x,         y + h - 8, 8, 4);
    ctx.fillRect(x + w - 8, y + h - 8, 8, 4);
  }

  function drawShip(player) {
    const { x, y, w, h, shielded } = player;
    const shipImg = getPlayerShipImage();
    if (shipImg) {
      // Asset path: draw sprite at its natural visual dimensions, anchored to
      // the hitbox bottom-centre.  This lets wider artwork (e.g. Bitcoin Cannon)
      // render without distortion while gameplay hitbox stays at w×h.
      const natW = shipImg.naturalWidth;
      const natH = shipImg.naturalHeight;
      // Scale visual height to match the hitbox height; scale width proportionally.
      const scale   = PLAYER_SHIP_VISUAL_H / natH;
      const visualW = natW * scale;
      const visualH = PLAYER_SHIP_VISUAL_H;
      // Anchor: bottom-centre of hitbox; artwork rises above the collision box.
      const drawX = x + w / 2 - visualW / 2;
      const drawY = y + h - visualH;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(shipImg, drawX, drawY, visualW, visualH);
      ctx.restore();
    } else {
      // Primitive fallback — always safe
      drawShipPrimitive(x, y, w, h);
    }
    if (shielded) {
      ctx.save();
      ctx.strokeStyle = 'rgba(63,185,80,0.7)';
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 12;
      ctx.shadowColor = '#3fb950';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, w * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // ── Invader type renderers ────────────────────────────────────────────────────

  function drawInvaderBasic(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffbbee' : '#ff4fd1';
    ctx.fillRect(x + 3, y + 4, w - 6, h - 6);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x + 8,      y + 8, 5, 5);
    ctx.fillRect(x + w - 13, y + 8, 5, 5);
    ctx.strokeStyle = '#ff4fd1';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(x + 5,     y + h - 2); ctx.lineTo(x,     y + h + 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - 5, y + h - 2); ctx.lineTo(x + w, y + h + 4); ctx.stroke();
  }

  function drawInvaderFast(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffe0a0' : '#f7c948';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 2);
    ctx.lineTo(x + w - 2, y + h - 2);
    ctx.lineTo(x + 2,     y + h - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + w / 2 - 5, y + 3, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w / 2 + 5, y + 3, 2, 0, Math.PI * 2); ctx.fill();
  }

  function drawInvaderTank(x, y, w, h, hitFrac, hpRatio) {
    ctx.fillStyle = hitFrac > 0 ? '#b0ffb0' : '#3fb950';
    ctx.fillRect(x + 2, y + 3, w - 4, h - 5);
    ctx.fillStyle = '#2a8040';
    ctx.fillRect(x,         y + 6, 5, h - 10);
    ctx.fillRect(x + w - 5, y + 6, 5, h - 10);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x + 7,      y + 7, 7, 7);
    ctx.fillRect(x + w - 14, y + 7, 7, 7);
    if (hpRatio < 1) {
      ctx.fillStyle = '#222';
      ctx.fillRect(x, y + h + 1, w, 3);
      ctx.fillStyle = hpRatio > 0.5 ? '#3fb950' : '#f7c948';
      ctx.fillRect(x, y + h + 1, w * hpRatio, 3);
    }
  }

  function drawInvaderShooter(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ddc0ff' : '#bc8cff';
    ctx.fillRect(x + 3, y + 3, w - 6, h - 7);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x + 9,      y + 7, 5, 5);
    ctx.fillRect(x + w - 14, y + 7, 5, 5);
    ctx.fillStyle = '#9060cc';
    ctx.fillRect(x + w / 2 - 2, y + h - 4, 4, 7);
  }

  function drawInvaderShield(x, y, w, h, hitFrac, shieldFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#aaddff' : '#2ec5ff';
    ctx.fillRect(x + 3, y + 4, w - 6, h - 6);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x + 8,      y + 8, 5, 5);
    ctx.fillRect(x + w - 13, y + 8, 5, 5);
    if (shieldFrac > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(46,197,255,' + (0.35 + shieldFrac * 0.45) + ')';
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 8;
      ctx.shadowColor = '#2ec5ff';
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r  = w * 0.65;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 - Math.PI / 6;
        if (k === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        else         ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  function drawInvaderBomber(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffd4a0' : '#ff8c00';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cc5500';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hitFrac > 0 ? '#fff' : '#ffcc44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 5);
    ctx.lineTo(x + w / 2, y - 2);
    ctx.stroke();
  }

  function drawInvaderHunter(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffaaaa' : '#cc1111';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4,     y + h - 4);
    ctx.lineTo(x,         y + h + 4);
    ctx.moveTo(x + w - 4, y + h - 4);
    ctx.lineTo(x + w,     y + h + 4);
    ctx.stroke();
  }

  function drawInvaderZigzag(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffffaa' : '#ffff00';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 2);
    ctx.lineTo(x + w - 2, y + h / 2);
    ctx.lineTo(x + w / 2, y + h - 2);
    ctx.lineTo(x + 2,     y + h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawInvaderSplitter(x, y, w, h, hitFrac, hpRatio) {
    ctx.fillStyle = hitFrac > 0 ? '#aaffff' : '#00cccc';
    ctx.beginPath();
    ctx.arc(x + w / 2 - 6, y + h / 2, w / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + w / 2 + 6, y + h / 2, w / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#006666';
    ctx.fillRect(x + w / 2 - 4, y + h / 2 - 3, 8, 6);
    if (hpRatio < 1) {
      ctx.fillStyle = '#111';
      ctx.fillRect(x, y + h + 1, w, 3);
      ctx.fillStyle = hpRatio > 0.5 ? '#00cccc' : '#f7c948';
      ctx.fillRect(x, y + h + 1, w * hpRatio, 3);
    }
  }

  function drawInvaderHealer(x, y, w, h, hitFrac) {
    ctx.save();
    ctx.fillStyle = hitFrac > 0 ? '#aaffaa' : '#00cc44';
    ctx.shadowBlur  = 8;
    ctx.shadowColor = '#00ff44';
    ctx.fillRect(x + w / 2 - 4, y + 3,     8,     h - 6);
    ctx.fillRect(x + 3,          y + h / 2 - 4, w - 6, 8);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawInvaderSniper(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffbbbb' : '#aa0000';
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    // Targeting reticle
    ctx.strokeStyle = hitFrac > 0 ? '#fff' : '#ff4444';
    ctx.lineWidth = 1;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r  = 7;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r - 3, cy); ctx.lineTo(cx + r + 3, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r - 3); ctx.lineTo(cx, cy + r + 3); ctx.stroke();
  }

  function drawInvaderKamikaze(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffddb0' : '#ff6600';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h);      // tip pointing down
    ctx.lineTo(x + 2,     y + 2);
    ctx.lineTo(x + w - 2, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.45, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawInvaderCloaked(x, y, w, h, hitFrac, cloakAlpha) {
    const alpha = cloakAlpha !== undefined ? cloakAlpha : 1;
    ctx.save();
    ctx.globalAlpha = alpha * (hitFrac > 0 ? 0.9 : 1);
    ctx.fillStyle = hitFrac > 0 ? '#ddbbff' : '#9933ff';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 2);
    ctx.lineTo(x + w - 2, y + h - 2);
    ctx.lineTo(x + 2,     y + h - 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#cc00ff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawInvaderGolden(x, y, w, h, hitFrac, elapsed) {
    const t   = elapsed || 0;
    const spins = 5;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(t * 1.2);
    ctx.fillStyle = hitFrac > 0 ? '#ffffaa' : '#f7c948';
    ctx.shadowBlur  = 12;
    ctx.shadowColor = '#f7c948';
    for (let k = 0; k < spins; k++) {
      const a0 = (k / spins) * Math.PI * 2 - Math.PI / 2;
      const a1 = a0 + Math.PI / spins;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a0) * (w / 2 - 3), Math.sin(a0) * (h / 2 - 3));
      ctx.lineTo(Math.cos(a1) * (w / 4),     Math.sin(a1) * (h / 4));
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawInvaderCursed(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffbbff' : '#cc00cc';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffaaff';
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('☠', x + w / 2, y + h / 2);
    ctx.textBaseline = 'alphabetic';
  }

  // Meme Mode keeps the original lightweight procedural renderer, but replaces
  // anonymous alien geometry with recognisable coin-culture silhouettes.  The
  // seed makes a formation varied yet stable from frame to frame.
  const MEME_STYLE = {
    basic:    ['frog', '#55d94b', '#173b1a'], fast:     ['doge', '#f7b955', '#6b3515'],
    tank:     ['ape', '#a97858', '#241a18'], shooter:  ['wojak', '#d9d9d9', '#4a4a55'],
    shield:   ['cat', '#8c5cff', '#21174d'], bomber:   ['poop', '#9b552f', '#3c1d10'],
    hunter:   ['pepe', '#42c957', '#112f17'], zigzag:  ['unicorn', '#f7f7ff', '#6f3cff'],
    splitter: ['twins', '#25d9df', '#083b48'], healer: ['moon', '#ffe66d', '#735800'],
    sniper:   ['skull', '#eeeeee', '#321020'], kamikaze:['rocket', '#ff7043', '#501010'],
    cloaked:  ['ghost', '#bd68ff', '#321055'], golden: ['coin', '#ffd43b', '#6b3d00'],
    cursed:   ['rug', '#ff3bd4', '#4a123e'],
  };

  function memeEye(cx, cy, r, angry, laser) {
    ctx.fillStyle = laser ? '#ff284c' : '#fff';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = laser ? '#fff' : '#080b12';
    ctx.beginPath(); ctx.arc(cx + (angry ? 1 : 0), cy, Math.max(1.2, r * 0.42), 0, Math.PI * 2); ctx.fill();
    if (laser) {
      ctx.strokeStyle = 'rgba(255,25,70,.55)'; ctx.lineWidth = 1; ctx.shadowBlur = 7; ctx.shadowColor = '#ff1744';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 13); ctx.stroke(); ctx.shadowBlur = 0;
    }
  }

  function drawMemeEnemy(inv, hf, hpRatio, elapsed) {
    const [kind, color, dark] = MEME_STYLE[inv.type] || MEME_STYLE.basic;
    const x = inv.x, y = inv.y, w = inv.w, h = inv.h;
    const cx = x + w / 2, cy = y + h / 2;
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 5 + inv.seed);
    // These are hostile corrupted memes, never friendly emoji faces.
    const angry = true;
    ctx.save();
    if (kind === 'ghost') ctx.globalAlpha = Math.max(.22, inv.cloakAlpha ?? 1);
    ctx.shadowBlur = 5 + pulse * 5; ctx.shadowColor = color;
    ctx.fillStyle = hf > 0 ? '#fff' : color; ctx.strokeStyle = dark; ctx.lineWidth = 2;

    if (kind === 'rocket') {
      ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(x + w - 5, y + h - 6); ctx.lineTo(cx, y + h - 2); ctx.lineTo(x + 5, y + h - 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#58e7ff'; ctx.beginPath(); ctx.arc(cx, cy - 3, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pulse > .5 ? '#fff42d' : '#ff3b21'; ctx.fillRect(cx - 4, y + h - 3, 8, 6);
    } else if (kind === 'coin' || kind === 'moon') {
      ctx.beginPath(); ctx.arc(cx, cy, h * .46, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dark; ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(kind === 'coin' ? '₿' : '☾', cx, cy + 1);
    } else if (kind === 'poop') {
      ctx.beginPath(); ctx.moveTo(x + 4, y + h - 3); ctx.quadraticCurveTo(cx, y - 8, x + w - 4, y + h - 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      memeEye(cx - 6, cy + 2, 3, true, angry); memeEye(cx + 6, cy + 2, 3, true, angry);
    } else {
      // Face base plus type-specific ears/horns/crowns.
      if (kind === 'cat' || kind === 'doge') { ctx.beginPath(); ctx.moveTo(x + 3,y + 8); ctx.lineTo(x + 7,y); ctx.lineTo(x + 13,y + 7); ctx.moveTo(x+w-13,y+7); ctx.lineTo(x+w-7,y); ctx.lineTo(x+w-3,y+8); ctx.fill(); ctx.stroke(); }
      if (kind === 'unicorn') { ctx.fillStyle='#ffd43b'; ctx.beginPath(); ctx.moveTo(cx,y-7); ctx.lineTo(cx+4,y+5); ctx.lineTo(cx-4,y+5); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = hf > 0 ? '#fff' : color; ctx.beginPath(); ctx.ellipse(cx, cy, w * .43, h * .43, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (kind === 'twins') { ctx.strokeStyle='#fff'; ctx.beginPath(); ctx.moveTo(cx,y+3); ctx.lineTo(cx,y+h-3); ctx.stroke(); }
      memeEye(cx - 7, cy - 2, kind === 'frog' || kind === 'pepe' ? 4.5 : 3.4, true, hf > 0 || kind === 'skull');
      memeEye(cx + 7, cy - 2, kind === 'frog' || kind === 'pepe' ? 4.5 : 3.4, true, hf > 0 || kind === 'skull');
      // Thick inward-sloping brows instantly remove the emoji/smiley read.
      ctx.shadowBlur = 0; ctx.strokeStyle = dark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx-13,cy-9); ctx.lineTo(cx-3,cy-5); ctx.moveTo(cx+13,cy-9); ctx.lineTo(cx+3,cy-5); ctx.stroke();
      // Black snarl with bright uneven teeth and corner fangs.
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(cx-12,cy+5); ctx.quadraticCurveTo(cx,cy-1,cx+12,cy+5); ctx.quadraticCurveTo(cx,cy+15,cx-12,cy+5); ctx.fill();
      ctx.fillStyle = '#fff2cf';
      for (let tooth = -2; tooth <= 2; tooth++) {
        const tx = cx + tooth * 4;
        ctx.beginPath(); ctx.moveTo(tx-2,cy+5); ctx.lineTo(tx+2,cy+5); ctx.lineTo(tx,cy+9+(Math.abs(tooth)%2)); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#ff3158'; ctx.fillRect(cx-5,cy+11,10,2);
      if (kind === 'skull') { ctx.fillStyle=dark; ctx.fillRect(cx-6,cy+8,3,4); ctx.fillRect(cx+3,cy+8,3,4); }
      if (kind === 'rug') { ctx.strokeStyle='#ffe65c'; for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(x+5+i*8,y+h-3);ctx.lineTo(x+3+i*8,y+h+4);ctx.stroke();} }
    }
    ctx.restore();
    // Animated spawn/build brackets and circulating coin pixels make the
    // existing primitive style feel intentionally holographic.
    ctx.save(); ctx.globalAlpha = .38 + pulse * .42; ctx.strokeStyle = inv.mutations?.length ? '#ff42e6' : '#ff3158'; ctx.lineWidth = 1;
    const pad = 2 + pulse * 2; ctx.strokeRect(x-pad, y-pad, w+pad*2, h+pad*2);
    ctx.fillStyle = '#ffd43b'; const a = elapsed * 2.4 + inv.seed; ctx.fillRect(cx+Math.cos(a)*22-1,cy+Math.sin(a)*16-1,3,3); ctx.restore();
    if (hpRatio < 1) { ctx.fillStyle='#160817'; ctx.fillRect(x,y+h+2,w,3); ctx.fillStyle=hpRatio>.5?'#ffd43b':'#ff3158'; ctx.fillRect(x,y+h+2,w*hpRatio,3); }
  }

  function drawPngMemeEnemy(inv, hf, hpRatio, elapsed) {
    const index = memeSpriteIndex(inv);
    const entry = _memeEnemies[index];
    if (!entry || entry.status !== 'ready') {
      drawMemeEnemy(inv, hf, hpRatio, elapsed);
      return;
    }

    const x = inv.x, y = inv.y, w = inv.w, h = inv.h;
    const cx = x + w / 2, cy = y + h / 2;
    const color = MEME_FX_COLORS[index];
    const mode = index % 5;
    const pulse = .5 + .5 * Math.sin(elapsed * (4.5 + mode * .35) + inv.seed);
    const damage = 1 - hpRatio;
    const visualH = Math.max(34, h * 1.42);
    const visualW = Math.min(48, visualH * entry.image.naturalWidth / entry.image.naturalHeight);
    const drawX = cx - visualW / 2;
    const drawY = cy - visualH / 2;

    ctx.save();
    // A different live aura language for each fifth of the 25-piece roster.
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.globalAlpha = .18 + pulse * .22;
    ctx.shadowBlur = 9 + pulse * 9; ctx.shadowColor = color;
    if (mode === 0) {
      ctx.beginPath(); ctx.arc(cx, cy, 17 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
    } else if (mode === 1) {
      ctx.strokeRect(x - 3 - pulse * 2, y - 3 - pulse * 2, w + 6 + pulse * 4, h + 6 + pulse * 4);
    } else if (mode === 2) {
      for (let k=0;k<4;k++) { const a=elapsed*2+inv.seed+k*Math.PI/2; ctx.fillRect(cx+Math.cos(a)*21-1,cy+Math.sin(a)*15-1,2,2); }
    } else if (mode === 3) {
      ctx.beginPath(); for(let k=0;k<6;k++){const a=k*Math.PI/3; const px=cx+Math.cos(a)*21, py=cy+Math.sin(a)*16; k?ctx.lineTo(px,py):ctx.moveTo(px,py);} ctx.closePath(); ctx.stroke();
    } else {
      for(let k=-1;k<=1;k++){ctx.beginPath();ctx.moveTo(cx-22,cy+k*7+pulse*2);ctx.lineTo(cx+22,cy+k*7-pulse*2);ctx.stroke();}
    }
    ctx.restore();

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // Surviving a hit permanently drains colour and brightness. The immediate
    // impact also jolts, squashes and white-flashes the art.
    const hitJolt = hf * Math.sin(elapsed * 95 + inv.seed) * 3;
    ctx.translate(cx + hitJolt, cy);
    ctx.rotate(hf * Math.sin(elapsed * 70 + inv.seed) * .12);
    ctx.scale(1 + hf * .16, 1 - hf * .18);
    ctx.translate(-cx, -cy);
    const brightness = Math.max(.42, 1 - damage * .52) + hf * 1.2;
    const grayscale = Math.min(1, damage * .72 + hf * .8);
    ctx.filter = `brightness(${brightness}) grayscale(${grayscale}) contrast(${1 + hf * .8}) drop-shadow(0 0 ${5 + hf*9}px ${color})`;
    ctx.globalAlpha = Math.max(.52, 1 - damage * .28);
    ctx.drawImage(entry.image, drawX, drawY, visualW, visualH);
    ctx.restore();

    // Damage cracks and chromatic glitch slices remain procedural and cheap.
    if (damage > 0 || hf > 0) {
      ctx.save(); ctx.globalAlpha = .35 + damage * .5; ctx.strokeStyle = hf > 0 ? '#fff' : color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx-7,drawY+5); ctx.lineTo(cx-2,cy-3); ctx.lineTo(cx-6,cy+4); ctx.lineTo(cx+2,drawY+visualH-3); ctx.stroke();
      if (hf > 0) { ctx.globalCompositeOperation='screen'; ctx.fillStyle=color; ctx.fillRect(drawX-3,cy-5,visualW+6,2); ctx.fillRect(drawX+3,cy+4,visualW-3,2); }
      ctx.restore();
    }
    if (hpRatio < 1) { ctx.fillStyle='#160817'; ctx.fillRect(x,y+h+3,w,3); ctx.fillStyle=hpRatio>.5?'#ffd43b':'#ff3158'; ctx.fillRect(x,y+h+3,w*hpRatio,3); }
  }

  function drawInvader(inv, elapsed) {
    const hf      = clamp(inv.hitTimer / 0.12, 0, 1);
    const sf      = inv.maxShieldHp > 0 ? inv.shieldHp / inv.maxShieldHp : 0;
    const hpRatio = clamp(inv.hp / inv.maxHp, 0, 1);
    drawPngMemeEnemy(inv, hf, hpRatio, elapsed || 0);
    drawHitTint(inv.x, inv.y, inv.w, inv.h, hf);
    if (sf > 0 && inv.type !== 'shield') {
      ctx.save();
      ctx.strokeStyle = 'rgba(46,197,255,' + (0.35 + sf * 0.45) + ')';
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 8;
      ctx.shadowColor = '#2ec5ff';
      ctx.beginPath();
      ctx.arc(inv.x + inv.w / 2, inv.y + inv.h / 2, inv.w * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // Mutation indicator: small coloured ring
    if (inv.mutations && inv.mutations.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#bc8cff';
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(inv.x + inv.w / 2, inv.y + inv.h / 2, inv.w * 0.58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // ── Boss ──────────────────────────────────────────────────────────────────────

  function drawBoss(b, phase) {
    const isShooting = b.flashTimer > 0;
    const isHit      = b.hitTimer > 0;
    const cx         = b.x + b.w / 2;
    const cut        = 10;

    // Determine colour from archetype if available, else fall back to phase colours
    const archetype   = b.archetypeId
      ? BOSS_ARCHETYPE_DEFS.find(a => a.id === b.archetypeId)
      : null;
    const phaseColors = BOSS_PHASE_COLORS;
    const baseColor   = archetype ? archetype.color : phaseColors[(phase || 1) - 1];
    const bodyColor   = isHit ? '#ffd3d3' : isShooting ? '#ff2f2f' : baseColor;

    ctx.save();
    ctx.shadowBlur  = phase === 3 ? 28 : 18;
    ctx.shadowColor = baseColor;
    ctx.fillStyle   = bodyColor;

    // theWall: heavier rectangular shape
    if (b.archetypeId === 'theWall') {
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.fill();
      ctx.fillStyle = isHit ? '#ffd3d3' : '#555';
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    } else if (b.archetypeId === 'theGlitchCore') {
      // Glitch: jittery polygon
      ctx.beginPath();
      const jitter = () => (Math.random() - 0.5) * 6;
      ctx.moveTo(cx + jitter(),         b.y + jitter());
      ctx.lineTo(b.x + b.w + jitter(),  b.y + b.h / 2 + jitter());
      ctx.lineTo(cx + jitter(),         b.y + b.h + jitter());
      ctx.lineTo(b.x + jitter(),        b.y + b.h / 2 + jitter());
      ctx.closePath();
      ctx.fill();
    } else {
      // Default hexagonal body
      ctx.beginPath();
      ctx.moveTo(cx - b.w / 2 + cut, b.y);
      ctx.lineTo(cx + b.w / 2 - cut, b.y);
      ctx.lineTo(cx + b.w / 2,       b.y + cut);
      ctx.lineTo(cx + b.w / 2,       b.y + b.h - cut);
      ctx.lineTo(cx + b.w / 2 - cut, b.y + b.h);
      ctx.lineTo(cx - b.w / 2 + cut, b.y + b.h);
      ctx.lineTo(cx - b.w / 2,       b.y + b.h - cut);
      ctx.lineTo(cx - b.w / 2,       b.y + cut);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Eyes
    ctx.fillStyle  = '#fff';
    ctx.beginPath(); ctx.arc(cx - 16, b.y + 14, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 16, b.y + 14, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle  = archetype ? archetype.color : '#ff0000';
    ctx.beginPath(); ctx.arc(cx - 16, b.y + 14, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 16, b.y + 14, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawHitTint(b.x, b.y, b.w, b.h, isHit ? 1 : 0);
    if (isShooting) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#ff2f2f';
      ctx.fillRect(b.x, b.y - 3, b.w, b.h + 6);
      ctx.restore();
    }

    // HP bar
    ctx.fillStyle   = '#333';
    ctx.fillRect(b.x, b.y - 10, b.w, 6);
    ctx.fillStyle   = archetype ? archetype.color : '#f7c948';
    ctx.fillRect(b.x, b.y - 10, b.w * clamp(b.hpDisplay / b.maxHp, 0, 1), 6);
    ctx.strokeStyle = '#555';
    ctx.lineWidth   = 1;
    ctx.strokeRect(b.x, b.y - 10, b.w, 6);

    // Label (archetype or generic)
    const bossLabel  = archetype ? archetype.label : ('BOSS ' + (phase === 3 ? '⚡' : ''));
    const phaseText  = archetype
      ? (phase === 3 ? archetype.phase3Text : phase === 2 ? archetype.phase2Text : null)
      : ['P1', 'P2', '⚡P3'][(phase || 1) - 1];
    const labelColor = archetype ? archetype.color : phaseColors[(phase || 1) - 1];
    ctx.fillStyle   = labelColor;
    ctx.font        = 'bold 9px system-ui';
    ctx.textAlign   = 'center';
    ctx.fillText(bossLabel, b.x + b.w / 2, b.y - 14);
    if (phaseText) {
      ctx.fillStyle = phaseColors[(phase || 1) - 1];
      ctx.font      = 'bold 8px system-ui';
      ctx.fillText(phaseText, b.x + b.w / 2, b.y - 23);
    }
  }

  // ── Background ────────────────────────────────────────────────────────────────

  function drawBackground(elapsed, wave, stars) {
    const glow = 8 + Math.sin(elapsed * 0.8) * 3;
    const bg   = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#090c16');
    bg.addColorStop(1, '#060912');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      const alpha = 0.2 + s.z * 0.6;
      const r     = 0.8 + s.z * 1.4;
      ctx.fillStyle = 'rgba(90,170,255,' + alpha + ')';
      ctx.fillRect(s.x, s.y, r, r);
    }
    ctx.strokeStyle = 'rgba(63,185,80,0.06)';
    ctx.lineWidth   = 1;
    const yOffset = (elapsed * 18) % 40;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin((elapsed + x) * 0.01) * 2, 0);
      ctx.lineTo(x + Math.sin((elapsed + x) * 0.01) * 2, H);
      ctx.stroke();
    }
    for (let y = -40; y < H + 40; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y + yOffset);
      ctx.lineTo(W, y + yOffset);
      ctx.stroke();
    }
    ctx.shadowBlur  = glow;
    ctx.shadowColor = 'rgba(63,185,80,0.2)';
    ctx.strokeStyle = 'rgba(63,185,80,0.25)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, H - 30);
    ctx.lineTo(W, H - 30);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ── Bunkers ───────────────────────────────────────────────────────────────────

  function drawBunkers(bunkers) {
    for (const bunker of bunkers) {
      if (!bunker || bunker.length === 0) continue;

      const state = getBunkerVisualState(bunker);
      const remainingHp = bunker.reduce((sum, blk) => sum + Math.max(0, Number(blk.hp) || 0), 0);
      const maxHp = Math.max(0, Number(state && state.maxHp) || 0);
      if (remainingHp <= 0 || maxHp <= 0) continue;

      const damageRatio = clamp(1 - remainingHp / maxHp, 0, 1);
      const stage = clamp(Math.floor(damageRatio * BTC_BUNKER_ASSETS.length) + 1, 1, BTC_BUNKER_ASSETS.length);
      const image = getBtcBunkerImage(stage);
      if (!image) continue;

      const oldW = Math.max(BUNKER_BLOCK_W, state.maxX - state.minX);
      const oldH = Math.max(BUNKER_BLOCK_H, state.maxY - state.minY);
      const sourceRatio = image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : BTC_BUNKER_FALLBACK_RATIO;
      const targetH = Math.max(oldH + 18, Math.min(72, oldW * 0.72));
      const targetW = Math.min(oldW + 48, targetH * sourceRatio);
      const cx = state.minX + oldW / 2;
      const bottom = state.maxY + 10;

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(image, cx - targetW / 2, bottom - targetH, targetW, targetH);
      ctx.restore();
    }
  }

  // ── Effects ───────────────────────────────────────────────────────────────────

  function drawEffects(particles, scoreTexts, hitFlashes) {
    for (const f of hitFlashes) {
      const a = f.life / f.maxLife;
      ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.35) + ')';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1 + (1 - a) * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle   = p.color;
      ctx.globalAlpha = a;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.globalAlpha = 1;
    }
    ctx.font      = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    for (const s of scoreTexts) {
      const a = clamp(s.life / s.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle   = s.color;
      ctx.fillText(s.text, s.x, s.y);
      ctx.globalAlpha = 1;
    }
  }

  // ── Powerup items ──────────────────────────────────────────────────────────────

  function drawPowerupItems(powerupItems) {
    for (const p of powerupItems) {
      const col = POWERUP_COLORS[p.type] || '#fff';
      ctx.save();
      ctx.fillStyle    = col;
      ctx.strokeStyle  = '#fff';
      ctx.lineWidth    = 1.5;
      ctx.shadowBlur   = 8;
      ctx.shadowColor  = col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur   = 0;
      ctx.fillStyle    = '#111';
      ctx.font         = 'bold 8px system-ui';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(POWERUP_ICONS[p.type] || '?', p.x, p.y);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }
  }

  // ── Active powerup pills ──────────────────────────────────────────────────────

  function drawActivePowerupOverlay(activePowerups) {
    if (activePowerups.size === 0) return;
    let px     = 12;
    const py   = H - 26;
    for (const [type, data] of activePowerups) {
      const col = POWERUP_COLORS[type] || '#fff';
      ctx.globalAlpha = 0.85;
      ctx.fillStyle   = col;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px, py, 30, 14, 4);
      else ctx.rect(px, py, 30, 14);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle   = '#111';
      ctx.font        = 'bold 8px system-ui';
      ctx.textAlign   = 'left';
      ctx.fillText(POWERUP_ICONS[type] || type, px + 3, py + 10);
      if (data.timer !== Infinity) {
        const ratio = clamp(data.timer / POWERUP_DURATION, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(px, py + 11, 30, 3);
        ctx.fillStyle = col;
        ctx.fillRect(px, py + 11, 30 * ratio, 3);
      }
      px += 34;
    }
  }

  // ── Combo overlay ─────────────────────────────────────────────────────────────

  function drawComboOverlay(streak, streakTimer) {
    if (streak < 3) return;
    const alpha = Math.min(1, streakTimer / 1.8);
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = '#f7c948';
    ctx.shadowBlur  = 8;
    ctx.shadowColor = '#f7c948';
    ctx.font        = 'bold 14px system-ui';
    ctx.textAlign   = 'right';
    ctx.fillText('COMBO \xd7' + streak, W - 10, 22);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  // ── Wave intro ────────────────────────────────────────────────────────────────

  function drawWaveIntro(waveIntroTimer, wave, waveDuration) {
    if (waveIntroTimer <= 0) return;
    const fade  = Math.min(1, waveIntroTimer / 0.4, (waveDuration - waveIntroTimer) / 0.4 + 0.1);
    const isBoss = wave % WAVE_BOSS === 0;
    const label  = isBoss ? 'BOSS WAVE ' + wave : 'WAVE ' + wave;
    const color  = isBoss ? '#ff4444' : '#3fb950';
    ctx.globalAlpha = clamp(fade, 0, 1);
    ctx.font        = 'bold 36px system-ui';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = color;
    ctx.shadowBlur  = 20;
    ctx.shadowColor = color;
    ctx.fillText(label, W / 2, H / 2 - 10);
    ctx.shadowBlur  = 0;
    if (isBoss) {
      ctx.fillStyle = '#ff8888';
      ctx.font      = '18px system-ui';
      ctx.fillText('Incoming threat!', W / 2, H / 2 + 22);
    }
    ctx.globalAlpha = 1;
  }

  // ── Drone companion ───────────────────────────────────────────────────────────

  function drawDrone(player, droneAngle) {
    const cx = player.x + player.w / 2 + Math.cos(droneAngle) * 44;
    const cy = player.y + player.h / 2 + Math.sin(droneAngle) * 28;
    ctx.save();
    ctx.shadowBlur  = 10;
    ctx.shadowColor = '#f7c948';
    ctx.fillStyle   = '#f7c948';
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#090c16';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Upgrade screen ────────────────────────────────────────────────────────────

  function drawUpgradeScreen(choices, upgrades) {
    const safeChoices = Array.isArray(choices) ? choices.slice(0, 3) : [];
    const upgradeLevels = upgrades || {};
    const time = typeof performance !== 'undefined' ? performance.now() * 0.001 : Date.now() * 0.001;

    function roundPath(x, y, w, h, r) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
    }

    function fillRound(x, y, w, h, r, fillStyle) {
      ctx.fillStyle = fillStyle;
      roundPath(x, y, w, h, r);
      ctx.fill();
    }

    function strokeRound(x, y, w, h, r, strokeStyle, lineWidth = 1, glow = 0) {
      ctx.save();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.shadowBlur = glow;
      ctx.shadowColor = strokeStyle;
      roundPath(x, y, w, h, r);
      ctx.stroke();
      ctx.restore();
    }

    function drawWrappedText(text, x, y, maxWidth, lineHeight, maxLines) {
      const words = String(text || '').split(/\s+/).filter(Boolean);
      let line = '';
      let lines = 0;
      for (const word of words) {
        const testLine = line ? line + ' ' + word : word;
        if (ctx.measureText(testLine).width > maxWidth && line) {
          ctx.fillText(line, x, y + lines * lineHeight);
          lines++;
          line = word;
          if (lines >= maxLines - 1) break;
        } else {
          line = testLine;
        }
      }
      if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
    }

    // Neon command-room overlay replaces the previous flat canvas cards.
    ctx.save();
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#030613');
    bg.addColorStop(0.45, '#080d24');
    bg.addColorStop(1, '#12051f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 0.22;
    for (let x = -40; x < W + 80; x += 32) {
      ctx.strokeStyle = x % 64 === 0 ? '#2ee8ff' : '#7d5cff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(time + x) * 8, 0);
      ctx.lineTo(x - 90, H);
      ctx.stroke();
    }
    for (let y = 22; y < H; y += 28) {
      ctx.strokeStyle = '#ff2ed1';
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(time * 1.4 + y) * 3);
      ctx.lineTo(W, y - Math.sin(time * 1.1 + y) * 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const panelX = 24;
    const panelY = 26;
    const panelW = W - 48;
    const panelH = 102;
    const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
    panelGrad.addColorStop(0, 'rgba(46,232,255,0.18)');
    panelGrad.addColorStop(0.55, 'rgba(255,46,209,0.16)');
    panelGrad.addColorStop(1, 'rgba(247,201,72,0.15)');
    fillRound(panelX, panelY, panelW, panelH, 22, panelGrad);
    strokeRound(panelX, panelY, panelW, panelH, 22, '#2ee8ff', 2, 28);
    strokeRound(panelX + 5, panelY + 5, panelW - 10, panelH - 10, 18, 'rgba(255,46,209,0.75)', 1, 16);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f7c948';
    ctx.font = 'bold 11px system-ui';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#f7c948';
    ctx.fillText('PERK DROP UNLOCKED', W / 2, panelY + 26);
    ctx.fillStyle = '#f8fbff';
    ctx.font = '900 35px system-ui';
    ctx.shadowBlur = 24;
    ctx.shadowColor = '#2ee8ff';
    ctx.fillText('WAVE COMPLETE', W / 2, panelY + 65);
    ctx.shadowColor = '#ff2ed1';
    ctx.font = 'bold 13px system-ui';
    ctx.fillText('Choose your next moonboy mod  ·  press 1 / 2 / 3', W / 2, panelY + 88);
    ctx.shadowBlur = 0;

    const cardW = Math.min(150, (W - 64) / 3);
    const cardH = 184;
    const gap = Math.max(10, (W - 48 - cardW * 3) / 2);
    const totalW = 3 * cardW + 2 * gap;
    const startX = (W - totalW) / 2;
    const cardY = 146;

    for (let i = 0; i < safeChoices.length; i++) {
      const def = safeChoices[i];
      const cx = startX + i * (cardW + gap);
      const col = UPGRADE_COLORS[def.id] || '#2ee8ff';
      const curLevel = upgradeLevels[def.id] || 0;
      const maxLevel = Math.max(1, def.maxLevel || 1);
      const atMax = curLevel >= maxLevel;
      const rarity = def.rarity || 'common';
      const rarityCol = atMax ? '#6b7280' : (RARITY_COLORS[rarity] || col);
      const pulse = 18 + Math.sin(time * 3 + i) * 5;

      ctx.save();
      ctx.shadowBlur = pulse;
      ctx.shadowColor = rarityCol;
      const cardGrad = ctx.createLinearGradient(cx, cardY, cx + cardW, cardY + cardH);
      cardGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
      cardGrad.addColorStop(0.38, 'rgba(18,22,42,0.98)');
      cardGrad.addColorStop(1, atMax ? 'rgba(30,32,40,0.98)' : rarityCol + '22');
      fillRound(cx, cardY, cardW, cardH, 18, cardGrad);
      ctx.restore();
      strokeRound(cx, cardY, cardW, cardH, 18, rarityCol, 2.5, atMax ? 0 : 20);

      // Rarity ribbon.
      fillRound(cx + 12, cardY + 10, cardW - 24, 20, 10, atMax ? 'rgba(85,85,85,0.95)' : rarityCol);
      ctx.fillStyle = '#06101a';
      ctx.font = '900 9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText((atMax ? 'MAXED' : rarity).toUpperCase(), cx + cardW / 2, cardY + 24);

      // Big key badge.
      ctx.fillStyle = '#030613';
      ctx.shadowBlur = 14;
      ctx.shadowColor = rarityCol;
      ctx.beginPath();
      ctx.arc(cx + 27, cardY + 50, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = rarityCol;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#f8fbff';
      ctx.font = '900 23px system-ui';
      ctx.fillText(String(i + 1), cx + 27, cardY + 58);

      // Icon / mini hero portrait area.
      const portraitX = cx + cardW / 2;
      const portraitY = cardY + 61;
      ctx.save();
      ctx.globalAlpha = atMax ? 0.45 : 1;
      ctx.fillStyle = rarityCol + '33';
      ctx.beginPath();
      ctx.arc(portraitX, portraitY, 31, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rarityCol;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = 'bold 34px system-ui';
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 18;
      ctx.shadowColor = rarityCol;
      ctx.fillText(def.icon || '✦', portraitX, portraitY + 12);
      ctx.restore();

      ctx.fillStyle = atMax ? '#777' : '#f8fbff';
      ctx.font = '900 13px system-ui';
      drawWrappedText(def.label, cx + cardW / 2, cardY + 105, cardW - 18, 14, 2);

      ctx.fillStyle = atMax ? '#666' : '#b7c2d8';
      ctx.font = '11px system-ui';
      drawWrappedText(atMax ? 'MAXED OUT' : def.desc, cx + cardW / 2, cardY + 133, cardW - 20, 13, 2);

      const pipTotal = cardW - 30;
      const pipStep = pipTotal / maxLevel;
      const pipW = Math.max(5, pipStep - 3);
      for (let lv = 0; lv < maxLevel; lv++) {
        fillRound(cx + 15 + lv * pipStep, cardY + 162, pipW, 7, 3, lv < curLevel ? rarityCol : 'rgba(255,255,255,0.12)');
      }
      ctx.fillStyle = atMax ? '#777' : rarityCol;
      ctx.font = 'bold 10px system-ui';
      ctx.fillText(atMax ? 'LEVEL MAX' : 'LEVEL ' + curLevel + '  →  ' + (curLevel + 1), cx + cardW / 2, cardY + 181);
    }

    ctx.restore();
  }

  // ── Warning / event banners ────────────────────────────────────────────────────

  function drawWarningBanner(banner) {
    if (!banner || banner.timer <= 0) return;
    const alpha = Math.min(1, banner.timer / 0.5, banner.timer);
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle   = banner.color || '#ff4444';
    ctx.shadowBlur  = 16;
    ctx.shadowColor = banner.color || '#ff4444';
    ctx.font        = 'bold 20px system-ui';
    ctx.textAlign   = 'center';
    ctx.fillText(banner.text, W / 2, 36);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawEventBanner(banner) {
    if (!banner || banner.timer <= 0) return;
    const alpha = Math.min(1, banner.timer / 0.3, banner.timer);
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1) * 0.92;
    ctx.fillStyle   = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H / 2 - 22, W, 44);
    ctx.fillStyle   = banner.color || '#f7c948';
    ctx.shadowBlur  = 12;
    ctx.shadowColor = banner.color || '#f7c948';
    ctx.font        = 'bold 16px system-ui';
    ctx.textAlign   = 'center';
    ctx.fillText(banner.text, W / 2, H / 2 + 6);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawMutationFlash(intensity) {
    if (!intensity || intensity <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(intensity * 0.4, 0, 0.4);
    ctx.fillStyle   = '#bc8cff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Asteroids ──────────────────────────────────────────────────────────────────

  function drawAsteroids(asteroids) {
    if (!asteroids || !asteroids.length) return;
    for (const a of asteroids) {
      ctx.save();
      ctx.fillStyle   = '#555566';
      ctx.shadowBlur  = 4;
      ctx.shadowColor = '#888';
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Crack lines
      ctx.strokeStyle = '#333';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(a.x - a.r * 0.3, a.y - a.r * 0.2);
      ctx.lineTo(a.x + a.r * 0.2, a.y + a.r * 0.4);
      ctx.moveTo(a.x + a.r * 0.1, a.y - a.r * 0.5);
      ctx.lineTo(a.x - a.r * 0.3, a.y + a.r * 0.1);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Laser warning ──────────────────────────────────────────────────────────────

  function drawLaserWarning(laserWarning) {
    if (!laserWarning) return;
    const alpha = laserWarning.fired ? 0 : Math.min(1, laserWarning.chargeTimer * 0.8);
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.strokeStyle = laserWarning.fired ? '#ff0000' : '#ff8800';
    ctx.lineWidth   = laserWarning.fired ? 6 : 2;
    ctx.shadowBlur  = laserWarning.fired ? 20 : 8;
    ctx.shadowColor = '#ff4400';
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(laserWarning.x, 0);
    ctx.lineTo(laserWarning.x, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Mini enemies ───────────────────────────────────────────────────────────────

  function drawMiniEnemies(miniEnemies) {
    if (!miniEnemies || !miniEnemies.length) return;
    for (const m of miniEnemies) {
      ctx.save();
      ctx.fillStyle   = m.hitTimer > 0 ? '#ffd0a0' : '#ff8c00';
      ctx.shadowBlur  = 10;
      ctx.shadowColor = '#ff8c00';
      ctx.beginPath();
      const cx = m.x + m.w / 2;
      ctx.moveTo(cx,         m.y);
      ctx.lineTo(m.x + m.w, m.y + m.h / 2);
      ctx.lineTo(cx,         m.y + m.h);
      ctx.lineTo(m.x,        m.y + m.h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur  = 0;
      // HP bar
      ctx.fillStyle = '#333';
      ctx.fillRect(m.x, m.y - 8, m.w, 4);
      ctx.fillStyle = '#ff8c00';
      ctx.fillRect(m.x, m.y - 8, m.w * clamp(m.hp / m.maxHp, 0, 1), 4);
      ctx.restore();
    }
  }

  // ── EMP overlay ────────────────────────────────────────────────────────────────

  function drawEmpOverlay(empActive, empTimer) {
    if (!empActive) return;
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
    ctx.save();
    ctx.globalAlpha = 0.12 * pulse;
    ctx.fillStyle   = '#2ec5ff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#2ec5ff';
    ctx.font        = 'bold 11px system-ui';
    ctx.textAlign   = 'center';
    ctx.fillText('EMP ACTIVE ' + (empTimer || 0).toFixed(1) + 's', W / 2, H - 44);
    ctx.restore();
  }

  // ── Panic mode indicator ──────────────────────────────────────────────────────

  function drawPanicMode(panicMode, panicTimer, elapsed) {
    if (!panicMode) return;
    const pulse = 0.6 + 0.4 * Math.sin((elapsed || 0) * 8);
    ctx.save();
    ctx.globalAlpha = pulse * 0.18;
    ctx.fillStyle   = '#ff4444';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#ff4444';
    ctx.shadowBlur  = 10;
    ctx.shadowColor = '#ff4444';
    ctx.font        = 'bold 14px system-ui';
    ctx.textAlign   = 'center';
    ctx.fillText('⚠ PANIC MODE ' + (panicTimer || 0).toFixed(1) + 's ⚠', W / 2, H - 56);
    ctx.shadowBlur  = 0;
    ctx.restore();
  }

  // ── Active modifier pill ──────────────────────────────────────────────────────

  function drawActiveModifier(activeModifier) {
    if (!activeModifier) return;
    const col = activeModifier.color || '#f7c948';
    ctx.save();
    ctx.fillStyle   = 'rgba(0,0,0,0.6)';
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(W / 2 - 62, 2, 124, 18, 5);
    else ctx.rect(W / 2 - 62, 2, 124, 18);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle   = col;
    ctx.shadowBlur  = 6;
    ctx.shadowColor = col;
    ctx.font        = 'bold 10px system-ui';
    ctx.textAlign   = 'center';
    ctx.fillText('⚡ ' + activeModifier.label, W / 2, 14);
    ctx.shadowBlur  = 0;
    ctx.restore();
  }

  // ── Risk/reward screen ────────────────────────────────────────────────────────

  function drawRiskRewardScreen(choices) {
    ctx.fillStyle = 'rgba(40, 5, 5, 0.94)';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.shadowBlur  = 14;
    ctx.shadowColor = '#ff4444';
    ctx.fillStyle   = '#ff4444';
    ctx.font        = 'bold 22px system-ui';
    ctx.textAlign   = 'center';
    ctx.fillText('CHOOSE YOUR FATE', W / 2, 70);
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#f7c948';
    ctx.font        = '13px system-ui';
    ctx.fillText('Risk vs. Reward  ( 1 / 2 )', W / 2, 95);
    ctx.restore();

    const cardW  = 150;
    const cardH  = 140;
    const gap    = 20;
    const totalW = 2 * cardW + gap;
    const startX = (W - totalW) / 2;
    const cardY  = 118;

    const riskColors = { high: '#ff4444', medium: '#f7c948', none: '#3fb950' };
    for (let i = 0; i < choices.length; i++) {
      const def  = choices[i];
      const cx   = startX + i * (cardW + gap);
      const col  = riskColors[def.risk] || '#888';
      ctx.fillStyle = 'rgba(20, 5, 5, 0.96)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx, cardY, cardW, cardH, 10);
      else               ctx.rect(cx, cardY, cardW, cardH);
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 8;
      ctx.shadowColor = col;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx, cardY, cardW, cardH, 10);
      else               ctx.rect(cx, cardY, cardW, cardH);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      ctx.fillStyle = col;
      ctx.font      = 'bold 22px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), cx + cardW / 2, cardY + 30);

      ctx.fillStyle = '#eee';
      ctx.font      = 'bold 12px system-ui';
      ctx.fillText(def.label, cx + cardW / 2, cardY + 55);

      ctx.fillStyle = '#8b949e';
      ctx.font      = '10px system-ui';
      // Wrap description across 2 lines roughly
      const words = def.desc.split(' ');
      let line = '';
      let lineY = cardY + 75;
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > cardW - 16) {
          ctx.fillText(line, cx + cardW / 2, lineY);
          line  = word;
          lineY += 13;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, cx + cardW / 2, lineY);

      ctx.fillStyle = col;
      ctx.font      = 'bold 9px system-ui';
      ctx.fillText('RISK: ' + (def.risk || '?').toUpperCase(), cx + cardW / 2, cardY + cardH - 10);
    }
  }

  // ── Screen flash ──────────────────────────────────────────────────────────────

  function drawScreenFlash(flashTimer) {
    if (flashTimer <= 0) return;
    const MAX_FLASH = 0.35;
    ctx.fillStyle   = 'rgba(255, 255, 255, ' + Math.min(0.55, (flashTimer / MAX_FLASH) * 0.55) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  // ── Intensity feedback ────────────────────────────────────────────────────────

  /** Red vignette overlay that grows with intensity above 30. */
  function drawIntensityFeedback(intensity, elapsed) {
    if (intensity < 30) return;
    const t     = (intensity - 30) / 70;            // 0 at intensity 30, 1 at 100
    const pulse = 0.7 + 0.3 * Math.sin(elapsed * (2 + t * 8)); // faster at high intensity
    const alpha = t * 0.32 * pulse;
    const grad  = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 0.85);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(180,20,20,${alpha.toFixed(3)})`);
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /** Brief full-screen flash when intensity crosses a threshold (30 / 60 / 80). */
  function drawIntensityPulse(pulseTimer, pulseColor) {
    if (pulseTimer <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(pulseTimer * 0.55, 0, 0.55);
    ctx.fillStyle   = pulseColor || '#ff4444';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Cool blue tint during the post-chaos recovery moment. */
  function drawRecoveryOverlay(recoveryTimer) {
    if (recoveryTimer <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(recoveryTimer * 0.28, 0, 0.28);
    ctx.fillStyle   = '#2ec5ff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Stack of brief milestone unlock toasts in the top-centre area. */
  function drawMilestoneToasts(toasts) {
    if (!toasts || !toasts.length) return;
    ctx.save();
    let ty = 56;
    for (const t of toasts) {
      const alpha = clamp(t.timer / 0.6, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.font        = 'bold 11px system-ui';
      ctx.textAlign   = 'center';
      const tw = ctx.measureText(t.text).width + 22;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(W / 2 - tw / 2, ty - 13, tw, 18, 4);
      else               ctx.rect(W / 2 - tw / 2, ty - 13, tw, 18);
      ctx.fill();
      ctx.fillStyle   = '#f7c948';
      ctx.shadowBlur  = 8;
      ctx.shadowColor = '#f7c948';
      ctx.fillText(t.text, W / 2, ty);
      ctx.shadowBlur  = 0;
      ty += 22;
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Full run-summary screen drawn over the game-over state. */
  function drawRunSummary(summary) {
    // Dark backdrop
    ctx.fillStyle = 'rgba(5, 8, 20, 0.96)';
    ctx.fillRect(0, 0, W, H);

    ctx.save();

    // "GAME OVER" header
    ctx.textAlign   = 'center';
    ctx.shadowBlur  = 20;
    ctx.shadowColor = '#ff4fd1';
    ctx.fillStyle   = '#ff4fd1';
    ctx.font        = 'bold 30px system-ui';
    ctx.fillText('GAME OVER', W / 2, 46);
    ctx.shadowBlur  = 0;

    // Rating letter
    ctx.shadowBlur  = 18;
    ctx.shadowColor = summary.ratingColor;
    ctx.fillStyle   = summary.ratingColor;
    ctx.font        = 'bold 52px system-ui';
    ctx.fillText(summary.rating, W / 2, 108);
    ctx.shadowBlur  = 0;

    // Stats grid (2 columns × 3 rows)
    const stats = [
      ['SCORE',      summary.score.toLocaleString()],
      ['WAVE',       String(summary.wave)],
      ['BOSSES',     String(summary.bossesDefeated)],
      ['UPGRADES',   String(summary.upgradeCount)],
      ['MAX CHAOS',  summary.highestIntensity + '%'],
      ['SURVIVED',   summary.survival + 's'],
    ];
    const col1X = W / 2 - 92;
    const col2X = W / 2 + 8;
    let gy = 132;
    for (let idx = 0; idx < stats.length; idx++) {
      const [label, val] = stats[idx];
      const sx = idx % 2 === 0 ? col1X : col2X;
      ctx.fillStyle   = '#8b949e';
      ctx.font        = '10px system-ui';
      ctx.textAlign   = 'left';
      ctx.fillText(label, sx, gy);
      ctx.fillStyle   = '#f7c948';
      ctx.font        = 'bold 13px system-ui';
      ctx.fillText(val, sx, gy + 14);
      if (idx % 2 === 1) gy += 30;
    }
    gy += 26;

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.1, gy);
    ctx.lineTo(W * 0.9, gy);
    ctx.stroke();
    gy += 12;

    // Personal bests
    ctx.textAlign   = 'center';
    ctx.fillStyle   = '#3fb950';
    ctx.font        = 'bold 9px system-ui';
    ctx.fillText('PERSONAL BESTS', W / 2, gy);
    gy += 13;
    ctx.fillStyle = '#8b949e';
    ctx.font      = '10px system-ui';
    ctx.fillText(
      'Score ' + summary.bestScore.toLocaleString() +
      '  ·  Wave ' + summary.bestWave +
      '  ·  ' + summary.bestSurvival + 's',
      W / 2, gy,
    );
    gy += 10;
    ctx.fillStyle = '#555';
    ctx.font      = '9px system-ui';
    ctx.fillText('Run #' + summary.totalRuns, W / 2, gy + 6);

    // Restart hint
    ctx.fillStyle = '#555';
    ctx.font      = '11px system-ui';
    ctx.fillText('Press Start to play again', W / 2, H - 14);

    ctx.restore();
  }

  function drawBitcoinProjectile(b, elapsed) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const pulse = 1 + Math.sin((elapsed || 0) * 18 + b.y * 0.08) * 0.12;
    const size = 15 * pulse;

    ctx.save();
    // WTF energy trail: stacked gold plasma fading behind the rising projectile.
    for (let i = 1; i <= 5; i++) {
      const alpha = (6 - i) * 0.055;
      const radius = Math.max(1, 4.5 - i * 0.55);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = i % 2 ? '#ff9d00' : '#fff06a';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ffb000';
      ctx.beginPath();
      ctx.arc(cx + Math.sin((elapsed || 0) * 22 + i) * 1.8, cy + i * 5, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = '#ffd43b';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ffb000';
    ctx.beginPath();
    ctx.moveTo(cx, cy + 4);
    ctx.lineTo(cx, cy + 27);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin((elapsed || 0) * 10 + b.y * 0.03) * 0.08);
    ctx.shadowBlur = 24;
    ctx.shadowColor = '#ffd43b';
    if (_bitcoinProjectile.status === 'ready') {
      ctx.drawImage(_bitcoinProjectile.image, -size / 2, -size / 2, size, size);
    } else {
      // Gold fallback remains unmistakably Bitcoin if the PNG is unavailable.
      ctx.fillStyle = '#ffd43b';
      ctx.strokeStyle = '#6b3500';
      ctx.lineWidth = 1.5;
      ctx.font = 'bold 15px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText('₿', 0, 0);
      ctx.fillText('₿', 0, 0);
    }
    ctx.restore();
  }

  // ── Main draw ─────────────────────────────────────────────────────────────────

  /**
   * Render a full frame.
   * @param {object} s  full game snapshot (read-only from renderer's perspective)
   */
  function draw(s) {
    ctx.save();
    if (s.shakeTime > 0 && s.shakeIntensity > 0) {
      ctx.translate(
        (Math.random() * 2 - 1) * s.shakeIntensity,
        (Math.random() * 2 - 1) * s.shakeIntensity,
      );
    }

    drawBackground(s.elapsed, s.wave, s.stars);

    if (!s.running && !s.gameOver) {
      drawEffects(s.particles, s.scoreTexts, s.hitFlashes);
      ctx.fillStyle = '#3fb950';
      ctx.font      = 'bold 28px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Press Start', W / 2, H / 2);
      ctx.restore();
      return;
    }
    if (s.paused) {
      ctx.fillStyle = '#f7c948';
      ctx.font      = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W / 2, H / 2);
      ctx.restore();
      return;
    }
    if (s.gameOver) {
      drawEffects(s.particles, s.scoreTexts, s.hitFlashes);
      if (s.runSummary) {
        drawRunSummary(s.runSummary);
        drawMilestoneToasts(s.milestoneToasts || []);
      } else {
        ctx.fillStyle = '#ff4fd1';
        ctx.font      = 'bold 32px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', W / 2, H / 2 - 20);
        ctx.fillStyle = '#f7c948';
        ctx.font      = 'bold 20px system-ui';
        ctx.fillText('Score: ' + s.score, W / 2, H / 2 + 20);
        ctx.fillStyle = '#8b949e';
        ctx.font      = '16px system-ui';
        ctx.fillText('Press Start to play again', W / 2, H / 2 + 55);
      }
      ctx.restore();
      return;
    }

    drawBunkers(s.bunkers);
    drawShip(s.player);
    if (s.upgrades && s.upgrades.drone > 0) drawDrone(s.player, s.droneAngle);
    for (const inv of s.invaders) { if (inv.alive) drawInvader(inv, s.elapsed); }
    if (s.boss) drawBoss(s.boss, s.bossPhase);
    drawMiniEnemies(s.miniEnemies);
    drawAsteroids(s.asteroids);

    // Player bullets — Bitcoin ₿ projectiles with WTF gold plasma effects.
    for (const b of s.bullets) {
      if (b.isBomb) continue;
      drawBitcoinProjectile(b, s.elapsed);
    }
    for (const b of s.bullets) {
      if (!b.isBomb) continue;
      ctx.save();
      ctx.fillStyle   = '#ff6b2b';
      ctx.shadowBlur  = 22;
      ctx.shadowColor = '#ff6b2b';
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Enemy ammunition: toxic animated poop drops. Collision geometry is
    // unchanged; only the visual identity is gloriously less dignified.
    for (const b of s.invBullets) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(Math.sin(s.elapsed*9+b.y*.04)*.16);
      ctx.shadowBlur=10; ctx.shadowColor='#80ff35'; ctx.fillStyle='#8a4b27'; ctx.strokeStyle='#32170c'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(-5,5); ctx.quadraticCurveTo(0,-8,5,5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#fff'; ctx.fillRect(-3,-1,2,2); ctx.fillRect(2,-1,2,2); ctx.restore();
    }

    drawPowerupItems(s.powerupItems);
    drawEffects(s.particles, s.scoreTexts, s.hitFlashes);
    drawWaveIntro(s.waveIntroTimer, s.wave, s.WAVE_INTRO_DURATION);
    drawComboOverlay(s.streak, s.streakTimer);
    drawActivePowerupOverlay(s.activePowerups);
    drawLaserWarning(s.laserWarning);
    drawActiveModifier(s.activeModifier);
    drawWarningBanner(s.warningBanner);
    drawEventBanner(s.eventBanner);
    drawMutationFlash(s.mutationFlash);
    drawEmpOverlay(s.empActive, s.empTimer);
    drawPanicMode(s.panicMode, s.panicTimer, s.elapsed);

    // Intensity feedback layer (drawn above gameplay, below HUD)
    drawIntensityFeedback(s.intensity || 0, s.elapsed);
    drawIntensityPulse(s.intensityPulseTimer || 0, s.intensityPulseColor);
    drawRecoveryOverlay(s.recoveryTimer || 0);

    // Bomb cooldown indicator (canvas HUD only — no DOM)
    if (s.upgrades && s.upgrades.bombShot > 0) {
      const ready = (s.bombCooldown || 0) <= 0;
      ctx.fillStyle = ready ? '#ff6b2b' : '#555';
      ctx.font      = '12px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(ready ? '[B] BOMB ✓' : '[B] ' + (s.bombCooldown || 0).toFixed(1) + 's', 10, H - 8);
    }

    ctx.fillStyle = '#2ec5ff';
    ctx.font      = '16px system-ui';
    ctx.textAlign = 'right';
    for (let i = 0; i < s.lives; i++) {
      ctx.fillText('\u25b2', W - 10 - i * 22, H - 8);
    }

    // Upgrade screen overlay (drawn on top of the frozen game state)
    if (s.upgradePhase === 'picking') {
      drawUpgradeScreen(s.upgradeChoices, s.upgrades);
    }

    // Risk/reward screen (shown before upgrade screen)
    if (s.riskRewardPhase === 'picking') {
      drawRiskRewardScreen(s.riskRewardChoices);
    }

    // Screen flash (drawn above everything)
    drawScreenFlash(s.screenFlashTimer || 0);

    // Milestone toasts (live in-game notifications)
    drawMilestoneToasts(s.milestoneToasts || []);

    ctx.restore();
  }

  return { draw };
}
