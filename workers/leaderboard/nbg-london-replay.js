// NBG London ranked-run verifier v1.
//
// This module runs in the Worker, not in the browser. It derives game XP from
// physical replay inputs rather than trusting client-supplied counters.
// Browser and Worker share the same seeded reward/parachute sequence so
// official XP is computed from the same deterministic gameplay events.
// Arcade prize settlement remains separately locked pending approval.

const STEP = 1000 / 60;
const FLOOR = 214;
const WORLD = 22000;
const MAX_FRAMES = 120000;
const MIN_MS = 65000;
const MAX_MS = 1800000;
const MAX_SPEED = 4.2;
const SPEED_BOOST_MAX_SPEED = 6;
const SPEED_BOOST_DURATION_MS = 6000;
const GRAFFBOT_FIRE_DURATION_MS = 16 * 55;
const GRAFFBOT_FIRE_COOLDOWN_MS = 2400;
const GRAFFBOT_FIRE_TRIGGER_RANGE = 150;
const GRAFFBOT_FIRE_DAMAGE_RANGE = 82;
const BALLOON_CYCLE_MS = 16 * 90;
const BALLOON_REPEAT_DELAY_MS = 420;
const BALLOON_TRIGGER_RANGE = 330;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x &&
  a.y < b.y + b.h && a.y + a.h > b.y;
export const NBG_REPLAY_VERSION = 1;

export function isNbgSweptStomp(
  player, descentVelocity, previousFeet, currentFeet, target
) {
  const feet = {
    x:player.x+2,
    y:Math.min(previousFeet,currentFeet)-5,
    w:player.w-4,
    h:Math.abs(currentFeet-previousFeet)+8,
  };
  const activeDescent=player.vy===0 ? descentVelocity : player.vy;
  return activeDescent>1.5 && previousFeet<=target.y+5 &&
    currentFeet>=target.y && overlap(feet,target);
}

function levelData(courseVersion = 1) {
  const platforms = [
    { x: 360, y: 178, w: 150, h: 16 },
    { x: 720, y: 154, w: 132, h: 16 },
    { x: 1120, y: 176, w: 142, h: 16 },
    { x: 1510, y: 148, w: 180, h: 16 },
  ];
  const crates = [
    { x: 1840, y: FLOOR - 28, w: 28, h: 28 },
    { x: 2070, y: FLOOR - 28, w: 28, h: 28 },
  ];
  const boxes = [
    { x: 535, y: 85, w: 25, h: 25, kind: 'mystery' },
    { x: 1600, y: 55, w: 25, h: 25, kind: 'star' },
  ];
  const speedBoxes = courseVersion>=5 ?
    [875,5685,10935,16185].map(x => ({x,y:FLOOR-28,w:28,h:28})) : [];
  const secrets = [
    [405, -92], [485, -105], [755, -102], [825, -116],
    [1180, -99], [1580, -112],
  ].map(([x,y]) => ({ x, y, r: 8, xp: 500 }));
  const coins = [
    [155,176], [270,150], [410,140], [520,176], [760,116],
    [890,176], [1080,152], [1180,138], [1335,176],
    [1580,110], [1740,176], [1940,176],
  ].map(([x,y]) => ({ x, y, size: 16, xp: 100 }));
  const enemies = [
    { x:600, y:FLOOR-42, w:28, h:42, vx:1.1, min:540, max:690, type:'rat' },
    { x:1010, y:128, w:28, h:22, vx:1.35, min:940, max:1128, type:'pigeon' },
    { x:1455, y:FLOOR-38, w:30, h:38, vx:0.85, min:1390, max:1550, type:'bot' },
  ];
  if (courseVersion>=5) {
    enemies.push({x:1780,y:FLOOR-48,w:30,h:48,vx:0.62,min:1715,max:1825,
      type:'balloon',balloonState:'walk',balloonCycles:0,balloonStartedAt:0,
      nextBalloonAt:0,balloonRewardAwarded:false});
  }
  const hazards = [];
  const checkpoints = [{ x:1240, y:FLOOR-48, w:30, h:48 }];
  for (let i = 0; i < 18; i++) {
    const x = 2200 + i * 1050;
    const ledges = [
      { x:x+95, y:174-i%3*10, w:150, h:16 },
      { x:x+350, y:122-i%2*16, w:130, h:16 },
      { x:x+590, y:157-i%4*8, w:145, h:16 },
      { x:x+820, y:116+i%3*8, w:110, h:16 },
    ];
    for (const ledge of ledges) {
      platforms.push(ledge);
      for (let j = 0; j < 3; j++)
        coins.push({ x:ledge.x+30+j*30, y:ledge.y-24-j%2*8, size:16, xp:100 });
    }
    for (const dx of [45,520,980])
      coins.push({ x:x+dx, y:176, size:16, xp:100 });
    const tiers = [{xp:250,size:32},{xp:250,size:32},{xp:500,size:40},{xp:1000,size:50}];
    const tier = tiers[i%4];
    coins.push({ x:x+404, y:ledges[1].y-75, size:tier.size, xp:tier.xp });
    if (courseVersion>=2) {
      secrets.push({ x:x+405,y:-94-i%3*9,r:8,xp:500 });
      secrets.push({ x:x+865,y:-102-i%2*10,r:8,xp:500 });
    }
    if (i>=6) {
      const special=i%3===0 ? {xp:500,size:40}:{xp:250,size:32};
      coins.push({ x:x+866, y:ledges[3].y-62, size:special.size, xp:special.xp });
    }
    crates.push({ x:x+65, y:FLOOR-28, w:28, h:28 });
    crates.push({ x:x+675, y:FLOOR-28, w:28, h:28 });
    boxes.push({ x:x+189, y:ledges[0].y-78, w:25, h:25, kind:'mystery' });
    boxes.push({ x:x+651, y:ledges[2].y-95, w:25, h:25, kind:'star' });
    hazards.push({ x:x+275, y:FLOOR-18, w:34, h:18 });
    hazards.push({ x:x+745, y:FLOOR-20, w:46, h:20 });
    if (i>=8 && i%3===0) hazards.push({ x:x+1000, y:FLOOR-24, w:34, h:24 });
    enemies.push({ x:x+435,y:FLOOR-42,w:28,h:42,vx:1.1+i*0.025,
      min:x+395,max:x+535,type:'rat' });
    if (courseVersion>=2 || i%2===1) enemies.push({ x:x+870,y:FLOOR-38,w:30,h:38,vx:0.85+i*0.035,
      min:x+800,max:x+960,type:'bot' });
    if (courseVersion>=2 || i%3===2) enemies.push({ x:x+615,y:110,w:28,h:22,vx:1.35,
      min:x+575,max:x+720,type:'pigeon' });
    if ([3,7,11,15].includes(i))
      checkpoints.push({ x:x+965,y:FLOOR-48,w:30,h:48 });
  }
  return { platforms, crates, boxes, speedBoxes, secrets, coins, enemies, hazards, checkpoints };
}

function decodeFrames(replay) {
  if (!replay || replay.version !== NBG_REPLAY_VERSION ||
      typeof replay.frames !== 'string' || replay.frames.length > 850000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(replay.frames)) return null;
  let bytes;
  try { bytes = atob(replay.frames); } catch { return null; }
  if (bytes.length < 5 || bytes.length % 5 !== 0 || bytes.length > MAX_FRAMES*5)
    return null;
  return bytes;
}

export async function verifyNbgLondonReplay({ runId, replay, startedAtMs, now, debug = false, testInputOverride = null }) {
  if (typeof runId !== 'string' || !Number.isFinite(startedAtMs) ||
      !Number.isFinite(now)) return { valid: false };
  const bytes = decodeFrames(replay);
  if (!bytes) return { valid: false };

  // Legacy cached v1 clients never sent a course_version: keep their exact
  // original level, random/parachute physics and two-jump rules. Revision 2
  // remains verifiable under its original combat geometry; revision 3 opts
  // into sprite-aligned platform/combat geometry. Revision 4 replaces the
  // recurring timer with one start-area parachute rat per fresh run. Revision
  // 5 adds speed boxes, Graffbot fire and deterministic balloon-enemy XP.
  // An omitted property is the only legacy v1 signal. Explicit null,
  // undefined, strings and unknown revisions must never downgrade a replay.
  const hasCourseVersion = Object.prototype.hasOwnProperty.call(replay, 'course_version');
  if (hasCourseVersion && ![2,3,4,5].includes(replay.course_version))
    return { valid:false };
  const courseVersion = hasCourseVersion ? replay.course_version : 1;
  const level = levelData(courseVersion);
  const solids=[{x:0,y:FLOOR,w:WORLD,h:60},...level.platforms,...level.crates];
  const p = { x:64, y:FLOOR-34, w:24, h:34, vx:0, vy:0, facing:1,
    grounded:true, health:3, invuln:0 };
  let jumps=0, sprayTimer=0, speedBoostUntil=0, combo=0, comboExpires=0, checkpointX=72;
  let elapsed=0, xp=0, coinCount=0, secretCount=0, complete=false;
  let consumedFrames=0;
  let maximumX=64;
  let graffbotFireCount=0;
  let balloonRewardTotal=0;
  // The browser resets the same LCG seed at every run start; no client
  // reward or random-spawn claim is trusted by the Worker.
  let runRandomState = 0x9e3779b9;
  const nextRunRandom = () => {
    runRandomState = (Math.imul(runRandomState,1664525)+1013904223) >>> 0;
    return runRandomState / 4294967296;
  };
  let parachuteRats=[];
  let nextParachuteAt=6000, parachuteSpawnCount=0;
  let previousPlayerY=p.y;
  let previousPlayerVy=p.vy;
  const playerCombatRect = () => ({x:p.x-8,y:p.y-30,w:p.w+16,h:p.h+30});
  const enemyCombatRect = target => {
    const bob=target.bob||0;
    if(target.variant) return {x:target.x-12,y:target.y+bob-10,w:52,h:56};
    if(target.type==='pigeon') return {x:target.x-12,y:target.y+bob-10,w:52,h:42};
    if(target.type==='bot') return {x:target.x-14,y:target.y+bob-12,w:58,h:50};
    if(target.type==='balloon') return {x:target.x-6,y:target.y+bob-4,w:42,h:52};
    return {x:target.x-8,y:target.y+bob-12,w:44,h:54};
  };
  const sprayAttackRect = () => ({
    x:p.facing>0?p.x+p.w-4:p.x-86+4,y:p.y-22,w:86,h:p.h+44,
  });
  const ratAttackRect = enemy => {
    const body=enemyCombatRect(enemy);
    const facing=enemy.attackFacing||(enemy.vx<0?-1:1);
    return {x:facing>0?body.x+body.w-4:body.x-24,y:body.y+12,
      w:28,h:Math.max(20,body.h-22)};
  };
  const graffbotFireRect = enemy => {
    if(courseVersion<5 || enemy.type!=='bot' || !(enemy.fireUntil>elapsed)) return null;
    const facing=enemy.fireFacing||(enemy.vx<0?-1:1);
    return {x:facing>0?enemy.x+enemy.w-3:enemy.x-GRAFFBOT_FIRE_DAMAGE_RANGE+3,
      y:enemy.y+3,w:GRAFFBOT_FIRE_DAMAGE_RANGE,h:34};
  };
  const sprayed = target => {
    if(sprayTimer<=0) return false;
    if(courseVersion>=3) return overlap(sprayAttackRect(),enemyCombatRect(target));
    const center=(target.x+target.w/2-p.x-p.w/2)*p.facing;
    const vertical=Math.abs(target.y+target.h/2-p.y-p.h/2);
    return center>=-6 && center<=86 && vertical<58;
  };
  const stomped = target => {
    if(courseVersion<3) return p.vy>1.5 &&
      p.y+p.h<=target.y+target.h*0.58 && overlap(p,target);
    const body=enemyCombatRect(target);
    const previousFeet=previousPlayerY+p.h;
    const currentFeet=p.y+p.h;
    return isNbgSweptStomp(
      p,previousPlayerVy,previousFeet,currentFeet,body
    );
  };
  const defeat = (enemy,stomp) => {
    enemy.defeated=true;
    enemy.fireUntil=0;
    enemy.balloonState='defeated';
    let earned=enemy.spawnedByParachute ? 100 : 75;
    if(courseVersion>=5 && enemy.type==='balloon'){
      if(enemy.balloonRewardAwarded) return;
      enemy.balloonRewardAwarded=true;
      earned=10+Math.floor(nextRunRandom()*9991);
      enemy.balloonRewardXp=earned;
      balloonRewardTotal+=earned;
    }
    xp+=earned;
    if(stomp) p.vy=-9;
  };
  const invulnerableDamage = (sourceX) => {
    if (p.invuln>0) return;
    p.health--;
    p.vx=sourceX>p.x ? -5.5:5.5;
    p.vy=-6.2;
    p.invuln=1050;
    combo=0; comboExpires=0;
  };

  for (let offset=0; offset<bytes.length; offset+=5) {
    const dec = pos => bytes.charCodeAt(offset+pos);
    const dt=(dec(0) + dec(1)*256)/10;
    const frameElapsed=(dec(2) + dec(3)*256)/10;
    // Only direct JavaScript unit tests can inject this callback; no HTTP JSON
    // value can become a function. Production always uses the encoded mask.
    const mask=typeof testInputOverride === 'function' ?
      testInputOverride({ x:p.x,y:p.y,vx:p.vx,vy:p.vy,grounded:p.grounded,
        jumps,health:p.health,elapsed, frame:consumedFrames,
        parachuteSpawnCount, activeParachuteRats:parachuteRats.length,
        parachuteRatX:parachuteRats[0]?.x ?? null,
        landedParachuteRats:level.enemies.filter(e=>e.spawnedByParachute&&!e.defeated).length,
        obstacles:level.hazards.concat(level.crates),
        speedBoostActive:elapsed<speedBoostUntil,
        speedBoxesCollected:level.speedBoxes.filter(box=>box.collected).length,
        graffbotFireCount,
        balloonCycles:level.enemies.find(enemy=>enemy.type==='balloon')?.balloonCycles ?? null,
        balloonRewardXp:level.enemies.find(enemy=>enemy.type==='balloon')?.balloonRewardXp ?? null,
        balloonRewardTotal }) : dec(4);
    if (!Number.isInteger(mask) || mask<0 || mask>15 || dt<0 || dt>33.1 || frameElapsed>2000 ||
        dt>frameElapsed) return { valid:false };
    elapsed += frameElapsed;
    if (elapsed>MAX_MS+20000) return { valid:false };
    consumedFrames++;
    const step=dt/STEP;
    const left=!!(mask&1), right=!!(mask&2), jump=!!(mask&4), spray=!!(mask&8);
    if (left) {p.vx-=0.74*step;p.facing=-1;}
    if (right) {p.vx+=0.74*step;p.facing=1;}
    if (!left && !right) p.vx*=Math.pow(0.78,step);
    const activeMaxSpeed=courseVersion>=5&&elapsed<speedBoostUntil?SPEED_BOOST_MAX_SPEED:MAX_SPEED;
    p.vx=clamp(p.vx,-activeMaxSpeed,activeMaxSpeed);
    if (jump) {
      if (p.grounded) {p.vy=-11.4;p.grounded=false;jumps=1;}
      else if(jumps===1) {
        p.vy=-12.8;
        if (left!==right) {
          p.vx=left ? -5.4:5.4;
          p.facing=left ? -1:1;
        }
        jumps=2;
      } else if(courseVersion>=2 && jumps===2) {
        p.vy=-12.8;
        if (left!==right) {
          p.vx=left ? -5.4:5.4;
          p.facing=left ? -1:1;
        }
        jumps=3;
      }
    }
    if(sprayTimer>0) sprayTimer-=dt;
    if(p.invuln>0) p.invuln-=dt;
    if(spray && sprayTimer<=0) sprayTimer=230;

    const beforeX=p.x;
    p.x=clamp(p.x+p.vx*step,12,WORLD-p.w-12);
    maximumX=Math.max(maximumX,p.x);
    for (const box of level.crates) {
      if (Math.abs(box.x-p.x)>60 || !overlap(p,box)) continue;
      if (p.vx>0 && beforeX+p.w<=box.x+1) {p.x=box.x-p.w;p.vx=0;}
      else if (p.vx<0 && beforeX>=box.x+box.w-1) {p.x=box.x+box.w;p.vx=0;}
    }
    const previousY=p.y;
    previousPlayerY=previousY;
    p.vy+=0.52*step;
    previousPlayerVy=p.vy;
    p.y+=p.vy*step;
    p.grounded=false;
    for(const tile of solids) {
      if(Math.abs(tile.x-p.x)>250 && tile.w<1000) continue;
      if(previousY+p.h<=tile.y+1 && p.vy>=0 && overlap(p,tile)) {
        p.y=tile.y-p.h;p.vy=0;p.grounded=true;jumps=0;
      }
    }
    if(p.y>350) {
      invulnerableDamage(p.x);
      if(p.health<=0) return {valid:false, ...(debug ? {debug:{reason:'health',x:p.x,elapsed,consumedFrames}}:{})};
      p.x=checkpointX;p.y=FLOOR-p.h;previousPlayerY=p.y;previousPlayerVy=0;
      p.vx=0;p.vy=0;
      jumps=0;p.invuln=1050;sprayTimer=0;speedBoostUntil=0;
    }
    for(const coin of level.coins) {
      if(coin.taken || Math.abs(coin.x-p.x)>40) continue;
      const hit=Math.round(coin.size*0.8);
      if(overlap(p,{x:coin.x-hit/2,y:coin.y-hit/2,w:hit,h:hit})) {
        coin.taken=true;coinCount++;
        combo=elapsed<comboExpires ? Math.min(4,combo+1):1;
        comboExpires=elapsed+2400;
        xp+=coin.xp*combo;
      }
    }
    for(const box of level.speedBoxes) {
      if(box.collected || !overlap(p,box)) continue;
      box.collected=true;
      speedBoostUntil=elapsed+SPEED_BOOST_DURATION_MS;
    }
    for(const coin of level.secrets) {
      if(coin.taken || Math.abs(coin.x-p.x)>40) continue;
      if(overlap(p,{x:coin.x-coin.r,y:coin.y-coin.r,w:coin.r*2,h:coin.r*2})) {
        coin.taken=true;secretCount++;xp+=coin.xp;
      }
    }
    // Same reward PRNG consumption/order as updateRewardBoxes in the game.
    for(const box of level.boxes) {
      if(box.opened || !overlap(p,box)) continue;
      box.opened=true;
      const pick=Math.min(3,Math.floor(nextRunRandom()*4));
      if(pick===3){
        const healed=Math.min(box.kind==='star'?2:1,Math.max(0,5-p.health));
        p.health+=healed;
        if(!healed) xp+=box.kind==='star'?500:100;
      } else {
        xp+=(box.kind==='star'?[500,750,1000]:[100,250,500])[pick];
      }
    }
    // Update all active walkers, including landed parachute rats, in the
    // browser's reverse-index order. Random attack variants also consume
    // the shared RNG state before the next parachute spawn.
    for(let i=level.enemies.length-1;i>=0;i--) {
      const enemy=level.enemies[i];
      if(enemy.defeated || (enemy.spawnedByParachute &&
         (elapsed-enemy.spawnedAt>=22000 || Math.abs(enemy.x-p.x)>960))) {
        if(enemy.spawnedByParachute) level.enemies.splice(i,1);
        continue;
      }
      const sprayHit=sprayed(enemy);
      const stompHit=stomped(enemy);
      if(sprayHit || stompHit){
        defeat(enemy,!sprayHit && stompHit);
        if(enemy.spawnedByParachute) level.enemies.splice(i,1);
        continue;
      }

      let balloonActive=courseVersion>=5&&enemy.type==='balloon'&&enemy.balloonState==='release';
      if(courseVersion>=5&&enemy.type==='balloon'){
        if(balloonActive&&elapsed-enemy.balloonStartedAt>=BALLOON_CYCLE_MS){
          enemy.balloonCycles++;
          enemy.balloonState='walk';
          enemy.nextBalloonAt=enemy.balloonCycles<2?
            elapsed+BALLOON_REPEAT_DELAY_MS:Number.POSITIVE_INFINITY;
          balloonActive=false;
        }
        if(!balloonActive&&enemy.balloonCycles<2&&
            Math.abs(p.x-enemy.x)<BALLOON_TRIGGER_RANGE&&
            elapsed>=(enemy.nextBalloonAt||0)){
          enemy.balloonState='release';
          enemy.balloonStartedAt=elapsed;
          enemy.balloonFacing=p.x+p.w/2<enemy.x+enemy.w/2?-1:1;
          balloonActive=true;
        }
      }

      let botFireActive=courseVersion>=5&&enemy.type==='bot'&&(enemy.fireUntil||0)>elapsed;
      if(courseVersion>=5&&enemy.type==='bot'&&!botFireActive&&
          Math.abs(p.x-enemy.x)<GRAFFBOT_FIRE_TRIGGER_RANGE&&
          Math.abs(p.y-enemy.y)<70&&elapsed>=(enemy.nextFireAt||0)){
        enemy.fireFacing=p.x+p.w/2<enemy.x+enemy.w/2?-1:1;
        enemy.fireStartedAt=elapsed;
        enemy.fireUntil=elapsed+GRAFFBOT_FIRE_DURATION_MS;
        enemy.nextFireAt=enemy.fireUntil+GRAFFBOT_FIRE_COOLDOWN_MS;
        botFireActive=true;
        graffbotFireCount++;
      }

      if(!balloonActive&&!botFireActive){
        enemy.x+=enemy.vx*step;
        if(enemy.x<enemy.min || enemy.x>enemy.max) enemy.vx*=-1;
      }
      if(enemy.type==='pigeon') enemy.bob=Math.sin(elapsed/180)*9;
      if(['rat','turquoiseRat','brownRat'].includes(enemy.type)){
        const close=Math.abs(p.x-enemy.x)<70 && Math.abs(p.y-enemy.y)<65;
        if(close && elapsed>=(enemy.nextAttackAt||0) &&
            elapsed>=(enemy.attackUntil||0)){
          if(enemy.type==='rat'||enemy.type==='turquoiseRat') nextRunRandom();
          enemy.attackUntil=elapsed+850;
          enemy.nextAttackAt=elapsed+1700;
          if(courseVersion>=3)
            enemy.attackFacing=p.x+p.w/2<enemy.x+enemy.w/2?-1:1;
        }
      }
      // Keep landed parachute-rat reach aligned with the browser collision.
      const landedRat=!!enemy.spawnedByParachute;
      const contactPlayer=landedRat?
        {x:p.x,y:p.y-30,w:p.w,h:p.h+30}:playerCombatRect();
      const body=landedRat?
        {x:enemy.x,y:enemy.y+(enemy.bob||0)-12,w:enemy.w,h:54}:
        courseVersion>=3?enemyCombatRect(enemy):
        {x:enemy.x,y:enemy.y+(enemy.bob||0),w:enemy.w,h:enemy.h};
      const isRat=['rat','turquoiseRat','brownRat'].includes(enemy.type);
      const attack=isRat?ratAttackRect(enemy):null;
      if(landedRat&&attack){
        if((enemy.attackFacing||(enemy.vx<0?-1:1))>0) attack.x+=8;
        attack.w-=8;
      }
      const activeRatAttack=courseVersion>=3 && isRat &&
        (enemy.attackUntil||0)>elapsed && overlap(contactPlayer,attack);
      const fireRect=graffbotFireRect(enemy);
      const activeGraffbotFire=fireRect&&overlap(playerCombatRect(),fireRect);
      if(p.invuln<=0 && (overlap(courseVersion>=3?contactPlayer:p,body) ||
          activeRatAttack||activeGraffbotFire)){
        invulnerableDamage(enemy.x);
      }
    }

  // Parachute enemies are gameplay entities, not decoration. Replay their
    // full drift, collision, landing and attack sequence; otherwise a valid
    // browser run can diverge from the Worker after a few seconds.
    let landedCount=level.enemies.filter(e=>e.spawnedByParachute&&!e.defeated).length;
    const shouldSpawnParachute=courseVersion>=4 ? parachuteSpawnCount===0 :
      elapsed>=nextParachuteAt && parachuteRats.length<3 && landedCount<5 &&
      p.x>350 && p.x<WORLD-250;
    if(shouldSpawnParachute){
      const variant=['parachuteRatA','parachuteRatB','parachuteRatC']
        [Math.floor(nextRunRandom()*3)];
      const drift=(nextRunRandom()*2-1)*90;
      parachuteRats.push({
        x:courseVersion>=4 ? clamp(390+drift*0.25,350,430) :
          clamp(p.x+(courseVersion>=2 ? 240+drift*0.25 : drift),28,WORLD-60),
        y:courseVersion>=2 ? 55 : -110,w:28,h:42,variant,
        swayPhase:nextRunRandom()*Math.PI*2,vx:0,age:0,
      });
      parachuteSpawnCount++;
      if(courseVersion<4) nextParachuteAt=elapsed+5500+nextRunRandom()*4500;
    }
    for(let i=parachuteRats.length-1;i>=0;i--){
      const rat=parachuteRats[i];
      rat.age+=dt;
      const targetX=p.x+p.w/2-rat.w/2;
      const horizontal=clamp((targetX-rat.x)*0.028,-0.9,0.9);
      rat.vx+=(horizontal-rat.vx)*Math.min(1,0.065*step);
      rat.x+=(rat.vx+Math.sin(rat.age/380+rat.swayPhase)*0.24)*step;
      rat.x=clamp(rat.x,0,WORLD-rat.w);
      rat.y+=((courseVersion>=2 ? 2.8 : 0.68)+Math.sin(rat.age/470+rat.swayPhase)*0.11)*step;
      const sprayHit=sprayed(rat);
      const stompHit=stomped(rat);
      if(sprayHit||stompHit){
        // Mid-air rats are not yet flagged as landed spawns by the game;
        // defeatEnemy awards their base 75 XP, not the landed 100 XP.
        defeat(rat,!sprayHit && stompHit);
        parachuteRats.splice(i,1);
        continue;
      }
      if(p.invuln<=0&&overlap(courseVersion>=3?playerCombatRect():p, courseVersion>=3?enemyCombatRect(rat):rat)){
        invulnerableDamage(rat.x);
        rat.y=FLOOR-rat.h;
      }
      if(rat.y+rat.h>=FLOOR){
        if(landedCount<(courseVersion>=4?1:5)){
          level.enemies.push({
            type:rat.variant==='parachuteRatC'?'turquoiseRat':'brownRat',
            x:rat.x,y:FLOOR-42,w:28,h:42,
            vx:nextRunRandom()<0.5?-1.1:1.1,
            min:Math.max(0,rat.x-65),max:Math.min(WORLD-28,rat.x+65),
            spawnedByParachute:true,spawnedAt:elapsed,
          });
          landedCount++;
        }
        parachuteRats.splice(i,1);
      }
    }
    for(const hazard of level.hazards) {
      if(Math.abs(hazard.x-p.x)<60 && overlap(p,hazard)) invulnerableDamage(hazard.x);
    }
    if(p.health<=0) return {valid:false, ...(debug ? {debug:{reason:'health',x:p.x,elapsed,consumedFrames}}:{})};
    for(const checkpoint of level.checkpoints) {
      if(!checkpoint.active && Math.abs(checkpoint.x-p.x)<60 && overlap(p,checkpoint)) {
        checkpoint.active=true;checkpointX=Math.max(checkpointX,checkpoint.x);
        xp+=250;
      }
    }
    if(overlap(p,{x:WORLD-150,y:FLOOR-62,w:38,h:62})) {
      complete=true;
      xp+=500+coinCount*25;
      xp+=Math.max(0,Math.ceil((180000-elapsed)/1000))*35;
      break;
    }
  }

  if(!complete || consumedFrames!==bytes.length/5 ||
     elapsed<MIN_MS || elapsed>MAX_MS || maximumX < WORLD-175 ||
     Math.abs(elapsed-(now-startedAtMs))>20000 ||
     !Number.isSafeInteger(xp) || xp<0 || xp>1000000)
    return {valid:false, ...(debug ? {debug:{reason:'finish',x:p.x,maximumX,elapsed,consumedFrames,complete,health:p.health,jumps,courseVersion}}:{})};

  return { valid:true, complete:true, time_ms:Math.round(elapsed),
    xp, coins:coinCount, secret_coins:secretCount,
    ...(debug ? {debug:{courseVersion,consumedFrames,complete,health:p.health,
      jumps,maximumX,speedBoxesCollected:level.speedBoxes.filter(box=>box.collected).length,
      graffbotFireCount,balloonRewardTotal,
      balloonCycles:level.enemies.find(enemy=>enemy.type==='balloon')?.balloonCycles ?? null}}:{}) };
}
