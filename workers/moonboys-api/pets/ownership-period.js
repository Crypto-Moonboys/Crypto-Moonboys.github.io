// Competition seasons may end; a pet's source ownership and journey never do.
const WEEK_MS = 604800000;
export function getPetOwnershipPeriod(seasonKey, createdAt, journeyClock = createdAt ? 'created_at' : 'legacy_quarter') {
  const key = String(seasonKey || '');
  const match = key.match(/^pet-s(\d{4})-00([1-4])$/) || key.match(/^(\d{4})-q([1-4])$/);
  let start, legacyEnd = null;
  if (!['created_at', 'legacy_quarter'].includes(journeyClock)) throw new Error('pet_journey_age_authority_unavailable');
  if (journeyClock === 'legacy_quarter' && match) {
    const year = Number(match[1]), quarter = Number(match[2]) - 1;
    start = Date.UTC(year, quarter * 3, 1);
    legacyEnd = Date.UTC(year, (quarter + 1) * 3, 1);
  } else {
    const parsed = parsePetOwnershipTimestamp(createdAt);
    start = Number.isFinite(parsed) ? Date.parse(new Date(parsed).toISOString().slice(0, 10)) : NaN;
  }
  if (!Number.isFinite(start)) throw new Error('pet_journey_age_authority_unavailable');
  return { key, clock: journeyClock, start_at: new Date(start).toISOString(), legacy_end_at: legacyEnd == null ? null : new Date(legacyEnd).toISOString(), end_at: null };
}
// D1 CURRENT_TIMESTAMP values are UTC even without an explicit timezone suffix.
export function parsePetOwnershipTimestamp(value) {
  const raw = String(value || '').trim();
  return Date.parse(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z` : raw);
}
export function getPetJourneyWeek(period, now = new Date()) {
  const start = Date.parse(period.start_at), end = Date.parse(period.legacy_end_at || ''), current = new Date(now).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(current)) throw new Error('pet_journey_age_authority_unavailable');
  if (Number.isFinite(end) && current >= end) return 14 + Math.floor((current - end) / WEEK_MS);
  const week = Math.max(1, Math.floor((current - start) / WEEK_MS) + 1);
  return Number.isFinite(end) ? Math.min(13, week) : week;
}
export function getPetJourneyWeekBounds(period, week) {
  if (!Number.isSafeInteger(week) || week < 1) throw new Error('invalid_pet_journey_week');
  const start = Date.parse(period.start_at), end = Date.parse(period.legacy_end_at || '');
  const weekStart = Number.isFinite(end) && week > 13 ? end + (week - 14) * WEEK_MS : start + (week - 1) * WEEK_MS;
  const weekEnd = Number.isFinite(end) && week === 13 ? end : weekStart + WEEK_MS;
  return { start_at: new Date(weekStart).toISOString(), end_at: new Date(weekEnd).toISOString() };
}
