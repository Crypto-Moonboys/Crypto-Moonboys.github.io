/**
 * director-system.js — Unified director facade for Invaders 3008.
 *
 * Re-exports the scaling director, wave modifiers, surprise events, and boss
 * archetypes from their respective modules and provides a single
 *   spawnBoss(type, wave, W)
 * convenience function as a typed entry-point for boss creation.
 *
 * Pure game logic — no DOM or canvas access.
 */

// ── Director state ────────────────────────────────────────────────────────────

export {
  createScalingDirector,
  tickDirector,
} from './event-system.js';

// ── Wave modifiers ────────────────────────────────────────────────────────────

export {
  // Modifier ID constants
  MODIFIER_NONE,
  MODIFIER_FAST_INVADERS    as MODIFIER_FAST_WAVE,   // spec alias
  MODIFIER_SHIELDED_WAVE,
  MODIFIER_BLACKOUT,
  MODIFIER_BOMBER_SWARM,
  MODIFIER_HUNTER_PATROL    as MODIFIER_HUNTER_WAVE, // spec alias
  MODIFIER_LOW_GRAVITY,
  MODIFIER_REVERSE_DRIFT,
  MODIFIER_ASTEROID_DEBRIS,
  MODIFIER_UNSTABLE_BUNKERS,
  MODIFIER_POWERUP_RAIN,
  MODIFIER_FAKE_SAFE_WAVE,
  // Modifier catalogue + picker
  WAVE_MODIFIER_DEFS,
  pickWaveModifier,
} from './event-system.js';

// ── Surprise events ───────────────────────────────────────────────────────────

export {
  SURPRISE_EVENT_DEFS,
  shouldTriggerSurpriseEvent,
  pickSurpriseEvent,
} from './event-system.js';

// ── Boss archetypes ───────────────────────────────────────────────────────────

export {
  BOSS_ARCHETYPE_DEFS,
  pickBossArchetype,
  spawnBossArchetype,
} from './boss-archetypes.js';

// ── spawnBoss(type, wave, W) — typed convenience wrapper ─────────────────────

import { BOSS_ARCHETYPE_DEFS, pickBossArchetype, spawnBossArchetype } from './boss-archetypes.js';

/**
 * Create a boss of the requested archetype.
 *
 * @param {string|null} type
 *   Archetype id (e.g. 'theWall', 'theSplitter', 'theSniper', 'theSwarmKing',
 *   'theGlitchCore', 'theBomber').  Pass null or omit to let the director pick
 *   automatically based on wave history.
 * @param {number} wave         current wave number
 * @param {number} W            canvas width
 * @param {{ bossHistory?: string[] }} [director]
 *   Scaling director state (used for anti-repeat when type is null).
 * @returns {{ boss, bossEntering, bossWarningSounded }}
 */
export function spawnBoss(type, wave, W, director = {}) {
  let archetype;
  if (type) {
    archetype = BOSS_ARCHETYPE_DEFS.find((a) => a.id === type);
    if (!archetype) {
      console.warn('[director-system] Unknown boss type "%s", falling back to auto-pick.', type);
    }
  }
  if (!archetype) {
    archetype = pickBossArchetype(wave, director);
  }
  const boss = spawnBossArchetype(archetype, wave, W);
  return { boss, bossEntering: true, bossWarningSounded: false };
}

// ── Mutation helpers (re-exported from invader-system) ────────────────────────

export {
  MUTATION_DEFS,
  applyMutations,
} from './invader-system.js';

// ── Anti-repeat helpers (convenience re-export) ───────────────────────────────

/**
 * Return true if a modifier id was used in the most recent `windowSize` waves.
 * Callers can use this to pre-filter custom modifier pools before pickWaveModifier.
 *
 * @param {string}   modifierId
 * @param {{ modifierHistory: string[] }} director
 * @param {number}   [windowSize=3]
 */
export function wasModifierRecent(modifierId, director, windowSize = 3) {
  return (director.modifierHistory || []).slice(-windowSize).includes(modifierId);
}

/**
 * Return true if a boss archetype id was used in the most recent `windowSize` bosses.
 *
 * @param {string}   archetypeId
 * @param {{ bossHistory: string[] }} director
 * @param {number}   [windowSize=2]
 */
export function wasBossRecent(archetypeId, director, windowSize = 2) {
  return (director.bossHistory || []).slice(-windowSize).includes(archetypeId);
}

/**
 * Return true if a surprise event id fired in the most recent `windowSize` events.
 *
 * @param {string}   eventId
 * @param {{ eventHistory: string[] }} director
 * @param {number}   [windowSize=4]
 */
export function wasEventRecent(eventId, director, windowSize = 4) {
  return (director.eventHistory || []).slice(-windowSize).includes(eventId);
}
