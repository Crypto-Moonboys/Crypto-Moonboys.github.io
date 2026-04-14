/**
 * bootstrap.js — HexGL Monster Mode (Max) game module
 *
 * Wraps the polished HexGL Monster Mode Max page as an arcade game module.
 * Exports bootstrapHexGLMonsterMax(), which is the entry point called by
 * game-shell.js via mountGame().
 *
 * Features:
 *  - Pilot identity resolution (Telegram or localStorage fallback)
 *  - Live run timer with estimated score and XP display
 *  - Anti-cheat: minimum run duration enforced before submission
 *  - Rival ghost: personal best stored and displayed from localStorage
 *  - Score submission via leaderboard-client.js
 */

import { submitScore }              from '/js/leaderboard-client.js';
import { HEXGL_MONSTER_MAX_CONFIG } from './config.js';
import { GameRegistry }             from '/js/arcade/core/game-registry.js';

// Register in the central registry when this module is first imported.
GameRegistry.register(HEXGL_MONSTER_MAX_CONFIG.id, {
  label:     HEXGL_MONSTER_MAX_CONFIG.label,
  bootstrap: bootstrapHexGLMonsterMax,
});

/**
 * Bootstrap the HexGL Monster Mode Max game.
 *
 * @param {Element} root - Container element (unused directly; DOM IDs are unique).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapHexGLMonsterMax(root) {
  const MIN_RUN_MS = HEXGL_MONSTER_MAX_CONFIG.minRunMs;

  // ── DOM references ─────────────────────────────────────────────────────────
  var pilotEl    = document.getElementById('pilot-name');
  var timerEl    = document.getElementById('run-timer');
  var scoreEl    = document.getElementById('est-score');
  var xpEl       = document.getElementById('xp-reward');
  var rivalBlock = document.getElementById('rival-block');
  var rivalName  = document.getElementById('rival-name');
  var rivalTime  = document.getElementById('rival-time');
  var startBtn   = document.getElementById('startBtn');
  var submitBtn  = document.getElementById('submit-btn');

  // ── State ──────────────────────────────────────────────────────────────────
  var playerName = 'Guest';
  var telegramId = null;
  var runStart   = null;
  var runActive  = false;
  var intervalId = null;
  var lastRunMs  = null;

  // ── Identity ───────────────────────────────────────────────────────────────

  function refreshIdentity() {
    try {
      if (window.MOONBOYS_IDENTITY) {
        var id = window.MOONBOYS_IDENTITY.getTelegramId();
        if (id) {
          telegramId = id;
          playerName = localStorage.getItem('moonboys_tg_name') || 'Guest';
        }
      }
    } catch (_) { /* fail-open */ }
    if (pilotEl) pilotEl.textContent = playerName;
  }

  // ── Formatting helpers ─────────────────────────────────────────────────────

  function fmtTime(ms) {
    var s  = Math.floor(ms / 1000);
    var m  = Math.floor(s / 60);
    var ss = String(s % 60).padStart(2, '0');
    var ds = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
    return m + ':' + ss + '.' + ds;
  }

  function calcScore(ms) {
    return Math.max(0, Math.round(500000 - (ms / 1000) * 1000));
  }

  function calcXp(score) {
    return Math.floor(score / 1000) * 10;
  }

  // ── Run timer ──────────────────────────────────────────────────────────────

  function startRun() {
    runStart  = Date.now();
    runActive = true;
    lastRunMs = null;
    clearInterval(intervalId);
    intervalId = setInterval(function () {
      var elapsed = Date.now() - runStart;
      if (timerEl) timerEl.textContent = fmtTime(elapsed);
      var s = calcScore(elapsed);
      if (scoreEl) scoreEl.textContent = s > 0 ? s.toLocaleString() : '—';
      if (xpEl)    xpEl.textContent    = s > 0 ? '+' + calcXp(s).toLocaleString() + ' XP' : '—';
    }, 100);
  }

  function stopRun() {
    if (!runActive) return;
    clearInterval(intervalId);
    runActive = false;
    lastRunMs = Date.now() - runStart;
    if (timerEl) timerEl.textContent = fmtTime(lastRunMs);
    var s = calcScore(lastRunMs);
    if (scoreEl) scoreEl.textContent = s > 0 ? s.toLocaleString() : '0';
    if (xpEl)    xpEl.textContent    = s > 0 ? '+' + calcXp(s).toLocaleString() + ' XP' : '—';
  }

  // ── Anti-cheat ─────────────────────────────────────────────────────────────

  function isValidRun(ms) {
    return typeof ms === 'number' && ms >= MIN_RUN_MS;
  }

  // ── Rival ghost ────────────────────────────────────────────────────────────

  function loadRival() {
    try {
      var stored = localStorage.getItem('hexgl_best_run');
      if (!stored) return;
      var data = JSON.parse(stored);
      if (!data || !data.ms) return;
      if (rivalBlock) rivalBlock.style.display = '';
      if (rivalName)  rivalName.textContent    = data.name || 'You';
      if (rivalTime)  rivalTime.textContent    = fmtTime(data.ms);
    } catch (_) { /* ignore */ }
  }

  function savePersonalBest(ms) {
    try {
      var current = JSON.parse(localStorage.getItem('hexgl_best_run') || 'null');
      if (!current || ms < current.ms) {
        localStorage.setItem('hexgl_best_run', JSON.stringify({ ms: ms, name: playerName }));
      }
    } catch (_) { /* ignore */ }
  }

  // ── Button handlers ────────────────────────────────────────────────────────

  function onStart() {
    refreshIdentity();
    startRun();
    if (startBtn) {
      startBtn.textContent = '⏱ Racing…';
      startBtn.disabled    = true;
    }
  }

  async function onSubmit() {
    if (runActive) stopRun();
    if (!isValidRun(lastRunMs)) {
      alert('No valid completed run to submit. Please finish a race first (minimum 30 s).');
      return;
    }
    var score = calcScore(lastRunMs);
    if (score <= 0) {
      alert('Run time too slow to qualify for the leaderboard (score = 0).');
      return;
    }
    savePersonalBest(lastRunMs);
    await submitScore(playerName, score, HEXGL_MONSTER_MAX_CONFIG.id);
    if (submitBtn) {
      submitBtn.textContent = '✅ Submitted!';
      submitBtn.disabled    = true;
    }
    if (startBtn) {
      startBtn.textContent = '⏱ Begin Tracked Run';
      startBtn.disabled    = false;
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  function init() {
    refreshIdentity();
    loadRival();
    if (startBtn)  startBtn.addEventListener('click', onStart);
    if (submitBtn) submitBtn.addEventListener('click', onSubmit);
  }

  function start()  { onStart(); }
  function pause()  { /* external iframe — cannot pause */ }
  function resume() { /* external iframe — cannot resume */ }

  function reset() {
    clearInterval(intervalId);
    runStart  = null;
    runActive = false;
    lastRunMs = null;
    if (timerEl) timerEl.textContent = '—';
    if (scoreEl) scoreEl.textContent = '—';
    if (xpEl)    xpEl.textContent    = '—';
    if (startBtn) { startBtn.textContent = '⏱ Begin Tracked Run'; startBtn.disabled = false; }
    if (submitBtn) { submitBtn.textContent = '📤 Submit Run'; submitBtn.disabled = false; }
  }

  function destroy() {
    clearInterval(intervalId);
    if (startBtn)  startBtn.removeEventListener('click', onStart);
    if (submitBtn) submitBtn.removeEventListener('click', onSubmit);
  }

  function getScore() {
    if (lastRunMs !== null) return calcScore(lastRunMs);
    if (runActive && runStart !== null) return calcScore(Date.now() - runStart);
    return 0;
  }

  // ── Public lifecycle object ────────────────────────────────────────────────

  return { init, start, pause, resume, reset, destroy, getScore };
}
