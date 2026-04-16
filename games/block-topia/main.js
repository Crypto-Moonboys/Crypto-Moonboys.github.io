import { connectMultiplayer, sendMovement } from './network.js';
import { loadUnifiedData } from './world/data-loader.js';
import {
  createGameState,
  applyRemotePlayers,
  updatePlayerMotion,
  awardXp,
  tickDistrictCapture,
  XP_DISTRICT_CAPTURE,
  SCORE_DISTRICT_CAPTURE,
} from './world/game-state.js';
import { createSamSystem } from './world/sam-system.js';
import { createNpcSystem } from './world/npc-system.js';
import { createQuestSystem } from './world/quest-system.js';
import { createMemorySystem } from './world/memory-system.js';
import { createHud } from './ui/hud.js';
import { createIsoRenderer } from './render/iso-renderer.js';

const MAX_FRAME_DELTA_SECONDS = 1 / 30;

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

  // Populate HUD with initial values
  hud.setPlayerName(state.player.name);
  hud.setWorldStatus(`Unified city online · ${state.room.id} room`);
  hud.setDistrict(state.player.districtName);
  hud.setDistrictControl(50);
  hud.setFactionStatus(`${state.factions.primary.name} vs ${state.factions.secondary.name}`);
  hud.setSamPhase(sam.getCurrentPhase().name);
  hud.setPhase(state.phase);
  hud.setScore(state.player.score);
  hud.setXp(state.player.xp);
  hud.setRoom(state.room.id);
  hud.setPopulation(0, state.room.maxPlayers);
  hud.setQuests(quests.getActiveQuestCards());

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
    },
    onPlayers: (players) => {
      applyRemotePlayers(state, players);
      hud.setPopulation(players.length, state.room.maxPlayers);
    },
    onFeed: (line) => {
      hud.pushFeed(line);
      memory.record('network', line);
    },
    onQuestCompleted: ({ title, rewardXp }) => {
      // Server-authoritative quest completion: award XP and refresh HUD
      const awarded = quests.completeQuest(title, rewardXp) || rewardXp;
      if (awarded) {
        awardXp(state, awarded);
        hud.setXp(state.player.xp);
        hud.setScore(state.player.score);
        hud.setQuests(quests.getActiveQuestCards());
      }
    },
  });

  // Space bar toggles Day/Night phase (mirrors Street Signal Monster)
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space') return;
    state.phase = state.phase === 'Day' ? 'Night' : 'Day';
    hud.setPhase(state.phase);
    hud.pushFeed(`🌙 Phase shifted to ${state.phase}`);
    canvas.classList.toggle('phase-night', state.phase === 'Night');
  });

  let lastTs = performance.now();

  function frame(ts) {
    const dt = Math.min(MAX_FRAME_DELTA_SECONDS, (ts - lastTs) / 1000);
    lastTs = ts;

    updatePlayerMotion(state, input, dt, sendMovement);
    npc.tick(dt);

    // Update district HUD when player moves into a new district
    const district = state.districts.byId.get(state.player.districtId);
    if (district) {
      hud.setDistrict(district.name);
      const ds = state.districtState.find((d) => d.id === district.id);
      if (ds) hud.setDistrictControl(ds.control);
    }

    // Tick district capture (Night phase only)
    const captureEvent = tickDistrictCapture(state, dt);
    if (captureEvent) {
      hud.setScore(state.player.score);
      hud.setXp(state.player.xp);
      hud.pushFeed(`🏴 ${captureEvent.district.name} captured! +${XP_DISTRICT_CAPTURE} XP +${SCORE_DISTRICT_CAPTURE} score`);
      memory.record('district', `Captured ${captureEvent.district.name}`);
    }

    sam.tick(dt, {
      onPhaseChanged: (phase) => {
        hud.setSamPhase(phase.name);
        hud.pushFeed(`🧠 SAM phase advanced: ${phase.name}`);
        memory.record('sam', `Phase: ${phase.id}`);
      },
      onSignalRush: () => {
        hud.showSamPopup('⚡ SAM SIGNAL RUSH — Giant encounter incoming!', 5000);
        hud.pushFeed('⚡ SAM Signal Rush hook fired (site/wiki sync ready)');
      },
    });

    quests.tick(dt, {
      onQuestPulse: (text) => hud.pushFeed(`🎯 ${text}`),
    });

    renderer.render(state);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot().catch((error) => {
  hud.setWorldStatus(`Boot failed: ${String(error?.message || error)}`);
});
