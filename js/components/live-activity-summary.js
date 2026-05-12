/**
 * Crypto Moonboys  Live Activity Summary
 * =========================================
 * Shared frontend helper showing current faction activity state.
 *
 * Shows:
 *   - Faction Daily Ops: real server-backed mission data, or honest empty state
 *     (no hardcoded fallback missions are rendered as live faction data)
 *   - Daily WTF Signal: live Worker-provided event, loading, syncing-schedule fallback, or error
 *   - Missed Opportunities: event counts and missed XP from server globals
 *
 * Faction Daily Ops renders only real MOONBOYS_MISSION_DATA.  If no server
 * mission data is available, an honest "No live faction missions reported."
 * empty state is shown.  FACTION_MISSION_FALLBACKS is quarantined and not
 * used for live rendering.
 *
 * Daily WTF fallback (loading stall / helper unavailable) is labelled
 * "Syncing schedule" to distinguish it from a confirmed live signal.
 *
 * XP labels enforced:
 *   Score         = leaderboard ranking
 *   Arcade XP     = multiplayer gate progress (Block Topia entry)
 *   Block Topia XP = in-game progression only
 *   Faction       = faction alignment only
 *
 * Usage  auto-mount:
 *   <div data-las-panel></div>
 *   (script auto-mounts all elements with that attribute on DOMContentLoaded)
 *
 * Usage  manual:
 *   window.MOONBOYS_LIVE_ACTIVITY.mount(elementOrId)
 *   window.MOONBOYS_LIVE_ACTIVITY.refresh()
 *
 * Depends on (all optional  graceful fallback if absent):
 *   window.MOONBOYS_API          (api-config.js)
 *   window.MOONBOYS_IDENTITY     (identity-gate.js)
 *   window.MOONBOYS_FACTION      (faction-alignment.js)
 *   window.MOONBOYS_STATUS_PANEL (connection-status-panel.js)
 */
(function () {
  'use strict';

  var STYLE_ID = 'las-styles';
  var LOG_MAX = 6; // max recent activity entries to show

  //  True singleton: survive script re-execution (dynamic injection / re-mount) 
  // All shared mutable state lives on window.__MOONBOYS_LAS_SINGLETON so that a
  // second execution of this IIFE reuses the existing log array and listener
  // registration flag rather than resetting them.
  if (!window.__MOONBOYS_LAS_SINGLETON) {
    window.__MOONBOYS_LAS_SINGLETON = { activityLog: [], addToLog: null, listenersRegistered: false };
  }
  var _singleton = window.__MOONBOYS_LAS_SINGLETON;

  //  In-memory activity log 
  // Always points to the same array held by the singleton, even after re-execution.
  var _activityLog = _singleton.activityLog;

  function buildLogRowHTML(e) {
    var icon = e.type === 'xp' ? 'XP' : e.type === 'faction' ? 'FAC' : e.type === 'sync' ? 'SYNC' : 'LIVE';
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
      console.warn('[live-activity-summary] MOONBOYS_EVENT_BUS unavailable - activity:event not emitted.');
      return;
    }
    window.MOONBOYS_EVENT_BUS.emit('activity:event', entry);

    //  Performance: append directly to existing log containers 
    // Avoids a full async panel remount on every event.
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
    }
  }
  // Store addToLog on the singleton so a re-executing IIFE reuses the same function
  // reference (and the same _activityLog closure) rather than creating a new one.
  if (!_singleton.addToLog) { _singleton.addToLog = addToLog; }

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

  //  Helpers 

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

  //  Build HTML 

  // FACTION_MISSION_FALLBACKS is quarantined: these are locally-invented placeholders
  // that must NOT be rendered as live faction data. Kept for reference only.
  // Do NOT call the old fallback-mission helper from normaliseMissionList() or any live render path.
  var _QUARANTINED_FACTION_MISSION_FALLBACKS = {
    graffpunks: [
      { id: 'gp_chaos_3', label: 'Chaos Agent', description: 'Trigger 3 chaos events across any runs.', target: 3, reward: { warContrib: 70 } },
      { id: 'gp_combo_x3', label: 'Combo Graffiti', description: 'Reach a x3 combo multiplier in any run.', target: 3, reward: { warContrib: 65 } },
      { id: 'gp_high_risk', label: 'Risk Canvas', description: 'Score 500+ points during a high-risk window.', target: 500, reward: { warContrib: 90 } },
    ],
    default: [
      { id: 'daily_arcade_run', label: 'Arcade Proof Run', description: 'Complete an arcade run to create faction activity proof.', target: 1, reward: { warContrib: 50 } },
      { id: 'daily_faction_push', label: 'Faction Push', description: 'Advance one faction mission or Battle Chamber action today.', target: 1, reward: { warContrib: 50 } },
      { id: 'daily_score_signal', label: 'Score Signal', description: 'Post a scored run so your faction rail has live activity.', target: 1, reward: { warContrib: 50 } },
    ],
  };
  void _QUARANTINED_FACTION_MISSION_FALLBACKS; // referenced to suppress lint warnings; see quarantine comment above

  function rewardText(reward) {
    if (!reward) return '';
    if (typeof reward === 'string') return reward;
    if (reward.warContrib != null) return '+' + String(reward.warContrib) + ' war contrib';
    if (reward.xp != null) return '+' + String(reward.xp) + ' XP preview';
    return '';
  }

  function normaliseMissionList() {
    var faction = getFactionStatus();
    var factionKey = faction && faction.faction && faction.faction !== 'unaligned' ? faction.faction : null;
    if (!factionKey) return { factionKey: null, missions: [] };
    var missionData = window.MOONBOYS_MISSION_DATA || {};
    var data = missionData[factionKey] || {};
    var daily = Array.isArray(data.daily) ? data.daily : [];
    if (!daily.length) {
      // No real server-backed mission data — show honest empty state.
      return { factionKey: factionKey, missions: [] };
    }
    var completed = Array.isArray(data.completed) ? data.completed : [];
    var progress = data.progress && typeof data.progress === 'object' ? data.progress : {};
    var missions = daily.slice(0, 3).map(function (m) {
      var id = m.id || m.key || m.title || '';
      var p = progress[id] || {};
      var current = Number(p.progress != null ? p.progress : (p.current != null ? p.current : (p.count != null ? p.count : (p.value != null ? p.value : (m.progress || 0)))));
      var target = Number(p.target != null ? p.target : (m.target || m.goal || 1));
      var done = completed.indexOf(id) !== -1 || p.complete === true || p.completed === true || m.complete === true || m.completed === true || current >= target;
      return {
        title: m.title || m.name || m.label || id || 'Faction mission',
        objective: m.description || m.objective || 'Complete the faction objective.',
        current: current,
        target: target,
        done: done,
        reward: rewardText(m.reward || m.contribution || m.reward_preview || ''),
      };
    });
    return { factionKey: factionKey, missions: missions };
  }

  function missionHTML(missions) {
    if (!missions.length) return '<div class="las-empty">No live faction missions reported yet.</div>';
    return missions.map(function (m) {
      var current = Number.isFinite(Number(m.current)) ? Math.max(0, Number(m.current)) : 0;
      var target = Number.isFinite(Number(m.target)) && Number(m.target) > 0 ? Number(m.target) : 1;
      var reward = m.reward ? esc(m.reward) : (m.done ? 'COMPLETE' : 'LIVE');
      return '<div class="las-mission-row ' + (m.done ? 'is-complete' : '') + '">' +
        '<span class="las-mission-title">' + esc(m.title) + '</span>' +
        '<span class="las-mission-meta"><span class="las-mission-progress">' + esc(String(current)) + '/' + esc(String(target)) + '</span><span class="las-mission-sep" aria-hidden="true">·</span><span class="las-mission-reward">' + reward + '</span></span>' +
      '</div>';
    }).join('');
  }

  function getWtfState() {
    var state = window.MOONBOYS_WTF_EVENTS || null;
    return state && typeof state === 'object' ? state : null;
  }

  var WTF_LOADING_STALL_MS = 8000;
  var WTF_LOADING_REPAINT_BUFFER_MS = 250;
  var WTF_HELPER_RETRY_MS = 400;
  var WTF_HELPER_RETRY_MAX = 8;
  var WTF_RECOVERY_TIMEOUT_MS = 5000;
  var WTF_EMERGENCY_STATE_TTL_MS = 2 * 60 * 1000;

  function clearWtfLoadingRepaintTimer() {
    if (_singleton.wtfLoadingRepaintTimer) {
      clearTimeout(_singleton.wtfLoadingRepaintTimer);
      _singleton.wtfLoadingRepaintTimer = null;
    }
  }

  function clearWtfHelperRetryTimer() {
    if (_singleton.wtfHelperRetryTimer) {
      clearTimeout(_singleton.wtfHelperRetryTimer);
      _singleton.wtfHelperRetryTimer = null;
    }
  }

  function scheduleWtfHelperRetry() {
    if (_singleton.wtfHelperRetryTimer) return;
    var attempts = Number(_singleton.wtfHelperRetryAttempts || 0);
    if (attempts >= WTF_HELPER_RETRY_MAX) return;
    _singleton.wtfHelperRetryAttempts = attempts + 1;
    _singleton.wtfHelperRetryTimer = setTimeout(function () {
      _singleton.wtfHelperRetryTimer = null;
      refresh();
    }, WTF_HELPER_RETRY_MS);
  }

  function scheduleWtfLoadingFallbackRepaint(nowMs) {
    if (_singleton.wtfLoadingRepaintTimer) return;
    var startedAt = Number(_singleton.wtfLoadingStartedAt || nowMs || Date.now());
    var elapsed = Math.max(0, (nowMs || Date.now()) - startedAt);
    var delay = Math.max(0, (WTF_LOADING_STALL_MS - elapsed) + WTF_LOADING_REPAINT_BUFFER_MS);
    _singleton.wtfLoadingRepaintTimer = setTimeout(function () {
      _singleton.wtfLoadingRepaintTimer = null;
      refresh();
    }, delay);
  }

  function normalizeEmergencyEvent(event) {
    if (!event || typeof event !== 'object') return null;
    var id = event.event_id || event.id || event.key || '';
    return Object.assign({}, event, {
      id: id,
      event_id: id,
      title: event.title || event.name || id || 'Daily WTF Signal',
      description: event.description || event.objective || event.requirement || '',
      objective: event.objective || event.description || event.requirement || '',
      requirement: event.requirement || event.objective || event.description || event.required_action || '',
      start_at: event.start_at || event.starts_at || event.start_time || event.startsAt || null,
      end_at: event.end_at || event.ends_at || event.end_time || event.endsAt || null,
      status: event.status || 'upcoming',
    });
  }

  function normalizeEmergencyState(payload) {
    var safe = payload && typeof payload === 'object' ? payload : null;
    if (!safe || !safe.ok) return null;
    var active = normalizeEmergencyEvent(safe.active_event);
    var upcoming = Array.isArray(safe.upcoming_events) ? safe.upcoming_events.map(normalizeEmergencyEvent).filter(Boolean) : [];
    var next = normalizeEmergencyEvent(safe.next_event) || upcoming[0] || null;
    if (!active && !next) return null;
    var countdown = Number(safe.countdown_seconds);
    if (!Number.isFinite(countdown) || countdown < 0) countdown = 0;
    return {
      ok: true,
      source: safe.source || safe.auth_mode || 'direct_panel_recovery',
      status: active ? 'active' : 'upcoming',
      active_event: active,
      upcoming_events: upcoming,
      next_event: next,
      countdown_seconds: countdown,
      checked_in: !!safe.checked_in,
      current_task: safe.current_task || active || next || null,
      completed_today: Number(safe.completed_today) || 0,
      missed_today: Number(safe.missed_today) || 0,
      chain_options: Array.isArray(safe.chain_options) ? safe.chain_options : [],
      diagnostic: '',
    };
  }

  function getSignedAuthForEmergencyRecovery() {
    try {
      var identity = window.MOONBOYS_IDENTITY;
      if (!identity || typeof identity.getSignedTelegramAuth !== 'function') return null;
      return identity.getSignedTelegramAuth() || null;
    } catch (_) {
      return null;
    }
  }

  function hasUsablePrimaryWtfState(state) {
    if (!state || typeof state !== 'object') return false;
    if (state.status === 'error') return false;
    if (state.active_event) return true;
    if (state.next_event) return true;
    if (Array.isArray(state.upcoming_events) && state.upcoming_events.length > 0) return true;
    return false;
  }

  function getEmergencyStateIfUsable() {
    var emergency = _singleton.wtfEmergencyState;
    if (!emergency || typeof emergency !== 'object') return null;
    var recoveredAt = Number(_singleton.wtfEmergencyRecoveredAt || 0);
    if (!Number.isFinite(recoveredAt) || recoveredAt <= 0) return emergency;
    if ((Date.now() - recoveredAt) > WTF_EMERGENCY_STATE_TTL_MS) {
      _singleton.wtfEmergencyState = null;
      _singleton.wtfEmergencyRecoveredAt = 0;
      return null;
    }
    return emergency;
  }

  function maybeKickEmergencyWtfRecovery() {
    if (_singleton.wtfEmergencyFetchInFlight) return;
    var base = getApiBase();
    if (!base) return;
    _singleton.wtfEmergencyFetchInFlight = true;
    var auth = getSignedAuthForEmergencyRecovery();
    var requestOptions = auth
      ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_auth: auth }),
      }
      : {};
    var ac = (typeof AbortController === 'function') ? new AbortController() : null;
    if (ac) requestOptions.signal = ac.signal;
    var timer = setTimeout(function () {
      try { if (ac) ac.abort(); } catch (_) {}
    }, WTF_RECOVERY_TIMEOUT_MS);
    fetch(base + '/wtf/events/today', requestOptions)
      .then(function (res) { return res && res.ok ? res.json() : null; })
      .then(function (payload) {
        var recovered = normalizeEmergencyState(payload);
        if (recovered) {
          _singleton.wtfEmergencyState = recovered;
          _singleton.wtfEmergencyRecoveredAt = Date.now();
          refresh();
        }
      })
      .catch(function () {})
      .finally(function () {
        clearTimeout(timer);
        _singleton.wtfEmergencyFetchInFlight = false;
      });
  }

  function buildDeterministicWtfFallbackState(now) {
    var current = now instanceof Date ? now : new Date();
    var api = window.MOONBOYS_DAILY_WTF;
    if (!api || typeof api.makeFallbackSchedule !== 'function') return null;
    var schedule = api.makeFallbackSchedule(current);
    if (!schedule || typeof schedule !== 'object') return null;
    var active = schedule.active_event || null;
    var next = schedule.next_event || (Array.isArray(schedule.upcoming_events) ? (schedule.upcoming_events[0] || null) : null);
    if (!active && !next) {
      var tomorrowStart = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1));
      var tomorrowSchedule = api.makeFallbackSchedule(tomorrowStart);
      var nextFromTomorrow = tomorrowSchedule && (
        tomorrowSchedule.active_event ||
        tomorrowSchedule.next_event ||
        (Array.isArray(tomorrowSchedule.upcoming_events) ? (tomorrowSchedule.upcoming_events[0] || null) : null)
      );
      if (nextFromTomorrow) next = nextFromTomorrow;
    }
    var countdown = Number(schedule.countdown_seconds);
    if ((!Number.isFinite(countdown) || countdown <= 0) && !active && next && next.start_at) {
      countdown = Math.max(0, Math.floor((Date.parse(next.start_at) - current.getTime()) / 1000));
    }
    return Object.assign({}, schedule, {
      source: 'panel_loading_fallback',
      status: active ? 'active' : 'upcoming',
      fallback: true,
      diagnostic: 'Signal feed fallback active',
      checked_in: false,
      next_event: next || null,
      countdown_seconds: Number.isFinite(countdown) && countdown > 0 ? countdown : 0,
      current_task: schedule.current_task || active || next || null,
    });
  }

  function countdownText(seconds) {
    var total = Math.max(0, Math.floor(Number(seconds) || 0));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
  }

  function wtfStatus(state) {
    if (!state) return 'waiting';
    if (state.active_event && state.checked_in) return 'checked in';
    if (state.active_event) return 'active';
    if (state.next_event || (state.upcoming_events && state.upcoming_events.length)) return 'upcoming';
    if (state.completed_today) return 'completed';
    if (state.missed_today) return 'missed / expired';
    return 'waiting';
  }

  var VALID_WTF_COMPLETION_SOURCES = {
    arcade_run_accepted: true,
    faction_daily_mission: true,
    battle_chamber_proof: true,
    roguelite_branch: true,
  };

  function getWtfProofSource(state, active) {
    var sources = [
      active && active.completion_proof,
      active,
      state && state.current_task,
      state && state.completion_proof,
    ];
    for (var i = 0; i < sources.length; i++) {
      var item = sources[i] || {};
      var source = item.completion_source || item.proof_source || item.source;
      var sourceId = item.source_id || item.proof_id || item.proofId || item.run_id || item.mission_id || item.branch_id || item.battle_proof_id;
      if (source && sourceId && VALID_WTF_COMPLETION_SOURCES[source]) {
        return { completion_source: source, source_id: sourceId };
      }
    }
    return null;
  }

  function eventTitle(event, fallback) {
    return event ? (event.title || event.name || event.id || event.event_id || fallback) : fallback;
  }

  function wtfStatusLabel(status, completedOnly) {
    if (completedOnly || status === 'completed') return 'COMPLETE';
    if (status === 'active' || status === 'checked in') return 'ACTIVE';
    if (status === 'missed / expired' || status === 'missed' || status === 'expired') return 'MISSED';
    if (status === 'waiting') return 'WAITING';
    return 'UPCOMING';
  }

  function wtfHTML(linked) {
    var state = getWtfState();
    var emergencyState = getEmergencyStateIfUsable();
    if ((!state || state.status === 'error') && emergencyState) {
      state = emergencyState;
    }
    if (!state || state.status === 'loading') {
      var nowMs = Date.now();
      if (!_singleton.wtfLoadingStartedAt) _singleton.wtfLoadingStartedAt = nowMs;
      scheduleWtfLoadingFallbackRepaint(nowMs);
      if ((nowMs - _singleton.wtfLoadingStartedAt) < WTF_LOADING_STALL_MS) {
        return '<div class="las-signal-card" data-wtf-state="loading"><span class="las-pill las-pill--next">UPCOMING</span><strong>Daily WTF: Loading signal</strong><div class="las-countdown" data-wtf-countdown aria-live="polite">Starts in --:--:--</div></div>';
      }
      var fallbackState = buildDeterministicWtfFallbackState(new Date());
      if (!fallbackState) {
        maybeKickEmergencyWtfRecovery();
        scheduleWtfHelperRetry();
        if (Number(_singleton.wtfHelperRetryAttempts || 0) < WTF_HELPER_RETRY_MAX) {
          return '<div class="las-signal-card" data-wtf-state="loading"><span class="las-pill las-pill--next">UPCOMING</span><strong>Daily WTF: Loading signal</strong><div class="las-countdown" data-wtf-countdown aria-live="polite">Starts in --:--:--</div><a class="las-action-btn" href="/games/">Get Ready</a></div>';
        }
        return '<div class="las-signal-card" data-wtf-state="error"><span class="las-pill las-pill--missed">UPCOMING</span><strong>Daily WTF: Signal unavailable</strong><div class="las-countdown" data-wtf-countdown aria-live="polite">Starts in --:--:--</div><a class="las-action-btn" href="/games/">Get Ready</a></div>';
      }
      _singleton.wtfHelperRetryAttempts = 0;
      clearWtfHelperRetryTimer();
      var fallbackFocus = fallbackState.active_event || fallbackState.next_event || null;
      var fallbackTitle = eventTitle(fallbackFocus, 'Next Daily WTF Signal');
      var fallbackAction = linked
        ? '<a class="las-action-btn" href="/games/">Get Ready</a>'
        : '<a class="las-action-btn" href="/gkniftyheads-incubator.html">Link Telegram</a>';
      return '<div class="las-signal-card" data-wtf-state="fallback"><span class="las-pill las-pill--next">UPCOMING</span><strong>Daily WTF: Syncing schedule</strong><div class="las-countdown las-fallback-label">Fallback schedule · ' + esc(fallbackTitle) + '</div><div class="las-countdown" data-wtf-countdown>Starts in ' + countdownText(fallbackState.countdown_seconds) + '</div>' + fallbackAction + '</div>';
    }
    clearWtfLoadingRepaintTimer();
    clearWtfHelperRetryTimer();
    _singleton.wtfHelperRetryAttempts = 0;
    _singleton.wtfLoadingStartedAt = null;
    if (state.status === 'error') {
      maybeKickEmergencyWtfRecovery();
      return '<div class="las-signal-card" data-wtf-state="error"><span class="las-pill las-pill--missed">UPCOMING</span><strong>Daily WTF: Signal unavailable</strong><div class="las-countdown" data-wtf-countdown>Starts in --:--:--</div><a class="las-action-btn" href="/games/">Get Ready</a></div>';
    }
    if (hasUsablePrimaryWtfState(getWtfState())) {
      _singleton.wtfEmergencyState = null;
      _singleton.wtfEmergencyRecoveredAt = 0;
    }
    var active = state.active_event || null;
    var next = state.next_event || (state.upcoming_events && state.upcoming_events[0]) || null;
    var status = wtfStatus(state);
    var completed = Number(state.completed_today || 0) > 0;
    var completedOnly = completed && !active && !next;
    var eventId = active && (active.id || active.event_id || active.key) ? (active.id || active.event_id || active.key) : '';
    var focus = active || next || (state.completed_events && state.completed_events[0]) || (state.expired_events && state.expired_events[0]) || null;
    var title = eventTitle(focus, 'No Daily WTF signals generated for today');
    var buttons = '';
    var timerLabel = 'Starts in';

    if (completedOnly) {
      timerLabel = 'Next in';
    } else if (active) {
      timerLabel = 'Ends in';
      if (linked && eventId && !state.checked_in && !completed) {
        buttons += '<button type="button" class="las-action-btn" data-wtf-checkin data-event-id="' + esc(eventId) + '">Check In</button>';
      }
      if (linked && state.checked_in && !completed) {
        var proof = getWtfProofSource(state, active);
        if (proof) {
          buttons += '<button type="button" class="las-action-btn" data-wtf-complete data-event-id="' + esc(eventId) + '" data-completion-source="' + esc(proof.completion_source) + '" data-source-id="' + esc(proof.source_id) + '">Complete with proof</button>';
        } else {
          buttons += '<a class="las-action-btn" href="/games/">Play Arcade</a>';
        }
      }
    } else if (next) {
      status = 'upcoming';
      buttons += '<a class="las-action-btn" href="/games/">Get Ready</a>';
    } else if (Number(state.missed_today || 0) > 0) {
      status = 'missed / expired';
      buttons += '<a class="las-action-btn" href="/games/">Get Ready</a>';
    } else {
      status = 'waiting';
      buttons += '<a class="las-action-btn" href="/games/">Get Ready</a>';
    }

    var pillClass = status === 'active' || status === 'checked in' ? 'las-pill--live' : status === 'completed' ? 'las-pill--done' : status === 'missed / expired' ? 'las-pill--missed' : 'las-pill--next';
    var options = Array.isArray(state.chain_options) && state.chain_options.length
      ? '<div class="las-chain-options"><strong>Unlocked chain options</strong>' + state.chain_options.slice(0, 3).map(function (o) { return '<span>' + esc(o.title || o.display_title || o.name || o.id || 'Chain option') + '</span>'; }).join('') + '</div>'
      : '';
    var statusLabel = wtfStatusLabel(status, completedOnly);
    var completedPrefix = completedOnly ? 'COMPLETE ' : '';
    return '<div class="las-signal-card" data-wtf-state="' + esc(status) + '">' +
      '<span class="las-pill ' + pillClass + '">' + esc(statusLabel) + '</span>' +
      '<strong>Daily WTF: ' + completedPrefix + esc(title) + '</strong>' +
      '<div class="las-countdown" data-wtf-countdown>' + esc(timerLabel) + ' ' + countdownText(state.countdown_seconds) + '</div>' +
      buttons + options +
      '</div>';
  }

  function missedHTML() {
    var state = getWtfState() || {};
    var rogueliteState = window.MOONBOYS_ROGUELITE_DAILY_STATE || {};
    var history = Array.isArray(window.MOONBOYS_ROGUELITE_MISSED_HISTORY) ? window.MOONBOYS_ROGUELITE_MISSED_HISTORY : [];
    var count = Number(
      state.missed_events_all_time != null ? state.missed_events_all_time :
        (rogueliteState.missed_events_all_time != null ? rogueliteState.missed_events_all_time :
          (state.missed_history_count != null ? state.missed_history_count : history.length))
    );
    var today = Number(
      state.missed_events_today != null ? state.missed_events_today :
        (rogueliteState.missed_events_today != null ? rogueliteState.missed_events_today :
          (state.missed_today != null ? state.missed_today : 0))
    );
    // missed_xp_all_time: prefer WTF state (most recent), fall back to roguelite daily state,
    // then compute from history items if neither source has the value yet.
    var xpAllTime = Number(
      state.missed_xp_all_time != null ? state.missed_xp_all_time :
        (rogueliteState.missed_xp_all_time != null ? rogueliteState.missed_xp_all_time :
          history.reduce(function (sum, item) {
            return sum + (Number(item.missed_xp_value) || 0);
          }, 0))
    );
    var xpDisplay = xpAllTime.toLocaleString ? xpAllTime.toLocaleString() : String(xpAllTime);
    return '<div class="las-missed-box"><span class="las-pill las-pill--missed">MISSED</span>' +
      '<div class="las-missed-xp"><strong>Missed XP: ' + esc(xpDisplay) + '</strong></div>' +
      '<div class="las-missed-meta" aria-label="' + esc(String(count)) + ' missed all-time and ' + esc(String(today)) + ' missed today"><span class="las-missed-stat">' + esc(String(count)) + ' missed all-time</span><span class="las-missed-sep" aria-hidden="true">·</span><span class="las-missed-stat">' + esc(String(today)) + ' today</span></div>' +
      '</div>';
  }

  async function buildHTML() {
    var linked = isLinked();
    var missionState = normaliseMissionList();

    if (!linked) {
      return '<div class="las-panel las-panel--ops" role="status" aria-label="Faction daily ops">' +
        '<div class="las-ops-head"><span class="las-live-dot las-live-dot--warn"></span><div><strong>Faction Daily Ops</strong><span>Telegram sync inactive</span></div></div>' +
        '<p class="las-empty">Telegram sync is required to activate the live system.</p>' +
        '<a href="/gkniftyheads-incubator.html" class="las-link las-ops-cta">Link Telegram</a>' +
      '</div>';
    }

    if (!missionState.factionKey) {
      return '<div class="las-panel las-panel--ops" role="status" aria-label="Faction daily ops">' +
        '<div class="las-ops-head"><span class="las-live-dot las-live-dot--warn"></span><div><strong>Faction Daily Ops</strong><span>No faction selected</span></div></div>' +
        '<p class="las-empty">Join a faction to unlock daily ops and faction signals.</p>' +
        '<a href="/community.html#battle-join-faction" class="las-link las-ops-cta">Join Faction</a>' +
      '</div>';
    }

    return '<div class="las-panel las-panel--ops" role="status" aria-label="Faction daily ops">' +
      '<div class="las-ops-head"><span class="las-live-dot"></span><div><strong>Faction Daily Ops</strong><span>Compact mission feed</span></div></div>' +
      '<div class="las-section-title">Today\'s Missions</div>' + missionHTML(missionState.missions) +
      '<div class="las-section-title">Daily WTF Signal</div>' + wtfHTML(linked) +
      '<div class="las-section-title">Missed Opportunities</div>' + missedHTML() +
      '<div class="las-row las-row--cta"><a class="las-link las-link--tiny" href="/community.html">View details</a></div>' +
    '</div>';
  }

  //  CSS 

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.las-panel{padding:10px 14px;border:1px solid rgba(86,220,255,.18);border-radius:10px;background:linear-gradient(165deg,rgba(10,23,44,.7),rgba(8,18,34,.6));font-size:.82rem;color:var(--color-text,#e6f0ff);display:flex;flex-direction:column;gap:6px}',
      '.las-row{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}',
      '.las-row--cta{margin-top:3px;justify-content:flex-end}',
      '.las-label{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted,#8b949e);flex-shrink:0;min-width:80px}',
      '.las-val{font-size:.82rem;color:var(--color-text,#e6f0ff)}',
      '.las-val--good{color:#3fb950}',
      '.las-val--bad{color:#f85149}',
      '.las-val--warn{color:#d2991d}',
      '.las-link{color:#56dcff;text-decoration:underline;font-size:.8rem}',
      '.las-link--tiny{font-size:.66rem;opacity:.82}',
      '.las-event-log{margin-top:6px;border-top:1px solid rgba(86,220,255,.1);padding-top:6px;display:flex;flex-direction:column;gap:3px}',
      '.las-event-row{display:flex;align-items:baseline;gap:5px;font-size:.75rem}',
      '.las-event-time{color:var(--color-text-muted,#8b949e);flex-shrink:0;font-size:.68rem}',
      '.las-event-icon{flex-shrink:0}',
      '.las-event-text{color:var(--color-text,#e6f0ff);opacity:.85}',
      '.las-panel--ops{border-color:rgba(0,229,255,.30);box-shadow:0 0 16px rgba(0,229,255,.12),inset 0 0 18px rgba(255,45,120,.05);background:linear-gradient(165deg,rgba(4,12,28,.92),rgba(8,18,34,.72))}',
      '.las-ops-head{display:flex;align-items:center;gap:9px;margin-bottom:4px}.las-ops-head strong{display:block;color:#fff;text-transform:uppercase;letter-spacing:.08em}.las-ops-head span{display:block;color:var(--color-text-muted,#8b949e);font-size:.7rem}',
      '.las-live-dot{width:8px;height:8px;border-radius:99px;background:#3fb950;box-shadow:0 0 10px #3fb950;animation:lasPulse 1.2s infinite}.las-live-dot--warn{background:#f7c948;box-shadow:0 0 10px #f7c948}',
      '@keyframes lasPulse{0%,100%{opacity:.55;transform:scale(.9)}50%{opacity:1;transform:scale(1.15)}}',
      '.las-section-title{margin-top:8px;padding-top:8px;border-top:1px solid rgba(86,220,255,.13);font-size:.63rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#56dcff}',
      '.las-empty{color:var(--color-text-muted,#8b949e);font-size:.74rem;line-height:1.45;margin:4px 0}',
      '.las-ops-cta{display:inline-flex;margin-top:4px;padding:7px 9px;border:1px solid rgba(0,229,255,.45);background:rgba(0,229,255,.08);font-weight:800;text-transform:uppercase;text-decoration:none}',
      '.las-mission-row,.las-signal-card,.las-missed-box{border:1px solid rgba(86,220,255,.18);background:rgba(86,220,255,.055);padding:7px 8px;border-radius:8px;box-shadow:inset 0 0 12px rgba(0,229,255,.04)}',
      '.las-mission-row{display:flex;flex-direction:column;gap:2px;align-items:flex-start}',
      '.las-mission-row.is-complete{border-color:rgba(63,185,80,.45);box-shadow:0 0 12px rgba(63,185,80,.12)}',
      '.las-mission-title{color:#fff;font-size:.7rem;line-height:1.3;word-break:break-word}',
      '.las-mission-meta{display:flex;align-items:baseline;gap:4px;font-size:.61rem;line-height:1.25}',
      '.las-mission-progress{font-size:.61rem;color:#c8f0ff}',
      '.las-mission-sep{color:var(--color-text-muted,#8b949e);font-size:.58rem}',
      '.las-mission-reward{font-size:.62rem;color:#f7c948;font-weight:800}',
      '.las-pill{display:inline-flex;width:max-content;padding:2px 6px;border-radius:99px;border:1px solid rgba(86,220,255,.35);font-size:.56rem;font-weight:900;letter-spacing:.08em;color:#56dcff;margin-bottom:5px}.las-pill--live{color:#3fb950;border-color:rgba(63,185,80,.45)}.las-pill--done{color:#f7c948;border-color:rgba(247,201,72,.45)}.las-pill--missed{color:#ff7b72;border-color:rgba(255,123,114,.45)}',
      '.las-signal-card strong{display:block;color:#fff}',
      '.las-countdown{font-family:monospace;color:#00e5ff;font-size:.86rem;text-shadow:0 0 8px rgba(0,229,255,.4);margin:4px 0}',
      '.las-action-btn{margin:4px 5px 0 0;padding:5px 7px;border:1px solid rgba(0,229,255,.45);background:rgba(0,229,255,.08);color:#c8f0ff;font-weight:800;text-transform:uppercase;font-size:.6rem;cursor:pointer}',
      '.las-task-copy{margin-top:5px;color:#f7c948;font-size:.68rem;line-height:1.35;border-left:2px solid rgba(247,201,72,.45);padding-left:6px}',
      '.las-chain-options{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}.las-chain-options span{font-size:.58rem;border:1px solid rgba(247,201,72,.3);color:#f7c948;padding:2px 5px}',
      '.las-missed-xp{font-size:.68rem;line-height:1.25}',
      '.las-missed-meta{color:var(--color-text-muted,#8b949e);font-size:.58rem;line-height:1.25;display:flex;align-items:baseline;gap:4px;flex-wrap:wrap}',
      '.las-missed-stat{white-space:nowrap}',
      '.las-missed-sep{color:var(--color-text-muted,#8b949e)}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  //  Mount 

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
    document.querySelectorAll('[data-las-panel]').forEach(function (el) { mount(el); });
  }

  //  Event log listeners 

  function listenForActivity() {
    // Null guard: skip if bus is unavailable
    var bus = window.MOONBOYS_EVENT_BUS;
    if (!bus) return;
    // Idempotency guard: register listeners only once even if this script re-executes.
    // Stored on the singleton (not a module-scoped var) so it survives re-execution.
    if (_singleton.listenersRegistered) return;
    _singleton.listenersRegistered = true;
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
      // UI row update is handled exclusively by the MOONBOYS_STATE subscriber
      // (moonboys-state.js bridges sync:state into state.sync so every subscriber
      //  receives the update automatically  no direct UI call needed here).
    });

    // Score updates arrive via the bus bridge as activity:event with _src set.
    bus.on('activity:event', function (d) {
      if (d._src === 'moonboys:score-updated') {
        var text = 'Score recorded' + (d.game ? ' (' + d.game + ')' : '');
        addToLog(buildLogEntry('score', text));
      }
    });
  }

  function updateWtfCountdownUI() {
    var state = getWtfState();
    if (!state) return;
    document.querySelectorAll('[data-wtf-countdown]').forEach(function (el) {
      el.textContent = countdownText(state.countdown_seconds);
    });
  }

  function bindOpsActions() {
    document.addEventListener('click', function (event) {
      var check = event.target && event.target.closest ? event.target.closest('[data-wtf-checkin]') : null;
      var complete = event.target && event.target.closest ? event.target.closest('[data-wtf-complete]') : null;
      var btn = check || complete;
      if (!btn) return;
      var api = window.MOONBOYS_DAILY_WTF;
      if (!api) return;
      var eventId = btn.getAttribute('data-event-id') || '';
      var completionSource = btn.getAttribute('data-completion-source') || '';
      var sourceId = btn.getAttribute('data-source-id') || '';
      btn.disabled = true;
      var action = check && typeof api.checkInWtfEvent === 'function'
        ? api.checkInWtfEvent(eventId)
        : complete && typeof api.completeWtfEvent === 'function' && completionSource && sourceId
          ? api.completeWtfEvent(eventId, completionSource, sourceId)
          : Promise.resolve(null);
      action.then(function () { refresh(); }).catch(function () {}).finally(function () { btn.disabled = false; });
    });
    window.addEventListener('moonboys:wtf-events-ready', refresh);
    window.addEventListener('moonboys:wtf-event-checkin', refresh);
    window.addEventListener('moonboys:wtf-event-complete', refresh);
    window.addEventListener('moonboys:wtf-countdown-tick', updateWtfCountdownUI);
    window.addEventListener('battle-chamber:faction-data-ready', refresh);
  }

  //  Bootstrap 

  function bootstrap() {
    injectStyles();
    document.querySelectorAll('[data-las-panel]').forEach(function (el) { mount(el); });

    // Bus listeners are log-only: they append activity entries and do not
    // patch sync/faction UI rows, trigger remounts, or call refresh().
    listenForActivity();
    if (!_singleton.opsActionsBound) {
      _singleton.opsActionsBound = true;
      bindOpsActions();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  //  Public API 

  window.MOONBOYS_LIVE_ACTIVITY = {
    mount: mount,
    refresh: refresh,
    addEvent: function (type, text) { addToLog(buildLogEntry(type || 'info', text || '')); },
  };

}());
