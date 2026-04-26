/**
 * powerup-system.js — powerup constants and helpers for Invaders 3008.
 *
 * Pure game logic. No DOM or canvas access.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const POWERUP_DURATION         = 8;
export const POWERUP_DROP_CHANCE      = 0.10;
export const POWERUP_BOSS_DROP_CHANCE = 0.15;

export const POWERUP_TYPES = ['rapid', 'spread', 'shield', 'multiplier', 'slow'];

export const POWERUP_COLORS = {
  rapid:      '#f7c948',
  spread:     '#2ec5ff',
  shield:     '#3fb950',
  multiplier: '#ff4fd1',
  slow:       '#bc8cff',
};

export const POWERUP_ICONS = {
  rapid:      'R',
  spread:     'S',
  shield:     'SH',
  multiplier: 'x2',
  slow:       'SL',
};

// ── Item factory ──────────────────────────────────────────────────────────────

/**
 * Create a falling powerup item object at (x, y).
 * The caller pushes it into the powerupItems array.
 */
export function makeDroppedPowerup(x, y) {
  const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  return { x, y, vy: 50, type, r: 10 };
}

// ── Activation ────────────────────────────────────────────────────────────────

/**
 * Activate a collected powerup.
 * Mutates activePowerups (Map) and player.shielded in place.
 * @param {string}  type
 * @param {Map}     activePowerups
 * @param {object}  player          player state object ({ shielded })
 * @returns {string}  the display label for the HUD
 */
export function activatePowerup(type, activePowerups, player) {
  if (type === 'shield') {
    player.shielded = true;
    activePowerups.set('shield', { timer: Infinity });
  } else {
    activePowerups.set(type, { timer: POWERUP_DURATION });
  }
  return POWERUP_ICONS[type] || type;
}

// ── Tick ──────────────────────────────────────────────────────────────────────

/**
 * Advance all powerup timers by dt seconds.
 * Mutates activePowerups and player.shielded in place.
 * @returns {boolean} true if any powerup expired (caller may want to update HUD)
 */
export function tickPowerups(activePowerups, player, dt) {
  let changed = false;
  for (const [type, data] of activePowerups) {
    if (data.timer === Infinity) continue;
    data.timer -= dt;
    if (data.timer <= 0) {
      activePowerups.delete(type);
      if (type === 'shield') player.shielded = false;
      changed = true;
    }
  }
  return changed;
}

// ── Score multiplier ──────────────────────────────────────────────────────────

/** Returns 2 if the multiplier powerup is active, 1 otherwise. */
export function getScoreMultiplier(activePowerups) {
  return activePowerups.has('multiplier') ? 2 : 1;
}
