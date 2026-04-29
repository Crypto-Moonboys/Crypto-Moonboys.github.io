/**
 * bootstrap.js â€” Invaders 3008 orchestrator.
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
import { createGameAdapter, registerGameAdapter, bootstrapFromAdapter } from '/js/arcade/engine/game-adapter.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';
import { BaseGame } from '/js/arcade/engine/BaseGame.js';
import { getActiveModifiers, hasEffect, getStatEffect } from '/js/arcade/systems/cross-game-modifier-system.js';

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
  BOSS_SPREAD_NORMAL, BOSS_SPREAD_AGGRESSIVE, BOSS_SPREAD_PHASE3,
  BUNKER_BLOCK_W, BUNKER_BLOCK_H,
  buildGrid, spawnBoss, buildBunkers, makeEnemyBullet,
  calcInvaderPoints, getBossPhase,
    ZIGZAG_SPAWN_CHANCE, SPLITTER_SPAWN_CHANCE, HEALER_SPAWN_CHANCE,
  SNIPER_SPAWN_CHANCE, KAMIKAZE_SPAWN_CHANCE, CLOAKED_SPAWN_CHANCE, GOLDEN_SPAWN_CHANCE,
} from './invader-system.js';

import {
  MUTATION_DEFS, applyMutations,
} from '/js/arcade/systems/mutation-system.js';

import {
  POWERUP_DROP_CHANCE, POWERUP_BOSS_DROP_CHANCE,
  makeDroppedPowerup, activatePowerup, tickPowerups, getScoreMultiplier,
} from './powerup-system.js';

import {
  makeUpgrades, pickUpgradeChoices, applyUpgrade,
  getUpgradedShootRate, getUpgradedBulletDmg, getUpgradedScoreMult, getSpreadAngles,
  RARITY_COLORS, shouldOfferRiskReward, pickRiskRewardChoices, pickUpgradeChoicesWithRarity,
} from '/js/arcade/systems/upgrade-system.js';

import {
  MODIFIER_BLACKOUT,
  WAVE_MODIFIER_DEFS,
  createScalingDirector, tickDirector, pickWaveModifier,
  shouldFirePressureEvent, pickSurpriseEvent, getEventTier,
  updateIntensity, checkForcedChaos, getBossAggressionMult,
} from '/js/arcade/systems/event-system.js';

import {
  buildRunSummary, recordRunStats, checkMilestones, getDailyVariation,
} from '/js/arcade/systems/meta-system.js';

import {
  BOSS_ARCHETYPE_DEFS, pickBossArchetype, spawnBossArchetype,
} from '/js/arcade/systems/boss-system.js';

import { createRenderer } from './render-system.js';

const INVADERS_BUILD_TAG = "invaders-bootstrap-debug-v1";

function emitInvadersDebug(stage, detail = {}) {
  if (typeof window === "undefined") return;
  const payload = { stage, ...detail, build: INVADERS_BUILD_TAG, ts: Date.now() };
  try {
    console.info("[invaders-debug]", payload);
    window.dispatchEvent(new CustomEvent("arcade:debug", { detail: payload }));
  } catch {}
}

export const INVADERS_ADAPTER = createGameAdapter({
  id: INVADERS_CONFIG.id,
  name: INVADERS_CONFIG.label,
  systems: { upgrade: true, director: true, event: true, mutation: true, boss: true, risk: true, meta: true, feedback: true },
  legacyBootstrap: function (root) {
    return createLegacybootstrapInvaders(root);
  },
});

registerGameAdapter(INVADERS_CONFIG, INVADERS_ADAPTER, bootstrapInvaders);

export function bootstrapInvaders(root) {
  return bootstrapFromAdapter(root, INVADERS_ADAPTER);
}

function createLegacybootstrapInvaders(root) {
  const GAME_ID = INVADERS_CONFIG.id;
  const canvas  = document.getElementById('invCanvas');
  const ctx     = canvas.getContext('2d');
  const W       = canvas.width;
  const H       = canvas.height;

  const renderer = createRenderer(ctx, W, H);
  const engine   = new BaseGame({ context: { adapter: { id: GAME_ID } } });

  const scoreEl   = document.getElementById('score');
  const bestEl    = document.getElementById('best');
  const waveEl    = document.getElementById('wave');
  const livesEl   = document.getElementById('lives');
  const comboEl   = document.getElementById('combo');
  const powerupEl = document.getElementById('powerup');

  // â”€â”€ Misc constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const SHIP_W            = 36;
  const SHIP_H            = 20;
  const BULLET_SPD        = 560;
  const SHOOT_RATE        = 0.2;
  const STREAK_BONUS_RATE = 0.05;
  const MAX_STREAK_BONUS  = 0.5;
  const WAVE_INTRO_DURATION = 2.2;

  const BOMB_COOLDOWN = 5.0;   // seconds between bomb shots
  const BOMB_RADIUS   = 90;    // area-damage radius in px
  const BOMB_SIZE     = 18;    // half-size of bomb bullet hitbox

  // Boss movement speed multipliers per phase
  const BOSS_PHASE1_SPEED_MULT = 1.0;
  const BOSS_PHASE2_SPEED_MULT = 1.2;
  const BOSS_PHASE3_SPEED_MULT = 1.55;

  // â”€â”€ Game state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  let bombCooldown  = 0;

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

  // â”€â”€ Permanent run upgrades + between-wave screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let upgrades       = makeUpgrades();
  let upgradePhase   = false;   // false | 'picking'
  let upgradeChoices = [];

  // â”€â”€ Roguelite: scaling director & wave modifiers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let director          = createScalingDirector();
  let activeModifier    = null;   // current WAVE_MODIFIER_DEFS entry or null
  let modifierData      = {};     // scratch object for the modifier
  let activeEvent       = null;   // current SURPRISE_EVENT_DEFS entry or null
  let eventData         = {};     // scratch object for the event
  let eventTimer        = 0;
  let warningBanner     = null;   // { text, color, timer, maxTimer }
  let eventBanner       = null;   // { text, color, timer }
  let mutationFlash     = 0;
  let riskRewardPhase   = false;  // false | 'picking'
  let riskRewardChoices = [];
  let activeRiskReward  = null;
  let empActive         = false;
  let empTimer          = 0;
  let panicMode         = false;
  let panicTimer        = 0;
  let shieldRegenTimer  = 0;
  let bossDmgBoost      = 1;
  let reviveUsed        = false;
  let slowDodgeTimer    = 0;
  let slowDodgeActive   = false;
  let asteroids         = [];
  let laserWarning      = null;
  let miniEnemies       = [];
  let droneHijacked     = false;
  let droneHijackTimer  = 0;
  // Double-tap tracking for slow dodge
  let lastLeftTapTime   = 0;
  let lastRightTapTime  = 0;
  // Wave score multiplier (for oneLife risk/reward)
  let waveScoreMult     = 1;

  // ── Cross-game modifier state ─────────────────────────────────────────────
  // Fetched at run start and re-fetched on reset so changes take effect.
  let _crossMods          = getActiveModifiers(GAME_ID, INVADERS_CONFIG.crossGameTags || []);
  let modScoreMult        = getStatEffect(_crossMods, 'scoreMult', 1);
  let modShieldedStart    = hasEffect(_crossMods, 'shieldedStart');
  let modPressureRate     = getStatEffect(_crossMods, 'pressureRate', 1);
  let modBossHunterMult   = getStatEffect(_crossMods, 'bossDmgMult', 1);
  let modMagnetLuck       = hasEffect(_crossMods, 'magnetPickups');
  let modRecoveryPulse    = hasEffect(_crossMods, 'recoveryPulse');
  let modGoldenChance     = getStatEffect(_crossMods, 'goldenSpawnBoost', 0);

  function _refreshCrossMods() {
    _crossMods          = getActiveModifiers(GAME_ID, INVADERS_CONFIG.crossGameTags || []);
    modScoreMult        = getStatEffect(_crossMods, 'scoreMult', 1);
    modShieldedStart    = hasEffect(_crossMods, 'shieldedStart');
    modPressureRate     = getStatEffect(_crossMods, 'pressureRate', 1);
    modBossHunterMult   = getStatEffect(_crossMods, 'bossDmgMult', 1);
    modMagnetLuck       = hasEffect(_crossMods, 'magnetPickups');
    modRecoveryPulse    = hasEffect(_crossMods, 'recoveryPulse');
    modGoldenChance     = getStatEffect(_crossMods, 'goldenSpawnBoost', 0);
  }

  // â”€â”€ Meta / intensity feedback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let runStats            = { bossesDefeated: 0, highestIntensity: 0 };
  let intensityPrevBand   = 'calm';    // 'calm' | 'rising' | 'chaotic'
  let intensityPulseTimer = 0;         // visual threshold-crossing pulse duration
  let intensityPulseColor = '#ff4444';
  let recoveryTimer       = 0;         // post-chaos recovery visual (seconds)
  let runSummary          = null;      // populated on game over
  /** @type {Array<{ text: string, timer: number }>} */
  let milestoneToasts     = [];
  const dailyVariation    = getDailyVariation();  // fixed for the session

  // â”€â”€ Game-feel state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let screenFlashTimer = 0;
  let droneAngle       = 0;
  let droneCooldown    = 0;

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

  // â”€â”€ Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function getOverlayState() { return { running, paused, gameOver }; }

  // â”€â”€ HUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    score += Math.round(points * modScoreMult);
    setBestMaybe();
    updateHud();
    triggerHudFx(scoreEl, 'pulse', 180);
    if (typeof x === 'number' && typeof y === 'number') {
      scoreTexts.push({ x, y, text: '+' + points, life: 0.9, maxLife: 0.9, color });
    }
  }

  // â”€â”€ Effects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      wave_clear:    'invaders-wave-clear',
      upgrade:       'invaders-upgrade',
      event_start:   'invaders-powerup',
      event_clear:   'invaders-wave-clear',
      boss_intro:    'invaders-boss-warning',
      rare_enemy:    'invaders-powerup',
      legendary:     'invaders-upgrade',
    };
    const id = map[type];
    if (id) playSound(id);
  }

  /** Show a brief floating text on screen (uses warningBanner for simplicity). */
  function addFloatingText(text, color) {
    warningBanner = { text, color: color || '#f7c948', timer: 1.8, maxTimer: 1.8 };
  }

  /** Drop one random powerup from sky at random X. */
  function spawnPowerupRain() {
    powerupItems.push(makeDroppedPowerup(rand(30, W - 30), -10));
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
    if (screenFlashTimer > 0) screenFlashTimer -= dt;
    for (const s of stars) {
      s.y += s.spd * dt * (0.65 + wave * 0.03);
      if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
    }
  }

  // â”€â”€ Wave management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    asteroids            = [];
    miniEnemies          = [];
    laserWarning         = null;
    waveScoreMult        = 1;

    // Shielded Start modifier: grant bonus shield/life on the first wave of a run
    if (wave === 1 && modShieldedStart) {
      lives += 1;
      player.shielded = true;
      addFloatingText('SHIELDED START!', '#3fb950');
      updateHud();
    }

    // Apply active risk/reward effects for this wave
    const forceBoss = activeRiskReward && activeRiskReward.id === 'earlyBoss';
    if (activeRiskReward && activeRiskReward.id === 'oneLife') {
      lives = 1;
      waveScoreMult = 3;
      addFloatingText('ONE LIFE â€” 3x SCORE', '#ff4444');
    }
    if (activeRiskReward && activeRiskReward.id === 'noShield') {
      player.shielded = false;
    }

    const isBossWave = forceBoss || (wave % WAVE_BOSS === 0);

    if (isBossWave) {
      const archetype = pickBossArchetype(wave, director);
      const r         = spawnBossArchetype(archetype, wave, W);
      boss               = r;
      invShootTimer      = rand(0.8, 1.4);
      bossEntering       = true;
      bossWarningSounded = false;
      // Show boss warning banner
      warningBanner = { text: archetype.warningText, color: archetype.color, timer: 2.2, maxTimer: 2.2 };
      director.bossHistory = director.bossHistory || [];
    } else {
      const g       = buildGrid(wave, W, rand);
      invaders      = g.invaders;
      invDir        = g.invDir;
      invSpeed      = g.invSpeed;
      invShootInterval = g.invShootInterval;
      invShootTimer = g.invShootTimer;
      invDropping   = g.invDropping;

      // Apply risk/reward double-enemies
      if (activeRiskReward && activeRiskReward.id === 'doubleEnemies') {
        const extra = buildGrid(wave, W, rand);
        for (const inv of extra.invaders) {
          inv.y += 180;
          inv.hp    = 1;
          inv.maxHp = 1;
        }
        invaders = invaders.concat(extra.invaders);
        waveScoreMult = Math.max(waveScoreMult, 2);
      }

      // Apply mutations for wave >= 10
      if (wave >= 10) {
        applyMutations(invaders, wave);
        if (invaders.some(i => i.mutations && i.mutations.length > 0)) mutationFlash = 0.4;
      }

      // Golden Chance modifier: upgrade some basic invaders to golden type
      if (modGoldenChance > 0) {
        for (const inv of invaders) {
          if (inv.type === 'basic' && inv.alive && Math.random() < modGoldenChance) {
            inv.type = 'golden';
          }
        }
      }

      // Pick and apply wave modifier
      if (activeModifier && activeModifier.remove) {
        activeModifier.remove(buildModifierState());
      }
      // Force blackout modifier if risk/reward selected it
      if (activeRiskReward && activeRiskReward.id === 'blackoutWave') {
        activeModifier = WAVE_MODIFIER_DEFS.find(m => m.id === MODIFIER_BLACKOUT) || null;
      } else {
        activeModifier = pickWaveModifier(wave, director);
      }
      modifierData   = {};
      if (activeModifier) {
        activeModifier.apply(buildModifierState());
        // Show modifier banner
        eventBanner = { text: 'âš¡ ' + activeModifier.label, color: activeModifier.color, timer: 2.5 };
        if (activeModifier.id === 'reverseDrift') invDir = -1;
      }
    }

    // Reset risk/reward for next wave
    activeRiskReward = null;

    updateHud();
  }

  // â”€â”€ Roguelite state builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function buildModifierState() {
    return {
      invaders, invBullets, bullets, player, wave, elapsed, W, H,
      modifierData,
      get invSpeed() { return invSpeed; },
      set invSpeed(v) { invSpeed = v; },
      get invDir() { return invDir; },
      set invDir(v) { invDir = v; },
      bunkers, asteroids,
      rand, spawnExplosion, addScore, playSfx, screenShake,
      addFloatingText, spawnPowerupRain, panicMode, panicTimer,
      get empActive() { return empActive; },
      set empActive(v) { empActive = v; },
      get empTimer() { return empTimer; },
      set empTimer(v) { empTimer = v; },
      get droneHijacked() { return droneHijacked; },
      set droneHijacked(v) { droneHijacked = v; },
      get droneHijackTimer() { return droneHijackTimer; },
      set droneHijackTimer(v) { droneHijackTimer = v; },
      miniEnemies,
      get laserWarning() { return laserWarning; },
      set laserWarning(v) { laserWarning = v; },
    };
  }

  function buildEventState() {
    return {
      invaders, invBullets, bullets, player, wave, elapsed, W, H,
      boss, asteroids, miniEnemies,
      get laserWarning() { return laserWarning; },
      set laserWarning(v) { laserWarning = v; },
      rand, spawnExplosion, addScore, playSfx, screenShake,
      addFloatingText, spawnPowerupRain,
      get empActive() { return empActive; },
      set empActive(v) { empActive = v; },
      get empTimer() { return empTimer; },
      set empTimer(v) { empTimer = v; },
      get panicMode() { return panicMode; },
      set panicMode(v) { panicMode = v; },
      get panicTimer() { return panicTimer; },
      set panicTimer(v) { panicTimer = v; },
      get droneHijacked() { return droneHijacked; },
      set droneHijacked(v) { droneHijacked = v; },
      get droneHijackTimer() { return droneHijackTimer; },
      set droneHijackTimer(v) { droneHijackTimer = v; },
    };
  }

  function completeWave() {
    // Remove active modifier
    if (activeModifier && activeModifier.remove) {
      activeModifier.remove(buildModifierState());
    }
    activeModifier = null;
    modifierData   = {};
    activeEvent    = null;
    eventTimer     = 0;

    if (wave > 0) {
      const survival = wave * 50;
      addScore(survival, W * 0.5, 82, '#3fb950');
      spawnExplosion(W * 0.5, 95, 0.8, '#3fb950');
    }
    playSfx('wave_clear');
    updateIntensity(director, 0, { waveClear: true, lives });
    // Partial pressure reset on wave clear so the next wave still builds quickly
    director.pressure = Math.max(0, (director.pressure || 0) - 40);

    // Risk/reward screen every 5 waves (shown before upgrade)
    if (shouldOfferRiskReward(wave)) {
      riskRewardChoices = pickRiskRewardChoices();
      riskRewardPhase   = 'picking';
    } else {
      // Go straight to upgrade screen
      upgradeChoices = pickUpgradeChoicesWithRarity(upgrades, wave);
      upgradePhase   = 'picking';
    }
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
    upgrades       = makeUpgrades();
    upgradePhase   = false;
    upgradeChoices = [];
    screenFlashTimer = 0;
    droneAngle       = 0;
    droneCooldown    = 0;
    bombCooldown     = 0;
    // Roguelite state reset
    director          = createScalingDirector();
    activeModifier    = null;
    modifierData      = {};
    activeEvent       = null;
    eventData         = {};
    eventTimer        = 0;
    warningBanner     = null;
    eventBanner       = null;
    mutationFlash     = 0;
    riskRewardPhase   = false;
    riskRewardChoices = [];
    activeRiskReward  = null;
    empActive         = false;
    empTimer          = 0;
    panicMode         = false;
    panicTimer        = 0;
    shieldRegenTimer  = 0;
    bossDmgBoost      = 1;
    reviveUsed        = false;
    slowDodgeTimer    = 0;
    slowDodgeActive   = false;
    asteroids         = [];
    laserWarning      = null;
    miniEnemies       = [];
    droneHijacked     = false;
    droneHijackTimer  = 0;
    lastLeftTapTime   = 0;
    lastRightTapTime  = 0;
    waveScoreMult     = 1;
    // Meta / intensity feedback
    runStats            = { bossesDefeated: 0, highestIntensity: 0 };
    intensityPrevBand   = 'calm';
    intensityPulseTimer = 0;
    recoveryTimer       = 0;
    runSummary          = null;
    milestoneToasts     = [];
    player = { x: W / 2, y: H - 50, w: SHIP_W, h: SHIP_H, speed: 320, moveDir: 1, shielded: false };
    // Re-fetch cross-game modifiers so each new run picks up any selection change
    _refreshCrossMods();
    updateHud();
    draw();
  }

  // â”€â”€ Shooting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function tryShoot() {
    if (shootCooldown > 0 || !running || paused || gameOver || waveIntroTimer > 0 || upgradePhase === 'picking' || riskRewardPhase === 'picking') return;
    const cx      = player.x + player.w / 2;
    const by      = player.y - 2;
    const angles  = getSpreadAngles(upgrades, activePowerups.has('spread'));
    const dmg     = getUpgradedBulletDmg(upgrades);
    const piercing = !empActive && upgrades.piercing > 0;
    for (const ang of angles) {
      bullets.push({ x: cx - 2 + Math.sin(ang) * 8, y: by, w: 4, h: 12,
                     vx: Math.sin(ang) * BULLET_SPD, vy: BULLET_SPD, dmg, piercing });
    }
    const baseRate = activePowerups.has('rapid') ? SHOOT_RATE * 0.4 : SHOOT_RATE;
    shootCooldown  = getUpgradedShootRate(baseRate, upgrades);
    playSfx('shoot');
  }

  function tryBombShot() {
    if (!upgrades.bombShot || bombCooldown > 0 || !running || paused || gameOver || waveIntroTimer > 0 || upgradePhase === 'picking') return;
    const cx = player.x + player.w / 2;
    bullets.push({ x: cx - BOMB_SIZE, y: player.y - BOMB_SIZE * 2,
                   w: BOMB_SIZE * 2, h: BOMB_SIZE * 2, vx: 0, vy: BULLET_SPD * 0.55, isBomb: true });
    bombCooldown = BOMB_COOLDOWN;
    playSfx('shoot');
  }

  /**
   * Area-damage explosion centred at (bx, by).
   * Kills / damages all invaders and the boss within BOMB_RADIUS pixels.
   * Does NOT call completeWave or return â€” the caller handles that.
   */
  function detonateBomb(bx, by) {
    spawnExplosion(bx, by, 2.5, '#ff6b2b');
    screenShake(6, 0.28);
    playSfx('explosion');

    for (const inv of invaders) {
      if (!inv.alive) continue;
      const dx = (inv.x + inv.w / 2) - bx;
      const dy = (inv.y + inv.h / 2) - by;
      if (dx * dx + dy * dy > BOMB_RADIUS * BOMB_RADIUS) continue;
      if (inv.shieldHp > 0) {
        inv.shieldHp = 0;
        inv.shieldHitTimer = 0.2;
      } else {
        inv.alive = false;
        streak++; streakTimer = 1.8;
        const pts = calcInvaderPoints(inv, wave, streak, { STREAK_BONUS_RATE, MAX_STREAK_BONUS })
          * getScoreMultiplier(activePowerups) * getUpgradedScoreMult(upgrades);
        addScore(pts, inv.x + inv.w * 0.5, inv.y, '#ff6b2b');
        spawnExplosion(inv.x + inv.w * 0.5, inv.y + inv.h * 0.5, inv.type === 'bomber' ? 1.2 : 0.7, '#ff6b2b');
      }
    }

    if (boss) {
      const dx = (boss.x + boss.w / 2) - bx;
      const dy = (boss.y + boss.h / 2) - by;
      if (dx * dx + dy * dy <= BOMB_RADIUS * BOMB_RADIUS) {
        const dmg = Math.ceil(4 * modBossHunterMult);
        boss.hp -= dmg;
        boss.hitTimer = 0.15;
        addScore(20 * wave * dmg * getScoreMultiplier(activePowerups) * getUpgradedScoreMult(upgrades),
          boss.x + boss.w / 2, boss.y - 4, '#ff9b9b');
        spawnExplosion(boss.x + boss.w / 2, boss.y + boss.h / 2, 1.8, '#ff6b2b');
        screenShake(10, 0.35);
      }
    }
  }

  // â”€â”€ Update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function update(dt) {
    if (!running || paused || gameOver) { updateEffects(dt); return; }

    // Freeze simulation during between-wave screens
    if (upgradePhase === 'picking' || riskRewardPhase === 'picking') { updateEffects(dt); return; }

    elapsed += dt;

    if (waveIntroTimer > 0) { waveIntroTimer -= dt; updateEffects(dt); return; }

    // Per-frame player-damage flag (set to true in each hit path below)
    let _damageFlagThisFrame = false;

    // Recovery visual timer
    if (recoveryTimer > 0) recoveryTimer = Math.max(0, recoveryTimer - dt);

    // Tick scaling director (pass event-active flag + daily pressure multiplier)
    tickDirector(director, dt, score, wave, lives, upgrades, !!activeEvent, (dailyVariation.eventRateMult || 1) * modPressureRate);

    // Forced chaos: inject a surprise event if the player has been safe too long
    if (!activeEvent && checkForcedChaos(director)) {
      const ev = pickSurpriseEvent(wave, director);
      if (ev) {
        activeEvent = ev;
        eventTimer  = ev.duration || 0;
        eventData   = {};
        ev.execute(buildEventState());
        eventBanner = { text: 'âš¡ CHAOS: ' + ev.label, color: '#ff0055', timer: 2.5 };
        playSfx('event_start');
        director._eventCooldown = ev.cooldown || 30;
        director.pressure       = 0;
      }
    }

    // Pressure-based event trigger (deterministic â€” fires when pressure reaches 100)
    if (!activeEvent && shouldFirePressureEvent(director)) {
      const tier = getEventTier(director.intensity || 0);
      const ev   = pickSurpriseEvent(wave, director, tier);
      if (ev) {
        activeEvent = ev;
        eventTimer  = ev.duration || 0;
        eventData   = {};
        ev.execute(buildEventState());
        eventBanner = { text: 'âš ï¸ ' + ev.label, color: ev.color, timer: 2.5 };
        playSfx('event_start');
        director._eventCooldown = ev.cooldown || 30;
        director.pressure       = 0;
      } else {
        // No eligible event â€” bleed off pressure so we don't get stuck at 100
        director.pressure = 50;
      }
    }
    if (activeEvent) {
      eventTimer -= dt;
      if (activeEvent.tickActive) activeEvent.tickActive(buildEventState(), dt);
      if (eventTimer <= 0) {
        if (activeEvent.remove) activeEvent.remove(buildEventState());
        activeEvent = null;
        eventTimer  = 0;
        eventData   = {};
        playSfx('event_clear');
        // Recovery Pulse modifier: restore shield when a chaos event ends
        if (modRecoveryPulse && !player.shielded) {
          player.shielded = true;
          addFloatingText('RECOVERY PULSE!', '#3fb950');
          updateHud();
        }
      }
    }

    // Tick wave modifier
    if (activeModifier && activeModifier.tick) activeModifier.tick(buildModifierState(), dt);
    // Handle fake-safe-wave double-speed trigger
    if (modifierData.fakeMutated) {
      modifierData.fakeMutated = false;
      invSpeed *= 2;
    }

    // Decay warning/event banners
    if (warningBanner) { warningBanner.timer -= dt; if (warningBanner.timer <= 0) warningBanner = null; }
    if (eventBanner)   { eventBanner.timer   -= dt; if (eventBanner.timer   <= 0) eventBanner   = null; }
    if (mutationFlash  > 0) mutationFlash -= dt;

    // EMP timer
    if (empActive) { empTimer -= dt; if (empTimer <= 0) { empActive = false; empTimer = 0; } }

    // Panic mode
    if (panicMode) { panicTimer -= dt; if (panicTimer <= 0) { panicMode = false; panicTimer = 0; } }

    // Shield regen
    if (upgrades.shieldRegen > 0 && !player.shielded) {
      shieldRegenTimer -= dt;
      if (shieldRegenTimer <= 0) {
        player.shielded    = true;
        shieldRegenTimer   = 15;
        addFloatingText('SHIELD RESTORED', '#3fb950');
        updateHud();
      }
    }

    // Slow dodge timer
    if (slowDodgeActive) { slowDodgeTimer -= dt; if (slowDodgeTimer <= 0) { slowDodgeActive = false; slowDodgeTimer = 0; } }

    // Drone hijack timer
    if (droneHijacked) { droneHijackTimer -= dt; if (droneHijackTimer <= 0) { droneHijacked = false; droneHijackTimer = 0; } }

    // Powerup timers (via powerup-system)
    if (tickPowerups(activePowerups, player, dt)) updateHud();

    // Magnet powerups toward player
    if (upgrades.magnetPowerups > 0) {
      const px = player.x + player.w / 2;
      const py = player.y + player.h / 2;
      for (const p of powerupItems) {
        const dx = px - (p.x + p.r);
        const dy = py - (p.y + p.r);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const pull = Math.min(200, 6000 / dist);
        p.x += (dx / dist) * pull * dt;
        p.y += (dy / dist) * pull * dt;
      }
    }

    // Magnet Luck modifier: pickup magnetism without the upgrade (weaker pull)
    if (modMagnetLuck && upgrades.magnetPowerups === 0) {
      const px = player.x + player.w / 2;
      const py = player.y + player.h / 2;
      for (const p of powerupItems) {
        const dx = px - (p.x + p.r);
        const dy = py - (p.y + p.r);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const pull = Math.min(120, 3000 / dist);
        p.x += (dx / dist) * pull * dt;
        p.y += (dy / dist) * pull * dt;
      }
    }

    // Auto bomb accelerated cooldown
    if (upgrades.autoBomb > 0 && bombCooldown > 0) bombCooldown -= dt * 0.5;

    // Player movement
    const playerSpeed = player.speed * (panicMode ? 1.5 : 1) * (slowDodgeActive ? 0.3 : 1);
    if (keys.ArrowLeft || keys.a) { player.moveDir = -1; player.x -= playerSpeed * dt; }
    if (keys.ArrowRight || keys.d) { player.moveDir = 1;  player.x += playerSpeed * dt; }
    player.x = clamp(player.x, 0, W - player.w);

    if (shootCooldown > 0) shootCooldown -= dt;
    if (bombCooldown  > 0) bombCooldown  -= dt;
    if (streakTimer > 0) { streakTimer -= dt; if (streakTimer <= 0) streak = 0; }

    // Drone companion auto-fire
    if (upgrades.drone > 0 && !droneHijacked) {
      droneAngle    += dt * 1.8;
      droneCooldown -= dt;
      if (droneCooldown <= 0) {
        droneCooldown = 0.7;
        const dmg = getUpgradedBulletDmg(upgrades);
        const bx  = player.x + player.w / 2 + Math.cos(droneAngle) * 44;
        const by  = player.y + player.h / 2 + Math.sin(droneAngle) * 28;
        bullets.push({ x: bx - 2, y: by, w: 4, h: 8, vx: 0, vy: BULLET_SPD * 0.85, dmg });
      }
    }

    // Boss entrance
    if (bossEntering && boss) {
      if (!bossWarningSounded) { bossWarningSounded = true; playSfx('boss_intro'); }
      boss.y += 120 * dt;
      if (boss.y >= 30) { boss.y = 30; bossEntering = false; }
      updateEffects(dt);
      return;
    }

    // Player bullet movement
    for (const b of bullets) { b.y -= b.vy * dt; b.x += (b.vx || 0) * dt; }
    bullets = bullets.filter((b) => b.y > -60 && b.x > -60 && b.x < W + 60);

    // Invader hit timers
    for (const inv of invaders) {
      if (inv.hitTimer > 0)       inv.hitTimer -= dt;
      if (inv.shieldHitTimer > 0) inv.shieldHitTimer -= dt;
    }

    const speedModMult = slowDodgeActive ? 0.3 : 1;
    const slowMult = (activePowerups.has('slow') ? 0.45 : 1) * (panicMode ? 2 : 1) * speedModMult;

    // Healer invaders
    for (const inv of invaders) {
      if (!inv.alive || inv.type !== 'healer') continue;
      inv.healTimer = (inv.healTimer || 3) - dt;
      if (inv.healTimer <= 0) {
        inv.healTimer = 3;
        let nearest = null; let nearDist = 80;
        for (const other of invaders) {
          if (!other.alive || other === inv) continue;
          const dx = (other.x - inv.x); const dy = (other.y - inv.y);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < nearDist) { nearDist = d; nearest = other; }
        }
        if (nearest) {
          nearest.hp = Math.min(nearest.maxHp || nearest.hp + 1, nearest.hp + 1);
          spawnExplosion(nearest.x + nearest.w / 2, nearest.y + nearest.h / 2, 0.3, '#3fb950');
        }
      }
    }

    // Sniper invaders
    for (const inv of invaders) {
      if (!inv.alive || inv.type !== 'sniper') continue;
      inv.sniperTimer = (inv.sniperTimer || 4) - dt;
      if (inv.sniperTimer <= 0) {
        inv.sniperTimer = 4;
        const bx = inv.x + inv.w / 2;
        const by = inv.y + inv.h;
        const tx = player.x + player.w / 2;
        const ty = player.y;
        const ang = Math.atan2(ty - by, tx - bx);
        const spd = 220 + wave * 4;
        invBullets.push({ x: bx - 2, y: by, w: 4, h: 12, vy: spd * Math.sin(ang), vx: spd * Math.cos(ang) });
      }
    }

    // Laser warning tick
    if (laserWarning) {
      laserWarning.chargeTimer -= dt;
      if (!laserWarning.fired && laserWarning.chargeTimer <= 0) {
        laserWarning.fired = true;
        const px = player.x + player.w / 2;
        if (Math.abs(px - laserWarning.x) < 40) {
          lives--;
          triggerHudFx(livesEl, 'flash', 220);
          updateHud();
          spawnExplosion(px, player.y + player.h / 2, 1.5, '#ff3333');
          screenShake(8, 0.25);
          playSfx('player_damage');
          _damageFlagThisFrame = true;
          if (lives <= 0) {
            if (!reviveUsed && upgrades.revive > 0) {
              lives      = 1;
              reviveUsed = true;
              addFloatingText('REVIVED!', '#3fb950');
              updateHud();
            } else {
              onGameOver(); updateEffects(dt); return;
            }
          }
        }
      }
      if (laserWarning.fired) laserWarning = null;
    }

    // Asteroid ticking
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const a = asteroids[ai];
      a.x += (a.vx || 0) * dt;
      a.y += (a.vy || 80) * dt;
      if (a.y > H + 40) { asteroids.splice(ai, 1); continue; }
      if (rectsOverlap(a.x - a.r, a.y - a.r, a.r * 2, a.r * 2, player.x, player.y, player.w, player.h)) {
        asteroids.splice(ai, 1);
        if (!player.shielded) {
          lives--;
          triggerHudFx(livesEl, 'flash', 220);
          updateHud();
          spawnExplosion(player.x + player.w / 2, player.y + player.h / 2, 1.2, '#ff6b2b');
          screenShake(7, 0.24);
          playSfx('player_damage');
          _damageFlagThisFrame = true;
          if (lives <= 0) {
            if (!reviveUsed && upgrades.revive > 0) {
              lives      = 1;
              reviveUsed = true;
              addFloatingText('REVIVED!', '#3fb950');
              updateHud();
            } else {
              onGameOver(); updateEffects(dt); return;
            }
          }
        } else {
          player.shielded = false;
          activePowerups.delete('shield');
          updateHud();
        }
      }
    }

    // Mini enemy ticking
    for (let mi = miniEnemies.length - 1; mi >= 0; mi--) {
      const me = miniEnemies[mi];
      me.x += (me.vx || 0) * dt;
      me.y += (me.vy || 60) * dt;
      me.shootTimer = (me.shootTimer || 2) - dt;
      if (me.shootTimer <= 0) {
        me.shootTimer = 1.5 + Math.random();
        invBullets.push({ x: me.x, y: me.y + 8, w: 4, h: 10, vy: 160 });
      }
      if (me.y > H + 30) { miniEnemies.splice(mi, 1); continue; }
    }

    // Invader grid movement (hunters drift toward player)
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
          // Hunters: additional eased drift toward player's X
          if (i.type === 'hunter') {
            const targetX = player.x + player.w / 2 - i.w / 2;
            drift += (targetX - i.x) * 0.9 * dt;
          }
          // Zigzag: sinusoidal Y movement
          if (i.type === 'zigzag') {
            i.y += Math.sin(elapsed * 4 + i.seed) * 30 * dt;
          }
          // Kamikaze: dive toward player once they get low on the screen
          if (i.type === 'kamikaze' && i.y > H * 0.35) {
            const tx = player.x + player.w / 2 - i.w / 2;
            i.x += (tx - i.x) * 3 * dt;
            i.y += 90 * dt;
          }
          // Cloaked: update visibility
          if (i.type === 'cloaked') {
            i.cloakAlpha = 0.2 + 0.8 * (Math.sin(elapsed * 2 + i.seed) + 1) / 2;
          }
          // Golden: figure-8 movement
          if (i.type === 'golden') {
            i.x += Math.cos(elapsed * 2 + i.seed) * 60 * dt;
            i.y += Math.sin(elapsed * 4 + i.seed) * 20 * dt;
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

    // Boss movement & phase-based shooting
    if (boss) {
      const bossPhase = getBossPhase(boss);
      const phaseSpeedMult = bossPhase === 3 ? BOSS_PHASE3_SPEED_MULT
                           : bossPhase === 2 ? BOSS_PHASE2_SPEED_MULT
                           : BOSS_PHASE1_SPEED_MULT;
      boss.x += boss.speed * slowMult * boss.dir * phaseSpeedMult * dt;
      if (boss.x <= 0)          { boss.x = 0;          boss.dir =  1; }
      if (boss.x + boss.w >= W) { boss.x = W - boss.w; boss.dir = -1; }
      invShootTimer -= dt;
      if (invShootTimer <= 0.15) boss.flashTimer = 0.15;
      if (boss.flashTimer > 0)   boss.flashTimer -= dt;
      if (boss.hitTimer > 0)     boss.hitTimer   -= dt;
      boss.hpDisplay += (boss.hp - boss.hpDisplay) * Math.min(1, dt * 14);
      if (invShootTimer <= 0) {
        const baseInterval = rand(BOSS_SHOOT_INTERVAL_MIN, BOSS_SHOOT_INTERVAL_MAX) *
          Math.max(BOSS_SHOOT_INTERVAL_SCALE_MIN, 1 - wave * BOSS_SHOOT_INTERVAL_PER_WAVE);
        let spread, speed, interval;
        if (bossPhase === 1) {
          spread   = BOSS_SPREAD_NORMAL;
          speed    = (BOSS_BULLET_SPEED_BASE + wave * BOSS_BULLET_SPEED_PER_WAVE) * slowMult;
          interval = baseInterval;
        } else if (bossPhase === 2) {
          spread   = BOSS_SPREAD_AGGRESSIVE;
          speed    = (BOSS_BULLET_SPEED_BASE + wave * BOSS_BULLET_SPEED_PER_WAVE) * 1.25 * slowMult;
          interval = baseInterval * 0.75;
        } else {
          spread   = BOSS_SPREAD_PHASE3;
          speed    = (BOSS_BULLET_SPEED_BASE + wave * BOSS_BULLET_SPEED_PER_WAVE) * 1.6 * slowMult;
          interval = baseInterval * 0.5;
        }
        invShootTimer = interval / getBossAggressionMult(director);
        for (const sx of spread) {
          invBullets.push({ x: boss.x + boss.w / 2 + sx, y: boss.y + boss.h, w: 4, h: 14, vy: speed });
        }
      }
    }

    // Enemy bullet movement (supports vx for bomber radial bullets)
    for (const b of invBullets) {
      b.y += b.vy * dt;
      if (b.vx !== undefined) b.x += b.vx * dt;
    }
    invBullets = invBullets.filter((b) => b.y < H + 20 && b.y > -H && b.x > -60 && b.x < W + 60);

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

    // â”€â”€ Bomb detonation pass (before normal bullet collision) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      if (!b.isBomb) continue;
      // Check for any collision that should trigger the bomb
      let shouldDetonate = false;
      for (const bunker of bunkers) {
        for (const blk of bunker) {
          if (blk.hp > 0 && rectsOverlap(b.x, b.y, b.w, b.h, blk.x, blk.y, BUNKER_BLOCK_W, BUNKER_BLOCK_H)) {
            shouldDetonate = true; break;
          }
        }
        if (shouldDetonate) break;
      }
      if (!shouldDetonate) {
        for (const inv of invaders) {
          if (inv.alive && rectsOverlap(b.x, b.y, b.w, b.h, inv.x, inv.y, inv.w, inv.h)) {
            shouldDetonate = true; break;
          }
        }
      }
      if (!shouldDetonate && boss && rectsOverlap(b.x, b.y, b.w, b.h, boss.x, boss.y, boss.w, boss.h)) {
        shouldDetonate = true;
      }
      if (!shouldDetonate) continue;

      detonateBomb(b.x + b.w / 2, b.y + b.h / 2);
      bullets.splice(bi, 1);

      // Check if bomb killed the boss
      if (boss && boss.hp <= 0) {
        addScore(500 * wave * bossDmgBoost * waveScoreMult * getScoreMultiplier(activePowerups) * getUpgradedScoreMult(upgrades),
          boss.x + boss.w * 0.5, boss.y - 16, '#ff4fd1');
        spawnExplosion(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5, 2.0, '#ff4444');
        screenShake(12, 0.4);
        playSfx('explosion');
        if (Math.random() < POWERUP_BOSS_DROP_CHANCE) powerupItems.push(makeDroppedPowerup(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5));
        runStats.bossesDefeated++;
        boss = null;
        completeWave();
        updateEffects(dt);
        return;
      }
      // Check if bomb cleared all invaders
      if (!boss && invaders.every((i) => !i.alive)) {
        completeWave();
        updateEffects(dt);
        return;
      }
    }

    // â”€â”€ Player bullets vs bunkers + invaders + boss â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b   = bullets[bi];
      if (b.isBomb) continue; // already handled above
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
      if (hit) { if (!b.piercing) bullets.splice(bi, 1); continue; }

      for (let ii = invaders.length - 1; ii >= 0; ii--) {
        const inv = invaders[ii];
        if (!inv.alive) continue;
        if (rectsOverlap(b.x, b.y, b.w, b.h, inv.x, inv.y, inv.w, inv.h)) {
          if (inv.shieldHp > 0) {
            inv.shieldHp--;
            inv.shieldHitTimer = 0.2;
            spawnExplosion(b.x, b.y, 0.3, '#2ec5ff');
            playSfx('hit');
          } else {
            const dmg = b.dmg || 1;
            inv.hp -= dmg;
            inv.hitTimer = 0.12;
            // Explosive rounds
            if (!empActive && upgrades.explosiveRounds > 0) {
              spawnExplosion(b.x, b.y, 0.5, '#ff6b2b');
              for (const other of invaders) {
                if (!other.alive || other === inv) continue;
                const dx = (other.x + other.w / 2) - (inv.x + inv.w / 2);
                const dy = (other.y + other.h / 2) - (inv.y + inv.h / 2);
                if (dx * dx + dy * dy <= 40 * 40) { other.hp -= 1; if (other.hp <= 0) other.alive = false; }
              }
            }
            if (inv.hp <= 0) {
              inv.alive = false;
              streak++;
              streakTimer = 1.8;
              const pts = calcInvaderPoints(inv, wave, streak, { STREAK_BONUS_RATE, MAX_STREAK_BONUS })
                * getScoreMultiplier(activePowerups) * getUpgradedScoreMult(upgrades) * waveScoreMult;

              // Golden invader bonus
              if (inv.type === 'golden') {
                addScore(pts * 3, inv.x + inv.w * 0.5, inv.y, '#ffd700');
                powerupItems.push(makeDroppedPowerup(inv.x + inv.w * 0.5, inv.y + inv.h));
                addFloatingText('GOLDEN!', '#ffd700');
                playSfx('legendary');
              } else {
                addScore(pts, inv.x + inv.w * 0.5, inv.y, '#f7c948');
              }

              // Splitter: spawn 2 baby invaders
              if (inv.type === 'splitter') {
                for (let s = 0; s < 2; s++) {
                  invaders.push({
                    x: inv.x + (s - 0.5) * 12, y: inv.y, w: inv.w * 0.6, h: inv.h * 0.6,
                    hp: 1, maxHp: 1, alive: true, type: 'basic',
                    row: inv.row, col: inv.col, seed: Math.random() * 100,
                    hitTimer: 0, shieldHp: 0, shieldHitTimer: 0,
                    mutations: [], healTimer: 3, sniperTimer: 4, cloakAlpha: 1,
                  });
                }
              }

              // Chain lightning
              if (!empActive && upgrades.chainLightning > 0) {
                const targets = invaders
                  .filter(o => o.alive && o !== inv)
                  .map(o => ({ o, d2: (o.x - inv.x) ** 2 + (o.y - inv.y) ** 2 }))
                  .sort((a, b2) => a.d2 - b2.d2)
                  .slice(0, 2);
                for (const { o, d2 } of targets) {
                  if (d2 <= 120 * 120) { o.hp -= 1; if (o.hp <= 0) { o.alive = false; } spawnExplosion(o.x + o.w / 2, o.y + o.h / 2, 0.3, '#80d8ff'); }
                }
              }

              // Bomber death: radial bullet burst + chain explosion
              if (inv.type === 'bomber') {
                playSfx('explosion');
                spawnExplosion(inv.x + inv.w * 0.5, inv.y + inv.h * 0.5, 1.4, '#ff6b2b');
                const bx = inv.x + inv.w / 2;
                const by = inv.y + inv.h / 2;
                const bombSpd = 170 + wave * 6;
                for (let k = 0; k < 8; k++) {
                  const angle = (k / 8) * Math.PI * 2;
                  invBullets.push({ x: bx - 2, y: by - 6, w: 4, h: 10,
                                    vy: bombSpd * Math.sin(angle),
                                    vx: bombSpd * Math.cos(angle) });
                }
              } else {
                spawnExplosion(inv.x + inv.w * 0.5, inv.y + inv.h * 0.5, 0.7, '#ff4fd1');
                playSfx('hit');
              }
              if (Math.random() < POWERUP_DROP_CHANCE) powerupItems.push(makeDroppedPowerup(inv.x + inv.w * 0.5, inv.y + inv.h));
              if (!boss && invaders.every((i) => !i.alive)) {
                if (!b.piercing) bullets.splice(bi, 1);
                completeWave();
                updateEffects(dt);
                return;
              }
            } else {
              playSfx('hit');
            }
          }
          hit = true;
          if (!b.piercing) break;
        }
      }

      if (!hit && boss && rectsOverlap(b.x, b.y, b.w, b.h, boss.x, boss.y, boss.w, boss.h)) {
        hit = true;
        const dmg = (b.dmg || 1) * bossDmgBoost * modBossHunterMult;
        boss.hp -= dmg;
        boss.hitTimer = 0.12;
        addScore(20 * wave * dmg * waveScoreMult * getScoreMultiplier(activePowerups) * getUpgradedScoreMult(upgrades),
          boss.x + boss.w * 0.5, boss.y - 4, '#ff9b9b');
        spawnExplosion(b.x, b.y, 0.5, '#ff8888');
        screenShake(3, 0.12);
        playSfx('hit');
        if (boss.hp <= 0) {
          addScore(500 * wave * bossDmgBoost * waveScoreMult * getScoreMultiplier(activePowerups) * getUpgradedScoreMult(upgrades),
            boss.x + boss.w * 0.5, boss.y - 16, '#ff4fd1');
          spawnExplosion(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5, 1.9, '#ff4444');
          screenShake(10, 0.35);
          playSfx('explosion');
          if (Math.random() < POWERUP_BOSS_DROP_CHANCE) powerupItems.push(makeDroppedPowerup(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5));
          runStats.bossesDefeated++;
          boss = null;
          completeWave();
          updateEffects(dt);
          return;
        }
      }

      if (hit && !b.piercing) bullets.splice(bi, 1);
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
          _damageFlagThisFrame = true;
          streak = 0;
          streakTimer = 0;
          if (lives <= 0) {
            if (!reviveUsed && upgrades.revive > 0) {
              lives      = 1;
              reviveUsed = true;
              addFloatingText('REVIVED!', '#3fb950');
              updateHud();
            } else {
              onGameOver(); updateEffects(dt); return;
            }
          }
        }
      }
    }

    // â”€â”€ Per-frame intensity update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      const alive    = invaders.filter((i) => i.alive);
      const pcx      = player.x + player.w / 2;
      const pcy      = player.y + player.h / 2;
      const nearCount = alive.filter((i) => {
        const dx = (i.x + i.w / 2) - pcx;
        const dy = (i.y + i.h / 2) - pcy;
        return dx * dx + dy * dy < 140 * 140;
      }).length;
      updateIntensity(director, dt, {
        damageTaken:       _damageFlagThisFrame,
        enemiesNearPlayer: nearCount,
        bossActive:        !!boss,
        lives,
        waveClear:         false,
      });
      if (director.intensity > runStats.highestIntensity) {
        runStats.highestIntensity = director.intensity;
      }
    }

    // â”€â”€ Intensity threshold crossings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      const iv   = director.intensity;
      const band = iv >= 80 ? 'chaotic' : iv >= 60 ? 'rising' : 'calm';
      if (band !== intensityPrevBand) {
        if (band === 'rising' && intensityPrevBand === 'calm') {
          intensityPulseTimer = 0.4;
          intensityPulseColor = '#ff8800';
          playSfx('boss_warning');
        } else if (band === 'chaotic') {
          intensityPulseTimer = 0.7;
          intensityPulseColor = '#ff0055';
          screenShake(4, 0.35);
          playSfx('boss_warning');
        } else if (band === 'calm' && intensityPrevBand !== 'calm') {
          recoveryTimer = 0.6;
          playSfx('wave_clear');
        }
        intensityPrevBand = band;
      }
      if (intensityPulseTimer > 0) intensityPulseTimer = Math.max(0, intensityPulseTimer - dt);
    }

    // â”€â”€ Milestone toasts tick â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    for (let ti = milestoneToasts.length - 1; ti >= 0; ti--) {
      milestoneToasts[ti].timer -= dt;
      if (milestoneToasts[ti].timer <= 0) milestoneToasts.splice(ti, 1);
    }

    updateEffects(dt);
  }

  // â”€â”€ Draw (delegates to renderer) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function draw() {
    const bossPhase = boss ? getBossPhase(boss) : 0;
    renderer.draw({
      running, paused, gameOver, score, lives, wave,
      elapsed, streak, streakTimer, waveIntroTimer, WAVE_INTRO_DURATION,
      shakeTime, shakeIntensity,
      player, invaders, boss, bossPhase, bullets, invBullets,
      bunkers, powerupItems, activePowerups,
      particles, scoreTexts, hitFlashes, stars,
      upgradePhase, upgradeChoices, upgrades,
      screenFlashTimer, droneAngle, bombCooldown,
      // Roguelite additions
      warningBanner, eventBanner, mutationFlash,
      activeModifier, activeEvent,
      empActive, empTimer, panicMode, panicTimer,
      asteroids, laserWarning, miniEnemies,
      riskRewardPhase, riskRewardChoices,
      // Intensity feedback + meta
      intensity: director.intensity,
      intensityPulseTimer, intensityPulseColor,
      recoveryTimer,
      runSummary,
      milestoneToasts,
    });
  }

  // â”€â”€ Engine hooks (loop + input via BaseGame) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  engine.onTick    = (dt) => { update(dt); draw(); };
  engine.onKeyDown = (e)  => {
    // During the risk/reward screen: 1/2 select, then move to upgrade screen
    if (riskRewardPhase === 'picking') {
      const idx = { '1': 0, '2': 1 }[e.key];
      if (idx !== undefined && riskRewardChoices[idx]) {
        activeRiskReward  = riskRewardChoices[idx];
        riskRewardPhase   = false;
        riskRewardChoices = [];
        playSfx('upgrade');
        // Apply one-time risk/reward effects immediately
        if (activeRiskReward.id === 'skipWave') {
          activeRiskReward = null;
          startWave();
          return;
        }
        if (activeRiskReward.id === 'noShield') {
          // Applied at wave start
        }
        if (activeRiskReward.id === 'blackoutWave') {
          // Will be applied via forceModifier in startWave (handled via activeRiskReward)
        }
        // Now show upgrade screen
        upgradeChoices = pickUpgradeChoicesWithRarity(upgrades, wave);
        upgradePhase   = 'picking';
      }
      return;
    }
    // During the upgrade screen: 1/2/3 select an upgrade, then start next wave
    if (upgradePhase === 'picking') {
      const idx = { '1': 0, '2': 1, '3': 2 }[e.key];
      if (idx !== undefined && upgradeChoices[idx]) {
        const def = upgradeChoices[idx];
        // Add piercing flag to bullets if needed
        const applied = applyUpgrade(def.id, upgrades);
        if (!applied) {
          // Already maxed â€” grant a score bonus instead
          addScore(wave * 200 + 500, W / 2, H / 2, '#bc8cff');
        }
        // Update bossDmgBoost
        bossDmgBoost = upgrades.bossDmg > 0 ? 1 + upgrades.bossDmg * 0.5 : 1;
        upgradePhase   = false;
        upgradeChoices = [];
        screenFlashTimer = 0.35;
        playSfx('upgrade');
        startWave();
      }
      return; // block all other keys during upgrade screen
    }
    // Slow dodge double-tap detection
    if (e.key === 'ArrowLeft' || e.key === 'a') {
      const now = performance.now() / 1000;
      if (now - lastLeftTapTime < 0.3 && upgrades.slowDodge > 0) {
        slowDodgeActive = true;
        slowDodgeTimer  = 1.5;
      }
      lastLeftTapTime = now;
    }
    if (e.key === 'ArrowRight' || e.key === 'd') {
      const now = performance.now() / 1000;
      if (now - lastRightTapTime < 0.3 && upgrades.slowDodge > 0) {
        slowDodgeActive = true;
        slowDodgeTimer  = 1.5;
      }
      lastRightTapTime = now;
    }
    if (e.key === ' ' && running && !paused && waveIntroTimer <= 0) tryShoot();
    if ((e.key === 'b' || e.key === 'B') && running && !paused) tryBombShot();
  };

  // â”€â”€ Game over â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async function onGameOver() {
    running  = false;
    gameOver = true;
    stopAllSounds();
    setBestMaybe();
    updateHud();
    playSfx('game_over');

    // Build run summary and persist meta-stats
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
      score,
      wave,
      bossesDefeated:   runStats.bossesDefeated,
      upgradeCount:     Object.values(upgrades).reduce((a, b) => a + (Number(b) || 0), 0),
      highestIntensity: runStats.highestIntensity,
      survival:         survivalTime,
    });
    // Queue milestone toasts so they display on the summary screen
    for (const text of newMilestones) {
      milestoneToasts.push({ text, timer: 6.0 });
    }

    emitInvadersDebug("game_over_score_submit_start", {
      game: GAME_ID,
      score,
      linked: !!window.MOONBOYS_IDENTITY?.isTelegramLinked?.(),
    });
    if (score > 0) {
      const playerName = window.MOONBOYS_IDENTITY?.getTelegramName?.() || ArcadeSync.getPlayer();
      try {
        const submitResult = await submitScore(playerName, score, GAME_ID);
        emitInvadersDebug("game_over_score_submit_result", {
          game: GAME_ID,
          score,
          player: playerName,
          accepted: !!submitResult?.accepted,
          linked: !!submitResult?.linked,
          state: submitResult?.state || "unknown",
        });
      } catch (e) {
        emitInvadersDebug("game_over_score_submit_error", {
          game: GAME_ID,
          score,
          error: String((e && e.message) || e || "unknown_error"),
        });
      }
    }
    draw();
    if (window.showGameOverModal) window.showGameOverModal(score);
  }

  // â”€â”€ Lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
