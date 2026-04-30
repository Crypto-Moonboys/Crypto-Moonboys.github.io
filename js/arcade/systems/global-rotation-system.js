/**
 * global-rotation-system.js — Daily and weekly arcade rotation modifiers.
 *
 * Produces deterministic per-day and per-week modifier sets so every player
 * sees the same rotation.  Seeded from the UTC date/week so it resets
 * automatically without any server call.
 *
 * The rotation is influenced by:
 *   • faction dominance  (from faction-war-system)
 *   • weighted randomness seeded by the current date
 *   • weekly season state
 *
 * Public API:
 *   getDailyRotation()   — { date, seed, chaosRate, scoreScale, shieldBonus,
 *                            missionFocus, featuredFaction, riskWindow, label }
 *   getWeeklyRotation()  — { week, seed, seasonTheme, featuredFaction,
 *                            globalScaleBoost, label }
 *   getRotationSeed()    — numeric seed for today (deterministic)
 */

import { getDominantFaction } from '/js/arcade/systems/faction-war-system.js';

// ── Seed helpers ─────────────────────────────────────────────────────────────

/**
 * Simple deterministic LCG-based PRNG seeded by an integer.
 * Returns a function that yields floats in [0, 1).
 */
function _makeRng(seed) {
  var s = Math.abs(Math.floor(seed)) || 1;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

function _dateSeed() {
  var d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

function _weekSeed() {
  var d = new Date();
  var dayOfWeek = d.getUTCDay();
  var monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7));
  return monday.getUTCFullYear() * 10000 + (monday.getUTCMonth() + 1) * 100 + monday.getUTCDate();
}

// ── Rotation tables ──────────────────────────────────────────────────────────

var CHAOS_RATES    = Object.freeze([0.70, 0.85, 1.00, 1.15, 1.30]);
var SCORE_SCALES   = Object.freeze([0.90, 1.00, 1.05, 1.10, 1.20]);
var SHIELD_BONUSES = Object.freeze([0, 0, 0, 1, 1]);
var RISK_WINDOWS   = Object.freeze(['none', 'none', 'low', 'medium', 'high']);
var MISSION_FOCUS_POOL = Object.freeze(['score', 'survival', 'combo', 'chaos', 'streak', 'contribution']);

var SEASON_THEMES = Object.freeze([
  'Bear Market Grind',
  'Bull Run Frenzy',
  'HODL Protocol',
  'Chaos Season',
  'Diamond Hands Week',
]);

var FACTION_LABELS = Object.freeze({
  'diamond-hands': '💎 Diamond Hands',
  'hodl-warriors': '⚔️ HODL Warriors',
  graffpunks:      '🎨 GraffPUNKS',
});

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Return today's deterministic rotation modifiers.
 *
 * @returns {{
 *   date:            string,
 *   seed:            number,
 *   chaosRate:       number,
 *   scoreScale:      number,
 *   shieldBonus:     number,
 *   missionFocus:    string,
 *   featuredFaction: string,
 *   riskWindow:      string,
 *   label:           string
 * }}
 */
export function getDailyRotation() {
  var seed = _dateSeed();
  var rng  = _makeRng(seed);

  var chaosIdx    = Math.floor(rng() * CHAOS_RATES.length);
  var scoreIdx    = Math.floor(rng() * SCORE_SCALES.length);
  var shieldIdx   = Math.floor(rng() * SHIELD_BONUSES.length);
  var missionIdx  = Math.floor(rng() * MISSION_FOCUS_POOL.length);
  var riskIdx     = Math.floor(rng() * RISK_WINDOWS.length);

  // Featured faction: 70 % dominant faction, 30 % random
  var dominant = _safeGetDominant();
  var factions = ['diamond-hands', 'hodl-warriors', 'graffpunks'];
  var featuredFaction;
  if (rng() < 0.70) {
    featuredFaction = dominant;
  } else {
    featuredFaction = factions[Math.floor(rng() * factions.length)];
  }

  var today = new Date();
  var dateStr = today.getUTCFullYear() + '-'
    + String(today.getUTCMonth() + 1).padStart(2, '0') + '-'
    + String(today.getUTCDate()).padStart(2, '0');

  var chaosRate  = CHAOS_RATES[chaosIdx];
  var riskWindow = RISK_WINDOWS[riskIdx];
  var label = _buildDailyLabel(chaosRate, riskWindow, featuredFaction);

  return Object.freeze({
    date:            dateStr,
    seed:            seed,
    chaosRate:       chaosRate,
    scoreScale:      SCORE_SCALES[scoreIdx],
    shieldBonus:     SHIELD_BONUSES[shieldIdx],
    missionFocus:    MISSION_FOCUS_POOL[missionIdx],
    featuredFaction: featuredFaction,
    riskWindow:      riskWindow,
    label:           label,
  });
}

/**
 * Return this week's deterministic rotation.
 *
 * @returns {{
 *   week:             string,
 *   seed:             number,
 *   seasonTheme:      string,
 *   featuredFaction:  string,
 *   globalScaleBoost: number,
 *   label:            string
 * }}
 */
export function getWeeklyRotation() {
  var seed = _weekSeed();
  var rng  = _makeRng(seed);

  var themeIdx    = Math.floor(rng() * SEASON_THEMES.length);
  var scaleBoost  = 1 + Math.floor(rng() * 3) * 0.05;   // 1.00, 1.05, or 1.10
  var factions    = ['diamond-hands', 'hodl-warriors', 'graffpunks'];
  var dominant    = _safeGetDominant();
  var featured    = rng() < 0.60 ? dominant : factions[Math.floor(rng() * factions.length)];

  // ISO 8601 week key (Thursday-determines-year rule) — same algorithm as faction-war-system
  var _wd = new Date();
  var _dow = _wd.getUTCDay() || 7;
  var _thu = new Date(Date.UTC(_wd.getUTCFullYear(), _wd.getUTCMonth(), _wd.getUTCDate() + (4 - _dow)));
  var _ys = new Date(Date.UTC(_thu.getUTCFullYear(), 0, 1));
  var _wn = Math.ceil(((_thu - _ys) / 86400000 + 1) / 7);
  var weekStr = _thu.getUTCFullYear() + '-W' + String(_wn).padStart(2, '0');

  var theme = SEASON_THEMES[themeIdx];
  var label = theme + ' | ' + (FACTION_LABELS[featured] || featured) + ' pressure';

  return Object.freeze({
    week:             weekStr,
    seed:             seed,
    seasonTheme:      theme,
    featuredFaction:  featured,
    globalScaleBoost: scaleBoost,
    label:            label,
  });
}

/**
 * Return the numeric seed for today's rotation (deterministic per UTC day).
 * @returns {number}
 */
export function getRotationSeed() {
  return _dateSeed();
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _safeGetDominant() {
  try { return getDominantFaction(); } catch (_) { return 'diamond-hands'; }
}

function _buildDailyLabel(chaosRate, riskWindow, featuredFaction) {
  var parts = [];
  if (chaosRate >= 1.15) parts.push('⚡ High chaos');
  else if (chaosRate <= 0.75) parts.push('🧊 Calm day');
  else parts.push('🌀 Normal flux');
  if (riskWindow !== 'none') parts.push('⚠️ ' + riskWindow + ' risk window');
  var fl = FACTION_LABELS[featuredFaction];
  if (fl) parts.push(fl + ' featured');
  return parts.join(' · ');
}
