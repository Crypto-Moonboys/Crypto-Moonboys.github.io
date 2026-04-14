/**
 * bootstrap.js — HexGL game module
 *
 * Wraps the external HexGL iframe embed as an arcade game module.
 * Exports bootstrapHexGL(), which is the entry point called by
 * game-shell.js via mountGame().
 *
 * HexGL is an external WebGL racing game (BKcore) served via jsDelivr.
 * The lifecycle interface is minimal — start() loads the iframe, reset()
 * unloads it so the player can start fresh.
 */

import { HEXGL_CONFIG }  from './config.js';
import { GameRegistry }  from '/js/arcade/core/game-registry.js';

// Register in the central registry when this module is first imported.
GameRegistry.register(HEXGL_CONFIG.id, {
  label:     HEXGL_CONFIG.label,
  bootstrap: bootstrapHexGL,
});

/**
 * Bootstrap the HexGL game.
 *
 * @param {Element} root - Container element (unused directly; DOM IDs are unique).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapHexGL(root) {
  const frameEl    = document.getElementById('hexglFrame');
  const loadBtnEl  = document.querySelector('.hexgl-wrap .btn:not(.alt)');
  const directBtnEl = document.querySelector('.hexgl-wrap .btn.alt');

  function loadGame() {
    if (frameEl) frameEl.src = HEXGL_CONFIG.src;
  }

  function openDirect() {
    window.open(HEXGL_CONFIG.src, '_blank');
  }

  // ── Lifecycle implementation ──────────────────────────────────────────────

  function init() {
    if (loadBtnEl)   loadBtnEl.onclick   = loadGame;
    if (directBtnEl) directBtnEl.onclick = openDirect;
  }

  function start() {
    loadGame();
  }

  function pause()  { /* External iframe — cannot pause */ }
  function resume() { /* External iframe — cannot resume */ }

  function reset() {
    // Unload the iframe so the player can reload
    if (frameEl) frameEl.src = '';
  }

  function destroy() {
    if (frameEl)     frameEl.src = '';
    if (loadBtnEl)   loadBtnEl.onclick   = null;
    if (directBtnEl) directBtnEl.onclick = null;
  }

  function getScore() { return 0; }

  // ── Public lifecycle object ───────────────────────────────────────────────

  return { init, start, pause, resume, reset, destroy, getScore };
}
