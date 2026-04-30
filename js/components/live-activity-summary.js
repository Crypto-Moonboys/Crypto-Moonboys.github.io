/**
 * Crypto Moonboys — Live Activity Summary
 * =========================================
 * Shared frontend helper showing current player activity state.
 *
 * Shows:
 *   - Core API: online / unavailable
 *     (never shows "not connected" when BASE_URL is set — only "unavailable" if a
 *      network call fails, or "not configured" when BASE_URL is genuinely absent)
 *   - Identity / sync state (from MOONBOYS_IDENTITY)
 *   - Current faction state (from MOONBOYS_FACTION)
 *   - Clear fallback text when individual features are unavailable
 *
 * XP labels enforced:
 *   Score         = leaderboard ranking
 *   Arcade XP     = multiplayer gate progress (Block Topia entry)
 *   Block Topia XP = in-game progression only
 *   Faction       = faction alignment only
 *
 * Usage — auto-mount:
 *   <div data-las-panel></div>
 *   (script auto-mounts all elements with that attribute on DOMContentLoaded)
 *
 * Usage — manual:
 *   window.MOONBOYS_LIVE_ACTIVITY.mount(elementOrId)
 *   window.MOONBOYS_LIVE_ACTIVITY.refresh()
 *
 * Depends on (all optional — graceful fallback if absent):
 *   window.MOONBOYS_API          (api-config.js)
 *   window.MOONBOYS_IDENTITY     (identity-gate.js)
 *   window.MOONBOYS_FACTION      (faction-alignment.js)
 *   window.MOONBOYS_STATUS_PANEL (connection-status-panel.js)
 */
(function () {
  'use strict';

  var STYLE_ID = 'las-styles';
  var LOG_MAX = 6; // max recent activity entries to show

  // ── In-memory activity log ────────────────────────────────────────────────
  // Shared across all LAS instances on the page; survives refreshes.
  var _activityLog = [];

  function buildLogRowHTML(e) {
    var icon = e.type === 'xp' ? '⚡' : e.type === 'faction' ? '🏴' : e.type === 'sync' ? '🔗' : '📡';
    return '<div class="las-event-row">' +
      '<span class="las-event-time">' + esc(e.time) + '</span>' +
      '<span class="las-event-icon" aria-hidden="true">' + icon + '</span>' +
      '<span class="las-event-text">' + esc(e.text) + '</span>' +
      '</div>';
  }

  function addToLog(entry) {
    _activityLog.unshift(entry);
    if (_activityLog.length > LOG_MAX) _activityLog.length = LOG_MAX;

    // Bus is mandatory: global-event-bus.js is listed before this file on
    // every page (see load order in HTML).  Guard is kept as a belt-and-suspenders
    // safeguard in case the load order ever changes.
    if (!window.MOONBOYS_EVENT_BUS || typeof window.MOONBOYS_EVENT_BUS.emit !== 'function') {
      console.warn('[live-activity-summary] MOONBOYS_EVENT_BUS unavailable — activity:event not emitted.');
      return;
    }
    window.MOONBOYS_EVENT_BUS.emit('activity:event', entry);

    // ── Performance: append directly to existing log containers ────────────
    // Avoids a full async panel remount on every event.  Only fall back to
    // full remount when the log container doesn't exist yet (first event).
    var logContainers = document.querySelectorAll('[data-las-panel] [data-las-log]');
    if (logContainers.length > 0) {
      var rowHTML = buildLogRowHTML(entry);
      logContainers.forEach(function (logEl) {
        var tmp = document.createElement('div');
        tmp.innerHTML = rowHTML;
        logEl.insertBefore(tmp.firstChild, logEl.firstChild);
        // Trim rows beyond LOG_MAX.
        while (logEl.children.length > LOG_MAX) {
          logEl.removeChild(logEl.lastChild);
        }
      });
    } else {
      // Panels exist but haven't rendered the log container yet; do one full mount.
      document.querySelectorAll('[data-las-panel]').forEach(function (el) { mount(el); });
    }
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatTime() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function buildLogEntry(type, text) {
    return { type: type, text: text, time: formatTime(), ts: Date.now() };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getApiBase() {
    var cfg = window.MOONBOYS_API || {};
    return cfg.BASE_URL ? String(cfg.BASE_URL).replace(/\/$/, '') : '';
  }

  function isLinked() {
    var gate = window.MOONBOYS_IDENTITY;
    return !!(gate && typeof gate.isTelegramLinked === 'function' && gate.isTelegramLinked());
  }

  function getFactionStatus() {
    var fa = window.MOONBOYS_FACTION;
    if (!fa) return null;
    return fa.getCachedStatus() || { faction: 'unaligned', faction_xp: 0 };
  }

  // ── API online check ─────────────────────────────────────────────────────
  // Delegates to MOONBOYS_STATUS_PANEL.checkApiOnline() (connection-status-panel.js)
  // so there is ONE source of truth and no duplicate HTTP polling.
  // The local fallback runs only when CSP has not loaded on this page.

  var _apiOnlineCache = null;
  var _apiOnlineInflight = null;

  function checkApiOnline() {
    // Preferred: reuse the shared cache from MOONBOYS_STATUS_PANEL.
    var csp = window.MOONBOYS_STATUS_PANEL;
    if (csp && typeof csp.checkApiOnline === 'function') {
      return csp.checkApiOnline();
    }
    // Local fallback for pages where CSP is not loaded.
    if (_apiOnlineCache !== null) return Promise.resolve(_apiOnlineCache);
    if (_apiOnlineInflight !== null) return _apiOnlineInflight;

    _apiOnlineInflight = (async function () {
      var apiBase = getApiBase();
      if (!apiBase) {
        _apiOnlineCache = false;
        _apiOnlineInflight = null;
        return false;
      }
      var ac = new AbortController();
      var timer = setTimeout(function () { ac.abort(); }, 4000);
      var online = false;
      try {
        var res = await fetch(apiBase, { method: 'HEAD', signal: ac.signal });
        online = res.status < 500;
      } catch (_) {
        online = false;
      } finally {
        clearTimeout(timer);
      }
      _apiOnlineCache = online;
      _apiOnlineInflight = null;
      return online;
    }());

    return _apiOnlineInflight;
  }

  // ── Sync / identity summary ───────────────────────────────────────────────
  // Four distinct cases — never collapsed:
  //   1. Identity layer missing  → "Identity system unavailable"
  //   2. Identity present, not linked → "Telegram not linked — run /gklink"
  //   3. Linked, not yet synced  → "Sync in progress"
  //   4. Linked + valid          → "Sync ready"

  function syncSummary() {
    var gate = window.MOONBOYS_IDENTITY;

    // Case 1: identity layer not loaded
    if (!gate || typeof gate.getSyncState !== 'function') {
      return { text: 'Identity system unavailable', good: false };
    }

    var state = gate.getSyncState();

    // Case 2: identity present but Telegram not linked
    if (!state || !state.linked) {
      return { text: 'Telegram not linked — run /gklink', good: false };
    }

    // Case 4: linked and fully synced
    if (state.good) {
      return { text: 'Sync ready', good: true };
    }

    // Case 3: linked but auth not yet resolved (pending, expired, etc.)
    return { text: 'Sync in progress', good: false };
  }

  // ── Faction summary ──────────────────────────────────────────────────────

  function factionSummary(status) {
    if (!status || !status.faction || status.faction === 'unaligned') {
      return 'No faction selected';
    }
    var fa = window.MOONBOYS_FACTION;
    var meta = fa && typeof fa.getVisualMeta === 'function' ? fa.getVisualMeta(status.faction) : null;
    return meta ? (meta.icon + ' ' + meta.label) : String(status.faction);
  }

  // ── Inline DOM patchers ──────────────────────────────────────────────────
  // These are the ONLY way UI rows update after initial mount.
  // No remount, no refresh() call — only targeted textContent / className patches.

  /**
   * Patches all rendered faction rows across every mounted LAS panel.
   * Called from the MOONBOYS_STATE subscriber whenever state.faction changes.
   */
  function updateFactionUI(faction) {
    var factionText = factionSummary(faction ? { faction: faction } : getFactionStatus());
    document.querySelectorAll('[data-las-panel] [data-las-faction]').forEach(function (el) {
      el.textContent = factionText;
    });
  }

  /**
   * Patches all rendered sync rows across every mounted LAS panel.
   * Call sites:
   *   1. MOONBOYS_STATE.subscribe() — keeps the row current when XP/faction state changes.
   *   2. bus.on('sync:state') — patches the row immediately when a sync event fires,
   *      since MOONBOYS_STATE does not carry sync/identity state.
   * Reads sync state synchronously from MOONBOYS_IDENTITY (always available).
   */
  function updateSyncUI() {
    var sync = syncSummary();
    document.querySelectorAll('[data-las-panel] [data-las-sync]').forEach(function (el) {
      el.textContent = sync.text;
      el.className = 'las-val ' + (sync.good ? 'las-val--good' : 'las-val--warn');
    });
  }

  // ── Build HTML ────────────────────────────────────────────────────────────

  function buildLogHTML() {
    if (!_activityLog.length) return '';
    var rows = _activityLog.map(buildLogRowHTML).join('');
    return '<div class="las-event-log" aria-label="Recent activity" data-las-log>' + rows + '</div>';
  }

  async function buildHTML() {
    var linked = isLinked();
    var faction = getFactionStatus();
    var apiBase = getApiBase();
    var sync = syncSummary();
    var factionText = factionSummary(faction);

    // Determine API status label.
    // "not configured" when BASE_URL is absent; "unavailable" only when a
    // live request fails — never "not connected".
    var apiStatusText;
    var apiStatusClass;
    if (!apiBase) {
      apiStatusText = 'Core API not configured';
      apiStatusClass = 'las-val--warn';
    } else {
      var online = await checkApiOnline();
      if (online) {
        apiStatusText = 'Core API online';
        apiStatusClass = 'las-val--good';
      } else {
        apiStatusText = 'Core API unavailable';
        apiStatusClass = 'las-val--bad';
      }
    }

    return (
      '<div class="las-panel" role="status" aria-label="Live activity summary">' +
        '<div class="las-row">' +
          '<span class="las-label">Core API</span>' +
          '<span class="las-val ' + apiStatusClass + '">' + esc(apiStatusText) + '</span>' +
        '</div>' +
        '<div class="las-row">' +
          '<span class="las-label">Sync</span>' +
          '<span class="las-val ' + (sync.good ? 'las-val--good' : 'las-val--warn') + '" data-las-sync>' +
            esc(sync.text) +
          '</span>' +
        '</div>' +
        '<div class="las-row">' +
          '<span class="las-label">Faction</span>' +
          '<span class="las-val" data-las-faction>' + esc(factionText) + '</span>' +
        '</div>' +
        (!linked
          ? '<div class="las-row las-row--cta">' +
              '<a href="/gkniftyheads-incubator.html" class="las-link">' +
                '🔗 Link Telegram to activate Arcade XP &amp; Faction XP sync' +
              '</a>' +
            '</div>'
          : '') +
        buildLogHTML() +
      '</div>'
    );
  }

  // ── CSS ───────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.las-panel{padding:10px 14px;border:1px solid rgba(86,220,255,.18);border-radius:10px;background:linear-gradient(165deg,rgba(10,23,44,.7),rgba(8,18,34,.6));font-size:.82rem;color:var(--color-text,#e6f0ff);display:flex;flex-direction:column;gap:6px}',
      '.las-row{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}',
      '.las-row--cta{margin-top:4px}',
      '.las-label{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted,#8b949e);flex-shrink:0;min-width:80px}',
      '.las-val{font-size:.82rem;color:var(--color-text,#e6f0ff)}',
      '.las-val--good{color:#3fb950}',
      '.las-val--bad{color:#f85149}',
      '.las-val--warn{color:#d2991d}',
      '.las-link{color:#56dcff;text-decoration:underline;font-size:.8rem}',
      '.las-event-log{margin-top:6px;border-top:1px solid rgba(86,220,255,.1);padding-top:6px;display:flex;flex-direction:column;gap:3px}',
      '.las-event-row{display:flex;align-items:baseline;gap:5px;font-size:.75rem}',
      '.las-event-time{color:var(--color-text-muted,#8b949e);flex-shrink:0;font-size:.68rem}',
      '.las-event-icon{flex-shrink:0}',
      '.las-event-text{color:var(--color-text,#e6f0ff);opacity:.85}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  // ── Mount ────────────────────────────────────────────────────────────────

  async function mount(containerOrId) {
    var el = typeof containerOrId === 'string'
      ? document.getElementById(containerOrId)
      : containerOrId;
    if (!el) return;
    injectStyles();
    var token = (Number(el.dataset.lasToken || 0) + 1);
    el.dataset.lasToken = String(token);
    el.innerHTML = '<div style="color:var(--color-text-muted,#8b949e);font-size:.82rem;padding:6px 0">Checking activity\u2026</div>';
    var html = await buildHTML();
    if (String(el.dataset.lasToken) === String(token)) {
      el.innerHTML = html;
    }
  }

  function refresh() {
    // Clear local fallback cache only (when CSP is present its own cache governs).
    _apiOnlineCache = null;
    _apiOnlineInflight = null;
    document.querySelectorAll('[data-las-panel]').forEach(function (el) { mount(el); });
  }

  // ── Event log listeners ───────────────────────────────────────────────────

  function listenForActivity() {
    var bus = window.MOONBOYS_EVENT_BUS;
    bus.on('xp:update', function (d) {
      var amount = Number(d.amount || 0);
      var total = Number(d.total || 0);
      var text = amount > 0
        ? 'Arcade XP +' + amount + (total ? ' (total ' + total + ')' : '')
        : 'Arcade XP synced';
      addToLog(buildLogEntry('xp', text));
    });

    bus.on('faction:update', function (d) {
      // Only log user-initiated events.  faction-alignment.js sets d.source
      // to 'join', 'earn', etc. for real actions; initial page-load fetches
      // arrive without a source (or source === 'load') and are skipped here.
      if (!d.source || d.source === 'load') return;
      var fa = window.MOONBOYS_FACTION;
      var meta = fa && typeof fa.getVisualMeta === 'function' ? fa.getVisualMeta(d.faction) : null;
      var fLabel = meta ? (meta.icon + ' ' + meta.label) : String(d.faction || 'faction');
      var text = d.source === 'join'
        ? 'Joined ' + fLabel
        : 'Faction XP earned (' + fLabel + ')';
      addToLog(buildLogEntry('faction', text));
    });

    bus.on('sync:state', function (d) {
      var text = d.state === 'good' || d.state === 'xp_awarded' || d.state === 'accepted_no_xp'
        ? 'Sync complete'
        : d.state === 'bad' ? 'Sync issue detected' : 'Syncing\u2026';
      addToLog(buildLogEntry('sync', text));
      // Also patch the sync row immediately — MOONBOYS_STATE does not track
      // sync state, so the bus event is the only trigger available here.
      updateSyncUI();
    });

    // Score updates arrive via the bus bridge as activity:event with _src set.
    bus.on('activity:event', function (d) {
      if (d._src === 'moonboys:score-updated') {
        var text = 'Score recorded' + (d.game ? ' (' + d.game + ')' : '');
        addToLog(buildLogEntry('score', text));
      }
    });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  function bootstrap() {
    injectStyles();
    document.querySelectorAll('[data-las-panel]').forEach(function (el) { mount(el); });

    // State is truth, bus is events only.
    // After initial mount, all UI state rows are updated exclusively through
    // MOONBOYS_STATE.subscribe() — no refresh(), no remount.
    if (window.MOONBOYS_STATE && typeof window.MOONBOYS_STATE.subscribe === 'function') {
      window.MOONBOYS_STATE.subscribe(function (state) {
        updateFactionUI(state.faction);
        updateSyncUI();
      });
    }

    // Bus listeners are used ONLY to append log entries; they never trigger
    // full remounts or refresh() calls.
    listenForActivity();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.MOONBOYS_LIVE_ACTIVITY = {
    mount: mount,
    refresh: refresh,
    addEvent: function (type, text) { addToLog(buildLogEntry(type || 'info', text || '')); },
  };

}());
