import { BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP } from '../../shared/block-topia/constants.js';

let room = null;
let client = null;
let _reconnectOptions = null;
let _reconnecting = false;
let _isConnecting = false;
let _cityUnavailable = false;
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

      onStatus?.({ ws: 'connected', joined: true, error: '', roomId: room.name || roomId, sessionId: room.sessionId || '' });
      onFeed?.(`Connected to ${room.name || roomId}`);

      const capturedRoomRef = room;
      const joinedRoomName = room.name || roomId;
      room.onLeave((code) => {
        if (room === capturedRoomRef) room = null;
        onStatus?.({ ws: 'disconnected', joined: false, error: `Disconnected (code: ${code})`, roomId: joinedRoomName });
        onFeed?.(`Multiplayer connection lost (code: ${code})`);
        _scheduleReconnect();
      });

      room.onStateChange((state) => {
        onPlayers?.(toPlayerList(state.players));
        onNpcs?.(toNpcList(state.npcs));
        onWorld?.({
          mode: String(state.worldMode || ''),
          phase: String(state.worldPhase || ''),
          phaseStartedAt: Math.max(0, Number(state.phaseStartedAt) || 0),
          phaseEndsAt: Math.max(0, Number(state.phaseEndsAt) || 0),
          eventLevel: Math.max(1, Number(state.eventLevel) || 1),
          eventObjective: String(state.eventObjective || ''),
          roomRunStartedAt: Math.max(0, Number(state.roomRunStartedAt) || 0),
        });
      });

      room.onMessage('system', (message) => {
        if (message?.mode || message?.phase || message?.phaseEndsAt || message?.eventLevel || message?.eventObjective) {
          onWorld?.({
            mode: message?.mode ? String(message.mode) : '',
            phase: message?.phase ? String(message.phase) : '',
            phaseEndsAt: Math.max(0, Number(message?.phaseEndsAt) || 0),
            eventLevel: Math.max(1, Number(message?.eventLevel) || 1),
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
    warnClosedRoom('move');
    return false;
  }
  room.send('move', { x, y });
  return true;
}

export function sendAttack() {
  if (!isRoomOpen()) {
    warnClosedRoom('attack');
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

export async function reconnectMultiplayer() {
  if (!_reconnectOptions) return null;
  if (isRoomOpen()) return null;
  if (_isConnecting) return null;
  _isConnecting = true;
  try {
    return await connectMultiplayer(_reconnectOptions);
  } finally {
    _isConnecting = false;
  }
}
