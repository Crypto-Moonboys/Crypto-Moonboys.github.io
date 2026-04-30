/**
 * faction-missions.js — Faction mission system.
 *
 * Provides 3 daily missions per faction, seasonal missions, and rotating
 * objectives.  Progress is tracked in localStorage and resets daily.
 *
 * For Telegram-linked users, mission progress is also written to the server.
 * localStorage caches the last successful server response.
 *
 * Storage key: fw_missions_v1
 *
 * Public API:
 *   getDailyMissions(factionId)               — array of today's 3 mission objects
 *   getSeasonalMissions(factionId)            — array of seasonal missions
 *   recordMissionProgress(factionId, event, value) — advance relevant missions
 *   getMissionProgress(factionId, missionId)  — { progress, target, complete }
 *   getCompletedMissions(factionId)           — array of completed mission ids
 *   resetDailyMissions()                      — called automatically on new day
 *   hydrateMissionsFromServer()               — async: loads server state for linked users
 */

import { getRotationSeed } from '/js/arcade/systems/global-rotation-system.js';

var MISSIONS_STORAGE_KEY = 'fw_missions_v1';

// ── Mission definitions ──────────────────────────────────────────────────────

/**
 * Daily mission pool per faction.
 * Each entry: { id, label, description, type, target, reward }
 *
 * type values games may emit (all others are silently ignored):
 *   'score'       — accumulated score value
 *   'survive'     — seconds alive
 *   'no_shield'   — run completed without using shield (0 or 1)
 *   'bank_score'  — score banked after surviving > 45 s
 *   'shield_time' — seconds shield was held intact
 *   'runs'        — number of completed runs
 *   'war_contrib' — war contribution amount
 *   'chaos'       — chaos events triggered
 *   'combo'       — combo multiplier reached
 *   'high_risk'   — score earned during high-risk rotation window
 */
var DAILY_MISSION_POOL = Object.freeze({

  'diamond-hands': Object.freeze([
    Object.freeze({ id: 'dh_survive_60',   label: 'Endure the Dip',    description: 'Survive for 60 seconds in any run.',            type: 'survive',    target: 60,   reward: { warContrib: 50 } }),
    Object.freeze({ id: 'dh_no_shield',    label: 'Bare Hands',        description: 'Complete a run without using your shield.',      type: 'no_shield',  target: 1,    reward: { warContrib: 80 } }),
    Object.freeze({ id: 'dh_bank_score',   label: 'Long Game',         description: 'Bank a score after surviving more than 45 s.',   type: 'bank_score', target: 1,    reward: { warContrib: 65 } }),
  ]),

  'hodl-warriors': Object.freeze([
    Object.freeze({ id: 'hw_shield_hold',  label: 'Shield Protocol',   description: 'Protect your shield for 30 seconds in a run.',   type: 'shield_time', target: 30,  reward: { warContrib: 55 } }),
    Object.freeze({ id: 'hw_runs_3',       label: 'Commitment',        description: 'Complete 3 runs in any arcade game.',            type: 'runs',        target: 3,   reward: { warContrib: 40 } }),
    Object.freeze({ id: 'hw_war_contrib',  label: 'For the Faction',   description: 'Contribute 200 points to the faction war.',      type: 'war_contrib', target: 200, reward: { warContrib: 60 } }),
  ]),

  graffpunks: Object.freeze([
    Object.freeze({ id: 'gp_chaos_3',      label: 'Chaos Agent',       description: 'Trigger 3 chaos events across any runs.',        type: 'chaos',      target: 3,   reward: { warContrib: 70 } }),
    Object.freeze({ id: 'gp_combo_x3',     label: 'Combo Graffiti',    description: 'Reach a ×3 combo multiplier in any run.',        type: 'combo',      target: 3,   reward: { warContrib: 60 } }),
    Object.freeze({ id: 'gp_high_risk',    label: 'Risk Canvas',       description: 'Score 500+ points during a high-risk window.',   type: 'high_risk',  target: 500, reward: { warContrib: 90 } }),
  ]),

});

/**
 * Seasonal missions — longer-term objectives, one per faction.
 * These do not reset daily; they track cumulative progress.
 */
var SEASONAL_MISSIONS = Object.freeze({

  'diamond-hands': Object.freeze([
    Object.freeze({ id: 'dh_season_endure', label: 'Diamond Patience', description: 'Accumulate 1 800 total seconds alive across all runs.',  type: 'survive',    target: 1800, reward: { warContrib: 500, rankBonus: 1 } }),
  ]),

  'hodl-warriors': Object.freeze([
    Object.freeze({ id: 'hw_season_runs',   label: 'HODL Veteran',     description: 'Complete 30 total runs across all arcade games.',         type: 'runs',       target: 30,   reward: { warContrib: 450, rankBonus: 1 } }),
  ]),

  graffpunks: Object.freeze([
    Object.freeze({ id: 'gp_season_chaos',  label: 'Maximum Chaos',    description: 'Trigger 50 chaos events across all time.',                type: 'chaos',      target: 50,   reward: { warContrib: 480, rankBonus: 1 } }),
  ]),

});

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

// ── State management ─────────────────────────────────────────────────────────

function _loadState() {
  var raw = _safeGet(MISSIONS_STORAGE_KEY);
  var s   = _safeParse(raw, null);
  if (!s || typeof s !== 'object') s = {};
  if (!s.daily)    s.daily    = {};   // { [dateKey]: { [missionId]: progress } }
  if (!s.seasonal) s.seasonal = {};   // { [missionId]: progress }
  if (!s.completed) s.completed = {}; // { daily: { [dateKey]: [missionId] }, seasonal: [missionId] }
  if (!s.completed.daily)    s.completed.daily    = {};
  if (!s.completed.seasonal) s.completed.seasonal = [];
  return s;
}

function _saveState(s) {
  _safeSet(MISSIONS_STORAGE_KEY, JSON.stringify(s));
}

// ── Daily mission selection (deterministic by seed) ──────────────────────────

/**
 * Return today's 3 missions for the given faction.
 * The selection is deterministic by the daily rotation seed so all players
 * see the same missions on the same day.
 *
 * @param {string} factionId
 * @returns {Array<object>}  array of mission objects (with progress injected)
 */
export function getDailyMissions(factionId) {
  var fk   = _normaliseFaction(factionId);
  var pool = DAILY_MISSION_POOL[fk];
  if (!pool) return [];

  var seed = getRotationSeed ? getRotationSeed() : _todaySeedFallback();
  var selected = _pickMissions(pool, 3, seed);

  var today = _todayKey();
  var s = _loadState();
  var dailyProg = (s.daily[today] = s.daily[today] || {});
  var completedToday = s.completed.daily[today] || [];

  return selected.map(function (m) {
    var prog = dailyProg[m.id] || 0;
    var complete = completedToday.indexOf(m.id) !== -1;
    return Object.assign({}, m, { progress: prog, complete: complete });
  });
}

/**
 * Return seasonal missions for the given faction, with progress injected.
 * @param {string} factionId
 * @returns {Array<object>}
 */
export function getSeasonalMissions(factionId) {
  var fk   = _normaliseFaction(factionId);
  var pool = SEASONAL_MISSIONS[fk];
  if (!pool) return [];
  var s = _loadState();
  return pool.map(function (m) {
    var prog = s.seasonal[m.id] || 0;
    var complete = s.completed.seasonal.indexOf(m.id) !== -1;
    return Object.assign({}, m, { progress: prog, complete: complete });
  });
}

/**
 * Record mission progress for a faction, by event type and value.
 * Only missions whose `type` matches the emitted event are updated.
 * Silently no-ops for unrecognised events.
 *
 * @param {string} factionId
 * @param {string} eventType  — one of the type values defined in the pool
 * @param {number} value      — amount to add (or 1 for boolean events)
 */
export function recordMissionProgress(factionId, eventType, value) {
  try {
    var fk = _normaliseFaction(factionId);
    if (!fk || !eventType) return;
    var today = _todayKey();
    var seed  = getRotationSeed ? getRotationSeed() : _todaySeedFallback();
    var pool  = DAILY_MISSION_POOL[fk] || [];
    var selected = _pickMissions(pool, 3, seed);

    var s = _loadState();
    var dailyProg      = (s.daily[today]                 = s.daily[today] || {});
    var completedToday = (s.completed.daily[today]       = s.completed.daily[today] || []);

    var changed = false;

    // Daily missions
    selected.forEach(function (m) {
      if (m.type !== eventType) return;
      if (completedToday.indexOf(m.id) !== -1) return;
      var delta = Math.max(0, Math.floor(Number(value) || 0));
      if (delta <= 0) return;  // no-op — skip update and server sync
      dailyProg[m.id] = (dailyProg[m.id] || 0) + delta;
      if (dailyProg[m.id] >= m.target) {
        completedToday.push(m.id);
        changed = true;
        _emitMissionComplete(fk, m, 'daily');
      }
      // Sync incremental progress to server for linked users
      _syncMissionProgressToServer(m.id, delta, m.target);
    });

    // Seasonal missions
    var seasonPool = SEASONAL_MISSIONS[fk] || [];
    seasonPool.forEach(function (m) {
      if (m.type !== eventType) return;
      if (s.completed.seasonal.indexOf(m.id) !== -1) return;
      s.seasonal[m.id] = (s.seasonal[m.id] || 0) + Math.max(0, Number(value) || 0);
      if (s.seasonal[m.id] >= m.target) {
        s.completed.seasonal.push(m.id);
        changed = true;
        _emitMissionComplete(fk, m, 'seasonal');
      }
    });

    _saveState(s);  // always persist incremental progress
  } catch (e) {
    try { console.warn('[faction-missions] recordMissionProgress error:', e); } catch (_) {}
  }
}

/**
 * Get progress for a single mission.
 * @param {string} factionId
 * @param {string} missionId
 * @returns {{ progress: number, target: number, complete: boolean }}
 */
export function getMissionProgress(factionId, missionId) {
  var fk = _normaliseFaction(factionId);
  var today = _todayKey();
  var s = _loadState();
  var pool = DAILY_MISSION_POOL[fk] || [];
  var seasonPool = SEASONAL_MISSIONS[fk] || [];
  var allMissions = pool.concat(Array.prototype.slice.call(seasonPool));
  var mission = null;
  for (var i = 0; i < allMissions.length; i++) {
    if (allMissions[i].id === missionId) { mission = allMissions[i]; break; }
  }
  if (!mission) return { progress: 0, target: 0, complete: false };

  var isDailyPool = pool.some(function (m) { return m.id === missionId; });
  var progress, complete;
  if (isDailyPool) {
    progress = (s.daily[today] && s.daily[today][missionId]) || 0;
    complete = ((s.completed.daily[today] || []).indexOf(missionId) !== -1);
  } else {
    progress = s.seasonal[missionId] || 0;
    complete = s.completed.seasonal.indexOf(missionId) !== -1;
  }
  return { progress: progress, target: mission.target, complete: complete };
}

/**
 * Return an array of completed mission ids for today.
 * @param {string} factionId
 * @returns {string[]}
 */
export function getCompletedMissions(factionId) {
  var today = _todayKey();
  var s = _loadState();
  return (s.completed.daily[today] || []).slice();
}

/**
 * Clear today's daily mission progress (called on new day).
 * Seasonal progress is preserved.
 */
export function resetDailyMissions() {
  var s = _loadState();
  // Trim daily progress to last 7 days
  var keys = Object.keys(s.daily).sort();
  while (keys.length > 7) {
    var old = keys.shift();
    delete s.daily[old];
    delete s.completed.daily[old];
  }
  _saveState(s);
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _normaliseFaction(id) {
  var v = String(id || 'unaligned').toLowerCase().trim();
  if (v === 'diamond_hands' || v === 'diamondhands') v = 'diamond-hands';
  if (v === 'hodl_warriors' || v === 'hodlwarriors') v = 'hodl-warriors';
  if (v === 'graff-punks' || v === 'graff_punks') v = 'graffpunks';
  return DAILY_MISSION_POOL[v] ? v : null;
}

function _todaySeedFallback() {
  var d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

function _pickMissions(pool, count, seed) {
  // Deterministic Fisher-Yates shuffle seeded by seed
  var arr = pool.slice();
  var s = Math.abs(Math.floor(seed)) || 1;
  function rng() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  }
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr.slice(0, count);
}

function _emitMissionComplete(factionId, mission, tier) {
  try {
    var bus = (typeof window !== 'undefined') && window.MOONBOYS_EVENT_BUS;
    if (bus && typeof bus.emit === 'function') {
      bus.emit('faction:mission:complete', {
        faction: factionId,
        missionId: mission.id,
        label: mission.label,
        tier: tier,
        reward: mission.reward,
        ts: Date.now(),
      });
    }
  } catch (_) {}
}

// ── Server sync helpers ───────────────────────────────────────────────────────

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
 * Sync mission progress to the server for Telegram-linked users.
 * Fires-and-forgets; never throws.
 * @param {string} missionId
 * @param {number} amount
 * @param {number} target
 */
function _syncMissionProgressToServer(missionId, amount, target) {
  if (!_isLinked()) return;
  var auth = _getSignedAuth();
  var apiBase = _getApiBase();
  if (!auth || !apiBase) return;
  try {
    fetch(apiBase + '/player/daily-missions/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_auth: auth,
        mission_id: missionId,
        amount: amount,
        target: target,
      }),
    }).catch(function () {});
  } catch (_) {}
}

/**
 * Hydrate daily mission progress from server for Telegram-linked users.
 * Merges server values into the local state cache.
 * @returns {Promise<void>}
 */
export async function hydrateMissionsFromServer() {
  if (!_isLinked()) return;
  var auth = _getSignedAuth();
  var apiBase = _getApiBase();
  if (!auth || !apiBase) return;
  try {
    var res = await fetch(apiBase + '/player/daily-missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: auth }),
    });
    var data = res.ok ? await res.json().catch(function () { return {}; }) : {};
    if (data && data.ok && data.progress && data.date) {
      var today = _todayKey();
      if (data.date !== today) return;
      var s = _loadState();
      s.daily[today] = s.daily[today] || {};
      s.completed.daily[today] = s.completed.daily[today] || [];
      var serverProgress = data.progress;
      Object.keys(serverProgress).forEach(function (mId) {
        var mData = serverProgress[mId];
        if (typeof mData.progress === 'number') {
          s.daily[today][mId] = Math.max(s.daily[today][mId] || 0, mData.progress);
        }
        if (mData.completed && s.completed.daily[today].indexOf(mId) === -1) {
          s.completed.daily[today].push(mId);
        }
      });
      _saveState(s);
    }
  } catch (_) {}
}
