import { connectMultiplayer, sendMovement } from './network.js';
import { loadUnifiedData } from './world/data-loader.js';
import {
  createGameState,
  applyRemotePlayers,
  updatePlayerMotion,
  awardXp,
  tickDistrictCapture,
} from './world/game-state.js';
import { createSamSystem } from './world/sam-system.js';
import { createNpcSystem } from './world/npc-system.js';
import { createQuestSystem } from './world/quest-system.js';
import { createMemorySystem } from './world/memory-system.js';
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
  const sam = createSamSystem(state);
  const npc = createNpcSystem(state);
  const quests = createQuestSystem(state);
  const memory = createMemorySystem(state);
  let multiplayerConnected = false;
  let nearbyNpc = null;
  let lastNpcScan = performance.now();
  let lastQuestDistrictId = state.player.districtId;
  const primaryFactionName = state.factions.primary?.name || 'Liberators';
  const secondaryFactionName = state.factions.secondary?.name || 'Wardens';
  const lore = state.lore?.legacy?.lore || {};

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
  hud.setQuests(quests.getActiveQuestCards());
  hud.setEntryTagline(`Deploying into ${state.player.districtName}…`);
  bootstrapLoreFeed();

  // Fallback: dismiss the entry overlay after 7s in case multiplayer never connects.
  setTimeout(() => hud.dismissEntryIdentity(0), ENTRY_OVERLAY_TIMEOUT_MS);

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
      hud.pushFeed(line, classifyFeedType(line));
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
    const line = npc.getDialogueLine(nearbyNpc);
    hud.showNpcDialogue(nearbyNpc.name || 'Citizen', nearbyNpc.roleLabel || nearbyNpc.role, line);
    hud.pushFeed(`🗣️ ${nearbyNpc.name}: ${line}`, 'system');
    memory.record('player', {
      at: Date.now(),
      action: 'npc_interact',
      npcId: nearbyNpc.id,
      role: nearbyNpc.role,
      district: state.player.districtId,
    });
  });

  let lastTs = performance.now();
  function logicTick() {
    const ts = performance.now();
    const dt = Math.min(MAX_FRAME_DELTA_SECONDS, (ts - lastTs) / 1000);
    lastTs = ts;

    updatePlayerMotion(state, input, dt, sendMovement);
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
