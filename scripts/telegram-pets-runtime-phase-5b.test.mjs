import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const finalWorker = fs.readFileSync(new URL('../workers/moonboys-api/worker-phase5-final.js', import.meta.url), 'utf8');
const wrangler = fs.readFileSync(new URL('../workers/moonboys-api/wrangler.toml', import.meta.url), 'utf8');
const runtime = `${worker}\n${finalWorker}`;

assert.match(wrangler, /main = "worker-phase5-final\.js"/, 'Wrangler must deploy the final Phase 5 entrypoint');
assert.match(worker, /from '\.\/pets\/runtime-phase-5a\.js'/, 'base Worker must import the Phase 5A runtime service');
assert.match(worker, /case 'petprogress':\s+await cmdPetProgress/, '/petprogress must be routed');
assert.match(worker, /case 'petgear':\s+await cmdPetGear/, '/petgear must be routed');
assert.match(worker, /async function cmdPetProgress\(/, 'progress command handler must exist');
assert.match(worker, /async function cmdPetGear\(/, 'gear command handler must exist');
assert.match(worker, /buildPetProgressSummary\(/, 'progress output must use the canonical formatter');
assert.match(worker, /buildPetGearSummary\(/, 'gear output must use the canonical formatter');
assert.match(runtime, /applyPetRuntimeAward\(/, 'live pet actions must call the transactional runtime service');
assert.match(worker, /runtime:care:/, 'care actions must use isolated runtime event keys');
assert.match(worker, /runtime:activity:/, 'timed activities must use stable session-based runtime event keys');
assert.match(worker, /runtime:job:/, 'jobs must use isolated runtime event keys');
assert.match(worker, /runtime:daily:/, 'daily chests must use isolated runtime event keys');
assert.match(worker, /runtime:run-step:/, 'run steps must use isolated runtime event keys');
assert.match(worker, /runtime:run-extract:/, 'run extraction must use isolated runtime event keys');

assert.match(finalWorker, /runtime:api:/, 'API-dispatched actions must use isolated runtime event keys');
assert.match(finalWorker, /work: 'job'/, 'API work actions must map to Job XP');
assert.match(finalWorker, /daily_chest: 'daily_chest'/, 'API daily chests must map to Bond XP');
assert.match(finalWorker, /run_step: 'run_step'/, 'API run steps must map to Adventure XP');
assert.match(finalWorker, /run_extract: 'run_extract'/, 'API extraction must map to Adventure XP');
assert.match(finalWorker, /event_key required for progression-bearing pet actions/, 'progression API actions must require an idempotency key');
assert.match(finalWorker, /if \(!payload\?\.accepted\) return;/, 'accepted primary duplicates must still retry the runtime award');
assert.doesNotMatch(finalWorker, /accepted && !.*duplicate/, 'runtime repair must not be blocked by a duplicate primary action');
assert.match(finalWorker, /body\?\.telegram_id \|\| body\?\.user\?\.id/, 'API post-processing must support both documented Telegram identity fields');
assert.match(finalWorker, /Access-Control-Allow-Origin/, 'wrapper validation failures must preserve allowed CORS responses');
assert.match(finalWorker, /corsHeadersFor\(request\)/, 'wrapper errors must use request-aware CORS headers');
assert.match(finalWorker, /ON CONFLICT \(telegram_id, item_key\) DO UPDATE SET/, 'shop purchases must create or repair equipment progression rows');
assert.match(finalWorker, /INSERT OR IGNORE INTO telegram_pet_equipment_progression/, '/petgear must insert missing progression rows');
assert.match(finalWorker, /equipped_\$\{slot\}/, '/petgear must derive missing progression rows from equipped profile slots');
assert.match(finalWorker, /telegramRunCallbackContext/, 'Telegram run callback retries must have a repair path');
assert.match(finalWorker, /telegram_pet_run_steps/, 'run-step repair must verify the accepted primary step');
assert.match(finalWorker, /runtime:run-step:/, 'run-step retry repair must use the canonical runtime key');
assert.match(finalWorker, /runtime:run-extract:/, 'run-extract retry repair must use the canonical runtime key');
assert.match(finalWorker, /baseWorker\.scheduled/, 'the final entrypoint must preserve scheduled jobs');

assert.match(worker, /getPetDayKey\(new Date\(\)\)/, 'direct command awards must use the existing UTC pet day authority');
assert.match(worker, /runtime_award_failed/, 'direct runtime failures must be logged without breaking existing pet rewards');
assert.match(worker, /\/petprogress — View secondary XP, traits and prestige/, 'help must advertise the live progress command');
assert.match(worker, /\/petgear — View equipment levels and mastery/, 'help must advertise the live gear command');

console.log('telegram-pets-runtime-phase-5b.test.mjs passed (audited production entrypoint)');
