(function () {
  'use strict';

  var STYLE_ID = 'las-styles';
  var _stateUnsub = null;
  var _countdownTimer = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getIdentity() { return window.MOONBOYS_IDENTITY || null; }

  function isLinked() {
    var gate = getIdentity();
    return !!(gate && typeof gate.isTelegramLinked === 'function' && gate.isTelegramLinked());
  }

  function getFactionStatus() {
    var fa = window.MOONBOYS_FACTION;
    if (!fa || typeof fa.getCachedStatus !== 'function') return null;
    return fa.getCachedStatus() || { faction: 'unaligned', faction_xp: 0 };
  }

  function getFactionKey() {
    var status = getFactionStatus();
    if (!status || !status.faction || status.faction === 'unaligned') return null;
    return String(status.faction).toLowerCase();
  }

  function factionLabel() {
    var status = getFactionStatus();
    if (!status || !status.faction || status.faction === 'unaligned') return 'No faction selected';
    var fa = window.MOONBOYS_FACTION;
    var meta = fa && typeof fa.getVisualMeta === 'function' ? fa.getVisualMeta(status.faction) : null;
    return meta ? (meta.icon + ' ' + meta.label) : String(status.faction);
  }

  function formatCountdown(seconds) {
    var total = Math.max(0, Math.floor(Number(seconds) || 0));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function missionProgressText(mission, missionData) {
    var progress = 0;
    if (missionData && missionData.progress && mission && mission.id && missionData.progress[mission.id]) {
      progress = Number(missionData.progress[mission.id]) || 0;
    } else if (mission && typeof mission.progress === 'number') {
      progress = Number(mission.progress) || 0;
    }
    var target = Math.max(1, Math.floor(Number(mission && mission.target) || 1));
    var completed = !!(mission && (mission.complete || (Array.isArray(missionData && missionData.completed) && missionData.completed.indexOf(mission.id) !== -1)));
    if (completed) return { text: 'Completed', ratio: 1, completed: true };
    var safeProgress = Math.max(0, Math.min(target, Math.floor(progress)));
    return { text: safeProgress + ' / ' + target, ratio: safeProgress / target, completed: false };
  }

  function buildMissionsHTML(factionKey) {
    var missionRoot = window.MOONBOYS_MISSION_DATA || {};
    var missionData = factionKey && missionRoot[factionKey] ? missionRoot[factionKey] : null;
    var daily = missionData && Array.isArray(missionData.daily) ? missionData.daily.slice(0, 3) : [];

    if (!daily.length) {
      return '<div class="las-empty">No mission signal yet. Play an arcade run or wait for mission sync.</div>';
    }

    return '<div class="las-mission-list">' + daily.map(function (mission) {
      var progress = missionProgressText(mission, missionData);
      var reward = mission && mission.reward && mission.reward.warContrib != null
        ? ('+' + Math.max(0, Number(mission.reward.warContrib) || 0) + ' contribution')
        : 'Contribution preview unavailable';
      return '' +
        '<div class="las-mission-card' + (progress.completed ? ' las-mission-card--done' : '') + '">' +
          '<div class="las-mission-head">' +
            '<span class="las-check">' + (progress.completed ? '✅' : '⬜') + '</span>' +
            '<strong>' + esc(mission && (mission.label || mission.title || mission.id) || 'Mission') + '</strong>' +
          '</div>' +
          '<div class="las-mission-desc">' + esc(mission && mission.description || 'Objective syncing...') + '</div>' +
          '<div class="las-mission-progress"><span>' + esc(progress.text) + '</span><span>' + esc(reward) + '</span></div>' +
          '<div class="las-bar"><span style="width:' + Math.round(progress.ratio * 100) + '%"></span></div>' +
        '</div>';
    }).join('') + '</div>';
  }

  function deriveWtfStatus(state) {
    if (!state) return 'upcoming';
    var completed = Math.max(0, Number(state.completed_today) || 0) > 0;
    if (completed) return 'completed';
    if (state.active_event && state.checked_in) return 'checked in';
    if (state.active_event) return 'active';
    if (Math.max(0, Number(state.missed_today) || 0) > 0) return 'missed';
    return 'upcoming';
  }

  function buildWtfEventHTML(linked) {
    var state = window.MOONBOYS_WTF_EVENTS || null;
    if (!state) {
      return '<div class="las-empty">WTF signal feed not loaded yet. Waiting for /wtf/events/today.</div>';
    }

    var active = state.active_event || null;
    var upcoming = state.next_event || (Array.isArray(state.upcoming_events) && state.upcoming_events.length ? state.upcoming_events[0] : null);
    var status = deriveWtfStatus(state);
    var canCheckIn = !!(linked && active && !state.checked_in && window.MOONBOYS_DAILY_WTF && typeof window.MOONBOYS_DAILY_WTF.checkInWtfEvent === 'function');
    var task = state.current_task || null;
    var canComplete = !!(linked && active && state.checked_in && Math.max(0, Number(state.completed_today) || 0) === 0 && task && task.completion_source && window.MOONBOYS_DAILY_WTF && typeof window.MOONBOYS_DAILY_WTF.completeWtfEvent === 'function');
    var chain = Array.isArray(state.chain_options) ? state.chain_options.slice(0, 3) : [];

    var ctaHtml = '';
    if (canCheckIn) {
      ctaHtml += '<button type="button" class="las-btn" data-las-action="checkin" data-event-id="' + esc(active.id || active.event_id || '') + '">Check In</button>';
    }
    if (canComplete) {
      ctaHtml += '<button type="button" class="las-btn las-btn--secondary" data-las-action="complete" data-event-id="' + esc(active.id || active.event_id || '') + '" data-completion-source="' + esc(task.completion_source) + '" data-source-id="' + esc(task.source_id || '') + '">Complete</button>';
    }

    return '' +
      '<div class="las-signal-grid">' +
        '<div class="las-signal-row"><span class="las-k">Status</span><span class="las-pill las-pill--' + esc(status.replace(/\s+/g, '-')) + '">' + esc(status.toUpperCase()) + '</span></div>' +
        '<div class="las-signal-row"><span class="las-k">Active event</span><span class="las-v">' + esc(active && (active.title || active.event_title) || 'No active event') + '</span></div>' +
        '<div class="las-signal-row"><span class="las-k">Next signal</span><span class="las-v">' + esc(upcoming && (upcoming.title || upcoming.event_title) || 'No upcoming event yet') + '</span></div>' +
        '<div class="las-signal-row"><span class="las-k">Countdown</span><span class="las-v" data-las-countdown>' + esc(formatCountdown(state.countdown_seconds)) + '</span></div>' +
      '</div>' +
      (ctaHtml ? '<div class="las-cta-row">' + ctaHtml + '</div>' : '') +
      (chain.length
        ? '<div class="las-chain"><span class="las-tag">NEXT SIGNAL</span>' + chain.map(function (opt) {
            return '<span class="las-chain-item">' + esc(opt.title || opt.label || opt.option_id || 'Option') + '</span>';
          }).join('') + '</div>'
        : '');
  }

  function buildMissedHTML() {
    var state = window.MOONBOYS_WTF_EVENTS || {};
    var history = Array.isArray(window.MOONBOYS_ROGUELITE_MISSED_HISTORY) ? window.MOONBOYS_ROGUELITE_MISSED_HISTORY : [];
    var missedToday = Math.max(0, Number(state.missed_today) || 0);
    var total = Math.max(Math.max(0, Number(state.missed_history_count) || 0), history.length);
    var latest = history.length ? String(history[0].title || history[0].opportunity_type || 'Missed city signal') : 'No missed entries synced yet.';

    return '' +
      '<div class="las-missed-box">' +
        '<div class="las-missed-row"><span class="las-tag las-tag--missed">MISSED</span><strong>Total history: ' + total + '</strong></div>' +
        '<div class="las-missed-row">Today: ' + missedToday + '</div>' +
        '<div class="las-missed-row">Latest: ' + esc(latest) + '</div>' +
        '<div class="las-missed-copy">The city kept moving while you were away.</div>' +
      '</div>' +
      '<div class="las-reset-copy">Daily options reset at UTC midnight.</div>' +
      '<div class="las-reset-copy">Missed history does not reset.</div>';
  }

  function buildLinkedNoFactionHTML() {
    return '' +
      '<div class="las-panel" role="status" aria-label="Faction daily ops inactive">' +
        '<div class="las-title-row"><span class="las-dot"></span><strong>FACTION DAILY OPS</strong><span class="las-live">LIVE</span></div>' +
        '<div class="las-empty">Join a faction to unlock mission ops and faction signal routing.</div>' +
        '<p><a class="las-link-btn" href="/community.html#battle-join-faction">Join Faction</a></p>' +
      '</div>';
  }

  function buildUnlinkedHTML() {
    return '' +
      '<div class="las-panel las-panel--locked" role="status" aria-label="Faction daily ops inactive">' +
        '<div class="las-title-row"><span class="las-dot"></span><strong>FACTION DAILY OPS</strong><span class="las-live">OFFLINE</span></div>' +
        '<div class="las-empty">Telegram sync required to activate daily ops, WTF check-ins, and missed signal tracking.</div>' +
        '<p><a class="las-link-btn" href="/gkniftyheads-incubator.html">Link Telegram</a></p>' +
      '</div>';
  }

  async function buildHTML() {
    if (!isLinked()) return buildUnlinkedHTML();

    var factionKey = getFactionKey();
    if (!factionKey) return buildLinkedNoFactionHTML();

    return '' +
      '<div class="las-panel" role="status" aria-label="Faction daily ops">' +
        '<div class="las-title-row"><span class="las-dot"></span><strong>FACTION DAILY OPS</strong><span class="las-live">LIVE</span></div>' +
        '<div class="las-section">' +
          '<div class="las-section-head"><span>Today\'s faction missions</span><span class="las-faction-label">' + esc(factionLabel()) + '</span></div>' +
          buildMissionsHTML(factionKey) +
        '</div>' +
        '<div class="las-section">' +
          '<div class="las-section-head"><span>Daily WTF timed event signal</span><span class="las-tag">LIVE</span></div>' +
          buildWtfEventHTML(true) +
        '</div>' +
        '<div class="las-section">' +
          '<div class="las-section-head"><span>Missed opportunities</span></div>' +
          buildMissedHTML() +
        '</div>' +
      '</div>';
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.las-panel{padding:12px;border:1px solid rgba(86,220,255,.28);border-radius:12px;background:linear-gradient(165deg,rgba(8,18,34,.93),rgba(6,12,24,.9));display:flex;flex-direction:column;gap:10px;color:var(--color-text,#e6f0ff)}',
      '.las-panel--locked{border-color:rgba(248,81,73,.3);background:linear-gradient(165deg,rgba(28,12,20,.75),rgba(16,8,14,.85))}',
      '.las-title-row{display:flex;align-items:center;gap:8px;font-size:.76rem;letter-spacing:.08em;text-transform:uppercase}',
      '.las-dot{width:8px;height:8px;border-radius:50%;background:#56dcff;box-shadow:0 0 10px rgba(86,220,255,.9)}',
      '.las-live{margin-left:auto;padding:2px 8px;border-radius:999px;border:1px solid rgba(86,220,255,.35);background:rgba(86,220,255,.12)}',
      '.las-section{border:1px solid rgba(86,220,255,.2);border-radius:9px;padding:8px;background:rgba(86,220,255,.05)}',
      '.las-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:.69rem;text-transform:uppercase;letter-spacing:.06em;color:#8fdfff;margin-bottom:6px}',
      '.las-faction-label{font-size:.66rem;color:#d8f6ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px}',
      '.las-mission-list{display:flex;flex-direction:column;gap:6px}',
      '.las-mission-card{border:1px solid rgba(86,220,255,.16);border-radius:8px;padding:7px;background:rgba(86,220,255,.04)}',
      '.las-mission-card--done{box-shadow:0 0 12px rgba(63,185,80,.22);border-color:rgba(63,185,80,.38)}',
      '.las-mission-head{display:flex;align-items:center;gap:6px;font-size:.77rem}',
      '.las-check{flex-shrink:0}',
      '.las-mission-desc{margin-top:4px;font-size:.72rem;opacity:.9;line-height:1.35}',
      '.las-mission-progress{margin-top:4px;display:flex;justify-content:space-between;gap:8px;font-size:.68rem;color:#8fdfff}',
      '.las-bar{margin-top:4px;height:4px;border-radius:999px;background:rgba(86,220,255,.14);overflow:hidden}',
      '.las-bar span{display:block;height:100%;background:linear-gradient(90deg,#56dcff,#53f5b4)}',
      '.las-signal-grid{display:flex;flex-direction:column;gap:5px}',
      '.las-signal-row{display:flex;justify-content:space-between;gap:8px;font-size:.74rem}',
      '.las-k{color:var(--color-text-muted,#8b949e)}',
      '.las-v{font-weight:600;text-align:right}',
      '.las-pill{padding:2px 7px;border-radius:999px;border:1px solid rgba(86,220,255,.28);font-size:.62rem}',
      '.las-pill--active{color:#53f5b4;border-color:rgba(83,245,180,.45)}',
      '.las-pill--checked-in{color:#56dcff}',
      '.las-pill--completed{color:#3fb950;border-color:rgba(63,185,80,.45)}',
      '.las-pill--missed{color:#f85149;border-color:rgba(248,81,73,.45)}',
      '.las-cta-row{margin-top:7px;display:flex;gap:6px;flex-wrap:wrap}',
      '.las-btn{cursor:pointer;border:1px solid rgba(86,220,255,.4);background:rgba(86,220,255,.12);color:#d8f7ff;border-radius:8px;padding:5px 9px;font-size:.7rem;font-weight:700}',
      '.las-btn--secondary{background:rgba(83,245,180,.12);border-color:rgba(83,245,180,.4)}',
      '.las-chain{margin-top:7px;display:flex;flex-wrap:wrap;gap:5px}',
      '.las-tag{padding:2px 6px;border-radius:999px;background:rgba(86,220,255,.14);border:1px solid rgba(86,220,255,.3);font-size:.62rem;letter-spacing:.04em}',
      '.las-tag--missed{background:rgba(248,81,73,.14);border-color:rgba(248,81,73,.38);color:#ffbeb9}',
      '.las-chain-item{padding:2px 7px;border-radius:999px;border:1px solid rgba(86,220,255,.2);background:rgba(86,220,255,.06);font-size:.66rem}',
      '.las-missed-box{display:flex;flex-direction:column;gap:4px;font-size:.72rem}',
      '.las-missed-row{line-height:1.3}',
      '.las-missed-copy{margin-top:2px;color:#ffcfab}',
      '.las-reset-copy{font-size:.66rem;color:var(--color-text-muted,#8b949e)}',
      '.las-empty{font-size:.75rem;color:var(--color-text-muted,#8b949e);line-height:1.4}',
      '.las-link-btn{display:inline-block;padding:6px 10px;border-radius:8px;border:1px solid rgba(86,220,255,.38);background:rgba(86,220,255,.11);text-decoration:none;color:#d8f6ff;font-weight:700;font-size:.74rem}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  async function mount(containerOrId) {
    var el = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
    if (!el) return;
    injectStyles();
    var token = (Number(el.dataset.lasToken || 0) + 1);
    el.dataset.lasToken = String(token);
    el.innerHTML = '<div class="las-empty">Loading faction ops…</div>';
    var html = await buildHTML();
    if (String(el.dataset.lasToken) === String(token)) el.innerHTML = html;
  }

  function refresh() {
    document.querySelectorAll('[data-las-panel]').forEach(function (el) { mount(el); });
  }

  function handlePanelClicks(event) {
    var btn = event.target && event.target.closest ? event.target.closest('[data-las-action]') : null;
    if (!btn) return;
    var action = btn.getAttribute('data-las-action');
    var eventId = btn.getAttribute('data-event-id');
    if (!eventId || !window.MOONBOYS_DAILY_WTF) return;

    if (action === 'checkin' && typeof window.MOONBOYS_DAILY_WTF.checkInWtfEvent === 'function') {
      btn.disabled = true;
      window.MOONBOYS_DAILY_WTF.checkInWtfEvent(eventId).finally(function () { refresh(); });
      return;
    }

    if (action === 'complete' && typeof window.MOONBOYS_DAILY_WTF.completeWtfEvent === 'function') {
      btn.disabled = true;
      var completionSource = btn.getAttribute('data-completion-source') || '';
      var sourceId = btn.getAttribute('data-source-id') || '';
      window.MOONBOYS_DAILY_WTF.completeWtfEvent(eventId, completionSource, sourceId).finally(function () { refresh(); });
    }
  }

  function patchCountdownText() {
    var state = window.MOONBOYS_WTF_EVENTS;
    if (!state) return;
    var text = formatCountdown(state.countdown_seconds);
    document.querySelectorAll('[data-las-panel] [data-las-countdown]').forEach(function (el) {
      el.textContent = text;
    });
  }

  function ensureCountdownTicker() {
    if (_countdownTimer) return;
    _countdownTimer = setInterval(patchCountdownText, 1000);
  }

  function listenForUpdates() {
    document.addEventListener('click', handlePanelClicks);
    window.addEventListener('moonboys:wtf-events-ready', refresh);
    window.addEventListener('moonboys:wtf-event-checkin', refresh);
    window.addEventListener('moonboys:wtf-event-complete', refresh);
    window.addEventListener('battle-chamber:faction-data-ready', refresh);
    window.addEventListener('battle-chamber:activity-ready', refresh);

    if (window.MOONBOYS_STATE && typeof window.MOONBOYS_STATE.subscribe === 'function') {
      if (_stateUnsub) { try { _stateUnsub(); } catch (_) {} }
      _stateUnsub = window.MOONBOYS_STATE.subscribe(function () { refresh(); });
    }

    ensureCountdownTicker();
  }

  function bootstrap() {
    injectStyles();
    refresh();
    listenForUpdates();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  window.MOONBOYS_LIVE_ACTIVITY = {
    mount: mount,
    refresh: refresh,
    // Legacy compatibility: older pages may call addEvent() directly.
    // This panel now renders from synced global state, so manual event pushes are ignored.
    addEvent: function () {},
  };
}());
