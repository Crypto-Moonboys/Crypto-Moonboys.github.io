/**
 * Championship Clout v1: deterministic, non-spendable *read-side* policy.
 *
 * Input MUST be records already validated against immutable, server-owned
 * event/receipt rows by a separately reviewed source adapter.
 * This module does NOT accept browser requests, mint XP, verify gameplay,
 * write awards or run a prize scheduler.
 */
export const CLOUT_POLICY_VERSION = 'championship-v1';
export const CLOUT_DAILY_CEILINGS = Object.freeze({
  skill: 40,
  mission: 25,
  variety: 15,
  community: 10,
  streak: 10,
});
export const CLOUT_DAILY_MAX = 100;

const MS_DAY = 86_400_000;
const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const OWNER = /^\d{1,20}$/u;
const GAME = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const EFFECT_KINDS = new Set(Object.keys(CLOUT_DAILY_CEILINGS));
const SOURCE_KINDS = new Set(['server_receipt', 'server_replay', 'server_settlement']);
const PERIOD_KINDS = new Set(['daily', 'weekly', 'quarterly', 'annual']);

function fail(code) {
  throw new Error('championship_clout_' + code);
}
function integer(value, from, to, field) {
  if (!Number.isSafeInteger(value) || value < from || value > to) fail('invalid_' + field);
  return value;
}
function boundedText(value, field, max = 180) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('invalid_' + field);
  return value;
}
function dayMs(dayKey) {
  if (typeof dayKey !== 'string' || !UTC_DAY.test(dayKey)) fail('invalid_day_key');
  const t = Date.parse(dayKey + 'T00:00:00.000Z');
  if (!Number.isSafeInteger(t) || new Date(t).toISOString().slice(0, 10) !== dayKey)
    fail('invalid_day_key');
  return t;
}
export function cloutDayKey(earnedAtMs) {
  integer(earnedAtMs, 1_704_067_200_000, 8_640_000_000_000_000, 'event_time');
  return new Date(earnedAtMs).toISOString().slice(0, 10);
}

/** Canonical UTC boundaries; week = Monday and quarter = Jan/Apr/Jul/Oct. */
export function getCloutPeriod(kind, atMs) {
  if (!PERIOD_KINDS.has(kind)) fail('invalid_period_kind');
  integer(atMs, 1_704_067_200_000, 8_640_000_000_000_000, 'period_time');
  const d = new Date(atMs);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (kind === 'daily')
    return { kind, key: new Date(day).toISOString().slice(0, 10),
      start_ms: day, end_ms: day + MS_DAY };
  if (kind === 'weekly') {
    const monday = day - ((d.getUTCDay() + 6) % 7) * MS_DAY;
    return { kind, key: new Date(monday).toISOString().slice(0, 10),
      start_ms: monday, end_ms: monday + 7 * MS_DAY };
  }
  const year = d.getUTCFullYear();
  if (kind === 'annual')
    return { kind, key: String(year), start_ms: Date.UTC(year, 0, 1),
      end_ms: Date.UTC(year + 1, 0, 1) };
  const quarter = Math.floor(d.getUTCMonth() / 3);
  return { kind, key: year + '-Q' + (quarter + 1),
    start_ms: Date.UTC(year, quarter * 3, 1),
    end_ms: Date.UTC(year, (quarter + 1) * 3, 1) };
}

/**
 * Compute exactly one daily result from previously verified D1 effects for
 * exactly one linked owner and UTC earned day. Same source event may support
 * multiple DECLARED effect kinds but cannot duplicate the same kind.
 *
 * A game's highest verified normalized rating (0..100) counts once, regardless
 * of how often it is played. Variety counts up to three distinct proven titles.
 */
export function projectCloutDay(effects) {
  if (!Array.isArray(effects) || effects.length > 50_000) fail('invalid_effect_batch');
  if (effects.length === 0) return null;

  const first = effects[0];
  const owner = boundedText(first.telegram_id, 'owner', 20);
  if (!OWNER.test(owner)) fail('invalid_owner');
  const dayKey = boundedText(first.day_key, 'day_key', 10);
  dayMs(dayKey);
  const uniqueEffects = new Set();
  const bestSkills = new Map();
  const varietyGames = new Set();
  const allGames = new Set();
  const sum = { mission: 0, community: 0, streak: 0 };
  let firstEarnedAt = Infinity;

  for (const effect of effects) {
    if (effect.telegram_id !== owner || effect.day_key !== dayKey)
      fail('cross_owner_or_day');
    if (effect.policy_version !== CLOUT_POLICY_VERSION)
      fail('policy_mismatch');
    if (!EFFECT_KINDS.has(effect.effect_kind)) fail('invalid_effect_kind');
    if (!SOURCE_KINDS.has(effect.verification_kind)) fail('unverified_source');
    const source = boundedText(effect.source_system, 'source_system', 64);
    const sourceId = boundedText(effect.source_event_id, 'source_event_id', 180);
    integer(effect.earned_at_ms, 1_704_067_200_000, 8_640_000_000_000_000, 'earned_at');
    integer(effect.verified_at_ms, effect.earned_at_ms, 8_640_000_000_000_000, 'verified_at');
    if (cloutDayKey(effect.earned_at_ms) !== dayKey) fail('earned_day_mismatch');
    const key = JSON.stringify([source, sourceId, effect.effect_kind]);
    if (uniqueEffects.has(key)) fail('duplicate_effect');
    uniqueEffects.add(key);
    firstEarnedAt = Math.min(firstEarnedAt, effect.earned_at_ms);

    if (effect.effect_kind === 'skill' || effect.effect_kind === 'variety') {
      const game = boundedText(effect.game_key, 'game_key', 64);
      if (!GAME.test(game)) fail('invalid_game_key');
      allGames.add(game);
      if (effect.effect_kind === 'skill') {
        integer(effect.normalized_skill, 0, 100, 'skill_rating');
        if (effect.fixed_points != null) fail('skill_has_fixed_points');
        bestSkills.set(game, Math.max(bestSkills.get(game) ?? 0, effect.normalized_skill));
      } else {
        if (effect.normalized_skill != null || effect.fixed_points != null)
          fail('variety_must_be_derived');
        varietyGames.add(game);
      }
    } else {
      if (effect.normalized_skill != null) fail('unexpected_skill_rating');
      const points = integer(effect.fixed_points, 0, CLOUT_DAILY_CEILINGS[effect.effect_kind], 'fixed_points');
      sum[effect.effect_kind] += points;
    }
  }

  const top = [...bestSkills.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3);
  // Non-decreasing: taking on a second, weaker game must NEVER subtract
  // earned Clout. Best verified game is the baseline, with small additive
  // rewards for up to two additional distinct, independently verified games.
  // Cross-game variety already has its own separate daily bucket.
  const adjustedRating = top.length
    ? Math.min(100, top[0][1] + (top[1]?.[1] ?? 0) * 0.10 +
      (top[2]?.[1] ?? 0) * 0.05)
    : 0;
  const skillPoints = Math.floor(adjustedRating * 40 / 100);
  const score = {
    skill_points: skillPoints,
    mission_points: Math.min(CLOUT_DAILY_CEILINGS.mission, sum.mission),
    variety_points: Math.min(CLOUT_DAILY_CEILINGS.variety, varietyGames.size * 5),
    community_points: Math.min(CLOUT_DAILY_CEILINGS.community, sum.community),
    streak_points: Math.min(CLOUT_DAILY_CEILINGS.streak, sum.streak),
  };
  const total = Object.values(score).reduce((a, b) => a + b, 0);
  if (total > CLOUT_DAILY_MAX) fail('daily_total_overflow');
  return {
    telegram_id: owner,
    day_key: dayKey,
    policy_version: CLOUT_POLICY_VERSION,
    ...score,
    total_points: total,
    game_keys_json: JSON.stringify([...allGames].sort()),
    first_earned_at_ms: firstEarnedAt,
  };
}

function validSnapshot(row) {
  if (!OWNER.test(String(row.telegram_id || ''))) fail('invalid_snapshot_owner');
  if (row.policy_version !== CLOUT_POLICY_VERSION) fail('snapshot_policy_mismatch');
  dayMs(row.day_key);
  const fields = [
    ['skill_points', 40], ['mission_points', 25], ['variety_points', 15],
    ['community_points', 10], ['streak_points', 10],
  ];
  const sum = fields.reduce((acc, [name, cap]) =>
    acc + integer(row[name], 0, cap, name), 0);
  if (row.total_points !== sum) fail('invalid_snapshot_total');
  integer(row.first_earned_at_ms, dayMs(row.day_key), dayMs(row.day_key) + MS_DAY - 1, 'snapshot_earned_at');
  let games;
  try { games = JSON.parse(row.game_keys_json); } catch { fail('invalid_games_json'); }
  if (!Array.isArray(games) || games.length > 200 ||
      new Set(games).size !== games.length ||
      games.some(g => typeof g !== 'string' || !GAME.test(g))) fail('invalid_games_json');
  return games;
}

/**
 * Deterministic leaderboard from *materialized daily* rows. No writes.
 * Does not pay a prize or change existing old competition scores.
 */
export function projectCloutLeaderboard(dailyRows, kind, atMs, limit = 100) {
  if (!Array.isArray(dailyRows) || dailyRows.length > 50_000)
    fail('invalid_daily_rows');
  integer(limit, 1, 100, 'leaderboard_limit');
  const period = getCloutPeriod(kind, atMs);
  const group = new Map();
  const seenDays = new Set();

  for (const row of dailyRows) {
    const games = validSnapshot(row);
    const dayStart = dayMs(row.day_key);
    if (dayStart < period.start_ms || dayStart >= period.end_ms) continue;
    const dayIdentity = row.telegram_id + ':' + row.day_key;
    if (seenDays.has(dayIdentity)) fail('duplicate_daily_snapshot');
    seenDays.add(dayIdentity);
    let current = group.get(row.telegram_id);
    if (!current) {
      current = { telegram_id: row.telegram_id, total_points: 0, active_days: 0,
        game_keys: new Set(), first_earned_at_ms: row.first_earned_at_ms };
      group.set(row.telegram_id, current);
    }
    current.total_points += row.total_points;
    current.active_days++;
    current.first_earned_at_ms = Math.min(current.first_earned_at_ms, row.first_earned_at_ms);
    games.forEach(g => current.game_keys.add(g));
  }

  const rows = [...group.values()].map(item => ({
    telegram_id: item.telegram_id,
    total_points: item.total_points,
    active_days: item.active_days,
    distinct_games: item.game_keys.size,
    first_earned_at_ms: item.first_earned_at_ms,
  })).sort((a, b) =>
    b.total_points - a.total_points ||
    b.distinct_games - a.distinct_games ||
    b.active_days - a.active_days ||
    a.first_earned_at_ms - b.first_earned_at_ms ||
    (BigInt(a.telegram_id) < BigInt(b.telegram_id) ? -1 :
      BigInt(a.telegram_id) > BigInt(b.telegram_id) ? 1 : 0)
  ).slice(0, limit).map((row, index) => ({ ...row, rank: index + 1 }));

  return { period, policy_version: CLOUT_POLICY_VERSION, rows };
}

/**
 * Read-side only SQL aggregation across the *daily* D1 materialization.
 * The annual board cannot be limited to 50,000 input daily rows: >137
 * daily-active players exceed that threshold during a leap year.
 *
 * D1/SQLite groups and sorts BEFORE applying LIMIT, so even an annual
 * period with hundreds of thousands of daily snapshots returns at most
 * 100 ranked accounts. This module is not exposed over HTTP in PR1.
 */
export async function readCloutLeaderboard(db, kind, atMs, limit = 100) {
  if (!db || typeof db.prepare !== 'function') fail('database_unavailable');
  integer(limit, 1, 100, 'leaderboard_limit');
  const period = getCloutPeriod(kind, atMs);
  const firstDay = new Date(period.start_ms).toISOString().slice(0, 10);
  const lastDay = new Date(period.end_ms).toISOString().slice(0, 10);
  const daysInPeriod = (period.end_ms - period.start_ms) / MS_DAY;

  // DISTINCT json_each unifies games across different days of the same
  // player's period, rather than summing per-day distinct_game counts.
  // The left join on bans excludes blocked accounts before accumulation.
  const sql = [
    'WITH eligible AS (',
    'SELECT d.telegram_id,d.total_points,d.first_earned_at_ms,d.game_keys_json',
    'FROM championship_clout_daily d',
    'LEFT JOIN telegram_anticheat_state a ON a.telegram_id=d.telegram_id',
    'WHERE d.policy_version=? AND d.day_key>=? AND d.day_key<?',
    'AND COALESCE(a.is_blocked,0)=0',
    '), totals AS (',
    'SELECT telegram_id,SUM(total_points) AS total_points,COUNT(*) AS active_days,',
    'MIN(first_earned_at_ms) AS first_earned_at_ms',
    'FROM eligible GROUP BY telegram_id',
    '), game_counts AS (',
    'SELECT e.telegram_id,COUNT(DISTINCT j.value) AS distinct_games',
    'FROM eligible e JOIN json_each(e.game_keys_json) j GROUP BY e.telegram_id',
    ')',
    'SELECT t.telegram_id,t.total_points,t.active_days,',
    'COALESCE(g.distinct_games,0) AS distinct_games,t.first_earned_at_ms',
    'FROM totals t LEFT JOIN game_counts g ON g.telegram_id=t.telegram_id',
    'ORDER BY t.total_points DESC,distinct_games DESC,t.active_days DESC,',
    't.first_earned_at_ms ASC,LENGTH(t.telegram_id) ASC,t.telegram_id ASC',
    'LIMIT ?',
  ].join(' ');

  const result = await db.prepare(sql)
    .bind(CLOUT_POLICY_VERSION, firstDay, lastDay, limit).all();
  if (result?.success === false || !Array.isArray(result?.results) ||
      result.results.length > limit) fail('daily_read_unavailable');

  const rows = result.results.map((row, index) => {
    const telegramId = String(row.telegram_id || '');
    if (!OWNER.test(telegramId)) fail('invalid_snapshot_owner');
    integer(row.total_points, 0, daysInPeriod * CLOUT_DAILY_MAX,
      'period_total');
    integer(row.active_days, 1, daysInPeriod, 'period_active_days');
    integer(row.distinct_games, 0, 200 * row.active_days, 'period_games');
    integer(row.first_earned_at_ms, period.start_ms,
      period.end_ms - 1, 'period_earned_at');
    return {
      telegram_id: telegramId,
      total_points: row.total_points,
      active_days: row.active_days,
      distinct_games: row.distinct_games,
      first_earned_at_ms: row.first_earned_at_ms,
      rank: index + 1,
    };
  });

  return { period, policy_version: CLOUT_POLICY_VERSION, rows };
}
