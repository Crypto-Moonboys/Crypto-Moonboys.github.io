import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const reviewFixWorkflowUrl = new URL('../.github/workflows/phase5b-review-fixes.yml', import.meta.url);
const reviewFixesPending = fs.existsSync(reviewFixWorkflowUrl);

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

if (reviewFixesPending) {
  const workflow = fs.readFileSync(reviewFixWorkflowUrl, 'utf8');
  assert.match(workflow, /runtime:api:/, 'pending review-fix workflow must add isolated API runtime event keys');
  assert.match(workflow, /event_key required for progression-bearing pet actions/, 'pending workflow must reject progression-bearing API actions without an event key');
  assert.doesNotMatch(workflow, /result\?\.accepted && !result\?\.duplicate/, 'pending workflow must retry idempotent runtime awards for duplicate primary actions');
  assert.match(workflow, /result\?\.accepted && runtimeAction && runtimeEventKey/, 'pending workflow must invoke runtime awards for all accepted primary results');
  assert.match(workflow, /work: 'job'/, 'pending review-fix workflow must map API work actions to Job XP');
  assert.match(workflow, /daily_chest: 'daily_chest'/, 'pending review-fix workflow must map API daily chests to Bond XP');
  assert.match(workflow, /run_step: 'run_step'/, 'pending review-fix workflow must map API run steps to Adventure XP');
  assert.match(workflow, /run_extract: 'run_extract'/, 'pending review-fix workflow must map API extraction to Adventure XP');
  assert.match(workflow, /INSERT INTO telegram_pet_equipment_progression[\s\S]*ON CONFLICT \(telegram_id, item_key\) DO UPDATE/, 'pending review-fix workflow must add shop progression upserts');
  assert.match(workflow, /INSERT OR IGNORE INTO telegram_pet_equipment_progression/, 'pending review-fix workflow must insert missing gear progression rows');
  assert.match(workflow, /equipped_\$\{slot\}/, 'pending review-fix workflow must derive missing gear rows from equipped profile slots');
} else {
  assert.match(worker, /runtime:api:/, 'API-dispatched actions must use isolated runtime event keys');
  assert.match(worker, /event_key required for progression-bearing pet actions/, 'progression-bearing API actions must require an event key before primary rewards commit');
  assert.doesNotMatch(worker, /result\?\.accepted && !result\?\.duplicate/, 'duplicate primary actions must still retry the idempotent runtime award');
  assert.match(worker, /result\?\.accepted && runtimeAction && runtimeEventKey/, 'accepted duplicate and non-duplicate API actions must invoke the runtime award service');
  assert.match(worker, /work:\s*'job'/, 'API work actions must map to Job XP');
  assert.match(worker, /daily_chest:\s*'daily_chest'/, 'API daily chests must map to Bond XP');
  assert.match(worker, /run_step:\s*'run_step'/, 'API run steps must map to Adventure XP');
  assert.match(worker, /run_extract:\s*'run_extract'/, 'API extraction must map to Adventure XP');
  assert.match(worker, /INSERT INTO telegram_pet_equipment_progression[\s\S]*ON CONFLICT \(telegram_id, item_key\) DO UPDATE/, 'shop purchases must create or repair equipment progression rows');
  assert.match(worker, /INSERT OR IGNORE INTO telegram_pet_equipment_progression/, '/petgear must insert missing progression rows');
  assert.match(worker, /equipped_\$\{slot\}/, '/petgear must derive missing progression rows from equipped profile slots');
}

assert.match(worker, /getPetDayKey\(new Date\(\)\)/, 'runtime awards must use the existing UTC pet day authority');
assert.match(worker, /runtime_award_failed/, 'runtime failures must be logged without breaking existing pet rewards');
assert.match(worker, /\/petprogress — View secondary XP, traits and prestige/, 'help must advertise the live progress command');
assert.match(worker, /\/petgear — View equipment levels and mastery/, 'help must advertise the live gear command');

console.log(`telegram-pets-runtime-phase-5b.test.mjs passed (${reviewFixesPending ? 'review fixes pending workflow' : 'review fixes applied'})`);
