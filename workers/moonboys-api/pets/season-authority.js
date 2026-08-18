function coerceDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

export function getMoonpetSeasonInfo(now = new Date()) {
  const date = coerceDate(now);
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3);
  const seasonNumber = quarter + 1;
  const start = new Date(Date.UTC(year, quarter * 3, 1));
  const end = quarter === 3
    ? new Date(Date.UTC(year + 1, 0, 1))
    : new Date(Date.UTC(year, (quarter + 1) * 3, 1));
  return {
    key: `pet-s${year}-${String(seasonNumber).padStart(3, '0')}`,
    season_number: seasonNumber,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    current_at: date.toISOString(),
  };
}

export function getMoonpetSeasonKey(now = new Date()) {
  return getMoonpetSeasonInfo(now).key;
}
