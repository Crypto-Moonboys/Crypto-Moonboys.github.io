import { crewWeek, rankCrewScores, readCrewStandings } from './clan-crew-standings.js';

const utcDay = date => date.toISOString().slice(0, 10);
const closedPeriodDelay = 5 * 60_000;

function monthBoundary(day, offset = 0) {
  const date = new Date(day);
  return utcDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)));
}

export function clanPeriodStart(env) {
  const day = env.CLAN_PERIOD_REWARDS_FROM;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return null;
  const date = new Date(day);
  return Number.isFinite(+date) && utcDay(date) === day ? day : null;
}

async function readLongPeriodStandings(db, start, end) {
  const result = await db.prepare(`
    WITH roster AS (
      SELECT *, MAX(week_start, ?1) AS starts_on,
        MIN(date(week_start, '+7 days'), ?2) AS ends_before
      FROM clan_crew_roster_entries
      WHERE week_start >= date(?1, '-6 days') AND week_start < ?2
    ), bank_days AS (
      SELECT roster.week_start, roster.telegram_id, bank.utc_day, COUNT(*) AS banks,
        ROW_NUMBER() OVER (PARTITION BY roster.week_start, roster.telegram_id
          ORDER BY COUNT(*) DESC, bank.utc_day) AS day_rank
      FROM roster
      JOIN clan_operation_awards AS bank ON bank.telegram_id = roster.telegram_id
        AND bank.faction_id = roster.faction_id AND bank.utc_day >= roster.starts_on
        AND bank.utc_day < roster.ends_before
      GROUP BY roster.week_start, roster.telegram_id, bank.utc_day
    ), member_scores AS (
      SELECT week_start, telegram_id, SUM(banks) AS scored_banks
      FROM bank_days WHERE day_rank <= 5 GROUP BY week_start, telegram_id
    )
    SELECT roster.faction_id, COUNT(DISTINCT roster.telegram_id) AS roster_size,
      COUNT(DISTINCT scores.telegram_id) AS active_members,
      COALESCE(SUM(scores.scored_banks), 0) AS scored_banks,
      SUM(3 * MIN(5, julianday(roster.ends_before) - julianday(roster.starts_on))) AS possible_banks
    FROM roster
    LEFT JOIN member_scores AS scores USING (week_start, telegram_id)
    GROUP BY roster.faction_id
  `).bind(start, end).all();
  if (!result.success) throw new Error('clan_period_standings_unavailable');
  return rankCrewScores(result.results).crews;
}

async function closePeriod(db, kind, key, start, end, now) {
  const crews = kind === 'weekly'
    ? (await readCrewStandings(db, crewWeek(new Date(start)))).crews
    : await readLongPeriodStandings(db, start, end);
  const result = await db.prepare(`
    INSERT INTO clan_period_results (kind, period_key, starts_on, ends_before, closed_at, standings_json)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(kind, period_key) DO NOTHING
  `).bind(kind, key, start, end, now.toISOString(), JSON.stringify(crews)).run();
  if (!result.success) throw new Error('clan_period_close_failed');
}

export async function closeClanPeriods(db, from, now) {
  // Leave a short buffer for requests that crossed midnight while banking.
  const cutoff = utcDay(new Date(+now - closedPeriodDelay));
  for (const kind of ['weekly', 'monthly']) {
    const saved = await db.prepare('SELECT MAX(ends_before) AS next_start FROM clan_period_results WHERE kind=?')
      .bind(kind).first();
    const endOf = day => kind === 'weekly' ? crewWeek(new Date(Date.parse(day) + 7 * 86_400_000)).start : monthBoundary(day, 1);
    let start = saved.next_start ?? (kind === 'weekly' ? crewWeek(new Date(from)).start : monthBoundary(from));
    if (start < from) start = endOf(start);
    // Recover missed periods in bounded batches.
    for (let count = 0; count < 3; count++) {
      const end = endOf(start);
      if (end > cutoff) break;
      await closePeriod(db, kind, start, start, end, now);
      start = end;
    }
  }
  const seasons = await db.prepare(`
    WITH seasons AS (
      SELECT id, CASE WHEN julianday(start_date) > julianday(date(start_date))
        THEN date(start_date, '+1 day') ELSE date(start_date) END AS starts_on,
        date(end_date) AS ends_before, julianday(end_date) AS ends_at
      FROM telegram_seasons
    )
    SELECT id, starts_on, ends_before FROM seasons
    WHERE starts_on >= ? AND ends_at <= julianday(?) AND ends_before > starts_on
      AND NOT EXISTS (
        SELECT 1 FROM clan_period_results WHERE kind='seasonal' AND period_key=CAST(seasons.id AS TEXT)
      )
    ORDER BY ends_at, id LIMIT 3
  `).bind(from, new Date(+now - closedPeriodDelay).toISOString()).all();
  if (!seasons.success) throw new Error('clan_period_seasons_unavailable');
  for (const season of seasons.results) {
    await closePeriod(db, 'seasonal', String(season.id), season.starts_on, season.ends_before, now);
  }
}

export async function readClanPeriodResults(db) {
  const result = await db.prepare(`
    WITH recent AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY kind ORDER BY ends_before DESC, period_key DESC) AS place
      FROM clan_period_results
    )
    SELECT kind, period_key, starts_on, ends_before, standings_json FROM recent
    WHERE place <= CASE kind WHEN 'seasonal' THEN 10 ELSE 1 END
    ORDER BY ends_before DESC, kind
  `).all();
  if (!result.success) throw new Error('clan_period_results_unavailable');
  return result.results.map(({ standings_json, ...row }) => ({ ...row, crews: JSON.parse(standings_json) }));
}

export async function readClanPeriodRewards(db, owner) {
  const result = await db.prepare(`
    SELECT receipt.kind, receipt.period_key, receipt.faction_id, result.starts_on
    FROM clan_period_reward_receipts AS receipt
    JOIN clan_period_results AS result USING (kind, period_key)
    WHERE receipt.telegram_id = ? ORDER BY result.ends_before DESC, receipt.kind LIMIT 30
  `).bind(owner).all();
  if (!result.success) throw new Error('clan_period_rewards_unavailable');
  return result.results;
}
