// NBG London competition boundaries match the existing Arcade UTC cycle.
// Daily: 00:00 UTC; weekly: Monday 00:00 UTC;
// seasonal: every 90 days from the existing Arcade epoch 2024-01-01 00:00 UTC.
const DAY = 86400000;
const EPOCH = 1704067200000; // workers/leaderboard-worker.js: SEASON_EPOCH_MS
const DURATIONS = Object.freeze({ daily: DAY, weekly: 7 * DAY, seasonal: 90 * DAY });
export const PRIZE_ARCADE_XP = Object.freeze({
  daily: Object.freeze([100, 60, 30]),
  weekly: Object.freeze([500, 300, 150]),
  seasonal: Object.freeze([2500, 1500, 750]),
});
export function periodStart(now, kind) {
  const duration = DURATIONS[kind];
  if (!duration) throw new Error('invalid_competition_kind');
  return EPOCH + Math.floor((now - EPOCH) / duration) * duration;
}
export function periodsForFinish(now) {
  return Object.keys(DURATIONS).map(kind => ({ kind, start: periodStart(now, kind) }));
}
export function endedPeriods(now) {
  return Object.entries(DURATIONS).map(([kind, duration]) => {
    const end = periodStart(now, kind);
    return { kind, start: end - duration, end };
  }).filter(period => period.start >= EPOCH && now >= period.end);
}
function reference(kind, start, rank) {
  return `nbg-london:${kind}:${start}:${rank}`;
}
function validatePeriod(period, now) {
  const duration = DURATIONS[period?.kind];
  if (!duration || period.start + duration !== period.end || now < period.end)
    throw new Error('nbg_period_not_closed');
}

// Freeze a single top-three roster once per period. All SQL is in a single
// D1 atomic batch. The freeze token prevents a competing scheduler overwriting
// the first snapshot if a blocked player's status changes during the attempt.
async function freezePeriod(env, period, now) {
  const token = crypto.randomUUID();
  // Both the closed-period marker and the winner SELECT execute in one D1 batch:
  // no accepted finish can sneak into a period between ranking and freezing.
  const statements = [
    env.DB.prepare(
      `INSERT OR IGNORE INTO nbg_london_prize_periods
       (period_kind,period_start_ms,period_end_ms,frozen_at_ms,freeze_token)
       VALUES (?,?,?,?,?)`
    ).bind(period.kind, period.start, period.end, now, token),
    env.DB.prepare(
      `INSERT OR IGNORE INTO nbg_london_prize_awards
       (event_id, period_kind, period_start_ms, rank, telegram_id, prize_arcade_xp, settled_at_ms)
       SELECT 'nbg-london:' || ? || ':' || ? || ':' || r.rank,
         ?, ?, r.rank, r.telegram_id,
         CASE r.rank WHEN 1 THEN ? WHEN 2 THEN ? ELSE ? END, ?
       FROM (
         SELECT s.telegram_id,
           ROW_NUMBER() OVER (
             ORDER BY s.trusted_xp DESC, s.best_time_ms ASC, s.telegram_id ASC
           ) AS rank
         FROM nbg_london_period_scores s
         LEFT JOIN telegram_anticheat_state a ON a.telegram_id = s.telegram_id
         WHERE s.period_kind = ? AND s.period_start_ms = ?
           AND s.verified_run_count > 0 AND s.trusted_xp > 0
           AND COALESCE(a.is_blocked, 0) = 0
       ) r
       WHERE r.rank <= 3 AND EXISTS (
         SELECT 1 FROM nbg_london_prize_periods
         WHERE period_kind = ? AND period_start_ms = ? AND freeze_token = ?
       )`
    ).bind(period.kind, period.start, period.kind, period.start,
      PRIZE_ARCADE_XP[period.kind][0], PRIZE_ARCADE_XP[period.kind][1],
      PRIZE_ARCADE_XP[period.kind][2], now,
      period.kind, period.start, period.kind, period.start, token),
  ];
  await env.DB.batch(statements);
}

async function payPrize(env, prize, now) {
  const token = crypto.randomUUID();
  const key = new Date(now).toISOString().slice(0, 10); // actual payout day, not historic period end
  const id = prize.event_id;
  const telegramId = prize.telegram_id;
  const xp = prize.prize_arcade_xp;
  const eligible = `EXISTS (SELECT 1 FROM nbg_london_prize_awards p
    LEFT JOIN telegram_anticheat_state a ON a.telegram_id = p.telegram_id
    WHERE p.event_id = ? AND p.payout_token = ? AND p.paid_at_ms IS NULL
      AND COALESCE(a.is_blocked, 0) = 0)`;
  const statements = [
    env.DB.prepare(
      `UPDATE nbg_london_prize_awards SET payout_token = ?
       WHERE event_id = ? AND paid_at_ms IS NULL AND payout_token IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM telegram_anticheat_state a
           WHERE a.telegram_id = nbg_london_prize_awards.telegram_id AND a.is_blocked = 1
         )`
    ).bind(token, id),
    env.DB.prepare(
      `INSERT INTO arcade_progression_state
       (telegram_id,arcade_xp_total,arcade_daily_xp,arcade_daily_key,arcade_restriction_level,restricted_until,updated_at)
       SELECT ?,?,?,?,0,NULL,CURRENT_TIMESTAMP WHERE ${eligible}
       ON CONFLICT(telegram_id) DO UPDATE SET
       arcade_xp_total = arcade_progression_state.arcade_xp_total + excluded.arcade_xp_total,
       arcade_daily_xp = CASE WHEN arcade_progression_state.arcade_daily_key = excluded.arcade_daily_key
         THEN arcade_progression_state.arcade_daily_xp + excluded.arcade_daily_xp ELSE excluded.arcade_daily_xp END,
       arcade_daily_key = excluded.arcade_daily_key, updated_at=CURRENT_TIMESTAMP`
    ).bind(telegramId, xp, xp, key, id, token),
    env.DB.prepare(
      `INSERT INTO arcade_xp_wallets
       (telegram_id,arcade_xp_earned,arcade_xp_spendable,arcade_xp_spent,updated_at)
       SELECT ?,?,?,0,CURRENT_TIMESTAMP WHERE ${eligible}
       ON CONFLICT(telegram_id) DO UPDATE SET
       arcade_xp_earned = arcade_xp_wallets.arcade_xp_earned + excluded.arcade_xp_earned,
       arcade_xp_spendable = arcade_xp_wallets.arcade_xp_spendable + excluded.arcade_xp_spendable,
       updated_at=CURRENT_TIMESTAMP`
    ).bind(telegramId, xp, xp, id, token),
    env.DB.prepare(
      `INSERT OR IGNORE INTO arcade_progression_events
       (id,telegram_id,client_run_id,game,raw_score,local_meta_points,normalized_points,xp_awarded,status,reason,processed_at)
       SELECT ?,?,?,'nbg-london',?,0,?,?, 'accepted',?,CURRENT_TIMESTAMP WHERE ${eligible}`
    ).bind(id, telegramId, id, prize.prize_arcade_xp, prize.prize_arcade_xp, xp,
      'period_prize_' + prize.period_kind + '_rank_' + prize.rank, id, token),
    env.DB.prepare(
      'UPDATE nbg_london_prize_awards SET paid_at_ms = ? WHERE event_id = ? AND payout_token = ? AND paid_at_ms IS NULL'
    ).bind(now, id, token),
  ];
  const results = await env.DB.batch(statements);
  return results[4]?.meta?.changes === 1;
}

export async function settleNbgLondonPeriod(env, period, now = Date.now()) {
  if (!env?.DB) throw new Error('nbg_competition_db_unavailable');
  validatePeriod(period, now);
  const frozen = await env.DB.prepare(
    'SELECT freeze_token FROM nbg_london_prize_periods WHERE period_kind=? AND period_start_ms=?'
  ).bind(period.kind, period.start).first();
  if (!frozen) await freezePeriod(env, period, now);
  const pending = (await env.DB.prepare(
    `SELECT event_id,period_kind,period_start_ms,rank,telegram_id,prize_arcade_xp
       FROM nbg_london_prize_awards
      WHERE period_kind=? AND period_start_ms=? AND paid_at_ms IS NULL ORDER BY rank`
  ).bind(period.kind, period.start).all()).results || [];
  const paid = [];
  for (const prize of pending) {
    if (await payPrize(env, prize, now))
      paid.push({ rank: prize.rank, telegram_id: prize.telegram_id, arcade_xp: prize.prize_arcade_xp });
  }
  return paid;
}

// Discover ALL older unprocessed or partially paid competitions, not merely
// yesterday. Repeated midnight UTC invocations recover past worker failures.
export async function settleNbgLondonDue(env, now = Date.now()) {
  if (!env?.DB) throw new Error('nbg_competition_db_unavailable');
  const open = (await env.DB.prepare(
    `SELECT DISTINCT s.period_kind, s.period_start_ms
       FROM nbg_london_period_scores s
       LEFT JOIN nbg_london_prize_periods p
         ON p.period_kind=s.period_kind AND p.period_start_ms=s.period_start_ms
      WHERE p.period_kind IS NULL AND s.period_start_ms +
        CASE s.period_kind WHEN 'daily' THEN ? WHEN 'weekly' THEN ? ELSE ? END <= ?
      ORDER BY s.period_start_ms ASC LIMIT 50`
  ).bind(DAY, DURATIONS.weekly, DURATIONS.seasonal, now).all()).results || [];
  const pending = (await env.DB.prepare(
    `SELECT DISTINCT period_kind,period_start_ms
       FROM nbg_london_prize_awards WHERE paid_at_ms IS NULL ORDER BY period_start_ms ASC LIMIT 50`
  ).all()).results || [];
  const merged = new Map();
  for (const row of [...open, ...pending]) merged.set(row.period_kind + ':' + row.period_start_ms, row);
  const reports = [];
  for (const row of merged.values()) {
    const period = { kind: row.period_kind, start: row.period_start_ms,
      end: row.period_start_ms + DURATIONS[row.period_kind] };
    if (period.end > now) continue;
    reports.push({ kind: period.kind, period_start_ms: period.start,
      payouts: await settleNbgLondonPeriod(env, period, now) });
  }
  return reports;
}
