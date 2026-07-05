import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const htmlPath = 'games/crystal-quest/index.html';
const bootPath = 'js/arcade/games/crystal-quest/bootstrap.js';
const fullscreenCssPath = 'css/game-fullscreen.css';
const packagePath = 'package.json';

const html = fs.readFileSync(path.join(root, htmlPath), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, bootPath), 'utf8');
const fullscreenCss = fs.readFileSync(path.join(root, fullscreenCssPath), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, packagePath), 'utf8'));
const combinedCrystalCss = html + '\n' + fullscreenCss;

assert.match(html, /id="crystalQuestEffectsLayer" class="cq-effects-layer" aria-hidden="true"/, 'Crystal Quest renders a scoped effects layer inside the game card');
assert.match(html, /<div class="game-card crystal-quest-card">[\s\S]*id="crystalPulseLayer"[\s\S]*id="crystalQuestEffectsLayer"[\s\S]*<div class="layer-top">/, 'effects layer is inside the Crystal Quest root and outside layout flow');
assert.match(combinedCrystalCss, /\.cq-effects-layer\{[^}]*position:absolute;[^}]*inset:0;[^}]*pointer-events:none;[^}]*overflow:hidden;[^}]*contain:layout paint size;[^}]*max-height:100%/, 'effects layer is absolutely contained and cannot create bottom overflow');
assert.match(combinedCrystalCss, /\.cq-effect\{[^}]*position:absolute/, 'individual effects are absolute rather than layout content');
assert.doesNotMatch(html, /id="crystalParticles"|class="crystal-particle"/, 'old floating particle layer is not reintroduced in Crystal Quest markup');
assert.match(combinedCrystalCss, /#crystalParticles,\.crystal-particle\{[^}]*display:none!important[^}]*overflow:hidden!important[^}]*max-height:0!important[^}]*animation:none!important/, 'legacy loose particle selectors remain disabled if stale markup appears');


assert.match(bootstrap, /var ROOT_TEMPORARY_EFFECT_CLASSES = \[([\s\S]*?'cq-effect-correct'[\s\S]*?'cq-effect-wrong'[\s\S]*?'cq-effect-skip'[\s\S]*?'cq-effect-vault-sealed'[\s\S]*?'cq-streak-surge'[\s\S]*?'cq-hud-flash'[\s\S]*?)\];/, 'root temporary effect class registry covers every root/card effect class');
assert.match(bootstrap, /var GRID_TEMPORARY_EFFECT_CLASSES = \['cq-grid-line-pulse'\];/, 'grid temporary effect class registry covers grid pulse classes');
assert.match(bootstrap, /var SAM_TEMPORARY_EFFECT_CLASSES = \['sam-warning-flicker'\];/, 'SAM temporary effect class registry covers warning flicker classes');
assert.match(bootstrap, /function removeTemporaryEffectClasses\(\) \{[\s\S]*rootEl\.classList\.remove\.apply\(rootEl\.classList, ROOT_TEMPORARY_EFFECT_CLASSES\)[\s\S]*signalGridPanel\.classList\.remove\.apply\(signalGridPanel\.classList, GRID_TEMPORARY_EFFECT_CLASSES\)[\s\S]*samRoot\.classList\.remove\.apply\(samRoot\.classList, SAM_TEMPORARY_EFFECT_CLASSES\)[\s\S]*samHead\.classList\.remove\.apply\(samHead\.classList, SAM_TEMPORARY_EFFECT_CLASSES\)/, 'cleanup helper removes temporary effect classes from root, grid, SAM panel, and SAM hardware');
assert.match(bootstrap, /function clearEffectTimers\(\) \{\r?\n\s*removeTemporaryEffectClasses\(\);[\s\S]*effectCleanupTimers\.forEach[\s\S]*window\.clearTimeout[\s\S]*effectCleanupTimers = \[\];\r?\n\s*removeTemporaryEffectClasses\(\);\r?\n\s*\}/, 'clearEffectTimers removes temporary classes before and after canceling timeouts');
assert.match(bootstrap, /async function startRun\(\) \{[\s\S]*clearEffectTimers\(\);/, 'new runs clear temporary effect classes so animations can restart');
assert.match(bootstrap, /function reset\(\) \{[\s\S]*clearEffectTimers\(\);/, 'reset clears temporary effect classes so animations can restart');
assert.match(bootstrap, /function destroy\(\) \{[\s\S]*clearEffectTimers\(\);/, 'destroy clears temporary effect classes and timers');

assert.match(bootstrap, /function triggerQuestEffect\(kind, options\)/, 'central Crystal Quest effect helper exists');
assert.match(bootstrap, /function setTransientSignalEffect\(type, index, duration\)/, 'transient signal-node helper exists');
assert.match(bootstrap, /triggerQuestEffect\('correct',[\s\S]*signal-node-secured-burst|signal-node-secured-burst[\s\S]*triggerQuestEffect\('correct'/, 'correct answer path triggers crystal burst node state');
assert.match(bootstrap, /triggerQuestEffect\('wrong',[\s\S]*signal-node-error-pulse|signal-node-error-pulse[\s\S]*triggerQuestEffect\('wrong'/, 'wrong answer path triggers red error pulse state');
assert.match(bootstrap, /triggerQuestEffect\('skip',[\s\S]*signal-node-bypass-crack|signal-node-bypass-crack[\s\S]*triggerQuestEffect\('skip'/, 'skip path triggers amber bypass crack state');
assert.match(bootstrap, /if \(streak === 3 \|\| streak === 5\) \{[\s\S]*triggerQuestEffect\('streak'/, 'streak 3 and 5 path triggers stronger surge');
assert.match(bootstrap, /run\.completed = true;[\s\S]*triggerQuestEffect\('vault'/, 'vault completion triggers final circuit-close effect');
assert.match(bootstrap, /playQuestSound\('correct'\)/, 'correct answer plays a bright crystal tone');
assert.match(bootstrap, /playQuestSound\('error'\)/, 'wrong answer plays an error tone');
assert.match(bootstrap, /playQuestSound\('skip'\)/, 'skip path plays a bypass tone');
assert.match(bootstrap, /playQuestSound\('complete'\)/, 'vault sealed path plays a completion tone');
assert.match(bootstrap, /var CRYSTAL_QUEST_GENERATED_TONES = \{[\s\S]*function playQuestSound\(soundId\)/, 'generated tone definitions are hoisted outside playQuestSound');
const playQuestSoundBody = bootstrap.match(/function playQuestSound\(soundId\) \{([\s\S]*?)\r?\n  \}/)?.[1] || '';
assert.doesNotMatch(playQuestSoundBody, /var generatedTones|kind: 'chord'|kind: 'tone'/, 'playQuestSound does not recreate generated tone definitions per call');
assert.match(playQuestSoundBody, /if \(isMuted\(\)\) return;[\s\S]*playSound\(soundId, CRYSTAL_QUEST_GENERATED_TONES\[soundId\]\)/, 'generated Web Audio tones obey existing mute state and arcade audio helper');

assert.match(combinedCrystalCss, /cqTerminalBreath/, 'terminal shell has subtle breathing animation');
assert.match(combinedCrystalCss, /cqBorderFlow/, 'terminal border has moving light animation');
assert.match(combinedCrystalCss, /cqSectionSweep/, 'mission grid or SAM hardware has slow scan sweep');
assert.match(combinedCrystalCss, /cqActiveNodeHum/, 'active signal node has hum/glow animation');
assert.match(combinedCrystalCss, /cqCrystalBurst/, 'correct answer crystal burst animation exists');
assert.match(combinedCrystalCss, /cqGlitchTear/, 'wrong answer glitch tear animation exists');
assert.match(combinedCrystalCss, /cqBypassArc/, 'skip bypass arc animation exists');
assert.match(combinedCrystalCss, /cqVaultNodeSequence/, 'vault sealed circuit sequence animation exists');
assert.match(combinedCrystalCss, /@media \(prefers-reduced-motion: reduce\)/, 'prefers-reduced-motion CSS exists for Crystal Quest effects');

assert.match(fullscreenCss, /#game-overlay \.crystal-quest-card \{[\s\S]*overflow: hidden !important;/, 'desktop fullscreen Crystal Quest card remains overflow-hidden');
assert.match(fullscreenCss, /#game-overlay \.crystal-quest-card \.layer-top \{[\s\S]*overflow: hidden !important;/, 'desktop fullscreen Crystal Quest layer remains overflow-hidden');

assert.match(bootstrap, /function syncQuestRun\(sessionData\)/, 'syncQuestRun remains present');
assert.match(bootstrap, /function finalizeCompletedRun\(\)/, 'finalizeCompletedRun remains present');
assert.match(bootstrap, /submitScore\(ArcadeSync\.getPlayer\(\), score, GAME_ID\)/, 'leaderboard submission contract remains present');
assert.match(bootstrap, /var MAX_SKIPS = 2;/, 'skip allowance constant remains unchanged');
assert.match(bootstrap, /var RUN_MIN = 5;/, 'run minimum length constant remains unchanged');
assert.match(bootstrap, /var RUN_MAX = 10;/, 'run maximum length constant remains unchanged');
assert.match(bootstrap, /var penalty = 50;/, 'skip penalty remains unchanged');
assert.match(bootstrap, /var streakBonus = Math\.max\(0, Math\.floor\(currentStreak\) \* 12\);/, 'streak score bonus formula remains unchanged');
assert.match(bootstrap, /return Math\.floor\(baseScore\) \+ streakBonus;/, 'base score plus streak bonus calculation remains unchanged');

assert.ok(packageJson.scripts['test:crystal-quest'], 'package.json exposes Crystal Quest focused regressions');
assert.match(packageJson.scripts['test:crystal-quest'], /node scripts\/crystal-quest-living-machine-effects\.test\.mjs/, 'Crystal Quest focused test script includes living-machine effects regression');
assert.ok(
  /npm run test:crystal-quest/.test(packageJson.scripts.test) ||
  /npm run ci:arcade/.test(packageJson.scripts.test),
  'npm test includes Crystal Quest focused regressions through direct or grouped arcade coverage',
);

console.log('crystal-quest-living-machine-effects: passed');
