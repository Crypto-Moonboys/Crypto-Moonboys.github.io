/**
 * Crypto Moonboys — Connection Status Panel
 * ==========================================
 * Compact player live-feed panel and header badge.
 *
 * One shared state authority (`buildSharedRailState`) drives multiple passive
 * section renderers.  Right-rail section mounts inside `#homepage-right-panel`
 * render compact, frame-free inner content because the outer `retro-hud-box`
 * already owns the card frame.  Standalone `data-csp-panel` mounts keep a
 * framed `.csp-panel` wrapper for stable non-shell presentation.
 *
 * Rendered content:
 *   data-csp-panel        — Player Live Feed (Arcade XP, Block Topia, latest activity)
 *   data-csp-faction-ops  — Faction Daily Ops (faction, XP, contribution, missions)
 *   data-csp-wtf-signal   — Daily WTF Signal (badge, event, timer, action)
 *   data-csp-missed       — Missed Opportunities (MISSED badge, XP, counts)
 *
 * Header badge states:
 *   LIVE SYNC          — linked + fresh signed Telegram auth confirmed
 *   RELINK             — linked in localStorage but signed auth expired/missing
 *   Telegram Sync Required — not linked
 *
 * Missed XP display: checks page globals (MOONBOYS_WTF_EVENTS,
 * MOONBOYS_ROGUELITE_DAILY_STATE) and the session daily-state cache first.
 * Renders immediately with the confirmed value when available; otherwise shows
 * "syncing…" and fires POST /roguelite/daily-state in the background
 * (fresh/restorable signed Telegram auth required), then remounts the panel
 * when the fetch confirms missed_xp_all_time — never blocks the panel render
 * for a network round-trip and never shows 0 before data is confirmed.
 *
 * Usage — full panel:
 *   <div id="my-status-panel" data-csp-panel></div>
 *   <script src="/js/components/connection-status-panel.js"></script>
 *
 * Usage — compact badge only (auto-injected into #site-header on every page
 *   that loads this script).
 *
 * Public API:
 *   window.MOONBOYS_STATUS_PANEL.mount(elementOrId)
 *   window.MOONBOYS_STATUS_PANEL.refresh()
 *
 * Depends on (all optional — graceful fallback):
 *   window.MOONBOYS_IDENTITY  (identity-gate.js)
 *   window.MOONBOYS_API       (api-config.js)
 *
 * XP labels:
 *   Score         = leaderboard ranking only
 *   Arcade XP     = multiplayer gate progress (required for Block Topia entry)
 *   Block Topia XP = in-game progression only
 *   Faction XP    = faction alignment only
 */
(function () {
  'use strict';

  // Fallback used when the API does not return required_xp.
  var FALLBACK_REQUIRED_XP = 50;
  var DAILY_STATE_FETCH_TIMEOUT_MS = 6000;
  var STYLE_ID = 'csp-styles';

  // ── Per-session cache ─────────────────────────────────────────────────
  // _progressionCache: { requiredXp, confirmed:true } only after server confirmation.
  // Unconfirmed fallback results are NOT cached so transient API failures do not
  // permanently block the retry path; the next render/refresh call will retry.
  // Arcade XP is NOT cached here — it is read from MOONBOYS_STATE exclusively.
  // _progressionInflight: the in-flight Promise (shared by all concurrent callers).
  // Clearing both on invalidate ensures the next call starts fresh.
  var _progressionCache = null;
  var _progressionInflight = null;
  var _dailyStateCache = null;
  var _dailyStateInflight = null;
  var _dailyStateGeneration = 0;
  var _playerStateCache = null;
  var _playerStateInflight = null;
  var _playerStateGeneration = 0;
  var _apiOnlineCache = null;
  var _liveDataRefreshTimer = null;
  var _factionStatusInflight = null;
  var _lastFactionStatusLoadAt = 0;
  var FACTION_STATUS_LOAD_THROTTLE_MS = 8000;
  var RIGHT_RAIL_SECTION_SELECTORS = [
    '[data-csp-panel]',
    '[data-csp-faction-ops]',
    '[data-csp-wtf-signal]',
    '[data-csp-missed]',
  ];
  var _sharedRailStateCache = null;
  var _sharedRailStateInflight = null;
  var _sharedRailStateInflightGeneration = -1;
  var _sharedRailStateGeneration = 0;
  // Unsubscribe token for MOONBOYS_STATE subscriber (avoids leak if re-initialised)
  var _stateUnsub = null;

  // ── Helpers ────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getIdentity() { return window.MOONBOYS_IDENTITY || null; }

  function getSharedStatusCopy() {
    var cfg = window.MOONBOYS_API || {};
    return cfg.STATUS || {};
  }

  function getApiInfo(mode) {
    var cfg = window.MOONBOYS_API || {};
    if (typeof cfg.getApiBaseInfo === 'function') {
      return cfg.getApiBaseInfo({ mode: mode || 'write' });
    }
    var fallback = cfg.BASE_URL ? String(cfg.BASE_URL).replace(/\/$/, '') : '';
    return {
      url: fallback,
      available: !!fallback,
      state: fallback ? 'configured' : 'config_required',
      summary: fallback ? 'Server confirmed' : 'API config required',
      detail: fallback ? 'API configured for this context' : 'Production API not configured for this context',
    };
  }

  function getApiBase(mode) {
    var info = getApiInfo(mode);
    if (info && info.url) return String(info.url).replace(/\/$/, '');
    return '';
  }

  function isLinked() {
    var gate = getIdentity();
    return !!(gate && typeof gate.isTelegramLinked === 'function' && gate.isTelegramLinked());
  }

  function getDisplayName() {
    var gate = getIdentity();
    if (!gate) return null;
    return typeof gate.getTelegramName === 'function' ? gate.getTelegramName() : null;
  }

  function getTelegramId() {
    var gate = getIdentity();
    if (!gate || typeof gate.getTelegramId !== 'function') return null;
    return gate.getTelegramId();
  }

  async function getSignedTelegramAuthWithRestore() {
    var gate = getIdentity();
    if (!gate) return null;
    if (typeof gate.getFreshTelegramAuth === 'function') {
      return gate.getFreshTelegramAuth();
    }
    var freshAuth = typeof gate.getSignedTelegramAuth === 'function' ? gate.getSignedTelegramAuth() : null;
    if (freshAuth) return freshAuth;
    if (typeof gate.restoreLinkedTelegramAuth !== 'function') return null;
    var restored = await gate.restoreLinkedTelegramAuth().catch(function () { return null; });
    if (restored && restored.ok && restored.telegram_auth) return restored.telegram_auth;
    return typeof gate.getSignedTelegramAuth === 'function' ? gate.getSignedTelegramAuth() : null;
  }

  // ── Async data ─────────────────────────────────────────────────────────

  /**
   * Fetches /blocktopia/progression once per session.
   * Returns { requiredXp } — XP for the Block Topia gate threshold only.
   * Arcade XP displayed in the UI is read from MOONBOYS_STATE.getState().xp,
   * which is hydrated by moonboys-state.js and kept up-to-date via bus events.
   *
   * De-duplication: all concurrent callers share the single in-flight Promise
   * so only one HTTP request is made even when multiple panels/badges render
   * simultaneously.
   */
  function fetchRequiredXp() {
    // Return cached result immediately when available.
    if (_progressionCache !== null) return Promise.resolve(_progressionCache);
    // Return the existing in-flight Promise to de-duplicate concurrent calls.
    if (_progressionInflight !== null) return _progressionInflight;

    _progressionInflight = (async function () {
      var fallback = { requiredXp: FALLBACK_REQUIRED_XP, confirmed: false };
      var gate = getIdentity();
      var telegramAuth = null;
      var apiBase = '';

      if (gate) {
        if (typeof gate.getSignedTelegramAuth === 'function') {
          telegramAuth = gate.getSignedTelegramAuth();
        }
        if (!telegramAuth && typeof gate.restoreLinkedTelegramAuth === 'function') {
          var restored = await gate.restoreLinkedTelegramAuth().catch(function () { return null; });
          telegramAuth = restored && restored.ok ? restored.telegram_auth : null;
        }
        apiBase = getApiBase();
      }

      var result = fallback;
      if (telegramAuth && apiBase) {
        try {
          var res = await fetch(apiBase + '/blocktopia/progression', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_auth: telegramAuth }),
          });
          var payload = await res.json().catch(function () { return {}; });
          if (res.ok && payload && payload.ok === true && payload.progression) {
            var prog = payload.progression;
            result = {
              requiredXp: Math.max(1, Math.floor(Number(prog.required_xp) || FALLBACK_REQUIRED_XP)),
              confirmed: true,
            };
          }
        } catch (_) {
          // result remains fallback; not cached so the next call can retry
        }
      }

      // Only cache server-confirmed progression. Unconfirmed fallback is returned
      // for this call but not stored, so a transient API failure does not
      // permanently block the retry path on the next render or refresh.
      if (result.confirmed) _progressionCache = result;
      _progressionInflight = null;
      return result;
    }());

    return _progressionInflight;
  }

  /** Returns the current Arcade XP from MOONBOYS_STATE (authoritative). */
  function getArcadeXp() {
    var ms = window.MOONBOYS_STATE;
    if (ms && typeof ms.getState === 'function') return ms.getState().xp;
    return (ms && typeof ms.xp === 'number') ? ms.xp : 0;
  }

  function isServerLinkedConfirmed() {
    var ms = window.MOONBOYS_STATE;
    if (!ms || typeof ms.getState !== 'function') return false;
    var state = ms.getState() || null;
    return !!(state && state.linked === true && state.source === 'server');
  }


  async function checkApiOnline() {
    if (_apiOnlineCache !== null) return _apiOnlineCache;
    var apiInfo = getApiInfo('write');
    var copy = getSharedStatusCopy();
    var apiBase = apiInfo && apiInfo.url ? getApiBase('write') : '';
    if (!apiBase) {
      _apiOnlineCache = {
        ok: false,
        state: apiInfo && apiInfo.state ? apiInfo.state : 'config_required',
        summary: copy.API_CONFIG_REQUIRED || 'API config required',
        detail: apiInfo && apiInfo.detail ? apiInfo.detail : (copy.PRODUCTION_API_NOT_CONFIGURED || 'Production API not configured for this context'),
      };
      return _apiOnlineCache;
    }
    var ac = new AbortController();
    var timer = setTimeout(function () { ac.abort(); }, 4000);
    try {
      // GET /health — the worker only implements GET; HEAD falls through to 404.
      var res = await fetch(apiBase + '/health', { method: 'GET', signal: ac.signal });
      _apiOnlineCache = res.status < 500
        ? {
            ok: true,
            state: 'server_confirmed',
            summary: copy.SERVER_CONFIRMED || 'Server confirmed',
            detail: 'Core API reachable',
          }
        : {
            ok: false,
            state: 'server_unavailable',
            summary: copy.SERVER_UNAVAILABLE || 'Server unavailable',
            detail: copy.LOCAL_CACHED_ONLY || 'Local cached only',
          };
    } catch (_) {
      _apiOnlineCache = {
        ok: false,
        state: 'server_unavailable',
        summary: copy.SERVER_UNAVAILABLE || 'Server unavailable',
        detail: copy.LOCAL_CACHED_ONLY || 'Local cached only',
      };
    } finally {
      clearTimeout(timer);
    }
    return _apiOnlineCache;
  }

  function fetchDailyStateWithAuth() {
    if (_dailyStateCache !== null) return Promise.resolve(_dailyStateCache);
    if (_dailyStateInflight !== null) return _dailyStateInflight;
    var requestGeneration = _dailyStateGeneration;

    _dailyStateInflight = (async function () {
      try {
        if (!isLinked()) return null;
        var apiBase = getApiBase();
        if (!apiBase) return null;
        var telegramAuth = await getSignedTelegramAuthWithRestore();
        if (!telegramAuth) return null;
        var ac = new AbortController();
        var timer = setTimeout(function () { ac.abort(); }, DAILY_STATE_FETCH_TIMEOUT_MS);
        try {
          var res = await fetch(apiBase + '/roguelite/daily-state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_auth: telegramAuth }),
            signal: ac.signal,
          });
          var payload = await res.json().catch(function () { return null; });
          if (res.ok && payload && payload.ok === true && requestGeneration === _dailyStateGeneration) {
            _dailyStateCache = payload;
            return payload;
          }
          return null;
        } catch (_) {
          return null;
        } finally {
          clearTimeout(timer);
        }
      } finally {
        _dailyStateInflight = null;
      }
    }());

    return _dailyStateInflight;
  }

  function fetchPlayerStateWithAuth() {
    if (_playerStateCache !== null) return Promise.resolve(_playerStateCache);
    if (_playerStateInflight !== null) return _playerStateInflight;
    var requestGeneration = _playerStateGeneration;

    _playerStateInflight = (async function () {
      try {
        if (!isLinked()) return null;
        var apiBase = getApiBase();
        if (!apiBase) return null;
        var telegramAuth = await getSignedTelegramAuthWithRestore();
        if (!telegramAuth) return null;
        var ac = new AbortController();
        var timer = setTimeout(function () { ac.abort(); }, DAILY_STATE_FETCH_TIMEOUT_MS);
        try {
          var res = await fetch(apiBase + '/player/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_auth: telegramAuth }),
            signal: ac.signal,
          });
          var payload = await res.json().catch(function () { return null; });
          if (res.ok && payload && payload.ok === true && requestGeneration === _playerStateGeneration) {
            _playerStateCache = payload;
            return payload;
          }
          return null;
        } catch (_) {
          return null;
        } finally {
          clearTimeout(timer);
        }
      } finally {
        _playerStateInflight = null;
      }
    }());

    return _playerStateInflight;
  }

  // ── Render ─────────────────────────────────────────────────────────────

  function resolveBlocktopiaAccessState(linked, arcadeXp, requiredXp, serverLinkedConfirmed, progressionConfirmed) {
    if (!linked) return 'unlinked';
    if (!serverLinkedConfirmed) return 'link_check_required';
    if (!progressionConfirmed) return 'server_check_pending';
    if (arcadeXp >= requiredXp) return 'unlocked';
    return 'locked';
  }

  function blocktopiaAccessHTML(linked, arcadeXp, requiredXp, serverLinkedConfirmed, progressionConfirmed) {
    var status = resolveBlocktopiaAccessState(linked, arcadeXp, requiredXp, serverLinkedConfirmed, progressionConfirmed);
    if (!linked) return '<span class="csp-val-locked">Telegram sync required</span>';
    if (status === 'link_check_required') return '<span class="csp-val-locked">Link check required</span>';
    if (status === 'server_check_pending') return '<span class="csp-val-locked">Server check pending</span>';
    if (status === 'unlocked') return '<span class="csp-val-good">Unlocked</span>';
    return '<span class="csp-val-locked">Locked ' + esc(String(arcadeXp)) + '/' + requiredXp + '</span>';
  }

  function blocktopiaBadgeLabel(status) {
    if (status === 'unlocked') return 'BT OPEN';
    if (status === 'locked') return 'BT LOCK';
    return 'BT SYNC';
  }

  function isOwnBattleActivity(row) {
    if (!row || typeof row !== 'object') return false;
    var telegramId = getTelegramId();
    if (telegramId && row.telegram_id != null && String(row.telegram_id) === String(telegramId)) return true;
    if (telegramId && row.user_telegram_id != null && String(row.user_telegram_id) === String(telegramId)) return true;
    if (telegramId && row.player_telegram_id != null && String(row.player_telegram_id) === String(telegramId)) return true;
    return false;
  }

  function battleActivityText(row) {
    return row.title || row.event_text || row.event || row.action || row.event_type || 'Latest Battle Chamber proof synced';
  }

  function missedXpAllTime(confirmedDailyState) {
    var state = window.MOONBOYS_WTF_EVENTS || null;
    var daily = confirmedDailyState || window.MOONBOYS_ROGUELITE_DAILY_STATE || window.MOONBOYS_DAILY_ROGUELITE_LOTTERY || null;
    if (state && state.missed_xp_all_time != null) return Number(state.missed_xp_all_time) || 0;
    if (daily && daily.missed_xp_all_time != null) return Number(daily.missed_xp_all_time) || 0;
    // Neither source has confirmed data yet — return null so the panel can show "syncing…"
    // instead of a misleading 0.
    return null;
  }

  function getFactionSnapshot() {
    var factionApi = window.MOONBOYS_FACTION;
    var fallbackFaction = 'unaligned';
    var fallbackXp = 0;
    if (window.MOONBOYS_STATE && typeof window.MOONBOYS_STATE.getState === 'function') {
      var st = window.MOONBOYS_STATE.getState();
      fallbackFaction = st && st.faction ? st.faction : fallbackFaction;
    }
    if (!factionApi) return { faction: fallbackFaction, faction_xp: fallbackXp, label: fallbackFaction, icon: '◌' };
    var cached = typeof factionApi.getCachedStatus === 'function' ? (factionApi.getCachedStatus() || null) : null;
    var factionKey = cached && cached.faction ? cached.faction : fallbackFaction;
    var meta = typeof factionApi.getVisualMeta === 'function' ? factionApi.getVisualMeta(factionKey) : null;
    return {
      faction: factionKey,
      faction_xp: Math.max(0, Math.floor(Number(cached && cached.faction_xp) || 0)),
      label: meta && meta.label ? meta.label : factionKey,
      icon: meta && meta.icon ? meta.icon : '◌',
    };
  }

  function getDailyCounts(confirmedDailyState) {
    var daily = confirmedDailyState || window.MOONBOYS_ROGUELITE_DAILY_STATE || window.MOONBOYS_DAILY_ROGUELITE_LOTTERY || null;
    var missionRows = daily && daily.today_active && Array.isArray(daily.today_active.mission_opportunities)
      ? daily.today_active.mission_opportunities
      : null;
    var completedFromMissions = missionRows
      ? missionRows.filter(function (row) { return !!(row && row.completed); }).length
      : null;
    return {
      completed: completedFromMissions != null
        ? completedFromMissions
        : (daily && daily.completed_today != null ? Math.max(0, Math.floor(Number(daily.completed_today) || 0)) : null),
      missed: daily && (daily.missed_events_today != null || daily.missed_today != null)
        ? Math.max(0, Math.floor(Number(daily.missed_events_today != null ? daily.missed_events_today : daily.missed_today) || 0))
        : null,
    };
  }

  function getContribution(faction, playerState) {
    var factionKey = faction && faction.faction ? faction.faction : 'unaligned';
    if (!factionKey || factionKey === 'unaligned') return { value: 'No faction selected', pending: false };
    var player = playerState || _playerStateCache || null;
    if (!player) return { value: 'syncing…', pending: true };
    var signal = player && player.faction_signal ? player.faction_signal : null;
    var contributions = signal && signal.contributions && typeof signal.contributions === 'object'
      ? signal.contributions
      : null;
    // Confirmed player state may omit unearned faction keys; treat that as authoritative 0,
    // not as a perpetual syncing state.
    if (!contributions || !Object.prototype.hasOwnProperty.call(contributions, factionKey)) {
      return { value: '0', pending: false };
    }
    var contribution = Math.max(0, Math.floor(Number(contributions[factionKey]) || 0));
    return { value: String(contribution), pending: false };
  }

  function getDailyOpsStatus(faction, dailyState) {
    var factionKey = faction && faction.faction ? faction.faction : 'unaligned';
    if (!factionKey || factionKey === 'unaligned') return { value: 'No faction selected', pending: false };
    if (!dailyState) return { value: 'syncing…', pending: true };
    var missionRows = dailyState.today_active && Array.isArray(dailyState.today_active.mission_opportunities)
      ? dailyState.today_active.mission_opportunities
      : null;
    if (!missionRows) return { value: 'syncing…', pending: true };
    if (!missionRows.length) return { value: 'No live missions reported', pending: false };
    var completed = missionRows.filter(function (row) { return !!(row && row.completed); }).length;
    return { value: String(completed) + '/' + String(missionRows.length) + ' completed', pending: false };
  }

  function getDailyWtfSignalStatus() {
    var state = window.MOONBOYS_WTF_EVENTS || null;
    if (!state || typeof state !== 'object' || state.status === 'loading') return 'syncing…';
    if (state.status === 'error') return 'Signal unavailable';
    if (state.active_event && state.checked_in) return 'Active (checked in)';
    if (state.active_event) return 'Active';
    if (state.next_event || (Array.isArray(state.upcoming_events) && state.upcoming_events.length > 0)) return 'Upcoming';
    if (Number(state.completed_today || 0) > 0) return 'Complete';
    if (Number(state.missed_today || 0) > 0) return 'Missed / expired';
    return 'Waiting';
  }

  function latestActivityRows() {
    var rows = [];
    var activity = Array.isArray(window.MOONBOYS_BATTLE_CHAMBER_ACTIVITY) ? window.MOONBOYS_BATTLE_CHAMBER_ACTIVITY : [];
    if (activity.length) {
      var ownActivity = activity.filter(isOwnBattleActivity);
      if (ownActivity.length) {
        var latest = ownActivity[0] || {};
        rows.push({ tag: 'Battle', text: battleActivityText(latest) });
      }
    }
    var wtf = window.MOONBOYS_WTF_EVENTS || null;
    if (wtf && typeof wtf === 'object') {
      if (wtf.completed_today) rows.push({ tag: 'WTF', text: 'WTF timed event completed today' });
      else if (wtf.checked_in) rows.push({ tag: 'WTF', text: 'WTF timed event check-in synced' });
    }
    var missed = Array.isArray(window.MOONBOYS_ROGUELITE_MISSED_HISTORY) ? window.MOONBOYS_ROGUELITE_MISSED_HISTORY : [];
    if (missed.length) rows.push({ tag: 'Missed', text: 'Missed history updated (' + missed.length + ')' });
    return rows.slice(0, 5);
  }


  function countdownText(seconds) {
    var total = Math.max(0, Math.floor(Number(seconds) || 0));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
  }

  function allRailSectionElements() {
    var seen = new Set();
    var out = [];
    RIGHT_RAIL_SECTION_SELECTORS.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (el) {
        if (!seen.has(el)) {
          seen.add(el);
          out.push(el);
        }
      });
    });
    return out;
  }

  function currentWtfState() {
    var state = window.MOONBOYS_WTF_EVENTS || null;
    return state && typeof state === 'object' ? state : null;
  }

  function invalidateSharedRailState() {
    _sharedRailStateCache = null;
    _sharedRailStateInflight = null;
    _sharedRailStateInflightGeneration = -1;
    _sharedRailStateGeneration++;
  }

  async function buildSharedRailState(force) {
    if (!force && _sharedRailStateCache) return _sharedRailStateCache;
    if (!force && _sharedRailStateInflight && _sharedRailStateInflightGeneration === _sharedRailStateGeneration) {
      return _sharedRailStateInflight;
    }
    var generation = _sharedRailStateGeneration;
    _sharedRailStateInflightGeneration = generation;
    _sharedRailStateInflight = (async function () {
      var linked = isLinked();
      var name = getDisplayName();
      var progression = await fetchRequiredXp();
      var arcadeXp = getArcadeXp();
      var requiredXp = progression.requiredXp;
      var progressionConfirmed = progression.confirmed === true;
      var serverLinkedConfirmed = isServerLinkedConfirmed();
      var blocktopiaStatus = resolveBlocktopiaAccessState(linked, arcadeXp, requiredXp, serverLinkedConfirmed, progressionConfirmed);
      var playerHref = '/games/leaderboard.html';
      var faction = getFactionSnapshot();
      var latestRows = latestActivityRows();
      var latestLine = latestRows.length ? latestRows[0] : null;
      var latestActivityText = latestLine ? latestLine.text : 'Play Arcade to create activity';
      var shared = {
        mode: linked ? 'linked' : 'unlinked',
        linked: linked,
        name: name,
        playerHref: playerHref,
        faction: faction,
        arcadeXp: arcadeXp,
        requiredXp: requiredXp,
        progressionConfirmed: progressionConfirmed,
        serverLinkedConfirmed: serverLinkedConfirmed,
        blocktopiaStatus: blocktopiaStatus,
        blocktopia: blocktopiaAccessHTML(linked, arcadeXp, requiredXp, serverLinkedConfirmed, progressionConfirmed),
        latestActivityText: latestActivityText,
        dailyState: _dailyStateCache || null,
        playerState: _playerStateCache || null,
        wtfState: currentWtfState(),
      };

      if (!linked) {
        return shared;
      }

      var freshAuth = await getSignedTelegramAuthWithRestore();
      if (!freshAuth) {
        shared.mode = 'relink';
        return shared;
      }
      var apiInfo = getApiInfo('write');
      shared.apiInfo = apiInfo;
      if (!apiInfo || !apiInfo.url) {
        shared.mode = 'sync_pending';
        return shared;
      }

      var missedXp = missedXpAllTime(shared.dailyState);
      var dailyCounts = getDailyCounts(shared.dailyState);
      var contribution = getContribution(faction, shared.playerState);
      var dailyOpsStatus = getDailyOpsStatus(faction, shared.dailyState);
      var dailyWtfStatusDisplay = getDailyWtfSignalStatus();
      var needsDailyState = missedXp === null || dailyCounts.completed == null || dailyCounts.missed == null || dailyOpsStatus.pending;

      if (needsDailyState) {
        var patchGeneration = _dailyStateGeneration;
        fetchDailyStateWithAuth().then(function (confirmedState) {
          if (patchGeneration !== _dailyStateGeneration) return;
          if (confirmedState) schedulePanelRemount();
        }).catch(function () {});
      }
      if (contribution.pending) {
        var playerPatchGeneration = _playerStateGeneration;
        fetchPlayerStateWithAuth().then(function (confirmedState) {
          if (playerPatchGeneration !== _playerStateGeneration) return;
          if (confirmedState) schedulePanelRemount();
        }).catch(function () {});
      }

      shared.missedXp = missedXp;
      shared.dailyCounts = dailyCounts;
      shared.contribution = contribution;
      shared.dailyOpsStatus = dailyOpsStatus;
      shared.dailyWtfStatusDisplay = dailyWtfStatusDisplay;
      shared.needsDailyState = needsDailyState;
      return shared;
    }()).then(function (shared) {
      if (generation === _sharedRailStateGeneration) {
        _sharedRailStateCache = shared;
      }
      return shared;
    }).finally(function () {
      _sharedRailStateInflight = null;
      _sharedRailStateInflightGeneration = -1;
    });
    return _sharedRailStateInflight;
  }

  function buildPlayerLiveFeedHTML(shared, opts) {
    if (shared.mode === 'unlinked') {
      return '' +
        '<div class="csp-panel csp-panel--live-feed" role="status" aria-label="Player live feed">' +
          '<div class="csp-live-head"><span class="csp-pulse csp-pulse--warn"></span><div><strong>Player Live Feed</strong><span>Telegram sync is required to activate the live system.</span></div></div>' +
          '<a href="/gkniftyheads-incubator.html" class="csp-live-cta">Link Telegram</a>' +
        '</div>';
    }
    if (shared.mode === 'relink') {
      return '' +
        '<div class="csp-panel csp-panel--live-feed" role="status" aria-label="Player live feed">' +
          '<div class="csp-live-head"><span class="csp-pulse csp-pulse--warn"></span><div><strong>Player Live Feed</strong><span>Signed Telegram auth expired — relink required.</span></div></div>' +
          '<a href="/gkniftyheads-incubator.html" class="csp-live-cta">RELINK Telegram</a>' +
        '</div>';
    }
    if (shared.mode === 'sync_pending') {
      var apiSummary = shared.apiInfo && shared.apiInfo.summary ? shared.apiInfo.summary : 'API config required';
      var apiDetail = shared.apiInfo && shared.apiInfo.detail ? shared.apiInfo.detail : 'Production API not configured for this context';
      return '' +
        '<div class="csp-panel csp-panel--live-feed" role="status" aria-label="Player live feed">' +
          '<div class="csp-live-head"><span class="csp-pulse csp-pulse--warn"></span><div><strong>Sync pending</strong><span>' + esc(apiSummary + ' — ' + apiDetail) + '</span></div></div>' +
          '<div class="csp-live-row"><span class="csp-live-row-label">Arcade XP</span><span class="csp-live-row-val" data-csp-xp>' + esc(String(shared.arcadeXp)) + '</span></div>' +
          '<div class="csp-live-row"><span class="csp-live-row-label">Status</span><span class="csp-live-row-val">' + esc('Local cached only') + '</span></div>' +
        '</div>';
    }
    // Linked: inside the right rail, keep compact frame-free rows.
    // Standalone data-csp-panel mounts keep a framed csp-panel wrapper.
    var inRightRail = !!(opts && opts.inRightRail);
    var linkedRows = '' +
      '<div class="csp-section-content" role="status" aria-label="Player live feed">' +
        '<div class="csp-live-row"><span class="csp-live-row-label">Arcade XP</span><span class="csp-live-row-val" data-csp-xp>' + esc(String(shared.arcadeXp)) + '</span></div>' +
        '<div class="csp-live-row"><span class="csp-live-row-label">Block Topia</span><span class="csp-live-row-val" data-csp-bt-access>' + shared.blocktopia + '</span></div>' +
        '<div class="csp-live-row csp-live-row--latest"><span class="csp-feed-label">Latest:</span><span class="csp-feed-text">' + esc(shared.latestActivityText) + '</span></div>' +
      '</div>';
    if (inRightRail) return linkedRows;
    // Faction data belongs exclusively to the Faction Daily Ops section.
    return '' +
      '<div class="csp-panel csp-panel--live-feed" role="status" aria-label="Player live feed">' +
        linkedRows +
      '</div>';
  }

  function buildFactionDailyOpsHTML(shared) {
    if (shared.mode === 'unlinked') {
      return '<div class="csp-section-content csp-section-content--locked"><span class="csp-locked-text">Telegram sync required to unlock faction daily ops.</span></div>';
    }
    if (shared.mode === 'relink') {
      return '<div class="csp-section-content csp-section-content--locked"><span class="csp-locked-text">RELINK required to sync faction daily ops.</span></div>';
    }
    if (shared.mode === 'sync_pending') {
      return '<div class="csp-section-content csp-section-content--locked"><span class="csp-locked-text">Sync pending — API config required.</span></div>';
    }
    var contributionDisplay = shared.contribution ? shared.contribution.value : 'syncing…';
    var completedDisplay = shared.dailyCounts && shared.dailyCounts.completed != null ? String(shared.dailyCounts.completed) : 'syncing…';
    var missedTodayDisplay = shared.dailyCounts && shared.dailyCounts.missed != null ? String(shared.dailyCounts.missed) : 'syncing…';
    // Today's Missions section from confirmed daily-state
    var missionOpps = shared.dailyState && shared.dailyState.today_active && Array.isArray(shared.dailyState.today_active.mission_opportunities)
      ? shared.dailyState.today_active.mission_opportunities
      : null;
    var factionSyncLabel = shared.faction && shared.faction.faction !== 'unaligned' && shared.faction.label
      ? shared.faction.label + ' daily ops syncing\u2026'
      : 'Daily ops syncing\u2026';
    var missionsHTML;
    if (missionOpps === null) {
      missionsHTML = '<div class="csp-missions-empty">' + esc(factionSyncLabel) + '</div>';
    } else if (!missionOpps.length) {
      missionsHTML = '<div class="csp-missions-empty">No live missions reported.</div>';
    } else {
      missionsHTML = missionOpps.map(function (m) {
        var title = esc(m.title || m.name || m.label || m.mission_key || 'Mission');
        var statusClass = m.completed ? 'csp-mission--done' : 'csp-mission--pending';
        var statusLabel = m.completed ? '\u2713 ' : '\u2026 ';
        return '<div class="csp-mission-row ' + statusClass + '"><span class="csp-mission-status">' + statusLabel + '</span><span class="csp-mission-title">' + title + '</span></div>';
      }).join('');
    }
    var actionHref = shared.faction && shared.faction.faction && shared.faction.faction !== 'unaligned'
      ? '/community.html'
      : '/community.html#battle-join-faction';
    var actionLabel = 'Open';
    return '' +
      '<div class="csp-section-rows" role="status" aria-label="Faction daily ops">' +
        '<a class="csp-ops-arcade-cta" href="/games/">Play Arcade</a>' +
        '<div class="csp-ops-row"><span class="csp-ops-label">Faction</span><span class="csp-ops-val">' + esc((shared.faction.faction === 'unaligned' ? 'No faction selected' : (shared.faction.icon + ' ' + shared.faction.label))) + '</span></div>' +
        '<div class="csp-ops-row"><span class="csp-ops-label">Faction XP</span><span class="csp-ops-val">' + esc(String(shared.faction.faction_xp)) + '</span></div>' +
        '<div class="csp-ops-row"><span class="csp-ops-label">Contribution</span><span class="csp-ops-val">' + esc(contributionDisplay) + '</span></div>' +
        '<div class="csp-ops-row"><span class="csp-ops-label">Daily Ops Status</span><span class="csp-ops-val">' + esc(shared.dailyOpsStatus ? shared.dailyOpsStatus.value : 'syncing…') + '</span></div>' +
        '<div class="csp-ops-row"><span class="csp-ops-label">Completed Today</span><span class="csp-ops-val">' + esc(completedDisplay) + '</span></div>' +
        '<div class="csp-ops-row"><span class="csp-ops-label">Missed Today</span><span class="csp-ops-val">' + esc(missedTodayDisplay) + '</span></div>' +
        '<div class="csp-ops-row csp-ops-row--wide"><span class="csp-ops-label">Battle</span><span class="csp-ops-val"><a class="csp-player-link" href="' + esc(actionHref) + '">' + esc(actionLabel) + '</a></span></div>' +
        '<div class="csp-missions"><div class="csp-missions-hd">Today\'s Missions</div>' + missionsHTML + '</div>' +
      '</div>';
  }

  function buildDailyWtfSignalHTML(shared) {
    if (shared.mode === 'unlinked') {
      return '<div class="csp-section-content csp-section-content--locked"><span class="csp-locked-text">Telegram sync required to receive Daily WTF signals.</span></div>';
    }
    if (shared.mode === 'relink') {
      return '<div class="csp-section-content csp-section-content--locked"><span class="csp-locked-text">RELINK required to sync Daily WTF signal.</span></div>';
    }
    if (shared.mode === 'sync_pending') {
      return '<div class="csp-section-content csp-section-content--locked"><span class="csp-locked-text">Sync pending — API config required.</span></div>';
    }
    var wtf = shared.wtfState;
    var timer = 'syncing…';
    if (wtf && typeof wtf === 'object' && wtf.status !== 'loading') {
      if (wtf.countdown_seconds != null) {
        timer = countdownText(wtf.countdown_seconds);
      } else if (wtf.active_event || wtf.next_event || (Array.isArray(wtf.upcoming_events) && wtf.upcoming_events.length)) {
        timer = '--:--:--';
      }
    }
    // Status badge: derive directly from wtfState, not from human-readable statusText,
    // so badge and status row cannot contradict each other.
    var badgeLabel, badgeClass;
    if (!wtf || !wtf.status || wtf.status === 'loading') {
      badgeLabel = 'SYNCING'; badgeClass = 'csp-wtf-badge--syncing';
    } else if (wtf.status === 'error') {
      badgeLabel = 'UNAVAILABLE'; badgeClass = 'csp-wtf-badge--unavailable';
    } else if (wtf.active_event) {
      badgeLabel = 'ACTIVE'; badgeClass = 'csp-wtf-badge--active';
    } else if (wtf.next_event || (Array.isArray(wtf.upcoming_events) && wtf.upcoming_events.length > 0)) {
      badgeLabel = 'UPCOMING'; badgeClass = 'csp-wtf-badge--upcoming';
    } else if (Number(wtf.completed_today || 0) > 0) {
      badgeLabel = 'COMPLETE'; badgeClass = 'csp-wtf-badge--complete';
    } else if (Number(wtf.missed_today || 0) > 0) {
      badgeLabel = 'MISSED'; badgeClass = 'csp-wtf-badge--missed';
    } else {
      badgeLabel = 'WAITING'; badgeClass = 'csp-wtf-badge--waiting';
    }
    // Event title from active, next, or first upcoming event
    var eventTitle = '';
    if (wtf && typeof wtf === 'object') {
      var evObj = wtf.active_event || wtf.next_event || (Array.isArray(wtf.upcoming_events) && wtf.upcoming_events.length ? wtf.upcoming_events[0] : null);
      if (evObj && typeof evObj === 'object') {
        eventTitle = evObj.title || evObj.name || evObj.label || '';
      }
    }
    // Action button — compact right-rail copy only
    var action = '<a class="csp-player-link" href="/games/">Ready</a>';
    if (wtf && wtf.active_event && wtf.checked_in) {
      action = '<a class="csp-player-link" href="/games/">Play</a>';
    } else if (wtf && wtf.active_event && !wtf.checked_in) {
      action = '<a class="csp-player-link" href="/games/">Open</a>';
    }
    return '' +
      '<div class="csp-signal-card" role="status" aria-label="Daily WTF signal">' +
        '<div class="csp-wtf-badge ' + badgeClass + '">' + badgeLabel + '</div>' +
        (eventTitle ? '<div class="csp-wtf-event-title">' + esc(eventTitle) + '</div>' : '') +
        '<div class="csp-live-row"><span class="csp-live-row-label">Timer</span><span class="csp-live-row-val" data-csp-wtf-countdown>' + esc(timer) + '</span></div>' +
        '<div class="csp-live-row"><span class="csp-live-row-label">Action</span><span class="csp-live-row-val">' + action + '</span></div>' +
      '</div>';
  }

  function buildMissedOpportunitiesHTML(shared) {
    if (shared.mode === 'unlinked') {
      return '<div class="csp-section-content csp-section-content--locked"><span class="csp-locked-text">Telegram sync required to track missed opportunities.</span></div>';
    }
    if (shared.mode === 'relink') {
      return '<div class="csp-section-content csp-section-content--locked"><span class="csp-locked-text">RELINK required to sync missed opportunities.</span></div>';
    }
    if (shared.mode === 'sync_pending') {
      return '<div class="csp-section-content csp-section-content--locked"><span class="csp-locked-text">Sync pending — API config required.</span></div>';
    }
    var wtf = shared.wtfState || {};
    var daily = shared.dailyState || null;
    var history = Array.isArray(window.MOONBOYS_ROGUELITE_MISSED_HISTORY) ? window.MOONBOYS_ROGUELITE_MISSED_HISTORY : [];
    var missedCountAll = wtf.missed_events_all_time != null
      ? Math.max(0, Math.floor(Number(wtf.missed_events_all_time) || 0))
      : (daily && daily.missed_events_all_time != null
        ? Math.max(0, Math.floor(Number(daily.missed_events_all_time) || 0))
        : (history.length > 0 ? history.length : null));
    var missedToday = wtf.missed_events_today != null
      ? Math.max(0, Math.floor(Number(wtf.missed_events_today) || 0))
      : (daily && (daily.missed_events_today != null || daily.missed_today != null)
        ? Math.max(0, Math.floor(Number(daily.missed_events_today != null ? daily.missed_events_today : daily.missed_today) || 0))
        : null);
    var missedXpDisplay = shared.missedXp != null ? String(shared.missedXp) : 'syncing…';
    var missedTodayDisplay = missedToday != null ? String(missedToday) : 'syncing…';
    var missedCountDisplay = missedCountAll != null ? String(missedCountAll) : 'syncing…';
    return '' +
      '<div class="csp-warning-card" role="status" aria-label="Missed opportunities">' +
        '<div class="csp-missed-badge">MISSED</div>' +
        '<div class="csp-live-row"><span class="csp-live-row-label">Missed XP (all-time)</span><span class="csp-live-row-val csp-live-row-val--warn" data-csp-missed-xp>' + esc(missedXpDisplay) + '</span></div>' +
        '<div class="csp-live-row"><span class="csp-live-row-label">Missed Today</span><span class="csp-live-row-val csp-live-row-val--warn">' + esc(missedTodayDisplay) + '</span></div>' +
        '<div class="csp-live-row"><span class="csp-live-row-label">Missed Count</span><span class="csp-live-row-val csp-live-row-val--warn">' + esc(missedCountDisplay) + '</span></div>' +
      '</div>';
  }

  function panelSectionKind(el) {
    if (!el) return 'live';
    if (el.hasAttribute('data-csp-faction-ops')) return 'ops';
    if (el.hasAttribute('data-csp-wtf-signal')) return 'wtf';
    if (el.hasAttribute('data-csp-missed')) return 'missed';
    return 'live';
  }

  function isRightRailMount(el) {
    if (!el || typeof el.closest !== 'function') return false;
    return !!(el.closest('#homepage-right-panel') || el.closest('.retro-hud-box'));
  }

  async function buildSectionHTML(kind, contextEl) {
    var shared = await buildSharedRailState(false);
    if (kind === 'ops') return buildFactionDailyOpsHTML(shared);
    if (kind === 'wtf') return buildDailyWtfSignalHTML(shared);
    if (kind === 'missed') return buildMissedOpportunitiesHTML(shared);
    return buildPlayerLiveFeedHTML(shared, { inRightRail: isRightRailMount(contextEl) });
  }

  async function buildPanelHTML() {
    return buildSectionHTML('live');
  }

  async function buildBadgeHTML() {
    var linked = isLinked();
    if (!linked) {
      return '<a href="/gkniftyheads-incubator.html" class="csp-badge csp-badge--unlinked" aria-label="Telegram Sync Required"><span class="csp-pulse csp-pulse--warn"></span><span><strong>Telegram Sync Required</strong><small>Link to activate live systems</small></span></a>';
    }
    // Check for fresh signed auth — LIVE SYNC requires confirmed auth, not just localStorage linked state.
    var gate = getIdentity();
    var freshAuth = gate && typeof gate.getSignedTelegramAuth === 'function' ? gate.getSignedTelegramAuth() : null;
    // Before showing RELINK, attempt one auth restore so a linked user whose token
    // is renewable is not permanently stuck on RELINK due to hydration load order.
    if (!freshAuth && gate && typeof gate.restoreLinkedTelegramAuth === 'function') {
      var restored = await gate.restoreLinkedTelegramAuth().catch(function () { return null; });
      if (restored && restored.ok) {
        freshAuth = typeof gate.getSignedTelegramAuth === 'function'
          ? gate.getSignedTelegramAuth()
          : (restored.telegram_auth || null);
      }
    }
    if (!freshAuth) {
      // Linked in localStorage but auth is expired or missing — show RELINK state.
      var relinkName = getDisplayName() || 'Player';
      return '<a href="/gkniftyheads-incubator.html" class="csp-badge csp-badge--relink" aria-label="Re-link required"><span class="csp-pulse csp-pulse--warn"></span><span class="csp-badge-stack"><strong>RELINK</strong><small>' + esc(relinkName) + ' · Auth expired</small></span></a>';
    }
    var apiOnline = await checkApiOnline();
    if (!apiOnline || apiOnline.ok !== true) {
      return '' +
        '<span class="csp-badge csp-badge--relink" aria-label="Sync pending">' +
          '<span class="csp-pulse csp-pulse--warn"></span>' +
          '<span class="csp-badge-stack"><strong>SYNC PENDING</strong><small>' + esc((apiOnline && apiOnline.summary) || 'API config required') + '</small></span>' +
          '<span class="csp-badge-chip csp-badge-chip--warn">API?</span>' +
        '</span>';
    }
    var name = getDisplayName();
    var progression = await fetchRequiredXp();
    var arcadeXp = getArcadeXp();
    var requiredXp = progression.requiredXp;
    var progressionConfirmed = progression.confirmed === true;
    var serverLinkedConfirmed = isServerLinkedConfirmed();
    var blocktopiaStatus = resolveBlocktopiaAccessState(linked, arcadeXp, requiredXp, serverLinkedConfirmed, progressionConfirmed);
    return '' +
      '<span class="csp-badge csp-badge--linked" aria-label="Live sync active">' +
        '<span class="csp-pulse"></span>' +
        '<span class="csp-badge-stack"><strong>LIVE SYNC</strong><small>' + esc(name || 'Player') + ' · XP <span data-csp-badge-xp>' + arcadeXp + '</span></small></span>' +
        '<span class="csp-badge-chip" data-csp-badge-bt>' + blocktopiaBadgeLabel(blocktopiaStatus) + '</span>' +
        '<span class="csp-badge-chip csp-badge-chip--good">API</span>' +
      '</span>';
  }

  // ── CSS injection ──────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      /* Panel */
      '.csp-panel{padding:14px 16px;border:1px solid rgba(86,220,255,.28);border-radius:12px;background:linear-gradient(165deg,rgba(10,23,44,.82),rgba(8,18,34,.72));font-size:.85rem;color:var(--color-text,#e6f0ff)}',
      '.csp-row{display:flex;align-items:center;gap:8px;margin-bottom:12px}',
      '.csp-row--identity{font-size:.92rem}',
      '.csp-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}',
      '.csp-dot--green{background:#3fb950;box-shadow:0 0 6px #3fb950}',
      '.csp-dot--red{background:#f85149;box-shadow:0 0 6px #f85149}',
      '.csp-link{color:#56dcff;text-decoration:underline}',
      '.csp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}',
      '.csp-item{background:rgba(86,220,255,.05);border:1px solid rgba(86,220,255,.15);border-radius:8px;padding:8px 10px}',
      '.csp-item--wide{grid-column:1/-1}',
      '.csp-item-label{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted,#8b949e);display:flex;align-items:baseline;gap:6px}',
      '.csp-item-note{font-size:.65rem;font-weight:400;text-transform:none;letter-spacing:0;opacity:.7}',
      '.csp-item-val{font-size:.88rem;font-weight:600;margin-top:4px;color:var(--color-text,#e6f0ff)}',
      '.csp-item-val--warn{color:#f7c948}',
      '.csp-item-val--badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:.75rem;font-weight:700}',
      '.csp-badge--good{background:rgba(63,185,80,.15);border:1px solid rgba(63,185,80,.5);color:#3fb950}',
      '.csp-badge--warn{background:rgba(210,153,34,.15);border:1px solid rgba(210,153,34,.5);color:#d2991d}',
      '.csp-badge--bad{background:rgba(248,81,73,.12);border:1px solid rgba(248,81,73,.4);color:#f85149}',
      '.csp-val-good{color:#3fb950}',
      '.csp-val-locked{color:var(--color-text-muted,#8b949e)}',
      '.csp-panel--live-feed{border-color:rgba(0,229,255,.36);box-shadow:0 0 18px rgba(0,229,255,.14),inset 0 0 18px rgba(255,45,120,.05)}',
      '.csp-live-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}',
      '.csp-live-head strong{display:block;color:#fff;text-transform:uppercase;letter-spacing:.06em}',
      '.csp-live-head span{display:block;color:var(--color-text-muted,#8b949e);font-size:.72rem}',
      '.csp-live-pill{display:inline-flex!important;padding:2px 6px;border-radius:999px;border:1px solid rgba(86,220,255,.28);font-size:.58rem!important;letter-spacing:.04em;margin-top:4px}',
      '.csp-live-pill--good{color:#3fb950;background:rgba(63,185,80,.12);border-color:rgba(63,185,80,.4)}',
      '.csp-grid--live{grid-template-columns:1fr;gap:7px}',
      '.csp-feed{margin-top:10px;padding-top:9px;border-top:1px solid rgba(86,220,255,.16)}',
      '.csp-feed--latest{margin-top:8px;padding-top:8px}',
      '.csp-feed-title{font-size:.64rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#56dcff;margin-bottom:6px}',
      '.csp-feed-row{display:flex;gap:6px;align-items:flex-start;padding:4px 0;border-bottom:1px solid rgba(86,220,255,.08);font-size:.72rem;line-height:1.22}',
      '.csp-feed-row--latest{padding:3px 0 0;border-bottom:0;gap:5px;font-size:.68rem;line-height:1.2;color:var(--color-text-muted,#8b949e)}',
      '.csp-feed-label{flex:0 0 auto;color:var(--color-text-muted,#8b949e);font-size:.62rem;font-weight:700;letter-spacing:.02em;line-height:1.18}',
      '.csp-feed-text{flex:1 1 auto;min-width:0;font-size:.7rem;line-height:1.22;overflow-wrap:anywhere}',
      '.csp-feed-tag{flex:0 0 auto;color:#f7c948;font-weight:800;text-transform:uppercase;font-size:.58rem;border:1px solid rgba(247,201,72,.35);padding:1px 4px}',
      '.csp-feed-empty{color:var(--color-text-muted,#8b949e);font-size:.72rem;line-height:1.45}',
      '.csp-live-cta{display:inline-flex;margin-top:8px;padding:7px 9px;border:1px solid rgba(0,229,255,.45);color:#c8f0ff;text-decoration:none;background:rgba(0,229,255,.08);font-weight:800;text-transform:uppercase;font-size:.68rem}',
      '.csp-pulse{width:8px;height:8px;border-radius:999px;background:#3fb950;box-shadow:0 0 10px #3fb950;display:inline-block;flex:0 0 auto;animation:cspPulse 1.2s infinite}',
      '.csp-pulse--warn{background:#f7c948;box-shadow:0 0 10px #f7c948}',
      '@keyframes cspPulse{0%,100%{opacity:.55;transform:scale(.9)}50%{opacity:1;transform:scale(1.15)}}',
      /* Compact section content wrappers — inner renderers use these instead of csp-panel */
      '.csp-section-content{font-size:.85rem;color:var(--color-text,#e6f0ff)}',
      '.csp-section-content--locked{padding:4px 0}',
      '.csp-locked-text{font-size:.72rem;color:var(--color-text-muted,#8b949e)}',
      /* Compact HUD rows — Player Live Feed and signal/warning modules */
      '.csp-live-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0;padding:4px 0;border-bottom:1px solid rgba(86,220,255,.08);font-size:.8rem;line-height:1.24}',
      '.csp-live-row--latest{border-bottom:0;padding-top:6px;gap:6px;font-size:.72rem;line-height:1.22;color:var(--color-text-muted,#8b949e)}',
      '.csp-live-row-label{flex:0 0 auto;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted,#8b949e);line-height:1.2}',
      '.csp-live-row-val{flex:1 1 auto;min-width:0;text-align:right;font-size:.84rem;font-weight:600;line-height:1.24;color:var(--color-text,#e6f0ff)}',
      '.csp-live-row-val--warn{color:#f7c948}',
      /* Compact ops rows — Faction Daily Ops */
      '.csp-section-rows{font-size:.85rem;color:var(--color-text,#e6f0ff)}',
      '.csp-ops-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0;padding:4px 0;border-bottom:1px solid rgba(86,220,255,.08);font-size:.8rem;line-height:1.24}',
      '.csp-ops-row--wide{gap:8px}',
      '.csp-ops-label{flex:0 0 auto;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted,#8b949e);line-height:1.2}',
      '.csp-ops-val{flex:1 1 auto;min-width:0;text-align:right;font-size:.84rem;font-weight:600;line-height:1.24;color:var(--color-text,#e6f0ff)}',
      /* Signal card — Daily WTF Signal */
      '.csp-signal-card{font-size:.85rem;color:var(--color-text,#e6f0ff)}',
      /* Warning card — Missed Opportunities */
      '.csp-warning-card{font-size:.85rem;color:var(--color-text,#e6f0ff)}',
      /* Global header badge */
      '#moonboys-global-status-badge{display:flex;align-items:center;margin-left:auto}',
      '.csp-badge{display:inline-flex;align-items:center;gap:7px;padding:5px 9px;border-radius:99px;font-size:.72rem;font-weight:700;white-space:nowrap;max-width:340px;overflow:hidden;text-overflow:ellipsis}',
      '.csp-badge strong{display:block;font-size:.62rem;letter-spacing:.08em;color:#fff}.csp-badge small{display:block;font-size:.66rem;font-weight:600;color:#c8f0ff;overflow:hidden;text-overflow:ellipsis}',
      '.csp-badge-stack{min-width:0;line-height:1.15}',
      '.csp-badge-chip{font-size:.56rem;border:1px solid rgba(86,220,255,.28);border-radius:99px;padding:2px 5px;color:#56dcff;background:rgba(86,220,255,.08)}',
      '.csp-badge-chip--good{color:#3fb950;border-color:rgba(63,185,80,.35)}.csp-badge-chip--warn{color:#f7c948;border-color:rgba(247,201,72,.35)}',
      '.csp-badge--linked{background:rgba(86,220,255,.1);border:1px solid rgba(86,220,255,.35);color:#c8f0ff;box-shadow:0 0 12px rgba(86,220,255,.12)}',
      '.csp-badge--unlinked{background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.35);color:#ffd0cd;text-decoration:none}',
      '.csp-badge--relink{background:rgba(247,201,72,.08);border:1px solid rgba(247,201,72,.45);color:#f7e29a;text-decoration:none}',
      /* Loading placeholder */
      '.csp-loading{color:var(--color-text-muted,#8b949e);font-size:.82rem;padding:10px 0}',
      /* Faction ops Play Arcade CTA */
      '.csp-ops-arcade-cta{display:inline-flex;margin-bottom:10px;padding:6px 12px;border:1px solid rgba(86,220,255,.5);color:#c8f0ff;text-decoration:none;background:rgba(86,220,255,.1);font-weight:800;text-transform:uppercase;font-size:.68rem;border-radius:6px}',
      '.csp-ops-arcade-cta:hover{background:rgba(86,220,255,.18)}',
      /* Today\'s Missions */
      '.csp-missions{margin-top:10px;padding-top:9px;border-top:1px solid rgba(86,220,255,.16)}',
      '.csp-missions-hd{font-size:.64rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#56dcff;margin-bottom:6px;line-height:1.2}',
      '.csp-missions-empty{color:var(--color-text-muted,#8b949e);font-size:.72rem;font-style:italic;line-height:1.3}',
      '.csp-mission-row{display:flex;align-items:baseline;gap:6px;min-width:0;padding:3px 0;font-size:.78rem;line-height:1.22}',
      '.csp-mission-status{flex:0 0 auto;font-size:.7rem;line-height:1.14}',
      '.csp-mission-title{flex:1 1 auto;min-width:0;font-size:.74rem;line-height:1.22;overflow-wrap:anywhere}',
      '.csp-mission--done .csp-mission-title{color:var(--color-text-muted,#8b949e);text-decoration:line-through}',
      '.csp-mission--done .csp-mission-status{color:#3fb950}',
      '.csp-mission--pending .csp-mission-status{color:#f7c948}',
      /* WTF status badge */
      '.csp-wtf-badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:.65rem;line-height:1.18;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}',
      '.csp-wtf-badge--active{background:rgba(63,185,80,.15);border:1px solid rgba(63,185,80,.5);color:#3fb950}',
      '.csp-wtf-badge--upcoming{background:rgba(86,220,255,.1);border:1px solid rgba(86,220,255,.4);color:#56dcff}',
      '.csp-wtf-badge--complete{background:rgba(100,100,255,.1);border:1px solid rgba(100,100,255,.35);color:#a5b4fc}',
      '.csp-wtf-badge--missed{background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.4);color:#f85149}',
      '.csp-wtf-badge--syncing{background:rgba(86,220,255,.05);border:1px solid rgba(86,220,255,.2);color:var(--color-text-muted,#8b949e)}',
      '.csp-wtf-badge--waiting{background:rgba(180,180,180,.06);border:1px solid rgba(180,180,180,.25);color:var(--color-text-muted,#8b949e)}',
      '.csp-wtf-badge--unavailable{background:rgba(248,81,73,.07);border:1px solid rgba(248,81,73,.3);color:#f85149}',
      '.csp-wtf-event-title{font-size:.8rem;line-height:1.24;font-weight:600;color:#e6f0ff;margin-bottom:8px}',
      /* Missed badge */
      '.csp-missed-badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:.65rem;line-height:1.18;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;background:rgba(248,81,73,.12);border:1px solid rgba(248,81,73,.45);color:#f85149}',
      /* Right-rail compact layout guard (keep base typography; scope truncation to rail only) */
      '#homepage-right-panel .csp-feed-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;overflow-wrap:normal}',
      '#homepage-right-panel .csp-live-row-val{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#homepage-right-panel .csp-ops-val{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#homepage-right-panel .csp-mission-row{white-space:nowrap}',
      '#homepage-right-panel .csp-mission-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;overflow-wrap:normal}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  // ── Public mount helpers ───────────────────────────────────────────────

  /**
   * Mounts the full status panel into a container element.
   * Uses a per-element render token (stored in dataset) so an older async
   * render that completes after a newer one was started does not overwrite it.
   */
  async function mount(containerOrId) {
    var el = typeof containerOrId === 'string'
      ? document.getElementById(containerOrId)
      : containerOrId;
    if (!el) return;
    injectStyles();
    // Increment the token so any render started before this call can detect
    // that a newer render is now in progress and must not write its result.
    var token = (Number(el.dataset.cspToken || 0) + 1);
    el.dataset.cspToken = String(token);
    el.innerHTML = '<div class="csp-loading">Checking status…</div>';
    var html = await buildSectionHTML(panelSectionKind(el), el);
    // Only commit the result if no newer render was launched after us.
    if (String(el.dataset.cspToken) === String(token)) {
      el.innerHTML = html;
    }
  }

  function mountAllSections() {
    allRailSectionElements().forEach(function (el) { mount(el); });
  }

  function updateWtfCountdownUI() {
    var state = currentWtfState();
    var timer = 'syncing…';
    if (state && typeof state === 'object' && state.status !== 'loading') {
      if (state.countdown_seconds != null) {
        timer = countdownText(state.countdown_seconds);
      } else if (state.active_event || state.next_event || (Array.isArray(state.upcoming_events) && state.upcoming_events.length)) {
        timer = '--:--:--';
      }
    }
    document.querySelectorAll('[data-csp-wtf-countdown]').forEach(function (el) {
      el.textContent = timer;
    });
  }

  /**
   * Mounts the compact header badge into a container element.
   * Uses the same render-token pattern as mount() to prevent stale writes.
   */
  async function mountBadge(containerOrId) {
    var el = typeof containerOrId === 'string'
      ? document.getElementById(containerOrId)
      : containerOrId;
    if (!el) return;
    injectStyles();
    var token = (Number(el.dataset.cspToken || 0) + 1);
    el.dataset.cspToken = String(token);
    var html = await buildBadgeHTML();
    if (String(el.dataset.cspToken) === String(token)) {
      el.innerHTML = html;
    }
  }

  // ── Global badge injection into header ────────────────────────────────

  function injectGlobalBadge() {
    if (document.getElementById('moonboys-global-status-badge')) return;
    var wrap = document.createElement('div');
    wrap.id = 'moonboys-global-status-badge';
    wrap.setAttribute('aria-live', 'polite');
    var header = document.getElementById('site-header');
    if (!header) return; // No wiki-shell header on this page.
    header.appendChild(wrap);
    mountBadge(wrap);
  }

  // ── Reactive refresh on identity/faction events ────────────────────────

  /**
   * Full invalidate-and-remount.  Only called on non-XP state changes that
   * require a full rerender: identity/sync localStorage changes (e.g. Telegram
   * link/unlink).  XP, faction, and BT access are handled inline by the
   * MOONBOYS_STATE.subscribe() callback — no remount needed for those.
   */
  function invalidateAndRefresh() {
    _progressionCache = null;
    _progressionInflight = null;
    _dailyStateCache = null;
    _dailyStateInflight = null;
    _dailyStateGeneration++;
    _playerStateCache = null;
    _playerStateInflight = null;
    _playerStateGeneration++;
    _apiOnlineCache = null;
    invalidateSharedRailState();
    mountAllSections();
    var badge = document.getElementById('moonboys-global-status-badge');
    if (badge) mountBadge(badge);
  }

  function invalidateDailyStateCache() {
    _dailyStateCache = null;
    // Intentionally keep inflight request alive; generation guard will ignore stale completion.
    _dailyStateGeneration++;
    _sharedRailStateCache = null;
  }

  function invalidatePlayerStateCache() {
    _playerStateCache = null;
    // Intentionally keep inflight request alive; generation guard will ignore stale completion.
    _playerStateGeneration++;
    _sharedRailStateCache = null;
  }

  function scheduleLiveDataRefresh() {
    if (_liveDataRefreshTimer) clearTimeout(_liveDataRefreshTimer);
    _liveDataRefreshTimer = setTimeout(function () {
      _liveDataRefreshTimer = null;
      if (isLinked()) {
        maybeRefreshFactionStatus();
      }
      invalidateDailyStateCache();
      invalidatePlayerStateCache();
      invalidateSharedRailState();
      mountAllSections();
    }, 120);
  }

  function maybeRefreshFactionStatus() {
    var factionApi = window.MOONBOYS_FACTION;
    if (!factionApi || typeof factionApi.loadStatus !== 'function') return Promise.resolve(null);
    if (_factionStatusInflight) return _factionStatusInflight;
    if ((Date.now() - _lastFactionStatusLoadAt) < FACTION_STATUS_LOAD_THROTTLE_MS) return Promise.resolve(null);
    _lastFactionStatusLoadAt = Date.now();
    _factionStatusInflight = factionApi.loadStatus()
      .catch(function () { return null; })
      .finally(function () { _factionStatusInflight = null; });
    return _factionStatusInflight;
  }

  function schedulePanelRemount() {
    // Share the same timer as scheduleLiveDataRefresh so a newer refresh intent
    // (invalidate+remount or remount-only) supersedes any pending older one.
    if (_liveDataRefreshTimer) clearTimeout(_liveDataRefreshTimer);
    _liveDataRefreshTimer = setTimeout(function () {
      _liveDataRefreshTimer = null;
      invalidateSharedRailState();
      mountAllSections();
    }, 0);
  }

  function listenForUpdates() {
    // Storage listener: remount panel only on identity/sync changes that are
    // persisted in localStorage (e.g. Telegram link state).
    // moonboys_state_v1 changes are handled via MOONBOYS_STATE.subscribe() below.
    // moonboys_faction_status_v1 changes are covered by MOONBOYS_STATE (faction
    // arrives via the bus and is written to state by moonboys-state.js).
    window.addEventListener('storage', function (e) {
      if (
        e.key &&
        e.key.startsWith('moonboys_') &&
        e.key !== 'moonboys_state_v1' &&
        e.key !== 'moonboys_faction_status_v1'
      ) {
        invalidateAndRefresh();
      }
    });

    // Subscribe to MOONBOYS_STATE for instant inline updates.
    // XP and Block Topia access state are patched without remounting
    // the entire panel — no API re-fetch, no full DOM replacement.
    if (window.MOONBOYS_STATE && typeof window.MOONBOYS_STATE.subscribe === 'function') {
      if (_stateUnsub) { try { _stateUnsub(); } catch (_) {} }
      _stateUnsub = window.MOONBOYS_STATE.subscribe(function (state) {
        var linked = isLinked();

        // ── Arcade XP ─────────────────────────────────────────────────────────
        document.querySelectorAll('[data-csp-xp]').forEach(function (el) {
          el.textContent = linked ? String(state.xp) : '—';
        });
        var badge = document.getElementById('moonboys-global-status-badge');
        if (badge) {
          var xpNode = badge.querySelector('[data-csp-badge-xp]');
          if (xpNode) xpNode.textContent = String(state.xp);
        }

        // ── Block Topia access state ──────────────────────────────────────────
        var requiredXp = (_progressionCache && _progressionCache.requiredXp) || FALLBACK_REQUIRED_XP;
        var progressionConfirmed = !!(_progressionCache && _progressionCache.confirmed === true);
        var serverLinkedConfirmed = !!(state && state.linked === true && state.source === 'server');
        var blocktopiaStatus = resolveBlocktopiaAccessState(linked, state.xp, requiredXp, serverLinkedConfirmed, progressionConfirmed);

        document.querySelectorAll('[data-csp-bt-access]').forEach(function (el) {
          el.innerHTML = blocktopiaAccessHTML(linked, state.xp, requiredXp, serverLinkedConfirmed, progressionConfirmed);
        });

        if (badge) {
          var btNode = badge.querySelector('[data-csp-badge-bt]');
          if (btNode) btNode.textContent = blocktopiaBadgeLabel(blocktopiaStatus);
        }
      });
    }

    [
      'battle-chamber:faction-data-ready',
      'battle-chamber:activity-ready',
      'moonboys:wtf-events-ready',
      'moonboys:wtf-event-checkin',
      'moonboys:wtf-event-complete',
      'moonboys:roguelite-options-unlocked',
      'moonboys:faction-boost',
      'moonboys:sync-state',
      'moonboys:score-updated',
    ].forEach(function (eventName) {
      window.addEventListener(eventName, scheduleLiveDataRefresh);
    });
    window.addEventListener('moonboys:wtf-countdown-tick', updateWtfCountdownUI);
    window.addEventListener('moonboys:faction-status', function (e) {
      var detail = e && e.detail ? e.detail : null;
      if (detail && detail.source === 'load') return;
      scheduleLiveDataRefresh();
    });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────

  function bootstrap() {
    injectStyles();
    injectGlobalBadge();
    listenForUpdates();
    mountAllSections();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  // ── Public API ─────────────────────────────────────────────────────────

  window.MOONBOYS_STATUS_PANEL = {
    mount: mount,
    mountBadge: mountBadge,
    refresh: invalidateAndRefresh,
    /** Shared API-online check — returns a Promise<boolean>. Other components
     *  must delegate here instead of issuing their own HEAD request so there
     *  is a single source of truth and no duplicate polling. */
    checkApiOnline: checkApiOnline,
    getSharedRailState: function (opts) {
      return buildSharedRailState(!!(opts && opts.force));
    },
    peekSharedRailState: function () {
      return _sharedRailStateCache;
    },
  };

}());
