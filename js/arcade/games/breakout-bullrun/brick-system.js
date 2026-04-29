/**
 * brick-system.js — Breakout Bullrun brick types, generation, and mutation.
 *
 * Brick types:
 *   normal   — 1 hit, standard reward
 *   heavy    — 2–4 hits, higher reward
 *   explosive — 1 hit, explodes damaging nearby bricks
 *   shielded — deflects ball once then becomes normal
 *   moving   — drifts horizontally or bounces
 *   spawner  — periodically spawns a new normal brick nearby
 *   golden   — 1 hit, high reward, rare
 *   cursed   — 1 hit, activates a hazard on break
 *
 * Pure game logic — no DOM/canvas access.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const B_W   = 52;
export const B_H   = 20;
export const B_PAD = 5;
export const B_COLS = 10;
export const B_ROWS_MAX = 7;
export const B_OFF_X_BASE = 14; // left margin; bootstrap computes exact centre

// ── Brick type colour palette ─────────────────────────────────────────────────

export const BRICK_COLORS = {
  normal:    '#2ec5ff',
  heavy:     '#bc8cff',
  explosive: '#ff6b2b',
  shielded:  '#3fb950',
  moving:    '#f7c948',
  spawner:   '#ff9b9b',
  golden:    '#ffd700',
  cursed:    '#cc00ff',
};

export const BRICK_GLOW = {
  normal:    'rgba(46,197,255,0.35)',
  heavy:     'rgba(188,140,255,0.4)',
  explosive: 'rgba(255,107,43,0.5)',
  shielded:  'rgba(63,185,80,0.45)',
  moving:    'rgba(247,201,72,0.4)',
  spawner:   'rgba(255,155,155,0.4)',
  golden:    'rgba(255,215,0,0.55)',
  cursed:    'rgba(204,0,255,0.5)',
};

// Score value per hit
const BRICK_SCORE = {
  normal:    10,
  heavy:     20,
  explosive: 15,
  shielded:  25,
  moving:    30,
  spawner:   35,
  golden:    80,
  cursed:    12,
};

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Make a single brick object.
 * @param {number} col
 * @param {number} row
 * @param {string} type  one of the BRICK_COLORS keys
 * @param {number} offX  pixel offset x of the grid
 * @param {number} offY  pixel offset y of the grid
 * @param {number} wave  current wave (affects heavy hp)
 */
export function makeBrick(col, row, type, offX, offY, wave) {
  const x   = offX + col * (B_W + B_PAD);
  const y   = offY + row * (B_H + B_PAD);
  const hp  = computeHp(type, wave);

  return {
    x, y,
    w: B_W, h: B_H,
    col, row,
    type,
    hp,
    maxHp: hp,
    alive: true,
    // Moving brick velocity
    vx: type === 'moving' ? (Math.random() < 0.5 ? 1 : -1) * (40 + Math.random() * 30) : 0,
    vy: 0,
    // Spawner timer
    spawnTimer: type === 'spawner' ? 6 + Math.random() * 4 : 0,
    // Shield deflect remaining (shielded type gets 1 deflect; shield dissolves afterward)
    shieldHp: type === 'shielded' ? 1 : 0,
    // Hit flash timer
    hitTimer: 0,
    // Score value
    score: BRICK_SCORE[type] || 10,
  };
}

function computeHp(type, wave) {
  switch (type) {
    case 'heavy':    return 2 + Math.floor(wave / 5);
    case 'shielded': return 1;
    case 'golden':   return 1;
    default:         return 1;
  }
}

// ── Wave generation ───────────────────────────────────────────────────────────

/**
 * Generate the brick grid for a wave.
 *
 * @param {number}  wave      1-based wave index
 * @param {number}  W         canvas width (pixels)
 * @param {number}  offY      top pixel offset for bricks
 * @param {object}  upgrades  run upgrades (unused here; reserved for future)
 * @param {object}  director  scaling director state (influences density/types)
 * @returns {object[]}  array of brick objects
 */
export function buildWaveBricks(wave, W, offY, upgrades, director) {
  const density = getDensity(wave, director);
  const rows    = Math.min(B_ROWS_MAX, 3 + Math.floor(wave / 3));
  const totalW  = B_COLS * (B_W + B_PAD) - B_PAD;
  const offX    = Math.floor((W - totalW) / 2);

  const bricks = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < B_COLS; col++) {
      if (Math.random() > density) continue;
      const type = pickBrickType(wave, row, director);
      bricks.push(makeBrick(col, row, type, offX, offY, wave));
    }
  }

  // Guarantee at least 6 bricks so the wave can be completed
  if (bricks.length < 6) {
    for (let i = bricks.length; i < 8; i++) {
      const col = i % B_COLS;
      const row = Math.floor(i / B_COLS) % rows;
      bricks.push(makeBrick(col, row, 'normal', offX, offY, wave));
    }
  }

  return bricks;
}

function getDensity(wave, director) {
  const base   = 0.55 + Math.min(0.35, wave * 0.03);
  const dBonus = director ? Math.min(0.1, (director.pressure || 0) * 0.0005) : 0;
  return Math.min(0.98, base + dBonus);
}

/**
 * Pick a brick type weighted by wave progression.
 */
function pickBrickType(wave, row, director) {
  const r = Math.random();

  // Golden bricks — rare treat, more common on later waves
  if (r < Math.min(0.06, 0.01 + wave * 0.004))   return 'golden';
  // Cursed bricks — increase with pressure
  if (r < 0.06 + Math.min(0.08, wave * 0.005))   return 'cursed';
  // Explosive bricks — front rows
  if (wave >= 2 && row >= 1 && r < 0.12)         return 'explosive';
  // Shielded bricks
  if (wave >= 3 && r < 0.16)                     return 'shielded';
  // Moving bricks — appear from wave 4
  if (wave >= 4 && r < 0.20)                     return 'moving';
  // Spawner bricks — wave 7+
  if (wave >= 7 && r < 0.22)                     return 'spawner';
  // Heavy bricks — back rows, wave 2+
  if (wave >= 2 && row === 0 && r < 0.40)        return 'heavy';

  return 'normal';
}

// ── Tick ──────────────────────────────────────────────────────────────────────

/**
 * Tick living bricks (moving bricks, spawner timers, hit timers).
 * Returns an array of newly spawned bricks (from spawner type).
 *
 * @param {object[]} bricks  mutable brick array
 * @param {number}   dt      delta time seconds
 * @param {number}   W       canvas width (for boundary bounce)
 * @param {number}   wave    current wave
 * @returns {object[]}       newly spawned bricks
 */
export function tickBricks(bricks, dt, W, wave) {
  const spawned = [];
  const totalW  = B_COLS * (B_W + B_PAD) - B_PAD;
  const offX    = Math.floor((W - totalW) / 2);

  for (const b of bricks) {
    if (!b.alive) continue;
    if (b.hitTimer > 0) b.hitTimer -= dt;

    if (b.type === 'moving' && b.vx !== 0) {
      b.x += b.vx * dt;
      // Bounce at the grid edges
      if (b.x <= offX)                  { b.x = offX;                  b.vx = Math.abs(b.vx); }
      if (b.x + b.w >= offX + totalW)   { b.x = offX + totalW - b.w;  b.vx = -Math.abs(b.vx); }
    }

    if (b.type === 'spawner') {
      b.spawnTimer -= dt;
      if (b.spawnTimer <= 0) {
        b.spawnTimer = 6 + Math.random() * 4;
        // Spawn a normal brick adjacent if space available
        const nx = b.x + (Math.random() < 0.5 ? -(B_W + B_PAD) : (B_W + B_PAD));
        const ny = b.y + (Math.random() < 0.5 ? -(B_H + B_PAD) : 0);
        if (nx >= offX && nx + B_W <= offX + totalW && ny > 20) {
          spawned.push({
            x: nx, y: ny, w: B_W, h: B_H,
            col: -1, row: -1,
            type: 'normal',
            hp: 1, maxHp: 1,
            alive: true,
            vx: 0, vy: 0, spawnTimer: 0, shieldHp: 0,
            hitTimer: 0, score: 10,
          });
        }
      }
    }
  }

  return spawned;
}

// ── Mutation ──────────────────────────────────────────────────────────────────

/**
 * Apply wave mutations to living bricks (wave >= 10).
 * Maps to the global mutation system's "bricks" mutation concepts.
 *
 * @param {object[]} bricks  mutable brick array
 * @param {number}   wave    current wave
 */
export function applyBrickMutations(bricks, wave) {
  if (wave < 10) return;
  const living = bricks.filter((b) => b.alive);

  for (const b of living) {
    const r = Math.random();
    // Bricks split — on next hit a brick spawns two weak bricks
    if (wave >= 10 && r < 0.12) {
      b.mutSplit = true;
    }
    // Bricks gain shield
    if (wave >= 12 && r < 0.08 && b.shieldHp === 0 && b.type !== 'shielded') {
      b.shieldHp = 1;
    }
    // Bricks gain movement
    if (wave >= 15 && r < 0.06 && b.type === 'normal' && b.vx === 0) {
      b.type  = 'moving';
      b.vx    = (Math.random() < 0.5 ? 1 : -1) * (35 + Math.random() * 25);
      b.score = BRICK_SCORE['moving'];
    }
    // Bricks become explosive
    if (wave >= 18 && r < 0.05 && b.type === 'normal') {
      b.type  = 'explosive';
      b.score = BRICK_SCORE['explosive'];
    }
  }
}

// ── Hit handling ──────────────────────────────────────────────────────────────

/**
 * Handle a ball hitting a brick.
 *
 * @param {object}   brick
 * @param {object}   ball         mutable ball (explosive ball may pass through)
 * @param {object}   upgrades     run upgrades
 * @param {Function} spawnParticle  (x,y,color,count)
 * @param {Function} addScore       (points,x,y,color)
 * @param {Function} screenShake    (intensity,duration)
 * @param {Function} addBanner      (text,color)
 * @param {object[]} allBricks      ref for explosive splash
 * @param {number}   combo          current combo multiplier
 * @returns {{ destroyed: boolean, reflected: boolean }}
 *    destroyed = brick is now dead (score was added)
 *    reflected = ball should reverse direction
 */
export function hitBrick(brick, ball, upgrades, spawnParticle, addScore, screenShake, addBanner, allBricks, combo) {
  if (!brick.alive) return { destroyed: false, reflected: false };

  const isPiercing  = upgrades && upgrades.piercing  > 0;
  const isExplosive = upgrades && upgrades.explosive > 0;

  // Shielded brick: deflect ball, remove shield
  if (brick.shieldHp > 0) {
    brick.shieldHp--;
    brick.hitTimer = 0.15;
    spawnParticle(brick.x + brick.w / 2, brick.y + brick.h / 2, '#2ec5ff', 5);
    return { destroyed: false, reflected: !isPiercing };
  }

  // Normal damage
  brick.hp--;
  brick.hitTimer = 0.12;
  spawnParticle(brick.x + brick.w / 2, brick.y + brick.h / 2, BRICK_COLORS[brick.type] || '#fff', 6);

  if (brick.hp <= 0) {
    brick.alive = false;
    const pts = brick.score * combo;
    addScore(pts, brick.x + brick.w / 2, brick.y, BRICK_COLORS[brick.type] || '#f7c948');

    // Explosive type: chain-damage nearby bricks
    if (brick.type === 'explosive' || isExplosive) {
      screenShake(4, 0.18);
      spawnParticle(brick.x + brick.w / 2, brick.y + brick.h / 2, '#ff6b2b', 14);
      for (const other of allBricks) {
        if (!other.alive || other === brick) continue;
        const dx = Math.abs((other.x + other.w / 2) - (brick.x + brick.w / 2));
        const dy = Math.abs((other.y + other.h / 2) - (brick.y + brick.h / 2));
        if (dx < (B_W + B_PAD) * 1.6 && dy < (B_H + B_PAD) * 1.6) {
          other.hp--;
          other.hitTimer = 0.2;
          if (other.hp <= 0) {
            other.alive = false;
            addScore(other.score * combo, other.x + other.w / 2, other.y, '#ff6b2b');
          }
        }
      }
    }

    // Cursed type: show warning
    if (brick.type === 'cursed') {
      addBanner('⚠ CURSED BRICK!', '#cc00ff');
    }

    return { destroyed: true, reflected: !isPiercing };
  }

  return { destroyed: false, reflected: !isPiercing };
}
