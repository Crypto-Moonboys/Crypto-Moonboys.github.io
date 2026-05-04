/**
 * config.js — Breakout Bullrun roguelite game metadata.
 */

export const BREAKOUT_BULLRUN_CONFIG = Object.freeze({
  /** Canonical leaderboard key — must match the GAMES array in leaderboard-worker.js. */
  id: 'breakout',

  /** Display label used by GameRegistry. */
  label: '🧱 Breakout Bullrun',

  /** Cross-game modifier compatibility tags. */
  crossGameTags: Object.freeze(['breakout']),
});
