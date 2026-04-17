/**
 * bootstrap.js — SnakeRun 3008 game module
 *
 * Contains all Snake game logic.  Exports bootstrapSnake(), which is the
 * entry point called by game-shell.js via mountGame().
 *
 * The function wires up the existing DOM elements (canvas, HUD, buttons)
 * that are declared in games/snake.html, and returns a standardised
 * lifecycle object for use by the shell.
 *
 * Integrations preserved:
 *  - ArcadeSync   (local high-score persistence)
 *  - submitScore  (leaderboard-client.js remote submission)
 *  - rollHiddenBonus / showBonusPopup  (bonus-engine.js)
 *  - window.showGameOverModal          (game-fullscreen.js)
 */

import { ArcadeSync }                        from '/js/arcade-sync.js';
import { submitScore }                       from '/js/leaderboard-client.js';
import { rollHiddenBonus, showBonusPopup }   from '/js/bonus-engine.js';
import { SNAKE_CONFIG }                      from './config.js';
import { GameRegistry }                      from '/js/arcade/core/game-registry.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';

// Register Snake in the central registry when this module is first imported.
GameRegistry.register(SNAKE_CONFIG.id, {
  label:     SNAKE_CONFIG.label,
  bootstrap: bootstrapSnake,
});

/**
 * Bootstrap the Snake game.
 *
 * @param {Element} root - The .game-card element (unused directly; DOM IDs
 *                         are unique on the page, so getElementById is safe).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapSnake(root) {
  // ── DOM refs ────────────────────────────────────────────────────────────

  var canvas      = document.getElementById('snakeCanvas');
  var ctx         = canvas.getContext('2d');
  var scoreEl     = document.getElementById('score');
  var bestEl      = document.getElementById('best');
  var streakEl    = document.getElementById('streak');
  var speedLabel  = document.getElementById('speedLabel');
  var startBtnEl  = document.getElementById('startBtn');
  var pauseBtnEl  = document.getElementById('pauseBtn');
  var resetBtnEl  = document.getElementById('resetBtn');

  // ── Config shortcuts ─────────────────────────────────────────────────────

  var grid       = SNAKE_CONFIG.grid;
  var speedTiers = SNAKE_CONFIG.speedTiers;
  var size       = canvas.width / grid;

  // ── Mutable game state ───────────────────────────────────────────────────

  var snake, dir, nextDir, food, timer;
  var running = false;
  var paused  = false;
  var score   = 0;
  var streak  = 0;
  var best    = ArcadeSync.getHighScore(SNAKE_CONFIG.id);

  function playGameSound(id, options) {
    if (isMuted()) return null;
    return playSound(id, options);
  }

  // ── HUD helpers ──────────────────────────────────────────────────────────

  function updateHud() {
    scoreEl.textContent  = score;
    bestEl.textContent   = best;
    streakEl.textContent = streak;
    speedLabel.textContent = getSpeedLabel();
  }

  // ── Speed tier helpers ───────────────────────────────────────────────────

  function getSpeedTier() {
    for (var i = 0; i < speedTiers.length; i++) {
      if (score >= speedTiers[i].minScore) return speedTiers[i];
    }
    return speedTiers[speedTiers.length - 1];
  }

  function getSpeedLabel() { return getSpeedTier().label; }
  function getSpeedMs()    { return getSpeedTier().ms;    }

  /** Restart the interval at the speed matching the current score. */
  function updateTimerSpeed() {
    clearInterval(timer);
    timer = setInterval(step, getSpeedMs());
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  function drawCell(x, y, color, glow) {
    ctx.fillStyle = color;
    ctx.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
    if (glow) {
      ctx.strokeStyle = glow;
      ctx.lineWidth   = 2;
      ctx.strokeRect(x * size + 3, y * size + 3, size - 6, size - 6);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < grid; i++) {
      ctx.strokeStyle = i % 2 ? 'rgba(255,0,255,.08)' : 'rgba(0,255,255,.08)';
      ctx.beginPath(); ctx.moveTo(i * size, 0);            ctx.lineTo(i * size, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,        i * size);     ctx.lineTo(canvas.width, i * size);  ctx.stroke();
    }
    drawCell(food.x, food.y, '#f7ab1a', '#fff2b5');
    snake.forEach(function (s, idx) {
      drawCell(
        s.x, s.y,
        idx === 0 ? '#2ec5ff' : '#ff4fd1',
        idx === 0 ? '#dff8ff' : '#ffb3ef'
      );
    });
  }

  // ── State helpers ────────────────────────────────────────────────────────

  function spawnFood() {
    while (true) {
      var f = { x: Math.floor(Math.random() * grid), y: Math.floor(Math.random() * grid) };
      if (!snake.some(function (s) { return s.x === f.x && s.y === f.y; })) return f;
    }
  }

  function resetState() {
    snake   = [{ x: 12, y: 12 }, { x: 11, y: 12 }, { x: 10, y: 12 }];
    dir     = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score   = 0;
    streak  = 0;
    food    = spawnFood();
    updateHud();
    draw();
  }

  // ── Game events ───────────────────────────────────────────────────────────

  async function onFoodEaten() {
    var bonus = await rollHiddenBonus({ score: score, streak: streak, game: SNAKE_CONFIG.id });
    if (bonus) {
      score += (bonus.rewards && bonus.rewards.arcade_points) ? bonus.rewards.arcade_points : 0;
      ArcadeSync.setHighScore(SNAKE_CONFIG.id, score);
      best = ArcadeSync.getHighScore(SNAKE_CONFIG.id);
      showBonusPopup(bonus);
      updateHud();
    }
  }

  function onGameOver() {
    running = false;
    clearInterval(timer);
    stopAllSounds();
    ArcadeSync.setHighScore(SNAKE_CONFIG.id, score);
    best = ArcadeSync.getHighScore(SNAKE_CONFIG.id);
    updateHud();
    // Submit to shared leaderboard (fire-and-forget)
    submitScore(ArcadeSync.getPlayer(), score, SNAKE_CONFIG.id);
    playGameSound('snake-game-over');
    if (window.showGameOverModal) {
      window.showGameOverModal(score);
    } else {
      alert('Game Over — Score: ' + score);
    }
  }

  // ── Game loop ─────────────────────────────────────────────────────────────

  function step() {
    if (!running || paused) return;
    dir = nextDir;
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.x >= grid || head.y < 0 || head.y >= grid ||
        snake.some(function (s) { return s.x === head.x && s.y === head.y; })) {
      onGameOver();
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score  += 10;
      streak += 1;
      playGameSound('snake-eat');
      ArcadeSync.setHighScore(SNAKE_CONFIG.id, score);
      best = ArcadeSync.getHighScore(SNAKE_CONFIG.id);
      food = spawnFood();
      updateTimerSpeed();
      onFoodEaten().catch(function (err) { console.warn('[snake] Bonus roll failed:', err); });
    } else {
      snake.pop();
      streak = 0;
    }
    updateHud();
    draw();
  }

  function setDirection(x, y) {
    if (x === -dir.x && y === -dir.y) return;
    nextDir = { x: x, y: y };
  }

  // ── Input handler (stored so it can be removed on destroy) ───────────────

  function onKeyDown(e) {
    if (e.key === 'ArrowUp'    || e.key === 'w') setDirection(0,  -1);
    if (e.key === 'ArrowDown'  || e.key === 's') setDirection(0,   1);
    if (e.key === 'ArrowLeft'  || e.key === 'a') setDirection(-1,  0);
    if (e.key === 'ArrowRight' || e.key === 'd') setDirection(1,   0);
  }

  // ── Lifecycle implementation ──────────────────────────────────────────────

  function init() {
    best = ArcadeSync.getHighScore(SNAKE_CONFIG.id);
    bestEl.textContent = best;
    resetState();

    document.addEventListener('keydown', onKeyDown);

    startBtnEl.onclick = function () {
      resetState();
      running = true;
      paused  = false;
      clearInterval(timer);
      timer = setInterval(step, speedTiers[speedTiers.length - 1].ms);
    };

    pauseBtnEl.onclick = function () {
      if (running) {
        paused = !paused;
        if (paused) stopAllSounds();
      }
    };

    resetBtnEl.onclick = function () {
      clearInterval(timer);
      running = false;
      paused  = false;
      resetState();
    };
  }

  function start() {
    resetState();
    running = true;
    paused  = false;
    clearInterval(timer);
    timer = setInterval(step, speedTiers[speedTiers.length - 1].ms);
  }

  function pause() {
    if (running) {
      paused = true;
      stopAllSounds();
    }
  }

  function resume() {
    if (running) paused = false;
  }

  function reset() {
    clearInterval(timer);
    stopAllSounds();
    running = false;
    paused  = false;
    resetState();
  }

  function destroy() {
    clearInterval(timer);
    stopAllSounds();
    document.removeEventListener('keydown', onKeyDown);
    startBtnEl.onclick = null;
    pauseBtnEl.onclick = null;
    resetBtnEl.onclick = null;
  }

  function getScore() {
    return score;
  }

  // ── Public lifecycle object ───────────────────────────────────────────────

  return { init: init, start: start, pause: pause, resume: resume, reset: reset, destroy: destroy, getScore: getScore };
}
