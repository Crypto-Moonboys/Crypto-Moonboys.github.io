/**
 * bootstrap.js — Tetris Block Topia game module
 *
 * Contains all Tetris Block Topia game logic.  Exports bootstrapTetris(), which is
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
import { TETRIS_CONFIG }                   from './config.js';
import { GameRegistry }                    from '/js/arcade/core/game-registry.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';

// Register in the central registry when this module is first imported.
GameRegistry.register(TETRIS_CONFIG.id, {
  label:     TETRIS_CONFIG.label,
  bootstrap: bootstrapTetris,
});

/**
 * Bootstrap the Tetris Block Topia game.
 *
 * @param {Element} root - The .game-card element (unused directly; DOM IDs are unique).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapTetris(root) {
  const GAME_ID='tetris';
  const COLS=10, ROWS=20, CELL=30;
  const canvas=document.getElementById('tetCanvas');
  canvas.width=COLS*CELL; canvas.height=ROWS*CELL;
  const ctx=canvas.getContext('2d');
  const nc=document.getElementById('nextCanvas');
  const nctx=nc.getContext('2d');

  const scoreEl=document.getElementById('score');
  const bestEl=document.getElementById('best');
  const levelEl=document.getElementById('level');
  const linesEl=document.getElementById('lines');

  let score=0, level=1, lines=0, running=false, paused=false, gameOver=false;
  let best=ArcadeSync.getHighScore(GAME_ID);
  let raf=null, lastTime=0, dropTimer=0;

  const SHAPES = {
    I:{ color:'#2ec5ff', cells:[[[-1,0],[0,0],[1,0],[2,0]],[[ 0,-1],[0,0],[0,1],[0,2]],[[-1,0],[0,0],[1,0],[2,0]],[[0,-1],[0,0],[0,1],[0,2]]] },
    O:{ color:'#f7c948', cells:[[[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[1,0],[1,1]]] },
    T:{ color:'#bc8cff', cells:[[[0,0],[0,1],[0,2],[1,1]],[[0,1],[1,1],[2,1],[1,0]],[[1,0],[1,1],[1,2],[0,1]],[[0,0],[1,0],[2,0],[1,1]]] },
    S:{ color:'#3fb950', cells:[[[0,1],[0,2],[1,0],[1,1]],[[0,0],[1,0],[1,1],[2,1]],[[0,1],[0,2],[1,0],[1,1]],[[0,0],[1,0],[1,1],[2,1]]] },
    Z:{ color:'#ff4fd1', cells:[[[0,0],[0,1],[1,1],[1,2]],[[0,1],[1,0],[1,1],[2,0]],[[0,0],[0,1],[1,1],[1,2]],[[0,1],[1,0],[1,1],[2,0]]] },
    J:{ color:'#f7ab1a', cells:[[[0,0],[1,0],[1,1],[1,2]],[[0,0],[0,1],[1,0],[2,0]],[[0,0],[0,1],[0,2],[1,2]],[[0,1],[1,1],[2,0],[2,1]]] },
    L:{ color:'#ff6b35', cells:[[[0,2],[1,0],[1,1],[1,2]],[[0,0],[1,0],[2,0],[2,1]],[[0,0],[0,1],[0,2],[1,0]],[[0,0],[0,1],[1,1],[2,1]]] },
  };
  const PIECE_KEYS=Object.keys(SHAPES);

  let board=[];
  let current=null, next=null;
  let dasTimer=0, dasDir=0, dasActive=false;
  const DAS_DELAY=0.17, DAS_RATE=0.05;
  let dasRateTimer=0;
  let dropInterval=1.0;

  const keys={};

  function playGameSound(id, options) {
    if (isMuted()) return null;
    return playSound(id, options);
  }

  function onKeyDown(e) {
    if(!keys[e.key]){
      keys[e.key]=true;
      if(!running||paused) return;
      if(e.key==='ArrowLeft'||e.key==='a') { tryMove(0,-1); dasDir=-1; dasTimer=0; dasActive=false; dasRateTimer=0; e.preventDefault(); }
      if(e.key==='ArrowRight'||e.key==='d') { tryMove(0,1); dasDir=1; dasTimer=0; dasActive=false; dasRateTimer=0; e.preventDefault(); }
      if(e.key==='ArrowUp'||e.key==='w') { tryRotate(); e.preventDefault(); }
      if(e.key==='ArrowDown'||e.key==='s') { dropTimer=dropInterval; e.preventDefault(); }
      if(e.key===' ') { hardDrop(); e.preventDefault(); }
    }
    keys[e.key]=true;
  }
  function onKeyUp(e) {
    keys[e.key]=false;
    if(e.key==='ArrowLeft'||e.key==='a'||e.key==='ArrowRight'||e.key==='d') { dasDir=0; dasActive=false; }
  }

  function randPiece() {
    const k=PIECE_KEYS[Math.floor(Math.random()*PIECE_KEYS.length)];
    const s=SHAPES[k];
    return {key:k,rot:0,row:-1,col:Math.floor(COLS/2)-1,color:s.color,cells:s.cells,shape:s};
  }

  function cells(p,rot) { return p.shape.cells[rot??p.rot]; }

  function valid(p,dr,dc,newRot) {
    const r=p.rot+(newRot||0);
    const rot=(r+4)%4;
    return cells(p,rot).every(([cr,cc])=>{
      const nr=p.row+cr+dr, nc=p.col+cc+dc;
      return nc>=0&&nc<COLS&&nr<ROWS&&(nr<0||!board[nr][nc]);
    });
  }

  function tryMove(dr,dc) {
    if(!current) return;
    if(valid(current,dr,dc,0)){current.row+=dr;current.col+=dc; return true;}
    return false;
  }

  function tryRotate() {
    if(!current) return;
    for(const dc of [0,1,-1,2,-2]){
      if(valid(current,0,dc,1)){current.col+=dc;current.rot=(current.rot+1)%4;playGameSound('tetris-rotate');return;}
    }
  }

  function hardDrop() {
    if(!current) return;
    let dist=0;
    while(valid(current,1,0,0)){current.row++;dist++;}
    score+=dist*2; ArcadeSync.setHighScore(GAME_ID,score); best=ArcadeSync.getHighScore(GAME_ID); updateHud();
    playGameSound('tetris-hard-drop');
    lockPiece();
  }

  function lockPiece() {
    if(!current) return;
    cells(current).forEach(([r,c])=>{
      const nr=current.row+r, nc=current.col+c;
      if(nr>=0) board[nr][nc]=current.color;
    });
    clearLines();
    current=next; next=randPiece();
    current.row=-1; current.col=Math.floor(COLS/2)-1;
    dropTimer=0;
    if(!valid(current,1,0,0)&&!valid(current,0,0,0)){onGameOver();}
  }

  function clearLines() {
    let cleared=0;
    for(let r=ROWS-1;r>=0;r--){
      if(board[r].every(c=>c!==null)){
        board.splice(r,1);
        board.unshift(Array(COLS).fill(null));
        r++;cleared++;
      }
    }
    if(cleared){
      playGameSound('tetris-line-clear');
      const pts=[0,100,300,500,800][cleared]*level;
      score+=pts; lines+=cleared;
      level=Math.floor(lines/10)+1;
      dropInterval=Math.max(0.1,1.0-level*0.08);
      ArcadeSync.setHighScore(GAME_ID,score); best=ArcadeSync.getHighScore(GAME_ID);
      updateHud();
      rollHiddenBonus({score,streak:cleared,game:GAME_ID})
        .then(b=>{if(b){score+=b.rewards?.arcade_points||0;ArcadeSync.setHighScore(GAME_ID,score);best=ArcadeSync.getHighScore(GAME_ID);updateHud();showBonusPopup(b);}})
        .catch(()=>{});
    }
  }

  function resetGame(){
    score=0;level=1;lines=0;running=false;paused=false;gameOver=false;
    board=Array.from({length:ROWS},()=>Array(COLS).fill(null));
    current=randPiece(); next=randPiece();
    current.row=-1; current.col=Math.floor(COLS/2)-1;
    dropTimer=0; dropInterval=1.0;
    updateHud(); draw();
  }

  function updateHud(){
    scoreEl.textContent=score; bestEl.textContent=best;
    levelEl.textContent=level; linesEl.textContent=lines;
  }

  function ghostRow(){
    if(!current) return -1;
    let gr=current.row;
    while(true){
      const nxt={...current,row:gr+1};
      if(!valid(nxt,0,0,0)) break;
      gr++;
    }
    return gr;
  }

  function drawCell(c,r,color,alpha,dctx){
    dctx=dctx||ctx;
    dctx.globalAlpha=alpha??1;
    dctx.fillStyle=color;
    dctx.fillRect(c*CELL+1,r*CELL+1,CELL-2,CELL-2);
    dctx.globalAlpha=1;
    dctx.strokeStyle='rgba(255,255,255,.12)';
    dctx.lineWidth=1;
    dctx.strokeRect(c*CELL+1.5,r*CELL+1.5,CELL-3,CELL-3);
  }

  function draw(){
    ctx.fillStyle='#090c16'; ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.strokeStyle='rgba(188,140,255,0.04)'; ctx.lineWidth=1;
    for(let c=0;c<COLS;c++){ctx.beginPath();ctx.moveTo(c*CELL,0);ctx.lineTo(c*CELL,canvas.height);ctx.stroke();}
    for(let r=0;r<ROWS;r++){ctx.beginPath();ctx.moveTo(0,r*CELL);ctx.lineTo(canvas.width,r*CELL);ctx.stroke();}

    if(!running&&!gameOver){
      ctx.fillStyle='#bc8cff'; ctx.font='bold 18px system-ui'; ctx.textAlign='center';
      ctx.fillText('Press Start',canvas.width/2,canvas.height/2); return;
    }
    if(paused){
      ctx.fillStyle='#f7c948'; ctx.font='bold 24px system-ui'; ctx.textAlign='center';
      ctx.fillText('PAUSED',canvas.width/2,canvas.height/2);
    }
    if(gameOver){
      ctx.fillStyle='#ff4fd1'; ctx.font='bold 22px system-ui'; ctx.textAlign='center';
      ctx.fillText('GAME OVER',canvas.width/2,canvas.height/2-16);
      ctx.fillStyle='#f7c948'; ctx.font='bold 16px system-ui';
      ctx.fillText('Score: '+score,canvas.width/2,canvas.height/2+10);
      ctx.fillStyle='#8b949e'; ctx.font='13px system-ui';
      ctx.fillText('Press Start again',canvas.width/2,canvas.height/2+36); return;
    }

    board.forEach((row,r)=>row.forEach((c,col)=>{if(c) drawCell(col,r,c,1);}));

    if(current){
      const gr=ghostRow();
      cells(current).forEach(([r,c])=>drawCell(current.col+c,gr+r,current.color,0.2));
    }

    if(current){
      cells(current).forEach(([r,c])=>drawCell(current.col+c,current.row+r,current.color,1));
    }

    nctx.fillStyle='#090c16'; nctx.fillRect(0,0,nc.width,nc.height);
    if(next){
      const pc=cells(next,0);
      const minR=Math.min(...pc.map(([r])=>r)), maxR=Math.max(...pc.map(([r])=>r));
      const minC=Math.min(...pc.map(([,c])=>c)), maxC=Math.max(...pc.map(([,c])=>c));
      const offR=(4-(maxR-minR+1))/2-minR, offC=(4-(maxC-minC+1))/2-minC;
      pc.forEach(([r,c])=>{
        nctx.fillStyle=next.color;
        nctx.fillRect((offC+c)*20+1,(offR+r)*20+1,18,18);
      });
    }
  }

  function update(dt){
    if(!running||paused||gameOver) return;

    if(dasDir!==0){
      dasTimer+=dt;
      if(dasTimer>=DAS_DELAY){
        dasActive=true;
        dasRateTimer+=dt;
        if(dasRateTimer>=DAS_RATE){
          dasRateTimer=0;
          tryMove(0,dasDir);
        }
      }
    }

    let interval=dropInterval;
    if(keys['ArrowDown']||keys['s']) interval=Math.min(0.05,interval);

    dropTimer+=dt;
    if(dropTimer>=interval){
      dropTimer=0;
      if(!tryMove(1,0)) lockPiece();
    }
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
    board=Array.from({length:ROWS},()=>Array(COLS).fill(null));
    current=randPiece(); next=randPiece();
    current.row=-1; current.col=Math.floor(COLS/2)-1;
    dropTimer=0; dropInterval=1.0;
    updateHud(); draw();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    document.getElementById('startBtn').onclick=()=>{
      resetGame(); running=true;
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
    resetGame(); running=true;
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
