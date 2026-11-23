import { CANONICAL_FACTION_KEYS } from './faction-canon.js';
import { selectCommunitySeason } from '../community-season-authority.js';
import { LEADER_POINTS_PER_ROUND } from './clan-leader-presence.js';

const DAY = 86_400_000;
const CLOSE_DELAY = 15 * 60_000;
const POLICY = 1;
const KINDS = ['daily', 'weekly', 'monthly', 'seasonal'];
const SCOPES = ['global', 'factions', 'games', 'clan-players', 'no-clan'];
const MAX_PAGE_SIZE = 50;

export const UNIFIED_GAMES = {
  snake: 'Snake',
  blocktopia: 'Block Topia Quest Maze',
  'meme-swarm-3008': 'Meme Swarm 3008',
  'chain-maze': 'Chain Maze',
  forkfield: 'Forkfield',
  'bullrun-brick-smash': 'Bullrun Brick Smash',
  'block-topia-dropzone': 'Block Topia Dropzone',
  kaiju: 'Kaiju Sticker Battle',
  'nbg-london': 'NBG London',
  'dead-run': 'Dead Run',
  'blocktopia-rpg': 'Block Topia RPG',
  moonpet: 'MoonPet',
  waterfront: 'Battle Chamber',
};
const arcadeGames = Object.keys(UNIFIED_GAMES).slice(0, 8);
const sqlList = values => values.map(value => `'${value}'`).join(',');
const factions = sqlList(CANONICAL_FACTION_KEYS);

// ?1 inclusive start, ?2 exclusive as-of/end, ?3 scoring period kind.
// The widened date predicates let D1 use source indexes. The final timestamp
// filter enforces exact boundaries, including community seasons starting at midday.
const rankedSql = `
WITH raw(game, owner, earned, faction, points, cap, native_score, native_xp) AS (
  SELECT game, telegram_id, processed_at, NULL, 10, 30, raw_score, xp_awarded
  FROM arcade_progression_events
  WHERE status = 'accepted' AND game IN (${sqlList(arcadeGames)})
    AND normalized_points > 0 AND raw_score > 0
    AND processed_at >= date(?1) AND processed_at < date(?2, '+1 day')
  UNION ALL
  SELECT 'nbg-london', telegram_id, strftime('%Y-%m-%dT%H:%M:%fZ',finished_at_ms / 1000.0,'unixepoch'),
         NULL, 10, 30, NULL, NULL
  FROM nbg_london_runs WHERE finish_token IS NOT NULL
    AND finished_at_ms >= unixepoch(?1)*1000 AND finished_at_ms < unixepoch(?2)*1000+1000
  UNION ALL
  SELECT 'dead-run', telegram_id, ended_at, NULL, 10, 30, score, xp_awarded
  FROM dead_run_sessions
  WHERE day_key >= date(?1,'-1 day') AND day_key <= date(?2)
    AND status = 'finished' AND ranked = 1 AND player_stats_applied = 1 AND arcade_xp_applied = 1
    AND horde_applied = 1 AND score > 0
  UNION ALL
  SELECT 'blocktopia-rpg', telegram_id, created_at, NULL, 10, 30, score, xp_change
  FROM blocktopia_progression_events WHERE action = 'mini_game_win' AND xp_change > 0
    AND created_at >= date(?1) AND created_at < date(?2,'+1 day')
  UNION ALL
  SELECT 'moonpet', telegram_id,
    CASE WHEN date(created_at)=day_key THEN created_at ELSE day_key END,
    NULL, 5, 30, NULL, pet_xp_awarded
  FROM telegram_pet_events WHERE status = 'accepted' AND pet_xp_awarded > 0
    AND event_type IN ('feed','play','clean','train','run','run_complete','run_extract','daily_run','daily_moon_run',
                       'district_mission','arena_battle','weekly_boss','seasonal_boss')
    AND day_key BETWEEN date(?1) AND date(?2)
  UNION ALL
  SELECT 'waterfront', telegram_id, awarded_at, faction_id, 10, 30, NULL, NULL
  FROM clan_operation_awards WHERE utc_day BETWEEN date(?1) AND date(?2)
  UNION ALL
  SELECT 'wtf-signal', telegram_id, completed_at, NULL, 5, 30, NULL, NULL
  FROM daily_wtf_player_events WHERE status = 'completed' AND completed_at IS NOT NULL
    AND utc_day BETWEEN date(?1) AND date(?2)
  UNION ALL
  SELECT 'community-mission', telegram_id, earned_at, NULL, 5, 15, NULL, xp_change
  FROM telegram_community_xp_awards
  WHERE action = 'wiki_mission_complete' AND xp_change > 0
    AND earned_at >= date(?1) AND earned_at < date(?2,'+1 day')
  UNION ALL
  SELECT 'tag-run', telegram_id, datetime(message_unix,'unixepoch'), NULL, 1, 15, NULL, NULL
  FROM tag_run_messages WHERE day_key BETWEEN date(?1) AND date(?2)
),
credited AS (
  SELECT raw.*, date(raw.earned) AS day,
    COALESCE(CASE WHEN raw.faction IN (${factions}) THEN raw.faction END,
      CASE WHEN roster.faction_id IN (${factions}) THEN roster.faction_id END, '') AS team
  FROM raw
  JOIN telegram_users AS account ON account.telegram_id = raw.owner
  LEFT JOIN clan_crew_roster_entries AS roster ON roster.telegram_id = raw.owner
    AND roster.week_start = date(raw.earned,'-6 days','weekday 1')
  WHERE julianday(raw.earned) >= julianday(?1) AND julianday(raw.earned) < julianday(?2)
),
daily AS (
  SELECT owner, game, team, day, MIN(SUM(points),cap) AS points, COUNT(*) AS events,
    MAX(native_score) AS best_score, SUM(native_xp) AS source_xp
  FROM credited GROUP BY owner, game, team, day, cap
),
members AS (
  SELECT 'global' AS scope, '' AS category, owner AS entrant, game, points, events, best_score, source_xp FROM daily
  UNION ALL
  SELECT 'games', game, owner, game, points, events, best_score, source_xp FROM daily
    WHERE game IN (${sqlList(Object.keys(UNIFIED_GAMES))})
  UNION ALL
  SELECT 'clan-players', team, owner, game, points, events, best_score, source_xp FROM daily WHERE team <> ''
  UNION ALL
  SELECT 'no-clan', '', owner, game, points, events, best_score, source_xp FROM daily WHERE team = ''
  UNION ALL
  SELECT 'factions', '', team, game, points, events, NULL, NULL FROM daily WHERE team <> ''
),
npc AS (
  SELECT 'factions' AS scope, '' AS category, faction_id AS entrant, 'npc-rounds' AS game,
    COUNT(*) * ${LEADER_POINTS_PER_ROUND} AS points, COUNT(*) AS events, NULL AS best_score, NULL AS source_xp
  FROM clan_leader_rounds AS round
  WHERE faction_id IN (${factions}) AND slot >= unixepoch(?1) AND slot+300 <= unixepoch(?2)
    AND NOT EXISTS (
      SELECT 1 FROM clan_leader_slowdowns AS pause WHERE pause.target_faction = round.faction_id
      AND pause.available_at > round.slot AND pause.ends_at > round.slot AND pause.starts_at < round.slot+300
    )
  GROUP BY faction_id
),
clan_perk AS (
  SELECT json_extract(team.value,'$.faction_id') AS faction, p.ends_before AS start_day,
    10-json_extract(team.value,'$.rank') AS level,
    CASE WHEN json_extract(team.value,'$.active_members')*3 < json_extract(team.value,'$.roster_size')*2 THEN 'rally'
      WHEN json_extract(team.value,'$.scored_banks') >= 8*json_extract(team.value,'$.active_members') THEN 'relay'
      ELSE 'supply' END AS perk
  FROM clan_period_results AS p, json_each(p.standings_json) AS team
  WHERE p.kind='weekly' AND p.ends_before BETWEEN date(?1,'-6 days') AND date(?2)
    AND json_extract(team.value,'$.rank') BETWEEN 1 AND 9
    AND p.ends_before <= (SELECT date(starts_at) FROM unified_leaderboard_epoch WHERE singleton=1)
  UNION ALL
  SELECT faction,week_start,level,perk FROM unified_weekly_clan_perks
  WHERE week_start BETWEEN date(?1,'-6 days') AND date(?2)
),
perk_activity AS (
  SELECT owner, team, day,
    SUM(CASE WHEN game='waterfront' THEN events ELSE 0 END) AS banks,
    SUM(CASE WHEN game='wtf-signal' THEN events ELSE 0 END) AS signals
  FROM daily WHERE team<>'' AND game IN ('waterfront','wtf-signal') GROUP BY owner,team,day
),
weekly_boosts AS (
  SELECT 'factions' AS scope,'' AS category,a.team AS entrant,'weekly-clan-boost' AS game,
    SUM(p.level * CASE p.perk WHEN 'rally' THEN 2 WHEN 'relay' THEN a.signals*3 ELSE a.banks END) AS points,
    COUNT(*) AS events,NULL AS best_score,NULL AS source_xp
  FROM perk_activity AS a JOIN clan_perk AS p ON p.faction=a.team AND p.start_day=date(a.day,'-6 days','weekday 1')
  GROUP BY a.team HAVING points>0
),
per_source AS (
  SELECT scope, category, entrant, game, SUM(points) AS points, SUM(events) AS events,
    MAX(best_score) AS best_score, SUM(source_xp) AS source_xp
  FROM (SELECT * FROM members UNION ALL SELECT * FROM npc UNION ALL SELECT * FROM weekly_boosts)
  GROUP BY scope, category, entrant, game
),
base AS (
  SELECT scope, category, entrant, SUM(points) AS base_points,
    json_group_object(game,json_object('points',points,'events',events,'best_score',best_score,'source_xp',source_xp)) AS breakdown
  FROM per_source GROUP BY scope, category, entrant
),
prior_awards AS (
  SELECT r.scope, r.category, r.entrant, r.award_points
  FROM unified_leaderboard_periods AS p JOIN unified_leaderboard_results AS r
    ON r.kind=p.kind AND r.starts_at=p.starts_at
  WHERE p.kind=?3 AND p.ends_at=?1 AND p.policy_version=${POLICY} AND r.award_points>0
),
prior AS (
  SELECT scope, category, entrant, award_points AS bonus_points FROM prior_awards WHERE scope<>'global'
  UNION ALL
  SELECT 'global','',entrant,MIN(SUM(award_points),60) FROM prior_awards
  WHERE scope<>'factions' GROUP BY entrant
),
combined AS (
  SELECT base.*, COALESCE(prior.bonus_points,0) AS bonus_points
  FROM base LEFT JOIN prior USING(scope,category,entrant)
  UNION ALL
  SELECT scope,category,entrant,0,'{}',bonus_points FROM prior
  WHERE prior.scope IN ('global','factions','games') AND NOT EXISTS (
    SELECT 1 FROM base WHERE base.scope=prior.scope AND base.category=prior.category AND base.entrant=prior.entrant
  )
),
all_entrants AS (
  SELECT * FROM combined
  UNION ALL
  SELECT 'factions','',key.value,0,'{}',0 FROM json_each(json_array(${factions})) AS key
  WHERE NOT EXISTS (SELECT 1 FROM combined WHERE scope='factions' AND category='' AND entrant=key.value)
),
ranked AS (
  SELECT *, RANK() OVER (PARTITION BY scope,category ORDER BY base_points+bonus_points DESC) AS rank
  FROM all_entrants
)
`;

const rankedRows = `SELECT scope,category,entrant,base_points,bonus_points,rank,breakdown,
  CASE WHEN base_points>0
    THEN CASE rank WHEN 1 THEN 30 WHEN 2 THEN 20 WHEN 3 THEN 10 ELSE 0 END ELSE 0 END AS award_points
  FROM ranked`;

function rows(result) {
  if (!result?.success || !Array.isArray(result.results)) throw new Error('unified_leaderboard_query_failed');
  return result.results;
}

function calendarWindow(kind, at) {
  const start = new Date(at);
  start.setUTCHours(0, 0, 0, 0);
  if (kind === 'weekly') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  if (kind === 'monthly') start.setUTCDate(1);
  const end = new Date(start);
  if (kind === 'monthly') end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + (kind === 'weekly' ? 7 : 1));
  return { starts_at: start.toISOString(), ends_at: end.toISOString() };
}

async function currentWindow(db, kind, at) {
  if (kind !== 'seasonal') return calendarWindow(kind, at);
  const season = await selectCommunitySeason(db, at);
  if (!season) return null;
  return {
    starts_at: new Date(season.start_date).toISOString(),
    ends_at: season.end_date ? new Date(season.end_date).toISOString() : null,
  };
}

export function parseUnifiedQuery(params) {
  const kind = params.get('period') ?? 'weekly';
  const scope = params.get('scope') ?? 'global';
  const category = params.get('category') ?? '';
  const window = params.get('window') ?? 'current';
  const page = Number(params.get('page') ?? '1');
  if (!KINDS.includes(kind) || !SCOPES.includes(scope) || !['current', 'closed'].includes(window)
      || !Number.isInteger(page) || page < 1 || page > 100
      || (scope === 'games' ? !Object.hasOwn(UNIFIED_GAMES, category)
        : scope === 'clan-players' ? !CANONICAL_FACTION_KEYS.includes(category) : category !== '')) return null;
  return { kind, scope, category, window, page };
}

export async function readUnifiedLeaderboard(db, options, at = new Date()) {
  const { kind, scope, category, window, page } = options;
  // Check the migration before returning an empty response for any scope.
  if (!(await db.prepare('SELECT starts_at FROM unified_leaderboard_epoch WHERE singleton=1').first())) {
    throw new Error('unified_leaderboard_epoch_missing');
  }

  const period = window === 'closed'
    ? await db.prepare(`SELECT starts_at,ends_at,policy_version,closed_at FROM unified_leaderboard_periods
      WHERE kind=? ORDER BY ends_at DESC LIMIT 1`).bind(kind).first()
    : await currentWindow(db, kind, at);
  const result = { policy_version: period?.policy_version ?? POLICY, period, scope, category, page, has_more: false, rows: [] };
  if (!period) return result;

  const activeEnd = period.ends_at && period.ends_at < at.toISOString() ? period.ends_at : at.toISOString();
  const isClosed = window === 'closed';
  const source = isClosed
    ? 'SELECT * FROM unified_leaderboard_results WHERE kind=?3 AND starts_at=?1'
    : rankedRows;
  const prefix = isClosed ? 'WITH board AS (' : rankedSql + ', board AS (';
  const sorted = await db.prepare(`${prefix}${source})
    SELECT r.rank, r.base_points, r.bonus_points, r.breakdown,
      CASE WHEN ?7=1 THEN r.award_points ELSE NULL END AS award_points,
      CASE WHEN r.scope='factions' THEN r.entrant ELSE
        COALESCE(NULLIF(u.username,''),NULLIF(u.first_name,''),'Moonboy') END AS name,
      g.rank AS global_rank
    FROM board AS r
    LEFT JOIN telegram_users AS u ON r.scope<>'factions' AND u.telegram_id=r.entrant
    LEFT JOIN board AS g ON r.scope IN ('clan-players','no-clan','games') AND g.scope='global'
      AND g.category='' AND g.entrant=r.entrant
    WHERE r.scope=?4 AND r.category=?5 AND (r.scope='factions' OR u.telegram_id IS NOT NULL)
    ORDER BY r.rank,r.entrant LIMIT ${MAX_PAGE_SIZE + 1} OFFSET ?6`)
    .bind(period.starts_at, activeEnd, kind, scope, category, (page - 1) * MAX_PAGE_SIZE, Number(isClosed)).all();
  const list = rows(sorted);
  result.has_more = list.length > MAX_PAGE_SIZE && page < 100;
  result.rows = list.slice(0, MAX_PAGE_SIZE).map(row => ({
    ...row, points: row.base_points + row.bonus_points, breakdown: JSON.parse(row.breakdown),
  }));
  return result;
}

async function closePeriod(db, kind, period, at) {
  const { starts_at: start, ends_at: end } = period;
  const token = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`INSERT INTO unified_leaderboard_periods (kind,starts_at,ends_at,policy_version,closed_at,close_token)
      VALUES (?,?,?,?,?,?) ON CONFLICT (kind,starts_at) DO NOTHING`).bind(kind, start, end, POLICY, at.toISOString(), token),
    db.prepare(`${rankedSql}
      INSERT INTO unified_leaderboard_results
        (scope,category,entrant,base_points,bonus_points,rank,breakdown,award_points,kind,starts_at,clan_perk)
      SELECT ranked_result.*,?3,?1,
        CASE WHEN ?3='weekly' AND ranked_result.scope='factions' AND ranked_result.base_points>0 THEN
          COALESCE((SELECT CASE
            WHEN COALESCE(json_extract(crew.value,'$.active_members'),0)=0
              OR json_extract(crew.value,'$.active_members')*3 < json_extract(crew.value,'$.roster_size')*2 THEN 'rally'
            WHEN json_extract(crew.value,'$.scored_banks') >= 8*json_extract(crew.value,'$.active_members') THEN 'relay'
            ELSE 'supply' END
          FROM clan_period_results AS native, json_each(native.standings_json) AS crew
          WHERE native.kind='weekly' AND native.period_key=date(?1) AND native.ends_before=date(?2)
            AND json_extract(crew.value,'$.faction_id')=ranked_result.entrant LIMIT 1),'rally') END
      FROM (${rankedRows}) AS ranked_result WHERE EXISTS (
        SELECT 1 FROM unified_leaderboard_periods WHERE kind=?3 AND starts_at=?1 AND close_token=?4
      )`).bind(start, end, kind, token),
  ]);
  if (results.length !== 2 || results.some(result => !result.success)) throw new Error('unified_leaderboard_close_failed');
}

export async function settleUnifiedLeaderboard(db, at = new Date()) {
  const epoch = await db.prepare('SELECT starts_at FROM unified_leaderboard_epoch WHERE singleton=1').first();
  if (!epoch) throw new Error('unified_leaderboard_epoch_missing');
  const cutoff = new Date(+at - CLOSE_DELAY).toISOString();
  if (cutoff <= epoch.starts_at) return;
  // Close weeks first so a delayed daily, monthly or seasonal close uses the
  // same frozen boosts it would have received if every cron tick had run.
  const lastClose = async kind => (await db.prepare(
    'SELECT MAX(ends_at) AS ends_at FROM unified_leaderboard_periods WHERE kind=?'
  ).bind(kind).first())?.ends_at;
  let weeklyThrough = await lastClose('weekly');
  const boostReady = period => {
    const lastDay = new Date(Date.parse(period.ends_at) - 1);
    const requiredWeek = calendarWindow('weekly', lastDay).starts_at;
    return requiredWeek <= epoch.starts_at || requiredWeek <= weeklyThrough;
  };
  for (const kind of ['weekly', 'daily', 'monthly']) {
    const previous = kind === 'weekly' ? weeklyThrough : await lastClose(kind);
    let period = calendarWindow(kind, previous ?? epoch.starts_at);
    // Bounded catch-up preserves chronological bonus carryover after outages.
    for (let count = 0; count < 2 && period.ends_at <= cutoff; count++) {
      if (!boostReady(period)) break;
      await closePeriod(db, kind, period, at);
      if (kind === 'weekly') weeklyThrough = period.ends_at;
      period = calendarWindow(kind, period.ends_at);
    }
  }
  const seasons = rows(await db.prepare(`
    SELECT strftime('%Y-%m-%dT%H:%M:%fZ',s.start_date) AS starts_at,
      strftime('%Y-%m-%dT%H:%M:%fZ',s.end_date) AS ends_at FROM telegram_seasons AS s
    WHERE s.is_active=1 AND julianday(s.end_date)>julianday(s.start_date)
      AND julianday(s.end_date)>julianday(?) AND julianday(s.end_date)<=julianday(?)
      AND NOT EXISTS (SELECT 1 FROM unified_leaderboard_periods p WHERE p.kind='seasonal'
        AND p.starts_at=strftime('%Y-%m-%dT%H:%M:%fZ',s.start_date))
    ORDER BY julianday(s.end_date),s.id LIMIT 2`).bind(epoch.starts_at, cutoff).all());
  for (const period of seasons) {
    if (!boostReady(period)) break;
    await closePeriod(db, 'seasonal', period, at);
  }
}
