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
  var runIdentity = null;
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
    var response = await fetch(base + '/nbg-london' + path, {
      method: data ? 'POST' : 'GET',
      headers: data ? { 'Content-Type': 'application/json' } : {},
      body: data ? JSON.stringify(data) : undefined,
      cache: 'no-store'
    });
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
      if (cutoff) cutoff.textContent = result.payout_enabled ?
        requested.charAt(0).toUpperCase() + requested.slice(1) +
          ' VERIFIED XP prize standings close ' + new Date(result.end_ms).toUTCString() +
          '. Prizes use only verified XP, not practice totals.' :
        'BETA PAYOUT HOLD — practice XP is not verified for Arcade XP prizes. ' +
          'No rewards are scheduled or pending. Current period ends ' +
          new Date(result.end_ms).toUTCString() + '.';
      if (!result.standings.length) {
        var empty = document.createElement('tr');
        var blank = document.createElement('td');
        blank.colSpan = 4;
        blank.textContent = 'No verified completed runs in this period yet.';
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
        personal.textContent = result.player + ' — no completed ranked runs yet.';
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
        cell.textContent = 'No verified completed runs yet.';
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
    setStatus('Verifying Telegram account for this run…');
    runPromise = (async function () {
      var auth = await signedAuth();
      if (!auth || current !== generation ||
          String(auth.id) !== startingId ||
          String(gate.getTelegramId() || '') !== startingId ||
          !gate.isTelegramLinked()) return null;
      var started = await callJson('/run/start', { telegram_auth: auth });
      if (current !== generation || String(gate.getTelegramId() || '') !== startingId) return null;
      return Object.assign({}, started, { telegram_id: startingId });
    }());
    try {
      var result = await runPromise;
      if (current !== generation) return;
      if (result && result.run_id) {
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
        if (current === generation) setStatus('Run not ranked: no verified Telegram start session.');
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
      setStatus('Submitting completed run for verification…');
      var result = await callJson('/run/finish', {
        telegram_auth: auth, run_id: session.run_id, complete: true,
        time_ms: detail.timeMs, xp: detail.xp,
        coins: detail.coins, secret_coins: detail.secretCoins
      });
      if (current !== generation) return;
      setStatus('Saved permanently for ' + result.player + ': ' +
        formatTime(result.time_ms) + ' · ' + result.xp.toLocaleString() + ' XP');
      loadLeaders();
      loadPersonal();
      loadPrizeStandings();
    } catch (error) {
      if (current === generation)
        setStatus('Run not saved: ' + error.message + '. Unsaved runs are not queued.');
    }
  }

  function init() {
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
    window.addEventListener('nbg-level-started', beginRankedRun);
    window.addEventListener('nbg-level-complete', function (event) {
      finishRankedRun(event.detail || {});
    });
    window.addEventListener('nbg-level-reset', function () {
      generation += 1;
      runPromise = null;
      runIdentity = null;
      displayIdentity();
      setStatus('Fresh run ready. Only completed, Telegram-verified runs are saved.');
    });
    window.addEventListener('nbg-game-over', function () {
      setStatus('Game over. Only completed runs count toward permanent leaderboards.');
    });
    loadLeaders();
    loadPersonal();
    loadPrizeStandings();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
