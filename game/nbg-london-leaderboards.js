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
  // An incomplete start POST can still commit after navigation or reload.
  // Persist an owner-scoped marker BEFORE each HTTP start. Only a confirmed
  // Worker response clears it; indeterminate outcomes stay practice-only.
  var uncertainStartOwners = new Set();
  var activeStartTokens = new Map();
  var startTokenSequence = 0;
  var runIdentity = null;
  var practiceOnlyReason = null;
  var PRACTICE_START_MESSAGE = 'Practice only (Telegram-linked): a previous ranked start may still be processing. Scores are not saved; refreshing does not clear the pending-start safety hold.';
  var preparedStartGeneration = -1;
  var status = null;
  var tableBody = null;
  var account = null;
  var personal = null;
  var accessGate = null;
  var accessGateMessage = null;
  var accessRecheck = null;
  var accessState = { owner: null, allowed: false, checkedAt: 0, reason: 'unchecked' };
  var accessPromise = null;
  var ACCESS_CACHE_MS = 60000;
  var GROUP_URL = 'https://t.me/gkniftyheads';

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

  function moonboysApiBase() {
    var cfg = window.MOONBOYS_API;
    var url = cfg && typeof cfg.getApiBase === 'function' ? cfg.getApiBase() :
      cfg && typeof cfg.BASE_URL === 'string' ? cfg.BASE_URL : null;
    return typeof url === 'string' && /^https:\/\//.test(url) ? url.replace(/\/$/, '') : null;
  }

  function productionAccessGateEnabled() {
    var cfg = window.MOONBOYS_API;
    return !!(cfg && cfg.CONTEXT && cfg.CONTEXT.isProduction === true);
  }

  function showAccessGate(message, reason) {
    accessState.reason = reason || 'blocked';
    if (accessGateMessage) accessGateMessage.textContent = message;
    if (accessGate) accessGate.hidden = false;
    var login = document.getElementById('nbg-access-login');
    var group = document.getElementById('nbg-access-group');
    if (login) login.hidden = reason === 'group_required';
    if (group) group.hidden = reason === 'login_required';
  }

  function hideAccessGate() {
    if (accessGate) accessGate.hidden = true;
  }

  function resetAccessState() {
    accessState = { owner: null, allowed: false, checkedAt: 0, reason: 'unchecked' };
    accessPromise = null;
  }

  async function verifyGameAccess(force) {
    // Local developer/browser validation stays playable. Production Pages and
    // the live custom domain must use server-confirmed Telegram membership.
    if (!productionAccessGateEnabled()) {
      hideAccessGate();
      return { allow: true, source: 'non-production' };
    }

    var gate = window.MOONBOYS_IDENTITY;
    var owner = String(gate && gate.getTelegramId ? gate.getTelegramId() || '' : '');
    var linked = !!(gate && typeof gate.isTelegramLinked === 'function' && gate.isTelegramLinked());
    if (!linked || !owner) {
      accessState = { owner: owner || null, allowed: false, checkedAt: Date.now(), reason: 'login_required' };
      showAccessGate('Log in with Telegram, then join the GKniftyHEADS group to play NBG London.', 'login_required');
      setStatus('NBG London requires a linked Telegram account and GKniftyHEADS group membership.');
      return { allow: false, reason: 'login_required' };
    }

    if (!force && accessState.allowed && accessState.owner === owner &&
        Date.now() - accessState.checkedAt < ACCESS_CACHE_MS) {
      hideAccessGate();
      return { allow: true, source: 'cache' };
    }
    if (accessPromise) return accessPromise;

    accessPromise = (async function () {
      showAccessGate('Checking Telegram group membership…', 'checking');
      setStatus('Checking GKniftyHEADS Telegram group membership…');
      var auth = await signedAuth();
      if (!auth || String(auth.id) !== owner) {
        accessState = { owner: owner, allowed: false, checkedAt: Date.now(), reason: 'login_required' };
        showAccessGate('Telegram verification is required before NBG London can start.', 'login_required');
        return { allow: false, reason: 'login_required' };
      }
      var base = moonboysApiBase();
      if (!base) {
        accessState = { owner: owner, allowed: false, checkedAt: Date.now(), reason: 'unavailable' };
        showAccessGate('Membership verification is temporarily unavailable. The game stays locked.', 'unavailable');
        return { allow: false, reason: 'unavailable' };
      }

      var response;
      var result;
      try {
        response = await fetch(base + '/telegram/group-membership', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegram_auth: auth }),
          cache: 'no-store'
        });
        result = await response.json().catch(function () { return null; });
      } catch (error) {
        accessState = { owner: owner, allowed: false, checkedAt: Date.now(), reason: 'unavailable' };
        showAccessGate('Could not verify Telegram membership. The game stays locked; try again.', 'unavailable');
        return { allow: false, reason: 'unavailable' };
      }

      if (!response.ok || !result || result.ok !== true) {
        accessState = { owner: owner, allowed: false, checkedAt: Date.now(), reason: 'unavailable' };
        showAccessGate('Could not verify Telegram membership. The game stays locked; try again.', 'unavailable');
        return { allow: false, reason: 'unavailable' };
      }
      if (result.member !== true) {
        accessState = { owner: owner, allowed: false, checkedAt: Date.now(), reason: 'group_required' };
        showAccessGate('Join the GKniftyHEADS Telegram group, then press Check access to play.', 'group_required');
        setStatus('Telegram linked, but GKniftyHEADS group membership is required to start NBG London.');
        return { allow: false, reason: 'group_required' };
      }

      accessState = { owner: owner, allowed: true, checkedAt: Date.now(), reason: 'allowed' };
      hideAccessGate();
      setStatus('Telegram + GKniftyHEADS membership verified. NBG London is ready.');
      return { allow: true, source: 'telegram-group' };
    }()).finally(function () { accessPromise = null; });

    return accessPromise;
  }

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function pendingStartKey(id) {
    return 'nbg-london:pending-ranked-start:v1:' + id;
  }

  function uncertainOwner(id) {
    if (!id || uncertainStartOwners.has(id)) return !!id;
    try {
      // Without durable storage we cannot safely distinguish a page reload
      // from an older server POST whose outcome is still unknown.
      if (!window.localStorage) throw new Error('storage_unavailable');
      var stored = window.localStorage.getItem(pendingStartKey(id));
      if (stored && stored !== activeStartTokens.get(id)) {
        uncertainStartOwners.add(id);
        return true;
      }
    } catch (error) {
      uncertainStartOwners.add(id);
      return true;
    }
    return false;
  }

  function reserveStart(id) {
    if (uncertainOwner(id)) return null;
    var token = String(Date.now()) + ':' + String(++startTokenSequence);
    try {
      // Write first; the HTTP POST must never precede the durable marker.
      window.localStorage.setItem(pendingStartKey(id), token);
      activeStartTokens.set(id, token);
      return token;
    } catch (error) {
      uncertainStartOwners.add(id);
      return null;
    }
  }

  function settleStart(id, token, confirmed) {
    if (activeStartTokens.get(id) === token) activeStartTokens.delete(id);
    if (!confirmed) {
      uncertainStartOwners.add(id);
      return; // Keep the durable marker across refresh and browser restarts.
    }
    try {
      var key = pendingStartKey(id);
      if (window.localStorage.getItem(key) === token) {
        window.localStorage.removeItem(key);
      } else {
        // Another tab has changed this owner's in-flight marker.
        uncertainStartOwners.add(id);
      }
    } catch (error) {
      uncertainStartOwners.add(id);
    }
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
    if (path === '/run/start') {
      // Gateway 5xx / HTML timeouts do NOT prove the Worker stopped its D1
      // write. Only a valid successful Worker start or an explicit 4xx
      // application rejection safely settles the pending-start marker.
      var acknowledged = response.ok && result && result.ok === true &&
        (result.ranked === false ||
          (typeof result.run_id === 'string' &&
            /^[0-9a-f-]{36}$/i.test(result.run_id)));
      var rejected = !response.ok && Number(response.status) >= 400 &&
        Number(response.status) < 500 && result && result.ok === false &&
        typeof result.error === 'string' && result.error.length > 0;
      if (!acknowledged && !rejected) {
        var uncertainResponse = new Error('start_request_outcome_unknown');
        uncertainResponse.uncertainStart = true;
        throw uncertainResponse;
      }
    }
    if (!response.ok || !result || !result.ok) {
      var requestError = new Error(result && result.error ? result.error : 'Leaderboard request failed');
      // Only an explicit 4xx application response is an authoritative rejection.
      // Network errors, gateway 5xx responses and timeouts must remain silent.
      requestError.authoritativeRejection = Number(response.status) >= 400 &&
        Number(response.status) < 500 && result && result.ok === false &&
        typeof result.error === 'string' && result.error.length > 0;
      throw requestError;
    }
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
    practiceOnlyReason = null;
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
    if (uncertainOwner(startingId)) {
      practiceOnlyReason = PRACTICE_START_MESSAGE;
      setStatus(practiceOnlyReason);
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
        if (current !== generation || uncertainOwner(startingId) ||
            String(gate.getTelegramId() || '') !== startingId ||
            !gate.isTelegramLinked()) return null;
        var token = reserveStart(startingId);
        if (!token) {
          practiceOnlyReason = PRACTICE_START_MESSAGE;
          return null;
        }
        var started;
        try {
          started = await callJson('/run/start', { telegram_auth: auth });
          settleStart(startingId, token, true);
        } catch (error) {
          settleStart(startingId, token, !(error && error.uncertainStart));
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
        if (uncertainOwner(startingId)) practiceOnlyReason = PRACTICE_START_MESSAGE;
        setStatus(practiceOnlyReason ||
          'Run not ranked: Telegram account changed during login verification.');
      }
    } catch (error) {
      if (current === generation) {
        if (uncertainOwner(startingId)) practiceOnlyReason = PRACTICE_START_MESSAGE;
        setStatus(practiceOnlyReason ||
          'Ranked run unavailable: ' + error.message + '. No score will be saved.');
      }
    }
  }

  async function beforeQueuedRun() {
    var access = await verifyGameAccess(false);
    if (!access || access.allow !== true) return { allow: false };

    var gate = window.MOONBOYS_IDENTITY;
    var id = String(gate && gate.getTelegramId ? gate.getTelegramId() || '' : '');
    if (!id || !gate.isTelegramLinked || !gate.isTelegramLinked()) return { allow: false };
    if (uncertainOwner(id) || !serverStartQueues.has(id)) return { allow: true };

    // A same-owner HTTP start is still pending: create the replacement session
    // BEFORE simulation begins so its real elapsed-time checks stay accurate.
    // Ranking failure does not revoke already-verified group access; it only
    // downgrades that eligible member to an unsaved practice run.
    try {
      await beginRankedRun();
      preparedStartGeneration = generation;
      setStatus('Telegram membership verified; ranked session prepared.');
    } catch (error) {
      setStatus('Telegram membership verified, but ranked scoring is temporarily unavailable.');
    }
    return { allow: true };
  }

  async function finishRankedRun(detail) {
    var current = generation;
    var sessionPromise = runPromise;
    if (!sessionPromise) {
      setStatus(practiceOnlyReason ?
        'Practice run completed. ' + practiceOnlyReason :
        runIdentity ?
          'Run complete. Telegram verification unavailable; no official score was saved.' :
          'Run complete. Guest scores are not stored permanently.');
      return;
    }
    try {
      var session = await sessionPromise;
      if (current !== generation || !session || !session.run_id) {
        if (current === generation) {
          if (uncertainOwner(runIdentity)) practiceOnlyReason = PRACTICE_START_MESSAGE;
          setStatus(practiceOnlyReason ?
            'Practice run completed. ' + practiceOnlyReason :
            session && session.ranked === false ?
              'Practice run completed. Official XP and records were not saved during beta.' :
              'Run not ranked: no verified Telegram start session.');
        }
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
      window.dispatchEvent(new CustomEvent('nbg-record-result', {
        detail: { accepted: true, authoritative: true, runId: session.run_id }
      }));
      loadLeaders();
      loadPersonal();
      loadPrizeStandings();
    } catch (error) {
      if (current === generation) {
        setStatus('Run not saved: ' + error.message + '. Unsaved runs are not queued.');
        if (error && error.authoritativeRejection === true) {
          window.dispatchEvent(new CustomEvent('nbg-record-result', {
            detail: { accepted: false, authoritative: true }
          }));
        }
      }
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
    // A separate, visual-only camera control. It never changes the run,
    // scoring, movement or replay. Keep it in the fullscreen toolbar so it
    // does not cover the player, touch controls or the in-canvas timer.
    var zoomButton = document.createElement('button');
    zoomButton.id = 'nbg-zoom-control';
    zoomButton.type = 'button';
    zoomButton.className = 'interactive';
    function updateZoomButton() {
      var current = Number(window.NBGLevel1State && window.NBGLevel1State.cameraZoom) || 1.25;
      var next = current === 1 ? 1.25 : current === 1.25 ? 1.5 : 1;
      zoomButton.textContent = 'Zoom ' + current + '×';
      zoomButton.setAttribute('aria-label', 'Gameplay zoom ' + current + ' times. Activate for ' + next + ' times.');
      zoomButton.title = 'Camera zoom: ' + current + '× (next: ' + next + '×)';
    }
    zoomButton.addEventListener('click', function () {
      var runtime = window.NBGLevel1Runtime;
      var current = Number(window.NBGLevel1State && window.NBGLevel1State.cameraZoom) || 1.25;
      var next = current === 1 ? 1.25 : current === 1.25 ? 1.5 : 1;
      if (runtime && typeof runtime.setCameraZoom === 'function') runtime.setCameraZoom(next);
      updateZoomButton();
    });
    window.addEventListener('nbg-camera-zoom-changed', updateZoomButton);
    updateZoomButton();
    // Keep zoom near the front; narrow mobile toolbar layouts scroll horizontally.
    toolbar.insertBefore(zoomButton, document.getElementById('overlay-btn-info'));
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
    accessGate = document.getElementById('nbg-access-gate');
    accessGateMessage = document.getElementById('nbg-access-gate-message');
    accessRecheck = document.getElementById('nbg-access-recheck');
    account = document.getElementById('nbg-record-account');
    personal = document.getElementById('nbg-record-personal');
    tableBody = document.getElementById('nbg-record-rows');
    prizeRows = document.getElementById('nbg-prize-rows');
    if (!tableBody) return;
    displayIdentity();
    if (accessRecheck) {
      accessRecheck.addEventListener('click', function () {
        verifyGameAccess(true).catch(function () {
          showAccessGate('Could not verify Telegram membership. The game stays locked; try again.', 'unavailable');
        });
      });
    }
    verifyGameAccess(false).catch(function () {
      showAccessGate('Could not verify Telegram membership. The game stays locked; try again.', 'unavailable');
    });
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
      resetAccessState();
      displayIdentity();
      verifyGameAccess(true).catch(function () {
        showAccessGate('Could not verify Telegram membership. The game stays locked; try again.', 'unavailable');
      });
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
      practiceOnlyReason = null;
      displayIdentity();
      if (productionAccessGateEnabled() && !accessState.allowed) {
        showAccessGate(accessState.reason === 'group_required' ?
          'Join the GKniftyHEADS Telegram group, then press Check access to play.' :
          'Telegram login and GKniftyHEADS group membership are required to play.',
          accessState.reason || 'login_required');
      }
      var gate = window.MOONBOYS_IDENTITY;
      var owner = String(gate && gate.getTelegramId ? gate.getTelegramId() || '' : '');
      setStatus(uncertainOwner(owner) ? PRACTICE_START_MESSAGE :
        'Fresh run ready. Verified Telegram gameplay can now save official leaderboard XP.');
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
