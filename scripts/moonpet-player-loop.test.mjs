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
const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const client = read('js/moonpet-mini-app.js');
const worker = read('workers/moonboys-api/worker.js');
assert.match(options.objectiveRoutes('pet-daily-bank:2026-10-02', {})[0].detail,
  /goal stays complete if you spend gold later/, 'bank guidance must describe the permanently latched daily goal');

// Ranked guidance keeps recovery ahead of new play and never adds a blocked care route.
const guideState = { adopted: true, pet: { pet_id: 'p1', energy: 0, hunger: 80, cleanliness: 90, happiness: 90 }, lifecycle: { phase: 'young' },
  guidance: { daily_cache: { available: true }, activity: { status: 'active' }, weekly_boss: { pending_rewards: [{ pet_id: 'p1' }] } },
  contracts: { available: true, run: { status: 'active' } }, cooldowns: { entries: [{ key: 'action:feed', remaining_seconds: 30 }] } };
let recommended = options.recommendations(guideState);
assert.equal(recommended[0].key, 'weekly_boss_claim');
assert.ok(recommended.findIndex(x => x.key === 'contract') < recommended.findIndex(x => x.key === 'daily_chest'));
assert.ok(!recommended.some(x => x.key === 'feed' || x.key === 'sleep' || x.key === 'run'));
assert.equal(new Set(recommended.map(x => x.screen + ':' + x.focus)).size, recommended.length);
recommended = options.recommendations({ ...guideState, cooldowns: { entries: [] }, guidance: {} });
assert.ok(recommended.some(x => x.key === 'feed'));
assert.equal(options.recommendations({ adopted: false }).length, 0);
recommended = options.recommendations({ adopted: true, lifecycle: { phase: 'egg' } });
assert.equal(recommended[0].key, 'incubate');
assert.ok(!recommended.some(x => ['daily_chest', 'run', 'sleep'].includes(x.key)));
recommended = options.recommendations({ ...guideState, next: { key: 'train', title: 'Train now' } });
assert.ok(!recommended.some(x => x.key === 'server:train'), 'a blocked care suggestion must not replace a ready cache route');
recommended = options.recommendations({ ...guideState, weekly_journey: { objectives: [{ objective_id: 'weekly_check_in', title: 'Check in', progress: 1, target: 2 }] } });
assert.ok(recommended.some(x => x.key === 'daily_chest' || x.title.includes('Check in')));

recommended = options.recommendations({ adopted: true, lifecycle: { phase: 'young' }, pet: { energy: 30 },
  daily_run: { available: true }, daily_journey: { objectives: [{ challenge_id: 'daily_boss', description: 'Clear the daily boss', progress: 0, target: 1 }] } });
assert.ok(recommended.some(x => x.key === 'daily_journey:daily_boss' && x.title.includes('Clear the daily boss') && x.focus === 'moon-run'));
recommended = options.recommendations({ adopted: true, lifecycle: { phase: 'young' }, guidance: { evolution: { ready: true, name: 'Next form' } } });
assert.ok(recommended.some(x => x.key === 'evolution_ready' && x.focus === 'evolution'));

const shoppingState = { adopted: true, lifecycle: { phase: 'young' },
  inventory: [{ quantity: 1, kind: 'usable_item' }],
  guidance: { shop_items: [{ unlocked: true, affordable: true }], economy: { market_offers: [{ unlocked: true, affordable: true, capacity: { available: true } }] } },
  live_systems: { cosmetics: [{ key: 'profile_frame', affordable: true, unlocked: false }] } };
for (const key of ['inventory', 'market', 'shop', 'cosmetic']) assert.ok(options.recommendations(shoppingState).some(x => x.key === key), key);
for (const unlocked of [false, true]) {
  const badgeOnly = { ...shoppingState, live_systems: { cosmetics: [
    { key: 'rename_badge', affordable: true, unlocked, repeatable: true },
    { key: 'profile_frame', affordable: false, unlocked: false },
  ] } };
  assert.ok(!options.recommendations(badgeOnly).some(x => x.key === 'cosmetic'), 'retired badge cannot recommend an empty Style Lab');
  badgeOnly.live_systems.cosmetics.push({ key: 'run_trail', affordable: true, unlocked: false });
  assert.ok(options.recommendations(badgeOnly).some(x => x.key === 'cosmetic'), 'a working affordable style remains recommended');
}
const unavailableShopping = structuredClone(shoppingState);
unavailableShopping.inventory[0].quantity = 0;
unavailableShopping.guidance.shop_items[0].equipped = true;
unavailableShopping.guidance.economy.market_offers[0].capacity.available = false;
unavailableShopping.live_systems.cosmetics[0].unlocked = true;
assert.ok(!options.recommendations(unavailableShopping).some(x => ['inventory', 'market', 'shop', 'cosmetic'].includes(x.key)));
assert.ok(!options.recommendations({ ...shoppingState, lifecycle: { phase: 'egg' } }).some(x => ['inventory', 'market', 'shop', 'cosmetic'].includes(x.key)));

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
// Currency gates must reflect every possible rolled outcome, not pet stats or
// rewards that have not been earned yet. Conditional choices remain usable.
const paidChoice = { costs: { moon_gold: [4, 12], energy: [4, 10] } };
assert.equal(previewEncounterChoice(paidChoice, { moon_gold: 3 }).available, false);
assert.equal(previewEncounterChoice(paidChoice, { moon_gold: 4 }).available, true);
assert.equal(previewEncounterChoice(paidChoice, { moon_gold: 4 }).affordability, 'conditional');
assert.match(previewEncounterChoice(paidChoice, { moon_gold: 4 }).detail, /Some rolled costs exceed/);
assert.equal(previewEncounterChoice(paidChoice, { moon_gold: 12 }).affordability, 'available');
assert.equal(previewEncounterChoice({ costs: { energy: [4, 10] } }, { energy: 0 }).available, true, 'stat costs are clamped by the server, not currency gates');
assert.equal(previewEncounterChoice({ ...paidChoice, rewards: { moon_gold: [100, 100] } }, { moon_gold: 0 }).available, false, 'future rewards cannot pay entry costs');
assert.equal(previewEncounterChoice({ ...paidChoice, risk: { chance: 0.3, costs: {} } }, { moon_gold: 0 }).affordability, 'conditional', 'an affordable setback must keep the choice open');
assert.equal(previewEncounterChoice({ costs: {}, risk: { chance: 1, costs: { moon_crystals: [1, 2] } } }, { moon_crystals: 0 }).available, false);
assert.equal(previewEncounterChoice({ costs: { moon_gold: [4, 4] }, risk: { chance: 0.5, costs: { moon_crystals: [1, 1] } } }, {}).available, false, 'no branch is affordable even with different currencies');
assert.equal(previewEncounterChoice({ costs: { style_tokens: [3, 3] }, risk: { chance: 0, costs: {} } }, { style_tokens: 2 }).available, false, 'zero-probability free paths cannot open a choice');
assert.equal(previewEncounterChoice(paidChoice).available, undefined, 'catalog-only previews have no wallet authority');
const tradePreview = (gold) => hooks.serializePetRunChoicePreview({ depth: 0 }, hooks.PET_RUN_CHOICE_LIBRARY.trade, { energy: 80, moon_gold: 999 }, [], { moon_gold: gold });
assert.equal(tradePreview(0).available, false, 'the account wallet, not the original pet balance or unbanked loot, pays run costs');
assert.equal(tradePreview(4).affordability, 'conditional');
assert.equal(tradePreview(12).affordability, 'available');
assert.equal(hooks.serializePetRunChoicePreview({ depth: 0 }, hooks.PET_RUN_CHOICE_LIBRARY.fight, { energy: 1 }, [], {}).available, true);


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

const weeklyTargets = { weekly_care:'care', weekly_training:'care', weekly_run:'moon-run', weekly_boss_attempt:'weekly-boss', weekly_check_in:'care' };
for (const [key, focus] of Object.entries(weeklyTargets)) {
  const routes = options.objectiveRoutes(key);
  assert.equal(routes.length, 1); assert.equal(routes[0].focus, focus, key);
  assert.ok(routes[0].detail);
}
assert.match(options.objectiveRoutes('weekly_run')[0].detail, /standard run.*official Daily Run/);
assert.deepEqual(options.objectiveRoutes('pet-daily-adventure:today').map((r) => r.focus), ['adventure','moon-run','districts','story-chains','seasonal-boss']);
assert.deepEqual(options.objectiveRoutes('mission:pet-daily-shop:today').map((r) => r.focus), ['shop','equipment']);
assert.deepEqual(options.objectiveRoutes('pet-daily-bank:today').map((r) => r.focus), ['jobs','care']);
assert.equal(options.objectiveRoutes('__proto__')[0].focus, 'care');
assert.equal(options.route({key:'weekly_journey'}).focus, 'weekly-journey');
assert.equal(options.route({key:'daily_journey'}).focus, 'daily-objectives');

const snapshot = { adopted: true, pet: { pet_id: 'pet-a', energy: 100 }, lifecycle: { phase: 'young' }, daily_run: { available: true }, live_systems: { chains: [{ available: true }] } };
for (const objective of ['daily_combat', 'daily_explorer', 'daily_extraction', 'daily_boss']) {
  assert.equal(options.objectiveRoutes(objective, snapshot)[0].available, true);
  const used = options.objectiveRoutes(objective, { ...snapshot, daily_run: { attempted: true, status: 'failed' } })[0];
  assert.equal(used.available, false); assert.equal(used.title, 'DAILY ATTEMPT USED');
  assert.match(used.detail, /next UTC day/);
  const activeDaily = { ...snapshot, daily_run: { attempted: true, resumable: true, pet_id: 'pet-a', run_id: 'daily-a' }, run: { daily: true, run_id: 'daily-a' } };
  assert.equal(options.objectiveRoutes(objective, activeDaily)[0].available, true);
  assert.equal(options.objectiveRoutes(objective, { ...activeDaily, pet: { pet_id: 'pet-b' } })[0].available, false, 'a different pet cannot inherit daily progress');
  assert.equal(options.objectiveRoutes(objective, { ...activeDaily, run: { daily: true, run_id: 'yesterday' } })[0].available, false);
  assert.equal(options.objectiveRoutes(objective, { ...activeDaily, run: { ...activeDaily.run, source_available: false } })[0].available, false);
}
assert.equal(options.objectiveRoutes('weekly_check_in', { ...snapshot, guidance: { daily_cache: { available: false } } })[0].available, false);
assert.match(options.objectiveRoutes('weekly_check_in', snapshot)[0].detail, /two UTC days/);
assert.equal(options.objectiveRoutes('weekly_check_in', { ...snapshot, guidance: { daily_cache: { available: true } } })[0].available, true);
const partialMissions = { ...snapshot, hydration: { mode: 'missions', full: false, modules: ['missions'] } };
delete partialMissions.daily_run;
delete partialMissions.run;
for (const objective of ['daily_combat','daily_explorer','daily_extraction','daily_boss','weekly_run','weekly_boss_attempt']) {
  const target = options.objectiveRoutes(objective, partialMissions)[0];
  assert.equal(target.screen, 'explore');
  assert.equal(target.available, undefined, `${objective} must not invent availability from omitted Explore authority`);
  assert.match(target.title, /^OPEN /);
  assert.match(target.detail, /Open Explore to check/);
  assert.doesNotMatch(target.detail, /No Weekly Boss attack is available now/);
}
assert.equal(options.objectiveRoutes('weekly_boss_attempt', { ...partialMissions, guidance: { weekly_boss: { available: false } } })[0].available, false, 'known authority remains locked even in a partial snapshot');
assert.equal(options.objectiveRoutes('daily_boss', { ...partialMissions, daily_run: { available: true } })[0].available, true, 'known official-run authority remains available');
assert.equal(options.objectiveRoutes('weekly_boss_attempt', snapshot)[0].available, false);
assert.equal(options.objectiveRoutes('weekly_run', { ...snapshot, run: { depth: 2, source_pet: { pet_id: 'pet-b', energy: 100 } } })[0].available, false);
assert.equal(options.objectiveRoutes('weekly_run', { ...snapshot, run: { depth: 2, source_pet: { pet_id: 'pet-a', energy: 0 } } })[0].available, true);
const seasonReady = { ...snapshot, guidance: { season: { xp: 1000, tiers: [{ title: 'Street Cache', required_xp: 100, unlocked: true, claimed_at: null }] } } };
assert.equal(options.options(seasonReady).find((entry) => entry.key === 'season_claims').focus, 'season');
assert.ok(!options.options({ ...seasonReady, lifecycle: { phase: 'egg' } }).some((entry) => entry.key === 'season_claims'));
assert.equal(options.options({ ...snapshot, guidance: { season: { xp: 20, tiers: [{ title: 'Street Cache', required_xp: 100, unlocked: false }] } } }).find((entry) => entry.key === 'season').detail.startsWith('80 more season XP'), true);
assert.equal(options.options({ ...snapshot, guidance: { season: { xp: 100, tiers: [{ title: 'Street Cache', required_xp: 100, unlocked: true, claimed_at: 'today' }] } } }).find((entry) => entry.key === 'season').title, 'SEASON REWARDS COMPLETE');
assert.ok(options.options(snapshot).some((x) => x.key === 'daily_run'));
assert.ok(options.options(snapshot).some((x) => x.key === 'event_chain'));
assert.ok(!options.options({ ...snapshot, run: { daily: true } }).some((x) => x.key === 'daily_run'));
assert.ok(!options.options({ ...snapshot, daily_run: { available: false } }).some((x) => x.key === 'daily_run'));
assert.deepEqual(options.options({ ...snapshot, lifecycle: { phase: 'egg' } }).map((x) => x.key), ['incubate']);
assert.ok(!options.options({ ...snapshot, pet: { energy: 0 } }).some((x) => x.key === 'run'));
const exhaustedRun = { ...snapshot, run: { daily: false, depth: 0, source_available: true, source_pet: { energy: 0 } } };
assert.deepEqual(options.runAvailability(exhaustedRun), { step: false, extract: false });
assert.ok(!options.options(exhaustedRun).some((entry) => entry.key === 'run'), 'a saved first room at zero source-pet energy is not playable');
const bankableRun = { ...exhaustedRun, run: { ...exhaustedRun.run, depth: 1 } };
assert.deepEqual(options.runAvailability(bankableRun), { step: false, extract: true });
assert.equal(options.runAvailability({ ...bankableRun, run: { ...bankableRun.run, current_room: 0 } }).extract, true, 'standard runs bank their depth even if an older current_room field is zero');
assert.equal(options.runAvailability({ ...bankableRun, run: { ...bankableRun.run, daily: true, current_room: 0 } }).extract, false, 'official extraction uses its current-room authority');
assert.equal(options.options(bankableRun).find((entry) => entry.key === 'run').title, 'EXTRACT SAVED MOON RUN');
const missingRunPet = { ...bankableRun, run: { ...bankableRun.run, source_available: false } };
assert.deepEqual(options.runAvailability(missingRunPet), { step: false, extract: false });
assert.ok(!options.options(missingRunPet).some((entry) => entry.key === 'run'));
assert.deepEqual(options.runAvailability({ ...exhaustedRun, run: { ...exhaustedRun.run, daily: true } }), { step: true, extract: false }, 'official room choices do not require standard-run energy');
assert.deepEqual(options.runAvailability({ ...snapshot, run: { depth: 0, source_pet: { energy: 1 } } }), { step: true, extract: false });
assert.deepEqual(options.runAvailability({}), { step: false, extract: false });
const savedDailyEnding = { ...snapshot, run: { daily: true, current_room: 10, max_room: 10, settlement_pending: true } };
assert.deepEqual(options.runAvailability(savedDailyEnding), { step: false, extract: true });
assert.equal(options.options(savedDailyEnding).find((entry) => entry.key === 'run').title, 'FINISH SAVED DAILY RUN');
const savedDailyGoal = { ...savedDailyEnding, daily_run: { pet_id: 'pet-a', run_id: 'saved-ending', resumable: true }, run: { ...savedDailyEnding.run, run_id: 'saved-ending' } };
assert.equal(options.objectiveRoutes('daily_boss', savedDailyGoal)[0].available, true);
assert.equal(options.objectiveRoutes('daily_boss', savedDailyGoal)[0].title, 'FINISH SAVED DAILY RUN');
assert.equal(options.objectiveRoutes('daily_boss', { ...savedDailyGoal, pet: { pet_id: 'pet-b' } })[0].available, false);


assert.deepEqual(options.options({ adopted: false }), []);
const blockedEvent = { ...snapshot, encounter: { choices: [{ preview: { available: false } }] } };
assert.ok(!options.options(blockedEvent).some((entry) => entry.key === 'random_event'));
assert.equal(options.bountyRouteOptions({ event_types: ['random_event'] }, blockedEvent)[0].available, false);
const freeAlternative = { ...blockedEvent, encounter: { choices: [...blockedEvent.encounter.choices, { preview: { available: true, affordability: 'conditional' } }] } };
assert.ok(options.options(freeAlternative).some((entry) => entry.key === 'random_event'));
assert.equal(options.bountyRouteOptions({ event_types: ['random_event'] }, freeAlternative)[0].available, true);

const weeklyRecovery = { ...snapshot, lifecycle: { phase: 'egg' }, guidance: { weekly_boss: { pending_rewards: [{ week_key: '2026-W38' }] } } };
assert.equal(options.options(weeklyRecovery)[0].key, 'weekly_boss_claim');
assert.equal(options.options(weeklyRecovery)[0].focus, 'weekly-boss');
const contractRecovery = { ...snapshot, lifecycle: { phase: 'egg' }, contracts: { available: false, pending_rewards: [{ contract_id: 'saved-contract', pet_id: 'earlier-pet' }] } };
assert.equal(options.options(contractRecovery)[0].key, 'contract_claim');
assert.equal(options.options(contractRecovery)[0].screen, 'missions');
assert.equal(options.options(contractRecovery)[0].focus, 'contracts');
assert.ok(!options.options(contractRecovery).some((entry) => entry.key === 'contract'), 'saved recovery does not advertise new egg contracts');
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
const replacementEgg = { ...targeted, lifecycle: { phase: 'egg' } };
assert.deepEqual(options.options(replacementEgg).map((c) => c.key), ['bounty_claims', 'incubate']);
assert.equal(options.recommendations(replacementEgg)[0].key, 'bounty_claims', 'Coach surfaces earned account rewards before new egg care');
assert.ok(!options.recommendations(replacementEgg).some(c => c.key === 'bounty_target'), 'egg accounts cannot work on unfinished bounty targets');
const finishedChoices = options.options({ ...snapshot, guidance: { economy: { bounties: [{ ...claimTarget, claimed: true }] } }, contracts: { available: true } });
assert.ok(!finishedChoices.some((c) => ['bounty_claims', 'bounty_target'].includes(c.key)));
assert.ok(finishedChoices.some((c) => c.key === 'contract'));
// Prefer currently playable qualifying bounty routes, not locked/cooling options.
const bountyByKey = Object.fromEntries(PET_DAILY_BOUNTIES.map((b) => [b.key, { ...b, complete: false, claimed: false, progress: 0 }]));
const selectBounty = (extra, keys) => options.options({ ...snapshot, ...extra, guidance: { ...(extra.guidance || {}), economy: { bounties: keys.map((key) => bountyByKey[key]) } } }).find((c) => c.key === 'bounty_target');
assert.equal(selectBounty({ pet: { energy: 0 } }, ['kaiju_watch', 'care_pair']).focus, 'care');
const careCooldowns = { entries: ['feed','play','clean','sleep','train'].map((key) => ({ key: 'action:' + key, remaining_seconds: 60 })) };
for (const key of ['daily_care', 'weekly_care', 'weekly_training']) assert.equal(options.objectiveRoutes(key, { ...snapshot, cooldowns: careCooldowns })[0].available, false);
assert.equal(options.objectiveRoutes('weekly_training', { ...snapshot, guidance: { activity: { status: 'active' } } })[0].available, false);
assert.equal(options.objectiveRoutes('weekly_care', snapshot)[0].available, true);
assert.equal(selectBounty({ cooldowns: careCooldowns, guidance: { jobs: [{ available: true }] } }, ['care_pair','job_shift']).focus, 'jobs');
assert.equal(selectBounty({ pet: { energy: 0 }, adventure: { available: true } }, ['run_bank']).focus, 'adventure');
assert.equal(selectBounty({ run: { daily: true }, adventure: { available: true } }, ['run_bank']).focus, 'adventure', 'official run is not a qualifying standard run event');
assert.equal(selectBounty({ pet: { energy: 0 }, run: { daily: false, depth: 1 } }, ['run_bank']).focus, 'moon-run', 'saved extraction is available at zero energy');
assert.equal(selectBounty({ pet: { energy: 100 }, run: { daily: false, depth: 0, source_pet: { energy: 0 } } }, ['run_bank']), undefined, 'use the saved run pet energy after a slot switch');
assert.equal(selectBounty({ run: { daily: false, depth: 2, source_available: false } }, ['run_bank']), undefined, 'unavailable source pets cannot resume or bank a run');
assert.equal(selectBounty({ guidance: { activity: { ready: false } } }, ['activity_claim']), undefined);
assert.equal(selectBounty({ guidance: { activity: { ready: true, recovery_pending: true } } }, ['activity_claim']).focus, 'timed-activity');
assert.equal(selectBounty({ guidance: { daily_cache: { available: false } } }, ['daily_cache']), undefined);
assert.equal(selectBounty({}, ['item_user']), undefined);
assert.equal(selectBounty({ inventory: [{ key: 'snack', count: 1, usable: true }] }, ['item_user']).focus, 'inventory');
const blockedCare = { ...snapshot, pet: { energy: 0 }, cooldowns: { entries: ['feed','play','clean'].map((key) => ({ key: 'action:' + key, remaining_seconds: 60 })) }, guidance: { activity: { status: 'active' } } };
assert.equal(options.bountyRouteOptions(bountyByKey.care_pair, blockedCare)[0].available, false);
const boardOnly = options.options({ ...blockedCare, contracts: { available: true }, guidance: { ...blockedCare.guidance, economy: { bounties: [bountyByKey.care_pair, bountyByKey.kaiju_watch] } } });
assert.ok(!boardOnly.some((r) => r.key === 'bounty_target'));
assert.ok(boardOnly.some((r) => r.key === 'contract') && boardOnly.some((r) => r.key === 'bounty'));

const raidAtTwelve = { ...snapshot, pet: { energy: 12 }, live_systems: { seasonal_boss: { available: true, choices: [{ energy: 12 }, { energy: 18 }] } } };
assert.ok(options.options(raidAtTwelve).some((c) => c.key === 'seasonal_boss'));
const exhaustedWithClaim = { ...raidAtTwelve, pet: { energy: 0 }, live_systems: { seasonal_boss: { available: false, pending_rewards: [{ boss_key: 'neon_titan' }] } } };
assert.equal(options.options(exhaustedWithClaim)[0].key, 'seasonal_boss_claim');
assert.equal(options.options(exhaustedWithClaim)[0].focus, 'seasonal-boss');
assert.equal(options.options({ ...exhaustedWithClaim, lifecycle: { phase: 'egg' } })[0].key, 'seasonal_boss_claim', 'an egg cannot hide saved raid rewards');
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
const blockedBundle = structuredClone(craftSnapshot);
blockedBundle.guidance.economy.market_offers = blockedBundle.guidance.economy.market_offers.map((offer) => ({ ...offer, capacity: { available: false } }));
assert.ok(!options.craftingGoal(blockedBundle,'battery_pack').routes.some((route) => route.focus === 'market'),
  'server capacity blocks apply to every bundle asset, including ingredients and non-goal items');
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

// Exercise the deployed classic scripts, not an ESM-only approximation.
const context = vm.createContext({ window: {}, Object, Math, JSON, Number, Set });
vm.runInContext(read('js/moonpet-play-options.js'), context);
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
assert.ok(html.indexOf('/js/moonpet-play-options.js') < html.indexOf('/js/moonpet-mini-app.js'));

// Execute the shipped fast-path handler with the refresh response held open.
// A transaction race must refresh immediately and block a second mutation.
const runActionSource = 'var authenticationFailure = false;\n' + client.slice(client.indexOf('  async function runAction('), client.indexOf('  function switchScreen(', client.indexOf('  async function runAction(')));
for (const { reason, accepted, refreshState, pet } of [
  ...['displayed_pet_required','displayed_pet_changed','source_pet_changed','pet_action_state_changed']
    .map(reason => ({ reason, accepted: false, refreshState: false })),
  { reason: 'accepted', accepted: true, refreshState: true },
  { reason: 'accepted', accepted: true, refreshState: false, pet: { pet_id: 'other-pet', pet_xp: 999 } },
]) {
  const calls=[];
  let resolveRefresh;
  const refresh = new Promise(resolve => {resolveRefresh=resolve;});
  let refreshStarted;
  const started = new Promise(resolve => {refreshStarted=resolve;});
  const actionContext=vm.createContext({
    busy:false, petActionRefreshRequired:false, state:{pet:{pet_id:'shown-pet'}}, activeScreen:'home', fastActionStateDirty:true,
    sleepLatched:false, crypto:{randomUUID:()=> 'request'},
    words:value=>value, lifecycleCeremonyActive:()=>false, shouldUseFastActionResponse:()=>true,
    actionAnimationFamily:()=> 'care', animateAction:()=>{}, tell:()=>{}, haptic:()=>{},
    beginStateRequest:()=> calls.length, stateRequestGate:{isCurrent:()=>true},
    resultMessage:()=>reason, stateRefreshPayload:()=>({mode:'core'}), render:()=>{},
    patchFastActionState:()=>{assert.fail('stale state must never be patched');},
    scheduleFastActionStateRefresh:()=>{assert.fail('stale refresh must not wait four seconds');},
    async post(path,body) {
      calls.push({path,body});
      if(path.endsWith('/action'))return {state_pending:true,result:{accepted,reason,refresh_state:refreshState,pet}};
      refreshStarted();return refresh;
    },
  });
  actionContext.setStateSnapshot=(next)=>{actionContext.state=next;actionContext.petActionRefreshRequired=false;return true;};
  vm.runInContext(runActionSource,actionContext);
  const pending=actionContext.runAction('feed',{});
  await started;
  assert.equal(actionContext.busy,true,'controls remain blocked until refresh finishes');
  assert.equal(calls[0].body.displayed_pet_id,'shown-pet');
  await actionContext.runAction('feed',{});
  assert.equal(calls.length,2,'no second action can run during the authoritative refresh');
  resolveRefresh({state:{pet:{pet_id:'fresh-pet'}}});
  await pending;
  assert.equal(actionContext.state.pet.pet_id,'fresh-pet');
  assert.equal(actionContext.busy,false);
  assert.equal(actionContext.fastActionStateDirty,false);
  assert.equal(actionContext.petActionRefreshRequired,false);
}

// A failed projection cannot turn a committed action into a rejected action or
// allow another mutation from the stale view. Refresh retries only the read.
const syncStateSource = client.slice(client.indexOf('  async function syncState('), client.indexOf('  function applyRequestedFocus('));
const setStateSnapshotSource = client.slice(client.indexOf('  function setStateSnapshot('), client.indexOf('  // TEST-EXPORT: cooldownRefresh:start'));
const buttonSource = client.slice(client.indexOf('  function button('), client.indexOf('  var panelOpenState'));
for (const accepted of [true, false]) {
  const calls = [], messages = [], animations = [];
  let failRefresh = true;
  const actionContext = vm.createContext({
    busy: false, petActionRefreshRequired: false, state: { adopted: true, pet: { pet_id: 'shown-pet' }, lifecycle: { phase: 'young' } },
    activeScreen: 'home', fastActionStateDirty: true, sleepLatched: false,
    crypto: { randomUUID: () => 'original-action-request' }, performance: { now: () => 1 },
    words: value => value, lifecycleCeremonyActive: () => false, shouldUseFastActionResponse: () => true,
    actionAnimationFamily: () => 'care', animateAction: (...args) => animations.push(args),
    tell: message => messages.push(message), haptic: () => {}, render: () => {},
    beginStateRequest: () => calls.length, stateRequestGate: { isCurrent: () => true },
    resultMessage: result => result.accepted ? 'Action complete // +6 PET XP' : 'Action unavailable // Nothing was spent or awarded.',
    stateRefreshPayload: () => ({ mode: 'core' }), readSleepLatch: () => false,
    hatchArtTransitionActive: () => false, selectBotArtForState: () => Promise.resolve(), scheduleCooldownRefresh: () => {},
    careActionButtonOptions: (_, value) => value || {}, actionCooldownButtonOptions: (_, value) => value,
    shouldShowAvailability: value => Boolean(value.disabled), availabilityDetailMarkup: value => value.statusLabel,
    escapeHtml: value => String(value),
    patchFastActionState: () => assert.fail('a changed pet must never patch the old snapshot'),
    scheduleFastActionStateRefresh: () => assert.fail('stale reconciliation must begin immediately'),
    async post(path, body) {
      calls.push({ path, body });
      if (path.endsWith('/action')) return { state_pending: true, result: { accepted, reason: accepted ? 'accepted' : 'displayed_pet_changed', refresh_state: true } };
      if (failRefresh) throw new Error('mini_app_state_failed');
      return { state: { adopted: true, pet: { pet_id: 'fresh-pet' }, lifecycle: { phase: 'young' } } };
    },
  });
  vm.runInContext(runActionSource + syncStateSource + setStateSnapshotSource + buttonSource, actionContext);
  await actionContext.runAction('feed', {});
  assert.match(messages.at(-1), /DISPLAY SYNC FAILED\. TAP REFRESH\./);
  assert.equal(messages.at(-1).includes('SAVE CONFIRMED'), accepted, 'committed success must remain explicit after projection failure');
  assert.equal(animations.some(([action, success]) => action === 'blocked' && !success), !accepted,
    'projection failure must not animate a saved action as rejected');
  assert.equal(actionContext.state.pet.pet_id, 'shown-pet');
  assert.equal(actionContext.busy, false, 'read-only Refresh remains usable');
  assert.equal(actionContext.petActionRefreshRequired, true);
  assert.match(actionContext.button('FEED', 'feed'), /disabled/);
  await actionContext.runAction('feed', {});
  assert.equal(calls.length, 2, 'stale controls cannot submit a second mutation after refresh failure');
  failRefresh = false;
  await actionContext.syncState();
  assert.deepEqual(calls.map(call => call.path), ['/telegram-pets/app/action', '/telegram-pets/app/state', '/telegram-pets/app/state'],
    'manual Refresh retries only the authoritative read, never the original action');
  assert.equal(actionContext.state.pet.pet_id, 'fresh-pet');
  assert.equal(actionContext.petActionRefreshRequired, false);
  assert.equal(actionContext.fastActionStateDirty, false);
  assert.doesNotMatch(actionContext.button('FEED', 'feed'), /disabled/);
}

// Full-state actions have the same boundary: a saved purchase followed by a
// failed response projection must not let the stale view submit another action.
for (const accepted of [true, false]) {
  const calls = [], messages = [];
  const actionContext = vm.createContext({
    busy: false, petActionRefreshRequired: false, state: { adopted: true, pet: { pet_id: 'shown-pet' }, lifecycle: { phase: 'young' } },
    activeScreen: 'economy', fastActionStateDirty: false, sleepLatched: false,
    crypto: { randomUUID: () => 'original-purchase-request' }, performance: { now: () => 1 },
    words: value => value, lifecycleCeremonyActive: () => false, shouldUseFastActionResponse: () => false,
    actionAnimationFamily: () => 'equip', animateAction: () => {}, tell: message => messages.push(message), haptic: () => {}, render: () => {},
    beginStateRequest: () => calls.length, stateRequestGate: { isCurrent: () => true },
    resultMessage: result => result.accepted ? 'Action complete // PURCHASE SAVED' : 'Action unavailable // Nothing was spent or awarded.',
    stateRefreshPayload: () => ({}), readSleepLatch: () => false, mergeActionResultCooldown: next => next,
    hatchArtTransitionActive: () => false, selectBotArtForState: () => Promise.resolve(), scheduleCooldownRefresh: () => {},
    careActionButtonOptions: (_, value) => value || {}, actionCooldownButtonOptions: (_, value) => value,
    shouldShowAvailability: value => Boolean(value.disabled), availabilityDetailMarkup: value => value.statusLabel,
    escapeHtml: value => String(value),
    async post(path, body) {
      calls.push({ path, body });
      if (path.endsWith('/action')) return { state: null, result: { accepted, reason: accepted ? 'shop_purchase' : 'displayed_pet_changed', refresh_state: true } };
      return { state: { adopted: true, pet: { pet_id: 'fresh-pet' }, lifecycle: { phase: 'young' } } };
    },
  });
  vm.runInContext(runActionSource + syncStateSource + setStateSnapshotSource + buttonSource, actionContext);
  await actionContext.runAction('buy', { item_key: 'moon_kibble' });
  assert.match(messages.at(-1), /DISPLAY SYNC FAILED\. TAP REFRESH\./);
  assert.equal(messages.at(-1).includes('SAVE CONFIRMED'), accepted);
  assert.equal(actionContext.state.pet.pet_id, 'shown-pet');
  assert.equal(actionContext.petActionRefreshRequired, true);
  assert.equal(actionContext.busy, false);
  assert.match(actionContext.button('BUY', 'buy'), /disabled/);
  await actionContext.runAction('buy', { item_key: 'moon_kibble' });
  assert.equal(calls.length, 1, 'missing full-state projection cannot submit a second purchase');
  await actionContext.syncState();
  assert.deepEqual(calls.map(call => call.path), ['/telegram-pets/app/action', '/telegram-pets/app/state']);
  assert.equal(actionContext.state.pet.pet_id, 'fresh-pet');
  assert.equal(actionContext.petActionRefreshRequired, false);
  assert.doesNotMatch(actionContext.button('BUY', 'buy'), /disabled/);
}

// A transport loss can occur after the server commits. A malformed response
// gives no authority either: never infer rejection or submit a fresh mutation.
for (const fastResponse of [true, false]) for (const fault of ['transport', 'empty', 'malformed-result']) {
  const calls = [], messages = [];
  const actionContext = vm.createContext({
    busy: false, petActionRefreshRequired: false, state: { adopted: true, pet: { pet_id: 'shown-pet' }, lifecycle: { phase: 'young' } },
    activeScreen: 'home', fastActionStateDirty: false, sleepLatched: false,
    crypto: { randomUUID: () => 'unconfirmed-request' }, performance: { now: () => 1 },
    words: value => value, lifecycleCeremonyActive: () => false, shouldUseFastActionResponse: () => fastResponse,
    actionAnimationFamily: () => 'care', animateAction: () => {}, tell: message => messages.push(message), haptic: () => {}, render: () => {},
    beginStateRequest: () => calls.length, stateRequestGate: { isCurrent: () => true },
    resultMessage: () => assert.fail('an unconfirmed response cannot be described as an accepted or rejected action'),
    stateRefreshPayload: () => ({ mode: 'core' }), readSleepLatch: () => false,
    hatchArtTransitionActive: () => false, selectBotArtForState: () => Promise.resolve(), scheduleCooldownRefresh: () => {},
    async post(path, body) {
      calls.push({ path, body });
      if (path.endsWith('/action')) {
        if (fault === 'transport') throw new Error('connection_reset_after_commit');
        return fault === 'empty' ? {} : { result: { accepted: 'true' } };
      }
      return { state: { adopted: true, pet: { pet_id: 'shown-pet', pet_xp: 106 }, lifecycle: { phase: 'young' } } };
    },
  });
  vm.runInContext(runActionSource + syncStateSource + setStateSnapshotSource, actionContext);
  await actionContext.runAction(fastResponse ? 'feed' : 'trade', {});
  assert.match(messages.at(-1), /ACTION RESPONSE UNCONFIRMED.*TAP REFRESH/);
  assert.doesNotMatch(messages.at(-1), /SAVE CONFIRMED|Nothing was spent|Action unavailable/);
  assert.equal(actionContext.petActionRefreshRequired, true);
  assert.equal(actionContext.busy, false);
  await actionContext.runAction(fastResponse ? 'feed' : 'trade', {});
  assert.equal(calls.length, 1, 'a lost response cannot immediately replay with a new request ID');
  await actionContext.syncState();
  assert.deepEqual(calls.map(call => call.path), ['/telegram-pets/app/action', '/telegram-pets/app/state']);
  assert.equal(actionContext.state.pet.pet_xp, 106);
  assert.equal(actionContext.petActionRefreshRequired, false);
}

// An accepted incubation Rest can race another session's pet switch before
// the full projection returns. Its saved sleep preference belongs to Pet A.
const sleepLatchSource = client.slice(client.indexOf('  function currentPetSleepKey('), client.indexOf('  function launchParameter('));
for (const selectedSleeping of [false, true]) {
  const saved = new Map([['sleep-test', JSON.stringify({ 'selected-pet': selectedSleeping })]]);
  const source = { adopted: true, pet: { pet_id: 'source-egg' }, lifecycle: { phase: 'egg' } };
  const actionContext = vm.createContext({
    state: source, activeScreen: 'home', busy: false, petActionRefreshRequired: false, sleepLatched: false,
    SLEEP_LATCH_STORAGE_KEY: 'sleep-test', fastActionStateDirty: false,
    window: { localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) } },
    crypto: { randomUUID: () => 'rest-source-egg' }, performance: { now: () => 1 },
    words: value => value, lifecycleCeremonyActive: () => false, shouldUseFastActionResponse: () => false,
    actionAnimationFamily: () => 'sleep', animateAction: () => {}, tell: () => {}, haptic: () => {}, render: () => {},
    beginStateRequest: () => 1, stateRequestGate: { isCurrent: () => true }, resultMessage: () => 'SAVED',
    mergeActionResultCooldown: snapshot => snapshot, hatchArtTransitionActive: () => false,
    selectBotArtForState: () => Promise.resolve(), scheduleCooldownRefresh: () => {},
    planLifecycleCeremony: () => null, showPendingNotices: async () => {}, startLifecycleCeremony: () => {},
    async post() { return { result: { accepted: true, refresh_state: true }, state: {
      adopted: true, pet: { pet_id: 'selected-pet' }, lifecycle: { phase: 'young' },
    } }; },
  });
  vm.runInContext(sleepLatchSource + runActionSource + setStateSnapshotSource, actionContext);
  await actionContext.runAction('incubate', { care_type: 'rest' });
  assert.equal(actionContext.state.pet.pet_id, 'selected-pet');
  assert.equal(actionContext.sleepLatched, selectedSleeping, 'the selected pet keeps its own sleep preference');
  assert.equal(JSON.parse(saved.get('sleep-test'))['source-egg'], true);
  assert.equal(JSON.parse(saved.get('sleep-test'))['selected-pet'], selectedSleeping);
  actionContext.setSleepLatch(false, source);
  assert.equal(actionContext.sleepLatched, selectedSleeping, 'a delayed wake preference also stays with its source');
}

// A notice acknowledgement is another authoritative read. It can select Pet B
// after Pet A evolved, and must not start A's animation/lock on that companion.
const noticesSource = client.slice(client.indexOf('  async function showPendingNotices('), client.indexOf('  function actionAnimationFamily('));
const lifecycleSource = client.slice(client.indexOf('  // TEST-EXPORT: lifecycleDirector:start'), client.indexOf('  function scrollToPanel('));
for (const changedDuringNotices of [true, false]) {
  const requests = [], animations = [];
  const original = { adopted: true, pet: { pet_id: 'evolving-pet', season_key: '2026-S4', evolution_stage: 1, stage: 'Street Moonpet' }, lifecycle: { phase: 'young' } };
  const evolved = { ...original, pet: { ...original.pet, evolution_stage: 2, stage: 'Cyber Moonpet' }, lifecycle: { phase: 'adult' }, notices: [{ key: 'evolved', scope: 'pet', pet_id: 'evolving-pet', season_key: '2026-S4', title: 'New progress' }] };
  const selected = changedDuringNotices ? { adopted: true, pet: { pet_id: 'selected-egg', evolution_stage: 0 }, lifecycle: { phase: 'egg' } } : evolved;
  const actionContext = vm.createContext({
    state: original, activeScreen: 'profile', busy: false, noticesBusy: false, petActionRefreshRequired: false, sleepLatched: false,
    lifecycleCeremony: null, lifecycleCeremonyUntil: 0, lifecycleCeremonyTimer: 0, lifecycleCeremonyStartedAt: 0, reducedMotion: false,
    window: { clearTimeout: () => {} }, crypto: { randomUUID: () => 'evolve-source-pet' }, performance: { now: () => 1 },
    words: value => value, resolveMoonpetDisplayName: () => 'UNKNOWN', shouldUseFastActionResponse: () => false,
    actionAnimationFamily: () => 'evolve', animateAction: (...args) => animations.push(args), tell: () => {}, haptic: () => {}, render: () => {},
    beginStateRequest: () => requests.length, stateRequestGate: { isCurrent: () => true }, resultMessage: () => 'SAVED',
    mergeActionResultCooldown: snapshot => snapshot, hatchArtTransitionActive: () => false,
    readSleepLatch: () => false, selectBotArtForState: () => Promise.resolve(), scheduleCooldownRefresh: () => {},
    async post(path, body) { requests.push(body.action); return { result: { accepted: true }, state: body.action === 'guidance_ack' ? selected : evolved }; },
  });
  vm.runInContext(runActionSource + setStateSnapshotSource + noticesSource + lifecycleSource, actionContext);
  await actionContext.runAction('evolve', {});
  assert.deepEqual(requests, ['evolve', 'guidance_ack']);
  assert.equal(actionContext.state.pet.pet_id, selected.pet.pet_id);
  assert.equal(actionContext.petActionRefreshRequired, false, 'a valid changed-pet read is not a connection failure');
  assert.equal(actionContext.lifecycleCeremonyActive(), !changedDuringNotices, 'a notice refresh cannot transfer an evolution lock to another pet');
  assert.equal(animations.length, changedDuringNotices ? 1 : 2, 'only the original pet receives the confirmed evolution animation');
  if (!changedDuringNotices) {
    actionContext.state = { pet: { pet_id: 'later-selected-pet' } };
    assert.equal(actionContext.lifecycleCeremonyActive(), false, 'a later passive pet switch releases the previous pet ceremony lock');
  }
}

// Earned account bounties remain claimable after deleting the only hatched pet.
// The shipped Economy renderer still offers no claim for unfinished bounties.
const economySource = client.slice(client.indexOf('  function valueText('), client.indexOf('  function renderProfile('));
const bountyContext = vm.createContext({
  state: { adopted: true, pet: { pet_id: 'replacement-egg' }, lifecycle: { phase: 'egg' }, guidance: { economy: { bounties: [
    { key: 'triple_care', title: 'Full Care Circuit', progress: 3, required: 3, complete: true, claimed: false, reward: { moon_gold: 45 } },
    { key: 'job_shift', title: 'Clock In', progress: 0, required: 1, complete: false, claimed: false, reward: { moon_gold: 35 } },
  ] } } },
  petActionRefreshRequired: false, window: { MoonpetPlayOptions: options },
  careActionButtonOptions: (_, value) => value || {}, actionCooldownButtonOptions: (_, value) => value,
  shouldShowAvailability: value => Boolean(value.disabled), availabilityDetailMarkup: value => value.statusLabel,
  escapeHtml: value => String(value), words: value => String(value), number: value => Number(value || 0),
  panel: (_, body) => body, craftingGoalMarkup: () => '',
  routeButton: (label, route) => '<button data-jump="' + route.screen + '">' + label + '</button>',
});
vm.runInContext(economySource + buttonSource, bountyContext);
const eggEconomy = bountyContext.renderEconomy();
const readyBountyButtons = eggEconomy.match(/<button\b[^>]*data-action="bounty_claim"[^>]*>/g) || [];
assert.equal(readyBountyButtons.length, 1);
assert.match(readyBountyButtons[0], /triple_care/);
assert.doesNotMatch(readyBountyButtons[0], /\bdisabled\b/, 'already-earned currencies can be claimed by an egg account');
assert.match(eggEconomy, /HATCH TO WORK ON BOUNTIES/, 'unfinished targets retain their hatch route');
assert.match(bountyContext.button('FEED', 'feed'), /\bdisabled\b/, 'allowing saved bounty claims does not unlock egg gameplay');
bountyContext.petActionRefreshRequired = true;
assert.match(bountyContext.renderEconomy().match(/<button\b[^>]*data-action="bounty_claim"[^>]*>/)[0], /\bdisabled\b/,
  'saved currency claims still respect the authoritative-refresh lock');

// Execute both shipped hydration and rendering: the last failed request must
// replace the loading screen with the manual retry, without clearing action locks.
const hydrationSource = client.split('// TEST-EXPORT: coreStateHydration:start')[1].split('// TEST-EXPORT: coreStateHydration:end')[0];
const renderSource = 'var authenticationFailure = false;\n' + client.slice(client.indexOf('  function render(options)'), client.indexOf('  // TEST-EXPORT: actionResultFeedback:start'));
const refreshPayloadContext = vm.createContext({});
vm.runInContext(hydrationSource, refreshPayloadContext);
for (const moduleScreen of ['profile', 'economy', 'explore', 'work']) {
  const payload = refreshPayloadContext.stateRefreshPayload({ hydration: { full: false, modules: ['home'] } }, moduleScreen);
  assert.equal(payload.mode, undefined, 'Refresh must load the visible full-state module instead of returning another core snapshot');
}
assert.equal(refreshPayloadContext.stateRefreshPayload({ hydration: { full: false } }, 'home').mode, 'core');
assert.equal(refreshPayloadContext.stateRefreshPayload({ hydration: { full: false } }, 'missions').mode, 'missions');
for (const moduleScreen of ['missions', 'profile']) {
  const calls = [], timers = [];
  let failModule = true;
  const moduleContext = vm.createContext({
    state: { adopted: true, pet: { pet_id: 'shown-pet' }, lifecycle: { phase: 'young' }, hydration: { full: false, modules: ['home'] } },
    activeScreen: moduleScreen, screen: { scrollTop: 0, innerHTML: '' },
    fullStateHydrationPromise: null, fullStateHydrationRetryTimer: 0, fullStateHydrationFailures: 0,
    fullStateHydrationRetryDelayMs: 0, FULL_STATE_HYDRATION_MAX_AUTO_RETRIES: 3,
    petActionRefreshRequired: true, fastActionStateDirty: true, reducedMotion: false,
    renderedPetId: 'shown-pet', renderedPetName: '', performance: { now: () => 1 },
    document: { getElementById: () => null },
    window: { clearTimeout() {}, setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; } },
    words: value => value, tell: () => {}, beginStateRequest: () => calls.length,
    stateRequestGate: { isCurrent: () => true }, readSleepLatch: () => false,
    hatchArtTransitionActive: () => false, selectBotArtForState: () => Promise.resolve(), scheduleCooldownRefresh: () => {},
    renderHud: () => {}, renderNav: () => {}, renderCanvasTools: () => {},
    captureEditableState: () => null, rememberPanels: () => {}, restoreEditableState: () => {},
    panel: (_, body) => body, routeButton: () => '<button data-jump="home">RETURN HOME</button>', renderRecommended: () => '',
    showPendingNotices: async () => {}, applyRequestedFocus: () => {},
    careActionButtonOptions: (_, value) => value || {}, actionCooldownButtonOptions: (_, value) => value,
    shouldShowAvailability: value => Boolean(value.disabled), availabilityDetailMarkup: value => value.statusLabel,
    escapeHtml: value => String(value),
    async post(path, payload) {
      calls.push({ path, payload });
      if (failModule) throw Error('mini_app_state_failed');
      return { state: { adopted: true, pet: { pet_id: 'fresh-pet' }, lifecycle: { phase: 'young' },
        hydration: { full: moduleScreen === 'profile', modules: ['home', moduleScreen] } } };
    },
  });
  moduleContext.screens = {
    home: () => 'HOME', missions: () => moduleContext.button('FEED', 'feed'), profile: () => moduleContext.button('FEED', 'feed'),
  };
  vm.runInContext(hydrationSource + renderSource + setStateSnapshotSource + buttonSource, moduleContext);
  await moduleContext.hydrateFullState(moduleScreen);
  await moduleContext.hydrateFullState(moduleScreen);
  assert.doesNotMatch(moduleContext.screen.innerHTML, /RETRY MODULE/, 'automatic retries still show a loading screen');
  await moduleContext.hydrateFullState(moduleScreen);
  assert.equal(moduleContext.fullStateHydrationPromise, null);
  assert.equal(timers.length, 2, 'no fourth automatic module request is scheduled');
  assert.match(moduleContext.screen.innerHTML, /MODULE STATE COULD NOT LOAD/);
  assert.match(moduleContext.screen.innerHTML, /data-utility="module-retry"/);
  assert.doesNotMatch(moduleContext.screen.innerHTML, /FETCHING SERVER-AUTHORITATIVE/);
  assert.equal(moduleContext.petActionRefreshRequired, true, 'failed module reads preserve the mutation lock');
  assert.match(moduleContext.button('FEED', 'feed'), /disabled/);
  moduleContext.activeScreen = 'home';
  await moduleContext.hydrateFullState(moduleScreen);
  assert.equal(moduleContext.screen.innerHTML, 'HOME', 'a finished request does not restore a module after returning Home');
  assert.equal(timers.length, 2, 'returning Home leaves automatic module retries stopped');
  moduleContext.activeScreen = moduleScreen;
  failModule = false;
  await moduleContext.hydrateFullState(moduleScreen, { manual: true });
  assert.equal(moduleContext.fullStateHydrationFailures, 0);
  assert.equal(moduleContext.state.pet.pet_id, 'fresh-pet');
  assert.equal(moduleContext.petActionRefreshRequired, false, 'only a valid authoritative snapshot restores actions');
  assert.doesNotMatch(moduleContext.screen.innerHTML, /RETRY MODULE|disabled/);
  assert.ok(calls.every(call => call.path.endsWith('/state')), 'manual retry reads state without replaying a mutation');
  moduleContext.authenticationFailure = true;
  moduleContext.petActionRefreshRequired = true;
  assert.equal(moduleContext.setStateSnapshot({ adopted: true, pet: { pet_id: 'late-pet' } }, 0), false,
    'a late successful read cannot restore mutation authority after this session was rejected');
  assert.equal(moduleContext.state.pet.pet_id, 'fresh-pet');
  assert.equal(moduleContext.petActionRefreshRequired, true);
  moduleContext.render();
  assert.match(moduleContext.screen.innerHTML, /OPEN FRESH TELEGRAM SESSION/);
  assert.doesNotMatch(moduleContext.screen.innerHTML, /data-action=/);
}

// A temporary CDN/network fault must not poison an art promise for the whole
// session. Refresh can recover the registry, manifest, idle and later actions.
const artRegistry = JSON.parse(read('data/moonpet-bot-art-registry.json'));
const artManifest = JSON.parse(read(artRegistry.egg_art.manifest_path.slice(1)));
const idleArt = artManifest.assets.find(asset => asset.role === artManifest.runtime_role_map.idle);
const actionArt = artManifest.assets.find(asset => asset.role !== idleArt.role && asset.atlas_path);
for (const failedPath of ['/data/moonpet-bot-art-registry.json', artRegistry.egg_art.manifest_path, idleArt.atlas_path, idleArt.png_path, actionArt.atlas_path]) {
  let offline = true, failedRequests = 0;
  const artContext = vm.createContext({ window: { MOONPET_USE_BOT_ART: true },
    async fetch(url) {
      const pathname = String(url).split('?')[0];
      if (pathname === failedPath) { failedRequests++; if (offline) throw Error('temporary_art_outage'); }
      return { ok: true, json: async () => JSON.parse(read(pathname.slice(1))) };
    },
    Image: class {
      set src(url) {
        const pathname = String(url).split('?')[0];
        if (pathname === failedPath) failedRequests++;
        queueMicrotask(() => pathname === failedPath && offline ? this.onerror() : this.onload());
      }
    },
  });
  vm.runInContext(read('js/moonpet-bot-art-loader.js') + read('js/moonpet-bot-art-renderer.js'), artContext);
  const art = artContext.window.MoonpetBotArtRenderer;
  await art.selectMoonpetBot({ evolutionStage: 0 });
  // Wait for the finite asset-preload jobs, including a fault after idle loaded.
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(failedRequests > 0, failedPath);
  offline = false;
  const repaired = await art.selectMoonpetBot({ evolutionStage: 0 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(repaired.ready, true, 'art recovers without reloading the game: ' + failedPath);
  assert.equal(repaired.errors.length, 0, failedPath);
  assert.ok(repaired.assetsByRole[actionArt.role], 'failed secondary animation can be retried after idle became ready');
  assert.ok(failedRequests >= 2, 'the failed resource is requested again: ' + failedPath);
}
for (const method of ['loadMoonpetBackground', 'loadMoonpetItemArtRegistry']) {
  let attempts = 0;
  const artContext = vm.createContext({ window: {}, async fetch() {
    attempts++;
    if (attempts === 1) throw Error('temporary_registry_outage');
    return { ok: true, json: async () => ({ default_background: '/background.png', bots: {} }) };
  } });
  vm.runInContext(read('js/moonpet-art-resolver.js'), artContext);
  await assert.rejects(artContext.window.MoonpetArtResolver[method](), /temporary_registry_outage/);
  await artContext.window.MoonpetArtResolver[method]();
  assert.equal(attempts, 2, method + ' retries a failed registry');
}

console.log(`Moonpet player loop tests passed: ${new Set(actionButtons).size} literal action buttons.`);

// The actual notice presenter rejects foreign/legacy provenance and acknowledges
// only the one title the player sees, carrying its immutable source to the server.
for (const mode of ['foreign-only', 'mixed', 'account']) {
  const requests = [], displayed = [];
  const own = { key: 'owned-notice', scope: 'pet', pet_id: 'notice-pet', season_key: '2026-S3', title: 'Own achievement' };
  const other = { ...own, key: 'other-notice', pet_id: 'other-pet', title: 'Other pet achievement' };
  const legacy = { key: 'unassigned-old-notice', title: 'Legacy achievement' };
  const account = { key: 'account-notice', scope: 'account', pet_id: null, season_key: '2026-S2', title: 'Historical season reward' };
  const notices = mode === 'foreign-only' ? [other, legacy] : mode === 'account' ? [account] : [other, legacy, own, { ...own, key: 'later-owned-notice' }, account];
  const context = vm.createContext({
    state: { pet: { pet_id: own.pet_id, season_key: own.season_key }, notices }, noticesBusy: false,
    haptic: () => {}, tell: text => displayed.push(text), render: () => {},
    beginStateRequest: () => 1, setStateSnapshot: () => true, crypto: { randomUUID: () => 'notice-request' },
    post: async (_path, body) => { requests.push(body); return { state: {} }; },
  });
  vm.runInContext(noticesSource, context);
  await context.showPendingNotices();
  if (mode === 'foreign-only') {
    assert.equal(requests.length, 0); assert.equal(displayed.length, 0);
  } else {
    assert.equal(requests.length, 1); assert.equal(displayed.length, 1);
    const expected = mode === 'account' ? account : own;
    assert.equal(displayed[0], expected.title);
    assert.deepEqual(JSON.parse(JSON.stringify(requests[0].notices)), [{ key: expected.key, scope: expected.scope, pet_id: expected.pet_id, season_key: expected.season_key }]);
  }
}
