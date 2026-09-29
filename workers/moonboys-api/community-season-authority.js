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
    WHERE is_active=1 AND start_date <= ? AND (end_date IS NULL OR end_date > ?)
    ORDER BY start_date DESC, id DESC
  `).bind(date.toISOString(), date.toISOString()).all());
  return rows[0] || null;
}

export function communitySeasonSql(alias = 'season', dateExpression = '?') {
  return `${alias}.is_active=1
    AND datetime(${alias}.start_date) <= datetime(${dateExpression})
    AND (${alias}.end_date IS NULL OR datetime(${dateExpression}) < datetime(${alias}.end_date))`;
}
