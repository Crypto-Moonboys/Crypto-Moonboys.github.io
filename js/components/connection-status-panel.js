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
      // GET /health — the worker only implements GET; HEAD falls through to 404.
      var res = await fetch(apiBase + '/health', { method: 'GET', signal: ac.signal });
      _apiOnlineCache = res.status < 500;
    } catch (_) {
      _apiOnlineCache = false;
    } finally {
      clearTimeout(timer);
    }
    return _apiOnlineCache;
  }

  // ── Render ─────────────────────────────────────────────────────────────

  function normaliseFactionKey(status) {
    if (!status || !status.faction || status.faction === 'unaligned') return null;
    return String(status.faction);
  }

  function blocktopiaAccessHTML(linked, arcadeXp, requiredXp) {
    if (!linked) return '<span class="csp-val-locked">Telegram sync required</span>';
    if (arcadeXp >= requiredXp) return '<span class="csp-val-good">Access unlocked</span>';
    return '<span class="csp-val-locked">Locked — ' + esc(String(arcadeXp)) + ' / ' + requiredXp + ' Arcade XP</span>';
  }

  function latestActivityRows() {
    var rows = [];
    var activity = Array.isArray(window.MOONBOYS_BATTLE_CHAMBER_ACTIVITY) ? window.MOONBOYS_BATTLE_CHAMBER_ACTIVITY : [];
    if (activity.length) {
      var latest = activity[0] || {};
      rows.push({ tag: 'Battle', text: latest.title || latest.event || latest.action || latest.type || 'Latest Battle Chamber proof synced' });
    }
    var daily = window.MOONBOYS_ROGUELITE_DAILY_STATE || window.MOONBOYS_DAILY_ROGUELITE_LOTTERY || null;
    if (daily && typeof daily === 'object') {
      var task = daily.latest_completion || daily.latest || daily.current_task || daily.today || null;
      rows.push({ tag: 'Daily', text: task && (task.title || task.name || task.id) ? (task.title || task.name || task.id) : 'Daily opportunity state synced' });
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

  function buildFeedHTML(rows) {
    if (!rows.length) {
      return '<div class="csp-feed-empty">No synced activity yet. Play an arcade run or complete a faction task.</div>';
    }
    return rows.map(function (row) {
      return '<div class="csp-feed-row"><span class="csp-feed-tag">' + esc(row.tag) + '</span><span>' + esc(row.text) + '</span></div>';
    }).join('');
  }

  async function buildPanelHTML() {
    var linked = isLinked();
    var name = getDisplayName();
    var state = getSyncState();
    var progression = await fetchRequiredXp();
    var arcadeXp = getArcadeXp();
    var requiredXp = progression.requiredXp;
    var apiOnline = await checkApiOnline();
    var status = getFactionStatus();
    var faction = factionLabel();
    var sync = syncLabel(state);
    var syncClass = syncBadgeClass(state);
    var blocktopia = blocktopiaAccessHTML(linked, arcadeXp, requiredXp);
    var season = status && (status.season || status.current_season || status.season_key) ? (status.season || status.current_season || status.season_key) : 'Season lock not reported';

    if (!linked) {
      return '' +
        '<div class="csp-panel csp-panel--live-feed" role="status" aria-label="Player live feed">' +
          '<div class="csp-live-head"><span class="csp-pulse csp-pulse--warn"></span><div><strong>Player Live Feed</strong><span>Telegram sync is required to activate the live system.</span></div></div>' +
          '<a href="/gkniftyheads-incubator.html" class="csp-live-cta">Link Telegram</a>' +
        '</div>';
    }

    return '' +
      '<div class="csp-panel csp-panel--live-feed" role="status" aria-label="Player live feed">' +
        '<div class="csp-live-head">' +
          '<span class="csp-avatar-mini" aria-hidden="true">👾</span>' +
          '<div class="csp-live-identity"><strong>' + esc(name || 'Telegram Player') + '</strong><span><b class="csp-live-pill csp-live-pill--good">LIVE LINKED</b> <b class="csp-live-pill ' + esc(syncClass) + '">' + esc(sync) + '</b></span></div>' +
        '</div>' +
        '<div class="csp-grid csp-grid--live">' +
          '<div class="csp-item"><div class="csp-item-label">Arcade XP</div><div class="csp-item-val" data-csp-xp>' + esc(String(arcadeXp)) + '</div></div>' +
          '<div class="csp-item"><div class="csp-item-label">Faction</div><div class="csp-item-val" data-csp-faction data-csp-faction-key="' + esc(normaliseFactionKey(status) || '') + '">' + esc(faction) + '</div></div>' +
          '<div class="csp-item csp-item--wide"><div class="csp-item-label">Block Topia</div><div class="csp-item-val" data-csp-bt-access>' + blocktopia + '</div></div>' +
          '<div class="csp-item"><div class="csp-item-label">Season</div><div class="csp-item-val">' + esc(season) + '</div></div>' +
          '<div class="csp-item"><div class="csp-item-label">API Sync</div><div class="csp-item-val ' + (apiOnline ? 'csp-val-good' : 'csp-val-locked') + '">' + (apiOnline ? '● Online' : 'Core API unavailable') + '</div></div>' +
        '</div>' +
        '<div class="csp-feed"><div class="csp-feed-title">Recent Personal Activity</div>' + buildFeedHTML(latestActivityRows()) + '</div>' +
      '</div>';
  }

  async function buildBadgeHTML() {
    var linked = isLinked();
    if (!linked) {
      return '<a href="/gkniftyheads-incubator.html" class="csp-badge csp-badge--unlinked" aria-label="Telegram Sync Required"><span class="csp-pulse csp-pulse--warn"></span><span><strong>Telegram Sync Required</strong><small>Link to activate live systems</small></span></a>';
    }
    var name = getDisplayName();
    var progression = await fetchRequiredXp();
    var arcadeXp = getArcadeXp();
    var requiredXp = progression.requiredXp;
    var unlocked = arcadeXp >= requiredXp;
    var status = getFactionStatus();
    var faction = factionLabel();
    var shortFaction = faction.length > 18 ? faction.slice(0, 17) + '…' : faction;
    var apiOnline = await checkApiOnline();
    return '' +
      '<span class="csp-badge csp-badge--linked" aria-label="Live sync active">' +
        '<span class="csp-pulse"></span>' +
        '<span class="csp-badge-stack"><strong>LIVE SYNC</strong><small>' + esc(name || 'Player') + ' · XP <span data-csp-badge-xp>' + arcadeXp + '</span> · ' + esc(shortFaction) + '</small></span>' +
        '<span class="csp-badge-chip" data-csp-badge-bt>' + (unlocked ? 'BT OPEN' : 'BT LOCK') + '</span>' +
        '<span class="csp-badge-chip ' + (apiOnline ? 'csp-badge-chip--good' : 'csp-badge-chip--warn') + '">' + (apiOnline ? 'API' : 'API?') + '</span>' +
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
      '.csp-panel--live-feed{border-color:rgba(0,229,255,.36);box-shadow:0 0 18px rgba(0,229,255,.14),inset 0 0 18px rgba(255,45,120,.05)}',
      '.csp-live-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}',
      '.csp-live-head strong{display:block;color:#fff;text-transform:uppercase;letter-spacing:.06em}',
      '.csp-live-head span{display:block;color:var(--color-text-muted,#8b949e);font-size:.72rem}',
      '.csp-avatar-mini{width:34px;height:34px;border:1px solid rgba(0,229,255,.45);display:inline-flex!important;align-items:center;justify-content:center;background:rgba(0,229,255,.08);box-shadow:0 0 10px rgba(0,229,255,.18)}',
      '.csp-live-identity{min-width:0}.csp-live-identity strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.csp-live-pill{display:inline-flex!important;padding:2px 6px;border-radius:999px;border:1px solid rgba(86,220,255,.28);font-size:.58rem!important;letter-spacing:.04em;margin-top:4px}',
      '.csp-live-pill--good{color:#3fb950;background:rgba(63,185,80,.12);border-color:rgba(63,185,80,.4)}',
      '.csp-grid--live{grid-template-columns:1fr;gap:7px}',
      '.csp-feed{margin-top:10px;padding-top:9px;border-top:1px solid rgba(86,220,255,.16)}',
      '.csp-feed-title{font-size:.64rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#56dcff;margin-bottom:6px}',
      '.csp-feed-row{display:flex;gap:6px;align-items:flex-start;padding:5px 0;border-bottom:1px solid rgba(86,220,255,.08);font-size:.72rem}',
      '.csp-feed-tag{flex:0 0 auto;color:#f7c948;font-weight:800;text-transform:uppercase;font-size:.58rem;border:1px solid rgba(247,201,72,.35);padding:1px 4px}',
      '.csp-feed-empty{color:var(--color-text-muted,#8b949e);font-size:.72rem;line-height:1.45}',
      '.csp-live-cta{display:inline-flex;margin-top:8px;padding:7px 9px;border:1px solid rgba(0,229,255,.45);color:#c8f0ff;text-decoration:none;background:rgba(0,229,255,.08);font-weight:800;text-transform:uppercase;font-size:.68rem}',
      '.csp-pulse{width:8px;height:8px;border-radius:999px;background:#3fb950;box-shadow:0 0 10px #3fb950;display:inline-block;flex:0 0 auto;animation:cspPulse 1.2s infinite}',
      '.csp-pulse--warn{background:#f7c948;box-shadow:0 0 10px #f7c948}',
      '@keyframes cspPulse{0%,100%{opacity:.55;transform:scale(.9)}50%{opacity:1;transform:scale(1.15)}}',
      /* Global header badge */
      '#moonboys-global-status-badge{display:flex;align-items:center;margin-left:auto}',
      '.csp-badge{display:inline-flex;align-items:center;gap:7px;padding:5px 9px;border-radius:99px;font-size:.72rem;font-weight:700;white-space:nowrap;max-width:340px;overflow:hidden;text-overflow:ellipsis}',
      '.csp-badge strong{display:block;font-size:.62rem;letter-spacing:.08em;color:#fff}.csp-badge small{display:block;font-size:.66rem;font-weight:600;color:#c8f0ff;overflow:hidden;text-overflow:ellipsis}',
      '.csp-badge-stack{min-width:0;line-height:1.15}',
      '.csp-badge-chip{font-size:.56rem;border:1px solid rgba(86,220,255,.28);border-radius:99px;padding:2px 5px;color:#56dcff;background:rgba(86,220,255,.08)}',
      '.csp-badge-chip--good{color:#3fb950;border-color:rgba(63,185,80,.35)}.csp-badge-chip--warn{color:#f7c948;border-color:rgba(247,201,72,.35)}',
      '.csp-badge--linked{background:rgba(86,220,255,.1);border:1px solid rgba(86,220,255,.35);color:#c8f0ff;box-shadow:0 0 12px rgba(86,220,255,.12)}',
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
    // XP, faction, and Block Topia access state are patched without remounting
    // the entire panel — no API re-fetch, no full DOM replacement.
    if (window.MOONBOYS_STATE && typeof window.MOONBOYS_STATE.subscribe === 'function') {
      if (_stateUnsub) { try { _stateUnsub(); } catch (_) {} }
      _stateUnsub = window.MOONBOYS_STATE.subscribe(function (state) {
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
