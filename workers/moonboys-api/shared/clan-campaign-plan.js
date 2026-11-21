import {
  campaignThemes, campaignActs, campaignObjectives, campaignEvents, campaignCollectibles, campaignFinales,
} from './clan-campaign-catalog.js';
import { COMMUNITY_SEASON_DAYS } from '../community-season-authority.js';

export const CAMPAIGN_VERSION = 1;
const FIRST_SEASON = 13;
const DAY_MS = 86_400_000;
const ACT_DAYS = 30;
const OBJECTIVE_OFFSETS = [0, 7, 14, 21, 30, 37, 44, 51, 60, 67, 74, 81];
const EVENT_OFFSETS = [3, 12, 21, 33, 42, 51, 64, 74];

function shuffle(parts, seed) {
  const selected = [...parts];
  for (let i = selected.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor(seed / 2 ** 32 * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }
  return selected;
}

function select(pool, count, season, seed) {
  // The first two campaigns use disjoint halves. Later seasons can remix.
  const index = season - FIRST_SEASON;
  const options = index < 2 ? pool.slice(index * count, (index + 1) * count) : pool;
  return shuffle(options, (Math.imul(season, 2654435761) ^ seed) >>> 0).slice(0, count);
}

export function buildClanCampaign(season) {
  const start = new Date(season.start_date);
  const end = new Date(season.end_date);
  if (!Number.isSafeInteger(season.id) || season.id < FIRST_SEASON ||
      !season.start_date || !season.end_date || +start % DAY_MS !== 0 ||
      +end - +start !== COMMUNITY_SEASON_DAYS * DAY_MS) return null;
  const day = offset => new Date(+start + offset * DAY_MS).toISOString().slice(0, 10);
  const themeIndex = (season.id - FIRST_SEASON) % campaignThemes.length;
  const makeWindow = (kind, index, offset, length, entry) => {
    const [title, description, metric, target, mode = 'crew', cityTarget, effect] = entry;
    return { id: kind + '-' + (index + 1), kind, title, description, metric, target, mode, cityTarget, effect,
      startsOn: day(offset), endsBefore: day(offset + length) };
  };
  const objectives = select(campaignObjectives, 12, season.id, 11)
    .map((entry, i) => makeWindow('objective', i, OBJECTIVE_OFFSETS[i], 7, entry));
  const events = select(campaignEvents, 8, season.id, 23)
    .map((entry, i) => makeWindow('event', i, EVENT_OFFSETS[i], 4, entry));
  const finale = makeWindow('finale', 0, COMMUNITY_SEASON_DAYS - 7, 7, campaignFinales[themeIndex]);
  const eventAward = events.find(event => event.effect === 'reveal-collectible') ?? events[7];
  const awardSlots = [objectives[3], objectives[7], objectives[11], eventAward, finale];
  const collectibles = select(campaignCollectibles, 5, season.id, 31)
    .map((title, i) => ({ title, earnedFrom: awardSlots[i].id }));
  return {
    version: CAMPAIGN_VERSION, seasonId: season.id, startsOn: day(0), endsBefore: day(COMMUNITY_SEASON_DAYS),
    theme: campaignThemes[themeIndex],
    acts: campaignActs[themeIndex].map(([title, description], i) => ({
      title, description, startsOn: day(i * ACT_DAYS), endsBefore: day((i + 1) * ACT_DAYS),
    })),
    windows: [...objectives, ...events, finale].sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    collectibles,
  };
}
