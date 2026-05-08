/**
 * faction-war-system.js — Faction war contribution tracking.
 *
 * Tracks faction power, daily and weekly contributions, momentum, and
 * contribution sources without altering submitScore or XP base math.
 *
 * For Telegram-linked users, contributions are also posted to the server
 * via POST /faction/signal/contribute. localStorage is used as a local
 * display cache only.
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

var FACTION_KEYS = Object.freeze([
  'hard-fork-rockers',
  'rugpull-minors',
  'graffpunks',
  'blockchain-furies',
  'crypto-moongirls',
  'blockstars',
  'all-city-bulls',
  'nomad-bears',
  'crypto-stoned-boys',
]);

var BATTLE_CHAMBER_EVENT_CLAMP_MAX = 5000;

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

function _dateKey(d) {
  return d.getUTCFullYear()
    + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')
    + '-' + String(d.getUTCDate()).padStart(2, '0');
}

function _todayKey() {
  return _dateKey(new Date());
}

/**
 * ISO 8601 week key: YYYY-Www (e.g. 2026-W05).
 * The ISO week containing a Thursday determines the year.
 */
function _thisWeekKey() {
  var d = new Date();
  // ISO weekday: 1 = Mon … 7 = Sun
  var dow = d.getUTCDay() || 7;
  // Thursday of the current week (determines the ISO year)
  var thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (4 - dow)));
  var yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  var weekNum = Math.ceil(((thu - yearStart) / 86400000 + 1) / 7);
  return thu.getUTCFullYear() + '-W' + String(weekNum).padStart(2, '0');
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
  if (typeof saved.factions !== 'object' || Array.isArray(saved.factions)) {
    saved.factions = {};
  }
  var didMutate = _migrateLegacyFactionState(saved);
  // Ensure all faction keys are present
  for (var i = 0; i < FACTION_KEYS.length; i++) {
    var k = FACTION_KEYS[i];
    if (!saved.factions[k]) {
      saved.factions[k] = _makeFactionEntry();
      didMutate = true;
    }
  }
  saved.updatedAt = saved.updatedAt || 0;
  saved.season    = saved.season    || 1;
  if (didMutate) _saveState(saved);
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

function _migrateLegacyFactionState(state) {
  var LEGACY_FACTION_ALIASES = {
    'diamond-hands': 'hard-fork-rockers',
    diamond_hands: 'hard-fork-rockers',
    diamondhands: 'hard-fork-rockers',
    'hodl-warriors': 'rugpull-minors',
    hodl_warriors: 'rugpull-minors',
    hodlwarriors: 'rugpull-minors',
  };
  var didMutate = false;
  var factions = state && state.factions;
  if (!factions || typeof factions !== 'object') return false;

  for (var i = 0; i < FACTION_KEYS.length; i++) {
    var canonicalKey = FACTION_KEYS[i];
    var canonicalEntry = factions[canonicalKey];
    if (canonicalEntry) {
      var sanitisedCanonical = _sanitiseFactionEntry(canonicalEntry);
      if (sanitisedCanonical !== canonicalEntry) {
        factions[canonicalKey] = sanitisedCanonical;
        canonicalEntry = sanitisedCanonical;
        didMutate = true;
      }
    }
  }

  var legacyKeys = Object.keys(LEGACY_FACTION_ALIASES);
  for (var j = 0; j < legacyKeys.length; j++) {
    var legacyKey = legacyKeys[j];
    var targetKey = LEGACY_FACTION_ALIASES[legacyKey];
    if (!Object.prototype.hasOwnProperty.call(factions, legacyKey)) continue;
    var legacyEntry = _sanitiseFactionEntry(factions[legacyKey]);
    var targetEntry = _sanitiseFactionEntry(factions[targetKey] || _makeFactionEntry());
    factions[targetKey] = _mergeFactionEntries(targetEntry, legacyEntry);
    delete factions[legacyKey];
    didMutate = true;
  }

  return didMutate;
}

function _sanitiseFactionEntry(entry) {
  var src = (entry && typeof entry === 'object' && !Array.isArray(entry)) ? entry : {};
  return {
    power: _toFiniteNumber(src.power),
    daily: _sanitiseNumberMap(src.daily),
    weekly: _sanitiseNumberMap(src.weekly),
    momentum: Math.max(0, Math.floor(_toFiniteNumber(src.momentum))),
    contributions: _sanitiseNumberMap(src.contributions),
  };
}

function _sanitiseNumberMap(map) {
  var src = (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
  var out = {};
  var keys = Object.keys(src);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var value = _toFiniteNumber(src[key]);
    if (value > 0) out[key] = value;
  }
  return out;
}

function _mergeFactionEntries(target, source) {
  var merged = _sanitiseFactionEntry(target);
  var safeSource = _sanitiseFactionEntry(source);

  merged.power += safeSource.power;
  _mergeNumberMapInto(merged.daily, safeSource.daily);
  _mergeNumberMapInto(merged.weekly, safeSource.weekly);
  _mergeNumberMapInto(merged.contributions, safeSource.contributions);
  merged.momentum = Math.max(
    merged.momentum,
    safeSource.momentum,
    _calcMomentum(merged.daily)
  );

  return merged;
}

function _mergeNumberMapInto(target, source) {
  var keys = Object.keys(source || {});
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    target[key] = (target[key] || 0) + _toFiniteNumber(source[key]);
  }
}

function _toFiniteNumber(value) {
  var n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

    // Sync contribution to server for Telegram-linked users
    _syncContributionToServer(fk, amt, safeSource);
    _syncBattleChamberEventToServer(fk, amt, safeSource);
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
 * Returns 'hard-fork-rockers' as the default if all are equal (or no data).
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
  return best || 'hard-fork-rockers';
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
  if (v === 'diamond-hands' || v === 'diamond_hands' || v === 'diamondhands') v = 'hard-fork-rockers';
  if (v === 'hodl-warriors' || v === 'hodl_warriors' || v === 'hodlwarriors') v = 'rugpull-minors';
  if (v === 'graff-punks' || v === 'graff_punks') v = 'graffpunks';
  return FACTION_KEYS.indexOf(v) !== -1 ? v : null;
}

function _trimKeys(obj, maxKeys) {
  // Parse each key to a numeric timestamp for chronological ordering.
  // Supports both YYYY-MM-DD daily keys and YYYY-Www ISO week keys.
  function _keyToMs(k) {
    var wMatch = String(k).match(/^(\d{4})-W(\d{2})$/);
    if (wMatch) {
      // Approximate: Jan 1 of year + (week - 1) * 7 days
      return Date.UTC(Number(wMatch[1]), 0, 1) + (Number(wMatch[2]) - 1) * 7 * 86400000;
    }
    var dMatch = String(k).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dMatch) return Date.UTC(Number(dMatch[1]), Number(dMatch[2]) - 1, Number(dMatch[3]));
    return 0;
  }
  var keys = Object.keys(obj).sort(function (a, b) { return _keyToMs(a) - _keyToMs(b); });
  while (keys.length > maxKeys) {
    delete obj[keys.shift()];
  }
}

function _calcMomentum(dailyMap) {
  var today = new Date();
  var consecutive = 0;
  for (var i = 0; i < 7; i++) {
    var d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    if (dailyMap[_dateKey(d)] > 0) { consecutive++; } else { break; }
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
 * Sync faction contribution to the server for Telegram-linked users.
 * Fires-and-forgets; never throws.
 * Maps local CONTRIBUTION_SOURCES to the server's FACTION_SIGNAL_ALLOWED_REASONS allowlist.
 * @param {string} factionId
 * @param {number} amount
 * @param {string} reason
 */
function _syncContributionToServer(factionId, amount, reason) {
  if (!_isLinked()) return;
  var auth = _getSignedAuth();
  var apiBase = _getApiBase();
  if (!auth || !apiBase) return;
  // Map local source keys to server-recognised reason values.
  var SERVER_REASON_MAP = {
    score_submission: 'score_submission',
    mission_complete: 'mission_complete',
    streak_bonus:     'war_contribution',
    global_event:     'arcade_run',
    other:            'arcade_run',
  };
  var serverReason = SERVER_REASON_MAP[reason] || 'score_submission';
  try {
    fetch(apiBase + '/faction/signal/contribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_auth: auth,
        faction_id: factionId,
        contribution: amount,
        reason: serverReason,
      }),
    }).catch(function () {});
  } catch (_) {}
}

/**
 * Optionally write a Battle Chamber proof event.
 * Ownership model: /faction/signal/contribute owns clout increment authority.
 * This event call is proof/feed only (clout_delta is zero to avoid double-counting).
 */
function _syncBattleChamberEventToServer(factionId, amount, reason) {
  if (!_isLinked()) return;
  var auth = _getSignedAuth();
  var apiBase = _getApiBase();
  if (!auth || !apiBase) return;
  var safeAmount = Math.max(0, Math.min(BATTLE_CHAMBER_EVENT_CLAMP_MAX, Math.floor(Number(amount) || 0)));
  var EVENT_TYPE_MAP = {
    score_submission: 'weekly_contribution',
    mission_complete: 'mission_complete',
    streak_bonus: 'streak_bonus',
    global_event: 'weekly_contribution',
    other: 'weekly_contribution',
  };
  var eventType = EVENT_TYPE_MAP[reason] || 'weekly_contribution';
  try {
    fetch(apiBase + '/battle-chamber/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_auth: auth,
        faction_id: factionId,
        event_type: eventType,
        // Proof-only event; /faction/signal/contribute already owns clout totals.
        clout_delta: 0,
        source: 'faction-war-system',
        metadata_json: {
          ownership: 'faction_signal_route',
          contribution_amount: safeAmount,
          contribution_source: reason,
        },
      }),
    }).catch(function () {});
  } catch (_) {}
}
