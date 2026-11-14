#!/usr/bin/env node
/**
 * SANDBOX / educational policy risk simulator ONLY.
 * No production imports, D1 access, game mutation or Pet XP deductions.
 *
 * Usage: node scripts/moonpet-neglect-simulator.mjs [illustrativeDailyBudget=100]
 * Values are normalized Care Standing units, NOT observed Pet XP/day yield.
 */
import { pathToFileURL } from 'node:url';

export const HORIZONS = Object.freeze([7, 30, 90, 365]);
export const PATTERNS = Object.freeze([
  { name: 'no-care', eligibleCareFraction: 0 },
  { name: 'casual (hypothetical)', eligibleCareFraction: 0.25 },
  { name: 'partial care (hypothetical)', eligibleCareFraction: 0.5 },
  { name: 'regular (hypothetical)', eligibleCareFraction: 0.7 },
  { name: 'dedicated (hypothetical)', eligibleCareFraction: 0.95 },
  { name: 'complete eligible care', eligibleCareFraction: 1 },
]);
export const PET_COUNTS = Object.freeze([1, 2, 5]);
export const DEFAULT_POLICY = Object.freeze({
  maxDebtDays: 7,
  recoveryDays: 14,
  maximumMultiplier: 2,
  dailyEscalation: 0.25,
});

function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1_000_000) {
    throw new Error(`${label} must be finite, positive, and <= 1000000`);
  }
  return number;
}

function sanitizeFraction(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('care fraction must be between 0 and 1');
  return value;
}

function careFractionForDay(caredFraction, careSchedule, day) {
  if (!careSchedule) return sanitizeFraction(caredFraction);
  if (!Array.isArray(careSchedule) || careSchedule.length === 0) throw new Error('care schedule must be a nonempty array');
  return sanitizeFraction(Number(careSchedule[(day - 1) % careSchedule.length]));
}

export function simulate({
  days,
  dailyBudget = 100,
  caredFraction = 0,
  careSchedule = null,
  petCount = 1,
  policy = DEFAULT_POLICY,
} = {}) {
  if (!Number.isInteger(days) || days < 0) throw new Error('days must be a nonnegative integer');
  if (!Number.isInteger(petCount) || petCount < 1) throw new Error('petCount must be positive');
  const budget = finitePositive(dailyBudget, 'dailyBudget');
  const maxDebtDays = finitePositive(policy.maxDebtDays, 'maxDebtDays');
  const recoveryDays = finitePositive(policy.recoveryDays, 'recoveryDays');
  const maximumMultiplier = finitePositive(policy.maximumMultiplier, 'maximumMultiplier');
  const dailyEscalation = finitePositive(policy.dailyEscalation, 'dailyEscalation');
  const maxDebt = maxDebtDays * budget;
  const recoveryPerFullCareDay = maxDebt / recoveryDays;
  let streak = 0;
  let rawAccountTotal = 0;
  let boundedDebt = 0;
  let creditedCare = 0;
  const rows = [];

  for (let day = 1; day <= days; day += 1) {
    const dailyCareFraction = careFractionForDay(caredFraction, careSchedule, day);
    const missed = 1 - dailyCareFraction;
    const completelyCared = missed <= Number.EPSILON;
    streak = completelyCared ? 0 : streak + 1;
    const multiplier = completelyCared ? 0 : Math.min(maximumMultiplier, 1 + dailyEscalation * (streak - 1));
    const rawDebit = Number((budget * missed * multiplier).toFixed(2));
    rawAccountTotal += rawDebit;
    boundedDebt = Math.min(maxDebt, boundedDebt + rawDebit);
    creditedCare += budget * dailyCareFraction;
    if (completelyCared) boundedDebt = Math.max(0, boundedDebt - recoveryPerFullCareDay);

    rows.push({
      day,
      caredPercent: Math.round(dailyCareFraction * 100),
      missedPercent: Math.round(missed * 100),
      streak,
      multiplier,
      rawDebit,
      rawAccountTotal: Number(rawAccountTotal.toFixed(2)),
      naivePerPetTotal: Number((rawAccountTotal * petCount).toFixed(2)),
      boundedAccountDebt: Number(boundedDebt.toFixed(2)),
      petCount,
    });
  }

  return {
    days,
    petCount,
    maxDebt,
    rawAccountTotal: Number(rawAccountTotal.toFixed(2)),
    naivePerPetTotal: Number((rawAccountTotal * petCount).toFixed(2)),
    endingDebt: Number(boundedDebt.toFixed(2)),
    creditedCare: Number(creditedCare.toFixed(2)),
    lifetimePetXpDeducted: 0,
    rows,
  };
}

export function simulateReengagement({ absenceDays, freshCareDays, dailyBudget = 100, petCount = 1 } = {}) {
  if (!Number.isInteger(freshCareDays) || freshCareDays < 0) throw new Error('freshCareDays must be a nonnegative integer');
  const absence = simulate({ days: absenceDays, dailyBudget, caredFraction: 0, petCount });
  const recoveryPerDay = absence.maxDebt / DEFAULT_POLICY.recoveryDays;
  const debtAfter = Math.max(0, absence.endingDebt - recoveryPerDay * freshCareDays);
  return {
    absenceDays,
    freshCareDays,
    petCount,
    debtBefore: absence.endingDebt,
    debtAfter: Number(debtAfter.toFixed(2)),
    recoveryCareCredited: Number((freshCareDays * dailyBudget).toFixed(2)),
    lifetimePetXpDeducted: 0,
  };
}

export function buildSummary(dailyBudget = 100) {
  const budget = finitePositive(dailyBudget, 'illustrativeDailyBudget');
  const scenarios = [];
  for (const petCount of PET_COUNTS) {
    for (const pattern of PATTERNS) {
      for (const days of HORIZONS) {
        const run = simulate({ days, dailyBudget: budget, caredFraction: pattern.eligibleCareFraction, petCount });
        scenarios.push({
          days,
          petCount,
          attendanceScenario: pattern.name,
          caredFraction: pattern.eligibleCareFraction,
          rawAccountTotal: run.rawAccountTotal,
          naivePerPetTotal: run.naivePerPetTotal,
          cappedAccountDebt: run.endingDebt,
        });
      }
    }
  }
  return {
    status: 'illustrative_sandbox_not_live',
    unit: 'normalized care standing units; not Pet XP',
    budget,
    policy: DEFAULT_POLICY,
    scenarios,
    reengagement: HORIZONS.map(absenceDays => simulateReengagement({
      absenceDays,
      freshCareDays: DEFAULT_POLICY.recoveryDays,
      dailyBudget: budget,
    })),
    alternatingRecovery: simulate({
      days: 30,
      dailyBudget: budget,
      careSchedule: [0, 0.5, 1],
      petCount: 2,
    }),
    multipetAccountBound: PET_COUNTS.map(petCount => {
      const run = simulate({ days: 30, dailyBudget: budget, petCount });
      return { petCount, naivePerPetTotal: run.naivePerPetTotal, accountDebt: run.endingDebt };
    }),
  };
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === executedPath) {
  console.log(JSON.stringify(buildSummary(process.argv[2] ?? 100), null, 2));
}
