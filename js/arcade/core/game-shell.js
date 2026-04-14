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
 * Required methods that every game lifecycle object must implement.
 * @type {string[]}
 */
const LIFECYCLE_METHODS = ['init', 'start', 'pause', 'resume', 'reset', 'destroy', 'getScore'];

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

  if (!(root instanceof Element)) {
    console.error('[game-shell] root must be a DOM Element');
    return null;
  }

  if (typeof bootstrap !== 'function') {
    console.error('[game-shell] bootstrap must be a function');
    return null;
  }

  var game;
  try {
    game = bootstrap(root);
  } catch (err) {
    console.error('[game-shell] bootstrap threw an error:', err);
    return null;
  }

  if (!game) {
    console.error('[game-shell] bootstrap returned nothing');
    return null;
  }

  // Warn if the returned object is missing any required lifecycle methods.
  var missing = LIFECYCLE_METHODS.filter(function (m) { return typeof game[m] !== 'function'; });
  if (missing.length) {
    console.warn('[game-shell] game object is missing lifecycle methods: ' + missing.join(', '));
  }

  // Draw the initial board so the canvas is not blank before the first click.
  if (typeof game.init === 'function') {
    try {
      await game.init();
    } catch (err) {
      console.error('[game-shell] game.init() threw an error:', err);
    }
  }

  // Call destroy() when the player navigates away so event listeners are cleaned up.
  window.addEventListener('pagehide', function () {
    if (typeof game.destroy === 'function') {
      try {
        game.destroy();
      } catch (e) {
        console.warn('[game-shell] game.destroy() threw during teardown:', e);
      }
    }
  }, { once: true });

  return game;
}
