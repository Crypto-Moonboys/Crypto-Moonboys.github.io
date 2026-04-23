/**
 * game.js — SnakeRun 3008 game module.
 *
 * Wraps the existing bootstrapSnake factory inside a BaseGame subclass so
 * SnakeRun participates in the shared arcade lifecycle without any mechanics
 * being rewritten.  All canvas drawing, scoring, audio, and input handling
 * remain in /js/arcade/games/snake/bootstrap.js unchanged.
 *
 * Lifecycle delegation:
 *   BaseGame.init()    → bootstrapSnake(root) then delegate.init()
 *   BaseGame.start()   → super.start() + delegate.start()
 *   BaseGame.end()     → setScore from delegate then super.end()
 *   pause/resume/reset/destroy → delegate passthrough
 *   getScore()         → delegate.getScore()
 */

import { BaseGame }      from '../core/BaseGame.js';
import { bootstrapSnake } from '/js/arcade/games/snake/bootstrap.js';

export class SnakeRun extends BaseGame {
  constructor() {
    super({ name: 'snake-run' });
    this._delegate = null;
  }

  /**
   * Initialise the game.  Bootstraps the delegate from the supplied root
   * element, then runs the delegate's own init() to wire buttons and start
   * the render loop.
   *
   * game-shell.js calls this once after calling bootstrap(root).
   * Because the root element is needed here we receive it as an argument;
   * game-shell passes no argument to init(), so the root must be captured
   * from the bootstrap call — see the factory export below.
   */
  _bootstrap(root) {
    this._delegate = bootstrapSnake(root);
    return this;
  }

  init() {
    if (this._delegate && typeof this._delegate.init === 'function') {
      return this._delegate.init();
    }
  }

  start() {
    super.start();
    if (this._delegate) this._delegate.start();
  }

  /**
   * Per-frame hook.  The delegate drives its own requestAnimationFrame loop
   * internally, so no external stepping is required here.
   * @param {number} _delta - Unused; provided for interface conformance.
   */
  update(_delta) {}

  end() {
    // Sync the live score from the delegate into BaseGame.score so that
    // super.end() → submitScore() reads the correct value.
    this.setScore(this.getScore());
    super.end();
  }

  pause()   { if (this._delegate) this._delegate.pause();   }
  resume()  { if (this._delegate) this._delegate.resume();  }
  reset()   { if (this._delegate) this._delegate.reset();   }
  destroy() { if (this._delegate) this._delegate.destroy(); }

  getScore() {
    if (this._delegate && typeof this._delegate.getScore === 'function') {
      return this._delegate.getScore();
    }
    return this.score;
  }
}

/**
 * Bootstrap factory for use with mountGame().
 *
 * game-shell.js calls:  game = bootstrapSnakeRun(root)
 * then:                 await game.init()
 *
 * @param {Element} root - The .game-card element.
 * @returns {SnakeRun}
 */
export function bootstrapSnakeRun(root) {
  return new SnakeRun()._bootstrap(root);
}
