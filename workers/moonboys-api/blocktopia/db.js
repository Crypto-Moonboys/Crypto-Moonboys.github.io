import { BLOCKTOPIA_ARCADE_MAX_REWARDS_PER_GAME_PER_HOUR, BLOCKTOPIA_RATE_LIMIT_PER_MIN } from './config.js';

export async function getOrCreateBlockTopiaProgression(db, telegramId) {
  await db.prepare(`
    INSERT INTO blocktopia_progression (
      telegram_id, xp, gems, tier, win_streak,
      upgrade_efficiency, upgrade_signal, upgrade_defense, upgrade_gem, upgrade_npc, rpg_mode_active,
      faction, faction_xp, faction_last_switch
    )
    VALUES (?, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 'unaligned', 0, NULL)
    ON CONFLICT(telegram_id) DO NOTHING
  `).bind(telegramId).run();
  const row = await db.prepare(
    `SELECT telegram_id, xp, gems, tier, win_streak,
            upgrade_efficiency, upgrade_signal, upgrade_defense, upgrade_gem, upgrade_npc,
            rpg_mode_active, faction, faction_xp, faction_last_switch, last_active, updated_at
     FROM blocktopia_progression WHERE telegram_id = ?`
  ).bind(telegramId).first();
  return row || {
    telegram_id: telegramId,
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
    last_active: new Date().toISOString(),
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
