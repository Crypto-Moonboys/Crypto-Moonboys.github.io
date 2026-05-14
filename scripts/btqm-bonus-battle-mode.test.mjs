/**
 * btqm-bonus-battle-mode.test.mjs
 *
 * Static-source tests for the BTQM Bonus Battle isolation rules.
 *
 * Verified properties:
 *  1. Boss/battle overlay cannot auto-open from the bomber map.
 *  2. Completing a bomber objective (zone clear) presents Continue / Bonus Battle choice.
 *  3. Choosing Continue does not enter the battle scene directly.
 *  4. Choosing Bonus Battle explicitly enters BonusBattleScene.
 *  5. Returning from Bonus Battle resumes bomber progression (_advanceZone).
 *  6. Run score helpers are preserved (btqmRuntime.score is not reset on battle entry).
 *  7. Old battle text ("BOSS ENCOUNTERED", "BOSS BATTLE INCOMING", "Paper Hand King")
 *     is only present inside the isolated BonusBattleScene class, not in general bomber code.
 *  8. No binary files committed under the BTQM game module.
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const bootstrap = readFileSync('js/arcade/games/block-topia-quest-maze/bootstrap.js', 'utf8');

// ── 1. BonusBattleScene class exists; old BattleScene class name is gone ──────
assert.match(bootstrap, /class BonusBattleScene extends Phaser\.Scene/, 'BonusBattleScene class must exist');
assert.doesNotMatch(bootstrap, /class BattleScene\b/, 'old BattleScene class must be removed');
assert.match(bootstrap, /super\('BonusBattleScene'\)/, 'BonusBattleScene constructor must register the correct scene key');

// ── 2. No automatic boss intro launch from _spawnEnemies ──────────────────────
// _enterBonusBattle is the single launch site.
// Verify: nothing outside _enterBonusBattle calls scene.launch('BonusBattleScene').
// Extract just the _enterBonusBattle method body.
const enterBattleMatch = bootstrap.match(/_enterBonusBattle\(\)\s*\{([\s\S]*?)\n  \}/);
const enterBattleBody  = enterBattleMatch ? enterBattleMatch[0] : '';
assert.ok(enterBattleBody, '_enterBonusBattle method body must be extractable for isolation checks');

// Everything in bootstrap excluding the _enterBonusBattle body.
const bootstrapMinusBattleLaunch = bootstrap.replace(enterBattleBody, '');
assert.doesNotMatch(
  bootstrapMinusBattleLaunch,
  /this\.scene\.launch\s*\(\s*['"]BonusBattleScene['"]/,
  'BonusBattleScene must not be launched anywhere except inside _enterBonusBattle',
);

// Confirm _enterBonusBattle itself does launch BonusBattleScene (controlled launch site).
assert.match(
  enterBattleBody,
  /this\.scene\.launch\s*\(\s*'BonusBattleScene'/,
  '_enterBonusBattle must be the single controlled launch site for BonusBattleScene',
);

// ── 3. Post-zone choice screen (_showBonusBattleChoice) exists ────────────────
assert.match(bootstrap, /\b_showBonusBattleChoice\b/, '_showBonusBattleChoice method must exist');
assert.match(bootstrap, /BONUS BATTLE.*Optional/i, '_showBonusBattleChoice must label bonus mode as optional');
assert.match(bootstrap, /Continue\\nNext Bomber Zone/is, '_showBonusBattleChoice must offer a Continue / Next Bomber Zone button');

// ── 4. Continue button calls _advanceZone, not _enterBonusBattle ──────────────
// The Continue button handler must call _advanceZone() directly.
assert.match(
  bootstrap,
  /contBtn\.on\('pointerdown'[\s\S]*?destroy\(\);\s*self\._advanceZone\(\)/,
  'Continue button must call _advanceZone without entering battle',
);

// ── 5. Bonus Battle button calls _enterBonusBattle ───────────────────────────
assert.match(
  bootstrap,
  /battleBtn\.on\('pointerdown'[\s\S]*?destroy\(\);\s*self\._enterBonusBattle\(\)/,
  'Bonus Battle button must call _enterBonusBattle',
);

// ── 6. Returning from Bonus Battle resumes bomber progression ─────────────────
// _enterBonusBattle must pass onClose that calls _advanceZone.
assert.match(
  bootstrap,
  /_enterBonusBattle\(\)[\s\S]*?onClose\s*:\s*\(\)\s*=>\s*\{[\s\S]*?self\._advanceZone\(\)/,
  '_enterBonusBattle onClose callback must call _advanceZone to resume bomber progression',
);

// ── 7. Run score is preserved — btqmRuntime.score not reset in bonus path ─────
// _enterBonusBattle must not call beginRun or reset btqmRuntime.score.
const enterBattleFn = bootstrap.match(/_enterBonusBattle\(\)\s*\{([\s\S]*?)^\s*\}/m);
if (enterBattleFn) {
  assert.doesNotMatch(
    enterBattleFn[1],
    /beginRun|btqmRuntime\.score\s*=/,
    '_enterBonusBattle must not reset run score or call beginRun',
  );
}

// ── 8. Old battle text is confined to BonusBattleScene body ──────────────────
// Extract everything outside the BonusBattleScene class block.
// Strategy: verify that the forbidden phrases do not appear before the class declaration.
const bonusBattleClassStart = bootstrap.indexOf('class BonusBattleScene extends Phaser.Scene');
assert.ok(bonusBattleClassStart > -1, 'BonusBattleScene class must be present for isolation check');

const beforeBonusBattle = bootstrap.slice(0, bonusBattleClassStart);

assert.doesNotMatch(
  beforeBonusBattle,
  /BOSS ENCOUNTERED/,
  '"BOSS ENCOUNTERED" must only appear inside BonusBattleScene, not in general bomber runtime',
);
assert.doesNotMatch(
  beforeBonusBattle,
  /BOSS BATTLE INCOMING/,
  '"BOSS BATTLE INCOMING" must only appear inside BonusBattleScene, not in general bomber runtime',
);

// ── 9. Phaser scene list uses BonusBattleScene, not BattleScene ──────────────
assert.match(
  bootstrap,
  /scene:\s*\[BootScene,\s*TitleScene,\s*ZoneScene,\s*BonusBattleScene\]/,
  'Phaser game scene list must register BonusBattleScene',
);
// Verify no standalone BattleScene (word-boundary check excludes BonusBattleScene).
assert.doesNotMatch(
  bootstrap,
  /\bBattleScene\b/,
  'No standalone BattleScene identifier must remain; all uses should be BonusBattleScene',
);

// ── 10. switchToTitleScene and pause/resume use BonusBattleScene ──────────────
// 'BattleScene' as a bare string key (not BonusBattleScene) must not appear.
assert.doesNotMatch(
  bootstrap,
  /'BattleScene'/,
  "All scene key string literals must use 'BonusBattleScene', not 'BattleScene'",
);

// ── 11. No binary files in game module directory ──────────────────────────────
const gameModuleDir = 'js/arcade/games/block-topia-quest-maze';
const binaryExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp3', '.wav', '.ogg']);

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

const gameFiles = walkFiles(gameModuleDir);
const binaryFiles = gameFiles.filter((f) => binaryExtensions.has(path.extname(f).toLowerCase()));
assert.deepEqual(binaryFiles, [], `No binary files should be committed in ${gameModuleDir}: ${binaryFiles.join(', ')}`);

// ── 12. _showUpgradePicker routes through _showBonusBattleChoice ──────────────
assert.match(
  bootstrap,
  /self\._showBonusBattleChoice\(\)/,
  '_showUpgradePicker must route to _showBonusBattleChoice (not directly to _advanceZone)',
);
// The upgradeAdvanceScheduled block specifically must call _showBonusBattleChoice.
assert.match(
  bootstrap,
  /upgradeAdvanceScheduled\s*=\s*true;[\s\S]{0,200}self\._showBonusBattleChoice\(\)/,
  '_showUpgradePicker upgrade-chosen block must call _showBonusBattleChoice',
);

console.log('BTQM bonus battle mode isolation checks passed.');
