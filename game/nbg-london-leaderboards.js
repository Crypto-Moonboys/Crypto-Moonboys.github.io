/* NBG London: public all-time records, authenticated Telegram submissions only. */
(function () {
  'use strict';

  var METRICS = {
    fastest: { title: 'Fastest Time', value: function (row) { return formatTime(row.time_ms); } },
    speed_xp: { title: 'Fastest + XP', value: function (row) { return Number(row.value || 0).toLocaleString() + ' XP/min'; } },
    xp: { title: 'Highest XP', value: function (row) { return Number(row.xp || 0).toLocaleString() + ' XP'; } }
  };
  var metric = 'fastest';
  var competitionPeriod = 'daily';
  var prizeRows = null;
  var prizeRequestNumber = 0;
  var identityRequestNumber = 0;
  var generation = 0;
  var runPromise = null;
  // The Worker invalidates unfinished sessions per Telegram owner, so only
  // starts for the SAME owner need ordering. Do not stall a newly linked owner.
  var serverStartQueues = new Map();
  // A failed fetch may have reached the Worker and still be committing in D1.
  // Until a page reload, that owner must use practice rather than race a new
  // official session against an unknown older request.
  var uncertainStartOwners = new Set();
  var runIdentity = null;
  var preparedStartGeneration = -1;
  var status = null;
  var tableBody = null;
  var account = null;
  var personal = null;

  function formatTime(ms) {
    if (!Number.isFinite(Number(ms))) return '—';
    var seconds = Math.floor(Number(ms) / 1000);
    return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' +
      String(seconds % 60).padStart(2, '0') + '.' +
      String(Math.floor((Number(ms) % 1000) / 10)).padStart(2, '0');
  }

  function apiBase() {
    var cfg = window.MOONBOYS_API;
    var url = cfg && typeof cfg.getLeaderboardUrl === 'function' ? cfg.getLeaderboardUrl() : null;
    return typeof url === 'string' && /^https:\/\//.test(url) ? url.replace(/\/$/, '') : null;
  }

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function displayIdentity() {
    var gate = window.MOONBOYS_IDENTITY;
    var linked = !!(gate && typeof gate.isTelegramLinked === 'function' && gate.isTelegramLinked());
    // Cached local display names are not authoritative Telegram usernames.
    if (account) account.textContent = linked ? 'Telegram linked — verifying username…' : 'Guest — scores are not saved';
    var hudName = document.getElementById('nbg-hud-player');
    if (hudName) hudName.textContent = linked ? 'TELEGRAM' : 'GUEST';
    return linked;
  }

  async function signedAuth() {
    var gate = window.MOONBOYS_IDENTITY;
    if (!gate || !displayIdentity() || typeof gate.getFreshTelegramAuth !== 'function') return null;
    var auth = await gate.getFreshTelegramAuth();
    return auth && auth.id && auth.hash && auth.auth_date ? auth : null;
  }

  async function callJson(path, data) {
    var base = apiBase();
    if (!base) throw new Error('Leaderboard API unavailable in this environment');
    var response;
    try {
      response = await fetch(base + '/nbg-london' + path, {
        method: data ? 'POST' : 'GET',
        headers: data ? { 'Content-Type': 'application/json' } : {},
        body: data ? JSON.stringify(data) : undefined,
        cache: 'no-store'
      });
    } catch (error) {
      // HTTP error responses prove that processing has returned, but a fetch
      // rejection does NOT prove a start POST was never committed by the Worker.
      if (path === '/run/start') {
        var uncertain = new Error('start_request_outcome_unknown');
        uncertain.uncertainStart = true;
        throw uncertain;
      }
      throw error;
    }
    var result = await response.json().catch(function () { return null; });
    if (!response.ok || !result || !result.ok)
      throw new Error(result && result.error ? result.error : 'Leaderboard request failed');
    return result;
  }

  async function loadPrizeStandings() {
    if (!prizeRows) return;
    var requested = competitionPeriod;
    var requestNumber = ++prizeRequestNumber;
    prizeRows.replaceChildren();
    try {
      var result = await callJson('/competition?period=' + encodeURIComponent(requested));
      if (requested !== competitionPeriod || requestNumber !== prizeRequestNumber) return;
      prizeRows.replaceChildren();
      var cutoff = document.getElementById('nbg-prize-cutoff');
      if (cutoff) cutoff.textContent = result.scores_enabled === false ?
        'BETA PRACTICE — official score saving and prize payouts are locked until server gameplay verification is available.' :
        result.payout_enabled ?
        requested.charAt(0).toUpperCase() + requested.slice(1) +
          ' VERIFIED XP prize standings close ' + new Date(result.end_ms).toUTCString() +
          '. Prizes use only verified XP, not practice totals.' :
        'LIVE VERIFIED GAME XP — Arcade XP prizes remain disabled during beta. ' +
          'No rewards are scheduled or pending. Current period ends ' +
          new Date(result.end_ms).toUTCString() + '.';
      if (!result.standings.length) {
        var empty = document.createElement('tr');
        var blank = document.createElement('td');
        blank.colSpan = 4;
        blank.textContent = result.scores_enabled === false ?
          'Official competition standings are paused during beta testing.' :
          'No verified completed runs in this period yet.';
        empty.appendChild(blank);
        prizeRows.appendChild(empty);
        return;
      }
      result.standings.forEach(function (item) {
        var row = document.createElement('tr');
        addCell(row, item.rank);
        addCell(row, item.name);
        addCell(row, Number(item.total_xp).toLocaleString() + ' XP');
        addCell(row, result.payout_enabled && item.prize_eligible && item.prize_rank ?
          '+' + Number(result.prizes[item.prize_rank - 1]).toLocaleString() + ' Arcade XP (pending cutoff)' :
          result.payout_enabled ? 'Not prize-eligible' : 'Payouts on hold');
        prizeRows.appendChild(row);
      });
    } catch (error) {
      if (requested !== competitionPeriod || requestNumber !== prizeRequestNumber) return;
      var row = document.createElement('tr');
      var cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = 'Competition standings unavailable.';
      row.appendChild(cell);
      prizeRows.replaceChildren(row);
    }
  }

  async function loadPersonal() {
    if (!personal) return;
    var requestNumber = ++identityRequestNumber;
    var initialId = String(window.MOONBOYS_IDENTITY?.getTelegramId?.() || '');
    if (!displayIdentity()) {
      personal.textContent = 'Your all-time bests: log in with Telegram to save records.';
      return;
    }
    personal.textContent = 'Loading your verified personal bests…';
    try {
      var auth = await signedAuth();
      if (!auth) throw new Error('Telegram verification needed');
      var result = await callJson('/me', { telegram_auth: auth });
      if (requestNumber !== identityRequestNumber ||
          initialId !== String(window.MOONBOYS_IDENTITY?.getTelegramId?.() || '')) return;
      var hudName = document.getElementById('nbg-hud-player');
      if (hudName) hudName.textContent = result.player.slice(0, 36);
      if (account) account.textContent = 'Telegram: ' + result.player;
      if (!result.records) {
        personal.textContent = result.scores_enabled === false ?
          result.player + ' — beta practice only; official bests are not being saved.' :
          result.player + ' — no completed ranked runs yet.';
        return;
      }
      personal.textContent = result.player + ' | Best time: ' + formatTime(result.records.fastest_ms) +
        ' | Best speed + XP: ' + Number(result.records.speed_xp_rate).toLocaleString() +
        ' XP/min | Most XP: ' + Number(result.records.best_xp).toLocaleString();
    } catch (error) {
      personal.textContent = 'Your permanent records are unavailable until Telegram verification succeeds.';
    }
  }

  function addCell(row, value) {
    var cell = document.createElement('td');
    cell.textContent = String(value);
    row.appendChild(cell);
  }

  async function loadLeaders() {
    if (!tableBody) return;
    var requested = metric;
    tableBody.replaceChildren();
    var loading = document.createElement('tr');
    var loadingCell = document.createElement('td');
    loadingCell.colSpan = 5;
    loadingCell.textContent = 'Loading verified Telegram scores…';
    loading.appendChild(loadingCell);
    tableBody.appendChild(loading);
    try {
      var result = await callJson('/leaderboard?metric=' + encodeURIComponent(requested));
      if (metric !== requested) return;
      tableBody.replaceChildren();
      if (!result.records || !result.records.length) {
        var emptyRow = document.createElement('tr');
        var cell = document.createElement('td');
        cell.colSpan = 5;
        cell.textContent = result.scores_enabled === false ?
          'Beta testing — official scores are paused until anti-cheat verification is ready.' :
          'No verified completed runs yet.';
        emptyRow.appendChild(cell);
        tableBody.appendChild(emptyRow);
      } else {
        result.records.forEach(function (item) {
          var row = document.createElement('tr');
          addCell(row, item.rank);
          addCell(row, item.name || 'Telegram player');
          addCell(row, formatTime(item.time_ms));
          addCell(row, Number(item.xp || 0).toLocaleString() + ' XP');
          addCell(row, METRICS[requested].value(item));
          tableBody.appendChild(row);
        });
      }
      var descriptor = document.getElementById('nbg-record-ranking');
      if (descriptor) descriptor.textContent = METRICS[metric].title +
        (metric === 'speed_xp' ? ' — ranked by XP earned per minute' : '');
    } catch (error) {
      if (metric === requested) {
        tableBody.replaceChildren();
        var row = document.createElement('tr');
        var cell = document.createElement('td');
        cell.colSpan = 5;
        cell.textContent = 'Leaderboard unavailable. Try again later.';
        row.appendChild(cell);
        tableBody.appendChild(row);
      }
    }
  }

  async function beginRankedRun() {
    var current = ++generation;
    runPromise = null;
    // Capture the identity at the exact beginning of play, before an await.
    // Website credential renewal can adopt another tab's Telegram account.
    var gate = window.MOONBOYS_IDENTITY;
    var startingId = String(gate && gate.getTelegramId ? gate.getTelegramId() || '' : '');
    runIdentity = null;
    if (!displayIdentity() || !startingId) {
      setStatus('Guest run: score is session-only, not permanently ranked.');
      return;
    }
    runIdentity = startingId;
    if (uncertainStartOwners.has(startingId)) {
      setStatus('Practice only: prior ranked start lost connection. Refresh the page before retrying official scores.');
      return;
    }
    setStatus('Verifying Telegram account for this run…');
    runPromise = (async function () {
      var auth = await signedAuth();
      if (!auth || current !== generation ||
          String(auth.id) !== startingId ||
          String(gate.getTelegramId() || '') !== startingId ||
          !gate.isTelegramLinked()) return null;
      // Each /run/start invalidates unfinished D1 sessions for its own owner.
      // Serialize the full HTTP request per owner so a late old request cannot
      // revoke a newer run. Other Telegram owners must not be blocked by it.
      var previousStart = serverStartQueues.get(startingId) || Promise.resolve();
      var queuedStart = previousStart.then(async function () {
        if (current !== generation ||
            String(gate.getTelegramId() || '') !== startingId ||
            !gate.isTelegramLinked()) return null;
        var started;
        try {
          started = await callJson('/run/start', { telegram_auth: auth });
        } catch (error) {
          if (error && error.uncertainStart) uncertainStartOwners.add(startingId);
          throw error;
        }
        if (current !== generation ||
            String(gate.getTelegramId() || '') !== startingId ||
            !gate.isTelegramLinked()) return null;
        return Object.assign({}, started, { telegram_id: startingId });
      });
      // A failed request must not poison later same-owner starts. Remove idle
      // entries only when no newer run has replaced that owner's queue tail.
      var tail = queuedStart.then(function () {}, function () {});
      serverStartQueues.set(startingId, tail);
      tail.then(function () {
        if (serverStartQueues.get(startingId) === tail)
          serverStartQueues.delete(startingId);
      });
      return queuedStart;
    }());
    try {
      var result = await runPromise;
      if (current !== generation) return;
      if (result && result.ranked === false) {
        var betaHudName = document.getElementById('nbg-hud-player');
        if (betaHudName) betaHudName.textContent = result.player.slice(0, 36);
        if (account) account.textContent = 'Playing as ' + result.player + ' (beta)';
        setStatus('Beta practice: gameplay works, but official scores are not saved until server verification is ready.');
      } else if (result && result.run_id) {
        var hudName = document.getElementById('nbg-hud-player');
        if (hudName) hudName.textContent = result.player.slice(0, 36);
        if (account) account.textContent = 'Playing as ' + result.player;
        setStatus('Ranked run active — completed results are saved to your Telegram name.');
      } else {
        setStatus('Run not ranked: Telegram account changed during login verification.');
      }
    } catch (error) {
      if (current === generation) setStatus('Ranked run unavailable: ' + error.message + '. No score will be saved.');
    }
  }

  function beforeQueuedRun() {
    var gate = window.MOONBOYS_IDENTITY;
    var id = String(gate && gate.getTelegramId ? gate.getTelegramId() || '' : '');
    if (!id || !gate.isTelegramLinked || !gate.isTelegramLinked() ||
        uncertainStartOwners.has(id) || !serverStartQueues.has(id)) return null;
    // A same-owner HTTP start is still pending: create the replacement session
    // BEFORE simulation begins so its real elapsed-time checks stay accurate.
    // The later nbg-level-started event must not issue another /run/start.
    var preparation = beginRankedRun();
    preparedStartGeneration = generation;
    setStatus('Waiting for previous ranked start before gameplay begins…');
    return preparation;
  }

  async function finishRankedRun(detail) {
    var current = generation;
    var sessionPromise = runPromise;
    if (!sessionPromise) {
      setStatus('Run complete. Guest scores are not stored permanently.');
      return;
    }
    try {
      var session = await sessionPromise;
      if (current !== generation || !session || !session.run_id) {
        if (current === generation) setStatus(session && session.ranked === false ?
          'Practice run completed. Official XP and records were not saved during beta.' :
          'Run not ranked: no verified Telegram start session.');
        return;
      }
      var gate = window.MOONBOYS_IDENTITY;
      if (current !== generation || !gate || String(gate.getTelegramId() || '') !== session.telegram_id) {
        if (current === generation) setStatus('Run not saved: Telegram account changed during play.');
        return;
      }
      var auth = await signedAuth();
      if (!auth || current !== generation || String(auth.id) !== session.telegram_id ||
          String(gate.getTelegramId() || '') !== session.telegram_id || !gate.isTelegramLinked()) {
        if (current === generation) setStatus('Run not saved: Telegram account changed or login expired.');
        return;
      }
      if (!detail.replay || detail.replay.version !== 1) {
        setStatus('Run not saved: missing gameplay replay. Reset and play a fresh run.');
        return;
      }
      setStatus('Verifying gameplay against server-side scoring rules…');
      var result = await callJson('/run/finish', {
        telegram_auth: auth, run_id: session.run_id,
        replay: detail.replay
      });
      if (current !== generation) return;
      setStatus('Official replay-verified result saved for ' + result.player + ': ' +
        formatTime(result.time_ms) + ' · ' + result.xp.toLocaleString() +
        ' verified game XP (may differ from practice HUD XP).');
      loadLeaders();
      loadPersonal();
      loadPrizeStandings();
    } catch (error) {
      if (current === generation)
        setStatus('Run not saved: ' + error.message + '. Unsaved runs are not queued.');
    }
  }

  function installFullscreenRecordsDrawer() {
    // The reusable Arcade shell moves only .game-card into its opaque overlay.
    // Move this SAME live records panel to a scrollable drawer on that overlay;
    // no cloning, duplicate IDs, or inaccessible content behind the game.
    var overlay = document.getElementById('game-overlay');
    var toolbar = document.getElementById('overlay-ctrl-bar');
    var board = document.getElementById('nbg-record-board');
    if (!overlay || !toolbar || !board || document.getElementById('nbg-record-drawer')) return;

    var open = document.createElement('button');
    open.id = 'nbg-open-records';
    open.type = 'button';
    open.textContent = 'Scores';
    open.setAttribute('aria-label', 'View London scores and saved results');
    open.setAttribute('aria-controls', 'nbg-record-drawer');
    open.setAttribute('aria-expanded', 'false');
    toolbar.appendChild(open);

    var drawer = document.createElement('section');
    drawer.id = 'nbg-record-drawer';
    drawer.setAttribute('role', 'region');
    drawer.setAttribute('aria-label', 'London scores and saved results');
    drawer.hidden = true;

    var close = document.createElement('button');
    close.id = 'nbg-close-records';
    close.type = 'button';
    close.textContent = 'Close scores and return to game';
    drawer.appendChild(close);
    drawer.appendChild(board);
    overlay.appendChild(drawer);

    function setOpen(visible) {
      if (visible && window.NBGLevel1Runtime &&
          typeof window.NBGLevel1Runtime.suspendInput === 'function') {
        // Release held movement/jump/spray before focus enters the drawer.
        window.NBGLevel1Runtime.suspendInput();
      }
      drawer.hidden = !visible;
      open.setAttribute('aria-expanded', String(visible));
      if (visible) {
        drawer.scrollTop = 0;
        close.focus();
      } else {
        open.focus();
      }
    }
    open.addEventListener('click', function () { setOpen(drawer.hidden); });
    close.addEventListener('click', function () { setOpen(false); });
    // Capture Escape before the fullscreen-only shell redirects to /games/.
    document.addEventListener('keydown', function (event) {
      if (!drawer.hidden && event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
      }
    }, true);
  }

  function init() {
    installFullscreenRecordsDrawer();
    status = document.getElementById('nbg-record-status');
    account = document.getElementById('nbg-record-account');
    personal = document.getElementById('nbg-record-personal');
    tableBody = document.getElementById('nbg-record-rows');
    prizeRows = document.getElementById('nbg-prize-rows');
    if (!tableBody) return;
    displayIdentity();
    Array.prototype.forEach.call(document.querySelectorAll('[data-nbg-metric]'), function (button) {
      button.addEventListener('click', function () {
        metric = button.getAttribute('data-nbg-metric');
        Array.prototype.forEach.call(document.querySelectorAll('[data-nbg-metric]'), function (peer) {
          peer.setAttribute('aria-pressed', String(peer === button));
        });
        loadLeaders();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-nbg-period]'), function (button) {
      button.addEventListener('click', function () {
        competitionPeriod = button.getAttribute('data-nbg-period');
        Array.prototype.forEach.call(document.querySelectorAll('[data-nbg-period]'), function (peer) {
          peer.setAttribute('aria-pressed', String(peer === button));
        });
        loadPrizeStandings();
      });
    });
    window.addEventListener('moonboys:identity-change', function () {
      // A started run can never migrate to a different linked Telegram account.
      var gate = window.MOONBOYS_IDENTITY;
      var nowId = String(gate && gate.getTelegramId ? gate.getTelegramId() || '' : '');
      if (runPromise && runIdentity &&
          (nowId !== runIdentity || !gate.isTelegramLinked())) {
        generation += 1;
        runPromise = null;
        runIdentity = null;
        setStatus('Telegram account changed. This run is no longer eligible for permanent scores.');
      }
      displayIdentity();
      loadPersonal();
    });
    window.NBGLondonBeforeQueuedRun = beforeQueuedRun;
    window.addEventListener('nbg-level-started', function () {
      if (preparedStartGeneration === generation) {
        preparedStartGeneration = -1;
        return;
      }
      beginRankedRun();
    });
    window.addEventListener('nbg-level-complete', function (event) {
      finishRankedRun(event.detail || {});
    });
    window.addEventListener('nbg-level-reset', function () {
      generation += 1;
      runPromise = null;
      runIdentity = null;
      displayIdentity();
      setStatus('Fresh run ready. Verified Telegram gameplay can now save official leaderboard XP.');
    });
    window.addEventListener('nbg-game-over', function () {
      setStatus('Game over. Finish a complete run to submit replay-verified leaderboard XP.');
    });
    loadLeaders();
    loadPersonal();
    loadPrizeStandings();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
