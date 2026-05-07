/**
 * battle-chamber-faction-bridge.js — ES module bridge for the Battle Chamber renderer.
 *
 * Imports real data from the existing ES-module faction systems and exposes it
 * on safe window caches so that battle-chamber-factions.js (a non-module IIFE)
 * can read current faction state without duplicating logic.
 *
 * Window globals set by this bridge:
 *   window.MOONBOYS_WAR_DATA   — { standings: Array<{faction,power,daily,weekly,momentum}> }
 *   window.MOONBOYS_MISSION_DATA — { [factionKey]: { daily: Mission[], progress: {}, completed: [] } }
 *   window.FACTION_EFFECT_DEFS — same object as FACTION_DEFS from faction-effect-system.js
 *
 * After populating those caches, the bridge dispatches:
 *   CustomEvent('battle-chamber:faction-data-ready') on window
 *
 * battle-chamber-factions.js listens for that event and re-renders all sections
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

  window.dispatchEvent(new CustomEvent('battle-chamber:faction-data-ready', {
    detail: {
      warData: window.MOONBOYS_WAR_DATA,
      missionData: window.MOONBOYS_MISSION_DATA,
      factionDefs: window.FACTION_EFFECT_DEFS,
    },
  }));
}

// Run after DOM is ready so the renderer's hook containers exist
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrate);
} else {
  hydrate();
}
