/**
 * invader-system.js — enemy grid, boss, and bunker logic for Invaders 3008.
 *
 * All gameplay constants and factory/builder functions for invaders, the boss,
 * and destructible bunkers. No DOM or canvas access here — pure game logic.
 */

// ── Grid / enemy constants ────────────────────────────────────────────────────

export const ROWS    = 4;
export const COLS    = 10;
export const INV_W   = 36;
export const INV_H   = 28;
export const INV_PAD = 10;

// Wave thresholds
export const WAVE_FAST_ENEMIES = 3;
export const WAVE_BOSS         = 5;
export const WAVE_ZIGZAG       = 7;
export const WAVE_AGGRESSIVE   = 10;

// Invader movement
export const INVADER_SPEED_BASE                      = 54;
export const INVADER_SPEED_PER_WAVE                  = 8;
export const INVADER_SPEED_FAST_BONUS                = 18;
export const INVADER_SPEED_ZIGZAG_BONUS              = 14;
export const INVADER_SPEED_AGGRESSIVE_BONUS          = 16;
export const INVADER_SHOOT_INTERVAL_BASE             = 1.7;
export const INVADER_SHOOT_INTERVAL_PER_WAVE         = 0.1;
export const INVADER_SHOOT_INTERVAL_MIN              = 0.35;
export const INVADER_SHOOT_INTERVAL_AGGRESSIVE_BONUS = 0.22;
export const ERRATIC_MOVEMENT_BASE   = 12;
export const ERRATIC_MOVEMENT_ZIGZAG = 22;
export const MAX_BURST_SIZE     = 5;
export const BURST_WAVE_DIVISOR = 3;
export const DROP_AMT           = 16;
export const ROW_SPEED          = [0.65, 0.9, 1.05, 1.35];
export const ROW_SPEED_FALLBACK = 1;

// Enemy bullets
export const ENEMY_BULLET_SPEED_BASE             = 280;
export const ENEMY_BULLET_SPEED_PER_WAVE         = 14;
export const ENEMY_BULLET_SPEED_AGGRESSIVE_BONUS = 60;

// Boss
export const BOSS_W                      = 80;
export const BOSS_H                      = 44;
export const BOSS_SHOOT_INTERVAL_MIN     = 0.42;
export const BOSS_SHOOT_INTERVAL_MAX     = 0.64;
export const BOSS_SHOOT_INTERVAL_SCALE_MIN = 0.55;
export const BOSS_SHOOT_INTERVAL_PER_WAVE  = 0.025;
export const BOSS_BULLET_SPEED_BASE      = 320;
export const BOSS_BULLET_SPEED_PER_WAVE  = 14;
export const BOSS_SPREAD_NORMAL          = [-8, 8];
export const BOSS_SPREAD_AGGRESSIVE      = [-16, 0, 16];

// Boss phase 3 — 5-way rage spread
export const BOSS_SPREAD_PHASE3 = [-24, -12, 0, 12, 24];

// Misc
export const SHIELD_SPAWN_CHANCE  = 0.15;
export const BOMBER_SPAWN_CHANCE  = 0.12;  // wave >= 6
export const HUNTER_SPAWN_CHANCE  = 0.10;  // wave >= 9

// New enemy type spawn chances
export const ZIGZAG_SPAWN_CHANCE   = 0.12;  // wave >= 5
export const SPLITTER_SPAWN_CHANCE = 0.08;  // wave >= 7
export const HEALER_SPAWN_CHANCE   = 0.06;  // wave >= 8
export const SNIPER_SPAWN_CHANCE   = 0.08;  // wave >= 10
export const KAMIKAZE_SPAWN_CHANCE = 0.07;  // wave >= 6
export const CLOAKED_SPAWN_CHANCE  = 0.06;  // wave >= 11
export const GOLDEN_SPAWN_CHANCE   = 0.02;  // wave >= 4 (rare)

// Bunkers
export const BUNKER_COUNT      = 4;
export const BUNKER_BLOCK_W    = 14;
export const BUNKER_BLOCK_H    = 10;
export const BUNKER_COLS_COUNT = 4;
export const BUNKER_ROWS_COUNT = 3;

// ── Enemy type helpers ────────────────────────────────────────────────────────

/** Row index → behaviour type. Row 0 = top, row 3 = bottom. */
export function rowToType(row) {
  return ['shooter', 'tank', 'fast', 'basic'][row] || 'basic';
}

export function typeToHp(type) {
  if (type === 'tank')     return 2;
  if (type === 'splitter') return 2;
  return 1;
}
export function typeToShieldHp(type) { return type === 'shield' ? 2 : 0; }

// ── Grid builder ─────────────────────────────────────────────────────────────

/**
 * Build a fresh invader grid.
 * @param {number}   wave
 * @param {number}   W       canvas width
 * @param {Function} rand    rand(a, b) helper
 * @returns {{ invaders, invDir, invSpeed, invShootInterval, invShootTimer, invDropping }}
 */
export function buildGrid(wave, W, rand) {
  const invaders = [];
  const totalW   = COLS * (INV_W + INV_PAD) - INV_PAD;
  const offX     = (W - totalW) / 2;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let type = rowToType(r);
      // Golden is rarest — check first
      if (wave >= 4 && type !== 'tank' && Math.random() < GOLDEN_SPAWN_CHANCE) {
        type = 'golden';
      } else if (wave >= 4 && type !== 'tank' && Math.random() < SHIELD_SPAWN_CHANCE) {
        type = 'shield';
      } else if (wave >= 6 && type !== 'tank' && Math.random() < BOMBER_SPAWN_CHANCE) {
        type = 'bomber';
      } else if (wave >= 9 && type !== 'tank' && Math.random() < HUNTER_SPAWN_CHANCE) {
        type = 'hunter';
      } else if (wave >= 5 && type !== 'tank' && Math.random() < ZIGZAG_SPAWN_CHANCE) {
        type = 'zigzag';
      } else if (wave >= 6 && type !== 'tank' && Math.random() < KAMIKAZE_SPAWN_CHANCE) {
        type = 'kamikaze';
      } else if (wave >= 7 && type !== 'tank' && Math.random() < SPLITTER_SPAWN_CHANCE) {
        type = 'splitter';
      } else if (wave >= 8 && type !== 'tank' && Math.random() < HEALER_SPAWN_CHANCE) {
        type = 'healer';
      } else if (wave >= 10 && type !== 'tank' && Math.random() < SNIPER_SPAWN_CHANCE) {
        type = 'sniper';
      } else if (wave >= 11 && type !== 'tank' && Math.random() < CLOAKED_SPAWN_CHANCE) {
        type = 'cloaked';
      }
      const hp       = typeToHp(type);
      const shieldHp = typeToShieldHp(type);
      invaders.push({
        x: offX + c * (INV_W + INV_PAD),
        y: 60  + r * (INV_H + INV_PAD),
        w: INV_W, h: INV_H,
        row: r, type,
        hp, maxHp: hp,
        shieldHp, maxShieldHp: shieldHp,
        alive: true,
        seed: Math.random() * Math.PI * 2 + c * 0.35,
        hitTimer: 0, shieldHitTimer: 0,
        mutations: [],
        healTimer: type === 'healer' ? 3 : 0,
        sniperTimer: type === 'sniper' ? 4 : 0,
        cloakAlpha: 1,
      });
    }
  }

  const invSpeed = INVADER_SPEED_BASE +
    wave * INVADER_SPEED_PER_WAVE +
    (wave >= WAVE_FAST_ENEMIES ? INVADER_SPEED_FAST_BONUS   : 0) +
    (wave >= WAVE_ZIGZAG       ? INVADER_SPEED_ZIGZAG_BONUS : 0) +
    (wave >= WAVE_AGGRESSIVE   ? INVADER_SPEED_AGGRESSIVE_BONUS : 0);

  const invShootInterval = Math.max(
    INVADER_SHOOT_INTERVAL_MIN,
    INVADER_SHOOT_INTERVAL_BASE -
      wave * INVADER_SHOOT_INTERVAL_PER_WAVE -
      (wave >= WAVE_AGGRESSIVE ? INVADER_SHOOT_INTERVAL_AGGRESSIVE_BONUS : 0),
  );

  return {
    invaders,
    invDir:   1,
    invSpeed,
    invShootInterval,
    invShootTimer: rand(invShootInterval * 0.6, invShootInterval * 1.3),
    invDropping: false,
  };
}

// ── Boss phase helper ─────────────────────────────────────────────────────────

/**
 * Returns the current combat phase of the boss (1, 2, or 3) based on HP.
 *   Phase 1 (HP > 66 %): standard fire
 *   Phase 2 (HP 33–66 %): spread fire + speed boost
 *   Phase 3 (HP < 33 %): rage — 5-way spread, max speed, rapid fire
 * @param {{ hp: number, maxHp: number }} boss
 * @returns {1|2|3}
 */
export function getBossPhase(boss) {
  const ratio = boss.hp / boss.maxHp;
  if (ratio > 0.66) return 1;
  if (ratio > 0.33) return 2;
  return 3;
}

// ── Boss builder ──────────────────────────────────────────────────────────────

/**
 * Create a boss object positioned above the canvas.
 * @param {number}   wave
 * @param {number}   W
 * @param {Function} rand
 * @returns {{ boss, invShootTimer, bossEntering, bossWarningSounded }}
 */
export function spawnBoss(wave, W, rand) {
  const boss = {
    x: W / 2 - BOSS_W / 2,
    y: -(BOSS_H + 10),
    w: BOSS_W, h: BOSS_H,
    hp: 8 + wave, maxHp: 8 + wave,
    hpDisplay: 8 + wave,
    dir: 1,
    speed: 92 + wave * 10,
    flashTimer: 0, hitTimer: 0,
  };
  return {
    boss,
    invShootTimer: rand(0.8, 1.4),
    bossEntering: true,
    bossWarningSounded: false,
  };
}

// ── Bunker builder ────────────────────────────────────────────────────────────

/**
 * Build the four destructible bunker arrays.
 * @param {number} W  canvas width
 * @param {number} H  canvas height
 * @returns {Array<Array<{x,y,hp,maxHp}>>}
 */
export function buildBunkers(W, H) {
  const BUNKER_Y  = H - 130;
  const totalBW   = BUNKER_COLS_COUNT * BUNKER_BLOCK_W;
  const spacing   = (W - BUNKER_COUNT * totalBW) / (BUNKER_COUNT + 1);
  const bunkers   = [];
  for (let b = 0; b < BUNKER_COUNT; b++) {
    const bx     = spacing + b * (totalBW + spacing);
    const blocks = [];
    for (let r = 0; r < BUNKER_ROWS_COUNT; r++) {
      for (let c = 0; c < BUNKER_COLS_COUNT; c++) {
        blocks.push({ x: bx + c * BUNKER_BLOCK_W, y: BUNKER_Y + r * BUNKER_BLOCK_H, hp: 4, maxHp: 4 });
      }
    }
    bunkers.push(blocks);
  }
  return bunkers;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/** Score for destroying one invader, factoring wave and streak bonus. */
export function calcInvaderPoints(inv, wave, streak, { STREAK_BONUS_RATE, MAX_STREAK_BONUS }) {
  const base       = (ROWS - inv.row) * 12;
  const streakMult = 1 + Math.min(MAX_STREAK_BONUS, streak * STREAK_BONUS_RATE);
  return Math.round(base * wave * streakMult);
}

// ── Enemy bullet factory ──────────────────────────────────────────────────────

/**
 * Build a single enemy bullet fired from `shooter`.
 * The caller is responsible for pushing the result to the invBullets array.
 */
export function makeEnemyBullet(shooter, wave) {
  const speed = ENEMY_BULLET_SPEED_BASE +
    wave * ENEMY_BULLET_SPEED_PER_WAVE +
    (wave >= WAVE_AGGRESSIVE ? ENEMY_BULLET_SPEED_AGGRESSIVE_BONUS : 0);
  return { x: shooter.x + shooter.w / 2 - 2, y: shooter.y + shooter.h, w: 4, h: 12, vy: speed };
}

// ── Mutation system ───────────────────────────────────────────────────────────

export const MUTATION_DEFS = [
  { id: 'fireTwice',    label: '2x FIRE',     minWave: 10 },
  { id: 'diagonal',     label: 'DIAGONAL',    minWave: 12 },
  { id: 'leavesMines',  label: 'MINES',       minWave: 14 },
  { id: 'bombResist',   label: 'BOMB RESIST', minWave: 16 },
  { id: 'shieldNearby', label: 'SHIELD AURA', minWave: 18 },
  { id: 'teleportOnce', label: 'TELEPORT',    minWave: 20 },
];

/**
 * Apply random mutations to invaders in a grid (call after buildGrid for wave >= 10).
 * Mutates in place.
 */
export function applyMutations(invaders, wave) {
  const available = MUTATION_DEFS.filter(m => wave >= m.minWave);
  if (!available.length) return;
  for (const inv of invaders) {
    if (!inv.mutations) inv.mutations = [];
    const mutChance = Math.min(0.6, (wave - 9) * 0.04);
    for (const mut of available) {
      if (Math.random() < mutChance * 0.4) {
        inv.mutations.push(mut.id);
      }
    }
  }
}
