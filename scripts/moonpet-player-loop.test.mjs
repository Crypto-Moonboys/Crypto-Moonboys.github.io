import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { getDailyMoonRunSummary } from '../workers/moonboys-api/pets/daily-moon-run.js';
import { PET_DAILY_BOUNTIES } from '../workers/moonboys-api/pets/economy-expansion.js';
import { previewEncounterChoice } from '../workers/moonboys-api/pets/choice-preview.js';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const require = createRequire(import.meta.url);
const options = require('../js/moonpet-play-options.js');
const practice = require('../js/moonpet-practice.js');
const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const client = read('js/moonpet-mini-app.js');
const worker = read('workers/moonboys-api/worker.js');

for (const encounter of [
  ...['moon_alley', 'graffiti_vault', 'nebula_market'].map(hooks.resolvePetAdventureEncounter),
  ...['lost_delivery_drone', 'neon_storm', 'underground_cipher'].map(hooks.resolvePetRandomEncounter),
]) {
  assert.ok(encounter);
  for (const choice of encounter.choices) {
    const preview = previewEncounterChoice(choice);
    assert.ok(Math.abs(preview.outcomes.reduce((sum, outcome) => sum + outcome.chance, 0) - 100) < 1e-9);
    for (const outcome of preview.outcomes) {
      const actual = outcome.kind === 'setback' ? choice.risk : choice;
      assert.ok(Math.abs(outcome.chance - (outcome.kind === 'setback' ? choice.risk.chance : 1 - (choice.risk?.chance || 0)) * 100) < 1e-9);
      for (const type of ['rewards', 'costs']) for (const [key, bounds] of Object.entries(outcome[type])) {
        const value = actual[type][key];
        assert.deepEqual(bounds, Array.isArray(value) ? [Math.min(...value), Math.max(...value)] : [value, value]);
      }
    }
    assert.ok(preview.detail.includes('BASE REWARD') && preview.detail.includes('COST'));
  }
}
assert.equal(previewEncounterChoice({ rewards: { moon_gold: 3 }, risk: { chance: 1, costs: { energy: 2 } } }).outcomes[0].kind, 'setback');

for (const [key, screen, focus] of [
  ['district_mission', 'explore', 'districts'], ['seasonal_boss', 'explore', 'seasonal-boss'],
  ['pet:boss', 'explore', 'weekly-boss'], ['pet-daily-trade:today', 'economy', 'trade'],
  ['mission:pet-daily-adventure:today', 'explore', 'adventure'], ['daily_explorer', 'explore', 'moon-run'],
  ['pet-daily-care-set:today', 'home', 'care'], ['daily_care', 'home', 'care'],
  ['rare_morph', 'profile', 'rare-morph'],
  ['achievement', 'missions', 'achievements'], ['season:milestone', 'profile', 'season'],
  ['activity_running', 'work', 'timed-activity'], ['event_chain', 'explore', 'story-chains'],
  ['craft_goal', 'economy', 'crafting'], ['materials', 'economy', 'materials'],
]) assert.deepEqual(options.route({ key }), { screen, focus }, key);

const snapshot = { adopted: true, pet: { pet_id: 'pet-a', energy: 100 }, lifecycle: { phase: 'young' }, daily_run: { available: true }, live_systems: { chains: [{ available: true }] } };
assert.ok(options.options(snapshot).some((x) => x.key === 'daily_run'));
assert.ok(options.options(snapshot).some((x) => x.key === 'event_chain'));
assert.ok(!options.options({ ...snapshot, run: { daily: true } }).some((x) => x.key === 'daily_run'));
assert.ok(!options.options({ ...snapshot, daily_run: { available: false } }).some((x) => x.key === 'daily_run'));
assert.deepEqual(options.options({ ...snapshot, lifecycle: { phase: 'egg' } }).map((x) => x.key), ['practice', 'incubate']);
assert.ok(!options.options({ ...snapshot, pet: { energy: 0 } }).some((x) => x.key === 'run'));
assert.deepEqual(options.options({ adopted: false }), []);
const weeklyRecovery = { ...snapshot, lifecycle: { phase: 'egg' }, guidance: { weekly_boss: { pending_rewards: [{ week_key: '2026-W38' }] } } };
assert.equal(options.options(weeklyRecovery)[0].key, 'weekly_boss_claim');
assert.equal(options.options(weeklyRecovery)[0].focus, 'weekly-boss');
const expeditionChoices = { ...snapshot, guidance: { economy: { expedition_options: [{ key: 'dust_tunnels', available: true }, { key: 'guardian_rift', available: false }] } } };
assert.equal(options.options(expeditionChoices).find((entry) => entry.key === 'expedition').focus, 'expedition');
assert.ok(!options.options({ ...expeditionChoices, lifecycle: { phase: 'egg' } }).some((entry) => entry.key === 'expedition'));
assert.ok(!options.options({ ...snapshot, guidance: { economy: { expedition_options: [{ available: false }] } } }).some((entry) => entry.key === 'expedition'));
assert.ok(!options.options({ ...snapshot, capabilities: { systems: { arena: { state: 'AVAILABLE' } } } }).some((x) => x.key === 'arena'), 'incomplete capabilities never open combat');

// All ten rotating targets lead to qualifying actions, including alternative run routes.
const bountyTargets = {
  care_pair: ['care'], triple_care: ['care'], job_shift: ['jobs'], job_double: ['jobs'],
  event_scout: ['street-event'], activity_claim: ['timed-activity'], run_bank: ['moon-run', 'adventure'],
  daily_cache: ['care'], kaiju_watch: ['kaiju'], item_user: ['inventory'],
};
for (const bounty of PET_DAILY_BOUNTIES) assert.deepEqual(options.bountyRoutes(bounty).map((target) => target.focus), bountyTargets[bounty.key]);
assert.deepEqual(options.bountyRoutes({ event_types: ['__proto__', 'unknown'] }), []);
const careTarget = { ...PET_DAILY_BOUNTIES[0], complete: false, progress: 1, claimed: false };
const claimTarget = { ...PET_DAILY_BOUNTIES[2], complete: true, progress: 1, claimed: false };
const targeted = { ...snapshot, guidance: { economy: { bounties: [careTarget, claimTarget] }, activity: { ready: true } } };
const choices = options.options(targeted);
assert.equal(choices[0].key, 'bounty_claims'); assert.equal(choices[0].focus, 'bounties');
assert.equal(choices[1].key, 'activity');
assert.equal(choices.find((c) => c.key === 'bounty_target').focus, 'care');
assert.match(choices.find((c) => c.key === 'bounty_target').title, /Care Pair/);
assert.deepEqual(options.options({ ...targeted, lifecycle: { phase: 'egg' } }).map((c) => c.key), ['practice', 'incubate']);
const finishedChoices = options.options({ ...snapshot, guidance: { economy: { bounties: [{ ...claimTarget, claimed: true }] } }, contracts: { available: true } });
assert.ok(!finishedChoices.some((c) => ['bounty_claims', 'bounty_target'].includes(c.key)));
assert.ok(finishedChoices.some((c) => c.key === 'contract') && finishedChoices.some((c) => c.key === 'practice'));
const raidAtTwelve = { ...snapshot, pet: { energy: 12 }, live_systems: { seasonal_boss: { available: true, choices: [{ energy: 12 }, { energy: 18 }] } } };
assert.ok(options.options(raidAtTwelve).some((c) => c.key === 'seasonal_boss'));
const exhaustedWithClaim = { ...raidAtTwelve, pet: { energy: 0 }, live_systems: { seasonal_boss: { available: false, pending_rewards: [{ boss_key: 'neon_titan' }] } } };
assert.equal(options.options(exhaustedWithClaim)[0].key, 'seasonal_boss_claim');
assert.equal(options.options(exhaustedWithClaim)[0].focus, 'seasonal-boss');
assert.ok(options.options({ ...snapshot, pet: { energy: 0 }, regions: [{ available: true, pending_choice_key: 'careful', retry_energy_charged: true }] }).some((c) => c.key === 'district_retry'));
assert.ok(!options.options({ ...snapshot, pet: { energy: 0 }, regions: [{ available: true, pending_choice_key: 'careful' }] }).some((c) => c.key === 'district_retry'), 'an unpaid retry still needs energy');
const savedRaid = { available: true, pending_move: 'counter', choices: [{ key: 'conserve', energy: 12 }, { key: 'counter', energy: 18 }] };
assert.ok(!options.options({ ...raidAtTwelve, live_systems: { seasonal_boss: savedRaid } }).some((c) => c.key === 'seasonal_boss'), 'a saved counter cannot switch to the cheaper move');
assert.ok(options.options({ ...raidAtTwelve, pet: { energy: 0 }, live_systems: { seasonal_boss: { ...savedRaid, retry_energy_charged: true } } }).some((c) => c.key === 'seasonal_boss'), 'a paid raid resumes at zero energy');

const craftRecipe = { key: 'battery_pack', title: 'Battery Pack', unlocked: true, affordable: false, cost: { battery_cell: 3, crystal_shard: 1 }, output: { item_key: 'energy_drink', quantity: 1 } };
const craftSnapshot = { ...snapshot, live_systems: { crafting: [craftRecipe] }, materials: [{ key: 'battery_cell', label: 'Battery Cell', quantity: 1 }],
  regions: [{ key: 'blockchain_sewers', available: true, energy_cost: 10, mission: { material_reward: 'battery_cell' } }, { key: 'wrong-material', available: true, mission: { material_reward: 'scrap_metal' } }],
  guidance: { economy: { expedition_options: [{ title: 'Crystal Caves', available: true, energy: 18, rewards: [{ materials: { crystal_shard: 1 } }] }],
    market_offers: [{ title: 'Cell Case', affordable: true, unlocked: true, cost: { moon_gold: 150 }, reward: { materials: { battery_cell: 3 } } },
      { title: 'Drink Crate', affordable: true, unlocked: true, cost: { moon_gold: 120 }, reward: { items: { energy_drink: 2 } } },
      { title: 'Sold', purchased: true, affordable: true, unlocked: true, reward: { materials: { battery_cell: 3 } } },
      { title: 'Unaffordable', affordable: false, unlocked: true, reward: { materials: { battery_cell: 3 } } },
      { title: 'Locked', affordable: true, unlocked: false, reward: { materials: { battery_cell: 3 } } }] } } };
const craftBefore = structuredClone(craftSnapshot);
const craftPlan = options.craftingGoal(craftSnapshot, 'battery_pack');
assert.deepEqual(craftPlan.ingredients.map((m) => m.missing), [2, 1]);
assert.equal(craftPlan.ready, false);
assert.deepEqual(craftPlan.routes.map((r) => r.focus), ['districts', 'expedition', 'market', 'market']);
assert.ok(craftPlan.routes.find((r) => r.title === 'MARKET // Drink Crate').detail.includes('instead of crafting'));
assert.deepEqual(craftSnapshot, craftBefore, 'planning never mutates server state');
assert.equal(options.craftingGoal(craftSnapshot, '__proto__'), null);
assert.equal(options.craftingGoal({ adopted: false }, 'battery_pack'), null);
const eggPlan = options.craftingGoal({ ...craftSnapshot, lifecycle: { phase: 'egg' } }, 'battery_pack');
assert.equal(eggPlan.ready, false); assert.deepEqual(eggPlan.routes, []);
const noRoutes = { ...craftSnapshot, pet: { energy: 0 }, guidance: { economy: { expedition_options: [{ available: false, rewards: [{ materials: { battery_cell: 1 } }] }] } } };
assert.deepEqual(options.craftingGoal(noRoutes, 'battery_pack').routes, []);
assert.equal(options.craftingGoal({ ...noRoutes, regions: [{ ...craftSnapshot.regions[0], retry_energy_charged: true }] }, 'battery_pack').routes[0].focus, 'districts');
const readyCraft = { ...craftSnapshot, materials: [{ key: 'battery_cell', quantity: 3 }, { key: 'crystal_shard', quantity: 1 }], live_systems: { crafting: [{ ...craftRecipe, affordable: true }] } };
assert.equal(options.craftingGoal(readyCraft, 'battery_pack').ready, true);
assert.ok(options.options(readyCraft, { crafting_goal: 'battery_pack' }).find((r) => r.key === 'craft_goal').title.startsWith('READY TO CRAFT'));
assert.ok(!options.options(readyCraft).some((r) => r.key === 'craft_goal'));
const fullCraft = options.craftingGoal({ ...readyCraft, inventory: [{ key: 'energy_drink', count: 999999 }] }, 'battery_pack');
assert.equal(fullCraft.output_full, true); assert.equal(fullCraft.ready, false);
assert.ok(!fullCraft.routes.some((r) => r.focus === 'market'), 'a full output stack must not recommend buying more finished items');
for (const [owned, bundle, expected] of [[0, 2, true], [999997, 2, true], [999998, 1, true], [999998, 2, false], [999999, 1, false]]) {
  for (const includeMaterials of [false, true]) {
    const offer = { title: 'Capacity Check', affordable: true, unlocked: true, cost: { moon_gold: 120 },
      reward: { items: { energy_drink: bundle }, ...(includeMaterials ? { materials: { battery_cell: 3 } } : {}) } };
    const goal = options.craftingGoal({ ...craftSnapshot, inventory: [{ key: 'energy_drink', count: owned }],
      guidance: { economy: { market_offers: [offer] } } }, 'battery_pack');
    assert.equal(goal.routes.some((r) => r.focus === 'market'), expected,
      `market bundle of ${bundle} with ${owned} owned${includeMaterials ? ' and needed materials' : ''} must fit in full`);
  }
}
const fullOutputWithMissingMaterials = options.craftingGoal({ ...craftSnapshot, inventory: [{ item_key: 'energy_drink', quantity: 999999 }] }, 'battery_pack');
assert.deepEqual(fullOutputWithMissingMaterials.routes.filter((r) => r.focus === 'market').map((r) => r.title), ['MARKET // Cell Case'],
  'material-only offers remain available without recommending overflowing finished items');
assert.equal(options.craftingGoal({ ...readyCraft, live_systems: { crafting: [{ ...craftRecipe, affordable: true, unlocked: false }] } }, 'battery_pack').ready, false);

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
