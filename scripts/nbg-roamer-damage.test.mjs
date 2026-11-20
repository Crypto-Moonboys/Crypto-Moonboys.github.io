import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/nbg-roamer.js', import.meta.url), 'utf8');

function extract(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  const end = source.indexOf('\n  }\n', start);
  assert.ok(end > start);
  return source.slice(start, end + 4);
}
const combat = ['overlaps','runnerHitbox','enemyHitbox','enemyAttackHitbox','damageRunner']
  .map(extract).join('\n');

function harness() {
  const body = [
    'const MAX_HEALTH=3, HIT_INVULN_MS=1200, HURT_MS=450, DEFEAT_MS=700;',
    'let health=MAX_HEALTH, invulnerableUntil=0, hurtUntil=0, runnerDefeated=false, defeatAt=0;',
    'let x=200, y=0, vy=0, sprayUntil=0, controlling=true, active=true;',
    'let spriteLabel="", controls={hidden:false};',
    'const held=new Set(["ArrowLeft"]);',
    'const sprite={setAttribute(_name,value){spriteLabel=value}};',
    'const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));',
    combat,
    '({damageRunner,overlaps,runnerHitbox,enemyHitbox,enemyAttackHitbox,',
    '  get:()=>({health,invulnerableUntil,hurtUntil,runnerDefeated,defeatAt,vy,controlling,hidden:controls.hidden,held:held.size,spriteLabel}),',
    '  setPosition:(a,b=0)=>{x=a;y=b;vy=0}, setSpray:value=>{sprayUntil=value}})'
  ].join('\n');
  return runInNewContext(body, {window:{innerWidth:1000},Math});
}

test('three distinct contact hits show hurt, protect briefly, and defeat runner on third', () => {
  const h = harness();
  assert.equal(h.damageRunner(1000,250),true);
  assert.equal(h.get().health,2);
  assert.equal(h.get().hurtUntil,1450);
  assert.equal(h.get().invulnerableUntil,2200);
  assert.equal(h.get().held,0,'pressed movement keys are cleared on impact');
  assert.equal(h.get().spriteLabel.includes('2 of 3'),true);
  assert.equal(h.damageRunner(1100,250),false,'invulnerable to repeated overlap');
  assert.equal(h.get().health,2);
  assert.equal(h.damageRunner(2200,250),true);
  assert.equal(h.get().health,1);
  assert.equal(h.damageRunner(3400,250),true);
  assert.equal(h.get().health,0);
  assert.equal(h.get().runnerDefeated,true);
  assert.equal(h.get().defeatAt,4100);
  assert.equal(h.get().controlling,false);
  assert.equal(h.get().hidden,true);
  assert.equal(h.damageRunner(4500,250),false,'cannot lose more health after defeat');
});

test('attack hitbox is directional and only active during attack frames', () => {
  const h = harness();
  const enemy = {type:{key:'turquoiseRatWalk',kind:'ground',width:50,height:60},
    x:290,top:640,hitUntil:0,
    attack:{key:'turquoiseRatKick',startedAt:1000,until:1850,facing:-1}};
  const runner = h.runnerHitbox(700);
  const active = h.enemyAttackHitbox(enemy,1350);
  assert.ok(active);
  assert.equal(h.overlaps(runner,active),true,'left-facing kick reaches runner');
  assert.equal(h.overlaps(runner,h.enemyHitbox(enemy)),false,
    'enemy can strike without bodies touching');
  assert.equal(h.enemyAttackHitbox(enemy,1100),null,'wind-up not damaging');
  assert.equal(h.enemyAttackHitbox(enemy,1800),null,'recovery not damaging');
  enemy.attack.facing=1;
  assert.equal(h.overlaps(runner,h.enemyAttackHitbox(enemy,1350)),false,
    'right-facing kick does not hit runner on the left');
  enemy.attack.key='graffitiBotFire';
  assert.ok(h.enemyAttackHitbox(enemy,1350).right-
    h.enemyAttackHitbox(enemy,1350).left > active.right-active.left);
  enemy.hitUntil=1500;
  assert.equal(h.enemyAttackHitbox(enemy,1350),null,'hurt enemy cannot attack');
});

test('contact from live enemy and active attack remove health in encounter loop', () => {
  const setup = [
    'const MAX_HEALTH=3,HIT_INVULN_MS=1200,HURT_MS=450,DEFEAT_MS=700;',
    'const ENEMY_TYPES=[]; const ATTACK_POSES={turquoiseRatKick:{frames:25,frameMs:34}};',
    'let health=MAX_HEALTH, invulnerableUntil=0,hurtUntil=0,runnerDefeated=false,defeatAt=0;',
    'let x=200,y=0,vy=0,sprayUntil=0,controlling=true,active=true,direction=1,jumpsUsed=0;',
    'let encounterNextAt=Infinity,encounterSpawnIndex=0;',
    'let encounterCanvas={width:1000,height:700};',
    'let encounterCtx={clearRect(){},save(){},restore(){},fillText(){},font:"",textAlign:"",fillStyle:""};',
    'let enemies=[],sprite={setAttribute(){}},controls={hidden:false};',
    'const held=new Set();',
    'const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));',
    'const resizeEncounterCanvas=()=>{};',
    'const drawEnemyPose=()=>{};',
    'const beginEnemyAttack=()=>{};',
    'const defeatEnemy=e=>{e.defeated=true};',
    combat,
    extract('updateEncounter'),
    '({setEnemy:e=>{enemies=[e]},setRunner:(px,py=0,pvy=0)=>{x=px;y=py;vy=pvy},',
    ' setSpray:until=>{sprayUntil=until}, updateEncounter,',
    ' get:()=>({health,runnerDefeated,vy,enemies})})'
  ].join('\n');
  const h=runInNewContext(setup,{window:{innerWidth:1000,innerHeight:700},Math});
  const type={key:'londonRat',kind:'ground',width:50,height:60,frames:25,frameMs:90};
  const enemy=()=>({type,x:225,top:640,vx:0,age:0,defeated:false,hitUntil:0,attack:null});
  h.setEnemy(enemy());
  h.updateEncounter(1000,0.016,0);
  assert.equal(h.get().health,2,'touch deals damage even without an enemy attack');
  h.setRunner(200);
  h.updateEncounter(1100,0.016,0);
  assert.equal(h.get().health,2,'overlap within invulnerability cannot damage again');

  h.setRunner(200);
  const attacker=enemy();
  attacker.x=290;
  attacker.attack={key:'turquoiseRatKick',startedAt:2050,until:2900,facing:-1};
  h.setEnemy(attacker);
  h.updateEncounter(2400,0.016,0);
  assert.equal(h.get().health,1,'an active melee pose hits outside body range');

  h.setRunner(200,50,-300);
  const stompTarget=enemy();
  h.setEnemy(stompTarget);
  h.updateEncounter(3600,0.016,68);
  assert.equal(h.get().health,1,'valid stomps never hurt runner on same frame');
  assert.equal(stompTarget.defeated,true);

  h.setRunner(200);
  const sprayTarget=enemy();
  sprayTarget.x=246;
  h.setEnemy(sprayTarget);
  h.setSpray(4900);
  h.updateEncounter(4700,0.016,0);
  assert.equal(h.get().health,1,'spray kill takes priority over contact');
  assert.equal(sprayTarget.defeated,true);

  h.setRunner(200);
  h.setSpray(0);
  h.setEnemy(enemy());
  h.updateEncounter(5000,0.016,0);
  assert.equal(h.get().health,0);
  assert.equal(h.get().runnerDefeated,true);
});

test('hurt art, invulnerability flashes, death exit and health UI remain isolated', () => {
  assert.match(source,/const anim = runnerDefeated \|\| now < hurtUntil \? 'hurt'/);
  assert.match(source,/now < invulnerableUntil &&\s*Math\.floor\(now \/ 110\) % 2 === 0/);
  assert.match(source,/if \(runnerDefeated && now >= defeatAt\) \{ stop\(\); return; \}/);
  assert.match(source,/♥'\.repeat\(health\) \+ '♡'\.repeat\(MAX_HEALTH - health\)/);
  assert.match(source,/if \(!runnerDefeated && !playerWon && !enemy\.defeated && enemy\.hitUntil <= now\)/);
  assert.match(source,/clearEncounter\(\);\s*if \(host\) host\.remove\(\)/);
  assert.doesNotMatch(source,/awardXp|submitScore|leaderboard\.post|\/api\/scores/i);
});
