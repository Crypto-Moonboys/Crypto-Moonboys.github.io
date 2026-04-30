/**
 * faction-streaks.js — Login, mission, and contribution streak tracking.
 *
 * Tracks:
 *   • login streak         — consecutive days the player has been active
 *   • mission streak       — consecutive days with at least one completed mission
 *   • contribution streak  — consecutive days with a faction war contribution
 *
 * For Telegram-linked users, mission and contribution streaks are updated
 * server-side when the corresponding mission/contribution events succeed.
 * localStorage caches the display state; the server is authoritative.
 *
 * Streaks feed the faction war contribution system (via bonus metadata) but
 * do NOT alter XP base math.
 *
 * Storage key: fw_streaks_v1
 *
 * Public API:
 *   recordLogin()              — call on page load / game start
 *   recordMissionComplete()    — call when any mission completes
 *   recordWarContribution()    — call when war contribution is recorded
 *   getStreakState()           — { login, mission, contribution } streak objects
 *   getStreakBonusMeta()       — { multiplier, label } for display / war feed
 *   hydrateStreaksFromServer()  — async: loads server state for linked users
 */

var STREAKS_STORAGE_KEY = 'fw_streaks_v1';

// ── Storage helpers ──────────────────────────────────────────────────────────

function _safeGet(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

function _safeSet(key, val) {
  try { localStorage.setItem(key, val); } catch (_) {}
}

function _safeParse(raw, fallback) {
  try { return (raw !== null && raw !== undefined) ? JSON.parse(raw) : fallback; }
  catch (_) { return fallback; }
}

function _dateKey(d) {
  return d.getUTCFullYear()
    + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')
    + '-' + String(d.getUTCDate()).padStart(2, '0');
}

function _todayKey() {
  return _dateKey(new Date());
}

function _yesterdayKey() {
  var d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return _dateKey(d);
}

// ── Default state ────────────────────────────────────────────────────────────

function _defaultStreak() {
  return { count: 0, lastDate: null, best: 0 };
}

function _loadState() {
  var raw = _safeGet(STREAKS_STORAGE_KEY);
  var s   = _safeParse(raw, null);
  if (!s || typeof s !== 'object') s = {};
  if (!s.login)        s.login        = _defaultStreak();
  if (!s.mission)      s.mission      = _defaultStreak();
  if (!s.contribution) s.contribution = _defaultStreak();
  return s;
}

function _saveState(s) {
  _safeSet(STREAKS_STORAGE_KEY, JSON.stringify(s));
}

// ── Core streak update ───────────────────────────────────────────────────────

/**
 * Advance a streak entry by one day if today is the next consecutive day.
 * Returns { streak, extended } where extended = true if count increased.
 */
function _advanceStreak(entry) {
  var today     = _todayKey();
  var yesterday = _yesterdayKey();

  if (entry.lastDate === today) {
    return { streak: entry, extended: false };  // already recorded today
  }

  var extended = false;
  if (entry.lastDate === yesterday) {
    entry.count++;
    extended = true;
  } else if (!entry.lastDate) {
    entry.count = 1;
    extended = true;
  } else {
    // streak broken
    entry.count = 1;
  }

  entry.lastDate = today;
  entry.best     = Math.max(entry.best || 0, entry.count);
  return { streak: entry, extended: extended };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a login event for the current day.
 * Advances the login streak if it hasn't been recorded today.
 */
export function recordLogin() {
  try {
    var s = _loadState();
    var result = _advanceStreak(s.login);
    _saveState(s);
    if (result.extended) {
      _emitStreakEvent('login', s.login.count);
    }
  } catch (e) {
    try { console.warn('[faction-streaks] recordLogin error:', e); } catch (_) {}
  }
}

/**
 * Record a mission completion event for the current day.
 * Advances the mission streak.
 */
export function recordMissionComplete() {
  try {
    var s = _loadState();
    var result = _advanceStreak(s.mission);
    _saveState(s);
    if (result.extended) {
      _emitStreakEvent('mission', s.mission.count);
    }
  } catch (e) {
    try { console.warn('[faction-streaks] recordMissionComplete error:', e); } catch (_) {}
  }
}

/**
 * Record a faction war contribution event for the current day.
 * Advances the contribution streak.
 */
export function recordWarContribution() {
  try {
    var s = _loadState();
    var result = _advanceStreak(s.contribution);
    _saveState(s);
    if (result.extended) {
      _emitStreakEvent('contribution', s.contribution.count);
    }
  } catch (e) {
    try { console.warn('[faction-streaks] recordWarContribution error:', e); } catch (_) {}
  }
}

/**
 * Return the current streak state for all three streak types.
 * @returns {{ login: object, mission: object, contribution: object }}
 */
export function getStreakState() {
  var s = _loadState();
  return {
    login:        Object.assign({}, s.login),
    mission:      Object.assign({}, s.mission),
    contribution: Object.assign({}, s.contribution),
  };
}

/**
 * Return bonus metadata based on combined streak performance.
 * This is metadata only — it must not be applied to XP base math.
 * The multiplier may be passed into the war contribution system as a bonus
 * factor but never into score or XP calculation.
 *
 * @returns {{ multiplier: number, label: string }}
 */
export function getStreakBonusMeta() {
  var s       = _loadState();
  var highest = Math.max(
    s.login.count || 0,
    s.mission.count || 0,
    s.contribution.count || 0
  );
  var mult, label;
  if (highest >= 7) {
    mult  = 1.5;
    label = '🔥 Max streak bonus';
  } else if (highest >= 4) {
    mult  = 1.25;
    label = '⚡ Strong streak';
  } else if (highest >= 2) {
    mult  = 1.10;
    label = '✨ Active streak';
  } else {
    mult  = 1.0;
    label = '';
  }
  return { multiplier: mult, label: label };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _emitStreakEvent(type, count) {
  try {
    var bus = (typeof window !== 'undefined') && window.MOONBOYS_EVENT_BUS;
    if (bus && typeof bus.emit === 'function') {
      bus.emit('faction:streak:update', { type: type, count: count, ts: Date.now() });
    }
  } catch (_) {}
}

// ── Server hydration ─────────────────────────────────────────────────────────

function _isLinked() {
  try {
    var identity = (typeof window !== 'undefined') && window.MOONBOYS_IDENTITY;
    return !!(identity && typeof identity.isTelegramLinked === 'function' && identity.isTelegramLinked());
  } catch (_) { return false; }
}

function _getSignedAuth() {
  try {
    var identity = (typeof window !== 'undefined') && window.MOONBOYS_IDENTITY;
    if (!identity || typeof identity.getSignedTelegramAuth !== 'function') return null;
    return identity.getSignedTelegramAuth();
  } catch (_) { return null; }
}

function _getApiBase() {
  try {
    var cfg = (typeof window !== 'undefined') && window.MOONBOYS_API;
    return cfg && cfg.BASE_URL ? String(cfg.BASE_URL).replace(/\/$/, '') : '';
  } catch (_) { return ''; }
}

/**
 * Hydrate streak state from server for Telegram-linked users.
 * Uses /player/state which includes both mission_streak and contribution_streak.
 * Server values overwrite local cache directly (no Math.max).
 * @returns {Promise<void>}
 */
export async function hydrateStreaksFromServer() {
  if (!_isLinked()) return;
  var auth = _getSignedAuth();
  var apiBase = _getApiBase();
  if (!auth || !apiBase) return;
  try {
    var res = await fetch(apiBase + '/player/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: auth }),
    });
    var data = res.ok ? await res.json().catch(function () { return {}; }) : {};
    if (data && data.ok && data.linked && data.mission_streaks) {
      var ms = data.mission_streaks;
      var s = _loadState();
      // Server is authoritative for count and lastDate — assign directly without Math.max.
      // The 'best' field tracks the all-time local high-water mark and uses Math.max
      // to preserve a local best that may exceed the server's current streak value.
      if (typeof ms.mission_streak === 'number') {
        s.mission.count = ms.mission_streak;
        s.mission.best = Math.max(s.mission.best || 0, ms.mission_streak);
        if (ms.last_mission_date) s.mission.lastDate = ms.last_mission_date;
      }
      if (typeof ms.contribution_streak === 'number') {
        s.contribution.count = ms.contribution_streak;
        s.contribution.best = Math.max(s.contribution.best || 0, ms.contribution_streak);
        if (ms.last_contribution_date) s.contribution.lastDate = ms.last_contribution_date;
      }
      _saveState(s);
    }
  } catch (_) {}
}
