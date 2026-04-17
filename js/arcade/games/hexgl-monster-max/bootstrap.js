import { ArcadeSync }                from '/js/arcade-sync.js';
import { submitScore, fetchLeaderboard } from '/js/leaderboard-client.js';
import { HEXGL_MONSTER_MAX_CONFIG }  from './config.js';
import { GameRegistry }              from '/js/arcade/core/game-registry.js';

GameRegistry.register(HEXGL_MONSTER_MAX_CONFIG.id, {
  label: HEXGL_MONSTER_MAX_CONFIG.label,
  bootstrap: bootstrapHexGLMonsterMax,
});

export function bootstrapHexGLMonsterMax(root) {
  var MIN_RUN_MS = HEXGL_MONSTER_MAX_CONFIG.minRunMs;
  // 470000 corresponds to a 30-second run under score = 500000 - (seconds * 1000).
  var PERFECT_RUN_SCORE = 470000;
  var FRAME_SRC = 'https://hexgl.bkcore.com/play/';

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

  var playerName = 'Guest';
  var runStart   = null;
  var runActive  = false;
  var intervalId = null;
  var lastRunMs  = null;
  var bestRunMs  = null;

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

  function refreshIdentity() {
    playerName = getPlayerName();
    if (pilotEl) pilotEl.textContent = playerName;
  }

  function updateRunUI(ms) {
    var score = calcScore(ms);
    if (timerEl) timerEl.textContent = fmtTime(ms);
    if (scoreEl) scoreEl.textContent = score.toLocaleString();
    if (statusEl) statusEl.textContent = runActive ? 'RUN ACTIVE' : 'RUN READY';
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
      }).catch(function () {});
    } catch (_) {}
  }

  function onStart() {
    refreshIdentity();
    // Force a clean iframe reload each run.
    if (frameEl) frameEl.src = FRAME_SRC + '?run=' + Date.now();
    runStart = Date.now();
    runActive = true;
    lastRunMs = null;
    if (startBtn) startBtn.disabled = true;
    if (submitBtn) submitBtn.disabled = false;
    if (submitBtn) submitBtn.textContent = '📤 Submit Run';
    stopTimer();
    intervalId = setInterval(function () {
      updateRunUI(Date.now() - runStart);
    }, 100);
    updateRunUI(0);
  }

  async function onSubmit() {
    if (runActive) {
      runActive = false;
      lastRunMs = Date.now() - runStart;
      stopTimer();
    }
    if (typeof lastRunMs !== 'number' || lastRunMs < MIN_RUN_MS) {
      alert('Complete a valid run first (minimum 30 seconds).');
      return;
    }
    var score = calcScore(lastRunMs);
    if (score <= 0) {
      alert('Run is too slow to qualify for leaderboard submission.');
      return;
    }
    updateRunUI(lastRunMs);
    savePersonalBest(lastRunMs);
    localStorage.setItem('hexgl_last_run_ms', String(lastRunMs));

    if (!window.MOONBOYS_IDENTITY?.isTelegramLinked?.()) {
      if (window.MOONBOYS_IDENTITY?.showSyncGateModal) {
        window.MOONBOYS_IDENTITY.showSyncGateModal(true);
      } else {
        alert('Telegram link required for ranked leaderboard submission. Guest runs stay local.');
      }
      updateCrossGameStats();
      return;
    }

    await submitScore(playerName, score, HEXGL_MONSTER_MAX_CONFIG.id);
    if (submitBtn) {
      submitBtn.textContent = '✅ Submitted';
      submitBtn.disabled = true;
    }
    if (startBtn) startBtn.disabled = false;
    updateCrossGameStats();
  }

  function onReset() {
    stopTimer();
    runStart = null;
    runActive = false;
    lastRunMs = null;
    if (frameEl) frameEl.src = '';
    if (timerEl) timerEl.textContent = '—';
    if (scoreEl) scoreEl.textContent = '—';
    if (deltaEl) deltaEl.textContent = '—';
    if (statusEl) statusEl.textContent = 'RUN READY';
    if (runActiveEl) runActiveEl.style.display = 'none';
    if (perfectEl) perfectEl.style.display = 'none';
    if (startBtn) startBtn.disabled = false;
    if (submitBtn) {
      submitBtn.textContent = '📤 Submit Run';
      submitBtn.disabled = false;
    }
    updateCrossGameStats();
  }

  function init() {
    refreshIdentity();
    loadRival();
    updateCrossGameStats();
    if (startBtn) startBtn.addEventListener('click', onStart);
    if (submitBtn) submitBtn.addEventListener('click', onSubmit);
    if (resetBtn) resetBtn.addEventListener('click', onReset);
  }

  function start()  { onStart(); }
  function pause()  {}
  function resume() {}
  function reset()  { onReset(); }

  function destroy() {
    stopTimer();
    if (frameEl) frameEl.src = '';
    if (startBtn) startBtn.removeEventListener('click', onStart);
    if (submitBtn) submitBtn.removeEventListener('click', onSubmit);
    if (resetBtn) resetBtn.removeEventListener('click', onReset);
  }

  function getScore() {
    if (typeof lastRunMs === 'number') return calcScore(lastRunMs);
    if (runActive && runStart !== null) return calcScore(Date.now() - runStart);
    return 0;
  }

  return { init, start, pause, resume, reset, destroy, getScore };
}
