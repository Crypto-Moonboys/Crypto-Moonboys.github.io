/**
 * BaseGame.js — Shared base class for the modular arcade system.
 *
 * Every arcade game extends this class and gets a consistent lifecycle:
 *   init → start → update (loop) → end
 *
 * Score submission is wired to the existing ArcadeSync leaderboard hook so
 * all games share the same submission path without duplicating that logic.
 */

export class BaseGame {
  constructor(config = {}) {
    this.name = config.name || 'game';
    this.state = 'idle';
    this.score = 0;
    this.startTime = null;
  }

  /** Called once to set up the game before the player starts. */
  init() {}

  /** Begin a run — transitions state to 'running'. */
  start() {
    this.state = 'running';
    this.startTime = Date.now();
  }

  /**
   * Per-frame update hook.
   * @param {number} delta - Elapsed seconds since last frame.
   */
  update(delta) {}

  /** End the run — transitions state to 'ended' and submits the score. */
  end() {
    this.state = 'ended';
    this.submitScore();
  }

  /**
   * Update the tracked score for the current run.
   * @param {number} score
   */
  setScore(score) {
    this.score = score;
  }

  /**
   * Submit the current score to the leaderboard via the existing ArcadeSync hook.
   * Falls back silently when ArcadeSync is not present (e.g. during local testing).
   */
  submitScore() {
    if (window.ArcadeSync?.submitScore) {
      window.ArcadeSync.submitScore(this.name, this.score);
    }
  }
}
