import { ArcadeSync }                        from '/js/arcade-sync.js';
import { submitScore }                       from '/js/leaderboard-client.js';
import { SNAKE_CONFIG } from './config.js';
import { createGameAdapter, registerGameAdapter } from '/js/arcade/engine/game-adapter.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';

export const SNAKE_ADAPTER = createGameAdapter({
  id: SNAKE_CONFIG.id,
  name: SNAKE_CONFIG.label,
  systems: {},
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
    if (doublePickupsLeft > 0) flags.push('2xPICK Ã—' + doublePickupsLeft);
    if (comboSavePending) flags.push('SAVE \u2713');
    return 'HEAT ' + pct + '%' + (flags.length ? ' â€¢ ' + flags.join(' â€¢ ') : '');
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
        return {
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
      }
    }
    return {
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
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    snake = [{ x: 12, y: 12 }, { x: 11, y: 12 }, { x: 10, y: 12 }];
    prevSnake = cloneSnake(snake);
    food = spawnFood();
    setBestMaybe();
    updateHud();
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

  function eatFood() {
    var now = timeAlive;
    if (now - lastEatTimeSec <= movement.comboWindowSec) comboCount += 1;
    else comboCount = 1;
    comboTimer = movement.comboWindowSec;
    lastEatTimeSec = now;

    var comboMul = getComboMultiplier();
    var lengthMul = getLengthMultiplier();
    var effectMul = getEffectMultiplier();
    var heatMul = 1 + recalcHeat() * 0.35;
    var doubleMul = doublePickupsLeft > 0 ? 2 : 1;
    if (doublePickupsLeft > 0) doublePickupsLeft -= 1;
    var gain = Math.max(1, Math.round(food.points * comboMul * lengthMul * effectMul * heatMul * doubleMul));
    score += gain;

    if (comboCount >= 3) playGameSound('snake-combo');
    applyFoodEffect(food.type);

    var center = centerFromCell(food);
    var burstCount = 11 + Math.min(26, comboCount * 3) + (food.type !== 'normal' ? 8 : 0);
    spawnBurst(center.x, center.y, food.color, burstCount, comboCount >= 4 ? 1.18 : 1);
    spawnFloatingText('+' + gain, center.x, center.y - 8, food.color, 1 + Math.min(0.7, comboCount * 0.06));
    if (comboCount > 1) spawnFloatingText('COMBO x' + comboMul.toFixed(2), center.x, center.y + 14, '#ffe08e', 0.92);
    triggerShake(effects.turnShake * (1 + Math.min(1.2, comboCount * 0.08)), 0.06 + Math.min(0.16, comboCount * 0.015));

    setBestMaybe();
    food = spawnFood();
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
    if (chaosTimer > 0) return { x: -x, y: -y };
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
    stopAllSounds();
    playGameSound('snake-game-over');
    explodeSnake();
    gridFlickerTimer = Math.max(gridFlickerTimer, 0.65);
    triggerShake(effects.collisionShake, 0.34);
    setBestMaybe();
    updateHud();
    submitScore(ArcadeSync.getPlayer(), score, GAME_ID);
    if (window.showGameOverModal) window.showGameOverModal(score);
    else alert('Game Over â€” Score: ' + score);
  }

  function stepGame() {
    if (!running || paused || gameOver) return;
    prevSnake = cloneSnake(snake);
    dir = { x: nextDir.x, y: nextDir.y };
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    var willEat = head.x === food.x && head.y === food.y;

    if (head.x < 0 || head.x >= grid || head.y < 0 || head.y >= grid) {
      onGameOver();
      return;
    }
    if (isSelfCollision(head, willEat)) {
      onGameOver();
      return;
    }

    snake.unshift(head);
    if (willEat) eatFood();
    else snake.pop();
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

  function drawFood(t) {
    if (!food) return;
    var c = centerFromCell(food);
    var pulse = 0.55 + 0.45 * Math.sin(t * 8.5 + food.pulseSeed);
    var radius = size * (0.23 + pulse * 0.14);
    var orb = ctx.createRadialGradient(c.x, c.y, radius * 0.2, c.x, c.y, radius * 2.1);
    orb.addColorStop(0, '#ffffff');
    orb.addColorStop(0.2, food.halo);
    orb.addColorStop(0.5, food.color);
    orb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius * 2.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = food.color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 ' + Math.max(10, Math.floor(size * 0.34)) + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(food.icon || 'â—', c.x, c.y + 0.5);
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
