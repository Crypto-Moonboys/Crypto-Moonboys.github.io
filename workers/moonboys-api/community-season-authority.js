export const COMMUNITY_SEASON_DAYS = 90;

const DAY_MS = 86_400_000;

export async function rollCommunitySeason(db, now) {
  const provisionThrough = new Date(+now + DAY_MS).toISOString();

  // Each write selects the latest scheduled season inside the same statement.
  // Concurrent ticks see the successor and cannot create a second one.
  for (let attempted = 0; attempted < 8; attempted++) {
    const result = await db.prepare(`
      WITH latest AS (
        SELECT start_date, end_date, is_active
        FROM telegram_seasons ORDER BY julianday(start_date) DESC, id DESC LIMIT 1
      )
      INSERT INTO telegram_seasons (id, name, start_date, end_date, is_active)
      SELECT next_id, 'Season ' || next_id,
        strftime('%Y-%m-%dT%H:%M:%fZ', end_date),
        strftime('%Y-%m-%dT%H:%M:%fZ', end_date, ?), 1
      FROM latest CROSS JOIN (SELECT MAX(id) + 1 AS next_id FROM telegram_seasons)
      WHERE is_active = 1
        AND julianday(end_date) > julianday(start_date)
        AND julianday(end_date) <= julianday(?)
    `).bind('+' + COMMUNITY_SEASON_DAYS + ' days', provisionThrough).run();
    const changes = result.meta?.changes ?? result.changes;
    if (!result.success || ![0, 1].includes(changes)) {
      throw new Error('community_season_rollover_failed');
    }
    if (changes === 0) break;
  }
}

function readRows(result) {
  if (result?.success === false || !Array.isArray(result?.results)) {
    throw new Error('community_season_unavailable');
  }
  return result.results;
}

export async function selectCommunitySeason(db, at = new Date()) {
  const date = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(date.getTime())) throw new Error('community_season_unavailable');
  const rows = readRows(await db.prepare(`
    SELECT * FROM telegram_seasons
    WHERE is_active=1
      AND julianday(start_date) <= julianday(?)
      AND (end_date IS NULL OR julianday(?) < julianday(end_date))
    ORDER BY julianday(start_date) DESC, id DESC
  `).bind(date.toISOString(), date.toISOString()).all());
  return rows[0] || null;
}

export function communitySeasonSql(alias = 'season', dateExpression = '?') {
  return `${alias}.is_active=1
    AND julianday(${alias}.start_date) <= julianday(${dateExpression})
    AND (${alias}.end_date IS NULL OR julianday(${dateExpression}) < julianday(${alias}.end_date))`;
}

// A reservation's saved day remains authoritative when a legacy insert was
// timestamped during later recovery. Never move that reward to today's season.
// Use the original full timestamp when it agrees with the retained source day.
export function communityReceiptTimestampSql(alias) {
  return `CASE WHEN julianday(${alias}.created_at) IS NOT NULL
    AND (${alias}.day_key IS NULL OR ${alias}.day_key='' OR date(${alias}.created_at)=${alias}.day_key)
    THEN ${alias}.created_at ELSE ${alias}.day_key END`;
}
