/**
 * BaseGame.js — Shared lifecycle base class for all Moonboys Arcade games.
 *
 * Every game extends this class and overrides the hook methods it needs.
 * The class is intentionally minimal: it tracks the core state machine
 * (idle → running → ended) and provides a consistent score submission hook
 * into the existing ArcadeSync leaderboard system.
 *
 * Lifecycle:
 *   init()   → set up canvas / DOM (called once by game-shell)
 *   start()  → begin gameplay
 *   update() → per-frame tick (games using RAF can leave this a no-op)
 *   end()    → stop gameplay and submit score
 *
 * Usage:
 *   import { BaseGame } from '../core/BaseGame.js';
 *   class MyGame extends BaseGame {
 *     constructor() { super({ name: 'my-game' }); }
 *   }
 */

export class BaseGame {
  constructor(config) {
    const cfg = config || {};
    this.name      = cfg.name || 'game';
    this.state     = 'idle';
    this.score     = 0;
    this.startTime = null;
  }

  /** One-time setup. Override to initialise canvas / DOM state. */
  init() {}

  /** Begin a run. Sets state to 'running' and records start time. */
  start() {
    this.state     = 'running';
    this.startTime = Date.now();
  }

  /**
   * Per-frame update hook.
   * Games that drive their own RAF loop can leave this as a no-op.
   * @param {number} delta - Elapsed seconds since the last frame.
   */
  update(delta) {}

  /** End the current run, then submit the score. */
  end() {
    this.state = 'ended';
    this.submitScore();
  }

  /**
   * Update the tracked score.
   * @param {number} score
   */
  setScore(score) {
    this.score = score;
  }

  /**
   * Submit the current score to the leaderboard via ArcadeSync.
   * Falls back silently when ArcadeSync is not present (e.g. in tests).
   */
  submitScore() {
    if (window.ArcadeSync && typeof window.ArcadeSync.submitScore === 'function') {
      window.ArcadeSync.submitScore(this.name, this.score);
    }
  }
}
