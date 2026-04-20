import {
  connectMultiplayer,
  sendMovement,
  sendNodeInterference,
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
import { createNodeOutbreakOverlay } from './ui/node-outbreak-overlay.js';
import { createIsoRenderer } from './render/iso-renderer.js';
import { DUEL_FIGHTER_CONFIG } from './data/duel-fighter-config.js';
import { createNodeOutbreakSystem } from './world/node-outbreak-system.js';
import { createFirewallDefenseSystem } from './world/firewall-defense-system.js';
import { createFirewallDefenseOverlay } from './ui/firewall-defense-overlay.js';
import { createSignalRouterSystem } from './world/signal-router-system.js';
import { createSignalRouterOverlay } from './ui/signal-router-overlay.js';

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

async function boot() {
  const dataBundle = await loadUnifiedData();
  const state = createGameState(dataBundle);
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
  const outbreakSystem = createNodeOutbreakSystem(state);
  const firewallDefense = createFirewallDefenseSystem(state);
  const signalRouter = createSignalRouterSystem(state);
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
  let multiplayerConnected = false;
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
  const primaryFactionName = state.factions.primary?.name || 'Liberators';
  const secondaryFactionName = state.factions.secondary?.name || 'Wardens';
  const canonAdapter = state.lore?.canonAdapter || {};
  const canonLore = state.lore?.canon || canonAdapter.canonLore || {};
  const lore = state.lore?.legacy?.lore || {};
  const districtStateById = new Map(state.districtState.map((district) => [district.id, district]));
  const aiRuntime = resolveAiRuntimeConfig();

  hud.setAiStatus(aiRuntime.status);
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
    // Visual-only optimistic pulse — node state is server-authoritative.
    // All real effects (status, feed, HUD, NPC, SAM) come from onNodeInterferenceChanged.
    nodeInterference.beginLocalPulse(node.id);
    sendNodeInterference(node.id);
    return true;
  }

  function classifyFeedType(text) {
    const lower = String(text || '').toLowerCase();
    if (lower.includes('sam') || lower.includes('signal rush') || lower.includes('phase')) return 'sam';
    if (lower.includes('quest') || lower.includes('xp') || lower.includes('operation')) return 'quest';
    if (lower.includes('captured') || lower.includes('district') || lower.includes('duel') || lower.includes('node')) return 'combat';
    return 'system';
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
    hud.setEntryTagline(`Deploying into ${state.player.districtName} · ${getCanonAtmosphereLine()}`);
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
    return true;
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

  function applyDistrictControlUpdate({ districtId, control, owner }, source = 'server', options = {}) {
    const district = districtStateById.get(districtId);
    if (!district) return;
    const previousControl = district.control;
    if (Number.isFinite(control)) {
      district.control = Math.max(0, Math.min(100, control));
    }
    if (owner) district.owner = owner;

    if (state.player.districtId === district.id) {
      hud.setDistrictControl(district.control);
      hud.setDistrictOwner(district.owner);
    }
    if (options.silent) return;

    if (owner) {
      hud.setFactionStatus(`${primaryFactionName} vs ${secondaryFactionName} · ${district.name}: ${owner}`);
    }
    state.effects.districtPulseUntil = Date.now() + DISTRICT_PULSE_DURATION_MS;
    state.effects.districtPulseId = district.id;
    if (previousControl < DISTRICT_CAPTURE_THRESHOLD && district.control >= DISTRICT_CAPTURE_THRESHOLD) {
      hud.showDistrictCapture(`🏴 ${district.name} SECURED · ${district.owner}`);
      pushFeedDeduped(`🏴 District secured: ${district.name} now controlled by ${district.owner}`, 'combat', `district-captured:${district.id}:${district.owner}`);
    } else if (source === 'node') {
      const controlPct = Math.round(district.control);
      pushFeedDeduped(`🏙️ District pressure rerouted · ${district.name} ${controlPct}% control`, 'combat', `district-node-ripple:${district.id}:${controlPct}`);
    } else {
      const controlPct = Math.round(district.control);
      pushFeedDeduped(`🏙️ District relay synced · ${district.name} ${controlPct}% · ${district.owner}`, 'combat', `district-sync:${district.id}:${controlPct}:${district.owner}`);
    }
    memory.record('district', {
      at: Date.now(),
      district: district.id,
      previousControl,
      control: district.control,
      owner: district.owner,
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
    if (district.id !== lastHudDistrictId) {
      hud.setDistrict(district.name);
      lastHudDistrictId = district.id;
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
    }
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
  hud.setFactionStatus(`${primaryFactionName} vs ${secondaryFactionName}`);
  hud.setSamPhase(sam.getCurrentPhase().name);
  applyPhase(state.phase, 'system');
  hud.setScore(state.player.score);
  hud.setXp(state.player.xp);
  hud.setRoom(state.room.id);
  hud.setPopulation(0, state.room.maxPlayers);
  refreshOperationsHud(true);
  const worldBulletins = liveIntelligence.getWorldFeedLines(2);
  worldBulletins.forEach((line) => pushFeedDeduped(`📡 ${line}`, 'sam', `world-bulletin:${line}`));
  const liveMode = liveIntelligence.getSnapshot().mode || 'backup';
  pushFeedDeduped(`🛰️ Canon signal bridge active (${liveMode})`, 'system', `live-boot:${liveMode}`);
  bootstrapEntryIdentity();
  bootstrapLoreFeed();
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

  // Fallback: dismiss the entry overlay after 7s in case multiplayer never connects.
  setTimeout(() => hud.dismissEntryIdentity(0), ENTRY_OVERLAY_TIMEOUT_MS);

  window.addEventListener('keydown', (event) => {
    if (shouldIgnoreHotkey(event) || event.repeat) return;
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
    if (performance.now() < (state.mouse.suppressDblClickUntil || 0)) return;
    if (tryInteractWithClickedNpc(event)) return;

    const tile = renderer.pickTileFromClientPoint(event.clientX, event.clientY, state);
    state.mouse.selectedTile = tile;
    if (!tile?.valid) return;
    state.player.moveTarget = { x: tile.col, y: tile.row };
  });

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
      const statusText = status.joined
        ? `Connected (${status.ws})`
        : `${status.ws}${status.error ? ` · ${status.error}` : ''}`;
      hud.setMultiplayerStatus(statusText);
      if (status.roomId) hud.setRoom(status.roomId);
      if (status.sessionId) localSessionId = status.sessionId;
      multiplayerConnected = Boolean(status.joined);
      if (multiplayerConnected) {
        hud.setEntryTagline(`LIVE CITY LINK ESTABLISHED · ${getCanonAtmosphereLine()}`);
        hud.dismissEntryIdentity(ENTRY_DISMISS_DELAY_MS);
      }
    },
    onPlayers: (players) => {
      applyRemotePlayers(state, players);
      hud.setPopulation(players.length, state.room.maxPlayers);
      if (selectedRemotePlayer?.id) {
        selectedRemotePlayer = state.remotePlayers.find((player) => player.id === selectedRemotePlayer.id) || null;
        if (!selectedRemotePlayer) {
          state.mouse.selectedRemotePlayerId = '';
        }
      }
    },
    onWorldSnapshot: (data) => {
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
      }
      memory.record('sam', samEvent);
    },
    onDistrictCaptureChanged: ({ districtId, control, owner }) => {
      applyDistrictControlUpdate({ districtId, control, owner }, 'server');
    },
    onNodeInterferenceChanged: (payload) => {
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
  });

  window.addEventListener('keydown', (event) => {
    if (shouldIgnoreHotkey(event) || event.key.toLowerCase() !== 'e' || event.repeat || !nearbyNpc) return;
    interactWithNpc(nearbyNpc);
  });
  window.addEventListener('keydown', (event) => {
    if (shouldIgnoreHotkey(event) || event.repeat) return;
    const key = event.key.toLowerCase();
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

    const keyboardMovementApplied = updatePlayerMotion(state, input, dt, sendMovement);
    // Keyboard input takes priority and cancels click-move targets to avoid conflicting movement commands.
    if (keyboardMovementApplied && isMovementInputActive()) {
      state.player.moveTarget = null;
    } else {
      movePlayerTowardTarget(state, dt, sendMovement);
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
    firewallDefense.tick(dt, {
      onStart: () => {
        hud.showSamPopup('🚨 FIREWALL BREACH — DEFEND THE NETWORK', 3600);
        hud.pushFeed('🚨 FIREWALL BREACH — DEFEND THE NETWORK', 'sam');
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
        if (result.outcome === 'success') {
          const reward = awardXp(state, result.rewardXp);
          state.player.score += result.rewardGems;
          hud.setXp(reward.xp);
          hud.setScore(state.player.score);
          hud.pushFeed(`✅ Firewall defense held · +${result.rewardXp} XP · +${result.rewardGems} gems`, 'quest');
          hud.showQuestComplete('FIREWALL DEFENSE', result.rewardXp);
          hud.showNodeInterference('Network stability buff applied', 'signal');
        } else {
          state.sam.pressure = Math.min(100, state.sam.pressure + (result.samPressureDelta || 0));
          const district = districtStateById.get(state.player.districtId);
          if (district) district.control = Math.max(0, district.control - (result.districtInstabilityPenalty || 0));
          hud.pushFeed('❌ Firewall collapse · district instability increased', 'sam');
          hud.showNodeInterference('SAM pressure increased after breach', 'warning');
        }
      },
    }, {
      duelActive: duelState.status === 'active',
      outbreakActive: outbreakSystem.getPublicState().active,
    });
    firewallOverlay.render(firewallDefense.getPublicState());

    outbreakSystem.tick(dt, {
      onStart: ({ nodeId }) => {
        const node = state.controlNodes.find((n) => n.id === nodeId);
        const district = districtStateById.get(node?.districtId)?.name || node?.districtId || 'Unknown district';
        hud.showSamPopup(`🚨 VIRUS ALERT — NODES UNDER ATTACK\nNode ${nodeId.toUpperCase()} · ${district}`, 3800);
        hud.pushFeed(`🚨 NODE OUTBREAK DEFENSE online at ${nodeId.toUpperCase()} (${district})`, 'sam');
      },
      onTrait: (trait) => {
        hud.pushFeed(`🧬 Virus adapted: ${trait.name}`, 'sam');
      },
      onSpread: ({ fromId, toId, burst }) => {
        hud.pushFeed(`${burst ? '💥' : '🦠'} Spread ${fromId.toUpperCase()} → ${toId.toUpperCase()}`, 'combat');
      },
      onResolve: (result) => {
        if (result.outcome === 'success') {
          const reward = awardXp(state, result.rewardXp);
          state.player.score += result.rewardGems;
          hud.setXp(reward.xp);
          hud.pushFeed(`✅ Outbreak contained · +${result.rewardXp} XP · +${result.rewardGems} gems`, 'quest');
          hud.showQuestComplete('NODE OUTBREAK DEFENSE', result.rewardXp);
          hud.showNodeInterference(`Containment bonus: +${result.rewardGems} gems`, 'signal');
        } else {
          state.sam.pressure = Math.min(100, state.sam.pressure + (result.samPressureDelta || 0));
          const district = districtStateById.get(state.player.districtId);
          if (district) {
            district.control = Math.max(0, district.control - (result.districtControlPenalty || 0));
          }
          hud.pushFeed('❌ Outbreak breached threshold · district pressure dropped', 'sam');
          hud.showNodeInterference('Containment failed: SAM pressure increased', 'warning');
        }
      },
    }, {
      duelActive: duelState.status === 'active' || firewallDefense.getPublicState().active,
    });
    outbreakOverlay.render(outbreakSystem.getPublicState());
    signalRouter.tick(dt, {
      onStart: ({ message }) => {
        hud.showSamPopup(`🚨 ${message}`, 3400);
        hud.pushFeed(`🚨 ${message}`, 'sam');
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
        if (result.outcome === 'success') {
          const reward = awardXp(state, result.rewardXp);
          state.player.score += result.rewardGems;
          hud.setXp(reward.xp);
          hud.setScore(state.player.score);
          hud.pushFeed(`✅ Signal Router stabilized · +${result.rewardXp} XP · +${result.rewardGems} gems`, 'quest');
          hud.showQuestComplete('SIGNAL ROUTER', result.rewardXp);
          hud.showNodeInterference('Routing stability boosted', 'signal');
        } else {
          state.sam.pressure = Math.min(100, state.sam.pressure + (result.samPressureDelta || 0));
          const district = districtStateById.get(state.player.districtId);
          if (district) district.control = Math.max(0, district.control - (result.districtInstabilityPenalty || 0));
          hud.pushFeed('❌ Signal Router collapse · district instability increased', 'sam');
          hud.showNodeInterference('SAM pressure increased after route failure', 'warning');
        }
      },
    }, {
      duelActive: duelState.status === 'active',
      outbreakActive: outbreakSystem.getPublicState().active,
      firewallActive: firewallDefense.getPublicState().active,
    });
    state.signalRouterView = signalRouter.getPublicState();
    signalRouterOverlay.render(state.signalRouterView);

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
    renderer.render(state);
    requestAnimationFrame(renderLoop);
  }

  setInterval(logicTick, LOGIC_TICK_MS);
  requestAnimationFrame(renderLoop);
}

boot().catch((error) => {
  hud.setWorldStatus(`Boot failed: ${String(error?.message || error)}`);
  hud.setEntryTagline('Boot failed. Retry loading the district link.');
});
