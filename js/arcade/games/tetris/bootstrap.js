import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { TETRIS_CONFIG } from './config.js';
import { createGameAdapter, registerGameAdapter, bootstrapFromAdapter } from '/js/arcade/engine/game-adapter.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';
import { createFrameDebug } from '/js/arcade/core/frame-debug.js';
import { buildRunSummary, recordRunStats, checkMilestones, getDailyVariation } from './meta-system.js';
import { createScalingDirector, tickDirector, shouldFirePressureEvent, pickSurpriseEvent, updateIntensity, checkForcedChaos, getBossAggressionMult } from '/js/arcade/systems/event-system.js';

export const TETRIS_ADAPTER = createGameAdapter({
  id: TETRIS_CONFIG.id,
  name: TETRIS_CONFIG.label,
  systems: { upgrade: true, director: true, event: true, mutation: true, boss: true, risk: true, meta: true, feedback: true },
  legacyBootstrap: function (root) {
    return createLegacybootstrapTetris(root);
  },
});

registerGameAdapter(TETRIS_CONFIG, TETRIS_ADAPTER, bootstrapTetris);

export function bootstrapTetris(root) {
  return bootstrapFromAdapter(root, TETRIS_ADAPTER);
}

function createLegacybootstrapTetris(root) {
  const GAME_ID = TETRIS_CONFIG.id;
  const frameDebug = createFrameDebug(GAME_ID);
  const COLS = 10;
  const ROWS = 20;
  const CELL = 30;
  const MAX_PARTICLES = 340;
  const MAX_FLOATING = 50;
  const MAX_LEVEL_SHAKE_BOOST = 2.2;
  const LEVEL_SHAKE_GAIN_PER_LEVEL = 0.08;
  const BACK_TO_BACK_BONUS_MULTIPLIER = 0.45;
  const BACK_TO_BACK_CHAIN_STEP_BONUS = 35;

  // ── Roguelite / Director constants ────────────────────────────────────────
  const WAVE_SIZE = 5;
  const BOSS_WAVE_EVERY = 5;
  const UPGRADE_DEFS = [
    { id: 'scoreBoost',  name: '📈 Score Rush',     rarity: 'common',    desc: '+20% score on all line clears this run.',     apply(s) { s.scoreMult += 0.20; } },
    { id: 'dropSlowdown', name: '🕐 Time Dilation', rarity: 'common',    desc: '-8% drop speed permanently this run.',        apply(s) { s.dropSlowdown += 0.08; } },
    { id: 'comboBonus',  name: '⛓ Chain Power',     rarity: 'uncommon',  desc: 'Combo multiplier cap +1.',                    apply(s) { s.comboBoostMax += 1; } },
    { id: 'shield',      name: '🛡 Block Shield',    rarity: 'rare',      desc: 'Next top-out attempt is blocked once.',       apply(s) { s.shieldCharges += 1; } },
    { id: 'ghost',       name: '👻 Phantom Line',    rarity: 'uncommon',  desc: 'Every 10th clear scores double.',             apply(s) { s.phantomLineBonus += 1; } },
    { id: 'levelRush',   name: '⚡ Level Rush',      rarity: 'rare',      desc: 'Advance one level instantly and gain score.', apply(s) { s.levelRush += 1; } },
    { id: 'revive',      name: '💎 Crystal Revive',  rarity: 'legendary', desc: 'One revive token — survives one top-out.',    apply(s) { s.reviveTokens += 1; } },
  ];
  const RARITY_COLORS = { common: '#88ccee', uncommon: '#3fb950', rare: '#f7c948', legendary: '#ff4fd1' };

  const TETRIS_EVENTS = [
    { id: 'speedBurst',   minWave: 2, weight: 1.2, execute(s) { director.eventBoostTimer = 6; addFloatBanner(s, '⚡ SPEED BURST!', '#f7c948'); } },
    { id: 'garbageLine',  minWave: 3, weight: 1.0, execute(s) { injectGarbageLines(s, 1 + Math.floor((director.intensity || 0) / 40)); addFloatBanner(s, '☣ GARBAGE DROP!', '#ff4fd1'); } },
    { id: 'mirrorFlip',   minWave: 4, weight: 0.7, execute(s) { director.mirrorTimer = 8; addFloatBanner(s, '🔄 MIRROR MODE!', '#bc8cff'); } },
    { id: 'powerClear',   minWave: 3, weight: 0.9, execute(s) { triggerPowerClear(s); addFloatBanner(s, '💥 POWER CLEAR!', '#2ec5ff'); } },
    { id: 'doubleScore',  minWave: 5, weight: 0.8, execute(s) { director.doubleScoreTimer = 10; addFloatBanner(s, '✶ DOUBLE SCORE!', '#ff8c00'); } },
  ];

  const MUTATION_DEFS = [
    { id: 'heavy',   threshold: 40, apply(piece) { piece.mutated = 'heavy';   piece.color = '#ff8c00'; piece.scoreBonus = 1.4; } },
    { id: 'ghost',   threshold: 55, apply(piece) { piece.mutated = 'ghost';   piece.color = '#bc8cff'; piece.fallThrough = true; } },
    { id: 'golden',  threshold: 70, apply(piece) { piece.mutated = 'golden';  piece.color = '#f7c948'; piece.scoreBonus = 2.0; } },
    { id: 'cursed',  threshold: 85, apply(piece) { piece.mutated = 'cursed';  piece.color = '#ff4fd1'; piece.cursed = true; } },
  ];

  const canvas = document.getElementById('tetCanvas');
  if (!canvas) throw new Error('Missing #tetCanvas for Tetris Block Topia');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  const ctx = canvas.getContext('2d');

  const nc = document.getElementById('nextCanvas');
  const nctx = nc ? nc.getContext('2d') : null;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const levelEl = document.getElementById('level');
  const linesEl = document.getElementById('lines');
  const comboEl = document.getElementById('comboMeter');

  const scoreStatEl = scoreEl ? scoreEl.closest('.stat') : null;
  const levelStatEl = levelEl ? levelEl.closest('.stat') : null;
  const linesStatEl = linesEl ? linesEl.closest('.stat') : null;

  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const submitBtn = document.getElementById('submitBtn');

  const SHAPES = {
    I: { color: '#2ec5ff', cells: [[[-1,0],[0,0],[1,0],[2,0]],[[0,-1],[0,0],[0,1],[0,2]],[[-1,0],[0,0],[1,0],[2,0]],[[0,-1],[0,0],[0,1],[0,2]]] },
    O: { color: '#f7c948', cells: [[[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[1,0],[1,1]]] },
    T: { color: '#bc8cff', cells: [[[0,0],[0,1],[0,2],[1,1]],[[0,1],[1,1],[2,1],[1,0]],[[1,0],[1,1],[1,2],[0,1]],[[0,0],[1,0],[2,0],[1,1]]] },
    S: { color: '#3fb950', cells: [[[0,1],[0,2],[1,0],[1,1]],[[0,0],[1,0],[1,1],[2,1]],[[0,1],[0,2],[1,0],[1,1]],[[0,0],[1,0],[1,1],[2,1]]] },
    Z: { color: '#ff4fd1', cells: [[[0,0],[0,1],[1,1],[1,2]],[[0,1],[1,0],[1,1],[2,0]],[[0,0],[0,1],[1,1],[1,2]],[[0,1],[1,0],[1,1],[2,0]]] },
    J: { color: '#f7ab1a', cells: [[[0,0],[1,0],[1,1],[1,2]],[[0,0],[0,1],[1,0],[2,0]],[[0,0],[0,1],[0,2],[1,2]],[[0,1],[1,1],[2,0],[2,1]]] },
    L: { color: '#ff6b35', cells: [[[0,2],[1,0],[1,1],[1,2]],[[0,0],[1,0],[2,0],[2,1]],[[0,0],[0,1],[0,2],[1,0]],[[0,0],[0,1],[1,1],[2,1]]] },
  };
  const PIECE_KEYS = Object.keys(SHAPES);

  const SFX = {
    move: { kind: 'tone', type: 'square', freqStart: 360, freqEnd: 300, duration: 0.03, volume: 0.015 },
    rotate: { kind: 'tone', type: 'triangle', freqStart: 520, freqEnd: 710, duration: 0.045, volume: 0.02 },
    drop: { kind: 'tone', type: 'square', freqStart: 240, freqEnd: 130, duration: 0.05, volume: 0.02 },
    lock: { kind: 'tone', type: 'sawtooth', freqStart: 140, freqEnd: 95, duration: 0.08, volume: 0.024 },
    line: { kind: 'tone', type: 'sawtooth', freqStart: 360, freqEnd: 780, duration: 0.12, volume: 0.03 },
    combo: { kind: 'tone', type: 'triangle', freqStart: 540, freqEnd: 980, duration: 0.08, volume: 0.024 },
    level: { kind: 'tone', type: 'triangle', freqStart: 320, freqEnd: 880, duration: 0.14, volume: 0.028 },
  };

  let score = 0;
  let scoreDisplay = 0;
  let level = 1;
  let lines = 0;
  let best = ArcadeSync.getHighScore(GAME_ID);

  let running = false;
  let paused = false;
  let gameOver = false;
  let submittedRunScore = false;
  let submitInFlight = false;

  let raf = null;
  let lastTime = 0;
  let elapsed = 0;

  // ── Roguelite run state ────────────────────────────────────────────────────
  let wave = 0;
  let lastWaveLevel = 0;
  let phase = 'combat'; // 'combat' | 'upgrade' | 'boss'
  let upgradeChoices = [];
  let director = null;
  let runStats = { bossesDefeated: 0, highestIntensity: 0, upgradeCount: 0, survivalSec: 0 };
  let run = null;
  let submittedMeta = false;
  let overlayEl = null;
  let bannerQueue = [];
  let bannerTimer = 0;

  let board = [];
  let current = null;
  let next = null;
  const keys = {};

  let dropTimer = 0;
  let dropInterval = 1.0;

  let dasTimer = 0;
  let dasDir = 0;
  let dasActive = false;
  let dasRateTimer = 0;
  const DAS_DELAY = 0.17;
  const DAS_RATE = 0.05;

  let comboChain = 0;
  let comboMultiplier = 1;
  let backToBackChain = 0;
  let lastWasB2BType = false;

  let moveSoundCooldown = 0;
  let pendingClearRows = null;
  let clearFxTimer = 0;
  let clearFxDuration = 0.2;
  let pendingLockedCells = [];

  const particles = [];
  const floatingTexts = [];

  const effects = {
    shakeTime: 0,
    shakeIntensity: 0,
    lockGlow: 0,
    lockPulse: 0,
    levelFlash: 0,
    rgbSplit: 0,
    glitchPulse: 0,
    scanlineFlicker: 0,
    scanlineCooldown: 2,
    clearSweep: 0,
    comboPulse: 0,
  };

  function playGameSound(id) {
    if (isMuted()) return null;
    const spec = SFX[id];
    if (!spec) return null;
    return playSound(`tetris-${id}`, spec);
  }

  function triggerHudFx(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  function canSubmitCompetitive() {
    if (typeof window === 'undefined') return false;
    const identity = window.MOONBOYS_IDENTITY;
    if (!identity || typeof identity.isTelegramLinked !== 'function') return false;
    return !!identity.isTelegramLinked();
  }

  function resolveCompetitivePlayer() {
    const identity = typeof window !== 'undefined' ? window.MOONBOYS_IDENTITY : null;
    if (identity && typeof identity.getTelegramName === 'function') {
      const name = identity.getTelegramName();
      if (name && String(name).trim()) return String(name).trim();
    }
    return ArcadeSync.getPlayer();
  }

  function syncSubmitButton() {
    if (!submitBtn) return;
    if (!canSubmitCompetitive()) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submit (Link Telegram)';
      return;
    }
    if (!gameOver) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submit';
      return;
    }
    if (submitInFlight) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submittingâ€¦';
      return;
    }
    if (submittedRunScore) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitted';
      return;
    }
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  }

  function setBestMaybe() {
    if (score > best) {
      best = score;
      ArcadeSync.setHighScore(GAME_ID, best);
    }
  }

  function addScore(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const mult = getRunScoreMult();
    score += Math.floor(amount * mult);
    setBestMaybe();
    triggerHudFx(scoreStatEl, 'hud-pulse', 220);
  }

  function updateHud() {
    if (Math.abs(score - scoreDisplay) > 0) {
      const delta = score - scoreDisplay;
      const step = Math.max(1, Math.ceil(Math.abs(delta) * 0.2));
      scoreDisplay += delta > 0 ? step : -step;
      if ((delta > 0 && scoreDisplay > score) || (delta < 0 && scoreDisplay < score)) scoreDisplay = score;
    }

    if (scoreEl) scoreEl.textContent = Math.floor(scoreDisplay);
    if (bestEl) bestEl.textContent = Math.floor(best);
    if (levelEl) levelEl.textContent = level;
    if (linesEl) linesEl.textContent = lines;
    if (comboEl) comboEl.textContent = comboMultiplier > 1 ? `COMBO x${comboMultiplier}` : 'COMBO x1';
    syncSubmitButton();
  }

  // ── Roguelite / Director helpers ──────────────────────────────────────────

  function initRunState() {
    run = { scoreMult: 1, dropSlowdown: 0, comboBoostMax: 0, shieldCharges: 0, phantomLineBonus: 0, levelRush: 0, reviveTokens: 0 };
    runStats = { bossesDefeated: 0, highestIntensity: 0, upgradeCount: 0, survivalSec: 0 };
    wave = 0;
    lastWaveLevel = 0;
    phase = 'combat';
    director = createScalingDirector();
    submittedMeta = false;
  }

  function addFloatBanner(_s, text, color) {
    bannerQueue.push({ text, color: color || '#f7c948', ttl: 2.2 });
  }

  function injectGarbageLines(_s, count) {
    for (let g = 0; g < count; g++) {
      board.shift();
      const row = Array(COLS).fill(null);
      for (let c = 0; c < COLS; c++) if (Math.random() > 0.3) row[c] = '#556677';
      board.push(row);
    }
  }

  function triggerPowerClear(_s) {
    let cleared = 0;
    for (let r = board.length - 1; r >= 0 && cleared < 2; r--) {
      if (board[r].some((c) => c !== null)) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(null));
        cleared++;
      }
    }
    if (cleared > 0) addScore(cleared * 200 * level);
  }

  function maybeMutatePiece(piece) {
    if (!director) return;
    const intensity = director.intensity || 0;
    const candidates = MUTATION_DEFS.filter((m) => intensity >= m.threshold);
    if (!candidates.length) return;
    if (Math.random() > 0.18) return;
    const def = candidates[Math.floor(Math.random() * candidates.length)];
    def.apply(piece);
  }

  function checkWaveProgress() {
    if (!run || gameOver) return;
    const currentWave = Math.floor((level - 1) / WAVE_SIZE);
    if (currentWave > wave) {
      wave = currentWave;
      lastWaveLevel = level;
      onWaveClear();
    }
  }

  function onWaveClear() {
    if (!run) return;
    updateIntensity(director, 0, { bossKill: false });
    director.pressure = Math.max(0, director.pressure - 20);
    if (wave % BOSS_WAVE_EVERY === 0 && wave > 0) {
      triggerBossWave();
    } else {
      triggerUpgradePhase();
    }
  }

  function triggerBossWave() {
    phase = 'boss';
    runStats.bossesDefeated++;
    director.eventBoostTimer = 12;
    injectGarbageLines(null, 2);
    addFloatBanner(null, '💀 BOSS WAVE!', '#ff4fd1');
    playGameSound('level');
    setTimeout(() => {
      if (!gameOver && phase === 'boss') {
        phase = 'combat';
        triggerUpgradePhase();
      }
    }, 1500);
  }

  function triggerUpgradePhase() {
    if (gameOver) return;
    phase = 'upgrade';
    paused = true;
    const pool = UPGRADE_DEFS.slice();
    const choices = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      choices.push(pool.splice(idx, 1)[0]);
    }
    upgradeChoices = choices;
    showUpgradeModal();
  }

  function showUpgradeModal() {
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,20,0.88);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:20;font-family:monospace;';
      const gameCard = canvas.closest('.game-card') || canvas.parentElement;
      if (gameCard) { gameCard.style.position = 'relative'; gameCard.appendChild(overlayEl); }
    }
    const title = document.createElement('h2');
    title.textContent = '⬆ WAVE ' + wave + ' CLEAR — CHOOSE UPGRADE';
    title.style.cssText = 'color:#f7c948;margin-bottom:16px;font-size:1rem;text-align:center;';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:90%;max-width:320px;';
    upgradeChoices.forEach((ch) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const rc = RARITY_COLORS[ch.rarity] || '#aaa';
      btn.style.cssText = `background:#0d1a2e;border:2px solid ${rc};color:${rc};padding:10px 14px;border-radius:6px;cursor:pointer;text-align:left;`;
      btn.innerHTML = '<strong>' + ch.name + '</strong><br><span style="font-size:0.8em;color:#aaa">' + ch.desc + '</span>';
      btn.addEventListener('click', () => { applyUpgradeChoice(ch); });
      grid.appendChild(btn);
    });
    overlayEl.innerHTML = '';
    overlayEl.appendChild(title);
    overlayEl.appendChild(grid);
    overlayEl.style.display = 'flex';
  }

  function applyUpgradeChoice(choice) {
    if (choice && run) {
      choice.apply(run);
      runStats.upgradeCount++;
      if (run.levelRush > 0 && run.levelRush !== lastRunLevelRush) {
        lastRunLevelRush = run.levelRush;
        level += 1;
        addScore(500 * level);
        dropInterval = Math.max(0.07, 1.0 - (level - 1) * 0.08);
      }
      playGameSound('level');
    }
    hideUpgradeModal();
    phase = 'combat';
    paused = false;
  }

  let lastRunLevelRush = 0;

  function hideUpgradeModal() {
    if (overlayEl) overlayEl.style.display = 'none';
  }

  function tickDirectorState(dt) {
    if (!director || !run) return;
    tickDirector(director, dt);
    updateIntensity(director, dt, {});
    runStats.highestIntensity = Math.max(runStats.highestIntensity, director.intensity || 0);
    if (shouldFirePressureEvent(director)) {
      const ev = TETRIS_EVENTS.filter((e) => e.minWave <= wave);
      if (ev.length) {
        const pick = ev[Math.floor(Math.random() * ev.length)];
        pick.execute({});
      }
      director.eventCooldown = 12 + Math.random() * 8;
    }
    const chaos = checkForcedChaos(director);
    if (chaos) {
      injectGarbageLines(null, 1);
      addFloatBanner(null, '🔥 CHAOS!', '#ff4fd1');
    }
    if (director.eventBoostTimer > 0) {
      director.eventBoostTimer -= dt;
      dropInterval = Math.max(0.07, (dropInterval - dt * 0.002));
    }
    if (director.mirrorTimer > 0) director.mirrorTimer -= dt;
    if (director.doubleScoreTimer > 0) director.doubleScoreTimer -= dt;
  }

  function getRunScoreMult() {
    let m = run ? run.scoreMult : 1;
    if (director && director.doubleScoreTimer > 0) m *= 2;
    return m;
  }

  function getRunDropInterval(base) {
    if (!run) return base;
    const slowdown = run.dropSlowdown || 0;
    return base + base * slowdown;
  }

  function getRunComboMax(base) {
    if (!run) return base;
    return base + (run.comboBoostMax || 0);
  }

  function randPiece() {
    const key = PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
    const shape = SHAPES[key];
    const piece = {
      key,
      rot: 0,
      row: -1,
      col: Math.floor(COLS / 2) - 1,
      color: shape.color,
      shape,
    };
    maybeMutatePiece(piece);
    return piece;
  }

  function pieceCells(piece, rot) {
    return piece.shape.cells[rot ?? piece.rot];
  }

  function valid(piece, dr, dc, newRot) {
    const rot = ((piece.rot + (newRot || 0)) % 4 + 4) % 4;
    return pieceCells(piece, rot).every(([cr, cc]) => {
      const nr = piece.row + cr + dr;
      const nc = piece.col + cc + dc;
      return nc >= 0 && nc < COLS && nr < ROWS && (nr < 0 || !board[nr][nc]);
    });
  }

  function ghostRow() {
    if (!current) return -1;
    let g = current.row;
    while (true) {
      const probe = { ...current, row: g + 1 };
      if (!valid(probe, 0, 0, 0)) break;
      g++;
    }
    return g;
  }

  function isRunActive() {
    return running && !paused && !gameOver;
  }

  function isRunSessionStarted() {
    return running && !gameOver;
  }

  function drawCell(col, row, color, alpha = 1, scale = 1, dctx = ctx) {
    const x = col * CELL;
    const y = row * CELL;
    const inset = (1 - scale) * CELL * 0.5;
    const w = CELL - 2 - inset * 2;
    const h = CELL - 2 - inset * 2;

    dctx.globalAlpha = alpha;
    dctx.fillStyle = color;
    dctx.fillRect(x + 1 + inset, y + 1 + inset, w, h);

    dctx.globalAlpha = alpha * 0.35;
    dctx.fillStyle = '#ffffff';
    dctx.fillRect(x + 3 + inset, y + 3 + inset, Math.max(2, w * 0.35), Math.max(2, h * 0.18));

    dctx.globalAlpha = alpha * 0.5;
    dctx.strokeStyle = color;
    dctx.lineWidth = 1;
    dctx.strokeRect(x + 0.8 + inset, y + 0.8 + inset, Math.max(2, w + 0.4), Math.max(2, h + 0.4));
    dctx.globalAlpha = 1;
  }

  function spawnParticles(x, y, color, count, spread = 160, size = 3.2) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * spread;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.55 + Math.random() * 0.45,
        maxLife: 0.55 + Math.random() * 0.45,
        size: size * (0.6 + Math.random() * 0.9),
        color,
      });
    }
    if (particles.length > MAX_PARTICLES) {
      particles.splice(0, particles.length - MAX_PARTICLES);
    }
  }

  function addFloatingText(text, x, y, color = '#f7c948', scale = 1) {
    floatingTexts.push({ text, x, y, color, life: 0.9, maxLife: 0.9, vy: -40, scale });
    if (floatingTexts.length > MAX_FLOATING) floatingTexts.splice(0, floatingTexts.length - MAX_FLOATING);
  }

  function addShake(baseIntensity, duration) {
    const levelBoost = Math.min(MAX_LEVEL_SHAKE_BOOST, 1 + (level - 1) * LEVEL_SHAKE_GAIN_PER_LEVEL);
    effects.shakeIntensity = Math.max(effects.shakeIntensity, baseIntensity * levelBoost);
    effects.shakeTime = Math.max(effects.shakeTime, duration);
  }

  function onSuccessfulMove() {
    if (moveSoundCooldown <= 0) {
      playGameSound('move');
      moveSoundCooldown = 0.04;
    }
  }

  function tryMove(dr, dc) {
    if (!current || pendingClearRows) return false;
    if (!valid(current, dr, dc, 0)) return false;
    current.row += dr;
    current.col += dc;
    if (dc !== 0) onSuccessfulMove();
    if (dr > 0 && (keys.ArrowDown || keys.s)) addScore(1);
    return true;
  }

  function tryRotate() {
    if (!current || pendingClearRows) return;
    for (const dc of [0, 1, -1, 2, -2]) {
      if (valid(current, 0, dc, 1)) {
        current.col += dc;
        current.rot = (current.rot + 1) % 4;
        playGameSound('rotate');
        return;
      }
    }
  }

  function findCompletedRows() {
    const rows = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every((c) => c !== null)) rows.push(r);
    }
    return rows;
  }

  function handleClearScoring(cleared) {
    const baseLineScore = [0, 100, 300, 500, 800][cleared] || 0;
    comboChain += 1;
    comboMultiplier = Math.min(getRunComboMax(4), Math.max(1, comboChain));

    let backToBackBonus = 0;
    const isBackToBackType = cleared >= 4;
    if (isBackToBackType && lastWasB2BType) {
      backToBackChain += 1;
      backToBackBonus = Math.floor(
        baseLineScore * level * BACK_TO_BACK_BONUS_MULTIPLIER +
        backToBackChain * BACK_TO_BACK_CHAIN_STEP_BONUS
      );
      addFloatingText(`B2B +${backToBackBonus}`, canvas.width * 0.5, canvas.height * 0.32, '#ff4fd1', 1.05);
    } else if (isBackToBackType) {
      backToBackChain = 1;
    } else {
      backToBackChain = 0;
    }
    lastWasB2BType = isBackToBackType;

    const clearScore = baseLineScore * level * comboMultiplier;
    const total = clearScore + backToBackBonus;
    addScore(total);

    lines += cleared;
    const prevLevel = level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(0.07, getRunDropInterval(1.0 - (level - 1) * 0.08));
    checkWaveProgress();

    triggerHudFx(linesStatEl, 'hud-pulse', 260);
    if (level > prevLevel) {
      effects.levelFlash = 0.25;
      playGameSound('level');
      triggerHudFx(levelStatEl, 'hud-flash', 320);
      addFloatingText(`LEVEL ${level}`, canvas.width * 0.5, canvas.height * 0.48, '#bc8cff', 1.2);
    }

    effects.comboPulse = Math.max(effects.comboPulse, 0.25 + comboMultiplier * 0.03);
    effects.rgbSplit = Math.max(effects.rgbSplit, 0.8 + comboMultiplier * 0.25);
    if (comboMultiplier >= 3) {
      effects.glitchPulse = Math.max(effects.glitchPulse, 0.16 + comboMultiplier * 0.04);
      playGameSound('combo');
    }

    const popColor = comboMultiplier >= 3 ? '#ff4fd1' : '#f7c948';
    addFloatingText(`+${total}`, canvas.width * 0.5, canvas.height * 0.4, popColor, 1 + comboMultiplier * 0.08);
    if (comboEl && comboMultiplier > 1) comboEl.classList.add('active');
  }

  function beginLineClear(rows) {
    pendingClearRows = rows.slice().sort((a, b) => a - b);
    clearFxDuration = 0.18 + Math.min(0.06, level * 0.004);
    clearFxTimer = clearFxDuration;
    effects.clearSweep = 1;
    addShake(1.5 + rows.length * 0.5, 0.11);
    playGameSound('line');

    const baseCount = 10 + rows.length * 4;
    for (const row of pendingClearRows) {
      const y = row * CELL + CELL * 0.5;
      spawnParticles(canvas.width * 0.5, y, '#bc8cff', baseCount, 220, 2.6 + rows.length * 0.3);
    }

    handleClearScoring(rows.length);
  }

  function finalizeLineClear() {
    if (!pendingClearRows || !pendingClearRows.length) return;
    const rows = pendingClearRows;
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      board.splice(row, 1);
      board.unshift(Array(COLS).fill(null));
    }
    pendingClearRows = null;
    clearFxTimer = 0;
    effects.clearSweep = 0;
    spawnNextPiece();
  }

  function spawnNextPiece() {
    current = next;
    next = randPiece();
    current.row = -1;
    current.col = Math.floor(COLS / 2) - 1;
    dropTimer = 0;

    if (!valid(current, 1, 0, 0) && !valid(current, 0, 0, 0)) {
      onGameOver();
    }
  }

  function lockPiece() {
    if (!current) return;
    pendingLockedCells = [];

    for (const [r, c] of pieceCells(current)) {
      const nr = current.row + r;
      const nc = current.col + c;
      if (nr >= 0) {
        board[nr][nc] = current.color;
        pendingLockedCells.push({ row: nr, col: nc, color: current.color });
      }
    }

    effects.lockGlow = 0.1;
    effects.lockPulse = 0.08;
    addShake(1.2 + Math.min(1.4, level * 0.08), 0.08);
    playGameSound('lock');

    for (const cell of pendingLockedCells) {
      const x = cell.col * CELL + CELL * 0.5;
      const y = cell.row * CELL + CELL * 0.5;
      spawnParticles(x, y, cell.color, 2 + Math.floor(Math.random() * 2), 85, 2.5);
    }

    const rows = findCompletedRows();
    if (rows.length) {
      beginLineClear(rows);
    } else {
      comboChain = 0;
      comboMultiplier = 1;
      lastWasB2BType = false;
      if (comboEl) comboEl.classList.remove('active');
      spawnNextPiece();
    }
  }

  function hardDrop() {
    if (!current || pendingClearRows) return;
    let dist = 0;
    while (valid(current, 1, 0, 0)) {
      current.row++;
      dist++;
    }
    if (dist > 0) addScore(dist * 2);
    playGameSound('drop');
    lockPiece();
  }

  function drawBackground() {
    const w = canvas.width;
    const h = canvas.height;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#070b1a');
    grad.addColorStop(0.55, '#090f22');
    grad.addColorStop(1, '#050913');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const gridOffset = (elapsed * (16 + level * 0.8)) % CELL;
    const depthAlpha = 0.035 + Math.min(0.035, level * 0.0025);
    ctx.strokeStyle = `rgba(46,197,255,${depthAlpha})`;
    ctx.lineWidth = 1;

    for (let x = 0; x <= w + CELL; x += CELL) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - gridOffset * 0.55, h);
      ctx.stroke();
    }

    for (let y = -CELL; y <= h + CELL; y += CELL) {
      const yy = y + gridOffset;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
      ctx.stroke();
    }
  }

  function drawBoardAndPiece(drawFxPass = false) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const color = board[r][c];
        if (!color) continue;
        let alpha = 1;
        if (pendingClearRows && pendingClearRows.includes(r)) {
          const progress = 1 - (clearFxTimer / Math.max(0.001, clearFxDuration));
          const flash = Math.sin(progress * Math.PI * 6) * 0.25 + 0.75;
          const dissolve = 1 - progress;
          const sweepCut = c / (COLS - 1);
          alpha = Math.max(0, dissolve - (progress - sweepCut) * 0.6) * flash;
          if (alpha < 0.04) continue;
        }
        drawCell(c, r, color, alpha);
      }
    }

    if (!drawFxPass && current) {
      const gRow = ghostRow();
      for (const [r, c] of pieceCells(current)) {
        drawCell(current.col + c, gRow + r, current.color, 0.18);
      }
    }

    if (current) {
      const pulse = 0.96 + Math.sin(elapsed * 8.5) * 0.04;
      for (const [r, c] of pieceCells(current)) {
        drawCell(current.col + c, current.row + r, current.color, 1, pulse);
      }
    }

    if (effects.lockGlow > 0 && pendingLockedCells.length) {
      ctx.save();
      ctx.globalAlpha = effects.lockGlow * 2.2;
      for (const cell of pendingLockedCells) {
        const x = cell.col * CELL;
        const y = cell.row * CELL;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      }
      ctx.restore();
    }
  }

  function drawNextPiece() {
    if (!nctx || !nc) return;
    nctx.fillStyle = '#090c16';
    nctx.fillRect(0, 0, nc.width, nc.height);

    if (!next) return;
    const pc = pieceCells(next, 0);
    const minR = Math.min(...pc.map(([r]) => r));
    const maxR = Math.max(...pc.map(([r]) => r));
    const minC = Math.min(...pc.map(([, c]) => c));
    const maxC = Math.max(...pc.map(([, c]) => c));
    const offR = (4 - (maxR - minR + 1)) / 2 - minR;
    const offC = (4 - (maxC - minC + 1)) / 2 - minC;

    for (const [r, c] of pc) {
      nctx.fillStyle = next.color;
      nctx.fillRect((offC + c) * 20 + 1, (offR + r) * 20 + 1, 18, 18);
      nctx.globalAlpha = 0.35;
      nctx.fillStyle = '#ffffff';
      nctx.fillRect((offC + c) * 20 + 3, (offR + r) * 20 + 3, 7, 4);
      nctx.globalAlpha = 1;
    }
  }

  function drawParticlesAndFloating(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;

      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    }

    ctx.globalAlpha = 1;

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const f = floatingTexts[i];
      f.life -= dt;
      if (f.life <= 0) {
        floatingTexts.splice(i, 1);
        continue;
      }
      f.y += f.vy * dt;
      const alpha = Math.max(0, f.life / f.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      ctx.font = `bold ${Math.round(16 * f.scale)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  function drawScanlines() {
    const alpha = 0.06 + effects.scanlineFlicker * 0.16;
    if (alpha <= 0.005) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000000';
    for (let y = 0; y < canvas.height; y += 3) {
      ctx.fillRect(0, y, canvas.width, 1);
    }
    ctx.restore();
  }

  function drawComboBanner() {
    if (!comboEl) return;
    const highCombo = comboMultiplier >= 2 && comboChain > 0;
    comboEl.style.opacity = highCombo ? '1' : '0.72';
    comboEl.style.transform = highCombo ? `scale(${1 + Math.min(0.2, effects.comboPulse)})` : 'scale(1)';
  }

  function drawStateCard() {
    if (!running && !gameOver) {
      ctx.fillStyle = '#bc8cff';
      ctx.font = 'bold 18px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Press Start', canvas.width / 2, canvas.height / 2);
      return;
    }

    if (paused) {
      ctx.fillStyle = '#f7c948';
      ctx.font = 'bold 24px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
      return;
    }

    if (gameOver) {
      ctx.fillStyle = '#ff4fd1';
      ctx.font = 'bold 22px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 16);
      ctx.fillStyle = '#f7c948';
      ctx.font = 'bold 16px system-ui';
      ctx.fillText(`Score: ${Math.floor(score)}`, canvas.width / 2, canvas.height / 2 + 10);
      ctx.fillStyle = '#8b949e';
      ctx.font = '13px system-ui';
      ctx.fillText('Reset or Submit to play again', canvas.width / 2, canvas.height / 2 + 36);
    }
  }

  function draw(dt) {
    const shakeX = effects.shakeTime > 0 ? (Math.random() - 0.5) * effects.shakeIntensity * 2 : 0;
    const shakeY = effects.shakeTime > 0 ? (Math.random() - 0.5) * effects.shakeIntensity * 2 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawBackground();

    if (effects.rgbSplit > 0) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.translate(effects.rgbSplit, 0);
      drawBoardAndPiece(true);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.translate(-effects.rgbSplit, 0);
      drawBoardAndPiece(true);
      ctx.restore();
    }

    drawBoardAndPiece(false);
    drawParticlesAndFloating(dt);

    if (effects.levelFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.28, effects.levelFlash * 1.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    drawScanlines();
    drawStateCard();
    ctx.restore();

    drawNextPiece();
    drawComboBanner();
  }

  function updateEffects(dt) {
    elapsed += dt;
    moveSoundCooldown = Math.max(0, moveSoundCooldown - dt);

    effects.shakeTime = Math.max(0, effects.shakeTime - dt);
    if (effects.shakeTime <= 0) effects.shakeIntensity = 0;

    effects.lockGlow = Math.max(0, effects.lockGlow - dt * 5.2);
    effects.lockPulse = Math.max(0, effects.lockPulse - dt * 6.3);
    effects.levelFlash = Math.max(0, effects.levelFlash - dt * 3.8);
    effects.rgbSplit = Math.max(0, effects.rgbSplit - dt * (3.6 - Math.min(1.1, level * 0.03)));
    effects.glitchPulse = Math.max(0, effects.glitchPulse - dt * 4.2);
    effects.comboPulse = Math.max(0, effects.comboPulse - dt * 2.7);

    effects.scanlineCooldown -= dt;
    if (effects.scanlineCooldown <= 0) {
      effects.scanlineFlicker = 0.2 + Math.random() * 0.8;
      effects.scanlineCooldown = 2.4 + Math.random() * 4.8;
    } else {
      effects.scanlineFlicker = Math.max(0, effects.scanlineFlicker - dt * 2.1);
    }

    updateHud();
  }

  function updateGameplay(dt) {
    if (!isRunActive()) return;

    if (pendingClearRows) {
      clearFxTimer -= dt;
      if (clearFxTimer <= 0) finalizeLineClear();
      return;
    }

    if (dasDir !== 0) {
      dasTimer += dt;
      if (dasTimer >= DAS_DELAY) {
        dasActive = true;
        dasRateTimer += dt;
        if (dasRateTimer >= DAS_RATE) {
          dasRateTimer = 0;
          tryMove(0, dasDir);
        }
      }
    }

    let interval = dropInterval;
    if (keys.ArrowDown || keys.s) interval = Math.min(0.05, interval);

    dropTimer += dt;
    if (dropTimer >= interval) {
      dropTimer = 0;
      if (!tryMove(1, 0)) lockPiece();
    }
  }

  function loop(ts) {
    frameDebug.tick(ts);
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    if (isRunActive()) {
      tickDirectorState(dt);
      runStats.survivalSec += dt;
      bannerTimer -= dt;
      if (bannerTimer <= 0 && bannerQueue.length) {
        const b = bannerQueue.shift();
        addFloatingText(b.text, canvas.width * 0.5, canvas.height * 0.2, b.color || '#f7c948', 1.1);
        bannerTimer = 1.5;
      }
    }
    updateEffects(dt);
    updateGameplay(dt);
    draw(dt);
    raf = requestAnimationFrame(loop);
  }

  async function submitRunScore() {
    if (!gameOver || submitInFlight || submittedRunScore) return;

    if (!canSubmitCompetitive()) {
      if (window.MOONBOYS_IDENTITY?.showSyncGateModal) {
        window.MOONBOYS_IDENTITY.showSyncGateModal(true);
      }
      syncSubmitButton();
      return;
    }

    submitInFlight = true;
    syncSubmitButton();
    try {
      await submitScore(resolveCompetitivePlayer(), Math.floor(score), 'tetris');
      submittedRunScore = true;
    } catch (_) {
      // Keep button enabled after failure for retry.
    } finally {
      submitInFlight = false;
      syncSubmitButton();
    }
  }

  async function onGameOver() {
    running = false;
    gameOver = true;
    stopAllSounds();
    setBestMaybe();
    updateHud();

    if (!submittedMeta) {
      submittedMeta = true;
      const runData = {
        score: score,
        wave: wave,
        survival: Math.round(runStats.survivalSec || 0),
        bossesDefeated: runStats.bossesDefeated || 0,
        upgradeCount: runStats.upgradeCount || 0,
        highestIntensity: runStats.highestIntensity || 0,
      };
      try { recordRunStats(runData); checkMilestones(runData); } catch (_) {}
    }

    if (canSubmitCompetitive()) {
      await submitRunScore();
    }

    if (window.showGameOverModal) window.showGameOverModal(Math.floor(score));
  }

  function resetBoardState() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    current = randPiece();
    next = randPiece();
    current.row = -1;
    current.col = Math.floor(COLS / 2) - 1;
    dropTimer = 0;
    dropInterval = 1.0;

    pendingClearRows = null;
    clearFxTimer = 0;
    pendingLockedCells = [];
    particles.length = 0;
    floatingTexts.length = 0;
    effects.shakeTime = 0;
    effects.shakeIntensity = 0;
    effects.lockGlow = 0;
    effects.lockPulse = 0;
    effects.levelFlash = 0;
    effects.rgbSplit = 0;
    effects.glitchPulse = 0;
    effects.comboPulse = 0;
  }

  function resetGame() {
    score = 0;
    scoreDisplay = 0;
    level = 1;
    lines = 0;
    running = false;
    paused = false;
    gameOver = false;
    elapsed = 0;

    comboChain = 0;
    comboMultiplier = 1;
    backToBackChain = 0;
    lastWasB2BType = false;
    submittedRunScore = false;
    submitInFlight = false;
    initRunState();
    lastRunLevelRush = 0;

    resetBoardState();
    if (comboEl) comboEl.classList.remove('active');
    updateHud();
  }

  function onKeyDown(e) {
    frameDebug.input('keydown', e.key);
    if (!keys[e.key]) {
      keys[e.key] = true;
      if (!isRunActive()) return;

      if (e.key === 'ArrowLeft' || e.key === 'a') {
        tryMove(0, -1);
        dasDir = -1;
        dasTimer = 0;
        dasActive = false;
        dasRateTimer = 0;
        e.preventDefault();
      }
      if (e.key === 'ArrowRight' || e.key === 'd') {
        tryMove(0, 1);
        dasDir = 1;
        dasTimer = 0;
        dasActive = false;
        dasRateTimer = 0;
        e.preventDefault();
      }
      if (e.key === 'ArrowUp' || e.key === 'w') {
        tryRotate();
        e.preventDefault();
      }
      if (e.key === 'ArrowDown' || e.key === 's') {
        dropTimer = dropInterval;
        e.preventDefault();
      }
      if (e.key === ' ') {
        hardDrop();
        e.preventDefault();
      }
    }
    keys[e.key] = true;
  }

  function onKeyUp(e) {
    frameDebug.input('keyup', e.key);
    keys[e.key] = false;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'ArrowRight' || e.key === 'd') {
      dasDir = 0;
      dasActive = false;
    }
  }

  function init() {
    best = ArcadeSync.getHighScore(GAME_ID);
    resetGame();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    if (startBtn) startBtn.onclick = () => start();
    if (pauseBtn) pauseBtn.onclick = () => {
      if (!isRunSessionStarted()) return;
      paused = !paused;
      if (paused) stopAllSounds();
      updateHud();
    };
    if (resetBtn) resetBtn.onclick = () => reset();
    if (submitBtn) submitBtn.onclick = () => { submitRunScore(); };

    lastTime = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    resetGame();
    running = true;
    lastTime = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
    updateHud();
  }

  function pause() {
    if (!isRunSessionStarted()) return;
    paused = true;
    stopAllSounds();
    updateHud();
  }

  function resume() {
    if (!isRunSessionStarted()) return;
    paused = false;
    updateHud();
  }

  function reset() {
    stopAllSounds();
    resetGame();
    updateHud();
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    stopAllSounds();

    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);

    if (startBtn) startBtn.onclick = null;
    if (pauseBtn) pauseBtn.onclick = null;
    if (resetBtn) resetBtn.onclick = null;
    if (submitBtn) submitBtn.onclick = null;
  }

  function getScore() {
    return Math.floor(score);
  }

  return { init, start, pause, resume, reset, destroy, getScore };
}
