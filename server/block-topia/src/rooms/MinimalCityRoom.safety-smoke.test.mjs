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
assertSource(/const\s+READY_TIMEOUT_MS\s*=\s*30000/, 'Ready timeout constant must exist.');
assertSource(/const\s+FREE_ROAM_MS\s*=\s*60_000/, 'Free roam phase constant must exist.');
assertSource(/const\s+WARNING_MS\s*=\s*10_000/, 'Warning phase constant must exist.');
assertSource(/const\s+EVENT_MS\s*=\s*90_000/, 'Event phase constant must exist.');
assertSource(/const\s+RECOVERY_MS\s*=\s*30_000/, 'Recovery phase constant must exist.');
assertSource(/const\s+PHASE_FREE_ROAM\s*=\s*'FREE_ROAM'/, 'FREE_ROAM phase label must exist.');
assertSource(/const\s+PHASE_EVENT_ACTIVE\s*=\s*'EVENT_ACTIVE'/, 'EVENT_ACTIVE phase label must exist.');
assertSource(/worldPhase:\s*'string'/, 'Room state should expose worldPhase.');
assertSource(/phaseEndsAt:\s*'number'/, 'Room state should expose phaseEndsAt.');
assertSource(/eventLevel:\s*'number'/, 'Room state should expose eventLevel.');
assertSource(/eventObjective:\s*'string'/, 'Room state should expose eventObjective.');
assertSource(/roomRunStartedAt:\s*'number'/, 'Room state should expose roomRunStartedAt.');
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
assertSource(/this\.onMessage\s*\(\s*'restartRun'\s*,\s*\(\s*client\s*\)\s*=>/, 'Server should support restartRun message.');
assertSource(/if\s*\(\s*!this\._canExtractPlayer\s*\(\s*client\.sessionId\s*,\s*player\s*\)\s*\)\s*return/, 'Extract should require server-side completion validation.');
assertSource(/this\.completedSessions\.add\s*\(\s*client\.sessionId\s*\)/, 'Extract completion should mark session as completed.');
assertSource(/for\s*\(\s*const\s+npc\s+of\s+this\.state\.npcs\s*\)\s*{[\s\S]*if\s*\(\s*!npc\s*\|\|\s*npc\.hp\s*<=\s*0\s*\)\s*continue/, 'Dead NPCs must not be selected as attack targets.');
assertSource(/if\s*\(\s*!Number\.isFinite\s*\(\s*nextX\s*\)\s*\|\|\s*!Number\.isFinite\s*\(\s*nextY\s*\)\s*\)\s*return/, 'Move payload must validate numeric coords.');
assertSource(/if\s*\(\s*!npc\s*\|\|\s*!target\s*\|\|\s*target\.hp\s*<=\s*0\s*\)\s*return/, 'Downed players must not receive repeated NPC damage.');
assertSource(/if\s*\(\s*!target\?\.ready\s*\)\s*return/, 'NPC damage should ignore not-ready players.');
assertSource(/if\s*\(\s*this\.state\.worldPhase\s*!==\s*PHASE_EVENT_ACTIVE\s*\)\s*return/, 'NPC damage should be disabled outside event-active phase.');
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
assertSource(/this\._scheduleReadyTimeout\s*\(\s*client\.sessionId\s*\)/, 'Server should schedule timeout for not-ready players.');
assertSource(/if\s*\(\s*!player\s*\|\|\s*player\.ready\s*\)\s*return/, 'Ready timeout should ignore missing or already-ready players.');
assertSource(/client\.leave\s*\(\s*1000\s*\)/, 'Not-ready timeout should reclaim stale seats with numeric close code.');
assertSource(/this\._startRun\s*\(\s*\{\s*eventLevel:\s*1\s*\}\s*\)/, 'Server should initialize room run phase state on create.');
assertSource(/_tickPhase\s*\(\s*\)/, 'Server should tick authoritative room phase state.');
assertSource(/this\.runGeneration\s*=\s*0/, 'Server should initialize run generation tracking for timed callbacks.');
assertSource(/this\.runGeneration\s*\+=\s*1/, 'Server should increment run generation on startRun to invalidate stale callbacks.');
assertSource(/if\s*\(\s*scheduledGeneration\s*!==\s*this\.runGeneration\s*\)\s*return/, 'Respawn callbacks should ignore stale pre-restart generations.');
assertSource(/if\s*\(\s*this\.state\.players\.length\s*===\s*0\s*\)\s*return/, 'Phase ticker should not advance while room is empty.');
assertSource(/const\s+allReadyCompleted\s*=\s*readyPlayers\.every\(/, 'Mission complete phase should require all ready players extracted.');
assertSource(/this\.missionStartedAtBySession\.set\s*\(\s*player\.id\s*,\s*player\.ready\s*\?\s*now\s*:\s*0\s*\)/, 'startRun should anchor mission timer to now for already-ready players.');
assertSource(/if\s*\(\s*this\.state\.worldPhase\s*===\s*PHASE_FREE_ROAM\s*\|\|\s*this\.state\.worldPhase\s*===\s*PHASE_RECOVERY\s*\)\s*{/, 'Free roam/recovery should reduce direct NPC pressure.');
if (/\.leave\s*\(\s*['"`]/.test(source)) {
  throw new Error('Invalid string-only .leave(...) usage detected.');
}
if (/\.close\s*\(\s*['"`]/.test(source)) {
  throw new Error('Invalid string-only .close(...) usage detected.');
}

console.log('MinimalCityRoom safety smoke checks passed.');
