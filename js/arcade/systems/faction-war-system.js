/**
 * faction-war-system.js — Faction war contribution tracking.
 *
 * Tracks faction power, daily and weekly contributions, momentum, and
 * contribution sources without altering submitScore or XP base math.
 *
 * All state is persisted to localStorage.  No backend API is assumed.
 * The system is purely additive around existing arcade systems.
 *
 * Storage keys:
 *   fw_war_state_v1  — { factions: { [key]: WarFaction }, season: number, updatedAt: number }
 *
 * Public API:
 *   getWarState()                              — current war snapshot
 *   recordContribution(factionId, source, amt) — add contribution points
 *   getFactionPower(factionId)                 — total power for a faction
 *   getDailyContribution(factionId)            — today's contribution total
 *   getWeeklyContribution(factionId)           — this week's contribution total
 *   getMomentum(factionId)                     — momentum tier (0–3)
 *   getDominantFaction()                       — key of currently leading faction
 *   resetDailyCycle()                          — called automatically on new day
 */

var WAR_STORAGE_KEY = 'fw_war_state_v1';

var CONTRIBUTION_SOURCES = Object.freeze([
  'score_submission',
  'mission_complete',
  'streak_bonus',
  'global_event',
]);

var FACTION_KEYS = Object.freeze(['diamond-hands', 'hodl-warriors', 'graffpunks']);

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

// ── Date helpers ─────────────────────────────────────────────────────────────

function _todayKey() {
  var d = new Date();
  return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
}

function _thisWeekKey() {
  var d = new Date();
  var dayOfWeek = d.getUTCDay();                 // 0 = Sunday
  var monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7));
  return monday.getUTCFullYear() + '-W' + monday.getUTCDate();
}

// ── Internal state ───────────────────────────────────────────────────────────

function _makeFactionEntry() {
  return {
    power:        0,
    daily:        {},   // { [dateKey]: number }
    weekly:       {},   // { [weekKey]: number }
    momentum:     0,    // 0–3 based on recent streaks
    contributions: {},  // { [source]: number }
  };
}

function _loadState() {
  var raw = _safeGet(WAR_STORAGE_KEY);
  var saved = _safeParse(raw, null);
  if (!saved || typeof saved !== 'object' || !saved.factions) {
    return _buildDefaultState();
  }
  // Ensure all faction keys are present
  for (var i = 0; i < FACTION_KEYS.length; i++) {
    var k = FACTION_KEYS[i];
    if (!saved.factions[k]) saved.factions[k] = _makeFactionEntry();
  }
  saved.updatedAt = saved.updatedAt || 0;
  saved.season    = saved.season    || 1;
  return saved;
}

function _buildDefaultState() {
  var factions = {};
  for (var i = 0; i < FACTION_KEYS.length; i++) {
    factions[FACTION_KEYS[i]] = _makeFactionEntry();
  }
  return { factions: factions, season: 1, updatedAt: Date.now() };
}

function _saveState(state) {
  _safeSet(WAR_STORAGE_KEY, JSON.stringify(state));
}

function _getOrCreateFaction(state, key) {
  if (!state.factions[key]) state.factions[key] = _makeFactionEntry();
  return state.factions[key];
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Return a deep copy of the current war state.
 * @returns {object}
 */
export function getWarState() {
  return _safeParse(JSON.stringify(_loadState()), _buildDefaultState());
}

/**
 * Record a contribution for a faction from a named source.
 * Source must be one of CONTRIBUTION_SOURCES (unknown sources are still
 * accepted but logged under 'other').
 *
 * @param {string} factionId   — faction key (e.g. 'graffpunks')
 * @param {string} source      — contribution source key
 * @param {number} amount      — positive contribution amount
 */
export function recordContribution(factionId, source, amount) {
  try {
    var amt = Math.max(0, Math.floor(Number(amount) || 0));
    if (!amt) return;
    var safeSource = CONTRIBUTION_SOURCES.indexOf(source) !== -1 ? source : 'other';
    var state  = _loadState();
    var fk     = _normaliseFactionKey(factionId);
    if (!fk) return;
    var entry  = _getOrCreateFaction(state, fk);
    var today  = _todayKey();
    var week   = _thisWeekKey();

    entry.power                        = (entry.power || 0) + amt;
    entry.daily[today]                 = (entry.daily[today] || 0) + amt;
    entry.weekly[week]                 = (entry.weekly[week] || 0) + amt;
    entry.contributions[safeSource]    = (entry.contributions[safeSource] || 0) + amt;

    // Trim old daily/weekly keys to keep storage lean (keep last 14 days / 8 weeks)
    _trimKeys(entry.daily,  14);
    _trimKeys(entry.weekly, 8);

    // Recalculate momentum (how many consecutive days had contributions)
    entry.momentum = _calcMomentum(entry.daily);

    state.updatedAt = Date.now();
    _saveState(state);

    // Emit lightweight bus event
    _emitWarEvent('faction:war:contribution', {
      faction: fk,
      source: safeSource,
      amount: amt,
      power: entry.power,
      momentum: entry.momentum,
    });
  } catch (e) {
    try { console.warn('[faction-war] recordContribution error:', e); } catch (_) {}
  }
}

/**
 * Get the total accumulated power for a faction.
 * @param {string} factionId
 * @returns {number}
 */
export function getFactionPower(factionId) {
  var fk = _normaliseFactionKey(factionId);
  if (!fk) return 0;
  var state = _loadState();
  return (state.factions[fk] && state.factions[fk].power) || 0;
}

/**
 * Get today's total contribution for a faction.
 * @param {string} factionId
 * @returns {number}
 */
export function getDailyContribution(factionId) {
  var fk = _normaliseFactionKey(factionId);
  if (!fk) return 0;
  var state = _loadState();
  var entry = state.factions[fk];
  if (!entry) return 0;
  return entry.daily[_todayKey()] || 0;
}

/**
 * Get this week's total contribution for a faction.
 * @param {string} factionId
 * @returns {number}
 */
export function getWeeklyContribution(factionId) {
  var fk = _normaliseFactionKey(factionId);
  if (!fk) return 0;
  var state = _loadState();
  var entry = state.factions[fk];
  if (!entry) return 0;
  return entry.weekly[_thisWeekKey()] || 0;
}

/**
 * Get the momentum tier (0–3) for a faction.
 * Tier is based on consecutive days with at least one contribution.
 * @param {string} factionId
 * @returns {number} 0–3
 */
export function getMomentum(factionId) {
  var fk = _normaliseFactionKey(factionId);
  if (!fk) return 0;
  var state = _loadState();
  var entry = state.factions[fk];
  return entry ? Math.min(3, entry.momentum || 0) : 0;
}

/**
 * Return the key of the faction with the highest total power.
 * Returns 'diamond-hands' as the default if all are equal (or no data).
 * @returns {string}
 */
export function getDominantFaction() {
  var state = _loadState();
  var best  = null;
  var bestPower = -1;
  for (var i = 0; i < FACTION_KEYS.length; i++) {
    var k   = FACTION_KEYS[i];
    var pow = (state.factions[k] && state.factions[k].power) || 0;
    if (pow > bestPower) { bestPower = pow; best = k; }
  }
  return best || 'diamond-hands';
}

/**
 * Return a summary array of all factions sorted by power descending.
 * Each entry: { faction, power, daily, weekly, momentum }
 * @returns {Array<object>}
 */
export function getFactionStandings() {
  var state = _loadState();
  return FACTION_KEYS.map(function (k) {
    var entry = state.factions[k] || _makeFactionEntry();
    return {
      faction:  k,
      power:    entry.power || 0,
      daily:    entry.daily[_todayKey()] || 0,
      weekly:   entry.weekly[_thisWeekKey()] || 0,
      momentum: Math.min(3, entry.momentum || 0),
    };
  }).sort(function (a, b) { return b.power - a.power; });
}

/**
 * Reset each faction's daily bucket for a new day.
 * Called automatically when the stored date differs from today.
 */
export function resetDailyCycle() {
  // No-op: daily buckets are keyed by date — trimming handles cleanup.
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _normaliseFactionKey(id) {
  var v = String(id || '').toLowerCase().trim();
  if (v === 'diamond_hands' || v === 'diamondhands') v = 'diamond-hands';
  if (v === 'hodl_warriors' || v === 'hodlwarriors') v = 'hodl-warriors';
  if (v === 'graff-punks' || v === 'graff_punks') v = 'graffpunks';
  return FACTION_KEYS.indexOf(v) !== -1 ? v : null;
}

function _trimKeys(obj, maxKeys) {
  var keys = Object.keys(obj).sort();
  while (keys.length > maxKeys) {
    delete obj[keys.shift()];
  }
}

function _calcMomentum(dailyMap) {
  var today = new Date();
  var consecutive = 0;
  for (var i = 0; i < 7; i++) {
    var d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    var k = d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
    if (dailyMap[k] > 0) { consecutive++; } else { break; }
  }
  if (consecutive >= 7) return 3;
  if (consecutive >= 4) return 2;
  if (consecutive >= 2) return 1;
  return 0;
}

function _emitWarEvent(eventName, payload) {
  try {
    var bus = (typeof window !== 'undefined') && window.MOONBOYS_EVENT_BUS;
    if (bus && typeof bus.emit === 'function') bus.emit(eventName, payload || {});
  } catch (_) {}
}
