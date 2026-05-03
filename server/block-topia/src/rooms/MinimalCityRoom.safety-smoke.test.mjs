import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const roomPath = path.resolve(here, './MinimalCityRoom.js');
const source = await fs.readFile(roomPath, 'utf8');

function assertSource(pattern, message) {
  assert.ok(pattern.test(source), message);
}

assertSource(/const\s+NPC_COUNT\s*=\s*14/, 'NPC count must stay bounded at 14.');
assertSource(/const\s+ATTACK_COOLDOWN_MS\s*=\s*750/, 'Attack cooldown constant must exist.');
assertSource(/const\s+ATTACK_DAMAGE\s*=\s*20/, 'Player attack damage should be reduced for pacing.');
assertSource(/const\s+SPAWN_GRACE_MS\s*=\s*4000/, 'Spawn grace constant must exist.');
assertSource(/const\s+NPC_ATTACK_COOLDOWN_MS\s*=\s*1200/, 'NPC attack cooldown constant must exist.');
assertSource(/const\s+NPC_MAX_HP\s*=\s*60/, 'NPC max HP should be tuned for pacing.');
assertSource(/const\s+NPC_RESPAWN_DELAY_MS\s*=\s*6500/, 'NPC respawn delay constant must exist.');
assertSource(/const\s+MISSION_SURVIVE_MS\s*=\s*60000/, 'Mission survival requirement constant must exist.');
assertSource(/const\s+MISSION_REQUIRED_KILLS\s*=\s*5/, 'Mission kill requirement constant must exist.');
assertSource(/ready:\s*'boolean'/, 'Player schema should include ready state.');
assertSource(/if\s*\(\s*!player\s*\|\|\s*!player\.ready\s*\|\|\s*player\.hp\s*<=\s*0\s*\)\s*return/, 'Dead/missing/not-ready attacker guard must exist.');
assertSource(/if\s*\(\s*!player\s*\|\|\s*!player\.ready\s*\)\s*return/, 'Movement should be blocked until ready.');
assertSource(/if\s*\(\s*!player\s*\|\|\s*!player\.ready\s*\|\|\s*player\.hp\s*<=\s*0\s*\)\s*return/, 'Attack should be blocked until ready.');
assertSource(/if\s*\(\s*now\s*-\s*lastAttackAt\s*<\s*ATTACK_COOLDOWN_MS\s*\)\s*return/, 'Attack cooldown guard must exist.');
assertSource(/const\s+target\s*=\s*this\._findNearestNpc\s*\(\s*player\s*,\s*ATTACK_RANGE\s*\)/, 'Attack target must be server-resolved in range.');
assertSource(/if\s*\(\s*!target\s*\)\s*return/, 'Missing/out-of-range target must be ignored safely.');
assertSource(/target\.hp\s*=\s*Math\.max\s*\(\s*0\s*,\s*target\.hp\s*-\s*ATTACK_DAMAGE\s*\)/, 'Target hp must be clamped.');
assertSource(/if\s*\(\s*this\.completedSessions\.has\s*\(\s*client\.sessionId\s*\)\s*\)\s*return/, 'Completed players must not attack after extraction.');
assertSource(/this\.onMessage\s*\(\s*'extract'\s*,\s*\(\s*client\s*\)\s*=>/, 'Server should handle extract completion message.');
assertSource(/this\.onMessage\s*\(\s*'ready'\s*,\s*\(\s*client\s*\)\s*=>/, 'Server should handle ready/start signal.');
assertSource(/this\.onMessage\s*\(\s*'startRun'\s*,\s*\(\s*client\s*\)\s*=>/, 'Server should support startRun alias.');
assertSource(/if\s*\(\s*!this\._canExtractPlayer\s*\(\s*client\.sessionId\s*,\s*player\s*\)\s*\)\s*return/, 'Extract should require server-side completion validation.');
assertSource(/this\.completedSessions\.add\s*\(\s*client\.sessionId\s*\)/, 'Extract completion should mark session as completed.');
assertSource(/for\s*\(\s*const\s+npc\s+of\s+this\.state\.npcs\s*\)\s*{[\s\S]*if\s*\(\s*!npc\s*\|\|\s*npc\.hp\s*<=\s*0\s*\)\s*continue/, 'Dead NPCs must not be selected as attack targets.');
assertSource(/if\s*\(\s*!Number\.isFinite\s*\(\s*nextX\s*\)\s*\|\|\s*!Number\.isFinite\s*\(\s*nextY\s*\)\s*\)\s*return/, 'Move payload must validate numeric coords.');
assertSource(/if\s*\(\s*!npc\s*\|\|\s*!target\s*\|\|\s*target\.hp\s*<=\s*0\s*\)\s*return/, 'Downed players must not receive repeated NPC damage.');
assertSource(/if\s*\(\s*!target\?\.ready\s*\)\s*return/, 'NPC damage should ignore not-ready players.');
assertSource(/if\s*\(\s*this\.completedSessions\.has\s*\(\s*target\?\.id\s*\)\s*\)\s*return/, 'Completed players should not receive NPC contact damage.');
assertSource(/if\s*\(\s*graceUntil\s*>\s*now\s*\)\s*return/, 'Spawn grace guard must prevent immediate spawn damage.');
assertSource(/if\s*\(\s*now\s*-\s*lastPairDamageAt\s*<\s*NPC_ATTACK_COOLDOWN_MS\s*\)\s*return/, 'Per-NPC damage cooldown guard must exist.');
assertSource(/target\.hp\s*=\s*Math\.max\s*\(\s*0\s*,\s*target\.hp\s*-\s*NPC_CONTACT_DAMAGE\s*\)/, 'NPC damage must clamp hp at 0.');
assertSource(/target\.respawnAt\s*=\s*now\s*\+\s*RESPAWN_DELAY_MS/, 'Downed state must set respawn timestamp.');
assertSource(/live\.hp\s*=\s*PLAYER_MAX_HP/, 'Respawn must restore player hp.');
assertSource(/npc\.maxHp\s*=\s*NPC_MAX_HP/, 'Server NPC maxHp must stay in sync with NPC_MAX_HP for client bars.');
assertSource(/const\s+npcDamageKeySuffix\s*=\s*`:\$\{client\.sessionId\}`/, 'onLeave must derive NPC damage map key suffix from session id.');
assertSource(/if\s*\(\s*key\.endsWith\s*\(\s*npcDamageKeySuffix\s*\)\s*\)/, 'onLeave must check key suffix for departing session.');
assertSource(/this\.lastNpcDamageAtByNpcAndTarget\.delete\s*\(\s*key\s*\)/, 'onLeave must delete NPC damage map keys for departing session.');
assertSource(/_findRandomPassableTileAwayFromPlayers\s*\(\s*minDistance\s*=\s*0\s*\)/, 'Respawn distance helper must exist.');
assertSource(/const\s+tooClose\s*=\s*this\.state\.players\.some\(/, 'Respawn helper must check proximity to live players.');
assertSource(/distance\s*\(\s*x\s*,\s*y\s*,\s*player\.x\s*,\s*player\.y\s*\)\s*<\s*minDistance/, 'Respawn helper must enforce min-distance threshold.');
assertSource(/this\._findRandomPassableTileAwayFromPlayers\s*\(\s*NPC_RESPAWN_MIN_DISTANCE\s*\)/, 'NPC respawn must use distance-aware spawn helper.');
assertSource(/if\s*\(\s*this\.completedSessions\.has\s*\(\s*player\.id\s*\)\s*\)\s*continue/, 'NPC targeting should skip completed players.');
assertSource(/if\s*\(\s*!player\s*\|\|\s*!player\.ready\s*\|\|\s*player\.hp\s*<=\s*0\s*\)\s*continue/, 'NPC targeting should skip not-ready players.');
assertSource(/if\s*\(\s*this\.completedSessions\.has\s*\(\s*sessionId\s*\)\s*\)\s*return/, 'Respawn timeout should not teleport completed players.');
assertSource(/if\s*\(\s*Date\.now\s*\(\s*\)\s*-\s*startedAt\s*<\s*MISSION_SURVIVE_MS\s*\)\s*return\s+false/, 'Extract validation must enforce survival timer.');
assertSource(/if\s*\(\s*\(\s*player\?\.kills\s*\|\|\s*0\s*\)\s*<\s*MISSION_REQUIRED_KILLS\s*\)\s*return\s+false/, 'Extract validation must enforce kill requirement.');
assertSource(/return\s+this\._isExtractionTile\s*\(\s*player\?\.x\s*,\s*player\?\.y\s*\)/, 'Extract validation must enforce extraction tile position.');
assertSource(/player\.ready\s*=\s*false/, 'Players should start as ready=false on join.');
assertSource(/this\.missionStartedAtBySession\.set\s*\(\s*client\.sessionId\s*,\s*0\s*\)/, 'Mission timer anchor should start at 0 before ready.');
assertSource(/player\.ready\s*=\s*true/, 'Ready/start message should set player ready=true.');
if (/\.leave\s*\(\s*['"`]/.test(source)) {
  throw new Error('Invalid string-only .leave(...) usage detected.');
}
if (/\.close\s*\(\s*['"`]/.test(source)) {
  throw new Error('Invalid string-only .close(...) usage detected.');
}

console.log('MinimalCityRoom safety smoke checks passed.');
