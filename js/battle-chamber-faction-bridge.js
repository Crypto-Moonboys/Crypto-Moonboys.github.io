/**
 * battle-chamber-faction-bridge.js — ES module bridge for the Battle Chamber renderer.
 *
 * Imports real data from the existing ES-module faction systems and exposes it
 * on safe window caches so that battle-chamber-factions.js (a non-module IIFE)
 * can read current faction state without duplicating logic.
 *
 * Window globals set by this bridge:
 *   window.MOONBOYS_WAR_DATA             — local/server standings compatibility cache
 *   window.MOONBOYS_MISSION_DATA         — mission cache by faction
 *   window.FACTION_EFFECT_DEFS           — same object as FACTION_DEFS
 *   window.MOONBOYS_FACTION_REWARD_DATA  — reward summary cache
 *   window.MOONBOYS_BATTLE_CHAMBER_STANDINGS — { weekly, monthly, seasonal }
 *   window.MOONBOYS_BATTLE_CHAMBER_ACTIVITY  — server activity feed cache
 *   window.MOONBOYS_BATTLE_CHAMBER_FACTION_DETAIL — optional faction detail cache
 *   window.MOONBOYS_ROGUELITE_DAILY_STATE    — linked-user daily opportunity state
 *   window.MOONBOYS_ROGUELITE_MISSED_HISTORY — linked-user missed history snapshot
 *
 * Events dispatched:
 *   battle-chamber:faction-data-ready
 *   battle-chamber:faction-rewards-ready
 *   battle-chamber:activity-ready
 */

import {
  getFactionStandings,
  getDominantFaction,
} from '/js/arcade/systems/faction-war-system.js';

import {
  getDailyMissions,
  getSeasonalMissions,
  getMissionProgress,
  getCompletedMissions,
} from '/js/arcade/systems/faction-missions.js';

import {
  FACTION_DEFS,
} from '/js/arcade/systems/faction-effect-system.js';

import {
  getFactionRewardSummary,
} from '/js/arcade/systems/faction-reward-system.js';

const LIVE_FACTION_KEYS = [
  'hard-fork-rockers',
  'rugpull-miners',
  'graffpunks',
  'blockchain-furies',
  'crypto-moongirls',
  'blockstars',
  'all-city-bulls',
  'nomad-bears',
  'crypto-stoned-boys',
];
var FETCH_TIMEOUT_MS = 6000;
var UNALIGNED_LOAD_TTL_MS = 30000;
var _lastUnalignedLoadCheckAt = 0;
var _resolveFactionInflight = null;
var PLATFORM = window.BATTLE_CHAMBER_PLATFORM || null;
var SCHEMA = PLATFORM && PLATFORM.schema ? PLATFORM.schema : null;
var IDENTITY_PROVIDER = PLATFORM && PLATFORM.identityProvider ? PLATFORM.identityProvider : null;

function getApiBase() {
  try {
    var cfg = (typeof window !== 'undefined') && window.MOONBOYS_API;
    return cfg && cfg.BASE_URL ? String(cfg.BASE_URL).replace(/\/$/, '') : '';
  } catch (_) { return ''; }
}

function getCurrentFactionKey() {
  try {
    var api = window.MOONBOYS_FACTION;
    if (!api || typeof api.getCachedStatus !== 'function') return null;
    var status = api.getCachedStatus();
    var faction = status && status.faction ? String(status.faction).toLowerCase().trim() : '';
    if (!faction || faction === 'unaligned') return null;
    return LIVE_FACTION_KEYS.indexOf(faction) !== -1 ? faction : null;
  } catch (_) {
    return null;
  }
}

function getCurrentFactionKeyFromStatus(status) {
  var faction = status && status.faction ? String(status.faction).toLowerCase().trim() : '';
  if (!faction || faction === 'unaligned') return null;
  return LIVE_FACTION_KEYS.indexOf(faction) !== -1 ? faction : null;
}

async function resolveCurrentFactionKey() {
  var current = getCurrentFactionKey();
  if (current) return current;
  if (_resolveFactionInflight) return _resolveFactionInflight;
  try {
    var identity = IDENTITY_PROVIDER || window.MOONBOYS_IDENTITY;
    var linked = IDENTITY_PROVIDER
      ? IDENTITY_PROVIDER.isLinked()
      : !!(identity && typeof identity.isTelegramLinked === 'function' && identity.isTelegramLinked());
    if (!linked) return null;
    if ((Date.now() - _lastUnalignedLoadCheckAt) < UNALIGNED_LOAD_TTL_MS) return null;
    var api = window.MOONBOYS_FACTION;
    if (api && typeof api.loadStatus === 'function') {
      _resolveFactionInflight = api.loadStatus()
        .then(function (loaded) {
          var resolved = getCurrentFactionKeyFromStatus(loaded);
          if (!resolved) _lastUnalignedLoadCheckAt = Date.now();
          return resolved;
        })
        .catch(function () {
          _lastUnalignedLoadCheckAt = Date.now();
          return null;
        })
        .finally(function () {
          _resolveFactionInflight = null;
        });
      return _resolveFactionInflight;
    }
  } catch (_) {}
  return null;
}

function getSignedTelegramAuthPayload() {
  try {
    if (IDENTITY_PROVIDER && typeof IDENTITY_PROVIDER.getSignedAuth === 'function') {
      return IDENTITY_PROVIDER.getSignedAuth();
    }
    var identity = window.MOONBOYS_IDENTITY;
    if (!identity || typeof identity.getSignedTelegramAuth !== 'function') return null;
    var payload = identity.getSignedTelegramAuth();
    return payload && typeof payload === 'object' ? payload : null;
  } catch (_) {
    return null;
  }
}


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
  var base = emptyRewardSummary(key);
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

function buildRewardData() {
  var factions = {};
  for (var i = 0; i < LIVE_FACTION_KEYS.length; i++) {
    var key = LIVE_FACTION_KEYS[i];
    try {
      factions[key] = normaliseRewardSummary(key, getFactionRewardSummary(key));
    } catch (_) {
      factions[key] = emptyRewardSummary(key);
    }
  }
  if (SCHEMA && typeof SCHEMA.validateRewardData === 'function') {
    var validated = SCHEMA.validateRewardData({ factions: factions, source: 'local' });
    return {
      schemaVersion: validated.schemaVersion,
      source: validated.source,
      factions: validated.data.factions,
      updatedAt: validated.updatedAt,
    };
  }
  return { schemaVersion: 1, source: 'local', factions: factions, updatedAt: Date.now() };
}

function buildLocalWarData() {
  try {
    var standings = getFactionStandings();
    return { standings: standings, dominantFaction: getDominantFaction() };
  } catch (_) {
    return {
      standings: LIVE_FACTION_KEYS.map(function (key) {
        return { faction: key, power: 0, daily: 0, weekly: 0, momentum: 0 };
      }),
      dominantFaction: 'hard-fork-rockers',
    };
  }
}

function buildMissionData() {
  var data = {};
  for (var i = 0; i < LIVE_FACTION_KEYS.length; i++) {
    var key = LIVE_FACTION_KEYS[i];
    try {
      var daily = getDailyMissions(key);
      var seasonal = getSeasonalMissions(key);
      var completed = getCompletedMissions(key);
      var progress = {};
      for (var j = 0; j < daily.length; j++) {
        var mission = daily[j];
        progress[mission.id] = getMissionProgress(key, mission.id);
      }
      data[key] = { daily: daily, seasonal: seasonal, completed: completed, progress: progress };
    } catch (_) {
      data[key] = { daily: [], seasonal: [], completed: [], progress: {} };
    }
  }
  if (SCHEMA && typeof SCHEMA.validateMissionData === 'function') {
    var validated = SCHEMA.validateMissionData(data);
    return Object.assign({}, data, {
      schemaVersion: validated.schemaVersion,
      source: validated.source,
      factions: validated.data,
      updatedAt: validated.updatedAt,
    });
  }
  return Object.assign({}, data, { schemaVersion: 1, source: 'local', factions: data, updatedAt: Date.now() });
}

function normaliseServerStandings(payload) {
  var validated = SCHEMA && typeof SCHEMA.validateStandingsPayload === 'function'
    ? SCHEMA.validateStandingsPayload(payload, payload && payload.period)
    : null;
  if (validated) {
    return Object.assign({}, validated.data, {
      schemaVersion: validated.schemaVersion,
      source: validated.source,
      updatedAt: validated.updatedAt,
    });
  }
  if (!payload || !payload.ok || !Array.isArray(payload.factions)) return null;
  var rows = payload.factions.map(function (row) {
    var key = String(row.faction_id || '').toLowerCase();
    return {
      faction_id: key,
      rank: Number(row.rank) || 0,
      clout_total: Number(row.clout_total) || 0,
      contribution_total: Number(row.contribution_total) || 0,
      mission_total: Number(row.mission_total) || 0,
      score_total: Number(row.score_total) || 0,
      member_count: Number(row.member_count) || 0,
      momentum: row.momentum == null ? null : Number(row.momentum) || 0,
    };
  }).filter(function (row) { return LIVE_FACTION_KEYS.indexOf(row.faction_id) !== -1; });
  return {
    schemaVersion: 1,
    source: 'server',
    updatedAt: Date.now(),
    period: payload.period || 'weekly',
    period_key: payload.period_key || null,
    rows: rows,
  };
}

function mapWeeklyServerStandingsToWarData(weeklyData) {
  var local = buildLocalWarData();
  if (!weeklyData || !Array.isArray(weeklyData.rows) || !weeklyData.rows.length) return local;
  var byFaction = {};
  for (var i = 0; i < weeklyData.rows.length; i++) {
    byFaction[weeklyData.rows[i].faction_id] = weeklyData.rows[i];
  }
  var standings = LIVE_FACTION_KEYS.map(function (key) {
    var localRow = (local.standings || []).find(function (r) { return r.faction === key; }) || { daily: 0, momentum: 0 };
    var serverRow = byFaction[key] || null;
    if (!serverRow) {
      return {
        faction: key,
        power: Number(localRow.power) || 0,
        daily: Number(localRow.daily) || 0,
        weekly: Number(localRow.weekly) || 0,
        momentum: Number(localRow.momentum) || 0,
      };
    }
    return {
      faction: key,
      power: Number(serverRow.clout_total) || 0,
      daily: Number(localRow.daily) || 0,
      weekly: Number(serverRow.clout_total) || 0,
      momentum: serverRow.momentum == null ? (Number(localRow.momentum) || 0) : Number(serverRow.momentum) || 0,
      contribution_total: Number(serverRow.contribution_total) || 0,
      mission_total: Number(serverRow.mission_total) || 0,
      score_total: Number(serverRow.score_total) || 0,
      member_count: Number(serverRow.member_count) || 0,
      period_key: weeklyData.period_key || null,
      source: 'server',
    };
  }).sort(function (a, b) { return (b.power || 0) - (a.power || 0); });

  return {
    standings: standings,
    dominantFaction: standings.length ? standings[0].faction : local.dominantFaction,
    source: 'server',
    period: 'weekly',
    period_key: weeklyData.period_key || null,
  };
}


async function fetchJsonWithTelegramAuth(url, extraBody) {
  var payload = getSignedTelegramAuthPayload();
  if (!payload) return null;
  var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS) : null;
  try {
    var body = Object.assign({}, extraBody || {}, { telegram_auth: payload });
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) return null;
    return await res.json().catch(function () { return null; });
  } catch (_) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchJson(url) {
  var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS) : null;
  try {
    var res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) return null;
    return await res.json().catch(function () { return null; });
  } catch (_) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function dispatchFactionDataReady() {
  window.dispatchEvent(new CustomEvent('battle-chamber:faction-data-ready', {
    detail: {
      warData: window.MOONBOYS_WAR_DATA,
      missionData: window.MOONBOYS_MISSION_DATA,
      factionDefs: window.FACTION_EFFECT_DEFS,
      standings: window.MOONBOYS_BATTLE_CHAMBER_STANDINGS || null,
      serverStatus: window.MOONBOYS_BATTLE_CHAMBER_SERVER_STATUS || null,
      rogueliteDailyState: window.MOONBOYS_ROGUELITE_DAILY_STATE || null,
      missedHistory: window.MOONBOYS_ROGUELITE_MISSED_HISTORY || null,
    },
  }));
}

function dispatchRewardReady() {
  window.dispatchEvent(new CustomEvent('battle-chamber:faction-rewards-ready', {
    detail: {
      rewardData: window.MOONBOYS_FACTION_REWARD_DATA,
    },
  }));
}

function dispatchActivityReady() {
  window.dispatchEvent(new CustomEvent('battle-chamber:activity-ready', {
    detail: {
      activity: window.MOONBOYS_BATTLE_CHAMBER_ACTIVITY || [],
      serverStatus: window.MOONBOYS_BATTLE_CHAMBER_SERVER_STATUS || null,
    },
  }));
}

function hydrateLocalFirst() {
  window.MOONBOYS_WAR_DATA = buildLocalWarData();
  window.MOONBOYS_MISSION_DATA = buildMissionData();
  window.FACTION_EFFECT_DEFS = FACTION_DEFS;
  window.MOONBOYS_FACTION_REWARD_DATA = buildRewardData();
  window.MOONBOYS_BATTLE_CHAMBER_STANDINGS = window.MOONBOYS_BATTLE_CHAMBER_STANDINGS || {
    weekly: null,
    monthly: null,
    seasonal: null,
  };
  window.MOONBOYS_BATTLE_CHAMBER_ACTIVITY = Array.isArray(window.MOONBOYS_BATTLE_CHAMBER_ACTIVITY)
    ? window.MOONBOYS_BATTLE_CHAMBER_ACTIVITY
    : [];
  window.MOONBOYS_BATTLE_CHAMBER_SERVER_STATUS = {
    available: false,
    fallback: true,
    message: 'Live server standings unavailable. Showing local display state.',
    updatedAt: Date.now(),
  };
  window.MOONBOYS_ROGUELITE_DAILY_STATE = window.MOONBOYS_ROGUELITE_DAILY_STATE || null;
  window.MOONBOYS_ROGUELITE_MISSED_HISTORY = Array.isArray(window.MOONBOYS_ROGUELITE_MISSED_HISTORY)
    ? window.MOONBOYS_ROGUELITE_MISSED_HISTORY
    : [];
}

async function hydrateServerAuthority() {
  var apiBase = getApiBase();
  if (!apiBase) return false;
  var currentFaction = await resolveCurrentFactionKey();
  var endpoints = [
    fetchJson(apiBase + '/battle-chamber/factions/standings?period=weekly'),
    fetchJson(apiBase + '/battle-chamber/factions/standings?period=monthly'),
    fetchJson(apiBase + '/battle-chamber/factions/standings?period=seasonal'),
    fetchJson(apiBase + '/battle-chamber/activity?limit=20'),
    currentFaction ? fetchJson(apiBase + '/battle-chamber/factions/' + encodeURIComponent(currentFaction)) : Promise.resolve(null),
    fetchJsonWithTelegramAuth(apiBase + '/roguelite/daily-state'),
    fetchJsonWithTelegramAuth(apiBase + '/roguelite/missed-history', { limit: 8 }),
  ];

  var results = await Promise.all(endpoints);
  var weekly = normaliseServerStandings(results[0]);
  var monthly = normaliseServerStandings(results[1]);
  var seasonal = normaliseServerStandings(results[2]);
  var activityEnvelope = SCHEMA && typeof SCHEMA.validateActivityPayload === 'function'
    ? SCHEMA.validateActivityPayload(results[3])
    : null;
  var activity = activityEnvelope ? activityEnvelope.data : (results[3] && results[3].ok && Array.isArray(results[3].items) ? results[3].items : null);
  var factionDetail = results[4] && results[4].ok ? results[4] : null;
  var dailyEnvelope = SCHEMA && typeof SCHEMA.validateDailyState === 'function' ? SCHEMA.validateDailyState(results[5]) : null;
  var missedEnvelope = SCHEMA && typeof SCHEMA.validateMissedHistoryPayload === 'function' ? SCHEMA.validateMissedHistoryPayload(results[6]) : null;
  var dailyState = dailyEnvelope ? dailyEnvelope.data : (results[5] && results[5].ok ? results[5] : null);
  var missedHistory = missedEnvelope ? missedEnvelope.data : (results[6] && results[6].ok && Array.isArray(results[6].items) ? results[6].items : null);

  var hasServerData = !!(weekly || monthly || seasonal || activity || dailyState || missedHistory);
  if (!hasServerData) return false;

  window.MOONBOYS_BATTLE_CHAMBER_STANDINGS = {
    weekly: weekly,
    monthly: monthly,
    seasonal: seasonal,
  };

  if (weekly) {
    window.MOONBOYS_WAR_DATA = mapWeeklyServerStandingsToWarData(weekly);
  }

  if (activity) {
    window.MOONBOYS_BATTLE_CHAMBER_ACTIVITY = activity;
  }

  if (factionDetail && factionDetail.faction && factionDetail.faction.id) {
    window.MOONBOYS_BATTLE_CHAMBER_FACTION_DETAIL = window.MOONBOYS_BATTLE_CHAMBER_FACTION_DETAIL || {};
    window.MOONBOYS_BATTLE_CHAMBER_FACTION_DETAIL[factionDetail.faction.id] = factionDetail;
  }

  if (dailyState) {
    window.MOONBOYS_ROGUELITE_DAILY_STATE = dailyState;
  }
  if (missedHistory) {
    window.MOONBOYS_ROGUELITE_MISSED_HISTORY = missedHistory;
  }

  window.MOONBOYS_BATTLE_CHAMBER_SERVER_STATUS = {
    available: true,
    fallback: false,
    updatedAt: Date.now(),
    message: '',
  };

  return true;
}

async function hydrate() {
  hydrateLocalFirst();
  dispatchFactionDataReady();
  dispatchRewardReady();
  dispatchActivityReady();

  var serverReady = await hydrateServerAuthority();
  if (serverReady) {
    dispatchFactionDataReady();
    dispatchActivityReady();
  }
}

var _serverRefreshTimer = null;
var _serverRefreshInflight = null;

function refreshServerAuthority() {
  if (_serverRefreshInflight) return _serverRefreshInflight;
  _serverRefreshInflight = hydrateServerAuthority()
    .then(function (serverReady) {
      if (serverReady) {
        dispatchFactionDataReady();
        dispatchActivityReady();
      }
      return serverReady;
    })
    .finally(function () {
      _serverRefreshInflight = null;
    });
  return _serverRefreshInflight;
}

function scheduleServerAuthorityRefresh() {
  if (_serverRefreshTimer) clearTimeout(_serverRefreshTimer);
  _serverRefreshTimer = setTimeout(function () {
    _serverRefreshTimer = null;
    refreshServerAuthority().catch(function () {});
  }, 140);
}

function bindRefreshEvents() {
  [
    'moonboys:sync-state',
    'moonboys:faction-boost',
    'moonboys:wtf-event-checkin',
    'moonboys:wtf-event-complete',
    'moonboys:roguelite-options-unlocked',
    'moonboys:score-updated',
  ].forEach(function (eventName) {
    window.addEventListener(eventName, scheduleServerAuthorityRefresh);
  });
  window.addEventListener('moonboys:faction-status', function (event) {
    var detail = event && event.detail ? event.detail : null;
    if (detail && detail.source === 'load' && (!detail.faction || detail.faction === 'unaligned')) return;
    if (detail && detail.source === 'load') return;
    _lastUnalignedLoadCheckAt = 0;
    scheduleServerAuthorityRefresh();
  });

  var bus = window.MOONBOYS_EVENT_BUS;
  if (bus && typeof bus.on === 'function') {
    bus.on('faction:mission:complete', scheduleServerAuthorityRefresh);
    bus.on('faction:update', function (payload) {
      if (payload && payload.source === 'load' && (!payload.faction || payload.faction === 'unaligned')) return;
      if (payload && payload.source === 'load') return;
      _lastUnalignedLoadCheckAt = 0;
      scheduleServerAuthorityRefresh();
    });
    bus.on('sync:state', scheduleServerAuthorityRefresh);
  }
}

function bootstrap() {
  bindRefreshEvents();
  hydrate().catch(function () {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
