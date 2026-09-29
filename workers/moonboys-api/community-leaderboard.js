// One score basis per response. An empty season is not an all-time leaderboard,
// and an unavailable database is not evidence that no season/scores exist.
function requireRows(result) {
  if (result?.success === false || !Array.isArray(result?.results)) {
    throw new Error('community_leaderboard_unavailable');
  }
  return result.results;
}

export async function readCommunityLeaderboard(db, requestedLimit = 10) {
  const value = Number(requestedLimit);
  const limit = Number.isFinite(value) ? Math.min(50, Math.max(1, Math.floor(value))) : 10;
  // Match the existing Community season selection, independent of pet seasons.
  const seasons = requireRows(await db.prepare('SELECT * FROM telegram_seasons ORDER BY id DESC LIMIT 1').all());
  const season = seasons[0] || null;
  const rows = season
    ? requireRows(await db.prepare(`SELECT tl.telegram_id, tl.xp, tu.username, tu.first_name, tu.last_name
        FROM telegram_leaderboard tl LEFT JOIN telegram_users tu ON tu.telegram_id=tl.telegram_id
        WHERE tl.season_id=? ORDER BY tl.xp DESC, tl.telegram_id ASC LIMIT ?`).bind(season.id, limit).all())
    : requireRows(await db.prepare(`SELECT telegram_id, username, first_name, last_name, xp
        FROM telegram_users ORDER BY xp DESC, telegram_id ASC LIMIT ?`).bind(limit).all());
  return { season, score_basis: season ? 'community_season' : 'all_time', rows };
}
