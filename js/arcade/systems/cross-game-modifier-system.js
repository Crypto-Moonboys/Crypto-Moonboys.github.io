/**
 * cross-game-modifier-system.js — Arcade-wide modifier layer.
 *
 * Provides a read-only, localStorage-persisted modifier system that any
 * compatible arcade game can query.  No game should mutate these definitions.
 *
 * Public API:
 *   MODIFIER_DEFS                    — frozen array of all modifier definitions
 *   getModifierDef(id)               — retrieve one definition by id
 *   getAllModifierDefs()              — retrieve all definitions
 *   getUnlockedModifiers()           — array of unlocked modifier ids from localStorage
 *   unlockModifier(id)               — persist a modifier as unlocked
 *   isModifierUnlocked(id)           — boolean check
 *   getActiveModifier()              — currently selected modifier id (or null)
 *   setActiveModifier(id)            — activate a modifier (must be unlocked)
 *   clearActiveModifier()            — deactivate the current modifier
 *   getActiveModifiers(gameId, tags) — returns applicable frozen modifiers for a game
 *   hasEffect(activeMods, key)       — true if any active mod has the given effect
 *   getStatEffect(activeMods, key, defaultValue) — get numeric/bool effect value
 *   getModifierHistory()             — array of { id, gameId, ts } usage records
 */

// ── Storage keys ────────────────────────────────────────────────────────────

const STORAGE_KEY_UNLOCKED = 'cm_modifiers_unlocked_v1';
const STORAGE_KEY_ACTIVE   = 'cm_modifier_active_v1';
const STORAGE_KEY_HISTORY  = 'cm_modifier_history_v1';

// ── Valid game tags ──────────────────────────────────────────────────────────

/**
 * All recognised cross-game tags that modifier definitions may reference.
 * Game adapters declare which tags they support via `crossGameTags`.
 */
export var GAME_TAGS = Object.freeze([
  'shooter',
  'maze',
  'physics',
  'snake',
  'breakout',
  'puzzle',
  'racing',
]);

// ── Modifier definitions (read-only) ────────────────────────────────────────

/**
 * All modifier definitions.  Frozen so no game can mutate them at runtime.
 *
 * Each entry:
 *   id          {string}    — unique identifier
 *   label       {string}    — human-readable name
 *   description {string}    — effect description
 *   rarity      {string}    — 'common' | 'uncommon' | 'rare' | 'legendary'
 *   tags        {string[]}  — compatible game tags (game must share ≥1 tag)
 *   effects     {object}    — stat/behaviour keys consumed by games:
 *     scoreMult        {number}  — multiply every score gain (e.g. 1.10 = +10 %)
 *     shieldedStart    {boolean} — grant one extra shield/life at run start
 *     pressureRate     {number}  — multiply outgoing event-pressure rate (e.g. 0.90 = −10 %)
 *     riskRewardMult   {number}  — multiply risk/reward payout (e.g. 1.15 = +15 %)
 *     bossDmgMult      {number}  — multiply damage/score against bosses
 *     magnetPickups    {boolean} — enable pickup magnetism toward player
 *     recoveryPulse    {boolean} — restore shield after a chaos event ends
 *     goldenSpawnBoost {number}  — additive probability bonus for rare/golden spawns
 */
export var MODIFIER_DEFS = Object.freeze([

  Object.freeze({
    id: 'score_surge',
    label: 'Score Surge',
    description: '+10% score gain on every point earned.',
    rarity: 'common',
    tags: Object.freeze(['shooter', 'maze', 'physics', 'snake', 'breakout', 'puzzle', 'racing']),
    effects: Object.freeze({ scoreMult: 1.10 }),
  }),

  Object.freeze({
    id: 'shielded_start',
    label: 'Shielded Start',
    description: 'Begin each run with one extra shield or life.',
    rarity: 'uncommon',
    tags: Object.freeze(['shooter', 'breakout', 'physics', 'snake']),
    effects: Object.freeze({ shieldedStart: true }),
  }),

  Object.freeze({
    id: 'slow_chaos',
    label: 'Slow Chaos',
    description: 'Event pressure builds 10% slower.',
    rarity: 'uncommon',
    tags: Object.freeze(['shooter', 'snake', 'physics', 'maze', 'breakout']),
    effects: Object.freeze({ pressureRate: 0.90 }),
  }),

  Object.freeze({
    id: 'risk_bonus',
    label: 'Risk Bonus',
    description: 'Risk/reward choices pay +15% more.',
    rarity: 'rare',
    tags: Object.freeze(['shooter', 'maze', 'physics', 'snake', 'breakout', 'puzzle', 'racing']),
    effects: Object.freeze({ riskRewardMult: 1.15 }),
  }),

  Object.freeze({
    id: 'boss_hunter',
    label: 'Boss Hunter',
    description: '+10% damage and score against bosses.',
    rarity: 'rare',
    tags: Object.freeze(['shooter', 'snake', 'maze', 'breakout']),
    effects: Object.freeze({ bossDmgMult: 1.10 }),
  }),

  Object.freeze({
    id: 'magnet_luck',
    label: 'Magnet Luck',
    description: 'Pickups drift toward the player.',
    rarity: 'uncommon',
    tags: Object.freeze(['shooter', 'breakout', 'physics']),
    effects: Object.freeze({ magnetPickups: true }),
  }),

  Object.freeze({
    id: 'recovery_pulse',
    label: 'Recovery Pulse',
    description: 'Restore shield/health after a chaos event ends.',
    rarity: 'rare',
    tags: Object.freeze(['shooter', 'snake', 'breakout', 'physics']),
    effects: Object.freeze({ recoveryPulse: true }),
  }),

  Object.freeze({
    id: 'golden_chance',
    label: 'Golden Chance',
    description: 'Rare and golden reward spawn chance increased.',
    rarity: 'legendary',
    tags: Object.freeze(['shooter', 'maze', 'physics', 'snake', 'breakout', 'puzzle', 'racing']),
    effects: Object.freeze({ goldenSpawnBoost: 0.05 }),
  }),

]);

// ── Internal lookup ──────────────────────────────────────────────────────────

var _byId = new Map(MODIFIER_DEFS.map(function (m) { return [m.id, m]; }));

// ── Storage helpers ──────────────────────────────────────────────────────────

function _safeGet(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

function _safeSet(key, val) {
  try { localStorage.setItem(key, val); } catch (_) {}
}

function _safeRemove(key) {
  try { localStorage.removeItem(key); } catch (_) {}
}

function _safeParse(raw, fallback) {
  try { return (raw !== null && raw !== undefined) ? JSON.parse(raw) : fallback; }
  catch (_) { return fallback; }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieve a modifier definition by id.
 * @param {string} id
 * @returns {object|null}
 */
export function getModifierDef(id) {
  return _byId.get(id) || null;
}

/**
 * Return the full frozen array of modifier definitions.
 * @returns {readonly object[]}
 */
export function getAllModifierDefs() {
  return MODIFIER_DEFS;
}

/**
 * Return the list of unlocked modifier ids from localStorage.
 * On first call (no data stored) all modifiers are unlocked so players can
 * explore the system immediately.
 * @returns {string[]}
 */
export function getUnlockedModifiers() {
  var raw = _safeGet(STORAGE_KEY_UNLOCKED);
  var ids = _safeParse(raw, null);
  if (!Array.isArray(ids)) {
    // First visit — auto-unlock everything
    var all = MODIFIER_DEFS.map(function (m) { return m.id; });
    _safeSet(STORAGE_KEY_UNLOCKED, JSON.stringify(all));
    return all;
  }
  return ids;
}

/**
 * Unlock a modifier and persist the change.
 * @param {string} id
 * @returns {boolean} true if the modifier exists
 */
export function unlockModifier(id) {
  if (!_byId.has(id)) return false;
  var unlocked = getUnlockedModifiers();
  if (unlocked.indexOf(id) === -1) {
    unlocked.push(id);
    _safeSet(STORAGE_KEY_UNLOCKED, JSON.stringify(unlocked));
  }
  return true;
}

/**
 * Check whether a modifier is unlocked.
 * @param {string} id
 * @returns {boolean}
 */
export function isModifierUnlocked(id) {
  return getUnlockedModifiers().indexOf(id) !== -1;
}

/**
 * Return the currently active modifier id, or null if none is selected.
 * @returns {string|null}
 */
export function getActiveModifier() {
  return _safeGet(STORAGE_KEY_ACTIVE) || null;
}

/**
 * Set a modifier as active.  The modifier must exist and be unlocked.
 * @param {string} id
 * @returns {boolean} true on success
 */
export function setActiveModifier(id) {
  if (!_byId.has(id)) return false;
  if (!isModifierUnlocked(id)) return false;
  _safeSet(STORAGE_KEY_ACTIVE, id);
  return true;
}

/**
 * Clear the active modifier.
 */
export function clearActiveModifier() {
  _safeRemove(STORAGE_KEY_ACTIVE);
}

/**
 * Return the active modifiers that are compatible with a game.
 *
 * A modifier is compatible when at least one of the game's tags appears in
 * the modifier's own tags list.  Games must NOT mutate the returned objects.
 *
 * @param {string}   gameId  — the game's id (used for history recording)
 * @param {string[]} tags    — the game's declared crossGameTags
 * @returns {readonly object[]} array of frozen modifier defs (may be empty)
 */
export function getActiveModifiers(gameId, tags) {
  var activeId = getActiveModifier();
  if (!activeId) return [];

  var def = _byId.get(activeId);
  if (!def) return [];

  // Compatibility: at least one game tag must match the modifier's tags
  var gameTags = Array.isArray(tags) ? tags : [];
  var compatible = gameTags.some(function (t) { return def.tags.indexOf(t) !== -1; });
  if (!compatible) return [];

  _recordModifierUse(activeId, gameId);
  return [def];   // array allows future multi-modifier expansion
}

/**
 * Return true if any active modifier has the given effect key.
 * @param {object[]} activeMods — result of getActiveModifiers()
 * @param {string}   effectKey
 * @returns {boolean}
 */
export function hasEffect(activeMods, effectKey) {
  if (!Array.isArray(activeMods)) return false;
  return activeMods.some(function (m) {
    return m.effects && Object.prototype.hasOwnProperty.call(m.effects, effectKey);
  });
}

/**
 * Return the value of an effect from the active modifiers.
 * Returns `defaultValue` when the effect is not present.
 * @param {object[]} activeMods
 * @param {string}   effectKey
 * @param {*}        defaultValue
 * @returns {*}
 */
export function getStatEffect(activeMods, effectKey, defaultValue) {
  if (!Array.isArray(activeMods)) return defaultValue;
  for (var i = 0; i < activeMods.length; i++) {
    var m = activeMods[i];
    if (m.effects && Object.prototype.hasOwnProperty.call(m.effects, effectKey)) {
      return m.effects[effectKey];
    }
  }
  return defaultValue;
}

/**
 * Return the modifier usage history from localStorage.
 * Each entry: { id: string, gameId: string, ts: number }
 * @returns {object[]}
 */
export function getModifierHistory() {
  var raw = _safeGet(STORAGE_KEY_HISTORY);
  return _safeParse(raw, []);
}

// ── Internal history recording ───────────────────────────────────────────────

function _recordModifierUse(id, gameId) {
  try {
    var history = getModifierHistory();
    var now = Date.now();
    // De-duplicate: skip if the same modifier + game was recorded in the last 5 s
    var last = history[history.length - 1];
    if (last && last.id === id && last.gameId === gameId && now - last.ts < 5000) return;
    history.push({ id: id, gameId: gameId || '', ts: now });
    // Cap at 200 entries to avoid unbounded growth
    if (history.length > 200) history.splice(0, history.length - 200);
    _safeSet(STORAGE_KEY_HISTORY, JSON.stringify(history));
  } catch (_) {}
}
