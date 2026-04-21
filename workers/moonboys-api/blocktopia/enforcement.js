import {
  GEM_SOFT_CAP,
  GEMS_MAX,
  GEMS_MIN,
  PPS_ACTIONS_PER_MINUTE_THRESHOLD,
  PPS_ACTION_WINDOW_MINUTES,
  PPS_COOLDOWN_THRESHOLD,
  PPS_DECAY_PER_MINUTE,
  PPS_IDLE_DECAY_PER_MINUTE,
  PPS_IDLE_THRESHOLD_MS,
  PPS_MAX,
  PPS_REPEAT_TARGET_WINDOW_MINUTES,
  PPS_SKIP_WINDOW_MINUTES,
  XP_HARD_CAP_PER_DAY,
  XP_MAX,
  XP_MIN,
  XP_SOFT_CAP_PER_HOUR,
} from './config.js';

const COOLDOWN_LADDER_MS = [
  2 * 60 * 1000,
  10 * 60 * 1000,
  60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseTimestamp(value, fallbackMs = Date.now()) {
  const text = String(value || '').trim();
  if (!text) return fallbackMs;
  const normalized = text.includes('T') ? text : `${text.replace(' ', 'T')}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

function sqliteNow(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().replace('T', ' ').slice(0, 19);
}

function serializeReason(reason, metadata = {}) {
  try {
    return JSON.stringify({
      reason,
      ...metadata,
    });
  } catch {
    return reason || null;
  }
}

export function computePressureDecay(row = {}, nowMs = Date.now()) {
  const previous = clamp(Number(row?.player_pressure_score) || 0, 0, PPS_MAX);
  const updatedAtMs = parseTimestamp(row?.pps_updated_at, nowMs);
  const elapsedMinutes = Math.max(0, Math.floor((nowMs - updatedAtMs) / 60000));
  if (elapsedMinutes <= 0) {
    return {
      previous,
      decayed: previous,
      decayApplied: 0,
      idle: (nowMs - parseTimestamp(row?.last_active, nowMs)) >= PPS_IDLE_THRESHOLD_MS,
    };
  }
  const lastActiveMs = parseTimestamp(row?.last_active, updatedAtMs);
  const idle = (nowMs - lastActiveMs) >= PPS_IDLE_THRESHOLD_MS;
  const decayPerMinute = idle ? PPS_IDLE_DECAY_PER_MINUTE : PPS_DECAY_PER_MINUTE;
  const decayApplied = elapsedMinutes * decayPerMinute;
  return {
    previous,
    decayed: clamp(previous - decayApplied, 0, PPS_MAX),
    decayApplied,
    idle,
  };
}

export function getPpsTier(pps) {
  const value = Math.max(0, Number(pps) || 0);
  if (value >= 100) return { key: 'strike', xpMultiplier: 0, detectionBonus: 20, forcedCooldown: true };
  if (value >= 80) return { key: 'lock', xpMultiplier: 0, detectionBonus: 14, forcedCooldown: true };
  if (value >= 60) return { key: 'high', xpMultiplier: 0.5, detectionBonus: 9, forcedCooldown: false };
  if (value >= 30) return { key: 'warm', xpMultiplier: 0.8, detectionBonus: 4, forcedCooldown: false };
  return { key: 'normal', xpMultiplier: 1, detectionBonus: 0, forcedCooldown: false };
}

export function getNetworkHeatTier(networkHeat) {
  return clamp(Math.floor((Number(networkHeat) || 0) / 20), 0, 5);
}

export function getCooldownState(row = {}, nowMs = Date.now()) {
  const strikes = Math.max(0, Math.floor(Number(row?.cooldown_strikes) || 0));
  if (strikes <= 0 || !row?.last_cooldown_at) {
    return {
      active: false,
      strikes,
      level: 0,
      startedAt: null,
      endsAt: null,
      remainingMs: 0,
      lockMs: 0,
      reason: '',
    };
  }
  const startedAtMs = parseTimestamp(row.last_cooldown_at, nowMs);
  const level = clamp(strikes, 1, COOLDOWN_LADDER_MS.length);
  const lockMs = COOLDOWN_LADDER_MS[level - 1];
  const endsAtMs = startedAtMs + lockMs;
  return {
    active: endsAtMs > nowMs,
    strikes,
    level,
    startedAt: new Date(startedAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    remainingMs: Math.max(0, endsAtMs - nowMs),
    lockMs,
    reason: 'pps_cooldown',
  };
}

export async function logProgressionEvent(db, telegramId, action, actionType, xpChange = 0, gemsChange = 0, metadata = {}) {
  const reason = metadata?.reason ? serializeReason(metadata.reason, metadata) : serializeReason('', metadata);
  try {
    await db.prepare(`
      INSERT INTO blocktopia_progression_events
        (id, telegram_id, action, action_type, score, xp_change, gems_change, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      telegramId,
      action,
      actionType || null,
      0,
      Math.floor(Number(xpChange) || 0),
      Math.floor(Number(gemsChange) || 0),
      reason || null,
    ).run();
  } catch {
    await db.prepare(`
      INSERT INTO blocktopia_progression_events
        (id, telegram_id, action, action_type, score, xp_change, gems_change)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      telegramId,
      action,
      actionType || null,
      0,
      Math.floor(Number(xpChange) || 0),
      Math.floor(Number(gemsChange) || 0),
    ).run();
  }
}

export async function syncPressureDecay(db, row, nowMs = Date.now()) {
  const decay = computePressureDecay(row, nowMs);
  if (decay.decayed === decay.previous) {
    return {
      ...row,
      player_pressure_score: decay.decayed,
    };
  }
  await db.prepare(`
    UPDATE blocktopia_progression
    SET player_pressure_score = ?, pps_updated_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `).bind(decay.decayed, sqliteNow(nowMs), row.telegram_id).run();
  return {
    ...row,
    player_pressure_score: decay.decayed,
    pps_updated_at: sqliteNow(nowMs),
  };
}

export async function applyPressureDelta(db, row, delta, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const decayedRow = await syncPressureDecay(db, row, nowMs);
  const before = clamp(Number(decayedRow?.player_pressure_score) || 0, 0, PPS_MAX);
  const after = clamp(before + Math.floor(Number(delta) || 0), 0, PPS_MAX);
  if (after === before) {
    return {
      row: decayedRow,
      before,
      after,
      deltaApplied: 0,
      tier: getPpsTier(after),
      cooldown: getCooldownState(decayedRow, nowMs),
    };
  }
  await db.prepare(`
    UPDATE blocktopia_progression
    SET player_pressure_score = ?, pps_updated_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `).bind(after, sqliteNow(nowMs), row.telegram_id).run();
  if (options.log !== false && delta > 0) {
    await logProgressionEvent(db, row.telegram_id, 'pps_increase', options.actionType || 'pressure', 0, 0, {
      reason: options.reason || 'pressure_increase',
      before,
      after,
      delta: after - before,
      ...options.metadata,
    });
  }
  const nextRow = {
    ...decayedRow,
    player_pressure_score: after,
    pps_updated_at: sqliteNow(nowMs),
  };
  return {
    row: nextRow,
    before,
    after,
    deltaApplied: after - before,
    tier: getPpsTier(after),
    cooldown: getCooldownState(nextRow, nowMs),
  };
}

export async function triggerCooldownStrike(db, row, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const decayedRow = await syncPressureDecay(db, row, nowMs);
  const nextStrikes = Math.max(1, Math.floor(Number(decayedRow?.cooldown_strikes) || 0) + 1);
  const postStrikePps = clamp(Math.max(80, Number(options.postStrikePps) || 80), 0, PPS_MAX);
  await db.prepare(`
    UPDATE blocktopia_progression
    SET cooldown_strikes = ?, last_cooldown_at = ?, player_pressure_score = ?, pps_updated_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `).bind(nextStrikes, sqliteNow(nowMs), postStrikePps, sqliteNow(nowMs), row.telegram_id).run();
  const nextRow = {
    ...decayedRow,
    cooldown_strikes: nextStrikes,
    last_cooldown_at: sqliteNow(nowMs),
    player_pressure_score: postStrikePps,
    pps_updated_at: sqliteNow(nowMs),
  };
  const cooldown = getCooldownState(nextRow, nowMs);
  await logProgressionEvent(db, row.telegram_id, 'cooldown_trigger', options.actionType || 'cooldown', 0, 0, {
    reason: options.reason || 'pps_threshold_reached',
    strikes: nextStrikes,
    cooldown_ms: cooldown.lockMs,
    remaining_ms: cooldown.remainingMs,
    ...options.metadata,
  });
  return {
    row: nextRow,
    cooldown,
  };
}

async function readRewardWindowTotals(db, telegramId) {
  const [hourRow, dayRow] = await Promise.all([
    db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN xp_change > 0 THEN xp_change ELSE 0 END), 0) AS xp,
             COALESCE(SUM(CASE WHEN gems_change > 0 THEN gems_change ELSE 0 END), 0) AS gems
      FROM blocktopia_progression_events
      WHERE telegram_id = ?
        AND action != 'admin_grant'
        AND created_at >= datetime('now', '-1 hour')
    `).bind(telegramId).first().catch(() => ({ xp: 0, gems: 0 })),
    db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN xp_change > 0 THEN xp_change ELSE 0 END), 0) AS xp
      FROM blocktopia_progression_events
      WHERE telegram_id = ?
        AND action != 'admin_grant'
        AND DATE(created_at) = DATE('now')
    `).bind(telegramId).first().catch(() => ({ xp: 0 })),
  ]);
  return {
    xpLastHour: Math.max(0, Number(hourRow?.xp) || 0),
    gemsLastHour: Math.max(0, Number(hourRow?.gems) || 0),
    xpToday: Math.max(0, Number(dayRow?.xp) || 0),
  };
}

export async function applyRewardCaps(db, row, reward, options = {}) {
  const currentXp = clamp(Math.floor(Number(row?.xp) || 0), XP_MIN, XP_MAX);
  const currentGems = clamp(Math.floor(Number(row?.gems) || 0), GEMS_MIN, GEMS_MAX);
  let xp = Math.max(0, Math.floor(Number(reward?.xp) || 0));
  let gems = Math.max(0, Math.floor(Number(reward?.gems) || 0));
  const flags = [];
  const totals = await readRewardWindowTotals(db, row.telegram_id);

  if (totals.xpToday >= XP_HARD_CAP_PER_DAY) {
    xp = 0;
    flags.push('xp_hard_cap_hit');
  } else if ((totals.xpToday + xp) > XP_HARD_CAP_PER_DAY) {
    xp = Math.max(0, XP_HARD_CAP_PER_DAY - totals.xpToday);
    flags.push('xp_hard_cap_clamped');
  }

  if (xp > 0) {
    if (totals.xpLastHour >= XP_SOFT_CAP_PER_HOUR) {
      xp = Math.floor(xp * 0.25);
      flags.push('xp_soft_cap_diminished');
    } else if ((totals.xpLastHour + xp) > XP_SOFT_CAP_PER_HOUR) {
      const headroom = Math.max(0, XP_SOFT_CAP_PER_HOUR - totals.xpLastHour);
      const overflow = Math.max(0, xp - headroom);
      xp = headroom + Math.floor(overflow * 0.35);
      flags.push('xp_soft_cap_diminished');
    }
  }

  if ((currentGems + gems) > GEM_SOFT_CAP) {
    const allowed = Math.max(0, GEM_SOFT_CAP - currentGems);
    if (options.rejectGemOverflow) {
      gems = 0;
      flags.push('gem_cap_rejected');
    } else {
      gems = Math.min(gems, allowed);
      flags.push('gem_cap_clamped');
    }
  }

  xp = clamp(xp, 0, Math.max(0, XP_MAX - currentXp));
  gems = clamp(gems, 0, Math.max(0, GEMS_MAX - currentGems));

  if (flags.length) {
    await logProgressionEvent(db, row.telegram_id, 'cap_hit', options.actionType || options.source || 'reward', 0, 0, {
      reason: 'reward_cap_applied',
      source: options.source || 'reward',
      flags,
      before: {
        xp,
        gems,
      },
      totals,
    });
  }

  return {
    xp,
    gems,
    flags,
    totals,
  };
}

export async function countRecentActions(db, telegramId, action, windowMinutes, actionType = null) {
  const row = await db.prepare(`
    SELECT COUNT(*) AS n
    FROM blocktopia_progression_events
    WHERE telegram_id = ?
      AND action = ?
      AND (? IS NULL OR action_type = ?)
      AND created_at >= datetime('now', ?)
  `).bind(telegramId, action, actionType, actionType, `-${Math.max(1, windowMinutes)} minutes`).first().catch(() => ({ n: 0 }));
  return Math.max(0, Number(row?.n) || 0);
}

export async function buildPressureSignals(db, row, context = {}) {
  const targetType = context.targetType || null;
  const targetId = context.targetId || null;
  const signals = {
    actionBurst: 0,
    repeatedTargeting: 0,
    skipCluster: 0,
    sameGameChain: 0,
  };

  const actionBurst = await countRecentActions(db, row.telegram_id, 'pps_increase', PPS_ACTION_WINDOW_MINUTES);
  if (actionBurst >= PPS_ACTIONS_PER_MINUTE_THRESHOLD) {
    signals.actionBurst = 6;
  }

  if (targetType && targetId) {
    const repeatedTargeting = await countRecentActions(db, row.telegram_id, targetType, PPS_REPEAT_TARGET_WINDOW_MINUTES, targetId);
    if (repeatedTargeting >= 3) {
      signals.repeatedTargeting = 4 + Math.min(6, repeatedTargeting - 2);
    }
  }

  const skipCluster = await countRecentActions(db, row.telegram_id, 'mini_game_skip', PPS_SKIP_WINDOW_MINUTES);
  if (skipCluster >= 3) {
    signals.skipCluster = 10;
  }

  if (context.gameType) {
    const sameGameWins = await countRecentActions(db, row.telegram_id, 'mini_game_win', PPS_REPEAT_TARGET_WINDOW_MINUTES, context.gameType);
    if (sameGameWins >= 3) {
      signals.sameGameChain = Math.min(5, sameGameWins - 2);
    }
  }

  return signals;
}

export function computeMiniGameRewardMultiplier(row = {}, type = '', rewardSeed = 0) {
  const baseSeed = Math.max(0, Math.floor(Number(row?.mini_game_entropy_seed) || 0));
  const text = `${String(type || '').toLowerCase()}:${baseSeed}:${Math.floor(Number(rewardSeed) || 0)}`;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 31) + text.charCodeAt(index)) % 9973;
  }
  const roll = hash % 100;
  if (roll >= 99) return 10;
  if (roll >= 96) return 5;
  if (roll >= 90) return 3;
  if (roll >= 78) return 2;
  return 1;
}

export async function advanceMiniGameEntropy(db, telegramId, type, options = {}) {
  const nextSeed = Math.max(0, Math.floor(Number(options.nextSeed) || Math.floor(Date.now() % 1000000)));
  await db.prepare(`
    UPDATE blocktopia_progression
    SET mini_game_last_played = ?, mini_game_entropy_seed = ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `).bind(String(type || '').toLowerCase() || null, nextSeed, telegramId).run();
  return nextSeed;
}

export async function incrementMiniGameSkipCounter(db, row, type, options = {}) {
  const nextCount = Math.max(0, Math.floor(Number(row?.mini_game_skip_count) || 0) + 1);
  const nextSeed = Math.max(0, Math.floor(Number(options.nextSeed) || Math.floor(Date.now() % 1000000)));
  await db.prepare(`
    UPDATE blocktopia_progression
    SET mini_game_skip_count = ?, mini_game_last_played = ?, mini_game_entropy_seed = ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `).bind(nextCount, String(type || '').toLowerCase() || null, nextSeed, row.telegram_id).run();
  await logProgressionEvent(db, row.telegram_id, 'mini_game_skip_penalty', String(type || '').toLowerCase(), 0, 0, {
    reason: 'skip_penalty',
    skip_count: nextCount,
    entropy_seed: nextSeed,
  });
  return {
    ...row,
    mini_game_skip_count: nextCount,
    mini_game_last_played: String(type || '').toLowerCase() || null,
    mini_game_entropy_seed: nextSeed,
  };
}

export async function resetMiniGameSkipCounter(db, row, type, options = {}) {
  const nextSeed = Math.max(0, Math.floor(Number(options.nextSeed) || Math.floor(Date.now() % 1000000)));
  await db.prepare(`
    UPDATE blocktopia_progression
    SET mini_game_skip_count = 0, mini_game_last_played = ?, mini_game_entropy_seed = ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `).bind(String(type || '').toLowerCase() || null, nextSeed, row.telegram_id).run();
  return {
    ...row,
    mini_game_skip_count: 0,
    mini_game_last_played: String(type || '').toLowerCase() || null,
    mini_game_entropy_seed: nextSeed,
  };
}

export function buildEnforcementPayload(row = {}, nowMs = Date.now()) {
  const pressure = clamp(Number(row?.player_pressure_score) || 0, 0, PPS_MAX);
  const tier = getPpsTier(pressure);
  const cooldown = getCooldownState(row, nowMs);
  return {
    player_pressure_score: pressure,
    pps_tier: tier.key,
    pps_updated_at: row?.pps_updated_at || null,
    cooldown,
    cooldown_strikes: Math.max(0, Math.floor(Number(row?.cooldown_strikes) || 0)),
    mini_game_skip_count: Math.max(0, Math.floor(Number(row?.mini_game_skip_count) || 0)),
    mini_game_last_played: row?.mini_game_last_played || null,
    mini_game_entropy_seed: Math.max(0, Math.floor(Number(row?.mini_game_entropy_seed) || 0)),
  };
}

export async function enforceCooldown(db, row, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const decayedRow = await syncPressureDecay(db, row, nowMs);
  let nextRow = decayedRow;
  let cooldown = getCooldownState(nextRow, nowMs);
  if (!cooldown.active && (Number(nextRow?.player_pressure_score) || 0) >= PPS_COOLDOWN_THRESHOLD) {
    const struck = await triggerCooldownStrike(db, nextRow, options);
    nextRow = struck.row;
    cooldown = struck.cooldown;
  }
  return {
    row: nextRow,
    cooldown,
    blocked: cooldown.active,
    tier: getPpsTier(nextRow?.player_pressure_score),
  };
}
