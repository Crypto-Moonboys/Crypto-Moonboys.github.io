import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../js/nbg-roamer.js', import.meta.url), 'utf8');
const wikiCss = readFileSync(new URL('../css/wiki.css', import.meta.url), 'utf8');
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
  assert.match(source, /if \(event\.persisted && disposed\) \{[\s\S]*?ensureSummonButton\(\);[\s\S]*?schedule\(\);/);
});

test('bfcache restoration resumes remaining summon cooldown without resetting its origin', () => {
  assert.match(source, /function startSummonCooldown\(resetStart = true\)/);
  assert.match(source, /if \(resetStart\) lastSummon = performance\.now\(\)/);
  assert.match(source, /if \(performance\.now\(\) - lastSummon < SUMMON_COOLDOWN_MS\) startSummonCooldown\(false\)/);
  assert.match(source, /setInterval\(\(\) => \{[\s\S]*?updateSummonButton\(\)/);
});

test('Space activates the runner only when idle and reaches gameplay while controlling', () => {
  assert.match(source, /event\.key === 'Enter' \|\| \(event\.key === ' ' && !controlling\)/);
  assert.match(source, /sprite\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /held\.has\('Space'\)/);
  assert.match(source, /sprite\?\.contains\(event\.target\)/);
});
test('Space is ignored outside active control and never hijacks text inputs', () => {
  const { listeners } = boot('/wiki/crypto-moonboys.html');
  for (const target of [
    { closest: () => null },
    { closest: () => ({ tagName: 'INPUT' }) }
  ]) {
    let prevented = false;
    listeners.keydown({ code: 'Space', key: ' ', target, preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
  }
  assert.match(source, /interactive\(event\.target\) && !sprite\?\.contains\(event\.target\)/);
});

test('keyboard control begins with arrow or Space on a visible runner, not just a click', () => {
  assert.match(source, /if \(!controlling\) \{[\s\S]*?takeControl\(\)/);
  assert.match(source, /held\.add\(event\.code\);\s*event\.preventDefault\(\)/);
  assert.match(source, /capture: true, passive: false/);
  assert.match(source, /if \(controlling && performance\.now\(\) >= deadline\) return/);
});
test('navigation and form focus keep normal keyboard behaviour', () => {
  assert.match(source, /interactive\(event\.target\) && !runnerTarget && !hiddenSummonTarget/);
  assert.match(source, /if \(event\.repeat\) return/);
  assert.match(source, /document\.hidden \|\| event\.defaultPrevented/);
  assert.match(source, /event\.altKey \|\| event\.ctrlKey \|\| event\.metaKey/);
});

test('summon sits above Back to Top with a visible gap on desktop and mobile', () => {
  const summonBottom = Number(source.match(/#nbg-roamer-summon \{position:fixed;right:\d+px;bottom:calc\((\d+)px/)[1]);
  const topRule = wikiCss.match(/#back-to-top \{([^}]+)\}/)[1];
  const topBottom = Number(topRule.match(/bottom:\s*(\d+)px/)[1]);
  const topHeight = Number(topRule.match(/height:\s*(\d+)px/)[1]);
  assert.ok(summonBottom >= topBottom + topHeight + 12, 'Summon must clear Back to Top by at least 12px');
  assert.match(source, /bottom:calc\(78px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(wikiCss, /#back-to-top\.visible/);
});
