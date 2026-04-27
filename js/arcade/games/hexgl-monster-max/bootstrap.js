/**
 * bootstrap.js â€” HexGL Monster Max (DEPRECATED â€” not active XP source)
 *
 * HexGL is archived and no longer the arcade leaderboard / XP source of truth.
 * Invaders 3008 (/games/invaders-3008/) is the current primary arcade XP game.
 *
 * Score submission is fully disabled in this file.
 * HexGL can still be loaded for testing purposes only.
 */
import { ArcadeSync }              from '/js/arcade-sync.js';
import { HEXGL_MONSTER_MAX_CONFIG } from './config.js';
import { createGameAdapter, registerGameAdapter } from '/js/arcade/engine/game-adapter.js';
import { playSound, isMuted, stopAllSounds } from '/js/arcade/core/audio.js';

export const HEXGL_MONSTER_MAX_ADAPTER = createGameAdapter({
  id: HEXGL_MONSTER_MAX_CONFIG.id,
  name: HEXGL_MONSTER_MAX_CONFIG.label,
  systems: {},
  legacyBootstrap: function (root) {
    return bootstrapHexGLMonsterMax(root);
  },
});

registerGameAdapter(HEXGL_MONSTER_MAX_CONFIG, HEXGL_MONSTER_MAX_ADAPTER, bootstrapHexGLMonsterMax);
export function bootstrapHexGLMonsterMax(root) {
  // â”€â”€ DESIGN INVARIANTS â€” do not remove or drift from these â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 1. SINGLE START ACTION:
  //    onStart() has one job: load the iframe if blank, or focus it if already
  //    loaded.  It never starts a wrapper timer.  The overlay button is labelled
  //    "Focus Game", not "Start Timer".
  // 2. POSTMESSAGE-ONLY SCORING:
  //    completedRunMs is set ONLY by handleRaceComplete(), which fires when the
  //    local HexGL build at /games/hexgl-local/ emits
  //    { type:'hexgl-race-complete', time:<ms> } via window.parent.postMessage.
  //    run-timer and score stay "â€”" until that event arrives.
  //    Submit button stays disabled until that postMessage event arrives.
  // 3. ORIGIN-LOCKED POSTMESSAGE:
  //    onHexGLMessage checks event.origin === window.location.origin so only the
  //    same-origin local build can trigger handleRaceComplete().
  // 4. AUTO-SUBMIT ON FINISH:
  //    When completedRunMs is set via postMessage, if the user is Telegram-
  //    linked autoSubmit() fires immediately.  Submit button is manual-retry only.
  // 5. EXIT FS CLEANUP:
  //    On arcade-overlay-exit auto-submit is retried if a valid postMessage-
  //    sourced run is pending.
  // 6. RESET CLEARS SCORE:
  //    onReset() clears completedRunMs, reloads the iframe, and returns the
  //    page to RUN READY state.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var MIN_RUN_MS = HEXGL_MONSTER_MAX_CONFIG.minRunMs;
  var FRAME_SRC = '/games/hexgl-local/';

  var frameEl         = document.getElementById('hexgl-frame');
  var pilotEl         = document.getElementById('pilot-name');
  var timerEl         = document.getElementById('run-timer');
  var scoreEl         = document.getElementById('est-score');
  var statusEl        = document.getElementById('run-status');
  var startBtn        = document.getElementById('startBtn');
  var submitBtn       = document.getElementById('submit-btn');
  var resetBtn        = document.getElementById('resetBtn');
  var inlineMessageEl = document.getElementById('hexgl-inline-message');

  var playerName              = 'Guest';
  var runToken                = 0;
  var frameLoaded             = false;
  var runActive               = false;
  var runStart                = null;
  var intervalId              = null;
  var completedRunMs          = null;
  var completedScoreSubmitted = false;
  var statusText              = 'RUN READY';
  var messageTimeoutId        = null;

  function calcScore(ms) {
    return Math.max(0, Math.floor(500000 - (ms / 1000) * 1000));
  }

  function fmtTime(ms) {
    var s  = Math.floor(ms / 1000);
    var m  = Math.floor(s / 60);
    var ss = String(s % 60).padStart(2, '0');
    var ds = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
    return m + ':' + ss + '.' + ds;
  }

  function getPlayerName() {
    var identityName = window.MOONBOYS_IDENTITY?.getTelegramName?.();
    return identityName || ArcadeSync.getPlayer();
  }

  function stopTimer() {
    clearInterval(intervalId);
    intervalId = null;
  }

  function setStatus(text) {
    statusText = text;
    if (statusEl) statusEl.textContent = text;
  }

  function notify(message) {
    if (!inlineMessageEl) return;
    inlineMessageEl.textContent = message || '';
    clearTimeout(messageTimeoutId);
    if (!message) return;
    messageTimeoutId = setTimeout(function () {
      if (inlineMessageEl) inlineMessageEl.textContent = '';
    }, 2600);
  }

  function isFrameBlank() {
    if (!frameEl) return true;
    var src = String(frameEl.getAttribute('src') || '').trim();
    return !src || src === 'about:blank';
  }

  function canUseAudio() {
    // NOTE: Only wrapper-generated tones are controllable here.
    // BKcore's iframe audio is cross-origin and cannot be muted/paused by this wrapper.
    return !isMuted();
  }

  function playUiTone(kind) {
    if (!canUseAudio()) return;
    var soundId = {
      start:  'hexgl-start',
      reset:  'hexgl-reset',
      submit: 'hexgl-submit',
      error:  'hexgl-error',
      exit:   'hexgl-exit',
    }[kind] || 'hexgl-start';
    playSound(soundId);
  }

  function refreshIdentity() {
    playerName = getPlayerName();
    if (pilotEl) pilotEl.textContent = playerName;
  }

  function updateRunUI(ms) {
    var score = calcScore(ms);
    if (timerEl) timerEl.textContent = fmtTime(ms);
    if (scoreEl) scoreEl.textContent = score.toLocaleString();
  }

  function setOverlayStartEnabled(enabled) {
    var overlayStartBtn = document.getElementById('overlay-btn-start');
    if (overlayStartBtn) overlayStartBtn.disabled = !enabled;
  }

  function setOverlayStartLabel(icon, label) {
    var overlayStartBtn = document.getElementById('overlay-btn-start');
    if (!overlayStartBtn) return;
    var iconEl  = overlayStartBtn.querySelector('.btn-icon');
    var labelEl = overlayStartBtn.querySelector('.btn-label');
    if (iconEl)  iconEl.textContent  = icon;
    if (labelEl) labelEl.textContent = ' ' + label;
  }

  function notifyReadyToLaunch() {
    setStatus('RUN READY');
    notify('HexGL loaded. Click Focus Game to enter the iframe, then start a race.');
    setOverlayStartLabel('ðŸŽ®', 'Focus Game');
    setOverlayStartEnabled(true);
  }

  function loadFrameForLaunch(forceReload) {
    if (!frameEl) return;
    var shouldReload = !!forceReload || !frameLoaded || isFrameBlank();
    if (!shouldReload) {
      notifyReadyToLaunch();
      return;
    }
    frameLoaded = false;
    frameEl.classList.remove('loaded');
    setOverlayStartEnabled(false);
    setStatus('LOADING');
    notify('Loading HexGLâ€¦');
    frameEl.src = FRAME_SRC + '?t=' + Date.now();
  }

  // Stops the wrapper timer and returns the elapsed ms.  Returns null if no
  // run was active.  Does NOT modify completedRunMs â€” callers do that.
  function stopRunAndCapture() {
    if (!runActive) return null;
    var elapsed = Date.now() - runStart;
    runActive = false;
    runStart  = null;
    stopTimer();
    return elapsed;
  }

  function savePersonalBest(ms) {
    try {
      var current = JSON.parse(localStorage.getItem('hexgl_best_run') || 'null');
      if (!current || ms < current.ms) {
        localStorage.setItem('hexgl_best_run', JSON.stringify({ ms: ms, name: playerName }));
      }
    } catch (_) {}
  }

  // HexGL deprecated â€” not active XP source.
  // autoSubmit is intentionally disabled: HexGL scores must not reach the
  // leaderboard or grant XP.  Invaders 3008 is the current arcade XP source.
  async function autoSubmit() {
    return;
  }

  // Called when the HexGL iframe sends a race-finish postMessage event.
  // Expected shape: { type: 'hexgl-race-complete', time: <milliseconds> }
  // When a local/hosted HexGL build is used, this path is authoritative and
  // the wrapper timer is stopped so its elapsed time is discarded.
  function handleRaceComplete(ms) {
    // Stop wrapper timer (if running) â€” iframe event is the source of truth.
    stopRunAndCapture();
    setOverlayStartEnabled(false);

    if (typeof ms !== 'number' || ms < MIN_RUN_MS) {
      notify('Race time too short to qualify (minimum 30 s).');
      return;
    }
    completedRunMs = ms;
    completedScoreSubmitted = false;
    updateRunUI(ms);
    savePersonalBest(ms);
    localStorage.setItem('hexgl_last_run_ms', String(ms));
    setStatus('RUN COMPLETE');
    // HexGL deprecated â€” score submission is disabled.  Submit button stays disabled.
    if (submitBtn) submitBtn.disabled = true;
    notify('Run recorded locally. Note: HexGL score submission is disabled â€” Invaders 3008 is the current arcade XP source.');
  }

  function onHexGLMessage(event) {
    // Accept messages only from the same origin (local HexGL build).
    if (event.origin !== window.location.origin) return;
    if (!frameEl || event.source !== frameEl.contentWindow) return;
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'hexgl-race-complete' && typeof data.time === 'number' && data.time > 0) {
      handleRaceComplete(data.time);
    }
  }

  function onOverlayOpen() {
    if (runActive) return;  // run in progress â€” leave it alone
    loadFrameForLaunch(false);
  }

  function onStart() {
    refreshIdentity();

    // Phase 0: iframe not yet loaded â€” load it, wait for the load event.
    if (!frameLoaded || isFrameBlank()) {
      loadFrameForLaunch(false);
      return;
    }

    // Frame already loaded â€” just focus it so the user can interact with HexGL.
    // No wrapper timer is started; score only comes from a postMessage race-complete event.
    try { if (frameEl) frameEl.focus(); } catch (_) {}
    setOverlayStartEnabled(false);
  }

  // HexGL deprecated â€” not active XP source.
  // onSubmit is intentionally disabled: HexGL scores must not reach the
  // leaderboard or grant XP.  Invaders 3008 is the current arcade XP source.
  async function onSubmit() {
    playUiTone('error');
    notify('HexGL score submission is disabled. Invaders 3008 is the current arcade XP source.');
    return;
  }

  function onReset() {
    playUiTone('reset');
    runToken += 1;
    stopRunAndCapture();   // clears runActive / runStart / intervalId
    completedRunMs = null;
    completedScoreSubmitted = false;
    frameLoaded = false;
    setOverlayStartEnabled(false);
    if (frameEl) {
      frameEl.classList.remove('loaded');
      frameEl.src = FRAME_SRC + '?t=' + Date.now();
    }
    if (timerEl) timerEl.textContent = 'â€”';
    if (scoreEl) scoreEl.textContent = 'â€”';
    setStatus('RUN READY');
    if (startBtn) startBtn.disabled = false;
    if (submitBtn) {
      submitBtn.textContent = 'ðŸ“¤ Submit Run';
      submitBtn.disabled = true;
    }
    notify('Loading HexGLâ€¦');
  }

  function init() {
    refreshIdentity();
    setStatus('RUN READY');
    if (submitBtn) {
      submitBtn.textContent = 'ðŸ“¤ Submit Run';
      submitBtn.disabled = true;
    }
    setOverlayStartEnabled(false);
    frameLoaded = !isFrameBlank();
    if (frameEl) {
      frameEl.addEventListener('load', function () {
        if (isFrameBlank()) return;
        frameLoaded = true;
        frameEl.classList.add('loaded');
        if (!runActive) notifyReadyToLaunch();
      });
      frameEl.addEventListener('error', function () {
        frameLoaded = false;
        setStatus('LOAD ERROR');
        notify('HexGL failed to load. Click Start Fullscreen to retry.');
        setOverlayStartLabel('ðŸ”„', 'Retry');
        setOverlayStartEnabled(true);
      });
    }
    window.addEventListener('message', onHexGLMessage);
    document.addEventListener('arcade-overlay-exit', function () {
      playUiTone('exit');
      // HexGL deprecated â€” not active XP source.  Auto-submit on exit disabled.
    });
    if (startBtn) startBtn.addEventListener('click', onStart);
    if (submitBtn) submitBtn.addEventListener('click', onSubmit);
    if (resetBtn) resetBtn.addEventListener('click', onReset);
    // Expose hooks so game-fullscreen.js can drive iframe loading without
    // going through the DOM click path.
    window.__hexglStartHook = onStart;
    window.__hexglOverlayOpenHook = onOverlayOpen;
    setStatus(statusText);
  }

  function start()  { onStart(); }
  function pause()  {}
  function resume() {}
  function reset()  { onReset(); }

  function destroy() {
    runToken += 1;
    stopRunAndCapture();
    window.removeEventListener('message', onHexGLMessage);
    stopAllSounds();
    clearTimeout(messageTimeoutId);
    notify('');
    if (frameEl) {
      frameEl.classList.remove('loaded');
      frameEl.src = '';
    }
    if (startBtn) startBtn.removeEventListener('click', onStart);
    if (submitBtn) submitBtn.removeEventListener('click', onSubmit);
    if (resetBtn) resetBtn.removeEventListener('click', onReset);
    delete window.__hexglStartHook;
    delete window.__hexglOverlayOpenHook;
  }

  function getScore() {
    // Only returns a score after a real race-complete postMessage event.
    // Wrapper timer elapsed time is NEVER used as a score.
    if (typeof completedRunMs === 'number') return calcScore(completedRunMs);
    return 0;
  }

  return { init, start, pause, resume, reset, destroy, getScore };
}
