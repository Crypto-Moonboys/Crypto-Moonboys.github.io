/**
 * bootstrap.js — Pac-Chain game module
 *
 * Contains all Pac-Chain game logic.  Exports bootstrapPacChain(), which is
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
import { PAC_CHAIN_CONFIG }                from './config.js';
import { GameRegistry }                    from '/js/arcade/core/game-registry.js';

// Register in the central registry when this module is first imported.
GameRegistry.register(PAC_CHAIN_CONFIG.id, {
  label:     PAC_CHAIN_CONFIG.label,
  bootstrap: bootstrapPacChain,
});

/**
 * Bootstrap the Pac-Chain game.
 *
 * @param {Element} root - The .game-card element (unused directly; DOM IDs are unique).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapPacChain(root) {
  const GAME_ID = PAC_CHAIN_CONFIG.id;
  const canvas  = document.getElementById('pacCanvas');
  const ctx     = canvas.getContext('2d');
  const COLS=20, ROWS=20, CELL=28;
  const W = COLS*CELL, H = ROWS*CELL;
  canvas.width = W; canvas.height = H;

  // HUD
  const scoreEl = document.getElementById('score');
  const bestEl  = document.getElementById('best');
  const levelEl = document.getElementById('level');
  const livesEl = document.getElementById('lives');

  // ── Maze definitions (0=wall, 1=pellet, 2=power, 3=open) ─────────────────
  const BASE_MAZE = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,0],
    [0,2,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,2,0],
    [0,1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,0,0,1,0,1,0,0,0,0,0,0,1,0,1,0,0,1,0],
    [0,1,1,1,1,0,1,1,1,0,0,1,1,1,0,1,1,1,1,0],
    [0,0,0,0,1,0,0,0,3,0,0,3,0,0,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,3,3,3,3,3,3,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,0,0,3,3,0,0,3,0,1,0,0,0,0],
    [3,3,3,3,1,3,3,0,3,3,3,3,0,3,3,1,3,3,3,3],
    [0,0,0,0,1,0,3,0,0,0,0,0,0,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,3,3,3,3,3,3,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,0,0,0,0,0,0,3,0,1,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,0],
    [0,1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,1,0],
    [0,2,1,0,1,1,1,1,1,3,3,1,1,1,1,1,0,1,2,0],
    [0,0,1,0,1,0,1,0,0,0,0,0,0,1,0,1,0,1,0,0],
    [0,1,1,1,1,0,1,1,1,1,1,1,1,1,0,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ];

  const MAZE_1 = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,1,1,1,0,1,1,0,0,1,1,0,1,1,1,1,1,0],
    [0,2,0,0,1,0,0,1,1,0,0,1,1,0,0,1,0,0,2,0],
    [0,1,0,1,1,1,0,1,0,0,0,0,1,0,1,1,1,0,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,0,0,1,0,1,1,0,0,0,0,1,1,0,1,0,0,1,0],
    [0,1,1,1,1,1,1,0,0,0,0,0,0,1,1,1,1,1,1,0],
    [0,0,0,0,1,0,0,0,3,0,0,3,0,0,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,3,3,3,3,3,3,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,0,0,3,3,0,0,3,0,1,0,0,0,0],
    [3,3,3,3,1,3,3,0,3,3,3,3,0,3,3,1,3,3,3,3],
    [0,0,0,0,1,0,3,0,0,0,0,0,0,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,3,3,3,3,3,3,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,0,0,0,0,0,0,3,0,1,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,0],
    [0,1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,1,0],
    [0,2,1,0,1,1,1,1,1,3,3,1,1,1,1,1,0,1,2,0],
    [0,0,1,0,1,0,1,0,0,0,0,0,0,1,0,1,0,1,0,0],
    [0,1,1,1,1,0,1,1,1,1,1,1,1,1,0,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ];

  const MAZE_2 = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,0,1,1,1,1,1,0,0,1,1,1,1,1,0,1,1,0],
    [0,2,1,0,1,0,0,0,1,0,0,1,0,0,0,1,0,1,2,0],
    [0,1,1,0,1,0,1,1,1,0,0,1,1,1,0,1,0,1,1,0],
    [0,1,1,1,1,1,0,0,1,1,1,1,0,0,1,1,1,1,1,0],
    [0,1,1,0,1,0,1,0,1,0,0,1,0,1,0,1,0,1,1,0],
    [0,1,0,0,1,0,1,1,1,0,0,1,1,1,0,1,0,0,1,0],
    [0,0,0,0,1,0,0,0,3,0,0,3,0,0,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,3,3,3,3,3,3,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,0,0,3,3,0,0,3,0,1,0,0,0,0],
    [3,3,3,3,1,3,3,0,3,3,3,3,0,3,3,1,3,3,3,3],
    [0,0,0,0,1,0,3,0,0,0,0,0,0,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,3,3,3,3,3,3,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,0,0,0,0,0,0,3,0,1,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,0],
    [0,1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,1,0],
    [0,2,1,0,1,1,1,1,1,3,3,1,1,1,1,1,0,1,2,0],
    [0,0,1,0,1,0,1,0,0,0,0,0,0,1,0,1,0,1,0,0],
    [0,1,1,1,1,0,1,1,1,1,1,1,1,1,0,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ];

  const MAZE_POOL = [BASE_MAZE, MAZE_1, MAZE_2];

  // ── State ─────────────────────────────────────────────────────────────────
  let maze=[], score=0, level=1, lives=3, powerTimer=0, running=false, paused=false, gameOver=false;
  let best = ArcadeSync.getHighScore(GAME_ID);
  let raf=null, lastTime=0;
  let pelletsLeft=0;
  let deathTimer=0;

  const PLAYER_START_X = 10, PLAYER_START_Y = 16;
  const BASE_PLAYER_SPEED = 5.5;
  let player = { x:PLAYER_START_X, y:PLAYER_START_Y, dx:0, dy:0, ndx:1, ndy:0,
                 px:0, py:0, speed:BASE_PLAYER_SPEED, moving:false };
  const PSIZE=13;
  const POWER_FLASH_FREQ      = 4;
  const POWER_FLASH_THRESHOLD = 2;
  const DEATH_FREEZE_S        = 1.2;
  const PLAYER_SPEED_PER_LEVEL = 0.04;
  const GHOST_SPEED_PER_LEVEL  = 0.08;
  let mouthAngle=0, mouthDir=1;

  const ENEMY_COLORS = ['#ff4fd1','#3fb950','#bc8cff','#2ec5ff'];
  let enemies = [];
  const ESPEED = 4.0;

  function buildMaze() {
    const src = MAZE_POOL[(level - 1) % MAZE_POOL.length];
    maze = src.map(row => [...row]);
    pelletsLeft = 0;
    maze.forEach(row => row.forEach(v => { if(v===1||v===2) pelletsLeft++; }));
  }

  function spawnEnemies() {
    enemies = [];
    const count = Math.min(4, 2 + Math.floor((level-1)/2));
    const starts = [{x:9,y:9},{x:10,y:9},{x:9,y:10},{x:10,y:10}];
    for (let i=0;i<count;i++) {
      enemies.push({
        x: starts[i].x, y: starts[i].y,
        px: starts[i].x*CELL+CELL/2, py: starts[i].y*CELL+CELL/2,
        dx: i%2?1:-1, dy:0,
        color: ENEMY_COLORS[i],
        scared: false, scaredTimer:0,
        respawnTimer: 0,
        dead: false,
      });
    }
  }

  function isWall(cx,cy) {
    if (cx<0||cy<0||cx>=COLS||cy>=ROWS) return true;
    return maze[cy][cx]===0;
  }

  function spawnPlayer() {
    player={x:PLAYER_START_X,y:PLAYER_START_Y,dx:0,dy:0,ndx:1,ndy:0,
            px:tileCenter(PLAYER_START_X),py:tileCenter(PLAYER_START_Y),
            speed:BASE_PLAYER_SPEED,moving:false};
  }

  function updateHud() {
    scoreEl.textContent=score; bestEl.textContent=best;
    levelEl.textContent=level||'—';
    livesEl.textContent=lives;
  }

  function tileCenter(t) { return t*CELL + CELL/2; }

  function moveEntity(e, speed, dt) {
    const centX = tileCenter(e.x), centY = tileCenter(e.y);
    const distX  = Math.abs(e.px - centX), distY = Math.abs(e.py - centY);
    const atCent = distX < 2 && distY < 2;

    if (atCent) {
      e.px = centX; e.py = centY;
      if ((e.ndx||e.ndy) && !isWall(e.x+e.ndx, e.y+e.ndy)) {
        e.dx=e.ndx; e.dy=e.ndy;
      }
      if (isWall(e.x+e.dx, e.y+e.dy)) { e.dx=0; e.dy=0; }
    }

    e.px += e.dx * speed * CELL * dt;
    e.py += e.dy * speed * CELL * dt;

    const newTX = Math.floor(e.px/CELL);
    const newTY = Math.floor(e.py/CELL);
    if (newTX !== e.x || newTY !== e.y) {
      e.x = Math.max(0,Math.min(COLS-1,newTX));
      e.y = Math.max(0,Math.min(ROWS-1,newTY));
    }

    if (e.px < 0) { e.px = W; e.x = COLS-1; }
    if (e.px > W) { e.px = 0; e.x = 0; }
  }

  function enemyAI(e, dt) {
    if (e.dead) {
      e.respawnTimer -= dt;
      if (e.respawnTimer <= 0) {
        e.dead=false; e.scared=false; e.x=9; e.y=9;
        e.px=tileCenter(9); e.py=tileCenter(9); e.dx=1; e.dy=0;
      }
      return;
    }
    const centX=tileCenter(e.x), centY=tileCenter(e.y);
    const atCent = Math.abs(e.px-centX)<3 && Math.abs(e.py-centY)<3;
    if (atCent) {
      const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
      const valid = dirs.filter(d => !isWall(e.x+d.dx,e.y+d.dy) && !(d.dx===-e.dx && d.dy===-e.dy));
      if (valid.length) {
        let chosen;
        if (e.scared) {
          chosen = valid.reduce((best,d) => {
            const nx=e.x+d.dx, ny=e.y+d.dy;
            const dist=(nx-player.x)**2+(ny-player.y)**2;
            return dist>((e.x+best.dx-player.x)**2+(e.y+best.dy-player.y)**2)?d:best;
          }, valid[0]);
        } else {
          if (Math.random()<0.6) {
            chosen = valid.reduce((best,d) => {
              const nx=e.x+d.dx, ny=e.y+d.dy;
              const dist=(nx-player.x)**2+(ny-player.y)**2;
              return dist<((e.x+best.dx-player.x)**2+(e.y+best.dy-player.y)**2)?d:best;
            }, valid[0]);
          } else {
            chosen = valid[Math.floor(Math.random()*valid.length)];
          }
        }
        e.ndx=chosen.dx; e.ndy=chosen.dy;
      }
    }
    const spd = e.scared ? ESPEED*0.6 : ESPEED*(1+level*GHOST_SPEED_PER_LEVEL);
    moveEntity(e, spd, dt);
  }

  function update(dt) {
    if (!running||paused||gameOver) return;

    if (deathTimer > 0) {
      deathTimer -= dt;
      return;
    }

    mouthAngle += mouthDir * 4 * dt;
    if (mouthAngle>0.4) mouthDir=-1;
    if (mouthAngle<0.02) mouthDir=1;

    if (powerTimer>0) {
      powerTimer-=dt;
      if(powerTimer<=0) { powerTimer=0; enemies.forEach(e=>e.scared=false); }
    }

    moveEntity(player, player.speed*(1+level*PLAYER_SPEED_PER_LEVEL), dt);

    const tx=Math.round((player.px-CELL/2)/CELL);
    const ty=Math.round((player.py-CELL/2)/CELL);
    if (tx>=0&&tx<COLS&&ty>=0&&ty<ROWS) {
      const t=maze[ty][tx];
      if (t===1) {
        maze[ty][tx]=3; score+=10; pelletsLeft--;
        ArcadeSync.setHighScore(GAME_ID,score); best=ArcadeSync.getHighScore(GAME_ID);
        updateHud();
        rollHiddenBonus({score,streak:0,game:GAME_ID})
          .then(b=>{if(b){score+=b.rewards?.arcade_points||0;ArcadeSync.setHighScore(GAME_ID,score);best=ArcadeSync.getHighScore(GAME_ID);updateHud();showBonusPopup(b);}})
          .catch(()=>{});
      } else if (t===2) {
        maze[ty][tx]=3; score+=50; pelletsLeft--;
        powerTimer=8; enemies.forEach(e=>{if(!e.dead){e.scared=true;e.scaredTimer=8;}});
        ArcadeSync.setHighScore(GAME_ID,score); best=ArcadeSync.getHighScore(GAME_ID);
        updateHud();
      }
    }

    if (pelletsLeft<=0) {
      level++; levelEl.textContent=level;
      buildMaze(); spawnEnemies(); powerTimer=0;
      spawnPlayer(); player.ndx=1; player.ndy=0;
      return;
    }

    enemies.forEach(e=>enemyAI(e,dt));

    enemies.forEach(e=>{
      if (e.dead) return;
      const dx=e.px-(player.px), dy=e.py-(player.py);
      if (Math.sqrt(dx*dx+dy*dy)<PSIZE+8) {
        if (e.scared) {
          e.dead=true; e.respawnTimer=4;
          const pts=200*level;
          score+=pts; ArcadeSync.setHighScore(GAME_ID,score); best=ArcadeSync.getHighScore(GAME_ID); updateHud();
        } else {
          onPlayerDeath();
        }
      }
    });
  }

  function onPlayerDeath() {
    lives--;
    updateHud();
    if (lives <= 0) {
      onGameOver();
    } else {
      powerTimer=0; enemies.forEach(e=>e.scared=false);
      spawnPlayer(); player.ndx=1; player.ndy=0;
      deathTimer=DEATH_FREEZE_S;
    }
  }

  function draw() {
    ctx.fillStyle='#090c16'; ctx.fillRect(0,0,W,H);

    for (let r=0;r<ROWS;r++) {
      for (let c=0;c<COLS;c++) {
        const t = running||gameOver ? maze[r][c] : MAZE_POOL[(level-1) % MAZE_POOL.length][r][c];
        const x=c*CELL, y=r*CELL;
        if (t===0) {
          ctx.fillStyle='#1a2035';
          ctx.fillRect(x,y,CELL,CELL);
          ctx.strokeStyle='#2ec5ff22';
          ctx.lineWidth=1;
          ctx.strokeRect(x+.5,y+.5,CELL-1,CELL-1);
        } else if (t===1) {
          ctx.fillStyle='#f7c948';
          ctx.beginPath(); ctx.arc(x+CELL/2,y+CELL/2,3,0,Math.PI*2); ctx.fill();
        } else if (t===2) {
          ctx.fillStyle='#ff4fd1';
          ctx.beginPath(); ctx.arc(x+CELL/2,y+CELL/2,7,0,Math.PI*2); ctx.fill();
        }
      }
    }

    if (!running && !gameOver) {
      ctx.fillStyle='#f7c948'; ctx.font='bold 26px system-ui'; ctx.textAlign='center';
      ctx.fillText('Press Start',W/2,H/2); return;
    }
    if (paused) {
      ctx.fillStyle='#f7c948'; ctx.font='bold 30px system-ui'; ctx.textAlign='center';
      ctx.fillText('PAUSED',W/2,H/2);
    }
    if (gameOver) {
      ctx.fillStyle='#ff4fd1'; ctx.font='bold 30px system-ui'; ctx.textAlign='center';
      ctx.fillText('GAME OVER',W/2,H/2-18);
      ctx.fillStyle='#f7c948'; ctx.font='bold 18px system-ui';
      ctx.fillText('Score: '+score,W/2,H/2+16);
      ctx.fillStyle='#8b949e'; ctx.font='14px system-ui';
      ctx.fillText('Press Start to play again',W/2,H/2+46);
      return;
    }

    enemies.forEach(e=>{
      if(e.dead) return;
      ctx.fillStyle=e.scared?(powerTimer<2&&Math.floor(powerTimer*4)%2?'#fff':'#2ec5ff'):e.color;
      ctx.beginPath();
      ctx.arc(e.px,e.py,10,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#090c16';
      ctx.beginPath(); ctx.arc(e.px-3,e.py-2,2.5,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(e.px+3,e.py-2,2.5,0,Math.PI*2); ctx.fill();
    });

    const powerFlash = powerTimer > 0 && powerTimer < POWER_FLASH_THRESHOLD && Math.floor(powerTimer * POWER_FLASH_FREQ) % 2;
    const playerColor = powerTimer > 0 ? (powerFlash ? '#fff' : '#b3ffff') : '#ffe144';
    const glowColor   = powerTimer > 0 ? '#2ec5ff' : '#ffe144';
    ctx.shadowBlur  = powerTimer > 0 ? 18 : 10;
    ctx.shadowColor = glowColor;
    const ma=mouthAngle*Math.PI;
    let facing;
    if      (player.dx === 1)  facing = 0;
    else if (player.dx === -1) facing = Math.PI;
    else if (player.dy === 1)  facing = Math.PI / 2;
    else if (player.dy === -1) facing = 3 * Math.PI / 2;
    else                       facing = 0;
    ctx.beginPath();
    ctx.moveTo(player.px, player.py);
    ctx.arc(player.px, player.py, PSIZE, facing+ma, facing+2*Math.PI-ma);
    ctx.closePath();
    ctx.fillStyle = playerColor;
    ctx.fill();
    ctx.strokeStyle = '#090c16';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.shadowBlur  = 0;
  }

  function loop(ts) {
    const dt=Math.min((ts-lastTime)/1000,0.05); lastTime=ts;
    update(dt); draw();
    raf=requestAnimationFrame(loop);
  }

  async function onGameOver() {
    running=false; gameOver=true;
    ArcadeSync.setHighScore(GAME_ID,score); best=ArcadeSync.getHighScore(GAME_ID); updateHud();
    try { await submitScore(ArcadeSync.getPlayer(),score,GAME_ID); } catch(e){}
    draw();
    if (window.showGameOverModal) window.showGameOverModal(score);
  }

  function resetGame() {
    score=0; level=1; lives=3; powerTimer=0; running=false; paused=false; gameOver=false;
    deathTimer=0;
    spawnPlayer();
    buildMaze(); spawnEnemies(); updateHud(); draw();
  }

  // ── Key handler (named so it can be removed in destroy) ───────────────────
  function onKeyDown(e) {
    if(!running||paused) return;
    if(e.key==='ArrowLeft'||e.key==='a')  { player.ndx=-1;player.ndy=0; e.preventDefault(); }
    if(e.key==='ArrowRight'||e.key==='d') { player.ndx=1; player.ndy=0; e.preventDefault(); }
    if(e.key==='ArrowUp'||e.key==='w')    { player.ndx=0; player.ndy=-1; e.preventDefault(); }
    if(e.key==='ArrowDown'||e.key==='s')  { player.ndx=0; player.ndy=1; e.preventDefault(); }
  }

  // ── Lifecycle implementation ──────────────────────────────────────────────

  function init() {
    best = ArcadeSync.getHighScore(GAME_ID);
    spawnPlayer();
    buildMaze(); spawnEnemies(); updateHud(); draw();

    document.addEventListener('keydown', onKeyDown);

    document.getElementById('startBtn').onclick = () => {
      resetGame(); running=true; gameOver=false; paused=false;
      player.ndx=1; player.ndy=0;
      lastTime=performance.now();
      if(raf) cancelAnimationFrame(raf);
      raf=requestAnimationFrame(loop);
    };
    document.getElementById('pauseBtn').onclick = () => { if(running) paused=!paused; };
    document.getElementById('resetBtn').onclick = () => {
      if(raf) cancelAnimationFrame(raf);
      resetGame(); raf=requestAnimationFrame(draw);
    };
  }

  function start() {
    resetGame(); running=true; gameOver=false; paused=false;
    player.ndx=1; player.ndy=0;
    lastTime=performance.now();
    if(raf) cancelAnimationFrame(raf);
    raf=requestAnimationFrame(loop);
  }

  function pause() {
    if(running) paused=true;
  }

  function resume() {
    if(running && paused) paused=false;
  }

  function reset() {
    if(raf) cancelAnimationFrame(raf);
    resetGame(); raf=requestAnimationFrame(draw);
  }

  function destroy() {
    if(raf) cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKeyDown);
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    if(startBtn) startBtn.onclick = null;
    if(pauseBtn) pauseBtn.onclick = null;
    if(resetBtn) resetBtn.onclick = null;
  }

  function getScore() { return score; }

  // ── Public lifecycle object ───────────────────────────────────────────────

  return { init, start, pause, resume, reset, destroy, getScore };
}
