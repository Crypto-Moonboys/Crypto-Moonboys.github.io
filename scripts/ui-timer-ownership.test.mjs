import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];

function ok(name, pass) {
  checks.push({ name, pass: !!pass });
}

const arcadeMetaUi = read('js/arcade-meta-ui.js');
const factionGrid = read('js/ui/faction-grid.js');
const seasonCycle = read('js/factions/season-cycle.js');
const xpUi = read('js/xp/xp-ui.js');
const hasBareInterval = (source, call) => {
  const escaped = String(call)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s*');
  return new RegExp(`(^|\\n)\\s*${escaped}\\s*;`).test(source);
};

ok('arcade meta HUD owns one refresh timer',
  arcadeMetaUi.includes('let hudTimer = null') &&
  arcadeMetaUi.includes('function startHudTimer()') &&
  arcadeMetaUi.includes('if (hudTimer || document.hidden) return') &&
  arcadeMetaUi.includes('function stopHudTimer()') &&
  !hasBareInterval(arcadeMetaUi, 'setInterval(updateHud, 500)'));

ok('arcade meta survival ticks stop on run end',
  arcadeMetaUi.includes('function stopSurvivalTicks()') &&
  arcadeMetaUi.includes('clearInterval(survivalTimer)') &&
  arcadeMetaUi.includes('stopSurvivalTicks();'));

ok('faction grid cannot start duplicate render intervals',
  factionGrid.includes('let renderTimer = null') &&
  factionGrid.includes('let initialized = false') &&
  factionGrid.includes('if (initialized) return') &&
  factionGrid.includes('if (renderTimer || document.hidden) return') &&
  !hasBareInterval(factionGrid, 'setInterval(render, 3000)'));

ok('faction grid avoids unchanged DOM rewrites',
  factionGrid.includes('let lastMarkup =') &&
  factionGrid.includes('if (markup !== lastMarkup)') &&
  factionGrid.includes('host.innerHTML = markup'));

ok('season cycle init is single-owner and stoppable for tests',
  seasonCycle.includes('let timer = null') &&
  seasonCycle.includes('let initialized = false') &&
  seasonCycle.includes('if (initialized) return') &&
  seasonCycle.includes('timer = setInterval(tick, 60000)') &&
  seasonCycle.includes('stop()'));

ok('XP HUD owns one refresh timer and avoids redundant HTML writes',
  xpUi.includes('let renderTimer = null') &&
  xpUi.includes('let initialized = false') &&
  xpUi.includes('if (initialized) return') &&
  xpUi.includes('if (renderTimer || document.hidden) return') &&
  xpUi.includes('el.textContent = `XP: ${xp}`') &&
  !hasBareInterval(xpUi, 'setInterval(render, 1000)') &&
  !xpUi.includes('el.innerHTML = `XP: ${xp}`'));

let failed = 0;
for (const check of checks) {
  if (check.pass) {
    console.log(`PASS: ${check.name}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${check.name}`);
  }
}

if (failed) {
  console.error(`\nui-timer-ownership.test: ${checks.length - failed} passed, ${failed} failed`);
  process.exit(1);
}

console.log(`\nui-timer-ownership.test: ${checks.length} passed, 0 failed`);
