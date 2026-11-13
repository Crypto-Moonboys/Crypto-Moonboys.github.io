// Deterministic leaderboard periods and capped reward-ticket bonuses.
// Bonuses change lottery weight only; they never increase the 1% token budget.
import { validUtcDay, MAX_POINTS_PER_DAY } from './v2-core.js';

export const BASE_TICKET_BPS = 10000;
export const LEADERBOARD_BONUS_BPS = Object.freeze({
  daily: Object.freeze([1500, 1000, 500]),
  weekly: Object.freeze([1000, 700, 400]),
  monthly: Object.freeze([700, 500, 300]),
  seasonal: Object.freeze([500, 300, 200])
});
export const MAX_LEADERBOARD_BONUS_BPS = Object.values(LEADERBOARD_BONUS_BPS)
  .reduce((total, values) => total + values[0], 0);
export const MAX_RANKED_POINTS_PER_DAY =
  MAX_POINTS_PER_DAY * (BASE_TICKET_BPS + MAX_LEADERBOARD_BONUS_BPS);

const DAY_MS = 86400000;
const dayStamp = day => Date.parse(day + 'T00:00:00.000Z');
const dayKey = stamp => new Date(stamp).toISOString().slice(0, 10);
const compareIds = (a, b) => String(a).length - String(b).length ||
  String(a).localeCompare(String(b));

export function leaderboardPeriods(day) {
  if (!validUtcDay(day)) throw new Error('invalid_leaderboard_day');
  const stamp = dayStamp(day);
  const date = new Date(stamp);
  const monday = stamp - ((date.getUTCDay() + 6) % 7) * DAY_MS;
  const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  const seasonStart = Date.UTC(date.getUTCFullYear(), quarterMonth, 1);
  const next = new Date(stamp + DAY_MS);
  const weeklyCloses = date.getUTCDay() === 0;
  const monthlyCloses = next.getUTCMonth() !== date.getUTCMonth();
  const seasonalCloses = monthlyCloses && date.getUTCMonth() % 3 === 2;
  return Object.freeze({
    daily: Object.freeze({ start: day, end: day, closes: true, label: day }),
    weekly: Object.freeze({ start: dayKey(monday), end: day, closes: weeklyCloses,
      label: dayKey(monday) }),
    monthly: Object.freeze({ start: dayKey(monthStart), end: day, closes: monthlyCloses,
      label: day.slice(0, 7) }),
    seasonal: Object.freeze({ start: dayKey(seasonStart), end: day, closes: seasonalCloses,
      label: date.getUTCFullYear() + '-Q' + (Math.floor(date.getUTCMonth() / 3) + 1) })
  });
}

function periodStandings(rows, period) {
  const totals = new Map();
  for (const row of rows) {
    if (row.blocked === 1 || row.day_key < period.start || row.day_key > period.end) continue;
    if (!Number.isSafeInteger(row.earned_weight) || row.earned_weight <= 0) continue;
    const id = String(row.telegram_id);
    totals.set(id, (totals.get(id) || 0) + row.earned_weight);
  }
  return [...totals].map(([telegramId, points]) => ({ telegramId, points }))
    .sort((a, b) => b.points - a.points || compareIds(a.telegramId, b.telegramId));
}

export function leaderboardStandings(rows, day) {
  if (!Array.isArray(rows)) throw new Error('invalid_leaderboard_rows');
  const periods = leaderboardPeriods(day);
  return Object.fromEntries(Object.entries(periods).map(([name, period]) =>
    [name, periodStandings(rows, period)]));
}

export function currentLeaderboardCandidates(rows, day) {
  const periods = leaderboardPeriods(day);
  const standings = leaderboardStandings(rows, day);
  const bonusByMember = new Map();
  for (const [name, values] of Object.entries(standings)) {
    if (!periods[name].closes) continue;
    values.slice(0, 3).forEach((row, index) => {
      bonusByMember.set(row.telegramId,
        (bonusByMember.get(row.telegramId) || 0) + LEADERBOARD_BONUS_BPS[name][index]);
    });
  }
  const current = new Map();
  for (const row of rows) {
    if (row.blocked === 1 || row.day_key !== day || row.earned_weight <= 0) continue;
    const id = String(row.telegram_id);
    current.set(id, (current.get(id) || 0) + row.earned_weight);
  }
  return [...current].map(([telegramId, basePoints]) => {
    const bonusBps = bonusByMember.get(telegramId) || 0;
    return {
      telegramId,
      points: basePoints * (BASE_TICKET_BPS + bonusBps),
      basePoints,
      bonusBps
    };
  }).sort((a, b) => compareIds(a.telegramId, b.telegramId));
}
