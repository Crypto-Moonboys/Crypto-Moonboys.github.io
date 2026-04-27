/**
 * bootstrap.js — Invaders 3008 orchestrator.
 *
 * Wires together invader-system, powerup-system, and render-system.
 * Contains only: game state, game loop, input, scoring, wave management,
 * and lifecycle (init / start / pause / resume / reset / destroy).
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
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';
import { BaseGame } from '/js/arcade/engine/BaseGame.js';

import {
  ROWS, COLS, INV_W, INV_H, INV_PAD,
  WAVE_BOSS, WAVE_FAST_ENEMIES, WAVE_ZIGZAG, WAVE_AGGRESSIVE,
  INVADER_SPEED_BASE, INVADER_SPEED_PER_WAVE,
  INVADER_SPEED_FAST_BONUS, INVADER_SPEED_ZIGZAG_BONUS, INVADER_SPEED_AGGRESSIVE_BONUS,
  INVADER_SHOOT_INTERVAL_BASE, INVADER_SHOOT_INTERVAL_PER_WAVE,
  INVADER_SHOOT_INTERVAL_MIN, INVADER_SHOOT_INTERVAL_AGGRESSIVE_BONUS,
  ERRATIC_MOVEMENT_BASE, ERRATIC_MOVEMENT_ZIGZAG,
  MAX_BURST_SIZE, BURST_WAVE_DIVISOR, DROP_AMT, ROW_SPEED, ROW_SPEED_FALLBACK,
  ENEMY_BULLET_SPEED_BASE, ENEMY_BULLET_SPEED_PER_WAVE, ENEMY_BULLET_SPEED_AGGRESSIVE_BONUS,
  BOSS_W, BOSS_H,
  BOSS_SHOOT_INTERVAL_MIN, BOSS_SHOOT_INTERVAL_MAX,
  BOSS_SHOOT_INTERVAL_SCALE_MIN, BOSS_SHOOT_INTERVAL_PER_WAVE,
  BOSS_BULLET_SPEED_BASE, BOSS_BULLET_SPEED_PER_WAVE,
  BOSS_SPREAD_NORMAL, BOSS_SPREAD_AGGRESSIVE,
  BUNKER_BLOCK_W, BUNKER_BLOCK_H,
  buildGrid, spawnBoss, buildBunkers, makeEnemyBullet,
  calcInvaderPoints,
} from './invader-system.js';

import {
  POWERUP_DROP_CHANCE, POWERUP_BOSS_DROP_CHANCE,
  makeDroppedPowerup, activatePowerup, tickPowerups, getScoreMultiplier,
} from './powerup-system.js';

import { createRenderer } from './render-system.js';

GameRegistry.register(INVADERS_CONFIG.id, {
  label: INVADERS_CONFIG.label,
  bootstrap: bootstrapInvaders,
});

export function bootstrapInvaders(root) {
  const GAME_ID = INVADERS_CONFIG.id;
  const canvas  = document.getElementById('invCanvas');
  const ctx     = canvas.getContext('2d');
  const W       = canvas.width;
  const H       = canvas.height;

  const renderer = createRenderer(ctx, W, H);
  const engine   = new BaseGame();

  const scoreEl   = document.getElementById('score');
  const bestEl    = document.getElementById('best');
  const waveEl    = document.getElementById('wave');
  const livesEl   = document.getElementById('lives');
  const comboEl   = document.getElementById('combo');
  const powerupEl = document.getElementById('powerup');

  // ── Misc constants ────────────────────────────────────────────────────────────

  const SHIP_W            = 36;
  const SHIP_H            = 20;
  const BULLET_SPD        = 560;
  const SHOOT_RATE        = 0.2;
  const STREAK_BONUS_RATE = 0.05;
  const MAX_STREAK_BONUS  = 0.5;
  const WAVE_INTRO_DURATION = 2.2;

  // ── Game state ────────────────────────────────────────────────────────────────

  let score    = 0;
  let lives    = 3;
  let wave     = 0;
  let running  = false;
  let paused   = false;
  let gameOver = false;
  let best     = ArcadeSync.getHighScore(GAME_ID);
  let elapsed  = 0;

  let player = { x: W / 2, y: H - 50, w: SHIP_W, h: SHIP_H, speed: 320, moveDir: 1, shielded: false };

  let bullets       = [];
  let shootCooldown = 0;

  let invaders         = [];
  let invDir           = 1;
  let invSpeed         = 60;
  let invDropping      = false;
  let invBullets       = [];
  let invShootTimer    = 0;
  let invShootInterval = 1.8;

  let boss               = null;
  let bossEntering       = false;
  let bossWarningSounded = false;

  let streak           = 0;
  let streakTimer      = 0;
  let waveIntroTimer   = 0;

  /** @type {Map<string, {timer: number}>} */
  let activePowerups       = new Map();
  let powerupItems         = [];
  let lastActivatedPowerup = null;

  let bunkers = [];

  const particles  = [];
  const scoreTexts = [];
  const hitFlashes = [];
  let shakeTime      = 0;
  let shakeIntensity = 0;

  const stars = [];
  for (let i = 0; i < 60; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random(), spd: 10 + Math.random() * 35 });
  }

  const keys = engine.keys;

  // ── Utilities ─────────────────────────────────────────────────────────────────

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function getOverlayState() { return { running, paused, gameOver }; }

  // ── HUD ───────────────────────────────────────────────────────────────────────

  function triggerHudFx(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent  = best;
    waveEl.textContent  = wave || '\u2014';
    livesEl.textContent = lives;
    if (comboEl)   comboEl.textContent   = streak >= 3 ? '\xd7' + streak + '!' : '\xd71';
    if (powerupEl) powerupEl.textContent = (activePowerups.size > 0 && lastActivatedPowerup) ? lastActivatedPowerup : '\u2014';
  }

  function setBestMaybe() {
    if (score > best) { best = score; ArcadeSync.setHighScore(GAME_ID, best); }
  }

  function addScore(points, x, y, color) {
    if (!points) return;
    color = color || '#f7c948';
    score += points;
    setBestMaybe();
    updateHud();
    triggerHudFx(scoreEl, 'pulse', 180);
    if (typeof x === 'number' && typeof y === 'number') {
      scoreTexts.push({ x, y, text: '+' + points, life: 0.9, maxLife: 0.9, color });
    }
  }

  // ── Effects ───────────────────────────────────────────────────────────────────

  function screenShake(intensity, duration) {
    shakeIntensity = Math.max(shakeIntensity, intensity);
    shakeTime      = Math.max(shakeTime, duration);
  }

  function playSfx(type) {
    if (isMuted()) return;
    const map = {
      shoot:         'invaders-shoot',
      hit:           'invaders-hit',
      explosion:     'invaders-explosion',
      powerup:       'invaders-powerup',
      player_damage: 'invaders-player-damage',
      boss_warning:  'invaders-boss-warning',
      game_over:     'invaders-game-over',
    };
    const id = map[type];
    if (id) playSound(id);
  }

  function spawnExplosion(x, y, intensity, color) {
    intensity = intensity || 1;
    color     = color     || '#ff4fd1';
    const count = Math.floor(8 + intensity * 10);
    for (let i = 0; i < count; i++) {
      const a   = Math.random() * Math.PI * 2;
      const spd = rand(40, 170) * intensity;
      particles.push({
        x, y,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        size: rand(1.5, 3.5),
        life: rand(0.25, 0.55), maxLife: rand(0.25, 0.55),
        color,
      });
    }
    hitFlashes.push({ x, y, r: 10 + intensity * 15, life: 0.12, maxLife: 0.12 });
  }

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.97; p.vy *= 0.97;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = scoreTexts.length - 1; i >= 0; i--) {
      const s = scoreTexts[i];
      s.life -= dt; s.y -= 34 * dt;
      if (s.life <= 0) scoreTexts.splice(i, 1);
    }
    for (let i = hitFlashes.length - 1; i >= 0; i--) {
      const f = hitFlashes[i];
      f.life -= dt;
      if (f.life <= 0) hitFlashes.splice(i, 1);
    }
    if (shakeTime > 0) {
      shakeTime -= dt; shakeIntensity *= 0.9;
      if (shakeTime <= 0) { shakeTime = 0; shakeIntensity = 0; }
    }
    for (const s of stars) {
      s.y += s.spd * dt * (0.65 + wave * 0.03);
      if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
    }
  }

  // ── Wave management ───────────────────────────────────────────────────────────

  function startWave() {
    wave++;
    bullets              = [];
    invBullets           = [];
    boss                 = null;
    bossEntering         = false;
    bossWarningSounded   = false;
    streak               = 0;
    streakTimer          = 0;
    powerupItems         = [];
    activePowerups       = new Map();
    lastActivatedPowerup = null;
    waveIntroTimer       = WAVE_INTRO_DURATION;
    bunkers              = buildBunkers(W, H);

    if (wave % WAVE_BOSS === 0) {
      const r = spawnBoss(wave, W, rand);
      boss               = r.boss;
      invShootTimer      = r.invShootTimer;
      bossEntering       = r.bossEntering;
      bossWarningSounded = r.bossWarningSounded;
    } else {
      const g       = buildGrid(wave, W, rand);
      invaders      = g.invaders;
      invDir        = g.invDir;
      invSpeed      = g.invSpeed;
      invShootInterval = g.invShootInterval;
      invShootTimer = g.invShootTimer;
      invDropping   = g.invDropping;
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
    score    = 0;
    lives    = 3;
    wave     = 0;
    running  = false;
    paused   = false;
    gameOver = false;
    elapsed  = 0;
    streak       = 0;
    streakTimer  = 0;
    waveIntroTimer = 0;
    bullets    = [];
    invBullets = [];
    invaders   = [];
    boss = null;
    bossEntering       = false;
    bossWarningSounded = false;
    activePowerups       = new Map();
    powerupItems         = [];
    lastActivatedPowerup = null;
    bunkers = [];
    particles.length  = 0;
    scoreTexts.length = 0;
    hitFlashes.length = 0;
    shakeTime      = 0;
    shakeIntensity = 0;
    player = { x: W / 2, y: H - 50, w: SHIP_W, h: SHIP_H, speed: 320, moveDir: 1, shielded: false };
    updateHud();
    draw();
  }

  // ── Shooting ──────────────────────────────────────────────────────────────────

  function tryShoot() {
    if (shootCooldown > 0 || !running || paused || gameOver || waveIntroTimer > 0) return;
    const cx = player.x + player.w / 2;
    const by = player.y - 2;
    if (activePowerups.has('spread')) {
      const angles = [-Math.PI / 12, 0, Math.PI / 12];
      for (const ang of angles) {
        bullets.push({ x: cx - 2 + Math.sin(ang) * 8, y: by, w: 4, h: 12,
                       vx: Math.sin(ang) * BULLET_SPD, vy: BULLET_SPD });
      }
    } else {
      bullets.push({ x: cx - 2, y: by, w: 4, h: 12, vx: 0, vy: BULLET_SPD });
    }
    shootCooldown = activePowerups.has('rapid') ? SHOOT_RATE * 0.4 : SHOOT_RATE;
    playSfx('shoot');
  }

  // ── Update ────────────────────────────────────────────────────────────────────

  function update(dt) {
    if (!running || paused || gameOver) { updateEffects(dt); return; }
    elapsed += dt;

    if (waveIntroTimer > 0) { waveIntroTimer -= dt; updateEffects(dt); return; }

    // Powerup timers (via powerup-system)
    if (tickPowerups(activePowerups, player, dt)) updateHud();

    // Player movement
    if (keys.ArrowLeft || keys.a) { player.moveDir = -1; player.x -= player.speed * dt; }
    if (keys.ArrowRight || keys.d) { player.moveDir = 1;  player.x += player.speed * dt; }
    player.x = clamp(player.x, 0, W - player.w);

    if (shootCooldown > 0) shootCooldown -= dt;
    if (streakTimer > 0) { streakTimer -= dt; if (streakTimer <= 0) streak = 0; }

    // Boss entrance
    if (bossEntering && boss) {
      if (!bossWarningSounded) { bossWarningSounded = true; playSfx('boss_warning'); }
      boss.y += 120 * dt;
      if (boss.y >= 30) { boss.y = 30; bossEntering = false; }
      updateEffects(dt);
      return;
    }

    // Player bullet movement
    for (const b of bullets) { b.y -= b.vy * dt; b.x += (b.vx || 0) * dt; }
    bullets = bullets.filter((b) => b.y > -20 && b.x > -20 && b.x < W + 20);

    // Invader hit timers
    for (const inv of invaders) {
      if (inv.hitTimer > 0)       inv.hitTimer -= dt;
      if (inv.shieldHitTimer > 0) inv.shieldHitTimer -= dt;
    }

    const slowMult = activePowerups.has('slow') ? 0.45 : 1;

    // Invader grid movement
    if (!boss && invaders.length) {
      const alive = invaders.filter((i) => i.alive);
      if (!alive.length) { completeWave(); updateEffects(dt); return; }

      if (invDropping) {
        for (const i of alive) i.y += DROP_AMT;
        invDropping = false;
        invDir *= -1;
      } else {
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        for (const i of alive) {
          let drift = invSpeed * slowMult * invDir * dt * (ROW_SPEED[i.row] || ROW_SPEED_FALLBACK);
          if (i.row === 1) {
            drift += Math.sin(elapsed * 3 + i.seed) * 5 * dt;
          } else if (i.row === 2) {
            drift += (Math.random() - 0.5) * (wave >= WAVE_ZIGZAG ? ERRATIC_MOVEMENT_ZIGZAG : ERRATIC_MOVEMENT_BASE) * dt;
          } else if (i.row === 3 && wave >= WAVE_ZIGZAG) {
            drift += Math.sin(elapsed * 7 + i.seed) * 8 * dt;
          }
          i.x += drift;
          minX = Math.min(minX, i.x);
          maxX = Math.max(maxX, i.x + i.w);
        }
        if (maxX >= W - 4 || minX <= 4) invDropping = true;
      }

      if (alive.some((i) => i.y + i.h >= H - 60)) { onGameOver(); updateEffects(dt); return; }

      invShootTimer -= dt;
      if (invShootTimer <= 0) {
        invShootTimer = rand(invShootInterval * 0.65, invShootInterval * 1.35);
        const burst = Math.min(MAX_BURST_SIZE, 1 + Math.floor(wave / BURST_WAVE_DIVISOR) + (wave >= WAVE_AGGRESSIVE ? 1 : 0));
        for (let n = 0; n < burst; n++) {
          const shooter = alive[Math.floor(Math.random() * alive.length)];
          if (!shooter) break;
          invBullets.push(makeEnemyBullet(shooter, wave));
        }
      }
    }

    // Boss movement & shooting
    if (boss) {
      boss.x += boss.speed * slowMult * boss.dir * dt;
      if (boss.x <= 0)          { boss.x = 0;          boss.dir =  1; }
      if (boss.x + boss.w >= W) { boss.x = W - boss.w; boss.dir = -1; }
      invShootTimer -= dt;
      if (invShootTimer <= 0.15) boss.flashTimer = 0.15;
      if (boss.flashTimer > 0)   boss.flashTimer -= dt;
      if (boss.hitTimer > 0)     boss.hitTimer   -= dt;
      boss.hpDisplay += (boss.hp - boss.hpDisplay) * Math.min(1, dt * 14);
      if (invShootTimer <= 0) {
        invShootTimer = rand(BOSS_SHOOT_INTERVAL_MIN, BOSS_SHOOT_INTERVAL_MAX) *
          Math.max(BOSS_SHOOT_INTERVAL_SCALE_MIN, 1 - wave * BOSS_SHOOT_INTERVAL_PER_WAVE);
        const spread = wave >= WAVE_AGGRESSIVE ? BOSS_SPREAD_AGGRESSIVE : BOSS_SPREAD_NORMAL;
        const speed  = (BOSS_BULLET_SPEED_BASE + wave * BOSS_BULLET_SPEED_PER_WAVE) * slowMult;
        for (const sx of spread) {
          invBullets.push({ x: boss.x + boss.w / 2 + sx, y: boss.y + boss.h, w: 4, h: 14, vy: speed });
        }
      }
    }

    // Enemy bullets
    for (const b of invBullets) b.y += b.vy * dt;
    invBullets = invBullets.filter((b) => b.y < H + 20);

    // Powerup items
    for (const p of powerupItems) p.y += p.vy * dt;
    powerupItems = powerupItems.filter((p) => p.y < H + 30);

    // Powerup collection
    for (let pi = powerupItems.length - 1; pi >= 0; pi--) {
      const p = powerupItems[pi];
      if (rectsOverlap(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2, player.x, player.y, player.w, player.h)) {
        lastActivatedPowerup = activatePowerup(p.type, activePowerups, player);
        updateHud();
        playSfx('powerup');
        powerupItems.splice(pi, 1);
      }
    }

    // Player bullets vs bunkers + invaders + boss
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b   = bullets[bi];
      let   hit = false;

      for (const bunker of bunkers) {
        if (hit) break;
        for (let bki = bunker.length - 1; bki >= 0; bki--) {
          const blk = bunker[bki];
          if (blk.hp > 0 && rectsOverlap(b.x, b.y, b.w, b.h, blk.x, blk.y, BUNKER_BLOCK_W, BUNKER_BLOCK_H)) {
            blk.hp--;
            if (blk.hp <= 0) bunker.splice(bki, 1);
            hit = true;
            break;
          }
        }
      }
      if (hit) { bullets.splice(bi, 1); continue; }

      for (const inv of invaders) {
        if (!inv.alive) continue;
        if (rectsOverlap(b.x, b.y, b.w, b.h, inv.x, inv.y, inv.w, inv.h)) {
          if (inv.shieldHp > 0) {
            inv.shieldHp--;
            inv.shieldHitTimer = 0.2;
            spawnExplosion(b.x, b.y, 0.3, '#2ec5ff');
            playSfx('hit');
          } else {
            inv.hp--;
            inv.hitTimer = 0.12;
            if (inv.hp <= 0) {
              inv.alive = false;
              streak++;
              streakTimer = 1.8;
              const pts = calcInvaderPoints(inv, wave, streak, { STREAK_BONUS_RATE, MAX_STREAK_BONUS }) * getScoreMultiplier(activePowerups);
              addScore(pts, inv.x + inv.w * 0.5, inv.y, '#f7c948');
              spawnExplosion(inv.x + inv.w * 0.5, inv.y + inv.h * 0.5, 0.7, '#ff4fd1');
              playSfx('hit');
              if (Math.random() < POWERUP_DROP_CHANCE) powerupItems.push(makeDroppedPowerup(inv.x + inv.w * 0.5, inv.y + inv.h));
              // If this was the last living invader, advance to the next wave
              // immediately in the same update() run — do not wait for the next
              // frame, which would leave one tick where the empty invader grid
              // could trigger unintended code paths (e.g. a stale game-over check).
              if (!boss && invaders.every((i) => !i.alive)) {
                // Safe to splice here: the function returns immediately after,
                // so the loop index is never advanced past bi.
                // startWave() (via completeWave()) resets bullets=[], so any
                // remaining unprocessed bullets are intentionally discarded —
                // matching the existing boss-kill wave-transition behaviour.
                bullets.splice(bi, 1);
                completeWave();
                updateEffects(dt);
                return;
              }
            } else {
              playSfx('hit');
            }
          }
          hit = true;
          break;
        }
      }

      if (!hit && boss && rectsOverlap(b.x, b.y, b.w, b.h, boss.x, boss.y, boss.w, boss.h)) {
        hit = true;
        boss.hp--;
        boss.hitTimer = 0.12;
        addScore(20 * wave * getScoreMultiplier(activePowerups), boss.x + boss.w * 0.5, boss.y - 4, '#ff9b9b');
        spawnExplosion(b.x, b.y, 0.5, '#ff8888');
        screenShake(3, 0.12);
        playSfx('hit');
        if (boss.hp <= 0) {
          addScore(500 * wave * getScoreMultiplier(activePowerups), boss.x + boss.w * 0.5, boss.y - 16, '#ff4fd1');
          spawnExplosion(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5, 1.9, '#ff4444');
          screenShake(10, 0.35);
          playSfx('explosion');
          if (Math.random() < POWERUP_BOSS_DROP_CHANCE) powerupItems.push(makeDroppedPowerup(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5));
          boss = null;
          completeWave();
          updateEffects(dt);
          return;
        }
      }

      if (hit) bullets.splice(bi, 1);
    }

    // Enemy bullets vs bunkers + player
    for (let bi = invBullets.length - 1; bi >= 0; bi--) {
      const b   = invBullets[bi];
      let   hit = false;

      for (const bunker of bunkers) {
        if (hit) break;
        for (let bki = bunker.length - 1; bki >= 0; bki--) {
          const blk = bunker[bki];
          if (blk.hp > 0 && rectsOverlap(b.x, b.y, b.w, b.h, blk.x, blk.y, BUNKER_BLOCK_W, BUNKER_BLOCK_H)) {
            blk.hp--;
            if (blk.hp <= 0) bunker.splice(bki, 1);
            hit = true;
            break;
          }
        }
      }
      if (hit) { invBullets.splice(bi, 1); continue; }

      if (rectsOverlap(b.x, b.y, b.w, b.h, player.x, player.y, player.w, player.h)) {
        invBullets.splice(bi, 1);
        if (player.shielded) {
          player.shielded = false;
          activePowerups.delete('shield');
          updateHud();
          spawnExplosion(player.x + player.w * 0.5, player.y + player.h * 0.4, 0.6, '#3fb950');
        } else {
          lives--;
          triggerHudFx(livesEl, 'flash', 220);
          updateHud();
          spawnExplosion(player.x + player.w * 0.5, player.y + player.h * 0.4, 1.2, '#ff4444');
          screenShake(7, 0.24);
          playSfx('player_damage');
          streak = 0;
          streakTimer = 0;
          if (lives <= 0) { onGameOver(); updateEffects(dt); return; }
        }
      }
    }

    updateEffects(dt);
  }

  // ── Draw (delegates to renderer) ─────────────────────────────────────────────

  function draw() {
    renderer.draw({
      running, paused, gameOver, score, lives, wave,
      elapsed, streak, streakTimer, waveIntroTimer, WAVE_INTRO_DURATION,
      shakeTime, shakeIntensity,
      player, invaders, boss, bullets, invBullets,
      bunkers, powerupItems, activePowerups,
      particles, scoreTexts, hitFlashes, stars,
    });
  }

  // ── Engine hooks (loop + input via BaseGame) ──────────────────────────────────

  engine.onTick    = (dt) => { update(dt); draw(); };
  engine.onKeyDown = (e)  => {
    if (e.key === ' ' && running && !paused && waveIntroTimer <= 0) tryShoot();
  };

  // ── Game over ─────────────────────────────────────────────────────────────────

  async function onGameOver() {
    running  = false;
    gameOver = true;
    stopAllSounds();
    setBestMaybe();
    updateHud();
    playSfx('game_over');
    if (score > 0) {
      const playerName = window.MOONBOYS_IDENTITY?.getTelegramName?.() || ArcadeSync.getPlayer();
      try { await submitScore(playerName, score, GAME_ID); } catch (e) {}
    }
    draw();
    if (window.showGameOverModal) window.showGameOverModal(score);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  function init() {
    best = ArcadeSync.getHighScore(GAME_ID);
    updateHud();
    draw();
    window.__invadersOverlayStateHook = getOverlayState;
    engine.attachInput();
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    if (startBtn) startBtn.onclick = () => start();
    if (pauseBtn) pauseBtn.onclick = () => (paused ? resume() : pause());
    if (resetBtn) resetBtn.onclick = () => reset();
  }

  function start() {
    resetGame();
    running  = true;
    paused   = false;
    gameOver = false;
    startWave();
    engine.startLoop();
  }

  function pause() {
    if (running && !gameOver) { paused = true; stopAllSounds(); }
  }

  function resume() {
    if (running && paused && !gameOver) paused = false;
  }

  function reset() {
    engine.stopLoop();
    stopAllSounds();
    resetGame();
    engine.startLoop();
  }

  function destroy() {
    engine.destroy();
    stopAllSounds();
    if (window.__invadersOverlayStateHook === getOverlayState) delete window.__invadersOverlayStateHook;
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    if (startBtn) startBtn.onclick = null;
    if (pauseBtn) pauseBtn.onclick = null;
    if (resetBtn) resetBtn.onclick = null;
  }

  function getScore() { return score; }

  return { init, start, pause, resume, reset, destroy, getScore };
}
