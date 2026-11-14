import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CARE_FRACTIONS,
  CARE_STANDING_BASIS,
  HORIZONS,
  PENALTY_MODELS,
  PET_COUNTS,
  RECOMMENDED_POLICY,
  SOURCE_ECONOMY,
  XP_REFERENCE_BUNDLES,
  buildSummary,
  estimateUnattendedCondition,
  estimateYearEffect,
  multiplierForStreak,
  simulate,
  simulateGrindingCycle,
  simulateRecovery,
} from './moonpet-neglect-simulator.mjs';
import { getPetXpRequiredForVisibleLevel } from '../workers/moonboys-api/pets/progression-phase-2.js';

const repositoryFile = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('source economy constants remain tied to authoritative code', () => {
  const worker = repositoryFile('workers/moonboys-api/worker.js');
  const completion = repositoryFile('workers/moonboys-api/pets/completion-policy.js');
  const contracts = repositoryFile('workers/moonboys-api/pets/continuing-contracts.js');
  assert.match(worker, /const PETS_DAILY_PET_XP_CAP = 1200;/);
  assert.match(worker, /const PETS_DAILY_COMMUNITY_XP_CAP = 250;/);
  assert.match(worker, /const PETS_ACTION_COOLDOWN_SECONDS = 45;/);
  for (const [action, reward] of Object.entries({
    feed: [6, 2], play: [10, 3], clean: [6, 2], sleep: [5, 1], train: [20, 6],
  })) {
    assert.match(worker, new RegExp(`${action}:\\s*\\{ pet_xp: ${reward[0]},\\s*community_xp: ${reward[1]}`));
    assert.equal(SOURCE_ECONOMY.directActions[action].petXp, reward[0]);
    assert.equal(SOURCE_ECONOMY.directActions[action].communityXp, reward[1]);
  }
  assert.match(worker, /energy_drink: Object\.freeze\(\{ cooldown_seconds: 600, daily_limit: 3 \}\)/);
  assert.match(worker, /dance: Object\.freeze\(\{ cooldown_seconds: 300, daily_limit: 5 \}\)/);
  assert.match(worker, /cuddles: Object\.freeze\(\{ cooldown_seconds: 300, daily_limit: 5 \}\)/);
  assert.match(worker, /available_pet_xp: Math\.min\(40,/);
  assert.match(completion, /DAILY_COMPLETION_REWARD = Object\.freeze\(\{ pet_xp: 25,/);
  assert.match(contracts, /CONTRACT_BONUS_LIMIT = 3;/);
  assert.match(contracts, /CONTRACT_BONUS_XP = 20;/);
  assert.equal(CARE_STANDING_BASIS, 22);
  assert.deepEqual(XP_REFERENCE_BUNDLES.map(bundle => bundle.petXp), [62, 87, 172]);
});

test('365-day evolution and visible-level thresholds remain permanent authority', () => {
  const evolutions = JSON.parse(repositoryFile('workers/moonboys-api/pets/content/evolutions.json'));
  const legendary = evolutions.find(entry => entry.evolution_id === 'legendary_moon_guardian');
  assert.deepEqual(
    {
      minimumAgeDays: legendary.requirements.min_age_days,
      petLevel: legendary.requirements.pet_level,
      growthMarks: legendary.requirements.growth_marks,
      weeklyCrests: legendary.requirements.weekly_crests,
    },
    SOURCE_ECONOMY.legendaryRequirements,
  );
  for (const [level, xp] of Object.entries(SOURCE_ECONOMY.visibleLevelPetXp)) {
    assert.equal(getPetXpRequiredForVisibleLevel(Number(level)), xp);
  }
});

test('all required horizons, partial-care levels, pet counts, and models are emitted', () => {
  const summary = buildSummary();
  assert.deepEqual([...new Set(summary.modelComparison.map(row => row.days))], HORIZONS);
  assert.deepEqual([...new Set(summary.modelComparison.map(row => row.model))], Object.keys(PENALTY_MODELS));
  assert.deepEqual([...new Set(summary.partialCareComparison.map(row => row.carePattern))], CARE_FRACTIONS.map(row => row.key));
  assert.deepEqual([...new Set(summary.multiPet.map(row => row.petCount))], PET_COUNTS);
});

test('models hit requested day 1 and day 7 multipliers and cap thereafter', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(PENALTY_MODELS).map(([key, model]) =>
      [key, [multiplierForStreak(key, 1), multiplierForStreak(key, 7), multiplierForStreak(key, 8), model.maximumMultiplier]])),
    {
      moderate: [2, 4, 4, 4],
      aggressive: [2, 8, 8, 8],
      severe: [3, 10, 10, 10],
    },
  );
  assert.deepEqual(
    Object.keys(PENALTY_MODELS).map(model => simulate({ days: 365, model }).rawDebtAssessed),
    [31966, 63778, 79761],
  );
});

test('partial-care debit is proportional but incomplete care continues the streak', () => {
  const none = simulate({ days: 3, model: 'aggressive', caredFraction: 0 });
  const half = simulate({ days: 3, model: 'aggressive', caredFraction: 0.5 });
  assert.equal(half.rawDebtAssessed, none.rawDebtAssessed / 2);

  const trivialResetAttempt = simulate({ days: 3, model: 'aggressive', careSchedule: [0, 1 / 3, 1] });
  assert.deepEqual(trivialResetAttempt.rows.map(row => row.streak), [1, 2, 0]);
  assert.deepEqual(trivialResetAttempt.rows.map(row => row.multiplier), [2, 3, 0]);
  assert.equal(trivialResetAttempt.rows[1].missedPercent, 66.6667);
  assert.equal(trivialResetAttempt.rows[1].rawDebit, 44);
});

test('aggressive full abandonment reaches a bounded 35-basis debt after one week', () => {
  const week = simulate({ days: 7, model: 'aggressive' });
  assert.equal(week.rawDebtAssessed, 770);
  assert.equal(week.endingDebt, RECOMMENDED_POLICY.maxDebt);
  assert.equal(RECOMMENDED_POLICY.maxDebt, CARE_STANDING_BASIS * 35);
  for (const days of [14, 30, 90, 365]) {
    assert.equal(simulate({ days, model: 'aggressive' }).endingDebt, RECOMMENDED_POLICY.maxDebt);
  }
});

test('full care stops escalation and clears max debt through real care plus bounded withholding', () => {
  const expectedDays = new Map([[62, 24], [87, 21], [172, 15]]);
  for (const bundle of XP_REFERENCE_BUNDLES) {
    const recovery = simulateRecovery({ absenceDays: 7, model: 'aggressive', grossDailyPetXp: bundle.petXp });
    assert.equal(recovery.daysToClear, expectedDays.get(bundle.petXp));
    assert.equal(recovery.debtAfter, 0);
    assert.ok(recovery.recoveryPetXpWithheld > 0);
    assert.equal(recovery.lifetimePetXpDeducted, 0);
  }
  assert.equal(simulateRecovery({
    absenceDays: 7,
    model: 'aggressive',
    grossDailyPetXp: 0,
  }).daysToClear, 35);
});

test('grind-and-disappear cycles cannot prepay attendance or avoid a disadvantage', () => {
  const run = simulateGrindingCycle({ model: 'aggressive', cycles: 12, careDays: 3, absenceDays: 4, grossDailyPetXp: 172 });
  assert.equal(run.calendarDays, 84);
  assert.ok(run.futurePetXpWithheld > 1200);
  assert.equal(run.endingDebt, RECOMMENDED_POLICY.maxDebt);
  assert.equal(run.lifetimePetXpDeducted, 0);
});

test('account debt is not multiplied by permanent pet count', () => {
  const one = simulate({ days: 30, model: 'aggressive', petCount: 1 });
  const five = simulate({ days: 30, model: 'aggressive', petCount: 5 });
  assert.equal(five.endingDebt, one.endingDebt);
  assert.equal(five.rawDebtAssessed, one.rawDebtAssessed);
  assert.equal(five.naivePerPetRawDebt, one.naivePerPetRawDebt * 5);
});

test('Telegram reminder preference has no effect on care requirements or debt', () => {
  const enabled = simulate({ days: 7, model: 'aggressive', notificationsEnabled: true });
  const disabled = simulate({ days: 7, model: 'aggressive', notificationsEnabled: false });
  assert.equal(enabled.endingDebt, disabled.endingDebt);
  assert.equal(enabled.endingStreak, disabled.endingStreak);
});

test('condition projection exactly follows current authoritative no-care decay rates', () => {
  assert.deepEqual(estimateUnattendedCondition(1), {
    days: 1, hunger: 100, happiness: 32.8, cleanliness: 23.2, energy: 47.2, health: 26,
  });
  assert.deepEqual(estimateUnattendedCondition(3), {
    days: 3, hunger: 100, happiness: 0, cleanliness: 0, energy: 0, health: 0,
  });
});

test('year effect separates missed-play opportunity cost from policy withholding', () => {
  const effect = estimateYearEffect({ model: 'aggressive', absenceDays: 7, grossDailyPetXp: 87 });
  assert.equal(effect.absenceOpportunityCost, 609);
  assert.equal(effect.policySpecificWithholding, 316.55);
  assert.equal(effect.earnedXpRemoved, 0);
  assert.equal(effect.endingDebt, 0);
  assert.equal(effect.equivalentFullyActiveDaysLost, 10.64);
});

test('invalid model inputs fail closed', () => {
  assert.throws(() => simulate({ days: 1, caredFraction: 1.1 }), /care fraction/);
  assert.throws(() => simulate({ days: 1, careSchedule: [] }), /care schedule/);
  assert.throws(() => simulate({ days: 1, model: 'unknown' }), /unknown penalty model/);
  assert.throws(() => simulate({ days: 1, grossDailyPetXp: -1 }), /grossDailyPetXp/);
});
