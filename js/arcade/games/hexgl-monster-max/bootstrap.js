import { ArcadeSync }       from '/js/arcade-sync.js';
import { submitScore }      from '/js/leaderboard-client.js';
import { HEXGL_MONSTER_MAX_CONFIG }  from './config.js';
import { GameRegistry }              from '/js/arcade/core/game-registry.js';
import { playSound, isMuted, stopAllSounds } from '/js/arcade/core/audio.js';

GameRegistry.register(HEXGL_MONSTER_MAX_CONFIG.id, {
  label: HEXGL_MONSTER_MAX_CONFIG.label,
  bootstrap: bootstrapHexGLMonsterMax,
});

export function bootstrapHexGLMonsterMax(root) {
  // ── DESIGN INVARIANTS — do not remove or drift from these ─────────────────
  // 1. TWO-PHASE START — NO AUTO-RUN:
  //    activateRun() MUST ONLY be called from Phase 2 of onStart(), which is
  //    reached only after the user has explicitly clicked "Begin Run" TWICE:
  //      Phase 1 (first click): arms the run, changes ctrl button to "Start Timer".
  //                             No countdown, no timer.
  //      Phase 2 (second click): user confirms they are actually racing in HexGL.
  //                              activateRun() fires here and NOWHERE ELSE.
  //    DO NOT call activateRun() from iframe load, timeout, or any auto path.
  // 2. TIMER STARTS ONLY AFTER GO: runActive=true is set inside the GO callback
  //    in activateRun(), never before.  Do not hoist the timer activation.
  // 3. RESET CANCELS ALL ASYNC PATHS: onReset() increments runToken and clears
  //    all timeouts, resets runArmed, and restores the ctrl button label.
  //    Every async callback checks the token and bails if it has changed.
  // 4. NO PAUSE: HexGL has no #pauseBtn.  Pause is intentionally unsupported for
  //    this iframe-based game.  Do not reintroduce it.
  // ──────────────────────────────────────────────────────────────────────────
  var MIN_RUN_MS = HEXGL_MONSTER_MAX_CONFIG.minRunMs;
  var FRAME_SRC = 'https://hexgl.bkcore.com/play/';
  var COUNTDOWN_TICK_MS  = 700;  // duration each countdown number is shown
  var COUNTDOWN_GO_MS    = 600;  // how long GO is shown before timer starts

  var frameEl       = document.getElementById('hexgl-frame');
  var pilotEl       = document.getElementById('pilot-name');
  var timerEl       = document.getElementById('run-timer');
  var scoreEl       = document.getElementById('est-score');
  var statusEl      = document.getElementById('run-status');
  var startBtn      = document.getElementById('startBtn');
  var submitBtn     = document.getElementById('submit-btn');
  var resetBtn      = document.getElementById('resetBtn');
  var inlineMessageEl = document.getElementById('hexgl-inline-message');
  var countdownEl   = document.getElementById('hexgl-countdown');

  var playerName = 'Guest';
  var runStart   = null;
  var runActive  = false;
  var runPending = false;
  var runArmed   = false;  // true between Phase 1 and Phase 2 of onStart() — no countdown yet
  var countdownActive = false;  // true while READY/3/2/1/GO sequence is running
  var intervalId = null;
  var readyTimeoutId = null;
  var runToken = 0;
  var frameLoaded = false;
  var lastRunMs  = null;
  var statusText = 'RUN READY';
  var ambientHandle = null;
  var messageTimeoutId = null;

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

  function clearRunDelays() {
    clearTimeout(readyTimeoutId);
    readyTimeoutId = null;
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

  function showCountdown(text, isGo) {
    if (!countdownEl) return;
    countdownEl.classList.remove('visible', 'go');
    // Force reflow so the transition re-fires for each step.
    void countdownEl.offsetWidth;
    countdownEl.textContent = text;
    if (isGo) countdownEl.classList.add('go');
    countdownEl.classList.add('visible');
  }

  function hideCountdown() {
    if (!countdownEl) return;
    countdownEl.classList.remove('visible', 'go');
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
      start: 'hexgl-start',
      reset: 'hexgl-reset',
      submit: 'hexgl-submit',
      error: 'hexgl-error',
      exit: 'hexgl-exit',
    }[kind] || 'hexgl-start';
    playSound(soundId);
  }

  function stopAmbient() {
    if (!ambientHandle) return;
    try {
      ambientHandle.stop();
    } catch (_) {}
    ambientHandle = null;
  }

  function syncAmbient() {
    if (!canUseAudio() || runActive || !runPending) {
      stopAmbient();
      return;
    }
    if (ambientHandle) return;
    ambientHandle = playSound('hexgl-ambient');
  }

  // noteIdx 0 = for "3", 1 = for "2", 2 = for "1" — rising pitch sequence.
  function playCountdownTick(noteIdx) {
    if (!canUseAudio()) return;
    var idx = noteIdx >= 0 && noteIdx < 3 ? noteIdx + 1 : 1;
    playSound('hexgl-countdown-' + idx);
  }

  function playGoChord() {
    if (!canUseAudio()) return;
    playSound('hexgl-go');
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

  function activateRun(token) {
    if (token !== runToken || !runPending || countdownActive || runActive) return;
    countdownActive = true;
    setStatus('COUNTDOWN');
    // Start ambient drone during countdown (only if audio context is now running).
    syncAmbient();

    // READY → 3 → 2 → 1 → GO sequence.
    var steps  = ['READY', '3', '2', '1'];
    var idx    = 0;

    function tick() {
      if (token !== runToken || !runPending) {
        countdownActive = false;
        hideCountdown();
        return;
      }
      if (idx < steps.length) {
        showCountdown(steps[idx], false);
        if (idx > 0) playCountdownTick(idx - 1); // step '3'→noteIdx 0, '2'→1, '1'→2
        idx++;
        readyTimeoutId = setTimeout(tick, COUNTDOWN_TICK_MS);
      } else {
        // Show GO.
        showCountdown('GO', true);
        stopAmbient();
        playGoChord();
        readyTimeoutId = setTimeout(function () {
          if (token !== runToken || !runPending) {
            countdownActive = false;
            hideCountdown();
            return;
          }
          // Timer starts ONLY here — after GO completes — never before.
          countdownActive = false;
          hideCountdown();
          runPending = false;
          runActive  = true;
          runStart   = Date.now();
          setStatus('RUN ACTIVE');
          stopTimer();
          intervalId = setInterval(function () {
            updateRunUI(Date.now() - runStart);
          }, 100);
          updateRunUI(0);
          if (submitBtn) submitBtn.disabled = false;
        }, COUNTDOWN_GO_MS);
      }
    }

    tick();
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

  function resetOverlayStartLabel() {
    setOverlayStartLabel('🏁', 'Begin Run');
  }

  function notifyReadyToLaunch() {
    setStatus('READY TO LAUNCH');
    notify('HexGL loaded. Click Begin Run, enter the race, then click Start Timer.');
    resetOverlayStartLabel();
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

  function cancelTrackedRun() {
    runArmed = false;
    resetOverlayStartLabel();
    runToken += 1;
    clearRunDelays();
    stopTimer();
    runStart = null;
    runActive = false;
    runPending = false;
    countdownActive = false;
    stopAmbient();
    hideCountdown();
  }

  function onOverlayOpen() {
    if (runActive || runPending || countdownActive) return;
    loadFrameForLaunch(false);
  }

  function savePersonalBest(ms) {
    try {
      var current = JSON.parse(localStorage.getItem('hexgl_best_run') || 'null');
      if (!current || ms < current.ms) {
        localStorage.setItem('hexgl_best_run', JSON.stringify({ ms: ms, name: playerName }));
      }
    } catch (_) {}
  }

  function onStart() {
    // Phase 0: frame not yet loaded — load it and wait.
    // Phase 1 (first explicit click, frame loaded): arm the run.
    //          Status → RACE LOADED. Button → "Start Timer". No countdown.
    //          User must now enter the race inside HexGL.
    // Phase 2 (second explicit click): user confirms they are racing.
    //          activateRun() is called HERE and ONLY HERE.
    refreshIdentity();

    if (!frameLoaded || isFrameBlank()) {
      loadFrameForLaunch(false);
      return;
    }
    if (runActive || runPending || countdownActive) return;

    if (!runArmed) {
      // ── Phase 1: arm ──────────────────────────────────────────────────────
      runArmed = true;
      playUiTone('start');
      setStatus('RACE LOADED');
      notify('Now enter the race in HexGL. When racing, click Start Timer.');
      setOverlayStartLabel('⏱', 'Start Timer');
      return;
    }

    // ── Phase 2: user confirms they are in the race ────────────────────────
    // activateRun() is the ONLY call site in this file.
    runArmed = false;
    resetOverlayStartLabel();
    playUiTone('start');
    runToken += 1;
    clearRunDelays();
    stopTimer();
    hideCountdown();
    stopAmbient();
    runActive = false;
    runPending = true;
    countdownActive = false;
    runStart = null;
    lastRunMs = null;
    setOverlayStartEnabled(false);
    if (submitBtn) submitBtn.disabled = true;
    if (submitBtn) submitBtn.textContent = '📤 Submit Run';
    if (timerEl) timerEl.textContent = '—';
    if (scoreEl) scoreEl.textContent = '—';
    notify('');
    syncAmbient();
    activateRun(runToken);
  }

  async function onSubmit() {
    if (runPending || countdownActive) {
      playUiTone('error');
      notify('Run countdown is active. Wait for RUN ACTIVE.');
      return;
    }
    if (runActive) {
      runActive = false;
      lastRunMs = Date.now() - runStart;
      stopTimer();
      setStatus('RUN COMPLETE');
      syncAmbient();
    }
    if (typeof lastRunMs !== 'number' || lastRunMs < MIN_RUN_MS) {
      playUiTone('error');
      if (startBtn) startBtn.disabled = false;
      resetOverlayStartLabel();
      setStatus('READY TO LAUNCH');
      setOverlayStartEnabled(true);
      notify('Complete a valid run first (minimum 30 seconds).');
      return;
    }
    var score = calcScore(lastRunMs);
    if (score <= 0) {
      playUiTone('error');
      if (startBtn) startBtn.disabled = false;
      resetOverlayStartLabel();
      setStatus('READY TO LAUNCH');
      setOverlayStartEnabled(true);
      notify('Run is too slow to qualify for leaderboard submission.');
      return;
    }
    playUiTone('submit');
    updateRunUI(lastRunMs);
    savePersonalBest(lastRunMs);
    localStorage.setItem('hexgl_last_run_ms', String(lastRunMs));

    if (!window.MOONBOYS_IDENTITY?.isTelegramLinked?.()) {
      if (window.MOONBOYS_IDENTITY?.showSyncGateModal) {
        window.MOONBOYS_IDENTITY.showSyncGateModal(true);
      } else {
        notify('Telegram sync required for ranked submission. Run /gklink in @WIKICOMSBOT. Unsynced runs stay local.');
      }
      if (startBtn) startBtn.disabled = false;
      resetOverlayStartLabel();
      setStatus('READY TO LAUNCH');
      setOverlayStartEnabled(true);
      return;
    }

    await submitScore(playerName, score, HEXGL_MONSTER_MAX_CONFIG.id);
    if (submitBtn) {
      submitBtn.textContent = '✅ Submitted';
      submitBtn.disabled = true;
    }
    if (startBtn) startBtn.disabled = false;
    resetOverlayStartLabel();
    setStatus('SUBMITTED');
  }

  function onReset() {
    playUiTone('reset');
    cancelTrackedRun();   // clears runArmed, resets ctrl button label, cancels token
    lastRunMs = null;
    frameLoaded = false;
    setOverlayStartEnabled(false);
    if (frameEl) {
      frameEl.classList.remove('loaded');
      frameEl.src = FRAME_SRC + '?t=' + Date.now();
    }
    if (timerEl) timerEl.textContent = '—';
    if (scoreEl) scoreEl.textContent = '—';
    setStatus('LOADING');
    if (startBtn) startBtn.disabled = false;
    if (submitBtn) {
      submitBtn.textContent = '📤 Submit Run';
      submitBtn.disabled = true;
    }
    notify('Loading HexGL…');
  }

  function init() {
    refreshIdentity();
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
        if (!runPending && !countdownActive && !runActive) {
          notifyReadyToLaunch();
        }
      });
    }
    document.addEventListener('arcade-mute-change', function () {
      syncAmbient();
    });
    document.addEventListener('arcade-overlay-exit', function () {
      // When the overlay is closed while a run is in flight, reset everything
      // so there is no ghost timer running silently in the background.
      // If no run is active, just play the exit tone.
      if (runActive || runPending || countdownActive) {
        cancelTrackedRun();
        playUiTone('exit');
        if (submitBtn) {
          submitBtn.textContent = '📤 Submit Run';
          submitBtn.disabled = true;
        }
        if (frameLoaded && !isFrameBlank()) {
          setStatus('READY TO LAUNCH');
          setOverlayStartEnabled(true);
        } else {
          setStatus('LOADING');
          setOverlayStartEnabled(false);
        }
        notify('');
      } else {
        playUiTone('exit');
      }
    });
    if (startBtn) startBtn.addEventListener('click', onStart);
    if (submitBtn) submitBtn.addEventListener('click', onSubmit);
    if (resetBtn) resetBtn.addEventListener('click', onReset);
    // Expose a direct-call hook so the overlay can invoke onStart() without
    // going through the DOM click path (avoids event-listener races).
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
    runArmed = false;
    clearRunDelays();
    stopTimer();
    stopAmbient();
    stopAllSounds();
    countdownActive = false;
    hideCountdown();
    clearTimeout(messageTimeoutId);
    notify('');
    if (frameEl) {
      frameEl.classList.remove('loaded');
      frameEl.src = '';
    }
    if (startBtn) startBtn.removeEventListener('click', onStart);
    if (submitBtn) submitBtn.removeEventListener('click', onSubmit);
    if (resetBtn) resetBtn.removeEventListener('click', onReset);
    // Clear the global hooks so a future page-load doesn't call a stale closure.
    delete window.__hexglStartHook;
    delete window.__hexglOverlayOpenHook;
  }

  function getScore() {
    if (typeof lastRunMs === 'number') return calcScore(lastRunMs);
    if (runActive && runStart !== null) return calcScore(Date.now() - runStart);
    return 0;
  }

  return { init, start, pause, resume, reset, destroy, getScore };
}
