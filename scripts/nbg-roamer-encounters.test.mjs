import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/nbg-roamer.js', import.meta.url), 'utf8');
const assets = JSON.parse(readFileSync(new URL('../game/assets/asset-manifest.json', import.meta.url), 'utf8'));
const animations = JSON.parse(readFileSync(new URL('../game/assets/player/nbg-runner-animation-manifest.json', import.meta.url), 'utf8')).animations;

function block(name) {
  const start = source.indexOf('  const ' + name + ' = ');
  assert.notEqual(start, -1, name + ' declaration exists');
  const end = source.indexOf(';\n', start);
  assert.notEqual(end, -1);
  return source.slice(start, end + 1);
}
function functionBody(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert.notEqual(start, -1, name + ' function exists');
  const end = source.indexOf('\n  }\n', start);
  assert.notEqual(end, -1);
  return source.slice(start, end + 4);
}
const definitions = ['ENEMY_TYPES', 'ENEMY_BY_KEY', 'ENEMY_ATTACKS', 'ATTACK_POSES'].map(block).join('\n');
const catalog = runInNewContext(definitions + '\n({ types: ENEMY_TYPES, byKey: ENEMY_BY_KEY, attacks: ENEMY_ATTACKS, poses: ATTACK_POSES })');

test('every original walking, parachute, and available attack pose is backed by real NBG assets', () => {
  const required = [
    'parachuteRatA', 'parachuteRatB', 'parachuteRatC',
    'londonRat', 'turquoiseRatWalk', 'brownRatWalk', 'graffitiBot', 'pigeon', 'balloonWalk',
    'londonRatBladeFlurry', 'londonRatViperPounce', 'turquoiseRatKick',
    'turquoiseRatPunch', 'brownRatPunch', 'graffitiBotKick', 'graffitiBotFire',
    'graffitiBotHurt', 'balloonRelease'
  ];
  assert.deepEqual(
    [...catalog.types.map(type => type.key), ...Object.keys(catalog.poses)],
    required
  );
  for (const key of required) assert.match(assets.enemies[key], /\.(?:png|webp)$/, key);
  assert.ok(animations.spray.spriteSheet.endsWith('.png'));
  assert.equal(catalog.poses.graffitiBotFire.columns, 4);
  assert.equal(catalog.poses.balloonRelease.frames, 16);
});

test('parachute art preserves rat colour independent of array order', () => {
  assert.equal(catalog.byKey.parachuteRatA.landedKey, 'brownRatWalk');
  assert.equal(catalog.byKey.parachuteRatB.landedKey, 'brownRatWalk');
  assert.equal(catalog.byKey.parachuteRatC.landedKey, 'turquoiseRatWalk');
  assert.match(source, /const parachutes = \[ENEMY_BY_KEY\.parachuteRatA, ENEMY_BY_KEY\.parachuteRatC\]/);
  assert.doesNotMatch(source, /enemy === enemies\[0\]/);
  assert.match(source, /enemy\.type = ENEMY_BY_KEY\[e\.landedKey\]/);
});

function encounterHarness() {
  const script = [
    definitions,
    "let encounterCtx = {clearRect() {}, save() {}, restore() {}, fillText() {}}, encounterCanvas = {width: 1000, height: 700};",
    "let active = true, controlling = false, runnerDefeated = false, enemies = [], encounterNextAt = 0, encounterSpawnIndex = 0;",
    "const MAX_HEALTH = 3; let health = MAX_HEALTH;",
    "let x = -5000, y = 0, vy = 0, jumpsUsed = 0, sprayUntil = 0, direction = 1;",
    "const resizeEncounterCanvas = () => {};",
    "const framesDrawn = [];",
    "const drawEnemyPose = (key, pose, frame, x, top, w, h, facing, grounded) => framesDrawn.push({key, top, facing, grounded});",
    "const beginEnemyAttack = () => {};",
    "const defeatEnemy = enemy => {enemy.defeated = true};",
    "const runnerHitbox = () => ({left:-5000,right:-4950,top:0,bottom:0});",
    "const enemyHitbox = () => ({left:0,right:0,top:0,bottom:0});",
    "const enemyAttackHitbox = () => null; const overlaps = () => false;",
    "const damageRunner = () => false;",
    functionBody('spawnEnemy'),
    functionBody('updateEncounter'),
    "({spawnEnemy, updateEncounter, setEnemies: values => {enemies = values}, getEnemies: () => enemies, framesDrawn})"
  ].join('\n');
  return runInNewContext(script, {window: {innerWidth:1000, innerHeight:700}, Math});
}

test('two parachutes descend together and land in the matching walking sheets', () => {
  const h = encounterHarness();
  const brown = h.spawnEnemy(catalog.byKey.parachuteRatA, 0);
  const turquoise = h.spawnEnemy(catalog.byKey.parachuteRatC, 1);
  assert.equal(brown.top, turquoise.top, 'both parachutes start at the same height');
  brown.top = 700 - brown.type.height - 1;
  turquoise.top = 700 - turquoise.type.height - 1;
  h.setEnemies([turquoise, brown]); // Swapped order cannot swap their colours.
  h.updateEncounter(100, 0.05, 0);
  assert.equal(brown.type.key, 'brownRatWalk');
  assert.equal(turquoise.type.key, 'turquoiseRatWalk');
  assert.equal(brown.top + brown.type.height, 700);
  assert.equal(turquoise.top + turquoise.type.height, 700);
  assert.ok(h.framesDrawn.every(draw => draw.grounded), 'landed rats draw at viewport floor');
});

test('ground patrol reverses both velocity and visible facing at both edges', () => {
  const h = encounterHarness();
  const rat = h.spawnEnemy(catalog.byKey.londonRat, 0);
  rat.x = 8.1;
  rat.vx = -58;
  h.setEnemies([rat]);
  h.updateEncounter(100, 0.05, 0);
  assert.ok(rat.vx > 0);
  assert.equal(h.framesDrawn.at(-1).facing, 1);
  rat.x = 1000 - rat.type.width - 8 - 0.1;
  rat.vx = 58;
  h.updateEncounter(200, 0.05, 0);
  assert.ok(rat.vx < 0);
  assert.equal(h.framesDrawn.at(-1).facing, -1);
  assert.match(source, /encounterCtx\.scale\(-1, 1\)/);
  assert.match(source, /encounterCtx\.translate\(Math\.round\(drawX \+ drawW\), Math\.round\(drawY\)\)/);
});

test('actual visible pixels, not transparent source frame padding, define floor contact', () => {
  const calls = [];
  const ctx = {
    save(){}, restore(){}, translate(...args){calls.push(['translate', ...args])},
    scale(...args){calls.push(['scale', ...args])},
    drawImage(...args){calls.push(['draw', ...args])}
  };
  const image = {complete:true,naturalWidth:250};
  const sandbox = {
    encounterCtx:ctx, encounterCanvas:{height:700}, enemyImages:{londonRat:image},
    visibleFrameBounds:() => ({x:5,y:5,width:25,height:50}), Math
  };
  const draw = runInNewContext(functionBody('drawEnemyPose') + '\ndrawEnemyPose', sandbox);
  const pose = {columns:5,frames:25,frameMs:90};
  draw('londonRat',pose,0,120,400,50,60,-1,true);
  assert.deepEqual(calls.find(call => call[0]==='translate').slice(2), [640],
    'left-facing sprite should translate to foot y=700-60');
  assert.deepEqual(calls.find(call => call[0]==='scale'), ['scale',-1,1]);
  calls.length = 0;
  draw('londonRat',pose,0,120,400,50,60,1,true);
  assert.equal(calls.find(call => call[0]==='draw').at(-3), 640);
  assert.equal(calls.some(call => call[0]==='scale'), false);
  assert.match(source, /getImageData\(0, 0, width, height\)/);
});


test('transparent bottom padding is measured from actual per-frame alpha and cached', () => {
  let reads = 0;
  const sampler = {
    clearRect(){}, drawImage(){},
    getImageData(_x,_y,width,height) {
      reads++;
      const pixels = new Uint8ClampedArray(width * height * 4);
      pixels[((height - 2) * width + 1) * 4 + 3] = 255;
      pixels[((height - 2) * width + 2) * 4 + 3] = 255;
      return {data:pixels};
    }
  };
  const runtime = runInNewContext([
    'let measureCanvas = null, measureContext = null;',
    'const measuredFrames = new WeakMap();',
    functionBody('visibleFrameBounds'),
    'visibleFrameBounds'
  ].join('\n'), {
    document: {createElement() {return {getContext() {return sampler}}}},
    Math
  });
  const image = {naturalWidth:8,naturalHeight:8};
  const pose = {columns:2,frames:4};
  const visible = runtime(image,pose,0);
  assert.equal(visible.x,1);
  assert.equal(visible.y,2);
  assert.equal(visible.width,2);
  assert.equal(visible.height,1);
  assert.equal(runtime(image,pose,0),visible,'same image/frame reuses cached bounds');
  assert.equal(reads,1,'alpha is sampled only once per frame');
});

test('each walking enemy cycles all its canonical attack poses while near the player', () => {
  const api = runInNewContext([
    definitions,
    "let x = 100, y = 0;",
    functionBody('beginEnemyAttack'),
    'beginEnemyAttack'
  ].join('\n'), {Math});
  for (const typeKey of Object.keys(catalog.attacks)) {
    const options = catalog.attacks[typeKey];
    const enemy = {type:{key:typeKey,width:55},x:125,attack:null,nextAttackAt:0,hitUntil:0,attackIndex:0};
    let now = 1000;
    const actual = [];
    for (let i=0;i<options.length;i++) {
      api(enemy,now);
      assert.ok(enemy.attack, 'attack starts for '+typeKey);
      actual.push(enemy.attack.key);
      now = enemy.nextAttackAt + 1;
      enemy.attack = null;
    }
    assert.deepEqual(actual, [...options], typeKey + ' cycles every pose');
  }
  assert.match(source, /key = 'graffitiBotHurt'/);
  assert.match(source, /drawEnemyPose\('graffitiBotFire'/);
  assert.match(source, /key = enemy\.attack\.key === 'graffitiBotFire' \? 'graffitiBotKick'/);
});

test('stomps and spray still work, gameplay remains separate and cleanup is bounded', () => {
  assert.match(source, /overlapX && vy < 0 &&\s*oldFoot <= enemyTop \+ 16 && playerFoot >= enemyTop/);
  assert.match(source, /defeatEnemy\(enemy, now\);\s*playerWon = true;\s*vy = 430/);
  assert.match(source, /sprayReach >= -10 && sprayReach < 125/);
  assert.match(source, /const anim = now < sprayUntil \? 'spray'/);
  assert.match(source, /if \(key === 'KeyF'\) spray\(\)/);
  assert.match(source, /const clearEncounter|function clearEncounter/);
  assert.match(source, /clearEncounter\(\);\s*if \(host\) host\.remove\(\)/);
  assert.match(source, /if \(disposed \|\| generation !== encounterGeneration\) return/);
  assert.doesNotMatch(source, /awardXp|submitScore|leaderboard\.post|\/api\/scores/i);
});
