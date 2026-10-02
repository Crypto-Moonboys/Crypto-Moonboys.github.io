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
