import { ArcadeSync }                        from '/js/arcade-sync.js';
import { submitScore }                       from '/js/leaderboard-client.js';
import { SNAKE_CONFIG } from './config.js';
import { createGameAdapter, registerGameAdapter } from '/js/arcade/engine/game-adapter.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';
import { createFrameDebug } from '/js/arcade/core/frame-debug.js';
import { recordRunStats, checkMilestones } from './meta-system.js';
import { createScalingDirector, tickDirector, shouldFirePressureEvent, updateIntensity, checkForcedChaos } from '/js/arcade/systems/event-system.js';
import { getActiveModifiers, hasEffect, getStatEffect } from '/js/arcade/systems/cross-game-modifier-system.js';
import {
  getPlayerFaction, getFactionEffects,
  applyFactionScore, applyFactionStartingShield, applyFactionEventRate, applyFactionComboBonus,
} from '/js/arcade/systems/faction-effect-system.js';
import { recordContribution } from '/js/arcade/systems/faction-war-system.js';
import { recordMissionProgress } from '/js/arcade/systems/faction-missions.js';
import { recordLogin, recordWarContribution } from '/js/arcade/systems/faction-streaks.js';
import { checkRankUp } from '/js/arcade/systems/faction-ranks.js';
import { emitFactionGain } from '/js/arcade/systems/live-activity.js';

export const SNAKE_ADAPTER = createGameAdapter({
  id: SNAKE_CONFIG.id,
  name: SNAKE_CONFIG.label,
  systems: { upgrade: true, director: true, event: true, mutation: true, boss: true, risk: true, meta: true, feedback: true },
  legacyBootstrap: function (root) {
    return bootstrapSnake(root);
  },
});

registerGameAdapter(SNAKE_CONFIG, SNAKE_ADAPTER, bootstrapSnake);
var FOOD_VISUALS = Object.freeze({
  normal:     { color: '#f7ab1a', halo: '#fff0b5', label: 'CORE',      points: 10, icon: 'â—' },
  speed:      { color: '#36f7d7', halo: '#bffcff', label: 'BOOST',     points: 16, icon: 'âš¡' },
  multiplier: { color: '#ff4fd1', halo: '#ffd3f4', label: 'MULTI',     points: 20, icon: 'âœ¶' },
  ghost:      { color: '#9d7dff', halo: '#d9cfff', label: 'GHOST',     points: 18, icon: 'â—Œ' },
  chaos:      { color: '#ff5f5f', halo: '#ffd3d3', label: 'CHAOS',     points: 22, icon: 'â˜¢' },
});

var MAX_FOOD_SPAWN_ATTEMPTS = 600;
var BACKGROUND_NOISE_POINTS = 85;
var EYE_DIRECTION_OFFSET = 0.2;
var EYE_PERPENDICULAR_OFFSET = 0.23;
var MAX_FRAME_DELTA_SEC = 0.06;
var COMBO_STEP = 0.24;
var COMBO_CAP_STEPS = 12;
var LENGTH_BASE_SEGMENTS = 3;
var LENGTH_STEP = 0.035;
var LENGTH_CAP = 1.6;
var HEAT_SCORE_SCALE = 1800;
var HEAT_TIME_SCALE = 78;
var HEAT_LENGTH_SCALE = 60;
var HEAT_COMBO_STEP = 0.03;
var HEAT_COMBO_CAP = 0.25;
var HEAT_STEP_REDUCTION = 42;
var HEAT_LENGTH_MS_CAP = 24;
var HEAT_LENGTH_MS_STEP = 0.35;
var MAX_FRAME_CATCHUP_STEPS = 8;

export function bootstrapSnake(root) {
  const frameDebug = createFrameDebug(SNAKE_CONFIG.id);
  var canvas = document.getElementById('snakeCanvas');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var comboEl = document.getElementById('combo') || document.getElementById('streak');
  var speedLabel = document.getElementById('speedLabel');
  var startBtnEl = document.getElementById('startBtn');
  var pauseBtnEl = document.getElementById('pauseBtn');
  var resetBtnEl = document.getElementById('resetBtn');

  var GAME_ID = SNAKE_CONFIG.id;
  var grid = SNAKE_CONFIG.grid;
  var size = canvas.width / grid;
  var movement = SNAKE_CONFIG.movement;
  var effects = SNAKE_CONFIG.effects;
  var specialFoods = SNAKE_CONFIG.specialFoods;
  var W = canvas.width;
  var H = canvas.height;

  var running = false;
  var paused = false;
  var gameOver = false;
  var score = 0;
  var best = ArcadeSync.getHighScore(GAME_ID);
  var heat = 0;
  var timeAlive = 0;
  var comboCount = 0;
  var comboTimer = 0;
  var lastEatTimeSec = -(SNAKE_CONFIG.movement.comboWindowSec + 1);

  var snake = [];
  var prevSnake = [];
  var dir = { x: 1, y: 0 };
  var nextDir = { x: 1, y: 0 };
  var food = null;
  var extraFoods = [];          // food-flood extras — cleared when timer expires

  var speedBoostTimer = 0;
  var multiplierTimer = 0;
  var ghostTimer = 0;
  var chaosTimer = 0;
  var chaosJitter = 0;
  var gridFlickerTimer = 0;

  var doublePickupsLeft = 0;
  var comboSavePending = false;

  var particles = [];
  var floatingTexts = [];
  var shakeTime = 0;
  var shakeIntensity = 0;

  var raf = null;
  var lastFrameSec = 0;
  var accumulatorMs = 0;
  var renderTime = 0;
  var frozenRenderTime = 0;

  // === Roguelite / Director constants ===
  var WAVE_SIZE = 10;
  var BOSS_WAVE_EVERY = 5;
  var MUTATION_CHANCE = 0.22; // probability that a food item becomes mutated
  var UPGRADE_DEFS = [
    { id: 'scoreBoost',   name: '📈 Score Frenzy',  rarity: 'common',    desc: '+20% score on all food this run.',          apply: function(r) { r.scoreMult += 0.20; } },
    { id: 'speedDown',    name: '🐢 Slow Burn',      rarity: 'common',    desc: 'Base movement 8% slower (more control).',   apply: function(r) { r.speedSlowdown += 0.08; } },
    { id: 'comboBonus',   name: '⛓ Chain Master',   rarity: 'uncommon',  desc: 'Combo window +0.4 seconds.',                apply: function(r) { r.comboWindowBonus += 0.4; } },
    { id: 'shield',       name: '🛡 Ghost Skin',      rarity: 'rare',      desc: 'Next self-collision is blocked once.',      apply: function(r) { r.shieldCharges += 1; } },
    { id: 'doubleFood',   name: '✶ Double Harvest',  rarity: 'uncommon',  desc: 'Next 3 food pickups count as double.',      apply: function(r) { r.doublePickupBonus += 3; } },
    { id: 'lengthBonus',  name: '🔮 Surge Protocol', rarity: 'rare',      desc: '+15% score for every 5 segments of length.', apply: function(r) { r.lengthScaleBonus += 0.15; } },
    { id: 'revive',       name: '💎 Nano Respawn',   rarity: 'legendary', desc: 'One respawn token — survives one collision.', apply: function(r) { r.reviveTokens += 1; } },
  ];
  var RARITY_COLORS = { common: '#88ccee', uncommon: '#3fb950', rare: '#f7c948', legendary: '#ff4fd1' };

  var SNAKE_EVENTS = [
    { id: 'foodFlood',   minWave: 2, weight: 1.2, execute: function() {
        eventFoodFlood = 6;
        // Spawn 2 extra food items that coexist with the main food for the duration
        for (var _i = 0; _i < 2; _i++) extraFoods.push(spawnExtraFood());
        spawnFloatingTextLocal('🍎 FOOD FLOOD!', '#3fb950');
      }
    },
    { id: 'reverseWind', minWave: 3, weight: 0.9, execute: function() {
        eventReverseTimer = 5;
        spawnFloatingTextLocal('🌀 REVERSE WIND!', '#bc8cff');
      }
    },
    { id: 'chaosField',  minWave: 2, weight: 1.0, execute: function() { chaosTimer = Math.max(chaosTimer, 4); spawnFloatingTextLocal('☢ CHAOS FIELD!', '#ff5f5f'); } },
    { id: 'goldenRush',  minWave: 4, weight: 0.8, execute: function() { eventGoldenRush = 8; spawnFloatingTextLocal('⭐ GOLDEN RUSH!', '#f7c948'); } },
    { id: 'speedGhost',  minWave: 3, weight: 0.9, execute: function() { ghostTimer = Math.max(ghostTimer, 5); speedBoostTimer = Math.max(speedBoostTimer, 3); spawnFloatingTextLocal('👻 SPEED GHOST!', '#9d7dff'); } },
  ];

  var MUTATION_DEFS = [
    { id: 'mega',   threshold: 40, apply: function(f) { f.mutated = 'mega';   f.points = Math.floor(f.points * 2.2); f.color = '#ff8c00'; f.label = 'MEGA'; } },
    { id: 'golden', threshold: 60, apply: function(f) { f.mutated = 'golden'; f.points = Math.floor(f.points * 3.5); f.color = '#f7c948'; f.label = 'GOLDEN'; } },
    { id: 'toxic',  threshold: 75, apply: function(f) { f.mutated = 'toxic';  f.points = Math.floor(f.points * 1.6); f.color = '#4cff6e'; f.label = 'TOXIC'; f.toxic = true; } },
    { id: 'boss',   threshold: 90, apply: function(f) { f.mutated = 'boss';   f.points = Math.floor(f.points * 5.0); f.color = '#ff4fd1'; f.label = 'APEX'; f.moving = true; } },
  ];

  // === Run / wave state ===
  var wave = 0;
  var foodEaten = 0;
  var lastWaveFoodCount = 0;
  var snakePhase = 'combat';
  var snakeUpgradeChoices = [];
  var director = null;
  var runStats = { bossesDefeated: 0, highestIntensity: 0, upgradeCount: 0 };
  var run = null;
  var submittedMeta = false;
  var snakeOverlayEl = null;
  var snakeBannerQueue = [];
  var snakeBannerTimer = 0;
  var eventFoodFlood = 0;
  var eventReverseTimer = 0;
  var eventGoldenRush = 0;

  // === Helper functions ===
  function spawnFloatingTextLocal(text, color) {
    spawnFloatingText(text, W * 0.5, H * 0.2, color || '#f7c948', 1.1);
  }

  function initRunState() {
    run = { scoreMult: 1, speedSlowdown: 0, comboWindowBonus: 0, shieldCharges: 0, doublePickupBonus: 0, lengthScaleBonus: 0, reviveTokens: 0 };
    runStats = { bossesDefeated: 0, highestIntensity: 0, upgradeCount: 0 };
    wave = 0;
    foodEaten = 0;
    lastWaveFoodCount = 0;
    snakePhase = 'combat';
    director = createScalingDirector();
    submittedMeta = false;
    eventFoodFlood = 0;
    eventReverseTimer = 0;
    eventGoldenRush = 0;
    extraFoods = [];
    hideSnakeUpgradeModal();

    // Apply cross-game modifier effects for this run
    const crossMods = getActiveModifiers(GAME_ID, SNAKE_CONFIG.crossGameTags || []);
    if (hasEffect(crossMods, 'scoreMult')) {
      run.scoreMult *= getStatEffect(crossMods, 'scoreMult', 1);
    }
    if (hasEffect(crossMods, 'shieldedStart')) {
      run.shieldCharges += 1;
    }
    // Store pressure-rate multiplier for the director tick
    run._pressureRateMult = getStatEffect(crossMods, 'pressureRate', 1);
    // Store golden-spawn boost for food mutation
    run._goldenSpawnBoost = getStatEffect(crossMods, 'goldenSpawnBoost', 0);

    // Apply faction effects (additive on top of cross-game modifiers)
    try {
      var _faction = getPlayerFaction();
      var _factionFx = getFactionEffects(_faction);
      // Faction score is applied via applyFactionScore() at food-collection time;
      // do NOT also bake it into run.scoreMult to avoid double-application.
      // Faction shield bonus: +1 shield charge for HODL Warriors
      run.shieldCharges = applyFactionStartingShield(run.shieldCharges, _faction, { supportsShield: true });
      // Faction chaos modifier blended with cross-game pressure rate
      run._pressureRateMult *= applyFactionEventRate(1, _faction);
      // Faction combo-window bias: delta = (modifier - 1) * 0.4 seconds (GraffPUNKS: +25%)
      run.comboWindowBonus += (applyFactionComboBonus(1, _faction) - 1) * 0.4;
      // Store faction id on run for onGameOver access
      run._factionId = _faction;
      // Show faction bonus text if meaningful
      if (_factionFx.bonusText) spawnFloatingTextLocal(_factionFx.bonusText, '#f7c948');
    } catch (_) {}
  }

  function maybeMutateFood(f) {
    if (!director) return;
    const intensity = director.intensity || 0;
    // Golden Chance modifier: reduce the mutation threshold so rare mutations appear sooner
    const goldenBoost = (run && run._goldenSpawnBoost) || 0;
    const effectiveIntensity = intensity + goldenBoost * 100;
    var candidates = MUTATION_DEFS.filter(function(m) { return effectiveIntensity >= m.threshold; });
    if (!candidates.length) return;
    if (Math.random() > MUTATION_CHANCE) return;
    var def = candidates[Math.floor(Math.random() * candidates.length)];
    def.apply(f);
  }

  function checkWaveProgress() {
    if (!run || gameOver) return;
    if (foodEaten - lastWaveFoodCount >= WAVE_SIZE) {
      wave++;
      lastWaveFoodCount = foodEaten;
      onWaveClear();
    }
  }

  function onWaveClear() {
    if (!run) return;
    updateIntensity(director, 0, {});
    director.pressure = Math.max(0, director.pressure - 15);
    if (wave % BOSS_WAVE_EVERY === 0 && wave > 0) {
      triggerBossWave();
    } else {
      triggerSnakeUpgradePhase();
    }
  }

  function triggerBossWave() {
    snakePhase = 'boss';
    // bossesDefeated is incremented only when the boss food is actually eaten (in eatFood)
    if (food) {
      food.mutated = 'boss';
      food.points = Math.max(food.points, 120);
      food.color = '#ff4fd1';
      food.label = 'BOSS';
      food.moving = true;
      food.mvx = Math.random() > 0.5 ? 1 : -1;
      food.mvy = 0;
      food.mvTimer = 0;
    }
    spawnFloatingTextLocal('💀 BOSS FOOD!', '#ff4fd1');
    setTimeout(function() {
      if (!gameOver && snakePhase === 'boss') {
        snakePhase = 'combat';
        triggerSnakeUpgradePhase();
      }
    }, 1200);
  }

  function triggerSnakeUpgradePhase() {
    if (gameOver) return;
    snakePhase = 'upgrade';
    running = false;
    var pool = UPGRADE_DEFS.slice();
    var choices = [];
    for (var i = 0; i < 3 && pool.length; i++) {
      var idx = Math.floor(Math.random() * pool.length);
      choices.push(pool.splice(idx, 1)[0]);
    }
    snakeUpgradeChoices = choices;
    showSnakeUpgradeModal();
  }

  function showSnakeUpgradeModal() {
    if (!snakeOverlayEl) {
      snakeOverlayEl = document.createElement('div');
      snakeOverlayEl.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,20,0.88);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:20;font-family:monospace;';
      var gameCard = canvas.closest('.game-card') || canvas.parentElement;
      if (gameCard) { gameCard.style.position = 'relative'; gameCard.appendChild(snakeOverlayEl); }
    }
    var title = document.createElement('h2');
    title.textContent = '⬆ WAVE ' + wave + ' — CHOOSE UPGRADE';
    title.style.cssText = 'color:#36f7d7;margin-bottom:16px;font-size:1rem;text-align:center;';
    var grid2 = document.createElement('div');
    grid2.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:90%;max-width:300px;';
    snakeUpgradeChoices.forEach(function(ch) {
      var btn = document.createElement('button');
      btn.type = 'button';
      var rc = RARITY_COLORS[ch.rarity] || '#aaa';
      btn.style.cssText = 'background:#0d1a2e;border:2px solid ' + rc + ';color:' + rc + ';padding:10px 14px;border-radius:6px;cursor:pointer;text-align:left;';
      btn.innerHTML = '<strong>' + ch.name + '</strong><br><span style="font-size:0.8em;color:#aaa">' + ch.desc + '</span>';
      btn.addEventListener('click', function() { applySnakeUpgradeChoice(ch); });
      grid2.appendChild(btn);
    });
    snakeOverlayEl.innerHTML = '';
    snakeOverlayEl.appendChild(title);
    snakeOverlayEl.appendChild(grid2);
    snakeOverlayEl.style.display = 'flex';
  }

  function applySnakeUpgradeChoice(choice) {
    if (choice && run) {
      choice.apply(run);
      runStats.upgradeCount++;
      if (run.doublePickupBonus > 0) {
        doublePickupsLeft = Math.max(doublePickupsLeft, run.doublePickupBonus);
      }
    }
    hideSnakeUpgradeModal();
    snakePhase = 'combat';
    running = true;
    if (raf === null) {
      lastFrameSec = performance.now() / 1000;
      raf = requestAnimationFrame(frame);
    }
  }

  function hideSnakeUpgradeModal() {
    if (snakeOverlayEl) snakeOverlayEl.style.display = 'none';
  }

  function tickSnakeDirector(dt) {
    if (!director || !run) return;
    // Pass pressure-rate multiplier as 8th arg to slow pressure build by the modifier amount
    tickDirector(director, dt, undefined, undefined, undefined, undefined, undefined, run._pressureRateMult || 1);
    var heatIntensity = Math.min(100, heat * 62);
    director.intensity = Math.max(director.intensity || 0, heatIntensity);
    runStats.highestIntensity = Math.max(runStats.highestIntensity, director.intensity);
    if (eventReverseTimer > 0) eventReverseTimer = Math.max(0, eventReverseTimer - dt);
    if (eventGoldenRush > 0) eventGoldenRush = Math.max(0, eventGoldenRush - dt);
    if (eventFoodFlood > 0) {
      eventFoodFlood = Math.max(0, eventFoodFlood - dt);
      if (eventFoodFlood <= 0) extraFoods = [];  // clear extras when flood ends
    }
    if (shouldFirePressureEvent(director)) {
      var eligible = SNAKE_EVENTS.filter(function(e) { return e.minWave <= wave; });
      if (eligible.length) {
        var pick = eligible[Math.floor(Math.random() * eligible.length)];
        pick.execute();
      }
      director.eventCooldown = 15 + Math.random() * 10;
    }
    var chaos = checkForcedChaos(director);
    if (chaos) {
      chaosTimer = Math.max(chaosTimer, 3);
      chaosJitter = Math.random() * 0.15;
      spawnFloatingTextLocal('🔥 CHAOS!', '#ff4fd1');
    }
    snakeBannerTimer -= dt;
  }

  function getRunScoreMultiplier() {
    if (!run) return 1;
    var mult = run.scoreMult || 1;
    if (eventGoldenRush > 0) mult *= 2;
    var lengthBonus = run.lengthScaleBonus || 0;
    if (lengthBonus > 0 && snake.length >= 5) {
      var groups = Math.floor((snake.length - 5) / 5);
      mult += groups * lengthBonus;
    }
    return mult;
  }

  function getRunComboWindow() {
    var base = SNAKE_CONFIG.movement.comboWindowSec;
    return base + ((run && run.comboWindowBonus) || 0);
  }

  function finalizeMetaRun() {
    if (submittedMeta) return;
    submittedMeta = true;
    var runData = {
      score: score,
      wave: wave,
      survival: Math.round(timeAlive || 0),
      bossesDefeated: runStats.bossesDefeated || 0,
      upgradeCount: runStats.upgradeCount || 0,
      highestIntensity: runStats.highestIntensity || 0,
    };
    try { recordRunStats(runData); checkMilestones(runData); } catch(_) {}
  }

  function playGameSound(id, options) {
    if (isMuted()) return null;
    return playSound(id, options);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  function rand(min, max) { return min + Math.random() * (max - min); }

  function cloneSnake(source) {
    return source.map(function (seg) { return { x: seg.x, y: seg.y }; });
  }

  function centerFromCell(pos) {
    return { x: (pos.x + 0.5) * size, y: (pos.y + 0.5) * size };
  }

  function getInterpolatedSegment(index, alpha) {
    var current = snake[index] || snake[snake.length - 1];
    var previous = prevSnake[index] || current;
    return {
      x: lerp(previous.x, current.x, alpha),
      y: lerp(previous.y, current.y, alpha),
    };
  }

  function getComboMultiplier() {
    return 1 + Math.min(COMBO_CAP_STEPS, Math.max(0, comboCount - 1)) * COMBO_STEP;
  }

  function getLengthMultiplier() {
    return 1 + Math.min(LENGTH_CAP, Math.max(0, snake.length - LENGTH_BASE_SEGMENTS) * LENGTH_STEP);
  }

  function getEffectMultiplier() {
    return multiplierTimer > 0 ? 1.85 : 1;
  }

  function recalcHeat() {
    var scoreFactor = clamp(score / HEAT_SCORE_SCALE, 0, 0.85);
    var timeFactor = clamp(timeAlive / HEAT_TIME_SCALE, 0, 0.7);
    var lengthFactor = clamp((snake.length - LENGTH_BASE_SEGMENTS) / HEAT_LENGTH_SCALE, 0, 0.55);
    var comboFactor = clamp(comboCount * HEAT_COMBO_STEP, 0, HEAT_COMBO_CAP);
    heat = clamp(scoreFactor + timeFactor + lengthFactor + comboFactor, 0, 1.6);
    return heat;
  }

  function getStepMs() {
    var h = recalcHeat();
    var ms = movement.baseStepMs - h * HEAT_STEP_REDUCTION - Math.min(HEAT_LENGTH_MS_CAP, Math.max(0, snake.length - LENGTH_BASE_SEGMENTS) * HEAT_LENGTH_MS_STEP);
    if (speedBoostTimer > 0) ms *= 0.72;
    if (chaosTimer > 0) ms *= 0.9 + chaosJitter;
    return clamp(ms, movement.minStepMs, movement.baseStepMs);
  }

  function getSpeedLabel() {
    var pct = Math.round(clamp(heat / 1.6, 0, 1) * 100);
    var flags = [];
    if (speedBoostTimer > 0) flags.push('BOOST ' + speedBoostTimer.toFixed(1) + 's');
    if (multiplierTimer > 0) flags.push('x2 ' + multiplierTimer.toFixed(1) + 's');
    if (ghostTimer > 0) flags.push('GHOST ' + ghostTimer.toFixed(1) + 's');
    if (chaosTimer > 0) flags.push('CHAOS ' + chaosTimer.toFixed(1) + 's');
    if (eventReverseTimer > 0) flags.push('REVERSE ' + eventReverseTimer.toFixed(1) + 's');
    if (eventFoodFlood > 0) flags.push('FLOOD ' + eventFoodFlood.toFixed(1) + 's');
    if (doublePickupsLeft > 0) flags.push('2xPICK ×' + doublePickupsLeft);
    if (comboSavePending) flags.push('SAVE \u2713');
    return 'HEAT ' + pct + '%' + (flags.length ? ' • ' + flags.join(' • ') : '');
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
    if (comboEl) comboEl.textContent = 'x' + getComboMultiplier().toFixed(2);
    speedLabel.textContent = getSpeedLabel();
  }

  function setBestMaybe() {
    ArcadeSync.setHighScore(GAME_ID, score);
    best = ArcadeSync.getHighScore(GAME_ID);
  }

  function pushParticle(px, py, vx, vy, sizePx, life, color) {
    particles.push({
      x: px,
      y: py,
      vx: vx,
      vy: vy,
      size: sizePx,
      life: life,
      maxLife: life,
      color: color,
    });
    if (particles.length > effects.maxParticles) {
      particles.splice(0, particles.length - effects.maxParticles);
    }
  }

  function spawnBurst(px, py, color, count, speedMul) {
    var mul = speedMul || 1;
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = rand(70, 240) * mul;
      pushParticle(
        px,
        py,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        rand(1.4, 4.2),
        rand(0.24, 0.68),
        color
      );
    }
  }

  function spawnFloatingText(text, x, y, color, scale) {
    floatingTexts.push({
      text: text,
      x: x,
      y: y,
      vy: -24 - (scale || 0) * 16,
      life: 0.9,
      maxLife: 0.9,
      color: color || '#f7c948',
      scale: scale || 1,
    });
    if (floatingTexts.length > effects.maxFloatingTexts) floatingTexts.shift();
  }

  function triggerShake(intensity, duration) {
    shakeIntensity = Math.max(shakeIntensity, intensity);
    shakeTime = Math.max(shakeTime, duration);
  }

  function pickFoodType() {
    var unlockFactor = clamp((timeAlive + score / 8) / 120, 0.4, 1);
    var options = [
      { type: 'normal', weight: specialFoods.normal.weight + (1 - unlockFactor) * 0.3 },
      { type: 'speed', weight: specialFoods.speed.weight * unlockFactor },
      { type: 'multiplier', weight: specialFoods.multiplier.weight * unlockFactor },
      { type: 'ghost', weight: specialFoods.ghost.weight * unlockFactor },
      { type: 'chaos', weight: specialFoods.chaos.weight * unlockFactor },
    ];
    var total = 0;
    for (var i = 0; i < options.length; i++) total += options[i].weight;
    var roll = Math.random() * total;
    var cursor = 0;
    for (var j = 0; j < options.length; j++) {
      cursor += options[j].weight;
      if (roll <= cursor) return options[j].type;
    }
    return 'normal';
  }

  function spawnFood() {
    var type = pickFoodType();
    var visual = FOOD_VISUALS[type] || FOOD_VISUALS.normal;
    var points = (specialFoods[type] && specialFoods[type].points) || visual.points;
    var attempts = 0;
    while (attempts < MAX_FOOD_SPAWN_ATTEMPTS) {
      attempts += 1;
      var candidate = {
        x: Math.floor(Math.random() * grid),
        y: Math.floor(Math.random() * grid),
      };
      var occupied = snake.some(function (seg) { return seg.x === candidate.x && seg.y === candidate.y; });
      if (!occupied) {
        var spawnedFood = {
          x: candidate.x,
          y: candidate.y,
          type: type,
          color: visual.color,
          halo: visual.halo,
          icon: visual.icon,
          label: visual.label,
          points: points,
          pulseSeed: Math.random() * 999,
        };
        maybeMutateFood(spawnedFood);
        return spawnedFood;
      }
    }
    var fallbackFood = {
      x: Math.floor(grid / 2),
      y: Math.floor(grid / 2),
      type: 'normal',
      color: FOOD_VISUALS.normal.color,
      halo: FOOD_VISUALS.normal.halo,
      icon: FOOD_VISUALS.normal.icon,
      label: FOOD_VISUALS.normal.label,
      points: FOOD_VISUALS.normal.points,
      pulseSeed: Math.random() * 999,
    };
    maybeMutateFood(fallbackFood);
    return fallbackFood;
  }

  // Spawn an extra food item for food-flood events, avoiding snake + main food + existing extras.
  function spawnExtraFood() {
    var visual = FOOD_VISUALS.normal;
    for (var attempts = 0; attempts < MAX_FOOD_SPAWN_ATTEMPTS; attempts++) {
      var candidate = {
        x: Math.floor(Math.random() * grid),
        y: Math.floor(Math.random() * grid),
      };
      var blocked = snake.some(function(seg) { return seg.x === candidate.x && seg.y === candidate.y; });
      if (!blocked && food && food.x === candidate.x && food.y === candidate.y) blocked = true;
      if (!blocked) {
        for (var ei = 0; ei < extraFoods.length; ei++) {
          if (extraFoods[ei].x === candidate.x && extraFoods[ei].y === candidate.y) { blocked = true; break; }
        }
      }
      if (!blocked) {
        return {
          x: candidate.x,
          y: candidate.y,
          type: 'normal',
          color: '#3fb950',
          halo: '#b8ffcc',
          icon: '🍎',
          label: 'FLOOD',
          points: 15,
          pulseSeed: Math.random() * 999,
          isExtra: true,
        };
      }
    }
    // Fallback — place at a safe-ish corner
    return {
      x: Math.floor(Math.random() * 4),
      y: Math.floor(Math.random() * 4),
      type: 'normal',
      color: '#3fb950',
      halo: '#b8ffcc',
      icon: '🍎',
      label: 'FLOOD',
      points: 15,
      pulseSeed: Math.random() * 999,
      isExtra: true,
    };
  }


  function clearRuntimeState() {
    score = 0;
    timeAlive = 0;
    heat = 0;
    comboCount = 0;
    comboTimer = 0;
    lastEatTimeSec = -(movement.comboWindowSec + 1);
    speedBoostTimer = 0;
    multiplierTimer = 0;
    ghostTimer = 0;
    chaosTimer = 0;
    chaosJitter = 0;
    gridFlickerTimer = 0;
    doublePickupsLeft = 0;
    comboSavePending = false;
    particles = [];
    floatingTexts = [];
    shakeTime = 0;
    shakeIntensity = 0;
    accumulatorMs = 0;
    extraFoods = [];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    snake = [{ x: 12, y: 12 }, { x: 11, y: 12 }, { x: 10, y: 12 }];
    prevSnake = cloneSnake(snake);
    food = spawnFood();
    setBestMaybe();
    updateHud();
    initRunState();
  }

  // Probabilistic gameplay-modifier bonus â€” no fake score injection.
  // Every modifier affects actual play: pickup value, speed, ghost phase, or streak survival.
  var BONUS_CHANCE_BASE = 0.18;
  var BONUS_CHANCE_COMBO_STEP = 0.04;
  var BONUS_CHANCE_CAP = 0.45;

  function rollGameplayBonus() {
    var chance = Math.min(BONUS_CHANCE_CAP, BONUS_CHANCE_BASE + comboCount * BONUS_CHANCE_COMBO_STEP);
    if (Math.random() > chance) return;

    var roll = Math.random();
    if (roll < 0.28) {
      // Double food value for the next 1â€“3 real pickups.
      var extra = 1 + Math.floor(Math.random() * 3);
      doublePickupsLeft = Math.max(doublePickupsLeft, extra);
      spawnFloatingText('2x NEXT ' + doublePickupsLeft, W * 0.5, H * 0.18, '#9de7ff', 1.1);
    } else if (roll < 0.50) {
      // Bonus speed window â€” pick up more food while it lasts.
      speedBoostTimer = Math.max(speedBoostTimer, specialFoods.speed.durationSec * 0.7);
      spawnFloatingText('BONUS BOOST', W * 0.5, H * 0.18, '#76fff0', 1.1);
    } else if (roll < 0.68) {
      // Extend the active multiplier window (or seed a short one).
      multiplierTimer = Math.max(multiplierTimer + specialFoods.multiplier.durationSec * 0.5,
        specialFoods.multiplier.durationSec * 0.5);
      spawnFloatingText('x2 EXTENDED', W * 0.5, H * 0.18, '#ff8ce3', 1.1);
    } else if (roll < 0.84) {
      // One-time combo save â€” next expiry resets to 1 instead of 0.
      comboSavePending = true;
      spawnFloatingText('SAVE ARMED', W * 0.5, H * 0.18, '#ffe08e', 1.1);
    } else {
      // Brief ghost phase â€” body-collision bypass tied to real survival.
      ghostTimer = Math.max(ghostTimer, specialFoods.ghost.durationSec * 0.5);
      spawnFloatingText('PHASE BONUS', W * 0.5, H * 0.18, '#baabff', 1.1);
    }
  }

  function getRandomPerpendicularDirection(direction) {
    if (direction.x !== 0) return { x: 0, y: Math.random() > 0.5 ? 1 : -1 };
    return { x: Math.random() > 0.5 ? 1 : -1, y: 0 };
  }

  function applyFoodEffect(type) {
    if (type === 'speed') {
      speedBoostTimer = Math.max(speedBoostTimer, specialFoods.speed.durationSec);
      playGameSound('snake-boost');
      spawnFloatingText('SPEED BOOST', W * 0.5, H * 0.22, '#76fff0', 1.05);
      return;
    }
    if (type === 'multiplier') {
      multiplierTimer = Math.max(multiplierTimer, specialFoods.multiplier.durationSec);
      playGameSound('snake-multiplier');
      spawnFloatingText('x2 MULTIPLIER', W * 0.5, H * 0.22, '#ff8ce3', 1.05);
      return;
    }
    if (type === 'ghost') {
      ghostTimer = Math.max(ghostTimer, specialFoods.ghost.durationSec);
      playGameSound('snake-ghost');
      spawnFloatingText('GHOST MODE', W * 0.5, H * 0.22, '#baabff', 1.05);
      return;
    }
    if (type === 'chaos') {
      chaosTimer = Math.max(chaosTimer, specialFoods.chaos.durationSec);
      chaosJitter = rand(0, 0.16);
      gridFlickerTimer = Math.max(gridFlickerTimer, 0.48);
      triggerShake(effects.turnShake * 1.8, 0.22);
      playGameSound('snake-chaos');
      spawnFloatingText('CHAOS FIELD', W * 0.5, H * 0.22, '#ff9c9c', 1.05);
      if (Math.random() > 0.3) nextDir = getRandomPerpendicularDirection(dir);
      return;
    }
    playGameSound('snake-eat');
  }

  // Shared pickup logic — applies full combo/scoring/effects to any food item.
  // Does NOT respawn food, increment foodEaten, or check wave progress.
  function eatFoodItem(f) {
    var now = timeAlive;
    if (now - lastEatTimeSec <= getRunComboWindow()) comboCount += 1;
    else comboCount = 1;
    comboTimer = getRunComboWindow();
    lastEatTimeSec = now;

    var comboMul = getComboMultiplier();
    var lengthMul = getLengthMultiplier();
    var effectMul = getEffectMultiplier();
    var heatMul = 1 + recalcHeat() * 0.35;
    var doubleMul = doublePickupsLeft > 0 ? 2 : 1;
    if (doublePickupsLeft > 0) doublePickupsLeft -= 1;
    var baseGain = Math.max(1, Math.round(f.points * comboMul * lengthMul * effectMul * heatMul * doubleMul * getRunScoreMultiplier()));
    var gain = applyFactionScore(baseGain, (run && run._factionId) || 'unaligned', { timeAlive: timeAlive });
    score += gain;

    if (comboCount >= 3) playGameSound('snake-combo');
    applyFoodEffect(f.type);

    var center = centerFromCell(f);
    var burstCount = 11 + Math.min(26, comboCount * 3) + (f.type !== 'normal' ? 8 : 0);
    spawnBurst(center.x, center.y, f.color, burstCount, comboCount >= 4 ? 1.18 : 1);
    spawnFloatingText('+' + gain, center.x, center.y - 8, f.color, 1 + Math.min(0.7, comboCount * 0.06));
    if (comboCount > 1) spawnFloatingText('COMBO x' + comboMul.toFixed(2), center.x, center.y + 14, '#ffe08e', 0.92);
    triggerShake(effects.turnShake * (1 + Math.min(1.2, comboCount * 0.08)), 0.06 + Math.min(0.16, comboCount * 0.015));
    setBestMaybe();
  }

  function eatFood() {
    eatFoodItem(food);
    var wasBossFood = food.mutated === 'boss';
    food = spawnFood();
    foodEaten++;
    if (wasBossFood) {
      runStats.bossesDefeated++;
      if (snakePhase === 'boss') {
        snakePhase = 'combat';
        triggerSnakeUpgradePhase();
        updateHud();
        rollGameplayBonus();
        return;  // triggerSnakeUpgradePhase pauses the run; skip checkWaveProgress to avoid double-trigger
      }
    }
    checkWaveProgress();
    updateHud();
    rollGameplayBonus();
  }

  function setDirection(x, y) {
    if (!running || paused || gameOver) return;
    var basis = nextDir;
    if (x === -basis.x && y === -basis.y) return;
    if (x === basis.x && y === basis.y) return;
    nextDir = { x: x, y: y };
    triggerShake(effects.turnShake, 0.05);
    playGameSound('snake-turn');
  }

  function resolveInputDirection(x, y) {
    if (chaosTimer > 0 || eventReverseTimer > 0) return { x: -x, y: -y };
    return { x: x, y: y };
  }

  function isSelfCollision(head, willEat) {
    if (ghostTimer > 0) return false;
    var limit = willEat ? snake.length : Math.max(0, snake.length - 1);
    for (var i = 0; i < limit; i++) {
      var seg = snake[i];
      if (seg.x === head.x && seg.y === head.y) return true;
    }
    return false;
  }

  function explodeSnake() {
    for (var i = 0; i < snake.length; i++) {
      var seg = snake[i];
      var center = centerFromCell(seg);
      var ratio = i / Math.max(1, snake.length - 1);
      var hue = 195 + ratio * 125;
      var color = 'hsl(' + hue.toFixed(0) + ' 100% 65%)';
      spawnBurst(center.x, center.y, color, 6 + Math.floor(Math.random() * 6), 1.1 + (1 - ratio) * 0.35);
    }
  }

  function onGameOver() {
    if (gameOver) return;
    running = false;
    paused = false;
    gameOver = true;
    finalizeMetaRun();
    stopAllSounds();
    playGameSound('snake-game-over');
    explodeSnake();
    gridFlickerTimer = Math.max(gridFlickerTimer, 0.65);
    triggerShake(effects.collisionShake, 0.34);
    setBestMaybe();
    updateHud();
    submitScore(ArcadeSync.getPlayer(), score, GAME_ID);
    // —— Faction war contribution (additive, does not alter submitScore) ————
    try {
      var _factionId = (run && run._factionId) || getPlayerFaction();
      if (score > 0 && _factionId && _factionId !== 'unaligned') {
        var contrib = Math.max(1, Math.floor(score / 100));
        recordContribution(_factionId, 'score_submission', contrib);
        recordWarContribution();
        checkRankUp(_factionId);
        emitFactionGain(_factionId, contrib, 'score_submission');
      }
      recordMissionProgress(_factionId, 'survive', Math.floor(timeAlive || 0));
      recordMissionProgress(_factionId, 'runs', 1);
      recordLogin();
    } catch (_) {}
    if (window.showGameOverModal) window.showGameOverModal(score);
    else alert('Game Over — Score: ' + score);
  }

  function stepGame() {
    if (!running || paused || gameOver) return;
    prevSnake = cloneSnake(snake);
    dir = { x: nextDir.x, y: nextDir.y };
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    var willEat = head.x === food.x && head.y === food.y;

    if (head.x < 0 || head.x >= grid || head.y < 0 || head.y >= grid) {
      if (run && run.reviveTokens > 0) {
        run.reviveTokens--;
        spawnFloatingTextLocal('💎 RESPAWN!', '#f7c948');
        snake = [{ x: Math.floor(grid/2), y: Math.floor(grid/2) }, { x: Math.floor(grid/2)-1, y: Math.floor(grid/2) }];
        prevSnake = cloneSnake(snake);
        dir = { x: 1, y: 0 };
        nextDir = { x: 1, y: 0 };
        return;
      }
      onGameOver();
      return;
    }
    if (isSelfCollision(head, willEat)) {
      if (run && run.shieldCharges > 0) {
        run.shieldCharges--;
        spawnFloatingTextLocal('🛡 SHIELD!', '#2ec5ff');
        return;
      }
      if (run && run.reviveTokens > 0) {
        run.reviveTokens--;
        spawnFloatingTextLocal('💎 RESPAWN!', '#f7c948');
        snake = [{ x: Math.floor(grid/2), y: Math.floor(grid/2) }, { x: Math.floor(grid/2)-1, y: Math.floor(grid/2) }];
        prevSnake = cloneSnake(snake);
        dir = { x: 1, y: 0 };
        nextDir = { x: 1, y: 0 };
        return;
      }
      onGameOver();
      return;
    }

    snake.unshift(head);
    if (willEat) eatFood();
    else {
      // Check if head lands on any extra flood food
      var ateExtra = false;
      for (var _ei = extraFoods.length - 1; _ei >= 0; _ei--) {
        var ef = extraFoods[_ei];
        if (ef.x === head.x && ef.y === head.y) {
          extraFoods.splice(_ei, 1);
          eatFoodItem(ef);
          updateHud();
          rollGameplayBonus();
          ateExtra = true;
          break;  // only eat one extra per step
        }
      }
      if (!ateExtra) snake.pop();
    }
    updateHud();
  }

  function updateEffects(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.965;
      p.vy *= 0.965;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (var j = floatingTexts.length - 1; j >= 0; j--) {
      var t = floatingTexts[j];
      t.y += t.vy * dt;
      t.life -= dt;
      if (t.life <= 0) floatingTexts.splice(j, 1);
    }
    if (shakeTime > 0) {
      shakeTime = Math.max(0, shakeTime - dt);
      shakeIntensity *= 0.9;
      if (shakeTime <= 0) shakeIntensity = 0;
    }
    if (gridFlickerTimer > 0) gridFlickerTimer = Math.max(0, gridFlickerTimer - dt);
  }

  function updateGameplayTimers(dt) {
    if (comboTimer > 0) {
      comboTimer = Math.max(0, comboTimer - dt);
      if (comboTimer <= 0 && comboCount > 0) {
        if (comboSavePending) {
          comboSavePending = false;
          comboCount = 1;
          spawnFloatingText('STREAK SAVED', W * 0.5, H * 0.25, '#ffe08e', 1.0);
        } else {
          comboCount = 0;
        }
      }
    }
    if (speedBoostTimer > 0) speedBoostTimer = Math.max(0, speedBoostTimer - dt);
    if (multiplierTimer > 0) multiplierTimer = Math.max(0, multiplierTimer - dt);
    if (ghostTimer > 0) ghostTimer = Math.max(0, ghostTimer - dt);
    if (chaosTimer > 0) chaosTimer = Math.max(0, chaosTimer - dt);
    if (chaosTimer <= 0) chaosJitter = 0;
  }

  function drawBackground(t) {
    var intensity = clamp((heat / 1.6) + comboCount * 0.04 + (chaosTimer > 0 ? 0.2 : 0), 0.12, 1.65);
    ctx.clearRect(0, 0, W, H);
    var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, 'rgb(5 10 28)');
    bgGrad.addColorStop(1, 'rgb(8 3 18)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    var scanAlpha = 0.03 + intensity * 0.03 + (chaosTimer > 0 ? 0.04 : 0);
    for (var y = 0; y < H; y += 4) {
      var wobble = Math.sin(y * 0.05 + t * 4.2) * 8;
      ctx.fillStyle = 'rgba(120,245,255,' + scanAlpha.toFixed(3) + ')';
      ctx.fillRect(wobble, y, W, 1);
    }
    for (var n = 0; n < BACKGROUND_NOISE_POINTS; n++) {
      var nx = Math.random() * W;
      var ny = Math.random() * H;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(255,89,214,0.025)';
      ctx.fillRect(nx, ny, 1, 1);
    }

    var pulse = 0.45 + 0.55 * Math.sin(t * 2.2);
    var flicker = gridFlickerTimer > 0 ? 0.14 + Math.random() * 0.18 : 0;
    var gridAlphaA = 0.06 + intensity * 0.06 + pulse * 0.035 + flicker;
    var gridAlphaB = 0.04 + intensity * 0.05 + (1 - pulse) * 0.03 + flicker * 0.8;
    ctx.lineWidth = 1;
    for (var i = 0; i <= grid; i++) {
      var gx = i * size;
      var gy = i * size;
      ctx.strokeStyle = 'rgba(48,226,255,' + gridAlphaA.toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,79,209,' + gridAlphaB.toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
    }

    if (chaosTimer > 0) {
      for (var b = 0; b < 6; b++) {
        var barY = Math.random() * H;
        var barH = 5 + Math.random() * 16;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,95,95,0.08)' : 'rgba(157,125,255,0.08)';
        ctx.fillRect(0, barY, W, barH);
      }
    }
  }

  // Draws a single food item using the full radial-gradient orb visual.
  function drawFoodItem(f, t) {
    var c = centerFromCell(f);
    var pulse = 0.55 + 0.45 * Math.sin(t * 8.5 + (f.pulseSeed || 0));
    var radius = size * (0.23 + pulse * 0.14);
    var orb = ctx.createRadialGradient(c.x, c.y, radius * 0.2, c.x, c.y, radius * 2.1);
    orb.addColorStop(0, '#ffffff');
    orb.addColorStop(0.2, f.halo || 'rgba(255,255,255,0.3)');
    orb.addColorStop(0.5, f.color);
    orb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius * 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 ' + Math.max(10, Math.floor(size * 0.34)) + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.icon || 'â—', c.x, c.y + 0.5);
  }

  function drawFood(t) {
    if (!food) return;
    drawFoodItem(food, t);
    for (var _fi = 0; _fi < extraFoods.length; _fi++) {
      drawFoodItem(extraFoods[_fi], t);
    }
  }

  function calculateEyeOffset(direction, radius) {
    return {
      x: direction.x * radius * EYE_DIRECTION_OFFSET + (direction.y !== 0 ? radius * EYE_PERPENDICULAR_OFFSET : 0),
      y: direction.y * radius * EYE_DIRECTION_OFFSET + (direction.x !== 0 ? radius * EYE_PERPENDICULAR_OFFSET : 0),
    };
  }

  function drawSnake(alpha) {
    if (!snake.length) return;
    var eased = smoothstep(clamp(alpha, 0, 1));
    var intensity = clamp(0.85 + heat * 0.6 + comboCount * 0.06, 0.8, 2.2);
    var headPos = getInterpolatedSegment(0, eased);
    var tailPos = getInterpolatedSegment(snake.length - 1, eased);
    var headCenter = centerFromCell(headPos);
    var tailCenter = centerFromCell(tailPos);

    var trail = ctx.createLinearGradient(headCenter.x, headCenter.y, tailCenter.x, tailCenter.y);
    trail.addColorStop(0, 'rgba(75,242,255,' + clamp(0.4 + comboCount * 0.03, 0.4, 0.85).toFixed(3) + ')');
    trail.addColorStop(1, 'rgba(255,82,220,0.18)');

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = trail;
    ctx.shadowColor = ghostTimer > 0 ? 'rgba(180,160,255,0.9)' : 'rgba(80,240,255,0.85)';
    ctx.shadowBlur = 8 + intensity * 8;
    ctx.lineWidth = size * 0.48;
    ctx.beginPath();
    for (var i = 0; i < snake.length; i++) {
      var segPos = getInterpolatedSegment(i, eased);
      var segCenter = centerFromCell(segPos);
      if (i === 0) ctx.moveTo(segCenter.x, segCenter.y);
      else ctx.lineTo(segCenter.x, segCenter.y);
    }
    ctx.stroke();
    ctx.restore();

    for (var j = snake.length - 1; j >= 0; j--) {
      var pos = getInterpolatedSegment(j, eased);
      var center = centerFromCell(pos);
      var ratio = j / Math.max(1, snake.length - 1);
      var hue = 192 + ratio * 130;
      var sat = 96;
      var light = 62 - ratio * 7;
      var radius = (size * (j === 0 ? 0.36 : 0.3)) + (comboCount > 0 ? Math.min(2.2, comboCount * 0.14) : 0);
      ctx.save();
      ctx.globalAlpha = ghostTimer > 0 ? 0.52 : 0.95;
      ctx.fillStyle = 'hsl(' + hue.toFixed(0) + ' ' + sat + '% ' + light.toFixed(0) + '%)';
      ctx.shadowColor = ghostTimer > 0 ? 'rgba(183,162,255,0.85)' : 'hsl(' + hue.toFixed(0) + ' 100% 70%)';
      ctx.shadowBlur = 8 + intensity * (j === 0 ? 10 : 6);
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (j === 0) {
        ctx.fillStyle = '#f4fcff';
        var eyeOffset = calculateEyeOffset(dir, radius);
        ctx.beginPath();
        ctx.arc(center.x - eyeOffset.x, center.y - eyeOffset.y, Math.max(1.2, radius * 0.14), 0, Math.PI * 2);
        ctx.arc(center.x + eyeOffset.x, center.y + eyeOffset.y, Math.max(1.2, radius * 0.14), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha * 0.85;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloatingTexts() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < floatingTexts.length; i++) {
      var text = floatingTexts[i];
      var alpha = clamp(text.life / text.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = text.color;
      ctx.font = '700 ' + Math.floor(12 * text.scale + 8) + 'px system-ui';
      ctx.fillText(text.text, text.x, text.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawStatusOverlay() {
    if (running && !gameOver) return;
    ctx.save();
    ctx.fillStyle = 'rgba(6,8,14,0.56)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (gameOver) {
      ctx.fillStyle = '#ff8a8a';
      ctx.font = '700 42px system-ui';
      ctx.fillText('SIGNAL LOST', W / 2, H / 2 - 12);
      ctx.fillStyle = '#f8d2d2';
      ctx.font = '600 16px system-ui';
      ctx.fillText('Press Start to reboot the run', W / 2, H / 2 + 28);
    } else {
      ctx.fillStyle = '#8beeff';
      ctx.font = '700 36px system-ui';
      ctx.fillText('READY', W / 2, H / 2 - 12);
      ctx.fillStyle = '#f0e4ff';
      ctx.font = '600 16px system-ui';
      ctx.fillText('Press Start and chain fast pickups', W / 2, H / 2 + 22);
    }
    ctx.restore();
  }

  function render(alpha) {
    var t = paused ? frozenRenderTime : renderTime;
    drawBackground(t);

    if (shakeTime > 0 && !paused) {
      ctx.save();
      var sx = (Math.random() - 0.5) * shakeIntensity * 2;
      var sy = (Math.random() - 0.5) * shakeIntensity * 2;
      ctx.translate(sx, sy);
      drawFood(t);
      drawSnake(alpha);
      drawParticles();
      drawFloatingTexts();
      ctx.restore();
    } else {
      drawFood(t);
      drawSnake(alpha);
      drawParticles();
      drawFloatingTexts();
    }

    drawStatusOverlay();
  }

  function frame(ts) {
    frameDebug.tick(ts);
    if (!lastFrameSec) lastFrameSec = ts / 1000;
    var now = ts / 1000;
    var dt = clamp(now - lastFrameSec, 0, MAX_FRAME_DELTA_SEC);
    lastFrameSec = now;

    if (paused) {
      render(0);
      raf = requestAnimationFrame(frame);
      return;
    }

    renderTime += dt;
    updateEffects(dt);

    if (running && !gameOver) {
      timeAlive += dt;
      updateGameplayTimers(dt);
      if (snakePhase === 'combat') {
        tickSnakeDirector(dt);
      }
      if (food && food.moving) {
        food.mvTimer = (food.mvTimer || 0) + dt;
        if (food.mvTimer >= 0.8) {
          food.mvTimer = 0;
          var nx = food.x + (food.mvx || 0);
          var ny = food.y + (food.mvy || 0);
          if (nx >= 0 && nx < grid && ny >= 0 && ny < grid) { food.x = nx; food.y = ny; }
          else { food.mvx = -(food.mvx || 0); food.mvy = -(food.mvy || 0); }
        }
      }
      accumulatorMs += dt * 1000;
      var stepMs = getStepMs();
      var frameStepMs = stepMs;
      // Prevent spiral-of-death catch-up spikes when a frame stalls.
      var maxSteps = MAX_FRAME_CATCHUP_STEPS;
      while (accumulatorMs >= frameStepMs && maxSteps > 0 && running && !gameOver) {
        accumulatorMs -= frameStepMs;
        stepGame();
        maxSteps -= 1;
      }
      updateHud();
      render(clamp(accumulatorMs / Math.max(1, stepMs), 0, 1));
    } else {
      render(0);
    }

    raf = requestAnimationFrame(frame);
  }

  function ensureLoop() {
    if (raf) return;
    lastFrameSec = 0;
    raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = null;
    lastFrameSec = 0;
  }

  function onKeyDown(e) {
    frameDebug.input('keydown', e.key);
    var key = String(e.key || '').toLowerCase();
    if (key === 'arrowup' || key === 'w') {
      e.preventDefault();
      var up = resolveInputDirection(0, -1);
      setDirection(up.x, up.y);
    }
    if (key === 'arrowdown' || key === 's') {
      e.preventDefault();
      var down = resolveInputDirection(0, 1);
      setDirection(down.x, down.y);
    }
    if (key === 'arrowleft' || key === 'a') {
      e.preventDefault();
      var left = resolveInputDirection(-1, 0);
      setDirection(left.x, left.y);
    }
    if (key === 'arrowright' || key === 'd') {
      e.preventDefault();
      var right = resolveInputDirection(1, 0);
      setDirection(right.x, right.y);
    }
  }

  function publishOverlayStateHook() {
    window.__snakeOverlayStateHook = function () {
      return { running: running, paused: paused, gameOver: gameOver };
    };
  }

  function init() {
    best = ArcadeSync.getHighScore(GAME_ID);
    bestEl.textContent = String(best);
    running = false;
    paused = false;
    gameOver = false;
    clearRuntimeState();
    updateHud();
    ensureLoop();
    publishOverlayStateHook();

    document.addEventListener('keydown', onKeyDown);

    startBtnEl.onclick = function () {
      start();
    };
    pauseBtnEl.onclick = function () {
      if (!running || gameOver) return;
      paused = !paused;
      if (paused) {
        frozenRenderTime = renderTime;
        stopAllSounds();
      } else {
        lastFrameSec = 0;
      }
    };
    resetBtnEl.onclick = function () {
      reset();
    };
  }

  function start() {
    stopAllSounds();
    running = true;
    paused = false;
    gameOver = false;
    renderTime = 0;
    frozenRenderTime = 0;
    clearRuntimeState();
    playGameSound('snake-start');
    ensureLoop();
  }

  function pause() {
    if (!running || gameOver) return;
    paused = true;
    frozenRenderTime = renderTime;
    stopAllSounds();
  }

  function resume() {
    if (!running || gameOver) return;
    paused = false;
    lastFrameSec = 0;
  }

  function reset() {
    stopAllSounds();
    running = false;
    paused = false;
    gameOver = false;
    renderTime = 0;
    frozenRenderTime = 0;
    clearRuntimeState();
    updateHud();
  }

  function destroy() {
    stopLoop();
    stopAllSounds();
    document.removeEventListener('keydown', onKeyDown);
    startBtnEl.onclick = null;
    pauseBtnEl.onclick = null;
    resetBtnEl.onclick = null;
    if (window.__snakeOverlayStateHook) delete window.__snakeOverlayStateHook;
  }

  function getScore() { return score; }

  return {
    init: init,
    start: start,
    pause: pause,
    resume: resume,
    reset: reset,
    destroy: destroy,
    getScore: getScore,
  };
}
