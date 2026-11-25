import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const source = readFileSync(new URL('../js/arcade/systems/cross-game-modifier-ui.js', import.meta.url), 'utf8');
const stub = 'export const MODIFIER_DEFS=[]; export function getUnlockedModifiers(){return []} export function getActiveModifier(){} export function setActiveModifier(){} export function clearActiveModifier(){} export function getModifierDef(){}';
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source.replace("'/js/arcade/systems/cross-game-modifier-system.js'", JSON.stringify('data:text/javascript;base64,' + Buffer.from(stub).toString('base64')))).toString('base64');
const { supportedModifierIds } = await import(moduleUrl);
test('explicit adapter support and route aliases', () => {
  for (const [a,b,count] of [['meme-swarm-3008','invaders-3008',7],['chain-maze','pac-chain',3],['forkfield','asteroid-fork',4],['bullrun-brick-smash','breakout-bullrun',6],['block-topia-dropzone','tetris-block-topia',4]]) {
    const ids = supportedModifierIds('/games/' + a + '/');
    assert.equal(ids.length,count);
    assert.deepEqual(ids,supportedModifierIds('/games/' + b + '/index.html'));
    assert.ok(!ids.includes('risk_bonus'));
  }
  assert.deepEqual(supportedModifierIds('/games/snake-run/'), ['score_surge','shielded_start','slow_chaos']);
  for (const name of ['nbg-london','nbg-london-run','kaiju-sticker-battle','block-topia-quest-maze','unknown']) assert.deepEqual(supportedModifierIds('/games/'+name+'/'),[]);
});
test('panel disables unsupported and locked modifiers, and shell has bounded fallback', () => {
  assert.match(source,/if \(!isSupported \|\| !isUnlocked\) html \+= ' disabled'/);
  assert.match(source,/Not supported here/);
  assert.match(source,/!supported\.has\(id\)/);
  const shell=readFileSync(new URL('../js/game-fullscreen.js',import.meta.url),'utf8');
  assert.match(shell,/Modifier cards unavailable/);
  assert.match(shell,/clearTimeout\(modifierPanelTimer\)/);
});
