/**
 * game-shell.js — Arcade Game Shell
 *
 * Mounts a game module onto the page and manages its standardised lifecycle.
 * Integrates with the existing leaderboard, identity, and fullscreen systems.
 *
 * Each bootstrap function must return an object conforming to:
 *   { init(), start(), pause(), resume(), reset(), destroy(), getScore() }
 *
 * Usage:
 *   import { mountGame } from '/js/arcade/core/game-shell.js';
 *   import { bootstrapSnake } from '/js/arcade/games/snake/bootstrap.js';
 *   mountGame({ root: document.querySelector('.game-card'), bootstrap: bootstrapSnake });
 *
 * Notes:
 * - game-fullscreen.js is loaded as a classic script before this module runs.
 *   It wires up startBtn / .game-card from the static HTML, so those elements
 *   must remain in the page markup.  The shell does not duplicate that wiring.
 * - The shell calls game.init() after bootstrapping so the initial canvas state
 *   is drawn before the user clicks Start (matching previous inline behaviour).
 */

/**
 * Mount a game onto the page.
 *
 * @param {object}   options
 * @param {Element}  options.root      - Anchor element for the game (e.g. .game-card).
 * @param {Function} options.bootstrap - Factory: (root) → lifecycle object.
 * @returns {Promise<object>}          - Resolves to the game lifecycle object.
 */
export async function mountGame(options) {
  var root      = options.root;
  var bootstrap = options.bootstrap;

  if (typeof bootstrap !== 'function') {
    console.error('[game-shell] bootstrap must be a function');
    return null;
  }

  var game = bootstrap(root);

  if (!game) {
    console.error('[game-shell] bootstrap returned nothing');
    return null;
  }

  // Draw the initial board so the canvas is not blank before the first click.
  if (typeof game.init === 'function') {
    await game.init();
  }

  return game;
}
