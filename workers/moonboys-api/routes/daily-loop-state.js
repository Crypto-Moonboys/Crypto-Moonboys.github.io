import { verifyTelegramIdentityFromBody } from '../blocktopia/auth.js';
import { CANONICAL_FACTION_KEYS, FACTION_UNALIGNED, normalizeFaction } from '../shared/faction-canon.js';
import { buildWtfPreviewSchedule, getWtfEventStatus } from '../shared/daily-wtf-schedule.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const REQUIRED_TABLES = Object.freeze({
  identity: ['telegram_users'],
  sam_status: [],
  faction_state: ['telegram_faction_members', 'telegram_factions', 'player_faction_signal_state'],
  daily_missions: ['player_daily_mission_state'],
  wiki_missions: ['wiki_mission_completions'],
  arcade_daily_state: ['daily_opportunity_state'],
  battle_chamber_activity: ['battle_chamber_faction_clout', 'battle_chamber_activity_log'],
  daily_wtf_status: ['daily_wtf_events', 'daily_wtf_player_events', 'daily_wtf_chain_options'],
  missed_opportunities: ['daily_missed_perks'],
  telegram_digest_group_status: ['telegram_daily_digest_log', 'telegram_group_announcement_log'],
});

export function getUtcDay(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

export function getCurrentUtcDayStartedAt(date = new Date()) {
  const now = new Date(date);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

export function getNextUtcResetTimestamp(date = new Date()) {
  const now = new Date(date);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)).toISOString();
}

export function getSecondsUntilReset(date = new Date()) {
  const resetMs = Date.parse(getNextUtcResetTimestamp(date));
  return Math.max(0, Math.floor((resetMs - new Date(date).getTime()) / 1000));
}

export function statusLive(source, detail = {}) {
  return { state: 'live', source, ...detail };
}

export function statusLiveEmpty(source, detail = {}) {
  return { state: 'live_empty', source, ...detail };
}

export function statusPreview(source, detail = {}) {
  return { state: 'preview', source, ...detail };
}

export function statusMigrationPending(detail = {}) {
  return { state: 'migration_pending', source: 'worker_d1', ...detail };
}

export function statusQueryFailed(source, detail = {}) {
  return { state: 'query_failed', source, ...detail };
}

export function statusUnavailable(reason, detail = {}) {
  return { state: 'unavailable', reason, ...detail };
}

function safeJsonParse(raw, fallback) {
  try { return raw != null ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function normalizeBattleFaction(value) {
  const normalized = normalizeFaction(value);
  return CANONICAL_FACTION_KEYS.includes(normalized) ? normalized : null;
}

async function hasTable(db, tableName) {
  try {
    const row = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`
    ).bind(tableName).first();
    return { ok: true, exists: !!row?.name };
  } catch (error) {
    return { ok: false, exists: false, error };
  }
}

async function getTableStatus(db, subsystem) {
  const tables = REQUIRED_TABLES[subsystem] || [];
  if (!tables.length) return statusLive('worker_api');
  const missing = [];
  for (const tableName of tables) {
    const table = await hasTable(db, tableName);
    if (!table.ok) return statusQueryFailed('worker_d1', { stage: 'table_check', table: tableName, error: table.error?.message || String(table.error) });
    if (!table.exists) missing.push(tableName);
  }
  if (missing.length) return statusMigrationPending({ missing_tables: missing });
  return statusLiveEmpty('worker_d1', { tables, reason: 'tables_ready' });
}

async function queryAll(db, sourceStatus, subsystem, statement, params = []) {
  try {
    return { ok: true, rows: (await db.prepare(statement).bind(...params).all())?.results || [] };
  } catch (error) {
    sourceStatus[subsystem] = statusQueryFailed('worker_d1', { error: error?.message || String(error) });
    return { ok: false, rows: [] };
  }
}

async function queryFirst(db, sourceStatus, subsystem, statement, params = []) {
  try {
    return { ok: true, row: await db.prepare(statement).bind(...params).first() };
  } catch (error) {
    sourceStatus[subsystem] = statusQueryFailed('worker_d1', { error: error?.message || String(error) });
    return { ok: false, row: null };
  }
}

function formatMissionIdLabel(missionId) {
  const base = String(missionId || '').replace(/[_-]+/g, ' ').trim();
  if (!base) return 'Mission';
  return base.replace(/\b\w/g, (m) => m.toUpperCase()).slice(0, 60);
}

function canQuery(sourceStatus, subsystem) {
  return ['live_empty', 'preview', 'live'].includes(sourceStatus[subsystem]?.state);
}

function getIsoWeekKey(date = new Date()) {
  const d = new Date(date);
  const dow = d.getUTCDay() || 7;
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (4 - dow)));
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thu - yearStart) / DAY_MS + 1) / 7);
  return `${thu.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function battlePeriodKey(period, date = new Date()) {
  const now = new Date(date);
  if (period === 'daily') return getUtcDay(now);
  if (period === 'weekly') return getIsoWeekKey(now);
  if (period === 'monthly') return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const seasonEpochMs = Date.UTC(2024, 0, 1);
  const seasonIndex = Math.floor((now.getTime() - seasonEpochMs) / (90 * DAY_MS)) + 1;
  return `S${Math.max(1, seasonIndex)}`;
}

async function ensureDailyOpportunityState(db, telegramId, utcDay) {
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO daily_opportunity_state
      (telegram_id, utc_day, daily_seed, chain_depth, activated_at, last_roll_at, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, NULL, ?, ?)
    ON CONFLICT(telegram_id, utc_day) DO NOTHING
  `).bind(String(telegramId), utcDay, crypto.randomUUID(), now, now, now).run();
  return db.prepare(`
    SELECT telegram_id, utc_day, daily_seed, chain_depth, activated_at, last_roll_at, created_at, updated_at
    FROM daily_opportunity_state
    WHERE telegram_id = ? AND utc_day = ?
    LIMIT 1
  `).bind(String(telegramId), utcDay).first();
}

function emptyLoopState({ utcDay, dayStartedAt, resetAt, secondsUntilReset, sourceStatus, nowMs }) {
  return {
    ok: true,
    utc_day: utcDay,
    current_utc_day_started_at: dayStartedAt,
    next_utc_reset_at: resetAt,
    seconds_until_reset: secondsUntilReset,
    identity: { linked: false, auth_mode: 'anonymous', message: 'Anonymous daily-loop state. Telegram-linked personal state requires POST telegram_auth.' },
    sam_status: { ok: true, message: 'SAM active and monitoring the wiki.' },
    faction_state: { linked: false, faction_id: null, today: {}, week: {} },
    daily_missions: { linked: false, utc_day: utcDay, items: [] },
    wiki_missions: { linked: false, utc_day: utcDay, items: [] },
    arcade_daily_state: { linked: false, utc_day: utcDay, daily_seed: null, chain_depth: 0, label: 'unavailable' },
    battle_chamber_activity: { period: 'weekly', period_key: battlePeriodKey('weekly', new Date(nowMs)), standings: [], recent_activity: [] },
    daily_wtf_status: { utc_day: utcDay, events: buildWtfPreviewSchedule(utcDay, nowMs), label: 'preview' },
    missed_opportunities: { linked: false, utc_day: utcDay, total_today: 0, total_all_time: 0, items: [] },
    telegram_digest_group_status: { linked: false, digest: null, group_announcements: [] },
    source_status: sourceStatus,
  };
}

export async function buildDailyLoopState(env, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const nowMs = now.getTime();
  const utcDay = getUtcDay(now);
  const dayStartedAt = getCurrentUtcDayStartedAt(now);
  const resetAt = getNextUtcResetTimestamp(now);
  const secondsUntilReset = getSecondsUntilReset(now);
  const sourceStatus = {};
  const db = env.DB;
  const state = emptyLoopState({ utcDay, dayStartedAt, resetAt, secondsUntilReset, sourceStatus, nowMs });

  for (const subsystem of Object.keys(REQUIRED_TABLES)) {
    sourceStatus[subsystem] = await getTableStatus(db, subsystem);
  }

  if (canQuery(sourceStatus, 'battle_chamber_activity')) {
    const period = 'weekly';
    const periodKey = battlePeriodKey(period, now);
    const standingRows = await queryAll(db, sourceStatus, 'battle_chamber_activity', `
        SELECT faction_id, clout_total, contribution_total, mission_total, score_total, member_count, updated_at
        FROM battle_chamber_faction_clout
        WHERE period_type = ? AND period_key = ?
      `, [period, periodKey]);
    const activityRows = await queryAll(db, sourceStatus, 'battle_chamber_activity', `
        SELECT id, telegram_id, display_name, faction_id, event_type, event_text, clout_delta, source, metadata_json, created_at
        FROM battle_chamber_activity_log
        ORDER BY created_at DESC, id DESC
        LIMIT 10
      `);
    if (standingRows.ok && activityRows.ok) {
      const byFaction = {};
      for (const row of standingRows.rows) byFaction[row.faction_id] = row;
      sourceStatus.battle_chamber_activity = standingRows.rows.length || activityRows.rows.length
        ? statusLive('worker_d1', { period, period_key: periodKey })
        : statusLiveEmpty('worker_d1', { period, period_key: periodKey, reason: 'no_battle_chamber_rows' });
      state.battle_chamber_activity = {
        period,
        period_key: periodKey,
        standings: CANONICAL_FACTION_KEYS.map((factionId) => {
          const row = byFaction[factionId] || {};
          return {
            faction_id: factionId,
            clout_total: Number(row.clout_total) || 0,
            contribution_total: Number(row.contribution_total) || 0,
            mission_total: Number(row.mission_total) || 0,
            score_total: Number(row.score_total) || 0,
            member_count: Number(row.member_count) || 0,
            updated_at: row.updated_at || null,
          };
        }).sort((a, b) => (b.clout_total - a.clout_total) || a.faction_id.localeCompare(b.faction_id)),
        recent_activity: activityRows.rows.map((row) => ({
          id: row.id,
          display_name: row.display_name || row.telegram_id,
          faction_id: row.faction_id,
          event_type: row.event_type,
          event_text: row.event_text,
          clout_delta: Number(row.clout_delta) || 0,
          source: row.source || null,
          metadata: safeJsonParse(row.metadata_json, {}),
          created_at: row.created_at || null,
        })),
      };
      state.battle_chamber_activity.standings.forEach((row, index) => { row.rank = index + 1; });
    }
  }

  if (canQuery(sourceStatus, 'daily_wtf_status')) {
    const rows = await queryAll(db, sourceStatus, 'daily_wtf_status', `
      SELECT event_id, utc_day, event_type, title, description, starts_at, ends_at, required_action, reward_key, xp_multiplier_display, theme
      FROM daily_wtf_events
      WHERE utc_day = ?
      ORDER BY starts_at ASC
    `, [utcDay]);
    if (!rows.ok) {
      // Keep the default preview payload visible, but make the source failure explicit.
    } else {
    const persisted = rows.rows;
    if (persisted.length) {
      sourceStatus.daily_wtf_status = statusLive('worker_d1', { rows: persisted.length });
      state.daily_wtf_status = {
        utc_day: utcDay,
        label: 'live',
        events: persisted.map((row) => ({
          event_id: row.event_id,
          utc_day: row.utc_day,
          event_type: row.event_type,
          title: row.title,
          description: row.description || null,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          required_action: row.required_action,
          reward_preview: row.reward_key,
          multiplier_display: row.xp_multiplier_display || null,
          theme: row.theme || null,
          status: getWtfEventStatus(nowMs, row.starts_at, row.ends_at, 'upcoming'),
          source_label: 'live',
        })),
      };
    } else {
      sourceStatus.daily_wtf_status = statusPreview('server_schedule', { reason: 'no_persisted_d1_events_for_utc_day' });
    }
    }
  }

  if (canQuery(sourceStatus, 'telegram_digest_group_status')) {
    const announcements = await queryAll(db, sourceStatus, 'telegram_digest_group_status', `
      SELECT announcement_key, utc_day, event_id, announcement_type, scheduled_for, sent_at, status, error_message
      FROM telegram_group_announcement_log
      WHERE utc_day = ?
      ORDER BY scheduled_for ASC
      LIMIT 20
    `, [utcDay]);
    if (announcements.ok) {
    sourceStatus.telegram_digest_group_status = announcements.rows.length
      ? statusLive('worker_d1', { rows: announcements.rows.length, scope: 'public_group_announcements' })
      : statusLiveEmpty('worker_d1', { reason: 'no_group_announcements_for_utc_day' });
    state.telegram_digest_group_status = {
      linked: false,
      digest: null,
      group_announcements: announcements.rows.map((row) => ({
        announcement_key: row.announcement_key,
        utc_day: row.utc_day,
        event_id: row.event_id || null,
        announcement_type: row.announcement_type,
        scheduled_for: row.scheduled_for,
        sent_at: row.sent_at || null,
        status: row.status,
        error_message: row.error_message || null,
      })),
    };
    }
  }

  if (!options.verified) {
    return state;
  }

  const verified = options.verified;
  const telegramId = String(verified.telegramId);
  state.identity = {
    linked: true,
    auth_mode: 'telegram_verified',
    telegram_id: telegramId,
    username: verified.user?.username || null,
    first_name: verified.user?.first_name || null,
    last_name: verified.user?.last_name || null,
  };

  if (canQuery(sourceStatus, 'identity')) {
    const userResult = await queryFirst(db, sourceStatus, 'identity', `
      SELECT telegram_id, username, first_name, last_name, xp, level, created_at
      FROM telegram_users
      WHERE telegram_id = ?
      LIMIT 1
    `, [telegramId]);
    const user = userResult.row;
    if (userResult.ok) {
      sourceStatus.identity = user
        ? statusLive('worker_d1', { telegram_id: telegramId })
        : statusLiveEmpty('worker_d1', { telegram_id: telegramId, reason: 'verified_user_not_yet_persisted' });
    if (user) {
      state.identity.profile = {
        telegram_id: user.telegram_id,
        username: user.username || null,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        xp: Number(user.xp) || 0,
        level: Number(user.level) || 1,
        created_at: user.created_at || null,
      };
    }
    }
  }

  if (canQuery(sourceStatus, 'faction_state')) {
    const factionResult = await queryFirst(db, sourceStatus, 'faction_state', `
        SELECT f.id, f.name, f.description, f.icon, fm.role, fm.joined_at
        FROM telegram_faction_members fm
        JOIN telegram_factions f ON f.id = fm.faction_id
        WHERE fm.telegram_id = ?
        LIMIT 1
      `, [telegramId]);
    const todayRows = await queryAll(db, sourceStatus, 'faction_state', `
        SELECT faction_id, contribution
        FROM player_faction_signal_state
        WHERE telegram_id = ? AND day_key = ?
      `, [telegramId, utcDay]);
    const weekRows = await queryAll(db, sourceStatus, 'faction_state', `
        SELECT faction_id, SUM(contribution) AS contribution
        FROM player_faction_signal_state
        WHERE telegram_id = ? AND week_key = ?
        GROUP BY faction_id
      `, [telegramId, getIsoWeekKey(now)]);
    if (factionResult.ok && todayRows.ok && weekRows.ok) {
    const faction = factionResult.row;
    const today = {};
    const week = {};
    for (const row of todayRows.rows) today[row.faction_id] = Number(row.contribution) || 0;
    for (const row of weekRows.rows) week[row.faction_id] = Number(row.contribution) || 0;
    sourceStatus.faction_state = faction || todayRows.rows.length || weekRows.rows.length
      ? statusLive('worker_d1', { telegram_id: telegramId })
      : statusLiveEmpty('worker_d1', { telegram_id: telegramId, reason: 'no_faction_or_signal_for_utc_day' });
    state.faction_state = {
      linked: true,
      faction_id: normalizeBattleFaction(faction?.id || faction?.name) || FACTION_UNALIGNED,
      label: faction?.name || 'Unaligned',
      role: faction?.role || null,
      joined_at: faction?.joined_at || null,
      today,
      week,
    };
    }
  }

  if (canQuery(sourceStatus, 'arcade_daily_state')) {
    let row = null;
    try {
      row = await ensureDailyOpportunityState(db, telegramId, utcDay);
      sourceStatus.arcade_daily_state = row
        ? statusLive('worker_d1', { telegram_id: telegramId, utc_day: utcDay })
        : statusLiveEmpty('worker_d1', { telegram_id: telegramId, utc_day: utcDay, reason: 'daily_opportunity_not_created' });
    } catch (error) {
      sourceStatus.arcade_daily_state = statusQueryFailed('worker_d1', { error: error?.message || String(error) });
    }
    state.arcade_daily_state = {
      linked: true,
      utc_day: utcDay,
      daily_seed: row?.daily_seed || null,
      chain_depth: Math.max(0, Math.floor(Number(row?.chain_depth) || 0)),
      activated_at: row?.activated_at || null,
      last_roll_at: row?.last_roll_at || null,
      label: row ? 'live' : 'unavailable',
    };
  }

  if (canQuery(sourceStatus, 'daily_missions')) {
    const rows = await queryAll(db, sourceStatus, 'daily_missions', `
      SELECT mission_id, progress, completed, updated_at
      FROM player_daily_mission_state
      WHERE telegram_id = ? AND mission_date = ?
      ORDER BY mission_id ASC
    `, [telegramId, utcDay]);
    if (rows.ok) {
    sourceStatus.daily_missions = rows.rows.length
      ? statusLive('worker_d1', { rows: rows.rows.length, utc_day: utcDay })
      : statusLiveEmpty('worker_d1', { utc_day: utcDay, reason: 'no_daily_missions_for_player' });
    state.daily_missions = {
      linked: true,
      utc_day: utcDay,
      items: rows.rows.map((row) => ({
        mission_id: row.mission_id,
        title: formatMissionIdLabel(row.mission_id),
        progress: Number(row.progress) || 0,
        completed: Number(row.completed) === 1,
        updated_at: row.updated_at || null,
      })),
    };
    }
  }

  if (canQuery(sourceStatus, 'wiki_missions')) {
    const rows = await queryAll(db, sourceStatus, 'wiki_missions', `
      SELECT page_id, mission_id, xp_awarded, source, source_id, created_at
      FROM wiki_mission_completions
      WHERE telegram_id = ? AND mission_window = ?
      ORDER BY created_at DESC
      LIMIT 20
    `, [telegramId, utcDay]);
    if (rows.ok) {
    sourceStatus.wiki_missions = rows.rows.length
      ? statusLive('worker_d1', { rows: rows.rows.length, utc_day: utcDay })
      : statusLiveEmpty('worker_d1', { utc_day: utcDay, reason: 'no_wiki_missions_for_player' });
    state.wiki_missions = {
      linked: true,
      utc_day: utcDay,
      items: rows.rows.map((row) => ({
        page_id: row.page_id,
        mission_id: row.mission_id,
        xp_awarded: Number(row.xp_awarded) || 0,
        source: row.source || null,
        source_id: row.source_id || null,
        completed_at: row.created_at || null,
      })),
    };
    }
  }

  if (canQuery(sourceStatus, 'missed_opportunities')) {
    const todayTotal = await queryFirst(db, sourceStatus, 'missed_opportunities', `SELECT COUNT(*) AS total FROM daily_missed_perks WHERE telegram_id = ? AND utc_day = ?`, [telegramId, utcDay]);
    const allTimeTotal = await queryFirst(db, sourceStatus, 'missed_opportunities', `SELECT COUNT(*) AS total FROM daily_missed_perks WHERE telegram_id = ?`, [telegramId]);
    const rows = await queryAll(db, sourceStatus, 'missed_opportunities', `
        SELECT id, utc_day, faction_id, source, opportunity_type, title, description, missed_reason, status_value, metadata_json, missed_at, created_at
        FROM daily_missed_perks
        WHERE telegram_id = ?
        ORDER BY missed_at DESC, id DESC
        LIMIT 10
      `, [telegramId]);
    if (todayTotal.ok && allTimeTotal.ok && rows.ok) {
    sourceStatus.missed_opportunities = rows.rows.length || Number(todayTotal.row?.total) || Number(allTimeTotal.row?.total)
      ? statusLive('worker_d1', { utc_day: utcDay })
      : statusLiveEmpty('worker_d1', { utc_day: utcDay, reason: 'no_missed_opportunities_for_player' });
    state.missed_opportunities = {
      linked: true,
      utc_day: utcDay,
      total_today: Number(todayTotal.row?.total) || 0,
      total_all_time: Number(allTimeTotal.row?.total) || 0,
      items: rows.rows.map((row) => ({
        id: row.id,
        utc_day: row.utc_day,
        faction_id: row.faction_id || null,
        source: row.source,
        opportunity_type: row.opportunity_type,
        title: row.title,
        description: row.description || null,
        missed_reason: row.missed_reason || null,
        status_value: Number(row.status_value) || 0,
        metadata: safeJsonParse(row.metadata_json, {}),
        missed_at: row.missed_at || null,
        created_at: row.created_at || null,
      })),
    };
    }
  }

  if (sourceStatus.daily_wtf_status.state === 'live') {
    const playerRows = await queryAll(db, sourceStatus, 'daily_wtf_status', `
      SELECT event_id, status, checked_in_at, completed_at, missed_at, chain_depth, reward_status
      FROM daily_wtf_player_events
      WHERE telegram_id = ? AND utc_day = ?
    `, [telegramId, utcDay]);
    if (playerRows.ok) {
    const byEvent = {};
    for (const row of playerRows.rows) byEvent[row.event_id] = row;
    state.daily_wtf_status.events = state.daily_wtf_status.events.map((event) => {
      const player = byEvent[event.event_id] || null;
      return {
        ...event,
        player_status: player?.completed_at ? 'completed' : (player?.status || 'not_checked_in'),
        checked_in_at: player?.checked_in_at || null,
        completed_at: player?.completed_at || null,
        missed_at: player?.missed_at || null,
        chain_depth: Number(player?.chain_depth) || 0,
        reward_status: player?.reward_status || 'none',
      };
    });
    }
  }

  if (canQuery(sourceStatus, 'telegram_digest_group_status')) {
    const digest = await queryFirst(db, sourceStatus, 'telegram_digest_group_status', `
        SELECT status, sent_at, error_message, metadata_json, updated_at
        FROM telegram_daily_digest_log
        WHERE telegram_id = ? AND utc_day = ?
        LIMIT 1
      `, [telegramId, utcDay]);
    const announcements = await queryAll(db, sourceStatus, 'telegram_digest_group_status', `
        SELECT announcement_key, utc_day, event_id, announcement_type, scheduled_for, sent_at, status, error_message
        FROM telegram_group_announcement_log
        WHERE utc_day = ?
        ORDER BY scheduled_for ASC
        LIMIT 20
      `, [utcDay]);
    if (digest.ok && announcements.ok) {
    sourceStatus.telegram_digest_group_status = digest.row || announcements.rows.length
      ? statusLive('worker_d1', { utc_day: utcDay })
      : statusLiveEmpty('worker_d1', { utc_day: utcDay, reason: 'no_digest_or_group_announcements_for_utc_day' });
    state.telegram_digest_group_status = {
      linked: true,
      digest: digest.row ? {
        status: digest.row.status,
        sent_today: digest.row.status === 'sent',
        sent_at: digest.row.sent_at || null,
        error_message: digest.row.error_message || null,
        metadata: safeJsonParse(digest.row.metadata_json, {}),
        updated_at: digest.row.updated_at || null,
      } : { status: null, sent_today: false, sent_at: null, error_message: null },
      group_announcements: announcements.rows.map((row) => ({
        announcement_key: row.announcement_key,
        utc_day: row.utc_day,
        event_id: row.event_id || null,
        announcement_type: row.announcement_type,
        scheduled_for: row.scheduled_for,
        sent_at: row.sent_at || null,
        status: row.status,
        error_message: row.error_message || null,
      })),
    };
    }
  }

  return state;
}

export async function handleDailyLoopStateRoute(request, env, helpers = {}) {
  const url = new URL(request.url);
  const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');
  if (path !== '/daily-loop/state' || !['GET', 'POST'].includes(request.method)) return null;
  if (!env.DB) return helpers.err ? helpers.err('D1 binding unavailable', 503) : new Response('D1 binding unavailable', { status: 503 });

  if (request.method === 'GET') {
    return helpers.json(await buildDailyLoopState(env));
  }

  let body = {};
  try { body = await request.json(); } catch { return helpers.err('Invalid JSON', 400); }
  const verified = await verifyTelegramIdentityFromBody(body, env, helpers.verifyTelegramAuth);
  if (verified.error) return helpers.err(verified.error, verified.status || 401);
  if (typeof helpers.upsertTelegramUser === 'function') {
    await helpers.upsertTelegramUser(env.DB, verified.user).catch((error) => {
      if (typeof helpers.logApiFailure === 'function') {
        helpers.logApiFailure('daily_loop_upsert_user_failed', { telegramId: verified.telegramId, message: error?.message || String(error) });
      }
    });
  }
  return helpers.json(await buildDailyLoopState(env, { verified }));
}
