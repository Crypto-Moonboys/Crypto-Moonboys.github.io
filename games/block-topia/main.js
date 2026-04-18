import { connectMultiplayer, sendMovement } from './network.js';
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
import { createHud } from './ui/hud.js';
import { createIsoRenderer } from './render/iso-renderer.js';

const ENTRY_OVERLAY_TIMEOUT_MS = 7000;
const MAX_FRAME_DELTA_SECONDS = 1 / 30;
const SAM_IMPACT_DURATION_MS = 2000;
const DISTRICT_PULSE_DURATION_MS = 1300;
const DISTRICT_PULSE_CONFLICT_MS = 1400;
const ENTRY_DISMISS_DELAY_MS = 2400;
const DISTRICT_CAPTURE_THRESHOLD = 90;
const LOGIC_TICK_MS = 50;
const NPC_SCAN_INTERVAL_MS = 150;
const REMOTE_PLAYER_LERP_ALPHA = 0.18;
const LIVE_REFRESH_INTERVAL_MS = 120000; // 2 minutes
const FEED_DEDUPE_TTL_MS = 5 * 60 * 1000;
const MAX_FEED_CACHE_SIZE = 80;
const CAMERA_ZOOM_PRESETS = [0.7, 1, 1.4];
const CAMERA_ZOOM_MIN = 0.7;
const CAMERA_ZOOM_MAX = 1.4;
// ~6% step gives smooth wheel zoom while traversing the clamp range in practical increments.
const CAMERA_ZOOM_WHEEL_STEP = 0.06;
const MOUSE_DRAG_THRESHOLD_PX = 8;

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

async function boot() {
  const dataBundle = await loadUnifiedData();
  const state = createGameState(dataBundle);
  state.camera.zoomIndex = 1;
  state.camera.zoom = CAMERA_ZOOM_PRESETS[state.camera.zoomIndex];
  const liveIntelligence = createLiveIntelligence();
  await liveIntelligence.refresh();
  const sam = createSamSystem(state);
  const npc = createNpcSystem(state, liveIntelligence);
  const quests = createQuestSystem(state, liveIntelligence);
  const clues = createClueSignalSystem(liveIntelligence);
  const operations = createSignalOperationSystem(state, liveIntelligence);
  const memory = createMemorySystem(state);
  let multiplayerConnected = false;
  let nearbyNpc = null;
  let lastNpcScan = performance.now();
  let lastQuestDistrictId = state.player.districtId;
  const seenFeed = new Map();
  const primaryFactionName = state.factions.primary?.name || 'Liberators';
  const secondaryFactionName = state.factions.secondary?.name || 'Wardens';
  const lore = state.lore?.legacy?.lore || {};

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

  function classifyFeedType(text) {
    const lower = String(text || '').toLowerCase();
    if (lower.includes('sam') || lower.includes('signal rush')) return 'sam';
    if (lower.includes('quest') || lower.includes('xp')) return 'quest';
    if (lower.includes('captured') || lower.includes('district')) return 'combat';
    return 'system';
  }

  function applyPhase(nextPhase, source = 'local') {
    state.phase = nextPhase;
    hud.setPhase(state.phase);
    hud.triggerPhaseTransition(state.phase);
    hud.pushFeed(
      `🌗 ${source === 'server' ? 'Network' : 'Street'} phase shift: ${state.phase}`,
      'system',
    );
    canvas.classList.toggle('phase-night', state.phase === 'Night');
    document.body.classList.toggle('phase-night', state.phase === 'Night');
    // Street Signal feature: canvas filter for immediate phase visual feedback.
    canvas.style.filter = state.phase === 'Night'
      ? 'brightness(0.54) saturate(1.2) hue-rotate(24deg)'
      : 'none';
  }

  function bootstrapLoreFeed() {
    const districtFlavor = lore?.districts?.[0]?.flavor?.[0];
    if (districtFlavor) hud.pushFeed(`📰 ${districtFlavor}`, 'system');
    if (!Array.isArray(lore?.npc_rumors) || lore.npc_rumors.length === 0) return;
    const rumor = lore.npc_rumors[Math.floor(Math.random() * lore.npc_rumors.length)];
    if (rumor) hud.pushFeed(`🗞️ ${rumor}`, 'system');
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

  function applyLiveSignalRefresh(refreshResult) {
    if (!refreshResult?.changed) return;

    const snapshot = refreshResult.snapshot || liveIntelligence.getSnapshot();
    const worldBulletins = liveIntelligence.getWorldFeedLines(3);
    worldBulletins.forEach((line) => {
      if (!line) return;
      pushFeedDeduped(`📡 ${line}`, 'sam', `world-bulletin:${line}`);
    });
    pushFeedDeduped(
      `🛰️ Live intelligence refreshed (${snapshot.mode || 'fallback'})`,
      'system',
      `live-refresh:${snapshot.generatedAt || snapshot.mode || 'fallback'}`,
    );
    clues.refreshFromSignals?.();
    operations.syncFromSignals({ force: true });
    hud.setQuests(quests.getActiveQuestCards());
    hud.setWorldStatus(`Unified city online · live signals ${snapshot.mode || 'fallback'} · ${snapshot.signalCount || 0} active lanes`);
  }

  // Populate HUD with initial values
  hud.setPlayerName(state.player.name);
  hud.setWorldStatus(`Unified city online · district memory sync active`);
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
  operations.syncFromSignals({ force: true });
  hud.setQuests(quests.getActiveQuestCards());
  const worldBulletins = liveIntelligence.getWorldFeedLines(2);
  worldBulletins.forEach((line) => pushFeedDeduped(`📡 ${line}`, 'sam', `world-bulletin:${line}`));
  const liveMode = liveIntelligence.getSnapshot().mode || 'fallback';
  pushFeedDeduped(`🛰️ Live intelligence layer online (${liveMode})`, 'system', `live-boot:${liveMode}`);
  hud.setEntryTagline(`Deploying into ${state.player.districtName}…`);
  bootstrapLoreFeed();
  hud.pushFeed('🔍 Zoom scale test active: [ = further, ] = closer', 'system');

  setInterval(() => {
    liveIntelligence.refresh()
      .then((result) => applyLiveSignalRefresh(result))
      .catch(() => {});
  }, LIVE_REFRESH_INTERVAL_MS);

  // Fallback: dismiss the entry overlay after 7s in case multiplayer never connects.
  setTimeout(() => hud.dismissEntryIdentity(0), ENTRY_OVERLAY_TIMEOUT_MS);

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const key = event.key;
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
        const zoom = state.camera.zoom || 1;
        state.camera.panX = state.mouse.cameraStartX + (deltaX / zoom);
        state.camera.panY = state.mouse.cameraStartY + (deltaY / zoom);
        state.mouse.hoverTile = null;
        state.mouse.hoverNpcId = '';
        return;
      }
    }
    state.mouse.hoverTile = renderer.pickTileFromClientPoint(event.clientX, event.clientY, state);
    state.mouse.hoverNpcId = renderer.pickNpcFromClientPoint(event.clientX, event.clientY, state)?.id || '';
  });

  canvas.addEventListener('mouseleave', () => {
    state.mouse.hoverTile = null;
    state.mouse.hoverNpcId = '';
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
      state.mouse.suppressDblClickUntil = performance.now() + 400;
      state.mouse.hoverTile = renderer.pickTileFromClientPoint(event.clientX, event.clientY, state);
      state.mouse.hoverNpcId = renderer.pickNpcFromClientPoint(event.clientX, event.clientY, state)?.id || '';
    }
  });

  canvas.addEventListener('click', (event) => {
    if (state.mouse.suppressClick) {
      state.mouse.suppressClick = false;
      return;
    }
    if (tryInteractWithClickedNpc(event)) return;
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
      multiplayerConnected = Boolean(status.joined);
      if (multiplayerConnected) {
        hud.setEntryTagline('LIVE CITY LINK ESTABLISHED — Entering Street Signal layers');
        hud.dismissEntryIdentity(ENTRY_DISMISS_DELAY_MS);
      }
    },
    onPlayers: (players) => {
      applyRemotePlayers(state, players);
      hud.setPopulation(players.length, state.room.maxPlayers);
    },
    onWorldSnapshot: (data) => {
      if (Array.isArray(data?.npcs)) {
        // Server NPC positions become the lerp targets for npc-system.tick().
        state.npcTargets = data.npcs;
      }
      if (Array.isArray(data?.districts)) {
        for (const incoming of data.districts) {
          const district = state.districtState.find((item) => item.id === incoming.id);
          if (!district) continue;
          if (Number.isFinite(incoming.control)) {
            district.control = Math.max(0, Math.min(100, incoming.control));
          }
          if (incoming.owner) {
            district.owner = incoming.owner;
          }
        }
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
      hud.pushFeed(`🧠 SAM phase synced: ${phase.name}`, 'sam');
      const samEvent = { at: Date.now(), phase: phase.id, source: 'server' };
      if (phase.id === 'sam-event') {
        samEvent.type = 'giant_encounter';
        state.effects.samImpactUntil = Date.now() + SAM_IMPACT_DURATION_MS;
        hud.triggerSamImpact('⚡ SAM SIGNAL RUSH — Giant encounter incoming!');
      } else if (phase.id === 'conflict') {
        state.effects.districtPulseUntil = Date.now() + DISTRICT_PULSE_CONFLICT_MS;
      }
      memory.record('sam', samEvent);
    },
    onDistrictCaptureChanged: ({ districtId, control, owner }) => {
      const district = state.districtState.find((item) => item.id === districtId);
      if (!district) return;

      const previousControl = district.control;
      if (Number.isFinite(control)) {
        district.control = Math.max(0, Math.min(100, control));
      }
      if (owner) {
        district.owner = owner;
      }

      if (state.player.districtId === district.id) {
        hud.setDistrictControl(district.control);
        hud.setDistrictOwner(district.owner);
      }
      if (owner) {
        hud.setFactionStatus(`${primaryFactionName} vs ${secondaryFactionName} · ${district.name}: ${owner}`);
      }
      state.effects.districtPulseUntil = Date.now() + DISTRICT_PULSE_DURATION_MS;
      state.effects.districtPulseId = district.id;
      if (previousControl < DISTRICT_CAPTURE_THRESHOLD && district.control >= DISTRICT_CAPTURE_THRESHOLD) {
        // Street Signal feature reintroduced: district capture impact broadcast.
        hud.showDistrictCapture(`🏴 ${district.name} CAPTURED · ${district.owner}`);
        hud.pushFeed(`🏴 ${district.name} captured by ${district.owner}!`, 'combat');
      } else {
        hud.pushFeed(`🏙️ District sync: ${district.name} ${Math.round(district.control)}% · ${district.owner}`, 'combat');
      }
      memory.record('district', {
        at: Date.now(),
        district: district.id,
        previousControl,
        control: district.control,
        owner: district.owner,
        source: 'server',
      });
    },
  });

  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'e' || event.repeat || !nearbyNpc) return;
    interactWithNpc(nearbyNpc);
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
    // Visual-only capture preview — server decides actual control values.
    tickDistrictCapture(state, dt);

    if (ts - lastNpcScan > NPC_SCAN_INTERVAL_MS) {
      nearbyNpc = npc.nearestInteractive(state.player.x, state.player.y);
      lastNpcScan = ts;
    }

    state.player.nearbyNpcId = nearbyNpc?.id || '';
    hud.setInteractPrompt(
      nearbyNpc
        ? `⚡ Press E · Talk to ${nearbyNpc.name} (${nearbyNpc.roleLabel || nearbyNpc.role})`
        : '',
      Boolean(nearbyNpc),
    );

    quests.tick(dt, {
      onQuestPulse: (text) => hud.pushFeed(`🎯 ${text}`, 'quest'),
    });
    clues.tick(dt, {
      onCluePulse: (text) => hud.pushFeed(`🧩 ${text}`, 'quest'),
    });
    operations.tick(dt, {
      onOperationResolved: (operation) => {
        pushFeedDeduped('✔ SIGNAL STABILISED — TRACE COMPLETE', 'quest', `op-resolved:${operation.id}`);
        pushFeedDeduped(
          `📍 ${operation.title} resolved in ${state.districts.byId.get(operation.districtId)?.name || operation.districtId}`,
          'sam',
          `op-resolved-detail:${operation.id}`,
        );
        hud.showSamPopup('✔ SIGNAL STABILISED — TRACE COMPLETE', 2600);
        operations.syncFromSignals();
        hud.setQuests(quests.getActiveQuestCards());
      },
      onOperationExpired: (operation) => {
        pushFeedDeduped(
          `⌛ ${operation.title} signal faded`,
          'system',
          `op-expired:${operation.id}`,
        );
        operations.syncFromSignals();
        hud.setQuests(quests.getActiveQuestCards());
      },
    });

    // Interpolate remote player positions toward server-provided targets.
    for (const remote of state.remotePlayers) {
      if (Number.isFinite(remote._targetX)) {
        remote.x += (remote._targetX - remote.x) * REMOTE_PLAYER_LERP_ALPHA;
      }
      if (Number.isFinite(remote._targetY)) {
        remote.y += (remote._targetY - remote.y) * REMOTE_PLAYER_LERP_ALPHA;
      }
    }

    // Update district HUD when player moves into a new district
    const district = state.districts.byId.get(state.player.districtId);
    if (district) {
      hud.setDistrict(district.name);
      const ds = state.districtState.find((d) => d.id === district.id);
      if (ds) {
        hud.setDistrictControl(ds.control);
        hud.setDistrictOwner(ds.owner);
      }
      if (district.id !== lastQuestDistrictId) {
        lastQuestDistrictId = district.id;
        // Clear capture preview when entering a new district.
        state.capturePreview = null;
        hud.setQuests(quests.getActiveQuestCards());
      }
    }
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
