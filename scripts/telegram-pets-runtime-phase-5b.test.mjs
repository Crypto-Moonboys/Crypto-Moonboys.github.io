import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');

assert.match(worker, /from '\.\/pets\/runtime-phase-5a\.js'/, 'live Worker must import the Phase 5A runtime service');
assert.match(worker, /case 'petprogress':\s+await cmdPetProgress/, '/petprogress must be routed');
assert.match(worker, /case 'petgear':\s+await cmdPetGear/, '/petgear must be routed');
assert.match(worker, /async function cmdPetProgress\(/, 'progress command handler must exist');
assert.match(worker, /async function cmdPetGear\(/, 'gear command handler must exist');
assert.match(worker, /buildPetProgressSummary\(/, 'progress output must use the canonical formatter');
assert.match(worker, /buildPetGearSummary\(/, 'gear output must use the canonical formatter');
assert.match(worker, /applyPetRuntimeAward\(/, 'live pet actions must call the transactional runtime service');
assert.match(worker, /runtime:care:/, 'care actions must use isolated runtime event keys');
assert.match(worker, /runtime:activity:/, 'timed activities must use stable session-based runtime event keys');
assert.match(worker, /runtime:job:/, 'jobs must use isolated runtime event keys');
assert.match(worker, /runtime:daily:/, 'daily chests must use isolated runtime event keys');
assert.match(worker, /runtime:run-step:/, 'run steps must use isolated runtime event keys');
assert.match(worker, /runtime:run-extract:/, 'run extraction must use isolated runtime event keys');
assert.match(worker, /runtime:api:/, 'API-dispatched actions must use isolated runtime event keys');
assert.match(worker, /work:\s*'job'/, 'API work actions must map to Job XP');
assert.match(worker, /daily_chest:\s*'daily_chest'/, 'API daily chests must map to Bond XP');
assert.match(worker, /run_step:\s*'run_step'/, 'API run steps must map to Adventure XP');
assert.match(worker, /run_extract:\s*'run_extract'/, 'API extraction must map to Adventure XP');
assert.match(worker, /INSERT INTO telegram_pet_equipment_progression[\s\S]*ON CONFLICT \(telegram_id, item_key\) DO UPDATE/, 'shop purchases must create or repair equipment progression rows');
assert.match(worker, /INSERT OR IGNORE INTO telegram_pet_equipment_progression[\s\S]*equipped_/, '/petgear must repair missing progression rows from the equipped profile');
assert.match(worker, /getPetDayKey\(new Date\(\)\)/, 'runtime awards must use the existing UTC pet day authority');
assert.match(worker, /runtime_award_failed/, 'runtime failures must be logged without breaking existing pet rewards');
assert.match(worker, /\/petprogress — View secondary XP, traits and prestige/, 'help must advertise the live progress command');
assert.match(worker, /\/petgear — View equipment levels and mastery/, 'help must advertise the live gear command');

console.log('telegram-pets-runtime-phase-5b.test.mjs passed');
