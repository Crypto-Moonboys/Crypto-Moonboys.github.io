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
  return Math.floor(xp * 60_000 / timeMs);
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
        'SELECT display_name, ' + columns + ' FROM nbg_london_records ORDER BY ' + METRICS[metric] + ' LIMIT 20'
      ).all();
      return json(request, {
        ok: true, metric, records: (result.results || []).map((row, index) => ({
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

    const consumed = await env.DB.prepare(
      'UPDATE nbg_london_runs SET finished_at_ms = ? WHERE run_id = ? AND telegram_id = ? AND finished_at_ms IS NULL'
    ).bind(now, runId, telegramId).run();
    if (consumed?.meta?.changes !== 1)
      return json(request, { ok: false, error: 'run_already_submitted' }, 409);

    const timeMs = body.time_ms;
    const xp = body.xp;
    const rate = efficiencyRate(xp, timeMs);
    const name = displayName(identity.linkedAccount);
    await env.DB.prepare(
      'INSERT INTO nbg_london_records (telegram_id, display_name, fastest_ms, fastest_xp, speed_xp_rate, speed_xp_ms, speed_xp_xp, best_xp, best_xp_ms, updated_at_ms) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(telegram_id) DO UPDATE SET ' +
      'display_name = excluded.display_name, updated_at_ms = excluded.updated_at_ms, ' +
      'fastest_xp = CASE WHEN excluded.fastest_ms < fastest_ms OR (excluded.fastest_ms = fastest_ms AND excluded.fastest_xp > fastest_xp) THEN excluded.fastest_xp ELSE fastest_xp END, ' +
      'fastest_ms = MIN(fastest_ms, excluded.fastest_ms), ' +
      'speed_xp_ms = CASE WHEN excluded.speed_xp_rate > speed_xp_rate OR (excluded.speed_xp_rate = speed_xp_rate AND excluded.speed_xp_ms < speed_xp_ms) THEN excluded.speed_xp_ms ELSE speed_xp_ms END, ' +
      'speed_xp_xp = CASE WHEN excluded.speed_xp_rate > speed_xp_rate OR (excluded.speed_xp_rate = speed_xp_rate AND excluded.speed_xp_ms < speed_xp_ms) THEN excluded.speed_xp_xp ELSE speed_xp_xp END, ' +
      'speed_xp_rate = MAX(speed_xp_rate, excluded.speed_xp_rate), ' +
      'best_xp_ms = CASE WHEN excluded.best_xp > best_xp OR (excluded.best_xp = best_xp AND excluded.best_xp_ms < best_xp_ms) THEN excluded.best_xp_ms ELSE best_xp_ms END, ' +
      'best_xp = MAX(best_xp, excluded.best_xp)'
    ).bind(telegramId, name, timeMs, xp, rate, timeMs, xp, xp, timeMs, now).run();
    return json(request, { ok: true, saved: true, player: name, time_ms: timeMs, xp, xp_per_minute: rate });
  } catch (error) {
    console.error('[nbg-london-records]', error?.message || 'database_error');
    return json(request, { ok: false, error: 'records_unavailable' }, 503);
  }
}
