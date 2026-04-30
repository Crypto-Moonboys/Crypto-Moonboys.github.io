/**
 * faction-effect-system.js — Faction gameplay modifier layer.
 *
 * Data-driven, read-only effects for each faction.  Games must call the
 * shared helpers rather than hardcoding faction names or effect values
 * directly.  All helpers no-op safely when the faction is unrecognised or
 * the game does not support the requested feature.
 *
 * Public API:
 *   FACTION_DEFS                                          — frozen definitions
 *   getFactionEffects(factionId, context)                 — effect object
 *   applyFactionScore(base, factionId, context)           — adjusted score
 *   applyFactionEventRate(base, factionId, context)       — adjusted event rate
 *   applyFactionStartingShield(base, factionId, context)  — adjusted shield count
 *   applyFactionComboBonus(base, factionId, context)      — adjusted combo multiplier
 *   getXpModifierMeta(factionId)                          — xpModifier (metadata only)
 *   getPlayerFaction()                                    — current player faction key
 *
 * Important: xpModifier is metadata only.  It must never be fed into XP
 * base-math or the submitScore path.  It is exposed for display only.
 */

// ── Faction effect definitions ───────────────────────────────────────────────

/**
 * All faction effect definitions.  Frozen so no game can mutate at runtime.
 *
 * Fields per entry:
 *   key             {string}   — canonical faction key
 *   label           {string}   — human-readable name
 *   bonusText       {string}   — short display description
 *   scoreMultiplier {number}   — multiplied against every score gain
 *   survivalBonus   {number}   — extra multiplier applied after timeAlive > 30 s
 *   chaosModifier   {number}   — multiply chaos/event pressure rate
 *   shieldBonus     {number}   — extra starting shields (integer; 0 = none)
 *   comboModifier   {number}   — multiply combo multiplier value
 *   xpModifier      {number}   — METADATA ONLY — never applied to XP math
 *   rewardBias      {string}   — 'endurance' | 'contribution' | 'chaos' | 'none'
 */
export var FACTION_DEFS = Object.freeze({

  'diamond-hands': Object.freeze({
    key:             'diamond-hands',
    label:           'Diamond Hands',
    bonusText:       '💎 Diamond Hands: Endurance score bonus active',
    scoreMultiplier: 1.0,
    survivalBonus:   0.12,   // +12 % after 30 s alive
    chaosModifier:   0.80,   // 20 % less chaos exposure
    shieldBonus:     0,
    comboModifier:   0.90,   // reduced early burst
    xpModifier:      1.05,   // metadata only
    rewardBias:      'endurance',
  }),

  'hodl-warriors': Object.freeze({
    key:             'hodl-warriors',
    label:           'HODL Warriors',
    bonusText:       '⚔️ HODL Warriors: +Shield & survivability active',
    scoreMultiplier: 1.0,
    survivalBonus:   0.15,   // +15 % survival-biased score bonus
    chaosModifier:   0.85,   // 15 % less chaos
    shieldBonus:     1,      // +1 starting shield where supported
    comboModifier:   1.05,   // slight streak/contribution bias
    xpModifier:      1.0,    // metadata only
    rewardBias:      'contribution',
  }),

  graffpunks: Object.freeze({
    key:             'graffpunks',
    label:           'GraffPUNKS',
    bonusText:       '🎨 GraffPUNKS: Chaos & combo bonus active',
    scoreMultiplier: 1.0,
    survivalBonus:   0.0,
    chaosModifier:   1.25,   // 25 % more chaos
    shieldBonus:     0,
    comboModifier:   1.25,   // +25 % combo multiplier
    xpModifier:      1.02,   // metadata only
    rewardBias:      'chaos',
  }),

  unaligned: Object.freeze({
    key:             'unaligned',
    label:           'Unaligned',
    bonusText:       '',
    scoreMultiplier: 1.0,
    survivalBonus:   0.0,
    chaosModifier:   1.0,
    shieldBonus:     0,
    comboModifier:   1.0,
    xpModifier:      1.0,
    rewardBias:      'none',
  }),

});

// ── Normalise faction key ────────────────────────────────────────────────────

function _normalise(factionId) {
  var v = String(factionId || 'unaligned').toLowerCase().trim();
  // Accept alternate spellings used elsewhere in the codebase
  if (v === 'diamond_hands' || v === 'diamondhands') return 'diamond-hands';
  if (v === 'hodl_warriors' || v === 'hodlwarriors') return 'hodl-warriors';
  if (v === 'graff-punks' || v === 'graff_punks') return 'graffpunks';
  return FACTION_DEFS[v] ? v : 'unaligned';
}

function _resolve(factionId) {
  return FACTION_DEFS[_normalise(factionId)] || FACTION_DEFS.unaligned;
}

// ── Public helpers ───────────────────────────────────────────────────────────

/**
 * Return the full effect object for a faction.
 * @param {string} factionId
 * @param {object} [context]
 * @returns {object} frozen effect definition
 */
export function getFactionEffects(factionId, context) {
  return _resolve(factionId);
}

/**
 * Apply faction score modifier to a base score.
 *
 * DiamondHands endurance bonus activates after timeAlive > 30 seconds.
 * All other factions use the base scoreMultiplier only.
 *
 * @param {number} baseScore
 * @param {string} factionId
 * @param {object} [context]  — { timeAlive: number (seconds) }
 * @returns {number} adjusted score (floored integer)
 */
export function applyFactionScore(baseScore, factionId, context) {
  if (!Number.isFinite(baseScore)) return baseScore;
  var fx = _resolve(factionId);
  var mult = fx.scoreMultiplier;
  if (fx.rewardBias === 'endurance' && context && Number(context.timeAlive) > 30) {
    mult = mult * (1 + fx.survivalBonus);
  }
  return Math.floor(baseScore * mult);
}

/**
 * Apply faction chaos/event-rate modifier.
 * Multiply the base chaos/pressure rate by the faction's chaosModifier.
 *
 * @param {number} baseRate  — the game's current chaos pressure rate
 * @param {string} factionId
 * @param {object} [context]
 * @returns {number} adjusted rate
 */
export function applyFactionEventRate(baseRate, factionId, context) {
  if (!Number.isFinite(baseRate)) return baseRate;
  return baseRate * _resolve(factionId).chaosModifier;
}

/**
 * Apply faction starting-shield bonus.
 * No-op when the game does not support shields (context.supportsShield falsy
 * AND baseShield is 0 or below).
 *
 * @param {number} baseShield  — the game's default starting shield count
 * @param {string} factionId
 * @param {object} [context]   — { supportsShield: boolean }
 * @returns {number} adjusted starting-shield count
 */
export function applyFactionStartingShield(baseShield, factionId, context) {
  if (!Number.isFinite(baseShield)) return baseShield;
  var supported = (context && context.supportsShield) || baseShield > 0;
  if (!supported) return baseShield;
  return baseShield + _resolve(factionId).shieldBonus;
}

/**
 * Apply faction combo multiplier bonus.
 *
 * @param {number} baseCombo  — the game's current combo multiplier
 * @param {string} factionId
 * @param {object} [context]
 * @returns {number} adjusted combo multiplier
 */
export function applyFactionComboBonus(baseCombo, factionId, context) {
  if (!Number.isFinite(baseCombo)) return baseCombo;
  return baseCombo * _resolve(factionId).comboModifier;
}

/**
 * Return the xpModifier metadata value for a faction.
 * This value must NOT be applied to XP base math or the submitScore path.
 * It is exposed for display or logging purposes only.
 *
 * @param {string} factionId
 * @returns {number}
 */
export function getXpModifierMeta(factionId) {
  return _resolve(factionId).xpModifier;
}

/**
 * Read the current player faction from available singletons.
 * Checks MOONBOYS_FACTION first, then MOONBOYS_STATE.
 * Falls back to 'unaligned'.
 *
 * @returns {string} normalised faction key
 */
export function getPlayerFaction() {
  try {
    var factionApi = (typeof window !== 'undefined') && window.MOONBOYS_FACTION;
    if (factionApi && typeof factionApi.getCachedStatus === 'function') {
      var status = factionApi.getCachedStatus();
      if (status && status.faction) return _normalise(status.faction);
    }
    var stateApi = (typeof window !== 'undefined') && window.MOONBOYS_STATE;
    if (stateApi && typeof stateApi.getState === 'function') {
      var state = stateApi.getState();
      if (state && state.faction) return _normalise(state.faction);
    }
  } catch (_) {}
  return 'unaligned';
}
