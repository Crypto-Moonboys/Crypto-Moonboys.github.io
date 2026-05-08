const POLL_MS = 60 * 1000;
let pollTimer = null;
let lastCountdownTick = null;

function getApiBase() {
  const cfg = (typeof window !== 'undefined') ? window.MOONBOYS_API : null;
  return cfg && cfg.BASE_URL ? String(cfg.BASE_URL).replace(/\/$/, '') : '';
}

function getSignedAuth() {
  try {
    const identity = window.MOONBOYS_IDENTITY;
    if (!identity || typeof identity.getSignedTelegramAuth !== 'function') return null;
    return identity.getSignedTelegramAuth() || null;
  } catch (_) {
    return null;
  }
}

function makeFallbackSchedule(now = new Date()) {
  const utcDay = now.toISOString().slice(0, 10);
  const windows = [
    { event_id: 'wtf-morning-signal', title: 'Morning WTF Signal', startHour: 8, durationMinutes: 90, description: 'Open an accepted arcade run while the morning signal is live.', required_action: 'play_any_accepted_arcade_run' },
    { event_id: 'wtf-midday-rush', title: 'Midday Faction Rush', startHour: 12, durationMinutes: 90, description: 'Push a faction mission or battle chamber proof during the rush.', required_action: 'complete_faction_or_battle_action' },
    { event_id: 'wtf-evening-burst', title: 'Evening Arcade Burst', startHour: 18, durationMinutes: 120, description: 'Score in any arcade game before the burst closes.', required_action: 'score_target_any_game' },
    { event_id: 'wtf-late-chaos', title: 'Late Night Chaos Window', startHour: 22, durationMinutes: 90, description: 'Choose a chaos path and complete the objective.', required_action: 'choose_and_complete_chaos_path' },
  ];
  const nowMs = now.getTime();
  const events = windows.map((w) => {
    const start = Date.parse(`${utcDay}T${String(w.startHour).padStart(2, '0')}:00:00.000Z`);
    const end = start + (w.durationMinutes * 60 * 1000);
    return {
      id: w.event_id,
      event_id: w.event_id,
      utc_day: utcDay,
      title: w.title,
      description: w.description,
      objective: w.description,
      required_action: w.required_action,
      start_at: new Date(start).toISOString(),
      end_at: new Date(end).toISOString(),
      status: nowMs < start ? 'upcoming' : nowMs < end ? 'active' : 'expired',
      fallback: true,
    };
  });
  const active = events.find((event) => event.status === 'active') || null;
  const next = events.find((event) => event.status === 'upcoming') || null;
  return {
    ok: true,
    source: 'client_fallback_schedule',
    utc_day: utcDay,
    active_event: active,
    upcoming_events: events.filter((event) => event.status === 'upcoming'),
    next_event: next,
    countdown_seconds: active ? Math.max(0, Math.floor((Date.parse(active.end_at) - nowMs) / 1000)) : next ? Math.max(0, Math.floor((Date.parse(next.start_at) - nowMs) / 1000)) : 0,
    no_events: !active && !next,
    diagnostic: 'Using deterministic client fallback because /wtf/events/today did not return a usable schedule.',
  };
}


function getNextFallbackEventFromNow(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const schedules = [makeFallbackSchedule(now), makeFallbackSchedule(tomorrow)];
  const all = schedules.flatMap((schedule) => [schedule.active_event].concat(schedule.upcoming_events || [])).filter(Boolean);
  const nowMs = now.getTime();
  return all.find((event) => Date.parse(event.end_at || event.start_at || '') > nowMs && event.utc_day >= today) || null;
}

async function fetchTodayEvents() {
  const base = getApiBase();
  if (!base) return { ok: false, error: 'api_base_missing' };
  const auth = getSignedAuth();
  const req = auth
    ? fetch(`${base}/wtf/events/today`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: auth }),
    })
    : fetch(`${base}/wtf/events/today`);
  const res = await req.catch(() => null);
  if (!res) return { ok: false, error: 'network_error' };
  if (!res.ok) return { ok: false, error: 'http_' + res.status };
  return res.json().catch(() => ({ ok: false, error: 'invalid_json' }));
}

function dispatch(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
}

function normalizeEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const id = event.event_id || event.id || event.key || '';
  return {
    ...event,
    id,
    event_id: id,
    title: event.title || event.name || id || 'Daily WTF Signal',
    description: event.description || event.objective || event.requirement || '',
    objective: event.objective || event.description || event.requirement || '',
    requirement: event.requirement || event.objective || event.description || event.required_action || '',
    start_at: event.start_at || event.starts_at || event.start_time || event.startsAt || null,
    end_at: event.end_at || event.ends_at || event.end_time || event.endsAt || null,
    status: event.status || 'upcoming',
  };
}

function secondsUntil(value, nowMs) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? Math.max(0, Math.floor((ms - nowMs) / 1000)) : 0;
}

function updateGlobal(payload, extra) {
  const safe = payload && typeof payload === 'object' ? payload : {};
  const active = normalizeEvent(safe.active_event);
  const upcoming = Array.isArray(safe.upcoming_events) ? safe.upcoming_events.map(normalizeEvent).filter(Boolean) : [];
  let next = normalizeEvent(safe.next_event) || upcoming[0] || null;
  const completedEvents = Array.isArray(safe.completed_events) ? safe.completed_events.map(normalizeEvent).filter(Boolean) : [];
  const expiredEvents = Array.isArray(safe.expired_events) ? safe.expired_events.map(normalizeEvent).filter(Boolean) : [];
  if (!active && !next && safe.ok) {
    next = normalizeEvent(getNextFallbackEventFromNow());
    if (next) upcoming.push(next);
  }
  const nowMs = Date.now();
  const computedCountdown = active ? secondsUntil(active.end_at, nowMs) : next ? secondsUntil(next.start_at, nowMs) : 0;
  const count = Number(safe.countdown_seconds);
  const hasServerCountdown = Number.isFinite(count) && count > 0;
  const noEvents = !active && !next && upcoming.length === 0 && !completedEvents.length && !expiredEvents.length;
  window.MOONBOYS_WTF_EVENTS = {
    ok: !!safe.ok,
    source: safe.source || safe.auth_mode || 'wtf_events_today',
    status: extra && extra.status ? extra.status : safe.ok === false ? 'error' : noEvents ? 'empty' : active ? 'active' : next ? 'upcoming' : safe.missed_today ? 'missed' : 'ready',
    error: safe.error || null,
    diagnostic: safe.diagnostic || '',
    utc_day: safe.utc_day || null,
    active_event: active,
    upcoming_events: upcoming,
    next_event: next,
    completed_events: completedEvents,
    expired_events: expiredEvents,
    countdown_seconds: hasServerCountdown ? count : computedCountdown,
    checked_in: !!safe.checked_in || !!(active && active.player_status === 'checked_in'),
    current_task: safe.current_task || active || next || null,
    completed_today: Number(safe.completed_today) || completedEvents.length || 0,
    missed_today: Number(safe.missed_today) || expiredEvents.length || 0,
    missed_history_count: Number(safe.missed_history_count) || 0,
    chain_options: Array.isArray(safe.chain_options) ? safe.chain_options : active && Array.isArray(active.chain_options) ? active.chain_options : [],
    next_best_action: safe.next_best_action || (active ? 'Check in while the signal is live.' : next ? 'Get ready for the next WTF signal.' : 'Play Arcade while the next signal is generated.'),
    no_events: noEvents,
    fetched_at: new Date().toISOString(),
  };
}

function setTransientState(status, message) {
  updateGlobal({ ok: status !== 'error', error: status === 'error' ? message : null, diagnostic: message || '' }, { status });
  dispatch('moonboys:wtf-events-ready', window.MOONBOYS_WTF_EVENTS);
}

async function refresh() {
  setTransientState('loading', 'Loading Daily WTF signal…');
  const payload = await fetchTodayEvents();
  if (!payload || !payload.ok) {
    const fallback = makeFallbackSchedule();
    fallback.error = payload && payload.error ? payload.error : 'fetch_failed';
    fallback.diagnostic = 'Signal feed unavailable; deterministic local schedule rendered so the panel remains actionable.';
    updateGlobal(fallback);
    try { console.warn('[daily-wtf-event-system] /wtf/events/today unavailable; using fallback schedule.', fallback.error); } catch (_) {}
    dispatch('moonboys:wtf-events-ready', window.MOONBOYS_WTF_EVENTS);
    return;
  }
  updateGlobal(payload);
  if (window.MOONBOYS_WTF_EVENTS.no_events) {
    try { console.warn('[daily-wtf-event-system] /wtf/events/today returned no active or upcoming events.', payload); } catch (_) {}
  }
  dispatch('moonboys:wtf-events-ready', window.MOONBOYS_WTF_EVENTS);
}

function startCountdownTicker() {
  if (lastCountdownTick) return;
  lastCountdownTick = setInterval(() => {
    const state = window.MOONBOYS_WTF_EVENTS;
    if (!state || !state.countdown_seconds) return;
    state.countdown_seconds = Math.max(0, Number(state.countdown_seconds) - 1);
    dispatch('moonboys:wtf-countdown-tick', state);
  }, 1000);
}

export function emitWtfXpBurst(payload) {
  dispatch('moonboys:xp-burst', payload || {});
}

export async function checkInWtfEvent(eventId) {
  const base = getApiBase();
  const auth = getSignedAuth();
  if (!base || !auth) return { ok: false, error: 'auth_required' };
  const res = await fetch(`${base}/wtf/events/check-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_auth: auth, event_id: eventId }),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : { ok: false };
  if (data.ok) dispatch('moonboys:wtf-event-checkin', data);
  await refresh();
  return data;
}

export async function completeWtfEvent(eventId, completionSource, sourceId) {
  const base = getApiBase();
  const auth = getSignedAuth();
  if (!base || !auth) return { ok: false, error: 'auth_required' };
  const res = await fetch(`${base}/wtf/events/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      telegram_auth: auth,
      event_id: eventId,
      completion_source: completionSource,
      source_id: sourceId || '',
    }),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : { ok: false };
  if (data.ok) {
    dispatch('moonboys:wtf-event-complete', data);
    if (data.xp_burst) emitWtfXpBurst(data.xp_burst);
    if (Array.isArray(data.chain_options) && data.chain_options.length) {
      dispatch('moonboys:roguelite-options-unlocked', { event_id: eventId, options: data.chain_options });
    }
  }
  await refresh();
  return data;
}

export async function chooseWtfOption(eventId, optionId) {
  const base = getApiBase();
  const auth = getSignedAuth();
  if (!base || !auth) return { ok: false, error: 'auth_required' };
  const res = await fetch(`${base}/wtf/events/choose-option`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_auth: auth, event_id: eventId, option_id: optionId }),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : { ok: false };
  await refresh();
  return data;
}

export function initDailyWtfEventSystem() {
  refresh();
  startCountdownTicker();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refresh, POLL_MS);
}

if (typeof window !== 'undefined') {
  window.MOONBOYS_DAILY_WTF = {
    init: initDailyWtfEventSystem,
    refresh,
    checkInWtfEvent,
    completeWtfEvent,
    chooseWtfOption,
    emitWtfXpBurst,
  };
  initDailyWtfEventSystem();
}
