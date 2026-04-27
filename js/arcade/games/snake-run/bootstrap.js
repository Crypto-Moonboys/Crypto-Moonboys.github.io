import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { SNAKE_RUN_CONFIG } from './config.js';
import { BaseGame } from '/js/arcade/engine/BaseGame.js';
import { createGameAdapter, registerGameAdapter } from '/js/arcade/engine/game-adapter.js';
import {
  createUpgradeSystem,
  createDirectorSystem,
  createEventSystem,
  createMutationSystem,
  createBossSystem,
  createRiskSystem,
  createMetaSystem,
  createFeedbackSystem,
} from '/js/arcade/systems/index.js';
import { createScalingDirector, tickDirector, pickWaveModifier, updateIntensity, checkForcedChaos, getBossAggressionMult } from '/js/arcade/systems/director-system.js';
import { shouldFirePressureEvent, getEventTier } from '/js/arcade/systems/event-system.js';
import { applyMutations } from '/js/arcade/systems/mutation-system.js';
import { pickBossArchetype } from '/js/arcade/systems/boss-system.js';
import { shouldOfferRiskReward, pickRiskRewardChoices } from '/js/arcade/systems/risk-system.js';
import { buildRunSummary, recordRunStats, checkMilestones, getDailyVariation } from '/js/arcade/systems/meta-system.js';
import { pulseHudElement, setTransientBanner } from '/js/arcade/systems/feedback-system.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';

const GAME_ID = 'snake-run';
const WORLD_W = 1600;
const WORLD_H = 900;
const GRID_COLS = 44;
const GRID_ROWS = 26;
const CELL = 32;
const FIXED_STEP = 1 / 60;

const SYSTEM_FACTORIES = {
  upgrade: createUpgradeSystem,
  director: createDirectorSystem,
  event: createEventSystem,
  mutation: createMutationSystem,
  boss: createBossSystem,
  risk: createRiskSystem,
  meta: createMetaSystem,
  feedback: createFeedbackSystem,
};

const SYSTEM_ALIASES = {
  upgrades: 'upgrade',
  events: 'event',
  mutations: 'mutation',
  bosses: 'boss',
};

const SYSTEM_FLAGS = {
  upgrades: true,
  director: true,
  events: true,
  mutations: true,
  bosses: true,
  risk: true,
  meta: true,
  feedback: true,
};

const DIRS = {
  up: { x: 0, y: -1, a: -Math.PI * 0.5 },
  down: { x: 0, y: 1, a: Math.PI * 0.5 },
  left: { x: -1, y: 0, a: Math.PI },
  right: { x: 1, y: 0, a: 0 },
};

const FOOD_DEFS = {
  normal: { color: '#f7ab1a', score: 12, grow: 1, rare: 1, fx: 'normal' },
  poison: { color: '#8bff5a', score: 8, grow: -1, rare: 0.26, fx: 'poison' },
  explosive: { color: '#ff7043', score: 22, grow: 1, rare: 0.16, fx: 'explosive' },
  multiplier: { color: '#ff57d8', score: 24, grow: 1, rare: 0.17, fx: 'multiplier' },
  shield: { color: '#4ad6ff', score: 18, grow: 1, rare: 0.14, fx: 'shield' },
  golden: { color: '#ffd54f', score: 60, grow: 2, rare: 0.06, fx: 'golden' },
};

const UPGRADE_DEFS = [
  { id: 'speed-control', label: 'Speed Control', desc: 'Smoother, faster snake cadence.' },
  { id: 'segment-growth', label: 'Segment Growth', desc: 'Food grants more body growth.' },
  { id: 'score-mult', label: 'Score Mult', desc: 'Permanent score multiplier.' },
  { id: 'shield-segment', label: 'Shield Segment', desc: 'Gain shield charges.' },
  { id: 'ghost-phase', label: 'Ghost Phase', desc: 'Pass through one hit.' },
  { id: 'magnet-food', label: 'Magnet Food', desc: 'Nearby food drifts to you.' },
  { id: 'auto-turn', label: 'Auto Turn Assist', desc: 'Auto-steer away from traps.' },
  { id: 'split-snake', label: 'Split Snake', desc: 'Spawn a helper clone.' },
];

const BOSS_TYPES = ['mega-serpent', 'grid-crusher', 'orb-core', 'phantom-snake'];

const EVENT_DEFS = {
  'food-storm': { duration: 9, warning: 'Food Storm' },
  'poison-field': { duration: 10, warning: 'Poison Field' },
  'speed-surge': { duration: 7, warning: 'Speed Surge' },
  'reverse-controls': { duration: 6, warning: 'Reverse Controls' },
  'maze-walls': { duration: 10, warning: 'Maze Walls' },
  'golden-burst': { duration: 8, warning: 'Golden Burst' },
};

function resolveSystems(flags) {
  const out = {};
  for (const [rawName, enabled] of Object.entries(flags || {})) {
    if (!enabled) continue;
    const name = SYSTEM_ALIASES[rawName] || rawName;
    const factory = SYSTEM_FACTORIES[name];
    if (typeof factory === 'function') out[name] = factory;
  }
  return out;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(min, max) { return min + Math.random() * (max - min); }
function choose(list) { return list[Math.floor(Math.random() * list.length)]; }

function cue(id, spec) {
  if (isMuted()) return;
  playSound(id, spec);
}

function makeTone(freqA, freqB, duration, type, volume) {
  return { kind: 'tone', type: type || 'square', freqStart: freqA, freqEnd: freqB, duration: duration, volume: volume || 0.045 };
}

function tileToWorld(x, y) {
  return {
    x: (x + 0.5) * CELL,
    y: (y + 0.5) * CELL,
  };
}

function createState(root) {
  const canvas = document.getElementById('snakeCanvas');
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  return {
    root: root,
    canvas: canvas,
    ctx: ctx,
    scoreEl: document.getElementById('score'),
    bestEl: document.getElementById('best'),
    comboEl: document.getElementById('combo') || document.getElementById('streak'),
    heatEl: document.getElementById('speedLabel'),
    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    resetBtn: document.getElementById('resetBtn'),
    best: ArcadeSync.getHighScore(GAME_ID),
    score: 0,
    wave: 1,
    running: false,
    paused: false,
    gameOver: false,
    submitted: false,
    elapsed: 0,
    fixedAccumulator: 0,
    moveAccumulator: 0,
    moveProgress: 0,
    worldW: WORLD_W,
    worldH: WORLD_H,
    camera: { x: WORLD_W * 0.5, y: WORLD_H * 0.5 },
    view: { scale: 1, width: WORLD_W, height: WORLD_H, offsetX: 0, offsetY: 0, dpr: 1 },
    snake: [],
    prevSnake: [],
    cloneSnake: [],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    headingAngle: 0,
    targetHeadingAngle: 0,
    turnEase: 0,
    growthQueue: 0,
    combo: 0,
    comboTimer: 0,
    comboWindow: 2.1,
    foods: [],
    walls: [],
    movingBlocks: [],
    rotatingHazards: [],
    arenaInset: 0,
    arenaTargetInset: 0,
    shrinkingRate: 0,
    hazards: {
      hunterSnakes: [],
      drones: [],
      chasingOrbs: [],
      trapTiles: [],
      collapseZones: [],
    },
    particles: [],
    trails: [],
    flash: 0,
    shake: 0,
    warningBanner: { value: null },
    eventState: { id: null, timer: 0 },
    activeMutations: [],
    mutationFlavor: { foodBias: 0, movingObstacles: false, oddGrowth: false },
    director: createScalingDirector(),
    dailyVariation: getDailyVariation(),
    upgrades: {
      'speed-control': 0,
      'segment-growth': 0,
      'score-mult': 0,
      'shield-segment': 0,
      'ghost-phase': 0,
      'magnet-food': 0,
      'auto-turn': 0,
      'split-snake': 0,
    },
    pendingUpgradeChoices: [],
    riskChoices: [],
    riskMult: 1,
    phase: 'combat',
    phaseTimer: 0,
    foodsThisWave: 0,
    waveFoodTarget: 8,
    boss: null,
    runStats: { bossesDefeated: 0, highestIntensity: 0 },
    metaLast: null,
    resizeHandler: null,
    fsHandler: null,
  };
}

function resetRun(state) {
  state.score = 0;
  state.wave = 1;
  state.elapsed = 0;
  state.fixedAccumulator = 0;
  state.moveAccumulator = 0;
  state.moveProgress = 0;
  state.combo = 0;
  state.comboTimer = 0;
  state.running = true;
  state.paused = false;
  state.gameOver = false;
  state.submitted = false;
  state.dir = { x: 1, y: 0 };
  state.nextDir = { x: 1, y: 0 };
  state.headingAngle = 0;
  state.targetHeadingAngle = 0;
  state.turnEase = 1;
  state.growthQueue = 0;
  state.snake = [
    { x: Math.floor(GRID_COLS * 0.25), y: Math.floor(GRID_ROWS * 0.5) },
    { x: Math.floor(GRID_COLS * 0.25) - 1, y: Math.floor(GRID_ROWS * 0.5) },
    { x: Math.floor(GRID_COLS * 0.25) - 2, y: Math.floor(GRID_ROWS * 0.5) },
  ];
  state.prevSnake = state.snake.map((s) => ({ x: s.x, y: s.y }));
  state.cloneSnake = [];
  state.walls = [];
  state.movingBlocks = [];
  state.rotatingHazards = [];
  state.hazards.hunterSnakes = [];
  state.hazards.drones = [];
  state.hazards.chasingOrbs = [];
  state.hazards.trapTiles = [];
  state.hazards.collapseZones = [];
  state.arenaInset = 0;
  state.arenaTargetInset = 0;
  state.shrinkingRate = 0;
  state.flash = 0;
  state.shake = 0;
  state.warningBanner.value = null;
  state.eventState = { id: null, timer: 0 };
  state.activeMutations = [];
  state.mutationFlavor = { foodBias: 0, movingObstacles: false, oddGrowth: false };
  state.director = createScalingDirector();
  state.pendingUpgradeChoices = [];
  state.riskChoices = [];
  state.riskMult = 1;
  state.phase = 'combat';
  state.phaseTimer = 0;
  state.foodsThisWave = 0;
  state.waveFoodTarget = 8;
  state.boss = null;
  state.runStats = { bossesDefeated: 0, highestIntensity: 0 };

  for (const key of Object.keys(state.upgrades)) state.upgrades[key] = 0;

  state.foods = [];
  for (let i = 0; i < 5; i += 1) spawnFood(state, 'normal');

  seedWave(state);
  updateHud(state);
  cue('snake-run-start', makeTone(260, 720, 0.09, 'triangle', 0.05));
}

function arenaBounds(state) {
  const x = state.arenaInset;
  const y = state.arenaInset;
  const w = GRID_COLS - state.arenaInset * 2;
  const h = GRID_ROWS - state.arenaInset * 2;
  return { x: x, y: y, w: w, h: h };
}

function isInsideArena(state, x, y) {
  const a = arenaBounds(state);
  return x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h;
}

function isCellBlocked(state, x, y, ignoreHead) {
  if (!isInsideArena(state, x, y)) return true;
  for (const w of state.walls) if (w.x === x && w.y === y) return true;
  for (const m of state.movingBlocks) if (Math.round(m.x) === x && Math.round(m.y) === y) return true;
  for (const z of state.hazards.collapseZones) if (z.active && z.x === x && z.y === y) return true;
  for (let i = ignoreHead ? 1 : 0; i < state.snake.length; i += 1) {
    const seg = state.snake[i];
    if (seg.x === x && seg.y === y) return true;
  }
  return false;
}

function spawnFood(state, forceType) {
  const types = Object.keys(FOOD_DEFS);
  let total = 0;
  const weighted = [];
  for (const type of types) {
    const def = FOOD_DEFS[type];
    const weight = def.rare + (state.mutationFlavor.foodBias > 0 && type === 'golden' ? state.mutationFlavor.foodBias : 0);
    weighted.push({ type: type, weight: weight });
    total += weight;
  }

  const pickType = forceType || (function () {
    const roll = Math.random() * total;
    let c = 0;
    for (const item of weighted) {
      c += item.weight;
      if (roll <= c) return item.type;
    }
    return 'normal';
  }());

  for (let tries = 0; tries < 420; tries += 1) {
    const x = Math.floor(rand(0, GRID_COLS));
    const y = Math.floor(rand(0, GRID_ROWS));
    if (isCellBlocked(state, x, y, false)) continue;
    if (state.foods.some((f) => f.x === x && f.y === y)) continue;
    state.foods.push({ x: x, y: y, type: pickType, pulse: Math.random() * 20, ttl: 15 + Math.random() * 8 });
    return;
  }
}

function seedWave(state) {
  const a = arenaBounds(state);
  state.waveFoodTarget = 8 + Math.min(48, state.wave * 2);
  const density = Math.floor(1 + state.wave * 0.35 + (state.director.intensity || 0) * 0.03);

  for (let i = 0; i < density; i += 1) {
    state.walls.push({
      x: Math.floor(rand(a.x + 1, a.x + a.w - 1)),
      y: Math.floor(rand(a.y + 1, a.y + a.h - 1)),
    });
  }

  const movingCount = Math.floor(1 + state.wave * 0.12);
  for (let i = 0; i < movingCount; i += 1) {
    state.movingBlocks.push({
      x: rand(a.x + 2, a.x + a.w - 2),
      y: rand(a.y + 2, a.y + a.h - 2),
      ox: rand(a.x + 2, a.x + a.w - 2),
      oy: rand(a.y + 2, a.y + a.h - 2),
      axis: Math.random() > 0.5 ? 'x' : 'y',
      speed: 0.6 + Math.random() * 1.4,
      amp: 1 + Math.random() * 2,
      t: Math.random() * Math.PI * 2,
    });
  }

  if (state.wave >= 3) {
    state.rotatingHazards.push({
      cx: Math.floor(a.x + a.w * 0.5),
      cy: Math.floor(a.y + a.h * 0.5),
      radius: 3 + (state.wave % 4),
      angle: Math.random() * Math.PI * 2,
      speed: 0.7 + Math.random() * 0.7,
    });
  }

  spawnThreats(state, Math.floor(2 + state.wave * 0.4));

  const mod = pickWaveModifier(state.wave, state.director);
  if (mod && mod.id === 'fastInvaders') {
    state.shrinkingRate += 0.06;
    setTransientBanner(state.warningBanner, 'Director: speed pressure', '#f7c948', 2);
  } else if (mod && mod.id === 'blackout') {
    state.flash = Math.max(state.flash, 0.35);
    setTransientBanner(state.warningBanner, 'Director: blackout lanes', '#bc8cff', 2);
  }

  if (state.wave > 2 && state.wave % 4 === 0) applyWaveMutations(state);
}

function spawnThreats(state, pressure) {
  const a = arenaBounds(state);
  const hunterCount = Math.min(4, 1 + Math.floor(state.wave / 5));
  for (let i = 0; i < hunterCount; i += 1) {
    state.hazards.hunterSnakes.push({
      segments: [
        { x: Math.floor(rand(a.x + 1, a.x + a.w - 1)), y: Math.floor(rand(a.y + 1, a.y + a.h - 1)) },
        { x: Math.floor(rand(a.x + 1, a.x + a.w - 1)), y: Math.floor(rand(a.y + 1, a.y + a.h - 1)) },
      ],
      dir: choose([DIRS.up, DIRS.down, DIRS.left, DIRS.right]),
      timer: 0,
      step: clamp(0.27 - state.wave * 0.004, 0.12, 0.26),
    });
  }

  const drones = Math.floor(1 + pressure * 0.24);
  for (let i = 0; i < drones; i += 1) {
    state.hazards.drones.push({
      x: rand((a.x + 1) * CELL, (a.x + a.w - 1) * CELL),
      y: rand((a.y + 1) * CELL, (a.y + a.h - 1) * CELL),
      vx: rand(-90, 90),
      vy: rand(-90, 90),
      r: 10 + Math.random() * 8,
    });
  }

  state.hazards.chasingOrbs.push({
    x: rand((a.x + 1) * CELL, (a.x + a.w - 1) * CELL),
    y: rand((a.y + 1) * CELL, (a.y + a.h - 1) * CELL),
    r: 12,
    speed: 82 + state.wave * 3,
  });

  const trapCount = Math.floor(3 + state.wave * 0.2);
  for (let i = 0; i < trapCount; i += 1) {
    state.hazards.trapTiles.push({
      x: Math.floor(rand(a.x + 1, a.x + a.w - 1)),
      y: Math.floor(rand(a.y + 1, a.y + a.h - 1)),
      ttl: 18,
    });
  }

  const collapseCount = Math.max(1, Math.floor(state.wave / 4));
  for (let i = 0; i < collapseCount; i += 1) {
    state.hazards.collapseZones.push({
      x: Math.floor(rand(a.x + 1, a.x + a.w - 1)),
      y: Math.floor(rand(a.y + 1, a.y + a.h - 1)),
      timer: 3 + Math.random() * 4,
      active: false,
    });
  }
}

function applyWaveMutations(state) {
  const carriers = state.hazards.hunterSnakes.map(() => ({ mutations: [] }));
  applyMutations(carriers, 10 + state.wave);
  state.activeMutations = carriers.flatMap((c) => c.mutations || []);
  state.mutationFlavor.oddGrowth = state.activeMutations.includes('splitter') || Math.random() < 0.25;
  state.mutationFlavor.movingObstacles = state.activeMutations.includes('teleportOnce') || Math.random() < 0.3;
  state.mutationFlavor.foodBias = state.activeMutations.includes('shieldNearby') ? 0.24 : 0;

  if (state.mutationFlavor.movingObstacles) {
    for (const m of state.movingBlocks) m.speed *= 1.25;
  }

  setTransientBanner(state.warningBanner, 'Mutation: pattern shift', '#ff7de0', 2.2);
}

function offerUpgrades(state) {
  const pool = UPGRADE_DEFS.filter((u) => state.upgrades[u.id] < 4);
  if (!pool.length) return;
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  state.pendingUpgradeChoices = pool.slice(0, 3);
  state.phase = 'upgrade';
  state.phaseTimer = 10;
  setTransientBanner(state.warningBanner, 'Choose upgrade: 1/2/3', '#8bf9ff', 2.4);
}

function applyUpgradeChoice(state, index) {
  if (state.phase !== 'upgrade') return;
  const choice = state.pendingUpgradeChoices[index];
  if (!choice) return;
  state.upgrades[choice.id] = (state.upgrades[choice.id] || 0) + 1;
  state.phase = 'combat';
  state.phaseTimer = 0;
  state.pendingUpgradeChoices = [];
  cue('snake-run-upgrade', makeTone(620, 980, 0.11, 'triangle', 0.05));
  setTransientBanner(state.warningBanner, 'Upgrade: ' + choice.label, '#8bf9ff', 1.8);
}

function applyRiskChoice(state, index) {
  if (state.phase !== 'risk') return;
  const choice = state.riskChoices[index];
  if (!choice) return;
  state.phase = 'combat';
  state.phaseTimer = 0;
  state.riskChoices = [];
  if (choice.id === 'doubleEnemies') {
    spawnThreats(state, 4);
    state.riskMult = 2;
  } else if (choice.id === 'oneLife') {
    state.riskMult = 3;
  } else {
    state.riskMult = 1.4;
  }
  setTransientBanner(state.warningBanner, 'Risk: ' + (choice.label || 'Accepted'), '#ff8f61', 2.2);
}

function beginBossWave(state) {
  const alt = pickBossArchetype(state.wave, state.director);
  const fallback = BOSS_TYPES[(state.wave / 5) % BOSS_TYPES.length | 0];
  const type = alt && alt.id ? choose(BOSS_TYPES.concat([fallback])) : fallback;
  state.boss = {
    type: type,
    hp: 80 + state.wave * 12,
    maxHp: 80 + state.wave * 12,
    x: GRID_COLS * 0.5,
    y: GRID_ROWS * 0.5,
    phase: 1,
    timer: 0,
    summon: 0,
  };
  setTransientBanner(state.warningBanner, 'Boss: ' + type.replace('-', ' '), '#ff6e6e', 2.8);
  cue('snake-run-boss-intro', makeTone(120, 74, 0.24, 'sawtooth', 0.07));
}

function clearWave(state) {
  state.wave += 1;
  state.foodsThisWave = 0;
  state.walls = [];
  state.movingBlocks = [];
  state.rotatingHazards = [];
  state.hazards.hunterSnakes = [];
  state.hazards.drones = [];
  state.hazards.chasingOrbs = [];
  state.hazards.trapTiles = [];
  state.hazards.collapseZones = [];
  state.arenaTargetInset = Math.min(7, Math.floor(state.wave / 6));
  state.shrinkingRate = 0.02 + state.wave * 0.0012;

  if (state.wave % 5 === 0) beginBossWave(state);
  else if (shouldOfferRiskReward(state.wave)) {
    state.phase = 'risk';
    state.phaseTimer = 10;
    state.riskChoices = pickRiskRewardChoices ? pickRiskRewardChoices() : [];
    setTransientBanner(state.warningBanner, 'Risk choice: Z/X', '#ffcc79', 2.2);
  } else offerUpgrades(state);

  seedWave(state);
}

function updateHud(state) {
  if (state.scoreEl) state.scoreEl.textContent = String(Math.floor(state.score));
  if (state.bestEl) state.bestEl.textContent = String(state.best);
  if (state.comboEl) state.comboEl.textContent = 'x' + (1 + state.combo * 0.15).toFixed(2);
  if (state.heatEl) state.heatEl.textContent = 'HEAT ' + Math.round(clamp(state.director.intensity || 0, 0, 100)) + '%';
}

function updateViewport(state) {
  if (!state.canvas) return;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const rect = state.canvas.parentElement ? state.canvas.parentElement.getBoundingClientRect() : state.canvas.getBoundingClientRect();
  const aw = Math.max(320, Math.floor(rect.width - 8));
  const ah = Math.max(240, Math.floor((window.innerHeight || rect.height) - 220));
  const scale = Math.min(aw / WORLD_W, ah / WORLD_H);
  const dw = Math.floor(WORLD_W * scale);
  const dh = Math.floor(WORLD_H * scale);
  state.canvas.style.width = dw + 'px';
  state.canvas.style.height = dh + 'px';
  state.canvas.width = Math.floor(dw * dpr);
  state.canvas.height = Math.floor(dh * dpr);
  state.view.scale = scale;
  state.view.width = dw;
  state.view.height = dh;
  state.view.offsetX = (aw - dw) * 0.5;
  state.view.offsetY = 0;
  state.view.dpr = dpr;
}

function registerResize(state) {
  unregisterResize(state);
  state.resizeHandler = function () { updateViewport(state); };
  state.fsHandler = function () { setTimeout(function () { updateViewport(state); }, 20); };
  window.addEventListener('resize', state.resizeHandler);
  document.addEventListener('fullscreenchange', state.fsHandler);
  updateViewport(state);
}

function unregisterResize(state) {
  if (state.resizeHandler) window.removeEventListener('resize', state.resizeHandler);
  if (state.fsHandler) document.removeEventListener('fullscreenchange', state.fsHandler);
  state.resizeHandler = null;
  state.fsHandler = null;
}

function handleDirectionInput(state, x, y) {
  if (!state.running || state.paused || state.gameOver) return;
  const nx = state.nextDir.x;
  const ny = state.nextDir.y;
  if (x === -nx && y === -ny) return;
  if (x === nx && y === ny) return;

  const reversed = state.eventState.id === 'reverse-controls';
  state.nextDir = reversed ? { x: -x, y: -y } : { x: x, y: y };
  state.targetHeadingAngle = Math.atan2(state.nextDir.y, state.nextDir.x);
  state.turnEase = 0;
  cue('snake-run-tick', makeTone(580, 500, 0.03, 'square', 0.028));
}

function maybeAssistTurn(state) {
  if (state.upgrades['auto-turn'] <= 0) return;
  const head = state.snake[0];
  const nextX = head.x + state.nextDir.x;
  const nextY = head.y + state.nextDir.y;
  if (!isCellBlocked(state, nextX, nextY, true)) return;
  const options = [
    { x: state.nextDir.y, y: -state.nextDir.x },
    { x: -state.nextDir.y, y: state.nextDir.x },
  ];
  for (const d of options) {
    if (!isCellBlocked(state, head.x + d.x, head.y + d.y, true)) {
      state.nextDir = d;
      state.targetHeadingAngle = Math.atan2(d.y, d.x);
      state.turnEase = 0;
      return;
    }
  }
}

function triggerEvent(state, id) {
  const def = EVENT_DEFS[id];
  if (!def) return;
  state.eventState.id = id;
  state.eventState.timer = def.duration;
  setTransientBanner(state.warningBanner, 'Event: ' + def.warning, id === 'reverse-controls' ? '#ff7a7a' : '#79e8ff', 2.2);
  cue('snake-run-event', makeTone(280, 610, 0.12, 'sawtooth', 0.05));

  if (id === 'food-storm') {
    for (let i = 0; i < 8; i += 1) spawnFood(state, choose(['normal', 'multiplier', 'shield']));
  }
  if (id === 'poison-field') {
    for (let i = 0; i < 8; i += 1) spawnFood(state, 'poison');
  }
  if (id === 'maze-walls') {
    const a = arenaBounds(state);
    for (let i = 0; i < 16; i += 1) {
      state.walls.push({ x: Math.floor(rand(a.x + 1, a.x + a.w - 1)), y: Math.floor(rand(a.y + 1, a.y + a.h - 1)) });
    }
  }
  if (id === 'golden-burst') {
    for (let i = 0; i < 5; i += 1) spawnFood(state, 'golden');
  }
}

function updateEventsAndDirector(state, dt) {
  tickDirector(
    state.director,
    dt,
    state.score,
    state.wave,
    Math.max(1, 3 - Math.floor(state.upgrades['shield-segment'] / 2)),
    state.upgrades,
    !!state.eventState.id,
    state.dailyVariation ? state.dailyVariation.eventRateMult : 1
  );

  const near = state.hazards.drones.length + state.hazards.hunterSnakes.length + (state.boss ? 4 : 0);
  updateIntensity(state.director, dt, {
    damageTaken: state.flash > 0.45,
    enemiesNearPlayer: near,
    bossActive: !!state.boss,
    lives: 2,
    waveClear: state.foodsThisWave >= state.waveFoodTarget && !state.boss,
  });

  state.runStats.highestIntensity = Math.max(state.runStats.highestIntensity, state.director.intensity || 0);

  if (!state.eventState.id && (checkForcedChaos(state.director) || shouldFirePressureEvent(state.director))) {
    const tier = getEventTier(state.director.intensity || 0);
    const eventId = tier === 'tier3' ? choose(['reverse-controls', 'maze-walls'])
      : tier === 'tier2' ? choose(['poison-field', 'speed-surge'])
      : choose(['food-storm', 'golden-burst']);
    triggerEvent(state, eventId);
    state.director.pressure = 0;
  }

  if (state.eventState.id) {
    state.eventState.timer -= dt;
    if (state.eventState.id === 'speed-surge') state.moveAccumulator += dt * 0.35;
    if (state.eventState.id === 'poison-field' && Math.random() < dt * 0.7) spawnFood(state, 'poison');
    if (state.eventState.id === 'golden-burst' && Math.random() < dt * 0.35) spawnFood(state, 'golden');
    if (state.eventState.id === 'food-storm' && Math.random() < dt * 0.9) spawnFood(state, choose(['normal', 'multiplier', 'shield']));
    if (state.eventState.timer <= 0) state.eventState = { id: null, timer: 0 };
  }
}

function applyFoodEffect(state, food) {
  const def = FOOD_DEFS[food.type] || FOOD_DEFS.normal;
  const growthMod = 1 + (state.upgrades['segment-growth'] * 0.35);
  let growth = def.grow;
  if (state.mutationFlavor.oddGrowth) growth += Math.random() > 0.5 ? 1 : -1;
  growth = Math.max(0, Math.round(growth * growthMod));
  state.growthQueue += growth;

  const multiplier = 1 + state.upgrades['score-mult'] * 0.22 + state.combo * 0.12;
  state.score += Math.max(1, Math.floor(def.score * multiplier * state.riskMult));
  state.foodsThisWave += 1;

  if (food.type === 'shield') state.upgrades['shield-segment'] = Math.max(state.upgrades['shield-segment'], 1);
  if (food.type === 'multiplier') state.combo += 1;
  if (food.type === 'poison') state.growthQueue = Math.max(0, state.growthQueue - 2);
  if (food.type === 'golden') {
    if (state.boss) state.boss.hp -= 9 + state.upgrades['score-mult'] * 2;
    state.combo += 2;
  }

  if (food.type === 'explosive') {
    state.flash = Math.max(state.flash, 0.6);
    state.shake = Math.max(state.shake, 10);
    if (state.boss) state.boss.hp -= 6;
    state.hazards.drones = state.hazards.drones.filter((d, i) => i % 2 === 0);
  }

  if (state.upgrades['ghost-phase'] > 0 && food.type === 'multiplier') {
    state.growthQueue += 1;
  }

  cue('snake-run-food', makeTone(780, 1240, 0.06, 'triangle', 0.042));
  pulseHudElement(state.scoreEl, 'pulse', 120);
  if (state.score > state.best) {
    state.best = state.score;
    ArcadeSync.setHighScore(GAME_ID, state.best);
  }
}

function checkHeadCollision(state, nextHead) {
  const ghostCharges = state.upgrades['ghost-phase'];
  if (isCellBlocked(state, nextHead.x, nextHead.y, true)) {
    if (ghostCharges > 0) {
      state.upgrades['ghost-phase'] = Math.max(0, ghostCharges - 1);
      cue('snake-run-ghost', makeTone(420, 220, 0.14, 'sine', 0.04));
      return false;
    }
    const shield = state.upgrades['shield-segment'];
    if (shield > 0) {
      state.upgrades['shield-segment'] = Math.max(0, shield - 1);
      state.flash = Math.max(state.flash, 0.6);
      state.shake = Math.max(state.shake, 8);
      return false;
    }
    return true;
  }

  for (let i = 0; i < state.snake.length - 1; i += 1) {
    const seg = state.snake[i];
    if (seg.x === nextHead.x && seg.y === nextHead.y) {
      if (ghostCharges > 0) {
        state.upgrades['ghost-phase'] = Math.max(0, ghostCharges - 1);
        return false;
      }
      return true;
    }
  }

  return false;
}

function snakeStep(state) {
  if (!state.running || state.paused || state.gameOver) return;

  maybeAssistTurn(state);

  state.prevSnake = state.snake.map((s) => ({ x: s.x, y: s.y }));
  state.dir = { x: state.nextDir.x, y: state.nextDir.y };

  const head = state.snake[0];
  const nextHead = { x: head.x + state.dir.x, y: head.y + state.dir.y };
  if (checkHeadCollision(state, nextHead)) {
    state.gameOver = true;
    state.running = false;
    return;
  }

  state.snake.unshift(nextHead);

  let ate = false;
  for (let i = state.foods.length - 1; i >= 0; i -= 1) {
    const food = state.foods[i];
    if (food.x === nextHead.x && food.y === nextHead.y) {
      ate = true;
      applyFoodEffect(state, food);
      state.foods.splice(i, 1);
      break;
    }
  }

  if (!ate && state.growthQueue <= 0) state.snake.pop();
  else if (state.growthQueue > 0) state.growthQueue -= 1;

  if (state.upgrades['split-snake'] > 0) {
    if (!state.cloneSnake.length) {
      state.cloneSnake = [
        { x: head.x, y: head.y },
        { x: head.x - state.dir.x, y: head.y - state.dir.y },
      ];
    }
    const cloneHead = state.cloneSnake[0];
    const jitter = Math.random() > 0.5 ? 1 : -1;
    const cloneDir = Math.random() > 0.5 ? state.dir : { x: state.dir.y * jitter, y: -state.dir.x * jitter };
    const candidate = { x: cloneHead.x + cloneDir.x, y: cloneHead.y + cloneDir.y };
    if (!isCellBlocked(state, candidate.x, candidate.y, true)) {
      state.cloneSnake.unshift(candidate);
      if (state.cloneSnake.length > 6) state.cloneSnake.pop();
    }
  }

  if (state.upgrades['magnet-food'] > 0) {
    for (const food of state.foods) {
      const dx = nextHead.x - food.x;
      const dy = nextHead.y - food.y;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > 0 && d <= 4) {
        food.x += Math.sign(dx);
        food.y += Math.sign(dy);
      }
    }
  }

  if (!state.foods.length || state.foods.length < 4) spawnFood(state);

  if (!state.boss && state.foodsThisWave >= state.waveFoodTarget) clearWave(state);
}

function updateThreats(state, dt) {
  const head = state.snake[0] || { x: 0, y: 0 };

  for (const h of state.hazards.hunterSnakes) {
    h.timer += dt;
    if (h.timer < h.step) continue;
    h.timer = 0;
    const hs = h.segments[0];
    const dx = head.x - hs.x;
    const dy = head.y - hs.y;
    const axisX = Math.abs(dx) > Math.abs(dy);
    const next = axisX
      ? { x: hs.x + Math.sign(dx), y: hs.y }
      : { x: hs.x, y: hs.y + Math.sign(dy) };
    if (!isCellBlocked(state, next.x, next.y, true)) {
      h.segments.unshift(next);
      if (h.segments.length > 4) h.segments.pop();
    }
    if (next.x === head.x && next.y === head.y) {
      state.flash = Math.max(state.flash, 0.8);
      state.shake = Math.max(state.shake, 9);
      if (state.upgrades['shield-segment'] > 0) state.upgrades['shield-segment'] -= 1;
      else if (state.upgrades['ghost-phase'] > 0) state.upgrades['ghost-phase'] -= 1;
      else state.gameOver = true;
      cue('snake-run-hit', makeTone(190, 90, 0.12, 'sawtooth', 0.06));
    }
  }

  for (const d of state.hazards.drones) {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.x < CELL || d.x > (GRID_COLS - 1) * CELL) d.vx *= -1;
    if (d.y < CELL || d.y > (GRID_ROWS - 1) * CELL) d.vy *= -1;
    const hp = tileToWorld(head.x, head.y);
    if (Math.hypot(d.x - hp.x, d.y - hp.y) < d.r + CELL * 0.28) {
      state.flash = Math.max(state.flash, 0.7);
      state.shake = Math.max(state.shake, 8);
      if (state.upgrades['shield-segment'] > 0) state.upgrades['shield-segment'] -= 1;
      else state.gameOver = true;
    }
  }

  for (const orb of state.hazards.chasingOrbs) {
    const hp = tileToWorld(head.x, head.y);
    const dx = hp.x - orb.x;
    const dy = hp.y - orb.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const aggro = 1 + getBossAggressionMult(state.director) * 0.2;
    orb.x += (dx / len) * orb.speed * aggro * dt;
    orb.y += (dy / len) * orb.speed * aggro * dt;
    if (len < orb.r + CELL * 0.2) {
      state.flash = Math.max(state.flash, 0.75);
      state.shake = Math.max(state.shake, 10);
      if (state.upgrades['ghost-phase'] > 0) state.upgrades['ghost-phase'] -= 1;
      else state.gameOver = true;
    }
  }

  for (const t of state.hazards.trapTiles) {
    t.ttl -= dt;
    if (t.x === head.x && t.y === head.y) {
      state.flash = Math.max(state.flash, 0.6);
      if (state.upgrades['shield-segment'] > 0) state.upgrades['shield-segment'] -= 1;
      else state.gameOver = true;
      t.ttl = 0;
    }
  }
  state.hazards.trapTiles = state.hazards.trapTiles.filter((t) => t.ttl > 0);

  for (const z of state.hazards.collapseZones) {
    z.timer -= dt;
    if (z.timer <= 0) {
      z.timer = 2.2 + Math.random() * 3;
      z.active = !z.active;
    }
  }

  for (const m of state.movingBlocks) {
    m.t += dt * m.speed;
    if (m.axis === 'x') m.x = m.ox + Math.sin(m.t) * m.amp;
    else m.y = m.oy + Math.cos(m.t) * m.amp;
  }

  for (const r of state.rotatingHazards) {
    r.angle += dt * r.speed;
    const hx = Math.round(r.cx + Math.cos(r.angle) * r.radius);
    const hy = Math.round(r.cy + Math.sin(r.angle) * r.radius);
    if (hx === head.x && hy === head.y) {
      state.flash = Math.max(state.flash, 0.65);
      state.shake = Math.max(state.shake, 8);
      if (state.upgrades['shield-segment'] > 0) state.upgrades['shield-segment'] -= 1;
      else state.gameOver = true;
    }
  }
}

function updateBoss(state, dt) {
  if (!state.boss) return;
  const boss = state.boss;
  boss.timer += dt;

  const ratio = boss.hp / Math.max(1, boss.maxHp);
  const phase = ratio > 0.66 ? 1 : (ratio > 0.33 ? 2 : 3);
  if (phase !== boss.phase) {
    boss.phase = phase;
    setTransientBanner(state.warningBanner, 'Boss phase ' + phase, '#ff6e6e', 1.8);
    cue('snake-run-boss-phase', makeTone(220, 140, 0.16, 'sawtooth', 0.05));
  }

  const head = state.snake[0] || { x: 0, y: 0 };
  if (boss.type === 'mega-serpent') {
    boss.x = lerp(boss.x, head.x, dt * (0.7 + phase * 0.25));
    boss.y = lerp(boss.y, head.y, dt * (0.4 + phase * 0.2));
    if (Math.abs(boss.x - head.x) < 1 && Math.abs(boss.y - head.y) < 1) state.gameOver = true;
  } else if (boss.type === 'grid-crusher') {
    state.arenaTargetInset = Math.min(9, state.arenaTargetInset + dt * (0.3 + phase * 0.18));
    if (Math.random() < dt * (0.4 + phase * 0.3)) state.hazards.collapseZones.push({ x: Math.floor(rand(2, GRID_COLS - 2)), y: Math.floor(rand(2, GRID_ROWS - 2)), timer: 1.6, active: true });
  } else if (boss.type === 'orb-core') {
    boss.summon -= dt;
    if (boss.summon <= 0) {
      boss.summon = 3.6 - phase * 0.7;
      state.hazards.chasingOrbs.push({ x: rand(CELL, (GRID_COLS - 1) * CELL), y: rand(CELL, (GRID_ROWS - 1) * CELL), r: 10 + phase * 2, speed: 80 + phase * 24 });
      state.hazards.drones.push({ x: rand(CELL, (GRID_COLS - 1) * CELL), y: rand(CELL, (GRID_ROWS - 1) * CELL), vx: rand(-120, 120), vy: rand(-120, 120), r: 9 + phase * 2 });
    }
  } else if (boss.type === 'phantom-snake') {
    if (boss.timer > 2.6 - phase * 0.45) {
      boss.timer = 0;
      boss.x = Math.floor(rand(2, GRID_COLS - 2));
      boss.y = Math.floor(rand(2, GRID_ROWS - 2));
      state.flash = Math.max(state.flash, 0.5);
      if (Math.abs(boss.x - head.x) <= 1 && Math.abs(boss.y - head.y) <= 1) state.gameOver = true;
    }
  }

  boss.hp -= dt * (0.35 + state.wave * 0.02);

  if (boss.hp <= 0) {
    state.score += (650 + state.wave * 30) * (1 + state.upgrades['score-mult'] * 0.15);
    state.runStats.bossesDefeated += 1;
    state.boss = null;
    setTransientBanner(state.warningBanner, 'Boss defeated', '#8cffbc', 2.2);
    cue('snake-run-boss-down', makeTone(340, 1000, 0.18, 'triangle', 0.055));
    clearWave(state);
  }
}

function updateSim(state, dt) {
  if (!state.running || state.paused || state.gameOver) return;

  state.elapsed += dt;
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer <= 0) state.combo = Math.max(0, state.combo - dt * 2);
  state.flash = Math.max(0, state.flash - dt * 1.7);
  state.shake = Math.max(0, state.shake - dt * 25);
  if (state.warningBanner.value) {
    state.warningBanner.value.timer -= dt;
    if (state.warningBanner.value.timer <= 0) state.warningBanner.value = null;
  }

  updateEventsAndDirector(state, dt);

  state.arenaInset = lerp(state.arenaInset, state.arenaTargetInset, dt * (0.9 + state.shrinkingRate));
  state.arenaInset = clamp(state.arenaInset, 0, 9);

  const stepMsBase = 0.145 - state.upgrades['speed-control'] * 0.009;
  const surge = state.eventState.id === 'speed-surge' ? 0.72 : 1;
  const moveStep = clamp(stepMsBase * surge, 0.055, 0.16);
  state.moveAccumulator += dt;

  while (state.moveAccumulator >= moveStep) {
    state.moveAccumulator -= moveStep;
    snakeStep(state);
    if (state.gameOver) break;
  }
  state.moveProgress = clamp(state.moveAccumulator / Math.max(0.0001, moveStep), 0, 1);

  state.turnEase = clamp(state.turnEase + dt * 6, 0, 1);
  const angleDelta = Math.atan2(Math.sin(state.targetHeadingAngle - state.headingAngle), Math.cos(state.targetHeadingAngle - state.headingAngle));
  state.headingAngle += angleDelta * clamp(dt * 8, 0, 1);

  updateThreats(state, dt);
  updateBoss(state, dt);

  if (state.phase === 'upgrade' || state.phase === 'risk') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      if (state.phase === 'upgrade') applyUpgradeChoice(state, 0);
      else if (state.phase === 'risk') applyRiskChoice(state, 0);
    }
  }

  updateHud(state);
}

function renderWorld(state) {
  const ctx = state.ctx;
  if (!ctx) return;

  const dpr = state.view.dpr || 1;
  const w = state.canvas.width;
  const h = state.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#070a14';
  ctx.fillRect(0, 0, state.view.width, state.view.height);

  const head = state.snake[0] || { x: GRID_COLS * 0.5, y: GRID_ROWS * 0.5 };
  const hc = tileToWorld(head.x, head.y);
  state.camera.x = lerp(state.camera.x, hc.x, 0.12);
  state.camera.y = lerp(state.camera.y, hc.y, 0.12);

  const camX = clamp(state.camera.x - WORLD_W * 0.5, 0, Math.max(0, GRID_COLS * CELL - WORLD_W));
  const camY = clamp(state.camera.y - WORLD_H * 0.5, 0, Math.max(0, GRID_ROWS * CELL - WORLD_H));

  const shakeX = (Math.random() - 0.5) * state.shake;
  const shakeY = (Math.random() - 0.5) * state.shake;

  ctx.save();
  const viewScale = state.view.scale;
  ctx.translate((state.view.width - WORLD_W * viewScale) * 0.5, (state.view.height - WORLD_H * viewScale) * 0.5);
  ctx.scale(viewScale, viewScale);
  ctx.translate(-camX + shakeX, -camY + shakeY);

  const tint = clamp((state.director.intensity || 0) / 100, 0, 1);
  const bg = ctx.createLinearGradient(0, 0, WORLD_W, WORLD_H);
  bg.addColorStop(0, 'rgba(10,18,34,1)');
  bg.addColorStop(1, 'rgba(' + Math.floor(16 + tint * 38) + ',7,22,1)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, GRID_COLS * CELL, GRID_ROWS * CELL);

  if (state.flash > 0) {
    ctx.fillStyle = 'rgba(255,96,96,' + (state.flash * 0.35).toFixed(3) + ')';
    ctx.fillRect(0, 0, GRID_COLS * CELL, GRID_ROWS * CELL);
  }

  ctx.strokeStyle = 'rgba(64,220,255,0.12)';
  for (let x = 0; x <= GRID_COLS; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, GRID_ROWS * CELL);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID_ROWS; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(GRID_COLS * CELL, y * CELL);
    ctx.stroke();
  }

  const arena = arenaBounds(state);
  ctx.strokeStyle = 'rgba(255,220,120,0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(arena.x * CELL, arena.y * CELL, arena.w * CELL, arena.h * CELL);

  for (const wv of state.walls) {
    ctx.fillStyle = 'rgba(120,155,190,0.9)';
    ctx.fillRect(wv.x * CELL + 3, wv.y * CELL + 3, CELL - 6, CELL - 6);
  }

  for (const m of state.movingBlocks) {
    ctx.fillStyle = 'rgba(246,144,92,0.95)';
    ctx.fillRect(Math.round(m.x) * CELL + 5, Math.round(m.y) * CELL + 5, CELL - 10, CELL - 10);
  }

  for (const r of state.rotatingHazards) {
    const hx = r.cx + Math.cos(r.angle) * r.radius;
    const hy = r.cy + Math.sin(r.angle) * r.radius;
    ctx.fillStyle = 'rgba(255,74,136,0.96)';
    ctx.beginPath();
    ctx.arc(hx * CELL + CELL * 0.5, hy * CELL + CELL * 0.5, CELL * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const t of state.hazards.trapTiles) {
    ctx.fillStyle = 'rgba(255,64,64,0.5)';
    ctx.fillRect(t.x * CELL + 8, t.y * CELL + 8, CELL - 16, CELL - 16);
  }

  for (const z of state.hazards.collapseZones) {
    if (!z.active) continue;
    ctx.fillStyle = 'rgba(255,190,80,0.4)';
    ctx.fillRect(z.x * CELL + 2, z.y * CELL + 2, CELL - 4, CELL - 4);
  }

  for (const food of state.foods) {
    const d = FOOD_DEFS[food.type] || FOOD_DEFS.normal;
    const p = 0.65 + Math.sin(state.elapsed * 7 + food.pulse) * 0.2;
    const cx = food.x * CELL + CELL * 0.5;
    const cy = food.y * CELL + CELL * 0.5;
    ctx.fillStyle = d.color;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.38 * p, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const hsn of state.hazards.hunterSnakes) {
    for (let i = hsn.segments.length - 1; i >= 0; i -= 1) {
      const seg = hsn.segments[i];
      ctx.fillStyle = i === 0 ? '#ff7b7b' : '#c35b5b';
      ctx.fillRect(seg.x * CELL + 6, seg.y * CELL + 6, CELL - 12, CELL - 12);
    }
  }

  for (const d of state.hazards.drones) {
    ctx.fillStyle = 'rgba(145,215,255,0.95)';
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const orb of state.hazards.chasingOrbs) {
    ctx.fillStyle = 'rgba(255,116,233,0.95)';
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const alpha = state.moveProgress;
  for (let i = state.snake.length - 1; i >= 0; i -= 1) {
    const cur = state.snake[i];
    const prev = state.prevSnake[i] || cur;
    const x = lerp(prev.x, cur.x, alpha);
    const y = lerp(prev.y, cur.y, alpha);
    const ratio = i / Math.max(1, state.snake.length - 1);
    ctx.fillStyle = i === 0 ? '#6ff8ff' : 'hsl(' + Math.floor(182 + ratio * 110) + ' 95% 58%)';
    ctx.shadowColor = 'rgba(94,255,255,0.7)';
    ctx.shadowBlur = i === 0 ? 18 : 8;
    ctx.beginPath();
    ctx.arc(x * CELL + CELL * 0.5, y * CELL + CELL * 0.5, CELL * (i === 0 ? 0.32 : 0.28), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  if (state.cloneSnake.length) {
    for (const seg of state.cloneSnake) {
      ctx.fillStyle = 'rgba(160,136,255,0.75)';
      ctx.beginPath();
      ctx.arc(seg.x * CELL + CELL * 0.5, seg.y * CELL + CELL * 0.5, CELL * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (state.boss) {
    const boss = state.boss;
    const bx = boss.x * CELL;
    const by = boss.y * CELL;
    const bw = CELL * 1.2;
    const bh = CELL * 1.2;
    ctx.fillStyle = boss.phase === 1 ? '#ff7961' : (boss.phase === 2 ? '#ff5252' : '#ff2f80');
    ctx.fillRect(bx - bw * 0.5, by - bh * 0.5, bw, bh);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(bx - 40, by - 58, 80, 10);
    ctx.fillStyle = '#8cffb0';
    ctx.fillRect(bx - 39, by - 57, 78 * clamp(boss.hp / boss.maxHp, 0, 1), 8);
  }

  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '600 13px system-ui';
  ctx.fillText('Wave ' + state.wave + (state.boss ? '  BOSS' : ''), 16, 22);
  ctx.fillText('Foods ' + state.foodsThisWave + '/' + state.waveFoodTarget, 16, 40);

  if (state.warningBanner.value) {
    const b = state.warningBanner.value;
    ctx.globalAlpha = clamp(b.timer / Math.max(0.1, b.maxTimer), 0, 1);
    ctx.fillStyle = b.color || '#f7c948';
    ctx.font = '700 24px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(b.text, state.view.width * 0.5, 36);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  if (!state.running || state.paused || state.gameOver || state.phase !== 'combat') {
    ctx.fillStyle = 'rgba(2,4,10,0.56)';
    ctx.fillRect(0, 0, state.view.width, state.view.height);
    ctx.fillStyle = '#8bf9ff';
    ctx.textAlign = 'center';
    ctx.font = '700 38px system-ui';

    if (state.gameOver) {
      ctx.fillText('Signal Lost', state.view.width * 0.5, state.view.height * 0.48);
      ctx.font = '600 18px system-ui';
      ctx.fillStyle = '#ffd2d2';
      ctx.fillText('Press Start to reboot the run', state.view.width * 0.5, state.view.height * 0.54);
    } else if (state.phase === 'upgrade') {
      ctx.fillText('Choose Upgrade', state.view.width * 0.5, state.view.height * 0.4);
      ctx.font = '600 16px system-ui';
      ctx.fillStyle = '#f0f8ff';
      for (let i = 0; i < state.pendingUpgradeChoices.length; i += 1) {
        const c = state.pendingUpgradeChoices[i];
        ctx.fillText((i + 1) + '. ' + c.label + ' - ' + c.desc, state.view.width * 0.5, state.view.height * (0.5 + i * 0.05));
      }
    } else if (state.phase === 'risk') {
      ctx.fillText('Risk Choice', state.view.width * 0.5, state.view.height * 0.4);
      ctx.font = '600 16px system-ui';
      ctx.fillStyle = '#ffe3c2';
      for (let i = 0; i < state.riskChoices.length; i += 1) {
        const c = state.riskChoices[i];
        ctx.fillText((i === 0 ? 'Z' : 'X') + '. ' + (c.label || c.id), state.view.width * 0.5, state.view.height * (0.5 + i * 0.06));
      }
    } else {
      ctx.fillText('Ready', state.view.width * 0.5, state.view.height * 0.48);
      ctx.font = '600 18px system-ui';
      ctx.fillStyle = '#d2eaff';
      ctx.fillText('Press Start and survive pressure waves', state.view.width * 0.5, state.view.height * 0.54);
    }
    ctx.textAlign = 'left';
  }

  ctx.restore();
}

function adapterInit(context) {
  const state = context.state;
  if (!state.canvas || !state.ctx) return;
  state.best = ArcadeSync.getHighScore(GAME_ID);
  updateHud(state);
  registerResize(state);
  resetRun(state);
  state.running = false;
}

function adapterUpdate(context, dt) {
  const state = context.state;
  if (!state.canvas || !state.ctx) return;

  state.fixedAccumulator += Math.min(0.12, dt);
  while (state.fixedAccumulator >= FIXED_STEP) {
    updateSim(state, FIXED_STEP);
    state.fixedAccumulator -= FIXED_STEP;
    if (state.gameOver) break;
  }

  if (state.gameOver && !state.submitted) {
    state.submitted = true;
    stopAllSounds();
    cue('snake-run-down', makeTone(160, 80, 0.22, 'triangle', 0.055));

    ArcadeSync.setHighScore(GAME_ID, Math.max(state.best, Math.floor(state.score)));
    state.best = ArcadeSync.getHighScore(GAME_ID);

    const run = {
      score: Math.floor(state.score),
      wave: state.wave,
      bossesDefeated: state.runStats.bossesDefeated,
      highestIntensity: state.runStats.highestIntensity,
      upgradeCount: Object.values(state.upgrades).reduce((acc, v) => acc + (v || 0), 0),
      survival: state.elapsed,
    };
    state.metaLast = {
      runSummary: buildRunSummary(run),
      personal: recordRunStats(run),
      milestones: checkMilestones(run),
    };

    submitScore(ArcadeSync.getPlayer(), Math.floor(state.score), GAME_ID);
    if (window.showGameOverModal) window.showGameOverModal(Math.floor(state.score), state.metaLast && state.metaLast.runSummary ? state.metaLast.runSummary : undefined);
  }
}

function adapterRender(context) {
  renderWorld(context.state);
}

function adapterInput(context, event) {
  const state = context.state;
  const key = String(event.key || '');
  if (key === 'ArrowUp' || key === 'w' || key === 'W') { event.preventDefault(); handleDirectionInput(state, 0, -1); }
  if (key === 'ArrowDown' || key === 's' || key === 'S') { event.preventDefault(); handleDirectionInput(state, 0, 1); }
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') { event.preventDefault(); handleDirectionInput(state, -1, 0); }
  if (key === 'ArrowRight' || key === 'd' || key === 'D') { event.preventDefault(); handleDirectionInput(state, 1, 0); }

  if (state.phase === 'upgrade') {
    if (key === '1') applyUpgradeChoice(state, 0);
    if (key === '2') applyUpgradeChoice(state, 1);
    if (key === '3') applyUpgradeChoice(state, 2);
  }
  if (state.phase === 'risk') {
    if (key === 'z' || key === 'Z') applyRiskChoice(state, 0);
    if (key === 'x' || key === 'X') applyRiskChoice(state, 1);
  }

  if (key === 'p' || key === 'P') {
    state.paused = !state.paused;
    if (state.paused) stopAllSounds();
  }
}

function adapterGameOver(context) {
  context.state.gameOver = true;
}

export const SNAKE_RUN_ADAPTER = createGameAdapter({
  id: 'snake-run',
  name: 'Snake Run',
  init: function (ctx) { return adapterInit(ctx); },
  update: function (ctx, dt) { return adapterUpdate(ctx, dt); },
  render: function (ctx) { return adapterRender(ctx); },
  onInput: function (ctx, e) { return adapterInput(ctx, e); },
  onGameOver: function (ctx) { return adapterGameOver(ctx); },
  systems: SYSTEM_FLAGS,
});

registerGameAdapter(SNAKE_RUN_CONFIG, SNAKE_RUN_ADAPTER, bootstrapSnakeRun);

export function bootstrapSnakeRun(root) {
  const state = createState(root);
  const context = { root: root, adapter: SNAKE_RUN_ADAPTER, state: state, systems: {}, engine: null };

  const engine = new BaseGame({
    context: context,
    systems: resolveSystems(SNAKE_RUN_ADAPTER.systems),
    init: function () { return adapterInit(context); },
    update: function (dt) { return adapterUpdate(context, dt); },
    render: function () { return adapterRender(context); },
    gameOver: function () { return adapterGameOver(context); },
    input: function (event) { return adapterInput(context, event); },
  });
  context.engine = engine;

  const lifecycle = {
    init: async function () {
      await engine.init();
      engine.attachInput();
      wireButtons(state, lifecycle);
      renderWorld(state);
    },
    start: function () {
      if (state.gameOver || !state.running) resetRun(state);
      state.running = true;
      state.paused = false;
      engine.startLoop();
      renderWorld(state);
    },
    pause: function () {
      if (!state.running) return;
      state.paused = true;
      engine.stopLoop();
      stopAllSounds();
      renderWorld(state);
    },
    resume: function () {
      if (!state.running) return;
      state.paused = false;
      engine.startLoop();
    },
    reset: function () {
      state.paused = false;
      resetRun(state);
      renderWorld(state);
    },
    destroy: function () {
      stopAllSounds();
      clearButtons(state);
      unregisterResize(state);
      engine.destroy();
    },
    getScore: function () { return Math.floor(state.score || 0); },
  };

  return lifecycle;
}

function wireButtons(state, lifecycle) {
  clearButtons(state);
  if (state.startBtn) state.startBtn.onclick = function () { lifecycle.start(); };
  if (state.pauseBtn) {
    state.pauseBtn.onclick = function () {
      if (!state.running) return;
      if (state.paused) lifecycle.resume();
      else lifecycle.pause();
    };
  }
  if (state.resetBtn) state.resetBtn.onclick = function () { lifecycle.reset(); };
}

function clearButtons(state) {
  if (state.startBtn) state.startBtn.onclick = null;
  if (state.pauseBtn) state.pauseBtn.onclick = null;
  if (state.resetBtn) state.resetBtn.onclick = null;
}
