import { periodsForFinish, periodStart, PRIZE_ARCADE_XP } from './nbg-london-prizes.js';

// NBG London all-time bests. Score XP is a game metric, not awarded Arcade XP.
const PREFIX = '/nbg-london';
const METRICS = Object.freeze({
  fastest: 'fastest_ms ASC, fastest_xp DESC',
  speed_xp: 'speed_xp_rate DESC, speed_xp_ms ASC',
  xp: 'best_xp DESC, best_xp_ms ASC',
});
const ORIGINS = new Set([
  'https://cryptomoonboys.com', 'https://www.cryptomoonboys.com',
  'https://crypto-moonboys.github.io',
]);
const MIN_FINISH_MS = 65_000; // 22,000px course cannot be completed in a few seconds.
const MAX_FINISH_MS = 30 * 60_000;
const SERVER_CLOCK_TOLERANCE_MS = 20_000;

export function efficiencyRate(xp, timeMs) {
  return xp * 60_000 / timeMs;
}

export function validFinish(body, elapsedServerMs) {
  const timeMs = body?.time_ms;
  const xp = body?.xp;
  return body?.complete === true &&
    Number.isSafeInteger(timeMs) && timeMs >= MIN_FINISH_MS && timeMs <= MAX_FINISH_MS &&
    Number.isSafeInteger(xp) && xp >= 0 && xp <= 1_000_000 &&
    Number.isSafeInteger(body?.coins) && body.coins >= 0 && body.coins <= 312 &&
    Number.isSafeInteger(body?.secret_coins) && body.secret_coins >= 0 && body.secret_coins <= 6 &&
    elapsedServerMs + SERVER_CLOCK_TOLERANCE_MS >= timeMs &&
    elapsedServerMs - SERVER_CLOCK_TOLERANCE_MS <= timeMs;
}

function cors(request) {
  const origin = request.headers.get('Origin');
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : 'https://cryptomoonboys.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(request, payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: cors(request) });
}

// Public boards use BOTH anti-cheat authorities. Filter before taking the
// first 20 so a KV-only banned leader cannot displace eligible participants.
// Fail closed if the shared KV binding or any ban lookup is unavailable.
async function publicUnblockedRows(rows, env, cache = new Map()) {
  if (!env.LEADERBOARD || typeof env.LEADERBOARD.get !== 'function')
    throw new Error('nbg_anticheat_kv_unavailable');
  const safe = [];
  for (const row of rows || []) {
    const id = String(row.telegram_id || '');
    if (!id) continue;
    if (!cache.has(id)) cache.set(id, Boolean(await env.LEADERBOARD.get('anticheat:blocked:' + id)));
    if (cache.get(id)) continue;
    safe.push(row);
    if (safe.length >= 20) break;
  }
  return safe;
}

function displayName(user) {
  const username = String(user?.username || '').replace(/^@/, '').trim();
  if (/^[A-Za-z0-9_]{3,32}$/.test(username)) return '@' + username;
  const first = String(user?.first_name || '').trim();
  const last = String(user?.last_name || '').trim();
  const joined = (first + ' ' + last).trim().replace(/[<>\u0000-\u001f]/g, '');
  return joined.slice(0, 70) || 'Telegram player';
}

export async function handleNbgLondonRecords(request, env, verifyIdentity) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  if (!env.DB) return json(request, { ok: false, error: 'records_database_unavailable' }, 503);

  try {
    if (request.method === 'GET' && url.pathname === PREFIX + '/competition') {
      const kind = url.searchParams.get('period') || 'daily';
      if (!['daily', 'weekly', 'seasonal'].includes(kind))
        return json(request, { ok: false, error: 'invalid_competition_period' }, 400);
      const start = periodStart(Date.now(), kind);
      const payoutEnabled = env.NBG_LONDON_PRIZES_ENABLED === 'true' &&
        env.NBG_LONDON_SCORE_AUTHORITY_ENABLED === 'true';
      // Practice/overall totals and verified prize standings are distinct:
      // only the latter uses the identical filter and sort order as freezePeriod.
      const [result, verified] = await Promise.all([
        env.DB.prepare(
          `SELECT s.telegram_id, s.display_name AS name, s.total_xp, s.run_count, s.best_time_ms
           FROM nbg_london_period_scores s
           LEFT JOIN telegram_anticheat_state a ON a.telegram_id = s.telegram_id
           WHERE s.period_kind = ? AND s.period_start_ms = ?
             AND COALESCE(a.is_blocked, 0) = 0
           ORDER BY s.total_xp DESC, s.best_time_ms ASC, s.telegram_id ASC`
        ).bind(kind, start).all(),
        env.DB.prepare(
          `SELECT s.telegram_id, s.display_name AS name, s.trusted_xp AS total_xp,
                  s.verified_run_count AS run_count, s.best_time_ms
           FROM nbg_london_period_scores s
           LEFT JOIN telegram_anticheat_state a ON a.telegram_id = s.telegram_id
           WHERE s.period_kind = ? AND s.period_start_ms = ?
             AND s.verified_run_count > 0 AND s.trusted_xp > 0
             AND COALESCE(a.is_blocked, 0) = 0
           ORDER BY s.trusted_xp DESC, s.best_time_ms ASC, s.telegram_id ASC`
        ).bind(kind, start).all(),
      ]);
      const kvChecks = new Map();
      const [practiceRows, verifiedRows] = await Promise.all([
        publicUnblockedRows(result.results, env, kvChecks),
        publicUnblockedRows(verified.results, env, kvChecks),
      ]);
      const practiceStandings = practiceRows.map((row, index) => ({
        rank: index + 1, name: row.name, total_xp: row.total_xp,
        run_count: row.run_count, best_time_ms: row.best_time_ms,
        prize_eligible: false, prize_rank: null,
      }));
      const verifiedStandings = verifiedRows.map((row, index) => ({
        rank: index + 1, name: row.name, total_xp: row.total_xp,
        run_count: row.run_count, best_time_ms: row.best_time_ms,
        prize_eligible: payoutEnabled && index < 3,
        prize_rank: index < 3 ? index + 1 : null,
      }));
      return json(request, {
        ok: true, period: kind, start_ms: start,
        end_ms: start + (kind === 'daily' ? 86400000 : kind === 'weekly' ? 604800000 : 7776000000),
        prizes: PRIZE_ARCADE_XP[kind],
        payout_enabled: payoutEnabled,
        ranking_basis: payoutEnabled ? 'trusted_xp' : 'practice_xp',
        standings: payoutEnabled ? verifiedStandings : practiceStandings,
      });
    }
    if (request.method === 'GET' && url.pathname === PREFIX + '/leaderboard') {
      const metric = url.searchParams.get('metric') || 'fastest';
      if (!Object.prototype.hasOwnProperty.call(METRICS, metric))
        return json(request, { ok: false, error: 'invalid_metric' }, 400);
      const columns = metric === 'fastest'
        ? 'fastest_ms AS time_ms, fastest_xp AS xp, fastest_ms AS value'
        : metric === 'speed_xp'
          ? 'speed_xp_ms AS time_ms, speed_xp_xp AS xp, speed_xp_rate AS value'
          : 'best_xp_ms AS time_ms, best_xp AS xp, best_xp AS value';
      const result = await env.DB.prepare(
        'SELECT r.telegram_id, r.display_name, ' + columns +
        ' FROM nbg_london_records r ' +
        'LEFT JOIN telegram_anticheat_state a ON a.telegram_id = r.telegram_id ' +
        'WHERE COALESCE(a.is_blocked, 0) = 0 ORDER BY ' + METRICS[metric]
      ).all();
      const publicRows = await publicUnblockedRows(result.results, env);
      return json(request, {
        ok: true, metric, records: publicRows.map((row, index) => ({
          rank: index + 1, name: row.display_name, time_ms: row.time_ms, xp: row.xp, value: row.value,
        })),
      });
    }
    if (request.method !== 'POST' ||
        (url.pathname !== PREFIX + '/run/start' && url.pathname !== PREFIX + '/run/finish' &&
         url.pathname !== PREFIX + '/me')) {
      return json(request, { ok: false, error: 'not_found' }, 404);
    }
    if (request.headers.get('Origin') && !ORIGINS.has(request.headers.get('Origin')))
      return json(request, { ok: false, error: 'origin_not_allowed' }, 403);
    let body;
    try { body = await request.json(); } catch { return json(request, { ok: false, error: 'invalid_json' }, 400); }
    const identity = await verifyIdentity(body, env);
    if (!identity.ok) return json(request, { ok: false, error: identity.error }, identity.status || 403);
    if (env.LEADERBOARD && await env.LEADERBOARD.get('anticheat:blocked:' + identity.telegramId))
      return json(request, { ok: false, error: 'account_blocked' }, 403);
    const telegramId = identity.telegramId;
    const now = Date.now();

    if (url.pathname === PREFIX + '/me') {
      const own = await env.DB.prepare(
        'SELECT fastest_ms, fastest_xp, speed_xp_rate, speed_xp_ms, speed_xp_xp, best_xp, best_xp_ms ' +
        'FROM nbg_london_records WHERE telegram_id = ?'
      ).bind(telegramId).first();
      return json(request, { ok: true, player: displayName(identity.linkedAccount), records: own || null });
    }

    if (url.pathname === PREFIX + '/run/start') {
      const runId = crypto.randomUUID();
      await env.DB.prepare(
        'INSERT INTO nbg_london_runs (run_id, telegram_id, started_at_ms, expires_at_ms) VALUES (?, ?, ?, ?)'
      ).bind(runId, telegramId, now, now + MAX_FINISH_MS + SERVER_CLOCK_TOLERANCE_MS).run();
      return json(request, { ok: true, run_id: runId, player: displayName(identity.linkedAccount), ranked: true });
    }

    const runId = String(body?.run_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(runId)) return json(request, { ok: false, error: 'invalid_run_id' }, 400);
    const session = await env.DB.prepare(
      'SELECT telegram_id, started_at_ms, expires_at_ms, finished_at_ms FROM nbg_london_runs WHERE run_id = ?'
    ).bind(runId).first();
    if (!session || session.telegram_id !== telegramId || session.finished_at_ms != null ||
        now > session.expires_at_ms)
      return json(request, { ok: false, error: 'run_expired_or_invalid' }, 409);
    if (!validFinish(body, now - session.started_at_ms))
      return json(request, { ok: false, error: 'run_validation_failed' }, 422);

    const timeMs = body.time_ms;
    const xp = body.xp;
    const rate = efficiencyRate(xp, timeMs);
    const name = displayName(identity.linkedAccount);
    const finishToken = crypto.randomUUID();
    const periods = periodsForFinish(now);
    // The receipt claim must succeed while ALL attributed periods remain open.
    // A freeze batch that wins the DB race prevents a late finish from being
    // claimed or credited; a successful finish precedes the atomic freeze query.
    const periodGuard = periods.map(() =>
      'AND NOT EXISTS (SELECT 1 FROM nbg_london_prize_periods WHERE period_kind = ? AND period_start_ms = ?)'
    ).join(' ');
    const guardParams = periods.flatMap(period => [period.kind, period.start]);
    const writes = [
      env.DB.prepare(
        'UPDATE nbg_london_runs SET finished_at_ms = ?, finish_token = ? ' +
        'WHERE run_id = ? AND telegram_id = ? AND finished_at_ms IS NULL ' +
        'AND CAST(strftime(\'%s\', \'now\') AS INTEGER) * 1000 < ? ' + periodGuard
      ).bind(now, finishToken, runId, telegramId, periodStart(now, 'daily') + 86400000, ...guardParams),
      env.DB.prepare(
      'INSERT INTO nbg_london_records (telegram_id, display_name, fastest_ms, fastest_xp, speed_xp_rate, speed_xp_ms, speed_xp_xp, best_xp, best_xp_ms, updated_at_ms) ' +
      'SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM nbg_london_runs WHERE run_id = ? AND finish_token = ?) ' +
      'ON CONFLICT(telegram_id) DO UPDATE SET ' +
      'display_name = excluded.display_name, updated_at_ms = excluded.updated_at_ms, ' +
      'fastest_xp = CASE WHEN excluded.fastest_ms < fastest_ms OR (excluded.fastest_ms = fastest_ms AND excluded.fastest_xp > fastest_xp) THEN excluded.fastest_xp ELSE fastest_xp END, ' +
      'fastest_ms = MIN(fastest_ms, excluded.fastest_ms), ' +
      'speed_xp_ms = CASE WHEN excluded.speed_xp_rate > speed_xp_rate OR (excluded.speed_xp_rate = speed_xp_rate AND excluded.speed_xp_ms < speed_xp_ms) THEN excluded.speed_xp_ms ELSE speed_xp_ms END, ' +
      'speed_xp_xp = CASE WHEN excluded.speed_xp_rate > speed_xp_rate OR (excluded.speed_xp_rate = speed_xp_rate AND excluded.speed_xp_ms < speed_xp_ms) THEN excluded.speed_xp_xp ELSE speed_xp_xp END, ' +
      'speed_xp_rate = MAX(speed_xp_rate, excluded.speed_xp_rate), ' +
      'best_xp_ms = CASE WHEN excluded.best_xp > best_xp OR (excluded.best_xp = best_xp AND excluded.best_xp_ms < best_xp_ms) THEN excluded.best_xp_ms ELSE best_xp_ms END, ' +
      'best_xp = MAX(best_xp, excluded.best_xp)'
    ).bind(telegramId, name, timeMs, xp, rate, timeMs, xp, xp, timeMs, now, runId, finishToken)
    ];
    for (const period of periods) {
      writes.push(env.DB.prepare(
        `INSERT INTO nbg_london_period_scores
           (period_kind, period_start_ms, telegram_id, display_name, total_xp, run_count, best_time_ms, updated_at_ms)
         SELECT ?, ?, ?, ?, ?, 1, ?, ? WHERE EXISTS (SELECT 1 FROM nbg_london_runs WHERE run_id = ? AND finish_token = ?)
         ON CONFLICT(period_kind, period_start_ms, telegram_id) DO UPDATE SET
           display_name = excluded.display_name,
           total_xp = nbg_london_period_scores.total_xp + excluded.total_xp,
           run_count = nbg_london_period_scores.run_count + 1,
           best_time_ms = MIN(nbg_london_period_scores.best_time_ms, excluded.best_time_ms),
           updated_at_ms = excluded.updated_at_ms`
      ).bind(period.kind, period.start, telegramId, name, xp, timeMs, now, runId, finishToken));
    }
    // A run receipt, all-time best and all three active period results commit atomically.
    const applied = await env.DB.batch(writes);
    if (applied?.[0]?.meta?.changes !== 1)
      return json(request, { ok: false, error: 'run_already_submitted' }, 409);
    return json(request, { ok: true, saved: true, player: name, time_ms: timeMs, xp, xp_per_minute: rate });
  } catch (error) {
    console.error('[nbg-london-records]', error?.message || 'database_error');
    return json(request, { ok: false, error: 'records_unavailable' }, 503);
  }
}
