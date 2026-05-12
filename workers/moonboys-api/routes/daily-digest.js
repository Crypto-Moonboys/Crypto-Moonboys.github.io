import { verifyTelegramIdentityFromBody } from '../blocktopia/auth.js';

export async function handleRogueliteDailyRoutes(request, env, url, helpers) {
  const { path, json, err, verifyTelegramAuth } = helpers;
  const {
    ensureDailyDigestTables,
    upsertTelegramUser,
    getTodayUtcDate,
    getUserFaction,
    normalizeBattleChamberFaction,
    backfillMissedPerkGapsFromLastActiveDay,
    ensureDailyOpportunityStateForToday,
    ensurePlayerStateTables,
    hasDailyMissedXpValueColumn,
    getMissedHistorySnapshot,
    getMissedPerkTotals,
    formatMissionIdLabel,
    logApiFailure,
    clampText,
    DAILY_MISSED_HISTORY_MAX_LIMIT,
    getMissedPerkRows,
    safeJsonParse,
    normaliseMissedMetadata,
    insertMissedPerkEntry,
    readAdminSecret,
    isAdminTelegramUser,
    runTelegramDailyDigest,
  } = helpers;

  if (path === '/roguelite/daily-state' && (request.method === 'GET' || request.method === 'POST')) {
    let tgBody = {};
    if (request.method === 'POST') {
      try { tgBody = await request.json(); } catch { return err('Invalid JSON', 400); }
    } else {
      const rawAuth = url.searchParams.get('telegram_auth');
      if (!rawAuth) return err('verified telegram_auth payload required', 401);
      try {
        tgBody = { telegram_auth: JSON.parse(rawAuth) };
      } catch {
        return err('Invalid telegram_auth payload', 400);
      }
    }
    const verified = await verifyTelegramIdentityFromBody(tgBody, env, verifyTelegramAuth);
    if (verified.error) return err(verified.error, verified.status || 401);
    const ddCheck = await ensureDailyDigestTables(env.DB);
    if (ddCheck) return ddCheck.response;
    try {
      await upsertTelegramUser(env.DB, verified.user);
      const utcDay = getTodayUtcDate();
      const faction = await getUserFaction(env.DB, verified.telegramId).catch(() => null);
      const factionId = normalizeBattleChamberFaction(faction?.id || faction?.name) || null;
      const backfill = await backfillMissedPerkGapsFromLastActiveDay(env.DB, verified.telegramId, utcDay, factionId);
      const state = await ensureDailyOpportunityStateForToday(env.DB, verified.telegramId, utcDay);
      const playerTables = await ensurePlayerStateTables(env.DB);
      const missionRows = playerTables
        ? []
        : await env.DB.prepare(`
            SELECT mission_id, progress, completed
            FROM player_daily_mission_state
            WHERE telegram_id = ? AND mission_date = ?
            ORDER BY mission_id ASC
          `).bind(verified.telegramId, utcDay).all().catch(() => ({ results: [] }));
      const missedXpValueAvailable = await hasDailyMissedXpValueColumn(env.DB);
      const missed = await getMissedHistorySnapshot(env.DB, verified.telegramId, 5, missedXpValueAvailable);
      const missedTodayTotals = await getMissedPerkTotals(env.DB, verified.telegramId, utcDay, missedXpValueAvailable);
      const digestLog = await env.DB.prepare(`
        SELECT status, sent_at, error_message
        FROM telegram_daily_digest_log
        WHERE telegram_id = ? AND utc_day = ?
        LIMIT 1
      `).bind(verified.telegramId, utcDay).first().catch(() => null);
      return json({
        ok: true,
        utc_day: utcDay,
        telegram_id: verified.telegramId,
        faction_id: factionId,
        today_active: {
          utc_day: utcDay,
          daily_seed: state?.daily_seed || null,
          chain_depth: Math.max(0, Math.floor(Number(state?.chain_depth) || 0)),
          activated_at: state?.activated_at || null,
          last_roll_at: state?.last_roll_at || null,
          claimed_items: [],
          mission_opportunities: (missionRows?.results || []).slice(0, 3).map((row) => ({
            mission_id: row.mission_id,
            title: formatMissionIdLabel(row.mission_id),
            progress: Math.max(0, Math.floor(Number(row.progress) || 0)),
            completed: Number(row.completed) === 1,
            contribution_preview: 'clout/status opportunity',
          })),
        },
        missed_history_count: missed.total,
        missed_events_all_time: missed.total,
        missed_xp_all_time: missed.xp_total,
        missed_events_today: missedTodayTotals.events_total,
        missed_xp_today: missedTodayTotals.xp_total,
        recent_missed_history: missed.recent,
        missed_backfill: backfill,
        digest_status: {
          sent_today: digestLog?.status === 'sent',
          status: digestLog?.status || null,
          sent_at: digestLog?.sent_at || null,
          error_message: digestLog?.error_message || null,
        },
      });
    } catch (error) {
      logApiFailure('roguelite_daily_state_failed', {
        telegramId: verified.telegramId,
        message: error?.message || String(error),
      });
      return err('Failed to load roguelite daily state', 500);
    }
  }

  if (path === '/roguelite/missed-history' && (request.method === 'GET' || request.method === 'POST')) {
    let tgBody = {};
    if (request.method === 'POST') {
      try { tgBody = await request.json(); } catch { return err('Invalid JSON', 400); }
    } else {
      const rawAuth = url.searchParams.get('telegram_auth');
      if (!rawAuth) return err('verified telegram_auth payload required', 401);
      try {
        tgBody = { telegram_auth: JSON.parse(rawAuth) };
      } catch {
        return err('Invalid telegram_auth payload', 400);
      }
    }
    const verified = await verifyTelegramIdentityFromBody(tgBody, env, verifyTelegramAuth);
    if (verified.error) return err(verified.error, verified.status || 401);
    const ddCheck = await ensureDailyDigestTables(env.DB);
    if (ddCheck) return ddCheck.response;
    const limitInput = request.method === 'POST' ? tgBody?.limit : url.searchParams.get('limit');
    const utcDayInput = request.method === 'POST' ? tgBody?.utc_day : url.searchParams.get('utc_day');
    const limit = Math.max(1, Math.min(DAILY_MISSED_HISTORY_MAX_LIMIT, Math.floor(Number(limitInput || 30) || 30)));
    const utcDay = clampText(utcDayInput || '', 10, '');
    try {
      const missedXpValueAvailable = await hasDailyMissedXpValueColumn(env.DB);
      const [rowResult, scopedTotals, allTimeTotals] = await Promise.all([
        getMissedPerkRows(env.DB, verified.telegramId, limit, utcDay || null, missedXpValueAvailable),
        getMissedPerkTotals(env.DB, verified.telegramId, utcDay || null, missedXpValueAvailable),
        getMissedPerkTotals(env.DB, verified.telegramId, null, missedXpValueAvailable),
      ]);
      const items = (rowResult.rows || []).map((row) => ({
        id: row.id,
        telegram_id: row.telegram_id,
        utc_day: row.utc_day,
        faction_id: row.faction_id || null,
        source: row.source,
        opportunity_type: row.opportunity_type,
        title: row.title,
        description: row.description || null,
        missed_reason: row.missed_reason || null,
        status_value: Math.max(0, Math.floor(Number(row.status_value) || 0)),
        missed_xp_value: rowResult.has_missed_xp_value ? Math.max(0, Math.floor(Number(row.missed_xp_value) || 0)) : 0,
        metadata_json: row.metadata_json || null,
        metadata: safeJsonParse(row.metadata_json, {}),
        missed_at: row.missed_at || null,
        created_at: row.created_at || null,
      }));
      return json({
        ok: true,
        telegram_id: verified.telegramId,
        utc_day: utcDay || null,
        limit,
        total: scopedTotals.events_total,
        total_all_time: allTimeTotals.events_total,
        missed_events_all_time: allTimeTotals.events_total,
        missed_xp_all_time: allTimeTotals.xp_total,
        items,
      });
    } catch (error) {
      logApiFailure('roguelite_missed_history_failed', {
        telegramId: verified.telegramId,
        message: error?.message || String(error),
      });
      return err('Failed to load missed history', 500);
    }
  }

  if (path === '/roguelite/mark-missed' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
    const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
    if (verified.error) return err(verified.error, verified.status || 401);
    const ddCheck = await ensureDailyDigestTables(env.DB);
    if (ddCheck) return ddCheck.response;
    try {
      await upsertTelegramUser(env.DB, verified.user);
      const factionId = body?.faction_id ? normalizeBattleChamberFaction(body.faction_id) : null;
      const clientMissedAt = body?.missed_at && Number.isFinite(Date.parse(String(body.missed_at)))
        ? new Date(body.missed_at).toISOString()
        : null;
      const metadataBase = safeJsonParse(normaliseMissedMetadata(body?.metadata_json), {});
      const metadataObject = metadataBase && typeof metadataBase === 'object' && !Array.isArray(metadataBase)
        ? metadataBase
        : {};
      if (clientMissedAt) metadataObject.client_missed_at = clientMissedAt;
      await insertMissedPerkEntry(env.DB, {
        telegramId: verified.telegramId,
        utcDay: getTodayUtcDate(),
        factionId,
        source: body?.source,
        opportunityType: body?.opportunity_type,
        title: body?.title,
        description: body?.description,
        missedReason: body?.missed_reason || 'manual_mark',
        statusValue: body?.status_value,
        missedXpValue: 0,
        metadataJson: metadataObject,
      });
      return json({
        ok: true,
        telegram_id: verified.telegramId,
        utc_day: getTodayUtcDate(),
        faction_id: factionId,
        recorded: true,
        safety: {
          xp_awarded: 0,
          leaderboard_score_mutated: false,
          faction_clout_mutated: false,
        },
      });
    } catch (error) {
      logApiFailure('roguelite_mark_missed_failed', {
        telegramId: verified.telegramId,
        message: error?.message || String(error),
      });
      return err('Failed to record missed opportunity', 500);
    }
  }

  if (path === '/telegram/daily-digest/run' && request.method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const configuredSecret = String(env.ADMIN_SECRET || '').trim();
    const headerSecret = readAdminSecret(request);
    let allowed = false;
    let authMode = null;
    if (configuredSecret && headerSecret === configuredSecret) {
      allowed = true;
      authMode = 'admin_secret';
    } else if (body && body.telegram_auth) {
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (!verified.error && isAdminTelegramUser(verified.telegramId, env)) {
        allowed = true;
        authMode = 'admin_telegram_auth';
      }
    }
    if (!allowed) return err('Unauthorized', 401);
    const summary = await runTelegramDailyDigest(env, {
      trigger: 'manual_route',
      targetTelegramId: body?.telegram_id ? String(body.telegram_id) : null,
      utcDay: body?.utc_day ? clampText(body.utc_day, 10, getTodayUtcDate()) : getTodayUtcDate(),
      forceRetry: body?.force_retry === true,
    });
    if (!summary?.ok) {
      return json(summary, 503);
    }
    return json({
      ok: true,
      auth_mode: authMode,
      ...summary,
    });
  }

  return null;
}
