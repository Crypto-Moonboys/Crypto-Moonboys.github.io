(function () {
  'use strict';

  var FALLBACK_REQUIRED_XP = 50;
  var STYLE_ID = 'csp-styles';
  var _progressionCache = null;
  var _progressionInflight = null;
  var _apiOnlineCache = null;
  var _stateUnsub = null;

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
    if (!gate || typeof gate.getTelegramName !== 'function') return null;
    return gate.getTelegramName() || null;
  }

  function getTelegramId() {
    var gate = getIdentity();
    if (!gate || typeof gate.getTelegramId !== 'function') return null;
    var id = gate.getTelegramId();
    return id == null ? null : String(id);
  }

  function getPhotoUrl() {
    var gate = getIdentity();
    if (!gate || typeof gate.getTelegramPhotoUrl !== 'function') return null;
    return gate.getTelegramPhotoUrl() || null;
  }

  function getSyncState() {
    var gate = getIdentity();
    if (!gate || typeof gate.getSyncState !== 'function') return null;
    return gate.getSyncState();
  }

  function getFactionStatus() {
    var fa = getFactionApi();
    if (!fa || typeof fa.getCachedStatus !== 'function') return null;
    return fa.getCachedStatus() || { faction: 'unaligned', faction_xp: 0 };
  }

  function factionLabel() {
    var status = getFactionStatus();
    if (!status || !status.faction || status.faction === 'unaligned') return 'Unaligned';
    var fa = getFactionApi();
    var meta = fa && typeof fa.getVisualMeta === 'function' ? fa.getVisualMeta(status.faction) : null;
    return meta ? (meta.icon + ' ' + meta.label) : status.faction;
  }

  function shortFactionLabel() {
    var label = factionLabel();
    var noIcon = String(label).replace(/^[^\w]+\s*/, '');
    if (noIcon.length <= 16) return noIcon;
    return noIcon.slice(0, 16) + '…';
  }

  function syncLabel(state) {
    if (!state || !state.linked) return 'Sync Required';
    if (state.good) return 'Live';
    if (state.auth_expired === true || state.status === 'auth_expired' || state.reason === 'auth_expired') return 'Relink';
    return 'Syncing';
  }

  function syncBadgeClass(state) {
    if (!state || !state.linked) return 'csp-pill--warn';
    if (state.good) return 'csp-pill--good';
    return 'csp-pill--bad';
  }

  function seasonLabel() {
    var standings = window.MOONBOYS_BATTLE_CHAMBER_STANDINGS || null;
    if (standings && standings.seasonal && standings.seasonal.period_key) {
      return String(standings.seasonal.period_key);
    }
    var warData = window.MOONBOYS_WAR_DATA || null;
    if (warData && warData.period_key) return String(warData.period_key);
    return 'Current cycle';
  }

  function blockTopiaAccess(linked, arcadeXp, requiredXp) {
    if (!linked) return '🔒 Telegram link required';
    return arcadeXp >= requiredXp ? '✅ Unlocked' : ('🔒 ' + arcadeXp + ' / ' + requiredXp);
  }

  function getArcadeXp() {
    var ms = window.MOONBOYS_STATE;
    if (ms && typeof ms.getState === 'function') return Math.max(0, Math.floor(Number(ms.getState().xp) || 0));
    return (ms && typeof ms.xp === 'number') ? Math.max(0, Math.floor(ms.xp)) : 0;
  }

  function looksLikeMine(item, telegramId, displayName) {
    if (!item || typeof item !== 'object') return false;
    var mineId = telegramId ? String(telegramId) : '';
    var itemId = item.telegram_id == null ? '' : String(item.telegram_id);
    if (mineId && itemId && mineId === itemId) return true;
    if (item.player_telegram_id != null && mineId && String(item.player_telegram_id) === mineId) return true;
    var mineName = String(displayName || '').trim().toLowerCase();
    if (!mineName) return false;
    var actor = String(item.display_name || item.player_name || '').trim().toLowerCase();
    if (actor && actor === mineName) return true;
    var text = String(item.event_text || '').toLowerCase();
    return !!(text && mineName && text.indexOf(mineName) !== -1);
  }

  function classifyActivity(item) {
    var type = String(item.event_type || item.source || '').toLowerCase();
    var text = String(item.event_text || '').trim();
    if (type.indexOf('score') !== -1 || text.toLowerCase().indexOf('accepted') !== -1 || text.toLowerCase().indexOf('arcade') !== -1) {
      return 'Latest arcade accepted run';
    }
    if (type.indexOf('contrib') !== -1 || text.toLowerCase().indexOf('faction') !== -1) {
      return 'Latest faction contribution';
    }
    if (type.indexOf('mission') !== -1) {
      return 'Latest mission completion';
    }
    if (type.indexOf('battle') !== -1 || type.indexOf('proof') !== -1 || text.toLowerCase().indexOf('proof') !== -1) {
      return 'Latest Battle Chamber proof';
    }
    return null;
  }

  function getPersonalActivityRows() {
    var rows = [];
    var displayName = getDisplayName();
    var telegramId = getTelegramId();
    var activity = Array.isArray(window.MOONBOYS_BATTLE_CHAMBER_ACTIVITY) ? window.MOONBOYS_BATTLE_CHAMBER_ACTIVITY : [];
    for (var i = 0; i < activity.length && rows.length < 4; i++) {
      var item = activity[i];
      if (!looksLikeMine(item, telegramId, displayName)) continue;
      var label = classifyActivity(item);
      if (!label) continue;
      rows.push({
        label: label,
        text: String(item.event_text || 'Synced activity detected'),
      });
    }

    var wtf = window.MOONBOYS_WTF_EVENTS || null;
    if (wtf && (wtf.checked_in || Number(wtf.completed_today) > 0)) {
      rows.push({
        label: 'Latest WTF event check-in/completion',
        text: wtf.checked_in && Number(wtf.completed_today) > 0 ? 'Checked in and completed active signal.' : (wtf.checked_in ? 'Checked in to active signal.' : 'Completed today\'s WTF signal.'),
      });
    }

    var missedToday = wtf ? Math.max(0, Number(wtf.missed_today) || 0) : 0;
    var missedHistoryCount = wtf ? Math.max(0, Number(wtf.missed_history_count) || 0) : 0;
    var missedRows = Array.isArray(window.MOONBOYS_ROGUELITE_MISSED_HISTORY) ? window.MOONBOYS_ROGUELITE_MISSED_HISTORY : [];
    if (missedToday > 0 || missedHistoryCount > 0 || missedRows.length > 0) {
      var latestMissed = missedRows.length ? String(missedRows[0].title || 'Missed city signal') : 'Missed city signal recorded';
      rows.push({
        label: 'Latest missed opportunity count/update',
        text: 'Today: ' + missedToday + ' · Total: ' + Math.max(missedHistoryCount, missedRows.length) + ' · ' + latestMissed,
      });
    }

    return rows.slice(0, 6);
  }

  function fetchRequiredXp() {
    if (_progressionCache !== null) return Promise.resolve(_progressionCache);
    if (_progressionInflight !== null) return _progressionInflight;

    _progressionInflight = (async function () {
      var fallback = { requiredXp: FALLBACK_REQUIRED_XP };
      var gate = getIdentity();
      var telegramAuth = null;
      var apiBase = '';

      if (gate) {
        if (typeof gate.getSignedTelegramAuth === 'function') telegramAuth = gate.getSignedTelegramAuth();
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

  async function checkApiOnline() {
    if (_apiOnlineCache !== null) return _apiOnlineCache;
    var apiBase = getApiBase();
    if (!apiBase) { _apiOnlineCache = false; return false; }
    var ac = new AbortController();
    var timer = setTimeout(function () { ac.abort(); }, 4000);
    try {
      var res = await fetch(apiBase + '/health', { method: 'GET', signal: ac.signal });
      _apiOnlineCache = res.status < 500;
    } catch (_) {
      _apiOnlineCache = false;
    } finally {
      clearTimeout(timer);
    }
    return _apiOnlineCache;
  }

  async function buildPanelHTML() {
    var linked = isLinked();
    var name = getDisplayName() || 'Player';
    var state = getSyncState();
    var progression = await fetchRequiredXp();
    var requiredXp = progression.requiredXp;
    var arcadeXp = getArcadeXp();
    var apiOnline = await checkApiOnline();

    if (!linked) {
      return '' +
        '<div class="csp-panel csp-panel--locked" role="status" aria-label="Player live feed inactive">' +
          '<div class="csp-panel-title-row"><span class="csp-live-dot"></span><strong>PLAYER LIVE FEED</strong><span class="csp-mini-badge">INACTIVE</span></div>' +
          '<p class="csp-empty-copy">Telegram sync is required to activate the live system.</p>' +
          '<p><a class="csp-cta" href="/gkniftyheads-incubator.html">Link Telegram</a></p>' +
        '</div>';
    }

    var photoUrl = getPhotoUrl();
    var avatarHtml = photoUrl
      ? '<img src="' + esc(photoUrl) + '" alt="" class="csp-avatar-img" aria-hidden="true">'
      : '<span class="csp-avatar-fallback" aria-hidden="true">👾</span>';

    var activityRows = getPersonalActivityRows();
    var activityHtml = activityRows.length
      ? '<div class="csp-feed-list">' + activityRows.map(function (row) {
          return '<div class="csp-feed-row"><span class="csp-feed-label">' + esc(row.label) + '</span><span class="csp-feed-text">' + esc(row.text) + '</span></div>';
        }).join('') + '</div>'
      : '<p class="csp-empty-copy">No synced activity yet. Play an arcade run or complete a faction task.</p>';

    return '' +
      '<div class="csp-panel" role="status" aria-label="Player live feed">' +
        '<div class="csp-panel-title-row"><span class="csp-live-dot"></span><strong>PLAYER LIVE FEED</strong><span class="csp-mini-badge">LIVE</span></div>' +
        '<div class="csp-identity">' +
          '<div class="csp-avatar">' + avatarHtml + '</div>' +
          '<div class="csp-identity-meta">' +
            '<div class="csp-name-row"><span class="csp-name">' + esc(name) + '</span><span class="csp-pill ' + esc(syncBadgeClass(state)) + '">' + esc(syncLabel(state)) + '</span></div>' +
            '<div class="csp-subline">Linked • Personal sync active</div>' +
          '</div>' +
        '</div>' +
        '<div class="csp-stack">' +
          '<div class="csp-chip"><span>Arcade XP</span><strong>' + arcadeXp + '</strong></div>' +
          '<div class="csp-chip"><span>Block Topia</span><strong>' + esc(blockTopiaAccess(linked, arcadeXp, requiredXp)) + '</strong></div>' +
          '<div class="csp-chip"><span>Faction</span><strong>' + esc(factionLabel()) + '</strong></div>' +
          '<div class="csp-chip"><span>Season</span><strong>' + esc(seasonLabel()) + '</strong></div>' +
          '<div class="csp-chip"><span>API / Sync</span><strong>' + (apiOnline ? '🟢 Online' : '🟡 Degraded') + '</strong></div>' +
        '</div>' +
        '<div class="csp-feed">' +
          '<div class="csp-feed-title">Personal Live Feed</div>' +
          activityHtml +
        '</div>' +
      '</div>';
  }

  async function buildBadgeHTML() {
    var linked = isLinked();
    if (!linked) {
      return '<a href="/gkniftyheads-incubator.html" class="csp-badge csp-badge--unlinked" aria-label="Telegram sync required">LIVE SYNC · Telegram Sync Required</a>';
    }

    var name = getDisplayName() || 'Player';
    var state = getSyncState();
    var progression = await fetchRequiredXp();
    var arcadeXp = getArcadeXp();
    var requiredXp = progression.requiredXp;
    var apiOnline = await checkApiOnline();
    var btUnlocked = arcadeXp >= requiredXp;

    return '' +
      '<span class="csp-badge csp-badge--linked" aria-label="Telegram live sync status">' +
        '<span class="csp-badge-tag">LIVE SYNC</span>' +
        '<span class="csp-badge-name">' + esc(name) + '</span>' +
        '<span class="csp-badge-pill ' + esc(syncBadgeClass(state)) + '">' + esc(syncLabel(state)) + '</span>' +
        '<span class="csp-badge-xp">XP ' + arcadeXp + '</span>' +
        '<span class="csp-badge-faction">' + esc(shortFactionLabel()) + '</span>' +
        '<span class="csp-badge-api" aria-label="API status">' + (apiOnline ? '●' : '○') + '</span>' +
        '<span class="csp-badge-bt">BT ' + (btUnlocked ? 'ON' : 'OFF') + '</span>' +
      '</span>';
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#moonboys-global-status-badge{display:flex;align-items:center;margin-left:auto}',
      '.csp-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:.72rem;font-weight:700;line-height:1;max-width:360px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
      '.csp-badge--linked{background:rgba(86,220,255,.14);border:1px solid rgba(86,220,255,.45);color:#d7f6ff}',
      '.csp-badge--unlinked{background:rgba(248,81,73,.15);border:1px solid rgba(248,81,73,.5);color:#ffd5d2;text-decoration:none}',
      '.csp-badge-tag{color:#7af9ff}',
      '.csp-badge-name{max-width:90px;overflow:hidden;text-overflow:ellipsis}',
      '.csp-badge-pill{padding:2px 6px;border-radius:999px;font-size:.64rem}',
      '.csp-badge-xp,.csp-badge-faction,.csp-badge-bt{opacity:.92}',
      '.csp-badge-api{font-size:.8rem;color:#56dcff}',

      '.csp-panel{border:1px solid rgba(86,220,255,.28);border-radius:12px;background:linear-gradient(165deg,rgba(7,18,35,.92),rgba(5,12,24,.9));padding:12px;color:var(--color-text,#e6f0ff)}',
      '.csp-panel--locked{border-color:rgba(248,81,73,.28);background:linear-gradient(165deg,rgba(28,12,20,.75),rgba(16,8,14,.85))}',
      '.csp-panel-title-row{display:flex;align-items:center;gap:8px;font-size:.76rem;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px}',
      '.csp-live-dot{width:8px;height:8px;border-radius:50%;background:#56dcff;box-shadow:0 0 10px rgba(86,220,255,.9)}',
      '.csp-mini-badge{margin-left:auto;padding:2px 8px;border-radius:999px;background:rgba(86,220,255,.14);border:1px solid rgba(86,220,255,.35)}',
      '.csp-identity{display:flex;align-items:center;gap:10px;margin-bottom:10px}',
      '.csp-avatar{width:34px;height:34px;border-radius:8px;overflow:hidden;border:1px solid rgba(86,220,255,.3);display:flex;align-items:center;justify-content:center;background:rgba(86,220,255,.08)}',
      '.csp-avatar-img{width:100%;height:100%;object-fit:cover}',
      '.csp-identity-meta{min-width:0;flex:1}',
      '.csp-name-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.csp-name{font-weight:800;font-size:.92rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.csp-subline{font-size:.72rem;color:var(--color-text-muted,#8b949e);margin-top:2px}',
      '.csp-pill{padding:2px 8px;border-radius:999px;font-size:.64rem;font-weight:700}',
      '.csp-pill--good{background:rgba(63,185,80,.15);border:1px solid rgba(63,185,80,.45);color:#3fb950}',
      '.csp-pill--warn{background:rgba(210,153,34,.15);border:1px solid rgba(210,153,34,.45);color:#d2991d}',
      '.csp-pill--bad{background:rgba(248,81,73,.14);border:1px solid rgba(248,81,73,.45);color:#f85149}',
      '.csp-stack{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}',
      '.csp-chip{border:1px solid rgba(86,220,255,.2);border-radius:8px;padding:7px 8px;background:rgba(86,220,255,.06);display:flex;flex-direction:column;gap:4px}',
      '.csp-chip span{font-size:.66rem;color:var(--color-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.06em}',
      '.csp-chip strong{font-size:.78rem;line-height:1.25}',
      '.csp-feed-title{font-size:.7rem;color:#7fd7ff;letter-spacing:.07em;text-transform:uppercase;margin-bottom:6px}',
      '.csp-feed-list{display:flex;flex-direction:column;gap:6px}',
      '.csp-feed-row{border:1px solid rgba(86,220,255,.16);border-radius:7px;padding:6px 7px;background:rgba(86,220,255,.04)}',
      '.csp-feed-label{display:block;font-size:.64rem;color:#8fdfff;text-transform:uppercase;letter-spacing:.04em}',
      '.csp-feed-text{display:block;font-size:.75rem;opacity:.92;line-height:1.35}',
      '.csp-empty-copy{font-size:.77rem;color:var(--color-text-muted,#8b949e);line-height:1.4}',
      '.csp-cta{display:inline-block;padding:6px 10px;border:1px solid rgba(86,220,255,.38);border-radius:8px;color:#d3f4ff;text-decoration:none;background:rgba(86,220,255,.1);font-weight:700}',
      '@media (max-width:640px){.csp-stack{grid-template-columns:1fr}}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  async function mount(containerOrId) {
    var el = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
    if (!el) return;
    injectStyles();
    var token = (Number(el.dataset.cspToken || 0) + 1);
    el.dataset.cspToken = String(token);
    el.innerHTML = '<div class="csp-empty-copy">Loading player feed…</div>';
    var html = await buildPanelHTML();
    if (String(el.dataset.cspToken) === String(token)) el.innerHTML = html;
  }

  async function mountBadge(containerOrId) {
    var el = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
    if (!el) return;
    injectStyles();
    var token = (Number(el.dataset.cspToken || 0) + 1);
    el.dataset.cspToken = String(token);
    var html = await buildBadgeHTML();
    if (String(el.dataset.cspToken) === String(token)) el.innerHTML = html;
  }

  function injectGlobalBadge() {
    if (document.getElementById('moonboys-global-status-badge')) return;
    var header = document.getElementById('site-header');
    if (!header) return;
    var wrap = document.createElement('div');
    wrap.id = 'moonboys-global-status-badge';
    wrap.setAttribute('aria-live', 'polite');
    header.appendChild(wrap);
    mountBadge(wrap);
  }

  function invalidateAndRefresh() {
    _progressionCache = null;
    _progressionInflight = null;
    _apiOnlineCache = null;
    document.querySelectorAll('[data-csp-panel]').forEach(function (el) { mount(el); });
    var badge = document.getElementById('moonboys-global-status-badge');
    if (badge) mountBadge(badge);
  }

  function listenForUpdates() {
    window.addEventListener('storage', function (e) {
      if (
        e.key &&
        e.key.indexOf('moonboys_') === 0 &&
        e.key !== 'moonboys_state_v1' &&
        e.key !== 'moonboys_faction_status_v1'
      ) {
        invalidateAndRefresh();
      }
    });

    if (window.MOONBOYS_STATE && typeof window.MOONBOYS_STATE.subscribe === 'function') {
      if (_stateUnsub) { try { _stateUnsub(); } catch (_) {} }
      _stateUnsub = window.MOONBOYS_STATE.subscribe(function () {
        invalidateAndRefresh();
      });
    }

    window.addEventListener('moonboys:wtf-events-ready', invalidateAndRefresh);
    window.addEventListener('moonboys:wtf-event-checkin', invalidateAndRefresh);
    window.addEventListener('moonboys:wtf-event-complete', invalidateAndRefresh);
    window.addEventListener('battle-chamber:faction-data-ready', invalidateAndRefresh);
    window.addEventListener('battle-chamber:activity-ready', invalidateAndRefresh);
  }

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

  window.MOONBOYS_STATUS_PANEL = {
    mount: mount,
    mountBadge: mountBadge,
    refresh: invalidateAndRefresh,
    checkApiOnline: checkApiOnline,
  };
}());
