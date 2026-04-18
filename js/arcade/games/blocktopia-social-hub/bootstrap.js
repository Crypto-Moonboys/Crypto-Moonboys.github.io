/**
 * bootstrap.js — Block Topia: Street Signal 3008 game module
 *
 * Wraps the canvas-based Block Topia Street Signal 3008 game as an arcade
 * game module.  Exports bootstrapBlocktopiaHub(), which is the entry point
 * called by game-shell.js via mountGame().
 *
 * Game features:
 *  - Canvas WASD / Arrow-key player movement
 *  - Neon zone detection and district capture
 *  - Day / Night phase toggle (double points at night)
 *  - Seasonal lore loaded from /games/data/blocktopia-season.json
 *  - Score submission via leaderboard-client.js
 */

import { ArcadeSync }                  from '/js/arcade-sync.js';
import { submitScore }                 from '/js/leaderboard-client.js';
import { BLOCKTOPIA_SOCIAL_HUB_CONFIG } from './config.js';
import { GameRegistry }                from '/js/arcade/core/game-registry.js';

// Register in the central registry when this module is first imported.
GameRegistry.register(BLOCKTOPIA_SOCIAL_HUB_CONFIG.id, {
  label:     BLOCKTOPIA_SOCIAL_HUB_CONFIG.label,
  bootstrap: bootstrapBlocktopiaHub,
});

/**
 * Bootstrap the Block Topia: Street Signal 3008 game.
 *
 * @param {Element} root - Container element (unused directly; DOM IDs are unique).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapBlocktopiaHub(root) {
  const GAME_ID = BLOCKTOPIA_SOCIAL_HUB_CONFIG.id;

  // ── DOM references ─────────────────────────────────────────────────────────
  const canvas     = document.getElementById('game');
  const ctx        = canvas ? canvas.getContext('2d') : null;
  const playerNameEl = document.getElementById('playerName');
  const linkedEl   = document.getElementById('linked');
  const phaseEl    = document.getElementById('phase');
  const districtEl = document.getElementById('district');
  const scoreEl    = document.getElementById('score');
  const seasonEl   = document.getElementById('seasonName');
  const loreEl     = document.getElementById('lore');
  const toggleBtn  = document.getElementById('togglePhase');
  const submitBtn  = document.getElementById('submitScore');

  // ── State ──────────────────────────────────────────────────────────────────
  let state    = { x: 540, y: 520, score: 0, phase: 'Day' };
  let rafId    = null;
  let running  = false;
  let paused   = false;
  let runEnded = false;
  let runSubmitted = false;

  // ── Neon zones ─────────────────────────────────────────────────────────────
  const zones = [
    { id: 'quest',       label: 'Quest Wall',        x: 150, y: 260, w: 160, h: 120, color: '#ff4fd8' },
    { id: 'arcade',      label: 'Arcade Portal',     x: 820, y: 260, w: 160, h: 120, color: '#ffd84d' },
    { id: 'leaderboard', label: 'Leaderboard Gate',  x: 720, y: 460, w: 160, h: 120, color: '#5ef2ff' },
    { id: 'telegram',    label: 'Telegram Node',     x: 300, y: 460, w: 160, h: 120, color: '#8dff6a' },
    { id: 'market',      label: 'Token Plaza',       x: 480, y: 100, w: 120, h:  90, color: '#ff9b42' },
  ];

  // ── Identity ───────────────────────────────────────────────────────────────

  function getPlayerName() {
    return ArcadeSync.getPlayer();
  }

  function isLinked() {
    if (window.MOONBOYS_IDENTITY && window.MOONBOYS_IDENTITY.isTelegramLinked) {
      return window.MOONBOYS_IDENTITY.isTelegramLinked();
    }
    return !!(localStorage.getItem('moonboys_tg_id') && localStorage.getItem('moonboys_tg_linked'));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, state.phase === 'Night' ? '#2b1950' : '#4a6fa5');
    g.addColorStop(1, '#0c0e14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    zones.forEach(function (z) {
      ctx.fillStyle   = z.color + '33';
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.strokeStyle = z.color;
      ctx.strokeRect(z.x, z.y, z.w, z.h);
      ctx.fillStyle   = z.color;
      ctx.font        = 'bold 14px Inter';
      ctx.textAlign   = 'center';
      ctx.fillText(z.label, z.x + z.w / 2, z.y + z.h / 2);
    });

    ctx.fillStyle = '#eaf6ff';
    ctx.fillRect(state.x - 10, state.y - 20, 20, 30);

    if (scoreEl) scoreEl.textContent = state.score;
  }

  // ── Zone detection ─────────────────────────────────────────────────────────

  function inZone() {
    return zones.find(function (z) {
      return state.x > z.x && state.x < z.x + z.w && state.y > z.y && state.y < z.y + z.h;
    });
  }

  // ── Render loop (continuous; state is updated via keydown events) ──────────

  function renderLoop() {
    draw();
    rafId = requestAnimationFrame(renderLoop);
  }

  // ── Key handler (state updates on each keydown — matches original UX) ──────

  function onKeyDown(e) {
    if (!running || paused || runEnded) return;
    const s = 4;
    if (e.key === 'ArrowUp'    || e.key === 'w') state.y -= s;
    if (e.key === 'ArrowDown'  || e.key === 's') state.y += s;
    if (e.key === 'ArrowLeft'  || e.key === 'a') state.x -= s;
    if (e.key === 'ArrowRight' || e.key === 'd') state.x += s;

    const z = inZone();
    if (z) {
      if (districtEl) districtEl.textContent = z.label;
      state.score += state.phase === 'Night' ? 10 : 5;
    }
  }

  // ── Season lore ────────────────────────────────────────────────────────────

  async function loadSeason() {
    try {
      const res    = await fetch(BLOCKTOPIA_SOCIAL_HUB_CONFIG.seasonUrl);
      const season = await res.json();
      if (seasonEl) seasonEl.textContent = season.season_name;
      if (loreEl)   loreEl.textContent   = JSON.stringify(season, null, 2);
    } catch (_) {
      if (seasonEl) seasonEl.textContent = 'Unknown';
    }
  }

  // ── Button handlers ────────────────────────────────────────────────────────

  function onTogglePhase() {
    if (!running || runEnded) return;
    state.phase = state.phase === 'Day' ? 'Night' : 'Day';
    if (phaseEl) phaseEl.textContent = state.phase;
  }

  function canSubmitIdentity() {
    return isLinked();
  }

  function syncSubmitButton() {
    if (!submitBtn) return;
    submitBtn.disabled = !running || runEnded;
    submitBtn.textContent = runEnded
      ? (runSubmitted ? '✅ Submitted' : 'Run Ended')
      : 'End Run';
  }

  async function onSubmitScore() {
    if (!running || runEnded) return;
    running = false;
    runEnded = true;
    paused = false;
    const name = getPlayerName();
    const finalScore = Math.max(0, Math.floor(state.score || 0));
    ArcadeSync.setHighScore(GAME_ID, finalScore);
    if (!runSubmitted && finalScore > 0 && canSubmitIdentity()) {
      runSubmitted = true;
      try { await submitScore(name, finalScore, GAME_ID); } catch (_) {}
    }
    syncSubmitButton();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  function init() {
    const name = getPlayerName();
    if (playerNameEl) playerNameEl.textContent = name;
    if (linkedEl)     linkedEl.textContent     = isLinked() ? 'Yes' : 'No';

    if (toggleBtn) toggleBtn.addEventListener('click', onTogglePhase);
    if (submitBtn) submitBtn.addEventListener('click', onSubmitScore);

    window.addEventListener('keydown', onKeyDown);

    loadSeason();
    start();
  }

  function start() {
    if (rafId) return;
    running = true;
    paused = false;
    runEnded = false;
    runSubmitted = false;
    state = { x: 540, y: 520, score: 0, phase: 'Day' };
    if (phaseEl)    phaseEl.textContent    = 'Day';
    if (districtEl) districtEl.textContent = 'Plaza';
    syncSubmitButton();
    rafId = requestAnimationFrame(renderLoop);
  }

  function pause() {
    if (!running || runEnded) return;
    cancelAnimationFrame(rafId);
    rafId = null;
    paused = true;
  }

  function resume() {
    if (rafId || !running || runEnded) return;
    paused = false;
    rafId = requestAnimationFrame(renderLoop);
  }

  function reset() {
    pause();
    running = false;
    paused = false;
    runEnded = false;
    runSubmitted = false;
    start();
  }

  function destroy() {
    pause();
    running = false;
    paused = false;
    runEnded = false;
    runSubmitted = false;
    window.removeEventListener('keydown', onKeyDown);
    if (toggleBtn) toggleBtn.removeEventListener('click', onTogglePhase);
    if (submitBtn) submitBtn.removeEventListener('click', onSubmitScore);
  }

  function getScore() {
    return state.score;
  }

  // ── Public lifecycle object ────────────────────────────────────────────────

  return { init, start, pause, resume, reset, destroy, getScore };
}
