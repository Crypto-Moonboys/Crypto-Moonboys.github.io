/**
 * battle-chamber-faction-bridge.js — ES module bridge for the Battle Chamber renderer.
 *
 * Imports real data from the existing ES-module faction systems and exposes it
 * on safe window caches so that battle-chamber-factions.js (a non-module IIFE)
 * can read current faction state without duplicating logic.
 *
 * Window globals set by this bridge:
 *   window.MOONBOYS_WAR_DATA           — { standings: Array<{faction,power,daily,weekly,momentum}> }
 *   window.MOONBOYS_MISSION_DATA       — { [factionKey]: { daily: Mission[], progress: {}, completed: [] } }
 *   window.FACTION_EFFECT_DEFS         — same object as FACTION_DEFS from faction-effect-system.js
 *   window.MOONBOYS_FACTION_REWARD_DATA — { factions: { [key]: rewardSummary }, updatedAt: number }
 *
 * After populating those caches, the bridge dispatches:
 *   CustomEvent('battle-chamber:faction-data-ready') on window
 *   CustomEvent('battle-chamber:faction-rewards-ready') on window
 *
 * battle-chamber-factions.js listens for those events and re-renders all sections
 * with real data instead of the initial zero-value placeholders.
 *
 * All faction system imports are from their canonical paths.  This bridge must
 * never alter the faction logic — it is read-only.
 */

import {
  getFactionStandings,
  getDominantFaction,
  getDailyContribution,
  getWeeklyContribution,
  getMomentum,
} from '/js/arcade/systems/faction-war-system.js';

import {
  getDailyMissions,
  getSeasonalMissions,
  getMissionProgress,
  getCompletedMissions,
} from '/js/arcade/systems/faction-missions.js';

import {
  FACTION_DEFS,
  getFactionEffects,
  getXpModifierMeta,
} from '/js/arcade/systems/faction-effect-system.js';

import {
  getFactionRewardSummary,
} from '/js/arcade/systems/faction-reward-system.js';

// ── Canonical faction keys ────────────────────────────────────────────────────

const LIVE_FACTION_KEYS = [
  'hard-fork-rockers',
  'rugpull-minors',
  'graffpunks',
  'blockchain-furies',
  'crypto-moongirls',
  'blockstars',
  'all-city-bulls',
  'nomad-bears',
  'crypto-stoned-boys',
];

// ── Populate window.MOONBOYS_FACTION_REWARD_DATA ──────────────────────────────

function buildRewardData() {
  function emptyRewardSummary(key) {
    return {
      factionId: key,
      weekly: {},
      monthly: {},
      seasonal: {},
      personal: {},
      badgeTrack: [],
      stickerTrack: [],
      titleTrack: [],
      roguelite: [],
    };
  }

  function normaliseRewardSummary(key, summary) {
    const base = emptyRewardSummary(key);
    if (!summary || typeof summary !== 'object') return base;
    return {
      factionId: key,
      weekly: summary.weekly && typeof summary.weekly === 'object' ? summary.weekly : base.weekly,
      monthly: summary.monthly && typeof summary.monthly === 'object' ? summary.monthly : base.monthly,
      seasonal: summary.seasonal && typeof summary.seasonal === 'object' ? summary.seasonal : base.seasonal,
      personal: summary.personal && typeof summary.personal === 'object' ? summary.personal : base.personal,
      badgeTrack: Array.isArray(summary.badgeTrack) ? summary.badgeTrack : base.badgeTrack,
      stickerTrack: Array.isArray(summary.stickerTrack) ? summary.stickerTrack : base.stickerTrack,
      titleTrack: Array.isArray(summary.titleTrack) ? summary.titleTrack : base.titleTrack,
      roguelite: Array.isArray(summary.roguelite) ? summary.roguelite : base.roguelite,
    };
  }

  const factions = {};
  for (const key of LIVE_FACTION_KEYS) {
    try {
      factions[key] = normaliseRewardSummary(key, getFactionRewardSummary(key));
    } catch (_) {
      factions[key] = emptyRewardSummary(key);
    }
  }
  return { factions, updatedAt: Date.now() };
}

// ── Populate window.MOONBOYS_WAR_DATA ─────────────────────────────────────────

function buildWarData() {
  try {
    const standings = getFactionStandings();
    return { standings, dominantFaction: getDominantFaction() };
  } catch (_) {
    return { standings: LIVE_FACTION_KEYS.map(function (key) {
      return { faction: key, power: 0, daily: 0, weekly: 0, momentum: 0 };
    }), dominantFaction: 'hard-fork-rockers' };
  }
}

// ── Populate window.MOONBOYS_MISSION_DATA ─────────────────────────────────────

function buildMissionData() {
  const data = {};
  for (const key of LIVE_FACTION_KEYS) {
    try {
      const daily = getDailyMissions(key);
      const seasonal = getSeasonalMissions(key);
      const completed = getCompletedMissions(key);
      const progress = {};
      for (const m of daily) {
        progress[m.id] = getMissionProgress(key, m.id);
      }
      data[key] = { daily, seasonal, completed, progress };
    } catch (_) {
      data[key] = { daily: [], seasonal: [], completed: [], progress: {} };
    }
  }
  return data;
}

// ── Hydrate and dispatch ──────────────────────────────────────────────────────

function hydrate() {
  window.MOONBOYS_WAR_DATA = buildWarData();
  window.MOONBOYS_MISSION_DATA = buildMissionData();
  // Expose FACTION_DEFS as FACTION_EFFECT_DEFS (consistent with renderer expectation)
  window.FACTION_EFFECT_DEFS = FACTION_DEFS;
  // Expose reward data for Battle Chamber renderers
  window.MOONBOYS_FACTION_REWARD_DATA = buildRewardData();

  window.dispatchEvent(new CustomEvent('battle-chamber:faction-data-ready', {
    detail: {
      warData: window.MOONBOYS_WAR_DATA,
      missionData: window.MOONBOYS_MISSION_DATA,
      factionDefs: window.FACTION_EFFECT_DEFS,
    },
  }));

  window.dispatchEvent(new CustomEvent('battle-chamber:faction-rewards-ready', {
    detail: {
      rewardData: window.MOONBOYS_FACTION_REWARD_DATA,
    },
  }));
}

// Run after DOM is ready so the renderer's hook containers exist
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrate);
} else {
  hydrate();
}
