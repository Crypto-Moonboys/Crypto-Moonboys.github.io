/**
 * bootstrap.js — Asteroid Fork game module
 *
 * Contains all Asteroid Fork game logic.  Exports bootstrapAsteroidFork(), which is
 * the entry point called by game-shell.js via mountGame().
 *
 * Integrations preserved:
 *  - ArcadeSync   (local high-score persistence)
 *  - submitScore  (leaderboard-client.js remote submission)
 *  - window.showGameOverModal          (game-fullscreen.js)
 */

import { ArcadeSync }                      from '/js/arcade-sync.js';
import { submitScore }                     from '/js/leaderboard-client.js';
import { ASTEROID_FORK_CONFIG }            from './config.js';
import { GameRegistry }                    from '/js/arcade/core/game-registry.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';

// Register in the central registry when this module is first imported.
GameRegistry.register(ASTEROID_FORK_CONFIG.id, {
  label:     ASTEROID_FORK_CONFIG.label,
  bootstrap: bootstrapAsteroidFork,
});

/**
 * Bootstrap the Asteroid Fork game.
 *
 * @param {Element} root - The .game-card element (unused directly; DOM IDs are unique).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapAsteroidFork(root) {
  const GAME_ID = ASTEROID_FORK_CONFIG.id;
  const canvas  = document.getElementById('astCanvas');
  const ctx     = canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;

  const scoreEl = document.getElementById('score');
  const bestEl  = document.getElementById('best');
  const waveEl  = document.getElementById('wave');
  const livesEl = document.getElementById('lives');

  let score=0, lives=3, wave=0, running=false, paused=false, gameOver=false;
  let best=ArcadeSync.getHighScore(GAME_ID);
  let raf=null, lastTime=0;

  const keys={};

  function onKeyDown(e) {
    keys[e.key]=true;
    if(e.key===' '&&running&&!paused){e.preventDefault();tryShoot();}
    if(['ArrowLeft','ArrowRight','ArrowUp'].includes(e.key)) e.preventDefault();
  }
  function onKeyUp(e) { keys[e.key]=false; }

  // Ship
  let ship;
  const SHIP_VERTS=[{x:0,y:-18},{x:-11,y:12},{x:0,y:7},{x:11,y:12}];
  let invincible=0;
  let shootCooldown=0;
  let bullets=[];
  let asteroids=[];
  let particles=[];
  const scoreTexts=[];
  const hitFlashes=[];
  let shakeTime=0;
  let shakeIntensity=0;

  function playGameSound(id, options) {
    if (isMuted()) return null;
    return playSound(id, options);
  }

  function makeShip() {
    return {x:W/2,y:H/2,vx:0,vy:0,angle:0,thrusting:false};
  }

  function spawnAsteroids() {
    const count=3+wave*2;
    asteroids=[];
    for(let i=0;i<count;i++) {
      let x,y;
      do { x=Math.random()*W; y=Math.random()*H; }
      while(Math.hypot(x-W/2,y-H/2)<140);
      asteroids.push(makeAsteroid(x,y,3));
    }
  }

  function makeAsteroid(x,y,tier) {
    const spd=40+Math.random()*60+wave*5;
    const ang=Math.random()*Math.PI*2;
    const r=tier===3?38:tier===2?22:12;
    const verts=[];
    const sides=7+Math.floor(Math.random()*4);
    for(let i=0;i<sides;i++){
      const a=i/sides*Math.PI*2;
      const rr=r*(0.7+Math.random()*0.5);
      verts.push({x:Math.cos(a)*rr,y:Math.sin(a)*rr});
    }
    return {x,y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,r,tier,verts,angle:0,spin:(Math.random()-0.5)*1.2};
  }

  function tryShoot() {
    if(shootCooldown>0) return;
    const a=ship.angle;
    bullets.push({x:ship.x+Math.sin(a)*20,y:ship.y-Math.cos(a)*20,vx:Math.sin(a)*600,vy:-Math.cos(a)*600,life:1.1});
    shootCooldown=0.22;
    playGameSound('asteroid-fork-shoot');
  }

  function wrap(v,max){return((v%max)+max)%max;}

  function updateHud(){
    scoreEl.textContent=score; bestEl.textContent=best;
    waveEl.textContent=wave||'—'; livesEl.textContent=lives;
  }

  function triggerHudFx(el, cls, ms){
    if(!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(()=>el.classList.remove(cls),ms);
  }

  function setBestMaybe(){
    if(score>best){
      best=score;
      ArcadeSync.setHighScore(GAME_ID,best);
    }
  }

  function addScore(points,x,y,color='#f7c948'){
    if(!points) return;
    score+=points;
    setBestMaybe();
    updateHud();
    triggerHudFx(scoreEl,'pulse',180);
    if(typeof x==='number'&&typeof y==='number'){
      scoreTexts.push({x,y,text:`+${points}`,life:0.8,maxLife:0.8,color});
    }
  }

  function resetGame(){
    score=0;lives=3;wave=0;running=false;paused=false;gameOver=false;
    ship=makeShip();bullets=[];asteroids=[];particles=[];invincible=0;shootCooldown=0;
    scoreTexts.length=0; hitFlashes.length=0; shakeTime=0; shakeIntensity=0;
    updateHud();draw();
  }

  function spawnParticles(x,y,color,count){
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2, s=50+Math.random()*120;
      particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:0.5+Math.random()*0.5,color});
    }
  }

  function spawnHitFlash(x,y,r=16,life=0.12){
    hitFlashes.push({x,y,r,life,maxLife:life});
  }

  function triggerShake(intensity,duration){
    shakeIntensity=Math.max(shakeIntensity,intensity);
    shakeTime=Math.max(shakeTime,duration);
  }

  function updateEffects(dt){
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;p.vx*=0.97;p.vy*=0.97;});
    particles=particles.filter(p=>p.life>0);

    for(let i=scoreTexts.length-1;i>=0;i--){
      const t=scoreTexts[i];
      t.life-=dt;
      t.y-=32*dt;
      if(t.life<=0) scoreTexts.splice(i,1);
    }

    for(let i=hitFlashes.length-1;i>=0;i--){
      const f=hitFlashes[i];
      f.life-=dt;
      if(f.life<=0) hitFlashes.splice(i,1);
    }

    if(shakeTime>0){
      shakeTime-=dt;
      shakeIntensity*=0.9;
      if(shakeTime<=0){shakeTime=0;shakeIntensity=0;}
    }
  }

  function update(dt) {
    if(!running||paused||gameOver){updateEffects(dt);return;}

    if(keys['ArrowLeft']||keys['a'])  ship.angle-=3.2*dt;
    if(keys['ArrowRight']||keys['d']) ship.angle+=3.2*dt;
    if(keys['ArrowUp']||keys['w']) {
      ship.vx+=Math.sin(ship.angle)*350*dt;
      ship.vy-=Math.cos(ship.angle)*350*dt;
      ship.thrusting=true;
    } else {
      ship.thrusting=false;
    }
    const drag=0.98;
    ship.vx*=drag; ship.vy*=drag;
    ship.x=wrap(ship.x+ship.vx*dt,W);
    ship.y=wrap(ship.y+ship.vy*dt,H);

    if(invincible>0) invincible-=dt;
    if(shootCooldown>0) shootCooldown-=dt;

    bullets.forEach(b=>{b.x=wrap(b.x+b.vx*dt,W);b.y=wrap(b.y+b.vy*dt,H);b.life-=dt;});
    bullets=bullets.filter(b=>b.life>0);

    asteroids.forEach(a=>{
      a.x=wrap(a.x+a.vx*dt,W);
      a.y=wrap(a.y+a.vy*dt,H);
      a.angle+=a.spin*dt;
    });
    if(!asteroids.length){wave++;spawnAsteroids();waveEl.textContent=wave;return;}

    for(let bi=bullets.length-1;bi>=0;bi--){
      const b=bullets[bi];
      for(let ai=asteroids.length-1;ai>=0;ai--){
        const a=asteroids[ai];
        if(Math.hypot(b.x-a.x,b.y-a.y)<a.r){
          playGameSound('asteroid-fork-hit');
          spawnParticles(a.x,a.y,'#bc8cff',8);
          spawnHitFlash(a.x,a.y,a.r*0.7,0.1);
          bullets.splice(bi,1);
          const pts=a.tier===3?20:a.tier===2?50:100;
          addScore(pts*wave,a.x,a.y,'#f7c948');
          triggerShake(a.tier===3?4:a.tier===2?2.8:1.8,0.08);
          if(a.tier>1){
            const nt=a.tier-1;
            asteroids.push(makeAsteroid(a.x,a.y,nt));
            asteroids.push(makeAsteroid(a.x,a.y,nt));
          }
          asteroids.splice(ai,1);
          break;
        }
      }
    }

    if(invincible<=0){
      for(const a of asteroids){
        if(Math.hypot(ship.x-a.x,ship.y-a.y)<a.r+10){
          playGameSound('asteroid-fork-ship-hit');
          spawnParticles(ship.x,ship.y,'#ff4fd1',14);
          spawnHitFlash(ship.x,ship.y,24,0.14);
          triggerShake(7,0.22);
          lives--;
          triggerHudFx(livesEl,'flash',220);
          livesEl.textContent=lives;
          if(lives<=0){onGameOver();return;}
          ship=makeShip();
          invincible=3;
          break;
        }
      }
    }
    updateEffects(dt);
  }

  function transformedVerts(verts,x,y,angle){
    return verts.map(v=>({
      x:x+v.x*Math.cos(angle)-v.y*Math.sin(angle),
      y:y+v.x*Math.sin(angle)+v.y*Math.cos(angle),
    }));
  }

  function drawPoly(verts,color,lw=1.5){
    ctx.strokeStyle=color; ctx.lineWidth=lw;
    ctx.beginPath();
    verts.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));
    ctx.closePath(); ctx.stroke();
  }

  function draw() {
    const sx=shakeTime>0?(Math.random()-0.5)*shakeIntensity:0;
    const sy=shakeTime>0?(Math.random()-0.5)*shakeIntensity:0;
    ctx.save();
    ctx.translate(sx,sy);

    ctx.fillStyle='#090c16'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(255,255,255,.18)';
    for(let i=0;i<80;i++){
      const starX=(i*137+wave*7)%W, starY=(i*97+wave*13)%H;
      ctx.fillRect(starX,starY,1,1);
    }

    if(!running&&!gameOver){
      ctx.fillStyle='#bc8cff'; ctx.font='bold 28px system-ui'; ctx.textAlign='center';
      ctx.fillText('Press Start',W/2,H/2);
      ctx.restore();
      return;
    }
    if(paused){
      ctx.fillStyle='#f7c948'; ctx.font='bold 32px system-ui'; ctx.textAlign='center';
      ctx.fillText('PAUSED',W/2,H/2);
    }
    if(gameOver){
      ctx.fillStyle='#ff4fd1'; ctx.font='bold 32px system-ui'; ctx.textAlign='center';
      ctx.fillText('GAME OVER',W/2,H/2-20);
      ctx.fillStyle='#f7c948'; ctx.font='bold 20px system-ui';
      ctx.fillText('Score: '+score,W/2,H/2+16);
      ctx.fillStyle='#8b949e'; ctx.font='16px system-ui';
      ctx.fillText('Press Start to play again',W/2,H/2+50);
      ctx.restore();
      return;
    }

    asteroids.forEach(a=>{
      const verts=transformedVerts(a.verts,a.x,a.y,a.angle);
      drawPoly(verts,'#bc8cff',2);
    });

    ctx.fillStyle='#f7c948';
    bullets.forEach(b=>{
      ctx.beginPath(); ctx.arc(b.x,b.y,3,0,Math.PI*2); ctx.fill();
    });

    particles.forEach(p=>{
      ctx.globalAlpha=Math.max(0,p.life);
      ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,2,0,Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha=1;

    hitFlashes.forEach(f=>{
      const alpha=Math.max(0,f.life/f.maxLife);
      ctx.globalAlpha=alpha*0.5;
      ctx.fillStyle='#ffffff';
      ctx.beginPath();
      ctx.arc(f.x,f.y,f.r*(1+(1-alpha)*0.7),0,Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha=1;

    scoreTexts.forEach(t=>{
      ctx.globalAlpha=Math.max(0,t.life/t.maxLife);
      ctx.fillStyle=t.color;
      ctx.font='bold 18px system-ui';
      ctx.textAlign='center';
      ctx.fillText(t.text,t.x,t.y);
    });
    ctx.globalAlpha=1;

    if(invincible<=0||Math.floor(invincible*8)%2===0){
      const sv=transformedVerts(SHIP_VERTS,ship.x,ship.y,ship.angle);
      drawPoly(sv,'#2ec5ff',2);
      if(ship.thrusting){
        const thrust=[{x:0,y:7},{x:-5,y:18},{x:5,y:18}];
        const tv=transformedVerts(thrust,ship.x,ship.y,ship.angle);
        ctx.strokeStyle='#ff4fd1'; ctx.lineWidth=2;
        ctx.beginPath(); tv.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));
        ctx.closePath(); ctx.stroke();
      }
    }

    for(let i=0;i<lives;i++){
      const lx=20+i*26, ly=H-14;
      const lv=transformedVerts(SHIP_VERTS,lx,ly,0);
      drawPoly(lv,'#2ec5ff',1.5);
    }
    ctx.restore();
  }

  function loop(ts){
    const dt=Math.min((ts-lastTime)/1000,0.05); lastTime=ts;
    update(dt); draw();
    raf=requestAnimationFrame(loop);
  }

  async function onGameOver(){
    running=false;gameOver=true;
    stopAllSounds();
    setBestMaybe();
    updateHud();
    try{await submitScore(ArcadeSync.getPlayer(),score,GAME_ID);}catch(e){}
    draw();
    if(window.showGameOverModal) window.showGameOverModal(score);
  }

  // ── Lifecycle implementation ──────────────────────────────────────────────

  function init() {
    best=ArcadeSync.getHighScore(GAME_ID);
    ship=makeShip();
    updateHud(); draw();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    document.getElementById('startBtn').onclick=()=>{
      resetGame(); running=true; wave=1; spawnAsteroids(); waveEl.textContent=wave;
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
    resetGame(); running=true; wave=1; spawnAsteroids(); waveEl.textContent=wave;
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
