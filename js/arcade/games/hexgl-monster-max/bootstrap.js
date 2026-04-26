import { ArcadeSync }              from '/js/arcade-sync.js';
import { submitScore }             from '/js/leaderboard-client.js';
import { HEXGL_MONSTER_MAX_CONFIG }  from './config.js';
import { GameRegistry }              from '/js/arcade/core/game-registry.js';
import { playSound, isMuted, stopAllSounds } from '/js/arcade/core/audio.js';

GameRegistry.register(HEXGL_MONSTER_MAX_CONFIG.id, {
  label: HEXGL_MONSTER_MAX_CONFIG.label,
  bootstrap: bootstrapHexGLMonsterMax,
});

export function bootstrapHexGLMonsterMax(root) {
  // ── DESIGN INVARIANTS — do not remove or drift from these ─────────────────
  // 1. SINGLE START ACTION:
  //    onStart() has one phase only.  First click loads the iframe; once loaded
  //    a second click starts the wrapper timer.  If runActive is already true
  //    the click is ignored entirely — no double-timer bug.
  // 2. POSTMESSAGE-ONLY SCORING:
  //    completedRunMs is set ONLY by handleRaceComplete(), which fires when the
  //    local HexGL build at /games/hexgl-local/ emits
  //    { type:'hexgl-race-complete', time:<ms> } via window.parent.postMessage.
  //    The wrapper timer is for display only and NEVER sets completedRunMs.
  //    Submit button stays disabled until that postMessage event arrives.
  // 3. ORIGIN-LOCKED POSTMESSAGE:
  //    onHexGLMessage checks event.origin === window.location.origin so only the
  //    same-origin local build can trigger handleRaceComplete().
  // 4. AUTO-SUBMIT ON FINISH:
  //    When completedRunMs is set via postMessage, if the user is Telegram-
  //    linked autoSubmit() fires immediately.  Submit button is manual-retry only.
  // 5. EXIT FS CLEANUP:
  //    On arcade-overlay-exit the wrapper timer is stopped (cleanup only) and
  //    auto-submit is retried if a valid postMessage-sourced run is pending.
  // 6. RESET CLEARS SCORE:
  //    onReset() stops the timer, clears completedRunMs, reloads the iframe, and
  //    returns the page to RUN READY state.
  // ──────────────────────────────────────────────────────────────────────────
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
    notify('HexGL loaded. Enter the race in HexGL, then click Start Timer.');
    setOverlayStartLabel('▶', 'Start Timer');
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
    notify('Loading HexGL…');
    frameEl.src = FRAME_SRC + '?t=' + Date.now();
  }

  // Stops the wrapper timer and returns the elapsed ms.  Returns null if no
  // run was active.  Does NOT modify completedRunMs — callers do that.
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

  async function autoSubmit() {
    if (!completedRunMs || completedScoreSubmitted) return;
    if (!window.MOONBOYS_IDENTITY?.isTelegramLinked?.()) return;
    var score = calcScore(completedRunMs);
    if (score <= 0) return;
    playUiTone('submit');
    try {
      await submitScore(playerName, score, HEXGL_MONSTER_MAX_CONFIG.id);
      completedScoreSubmitted = true;
      if (submitBtn) {
        submitBtn.textContent = '✅ Submitted';
        submitBtn.disabled = true;
      }
      setStatus('SUBMITTED');
    } catch (err) {
      console.error('[hexgl] autoSubmit failed:', err);
      notify('Submission failed — click Submit to retry.');
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  // Called when the HexGL iframe sends a race-finish postMessage event.
  // Expected shape: { type: 'hexgl-race-complete', time: <milliseconds> }
  // When a local/hosted HexGL build is used, this path is authoritative and
  // the wrapper timer is stopped so its elapsed time is discarded.
  function handleRaceComplete(ms) {
    // Stop wrapper timer (if running) — iframe event is the source of truth.
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
    if (submitBtn) submitBtn.disabled = false;
    if (window.MOONBOYS_IDENTITY?.isTelegramLinked?.()) {
      autoSubmit().catch(function (err) {
        console.error('[hexgl] race-finish auto-submit failed:', err);
      });
    } else {
      if (window.MOONBOYS_IDENTITY?.showSyncGateModal) {
        window.MOONBOYS_IDENTITY.showSyncGateModal(true);
      } else {
        notify('Run saved locally. Sync with Telegram to submit to leaderboard.');
      }
    }
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
    if (runActive) return;  // run in progress — leave it alone
    loadFrameForLaunch(false);
  }

  function onStart() {
    refreshIdentity();

    // Phase 0: iframe not yet loaded — load it, wait for the load event.
    if (!frameLoaded || isFrameBlank()) {
      loadFrameForLaunch(false);
      return;
    }

    // Guard: ignore if a run is already in progress (prevents double timer).
    if (runActive) return;

    // Start wrapper timer (display only — score requires a postMessage finish event).
    runToken += 1;
    var token = runToken;
    completedRunMs = null;
    completedScoreSubmitted = false;
    runStart = Date.now();
    runActive = true;
    setStatus('RUN ACTIVE');
    playUiTone('start');
    if (submitBtn) {
      submitBtn.disabled = true;   // stays disabled until postMessage race-complete
      submitBtn.textContent = '📤 Submit Run';
    }
    if (timerEl) timerEl.textContent = fmtTime(0);
    if (scoreEl) scoreEl.textContent = calcScore(0).toLocaleString();
    notify('');
    setOverlayStartEnabled(false);
    stopTimer();
    intervalId = setInterval(function () {
      if (token !== runToken) { stopTimer(); return; }
      updateRunUI(Date.now() - runStart);
    }, 100);
  }

  async function onSubmit() {
    // Stop wrapper timer if it is running (cleanup only — the wrapper timer
    // elapsed time is NOT used as a score; only a postMessage race-complete
    // event can set completedRunMs).
    stopRunAndCapture();

    if (typeof completedRunMs !== 'number' || completedRunMs < MIN_RUN_MS) {
      playUiTone('error');
      if (frameLoaded && !isFrameBlank()) {
        setStatus('RUN READY');
        setOverlayStartEnabled(true);
      }
      notify('Complete a valid run first (minimum 30 seconds).');
      return;
    }
    var score = calcScore(completedRunMs);
    if (score <= 0) {
      playUiTone('error');
      notify('Run is too slow to qualify for leaderboard submission.');
      return;
    }
    if (!window.MOONBOYS_IDENTITY?.isTelegramLinked?.()) {
      if (window.MOONBOYS_IDENTITY?.showSyncGateModal) {
        window.MOONBOYS_IDENTITY.showSyncGateModal(true);
      } else {
        notify('Telegram sync required for ranked submission. Run /gklink in @WIKICOMSBOT. Unsynced runs stay local.');
      }
      return;
    }
    await autoSubmit();
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
    if (timerEl) timerEl.textContent = '—';
    if (scoreEl) scoreEl.textContent = '—';
    setStatus('RUN READY');
    if (startBtn) startBtn.disabled = false;
    if (submitBtn) {
      submitBtn.textContent = '📤 Submit Run';
      submitBtn.disabled = true;
    }
    notify('Loading HexGL…');
  }

  function init() {
    refreshIdentity();
    setStatus('RUN READY');
    if (submitBtn) {
      submitBtn.textContent = '📤 Submit Run';
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
        setOverlayStartLabel('🔄', 'Retry');
        setOverlayStartEnabled(true);
      });
    }
    window.addEventListener('message', onHexGLMessage);
    document.addEventListener('arcade-overlay-exit', function () {
      playUiTone('exit');
      // Stop wrapper timer if running (cleanup only — do NOT promote wrapper
      // time to completedRunMs; score only comes from a postMessage event).
      stopRunAndCapture();
      // Retry auto-submit on overlay exit if there is an unsent valid completed run.
      if (completedRunMs && !completedScoreSubmitted) {
        if (window.MOONBOYS_IDENTITY?.isTelegramLinked?.()) {
          autoSubmit().catch(function (err) {
            console.error('[hexgl] exit auto-submit failed:', err);
          });
        }
      }
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
    if (typeof completedRunMs === 'number') return calcScore(completedRunMs);
    if (runActive && runStart !== null) return calcScore(Date.now() - runStart);
    return 0;
  }

  return { init, start, pause, resume, reset, destroy, getScore };
}
