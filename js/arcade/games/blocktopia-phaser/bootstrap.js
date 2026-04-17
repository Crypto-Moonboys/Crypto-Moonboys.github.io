/**
 * bootstrap.js — Block Topia: Street Signal 3008 (Phaser) game module
 *
 * Wraps the Phaser-based Block Topia game as an arcade game module.
 * Exports bootstrapBlocktopiaPhaser(), which is the entry point called by
 * game-shell.js via mountGame().
 *
 * The actual Phaser scene logic lives in /games/js/blocktopia-phaser-game.js.
 * This bootstrap is a thin adapter that:
 *  1. Calls bootBlockTopia() to initialise the Phaser game on init().
 *  2. Hides the loading overlay (if present) after boot.
 *  3. Provides a minimal lifecycle interface for the shell.
 */

import { bootBlockTopia }           from '/games/js/blocktopia-phaser-game.js';
import { ArcadeSync }               from '/js/arcade-sync.js';
import { BLOCKTOPIA_PHASER_CONFIG } from './config.js';
import { GameRegistry }             from '/js/arcade/core/game-registry.js';

// Register in the central registry when this module is first imported.
GameRegistry.register(BLOCKTOPIA_PHASER_CONFIG.id, {
  label:     BLOCKTOPIA_PHASER_CONFIG.label,
  bootstrap: bootstrapBlocktopiaPhaser,
});

/**
 * Bootstrap the Block Topia Phaser game.
 *
 * @param {Element} root - Container element (unused directly; Phaser uses container ID).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapBlocktopiaPhaser(root) {
  const containerId = BLOCKTOPIA_PHASER_CONFIG.containerId;
  const loadingId   = BLOCKTOPIA_PHASER_CONFIG.loadingId;
  const hideDelay   = BLOCKTOPIA_PHASER_CONFIG.loadHideDelayMs;

  let booted = false;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async function init() {
    if (booted) return;
    booted = true;

    const loadingEl = loadingId ? document.getElementById(loadingId) : null;

    try {
      await bootBlockTopia(containerId);
      if (loadingEl) {
        setTimeout(function () { loadingEl.classList.add('hidden'); }, hideDelay);
      }
    } catch (err) {
      console.error('[blocktopia-phaser] boot failed:', err);
      if (loadingEl) {
        const titleEl = document.createElement('div');
        titleEl.className   = 'bt-loader-title';
        titleEl.style.color = '#ff3355';
        titleEl.textContent = 'BOOT FAILED';
        const subEl = document.createElement('div');
        subEl.className   = 'bt-loader-sub';
        subEl.textContent = err.message;
        loadingEl.replaceChildren(titleEl, subEl);
      }
    }
  }

  function start()   { /* Phaser manages its own loop */ }
  function pause()   { /* Phaser manages its own loop */ }
  function resume()  { /* Phaser manages its own loop */ }
  function reset()   { /* Phaser manages its own loop */ }
  function destroy() { /* Phaser manages its own loop */ }
  function getScore() {
    return ArcadeSync.getHighScore(BLOCKTOPIA_PHASER_CONFIG.id);
  }

  // ── Public lifecycle object ────────────────────────────────────────────────

  return { init, start, pause, resume, reset, destroy, getScore };
}
