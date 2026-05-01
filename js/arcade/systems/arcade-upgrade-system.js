/**
 * arcade-upgrade-system.js — Shared upgrade catalogue and selector.
 *
 * Provides common upgrade concepts across all active arcade games without
 * making games identical.  Each game retains its own mechanics; this system
 * provides a common vocabulary and faction-aware selection logic.
 *
 * Public API:
 *   ARCADE_UPGRADE_DEFS            — frozen upgrade catalogue
 *   getUpgradeChoices(opts)        — return 3 faction-aware upgrade options
 *   getUpgradesByCategory(cat)     — return all upgrades for a category
 *   getUpgradeById(id)             — single upgrade def by id
 *   UPGRADE_CATEGORY_BIAS          — faction → preferred categories
 *
 * Usage:
 *   import { getUpgradeChoices } from '/js/arcade/systems/arcade-upgrade-system.js';
 *   const choices = getUpgradeChoices({ gameId, factionId, modifierTags, currentRunState });
 *   // returns array of up to 3 upgrade defs, faction-biased
 *
 * Each upgrade definition:
 *   id              {string}   — unique identifier
 *   label           {string}   — display name
 *   description     {string}   — player-facing effect description
 *   tags            {string[]} — compatible game tags (from GAME_TAGS)
 *   compatibleGames {string[]} — explicit game ids (empty = all games)
 *   compatibleFactions {string[]} — factions that can see this (empty = all factions)
 *   rarity          {string}   — 'common' | 'uncommon' | 'rare' | 'legendary'
 *   category        {string}   — 'survival' | 'score' | 'rare' | 'chaos' | 'faction'
 *   effectType      {string}   — hint for the game on how to apply the effect
 *   duration        {number}   — seconds (0 = permanent for run)
 *   stackLimit      {number}   — max times selectable in one run (default 1)
 */

// ── Category constants ────────────────────────────────────────────────────────

export var UPGRADE_CATEGORIES = Object.freeze({
  SURVIVAL: 'survival',
  SCORE:    'score',
  RARE:     'rare',
  CHAOS:    'chaos',
  FACTION:  'faction',
});

// ── Faction → preferred upgrade category bias ─────────────────────────────────

/**
 * Maps faction id to a list of preferred upgrade categories in priority order.
 * Used by getUpgradeChoices() to bias the 3 options toward the faction's style.
 */
export var UPGRADE_CATEGORY_BIAS = Object.freeze({
  'diamond-hands': Object.freeze(['score', 'survival', 'faction']),
  'hodl-warriors': Object.freeze(['survival', 'faction', 'score']),
  'graffpunks':    Object.freeze(['chaos', 'rare', 'faction']),
  'unaligned':     Object.freeze(['survival', 'score', 'rare']),
});

// ── Upgrade catalogue ─────────────────────────────────────────────────────────

/**
 * All shared upgrade definitions.  Games may extend these locally; this
 * catalogue defines the shared vocabulary.
 */
export var ARCADE_UPGRADE_DEFS = Object.freeze([

  // ── Survival ────────────────────────────────────────────────────────────────

  Object.freeze({
    id:                 'shield_pulse',
    label:              'Shield Pulse',
    description:        'Restore one shield charge.',
    tags:               Object.freeze(['shooter', 'breakout', 'physics', 'snake']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze([]),
    rarity:             'rare',
    category:           'survival',
    effectType:         'restore_shield',
    duration:           0,
    stackLimit:         2,
  }),

  Object.freeze({
    id:                 'second_chance',
    label:              'Second Chance',
    description:        'Gain one revive token for this run.',
    tags:               Object.freeze(['shooter', 'breakout', 'physics', 'snake', 'maze', 'puzzle']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze([]),
    rarity:             'legendary',
    category:           'survival',
    effectType:         'revive_token',
    duration:           0,
    stackLimit:         1,
  }),

  Object.freeze({
    id:                 'slow_pressure',
    label:              'Slow Pressure',
    description:        'Chaos pressure rate −15% for the rest of this run.',
    tags:               Object.freeze(['shooter', 'breakout', 'physics', 'snake', 'maze']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze([]),
    rarity:             'uncommon',
    category:           'survival',
    effectType:         'reduce_pressure_rate',
    duration:           0,
    stackLimit:         2,
  }),

  Object.freeze({
    id:                 'recovery_window',
    label:              'Recovery Window',
    description:        'Brief invincibility window after next hit.',
    tags:               Object.freeze(['shooter', 'breakout', 'physics', 'snake']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze([]),
    rarity:             'uncommon',
    category:           'survival',
    effectType:         'iframes_on_hit',
    duration:           3,
    stackLimit:         2,
  }),

  // ── Score ───────────────────────────────────────────────────────────────────

  Object.freeze({
    id:                 'combo_surge',
    label:              'Combo Surge',
    description:        '+20% combo multiplier value for this run.',
    tags:               Object.freeze(['shooter', 'breakout', 'physics', 'snake', 'maze', 'puzzle']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze([]),
    rarity:             'common',
    category:           'score',
    effectType:         'combo_mult_bonus',
    duration:           0,
    stackLimit:         3,
  }),

  Object.freeze({
    id:                 'clean_run_bonus',
    label:              'Clean Run Bonus',
    description:        '+10% score when shield is not broken this run.',
    tags:               Object.freeze(['shooter', 'breakout', 'physics', 'snake']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze([]),
    rarity:             'uncommon',
    category:           'score',
    effectType:         'score_if_shield_intact',
    duration:           0,
    stackLimit:         1,
  }),

  Object.freeze({
    id:                 'multiplier_spark',
    label:              'Multiplier Spark',
    description:        '+15% score on all point gains for the next 20 seconds.',
    tags:               Object.freeze(['shooter', 'breakout', 'physics', 'snake', 'maze', 'puzzle', 'racing']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze([]),
    rarity:             'common',
    category:           'score',
    effectType:         'timed_score_mult',
    duration:           20,
    stackLimit:         3,
  }),

  Object.freeze({
    id:                 'late_game_scaling',
    label:              'Late Game Scaling',
    description:        '+12% score bonus applies after 45s alive in this run.',
    tags:               Object.freeze(['shooter', 'breakout', 'physics', 'snake', 'maze', 'puzzle']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze(['diamond-hands', 'unaligned']),
    rarity:             'uncommon',
    category:           'score',
    effectType:         'endurance_score_bonus',
    duration:           0,
    stackLimit:         2,
  }),

  // ── Rare / Golden ────────────────────────────────────────────────────────────

  Object.freeze({
    id:                 'golden_chance',
    label:              'Golden Chance',
    description:        'Rare and golden item spawn chance increased this run.',
    tags:               Object.freeze(['shooter', 'breakout', 'physics', 'snake', 'maze', 'puzzle']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze([]),
    rarity:             'rare',
    category:           'rare',
    effectType:         'golden_spawn_boost',
    duration:           0,
    stackLimit:         2,
  }),

  Object.freeze({
    id:                 'rare_spawn_bias',
    label:              'Rare Spawn Bias',
    description:        'Next rare spawn is guaranteed within 30 seconds.',
    tags:               Object.freeze(['shooter', 'snake', 'maze', 'physics']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze([]),
    rarity:             'rare',
    category:           'rare',
    effectType:         'guarantee_rare_spawn',
    duration:           0,
    stackLimit:         1,
  }),

  Object.freeze({
    id:                 'crystal_pull',
    label:              'Crystal Pull',
    description:        'Rare crystals or golden pickups drift toward you.',
    tags:               Object.freeze(['shooter', 'physics', 'breakout']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze([]),
    rarity:             'uncommon',
    category:           'rare',
    effectType:         'magnet_rare_pickups',
    duration:           0,
    stackLimit:         1,
  }),

  Object.freeze({
    id:                 'loot_signal',
    label:              'Loot Signal',
    description:        'Next boss or elite drops a guaranteed rare reward.',
    tags:               Object.freeze(['shooter', 'snake', 'breakout', 'maze', 'physics']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze([]),
    rarity:             'legendary',
    category:           'rare',
    effectType:         'boss_rare_drop',
    duration:           0,
    stackLimit:         1,
  }),

  // ── Chaos ────────────────────────────────────────────────────────────────────

  Object.freeze({
    id:                 'chaos_spike',
    label:              'Chaos Spike',
    description:        'Trigger an immediate chaos event. Score bonus if survived.',
    tags:               Object.freeze(['shooter', 'snake', 'breakout', 'maze', 'physics']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze(['graffpunks', 'unaligned']),
    rarity:             'rare',
    category:           'chaos',
    effectType:         'trigger_chaos_event',
    duration:           0,
    stackLimit:         2,
  }),

  Object.freeze({
    id:                 'risk_multiplier',
    label:              'Risk Multiplier',
    description:        'Risk/reward choices pay +20% more this run.',
    tags:               Object.freeze(['shooter', 'snake', 'breakout', 'maze', 'physics', 'puzzle', 'racing']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze(['graffpunks', 'unaligned']),
    rarity:             'uncommon',
    category:           'chaos',
    effectType:         'risk_reward_boost',
    duration:           0,
    stackLimit:         2,
  }),

  Object.freeze({
    id:                 'graffpunk_surge',
    label:              'GraffPUNK Surge',
    description:        '+25% combo value for 15s. Chaos rate increases.',
    tags:               Object.freeze(['shooter', 'snake', 'breakout', 'maze', 'physics', 'puzzle']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze(['graffpunks']),
    rarity:             'rare',
    category:           'chaos',
    effectType:         'combo_chaos_burst',
    duration:           15,
    stackLimit:         2,
  }),

  Object.freeze({
    id:                 'pressure_overload',
    label:              'Pressure Overload',
    description:        'Chaos pressure maxed for 10s. Score is doubled during this window.',
    tags:               Object.freeze(['shooter', 'snake', 'breakout', 'physics']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze(['graffpunks']),
    rarity:             'legendary',
    category:           'chaos',
    effectType:         'max_pressure_double_score',
    duration:           10,
    stackLimit:         1,
  }),

  // ── Faction ──────────────────────────────────────────────────────────────────

  Object.freeze({
    id:                 'diamond_hold',
    label:              'Diamond Hold',
    description:        'Endurance bonus activates 10s earlier this run.',
    tags:               Object.freeze(['shooter', 'snake', 'breakout', 'maze', 'physics', 'puzzle']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze(['diamond-hands']),
    rarity:             'rare',
    category:           'faction',
    effectType:         'endurance_early_activation',
    duration:           0,
    stackLimit:         1,
  }),

  Object.freeze({
    id:                 'hodl_guard',
    label:              'HODL Guard',
    description:        'Next shield break is blocked once (auto-block).',
    tags:               Object.freeze(['shooter', 'snake', 'breakout', 'physics']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze(['hodl-warriors']),
    rarity:             'rare',
    category:           'faction',
    effectType:         'auto_block_next_hit',
    duration:           0,
    stackLimit:         1,
  }),

  Object.freeze({
    id:                 'graffpunk_burst',
    label:              'GraffPUNK Burst',
    description:        'Rare spawn chance +10%. Next combo multiplier counts double.',
    tags:               Object.freeze(['shooter', 'snake', 'breakout', 'maze', 'physics', 'puzzle']),
    compatibleGames:    Object.freeze([]),
    compatibleFactions: Object.freeze(['graffpunks']),
    rarity:             'rare',
    category:           'faction',
    effectType:         'rare_bias_combo_double',
    duration:           0,
    stackLimit:         1,
  }),

]);

// ── Internal lookup ───────────────────────────────────────────────────────────

var _byId = new Map(ARCADE_UPGRADE_DEFS.map(function (u) { return [u.id, u]; }));

var _byCategory = {};
ARCADE_UPGRADE_DEFS.forEach(function (u) {
  if (!_byCategory[u.category]) _byCategory[u.category] = [];
  _byCategory[u.category].push(u);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return a single upgrade def by id.
 * @param {string} id
 * @returns {object|null}
 */
export function getUpgradeById(id) {
  return _byId.get(id) || null;
}

/**
 * Return all upgrades for a category.
 * @param {string} category — one of UPGRADE_CATEGORIES values
 * @returns {object[]}
 */
export function getUpgradesByCategory(category) {
  return (_byCategory[category] || []).slice();
}

/**
 * Return 3 faction-aware upgrade choices for a game.
 *
 * Selection rules:
 *  1. Filter to upgrades compatible with this game (tags or compatibleGames).
 *  2. Filter out upgrades incompatible with this faction.
 *  3. Bias toward the faction's preferred category order.
 *  4. Always try to include at least one survival, one score/combo, one rare/chaos.
 *  5. Return exactly 3 (or fewer if the filtered pool is too small).
 *
 * @param {object} opts
 * @param {string}   opts.gameId         — current game id (e.g. 'invaders')
 * @param {string}   opts.factionId      — current player faction
 * @param {string[]} [opts.modifierTags] — game's crossGameTags
 * @param {object}   [opts.currentRunState] — optional run context (wave, score, elapsed)
 * @returns {object[]} array of 0–3 upgrade defs (frozen)
 */
export function getUpgradeChoices(opts) {
  var gameId      = (opts && opts.gameId)      || '';
  var factionId   = _normaliseFaction((opts && opts.factionId) || '');
  var tags        = Array.isArray(opts && opts.modifierTags) ? opts.modifierTags : [];

  // Filter: compatible with this game's tags or explicitly listed
  var pool = ARCADE_UPGRADE_DEFS.filter(function (u) {
    // Tag compatibility check
    var tagMatch = u.tags.some(function (t) { return tags.indexOf(t) !== -1; });
    // Explicit game list (empty = all games)
    var gameMatch = u.compatibleGames.length === 0 || u.compatibleGames.indexOf(gameId) !== -1;
    if (!tagMatch && !gameMatch) return false;
    // Faction check (empty = all factions)
    if (u.compatibleFactions.length > 0) {
      return u.compatibleFactions.indexOf(factionId) !== -1;
    }
    return true;
  });

  if (pool.length === 0) return [];

  // Build biased list: try to pick 1 from each preferred category bucket, then fill randomly
  var bias = UPGRADE_CATEGORY_BIAS[factionId] || UPGRADE_CATEGORY_BIAS['unaligned'];
  var selected = [];
  var used = new Set();

  // Pick one from each preferred category in order
  for (var bi = 0; bi < bias.length && selected.length < 3; bi++) {
    var cat = bias[bi];
    var catPool = pool.filter(function (u) { return u.category === cat && !used.has(u.id); });
    if (catPool.length === 0) continue;
    var pick = catPool[Math.floor(Math.random() * catPool.length)];
    selected.push(pick);
    used.add(pick.id);
  }

  // Fill remaining slots from any category
  if (selected.length < 3) {
    var remaining = pool.filter(function (u) { return !used.has(u.id); });
    _shuffle(remaining);
    for (var ri = 0; ri < remaining.length && selected.length < 3; ri++) {
      selected.push(remaining[ri]);
      used.add(remaining[ri].id);
    }
  }

  return selected;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _normaliseFaction(id) {
  var v = String(id || 'unaligned').toLowerCase().trim();
  if (v === 'diamond_hands' || v === 'diamondhands') return 'diamond-hands';
  if (v === 'hodl_warriors' || v === 'hodlwarriors') return 'hodl-warriors';
  if (v === 'graff-punks' || v === 'graff_punks') return 'graffpunks';
  if (UPGRADE_CATEGORY_BIAS[v]) return v;
  return 'unaligned';
}

function _shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
}
