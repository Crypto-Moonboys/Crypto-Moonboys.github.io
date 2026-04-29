/**
 * config.js — SnakeRun 3008 game metadata and configuration.
 *
 * Centralises all tuneable parameters so bootstrap.js contains only logic.
 */

export var SNAKE_CONFIG = Object.freeze({
  /** Leaderboard / ArcadeSync key. */
  id: 'snake',

  /** Display label used by game-fullscreen.js metadata. */
  label: '🐍 SnakeRun 3008',

  /** Cross-game modifier compatibility tags. */
  crossGameTags: Object.freeze(['snake']),

  /** Number of grid cells along each axis. */
  grid: 24,

  movement: Object.freeze({
    baseStepMs: 135,
    minStepMs: 58,
    comboWindowSec: 2.1,
  }),

  effects: Object.freeze({
    maxParticles: 520,
    maxFloatingTexts: 14,
    turnShake: 2.2,
    collisionShake: 7.5,
  }),

  specialFoods: Object.freeze({
    speed: Object.freeze({ durationSec: 4.2,  weight: 0.10, points: 16 }),
    multiplier: Object.freeze({ durationSec: 6.0, weight: 0.09, points: 20 }),
    ghost: Object.freeze({ durationSec: 4.8, weight: 0.08, points: 18 }),
    chaos: Object.freeze({ durationSec: 3.6, weight: 0.07, points: 22 }),
    normal: Object.freeze({ weight: 0.66, points: 10 }),
  }),
});
