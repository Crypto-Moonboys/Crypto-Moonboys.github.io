import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../js/nbg-roamer.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../js/site-shell.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../game/assets/player/nbg-runner-animation-manifest.json', import.meta.url), 'utf8'));
function boot(path) {
  const timers = [];
  const listeners = {};
  const context = {
    location: { pathname: path },
    window: { addEventListener: (n, f) => { listeners[n] = f; }, matchMedia: () => ({ matches: false }) },
    document: { readyState: 'loading', addEventListener: (n, f) => { listeners[n] = f; } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {}, cancelAnimationFrame: () => {},
    Math,
  };
  context.window.window = context.window;
  runInNewContext(source, context);
  return { timers, listeners, context };
}
test('games and original game routes never boot the roaming character', () => {
  for (const path of ['/games/', '/games/nbg-london/', '/games/leaderboard.html', '/game/play.html']) {
    const { timers, context } = boot(path);
    assert.equal(timers.length, 0, path);
    assert.equal(context.window.__NBG_ROAMER_BOOTED__, undefined);
  }
});
test('normal pages schedule one randomized 3–7 minute appearance, with safe input listeners', () => {
  const { timers, listeners, context } = boot('/wiki/graffiti-kings.html');
  assert.equal(context.window.__NBG_ROAMER_BOOTED__, true);
  assert.equal(timers.length, 1);
  assert.ok(timers[0].ms >= 180000 && timers[0].ms <= 420000);
  assert.equal(typeof listeners.keydown, 'function');
  const event = { code: 'ArrowDown', target: { closest: () => null }, preventDefault: () => { throw Error('stole scroll before activation'); } };
  listeners.keydown(event);
});
test('reduced motion opts out and duplicate boot never schedules twice', () => {
  const { context, timers } = boot('/');
  runInNewContext(source, context);
  assert.equal(timers.length, 1);
  const reduced = boot('/');
  reduced.context.window.__NBG_ROAMER_BOOTED__ = false;
  reduced.context.window.matchMedia = () => ({ matches: true });
  reduced.timers.length = 0;
  runInNewContext(source, reduced.context);
  assert.equal(reduced.timers.length, 0);
});
test('uses the existing animation assets, not a copy of the game engine', () => {
  for (const animation of ['idle', 'run', 'jump', 'fall', 'crouchLeft', 'crouchRight']) {
    assert.ok(manifest.animations[animation]?.spriteSheet, animation);
  }
  assert.match(source, /nbg-runner-animation-manifest\.json/);
  assert.match(source, /position:fixed/);
  assert.match(source, /CONTROL_MS = 30000/);
  assert.doesNotMatch(source, /leaderboard|submitScore|awardXp|game\/nbg-level1\.js/i);
  assert.match(shell, /runner\.src = '\/js\/nbg-roamer\.js'/);
  assert.match(shell, /pathname\.startsWith\('\/games\/'\)/);
  assert.match(shell, /pathname\.startsWith\('\/game\/'\)/);
});

test('mirroring composes after viewport translation, preserving left movement', () => {
  assert.match(source, /translate3d\('\s*\+\s*x[\s\S]*?scaleX\('/);
  assert.doesNotMatch(source, /sprite\.style\.scale\s*=/);
});
test('pagehide clears controls and pageshow resumes fresh schedule after bfcache restore', () => {
  assert.match(source, /addEventListener\('pagehide',[\s\S]*?disposed = true;[\s\S]*?stop\(\)/);
  assert.match(source, /addEventListener\('pageshow',[\s\S]*?event\.persisted && disposed[\s\S]*?schedule\(\)/);
  assert.match(source, /active = false; controlling = false; moving = false; held\.clear\(\)/);
});

test('summon button is fixed at bottom-right, keyboard accessible and excluded from game routes', () => {
  assert.match(source, /#nbg-roamer-summon \{position:fixed;right:12px;bottom:/);
  assert.match(source, /summonButton\.type = 'button'/);
  assert.match(source, /aria-label', 'Summon NBG London runner'/);
  assert.match(source, /document\.addEventListener\('DOMContentLoaded', ensureSummonButton/);
  assert.match(source, /if \(active \|\| spawning \|\| disposed/);
});
test('manual appearance uses existing spawn, retains random cadence and enforces 60s cooldown', () => {
  assert.match(source, /SUMMON_COOLDOWN_MS = 60000/);
  assert.match(source, /void spawn\(true\)/);
  assert.match(source, /if \(manual\) startSummonCooldown\(\)/);
  assert.match(source, /clearTimeout\(timer\);\s*makeUI\(\)/);
  assert.match(source, /summonButton\.hidden = active/);
  assert.match(source, /SUMMON_COOLDOWN_MS - \(performance\.now\(\) - lastSummon\)/);
  assert.match(source, /if \(performance\.now\(\) - lastSummon >= SUMMON_COOLDOWN_MS\)/);
});
test('summon UI is removed on pagehide and re-created when bfcache restores a page', () => {
  assert.match(source, /clearInterval\(summonCooldownTimer\);[\s\S]*?summonButton\?\.remove\(\)/);
  assert.match(source, /if \(event\.persisted && disposed\) \{ disposed = false; ensureSummonButton\(\); schedule\(\); \}/);
});
