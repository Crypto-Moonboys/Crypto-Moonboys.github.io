import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_POLICY,
  HORIZONS,
  PET_COUNTS,
  buildSummary,
  simulate,
  simulateReengagement,
} from './moonpet-neglect-simulator.mjs';

test('expanded summary covers 7/30/90/365 days, missed-care percentages and 1/2/5 pets', () => {
  const summary = buildSummary(100);
  assert.deepEqual([...new Set(summary.scenarios.map(row => row.days))], HORIZONS);
  assert.deepEqual([...new Set(summary.scenarios.map(row => row.petCount))], PET_COUNTS);
  assert.ok(summary.scenarios.some(row => row.caredFraction === 0.5));
  assert.ok(summary.scenarios.some(row => row.caredFraction === 0.95));
});

test('daily debit escalates only while care is incomplete and resets after complete care', () => {
  const run = simulate({ days: 5, careSchedule: [0, 0.5, 1, 0, 0], dailyBudget: 100 });
  assert.deepEqual(run.rows.map(row => row.multiplier), [1, 1.25, 0, 1, 1.25]);
  assert.deepEqual(run.rows.map(row => row.missedPercent), [100, 50, 0, 100, 100]);
});

test('account-scoped bound is independent of pet count while exposing naive multiplication hazard', () => {
  const one = simulate({ days: 30, petCount: 1 });
  const five = simulate({ days: 30, petCount: 5 });
  assert.equal(one.endingDebt, DEFAULT_POLICY.maxDebtDays * 100);
  assert.equal(five.endingDebt, one.endingDebt);
  assert.equal(five.naivePerPetTotal, one.naivePerPetTotal * 5);
});

test('fourteen full-care days clear maximum standing without touching permanent XP', () => {
  for (const absenceDays of HORIZONS) {
    const recovery = simulateReengagement({ absenceDays, freshCareDays: 14, dailyBudget: 100, petCount: 5 });
    assert.equal(recovery.debtAfter, 0);
    assert.equal(recovery.lifetimePetXpDeducted, 0);
  }
});

test('invalid budgets and care fractions fail closed', () => {
  assert.throws(() => buildSummary(0), /illustrativeDailyBudget/);
  assert.throws(() => simulate({ days: 1, caredFraction: 1.1 }), /care fraction/);
  assert.throws(() => simulate({ days: 1, careSchedule: [] }), /care schedule/);
});
