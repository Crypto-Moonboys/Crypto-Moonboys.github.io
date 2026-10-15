// NBG London timeboxed competitions. Only 3 distinct users receive prizes per period.
// Match existing Arcade UTC boundaries: daily midnight, weekly Monday midnight,
// 90-day seasons anchored at 2024-01-01T00:00:00.000Z (shared Arcade epoch).
// Prize ladder is provisional and must be approved before production deployment.
const DAY = 86400000;
const WEEK = DAY * 7;
const SEASON = DAY * 90;
const EPOCH = 1704067200000; // existing leaderboard SEASON_EPOCH_MS
const DURATIONS = Object.freeze({ daily: DAY, weekly: WEEK, seasonal: SEASON });
export const PRIZE_ARCADE_XP = Object.freeze({
  daily: Object.freeze([100, 60, 30]),
  weekly: Object.freeze([500, 300, 150]),
  seasonal: Object.freeze([2500, 1500, 750]),
});

export function periodStart(now, kind) {
  if (!Object.prototype.hasOwnProperty.call(DURATIONS, kind)) throw new Error('invalid_competition_kind');
  const duration = DURATIONS[kind];
  return EPOCH + Math.floor((now - EPOCH) / duration) * duration;
}

export function periodsForFinish(now) {
  return Object.keys(DURATIONS).map(kind => ({
    kind, start: periodStart(now, kind),
  }));
}

// Settlement happens at the shared 00:00 UTC Arcade daily cron.
export function endedPeriods(now) {
  const dayEnd = periodStart(now, 'daily');
  const ends = [];
  for (const [kind, duration] of Object.entries(DURATIONS)) {
    const end = periodStart(now, kind);
    if (now < end || end < EPOCH + duration) continue;
    ends.push({ kind, start: end - duration, end });
  }
  return ends;
}

function awardId(period, rank) {
  return `nbg-london:${period.kind}:${period.start}:${rank}`;
}

export async function settleNbgLondonPeriod(env, period, now = Date.now()) {
  if (!env?.DB) throw new Error('nbg_competition_db_unavailable');
  if (!PRIZE_ARCADE_XP[period.kind] ||
      period.start + DURATIONS[period.kind] !== period.end ||
      now < period.end) throw new Error('nbg_period_not_ended');

  // One payout ranking across the game, rather than 3 payouts per leaderboard.
  // Ties: highest accumulated run XP, then fastest completed run, then stable ID.
  const result = await env.DB.prepare(
    `SELECT s.telegram_id, s.total_xp, s.best_time_ms
     FROM nbg_london_period_scores s
     LEFT JOIN telegram_anticheat_state a ON a.telegram_id = s.telegram_id
     WHERE s.period_kind = ? AND s.period_start_ms = ?
       AND COALESCE(a.is_blocked, 0) = 0
     ORDER BY s.total_xp DESC, s.best_time_ms ASC, s.telegram_id ASC LIMIT 3`
  ).bind(period.kind, period.start).all();
  const winners = result?.results || [];
  const settled = [];
  for (let i = 0; i < winners.length; i += 1) {
    const row = winners[i];
    if (!(Number(row.total_xp) > 0)) continue;
    const rank = i + 1;
    const xp = PRIZE_ARCADE_XP[period.kind][i];
    const eventId = awardId(period, rank);
    const dayKey = new Date(period.end).toISOString().slice(0, 10);
    // D1 batch is atomic; retrying any period/rank never credits XP twice.
    const changes = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO arcade_progression_state
          (telegram_id, arcade_xp_total, arcade_daily_xp, arcade_daily_key,
           arcade_restriction_level, restricted_until, updated_at)
         SELECT ?, ?, ?, ?, 0, NULL, CURRENT_TIMESTAMP
         WHERE NOT EXISTS (SELECT 1 FROM nbg_london_prize_awards WHERE event_id = ?)
         ON CONFLICT(telegram_id) DO UPDATE SET
           arcade_xp_total = arcade_progression_state.arcade_xp_total + excluded.arcade_xp_total,
           arcade_daily_xp = CASE
             WHEN arcade_progression_state.arcade_daily_key = excluded.arcade_daily_key
               THEN arcade_progression_state.arcade_daily_xp + excluded.arcade_daily_xp
             ELSE excluded.arcade_daily_xp END,
           arcade_daily_key = excluded.arcade_daily_key,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(row.telegram_id, xp, xp, dayKey, eventId),
      env.DB.prepare(
        `INSERT INTO arcade_xp_wallets
          (telegram_id, arcade_xp_earned, arcade_xp_spendable, arcade_xp_spent, updated_at)
         SELECT ?, ?, ?, 0, CURRENT_TIMESTAMP
         WHERE NOT EXISTS (SELECT 1 FROM nbg_london_prize_awards WHERE event_id = ?)
         ON CONFLICT(telegram_id) DO UPDATE SET
           arcade_xp_earned = arcade_xp_wallets.arcade_xp_earned + excluded.arcade_xp_earned,
           arcade_xp_spendable = arcade_xp_wallets.arcade_xp_spendable + excluded.arcade_xp_spendable,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(row.telegram_id, xp, xp, eventId),
      env.DB.prepare(
        `INSERT OR IGNORE INTO arcade_progression_events
          (id, telegram_id, client_run_id, game, raw_score, local_meta_points,
           normalized_points, xp_awarded, status, reason, processed_at)
         SELECT ?, ?, ?, 'nbg-london', ?, 0, ?, ?, 'accepted', ?, CURRENT_TIMESTAMP
         WHERE NOT EXISTS (SELECT 1 FROM nbg_london_prize_awards WHERE event_id = ?)`
      ).bind(eventId, row.telegram_id, eventId, row.total_xp, row.total_xp, xp,
        `period_prize_${period.kind}_rank_${rank}`, eventId),
      env.DB.prepare(
        `INSERT OR IGNORE INTO nbg_london_prize_awards
          (event_id, period_kind, period_start_ms, rank, telegram_id, prize_arcade_xp, settled_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(eventId, period.kind, period.start, rank, row.telegram_id, xp, now),
    ]);
    if (changes[3]?.meta?.changes === 1) {
      settled.push({ rank, telegram_id: row.telegram_id, arcade_xp: xp });
    }
  }
  return settled;
}

export async function settleNbgLondonDue(env, now = Date.now()) {
  const reports = [];
  for (const period of endedPeriods(now)) {
    reports.push({
      kind: period.kind, period_start_ms: period.start,
      payouts: await settleNbgLondonPeriod(env, period, now),
    });
  }
  return reports;
}
