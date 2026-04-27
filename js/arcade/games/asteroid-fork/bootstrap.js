import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { ASTEROID_FORK_CONFIG } from './config.js';
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
import {
  makeUpgrades,
  pickUpgradeChoicesWithRarity,
  applyUpgrade,
  getUpgradedShootRate,
  getSpreadAngles,
  shouldOfferRiskReward,
  pickRiskRewardChoices,
} from '/js/arcade/systems/upgrade-system.js';
import {
  createScalingDirector,
  tickDirector,
  pickWaveModifier,
  checkForcedChaos,
  getBossAggressionMult,
} from '/js/arcade/systems/director-system.js';
import {
  shouldFirePressureEvent,
  pickSurpriseEvent,
  getEventTier,
  updateIntensity,
} from '/js/arcade/systems/event-system.js';
import { applyMutations } from '/js/arcade/systems/mutation-system.js';
import { pickBossArchetype, spawnBossArchetype } from '/js/arcade/systems/boss-system.js';
import { buildRunSummary, recordRunStats, checkMilestones, getDailyVariation } from '/js/arcade/systems/meta-system.js';
import { pulseHudElement, setTransientBanner } from '/js/arcade/systems/feedback-system.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';

const GAME_ID = 'asteroids';
const WORLD_W = 1280;
const WORLD_H = 720;
const BASE_FIRE_RATE = 0.21;
const BASE_BULLET_SPEED = 760;
const BASE_THRUST = 460;
const BASE_TURN_SPEED = 3.3;
const BASE_ASTEROID_DENSITY = 5;
const BASE_ENEMY_FREQ = 0.75;

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

const ASTEROID_TYPE_DEFS = {
  basic: { hp: 1, speed: 110, mass: 1.0, score: 35, color: '#a4b0c0' },
  shard: { hp: 1, speed: 190, mass: 0.65, score: 45, color: '#6be4ff' },
  heavy: { hp: 2, speed: 80, mass: 1.8, score: 70, color: '#9e9aa8' },
  cluster: { hp: 1, speed: 100, mass: 1.05, score: 60, color: '#d9a4ff' },
  explosive: { hp: 1, speed: 125, mass: 0.95, score: 75, color: '#ff8d5a' },
  magnetic: { hp: 1, speed: 95, mass: 1.2, score: 80, color: '#7bc4ff' },
  crystal: { hp: 1, speed: 105, mass: 1.0, score: 90, color: '#8cffd5' },
  cursed: { hp: 1, speed: 115, mass: 1.0, score: 95, color: '#ff64ca' },
};

const ENEMY_TYPE_DEFS = {
  hunter: { hp: 2, speed: 145, fireRate: 1.15, radius: 18, color: '#ff595e' },
  sniper: { hp: 2, speed: 100, fireRate: 2.0, radius: 17, color: '#ffd166' },
  swarm: { hp: 1, speed: 175, fireRate: 1.7, radius: 12, color: '#7df9ff' },
  bomber: { hp: 3, speed: 90, fireRate: 2.6, radius: 20, color: '#ff924c' },
  cloaked: { hp: 2, speed: 130, fireRate: 1.9, radius: 16, color: '#b98cff' },
};

const BOSS_ROTATION = [
  { id: 'titan-rock', name: 'Titan Rock', color: '#8b8f99' },
  { id: 'drone-carrier', name: 'Drone Carrier', color: '#ff9f43' },
  { id: 'laser-core', name: 'Laser Core', color: '#ff4d6d' },
  { id: 'gravity-well', name: 'Gravity Well', color: '#6fa8ff' },
  { id: 'chaos-engine', name: 'Chaos Engine', color: '#bb6bff' },
];

const EVENT_MAP = {
  ambushDrop: 'rogue-ships',
  rogueMini: 'rogue-ships',
  laserSweep: 'time-distortion',
  meteorShower: 'meteor-storm',
  empBlast: 'emp',
  droneHijack: 'rogue-ships',
  goldenInvader: 'golden-asteroid',
  cursedInvader: 'gravity-shift',
  supplyCrate: 'golden-asteroid',
  panicMode: 'time-distortion',
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
  upgrade: true,
  event: true,
  mutation: true,
  boss: true,
};

const PHASE_COMBAT = 'combat';
const PHASE_UPGRADE = 'upgrade';
const PHASE_RISK = 'risk';

function detectQaMode() {
  try {
    const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const fromQuery = search ? search.get('afqa') === '1' : false;
    const fromStorage = typeof localStorage !== 'undefined' && localStorage.getItem('asteroidForkQa') === '1';
    return !!(fromQuery || fromStorage);
  } catch (_) {
    return false;
  }
}

function createQaStats() {
  return {
    highestWave: 0,
    upgradesOffered: 0,
    upgradesApplied: 0,
    upgradeIdsApplied: [],
    risksOffered: 0,
    risksApplied: 0,
    riskIdsApplied: [],
    pressureEvents: 0,
    chaosEvents: 0,
    enemyTypesSeen: {},
    bossWaves: [],
    bossPhaseChanges: 0,
  };
}

function syncQaProbe(state) {
  if (!state.qaEnabled || typeof window === 'undefined') return;
  const qa = state.qaStats || createQaStats();
  state.qaStats = qa;
  qa.highestWave = Math.max(qa.highestWave || 0, state.wave || 0);
  window.__asteroidForkQaControl = {
    forceProgress: function () { forceProgressWave(state); },
    pickUpgrade: function (index) { applyUpgradeChoice(state, Number(index) || 0); },
    pickRisk: function (index) { applyRiskChoice(state, Number(index) || 0); },
    forceGameOver: function () {
      state.lives = 0;
      state.gameOver = true;
      handleGameOverIfNeeded({ state: state });
    },
  };
  window.__asteroidForkQa = {
    wave: state.wave || 0,
    highestWave: qa.highestWave || 0,
    phase: state.phase || PHASE_COMBAT,
    pressure: Math.round((state.director && state.director.pressure) || 0),
    intensity: Math.round((state.director && state.director.intensity) || 0),
    upgradesOffered: qa.upgradesOffered || 0,
    upgradesApplied: qa.upgradesApplied || 0,
    upgradeIdsApplied: (qa.upgradeIdsApplied || []).slice(),
    risksOffered: qa.risksOffered || 0,
    risksApplied: qa.risksApplied || 0,
    riskIdsApplied: (qa.riskIdsApplied || []).slice(),
    pressureEvents: qa.pressureEvents || 0,
    chaosEvents: qa.chaosEvents || 0,
    enemyTypesSeen: Object.assign({}, qa.enemyTypesSeen || {}),
    bossWaves: (qa.bossWaves || []).slice(),
    bossPhaseChanges: qa.bossPhaseChanges || 0,
    activeBosses: state.bosses ? state.bosses.length : 0,
    activeAsteroids: state.asteroids ? state.asteroids.length : 0,
    activeEnemies: state.enemies ? state.enemies.length : 0,
    activeBullets: state.bullets ? state.bullets.length : 0,
    running: !!state.running,
    paused: !!state.paused,
    qaAutoProgress: !!state.qaAutoProgress,
    shipX: state.ship ? Number(state.ship.x) : null,
    shipY: state.ship ? Number(state.ship.y) : null,
    shipAngle: state.ship ? Number(state.ship.angle) : null,
    shipVx: state.ship ? Number(state.ship.vx) : null,
    shipVy: state.ship ? Number(state.ship.vy) : null,
    gameOver: !!state.gameOver,
  };
}

function resolveSystems(flags) {
  const result = {};
  for (const [rawName, enabled] of Object.entries(flags || {})) {
    if (!enabled) continue;
    const name = SYSTEM_ALIASES[rawName] || rawName;
    const factory = SYSTEM_FACTORIES[name];
    if (typeof factory === 'function') result[name] = factory;
  }
  return result;
}

function randomRange(min, max) { return min + Math.random() * (max - min); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function wrap(value, max) { return ((value % max) + max) % max; }
function len(x, y) { return Math.hypot(x, y); }
function angleTo(dx, dy) { return Math.atan2(dy, dx); }
function playCue(id, spec) { if (!isMuted()) playSound(id, spec); }

function createState(root) {
  const canvas = document.getElementById('astCanvas');
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const waveEl = document.getElementById('wave');
  const livesEl = document.getElementById('lives');

  const stars = [];
  for (let i = 0; i < 140; i += 1) stars.push({ x: Math.random() * WORLD_W, y: Math.random() * WORLD_H, z: Math.random() });

  return {
    root, canvas, ctx, scoreEl, bestEl, waveEl, livesEl, stars,
    best: ArcadeSync.getHighScore(GAME_ID),
    score: 0, wave: 0, lives: 3, running: false, paused: false, gameOver: false, submitted: false, elapsed: 0,
    worldW: WORLD_W, worldH: WORLD_H, dpr: 1,
    ship: null, bullets: [], enemyBullets: [], asteroids: [], enemies: [], bosses: [], particles: [], debris: [],
    upgrades: makeUpgrades(), director: createScalingDirector(), dailyVariation: getDailyVariation(), runStats: { bossesDefeated: 0, highestIntensity: 0 },
    modifier: null, modifierData: {}, activeEvent: null, warningBanner: { value: null },
    enemyBuffTimer: 0, gravityShiftTimer: 0, timeDistortionTimer: 0, empTimer: 0, screenPulse: 0, screenTint: 0, shakeTime: 0, shakePower: 0,
    shootCd: 0, bombCd: 0, thrustSoundCd: 0, uiHandlers: null, resizeHandler: null, fsHandler: null, _droneCd: 0,
    phase: PHASE_COMBAT,
    phaseTimer: 0,
    upgradeChoices: [],
    riskChoices: [],
    pendingRisk: null,
    currentWaveRisk: null,
    waveStartElapsed: 0,
    qaEnabled: detectQaMode(),
    qaAutoProgress: detectQaMode(),
    qaWaveTimer: 0,
    qaStats: createQaStats(),
  };
}

function makeShip(state) {
  return { x: state.worldW * 0.5, y: state.worldH * 0.5, vx: 0, vy: 0, angle: -Math.PI * 0.5, turnVelocity: 0, invuln: 0, shield: 0, thrusting: false };
}

function syncHud(state) {
  if (state.scoreEl) state.scoreEl.textContent = String(Math.floor(state.score));
  if (state.bestEl) state.bestEl.textContent = String(Math.floor(state.best));
  if (state.waveEl) state.waveEl.textContent = state.wave > 0 ? String(state.wave) : '-';
  if (state.livesEl) state.livesEl.textContent = String(state.lives);
}

function pulseHud(state, el, cls, ms) {
  pulseHudElement(el, cls, ms);
  state.screenPulse = Math.min(1, state.screenPulse + 0.25);
}

function cueBanner(state, text, color, seconds) {
  setTransientBanner(state.warningBanner, text, color, seconds || 1.6);
}

function applyFullscreenFit(state) {
  if (!state.canvas || !state.root) return;
  const overlay = document.getElementById('game-overlay');
  const overlayOpen = !!(overlay && overlay.classList.contains('active'));
  const card = state.root.closest('.game-card') || state.root;
  const stage = overlayOpen
    ? (overlay.querySelector('.game-stage') || overlay.querySelector('.game-card') || card)
    : card;

  const stageRect = stage.getBoundingClientRect();
  const hud = card.querySelector('.hud');
  const hudHeight = hud ? hud.getBoundingClientRect().height : 0;
  const ctrlBar = overlayOpen ? overlay.querySelector('#overlay-ctrl-bar') : null;
  const ctrlBarHeight = ctrlBar ? ctrlBar.getBoundingClientRect().height : 36;

  let availableW = Math.max(320, Math.floor(stageRect.width - 16));
  let availableH;
  if (overlayOpen) {
    const viewportH = window.innerHeight || stageRect.height;
    availableH = Math.max(220, Math.floor(viewportH - ctrlBarHeight - hudHeight - 30));
  } else {
    availableH = Math.max(240, Math.floor((window.innerHeight || stageRect.height) - 220));
  }

  const aspect = WORLD_W / WORLD_H;
  let targetW = availableW;
  let targetH = targetW / aspect;
  if (targetH > availableH) {
    targetH = availableH;
    targetW = targetH * aspect;
  }

  state.canvas.style.width = Math.floor(targetW) + 'px';
  state.canvas.style.height = Math.floor(targetH) + 'px';
  state.canvas.style.maxWidth = 'none';
  state.canvas.style.maxHeight = 'none';
  state.canvas.style.display = 'block';
  state.canvas.style.margin = '0 auto';
  state.canvas.style.aspectRatio = String(WORLD_W) + ' / ' + String(WORLD_H);

  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  state.dpr = dpr;
  state.canvas.width = Math.round(targetW * dpr);
  state.canvas.height = Math.round(targetH * dpr);
}

function registerResize(state) {
  if (state.resizeHandler) return;
  state.resizeHandler = function () { applyFullscreenFit(state); };
  state.fsHandler = function () { applyFullscreenFit(state); };
  window.addEventListener('resize', state.resizeHandler);
  document.addEventListener('fullscreenchange', state.fsHandler);
}

function unregisterResize(state) {
  if (!state.resizeHandler) return;
  window.removeEventListener('resize', state.resizeHandler);
  document.removeEventListener('fullscreenchange', state.fsHandler);
  state.resizeHandler = null;
  state.fsHandler = null;
}

function addParticle(state, x, y, vx, vy, life, size, color) {
  state.particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
  if (state.particles.length > 1200) state.particles.splice(0, state.particles.length - 1200);
}

function burst(state, x, y, color, amount, speed) {
  for (let i = 0; i < amount; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = randomRange(speed * 0.4, speed);
    addParticle(state, x, y, Math.cos(a) * s, Math.sin(a) * s, randomRange(0.22, 0.9), randomRange(1.5, 4.2), color);
  }
}

function computeGunStats(state) {
  const u = state.upgrades;
  return {
    fireRate: getUpgradedShootRate(BASE_FIRE_RATE, u),
    spread: getSpreadAngles(u, false),
    bulletSpeed: BASE_BULLET_SPEED * (1 + (u.bulletDmg || 0) * 0.15),
    thrustPower: BASE_THRUST * (1 + (u.scoreBoost || 0) * 0.08),
    rotationSpeed: BASE_TURN_SPEED * (1 + (u.fireRate || 0) * 0.1),
    shieldLayers: u.shieldStr || 0,
    hasDrone: (u.drone || 0) > 0,
    hasBomb: (u.bombShot || 0) > 0,
  };
}

function applyUpgradePickup(state) {
  const choices = pickUpgradeChoicesWithRarity(state.upgrades, state.wave);
  if (!choices.length) return;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  if (!pick || !pick.id || !applyUpgrade(pick.id, state.upgrades)) return;
  cueBanner(state, 'Upgrade: ' + pick.label, '#f7c948', 1.7);
  playCue('asteroid-fork-upgrade-pickup', {
    kind: 'chord',
    tones: [
      { type: 'sine', freqStart: 620, freqEnd: 980, duration: 0.08, volume: 0.035, delay: 0 },
      { type: 'triangle', freqStart: 820, freqEnd: 1280, duration: 0.1, volume: 0.028, delay: 0.04 },
    ],
  });
}

function openUpgradeChoicePhase(state) {
  const nextWave = state.wave + 1;
  const choices = pickUpgradeChoicesWithRarity(state.upgrades, nextWave).slice(0, 3);
  if (!choices.length) {
    state.phase = PHASE_COMBAT;
    return false;
  }
  state.upgradeChoices = choices;
  state.phase = PHASE_UPGRADE;
  state.phaseTimer = 12;
  if (state.qaStats) state.qaStats.upgradesOffered += 1;
  cueBanner(state, 'Choose Upgrade [1-3]', '#f7c948', 3.2);
  return true;
}

function applyUpgradeChoice(state, index) {
  const pick = state.upgradeChoices[index];
  if (!pick || !pick.id) return false;
  if (!applyUpgrade(pick.id, state.upgrades)) return false;
  cueBanner(state, 'Upgrade locked: ' + pick.label, '#f7c948', 1.7);
  playCue('asteroid-fork-upgrade-pickup', {
    kind: 'chord',
    tones: [
      { type: 'sine', freqStart: 620, freqEnd: 980, duration: 0.08, volume: 0.035, delay: 0 },
      { type: 'triangle', freqStart: 820, freqEnd: 1280, duration: 0.1, volume: 0.028, delay: 0.04 },
    ],
  });
  state.upgradeChoices = [];
  state.phase = PHASE_COMBAT;
  if (state.qaStats) {
    state.qaStats.upgradesApplied += 1;
    state.qaStats.upgradeIdsApplied.push(pick.id);
  }
  return true;
}

function openRiskChoicePhase(state) {
  const nextWave = state.wave + 1;
  if (!shouldOfferRiskReward(nextWave)) return false;
  const choices = pickRiskRewardChoices().slice(0, 2);
  if (!choices.length) return false;
  state.riskChoices = choices;
  state.phase = PHASE_RISK;
  state.phaseTimer = 10;
  if (state.qaStats) state.qaStats.risksOffered += 1;
  cueBanner(state, 'Choose Risk [1-2]', '#ff4fd1', 3);
  return true;
}

function applyRiskChoice(state, index) {
  const choice = state.riskChoices[index];
  if (!choice || !choice.id) return false;
  state.pendingRisk = choice;
  state.riskChoices = [];
  state.phase = PHASE_COMBAT;
  if (state.qaStats) {
    state.qaStats.risksApplied += 1;
    state.qaStats.riskIdsApplied.push(choice.id);
  }
  cueBanner(state, 'Risk Armed: ' + choice.label, '#ff4fd1', 2.2);
  return true;
}

function applyPendingRiskToWave(state) {
  state.currentWaveRisk = null;
  if (!state.pendingRisk) return;
  const risk = state.pendingRisk;
  state.pendingRisk = null;
  state.currentWaveRisk = risk;

  if (risk.id === 'oneLife') state.lives = 1;
  if (risk.id === 'blackoutWave') state.screenTint = Math.max(state.screenTint, 0.32);
  if (risk.id === 'noShield') state.ship.shield = 0;
  if (risk.id === 'skipWave') state.score += 240;
}

function chooseAsteroidType(wave) {
  const roll = Math.random();
  if (wave > 2 && roll < 0.16) return 'shard';
  if (wave > 3 && roll < 0.29) return 'heavy';
  if (wave > 4 && roll < 0.41) return 'cluster';
  if (wave > 5 && roll < 0.52) return 'explosive';
  if (wave > 6 && roll < 0.62) return 'magnetic';
  if (wave > 7 && roll < 0.72) return 'crystal';
  if (wave > 8 && roll < 0.82) return 'cursed';
  return 'basic';
}

function asteroidRadius(tier) {
  if (tier >= 3) return 54;
  if (tier === 2) return 32;
  return 18;
}

function createAsteroid(state, x, y, type, tier, mutations) {
  const def = ASTEROID_TYPE_DEFS[type] || ASTEROID_TYPE_DEFS.basic;
  const radius = asteroidRadius(tier);
  const speed = def.speed * (0.8 + Math.random() * 0.4) * (1 + state.wave * 0.03);
  const angle = Math.random() * Math.PI * 2;
  const points = [];
  const sides = Math.floor(randomRange(6, 11));
  for (let i = 0; i < sides; i += 1) points.push(radius * randomRange(0.65, 1.22));
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle: Math.random() * Math.PI * 2,
    spin: randomRange(-1.3, 1.3),
    radius, tier,
    hp: def.hp + (tier > 2 ? 1 : 0),
    mass: def.mass * (1 + tier * 0.2),
    type, points,
    mutations: Array.isArray(mutations) ? mutations.slice() : [],
    teleported: false,
  };
}

function createEnemy(state, type) {
  const def = ENEMY_TYPE_DEFS[type] || ENEMY_TYPE_DEFS.hunter;
  if (state.qaStats) {
    state.qaStats.enemyTypesSeen[type] = (state.qaStats.enemyTypesSeen[type] || 0) + 1;
  }
  const side = Math.random() < 0.5 ? -1 : 1;
  const y = randomRange(40, state.worldH - 40);
  const x = side < 0 ? state.worldW + 30 : -30;
  return {
    type, x, y,
    vx: side < 0 ? -def.speed : def.speed,
    vy: randomRange(-40, 40),
    hp: def.hp + Math.floor(state.wave * 0.08),
    radius: def.radius,
    fireCd: randomRange(0.2, def.fireRate),
    cloak: type === 'cloaked' ? 0.25 : 1,
    cloakDir: 1,
    swarmPhase: randomRange(0, Math.PI * 2),
    mutations: [],
  };
}

function applyMutationSetToEntities(entities, wave) {
  const temp = entities.map(function (_, index) { return { idx: index, mutations: [] }; });
  applyMutations(temp, wave);
  for (const carrier of temp) {
    const entity = entities[carrier.idx];
    if (!entity) continue;
    entity.mutations = (carrier.mutations || []).slice();
  }
}

function spawnWave(state) {
  const intensity = state.director.intensity || 0;
  const densityMult = 1 + intensity / 140;
  const asteroidCount = Math.floor((BASE_ASTEROID_DENSITY + state.wave * 1.35) * densityMult);
  state.asteroids.length = 0;
  for (let i = 0; i < asteroidCount; i += 1) {
    const x = Math.random() < 0.5 ? randomRange(-50, 0) : randomRange(state.worldW, state.worldW + 50);
    const y = randomRange(0, state.worldH);
    state.asteroids.push(createAsteroid(state, x, y, chooseAsteroidType(state.wave), 3, []));
  }

  const spawnEnemies = Math.random() < clamp(BASE_ENEMY_FREQ + state.wave * 0.018 + intensity / 170, 0.3, 0.95);
  state.enemies.length = 0;
  if (spawnEnemies) {
    const unlocked = ['hunter', 'sniper', 'swarm'];
    if (state.wave >= 4) unlocked.push('bomber');
    if (state.wave >= 6) unlocked.push('cloaked');
    const count = Math.max(1, Math.floor(1 + state.wave * 0.2 + intensity / 30));
    for (let i = 0; i < count; i += 1) {
      const forcedVariety = i < unlocked.length;
      const t = forcedVariety
        ? unlocked[i]
        : unlocked[Math.floor(Math.random() * unlocked.length)];
      state.enemies.push(createEnemy(state, t));
    }
  }
  applyMutationSetToEntities(state.asteroids, state.wave);
  applyMutationSetToEntities(state.enemies, state.wave);
}

function spawnBoss(state) {
  const phaseIndex = Math.max(0, Math.floor(state.wave / 5) - 1);
  const bossDef = BOSS_ROTATION[phaseIndex % BOSS_ROTATION.length];
  const globalArchetype = pickBossArchetype(state.wave, state.director);
  const base = spawnBossArchetype(globalArchetype, state.wave, state.worldW);
  state.bosses.length = 0;
  state.bosses.push({
    id: bossDef.id, name: bossDef.name, color: bossDef.color,
    x: base.x, y: 120, w: base.w + 30, h: base.h + 18,
    hp: Math.round(base.hp * 1.35), maxHp: Math.round(base.hp * 1.35), phase: 1,
    fireCd: 1.2, summonCd: 2.3, beamCd: 2.8, randomCd: 1.9, gravityRadius: 220,
  });
  if (state.qaStats) state.qaStats.bossWaves.push(state.wave);
  cueBanner(state, 'Boss Incoming: ' + bossDef.name, '#ff7f50', 2.6);
  state.shakeTime = 0.6;
  state.shakePower = 12;
  playCue('asteroid-fork-boss-intro', {
    kind: 'chord',
    tones: [
      { type: 'sawtooth', freqStart: 220, freqEnd: 150, duration: 0.24, volume: 0.06, delay: 0 },
      { type: 'triangle', freqStart: 420, freqEnd: 270, duration: 0.22, volume: 0.05, delay: 0.05 },
    ],
  });
}

function applyWaveModifier(state) {
  state.modifier = pickWaveModifier(state.wave, state.director);
  state.modifierData = {};
  if (!state.modifier || typeof state.modifier.apply !== 'function') return;
  state.modifier.apply({
    invaders: state.enemies,
    invBullets: state.enemyBullets,
    bullets: state.bullets,
    player: state.ship,
    wave: state.wave,
    elapsed: state.elapsed,
    W: state.worldW,
    H: state.worldH,
    modifierData: state.modifierData,
    asteroids: state.asteroids,
    miniEnemies: state.enemies,
    bunkers: [],
    addFloatingText: function (text) { cueBanner(state, text, '#f7c948', 1.2); },
    playSfx: function () {},
    spawnPowerupRain: function () { state.score += 120; cueBanner(state, 'Supply spike', '#8cffd5', 1); },
  });
}

function triggerEvent(state, eventDef, source) {
  const mapped = EVENT_MAP[eventDef.id] || 'rogue-ships';
  state.activeEvent = { id: mapped, timer: eventDef.duration || 6, duration: eventDef.duration || 6 };
  if (state.qaStats) {
    if (source === 'pressure') state.qaStats.pressureEvents += 1;
    else state.qaStats.chaosEvents += 1;
  }
  if (mapped === 'meteor-storm') {
    for (let i = 0; i < 8; i += 1) state.asteroids.push(createAsteroid(state, randomRange(0, state.worldW), -40 - i * 30, chooseAsteroidType(state.wave + 2), 2, []));
  }
  if (mapped === 'rogue-ships') state.enemies.push(createEnemy(state, 'hunter'), createEnemy(state, 'sniper'), createEnemy(state, 'swarm'));
  if (mapped === 'emp') state.empTimer = 5;
  if (mapped === 'gravity-shift') state.gravityShiftTimer = 6;
  if (mapped === 'time-distortion') state.timeDistortionTimer = 6;
  if (mapped === 'golden-asteroid') state.asteroids.push(createAsteroid(state, randomRange(0, state.worldW), -32, 'crystal', 3, []));
  cueBanner(state, eventDef.label || mapped.toUpperCase(), '#ffcf6e', 1.7);
  playCue('asteroid-fork-event-alert', { kind: 'tone', type: 'square', freqStart: 420, freqEnd: 640, duration: 0.1, volume: 0.04 });
}

function advanceWave(state) {
  state.wave += 1;
  applyPendingRiskToWave(state);
  spawnWave(state);
  if (state.currentWaveRisk && state.currentWaveRisk.id === 'doubleEnemies') {
    state.enemies.push(createEnemy(state, 'hunter'), createEnemy(state, 'sniper'), createEnemy(state, 'swarm'));
  }
  applyWaveModifier(state);
  if (state.wave % 5 === 0 || (state.currentWaveRisk && state.currentWaveRisk.id === 'earlyBoss')) spawnBoss(state);
  state.waveStartElapsed = state.elapsed;
  state.qaWaveTimer = 0;
  cueBanner(state, 'Wave ' + state.wave, '#f7c948', 1.35);
  syncHud(state);
}

function beginBetweenWaveChoices(state) {
  const openedUpgrade = openUpgradeChoicePhase(state);
  if (openedUpgrade) return;
  const openedRisk = openRiskChoicePhase(state);
  if (openedRisk) return;
  advanceWave(state);
}

function forceProgressWave(state) {
  if (state.phase === PHASE_UPGRADE) {
    if (!applyUpgradeChoice(state, 0)) state.phase = PHASE_COMBAT;
    if (state.phase === PHASE_COMBAT) {
      if (openRiskChoicePhase(state)) return;
      advanceWave(state);
    }
    return;
  }
  if (state.phase === PHASE_RISK) {
    if (!applyRiskChoice(state, 0)) state.phase = PHASE_COMBAT;
    if (state.phase === PHASE_COMBAT) advanceWave(state);
    return;
  }
  if (state.bosses.length) {
    for (const boss of state.bosses) {
      if (boss.phase === 1) boss.hp = Math.min(boss.hp, Math.ceil(boss.maxHp * 0.64));
      else if (boss.phase === 2) boss.hp = Math.min(boss.hp, Math.ceil(boss.maxHp * 0.31));
      else boss.hp = 0;
    }
    return;
  }
  state.asteroids.length = 0;
  state.enemies.length = 0;
  if (state.qaEnabled) {
    beginBetweenWaveChoices(state);
  }
}

function resetRun(state) {
  state.score = 0;
  state.wave = 0;
  state.lives = 3;
  state.running = true;
  state.paused = false;
  state.gameOver = false;
  state.submitted = false;
  state.elapsed = 0;
  state.ship = makeShip(state);
  state.bullets.length = 0;
  state.enemyBullets.length = 0;
  state.asteroids.length = 0;
  state.enemies.length = 0;
  state.bosses.length = 0;
  state.particles.length = 0;
  state.debris.length = 0;
  state.upgrades = makeUpgrades();
  state.director = createScalingDirector();
  state.runStats = { bossesDefeated: 0, highestIntensity: 0 };
  state.modifier = null;
  state.modifierData = {};
  state.activeEvent = null;
  state.enemyBuffTimer = 0;
  state.gravityShiftTimer = 0;
  state.timeDistortionTimer = 0;
  state.empTimer = 0;
  state.shootCd = 0;
  state.bombCd = 0;
  state.thrustSoundCd = 0;
  state.screenPulse = 0;
  state.screenTint = 0;
  state.shakeTime = 0;
  state.shakePower = 0;
  state.warningBanner.value = null;
  state.phase = PHASE_COMBAT;
  state.phaseTimer = 0;
  state.upgradeChoices = [];
  state.riskChoices = [];
  state.pendingRisk = null;
  state.currentWaveRisk = null;
  state.waveStartElapsed = 0;
  state.qaWaveTimer = 0;
  state.qaStats = createQaStats();
  advanceWave(state);
}

function wireButtons(state, lifecycle) {
  if (state.uiHandlers) return;
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  if (startBtn) startBtn.onclick = function () { lifecycle.start(); };
  if (pauseBtn) pauseBtn.onclick = function () { if (!state.running) return; if (state.paused) lifecycle.resume(); else lifecycle.pause(); };
  if (resetBtn) resetBtn.onclick = function () { lifecycle.reset(); };
  state.uiHandlers = { startBtn, pauseBtn, resetBtn };
}

function clearButtons(state) {
  if (!state.uiHandlers) return;
  if (state.uiHandlers.startBtn) state.uiHandlers.startBtn.onclick = null;
  if (state.uiHandlers.pauseBtn) state.uiHandlers.pauseBtn.onclick = null;
  if (state.uiHandlers.resetBtn) state.uiHandlers.resetBtn.onclick = null;
  state.uiHandlers = null;
}

function firePrimary(state) {
  if (state.shootCd > 0 || state.empTimer > 0) return;
  const gun = computeGunStats(state);
  state.shootCd = gun.fireRate;
  for (const offset of gun.spread) {
    const a = state.ship.angle + offset;
    state.bullets.push({
      x: state.ship.x + Math.cos(a) * 22,
      y: state.ship.y + Math.sin(a) * 22,
      vx: Math.cos(a) * gun.bulletSpeed,
      vy: Math.sin(a) * gun.bulletSpeed,
      life: 1.2,
      friendly: true,
      damage: 1 + (state.upgrades.bulletDmg || 0),
      pulse: false,
    });
  }
  playCue('asteroid-fork-shoot-' + Math.floor(Math.random() * 3), { kind: 'tone', type: 'square', freqStart: randomRange(690, 820), freqEnd: randomRange(380, 530), duration: 0.05, volume: 0.03 });
}

function fireBombPulse(state) {
  const gun = computeGunStats(state);
  if (!gun.hasBomb || state.bombCd > 0 || state.empTimer > 0) return;
  state.bombCd = 8;
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    state.bullets.push({ x: state.ship.x, y: state.ship.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, life: 0.7, friendly: true, damage: 1, pulse: true });
  }
  cueBanner(state, 'Bomb Pulse', '#ff8c42', 1.1);
  playCue('asteroid-fork-bomb-pulse', { kind: 'tone', type: 'sawtooth', freqStart: 230, freqEnd: 90, duration: 0.16, volume: 0.07 });
}

function damagePlayer(state, amount) {
  const ship = state.ship;
  if (!ship) return;
  if (state.qaEnabled && state.wave < 22) {
    ship.invuln = 1.1;
    state.shakeTime = 0.12;
    state.shakePower = 6;
    return;
  }
  if (ship.shield > 0) {
    ship.shield -= amount;
    ship.invuln = 0.35;
    cueBanner(state, 'Shield Impact', '#2ec5ff', 0.8);
    playCue('asteroid-fork-shield-hit', { kind: 'tone', type: 'triangle', freqStart: 540, freqEnd: 340, duration: 0.06, volume: 0.03 });
    return;
  }
  state.lives -= amount;
  ship.invuln = 1.2;
  state.shakeTime = 0.3;
  state.shakePower = 14;
  burst(state, ship.x, ship.y, '#ff4f7f', 30, 220);
  pulseHud(state, state.livesEl, 'flash', 260);
  syncHud(state);
  playCue('asteroid-fork-ship-hit', { kind: 'tone', type: 'sawtooth', freqStart: 280, freqEnd: 120, duration: 0.14, volume: 0.07 });
  if (state.lives <= 0) {
    state.lives = 0;
    state.gameOver = true;
  }
}

function handleShipCollision(state) {
  if (!state.ship || state.ship.invuln > 0) return;
  for (const asteroid of state.asteroids) {
    if (len(asteroid.x - state.ship.x, asteroid.y - state.ship.y) <= asteroid.radius + 13) {
      damagePlayer(state, 1);
      return;
    }
  }
  for (const enemy of state.enemies) {
    if (len(enemy.x - state.ship.x, enemy.y - state.ship.y) <= enemy.radius + 12) {
      damagePlayer(state, 1);
      enemy.hp = 0;
      return;
    }
  }
  for (const bullet of state.enemyBullets) {
    if (len(bullet.x - state.ship.x, bullet.y - state.ship.y) <= (bullet.radius || 4) + 12) {
      bullet.life = 0;
      damagePlayer(state, bullet.damage || 1);
      return;
    }
  }
}

function splitAsteroid(state, asteroid) {
  const nextTier = asteroid.tier - 1;
  if (nextTier <= 0) return;
  const children = asteroid.type === 'cluster' ? 3 : 2;
  for (let i = 0; i < children; i += 1) {
    const childType = asteroid.type === 'cluster' ? 'shard' : (Math.random() < 0.35 ? 'shard' : asteroid.type);
    const child = createAsteroid(state, asteroid.x, asteroid.y, childType, nextTier, asteroid.mutations);
    child.vx += randomRange(-40, 40);
    child.vy += randomRange(-40, 40);
    state.asteroids.push(child);
  }
}

function awardAsteroidKill(state, asteroid) {
  const def = ASTEROID_TYPE_DEFS[asteroid.type] || ASTEROID_TYPE_DEFS.basic;
  state.score += def.score * (1 + state.wave * 0.15);
  if (state.score > state.best) {
    state.best = state.score;
    ArcadeSync.setHighScore(GAME_ID, state.best);
  }
  pulseHud(state, state.scoreEl, 'pulse', 180);
  if (asteroid.type === 'crystal') {
    state.score += 180;
    applyUpgradePickup(state);
    cueBanner(state, 'Crystal Reward', '#8cffd5', 1.2);
  }
  if (asteroid.type === 'cursed') {
    state.enemyBuffTimer = Math.max(state.enemyBuffTimer, 7);
    cueBanner(state, 'Cursed Pulse: enemies boosted', '#ff64ca', 1.4);
  }
  if (asteroid.type === 'explosive') {
    for (const enemy of state.enemies) if (len(enemy.x - asteroid.x, enemy.y - asteroid.y) < 120) enemy.hp -= 2;
    state.shakeTime = 0.15;
    state.shakePower = 7;
  }
  burst(state, asteroid.x, asteroid.y, def.color, asteroid.tier === 3 ? 34 : 18, 220);
  splitAsteroid(state, asteroid);
  playCue('asteroid-fork-explosion-layer', {
    kind: 'chord',
    tones: [
      { type: 'square', freqStart: 260, freqEnd: 110, duration: 0.08, volume: 0.04, delay: 0 },
      { type: 'sawtooth', freqStart: 360, freqEnd: 150, duration: 0.11, volume: 0.035, delay: 0.02 },
    ],
  });
}

function updateEvents(state, dt) {
  if (state.activeEvent) {
    state.activeEvent.timer -= dt;
    if (state.activeEvent.timer <= 0) {
      state.activeEvent = null;
      cueBanner(state, 'Event ended', '#8b949e', 0.7);
    }
  }
  if (state.empTimer > 0) state.empTimer -= dt;
  if (state.gravityShiftTimer > 0) state.gravityShiftTimer -= dt;
  if (state.timeDistortionTimer > 0) state.timeDistortionTimer -= dt;
  if (state.enemyBuffTimer > 0) state.enemyBuffTimer -= dt;
}

function updateShip(state, dt, keys) {
  const ship = state.ship;
  const gun = computeGunStats(state);
  if (!state.currentWaveRisk || state.currentWaveRisk.id !== 'noShield') {
    ship.shield = Math.max(ship.shield, gun.shieldLayers);
  }
  const left = keys.ArrowLeft || keys.a || keys.A;
  const right = keys.ArrowRight || keys.d || keys.D;
  const up = keys.ArrowUp || keys.w || keys.W;
  let targetTurn = 0;
  if (left) targetTurn -= gun.rotationSpeed;
  if (right) targetTurn += gun.rotationSpeed;
  ship.turnVelocity += (targetTurn - ship.turnVelocity) * clamp(dt * 10, 0, 1);
  ship.angle += ship.turnVelocity * dt;
  const thrustScale = state.timeDistortionTimer > 0 ? 0.65 : 1;
  ship.thrusting = !!up;
  if (up && state.empTimer <= 0) {
    const thrust = gun.thrustPower * thrustScale;
    ship.vx += Math.cos(ship.angle) * thrust * dt;
    ship.vy += Math.sin(ship.angle) * thrust * dt;
    addParticle(state, ship.x - Math.cos(ship.angle) * 14, ship.y - Math.sin(ship.angle) * 14, -Math.cos(ship.angle) * randomRange(90, 180), -Math.sin(ship.angle) * randomRange(90, 180), randomRange(0.07, 0.16), randomRange(1.2, 2.5), Math.random() < 0.5 ? '#f7c948' : '#ff58a5');
  }
  const decay = up ? 0.987 : 0.965;
  ship.vx *= Math.pow(decay, dt * 60);
  ship.vy *= Math.pow(decay, dt * 60);
  if (state.gravityShiftTimer > 0) {
    ship.vx += Math.cos(state.elapsed * 1.8) * 12 * dt;
    ship.vy += Math.sin(state.elapsed * 1.5) * 12 * dt;
  }
  ship.x = wrap(ship.x + ship.vx * dt, state.worldW);
  ship.y = wrap(ship.y + ship.vy * dt, state.worldH);
  if (ship.invuln > 0) ship.invuln -= dt;
}

function updateAsteroids(state, dt) {
  for (const asteroid of state.asteroids) {
    if (asteroid.type === 'magnetic') {
      const dx = asteroid.x - state.ship.x;
      const dy = asteroid.y - state.ship.y;
      const dist = Math.max(40, len(dx, dy));
      if (dist < 220) {
        const pull = (220 - dist) * 0.7;
        state.ship.vx += (dx / dist) * pull * dt;
        state.ship.vy += (dy / dist) * pull * dt;
      }
    }
    asteroid.angle += asteroid.spin * dt;
    asteroid.x = wrap(asteroid.x + asteroid.vx * dt, state.worldW);
    asteroid.y = wrap(asteroid.y + asteroid.vy * dt, state.worldH);
  }
}

function enemyShoot(state, enemy, speed, damage, radius) {
  const a = angleTo(state.ship.x - enemy.x, state.ship.y - enemy.y);
  state.enemyBullets.push({ x: enemy.x, y: enemy.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 4, radius: radius || 5, damage: damage || 1 });
}

function updateEnemies(state, dt) {
  const intensity = 1 + (state.director.intensity || 0) / 140;
  const boosted = state.enemyBuffTimer > 0 ? 1.35 : 1;
  for (const enemy of state.enemies) {
    const def = ENEMY_TYPE_DEFS[enemy.type] || ENEMY_TYPE_DEFS.hunter;
    const speed = def.speed * intensity * boosted;
    const dx = state.ship.x - enemy.x;
    const dy = state.ship.y - enemy.y;
    const dist = Math.max(1, len(dx, dy));
    if (enemy.type === 'hunter') {
      enemy.vx += (dx / dist) * speed * dt * 1.5;
      enemy.vy += (dy / dist) * speed * dt * 1.5;
    } else if (enemy.type === 'sniper') {
      const desired = dist < 250 ? -1 : 1;
      enemy.vx += (dx / dist) * speed * dt * 0.9 * desired;
      enemy.vy += (dy / dist) * speed * dt * 0.9 * desired;
    } else if (enemy.type === 'swarm') {
      enemy.swarmPhase += dt * 4;
      enemy.vx += (dx / dist) * speed * dt * 0.8 + Math.cos(enemy.swarmPhase) * 16 * dt;
      enemy.vy += (dy / dist) * speed * dt * 0.8 + Math.sin(enemy.swarmPhase) * 16 * dt;
    } else if (enemy.type === 'bomber') {
      enemy.vx += (dx / dist) * speed * dt * 0.6;
      enemy.vy += (dy / dist) * speed * dt * 0.6;
    } else if (enemy.type === 'cloaked') {
      enemy.cloak += enemy.cloakDir * dt * 0.8;
      if (enemy.cloak > 1) { enemy.cloak = 1; enemy.cloakDir = -1; }
      if (enemy.cloak < 0.2) { enemy.cloak = 0.2; enemy.cloakDir = 1; }
      enemy.vx += (dx / dist) * speed * dt;
      enemy.vy += (dy / dist) * speed * dt;
    }
    enemy.vx *= Math.pow(0.985, dt * 60);
    enemy.vy *= Math.pow(0.985, dt * 60);
    enemy.x = wrap(enemy.x + enemy.vx * dt, state.worldW);
    enemy.y = wrap(enemy.y + enemy.vy * dt, state.worldH);
    enemy.fireCd -= dt;
    if (enemy.fireCd <= 0) {
      enemy.fireCd = def.fireRate / intensity;
      if (enemy.type === 'sniper') enemyShoot(state, enemy, 460, 1, 5);
      else if (enemy.type === 'bomber') enemyShoot(state, enemy, 260, 2, 8);
      else if (enemy.type === 'swarm') enemyShoot(state, enemy, 340, 1, 4);
      else enemyShoot(state, enemy, 390, 1, 5);
    }
  }
  state.enemies = state.enemies.filter(function (enemy) { return enemy.hp > 0; });
}

function bossShoot(state, boss, speed, count, spread, damage) {
  const center = angleTo(state.ship.x - boss.x, state.ship.y - boss.y);
  const c = Math.max(1, count);
  const half = (c - 1) / 2;
  for (let i = 0; i < c; i += 1) {
    const a = center + (i - half) * spread;
    state.enemyBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 5, radius: 7, damage: damage });
  }
}

function updateBosses(state, dt) {
  const aggression = getBossAggressionMult(state.director);
  for (const boss of state.bosses) {
    const hpRatio = boss.hp / Math.max(1, boss.maxHp);
    const nextPhase = hpRatio > 0.66 ? 1 : hpRatio > 0.33 ? 2 : 3;
    if (nextPhase !== boss.phase) {
      boss.phase = nextPhase;
      if (state.qaStats) state.qaStats.bossPhaseChanges += 1;
      cueBanner(state, boss.name + ' Phase ' + boss.phase, '#ff7f50', 1.6);
      state.screenPulse = 1;
      state.shakeTime = 0.3;
      state.shakePower = 9;
    }
    const t = state.elapsed * (0.6 + boss.phase * 0.2);
    boss.x = state.worldW * 0.5 + Math.cos(t) * (220 + boss.phase * 35);
    boss.y = state.worldH * 0.27 + Math.sin(t * 0.8) * 60;
    if (boss.id === 'gravity-well') {
      const dx = boss.x - state.ship.x;
      const dy = boss.y - state.ship.y;
      const d = Math.max(20, len(dx, dy));
      if (d < boss.gravityRadius) {
        const force = (boss.gravityRadius - d) * 1.9;
        state.ship.vx += (dx / d) * force * dt;
        state.ship.vy += (dy / d) * force * dt;
      }
    }
    boss.fireCd -= dt;
    boss.summonCd -= dt;
    boss.beamCd -= dt;
    boss.randomCd -= dt;
    if (boss.fireCd <= 0) {
      boss.fireCd = Math.max(0.2, 1.2 / aggression - boss.phase * 0.12);
      if (boss.id === 'laser-core') bossShoot(state, boss, 520, 1 + boss.phase, 0.13, 2);
      else if (boss.id === 'chaos-engine') bossShoot(state, boss, randomRange(280, 540), 2 + boss.phase, 0.2, 1);
      else bossShoot(state, boss, 380 + boss.phase * 40, 1 + Math.max(0, boss.phase - 1), 0.16, 1);
    }
    if (boss.id === 'drone-carrier' && boss.summonCd <= 0) {
      boss.summonCd = Math.max(1, 3.4 - boss.phase * 0.5);
      state.enemies.push(createEnemy(state, 'swarm'), createEnemy(state, 'hunter'));
    }
    if (boss.id === 'titan-rock' && boss.summonCd <= 0) {
      boss.summonCd = Math.max(1.5, 4.2 - boss.phase * 0.4);
      state.asteroids.push(createAsteroid(state, boss.x, boss.y, 'heavy', 3, []));
    }
    if (boss.id === 'laser-core' && boss.beamCd <= 0) {
      boss.beamCd = Math.max(1.5, 3.2 - boss.phase * 0.4);
      for (let i = -2; i <= 2; i += 1) state.enemyBullets.push({ x: boss.x + i * 16, y: boss.y, vx: 0, vy: 640, life: 1.2, radius: 6, damage: 2 });
    }
    if (boss.id === 'chaos-engine' && boss.randomCd <= 0) {
      boss.randomCd = Math.max(0.8, 2.3 - boss.phase * 0.4);
      const pick = Math.floor(Math.random() * 3);
      if (pick === 0) state.asteroids.push(createAsteroid(state, randomRange(0, state.worldW), -30, 'explosive', 2, []));
      else if (pick === 1) state.enemies.push(createEnemy(state, 'cloaked'));
      else state.timeDistortionTimer = Math.max(state.timeDistortionTimer, 3);
    }
  }
  state.bosses = state.bosses.filter(function (boss) {
    if (boss.hp > 0) return true;
    state.score += 2200 + state.wave * 120;
    state.runStats.bossesDefeated += 1;
    burst(state, boss.x, boss.y, boss.color, 70, 300);
    state.shakeTime = 0.6;
    state.shakePower = 18;
    cueBanner(state, boss.name + ' Destroyed', '#8cffd5', 2.0);
    playCue('asteroid-fork-boss-fall', {
      kind: 'chord',
      tones: [
        { type: 'sawtooth', freqStart: 280, freqEnd: 80, duration: 0.3, volume: 0.08, delay: 0 },
        { type: 'triangle', freqStart: 480, freqEnd: 160, duration: 0.35, volume: 0.06, delay: 0.04 },
      ],
    });
    return false;
  });
}

function updateProjectiles(state, dt) {
  for (const bullet of state.bullets) {
    bullet.x = wrap(bullet.x + bullet.vx * dt, state.worldW);
    bullet.y = wrap(bullet.y + bullet.vy * dt, state.worldH);
    bullet.life -= dt;
  }
  for (const bullet of state.enemyBullets) {
    bullet.x = wrap(bullet.x + bullet.vx * dt, state.worldW);
    bullet.y = wrap(bullet.y + bullet.vy * dt, state.worldH);
    bullet.life -= dt;
  }
  state.bullets = state.bullets.filter(function (b) { return b.life > 0; });
  state.enemyBullets = state.enemyBullets.filter(function (b) { return b.life > 0; });
}

function updateDebris(state, dt) {
  for (const d of state.debris) {
    d.x = wrap(d.x + d.vx * dt, state.worldW);
    d.y = wrap(d.y + d.vy * dt, state.worldH);
    d.life -= dt;
  }
  state.debris = state.debris.filter(function (d) { return d.life > 0; });
}

function updateParticles(state, dt) {
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;
  }
  state.particles = state.particles.filter(function (p) { return p.life > 0; });
  if (state.warningBanner.value) {
    state.warningBanner.value.timer -= dt;
    if (state.warningBanner.value.timer <= 0) state.warningBanner.value = null;
  }
  if (state.shakeTime > 0) {
    state.shakeTime -= dt;
    state.shakePower *= 0.93;
    if (state.shakeTime <= 0.01) { state.shakeTime = 0; state.shakePower = 0; }
  }
  state.screenPulse = Math.max(0, state.screenPulse - dt * 0.7);
  state.screenTint = Math.max(0, state.screenTint - dt * 0.18);
}

function resolveProjectileHits(state) {
  for (const bullet of state.bullets) {
    for (const asteroid of state.asteroids) {
      if (bullet.life <= 0 || asteroid.hp <= 0) continue;
      if (len(bullet.x - asteroid.x, bullet.y - asteroid.y) <= asteroid.radius) {
        asteroid.hp -= bullet.damage || 1;
        bullet.life = bullet.pulse ? bullet.life : 0;
        if (asteroid.hp <= 0) awardAsteroidKill(state, asteroid);
      }
    }
    for (const enemy of state.enemies) {
      if (bullet.life <= 0 || enemy.hp <= 0) continue;
      if (len(bullet.x - enemy.x, bullet.y - enemy.y) <= enemy.radius + 4) {
        enemy.hp -= bullet.damage || 1;
        bullet.life = 0;
        burst(state, enemy.x, enemy.y, ENEMY_TYPE_DEFS[enemy.type].color, 14, 160);
        if (enemy.hp <= 0) state.score += 120 + state.wave * 12;
      }
    }
    for (const boss of state.bosses) {
      if (bullet.life <= 0 || boss.hp <= 0) continue;
      if (Math.abs(bullet.x - boss.x) <= boss.w * 0.5 && Math.abs(bullet.y - boss.y) <= boss.h * 0.5) {
        boss.hp -= bullet.damage || 1;
        bullet.life = 0;
      }
    }
  }
  state.asteroids = state.asteroids.filter(function (a) { return a.hp > 0; });
  state.enemies = state.enemies.filter(function (e) { return e.hp > 0; });
}

function fireDroneTurret(state, dt) {
  const gun = computeGunStats(state);
  if (!gun.hasDrone || state.empTimer > 0) return;
  state._droneCd -= dt;
  if (state._droneCd > 0) return;
  const target = state.enemies[0] || state.asteroids[0] || state.bosses[0];
  if (!target) return;
  state._droneCd = 0.48;
  const a = angleTo(target.x - state.ship.x, target.y - state.ship.y);
  state.bullets.push({ x: state.ship.x + Math.cos(a) * 18, y: state.ship.y + Math.sin(a) * 18, vx: Math.cos(a) * (BASE_BULLET_SPEED * 0.8), vy: Math.sin(a) * (BASE_BULLET_SPEED * 0.8), life: 0.9, friendly: true, damage: 1, pulse: false });
}

function updateIntensityFeedback(state, dt) {
  const enemiesNear = state.enemies.filter(function (enemy) { return len(enemy.x - state.ship.x, enemy.y - state.ship.y) < 180; }).length;
  updateIntensity(state.director, dt, { damageTaken: false, enemiesNearPlayer: enemiesNear, bossActive: state.bosses.length > 0, lives: state.lives, waveClear: false });
  state.runStats.highestIntensity = Math.max(state.runStats.highestIntensity, state.director.intensity || 0);
  const i = state.director.intensity || 0;
  if (i > 75) {
    state.screenTint = Math.max(state.screenTint, 0.26);
    state.screenPulse = Math.max(state.screenPulse, 0.18);
  }
}

function drawShip(ctx, state) {
  const ship = state.ship;
  if (!ship) return;
  if (ship.invuln > 0 && Math.floor(ship.invuln * 20) % 2 === 0) return;
  const a = ship.angle;
  const points = [
    { x: Math.cos(a) * 20, y: Math.sin(a) * 20 },
    { x: Math.cos(a + 2.5) * 16, y: Math.sin(a + 2.5) * 16 },
    { x: Math.cos(a - 2.5) * 16, y: Math.sin(a - 2.5) * 16 },
  ];
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[1].x, points[1].y);
  ctx.lineTo(points[2].x, points[2].y);
  ctx.closePath();
  ctx.strokeStyle = '#2ec5ff';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#2ec5ff';
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.restore();
  if (ship.shield > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(ship.x, ship.y, 23, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(80,200,255,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

function drawAsteroids(ctx, state) {
  for (const asteroid of state.asteroids) {
    const def = ASTEROID_TYPE_DEFS[asteroid.type] || ASTEROID_TYPE_DEFS.basic;
    ctx.save();
    ctx.translate(asteroid.x, asteroid.y);
    ctx.rotate(asteroid.angle);
    ctx.beginPath();
    for (let i = 0; i < asteroid.points.length; i += 1) {
      const a = (i / asteroid.points.length) * Math.PI * 2;
      const r = asteroid.points[i];
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 9;
    ctx.stroke();
    ctx.restore();
  }
}

function drawEnemies(ctx, state) {
  for (const enemy of state.enemies) {
    const def = ENEMY_TYPE_DEFS[enemy.type];
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.globalAlpha = enemy.cloak === undefined ? 1 : enemy.cloak;
    ctx.fillStyle = def.color;
    ctx.strokeStyle = '#111823';
    ctx.lineWidth = 2;
    if (enemy.type === 'sniper') {
      ctx.beginPath();
      ctx.moveTo(-14, 10); ctx.lineTo(0, -16); ctx.lineTo(14, 10); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (enemy.type === 'bomber') {
      ctx.fillRect(-16, -12, 32, 24);
      ctx.strokeRect(-16, -12, 32, 24);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, def.radius, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBosses(ctx, state) {
  for (const boss of state.bosses) {
    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.fillStyle = boss.color;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-boss.w * 0.5, boss.h * 0.4);
    ctx.lineTo(-boss.w * 0.3, -boss.h * 0.5);
    ctx.lineTo(boss.w * 0.3, -boss.h * 0.5);
    ctx.lineTo(boss.w * 0.5, boss.h * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const hpRatio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    ctx.fillStyle = '#1b1f2a';
    ctx.fillRect(-boss.w * 0.5, -boss.h * 0.75, boss.w, 8);
    ctx.fillStyle = hpRatio > 0.4 ? '#3ad06f' : '#ff5c7d';
    ctx.fillRect(-boss.w * 0.5, -boss.h * 0.75, boss.w * hpRatio, 8);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(boss.name, 0, -boss.h * 0.95);
    ctx.restore();
  }
}

function drawProjectiles(ctx, state) {
  ctx.save();
  for (const bullet of state.bullets) {
    ctx.fillStyle = bullet.pulse ? '#ff9b5a' : '#f7e36d';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.pulse ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const bullet of state.enemyBullets) {
    ctx.fillStyle = '#ff5470';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius || 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx, state) {
  for (const p of state.particles) {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const d of state.debris) {
    ctx.fillStyle = '#c9ced7';
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOverlay(ctx, state) {
  if (state.warningBanner.value) {
    const b = state.warningBanner.value;
    const alpha = clamp(b.timer / b.maxTimer, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = b.color;
    ctx.font = '700 30px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(b.text, state.worldW * 0.5, 58);
    ctx.globalAlpha = 1;
  }
  if (!state.running || state.paused || state.gameOver) {
    ctx.fillStyle = 'rgba(5,8,14,0.6)';
    ctx.fillRect(0, 0, state.worldW, state.worldH);
    ctx.fillStyle = '#f7c948';
    ctx.font = '700 42px system-ui';
    ctx.textAlign = 'center';
    const title = state.gameOver ? 'GAME OVER' : (state.paused ? 'PAUSED' : 'Press Start');
    ctx.fillText(title, state.worldW * 0.5, state.worldH * 0.48);
    if (state.gameOver) {
      ctx.font = '600 24px system-ui';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Score: ' + Math.floor(state.score), state.worldW * 0.5, state.worldH * 0.56);
    }
  }

  if (state.phase === PHASE_UPGRADE && state.upgradeChoices.length) {
    ctx.fillStyle = 'rgba(6,10,18,0.82)';
    ctx.fillRect(120, 160, state.worldW - 240, state.worldH - 320);
    ctx.fillStyle = '#f7c948';
    ctx.font = '700 30px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Choose Upgrade', state.worldW * 0.5, 220);
    ctx.font = '600 22px system-ui';
    for (let i = 0; i < state.upgradeChoices.length; i += 1) {
      const y = 290 + i * 84;
      const choice = state.upgradeChoices[i];
      ctx.fillStyle = '#ffffff';
      ctx.fillText((i + 1) + '. ' + choice.label, state.worldW * 0.5, y);
      ctx.fillStyle = '#9aa5b5';
      ctx.font = '500 16px system-ui';
      ctx.fillText(choice.desc || 'Upgrade effect', state.worldW * 0.5, y + 26);
      ctx.font = '600 22px system-ui';
    }
  }

  if (state.phase === PHASE_RISK && state.riskChoices.length) {
    ctx.fillStyle = 'rgba(16,8,18,0.84)';
    ctx.fillRect(120, 190, state.worldW - 240, state.worldH - 380);
    ctx.fillStyle = '#ff4fd1';
    ctx.font = '700 30px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Choose Risk', state.worldW * 0.5, 250);
    ctx.font = '600 20px system-ui';
    for (let i = 0; i < state.riskChoices.length; i += 1) {
      const y = 320 + i * 90;
      const choice = state.riskChoices[i];
      ctx.fillStyle = '#ffffff';
      ctx.fillText((i + 1) + '. ' + choice.label, state.worldW * 0.5, y);
      ctx.fillStyle = '#e9b9df';
      ctx.font = '500 16px system-ui';
      ctx.fillText(choice.desc || 'Risk modifies next wave', state.worldW * 0.5, y + 28);
      ctx.font = '600 20px system-ui';
    }
  }

  if (state.qaEnabled) {
    ctx.fillStyle = 'rgba(140,255,213,0.92)';
    ctx.font = '600 14px system-ui';
    ctx.textAlign = 'left';
    const phaseLabel = state.phase === PHASE_COMBAT ? 'combat' : state.phase;
    ctx.fillText('QA MODE [' + phaseLabel + '] wave=' + state.wave + ' pressure=' + Math.round(state.director.pressure || 0), 18, 26);
  }
}

function renderFrame(state) {
  if (!state.ctx || !state.canvas) return;
  const ctx = state.ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
  ctx.scale(state.dpr, state.dpr);
  const shakeX = state.shakeTime > 0 ? randomRange(-state.shakePower, state.shakePower) : 0;
  const shakeY = state.shakeTime > 0 ? randomRange(-state.shakePower, state.shakePower) : 0;
  ctx.translate(shakeX, shakeY);
  const g = ctx.createLinearGradient(0, 0, 0, state.worldH);
  g.addColorStop(0, '#080d1a');
  g.addColorStop(1, '#101827');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, state.worldW, state.worldH);
  for (const star of state.stars || []) {
    const r = 0.6 + star.z * 1.8;
    const y = wrap(star.y + state.elapsed * (12 + star.z * 20), state.worldH);
    ctx.globalAlpha = 0.2 + star.z * 0.45;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(star.x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawParticles(ctx, state);
  drawAsteroids(ctx, state);
  drawEnemies(ctx, state);
  drawBosses(ctx, state);
  drawProjectiles(ctx, state);
  drawShip(ctx, state);
  if (state.screenTint > 0) {
    ctx.fillStyle = 'rgba(255,70,120,' + String(clamp(state.screenTint, 0, 0.45)) + ')';
    ctx.fillRect(0, 0, state.worldW, state.worldH);
  }
  if (state.screenPulse > 0) {
    ctx.strokeStyle = 'rgba(255,220,120,' + String(state.screenPulse) + ')';
    ctx.lineWidth = 10 + state.screenPulse * 14;
    ctx.strokeRect(0, 0, state.worldW, state.worldH);
  }
  drawOverlay(ctx, state);
  ctx.restore();
}

function handleGameOverIfNeeded(context) {
  const state = context.state;
  if (!state.gameOver || state.submitted) return;
  state.submitted = true;
  state.running = false;
  stopAllSounds();
  if (state.score > state.best) {
    state.best = state.score;
    ArcadeSync.setHighScore(GAME_ID, state.best);
  }
  const summary = buildRunSummary({
    score: Math.floor(state.score),
    wave: state.wave,
    bossesDefeated: state.runStats.bossesDefeated,
    upgradeCount: Object.values(state.upgrades).reduce(function (sum, n) { return sum + (Number(n) || 0); }, 0),
    highestIntensity: state.runStats.highestIntensity,
    survival: state.elapsed,
  });
  const milestones = checkMilestones({
    score: summary.score,
    wave: summary.wave,
    bossesDefeated: summary.bossesDefeated,
    highestIntensity: summary.highestIntensity,
    survival: summary.survival,
  });
  recordRunStats({ score: summary.score, wave: summary.wave, survival: summary.survival });
  try { localStorage.setItem('asteroid_fork_last_run', JSON.stringify({ summary: summary, milestones: milestones, at: Date.now() })); } catch (_) {}
  submitScore(ArcadeSync.getPlayer(), Math.floor(state.score), GAME_ID).catch(function () {});
  if (window.showGameOverModal) window.showGameOverModal(Math.floor(state.score));
  syncHud(state);
}

function adapterInit(context) {
  const state = context.state;
  if (!state.canvas || !state.ctx) return;
  if (!state.ship) state.ship = makeShip(state);
  applyFullscreenFit(state);
  registerResize(state);
  syncHud(state);
  renderFrame(state);
}

function adapterUpdate(context, dt) {
  const state = context.state;
  const keys = context.engine ? context.engine.keys : {};
  const tickScale = state.timeDistortionTimer > 0 ? 0.65 : 1;
  const step = dt * tickScale;
  if (!state.running || state.paused || state.gameOver) {
    updateParticles(state, step);
    return;
  }

  if (state.phase !== PHASE_COMBAT) {
    state.phaseTimer -= step;
    updateParticles(state, step);
    if (state.phase === PHASE_UPGRADE && state.phaseTimer <= 0) {
      if (!applyUpgradeChoice(state, 0)) state.phase = PHASE_COMBAT;
      if (state.phase === PHASE_COMBAT) {
        if (openRiskChoicePhase(state)) return;
        advanceWave(state);
      }
      return;
    }
    if (state.phase === PHASE_RISK && state.phaseTimer <= 0) {
      if (!applyRiskChoice(state, 0)) state.phase = PHASE_COMBAT;
      if (state.phase === PHASE_COMBAT) advanceWave(state);
      return;
    }
    return;
  }

  state.elapsed += step;
  tickDirector(state.director, step, state.score, state.wave, state.lives, state.upgrades, !!state.activeEvent, state.dailyVariation.eventRateMult);
  if (state.qaEnabled) {
    state.director.pressure = Math.min(100, (state.director.pressure || 0) + step * 14);
  }
  updateIntensityFeedback(state, step);
  if (state.modifier && typeof state.modifier.tick === 'function') {
    state.modifier.tick({
      invaders: state.enemies,
      invBullets: state.enemyBullets,
      bullets: state.bullets,
      player: state.ship,
      wave: state.wave,
      elapsed: state.elapsed,
      W: state.worldW,
      H: state.worldH,
      modifierData: state.modifierData,
      asteroids: state.asteroids,
      miniEnemies: state.enemies,
      bunkers: [],
      addFloatingText: function (text) { cueBanner(state, text, '#f7c948', 1); },
      playSfx: function () {},
      spawnPowerupRain: function () { state.score += 80; },
    }, step);
  }
  const pressureTrigger = shouldFirePressureEvent(state.director);
  const chaosTrigger = checkForcedChaos(state.director);
  if (!state.activeEvent && (pressureTrigger || chaosTrigger)) {
    const tier = getEventTier(state.director.intensity || 0);
    const ev = pickSurpriseEvent(state.wave, state.director, tier);
    if (ev) triggerEvent(state, ev, pressureTrigger ? 'pressure' : 'chaos');
  }
  updateEvents(state, step);
  state.shootCd = Math.max(0, state.shootCd - step);
  state.bombCd = Math.max(0, state.bombCd - step);
  updateShip(state, step, keys);
  state.thrustSoundCd -= step;
  if (state.ship.thrusting && state.thrustSoundCd <= 0) {
    state.thrustSoundCd = 0.08;
    playCue('asteroid-fork-thrust-burst', { kind: 'tone', type: 'triangle', freqStart: randomRange(190, 230), freqEnd: randomRange(120, 155), duration: 0.05, volume: 0.03 });
  }
  if ((keys[' '] || keys.Spacebar) && !state.empTimer) firePrimary(state);
  if (state.qaEnabled) {
    state.qaWaveTimer += step;
    if (state.qaAutoProgress && state.qaWaveTimer > 2.3) {
      forceProgressWave(state);
      state.qaWaveTimer = 0;
    }
  }
  updateAsteroids(state, step);
  updateEnemies(state, step);
  updateBosses(state, step);
  fireDroneTurret(state, step);
  updateProjectiles(state, step);
  updateDebris(state, step);
  resolveProjectileHits(state);
  handleShipCollision(state);
  updateParticles(state, step);
  if (!state.asteroids.length && !state.enemies.length && !state.bosses.length && !state.gameOver) beginBetweenWaveChoices(state);
  handleGameOverIfNeeded(context);
  syncHud(state);
  syncQaProbe(state);
}

function adapterRender(context) {
  renderFrame(context.state);
}

function adapterInput(context, event) {
  const state = context.state;
  if (!event || event.type !== 'keydown') return;
  if (state.phase === PHASE_UPGRADE) {
    if (event.key === '1') applyUpgradeChoice(state, 0);
    if (event.key === '2') applyUpgradeChoice(state, 1);
    if (event.key === '3') applyUpgradeChoice(state, 2);
    if (state.phase === PHASE_COMBAT) {
      if (openRiskChoicePhase(state)) return;
      advanceWave(state);
    }
    return;
  }
  if (state.phase === PHASE_RISK) {
    if (event.key === '1') applyRiskChoice(state, 0);
    if (event.key === '2') applyRiskChoice(state, 1);
    if (state.phase === PHASE_COMBAT) advanceWave(state);
    return;
  }
  if (event.key === ' ') {
    event.preventDefault();
    firePrimary(state);
  }
  if (event.key === 'b' || event.key === 'B') fireBombPulse(state);
  if (state.qaEnabled && (event.key === 'n' || event.key === 'N')) {
    forceProgressWave(state);
  }
  if (state.qaEnabled && (event.key === 'm' || event.key === 'M')) {
    state.qaAutoProgress = !state.qaAutoProgress;
    cueBanner(state, 'QA autoprog ' + (state.qaAutoProgress ? 'ON' : 'OFF'), '#8cffd5', 1.1);
  }
  if (state.qaEnabled && (event.key === 'g' || event.key === 'G')) {
    state.lives = 0;
    state.gameOver = true;
  }
  if (event.key === 'Enter' || event.key === 'NumpadEnter') {
    event.preventDefault();
    if (!state.running || state.gameOver) {
      if (typeof window.hideGameOverModal === 'function') window.hideGameOverModal();
      resetRun(state);
      state.running = true;
      state.paused = false;
      if (context.engine) context.engine.startLoop();
    }
  }
}

function adapterGameOver(context) {
  context.state.gameOver = true;
  handleGameOverIfNeeded(context);
}

export const ASTEROID_FORK_ADAPTER = createGameAdapter({
  id: 'asteroid-fork',
  name: 'Asteroid Fork',
  init: function (ctx) { return adapterInit(ctx); },
  update: function (ctx, dt) { return adapterUpdate(ctx, dt); },
  render: function (ctx) { return adapterRender(ctx); },
  onInput: function (ctx, e) { return adapterInput(ctx, e); },
  onGameOver: function (ctx) { return adapterGameOver(ctx); },
  systems: SYSTEM_FLAGS,
});

registerGameAdapter(ASTEROID_FORK_CONFIG, ASTEROID_FORK_ADAPTER, bootstrapAsteroidFork);

export function bootstrapAsteroidFork(root) {
  const state = createState(root);
  const context = { root: root, adapter: ASTEROID_FORK_ADAPTER, state: state, systems: {}, engine: null };
  const engine = new BaseGame({
    context: context,
    systems: resolveSystems(ASTEROID_FORK_ADAPTER.systems),
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
      renderFrame(state);
    },
    start: function () {
      if (state.gameOver || !state.running) resetRun(state);
      state.running = true;
      state.paused = false;
      engine.startLoop();
      renderFrame(state);
    },
    pause: function () {
      if (!state.running) return;
      state.paused = true;
      engine.stopLoop();
      stopAllSounds();
      renderFrame(state);
    },
    resume: function () {
      if (!state.running) return;
      state.paused = false;
      engine.startLoop();
    },
    reset: function () {
      state.paused = false;
      resetRun(state);
      renderFrame(state);
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
