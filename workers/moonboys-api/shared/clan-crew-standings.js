import { CANONICAL_FACTION_KEYS } from './faction-canon.js';

const DAYS_PER_SCORE = 5;
const BANKS_PER_DAY = 3;
const MIN_ROSTER = 3;
const MIN_CREWS = 2;
const DAY_MS = 86_400_000;

function utcDate(time) {
  return new Date(time).toISOString().slice(0, 10);
}

export function crewWeek(now, offset = 0) {
  const midnight = Date.parse(utcDate(now) + 'T00:00:00Z');
  const monday = midnight + (offset * 7 - (now.getUTCDay() + 6) % 7) * DAY_MS;
  return { start: utcDate(monday), end: utcDate(monday + 6 * DAY_MS) };
}

export async function readCrewStandings(db, week) {
  // Include only settled banks matching the faction recorded at opt-in.
  const result = await db.prepare(`
    WITH banks_by_day AS (
      SELECT roster.telegram_id, roster.faction_id, awards.utc_day, COUNT(*) AS banks
      FROM clan_crew_roster_entries AS roster
      JOIN clan_operation_awards AS awards ON awards.telegram_id = roster.telegram_id
        AND awards.faction_id = roster.faction_id AND awards.utc_day BETWEEN ? AND ?
      WHERE roster.week_start = ?
      GROUP BY roster.telegram_id, roster.faction_id, awards.utc_day
    ), best_days AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY telegram_id ORDER BY banks DESC, utc_day
      ) AS day_rank
      FROM banks_by_day
    ), member_scores AS (
      SELECT telegram_id, SUM(banks) AS scored_banks
      FROM best_days WHERE day_rank <= ?
      GROUP BY telegram_id
    )
    SELECT roster.faction_id, COUNT(*) AS roster_size,
      COUNT(scores.telegram_id) AS active_members,
      COALESCE(SUM(scores.scored_banks), 0) AS scored_banks
    FROM clan_crew_roster_entries AS roster
    LEFT JOIN member_scores AS scores ON scores.telegram_id = roster.telegram_id
    WHERE roster.week_start = ?
    GROUP BY roster.faction_id
  `).bind(week.start, week.end, week.start, DAYS_PER_SCORE, week.start).all();
  if (result.success !== true || !Array.isArray(result.results)) throw new Error('crew_standings_query_failed');
  const totals = new Map(result.results.map(row => [row.faction_id, row]));
  const crews = CANONICAL_FACTION_KEYS.map(factionId => {
    const row = totals.get(factionId);
    const rosterSize = row?.roster_size ?? 0;
    return {
      faction_id: factionId,
      roster_size: rosterSize,
      active_members: row?.active_members ?? 0,
      scored_banks: row?.scored_banks ?? 0,
      possible_banks: rosterSize * DAYS_PER_SCORE * BANKS_PER_DAY,
      rank: null,
    };
  });
  const eligible = crews.filter(crew => crew.roster_size >= MIN_ROSTER);
  const ranked = eligible.length >= MIN_CREWS;
  if (ranked) {
    // Compare fractions directly so that rounded percentages never break ties.
    const compare = (a, b) => b.scored_banks * a.possible_banks - a.scored_banks * b.possible_banks;
    eligible.sort(compare);
    for (const [index, crew] of eligible.entries()) {
      if (!crew.scored_banks) break;
      crew.rank = index && compare(eligible[index - 1], crew) === 0 ? eligible[index - 1].rank : index + 1;
    }
  }
  return { week_start: week.start, ranked, min_roster: MIN_ROSTER, min_crews: MIN_CREWS, crews };
}
