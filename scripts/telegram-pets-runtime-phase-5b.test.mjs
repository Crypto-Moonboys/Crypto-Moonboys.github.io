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
assert.match(worker, /getPetDayKey\(new Date\(\)\)/, 'runtime awards must use the existing UTC pet day authority');
assert.match(worker, /runtime_award_failed/, 'runtime failures must be logged without breaking existing pet rewards');
assert.match(worker, /\/petprogress — View secondary XP, traits and prestige/, 'help must advertise the live progress command');
assert.match(worker, /\/petgear — View equipment levels and mastery/, 'help must advertise the live gear command');

console.log('telegram-pets-runtime-phase-5b.test.mjs passed');
