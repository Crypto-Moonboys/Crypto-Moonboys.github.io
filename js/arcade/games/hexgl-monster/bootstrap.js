/**
 * bootstrap.js — HexGL Monster Mode game module
 *
 * Wraps the simple HexGL Monster Mode page as an arcade game module.
 * Exports bootstrapHexGLMonster(), which is the entry point called by
 * game-shell.js via mountGame().
 *
 * The page embeds HexGL via an iframe and tracks a timed run.
 * start() loads the iframe and begins the timer; finish() calculates
 * the score and submits it; reset() stops the timer and clears the iframe.
 */

import { ArcadeSync }    from '/js/arcade-sync.js';
import { submitScore }   from '/js/leaderboard-client.js';
import { HEXGL_MONSTER_CONFIG } from './config.js';
import { GameRegistry }  from '/js/arcade/core/game-registry.js';

// Register in the central registry when this module is first imported.
GameRegistry.register(HEXGL_MONSTER_CONFIG.id, {
  label:     HEXGL_MONSTER_CONFIG.label,
  bootstrap: bootstrapHexGLMonster,
});

/**
 * Bootstrap the HexGL Monster Mode game.
 *
 * @param {Element} root - Container element (unused directly; DOM IDs are unique).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapHexGLMonster(root) {
  const GAME_ID  = HEXGL_MONSTER_CONFIG.id;

  const frameEl  = document.getElementById('hexglFrame');
  const startBtn = document.getElementById('startBtn');
  const finishBtn = document.getElementById('finishBtn');
  const resetBtn = document.getElementById('resetBtn');
  const playerEl = document.getElementById('player');
  const bestEl   = document.getElementById('best');
  const timerEl  = document.getElementById('timer');

  // ── State ─────────────────────────────────────────────────────────────────
  let startTs = null;
  let intervalId = null;
  let best = ArcadeSync.getHighScore(GAME_ID);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getPlayerName() {
    return window.MOONBOYS_IDENTITY?.getTelegramName?.()
      || ArcadeSync.getPlayer();
  }

  /** Score formula: 500 000 − (elapsed_seconds × 1 000). Lower time = higher score. */
  function calcScore(elapsedMs) {
    return Math.floor(500000 - (elapsedMs / 1000) * 1000);
  }

  function stopTimer() {
    clearInterval(intervalId);
    intervalId = null;
  }

  function getScore() {
    if (startTs === null) return 0;
    return calcScore(performance.now() - startTs);
  }

  // ── Button handlers ───────────────────────────────────────────────────────

  function onStart() {
    if (frameEl) frameEl.src = HEXGL_MONSTER_CONFIG.src;
    startTs = performance.now();
    stopTimer();
    intervalId = setInterval(function () {
      if (timerEl) timerEl.textContent = ((performance.now() - startTs) / 1000).toFixed(3);
    }, 100);
  }

  function onFinish() {
    if (startTs === null) return;
    stopTimer();
    const score = calcScore(performance.now() - startTs);
    const name = getPlayerName();
    ArcadeSync.setHighScore(GAME_ID, score);
    submitScore(name, score, GAME_ID);
    if (bestEl && score > best) { best = score; bestEl.textContent = best; }
  }

  function onReset() {
    stopTimer();
    startTs = null;
    if (frameEl) frameEl.src = '';
    if (timerEl) timerEl.textContent = '0.000';
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  function init() {
    const name = getPlayerName();
    if (playerEl) playerEl.textContent = name;
    if (bestEl)   bestEl.textContent   = best;

    if (startBtn)  startBtn.onclick  = onStart;
    if (finishBtn) finishBtn.onclick = onFinish;
    if (resetBtn)  resetBtn.onclick  = onReset;
  }

  function start() { onStart(); }
  function pause()  { /* external iframe — cannot pause */ }
  function resume() { /* external iframe — cannot resume */ }
  function reset()  { onReset(); }

  function destroy() {
    stopTimer();
    if (frameEl)   frameEl.src        = '';
    if (startBtn)  startBtn.onclick   = null;
    if (finishBtn) finishBtn.onclick  = null;
    if (resetBtn)  resetBtn.onclick   = null;
  }

  // ── Public lifecycle object ───────────────────────────────────────────────

  return { init, start, pause, resume, reset, destroy, getScore };
}
