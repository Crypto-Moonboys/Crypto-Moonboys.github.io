import {
  connectMultiplayer,
  sendMovement,
  sendNodeInterference,
  sendCovertPressureSync,
  sendWarAction,
  sendDeployOperative,
  challengePlayer as sendDuelChallenge,
  acceptDuel as sendDuelAccept,
  submitDuelAction as sendDuelAction,
} from './network.js';
import { loadUnifiedData } from './world/data-loader.js';
import {
  createGameState,
  applyRemotePlayers,
  updatePlayerMotion,
  movePlayerTowardTarget,
  awardXp,
  tickDistrictCapture,
} from './world/game-state.js';
import { createSamSystem } from './world/sam-system.js';
import { createNpcSystem } from './world/npc-system.js';
import { createQuestSystem } from './world/quest-system.js';
import { createMemorySystem } from './world/memory-system.js';
import { createLiveIntelligence } from './world/live-intelligence.js';
import { createClueSignalSystem } from './world/clue-signal-system.js';
import { createSignalOperationSystem } from './world/signal-operation-system.js';
import { createNodeInterferenceSystem } from './world/node-interference-system.js';
import { createDuelSystem } from './world/duel-system.js';
import { createHud } from './ui/hud.js';
import { createDuelOverlay } from './ui/duel-overlay.js';
import { createNodeOutbreakOverlay } from './ui/node-outbreak-overlay.js?v=56987dec';
import { createIsoRenderer } from './render/iso-renderer.js';
import { DUEL_FIGHTER_CONFIG } from './data/duel-fighter-config.js';
import { createNodeOutbreakSystem } from './world/node-outbreak-system.js';
import { createFirewallDefenseSystem } from './world/firewall-defense-system.js';
import { createFirewallDefenseOverlay } from './ui/firewall-defense-overlay.js?v=56987dec';
import { createSignalRouterSystem } from './world/signal-router-system.js';
import { createSignalRouterOverlay } from './ui/signal-router-overlay.js?v=56987dec';
import { createCircuitConnectSystem } from './world/circuit-connect-system.js';
import { createCircuitConnectOverlay } from './ui/circuit-connect-overlay.js?v=circuit-breach-pass-2';
import { computeTierDifficulty } from './world/tier-difficulty.js';

const ENTRY_OVERLAY_TIMEOUT_MS = 7000;
const MAX_FRAME_DELTA_SECONDS = 1 / 30;
const SAM_IMPACT_DURATION_MS = 2000;
const DISTRICT_PULSE_DURATION_MS = 1300;
const DISTRICT_PULSE_CONFLICT_MS = 1400;
const ENTRY_DISMISS_DELAY_MS = 2400;
const DISTRICT_CAPTURE_THRESHOLD = 90;
const LOGIC_TICK_MS = 50;
const NPC_SCAN_INTERVAL_MS = 150;
const MAX_CLIENT_CROWD_NPCS = 20;
const REMOTE_PLAYER_LERP_ALPHA = 0.18;
const LIVE_REFRESH_INTERVAL_MS = 120000; // 2 minutes
const PROGRESSION_SYNC_INTERVAL_MS = 18000;
const COVERT_SYNC_INTERVAL_MS = 26000;
const QUEST_TICK_INTERVAL_MS = 250;
const FEED_DEDUPE_TTL_MS = 5 * 60 * 1000;
const MAX_FEED_CACHE_SIZE = 80;
const NPC_FEED_PULSE_PROBABILITY = 0.002;
const SAM_PRESENCE_MIN_MS = 18000;
const SAM_PRESENCE_VARIANCE_MS = 10000;
const CAMERA_ZOOM_PRESETS = [0.7, 1, 1.4];
const CAMERA_ZOOM_MIN = 0.7;
const CAMERA_ZOOM_MAX = 1.4;
// ~6% step gives smooth wheel zoom while traversing the clamp range in practical increments.
const CAMERA_ZOOM_WHEEL_STEP = 0.06;
const MOUSE_DRAG_THRESHOLD_PX = 8;
const MOUSE_DRAG_DOUBLE_CLICK_SUPPRESS_MS = 400;
const DEFAULT_AI_ENDPOINT = 'https://api.openai.com/v1/responses';
const FORCE_SYNC_GATE_FALLBACK_URL = 'https://crypto-moonboys.github.io/gkniftyheads-incubator.html';
const MINI_GAME_TYPES = new Set(['outbreak', 'firewall', 'router', 'circuit']);
const MICRO_NOTIFY_DEDUPE_WINDOW_MS = 2600;
const MICRO_NOTIFY_MAX_ITEMS = 5;
const MINI_GAME_SYNC_QUIET_MS = 5200;
const MINI_GAME_ENTRY_QUIET_MS = 2800;
const COVERT_OPS_MISSION_DURATION_MS = 30000;
const COVERT_DEPLOY_BTN_TEXT = 'Deploy Signal Runner';
const FTUE_STORAGE_KEY = 'blocktopia_player_experience_seen';
const microNotifyCache = new Map();

function setBodyStateClass(name, enabled) {
  if (!document || !document.body) return;
  document.body.classList.toggle(name, !!enabled);
}

function dispatchUiState(name, detail = {}) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function ensureMicroFeed() {
  let root = document.getElementById('micro-notify-feed');
  if (root) return root;
  root = document.createElement('aside');
  root.id = 'micro-notify-feed';
  root.className = 'micro-notify-feed';
  root.setAttribute('aria-live', 'polite');
  document.body.appendChild(root);
  return root;
}

function pushMicroNotification(message, tone = 'info') {
  if (!message) return;
  const text = String(message).trim();
  if (!text) return;
  const key = `${tone}::${text.toLowerCase()}`;
  const now = Date.now();
  const prev = microNotifyCache.get(key) || 0;
  if ((now - prev) < MICRO_NOTIFY_DEDUPE_WINDOW_MS) return;
  microNotifyCache.set(key, now);
  if (microNotifyCache.size > 140) {
    for (const [cacheKey, ts] of microNotifyCache.entries()) {
      if ((now - ts) > 70000) microNotifyCache.delete(cacheKey);
    }
  }
  const feed = ensureMicroFeed();
  const item = document.createElement('div');
  item.className = `micro-note micro-note--${tone}`;
  item.textContent = text;
  feed.prepend(item);
  while (feed.children.length > MICRO_NOTIFY_MAX_ITEMS) {
    feed.lastElementChild?.remove();
  }
  requestAnimationFrame(() => item.classList.add('is-live'));
  window.setTimeout(() => {
    item.classList.remove('is-live');
    item.classList.add('is-out');
  }, 3200);
  window.setTimeout(() => item.remove(), 4100);
}

function pulseWorldConflict(ms = 2400) {
  setBodyStateClass('conflict-nearby', true);
  dispatchUiState('moonboys:world-state', { conflictNearby: true, conflictActive: true, durationMs: Math.max(600, Number(ms) || 2400), ts: Date.now() });
  window.setTimeout(() => setBodyStateClass('conflict-nearby', false), Math.max(600, Number(ms) || 2400));
}

function updateReactiveGridState(state) {
  if (!state || !document || !document.body) return;
  const now = Date.now();
  const inConflict = Number(state.effects?.districtPulseUntil || 0) > now || state.phase === 'Conflict';
  const syncReady = hasTelegramAuth();
  const networkHeat = Math.max(0, Math.min(100, Number(state.covert?.networkHeat?.value) || 0));
  const samSensitivity = Math.max(0, Math.min(100, Number(state.covert?.samAwareness?.sensitivity) || 0));
  const districtPatrolPressure = Math.max(0, Math.min(100, Number(state.sharedWorld?.summary?.currentDistrictHunterPressure) || 0));
  const districtPostureState = String(state.sharedWorld?.summary?.currentDistrictPostureState || 'normal');
  const districtPostureScore = Math.max(0, Math.min(100, Number(state.sharedWorld?.summary?.currentDistrictPostureScore) || 0));
  const speed = inConflict ? 1.5 : syncReady ? 1 : 0.45;
  const intensity = inConflict ? 1 : syncReady ? 0.68 : 0.35;
  document.body.style.setProperty('--reactive-grid-speed', String(speed));
  document.body.style.setProperty('--reactive-grid-intensity', String(intensity));
  document.body.style.setProperty('--covert-overlay-opacity', String(((networkHeat / 100) * 0.2) + ((districtPostureScore / 100) * 0.04)));
  document.body.style.setProperty('--covert-vignette-opacity', String(((networkHeat / 100) * 0.44) + ((districtPostureScore / 100) * 0.08)));
  document.body.style.setProperty('--covert-scan-opacity', String(
    ((samSensitivity / 100) * 0.18)
    + ((districtPatrolPressure / 100) * 0.08)
    + ((districtPostureScore / 100) * 0.06),
  ));
  setBodyStateClass('conflict-active', inConflict);
  setBodyStateClass('sync-live', syncReady);
  setBodyStateClass('sync-error', !syncReady);
  setBodyStateClass('covert-heat-warm', networkHeat >= 25 && networkHeat < 50);
  setBodyStateClass('covert-heat-hot', networkHeat >= 50 && networkHeat < 75);
  setBodyStateClass('covert-heat-critical', networkHeat >= 75);
  setBodyStateClass('covert-under-watch', samSensitivity >= 40 || networkHeat >= 45);
  setBodyStateClass('covert-counter-actions-live', (Number(state.covert?.summary?.activeCounterActions) || 0) > 0);
  setBodyStateClass('district-under-patrol', districtPatrolPressure >= 4);
  setBodyStateClass('district-posture-watched', districtPostureState === 'watched');
  setBodyStateClass('district-posture-pressured', districtPostureState === 'pressured');
  setBodyStateClass('district-posture-pre-lockdown', districtPostureState === 'pre_lockdown');
  dispatchUiState('moonboys:world-state', {
    conflictActive: inConflict,
    syncReady,
    speed,
    intensity,
    networkHeat,
    samSensitivity,
    districtPatrolPressure,
    districtPostureState,
    districtPostureScore,
    ts: now,
  });
}

const DEFAULT_RPG_EFFECTS = {
  efficiencyDrainReduction: 0,
  signalXpBonus: 0,
  defenseEaseBonus: 0,
  gemDropBonus: 0,
  npcAssistBonus: 0,
};
let progressionState = {
  tier: 1,
  gems: 0,
  rpg_mode_active: false,
  effects: { ...DEFAULT_RPG_EFFECTS },
  upgrades: { efficiency: 0, signal: 0, defense: 0, gem: 0, npc: 0 },
};

function createDefaultCovertState() {
  return {
    online: false,
    networkHeat: { value: 0, tier: 'cold', derived_floor: 0, factors: {} },
    samAwareness: { sensitivity: 0, tier: 'cold', pressure_flags: [], elevated_zones: [] },
    nodeRiskById: {},
    districtSignalById: {},
    agentRiskById: {},
    hunterUnits: [],
    hunterDetectionByNodeId: {},
    counterActions: { nodeScans: [], localTraces: [], routeDisruptions: [], summary: {} },
    summary: {
      activeAgents: 0,
      exposedAgents: 0,
      capturedAgents: 0,
      recoveringAgents: 0,
      highRiskAgents: 0,
      highestRisk: 0,
      highestRiskAgentId: '',
      hottestNodeId: '',
      hottestDistrictId: '',
      currentDistrictId: '',
      currentDistrictInstability: 0,
      currentDistrictFlag: 'calm',
      recoveryReady: false,
      recoveryCost: 0,
      urgentRecoveryAgents: 0,
      activeCounterActions: 0,
      activeNodeScans: 0,
      activeLocalTraces: 0,
      activeRouteDisruptions: 0,
      activeHunters: 0,
      currentDistrictHunterPressure: 0,
      hottestHunterNodeId: '',
    },
    agents: [],
    operations: [],
    progression: { gems: 0, xp: 0, tier: 1 },
    costs: {},
    lastSyncAt: 0,
  };
}

function createDefaultSharedHunterState() {
  return {
    samHunters: [],
    hunterDetectionByNodeId: {},
    districtPatrolById: {},
    summary: {
      activeHunters: 0,
      currentDistrictHunterPressure: 0,
      currentDistrictPatrolMode: 'patrol',
      currentDistrictPostureState: 'normal',
      currentDistrictPostureScore: 0,
      currentDistrictWarningLine: '',
      hottestDistrictId: '',
      hottestHunterNodeId: '',
    },
    lastSyncAt: 0,
  };
}

function hasSharedHunterSnapshotPayload(snapshot = {}) {
  return Array.isArray(snapshot?.samHunters)
    || Array.isArray(snapshot?.hunterFields)
    || Array.isArray(snapshot?.districtPatrols);
}

function normalizeSharedHunterState(snapshot = {}, currentDistrictId = '') {
  const samHunters = Array.isArray(snapshot?.samHunters) ? snapshot.samHunters : [];
  const hunterFields = Array.isArray(snapshot?.hunterFields) ? snapshot.hunterFields : [];
  const districtPatrols = Array.isArray(snapshot?.districtPatrols) ? snapshot.districtPatrols : [];
  const hunterDetectionByNodeId = Object.fromEntries(hunterFields.map((entry) => [entry.node_id, entry]));
  const districtPatrolById = Object.fromEntries(
    districtPatrols
      .filter((entry) => entry?.districtId)
      .map((entry) => [entry.districtId, entry]),
  );
  const currentDistrictHunterPressure = hunterFields
    .filter((entry) => entry?.district_id === currentDistrictId)
    .reduce((highest, entry) => Math.max(highest, Number(entry?.intensity) || 0), 0);
  const hottestField = [...hunterFields].sort((a, b) => (Number(b?.intensity) || 0) - (Number(a?.intensity) || 0))[0] || null;
  const hottestDistrict = [...districtPatrols].sort((a, b) => (
    (Number(b?.postureScore) || Number(b?.pressureScore) || 0)
    - (Number(a?.postureScore) || Number(a?.pressureScore) || 0)
  ))[0] || null;
  const currentDistrictPatrol = districtPatrolById[currentDistrictId] || hottestDistrict || null;
  return {
    samHunters,
    hunterDetectionByNodeId,
    districtPatrolById,
    summary: {
      activeHunters: samHunters.filter((entry) => entry?.active !== false).length,
      currentDistrictHunterPressure,
      currentDistrictPatrolMode: currentDistrictPatrol?.patrolMode || 'patrol',
      currentDistrictPostureState: currentDistrictPatrol?.postureState || 'normal',
      currentDistrictPostureScore: Number(currentDistrictPatrol?.postureScore) || 0,
      currentDistrictWarningLine: currentDistrictPatrol?.warningLine || '',
      hottestDistrictId: hottestDistrict?.districtId || '',
      hottestHunterNodeId: hottestField?.node_id || '',
    },
    lastSyncAt: Date.now(),
  };
}

function sharedPatrolFlag(mode = '', fallback = 'calm') {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'trace-response') return 'traced';
  if (normalized === 'pre-lockdown') return 'pre_lockdown';
  if (normalized === 'scan-focus') return 'watched';
  if (normalized === 'route-watch') return 'watched';
  if (normalized === 'cool-down' || normalized === 'idle') return 'cooling';
  if (normalized === 'patrol') return 'patrol';
  return fallback;
}
const canvas = document.getElementById('world-canvas');
const hud = createHud(document);
const renderer = createIsoRenderer(canvas);

const input = Object.create(null);
window.addEventListener('keydown', (event) => {
  input[event.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (event) => {
  input[event.key.toLowerCase()] = false;
});

function resolveAiRuntimeConfig() {
  const runtime = window.BLOCK_TOPIA_AI || {};
  const enabled = runtime.enabled === true;
  const endpoint = typeof runtime.endpoint === 'string' && runtime.endpoint.trim()
    ? runtime.endpoint.trim()
    : DEFAULT_AI_ENDPOINT;
  const model = typeof runtime.model === 'string' && runtime.model.trim()
    ? runtime.model.trim()
    : '';
  const apiKeyEnvVar = typeof runtime.apiKeyEnvVar === 'string' && runtime.apiKeyEnvVar.trim()
    ? runtime.apiKeyEnvVar.trim()
    : 'OPENAI_API_KEY';
  const hasConfig = Boolean(runtime && Object.keys(runtime).length);

  let status = 'disabled (no config)';
  if (hasConfig && !enabled) status = 'configured but disabled';
  if (enabled && !model) status = 'enabled, missing model';
  if (enabled && model) status = 'ready for endpoint/config testing';

  return {
    enabled,
    endpoint,
    model,
    apiKeyEnvVar,
    hasConfig,
    status,
  };
}

function getApiBase() {
  const cfg = window.MOONBOYS_API || {};
  return cfg.BASE_URL ? String(cfg.BASE_URL).replace(/\/$/, '') : '';
}

function getSyncGateUrl() {
  const cfg = window.MOONBOYS_API || {};
  return cfg.SYNC_GATE_URL || FORCE_SYNC_GATE_FALLBACK_URL;
}

function redirectToSyncGate(
  reason = 'Telegram sync required for Block Topia progression.',
  delayMs = 1600,
  debugPath = 'unknown',
  confirmedAuthFailure = false,
) {
  try {
    if (!confirmedAuthFailure) {
      hud.showNodeInterference(`Block Topia warning: ${reason}`, 'warning');
      hud.pushFeed(`⚠ Redirect suppressed [${debugPath}] ${reason}`, 'system');
      return;
    }
    hud.showNodeInterference(`Block Topia entry blocked: ${reason}`, 'warning');
    hud.pushFeed(`🧭 AUTH REDIRECT [${debugPath}]`, 'system');
    hud.pushFeed(`🔐 ${reason}`, 'system');
    hud.pushFeed('Run /gklink in @WIKICOMSBOT to refresh your connection.', 'system');
  } catch {}
  window.setTimeout(() => {
    window.location.replace(getSyncGateUrl());
  }, Math.max(0, Number(delayMs) || 0));
}

function hasTelegramAuth() {
  const telegramAuth = getTelegramAuth();
  return Boolean(telegramAuth?.hash && telegramAuth?.auth_date);
}

function getTelegramAuth() {
  if (window.MOONBOYS_IDENTITY && typeof window.MOONBOYS_IDENTITY.getTelegramAuth === 'function') {
    if (typeof window.MOONBOYS_IDENTITY.getSignedTelegramAuth === 'function') {
      const signed = window.MOONBOYS_IDENTITY.getSignedTelegramAuth();
      if (signed?.hash && signed?.auth_date) return signed;
    }
    return window.MOONBOYS_IDENTITY.getTelegramAuth();
  }
  try {
    const raw = localStorage.getItem('moonboys_tg_auth');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function restoreTelegramAuthFromBackend(reason = 'blocktopia_boot') {
  const identity = window.MOONBOYS_IDENTITY;
  if (!identity || typeof identity.restoreLinkedTelegramAuth !== 'function') return null;
  const result = await identity.restoreLinkedTelegramAuth({ force: true, reason }).catch(() => null);
  if (!result?.ok) return null;
  return result.telegram_auth || getTelegramAuth();
}

function setServerProgression(next = {}) {
  progressionState = {
    ...progressionState,
    ...next,
    tier: Number(next.tier ?? progressionState.tier) || 1,
    effects: { ...DEFAULT_RPG_EFFECTS, ...(next.effects || progressionState.effects || {}) },
    upgrades: { ...progressionState.upgrades, ...(next.upgrades || progressionState.upgrades || {}) },
  };
  return progressionState;
}

function createRequestGate() {
  return {
    affordability: new Map(),
    outcomes: new Map(),
    progressionPollInFlight: false,
    covertPollInFlight: false,
    quietUntil: 0,
  };
}

async function fetchMiniGameAffordability(type) {
  const apiBase = getApiBase();
  const telegramAuth = getTelegramAuth();
  if (!apiBase || !telegramAuth?.hash || !telegramAuth?.auth_date) {
    return { ok: false, error: 'Telegram auth missing. Re-sync required.', auth_required: true };
  }
  const res = await fetch(`${apiBase}/blocktopia/progression/mini-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'mini_game_affordability', type, score: 0, telegram_auth: telegramAuth }),
  }).catch(() => null);
  if (!res) return { ok: false, error: 'Progression sync request failed.' };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ...data,
      ok: false,
      error: data?.error || data?.message || `HTTP ${res.status}`,
      auth_required: res.status === 401 || res.status === 403,
      __httpStatus: res.status,
    };
  }
  if (data?.progression) setServerProgression(data.progression);
  return data;
}

async function syncMiniGameSkip(type, skipStreak = 0) {
  const miniGameType = String(type || '').toLowerCase();
  if (!MINI_GAME_TYPES.has(miniGameType)) return null;
  const apiBase = getApiBase();
  const telegramAuth = getTelegramAuth();
  if (!apiBase || !telegramAuth?.hash || !telegramAuth?.auth_date) {
    return { ok: false, error: 'Telegram auth missing. Re-sync required.', auth_required: true };
  }
  const res = await fetch(`${apiBase}/blocktopia/progression/mini-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'mini_game_skip',
      type: miniGameType,
      score: 0,
      skip_streak: Math.max(0, Math.floor(Number(skipStreak) || 0)),
      telegram_auth: telegramAuth,
    }),
  }).catch(() => null);
  if (!res) return { ok: false, error: 'Skip sync request failed.' };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data?.progression) setServerProgression(data.progression);
    return {
      ...data,
      ok: false,
      error: data?.error || data?.message || `HTTP ${res.status}`,
      auth_required: res.status === 401 || res.status === 403,
      __httpStatus: res.status,
    };
  }
  if (data?.progression) setServerProgression(data.progression);
  return data;
}

async function fetchServerProgression(options = {}) {
  const { allowBootstrap = false, bootstrapReason = 'blocktopia_progression_bootstrap' } = options || {};
  const apiBase = getApiBase();
  let telegramAuth = getTelegramAuth();
  if ((!telegramAuth?.hash || !telegramAuth?.auth_date) && allowBootstrap) {
    telegramAuth = await restoreTelegramAuthFromBackend(bootstrapReason);
  }
  if (!apiBase || !telegramAuth?.hash || !telegramAuth?.auth_date) {
    return { ...progressionState, __authError: true, error: 'Telegram auth missing. Re-sync required.' };
  }
  try {
    const res = await fetch(`${apiBase}/blocktopia/progression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: telegramAuth }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if ((res.status === 401 || res.status === 403) && allowBootstrap) {
        const restored = await restoreTelegramAuthFromBackend(`${bootstrapReason}:retry`);
        if (restored?.hash && restored?.auth_date && restored.hash !== telegramAuth.hash) {
          return fetchServerProgression({ allowBootstrap: false, bootstrapReason });
        }
      }
      return {
        ...progressionState,
        __authError: res.status === 401 || res.status === 403,
        error: data?.error || data?.message || `HTTP ${res.status}`,
      };
    }
    const data = await res.json().catch(() => null);
    const progression = data?.progression || {};
    setServerProgression(progression);
    return progressionState;
  } catch {
    return { ...progressionState };
  }
}

async function fetchCovertState() {
  const apiBase = getApiBase();
  const telegramAuth = getTelegramAuth();
  if (!apiBase || !telegramAuth?.hash || !telegramAuth?.auth_date) {
    return { ...createDefaultCovertState(), __authError: true, error: 'Telegram auth missing. Re-sync required.' };
  }
  try {
    const res = await fetch(`${apiBase}/blocktopia/covert/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: telegramAuth }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ...createDefaultCovertState(),
        __authError: res.status === 401 || res.status === 403,
        error: data?.error || data?.message || `HTTP ${res.status}`,
      };
    }
    return await res.json().catch(() => createDefaultCovertState());
  } catch {
    return { ...createDefaultCovertState(), error: 'Covert relay unavailable.' };
  }
}

function normalizeCovertState(snapshot = {}, currentDistrictId = '') {
  const base = createDefaultCovertState();
  const networkHeat = snapshot?.network_heat || base.networkHeat;
  const samAwareness = snapshot?.sam_awareness || base.samAwareness;
  const agents = Array.isArray(snapshot?.agents) ? snapshot.agents : [];
  const operations = Array.isArray(snapshot?.operations) ? snapshot.operations : [];
  const nodeEntries = Array.isArray(snapshot?.local_node_risk) ? snapshot.local_node_risk : [];
  const districtEntries = Array.isArray(snapshot?.district_instability_signals) ? snapshot.district_instability_signals : [];
  const agentRiskEntries = Array.isArray(snapshot?.agent_risk_indicators) ? snapshot.agent_risk_indicators : [];
  const hunterUnits = Array.isArray(snapshot?.hunter_units) ? snapshot.hunter_units : [];
  const hunterDetectionFields = Array.isArray(snapshot?.hunter_detection_fields) ? snapshot.hunter_detection_fields : [];
  const counterActionSnapshot = snapshot?.counter_actions || {};
  const counterActions = {
    nodeScans: Array.isArray(counterActionSnapshot?.node_scans) ? counterActionSnapshot.node_scans : [],
    localTraces: Array.isArray(counterActionSnapshot?.local_traces) ? counterActionSnapshot.local_traces : [],
    routeDisruptions: Array.isArray(counterActionSnapshot?.route_disruptions) ? counterActionSnapshot.route_disruptions : [],
    summary: counterActionSnapshot?.summary || {},
  };
  counterActions.nodeScanByNodeId = Object.fromEntries(counterActions.nodeScans.map((entry) => [entry.node_id, entry]));
  counterActions.localTraceByDistrictId = Object.fromEntries(counterActions.localTraces.map((entry) => [entry.district_id, entry]));
  const nodeRiskById = Object.fromEntries(nodeEntries.map((entry) => [entry.node_id, entry]));
  const districtSignalById = Object.fromEntries(districtEntries.map((entry) => [entry.district_id, entry]));
  const agentRiskById = Object.fromEntries(agentRiskEntries.map((entry) => [entry.agent_id, entry]));
  const hunterDetectionByNodeId = Object.fromEntries(hunterDetectionFields.map((entry) => [entry.node_id, entry]));
  const activeAgents = agents.filter((agent) => agent?.status === 'active').length;
  const exposedAgents = agents.filter((agent) => agent?.status === 'exposed').length;
  const capturedAgents = agents.filter((agent) => agent?.status === 'captured').length;
  const recoveringAgents = agentRiskEntries.filter((entry) => entry?.recovery_locked).length;
  const sortedAgentRisk = [...agentRiskEntries].sort((a, b) => (Number(b?.risk) || 0) - (Number(a?.risk) || 0));
  const sortedNodeRisk = [...nodeEntries].sort((a, b) => (Number(b?.risk) || 0) - (Number(a?.risk) || 0));
  const currentDistrictNodeRisk = sortedNodeRisk.find((entry) => entry?.district_id === currentDistrictId) || null;
  const sortedDistricts = [...districtEntries].sort((a, b) => (Number(b?.instability) || 0) - (Number(a?.instability) || 0));
  const currentDistrictSignal = districtSignalById[currentDistrictId] || sortedDistricts[0] || null;
  const currentDistrictHunterPressure = hunterDetectionFields
    .filter((entry) => entry?.district_id === currentDistrictId)
    .reduce((highest, entry) => Math.max(highest, Number(entry?.intensity) || 0), 0);
  const hottestHunterField = [...hunterDetectionFields]
    .sort((a, b) => (Number(b?.intensity) || 0) - (Number(a?.intensity) || 0))[0] || null;
  const recoveryCost = Math.max(0, Number(snapshot?.costs?.recovery_boost) || 0);
  const gems = Math.max(0, Number(snapshot?.progression?.gems) || 0);

  return {
    online: true,
    networkHeat,
    samAwareness,
    nodeRiskById,
    districtSignalById,
    agentRiskById,
    hunterUnits,
    hunterDetectionByNodeId,
    counterActions,
    summary: {
      activeAgents,
      exposedAgents,
      capturedAgents,
      recoveringAgents,
      highRiskAgents: agentRiskEntries.filter((entry) => (Number(entry?.risk) || 0) >= 70).length,
      highestRisk: Number(sortedAgentRisk[0]?.risk) || 0,
      highestRiskAgentId: sortedAgentRisk[0]?.agent_id || '',
      hottestNodeId: currentDistrictNodeRisk?.node_id || sortedNodeRisk[0]?.node_id || '',
      hottestDistrictId: sortedDistricts[0]?.district_id || '',
      currentDistrictId: currentDistrictId || '',
      currentDistrictInstability: Number(currentDistrictSignal?.instability) || 0,
      currentDistrictFlag: currentDistrictSignal?.pressure_flag || 'calm',
      recoveryReady: capturedAgents > 0 && recoveryCost > 0 && gems >= recoveryCost,
      recoveryCost,
      urgentRecoveryAgents: agentRiskEntries.filter((entry) => entry?.recovery_locked && entry?.recovery_urgency === 'urgent').length,
      activeCounterActions: Number(counterActions.summary?.active_count) || 0,
      activeNodeScans: counterActions.nodeScans.length,
      activeLocalTraces: counterActions.localTraces.length,
      activeRouteDisruptions: counterActions.routeDisruptions.length,
      activeHunters: hunterUnits.filter((entry) => entry?.active !== false).length,
      currentDistrictHunterPressure,
      hottestHunterNodeId: hottestHunterField?.node_id || '',
    },
    agents,
    operations,
    progression: snapshot?.progression || base.progression,
    costs: snapshot?.costs || {},
    lastSyncAt: Date.now(),
  };
}

async function ensureRpgEntry() {
  if (progressionState.rpg_mode_active) return true;
  const apiBase = getApiBase();
  const telegramAuth = getTelegramAuth();
  if (!apiBase || !telegramAuth?.hash || !telegramAuth?.auth_date) {
    redirectToSyncGate('Auth expired. Run /gklink again to enter Block Topia.', 1600, 'ensureRpgEntry:missing-auth', true);
    return false;
  }
  const res = await fetch(`${apiBase}/blocktopia/progression/entry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_auth: telegramAuth }),
  }).catch(() => null);
  if (!res) return false;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = String(data?.error || data?.message || '').trim();
    if (message === 'Not enough XP for Block Topia entry') {
      hud.showNodeInterference('Not enough XP for Block Topia entry', 'warning');
      hud.pushFeed('🧪 Entry economy: XP required to enter; gems are for upgrades and buffs.', 'system');
    } else if (res.status === 401 || res.status === 403) {
      redirectToSyncGate('Auth expired. Run /gklink again for Block Topia entry.', 1600, 'ensureRpgEntry:entry-401-403', true);
    } else if (message) {
      hud.showNodeInterference(`Progression unavailable: ${message}`, 'warning');
      hud.pushFeed(`⚠️ Progression unavailable: ${message}`, 'system');
    }
    return false;
  }
  setServerProgression({ ...(data?.progression || {}), rpg_mode_active: true });
  return true;
}

async function syncMiniGameOutcome(type, outcome) {
  const miniGameType = String(type || '').toLowerCase();
  if (!MINI_GAME_TYPES.has(miniGameType)) return null;
  const apiBase = getApiBase();
  const telegramAuth = getTelegramAuth();
  if (!apiBase || !telegramAuth?.hash || !telegramAuth?.auth_date) {
    return { ok: false, error: 'Telegram auth missing. Re-sync required.', auth_required: true };
  }
  const action = outcome === 'success' ? 'mini_game_win' : 'mini_game_loss';
  const res = await fetch(`${apiBase}/blocktopia/progression/mini-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      type: miniGameType,
      score: 0,
      telegram_auth: telegramAuth,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data?.progression) setServerProgression(data.progression);
    return {
      ...data,
      ok: false,
      error: data?.error || data?.message || `HTTP ${res.status}`,
      auth_required: res.status === 401 || res.status === 403,
      __httpStatus: res.status,
    };
  }
  if (data?.progression) {
    setServerProgression(data.progression);
  }
  return data;
}

async function boot() {
  let telegramAuth = getTelegramAuth();
  if (!telegramAuth?.hash || !telegramAuth?.auth_date) {
    telegramAuth = await restoreTelegramAuthFromBackend('blocktopia_boot');
  }
  if (!telegramAuth?.hash || !telegramAuth?.auth_date) {
    redirectToSyncGate('Not synced. Run /gklink before entering Block Topia.', 1600, 'boot:missing-auth', true);
    return;
  }
  const progression = await fetchServerProgression({
    allowBootstrap: true,
    bootstrapReason: 'blocktopia_boot_progression',
  });
  if (progression?.__authError) {
    redirectToSyncGate(progression?.error || 'Auth expired. Run /gklink again before entering Block Topia.', 1600, 'boot:progression-auth-error', true);
    return;
  }
  const playerTier = progression.tier || 1;
  const tierDifficulty = computeTierDifficulty(playerTier);
  const dataBundle = await loadUnifiedData();
  const state = createGameState(dataBundle);
  state.covert = createDefaultCovertState();
  state.sharedWorld = createDefaultSharedHunterState();
  state.blockTopiaTier = tierDifficulty.tier;
  state.blockTopiaScale = tierDifficulty.scale;
  state.camera.zoomIndex = 1;
  state.camera.zoom = CAMERA_ZOOM_PRESETS[state.camera.zoomIndex];
  const liveIntelligence = createLiveIntelligence();
  liveIntelligence.configureCanonBridge({
    canon: state.canon || state.lore?.canonAdapter || {},
    districts: state.districtState,
    factions: state.factions,
  });
  const initialLiveRefresh = await liveIntelligence.refresh();
  state.canonSignals = initialLiveRefresh.canonSignalState || liveIntelligence.getCanonSignalState?.() || state.canonSignals;
  const sam = createSamSystem(state);
  const npc = createNpcSystem(state, liveIntelligence);
  const quests = createQuestSystem(state, liveIntelligence);
  const clues = createClueSignalSystem(liveIntelligence);
  const operations = createSignalOperationSystem(state, liveIntelligence);
  const nodeInterference = createNodeInterferenceSystem(state);
  const memory = createMemorySystem(state);
  const duel = createDuelSystem({
    sendChallenge: (targetPlayerId) => sendDuelChallenge(targetPlayerId),
    sendAccept: (duelId) => sendDuelAccept(duelId),
    sendAction: (duelId, action) => sendDuelAction(duelId, action),
  });
  const duelOverlay = createDuelOverlay(document, duel, {
    fighterConfig: DUEL_FIGHTER_CONFIG,
    getLocalPlayerId: () => localSessionId,
  });
  duelOverlay.bindHandlers({
    onSubmitAction: (action) => duel.submitAction(action),
    onAcceptDuel: (duelId) => duel.acceptDuel(duelId),
  });
  const upgradeEffects = progression.effects || DEFAULT_RPG_EFFECTS;
  const outbreakSystem = createNodeOutbreakSystem(state, { tier: tierDifficulty.tier, progression: upgradeEffects });
  const firewallDefense = createFirewallDefenseSystem(state, { tier: tierDifficulty.tier, progression: upgradeEffects });
  const signalRouter = createSignalRouterSystem(state, { tier: tierDifficulty.tier, progression: upgradeEffects });
  const circuitConnect = createCircuitConnectSystem(state, { tier: tierDifficulty.tier, progression: upgradeEffects });
  const outbreakOverlay = createNodeOutbreakOverlay(document, {
    onAction: ({ kind, id }) => {
      const selectedId = outbreakSystem.getPublicState().selectedNodeId;
      let result = null;
      if (kind === 'upgrade') {
        result = outbreakSystem.actions.upgrade(id);
      } else if (id === 'scan') {
        result = outbreakSystem.actions.scanNode(selectedId);
      } else if (id === 'isolate') {
        result = outbreakSystem.actions.isolateNode(selectedId);
      } else if (id === 'delayLink') {
        result = outbreakSystem.actions.delayLink(selectedId);
      } else if (id === 'purge') {
        result = outbreakSystem.actions.purgeNode(selectedId);
      }
      if (!result) return;
      if (!result.ok && result.reason) {
        hud.showNodeInterference(result.reason, 'warning');
      } else if (result.ok) {
        hud.pushFeed(`🛡️ Outbreak action complete: ${id}`, 'combat');
      }
      outbreakOverlay.render(outbreakSystem.getPublicState());
    },
  });
  const firewallOverlay = createFirewallDefenseOverlay(document, {
    onDeploy: (defenseId) => {
      const selectedId = firewallDefense.getPublicState().selectedNodeId;
      const result = firewallDefense.deployDefense(defenseId, selectedId);
      if (!result?.ok && result?.reason) {
        hud.showNodeInterference(result.reason, 'warning');
      } else if (result?.ok) {
        hud.pushFeed(`🛡️ ${defenseId.toUpperCase()} deployed at ${selectedId.toUpperCase()}`, 'combat');
      }
      firewallOverlay.render(firewallDefense.getPublicState());
    },
  });
  const signalRouterOverlay = createSignalRouterOverlay(document, {
    onAction: (actionId) => {
      const selectedId = (state.signalRouterView || signalRouter.getPublicState()).selectedNodeId;
      const action = signalRouter.actions[actionId];
      if (typeof action !== 'function') return;
      const result = action(selectedId);
      if (!result?.ok && result?.reason) {
        hud.showNodeInterference(result.reason, 'warning');
      } else if (result?.ok) {
        hud.pushFeed(`📡 Signal router action: ${actionId}`, 'combat');
      }
      state.signalRouterView = signalRouter.getPublicState();
      signalRouterOverlay.render(state.signalRouterView);
    },
  });
  const circuitConnectOverlay = createCircuitConnectOverlay(document, {
    onAction: (actionId) => {
      const selectedId = syncCircuitPrioritySelection().selectedNodeId;
      const action = circuitConnect.actions[actionId];
      if (typeof action !== 'function') return;
      const result = action(selectedId);
      if (!result?.ok && result?.reason) {
        hud.showNodeInterference(result.reason, 'warning');
      } else if (result?.ok) {
        hud.pushFeed(`🔌 Circuit action: ${actionId}`, 'combat');
      }
      state.circuitConnectView = syncCircuitPrioritySelection({ forceAdvance: result?.ok === true });
      circuitConnectOverlay.render(state.circuitConnectView);
      return result;
    },
    onSkip: () => handleMiniGameOutcome('circuit', 'skip').catch(() => {}),
  });
  let multiplayerConnected = false;
  let wsConnectionFailed = false;
  let localSessionId = '';
  let nearbyNpc = null;
  let selectedRemotePlayer = null;
  let lastNpcScan = performance.now();
  let lastQuestTick = performance.now();
  let lastQuestDistrictId = state.player.districtId;
  let lastHudDistrictId = '';
  let lastHudDistrictControl = null;
  let lastHudDistrictOwner = '';
  let lastInteractPromptText = '';
  let lastInteractPromptVisible = false;
  const seenFeed = new Map();

  // Covert ops: track active operation client-side for countdown / UI.
  const covertOpsLocal = {
    activeOperation: null,  // { operativeId, nodeId, deployedAt, missionDurationMs }
    playerHeat: 0,
    lastResult: null,       // 'success' | 'failure' | null
  };

  // Debug panel state — updated on each connection/snapshot event.
  const debugState = {
    connectionState: 'offline',
    roomName: state.room.id || 'city',
    playerCount: 0,
    maxPlayers: state.room.maxPlayers || 100,
    lastWorldUpdateAt: 0,
  };

  function formatUpdateAge(lastWorldUpdateAt) {
    if (!lastWorldUpdateAt) return 'never';
    const ageMs = Date.now() - lastWorldUpdateAt;
    if (ageMs < 2000) return `${ageMs}ms ago`;
    return `${(ageMs / 1000).toFixed(1)}s ago`;
  }

  function renderDebugPanel() {
    const panel = document.getElementById('debug-panel');
    if (!panel || panel.hidden) return;
    panel.textContent = [
      `Room:        ${debugState.roomName}`,
      `Connection:  ${debugState.connectionState}`,
      `Players:     ${debugState.playerCount} / ${debugState.maxPlayers}`,
      `Last update: ${formatUpdateAge(debugState.lastWorldUpdateAt)}`,
    ].join('\n');
  }
  const sessionGuard = {
    gated: false,
    overlayActive: false,
    activeMiniGame: '',
    sessionDead: false,
    normalInputAllowed: true,
    skipStreak: 0,
    requestGate: createRequestGate(),
  };
  const primaryFactionName = state.factions.primary?.name || 'Liberators';
  const secondaryFactionName = state.factions.secondary?.name || 'Wardens';
  const canonAdapter = state.lore?.canonAdapter || {};
  const canonLore = state.lore?.canon || canonAdapter.canonLore || {};
  const lore = state.lore?.legacy?.lore || {};
  const districtStateById = new Map(state.districtState.map((district) => [district.id, district]));
  const aiRuntime = resolveAiRuntimeConfig();
  let lastCovertHeatTier = state.covert.networkHeat.tier;
  let lastCovertSamTier = state.covert.samAwareness.tier;
  let lastCovertCapturedCount = 0;
  let lastCovertRecoveryReady = false;
  let lastCovertDistrictFlag = 'calm';
  let lastCounterActionSignature = '';
  let lastCovertRoomSyncSignature = '';
  let lastCovertRoomSyncAt = 0;

  function formatDistrictName(districtId) {
    return state.districts.byId.get(districtId)?.name || String(districtId || '').replace(/-/g, ' ');
  }

  function buildCovertRoomReports(covertState = {}) {
    const districtSignals = Object.values(covertState?.districtSignalById || {});
    const traceByDistrictId = covertState?.counterActions?.localTraceByDistrictId || {};
    const routeByDistrictId = Object.fromEntries(
      (covertState?.counterActions?.routeDisruptions || []).map((entry) => [entry.district_id, entry]),
    );
    const nodeScanCountByDistrict = {};
    for (const scan of covertState?.counterActions?.nodeScans || []) {
      if (!scan?.district_id) continue;
      nodeScanCountByDistrict[scan.district_id] = (nodeScanCountByDistrict[scan.district_id] || 0) + 1;
    }
    const hunterPressureByDistrict = {};
    for (const field of Object.values(covertState?.hunterDetectionByNodeId || {})) {
      if (!field?.district_id) continue;
      hunterPressureByDistrict[field.district_id] = Math.max(
        Number(hunterPressureByDistrict[field.district_id]) || 0,
        Number(field?.intensity) || 0,
      );
    }

    const currentDistrictId = state.player.districtId || '';
    const reports = districtSignals.map((entry) => {
      const districtId = entry?.district_id || '';
      const localTrace = traceByDistrictId[districtId] || null;
      const routeDisruption = routeByDistrictId[districtId] || null;
      const nodeScanCount = Number(nodeScanCountByDistrict[districtId]) || 0;
      const hunterPressure = Number(hunterPressureByDistrict[districtId]) || 0;
      const pressureWeight = Math.max(
        0,
        (Number(entry?.instability) || 0)
          + ((Number(entry?.sabotage_pressure) || 0) * 2.4)
          + ((Number(entry?.sam_watch) || 0) * 2.1)
          + (localTrace ? 16 : 0)
          + (routeDisruption ? 12 : 0)
          + (nodeScanCount * 4)
          + (hunterPressure * 5)
          + ((Number(covertState?.networkHeat?.value) || 0) * 0.12)
          + ((Number(covertState?.samAwareness?.sensitivity) || 0) * 0.14),
      );
      return {
        districtId,
        pressureWeight: Math.round(pressureWeight),
        repeatedPressure: Math.max(0, Number(entry?.sabotage_pressure) || 0),
        localTraceCount: localTrace ? 1 : 0,
        routeDisruptionCount: routeDisruption ? 1 : 0,
        nodeScanCount,
        hunterPressure: Math.round(hunterPressure),
        networkHeat: Math.round(Number(covertState?.networkHeat?.value) || 0),
        samAwareness: Math.round(Number(covertState?.samAwareness?.sensitivity) || 0),
        districtInstability: Math.round(Number(entry?.instability) || 0),
        currentDistrict: districtId === currentDistrictId,
      };
    });

    return reports
      .filter((entry) => entry.districtId)
      .sort((left, right) => (
        (Number(right.currentDistrict) - Number(left.currentDistrict))
        || (Number(right.localTraceCount) - Number(left.localTraceCount))
        || (Number(right.routeDisruptionCount) - Number(left.routeDisruptionCount))
        || ((Number(right.pressureWeight) || 0) - (Number(left.pressureWeight) || 0))
      ))
      .slice(0, 3)
      .map(({ currentDistrict, ...entry }) => entry);
  }

  function syncCovertPressureToRoom(covertState = {}, force = false) {
    if (!multiplayerConnected) return;
    const reports = buildCovertRoomReports(covertState);
    if (!reports.length) return;
    const signature = reports
      .map((entry) => [
        entry.districtId,
        entry.pressureWeight,
        entry.localTraceCount,
        entry.routeDisruptionCount,
        entry.nodeScanCount,
        entry.hunterPressure,
      ].join(':'))
      .join('|');
    const now = Date.now();
    if (!force && signature === lastCovertRoomSyncSignature && (now - lastCovertRoomSyncAt) < 10000) return;
    sendCovertPressureSync(reports);
    lastCovertRoomSyncSignature = signature;
    lastCovertRoomSyncAt = now;
  }

  function alignCovertDistrictFocus() {
    const current = state.covert?.districtSignalById?.[state.player.districtId] || null;
    if (!state.covert?.summary) return;
    state.covert.progression = {
      ...(state.covert.progression || {}),
      gems: Math.max(0, Number(progressionState.gems) || 0),
      xp: Math.max(0, Number(progressionState.xp) || 0),
      tier: Math.max(1, Number(progressionState.tier) || Number(state.covert.progression?.tier) || 1),
    };
    state.covert.summary.recoveryReady = state.covert.summary.capturedAgents > 0
      && (Number(state.covert.summary.recoveryCost) || 0) > 0
      && (Number(state.covert.progression?.gems) || 0) >= (Number(state.covert.summary.recoveryCost) || 0);
    state.covert.summary.currentDistrictId = state.player.districtId || '';
    if (!current) {
      state.covert.summary.currentDistrictInstability = 0;
      state.covert.summary.currentDistrictFlag = 'calm';
      return;
    }
    state.covert.summary.currentDistrictInstability = Number(current.instability) || 0;
    state.covert.summary.currentDistrictFlag = current.pressure_flag || 'calm';
  }

  function buildHudCovertSnapshot() {
    const currentDistrictId = state.player.districtId || '';
    const sharedWorld = state.sharedWorld || createDefaultSharedHunterState();
    const covertHunterUnits = Array.isArray(state.covert?.hunterUnits) ? state.covert.hunterUnits : [];
    const covertHunterDetectionByNodeId = state.covert?.hunterDetectionByNodeId || {};
    const useSharedHunters =
      (Number(sharedWorld.summary?.activeHunters) || 0) > 0
      || Object.keys(sharedWorld.hunterDetectionByNodeId || {}).length > 0
      || Object.keys(sharedWorld.districtPatrolById || {}).length > 0;
    const hunterUnits = useSharedHunters ? sharedWorld.samHunters : covertHunterUnits;
    const hunterDetectionByNodeId = useSharedHunters
      ? (sharedWorld.hunterDetectionByNodeId || {})
      : covertHunterDetectionByNodeId;
    const currentDistrictPatrol = sharedWorld.districtPatrolById?.[currentDistrictId] || null;
    const currentDistrictHunterPressure = Object.values(hunterDetectionByNodeId)
      .filter((entry) => entry?.district_id === currentDistrictId)
      .reduce((highest, entry) => Math.max(highest, Number(entry?.intensity) || 0), 0);
    const merged = {
      ...state.covert,
      hunterUnits,
      hunterDetectionByNodeId,
      districtPatrolById: sharedWorld.districtPatrolById || {},
      summary: {
        ...(state.covert?.summary || {}),
        activeHunters: useSharedHunters
          ? (Number(sharedWorld.summary?.activeHunters) || 0)
          : covertHunterUnits.filter((entry) => entry?.active !== false).length,
        currentDistrictHunterPressure,
        currentDistrictId,
        currentDistrictPostureState: sharedWorld.summary?.currentDistrictPostureState || 'normal',
        currentDistrictPostureScore: Number(sharedWorld.summary?.currentDistrictPostureScore) || 0,
        currentDistrictWarningLine: sharedWorld.summary?.currentDistrictWarningLine || '',
        hottestHunterNodeId: useSharedHunters
          ? (sharedWorld.summary?.hottestHunterNodeId || '')
          : (state.covert?.summary?.hottestHunterNodeId || ''),
      },
    };
    if (currentDistrictPatrol) {
      merged.summary.currentDistrictFlag = currentDistrictPatrol.postureState || sharedPatrolFlag(
        currentDistrictPatrol.patrolMode,
        merged.summary.currentDistrictFlag,
      );
      merged.summary.currentDistrictPatrolMode = currentDistrictPatrol.patrolMode;
      merged.summary.currentDistrictInstability = Math.max(
        Number(merged.summary.currentDistrictInstability) || 0,
        Math.round(Number(currentDistrictPatrol.postureScore || currentDistrictPatrol.pressureScore) || 0),
      );
    }
    return merged;
  }

  function syncCovertHud() {
    alignCovertDistrictFocus();
    hud.setCovertState(buildHudCovertSnapshot());
  }

  function refreshCovertOpsPanel() {
    const panel = document.getElementById('covert-ops-panel');
    if (!panel) return;
    const deployBtn = document.getElementById('covert-deploy-btn');
    const countdownEl = document.getElementById('covert-countdown');
    const heatEl = document.getElementById('covert-player-heat');
    const resultEl = document.getElementById('covert-result');
    const targetEl = document.getElementById('covert-node-target');
    const selectedNodeId = state.mouse?.selectedNodeId || '';
    const now = Date.now();
    const op = covertOpsLocal.activeOperation;

    if (heatEl) {
      heatEl.textContent = `Heat: ${Math.round(covertOpsLocal.playerHeat)}`;
    }

    if (op) {
      const elapsed = now - op.deployedAt;
      const remaining = Math.max(0, op.missionDurationMs - elapsed);
      const secs = Math.ceil(remaining / 1000);
      if (countdownEl) countdownEl.textContent = secs > 0 ? `⏳ Mission: ${secs}s` : '⏳ Resolving…';
      if (targetEl) targetEl.textContent = `Target: ${String(op.nodeId || '').toUpperCase()}`;
      if (deployBtn) deployBtn.disabled = true;
      panel.classList.remove('hidden');
    } else {
      if (countdownEl) countdownEl.textContent = '';
      if (targetEl) {
        targetEl.textContent = selectedNodeId ? `Target: ${selectedNodeId.toUpperCase()}` : '';
      }
      if (deployBtn) {
        deployBtn.disabled = !selectedNodeId;
        deployBtn.textContent = selectedNodeId
          ? `${COVERT_DEPLOY_BTN_TEXT} → ${selectedNodeId.toUpperCase()}`
          : `${COVERT_DEPLOY_BTN_TEXT} (select node)`;
      }
      if (selectedNodeId || covertOpsLocal.lastResult) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    }

    if (resultEl && covertOpsLocal.lastResult) {
      resultEl.textContent = covertOpsLocal.lastResult === 'success'
        ? '✅ Last op: Success'
        : '❌ Last op: Failure';
      resultEl.className = `covert-result covert-result--${covertOpsLocal.lastResult}`;
    } else if (resultEl) {
      resultEl.textContent = '';
    }
  }

  function getCovertWatchLine(covertState) {
    const flags = Array.isArray(covertState?.samAwareness?.pressure_flags) ? covertState.samAwareness.pressure_flags : [];
    if ((Number(covertState?.summary?.activeHunters) || 0) > 0) return 'hunter patrols deployed';
    if ((Number(covertState?.summary?.activeRouteDisruptions) || 0) > 0) return 'routes disrupted';
    if ((Number(covertState?.summary?.activeLocalTraces) || 0) > 0) return 'district under trace';
    if ((Number(covertState?.summary?.activeNodeScans) || 0) > 0) return 'nodes under scan';
    if (flags.includes('capture_pressure_rising')) return 'covert routes compromised';
    if (flags.includes('sam_listening')) return 'under watch';
    if (flags.includes('repeat_targeting_detected')) return 'signal traced';
    if ((Number(covertState?.networkHeat?.value) || 0) >= 70) return 'district surveillance elevated';
    if ((Number(covertState?.networkHeat?.value) || 0) >= 45) return 'watch lanes tightening';
    return 'signal cover intact';
  }

  function applyCovertSnapshot(payload, source = 'poll') {
    const previous = state.covert || createDefaultCovertState();
    const next = normalizeCovertState(payload, state.player.districtId);
    state.covert = next;
    syncCovertHud();
    syncCovertPressureToRoom(next);

    if (source === 'silent') return;

    const counterActionSignature = [
      ...next.counterActions.nodeScans.map((entry) => entry.id),
      ...next.counterActions.localTraces.map((entry) => entry.id),
      ...next.counterActions.routeDisruptions.map((entry) => entry.id),
    ].join('|');
    if (counterActionSignature !== lastCounterActionSignature) {
      const primaryCounterAction = next.counterActions.summary?.primary_action_label;
      if ((Number(next.summary.activeCounterActions) || 0) > 0 && primaryCounterAction) {
        pushFeedDeduped(
          `SAM counter-action live · ${primaryCounterAction}`,
          'sam',
          `covert-counter:${counterActionSignature}`,
        );
        hud.showNodeInterference(primaryCounterAction, 'sam');
      } else if (lastCounterActionSignature) {
        pushFeedDeduped(
          'SAM counter-action window faded · covert lanes briefly stabilizing',
          'system',
          'covert-counter:cleared',
        );
      }
      lastCounterActionSignature = counterActionSignature;
    }

    if (next.networkHeat.tier !== lastCovertHeatTier) {
      const watchLine = getCovertWatchLine(next);
      pushFeedDeduped(
        `🕳️ Network heat ${String(next.networkHeat.tier || 'cold').toUpperCase()} · ${watchLine}`,
        next.networkHeat.value >= 50 ? 'sam' : 'system',
        `covert-heat:${next.networkHeat.tier}`,
      );
      lastCovertHeatTier = next.networkHeat.tier;
    }

    if (next.samAwareness.tier !== lastCovertSamTier && (Number(next.samAwareness.sensitivity) || 0) >= 25) {
      pushFeedDeduped(
        `🧠 SAM awareness ${String(next.samAwareness.tier || 'cold').toUpperCase()} · ${getCovertWatchLine(next)}`,
        'sam',
        `covert-sam:${next.samAwareness.tier}`,
      );
      lastCovertSamTier = next.samAwareness.tier;
    }

    if (next.summary.capturedAgents > lastCovertCapturedCount) {
      pushFeedDeduped(
        `⚠️ Agent captured · ${next.summary.recoveringAgents} recovering · recovery window active`,
        'sam',
        `covert-captured:${next.summary.capturedAgents}`,
      );
      hud.showNodeInterference('Agent captured. Recovery timer live.', 'sam');
      lastCovertCapturedCount = next.summary.capturedAgents;
    } else if (next.summary.capturedAgents < lastCovertCapturedCount) {
      pushFeedDeduped(
        `✅ Captured agent recovered · covert roster stabilizing`,
        'quest',
        `covert-recovered:${next.summary.capturedAgents}`,
      );
      lastCovertCapturedCount = next.summary.capturedAgents;
    }

    if (next.summary.recoveryReady && !lastCovertRecoveryReady) {
      pushFeedDeduped(
        `💎 Recovery boost ready · ${next.summary.recoveryCost} gems can accelerate captured agent recovery`,
        'system',
        `covert-recovery-ready:${next.summary.recoveryCost}`,
      );
      lastCovertRecoveryReady = true;
    } else if (!next.summary.recoveryReady) {
      lastCovertRecoveryReady = false;
    }

    if ((next.summary.highestRisk >= 80) && (previous.summary?.highestRisk || 0) < 80) {
      pushFeedDeduped(
        `⚠️ High-risk agent warning · exposure ${next.summary.highestRisk}% · covert routes compromised`,
        'sam',
        `covert-high-risk:${next.summary.highestRiskAgentId}:${next.summary.highestRisk}`,
      );
    }

    if ((next.summary.currentDistrictFlag !== lastCovertDistrictFlag) && (Number(next.summary.currentDistrictInstability) || 0) >= 5) {
      pushFeedDeduped(
        `🗺️ ${formatDistrictName(state.player.districtId)} now feels ${String(next.summary.currentDistrictFlag).toUpperCase()} · instability ${Math.round(next.summary.currentDistrictInstability)}`,
        next.summary.currentDistrictInstability >= 10 ? 'sam' : 'combat',
        `covert-district:${state.player.districtId}:${next.summary.currentDistrictFlag}:${Math.round(next.summary.currentDistrictInstability)}`,
      );
      lastCovertDistrictFlag = next.summary.currentDistrictFlag;
    } else if ((Number(next.summary.currentDistrictInstability) || 0) < 5) {
      lastCovertDistrictFlag = next.summary.currentDistrictFlag;
    }

    if ((Number(next.summary.urgentRecoveryAgents) || 0) > 0 && !(Number(previous.summary?.urgentRecoveryAgents) > 0)) {
      pushFeedDeduped(
        `Recovery urgency rising · ${next.summary.urgentRecoveryAgents} captured agent${next.summary.urgentRecoveryAgents === 1 ? '' : 's'} inside active SAM pressure`,
        'sam',
        `covert-urgent-recovery:${next.summary.urgentRecoveryAgents}`,
      );
    }

    if ((Number(next.summary.activeHunters) || 0) !== (Number(previous.summary?.activeHunters) || 0)) {
      if ((Number(next.summary.activeHunters) || 0) > 0) {
        const districtId = next.hunterUnits?.[0]?.district_id || next.summary.currentDistrictId || next.summary.hottestDistrictId;
        pushFeedDeduped(
          `🛰️ SAM hunter patrols deployed · ${formatDistrictName(districtId)} now under moving surveillance`,
          'sam',
          `covert-hunters:${next.summary.activeHunters}:${districtId}`,
        );
        hud.showNodeInterference('SAM hunter patrol moving through the district.', 'sam');
      } else {
        pushFeedDeduped(
          '🛰️ Hunter patrol pressure eased · covert lanes briefly opening',
          'system',
          'covert-hunters:cleared',
        );
      }
    }

    if (
      (Number(next.summary.currentDistrictHunterPressure) || 0) >= 4
      && (Number(previous.summary?.currentDistrictHunterPressure) || 0) < 4
    ) {
      pushFeedDeduped(
        `⚠️ ${formatDistrictName(state.player.districtId)} under SAM hunter scan pressure · covert outcomes are degrading here`,
        'sam',
        `covert-hunter-zone:${state.player.districtId}:${Math.round(next.summary.currentDistrictHunterPressure)}`,
      );
    }
  }

  function applySharedHunterSnapshot(payload, source = 'snapshot') {
    const previous = state.sharedWorld || createDefaultSharedHunterState();
    const next = normalizeSharedHunterState(payload, state.player.districtId);
    state.sharedWorld = next;
    hud.setDistrictPosture(next.summary?.currentDistrictPostureState || 'normal');
    syncCovertHud();
    updateReactiveGridState(state);

    if (source === 'silent') return;

    const previousHunters = Number(previous.summary?.activeHunters) || 0;
    const nextHunters = Number(next.summary?.activeHunters) || 0;
    if (nextHunters !== previousHunters) {
      if (nextHunters > 0) {
        const districtId = next.summary.hottestDistrictId || state.player.districtId || '';
        pushFeedDeduped(
          `SAM hunter patrols deployed in shared city space - ${formatDistrictName(districtId)} now under moving surveillance`,
          'sam',
          `shared-hunters:${nextHunters}:${districtId}`,
        );
      } else {
        pushFeedDeduped(
          'Hunter patrol pressure eased across the room',
          'system',
          'shared-hunters:cleared',
        );
      }
    }

    const previousPressure = Number(previous.summary?.currentDistrictHunterPressure) || 0;
    const nextPressure = Number(next.summary?.currentDistrictHunterPressure) || 0;
    if (nextPressure >= 4 && previousPressure < 4) {
      pushFeedDeduped(
        `${formatDistrictName(state.player.districtId)} is under coordinated SAM patrol focus`,
        'sam',
        `shared-hunter-zone:${state.player.districtId}:${Math.round(nextPressure)}`,
      );
      pushMicroNotification(`${formatDistrictName(state.player.districtId)} patrol pressure rising`, 'warning');
    }

    const previousMode = String(previous.summary?.currentDistrictPatrolMode || '');
    const nextMode = String(next.summary?.currentDistrictPatrolMode || '');
    if (nextMode && nextMode !== previousMode) {
      const readableMode = nextMode.replace(/-/g, ' ');
      pushFeedDeduped(
        `${formatDistrictName(state.player.districtId)} patrol mode shifted to ${readableMode}`,
        nextMode === 'cool-down' ? 'system' : 'combat',
        `shared-hunter-mode:${state.player.districtId}:${nextMode}`,
      );
    }

    const previousPosture = String(previous.summary?.currentDistrictPostureState || 'normal');
    const nextPosture = String(next.summary?.currentDistrictPostureState || 'normal');
    if (nextPosture !== previousPosture && nextPosture !== 'normal') {
      const plan = next.districtPatrolById?.[state.player.districtId] || null;
      pushFeedDeduped(
        `${formatDistrictName(state.player.districtId)} shifted to ${nextPosture.replace(/_/g, ' ')} posture · ${plan?.warningLine || 'district access pressure rising'}`,
        nextPosture === 'pre_lockdown' ? 'sam' : 'combat',
        `shared-district-posture:${state.player.districtId}:${nextPosture}`,
      );
      pushMicroNotification(
        nextPosture === 'pre_lockdown'
          ? `${formatDistrictName(state.player.districtId)} preparing lockdown lanes`
          : `${formatDistrictName(state.player.districtId)} surveillance posture rising`,
        'warning',
      );
    } else if (previousPosture !== 'normal' && nextPosture === 'normal') {
      pushFeedDeduped(
        `${formatDistrictName(state.player.districtId)} eased back to normal patrol posture`,
        'system',
        `shared-district-posture:${state.player.districtId}:normal`,
      );
    }
  }

  hud.setAiStatus(aiRuntime.status);
  hud.pushFeed(`🧱 Block Topia tier ${tierDifficulty.tier} · difficulty x${tierDifficulty.scale.toFixed(2)}`, 'system');
  if (aiRuntime.hasConfig) {
    hud.pushFeed(
      `🤖 AI config detected · ${aiRuntime.enabled ? 'enabled' : 'disabled'} · endpoint ${aiRuntime.endpoint}`,
      'system',
    );
    if (!aiRuntime.model) {
      hud.pushFeed('⚠️ AI relay config missing model; set BLOCK_TOPIA_AI.model for relay checks', 'system');
    }
  } else {
    hud.pushFeed('🤖 AI relay disabled: no BLOCK_TOPIA_AI runtime config', 'system');
  }
  window.blockTopiaAiProbe = () => ({
    ...aiRuntime,
    note: 'Runtime config probe only. No OpenAI request is performed in this build.',
  });

  function clampZoom(value) {
    return Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, value));
  }

  function syncZoomIndexToCurrentZoom() {
    let nearest = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < CAMERA_ZOOM_PRESETS.length; i += 1) {
      const delta = Math.abs(CAMERA_ZOOM_PRESETS[i] - state.camera.zoom);
      if (delta < bestDelta) {
        bestDelta = delta;
        nearest = i;
      }
    }
    state.camera.zoomIndex = nearest;
  }

  function isMovementInputActive() {
    return Boolean(
      input.w
      || input.a
      || input.s
      || input.d
      || input.arrowup
      || input.arrowdown
      || input.arrowleft
      || input.arrowright,
    );
  }

  function isEditableTarget(target) {
    if (!target) return false;
    const tag = String(target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function shouldIgnoreHotkey(event) {
    return event.defaultPrevented || isEditableTarget(event.target);
  }

  function isNpcInInteractionRange(targetNpc) {
    if (!targetNpc) return false;
    const dx = targetNpc.col - state.player.x;
    const dy = targetNpc.row - state.player.y;
    return Math.hypot(dx, dy) <= targetNpc.interactionRadius;
  }

  function tryInteractWithClickedNpc(event) {
    const clickedNpc = renderer.pickNpcFromClientPoint(event.clientX, event.clientY, state);
    if (!clickedNpc || !isNpcInInteractionRange(clickedNpc)) return false;
    interactWithNpc(clickedNpc);
    return true;
  }

  function tryInteractWithClickedNode(event) {
    const node = renderer.pickControlNodeFromClientPoint(event.clientX, event.clientY, state);
    if (!node) return false;
    state.mouse.selectedNodeId = node.id;
    updateNodeTooltip(node.id);
    circuitConnect.setSelectedNode(node.id);
    state.circuitConnectView = circuitConnect.getPublicState();
    const circuitState = state.circuitConnectView;
    if (circuitState.active) {
      circuitConnectOverlay.render(circuitState);
      hud.showNodeInterference(`Recovery node locked: ${node.id.toUpperCase()}`, 'signal');
      return true;
    }
    firewallDefense.setSelectedNode(node.id);
    const firewallState = firewallDefense.getPublicState();
    if (firewallState.active) {
      firewallOverlay.render(firewallState);
      hud.showNodeInterference(`Firewall target locked: ${node.id.toUpperCase()}`, 'signal');
      return true;
    }
    outbreakSystem.setSelectedNode(node.id);
    const outbreakState = outbreakSystem.getPublicState();
    if (outbreakState.active) {
      outbreakOverlay.render(outbreakState);
      hud.showNodeInterference(`Outbreak target locked: ${node.id.toUpperCase()}`, 'signal');
      return true;
    }
    signalRouter.setSelectedNode(node.id);
    const signalRouterState = state.signalRouterView || signalRouter.getPublicState();
    if (signalRouterState.active) {
      signalRouterOverlay.render(signalRouterState);
      hud.showNodeInterference(`Route node locked: ${node.id.toUpperCase()}`, 'signal');
      return true;
    }
    if (!nodeInterference.canInterfere(node.id)) {
      const remainingMs = Math.max(0, (Number(node.cooldownUntil) || 0) - Date.now());
      const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
      hud.showNodeInterference(`Node ${node.id.toUpperCase()} in cooldown · ${remainingSec}s remaining`, 'warning');
      return true;
    }
    // Guard: do not send nodeInterfere until multiplayer is fully joined.
    // This prevents partial messages reaching the server while the player state isn't ready,
    // which would cause the server handler to reject the click and could flip LIVE LINK to unavailable.
    if (!multiplayerConnected) {
      hud.showNodeInterference('Connecting to live city…', 'system');
      return true;
    }
    // Visual-only optimistic pulse — node state is server-authoritative.
    // All real effects (status, feed, HUD, NPC, SAM) come from onNodeInterferenceChanged.
    nodeInterference.beginLocalPulse(node.id);
    sendNodeInterference(node.id, event.shiftKey ? 'assist' : 'disrupt');
    refreshCovertOpsPanel();
    return true;
  }

  function classifyFeedType(text) {
    const lower = String(text || '').toLowerCase();
    if (lower.includes('sam') || lower.includes('signal rush') || lower.includes('phase')) return 'sam';
    if (lower.includes('quest') || lower.includes('xp') || lower.includes('operation')) return 'quest';
    if (lower.includes('captured') || lower.includes('district') || lower.includes('duel') || lower.includes('node')) return 'combat';
    return 'system';
  }

  // Node tooltip — shows plain-English node info on selection; default guidance when nothing is selected.
  function updateNodeTooltip(nodeId) {
    const tooltip = document.getElementById('node-tooltip');
    if (!tooltip) return;
    if (!nodeId) {
      const emptyText = wsConnectionFailed
        ? 'Live city unavailable. Try again later.'
        : (!multiplayerConnected ? 'Connecting to live city…' : 'Select a glowing node to deploy Signal Runner.');
      tooltip.innerHTML = emptyText;
      return;
    }
    const node = state.controlNodes.find((n) => n.id === nodeId) || {};
    const risk = state.covert?.nodeRiskById?.[nodeId] || {};
    const district = formatDistrictName(node.districtId || '');
    const control = Number.isFinite(node.control) ? `${Math.round(node.control * 100)}%` : '—';
    const nodeHeat = Number.isFinite(risk.risk) ? Math.round(risk.risk) : '—';
    const status = String(node.status || 'stable').replace(/_/g, ' ').toUpperCase();
    const action = covertOpsLocal.activeOperation ? 'Mission in progress…' : 'Deploy Signal Runner';
    tooltip.innerHTML = [
      `<strong>${nodeId.toUpperCase()}</strong> · ${district}`,
      `Control: ${control} · Status: ${status}`,
      `Node Heat: ${nodeHeat}`,
      `Action: ${action}`,
      `<em>High heat means SAM is watching this node.</em>`,
    ].join('<br>');
  }

  function applyPhase(nextPhase, source = 'local') {
    state.phase = nextPhase;
    hud.setPhase(state.phase);
    hud.triggerPhaseTransition(state.phase);
    hud.pushFeed(
      `🌗 ${source === 'server' ? 'Network relay' : 'Local relay'} confirmed phase shift: ${state.phase}`,
      'system',
    );
    canvas.classList.toggle('phase-night', state.phase === 'Night');
    document.body.classList.toggle('phase-night', state.phase === 'Night');
    // Street Signal feature: canvas filter for immediate phase visual feedback.
    canvas.style.filter = state.phase === 'Night'
      ? 'brightness(0.54) saturate(1.2) hue-rotate(24deg)'
      : 'none';
  }

  function pickCanonBootstrapLine() {
    if (Array.isArray(canonAdapter.blockTopiaFacts) && canonAdapter.blockTopiaFacts.length) {
      return canonAdapter.blockTopiaFacts[0];
    }
    if (Array.isArray(canonLore.feedLines) && canonLore.feedLines.length) {
      return canonLore.feedLines[0];
    }
    return '';
  }

  function bootstrapLoreFeed() {
    const canonLine = pickCanonBootstrapLine();
    if (canonLine) {
      hud.pushFeed(`📜 ${canonLine}`, 'system');
    } else {
      const districtFlavor = lore?.districts?.[0]?.flavor?.[0];
      if (districtFlavor) hud.pushFeed(`📰 [Backup lore] ${districtFlavor}`, 'system');
    }

    const districtFlavorLine = canonAdapter?.districtLoreById?.[state.player.districtId]?.flavor?.[0];
    if (districtFlavorLine) {
      hud.pushFeed(`🏙️ ${state.player.districtName}: ${districtFlavorLine}`, 'system');
    }

    const rumorPool = Array.isArray(canonAdapter.npcRumorPool) && canonAdapter.npcRumorPool.length
      ? canonAdapter.npcRumorPool
      : Array.isArray(canonLore.npcRumors) && canonLore.npcRumors.length
        ? canonLore.npcRumors
        : lore?.npc_rumors;
    if (!Array.isArray(rumorPool) || rumorPool.length === 0) return;
    const rumor = rumorPool[Math.floor(Math.random() * rumorPool.length)];
    if (rumor) {
      const prefix = canonAdapter.fallbackUsed || canonLore.fallbackUsed ? '🗞️ [Backup lore]' : '🗞️';
      hud.pushFeed(`${prefix} ${rumor}`, 'system');
    }
  }

  function getCanonAtmosphereLine() {
    const canonSignalState = state.canonSignals || liveIntelligence.getCanonSignalState?.() || {};
    const samTone = canonSignalState.samNarrativeState?.tone || [];
    const districtFlavor = canonAdapter?.districtLoreById?.[state.player.districtId]?.flavor || [];
    const flavorPool = [
      ...samTone,
      ...districtFlavor,
      ...(canonAdapter.worldFlavorPool || []),
    ].filter(Boolean);
    return flavorPool[0] || 'Canon relay synced across districts.';
  }

  function challengeRemotePlayer(remotePlayer) {
    if (!remotePlayer?.id) return;
    if (remotePlayer.id === localSessionId) {
      hud.pushFeed('⚠️ Duel link denied: self-target blocked.', 'system');
      return;
    }
    const ok = duel.challengePlayer(remotePlayer.id);
    if (!ok) return;
    selectedRemotePlayer = remotePlayer;
    state.mouse.selectedRemotePlayerId = remotePlayer.id;
    hud.pushFeed(`⚔️ Duel request sent to ${remotePlayer.name || remotePlayer.id}`, 'combat');
    duelOverlay.render();
  }

  function bootstrapEntryIdentity() {
    hud.setEntryTagline(`Deploying into ${state.player.districtName} · Entry uses XP (not gems) · Telegram sync stores XP/GEMS progression.`);
    hud.pushFeed('🧪 Block Topia entry spends XP only. Gems are for upgrades and deeper RPG progression.', 'system');
  }

  function applyDuelEndedRipple(payload = {}) {
    if (Number.isFinite(payload?.samPressure)) {
      state.sam.pressure = Math.max(0, Math.min(100, Number(payload.samPressure)));
    }
    if (payload?.rippleDistrictId && Number.isFinite(payload?.rippleDistrictControl)) {
      applyDistrictControlUpdate({
        districtId: payload.rippleDistrictId,
        control: Number(payload.rippleDistrictControl),
      }, 'duel');
    }
  }

  function isLocalDuelParticipant(payload = {}) {
    if (!localSessionId) return false;
    return payload.playerA === localSessionId || payload.playerB === localSessionId;
  }

  function pushFeedDeduped(text, type = 'system', key = '') {
    const cacheKey = key || `${type}:${text}`;
    const now = Date.now();
    const lastSeen = seenFeed.get(cacheKey) || 0;
    if (now - lastSeen < FEED_DEDUPE_TTL_MS) return false;
    seenFeed.set(cacheKey, now);
    if (seenFeed.size > MAX_FEED_CACHE_SIZE) {
      for (const [entryKey, ts] of seenFeed) {
        if (now - ts > FEED_DEDUPE_TTL_MS) {
          seenFeed.delete(entryKey);
        }
      }
    }
    hud.pushFeed(text, type);
    if (type === 'combat' || type === 'quest' || /district|xp|influence|unstable|conflict/i.test(String(text))) {
      pushMicroNotification(text, type === 'quest' ? 'success' : (type === 'combat' ? 'warning' : 'info'));
    }
    return true;
  }

  function syncHudProgression() {
    hud.setXp(progressionState.xp || 0);
    hud.setGems(progressionState.gems || 0);
    hud.setDrainPerMinute(progressionState.drain_per_minute || 0);
    syncCovertHud();
  }

  function closeMiniGameOverlays() {
    outbreakSystem.setSelectedNode('');
    firewallDefense.setSelectedNode('');
    signalRouter.setSelectedNode('');
    circuitConnect.setSelectedNode('');
    outbreakOverlay.render({ active: false });
    firewallOverlay.render({ active: false });
    signalRouterOverlay.render({ active: false });
    circuitConnectOverlay.render({ active: false });
    state.signalRouterView = signalRouter.getPublicState();
    state.circuitConnectView = circuitConnect.getPublicState();
  }

  function getCircuitPriorityObjective(view = {}) {
    const objectives = (view.objectives || []).filter((objective) => !objective.complete);
    if (!objectives.length) return null;
    return objectives
      .slice()
      .sort((a, b) => {
        const aIntegrity = a.type === 'minimum_integrity' ? 1 : 0;
        const bIntegrity = b.type === 'minimum_integrity' ? 1 : 0;
        if (aIntegrity !== bIntegrity) return aIntegrity - bIntegrity;
        return (Number(a.timeLeftMs) || 0) - (Number(b.timeLeftMs) || 0);
      })[0];
  }

  function getCircuitPriorityNodeId(view = {}) {
    const selectedId = String(view.selectedNodeId || '');
    const objective = getCircuitPriorityObjective(view);
    if (!objective) return selectedId;
    if (objective.edgeId) {
      const edge = (view.links || []).find((entry) => entry.id === objective.edgeId);
      if (selectedId && (selectedId === edge?.fromId || selectedId === edge?.toId)) return selectedId;
      return edge?.fromId || edge?.toId || selectedId;
    }
    if (selectedId && (selectedId === objective.fromId || selectedId === objective.toId)) return selectedId;
    return objective.fromId || objective.toId || selectedId;
  }

  function syncCircuitPrioritySelection({ forceAdvance = false } = {}) {
    const current = state.circuitConnectView || circuitConnect.getPublicState();
    if (!current.active) {
      state.circuitConnectView = current;
      return current;
    }
    const objective = getCircuitPriorityObjective(current);
    const selectedId = String(current.selectedNodeId || '');
    const targetId = getCircuitPriorityNodeId(current);
    const objectiveEdge = objective?.edgeId
      ? (current.links || []).find((entry) => entry.id === objective.edgeId)
      : null;
    const selectedRelevant = objective
      ? (
        selectedId === objective.fromId
        || selectedId === objective.toId
        || (objectiveEdge && (objectiveEdge.fromId === selectedId || objectiveEdge.toId === selectedId))
      )
      : Boolean(selectedId);
    if (targetId && (forceAdvance || !selectedId || !selectedRelevant) && targetId !== selectedId) {
      circuitConnect.setSelectedNode(targetId);
    }
    state.circuitConnectView = circuitConnect.getPublicState();
    return state.circuitConnectView;
  }

  function setActiveMiniGame(type) {
    sessionGuard.overlayActive = Boolean(type);
    sessionGuard.activeMiniGame = type || '';
    sessionGuard.normalInputAllowed = !sessionGuard.overlayActive && !sessionGuard.sessionDead && !sessionGuard.gated;
    setBodyStateClass('has-mini-game', sessionGuard.overlayActive);
  }

  function holdBackgroundSync(ms = MINI_GAME_SYNC_QUIET_MS) {
    sessionGuard.requestGate.quietUntil = Math.max(
      sessionGuard.requestGate.quietUntil,
      Date.now() + Math.max(800, Number(ms) || 0),
    );
  }

  function hasPendingMiniGameSync(type = '') {
    const safeType = String(type || '').toLowerCase();
    if (safeType && sessionGuard.requestGate.outcomes.has(safeType)) return true;
    return sessionGuard.requestGate.outcomes.size > 0;
  }

  function shouldPauseBackgroundSync() {
    return sessionGuard.sessionDead
      || sessionGuard.gated
      || sessionGuard.overlayActive
      || sessionGuard.requestGate.affordability.size > 0
      || sessionGuard.requestGate.outcomes.size > 0
      || Date.now() < sessionGuard.requestGate.quietUntil;
  }

  function scheduleManagedPoll(intervalMs, runner) {
    async function tick() {
      try {
        await runner();
      } catch {}
      window.setTimeout(tick, intervalMs);
    }
    window.setTimeout(tick, intervalMs);
  }

  async function ensureMiniGamePlayable(type) {
    const miniGameType = String(type || '').toLowerCase();
    if (!MINI_GAME_TYPES.has(miniGameType)) return false;
    if (sessionGuard.sessionDead || sessionGuard.gated) return false;
    if (sessionGuard.overlayActive && sessionGuard.activeMiniGame && sessionGuard.activeMiniGame !== miniGameType) return false;
    if (sessionGuard.requestGate.affordability.has(miniGameType) || hasPendingMiniGameSync(miniGameType)) return false;
    sessionGuard.requestGate.affordability.set(miniGameType, true);
    holdBackgroundSync(MINI_GAME_ENTRY_QUIET_MS);
    let server = null;
    try {
      server = await fetchMiniGameAffordability(miniGameType);
    } finally {
      sessionGuard.requestGate.affordability.delete(miniGameType);
    }
    if (!server?.progression) {
      if (server?.auth_required) {
        redirectToSyncGate(server?.error || 'Telegram auth required for mini-game entry.', 1600, 'ensureMiniGamePlayable:auth-required', true);
      } else if (server?.error) {
        hud.showNodeInterference(server.error, 'warning');
      }
      closeMiniGameOverlays();
      setActiveMiniGame('');
      return false;
    }
    if (sessionGuard.overlayActive && sessionGuard.activeMiniGame && sessionGuard.activeMiniGame !== miniGameType) return false;
    syncHudProgression();
    const canPlay = server.can_play !== false && Number(server.progression.xp || 0) >= Number(server.progression.mini_game_cost || 0);
    if (!canPlay) {
      hud.pushFeed(`⛔ ${String(type).toUpperCase()} blocked · XP too low (${server.progression.xp || 0}/${server.progression.mini_game_cost || 0})`, 'sam');
      hud.showNodeInterference(`${String(type).toUpperCase()} unavailable right now. Keep moving and regain XP to retry.`, 'warning');
      hud.pushFeed('⚠ XP too low for this mini-game. Block Topia session remains active.', 'system');
      closeMiniGameOverlays();
      setActiveMiniGame('');
      return false;
    }
    holdBackgroundSync(MINI_GAME_ENTRY_QUIET_MS);
    return true;
  }

  function applyMiniGameWorldImpact(type, outcome, result = {}) {
    const intent = outcome === 'success' ? 'assist' : 'disrupt';
    const actionType = outcome === 'success'
      ? 'operation_success'
      : outcome === 'skip'
        ? 'operation_skip'
        : 'operation_failure';
    sendWarAction(actionType, {
      intent,
      districtId: state.player.districtId,
      nodeId: state.mouse.selectedNodeId || state.mouse.hoverNodeId || '',
    });
    hud.pushFeed(
      outcome === 'success'
        ? `✅ ${String(type).toUpperCase()} success pushed allied district pressure`
        : outcome === 'skip'
          ? `💸 ${String(type).toUpperCase()} skip used · district pressure weakened`
          : `❌ ${String(type).toUpperCase()} failed · hostile pressure surged`,
      outcome === 'success' ? 'combat' : 'sam',
    );
  }

  async function handleMiniGameOutcome(type, outcome, result = {}) {
    const miniGameType = String(type || '').toLowerCase();
    if (!MINI_GAME_TYPES.has(miniGameType)) return;
    if (sessionGuard.requestGate.outcomes.has(miniGameType)) {
      await sessionGuard.requestGate.outcomes.get(miniGameType);
      return;
    }
    const outcomeTask = (async () => {
      holdBackgroundSync(MINI_GAME_SYNC_QUIET_MS);
      const server = outcome === 'skip'
        ? await syncMiniGameSkip(miniGameType, sessionGuard.skipStreak)
        : await syncMiniGameOutcome(miniGameType, outcome);
      if (server?.auth_required) {
        closeMiniGameOverlays();
        setActiveMiniGame('');
        redirectToSyncGate(server?.error || 'Telegram auth required for progression sync.', 1600, 'handleMiniGameOutcome:auth-required', true);
        return;
      }
      if (outcome === 'skip') sessionGuard.skipStreak += 1;
      if (outcome === 'success') sessionGuard.skipStreak = 0;
      if (server?.progression) {
        syncHudProgression();
        const bonusFlags = Array.isArray(server.progression.bonus_flags) ? server.progression.bonus_flags : [];
        const bonus = bonusFlags.length ? ` · ${bonusFlags.join(', ')}` : '';
        hud.pushFeed(`Progression synced · XP ${server.progression.xp || 0} · Gems ${server.progression.gems || 0}${bonus}`, 'quest');
        if (server.exited || server.progression.rpg_mode_active === false) {
          const warningText = server.exited
            ? `${String(miniGameType).toUpperCase()} sync warning: server flagged a mini-game exit state, but the current Block Topia session remains active.`
            : `${String(miniGameType).toUpperCase()} sync warning: RPG mode reported inactive after mini-game sync.`;
          hud.showNodeInterference(warningText, 'warning');
          hud.pushFeed(`Warning · ${warningText}`, 'system');
        }
      } else if (server && server.ok === false) {
        hud.showNodeInterference(server.error || 'Mini-game result sync failed.', 'warning');
      }
      applyMiniGameWorldImpact(miniGameType, outcome, result);
      setActiveMiniGame('');
      closeMiniGameOverlays();
      holdBackgroundSync(2200);
    })();
    sessionGuard.requestGate.outcomes.set(miniGameType, outcomeTask);
    try {
      await outcomeTask;
    } finally {
      sessionGuard.requestGate.outcomes.delete(miniGameType);
    }
  }

  function interactWithNpc(targetNpc) {
    if (!targetNpc) return;
    const line = npc.getDialogueLine(targetNpc);
    hud.showNpcDialogue(
      targetNpc.name || 'Citizen',
      targetNpc.roleLabel || targetNpc.role,
      line,
    );
    pushFeedDeduped(`🗣️ ${targetNpc.name}: ${line}`, 'system', `npc:${targetNpc.id}:${line}`);
    memory.record('player', {
      at: Date.now(),
      action: 'npc_interact',
      npcId: targetNpc.id,
      role: targetNpc.role,
      district: state.player.districtId,
    });
  }

  function applyDistrictControlUpdate({ districtId, control, owner, controlState, instability, pressure, support }, source = 'server', options = {}) {
    const district = districtStateById.get(districtId);
    if (!district) return;
    const previousControl = district.control;
    if (Number.isFinite(control)) {
      district.control = Math.max(0, Math.min(100, control));
    }
    if (owner) district.owner = owner;
    if (controlState) district.controlState = controlState;
    if (Number.isFinite(instability)) district.instability = instability;
    if (pressure) district.pressure = pressure;
    if (support) district.support = support;

    if (state.player.districtId === district.id) {
      hud.setDistrictControl(district.control);
      hud.setDistrictOwner(district.owner);
      hud.setDistrictState(district.controlState || 'contested');
      hud.setDistrictPosture(state.sharedWorld?.summary?.currentDistrictPostureState || 'normal');
    }
    if (options.silent) return;

    if (owner) {
      hud.setFactionStatus(`${primaryFactionName} vs ${secondaryFactionName} · ${district.name}: ${owner}`);
    }
    state.effects.districtPulseUntil = Date.now() + DISTRICT_PULSE_DURATION_MS;
    state.effects.districtPulseId = district.id;
    pulseWorldConflict(DISTRICT_PULSE_DURATION_MS + 800);
    pushMicroNotification(`District unstable: ${district.name}`, 'warning');
    if (previousControl < DISTRICT_CAPTURE_THRESHOLD && district.control >= DISTRICT_CAPTURE_THRESHOLD) {
      hud.showDistrictCapture(`🏴 ${district.name} SECURED · ${district.owner}`);
      pushFeedDeduped(`🏴 District secured: ${district.name} now controlled by ${district.owner}`, 'combat', `district-captured:${district.id}:${district.owner}`);
    } else if (source === 'node') {
      const controlPct = Math.round(district.control);
      pushFeedDeduped(`🏙️ District pressure rerouted · ${district.name} ${controlPct}% control`, 'combat', `district-node-ripple:${district.id}:${controlPct}`);
    } else {
      const controlPct = Math.round(district.control);
      const stateTag = (district.controlState || 'contested').toUpperCase();
      pushFeedDeduped(`🏙️ District relay synced · ${district.name} ${controlPct}% · ${district.owner} · ${stateTag}`, 'combat', `district-sync:${district.id}:${controlPct}:${district.owner}:${stateTag}`);
    }
    memory.record('district', {
      at: Date.now(),
      district: district.id,
      previousControl,
      control: district.control,
      owner: district.owner,
      controlState: district.controlState || 'contested',
      source,
    });
  }

  function handleNodeInterferenceRipple(payload, source = 'server') {
    if (!payload) return;
    const eventPayload = Array.isArray(payload.feedLines) ? payload : nodeInterference.applyServerNodeUpdate(payload);
    if (!eventPayload) return;

    if (Number.isFinite(eventPayload.samPressure)) {
      state.sam.pressure = Math.max(0, Math.min(100, eventPayload.samPressure));
    } else if (Number.isFinite(eventPayload.samPressureDelta) && eventPayload.samPressureDelta !== 0) {
      state.sam.pressure = Math.max(0, Math.min(100, state.sam.pressure + eventPayload.samPressureDelta));
    }

    if (eventPayload.districtId && Number.isFinite(eventPayload?.districtControl)) {
      const rippleDistrict = districtStateById.get(eventPayload.districtId);
      if (rippleDistrict) {
        hud.showNodeInterference(
          `District response confirmed · ${rippleDistrict.name} ${Math.round(Number(eventPayload.districtControl))}% control`,
          'signal',
        );
      }
      applyDistrictControlUpdate({
        districtId: eventPayload.districtId,
        control: Number(eventPayload.districtControl),
        owner: eventPayload?.districtOwner || '',
        controlState: eventPayload?.districtControlState || '',
        instability: Number(eventPayload?.districtInstability),
      }, 'node');
    }

    npc.reactToNodeInterference?.(eventPayload);

    const statusLabel = String(eventPayload.status || 'stable').toUpperCase();
    hud.showNodeInterference(`Node ${String(eventPayload.nodeId || '').toUpperCase()} state → ${statusLabel}`);

    for (const line of eventPayload.feedLines || []) {
      pushFeedDeduped(line, line.includes('SAM') ? 'sam' : 'combat', `node-ripple:${eventPayload.nodeId}:${line}:${source}`);
    }
    if (eventPayload.samPressureDelta > 0) {
      hud.showNodeInterference(`SAM pressure +${eventPayload.samPressureDelta}`, 'sam');
    }

    memory.record('player', {
      at: Date.now(),
      action: 'node_interference_ripple',
      nodeId: eventPayload.nodeId,
      districtId: eventPayload.districtId || '',
      status: eventPayload.status || 'stable',
      samPressureDelta: eventPayload.samPressureDelta || 0,
      source,
    });
  }


  function refreshOperationsHud(force = false) {
    operations.syncFromSignals(force ? { force: true } : undefined);
    hud.setQuests(quests.getActiveQuestCards());
  }

  function updateMouseHover(clientX, clientY) {
    state.mouse.hoverTile = renderer.pickTileFromClientPoint(clientX, clientY, state);
    state.mouse.hoverNpcId = renderer.pickNpcFromClientPoint(clientX, clientY, state)?.id || '';
    state.mouse.hoverNodeId = renderer.pickControlNodeFromClientPoint(clientX, clientY, state)?.id || '';
    state.mouse.hoverRemotePlayerId = renderer.pickRemotePlayerFromClientPoint?.(clientX, clientY, state)?.id || '';
  }

  function updateDistrictHudState(districtId) {
    const district = state.districts.byId.get(districtId);
    if (!district) return;
    const districtStatus = districtStateById.get(district.id);
    let covertNeedsRefresh = false;
    if (district.id !== lastHudDistrictId) {
      hud.setDistrict(district.name);
      lastHudDistrictId = district.id;
      covertNeedsRefresh = true;
    }
    if (districtStatus) {
      if (districtStatus.control !== lastHudDistrictControl) {
        hud.setDistrictControl(districtStatus.control);
        lastHudDistrictControl = districtStatus.control;
      }
      if (districtStatus.owner !== lastHudDistrictOwner) {
        hud.setDistrictOwner(districtStatus.owner);
        lastHudDistrictOwner = districtStatus.owner;
      }
      hud.setDistrictState(districtStatus.controlState || 'contested');
    }
    hud.setDistrictPosture(state.sharedWorld?.summary?.currentDistrictPostureState || 'normal');
    if (covertNeedsRefresh) syncCovertHud();
    if (district.id !== lastQuestDistrictId) {
      lastQuestDistrictId = district.id;
      state.capturePreview = null;
      hud.setQuests(quests.getActiveQuestCards());
    }
  }

  function applyLiveSignalRefresh(refreshResult) {
    if (!refreshResult?.changed) return;

    const snapshot = refreshResult.snapshot || liveIntelligence.getSnapshot();
    const canonSignalState = refreshResult.canonSignalState || liveIntelligence.getCanonSignalState?.() || {};
    state.canonSignals = canonSignalState;
    const worldBulletins = liveIntelligence.getWorldFeedLines(3);
    worldBulletins.forEach((line) => {
      if (!line) return;
      pushFeedDeduped(`📡 ${line}`, 'sam', `world-bulletin:${line}`);
    });
    const topDistrictPressure = Object.values(canonSignalState.districtSignalState || {})
      .sort((a, b) => Number(b?.pressure || 0) - Number(a?.pressure || 0))[0];
    if (topDistrictPressure?.districtName) {
      pushFeedDeduped(
        `🏙️ Pressure: ${topDistrictPressure.districtName} ${Math.round(topDistrictPressure.pressure || 0)}%`,
        'combat',
        `canon-pressure:${topDistrictPressure.districtId}:${Math.round(topDistrictPressure.pressure || 0)}`,
      );
    }
    pushFeedDeduped(
      `🛰️ Intelligence relay refreshed (${snapshot.mode || 'backup'})`,
      'system',
      `live-refresh:${snapshot.generatedAt || snapshot.mode || 'backup'}`,
    );
    clues.refreshFromSignals?.();
    refreshOperationsHud(true);
    hud.setWorldStatus(
      `Unified city online · canon signals ${snapshot.mode || 'backup'} · ${snapshot.signalCount || 0} active lanes`
      + `${canonSignalState.samNarrativeState?.pressure ? ` · SAM pressure ${Math.round(canonSignalState.samNarrativeState.pressure)}%` : ''}`,
    );
  }

  // Populate HUD with initial values
  hud.setPlayerName(state.player.name);
  hud.setWorldStatus(`Unified city online · canon runtime layer active`);
  hud.setDistrict(state.player.districtName);
  hud.setDistrictControl(50);
  hud.setDistrictOwner(state.districtState[0]?.owner || primaryFactionName);
  hud.setDistrictState(state.districtState[0]?.controlState || 'contested');
  hud.setDistrictPosture('normal');
  hud.setFactionStatus(`${primaryFactionName} vs ${secondaryFactionName}`);
  hud.setSamPhase(sam.getCurrentPhase().name);
  applyPhase(state.phase, 'system');
  hud.setScore(state.player.score);
  hud.setXp(progressionState.xp || 0);
  hud.setGems(progressionState.gems || 0);
  hud.setDrainPerMinute(progressionState.drain_per_minute || 0);
  syncCovertHud();
  hud.setRoom(state.room.id);
  hud.setPopulation(0, state.room.maxPlayers);
  refreshOperationsHud(true);
  const worldBulletins = liveIntelligence.getWorldFeedLines(2);
  worldBulletins.forEach((line) => pushFeedDeduped(`📡 ${line}`, 'sam', `world-bulletin:${line}`));
  const liveMode = liveIntelligence.getSnapshot().mode || 'backup';
  pushFeedDeduped(`🛰️ Canon signal bridge active (${liveMode})`, 'system', `live-boot:${liveMode}`);
  bootstrapEntryIdentity();
  bootstrapLoreFeed();

  // Show first-time player overlay once per device. "?" help button always reopens it.
  try {
    const ftueOverlay = document.getElementById('ftue-overlay');
    if (ftueOverlay) {
      if (!localStorage.getItem(FTUE_STORAGE_KEY)) {
        ftueOverlay.classList.remove('hidden');
      }
      document.getElementById('ftue-dismiss')?.addEventListener('click', () => {
        ftueOverlay.classList.add('hidden');
        try { localStorage.setItem(FTUE_STORAGE_KEY, '1'); } catch { /* ignore write error */ }
      });
      document.getElementById('ftue-help-btn')?.addEventListener('click', () => {
        ftueOverlay.classList.remove('hidden');
      });
    }
  } catch (storageError) {
    // localStorage may be unavailable in private/restricted contexts — skip FTUE silently.
    if (!(storageError instanceof DOMException)) throw storageError;
  }
  // Initialise node tooltip to default guidance (no node selected yet).
  updateNodeTooltip('');
  const initialCovert = await fetchCovertState();
  if (initialCovert?.__authError) {
    redirectToSyncGate(initialCovert?.error || 'Telegram session expired. Re-sync required.', 1600, 'boot:initial-covert-auth-error', true);
    return;
  }
  applyCovertSnapshot(initialCovert, 'boot');
  pushFeedDeduped(
    `📚 Canon source: ${canonAdapter.truthSource || canonLore.truthSource || '/wiki/bibles/block-topia.json'}${canonAdapter.fallbackUsed ? ' (backup lore active)' : ''}`,
    'system',
    `canon-source:${canonAdapter.truthSource || canonLore.truthSource || 'wiki-bible'}`,
  );
  hud.pushFeed('🔍 Camera zoom controls: [ = farther, ] = closer', 'system');
  let nextSamPresenceAt = Date.now() + SAM_PRESENCE_MIN_MS;

  setInterval(() => {
    liveIntelligence.refresh()
      .then((result) => applyLiveSignalRefresh(result))
      .catch(() => {});
  }, LIVE_REFRESH_INTERVAL_MS);

  scheduleManagedPoll(PROGRESSION_SYNC_INTERVAL_MS, async () => {
    if (sessionGuard.requestGate.progressionPollInFlight || shouldPauseBackgroundSync()) return;
    sessionGuard.requestGate.progressionPollInFlight = true;
    try {
      const next = await fetchServerProgression();
      if (next?.__authError) {
        redirectToSyncGate(next?.error || 'Telegram session expired. Re-sync required.', 1600, 'poll:progression-auth-error', true);
        return;
      }
      hud.setXp(next.xp || 0);
      hud.setGems(next.gems || 0);
      hud.setDrainPerMinute(next.drain_per_minute || 0);
      syncCovertHud();
      if (next.rpg_mode_active === false || (next.xp || 0) <= 0) {
        const warningText = next.rpg_mode_active === false
          ? 'Block Topia progression sync warning: RPG mode inactive.'
          : 'XP depleted. Block Topia session warning.';
        hud.showNodeInterference(warningText, 'warning');
        hud.pushFeed(`Warning · ${warningText}`, 'system');
      }
    } finally {
      sessionGuard.requestGate.progressionPollInFlight = false;
    }
  });

  scheduleManagedPoll(COVERT_SYNC_INTERVAL_MS, async () => {
    if (sessionGuard.requestGate.covertPollInFlight || shouldPauseBackgroundSync()) return;
    sessionGuard.requestGate.covertPollInFlight = true;
    try {
      const next = await fetchCovertState();
      if (next?.__authError) {
        redirectToSyncGate(next?.error || 'Telegram session expired. Re-sync required.', 1600, 'poll:covert-auth-error', true);
        return;
      }
      applyCovertSnapshot(next, 'poll');
    } finally {
      sessionGuard.requestGate.covertPollInFlight = false;
    }
  });

  // Fallback: dismiss the entry overlay after 7s in case multiplayer never connects.
  setTimeout(() => hud.dismissEntryIdentity(0), ENTRY_OVERLAY_TIMEOUT_MS);

  window.addEventListener('keydown', (event) => {
    if (shouldIgnoreHotkey(event) || event.repeat) return;
    // Backtick (`) toggles the debug panel — dev diagnostics only, not visible by default.
    if (event.key === '`') {
      const panel = document.getElementById('debug-panel');
      if (panel) {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) renderDebugPanel();
      }
      return;
    }
    const key = event.key;
    if (key === 'f' || key === 'F') {
      if (selectedRemotePlayer) {
        challengeRemotePlayer(selectedRemotePlayer);
      }
      return;
    }
    if (key !== '[' && key !== ']') return;

    const nextIndex = key === '['
      ? Math.max(0, (state.camera.zoomIndex || 1) - 1)
      : Math.min(CAMERA_ZOOM_PRESETS.length - 1, (state.camera.zoomIndex || 1) + 1);
    if (nextIndex === state.camera.zoomIndex) return;

    state.camera.zoomIndex = nextIndex;
    state.camera.zoom = CAMERA_ZOOM_PRESETS[nextIndex];
    const zoomLabel = nextIndex === 0 ? 'far' : nextIndex === 1 ? 'default' : 'close';
    hud.pushFeed(`🔎 Camera zoom: ${zoomLabel} (${state.camera.zoom.toFixed(2)}x)`, 'system');
  });

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextZoom = clampZoom(state.camera.zoom + (direction * CAMERA_ZOOM_WHEEL_STEP));
    if (nextZoom === state.camera.zoom) return;
    state.camera.zoom = nextZoom;
    syncZoomIndexToCurrentZoom();
  }, { passive: false });

  canvas.addEventListener('mousemove', (event) => {
    if (state.mouse.pointerDown) {
      const deltaX = event.clientX - state.mouse.dragStartX;
      const deltaY = event.clientY - state.mouse.dragStartY;
      const movedEnough = Math.hypot(deltaX, deltaY) >= MOUSE_DRAG_THRESHOLD_PX;
      if (movedEnough) {
        state.mouse.dragging = true;
        state.mouse.dragMoved = true;
      }
      if (state.mouse.dragging) {
        const zoom = state.camera.zoom ?? 1;
        state.camera.panX = state.mouse.cameraStartX + (deltaX / zoom);
        state.camera.panY = state.mouse.cameraStartY + (deltaY / zoom);
        state.mouse.hoverTile = null;
        state.mouse.hoverNpcId = '';
        state.mouse.hoverNodeId = '';
        state.mouse.hoverRemotePlayerId = '';
        return;
      }
    }
    updateMouseHover(event.clientX, event.clientY);
  });

  canvas.addEventListener('mouseleave', () => {
    state.mouse.hoverTile = null;
    state.mouse.hoverNpcId = '';
    state.mouse.hoverNodeId = '';
    state.mouse.hoverRemotePlayerId = '';
  });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    state.mouse.pointerDown = true;
    state.mouse.dragging = false;
    state.mouse.dragMoved = false;
    state.mouse.dragStartX = event.clientX;
    state.mouse.dragStartY = event.clientY;
    state.mouse.cameraStartX = state.camera.panX || 0;
    state.mouse.cameraStartY = state.camera.panY || 0;
  });

  window.addEventListener('mouseup', (event) => {
    if (event.button !== 0 || !state.mouse.pointerDown) return;
    state.mouse.pointerDown = false;
    const dragged = state.mouse.dragging || state.mouse.dragMoved;
    state.mouse.dragging = false;
    if (dragged) {
      state.mouse.suppressClick = true;
      state.mouse.suppressDblClickUntil = performance.now() + MOUSE_DRAG_DOUBLE_CLICK_SUPPRESS_MS;
      updateMouseHover(event.clientX, event.clientY);
    }
  });

  canvas.addEventListener('click', (event) => {
    if (!sessionGuard.normalInputAllowed && !sessionGuard.overlayActive) return;
    if (state.mouse.suppressClick) {
      state.mouse.suppressClick = false;
      return;
    }
    if (tryInteractWithClickedNpc(event)) return;
    if (tryInteractWithClickedNode(event)) return;
    const remotePlayer = renderer.pickRemotePlayerFromClientPoint?.(event.clientX, event.clientY, state);
    if (remotePlayer?.id) {
      selectedRemotePlayer = remotePlayer;
      state.mouse.selectedRemotePlayerId = remotePlayer.id;
      hud.pushFeed(`🎯 Target locked: ${remotePlayer.name || remotePlayer.id} · press F to send duel request`, 'combat');
      return;
    }
    selectedRemotePlayer = null;
    state.mouse.selectedRemotePlayerId = '';
    state.mouse.selectedTile = renderer.pickTileFromClientPoint(event.clientX, event.clientY, state);
  });

  canvas.addEventListener('dblclick', (event) => {
    if (!sessionGuard.normalInputAllowed) return;
    if (performance.now() < (state.mouse.suppressDblClickUntil || 0)) return;
    if (tryInteractWithClickedNpc(event)) return;

    const tile = renderer.pickTileFromClientPoint(event.clientX, event.clientY, state);
    state.mouse.selectedTile = tile;
    if (!tile?.valid) return;
    state.player.moveTarget = { x: tile.col, y: tile.row };
  });

  // Covert ops deploy button.
  document.getElementById('covert-deploy-btn')?.addEventListener('click', () => {
    const nodeId = state.mouse?.selectedNodeId || '';
    if (!nodeId || covertOpsLocal.activeOperation) return;
    sendDeployOperative(nodeId);
    hud.pushFeed(`Signal Runner deployed to ${nodeId.toUpperCase()}. Mission resolving.`, 'combat');
  });

  function markUiConnected() {
    wsConnectionFailed = false;
    hud.setMultiplayerStatus('Connected (live city)');
  }

  await connectMultiplayer({
    playerName: state.player.name,
    roomId: state.room.id,
    roomIdentity: {
      id: state.room.id,
      districtId: state.player.districtId,
      seasonIndex: state.season.index,
      memoryShard: state.memory.id,
    },
    onStatus: (status) => {
      const wsState = status.ws || 'offline';
      debugState.connectionState = wsState;
      debugState.roomName = status.roomId || debugState.roomName;
      renderDebugPanel();

      if (status.joined) {
        wsConnectionFailed = false;
        hud.setMultiplayerStatus('Connected (live city)');
      } else if (wsState === 'room-full') {
        wsConnectionFailed = true;
        hud.setMultiplayerUnavailable('room-full');
      } else if (wsState === 'disconnected') {
        wsConnectionFailed = true;
        hud.setMultiplayerUnavailable('network-disconnect');
      } else if (wsState === 'connecting' || wsState === 'offline') {
        hud.setMultiplayerStatus('Connecting to live city…');
      } else {
        hud.setMultiplayerStatus(wsState);
      }
      updateNodeTooltip(state.mouse?.selectedNodeId || '');
      if (status.roomId) hud.setRoom(status.roomId);
      if (status.sessionId) localSessionId = status.sessionId;
      multiplayerConnected = Boolean(status.joined);
      if (multiplayerConnected) {
        hud.setEntryTagline(`LIVE CITY LINK ESTABLISHED · ${getCanonAtmosphereLine()}`);
        hud.dismissEntryIdentity(ENTRY_DISMISS_DELAY_MS);
        syncCovertPressureToRoom(state.covert, true);
      }
    },
    onPlayers: (players) => {
      applyRemotePlayers(state, players);
      debugState.playerCount = players.length;
      renderDebugPanel();
      hud.setPopulation(players.length, state.room.maxPlayers);
      markUiConnected();
      if (selectedRemotePlayer?.id) {
        selectedRemotePlayer = state.remotePlayers.find((player) => player.id === selectedRemotePlayer.id) || null;
        if (!selectedRemotePlayer) {
          state.mouse.selectedRemotePlayerId = '';
        }
      }
    },
    onWorldSnapshot: (data) => {
      markUiConnected();
      debugState.lastWorldUpdateAt = Date.now();
      renderDebugPanel();
      if (hasSharedHunterSnapshotPayload(data)) {
        applySharedHunterSnapshot(data, 'snapshot');
      }
      if (Array.isArray(data?.npcs)) {
        let crowdCount = 0;
        state.npcTargets = data.npcs.filter((npc) => {
          if (npc.mode !== 'crowd') return true;
          crowdCount += 1;
          return crowdCount <= MAX_CLIENT_CROWD_NPCS;
        });
      }
      if (Array.isArray(data?.districts)) {
        for (const incoming of data.districts) {
          applyDistrictControlUpdate({
            districtId: incoming.id,
            control: Number(incoming.control),
            owner: incoming.owner || '',
            controlState: incoming.controlState || '',
            instability: Number(incoming.instability),
            pressure: incoming.pressure || null,
            support: incoming.support || null,
          }, 'snapshot', { silent: true });
        }
      }
      if (Array.isArray(data?.controlNodes)) {
        for (const nodePayload of data.controlNodes) {
          nodeInterference.applyServerNodeUpdate(nodePayload, { silent: true });
        }
      }
      if (Number.isFinite(data?.samPressure)) {
        state.sam.pressure = Math.max(0, Math.min(100, Number(data.samPressure)));
      }
      if (Number.isFinite(data?.samPhase) && state.sam.phases.length) {
        const maxIndex = state.sam.phases.length - 1;
        const nextIndex = Math.max(0, Math.min(maxIndex, Math.floor(data.samPhase)));
        state.sam.currentIndex = nextIndex;
        state.sam.timer = 0;
        const phase = sam.getCurrentPhase();
        hud.setSamPhase(phase.name);
      }
    },
      onFeed: (line) => {
      pushFeedDeduped(line, classifyFeedType(line), `network:${line}`);
      memory.record('network', { at: Date.now(), line });
    },
    onQuestCompleted: ({ questId, title, rewardXp }) => {
      // Server-authoritative quest completion: match quest by questId (not title),
      // then apply XP via awardXp so score/XP are incremented exactly once.
      const completion = quests.completeQuest(questId, rewardXp);
      const awarded = completion?.awarded ?? rewardXp;
      if (awarded) {
        awardXp(state, awarded);
        hud.setXp(state.player.xp);
        hud.setScore(state.player.score);
        hud.setQuests(quests.getActiveQuestCards());
        hud.showQuestComplete(completion?.quest?.title || title || 'Quest', awarded);
        hud.pushFeed(`✅ ${completion?.quest?.title || title} complete · +${awarded} XP`, 'quest');
        memory.record('player', { at: Date.now(), action: 'quest_complete', questId, xp: awarded });
      }
    },
    onSamPhaseChanged: ({ phaseIndex }) => {
      if (!state.sam.phases.length) return;
      const maxIndex = state.sam.phases.length - 1;
      const nextIndex = Math.max(0, Math.min(maxIndex, Math.floor(phaseIndex)));
      if (state.sam.currentIndex === nextIndex) return;

      state.sam.currentIndex = nextIndex;
      state.sam.timer = 0;
      const phase = sam.getCurrentPhase();
      hud.setSamPhase(phase.name);
      hud.pushFeed(`🧠 SAM phase lock confirmed: ${phase.name}`, 'sam');
      const samEvent = { at: Date.now(), phase: phase.id, source: 'server' };
      if (phase.id === 'sam-event') {
        samEvent.type = 'giant_encounter';
        npc.spawnSamWave?.();
        state.effects.samImpactUntil = Date.now() + SAM_IMPACT_DURATION_MS;
        hud.triggerSamImpact('⚡ SAM surge detected — giant encounter inbound.');
      } else if (phase.id === 'conflict') {
        state.effects.districtPulseUntil = Date.now() + DISTRICT_PULSE_CONFLICT_MS;
        pulseWorldConflict(DISTRICT_PULSE_CONFLICT_MS + 1200);
        pushMicroNotification('Conflict nearby. HUD elevated.', 'warning');
      }
      memory.record('sam', samEvent);
    },
    onDistrictCaptureChanged: ({ districtId, control, owner, controlState, instability, support }) => {
      applyDistrictControlUpdate({ districtId, control, owner, controlState, instability, support }, 'server');
    },
    onDistrictControlStateChanged: (payload) => {
      applyDistrictControlUpdate({
        districtId: payload?.districtId,
        control: Number(payload?.control),
        owner: payload?.owner,
        controlState: payload?.controlState,
        instability: Number(payload?.instability),
        support: payload?.support || null,
      }, 'server');
      if (payload?.districtName && payload?.controlState) {
        hud.pushFeed(`🗺️ ${payload.districtName} shifted to ${String(payload.controlState).toUpperCase()}`, 'combat');
        pushMicroNotification(`${payload.districtName} shifted to ${String(payload.controlState).toUpperCase()}`, 'warning');
      }
    },
    onPlayerWarImpact: (payload) => {
      if (!payload?.districtName) return;
      const verb = payload.intent === 'assist' ? 'stabilized' : 'destabilized';
      hud.pushFeed(`🎯 Player action ${verb} ${payload.districtName} via ${payload.source || 'war action'}`, payload.intent === 'assist' ? 'combat' : 'sam');
    },
    onNodeInterferenceChanged: (payload) => {
      // city_status_fix rule 4: incoming world traffic confirms the live connection is active.
      markUiConnected();
      const eventPayload = nodeInterference.applyServerNodeUpdate(payload);
      handleNodeInterferenceRipple(eventPayload || payload, 'server');
    },
    onDuelRequested: (payload) => {
      if (isLocalDuelParticipant(payload)) {
        duel.applyRequested(payload);
        duelOverlay.render();
      }
      if (payload?.playerB === localSessionId) {
        hud.pushFeed(`⚔️ Duel request incoming from ${payload.challengerName || payload.playerAName || 'Player'} · open duel panel to respond`, 'combat');
        hud.showNodeInterference('Duel request received · open the duel panel to respond', 'warning');
      }
    },
    onDuelStarted: (payload) => {
      if (isLocalDuelParticipant(payload)) {
        duel.applyStarted(payload);
        duelOverlay.render();
      }
      hud.pushFeed(`⚔️ Duel link active: ${payload.playerAName || 'A'} vs ${payload.playerBName || 'B'}`, 'combat');
      hud.showNodeInterference('Duel active · submit an action in the duel panel', 'sam');
    },
    onDuelActionSubmitted: (payload) => {
      if (duel.getState().duelId && payload?.duelId === duel.getState().duelId) {
        duel.applyActionSubmitted(payload);
        duelOverlay.render();
      }
    },
    onDuelResolved: (payload) => {
      if (duel.getState().duelId && payload?.duelId === duel.getState().duelId) {
        duel.applyResolved(payload);
        duelOverlay.render();
      }
      if (payload?.message) {
        hud.pushFeed(`⚔️ ${payload.message}`, 'combat');
      }
      if (payload?.samWarning) {
        hud.showNodeInterference(payload.samWarning, 'sam');
      }
      if (payload?.winnerName) {
        hud.showNodeInterference(`Duel round resolved · winner ${payload.winnerName}`, 'signal');
      }
    },
    onDuelEnded: (payload) => {
      if (duel.getState().duelId && payload?.duelId === duel.getState().duelId) {
        duel.applyEnded(payload);
        duelOverlay.render();
      }
      applyDuelEndedRipple(payload);
      if (payload?.message) {
        hud.pushFeed(`⚔️ ${payload.message}`, 'combat');
      }
    },
    onOperationStarted: (payload) => {
      if (payload?.playerId !== localSessionId) return;
      covertOpsLocal.activeOperation = {
        operativeId: payload.operativeId,
        nodeId: payload.nodeId,
        deployedAt: Date.now(),
        missionDurationMs: payload.missionDurationMs || COVERT_OPS_MISSION_DURATION_MS,
      };
      if (typeof payload.heat === 'number') {
        covertOpsLocal.playerHeat = payload.heat;
      }
      refreshCovertOpsPanel();
      updateNodeTooltip(payload.nodeId || state.mouse?.selectedNodeId || '');
    },
    onOperationResult: (payload) => {
      if (payload?.playerId !== localSessionId) return;
      covertOpsLocal.activeOperation = null;
      covertOpsLocal.lastResult = payload.result || (payload.success ? 'success' : 'failure');
      if (typeof payload.heat === 'number') {
        covertOpsLocal.playerHeat = payload.heat;
      }
      refreshCovertOpsPanel();
      updateNodeTooltip(state.mouse?.selectedNodeId || '');
      const nodeLabel = String(payload.nodeId || '').toUpperCase();
      const heatDelta = typeof payload.heatGain === 'number' ? payload.heatGain : null;
      const heatSuffix = heatDelta !== null ? ` Heat +${heatDelta}.` : '';
      if (payload.success) {
        hud.pushFeed(`Signal Runner succeeded at ${nodeLabel}. Node control shifted.${heatSuffix}`, 'quest');
        pushMicroNotification('Signal Runner: mission success.', 'success');
      } else {
        hud.pushFeed(`Signal Runner failed at ${nodeLabel}.${heatSuffix}`, 'sam');
        if (payload.operativeLost) {
          hud.pushFeed('Signal Runner lost.', 'sam');
        }
        pushMicroNotification(`Signal Runner: mission failed${payload.operativeLost ? ' — operative lost' : ''}.`, 'warning');
      }
    },
    onCovertState: (payload) => {
      if (payload?.playerId !== localSessionId) return;
      if (typeof payload.heat === 'number') {
        covertOpsLocal.playerHeat = payload.heat;
      }
      if (payload.hasActiveOperation === false) {
        covertOpsLocal.activeOperation = null;
      }
      if (payload.lastResult) {
        covertOpsLocal.lastResult = payload.lastResult;
      }
      refreshCovertOpsPanel();
    },
  });

  window.addEventListener('keydown', (event) => {
    if (!sessionGuard.normalInputAllowed && !sessionGuard.overlayActive) return;
    if (shouldIgnoreHotkey(event) || event.key.toLowerCase() !== 'e' || event.repeat || !nearbyNpc) return;
    interactWithNpc(nearbyNpc);
  });
  window.addEventListener('keydown', (event) => {
    if (!sessionGuard.normalInputAllowed && !sessionGuard.overlayActive) return;
    if (shouldIgnoreHotkey(event) || event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'k' && sessionGuard.activeMiniGame) {
      handleMiniGameOutcome(sessionGuard.activeMiniGame, 'skip').catch(() => {});
      return;
    }
    const firewallState = firewallDefense.getPublicState();
    if (firewallState.active) {
      const selectedId = firewallState.selectedNodeId;
      const defenseByKey = {
        5: 'firewall',
        6: 'disruptor',
        7: 'purge',
      };
      const defenseId = defenseByKey[key];
      if (defenseId) {
        const result = firewallDefense.deployDefense(defenseId, selectedId);
        if (result?.ok) {
          hud.pushFeed(`🛡️ FIREWALL defense ${defenseId.toUpperCase()} online`, 'combat');
        } else if (result?.reason) {
          hud.showNodeInterference(result.reason, 'warning');
        }
        firewallOverlay.render(firewallDefense.getPublicState());
      }
    }
    const outbreakState = outbreakSystem.getPublicState();
    const signalRouterState = state.signalRouterView || signalRouter.getPublicState();
    const circuitState = state.circuitConnectView || circuitConnect.getPublicState();
    if (circuitState.active) {
      const selectedId = circuitState.selectedNodeId;
      const actionsByKey = {
        1: 'reconnectLink',
        2: 'rerouteNode',
        3: 'stabilizeLink',
        a: 'reconnectLink',
        s: 'stabilizeLink',
        d: 'rerouteNode',
        f: 'deployBridge',
        g: 'reinforceConnection',
      };
      const actionId = actionsByKey[key];
      if (actionId) {
        const action = circuitConnect.actions[actionId];
        const result = action?.(selectedId);
        if (result?.ok) {
          hud.pushFeed(`🔌 CIRCUIT CONNECT ${actionId}`, 'combat');
        } else if (result?.reason) {
          hud.showNodeInterference(result.reason, 'warning');
        }
        state.circuitConnectView = circuitConnect.getPublicState();
        circuitConnectOverlay.render(state.circuitConnectView);
      }
    }
    if (signalRouterState.active) {
      const selectedId = signalRouterState.selectedNodeId;
      const actionsByKey = {
        z: 'prioritizeRoute',
        x: 'avoidLink',
        c: 'rerouteTraffic',
        v: 'stabilizeLink',
        b: 'clearCongestion',
      };
      const actionId = actionsByKey[key];
      if (actionId) {
        const action = signalRouter.actions[actionId];
        const result = action?.(selectedId);
        if (result?.ok) {
          hud.pushFeed(`📡 SIGNAL ROUTER ${actionId}`, 'combat');
        } else if (result?.reason) {
          hud.showNodeInterference(result.reason, 'warning');
        }
        state.signalRouterView = signalRouter.getPublicState();
        signalRouterOverlay.render(state.signalRouterView);
      }
    }
    if (!outbreakState.active) return;
    const selectedId = outbreakState.selectedNodeId;
    if (!selectedId && ['1', '2', '3', '4'].includes(key)) {
      hud.showNodeInterference('Select a node first.', 'warning');
      return;
    }
    const actionByKey = {
      1: () => outbreakSystem.actions.scanNode(selectedId),
      2: () => outbreakSystem.actions.isolateNode(selectedId),
      3: () => outbreakSystem.actions.delayLink(selectedId),
      4: () => outbreakSystem.actions.purgeNode(selectedId),
    };
    const upgradeByKey = {
      q: () => outbreakSystem.actions.upgrade('containment'),
      w: () => outbreakSystem.actions.upgrade('detection'),
      r: () => outbreakSystem.actions.upgrade('neutralization'),
    };
    const action = actionByKey[key] || upgradeByKey[key];
    if (!action) return;
    const result = action();
    if (result?.ok) {
      hud.pushFeed(`🛡️ NODE OUTBREAK DEFENSE action ${key.toUpperCase()} confirmed`, 'combat');
    } else if (result?.reason) {
      hud.showNodeInterference(result.reason, 'warning');
    }
    outbreakOverlay.render(outbreakSystem.getPublicState());
  });

  let lastTs = performance.now();
  function logicTick() {
    const ts = performance.now();
    const dt = Math.min(MAX_FRAME_DELTA_SECONDS, (ts - lastTs) / 1000);
    lastTs = ts;

    const keyboardMovementApplied = sessionGuard.normalInputAllowed
      ? updatePlayerMotion(state, input, dt, sendMovement)
      : false;
    // Keyboard input takes priority and cancels click-move targets to avoid conflicting movement commands.
    if (keyboardMovementApplied && isMovementInputActive()) {
      state.player.moveTarget = null;
    } else {
      if (sessionGuard.normalInputAllowed) {
        movePlayerTowardTarget(state, dt, sendMovement);
      } else {
        state.player.moveTarget = null;
      }
    }
    // npc.tick() follows server NPC targets (state.npcTargets) when available;
    // falls back to local simulation when the server is unreachable.
    npc.tick(dt);
    nodeInterference.tick(dt);
    // Visual-only capture preview — server decides actual control values.
    tickDistrictCapture(state, dt);

    if (ts - lastNpcScan > NPC_SCAN_INTERVAL_MS) {
      nearbyNpc = npc.nearestInteractive(state.player.x, state.player.y);
      lastNpcScan = ts;
    }

    state.player.nearbyNpcId = nearbyNpc?.id || '';
    const interactText = nearbyNpc
      ? `⚡ Press E or click · Engage ${nearbyNpc.name} (${nearbyNpc.roleLabel || nearbyNpc.role})`
      : selectedRemotePlayer
        ? `⚔️ Press F · Send duel request to ${selectedRemotePlayer.name || selectedRemotePlayer.id}`
        : '';
    const interactVisible = Boolean(nearbyNpc || selectedRemotePlayer);
    if (
      interactText !== lastInteractPromptText
      || interactVisible !== lastInteractPromptVisible
    ) {
      hud.setInteractPrompt(interactText, interactVisible);
      lastInteractPromptText = interactText;
      lastInteractPromptVisible = interactVisible;
    }

    const questElapsedMs = ts - lastQuestTick;
    if (questElapsedMs >= QUEST_TICK_INTERVAL_MS) {
      quests.tick(Math.min(1, questElapsedMs / 1000), {
        onQuestPulse: (text) => hud.pushFeed(`🎯 ${text}`, 'quest'),
      });
      lastQuestTick = ts;
    }
    clues.tick(dt, {
      onCluePulse: (text) => hud.pushFeed(`🧩 ${text}`, 'quest'),
    });
    operations.tick(dt, {
      onOperationResolved: (operation) => {
        pushFeedDeduped('✔ SIGNAL STABILIZED — TRACE COMPLETE', 'quest', `op-resolved:${operation.id}`);
        pushFeedDeduped(
          `📍 ${operation.title} resolved in ${state.districts.byId.get(operation.districtId)?.name || operation.districtId}`,
          'sam',
          `op-resolved-detail:${operation.id}`,
        );
        hud.showSamPopup('✔ SIGNAL STABILIZED — TRACE COMPLETE', 2600);
        refreshOperationsHud();
      },
      onOperationExpired: (operation) => {
        pushFeedDeduped(
          `⌛ ${operation.title} signal faded`,
          'system',
          `op-expired:${operation.id}`,
        );
        refreshOperationsHud();
      },
    });
    if (Date.now() >= nextSamPresenceAt) {
      const phaseName = sam.getCurrentPhase().name;
      const samPresenceLine = phaseName === 'Conflict'
        ? '🧠 SAM oversight: conflict lanes prioritized for interception.'
        : phaseName === 'SAM Event'
          ? '🧠 SAM oversight: surge channels open, monitor critical nodes.'
          : '🧠 SAM oversight: network baseline stable, anomaly sweep active.';
      pushFeedDeduped(samPresenceLine, 'sam', `sam-presence:${phaseName}`);
      nextSamPresenceAt = Date.now() + SAM_PRESENCE_MIN_MS + Math.random() * SAM_PRESENCE_VARIANCE_MS;
    }
    if (Math.random() < NPC_FEED_PULSE_PROBABILITY) {
      const entities = state.npc.entities || [];
      const npcEntity = entities[Math.floor(Math.random() * entities.length)];
      if (npcEntity) {
        hud.pushFeed(`📶 Civic chatter · ${(npcEntity.type || 'helper').toUpperCase()}-${npcEntity.id} reports local signal motion`, 'system');
      }
    }
    const duelState = duel.getState();

    // Refresh covert ops countdown every tick when a mission is active.
    if (covertOpsLocal.activeOperation) refreshCovertOpsPanel();
    firewallDefense.tick(dt, {
      onStart: () => {
        ensureMiniGamePlayable('firewall').then((ok) => {
          if (!ok) return;
          setActiveMiniGame('firewall');
          hud.showSamPopup('🚨 FIREWALL BREACH — DEFEND THE NETWORK', 3600);
          hud.pushFeed('🚨 FIREWALL BREACH — DEFEND THE NETWORK', 'sam');
          hud.pushFeed('💸 Press K to pay XP and skip containment', 'system');
        });
      },
      onWave: ({ waveIndex, count }) => {
        hud.pushFeed(`🌊 Firewall wave ${waveIndex} detected (${count} packets)`, 'combat');
      },
      onNodeHit: ({ nodeId, damage, typeId }) => {
        hud.pushFeed(`💥 ${typeId.toUpperCase()} hit ${nodeId.toUpperCase()} (-${damage})`, 'combat');
      },
      onNpcSupport: ({ type, nodeId }) => {
        const labels = {
          courier: 'courier repair',
          fighter: 'fighter overclock',
          agent: 'agent route reveal',
          recruiter: 'recruiter helper unit',
        };
        hud.pushFeed(`🤝 NPC ${labels[type] || type} at ${nodeId.toUpperCase()}`, 'combat');
      },
      onResolve: (result) => {
        handleMiniGameOutcome('firewall', result.outcome, result).catch(() => {});
      },
    }, {
      duelActive: duelState.status === 'active',
      outbreakActive: outbreakSystem.getPublicState().active,
    });
    firewallOverlay.render(firewallDefense.getPublicState());

    outbreakSystem.tick(dt, {
      onStart: ({ nodeId }) => {
        ensureMiniGamePlayable('outbreak').then((ok) => {
          if (!ok) return;
          setActiveMiniGame('outbreak');
          const node = state.controlNodes.find((n) => n.id === nodeId);
          const district = districtStateById.get(node?.districtId)?.name || node?.districtId || 'Unknown district';
          hud.showSamPopup(`🚨 VIRUS ALERT — NODES UNDER ATTACK\nNode ${nodeId.toUpperCase()} · ${district}`, 3800);
          hud.pushFeed(`🚨 NODE OUTBREAK DEFENSE online at ${nodeId.toUpperCase()} (${district})`, 'sam');
          hud.pushFeed('💸 Press K to pay XP and skip containment', 'system');
        });
      },
      onTrait: (trait) => {
        hud.pushFeed(`🧬 Virus adapted: ${trait.name}`, 'sam');
      },
      onSpread: ({ fromId, toId, burst }) => {
        hud.pushFeed(`${burst ? '💥' : '🦠'} Spread ${fromId.toUpperCase()} → ${toId.toUpperCase()}`, 'combat');
      },
      onResolve: (result) => {
        handleMiniGameOutcome('outbreak', result.outcome, result).catch(() => {});
      },
    }, {
      duelActive: duelState.status === 'active' || firewallDefense.getPublicState().active,
    });
    outbreakOverlay.render(outbreakSystem.getPublicState());
    signalRouter.tick(dt, {
      onStart: ({ message }) => {
        ensureMiniGamePlayable('router').then((ok) => {
          if (!ok) return;
          setActiveMiniGame('router');
          hud.showSamPopup(`🚨 ${message}`, 3400);
          hud.pushFeed(`🚨 ${message}`, 'sam');
          hud.pushFeed('💸 Press K to pay XP and skip containment', 'system');
        });
      },
      onNpc: ({ type, text }) => {
        const labels = {
          courier: 'courier demand',
          agent: 'agent corridor',
          fighter: 'fighter security',
          recruiter: 'recruiter relief',
          'lore-keeper': 'lore warning',
        };
        hud.pushFeed(`🤝 NPC ${labels[type] || type} · ${text}`, 'combat');
      },
      onResolve: (result) => {
        handleMiniGameOutcome('router', result.outcome, result).catch(() => {});
      },
    }, {
      duelActive: duelState.status === 'active',
      outbreakActive: outbreakSystem.getPublicState().active,
      firewallActive: firewallDefense.getPublicState().active,
    });
    state.signalRouterView = signalRouter.getPublicState();
    signalRouterOverlay.render(state.signalRouterView);
    circuitConnect.tick(dt, {
      onStart: ({ message }) => {
        ensureMiniGamePlayable('circuit').then((ok) => {
          if (!ok) return;
          setActiveMiniGame('circuit');
          state.circuitConnectView = syncCircuitPrioritySelection({ forceAdvance: true });
          hud.showSamPopup(`🚨 ${message}`, 3600);
          hud.pushFeed(`🚨 ${message}`, 'sam');
          hud.pushFeed('💸 Press K to pay XP and skip containment', 'system');
        });
      },
      onPressure: ({ edgeId }) => {
        hud.pushFeed(`⚠️ Fracture spreading through ${edgeId.toUpperCase()}`, 'sam');
      },
      onNpc: ({ type, text }) => {
        const labels = {
          courier: 'courier signal relay',
          agent: 'agent route reveal',
          fighter: 'fighter zone secure',
          recruiter: 'recruiter repair team',
        };
        hud.pushFeed(`🤝 NPC ${labels[type] || type} · ${text}`, 'combat');
      },
      onResolve: (result) => {
        handleMiniGameOutcome('circuit', result.outcome, result).catch(() => {});
      },
    }, {
      duelActive: duelState.status === 'active',
      outbreakActive: outbreakSystem.getPublicState().active,
      firewallActive: firewallDefense.getPublicState().active,
      signalRouterActive: state.signalRouterView?.active,
    });
    state.circuitConnectView = syncCircuitPrioritySelection();
    circuitConnectOverlay.render(state.circuitConnectView);
    const overlayType = outbreakSystem.getPublicState().active
      ? 'outbreak'
      : firewallDefense.getPublicState().active
        ? 'firewall'
        : state.signalRouterView?.active
          ? 'router'
          : state.circuitConnectView?.active
            ? 'circuit'
            : '';
    if (overlayType && sessionGuard.activeMiniGame !== overlayType) {
      setActiveMiniGame(overlayType);
    } else if (!overlayType && sessionGuard.overlayActive) {
      setActiveMiniGame('');
    }

    // Interpolate remote player positions toward server-provided targets.
    for (const remote of state.remotePlayers) {
      if (Number.isFinite(remote._targetX)) {
        remote.x += (remote._targetX - remote.x) * REMOTE_PLAYER_LERP_ALPHA;
      }
      if (Number.isFinite(remote._targetY)) {
        remote.y += (remote._targetY - remote.y) * REMOTE_PLAYER_LERP_ALPHA;
      }
    }

    // Update district HUD when player moves into a new district.
    updateDistrictHudState(state.player.districtId);
    duelOverlay.render();
  }

  function renderLoop() {
    updateReactiveGridState(state);
    renderer.render(state);
    requestAnimationFrame(renderLoop);
  }

  setInterval(logicTick, LOGIC_TICK_MS);
  updateReactiveGridState(state);
  requestAnimationFrame(renderLoop);
}

boot().catch((error) => {
  hud.setWorldStatus(`Boot failed: ${String(error?.message || error)}`);
  hud.setEntryTagline('Boot failed. Retry loading the district link.');
});
