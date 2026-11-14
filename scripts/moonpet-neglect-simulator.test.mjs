import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CARE_FRACTIONS,
  CARE_STANDING_BASIS,
  CURRENT_POLICY,
  DEBT_CAP_MODELS,
  HORIZONS,
  PENALTY_MODELS,
  PET_COUNTS,
  RECOMMENDED_POLICY,
  SOURCE_ECONOMY,
  WITHHOLDING_MODELS,
  XP_REFERENCE_BUNDLES,
  buildDebtCapComparison,
  buildExploitScenarios,
  buildProgressionProjections,
  buildStressPolicy,
  buildStressSummary,
  buildSuccessThresholdReport,
  buildSummary,
  buildWithholdingComparison,
  estimateUnattendedCondition,
  estimateYearEffect,
  multiplierForStreak,
  resolveDebtCap,
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
  assert.deepEqual(XP_REFERENCE_BUNDLES.map(bundle => bundle.petXp), [62, 87, 172, 264, 1200]);
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
  assert.equal(Math.ceil(SOURCE_ECONOMY.visibleLevelPetXp[50] / 365), 264);
});

test('all required horizons, care fractions, pet counts, and models are emitted', () => {
  const summary = buildSummary();
  assert.deepEqual([...new Set(summary.modelComparison.map(row => row.days))], HORIZONS);
  assert.ok(HORIZONS.includes(180));
  assert.deepEqual([...new Set(summary.modelComparison.map(row => row.model))], Object.keys(PENALTY_MODELS));
  assert.deepEqual([...new Set(summary.partialCareComparison.map(row => row.carePattern))], CARE_FRACTIONS.map(row => row.key));
  assert.deepEqual([...new Set(summary.multiPet.map(row => row.petCount))], PET_COUNTS);
  assert.equal(summary.stressTest.withholdingComparison.length, 100);
});

test('aggressive escalation is 2× on day one, 8× on day seven, and capped thereafter', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(PENALTY_MODELS).map(([key, model]) =>
      [key, [multiplierForStreak(key, 1), multiplierForStreak(key, 7), multiplierForStreak(key, 8), model.maximumMultiplier]])),
    {
      moderate: [2, 4, 4, 4],
      aggressive: [2, 8, 8, 8],
      severe: [3, 10, 10, 10],
    },
  );
  assert.equal(simulate({ days: 7, model: 'aggressive' }).rawDebtAssessed, 770);
});

test('partial care is proportional and one trivial action never resets the streak', () => {
  const none = simulate({ days: 3, caredFraction: 0 });
  const half = simulate({ days: 3, caredFraction: 0.5 });
  assert.equal(half.rawDebtAssessed, none.rawDebtAssessed / 2);
  const oneActionDaily = simulate({ days: 365, caredFraction: 1 / 3, grossDailyPetXp: 10 });
  assert.equal(oneActionDaily.endingStreak, 365);
  assert.equal(oneActionDaily.endingDebt, RECOMMENDED_POLICY.maxDebt);
  assert.ok(oneActionDaily.futurePetXpWithheld > 0);
});

test('recommended debt is 770 after seven days and bounded at 1540 after prolonged neglect', () => {
  assert.equal(RECOMMENDED_POLICY.maxDebt, 1540);
  assert.equal(simulate({ days: 7 }).endingDebt, 770);
  for (const days of [14, 30, 90, 180, 365]) {
    assert.equal(simulate({ days }).endingDebt, 1540);
  }
});

test('dynamic debt caps are bounded and expose profile-based gaming risk', () => {
  assert.equal(resolveDebtCap('dynamic', 62), 770);
  assert.equal(resolveDebtCap('dynamic', 87), 770);
  assert.equal(resolveDebtCap('dynamic', 172), 1204);
  assert.equal(resolveDebtCap('dynamic', 264), 1848);
  assert.equal(resolveDebtCap('dynamic', 1200), 2310);
  assert.throws(() => resolveDebtCap('unknown', 87), /unknown debt cap model/);
});

test('all five withholding rates and four debt caps cover every XP profile', () => {
  const comparison = buildWithholdingComparison();
  assert.equal(comparison.length,
    Object.keys(WITHHOLDING_MODELS).length * Object.keys(DEBT_CAP_MODELS).length * XP_REFERENCE_BUNDLES.length);
  assert.deepEqual([...new Set(comparison.map(row => row.maximumWithholdingPercent))], [25, 40, 50, 65, 75]);
  assert.ok(comparison.some(row => row.profile === 'daily_cap_stress'));
  assert.ok(comparison.every(row => row.permanentXpRemoved === 0));
});

test('withholding losses increase monotonically while care-earned recovery time stays fixed', () => {
  const rows = buildWithholdingComparison().filter(row =>
    row.debtCap === 'double_1540' && row.profile === 'regular_reference');
  assert.deepEqual(rows.map(row => row.recoveryDays), [18, 18, 18, 18, 18]);
  assert.deepEqual([...rows].sort((a, b) => a.xpWithheld - b.xpWithheld), rows);
  assert.ok(rows[0].xpWithheld > 0);
});

test('decoupling recovery from XP closes the high-earner fast-payoff exploit', () => {
  const current = simulateRecovery({
    absenceDays: 7,
    grossDailyPetXp: 1200,
    policy: CURRENT_POLICY,
  });
  const revised = simulateRecovery({
    absenceDays: 7,
    grossDailyPetXp: 1200,
    policy: RECOMMENDED_POLICY,
  });
  assert.equal(current.daysToClear, 4);
  assert.equal(revised.daysToClear, 18);
  assert.ok(revised.recoveryPetXpWithheld > current.recoveryPetXpWithheld * 5);
  assert.equal(revised.withholdingPaysDebt, false);
});

test('seven-day recovery takes 18 genuine full-care days at every earning profile', () => {
  for (const profile of XP_REFERENCE_BUNDLES) {
    const recovery = simulateRecovery({
      absenceDays: 7,
      grossDailyPetXp: profile.petXp,
      policy: RECOMMENDED_POLICY,
    });
    assert.equal(recovery.daysToClear, 18);
    assert.equal(recovery.debtAfter, 0);
    assert.equal(recovery.lifetimePetXpDeducted, 0);
  }
  assert.equal(simulateRecovery({ absenceDays: 7, grossDailyPetXp: 0 }).daysToClear, 18);
});

test('long absence remains bounded and recoverable without equating 180 days to infinite debt', () => {
  const rows = buildDebtCapComparison().filter(row =>
    row.debtCap === 'double_1540' && row.profile === 'casual_reference');
  const week = rows.find(row => row.absenceDays === 7);
  const long = rows.find(row => row.absenceDays === 180);
  assert.equal(week.recoveryDays, 18);
  assert.equal(long.startingDebt, 1540);
  assert.equal(long.recoveryDays, 35);
  assert.equal(long.debtAfter, 0);
});

test('one cap day before absence remains permanent but causes future disadvantage', () => {
  const scenarios = buildExploitScenarios().maxGrindThenDisappear;
  assert.equal(scenarios.length, 14);
  assert.ok(scenarios.every(row => row.preNeglectXpPreserved === 1200));
  assert.ok(scenarios.every(row => row.futureXpWithheld > 0));
  assert.ok(scenarios.every(row => row.economicallyAdvantageousAtEqualGrossOpportunity === false));
  assert.ok(scenarios.every(row => row.outstandingDebt === 0));
});

test('heavy-cycle, weekend-only, minimal-care, and pre-accumulation exploits all lose XP to policy', () => {
  const { strategies } = buildExploitScenarios();
  assert.deepEqual(strategies.map(row => row.key), [
    'three_heavy_days_then_seven_absent_repeated',
    'weekends_only',
    'one_required_action_daily',
    'thirty_cap_days_then_seven_absent_then_regular_return',
  ]);
  for (const strategy of strategies) {
    assert.ok(strategy.policySpecificWithholding > 0);
    assert.ok(strategy.netPetXpAwarded < strategy.grossPetXp);
    assert.equal(strategy.economicallyAdvantageousAtEqualGrossOpportunity, false);
    assert.equal(strategy.lifetimePetXpDeducted, 0);
    assert.equal(strategy.earnedMilestonesDestroyed, 0);
  }
});

test('grind-and-disappear cycles cannot prepay attendance', () => {
  const run = simulateGrindingCycle({
    cycles: 12,
    careDays: 3,
    absenceDays: 7,
    grossDailyPetXp: 172,
    policy: RECOMMENDED_POLICY,
  });
  assert.equal(run.calendarDays, 120);
  assert.ok(run.futurePetXpWithheld > 0);
  assert.equal(run.endingDebt, RECOMMENDED_POLICY.maxDebt);
  assert.equal(run.lifetimePetXpDeducted, 0);
});

test('multiple pets and Telegram opt-out cannot change account scoring', () => {
  const exploits = buildExploitScenarios();
  assert.equal(new Set(exploits.multiPetParity.map(row => row.accountDebt)).size, 1);
  assert.equal(new Set(exploits.reminderParity.map(row => row.accountDebt)).size, 1);
  assert.equal(new Set(exploits.reminderParity.map(row => row.streak)).size, 1);
  const one = simulate({ days: 30, petCount: 1 });
  const five = simulate({ days: 30, petCount: 5 });
  assert.equal(five.endingDebt, one.endingDebt);
  assert.equal(five.naivePerPetRawDebt, one.naivePerPetRawDebt * 5);
});

test('30-minute and several-hour requests are labelled proxies rather than invented XP rates', () => {
  const references = buildExploitScenarios().sessionLengthReferences;
  assert.match(references[0].evidence, /No source-backed XP-per-minute rate/);
  assert.match(references[1].evidence, /No source-backed XP-per-hour rate/);
  assert.equal(references[0].profile.petXp, 62);
  assert.equal(references[1].profile.petXp, 172);
});

test('365-day projections preserve possibility but do not fabricate Legendary completion', () => {
  const projections = buildProgressionProjections();
  const paceConsistent = projections.find(row =>
    row.profile === 'legendary_pace_floor' && row.scenario === 'consistent');
  const paceAbsent = projections.find(row =>
    row.profile === 'legendary_pace_floor' && row.scenario === 'single_week_absent');
  assert.equal(paceConsistent.reachesLevel50ByDay365, true);
  assert.equal(paceAbsent.reachesLevel50ByDay365, false);
  assert.ok(paceAbsent.futurePetXpAwarded > 0);
  assert.equal(paceAbsent.permanentProgressDestroyed, false);
  assert.ok(projections.every(row => row.legendaryNonXpRequirementsGrantedBySimulator === false));
});

test('year effect separates missed play from policy-specific withholding', () => {
  const effect = estimateYearEffect({
    absenceDays: 7,
    grossDailyPetXp: 87,
    policy: RECOMMENDED_POLICY,
  });
  assert.equal(effect.absenceOpportunityCost, 609);
  assert.ok(effect.policySpecificWithholding > 0);
  assert.equal(effect.totalXpGap,
    Number((effect.absenceOpportunityCost + effect.policySpecificWithholding).toFixed(2)));
  assert.equal(effect.earnedXpRemoved, 0);
  assert.equal(effect.endingDebt, 0);
});

test('success report keeps hypothetical results provisional and runtime protections not tested', () => {
  const report = buildSuccessThresholdReport();
  assert.equal(report.find(row => row.metric === 'Day-seven multiplier').result, 'PASS');
  assert.equal(report.find(row => row.metric === 'Recovery from seven-day neglect').actual, 18);
  assert.equal(report.find(row => row.metric === 'Duplicate penalty protection').result, 'NOT TESTED');
  assert.equal(report.find(row => row.metric === 'Runtime economy integrity').result, 'NOT TESTED');
  assert.ok(report.some(row => row.result === 'PROVISIONAL PASS'));
  assert.equal(buildStressSummary().status, 'draft_sandbox_stress_test_not_live_gk_approval_required');
});

test('authoritative no-care condition decay is unchanged', () => {
  assert.deepEqual(estimateUnattendedCondition(1), {
    days: 1, hunger: 100, happiness: 32.8, cleanliness: 23.2, energy: 47.2, health: 26,
  });
  assert.deepEqual(estimateUnattendedCondition(3), {
    days: 3, hunger: 100, happiness: 0, cleanliness: 0, energy: 0, health: 0,
  });
});

test('invalid stress inputs fail closed', () => {
  assert.throws(() => simulate({ days: 1, caredFraction: 1.1 }), /care fraction/);
  assert.throws(() => simulate({ days: 1, careSchedule: [] }), /care schedule/);
  assert.throws(() => simulate({ days: 1, model: 'unknown' }), /unknown penalty model/);
  assert.throws(() => simulate({ days: 1, grossDailyPetXp: -1 }), /grossDailyPetXp/);
  assert.throws(() => buildStressPolicy({ withholding: 'unknown' }), /unknown withholding model/);
});
