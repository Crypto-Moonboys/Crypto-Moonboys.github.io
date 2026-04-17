/**
 * bootstrap.js — Breakout Bullrun game module
 *
 * Contains all Breakout Bullrun game logic.  Exports bootstrapBreakout(), which is
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
import { BREAKOUT_CONFIG }                 from './config.js';
import { GameRegistry }                    from '/js/arcade/core/game-registry.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';

// Register in the central registry when this module is first imported.
GameRegistry.register(BREAKOUT_CONFIG.id, {
  label:     BREAKOUT_CONFIG.label,
  bootstrap: bootstrapBreakout,
});

/**
 * Bootstrap the Breakout Bullrun game.
 *
 * @param {Element} root - The .game-card element (unused directly; DOM IDs are unique).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapBreakout(root) {
  const GAME_ID='breakout';
  const canvas=document.getElementById('brkCanvas');
  const ctx=canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;

  const scoreEl=document.getElementById('score');
  const bestEl=document.getElementById('best');
  const levelEl=document.getElementById('level');
  const comboEl=document.getElementById('combo');

  let score=0, level=1, combo=1, comboTimer=0, running=false, paused=false, gameOver=false;
  let best=ArcadeSync.getHighScore(GAME_ID);
  let raf=null, lastTime=0;

  const B_COLS=10, B_ROWS=6, B_W=48, B_H=18, B_PAD=4;
  const B_OFF_X=(W-(B_COLS*(B_W+B_PAD)-B_PAD))/2;
  const B_OFF_Y=50;

  const ROW_CONFIG=[
    {value:50, color:'#ff4fd1', hits:3},
    {value:40, color:'#bc8cff', hits:2},
    {value:30, color:'#2ec5ff', hits:2},
    {value:20, color:'#3fb950', hits:1},
    {value:15, color:'#f7c948', hits:1},
    {value:10, color:'#8b949e', hits:1},
  ];

  const PAD_H=12, PAD_BASE_W=88;
  let paddle={x:W/2,w:PAD_BASE_W,speed:460};

  const BALL_R=7;
  let ball, launched;
  const BASE_BALL_SPD=320;

  let bricks=[];
  let drops=[];

  const keys={};

  function playGameSound(id, options) {
    if (isMuted()) return null;
    return playSound(id, options);
  }

  function onKeyDown(e) {
    keys[e.key]=true;
    if(e.key===' '&&running&&!paused){e.preventDefault();if(!launched)launchBall();}
    if(['ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
  }
  function onKeyUp(e) { keys[e.key]=false; }

  function buildBricks() {
    bricks=[];
    for(let r=0;r<B_ROWS;r++) {
      const cfg=ROW_CONFIG[r];
      for(let c=0;c<B_COLS;c++){
        bricks.push({
          x:B_OFF_X+c*(B_W+B_PAD), y:B_OFF_Y+r*(B_H+B_PAD),
          w:B_W, h:B_H, alive:true,
          value:cfg.value*(level), color:cfg.color, hits:cfg.hits, maxHits:cfg.hits,
        });
      }
    }
  }

  function resetBall() {
    ball={x:W/2,y:H-60,vx:0,vy:0};
    launched=false;
    paddle.x=W/2;
  }

  function launchBall() {
    if(launched) return;
    const spd=BASE_BALL_SPD+(level-1)*20;
    ball.vx=(Math.random()*0.6+0.7)*spd*(Math.random()<0.5?1:-1);
    ball.vy=-Math.sqrt(spd*spd-ball.vx*ball.vx);
    launched=true;
    playGameSound('breakout-launch');
  }

  function resetGame() {
    score=0;level=1;combo=1;comboTimer=0;running=false;paused=false;gameOver=false;
    drops=[];
    buildBricks(); resetBall(); updateHud(); draw();
  }

  function updateHud() {
    scoreEl.textContent=score; bestEl.textContent=best;
    levelEl.textContent=level||'—'; comboEl.textContent='×'+combo;
  }

  function update(dt) {
    if(!running||paused||gameOver) return;

    if(comboTimer>0){ comboTimer-=dt; if(comboTimer<=0){combo=1;comboEl.textContent='×1';} }

    if(keys['ArrowLeft']||keys['a']) paddle.x-=paddle.speed*dt;
    if(keys['ArrowRight']||keys['d']) paddle.x+=paddle.speed*dt;
    paddle.x=Math.max(paddle.w/2,Math.min(W-paddle.w/2,paddle.x));

    if(!launched){
      ball.x=paddle.x; ball.y=H-50;
      return;
    }

    ball.x+=ball.vx*dt;
    ball.y+=ball.vy*dt;

    if(ball.x-BALL_R<0){ball.x=BALL_R;ball.vx=Math.abs(ball.vx);}
    if(ball.x+BALL_R>W){ball.x=W-BALL_R;ball.vx=-Math.abs(ball.vx);}
    if(ball.y-BALL_R<0){ball.y=BALL_R;ball.vy=Math.abs(ball.vy);}

    const py=H-40;
    if(ball.vy>0 && ball.y+BALL_R>=py && ball.y-BALL_R<=py+PAD_H
       && ball.x>=paddle.x-paddle.w/2-BALL_R && ball.x<=paddle.x+paddle.w/2+BALL_R){
      ball.vy=-Math.abs(ball.vy);
      ball.y=py-BALL_R;
      const off=(ball.x-paddle.x)/(paddle.w/2);
      ball.vx=off*Math.abs(ball.vy)*1.1;
      const spd=Math.hypot(ball.vx,ball.vy);
      const maxSpd=BASE_BALL_SPD+(level-1)*20+180;
      if(spd>maxSpd){ const s=maxSpd/spd; ball.vx*=s; ball.vy*=s; }
    }

    if(ball.y>H+20){onGameOver();return;}

    for(const b of bricks){
      if(!b.alive) continue;
      if(ball.x+BALL_R>b.x&&ball.x-BALL_R<b.x+b.w&&ball.y+BALL_R>b.y&&ball.y-BALL_R<b.y+b.h){
        b.hits--;
        if(b.hits<=0) b.alive=false;

        const overlapL=ball.x+BALL_R-b.x;
        const overlapR=b.x+b.w-(ball.x-BALL_R);
        const overlapT=ball.y+BALL_R-b.y;
        const overlapB=b.y+b.h-(ball.y-BALL_R);
        const minH=Math.min(overlapL,overlapR);
        const minV=Math.min(overlapT,overlapB);
        if(minH<minV) ball.vx=-ball.vx;
        else ball.vy=-ball.vy;

        if(b.alive===false){
          playGameSound('breakout-brick-break');
          combo++;comboTimer=3;comboEl.textContent='×'+combo;
          const pts=b.value*combo;
          score+=pts; ArcadeSync.setHighScore(GAME_ID,score); best=ArcadeSync.getHighScore(GAME_ID); updateHud();
          if(Math.random()<0.15) drops.push({x:b.x+b.w/2,y:b.y,vy:120,type:Math.random()<0.5?'wide':'bonus'});
          rollHiddenBonus({score,streak:combo,game:GAME_ID})
            .then(bon=>{if(bon){score+=bon.rewards?.arcade_points||0;ArcadeSync.setHighScore(GAME_ID,score);best=ArcadeSync.getHighScore(GAME_ID);updateHud();showBonusPopup(bon);}})
            .catch(()=>{});
        }
        break;
      }
    }

    if(bricks.every(b=>!b.alive)){
      level++; buildBricks(); resetBall(); combo=1; comboTimer=0; levelEl.textContent=level;
      return;
    }

    drops.forEach(d=>d.y+=d.vy*dt);
    const py2=H-40;
    drops=drops.filter(d=>{
      if(d.y>H) return false;
      if(d.y+10>=py2&&d.y-10<=py2+PAD_H&&d.x>=paddle.x-paddle.w/2&&d.x<=paddle.x+paddle.w/2){
        if(d.type==='wide') paddle.w=Math.min(PAD_BASE_W*1.8,paddle.w+30);
        else { score+=300*level; ArcadeSync.setHighScore(GAME_ID,score); best=ArcadeSync.getHighScore(GAME_ID); updateHud(); }
        return false;
      }
      return true;
    });
    if(paddle.w>PAD_BASE_W) paddle.w=Math.max(PAD_BASE_W,paddle.w-12*dt);
  }

  function draw() {
    ctx.fillStyle='#090c16'; ctx.fillRect(0,0,W,H);

    if(!running&&!gameOver){
      ctx.fillStyle='#f7ab1a'; ctx.font='bold 28px system-ui'; ctx.textAlign='center';
      ctx.fillText('Press Start',W/2,H/2); return;
    }
    if(paused){
      ctx.fillStyle='#f7c948'; ctx.font='bold 30px system-ui'; ctx.textAlign='center';
      ctx.fillText('PAUSED',W/2,H/2);
    }
    if(gameOver){
      ctx.fillStyle='#ff4fd1'; ctx.font='bold 30px system-ui'; ctx.textAlign='center';
      ctx.fillText('GAME OVER',W/2,H/2-20);
      ctx.fillStyle='#f7c948'; ctx.font='bold 20px system-ui';
      ctx.fillText('Score: '+score,W/2,H/2+18);
      ctx.fillStyle='#8b949e'; ctx.font='14px system-ui';
      ctx.fillText('Press Start to play again',W/2,H/2+50); return;
    }

    bricks.forEach(b=>{
      if(!b.alive) return;
      const alpha=0.55+0.45*(b.hits/b.maxHits);
      ctx.globalAlpha=alpha;
      ctx.fillStyle=b.color;
      ctx.fillRect(b.x+1,b.y+1,b.w-2,b.h-2);
      ctx.globalAlpha=1;
      ctx.strokeStyle=b.color;
      ctx.lineWidth=1;
      ctx.strokeRect(b.x+1,b.y+1,b.w-2,b.h-2);
    });

    drops.forEach(d=>{
      ctx.fillStyle=d.type==='wide'?'#3fb950':'#f7c948';
      ctx.fillRect(d.x-8,d.y-5,16,10);
      ctx.fillStyle='#090c16';
      ctx.font='bold 7px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(d.type==='wide'?'W':'$',d.x,d.y);
      ctx.textBaseline='alphabetic';
    });

    const py=H-40;
    const px=paddle.x-paddle.w/2;
    ctx.fillStyle='#f7ab1a';
    ctx.beginPath();
    ctx.roundRect?ctx.roundRect(px,py,paddle.w,PAD_H,6):ctx.fillRect(px,py,paddle.w,PAD_H);
    ctx.fill();

    ctx.fillStyle='#2ec5ff';
    ctx.beginPath(); ctx.arc(ball.x,ball.y,BALL_R,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#dff8ff';
    ctx.beginPath(); ctx.arc(ball.x-2,ball.y-2,2.5,0,Math.PI*2); ctx.fill();
  }

  function loop(ts){
    const dt=Math.min((ts-lastTime)/1000,0.05); lastTime=ts;
    update(dt); draw();
    raf=requestAnimationFrame(loop);
  }

  async function onGameOver(){
    running=false;gameOver=true;
    stopAllSounds();
    ArcadeSync.setHighScore(GAME_ID,score); best=ArcadeSync.getHighScore(GAME_ID); updateHud();
    try{await submitScore(ArcadeSync.getPlayer(),score,GAME_ID);}catch(e){}
    draw();
    if(window.showGameOverModal) window.showGameOverModal(score);
  }

  // ── Lifecycle implementation ──────────────────────────────────────────────

  function init() {
    best=ArcadeSync.getHighScore(GAME_ID);
    buildBricks(); resetBall(); updateHud(); draw();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    document.getElementById('startBtn').onclick=()=>{
      resetGame(); running=true; launched=false;
      lastTime=performance.now();
      if(raf) cancelAnimationFrame(raf);
      raf=requestAnimationFrame(loop);
    };
    document.getElementById('pauseBtn').onclick=()=>{
      if(running) {
        paused=!paused;
        if (paused) stopAllSounds();
      }
    };
    document.getElementById('resetBtn').onclick=()=>{
      if(raf) cancelAnimationFrame(raf);
      stopAllSounds();
      resetGame(); raf=requestAnimationFrame(()=>draw());
    };
  }

  function start() {
    resetGame(); running=true; launched=false;
    lastTime=performance.now();
    if(raf) cancelAnimationFrame(raf);
    raf=requestAnimationFrame(loop);
  }

  function pause() {
    if(running) {
      paused=true;
      stopAllSounds();
    }
  }

  function resume() {
    if(running && paused) paused=false;
  }

  function reset() {
    if(raf) cancelAnimationFrame(raf);
    stopAllSounds();
    resetGame(); raf=requestAnimationFrame(()=>draw());
  }

  function destroy() {
    if(raf) cancelAnimationFrame(raf);
    stopAllSounds();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);
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
