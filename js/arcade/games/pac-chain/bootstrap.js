import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { PAC_CHAIN_CONFIG } from './config.js';
import { createGameAdapter, registerGameAdapter, bootstrapFromAdapter } from '/js/arcade/engine/game-adapter.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';
import { createFrameDebug } from '/js/arcade/core/frame-debug.js';

export const PAC_CHAIN_ADAPTER = createGameAdapter({
  id: PAC_CHAIN_CONFIG.id,
  name: PAC_CHAIN_CONFIG.label,
  systems: { upgrade: true, director: true, event: true, mutation: true, boss: true, risk: true, meta: true, feedback: true },
  legacyBootstrap: function (root) {
    return createLegacybootstrapPacChain(root);
  },
});

registerGameAdapter(PAC_CHAIN_CONFIG, PAC_CHAIN_ADAPTER, bootstrapPacChain);

export function bootstrapPacChain(root) {
  return bootstrapFromAdapter(root, PAC_CHAIN_ADAPTER);
}

function createLegacybootstrapPacChain(root) {
  const GAME_ID = PAC_CHAIN_CONFIG.id;
  const frameDebug = createFrameDebug(GAME_ID);
  const canvas = document.getElementById('pacCanvas');
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!canvas || !ctx) {
    return { init() {}, start() {}, pause() {}, resume() {}, reset() {}, destroy() {}, getScore() { return 0; } };
  }

  const COLS = 20;
  const ROWS = 20;
  const TUNNEL_ROW = 10;
  const BASE_CELL = 28;
  const PLAYER_START = { x: 10, y: 16 };
  const BASE_LIVES = 3;
  const BASE_PELLET_VALUE = 10;
  const BASE_POWER_PELLET_VALUE = 50;
  const BASE_POWER_DURATION = 7;
  const BASE_GHOST_SPEED = 4;
  const BASE_PLAYER_SPEED = 5.2;
  const CHAIN_WINDOW = 1.7;

  const MAZE_BASE = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,0],
    [0,2,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,2,0],
    [0,1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,0,0,1,0,1,0,0,0,0,0,0,1,0,1,0,0,1,0],
    [0,1,1,1,1,0,1,1,1,0,0,1,1,1,0,1,1,1,1,0],
    [0,0,0,0,1,0,0,0,3,0,0,3,0,0,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,3,3,3,3,3,3,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,0,0,3,3,0,0,3,0,1,0,0,0,0],
    [3,3,3,3,1,3,3,0,3,3,3,3,0,3,3,1,3,3,3,3],
    [0,0,0,0,1,0,3,0,0,0,0,0,0,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,3,3,3,3,3,3,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,0,0,0,0,0,0,3,0,1,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,0],
    [0,1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,1,0],
    [0,2,1,0,1,1,1,1,1,3,3,1,1,1,1,1,0,1,2,0],
    [0,0,1,0,1,0,1,0,0,0,0,0,0,1,0,1,0,1,0,0],
    [0,1,1,1,1,0,1,1,1,1,1,1,1,1,0,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ];
  const MAZE_ALT_1 = MAZE_BASE.map((r) => r.slice());
  MAZE_ALT_1[1][6] = 0; MAZE_ALT_1[1][13] = 0; MAZE_ALT_1[3][3] = 1; MAZE_ALT_1[3][16] = 1;
  MAZE_ALT_1[6][7] = 0; MAZE_ALT_1[6][12] = 0; MAZE_ALT_1[14][9] = 1; MAZE_ALT_1[14][10] = 1;
  const MAZE_ALT_2 = MAZE_BASE.map((r) => r.slice());
  MAZE_ALT_2[4][6] = 0; MAZE_ALT_2[4][13] = 0; MAZE_ALT_2[5][7] = 1; MAZE_ALT_2[5][12] = 1;
  MAZE_ALT_2[15][2] = 1; MAZE_ALT_2[15][17] = 1; MAZE_ALT_2[17][8] = 1; MAZE_ALT_2[17][11] = 1;
  const MAZE_POOL = [MAZE_BASE, MAZE_ALT_1, MAZE_ALT_2];

  const upgradeDefs = [
    { id: 'speed', name: 'Turbo Sneakers', rarity: 'common', desc: '+10% move speed permanently this run.', apply(s) { s.run.upgrades.speed += 1; s.run.playerSpeedMult += 0.1; } },
    { id: 'pelletValue', name: 'Golden Appetite', rarity: 'common', desc: '+25% pellet score permanently this run.', apply(s) { s.run.upgrades.pelletValue += 1; s.run.pelletValueMult += 0.25; } },
    { id: 'powerDuration', name: 'Long Fuse', rarity: 'uncommon', desc: '+1.4s power duration.', apply(s) { s.run.upgrades.powerDuration += 1; s.run.powerDurationBonus += 1.4; } },
    { id: 'shield', name: 'Pocket Shield', rarity: 'rare', desc: 'Gain 1 shield charge.', apply(s) { s.run.upgrades.shield += 1; s.run.shieldCharges += 1; s.player.shieldCharges += 1; } },
    { id: 'ghostSlow', name: 'Frost Aura', rarity: 'uncommon', desc: 'Powered state slows ghosts harder.', apply(s) { s.run.upgrades.ghostSlow += 1; s.run.powerGhostSlow += 0.1; } },
    { id: 'chainBonus', name: 'Chain Reactor', rarity: 'uncommon', desc: 'Each chain tier is worth more score.', apply(s) { s.run.upgrades.chainBonus += 1; s.run.chainBonus += 0.18; } },
    { id: 'revive', name: 'Reboot Core', rarity: 'legendary', desc: 'Gain one revive token.', apply(s) { s.run.upgrades.revive += 1; s.run.revives += 1; } },
  ];

  const levelModifiers = [
    { id: 'blackout', name: 'Blackout Maze', desc: 'Limited vision cone around you.', apply(s) { s.levelState.blackout = true; s.feedback.pulseBoost += 0.12; } },
    { id: 'speedGhosts', name: 'Speed Ghosts', desc: 'All ghosts move faster this level.', apply(s) { s.levelState.ghostSpeedMult *= 1.28; } },
    { id: 'cursedPellets', name: 'Cursed Pellets', desc: 'Pellets are less valuable, pressure rises faster.', apply(s) { s.levelState.pelletValueMult *= 0.65; s.levelState.pressureMult *= 1.22; } },
    { id: 'fruitRush', name: 'Bonus Fruit Rush', desc: 'Fruit spawns often and scores big.', apply(s) { s.levelState.fruitInterval = 5.5; s.levelState.fruitScoreMult = 1.9; } },
    { id: 'reverseControls', name: 'Reverse Controls', desc: 'Movement input is inverted.', apply(s) { s.levelState.reverseControls = true; } },
    { id: 'shieldedGhosts', name: 'Shielded Ghosts', desc: 'Ghosts absorb one powered hit.', apply(s) { s.levelState.ghostShieldHits = 1; } },
    { id: 'teleportTunnels', name: 'Teleport Tunnels', desc: 'Extra tunnel hops appear in the maze.', apply(s) { s.levelState.teleportTunnels = true; } },
    { id: 'unstableWalls', name: 'Unstable Walls', desc: 'Random walls phase open and closed.', apply(s) { s.levelState.unstableWalls = true; s.levelState.unstableTimer = 2.8; } },
  ];

  const riskChoices = [
    { id: 'doubleGhosts', name: 'Double Ghosts, Double Score', desc: 'Twice the ghosts. Score multiplier x2.', apply(s) { s.run.activeRisks.doubleGhosts = s.level + 2; addBanner(s, 'Risk Armed: Double ghosts / x2 score', 'risk'); } },
    { id: 'noPowerRareUpgrade', name: 'No Power Pellets, Rare Upgrade', desc: 'No power pellets next level. Next upgrade roll is rarer.', apply(s) { s.run.activeRisks.noPowerRareUpgrade = s.level + 2; s.run.rareUpgradeBoost = Math.max(s.run.rareUpgradeBoost, 0.55); addBanner(s, 'Risk Armed: No power pellets / rare upgrade boosted', 'risk'); } },
    { id: 'blackoutBonus', name: 'Blackout Level, Bonus Reward', desc: 'Forced blackout next level. Earn bonus clear reward.', apply(s) { s.run.activeRisks.blackoutBonus = s.level + 2; addBanner(s, 'Risk Armed: Blackout bonus challenge', 'risk'); } },
    { id: 'oneLifeTriple', name: 'One Life, Triple Reward', desc: 'Drop to one life for this level. Score multiplier x3.', apply(s) { s.run.activeRisks.oneLifeTriple = s.level + 1; addBanner(s, 'Risk Armed: One life / x3 reward', 'risk'); } },
  ];

  const mutationPool = [
    { id: 'speedBurst', name: 'Burst Sprint', apply(g) { g.mutationData.speedBurstCd = 2.2 + Math.random() * 2; }, tick(s, g, dt) { g.mutationData.speedBurstCd -= dt; if (g.mutationData.speedBurstCd <= 0) { g.mutationData.speedBurstCd = 3.2 + Math.random() * 2.4; g.mutationData.speedBurst = 1.1; } if (g.mutationData.speedBurst > 0) { g.mutationData.speedBurst -= dt; g.tempSpeedMult *= 1.45; } } },
    { id: 'wallPhase', name: 'Wall Phase', apply(g) { g.mutationData.phaseTimer = 1.8 + Math.random() * 2.4; }, tick(s, g, dt) { g.mutationData.phaseTimer -= dt; if (g.mutationData.phaseTimer <= 0) { g.mutationData.phaseTimer = 2 + Math.random() * 3; g.mutationData.isPhasing = !g.mutationData.isPhasing; } } },
    { id: 'teleportOnce', name: 'Blink Hop', apply(g) { g.mutationData.teleportReady = true; }, tick(s, g) { if (g.mutationData.teleportReady && Math.random() < 0.0016 * (1 + s.director.intensity / 120)) { const safe = randomOpenTile(s, true); if (safe) { g.x = safe.x; g.y = safe.y; g.px = tileCenter(safe.x, s.cell); g.py = tileCenter(safe.y, s.cell); g.mutationData.teleportReady = false; addBanner(s, g.label + ' blinked!', 'event'); } } } },
    { id: 'spawnClone', name: 'Clone Seed', apply(g) { g.mutationData.cloneReady = true; }, tick(s, g) { if (g.mutationData.cloneReady && Math.random() < 0.0012) { g.mutationData.cloneReady = false; spawnGhost(s, 'splitter', false, true, g.x, g.y); addBanner(s, 'Mutation: ghost clone spawned', 'event'); } } },
    { id: 'resistPower', name: 'Power Resist', apply(g) { g.mutationData.powerResist = 0.5; }, tick() {} },
    { id: 'leaveTrap', name: 'Trap Trail', apply(g) { g.mutationData.trapTimer = 2.4 + Math.random(); }, tick(s, g, dt) { g.mutationData.trapTimer -= dt; if (g.mutationData.trapTimer <= 0) { g.mutationData.trapTimer = 2 + Math.random() * 2; s.traps.push({ x: Math.round(g.x), y: Math.round(g.y), ttl: 8 }); } } },
  ];

  const eventDefs = [
    { id: 'ghostAmbush', name: 'Ghost Ambush', minLevel: 2, weight: 1.2, execute(s) { spawnGhost(s, 'chaser'); spawnGhost(s, 'ambusher'); addBanner(s, 'Ambush incoming', 'event'); } },
    { id: 'goldenPellet', name: 'Golden Pellet', minLevel: 1, weight: 1.0, execute(s) { const t = randomOpenTile(s, true); if (t) { s.specialPellets.push({ x: t.x, y: t.y, kind: 'golden', ttl: 15 }); addBanner(s, 'Golden pellet spawned', 'event'); } } },
    { id: 'fruitJackpot', name: 'Fruit Jackpot', minLevel: 3, weight: 1.0, execute(s) { for (let i = 0; i < 3; i += 1) { const t = randomOpenTile(s, true); if (t) s.fruits.push({ x: t.x, y: t.y, ttl: 10 + i * 2, value: 180 + i * 100 }); } addBanner(s, 'Fruit jackpot active', 'event'); } },
    { id: 'panicChase', name: 'Panic Chase', minLevel: 4, weight: 0.9, execute(s) { s.levelState.panicTimer = 7; addBanner(s, 'Panic chase engaged', 'event'); } },
    { id: 'mazeGlitch', name: 'Maze Glitch', minLevel: 5, weight: 0.8, execute(s) { s.levelState.glitchTimer = 4.2; for (let i = 0; i < 10; i += 1) { const t = randomOpenTile(s, false); if (t && t.y !== TUNNEL_ROW) s.maze[t.y][t.x] = s.maze[t.y][t.x] === 0 ? 1 : 0; } recountPellets(s); addBanner(s, 'Maze topology shifted', 'event'); } },
    { id: 'powerSurge', name: 'Power Surge', minLevel: 3, weight: 1.0, execute(s) { s.powerTimer = Math.max(s.powerTimer, 8 + s.run.powerDurationBonus * 0.6); addBanner(s, 'Power surge', 'event'); } },
    { id: 'fakeSafePhase', name: 'Fake Safe Phase', minLevel: 6, weight: 0.6, execute(s) { s.levelState.fakeSafe = 2.5; s.levelState.pendingTrapAmbush = true; addBanner(s, 'Safe window... maybe', 'warning'); } },
    { id: 'hunterGhostSpawn', name: 'Hunter Spawn', minLevel: 6, weight: 1.1, execute(s) { spawnGhost(s, 'hunter'); addBanner(s, 'Hunter ghost entered maze', 'event'); } },
  ];

  const archetypeData = {
    chaser: { color: '#ff595e', speedMult: 1.04 }, ambusher: { color: '#ff9f1c', speedMult: 1.0 }, patrol: { color: '#8ac926', speedMult: 0.95 }, random: { color: '#1982c4', speedMult: 0.98 },
    hunter: { color: '#6a4c93', speedMult: 1.12 }, splitter: { color: '#ff66b3', speedMult: 0.94 }, healer: { color: '#00c2a8', speedMult: 0.88 }, glitch: { color: '#7b61ff', speedMult: 1.0 }, elite: { color: '#ffd166', speedMult: 1.12 },
  };

  const cueLibrary = {
    upgrade: { kind: 'chord', tones: [{ type: 'sine', freqStart: 660, freqEnd: 880, duration: 0.1, volume: 0.04, delay: 0 }, { type: 'triangle', freqStart: 880, freqEnd: 1280, duration: 0.12, volume: 0.032, delay: 0.04 }] },
    event: { kind: 'chord', tones: [{ type: 'sawtooth', freqStart: 300, freqEnd: 520, duration: 0.12, volume: 0.045, delay: 0 }, { type: 'square', freqStart: 600, freqEnd: 860, duration: 0.1, volume: 0.03, delay: 0.02 }] },
    warning: { kind: 'tone', type: 'square', freqStart: 220, freqEnd: 160, duration: 0.14, volume: 0.05 },
    boss: { kind: 'chord', tones: [{ type: 'sawtooth', freqStart: 140, freqEnd: 90, duration: 0.25, volume: 0.06, delay: 0 }, { type: 'triangle', freqStart: 280, freqEnd: 130, duration: 0.2, volume: 0.045, delay: 0.04 }] },
    legendary: { kind: 'chord', tones: [{ type: 'sine', freqStart: 780, freqEnd: 980, duration: 0.14, volume: 0.04, delay: 0 }, { type: 'sine', freqStart: 980, freqEnd: 1280, duration: 0.14, volume: 0.038, delay: 0.05 }, { type: 'triangle', freqStart: 1280, freqEnd: 1680, duration: 0.18, volume: 0.034, delay: 0.11 }] },
    recovery: { kind: 'tone', type: 'triangle', freqStart: 460, freqEnd: 560, duration: 0.11, volume: 0.035 },
  };

  const ui = {
    score: document.getElementById('score'), best: document.getElementById('best'), chain: document.getElementById('chain'), level: document.getElementById('level'),
    start: document.getElementById('startBtn'), pause: document.getElementById('pauseBtn'), reset: document.getElementById('resetBtn'), music: document.getElementById('musicMuteBtn'),
    card: canvas.closest('.game-card') || root,
  };

  let overlayEl = null;
  let bannerEl = null;

  const state = {
    cell: BASE_CELL, width: COLS * BASE_CELL, height: ROWS * BASE_CELL, rafId: 0, loopActive: false,
    isRunning: false, isPaused: false, isGameOver: false, introElapsed: 0, time: 0, dt: 0, score: 0, bestScore: ArcadeSync.getHighScore(GAME_ID),
    level: 1, lives: BASE_LIVES, run: null, maze: [], pelletsLeft: 0, player: null, ghosts: [], fruits: [], traps: [], specialPellets: [], floatingTexts: [],
    powerTimer: 0, submitDone: false, input: { dx: 1, dy: 0 }, bannerQueue: [], bannerTimer: 0, activeBanner: null, screenPulse: 0,
    feedback: { flash: 0, chaosRecovery: 0, pulseBoost: 0, warningDim: 0, bossFlash: 0 },
    levelState: null, director: null, boss: null, upgradeModal: null, riskModal: null, pendingLevelAdvance: false,
    mutedMusic: false, musicHandles: [], overlayHandlers: { open: null, close: null, resize: null },
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const tileCenter = (t, c) => t * c + c / 2;
  const cloneMaze = (base) => base.map((r) => r.slice());

  function addBanner(s, text, kind) {
    s.bannerQueue.push({ text, kind: kind || 'event', ttl: 2.1 });
    if (kind === 'warning') cue('warning');
    else if (kind === 'risk') cue('event');
  }
  function cue(key) { if (!isMuted() && cueLibrary[key]) playSound('pac-chain-' + key, cueLibrary[key]); }
  function playGameSound(id) { if (!isMuted()) playSound('pac-chain-' + id); }

  function isWall(s, x, y, allowPhase) {
    if (y === TUNNEL_ROW && (x < 0 || x >= COLS)) return false;
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
    if (allowPhase) return false;
    return s.maze[y][x] === 0;
  }
  function recountPellets(s) {
    let n = 0;
    for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) if (s.maze[y][x] === 1 || s.maze[y][x] === 2) n += 1;
    s.pelletsLeft = n;
  }
  function randomOpenTile(s, avoidSpawn) {
    for (let i = 0; i < 140; i += 1) {
      const x = 1 + Math.floor(Math.random() * (COLS - 2));
      const y = 1 + Math.floor(Math.random() * (ROWS - 2));
      if (s.maze[y][x] === 0) continue;
      if (avoidSpawn && Math.abs(x - PLAYER_START.x) < 3 && Math.abs(y - PLAYER_START.y) < 3) continue;
      return { x, y };
    }
    return null;
  }

  function updateHud() {
    if (ui.score) ui.score.textContent = String(state.score);
    if (ui.best) ui.best.textContent = String(state.bestScore);
    if (ui.chain) ui.chain.textContent = 'x' + String(state.player ? state.player.chain : 1);
    if (ui.level) ui.level.textContent = String(state.level);
  }

  function setBanner(text, kind) { if (bannerEl) { bannerEl.textContent = text; bannerEl.className = 'pc-banner show ' + (kind || 'event'); } }
  function clearBanner() { if (bannerEl) { bannerEl.className = 'pc-banner'; bannerEl.textContent = ''; } }

  function addScore(baseValue, x, y, reason) {
    let chainMult = 1;
    if (reason === 'pellet' || reason === 'power') {
      const delta = state.time - state.player.lastPelletAt;
      state.player.chain = delta <= CHAIN_WINDOW ? state.player.chain + 1 : 1;
      state.player.lastPelletAt = state.time;
      chainMult = 1 + Math.max(0, state.player.chain - 1) * (0.14 + state.run.chainBonus);
    }
    if (reason === 'ghost') {
      state.player.ghostChain += 1;
      chainMult = 1 + state.player.ghostChain * 0.22;
    }
    const points = Math.floor(baseValue * chainMult * state.levelState.scoreMult * state.run.pelletValueMult * state.levelState.pelletValueMult);
    state.score += points;
    if (state.score > state.bestScore) { state.bestScore = state.score; ArcadeSync.setHighScore(GAME_ID, state.bestScore); }
    if (typeof x === 'number' && typeof y === 'number') state.floatingTexts.push({ x, y, text: '+' + points, life: 0.9, vy: -20 });
    state.screenPulse = Math.min(1, state.screenPulse + 0.1);
    updateHud();
  }

  function createOverlayElements() {
    if (!ui.card || overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.className = 'pc-overlay hidden';
    overlayEl.setAttribute('aria-live', 'polite');
    bannerEl = document.createElement('div');
    bannerEl.className = 'pc-banner';
    ui.card.appendChild(overlayEl);
    ui.card.appendChild(bannerEl);
  }

  function showModal(title, subtitle, choices, onPick) {
    if (!overlayEl) return;
    state.isPaused = true;
    const panel = document.createElement('div');
    panel.className = 'pc-modal';
    const h2 = document.createElement('h2');
    h2.textContent = title;
    const p = document.createElement('p');
    p.textContent = subtitle;
    const grid = document.createElement('div');
    grid.className = 'pc-choice-grid';
    choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pc-choice ' + (choice.rarity || 'common');
      btn.innerHTML = '<strong>' + choice.name + '</strong><span>' + choice.desc + '</span>';
      btn.addEventListener('click', () => { hideModal(); onPick(choice); });
      grid.appendChild(btn);
    });
    panel.appendChild(h2);
    panel.appendChild(p);
    panel.appendChild(grid);
    overlayEl.innerHTML = '';
    overlayEl.appendChild(panel);
    overlayEl.classList.remove('hidden');
  }
  function hideModal() { if (overlayEl) { overlayEl.classList.add('hidden'); overlayEl.innerHTML = ''; } state.isPaused = false; }

  function initRunState() {
    state.run = {
      upgrades: { speed: 0, pelletValue: 0, powerDuration: 0, shield: 0, ghostSlow: 0, chainBonus: 0, revive: 0 },
      playerSpeedMult: 1, pelletValueMult: 1, powerDurationBonus: 0, powerGhostSlow: 0.28, chainBonus: 0, shieldCharges: 0, revives: 0,
      activeRisks: {}, rareUpgradeBoost: 0, stats: { ghostsEaten: 0, highestIntensity: 0, eventsTriggered: 0, eliteDefeated: 0 },
    };
  }
  function buildLevelState() {
    state.levelState = {
      scoreMult: 1, ghostSpeedMult: 1, pelletValueMult: 1, pressureMult: 1, fruitInterval: 9.5, fruitScoreMult: 1,
      reverseControls: false, blackout: false, ghostShieldHits: 0, teleportTunnels: false, unstableWalls: false, unstableTimer: 0,
      panicTimer: 0, fakeSafe: 0, pendingTrapAmbush: false, glitchTimer: 0, modifiers: [],
    };
  }
  function applyRiskToggles() {
    const active = state.run.activeRisks;
    if (active.doubleGhosts && state.level <= active.doubleGhosts) { state.levelState.scoreMult *= 2; state.levelState.doubleGhosts = true; }
    if (active.noPowerRareUpgrade && state.level <= active.noPowerRareUpgrade) state.levelState.noPowerPellets = true;
    if (active.blackoutBonus && state.level <= active.blackoutBonus) { const mod = levelModifiers.find((m) => m.id === 'blackout'); if (mod) { mod.apply(state); state.levelState.modifiers.push(mod); } state.levelState.blackoutBonus = true; }
    if (active.oneLifeTriple && state.level <= active.oneLifeTriple) { state.levelState.scoreMult *= 3; state.lives = Math.min(state.lives, 1); }
  }
  function chooseLevelModifier() {
    if (state.levelState.blackout || state.level < 2) return;
    const count = state.level % 6 === 0 ? 2 : 1;
    const pool = levelModifiers.slice();
    for (let i = 0; i < count; i += 1) {
      if (!pool.length) break;
      const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      pick.apply(state);
      state.levelState.modifiers.push(pick);
    }
    if (state.levelState.modifiers.length) addBanner(state, 'Modifier: ' + state.levelState.modifiers.map((m) => m.name).join(' + '), 'warning');
  }
  function initDirector() { state.director = { intensity: 12, pressure: 0, threshold: 40, eventHistory: [], eventCooldown: 0 }; }
  function spawnPlayer() {
    state.player = {
      x: PLAYER_START.x, y: PLAYER_START.y, px: tileCenter(PLAYER_START.x, state.cell), py: tileCenter(PLAYER_START.y, state.cell),
      dx: 0, dy: 0, ndx: 1, ndy: 0, speed: BASE_PLAYER_SPEED, chain: 1, ghostChain: 0, lastPelletAt: -999,
      shieldCharges: state.run ? state.run.shieldCharges : 0,
    };
  }
  function makeGhost(archetype, x, y, elite, isClone) {
    const base = archetypeData[archetype] || archetypeData.random;
    return {
      id: Math.random().toString(16).slice(2), archetype, label: elite ? 'Elite Ghost' : archetype.charAt(0).toUpperCase() + archetype.slice(1),
      x, y, px: tileCenter(x, state.cell), py: tileCenter(y, state.cell), dx: 0, dy: -1,
      speed: BASE_GHOST_SPEED * base.speedMult, color: base.color, frightened: 0, dead: false, shieldHits: state.levelState ? state.levelState.ghostShieldHits : 0,
      teleportCd: 2 + Math.random() * 2, splitCd: 5 + Math.random() * 5, healCd: 3 + Math.random() * 3, targetPatrolIndex: 0, mutation: null, mutationData: {},
      isElite: !!elite, eliteMaxHp: elite ? 180 + state.level * 28 : 0, eliteHp: elite ? 180 + state.level * 28 : 0, elitePhase: 1, isClone: !!isClone, tempSpeedMult: 1,
    };
  }
  function spawnGhost(s, archetype, elite, isClone, forcedX, forcedY) {
    const tile = (typeof forcedX === 'number' && typeof forcedY === 'number') ? { x: forcedX, y: forcedY } : randomOpenTile(s, true);
    if (!tile) return null;
    const ghost = makeGhost(archetype, tile.x, tile.y, elite, isClone);
    if (s.level >= 10 && !elite && Math.random() < 0.45) { const mut = mutationPool[Math.floor(Math.random() * mutationPool.length)]; ghost.mutation = mut; ghost.mutationData = {}; mut.apply(ghost); }
    s.ghosts.push(ghost);
    return ghost;
  }
  function spawnGhostPack() {
    state.ghosts.length = 0;
    const countBase = 4 + Math.floor(state.level / 2);
    const doubled = state.levelState.doubleGhosts ? countBase : 0;
    const total = Math.min(18, countBase + doubled);
    const types = ['chaser', 'ambusher', 'patrol', 'random', 'hunter', 'splitter', 'healer', 'glitch'];
    for (let i = 0; i < total; i += 1) spawnGhost(state, types[i % types.length]);
    if (state.level % 5 === 0) {
      const boss = spawnGhost(state, 'elite', true);
      if (boss) { state.boss = boss; state.feedback.bossFlash = 1.2; addBanner(state, 'Elite ghost has entered the maze', 'warning'); cue('boss'); }
    } else state.boss = null;
  }
  function buildMazeForLevel() {
    state.maze = cloneMaze(MAZE_POOL[(state.level - 1) % MAZE_POOL.length]);
    if (state.levelState.noPowerPellets) for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) if (state.maze[y][x] === 2) state.maze[y][x] = 1;
    recountPellets(state);
  }

  function applyScale() {
    const overlay = document.getElementById('game-overlay');
    const inOverlay = !!(overlay && overlay.classList.contains('active'));
    const stage = inOverlay ? overlay.querySelector('.game-stage') : null;
    const card = ui.card;
    const hud = card ? card.querySelector('.hud') : null;
    const row = card ? card.querySelector('.row') : null;
    let availW, availH;
    if (inOverlay && stage) {
      const pad = 24;
      availW = Math.max(260, stage.clientWidth - pad);
      availH = Math.max(260, stage.clientHeight - pad - (hud ? hud.offsetHeight : 0) - (row ? row.offsetHeight : 0) - 24);
    } else {
      availW = card ? card.clientWidth - 12 : 560;
      availH = window.innerHeight * 0.72;
    }
    const cell = Math.max(16, Math.floor(Math.min(availW / COLS, availH / ROWS)));
    if (cell === state.cell) return;
    const old = state.cell;
    const scale = cell / old;
    state.cell = cell;
    state.width = COLS * cell;
    state.height = ROWS * cell;
    canvas.width = state.width;
    canvas.height = state.height;
    canvas.style.width = state.width + 'px';
    canvas.style.height = state.height + 'px';
    if (state.player) { state.player.px *= scale; state.player.py *= scale; }
    state.ghosts.forEach((g) => { g.px *= scale; g.py *= scale; });
    state.floatingTexts.forEach((f) => { f.x *= scale; f.y *= scale; f.vy *= scale; });
  }

  function updateDirector(dt) {
    const d = state.director;
    const pelletRatio = state.pelletsLeft / Math.max(1, ROWS * COLS);
    const dangerGhosts = state.ghosts.reduce((acc, g) => {
      const dx = g.x - state.player.x;
      const dy = g.y - state.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 4.5 && g.frightened <= 0 && !g.dead) return acc + 1;
      return acc;
    }, 0);
    const pressureGain = (4.2 + state.level * 0.55 + dangerGhosts * 1.5 + (1 - pelletRatio) * 5.5 + (BASE_LIVES - state.lives) * 1.3) * state.levelState.pressureMult;
    d.pressure += pressureGain * dt;
    d.eventCooldown = Math.max(0, d.eventCooldown - dt);
    d.intensity = clamp(12 + state.level * 2.4 + d.pressure * 0.45 + dangerGhosts * 4.4, 0, 100);
    d.threshold = clamp(36 + state.level * 1.4 + d.eventHistory.length * 2.4, 36, 95);
    state.run.stats.highestIntensity = Math.max(state.run.stats.highestIntensity, d.intensity);
    state.feedback.pulseBoost = Math.max(0, state.feedback.pulseBoost - dt * 0.35);
    state.screenPulse = Math.max(state.screenPulse, d.intensity / 100 * 0.25 + state.feedback.pulseBoost);
    if (!state.isPaused && !state.isGameOver && d.eventCooldown <= 0 && d.pressure >= d.threshold) triggerDirectorEvent();
  }
  function triggerDirectorEvent() {
    const d = state.director;
    const history = d.eventHistory;
    const available = eventDefs.filter((e) => state.level >= e.minLevel && !history.includes(e.id) && !(e.id === 'fakeSafePhase' && state.levelState.fakeSafe > 0));
    const pool = available.length ? available : eventDefs.filter((e) => state.level >= e.minLevel);
    if (!pool.length) return;
    let total = 0;
    pool.forEach((i) => { total += i.weight; });
    let roll = Math.random() * total;
    let picked = pool[0];
    for (let i = 0; i < pool.length; i += 1) { roll -= pool[i].weight; if (roll <= 0) { picked = pool[i]; break; } }
    d.pressure = Math.max(0, d.pressure - d.threshold * 0.72);
    d.eventCooldown = clamp(8 - state.level * 0.18, 3.3, 8.2);
    history.unshift(picked.id);
    while (history.length > 3) history.pop();
    state.run.stats.eventsTriggered += 1;
    addBanner(state, 'Signal detected: ' + picked.name, 'warning');
    cue('event');
    state.feedback.warningDim = 0.9;
    setTimeout(() => { if (!state.isGameOver) { picked.execute(state); state.feedback.flash = Math.max(state.feedback.flash, 0.3); } }, 1100);
  }

  function maybeSpawnFruit(dt) {
    state.levelState.fruitTimer = (state.levelState.fruitTimer || state.levelState.fruitInterval) - dt;
    if (state.levelState.fruitTimer <= 0) {
      state.levelState.fruitTimer = state.levelState.fruitInterval;
      const tile = randomOpenTile(state, true);
      if (tile) state.fruits.push({ x: tile.x, y: tile.y, ttl: 10, value: Math.floor((120 + state.level * 8) * state.levelState.fruitScoreMult) });
    }
    for (let i = state.fruits.length - 1; i >= 0; i -= 1) { state.fruits[i].ttl -= dt; if (state.fruits[i].ttl <= 0) state.fruits.splice(i, 1); }
    for (let i = state.specialPellets.length - 1; i >= 0; i -= 1) { state.specialPellets[i].ttl -= dt; if (state.specialPellets[i].ttl <= 0) state.specialPellets.splice(i, 1); }
    for (let i = state.traps.length - 1; i >= 0; i -= 1) { state.traps[i].ttl -= dt; if (state.traps[i].ttl <= 0) state.traps.splice(i, 1); }
  }
  function updateUnstableWalls(dt) {
    if (!state.levelState.unstableWalls) return;
    state.levelState.unstableTimer -= dt;
    if (state.levelState.unstableTimer > 0) return;
    state.levelState.unstableTimer = 2 + Math.random() * 2.8;
    for (let i = 0; i < 6; i += 1) {
      const t = randomOpenTile(state, false);
      if (!t || t.y === TUNNEL_ROW) continue;
      if (Math.abs(t.x - Math.round(state.player.x)) < 2 && Math.abs(t.y - Math.round(state.player.y)) < 2) continue;
      state.maze[t.y][t.x] = state.maze[t.y][t.x] === 0 ? 1 : 0;
    }
    recountPellets(state);
  }
  function processInput() {
    let ndx = state.input.dx;
    let ndy = state.input.dy;
    if (state.levelState.reverseControls) { ndx = -ndx; ndy = -ndy; }
    state.player.ndx = ndx; state.player.ndy = ndy;
  }

  function moveActor(actor, speed, dt, allowPhase) {
    const cell = state.cell;
    const cx = Math.round(actor.x), cy = Math.round(actor.y);
    const centerX = tileCenter(cx, cell), centerY = tileCenter(cy, cell);
    const nearCenter = Math.abs(actor.px - centerX) < cell * 0.12 && Math.abs(actor.py - centerY) < cell * 0.12;
    if (nearCenter && typeof actor.ndx === 'number' && typeof actor.ndy === 'number') {
      const tx = cx + actor.ndx, ty = cy + actor.ndy;
      if (!isWall(state, tx, ty, allowPhase)) { actor.dx = actor.ndx; actor.dy = actor.ndy; }
    }
    const step = speed * cell * dt;
    const nextX = actor.px + actor.dx * step, nextY = actor.py + actor.dy * step;
    const targetX = Math.round(nextX / cell - 0.5), targetY = Math.round(nextY / cell - 0.5);
    if (!isWall(state, targetX, targetY, allowPhase)) { actor.px = nextX; actor.py = nextY; } else { actor.dx = 0; actor.dy = 0; actor.px = centerX; actor.py = centerY; }
    actor.x = (actor.px - cell / 2) / cell;
    actor.y = (actor.py - cell / 2) / cell;
    if (Math.round(actor.y) === TUNNEL_ROW) {
      if (actor.x < 0) { actor.x = COLS - 1; actor.px = tileCenter(COLS - 1, cell); }
      else if (actor.x >= COLS) { actor.x = 0; actor.px = tileCenter(0, cell); }
    }
    if (state.levelState.teleportTunnels) {
      if (Math.round(actor.x) === 1 && Math.round(actor.y) === 1) { actor.x = COLS - 2; actor.y = ROWS - 2; }
      else if (Math.round(actor.x) === COLS - 2 && Math.round(actor.y) === ROWS - 2) { actor.x = 1; actor.y = 1; }
      actor.px = tileCenter(actor.x, cell); actor.py = tileCenter(actor.y, cell);
    }
  }

  function ghostDecision(ghost) {
    const cx = Math.round(ghost.x), cy = Math.round(ghost.y);
    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    const valid = dirs.filter((d) => !isWall(state, cx + d.dx, cy + d.dy, ghost.mutationData.isPhasing));
    if (!valid.length) return;
    const opposite = { dx: -ghost.dx, dy: -ghost.dy };
    const filtered = valid.filter((d) => !(d.dx === opposite.dx && d.dy === opposite.dy));
    const choices = filtered.length ? filtered : valid;
    let target = { x: state.player.x, y: state.player.y };
    if (ghost.archetype === 'ambusher') target = { x: state.player.x + state.player.dx * 2.4, y: state.player.y + state.player.dy * 2.4 };
    else if (ghost.archetype === 'patrol') {
      const route = [{ x: 2, y: 2 }, { x: COLS - 3, y: 2 }, { x: COLS - 3, y: ROWS - 3 }, { x: 2, y: ROWS - 3 }];
      if (!route[ghost.targetPatrolIndex]) ghost.targetPatrolIndex = 0;
      target = route[ghost.targetPatrolIndex];
      const dx = target.x - ghost.x, dy = target.y - ghost.y;
      if (Math.abs(dx) + Math.abs(dy) < 1) ghost.targetPatrolIndex = (ghost.targetPatrolIndex + 1) % route.length;
    } else if (ghost.archetype === 'random') {
      if (Math.random() < 0.24) { const pick = choices[Math.floor(Math.random() * choices.length)]; ghost.dx = pick.dx; ghost.dy = pick.dy; return; }
      target = randomOpenTile(state, false) || target;
    } else if (ghost.archetype === 'hunter') target = { x: state.player.x + state.player.dx * (2 + state.director.intensity / 40), y: state.player.y + state.player.dy * (2 + state.director.intensity / 40) };
    else if (ghost.archetype === 'splitter') {
      ghost.splitCd -= state.dt;
      if (ghost.splitCd <= 0) { ghost.splitCd = 7 + Math.random() * 5; if (state.ghosts.length < 16) { spawnGhost(state, 'random', false, true, Math.round(ghost.x), Math.round(ghost.y)); addBanner(state, 'Splitter divided', 'event'); } }
    } else if (ghost.archetype === 'healer') {
      const ally = state.ghosts.find((g) => g !== ghost && !g.dead && g.frightened <= 0);
      if (ally) target = { x: ally.x, y: ally.y };
      ghost.healCd -= state.dt;
      if (ghost.healCd <= 0) { ghost.healCd = 3.5 + Math.random() * 2; state.ghosts.forEach((g) => { if (g !== ghost && !g.dead) { const dx = g.x - ghost.x, dy = g.y - ghost.y; if (dx * dx + dy * dy < 16) g.tempSpeedMult *= 1.1; } }); }
    } else if (ghost.archetype === 'glitch') {
      ghost.teleportCd -= state.dt;
      if (ghost.teleportCd <= 0) { ghost.teleportCd = 4.4 + Math.random() * 3; const jump = randomOpenTile(state, true); if (jump) { ghost.x = jump.x; ghost.y = jump.y; ghost.px = tileCenter(ghost.x, state.cell); ghost.py = tileCenter(ghost.y, state.cell); } }
      target = { x: state.player.x + (Math.random() - 0.5) * 4, y: state.player.y + (Math.random() - 0.5) * 4 };
    } else if (ghost.isElite) {
      if (ghost.eliteHp <= ghost.eliteMaxHp * 0.33) { ghost.elitePhase = 3; target = { x: state.player.x + state.player.dx * 3, y: state.player.y + state.player.dy * 3 }; ghost.tempSpeedMult *= 1.35; }
      else if (ghost.eliteHp <= ghost.eliteMaxHp * 0.66) { ghost.elitePhase = 2; target = { x: state.player.x + (Math.random() - 0.5) * 2, y: state.player.y + (Math.random() - 0.5) * 2 }; ghost.tempSpeedMult *= 1.2; }
    }
    let best = choices[0], bestScore = Number.POSITIVE_INFINITY;
    choices.forEach((d) => { const tx = cx + d.dx, ty = cy + d.dy; const dist = (tx - target.x) ** 2 + (ty - target.y) ** 2; const score = ghost.frightened > 0 ? -dist : dist; if (score < bestScore) { bestScore = score; best = d; } });
    ghost.dx = best.dx; ghost.dy = best.dy;
  }

  function updatePlayer(dt) {
    processInput();
    state.player.speed = BASE_PLAYER_SPEED * state.run.playerSpeedMult * (1 + state.level * 0.02);
    moveActor(state.player, state.player.speed, dt, false);
    const cx = Math.round(state.player.x), cy = Math.round(state.player.y);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
    const tile = state.maze[cy][cx];
    if (tile === 1 || tile === 2) {
      state.maze[cy][cx] = 3;
      state.pelletsLeft = Math.max(0, state.pelletsLeft - 1);
      if (tile === 1) { addScore(BASE_PELLET_VALUE * (1 + state.level * 0.02), tileCenter(cx, state.cell), tileCenter(cy, state.cell), 'pellet'); playGameSound('pellet'); }
      else { state.powerTimer = Math.max(state.powerTimer, BASE_POWER_DURATION + state.run.powerDurationBonus); addScore(BASE_POWER_PELLET_VALUE, tileCenter(cx, state.cell), tileCenter(cy, state.cell), 'power'); playGameSound('power'); }
    }
    for (let i = state.fruits.length - 1; i >= 0; i -= 1) {
      const fruit = state.fruits[i];
      if (fruit.x === cx && fruit.y === cy) { addScore(fruit.value, tileCenter(cx, state.cell), tileCenter(cy, state.cell), 'fruit'); state.fruits.splice(i, 1); cue('legendary'); }
    }
    for (let i = state.specialPellets.length - 1; i >= 0; i -= 1) {
      const pellet = state.specialPellets[i];
      if (pellet.x === cx && pellet.y === cy) { addScore(260 + state.level * 10, tileCenter(cx, state.cell), tileCenter(cy, state.cell), 'golden'); state.powerTimer = Math.max(state.powerTimer, 7 + state.run.powerDurationBonus); state.specialPellets.splice(i, 1); cue('legendary'); }
    }
    for (let i = state.traps.length - 1; i >= 0; i -= 1) if (state.traps[i].x === cx && state.traps[i].y === cy) { state.traps[i].ttl = 0; onPlayerHit(); break; }
    if (state.pelletsLeft <= 0 && !state.pendingLevelAdvance) { state.pendingLevelAdvance = true; onLevelComplete(); }
  }
  function onPlayerHit() {
    if (state.player.shieldCharges > 0) { state.player.shieldCharges -= 1; state.run.shieldCharges = Math.max(0, state.run.shieldCharges - 1); addBanner(state, 'Shield absorbed impact', 'event'); cue('recovery'); return; }
    state.lives -= 1;
    playGameSound('hit');
    state.feedback.flash = 0.4;
    state.feedback.warningDim = 0.6;
    if (state.lives <= 0) {
      if (state.run.revives > 0) { state.run.revives -= 1; state.lives = 1; state.player.shieldCharges += 1; addBanner(state, 'Revive consumed', 'warning'); cue('legendary'); }
      else { void onGameOver(); return; }
    }
    spawnPlayer();
    state.player.chain = 1;
    state.player.ghostChain = 0;
  }

  function updateGhosts(dt) {
    const powerSlow = clamp(1 - (state.run.powerGhostSlow + state.level * 0.004), 0.45, 0.82);
    for (let i = state.ghosts.length - 1; i >= 0; i -= 1) {
      const ghost = state.ghosts[i];
      if (!ghost || ghost.dead) continue;
      ghost.tempSpeedMult = 1;
      if (ghost.mutation && ghost.mutation.tick) ghost.mutation.tick(state, ghost, dt);
      if (ghost.frightened > 0) ghost.frightened = Math.max(0, ghost.frightened - dt);
      ghostDecision(ghost);
      const panicBoost = state.levelState.panicTimer > 0 ? 1.3 : 1;
      const frightMult = ghost.frightened > 0 ? powerSlow : 1;
      const speed = ghost.speed * state.levelState.ghostSpeedMult * panicBoost * frightMult * ghost.tempSpeedMult * (1 + state.level * 0.018);
      moveActor(ghost, speed, dt, !!ghost.mutationData.isPhasing);
      const dx = ghost.x - state.player.x, dy = ghost.y - state.player.y;
      const collision = dx * dx + dy * dy < 0.42;
      if (collision) {
        if (state.powerTimer > 0 && !ghost.isElite) {
          if (ghost.shieldHits > 0) { ghost.shieldHits -= 1; addBanner(state, ghost.label + ' shield cracked', 'event'); }
          else { ghost.dead = true; state.run.stats.ghostsEaten += 1; addScore(180 + state.level * 9, tileCenter(ghost.x, state.cell), tileCenter(ghost.y, state.cell), 'ghost'); playGameSound('ghost-eaten'); }
        } else if (state.powerTimer > 0 && ghost.isElite) {
          ghost.eliteHp -= 18 + state.level * 0.7;
          addScore(120, tileCenter(ghost.x, state.cell), tileCenter(ghost.y, state.cell), 'boss-hit');
          if (ghost.eliteHp <= 0) { ghost.dead = true; state.run.stats.eliteDefeated += 1; addScore(2400 + state.level * 120, tileCenter(ghost.x, state.cell), tileCenter(ghost.y, state.cell), 'boss-kill'); addBanner(state, 'Elite defeated', 'event'); cue('legendary'); state.boss = null; }
        } else {
          onPlayerHit();
          if (state.isGameOver) return;
        }
      }
    }
    state.ghosts = state.ghosts.filter((g) => !g.dead);
    if (state.powerTimer > 0) {
      const dur = BASE_POWER_DURATION + state.run.powerDurationBonus;
      state.ghosts.forEach((g) => { if (!g.dead) g.frightened = Math.max(g.frightened, dur * (g.mutationData.powerResist || 1)); });
    }
    if (state.levelState.fakeSafe > 0) {
      state.levelState.fakeSafe -= dt;
      if (state.levelState.fakeSafe <= 0 && state.levelState.pendingTrapAmbush) { state.levelState.pendingTrapAmbush = false; state.levelState.panicTimer = Math.max(state.levelState.panicTimer, 5.5); spawnGhost(state, 'hunter'); addBanner(state, 'Fake safe phase ended', 'warning'); }
    }
    if (state.levelState.panicTimer > 0) state.levelState.panicTimer -= dt;
  }
  function updateEffects(dt) {
    for (let i = state.floatingTexts.length - 1; i >= 0; i -= 1) { const ft = state.floatingTexts[i]; ft.life -= dt; ft.y += ft.vy * dt; if (ft.life <= 0) state.floatingTexts.splice(i, 1); }
    state.feedback.flash = Math.max(0, state.feedback.flash - dt * 1.8);
    state.feedback.warningDim = Math.max(0, state.feedback.warningDim - dt * 1.4);
    state.feedback.bossFlash = Math.max(0, state.feedback.bossFlash - dt * 0.7);
    if (state.feedback.chaosRecovery > 0) { state.feedback.chaosRecovery = Math.max(0, state.feedback.chaosRecovery - dt); if (state.feedback.chaosRecovery <= 0) { addBanner(state, 'Recovery window', 'event'); cue('recovery'); } }
    if (state.screenPulse > 0) state.screenPulse = Math.max(0, state.screenPulse - dt * 0.4);
  }
  function updateBanners(dt) {
    if (!state.activeBanner && state.bannerQueue.length) { state.activeBanner = state.bannerQueue.shift(); state.bannerTimer = state.activeBanner.ttl; setBanner(state.activeBanner.text, state.activeBanner.kind); }
    if (!state.activeBanner) return;
    state.bannerTimer -= dt;
    if (state.bannerTimer <= 0) { state.activeBanner = null; clearBanner(); if (!state.bannerQueue.length) state.feedback.chaosRecovery = 1.8; }
  }

  function rollUpgradeChoices(count) {
    const rarityWeight = { common: 1, uncommon: 0.8, rare: 0.45 + state.run.rareUpgradeBoost, legendary: 0.2 + state.run.rareUpgradeBoost * 0.4 };
    const byId = {};
    for (let i = 0; i < 30 && Object.keys(byId).length < count; i += 1) {
      const pick = upgradeDefs[Math.floor(Math.random() * upgradeDefs.length)];
      if (Math.random() <= clamp(rarityWeight[pick.rarity] || 1, 0.08, 1)) byId[pick.id] = pick;
    }
    const picks = Object.values(byId);
    while (picks.length < count) { const pick = upgradeDefs[Math.floor(Math.random() * upgradeDefs.length)]; if (!picks.includes(pick)) picks.push(pick); }
    state.run.rareUpgradeBoost = Math.max(0, state.run.rareUpgradeBoost - 0.25);
    return picks.slice(0, count);
  }
  function rollRiskChoices() {
    const pool = riskChoices.slice(), picks = [];
    while (pool.length && picks.length < 3) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return picks;
  }
  function nextLevel() {
    buildLevelState();
    applyRiskToggles();
    chooseLevelModifier();
    buildMazeForLevel();
    spawnPlayer();
    state.player.shieldCharges = state.run.shieldCharges;
    state.powerTimer = 0;
    state.fruits.length = 0; state.specialPellets.length = 0; state.traps.length = 0;
    spawnGhostPack();
    state.feedback.bossFlash = state.level % 5 === 0 ? 1.2 : 0;
    state.feedback.flash = 0.2;
    state.isPaused = false;
    updateHud();
  }
  function onLevelComplete() {
    playGameSound('level-complete');
    addBanner(state, 'Level ' + state.level + ' clear', 'event');
    if (state.levelState.blackoutBonus) addScore(900 + state.level * 30, tileCenter(state.player.x, state.cell), tileCenter(state.player.y, state.cell), 'bonus');
    state.isPaused = true;
    state.powerTimer = 0;
    state.feedback.flash = 0.32;
    setTimeout(() => {
      if (state.isGameOver) return;
      state.upgradeModal = true;
      showModal('Upgrade Choice', 'Pick one permanent run upgrade', rollUpgradeChoices(3), (choice) => {
        state.upgradeModal = false;
        choice.apply(state);
        cue(choice.rarity === 'legendary' ? 'legendary' : 'upgrade');
        addBanner(state, 'Upgrade: ' + choice.name, 'event');
        state.level += 1;
        state.pendingLevelAdvance = false;
        if (state.level % 3 === 0) {
          state.riskModal = true;
          showModal('Risk / Reward', 'Take one gamble for extra upside', rollRiskChoices(), (risk) => { state.riskModal = false; risk.apply(state); nextLevel(); });
        } else nextLevel();
      });
    }, 520);
  }

  function computeRunRating() {
    const total = state.score / 1200 + state.level * 3.5 + state.run.stats.ghostsEaten * 1.6 + state.run.stats.highestIntensity * 0.45;
    if (total >= 220) return 'LEGEND';
    if (total >= 160) return 'S';
    if (total >= 120) return 'A';
    if (total >= 90) return 'B';
    if (total >= 60) return 'C';
    return 'D';
  }
  function persistMeta(summary) {
    const key = 'pacchain_meta_v2';
    let meta;
    try { meta = JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) { meta = {}; }
    const milestones = Array.isArray(meta.milestones) ? meta.milestones.slice() : [];
    const unlock = (id, text) => { if (!milestones.find((m) => m.id === id)) milestones.push({ id, text, at: Date.now() }); };
    if (summary.level >= 10) unlock('lvl10', 'Reached level 10');
    if (summary.level >= 20) unlock('lvl20', 'Reached level 20');
    if (summary.score >= 25000) unlock('score25k', 'Scored 25,000');
    if (summary.highestIntensity >= 90) unlock('intensity90', 'Survived intensity 90+');
    if (summary.ghostsEaten >= 60) unlock('ghosts60', 'Ate 60 ghosts in one run');
    const runs = Array.isArray(meta.recentRuns) ? meta.recentRuns.slice(0, 9) : [];
    runs.unshift(summary);
    meta.highestLevel = Math.max(meta.highestLevel || 0, summary.level);
    meta.bestScore = Math.max(meta.bestScore || 0, summary.score);
    meta.bestGhostsEaten = Math.max(meta.bestGhostsEaten || 0, summary.ghostsEaten);
    meta.highestIntensity = Math.max(meta.highestIntensity || 0, summary.highestIntensity);
    meta.lastRun = summary;
    meta.recentRuns = runs;
    meta.milestones = milestones;
    try { localStorage.setItem(key, JSON.stringify(meta)); } catch (_) {}
  }
  function canSubmitCompetitive() {
    const identity = typeof window !== 'undefined' ? window.MOONBOYS_IDENTITY : null;
    return !!(identity && typeof identity.isTelegramLinked === 'function' && identity.isTelegramLinked());
  }
  function resolveCompetitivePlayer() {
    const identity = typeof window !== 'undefined' ? window.MOONBOYS_IDENTITY : null;
    if (identity && typeof identity.getTelegramName === 'function') {
      const n = identity.getTelegramName();
      if (n && String(n).trim()) return String(n).trim();
    }
    return ArcadeSync.getPlayer();
  }
  async function onGameOver() {
    state.isGameOver = true;
    state.isRunning = false;
    state.isPaused = false;
    stopMusic();
    stopAllSounds();
    playGameSound('death');
    const summary = {
      ts: Date.now(),
      score: state.score,
      level: state.level,
      ghostsEaten: state.run.stats.ghostsEaten,
      highestIntensity: Math.round(state.run.stats.highestIntensity),
      rating: computeRunRating(),
      eventsTriggered: state.run.stats.eventsTriggered,
      eliteDefeated: state.run.stats.eliteDefeated,
    };
    persistMeta(summary);
    addBanner(state, 'Run rating: ' + summary.rating, 'event');
    if (!state.submitDone && canSubmitCompetitive()) {
      state.submitDone = true;
      try { await submitScore(resolveCompetitivePlayer(), state.score, GAME_ID); } catch (_) {}
    }
    if (typeof window !== 'undefined' && typeof window.showGameOverModal === 'function') window.showGameOverModal(state.score);
  }

  function update(dt) {
    state.dt = dt;
    state.time += dt;
    if (!state.isRunning || state.isPaused || state.isGameOver) { state.introElapsed += dt; updateBanners(dt); updateEffects(dt); return; }
    state.powerTimer = Math.max(0, state.powerTimer - dt);
    updateDirector(dt);
    updateUnstableWalls(dt);
    maybeSpawnFruit(dt);
    updatePlayer(dt);
    if (state.isGameOver) return;
    updateGhosts(dt);
    updateBanners(dt);
    updateEffects(dt);
  }

  function drawMaze() {
    const c = state.cell;
    for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) {
      const v = state.maze[y][x], px = x * c, py = y * c;
      if (v === 0) { ctx.fillStyle = '#152238'; ctx.fillRect(px, py, c, c); ctx.strokeStyle = 'rgba(64,118,216,0.3)'; ctx.strokeRect(px + 0.5, py + 0.5, c - 1, c - 1); continue; }
      ctx.fillStyle = '#08101f'; ctx.fillRect(px, py, c, c);
      if (v === 1 || v === 2) { ctx.beginPath(); ctx.fillStyle = v === 2 ? '#ffe56f' : '#f7c948'; ctx.arc(px + c / 2, py + c / 2, v === 2 ? c * 0.15 : c * 0.08, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  function drawPlayer() {
    const c = state.cell, x = state.player.px, y = state.player.py, r = c * 0.42;
    const facing = Math.atan2(state.player.dy || 0, state.player.dx || 1);
    const mouth = 0.16 + Math.abs(Math.sin(state.time * 11)) * 0.28;
    ctx.fillStyle = '#ffe144';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, facing + mouth, facing - mouth + Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    if (state.player.shieldCharges > 0) {
      ctx.strokeStyle = 'rgba(120,220,255,0.9)';
      ctx.lineWidth = Math.max(2, c * 0.08);
      ctx.beginPath();
      ctx.arc(x, y, r + c * 0.12, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  function drawGhost(ghost) {
    const c = state.cell, x = ghost.px, y = ghost.py, r = c * (ghost.isElite ? 0.48 : 0.39);
    let color = ghost.color;
    if (ghost.frightened > 0) color = '#2ec5ff';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.14, r, Math.PI, 0);
    ctx.lineTo(x + r, y + r * 0.62);
    for (let i = 0; i < 4; i += 1) ctx.lineTo(x + r - (i + 0.5) * (r * 0.5), y + (i % 2 === 0 ? r * 0.62 : r * 0.3));
    ctx.lineTo(x - r, y + r * 0.62);
    ctx.closePath();
    ctx.fill();
    const eyeDx = clamp(state.player.x - ghost.x, -1, 1) * r * 0.14, eyeDy = clamp(state.player.y - ghost.y, -1, 1) * r * 0.14;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - r * 0.34, y - r * 0.2, r * 0.24, 0, Math.PI * 2);
    ctx.arc(x + r * 0.34, y - r * 0.2, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(x - r * 0.34 + eyeDx, y - r * 0.2 + eyeDy, r * 0.11, 0, Math.PI * 2);
    ctx.arc(x + r * 0.34 + eyeDx, y - r * 0.2 + eyeDy, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
    if (ghost.isElite) {
      const hp = clamp(ghost.eliteHp / ghost.eliteMaxHp, 0, 1), bw = c * 1.1, bh = c * 0.11, bx = x - bw / 2, by = y - r - bh - 4;
      ctx.fillStyle = 'rgba(20,20,30,0.7)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = hp > 0.5 ? '#33d17a' : hp > 0.25 ? '#ffb347' : '#ff5a5a'; ctx.fillRect(bx, by, bw * hp, bh);
      ctx.strokeStyle = '#ffffff55'; ctx.strokeRect(bx, by, bw, bh);
    }
    if (ghost.mutation) { ctx.fillStyle = '#ffffffbb'; ctx.font = Math.round(c * 0.24) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText('M', x, y - r - c * 0.08); }
  }
  function drawActors() {
    state.ghosts.forEach(drawGhost);
    drawPlayer();
    const c = state.cell;
    state.fruits.forEach((fruit) => { const x = tileCenter(fruit.x, c), y = tileCenter(fruit.y, c); ctx.fillStyle = '#ff6f59'; ctx.beginPath(); ctx.arc(x, y, c * 0.18, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#69db7c'; ctx.fillRect(x - c * 0.03, y - c * 0.26, c * 0.06, c * 0.1); });
    state.specialPellets.forEach((sp) => { const x = tileCenter(sp.x, c), y = tileCenter(sp.y, c); const pulse = 0.8 + Math.sin(state.time * 8) * 0.2; ctx.fillStyle = '#ffd60a'; ctx.beginPath(); ctx.arc(x, y, c * 0.18 * pulse, 0, Math.PI * 2); ctx.fill(); });
    state.traps.forEach((trap) => { const x = tileCenter(trap.x, c), y = tileCenter(trap.y, c); ctx.strokeStyle = 'rgba(255,100,140,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - c * 0.2, y - c * 0.2); ctx.lineTo(x + c * 0.2, y + c * 0.2); ctx.moveTo(x + c * 0.2, y - c * 0.2); ctx.lineTo(x - c * 0.2, y + c * 0.2); ctx.stroke(); });
  }
  function drawFloatingTexts() {
    ctx.textAlign = 'center';
    state.floatingTexts.forEach((ft) => { ctx.globalAlpha = clamp(ft.life, 0, 1); ctx.fillStyle = '#f7c948'; ctx.font = 'bold ' + Math.round(state.cell * 0.35) + 'px system-ui'; ctx.fillText(ft.text, ft.x, ft.y); });
    ctx.globalAlpha = 1;
  }
  function drawFeedback() {
    const intensity = state.director ? state.director.intensity : 0;
    const pulse = state.screenPulse + intensity / 350;
    if (pulse > 0.02) { ctx.fillStyle = 'rgba(255,80,80,' + clamp(pulse * 0.24, 0, 0.24).toFixed(3) + ')'; ctx.fillRect(0, 0, state.width, state.height); }
    if (state.feedback.warningDim > 0) { ctx.fillStyle = 'rgba(0,0,0,' + clamp(state.feedback.warningDim * 0.22, 0, 0.3).toFixed(3) + ')'; ctx.fillRect(0, 0, state.width, state.height); }
    if (state.feedback.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + clamp(state.feedback.flash * 0.45, 0, 0.35).toFixed(3) + ')'; ctx.fillRect(0, 0, state.width, state.height); }
    if (state.feedback.bossFlash > 0) { ctx.fillStyle = 'rgba(255,206,94,' + clamp(state.feedback.bossFlash * 0.18, 0, 0.28).toFixed(3) + ')'; ctx.fillRect(0, 0, state.width, state.height); }
    if (state.levelState.blackout) {
      ctx.save();
      ctx.fillStyle = 'rgba(5,8,16,0.86)';
      ctx.fillRect(0, 0, state.width, state.height);
      ctx.globalCompositeOperation = 'destination-out';
      const radius = state.cell * 3.2, gx = state.player.px, gy = state.player.py;
      const grad = ctx.createRadialGradient(gx, gy, radius * 0.35, gx, gy, radius);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(gx, gy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  function drawHudOverlay() {
    const intensity = state.director ? Math.round(state.director.intensity) : 0;
    ctx.fillStyle = 'rgba(8,10,20,0.5)'; ctx.fillRect(8, 8, state.cell * 6.2, state.cell * 1.4);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.strokeRect(8, 8, state.cell * 6.2, state.cell * 1.4);
    ctx.fillStyle = '#f0f6ff'; ctx.font = 'bold ' + Math.round(state.cell * 0.27) + 'px system-ui'; ctx.textAlign = 'left'; ctx.fillText('Intensity ' + intensity, 16, 8 + state.cell * 0.46);
    const barX = 16, barY = 8 + state.cell * 0.66, barW = state.cell * 5.6, barH = state.cell * 0.22;
    ctx.fillStyle = '#1f2937'; ctx.fillRect(barX, barY, barW, barH);
    const pct = clamp(intensity / 100, 0, 1);
    ctx.fillStyle = pct < 0.5 ? '#33d17a' : pct < 0.8 ? '#ffb347' : '#ff6b6b'; ctx.fillRect(barX, barY, barW * pct, barH);
    ctx.fillStyle = '#c7d2fe'; ctx.fillText('Lives ' + state.lives + '  Shield ' + state.player.shieldCharges, 16, 8 + state.cell * 1.15);
  }
  function drawStartOverlay() {
    const w = state.width, h = state.height;
    ctx.fillStyle = 'rgba(5,8,16,0.74)'; ctx.fillRect(0, 0, w, h);
    const pulse = 0.94 + Math.sin(state.introElapsed * 2.6) * 0.08;
    ctx.save(); ctx.translate(w / 2, h * 0.42); ctx.scale(pulse, pulse); ctx.fillStyle = '#f7c948'; ctx.textAlign = 'center'; ctx.font = 'bold ' + Math.round(state.cell * 0.95) + 'px monospace'; ctx.fillText('PAC-CHAIN ROGUELITE', 0, 0); ctx.restore();
    ctx.fillStyle = '#d1d9e6'; ctx.font = Math.round(state.cell * 0.42) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Start to begin infinite levels, upgrades, and director events', w / 2, h * 0.53);
  }
  function drawGameOver() {
    const w = state.width, h = state.height;
    ctx.fillStyle = 'rgba(3,4,12,0.78)'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff6b6b'; ctx.textAlign = 'center'; ctx.font = 'bold ' + Math.round(state.cell * 1.1) + 'px monospace'; ctx.fillText('GAME OVER', w / 2, h * 0.42);
    ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(state.cell * 0.52) + 'px system-ui';
    ctx.fillText('Score: ' + state.score + '   Level: ' + state.level, w / 2, h * 0.52);
    ctx.fillText('Ghosts Eaten: ' + state.run.stats.ghostsEaten + '   Intensity Peak: ' + Math.round(state.run.stats.highestIntensity), w / 2, h * 0.58);
    ctx.fillText('Run Rating: ' + computeRunRating(), w / 2, h * 0.64);
    ctx.fillStyle = '#c7d2fe'; ctx.font = Math.round(state.cell * 0.36) + 'px system-ui'; ctx.fillText('Press Start to run it back', w / 2, h * 0.72);
  }
  function draw() {
    const w = state.width, h = state.height;
    const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#090d1f'); bg.addColorStop(1, '#070a16');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (!state.isRunning && !state.isGameOver) { drawMaze(); drawStartOverlay(); return; }
    drawMaze(); drawActors(); drawFloatingTexts(); drawHudOverlay(); drawFeedback();
    if (state.isGameOver) drawGameOver();
  }

  function loop(ts) {
    frameDebug.tick(ts);
    if (!state.loopActive) return;
    const dt = clamp((ts - (state.lastFrameTs || ts)) / 1000, 0, 0.05);
    state.lastFrameTs = ts;
    update(dt);
    draw();
    state.rafId = requestAnimationFrame(loop);
  }
  function startLoop() { if (state.loopActive) return; state.loopActive = true; state.lastFrameTs = performance.now(); state.rafId = requestAnimationFrame(loop); }
  function stopLoop() { state.loopActive = false; if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; } }
  function startMusic() {}
  function stopMusic() { while (state.musicHandles.length) { const h = state.musicHandles.pop(); try { if (h && typeof h.stop === 'function') h.stop(); } catch (_) {} } }
  function syncMusicButton() { if (ui.music) { ui.music.textContent = state.mutedMusic ? 'Unmute Music' : 'Mute Music'; ui.music.setAttribute('aria-pressed', String(state.mutedMusic)); } }
  function handleResize() { applyScale(); draw(); }

  function resetRun() {
    state.score = 0; state.level = 1; state.lives = BASE_LIVES;
    state.isRunning = false; state.isPaused = false; state.isGameOver = false; state.submitDone = false;
    state.powerTimer = 0; state.bannerQueue.length = 0; state.activeBanner = null; clearBanner();
    initRunState(); initDirector(); buildLevelState(); applyRiskToggles(); chooseLevelModifier(); buildMazeForLevel(); spawnPlayer(); spawnGhostPack();
    state.fruits.length = 0; state.specialPellets.length = 0; state.traps.length = 0; state.floatingTexts.length = 0;
    updateHud();
  }
  function onStartClick() {
    if (state.isRunning && !state.isGameOver) return;
    stopMusic();
    resetRun();
    state.isRunning = true; state.isPaused = false; state.isGameOver = false; state.player.dx = 1; state.player.dy = 0; state.input.dx = 1; state.input.dy = 0;
    startLoop();
    startMusic();
  }
  function onPauseClick() { if (!state.isRunning || state.isGameOver) return; state.isPaused = !state.isPaused; if (state.isPaused) stopMusic(); else startMusic(); }
  function onResetClick() { stopMusic(); stopAllSounds(); resetRun(); startLoop(); }
  function onMusicMuteClick() { state.mutedMusic = !state.mutedMusic; syncMusicButton(); if (state.mutedMusic) stopMusic(); else startMusic(); }
  function onKeyDown(e) {
    frameDebug.input('keydown', e.key);
    const key = e.key;
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') { state.input.dx = -1; state.input.dy = 0; e.preventDefault(); }
    else if (key === 'ArrowRight' || key === 'd' || key === 'D') { state.input.dx = 1; state.input.dy = 0; e.preventDefault(); }
    else if (key === 'ArrowUp' || key === 'w' || key === 'W') { state.input.dx = 0; state.input.dy = -1; e.preventDefault(); }
    else if (key === 'ArrowDown' || key === 's' || key === 'S') { state.input.dx = 0; state.input.dy = 1; e.preventDefault(); }
  }
  function bindEvents() {
    document.addEventListener('keydown', onKeyDown);
    if (ui.start) ui.start.onclick = onStartClick;
    if (ui.pause) ui.pause.onclick = onPauseClick;
    if (ui.reset) ui.reset.onclick = onResetClick;
    if (ui.music) ui.music.onclick = onMusicMuteClick;
    state.overlayHandlers.open = () => setTimeout(handleResize, 140);
    state.overlayHandlers.close = () => handleResize();
    state.overlayHandlers.resize = () => handleResize();
    document.addEventListener('arcade-overlay-open', state.overlayHandlers.open);
    document.addEventListener('arcade-overlay-close', state.overlayHandlers.close);
    document.addEventListener('arcade-overlay-exit', state.overlayHandlers.close);
    window.addEventListener('resize', state.overlayHandlers.resize);
  }
  function unbindEvents() {
    document.removeEventListener('keydown', onKeyDown);
    if (ui.start) ui.start.onclick = null;
    if (ui.pause) ui.pause.onclick = null;
    if (ui.reset) ui.reset.onclick = null;
    if (ui.music) ui.music.onclick = null;
    if (state.overlayHandlers.open) document.removeEventListener('arcade-overlay-open', state.overlayHandlers.open);
    if (state.overlayHandlers.close) { document.removeEventListener('arcade-overlay-close', state.overlayHandlers.close); document.removeEventListener('arcade-overlay-exit', state.overlayHandlers.close); }
    if (state.overlayHandlers.resize) window.removeEventListener('resize', state.overlayHandlers.resize);
  }

  function init() {
    createOverlayElements();
    resetRun();
    syncMusicButton();
    canvas.style.aspectRatio = COLS + ' / ' + ROWS;
    applyScale();
    bindEvents();
    startLoop();
  }
  function start() { onStartClick(); }
  function pause() { if (!state.isRunning) return; state.isPaused = true; stopMusic(); }
  function resume() { if (!state.isRunning || state.isGameOver) return; state.isPaused = false; startMusic(); }
  function reset() { onResetClick(); }
  function destroy() {
    stopLoop();
    stopMusic();
    stopAllSounds();
    unbindEvents();
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    overlayEl = null;
    bannerEl = null;
  }
  function getScore() { return state.score; }
  return { init, start, pause, resume, reset, destroy, getScore };
}
