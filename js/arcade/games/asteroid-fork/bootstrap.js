/**
 * bootstrap.js â€” Asteroid Fork game module
 *
 * Contains all Asteroid Fork game logic.  Exports bootstrapAsteroidFork(), which is
 * the entry point called by game-shell.js via mountGame().
 *
 * Integrations preserved:
 *  - ArcadeSync   (local high-score persistence)
 *  - submitScore  (leaderboard-client.js remote submission)
 *  - window.showGameOverModal          (game-fullscreen.js)
 *
 * Built on latest main â€” inherits merged audio system (PR #200) and
 * follows Pac-Chain cleanup pattern (PR #201).
 * No fake reward logic. Real gameplay score only.
 */

import { ArcadeSync }                        from '/js/arcade-sync.js';
import { submitScore }                       from '/js/leaderboard-client.js';
import { ASTEROID_FORK_CONFIG } from './config.js';
import { createGameAdapter, registerGameAdapter } from '/js/arcade/engine/game-adapter.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';

// Register in the central registry when this module is first imported.
export const ASTEROID_FORK_ADAPTER = createGameAdapter({
  id: ASTEROID_FORK_CONFIG.id,
  name: ASTEROID_FORK_CONFIG.label,
  systems: {},
  legacyBootstrap: function (root) {
    return bootstrapAsteroidFork(root);
  },
});

registerGameAdapter(ASTEROID_FORK_CONFIG, ASTEROID_FORK_ADAPTER, bootstrapAsteroidFork);
/**
 * Bootstrap the Asteroid Fork game.
 *
 * @param {Element} root - The .game-card element (unused directly; DOM IDs are unique).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapAsteroidFork(root) {
  const GAME_ID = ASTEROID_FORK_CONFIG.id;
  const canvas  = document.getElementById('astCanvas');
  const ctx     = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const scoreEl = document.getElementById('score');
  const bestEl  = document.getElementById('best');
  const waveEl  = document.getElementById('wave');
  const livesEl = document.getElementById('lives');

  // Performance guard: cap total live particles
  const MAX_PARTICLES = 260;

  let score = 0, lives = 3, wave = 0, running = false, paused = false, gameOver = false;
  let best = ArcadeSync.getHighScore(GAME_ID);
  let raf = null, lastTime = 0;

  // Wave intro banner state
  let waveIntroTime = 0, waveIntroNum = 0;

  const keys = {};

  function onKeyDown(e) {
    keys[e.key] = true;
    if (e.key === ' ' && running && !paused) { e.preventDefault(); tryShoot(); }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(e.key)) e.preventDefault();
  }
  function onKeyUp(e) { keys[e.key] = false; }

  // â”€â”€ Entity state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  let ship;
  const SHIP_VERTS = [{x:0,y:-18},{x:-11,y:12},{x:0,y:7},{x:11,y:12}];
  let invincible = 0;
  let shootCooldown = 0;
  let bullets = [];
  let asteroids = [];
  let particles = [];
  const scoreTexts = [];
  const hitFlashes = [];
  let shakeTime = 0;
  let shakeIntensity = 0;

  // Persistent scrolling starfield â€” initialised once, updated every frame
  const stars = [];
  for (let i = 0; i < 60; i++) {
    stars.push({
      x:     Math.random() * W,
      y:     Math.random() * H,
      r:     0.4 + Math.random() * 1.2,
      spd:   10 + Math.random() * 28,
      alpha: 0.1 + Math.random() * 0.3,
    });
  }

  // â”€â”€ Audio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function playGameSound(id) {
    if (isMuted()) return;
    playSound(id);
  }

  // â”€â”€ Entity factories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function makeShip() {
    return { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: 0, thrusting: false };
  }

  function spawnAsteroids() {
    const count = 3 + wave * 2;
    asteroids = [];
    for (let i = 0; i < count; i++) {
      let x, y;
      do { x = Math.random() * W; y = Math.random() * H; }
      while (Math.hypot(x - W / 2, y - H / 2) < 140);
      asteroids.push(makeAsteroid(x, y, 3));
    }
  }

  function makeAsteroid(x, y, tier) {
    const spd = 40 + Math.random() * 60 + wave * 5;
    const ang = Math.random() * Math.PI * 2;
    const r   = tier === 3 ? 38 : tier === 2 ? 22 : 12;
    const verts = [];
    const sides = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < sides; i++) {
      const a  = i / sides * Math.PI * 2;
      const rr = r * (0.7 + Math.random() * 0.5);
      verts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
    }
    return { x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r, tier, verts, angle: 0, spin: (Math.random() - 0.5) * 1.2 };
  }

  // â”€â”€ Controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function tryShoot() {
    if (shootCooldown > 0) return;
    const a = ship.angle;
    bullets.push({ x: ship.x + Math.sin(a) * 20, y: ship.y - Math.cos(a) * 20, vx: Math.sin(a) * 600, vy: -Math.cos(a) * 600, life: 1.1 });
    shootCooldown = 0.22;
    playGameSound('asteroid-fork-shoot');
  }

  function wrap(v, max) { return ((v % max) + max) % max; }

  // â”€â”€ HUD helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent  = best;
    waveEl.textContent  = wave || 'â€”';
    livesEl.textContent = lives;
  }

  function triggerHudFx(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  function setBestMaybe() {
    if (score > best) {
      best = score;
      ArcadeSync.setHighScore(GAME_ID, best);
    }
  }

  function addScore(points, x, y, color = '#f7c948') {
    if (!points) return;
    score += points;
    setBestMaybe();
    updateHud();
    triggerHudFx(scoreEl, 'pulse', 180);
    if (typeof x === 'number' && typeof y === 'number') {
      scoreTexts.push({ x, y, text: `+${points}`, life: 0.8, maxLife: 0.8, color });
    }
  }

  // â”€â”€ Reset â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function resetGame() {
    score = 0; lives = 3; wave = 0; running = false; paused = false; gameOver = false;
    ship = makeShip(); bullets = []; asteroids = []; particles = [];
    invincible = 0; shootCooldown = 0;
    scoreTexts.length = 0; hitFlashes.length = 0;
    shakeTime = 0; shakeIntensity = 0;
    waveIntroTime = 0; waveIntroNum = 0;
    updateHud(); draw();
  }

  // â”€â”€ Visual effect helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = 50 + Math.random() * 120;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.5, color });
    }
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  }

  /**
   * Spawn short-lived exhaust particles from the back of the ship.
   * Called every frame while thrusting.
   */
  function spawnThrustParticles() {
    // Exhaust origin: behind ship along thrust axis
    const ex = ship.x - Math.sin(ship.angle) * 10;
    const ey = ship.y + Math.cos(ship.angle) * 10;
    const baseAng = ship.angle + Math.PI;
    for (let i = 0; i < 2; i++) {
      const a   = baseAng + (Math.random() - 0.5) * 0.9;
      const spd = 55 + Math.random() * 80;
      particles.push({
        x:    ex + (Math.random() - 0.5) * 4,
        y:    ey + (Math.random() - 0.5) * 4,
        vx:   Math.sin(a) * spd + ship.vx * 0.35,
        vy:  -Math.cos(a) * spd + ship.vy * 0.35,
        life: 0.13 + Math.random() * 0.1,
        color: Math.random() > 0.55 ? '#f7c948' : '#ff4fd1',
      });
    }
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  }

  function spawnHitFlash(x, y, r = 16, life = 0.12) {
    hitFlashes.push({ x, y, r, life, maxLife: life });
  }

  function triggerShake(intensity, duration) {
    shakeIntensity = Math.max(shakeIntensity, intensity);
    shakeTime      = Math.max(shakeTime,      duration);
  }

  // â”€â”€ Effect tick â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function updateEffects(dt) {
    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.97;     p.vy *= 0.97;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Floating score texts
    for (let i = scoreTexts.length - 1; i >= 0; i--) {
      const t = scoreTexts[i];
      t.life -= dt;
      t.y -= 32 * dt;
      if (t.life <= 0) scoreTexts.splice(i, 1);
    }

    // Hit flash rings
    for (let i = hitFlashes.length - 1; i >= 0; i--) {
      const f = hitFlashes[i];
      f.life -= dt;
      if (f.life <= 0) hitFlashes.splice(i, 1);
    }

    // Screen shake decay
    if (shakeTime > 0) {
      shakeTime -= dt;
      shakeIntensity *= 0.9;
      if (shakeTime <= 0) { shakeTime = 0; shakeIntensity = 0; }
    }

    // Wave intro banner countdown
    if (waveIntroTime > 0) waveIntroTime -= dt;

    // Scroll stars downward (slow parallax)
    for (const s of stars) {
      s.y += s.spd * dt;
      if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
    }
  }

  // â”€â”€ Game update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function update(dt) {
    if (!running || paused || gameOver) { updateEffects(dt); return; }

    // Ship steering
    if (keys['ArrowLeft']  || keys['a']) ship.angle -= 3.2 * dt;
    if (keys['ArrowRight'] || keys['d']) ship.angle += 3.2 * dt;
    if (keys['ArrowUp']    || keys['w']) {
      ship.vx += Math.sin(ship.angle) * 350 * dt;
      ship.vy -= Math.cos(ship.angle) * 350 * dt;
      ship.thrusting = true;
    } else {
      ship.thrusting = false;
    }

    // Exhaust particles when thrusting
    if (ship.thrusting) spawnThrustParticles();

    const drag = 0.98;
    ship.vx *= drag; ship.vy *= drag;
    ship.x = wrap(ship.x + ship.vx * dt, W);
    ship.y = wrap(ship.y + ship.vy * dt, H);

    if (invincible   > 0) invincible   -= dt;
    if (shootCooldown > 0) shootCooldown -= dt;

    // Bullet movement
    bullets.forEach(b => {
      b.x = wrap(b.x + b.vx * dt, W);
      b.y = wrap(b.y + b.vy * dt, H);
      b.life -= dt;
    });
    bullets = bullets.filter(b => b.life > 0);

    // Asteroid movement
    asteroids.forEach(a => {
      a.x = wrap(a.x + a.vx * dt, W);
      a.y = wrap(a.y + a.vy * dt, H);
      a.angle += a.spin * dt;
    });

    // Wave clear â€” start next wave
    if (!asteroids.length) {
      wave++;
      waveIntroTime = 1.8; waveIntroNum = wave;
      spawnAsteroids();
      waveEl.textContent = wave;
      updateEffects(dt);
      return;
    }

    // Bullet â†” asteroid collisions
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      for (let ai = asteroids.length - 1; ai >= 0; ai--) {
        const a = asteroids[ai];
        if (Math.hypot(b.x - a.x, b.y - a.y) < a.r) {
          playGameSound('asteroid-fork-hit');
          // More particles for larger asteroids
          spawnParticles(a.x, a.y, '#bc8cff', a.tier === 3 ? 12 : 8);
          spawnHitFlash(a.x, a.y, a.r * 0.7, 0.1);
          bullets.splice(bi, 1);
          const pts = a.tier === 3 ? 20 : a.tier === 2 ? 50 : 100;
          addScore(pts * wave, a.x, a.y, '#f7c948');
          triggerShake(a.tier === 3 ? 4 : a.tier === 2 ? 2.8 : 1.8, 0.08);
          if (a.tier > 1) {
            const nt = a.tier - 1;
            asteroids.push(makeAsteroid(a.x, a.y, nt));
            asteroids.push(makeAsteroid(a.x, a.y, nt));
          }
          asteroids.splice(ai, 1);
          break;
        }
      }
    }

    // Ship â†” asteroid collision
    if (invincible <= 0) {
      for (const a of asteroids) {
        if (Math.hypot(ship.x - a.x, ship.y - a.y) < a.r + 10) {
          playGameSound('asteroid-fork-ship-hit');
          // Enhanced death burst: more particles + big flash
          spawnParticles(ship.x, ship.y, '#ff4fd1', 20);
          spawnParticles(ship.x, ship.y, '#ffffff', 8);
          spawnHitFlash(ship.x, ship.y, 44, 0.22);
          triggerShake(12, 0.38);
          lives--;
          triggerHudFx(livesEl, 'flash', 220);
          livesEl.textContent = lives;
          if (lives <= 0) { onGameOver(); return; }
          ship = makeShip();
          invincible = 3;
          break;
        }
      }
    }

    updateEffects(dt);
  }

  // â”€â”€ Rendering helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function transformedVerts(verts, x, y, angle) {
    return verts.map(v => ({
      x: x + v.x * Math.cos(angle) - v.y * Math.sin(angle),
      y: y + v.x * Math.sin(angle) + v.y * Math.cos(angle),
    }));
  }

  function drawPoly(verts, color, lw = 1.5) {
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath();
    verts.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y));
    ctx.closePath(); ctx.stroke();
  }

  // â”€â”€ Main draw â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function draw() {
    // Screen shake transform
    const shakeX = shakeTime > 0 ? (Math.random() - 0.5) * shakeIntensity : 0;
    const shakeY = shakeTime > 0 ? (Math.random() - 0.5) * shakeIntensity : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Background
    ctx.fillStyle = '#090c16';
    ctx.fillRect(0, 0, W, H);

    // Moving starfield
    stars.forEach(s => {
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Idle screen
    if (!running && !gameOver) {
      ctx.fillStyle = '#bc8cff'; ctx.font = 'bold 28px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('Press Start', W / 2, H / 2);
      ctx.restore(); return;
    }

    // Pause overlay
    if (paused) {
      ctx.fillStyle = '#f7c948'; ctx.font = 'bold 32px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W / 2, H / 2);
    }

    // Game over overlay
    if (gameOver) {
      ctx.fillStyle = '#ff4fd1'; ctx.font = 'bold 32px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 20);
      ctx.fillStyle = '#f7c948'; ctx.font = 'bold 20px system-ui';
      ctx.fillText('Score: ' + score, W / 2, H / 2 + 16);
      ctx.fillStyle = '#8b949e'; ctx.font = '16px system-ui';
      ctx.fillText('Press Start to play again', W / 2, H / 2 + 50);
      ctx.restore(); return;
    }

    // Asteroids â€” soft outer glow (second draw at low alpha / wide line) + sharp inner
    asteroids.forEach(a => {
      const verts = transformedVerts(a.verts, a.x, a.y, a.angle);
      ctx.globalAlpha = 0.13;
      drawPoly(verts, '#bc8cff', 7);
      ctx.globalAlpha = 1;
      drawPoly(verts, '#bc8cff', 2);
    });

    // Bullets â€” directional streak + bright dot head
    bullets.forEach(b => {
      const spd = Math.hypot(b.vx, b.vy);
      if (spd > 1) {
        const nx = b.vx / spd, ny = b.vy / spd;
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#ffe87a'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - nx * 20, b.y - ny * 20);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f7c948';
      ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Particles (hit debris, thrust exhaust, ship death)
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Hit flash rings
    hitFlashes.forEach(f => {
      const alpha = Math.max(0, f.life / f.maxLife);
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1 + (1 - alpha) * 0.7), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Floating score texts
    scoreTexts.forEach(t => {
      ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
      ctx.fillStyle = t.color;
      ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
    });
    ctx.globalAlpha = 1;

    // Ship â€” outer glow layer + solid inner
    if (invincible <= 0 || Math.floor(invincible * 8) % 2 === 0) {
      const sv = transformedVerts(SHIP_VERTS, ship.x, ship.y, ship.angle);
      ctx.globalAlpha = 0.18;
      drawPoly(sv, '#2ec5ff', 8);
      ctx.globalAlpha = 1;
      drawPoly(sv, '#2ec5ff', 2);

      if (ship.thrusting) {
        const thrust = [{x:0,y:7},{x:-5,y:18},{x:5,y:18}];
        const tv = transformedVerts(thrust, ship.x, ship.y, ship.angle);
        ctx.strokeStyle = '#ff4fd1'; ctx.lineWidth = 2;
        ctx.beginPath(); tv.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y));
        ctx.closePath(); ctx.stroke();
      }
    }

    // Life indicators (bottom-left)
    for (let i = 0; i < lives; i++) {
      const lx = 20 + i * 26, ly = H - 14;
      drawPoly(transformedVerts(SHIP_VERTS, lx, ly, 0), '#2ec5ff', 1.5);
    }

    // Wave intro banner
    if (waveIntroTime > 0) {
      const alpha = Math.min(1, waveIntroTime * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#f7c948'; ctx.font = 'bold 36px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('WAVE ' + waveIntroNum, W / 2, H * 0.38);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // â”€â”€ Game loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05); lastTime = ts;
    update(dt); draw();
    raf = requestAnimationFrame(loop);
  }

  // â”€â”€ Game over â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async function onGameOver() {
    running = false; gameOver = true;
    stopAllSounds();
    setBestMaybe();
    updateHud();
    try { await submitScore(ArcadeSync.getPlayer(), score, GAME_ID); } catch (e) {}
    draw();
    if (window.showGameOverModal) window.showGameOverModal(score);
  }

  // â”€â”€ Lifecycle implementation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function init() {
    best = ArcadeSync.getHighScore(GAME_ID);
    ship = makeShip();
    updateHud(); draw();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    document.getElementById('startBtn').onclick = () => {
      resetGame();
      running = true; wave = 1;
      waveIntroTime = 1.8; waveIntroNum = 1;
      spawnAsteroids(); waveEl.textContent = wave;
      lastTime = performance.now();
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    document.getElementById('pauseBtn').onclick = () => {
      if (running) {
        paused = !paused;
        if (paused) stopAllSounds();
      }
    };
    document.getElementById('resetBtn').onclick = () => {
      if (raf) cancelAnimationFrame(raf);
      stopAllSounds();
      resetGame(); raf = requestAnimationFrame(() => draw());
    };
  }

  function start() {
    resetGame();
    running = true; wave = 1;
    waveIntroTime = 1.8; waveIntroNum = 1;
    spawnAsteroids(); waveEl.textContent = wave;
    lastTime = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function pause() {
    if (running) { paused = true; stopAllSounds(); }
  }

  function resume() {
    if (running && paused) paused = false;
  }

  function reset() {
    if (raf) cancelAnimationFrame(raf);
    stopAllSounds();
    resetGame(); raf = requestAnimationFrame(() => draw());
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    stopAllSounds();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    if (startBtn) startBtn.onclick = null;
    if (pauseBtn) pauseBtn.onclick = null;
    if (resetBtn) resetBtn.onclick = null;
  }

  function getScore() { return score; }

  // â”€â”€ Public lifecycle object â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return { init, start, pause, resume, reset, destroy, getScore };
}
