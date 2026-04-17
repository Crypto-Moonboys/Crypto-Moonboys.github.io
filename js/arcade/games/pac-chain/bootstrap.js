/**
 * bootstrap.js — Pac-Chain game module
 */

import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { rollHiddenBonus } from '/js/bonus-engine.js';
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
  const COLS = 20;
  const ROWS = 20;
  const CELL = 28;
  const W = COLS * CELL;
  const H = ROWS * CELL;
  canvas.width = W;
  canvas.height = H;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const chainEl = document.getElementById('chain');
  const chainStatEl = chainEl ? chainEl.closest('.stat') : null;

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

  const PLAYER_START_X = 10;
  const PLAYER_START_Y = 16;
  const BASE_PLAYER_SPEED = 5.5;
  const ESPEED = 4.0;
  const PSIZE = 13;
  const POWER_FLASH_FREQ = 4;
  const POWER_FLASH_THRESHOLD = 2;
  const DEATH_FREEZE_S = 1.2;
  const PLAYER_SPEED_PER_LEVEL = 0.04;
  const GHOST_SPEED_PER_LEVEL = 0.08;
  const ENEMY_COLORS = ['#ff4fd1', '#3fb950', '#bc8cff', '#2ec5ff'];
  const CHAIN_WINDOW_S = 1.8;
  const MAX_PARTICLES = 300;
  const MAX_FLOATING_TEXTS = 50;
  const MAX_TRAIL_POINTS = 12;

  const SFX = {
    pellet: { kind: 'tone', type: 'square', freqStart: 720, freqEnd: 650, duration: 0.045, volume: 0.02 },
    power: { kind: 'tone', type: 'sawtooth', freqStart: 220, freqEnd: 520, duration: 0.14, volume: 0.03 },
    ghost: { kind: 'tone', type: 'triangle', freqStart: 920, freqEnd: 420, duration: 0.12, volume: 0.03 },
    hit: { kind: 'tone', type: 'sawtooth', freqStart: 180, freqEnd: 70, duration: 0.2, volume: 0.04 },
    chain: { kind: 'tone', type: 'square', freqStart: 420, freqEnd: 860, duration: 0.08, volume: 0.02 },
    bonus: { kind: 'tone', type: 'triangle', freqStart: 300, freqEnd: 760, duration: 0.11, volume: 0.025 },
  };

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
  let mouthAngle = 0;
  let mouthDir = 1;
  let lastPelletAt = -100;
  let chain = 1;
  let chainPulse = 0;
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

  const particles = [];
  const floatingTexts = [];
  const playerTrail = [];
  const musicHandles = [];
  let musicMuted = false;

  let player = {
    x: PLAYER_START_X,
    y: PLAYER_START_Y,
    dx: 0,
    dy: 0,
    ndx: 1,
    ndy: 0,
    px: 0,
    py: 0,
    speed: BASE_PLAYER_SPEED,
    moving: false,
  };

  let enemies = [];

  function tileCenter(t) {
    return t * CELL + CELL / 2;
  }

  function playGameSound(id) {
    if (isMuted()) return null;
    const spec = SFX[id];
    if (!spec) return null;
    return playSound(`pac-chain-${id}`, spec);
  }

  function stopMusic() {
    while (musicHandles.length) {
      const handle = musicHandles.pop();
      try {
        if (handle && typeof handle.stop === 'function') handle.stop();
      } catch (_) {}
    }
  }

  function startMusic() {
    if (musicMuted || isMuted() || !running || paused || gameOver || musicHandles.length) return;
    const bass = playSound('pac-chain-music-bass', {
      kind: 'tone',
      type: 'square',
      freqStart: 110,
      freqEnd: 110,
      duration: null,
      loop: true,
      volume: 0.008,
    });
    const lead = playSound('pac-chain-music-lead', {
      kind: 'tone',
      type: 'triangle',
      freqStart: 220,
      freqEnd: 222,
      duration: null,
      loop: true,
      volume: 0.006,
    });
    if (bass) musicHandles.push(bass);
    if (lead) musicHandles.push(lead);
  }

  function syncMusicButton() {
    const btn = document.getElementById('musicMuteBtn');
    if (!btn) return;
    btn.textContent = musicMuted ? 'Music Off' : 'Music On';
    btn.setAttribute('aria-pressed', String(musicMuted));
  }

  function triggerShake(intensity, duration) {
    shakeIntensity = Math.max(shakeIntensity, intensity);
    shakeTime = Math.max(shakeTime, duration);
  }

  function pushTrailPoint() {
    playerTrail.push({ x: player.px, y: player.py, life: 0.45, maxLife: 0.45 });
    if (playerTrail.length > MAX_TRAIL_POINTS) playerTrail.shift();
  }

  function spawnParticleBurst(x, y, count, color = '#f7c948') {
    const n = Math.max(5, Math.min(12, count));
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 130;
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        size: 1 + Math.random() * 2,
        color,
      });
    }
    if (particles.length > MAX_PARTICLES) {
      particles.splice(0, particles.length - MAX_PARTICLES);
    }
  }

  function spawnFloatingText(x, y, text, color = '#f7c948') {
    floatingTexts.push({ x, y, text, vy: -28, life: 0.7, maxLife: 0.7, color });
    if (floatingTexts.length > MAX_FLOATING_TEXTS) {
      floatingTexts.splice(0, floatingTexts.length - MAX_FLOATING_TEXTS);
    }
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
    if (scoreEl) scoreEl.textContent = String(score);
    if (bestEl) bestEl.textContent = String(best);
    if (chainEl) chainEl.textContent = `x${chain}`;
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
      playGameSound('chain');
      triggerChainPulse();
    } else {
      chain = 1;
    }
    lastPelletAt = now;
    return chain;
  }

  function addScore(base, options = {}) {
    const withChain = !!options.withChain;
    const comboMult = withChain ? chain : 1;
    const doubleMult = doubleScoreTimer > 0 ? 2 : 1;
    const points = Math.floor(base * comboMult * doubleMult);
    score += points;
    setBestMaybe();
    updateHud();

    if (typeof options.x === 'number' && typeof options.y === 'number') {
      spawnFloatingText(options.x, options.y, `+${points}`, options.color || '#f7c948');
    }
    return points;
  }

  function isWall(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return true;
    return maze[cy][cx] === 0;
  }

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

  function spawnEnemies() {
    enemies = [];
    const count = Math.min(4, 2 + Math.floor((level - 1) / 2));
    const starts = [{ x: 9, y: 9 }, { x: 10, y: 9 }, { x: 9, y: 10 }, { x: 10, y: 10 }];
    for (let i = 0; i < count; i++) {
      const start = starts[i];
      enemies.push({
        x: start.x,
        y: start.y,
        px: tileCenter(start.x),
        py: tileCenter(start.y),
        dx: i % 2 ? 1 : -1,
        dy: 0,
        color: ENEMY_COLORS[i],
        scared: false,
        scaredTimer: 0,
        respawnTimer: 0,
        dead: false,
        seed: Math.random() * Math.PI * 2,
      });
    }
  }

  function spawnPlayer() {
    player = {
      x: PLAYER_START_X,
      y: PLAYER_START_Y,
      dx: 0,
      dy: 0,
      ndx: 1,
      ndy: 0,
      px: tileCenter(PLAYER_START_X),
      py: tileCenter(PLAYER_START_Y),
      speed: BASE_PLAYER_SPEED,
      moving: false,
    };
    playerTrail.length = 0;
  }

  function moveEntity(e, speed, dt) {
    const centX = tileCenter(e.x);
    const centY = tileCenter(e.y);
    const distX = Math.abs(e.px - centX);
    const distY = Math.abs(e.py - centY);
    const atCent = distX < 2 && distY < 2;

    if (atCent) {
      e.px = centX;
      e.py = centY;
      if ((e.ndx || e.ndy) && !isWall(e.x + e.ndx, e.y + e.ndy)) {
        e.dx = e.ndx;
        e.dy = e.ndy;
      }
      if (isWall(e.x + e.dx, e.y + e.dy)) {
        e.dx = 0;
        e.dy = 0;
      }
    }

    e.px += e.dx * speed * CELL * dt;
    e.py += e.dy * speed * CELL * dt;

    const newTX = Math.floor(e.px / CELL);
    const newTY = Math.floor(e.py / CELL);
    if (newTX !== e.x || newTY !== e.y) {
      e.x = Math.max(0, Math.min(COLS - 1, newTX));
      e.y = Math.max(0, Math.min(ROWS - 1, newTY));
    }

    if (e.px < 0) {
      e.px = W;
      e.x = COLS - 1;
    }
    if (e.px > W) {
      e.px = 0;
      e.x = 0;
    }
  }

  function enemyAI(e, dt) {
    if (e.dead) {
      e.respawnTimer -= dt;
      if (e.respawnTimer <= 0) {
        e.dead = false;
        e.scared = false;
        e.x = 9;
        e.y = 9;
        e.px = tileCenter(9);
        e.py = tileCenter(9);
        e.dx = 1;
        e.dy = 0;
      }
      return;
    }

    const centX = tileCenter(e.x);
    const centY = tileCenter(e.y);
    const atCent = Math.abs(e.px - centX) < 3 && Math.abs(e.py - centY) < 3;
    if (atCent) {
      const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
      const valid = dirs.filter((d) => !isWall(e.x + d.dx, e.y + d.dy) && !(d.dx === -e.dx && d.dy === -e.dy));
      if (valid.length) {
        let chosen;
        if (e.scared) {
          chosen = valid.reduce((bestDir, d) => {
            const nx = e.x + d.dx;
            const ny = e.y + d.dy;
            const bestDist = (e.x + bestDir.dx - player.x) ** 2 + (e.y + bestDir.dy - player.y) ** 2;
            const dist = (nx - player.x) ** 2 + (ny - player.y) ** 2;
            return dist > bestDist ? d : bestDir;
          }, valid[0]);
        } else if (Math.random() < 0.6) {
          chosen = valid.reduce((bestDir, d) => {
            const nx = e.x + d.dx;
            const ny = e.y + d.dy;
            const bestDist = (e.x + bestDir.dx - player.x) ** 2 + (e.y + bestDir.dy - player.y) ** 2;
            const dist = (nx - player.x) ** 2 + (ny - player.y) ** 2;
            return dist < bestDist ? d : bestDir;
          }, valid[0]);
        } else {
          chosen = valid[Math.floor(Math.random() * valid.length)];
        }
        e.ndx = chosen.dx;
        e.ndy = chosen.dy;
      }
    }

    const slowFactor = slowEnemiesTimer > 0 ? 0.72 : 1;
    const speed = (e.scared ? ESPEED * 0.6 : ESPEED * (1 + level * GHOST_SPEED_PER_LEVEL)) * slowFactor;
    moveEntity(e, speed, dt);
  }

  function shouldTriggerGlitch() {
    if (glitchCooldown > 0) return false;
    if (score >= 1800 && Math.random() < 0.003) return true;
    return Math.random() < 0.0008;
  }

  async function maybeTriggerLegacyBonus() {
    try {
      const bonus = await rollHiddenBonus({ score, streak: chain, game: GAME_ID });
      if (!bonus) return;
      playGameSound('bonus');
      const rarity = String(bonus.rarity || '').toLowerCase();
      if (rarity === 'common') {
        speedBoostTimer = Math.max(speedBoostTimer, 3.8);
      } else if (rarity === 'uncommon') {
        slowEnemiesTimer = Math.max(slowEnemiesTimer, 3.8);
      } else if (rarity === 'rare') {
        doubleScoreTimer = Math.max(doubleScoreTimer, 4.5);
      } else if (rarity === 'epic') {
        speedBoostTimer = Math.max(speedBoostTimer, 4.5);
        slowEnemiesTimer = Math.max(slowEnemiesTimer, 4.5);
      } else {
        doubleScoreTimer = Math.max(doubleScoreTimer, 5.5);
        slowEnemiesTimer = Math.max(slowEnemiesTimer, 4.8);
      }
    } catch (_) {}
  }

  function handlePelletEat(tx, ty, isPower) {
    const cx = tx * CELL + CELL / 2;
    const cy = ty * CELL + CELL / 2;
    chainForPellet();
    if (isPower) {
      powerFlashTimer = 0.14;
      playGameSound('power');
      addScore(50, { withChain: true, x: cx, y: cy, color: '#ff8df0' });
      spawnParticleBurst(cx, cy, 10, '#ff4fd1');
      powerTimer = 8;
      enemies.forEach((e) => {
        if (!e.dead) {
          e.scared = true;
          e.scaredTimer = 8;
        }
      });
    } else {
      playGameSound('pellet');
      addScore(10, { withChain: true, x: cx, y: cy, color: '#f7c948' });
      spawnParticleBurst(cx, cy, 7, '#f7c948');
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
      maybeTriggerLegacyBonus();
    }
  }

  function processEnemyCollisions() {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const dx = e.px - player.px;
      const dy = e.py - player.py;
      if (Math.sqrt(dx * dx + dy * dy) < PSIZE + 8) {
        if (e.scared) {
          playGameSound('ghost');
          e.dead = true;
          e.respawnTimer = 4;
          const points = 200 * level;
          addScore(points, { x: e.px, y: e.py, color: '#2ec5ff' });
          spawnParticleBurst(e.px, e.py, 12, '#2ec5ff');
          triggerShake(4.5, 0.14);
        } else {
          onPlayerDeath();
        }
      }
    }
  }

  function onPlayerDeath() {
    playGameSound('hit');
    triggerShake(9, 0.3);
    resetChain();
    lives--;
    if (lives <= 0) {
      onGameOver();
      return;
    }
    powerTimer = 0;
    enemies.forEach((e) => {
      e.scared = false;
    });
    spawnPlayer();
    player.ndx = 1;
    player.ndy = 0;
    deathTimer = DEATH_FREEZE_S;
    updateHud();
  }

  function updateEffects(dt) {
    if (chainPulse > 0) chainPulse -= dt;
    if (powerFlashTimer > 0) powerFlashTimer -= dt;
    if (speedBoostTimer > 0) speedBoostTimer -= dt;
    if (slowEnemiesTimer > 0) slowEnemiesTimer -= dt;
    if (doubleScoreTimer > 0) doubleScoreTimer -= dt;
    if (shakeTime > 0) {
      shakeTime -= dt;
      if (shakeTime <= 0) shakeIntensity = 0;
    }
    if (glitchCooldown > 0) glitchCooldown -= dt;
    if (glitchTimer > 0) {
      glitchTimer -= dt;
      glitchRgbShift = 0.5 + Math.random() * 2.5;
    } else {
      glitchRgbShift = 0;
    }

    if (elapsed - lastPelletAt > CHAIN_WINDOW_S && chain !== 1) {
      chain = 1;
      updateHud();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const f = floatingTexts[i];
      f.life -= dt;
      f.y += f.vy * dt;
      if (f.life <= 0) floatingTexts.splice(i, 1);
    }

    for (let i = playerTrail.length - 1; i >= 0; i--) {
      const t = playerTrail[i];
      t.life -= dt;
      if (t.life <= 0) playerTrail.splice(i, 1);
    }

    if (shouldTriggerGlitch()) {
      glitchTimer = 0.08;
      glitchCooldown = 5 + Math.random() * 4;
    }
  }

  function update(dt) {
    if (!running || paused || gameOver) return;

    elapsed += dt;
    updateEffects(dt);

    if (deathTimer > 0) {
      deathTimer -= dt;
      return;
    }

    mouthAngle += mouthDir * 4 * dt;
    if (mouthAngle > 0.4) mouthDir = -1;
    if (mouthAngle < 0.02) mouthDir = 1;

    if (powerTimer > 0) {
      powerTimer -= dt;
      if (powerTimer <= 0) {
        powerTimer = 0;
        enemies.forEach((e) => {
          e.scared = false;
        });
      }
    }

    const speedBoost = speedBoostTimer > 0 ? 1.2 : 1;
    moveEntity(player, player.speed * speedBoost * (1 + level * PLAYER_SPEED_PER_LEVEL), dt);
    player.moving = !!(player.dx || player.dy || player.ndx || player.ndy);
    if (player.moving) pushTrailPoint();

    processPlayerTile();

    if (pelletsLeft <= 0) {
      level++;
      resetChain();
      powerTimer = 0;
      buildMaze();
      spawnEnemies();
      spawnPlayer();
      player.ndx = 1;
      player.ndy = 0;
      return;
    }

    enemies.forEach((e) => enemyAI(e, dt));
    processEnemyCollisions();
  }

  function drawMaze() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = running || gameOver ? maze[r][c] : MAZE_POOL[(level - 1) % MAZE_POOL.length][r][c];
        const x = c * CELL;
        const y = r * CELL;
        if (tile === 0) {
          ctx.fillStyle = '#1a2035';
          ctx.fillRect(x, y, CELL, CELL);
          ctx.strokeStyle = '#2ec5ff22';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
        } else if (tile === 1) {
          ctx.fillStyle = '#f7c948';
          ctx.shadowBlur = 5;
          ctx.shadowColor = '#f7c948';
          ctx.beginPath();
          ctx.arc(x + CELL / 2, y + CELL / 2, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (tile === 2) {
          const pulse = 0.8 + Math.sin(elapsed * 8 + c + r) * 0.25;
          ctx.fillStyle = '#ff4fd1';
          ctx.shadowBlur = 14;
          ctx.shadowColor = '#ff4fd1';
          ctx.beginPath();
          ctx.arc(x + CELL / 2, y + CELL / 2, 6.8 * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
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
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemies() {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;

      const flicker = 0.85 + Math.abs(Math.sin(elapsed * 9 + e.seed)) * 0.3;
      const jitter = Math.sin(elapsed * 20 + e.seed) * 0.7;
      const scaredGlitch = e.scared && Math.random() < 0.12;
      const ex = e.px + jitter;
      const ey = e.py + (Math.cos(elapsed * 17 + e.seed) * 0.5);

      let color = e.color;
      if (e.scared) {
        color = Math.floor(elapsed * 18) % 2 ? '#2ec5ff' : '#5fffb4';
        if (powerTimer < 2 && Math.floor(powerTimer * 6) % 2) color = '#ffffff';
      }

      ctx.save();
      if (scaredGlitch) ctx.translate((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
      ctx.globalAlpha = flicker;
      ctx.fillStyle = color;
      ctx.shadowBlur = e.scared ? 12 : 7;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(ex, ey, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#090c16';
      ctx.beginPath();
      ctx.arc(ex - 3, ey - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + 3, ey - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    for (let i = 0; i < playerTrail.length; i++) {
      const t = playerTrail[i];
      const alpha = Math.max(0, t.life / t.maxLife) * 0.35;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffe144';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const powerFlash = powerTimer > 0 && powerTimer < POWER_FLASH_THRESHOLD && Math.floor(powerTimer * POWER_FLASH_FREQ) % 2;
    const playerColor = powerTimer > 0 ? (powerFlash ? '#fff' : '#b3ffff') : '#ffe144';
    const glowColor = powerTimer > 0 ? '#2ec5ff' : '#ffe144';
    const movementPulse = player.moving ? (1 + Math.sin(elapsed * 12) * 0.1) : 1;
    const ma = mouthAngle * Math.PI;

    let facing = 0;
    if (player.dx === -1) facing = Math.PI;
    else if (player.dy === 1) facing = Math.PI / 2;
    else if (player.dy === -1) facing = (3 * Math.PI) / 2;

    ctx.save();
    ctx.translate(player.px, player.py);
    ctx.scale(movementPulse, movementPulse);
    ctx.shadowBlur = player.moving ? 18 : 10;
    ctx.shadowColor = glowColor;
    ctx.fillStyle = playerColor;
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

  function drawStatusOverlay() {
    ctx.fillStyle = '#d9e0ff';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`Lives: ${lives}`, 10, 20);
    ctx.fillText(`Level: ${level}`, 10, 38);

    if (chain > 1) {
      const pulseScale = 1 + Math.max(0, chainPulse) * 0.6;
      ctx.save();
      ctx.translate(W - 124, 26);
      ctx.scale(pulseScale, pulseScale);
      ctx.fillStyle = '#f7c948';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#f7c948';
      ctx.font = 'bold 18px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`CHAIN x${chain}`, 0, 0);
      ctx.restore();
      ctx.shadowBlur = 0;
    }

    if (doubleScoreTimer > 0) {
      ctx.fillStyle = '#ff4fd1';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('DOUBLE SCORE', W / 2, 20);
    }
  }

  function drawGlitchPass() {
    if (glitchTimer <= 0) return;
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const y = (Math.sin(elapsed * 40) * 0.5 + 0.5) * H;
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#2ec5ff';
    ctx.fillRect(0, y, W, 2);
    ctx.restore();
  }

  function drawWorld() {
    drawMaze();
    drawEffects();
    drawEnemies();
    drawPlayer();
    drawStatusOverlay();
  }

  function drawStateCards() {
    if (!running && !gameOver) {
      ctx.fillStyle = '#f7c948';
      ctx.font = 'bold 26px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Press Start', W / 2, H / 2);
      return;
    }
    if (paused) {
      ctx.fillStyle = '#f7c948';
      ctx.font = 'bold 30px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W / 2, H / 2);
    }
    if (gameOver) {
      ctx.fillStyle = '#ff4fd1';
      ctx.font = 'bold 30px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 18);
      ctx.fillStyle = '#f7c948';
      ctx.font = 'bold 18px system-ui';
      ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 16);
      ctx.fillStyle = '#8b949e';
      ctx.font = '14px system-ui';
      ctx.fillText('Press Start to play again', W / 2, H / 2 + 46);
    }
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(0, 0, W, H);

    const zoom = powerTimer > 0 ? 1.02 : 1;
    const shakeX = shakeTime > 0 ? (Math.random() - 0.5) * shakeIntensity : 0;
    const shakeY = shakeTime > 0 ? (Math.random() - 0.5) * shakeIntensity : 0;
    ctx.save();
    ctx.translate(W / 2 + shakeX, H / 2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);

    if (glitchRgbShift > 0) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.translate(glitchRgbShift, 0);
      drawWorld();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.translate(-glitchRgbShift, 0);
      drawWorld();
      ctx.restore();
    }

    drawWorld();

    if (powerFlashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.35, powerFlashTimer * 2.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    drawGlitchPass();

    ctx.restore();
    drawStateCards();
  }

  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update(dt);
    draw();
    if (running && !paused && !gameOver) startMusic();
    raf = requestAnimationFrame(loop);
  }

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
      try {
        await submitScore(resolveCompetitivePlayer(), score, 'pacchain');
      } catch (_) {}
    }

    draw();
    if (window.showGameOverModal) window.showGameOverModal(score);
  }

  function resetGame() {
    score = 0;
    level = 1;
    lives = 3;
    powerTimer = 0;
    running = false;
    paused = false;
    gameOver = false;
    deathTimer = 0;
    elapsed = 0;
    submittedRunScore = false;
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

  function onKeyDown(e) {
    if (!running || paused) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') {
      player.ndx = -1;
      player.ndy = 0;
      e.preventDefault();
    }
    if (e.key === 'ArrowRight' || e.key === 'd') {
      player.ndx = 1;
      player.ndy = 0;
      e.preventDefault();
    }
    if (e.key === 'ArrowUp' || e.key === 'w') {
      player.ndx = 0;
      player.ndy = -1;
      e.preventDefault();
    }
    if (e.key === 'ArrowDown' || e.key === 's') {
      player.ndx = 0;
      player.ndy = 1;
      e.preventDefault();
    }
  }

  function onStartClick() {
    resetGame();
    running = true;
    gameOver = false;
    paused = false;
    player.ndx = 1;
    player.ndy = 0;
    lastTime = performance.now();
    if (raf) cancelAnimationFrame(raf);
    startMusic();
    raf = requestAnimationFrame(loop);
  }

  function onPauseClick() {
    if (!running) return;
    paused = !paused;
    if (paused) {
      stopMusic();
    } else {
      startMusic();
    }
  }

  function onResetClick() {
    if (raf) cancelAnimationFrame(raf);
    stopMusic();
    stopAllSounds();
    resetGame();
    raf = requestAnimationFrame(draw);
  }

  function onMusicMuteClick() {
    musicMuted = !musicMuted;
    if (musicMuted) stopMusic();
    else startMusic();
    syncMusicButton();
  }

  function init() {
    best = ArcadeSync.getHighScore(GAME_ID);
    spawnPlayer();
    buildMaze();
    spawnEnemies();
    resetChain();
    updateHud();
    draw();
    syncMusicButton();

    document.addEventListener('keydown', onKeyDown);

    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const musicMuteBtn = document.getElementById('musicMuteBtn');

    if (startBtn) startBtn.onclick = onStartClick;
    if (pauseBtn) pauseBtn.onclick = onPauseClick;
    if (resetBtn) resetBtn.onclick = onResetClick;
    if (musicMuteBtn) musicMuteBtn.onclick = onMusicMuteClick;
  }

  function start() {
    onStartClick();
  }

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

  function reset() {
    onResetClick();
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    stopMusic();
    stopAllSounds();
    document.removeEventListener('keydown', onKeyDown);

    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const musicMuteBtn = document.getElementById('musicMuteBtn');

    if (startBtn) startBtn.onclick = null;
    if (pauseBtn) pauseBtn.onclick = null;
    if (resetBtn) resetBtn.onclick = null;
    if (musicMuteBtn) musicMuteBtn.onclick = null;
  }

  function getScore() {
    return score;
  }

  return { init, start, pause, resume, reset, destroy, getScore };
}
