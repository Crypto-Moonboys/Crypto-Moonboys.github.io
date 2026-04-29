/**
 * bootstrap.js — Breakout Bullrun roguelite orchestrator.
 *
 * Architecture follows the Invaders 3008 pattern:
 *  - BaseGame (single rAF loop, no duplicates)
 *  - legacyBootstrap adapter format
 *  - All GLOBAL arcade systems hooked in (director, event, mutation,
 *    boss, risk, meta, feedback/upgrade)
 *  - submitScore ONLY on game over
 */

import { ArcadeSync }     from '/js/arcade-sync.js';
import { submitScore }    from '/js/leaderboard-client.js';
import { BREAKOUT_BULLRUN_CONFIG } from './config.js';
import {
  createGameAdapter, registerGameAdapter, bootstrapFromAdapter,
} from '/js/arcade/engine/game-adapter.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';
import { BaseGame } from '/js/arcade/engine/BaseGame.js';

import {
  B_W, B_H, B_PAD, B_COLS,
  buildWaveBricks, tickBricks, applyBrickMutations, hitBrick,
  BRICK_COLORS,
} from './brick-system.js';
import { createRenderer } from './render-system.js';

import {
  createScalingDirector, tickDirector,
  shouldFirePressureEvent, pickSurpriseEvent, getEventTier,
  updateIntensity, checkForcedChaos, getBossAggressionMult,
} from '/js/arcade/systems/event-system.js';

import {
  buildRunSummary, recordRunStats, checkMilestones, getDailyVariation,
} from './meta-system.js';

// ── Upgrade catalogue ─────────────────────────────────────────────────────────

const BB_UPGRADE_DEFS = [
  { id: 'multiBall',    label: 'MULTI-BALL',    icon: '⚪⚪', desc: '+1 extra ball',            maxLevel: 3, rarity: 'common'    },
  { id: 'paddleSize',   label: 'WIDE PADDLE',   icon: '↔',   desc: 'Paddle +20% wider',        maxLevel: 3, rarity: 'common'    },
  { id: 'speedControl', label: 'SPEED CTRL',    icon: '⏱',   desc: 'Hold Z to slow ball 0.6×', maxLevel: 1, rarity: 'common'    },
  { id: 'sticky',       label: 'STICKY PAD',    icon: '🧲',   desc: 'Catch ball, aim & release',maxLevel: 1, rarity: 'common'    },
  { id: 'laser',        label: 'LASER',         icon: '⚡',   desc: '[B] Shoot laser beams',     maxLevel: 1, rarity: 'common'    },
  { id: 'shieldFloor',  label: 'FLOOR SHIELD',  icon: '🛡',   desc: 'One extra ball save',       maxLevel: 2, rarity: 'rare'      },
  { id: 'scoreMult',    label: 'SCORE BOOST',   icon: '✨',   desc: '+25% score per level',      maxLevel: 4, rarity: 'common'    },
  { id: 'magnet',       label: 'MAGNET',        icon: '🧲',   desc: 'Ball drifts to paddle',     maxLevel: 1, rarity: 'rare'      },
  { id: 'explosive',    label: 'EXPLOSIVE BALL',icon: '💥',   desc: 'Ball explodes bricks nearby',maxLevel: 1, rarity: 'epic'     },
  { id: 'piercing',     label: 'PIERCING BALL', icon: '⬆',   desc: 'Ball ignores shields',      maxLevel: 1, rarity: 'rare'      },
  { id: 'fireball',     label: 'FIREBALL',      icon: '🔥',   desc: 'Ball gains fire trail',     maxLevel: 1, rarity: 'epic'      },
  { id: 'revive',       label: 'REVIVE',        icon: '❤️',   desc: 'Auto-revive once per run',  maxLevel: 1, rarity: 'legendary' },
];

const RARITY_COLORS = { common: '#8b949e', rare: '#2ec5ff', epic: '#bc8cff', legendary: '#f7c948' };

function makeUpgrades() {
  const u = {};
  for (const d of BB_UPGRADE_DEFS) u[d.id] = 0;
  return u;
}

function pickUpgradeChoices(upgrades, wave) {
  const w = wave || 1;
  const allowedRarities = w >= 21 ? ['common','rare','epic','legendary']
                        : w >= 11 ? ['common','rare','epic']
                        : w >= 5  ? ['common','rare']
                        :           ['common'];
  const pool = BB_UPGRADE_DEFS.filter(
    (d) => upgrades[d.id] < d.maxLevel && allowedRarities.includes(d.rarity)
  );
  const effective = pool.length >= 3 ? pool : BB_UPGRADE_DEFS.filter((d) => upgrades[d.id] < d.maxLevel);
  const src = (effective.length >= 3 ? effective : BB_UPGRADE_DEFS).slice();
  for (let i = src.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [src[i], src[j]] = [src[j], src[i]];
  }
  return src.slice(0, 3).map((d) => ({ ...d, color: RARITY_COLORS[d.rarity] || '#aaa' }));
}

function applyUpgrade(id, upgrades) {
  const def = BB_UPGRADE_DEFS.find((d) => d.id === id);
  if (!def) return false;
  if (upgrades[id] >= def.maxLevel) return false;
  upgrades[id] = (upgrades[id] || 0) + 1;
  return true;
}

function getScoreMult(upgrades) { return 1 + (upgrades.scoreMult || 0) * 0.25; }

// ── Boss definitions ──────────────────────────────────────────────────────────

const BOSS_DEFS = [
  {
    type: 'brickTitan',
    label: 'BRICK TITAN',
    warning: 'UNSTOPPABLE WALL INCOMING',
    color: '#888',
    w: 0.9,   // fraction of W
    h: 48,
    baseHp: 18,
    speedBase: 50,
    bulletInterval: 2.2,
    bulletSpeed: 200,
    bulletPattern: 'spread3',
  },
  {
    type: 'laserCore',
    label: 'LASER CORE',
    warning: 'TARGET LOCKED — LASER CHARGING',
    color: '#ff2222',
    w: 0.4,
    h: 40,
    baseHp: 12,
    speedBase: 120,
    bulletInterval: 1.8,
    bulletSpeed: 280,
    bulletPattern: 'aimed',
  },
  {
    type: 'shieldMatrix',
    label: 'SHIELD MATRIX',
    warning: 'SHIELDS UP — BREAK THE MATRIX',
    color: '#2ec5ff',
    w: 0.55,
    h: 44,
    baseHp: 14,
    speedBase: 70,
    bulletInterval: 2.8,
    bulletSpeed: 180,
    bulletPattern: 'random',
    shieldRegenInterval: 8,
  },
  {
    type: 'chaosGrid',
    label: 'CHAOS GRID',
    warning: 'REALITY CORRUPTED',
    color: '#cc00ff',
    w: 0.7,
    h: 42,
    baseHp: 16,
    speedBase: 90,
    bulletInterval: 1.5,
    bulletSpeed: 240,
    bulletPattern: 'burst5',
  },
];

function getBossDef(wave) {
  return BOSS_DEFS[(Math.floor(wave / 5) - 1) % BOSS_DEFS.length];
}

function getBossPhase(boss) {
  const frac = boss.hp / boss.maxHp;
  return frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
}

function spawnBoss(def, wave, W) {
  const bw  = Math.round(def.w * W);
  const bx  = (W - bw) / 2;
  const hp  = def.baseHp + Math.floor(wave / 5) * 4;
  return {
    type:       def.type,
    x:          bx,
    y:          -def.h - 10,          // enters from top
    w:          bw,
    h:          def.h,
    hp,
    maxHp:      hp,
    hpDisplay:  hp,
    speed:      def.speedBase,
    dir:        1,
    hitTimer:   0,
    shootTimer: def.bulletInterval,
    shieldHp:   def.type === 'shieldMatrix' ? 3 : 0,
    shieldRegenTimer: def.shieldRegenInterval || 0,
    chargeTimer: def.type === 'laserCore' ? 3.5 : 0,
    entering:   true,
  };
}

// ── Hazard factory ────────────────────────────────────────────────────────────

function makeFallingRock(W) {
  return {
    type: 'fallingRock',
    x:    Math.random() * (W - 20) + 10,
    y:    -15,
    r:    8 + Math.random() * 8,
    vy:   120 + Math.random() * 80,
  };
}

function makeDrone(W) {
  return {
    type: 'drone',
    x:    Math.random() < 0.5 ? -20 : W + 20,
    y:    30 + Math.random() * 120,
    r:    10,
    vx:   (Math.random() < 0.5 ? 1 : -1) * (60 + Math.random() * 40),
    vy:   (Math.random() - 0.5) * 30,
    hp:   2,
  };
}

function makeLaserTurret(W) {
  return {
    type: 'laserTurret',
    x:    Math.random() * (W - 40) + 20,
    y:    10,
    r:    10,
    hp:   1,
    shootTimer: 2.5 + Math.random() * 2,
  };
}

function makeEnemyPaddle(W, H) {
  return {
    type: 'enemyPaddle',
    x:    W / 2,
    y:    H * 0.35,
    hw:   40,
    hh:   10,
    speed: 80,
    dir:  1,
  };
}

// ── Breakout event definitions (pressure-driven) ──────────────────────────────

const BB_EVENTS = [
  {
    id: 'brickRain',
    label: 'BRICK RAIN',
    color: '#bc8cff',
    tier: 'tier1',
    minWave: 1,
    duration: 8,
    execute(state) {
      const totalW = B_COLS * (B_W + B_PAD) - B_PAD;
      const offX   = Math.floor((state.W - totalW) / 2);
      for (let col = 0; col < B_COLS; col++) {
        if (Math.random() < 0.6) {
          const b = {
            x: offX + col * (B_W + B_PAD),
            y: -B_H - Math.random() * 60,
            w: B_W, h: B_H,
            col, row: -1, type: 'normal',
            hp: 1, maxHp: 1, alive: true,
            vx: 0, vy: 60 + Math.random() * 40,
            shieldHp: 0, hitTimer: 0, score: 10,
            spawnTimer: 0,
          };
          state.bricks.push(b);
        }
      }
    },
    tickActive(state, dt) {
      for (const b of state.bricks) {
        if (b.vy && b.vy > 0 && b.alive) {
          b.y += b.vy * dt;
          if (b.y > 200) b.vy = 0; // settle into position
        }
      }
    },
    remove(state) {},
  },
  {
    id: 'laserSweep',
    label: 'LASER SWEEP',
    color: '#ff2222',
    tier: 'tier3',
    minWave: 3,
    duration: 4,
    execute(state) {
      const positions = [state.W * 0.25, state.W * 0.5, state.W * 0.75];
      for (const px of positions) {
        state.laserWarnings.push({ x: px, chargeTimer: 1.2, maxCharge: 1.2, fired: false });
      }
    },
    tickActive(state, dt) {},
    remove(state) {},
  },
  {
    id: 'gravityShift',
    label: 'GRAVITY SHIFT',
    color: '#f7c948',
    tier: 'tier2',
    minWave: 2,
    duration: 6,
    execute(state) {
      state.eventData.gravity = 0.08; // downward pull on balls
      if (typeof state.addBanner === 'function') state.addBanner('⚠ GRAVITY SHIFT', '#f7c948');
    },
    tickActive(state, dt) {
      if (!state.eventData.gravity) return;
      for (const ball of state.balls) {
        ball.vy += state.eventData.gravity * 60 * dt;
      }
    },
    remove(state) { state.eventData.gravity = 0; },
  },
  {
    id: 'reverseControls',
    label: 'REVERSE CONTROLS',
    color: '#ff6b2b',
    tier: 'tier2',
    minWave: 3,
    duration: 7,
    execute(state) {
      state.eventData.reversed = true;
      if (typeof state.addBanner === 'function') state.addBanner('⚠ CONTROLS REVERSED', '#ff6b2b');
    },
    tickActive(state, dt) {},
    remove(state) { state.eventData.reversed = false; },
  },
  {
    id: 'goldBurstBrick',
    label: 'GOLD RUSH',
    color: '#ffd700',
    tier: 'tier1',
    minWave: 1,
    duration: 0,
    execute(state) {
      const living = state.bricks.filter((b) => b.alive && b.type === 'normal');
      const picks  = Math.min(4, living.length);
      for (let i = 0; i < picks; i++) {
        const idx  = Math.floor(Math.random() * living.length);
        living[idx].type = 'golden';
      }
      if (typeof state.addBanner === 'function') state.addBanner('💰 GOLD RUSH!', '#ffd700');
    },
    tickActive(state, dt) {},
    remove(state) {},
  },
  {
    id: 'chaosWave',
    label: 'CHAOS WAVE',
    color: '#cc00ff',
    tier: 'tier3',
    minWave: 4,
    duration: 10,
    execute(state) {
      for (const ball of state.balls) {
        const angle = Math.random() * Math.PI * 2;
        const spd   = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) || 320;
        ball.vx = Math.cos(angle) * spd;
        ball.vy = Math.sin(angle) * spd;
        ball.vy = Math.abs(ball.vy) > 30 ? ball.vy : (ball.vy < 0 ? -120 : 120);
      }
    },
    tickActive(state, dt) {},
    remove(state) {},
  },
];

function pickBBSurpriseEvent(wave) {
  const eligible = BB_EVENTS.filter((e) => (e.minWave || 1) <= wave);
  if (!eligible.length) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

// ── Register adapter ──────────────────────────────────────────────────────────

export const BREAKOUT_BULLRUN_ADAPTER = createGameAdapter({
  id: BREAKOUT_BULLRUN_CONFIG.id,
  name: BREAKOUT_BULLRUN_CONFIG.label,
  systems: {
    upgrade: true, director: true, event: true, mutation: true,
    boss: true, risk: true, meta: true, feedback: true,
  },
  legacyBootstrap: function (root) {
    return createLegacyBootstrapBreakoutBullrun(root);
  },
});

registerGameAdapter(BREAKOUT_BULLRUN_CONFIG, BREAKOUT_BULLRUN_ADAPTER, bootstrapBreakoutBullrun);

export function bootstrapBreakoutBullrun(root) {
  return bootstrapFromAdapter(root, BREAKOUT_BULLRUN_ADAPTER);
}

// ── Main implementation ───────────────────────────────────────────────────────

function createLegacyBootstrapBreakoutBullrun(root) {
  const GAME_ID = BREAKOUT_BULLRUN_CONFIG.id;

  const canvas = document.getElementById('brkCanvas');
  if (!canvas) {
    console.error('[breakout-bullrun] #brkCanvas not found');
    return null;
  }
  const ctx = canvas.getContext('2d');

  // ── Responsive canvas sizing ─────────────────────────────────────────────

  function resizeCanvas() {
    const stage = canvas.parentElement || document.body;
    const maxW  = Math.min(stage.clientWidth - 16, 620);
    const maxH  = Math.min(window.innerHeight - 160, 860);
    const ratio = 7 / 9;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('fullscreenchange', resizeCanvas);

  const W = canvas.width;   // logical resolution stays fixed
  const H = canvas.height;

  // ── Engine ────────────────────────────────────────────────────────────────

  const engine = new BaseGame({ context: { adapter: { id: GAME_ID } } });

  // ── HUD elements ──────────────────────────────────────────────────────────

  const scoreEl = document.getElementById('score');
  const bestEl  = document.getElementById('best');
  const levelEl = document.getElementById('level');
  const comboEl = document.getElementById('combo');

  // ── Constants ─────────────────────────────────────────────────────────────

  const BALL_R          = 7;
  const BASE_BALL_SPD   = 300;
  const PAD_BASE_W      = 90;
  const PAD_H           = 12;
  const BRICK_TOP_OFFSET = 52;
  const WAVE_INTRO_DUR   = 2.0;
  const LASER_COOLDOWN   = 4.0;
  const MAX_BALLS        = 5;
  const HAZARD_SPAWN_WAVE = 3;

  // ── Game state ────────────────────────────────────────────────────────────

  let score    = 0;
  let wave     = 0;
  let combo    = 1;
  let comboTimer = 0;
  let lives    = 3;
  let running  = false;
  let paused   = false;
  let gameOver = false;
  let elapsed  = 0;
  let best     = ArcadeSync.getHighScore(GAME_ID);

  let bricks        = [];
  let balls         = [];
  let launched      = false;
  let stickyBall    = null;   // ball held on paddle (sticky upgrade)
  let laserBullets  = [];     // player laser shots
  let laserCooldown = 0;
  let shieldFloorHp = 0;
  let particles     = [];
  let floatingTexts = [];
  let hitFlashes    = [];
  let bossBullets   = [];
  let hazards       = [];
  let laserWarnings = [];

  let boss           = null;
  let bossEntering   = false;
  let bossWarned     = false;

  let upgradePhase   = false;
  let upgradeChoices = [];
  let upgrades       = makeUpgrades();

  let warningBanner  = null;
  let eventBanner    = null;
  let activeEvent    = null;
  let eventData      = {};
  let eventTimer     = 0;

  let director              = createScalingDirector();
  let runStats              = { bossesDefeated: 0, highestIntensity: 0 };
  let runSummary            = null;
  let milestoneToasts       = [];
  let intensityPrevBand     = 'calm';
  const dailyVariation      = getDailyVariation();
  let screenFlashTimer      = 0;
  let shakeTime             = 0;
  let shakeIntensity        = 0;
  let reviveUsed            = false;
  let hazardSpawnTimer      = 5;
  let bossWaveThisRound     = false;

  // Paddle state (with inertia)
  const paddle = {
    x:      W / 2 - PAD_BASE_W / 2,
    y:      H - 40,
    w:      PAD_BASE_W,
    h:      PAD_H,
    vx:     0,
    targetVx: 0,
  };

  const renderer = createRenderer(ctx, W, H);
  const keys     = engine.keys;

  // ── Utilities ─────────────────────────────────────────────────────────────

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

  function triggerHudFx(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = score;
    if (bestEl)  bestEl.textContent  = best;
    if (levelEl) levelEl.textContent = wave || '—';
    if (comboEl) comboEl.textContent = combo > 1 ? '×' + combo : '×1';
  }

  function setBestMaybe() {
    if (score > best) { best = score; ArcadeSync.setHighScore(GAME_ID, best); }
  }

  function addScore(pts, x, y, color) {
    if (!pts) return;
    score += pts;
    setBestMaybe();
    updateHud();
    triggerHudFx(scoreEl ? scoreEl.closest('.stat') : null, 'pulse', 180);
    if (typeof x === 'number') {
      floatingTexts.push({
        x, y, text: '+' + pts, life: 0.9, maxLife: 0.9,
        color: color || '#f7c948', size: 12,
      });
    }
  }

  function screenShake(intensity, duration) {
    shakeIntensity = Math.max(shakeIntensity, intensity);
    shakeTime      = Math.max(shakeTime, duration);
  }

  function addBanner(text, color) {
    warningBanner = { text, color: color || '#f7c948', timer: 2.0, maxTimer: 2.0 };
  }

  function spawnParticle(x, y, color, count) {
    count = count || 6;
    for (let i = 0; i < count; i++) {
      const a   = Math.random() * Math.PI * 2;
      const spd = rand(40, 160);
      particles.push({
        x, y,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        r: rand(1.5, 3.5), color: color || '#fff',
        life: rand(0.25, 0.5), maxLife: rand(0.25, 0.5),
      });
    }
    hitFlashes.push({ x, y, r: 8, life: 0.12, maxLife: 0.12, color: color || '#fff' });
  }

  function playSfx(type) {
    if (isMuted()) return;
    const map = {
      paddle:       'brk-paddle',
      brickBreak:   'brk-break',
      explosion:    'brk-explosion',
      bossIntro:    'brk-boss-intro',
      waveClear:    'brk-wave-clear',
      upgrade:      'brk-upgrade',
      gameOver:     'brk-game-over',
      event:        'brk-event',
      shield:       'brk-shield',
    };
    const id = map[type];
    if (id) playSound(id);
  }

  // ── Paddle sizing ─────────────────────────────────────────────────────────

  function computePaddleWidth() {
    return PAD_BASE_W * (1 + (upgrades.paddleSize || 0) * 0.22);
  }

  // ── Ball factory ──────────────────────────────────────────────────────────

  function makeBall(x, y, angle) {
    const spd = BASE_BALL_SPD * (1 + wave * 0.025);
    return {
      x, y,
      vx: Math.sin(angle) * spd,
      vy: -Math.abs(Math.cos(angle) * spd),
      r:  BALL_R,
      trail: [],
    };
  }

  function launchBall() {
    if (launched || balls.length > 0) return;
    const cx    = paddle.x + paddle.w / 2;
    const angle = rand(-0.4, 0.4);
    balls.push(makeBall(cx, paddle.y - BALL_R - 2, angle));
    launched = true;
    stickyBall = null;
  }

  function spawnExtraBall() {
    if (balls.length >= MAX_BALLS) return;
    const cx    = paddle.x + paddle.w / 2;
    const angle = rand(-0.5, 0.5);
    balls.push(makeBall(cx, paddle.y - BALL_R - 2, angle));
  }

  // ── Wave management ───────────────────────────────────────────────────────

  function startWave() {
    wave++;
    launched       = false;
    stickyBall     = null;
    balls          = [];
    laserBullets   = [];
    laserCooldown  = 0;
    hazards        = [];
    laserWarnings  = [];
    bossBullets    = [];
    boss           = null;
    bossEntering   = false;
    bossWarned     = false;
    bossWaveThisRound = false;
    activeEvent    = null;
    eventData      = {};
    eventTimer     = 0;
    warningBanner  = null;
    eventBanner    = null;
    shieldFloorHp  = upgrades.shieldFloor || 0;
    combo          = 1;
    comboTimer     = 0;

    const isBossWave = (wave % 5 === 0);

    if (isBossWave) {
      bossWaveThisRound = true;
      const def  = getBossDef(wave);
      boss       = spawnBoss(def, wave, W);
      warningBanner = { text: def.warning, color: def.color, timer: 2.5, maxTimer: 2.5 };
      // Generate sparse bricks behind the boss
      bricks = buildWaveBricks(wave, W, BRICK_TOP_OFFSET + def.h + 20, upgrades, director);
    } else {
      bricks = buildWaveBricks(wave, W, BRICK_TOP_OFFSET, upgrades, director);
      if (wave >= 10) applyBrickMutations(bricks, wave);
    }

    // Hazard spawn timer reset
    hazardSpawnTimer = Math.max(5, 12 - wave * 0.4);

    updateHud();

    // Place ball on paddle (idle until Space is pressed)
    const cx = paddle.x + paddle.w / 2;
    stickyBall = { x: cx, y: paddle.y - BALL_R - 1 };
  }

  // ── Hazard spawning ───────────────────────────────────────────────────────

  function spawnHazard() {
    if (wave < HAZARD_SPAWN_WAVE) return;
    const r = Math.random();
    if (r < 0.4) {
      hazards.push(makeFallingRock(W));
    } else if (r < 0.65 && wave >= 5) {
      hazards.push(makeDrone(W));
    } else if (r < 0.82 && wave >= 6) {
      hazards.push(makeLaserTurret(W));
    } else if (wave >= 8) {
      hazards.push(makeEnemyPaddle(W, H));
    }
  }

  // ── Boss bullet spawning ──────────────────────────────────────────────────

  function spawnBossBullets(bossRef) {
    const def = BOSS_DEFS.find((d) => d.type === bossRef.type);
    if (!def) return;
    const cx = bossRef.x + bossRef.w / 2;
    const cy = bossRef.y + bossRef.h;
    const phase = getBossPhase(bossRef);
    const spd = (def.bulletSpeed || 220) * (phase >= 2 ? 1.25 : 1) * (phase === 3 ? 1.5 : 1)
              * getBossAggressionMult(director);

    const pattern = def.bulletPattern;

    if (pattern === 'spread3') {
      const angles = phase === 1 ? [0] : phase === 2 ? [-0.3, 0, 0.3] : [-0.5, -0.25, 0, 0.25, 0.5];
      for (const a of angles) {
        bossBullets.push({ x: cx, y: cy, vx: Math.sin(a) * spd, vy: spd * Math.cos(a) + 60, r: 5 });
      }
    } else if (pattern === 'aimed') {
      const tx = paddle.x + paddle.w / 2;
      const ty = paddle.y;
      const d  = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2) || 1;
      const count = phase === 1 ? 1 : phase === 2 ? 2 : 3;
      for (let i = 0; i < count; i++) {
        const spread = (i - (count - 1) / 2) * 0.2;
        bossBullets.push({
          x: cx, y: cy,
          vx: ((tx - cx) / d + spread) * spd,
          vy: ((ty - cy) / d) * spd,
          r: 5,
        });
      }
    } else if (pattern === 'random') {
      const count = phase + 1;
      for (let i = 0; i < count; i++) {
        const a = rand(-0.8, 0.8);
        bossBullets.push({ x: cx, y: cy, vx: Math.sin(a) * spd, vy: spd * 0.7 + 40, r: 5 });
      }
    } else if (pattern === 'burst5') {
      const count = phase === 1 ? 5 : phase === 2 ? 7 : 9;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        bossBullets.push({ x: cx, y: cy, vx: Math.cos(a) * spd * 0.8, vy: Math.sin(a) * spd * 0.8, r: 5 });
      }
    }

    playSfx(phase === 3 ? 'explosion' : 'event');
  }

  // ── Ball–paddle collision ─────────────────────────────────────────────────

  function handlePaddleCollision(ball) {
    const px = paddle.x;
    const py = paddle.y;
    const pw = paddle.w;

    if (ball.y + ball.r < py) return;
    if (ball.y - ball.r > py + paddle.h) return;
    if (ball.x + ball.r < px || ball.x - ball.r > px + pw) return;

    // Sticky: catch ball
    if (upgrades.sticky > 0 && !stickyBall) {
      stickyBall = ball;
      balls = balls.filter((b) => b !== ball);
      return;
    }

    // Hit angle based on position on paddle
    const rel   = (ball.x - (px + pw / 2)) / (pw / 2);
    const angle = rel * (Math.PI / 3.2);
    const spd   = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    const fastSpd = BASE_BALL_SPD * (1 + wave * 0.025);
    const finalSpd = clamp(spd, fastSpd * 0.85, fastSpd * 1.3);

    // Impart paddle velocity
    ball.vx = Math.sin(angle) * finalSpd + paddle.vx * 0.3;
    ball.vy = -Math.abs(Math.cos(angle) * finalSpd);

    // Speed control upgrade: slow ball while Z is held
    if (upgrades.speedControl > 0 && keys['z']) {
      ball.vx *= 0.6;
      ball.vy *= 0.6;
    }

    // Magnet drift
    if (upgrades.magnet > 0) {
      const cx = paddle.x + pw / 2;
      ball.vx = ball.vx * 0.7 + (cx - ball.x) * 0.5;
    }

    ball.y = py - ball.r - 1;
    spawnParticle(ball.x, py, '#f7ab1a', 5);
    playSfx('paddle');
    screenShake(1.5, 0.06);
  }

  // ── Ball–brick collision ──────────────────────────────────────────────────

  function handleBrickCollisions(ball) {
    for (const b of bricks) {
      if (!b.alive) continue;

      const nearX = clamp(ball.x, b.x, b.x + b.w);
      const nearY = clamp(ball.y, b.y, b.y + b.h);
      const dx    = ball.x - nearX;
      const dy    = ball.y - nearY;

      if (dx * dx + dy * dy > ball.r * ball.r) continue;

      const { destroyed, reflected } = hitBrick(
        b, ball, upgrades,
        spawnParticle, addScore, screenShake, addBanner,
        bricks, combo,
      );

      if (destroyed) {
        combo++;
        comboTimer = 3.0;
        updateHud();
        // Check for cursed brick hazard trigger
        if (b.type === 'cursed') {
          hazards.push(makeFallingRock(W));
          hazards.push(makeFallingRock(W));
        }
        // Spawner: on death it spawns a rock
        if (b.type === 'spawner') {
          hazards.push(makeFallingRock(W));
        }
        playSfx('brickBreak');
      }

      if (reflected) {
        // Reflect off appropriate axis
        const overlapX = Math.min(Math.abs(ball.x - b.x), Math.abs(ball.x - (b.x + b.w)));
        const overlapY = Math.min(Math.abs(ball.y - b.y), Math.abs(ball.y - (b.y + b.h)));
        if (overlapX < overlapY) {
          ball.vx = -ball.vx;
        } else {
          ball.vy = -ball.vy;
        }
        // Push ball out of brick
        if (ball.vy < 0) ball.y = b.y - ball.r - 0.5;
        else             ball.y = b.y + b.h + ball.r + 0.5;
      }

      if (reflected) break; // one brick per frame to avoid tunnelling
    }
  }

  // ── Ball–boss collision ───────────────────────────────────────────────────

  function handleBossCollision(ball) {
    if (!boss) return;

    const nearX = clamp(ball.x, boss.x, boss.x + boss.w);
    const nearY = clamp(ball.y, boss.y, boss.y + boss.h);
    const dx    = ball.x - nearX;
    const dy    = ball.y - nearY;

    if (dx * dx + dy * dy > ball.r * ball.r) return;

    // Shield Matrix: absorbs hits
    if (boss.shieldHp > 0) {
      boss.shieldHp--;
      playSfx('shield');
      spawnParticle(ball.x, ball.y, '#2ec5ff', 8);
      ball.vy = -ball.vy;
      return;
    }

    boss.hp -= 1;
    boss.hitTimer = 0.15;
    boss.hpDisplay += (boss.hp - boss.hpDisplay) * 0.8;
    addScore(40 * wave, boss.x + boss.w / 2, boss.y, '#ff9b9b');
    spawnParticle(ball.x, ball.y, BOSS_DEFS.find((d) => d.type === boss.type)?.color || '#ff4444', 8);
    screenShake(3, 0.12);
    playSfx('shield');

    // Reflect
    const overlapX = Math.min(Math.abs(ball.x - boss.x), Math.abs(ball.x - (boss.x + boss.w)));
    const overlapY = Math.min(Math.abs(ball.y - boss.y), Math.abs(ball.y - (boss.y + boss.h)));
    if (overlapX < overlapY) ball.vx = -ball.vx;
    else                     ball.vy = -ball.vy;

    if (boss.hp <= 0) {
      addScore(600 * wave, boss.x + boss.w / 2, boss.y, '#ff4fd1');
      spawnParticle(boss.x + boss.w / 2, boss.y + boss.h / 2, '#ff4444', 30);
      screenShake(12, 0.4);
      playSfx('explosion');
      runStats.bossesDefeated++;
      boss = null;
      completeWave();
    }
  }

  // ── Wave complete ─────────────────────────────────────────────────────────

  function completeWave() {
    addScore(200 + wave * 50, W / 2, H / 2, '#3fb950');
    playSfx('waveClear');
    screenShake(5, 0.2);

    updateIntensity(director, 0, { waveClear: true, lives });
    director.pressure = Math.max(0, (director.pressure || 0) - 40);

    upgradeChoices = pickUpgradeChoices(upgrades, wave);
    upgradePhase   = 'picking';
    updateHud();
  }

  // ── Game over ─────────────────────────────────────────────────────────────

  async function onGameOver() {
    if (gameOver) return;
    running  = false;
    gameOver = true;
    stopAllSounds();
    setBestMaybe();
    updateHud();
    playSfx('gameOver');

    const survivalTime = elapsed;
    recordRunStats({ score, wave, survival: survivalTime });
    const newMilestones = checkMilestones({
      wave,
      bossesDefeated:   runStats.bossesDefeated,
      highestIntensity: runStats.highestIntensity,
      score,
      survival:         survivalTime,
    });
    runSummary = buildRunSummary({
      score, wave,
      bossesDefeated:   runStats.bossesDefeated,
      upgradeCount:     Object.values(upgrades).reduce((a, b) => a + (Number(b) || 0), 0),
      highestIntensity: runStats.highestIntensity,
      survival:         survivalTime,
    });
    for (const text of newMilestones) {
      milestoneToasts.push({ text, timer: 6.0 });
    }

    if (score > 0) {
      const playerName = window.MOONBOYS_IDENTITY?.getTelegramName?.() || ArcadeSync.getPlayer();
      try {
        await submitScore(playerName, score, GAME_ID);
      } catch (_) {}
    }

    draw();
    if (window.showGameOverModal) window.showGameOverModal(score);
  }

  // ── Effects tick ──────────────────────────────────────────────────────────

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.96; p.vy *= 0.96;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const t = floatingTexts[i];
      t.life -= dt; t.y -= 28 * dt;
      if (t.life <= 0) floatingTexts.splice(i, 1);
    }
    for (let i = hitFlashes.length - 1; i >= 0; i--) {
      const f = hitFlashes[i];
      f.life -= dt;
      if (f.life <= 0) hitFlashes.splice(i, 1);
    }
    if (shakeTime > 0) {
      shakeTime -= dt;
      shakeIntensity *= 0.88;
      if (shakeTime <= 0) { shakeTime = 0; shakeIntensity = 0; }
    }
    if (screenFlashTimer > 0) screenFlashTimer -= dt;
    for (let ti = milestoneToasts.length - 1; ti >= 0; ti--) {
      milestoneToasts[ti].timer -= dt;
      if (milestoneToasts[ti].timer <= 0) milestoneToasts.splice(ti, 1);
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  function update(dt) {
    if (!running || gameOver) { updateEffects(dt); return; }
    if (paused) { updateEffects(dt); return; }

    if (upgradePhase === 'picking') { updateEffects(dt); return; }

    elapsed += dt;

    // ── Scaling director ────────────────────────────────────────────────────

    tickDirector(director, dt, score, wave, lives, upgrades, !!activeEvent, dailyVariation.eventRateMult || 1);

    // ── Forced chaos event ──────────────────────────────────────────────────

    if (!activeEvent && checkForcedChaos(director)) {
      const ev = pickBBSurpriseEvent(wave);
      if (ev) {
        eventData = {};
        ev.execute({ bricks, balls, laserWarnings, W, H, eventData, addBanner });
        eventBanner = { text: '⚡ CHAOS: ' + ev.label, color: '#ff0055', timer: 2.5 };
        playSfx('event');
        director._eventCooldown = 30;
        director.pressure       = 0;
        // Only track timed events; instant (duration=0) events are fire-and-forget.
        if ((ev.duration || 0) > 0) {
          activeEvent = ev;
          eventTimer  = ev.duration;
        }
      }
    }

    // ── Pressure event trigger ──────────────────────────────────────────────

    if (!activeEvent && shouldFirePressureEvent(director)) {
      const ev = pickBBSurpriseEvent(wave);
      if (ev) {
        eventData = {};
        ev.execute({ bricks, balls, laserWarnings, W, H, eventData, addBanner });
        eventBanner = { text: '⚠ ' + ev.label, color: ev.color, timer: 2.5 };
        playSfx('event');
        director._eventCooldown = ev.cooldown || 30;
        director.pressure       = 0;
        // Only track timed events; instant (duration=0) events are fire-and-forget.
        if ((ev.duration || 0) > 0) {
          activeEvent = ev;
          eventTimer  = ev.duration;
        }
      } else {
        director.pressure = 50;
      }
    }

    if (activeEvent) {
      if (eventTimer > 0) eventTimer -= dt;
      if (activeEvent.tickActive) activeEvent.tickActive({ bricks, balls, laserWarnings, W, H, eventData }, dt);
      if (eventTimer <= 0) {
        if (activeEvent.remove) activeEvent.remove({ bricks, balls, laserWarnings, W, H, eventData });
        activeEvent = null;
        eventTimer  = 0;
        eventData   = {};
      }
    }

    // ── Banner decay ────────────────────────────────────────────────────────

    if (warningBanner) { warningBanner.timer -= dt; if (warningBanner.timer <= 0) warningBanner = null; }
    if (eventBanner)   { eventBanner.timer   -= dt; if (eventBanner.timer   <= 0) eventBanner   = null; }

    // ── Combo timer ─────────────────────────────────────────────────────────

    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) { combo = 1; updateHud(); }
    }

    // ── Paddle movement (smooth with inertia) ───────────────────────────────

    const reversed = eventData.reversed || false;
    const leftKey  = reversed ? (keys.ArrowRight || keys.d) : (keys.ArrowLeft  || keys.a);
    const rightKey = reversed ? (keys.ArrowLeft  || keys.a) : (keys.ArrowRight || keys.d);

    paddle.w = computePaddleWidth();
    const PADDLE_SPEED = 380 + wave * 3;
    const ACCEL        = 14;

    paddle.targetVx = leftKey ? -PADDLE_SPEED : rightKey ? PADDLE_SPEED : 0;
    paddle.vx += (paddle.targetVx - paddle.vx) * Math.min(1, ACCEL * dt);
    paddle.x  += paddle.vx * dt;
    paddle.x   = clamp(paddle.x, 0, W - paddle.w);

    // ── Sticky ball position ────────────────────────────────────────────────

    if (stickyBall) {
      stickyBall.x = paddle.x + paddle.w / 2;
      stickyBall.y = paddle.y - BALL_R - 1;
    }

    // ── Ball–wall + movement ────────────────────────────────────────────────

    const speedMult = (upgrades.speedControl > 0 && keys['z']) ? 0.6 : 1;

    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];

      // Trail
      ball.trail = ball.trail || [];
      ball.trail.unshift({ x: ball.x, y: ball.y });
      if (ball.trail.length > 8) ball.trail.pop();

      ball.x += ball.vx * speedMult * dt;
      ball.y += ball.vy * speedMult * dt;

      // Wall collisions
      if (ball.x - ball.r < 0)     { ball.x  = ball.r;      ball.vx =  Math.abs(ball.vx); }
      if (ball.x + ball.r > W)     { ball.x  = W - ball.r;  ball.vx = -Math.abs(ball.vx); }
      if (ball.y - ball.r < 0)     { ball.y  = ball.r;      ball.vy =  Math.abs(ball.vy); }

      // Shield floor intercept
      if (ball.y + ball.r >= H && shieldFloorHp > 0) {
        ball.y  = H - ball.r - 1;
        ball.vy = -Math.abs(ball.vy);
        shieldFloorHp--;
        addBanner('🛡 FLOOR SHIELD ABSORBED!', '#3fb950');
        playSfx('shield');
        continue;
      }

      // Ball lost below paddle
      if (ball.y + ball.r > H + 20) {
        balls.splice(i, 1);
        spawnParticle(ball.x, H - 10, '#ff4444', 10);

        if (balls.length === 0 && !stickyBall) {
          lives--;
          triggerHudFx(levelEl ? levelEl.closest('.stat') : null, 'pulse', 200);
          updateHud();
          screenShake(6, 0.22);

          if (lives <= 0) {
            if (!reviveUsed && upgrades.revive > 0) {
              lives = 1;
              reviveUsed = true;
              addBanner('REVIVED!', '#3fb950');
              updateHud();
              // Respawn ball on paddle
              stickyBall = { x: paddle.x + paddle.w / 2, y: paddle.y - BALL_R - 1 };
              launched = false;
            } else {
              onGameOver();
              updateEffects(dt);
              return;
            }
          } else {
            // Respawn ball on paddle
            stickyBall = { x: paddle.x + paddle.w / 2, y: paddle.y - BALL_R - 1 };
            launched = false;
          }
        }
        continue;
      }

      // Paddle collision
      handlePaddleCollision(ball);

      // Brick collision
      handleBrickCollisions(ball);

      // Boss collision
      if (boss && !boss.entering) handleBossCollision(ball);
    }

    // ── Brick ticks (moving, spawner) ───────────────────────────────────────

    const newBricks = tickBricks(bricks, dt, W, wave);
    if (newBricks.length) bricks.push(...newBricks);

    // ── Boss logic ──────────────────────────────────────────────────────────

    if (boss) {
      if (!bossWarned) { bossWarned = true; playSfx('bossIntro'); }

      if (boss.entering) {
        boss.y += 90 * dt;
        if (boss.y >= 30) { boss.y = 30; boss.entering = false; boss.hpDisplay = boss.hp; }
      } else {
        const phase      = getBossPhase(boss);
        const speedMult2 = phase === 3 ? 1.6 : phase === 2 ? 1.25 : 1.0;
        boss.x += boss.speed * speedMult2 * boss.dir * dt;
        if (boss.x <= 0)              { boss.x = 0;              boss.dir =  1; }
        if (boss.x + boss.w >= W)     { boss.x = W - boss.w;     boss.dir = -1; }

        boss.hpDisplay += (boss.hp - boss.hpDisplay) * Math.min(1, dt * 12);
        if (boss.hitTimer > 0) boss.hitTimer -= dt;

        // Shield Matrix: regen
        if (boss.type === 'shieldMatrix' && boss.shieldHp === 0) {
          boss.shieldRegenTimer -= dt;
          if (boss.shieldRegenTimer <= 0) {
            boss.shieldHp = Math.min(3, phase === 3 ? 5 : 3);
            boss.shieldRegenTimer = 8 - phase * 1.5;
            addBanner('SHIELD MATRIX REGENERATED!', '#2ec5ff');
          }
        }

        // Laser Core: charge beam
        if (boss.type === 'laserCore') {
          boss.chargeTimer -= dt;
          if (boss.chargeTimer <= 0) {
            laserWarnings.push({
              x: boss.x + boss.w / 2,
              chargeTimer: 1.2,
              maxCharge: 1.2,
              fired: false,
            });
            boss.chargeTimer = 3.5 - phase * 0.6;
          }
        }

        // Bullet shooting
        boss.shootTimer -= dt;
        if (boss.shootTimer <= 0) {
          const def = BOSS_DEFS.find((d) => d.type === boss.type);
          boss.shootTimer = (def ? def.bulletInterval : 2.0) * (phase === 3 ? 0.5 : phase === 2 ? 0.7 : 1.0);
          spawnBossBullets(boss);
        }
      }
    }

    // ── Boss bullets ────────────────────────────────────────────────────────

    for (let bi = bossBullets.length - 1; bi >= 0; bi--) {
      const b = bossBullets[bi];
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.y > H + 30 || b.x < -30 || b.x > W + 30) {
        bossBullets.splice(bi, 1);
        continue;
      }

      // Ball deflects boss bullets
      let deflected = false;
      for (const ball of balls) {
        const dx = ball.x - b.x;
        const dy = ball.y - b.y;
        if (dx * dx + dy * dy < (ball.r + b.r) ** 2) {
          deflected = true;
          break;
        }
      }
      if (deflected) { bossBullets.splice(bi, 1); continue; }

      // Hits paddle
      if (b.x > paddle.x && b.x < paddle.x + paddle.w &&
          b.y + b.r >= paddle.y && b.y - b.r <= paddle.y + paddle.h) {
        bossBullets.splice(bi, 1);
        lives--;
        triggerHudFx(levelEl ? levelEl.closest('.stat') : null, 'pulse', 200);
        updateHud();
        spawnParticle(paddle.x + paddle.w / 2, paddle.y, '#ff4444', 8);
        screenShake(5, 0.18);
        if (lives <= 0) {
          if (!reviveUsed && upgrades.revive > 0) {
            lives = 1;
            reviveUsed = true;
            addBanner('REVIVED!', '#3fb950');
            updateHud();
          } else {
            onGameOver();
            updateEffects(dt);
            return;
          }
        }
      }
    }

    // ── Laser turrets + drones + enemy paddle ───────────────────────────────

    for (let hi = hazards.length - 1; hi >= 0; hi--) {
      const h = hazards[hi];

      if (h.type === 'fallingRock') {
        h.y += h.vy * dt;

        // Ball deflects rock
        for (const ball of balls) {
          const dx = ball.x - h.x;
          const dy = ball.y - h.y;
          if (dx * dx + dy * dy < (ball.r + h.r) ** 2) {
            hazards.splice(hi, 1);
            spawnParticle(h.x, h.y, '#cc5511', 10);
            screenShake(3, 0.12);
            addScore(15, h.x, h.y, '#cc5511');
            break;
          }
        }
        if (!hazards[hi] || hazards[hi] !== h) continue;

        // Hits paddle
        if (Math.abs(h.x - (paddle.x + paddle.w / 2)) < paddle.w / 2 + h.r &&
            h.y + h.r >= paddle.y && h.y < paddle.y + paddle.h) {
          hazards.splice(hi, 1);
          lives--;
          updateHud();
          spawnParticle(h.x, paddle.y, '#ff4444', 8);
          screenShake(5, 0.2);
          if (lives <= 0) {
            onGameOver(); updateEffects(dt); return;
          }
          continue;
        }
        if (h.y > H + 30) hazards.splice(hi, 1);

      } else if (h.type === 'drone') {
        h.x += h.vx * dt;
        h.y += h.vy * dt;

        // Bounce at walls
        if (h.x < h.r)     { h.x = h.r;     h.vx =  Math.abs(h.vx); }
        if (h.x > W - h.r) { h.x = W - h.r; h.vx = -Math.abs(h.vx); }
        if (h.y < h.r)     { h.y = h.r;     h.vy =  Math.abs(h.vy) + 10; }
        if (h.y > H * 0.6) h.vy = -Math.abs(h.vy);

        // Ball deflects drone
        let dHit = false;
        for (const ball of balls) {
          const dx = ball.x - h.x;
          const dy = ball.y - h.y;
          if (dx * dx + dy * dy < (ball.r + h.r) ** 2) {
            h.hp--;
            if (h.hp <= 0) {
              spawnParticle(h.x, h.y, '#bc8cff', 12);
              addScore(40, h.x, h.y, '#bc8cff');
              hazards.splice(hi, 1);
            } else {
              ball.vy = -Math.abs(ball.vy);
              spawnParticle(h.x, h.y, '#bc8cff', 5);
            }
            dHit = true;
            break;
          }
        }
        if (!dHit && h.y > H + 30) hazards.splice(hi, 1);

      } else if (h.type === 'laserTurret') {
        h.shootTimer -= dt;
        if (h.shootTimer <= 0) {
          h.shootTimer = 2.5 + Math.random() * 2;
          laserWarnings.push({
            x: h.x,
            chargeTimer: 1.0,
            maxCharge: 1.0,
            fired: false,
          });
        }
        // Ball hits turret
        for (let bi = balls.length - 1; bi >= 0; bi--) {
          const ball = balls[bi];
          const dx = ball.x - h.x;
          const dy = ball.y - h.y;
          if (dx * dx + dy * dy < (ball.r + h.r) ** 2) {
            h.hp--;
            if (h.hp <= 0) {
              spawnParticle(h.x, h.y, '#ff2222', 10);
              addScore(30, h.x, h.y, '#ff2222');
              hazards.splice(hi, 1);
            }
            ball.vy = -Math.abs(ball.vy);
            break;
          }
        }

      } else if (h.type === 'enemyPaddle') {
        // Tracks ball
        const targetBall = balls[0];
        if (targetBall) {
          const cx = h.x;
          const bx = targetBall.x;
          h.x += (bx - cx) * 2.5 * dt;
        }
        h.x = clamp(h.x, h.hw, W - h.hw);

        // Ball hits enemy paddle = reversal (deflect back up)
        for (const ball of balls) {
          if (Math.abs(ball.x - h.x) < h.hw + ball.r &&
              Math.abs(ball.y - h.y) < h.hh + ball.r) {
            ball.vy = Math.abs(ball.vy) * -1;
            ball.vy -= 40; // give extra push upward
            spawnParticle(h.x, h.y, '#ff4fd1', 6);
          }
        }
      }
    }

    // ── Laser warnings ──────────────────────────────────────────────────────

    for (let li = laserWarnings.length - 1; li >= 0; li--) {
      const lw = laserWarnings[li];
      lw.chargeTimer -= dt;
      if (!lw.fired && lw.chargeTimer <= 0) {
        lw.fired = true;
        const px = paddle.x + paddle.w / 2;
        if (Math.abs(px - lw.x) < 35) {
          lives--;
          updateHud();
          spawnParticle(paddle.x + paddle.w / 2, paddle.y, '#ff3333', 10);
          screenShake(7, 0.22);
          if (lives <= 0) {
            if (!reviveUsed && upgrades.revive > 0) {
              lives = 1;
              reviveUsed = true;
              addBanner('REVIVED!', '#3fb950');
              updateHud();
            } else {
              onGameOver(); updateEffects(dt); return;
            }
          }
        }
      }
      if (lw.fired) laserWarnings.splice(li, 1);
    }

    // ── Player laser bullets ────────────────────────────────────────────────

    if (laserCooldown > 0) laserCooldown -= dt;

    for (let li = laserBullets.length - 1; li >= 0; li--) {
      const lb = laserBullets[li];
      lb.y -= 480 * dt;
      if (lb.y < -10) { laserBullets.splice(li, 1); continue; }

      let hit = false;
      for (const b of bricks) {
        if (!b.alive) continue;
        if (lb.x > b.x && lb.x < b.x + b.w && lb.y > b.y && lb.y < b.y + b.h) {
          hitBrick(b, null, upgrades, spawnParticle, addScore, screenShake, addBanner, bricks, combo);
          laserBullets.splice(li, 1);
          hit = true;
          break;
        }
      }
      if (!hit && boss && !boss.entering &&
          lb.x > boss.x && lb.x < boss.x + boss.w &&
          lb.y > boss.y && lb.y < boss.y + boss.h) {
        boss.hp--;
        boss.hitTimer = 0.12;
        addScore(20 * wave, boss.x + boss.w / 2, boss.y, '#ff9b9b');
        laserBullets.splice(li, 1);
        if (boss.hp <= 0) {
          addScore(600 * wave, boss.x + boss.w / 2, boss.y, '#ff4fd1');
          spawnParticle(boss.x + boss.w / 2, boss.y + boss.h / 2, '#ff4444', 30);
          screenShake(12, 0.4);
          playSfx('explosion');
          runStats.bossesDefeated++;
          boss = null;
          completeWave();
          updateEffects(dt);
          return;
        }
      }
    }

    // ── Hazard periodic spawn ───────────────────────────────────────────────

    if (wave >= HAZARD_SPAWN_WAVE) {
      hazardSpawnTimer -= dt;
      if (hazardSpawnTimer <= 0) {
        spawnHazard();
        hazardSpawnTimer = Math.max(3, 9 - wave * 0.3);
      }
    }

    // ── Check wave clear ────────────────────────────────────────────────────

    const aliveBricks = bricks.filter((b) => b.alive);
    if (aliveBricks.length === 0 && !boss && balls.length > 0) {
      completeWave();
      updateEffects(dt);
      return;
    }

    // ── Multi-ball upgrade (apply on launch) ─────────────────────────────────
    // handled in launchBall

    // ── Intensity update ────────────────────────────────────────────────────

    const nearestBrick = aliveBricks.reduce((acc, b) => {
      const d = Math.abs((b.y + b.h) - paddle.y);
      return d < acc ? d : acc;
    }, 999);

    updateIntensity(director, dt, {
      damageTaken:       false,
      enemiesNearPlayer: nearestBrick < 160 ? Math.ceil((160 - nearestBrick) / 40) : 0,
      bossActive:        !!boss,
      lives,
      waveClear:         false,
    });

    if (director.intensity > runStats.highestIntensity) {
      runStats.highestIntensity = director.intensity;
    }

    // Intensity band transitions
    const iv   = director.intensity;
    const band = iv >= 80 ? 'chaotic' : iv >= 60 ? 'rising' : 'calm';
    if (band !== intensityPrevBand) {
      if (band === 'chaotic') { screenShake(4, 0.35); playSfx('bossIntro'); }
      intensityPrevBand = band;
    }

    updateEffects(dt);
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  function draw() {
    // Compute shake offset
    let shakeX = 0;
    let shakeY = 0;
    if (shakeIntensity > 0.5) {
      shakeX = (Math.random() - 0.5) * shakeIntensity;
      shakeY = (Math.random() - 0.5) * shakeIntensity;
    }

    // Merge sticky ball into render-ball list
    const renderBalls = balls.slice();
    if (stickyBall) {
      renderBalls.push({
        x: stickyBall.x, y: stickyBall.y,
        r: BALL_R, vx: 0, vy: 0, trail: [],
      });
    }

    renderer.draw({
      bricks,
      balls: renderBalls,
      paddle,
      hazards,
      particles,
      floatingTexts,
      hitFlashes,
      boss,
      bossPhase: boss ? getBossPhase(boss) : 0,
      bossBullets,
      wave,
      score,
      lives,
      combo,
      upgradePhase,
      upgradeChoices,
      gameOver,
      paused,
      running,
      waveIntroTimer: 0,
      warningBanner,
      eventBanner,
      shakeX,
      shakeY,
      screenFlashTimer,
      intensity: director ? director.intensity : 0,
      runSummary,
      laserWarnings,
      upgrades,
      elapsed,
      milestoneToasts,
    });
  }

  // ── Engine hooks ──────────────────────────────────────────────────────────

  engine.onTick = (dt) => { update(dt); draw(); };

  engine.onKeyDown = (e) => {
    // Upgrade selection
    if (upgradePhase === 'picking') {
      const idx = { '1': 0, '2': 1, '3': 2 }[e.key];
      if (idx !== undefined && upgradeChoices[idx]) {
        const applied = applyUpgrade(upgradeChoices[idx].id, upgrades);
        if (!applied) addScore(wave * 150 + 300, W / 2, H / 2, '#bc8cff');
        upgradePhase   = false;
        upgradeChoices = [];
        screenFlashTimer = 0.35;
        playSfx('upgrade');

        // Apply multi-ball on pick
        if (upgrades.multiBall > 0 && balls.length < upgrades.multiBall + 1) {
          const toAdd = (upgrades.multiBall + 1) - balls.length;
          for (let i = 0; i < toAdd; i++) spawnExtraBall();
        }
        startWave();
      }
      return;
    }

    // Launch ball
    if ((e.key === ' ' || e.key === 'Enter') && running && !paused && !launched) {
      launchBall();

      // Spawn extra balls from multiBall upgrade
      const extra = upgrades.multiBall || 0;
      for (let i = 0; i < extra; i++) spawnExtraBall();
    }

    // Release sticky ball with aim
    if ((e.key === ' ' || e.key === 'Enter') && running && !paused && stickyBall && launched) {
      const angle = rand(-0.3, 0.3);
      balls.push(makeBall(stickyBall.x, stickyBall.y, angle));
      stickyBall = null;
    }

    // Laser shot
    if ((e.key === 'b' || e.key === 'B') && running && !paused && upgrades.laser > 0 && laserCooldown <= 0) {
      const cx = paddle.x + paddle.w / 2;
      laserBullets.push({ x: cx - 2, y: paddle.y - 8, w: 4, h: 14 });
      laserBullets.push({ x: cx + 6, y: paddle.y - 8, w: 4, h: 14 });
      laserCooldown = LASER_COOLDOWN;
      playSfx('event');
    }
  };

  // ── Mouse / touch input ───────────────────────────────────────────────────

  function onPointerMove(e) {
    if (!running || paused || gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const cx = (e.clientX !== undefined ? e.clientX : e.touches[0].clientX) - rect.left;
    const nx = cx * scaleX - paddle.w / 2;
    paddle.x = clamp(nx, 0, W - paddle.w);
    paddle.targetVx = 0; // mouse input: clear inertia target so update() decays naturally
  }

  function onPointerTap(e) {
    if (!running || paused || gameOver) return;
    if (!launched) {
      launchBall();
      const extra = upgrades.multiBall || 0;
      for (let i = 0; i < extra; i++) spawnExtraBall();
    } else if (stickyBall && launched) {
      const angle = rand(-0.3, 0.3);
      balls.push(makeBall(stickyBall.x, stickyBall.y, angle));
      stickyBall = null;
    }
  }

  // Upgrade card click handling
  function onCanvasClick(e) {
    if (upgradePhase !== 'picking' || !upgradeChoices.length) return;
    const rect  = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;

    const cardH  = 100;
    const cardW  = Math.min(160, (W - 40) / 3 - 8);
    const totalW = upgradeChoices.length * cardW + (upgradeChoices.length - 1) * 12;
    const startX = (W - totalW) / 2;
    const cy     = H / 2 - cardH / 2;

    for (let i = 0; i < upgradeChoices.length; i++) {
      const cx2 = startX + i * (cardW + 12);
      if (mx >= cx2 && mx <= cx2 + cardW && my >= cy && my <= cy + cardH) {
        const applied = applyUpgrade(upgradeChoices[i].id, upgrades);
        if (!applied) addScore(wave * 150 + 300, W / 2, H / 2, '#bc8cff');
        upgradePhase   = false;
        upgradeChoices = [];
        screenFlashTimer = 0.35;
        playSfx('upgrade');
        if (upgrades.multiBall > 0 && balls.length < upgrades.multiBall + 1) {
          const toAdd = (upgrades.multiBall + 1) - balls.length;
          for (let j = 0; j < toAdd; j++) spawnExtraBall();
        }
        startWave();
        return;
      }
    }
  }

  canvas.addEventListener('mousemove',  onPointerMove, { passive: true });
  canvas.addEventListener('touchmove',  onPointerMove, { passive: true });
  canvas.addEventListener('click',      onCanvasClick);
  canvas.addEventListener('touchstart', onPointerTap,  { passive: true });

  // ── Reset ─────────────────────────────────────────────────────────────────

  function resetGame() {
    score        = 0;
    wave         = 0;
    lives        = 3;
    running      = false;
    paused       = false;
    gameOver     = false;
    elapsed      = 0;
    combo        = 1;
    comboTimer   = 0;
    launched     = false;
    stickyBall   = null;
    balls        = [];
    laserBullets = [];
    laserCooldown = 0;
    bricks       = [];
    hazards      = [];
    laserWarnings = [];
    bossBullets  = [];
    boss         = null;
    bossEntering = false;
    bossWarned   = false;
    shieldFloorHp = 0;
    particles.length    = 0;
    floatingTexts.length = 0;
    hitFlashes.length   = 0;
    warningBanner = null;
    eventBanner   = null;
    activeEvent   = null;
    eventData     = {};
    eventTimer    = 0;
    director      = createScalingDirector();
    runStats      = { bossesDefeated: 0, highestIntensity: 0 };
    runSummary    = null;
    milestoneToasts = [];
    intensityPrevBand = 'calm';
    screenFlashTimer = 0;
    shakeTime        = 0;
    shakeIntensity   = 0;
    reviveUsed       = false;
    upgrades         = makeUpgrades();
    upgradePhase     = false;
    upgradeChoices   = [];
    bossWaveThisRound = false;
    paddle.x  = W / 2 - PAD_BASE_W / 2;
    paddle.vx = 0;
    paddle.w  = PAD_BASE_W;
    updateHud();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  function init() {
    best = ArcadeSync.getHighScore(GAME_ID);
    updateHud();
    draw();
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
    draw();
    engine.startLoop();
  }

  function destroy() {
    engine.destroy();
    stopAllSounds();
    window.removeEventListener('resize', resizeCanvas);
    document.removeEventListener('fullscreenchange', resizeCanvas);
    canvas.removeEventListener('mousemove',  onPointerMove);
    canvas.removeEventListener('touchmove',  onPointerMove);
    canvas.removeEventListener('click',      onCanvasClick);
    canvas.removeEventListener('touchstart', onPointerTap);
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
