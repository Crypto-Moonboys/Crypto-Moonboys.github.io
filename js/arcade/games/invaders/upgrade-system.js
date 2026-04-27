/**
 * upgrade-system.js — permanent run upgrades for Invaders 3008.
 *
 * Upgrades are chosen on the between-wave screen and persist for the whole run.
 * They stack with each other and with the existing temporary powerup drops.
 * Pure game logic — no DOM or canvas access.
 */

// ── Upgrade catalogue ─────────────────────────────────────────────────────────

export const UPGRADE_DEFS = [
  { id: 'fireRate',   label: 'FIRE RATE',   icon: '⚡', desc: 'Shoot 25% faster',           maxLevel: 4, rarity: 'common' },
  { id: 'spreadShot', label: 'SPREAD',      icon: '↔',  desc: '+1 bullet angle per level',  maxLevel: 3, rarity: 'common' },
  { id: 'shieldStr',  label: 'SHIELD',      icon: '🛡', desc: 'Shield blocks +1 extra hit',  maxLevel: 2, rarity: 'common' },
  { id: 'bulletDmg',  label: 'DAMAGE',      icon: '💥', desc: 'Bullets deal +1 HP damage',  maxLevel: 3, rarity: 'common' },
  { id: 'scoreBoost', label: 'SCORE BOOST', icon: '✨', desc: '+30% score per kill',         maxLevel: 4, rarity: 'common' },
  { id: 'drone',      label: 'DRONE',       icon: '🤖', desc: 'Orbiting drone auto-fires',   maxLevel: 1, rarity: 'common' },
  { id: 'bombShot',   label: 'BOMB SHOT',   icon: '💣', desc: '[B] Area-damage bomb shot',   maxLevel: 1, rarity: 'common' },
  { id: 'doubleDrone',     label: 'TWIN DRONE',     icon: '🤖🤖', desc: '2nd drone companion',        maxLevel: 1, rarity: 'rare'      },
  { id: 'piercing',        label: 'PIERCING',        icon: '⬆',   desc: 'Bullets pierce one enemy',   maxLevel: 1, rarity: 'rare'      },
  { id: 'chainLightning',  label: 'CHAIN LIGHTNING', icon: '⚡⚡',  desc: 'Hits chain to 2 nearby',    maxLevel: 1, rarity: 'epic'      },
  { id: 'explosiveRounds', label: 'EXPLOSIVE',       icon: '💥',   desc: 'Small explosion on hit',     maxLevel: 1, rarity: 'epic'      },
  { id: 'shieldRegen',     label: 'SHIELD REGEN',    icon: '🛡',   desc: 'Shield auto-regens 15s',     maxLevel: 1, rarity: 'rare'      },
  { id: 'autoBomb',        label: 'AUTO BOMB',       icon: '💣',   desc: 'Bomb auto-recharges faster', maxLevel: 1, rarity: 'rare'      },
  { id: 'slowDodge',       label: 'SLOW DODGE',      icon: '⏱',   desc: 'Double-tap slows time 1.5s', maxLevel: 1, rarity: 'epic'      },
  { id: 'magnetPowerups',  label: 'MAGNET',          icon: '🧲',   desc: 'Powerups attracted to ship', maxLevel: 1, rarity: 'common'    },
  { id: 'bossDmg',         label: 'BOSS SLAYER',     icon: '🎯',   desc: '+50% damage to bosses',      maxLevel: 2, rarity: 'rare'      },
  { id: 'revive',          label: 'REVIVE',          icon: '❤️',   desc: 'Auto-revive once per run',   maxLevel: 1, rarity: 'legendary' },
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

// ── Rarity ────────────────────────────────────────────────────────────────────

export const RARITY_COLORS = {
  common:    '#8b949e',
  rare:      '#2ec5ff',
  epic:      '#bc8cff',
  legendary: '#f7c948',
};

// ── Risk/reward choices ───────────────────────────────────────────────────────

export const RISK_REWARD_DEFS = [
  { id: 'doubleEnemies', label: 'DOUBLE ENEMIES', desc: '2x enemy density → 2x score this wave', risk: 'medium' },
  { id: 'noShield',      label: 'NO SHIELD',      desc: 'No shield next wave → guaranteed rare',  risk: 'medium' },
  { id: 'earlyBoss',     label: 'EARLY BOSS',     desc: 'Boss appears now → epic reward',         risk: 'high'   },
  { id: 'blackoutWave',  label: 'BLACKOUT',       desc: 'Next wave is blackout → rare reward',    risk: 'medium' },
  { id: 'oneLife',       label: 'ONE LIFE',       desc: 'One life only → triple score next wave', risk: 'high'   },
  { id: 'skipWave',      label: 'SKIP WAVE',      desc: 'Skip wave → no reward but stay safe',    risk: 'none'   },
];

/** Returns true if a risk/reward screen should be offered this wave. */
export function shouldOfferRiskReward(wave) {
  return wave > 0 && wave % 5 === 0;
}

/** Pick 2 random risk/reward choices. */
export function pickRiskRewardChoices() {
  const pool = RISK_REWARD_DEFS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 2);
}

/**
 * Pick 3 upgrade choices respecting rarity thresholds.
 * wave < 5: common only; 5-10: +rare; 11-20: +epic; 21+: +legendary
 */
export function pickUpgradeChoicesWithRarity(upgrades, wave) {
  const w = wave || 1;
  const rarities = w >= 21 ? ['common', 'rare', 'epic', 'legendary']
                 : w >= 11 ? ['common', 'rare', 'epic']
                 : w >= 5  ? ['common', 'rare']
                 :            ['common'];
  let available = UPGRADE_DEFS.filter(
    d => upgrades[d.id] < d.maxLevel && rarities.includes(d.rarity || 'common'),
  );
  let pool = available.length >= 3 ? available.slice()
           : UPGRADE_DEFS.filter(d => upgrades[d.id] < d.maxLevel);
  if (pool.length < 3) pool = pool.concat(UPGRADE_DEFS);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}
