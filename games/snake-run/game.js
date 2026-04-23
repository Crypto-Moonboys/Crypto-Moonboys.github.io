/**
 * game.js — SnakeRun 3008 entry point for the modular arcade system.
 *
 * Extends BaseGame and mounts the existing bootstrapSnake lifecycle so that
 * all game mechanics, scoring, and visuals are preserved exactly as-is.
 * The snake engine manages its own rAF loop internally; this class provides
 * the standard BaseGame interface on top of it.
 */

import { BaseGame }      from '../core/BaseGame.js';
import { mountGame }     from '/js/arcade/core/game-shell.js';
import { bootstrapSnake } from '/js/arcade/games/snake/bootstrap.js';

export class SnakeRun extends BaseGame {
  constructor() {
    super({ name: 'snake-run' });
    this._lifecycle = null;
  }

  /**
   * Per-frame update hook.
   * SnakeRun delegates all frame logic to the bootstrapSnake rAF loop,
   * so this method is intentionally a no-op at the BaseGame level.
   * @param {number} delta - Elapsed seconds since last frame.
   */
  update(delta) {}

  /**
   * Mount the game onto the page.
   * Delegates to mountGame + bootstrapSnake so all existing behaviour is preserved.
   * @param {Element} root - The .game-card container element.
   * @returns {Promise<object>} Resolves to the snake lifecycle object.
   */
  async mount(root) {
    this._lifecycle = await mountGame({
      root,
      bootstrap: bootstrapSnake,
    });
    return this._lifecycle;
  }
}

// Auto-mount when this module is executed (script is at end of <body>).
const _root = document.querySelector('.game-card');
if (_root) {
  const game = new SnakeRun();
  game.mount(_root);
} else {
  console.error('[SnakeRun] .game-card element not found — game not mounted.');
}
