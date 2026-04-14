/**
 * blocktopia-phaser-game.js
 * Block Topia: Street Signal 3008 — Isometric Game Engine
 *
 * Implements a Habbo-style isometric social hub using Phaser 3.
 * All visual assets are generated procedurally so the game runs without
 * external image files, and can be upgraded to real pixel art later.
 */

import { loadSeasonConfig, loadLoreFeed, loadProphecyCandidates } from './blocktopia-season.js';
import { loadEconomyState, saveEconomyState, rollMarketTick, buyExposure, scoreNightRun } from './blocktopia-economy.js';
import { fetchDistrictState, updateDistrictControl } from './blocktopia-districts.js';
import { pushBattleEvent, buildGraffitiEvent } from './blocktopia-battle-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { ArcadeSync } from '/js/arcade-sync.js';

// ── Isometric tile constants ─────────────────────────────────────────────────
/** Width of one flat isometric tile face in pixels */
const TILE_W = 64;
/** Height of one flat isometric tile face in pixels */
const TILE_H = 32;
/** Map dimensions (cols × rows) */
const MAP_COLS = 24;
const MAP_ROWS = 24;
/** Milliseconds between accepted movement inputs */
const MOVE_THROTTLE_MS = 140;

/** Tile type identifiers used in the map grid */
const TILE = Object.freeze({
  ROAD: 0,
  GROUND: 1,
  BUILDING_S: 2,
  BUILDING_M: 3,
  BUILDING_L: 4,
  TREE: 5,
  WATER: 6,
  GRAFFITI: 7
});

/** Tile types that block movement */
const BLOCKED_TILES = new Set([TILE.BUILDING_S, TILE.BUILDING_M, TILE.BUILDING_L, TILE.TREE]);

/** Deadzone threshold for the virtual joystick axis (0–1) */
const JOYSTICK_DEADZONE = 0.35;

/** Minimum frames before an NPC may show a new rumour bubble */
const RUMOR_MIN_FRAMES = 540;
/** Maximum additional random frames added to the rumour interval */
const RUMOR_VARIANCE_FRAMES = 360;

/** Direction deltas indexed [down, up, right, left] used for wander/patrol NPCs */
const WANDER_DC = [0,  0, 1, -1];
const WANDER_DR = [1, -1, 0,  0];

/** Controls hint displayed in the HUD footer */
const CONTROLS_HINT = 'WASD/Arrows: Move  ·  SPACE: Day/Night  ·  Q/E or scroll: Zoom';

// ── Coordinate helpers ────────────────────────────────────────────────────────

/**
 * Convert cartesian grid coordinates to isometric screen offset.
 * Add mapOriginX / mapOriginY to get final screen position.
 * @param {number} cx - Grid column
 * @param {number} cy - Grid row
 * @returns {{ x: number, y: number }}
 */
export function cartToIso(cx, cy) {
  return {
    x: (cx - cy) * (TILE_W / 2),
    y: (cx + cy) * (TILE_H / 2)
  };
}

/**
 * Convert isometric screen offset back to approximate cartesian coordinates.
 * @param {number} sx - Iso screen X offset
 * @param {number} sy - Iso screen Y offset
 * @returns {{ x: number, y: number }}
 */
export function isoToCart(sx, sy) {
  return {
    x: (sx / TILE_W + sy / TILE_H),
    y: (sy / TILE_H - sx / TILE_W)
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Boot the Block Topia Phaser 3 game inside the given DOM container.
 * Loads all required data in parallel before creating the game instance.
 * @param {string} [containerId='phaser-root'] - ID of the host element
 * @returns {Promise<Phaser.Game>}
 */
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
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: new BlockTopiaScene({ season, lore, prophecy, economy, districts, player, mapData, npcProfiles, isMobile })
  };

  return new Phaser.Game(config);
}

// ── Procedural asset generation ───────────────────────────────────────────────

/**
 * Draw a single isometric tile face (top diamond) plus optional side panels onto
 * a temporary Graphics object, bake into a RenderTexture and save as a named texture.
 * @param {Phaser.Scene} scene
 * @param {string} key        - Texture key to register
 * @param {number} topHex     - Fill colour for the top face
 * @param {number} leftHex    - Fill colour for the left side panel
 * @param {number} rightHex   - Fill colour for the right side panel
 * @param {number} [depth=0]  - Pixel height of the side panels (0 = flat tile)
 */
function makeIsoTileTexture(scene, key, topHex, leftHex, rightHex, depth = 0) {
  if (scene.textures.exists(key)) return;

  const texH = TILE_H + depth;
  const rt   = scene.add.renderTexture(0, 0, TILE_W, texH);
  const g    = scene.add.graphics();
  const hw   = TILE_W / 2;
  const hh   = TILE_H / 2;

  // Top diamond
  g.fillStyle(topHex, 1);
  g.fillPoints([
    { x: hw,     y: 0       },
    { x: TILE_W, y: hh      },
    { x: hw,     y: TILE_H  },
    { x: 0,      y: hh      }
  ], true);

  if (depth > 0) {
    // Left face
    g.fillStyle(leftHex, 1);
    g.fillPoints([
      { x: 0,  y: hh          },
      { x: hw, y: TILE_H      },
      { x: hw, y: TILE_H + depth },
      { x: 0,  y: hh  + depth }
    ], true);

    // Right face
    g.fillStyle(rightHex, 1);
    g.fillPoints([
      { x: TILE_W, y: hh          },
      { x: hw,     y: TILE_H      },
      { x: hw,     y: TILE_H + depth },
      { x: TILE_W, y: hh  + depth }
    ], true);
  }

  // Subtle outline
  g.lineStyle(1, 0x000000, 0.25);
  g.strokePoints([
    { x: hw,     y: 0      },
    { x: TILE_W, y: hh     },
    { x: hw,     y: TILE_H },
    { x: 0,      y: hh     }
  ], true);

  rt.draw(g, 0, 0);
  rt.saveTexture(key);
  g.destroy();
  rt.destroy();
}

/**
 * Draw a simple pixel-art character sprite onto a RenderTexture.
 * @param {Phaser.Scene} scene
 * @param {string} key       - Texture key
 * @param {number} bodyHex   - Shirt/body colour
 * @param {number} accentHex - Hat/hair accent colour
 */
function makeCharTexture(scene, key, bodyHex, accentHex) {
  if (scene.textures.exists(key)) return;

  const W = 24, H = 38;
  const rt = scene.add.renderTexture(0, 0, W, H);
  const g  = scene.add.graphics();

  // Legs
  g.fillStyle(0x1a1a33, 1);
  g.fillRect(5,  26, 5, 12);
  g.fillRect(13, 26, 5, 12);
  // Body
  g.fillStyle(bodyHex, 1);
  g.fillRect(3, 14, 18, 13);
  // Head
  g.fillStyle(0xf5c28a, 1);
  g.fillCircle(12, 10, 8);
  // Hat / hair
  g.fillStyle(accentHex, 1);
  g.fillRect(3, 2, 18, 6);
  // Eyes
  g.fillStyle(0xffffff, 1);
  g.fillRect(6,  8, 4, 3);
  g.fillRect(14, 8, 4, 3);
  g.fillStyle(0x111111, 1);
  g.fillRect(7,  9, 2, 2);
  g.fillRect(15, 9, 2, 2);

  rt.draw(g, 0, 0);
  rt.saveTexture(key);
  g.destroy();
  rt.destroy();
}

/**
 * Create all procedural textures used by the game.
 * Called once in the scene's create() phase.
 * @param {Phaser.Scene} scene
 */
function generateTextures(scene) {
  // Flat ground tiles (no depth)
  makeIsoTileTexture(scene, 'tile_road',     0x1a1a2e, 0, 0, 0);
  makeIsoTileTexture(scene, 'tile_ground',   0x1a2e1a, 0, 0, 0);
  makeIsoTileTexture(scene, 'tile_graffiti', 0x2a0a1a, 0, 0, 0);
  makeIsoTileTexture(scene, 'tile_water',    0x0a2a4a, 0, 0, 0);

  // Generic buildings (depth = block height in pixels)
  makeIsoTileTexture(scene, 'bld_s',  0x2d2d5a, 0x1e1e3a, 0x16163a, 22);
  makeIsoTileTexture(scene, 'bld_m',  0x3a2d5a, 0x281e3a, 0x1e163a, 44);
  makeIsoTileTexture(scene, 'bld_l',  0x2d4a5a, 0x1e303a, 0x162430, 66);

  // District-themed buildings
  makeIsoTileTexture(scene, 'bld_ne', 0x4a3d00, 0x302800, 0x241e00, 44); // Neon Exchange (gold)
  makeIsoTileTexture(scene, 'bld_ms', 0x4a0038, 0x300022, 0x24001a, 44); // Mural Sector (pink)
  makeIsoTileTexture(scene, 'bld_cp', 0x003a4a, 0x002830, 0x001e24, 44); // Chain Plaza (cyan)
  makeIsoTileTexture(scene, 'bld_mg', 0x0a3a00, 0x072800, 0x041e00, 66); // Moon Gate (green)

  // Character sprites
  makeCharTexture(scene, 'char_player',  0xff4fd8, 0x8800aa);
  makeCharTexture(scene, 'char_runner',  0xff4fd8, 0xcc1166);
  makeCharTexture(scene, 'char_trader',  0xffd84d, 0x885500);
  makeCharTexture(scene, 'char_warden',  0xff4d4d, 0x880000);
  makeCharTexture(scene, 'char_oracle',  0x5ef2ff, 0x0088aa);
  makeCharTexture(scene, 'char_remote',  0x88aaff, 0x334488);
}

// ── Faction → texture helper ─────────────────────────────────────────────────

/**
 * Map an NPC faction name to its procedurally-generated character texture key.
 * Falls back to the neutral trader sprite for unknown factions.
 * @param {string} faction - NPC faction identifier (e.g. 'GraffPUNKS', 'hostile')
 * @returns {string} Phaser texture key
 */
function npcTextureKey(faction) {
  const map = { GraffPUNKS: 'char_runner', hostile: 'char_warden', 'moon-mission': 'char_oracle' };
  return map[faction] || 'char_trader';
}

// ── Main Scene ────────────────────────────────────────────────────────────────

class BlockTopiaScene extends Phaser.Scene {
  /** @param {object} data - Game initialisation data bundle */
  constructor(data) {
    super({ key: 'BlockTopiaScene' });
    this.meta          = data;
    this.marketPrice   = 100;
    this.heat          = 0;
    this.combo         = 0;
    this.phase         = 'Day';
    this.metaScore     = 0;
    this.currentDistrict = 'none';
    this.npcs          = [];
    this.remotePlayers = new Map();
    /** Player grid position */
    this.playerCol     = data.mapData?.playerStart?.col ?? 12;
    this.playerRow     = data.mapData?.playerStart?.row ?? 12;
    this._lastMoveTime = 0;
    this._joyDir       = { dx: 0, dy: 0 };
    this._joyActive    = false;
  }

  // ── Phaser lifecycle ──────────────────────────────────────────────────────

  preload() {
    // All textures are created procedurally in create(); nothing to load.
  }

  create() {
    generateTextures(this);

    // World origin: horizontally centred, pushed down to leave room for HUD
    this.mapOriginX = this.cameras.main.width  / 2;
    this.mapOriginY = 160;

    this._buildMap();
    this._createPlayer();
    this._createNPCs();
    this._createHUD();
    this._setupCamera();
    this._setupInput();
    this._setupDistricts();

    // Market tick
    this.time.addEvent({ delay: 2500, loop: true, callback: this._tickMarket, callbackScope: this });

    // Score submission on unload
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

  // ── Map building ──────────────────────────────────────────────────────────

  /** Construct the isometric tile grid from map data (or procedural fallback). */
  _buildMap() {
    this.mapGrid = [];
    for (let row = 0; row < MAP_ROWS; row++) {
      this.mapGrid[row] = [];
      for (let col = 0; col < MAP_COLS; col++) {
        const type    = this._resolveTileType(col, row);
        const texKey  = this._resolveTileTexture(col, row, type);
        const { x, y } = this._isoPos(col, row);
        const sprite  = this.add.image(x, y, texKey).setOrigin(0.5, 1);
        sprite.setDepth((row + col) * 10);
        this.mapGrid[row][col] = { sprite, type, col, row };
      }
    }
  }

  /**
   * Determine tile type for a given cell.
   * Applies road spines first, then district layouts, then fallback ground.
   * @param {number} col
   * @param {number} row
   * @returns {number} TILE constant
   */
  _resolveTileType(col, row) {
    const map = this.meta.mapData;

    // Road cross through centre of map
    if (col === 11 || col === 12 || row === 11 || row === 12) return TILE.ROAD;

    if (!map) return this._proceduralTile(col, row);

    // Check district regions
    for (const d of (map.districts ?? [])) {
      const r = d.region;
      if (col >= r.col && col < r.col + r.w && row >= r.row && row < r.row + r.h) {
        return this._districtTile(d.id, col, row);
      }
    }
    return TILE.GROUND;
  }

  /**
   * Layout tiles within a district using repeating patterns.
   * @param {string} districtId
   * @param {number} col
   * @param {number} row
   * @returns {number} TILE constant
   */
  _districtTile(districtId, col, row) {
    const lc = col % 6, lr = row % 6;
    switch (districtId) {
      case 'neon-exchange':
        return (lc === 2 && lr === 2) ? TILE.BUILDING_M
             : (lc === 4 && lr === 4) ? TILE.BUILDING_S
             : TILE.GROUND;
      case 'mural-sector':
        return (lc === 1 && lr === 1) ? TILE.BUILDING_L
             : (lc === 4)             ? TILE.GRAFFITI
             : TILE.GROUND;
      case 'chain-plaza':
        return (lc === 0 && lr === 0) ? TILE.BUILDING_L
             : ((lc + lr) % 4 === 0)  ? TILE.BUILDING_S
             : TILE.ROAD;
      case 'moon-gate':
        return (lc === 3 && lr === 3) ? TILE.BUILDING_L
             : ((lc + lr) % 5 === 2)  ? TILE.TREE
             : TILE.GROUND;
      default:
        return TILE.GROUND;
    }
  }

  /** Fallback procedural tile generation when no map data is present. */
  _proceduralTile(col, row) {
    if ((col + row) % 7 === 0) return TILE.BUILDING_M;
    if ((col + row) % 5 === 0) return TILE.BUILDING_S;
    return TILE.GROUND;
  }

  /**
   * Pick the correct texture key for a tile, applying district-themed building
   * textures where applicable.
   */
  _resolveTileTexture(col, row, type) {
    if ([TILE.BUILDING_S, TILE.BUILDING_M, TILE.BUILDING_L].includes(type)) {
      const map = this.meta.mapData;
      if (map) {
        for (const d of (map.districts ?? [])) {
          const r = d.region;
          if (col >= r.col && col < r.col + r.w && row >= r.row && row < r.row + r.h) {
            const themed = { 'neon-exchange': 'bld_ne', 'mural-sector': 'bld_ms', 'chain-plaza': 'bld_cp', 'moon-gate': 'bld_mg' };
            if (themed[d.id]) return themed[d.id];
          }
        }
      }
      // type - TILE.BUILDING_S maps BUILDING_S→0, BUILDING_M→1, BUILDING_L→2
      return ['bld_s', 'bld_m', 'bld_l'][type - TILE.BUILDING_S] ?? 'bld_s';
    }
    const flat = {
      [TILE.ROAD]:     'tile_road',
      [TILE.GROUND]:   'tile_ground',
      [TILE.GRAFFITI]: 'tile_graffiti',
      [TILE.TREE]:     'tile_ground',
      [TILE.WATER]:    'tile_water'
    };
    return flat[type] ?? 'tile_ground';
  }

  // ── Player ────────────────────────────────────────────────────────────────

  /** Spawn the player sprite at the starting grid position. */
  _createPlayer() {
    const { x, y } = this._isoPos(this.playerCol, this.playerRow);
    const depth = this._charDepth(this.playerRow, this.playerCol);

    this.playerSprite = this.add.image(x, y - TILE_H / 2, 'char_player')
      .setOrigin(0.5, 1)
      .setDepth(depth);

    this.playerLabel = this.add.text(x, y - TILE_H / 2 - 42, this.meta.player, {
      fontSize: '11px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 5, y: 3 }
    }).setOrigin(0.5, 1).setDepth(depth + 1);
  }

  /**
   * Attempt to move the player by (dc, dr) grid cells.
   * Validates bounds and collision before committing.
   * @param {number} dc - Column delta
   * @param {number} dr - Row delta
   */
  _movePlayer(dc, dr) {
    const newCol = this.playerCol + dc;
    const newRow = this.playerRow + dr;
    if (newCol < 0 || newCol >= MAP_COLS || newRow < 0 || newRow >= MAP_ROWS) return;
    if (this._isBlocked(newCol, newRow)) return;

    this.playerCol = newCol;
    this.playerRow = newRow;

    const { x, y } = this._isoPos(newCol, newRow);
    const depth    = this._charDepth(newRow, newCol);
    const sprY     = y - TILE_H / 2;
    const lblY     = sprY - 42;

    this.tweens.killTweensOf(this.playerSprite);
    this.tweens.killTweensOf(this.playerLabel);
    this.tweens.add({ targets: this.playerSprite, x, y: sprY, duration: 110, ease: 'Linear' });
    this.tweens.add({ targets: this.playerLabel,  x, y: lblY, duration: 110, ease: 'Linear' });
    this.playerSprite.setDepth(depth);
    this.playerLabel.setDepth(depth + 1);

    this._checkDistrict();
  }

  /** Returns true if the given grid cell is impassable. */
  _isBlocked(col, row) {
    return BLOCKED_TILES.has(this.mapGrid[row]?.[col]?.type);
  }

  // ── NPCs ──────────────────────────────────────────────────────────────────

  /** Spawn NPC sprites from profile data + map spawn list. */
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
      const depth     = this._charDepth(spawn.row, spawn.col);

      const sprite = this.add.image(x, y - TILE_H / 2, npcTextureKey(profile.faction))
        .setOrigin(0.5, 1)
        .setDepth(depth);

      const label = this.add.text(x, y - TILE_H / 2 - 42, profile.name ?? spawn.npcId, {
        fontSize: '10px',
        color: '#aaffee',
        backgroundColor: 'rgba(0,0,0,0.55)',
        padding: { x: 4, y: 2 }
      }).setOrigin(0.5, 1).setDepth(depth + 1);

      return {
        sprite, label, profile,
        col: spawn.col, row: spawn.row,
        timer: Phaser.Math.Between(0, 80),
        rumorTimer: Phaser.Math.Between(0, 600)
      };
    });
  }

  /**
   * Step NPC movement and rumour display each frame.
   * NPCs move on a coarser tick to feel more organic.
   */
  _updateNPCs() {
    this.npcs.forEach(npc => {
      npc.timer++;
      npc.rumorTimer++;

      const behavior = this.phase === 'Day' ? npc.profile.day_behavior : npc.profile.night_behavior;

      // Move every ~50 frames for active behaviours
      if (npc.timer % 50 === 0) {
        let dc = 0, dr = 0;

        if (behavior === 'hunt' || behavior === 'guide') {
          // Chase / follow player
          const rawDc = this.playerCol - npc.col;
          const rawDr = this.playerRow - npc.row;
          const dist  = Math.abs(rawDc) + Math.abs(rawDr);
          if (dist > 0) {
            dc = Math.abs(rawDc) >= Math.abs(rawDr) ? Math.sign(rawDc) : 0;
            dr = Math.abs(rawDr) >  Math.abs(rawDc) ? Math.sign(rawDr) : 0;
          }
        } else if (!STATIONARY_BEHAVIORS.has(behavior)) {
          // Wander / patrol — pick a random cardinal direction
          const dir = Phaser.Math.Between(0, 3);
          dc = WANDER_DC[dir];
          dr = WANDER_DR[dir];
        }

        const nc = npc.col + dc, nr = npc.row + dr;
        if (dc !== 0 || dr !== 0) {
          if (!this._isBlocked(nc, nr) && nc >= 0 && nc < MAP_COLS && nr >= 0 && nr < MAP_ROWS) {
            npc.col = nc;
            npc.row = nr;
            const { x, y } = this._isoPos(nc, nr);
            const depth     = this._charDepth(nr, nc);
            this.tweens.add({ targets: npc.sprite, x, y: y - TILE_H / 2, duration: 220, ease: 'Linear' });
            this.tweens.add({ targets: npc.label,  x, y: y - TILE_H / 2 - 42, duration: 220, ease: 'Linear' });
            npc.sprite.setDepth(depth);
            npc.label.setDepth(depth + 1);
          }
        }
      }

      // Rumour bubble at randomised intervals using named constants
      if (npc.rumorTimer > RUMOR_MIN_FRAMES + Phaser.Math.Between(0, RUMOR_VARIANCE_FRAMES)) {
        npc.rumorTimer = 0;
        const rumors = npc.profile.rumors ?? [];
        if (rumors.length > 0) {
          this._showBubble(npc.sprite, rumors[Math.floor(Math.random() * rumors.length)]);
        }
      }
    });
  }

  /**
   * Show a speech-bubble above a sprite that fades out automatically.
   * @param {Phaser.GameObjects.Image} anchor
   * @param {string} text
   */
  _showBubble(anchor, text) {
    const bubble = this.add.text(anchor.x, anchor.y - 52, text, {
      fontSize: '11px',
      color: '#eaf6ff',
      backgroundColor: 'rgba(10,5,25,0.85)',
      padding: { x: 8, y: 5 },
      wordWrap: { width: 180 },
      maxLines: 3
    }).setOrigin(0.5, 1).setDepth(9999);

    this.tweens.add({
      targets: bubble,
      alpha: 0,
      y: bubble.y - 18,
      delay: 2800,
      duration: 1400,
      ease: 'Sine.Out',
      onComplete: () => bubble.destroy()
    });
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  /** Build the fixed-camera HUD overlay (stats panel + chat panel + hint bar). */
  _createHUD() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    // ─ Stats panel (top-left) ─
    const bg = this.add.graphics().setScrollFactor(0).setDepth(10000);
    bg.fillStyle(0x0b0912, 0.84);
    bg.fillRoundedRect(8, 8, 226, 158, 8);
    bg.lineStyle(1, 0x5ef2ff, 0.35);
    bg.strokeRoundedRect(8, 8, 226, 158, 8);

    const ls = { fontSize: '12px', color: '#5ef2ff', fontFamily: 'monospace' };
    const vs = { fontSize: '12px', color: '#eaf6ff', fontFamily: 'monospace' };

    this.hudPlayerName = this.add.text(18, 14, `▶ ${this.meta.player}`, { ...vs, color: '#ff4fd8', fontSize: '13px' })
      .setScrollFactor(0).setDepth(10001);

    this._hudRow('CREDITS', `${this.meta.economy.credits}`, 34, ls, vs, 'hudCredits');
    this._hudRow('MARKET',  `${this.marketPrice.toFixed(2)}`, 54, ls, vs, 'hudMarket');
    this._hudRow('SCORE',   '0', 74, ls, vs, 'hudScore');
    this._hudRow('DISTRICT','—', 94, ls, vs, 'hudDistrict');
    this._hudRow('PHASE',   'Day', 114, ls, { ...vs, color: '#8dff6a' }, 'hudPhase');
    this._hudRow('SEASON',  this.meta.season?.season_name ?? '—', 134, ls, vs, 'hudSeason');

    // ─ District entry banner (centre, hidden) ─
    this.districtBanner = this.add.text(W / 2, 18, '', {
      fontSize: '18px',
      color: '#ffd84d',
      backgroundColor: 'rgba(0,0,0,0.75)',
      padding: { x: 14, y: 8 },
      fontFamily: 'monospace'
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10002).setAlpha(0);

    // ─ Chat panel (bottom-right) ─
    this._createChatPanel(W, H);

    // ─ Controls hint (bottom-left) ─
    this.add.text(10, H - 22, CONTROLS_HINT, {
      fontSize: '10px', color: '#444466', fontFamily: 'monospace'
    }).setScrollFactor(0).setDepth(10001);
  }

  /**
   * Helper to create a label + value pair on the HUD stats panel.
   * Stores the value Text object as this[valueRef].
   */
  _hudRow(label, value, y, labelStyle, valueStyle, valueRef) {
    this.add.text(18, y, `${label.padEnd(8)}`, labelStyle).setScrollFactor(0).setDepth(10001);
    this[valueRef] = this.add.text(100, y, value, valueStyle).setScrollFactor(0).setDepth(10001);
  }

  /** Build the decorative street-chat panel in the bottom-right corner. */
  _createChatPanel(W, H) {
    const PW = 224, PH = 144;
    const px = W - PW - 8, py = H - PH - 8;

    const bg = this.add.graphics().setScrollFactor(0).setDepth(10000);
    bg.fillStyle(0x0b0912, 0.80);
    bg.fillRoundedRect(px, py, PW, PH, 8);
    bg.lineStyle(1, 0xff4fd8, 0.28);
    bg.strokeRoundedRect(px, py, PW, PH, 8);

    this.add.text(px + 10, py + 8, '💬  STREET CHAT', {
      fontSize: '11px', color: '#ff4fd8', fontFamily: 'monospace'
    }).setScrollFactor(0).setDepth(10001);

    const msgs = [
      '> Oracle: Moon Gate is open…',
      '> Runner: Watch the scanners.',
      '> Broker: Green candles inbound.',
      '> System: Season 1 active.',
      '> Warden: Chain Plaza is mine.'
    ];
    msgs.forEach((m, i) => {
      this.add.text(px + 8, py + 26 + i * 22, m, {
        fontSize: '10px', color: '#9999bb', fontFamily: 'monospace',
        wordWrap: { width: PW - 16 }
      }).setScrollFactor(0).setDepth(10001);
    });
  }

  /** Update all HUD value fields from current game state. */
  _refreshHUD() {
    const eco = this.meta.economy;
    this.hudCredits.setText(`${eco.credits}`);
    this.hudMarket.setText(`${this.marketPrice.toFixed(2)}`);
    this.hudScore.setText(`${this.metaScore}`);
    this.hudDistrict.setText(this.currentDistrict === 'none' ? '—' : this.currentDistrict);
    this.hudPhase.setText(this.phase);
    this.hudPhase.setColor(this.phase === 'Day' ? '#8dff6a' : '#5ef2ff');
  }

  // ── Camera & input ────────────────────────────────────────────────────────

  _setupCamera() {
    const worldW = (MAP_COLS + MAP_ROWS) * TILE_W;
    const worldH = (MAP_COLS + MAP_ROWS) * TILE_H + 400;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(1);
    this._followCamera();
  }

  /** Smooth camera follow — centres on the player sprite. */
  _followCamera() {
    if (!this.playerSprite) return;
    this.cameras.main.centerOn(this.playerSprite.x, this.playerSprite.y - 40);
  }

  _setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys    = this.input.keyboard.addKeys('W,A,S,D,SPACE,Q,E');

    // Mouse-wheel zoom
    this.input.on('wheel', (ptr, objs, dx, dy) => {
      const z = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.4, 2.8);
      this.cameras.main.setZoom(z);
    });

    this.input.keyboard.on('keydown-SPACE', () => this._togglePhase());

    // Virtual joystick (touch / coarse pointer devices)
    if (this.meta.isMobile || window.matchMedia('(pointer: coarse)').matches) {
      this._setupVirtualJoystick();
    }

    this._setupPinchZoom();
  }

  /** Draw and wire a virtual joystick in the bottom-left corner for mobile. */
  _setupVirtualJoystick() {
    const H  = this.cameras.main.height;
    const cx = 68, cy = H - 78, radius = 44;

    this.joyBase = this.add.graphics().setScrollFactor(0).setDepth(10003);
    this.joyBase.lineStyle(2, 0x5ef2ff, 0.45);
    this.joyBase.strokeCircle(cx, cy, radius);
    this.joyBase.fillStyle(0x0b0912, 0.3);
    this.joyBase.fillCircle(cx, cy, radius);

    this.joyKnob = this.add.graphics().setScrollFactor(0).setDepth(10004);
    this._drawKnob(cx, cy);

    this._joyCenter = { x: cx, y: cy };

    this.input.on('pointerdown', (ptr) => {
      if (ptr.x < 160 && ptr.y > H - 160) {
        this._joyActive = true;
        this._updateJoystick(ptr);
      }
    });
    this.input.on('pointermove', (ptr) => {
      if (this._joyActive && ptr.isDown) this._updateJoystick(ptr);
    });
    this.input.on('pointerup', () => {
      this._joyActive = false;
      this._joyDir    = { dx: 0, dy: 0 };
      this._drawKnob(this._joyCenter.x, this._joyCenter.y);
    });
  }

  _drawKnob(x, y) {
    this.joyKnob.clear();
    this.joyKnob.fillStyle(0xff4fd8, 0.72);
    this.joyKnob.fillCircle(x, y, 15);
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

  /** Enable two-finger pinch-to-zoom. */
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
      } else {
        lastDist = null;
      }
    });
  }

  // ── Districts ─────────────────────────────────────────────────────────────

  _setupDistricts() {
    this.districtZones = (this.meta.mapData?.districts ?? []).map(d => ({
      id: d.id, name: d.name, region: d.region
    }));
  }

  /** Check whether the player has entered a new district zone. */
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
    this.districtBanner.setText(`📍  ${dz.name}`);
    this.districtBanner.setAlpha(1);
    this.tweens.add({ targets: this.districtBanner, alpha: 0, delay: 2600, duration: 900, ease: 'Power2' });

    updateDistrictControl(dz.id, 1, this.meta.player);
    this._handleZoneInteraction(dz.id);
  }

  /**
   * Apply gameplay effects when the player enters a zone.
   * Night runs earn combo score; Neon Exchange offers day trades.
   * @param {string} zoneId
   */
  _handleZoneInteraction(zoneId) {
    if (this.phase === 'Night') {
      this.combo  += 1;
      this.heat    = Math.min(1, this.heat + 0.02);
      this.metaScore += 10 + this.combo * 2;

      pushBattleEvent(buildGraffitiEvent(this.meta.player, zoneId, this.metaScore));

      const districtControl = this.meta.districts?.districts?.[zoneId] ?? 50;
      const { updatedEconomy, metaScore } = scoreNightRun(
        this.meta.economy, districtControl, this.heat, this.combo
      );
      this.meta.economy = updatedEconomy;
      saveEconomyState(this.meta.economy);
      this.metaScore += metaScore;
    } else if (zoneId === 'neon-exchange') {
      this.meta.economy = buyExposure(this.meta.economy, this.marketPrice, 100);
      saveEconomyState(this.meta.economy);
    }
  }

  // ── Market ────────────────────────────────────────────────────────────────

  _tickMarket() {
    const delta = rollMarketTick(this.meta.season?.market_conditions ?? 'volatile');
    this.marketPrice = Math.max(1, this.marketPrice * (1 + delta));
    this._refreshHUD();
  }

  _togglePhase() {
    this.phase = this.phase === 'Day' ? 'Night' : 'Day';
    this.cameras.main.setBackgroundColor(this.phase === 'Night' ? '#04020c' : '#0b0912');
    if (this.phase === 'Night') this.combo = 0;
    this._refreshHUD();
  }

  // ── Movement loop ─────────────────────────────────────────────────────────

  _handleMovement(time) {
    if (time - this._lastMoveTime < MOVE_THROTTLE_MS) return;

    let dc = 0, dr = 0;

    if (this.cursors.left.isDown  || this.keys.A.isDown)  dc = -1;
    else if (this.cursors.right.isDown || this.keys.D.isDown) dc =  1;

    if (this.cursors.up.isDown    || this.keys.W.isDown)  dr = -1;
    else if (this.cursors.down.isDown  || this.keys.S.isDown)  dr =  1;

    // Virtual joystick override
    if (this._joyActive && (Math.abs(this._joyDir.dx) > JOYSTICK_DEADZONE || Math.abs(this._joyDir.dy) > JOYSTICK_DEADZONE)) {
      dc = Math.round(this._joyDir.dx);
      dr = Math.round(this._joyDir.dy);
    }

    // Keyboard zoom
    if (this.keys.Q?.isDown) this.cameras.main.setZoom(Math.max(0.4, this.cameras.main.zoom - 0.015));
    if (this.keys.E?.isDown) this.cameras.main.setZoom(Math.min(2.8, this.cameras.main.zoom + 0.015));

    if (dc !== 0 || dr !== 0) {
      this._movePlayer(dc, dr);
      this._lastMoveTime = time;
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Convert grid (col, row) to world screen (x, y) including the map origin offset.
   * @param {number} col
   * @param {number} row
   * @returns {{ x: number, y: number }}
   */
  _isoPos(col, row) {
    const iso = cartToIso(col, row);
    return { x: iso.x + this.mapOriginX, y: iso.y + this.mapOriginY };
  }

  /**
   * Depth value for a character standing at the given grid cell.
   * Characters are rendered slightly above their tile.
   * @param {number} row
   * @param {number} col
   * @returns {number}
   */
  _charDepth(row, col) {
    return (row + col) * 10 + 5;
  }
}
