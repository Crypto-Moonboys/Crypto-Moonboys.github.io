import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/nbg-roamer.js', import.meta.url), 'utf8');
const assets = JSON.parse(readFileSync(new URL('../game/assets/asset-manifest.json', import.meta.url), 'utf8'));
const animations = JSON.parse(readFileSync(new URL('../game/assets/player/nbg-runner-animation-manifest.json', import.meta.url), 'utf8')).animations;

test('enemy set consists entirely of actual NBG London sheets', () => {
  const keys = [...source.matchAll(/\{ key: '([^']+)', kind: '(?:parachute|ground|flying)'/g)].map(m => m[1]);
  assert.deepEqual(keys, [
    'parachuteRatA', 'parachuteRatB', 'londonRat', 'turquoiseRatWalk',
    'brownRatWalk', 'graffitiBot', 'pigeon', 'balloonWalk'
  ]);
  for (const key of keys) {
    assert.ok(assets.enemies[key], 'Missing manifest artwork: ' + key);
    assert.match(assets.enemies[key], /\.(png|webp)$/);
  }
  assert.ok(animations.spray.spriteSheet.endsWith('.png'), 'Actual spray pose exists');
});

test('two parachutes begin together and fall from above the viewport', () => {
  assert.match(source, /const parachutes = ENEMY_TYPES\.slice\(0, 2\)/);
  assert.match(source, /enemies\.push\(spawnEnemy\(parachutes\[i\], i\)\)/);
  assert.match(source, /top: parachute \? -type\.height - index \* 100/);
  assert.match(source, /enemy\.top = Math\.min\(h - e\.height, enemy\.top \+ 105 \* delta\)/);
  assert.match(source, /startEncounter\(\);\s*if \(manual\) startSummonCooldown/);
  assert.match(source, /enemy\.type = ENEMY_TYPES\[/);
});

test('stomp requires falling feet to cross enemy top with horizontal overlap', () => {
  assert.match(source, /overlapX && vy < 0 && oldFoot <= enemyTop \+ 16 && playerFoot >= enemyTop/);
  assert.match(source, /enemy\.defeated = true;\s*vy = 430/);
  assert.match(source, /Math\.min\(jumpsUsed, 2\)/);
});

test('spray pose and collision support both keyboard and touch', () => {
  assert.match(source, /\['SPRAY', 'KeyF'\]/);
  assert.match(source, /if \(key === 'KeyF'\) spray\(\)/);
  assert.match(source, /event\.code === 'KeyF' \|\| event\.code === 'KeyJ'/);
  assert.match(source, /const anim = now < sprayUntil \? 'spray'/);
  assert.match(source, /sprayReach >= -10 && sprayReach < 125/);
  assert.match(source, /Math\.abs\(\(enemy\.top \+ e\.height \/ 2\) - \(playerTop \+ 38\)\) < 95/);
  assert.match(source, /now - lastSpray < 550/);
  assert.match(source, /prepareSpraySprite\(\)/);
  assert.match(source, /cleanSprayUrl = canvas\.toDataURL\('image\/png'\)/);
});

test('encounter is purely visual, fixed to viewport, and cleaned up', () => {
  assert.match(source, /position:fixed;inset:0;width:100%;height:100%;z-index:1499;pointer-events:none/);
  assert.match(source, /document\.body\.appendChild\(encounterCanvas\)/);
  assert.match(source, /clearEncounter\(\);\s*if \(host\) host\.remove\(\)/);
  assert.match(source, /encounterGeneration\+\+;/);
  assert.match(source, /if \(disposed \|\| generation !== encounterGeneration\) return/);
  assert.doesNotMatch(source, /awardXp|submitScore|leaderboard\.post|\/api\/scores/i);
  assert.match(source, /\^\\\/\(\?:games\|game\)/);
});
