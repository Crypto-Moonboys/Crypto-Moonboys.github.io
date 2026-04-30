/**
 * faction-ranks.js — Faction rank progression.
 *
 * Tracks rank tiers per faction based on accumulated war contribution.
 * Ranks are cosmetic/progression-facing.  They are persisted to localStorage
 * using the same war-state source so they stay in sync automatically.
 *
 * Rank thresholds are contribution-based (derived from faction war power).
 * Unlocks are emitted via the live-activity system.
 *
 * Public API:
 *   RANK_TIERS                          — frozen tier definitions
 *   getFactionRank(factionId)           — { tier, label, badge, power, next }
 *   checkRankUp(factionId, power)       — emits rank unlock if tier increased
 *   getAllRanks()                        — array of { faction, rank } summaries
 */

import { getFactionPower } from '/js/arcade/systems/faction-war-system.js';
import { emitRankUnlock }  from '/js/arcade/systems/live-activity.js';

var RANKS_STORAGE_KEY = 'fw_ranks_v1';

// ── Rank tier definitions ────────────────────────────────────────────────────

/**
 * Contribution power thresholds for each rank tier.
 * Ranks are shared across factions — only the badge color differs.
 */
export var RANK_TIERS = Object.freeze([
  Object.freeze({ tier: 0, label: 'Recruit',   badge: '◌',  threshold: 0     }),
  Object.freeze({ tier: 1, label: 'Initiate',  badge: '🔰', threshold: 200   }),
  Object.freeze({ tier: 2, label: 'Soldier',   badge: '⚙️', threshold: 600   }),
  Object.freeze({ tier: 3, label: 'Warrior',   badge: '⚔️', threshold: 1500  }),
  Object.freeze({ tier: 4, label: 'Champion',  badge: '🏆', threshold: 4000  }),
  Object.freeze({ tier: 5, label: 'Legend',    badge: '💎', threshold: 10000 }),
]);

var FACTION_RANK_COLORS = Object.freeze({
  'diamond-hands': '#56dcff',
  'hodl-warriors': '#ff6ad5',
  graffpunks:      '#7dff72',
  unaligned:       '#8b949e',
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

function _loadRanks() {
  var raw = _safeGet(RANKS_STORAGE_KEY);
  var s   = _safeParse(raw, {});
  if (typeof s !== 'object' || s === null) s = {};
  return s;   // { [factionKey]: number (highest acknowledged tier) }
}

function _saveRanks(s) {
  _safeSet(RANKS_STORAGE_KEY, JSON.stringify(s));
}

// ── Tier resolution ──────────────────────────────────────────────────────────

function _tierForPower(power) {
  var tier = RANK_TIERS[0];
  for (var i = 0; i < RANK_TIERS.length; i++) {
    if (power >= RANK_TIERS[i].threshold) tier = RANK_TIERS[i];
  }
  return tier;
}

function _nextTierForPower(power) {
  for (var i = 0; i < RANK_TIERS.length; i++) {
    if (RANK_TIERS[i].threshold > power) return RANK_TIERS[i];
  }
  return null;  // max rank reached
}

function _normaliseFaction(id) {
  var v = String(id || 'unaligned').toLowerCase().trim();
  if (v === 'diamond_hands' || v === 'diamondhands') return 'diamond-hands';
  if (v === 'hodl_warriors' || v === 'hodlwarriors') return 'hodl-warriors';
  if (v === 'graff-punks' || v === 'graff_punks') return 'graffpunks';
  return v;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the current rank for a faction.
 *
 * @param {string} factionId
 * @returns {{
 *   tier:  number,
 *   label: string,
 *   badge: string,
 *   color: string,
 *   power: number,
 *   next:  { label: string, threshold: number } | null
 * }}
 */
export function getFactionRank(factionId) {
  var fk    = _normaliseFaction(factionId);
  var power = 0;
  try { power = getFactionPower(fk) || 0; } catch (_) {}

  var current  = _tierForPower(power);
  var nextTier = _nextTierForPower(power);
  var color    = FACTION_RANK_COLORS[fk] || FACTION_RANK_COLORS.unaligned;

  return {
    tier:  current.tier,
    label: current.label,
    badge: current.badge,
    color: color,
    power: power,
    next:  nextTier ? { label: nextTier.label, threshold: nextTier.threshold } : null,
  };
}

/**
 * Check whether the faction has ranked up since the last acknowledged tier.
 * If so, emits a rank-unlock event via live-activity.
 * Call this after recording a war contribution.
 *
 * @param {string} factionId
 * @param {number} [power]  — optional; fetched automatically if omitted
 */
export function checkRankUp(factionId, power) {
  try {
    var fk    = _normaliseFaction(factionId);
    var pow   = (power !== undefined) ? Number(power) : getFactionPower(fk);
    var ranks = _loadRanks();
    var prev  = ranks[fk] || 0;
    var current = _tierForPower(pow);

    if (current.tier > prev) {
      ranks[fk] = current.tier;
      _saveRanks(ranks);
      var color = FACTION_RANK_COLORS[fk] || '#fff';
      emitRankUnlock(fk, current.badge + ' ' + current.label);
    }
  } catch (e) {
    try { console.warn('[faction-ranks] checkRankUp error:', e); } catch (_) {}
  }
}

/**
 * Return a summary of all faction ranks.
 * @returns {Array<{ faction: string, rank: object }>}
 */
export function getAllRanks() {
  var factions = ['diamond-hands', 'hodl-warriors', 'graffpunks'];
  return factions.map(function (fk) {
    return { faction: fk, rank: getFactionRank(fk) };
  });
}
