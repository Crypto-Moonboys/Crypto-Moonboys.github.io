/**
 * faction-reward-system.js — Faction reward and perk eligibility layer.
 *
 * Defines static faction reward tracks and perk metadata, and can combine them
 * with existing faction standings data from window.MOONBOYS_WAR_DATA when
 * building visible status rewards and roguelite perk eligibility.
 *
 * This is a display/perk eligibility layer ONLY.
 *   - Does NOT alter Arcade XP math.
 *   - Does NOT call score submission functions.
 *   - Does NOT call progress queue functions.
 *   - Does NOT bypass the leaderboard accepted-score flow.
 *   - xpModifier from faction-effect-system.js remains metadata/display only.
 *
 * All rewards are gameplay/status rewards: clout, badges, stickers, titles,
 * and roguelite branch eligibility. They are not money, not tokens, not
 * guaranteed, and not investment products of any kind.
 *
 * Public API:
 *   FACTION_REWARD_DEFS                    — frozen definitions for all 9 factions
 *   getFactionRewardState(factionId)        — combined reward state for a faction
 *   getWeeklyFactionRewards(factionId)      — weekly reward data
 *   getMonthlyFactionRewards(factionId)     — monthly reward data
 *   getSeasonalFactionRewards(factionId)    — seasonal reward data
 *   getFactionTitleTrack(factionId)         — title ladder
 *   getFactionBadgeTrack(factionId)         — badge track
 *   getFactionStickerTrack(factionId)       — sticker track
 *   getUnlockedRoguelitePerks(factionId)    — roguelite perk eligibility list
 *   getFactionRewardSummary(factionId)      — complete summary for bridge/renderers
 */

// ── Canonical faction keys ────────────────────────────────────────────────────

export const LIVE_FACTION_REWARD_KEYS = Object.freeze([
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

// ── Roguelite perk eligibility keys ──────────────────────────────────────────

export const ROGUELITE_PERK_KEYS = Object.freeze([
  'extra_daily_branch',
  'bonus_rabbit_hole_choice',
  'faction_mission_slot',
  'featured_clout_spotlight',
  'weekly_comeback_branch',
  'seasonal_elite_path',
  'rare_event_bias_display',
]);

// ── Faction reward definitions ────────────────────────────────────────────────

/**
 * All faction reward definitions. Frozen so no game can mutate at runtime.
 *
 * Fields per entry:
 *   weekly   — weekly badge, placement eligibility, roguelite perk, spotlight
 *   monthly  — border, title, sticker, chamber placement, champion board
 *   seasonal — trophy, title, hall of fame, sticker set, badge, elite path
 *   personal — joined badge, first mission, daily streak, weekly contrib, titles
 *   roguelite — array of eligible perk keys (display/eligibility only)
 *
 * Copy note:
 *   "Win the week. Own the chamber."
 *   "Monthly clout puts your faction on the board."
 *   "Seasonal winners become part of the Battle Chamber record."
 *   "Badges, stickers, titles, and roguelite options prove your faction moved."
 *   "Faction rewards are gameplay/status rewards only."
 */
export const FACTION_REWARD_DEFS = Object.freeze({

  'hard-fork-rockers': Object.freeze({
    weekly: Object.freeze({
      badge: 'Long Run Survivor',
      placement: 'Weekly top faction placement eligible',
      roguelitePerk: 'extra_daily_branch',
      spotlight: 'Faction proof-feed spotlight eligible',
      pageHighlight: 'Temporary faction page highlight eligible',
      xpPoolEligibility: 'XP prize pool eligibility wording where active',
    }),
    monthly: Object.freeze({
      border: 'Monthly profile border eligible',
      title: 'Chainbreaker Headliner',
      sticker: 'Endurance sticker unlock eligible',
      chamberPlacement: 'Battle Chamber featured placement eligible',
      championBoard: 'Monthly faction champion board eligible',
    }),
    seasonal: Object.freeze({
      trophy: 'Fork Amplifier',
      title: 'Seasonal endurance champion title eligible',
      hallOfFame: 'Hall of Fame record eligible',
      stickerSet: 'Rare endurance sticker set eligible',
      badge: 'Seasonal clout badge eligible',
      elitePath: 'seasonal_elite_path',
    }),
    personal: Object.freeze({
      joinBadge: 'Hard Fork Rockers member badge',
      firstMissionBadge: 'First mission complete badge',
      dailyStreakBadge: 'Daily mission streak badge',
      weeklyContribBadge: 'Weekly contributor badge',
      loyalistTitle: 'Hard Fork Loyalist',
      eliteTitle: 'Hard Fork Elite',
    }),
    roguelite: Object.freeze([
      'extra_daily_branch',
      'bonus_rabbit_hole_choice',
      'faction_mission_slot',
    ]),
    badgeTrack: Object.freeze(['Cracked Fork Guitar', 'Neon Amp Sigil', 'Chainbreak Crest', 'Long Run Survivor']),
    stickerTrack: Object.freeze(['Amp Pulse', 'Forkline Tag', 'Roadcase Skull']),
    titleTrack: Object.freeze(['Roadie', 'Amp Runner', 'Fork Rocker', 'Chainbreaker', 'Chainbreaker Headliner']),
  }),

  'rugpull-minors': Object.freeze({
    weekly: Object.freeze({
      badge: 'Deep Shaft Survivor',
      placement: 'Weekly top faction placement eligible',
      roguelitePerk: 'weekly_comeback_branch',
      spotlight: 'Faction proof-feed spotlight eligible',
      pageHighlight: 'Temporary faction page highlight eligible',
      xpPoolEligibility: 'XP prize pool eligibility wording where active',
    }),
    monthly: Object.freeze({
      border: 'Monthly profile border eligible',
      title: 'Rugproof Captain',
      sticker: 'Recovery sticker unlock eligible',
      chamberPlacement: 'Battle Chamber featured placement eligible',
      championBoard: 'Monthly faction champion board eligible',
    }),
    seasonal: Object.freeze({
      trophy: 'Vault Miner',
      title: 'Seasonal comeback champion title eligible',
      hallOfFame: 'Hall of Fame record eligible',
      stickerSet: 'Rare recovery sticker set eligible',
      badge: 'Seasonal clout badge eligible',
      elitePath: 'seasonal_elite_path',
    }),
    personal: Object.freeze({
      joinBadge: 'Rugpull Minors member badge',
      firstMissionBadge: 'First mission complete badge',
      dailyStreakBadge: 'Daily mission streak badge',
      weeklyContribBadge: 'Weekly contributor badge',
      loyalistTitle: 'Rugpull Loyalist',
      eliteTitle: 'Rugpull Elite',
    }),
    roguelite: Object.freeze([
      'weekly_comeback_branch',
      'bonus_rabbit_hole_choice',
      'faction_mission_slot',
    ]),
    badgeTrack: Object.freeze(['Mining Helmet', 'Cracked Pickaxe', 'Deep Vault Sigil', 'Deep Shaft Survivor']),
    stickerTrack: Object.freeze(['Warning Sign', 'Vault Cart', 'Tunnel Marker']),
    titleTrack: Object.freeze(['Tunnel Rat', 'Miner', 'Shaft Runner', 'Rugproof', 'Rugproof Captain']),
  }),

  graffpunks: Object.freeze({
    weekly: Object.freeze({
      badge: 'Chaos Tagger',
      placement: 'Weekly top faction placement eligible',
      roguelitePerk: 'bonus_rabbit_hole_choice',
      spotlight: 'Faction proof-feed spotlight eligible',
      pageHighlight: 'Temporary faction page highlight eligible',
      xpPoolEligibility: 'XP prize pool eligibility wording where active',
    }),
    monthly: Object.freeze({
      border: 'Monthly profile border eligible',
      title: 'All-City Burner',
      sticker: 'Chaos sticker unlock eligible',
      chamberPlacement: 'Battle Chamber featured placement eligible',
      championBoard: 'Monthly faction champion board eligible',
    }),
    seasonal: Object.freeze({
      trophy: 'Wall King',
      title: 'Seasonal chaos champion title eligible',
      hallOfFame: 'Hall of Fame record eligible',
      stickerSet: 'Rare chaos sticker set eligible',
      badge: 'Seasonal clout badge eligible',
      elitePath: 'seasonal_elite_path',
    }),
    personal: Object.freeze({
      joinBadge: 'GraffPUNKS member badge',
      firstMissionBadge: 'First mission complete badge',
      dailyStreakBadge: 'Daily mission streak badge',
      weeklyContribBadge: 'Weekly contributor badge',
      loyalistTitle: 'GraffPUNKS Loyalist',
      eliteTitle: 'GraffPUNKS Elite',
    }),
    roguelite: Object.freeze([
      'bonus_rabbit_hole_choice',
      'rare_event_bias_display',
      'faction_mission_slot',
    ]),
    badgeTrack: Object.freeze(['Spray Can Crest', 'Crown Tag Emblem', 'Chaos Wall Stamp', 'Chaos Tagger']),
    stickerTrack: Object.freeze(['Burner Wall', 'Stencil Burst', 'Tag Trail']),
    titleTrack: Object.freeze(['Tagger', 'Burner', 'Wall Runner', 'Chaos Writer', 'All-City Burner']),
  }),

  'blockchain-furies': Object.freeze({
    weekly: Object.freeze({
      badge: 'Fury Spark',
      placement: 'Weekly top faction placement eligible',
      roguelitePerk: 'bonus_rabbit_hole_choice',
      spotlight: 'Faction proof-feed spotlight eligible',
      pageHighlight: 'Temporary faction page highlight eligible',
      xpPoolEligibility: 'XP prize pool eligibility wording where active',
    }),
    monthly: Object.freeze({
      border: 'Monthly profile border eligible',
      title: 'Chain Striker',
      sticker: 'Fury sticker unlock eligible',
      chamberPlacement: 'Battle Chamber featured placement eligible',
      championBoard: 'Monthly faction champion board eligible',
    }),
    seasonal: Object.freeze({
      trophy: 'Storm Node',
      title: 'Seasonal momentum champion title eligible',
      hallOfFame: 'Hall of Fame record eligible',
      stickerSet: 'Rare fury sticker set eligible',
      badge: 'Seasonal clout badge eligible',
      elitePath: 'seasonal_elite_path',
    }),
    personal: Object.freeze({
      joinBadge: 'Blockchain Furies member badge',
      firstMissionBadge: 'First mission complete badge',
      dailyStreakBadge: 'Daily mission streak badge',
      weeklyContribBadge: 'Weekly contributor badge',
      loyalistTitle: 'Blockchain Furies Loyalist',
      eliteTitle: 'Blockchain Furies Elite',
    }),
    roguelite: Object.freeze([
      'bonus_rabbit_hole_choice',
      'weekly_comeback_branch',
      'faction_mission_slot',
    ]),
    badgeTrack: Object.freeze(['Flaming Chain', 'Lightning Block', 'Fury Mask', 'Fury Spark']),
    stickerTrack: Object.freeze(['Heat Arc', 'Chain Spark', 'Burn Tag']),
    titleTrack: Object.freeze(['Spark', 'Fury Runner', 'Chain Striker', 'Rage Node', 'Storm Captain']),
  }),

  'crypto-moongirls': Object.freeze({
    weekly: Object.freeze({
      badge: 'Lunar Signal',
      placement: 'Weekly top faction placement eligible',
      roguelitePerk: 'featured_clout_spotlight',
      spotlight: 'Faction proof-feed spotlight eligible',
      pageHighlight: 'Temporary faction page highlight eligible',
      xpPoolEligibility: 'XP prize pool eligibility wording where active',
    }),
    monthly: Object.freeze({
      border: 'Monthly profile border eligible',
      title: 'Moon Commander',
      sticker: 'Lunar sticker unlock eligible',
      chamberPlacement: 'Battle Chamber featured placement eligible',
      championBoard: 'Monthly faction champion board eligible',
    }),
    seasonal: Object.freeze({
      trophy: "Queen's Crest",
      title: 'Seasonal precision champion title eligible',
      hallOfFame: 'Hall of Fame record eligible',
      stickerSet: 'Rare lunar sticker set eligible',
      badge: 'Seasonal clout badge eligible',
      elitePath: 'seasonal_elite_path',
    }),
    personal: Object.freeze({
      joinBadge: 'Crypto Moongirls member badge',
      firstMissionBadge: 'First mission complete badge',
      dailyStreakBadge: 'Daily mission streak badge',
      weeklyContribBadge: 'Weekly contributor badge',
      loyalistTitle: 'Moongirls Loyalist',
      eliteTitle: 'Moongirls Elite',
    }),
    roguelite: Object.freeze([
      'featured_clout_spotlight',
      'faction_mission_slot',
      'extra_daily_branch',
    ]),
    badgeTrack: Object.freeze(['Moon Crown', 'Signal Blade', 'Lunar Crest', 'Lunar Signal']),
    stickerTrack: Object.freeze(['Signal Arc', 'Night Crest', 'Moonline Frame']),
    titleTrack: Object.freeze(['Moon Recruit', 'Signal Siren', 'Lunar Elite', "Queen's Blade", 'Moon Commander']),
  }),

  blockstars: Object.freeze({
    weekly: Object.freeze({
      badge: 'Spotlight Runner',
      placement: 'Weekly top faction placement eligible',
      roguelitePerk: 'featured_clout_spotlight',
      spotlight: 'Faction proof-feed spotlight eligible',
      pageHighlight: 'Temporary faction page highlight eligible',
      xpPoolEligibility: 'XP prize pool eligibility wording where active',
    }),
    monthly: Object.freeze({
      border: 'Monthly profile border eligible',
      title: 'Headline Icon',
      sticker: 'Spotlight sticker unlock eligible',
      chamberPlacement: 'Battle Chamber featured placement eligible',
      championBoard: 'Monthly faction champion board eligible',
    }),
    seasonal: Object.freeze({
      trophy: 'Star Block',
      title: 'Seasonal spotlight champion title eligible',
      hallOfFame: 'Hall of Fame record eligible',
      stickerSet: 'Rare spotlight sticker set eligible',
      badge: 'Seasonal clout badge eligible',
      elitePath: 'seasonal_elite_path',
    }),
    personal: Object.freeze({
      joinBadge: 'The Blockstars member badge',
      firstMissionBadge: 'First mission complete badge',
      dailyStreakBadge: 'Daily mission streak badge',
      weeklyContribBadge: 'Weekly contributor badge',
      loyalistTitle: 'Blockstars Loyalist',
      eliteTitle: 'Blockstars Elite',
    }),
    roguelite: Object.freeze([
      'featured_clout_spotlight',
      'extra_daily_branch',
      'faction_mission_slot',
    ]),
    badgeTrack: Object.freeze(['Star Block', 'Stage Lights', 'Clout Mic Crest', 'Spotlight Runner']),
    stickerTrack: Object.freeze(['Spotlight Frame', 'Showtime Banner', 'Headline Tag']),
    titleTrack: Object.freeze(['Rookie Star', 'Spotlight Runner', 'Chart Climber', 'Block Celebrity', 'Headline Icon']),
  }),

  'all-city-bulls': Object.freeze({
    weekly: Object.freeze({
      badge: 'Board Smasher',
      placement: 'Weekly top faction placement eligible',
      roguelitePerk: 'extra_daily_branch',
      spotlight: 'Faction proof-feed spotlight eligible',
      pageHighlight: 'Temporary faction page highlight eligible',
      xpPoolEligibility: 'XP prize pool eligibility wording where active',
    }),
    monthly: Object.freeze({
      border: 'Monthly profile border eligible',
      title: 'All-City Charger',
      sticker: 'Bull sticker unlock eligible',
      chamberPlacement: 'Battle Chamber featured placement eligible',
      championBoard: 'Monthly faction champion board eligible',
    }),
    seasonal: Object.freeze({
      trophy: 'Bull Horn Crown',
      title: 'Seasonal score pressure champion title eligible',
      hallOfFame: 'Hall of Fame record eligible',
      stickerSet: 'Rare bull sticker set eligible',
      badge: 'Seasonal clout badge eligible',
      elitePath: 'seasonal_elite_path',
    }),
    personal: Object.freeze({
      joinBadge: 'All City Bulls member badge',
      firstMissionBadge: 'First mission complete badge',
      dailyStreakBadge: 'Daily mission streak badge',
      weeklyContribBadge: 'Weekly contributor badge',
      loyalistTitle: 'All City Bulls Loyalist',
      eliteTitle: 'All City Bulls Elite',
    }),
    roguelite: Object.freeze([
      'extra_daily_branch',
      'bonus_rabbit_hole_choice',
      'faction_mission_slot',
    ]),
    badgeTrack: Object.freeze(['Bull Horn Crest', 'Cracked Scoreboard', 'Charge Sigil', 'Board Smasher']),
    stickerTrack: Object.freeze(['Charging Bull', 'Board Break', 'Territory Stamp']),
    titleTrack: Object.freeze(['Bull Runner', 'Wall Smasher', 'Score Bruiser', 'All-City Charger', 'Board Breaker']),
  }),

  'nomad-bears': Object.freeze({
    weekly: Object.freeze({
      badge: 'Route Walker',
      placement: 'Weekly top faction placement eligible',
      roguelitePerk: 'extra_daily_branch',
      spotlight: 'Faction proof-feed spotlight eligible',
      pageHighlight: 'Temporary faction page highlight eligible',
      xpPoolEligibility: 'XP prize pool eligibility wording where active',
    }),
    monthly: Object.freeze({
      border: 'Monthly profile border eligible',
      title: 'Path King',
      sticker: 'Nomad sticker unlock eligible',
      chamberPlacement: 'Battle Chamber featured placement eligible',
      championBoard: 'Monthly faction champion board eligible',
    }),
    seasonal: Object.freeze({
      trophy: 'Compass Heavy',
      title: 'Seasonal variety champion title eligible',
      hallOfFame: 'Hall of Fame record eligible',
      stickerSet: 'Rare nomad sticker set eligible',
      badge: 'Seasonal clout badge eligible',
      elitePath: 'seasonal_elite_path',
    }),
    personal: Object.freeze({
      joinBadge: 'Nomad Bears member badge',
      firstMissionBadge: 'First mission complete badge',
      dailyStreakBadge: 'Daily mission streak badge',
      weeklyContribBadge: 'Weekly contributor badge',
      loyalistTitle: 'Nomad Bears Loyalist',
      eliteTitle: 'Nomad Bears Elite',
    }),
    roguelite: Object.freeze([
      'extra_daily_branch',
      'faction_mission_slot',
      'rare_event_bias_display',
    ]),
    badgeTrack: Object.freeze(['Bear Paw Crest', 'Compass Seal', 'Route Map Badge', 'Route Walker']),
    stickerTrack: Object.freeze(['Travel Pack', 'Path Marker', 'Trail Stamp']),
    titleTrack: Object.freeze(['Trail Cub', 'Route Walker', 'Map Breaker', 'Nomad Heavy', 'Path King']),
  }),

  'crypto-stoned-boys': Object.freeze({
    weekly: Object.freeze({
      badge: 'Weird Luck',
      placement: 'Weekly top faction placement eligible',
      roguelitePerk: 'rare_event_bias_display',
      spotlight: 'Faction proof-feed spotlight eligible',
      pageHighlight: 'Temporary faction page highlight eligible',
      xpPoolEligibility: 'XP prize pool eligibility wording where active',
    }),
    monthly: Object.freeze({
      border: 'Monthly profile border eligible',
      title: 'Cosmic Couch Boss',
      sticker: 'Chill sticker unlock eligible',
      chamberPlacement: 'Battle Chamber featured placement eligible',
      championBoard: 'Monthly faction champion board eligible',
    }),
    seasonal: Object.freeze({
      trophy: 'Haze Dice',
      title: 'Seasonal randomizer champion title eligible',
      hallOfFame: 'Hall of Fame record eligible',
      stickerSet: 'Rare chill sticker set eligible',
      badge: 'Seasonal clout badge eligible',
      elitePath: 'seasonal_elite_path',
    }),
    personal: Object.freeze({
      joinBadge: 'Crypto Stoned Boys member badge',
      firstMissionBadge: 'First mission complete badge',
      dailyStreakBadge: 'Daily mission streak badge',
      weeklyContribBadge: 'Weekly contributor badge',
      loyalistTitle: 'Crypto Stoned Boys Loyalist',
      eliteTitle: 'Crypto Stoned Boys Elite',
    }),
    roguelite: Object.freeze([
      'rare_event_bias_display',
      'bonus_rabbit_hole_choice',
      'faction_mission_slot',
    ]),
    badgeTrack: Object.freeze(['Pixel Cloud', 'Weird Dice', 'Cosmic Couch Emblem', 'Weird Luck']),
    stickerTrack: Object.freeze(['Lucky Lighter', 'Haze Trail', 'Glitch Puff']),
    titleTrack: Object.freeze(['Chill Starter', 'Haze Runner', 'Weird Luck', 'Random King', 'Cosmic Couch Boss']),
  }),

});

// ── Normalise faction key ─────────────────────────────────────────────────────

function _normalise(factionId) {
  var v = String(factionId || 'unaligned').toLowerCase().trim();
  if (v === 'diamond-hands' || v === 'diamond_hands' || v === 'diamondhands') return 'hard-fork-rockers';
  if (v === 'hodl-warriors' || v === 'hodl_warriors' || v === 'hodlwarriors') return 'rugpull-minors';
  if (v === 'graff-punks' || v === 'graff_punks') return 'graffpunks';
  return FACTION_REWARD_DEFS[v] ? v : null;
}

function _resolve(factionId) {
  var key = _normalise(factionId);
  return key ? FACTION_REWARD_DEFS[key] : null;
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Return the weekly reward data for a faction.
 * @param {string} factionId
 * @returns {object|null}
 */
export function getWeeklyFactionRewards(factionId) {
  var def = _resolve(factionId);
  return def ? def.weekly : null;
}

/**
 * Return the monthly reward data for a faction.
 * @param {string} factionId
 * @returns {object|null}
 */
export function getMonthlyFactionRewards(factionId) {
  var def = _resolve(factionId);
  return def ? def.monthly : null;
}

/**
 * Return the seasonal reward data for a faction.
 * @param {string} factionId
 * @returns {object|null}
 */
export function getSeasonalFactionRewards(factionId) {
  var def = _resolve(factionId);
  return def ? def.seasonal : null;
}

/**
 * Return the title track for a faction.
 * @param {string} factionId
 * @returns {ReadonlyArray<string>|null}
 */
export function getFactionTitleTrack(factionId) {
  var def = _resolve(factionId);
  return def ? def.titleTrack : null;
}

/**
 * Return the badge track for a faction.
 * @param {string} factionId
 * @returns {ReadonlyArray<string>|null}
 */
export function getFactionBadgeTrack(factionId) {
  var def = _resolve(factionId);
  return def ? def.badgeTrack : null;
}

/**
 * Return the sticker track for a faction.
 * @param {string} factionId
 * @returns {ReadonlyArray<string>|null}
 */
export function getFactionStickerTrack(factionId) {
  var def = _resolve(factionId);
  return def ? def.stickerTrack : null;
}

/**
 * Return the roguelite perk eligibility list for a faction.
 * These are eligibility indicators only — they do not alter XP math.
 * @param {string} factionId
 * @returns {ReadonlyArray<string>|null}
 */
export function getUnlockedRoguelitePerks(factionId) {
  var def = _resolve(factionId);
  return def ? def.roguelite : null;
}

/**
 * Return the combined reward state for a faction.
 * Optionally reads window globals for dynamic standings data.
 * Safe to call in Node.js — window globals are guarded.
 *
 * @param {string} factionId
 * @returns {object|null}
 */
export function getFactionRewardState(factionId) {
  var key = _normalise(factionId);
  var def = key ? FACTION_REWARD_DEFS[key] : null;
  if (!def) return null;

  var standingsRow = null;
  try {
    if (typeof window !== 'undefined' && window.MOONBOYS_WAR_DATA && Array.isArray(window.MOONBOYS_WAR_DATA.standings)) {
      var standings = window.MOONBOYS_WAR_DATA.standings;
      for (var i = 0; i < standings.length; i++) {
        if (standings[i].faction === key) { standingsRow = standings[i]; break; }
      }
    }
  } catch (_) {}

  return {
    factionId: key,
    weekly: def.weekly,
    monthly: def.monthly,
    seasonal: def.seasonal,
    personal: def.personal,
    roguelite: def.roguelite,
    badgeTrack: def.badgeTrack,
    stickerTrack: def.stickerTrack,
    titleTrack: def.titleTrack,
    standings: standingsRow,
  };
}

/**
 * Return a complete reward summary for a faction.
 * Used by the bridge to populate window.MOONBOYS_FACTION_REWARD_DATA.
 *
 * @param {string} factionId
 * @returns {object}
 */
export function getFactionRewardSummary(factionId) {
  var key = _normalise(factionId);
  var def = key ? FACTION_REWARD_DEFS[key] : null;
  if (!def) {
    return { factionId: factionId || 'unaligned', weekly: null, monthly: null, seasonal: null, personal: null, roguelite: [] };
  }
  return {
    factionId: key,
    weekly: def.weekly,
    monthly: def.monthly,
    seasonal: def.seasonal,
    personal: def.personal,
    roguelite: def.roguelite,
    badgeTrack: def.badgeTrack,
    stickerTrack: def.stickerTrack,
    titleTrack: def.titleTrack,
  };
}
