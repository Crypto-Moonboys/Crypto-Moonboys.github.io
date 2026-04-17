/**
 * bootstrap.js — Invaders 3008 game module
 *
 * Contains all Invaders 3008 game logic. Exports bootstrapInvaders(), which is
 * the entry point called by game-shell.js via mountGame().
 *
 * Integrations preserved:
 *  - ArcadeSync   (local high-score persistence)
 *  - submitScore  (leaderboard-client.js remote submission)
 *  - window.showGameOverModal (game-fullscreen.js)
 */

import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { INVADERS_CONFIG } from './config.js';
import { GameRegistry } from '/js/arcade/core/game-registry.js';

GameRegistry.register(INVADERS_CONFIG.id, {
  label: INVADERS_CONFIG.label,
  bootstrap: bootstrapInvaders,
});

export function bootstrapInvaders(root) {
  const GAME_ID = INVADERS_CONFIG.id;
  const canvas = document.getElementById('invCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const waveEl = document.getElementById('wave');
  const livesEl = document.getElementById('lives');

  let score = 0;
  let lives = 3;
  let wave = 0;
  let running = false;
  let paused = false;
  let gameOver = false;
  let best = ArcadeSync.getHighScore(GAME_ID);
  let raf = null;
  let lastTime = 0;
  let elapsed = 0;

  const SHIP_W = 36;
  const SHIP_H = 20;
  let player = { x: W / 2, y: H - 50, w: SHIP_W, h: SHIP_H, speed: 320, moveDir: 1 };
  let bullets = [];
  const BULLET_SPD = 560;
  let shootCooldown = 0;
  const SHOOT_RATE = 0.2;

  const ROWS = 4;
  const COLS = 10;
  const INV_W = 36;
  const INV_H = 28;
  const INV_PAD = 10;
  const ROW_SPEED = [0.65, 0.9, 1.05, 1.35];
  let invaders = [];
  let invDir = 1;
  let invSpeed = 60;
  let invDropping = false;
  const DROP_AMT = 16;
  let invBullets = [];
  let invShootTimer = 0;
  let invShootInterval = 1.8;

  let boss = null;
  const BOSS_W = 80;
  const BOSS_H = 44;

  let streak = 0;
  let streakTimer = 0;

  const particles = [];
  const scoreTexts = [];
  const hitFlashes = [];

  let shakeTime = 0;
  let shakeIntensity = 0;

  const stars = [];
  for (let i = 0; i < 60; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      z: Math.random(),
      spd: 10 + Math.random() * 35,
    });
  }

  let audioCtx = null;
  const keys = {};

  function onKeyDown(e) {
    keys[e.key] = true;
    if (e.key === ' ' && running && !paused) {
      e.preventDefault();
      tryShoot();
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && running) e.preventDefault();
  }

  function onKeyUp(e) {
    keys[e.key] = false;
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function triggerHudFx(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
    waveEl.textContent = wave || '—';
    livesEl.textContent = lives;
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
      scoreTexts.push({ x, y, text: `+${points}`, life: 0.9, maxLife: 0.9, color });
    }
  }

  function screenShake(intensity, duration) {
    shakeIntensity = Math.max(shakeIntensity, intensity);
    shakeTime = Math.max(shakeTime, duration);
  }

  function getAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function playSfx(type) {
    const ac = getAudio();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume().catch(() => {});

    const params = {
      shoot: { freq: 620, dur: 0.05, gain: 0.03, wave: 'square' },
      hit: { freq: 180, dur: 0.07, gain: 0.04, wave: 'triangle' },
      explosion: { freq: 90, dur: 0.18, gain: 0.05, wave: 'sawtooth' },
    }[type];

    if (!params) return;

    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = params.wave;
    osc.frequency.setValueAtTime(params.freq, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, params.freq * 0.55), ac.currentTime + params.dur);
    gain.gain.setValueAtTime(params.gain, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + params.dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + params.dur);
  }

  function spawnExplosion(x, y, intensity = 1, color = '#ff4fd1') {
    const count = Math.floor(8 + intensity * 10);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = rand(40, 170) * intensity;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: rand(1.5, 3.5),
        life: rand(0.25, 0.55),
        maxLife: rand(0.25, 0.55),
        color,
      });
    }
    hitFlashes.push({ x, y, r: 10 + intensity * 15, life: 0.12, maxLife: 0.12 });
  }

  function getInvaderBasePoints(inv) {
    return (ROWS - inv.row) * 12;
  }

  function calcInvaderPoints(inv) {
    const base = getInvaderBasePoints(inv);
    const streakMul = 1 + Math.min(0.5, streak * 0.05);
    return Math.round(base * wave * streakMul);
  }

  function buildGrid() {
    invaders = [];
    const totalW = COLS * (INV_W + INV_PAD) - INV_PAD;
    const offX = (W - totalW) / 2;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        invaders.push({
          x: offX + c * (INV_W + INV_PAD),
          y: 60 + r * (INV_H + INV_PAD),
          w: INV_W,
          h: INV_H,
          row: r,
          alive: true,
          seed: Math.random() * Math.PI * 2 + c * 0.35,
        });
      }
    }
    invDir = 1;
    invSpeed = 54 + wave * 8 + (wave >= 3 ? 18 : 0) + (wave >= 7 ? 14 : 0) + (wave >= 10 ? 16 : 0);
    invShootInterval = Math.max(0.35, 1.7 - wave * 0.1 - (wave >= 10 ? 0.22 : 0));
    invShootTimer = rand(invShootInterval * 0.6, invShootInterval * 1.3);
    invDropping = false;
  }

  function spawnBoss() {
    boss = {
      x: W / 2 - BOSS_W / 2,
      y: 30,
      w: BOSS_W,
      h: BOSS_H,
      hp: 8 + wave,
      maxHp: 8 + wave,
      hpDisplay: 8 + wave,
      dir: 1,
      speed: 92 + wave * 10,
      flashTimer: 0,
      hitTimer: 0,
    };
    invShootTimer = rand(0.35, 0.65);
  }

  function startWave() {
    wave++;
    bullets = [];
    invBullets = [];
    boss = null;
    streak = 0;
    streakTimer = 0;

    if (wave % 5 === 0) {
      spawnBoss();
    } else {
      buildGrid();
    }

    updateHud();
  }

  function completeWave() {
    if (wave > 0) {
      const survival = wave * 50;
      addScore(survival, W * 0.5, 82, '#3fb950');
      spawnExplosion(W * 0.5, 95, 0.8, '#3fb950');
    }
    startWave();
  }

  function resetGame() {
    score = 0;
    lives = 3;
    wave = 0;
    running = false;
    paused = false;
    gameOver = false;
    elapsed = 0;
    streak = 0;
    streakTimer = 0;
    bullets = [];
    invBullets = [];
    invaders = [];
    boss = null;
    particles.length = 0;
    scoreTexts.length = 0;
    hitFlashes.length = 0;
    shakeTime = 0;
    shakeIntensity = 0;

    player = { x: W / 2, y: H - 50, w: SHIP_W, h: SHIP_H, speed: 320, moveDir: 1 };
    updateHud();
    draw();
  }

  function tryShoot() {
    if (shootCooldown > 0 || !running || paused || gameOver) return;

    bullets.push({
      x: player.x + player.w / 2 - 2,
      y: player.y - 2,
      w: 4,
      h: 12,
      vy: BULLET_SPD,
    });

    const dir = player.moveDir || 1;
    player.x = clamp(player.x - 8 * dir, 0, W - player.w);

    shootCooldown = SHOOT_RATE;
    playSfx('shoot');
  }

  function emitEnemyBulletsFromShooter(shooter) {
    const speed = 280 + wave * 14 + (wave >= 10 ? 60 : 0);
    invBullets.push({
      x: shooter.x + shooter.w / 2 - 2,
      y: shooter.y + shooter.h,
      w: 4,
      h: 12,
      vy: speed,
    });
  }

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97;
      p.vy *= 0.97;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = scoreTexts.length - 1; i >= 0; i--) {
      const s = scoreTexts[i];
      s.life -= dt;
      s.y -= 34 * dt;
      if (s.life <= 0) scoreTexts.splice(i, 1);
    }

    for (let i = hitFlashes.length - 1; i >= 0; i--) {
      const f = hitFlashes[i];
      f.life -= dt;
      if (f.life <= 0) hitFlashes.splice(i, 1);
    }

    if (shakeTime > 0) {
      shakeTime -= dt;
      shakeIntensity *= 0.9;
      if (shakeTime <= 0) {
        shakeTime = 0;
        shakeIntensity = 0;
      }
    }

    for (const s of stars) {
      s.y += s.spd * dt * (0.65 + wave * 0.03);
      if (s.y > H + 4) {
        s.y = -4;
        s.x = Math.random() * W;
      }
    }
  }

  function update(dt) {
    if (!running || paused || gameOver) {
      updateEffects(dt);
      return;
    }

    elapsed += dt;

    if (keys.ArrowLeft || keys.a) {
      player.moveDir = -1;
      player.x -= player.speed * dt;
    }
    if (keys.ArrowRight || keys.d) {
      player.moveDir = 1;
      player.x += player.speed * dt;
    }
    player.x = clamp(player.x, 0, W - player.w);

    if (shootCooldown > 0) shootCooldown -= dt;
    if (streakTimer > 0) {
      streakTimer -= dt;
      if (streakTimer <= 0) streak = 0;
    }

    for (const b of bullets) b.y -= b.vy * dt;
    bullets = bullets.filter((b) => b.y > -20);

    if (!boss && invaders.length) {
      const alive = invaders.filter((i) => i.alive);
      if (!alive.length) {
        completeWave();
        updateEffects(dt);
        return;
      }

      if (invDropping) {
        for (const i of alive) i.y += DROP_AMT;
        invDropping = false;
        invDir *= -1;
      } else {
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;

        for (const i of alive) {
          let drift = invSpeed * invDir * dt * ROW_SPEED[i.row];
          if (i.row === 1) {
            drift += Math.sin(elapsed * 3 + i.seed) * 5 * dt;
          } else if (i.row === 2) {
            drift += (Math.random() - 0.5) * (wave >= 7 ? 22 : 12) * dt;
          } else if (i.row === 3 && wave >= 7) {
            drift += Math.sin(elapsed * 7 + i.seed) * 8 * dt;
          }

          i.x += drift;
          minX = Math.min(minX, i.x);
          maxX = Math.max(maxX, i.x + i.w);
        }

        if (maxX >= W - 4 || minX <= 4) invDropping = true;
      }

      if (alive.some((i) => i.y + i.h >= H - 60)) {
        onGameOver();
        updateEffects(dt);
        return;
      }

      invShootTimer -= dt;
      if (invShootTimer <= 0) {
        invShootTimer = rand(invShootInterval * 0.65, invShootInterval * 1.35);

        const burst = Math.min(5, 1 + Math.floor(wave / 3) + (wave >= 10 ? 1 : 0));
        for (let n = 0; n < burst; n++) {
          const shooter = alive[Math.floor(Math.random() * alive.length)];
          if (!shooter) break;
          emitEnemyBulletsFromShooter(shooter);
        }
      }
    }

    if (boss) {
      boss.x += boss.speed * boss.dir * dt;
      if (boss.x <= 0) {
        boss.x = 0;
        boss.dir = 1;
      }
      if (boss.x + boss.w >= W) {
        boss.x = W - boss.w;
        boss.dir = -1;
      }

      invShootTimer -= dt;
      if (invShootTimer <= 0.15) boss.flashTimer = 0.15;
      if (boss.flashTimer > 0) boss.flashTimer -= dt;
      if (boss.hitTimer > 0) boss.hitTimer -= dt;
      boss.hpDisplay += (boss.hp - boss.hpDisplay) * Math.min(1, dt * 14);

      if (invShootTimer <= 0) {
        invShootTimer = rand(0.42, 0.64) * Math.max(0.55, 1 - wave * 0.025);

        const spread = wave >= 10 ? [-16, 0, 16] : [-8, 8];
        const speed = 320 + wave * 14;
        for (const sx of spread) {
          invBullets.push({
            x: boss.x + boss.w / 2 + sx,
            y: boss.y + boss.h,
            w: 4,
            h: 14,
            vy: speed,
          });
        }
      }
    }

    for (const b of invBullets) b.y += b.vy * dt;
    invBullets = invBullets.filter((b) => b.y < H + 20);

    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      let hit = false;

      for (const inv of invaders) {
        if (!inv.alive) continue;
        if (rectsOverlap(b.x, b.y, b.w, b.h, inv.x, inv.y, inv.w, inv.h)) {
          inv.alive = false;
          hit = true;
          streak += 1;
          streakTimer = 1.8;
          const pts = calcInvaderPoints(inv);
          addScore(pts, inv.x + inv.w * 0.5, inv.y, '#f7c948');
          spawnExplosion(inv.x + inv.w * 0.5, inv.y + inv.h * 0.5, 0.7, '#ff4fd1');
          playSfx('hit');
          break;
        }
      }

      if (boss && !hit && rectsOverlap(b.x, b.y, b.w, b.h, boss.x, boss.y, boss.w, boss.h)) {
        hit = true;
        boss.hp -= 1;
        boss.hitTimer = 0.12;
        addScore(20 * wave, boss.x + boss.w * 0.5, boss.y - 4, '#ff9b9b');
        spawnExplosion(b.x, b.y, 0.5, '#ff8888');
        screenShake(3, 0.12);
        playSfx('hit');

        if (boss.hp <= 0) {
          addScore(500 * wave, boss.x + boss.w * 0.5, boss.y - 16, '#ff4fd1');
          spawnExplosion(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5, 1.9, '#ff4444');
          screenShake(10, 0.35);
          playSfx('explosion');
          boss = null;
          completeWave();
        }
      }

      if (hit) bullets.splice(bi, 1);
    }

    for (let bi = invBullets.length - 1; bi >= 0; bi--) {
      const b = invBullets[bi];
      if (rectsOverlap(b.x, b.y, b.w, b.h, player.x, player.y, player.w, player.h)) {
        invBullets.splice(bi, 1);
        lives -= 1;
        triggerHudFx(livesEl, 'flash', 220);
        updateHud();
        spawnExplosion(player.x + player.w * 0.5, player.y + player.h * 0.4, 1.2, '#ff4444');
        screenShake(7, 0.24);
        playSfx('explosion');
        streak = 0;
        streakTimer = 0;

        if (lives <= 0) {
          onGameOver();
          updateEffects(dt);
          return;
        }
      }
    }

    updateEffects(dt);
  }

  function drawShip(x, y, w, h) {
    ctx.fillStyle = '#2ec5ff';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(x + w / 2 - 4, y + h - 8, 8, 8);
  }

  function drawInvader(x, y, w, h, row) {
    const colors = ['#ff4fd1', '#bc8cff', '#3fb950', '#f7c948'];
    ctx.fillStyle = colors[row % colors.length];
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x + 8, y + 8, 6, 6);
    ctx.fillRect(x + w - 14, y + 8, 6, 6);
  }

  function drawBoss(b) {
    const isShootingFlash = b.flashTimer > 0;
    const isHitFlash = b.hitTimer > 0;

    ctx.fillStyle = isHitFlash ? '#ffd3d3' : isShootingFlash ? '#ff2f2f' : '#ff4444';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = isHitFlash ? '#ffe8e8' : '#ff8888';
    ctx.fillRect(b.x + 10, b.y + 8, 20, 12);
    ctx.fillRect(b.x + b.w - 30, b.y + 8, 20, 12);

    ctx.fillStyle = '#333';
    ctx.fillRect(b.x, b.y - 10, b.w, 6);
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(b.x, b.y - 10, b.w * clamp(b.hpDisplay / b.maxHp, 0, 1), 6);
  }

  function drawBackground() {
    const glow = 8 + Math.sin(elapsed * 0.8) * 3;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#090c16');
    bg.addColorStop(1, '#060912');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
      const alpha = 0.2 + s.z * 0.6;
      const r = 0.8 + s.z * 1.4;
      ctx.fillStyle = `rgba(90,170,255,${alpha})`;
      ctx.fillRect(s.x, s.y, r, r);
    }

    ctx.strokeStyle = 'rgba(63,185,80,0.06)';
    ctx.lineWidth = 1;
    const yOffset = (elapsed * 18) % 40;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin((elapsed + x) * 0.01) * 2, 0);
      ctx.lineTo(x + Math.sin((elapsed + x) * 0.01) * 2, H);
      ctx.stroke();
    }
    for (let y = -40; y < H + 40; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y + yOffset);
      ctx.lineTo(W, y + yOffset);
      ctx.stroke();
    }

    ctx.shadowBlur = glow;
    ctx.shadowColor = 'rgba(63,185,80,0.2)';
    ctx.strokeStyle = 'rgba(63,185,80,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H - 30);
    ctx.lineTo(W, H - 30);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawEffects() {
    for (const f of hitFlashes) {
      const a = f.life / f.maxLife;
      ctx.fillStyle = `rgba(255,255,255,${a * 0.35})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1 + (1 - a) * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.globalAlpha = 1;
    }

    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    for (const s of scoreTexts) {
      const a = clamp(s.life / s.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x, s.y);
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    ctx.save();

    if (shakeTime > 0 && shakeIntensity > 0) {
      const dx = (Math.random() * 2 - 1) * shakeIntensity;
      const dy = (Math.random() * 2 - 1) * shakeIntensity;
      ctx.translate(dx, dy);
    }

    drawBackground();

    if (!running && !gameOver) {
      drawEffects();
      ctx.fillStyle = '#3fb950';
      ctx.font = 'bold 28px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Press Start', W / 2, H / 2);
      ctx.restore();
      return;
    }

    if (paused) {
      ctx.fillStyle = '#f7c948';
      ctx.font = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W / 2, H / 2);
    }

    if (gameOver) {
      drawEffects();
      ctx.fillStyle = '#ff4fd1';
      ctx.font = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 20);
      ctx.fillStyle = '#f7c948';
      ctx.font = 'bold 20px system-ui';
      ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 20);
      ctx.fillStyle = '#8b949e';
      ctx.font = '16px system-ui';
      ctx.fillText('Press Start to play again', W / 2, H / 2 + 55);
      ctx.restore();
      return;
    }

    drawShip(player.x, player.y, player.w, player.h);

    for (const i of invaders) {
      if (i.alive) drawInvader(i.x, i.y, i.w, i.h, i.row);
    }

    if (boss) drawBoss(boss);

    ctx.fillStyle = '#2ec5ff';
    for (const b of bullets) ctx.fillRect(b.x, b.y, b.w, b.h);

    ctx.fillStyle = '#ff4fd1';
    for (const b of invBullets) ctx.fillRect(b.x, b.y, b.w, b.h);

    drawEffects();

    ctx.fillStyle = '#2ec5ff';
    ctx.font = '16px system-ui';
    ctx.textAlign = 'left';
    for (let i = 0; i < lives; i++) {
      ctx.fillText('▲', 14 + i * 22, H - 8);
    }

    ctx.restore();
  }

  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

  async function onGameOver() {
    running = false;
    gameOver = true;
    setBestMaybe();
    updateHud();
    try {
      await submitScore(ArcadeSync.getPlayer(), score, GAME_ID);
    } catch (e) {}
    draw();
    if (window.showGameOverModal) window.showGameOverModal(score);
  }

  function init() {
    best = ArcadeSync.getHighScore(GAME_ID);
    updateHud();
    draw();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');

    if (startBtn) startBtn.onclick = () => start();
    if (pauseBtn) pauseBtn.onclick = () => (paused ? resume() : pause());
    if (resetBtn) resetBtn.onclick = () => reset();
  }

  function start() {
    resetGame();
    running = true;
    paused = false;
    gameOver = false;
    startWave();
    lastTime = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function pause() {
    if (running && !gameOver) paused = true;
  }

  function resume() {
    if (running && paused && !gameOver) paused = false;
  }

  function reset() {
    if (raf) cancelAnimationFrame(raf);
    resetGame();
    lastTime = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);

    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    if (startBtn) startBtn.onclick = null;
    if (pauseBtn) pauseBtn.onclick = null;
    if (resetBtn) resetBtn.onclick = null;
  }

  function getScore() {
    return score;
  }

  return { init, start, pause, resume, reset, destroy, getScore };
}
