import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { getDailyMoonRunSummary } from '../workers/moonboys-api/pets/daily-moon-run.js';

const require = createRequire(import.meta.url);
const options = require('../js/moonpet-play-options.js');
const practice = require('../js/moonpet-practice.js');
const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const client = read('js/moonpet-mini-app.js');
const worker = read('workers/moonboys-api/worker.js');

for (const [key, screen, focus] of [
  ['district_mission', 'explore', 'districts'], ['seasonal_boss', 'explore', 'seasonal-boss'],
  ['pet:boss', 'explore', 'weekly-boss'], ['pet-daily-trade:today', 'economy', 'trade'],
  ['mission:pet-daily-adventure:today', 'explore', 'adventure'], ['daily_explorer', 'explore', 'moon-run'],
  ['pet-daily-care-set:today', 'home', 'care'], ['daily_care', 'home', 'care'],
  ['achievement', 'missions', 'achievements'], ['season:milestone', 'profile', 'season'],
  ['activity_running', 'work', 'timed-activity'], ['event_chain', 'explore', 'story-chains'],
]) assert.deepEqual(options.route({ key }), { screen, focus }, key);

const snapshot = { adopted: true, pet: { pet_id: 'pet-a', energy: 100 }, lifecycle: { phase: 'young' }, daily_run: { available: true }, live_systems: { chains: [{ available: true }] } };
assert.ok(options.options(snapshot).some((x) => x.key === 'daily_run'));
assert.ok(options.options(snapshot).some((x) => x.key === 'event_chain'));
assert.ok(!options.options({ ...snapshot, run: { daily: true } }).some((x) => x.key === 'daily_run'));
assert.ok(!options.options({ ...snapshot, daily_run: { available: false } }).some((x) => x.key === 'daily_run'));
assert.deepEqual(options.options({ ...snapshot, lifecycle: { phase: 'egg' } }).map((x) => x.key), ['practice', 'incubate']);
assert.ok(!options.options({ ...snapshot, pet: { energy: 0 } }).some((x) => x.key === 'run'));
assert.deepEqual(options.options({ adopted: false }), []);
assert.ok(!options.options({ ...snapshot, capabilities: { systems: { arena: { state: 'AVAILABLE' } } } }).some((x) => x.key === 'arena'), 'incomplete capabilities never open combat');

assert.equal(practice.create('x', '__proto__', 'explorer'), null);
assert.equal(practice.restore({ version: 1 }), null);
let first = practice.create('fixed-seed', 'scout', 'explorer');
assert.deepEqual(practice.restore(first), first);
const firstBefore = structuredClone(first);
const second = practice.step(first, 'safe', 0);
assert.deepEqual(first, firstBefore, 'engine must not mutate its input');
assert.deepEqual(second, practice.step(first, 'safe', 0), 'same seed and choice resolve deterministically');
assert.equal(practice.step(second, 'safe', 0), second, 'stale callbacks cannot advance a second room');
assert.equal(practice.step(second, 'not-a-choice', second.turn), second);
assert.equal(practice.step(first, 'rest', first.turn), first, 'cannot spend supplies resting at full health');
assert.equal(practice.restore({ ...first, health: Infinity }), null);
assert.equal(practice.restore({ ...first, perks: ['injected'] }), null);
assert.equal(practice.restore({ ...first, depth: 99 }), null);
assert.equal(practice.restore({ ...first, turn: -1 }), null);

let drafts = 0, completed = 0, failed = 0;
for (let seed = 0; seed < 300; seed++) {
  for (const build of Object.keys(practice.builds)) {
    let run = practice.create('simulation-' + seed, build, ['explorer', 'collector', 'survivor'][seed % 3]);
    let turns = 0;
    while (run.status === 'active') {
      assert.ok(turns++ < 18, 'bounded run must terminate');
      let action;
      if (run.draft.length) { drafts++; action = run.draft[(seed + turns) % run.draft.length]; }
      else {
        const choices = practice.choices(run).filter((x) => !x.disabled);
        assert.ok(choices.every((x) => x.odds >= 25 && x.odds <= 100));
        action = choices[(seed + turns) % choices.length].key;
      }
      run = practice.step(run, action, run.turn);
      assert.ok(practice.restore(run));
      assert.ok(run.health >= 0 && run.supplies >= 0 && run.depth <= 12);
    }
    if (run.status === 'completed') completed++; else failed++;
    assert.equal(practice.step(run, 'safe', run.turn), run, 'terminal state is immutable');
    if (run.status === 'failed') assert.equal(run.salvage, 0);
  }
}
assert.ok(drafts > 0 && completed > 0 && failed > 0, 'simulation must exercise builds, drafts, clears and failures');
let collector = { ...practice.create('collector', 'scavenger', 'collector'), salvage: 125, score: 400 };
assert.equal(practice.goalProgress(collector).completed, false, 'collector must extract before goal credit');
collector = practice.step(collector, 'extract', collector.turn);
assert.equal(practice.goalProgress(collector).completed, true);
assert.equal(collector.score, 400);
assert.doesNotMatch(read('js/moonpet-practice.js'), /\bfetch\s*\(|XMLHttpRequest|post\s*\(|awardPetReward|telegram-pets/,
  'practice engine must not touch server/reward paths');

// Exercise the deployed classic scripts, not an ESM-only approximation.
const context = vm.createContext({ window: {}, Object, Math, JSON, Number, Set });
vm.runInContext(read('js/moonpet-practice.js'), context);
vm.runInContext(read('js/moonpet-play-options.js'), context);
assert.equal(context.window.MoonpetPractice.create('browser', 'scout', 'explorer').status, 'active');
assert.equal(context.window.MoonpetPlayOptions.route({ key: 'district_mission' }).focus, 'districts');

// Read-only official attempt status: reset, another pet, open-run conflicts and
// terminal states. This does not create or settle any rewards.
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE telegram_pet_runs (run_id TEXT, telegram_id TEXT, status TEXT, current_room INT, score INT);
  CREATE TABLE telegram_pet_daily_runs (run_id TEXT, telegram_id TEXT, pet_id TEXT, utc_day TEXT);`);
const db = { prepare(sql) { return { bind(...args) { return { async first() { return sqlite.prepare(sql).get(...args) || null; } }; } }; } };
const request = { telegram_id: 'test-owner', hatched: true, now: new Date('2026-09-26T10:00:00Z') };
assert.equal((await getDailyMoonRunSummary(db, request)).available, true);
assert.equal((await getDailyMoonRunSummary(db, { ...request, hatched: false })).available, false);
assert.equal((await getDailyMoonRunSummary(db, { ...request, active_run: { run_id: 'other' } })).available, false);
sqlite.exec(`INSERT INTO telegram_pet_runs VALUES ('daily-1', 'test-owner', 'active', 3, 150);
  INSERT INTO telegram_pet_daily_runs VALUES ('daily-1', 'test-owner', 'pet-a', '2026-09-26');`);
assert.equal((await getDailyMoonRunSummary(db, request)).resumable, true);
sqlite.exec("UPDATE telegram_pet_runs SET status='extracted'");
const summary = await getDailyMoonRunSummary(db, { ...request, pet_id: 'pet-b' });
assert.equal(summary.available, false, 'pet switching must not advertise another daily attempt');
assert.equal(summary.pet_id, 'pet-a');
assert.equal(summary.depth, 3);
assert.equal(summary.cooldown.expires_at, '2026-09-27T00:00:00.000Z');
assert.equal((await getDailyMoonRunSummary(db, { ...request, now: new Date('2026-09-27T00:00:01Z') })).available, true);
assert.equal((await getDailyMoonRunSummary(db, { ...request, telegram_id: 'another-owner' })).attempted, false);
sqlite.close();

const miniActions = worker.slice(worker.indexOf('async function processPetMiniAppAction'), worker.indexOf('function serializePetMiniAppActionResult'));
// Every literal server-action button must have an explicit backend handler.
const actionButtons = [...client.matchAll(/button\('[^']*', '([a-z_]+)'/g)].map((x) => x[1]);
for (const action of new Set(actionButtons)) assert.ok(miniActions.includes("'" + action + "'"), 'unwired button: ' + action);
assert.match(client, /number\(Math\.round\(Number\(choice\.reward_multiplier\) \* 100\)\)/);
assert.match(client, /run\.daily \? 'OFFICIAL DAILY MOON RUN'/);
const eggHome = client.slice(client.indexOf("if (lifecycle.phase === 'egg') {", client.indexOf('function renderHome')), client.indexOf('var next = state.next', client.indexOf('function renderHome')));
for (const action of ['energy_drink', 'dance', 'cuddles']) assert.ok(eggHome.includes("'" + action + "'"));
const html = read('moonpet-game.html');
assert.ok(html.indexOf('/js/moonpet-practice.js') < html.indexOf('/js/moonpet-mini-app.js'));
assert.ok(html.indexOf('/js/moonpet-play-options.js') < html.indexOf('/js/moonpet-mini-app.js'));
console.log(`Moonpet player loop tests passed: ${new Set(actionButtons).size} literal action buttons; 900 simulated runs (${completed} clears, ${failed} failures, ${drafts} drafts).`);
