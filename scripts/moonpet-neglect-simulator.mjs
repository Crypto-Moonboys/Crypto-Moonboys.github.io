#!/usr/bin/env node
/**
 * SANDBOX / educational policy risk simulator ONLY.
 * No production imports, D1 access, game mutation or Pet XP deductions.
 *
 * Usage: node scripts/moonpet-neglect-simulator.mjs [illustrativeDailyBudget=100]
 * Values are arbitrary normalized units, NOT an observed Pet XP/day yield.
 */
const budget = Number(process.argv[2] ?? 100);
if (!Number.isFinite(budget) || budget <= 0 || budget > 1000000) {
  throw new Error('illustrativeDailyBudget must be finite, positive, and <= 1000000');
}

const HORIZONS = Object.freeze([7, 30, 90, 365]);
const PATTERNS = Object.freeze([
  { name: 'no-care', eligibleCareFraction: 0 },
  { name: 'casual (hypothetical)', eligibleCareFraction: 0.25 },
  { name: 'partial care (hypothetical)', eligibleCareFraction: 0.5 },
  { name: 'regular (hypothetical)', eligibleCareFraction: 0.7 },
  { name: 'dedicated (hypothetical)', eligibleCareFraction: 0.95 },
  { name: 'complete eligible care', eligibleCareFraction: 1 },
]);
const PET_COUNTS = Object.freeze([1, 2, 5]);

function sanitizeFraction(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('care fraction must be between 0 and 1');
  return value;
}

function simulate({ days, dailyBudget = budget, caredFraction = 0, maxDebtDays = 14, recoveryDays = 30, petCount = 1 }) {
  if (!Number.isInteger(days) || days < 0) throw new Error('days must be a nonnegative integer');
  if (!Number.isInteger(petCount) || petCount < 1) throw new Error('petCount must be positive');
  sanitizeFraction(caredFraction);
  const maxDebt = maxDebtDays * dailyBudget;
  const recovery = maxDebt / recoveryDays;
  let streak = 0, rawTotal = 0, cappedDebt = 0, creditedCare = 0;
  const rows = [];
  for (let day = 1; day <= days; day++) {
    const missed = 1 - caredFraction;
    const completelyCared = missed <= 0.0000001;
    streak = completelyCared ? 0 : streak + 1;
    const multiplier = completelyCared ? 0 : Math.min(8, streak + 1);
    const rawLoss = Math.round(dailyBudget * missed * multiplier);
    // Raw uncapped total demonstrates why a hard bound is essential.
    rawTotal += rawLoss;
    // Care Standing is modelled at account level: never charge petCount times.
    cappedDebt = Math.min(maxDebt, cappedDebt + rawLoss);
    if (completelyCared) {
      creditedCare += dailyBudget;
      cappedDebt = Math.max(0, cappedDebt - recovery);
    } else if (caredFraction > 0) {
      // Partial care attenuates the debt but does not reset a neglect streak.
      creditedCare += dailyBudget * caredFraction;
      cappedDebt = Math.max(0, cappedDebt - recovery * caredFraction / 2);
    }
    rows.push({ day, missedPercent: Math.round(missed * 100), streak, multiplier, rawLoss,
      rawTotal, boundedDebt: Number(cappedDebt.toFixed(2)), petCount });
  }
  return {
    days, petCount, caredFraction, maxDebt, rawTotal,
    endingDebt: Number(cappedDebt.toFixed(2)), creditedCare: Number(creditedCare.toFixed(2)),
    last: rows.at(-1) || null, rows
  };
}

function reengagement({ absenceDays = 90, freshCareDays = 30, dailyBudget = budget }) {
  const absent = simulate({ days: absenceDays, dailyBudget });
  let debt = absent.endingDebt;
  const maxRecoveryPerCareDay = absent.maxDebt / 30;
  for (let i = 0; i < freshCareDays; i++) debt = Math.max(0, debt - maxRecoveryPerCareDay);
  return { absenceDays, freshCareDays, debtBefore: absent.endingDebt, debtAfter: Number(debt.toFixed(2)),
    lifetimePetXpDeducted: 0 };
}

const summary = {
  status: 'illustrative_sandbox_not_live',
  unit: 'hypothetical care standing units; not Pet XP',
  budget,
  maxDebtDays: 14,
  recoveryDaysIfFullCare: 30,
  scenarios: []
};
for (const petCount of PET_COUNTS) {
  for (const pattern of PATTERNS) {
    for (const days of HORIZONS) {
      const run = simulate({ days, caredFraction: pattern.eligibleCareFraction, petCount });
      summary.scenarios.push({
        days, petCount, attendanceScenario: pattern.name,
        caredFraction: pattern.eligibleCareFraction,
        rawUncappedTotal: run.rawTotal,
        cappedDebt: run.endingDebt
      });
    }
  }
}
summary.reengagement = [7, 30, 90, 365].map(absenceDays =>
  reengagement({ absenceDays, freshCareDays: 30 }));
summary.multipetAccountBound = PET_COUNTS.map(petCount => ({
  petCount, debtAfter30NoCare: simulate({ days: 30, petCount }).endingDebt
}));

console.log(JSON.stringify(summary, null, 2));
