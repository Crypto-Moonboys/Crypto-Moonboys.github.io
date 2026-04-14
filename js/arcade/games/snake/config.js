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

  /** Number of grid cells along each axis. */
  grid: 24,

  /**
   * Speed tiers: evaluated highest-first; first match whose minScore
   * is ≤ current score wins.  Sorted descending by minScore.
   */
  speedTiers: Object.freeze([
    { minScore: 350, ms: 75,  label: 'Ludicrous' },
    { minScore: 200, ms: 90,  label: 'Turbo'     },
    { minScore: 100, ms: 100, label: 'Faster'    },
    { minScore: 50,  ms: 110, label: 'Fast'      },
    { minScore: 0,   ms: 120, label: 'Normal'    },
  ]),
});
