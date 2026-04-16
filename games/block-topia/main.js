import { connectMultiplayer, sendMovement } from './network.js';
import { loadUnifiedData } from './world/data-loader.js';
import { createGameState, applyRemotePlayers, updatePlayerMotion } from './world/game-state.js';
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

  hud.setWorldStatus(`Unified foundation online · ${state.room.id} room model`);
  hud.setDistrict(state.player.districtName);
  hud.setFactionStatus(`${state.factions.primary.name} vs ${state.factions.secondary.name}`);
  hud.setSamPhase(sam.getCurrentPhase().name);
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
      const statusText = status.joined ? `Connected (${status.ws})` : `${status.ws}${status.error ? ` · ${status.error}` : ''}`;
      hud.setMultiplayerStatus(statusText);
      if (status.roomId) {
        hud.setRoom(status.roomId);
      }
    },
    onPlayers: (players) => {
      applyRemotePlayers(state, players);
      hud.setPopulation(players.length, state.room.maxPlayers);
    },
    onFeed: (line) => {
      hud.pushFeed(line);
      memory.record('network', line);
    },
  });

  let lastTs = performance.now();

  function frame(ts) {
    const dt = Math.min(MAX_FRAME_DELTA_SECONDS, (ts - lastTs) / 1000);
    lastTs = ts;

    updatePlayerMotion(state, input, dt, sendMovement);
    npc.tick(dt);

    const district = state.districts.byId.get(state.player.districtId);
    if (district) {
      hud.setDistrict(district.name);
    }

    sam.tick(dt, {
      onPhaseChanged: (phase) => {
        hud.setSamPhase(phase.name);
        hud.pushFeed(`🧠 SAM phase advanced: ${phase.name}`);
        memory.record('sam', `Phase: ${phase.id}`);
      },
      onSignalRush: () => {
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
