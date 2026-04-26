/**
 * bootstrap.js - Invaders 3008 game module (upgraded)
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

  const scoreEl   = document.getElementById('score');
  const bestEl    = document.getElementById('best');
  const waveEl    = document.getElementById('wave');
  const livesEl   = document.getElementById('lives');
  const comboEl   = document.getElementById('combo');
  const powerupEl = document.getElementById('powerup');

  // ── Game state ───────────────────────────────────────────────────────────────
  let score    = 0;
  let lives    = 3;
  let wave     = 0;
  let running  = false;
  let paused   = false;
  let gameOver = false;
  let best     = ArcadeSync.getHighScore(GAME_ID);
  let raf      = null;
  let lastTime = 0;
  let elapsed  = 0;

  // ── Player ───────────────────────────────────────────────────────────────────
  const SHIP_W = 36;
  const SHIP_H = 20;
  let player = { x: W / 2, y: H - 50, w: SHIP_W, h: SHIP_H, speed: 320, moveDir: 1, shielded: false };

  // ── Bullets ──────────────────────────────────────────────────────────────────
  let bullets = [];
  const BULLET_SPD = 560;
  let shootCooldown = 0;
  const SHOOT_RATE  = 0.2;

  // ── Grid constants ───────────────────────────────────────────────────────────
  const ROWS    = 4;
  const COLS    = 10;
  const INV_W   = 36;
  const INV_H   = 28;
  const INV_PAD = 10;

  // ── Wave thresholds ──────────────────────────────────────────────────────────
  const WAVE_FAST_ENEMIES = 3;
  const WAVE_BOSS         = 5;
  const WAVE_ZIGZAG       = 7;
  const WAVE_AGGRESSIVE   = 10;

  // ── Invader movement ─────────────────────────────────────────────────────────
  const INVADER_SPEED_BASE                      = 54;
  const INVADER_SPEED_PER_WAVE                  = 8;
  const INVADER_SPEED_FAST_BONUS                = 18;
  const INVADER_SPEED_ZIGZAG_BONUS              = 14;
  const INVADER_SPEED_AGGRESSIVE_BONUS          = 16;
  const INVADER_SHOOT_INTERVAL_BASE             = 1.7;
  const INVADER_SHOOT_INTERVAL_PER_WAVE         = 0.1;
  const INVADER_SHOOT_INTERVAL_MIN              = 0.35;
  const INVADER_SHOOT_INTERVAL_AGGRESSIVE_BONUS = 0.22;
  const ERRATIC_MOVEMENT_BASE   = 12;
  const ERRATIC_MOVEMENT_ZIGZAG = 22;
  const MAX_BURST_SIZE     = 5;
  const BURST_WAVE_DIVISOR = 3;
  const DROP_AMT           = 16;
  const ROW_SPEED          = [0.65, 0.9, 1.05, 1.35];
  const ROW_SPEED_FALLBACK = 1;

  // ── Enemy bullets ────────────────────────────────────────────────────────────
  const ENEMY_BULLET_SPEED_BASE             = 280;
  const ENEMY_BULLET_SPEED_PER_WAVE         = 14;
  const ENEMY_BULLET_SPEED_AGGRESSIVE_BONUS = 60;

  // ── Boss ─────────────────────────────────────────────────────────────────────
  const BOSS_W                    = 80;
  const BOSS_H                    = 44;
  const BOSS_SHOOT_INTERVAL_MIN   = 0.42;
  const BOSS_SHOOT_INTERVAL_MAX   = 0.64;
  const BOSS_SHOOT_INTERVAL_SCALE_MIN = 0.55;
  const BOSS_SHOOT_INTERVAL_PER_WAVE  = 0.025;
  const BOSS_BULLET_SPEED_BASE    = 320;
  const BOSS_BULLET_SPEED_PER_WAVE = 14;
  const BOSS_SPREAD_NORMAL        = [-8, 8];
  const BOSS_SPREAD_AGGRESSIVE    = [-16, 0, 16];

  // ── Misc ─────────────────────────────────────────────────────────────────────
  const SHOOT_RECOIL         = 8;
  const STREAK_BONUS_RATE    = 0.05;
  const MAX_STREAK_BONUS     = 0.5;
  const SHIELD_SPAWN_CHANCE  = 0.15;
  const WAVE_INTRO_DURATION  = 2.2;

  // ── Powerups ─────────────────────────────────────────────────────────────────
  const POWERUP_DURATION         = 8;
  const POWERUP_DROP_CHANCE      = 0.10;
  const POWERUP_BOSS_DROP_CHANCE = 0.15;
  const POWERUP_TYPES  = ['rapid', 'spread', 'shield', 'multiplier', 'slow'];
  const POWERUP_COLORS = { rapid: '#f7c948', spread: '#2ec5ff', shield: '#3fb950', multiplier: '#ff4fd1', slow: '#bc8cff' };
  const POWERUP_ICONS  = { rapid: 'R', spread: 'S', shield: 'SH', multiplier: 'x2', slow: 'SL' };

  // ── Bunkers ──────────────────────────────────────────────────────────────────
  const BUNKER_COUNT      = 4;
  const BUNKER_BLOCK_W    = 14;
  const BUNKER_BLOCK_H    = 10;
  const BUNKER_COLS_COUNT = 4;
  const BUNKER_ROWS_COUNT = 3;
  const BUNKER_Y          = H - 130;

  // ── Mutable state ────────────────────────────────────────────────────────────
  let invaders         = [];
  let invDir           = 1;
  let invSpeed         = 60;
  let invDropping      = false;
  let invBullets       = [];
  let invShootTimer    = 0;
  let invShootInterval = 1.8;

  let boss             = null;
  let bossEntering     = false;
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

  const keys = {};

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getOverlayState() { return { running, paused, gameOver }; }

  function onKeyDown(e) {
    keys[e.key] = true;
    if (e.key === ' ' && running && !paused && waveIntroTimer <= 0) {
      e.preventDefault();
      tryShoot();
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && running) e.preventDefault();
  }

  function onKeyUp(e) { keys[e.key] = false; }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

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
    scoreEl.textContent  = score;
    bestEl.textContent   = best;
    waveEl.textContent   = wave || '\u2014';
    livesEl.textContent  = lives;
    if (comboEl)   comboEl.textContent   = streak >= 3 ? '\xd7' + streak + '!' : '\xd71';
    if (powerupEl) powerupEl.textContent = (activePowerups.size > 0 && lastActivatedPowerup) ? lastActivatedPowerup : '\u2014';
  }

  function setBestMaybe() {
    if (score > best) { best = score; ArcadeSync.setHighScore(GAME_ID, best); }
  }

  function getScoreMultiplier() { return activePowerups.has('multiplier') ? 2 : 1; }

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

  // ── Enemy type helpers ────────────────────────────────────────────────────────

  function rowToType(row) {
    // row 0=top(shooter), 1(tank), 2(fast), 3=bottom(basic)
    return ['shooter', 'tank', 'fast', 'basic'][row] || 'basic';
  }

  function typeToHp(type)       { return type === 'tank' ? 2 : 1; }
  function typeToShieldHp(type) { return type === 'shield' ? 2 : 0; }

  // ── Score helpers ─────────────────────────────────────────────────────────────

  function calcInvaderPoints(inv) {
    const base       = (ROWS - inv.row) * 12;
    const streakMult = 1 + Math.min(MAX_STREAK_BONUS, streak * STREAK_BONUS_RATE);
    return Math.round(base * wave * streakMult);
  }

  // ── Grid / Boss / Bunker build ────────────────────────────────────────────────

  function buildGrid() {
    invaders = [];
    const totalW = COLS * (INV_W + INV_PAD) - INV_PAD;
    const offX   = (W - totalW) / 2;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let type = rowToType(r);
        if (wave >= 4 && type !== 'tank' && Math.random() < SHIELD_SPAWN_CHANCE) type = 'shield';
        const hp      = typeToHp(type);
        const shieldHp = typeToShieldHp(type);
        invaders.push({
          x: offX + c * (INV_W + INV_PAD),
          y: 60 + r * (INV_H + INV_PAD),
          w: INV_W, h: INV_H,
          row: r, type,
          hp, maxHp: hp,
          shieldHp, maxShieldHp: shieldHp,
          alive: true,
          seed: Math.random() * Math.PI * 2 + c * 0.35,
          hitTimer: 0, shieldHitTimer: 0,
        });
      }
    }
    invDir    = 1;
    invSpeed  =
      INVADER_SPEED_BASE +
      wave * INVADER_SPEED_PER_WAVE +
      (wave >= WAVE_FAST_ENEMIES ? INVADER_SPEED_FAST_BONUS  : 0) +
      (wave >= WAVE_ZIGZAG       ? INVADER_SPEED_ZIGZAG_BONUS : 0) +
      (wave >= WAVE_AGGRESSIVE   ? INVADER_SPEED_AGGRESSIVE_BONUS : 0);
    invShootInterval = Math.max(
      INVADER_SHOOT_INTERVAL_MIN,
      INVADER_SHOOT_INTERVAL_BASE -
        wave * INVADER_SHOOT_INTERVAL_PER_WAVE -
        (wave >= WAVE_AGGRESSIVE ? INVADER_SHOOT_INTERVAL_AGGRESSIVE_BONUS : 0)
    );
    invShootTimer = rand(invShootInterval * 0.6, invShootInterval * 1.3);
    invDropping   = false;
  }

  function spawnBoss() {
    boss = {
      x: W / 2 - BOSS_W / 2,
      y: -(BOSS_H + 10),
      w: BOSS_W, h: BOSS_H,
      hp: 8 + wave, maxHp: 8 + wave,
      hpDisplay: 8 + wave,
      dir: 1,
      speed: 92 + wave * 10,
      flashTimer: 0, hitTimer: 0,
    };
    bossEntering       = true;
    bossWarningSounded = false;
    invShootTimer      = rand(0.8, 1.4);
  }

  function buildBunkers() {
    bunkers = [];
    const totalBW = BUNKER_COLS_COUNT * BUNKER_BLOCK_W;
    const spacing = (W - BUNKER_COUNT * totalBW) / (BUNKER_COUNT + 1);
    for (let b = 0; b < BUNKER_COUNT; b++) {
      const bx = spacing + b * (totalBW + spacing);
      const blocks = [];
      for (let r = 0; r < BUNKER_ROWS_COUNT; r++) {
        for (let c = 0; c < BUNKER_COLS_COUNT; c++) {
          blocks.push({ x: bx + c * BUNKER_BLOCK_W, y: BUNKER_Y + r * BUNKER_BLOCK_H, hp: 4, maxHp: 4 });
        }
      }
      bunkers.push(blocks);
    }
  }

  // ── Powerup helpers ───────────────────────────────────────────────────────────

  function dropPowerup(x, y) {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    powerupItems.push({ x, y, vy: 50, type, r: 10 });
  }

  function collectPowerup(type) {
    if (type === 'shield') {
      player.shielded = true;
      activePowerups.set('shield', { timer: Infinity });
    } else {
      activePowerups.set(type, { timer: POWERUP_DURATION });
    }
    lastActivatedPowerup = POWERUP_ICONS[type] || type;
    updateHud();
    playSfx('powerup');
  }

  // ── Wave / reset ──────────────────────────────────────────────────────────────

  function startWave() {
    wave++;
    bullets    = [];
    invBullets = [];
    boss       = null;
    bossEntering = false;
    bossWarningSounded = false;
    streak     = 0;
    streakTimer = 0;
    powerupItems        = [];
    activePowerups      = new Map();
    lastActivatedPowerup = null;
    waveIntroTimer      = WAVE_INTRO_DURATION;
    buildBunkers();
    if (wave % WAVE_BOSS === 0) {
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
    score    = 0;
    lives    = 3;
    wave     = 0;
    running  = false;
    paused   = false;
    gameOver = false;
    elapsed  = 0;
    streak   = 0;
    streakTimer    = 0;
    waveIntroTimer = 0;
    bullets    = [];
    invBullets = [];
    invaders   = [];
    boss = null;
    bossEntering = false;
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
    const recoilDir = player.moveDir || 1;
    player.x      = clamp(player.x - SHOOT_RECOIL * recoilDir, 0, W - player.w);
    shootCooldown = activePowerups.has('rapid') ? SHOOT_RATE * 0.4 : SHOOT_RATE;
    playSfx('shoot');
  }

  function emitEnemyBullet(shooter) {
    const speed =
      ENEMY_BULLET_SPEED_BASE +
      wave * ENEMY_BULLET_SPEED_PER_WAVE +
      (wave >= WAVE_AGGRESSIVE ? ENEMY_BULLET_SPEED_AGGRESSIVE_BONUS : 0);
    invBullets.push({ x: shooter.x + shooter.w / 2 - 2, y: shooter.y + shooter.h, w: 4, h: 12, vy: speed });
  }

  // ── Effects update ────────────────────────────────────────────────────────────

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

  // ── Main update ───────────────────────────────────────────────────────────────

  function update(dt) {
    if (!running || paused || gameOver) { updateEffects(dt); return; }
    elapsed += dt;

    // Wave intro — freeze gameplay but run star animation
    if (waveIntroTimer > 0) { waveIntroTimer -= dt; updateEffects(dt); return; }

    // Powerup timers
    for (const [type, data] of activePowerups) {
      if (data.timer === Infinity) continue;
      data.timer -= dt;
      if (data.timer <= 0) {
        activePowerups.delete(type);
        if (type === 'shield') player.shielded = false;
        updateHud();
      }
    }

    // Player movement
    if (keys.ArrowLeft || keys.a) { player.moveDir = -1; player.x -= player.speed * dt; }
    if (keys.ArrowRight || keys.d) { player.moveDir = 1;  player.x += player.speed * dt; }
    player.x = clamp(player.x, 0, W - player.w);

    if (shootCooldown > 0) shootCooldown -= dt;
    if (streakTimer > 0) { streakTimer -= dt; if (streakTimer <= 0) streak = 0; }

    // Boss entrance animation
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
          emitEnemyBullet(shooter);
        }
      }
    }

    // Boss movement & shooting
    if (boss) {
      boss.x += boss.speed * slowMult * boss.dir * dt;
      if (boss.x <= 0)              { boss.x = 0;           boss.dir =  1; }
      if (boss.x + boss.w >= W)     { boss.x = W - boss.w;  boss.dir = -1; }
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
        collectPowerup(p.type);
        powerupItems.splice(pi, 1);
      }
    }

    // Player bullets vs bunkers + invaders + boss
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b   = bullets[bi];
      let   hit = false;

      // Bunker check (bullet consumed)
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

      // Invaders
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
              const pts = calcInvaderPoints(inv) * getScoreMultiplier();
              addScore(pts, inv.x + inv.w * 0.5, inv.y, '#f7c948');
              spawnExplosion(inv.x + inv.w * 0.5, inv.y + inv.h * 0.5, 0.7, '#ff4fd1');
              playSfx('hit');
              if (Math.random() < POWERUP_DROP_CHANCE) dropPowerup(inv.x + inv.w * 0.5, inv.y + inv.h);
            } else {
              playSfx('hit');
            }
          }
          hit = true;
          break;
        }
      }

      // Boss
      if (!hit && boss && rectsOverlap(b.x, b.y, b.w, b.h, boss.x, boss.y, boss.w, boss.h)) {
        hit = true;
        boss.hp--;
        boss.hitTimer = 0.12;
        addScore(20 * wave * getScoreMultiplier(), boss.x + boss.w * 0.5, boss.y - 4, '#ff9b9b');
        spawnExplosion(b.x, b.y, 0.5, '#ff8888');
        screenShake(3, 0.12);
        playSfx('hit');
        if (boss.hp <= 0) {
          addScore(500 * wave * getScoreMultiplier(), boss.x + boss.w * 0.5, boss.y - 16, '#ff4fd1');
          spawnExplosion(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5, 1.9, '#ff4444');
          screenShake(10, 0.35);
          playSfx('explosion');
          if (Math.random() < POWERUP_BOSS_DROP_CHANCE) dropPowerup(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5);
          boss = null;
          completeWave();
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

  // ── Drawing: ship ─────────────────────────────────────────────────────────────

  function drawShip(x, y, w, h) {
    // Main hull
    ctx.fillStyle = '#2ec5ff';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
    // Cockpit
    ctx.fillStyle = '#a8eaff';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.55, 5, 0, Math.PI * 2);
    ctx.fill();
    // Engine glow
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(x + w / 2 - 4, y + h - 6, 8, 6);
    // Wing tips
    ctx.fillStyle = '#1a9acc';
    ctx.fillRect(x, y + h - 8, 8, 4);
    ctx.fillRect(x + w - 8, y + h - 8, 8, 4);
    // Shield aura
    if (player.shielded) {
      ctx.save();
      ctx.strokeStyle = 'rgba(63,185,80,0.7)';
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 12;
      ctx.shadowColor = '#3fb950';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, w * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // ── Drawing: invader types ────────────────────────────────────────────────────

  function drawInvaderBasic(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffbbee' : '#ff4fd1';
    ctx.fillRect(x + 3, y + 4, w - 6, h - 6);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x + 8, y + 8, 5, 5);
    ctx.fillRect(x + w - 13, y + 8, 5, 5);
    ctx.strokeStyle = '#ff4fd1';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(x + 5, y + h - 2); ctx.lineTo(x, y + h + 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - 5, y + h - 2); ctx.lineTo(x + w, y + h + 4); ctx.stroke();
  }

  function drawInvaderFast(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffe0a0' : '#f7c948';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 2);
    ctx.lineTo(x + w - 2, y + h - 2);
    ctx.lineTo(x + 2,     y + h - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + w / 2 - 5, y + 3, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w / 2 + 5, y + 3, 2, 0, Math.PI * 2); ctx.fill();
  }

  function drawInvaderTank(x, y, w, h, hitFrac, hpRatio) {
    ctx.fillStyle = hitFrac > 0 ? '#b0ffb0' : '#3fb950';
    ctx.fillRect(x + 2, y + 3, w - 4, h - 5);
    ctx.fillStyle = '#2a8040';
    ctx.fillRect(x, y + 6, 5, h - 10);
    ctx.fillRect(x + w - 5, y + 6, 5, h - 10);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x + 7, y + 7, 7, 7);
    ctx.fillRect(x + w - 14, y + 7, 7, 7);
    if (hpRatio < 1) {
      ctx.fillStyle = '#222';
      ctx.fillRect(x, y + h + 1, w, 3);
      ctx.fillStyle = hpRatio > 0.5 ? '#3fb950' : '#f7c948';
      ctx.fillRect(x, y + h + 1, w * hpRatio, 3);
    }
  }

  function drawInvaderShooter(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ddc0ff' : '#bc8cff';
    ctx.fillRect(x + 3, y + 3, w - 6, h - 7);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x + 9, y + 7, 5, 5);
    ctx.fillRect(x + w - 14, y + 7, 5, 5);
    ctx.fillStyle = '#9060cc';
    ctx.fillRect(x + w / 2 - 2, y + h - 4, 4, 7);
  }

  function drawInvaderShield(x, y, w, h, hitFrac, shieldFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#aaddff' : '#2ec5ff';
    ctx.fillRect(x + 3, y + 4, w - 6, h - 6);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x + 8, y + 8, 5, 5);
    ctx.fillRect(x + w - 13, y + 8, 5, 5);
    if (shieldFrac > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(46,197,255,' + (0.35 + shieldFrac * 0.45) + ')';
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 8;
      ctx.shadowColor = '#2ec5ff';
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r  = w * 0.65;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 - Math.PI / 6;
        if (k === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        else         ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  function drawInvader(inv) {
    const hf      = clamp(inv.hitTimer / 0.12, 0, 1);
    const sf      = inv.maxShieldHp > 0 ? inv.shieldHp / inv.maxShieldHp : 0;
    const hpRatio = clamp(inv.hp / inv.maxHp, 0, 1);
    switch (inv.type) {
      case 'fast':    drawInvaderFast(inv.x, inv.y, inv.w, inv.h, hf); break;
      case 'tank':    drawInvaderTank(inv.x, inv.y, inv.w, inv.h, hf, hpRatio); break;
      case 'shooter': drawInvaderShooter(inv.x, inv.y, inv.w, inv.h, hf); break;
      case 'shield':  drawInvaderShield(inv.x, inv.y, inv.w, inv.h, hf, sf); break;
      default:        drawInvaderBasic(inv.x, inv.y, inv.w, inv.h, hf);
    }
  }

  // ── Drawing: boss ─────────────────────────────────────────────────────────────

  function drawBoss(b) {
    const isShooting = b.flashTimer > 0;
    const isHit      = b.hitTimer > 0;
    const cx         = b.x + b.w / 2;
    const cut        = 10;
    ctx.save();
    ctx.shadowBlur  = 18;
    ctx.shadowColor = '#ff4444';
    ctx.fillStyle   = isHit ? '#ffd3d3' : isShooting ? '#ff2f2f' : '#ff4444';
    ctx.beginPath();
    ctx.moveTo(cx - b.w / 2 + cut, b.y);
    ctx.lineTo(cx + b.w / 2 - cut, b.y);
    ctx.lineTo(cx + b.w / 2,       b.y + cut);
    ctx.lineTo(cx + b.w / 2,       b.y + b.h - cut);
    ctx.lineTo(cx + b.w / 2 - cut, b.y + b.h);
    ctx.lineTo(cx - b.w / 2 + cut, b.y + b.h);
    ctx.lineTo(cx - b.w / 2,       b.y + b.h - cut);
    ctx.lineTo(cx - b.w / 2,       b.y + cut);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#fff';
    ctx.beginPath(); ctx.arc(cx - 16, b.y + 14, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 16, b.y + 14, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff0000';
    ctx.beginPath(); ctx.arc(cx - 16, b.y + 14, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 16, b.y + 14, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // HP bar
    ctx.fillStyle   = '#333';
    ctx.fillRect(b.x, b.y - 10, b.w, 6);
    ctx.fillStyle   = '#f7c948';
    ctx.fillRect(b.x, b.y - 10, b.w * clamp(b.hpDisplay / b.maxHp, 0, 1), 6);
    ctx.strokeStyle = '#555';
    ctx.lineWidth   = 1;
    ctx.strokeRect(b.x, b.y - 10, b.w, 6);
  }

  // ── Drawing: background ───────────────────────────────────────────────────────

  function drawBackground() {
    const glow = 8 + Math.sin(elapsed * 0.8) * 3;
    const bg   = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#090c16');
    bg.addColorStop(1, '#060912');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      const alpha = 0.2 + s.z * 0.6;
      const r     = 0.8 + s.z * 1.4;
      ctx.fillStyle = 'rgba(90,170,255,' + alpha + ')';
      ctx.fillRect(s.x, s.y, r, r);
    }
    ctx.strokeStyle = 'rgba(63,185,80,0.06)';
    ctx.lineWidth   = 1;
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
    ctx.shadowBlur  = glow;
    ctx.shadowColor = 'rgba(63,185,80,0.2)';
    ctx.strokeStyle = 'rgba(63,185,80,0.25)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, H - 30);
    ctx.lineTo(W, H - 30);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ── Drawing: bunkers ──────────────────────────────────────────────────────────

  function drawBunkers() {
    for (const bunker of bunkers) {
      for (const blk of bunker) {
        const g = Math.floor(100 + (blk.hp / blk.maxHp) * 85);
        ctx.fillStyle = 'rgb(0,' + g + ',0)';
        ctx.fillRect(blk.x, blk.y, BUNKER_BLOCK_W - 1, BUNKER_BLOCK_H - 1);
      }
    }
  }

  // ── Drawing: effects ──────────────────────────────────────────────────────────

  function drawEffects() {
    for (const f of hitFlashes) {
      const a = f.life / f.maxLife;
      ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.35) + ')';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1 + (1 - a) * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle   = p.color;
      ctx.globalAlpha = a;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.globalAlpha = 1;
    }
    ctx.font      = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    for (const s of scoreTexts) {
      const a = clamp(s.life / s.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle   = s.color;
      ctx.fillText(s.text, s.x, s.y);
      ctx.globalAlpha = 1;
    }
  }

  // ── Drawing: powerup items ────────────────────────────────────────────────────

  function drawPowerupItems() {
    for (const p of powerupItems) {
      const col = POWERUP_COLORS[p.type] || '#fff';
      ctx.save();
      ctx.fillStyle   = col;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1.5;
      ctx.shadowBlur  = 8;
      ctx.shadowColor = col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur    = 0;
      ctx.fillStyle     = '#111';
      ctx.font          = 'bold 8px system-ui';
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'middle';
      ctx.fillText(POWERUP_ICONS[p.type] || '?', p.x, p.y);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }
  }

  // ── Drawing: active powerup pills ─────────────────────────────────────────────

  function drawActivePowerupOverlay() {
    if (activePowerups.size === 0) return;
    let px = 12;
    const py = H - 26;
    for (const [type, data] of activePowerups) {
      const col = POWERUP_COLORS[type] || '#fff';
      ctx.globalAlpha = 0.85;
      ctx.fillStyle   = col;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px, py, 30, 14, 4);
      else ctx.rect(px, py, 30, 14);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle   = '#111';
      ctx.font        = 'bold 8px system-ui';
      ctx.textAlign   = 'left';
      ctx.fillText(POWERUP_ICONS[type] || type, px + 3, py + 10);
      if (data.timer !== Infinity) {
        const ratio = clamp(data.timer / POWERUP_DURATION, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(px, py + 11, 30, 3);
        ctx.fillStyle = col;
        ctx.fillRect(px, py + 11, 30 * ratio, 3);
      }
      px += 34;
    }
  }

  // ── Drawing: combo overlay ────────────────────────────────────────────────────

  function drawComboOverlay() {
    if (streak < 3) return;
    const alpha = Math.min(1, streakTimer / 1.8);
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = '#f7c948';
    ctx.shadowBlur  = 8;
    ctx.shadowColor = '#f7c948';
    ctx.font        = 'bold 14px system-ui';
    ctx.textAlign   = 'right';
    ctx.fillText('COMBO \xd7' + streak, W - 10, 22);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  // ── Drawing: wave intro ───────────────────────────────────────────────────────

  function drawWaveIntro() {
    if (waveIntroTimer <= 0) return;
    const fade  = Math.min(1, waveIntroTimer / 0.4, (WAVE_INTRO_DURATION - waveIntroTimer) / 0.4 + 0.1);
    const isBoss = wave % WAVE_BOSS === 0;
    const label  = isBoss ? 'BOSS WAVE ' + wave : 'WAVE ' + wave;
    const color  = isBoss ? '#ff4444' : '#3fb950';
    ctx.globalAlpha = clamp(fade, 0, 1);
    ctx.font        = 'bold 36px system-ui';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = color;
    ctx.shadowBlur  = 20;
    ctx.shadowColor = color;
    ctx.fillText(label, W / 2, H / 2 - 10);
    ctx.shadowBlur = 0;
    if (isBoss) {
      ctx.fillStyle = '#ff8888';
      ctx.font      = '18px system-ui';
      ctx.fillText('Incoming threat!', W / 2, H / 2 + 22);
    }
    ctx.globalAlpha = 1;
  }

  // ── Main draw ─────────────────────────────────────────────────────────────────

  function draw() {
    ctx.save();
    if (shakeTime > 0 && shakeIntensity > 0) {
      ctx.translate((Math.random() * 2 - 1) * shakeIntensity, (Math.random() * 2 - 1) * shakeIntensity);
    }
    drawBackground();

    if (!running && !gameOver) {
      drawEffects();
      ctx.fillStyle = '#3fb950';
      ctx.font      = 'bold 28px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Press Start', W / 2, H / 2);
      ctx.restore();
      return;
    }
    if (paused) {
      ctx.fillStyle = '#f7c948';
      ctx.font      = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W / 2, H / 2);
      ctx.restore();
      return;
    }
    if (gameOver) {
      drawEffects();
      ctx.fillStyle = '#ff4fd1';
      ctx.font      = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 20);
      ctx.fillStyle = '#f7c948';
      ctx.font      = 'bold 20px system-ui';
      ctx.fillText('Score: ' + score, W / 2, H / 2 + 20);
      ctx.fillStyle = '#8b949e';
      ctx.font      = '16px system-ui';
      ctx.fillText('Press Start to play again', W / 2, H / 2 + 55);
      ctx.restore();
      return;
    }

    drawBunkers();
    drawShip(player.x, player.y, player.w, player.h);
    for (const inv of invaders) { if (inv.alive) drawInvader(inv); }
    if (boss) drawBoss(boss);

    // Player bullets with glow
    ctx.save();
    ctx.shadowBlur  = 8;
    ctx.shadowColor = '#2ec5ff';
    ctx.fillStyle   = '#2ec5ff';
    for (const b of bullets) ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.shadowBlur  = 0;
    ctx.restore();

    // Enemy bullets with glow
    ctx.save();
    ctx.shadowBlur  = 6;
    ctx.shadowColor = '#ff4fd1';
    ctx.fillStyle   = '#ff4fd1';
    for (const b of invBullets) ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.shadowBlur  = 0;
    ctx.restore();

    drawPowerupItems();
    drawEffects();
    drawWaveIntro();
    drawComboOverlay();
    drawActivePowerupOverlay();

    // Lives counter (right side)
    ctx.fillStyle = '#2ec5ff';
    ctx.font      = '16px system-ui';
    ctx.textAlign = 'right';
    for (let i = 0; i < lives; i++) ctx.fillText('\u25b2', W - 10 - i * 22, H - 8);

    ctx.restore();
  }

  // ── Game loop ─────────────────────────────────────────────────────────────────

  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

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
    running  = true;
    paused   = false;
    gameOver = false;
    startWave();
    lastTime = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function pause() {
    if (running && !gameOver) { paused = true; stopAllSounds(); }
  }

  function resume() {
    if (running && paused && !gameOver) paused = false;
  }

  function reset() {
    if (raf) cancelAnimationFrame(raf);
    stopAllSounds();
    resetGame();
    lastTime = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    stopAllSounds();
    if (window.__invadersOverlayStateHook === getOverlayState) delete window.__invadersOverlayStateHook;
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
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
