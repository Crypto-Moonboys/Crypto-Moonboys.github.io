import { ArcadeSync }                from '/js/arcade-sync.js';
import { submitScore, fetchLeaderboard } from '/js/leaderboard-client.js';
import { HEXGL_MONSTER_MAX_CONFIG }  from './config.js';
import { GameRegistry }              from '/js/arcade/core/game-registry.js';

GameRegistry.register(HEXGL_MONSTER_MAX_CONFIG.id, {
  label: HEXGL_MONSTER_MAX_CONFIG.label,
  bootstrap: bootstrapHexGLMonsterMax,
});

export function bootstrapHexGLMonsterMax(root) {
  // ── DESIGN INVARIANTS — do not remove or drift from these ─────────────────
  // 1. DIRECT START VIA HOOK: the overlay must never re-click #startBtn to start
  //    a run.  Instead, init() exposes window.__hexglStartHook = onStart so the
  //    overlay can call onStart() directly, bypassing the DOM event chain.
  //    data-overlay-autostart must NOT be set on startBtn in the HTML.
  // 2. TIMER STARTS ONLY AFTER GO: runActive=true is set inside the GO callback
  //    in activateRun(), never before.  Do not hoist the timer activation.
  // 3. RESET CANCELS ALL DELAYED PATHS: onReset() increments runToken and clears
  //    all timeouts.  Every async callback checks the token before acting — if the
  //    token has changed, the callback is a no-op.  countdownActive also blocks
  //    a duplicate activateRun() call if the iframe load event fires late.
  // 4. NO PAUSE: HexGL has no #pauseBtn.  Pause is intentionally unsupported for
  //    this iframe-based game.  Do not reintroduce it.
  // ──────────────────────────────────────────────────────────────────────────
  var MIN_RUN_MS = HEXGL_MONSTER_MAX_CONFIG.minRunMs;
  // 470000 corresponds to a 30-second run under score = 500000 - (seconds * 1000).
  var PERFECT_RUN_SCORE = 470000;
  var FRAME_SRC = 'https://hexgl.bkcore.com/play/';
  var LOAD_FALLBACK_MS = 4000; // iframe load can be slow on first visit; 4 s is enough to show a loading state before starting countdown
  var COUNTDOWN_TICK_MS  = 700;  // duration each countdown number is shown
  var COUNTDOWN_GO_MS    = 600;  // how long GO is shown before timer starts

  var frameEl       = document.getElementById('hexgl-frame');
  var pilotEl       = document.getElementById('pilot-name');
  var timerEl       = document.getElementById('run-timer');
  var scoreEl       = document.getElementById('est-score');
  var statusEl      = document.getElementById('run-status');
  var runActiveEl   = document.getElementById('run-active-indicator');
  var deltaEl       = document.getElementById('delta-best');
  var perfectEl     = document.getElementById('perfect-run');
  var rivalBlock    = document.getElementById('rival-block');
  var rivalNameEl   = document.getElementById('rival-name');
  var rivalTimeEl   = document.getElementById('rival-time');
  var topPlayerEl   = document.getElementById('top-player');
  var rankEl        = document.getElementById('your-rank');
  var totalScoreEl  = document.getElementById('total-arcade-score');
  var gamesPlayedEl = document.getElementById('games-played');
  var lastRunEl     = document.getElementById('last-run');
  var startBtn      = document.getElementById('startBtn');
  var submitBtn     = document.getElementById('submit-btn');
  var resetBtn      = document.getElementById('resetBtn');
  var inlineMessageEl = document.getElementById('hexgl-inline-message');
  var countdownEl   = document.getElementById('hexgl-countdown');

  var playerName = 'Guest';
  var runStart   = null;
  var runActive  = false;
  var runPending = false;
  var countdownActive = false;  // true while READY/3/2/1/GO sequence is running
  var intervalId = null;
  var readyTimeoutId = null;
  var loadFallbackTimeoutId = null;
  var runToken = 0;
  var frameLoaded = false;
  var lastRunMs  = null;
  var bestRunMs  = null;
  var statusText = 'RUN READY';
  var audioCtx = null;
  var ambientOsc = null;
  var ambientGain = null;
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
    clearTimeout(loadFallbackTimeoutId);
    readyTimeoutId = null;
    loadFallbackTimeoutId = null;
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
    return typeof window !== 'undefined' && !window._arcadeMuted;
  }

  function ensureAudioContext() {
    if (!canUseAudio()) return null;
    if (audioCtx) return audioCtx;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    } catch (_) {
      audioCtx = null;
    }
    return audioCtx;
  }

  function unlockAudio() {
    var ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
  }

  function playUiTone(kind) {
    if (!canUseAudio()) return;
    unlockAudio();
    if (!audioCtx || audioCtx.state !== 'running') return;
    var now = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    var conf = {
      start: 440,
      end: 660,
      duration: 0.09,
      type: 'triangle',
      volume: 0.05,
    };
    if (kind === 'reset') {
      conf.start = 300;
      conf.end = 170;
      conf.duration = 0.12;
      conf.type = 'sawtooth';
      conf.volume = 0.04;
    } else if (kind === 'submit') {
      conf.start = 620;
      conf.end = 880;
      conf.duration = 0.12;
      conf.type = 'sine';
      conf.volume = 0.06;
    } else if (kind === 'error') {
      conf.start = 320;
      conf.end = 180;
      conf.duration = 0.14;
      conf.type = 'sawtooth';
      conf.volume = 0.04;
    } else if (kind === 'exit') {
      conf.start = 520;
      conf.end = 300;
      conf.duration = 0.10;
      conf.type = 'triangle';
      conf.volume = 0.04;
    }
    osc.type = conf.type;
    osc.frequency.setValueAtTime(conf.start, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(50, conf.end), now + conf.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(conf.volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + conf.duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + conf.duration + 0.02);
  }

  function stopAmbient() {
    if (ambientOsc) {
      try {
        ambientOsc.stop();
      } catch (_) {}
      try {
        ambientOsc.disconnect();
      } catch (_) {}
      ambientOsc = null;
    }
    if (ambientGain) {
      try {
        ambientGain.disconnect();
      } catch (_) {}
      ambientGain = null;
    }
  }

  function syncAmbient() {
    if (!canUseAudio() || runActive || !runPending) {
      stopAmbient();
      return;
    }
    unlockAudio();
    if (!audioCtx || audioCtx.state !== 'running' || ambientOsc) return;
    ambientOsc = audioCtx.createOscillator();
    ambientGain = audioCtx.createGain();
    ambientOsc.type = 'sine';
    ambientOsc.frequency.value = 82;
    ambientGain.gain.value = 0.006;
    ambientOsc.connect(ambientGain);
    ambientGain.connect(audioCtx.destination);
    ambientOsc.start();
  }

  // noteIdx 0 = for "3", 1 = for "2", 2 = for "1" — rising pitch sequence.
  function playCountdownTick(noteIdx) {
    if (!canUseAudio()) return;
    unlockAudio();
    if (!audioCtx || audioCtx.state !== 'running') return;
    var freqs = [380, 480, 600];
    var freq = noteIdx >= 0 && noteIdx < freqs.length ? freqs[noteIdx] : freqs[0];
    var now = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.032, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  function playGoChord() {
    if (!canUseAudio()) return;
    unlockAudio();
    if (!audioCtx || audioCtx.state !== 'running') return;
    var now = audioCtx.currentTime;
    [880, 1108, 1320].forEach(function (freq, i) {
      var osc  = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      var t0 = now + i * 0.022;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(t0 + 0.24);
    });
  }

  function refreshIdentity() {
    playerName = getPlayerName();
    if (pilotEl) pilotEl.textContent = playerName;
  }

  function updateRunUI(ms) {
    var score = calcScore(ms);
    if (timerEl) timerEl.textContent = fmtTime(ms);
    if (scoreEl) scoreEl.textContent = score.toLocaleString();
    if (runActiveEl) runActiveEl.style.display = runActive ? '' : 'none';
    if (perfectEl) perfectEl.style.display = score >= PERFECT_RUN_SCORE ? '' : 'none';
    if (deltaEl) {
      if (typeof bestRunMs !== 'number') {
        deltaEl.textContent = '—';
      } else {
        var delta = (ms - bestRunMs) / 1000;
        deltaEl.textContent = (delta <= 0 ? '-' : '+') + Math.abs(delta).toFixed(2) + 's';
      }
    }
  }

  function activateRun(token) {
    if (token !== runToken || !runPending || countdownActive || runActive) return;
    countdownActive = true;
    clearTimeout(loadFallbackTimeoutId);
    loadFallbackTimeoutId = null;
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

  function loadRival() {
    try {
      var stored = localStorage.getItem('hexgl_best_run');
      if (!stored) return;
      var data = JSON.parse(stored);
      if (!data || typeof data.ms !== 'number') return;
      bestRunMs = data.ms;
      if (rivalBlock) rivalBlock.style.display = '';
      if (rivalNameEl) rivalNameEl.textContent = data.name || 'You';
      if (rivalTimeEl) rivalTimeEl.textContent = fmtTime(data.ms);
    } catch (_) {}
  }

  function savePersonalBest(ms) {
    try {
      var current = JSON.parse(localStorage.getItem('hexgl_best_run') || 'null');
      if (!current || ms < current.ms) {
        localStorage.setItem('hexgl_best_run', JSON.stringify({ ms: ms, name: playerName }));
      }
    } catch (_) {}
    loadRival();
  }

  function updateCrossGameStats() {
    try {
      if (lastRunEl) {
        lastRunEl.textContent = (typeof lastRunMs === 'number') ? fmtTime(lastRunMs) : '—';
      }
      fetchLeaderboard('global').then(function (rows) {
        if (!Array.isArray(rows) || !rows.length) return;
        if (topPlayerEl) topPlayerEl.textContent = rows[0].player || '—';
        var playerKey = String(playerName || '').toLowerCase();
        var me = rows.find(function (row) {
          return String(row.player || '').toLowerCase() === playerKey;
        });
        if (!me) return;
        if (rankEl) rankEl.textContent = '#' + String(me.rank || '—');
        if (totalScoreEl) totalScoreEl.textContent = Number(me.score || 0).toLocaleString();
        if (gamesPlayedEl) {
          var b = me.breakdown || {};
          var played = Object.keys(b).filter(function (k) {
            return k !== 'variety_bonus' && Number(b[k] || 0) > 0;
          }).length;
          gamesPlayedEl.textContent = String(played);
        }
      }).catch(function (err) {
        console.warn('[hexgl-monster-max] fetchLeaderboard failed:', err);
      });
    } catch (err) {
      console.warn('[hexgl-monster-max] updateCrossGameStats error:', err);
    }
  }

  function onStart() {
    // Single start path: called only from the ▶ Start button click handler.
    // Do NOT call this from overlay-open or any auto-trigger.
    refreshIdentity();
    unlockAudio();
    playUiTone('start');
    runToken += 1;
    runActive = false;
    runPending = true;
    countdownActive = false;
    runStart = null;
    lastRunMs = null;
    clearRunDelays();
    hideCountdown();
    if (startBtn) startBtn.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
    if (submitBtn) submitBtn.textContent = '📤 Submit Run';
    stopTimer();
    if (timerEl) timerEl.textContent = '—';
    if (scoreEl) scoreEl.textContent = '—';
    if (deltaEl) deltaEl.textContent = '—';
    if (runActiveEl) runActiveEl.style.display = 'none';
    if (perfectEl) perfectEl.style.display = 'none';
    setStatus('LOADING');
    notify('');
    syncAmbient();
    var needsFrameReload = !frameLoaded || isFrameBlank();
    if (needsFrameReload && frameEl) {
      frameLoaded = false;
      frameEl.classList.remove('loaded');
      frameEl.src = FRAME_SRC + '?run=' + Date.now();
      loadFallbackTimeoutId = setTimeout(function () {
        activateRun(runToken);
      }, LOAD_FALLBACK_MS);
      return;
    }
    activateRun(runToken);
  }

  async function onSubmit() {
    unlockAudio();
    if (runPending || countdownActive) {
      playUiTone('error');
      notify('Run is still loading. Wait for RUN ACTIVE.');
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
      setStatus('RUN READY');
      notify('Complete a valid run first (minimum 30 seconds).');
      return;
    }
    var score = calcScore(lastRunMs);
    if (score <= 0) {
      playUiTone('error');
      if (startBtn) startBtn.disabled = false;
      setStatus('RUN READY');
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
        notify('Telegram link required for ranked leaderboard submission. Guest runs stay local.');
      }
      if (startBtn) startBtn.disabled = false;
      setStatus('RUN READY');
      updateCrossGameStats();
      return;
    }

    await submitScore(playerName, score, HEXGL_MONSTER_MAX_CONFIG.id);
    if (submitBtn) {
      submitBtn.textContent = '✅ Submitted';
      submitBtn.disabled = true;
    }
    if (startBtn) startBtn.disabled = false;
    setStatus('SUBMITTED');
    updateCrossGameStats();
  }

  function onReset() {
    // Hard cancel: incrementing runToken invalidates every in-flight async
    // callback (load fallback, countdown steps, GO timer) — they all check
    // the token and bail if it has changed.  This is the single cancel path.
    unlockAudio();
    playUiTone('reset');
    runToken += 1;
    clearRunDelays();
    stopTimer();
    runStart = null;
    runActive = false;
    runPending = false;
    countdownActive = false;
    frameLoaded = false;
    lastRunMs = null;
    stopAmbient();
    hideCountdown();
    if (frameEl) {
      frameEl.classList.remove('loaded');
      frameEl.src = '';
    }
    if (timerEl) timerEl.textContent = '—';
    if (scoreEl) scoreEl.textContent = '—';
    if (deltaEl) deltaEl.textContent = '—';
    setStatus('RUN READY');
    if (runActiveEl) runActiveEl.style.display = 'none';
    if (perfectEl) perfectEl.style.display = 'none';
    if (startBtn) startBtn.disabled = false;
    if (submitBtn) {
      submitBtn.textContent = '📤 Submit Run';
      submitBtn.disabled = false;
    }
    notify('');
    updateCrossGameStats();
  }

  function init() {
    refreshIdentity();
    loadRival();
    updateCrossGameStats();
    frameLoaded = !isFrameBlank();
    if (frameEl) {
      frameEl.addEventListener('load', function () {
        if (isFrameBlank()) return;
        frameLoaded = true;
        frameEl.classList.add('loaded');
        // Only activate if a run is pending and the countdown has not already started
        // (the load event can fire after the 4 s fallback has already kicked off the countdown).
        if (runPending && !countdownActive) activateRun(runToken);
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
        onReset(); // plays reset tone; the run is cleanly cancelled
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
    setStatus(statusText);
  }

  function start()  { onStart(); }
  function pause()  {}
  function resume() {}
  function reset()  { onReset(); }

  function destroy() {
    runToken += 1;
    clearRunDelays();
    stopTimer();
    stopAmbient();
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
    // Clear the global hook so a future page-load doesn't call a stale closure.
    window.__hexglStartHook = null;
  }

  function getScore() {
    if (typeof lastRunMs === 'number') return calcScore(lastRunMs);
    if (runActive && runStart !== null) return calcScore(Date.now() - runStart);
    return 0;
  }

  return { init, start, pause, resume, reset, destroy, getScore };
}
