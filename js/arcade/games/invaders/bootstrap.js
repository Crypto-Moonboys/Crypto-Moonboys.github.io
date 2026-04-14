/**
 * bootstrap.js — Invaders 3008 game module
 *
 * Contains all Invaders 3008 game logic.  Exports bootstrapInvaders(), which is
 * the entry point called by game-shell.js via mountGame().
 *
 * Integrations preserved:
 *  - ArcadeSync   (local high-score persistence)
 *  - submitScore  (leaderboard-client.js remote submission)
 *  - rollHiddenBonus / showBonusPopup  (bonus-engine.js)
 *  - window.showGameOverModal          (game-fullscreen.js)
 */

import { ArcadeSync }                      from '/js/arcade-sync.js';
import { submitScore }                     from '/js/leaderboard-client.js';
import { rollHiddenBonus, showBonusPopup } from '/js/bonus-engine.js';
import { INVADERS_CONFIG }                 from './config.js';
import { GameRegistry }                    from '/js/arcade/core/game-registry.js';

// Register in the central registry when this module is first imported.
GameRegistry.register(INVADERS_CONFIG.id, {
  label:     INVADERS_CONFIG.label,
  bootstrap: bootstrapInvaders,
});

/**
 * Bootstrap the Invaders 3008 game.
 *
 * @param {Element} root - The .game-card element (unused directly; DOM IDs are unique).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapInvaders(root) {
  const GAME_ID = INVADERS_CONFIG.id;
  const canvas  = document.getElementById('invCanvas');
  const ctx     = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // ── HUD ──────────────────────────────────────────────────────────────────
  const scoreEl = document.getElementById('score');
  const bestEl  = document.getElementById('best');
  const waveEl  = document.getElementById('wave');
  const livesEl = document.getElementById('lives');

  // ── State ─────────────────────────────────────────────────────────────────
  let score=0, lives=3, wave=0, running=false, paused=false, gameOver=false;
  let best = ArcadeSync.getHighScore(GAME_ID);
  let raf=null;
  let lastTime=0;

  // ── Player ────────────────────────────────────────────────────────────────
  const SHIP_W=36, SHIP_H=20;
  let player = { x: W/2, y: H-50, w: SHIP_W, h: SHIP_H, speed: 260, dx: 0 };
  let bullets = [];
  const BULLET_SPD = 520;
  let shootCooldown = 0;
  const SHOOT_RATE  = 0.28;

  // ── Invaders ──────────────────────────────────────────────────────────────
  const ROWS=4, COLS=10, INV_W=36, INV_H=28, INV_PAD=10;
  let invaders = [];
  let invDir = 1;
  let invSpeed = 60;
  let invDropping = false, invDropLeft = 0;
  const DROP_AMT = 16;
  let invBullets = [];
  let invShootTimer = 0;
  let invShootInterval = 1.8;

  // ── Boss ──────────────────────────────────────────────────────────────────
  let boss = null;
  const BOSS_W=80, BOSS_H=44;

  // ── Keys ──────────────────────────────────────────────────────────────────
  const keys = {};

  function onKeyDown(e) {
    keys[e.key] = true;
    if (e.key === ' ' && running && !paused) { e.preventDefault(); tryShoot(); }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && running) e.preventDefault();
  }
  function onKeyUp(e) { keys[e.key] = false; }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function rand(a,b) { return a + Math.random()*(b-a); }
  function rectsOverlap(ax,ay,aw,ah, bx,by,bw,bh) {
    return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
  }
  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent  = best;
    waveEl.textContent  = wave || '—';
    livesEl.textContent = lives;
  }

  // ── Build invader grid ────────────────────────────────────────────────────
  function buildGrid() {
    invaders = [];
    const totalW = COLS*(INV_W+INV_PAD) - INV_PAD;
    const offX = (W - totalW) / 2;
    for (let r=0;r<ROWS;r++) {
      for (let c=0;c<COLS;c++) {
        invaders.push({
          x: offX + c*(INV_W+INV_PAD),
          y: 60 + r*(INV_H+INV_PAD),
          w: INV_W, h: INV_H,
          row: r, alive: true,
        });
      }
    }
    invDir = 1;
    invSpeed = 55 + wave*8;
    invShootInterval = Math.max(0.55, 1.8 - wave*0.12);
    invDropping = false;
  }

  function spawnBoss() {
    boss = { x: W/2 - BOSS_W/2, y: 30, w: BOSS_W, h: BOSS_H, hp: 8+wave, maxHp: 8+wave, dir: 1, speed: 90+wave*10 };
  }

  function startWave() {
    wave++;
    bullets = [];
    invBullets = [];
    boss = null;
    if (wave % 5 === 0) {
      spawnBoss();
    } else {
      buildGrid();
    }
    waveEl.textContent = wave;
  }

  function resetGame() {
    score = 0; lives = 3; wave = 0; running = false; paused = false; gameOver = false;
    bullets = []; invBullets = []; boss = null; invaders = [];
    player = { x: W/2, y: H-50, w: SHIP_W, h: SHIP_H, speed: 260, dx: 0 };
    updateHud(); draw();
  }

  function tryShoot() {
    if (shootCooldown > 0) return;
    bullets.push({ x: player.x + player.w/2 - 2, y: player.y, w: 4, h: 12 });
    shootCooldown = SHOOT_RATE;
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  function update(dt) {
    if (!running || paused || gameOver) return;

    // Player movement
    if (keys['ArrowLeft']  || keys['a']) player.x -= player.speed * dt;
    if (keys['ArrowRight'] || keys['d']) player.x += player.speed * dt;
    player.x = Math.max(0, Math.min(W - player.w, player.x));

    // Shoot cooldown
    if (shootCooldown > 0) shootCooldown -= dt;

    // Player bullets
    bullets.forEach(b => { b.y -= BULLET_SPD * dt; });
    bullets = bullets.filter(b => b.y > -20);

    // Invader movement
    if (!boss && invaders.length) {
      const alive = invaders.filter(i => i.alive);
      if (!alive.length) { startWave(); return; }

      if (invDropping) {
        invDropLeft -= DROP_AMT;
        alive.forEach(i => { i.y += DROP_AMT; });
        invDropping = false;
        invDir *= -1;
      } else {
        let hitWall = false;
        alive.forEach(i => { i.x += invSpeed * invDir * dt; });
        const minX = Math.min(...alive.map(i=>i.x));
        const maxX = Math.max(...alive.map(i=>i.x+i.w));
        if (maxX >= W-4 || minX <= 4) { hitWall = true; }
        if (hitWall) { invDropping = true; }
      }

      // Check if any invader reached the bottom
      if (alive.some(i => i.y + i.h >= H-60)) {
        onGameOver(); return;
      }

      // Invader shoots
      invShootTimer -= dt;
      if (invShootTimer <= 0) {
        invShootTimer = invShootInterval * rand(0.6, 1.4);
        const shooters = alive;
        if (shooters.length) {
          const s = shooters[Math.floor(Math.random()*shooters.length)];
          invBullets.push({ x: s.x+s.w/2-2, y: s.y+s.h, w:4, h:12 });
        }
      }
    }

    // Boss movement
    if (boss) {
      boss.x += boss.speed * boss.dir * dt;
      if (boss.x <= 0)        { boss.dir =  1; boss.x = 0; }
      if (boss.x+boss.w >= W) { boss.dir = -1; boss.x = W-boss.w; }

      // Boss shoots
      invShootTimer -= dt;
      if (invShootTimer <= 0) {
        invShootTimer = 0.55 * rand(0.6,1.4);
        invBullets.push({ x: boss.x+boss.w/2-8, y: boss.y+boss.h, w:4, h:14 });
        invBullets.push({ x: boss.x+boss.w/2+4, y: boss.y+boss.h, w:4, h:14 });
      }
    }

    // Enemy bullets move
    invBullets.forEach(b => { b.y += 320 * dt; });
    invBullets = invBullets.filter(b => b.y < H+20);

    // Bullet vs invader collision
    for (let bi=bullets.length-1; bi>=0; bi--) {
      const b = bullets[bi];
      let hit = false;
      for (const inv of invaders) {
        if (!inv.alive) continue;
        if (rectsOverlap(b.x,b.y,b.w,b.h, inv.x,inv.y,inv.w,inv.h)) {
          inv.alive = false; hit = true;
          const pts = (ROWS - inv.row) * 10 * (wave);
          score += pts;
          ArcadeSync.setHighScore(GAME_ID, score);
          best = ArcadeSync.getHighScore(GAME_ID);
          updateHud();
          rollHiddenBonus({score, streak:0, game:GAME_ID})
            .then(b => { if(b){score+=b.rewards?.arcade_points||0; ArcadeSync.setHighScore(GAME_ID,score); best=ArcadeSync.getHighScore(GAME_ID); updateHud(); showBonusPopup(b);} })
            .catch(()=>{});
          break;
        }
      }
      if (boss && !hit) {
        if (rectsOverlap(b.x,b.y,b.w,b.h, boss.x,boss.y,boss.w,boss.h)) {
          boss.hp--; hit = true;
          score += 20 * wave;
          ArcadeSync.setHighScore(GAME_ID, score);
          best = ArcadeSync.getHighScore(GAME_ID);
          updateHud();
          if (boss.hp <= 0) {
            score += 500 * wave;
            ArcadeSync.setHighScore(GAME_ID, score);
            best = ArcadeSync.getHighScore(GAME_ID);
            updateHud();
            boss = null;
            startWave();
          }
        }
      }
      if (hit) bullets.splice(bi,1);
    }

    // Enemy bullet vs player collision
    for (let bi=invBullets.length-1; bi>=0; bi--) {
      const b = invBullets[bi];
      if (rectsOverlap(b.x,b.y,b.w,b.h, player.x,player.y,player.w,player.h)) {
        invBullets.splice(bi,1);
        lives--;
        livesEl.textContent = lives;
        if (lives <= 0) { onGameOver(); return; }
      }
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  function drawShip(x,y,w,h) {
    ctx.fillStyle = '#2ec5ff';
    ctx.beginPath();
    ctx.moveTo(x+w/2, y);
    ctx.lineTo(x+w, y+h);
    ctx.lineTo(x, y+h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(x+w/2-4, y+h-8, 8, 8);
  }

  function drawInvader(x,y,w,h,row) {
    const colors = ['#ff4fd1','#bc8cff','#3fb950','#f7c948'];
    ctx.fillStyle = colors[row % colors.length];
    ctx.fillRect(x+4, y+4, w-8, h-8);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x+8, y+8, 6, 6);
    ctx.fillRect(x+w-14, y+8, 6, 6);
  }

  function drawBoss(b) {
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ff8888';
    ctx.fillRect(b.x+10, b.y+8, 20, 12);
    ctx.fillRect(b.x+b.w-30, b.y+8, 20, 12);
    // HP bar
    ctx.fillStyle = '#333';
    ctx.fillRect(b.x, b.y-10, b.w, 6);
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(b.x, b.y-10, b.w*(b.hp/b.maxHp), 6);
  }

  function draw() {
    ctx.fillStyle = '#090c16';
    ctx.fillRect(0,0,W,H);

    // Grid lines
    ctx.strokeStyle = 'rgba(63,185,80,0.05)';
    ctx.lineWidth = 1;
    for (let x=0;x<W;x+=40){ ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke(); }
    for (let y=0;y<H;y+=40){ ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke(); }

    if (!running && !gameOver) {
      ctx.fillStyle = '#3fb950';
      ctx.font = 'bold 28px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Press Start', W/2, H/2);
      return;
    }

    if (paused) {
      ctx.fillStyle = '#f7c948';
      ctx.font = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W/2, H/2);
    }

    if (gameOver) {
      ctx.fillStyle = '#ff4fd1';
      ctx.font = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W/2, H/2-20);
      ctx.fillStyle = '#f7c948';
      ctx.font = 'bold 20px system-ui';
      ctx.fillText(`Score: ${score}`, W/2, H/2+20);
      ctx.fillStyle = '#8b949e';
      ctx.font = '16px system-ui';
      ctx.fillText('Press Start to play again', W/2, H/2+55);
      return;
    }

    // Ground line
    ctx.strokeStyle = '#3fb95044';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,H-30); ctx.lineTo(W,H-30); ctx.stroke();

    // Player ship
    drawShip(player.x, player.y, player.w, player.h);

    // Invaders
    invaders.forEach(i => { if(i.alive) drawInvader(i.x,i.y,i.w,i.h,i.row); });

    // Boss
    if (boss) drawBoss(boss);

    // Player bullets
    ctx.fillStyle = '#2ec5ff';
    bullets.forEach(b => ctx.fillRect(b.x,b.y,b.w,b.h));

    // Enemy bullets
    ctx.fillStyle = '#ff4fd1';
    invBullets.forEach(b => ctx.fillRect(b.x,b.y,b.w,b.h));

    // Lives icons
    for (let i=0;i<lives;i++) {
      ctx.fillStyle = '#2ec5ff';
      ctx.fillText('▲', 14 + i*22, H-8);
    }
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  function loop(ts) {
    const dt = Math.min((ts - lastTime)/1000, 0.05);
    lastTime = ts;
    update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

  // ── Game over ─────────────────────────────────────────────────────────────
  async function onGameOver() {
    running = false; gameOver = true;
    ArcadeSync.setHighScore(GAME_ID, score);
    best = ArcadeSync.getHighScore(GAME_ID);
    updateHud();
    try { await submitScore(ArcadeSync.getPlayer(), score, GAME_ID); } catch(e) {}
    draw();
    if (window.showGameOverModal) window.showGameOverModal(score);
  }

  // ── Lifecycle implementation ──────────────────────────────────────────────

  function init() {
    best = ArcadeSync.getHighScore(GAME_ID);
    updateHud();
    draw();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    document.getElementById('startBtn').onclick = () => {
      resetGame();
      running = true; gameOver = false; paused = false;
      startWave();
      lastTime = performance.now();
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    document.getElementById('pauseBtn').onclick = () => { if (running) paused = !paused; };
    document.getElementById('resetBtn').onclick = () => {
      if (raf) cancelAnimationFrame(raf);
      resetGame();
      raf = requestAnimationFrame(loop);
    };
  }

  function start() {
    resetGame();
    running = true; gameOver = false; paused = false;
    startWave();
    lastTime = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function pause() {
    if (running) paused = true;
  }

  function resume() {
    if (running && paused) paused = false;
  }

  function reset() {
    if (raf) cancelAnimationFrame(raf);
    resetGame();
    raf = requestAnimationFrame(loop);
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);
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

  // ── Public lifecycle object ───────────────────────────────────────────────

  return { init, start, pause, resume, reset, destroy, getScore };
}
