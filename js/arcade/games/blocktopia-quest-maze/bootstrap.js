/**
 * bootstrap.js — Block Topia Quest Maze game module
 *
 * Wraps the Phaser-based Block Topia Quest Maze as an arcade game module.
 * Exports bootstrapBlocktopiaQuestMaze(), called by game-shell.js via mountGame().
 *
 * The actual Phaser scene logic lives in /games/js/btqm-game.js.
 * This bootstrap is a thin adapter that:
 *  1. Calls bootBTQM() to initialise the Phaser game on init().
 *  2. Provides a minimal lifecycle interface for the shell.
 *
 * Note: Phaser is loaded as a classic CDN script in the host page before
 *       this module runs, so window.Phaser is available at boot time.
 */

import { bootBTQM }                      from '/games/js/btqm-game.js';
import { BLOCKTOPIA_QUEST_MAZE_CONFIG }  from './config.js';
import { GameRegistry }                  from '/js/arcade/core/game-registry.js';

// Register in the central registry when this module is first imported.
GameRegistry.register(BLOCKTOPIA_QUEST_MAZE_CONFIG.id, {
  label:     BLOCKTOPIA_QUEST_MAZE_CONFIG.label,
  bootstrap: bootstrapBlocktopiaQuestMaze,
});

/**
 * Bootstrap the Block Topia Quest Maze game.
 *
 * @param {Element} root - Anchor element (unused directly; Phaser uses container ID).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapBlocktopiaQuestMaze(root) {
  const canvasId = BLOCKTOPIA_QUEST_MAZE_CONFIG.canvasId;

  let booted = false;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async function init() {
    if (booted) return;
    booted = true;

    try {
      bootBTQM(canvasId);
    } catch (err) {
      console.error('[blocktopia-quest-maze] boot failed:', err);
    }
  }

  function start()   { /* Phaser manages its own loop */ }
  function pause()   { /* Phaser manages its own loop */ }
  function resume()  { /* Phaser manages its own loop */ }
  function reset()   { /* Phaser manages its own loop */ }
  function destroy() { /* Phaser manages its own loop */ }
  function getScore() { return 0; }

  // ── Public lifecycle object ────────────────────────────────────────────────

  return { init, start, pause, resume, reset, destroy, getScore };
}
