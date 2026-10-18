import { bootstrapFromAdapter } from '/js/arcade/engine/game-adapter.js';
import { mountArcadeRadio } from '/js/arcade/core/radio.js?v=meme-mobile-20261014';
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

function ensurePlayerActionSync() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.MOONBOYS_ACTION_SYNC) {
    return Promise.resolve();
  }
  if (window.__MOONBOYS_ARCADE_ACTION_SYNC_LOADING__) return window.__MOONBOYS_ARCADE_ACTION_SYNC_LOADING__;
  const existing = document.querySelector('script[data-player-action-sync]');
  if (existing) {
    window.__MOONBOYS_ARCADE_ACTION_SYNC_LOADING__ = new Promise(resolve => {
      if (window.MOONBOYS_ACTION_SYNC) return resolve();
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', resolve, { once: true });
      window.setTimeout(resolve, 2500);
    });
    return window.__MOONBOYS_ARCADE_ACTION_SYNC_LOADING__;
  }
  window.__MOONBOYS_ARCADE_ACTION_SYNC_LOADING__ = new Promise(resolve => {
    const script = document.createElement('script');
    script.src = '/js/player-action-sync.js';
    script.async = false;
    script.dataset.playerActionSync = '1';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', resolve, { once: true });
    // Reconciliation is auxiliary to gameplay. A stalled script request must
    // never hold competitive gating or game initialization indefinitely.
    window.setTimeout(resolve, 2500);
    document.head.appendChild(script);
  });
  return window.__MOONBOYS_ARCADE_ACTION_SYNC_LOADING__;
}

/**
 * Mount a game onto the page.
 *
 * @param {object}   options
 * @param {Element}  options.root      - Anchor element for the game (e.g. .game-card).
 * @param {Function} options.bootstrap - Factory: (root) → lifecycle object.
 * @returns {Promise<object>}          - Resolves to the game lifecycle object.
 */
export async function mountGame(options) {
  // Standalone Arcade pages do not load site-shell.js. Ensure the sanitized
  // accepted-action bus is available before any game bootstrap can emit an
  // accepted score/progression event.
  await ensurePlayerActionSync();
  var root      = options.root;
  var bootstrap = options.bootstrap;
  var adapter = options.adapter || null;
  var requireCompetitiveGate = options.requireCompetitiveGate === true;
  var competitiveGameId = options.gameId || options.competitiveGameId || null;

  if (!(root instanceof Element)) {
    console.error('[game-shell] root must be a DOM Element');
    return null;
  }

  if (typeof bootstrap !== 'function' && adapter) {
    bootstrap = function (mountRoot) {
      return bootstrapFromAdapter(mountRoot, adapter);
    };
  }

  if (typeof bootstrap !== 'function') {
    console.error('[game-shell] bootstrap must be a function');
    return null;
  }

  if (requireCompetitiveGate) {
    var identity = typeof window !== 'undefined' ? window.MOONBOYS_IDENTITY : null;
    if (!identity || typeof identity.enforceCompetitiveArcadePageGate !== 'function') {
      console.error('[game-shell] competitive gate is unavailable');
      return { gateBlocked: true, gateResult: { ok: false, reason: 'gate_unavailable', game_id: competitiveGameId } };
    }
    var gateResult = await identity.enforceCompetitiveArcadePageGate({ gameId: competitiveGameId });
    if (!gateResult || gateResult.ok !== true) {
      return { gateBlocked: true, gateResult: gateResult || { ok: false, reason: 'gate_blocked', game_id: competitiveGameId } };
    }
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

  // Mount the GraffPUNKS Radio widget into the arcade HUD for every game.
  // The radio module is idempotent — calling it multiple times is safe.
  try {
    mountArcadeRadio();
  } catch (e) {
    console.warn('[game-shell] mountArcadeRadio() threw:', e);
  }

  return game;
}
