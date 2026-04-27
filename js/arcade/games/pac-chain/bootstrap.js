/**
 * bootstrap.js — Pac-Chain game module v2 (production upgrade)
 *
 * Improvements over v1:
 *  - Dynamic canvas scaling: fills fullscreen overlay correctly
 *  - 4 ghost AI archetypes: chaser, ambusher, random, patrol
 *  - Ghost combo multiplier for chaining ghost eats
 *  - Proper ghost body rendering with eye tracking
 *  - Neon wall rendering with edge-glow
 *  - Level-complete animation + sound
 *  - Death animation (Pac-Man shrinks)
 *  - Animated start / game-over screens
 *  - All pixel sizes proportional to dynamic CELL
 */

import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { PAC_CHAIN_CONFIG } from './config.js';
import { GameRegistry } from '/js/arcade/core/game-registry.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';

GameRegistry.register(PAC_CHAIN_CONFIG.id, {
  label: PAC_CHAIN_CONFIG.label,
  bootstrap: bootstrapPacChain,
});

export function bootstrapPacChain(root) {
  const GAME_ID = PAC_CHAIN_CONFIG.id;
  const canvas = document.getElementById('pacCanvas');
  const ctx = canvas.getContext('2d');

  // ── Grid dimensions ──────────────────────────────────────────────────
  const COLS = 20;
  const ROWS = 20;
  const BASE_CELL = 28;

  // Dynamic scale variables — updated by applyScale()
  let CELL = BASE_CELL;
  let W = COLS * CELL;
  let H = ROWS * CELL;
  let PSIZE = Math.ceil(CELL * 0.46);   // pac-man radius
  let GHOST_R = Math.ceil(CELL * 0.39); // ghost radius (for collision + draw)

  // ── Maze layouts ─────────────────────────────────────────────────────
  // 0 = wall, 1 = pellet, 2 = power pellet, 3 = empty passage
  const BASE_MAZE = [
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

  const MAZE_1 = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,1,1,1,0,1,1,0,0,1,1,0,1,1,1,1,1,0],
    [0,2,0,0,1,0,0,1,1,0,0,1,1,0,0,1,0,0,2,0],
    [0,1,0,1,1,1,0,1,0,0,0,0,1,0,1,1,1,0,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,0,0,1,0,1,1,0,0,0,0,1,1,0,1,0,0,1,0],
    [0,1,1,1,1,1,1,0,0,0,0,0,0,1,1,1,1,1,1,0],
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

  const MAZE_2 = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,0,1,1,1,1,1,0,0,1,1,1,1,1,0,1,1,0],
    [0,2,1,0,1,0,0,0,1,0,0,1,0,0,0,1,0,1,2,0],
    [0,1,1,0,1,0,1,1,1,0,0,1,1,1,0,1,0,1,1,0],
    [0,1,1,1,1,1,0,0,1,1,1,1,0,0,1,1,1,1,1,0],
    [0,1,1,0,1,0,1,0,1,0,0,1,0,1,0,1,0,1,1,0],
    [0,1,0,0,1,0,1,1,1,0,0,1,1,1,0,1,0,0,1,0],
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

  const MAZE_POOL = [BASE_MAZE, MAZE_1, MAZE_2];

  // Row index (0-based) of the horizontal side-tunnel in every maze layout.
  // Only this row allows left/right wrap; all other rows are walled off at
  // the canvas edge and must never wrap.
  const TUNNEL_ROW = 10;

  // ── Game constants ────────────────────────────────────────────────────
  const PLAYER_START_X = 10;
  const PLAYER_START_Y = 16;
  const BASE_PLAYER_SPEED = 5.5;
  const ESPEED = 4.0;
  const POWER_FLASH_FREQ = 4;
  const POWER_FLASH_THRESHOLD = 2;
  const DEATH_ANIM_S = 0.9;
  const DEATH_FREEZE_S = 1.5;
  const LEVEL_COMPLETE_DELAY = 1.8;
  const PLAYER_SPEED_PER_LEVEL = 0.04;
  const GHOST_SPEED_PER_LEVEL = 0.07;
  const ENEMY_COLORS = ['#ff4fd1', '#3fb950', '#bc8cff', '#2ec5ff'];
  const GHOST_TYPES = ['chaser', 'ambusher', 'random', 'patrol'];
  const CHAIN_WINDOW_S = 1.8;
  const MAX_PARTICLES = 300;
  const MAX_FLOATING_TEXTS = 50;
  const MAX_TRAIL_POINTS = 12;
  const TRAIL_LIFE_DURATION = 0.45;
  const GLITCH_SCORE_THRESHOLD = 1800;
  const GLITCH_HIGH_SCORE_PROBABILITY = 0.003;
  const GLITCH_RANDOM_PROBABILITY = 0.0008;
  const GLITCH_DURATION = 0.08;
  const GLITCH_COOLDOWN_MIN = 5;
  const GLITCH_COOLDOWN_RANGE = 4;
  // Ghost AI balance
  const CHASER_BASE_AGGRESSION     = 0.5;
  const CHASER_AGGRESSION_PER_LEVEL = 0.04;
  const CHASER_MAX_AGGRESSION       = 0.9;
  // Power pellet balance
  const BASE_POWER_DURATION     = 8;
  const POWER_REDUCTION_PER_LEVEL = 0.5;
  const MIN_POWER_DURATION      = 4;

  // ── Game state ────────────────────────────────────────────────────────
  let maze = [];
  let score = 0;
  let level = 1;
  let lives = 3;
  let powerTimer = 0;
  let running = false;
  let paused = false;
  let gameOver = false;
  let best = ArcadeSync.getHighScore(GAME_ID);
  let raf = null;
  let lastTime = 0;
  let elapsed = 0;
  let pelletsLeft = 0;
  let deathTimer = 0;
  let levelCompleteTimer = 0;
  let mouthAngle = 0;
  let mouthDir = 1;
  let lastPelletAt = -100;
  let chain = 1;
  let chainPulse = 0;
  let ghostCombo = 0;    // ghosts eaten in current power chain
  let speedBoostTimer = 0;
  let slowEnemiesTimer = 0;
  let doubleScoreTimer = 0;
  let submittedRunScore = false;
  let shakeTime = 0;
  let shakeIntensity = 0;
  let powerFlashTimer = 0;
  let glitchTimer = 0;
  let glitchCooldown = 0;
  let glitchRgbShift = 0;
  let introElapsed = 0;  // for animating start screen when not running

  const particles = [];
  const floatingTexts = [];
  const playerTrail = [];
  const musicHandles = [];
  let musicMuted = false;
  let _onOverlayOpen  = null;
  let _onOverlayClose = null;
  let _onWindowResize = null;

  let player = {
    x: PLAYER_START_X, y: PLAYER_START_Y,
    dx: 0, dy: 0, ndx: 1, ndy: 0,
    px: 0, py: 0,
    speed: BASE_PLAYER_SPEED,
    moving: false,
  };
  let enemies = [];

  // ── HUD references ────────────────────────────────────────────────────
  const scoreEl = document.getElementById('score');
  const bestEl  = document.getElementById('best');
  const levelEl = document.getElementById('level');
  const chainEl = document.getElementById('chain');
  const chainStatEl = chainEl ? chainEl.closest('.stat') : null;

  // ─────────────────────────────────────────────────────────────────────
  // DYNAMIC SCALING
  // ─────────────────────────────────────────────────────────────────────

  function remapEntities(oldCell, newCell) {
    const scale = newCell / oldCell;
    // Tile-anchored entities: recompute pixel position from tile coords
    player.px = player.x * newCell + newCell / 2;
    player.py = player.y * newCell + newCell / 2;
    enemies.forEach((e) => {
      e.px = e.x * newCell + newCell / 2;
      e.py = e.y * newCell + newCell / 2;
    });
    // Free-floating elements: scale proportionally
    particles.forEach((p) => {
      p.x *= scale; p.y *= scale;
      p.vx *= scale; p.vy *= scale;
    });
    floatingTexts.forEach((f) => { f.x *= scale; f.y *= scale; });
    playerTrail.forEach((t) => { t.x *= scale; t.y *= scale; });
  }

  function applyScale(newCell) {
    if (newCell === CELL) return;
    const old = CELL;
    CELL = newCell;
    W = COLS * CELL;
    H = ROWS * CELL;
    PSIZE  = Math.ceil(CELL * 0.46);
    GHOST_R = Math.ceil(CELL * 0.39);
    canvas.width  = W;
    canvas.height = H;
    remapEntities(old, newCell);
  }

  function measureCell() {
    const overlay = document.getElementById('game-overlay');
    if (!overlay || !overlay.classList.contains('active')) return BASE_CELL;
    const stage = overlay.querySelector('.game-stage');
    if (!stage) return BASE_CELL;
    const gc  = canvas.closest('.game-card');
    const hud = gc && gc.querySelector('.hud');
    const hudH = hud ? hud.offsetHeight + 16 : 64;
    const availW = stage.clientWidth  - 20;
    const availH = stage.clientHeight - 20 - hudH;
    if (availW <= 0 || availH <= 0) return BASE_CELL;
    return Math.max(16, Math.floor(Math.min(availW / COLS, availH / ROWS)));
  }

  function handleResize() {
    const overlay = document.getElementById('game-overlay');
    const inFS = overlay && overlay.classList.contains('active');
    if (inFS) {
      const newCell = measureCell();
      applyScale(newCell);
      canvas.style.setProperty('width',  W + 'px', 'important');
      canvas.style.setProperty('height', H + 'px', 'important');
    } else {
      applyScale(BASE_CELL);
      canvas.style.removeProperty('width');
      canvas.style.removeProperty('height');
    }
    if (!running || paused || gameOver) draw();
  }

  // ─────────────────────────────────────────────────────────────────────
  // AUDIO HELPERS
  // ─────────────────────────────────────────────────────────────────────

  function playGameSound(id) {
    if (isMuted()) return null;
    return playSound('pac-chain-' + id) || null;
  }

  function stopMusic() {
    while (musicHandles.length) {
      const h = musicHandles.pop();
      try { if (h && typeof h.stop === 'function') h.stop(); } catch (_) {}
    }
  }

  function startMusic() {
    if (musicMuted || isMuted() || !running || paused || gameOver || musicHandles.length) return;
    const bass = playSound('pac-chain-music-bass', {
      kind: 'tone', type: 'square', freqStart: 110, freqEnd: 110,
      duration: null, loop: true, volume: 0.008,
    });
    const lead = playSound('pac-chain-music-lead', {
      kind: 'tone', type: 'triangle', freqStart: 220, freqEnd: 222,
      duration: null, loop: true, volume: 0.006,
    });
    if (bass) musicHandles.push(bass);
    if (lead) musicHandles.push(lead);
  }

  function syncMusicButton() {
    const btn = document.getElementById('musicMuteBtn');
    if (!btn) return;
    btn.textContent = musicMuted ? 'Unmute Music' : 'Mute Music';
    btn.setAttribute('aria-pressed', String(musicMuted));
  }

  // ─────────────────────────────────────────────────────────────────────
  // UTILITY
  // ─────────────────────────────────────────────────────────────────────

  function tileCenter(t) { return t * CELL + CELL / 2; }

  function isWall(cx, cy) {
    // The horizontal tunnel row is open at both left and right canvas edges —
    // treat those virtual cells as passages so entities can enter the tunnel.
    if (cy === TUNNEL_ROW && (cx < 0 || cx >= COLS)) return false;
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return true;
    return maze[cy][cx] === 0;
  }

  function distToPlayerSq(tx, ty) {
    return (tx - player.x) ** 2 + (ty - player.y) ** 2;
  }

  function triggerShake(intensity, duration) {
    shakeIntensity = Math.max(shakeIntensity, intensity);
    shakeTime = Math.max(shakeTime, duration);
  }

  function pushTrailPoint() {
    playerTrail.push({ x: player.px, y: player.py, life: TRAIL_LIFE_DURATION, maxLife: TRAIL_LIFE_DURATION });
    if (playerTrail.length > MAX_TRAIL_POINTS) playerTrail.shift();
  }

  function spawnParticleBurst(x, y, count, color) {
    color = color || '#f7c948';
    const n = Math.max(5, Math.min(14, count));
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (40 + Math.random() * 130) * (CELL / BASE_CELL);
      particles.push({
        x, y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 0.35 + Math.random() * 0.25, maxLife: 0.6,
        size: (1 + Math.random() * 2) * (CELL / BASE_CELL),
        color,
      });
    }
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  }

  function spawnFloatingText(x, y, text, color) {
    color = color || '#f7c948';
    floatingTexts.push({ x, y, text, vy: -28 * (CELL / BASE_CELL), life: 0.7, maxLife: 0.7, color });
    if (floatingTexts.length > MAX_FLOATING_TEXTS) floatingTexts.splice(0, floatingTexts.length - MAX_FLOATING_TEXTS);
  }

  function setBestMaybe() {
    if (score > best) {
      best = score;
      ArcadeSync.setHighScore(GAME_ID, best);
    }
  }

  function triggerChainPulse() {
    chainPulse = 0.28;
    if (!chainStatEl) return;
    chainStatEl.classList.remove('chain-pulse');
    void chainStatEl.offsetWidth;
    chainStatEl.classList.add('chain-pulse');
    setTimeout(() => chainStatEl.classList.remove('chain-pulse'), 220);
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = score;
    if (bestEl)  bestEl.textContent  = best;
    if (levelEl) levelEl.textContent = level || '—';
    if (chainEl) chainEl.textContent = 'x' + chain;
  }

  function resetChain() {
    chain = 1;
    lastPelletAt = -100;
    updateHud();
  }

  function chainForPellet() {
    const now = elapsed;
    if (now - lastPelletAt <= CHAIN_WINDOW_S) {
      chain += 1;
      triggerChainPulse(); // visual-only; pellet sound handled by caller
    } else {
      chain = 1;
    }
    lastPelletAt = now;
    return chain;
  }

  function addScore(base, options) {
    options = options || {};
    const comboMult  = options.withChain ? chain : 1;
    const doubleMult = doubleScoreTimer > 0 ? 2 : 1;
    const points = Math.floor(base * comboMult * doubleMult);
    score += points;
    setBestMaybe();
    updateHud();
    if (typeof options.x === 'number' && typeof options.y === 'number') {
      spawnFloatingText(options.x, options.y, '+' + points, options.color || '#f7c948');
    }
    return points;
  }

  // ─────────────────────────────────────────────────────────────────────
  // MAZE
  // ─────────────────────────────────────────────────────────────────────

  function buildMaze() {
    const src = MAZE_POOL[(level - 1) % MAZE_POOL.length];
    maze = src.map((row) => [...row]);
    pelletsLeft = 0;
    for (let r = 0; r < maze.length; r++) {
      for (let c = 0; c < maze[r].length; c++) {
        if (maze[r][c] === 1 || maze[r][c] === 2) pelletsLeft++;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // SPAWN
  // ─────────────────────────────────────────────────────────────────────

  function spawnPlayer() {
    player = {
      x: PLAYER_START_X, y: PLAYER_START_Y,
      dx: 0, dy: 0, ndx: 1, ndy: 0,
      px: tileCenter(PLAYER_START_X),
      py: tileCenter(PLAYER_START_Y),
      speed: BASE_PLAYER_SPEED,
      moving: false,
    };
    playerTrail.length = 0;
  }

  function spawnEnemies() {
    enemies = [];
    const count = Math.min(4, 2 + Math.floor((level - 1) / 2));
    const starts = [{ x: 9, y: 9 }, { x: 10, y: 9 }, { x: 9, y: 10 }, { x: 10, y: 10 }];
    for (let i = 0; i < count; i++) {
      const s = starts[i];
      enemies.push({
        x: s.x, y: s.y,
        px: tileCenter(s.x), py: tileCenter(s.y),
        dx: i % 2 ? 1 : -1, dy: 0,
        ndx: 0, ndy: 0,
        color: ENEMY_COLORS[i],
        type: GHOST_TYPES[i % GHOST_TYPES.length],
        scared: false, scaredTimer: 0,
        respawnTimer: 0, dead: false,
        seed: Math.random() * Math.PI * 2,
        patrolPhase: 0,  // for patrol type
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // MOVEMENT
  // ─────────────────────────────────────────────────────────────────────

  function moveEntity(e, speed, dt) {
    const centX = tileCenter(e.x);
    const centY = tileCenter(e.y);
    const snapThresh = CELL * 0.075;
    const distX = Math.abs(e.px - centX);
    const distY = Math.abs(e.py - centY);
    const atCent = distX < snapThresh && distY < snapThresh;

    if (atCent) {
      e.px = centX;
      e.py = centY;
      if ((e.ndx || e.ndy) && !isWall(e.x + e.ndx, e.y + e.ndy)) {
        e.dx = e.ndx; e.dy = e.ndy;
      }
      if (isWall(e.x + e.dx, e.y + e.dy)) { e.dx = 0; e.dy = 0; }
    }

    e.px += e.dx * speed * CELL * dt;
    e.py += e.dy * speed * CELL * dt;

    const newTX = Math.floor(e.px / CELL);
    const newTY = Math.floor(e.py / CELL);
    if (newTX !== e.x || newTY !== e.y) {
      e.x = Math.max(0, Math.min(COLS - 1, newTX));
      e.y = Math.max(0, Math.min(ROWS - 1, newTY));
    }

    // Tunnel wrap (horizontal) — only valid on the dedicated tunnel row.
    // Entities on any other row must never wrap; they hit the wall and stop.
    if (e.y === TUNNEL_ROW) {
      if (e.px < 0) { e.px = W; e.x = COLS - 1; }
      if (e.px > W) { e.px = 0; e.x = 0; }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // GHOST AI
  // ─────────────────────────────────────────────────────────────────────

  function pickScaredDir(e) {
    // Run away from player
    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    const valid = dirs.filter((d) => !isWall(e.x + d.dx, e.y + d.dy) && !(d.dx === -e.dx && d.dy === -e.dy));
    if (!valid.length) return dirs.find((d) => !isWall(e.x + d.dx, e.y + d.dy)) || dirs[0];
    return valid.reduce((best, d) => {
      const bDist = distToPlayerSq(e.x + best.dx, e.y + best.dy);
      const nDist = distToPlayerSq(e.x + d.dx,    e.y + d.dy);
      return nDist > bDist ? d : best;
    }, valid[0]);
  }

  function pickChaserDir(e) {
    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    const valid = dirs.filter((d) => !isWall(e.x + d.dx, e.y + d.dy) && !(d.dx === -e.dx && d.dy === -e.dy));
    if (!valid.length) return null;
    return valid.reduce((best, d) => {
      const bDist = distToPlayerSq(e.x + best.dx, e.y + best.dy);
      const nDist = distToPlayerSq(e.x + d.dx,    e.y + d.dy);
      return nDist < bDist ? d : best;
    }, valid[0]);
  }

  function pickAmbusherDir(e) {
    // Target 4 tiles ahead of player's current direction
    const ahead = 4;
    const tx = Math.round(player.x + (player.dx || player.ndx) * ahead);
    const ty = Math.round(player.y + (player.dy || player.ndy) * ahead);
    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    const valid = dirs.filter((d) => !isWall(e.x + d.dx, e.y + d.dy) && !(d.dx === -e.dx && d.dy === -e.dy));
    if (!valid.length) return null;
    return valid.reduce((best, d) => {
      const bDist = (e.x + best.dx - tx) ** 2 + (e.y + best.dy - ty) ** 2;
      const nDist = (e.x + d.dx    - tx) ** 2 + (e.y + d.dy    - ty) ** 2;
      return nDist < bDist ? d : best;
    }, valid[0]);
  }

  function pickRandomDir(e) {
    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    const valid = dirs.filter((d) => !isWall(e.x + d.dx, e.y + d.dy) && !(d.dx === -e.dx && d.dy === -e.dy));
    if (!valid.length) return null;
    return valid[Math.floor(Math.random() * valid.length)];
  }

  function pickPatrolDir(e) {
    // Try to keep current direction; turn randomly at junctions
    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    const valid = dirs.filter((d) => !isWall(e.x + d.dx, e.y + d.dy) && !(d.dx === -e.dx && d.dy === -e.dy));
    if (!valid.length) return null;
    // Prefer straight ahead
    const straight = valid.find((d) => d.dx === e.dx && d.dy === e.dy);
    if (straight && Math.random() > 0.25) return straight;
    return valid[Math.floor(Math.random() * valid.length)];
  }

  function enemyAI(e, dt) {
    if (e.dead) {
      e.respawnTimer -= dt;
      if (e.respawnTimer <= 0) {
        e.dead = false; e.scared = false;
        e.x = 9; e.y = 9;
        e.px = tileCenter(9); e.py = tileCenter(9);
        e.dx = 1; e.dy = 0;
      }
      return;
    }

    const centX = tileCenter(e.x);
    const centY = tileCenter(e.y);
    const atCent = Math.abs(e.px - centX) < CELL * 0.12 && Math.abs(e.py - centY) < CELL * 0.12;

    if (atCent) {
      let chosen = null;
      if (e.scared) {
        chosen = pickScaredDir(e);
      } else {
        switch (e.type) {
          case 'chaser':
            // Aggression increases with level; gets more aggressive per level
            chosen = Math.random() < Math.min(CHASER_MAX_AGGRESSION, CHASER_BASE_AGGRESSION + level * CHASER_AGGRESSION_PER_LEVEL)
              ? pickChaserDir(e) : pickRandomDir(e);
            break;
          case 'ambusher':
            chosen = Math.random() < 0.65 ? pickAmbusherDir(e) : pickRandomDir(e);
            break;
          case 'random':
            chosen = pickRandomDir(e);
            break;
          case 'patrol':
          default:
            chosen = pickPatrolDir(e);
            break;
        }
      }
      if (chosen) { e.ndx = chosen.dx; e.ndy = chosen.dy; }
    }

    const slowFactor = slowEnemiesTimer > 0 ? 0.72 : 1;
    const baseSpeed  = ESPEED * (1 + level * GHOST_SPEED_PER_LEVEL);
    const speed      = (e.scared ? baseSpeed * 0.55 : baseSpeed) * slowFactor;
    moveEntity(e, speed, dt);
  }

  // ─────────────────────────────────────────────────────────────────────
  // GAME LOGIC
  // ─────────────────────────────────────────────────────────────────────

  function handlePelletEat(tx, ty, isPower) {
    const cx = tx * CELL + CELL / 2;
    const cy = ty * CELL + CELL / 2;
    chainForPellet();
    if (isPower) {
      powerFlashTimer = 0.14;
      playGameSound('power');
      addScore(50, { withChain: true, x: cx, y: cy, color: '#ff8df0' });
      spawnParticleBurst(cx, cy, 10, '#ff4fd1');
      triggerShake(3.5, 0.12);
      const powerDur = Math.max(MIN_POWER_DURATION, BASE_POWER_DURATION - level * POWER_REDUCTION_PER_LEVEL);
      powerTimer = powerDur;
      ghostCombo = 0;
      enemies.forEach((e) => {
        if (!e.dead) { e.scared = true; e.scaredTimer = powerDur; }
      });
    } else {
      playGameSound('pellet');
      addScore(10, { withChain: true, x: cx, y: cy, color: '#f7c948' });
      spawnParticleBurst(cx, cy, 5, '#f7c948');
    }
  }

  function processPlayerTile() {
    const tx = Math.round((player.px - CELL / 2) / CELL);
    const ty = Math.round((player.py - CELL / 2) / CELL);
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return;
    const tile = maze[ty][tx];
    if (tile === 1 || tile === 2) {
      maze[ty][tx] = 3;
      pelletsLeft--;
      handlePelletEat(tx, ty, tile === 2);
    }
  }

  function processEnemyCollisions() {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const dx = e.px - player.px;
      const dy = e.py - player.py;
      if (Math.sqrt(dx * dx + dy * dy) < PSIZE + GHOST_R) {
        if (e.scared) {
          // Ghost combo multiplier
          ghostCombo++;
          const comboMult = Math.min(8, ghostCombo);
          playGameSound('ghost-eaten');
          e.dead = true;
          e.respawnTimer = 4;
          const pts = 200 * level * comboMult;
          const cx = e.px, cy = e.py;
          addScore(pts, { x: cx, y: cy, color: '#2ec5ff' });
          spawnParticleBurst(cx, cy, 12, '#2ec5ff');
          if (comboMult > 1) {
            spawnFloatingText(cx, cy - CELL, 'x' + comboMult + ' COMBO!', '#ff4fd1');
            triggerShake(6, 0.18);
          } else {
            triggerShake(4.5, 0.12);
          }
        } else {
          onPlayerDeath();
        }
      }
    }
  }

  function onPlayerDeath() {
    if (!isMuted()) playSound('pac-chain-death');
    triggerShake(9, 0.35);
    resetChain();
    lives--;
    if (lives <= 0) {
      onGameOver();
      return;
    }
    powerTimer = 0;
    ghostCombo = 0;
    enemies.forEach((e) => { e.scared = false; });
    spawnPlayer();
    player.ndx = 1; player.ndy = 0;
    deathTimer = DEATH_FREEZE_S;
    updateHud();
  }

  // ─────────────────────────────────────────────────────────────────────
  // EFFECTS UPDATE
  // ─────────────────────────────────────────────────────────────────────

  function shouldTriggerGlitch() {
    if (glitchCooldown > 0) return false;
    if (score >= GLITCH_SCORE_THRESHOLD && Math.random() < GLITCH_HIGH_SCORE_PROBABILITY) return true;
    return Math.random() < GLITCH_RANDOM_PROBABILITY;
  }

  function updateEffects(dt) {
    if (chainPulse > 0) chainPulse -= dt;
    if (powerFlashTimer > 0) powerFlashTimer -= dt;
    if (speedBoostTimer > 0) speedBoostTimer -= dt;
    if (slowEnemiesTimer > 0) slowEnemiesTimer -= dt;
    if (doubleScoreTimer > 0) doubleScoreTimer -= dt;
    if (shakeTime > 0) { shakeTime -= dt; if (shakeTime <= 0) shakeIntensity = 0; }
    if (glitchCooldown > 0) glitchCooldown -= dt;
    if (glitchTimer > 0) {
      glitchTimer -= dt;
      glitchRgbShift = 0.5 + Math.random() * 2.5;
    } else {
      glitchRgbShift = 0;
    }
    if (elapsed - lastPelletAt > CHAIN_WINDOW_S && chain !== 1) { chain = 1; updateHud(); }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.93; p.vy *= 0.93;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const f = floatingTexts[i];
      f.life -= dt; f.y += f.vy * dt;
      if (f.life <= 0) floatingTexts.splice(i, 1);
    }
    for (let i = playerTrail.length - 1; i >= 0; i--) {
      const t = playerTrail[i];
      t.life -= dt;
      if (t.life <= 0) playerTrail.splice(i, 1);
    }
    if (shouldTriggerGlitch()) {
      glitchTimer = GLITCH_DURATION;
      glitchCooldown = GLITCH_COOLDOWN_MIN + Math.random() * GLITCH_COOLDOWN_RANGE;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────────────

  function update(dt) {
    if (!running || paused || gameOver) return;
    elapsed += dt;
    updateEffects(dt);

    // Level-complete delay
    if (levelCompleteTimer > 0) {
      levelCompleteTimer -= dt;
      if (levelCompleteTimer <= 0) {
        level++;
        resetChain();
        powerTimer = 0;
        ghostCombo = 0;
        buildMaze();
        spawnEnemies();
        spawnPlayer();
        player.ndx = 1; player.ndy = 0;
        updateHud();
      }
      return;
    }

    if (deathTimer > 0) { deathTimer -= dt; return; }

    // Mouth animation
    mouthAngle += mouthDir * 4 * dt;
    if (mouthAngle > 0.4) mouthDir = -1;
    if (mouthAngle < 0.02) mouthDir = 1;

    // Power mode countdown
    if (powerTimer > 0) {
      powerTimer -= dt;
      if (powerTimer <= 0) {
        powerTimer = 0;
        ghostCombo = 0;
        enemies.forEach((e) => { e.scared = false; });
      }
    }

    const speedBoost = speedBoostTimer > 0 ? 1.2 : 1;
    moveEntity(player, player.speed * speedBoost * (1 + level * PLAYER_SPEED_PER_LEVEL), dt);
    player.moving = !!(player.dx || player.dy || player.ndx || player.ndy);
    if (player.moving) pushTrailPoint();

    processPlayerTile();

    if (pelletsLeft <= 0) {
      // Level complete!
      levelCompleteTimer = LEVEL_COMPLETE_DELAY;
      if (!isMuted()) playSound('pac-chain-level-complete');
      triggerShake(3, 0.22);
      spawnParticleBurst(W / 2, H / 2, 20, '#f7c948');
      return;
    }

    enemies.forEach((e) => enemyAI(e, dt));
    processEnemyCollisions();
  }

  // ─────────────────────────────────────────────────────────────────────
  // DRAWING
  // ─────────────────────────────────────────────────────────────────────

  function isWallSrc(r, c, src) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
    return src[r][c] === 0;
  }

  function drawMaze() {
    const src = running || gameOver ? maze : MAZE_POOL[(level - 1) % MAZE_POOL.length];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = src[r][c];
        const x = c * CELL;
        const y = r * CELL;

        if (tile === 0) {
          // Wall block — draw neon edge only on maze-facing sides
          ctx.fillStyle = '#0e1525';
          ctx.fillRect(x, y, CELL, CELL);

          const hasN = !isWallSrc(r - 1, c, src);
          const hasS = !isWallSrc(r + 1, c, src);
          const hasW = !isWallSrc(r, c - 1, src);
          const hasE = !isWallSrc(r, c + 1, src);

          if (hasN || hasS || hasW || hasE) {
            ctx.save();
            ctx.strokeStyle = '#2ec5ff';
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#2ec5ff55';
            ctx.beginPath();
            if (hasN) { ctx.moveTo(x,        y);        ctx.lineTo(x + CELL, y); }
            if (hasS) { ctx.moveTo(x,        y + CELL); ctx.lineTo(x + CELL, y + CELL); }
            if (hasW) { ctx.moveTo(x,        y);        ctx.lineTo(x,        y + CELL); }
            if (hasE) { ctx.moveTo(x + CELL, y);        ctx.lineTo(x + CELL, y + CELL); }
            ctx.stroke();
            ctx.restore();
          }
        } else {
          // Passage background
          ctx.fillStyle = '#090c16';
          ctx.fillRect(x, y, CELL, CELL);

          if (tile === 1) {
            // Small pellet with glow
            ctx.fillStyle = '#f7c948';
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#f7c948aa';
            ctx.beginPath();
            ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.11, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          } else if (tile === 2) {
            // Power pellet — pulsing
            const t = running || gameOver ? elapsed : introElapsed;
            const pulse = 0.8 + Math.sin(t * 7 + c + r) * 0.22;
            ctx.fillStyle = '#ff4fd1';
            ctx.shadowBlur = 16;
            ctx.shadowColor = '#ff4fd1';
            ctx.beginPath();
            ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.24 * pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
          // tile === 3 is empty passage — no dot drawn
        }
      }
    }
  }

  function drawEffects() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < floatingTexts.length; i++) {
      const f = floatingTexts[i];
      const alpha = Math.max(0, f.life / f.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      ctx.font = 'bold ' + Math.round(CELL * 0.57) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  function drawGhostBody(gx, gy, radius, color, scared, powerTimerVal, seed) {
    const r  = radius;
    const jitter = Math.sin(elapsed * 18 + seed) * 0.6;
    const floatY = Math.cos(elapsed * 5 + seed) * (r * 0.08);
    const ex = gx + jitter;
    const ey = gy + floatY;

    ctx.save();

    if (scared) {
      // Scared ghost: blue/white with flicker
      const flash = powerTimerVal < 2 && Math.floor(powerTimerVal * 6) % 2;
      ctx.fillStyle = flash ? '#ffffff' : (Math.floor(elapsed * 16) % 2 ? '#2ec5ff' : '#5fffb4');
      ctx.shadowBlur = 14;
      ctx.shadowColor = ctx.fillStyle;
    } else {
      ctx.fillStyle = color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
    }

    // Ghost body: dome top + rectangular sides + wavy bottom
    ctx.beginPath();
    ctx.arc(ex, ey - r * 0.15, r, Math.PI, 0, false);
    ctx.lineTo(ex + r, ey + r * 0.75);
    // Wavy bottom skirt (3 bumps)
    const bumps = 3;
    const bumpW = (2 * r) / bumps;
    for (let b = 0; b < bumps; b++) {
      const bx = ex + r - bumpW * (b + 0.5);
      const by = ey + r * 0.75 + r * 0.28 * (b % 2 ? 1 : -1);
      ctx.lineTo(bx, by);
    }
    ctx.lineTo(ex - r, ey + r * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    if (!scared) {
      // White eye sclera
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(ex - r * 0.33, ey - r * 0.18, r * 0.27, r * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(ex + r * 0.33, ey - r * 0.18, r * 0.27, r * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pupils — track toward player
      const pdx = player.px - ex;
      const pdy = player.py - ey;
      const plen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
      const prx = (pdx / plen) * r * 0.12;
      const pry = (pdy / plen) * r * 0.12;

      ctx.fillStyle = '#1a55e8';
      ctx.beginPath();
      ctx.arc(ex - r * 0.33 + prx, ey - r * 0.18 + pry, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + r * 0.33 + prx, ey - r * 0.18 + pry, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Scared face — two dots and a wavy mouth
      ctx.fillStyle = '#003399';
      ctx.beginPath();
      ctx.arc(ex - r * 0.28, ey - r * 0.1, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + r * 0.28, ey - r * 0.1, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#003399';
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.35, ey + r * 0.25);
      ctx.quadraticCurveTo(ex - r * 0.1, ey + r * 0.12, ex, ey + r * 0.25);
      ctx.quadraticCurveTo(ex + r * 0.1, ey + r * 0.38, ex + r * 0.35, ey + r * 0.25);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawEnemies() {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const flicker = 0.85 + Math.abs(Math.sin(elapsed * 8 + e.seed)) * 0.25;
      ctx.globalAlpha = flicker;
      drawGhostBody(e.px, e.py, GHOST_R, e.color, e.scared, powerTimer, e.seed);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    // Trail
    for (let i = 0; i < playerTrail.length; i++) {
      const t = playerTrail[i];
      const alpha = Math.max(0, t.life / t.maxLife) * 0.32;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffe144';
      ctx.beginPath();
      ctx.arc(t.x, t.y, PSIZE * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const powerFlash = powerTimer > 0 && powerTimer < POWER_FLASH_THRESHOLD && Math.floor(powerTimer * POWER_FLASH_FREQ) % 2;
    const baseColor  = powerTimer > 0 ? (powerFlash ? '#fff' : '#b3ffff') : '#ffe144';
    const glowColor  = powerTimer > 0 ? '#2ec5ff' : '#ffe144';
    const movePulse  = player.moving ? (1 + Math.sin(elapsed * 12) * 0.08) : 1;

    // Death animation: Pac-Man shrinks and rotates
    if (deathTimer > 0) {
      const t = Math.max(0, (deathTimer - (DEATH_FREEZE_S - DEATH_ANIM_S)) / DEATH_ANIM_S);
      const shrink = Math.max(0.01, t);
      const spin   = (1 - t) * Math.PI * 1.5;
      const closing = Math.PI * (1 - t * 0.9);
      ctx.save();
      ctx.translate(player.px, player.py);
      ctx.rotate(spin);
      ctx.scale(shrink, shrink);
      ctx.fillStyle = '#ffe144';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ffe144';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, PSIZE, closing * 0.5, Math.PI * 2 - closing * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
      return;
    }

    let facing = 0;
    if      (player.dx === -1) facing = Math.PI;
    else if (player.dy ===  1) facing = Math.PI / 2;
    else if (player.dy === -1) facing = (3 * Math.PI) / 2;

    const ma = mouthAngle * Math.PI;
    ctx.save();
    ctx.translate(player.px, player.py);
    ctx.scale(movePulse, movePulse);
    ctx.shadowBlur = player.moving ? 20 : 12;
    ctx.shadowColor = glowColor;
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = '#090c16';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, PSIZE, facing + ma, facing + 2 * Math.PI - ma);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  function drawHudOverlay() {
    // Lives & level text on canvas
    ctx.fillStyle = '#d9e0ff';
    ctx.font = 'bold ' + Math.round(CELL * 0.5) + 'px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('♥ ' + lives, CELL * 0.4, CELL * 0.65);

    // Chain display if active
    if (chain > 1) {
      const pulse = 1 + Math.max(0, chainPulse) * 0.55;
      ctx.save();
      ctx.translate(W - CELL * 4.3, CELL * 0.65);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#f7c948';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#f7c948';
      ctx.font = 'bold ' + Math.round(CELL * 0.64) + 'px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText('CHAIN x' + chain, 0, 0);
      ctx.restore();
      ctx.shadowBlur = 0;
    }

    if (doubleScoreTimer > 0) {
      ctx.fillStyle = '#ff4fd1';
      ctx.font = 'bold ' + Math.round(CELL * 0.5) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('2× SCORE', W / 2, CELL * 0.65);
    }
    ctx.textBaseline = 'alphabetic';
  }

  function drawLevelCompleteOverlay() {
    if (levelCompleteTimer <= 0) return;
    const t = 1 - levelCompleteTimer / LEVEL_COMPLETE_DELAY;
    const fadeIn  = Math.min(1, t * 4);
    const pulse   = 0.9 + Math.sin(elapsed * 12) * 0.12;
    ctx.save();
    ctx.globalAlpha = fadeIn * 0.88;
    ctx.fillStyle = 'rgba(9,12,22,0.5)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = fadeIn * pulse;
    ctx.fillStyle = '#f7c948';
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#f7c948';
    ctx.font = 'bold ' + Math.round(CELL * 1.2) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LEVEL ' + level + ' CLEAR!', W / 2, H / 2);
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
  }

  function drawGlitchPass() {
    if (glitchTimer <= 0) return;
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const scanY = (Math.sin(elapsed * 40) * 0.5 + 0.5) * H;
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#2ec5ff';
    ctx.fillRect(0, scanY, W, 2);
    ctx.restore();
  }

  function drawWorld() {
    drawMaze();
    drawEffects();
    drawEnemies();
    drawPlayer();
    drawHudOverlay();
  }

  function drawStartScreen() {
    // Animated background maze
    drawMaze();

    // Dark overlay
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
    grad.addColorStop(0, 'rgba(9,12,22,0.72)');
    grad.addColorStop(1, 'rgba(9,12,22,0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Animated Pac-Man chasing
    const t = introElapsed;
    const demoX = (W * 0.1 + (t * CELL * 3) % (W * 0.8));
    const demoY = H * 0.62;
    const demoMouth = (0.1 + Math.abs(Math.sin(t * 5)) * 0.38) * Math.PI;
    ctx.fillStyle = '#ffe144';
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ffe144';
    ctx.beginPath();
    ctx.moveTo(demoX, demoY);
    ctx.arc(demoX, demoY, PSIZE * 1.05, demoMouth, Math.PI * 2 - demoMouth);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // "PRESS START" pulsing
    const pulseFactor = 0.92 + Math.sin(t * 3) * 0.10;
    ctx.save();
    ctx.translate(W / 2, H * 0.42);
    ctx.scale(pulseFactor, pulseFactor);
    ctx.fillStyle = '#f7c948';
    ctx.shadowBlur = 22;
    ctx.shadowColor = '#f7c948';
    ctx.font = 'bold ' + Math.round(CELL * 0.95) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PRESS START', 0, 0);
    ctx.restore();
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.fillStyle = '#8b949e';
    ctx.font = Math.round(CELL * 0.5) + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Arrow Keys / WASD to move', W / 2, H * 0.52);
    ctx.textBaseline = 'alphabetic';
  }

  function drawPausedOverlay() {
    ctx.save();
    ctx.fillStyle = 'rgba(9,12,22,0.65)';
    ctx.fillRect(0, 0, W, H);
    const pulse = 0.92 + Math.sin(introElapsed * 2.5) * 0.09;
    ctx.translate(W / 2, H / 2);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#f7c948';
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#f7c948';
    ctx.font = 'bold ' + Math.round(CELL * 1.1) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PAUSED', 0, 0);
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
  }

  function drawGameOverOverlay() {
    ctx.save();
    ctx.fillStyle = 'rgba(9,12,22,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.translate(W / 2, H / 2 - CELL * 0.6);
    ctx.fillStyle = '#ff4fd1';
    ctx.shadowBlur = 22;
    ctx.shadowColor = '#ff4fd1';
    ctx.font = 'bold ' + Math.round(CELL * 1.08) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', 0, 0);
    ctx.restore();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#f7c948';
    ctx.font = 'bold ' + Math.round(CELL * 0.65) + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Score: ' + score, W / 2, H / 2 + CELL * 0.55);

    ctx.fillStyle = '#8b949e';
    ctx.font = Math.round(CELL * 0.48) + 'px system-ui';
    ctx.fillText('Press Start to play again', W / 2, H / 2 + CELL * 1.3);
    ctx.textBaseline = 'alphabetic';
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0d1e');
    bg.addColorStop(1, '#080b18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    if (!running && !gameOver) {
      drawStartScreen();
      return;
    }

    const zoom   = powerTimer > 0 ? 1.018 : 1;
    const shakeX = shakeTime > 0 ? (Math.random() - 0.5) * shakeIntensity : 0;
    const shakeY = shakeTime > 0 ? (Math.random() - 0.5) * shakeIntensity : 0;
    ctx.save();
    ctx.translate(W / 2 + shakeX, H / 2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);

    if (glitchRgbShift > 0) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.translate(glitchRgbShift, 0);
      drawWorld();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.translate(-glitchRgbShift, 0);
      drawWorld();
      ctx.restore();
    }

    drawWorld();

    if (powerFlashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.32, powerFlashTimer * 2.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    drawGlitchPass();
    drawLevelCompleteOverlay();

    ctx.restore();

    if (paused)   drawPausedOverlay();
    if (gameOver) drawGameOverOverlay();
  }

  // ─────────────────────────────────────────────────────────────────────
  // GAME LOOP
  // ─────────────────────────────────────────────────────────────────────

  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    // introElapsed drives animations for start screen, pause, and game-over overlays
    if (!running || paused || gameOver) introElapsed += dt;
    update(dt);
    draw();
    if (running && !paused && !gameOver) startMusic();
    raf = requestAnimationFrame(loop);
  }

  // ─────────────────────────────────────────────────────────────────────
  // SCORE SUBMISSION
  // ─────────────────────────────────────────────────────────────────────

  function canSubmitCompetitive() {
    if (typeof window === 'undefined') return false;
    const identity = window.MOONBOYS_IDENTITY;
    if (!identity || typeof identity.isTelegramLinked !== 'function') return false;
    return !!identity.isTelegramLinked();
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
    running = false;
    gameOver = true;
    stopMusic();
    stopAllSounds();
    setBestMaybe();
    updateHud();

    if (!submittedRunScore && canSubmitCompetitive()) {
      submittedRunScore = true;
      try { await submitScore(resolveCompetitivePlayer(), score, GAME_ID); } catch (_) {}
    }

    draw();
    if (window.showGameOverModal) window.showGameOverModal(score);
  }

  // ─────────────────────────────────────────────────────────────────────
  // RESET / START / PAUSE
  // ─────────────────────────────────────────────────────────────────────

  function resetGame() {
    score = 0;
    level = 1;
    lives = 3;
    powerTimer = 0;
    running = false;
    paused = false;
    gameOver = false;
    deathTimer = 0;
    levelCompleteTimer = 0;
    elapsed = 0;
    submittedRunScore = false;
    ghostCombo = 0;
    speedBoostTimer = 0;
    slowEnemiesTimer = 0;
    doubleScoreTimer = 0;
    particles.length = 0;
    floatingTexts.length = 0;
    stopMusic();
    resetChain();
    spawnPlayer();
    buildMaze();
    spawnEnemies();
    updateHud();
    draw();
  }

  // ─────────────────────────────────────────────────────────────────────
  // INPUT
  // ─────────────────────────────────────────────────────────────────────

  function onKeyDown(e) {
    if (!running || paused) return;
    switch (e.key) {
      case 'ArrowLeft':  case 'a': player.ndx = -1; player.ndy =  0; e.preventDefault(); break;
      case 'ArrowRight': case 'd': player.ndx =  1; player.ndy =  0; e.preventDefault(); break;
      case 'ArrowUp':    case 'w': player.ndx =  0; player.ndy = -1; e.preventDefault(); break;
      case 'ArrowDown':  case 's': player.ndx =  0; player.ndy =  1; e.preventDefault(); break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // BUTTON HANDLERS
  // ─────────────────────────────────────────────────────────────────────

  function onStartClick() {
    resetGame();
    running = true;
    gameOver = false;
    paused = false;
    player.ndx = 1; player.ndy = 0;
    lastTime = performance.now();
    if (raf) cancelAnimationFrame(raf);
    startMusic();
    raf = requestAnimationFrame(loop);
  }

  function onPauseClick() {
    if (!running) return;
    paused = !paused;
    if (paused) stopMusic();
    else startMusic();
  }

  function onResetClick() {
    if (raf) cancelAnimationFrame(raf);
    stopMusic();
    stopAllSounds();
    resetGame();
    // Re-start idle loop for start screen animation
    lastTime = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function onMusicMuteClick() {
    musicMuted = !musicMuted;
    if (musicMuted) stopMusic();
    else startMusic();
    syncMusicButton();
  }

  // ─────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────

  function init() {
    best = ArcadeSync.getHighScore(GAME_ID);
    spawnPlayer();
    buildMaze();
    spawnEnemies();
    resetChain();
    updateHud();

    // Set initial canvas dimensions
    canvas.width  = W;
    canvas.height = H;

    // Ensure canvas has aspect-ratio for CSS scaling
    canvas.style.setProperty('aspect-ratio', COLS + ' / ' + ROWS);

    document.addEventListener('keydown', onKeyDown);

    // Fullscreen resize listeners — store bound refs for proper removal
    // The 200ms delay on overlay-open lets the CSS transition finish placing
    // the game-card inside the stage before we measure available dimensions.
    _onOverlayOpen  = function () { setTimeout(handleResize, 200); };
    _onOverlayClose = handleResize;
    _onWindowResize = handleResize;
    document.addEventListener('arcade-overlay-open',  _onOverlayOpen);
    document.addEventListener('arcade-overlay-close', _onOverlayClose);
    document.addEventListener('arcade-overlay-exit',  _onOverlayClose);
    window.addEventListener('resize', _onWindowResize);

    const startBtn     = document.getElementById('startBtn');
    const pauseBtn     = document.getElementById('pauseBtn');
    const resetBtn     = document.getElementById('resetBtn');
    const musicMuteBtn = document.getElementById('musicMuteBtn');
    if (startBtn)     startBtn.onclick     = onStartClick;
    if (pauseBtn)     pauseBtn.onclick     = onPauseClick;
    if (resetBtn)     resetBtn.onclick     = onResetClick;
    if (musicMuteBtn) musicMuteBtn.onclick = onMusicMuteClick;

    syncMusicButton();
    // Start idle loop (animates start screen)
    lastTime = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function start()  { onStartClick(); }

  function pause() {
    if (!running) return;
    paused = true;
    stopMusic();
  }

  function resume() {
    if (!running || !paused) return;
    paused = false;
    startMusic();
  }

  function reset() { onResetClick(); }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    stopMusic();
    stopAllSounds();
    document.removeEventListener('keydown', onKeyDown);
    if (_onOverlayOpen)  document.removeEventListener('arcade-overlay-open',  _onOverlayOpen);
    if (_onOverlayClose) {
      document.removeEventListener('arcade-overlay-close', _onOverlayClose);
      document.removeEventListener('arcade-overlay-exit',  _onOverlayClose);
    }
    if (_onWindowResize) window.removeEventListener('resize', _onWindowResize);

    const startBtn     = document.getElementById('startBtn');
    const pauseBtn     = document.getElementById('pauseBtn');
    const resetBtn     = document.getElementById('resetBtn');
    const musicMuteBtn = document.getElementById('musicMuteBtn');
    if (startBtn)     startBtn.onclick     = null;
    if (pauseBtn)     pauseBtn.onclick     = null;
    if (resetBtn)     resetBtn.onclick     = null;
    if (musicMuteBtn) musicMuteBtn.onclick = null;
  }

  function getScore() { return score; }

  return { init, start, pause, resume, reset, destroy, getScore };
}
