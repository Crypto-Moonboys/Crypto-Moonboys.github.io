/** @typedef {{ id:number, x:number, y:number, owner:0|1|2, pressure:number, terrain:"road"|"grass"|"block", moveCost:number, neighbors:number[], lockedBy?:null|1|2 }} Tile */
/** @typedef {{ id:string, ownerId:1|2, type:"seeder"|"breaker"|"anchor", tileId:number, targetTileId:number|null, hp:number, speed:number, state:"idle"|"moving"|"working", moveProgress:number, lastPulseTick:number }} NPC */
/** @typedef {{ id:1|2, hp:number, npcs:string[] }} Player */
/** @typedef {{ p1ControlledTiles:number, p2ControlledTiles:number, neutralTiles:number, p1PressureTotal:number, p2PressureTotal:number }} ControlScore */
/** @typedef {{ tiles:Record<number, Tile>, npcs:Record<string, NPC>, players:Record<1|2, Player>, tick:number, winner:null|1|2, matchState:"waiting"|"countdown"|"running"|"ended", readyPlayers:Record<1|2, boolean>, countdownTicks:number, runningTicks:number, controlScore:ControlScore }} GameState */
/** @typedef {{ t:number, type:"move"|"pulse"|"ready", playerId:1|2, npcId?:string, targetTileId?:number }} Command */

const GRID_SIZE = 20;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const TICK_MS = 100;
const INPUT_DELAY = 3;
const MAX_PRESSURE = 100;
const MIN_PRESSURE = -100;
const STARTING_HP = 1000;
const DAMAGE_PER_TILE_PER_TICK = 0.08;
const PRESSURE_DECAY = 0.98;
const DOMINANCE_BONUS = 0.3;
const SPAWN_BONUS = 0.2;
const PULSE_STRENGTH = 20;
const PULSE_RADIUS = 2;
const PULSE_COOLDOWN_TICKS = 50;
const COUNTDOWN_TICKS = 30;
const MAX_MATCH_TICKS = 3000;
const MAP_FIT_MARGIN_RATIO = 0.08;
const RUNTIME_PATCH_ID = "pressure-protocol-runtime-fallback-fit-v2";
const SOLO_QUERY_OVERRIDE = new URLSearchParams(window.location.search).get("solo") === "1";
const SOLO_TEST_OVERRIDE = (() => {
  const host = String(window.location.hostname || "").toLowerCase();
  const localhost = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  const forced = SOLO_QUERY_OVERRIDE;
  return localhost || forced;
})();

const PRESSURE_BY_TYPE = {
  seeder: 3.2,
  breaker: 7.2,
  anchor: 4.1,
};

const TERRAIN_GRIP = {
  road: 0.78,
  grass: 1,
  block: 0,
};

if (window.PressureProtocol && typeof window.PressureProtocol.destroy === "function") {
  window.PressureProtocol.destroy();
}

/** @type {HTMLCanvasElement | null} */
let canvas = null;
/** @type {CanvasRenderingContext2D | null} */
let ctx = null;
let tickIntervalId = null;
let animationFrameId = null;
let mounted = false;

let viewWidth = 0;
let viewHeight = 0;
let cameraX = 0;
let cameraY = 120;
let worldOffsetX = 0;
let worldOffsetY = 0;
let worldScale = 1;

let activeCommander = 1;
let selectedSlot = 0;
let debugEnabled = false;

const runtime = {
  commandQueue: /** @type {Command[]} */ ([]),
  seenCommandKeys: new Set(),
  localHashes: /** @type {Record<number, string>} */ ({}),
  remoteHashes: /** @type {Record<number, string>} */ ({}),
  commandSink: /** @type {null | ((command: Command) => void)} */ (null),
  hashSink: /** @type {null | ((payload: {t:number, hash:string}) => void)} */ (null),
  pulseEvents: /** @type {{playerId:1|2, tileId:number, createdTick:number}[]} */ ([]),
  tileEffects: /** @type {Record<number, {lastDeltaTick:number}>} */ ({}),
  remoteTrafficSeen: false,
  soloTestModeActive: false,
};

function shouldUseSoloFallback() {
  return SOLO_TEST_OVERRIDE || !runtime.remoteTrafficSeen;
}

function startSoloCountdown(gameState) {
  if (gameState.matchState !== "waiting") {
    return false;
  }
  gameState.readyPlayers[1] = true;
  gameState.readyPlayers[2] = true;
  gameState.matchState = "countdown";
  gameState.countdownTicks = COUNTDOWN_TICKS;
  runtime.soloTestModeActive = true;
  return true;
}

/** @returns {ControlScore} */
function emptyControlScore() {
  return {
    p1ControlledTiles: 0,
    p2ControlledTiles: 0,
    neutralTiles: 0,
    p1PressureTotal: 0,
    p2PressureTotal: 0,
  };
}

/** @returns {GameState} */
function createGameState() {
  const tiles = /** @type {Record<number, Tile>} */ ({});

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const id = getTileId(x, y);
      const terrain = decideTerrain(x, y);
      const moveCost = terrain === "road" ? 0.5 : terrain === "grass" ? 2 : 999;

      tiles[id] = {
        id,
        x,
        y,
        owner: 0,
        pressure: 0,
        terrain,
        moveCost,
        neighbors: [],
        lockedBy: null,
      };
    }
  }

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const id = getTileId(x, y);
      const tile = tiles[id];
      const maybeNeighbors = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];

      tile.neighbors = maybeNeighbors
        .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < GRID_SIZE && ny < GRID_SIZE)
        .map(([nx, ny]) => getTileId(nx, ny));
    }
  }

  forcePassable(tiles, 1, 1);
  forcePassable(tiles, 2, 1);
  forcePassable(tiles, 1, 2);
  forcePassable(tiles, GRID_SIZE - 2, GRID_SIZE - 2);
  forcePassable(tiles, GRID_SIZE - 3, GRID_SIZE - 2);
  forcePassable(tiles, GRID_SIZE - 2, GRID_SIZE - 3);

  const npcs = /** @type {Record<string, NPC>} */ ({});

  const p1Spawn = [getTileId(1, 1), getTileId(2, 1), getTileId(1, 2)];
  const p2Spawn = [
    getTileId(GRID_SIZE - 2, GRID_SIZE - 2),
    getTileId(GRID_SIZE - 3, GRID_SIZE - 2),
    getTileId(GRID_SIZE - 2, GRID_SIZE - 3),
  ];

  createNPC(npcs, "1-seeder", 1, "seeder", p1Spawn[0], 2.2);
  createNPC(npcs, "1-breaker", 1, "breaker", p1Spawn[1], 1.5);
  createNPC(npcs, "1-anchor", 1, "anchor", p1Spawn[2], 1.2);

  createNPC(npcs, "2-seeder", 2, "seeder", p2Spawn[0], 2.2);
  createNPC(npcs, "2-breaker", 2, "breaker", p2Spawn[1], 1.5);
  createNPC(npcs, "2-anchor", 2, "anchor", p2Spawn[2], 1.2);

  const players = /** @type {Record<1|2, Player>} */ ({
    1: { id: 1, hp: STARTING_HP, npcs: ["1-seeder", "1-breaker", "1-anchor"] },
    2: { id: 2, hp: STARTING_HP, npcs: ["2-seeder", "2-breaker", "2-anchor"] },
  });

  return {
    tiles,
    npcs,
    players,
    tick: 0,
    winner: null,
    matchState: "waiting",
    readyPlayers: { 1: false, 2: false },
    countdownTicks: 0,
    runningTicks: 0,
    controlScore: emptyControlScore(),
  };
}

/** @type {GameState} */
const state = createGameState();
state.controlScore = deriveControlScore(state);

function gameTick(gameState) {
  if (gameState.matchState === "ended") {
    return;
  }

  gameState.tick += 1;
  processCommands(gameState);

  if (gameState.matchState === "countdown") {
    if (gameState.countdownTicks > 0) {
      gameState.countdownTicks -= 1;
    }

    if (gameState.countdownTicks <= 0) {
      gameState.matchState = "running";
      gameState.runningTicks = 0;
    }
  }

  if (gameState.matchState === "running") {
    moveNPCs(gameState);
    applyTilePressure(gameState);
    resolveOwnership(gameState);
    gameState.controlScore = deriveControlScore(gameState);
    applyPlayerDamage(gameState);
    enforceHardClamps(gameState);
    gameState.controlScore = deriveControlScore(gameState);
    gameState.runningTicks += 1;

    if (gameState.runningTicks >= MAX_MATCH_TICKS) {
      resolveWinnerFromTimeout(gameState);
    } else {
      checkWin(gameState);
    }

    if (gameState.matchState !== "ended" && (gameState.winner != null || gameState.players[1].hp <= 0 || gameState.players[2].hp <= 0)) {
      gameState.matchState = "ended";
    }
  } else {
    gameState.controlScore = deriveControlScore(gameState);
  }

  emitAndCheckHash(gameState);
  cleanupEffects(gameState);
}

function processCommands(gameState) {
  if (runtime.commandQueue.length === 0) {
    return;
  }

  const due = runtime.commandQueue
    .filter((c) => c.t === gameState.tick)
    .sort((a, b) => {
      if (a.playerId !== b.playerId) {
        return a.playerId - b.playerId;
      }

      const npcA = a.npcId ?? "";
      const npcB = b.npcId ?? "";
      if (npcA !== npcB) {
        return npcA < npcB ? -1 : 1;
      }

      if (a.type !== b.type) {
        return a.type < b.type ? -1 : 1;
      }

      return (a.targetTileId ?? -1) - (b.targetTileId ?? -1);
    });

  runtime.commandQueue = runtime.commandQueue.filter((c) => c.t > gameState.tick);

  for (const command of due) {
    executeCommand(gameState, command);
  }
}

function executeCommand(gameState, command) {
  if (gameState.matchState === "ended") {
    return;
  }

  if (command.type === "ready") {
    if (gameState.matchState !== "waiting") {
      return;
    }

    gameState.readyPlayers[command.playerId] = true;

    if (gameState.readyPlayers[1] && gameState.readyPlayers[2]) {
      gameState.matchState = "countdown";
      gameState.countdownTicks = COUNTDOWN_TICKS;
    }
    return;
  }

  if (gameState.matchState !== "running") {
    return;
  }

  const npc = command.npcId ? gameState.npcs[command.npcId] : null;
  if (!npc) {
    return;
  }

  if (npc.ownerId !== command.playerId) {
    return;
  }

  if (command.type === "move") {
    const targetTileId = command.targetTileId;
    if (!isValidTargetTile(gameState, targetTileId)) {
      return;
    }

    npc.targetTileId = targetTileId;
    npc.state = npc.tileId === targetTileId ? "working" : "moving";
    return;
  }

  if (command.type === "pulse") {
    if (gameState.tick - npc.lastPulseTick < PULSE_COOLDOWN_TICKS) {
      return;
    }

    npc.lastPulseTick = gameState.tick;
    triggerPulse(gameState, command.playerId, npc.tileId);
  }
}

function moveNPCs(gameState) {
  for (const npc of Object.values(gameState.npcs)) {
    if (npc.hp <= 0) {
      continue;
    }

    if (npc.targetTileId == null || npc.tileId === npc.targetTileId) {
      npc.state = "working";
      continue;
    }

    const currentTile = gameState.tiles[npc.tileId];
    if (!currentTile || currentTile.terrain === "block") {
      npc.state = "idle";
      npc.targetTileId = null;
      npc.moveProgress = 0;
      continue;
    }

    npc.state = "moving";
    npc.moveProgress += npc.speed / currentTile.moveCost;

    if (npc.moveProgress >= 1) {
      const nextTile = greedyStep(gameState, npc.tileId, npc.targetTileId);
      if (!nextTile) {
        npc.targetTileId = null;
        npc.state = "idle";
        npc.moveProgress = 0;
        continue;
      }

      npc.tileId = nextTile.id;
      npc.moveProgress = 0;

      if (npc.targetTileId === npc.tileId) {
        npc.state = "working";
      }
    }
  }
}

function greedyStep(gameState, currentTileId, targetTileId) {
  const current = gameState.tiles[currentTileId];
  const target = gameState.tiles[targetTileId];
  if (!current || !target) {
    return null;
  }

  let bestNeighbor = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestCost = Number.POSITIVE_INFINITY;

  for (const neighborId of current.neighbors) {
    const neighbor = gameState.tiles[neighborId];
    if (!neighbor || neighbor.terrain === "block") {
      continue;
    }

    const distance = Math.abs(neighbor.x - target.x) + Math.abs(neighbor.y - target.y);
    if (
      distance < bestDistance ||
      (distance === bestDistance && neighbor.moveCost < bestCost) ||
      (distance === bestDistance && neighbor.moveCost === bestCost && (!bestNeighbor || neighbor.id < bestNeighbor.id))
    ) {
      bestDistance = distance;
      bestCost = neighbor.moveCost;
      bestNeighbor = neighbor;
    }
  }

  return bestNeighbor ? { id: bestNeighbor.id } : null;
}

function previewGreedyPath(gameState, startTileId, targetTileId, maxSteps) {
  const path = [];
  let current = startTileId;

  for (let i = 0; i < maxSteps; i += 1) {
    if (current === targetTileId) {
      break;
    }

    const next = greedyStep(gameState, current, targetTileId);
    if (!next) {
      break;
    }

    path.push(next.id);
    current = next.id;
  }

  return path;
}

function applyTilePressure(gameState) {
  const tileAgentCounts = /** @type {Record<number, {p1:number,p2:number}>} */ ({});

  for (const tile of Object.values(gameState.tiles)) {
    tile.pressure *= PRESSURE_DECAY;
    tile.lockedBy = null;
    tileAgentCounts[tile.id] = { p1: 0, p2: 0 };
  }

  for (const npc of Object.values(gameState.npcs)) {
    if (npc.hp <= 0) {
      continue;
    }

    const tile = gameState.tiles[npc.tileId];
    if (!tile || tile.terrain === "block") {
      continue;
    }

    if (npc.ownerId === 1) {
      tileAgentCounts[tile.id].p1 += 1;
    } else {
      tileAgentCounts[tile.id].p2 += 1;
    }

    if (npc.type === "anchor") {
      tile.lockedBy = npc.ownerId;
    }
  }

  for (const npc of Object.values(gameState.npcs)) {
    const tile = gameState.tiles[npc.tileId];
    if (!tile || tile.terrain === "block" || npc.hp <= 0) {
      continue;
    }

    const signed = npc.ownerId === 1 ? 1 : -1;
    let pressureChange = PRESSURE_BY_TYPE[npc.type] * TERRAIN_GRIP[tile.terrain] * (npc.type === "anchor" && tile.owner === npc.ownerId ? 1.4 : 1) * signed;

    if (tile.lockedBy && tile.lockedBy !== npc.ownerId) {
      pressureChange *= 0.3;
    }

    if (isNearSpawn(tile, npc.ownerId)) {
      pressureChange += signed * SPAWN_BONUS;
    }

    if (isNearSpawn(tile, opponentOf(npc.ownerId))) {
      pressureChange *= 0.85;
    }

    tile.pressure += pressureChange;
    markTileActivity(tile.id, pressureChange, gameState.tick);
  }

  for (const tile of Object.values(gameState.tiles)) {
    if (tile.terrain === "block") {
      continue;
    }

    const counts = tileAgentCounts[tile.id];

    if (counts.p1 > 0 && counts.p2 === 0) {
      tile.pressure += DOMINANCE_BONUS;
      markTileActivity(tile.id, DOMINANCE_BONUS, gameState.tick);
    }

    if (counts.p2 > 0 && counts.p1 === 0) {
      tile.pressure -= DOMINANCE_BONUS;
      markTileActivity(tile.id, -DOMINANCE_BONUS, gameState.tick);
    }

    if (isNearSpawn(tile, 1)) {
      tile.pressure += SPAWN_BONUS;
      if (counts.p2 > 0) {
        tile.pressure += 0.14;
      }
    }

    if (isNearSpawn(tile, 2)) {
      tile.pressure -= SPAWN_BONUS;
      if (counts.p1 > 0) {
        tile.pressure -= 0.14;
      }
    }
  }
}

function resolveOwnership(gameState) {
  for (const tile of Object.values(gameState.tiles)) {
    if (tile.terrain === "block") {
      tile.owner = 0;
      continue;
    }

    if (tile.pressure >= 50) {
      tile.owner = 1;
    } else if (tile.pressure <= -50) {
      tile.owner = 2;
    } else {
      tile.owner = 0;
    }
  }
}

function applyPlayerDamage(gameState) {
  gameState.players[2].hp -= gameState.controlScore.p1ControlledTiles * DAMAGE_PER_TILE_PER_TICK;
  gameState.players[1].hp -= gameState.controlScore.p2ControlledTiles * DAMAGE_PER_TILE_PER_TICK;
}

function deriveControlScore(gameState) {
  const score = emptyControlScore();

  for (const tile of Object.values(gameState.tiles)) {
    if (tile.terrain === "block") {
      continue;
    }

    if (tile.owner === 1) {
      score.p1ControlledTiles += 1;
    } else if (tile.owner === 2) {
      score.p2ControlledTiles += 1;
    } else {
      score.neutralTiles += 1;
    }

    if (tile.pressure > 0) {
      score.p1PressureTotal += tile.pressure;
    } else if (tile.pressure < 0) {
      score.p2PressureTotal += -tile.pressure;
    }
  }

  return score;
}

function resolveWinnerFromTimeout(gameState) {
  const score = gameState.controlScore;

  if (score.p1ControlledTiles > score.p2ControlledTiles) {
    gameState.winner = 1;
  } else if (score.p2ControlledTiles > score.p1ControlledTiles) {
    gameState.winner = 2;
  } else if (score.p1PressureTotal > score.p2PressureTotal) {
    gameState.winner = 1;
  } else if (score.p2PressureTotal > score.p1PressureTotal) {
    gameState.winner = 2;
  } else {
    gameState.winner = null;
  }

  gameState.matchState = "ended";
}

function enforceHardClamps(gameState) {
  for (const tile of Object.values(gameState.tiles)) {
    tile.pressure = clamp(tile.pressure, MIN_PRESSURE, MAX_PRESSURE);
  }

  gameState.players[1].hp = Math.max(0, gameState.players[1].hp);
  gameState.players[2].hp = Math.max(0, gameState.players[2].hp);
}

function checkWin(gameState) {
  if (gameState.winner != null) {
    return;
  }

  const hp1 = gameState.players[1].hp;
  const hp2 = gameState.players[2].hp;

  if (hp1 > 0 && hp2 > 0) {
    return;
  }

  if (hp1 <= 0 && hp2 <= 0) {
    if (gameState.controlScore.p1ControlledTiles > gameState.controlScore.p2ControlledTiles) {
      gameState.winner = 1;
    } else if (gameState.controlScore.p2ControlledTiles > gameState.controlScore.p1ControlledTiles) {
      gameState.winner = 2;
    } else {
      gameState.winner = null;
    }
  } else {
    gameState.winner = hp1 > 0 ? 1 : 2;
  }
}

function emitAndCheckHash(gameState) {
  if (gameState.tick % 20 !== 0) {
    return;
  }

  const hash = hashState(gameState);
  runtime.localHashes[gameState.tick] = hash;

  if (runtime.hashSink) {
    runtime.hashSink({ t: gameState.tick, hash });
  }

  const remote = runtime.remoteHashes[gameState.tick];
  if (remote && remote !== hash) {
    console.error(`DESYNC at tick ${gameState.tick}: local=${hash}, remote=${remote}`);
  }
}

function triggerPulse(gameState, playerId, originTileId) {
  const origin = gameState.tiles[originTileId];
  if (!origin) {
    return;
  }

  const signed = playerId === 1 ? 1 : -1;

  for (const tile of Object.values(gameState.tiles)) {
    if (tile.terrain === "block") {
      continue;
    }

    const distance = Math.abs(tile.x - origin.x) + Math.abs(tile.y - origin.y);
    if (distance > PULSE_RADIUS) {
      continue;
    }

    const falloff = 1 - distance / (PULSE_RADIUS + 1);
    const change = signed * PULSE_STRENGTH * falloff;
    tile.pressure += change;
    markTileActivity(tile.id, change, gameState.tick);
  }

  runtime.pulseEvents.push({ playerId, tileId: originTileId, createdTick: gameState.tick });
}

function cleanupEffects(gameState) {
  runtime.pulseEvents = runtime.pulseEvents.filter((event) => gameState.tick - event.createdTick < 20);
}

function controlPercent(playerId) {
  const score = state.controlScore;
  const total = score.p1ControlledTiles + score.p2ControlledTiles + score.neutralTiles;
  if (total === 0) {
    return 0;
  }

  return Math.round(((playerId === 1 ? score.p1ControlledTiles : score.p2ControlledTiles) / total) * 100);
}

function createLocalCommand(type, playerId, npcId, targetTileId) {
  return /** @type {Command} */ ({
    t: state.tick + INPUT_DELAY,
    type,
    playerId,
    npcId,
    targetTileId,
  });
}

function queueCommand(command, shouldBroadcast) {
  if (!isCommandShapeValid(command)) {
    return;
  }

  if (command.t <= state.tick) {
    return;
  }

  const key = commandKey(command);
  if (runtime.seenCommandKeys.has(key)) {
    return;
  }

  runtime.seenCommandKeys.add(key);
  runtime.commandQueue.push(command);

  if (shouldBroadcast && runtime.commandSink) {
    runtime.commandSink(command);
  }
}

function issueMove(playerId, slot, targetTileId) {
  if (state.matchState !== "running") {
    return;
  }

  const player = state.players[playerId];
  const npcId = player.npcs[slot];
  if (!npcId || !isValidTargetTile(state, targetTileId)) {
    return;
  }

  const command = createLocalCommand("move", playerId, npcId, targetTileId);
  queueCommand(command, true);
}

function issuePulse(playerId, slot) {
  if (state.matchState !== "running") {
    return;
  }

  const player = state.players[playerId];
  const npcId = player.npcs[slot];
  if (!npcId) {
    return;
  }

  const command = createLocalCommand("pulse", playerId, npcId);
  queueCommand(command, true);
}

function issueReady(playerId) {
  if (state.matchState !== "waiting") {
    return;
  }

  const command = createLocalCommand("ready", playerId);
  queueCommand(command, true);
}

function receiveRemoteCommand(command) {
  runtime.remoteTrafficSeen = true;
  queueCommand(command, false);
}

function receiveRemoteHash(payload) {
  runtime.remoteTrafficSeen = true;
  runtime.remoteHashes[payload.t] = payload.hash;

  const local = runtime.localHashes[payload.t];
  if (local && local !== payload.hash) {
    console.error(`DESYNC at tick ${payload.t}: local=${local}, remote=${payload.hash}`);
  }
}

function onKeyDown(event) {
  if (event.key === "d" || event.key === "D") {
    debugEnabled = !debugEnabled;
    return;
  }

  if (event.key === "r" || event.key === "R") {
    if (state.matchState === "waiting" && shouldUseSoloFallback()) {
      startSoloCountdown(state);
      return;
    }
    issueReady(/** @type {1|2} */ (activeCommander));
    return;
  }

  if (state.matchState === "ended") {
    return;
  }

  if (event.key === "Tab") {
    event.preventDefault();
    activeCommander = activeCommander === 1 ? 2 : 1;
    return;
  }

  if (event.key === " ") {
    event.preventDefault();
    issuePulse(/** @type {1|2} */ (activeCommander), selectedSlot);
    return;
  }

  if (event.key === "1" || event.key === "2" || event.key === "3") {
    selectedSlot = Number(event.key) - 1;
  }
}

function onPointerDown(event) {
  if (!canvas || state.matchState !== "running") {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;

  const tileId = pickTile(px, py);
  const tile = tileId == null ? null : state.tiles[tileId];

  if (!tile || tile.terrain === "block") {
    return;
  }

  issueMove(/** @type {1|2} */ (activeCommander), selectedSlot, tile.id);
}

function pickTile(screenX, screenY) {
  const worldX = (screenX - worldOffsetX) / Math.max(0.0001, worldScale);
  const worldY = (screenY - worldOffsetY) / Math.max(0.0001, worldScale);
  const localX = worldX - cameraX;
  const localY = worldY - cameraY;

  const gx = (localX / (TILE_WIDTH / 2) + localY / (TILE_HEIGHT / 2)) / 2;
  const gy = (localY / (TILE_HEIGHT / 2) - localX / (TILE_WIDTH / 2)) / 2;

  const candidates = [
    [Math.floor(gx), Math.floor(gy)],
    [Math.ceil(gx), Math.floor(gy)],
    [Math.floor(gx), Math.ceil(gy)],
    [Math.ceil(gx), Math.ceil(gy)],
  ];

  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const [tx, ty] of candidates) {
    if (tx < 0 || ty < 0 || tx >= GRID_SIZE || ty >= GRID_SIZE) {
      continue;
    }

    const [cx, cy] = tileToScreen(tx, ty);
    const dx = screenX - cx;
    const dy = screenY - (cy + TILE_HEIGHT / 2);
    const dist = dx * dx + dy * dy;

    if (dist < bestDist) {
      bestDist = dist;
      best = getTileId(tx, ty);
    }
  }

  return best;
}

function render() {
  if (!mounted || !canvas || !ctx) {
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBackground();
  ctx.save();
  ctx.translate(worldOffsetX, worldOffsetY);
  ctx.scale(worldScale, worldScale);
  drawTiles();
  drawTargetMarkers();
  drawPulseEvents();
  drawPathPreview();
  drawNPCs();
  ctx.restore();
  drawStatusText();

  if (debugEnabled) {
    drawDebugOverlay();
  }

  if (state.matchState === "ended") {
    drawEndOverlay();
  } else if (state.matchState === "waiting" || state.matchState === "countdown") {
    drawStartOverlay();
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#040a18");
  gradient.addColorStop(0.45, "#081227");
  gradient.addColorStop(1, "#02050d");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawTiles() {
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const tile = state.tiles[getTileId(x, y)];
      const [sx, sy] = tileToScreen(x, y);
      drawDiamond(sx, sy, tile);
    }
  }
}

function drawTargetMarkers() {
  const selectedNpcId = state.players[activeCommander].npcs[selectedSlot];
  const selectedNpc = state.npcs[selectedNpcId];

  if (selectedNpc?.targetTileId != null) {
    const targetTile = state.tiles[selectedNpc.targetTileId];
    const [tx, ty] = tileToScreen(targetTile.x, targetTile.y);

    ctx.beginPath();
    ctx.arc(tx, ty + TILE_HEIGHT / 2, 6, 0, Math.PI * 2);
    ctx.strokeStyle = selectedNpc.ownerId === 1 ? "#9bc3ff" : "#ffadad";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tx - 4, ty + TILE_HEIGHT / 2);
    ctx.lineTo(tx + 4, ty + TILE_HEIGHT / 2);
    ctx.moveTo(tx, ty + TILE_HEIGHT / 2 - 4);
    ctx.lineTo(tx, ty + TILE_HEIGHT / 2 + 4);
    ctx.stroke();
  }
}

function drawPathPreview() {
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;

  for (const npc of Object.values(state.npcs)) {
    if (npc.state !== "moving" || npc.targetTileId == null || npc.tileId === npc.targetTileId) {
      continue;
    }

    const path = previewGreedyPath(state, npc.tileId, npc.targetTileId, 8);
    if (path.length === 0) {
      continue;
    }

    const [sx, sy] = tileToScreen(state.tiles[npc.tileId].x, state.tiles[npc.tileId].y);
    ctx.beginPath();
    ctx.moveTo(sx, sy + TILE_HEIGHT / 2 - 12);

    for (const tileId of path) {
      const tile = state.tiles[tileId];
      const [px, py] = tileToScreen(tile.x, tile.y);
      ctx.lineTo(px, py + TILE_HEIGHT / 2 - 12);
    }

    ctx.strokeStyle = npc.ownerId === 1 ? "rgba(128,178,255,0.55)" : "rgba(255,128,128,0.55)";
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

function drawNPCs() {
  const sorted = Object.values(state.npcs).sort((a, b) => {
    const ta = state.tiles[a.tileId];
    const tb = state.tiles[b.tileId];
    return ta.y + ta.x - (tb.y + tb.x);
  });

  const selectedNpcId = state.players[activeCommander].npcs[selectedSlot];

  for (const npc of sorted) {
    const tile = state.tiles[npc.tileId];
    const [sx, sy] = tileToScreen(tile.x, tile.y);
    const cx = sx;
    const cy = sy + TILE_HEIGHT / 2 - 14;
    const isSelected = selectedNpcId === npc.id;
    const baseColor = npc.ownerId === 1 ? "#2d6fff" : "#ff4040";

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.strokeStyle = npc.ownerId === 1 ? "rgba(160,208,255,0.95)" : "rgba(255,170,170,0.95)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0d1428";
    ctx.stroke();

    ctx.fillStyle = "#f5f8ff";
    ctx.font = "700 11px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(typeGlyph(npc.type), cx, cy + 0.5);
  }
}

function drawPulseEvents() {
  for (const event of runtime.pulseEvents) {
    const tile = state.tiles[event.tileId];
    if (!tile) {
      continue;
    }

    const [sx, sy] = tileToScreen(tile.x, tile.y);
    const age = state.tick - event.createdTick;
    const radius = 14 + age * 5;
    const alpha = clamp(1 - age / 20, 0, 1);

    ctx.beginPath();
    ctx.arc(sx, sy + TILE_HEIGHT / 2, radius, 0, Math.PI * 2);
    ctx.strokeStyle = event.playerId === 1 ? `rgba(96, 162, 255, ${0.5 * alpha})` : `rgba(255, 110, 110, ${0.5 * alpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawStatusText() {
  const score = state.controlScore;
  const hp1 = state.players[1].hp.toFixed(1);
  const hp2 = state.players[2].hp.toFixed(1);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(235, 244, 255, 0.95)";
  ctx.font = "700 14px Segoe UI";
  ctx.fillText(`P1 ${hp1}HP ${score.p1ControlledTiles}T`, 12, 10);
  ctx.fillStyle = "rgba(255, 210, 210, 0.95)";
  ctx.fillText(`P2 ${hp2}HP ${score.p2ControlledTiles}T`, 12, 30);

  const selectedNpcId = state.players[activeCommander].npcs[selectedSlot];
  const selectedNpc = state.npcs[selectedNpcId];
  const cdTicks = Math.max(0, PULSE_COOLDOWN_TICKS - (state.tick - selectedNpc.lastPulseTick));
  const remaining = Math.max(0, MAX_MATCH_TICKS - state.runningTicks);

  ctx.fillStyle = "rgba(235, 244, 255, 0.85)";
  ctx.font = "600 12px Segoe UI";
  ctx.fillText(`State ${state.matchState.toUpperCase()} | Tick ${state.tick} | Match ${Math.ceil(remaining / 10)}s | CMD P${activeCommander} A${selectedSlot + 1} | Pulse CD ${Math.ceil((cdTicks * TICK_MS) / 1000)}s`, 12, 52);

  if (runtime.soloTestModeActive || SOLO_TEST_OVERRIDE) {
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255, 214, 79, 0.98)";
    ctx.font = "700 12px Segoe UI";
    ctx.fillText(SOLO_QUERY_OVERRIDE ? "PATCH v2 SOLO READY" : "SOLO TEST MODE", viewWidth - 12, 10);
    ctx.textAlign = "left";
  }
}

function drawStartOverlay() {
  ctx.fillStyle = "rgba(2, 4, 12, 0.62)";
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (state.matchState === "waiting") {
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 40px Segoe UI";
    ctx.fillText("PRESSURE PROTOCOL", viewWidth / 2, viewHeight / 2 - 60);
    ctx.font = "600 18px Segoe UI";
    ctx.fillStyle = "#d8e6ff";
    ctx.fillText("Press R to READY for active commander. Tab swaps commander.", viewWidth / 2, viewHeight / 2 - 14);
    ctx.fillText(`P1 ${state.readyPlayers[1] ? "READY" : "WAITING"} | P2 ${state.readyPlayers[2] ? "READY" : "WAITING"}`, viewWidth / 2, viewHeight / 2 + 18);
    return;
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 54px Segoe UI";
  ctx.fillText(`${Math.max(1, Math.ceil(state.countdownTicks / 10))}`, viewWidth / 2, viewHeight / 2 - 10);
  ctx.font = "700 20px Segoe UI";
  ctx.fillStyle = "#d8e6ff";
  ctx.fillText("MATCH STARTING", viewWidth / 2, viewHeight / 2 + 44);
}

function drawEndOverlay() {
  const p1Pct = controlPercent(1);
  const p2Pct = controlPercent(2);
  const draw = state.winner == null;

  ctx.fillStyle = "rgba(2, 4, 12, 0.76)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 48px Segoe UI";

  if (draw) {
    ctx.fillText("DRAW", canvas.width / 2, canvas.height / 2 - 42);
  } else {
    ctx.fillText(`PLAYER ${state.winner} WINS`, canvas.width / 2, canvas.height / 2 - 42);
  }

  ctx.font = "700 20px Segoe UI";
  ctx.fillStyle = "#d8e6ff";
  ctx.fillText(`Final Control: P1 ${p1Pct}% | P2 ${p2Pct}%`, canvas.width / 2, canvas.height / 2 + 4);

  ctx.font = "600 18px Segoe UI";
  ctx.fillStyle = "#f2f6ff";
  ctx.fillText("Refresh to rematch", canvas.width / 2, canvas.height / 2 + 40);
}

function drawDebugOverlay() {
  const lastHashTick = state.tick - (state.tick % 20);
  const selectedNpcId = state.players[activeCommander].npcs[selectedSlot];
  const score = state.controlScore;

  ctx.fillStyle = "rgba(3, 8, 18, 0.7)";
  ctx.fillRect(12, 76, 420, 108);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "600 12px Consolas";
  ctx.fillStyle = "#cde0ff";
  ctx.fillText("DEBUG", 20, 84);
  ctx.fillText(`tick=${state.tick} matchState=${state.matchState} runningTicks=${state.runningTicks}`, 20, 102);
  ctx.fillText(`hash@${lastHashTick}=${runtime.localHashes[lastHashTick] ?? "n/a"}`, 20, 118);
  ctx.fillText(`selectedNpc=${selectedNpcId} queue=${runtime.commandQueue.length}`, 20, 134);
  ctx.fillText(`tiles p1=${score.p1ControlledTiles} p2=${score.p2ControlledTiles} n=${score.neutralTiles}`, 20, 150);
  ctx.fillText(`pressure p1=${score.p1PressureTotal.toFixed(1)} p2=${score.p2PressureTotal.toFixed(1)}`, 20, 166);
}

function drawDiamond(sx, sy, tile) {
  const pressureAbs = Math.min(1, Math.abs(tile.pressure) / 100);
  const activePulse = runtime.tileEffects[tile.id] ? 1 - clamp((state.tick - runtime.tileEffects[tile.id].lastDeltaTick) / 8, 0, 1) : 0;

  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + TILE_WIDTH / 2, sy + TILE_HEIGHT / 2);
  ctx.lineTo(sx, sy + TILE_HEIGHT);
  ctx.lineTo(sx - TILE_WIDTH / 2, sy + TILE_HEIGHT / 2);
  ctx.closePath();

  const terrainBase = getTerrainBaseColor(tile.terrain, tile.x, tile.y);
  ctx.fillStyle = terrainBase;
  ctx.fill();

  if (tile.terrain !== "block") {
    const ownerOverlay = getOwnerOverlay(tile.owner, pressureAbs, activePulse);
    if (ownerOverlay) {
      ctx.fillStyle = ownerOverlay;
      ctx.fill();
    }

    drawPressureArrow(sx, sy, tile);
  }

  if (tile.terrain === "road") {
    const glow = 0.2 + 0.22 * (Math.sin(state.tick * 0.09 + tile.x + tile.y) * 0.5 + 0.5);
    ctx.strokeStyle = `rgba(140, 196, 255, ${glow})`;
    ctx.lineWidth = 2.5;
  } else if (tile.terrain === "grass") {
    ctx.strokeStyle = "rgba(40, 60, 36, 0.9)";
    ctx.lineWidth = 1.6;
  } else {
    ctx.strokeStyle = "rgba(72, 78, 96, 0.95)";
    ctx.lineWidth = 2;
  }

  ctx.stroke();

  if (tile.lockedBy) {
    ctx.beginPath();
    ctx.arc(sx, sy + TILE_HEIGHT / 2, 7, 0, Math.PI * 2);
    ctx.fillStyle = tile.lockedBy === 1 ? "rgba(72,140,255,0.95)" : "rgba(255,88,88,0.95)";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(sx - 4, sy + TILE_HEIGHT / 2);
    ctx.lineTo(sx + 4, sy + TILE_HEIGHT / 2);
    ctx.moveTo(sx, sy + TILE_HEIGHT / 2 - 4);
    ctx.lineTo(sx, sy + TILE_HEIGHT / 2 + 4);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

function getTerrainBaseColor(terrain, x, y) {
  if (terrain === "block") {
    const shade = 42 + ((x + y) % 3) * 6;
    return `rgb(${shade}, ${shade + 2}, ${shade + 8})`;
  }

  if (terrain === "road") {
    const shade = 70 + ((x * 3 + y * 5) % 4) * 5;
    return `rgb(${shade}, ${shade + 8}, ${shade + 22})`;
  }

  const shade = 58 + ((x * 7 + y * 11) % 5) * 4;
  return `rgb(${shade - 8}, ${shade + 16}, ${shade - 4})`;
}

function getOwnerOverlay(owner, pressureAbs, activePulse) {
  const alpha = clamp(0.16 + pressureAbs * 0.46 + activePulse * 0.16, 0.12, 0.72);

  if (owner === 1) {
    return `rgba(44, 112, 255, ${alpha})`;
  }

  if (owner === 2) {
    return `rgba(255, 66, 66, ${alpha})`;
  }

  return null;
}

function drawPressureArrow(sx, sy, tile) {
  const sign = tile.pressure >= 0 ? 1 : -1;
  const magnitude = Math.min(1, Math.abs(tile.pressure) / 100);
  if (magnitude <= 0.03) {
    return;
  }

  const ax = sx - sign * (8 + magnitude * 7);
  const ay = sy + TILE_HEIGHT / 2;
  const bx = sx + sign * (8 + magnitude * 7);
  const by = sy + TILE_HEIGHT / 2;

  ctx.strokeStyle = tile.pressure >= 0 ? "rgba(214, 234, 255, 0.72)" : "rgba(255, 224, 224, 0.72)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - sign * 5, by - 3);
  ctx.lineTo(bx - sign * 5, by + 3);
  ctx.closePath();
  ctx.fillStyle = tile.pressure >= 0 ? "rgba(214, 234, 255, 0.72)" : "rgba(255, 224, 224, 0.72)";
  ctx.fill();
}

function markTileActivity(tileId, delta, tick) {
  if (Math.abs(delta) <= 0.08) {
    return;
  }

  runtime.tileEffects[tileId] = { lastDeltaTick: tick };
}

function hashState(gameState) {
  const payload = JSON.stringify({
    tiles: gameState.tiles,
    npcs: gameState.npcs,
    players: gameState.players,
    matchState: gameState.matchState,
    readyPlayers: gameState.readyPlayers,
    countdownTicks: gameState.countdownTicks,
    runningTicks: gameState.runningTicks,
    winner: gameState.winner,
  });

  return simpleHash(payload);
}

function simpleHash(text) {
  let hash = 2166136261;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function commandKey(command) {
  return `${command.t}|${command.playerId}|${command.type}|${command.npcId ?? "-"}|${command.targetTileId ?? "-"}`;
}

function isCommandShapeValid(command) {
  if (!command || typeof command !== "object") {
    return false;
  }

  if (command.type !== "move" && command.type !== "pulse" && command.type !== "ready") {
    return false;
  }

  if (command.playerId !== 1 && command.playerId !== 2) {
    return false;
  }

  if (!Number.isInteger(command.t) || command.t < 0) {
    return false;
  }

  if (command.type === "move") {
    return typeof command.npcId === "string" && Number.isInteger(command.targetTileId);
  }

  if (command.type === "pulse") {
    return typeof command.npcId === "string";
  }

  return true;
}

function isValidTargetTile(gameState, tileId) {
  if (!Number.isInteger(tileId)) {
    return false;
  }

  const tile = gameState.tiles[tileId];
  return Boolean(tile && tile.terrain !== "block");
}

function typeGlyph(type) {
  if (type === "seeder") {
    return "S";
  }

  if (type === "breaker") {
    return "B";
  }

  return "A";
}

function tileToScreen(x, y) {
  const screenX = (x - y) * (TILE_WIDTH / 2) + cameraX;
  const screenY = (x + y) * (TILE_HEIGHT / 2) + cameraY;
  return [screenX, screenY];
}

function getProjectedMapBounds() {
  const halfW = TILE_WIDTH / 2;
  const halfH = TILE_HEIGHT / 2;
  const max = GRID_SIZE - 1;
  const origins = [
    [0, 0],
    [max * halfW, max * halfH],
    [-max * halfW, max * halfH],
    [0, max * TILE_HEIGHT],
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [ox, oy] of origins) {
    minX = Math.min(minX, ox - halfW);
    maxX = Math.max(maxX, ox + halfW);
    minY = Math.min(minY, oy);
    maxY = Math.max(maxY, oy + TILE_HEIGHT);
  }

  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function resize() {
  if (!canvas || !ctx) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  const host = canvas.parentElement;
  const hostRect = host ? host.getBoundingClientRect() : canvas.getBoundingClientRect();
  viewWidth = Math.max(320, Math.floor(hostRect.width || window.innerWidth));
  viewHeight = Math.max(240, Math.floor(hostRect.height || window.innerHeight));

  canvas.width = Math.floor(viewWidth * ratio);
  canvas.height = Math.floor(viewHeight * ratio);
  canvas.style.width = `${viewWidth}px`;
  canvas.style.height = `${viewHeight}px`;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const bounds = getProjectedMapBounds();
  const safeWidth = Math.max(1, viewWidth * (1 - (MAP_FIT_MARGIN_RATIO * 2)));
  const safeHeight = Math.max(1, viewHeight * (1 - (MAP_FIT_MARGIN_RATIO * 2)));
  worldScale = Math.min(safeWidth / bounds.width, safeHeight / bounds.height);

  cameraX = -bounds.minX;
  cameraY = -bounds.minY;
  worldOffsetX = Math.floor((viewWidth - (bounds.width * worldScale)) / 2);
  worldOffsetY = Math.floor((viewHeight - (bounds.height * worldScale)) / 2);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTileId(x, y) {
  return y * GRID_SIZE + x;
}

function forcePassable(tiles, x, y) {
  const tile = tiles[getTileId(x, y)];
  if (!tile) {
    return;
  }

  tile.terrain = "road";
  tile.moveCost = 0.5;
}

function decideTerrain(x, y) {
  const lineRoad = x % 5 === 0 || y % 5 === 0;
  const diagonalRoad = (x + y) % 7 === 0;
  const hash = ((x + 17) * 928371 + (y + 31) * 192847 + x * y * 11939) % 1000;

  if (lineRoad || diagonalRoad) {
    return "road";
  }

  if (hash < 125) {
    return "block";
  }

  return "grass";
}

function createNPC(npcs, id, ownerId, type, tileId, speed) {
  npcs[id] = {
    id,
    ownerId,
    type,
    tileId,
    targetTileId: null,
    hp: 100,
    speed,
    state: "idle",
    moveProgress: 0,
    lastPulseTick: -99999,
  };
}

function isNearSpawn(tile, playerId) {
  const radius = 4;

  if (playerId === 1) {
    return tile.x <= radius && tile.y <= radius;
  }

  return tile.x >= GRID_SIZE - 1 - radius && tile.y >= GRID_SIZE - 1 - radius;
}

function opponentOf(playerId) {
  return playerId === 1 ? 2 : 1;
}

function tickHeartbeat() {
  gameTick(state);
}

function renderFrame() {
  render();
  if (mounted) {
    animationFrameId = requestAnimationFrame(renderFrame);
  }
}

function resolveMountCanvas(options = {}) {
  if (options.canvas instanceof HTMLCanvasElement) {
    return options.canvas;
  }

  const canvasId = options.canvasId ?? "game";
  const containerId = options.containerId ?? "game-shell";
  const existing = document.getElementById(canvasId);
  if (existing instanceof HTMLCanvasElement) {
    return existing;
  }

  const container = document.getElementById(containerId) ?? document.body;
  const created = document.createElement("canvas");
  created.id = canvasId;
  created.setAttribute("aria-label", "Pressure Protocol battlefield");
  created.style.display = "block";
  created.style.width = "100%";
  created.style.height = "100%";
  container.appendChild(created);
  return created;
}

function mount(options = {}) {
  if (mounted) {
    destroy();
  }

  canvas = resolveMountCanvas(options);
  ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("PressureProtocol mount failed: 2D context unavailable");
  }

  mounted = true;
  console.log("[PressureProtocol] LOADED pressure-protocol-runtime-fallback-fit-v2");
  console.info(`[PressureProtocol] ${RUNTIME_PATCH_ID}`);
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("pointerdown", onPointerDown);

  resize();
  tickIntervalId = setInterval(tickHeartbeat, TICK_MS);
  animationFrameId = requestAnimationFrame(renderFrame);

  return canvas;
}

function destroy() {
  if (animationFrameId != null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (tickIntervalId != null) {
    clearInterval(tickIntervalId);
    tickIntervalId = null;
  }

  window.removeEventListener("resize", resize);
  window.removeEventListener("keydown", onKeyDown);
  if (canvas) {
    canvas.removeEventListener("pointerdown", onPointerDown);
  }

  mounted = false;
  ctx = null;
  canvas = null;
}

window.PressureProtocol = {
  patchId: RUNTIME_PATCH_ID,
  soloOverride: SOLO_TEST_OVERRIDE,
  state,
  issueMove,
  issuePulse,
  issueReady,
  mount,
  destroy,
  receiveRemoteCommand,
  receiveRemoteHash,
  setCommandBroadcastSink(fn) {
    runtime.commandSink = fn;
  },
  setHashBroadcastSink(fn) {
    runtime.hashSink = fn;
  },
  enqueueCommand(command) {
    queueCommand(command, false);
  },
  selectCommander(playerId) {
    activeCommander = playerId;
  },
  selectSlot(slot) {
    selectedSlot = clamp(slot, 0, 2);
  },
  setDebug(enabled) {
    debugEnabled = Boolean(enabled);
  },
  hashState() {
    return hashState(state);
  },
  getSnapshot() {
    return JSON.parse(JSON.stringify(state));
  },
};
