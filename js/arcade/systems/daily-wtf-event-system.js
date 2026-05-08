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

async function fetchTodayEvents() {
  const base = getApiBase();
  if (!base) return null;
  const auth = getSignedAuth();
  const req = auth
    ? fetch(`${base}/wtf/events/today`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: auth }),
    })
    : fetch(`${base}/wtf/events/today`);
  const res = await req.catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

function dispatch(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
}

function updateGlobal(payload) {
  const safe = payload && typeof payload === 'object' ? payload : {};
  window.MOONBOYS_WTF_EVENTS = {
    utc_day: safe.utc_day || null,
    active_event: safe.active_event || null,
    upcoming_events: Array.isArray(safe.upcoming_events) ? safe.upcoming_events : [],
    next_event: safe.next_event || null,
    countdown_seconds: Number(safe.countdown_seconds) || 0,
    checked_in: !!safe.checked_in,
    current_task: safe.current_task || null,
    completed_today: Number(safe.completed_today) || 0,
    missed_today: Number(safe.missed_today) || 0,
    missed_history_count: Number(safe.missed_history_count) || 0,
    chain_options: Array.isArray(safe.chain_options) ? safe.chain_options : [],
    next_best_action: safe.next_best_action || 'Get ready for the next WTF signal.',
  };
}

async function refresh() {
  const payload = await fetchTodayEvents();
  if (!payload || !payload.ok) return;
  updateGlobal(payload);
  dispatch('moonboys:wtf-events-ready', window.MOONBOYS_WTF_EVENTS);
}

function startCountdownTicker() {
  if (lastCountdownTick) return;
  lastCountdownTick = setInterval(() => {
    const state = window.MOONBOYS_WTF_EVENTS;
    if (!state || !state.countdown_seconds) return;
    state.countdown_seconds = Math.max(0, Number(state.countdown_seconds) - 1);
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
