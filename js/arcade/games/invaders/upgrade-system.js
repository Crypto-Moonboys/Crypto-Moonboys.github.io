/**
 * upgrade-system.js — permanent run upgrades for Invaders 3008.
 *
 * Upgrades are chosen on the between-wave screen and persist for the whole run.
 * They stack with each other and with the existing temporary powerup drops.
 * Pure game logic — no DOM or canvas access.
 */

// ── Upgrade catalogue ─────────────────────────────────────────────────────────

export const UPGRADE_DEFS = [
  { id: 'fireRate',   label: 'FIRE RATE',   icon: '⚡', desc: 'Shoot 25% faster',           maxLevel: 4 },
  { id: 'spreadShot', label: 'SPREAD',      icon: '↔',  desc: '+1 bullet angle per level',  maxLevel: 3 },
  { id: 'shieldStr',  label: 'SHIELD',      icon: '🛡', desc: 'Shield blocks +1 extra hit',  maxLevel: 2 },
  { id: 'bulletDmg',  label: 'DAMAGE',      icon: '💥', desc: 'Bullets deal +1 HP damage',  maxLevel: 3 },
  { id: 'scoreBoost', label: 'SCORE BOOST', icon: '✨', desc: '+30% score per kill',         maxLevel: 4 },
  { id: 'drone',      label: 'DRONE',       icon: '🤖', desc: 'Orbiting drone auto-fires',   maxLevel: 1 },
  { id: 'bombShot',   label: 'BOMB SHOT',   icon: '💣', desc: '[B] Area-damage bomb shot',   maxLevel: 1 },
];

export const UPGRADE_COLORS = {
  fireRate:   '#f7c948',
  spreadShot: '#2ec5ff',
  shieldStr:  '#3fb950',
  bulletDmg:  '#ff4fd1',
  scoreBoost: '#bc8cff',
  drone:      '#ff9b9b',
  bombShot:   '#ff6b2b',
};

// ── Factory ───────────────────────────────────────────────────────────────────

/** Build a fresh upgrades state object (all levels zeroed). */
export function makeUpgrades() {
  const u = {};
  for (const d of UPGRADE_DEFS) u[d.id] = 0;
  return u;
}

// ── Selection helpers ─────────────────────────────────────────────────────────

/**
 * Pick 3 distinct upgrade choices.
 * Prefers upgrades that are not yet maxed; falls back to all if needed.
 * Uses a Fisher-Yates shuffle for uniform randomness.
 */
export function pickUpgradeChoices(upgrades) {
  const available = UPGRADE_DEFS.filter((d) => upgrades[d.id] < d.maxLevel);
  const pool = available.length >= 3 ? available.slice() : UPGRADE_DEFS.slice();
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  return pool.slice(0, 3);
}

/**
 * Apply one step of an upgrade (capped at maxLevel).
 * @param {string} id      upgrade id
 * @param {object} upgrades mutable upgrades state
 * @returns {boolean}  true if the upgrade was actually incremented
 */
export function applyUpgrade(id, upgrades) {
  const def = UPGRADE_DEFS.find((d) => d.id === id);
  if (!def) return false;
  if (upgrades[id] >= def.maxLevel) return false;
  upgrades[id] = (upgrades[id] || 0) + 1;
  return true;
}

// ── Computed stats ────────────────────────────────────────────────────────────

/**
 * Effective shoot cooldown after fire-rate upgrades.
 * Each level reduces the base rate by 25 %.
 */
export function getUpgradedShootRate(baseRate, upgrades) {
  return baseRate * Math.pow(0.75, upgrades.fireRate || 0);
}

/** Bullet damage (HP removed per hit). Level 0 = 1 damage. */
export function getUpgradedBulletDmg(upgrades) {
  return 1 + (upgrades.bulletDmg || 0);
}

/**
 * Persistent score multiplier from upgrades.
 * Stacks multiplicatively with the temporary ×2 powerup drop.
 */
export function getUpgradedScoreMult(upgrades) {
  return 1 + (upgrades.scoreBoost || 0) * 0.3;
}

/**
 * Bullet spread angles in radians based on upgrade level + powerup.
 * Level 0 = single shot, 1 = 3-way, 2 = 5-way, 3+ = 7-way.
 */
export function getSpreadAngles(upgrades, hasPowerup) {
  const level = (upgrades.spreadShot || 0) + (hasPowerup ? 1 : 0);
  if (level <= 0) return [0];
  if (level === 1) return [-Math.PI / 12, 0, Math.PI / 12];
  if (level === 2) return [-Math.PI / 7, -Math.PI / 14, 0, Math.PI / 14, Math.PI / 7];
  return [-Math.PI / 5, -Math.PI / 10, 0, Math.PI / 10, Math.PI / 5];
}

/**
 * Number of extra hits a shield absorbs before breaking.
 * Base shield = 1 hit. Each shield-str level adds 1 more.
 */
export function getShieldStrength(upgrades) {
  return 1 + (upgrades.shieldStr || 0);
}

/**
 * Return a flat snapshot of all derived stats for the current upgrades state.
 * Useful for rendering upgrade summaries and for passing a clean read-only
 * view to any subsystem that just needs the computed numbers.
 *
 * @param {object} upgrades  mutable upgrades object from makeUpgrades()
 * @param {number} baseShootRate  base shoot cooldown in seconds (default 0.2)
 * @returns {{
 *   fireRateLevel: number,
 *   spreadLevel:   number,
 *   shieldStrength: number,
 *   bulletDmg:     number,
 *   scoreMult:     number,
 *   hasDrone:      boolean,
 *   hasBombShot:   boolean,
 *   shootRate:     number,
 * }}
 */
export function getUpgradeStats(upgrades, baseShootRate) {
  const base = typeof baseShootRate === 'number' ? baseShootRate : 0.2;
  return {
    fireRateLevel:  upgrades.fireRate   || 0,
    spreadLevel:    upgrades.spreadShot || 0,
    shieldStrength: getShieldStrength(upgrades),
    bulletDmg:      getUpgradedBulletDmg(upgrades),
    scoreMult:      getUpgradedScoreMult(upgrades),
    hasDrone:       (upgrades.drone     || 0) > 0,
    hasBombShot:    (upgrades.bombShot  || 0) > 0,
    shootRate:      getUpgradedShootRate(base, upgrades),
  };
}
