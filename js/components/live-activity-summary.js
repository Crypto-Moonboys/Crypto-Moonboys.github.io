/**
 * Crypto Moonboys — Live Activity Summary
 * =========================================
 * Shared frontend helper showing current player activity state.
 *
 * Shows:
 *   - Core API: online / unavailable
 *     (never shows "not connected" when BASE_URL is set — only "unavailable" if a
 *      network call fails, or "not configured" when BASE_URL is genuinely absent)
 *   - Recent sync state (from MOONBOYS_IDENTITY)
 *   - Current faction state (from MOONBOYS_FACTION)
 *   - Clear fallback text when individual features are unavailable
 *
 * XP labels enforced:
 *   Score         = leaderboard ranking
 *   Arcade XP     = multiplayer gate progress (Block Topia entry)
 *   Block Topia XP = in-game progression only
 *   Faction XP    = faction alignment only
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
 *   window.MOONBOYS_API       (api-config.js)
 *   window.MOONBOYS_IDENTITY  (identity-gate.js)
 *   window.MOONBOYS_FACTION   (faction-alignment.js)
 *   window.MOONBOYS_STATUS_PANEL (connection-status-panel.js)
 */
(function () {
  'use strict';

  var STYLE_ID = 'las-styles';

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

  function getSyncState() {
    var gate = window.MOONBOYS_IDENTITY;
    if (!gate || typeof gate.getSyncState !== 'function') return null;
    return gate.getSyncState();
  }

  function getFactionStatus() {
    var fa = window.MOONBOYS_FACTION;
    if (!fa) return null;
    return fa.getCachedStatus() || { faction: 'unaligned', faction_xp: 0 };
  }

  // ── API online check ─────────────────────────────────────────────────────
  // Reuses MOONBOYS_STATUS_PANEL cache when available to avoid a duplicate
  // /blocktopia/progression request burst.

  var _apiOnlineCache = null;
  var _apiOnlineInflight = null;

  function checkApiOnline() {
    // Share the MOONBOYS_STATUS_PANEL API-online cache when available.
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

  // ── Sync summary ─────────────────────────────────────────────────────────

  function syncSummary(state) {
    if (!state || !state.linked) {
      return { text: 'Telegram not linked — run /gklink to activate sync', good: false };
    }
    if (state.good) return { text: 'Sync ready', good: true };
    var expired =
      state.auth_expired === true ||
      state.status === 'auth_expired' ||
      state.reason === 'auth_expired';
    if (expired) return { text: 'Auth expired — relink Telegram', good: false };
    if (state.status === 'missing_auth_payload' || state.reason === 'missing_auth_payload') {
      return { text: 'Sync pending', good: false };
    }
    return { text: 'Sync error', good: false };
  }

  // ── Faction summary ──────────────────────────────────────────────────────

  function factionSummary(status) {
    if (!status || !status.faction || status.faction === 'unaligned') {
      return 'No faction selected';
    }
    var fa = window.MOONBOYS_FACTION;
    var meta = fa && typeof fa.getVisualMeta === 'function' ? fa.getVisualMeta(status.faction) : null;
    var label = meta ? (meta.icon + ' ' + meta.label) : String(status.faction);
    var xp = typeof status.faction_xp === 'number' ? status.faction_xp : 0;
    return label + ' · Faction XP: ' + xp;
  }

  // ── Build HTML ────────────────────────────────────────────────────────────

  async function buildHTML() {
    var linked = isLinked();
    var state = getSyncState();
    var faction = getFactionStatus();
    var apiBase = getApiBase();
    var sync = syncSummary(state);
    var factionText = factionSummary(faction);

    // Determine API status label.
    // "not configured" when BASE_URL is absent; "unavailable" only when a
    // live request fails — never just "not connected".
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
          '<span class="las-val ' + (sync.good ? 'las-val--good' : 'las-val--warn') + '">' +
            esc(sync.text) +
          '</span>' +
        '</div>' +
        '<div class="las-row">' +
          '<span class="las-label">Faction XP</span>' +
          '<span class="las-val">' + esc(factionText) + '</span>' +
        '</div>' +
        (!linked
          ? '<div class="las-row las-row--cta">' +
              '<a href="/gkniftyheads-incubator.html" class="las-link">' +
                '🔗 Link Telegram to activate Arcade XP &amp; Faction XP sync' +
              '</a>' +
            '</div>'
          : '') +
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
    _apiOnlineCache = null;
    _apiOnlineInflight = null;
    document.querySelectorAll('[data-las-panel]').forEach(function (el) { mount(el); });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  function bootstrap() {
    injectStyles();
    document.querySelectorAll('[data-las-panel]').forEach(function (el) { mount(el); });
    ['moonboys:sync-state', 'moonboys:faction-status', 'moonboys:faction-boost'].forEach(function (evt) {
      window.addEventListener(evt, refresh);
    });
    window.addEventListener('storage', function (e) {
      if (e.key && e.key.startsWith('moonboys_')) refresh();
    });
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
  };

}());
