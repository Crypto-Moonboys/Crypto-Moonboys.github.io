/**
 * config.js — Bullrun Brick Smash roguelite game metadata.
 */

export const BREAKOUT_BULLRUN_CONFIG = Object.freeze({
  /** Canonical leaderboard key — must match the GAMES array in leaderboard-worker.js. */
  id: 'bullrun-brick-smash',

  /** Display label used by GameRegistry. */
  label: '🧱 Bullrun Brick Smash',

  /** Cross-game modifier compatibility tags. */
  crossGameTags: Object.freeze(['breakout']),
});
