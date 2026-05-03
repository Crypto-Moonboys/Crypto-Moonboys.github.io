import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const roomPath = path.resolve(here, './MinimalCityRoom.js');
const source = await fs.readFile(roomPath, 'utf8');

function must(pattern, message) {
  assert.ok(pattern.test(source), message);
}

must(/const\s+FREE_ROAM_MS\s*=\s*60_000;\s*\/\/\s*Dev timing\./, 'FREE_ROAM dev timing constant should exist.');
must(/const\s+WARNING_MS\s*=\s*10_000/, 'WARNING constant should exist.');
must(/const\s+EVENT_MS\s*=\s*90_000/, 'EVENT constant should exist.');
must(/const\s+RECOVERY_MS\s*=\s*30_000;\s*\/\/\s*Dev timing\./, 'RECOVERY dev timing constant should exist.');
must(/const\s+OBJECTIVE_PATROL_SWEEP\s*=\s*'PATROL_SWEEP'/, 'Patrol objective constant should exist.');
must(/const\s+OBJECTIVE_SIGNAL_HACK\s*=\s*'SIGNAL_HACK'/, 'Signal hack objective constant should exist.');
must(/const\s+UPGRADE_POOL\s*=\s*\[/, 'Upgrade pool should exist.');
must(/this\.onMessage\(\s*'chooseUpgrade'/, 'Server should accept chooseUpgrade intent.');
must(/if\s*\(\s*this\.state\.worldPhase\s*!==\s*PHASE_RECOVERY\s*\)\s*return/, 'chooseUpgrade should only be accepted during RECOVERY where choices are generated.');
must(/safeParseJsonArray\(player\.upgradeChoicesJson\)/, 'Server should validate upgrade against offered choices.');
must(/_applyUpgrade\(\s*player\s*,\s*upgradeId\s*\)/, 'Server should apply validated upgrade IDs.');
must(/_scannerTargetBonus\(\)\s*{/, 'Scanner bonus helper should exist.');
must(/this\.state\.objectiveTarget\s*=\s*Math\.max\(\s*1\s*,\s*this\._scaledKillTarget\(\)\s*-\s*scannerBonus\s*\)/, 'Scanner should reduce patrol objective target in real completion logic.');
must(/this\.state\.hackProgressTarget\s*=\s*Math\.max\(\s*10\s*,\s*baseHackTarget\s*-\s*\(scannerBonus\s*\*\s*6\)\s*\)/, 'Scanner should reduce signal hack target in real completion logic.');

must(/if\s*\(\s*!player\s*\|\|\s*!player\.ready\s*\)\s*return/, 'Move should be blocked until player is ready.');
must(/if\s*\(\s*!player\s*\|\|\s*!player\.ready\s*\|\|\s*player\.hp\s*<=\s*0\s*\)\s*return/, 'Attack should require ready and alive player.');
must(/if\s*\(\s*this\.state\.worldPhase\s*!==\s*PHASE_EVENT_ACTIVE\s*\)\s*return/, 'Combat should stay phase gated to EVENT_ACTIVE.');
must(/if\s*\(\s*!target\?\.ready\s*\)\s*return/, 'NPC damage should ignore not-ready players.');
must(/if\s*\(\s*this\.completedSessions\.has\s*\(\s*target\?\.id\s*\)\s*\)\s*return/, 'Completed players should not take NPC contact damage.');
must(/target\.hp\s*=\s*Math\.max\s*\(\s*0\s*,\s*target\.hp\s*-\s*reducedDamage\s*\)/, 'NPC contact damage should clamp hp.');
must(/if\s*\(\s*target\.secondWindAvailable\s*&&\s*!target\.secondWindUsed\s*\)/, 'Second wind single-revive guard should exist.');
must(/if\s*\(\s*this\.state\.players\.length\s*===\s*0\s*\)\s*return/, 'Phase ticker should not progress when room is empty.');
must(/else\s+if\s*\(\s*this\.state\.worldPhase\s*===\s*PHASE_EVENT_ACTIVE\s*\)\s*{[\s\S]*if\s*\(\s*this\._isObjectiveComplete\(\)\s*\)\s*this\._setPhase\(\s*PHASE_MISSION_COMPLETE\s*\);[\s\S]*else\s*this\._setPhase\(\s*PHASE_RECOVERY\s*\);/, 'EVENT_ACTIVE phase transition should explicitly branch objective-complete vs timeout recovery.');
must(/this\.state\.eventLevel\s*\+=\s*1/, 'Event level progression should exist.');
must(/_advanceToNextLevel\(\)\s*{[\s\S]*this\.completedSessions\.clear\(\)/, 'Advancing level should clear completed sessions.');
must(/_advanceToNextLevel\(\)\s*{[\s\S]*this\.state\.objectiveProgress\s*=\s*0/, 'Advancing level should reset objective progress.');
must(/_advanceToNextLevel\(\)\s*{[\s\S]*this\.spawnProtectedUntilBySession\.set\(player\.id,\s*now\s*\+\s*SPAWN_GRACE_MS\)/, 'Advancing level should reapply spawn grace.');
must(/_advanceToNextLevel\(\)\s*{[\s\S]*this\.runGeneration\s*\+=\s*1/, 'Advancing level should increment generation for stale timeout invalidation.');
must(/_advanceToNextLevel\(\)\s*{[\s\S]*this\.pendingRespawnByNpcId\.clear\(\)/, 'Advancing level should clear pending NPC respawn guards.');
must(/this\._setPhase\(\s*PHASE_MISSION_COMPLETE\s*\)/, 'Mission complete phase transition should exist.');
must(/this\._setPhase\(\s*PHASE_FREE_ROAM\s*\)/, 'Run should return to free roam between levels.');
must(/this\.state\.eventObjectiveType\s*=\s*this\.state\.eventLevel\s*%\s*2\s*===\s*0\s*\?\s*OBJECTIVE_SIGNAL_HACK\s*:\s*OBJECTIVE_PATROL_SWEEP/, 'Objective variety should rotate by level.');
must(/_findRandomPassableTileAwayFromPlayers\(\s*NPC_RESPAWN_MIN_DISTANCE\s*\)/, 'NPC respawn should avoid spawning near players.');
must(/const\s+nearExtraction\s*=.+EXTRACTION_SAFE_DISTANCE/, 'NPC respawn should avoid extraction area in recovery/complete.');
must(/if\s*\(\s*scheduledGeneration\s*!==\s*this\.runGeneration\s*\)\s*return/, 'Respawn callbacks should ignore stale generations.');
must(/const\s+ex\s*=\s*Number\(this\.state\.extractionX\)/, 'Extraction validation should read authoritative extractionX.');
must(/const\s+ey\s*=\s*Number\(this\.state\.extractionY\)/, 'Extraction validation should read authoritative extractionY.');
must(/return\s+x\s*===\s*ex\s*&&\s*y\s*===\s*ey/, 'Extraction validation should match player tile against authoritative extraction coordinates.');

if (/\.leave\s*\(\s*['"`]/.test(source)) {
  throw new Error('Invalid string-only .leave(...) usage detected.');
}
if (/\.close\s*\(\s*['"`]/.test(source)) {
  throw new Error('Invalid string-only .close(...) usage detected.');
}

console.log('MinimalCityRoom safety smoke checks passed.');
