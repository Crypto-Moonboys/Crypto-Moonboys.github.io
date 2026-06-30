import { CANONICAL_FACTION_KEYS, normalizeFaction } from '../shared/faction-canon.js';
import { verifyTelegramIdentityFromBody } from '../blocktopia/auth.js';

const PLAYER_STATE_TABLES = [
  'player_modifier_state',
  'player_daily_mission_state',
  'player_faction_signal_state',
  'player_streak_state',
  'player_game_mastery_state',
];

const DAILY_DIGEST_TABLES = [
  'daily_missed_perks',
  'telegram_daily_digest_log',
  'daily_opportunity_state',
];

const DAILY_MISSED_TEXT_LIMITS = Object.freeze({
  source: 80,
  opportunityType: 80,
  title: 140,
  description: 400,
  missedReason: 160,
});

const DAILY_MISSED_HISTORY_MAX_LIMIT = 100;
const MISSED_XP_PER_DAILY_WINDOW = 25;
const BATTLE_CHAMBER_FACTIONS = CANONICAL_FACTION_KEYS;

function getTodayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function clampText(value, maxLen, fallback = '') {
  const safe = String(value == null ? fallback : value).trim();
  if (!safe) return String(fallback || '').slice(0, maxLen);
  return safe.slice(0, maxLen);
}

function safeJsonParse(raw, fallback) {
  try { return raw != null ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function normalizeBattleChamberFaction(value) {
  const normalized = normalizeFaction(value);
  return BATTLE_CHAMBER_FACTIONS.includes(normalized) ? normalized : null;
}

function normaliseMissedMetadata(metadata) {
  if (!metadata) return null;
  if (typeof metadata === 'string') {
    const parsed = safeJsonParse(metadata, null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return JSON.stringify(parsed).slice(0, 4000);
    return null;
  }
  if (typeof metadata === 'object' && !Array.isArray(metadata)) return JSON.stringify(metadata).slice(0, 4000);
  return null;
}

function formatMissionIdLabel(missionId) {
  const base = String(missionId || '').replace(/[_-]+/g, ' ').trim();
  if (!base) return 'Mission';
  return base.replace(/\b\w/g, (m) => m.toUpperCase()).slice(0, 60);
}

async function ensurePlayerStateTables(db) {
  for (const tableName of PLAYER_STATE_TABLES) {
    const row = await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`).bind(tableName).first().catch(() => null);
    if (!row?.name) {
      return {
        _isPlayerStateUnavailable: true,
        tableName,
        response: new Response(JSON.stringify({
          ok: false,
          error: 'player_state_unavailable',
          reason: `migration_pending:${tableName}`,
          message: 'Player state tables are not yet configured. Apply migration 015.',
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        }),
      };
    }
  }
  return null;
}

async function ensureDailyDigestTables(db) {
  for (const tableName of DAILY_DIGEST_TABLES) {
    const row = await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`).bind(tableName).first().catch(() => null);
    if (!row?.name) {
      return {
        _isDailyDigestUnavailable: true,
        tableName,
        response: new Response(JSON.stringify({
          ok: false,
          error: 'daily_digest_unavailable',
          reason: `migration_pending:${tableName}`,
          message: 'Daily digest and missed history tables are not yet configured. Apply migration 018.',
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        }),
      };
    }
  }
  return null;
}

async function getUserFaction(db, telegramId) {
  const row = await db.prepare(`
    SELECT f.id, f.name, f.description, f.icon, fm.role
    FROM telegram_faction_members fm
    JOIN telegram_factions f ON f.id = fm.faction_id
    WHERE fm.telegram_id = ?
  `).bind(telegramId).first().catch(() => null);
  return row || null;
}

async function hasDailyMissedXpValueColumn(db) {
  const info = await db.prepare(`PRAGMA table_info(daily_missed_perks)`).all().catch(() => ({ results: [] }));
  return (info?.results || []).some((column) => String(column?.name || '') === 'missed_xp_value');
}

async function getMissedPerkTotals(db, telegramId, utcDay = null, missedXpValueAvailable = null) {
  const hasMissedXpValue = missedXpValueAvailable == null ? await hasDailyMissedXpValueColumn(db) : !!missedXpValueAvailable;
  const countRow = utcDay
    ? await db.prepare(`SELECT COUNT(*) AS events_total FROM daily_missed_perks WHERE telegram_id = ? AND utc_day = ?`).bind(String(telegramId), String(utcDay)).first().catch(() => ({ events_total: 0 }))
    : await db.prepare(`SELECT COUNT(*) AS events_total FROM daily_missed_perks WHERE telegram_id = ?`).bind(String(telegramId)).first().catch(() => ({ events_total: 0 }));
  if (!hasMissedXpValue) {
    return { events_total: Math.max(0, Math.floor(Number(countRow?.events_total) || 0)), xp_total: 0, has_missed_xp_value: false };
  }
  const xpRow = utcDay
    ? await db.prepare(`SELECT COALESCE(SUM(missed_xp_value), 0) AS xp_total FROM daily_missed_perks WHERE telegram_id = ? AND utc_day = ?`).bind(String(telegramId), String(utcDay)).first().catch(() => ({ xp_total: 0 }))
    : await db.prepare(`SELECT COALESCE(SUM(missed_xp_value), 0) AS xp_total FROM daily_missed_perks WHERE telegram_id = ?`).bind(String(telegramId)).first().catch(() => ({ xp_total: 0 }));
  return {
    events_total: Math.max(0, Math.floor(Number(countRow?.events_total) || 0)),
    xp_total: Math.max(0, Math.floor(Number(xpRow?.xp_total) || 0)),
    has_missed_xp_value: true,
  };
}

async function getMissedPerkRows(db, telegramId, limit = 5, utcDay = null, missedXpValueAvailable = null) {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 5));
  const hasMissedXpValue = missedXpValueAvailable == null ? await hasDailyMissedXpValueColumn(db) : !!missedXpValueAvailable;
  const query = hasMissedXpValue
    ? (utcDay
      ? db.prepare(`SELECT id, telegram_id, utc_day, faction_id, source, opportunity_type, title, description, missed_reason, status_value, missed_xp_value, metadata_json, missed_at, created_at FROM daily_missed_perks WHERE telegram_id = ? AND utc_day = ? ORDER BY missed_at DESC, id DESC LIMIT ?`).bind(String(telegramId), String(utcDay), safeLimit)
      : db.prepare(`SELECT id, telegram_id, utc_day, faction_id, source, opportunity_type, title, description, missed_reason, status_value, missed_xp_value, metadata_json, missed_at, created_at FROM daily_missed_perks WHERE telegram_id = ? ORDER BY missed_at DESC, id DESC LIMIT ?`).bind(String(telegramId), safeLimit))
    : (utcDay
      ? db.prepare(`SELECT id, telegram_id, utc_day, faction_id, source, opportunity_type, title, description, missed_reason, status_value, metadata_json, missed_at, created_at FROM daily_missed_perks WHERE telegram_id = ? AND utc_day = ? ORDER BY missed_at DESC, id DESC LIMIT ?`).bind(String(telegramId), String(utcDay), safeLimit)
      : db.prepare(`SELECT id, telegram_id, utc_day, faction_id, source, opportunity_type, title, description, missed_reason, status_value, metadata_json, missed_at, created_at FROM daily_missed_perks WHERE telegram_id = ? ORDER BY missed_at DESC, id DESC LIMIT ?`).bind(String(telegramId), safeLimit));
  const rows = await query.all().catch(() => ({ results: [] }));
  return { rows: rows?.results || [], has_missed_xp_value: hasMissedXpValue };
}

async function getMissedHistorySnapshot(db, telegramId, limit = 5, missedXpValueAvailable = null) {
  const [totals, rowResult] = await Promise.all([
    getMissedPerkTotals(db, telegramId, null, missedXpValueAvailable),
    getMissedPerkRows(db, telegramId, limit, null, missedXpValueAvailable),
  ]);
  return {
    total: totals.events_total,
    xp_total: totals.xp_total,
    recent: (rowResult.rows || []).map((row) => ({
      id: row.id,
      utc_day: row.utc_day,
      faction_id: row.faction_id || null,
      source: row.source,
      opportunity_type: row.opportunity_type,
      title: row.title,
      description: row.description || null,
      missed_reason: row.missed_reason || null,
      status_value: Number(row.status_value) || 0,
      missed_xp_value: rowResult.has_missed_xp_value ? Math.max(0, Math.floor(Number(row.missed_xp_value) || 0)) : 0,
      metadata: safeJsonParse(row.metadata_json, {}),
      missed_at: row.missed_at || null,
      created_at: row.created_at || null,
    })),
  };
}

async function insertMissedPerkEntry(db, {
  telegramId,
  utcDay,
  factionId,
  source,
  opportunityType,
  title,
  description,
  missedReason,
  statusValue,
  missedXpValue,
  metadataJson,
  missedAt,
  missedXpValueAvailable,
}) {
  const safeTelegramId = String(telegramId || '').trim();
  if (!safeTelegramId) return null;
  const fallbackToday = getTodayUtcDate();
  const safeUtcDay = clampText(utcDay || fallbackToday, 10, fallbackToday);
  const normalizedFaction = factionId ? normalizeBattleChamberFaction(factionId) : null;
  const safeSource = clampText(source, DAILY_MISSED_TEXT_LIMITS.source, 'unknown');
  const safeType = clampText(opportunityType, DAILY_MISSED_TEXT_LIMITS.opportunityType, 'daily_opportunity');
  const safeTitle = clampText(title, DAILY_MISSED_TEXT_LIMITS.title, 'Missed daily opportunity');
  const safeDescription = clampText(description, DAILY_MISSED_TEXT_LIMITS.description, '');
  const safeReason = clampText(missedReason, DAILY_MISSED_TEXT_LIMITS.missedReason, 'not_played');
  const safeStatusValue = Math.max(0, Math.floor(Number(statusValue) || 0));
  const safeMissedXpValue = Math.max(0, Math.floor(Number(missedXpValue) || 0));
  const safeMetadata = normaliseMissedMetadata(metadataJson);
  const safeMissedAt = missedAt && Number.isFinite(Date.parse(String(missedAt))) ? new Date(missedAt).toISOString() : new Date().toISOString();
  const safeCreatedAt = new Date().toISOString();
  const hasMissedXpValue = missedXpValueAvailable == null ? await hasDailyMissedXpValueColumn(db) : !!missedXpValueAvailable;

  const runInsertWithXp = () => db.prepare(`
    INSERT INTO daily_missed_perks
      (telegram_id, utc_day, faction_id, source, opportunity_type, title, description, missed_reason, status_value, missed_xp_value, metadata_json, missed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    safeTelegramId,
    safeUtcDay,
    normalizedFaction || null,
    safeSource,
    safeType,
    safeTitle,
    safeDescription || null,
    safeReason || null,
    safeStatusValue,
    safeMissedXpValue,
    safeMetadata,
    safeMissedAt,
    safeCreatedAt,
  ).run();

  const runInsertWithoutXp = () => db.prepare(`
    INSERT INTO daily_missed_perks
      (telegram_id, utc_day, faction_id, source, opportunity_type, title, description, missed_reason, status_value, metadata_json, missed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    safeTelegramId,
    safeUtcDay,
    normalizedFaction || null,
    safeSource,
    safeType,
    safeTitle,
    safeDescription || null,
    safeReason || null,
    safeStatusValue,
    safeMetadata,
    safeMissedAt,
    safeCreatedAt,
  ).run();

  let result = null;
  if (hasMissedXpValue) {
    result = await runInsertWithXp().catch(async (error) => {
      const message = String(error?.message || error || '').toLowerCase();
      if (message.includes('no such column') || message.includes('missed_xp_value')) return runInsertWithoutXp().catch(() => null);
      return null;
    });
  } else {
    result = await runInsertWithoutXp().catch(() => null);
  }
  return result;
}

function listUtcDaysBetweenExclusive(startUtcDay, endUtcDay, maxDays = 45) {
  const startTs = Date.parse(`${String(startUtcDay)}T00:00:00Z`);
  const endTs = Date.parse(`${String(endUtcDay)}T00:00:00Z`);
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs) return [];
  const days = [];
  let cursor = startTs + 86400000;
  while (cursor < endTs && days.length < maxDays) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86400000;
  }
  return days;
}

export async function ensureDailyOpportunityStateForToday(db, telegramId, utcDay) {
  const safeTelegramId = String(telegramId || '').trim();
  const dayKey = clampText(utcDay || getTodayUtcDate(), 10, getTodayUtcDate());
  await db.prepare(`
    INSERT INTO daily_opportunity_state
      (telegram_id, utc_day, daily_seed, chain_depth, activated_at, last_roll_at, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, NULL, ?, ?)
    ON CONFLICT(telegram_id, utc_day) DO NOTHING
  `).bind(
    safeTelegramId,
    dayKey,
    crypto.randomUUID(),
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString(),
  ).run();
  return db.prepare(`
    SELECT telegram_id, utc_day, daily_seed, chain_depth, activated_at, last_roll_at, created_at, updated_at
    FROM daily_opportunity_state
    WHERE telegram_id = ? AND utc_day = ?
    LIMIT 1
  `).bind(safeTelegramId, dayKey).first().catch(() => null);
}

export async function backfillMissedPerkGapsFromLastActiveDay(db, telegramId, todayUtcDay, factionId) {
  const prior = await db.prepare(`
    SELECT utc_day FROM daily_opportunity_state WHERE telegram_id = ? AND utc_day < ? ORDER BY utc_day DESC LIMIT 1
  `).bind(String(telegramId), todayUtcDay).first();
  if (!prior?.utc_day) return { days_backfilled: 0, entries_created: 0, created: 0, missed_days: [] };
  const missedDays = listUtcDaysBetweenExclusive(prior.utc_day, todayUtcDay, 45);
  const missedXpValueAvailable = await hasDailyMissedXpValueColumn(db);
  let entriesCreated = 0;
  let daysFilledCount = 0;
  for (const missedDay of missedDays) {
    const existing = await db.prepare(`
      SELECT id FROM daily_missed_perks
      WHERE telegram_id = ? AND utc_day = ? AND source = 'daily_reset' AND opportunity_type = 'daily_activation_window'
      LIMIT 1
    `).bind(String(telegramId), missedDay).first().catch(() => null);
    if (existing?.id) continue;
    const dailyResetInsert = await insertMissedPerkEntry(db, {
      telegramId,
      utcDay: missedDay,
      factionId: factionId || null,
      source: 'daily_reset',
      opportunityType: 'daily_activation_window',
      title: 'Daily activation window expired',
      description: 'The city kept moving while you were away.',
      missedReason: 'inactive_utc_day',
      statusValue: 1,
      missedXpValue: MISSED_XP_PER_DAILY_WINDOW,
      metadataJson: { trigger: 'utc_reset_backfill' },
      missedAt: `${missedDay}T23:59:59.000Z`,
      missedXpValueAvailable,
    });
    if (!dailyResetInsert) throw new Error(`missed_perk_backfill_insert_failed:${missedDay}`);
    entriesCreated += Number(dailyResetInsert?.meta?.changes || 0);
    daysFilledCount += 1;
  }
  return { days_backfilled: daysFilledCount, entries_created: entriesCreated, created: entriesCreated, missed_days: missedDays };
}

export async function handleRogueliteDailyRoutes(request, env, url, helpers) {
  const { path, json, err, verifyTelegramAuth, upsertTelegramUser, logApiFailure, readAdminSecret, isAdminTelegramUser, runTelegramDailyDigest } = helpers;

  if (path === '/roguelite/daily-state' && (request.method === 'GET' || request.method === 'POST')) {
    let tgBody = {};
    if (request.method === 'POST') {
      try { tgBody = await request.json(); } catch { return err('Invalid JSON', 400); }
    } else {
      const rawAuth = url.searchParams.get('telegram_auth');
      if (!rawAuth) return err('verified telegram_auth payload required', 401);
      try { tgBody = { telegram_auth: JSON.parse(rawAuth) }; } catch { return err('Invalid telegram_auth payload', 400); }
    }
    const verified = await verifyTelegramIdentityFromBody(tgBody, env, verifyTelegramAuth);
    if (verified.error) return err(verified.error, verified.status || 401);
    const ddCheck = await ensureDailyDigestTables(env.DB);
    if (ddCheck) return ddCheck.response;
    try {
      await upsertTelegramUser(env.DB, verified.user);
      const utcDay = getTodayUtcDate();
      const faction = await getUserFaction(env.DB, verified.telegramId).catch(() => null);
      const factionId = normalizeBattleChamberFaction(faction?.name) || null;
      const backfill = await backfillMissedPerkGapsFromLastActiveDay(env.DB, verified.telegramId, utcDay, factionId);
      const state = await ensureDailyOpportunityStateForToday(env.DB, verified.telegramId, utcDay);
      const playerTables = await ensurePlayerStateTables(env.DB);
      const missionRows = playerTables ? [] : await env.DB.prepare(`
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
      logApiFailure('roguelite_daily_state_failed', { telegramId: verified.telegramId, message: error?.message || String(error) });
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
      try { tgBody = { telegram_auth: JSON.parse(rawAuth) }; } catch { return err('Invalid telegram_auth payload', 400); }
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
      logApiFailure('roguelite_missed_history_failed', { telegramId: verified.telegramId, message: error?.message || String(error) });
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
      const clientMissedAt = body?.missed_at && Number.isFinite(Date.parse(String(body.missed_at))) ? new Date(body.missed_at).toISOString() : null;
      const metadataBase = safeJsonParse(normaliseMissedMetadata(body?.metadata_json), {});
      const metadataObject = metadataBase && typeof metadataBase === 'object' && !Array.isArray(metadataBase) ? metadataBase : {};
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
        safety: { xp_awarded: 0, leaderboard_score_mutated: false, faction_clout_mutated: false },
      });
    } catch (error) {
      logApiFailure('roguelite_mark_missed_failed', { telegramId: verified.telegramId, message: error?.message || String(error) });
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
    if (!summary?.ok) return json(summary, 503);
    return json({ ok: true, auth_mode: authMode, ...summary });
  }

  return null;
}
