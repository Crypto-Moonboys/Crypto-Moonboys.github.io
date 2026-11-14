#!/usr/bin/env node
/**
 * SANDBOX / policy-risk simulator ONLY.
 *
 * This file does not import the Worker, access D1, mutate a pet, deduct
 * permanent XP, or activate a penalty. Its constants are regression-checked
 * against the current game sources by moonpet-neglect-simulator.test.mjs.
 */
import { pathToFileURL } from 'node:url';

export const HORIZONS = Object.freeze([1, 3, 7, 14, 30, 90, 365]);
export const PET_COUNTS = Object.freeze([1, 2, 5]);
export const CARE_FRACTIONS = Object.freeze([
  Object.freeze({ key: 'none', label: '0 of 3 required actions', cared: 0 }),
  Object.freeze({ key: 'one_of_three', label: '1 of 3 required actions', cared: 1 / 3 }),
  Object.freeze({ key: 'two_of_three', label: '2 of 3 required actions', cared: 2 / 3 }),
  Object.freeze({ key: 'complete', label: '3 of 3 required actions', cared: 1 }),
]);

export const SOURCE_ECONOMY = Object.freeze({
  dailyPetXpSettlementCap: 1200,
  dailyCommunityXpSettlementCap: 250,
  directActionCooldownSeconds: 45,
  requiredCareActions: Object.freeze(['feed', 'play', 'clean']),
  directActions: Object.freeze({
    feed: Object.freeze({ petXp: 6, communityXp: 2 }),
    play: Object.freeze({ petXp: 10, communityXp: 3 }),
    clean: Object.freeze({ petXp: 6, communityXp: 2 }),
    sleep: Object.freeze({ petXp: 5, communityXp: 1 }),
    train: Object.freeze({ petXp: 20, communityXp: 6 }),
    energy_drink: Object.freeze({ petXp: 0, communityXp: 0, cooldownSeconds: 600, dailyLimit: 3 }),
    dance: Object.freeze({ petXp: 0, communityXp: 0, cooldownSeconds: 300, dailyLimit: 5 }),
    cuddles: Object.freeze({ petXp: 0, communityXp: 0, cooldownSeconds: 300, dailyLimit: 5 }),
  }),
  dailyCachePetXp: 40,
  dailyCompletionPetXp: 25,
  contractBonusPetXp: 20,
  contractBonusDailyLimit: 3,
  timedActivityMaximumPetXp: Object.freeze({ train: 86, work: 66, explore: 132, sleep: 0 }),
  visibleLevelPetXp: Object.freeze({ 5: 640, 20: 14440, 35: 46240, 45: 77440, 50: 96040, 100: 392040 }),
  legendaryRequirements: Object.freeze({ minimumAgeDays: 365, petLevel: 50, growthMarks: 240, weeklyCrests: 44 }),
});

export const CARE_STANDING_BASIS = SOURCE_ECONOMY.requiredCareActions
  .reduce((total, action) => total + SOURCE_ECONOMY.directActions[action].petXp, 0);

// These are reproducible source bundles, not production cohort averages. Real
// casual/regular/dedicated medians require accepted-event analytics including
// zero-activity accounts. The labels describe workload only.
export const XP_REFERENCE_BUNDLES = Object.freeze([
  Object.freeze({ key: 'casual_reference', label: 'care set + Daily Cache', petXp: 62 }),
  Object.freeze({ key: 'regular_reference', label: 'all five direct actions + Daily Cache', petXp: 87 }),
  Object.freeze({ key: 'dedicated_fixed_reference', label: 'regular + daily completion + 3 contract bonuses', petXp: 172 }),
]);

export const PENALTY_MODELS = Object.freeze({
  moderate: Object.freeze({ key: 'moderate', day1Multiplier: 2, day7Multiplier: 4, maximumMultiplier: 4 }),
  aggressive: Object.freeze({ key: 'aggressive', day1Multiplier: 2, day7Multiplier: 8, maximumMultiplier: 8 }),
  severe: Object.freeze({ key: 'severe', day1Multiplier: 3, day7Multiplier: 10, maximumMultiplier: 10 }),
});

export const RECOMMENDED_POLICY = Object.freeze({
  model: 'aggressive',
  requiredCareActions: SOURCE_ECONOMY.requiredCareActions,
  dailyBasis: CARE_STANDING_BASIS,
  maxDebtBasisDays: 35,
  maxDebt: CARE_STANDING_BASIS * 35,
  fullCareRecoveryCredit: CARE_STANDING_BASIS,
  minimumFutureXpReduction: 0.10,
  maximumFutureXpReduction: 0.25,
  escalationCapDay: 7,
  accountScoped: true,
});

const round = (value, places = 2) => Number(Number(value).toFixed(places));

function finiteNonnegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000) {
    throw new Error(`${label} must be finite, nonnegative, and <= 1000000`);
  }
  return number;
}

function sanitizeFraction(value) {
  const fraction = Number(value);
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new Error('care fraction must be between 0 and 1');
  }
  return fraction;
}

function scheduledValue(value, schedule, day, label) {
  if (!schedule) return value;
  if (!Array.isArray(schedule) || schedule.length === 0) throw new Error(`${label} schedule must be a nonempty array`);
  return schedule[(day - 1) % schedule.length];
}

export function multiplierForStreak(modelOrKey, streak) {
  const model = typeof modelOrKey === 'string' ? PENALTY_MODELS[modelOrKey] : modelOrKey;
  if (!model) throw new Error('unknown penalty model');
  if (!Number.isInteger(streak) || streak < 0) throw new Error('streak must be a nonnegative integer');
  if (streak === 0) return 0;
  const interpolationDay = Math.min(streak, 7);
  const step = (model.day7Multiplier - model.day1Multiplier) / 6;
  return round(Math.min(model.maximumMultiplier, model.day1Multiplier + (interpolationDay - 1) * step), 6);
}

export function futureXpReductionRate(debt, policy = RECOMMENDED_POLICY) {
  const balance = Math.max(0, Number(debt) || 0);
  if (balance === 0) return 0;
  const ratio = Math.min(1, balance / policy.maxDebt);
  return policy.minimumFutureXpReduction
    + (policy.maximumFutureXpReduction - policy.minimumFutureXpReduction) * ratio;
}

export function estimateUnattendedCondition(days, start = {}) {
  if (!Number.isFinite(days) || days < 0) throw new Error('condition days must be nonnegative');
  const hours = days * 24;
  const clamp = value => Math.max(0, Math.min(100, value));
  const hunger = clamp(Number(start.hunger ?? 0) + hours * 4.5);
  const happiness = clamp(Number(start.happiness ?? 100) - hours * 2.8);
  const cleanliness = clamp(Number(start.cleanliness ?? 100) - hours * 3.2);
  const energy = clamp(Number(start.energy ?? 100) - hours * 2.2);
  const health = Math.round(clamp((100 - hunger + happiness + cleanliness + energy) / 4));
  return { days, hunger: round(hunger), happiness: round(happiness), cleanliness: round(cleanliness), energy: round(energy), health };
}

export function simulate({
  days,
  model = RECOMMENDED_POLICY.model,
  caredFraction = 0,
  careSchedule = null,
  grossDailyPetXp = 0,
  grossPetXpSchedule = null,
  petCount = 1,
  initialDebt = 0,
  initialStreak = 0,
  notificationsEnabled = true,
  policy = RECOMMENDED_POLICY,
} = {}) {
  if (!Number.isInteger(days) || days < 0) throw new Error('days must be a nonnegative integer');
  if (!Number.isInteger(petCount) || petCount < 1) throw new Error('petCount must be positive');
  if (!Number.isInteger(initialStreak) || initialStreak < 0) throw new Error('initialStreak must be nonnegative');
  const selectedModel = typeof model === 'string' ? PENALTY_MODELS[model] : model;
  if (!selectedModel) throw new Error('unknown penalty model');
  let debt = Math.min(policy.maxDebt, finiteNonnegative(initialDebt, 'initialDebt'));
  let streak = initialStreak;
  let rawDebtAssessed = 0;
  let grossPetXp = 0;
  let futurePetXpAwarded = 0;
  let futurePetXpWithheld = 0;
  let recoveryCredit = 0;
  const rows = [];

  for (let day = 1; day <= days; day += 1) {
    const care = sanitizeFraction(scheduledValue(caredFraction, careSchedule, day, 'care'));
    const dailyGross = finiteNonnegative(scheduledValue(grossDailyPetXp, grossPetXpSchedule, day, 'gross Pet XP'), 'grossDailyPetXp');
    const missed = 1 - care;
    const complete = missed <= Number.EPSILON;
    streak = complete ? 0 : streak + 1;
    const multiplier = multiplierForStreak(selectedModel, streak);
    const rawDebit = round(policy.dailyBasis * missed * multiplier, 6);
    rawDebtAssessed += rawDebit;
    debt = Math.min(policy.maxDebt, debt + rawDebit);

    const reductionRate = futureXpReductionRate(debt, policy);
    const withheld = Math.min(debt, dailyGross * reductionRate);
    debt -= withheld;
    const careCredit = complete ? Math.min(policy.fullCareRecoveryCredit, debt) : 0;
    debt -= careCredit;

    grossPetXp += dailyGross;
    futurePetXpWithheld += withheld;
    futurePetXpAwarded += dailyGross - withheld;
    recoveryCredit += careCredit;
    rows.push({
      day,
      caredPercent: round(care * 100, 4),
      missedPercent: round(missed * 100, 4),
      streak,
      multiplier,
      rawDebit: round(rawDebit),
      rawDebtAssessed: round(rawDebtAssessed),
      boundedAccountDebt: round(debt),
      futureXpReductionPercent: round(reductionRate * 100, 4),
      grossPetXp: round(dailyGross),
      futurePetXpWithheld: round(withheld),
      futurePetXpAwarded: round(dailyGross - withheld),
      fullCareRecoveryCredit: round(careCredit),
    });
  }

  return {
    days,
    model: selectedModel.key,
    petCount,
    notificationsEnabled: Boolean(notificationsEnabled),
    maxDebt: policy.maxDebt,
    rawDebtAssessed: round(rawDebtAssessed),
    naivePerPetRawDebt: round(rawDebtAssessed * petCount),
    endingDebt: round(debt),
    endingStreak: streak,
    grossPetXp: round(grossPetXp),
    futurePetXpAwarded: round(futurePetXpAwarded),
    futurePetXpWithheld: round(futurePetXpWithheld),
    recoveryCredit: round(recoveryCredit),
    lifetimePetXpDeducted: 0,
    earnedMilestonesDestroyed: 0,
    rows,
  };
}

export function simulateRecovery({
  absenceDays,
  model = RECOMMENDED_POLICY.model,
  grossDailyPetXp = XP_REFERENCE_BUNDLES[1].petXp,
  petCount = 1,
  maxRecoveryDays = 365,
} = {}) {
  const absence = simulate({ days: absenceDays, model, caredFraction: 0, petCount });
  const recovery = simulate({
    days: maxRecoveryDays,
    model,
    caredFraction: 1,
    grossDailyPetXp,
    petCount,
    initialDebt: absence.endingDebt,
  });
  const firstClearIndex = recovery.rows.findIndex(row => row.boundedAccountDebt === 0);
  const daysToClear = firstClearIndex < 0 ? maxRecoveryDays : firstClearIndex + 1;
  const debt = recovery.rows[Math.max(0, daysToClear - 1)]?.boundedAccountDebt ?? absence.endingDebt;
  // Once debt reaches zero all later rows withhold zero, so the aggregate keeps
  // internal precision and avoids compounding display rounding across days.
  const withheld = recovery.futurePetXpWithheld;
  const awarded = daysToClear * grossDailyPetXp - withheld;
  return {
    absenceDays,
    model: typeof model === 'string' ? model : model.key,
    petCount,
    debtBefore: absence.endingDebt,
    grossDailyPetXp,
    daysToClear,
    debtAfter: round(debt),
    grossRecoveryPetXp: round(daysToClear * grossDailyPetXp),
    recoveryPetXpAwarded: round(awarded),
    recoveryPetXpWithheld: round(withheld),
    lifetimePetXpDeducted: 0,
  };
}

export function simulateGrindingCycle({
  model = RECOMMENDED_POLICY.model,
  cycles = 12,
  careDays = 3,
  absenceDays = 4,
  grossDailyPetXp = XP_REFERENCE_BUNDLES[2].petXp,
} = {}) {
  if (![cycles, careDays, absenceDays].every(value => Number.isInteger(value) && value >= 0)) {
    throw new Error('cycle lengths must be nonnegative integers');
  }
  const careSchedule = [];
  const xpSchedule = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    careSchedule.push(...Array(careDays).fill(1), ...Array(absenceDays).fill(0));
    xpSchedule.push(...Array(careDays).fill(grossDailyPetXp), ...Array(absenceDays).fill(0));
  }
  const run = simulate({ days: careSchedule.length, model, careSchedule, grossPetXpSchedule: xpSchedule });
  return {
    model: run.model,
    cycles,
    careDays,
    absenceDays,
    calendarDays: run.days,
    grossPetXp: run.grossPetXp,
    futurePetXpAwarded: run.futurePetXpAwarded,
    futurePetXpWithheld: run.futurePetXpWithheld,
    endingDebt: run.endingDebt,
    lifetimePetXpDeducted: 0,
  };
}

export function estimateYearEffect({
  model = RECOMMENDED_POLICY.model,
  absenceDays = 7,
  grossDailyPetXp = XP_REFERENCE_BUNDLES[1].petXp,
} = {}) {
  if (!Number.isInteger(absenceDays) || absenceDays < 0 || absenceDays > 365) throw new Error('absenceDays must be 0..365');
  const careSchedule = [...Array(absenceDays).fill(0), ...Array(365 - absenceDays).fill(1)];
  const xpSchedule = [...Array(absenceDays).fill(0), ...Array(365 - absenceDays).fill(grossDailyPetXp)];
  const run = simulate({ days: 365, model, careSchedule, grossPetXpSchedule: xpSchedule });
  const cleanAttendanceXp = 365 * grossDailyPetXp;
  return {
    model: run.model,
    absenceDays,
    grossDailyPetXp,
    cleanAttendanceXp,
    actualGrossXp: run.grossPetXp,
    futurePetXpAwarded: run.futurePetXpAwarded,
    absenceOpportunityCost: round(absenceDays * grossDailyPetXp),
    policySpecificWithholding: run.futurePetXpWithheld,
    totalXpGap: round(cleanAttendanceXp - run.futurePetXpAwarded),
    equivalentFullyActiveDaysLost: grossDailyPetXp ? round((cleanAttendanceXp - run.futurePetXpAwarded) / grossDailyPetXp) : 0,
    endingDebt: run.endingDebt,
    earnedXpRemoved: 0,
  };
}

export function buildSummary() {
  const modelComparison = [];
  const partialCareComparison = [];
  for (const model of Object.values(PENALTY_MODELS)) {
    for (const days of HORIZONS) {
      const full = simulate({ days, model, caredFraction: 0 });
      modelComparison.push({ model: model.key, days, rawDebt: full.rawDebtAssessed, cappedDebt: full.endingDebt });
      for (const pattern of CARE_FRACTIONS) {
        const run = simulate({ days, model, caredFraction: pattern.cared });
        partialCareComparison.push({
          model: model.key,
          days,
          carePattern: pattern.key,
          caredPercent: round(pattern.cared * 100, 4),
          rawDebt: run.rawDebtAssessed,
          cappedDebt: run.endingDebt,
        });
      }
    }
  }

  return {
    status: 'draft_sandbox_not_live_gk_approval_required',
    unit: 'Care Standing unit anchored to configured base Pet XP; never deducted from permanent Pet XP',
    sourceEconomy: SOURCE_ECONOMY,
    xpReferenceBundles: XP_REFERENCE_BUNDLES,
    policy: RECOMMENDED_POLICY,
    models: PENALTY_MODELS,
    modelComparison,
    partialCareComparison,
    recovery: Object.values(PENALTY_MODELS).flatMap(model => HORIZONS.flatMap(absenceDays =>
      XP_REFERENCE_BUNDLES.map(bundle => ({ bundle: bundle.key, ...simulateRecovery({ absenceDays, model, grossDailyPetXp: bundle.petXp }) })))),
    repeatedGrindingCycles: Object.values(PENALTY_MODELS).flatMap(model =>
      XP_REFERENCE_BUNDLES.map(bundle => ({ bundle: bundle.key, ...simulateGrindingCycle({ model, grossDailyPetXp: bundle.petXp }) }))),
    multiPet: Object.values(PENALTY_MODELS).flatMap(model => PET_COUNTS.map(petCount => {
      const run = simulate({ days: 30, model, petCount });
      return { model: model.key, petCount, accountDebt: run.endingDebt, naivePerPetRawDebt: run.naivePerPetRawDebt };
    })),
    oneActionCannotReset: simulate({ days: 3, careSchedule: [0, 1 / 3, 1], model: 'aggressive' }),
    reminderParity: [true, false].map(notificationsEnabled => {
      const run = simulate({ days: 7, model: 'aggressive', notificationsEnabled });
      return { notificationsEnabled, debt: run.endingDebt, streak: run.endingStreak };
    }),
    unattendedCondition: HORIZONS.map(days => estimateUnattendedCondition(days)),
    yearEffects: Object.values(PENALTY_MODELS).flatMap(model =>
      XP_REFERENCE_BUNDLES.map(bundle => ({ bundle: bundle.key, ...estimateYearEffect({ model, grossDailyPetXp: bundle.petXp }) }))),
  };
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === executedPath) console.log(JSON.stringify(buildSummary(), null, 2));
