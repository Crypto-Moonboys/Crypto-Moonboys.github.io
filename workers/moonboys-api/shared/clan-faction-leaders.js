import { CANONICAL_FACTION_KEYS } from './faction-canon.js';

// These rules apply to leader support points only. Official ranks and awards
// continue to come from the existing crew competition.
const perks = [
  { id: 'supply', name: 'Supply Dock', metric: 'banks', unit: 'per banked task tier', factor: 1 },
  { id: 'relay', name: 'Signal Relay', metric: 'signals', unit: 'per completed signal', factor: 3 },
  { id: 'rally', name: 'Crew Rally', metric: 'member_days', unit: 'per active member per UTC day', factor: 2 },
];

function weeklyPerk(result) {
  const rank = result?.rank;
  if (!Number.isInteger(rank) || rank < 1 || rank > 9) return null;

  const level = 10 - rank;
  // Choose from the finalized standing so later activity cannot change the selection.
  // Low participation calls for Rally. A heavily banking roster gets Relay to
  // encourage signal play. Other rosters get a direct boost to their task banks.
  const selected = result.active_members * 3 < result.roster_size * 2
    ? 'rally'
    : result.scored_banks >= 8 * result.active_members ? 'relay' : 'supply';

  return {
    rank,
    level,
    selected,
    options: perks.map(({ id, name, metric, unit, factor }) => ({
      id, name, metric, unit, points: level * factor,
    })),
  };
}

export async function readFactionLeaders(db, weekStart, today, finalResults) {
  const prior = finalResults.find(period => period.kind === 'weekly' && period.ends_before === weekStart);
  const standings = new Map((prior?.crews ?? []).map(crew => [crew.faction_id, crew]));
  const result = await db.prepare(`
    WITH activity AS (
      SELECT faction_id, telegram_id, utc_day, 1 AS banks, 0 AS signals
      FROM clan_operation_awards
      WHERE utc_day BETWEEN ?1 AND ?2
        AND faction_id IN (${CANONICAL_FACTION_KEYS.map(() => '?').join(', ')})
      UNION ALL
      SELECT roster.faction_id, signal.telegram_id, signal.utc_day, 0, 1
      FROM clan_crew_roster_entries AS roster
      JOIN daily_wtf_player_events AS signal ON signal.telegram_id = roster.telegram_id
      WHERE roster.week_start = ?1 AND signal.utc_day BETWEEN ?1 AND ?2
        AND signal.status = 'completed' AND signal.completed_at IS NOT NULL
    ), member_activity AS (
      SELECT faction_id, telegram_id, utc_day, SUM(banks) AS banks, SUM(signals) AS signals
      FROM activity
      GROUP BY faction_id, telegram_id, utc_day
    )
    SELECT faction_id, SUM(banks) AS banks, SUM(signals) AS signals, COUNT(*) AS member_days
    FROM member_activity
    GROUP BY faction_id
  `).bind(weekStart, today, ...CANONICAL_FACTION_KEYS).all();
  if (result.success !== true || !Array.isArray(result.results)) throw new Error('clan_leader_activity_unavailable');
  const totals = new Map(result.results.map(row => [row.faction_id, row]));

  return {
    week_start: weekStart,
    prior_week_final: Boolean(prior),
    crews: CANONICAL_FACTION_KEYS.map(factionId => {
      const { banks, signals, member_days } = totals.get(factionId) ?? { banks: 0, signals: 0, member_days: 0 };
      const perk = weeklyPerk(standings.get(factionId));
      const stats = { banks, signals, member_days };
      const option = perk?.options.find(({ id }) => id === perk.selected);
      const boost = option ? stats[option.metric] * option.points : 0;
      const base = banks + 2 * signals;
      return { faction_id: factionId, ...stats, base, boost, power: base + boost, perk };
    }),
  };
}
