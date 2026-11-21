import { crewWeek } from './clan-crew-standings.js';
import { buildClanCampaign } from './clan-campaign-plan.js';
import { evaluateCampaignWindow } from './clan-campaign-scoring.js';

const SETTLEMENT_BUFFER_MS = 5 * 60_000;
const REFRESH_BATCH_LIMIT = 3;

function rows(result, source) {
  if (!result?.success || !Array.isArray(result.results)) throw new Error(source + '_unavailable');
  return result.results;
}

function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

async function provisionCampaigns(db, from, now) {
  const seasons = rows(await db.prepare(`
    SELECT id, start_date, end_date FROM telegram_seasons AS season
    WHERE is_active = 1 AND date(start_date) >= ?
      AND julianday(end_date) > julianday(?) AND id >= 13
      AND julianday(end_date) - julianday(start_date) = 90
      AND time(start_date) = '00:00:00'
      AND NOT EXISTS (SELECT 1 FROM clan_campaigns WHERE season_id = season.id)
    ORDER BY start_date LIMIT 2
  `).bind(from, now.toISOString()).all(), 'campaign_seasons');
  for (const season of seasons) {
    const plan = buildClanCampaign(season);
    if (!plan) continue;
    const result = await db.prepare(`
      INSERT INTO clan_campaigns (season_id, starts_on, ends_before, plan_json)
      VALUES (?, ?, ?, ?) ON CONFLICT(season_id) DO NOTHING
    `).bind(plan.seasonId, plan.startsOn, plan.endsBefore, JSON.stringify(plan)).run();
    if (!result.success) throw new Error('campaign_plan_save_failed');
  }
}

function progressQueries(db, window) {
  const rosterWeek = crewWeek(new Date(window.startsOn)).start;
  return [
    db.prepare(`
      SELECT faction_id, COUNT(*) AS size FROM clan_crew_roster_entries
      WHERE week_start = ? GROUP BY faction_id
    `).bind(rosterWeek),
    db.prepare(`
      SELECT bank.faction_id, bank.telegram_id, bank.utc_day, bank.tier, bank.specimen_key, state.route_index
      FROM clan_operation_awards AS bank
      JOIN clan_operation_days AS state USING (telegram_id, utc_day)
      JOIN clan_crew_roster_entries AS roster ON roster.telegram_id = bank.telegram_id
        AND roster.faction_id = bank.faction_id AND roster.week_start = ?
      WHERE bank.utc_day >= ? AND bank.utc_day < ?
    `).bind(rosterWeek, window.startsOn, window.endsBefore),
  ];
}

function score(window, rosters, banks) {
  return evaluateCampaignWindow(window, rows(rosters, 'campaign_roster'), rows(banks, 'campaign_banks'));
}

export async function maintainClanCampaigns(db, from, now) {
  await provisionCampaigns(db, from, now);
  const cutoff = utcDay(new Date(+now - SETTLEMENT_BUFFER_MS));
  const due = rows(await db.prepare(`
    SELECT campaign.season_id, campaign.plan_json, json_extract(slot.value, '$.id') AS window_id
    FROM clan_campaigns AS campaign
    JOIN json_each(campaign.plan_json, '$.windows') AS slot
    LEFT JOIN clan_campaign_window_results AS result
      ON result.season_id = campaign.season_id AND result.window_id = json_extract(slot.value, '$.id')
    WHERE json_extract(slot.value, '$.endsBefore') <= ? AND result.window_id IS NULL
    ORDER BY json_extract(slot.value, '$.endsBefore'), campaign.season_id, window_id LIMIT ?
  `).bind(cutoff, REFRESH_BATCH_LIMIT).all(), 'campaign_ending_windows');
  for (const record of due) {
    const plan = JSON.parse(record.plan_json);
    const window = plan.windows.find(item => item.id === record.window_id);
    const progress = score(window, ...await db.batch(progressQueries(db, window)));
    const collectible = plan.collectibles.find(item => item.earnedFrom === window.id)?.title ?? null;
    const result = await db.prepare(`
      INSERT INTO clan_campaign_window_results
        (season_id, window_id, starts_on, ends_before, settled_at, progress_json, eligible_factions_json, collectible)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(season_id, window_id) DO NOTHING
    `).bind(record.season_id, window.id, window.startsOn, window.endsBefore, now.toISOString(),
      JSON.stringify(progress), JSON.stringify(progress.eligibleFactions), collectible).run();
    if (!result.success) throw new Error('campaign_window_close_failed');
  }
}

export async function readClanCampaign(db, now) {
  const day = utcDay(now);
  const rowsNearToday = rows(await db.prepare(`
    SELECT season_id, starts_on, ends_before, plan_json FROM clan_campaigns
    WHERE ends_before > ? ORDER BY starts_on, season_id LIMIT 2
  `).bind(day).all(), 'campaign_calendar');
  const current = rowsNearToday.find(row => row.starts_on <= day);
  const upcoming = rowsNearToday.find(row => row.starts_on > day);
  const preview = upcoming ? {
    seasonId: upcoming.season_id, startsOn: upcoming.starts_on, title: JSON.parse(upcoming.plan_json).theme.title,
  } : null;
  const [last] = rows(await db.prepare(`
    SELECT campaign.season_id, campaign.plan_json, result.progress_json
    FROM clan_campaigns AS campaign
    LEFT JOIN clan_campaign_window_results AS result
      ON campaign.season_id = result.season_id AND result.window_id = 'finale-1'
    WHERE campaign.ends_before <= ? ORDER BY campaign.ends_before DESC, campaign.season_id DESC LIMIT 1
  `).bind(day).all(), 'campaign_previous');
  const previous = last ? {
    seasonId: last.season_id, title: JSON.parse(last.plan_json).theme.title,
    finale: JSON.parse(last.plan_json).windows.find(window => window.kind === 'finale'),
    progress: last.progress_json ? JSON.parse(last.progress_json) : null,
  } : null;
  if (!current) return { utc_day: day, campaign: null, upcoming: preview, previous };
  const saved = JSON.parse(current.plan_json);
  const settlements = rows(await db.prepare(`
    SELECT window_id, progress_json FROM clan_campaign_window_results WHERE season_id = ?
  `).bind(saved.seasonId).all(), 'campaign_results');
  const byWindow = new Map(settlements.map(row => [row.window_id, JSON.parse(row.progress_json)]));
  const active = saved.windows.filter(window => window.startsOn <= day && day < window.endsBefore);
  const live = active.length ? await db.batch(active.flatMap(window => progressQueries(db, window))) : [];
  active.forEach((window, i) => byWindow.set(window.id, score(window, live[i * 2], live[i * 2 + 1])));
  const windows = saved.windows.map(window => {
    if (day < window.startsOn) {
      return { id: window.id, kind: window.kind, startsOn: window.startsOn, endsBefore: window.endsBefore, status: 'upcoming' };
    }
    if (day < window.endsBefore) return { ...window, status: 'open', progress: byWindow.get(window.id) };
    const progress = byWindow.get(window.id);
    return { ...window, status: progress ? 'closed' : 'settling', progress: progress ?? null };
  });
  const collectibles = saved.collectibles.filter(award =>
    windows.some(window => window.id === award.earnedFrom && window.status !== 'upcoming'
      && (window.effect !== 'reveal-collectible' || window.progress?.eligibleFactions.length)));
  return { utc_day: day, campaign: { ...saved, windows, collectibles }, upcoming: preview, previous };
}

export async function readClanCampaignCollectibles(db, owner) {
  return rows(await db.prepare(`
    SELECT receipt.season_id, receipt.collectible, result.settled_at
    FROM clan_campaign_collectible_receipts AS receipt
    JOIN clan_campaign_window_results AS result USING (season_id, window_id)
    WHERE receipt.telegram_id = ? ORDER BY result.settled_at DESC, receipt.window_id LIMIT 60
  `).bind(owner).all(), 'campaign_collectibles');
}
