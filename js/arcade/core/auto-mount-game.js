/**
 * auto-mount-game.js — Arcade auto-mount helper.
 *
 * Reads `data-game-id` from the first element that carries it on the page,
 * resolves the matching entry from arcade-manifest.js, then dynamically
 * imports the bootstrap module and mounts the game automatically.
 *
 * Usage (in a game page):
 *   <div class="game-card" data-game-id="breakout-bullrun">…</div>
 *   <script type="module">
 *     import { autoMountGame } from '/js/arcade/core/auto-mount-game.js';
 *     autoMountGame();          // reads data-game-id from the DOM
 *   </script>
 *
 * Falls back gracefully: if the manifest entry or bootstrap export is missing
 * the error is logged to the console so it is visible during development but
 * does not silence the existing manual bootstrap path on the page.
 *
 * @returns {Promise<object|null>} Resolves to the game lifecycle object on
 *   success, or null on any failure.
 */

import { getManifestEntry } from '/js/arcade/arcade-manifest.js';
import { mountGame } from '/js/arcade/core/game-shell.js';
import { mountModifierPanel } from '/js/arcade/systems/cross-game-modifier-ui.js';

/**
 * Find the element carrying data-game-id on the current page.
 *
 * @returns {Element|null}
 */
function findGameIdElement() {
  return document.querySelector('[data-game-id]') || null;
}

/**
 * Resolve the root mount element for a game.
 * Prefers the element that carries data-game-id when it is a container
 * (has children), otherwise falls back to the nearest .game-card.
 *
 * @param {Element} gameIdEl
 * @returns {Element|null}
 */
function resolveRoot(gameIdEl) {
  if (gameIdEl && gameIdEl.childElementCount > 0) {
    return gameIdEl;
  }
  return document.querySelector('.game-card') || gameIdEl;
}

/**
 * Auto-mount the game identified by the page's data-game-id attribute.
 *
 * @returns {Promise<object|null>}
 */
export async function autoMountGame() {
  var gameIdEl = findGameIdElement();

  if (!gameIdEl) {
    console.error('[auto-mount] No element with data-game-id found on this page.');
    return null;
  }

  var gameId = gameIdEl.getAttribute('data-game-id');
  var entry = getManifestEntry(gameId);

  if (!entry) {
    console.error('[auto-mount] No manifest entry for game id "' + gameId + '". ' +
      'Add an entry to js/arcade/arcade-manifest.js.');
    return null;
  }

  var mod;
  try {
    mod = await import(entry.bootstrapPath);
  } catch (err) {
    console.error('[auto-mount] Failed to import bootstrap module "' + entry.bootstrapPath + '":', err);
    return null;
  }

  // Prefer the named bootstrap function (bootstrapXxx) derived from the
  // adapter export name, then fall back to a default export.
  var bootstrapFn = null;

  // Try to find a named export that looks like bootstrapXxx by checking
  // the module for any function whose name starts with "bootstrap".
  for (var key of Object.keys(mod)) {
    if (typeof mod[key] === 'function' && key.startsWith('bootstrap')) {
      bootstrapFn = mod[key];
      break;
    }
  }

  if (!bootstrapFn && typeof mod.default === 'function') {
    bootstrapFn = mod.default;
  }

  if (!bootstrapFn) {
    console.error('[auto-mount] No bootstrap function found in module "' + entry.bootstrapPath + '". ' +
      'Expected a named export starting with "bootstrap" or a default export.');
    return null;
  }

  var root = resolveRoot(gameIdEl);

  if (!root) {
    console.error('[auto-mount] Could not resolve a mount root element for game "' + gameId + '".');
    return null;
  }

  try {
    var game = await mountGame({ root: root, bootstrap: bootstrapFn });
    mountModifierPanel();
    return game;
  } catch (err) {
    console.error('[auto-mount] Failed to mount game "' + gameId + '":', err);
    return null;
  }
}
