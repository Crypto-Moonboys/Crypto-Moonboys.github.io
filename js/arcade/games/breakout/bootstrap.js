/**
 * bootstrap.js — Breakout Bullrun game module
 */

import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { BREAKOUT_CONFIG } from './config.js';
import { GameRegistry } from '/js/arcade/core/game-registry.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';

GameRegistry.register(BREAKOUT_CONFIG.id, {
  label: BREAKOUT_CONFIG.label,
  bootstrap: bootstrapBreakout,
});

export function bootstrapBreakout(root) {
  const GAME_ID = BREAKOUT_CONFIG.id;
  const canvas = document.getElementById('brkCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const levelEl = document.getElementById('level');
  const comboEl = document.getElementById('combo');
  const scoreStatEl = scoreEl ? scoreEl.closest('.stat') : null;
  const levelStatEl = levelEl ? levelEl.closest('.stat') : null;
  const comboStatEl = comboEl ? comboEl.closest('.stat') : null;

  const B_COLS = 10;
  const B_ROWS = 6;
  const B_W = 48;
  const B_H = 18;
  const B_PAD = 4;
  const B_OFF_X = (W - (B_COLS * (B_W + B_PAD) - B_PAD)) / 2;
  const B_OFF_Y = 52;

  const ROW_CONFIG = [
    { value: 50, color: '#ff4fd1', hits: 3 },
    { value: 42, color: '#bc8cff', hits: 2 },
    { value: 34, color: '#2ec5ff', hits: 2 },
    { value: 24, color: '#3fb950', hits: 1 },
    { value: 18, color: '#f7c948', hits: 1 },
    { value: 12, color: '#8b949e', hits: 1 },
  ];

  const PAD_H = 12;
  const PAD_BASE_W = 88;
  const BASE_BALL_SPD = 320;
  const BALL_R = 7;
  const MAX_PARTICLES = 420;
  const MAX_FLOATING = 90;
  const MAX_TRAIL = 12;
  const GLYPH_POOL = ['0', '1', '#', '$', 'B', 'M', 'X', 'C'];
  const PADDLE_MAX_WIDTH_MULTIPLIER = 1.95;
  const PADDLE_BUFF_INCREMENT = 30;
  const SLOW_MOTION_SPEED_FACTOR = 0.72;
  const STREAK_BONUS_MULTIPLIER = 16;
  const LEVEL_CLEAR_BASE_BONUS = 420;
  const LEVEL_CLEAR_COMBO_BONUS = 28;
  const DROP_COLLISION_RADIUS = 11;
  const IDENTITY_GLOBAL_KEY = 'MOONBOYS_IDENTITY';

  let score = 0;
  let level = 1;
  let combo = 1;
  let comboTimer = 0;
  let running = false;
  let paused = false;
  let gameOver = false;
  let submittedRunScore = false;
  let best = ArcadeSync.getHighScore(GAME_ID);
  let raf = null;
  let lastTime = 0;
  let elapsed = 0;

  let balls = [];
  let launched = false;
  let bricks = [];
  let drops = [];
  let particles = [];
  let floatingTexts = [];
  let hitFlashes = [];

  const paddle = {
    x: W / 2,
    w: PAD_BASE_W,
    speed: 460,
    recoil: 0,
    glow: 0,
    hitFlash: 0,
  };

  const effects = {
    shakeTime: 0,
    shakeIntensity: 0,
    levelFlash: 0,
    comboPulse: 0,
    glitchTimer: 0,
    glitchCooldown: 1.5,
    scorePulse: 0,
    slowMotionTimer: 0,
    paddleBuffTimer: 0,
  };

  const keys = {};

  const glyphs = Array.from({ length: 32 }).map((_, i) => ({
    x: ((i + 0.5) / 32) * W,
    y: Math.random() * H,
    speed: 18 + Math.random() * 32,
    alpha: 0.05 + Math.random() * 0.08,
    char: GLYPH_POOL[Math.floor(Math.random() * GLYPH_POOL.length)],
    size: 10 + Math.random() * 10,
  }));

  function triggerHudFx(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  function playHook(name) {
    if (isMuted()) return;
    const specs = {
      hit: { kind: 'tone', type: 'square', freqStart: 520, freqEnd: 360, duration: 0.04, volume: 0.024 },
      break: { kind: 'tone', type: 'sawtooth', freqStart: 380, freqEnd: 190, duration: 0.08, volume: 0.028 },
      combo: { kind: 'tone', type: 'triangle', freqStart: 700, freqEnd: 980, duration: 0.08, volume: 0.03 },
      level_up: { kind: 'tone', type: 'sine', freqStart: 420, freqEnd: 940, duration: 0.14, volume: 0.032 },
      pickup: { kind: 'tone', type: 'square', freqStart: 640, freqEnd: 780, duration: 0.06, volume: 0.028 },
      launch: { kind: 'tone', type: 'triangle', freqStart: 280, freqEnd: 620, duration: 0.08, volume: 0.024 },
    };
    playSound(name, specs[name] || specs.hit);
  }

  function makeBall(x, y, vx = 0, vy = 0) {
    return { x, y, vx, vy, r: BALL_R, trail: [] };
  }

  function resetBallStack() {
    balls = [makeBall(W / 2, H - 60, 0, 0)];
    launched = false;
    paddle.x = W / 2;
  }

  function applyLevelRulesToBrick(row, col, cfg) {
    const bossWall = level % 5 === 0;
    const hpBoost = Math.floor((level - 1) / 2);
    const sideBoost = level >= 4 && (col === 0 || col === B_COLS - 1) ? 1 : 0;
    const bossBoost = bossWall ? (row < 2 ? 4 : 2) : 0;
    const hits = Math.max(1, cfg.hits + hpBoost + sideBoost + bossBoost);
    const value = Math.floor(cfg.value * (1 + (level - 1) * 0.18) + hits * 5);
    return { hits, value, bossWall };
  }

  function buildBricks() {
    bricks = [];
    for (let r = 0; r < B_ROWS; r++) {
      const cfg = ROW_CONFIG[r];
      for (let c = 0; c < B_COLS; c++) {
        const tuned = applyLevelRulesToBrick(r, c, cfg);
        const bx = B_OFF_X + c * (B_W + B_PAD);
        const by = B_OFF_Y + r * (B_H + B_PAD);
        bricks.push({
          baseX: bx,
          baseY: by,
          x: bx,
          y: by,
          w: B_W,
          h: B_H,
          alive: true,
          value: tuned.value,
          color: cfg.color,
          hits: tuned.hits,
          maxHits: tuned.hits,
          row: r,
          col: c,
          movePhase: Math.random() * Math.PI * 2,
          flicker: 0,
          bossWall: tuned.bossWall,
        });
      }
    }
  }

  function launchBall() {
    if (launched || !balls.length) return;
    const spd = BASE_BALL_SPD + (level - 1) * 26;
    const main = balls[0];
    main.vx = (Math.random() * 0.62 + 0.69) * spd * (Math.random() < 0.5 ? 1 : -1);
    main.vy = -Math.sqrt(Math.max(120, spd * spd - main.vx * main.vx));
    launched = true;
    playHook('launch');
  }

  function setBestMaybe() {
    if (score > best) {
      best = score;
      ArcadeSync.setHighScore(GAME_ID, best);
    }
  }

  function addFloatingText(text, x, y, color = '#f7c948', scale = 1) {
    floatingTexts.push({ text, x, y, color, life: 0.8, maxLife: 0.8, scale });
    if (floatingTexts.length > MAX_FLOATING) floatingTexts.splice(0, floatingTexts.length - MAX_FLOATING);
  }

  function addShake(intensity, duration) {
    effects.shakeIntensity = Math.max(effects.shakeIntensity, intensity);
    effects.shakeTime = Math.max(effects.shakeTime, duration);
  }

  function spawnParticleBurst(x, y, color, count, spread = 120, size = 3.5) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 50 + Math.random() * spread;
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.18 + Math.random() * 0.48,
        maxLife: 0.65,
        size: Math.random() * size + 1.2,
        color,
      });
    }
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  }

  function spawnHitFlash(x, y, r, color = '#ffffff') {
    hitFlashes.push({ x, y, r, life: 0.14, maxLife: 0.14, color });
  }

  function addScore(points, x, y, color = '#f7c948') {
    if (!Number.isFinite(points) || points <= 0) return;
    score += Math.floor(points);
    setBestMaybe();
    updateHud();
    effects.scorePulse = 0.22;
    triggerHudFx(scoreStatEl, 'pulse', 180);
    if (typeof x === 'number' && typeof y === 'number') {
      addFloatingText(`+${Math.floor(points)}`, x, y, color, 1);
    }
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = String(Math.floor(score));
    if (bestEl) bestEl.textContent = String(Math.floor(best));
    if (levelEl) levelEl.textContent = String(level || '—');
    if (comboEl) comboEl.textContent = `×${combo}`;
  }

  function resetGame() {
    score = 0;
    level = 1;
    combo = 1;
    comboTimer = 0;
    running = false;
    paused = false;
    gameOver = false;
    submittedRunScore = false;

    drops = [];
    particles = [];
    floatingTexts = [];
    hitFlashes = [];

    effects.shakeTime = 0;
    effects.shakeIntensity = 0;
    effects.levelFlash = 0;
    effects.comboPulse = 0;
    effects.glitchTimer = 0;
    effects.glitchCooldown = 1.2;
    effects.scorePulse = 0;
    effects.slowMotionTimer = 0;
    effects.paddleBuffTimer = 0;

    paddle.w = PAD_BASE_W;
    paddle.recoil = 0;
    paddle.glow = 0;
    paddle.hitFlash = 0;

    buildBricks();
    resetBallStack();
    updateHud();
    draw();
  }

  function onKeyDown(e) {
    keys[e.key] = true;
    if (e.key === ' ' && running && !paused) {
      e.preventDefault();
      if (!launched) launchBall();
    }
    if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) e.preventDefault();
  }

  function onKeyUp(e) {
    keys[e.key] = false;
  }

  function spawnDrop(x, y) {
    const roll = Math.random();
    let type = 'score';
    if (roll < 0.25) type = 'wide';
    else if (roll < 0.46) type = 'slow';
    else if (roll < 0.62) type = 'multiball';
    else if (roll < 0.8) type = 'combo';
    drops.push({ x, y, vy: 100 + Math.random() * 60, type, spin: Math.random() * Math.PI * 2, life: 10 });
  }

  function splitMultiball() {
    const additions = [];
    for (const b of balls) {
      const speed = Math.max(260, Math.hypot(b.vx, b.vy));
      const angle = Math.atan2(b.vy, b.vx);
      const spread = 0.42;
      additions.push(makeBall(b.x, b.y, Math.cos(angle + spread) * speed, Math.sin(angle + spread) * speed));
      additions.push(makeBall(b.x, b.y, Math.cos(angle - spread) * speed, Math.sin(angle - spread) * speed));
      if (additions.length + balls.length >= 4) break;
    }
    balls = balls.concat(additions).slice(0, 4);
    launched = balls.some((b) => Math.abs(b.vx) + Math.abs(b.vy) > 0);
  }

  function isIdentityLinked() {
    const identity = window[IDENTITY_GLOBAL_KEY];
    return !!(
      identity &&
      typeof identity.isTelegramLinked === 'function' &&
      identity.isTelegramLinked()
    );
  }

  function isBallPaddleCollision(ball, py) {
    return (
      ball.vy > 0 &&
      ball.y + ball.r >= py &&
      ball.y - ball.r <= py + PAD_H &&
      ball.x >= paddle.x - paddle.w / 2 - ball.r &&
      ball.x <= paddle.x + paddle.w / 2 + ball.r
    );
  }

  function isBallBrickCollision(ball, brick) {
    return (
      ball.x + ball.r > brick.x &&
      ball.x - ball.r < brick.x + brick.w &&
      ball.y + ball.r > brick.y &&
      ball.y - ball.r < brick.y + brick.h
    );
  }

  function handleDropPickup(drop) {
    const pickupScore = 80 + level * 20;
    addScore(pickupScore, drop.x, drop.y, '#dff8ff');
    playHook('pickup');
    spawnParticleBurst(drop.x, drop.y, '#dff8ff', 8, 90, 2.5);

    if (drop.type === 'wide') {
      effects.paddleBuffTimer = Math.max(effects.paddleBuffTimer, 10);
      paddle.w = Math.min(PAD_BASE_W * PADDLE_MAX_WIDTH_MULTIPLIER, paddle.w + PADDLE_BUFF_INCREMENT);
      addFloatingText('WIDE', drop.x, drop.y - 10, '#3fb950', 1.05);
    } else if (drop.type === 'slow') {
      effects.slowMotionTimer = Math.max(effects.slowMotionTimer, 6);
      addFloatingText('SLOW', drop.x, drop.y - 10, '#2ec5ff', 1.05);
    } else if (drop.type === 'multiball') {
      splitMultiball();
      addFloatingText('MULTIBALL', drop.x, drop.y - 10, '#bc8cff', 1.05);
    } else if (drop.type === 'combo') {
      combo = Math.min(12, combo + 1);
      comboTimer = Math.max(comboTimer, 4.5);
      effects.comboPulse = 0.35;
      triggerHudFx(comboStatEl, 'pulse', 220);
      addFloatingText('COMBO+', drop.x, drop.y - 10, '#ff4fd1', 1.05);
      playHook('combo');
    } else {
      const bonus = 260 + level * 80;
      addScore(bonus, drop.x, drop.y - 12, '#f7c948');
      addFloatingText('SCORE', drop.x, drop.y - 24, '#f7c948', 1.05);
    }
  }

  function applyBrickMovement(dt) {
    const moving = level >= 3;
    if (!moving) {
      for (const b of bricks) {
        b.x = b.baseX;
        b.y = b.baseY;
      }
      return;
    }
    const amp = Math.min(8, 2 + level * 0.6);
    const speed = 0.9 + level * 0.07;
    for (const b of bricks) {
      const rowOffset = b.row % 2 ? 1 : -1;
      b.x = b.baseX + Math.sin(elapsed * speed + b.movePhase) * amp * rowOffset;
      b.y = b.baseY + Math.cos(elapsed * (speed * 0.45) + b.movePhase) * 1.2;
    }
  }

  function resolveBallPaddle(ball) {
    const py = H - 40 - paddle.recoil;
    if (isBallPaddleCollision(ball, py)) {
      ball.vy = -Math.abs(ball.vy);
      ball.y = py - ball.r;
      const off = (ball.x - paddle.x) / (paddle.w / 2);
      ball.vx = off * Math.max(180, Math.abs(ball.vy) * 1.05);

      const baseMax = BASE_BALL_SPD + (level - 1) * 28 + 210;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > baseMax) {
        const s = baseMax / speed;
        ball.vx *= s;
        ball.vy *= s;
      }

      paddle.recoil = Math.min(6, paddle.recoil + 4.5);
      paddle.hitFlash = 0.18;
      spawnParticleBurst(ball.x, py + PAD_H / 2, '#f7ab1a', 5, 80, 2.3);
      if (Math.abs(off) > 0.82) spawnParticleBurst(ball.x, py + PAD_H / 2, '#ffffff', 4, 70, 2.2);
    }
  }

  function brickCollision(ball) {
    for (const b of bricks) {
      if (!b.alive) continue;
      if (isBallBrickCollision(ball, b)) {
        const overlapL = ball.x + ball.r - b.x;
        const overlapR = b.x + b.w - (ball.x - ball.r);
        const overlapT = ball.y + ball.r - b.y;
        const overlapB = b.y + b.h - (ball.y - ball.r);
        const minH = Math.min(overlapL, overlapR);
        const minV = Math.min(overlapT, overlapB);
        if (minH < minV) ball.vx = -ball.vx;
        else ball.vy = -ball.vy;

        b.hits -= 1;
        b.flicker = 0.14;
        playHook('hit');
        spawnHitFlash(ball.x, ball.y, 12, '#ffffff');
        addShake(1.8, 0.06);

        if (b.hits <= 0) {
          b.alive = false;
          combo = Math.min(14, combo + 1);
          comboTimer = 3.2;
          effects.comboPulse = 0.25;
          triggerHudFx(comboStatEl, 'pulse', 200);

          const points = b.value * combo;
          addScore(points, b.x + b.w / 2, b.y + b.h / 2, '#f7c948');

          if (combo >= 3 && combo % 4 === 0) {
            const streakBonus = combo * level * STREAK_BONUS_MULTIPLIER;
            addScore(streakBonus, b.x + b.w / 2, b.y - 6, '#ff4fd1');
            addFloatingText('STREAK!', b.x + b.w / 2, b.y - 20, '#ff4fd1', 1.08);
            playHook('combo');
          }

          playHook('break');
          spawnParticleBurst(b.x + b.w / 2, b.y + b.h / 2, b.color, 14, 160, 3.8);
          spawnParticleBurst(b.x + b.w / 2, b.y + b.h / 2, '#ffffff', 6, 120, 2.7);
          addShake(3.2, 0.08);

          if (Math.random() < 0.2) spawnDrop(b.x + b.w / 2, b.y + b.h / 2);
        }

        updateHud();
        break;
      }
    }
  }

  function updateDrops(dt) {
    const py = H - 40 - paddle.recoil;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.y += d.vy * dt;
      d.spin += dt * 8;
      d.life -= dt;
      if (d.y > H + 20 || d.life <= 0) {
        drops.splice(i, 1);
        continue;
      }
      if (d.y + DROP_COLLISION_RADIUS >= py && d.y - DROP_COLLISION_RADIUS <= py + PAD_H && d.x >= paddle.x - paddle.w / 2 && d.x <= paddle.x + paddle.w / 2) {
        handleDropPickup(d);
        drops.splice(i, 1);
      }
    }
  }

  function levelComplete() {
    const levelBonus = level * LEVEL_CLEAR_BASE_BONUS + combo * LEVEL_CLEAR_COMBO_BONUS;
    addScore(levelBonus, W / 2, H * 0.32, '#bc8cff');
    addFloatingText(`LEVEL CLEAR +${Math.floor(levelBonus)}`, W / 2, H * 0.28, '#bc8cff', 1.12);

    level += 1;
    combo = 1;
    comboTimer = 0;
    effects.levelFlash = 0.45;
    triggerHudFx(levelStatEl, 'pulse', 260);
    playHook('level_up');

    buildBricks();
    resetBallStack();
    updateHud();
  }

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const t = floatingTexts[i];
      t.life -= dt;
      t.y -= 28 * dt;
      if (t.life <= 0) floatingTexts.splice(i, 1);
    }

    for (let i = hitFlashes.length - 1; i >= 0; i--) {
      const f = hitFlashes[i];
      f.life -= dt;
      if (f.life <= 0) hitFlashes.splice(i, 1);
    }

    if (effects.shakeTime > 0) {
      effects.shakeTime -= dt;
      effects.shakeIntensity *= 0.9;
      if (effects.shakeTime <= 0) {
        effects.shakeTime = 0;
        effects.shakeIntensity = 0;
      }
    }

    effects.levelFlash = Math.max(0, effects.levelFlash - dt);
    effects.comboPulse = Math.max(0, effects.comboPulse - dt);
    effects.scorePulse = Math.max(0, effects.scorePulse - dt);
    paddle.hitFlash = Math.max(0, paddle.hitFlash - dt);
    paddle.recoil = Math.max(0, paddle.recoil - dt * 30);
    if (effects.paddleBuffTimer > 0) effects.paddleBuffTimer -= dt;
    if (effects.slowMotionTimer > 0) effects.slowMotionTimer -= dt;

    if (effects.glitchTimer > 0) effects.glitchTimer -= dt;
    if (effects.glitchCooldown > 0) effects.glitchCooldown -= dt;
    if (effects.glitchCooldown <= 0 && Math.random() < 0.0025) {
      effects.glitchTimer = 0.08;
      effects.glitchCooldown = 4 + Math.random() * 5;
    }

    for (const g of glyphs) {
      g.y += g.speed * dt;
      if (g.y > H + 20) {
        g.y = -8;
        g.char = GLYPH_POOL[Math.floor(Math.random() * GLYPH_POOL.length)];
      }
    }

    if (effects.paddleBuffTimer <= 0 && paddle.w > PAD_BASE_W) {
      paddle.w = Math.max(PAD_BASE_W, paddle.w - 20 * dt);
    }

    paddle.glow = Math.min(1, combo / 8);
  }

  function update(dt) {
    updateEffects(dt);
    if (!running || paused || gameOver) return;

    const simDt = effects.slowMotionTimer > 0 ? dt * SLOW_MOTION_SPEED_FACTOR : dt;
    elapsed += dt;

    if (comboTimer > 0) {
      comboTimer -= simDt;
      if (comboTimer <= 0) {
        combo = 1;
        comboTimer = 0;
        updateHud();
      }
    }

    if (keys.ArrowLeft || keys.a) paddle.x -= paddle.speed * simDt;
    if (keys.ArrowRight || keys.d) paddle.x += paddle.speed * simDt;
    paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.x));

    applyBrickMovement(simDt);

    if (!launched) {
      for (const b of balls) {
        b.x = paddle.x;
        b.y = H - 50;
      }
      return;
    }

    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      ball.trail.push({ x: ball.x, y: ball.y, life: 0.22, maxLife: 0.22 });
      if (ball.trail.length > MAX_TRAIL) ball.trail.shift();
      for (let t = ball.trail.length - 1; t >= 0; t--) {
        ball.trail[t].life -= simDt;
        if (ball.trail[t].life <= 0) ball.trail.splice(t, 1);
      }

      ball.x += ball.vx * simDt;
      ball.y += ball.vy * simDt;

      if (ball.x - ball.r < 0) {
        ball.x = ball.r;
        ball.vx = Math.abs(ball.vx);
      }
      if (ball.x + ball.r > W) {
        ball.x = W - ball.r;
        ball.vx = -Math.abs(ball.vx);
      }
      if (ball.y - ball.r < 0) {
        ball.y = ball.r;
        ball.vy = Math.abs(ball.vy);
      }

      resolveBallPaddle(ball);
      brickCollision(ball);

      if (ball.y > H + 24) balls.splice(i, 1);
    }

    if (!balls.length) {
      onGameOver();
      return;
    }

    updateDrops(simDt);

    if (bricks.every((b) => !b.alive)) {
      levelComplete();
    }
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0d1a');
    g.addColorStop(1, '#070914');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 0.14;
    for (const glyph of glyphs) {
      ctx.fillStyle = '#9ad0ff';
      ctx.font = `${glyph.size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillText(glyph.char, glyph.x, glyph.y);
    }
    ctx.globalAlpha = 1;

    if (effects.glitchTimer > 0) {
      ctx.globalAlpha = 0.1 + Math.random() * 0.08;
      ctx.fillStyle = Math.random() < 0.5 ? '#ff4fd1' : '#2ec5ff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  function drawBricks() {
    for (const b of bricks) {
      if (!b.alive) continue;
      const pulse = Math.sin(elapsed * 2.2 + b.movePhase) * 0.06;
      const damageFactor = b.hits / b.maxHits;
      const alpha = Math.max(0.3, Math.min(1, 0.58 + pulse + damageFactor * 0.42));

      ctx.globalAlpha = alpha;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      ctx.globalAlpha = 1;

      if (b.row % 2 === 0) {
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, Math.max(2, Math.floor(b.h * 0.18)));
        ctx.globalAlpha = 1;
      }

      if (b.maxHits > 1 && b.hits < b.maxHits) {
        const hpRatio = Math.max(0, b.hits / b.maxHits);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.13 + (1 - hpRatio) * 0.18;
        ctx.fillRect(b.x + 2, b.y + b.h - 4, (b.w - 4) * hpRatio, 2);
        ctx.globalAlpha = 1;
      }

      if (b.flicker > 0) {
        ctx.globalAlpha = Math.min(0.4, b.flicker * 2.3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.globalAlpha = 1;
        b.flicker = Math.max(0, b.flicker - 0.03);
      }

      ctx.strokeStyle = b.bossWall ? '#ffd9ff' : b.color;
      ctx.lineWidth = b.bossWall ? 1.6 : 1;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    }
  }

  function drawDrops() {
    for (const d of drops) {
      const map = {
        wide: { c: '#3fb950', t: 'W' },
        slow: { c: '#2ec5ff', t: 'S' },
        multiball: { c: '#bc8cff', t: 'M' },
        score: { c: '#f7c948', t: '$' },
        combo: { c: '#ff4fd1', t: 'C' },
      };
      const m = map[d.type] || map.score;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.spin);

      ctx.globalAlpha = 0.25;
      ctx.fillStyle = m.c;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.fillStyle = m.c;
      ctx.fillRect(-8, -6, 16, 12);
      ctx.fillStyle = '#070914';
      ctx.font = 'bold 8px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.t, 0, 0);
      ctx.restore();
    }
    ctx.textBaseline = 'alphabetic';
  }

  function drawPaddle() {
    const py = H - 40 - paddle.recoil;
    const px = paddle.x - paddle.w / 2;

    const glowAlpha = Math.min(0.36, 0.08 + paddle.glow * 0.24 + paddle.hitFlash * 0.3);
    ctx.globalAlpha = glowAlpha;
    ctx.fillStyle = combo >= 4 ? '#ff4fd1' : '#f7ab1a';
    ctx.fillRect(px - 8, py - 8, paddle.w + 16, PAD_H + 16);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#f7ab1a';
    ctx.fillRect(px, py, paddle.w, PAD_H);

    if (paddle.hitFlash > 0) {
      ctx.globalAlpha = paddle.hitFlash * 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px, py, paddle.w, PAD_H);
      ctx.globalAlpha = 1;
    }
  }

  function drawBalls() {
    for (const b of balls) {
      const speed = Math.hypot(b.vx, b.vy);
      const highCombo = combo >= 3;

      for (const tr of b.trail) {
        const a = Math.max(0, tr.life / tr.maxLife);
        ctx.globalAlpha = a * (highCombo ? 0.26 : 0.16);
        ctx.fillStyle = highCombo ? '#ff9cf1' : '#84d8ff';
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, BALL_R * (0.4 + a * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (speed > 470) {
        const split = Math.min(2.4, (speed - 470) * 0.01);
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#ff4fd1';
        ctx.beginPath();
        ctx.arc(b.x - split, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2ec5ff';
        ctx.beginPath();
        ctx.arc(b.x + split, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (highCombo || speed > 420) {
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = combo >= 5 ? '#ff4fd1' : '#2ec5ff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = '#2ec5ff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dff8ff';
      ctx.beginPath();
      ctx.arc(b.x - 2, b.y - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFx() {
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    for (const f of hitFlashes) {
      const alpha = Math.max(0, f.life / f.maxLife);
      ctx.globalAlpha = alpha * 0.42;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1 + (1 - alpha) * 0.55), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const t of floatingTexts) {
      const alpha = Math.max(0, t.life / t.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = t.color;
      ctx.font = `bold ${Math.floor(15 * t.scale)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    if (combo >= 3) {
      const pulse = 1 + Math.sin(elapsed * 10) * Math.min(0.11, effects.comboPulse * 0.3 + combo * 0.004);
      ctx.fillStyle = '#ff4fd1';
      ctx.font = `bold ${Math.floor(18 * pulse)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(`COMBO ×${combo}`, W / 2, H - 78);
    }

    if (combo >= 6) {
      ctx.globalAlpha = Math.min(0.11, 0.02 + (combo - 5) * 0.012);
      ctx.fillStyle = '#ff4fd1';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    if (effects.levelFlash > 0) {
      ctx.globalAlpha = Math.min(0.33, effects.levelFlash * 0.8);
      ctx.fillStyle = '#bc8cff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`LEVEL ${level}`, W / 2, H * 0.45);
    }
  }

  function drawOverlays() {
    if (!running && !gameOver) {
      ctx.fillStyle = '#f7ab1a';
      ctx.font = 'bold 28px system-ui';
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
      ctx.font = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 20);
      ctx.fillStyle = '#f7c948';
      ctx.font = 'bold 20px system-ui';
      ctx.fillText(`Score: ${Math.floor(score)}`, W / 2, H / 2 + 18);
      ctx.fillStyle = '#8b949e';
      ctx.font = '14px system-ui';
      ctx.fillText('Press Start to play again', W / 2, H / 2 + 50);
    }
  }

  function draw() {
    const shakeX = effects.shakeTime > 0 ? (Math.random() - 0.5) * effects.shakeIntensity : 0;
    const shakeY = effects.shakeTime > 0 ? (Math.random() - 0.5) * effects.shakeIntensity : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawBackground();
    drawBricks();
    drawDrops();
    drawPaddle();
    drawBalls();
    drawFx();
    drawOverlays();

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
    if (gameOver) return;
    running = false;
    gameOver = true;
    stopAllSounds();
    setBestMaybe();
    updateHud();

    if (!submittedRunScore) {
      submittedRunScore = true;
      if (isIdentityLinked()) {
        try {
          await submitScore(ArcadeSync.getPlayer(), Math.floor(score), GAME_ID);
        } catch (_) {}
      }
    }

    draw();
    if (window.showGameOverModal) window.showGameOverModal(Math.floor(score));
  }

  function init() {
    best = ArcadeSync.getHighScore(GAME_ID);
    buildBricks();
    resetBallStack();
    updateHud();
    draw();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');

    if (startBtn) {
      startBtn.onclick = () => {
        resetGame();
        running = true;
        launched = false;
        lastTime = performance.now();
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      };
    }

    if (pauseBtn) {
      pauseBtn.onclick = () => {
        if (running) {
          paused = !paused;
          if (paused) stopAllSounds();
        }
      };
    }

    if (resetBtn) {
      resetBtn.onclick = () => {
        if (raf) cancelAnimationFrame(raf);
        stopAllSounds();
        resetGame();
        raf = requestAnimationFrame(() => draw());
      };
    }
  }

  function start() {
    resetGame();
    running = true;
    launched = false;
    lastTime = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function pause() {
    if (running) {
      paused = true;
      stopAllSounds();
    }
  }

  function resume() {
    if (running && paused) paused = false;
  }

  function reset() {
    if (raf) cancelAnimationFrame(raf);
    stopAllSounds();
    resetGame();
    raf = requestAnimationFrame(() => draw());
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    stopAllSounds();

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
    return Math.floor(score);
  }

  return { init, start, pause, resume, reset, destroy, getScore };
}
