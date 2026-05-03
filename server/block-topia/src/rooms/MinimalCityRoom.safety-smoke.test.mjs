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
must(/safeParseJsonArray\(player\.upgradeChoicesJson\)/, 'Server should validate upgrade against offered choices.');
must(/_applyUpgrade\(\s*player\s*,\s*upgradeId\s*\)/, 'Server should apply validated upgrade IDs.');

must(/if\s*\(\s*!player\s*\|\|\s*!player\.ready\s*\)\s*return/, 'Move should be blocked until player is ready.');
must(/if\s*\(\s*!player\s*\|\|\s*!player\.ready\s*\|\|\s*player\.hp\s*<=\s*0\s*\)\s*return/, 'Attack should require ready and alive player.');
must(/if\s*\(\s*this\.state\.worldPhase\s*!==\s*PHASE_EVENT_ACTIVE\s*\)\s*return/, 'Combat should stay phase gated to EVENT_ACTIVE.');
must(/if\s*\(\s*!target\?\.ready\s*\)\s*return/, 'NPC damage should ignore not-ready players.');
must(/if\s*\(\s*this\.completedSessions\.has\s*\(\s*target\?\.id\s*\)\s*\)\s*return/, 'Completed players should not take NPC contact damage.');
must(/target\.hp\s*=\s*Math\.max\s*\(\s*0\s*,\s*target\.hp\s*-\s*reducedDamage\s*\)/, 'NPC contact damage should clamp hp.');
must(/if\s*\(\s*target\.secondWindAvailable\s*&&\s*!target\.secondWindUsed\s*\)/, 'Second wind single-revive guard should exist.');
must(/if\s*\(\s*this\.state\.players\.length\s*===\s*0\s*\)\s*return/, 'Phase ticker should not progress when room is empty.');
must(/this\.state\.eventLevel\s*\+=\s*1/, 'Event level progression should exist.');
must(/this\._setPhase\(\s*PHASE_MISSION_COMPLETE\s*\)/, 'Mission complete phase transition should exist.');
must(/this\._setPhase\(\s*PHASE_FREE_ROAM\s*\)/, 'Run should return to free roam between levels.');
must(/this\.state\.eventObjectiveType\s*=\s*this\.state\.eventLevel\s*%\s*2\s*===\s*0\s*\?\s*OBJECTIVE_SIGNAL_HACK\s*:\s*OBJECTIVE_PATROL_SWEEP/, 'Objective variety should rotate by level.');
must(/_findRandomPassableTileAwayFromPlayers\(\s*NPC_RESPAWN_MIN_DISTANCE\s*\)/, 'NPC respawn should avoid spawning near players.');
must(/const\s+nearExtraction\s*=.+EXTRACTION_SAFE_DISTANCE/, 'NPC respawn should avoid extraction area in recovery/complete.');
must(/if\s*\(\s*scheduledGeneration\s*!==\s*this\.runGeneration\s*\)\s*return/, 'Respawn callbacks should ignore stale generations.');

if (/\.leave\s*\(\s*['"`]/.test(source)) {
  throw new Error('Invalid string-only .leave(...) usage detected.');
}
if (/\.close\s*\(\s*['"`]/.test(source)) {
  throw new Error('Invalid string-only .close(...) usage detected.');
}

console.log('MinimalCityRoom safety smoke checks passed.');
