import { connectMultiplayer, sendMovement } from './network.js';
import { createIsoRenderer } from './render/iso-renderer.js';
import { loadUnifiedData } from './world/data-loader.js';
import {
  applyRemotePlayers,
  createGameState,
  movePlayerTowardTarget,
  updatePlayerMotion,
} from './world/game-state.js';

const LOGIC_TICK_MS = 50;
const MAX_FRAME_DELTA_SECONDS = 1 / 30;
const REMOTE_PLAYER_LERP_ALPHA = 0.2;
const CAMERA_ZOOM_MIN = 0.7;
const CAMERA_ZOOM_MAX = 1.4;
const CAMERA_ZOOM_WHEEL_STEP = 0.06;
const MOUSE_DRAG_THRESHOLD_PX = 8;
const MOUSE_DRAG_DOUBLE_CLICK_SUPPRESS_MS = 400;

const canvas = document.getElementById('world-canvas');
const hudPlayer = document.getElementById('player-name');
const hudRoom = document.getElementById('room-status');
const hudPopulation = document.getElementById('population-status');
const hudConnection = document.getElementById('hud-connection');
const errorBanner = document.getElementById('error-banner');

const renderer = createIsoRenderer(canvas);
const input = Object.create(null);

let state = null;
let localSessionId = '';
let lastTickTs = performance.now();
let connected = false;

function clampZoom(value) {
  return Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, value));
}

function setError(text) {
  const line = String(text || '').trim();
  if (!line) {
    errorBanner.classList.add('hidden');
    errorBanner.textContent = '';
    return;
  }
  errorBanner.textContent = line;
  errorBanner.classList.remove('hidden');
}

function updateHud() {
  if (!state) return;
  const localPresent = connected ? 1 : 0;
  hudPlayer.textContent = `Player: ${state.player.name}`;
  hudRoom.textContent = `Room: ${state.room.id}`;
  hudPopulation.textContent = `Players: ${localPresent + state.remotePlayers.length} / ${state.room.maxPlayers}`;
  hudConnection.textContent = `Connection: ${connected ? 'connected' : 'connecting'}`;
}

function syncCameraToPlayer() {
  if (!state) return;
  state.camera.x = (state.player.x - state.player.y) * 32;
  state.camera.y = (state.player.x + state.player.y) * 16;
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

function tickRemotePlayers(dt) {
  for (const remote of state.remotePlayers) {
    if (!Number.isFinite(remote?._targetX) || !Number.isFinite(remote?._targetY)) continue;
    remote.x += (remote._targetX - remote.x) * Math.min(1, REMOTE_PLAYER_LERP_ALPHA * (dt * 60));
    remote.y += (remote._targetY - remote.y) * Math.min(1, REMOTE_PLAYER_LERP_ALPHA * (dt * 60));
  }
}

function updateMouseHover(clientX, clientY) {
  if (!state) return;
  state.mouse.hoverTile = renderer.pickTileFromClientPoint(clientX, clientY, state);
  state.mouse.hoverNpcId = '';
  state.mouse.hoverNodeId = '';
  state.mouse.hoverRemotePlayerId = '';
}

function bindInput() {
  window.addEventListener('keydown', (event) => {
    input[event.key.toLowerCase()] = true;
  });

  window.addEventListener('keyup', (event) => {
    input[event.key.toLowerCase()] = false;
  });

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    state.camera.zoom = clampZoom((state.camera.zoom || 1) + (direction * CAMERA_ZOOM_WHEEL_STEP));
  }, { passive: false });

  canvas.addEventListener('mousemove', (event) => {
    if (state.mouse.pointerDown) {
      const deltaX = event.clientX - state.mouse.dragStartX;
      const deltaY = event.clientY - state.mouse.dragStartY;
      if (Math.hypot(deltaX, deltaY) >= MOUSE_DRAG_THRESHOLD_PX) {
        state.mouse.dragging = true;
        state.mouse.dragMoved = true;
      }
      if (state.mouse.dragging) {
        const zoom = state.camera.zoom || 1;
        state.camera.panX = state.mouse.cameraStartX + (deltaX / zoom);
        state.camera.panY = state.mouse.cameraStartY + (deltaY / zoom);
        state.mouse.hoverTile = null;
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
      return;
    }
    state.mouse.dragMoved = false;
  });

  canvas.addEventListener('click', (event) => {
    if (state.mouse.suppressClick) {
      state.mouse.suppressClick = false;
      return;
    }
    const tile = renderer.pickTileFromClientPoint(event.clientX, event.clientY, state);
    state.mouse.selectedTile = tile;
    if (!tile?.valid) return;
    state.player.moveTarget = { x: tile.col, y: tile.row };
  });
}

function logicTick() {
  const ts = performance.now();
  const dt = Math.min(MAX_FRAME_DELTA_SECONDS, (ts - lastTickTs) / 1000);
  lastTickTs = ts;

  const keyboardMovementApplied = updatePlayerMotion(state, input, dt, sendMovement);
  if (keyboardMovementApplied && isMovementInputActive()) {
    state.player.moveTarget = null;
  } else {
    movePlayerTowardTarget(state, dt, sendMovement);
  }

  tickRemotePlayers(dt);
  updateHud();
}

function renderLoop() {
  renderer.render(state);
  requestAnimationFrame(renderLoop);
}

function applyPassiveVisualModeGuards() {
  // Passive-map guard: keep visuals only (tiles/terrain/props/player markers),
  // while all gameplay nodes/panels/mini-game systems stay disabled.
  state.controlNodes = [];
  state.signalOperations.active = [];
  state.npc.entities = [];
  state.mouse.hoverNodeId = '';
  state.mouse.selectedNodeId = '';
}

async function boot() {
  const bundle = await loadUnifiedData();
  state = createGameState(bundle);
  state.player.id = '';
  state.player.name = `Player_${Math.floor(Math.random() * 9000) + 1000}`;
  state.camera.zoom = 1;
  state.camera.zoomIndex = 1;
  applyPassiveVisualModeGuards();
  syncCameraToPlayer();

  setError('');
  updateHud();
  bindInput();

  setInterval(logicTick, LOGIC_TICK_MS);
  requestAnimationFrame(renderLoop);

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
      if (status?.sessionId) {
        localSessionId = String(status.sessionId);
        state.player.id = localSessionId;
      }
      connected = Boolean(status?.joined);

      if (status?.ws === 'room-full') {
        setError('Room is full. Block Topia is now limited to 2 players.');
      } else if (status?.ws === 'unavailable' || status?.ws === 'failed' || status?.ws === 'disconnected') {
        setError(status?.error || 'Connection lost.');
      } else {
        setError('');
      }

      updateHud();
    },
    onPlayers: (players) => {
      const list = Array.isArray(players) ? players : [];
      const local = localSessionId
        ? list.find((player) => player.id === localSessionId)
        : null;

      if (local) {
        state.player.x = Number.isFinite(local.x) ? local.x : state.player.x;
        state.player.y = Number.isFinite(local.y) ? local.y : state.player.y;
        state.player.name = local.name || state.player.name;
      }

      const remotes = list
        .filter((player) => player.id && player.id !== localSessionId)
        .map((player) => ({
          id: player.id,
          name: player.name || 'Opponent',
          x: Number(player.x) || 0,
          y: Number(player.y) || 0,
          faction: player.faction || 'unknown',
        }));

      applyRemotePlayers(state, remotes);
      updateHud();
    },
  });
}

boot().catch((error) => {
  setError(`Game boot failed: ${String(error?.message || error)}`);
});
