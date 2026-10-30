import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('js/moonpet-mini-app.js', 'utf8');
const start = source.indexOf('// TEST-EXPORT: drawWorld:start');
const end = source.indexOf('// TEST-EXPORT: drawWorld:end', start);
assert.ok(start >= 0 && end > start, 'Home canvas draw contract must exist');
const drawWorld = source.slice(start, end);
assert.match(drawWorld, /state\.lifecycle && state\.lifecycle\.phase === 'egg' \? 'main' : home\.room/,
  'Stage 0 eggs keep their main Secret Bot chamber');
assert.match(drawWorld, /var musicActive = radioRequestedOn;/,
  'Radio art depends only on the radio request, regardless of egg stage or pet level');
assert.doesNotMatch(drawWorld, /musicActive\s*=\s*radioRequestedOn\s*&&/,
  'No egg, level, hatch or room gate may suppress radio visuals');
assert.match(drawWorld, /if \(musicActive\) \{ drawMusicStereo\(renderTime\); drawRadioDiscoBall\(renderTime\); \}/,
  'Both animated radio overlays render when requested');
assert.match(drawWorld, /home\.right_overlay = musicActive \? 'stereo' : null/,
  'Radio off removes the stereo overlay');
assert.ok(drawWorld.indexOf('items.forEach(') < drawWorld.indexOf('if (musicActive)'),
  'Radio overlays draw after existing furniture');
console.log('Level 1 egg radio overlay contract passed.');
