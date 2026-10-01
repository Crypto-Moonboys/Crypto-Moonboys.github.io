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
assert.deepEqual(options.options({ ...targeted, lifecycle: { phase: 'egg' } }).map((c) => c.key), ['incubate']);
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
const runActionSource = client.slice(client.indexOf('  async function runAction('), client.indexOf('  function switchScreen(', client.indexOf('  async function runAction(')));
for (const reason of ['displayed_pet_required','displayed_pet_changed','source_pet_changed','pet_action_state_changed']) {
  const calls=[];
  let resolveRefresh;
  const refresh = new Promise(resolve => {resolveRefresh=resolve;});
  let refreshStarted;
  const started = new Promise(resolve => {refreshStarted=resolve;});
  const actionContext=vm.createContext({
    busy:false, state:{pet:{pet_id:'shown-pet'}}, activeScreen:'home', fastActionStateDirty:true,
    sleepLatched:false, crypto:{randomUUID:()=> 'request'},
    words:value=>value, lifecycleCeremonyActive:()=>false, shouldUseFastActionResponse:()=>true,
    actionAnimationFamily:()=> 'care', animateAction:()=>{}, tell:()=>{}, haptic:()=>{},
    beginStateRequest:()=> calls.length, stateRequestGate:{isCurrent:()=>true},
    resultMessage:()=>reason, stateRefreshPayload:()=>({mode:'core'}), render:()=>{},
    patchFastActionState:()=>{assert.fail('stale state must never be patched');},
    scheduleFastActionStateRefresh:()=>{assert.fail('stale refresh must not wait four seconds');},
    async post(path,body) {
      calls.push({path,body});
      if(path.endsWith('/action'))return {state_pending:true,result:{accepted:false,reason}};
      refreshStarted();return refresh;
    },
  });
  actionContext.setStateSnapshot=(next)=>{actionContext.state=next;return true;};
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
}

console.log(`Moonpet player loop tests passed: ${new Set(actionButtons).size} literal action buttons.`);
