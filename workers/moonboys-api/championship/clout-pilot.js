/**
 * #1530 PR2: strictly receipt-owned, non-spendable Championship Clout pilot.
 * Called only after a verified Telegram webhook has been accepted, and only
 * with an explicitly enabled, UTC-midnight launch boundary. No browser amount,
 * client event ID, pet XP, Arcade wallet or existing game award is imported.
 * v1 deliberately credits current UTC day only; old periods are NOT backfilled.
 */
import { CLOUT_POLICY_VERSION, cloutDayKey } from './clout-policy.js';
import { scoreRun, difficultyForPlayer } from '../routes/dead-run-core.js';

const OWNER = /^\d{1,20}$/u;
const START = /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/u;

export const PILOT_SOURCE_POLICY = Object.freeze({
  telegram_daily: Object.freeze([{ kind: 'community', fixed_points: 5 }]),
  moonpet_daily_journey: Object.freeze([
    { kind: 'mission', fixed_points: 5 },
    { kind: 'variety', game_key: 'moonpet' },
  ]),
  moonpet_weekly_journey: Object.freeze([
    { kind: 'mission', fixed_points: 10 },
    { kind: 'variety', game_key: 'moonpet' },
  ]),
  // PR3A has a separate game gate; only settled, server-scored runs qualify.
  dead_run: Object.freeze([
    { kind: 'skill', game_key: 'dead-run', skill_source: 'verified_dead_run_score_v1' },
    { kind: 'variety', game_key: 'dead-run' },
  ]),
});

/* Every candidate is read directly from an accepted source receipt, AND
 * source owner, exact day and saved pet identity must agree with its origin.
 * A daily claim without its matching Community XP log is not eligible.
 * A bare pet event/counter/claimed-but-rejected Journey is not eligible.
 * Each query returns at most ten rows; no unbounded history scan.
 */
const SOURCE_QUERIES = Object.freeze({
  telegram_daily: [
    "SELECT 'telegram_daily' AS source_system,",
    "  'daily:' || a.telegram_id || ':' || a.claim_key AS source_event_id,",
    "  a.earned_at AS earned_at, NULL AS source_pet_id",
    "FROM telegram_community_xp_awards a",
    "WHERE a.telegram_id=? AND a.action='daily_claim' AND a.claim_key=?",
    "  AND a.reference_id=a.claim_key AND a.xp_change>0",
    "  AND length(a.settlement_token)>0 AND substr(a.earned_at,1,10)=a.claim_key",
    "  AND EXISTS (SELECT 1 FROM telegram_xp_log l",
    "    WHERE l.telegram_id=a.telegram_id AND l.action='daily_claim'",
    "      AND l.reference_id=a.claim_key AND l.created_at=a.earned_at",
    "      AND l.xp_change=a.xp_change)",
    "ORDER BY a.earned_at LIMIT 11",
  ].join(' '),
  moonpet_daily_journey: [
    "SELECT 'moonpet' AS source_system, g.mark_id AS source_event_id,",
    "  g.earned_at AS earned_at, g.pet_id AS source_pet_id",
    "FROM telegram_pet_growth_marks g",
    "JOIN telegram_pet_daily_journey_receipts r",
    "  ON r.growth_mark_id=g.mark_id AND r.telegram_id=g.telegram_id",
    "  AND r.pet_id=g.pet_id AND r.season_key=g.season_key",
    "  AND r.utc_day=g.earned_day",
    "JOIN telegram_pet_season_slots s",
    "  ON s.pet_id=g.pet_id AND s.telegram_id=g.telegram_id",
    "  AND s.season_key=g.season_key",
    "JOIN telegram_pet_instances i",
    "  ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id",
    "  AND i.season_key=s.season_key AND i.slot_number=s.slot_number",
    "WHERE g.telegram_id=? AND g.earned_day=?",
    "  AND g.milestone_type='daily_moon_run_milestone'",
    "  AND g.evidence_key='daily-run:' || r.utc_day || ':3-of-5'",
    "  AND substr(g.earned_at,1,10)=g.earned_day",
    "  AND r.status='accepted' AND r.reason='daily_journey_qualified'",
    "  AND r.completed_objectives>=3",
    "ORDER BY g.mark_id LIMIT 11",
  ].join(' '),
  moonpet_weekly_journey: [
    "SELECT 'moonpet' AS source_system, c.crest_id AS source_event_id,",
    "  c.earned_at AS earned_at, c.pet_id AS source_pet_id",
    "FROM telegram_pet_weekly_crests c",
    "JOIN telegram_pet_weekly_journey_receipts r",
    "  ON r.crest_id=c.crest_id AND r.telegram_id=c.telegram_id",
    "  AND r.pet_id=c.pet_id AND r.season_key=c.season_key",
    "  AND r.qualification_week=c.qualification_week",
    "JOIN telegram_pet_season_slots s",
    "  ON s.pet_id=c.pet_id AND s.telegram_id=c.telegram_id",
    "  AND s.season_key=c.season_key",
    "JOIN telegram_pet_instances i",
    "  ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id",
    "  AND i.season_key=s.season_key AND i.slot_number=s.slot_number",
    "WHERE c.telegram_id=? AND substr(c.earned_at,1,10)=?",
    "  AND c.objective_id='weekly_journey'",
    "  AND c.evidence_key='weekly-journey:' || c.season_key",
    "    || ':' || c.qualification_week || ':5-of-5'",
    "  AND r.status='accepted' AND r.reason='weekly_journey_qualified'",
    "  AND r.completed_objectives>=5",
    "ORDER BY c.crest_id LIMIT 11",
  ].join(' '),
  dead_run: [
    // Dead Run's own server-settled session is the authority. Arcade's XP
    // receipt cannot be required here: a signed player's client_run_id may
    // collide with its UUID under UNIQUE(telegram_id,client_run_id), while
    // the source handler still independently finishes a legitimate ranked
    // session. No client-written Arcade score is promoted to Clout.
    "SELECT 'dead_run' AS source_system, s.session_id AS source_event_id,",
    " s.ended_at AS earned_at, NULL AS source_pet_id, s.started_at,",
    " s.score AS verified_score, s.xp_awarded AS awarded_game_xp,",
    " s.verified_distance_m, s.survival_seconds, s.kills, s.crates, s.shove_count,",
    " s.difficulty_xp_basis, s.difficulty_best_basis, s.difficulty_runs_basis",
    "FROM dead_run_sessions s",
    "WHERE s.telegram_id=? AND substr(s.ended_at,1,10)=?",
    " AND s.ended_at>=? AND s.ended_at>=s.started_at",
    " AND s.status='finished' AND s.ranked=1",
    " AND s.suspicious_points<6 AND s.verified_distance_m>=40",
    " AND s.survival_seconds>=20 AND s.score>0 AND s.xp_awarded>0",
    " AND s.player_stats_applied=1 AND s.arcade_xp_applied=1",
    " AND s.horde_applied=1",
    " AND s.start_lat IS NULL AND s.start_lng IS NULL",
    " AND s.last_lat IS NULL AND s.last_lng IS NULL",
    // Server rules support up to 20 ranked runs/day. We need only the
    // best certified run for each title/day (v1 Skill is highest-per-game),
    // not 20 effects on each bot command. A newly improved best becomes a
    // new immutable source; prior lower effects remain idempotent.
    "ORDER BY s.score DESC,s.ended_at ASC,s.session_id ASC LIMIT 1",
  ].join(' '),
});

/**
 * Fixed skill v1: a monotonically increasing server-score curve (0..99).
 * No conversion of Arcade XP, game XP, or client-submitted points.
 */
export function normalizeDeadRunSkill(verifiedScore) {
  if (!Number.isSafeInteger(verifiedScore) || verifiedScore < 0 ||
      verifiedScore > 1_000_000) throw new Error('clout_dead_run_score_out_of_range');
  return Math.floor(verifiedScore * 100 / (verifiedScore + 5000));
}

function verifiedDeadRunScore(row) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(row.source_event_id || '')
  )) throw new Error('clout_dead_run_invalid_session_id');
  const startedMs = Date.parse(row.started_at);
  const endedMs = Date.parse(row.earned_at);
  if (!Number.isSafeInteger(startedMs) || !Number.isSafeInteger(endedMs) ||
      startedMs >= endedMs) throw new Error('clout_dead_run_invalid_settlement_clock');
  for (const key of ['survival_seconds','kills','crates','shove_count',
    'difficulty_xp_basis','difficulty_best_basis','difficulty_runs_basis']) {
    if (!Number.isSafeInteger(row[key]) || row[key] < 0)
      throw new Error('clout_dead_run_invalid_' + key);
  }
  if (typeof row.verified_distance_m !== 'number' ||
      !Number.isFinite(row.verified_distance_m) || row.verified_distance_m < 40)
    throw new Error('clout_dead_run_invalid_distance');
  const difficulty = difficultyForPlayer({
    xp_total: row.difficulty_xp_basis,
    best_survival_seconds: row.difficulty_best_basis,
    runs_total: row.difficulty_runs_basis,
  });
  const expected = scoreRun({
    verified_distance_m: row.verified_distance_m,
    survival_seconds: row.survival_seconds,
    kills: row.kills, crates: row.crates, shove_count: row.shove_count,
  }, difficulty);
  // The original source stores the accepted XP amount, not whether its
  // completed horde was active. The only two authorized multipliers at finish
  // are normal 1.0 and active horde 1.1; compare both bounded server results.
  const baseXp = Math.min(275, Math.floor(expected.xp));
  const hordeXp = Math.min(275, Math.floor(expected.xp * 1.1));
  if (expected.score !== row.verified_score ||
      (row.awarded_game_xp !== baseXp && row.awarded_game_xp !== hordeXp) ||
      expected.score <= 0 || baseXp <= 0)
    throw new Error('clout_dead_run_settlement_mismatch');
  return normalizeDeadRunSkill(expected.score);
}

function validSourceTime(value, day, lower, now) {
  if (typeof value !== 'string') throw new Error('clout_source_time_invalid');
  const ms = Date.parse(value);
  if (!Number.isSafeInteger(ms) || ms < lower || ms > now || cloutDayKey(ms) !== day) {
    throw new Error('clout_source_time_outside_pilot_day');
  }
  return ms;
}

function prepareWrites(db, receipt, effect, nowMs) {
  const source = db.prepare([
    'INSERT OR IGNORE INTO championship_clout_sources',
    '(source_system,source_event_id,policy_version,telegram_id,day_key,',
    'earned_at_ms,verified_at_ms,verification_kind,recorded_at_ms)',
    'VALUES (?,?,?,?,?,?,?,?,?)',
  ].join(' ')).bind(
    receipt.source_system, receipt.source_event_id, CLOUT_POLICY_VERSION,
    receipt.owner, receipt.day_key, receipt.earned_at_ms,
    nowMs, receipt.verification_kind || 'server_receipt', nowMs,
  );

  // Always read the immutable parent to carry its ORIGINAL verification stamp;
  // a replay at a later nowMs cannot invent a second version of the receipt.
  const kind = effect.kind;
  const effectInsert = db.prepare([
    'INSERT OR IGNORE INTO championship_clout_effects',
    '(source_system,source_event_id,effect_kind,policy_version,telegram_id,',
    'verification_kind,earned_at_ms,verified_at_ms,day_key,game_key,',
    'source_pet_id,normalized_skill,fixed_points,recorded_at_ms)',
    'SELECT s.source_system,s.source_event_id,?,s.policy_version,s.telegram_id,',
    's.verification_kind,s.earned_at_ms,s.verified_at_ms,s.day_key,?,?,?,?,s.recorded_at_ms',
    'FROM championship_clout_sources s',
    'WHERE s.source_system=? AND s.source_event_id=? AND s.policy_version=?',
    'AND s.telegram_id=? AND s.day_key=? AND s.earned_at_ms=?',
  ].join(' ')).bind(
    kind, effect.game_key ?? null, receipt.source_pet_id ?? null,
    effect.normalized_skill ?? null, effect.fixed_points ?? null,
    receipt.source_system, receipt.source_event_id, CLOUT_POLICY_VERSION,
    receipt.owner, receipt.day_key, receipt.earned_at_ms,
  );
  return { source, effectInsert };
}

/* Materialize from all immutable effects INSIDE the same D1 batch, after the
 * new inserts. A concurrent retry never updates an old JS read/modify/write
 * snapshot. Ranking math matches clout-policy.js even when later skill adapters
 * have already recorded normalized scores for this day.
 */
export const PILOT_REPROJECT_SQL = [
  'WITH mine AS (',
  ' SELECT * FROM championship_clout_effects',
  ' WHERE telegram_id=? AND day_key=? AND policy_version=?',
  '), skill_games AS (',
  " SELECT game_key,MAX(normalized_skill) AS rating FROM mine WHERE effect_kind='skill' GROUP BY game_key",
  '), ranked_skill AS (',
  ' SELECT rating,ROW_NUMBER() OVER (ORDER BY rating DESC,game_key ASC) AS rn FROM skill_games',
  '), values_for_day AS (',
  ' SELECT',
  ' COALESCE((SELECT CAST(MIN(100,SUM(CASE rn WHEN 1 THEN rating WHEN 2 THEN rating*0.10 WHEN 3 THEN rating*0.05 ELSE 0 END))*0.4 AS INTEGER) FROM ranked_skill WHERE rn<=3),0) AS skill,',
  " MIN(25,COALESCE((SELECT SUM(fixed_points) FROM mine WHERE effect_kind='mission'),0)) AS mission,",
  " MIN(15,COALESCE((SELECT COUNT(DISTINCT game_key) FROM mine WHERE effect_kind='variety'),0)*5) AS variety,",
  " MIN(10,COALESCE((SELECT SUM(fixed_points) FROM mine WHERE effect_kind='community'),0)) AS community,",
  " MIN(10,COALESCE((SELECT SUM(fixed_points) FROM mine WHERE effect_kind='streak'),0)) AS streak,",
  " COALESCE((SELECT json_group_array(game_key) FROM (SELECT DISTINCT game_key FROM mine WHERE game_key IS NOT NULL ORDER BY game_key)),'[]') AS games,",
  ' (SELECT MIN(earned_at_ms) FROM mine) AS earliest',
  '), totals AS (',
  ' SELECT skill,mission,variety,community,streak,',
  ' skill+mission+variety+community+streak AS total,games,earliest FROM values_for_day',
  ')',
  'INSERT INTO championship_clout_daily',
  '(telegram_id,day_key,policy_version,skill_points,mission_points,',
  'variety_points,community_points,streak_points,total_points,',
  'game_keys_json,first_earned_at_ms,recalculated_at_ms)',
  'SELECT ?,?,?,skill,mission,variety,community,streak,total,games,earliest,?',
  'FROM totals WHERE earliest IS NOT NULL',
  'ON CONFLICT(telegram_id,day_key,policy_version) DO UPDATE SET',
  ' skill_points=excluded.skill_points,mission_points=excluded.mission_points,',
  ' variety_points=excluded.variety_points,community_points=excluded.community_points,',
  ' streak_points=excluded.streak_points,total_points=excluded.total_points,',
  ' game_keys_json=excluded.game_keys_json,first_earned_at_ms=excluded.first_earned_at_ms,',
  ' recalculated_at_ms=excluded.recalculated_at_ms',
].join(' ');

function readRows(result) {
  if (!result || result.success === false || !Array.isArray(result.results)) {
    throw new Error('clout_pilot_source_read_unavailable');
  }
  return result.results;
}

export async function syncCloutPilotForVerifiedOwner(db, telegramId, options = {}) {
  // Two independent explicit gates. The wrapper supplies authenticated owner;
  // browser-provided owner/amount and auth status are not parameters to this API.
  if (options.enabled !== true) return { state: 'disabled' };
  const owner = String(telegramId || '');
  if (!OWNER.test(owner)) throw new Error('clout_pilot_invalid_owner');
  if (typeof options.startAt !== 'string' || !START.test(options.startAt)) {
    throw new Error('clout_pilot_launch_boundary_required');
  }
  const startAtMs = Date.parse(options.startAt);
  if (!Number.isSafeInteger(startAtMs) || new Date(startAtMs).toISOString() !== options.startAt) {
    throw new Error('clout_pilot_invalid_launch_boundary');
  }
  const nowMs = options.now instanceof Date ? options.now.getTime() : Date.now();
  if (!Number.isSafeInteger(nowMs)) throw new Error('clout_pilot_invalid_now');
  if (nowMs < startAtMs) return { state: 'prelaunch' };
  const day = cloutDayKey(nowMs);

  // Fail closed if ban authority cannot be read. A missing account cannot
  // acquire Clout even if a mismatched client supplies its numeric ID.
  const ownerRow = await db.prepare([
    'SELECT u.telegram_id FROM telegram_users u',
    'LEFT JOIN telegram_anticheat_state b ON b.telegram_id=u.telegram_id',
    'WHERE u.telegram_id=? AND COALESCE(b.is_blocked,0)=0 LIMIT 1',
  ].join(' ')).bind(owner).first();
  if (!ownerRow || String(ownerRow.telegram_id) !== owner) return { state: 'ineligible' };

  const receipts = new Map();
  for (const [sourceKind, query] of Object.entries(SOURCE_QUERIES)) {
    if (sourceKind === 'dead_run' && options.deadRunEnabled !== true) continue;
    const args = sourceKind === 'dead_run' ? [owner, day, options.startAt] : [owner, day];
    const results = readRows(await db.prepare(query).bind(...args).all());
    if (results.length > 10) throw new Error('clout_pilot_source_limit_exceeded');
    for (const row of results) {
      const earnedAtMs = validSourceTime(row.earned_at, day, startAtMs, nowMs);
      if (typeof row.source_event_id !== 'string' || !row.source_event_id ||
          row.source_event_id.length > 180 ||
          row.source_system !== ({
            telegram_daily: 'telegram_daily',
            moonpet_daily_journey: 'moonpet',
            moonpet_weekly_journey: 'moonpet',
            dead_run: 'dead_run',
          })[sourceKind]) {
        throw new Error('clout_pilot_invalid_source_receipt');
      }
      const receiptKey = row.source_system + ':' + row.source_event_id;
      const prior = receipts.get(receiptKey);
      if (prior && (prior.earned_at_ms !== earnedAtMs || prior.owner !== owner)) {
        throw new Error('clout_pilot_conflicting_source_receipt');
      }
      if (prior) throw new Error('clout_pilot_duplicate_authority_row');
      const normalizedSkill = sourceKind === 'dead_run'
        ? verifiedDeadRunScore(row) : null;
      receipts.set(receiptKey, {
        sourceKind, source_system: row.source_system, source_event_id: row.source_event_id,
        source_pet_id: row.source_pet_id || null,
        verification_kind: sourceKind === 'dead_run' ? 'server_settlement' : 'server_receipt',
        normalized_skill: normalizedSkill,
        owner, day_key: day, earned_at_ms: earnedAtMs,
      });
    }
  }
  if (!receipts.size) return { state: 'no_qualifying_receipts', day_key: day };

  const statements = [];
  for (const receipt of receipts.values()) {
    const effects = PILOT_SOURCE_POLICY[receipt.sourceKind];
    const { source } = prepareWrites(db, receipt, effects[0], nowMs);
    statements.push(source);
    for (const effect of effects) {
      // Only independently recomputed scoreRun() results can mint Skill.
      const trusted = effect.skill_source === 'verified_dead_run_score_v1'
        ? { ...effect, normalized_skill: receipt.normalized_skill } : effect;
      statements.push(prepareWrites(db, receipt, trusted, nowMs).effectInsert);
    }
  }
  statements.push(db.prepare(PILOT_REPROJECT_SQL).bind(
    owner, day, CLOUT_POLICY_VERSION, owner, day, CLOUT_POLICY_VERSION, nowMs,
  ));
  const results = await db.batch(statements);
  if (!Array.isArray(results) || results.length !== statements.length ||
      results.some(r => !r || r.success === false)) {
    throw new Error('clout_pilot_write_unavailable');
  }
  const latest = await db.prepare([
    'SELECT total_points FROM championship_clout_daily',
    'WHERE telegram_id=? AND day_key=? AND policy_version=?',
  ].join(' ')).bind(owner, day, CLOUT_POLICY_VERSION).first();
  if (!latest || !Number.isInteger(latest.total_points) ||
      latest.total_points < 0 || latest.total_points > 100) {
    throw new Error('clout_pilot_snapshot_unavailable');
  }
  return {
    state: 'recorded', day_key: day, qualifying_receipts: receipts.size,
    total_points: latest.total_points,
  };
}
