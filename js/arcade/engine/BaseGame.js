/**
 * BaseGame.js — Shared engine layer for arcade games.
 *
 * Provides:
 *  - requestAnimationFrame loop with capped delta-time (max 50 ms per frame)
 *  - Keyboard state map (this.keys)
 *  - Input listener management with Space / Arrow-key preventDefault
 *  - start / stop lifecycle helpers
 *
 * Usage:
 *   import { BaseGame } from '/js/arcade/engine/BaseGame.js';
 *
 *   const engine = new BaseGame();
 *   engine.onTick    = (dt) => { update(dt); draw(); };
 *   engine.onKeyDown = (e)  => { /* game-specific key actions *\/ };
 *   engine.attachInput();
 *   engine.startLoop();
 *   // later:
 *   engine.destroy();
 */

/** Maximum delta-time per frame (seconds).  Caps spikes from tab re-focus. */
const MAX_DT = 0.05;

export class BaseGame {
  constructor() {
    /** Keys currently held down — key name → true. */
    this.keys = {};

    this._raf       = null;
    this._lastTime  = 0;
    this._tickBound = this._tick.bind(this);

    // Store bound refs so removeEventListener matches correctly.
    this._boundKeyDown = this._handleKeyDown.bind(this);
    this._boundKeyUp   = this._handleKeyUp.bind(this);
  }

  // ── Overridable hooks ──────────────────────────────────────────────────

  /**
   * Called every animation frame with a capped delta-time in seconds.
   * Override to run update + draw.
   * @param {number} dt  Elapsed seconds since last frame (≤ MAX_DT).
   */
  onTick(dt) {} // eslint-disable-line no-unused-vars

  /**
   * Called on every keydown event after the keys map is updated and
   * browser-default actions for Space / Arrow keys are suppressed.
   * Override for game-specific key actions (e.g. shooting on Space).
   * @param {KeyboardEvent} e
   */
  onKeyDown(e) {} // eslint-disable-line no-unused-vars

  // ── Loop ──────────────────────────────────────────────────────────────

  /** Start (or restart) the rAF loop. */
  startLoop() {
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._lastTime = performance.now();
    this._raf = requestAnimationFrame(this._tickBound);
  }

  /** Cancel the rAF loop without touching input listeners. */
  stopLoop() {
    if (this._raf !== null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────

  /** Attach keyboard listeners to document. */
  attachInput() {
    document.addEventListener('keydown', this._boundKeyDown);
    document.addEventListener('keyup',   this._boundKeyUp);
  }

  /** Remove keyboard listeners from document. */
  detachInput() {
    document.removeEventListener('keydown', this._boundKeyDown);
    document.removeEventListener('keyup',   this._boundKeyUp);
  }

  // ── Full teardown ─────────────────────────────────────────────────────

  /** Stop loop and remove input listeners. */
  destroy() {
    this.stopLoop();
    this.detachInput();
  }

  // ── Private ───────────────────────────────────────────────────────────

  _tick(ts) {
    const dt = Math.min((ts - this._lastTime) / 1000, MAX_DT);
    this._lastTime = ts;
    this.onTick(dt);
    this._raf = requestAnimationFrame(this._tickBound);
  }

  _handleKeyDown(e) {
    this.keys[e.key] = true;
    // Prevent Space from scrolling the page on game screens.
    if (e.key === ' ') e.preventDefault();
    // Prevent arrow-key page scrolling while the game is focused.
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'ArrowUp'   || e.key === 'ArrowDown') {
      e.preventDefault();
    }
    this.onKeyDown(e);
  }

  _handleKeyUp(e) {
    this.keys[e.key] = false;
  }
}
