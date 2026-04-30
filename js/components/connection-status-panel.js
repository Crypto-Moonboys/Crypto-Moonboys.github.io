/**
 * Crypto Moonboys — Connection Status Panel
 * ==========================================
 * Shared UX clarity component. Shows the current player's sync state across
 * all pages: Telegram link, Arcade XP, Block Topia gate, faction, API health.
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
 *   window.MOONBOYS_FACTION   (faction-alignment.js)
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
  var STYLE_ID = 'csp-styles';

  // ── Per-session cache ─────────────────────────────────────────────────
  // _progressionCache: { requiredXp } once resolved; null until then.
  // Arcade XP is NOT cached here — it is read from MOONBOYS_STATE exclusively.
  // _progressionInflight: the in-flight Promise (shared by all concurrent callers).
  // Clearing both on invalidate ensures the next call starts fresh.
  var _progressionCache = null;
  var _progressionInflight = null;
  var _apiOnlineCache = null;

  // ── Helpers ────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getIdentity() { return window.MOONBOYS_IDENTITY || null; }
  function getFactionApi() { return window.MOONBOYS_FACTION || null; }

  function getApiBase() {
    var cfg = window.MOONBOYS_API || {};
    return cfg.BASE_URL ? String(cfg.BASE_URL).replace(/\/$/, '') : '';
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

  function getSyncState() {
    var gate = getIdentity();
    if (!gate || typeof gate.getSyncState !== 'function') return null;
    return gate.getSyncState();
  }

  function getFactionStatus() {
    var fa = getFactionApi();
    if (!fa) return null;
    return fa.getCachedStatus() || { faction: 'unaligned', faction_xp: 0 };
  }

  function factionLabel() {
    var status = getFactionStatus();
    if (!status || !status.faction || status.faction === 'unaligned') {
      return 'No faction selected yet';
    }
    var fa = getFactionApi();
    var meta = fa && typeof fa.getVisualMeta === 'function' ? fa.getVisualMeta(status.faction) : null;
    return meta ? (meta.icon + ' ' + meta.label) : status.faction;
  }

  /**
   * Derives a human-readable sync label from getSyncState() output.
   * Checks all known representations of auth_expired and missing_auth_payload
   * so the label is correct regardless of which field the identity layer populates.
   */
  function syncLabel(state) {
    if (!state || !state.linked) return 'Telegram not linked \u2014 run /gklink';
    if (state.good) return 'Ready';
    var expired =
      state.auth_expired === true ||
      state.status === 'auth_expired' ||
      state.reason === 'auth_expired';
    if (expired) return 'Auth expired — relink';
    var pending =
      state.status === 'missing_auth_payload' ||
      state.reason === 'missing_auth_payload';
    if (pending) return 'Pending';
    return 'Error';
  }

  function syncBadgeClass(state) {
    if (!state || !state.linked) return 'csp-badge--warn';
    if (state.good) return 'csp-badge--good';
    return 'csp-badge--bad';
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
      var fallback = { requiredXp: FALLBACK_REQUIRED_XP };
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
            _progressionCache = {
              requiredXp: Math.max(1, Math.floor(Number(prog.required_xp) || FALLBACK_REQUIRED_XP)),
            };
          } else {
            _progressionCache = fallback;
          }
        } catch (_) {
          _progressionCache = fallback;
        }
      } else {
        _progressionCache = fallback;
      }

      _progressionInflight = null;
      return _progressionCache;
    }());

    return _progressionInflight;
  }

  /** Returns the current Arcade XP from MOONBOYS_STATE (authoritative). */
  function getArcadeXp() {
    var ms = window.MOONBOYS_STATE;
    if (ms && typeof ms.getState === 'function') return ms.getState().xp;
    return (ms && typeof ms.xp === 'number') ? ms.xp : 0;
  }


  async function checkApiOnline() {
    if (_apiOnlineCache !== null) return _apiOnlineCache;
    var apiBase = getApiBase();
    if (!apiBase) { _apiOnlineCache = false; return false; }
    var ac = new AbortController();
    var timer = setTimeout(function () { ac.abort(); }, 4000);
    try {
      // A HEAD to the base returns a response (even 404) when the worker is up.
      var res = await fetch(apiBase, { method: 'HEAD', signal: ac.signal });
      _apiOnlineCache = res.status < 500;
    } catch (_) {
      _apiOnlineCache = false;
    } finally {
      clearTimeout(timer);
    }
    return _apiOnlineCache;
  }

  // ── Render ─────────────────────────────────────────────────────────────

  async function buildPanelHTML() {
    var linked = isLinked();
    var name = getDisplayName();
    var state = getSyncState();
    var progression = await fetchRequiredXp();
    var arcadeXp = getArcadeXp();
    var requiredXp = progression.requiredXp;
    var apiOnline = await checkApiOnline();
    var blocktopiaUnlocked = linked && arcadeXp >= requiredXp;
    var faction = factionLabel();
    var sync = syncLabel(state);
    var syncClass = syncBadgeClass(state);

    var identityRow;
    if (linked) {
      identityRow =
        '<span class="csp-dot csp-dot--green" aria-hidden="true"></span>' +
        'Telegram: <strong>' + esc(name || 'Player') + '</strong>';
    } else {
      identityRow =
        '<span class="csp-dot csp-dot--red" aria-hidden="true"></span>' +
        '<a href="/gkniftyheads-incubator.html" class="csp-link">Link Telegram to activate</a>';
    }

    var btAccess;
    if (!linked) {
      btAccess = '<span class="csp-val-locked">🔒 Telegram link required</span>';
    } else if (blocktopiaUnlocked) {
      btAccess = '<span class="csp-val-good">✅ Unlocked</span>';
    } else {
      btAccess =
        '<span class="csp-val-locked">🔒 Locked — ' +
        esc(String(arcadeXp)) + ' / ' + requiredXp + ' Arcade XP</span>';
    }

    return '' +
      '<div class="csp-panel" role="status" aria-label="Connection status">' +

      '<div class="csp-row csp-row--identity">' + identityRow + '</div>' +

      '<div class="csp-grid">' +

      '<div class="csp-item">' +
        '<div class="csp-item-label">Arcade XP' +
          '<span class="csp-item-note">Block Topia gate progress</span>' +
        '</div>' +
        '<div class="csp-item-val" data-csp-xp>' +
          (linked ? esc(String(arcadeXp)) : '—') +
        '</div>' +
      '</div>' +

      '<div class="csp-item">' +
        '<div class="csp-item-label">Required XP' +
          '<span class="csp-item-note">Block Topia entry</span>' +
        '</div>' +
        '<div class="csp-item-val">' + requiredXp + '</div>' +
      '</div>' +

      '<div class="csp-item csp-item--wide">' +
        '<div class="csp-item-label">Block Topia access</div>' +
        '<div class="csp-item-val" data-csp-bt-access>' + btAccess + '</div>' +
      '</div>' +

      '<div class="csp-item">' +
        '<div class="csp-item-label">Faction' +
          '<span class="csp-item-note">alignment only</span>' +
        '</div>' +
        '<div class="csp-item-val" data-csp-faction>' + esc(faction) + '</div>' +
      '</div>' +

      '<div class="csp-item">' +
        '<div class="csp-item-label">Core API</div>' +
        '<div class="csp-item-val ' + (apiOnline ? 'csp-val-good' : 'csp-val-locked') + '">' +
          (apiOnline ? '● Online' : 'Core API unavailable') +
        '</div>' +
      '</div>' +

      '<div class="csp-item">' +
        '<div class="csp-item-label">Sync</div>' +
        '<div class="csp-item-val csp-item-val--badge ' + esc(syncClass) + '">' +
          esc(sync) +
        '</div>' +
      '</div>' +

      '</div>' + // .csp-grid
      '</div>';  // .csp-panel
  }

  async function buildBadgeHTML() {
    var linked = isLinked();
    if (!linked) {
      return '<a href="/gkniftyheads-incubator.html" class="csp-badge csp-badge--unlinked" aria-label="Link Telegram to activate">🔗 Link Telegram</a>';
    }
    var name = getDisplayName();
    var progression = await fetchRequiredXp();
    var arcadeXp = getArcadeXp();
    var requiredXp = progression.requiredXp;
    var unlocked = arcadeXp >= requiredXp;
    return '' +
      '<span class="csp-badge csp-badge--linked" aria-label="Status: Telegram linked">' +
      'Telegram: ' + esc(name || 'Player') +
      ' · Arcade XP <strong data-csp-badge-xp>' + arcadeXp + '</strong>' +
      ' · Block Topia <span data-csp-badge-bt>' + (unlocked ? 'unlocked' : 'locked') + '</span>' +
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
      '.csp-item-val--badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:.75rem;font-weight:700}',
      '.csp-badge--good{background:rgba(63,185,80,.15);border:1px solid rgba(63,185,80,.5);color:#3fb950}',
      '.csp-badge--warn{background:rgba(210,153,34,.15);border:1px solid rgba(210,153,34,.5);color:#d2991d}',
      '.csp-badge--bad{background:rgba(248,81,73,.12);border:1px solid rgba(248,81,73,.4);color:#f85149}',
      '.csp-val-good{color:#3fb950}',
      '.csp-val-locked{color:var(--color-text-muted,#8b949e)}',
      /* Global header badge */
      '#moonboys-global-status-badge{display:flex;align-items:center;margin-left:auto}',
      '.csp-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:99px;font-size:.75rem;font-weight:600;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis}',
      '.csp-badge--linked{background:rgba(86,220,255,.1);border:1px solid rgba(86,220,255,.35);color:#c8f0ff}',
      '.csp-badge--unlinked{background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.35);color:#ffd0cd;text-decoration:none}',
      /* Loading placeholder */
      '.csp-loading{color:var(--color-text-muted,#8b949e);font-size:.82rem;padding:10px 0}',
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
    var html = await buildPanelHTML();
    // Only commit the result if no newer render was launched after us.
    if (String(el.dataset.cspToken) === String(token)) {
      el.innerHTML = html;
    }
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
    _apiOnlineCache = null;
    document.querySelectorAll('[data-csp-panel]').forEach(function (el) { mount(el); });
    var badge = document.getElementById('moonboys-global-status-badge');
    if (badge) mountBadge(badge);
  }

  function listenForUpdates() {
    // Storage listener: remount panel only on identity/sync changes that are
    // persisted in localStorage (e.g. Telegram link state).
    // moonboys_state_v1 changes are handled via MOONBOYS_STATE.subscribe() below.
    window.addEventListener('storage', function (e) {
      if (e.key && e.key.startsWith('moonboys_') && e.key !== 'moonboys_state_v1') {
        invalidateAndRefresh();
      }
    });

    // Subscribe to MOONBOYS_STATE for instant inline updates.
    // XP, faction, and Block Topia access state are patched without remounting
    // the entire panel — no API re-fetch, no full DOM replacement.
    if (window.MOONBOYS_STATE && typeof window.MOONBOYS_STATE.subscribe === 'function') {
      window.MOONBOYS_STATE.subscribe(function (state) {
        var linked = isLinked();

        // ── Arcade XP ─────────────────────────────────────────────────────────
        document.querySelectorAll('.csp-item-val[data-csp-xp]').forEach(function (el) {
          el.textContent = linked ? String(state.xp) : '—';
        });
        var badge = document.getElementById('moonboys-global-status-badge');
        if (badge) {
          var xpNode = badge.querySelector('[data-csp-badge-xp]');
          if (xpNode) xpNode.textContent = String(state.xp);
        }

        // ── Faction text ──────────────────────────────────────────────────────
        var factionText = factionLabel();
        document.querySelectorAll('.csp-item-val[data-csp-faction]').forEach(function (el) {
          el.textContent = factionText;
        });

        // ── Block Topia access state ──────────────────────────────────────────
        var requiredXp = (_progressionCache && _progressionCache.requiredXp) || FALLBACK_REQUIRED_XP;
        var unlocked = linked && state.xp >= requiredXp;

        document.querySelectorAll('.csp-item-val[data-csp-bt-access]').forEach(function (el) {
          var btHtml;
          if (!linked) {
            btHtml = '<span class="csp-val-locked">\uD83D\uDD12 Telegram link required</span>';
          } else if (unlocked) {
            btHtml = '<span class="csp-val-good">\u2705 Unlocked</span>';
          } else {
            btHtml = '<span class="csp-val-locked">\uD83D\uDD12 Locked \u2014 ' +
              esc(String(state.xp)) + ' / ' + requiredXp + ' Arcade XP</span>';
          }
          el.innerHTML = btHtml;
        });

        if (badge) {
          var btNode = badge.querySelector('[data-csp-badge-bt]');
          if (btNode) btNode.textContent = unlocked ? 'unlocked' : 'locked';
        }
      });
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────

  function bootstrap() {
    injectStyles();
    injectGlobalBadge();
    listenForUpdates();
    document.querySelectorAll('[data-csp-panel]').forEach(function (el) { mount(el); });
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
  };

}());
