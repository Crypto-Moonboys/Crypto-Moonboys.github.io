import { BLOCKTOPIA_ARCADE_MAX_REWARDS_PER_GAME_PER_HOUR, BLOCKTOPIA_RATE_LIMIT_PER_MIN } from './config.js';

const PROGRESSION_SCHEMA_CACHE = new WeakMap();
const PROGRESSION_SCHEMA_CACHE_TTL_MS = 60 * 1000;

const BASE_PROGRESSION_DEFAULTS = {
  xp: 0,
  gems: 0,
  tier: 1,
  win_streak: 0,
  upgrade_efficiency: 0,
  upgrade_signal: 0,
  upgrade_defense: 0,
  upgrade_gem: 0,
  upgrade_npc: 0,
  rpg_mode_active: 0,
  faction: 'unaligned',
  faction_xp: 0,
  faction_last_switch: null,
  network_heat: 0,
  network_heat_updated_at: null,
  last_active: null,
  updated_at: null,
};

async function getBlockTopiaProgressionSchema(db, { forceRefresh = false } = {}) {
  const cached = PROGRESSION_SCHEMA_CACHE.get(db);
  if (!forceRefresh && cached && (Date.now() - cached.loadedAt) < PROGRESSION_SCHEMA_CACHE_TTL_MS) {
    return cached.schema;
  }

  const rows = await db.prepare(`PRAGMA table_info(blocktopia_progression)`).all().catch(() => ({ results: [] }));
  const columns = new Set((rows?.results || []).map((row) => String(row.name || '').trim()).filter(Boolean));
  const schema = {
    columns,
    hasFaction: columns.has('faction'),
    hasFactionXp: columns.has('faction_xp'),
    hasFactionLastSwitch: columns.has('faction_last_switch'),
    hasNetworkHeat: columns.has('network_heat'),
    hasNetworkHeatUpdatedAt: columns.has('network_heat_updated_at'),
  };

  PROGRESSION_SCHEMA_CACHE.set(db, {
    loadedAt: Date.now(),
    schema,
  });
  return schema;
}

export async function hasBlockTopiaFactionColumns(db) {
  const schema = await getBlockTopiaProgressionSchema(db);
  return schema.hasFaction && schema.hasFactionXp && schema.hasFactionLastSwitch;
}

export async function getOrCreateBlockTopiaProgression(db, telegramId) {
  const schema = await getBlockTopiaProgressionSchema(db).catch(() => ({
    columns: new Set(),
    hasFaction: false,
    hasFactionXp: false,
    hasFactionLastSwitch: false,
    hasNetworkHeat: false,
    hasNetworkHeatUpdatedAt: false,
  }));
  const insertColumns = [
    'telegram_id',
    'xp',
    'gems',
    'tier',
    'win_streak',
    'upgrade_efficiency',
    'upgrade_signal',
    'upgrade_defense',
    'upgrade_gem',
    'upgrade_npc',
    'rpg_mode_active',
  ];
  const insertPlaceholders = ['?', '0', '0', '1', '0', '0', '0', '0', '0', '0', '0'];

  if (schema.hasFaction) {
    insertColumns.push('faction');
    insertPlaceholders.push(`'unaligned'`);
  }
  if (schema.hasFactionXp) {
    insertColumns.push('faction_xp');
    insertPlaceholders.push('0');
  }
  if (schema.hasFactionLastSwitch) {
    insertColumns.push('faction_last_switch');
    insertPlaceholders.push('NULL');
  }
  if (schema.hasNetworkHeat) {
    insertColumns.push('network_heat');
    insertPlaceholders.push('0');
  }
  if (schema.hasNetworkHeatUpdatedAt) {
    insertColumns.push('network_heat_updated_at');
    insertPlaceholders.push('CURRENT_TIMESTAMP');
  }

  await db.prepare(`
    INSERT INTO blocktopia_progression (${insertColumns.join(', ')})
    VALUES (${insertPlaceholders.join(', ')})
    ON CONFLICT(telegram_id) DO NOTHING
  `).bind(telegramId).run();

  const selectColumns = [
    'telegram_id',
    'xp',
    'gems',
    'tier',
    'win_streak',
    'upgrade_efficiency',
    'upgrade_signal',
    'upgrade_defense',
    'upgrade_gem',
    'upgrade_npc',
    'rpg_mode_active',
    'last_active',
    'updated_at',
  ];
  if (schema.hasFaction) selectColumns.push('faction');
  if (schema.hasFactionXp) selectColumns.push('faction_xp');
  if (schema.hasFactionLastSwitch) selectColumns.push('faction_last_switch');
  if (schema.hasNetworkHeat) selectColumns.push('network_heat');
  if (schema.hasNetworkHeatUpdatedAt) selectColumns.push('network_heat_updated_at');

  const row = await db.prepare(
    `SELECT ${selectColumns.join(', ')}
     FROM blocktopia_progression WHERE telegram_id = ?`
  ).bind(telegramId).first();

  return {
    telegram_id: telegramId,
    ...BASE_PROGRESSION_DEFAULTS,
    network_heat_updated_at: new Date().toISOString(),
    last_active: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(row || {}),
  };
}

export async function enforceProgressionRateLimit(db, telegramId) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n
     FROM blocktopia_progression_events
     WHERE telegram_id = ? AND created_at >= datetime('now', '-60 seconds')`
  ).bind(telegramId).first().catch(() => ({ n: 0 }));
  return Number(row?.n || 0) < BLOCKTOPIA_RATE_LIMIT_PER_MIN;
}

export async function enforceArcadeGameHourlyLimit(db, telegramId, game) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n
     FROM blocktopia_progression_events
     WHERE telegram_id = ?
       AND action = 'arcade_score'
       AND action_type = ?
       AND created_at >= datetime('now', '-1 hour')`
  ).bind(telegramId, game).first().catch(() => ({ n: 0 }));
  return Number(row?.n || 0) < BLOCKTOPIA_ARCADE_MAX_REWARDS_PER_GAME_PER_HOUR;
}

export async function getArcadeXpAwardedLastMinute(db, telegramId) {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(xp_change), 0) AS total
     FROM blocktopia_progression_events
     WHERE telegram_id = ?
       AND action = 'arcade_score'
       AND created_at >= datetime('now', '-60 seconds')`
  ).bind(telegramId).first().catch(() => ({ total: 0 }));
  return Number(row?.total || 0);
}

export async function hasArcadeScoreBeenRewarded(db, telegramId, game, score) {
  const row = await db.prepare(
    `SELECT id
     FROM blocktopia_progression_events
     WHERE telegram_id = ?
       AND action = 'arcade_score'
       AND action_type = ?
       AND score = ?
     LIMIT 1`
  ).bind(telegramId, game, score).first().catch(() => null);
  return !!row?.id;
}
