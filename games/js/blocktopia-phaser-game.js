/**
 * blocktopia-phaser-game.js
 * Block Topia: Street Signal 3008 — Visual Overhaul Edition
 *
 * Isometric social city built on Phaser 3. All art is procedural canvas
 * drawing — no external images required. Graffiti-meets-cyberpunk aesthetic,
 * dense world with neon signs, building facades, props and styled HUD.
 */

import { loadSeasonConfig, loadLoreFeed, loadProphecyCandidates } from './blocktopia-season.js';
import { loadEconomyState, saveEconomyState, rollMarketTick, buyExposure, scoreNightRun } from './blocktopia-economy.js';
import { fetchDistrictState, updateDistrictControl } from './blocktopia-districts.js';
import { pushBattleEvent, buildGraffitiEvent } from './blocktopia-battle-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { ArcadeSync } from '/js/arcade-sync.js';

// ── Tile / World constants ────────────────────────────────────────────────────
const TILE_W  = 64;
const TILE_H  = 32;
const MAP_COLS = 24;
const MAP_ROWS = 24;
const MOVE_THROTTLE_MS = 140;
const JOYSTICK_DEADZONE = 0.35;
const RUMOR_MIN_FRAMES = 540;
const RUMOR_VARIANCE_FRAMES = 360;
const WANDER_DC = [0,  0, 1, -1];
const WANDER_DR = [1, -1, 0,  0];
const CONTROLS_HINT = 'WASD/Arrows: Move  ·  SPACE: Day/Night  ·  Q/E or scroll: Zoom';

/** Tile type identifiers */
const TILE = Object.freeze({
  ROAD:       0,
  GROUND:     1,
  BUILDING_S: 2,
  BUILDING_M: 3,
  BUILDING_L: 4,
  TREE:       5,
  WATER:      6,
  GRAFFITI:   7,
  PAVEMENT:   8,
  PLAZA:      9,
  CROSSING:   10,
  KIOSK:      11,
});

/** Tile types that block movement */
const BLOCKED_TILES = new Set([
  TILE.BUILDING_S, TILE.BUILDING_M, TILE.BUILDING_L, TILE.TREE, TILE.KIOSK
]);

/** NPC behaviors that don't wander */
const STATIONARY_BEHAVIORS = new Set(['trade', 'hide', 'observe', 'prophesy', 'vendor']);

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  VOID:        0x04020c,
  SKY_DAY:     0x0b0912,
  SKY_NIGHT:   0x04020c,
  ROAD:        0x141420,
  ROAD_EDGE:   0x1c1c30,
  PAVEMENT:    0x1c1c2e,
  PAVEMENT_LN: 0x242438,
  PLAZA:       0x121228,
  PLAZA_LN:    0x1e1e42,
  GROUND:      0x141e14,
  WATER:       0x08203a,
  WATER_SHINE: 0x0a3060,
  NEON_PINK:   0xff4fd8,
  NEON_CYAN:   0x5ef2ff,
  NEON_GOLD:   0xffd84d,
  NEON_GREEN:  0x8dff6a,
  NEON_RED:    0xff3355,
  WIN_WARM:    0xffdd88,
  WIN_COOL:    0x88ddff,
  WIN_OFF:     0x111128,
  GRAFFITI_A:  0xff4fd8,
  GRAFFITI_B:  0x8dff6a,
  GRAFFITI_C:  0xffd84d,
  GRAFFITI_D:  0x5ef2ff,
};

// ── Coordinate helpers ────────────────────────────────────────────────────────
export function cartToIso(cx, cy) {
  return {
    x: (cx - cy) * (TILE_W / 2),
    y: (cx + cy) * (TILE_H / 2)
  };
}
export function isoToCart(sx, sy) {
  return {
    x: (sx / TILE_W + sy / TILE_H),
    y: (sy / TILE_H - sx / TILE_W)
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────
export async function bootBlockTopia(containerId = 'phaser-root') {
  const [season, lore, prophecy, mapData, npcProfiles] = await Promise.all([
    loadSeasonConfig().catch(() => ({ season_name: 'Season 1', market_conditions: 'volatile' })),
    loadLoreFeed().catch(() => ({ world_title: 'Block Topia' })),
    loadProphecyCandidates().catch(() => ({ candidates: [] })),
    fetch('/games/data/blocktopia-map.json').then(r => r.json()).catch(() => null),
    fetch('/games/data/blocktopia-npc-profiles.json').then(r => r.json()).then(d => d.profiles).catch(() => [])
  ]);

  const economy   = loadEconomyState();
  const districts = await fetchDistrictState().catch(() => ({ districts: {}, faction: 'GraffPUNKS' }));
  const player    = ArcadeSync.getPlayer();
  const isMobile  = window.matchMedia('(pointer: coarse)').matches;

  const gameW = Math.min(window.innerWidth, 1080);
  const gameH = Math.min(Math.round(window.innerHeight * 0.78), 720);

  const config = {
    type: Phaser.AUTO,
    width: gameW,
    height: gameH,
    parent: containerId,
    backgroundColor: '#0b0912',
    physics: { default: 'arcade', arcade: { debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new BlockTopiaScene({ season, lore, prophecy, economy, districts, player, mapData, npcProfiles, isMobile })
  };

  return new Phaser.Game(config);
}

// ═════════════════════════════════════════════════════════════════════════════
//  PROCEDURAL TEXTURE GENERATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Draw an isometric face window quad using face-space coordinates.
 * Left face: u∈[0,1] spans x=0..hw, v∈[0,1] spans depth
 * Screen: x = u*hw, y = TILE_H/2 + u*TILE_H/2 + v*depth
 */
function drawLeftFaceQuad(g, hw, depth, u, v, wu, wv, col, alpha = 0.9) {
  const hh = TILE_H / 2;
  const pts = [
    { x: u       * hw, y: hh + u       * hh + v        * depth },
    { x: (u + wu)* hw, y: hh + (u + wu)* hh + v        * depth },
    { x: (u + wu)* hw, y: hh + (u + wu)* hh + (v + wv) * depth },
    { x: u       * hw, y: hh + u       * hh + (v + wv)  * depth },
  ];
  g.fillStyle(col, alpha);
  g.fillPoints(pts, true);
}

/**
 * Right face: u∈[0,1] spans x=hw..TILE_W, v∈[0,1] spans depth
 * Screen: x = hw + u*hw, y = TILE_H - u*TILE_H/2 + v*depth
 */
function drawRightFaceQuad(g, hw, depth, u, v, wu, wv, col, alpha = 0.9) {
  const hh = TILE_H / 2;
  const pts = [
    { x: hw + u       * hw, y: TILE_H - u       * hh + v        * depth },
    { x: hw + (u + wu)* hw, y: TILE_H - (u + wu)* hh + v        * depth },
    { x: hw + (u + wu)* hw, y: TILE_H - (u + wu)* hh + (v + wv) * depth },
    { x: hw + u       * hw, y: TILE_H - u       * hh + (v + wv)  * depth },
  ];
  g.fillStyle(col, alpha);
  g.fillPoints(pts, true);
}

// ── FLOOR TILES ───────────────────────────────────────────────────────────────

function makeTileRoad(scene) {
  const key = 'tile_road';
  if (scene.textures.exists(key)) return;
  const rt = scene.add.renderTexture(0, 0, TILE_W, TILE_H);
  const g  = scene.add.graphics();
  const hw = TILE_W / 2, hh = TILE_H / 2;

  // Base asphalt
  g.fillStyle(C.ROAD, 1);
  g.fillPoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);

  // Subtle centre-line dashes along NW-SE axis
  g.lineStyle(1, C.NEON_GOLD, 0.28);
  for (let i = 0; i < 3; i++) {
    const t = 0.2 + i * 0.3;
    const cx = hw + (t - 0.5) * TILE_W * 0.6;
    const cy = hh + (t - 0.5) * TILE_H * 0.35;
    g.lineBetween(cx - 4, cy - 2, cx + 4, cy + 2);
  }

  // Edge highlights
  g.lineStyle(1, 0x383860, 0.5);
  g.strokePoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);

  // Wet-street faint reflection strip
  g.fillStyle(0x2a2a50, 0.18);
  g.fillPoints([{x:hw-6,y:hh-3},{x:hw+6,y:hh-3},{x:hw+4,y:hh+3},{x:hw-4,y:hh+3}], true);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeTilePavement(scene) {
  const key = 'tile_pavement';
  if (scene.textures.exists(key)) return;
  const rt = scene.add.renderTexture(0, 0, TILE_W, TILE_H);
  const g  = scene.add.graphics();
  const hw = TILE_W / 2, hh = TILE_H / 2;

  g.fillStyle(C.PAVEMENT, 1);
  g.fillPoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);

  // Subtle brick grid lines
  g.lineStyle(1, C.PAVEMENT_LN, 0.55);
  // Two horizontal-ish lines at 1/3 and 2/3 height across diamond
  for (const frac of [0.33, 0.67]) {
    const y0 = frac * TILE_H;
    const xLeft  = hw - (1 - Math.abs(y0 / hh - 1)) * hw;
    const xRight = hw + (1 - Math.abs(y0 / hh - 1)) * hw;
    g.lineBetween(xLeft, y0, xRight, y0);
  }
  // Vertical-ish centre line
  g.lineBetween(hw, 2, hw, TILE_H - 2);

  g.lineStyle(1, 0x2a2a44, 0.5);
  g.strokePoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeTilePlaza(scene) {
  const key = 'tile_plaza';
  if (scene.textures.exists(key)) return;
  const rt = scene.add.renderTexture(0, 0, TILE_W, TILE_H);
  const g  = scene.add.graphics();
  const hw = TILE_W / 2, hh = TILE_H / 2;

  g.fillStyle(C.PLAZA, 1);
  g.fillPoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);

  // Polished grid lines
  g.lineStyle(1, C.PLAZA_LN, 0.7);
  g.lineBetween(hw, 2, hw, TILE_H - 2);
  for (const frac of [0.3, 0.5, 0.7]) {
    const y0 = frac * TILE_H;
    const hw2 = hw * (1 - Math.abs(y0 / hh - 1));
    g.lineBetween(hw - hw2 + 2, y0, hw + hw2 - 2, y0);
  }

  // Neon edge glow accent
  g.lineStyle(1, C.NEON_CYAN, 0.2);
  g.strokePoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeTileCrossing(scene) {
  const key = 'tile_crossing';
  if (scene.textures.exists(key)) return;
  const rt = scene.add.renderTexture(0, 0, TILE_W, TILE_H);
  const g  = scene.add.graphics();
  const hw = TILE_W / 2, hh = TILE_H / 2;

  g.fillStyle(C.ROAD, 1);
  g.fillPoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);

  // Zebra stripe parallelograms across the diamond
  g.fillStyle(0xffffff, 0.12);
  for (let i = 0; i < 5; i++) {
    const x0 = i * (TILE_W / 5);
    const x1 = x0 + TILE_W / 10;
    g.fillPoints([
      {x: x0 + hw/2,    y: hh - x0 * 0.25},
      {x: x1 + hw/2,    y: hh - x1 * 0.25},
      {x: x1 - hw/2,    y: hh + x1 * 0.25},
      {x: x0 - hw/2,    y: hh + x0 * 0.25},
    ], true);
  }

  g.lineStyle(1, 0x383860, 0.5);
  g.strokePoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeTileGraffiti(scene) {
  const key = 'tile_graffiti';
  if (scene.textures.exists(key)) return;
  const rt = scene.add.renderTexture(0, 0, TILE_W, TILE_H);
  const g  = scene.add.graphics();
  const hw = TILE_W / 2, hh = TILE_H / 2;

  g.fillStyle(0x100818, 1);
  g.fillPoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);

  // Spray blob shapes
  const splats = [
    [0.3, 0.3, C.GRAFFITI_A, 0.55], [0.55, 0.5, C.GRAFFITI_B, 0.5],
    [0.4, 0.65, C.GRAFFITI_C, 0.45], [0.6, 0.3, C.GRAFFITI_D, 0.4],
  ];
  splats.forEach(([u, v, col, a]) => {
    g.fillStyle(col, a);
    g.fillEllipse(u * TILE_W, v * TILE_H, 14, 8);
  });

  g.lineStyle(1, 0x1a0a28, 0.5);
  g.strokePoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeTileGround(scene) {
  const key = 'tile_ground';
  if (scene.textures.exists(key)) return;
  const rt = scene.add.renderTexture(0, 0, TILE_W, TILE_H);
  const g  = scene.add.graphics();
  const hw = TILE_W / 2, hh = TILE_H / 2;
  g.fillStyle(C.GROUND, 1);
  g.fillPoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);
  g.lineStyle(1, 0x1c2a1c, 0.5);
  g.strokePoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);
  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeTileWater(scene) {
  const key = 'tile_water';
  if (scene.textures.exists(key)) return;
  const rt = scene.add.renderTexture(0, 0, TILE_W, TILE_H);
  const g  = scene.add.graphics();
  const hw = TILE_W / 2, hh = TILE_H / 2;
  g.fillStyle(C.WATER, 1);
  g.fillPoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);
  // Shimmer lines
  g.lineStyle(1, C.WATER_SHINE, 0.35);
  g.lineBetween(hw - 10, hh - 2, hw, hh + 2);
  g.lineBetween(hw, hh - 2, hw + 10, hh + 2);
  g.lineStyle(1, 0x0a2040, 0.6);
  g.strokePoints([{x:hw,y:0},{x:TILE_W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);
  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

// ── BUILDING TEXTURES ─────────────────────────────────────────────────────────

function makeBuildingTexture(scene, key, opts = {}) {
  if (scene.textures.exists(key)) return;

  const {
    depth      = 44,
    topColor   = 0x1a1a3a,
    leftBase   = 0x0e0e22,
    rightBase  = 0x090916,
    winA       = C.WIN_WARM,
    winB       = C.WIN_COOL,
    neonTop    = C.NEON_CYAN,
    neonBot    = C.NEON_PINK,
    hasGraffiti = false,
    graffitiCol = C.GRAFFITI_A,
    hasTicker  = false,
    roofColor  = 0x1e1e3a,
  } = opts;

  const W  = TILE_W, hw = W / 2;
  const texH = TILE_H + depth;
  const rt = scene.add.renderTexture(0, 0, W, texH);
  const g  = scene.add.graphics();
  const hh = TILE_H / 2;

  // ── ROOF ──────────────────────────────────────────────────────────────────
  g.fillStyle(topColor, 1);
  g.fillPoints([{x:hw,y:0},{x:W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);

  // Roof: AC unit rectangle
  if (depth >= 44) {
    g.fillStyle(roofColor, 1);
    g.fillRect(hw - 8, 6, 14, 8);
    g.fillStyle(0x4a4a70, 1);
    g.fillRect(hw - 6, 7, 4, 3);
    g.fillRect(hw, 7, 4, 3);
    // Vent slats
    g.lineStyle(1, 0x666688, 0.6);
    g.lineBetween(hw - 6, 9, hw - 2, 9);
    g.lineBetween(hw, 9, hw + 4, 9);
  }

  // Roof neon edge strip
  g.lineStyle(2, neonTop, 0.4);
  g.strokePoints([{x:hw,y:0},{x:W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);

  // ── LEFT FACE ─────────────────────────────────────────────────────────────
  g.fillStyle(leftBase, 1);
  g.fillPoints([{x:0,y:hh},{x:hw,y:TILE_H},{x:hw,y:texH},{x:0,y:hh+depth}], true);

  // Structural vertical strips
  g.lineStyle(1, 0x2a2a44, 0.5);
  g.lineBetween(hw * 0.35, hh + hh * 0.35, hw * 0.35, hh + hh * 0.35 + depth);
  g.lineBetween(hw * 0.7,  hh + hh * 0.7,  hw * 0.7,  hh + hh * 0.7  + depth);

  // Windows on left face
  const winRows = Math.max(2, Math.floor(depth / 14));
  for (let r = 0; r < winRows; r++) {
    for (let c = 0; c < 2; c++) {
      const u  = 0.08 + c * 0.48;
      const v  = 0.1  + r * (0.78 / winRows);
      const on = Math.random() > 0.25;
      const wc = on ? (r % 2 === 0 ? winA : winB) : C.WIN_OFF;
      drawLeftFaceQuad(g, hw, depth, u, v, 0.38, 0.1 + 12 / depth, wc, on ? 0.82 : 0.9);
      // Window inner glow line
      if (on) {
        drawLeftFaceQuad(g, hw, depth, u + 0.02, v + 0.01, 0.34, 0.03, 0xffffff, 0.22);
      }
    }
  }

  // Left face: neon sign strip near bottom
  drawLeftFaceQuad(g, hw, depth, 0.0, 0.85, 1.0, 0.05, neonBot, 0.55);
  drawLeftFaceQuad(g, hw, depth, 0.05, 0.87, 0.25, 0.025, 0xffffff, 0.45);
  drawLeftFaceQuad(g, hw, depth, 0.4,  0.87, 0.18, 0.025, 0xffffff, 0.3);

  // Graffiti tag on lower left face
  if (hasGraffiti) {
    g.fillStyle(graffitiCol, 0.6);
    const gx = hw * 0.15, gy = hh + hh * 0.15 + depth * 0.55;
    g.fillTriangle(gx, gy, gx + 8, gy - 8, gx + 14, gy + 4);
    g.fillStyle(0xffffff, 0.3);
    g.fillRect(gx + 2, gy - 4, 6, 3);
  }

  // ── RIGHT FACE ────────────────────────────────────────────────────────────
  g.fillStyle(rightBase, 1);
  g.fillPoints([{x:W,y:hh},{x:hw,y:TILE_H},{x:hw,y:texH},{x:W,y:hh+depth}], true);

  // Structural strips
  g.lineStyle(1, 0x1e1e36, 0.5);
  g.lineBetween(hw + hw * 0.3, TILE_H - hh * 0.3, hw + hw * 0.3, TILE_H - hh * 0.3 + depth);
  g.lineBetween(hw + hw * 0.65, TILE_H - hh * 0.65, hw + hw * 0.65, TILE_H - hh * 0.65 + depth);

  // Windows on right face
  for (let r = 0; r < winRows; r++) {
    for (let c = 0; c < 2; c++) {
      const u  = 0.08 + c * 0.48;
      const v  = 0.1  + r * (0.78 / winRows);
      const on = Math.random() > 0.2;
      const wc = on ? (c % 2 === 0 ? winB : winA) : C.WIN_OFF;
      drawRightFaceQuad(g, hw, depth, u, v, 0.38, 0.1 + 12 / depth, wc, on ? 0.78 : 0.9);
      if (on) drawRightFaceQuad(g, hw, depth, u + 0.02, v + 0.01, 0.34, 0.03, 0xffffff, 0.18);
    }
  }

  // Right face neon accent
  drawRightFaceQuad(g, hw, depth, 0.0, 0.78, 0.55, 0.04, neonTop, 0.48);

  // Market ticker strip (exchange-style)
  if (hasTicker) {
    drawRightFaceQuad(g, hw, depth, 0.0, 0.90, 1.0, 0.06, C.NEON_GOLD, 0.55);
    drawRightFaceQuad(g, hw, depth, 0.05, 0.92, 0.35, 0.025, 0xffffff, 0.5);
    drawRightFaceQuad(g, hw, depth, 0.5,  0.92, 0.25, 0.025, C.NEON_GREEN, 0.45);
  }

  // ── OUTLINES ──────────────────────────────────────────────────────────────
  g.lineStyle(1, 0x000000, 0.5);
  g.strokePoints([{x:hw,y:0},{x:W,y:hh},{x:hw,y:TILE_H},{x:0,y:hh}], true);
  g.lineBetween(0, hh, 0, hh + depth);
  g.lineBetween(0, hh + depth, hw, texH);
  g.lineBetween(hw, texH, W, hh + depth);
  g.lineBetween(W, hh, W, hh + depth);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

// Pre-built building variants
function generateBuildingTextures(scene) {
  // Generic small
  makeBuildingTexture(scene, 'bld_s', { depth: 22, topColor: 0x1e1e38, leftBase: 0x0f0f22, rightBase: 0x0b0b1a });
  // Generic medium
  makeBuildingTexture(scene, 'bld_m', { depth: 44, topColor: 0x1e1e42, leftBase: 0x0e0e24, rightBase: 0x0a0a1c });
  // Generic large
  makeBuildingTexture(scene, 'bld_l', { depth: 66, topColor: 0x1a2240, leftBase: 0x0e1428, rightBase: 0x0a0f1e });

  // Neon Exchange district (gold/amber)
  makeBuildingTexture(scene, 'bld_ne', {
    depth: 44, topColor: 0x2a1e00, leftBase: 0x1a1200, rightBase: 0x120e00,
    winA: 0xffdd44, winB: 0xffaa22, neonTop: C.NEON_GOLD, neonBot: C.NEON_GREEN,
    hasTicker: true
  });
  // Mural Sector (pink/magenta)
  makeBuildingTexture(scene, 'bld_ms', {
    depth: 44, topColor: 0x2a0028, leftBase: 0x180018, rightBase: 0x100010,
    winA: 0xff88dd, winB: 0xdd44bb, neonTop: C.NEON_PINK, neonBot: C.NEON_CYAN,
    hasGraffiti: true, graffitiCol: C.GRAFFITI_B
  });
  // Chain Plaza (cyan/teal)
  makeBuildingTexture(scene, 'bld_cp', {
    depth: 44, topColor: 0x00222a, leftBase: 0x001418, rightBase: 0x000e10,
    winA: 0x44ddff, winB: 0x22aabb, neonTop: C.NEON_CYAN, neonBot: C.NEON_GREEN
  });
  // Moon Gate (green)
  makeBuildingTexture(scene, 'bld_mg', {
    depth: 66, topColor: 0x0a2200, leftBase: 0x061400, rightBase: 0x040e00,
    winA: 0x88ff66, winB: 0x44cc44, neonTop: C.NEON_GREEN, neonBot: C.NEON_CYAN
  });

  // Exchange kiosk (small, gold)
  makeBuildingTexture(scene, 'bld_kiosk', {
    depth: 28, topColor: 0x261c00, leftBase: 0x1a1200, rightBase: 0x120e00,
    winA: 0xffdd44, winB: 0xffaa00, neonTop: C.NEON_GOLD, neonBot: C.NEON_PINK,
    hasTicker: true
  });
}

// ── PROP TEXTURES ─────────────────────────────────────────────────────────────

function makeLampPostTexture(scene) {
  const key = 'prop_lamp';
  if (scene.textures.exists(key)) return;
  const W = 18, H = 56;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  // Post pole
  g.fillStyle(0x3a3a5a, 1);
  g.fillRect(7, 16, 4, 38);
  g.lineStyle(1, 0x5a5a7a, 0.6);
  g.lineBetween(8, 16, 8, 54);

  // Horizontal arm
  g.fillStyle(0x3a3a5a, 1);
  g.fillRect(4, 12, 10, 3);

  // Lamp head
  g.fillStyle(0x5a5a7a, 1);
  g.fillRect(1, 6, 10, 8);

  // Glow halo (outer → inner, decreasing alpha)
  g.fillStyle(C.NEON_CYAN, 0.06); g.fillCircle(6, 10, 14);
  g.fillStyle(C.NEON_CYAN, 0.12); g.fillCircle(6, 10, 10);
  g.fillStyle(C.NEON_CYAN, 0.22); g.fillCircle(6, 10, 6);
  g.fillStyle(0xeeffff,    0.9);  g.fillCircle(6, 10, 3);

  // Ground shadow
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(9, 54, 10, 4);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeTerminalTexture(scene) {
  const key = 'prop_terminal';
  if (scene.textures.exists(key)) return;
  const W = 28, H = 40;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  // Base box
  g.fillStyle(0x0e0e22, 1);
  g.fillRect(2, 10, 24, 28);
  g.lineStyle(1, 0x3a3a6a, 0.8);
  g.strokeRect(2, 10, 24, 28);

  // Screen
  g.fillStyle(0x001422, 1);
  g.fillRect(5, 13, 18, 14);
  // Screen content glow
  g.fillStyle(C.NEON_CYAN, 0.35);
  g.fillRect(6, 14, 16, 12);
  // Data lines on screen
  g.fillStyle(C.NEON_CYAN, 0.7);
  for (let i = 0; i < 4; i++) g.fillRect(7, 15 + i * 3, 4 + (i % 3) * 4, 1);

  // Keyboard area
  g.fillStyle(0x1a1a30, 1);
  g.fillRect(5, 30, 18, 6);
  // Keys
  g.fillStyle(0x2a2a48, 1);
  for (let c = 0; c < 5; c++) for (let r = 0; r < 2; r++) g.fillRect(6 + c * 3, 31 + r * 2, 2, 1);

  // Status light
  g.fillStyle(C.NEON_GREEN, 0.9);
  g.fillCircle(22, 12, 2);
  g.fillStyle(C.NEON_GREEN, 0.3);
  g.fillCircle(22, 12, 4);

  // Stand/base
  g.fillStyle(0x1a1a30, 1);
  g.fillRect(8, 38, 12, 3);
  g.fillRect(6, 40, 16, 2);

  // Outer glow
  g.fillStyle(C.NEON_CYAN, 0.06);
  g.fillRect(0, 8, 28, 32);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeVendingTexture(scene) {
  const key = 'prop_vending';
  if (scene.textures.exists(key)) return;
  const W = 26, H = 46;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  // Body
  g.fillStyle(0x1a0a28, 1);
  g.fillRect(2, 4, 22, 40);
  g.lineStyle(1, C.NEON_PINK, 0.5);
  g.strokeRect(2, 4, 22, 40);

  // Display panel
  g.fillStyle(0x0e0618, 1);
  g.fillRect(5, 7, 16, 14);
  g.fillStyle(C.NEON_PINK, 0.3);
  g.fillRect(5, 7, 16, 14);
  // $ sign on panel
  g.fillStyle(C.NEON_GOLD, 0.9);
  g.fillRect(12, 10, 2, 8);
  g.fillRect(9, 11, 8, 2);
  g.fillRect(9, 14, 8, 2);

  // Product slots
  g.fillStyle(0x100820, 1);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      g.fillRect(5 + c * 6, 24 + r * 7, 5, 5);
      g.fillStyle([C.NEON_CYAN, C.NEON_GOLD, C.NEON_GREEN][c], 0.5);
      g.fillRect(6 + c * 6, 25 + r * 7, 3, 3);
      g.fillStyle(0x100820, 1);
    }
  }

  // Coin slot
  g.fillStyle(0x3a2040, 1);
  g.fillRect(9, 38, 8, 3);
  g.lineStyle(1, C.NEON_GOLD, 0.6);
  g.lineBetween(10, 39, 16, 39);

  // Top glow
  g.fillStyle(C.NEON_PINK, 0.08);
  g.fillRect(2, 4, 22, 4);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeBarrierTexture(scene) {
  const key = 'prop_barrier';
  if (scene.textures.exists(key)) return;
  const W = 36, H = 18;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  // Barrier posts
  g.fillStyle(0x3a3a5a, 1);
  g.fillRect(2, 4, 5, 14);
  g.fillRect(29, 4, 5, 14);

  // Cross bar with warning stripe
  g.fillStyle(0xdddddd, 1);
  g.fillRect(4, 7, 28, 6);
  g.fillStyle(C.NEON_GOLD, 0.8);
  for (let i = 0; i < 5; i++) {
    g.fillRect(4 + i * 6, 7, 3, 6);
  }

  // Post caps
  g.fillStyle(C.NEON_CYAN, 0.7);
  g.fillRect(2, 3, 5, 2);
  g.fillRect(29, 3, 5, 2);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makePlanterTexture(scene) {
  const key = 'prop_planter';
  if (scene.textures.exists(key)) return;
  const W = 32, H = 24;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  // Box body
  g.fillStyle(0x2a1a0a, 1);
  g.fillRect(2, 10, 28, 14);
  g.lineStyle(1, 0x4a3020, 0.7);
  g.strokeRect(2, 10, 28, 14);

  // Soil
  g.fillStyle(0x1a0e04, 1);
  g.fillRect(4, 12, 24, 4);

  // Plants
  g.fillStyle(C.NEON_GREEN, 0.7);
  g.fillTriangle(8, 10, 11, 2, 14, 10);
  g.fillStyle(0x66cc44, 0.7);
  g.fillTriangle(14, 10, 17, 4, 20, 10);
  g.fillStyle(C.NEON_GREEN, 0.5);
  g.fillTriangle(19, 10, 22, 6, 25, 10);
  // Flower accent
  g.fillStyle(C.NEON_PINK, 0.8);
  g.fillCircle(11, 3, 2);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeBillboardTexture(scene) {
  const key = 'prop_billboard';
  if (scene.textures.exists(key)) return;
  const W = 56, H = 60;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  // Support poles
  g.fillStyle(0x3a3a5a, 1);
  g.fillRect(16, 32, 5, 28);
  g.fillRect(35, 32, 5, 28);

  // Board background
  g.fillStyle(0x06040e, 1);
  g.fillRect(2, 2, 52, 32);
  g.lineStyle(2, C.NEON_CYAN, 0.6);
  g.strokeRect(2, 2, 52, 32);

  // Board content (BTOP ticker)
  g.fillStyle(C.NEON_GOLD, 0.9);
  g.fillRect(6, 6, 44, 8);
  g.fillStyle(0x04020c, 1);
  g.fillRect(7, 7, 3, 6); // B
  g.fillRect(11, 7, 4, 6);
  g.fillRect(16, 7, 2, 6); // T
  g.fillRect(14, 7, 6, 2);
  g.fillRect(21, 7, 3, 6); // O
  g.fillRect(26, 7, 1, 6);
  g.fillRect(22, 7, 4, 1);
  g.fillRect(22, 12, 4, 1);
  g.fillRect(30, 7, 2, 6); // P
  g.fillRect(30, 7, 4, 3);

  // Scrolling data rows
  g.fillStyle(C.NEON_CYAN, 0.6);
  g.fillRect(6, 17, 26, 2);
  g.fillStyle(C.NEON_GREEN, 0.6);
  g.fillRect(6, 21, 18, 2);
  g.fillStyle(C.NEON_PINK, 0.5);
  g.fillRect(6, 25, 34, 2);

  // Up arrow (bullish)
  g.fillStyle(C.NEON_GREEN, 0.9);
  g.fillTriangle(38, 22, 44, 30, 50, 22);

  // Glow aura
  g.fillStyle(C.NEON_CYAN, 0.05);
  g.fillRect(0, 0, W, 36);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

// ── CHARACTER TEXTURES ────────────────────────────────────────────────────────

function makePlayerTexture(scene) {
  const key = 'char_player';
  if (scene.textures.exists(key)) return;
  const W = 28, H = 46;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  // Shadow
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(14, 44, 16, 5);

  // Legs (trousers - dark)
  g.fillStyle(0x1a1a2e, 1);
  g.fillRect(7, 28, 5, 14);
  g.fillRect(14, 28, 5, 14);
  // Boot accents
  g.fillStyle(C.NEON_PINK, 0.7);
  g.fillRect(6, 38, 6, 3);
  g.fillRect(14, 38, 6, 3);

  // Jacket body (cyberpunk pink)
  g.fillStyle(0x8800aa, 1);
  g.fillRect(4, 15, 20, 14);
  // Jacket highlights
  g.fillStyle(C.NEON_PINK, 0.5);
  g.fillRect(4, 15, 2, 14);
  g.fillRect(22, 15, 2, 14);
  // Jacket zip line
  g.lineStyle(1, C.NEON_CYAN, 0.6);
  g.lineBetween(14, 15, 14, 29);

  // Hood/collar
  g.fillStyle(0x6600aa, 1);
  g.fillRect(5, 12, 18, 5);
  g.fillStyle(0x4400aa, 1);
  g.fillRect(8, 10, 12, 5);

  // Head
  g.fillStyle(0xe8b87a, 1);
  g.fillCircle(14, 9, 7);

  // Hair
  g.fillStyle(0x3300aa, 1);
  g.fillRect(7, 2, 14, 6);
  g.fillStyle(C.NEON_PINK, 0.8);
  g.fillRect(7, 2, 4, 6);

  // Eyes
  g.fillStyle(0xffffff, 1);
  g.fillRect(9,  7, 3, 3);
  g.fillRect(16, 7, 3, 3);
  g.fillStyle(0x1100aa, 1);
  g.fillRect(10, 8, 2, 2);
  g.fillRect(17, 8, 2, 2);

  // Eye glow (subtle)
  g.fillStyle(C.NEON_CYAN, 0.35);
  g.fillCircle(11, 9, 2);
  g.fillCircle(18, 9, 2);

  // Cyberpunk neck tattoo accent
  g.lineStyle(1, C.NEON_CYAN, 0.5);
  g.lineBetween(13, 12, 13, 15);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeRunnerTexture(scene) {
  const key = 'char_runner';
  if (scene.textures.exists(key)) return;
  const W = 26, H = 44;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(13, 42, 14, 5);

  // Legs (active/running stance)
  g.fillStyle(0x0a0a18, 1);
  g.fillRect(6, 27, 5, 13);
  g.fillRect(14, 28, 5, 12);
  g.fillStyle(C.NEON_GREEN, 0.6);
  g.fillRect(5, 38, 6, 2);
  g.fillRect(14, 38, 6, 2);

  // Hoodie body (GraffPUNKS green)
  g.fillStyle(0x224400, 1);
  g.fillRect(3, 14, 20, 14);
  g.fillStyle(C.NEON_GREEN, 0.35);
  g.fillRect(3, 14, 2, 14);
  g.fillRect(21, 14, 2, 14);

  // Spray can in hand
  g.fillStyle(C.NEON_PINK, 0.8);
  g.fillRect(21, 20, 5, 10);
  g.fillStyle(0xffffff, 0.7);
  g.fillRect(22, 18, 3, 4);
  // Spray effect
  g.fillStyle(C.GRAFFITI_A, 0.4);
  g.fillCircle(27, 21, 4);

  // Hood up
  g.fillStyle(0x1a3300, 1);
  g.fillRect(4, 9, 18, 8);
  g.fillStyle(0x112200, 1);
  g.fillRect(6, 7, 14, 5);

  // Head
  g.fillStyle(0xd4a06a, 1);
  g.fillCircle(13, 8, 6);

  // Face: mask covering lower half
  g.fillStyle(0x1a3300, 0.8);
  g.fillRect(8, 9, 10, 4);

  // Eyes
  g.fillStyle(0x88ff44, 0.9);
  g.fillRect(9,  5, 2, 3);
  g.fillRect(14, 5, 2, 3);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeTraderTexture(scene) {
  const key = 'char_trader';
  if (scene.textures.exists(key)) return;
  const W = 26, H = 44;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(13, 42, 14, 5);

  // Legs (suit trousers)
  g.fillStyle(0x1a1200, 1);
  g.fillRect(6, 27, 5, 13);
  g.fillRect(14, 27, 5, 13);
  g.fillStyle(0x2a2000, 1);
  g.fillRect(6, 37, 6, 3);
  g.fillRect(14, 37, 5, 3);

  // Suit body
  g.fillStyle(0x2a1e00, 1);
  g.fillRect(3, 14, 20, 14);
  // Lapels
  g.fillStyle(0x1a1200, 1);
  g.fillTriangle(10, 14, 13, 20, 3, 14);
  g.fillTriangle(16, 14, 13, 20, 23, 14);
  // Shirt
  g.fillStyle(0xeeeedd, 0.9);
  g.fillRect(11, 14, 4, 12);
  // Tie
  g.fillStyle(C.NEON_GOLD, 0.9);
  g.fillTriangle(12, 16, 13, 26, 14, 16);

  // Collar
  g.fillStyle(0x1a1200, 1);
  g.fillRect(8, 12, 10, 4);

  // Head
  g.fillStyle(0xf0c88a, 1);
  g.fillCircle(13, 8, 7);

  // Hair (slick back)
  g.fillStyle(0x2a1a00, 1);
  g.fillRect(6, 1, 14, 7);
  g.fillStyle(C.NEON_GOLD, 0.5);
  g.fillRect(6, 1, 14, 2);

  // Eyes
  g.fillStyle(0xffffff, 1);
  g.fillRect(9,  6, 3, 3);
  g.fillRect(15, 6, 3, 3);
  g.fillStyle(0x333300, 1);
  g.fillRect(10, 7, 2, 2);
  g.fillRect(16, 7, 2, 2);

  // Sunglasses
  g.fillStyle(C.NEON_GOLD, 0.8);
  g.fillRect(8, 6, 4, 2);
  g.fillRect(14, 6, 4, 2);
  // Briefcase/pad (in hand)
  g.fillStyle(0x2a1800, 1);
  g.fillRect(21, 20, 7, 10);
  g.fillStyle(C.NEON_GOLD, 0.6);
  g.fillRect(23, 24, 3, 2);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeWardenTexture(scene) {
  const key = 'char_warden';
  if (scene.textures.exists(key)) return;
  const W = 28, H = 46;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(14, 44, 16, 5);

  // Boots (heavy)
  g.fillStyle(0x2a0000, 1);
  g.fillRect(5, 35, 7, 8);
  g.fillRect(15, 35, 7, 8);
  g.fillStyle(C.NEON_RED, 0.5);
  g.fillRect(4, 38, 8, 2);
  g.fillRect(15, 38, 8, 2);

  // Armored legs
  g.fillStyle(0x1a0000, 1);
  g.fillRect(5, 26, 7, 12);
  g.fillRect(15, 26, 7, 12);
  // Knee pads
  g.fillStyle(0x3a0000, 1);
  g.fillRect(5, 28, 7, 4);
  g.fillRect(15, 28, 7, 4);

  // Armored chest (red)
  g.fillStyle(0x3a0000, 1);
  g.fillRect(3, 14, 22, 14);
  // Chest plate
  g.fillStyle(0x660000, 1);
  g.fillRect(5, 15, 18, 10);
  // Shoulder pads
  g.fillStyle(0x4a0000, 1);
  g.fillRect(0, 14, 6, 8);
  g.fillRect(22, 14, 6, 8);
  // Warning stripes
  g.fillStyle(C.NEON_RED, 0.6);
  g.fillRect(5, 15, 4, 3);
  g.fillRect(10, 15, 4, 3);
  g.fillRect(15, 15, 4, 3);

  // Helmet
  g.fillStyle(0x3a0000, 1);
  g.fillCircle(14, 8, 8);
  g.fillRect(6, 5, 16, 8);
  // Visor
  g.fillStyle(C.NEON_RED, 0.8);
  g.fillRect(8, 7, 12, 4);
  g.fillStyle(0xff8888, 0.4);
  g.fillRect(9, 8, 10, 2);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeOracleTexture(scene) {
  const key = 'char_oracle';
  if (scene.textures.exists(key)) return;
  const W = 26, H = 50;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(13, 48, 14, 5);

  // Flowing robe (cloak)
  g.fillStyle(0x080818, 1);
  g.fillTriangle(3, 16, 13, 46, 23, 16);
  g.fillStyle(C.NEON_CYAN, 0.15);
  g.fillTriangle(3, 16, 13, 46, 23, 16);

  // Robe body
  g.fillStyle(0x04040e, 1);
  g.fillRect(4, 14, 18, 18);

  // Glowing rune on chest
  g.fillStyle(C.NEON_CYAN, 0.7);
  g.fillCircle(13, 20, 5);
  g.fillStyle(0x04040e, 1);
  g.fillCircle(13, 20, 3);
  g.fillStyle(C.NEON_CYAN, 0.9);
  g.fillCircle(13, 20, 1);

  // Cloak edge glow
  g.lineStyle(1, C.NEON_CYAN, 0.4);
  g.lineBetween(3, 16, 13, 46);
  g.lineBetween(23, 16, 13, 46);

  // Hood
  g.fillStyle(0x060610, 1);
  g.fillEllipse(13, 9, 18, 14);
  // Head in hood
  g.fillStyle(0xd4e8f0, 0.8);
  g.fillCircle(13, 9, 6);
  // Glowing eyes
  g.fillStyle(C.NEON_CYAN, 0.9);
  g.fillCircle(10, 8, 2);
  g.fillCircle(16, 8, 2);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(10, 8, 1);
  g.fillCircle(16, 8, 1);

  // Ambient glow
  g.fillStyle(C.NEON_CYAN, 0.04);
  g.fillEllipse(13, 25, 26, 40);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

function makeRemoteTexture(scene) {
  const key = 'char_remote';
  if (scene.textures.exists(key)) return;
  const W = 24, H = 42;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(12, 40, 12, 4);

  g.fillStyle(0x1a1a2e, 1);
  g.fillRect(5, 26, 5, 12);
  g.fillRect(13, 26, 5, 12);

  g.fillStyle(0x2a2a5a, 1);
  g.fillRect(3, 14, 18, 13);
  g.lineStyle(1, 0x5555aa, 0.5);
  g.strokeRect(3, 14, 18, 13);

  g.fillStyle(0xccccee, 1);
  g.fillCircle(12, 9, 7);

  g.fillStyle(0x5555aa, 1);
  g.fillRect(5, 2, 14, 6);

  g.fillStyle(0xffffff, 1);
  g.fillRect(8, 7, 3, 3);
  g.fillRect(13, 7, 3, 3);
  g.fillStyle(0x4444aa, 1);
  g.fillRect(9, 8, 2, 2);
  g.fillRect(14, 8, 2, 2);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

// ── CRYPTO FOUNTAIN / CENTRAL LANDMARK ───────────────────────────────────────
function makeFountainTexture(scene) {
  const key = 'prop_fountain';
  if (scene.textures.exists(key)) return;
  // Tall iconic prop: ~80 wide, ~100 tall
  const W = 80, H = 100;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();
  const cx = W / 2;

  // ── Base ring (outer stone plinth) ──
  g.fillStyle(0x2a2a44, 1);
  g.fillEllipse(cx, 90, 68, 22);
  g.lineStyle(2, C.NEON_CYAN, 0.5);
  g.strokeEllipse(cx, 90, 68, 22);

  // ── Plinth body ──
  g.fillStyle(0x1e1e38, 1);
  g.fillRect(cx - 22, 72, 44, 20);
  g.lineStyle(1, C.NEON_CYAN, 0.35);
  g.strokeRect(cx - 22, 72, 44, 20);
  // Plinth runes
  g.fillStyle(C.NEON_CYAN, 0.5);
  g.fillRect(cx - 16, 78, 8, 2);
  g.fillRect(cx - 4,  78, 8, 2);
  g.fillRect(cx + 8,  78, 6, 2);
  g.fillRect(cx - 16, 84, 4, 2);
  g.fillRect(cx - 8,  84, 10, 2);
  g.fillRect(cx + 4,  84, 6, 2);

  // ── Pedestal column ──
  g.fillStyle(0x2a2a50, 1);
  g.fillRect(cx - 10, 42, 20, 32);
  // Column edges
  g.lineStyle(1, 0x4a4a7a, 0.6);
  g.lineBetween(cx - 10, 42, cx - 10, 74);
  g.lineBetween(cx + 10, 42, cx + 10, 74);
  // Column bands
  g.fillStyle(C.NEON_CYAN, 0.25);
  g.fillRect(cx - 10, 52, 20, 3);
  g.fillRect(cx - 10, 62, 20, 3);

  // ── Central token / coin ──
  // Outer glow ring
  g.fillStyle(C.NEON_GOLD, 0.12); g.fillCircle(cx, 30, 22);
  g.fillStyle(C.NEON_GOLD, 0.22); g.fillCircle(cx, 30, 18);
  g.fillStyle(C.NEON_GOLD, 0.35); g.fillCircle(cx, 30, 14);
  // Coin body
  g.fillStyle(0xffcc00, 1);
  g.fillCircle(cx, 30, 12);
  g.lineStyle(2, 0xffe066, 1);
  g.strokeCircle(cx, 30, 12);
  // Coin face — BTC symbol (stylized)
  g.fillStyle(0xffaa00, 1);
  g.fillRect(cx - 3, 22, 6, 16);   // vertical bar
  g.fillRect(cx - 4, 24, 8, 3);    // top arm
  g.fillRect(cx - 4, 29, 8, 3);    // mid arm
  g.fillRect(cx - 4, 34, 8, 3);    // bot arm
  g.fillStyle(0xffcc00, 1);
  g.fillRect(cx - 2, 23, 4, 14);   // inner bar highlight
  // Inner sparkle
  g.fillStyle(0xffffff, 0.7);
  g.fillCircle(cx - 3, 26, 2);

  // ── Neon BTOP text ──
  g.fillStyle(C.NEON_GOLD, 0.8);
  g.fillRect(cx - 20, 44, 40, 6);
  g.fillStyle(0x04020c, 1);
  // B
  g.fillRect(cx - 18, 45, 2, 4); g.fillRect(cx - 16, 45, 3, 1); g.fillRect(cx - 16, 47, 3, 1); g.fillRect(cx - 16, 49, 3, 1);
  // T
  g.fillRect(cx - 12, 45, 6, 1); g.fillRect(cx - 10, 45, 2, 4);
  // O
  g.fillRect(cx - 5, 45, 4, 1); g.fillRect(cx - 5, 49, 4, 1); g.fillRect(cx - 5, 46, 1, 3); g.fillRect(cx - 1, 46, 1, 3);
  // P
  g.fillRect(cx + 2, 45, 2, 4); g.fillRect(cx + 4, 45, 3, 1); g.fillRect(cx + 4, 47, 3, 1); g.fillRect(cx + 7, 45, 1, 3);

  // ── Water basin ring ──
  g.fillStyle(C.NEON_CYAN, 0.12);
  g.fillEllipse(cx, 82, 60, 16);
  // Water surface shimmer
  g.fillStyle(0x88eeff, 0.25);
  g.fillEllipse(cx - 8, 82, 18, 5);
  g.fillStyle(0xaaffff, 0.15);
  g.fillEllipse(cx + 10, 80, 10, 3);

  // Ambient glow pulse base
  g.fillStyle(C.NEON_GOLD, 0.04);
  g.fillEllipse(cx, 55, 72, 90);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

// ── PLANTER BUSH (Habbo-style with flowers) ───────────────────────────────────
function makePlantBushTexture(scene) {
  const key = 'prop_bush';
  if (scene.textures.exists(key)) return;
  const W = 44, H = 30;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  // Stone planter box
  g.fillStyle(0x3a3a4e, 1);
  g.fillRect(2, 16, 40, 14);
  // Box highlight edge
  g.lineStyle(1, 0x5a5a7a, 0.6);
  g.lineBetween(2, 16, 42, 16);
  g.lineBetween(2, 16, 2, 30);
  g.lineBetween(42, 16, 42, 30);
  // Box face pattern
  g.lineStyle(1, 0x2a2a3e, 0.8);
  g.lineBetween(14, 16, 14, 30);
  g.lineBetween(28, 16, 28, 30);

  // Soil
  g.fillStyle(0x1a0e04, 1);
  g.fillRect(4, 17, 36, 5);

  // Green bush mass
  g.fillStyle(0x1a5500, 1);
  g.fillEllipse(22, 12, 38, 18);
  g.fillStyle(0x226600, 1);
  g.fillEllipse(14, 11, 20, 14);
  g.fillEllipse(30, 11, 20, 14);
  g.fillStyle(0x338800, 0.8);
  g.fillEllipse(22, 8, 28, 16);

  // Blue/purple flower accents (like the reference image)
  const flowers = [
    [8, 8], [16, 5], [22, 4], [28, 6], [34, 9], [12, 12], [31, 12]
  ];
  flowers.forEach(([fx, fy]) => {
    g.fillStyle(0x4466ff, 0.85);
    g.fillCircle(fx, fy, 3);
    g.fillStyle(0x8899ff, 0.7);
    g.fillCircle(fx, fy, 2);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(fx, fy, 1);
  });

  // Highlight leaves
  g.fillStyle(0x55cc22, 0.5);
  g.fillEllipse(18, 7, 10, 6);
  g.fillEllipse(26, 6, 8, 5);

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

// ── LONG PLANTER ROW (for roadside borders) ───────────────────────────────────
function makePlantRowTexture(scene) {
  const key = 'prop_plant_row';
  if (scene.textures.exists(key)) return;
  const W = 64, H = 28;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  // Planter box
  g.fillStyle(0x3a3a4e, 1);
  g.fillRect(1, 14, 62, 14);
  g.lineStyle(1, 0x5a5a7a, 0.5);
  g.strokeRect(1, 14, 62, 14);

  // Soil
  g.fillStyle(0x1a0e04, 1);
  g.fillRect(3, 15, 58, 4);

  // Bush mass
  g.fillStyle(0x1a5500, 1);
  g.fillEllipse(10, 10, 18, 14);
  g.fillEllipse(22, 9, 18, 14);
  g.fillEllipse(34, 10, 18, 14);
  g.fillEllipse(46, 9, 18, 14);
  g.fillEllipse(58, 10, 14, 12);
  g.fillStyle(0x338800, 0.7);
  g.fillEllipse(16, 7, 24, 12);
  g.fillEllipse(40, 7, 24, 12);

  // Blue flowers
  [[6,7],[14,4],[22,5],[30,7],[38,5],[46,6],[55,8]].forEach(([fx,fy]) => {
    g.fillStyle(0x4466ff, 0.8);
    g.fillCircle(fx, fy, 2);
    g.fillStyle(0xeeeeff, 0.6);
    g.fillCircle(fx, fy, 1);
  });

  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

// ── GLOW HALO (for ambiance props) ───────────────────────────────────────────
function makeGlowTexture(scene, key, color, radius = 32) {
  if (scene.textures.exists(key)) return;
  const S = radius * 2;
  const rt = scene.add.renderTexture(0, 0, S, S);
  const g  = scene.add.graphics();
  // Multi-ring fade
  for (let r = radius; r > 0; r -= 2) {
    const a = (1 - r / radius) * 0.15;
    g.fillStyle(color, a);
    g.fillCircle(radius, radius, r);
  }
  rt.draw(g, 0, 0); rt.saveTexture(key); g.destroy(); rt.destroy();
}

// ── MASTER generateTextures ───────────────────────────────────────────────────
function generateTextures(scene) {
  // Floor tiles
  makeTileRoad(scene);
  makeTilePavement(scene);
  makeTilePlaza(scene);
  makeTileCrossing(scene);
  makeTileGraffiti(scene);
  makeTileGround(scene);
  makeTileWater(scene);

  // Buildings
  generateBuildingTextures(scene);

  // Props
  makeLampPostTexture(scene);
  makeTerminalTexture(scene);
  makeVendingTexture(scene);
  makeBarrierTexture(scene);
  makePlanterTexture(scene);
  makeBillboardTexture(scene);
  makeFountainTexture(scene);
  makePlantBushTexture(scene);
  makePlantRowTexture(scene);

  // Characters
  makePlayerTexture(scene);
  makeRunnerTexture(scene);
  makeTraderTexture(scene);
  makeWardenTexture(scene);
  makeOracleTexture(scene);
  makeRemoteTexture(scene);

  // Glow halos
  makeGlowTexture(scene, 'glow_cyan',  C.NEON_CYAN,  40);
  makeGlowTexture(scene, 'glow_pink',  C.NEON_PINK,  32);
  makeGlowTexture(scene, 'glow_gold',  C.NEON_GOLD,  28);
  makeGlowTexture(scene, 'glow_green', C.NEON_GREEN, 24);
}

// ── Faction texture map ───────────────────────────────────────────────────────
function npcTextureKey(faction) {
  const map = {
    GraffPUNKS:    'char_runner',
    hostile:       'char_warden',
    'moon-mission':'char_oracle',
    neutral:       'char_trader',
  };
  return map[faction] || 'char_trader';
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN SCENE
// ═════════════════════════════════════════════════════════════════════════════

class BlockTopiaScene extends Phaser.Scene {
  constructor(data) {
    super({ key: 'BlockTopiaScene' });
    this.meta           = data;
    this.marketPrice    = 100;
    this.heat           = 0;
    this.combo          = 0;
    this.phase          = 'Day';
    this.metaScore      = 0;
    this.currentDistrict = 'none';
    this.npcs           = [];
    this.remotePlayers  = new Map();
    this.props          = [];
    this.playerCol      = data.mapData?.playerStart?.col ?? 12;
    this.playerRow      = data.mapData?.playerStart?.row ?? 12;
    this._lastMoveTime  = 0;
    this._joyDir        = { dx: 0, dy: 0 };
    this._joyActive     = false;
    this._glowPulse     = 0;
  }

  preload() {}

  create() {
    generateTextures(this);

    this.mapOriginX = this.cameras.main.width  / 2;
    this.mapOriginY = 180;

    this._buildMap();
    this._placeProps();
    this._createPlayer();
    this._createNPCs();
    this._addAtmosphere();
    this._createHUD();
    this._setupCamera();
    this._setupInput();
    this._setupDistricts();

    this.time.addEvent({ delay: 2500, loop: true, callback: this._tickMarket, callbackScope: this });
    this.time.addEvent({ delay: 80,   loop: true, callback: this._pulseNeons, callbackScope: this });

    this._onUnload = () => this.shutdown();
    window.addEventListener('beforeunload', this._onUnload);
  }

  update(time) {
    this._handleMovement(time);
    this._updateNPCs();
    this._followCamera();
    if (Math.floor(time / 200) % 2 === 0) this._refreshHUD();
  }

  shutdown() {
    submitScore(this.meta.player, this.metaScore, 'blocktopia');
    if (this._onUnload) window.removeEventListener('beforeunload', this._onUnload);
  }

  // ── MAP BUILD ────────────────────────────────────────────────────────────

  _buildMap() {
    this.mapGrid = [];
    for (let row = 0; row < MAP_ROWS; row++) {
      this.mapGrid[row] = [];
      for (let col = 0; col < MAP_COLS; col++) {
        const type   = this._resolveTileType(col, row);
        const texKey = this._resolveTileTexture(col, row, type);
        const { x, y } = this._isoPos(col, row);
        const sprite = this.add.image(x, y, texKey).setOrigin(0.5, 1);
        sprite.setDepth((row + col) * 10);
        this.mapGrid[row][col] = { sprite, type, col, row };
      }
    }
  }

  _resolveTileType(col, row) {
    const map = this.meta.mapData;

    // Crossings at road intersections
    const onRoadCol = (col === 11 || col === 12);
    const onRoadRow = (row === 11 || row === 12);
    if (onRoadCol && onRoadRow) return TILE.CROSSING;

    // Main roads (2-tile wide)
    if (onRoadCol || onRoadRow) return TILE.ROAD;

    // Pavement border (1 tile wide on each road edge)
    const nearRoadCol = (col === 10 || col === 13);
    const nearRoadRow = (row === 10 || row === 13);
    if (nearRoadCol || nearRoadRow) return TILE.PAVEMENT;

    // Central plaza (at map centre, inset from roads)
    // (already handled by crossing above; extra plaza corner tiles)
    if (col >= 10 && col <= 13 && row >= 10 && row <= 13) return TILE.PLAZA;

    if (!map) return this._proceduralTile(col, row);

    // District tile layouts
    for (const d of (map.districts ?? [])) {
      const r = d.region;
      if (col >= r.col && col < r.col + r.w && row >= r.row && row < r.row + r.h) {
        return this._districtTile(d.id, col, row);
      }
    }
    return TILE.GROUND;
  }

  _districtTile(districtId, col, row) {
    const lc = col % 6, lr = row % 6;
    switch (districtId) {
      case 'neon-exchange':
        if (lc === 1 && lr === 1) return TILE.BUILDING_L;
        if (lc === 3 && lr === 3) return TILE.BUILDING_M;
        if (lc === 5 && lr === 1) return TILE.KIOSK;
        if (lc === 1 && lr === 5) return TILE.KIOSK;
        if ((lc + lr) % 4 === 0)  return TILE.BUILDING_S;
        return TILE.PAVEMENT;

      case 'mural-sector':
        if (lc === 1 && lr === 1) return TILE.BUILDING_L;
        if (lc === 4 && lr === 4) return TILE.BUILDING_M;
        if (lc === 2)             return TILE.GRAFFITI;
        if (lr === 5)             return TILE.GRAFFITI;
        if ((lc + lr) % 5 === 0)  return TILE.BUILDING_S;
        return TILE.GROUND;

      case 'chain-plaza':
        if (lc === 0 && lr === 0) return TILE.BUILDING_L;
        if (lc === 3 && lr === 3) return TILE.BUILDING_M;
        if ((lc + lr) % 3 === 0)  return TILE.BUILDING_S;
        return TILE.PAVEMENT;

      case 'moon-gate':
        if (lc === 3 && lr === 3) return TILE.BUILDING_L;
        if (lc === 1 && lr === 1) return TILE.BUILDING_M;
        if ((lc + lr) % 5 === 2)  return TILE.TREE;
        return TILE.GROUND;

      default:
        return TILE.GROUND;
    }
  }

  _proceduralTile(col, row) {
    if ((col + row) % 7 === 0) return TILE.BUILDING_M;
    if ((col + row) % 5 === 0) return TILE.BUILDING_S;
    return TILE.GROUND;
  }

  _resolveTileTexture(col, row, type) {
    if ([TILE.BUILDING_S, TILE.BUILDING_M, TILE.BUILDING_L, TILE.KIOSK].includes(type)) {
      const map = this.meta.mapData;
      if (map) {
        for (const d of (map.districts ?? [])) {
          const r = d.region;
          if (col >= r.col && col < r.col + r.w && row >= r.row && row < r.row + r.h) {
            const themed = {
              'neon-exchange': type === TILE.KIOSK ? 'bld_kiosk' : 'bld_ne',
              'mural-sector':  'bld_ms',
              'chain-plaza':   'bld_cp',
              'moon-gate':     'bld_mg',
            };
            if (themed[d.id]) return themed[d.id];
          }
        }
      }
      if (type === TILE.KIOSK) return 'bld_kiosk';
      return ['bld_s', 'bld_m', 'bld_l'][type - TILE.BUILDING_S] ?? 'bld_s';
    }
    const flat = {
      [TILE.ROAD]:      'tile_road',
      [TILE.PAVEMENT]:  'tile_pavement',
      [TILE.PLAZA]:     'tile_plaza',
      [TILE.CROSSING]:  'tile_crossing',
      [TILE.GROUND]:    'tile_ground',
      [TILE.GRAFFITI]:  'tile_graffiti',
      [TILE.TREE]:      'tile_ground',
      [TILE.WATER]:     'tile_water',
    };
    return flat[type] ?? 'tile_ground';
  }

  // ── PROPS ─────────────────────────────────────────────────────────────────

  _placeProps() {
    const placements = [
      // ── CENTRAL FOUNTAIN (plaza landmark) ────────────────────────────────
      { col: 11, row: 11, tex: 'prop_fountain', ox: 0, oy: -10 },

      // ── PLAZA CORNERS: lamp posts ─────────────────────────────────────────
      { col: 9,  row: 9,  tex: 'prop_lamp', ox: 0, oy: 4 },
      { col: 9,  row: 14, tex: 'prop_lamp', ox: 0, oy: 4 },
      { col: 14, row: 9,  tex: 'prop_lamp', ox: 0, oy: 4 },
      { col: 14, row: 14, tex: 'prop_lamp', ox: 0, oy: 4 },

      // ── PLAZA EDGE: plant bushes ──────────────────────────────────────────
      { col: 9,  row: 10, tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 9,  row: 11, tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 9,  row: 12, tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 9,  row: 13, tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 14, row: 10, tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 14, row: 11, tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 14, row: 12, tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 14, row: 13, tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 10, row: 9,  tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 11, row: 9,  tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 12, row: 9,  tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 13, row: 9,  tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 10, row: 14, tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 11, row: 14, tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 12, row: 14, tex: 'prop_bush', ox: 0, oy: 8 },
      { col: 13, row: 14, tex: 'prop_bush', ox: 0, oy: 8 },

      // ── ALONG ROADS: lamp posts every 3 tiles ────────────────────────────
      ...this._roadLampPositions(),

      // ── NEON EXCHANGE district props ──────────────────────────────────────
      { col: 3,  row: 3,  tex: 'prop_terminal', ox: 0, oy: 8 },
      { col: 7,  row: 2,  tex: 'prop_billboard', ox: 0, oy: 0 },
      { col: 8,  row: 8,  tex: 'prop_vending',   ox: 0, oy: 8 },
      { col: 5,  row: 6,  tex: 'prop_terminal',  ox: 0, oy: 8 },
      { col: 6,  row: 4,  tex: 'prop_bush',       ox: 0, oy: 8 },
      { col: 4,  row: 8,  tex: 'prop_bush',       ox: 0, oy: 8 },

      // ── MURAL SECTOR district props ───────────────────────────────────────
      { col: 16, row: 3,  tex: 'prop_vending',   ox: 0, oy: 8 },
      { col: 18, row: 6,  tex: 'prop_billboard', ox: 0, oy: 0 },
      { col: 20, row: 2,  tex: 'prop_terminal',  ox: 0, oy: 8 },
      { col: 17, row: 7,  tex: 'prop_bush',       ox: 0, oy: 8 },
      { col: 20, row: 5,  tex: 'prop_bush',       ox: 0, oy: 8 },

      // ── CHAIN PLAZA district props ─────────────────────────────────────────
      { col: 3,  row: 16, tex: 'prop_terminal',  ox: 0, oy: 8 },
      { col: 7,  row: 18, tex: 'prop_barrier',   ox: 0, oy: 14 },
      { col: 5,  row: 20, tex: 'prop_bush',       ox: 0, oy: 8 },
      { col: 8,  row: 16, tex: 'prop_bush',       ox: 0, oy: 8 },

      // ── MOON GATE district props ──────────────────────────────────────────
      { col: 16, row: 16, tex: 'prop_planter',   ox: 0, oy: 14 },
      { col: 18, row: 20, tex: 'prop_planter',   ox: 0, oy: 14 },
      { col: 20, row: 18, tex: 'prop_billboard', ox: 0, oy: 0 },
      { col: 17, row: 17, tex: 'prop_bush',       ox: 0, oy: 8 },
      { col: 20, row: 20, tex: 'prop_bush',       ox: 0, oy: 8 },
    ];

    placements.forEach(({ col, row, tex, ox = 0, oy = 0 }) => {
      // Skip placement on blocked/building tiles to avoid z-fighting
      const cell = this.mapGrid[row]?.[col];
      if (!cell || BLOCKED_TILES.has(cell.type)) return;

      const { x, y } = this._isoPos(col, row);
      const depth = this._charDepth(row, col);
      const spr = this.add.image(x + ox, y + oy, tex).setOrigin(0.5, 1).setDepth(depth + 2);
      this.props.push(spr);

      // Glow halos on lamps
      if (tex === 'prop_lamp') {
        const glow = this.add.image(x + ox, y + oy - 46, 'glow_cyan').setOrigin(0.5, 0.5)
          .setAlpha(0.35).setDepth(depth + 1).setBlendMode(Phaser.BlendModes.ADD);
        this.props.push(glow);
        if (!this._glowObjects) this._glowObjects = [];
        this._glowObjects.push(glow);
      }
      // Gold glow on fountain
      if (tex === 'prop_fountain') {
        const glow = this.add.image(x + ox, y + oy - 30, 'glow_gold').setOrigin(0.5, 0.5)
          .setAlpha(0.5).setDepth(depth + 1).setBlendMode(Phaser.BlendModes.ADD);
        this.props.push(glow);
        if (!this._glowObjects) this._glowObjects = [];
        this._glowObjects.push(glow);
      }
    });
  }

  _roadLampPositions() {
    const out = [];
    // Along road cols 11-12 every 4 rows
    for (let row = 2; row < MAP_ROWS - 2; row += 4) {
      out.push({ col: 10, row, tex: 'prop_lamp', ox: 0, oy: 4 });
      out.push({ col: 13, row, tex: 'prop_lamp', ox: 0, oy: 4 });
    }
    // Along road rows 11-12 every 4 cols
    for (let col = 2; col < MAP_COLS - 2; col += 4) {
      out.push({ col, row: 10, tex: 'prop_lamp', ox: 0, oy: 4 });
      out.push({ col, row: 13, tex: 'prop_lamp', ox: 0, oy: 4 });
    }
    return out;
  }

  // ── ATMOSPHERE ────────────────────────────────────────────────────────────

  _addAtmosphere() {
    // Vignette overlay
    const W = this.cameras.main.width, H = this.cameras.main.height;
    const vg = this.add.graphics().setScrollFactor(0).setDepth(9500);
    for (let r = Math.max(W, H) * 0.7; r > 0; r -= 14) {
      const a = (1 - r / (Math.max(W, H) * 0.7)) * 0.22;
      vg.fillStyle(0x000000, a);
      vg.fillCircle(W / 2, H / 2, r);
    }
  }

  // ── PLAYER ───────────────────────────────────────────────────────────────

  _createPlayer() {
    const { x, y } = this._isoPos(this.playerCol, this.playerRow);
    const depth = this._charDepth(this.playerRow, this.playerCol);

    // Shadow
    this.playerShadow = this.add.ellipse(x, y - 2, 20, 7, 0x000000, 0.3)
      .setDepth(depth - 1);

    this.playerSprite = this.add.image(x, y - TILE_H / 2, 'char_player')
      .setOrigin(0.5, 1).setDepth(depth);

    // Neon glow halo around player
    this.playerGlow = this.add.image(x, y - TILE_H / 2 - 10, 'glow_pink')
      .setOrigin(0.5, 0.5).setAlpha(0.4).setDepth(depth - 1)
      .setBlendMode(Phaser.BlendModes.ADD);

    const nameStyle = {
      fontSize: '11px',
      color: '#ff4fd8',
      fontFamily: '"Courier New", Courier, monospace',
      stroke: '#000000',
      strokeThickness: 3,
      padding: { x: 6, y: 3 }
    };
    this.playerLabel = this.add.text(x, y - TILE_H / 2 - 48, `▶ ${this.meta.player}`, nameStyle)
      .setOrigin(0.5, 1).setDepth(depth + 1);
  }

  _movePlayer(dc, dr) {
    const newCol = this.playerCol + dc;
    const newRow = this.playerRow + dr;
    if (newCol < 0 || newCol >= MAP_COLS || newRow < 0 || newRow >= MAP_ROWS) return;
    if (this._isBlocked(newCol, newRow)) return;

    this.playerCol = newCol;
    this.playerRow = newRow;

    const { x, y } = this._isoPos(newCol, newRow);
    const depth     = this._charDepth(newRow, newCol);
    const sprY      = y - TILE_H / 2;
    const lblY      = sprY - 48;

    // Subtle hop effect
    this.tweens.killTweensOf([this.playerSprite, this.playerLabel, this.playerShadow, this.playerGlow]);
    this.tweens.add({ targets: this.playerSprite, x, y: sprY - 4, duration: 55, ease: 'Quad.Out',
      onComplete: () => this.tweens.add({ targets: this.playerSprite, y: sprY, duration: 55, ease: 'Quad.In' })
    });
    this.tweens.add({ targets: this.playerLabel,  x, y: lblY, duration: 110 });
    this.tweens.add({ targets: this.playerShadow, x, y: y - 2, duration: 110, scaleX: 0.8, onComplete: () =>
      this.tweens.add({ targets: this.playerShadow, scaleX: 1, duration: 60 })
    });
    this.tweens.add({ targets: this.playerGlow, x, y: sprY - 10, duration: 110 });

    this.playerSprite.setDepth(depth);
    this.playerLabel.setDepth(depth + 1);
    this.playerGlow.setDepth(depth - 1);
    this.playerShadow.setDepth(depth - 1);

    this._checkDistrict();
  }

  _isBlocked(col, row) {
    return BLOCKED_TILES.has(this.mapGrid[row]?.[col]?.type);
  }

  // ── NPCs ─────────────────────────────────────────────────────────────────

  _createNPCs() {
    const spawns = this.meta.mapData?.npcSpawns ?? [
      { npcId: 'runner-01', col: 4,  row: 4  },
      { npcId: 'trader-01', col: 2,  row: 7  },
      { npcId: 'warden-01', col: 16, row: 4  },
      { npcId: 'oracle-01', col: 18, row: 18 }
    ];

    this.npcs = spawns.map(spawn => {
      const profile = (this.meta.npcProfiles ?? []).find(p => p.id === spawn.npcId) ?? {
        id: spawn.npcId, name: spawn.npcId, faction: 'neutral',
        rumors: [], day_behavior: 'patrol', night_behavior: 'wander'
      };
      const { x, y } = this._isoPos(spawn.col, spawn.row);
      const depth = this._charDepth(spawn.row, spawn.col);

      // Shadow
      const shadow = this.add.ellipse(x, y - 2, 16, 5, 0x000000, 0.25).setDepth(depth - 1);

      const sprite = this.add.image(x, y - TILE_H / 2, npcTextureKey(profile.faction))
        .setOrigin(0.5, 1).setDepth(depth);

      // Faction colour per NPC
      const factionCol = {
        GraffPUNKS: '#8dff6a', hostile: '#ff3355', 'moon-mission': '#5ef2ff', neutral: '#ffd84d'
      };
      const nameCol = factionCol[profile.faction] ?? '#aaffee';

      const label = this.add.text(x, y - TILE_H / 2 - 44, profile.name ?? spawn.npcId, {
        fontSize: '10px',
        color: nameCol,
        fontFamily: '"Courier New", Courier, monospace',
        stroke: '#000000',
        strokeThickness: 3,
        padding: { x: 4, y: 2 }
      }).setOrigin(0.5, 1).setDepth(depth + 1);

      return {
        sprite, label, shadow, profile,
        col: spawn.col, row: spawn.row,
        timer: Phaser.Math.Between(0, 80),
        rumorTimer: Phaser.Math.Between(0, 600)
      };
    });
  }

  _updateNPCs() {
    this.npcs.forEach(npc => {
      npc.timer++;
      npc.rumorTimer++;

      const behavior = this.phase === 'Day' ? npc.profile.day_behavior : npc.profile.night_behavior;

      if (npc.timer % 50 === 0) {
        let dc = 0, dr = 0;
        if (behavior === 'hunt' || behavior === 'guide' || behavior === 'deliver') {
          const rawDc = this.playerCol - npc.col;
          const rawDr = this.playerRow - npc.row;
          if (Math.abs(rawDc) + Math.abs(rawDr) > 0) {
            dc = Math.abs(rawDc) >= Math.abs(rawDr) ? Math.sign(rawDc) : 0;
            dr = Math.abs(rawDr) >  Math.abs(rawDc) ? Math.sign(rawDr) : 0;
          }
        } else if (!STATIONARY_BEHAVIORS.has(behavior)) {
          const dir = Phaser.Math.Between(0, 3);
          dc = WANDER_DC[dir]; dr = WANDER_DR[dir];
        }

        const nc = npc.col + dc, nr = npc.row + dr;
        if ((dc !== 0 || dr !== 0) && !this._isBlocked(nc, nr) && nc >= 0 && nc < MAP_COLS && nr >= 0 && nr < MAP_ROWS) {
          npc.col = nc; npc.row = nr;
          const { x, y } = this._isoPos(nc, nr);
          const depth = this._charDepth(nr, nc);
          this.tweens.add({ targets: npc.sprite,  x, y: y - TILE_H / 2,     duration: 220 });
          this.tweens.add({ targets: npc.label,   x, y: y - TILE_H / 2 - 44, duration: 220 });
          this.tweens.add({ targets: npc.shadow,  x, y: y - 2,               duration: 220 });
          npc.sprite.setDepth(depth);
          npc.label.setDepth(depth + 1);
          npc.shadow.setDepth(depth - 1);
        }
      }

      if (npc.rumorTimer > RUMOR_MIN_FRAMES + Phaser.Math.Between(0, RUMOR_VARIANCE_FRAMES)) {
        npc.rumorTimer = 0;
        const rumors = npc.profile.rumors ?? [];
        if (rumors.length > 0) this._showBubble(npc.sprite, rumors[Math.floor(Math.random() * rumors.length)], npc.profile.faction);
      }
    });
  }

  _showBubble(anchor, text, faction = 'neutral') {
    const factionBorder = {
      GraffPUNKS: '#8dff6a44', hostile: '#ff335544', 'moon-mission': '#5ef2ff44', neutral: '#ffd84d44'
    };
    const borderCol = factionBorder[faction] ?? '#ffffff22';

    // Background box
    const bubble = this.add.text(anchor.x, anchor.y - 56, text, {
      fontSize: '10px',
      color: '#eaf6ff',
      backgroundColor: 'rgba(4,2,14,0.92)',
      fontFamily: '"Courier New", Courier, monospace',
      padding: { x: 10, y: 6 },
      wordWrap: { width: 180 },
      maxLines: 3,
      stroke: borderCol,
      strokeThickness: 1,
    }).setOrigin(0.5, 1).setDepth(9999);

    // Small triangle pointer (not natively supported; skip for now)

    this.tweens.add({
      targets: bubble, alpha: 0, y: bubble.y - 20,
      delay: 2800, duration: 1200, ease: 'Sine.Out',
      onComplete: () => bubble.destroy()
    });
  }

  // ── NEON PULSE ────────────────────────────────────────────────────────────

  _pulseNeons() {
    this._glowPulse = (this._glowPulse + 0.06) % (Math.PI * 2);
    const a = 0.28 + Math.sin(this._glowPulse) * 0.12;
    if (this._glowObjects) this._glowObjects.forEach(g => g.setAlpha(a));
    if (this.playerGlow) this.playerGlow.setAlpha(0.35 + Math.sin(this._glowPulse * 1.3) * 0.12);
  }

  // ── HUD ──────────────────────────────────────────────────────────────────

  _createHUD() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    // ── Stats panel (top-left) ──────────────────────────────────────────────
    const panelW = 240, panelH = 196;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(10000);

    // Layered panel background
    bg.fillStyle(0x000000, 0.72);
    bg.fillRect(6, 6, panelW + 2, panelH + 2);
    bg.fillStyle(0x04020c, 0.92);
    bg.fillRect(8, 8, panelW, panelH);

    // Neon border
    bg.lineStyle(1, C.NEON_CYAN, 0.6);
    bg.strokeRect(8, 8, panelW, panelH);
    // Inner accent line
    bg.lineStyle(1, C.NEON_CYAN, 0.15);
    bg.strokeRect(11, 11, panelW - 6, panelH - 6);

    // Top accent bar (colour-coded to phase)
    bg.fillStyle(C.NEON_PINK, 0.6);
    bg.fillRect(8, 8, panelW, 3);

    // Panel header
    this.add.text(16, 14, '◈ BLOCK TOPIA', {
      fontSize: '12px', color: '#5ef2ff', fontFamily: '"Courier New", Courier, monospace',
      letterSpacing: 2
    }).setScrollFactor(0).setDepth(10001);

    // Season badge
    const season = this.meta.season?.season_name ?? 'Season 1';
    this.add.text(panelW - 4, 14, season, {
      fontSize: '10px', color: '#ffd84d44', fontFamily: '"Courier New", Courier, monospace'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(10001);

    // Divider line
    const dg = this.add.graphics().setScrollFactor(0).setDepth(10001);
    dg.lineStyle(1, C.NEON_CYAN, 0.3);
    dg.lineBetween(12, 30, panelW + 4, 30);

    // Player name row
    this.hudPlayerName = this.add.text(14, 34, `▶ ${this.meta.player}`, {
      fontSize: '13px', color: '#ff4fd8', fontFamily: '"Courier New", Courier, monospace',
      stroke: '#000000', strokeThickness: 2
    }).setScrollFactor(0).setDepth(10001);

    // Stats rows
    const ls = { fontSize: '11px', color: '#5ef2ff44', fontFamily: '"Courier New", Courier, monospace' };
    const vs = { fontSize: '11px', color: '#eaf6ff',   fontFamily: '"Courier New", Courier, monospace' };

    this._hudRow('CREDITS', `${this.meta.economy.credits}`, 56,  ls, vs, 'hudCredits');
    this._hudRow('MARKET',  `${this.marketPrice.toFixed(2)}`, 74, ls, { ...vs, color: '#ffd84d' }, 'hudMarket');
    this._hudRow('SCORE',   '0',          92,  ls, { ...vs, color: '#8dff6a' }, 'hudScore');
    this._hudRow('DISTRICT','—',          110, ls, vs, 'hudDistrict');
    this._hudRow('PHASE',   'Day',        128, ls, { ...vs, color: '#8dff6a' }, 'hudPhase');
    this._hudRow('HEAT',    '0%',         146, ls, { ...vs, color: '#ff3355' }, 'hudHeat');

    // Bottom accent
    const bg2 = this.add.graphics().setScrollFactor(0).setDepth(10000);
    bg2.lineStyle(1, C.NEON_PINK, 0.25);
    bg2.lineBetween(12, 200, panelW + 4, 200);

    // ── District entry banner ────────────────────────────────────────────────
    this.districtBanner = this.add.text(W / 2, 14, '', {
      fontSize: '16px',
      color: '#ffd84d',
      fontFamily: '"Courier New", Courier, monospace',
      stroke: '#000000',
      strokeThickness: 4,
      padding: { x: 16, y: 8 },
      backgroundColor: 'rgba(0,0,0,0.82)'
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10002).setAlpha(0);

    // ── Market ticker strip (top-right) ─────────────────────────────────────
    this._createTickerStrip(W, H);

    // ── Chat panel (bottom-right) ────────────────────────────────────────────
    this._createChatPanel(W, H);

    // ── Controls hint (bottom-left) ──────────────────────────────────────────
    this.add.text(12, H - 20, CONTROLS_HINT, {
      fontSize: '9px', color: '#333355', fontFamily: '"Courier New", Courier, monospace'
    }).setScrollFactor(0).setDepth(10001);
  }

  _hudRow(label, value, y, labelStyle, valueStyle, valueRef) {
    // Accent dot
    this.add.text(14, y, '›', { ...labelStyle, color: '#5ef2ff' }).setScrollFactor(0).setDepth(10001);
    this.add.text(22, y, `${label}`, labelStyle).setScrollFactor(0).setDepth(10001);
    this[valueRef] = this.add.text(110, y, value, valueStyle).setScrollFactor(0).setDepth(10001);
  }

  _createTickerStrip(W, H) {
    const tickW = 380, tickH = 22;
    const tx = W - tickW - 8, ty = 8;

    const tg = this.add.graphics().setScrollFactor(0).setDepth(10000);
    tg.fillStyle(0x000000, 0.8);
    tg.fillRect(tx, ty, tickW, tickH);
    tg.lineStyle(1, C.NEON_GOLD, 0.5);
    tg.strokeRect(tx, ty, tickW, tickH);
    tg.fillStyle(C.NEON_GOLD, 0.6);
    tg.fillRect(tx, ty, tickW, 2);

    this.tickerTokens = [
      { sym: 'BTC',  price: '98,420', dir: '▲', col: '#8dff6a' },
      { sym: 'ETH',  price: '3,640',  dir: '▲', col: '#8dff6a' },
      { sym: 'BTOP', price: '4.20',   dir: '▼', col: '#ff3355' },
      { sym: 'GK',   price: '0.42',   dir: '▲', col: '#8dff6a' },
    ];
    this._tickerTexts = this.tickerTokens.map((tok, i) => {
      return this.add.text(tx + 10 + i * 96, ty + 5, `${tok.sym} ${tok.price} ${tok.dir}`, {
        fontSize: '10px', color: tok.col, fontFamily: '"Courier New", Courier, monospace'
      }).setScrollFactor(0).setDepth(10001);
    });
  }

  _createChatPanel(W, H) {
    const PW = 240, PH = 160;
    const px = W - PW - 8, py = H - PH - 8;

    const cg = this.add.graphics().setScrollFactor(0).setDepth(10000);

    // Layered background
    cg.fillStyle(0x000000, 0.65);
    cg.fillRect(px - 2, py - 2, PW + 4, PH + 4);
    cg.fillStyle(0x04020c, 0.90);
    cg.fillRect(px, py, PW, PH);

    // Border
    cg.lineStyle(1, C.NEON_PINK, 0.45);
    cg.strokeRect(px, py, PW, PH);
    cg.lineStyle(1, C.NEON_PINK, 0.12);
    cg.strokeRect(px + 3, py + 3, PW - 6, PH - 6);

    // Header bar
    cg.fillStyle(C.NEON_PINK, 0.2);
    cg.fillRect(px, py, PW, 24);
    cg.lineStyle(1, C.NEON_PINK, 0.4);
    cg.lineBetween(px, py + 24, px + PW, py + 24);

    this.add.text(px + 10, py + 6, '💬  STREET SIGNAL', {
      fontSize: '10px', color: '#ff4fd8', fontFamily: '"Courier New", Courier, monospace',
      letterSpacing: 1
    }).setScrollFactor(0).setDepth(10001);

    // Live indicator
    this.add.text(px + PW - 12, py + 6, '● LIVE', {
      fontSize: '9px', color: '#8dff6a', fontFamily: '"Courier New", Courier, monospace'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(10001);

    const msgs = [
      { col: '#8dff6a', txt: '> Signal Runner: Moon Gate protocols running…' },
      { col: '#5ef2ff', txt: '> Candle Broker: BTC candles green. All hands.' },
      { col: '#ff4fd8', txt: '> System: Neon Exchange raid window open.' },
      { col: '#ff3355', txt: '> Chain Warden: Chain Plaza is locked down.' },
      { col: '#5ef2ff', txt: '> Oracle: Watch the chain. It never lies.' },
    ];
    msgs.forEach((m, i) => {
      this.add.text(px + 8, py + 30 + i * 24, m.txt, {
        fontSize: '9px', color: m.col, fontFamily: '"Courier New", Courier, monospace',
        wordWrap: { width: PW - 16 }
      }).setScrollFactor(0).setDepth(10001);
    });

    // Input field
    const ig = this.add.graphics().setScrollFactor(0).setDepth(10000);
    ig.lineStyle(1, C.NEON_PINK, 0.3);
    ig.strokeRect(px + 4, py + PH - 20, PW - 8, 14);
    this.add.text(px + 8, py + PH - 17, '> type to broadcast…', {
      fontSize: '9px', color: '#333355', fontFamily: '"Courier New", Courier, monospace'
    }).setScrollFactor(0).setDepth(10001);
  }

  _refreshHUD() {
    const eco = this.meta.economy;
    this.hudCredits.setText(`${eco.credits}`);
    this.hudMarket.setText(`${this.marketPrice.toFixed(2)}`);
    this.hudMarket.setColor(this.marketPrice > 100 ? '#8dff6a' : '#ff3355');
    this.hudScore.setText(`${this.metaScore}`);
    this.hudDistrict.setText(this.currentDistrict === 'none' ? '—' : this.currentDistrict);
    this.hudPhase.setText(this.phase);
    this.hudPhase.setColor(this.phase === 'Day' ? '#8dff6a' : '#5ef2ff');
    this.hudHeat.setText(`${Math.round(this.heat * 100)}%`);
    this.hudHeat.setColor(this.heat > 0.7 ? '#ff3355' : this.heat > 0.4 ? '#ffd84d' : '#8dff6a');

    // Ticker scroll-update (random jitter for live feel)
    if (this._tickerTexts && Math.random() > 0.6) {
      const i = Math.floor(Math.random() * this._tickerTexts.length);
      const tok = this.tickerTokens[i];
      const jitter = (Math.random() - 0.48) * 0.4;
      const raw = parseFloat(tok.price.replace(',', '')) * (1 + jitter);
      const fmt = raw > 1000 ? raw.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : raw.toFixed(2);
      tok.price = fmt;
      tok.dir = jitter >= 0 ? '▲' : '▼';
      tok.col = jitter >= 0 ? '#8dff6a' : '#ff3355';
      this._tickerTexts[i].setText(`${tok.sym} ${tok.price} ${tok.dir}`);
      this._tickerTexts[i].setColor(tok.col);
    }
  }

  // ── CAMERA ───────────────────────────────────────────────────────────────

  _setupCamera() {
    const worldW = (MAP_COLS + MAP_ROWS) * TILE_W;
    const worldH = (MAP_COLS + MAP_ROWS) * TILE_H + 400;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(1);
    this._followCamera();
  }

  _followCamera() {
    if (!this.playerSprite) return;
    this.cameras.main.centerOn(this.playerSprite.x, this.playerSprite.y - 40);
  }

  // ── INPUT ────────────────────────────────────────────────────────────────

  _setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys    = this.input.keyboard.addKeys('W,A,S,D,SPACE,Q,E');

    this.input.on('wheel', (ptr, objs, dx, dy) => {
      const z = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.4, 2.8);
      this.cameras.main.setZoom(z);
    });

    this.input.keyboard.on('keydown-SPACE', () => this._togglePhase());

    if (this.meta.isMobile || window.matchMedia('(pointer: coarse)').matches) {
      this._setupVirtualJoystick();
    }
    this._setupPinchZoom();
  }

  _setupVirtualJoystick() {
    const H  = this.cameras.main.height;
    const cx = 72, cy = H - 82, radius = 46;

    this.joyBase = this.add.graphics().setScrollFactor(0).setDepth(10003);
    // Outer ring
    this.joyBase.lineStyle(2, C.NEON_CYAN, 0.35);
    this.joyBase.strokeCircle(cx, cy, radius);
    // Inner fill
    this.joyBase.fillStyle(0x04020c, 0.4);
    this.joyBase.fillCircle(cx, cy, radius);
    // Cross guides
    this.joyBase.lineStyle(1, C.NEON_CYAN, 0.15);
    this.joyBase.lineBetween(cx - radius, cy, cx + radius, cy);
    this.joyBase.lineBetween(cx, cy - radius, cx, cy + radius);

    this.joyKnob = this.add.graphics().setScrollFactor(0).setDepth(10004);
    this._drawKnob(cx, cy);
    this._joyCenter = { x: cx, y: cy };

    this.input.on('pointerdown', (ptr) => {
      if (ptr.x < 180 && ptr.y > H - 180) { this._joyActive = true; this._updateJoystick(ptr); }
    });
    this.input.on('pointermove', (ptr) => {
      if (this._joyActive && ptr.isDown) this._updateJoystick(ptr);
    });
    this.input.on('pointerup', () => {
      this._joyActive = false;
      this._joyDir = { dx: 0, dy: 0 };
      this._drawKnob(this._joyCenter.x, this._joyCenter.y);
    });
  }

  _drawKnob(x, y) {
    this.joyKnob.clear();
    this.joyKnob.fillStyle(C.NEON_PINK, 0.6);
    this.joyKnob.fillCircle(x, y, 16);
    this.joyKnob.lineStyle(2, C.NEON_CYAN, 0.6);
    this.joyKnob.strokeCircle(x, y, 16);
  }

  _updateJoystick(ptr) {
    const jx = this._joyCenter.x, jy = this._joyCenter.y;
    const dx = ptr.x - jx, dy = ptr.y - jy;
    const dist  = Math.sqrt(dx * dx + dy * dy);
    const maxR  = 38;
    const angle = Math.atan2(dy, dx);
    const clamped = Math.min(dist, maxR);
    this._drawKnob(jx + Math.cos(angle) * clamped, jy + Math.sin(angle) * clamped);
    this._joyDir = dist > 10 ? { dx: Math.cos(angle), dy: Math.sin(angle) } : { dx: 0, dy: 0 };
  }

  _setupPinchZoom() {
    let lastDist = null;
    this.input.on('pointermove', () => {
      const active = this.input.manager.pointers.filter(p => p.isDown);
      if (active.length === 2) {
        const dx = active[0].x - active[1].x, dy = active[0].y - active[1].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (lastDist !== null) {
          this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom * (d / lastDist), 0.4, 2.8));
        }
        lastDist = d;
      } else { lastDist = null; }
    });
  }

  // ── DISTRICTS ────────────────────────────────────────────────────────────

  _setupDistricts() {
    this.districtZones = (this.meta.mapData?.districts ?? []).map(d => ({
      id: d.id, name: d.name, region: d.region, color: d.color
    }));
  }

  _checkDistrict() {
    const col = this.playerCol, row = this.playerRow;
    let found = 'none';
    for (const dz of this.districtZones) {
      const r = dz.region;
      if (col >= r.col && col < r.col + r.w && row >= r.row && row < r.row + r.h) {
        found = dz.id;
        if (found !== this.currentDistrict) this._enterDistrict(dz);
        break;
      }
    }
    this.currentDistrict = found;
  }

  _enterDistrict(dz) {
    const col = dz.color ?? '#ffd84d';
    this.districtBanner.setText(`◈  ${dz.name.toUpperCase()}  ◈`);
    this.districtBanner.setColor(col);
    this.districtBanner.setAlpha(1);
    this.tweens.add({ targets: this.districtBanner, alpha: 0, delay: 2800, duration: 1000, ease: 'Power2' });
    updateDistrictControl(dz.id, 1, this.meta.player);
    this._handleZoneInteraction(dz.id);
  }

  _handleZoneInteraction(zoneId) {
    if (this.phase === 'Night') {
      this.combo  += 1;
      this.heat    = Math.min(1, this.heat + 0.02);
      this.metaScore += 10 + this.combo * 2;
      pushBattleEvent(buildGraffitiEvent(this.meta.player, zoneId, this.metaScore));
      const districtControl = this.meta.districts?.districts?.[zoneId] ?? 50;
      const { updatedEconomy, metaScore } = scoreNightRun(this.meta.economy, districtControl, this.heat, this.combo);
      this.meta.economy = updatedEconomy;
      saveEconomyState(this.meta.economy);
      this.metaScore += metaScore;
    } else if (zoneId === 'neon-exchange') {
      this.meta.economy = buyExposure(this.meta.economy, this.marketPrice, 100);
      saveEconomyState(this.meta.economy);
    }
  }

  // ── MARKET ───────────────────────────────────────────────────────────────

  _tickMarket() {
    const delta = rollMarketTick(this.meta.season?.market_conditions ?? 'volatile');
    this.marketPrice = Math.max(1, this.marketPrice * (1 + delta));
    this._refreshHUD();
  }

  _togglePhase() {
    this.phase = this.phase === 'Day' ? 'Night' : 'Day';
    const nightBg = '#04020c', dayBg = '#0b0912';
    this.cameras.main.setBackgroundColor(this.phase === 'Night' ? nightBg : dayBg);
    if (this.phase === 'Night') this.combo = 0;
    this._refreshHUD();
  }

  // ── MOVEMENT ─────────────────────────────────────────────────────────────

  _handleMovement(time) {
    if (time - this._lastMoveTime < MOVE_THROTTLE_MS) return;

    let dc = 0, dr = 0;
    if (this.cursors.left.isDown  || this.keys.A.isDown)  dc = -1;
    else if (this.cursors.right.isDown || this.keys.D.isDown) dc =  1;
    if (this.cursors.up.isDown    || this.keys.W.isDown)  dr = -1;
    else if (this.cursors.down.isDown  || this.keys.S.isDown)  dr =  1;

    if (this._joyActive && (Math.abs(this._joyDir.dx) > JOYSTICK_DEADZONE || Math.abs(this._joyDir.dy) > JOYSTICK_DEADZONE)) {
      dc = Math.round(this._joyDir.dx);
      dr = Math.round(this._joyDir.dy);
    }

    if (this.keys.Q?.isDown) this.cameras.main.setZoom(Math.max(0.4, this.cameras.main.zoom - 0.015));
    if (this.keys.E?.isDown) this.cameras.main.setZoom(Math.min(2.8, this.cameras.main.zoom + 0.015));

    if (dc !== 0 || dr !== 0) {
      this._movePlayer(dc, dr);
      this._lastMoveTime = time;
    }
  }

  // ── UTILS ─────────────────────────────────────────────────────────────────

  _isoPos(col, row) {
    const iso = cartToIso(col, row);
    return { x: iso.x + this.mapOriginX, y: iso.y + this.mapOriginY };
  }

  _charDepth(row, col) {
    return (row + col) * 10 + 5;
  }
}
