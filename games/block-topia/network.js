import { BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP } from '../../shared/block-topia/constants.js';

let room = null;

function exposeBlockTopiaRoom(activeRoom) {
  if (!activeRoom || typeof window === "undefined") return;

  window.__BLOCK_TOPIA_ROOM__ = activeRoom;
  window.room = activeRoom;

  if (activeRoom.__npcBrainHandlersAttached) return;
  activeRoom.__npcBrainHandlersAttached = true;

  if (typeof activeRoom.onMessage === "function") {
    activeRoom.onMessage("npcReply", (data) => {
      console.log("[BlockTopia NPC reply]", data);
      window.dispatchEvent(new CustomEvent("blocktopia:npcReply", { detail: data }));
    });

    activeRoom.onMessage("npcSignal", (data) => {
      console.log("[BlockTopia NPC signal]", data);
      window.dispatchEvent(new CustomEvent("blocktopia:npcSignal", { detail: data }));
    });
  }
}

let client = null;
let _reconnectOptions = null;
let _reconnecting = false;
let _isConnecting = false;
let _cityUnavailable = false;
let _preStartDisconnectCount = 0;
let _lastWorldEventLevel = 1;
let _reconnectionToken = null;
let _colyseusEndpoint = null;
const CLOSED_ROOM_WARN_THROTTLE_MS = 3000;
const _closedRoomWarnAt = {};
const MAX_RETRIES = 3;
const ERR_ROOM_NOT_FOUND = 4211;
const ERR_ROOM_FULL = 4213;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRoomFullError(error) {
  return error?.code === ERR_ROOM_FULL || /full|max.?client/i.test(String(error?.message || ''));
}

function isRoomNotFoundError(error) {
  return error?.code === ERR_ROOM_NOT_FOUND || /no rooms found|not.?found|cannot find/i.test(String(error?.message || ''));
}

function getEntryGateReason(error) {
  const message = String(error?.message || '').trim();
  if (message === 'telegram_required' || message === 'xp_required' || message === 'auth_invalid' || message === 'progression_unavailable') {
    return message;
  }
  return null;
}

function toEntryGateMessage(reason) {
  if (reason === 'telegram_required') return 'Link Telegram to enter Block Topia multiplayer.';
  if (reason === 'xp_required') return `You need ${BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP} XP to enter Block Topia multiplayer. Play arcade games and sync Telegram to earn XP.`;
  if (reason === 'auth_invalid') return 'Unable to verify multiplayer access right now. Please relink Telegram and try again.';
  if (reason === 'progression_unavailable') return 'Unable to verify multiplayer access right now. Please try again.';
  return 'Multiplayer access blocked.';
}

async function joinCityOnly(colyseusClient, roomId, options) {
  try {
    return await colyseusClient.join(roomId, options);
  } catch (joinError) {
    if (isRoomNotFoundError(joinError)) {
      const err = new Error('Live city unavailable - server room not bootstrapped');
      err.code = ERR_ROOM_NOT_FOUND;
      err.isCityUnavailable = true;
      throw err;
    }
    throw joinError;
  }
}

function toPlayerList(playersState) {
  const list = [];
  if (!playersState) return list;

  const pushPlayer = (player, idFallback) => {
    list.push({
      id: player?.id || String(idFallback),
      sessionId: player?.id || String(idFallback),
      x: Number(player?.x) || 0,
      y: Number(player?.y) || 0,
      name: String(player?.name || ''),
      faction: String(player?.faction || ''),
      district: String(player?.district || ''),
      hp: Math.max(0, Number(player?.hp) || 0),
      kills: Math.max(0, Number(player?.kills) || 0),
      downs: Math.max(0, Number(player?.downs) || 0),
      respawnAt: Math.max(0, Number(player?.respawnAt) || 0),
      ready: player?.ready === true,
      maxHp: Math.max(1, Number(player?.maxHp) || 100),
      attackDamage: Math.max(1, Number(player?.attackDamage) || 20),
      attackCooldownMs: Math.max(100, Number(player?.attackCooldownMs) || 750),
      armorPct: Math.max(0, Math.min(1, Number(player?.armorPct) || 0)),
      runLevel: Math.max(1, Number(player?.runLevel) || 1),
      upgrades: parseJsonArray(player?.upgradesJson),
      upgradeChoices: parseJsonArray(player?.upgradeChoicesJson),
      upgradeChoicesMeta: parseJsonObjectArray(player?.upgradeChoicesMetaJson),
      upgradeState: String(player?.upgradeState || ''),
      objectiveProgress: Math.max(0, Number(player?.objectiveProgress) || 0),
    });
  };

  if (typeof playersState.toArray === 'function') {
    playersState.toArray().forEach((player, index) => pushPlayer(player, index));
    return list;
  }

  if (typeof playersState.length === 'number' && playersState.length >= 0) {
    for (let i = 0; i < playersState.length; i += 1) {
      pushPlayer(playersState[i], i);
    }
    return list;
  }

  if (typeof playersState.forEach === 'function') {
    playersState.forEach((player, id) => pushPlayer(player, id));
    return list;
  }

  Object.entries(playersState).forEach(([id, player]) => pushPlayer(player, id));
  return list;
}

function toNpcList(npcsState) {
  const list = [];
  if (!npcsState) return list;

  const pushNpc = (npc, idFallback) => {
    list.push({
      id: String(npc?.id || `npc_${idFallback}`),
      x: Number(npc?.x) || 0,
      y: Number(npc?.y) || 0,
      hp: Math.max(0, Number(npc?.hp) || 0),
      maxHp: Math.max(1, Number(npc?.maxHp ?? npc?.hpMax) || 40),
      kind: String(npc?.kind || 'drone'),
      targetSessionId: String(npc?.targetSessionId || ''),
    });
  };

  if (typeof npcsState.toArray === 'function') {
    npcsState.toArray().forEach((npc, index) => pushNpc(npc, index));
    return list;
  }

  if (typeof npcsState.length === 'number' && npcsState.length >= 0) {
    for (let i = 0; i < npcsState.length; i += 1) {
      pushNpc(npcsState[i], i);
    }
    return list;
  }

  if (typeof npcsState.forEach === 'function') {
    npcsState.forEach((npc, id) => pushNpc(npc, id));
    return list;
  }

  Object.entries(npcsState).forEach(([id, npc]) => pushNpc(npc, id));
  return list;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || ''));
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry || '')) : [];
  } catch {
    return [];
  }
}

function parseJsonObjectArray(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry && typeof entry === 'object');
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === 'object') : [];
  } catch {
    return [];
  }
}

export async function connectMultiplayer({
  playerName,
  roomId = 'city',
  telegramAuth = null,
  onStatus,
  onPlayers,
  onNpcs,
  onWorld,
  onFeed,
}) {
  _reconnectOptions = { playerName, roomId, telegramAuth, onStatus, onPlayers, onNpcs, onWorld, onFeed };
  _lastWorldEventLevel = 1;

  const rawEndpoint = window.BLOCK_TOPIA_SERVER || 'wss://game.cryptomoonboys.com';
  const endpoint = rawEndpoint.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
  let lastError = null;
  _cityUnavailable = false;

  if (!window.Colyseus) {
    onStatus?.({ ws: 'failed', joined: false, error: 'Colyseus not loaded', roomId });
    return null;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      onStatus?.({ ws: 'connecting', joined: false, error: '', roomId });
      client = new window.Colyseus.Client(endpoint);
      room = await joinCityOnly(client, roomId, { name: playerName, telegram_auth: telegramAuth });
    exposeBlockTopiaRoom(room);

      _reconnectionToken = room.reconnectionToken || null;
      _colyseusEndpoint = endpoint;

      onStatus?.({ ws: 'connected', joined: true, error: '', roomId: room.name || roomId, sessionId: room.sessionId || '' });
      onFeed?.(`Connected to ${room.name || roomId}`);

      const capturedRoomRef = room;
      const joinedRoomName = room.name || roomId;
      room.onLeave((code) => {
        if (room === capturedRoomRef) room = null;
        onStatus?.({ ws: 'disconnected', joined: false, error: `Disconnected (code: ${code})`, roomId: joinedRoomName });
        onFeed?.(`Multiplayer connection lost (code: ${code})`);
        _preStartDisconnectCount += 1;
        if (_preStartDisconnectCount <= 1) _scheduleReconnect();
      });

      room.onStateChange((state) => {
        const playerList = toPlayerList(state?.players);
        const me = playerList.find((entry) => String(entry?.id || '') === String(room?.sessionId || ''));
        if (me?.ready === true) _preStartDisconnectCount = 0;
        const nextEventLevel = Number(state.eventLevel);
        if (Number.isFinite(nextEventLevel) && nextEventLevel >= 1) {
          _lastWorldEventLevel = Math.max(1, Math.floor(nextEventLevel));
        }
        onPlayers?.(toPlayerList(state.players));
        onNpcs?.(toNpcList(state.npcs));
        onWorld?.({
          mode: String(state.worldMode || ''),
          phase: String(state.worldPhase || ''),
          phaseStartedAt: Math.max(0, Number(state.phaseStartedAt) || 0),
          phaseEndsAt: Math.max(0, Number(state.phaseEndsAt) || 0),
          eventLevel: _lastWorldEventLevel,
          eventObjective: String(state.eventObjective || ''),
          roomRunStartedAt: Math.max(0, Number(state.roomRunStartedAt) || 0),
          objectiveType: String(state.eventObjectiveType || ''),
          objectiveTarget: Math.max(0, Number(state.objectiveTarget) || 0),
          objectiveProgress: Math.max(0, Number(state.objectiveProgress) || 0),
          extractionX: Math.max(0, Number(state.extractionX) || 0),
          extractionY: Math.max(0, Number(state.extractionY) || 0),
          hackX: Math.max(0, Number(state.hackX) || 0),
          hackY: Math.max(0, Number(state.hackY) || 0),
          hackProgressTarget: Math.max(0, Number(state.hackProgressTarget) || 0),
          runStartedAt: Math.max(0, Number(state.runStartedAt) || 0),
        });
      });

      room.onMessage('system', (message) => {
        const messageEventLevel = Number(message?.eventLevel);
        const hasEventLevel = Number.isFinite(messageEventLevel) && messageEventLevel >= 1;
        if (hasEventLevel) _lastWorldEventLevel = Math.max(1, Math.floor(messageEventLevel));
        if (message?.mode || message?.phase || message?.phaseEndsAt || message?.eventLevel || message?.eventObjective) {
          onWorld?.({
            mode: message?.mode ? String(message.mode) : '',
            phase: message?.phase ? String(message.phase) : '',
            phaseEndsAt: Math.max(0, Number(message?.phaseEndsAt) || 0),
            eventLevel: _lastWorldEventLevel,
            eventObjective: String(message?.eventObjective || ''),
          });
        }
        onFeed?.(`System: ${message?.message || 'System update'}`);
      });

      return room;
    } catch (error) {
      lastError = error;
      const gateReason = getEntryGateReason(error);
      if (gateReason) {
        const gateMessage = toEntryGateMessage(gateReason);
        onStatus?.({ ws: 'blocked', joined: false, error: gateMessage, roomId, reason: gateReason });
        onFeed?.(gateMessage);
        return null;
      }
      const roomFull = isRoomFullError(error);
      const cityUnavailable = error?.isCityUnavailable === true;
      const wsState = roomFull ? 'room-full' : cityUnavailable ? 'unavailable' : 'failed';
      onStatus?.({ ws: wsState, joined: false, error: String(error?.message || error), roomId, roomFull });
      if (roomFull) {
        onFeed?.('Block Topia is full (2 players). Try again later.');
        return null;
      }
      if (cityUnavailable) {
        _cityUnavailable = true;
        onFeed?.('Live city unavailable - server room not bootstrapped.');
        return null;
      }
      if (attempt < MAX_RETRIES) await wait(2500);
    }
  }

  onFeed?.(`Multiplayer unavailable: ${String(lastError?.message || lastError || 'unknown error')}`);
  onStatus?.({ ws: 'disconnected', joined: false, error: String(lastError?.message || lastError || 'unknown error'), roomId });
  return null;
}

function isRoomOpen() {
  if (!room || !room.sessionId) return false;
  const conn = room.connection;
  if (!conn) return false;
  const wsCandidates = [conn.ws, conn.transport?.ws, conn.transport?.socket, conn.socket, conn.websocket, conn];
  const ws = wsCandidates.find((candidate) => candidate && typeof candidate === 'object' && typeof candidate.readyState === 'number');
  if (!ws) return false;
  const OPEN = (typeof WebSocket !== 'undefined' && WebSocket.OPEN) || 1;
  return ws.readyState === OPEN;
}

export function isConnected() {
  return isRoomOpen();
}

function warnClosedRoom(msgType) {
  const now = Date.now();
  if (!_closedRoomWarnAt[msgType] || now - _closedRoomWarnAt[msgType] >= CLOSED_ROOM_WARN_THROTTLE_MS) {
    console.warn('[BlockTopia] skipped send on closed room:', msgType);
    _closedRoomWarnAt[msgType] = now;
  }
}

export function sendMovement(x, y) {
  if (!isRoomOpen()) {
    warnClosedRoom('move-prestart');
    return false;
  }
  room.send('move', { x, y });
  return true;
}

export function sendAttack() {
  if (!isRoomOpen()) {
    warnClosedRoom('attack-prestart');
    return false;
  }
  room.send('attack', {});
  return true;
}

export function sendExtract() {
  if (!isRoomOpen()) {
    warnClosedRoom('extract');
    return false;
  }
  room.send('extract', {});
  return true;
}

export function sendReady() {
  if (!isRoomOpen()) {
    warnClosedRoom('ready');
    return false;
  }
  room.send('ready', {});
  return true;
}

export function sendRestartRun() {
  if (!isRoomOpen()) {
    warnClosedRoom('restartRun');
    return false;
  }
  room.send('restartRun', {});
  return true;
}

export function sendChooseUpgrade(upgradeId) {
  if (!isRoomOpen()) {
    warnClosedRoom('chooseUpgrade');
    return false;
  }
  room.send('chooseUpgrade', { upgradeId: String(upgradeId || '') });
  return true;
}

export function getRoom() {
  return room;
}

function _scheduleReconnect() {
  if (_reconnecting || !_reconnectOptions) return;
  if (_cityUnavailable) return;
  _reconnecting = true;
  setTimeout(() => {
    reconnectMultiplayer().finally(() => {
      _reconnecting = false;
    });
  }, 2500);
}

async function _tryWarmReconnect() {
  if (!_reconnectionToken || !_colyseusEndpoint || !window.Colyseus) return null;
  try {
    const { onStatus, onPlayers, onNpcs, onWorld, onFeed, roomId } = _reconnectOptions;
    const warmClient = new window.Colyseus.Client(_colyseusEndpoint);
    const reconRoom = await warmClient.reconnect(_reconnectionToken);
    client = warmClient;
    room = reconRoom;
    exposeBlockTopiaRoom(room);
    _reconnectionToken = reconRoom.reconnectionToken || null;

    const capturedRef = room;
    const joinedRoomName = room.name || roomId;

    room.onLeave((code) => {
      if (room === capturedRef) room = null;
      onStatus?.({ ws: 'disconnected', joined: false, error: `Disconnected (code: ${code})`, roomId: joinedRoomName });
      onFeed?.(`Multiplayer connection lost (code: ${code})`);
      _preStartDisconnectCount += 1;
      if (_preStartDisconnectCount <= 1) _scheduleReconnect();
    });

    room.onStateChange((state) => {
      const playerList = toPlayerList(state?.players);
      const me = playerList.find((entry) => String(entry?.id || '') === String(room?.sessionId || ''));
      if (me?.ready === true) _preStartDisconnectCount = 0;
      const nextEventLevel = Number(state.eventLevel);
      if (Number.isFinite(nextEventLevel) && nextEventLevel >= 1) {
        _lastWorldEventLevel = Math.max(1, Math.floor(nextEventLevel));
      }
      onPlayers?.(toPlayerList(state.players));
      onNpcs?.(toNpcList(state.npcs));
      onWorld?.({
        mode: String(state.worldMode || ''),
        phase: String(state.worldPhase || ''),
        phaseStartedAt: Math.max(0, Number(state.phaseStartedAt) || 0),
        phaseEndsAt: Math.max(0, Number(state.phaseEndsAt) || 0),
        eventLevel: _lastWorldEventLevel,
        eventObjective: String(state.eventObjective || ''),
        roomRunStartedAt: Math.max(0, Number(state.roomRunStartedAt) || 0),
        objectiveType: String(state.eventObjectiveType || ''),
        objectiveTarget: Math.max(0, Number(state.objectiveTarget) || 0),
        objectiveProgress: Math.max(0, Number(state.objectiveProgress) || 0),
        extractionX: Math.max(0, Number(state.extractionX) || 0),
        extractionY: Math.max(0, Number(state.extractionY) || 0),
        hackX: Math.max(0, Number(state.hackX) || 0),
        hackY: Math.max(0, Number(state.hackY) || 0),
        hackProgressTarget: Math.max(0, Number(state.hackProgressTarget) || 0),
        runStartedAt: Math.max(0, Number(state.runStartedAt) || 0),
      });
    });

    room.onMessage('system', (message) => {
      const messageEventLevel = Number(message?.eventLevel);
      const hasEventLevel = Number.isFinite(messageEventLevel) && messageEventLevel >= 1;
      if (hasEventLevel) _lastWorldEventLevel = Math.max(1, Math.floor(messageEventLevel));
      if (message?.mode || message?.phase || message?.phaseEndsAt || message?.eventLevel || message?.eventObjective) {
        onWorld?.({
          mode: message?.mode ? String(message.mode) : '',
          phase: message?.phase ? String(message.phase) : '',
          phaseEndsAt: Math.max(0, Number(message?.phaseEndsAt) || 0),
          eventLevel: _lastWorldEventLevel,
          eventObjective: String(message?.eventObjective || ''),
        });
      }
      onFeed?.(`System: ${message?.message || 'System update'}`);
    });

    onStatus?.({ ws: 'connected', joined: true, error: '', roomId: joinedRoomName, sessionId: room.sessionId || '' });
    onFeed?.(`Reconnected to ${joinedRoomName}`);
    _preStartDisconnectCount = 0;
    return room;
  } catch {
    _reconnectionToken = null;
    return null;
  }
}

export async function reconnectMultiplayer() {
  if (!_reconnectOptions) return null;
  if (isRoomOpen()) return null;
  if (_isConnecting) return null;
  _isConnecting = true;
  try {
    const warm = await _tryWarmReconnect();
    if (warm) return warm;
    return await connectMultiplayer(_reconnectOptions);
  } finally {
    _isConnecting = false;
  }
}

/**
 * Temporary NPC brain test helper.
 * Use in browser console after joining Block Topia:
 *   window.testNpcChat("who are you?", "signal_rick")
 */
window.testNpcChat = function testNpcChat(message = "who are you?", npcId = "signal_rick") {
  try {
    const room = window.__BLOCK_TOPIA_ROOM__ || window.room || window.currentRoom;
    if (!room || typeof room.send !== "function") {
      console.warn("[BlockTopia NPC] No Colyseus room found on window.");
      return false;
    }

    room.send("npcChat", { npcId, message });
    console.log("[BlockTopia NPC] sent npcChat", { npcId, message });
    return true;
  } catch (error) {
    console.error("[BlockTopia NPC] failed to send npcChat", error);
    return false;
  }
};

/**
 * Temporary in-game NPC chat UI.
 * Uses the existing server-side npcChat bridge.
 */
(function installBlockTopiaNpcChatUi() {
  if (typeof window === "undefined") return;
  if (window.__BLOCK_TOPIA_NPC_CHAT_UI__) return;
  window.__BLOCK_TOPIA_NPC_CHAT_UI__ = true;

  function createUi() {
    if (document.getElementById("btNpcChat")) return;

    const box = document.createElement("div");
    box.id = "btNpcChat";
    box.innerHTML = `
      <div class="bt-npc-head">
        <strong>NPC Signal</strong>
        <button type="button" id="btNpcToggle">−</button>
      </div>
      <div id="btNpcBody">
        <select id="btNpcSelect">
          <option value="signal_rick">Signal Rick</option>
          <option value="block_guide">Block Guide</option>
          <option value="xp_keeper">XP Keeper</option>
          <option value="lore_rat">Lore Rat</option>
          <option value="default_npc">Citizen</option>
        </select>
        <div id="btNpcLog"></div>
        <form id="btNpcForm">
          <input id="btNpcInput" maxlength="280" placeholder="Ask the city..." />
          <button type="submit">Send</button>
        </form>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #btNpcChat {
        position: fixed;
        right: 14px;
        top: 210px;
        bottom: auto;
        width: min(340px, calc(100vw - 28px));
        z-index: 99999;
        color: #dff7ff;
        background: rgba(5, 10, 24, 0.92);
        border: 1px solid rgba(90, 220, 255, 0.45);
        border-radius: 14px;
        box-shadow: 0 0 24px rgba(0, 200, 255, 0.18);
        font: 13px/1.35 system-ui, sans-serif;
        overflow: hidden;
      }
      #btNpcChat .bt-npc-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 9px 10px;
        background: rgba(0, 220, 255, 0.12);
        border-bottom: 1px solid rgba(90, 220, 255, 0.25);
      }
      #btNpcToggle {
        background: transparent;
        color: #dff7ff;
        border: 1px solid rgba(90, 220, 255, 0.45);
        border-radius: 8px;
        cursor: pointer;
      }
      #btNpcBody { padding: 10px; }
      #btNpcSelect, #btNpcInput, #btNpcForm button {
        background: rgba(8, 16, 34, 0.95);
        color: #dff7ff;
        border: 1px solid rgba(90, 220, 255, 0.4);
        border-radius: 10px;
        padding: 8px;
      }
      #btNpcSelect {
        width: 100%;
        margin-bottom: 8px;
      }
      #btNpcLog {
        max-height: 140px;
        overflow: auto;
        margin-bottom: 8px;
        padding: 8px;
        background: rgba(0, 0, 0, 0.22);
        border-radius: 10px;
      }
      .bt-npc-msg {
        margin: 0 0 8px;
      }
      .bt-npc-msg b {
        color: #ffe66d;
      }
      .bt-npc-user {
        color: #9fe7ff;
      }
      #btNpcForm {
        display: flex;
        gap: 6px;
      }
      #btNpcInput {
        flex: 1;
        min-width: 0;
      }
      #btNpcForm button {
        cursor: pointer;
        color: #07101f;
        background: #ffe600;
        border-color: #ffe600;
        font-weight: 700;
      }
      #btNpcChat.collapsed #btNpcBody {
        display: none;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(box);

    const log = document.getElementById("btNpcLog");
    const form = document.getElementById("btNpcForm");
    const input = document.getElementById("btNpcInput");
    const select = document.getElementById("btNpcSelect");
    const toggle = document.getElementById("btNpcToggle");

    function addLine(html) {
      const row = document.createElement("div");
      row.className = "bt-npc-msg";
      row.innerHTML = html;
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
    }

    toggle.addEventListener("click", () => {
      box.classList.toggle("collapsed");
      toggle.textContent = box.classList.contains("collapsed") ? "+" : "−";
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const message = input.value.trim();
      const npcId = select.value;
      if (!message) return;

      addLine(`<span class="bt-npc-user">You:</span> ${message.replace(/[<>&]/g, "")}`);
      input.value = "";

      if (typeof window.testNpcChat !== "function") {
        addLine(`<b>System:</b> NPC bridge is not ready yet.`);
        return;
      }

      window.testNpcChat(message, npcId);
    });

    window.addEventListener("blocktopia:npcReply", (event) => {
      const data = event.detail || {};
      addLine(`<b>${data.npc || "NPC"}:</b> ${(data.reply || "No signal.").replace(/[<>&]/g, "")}`);
    });

    addLine(`<b>System:</b> NPC signal ready.`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createUi);
  } else {
    createUi();
  }
})();
