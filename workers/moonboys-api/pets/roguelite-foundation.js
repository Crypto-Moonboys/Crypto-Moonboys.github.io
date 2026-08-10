const DAILY_PET_XP_CAP = 1200;
const DAILY_COMMUNITY_XP_CAP = 250;
const MAX_CURRENCY = 999999;

export const PET_RUN_STATUSES = Object.freeze(['active', 'completed', 'failed', 'abandoned']);
export const PET_ROOM_TYPES = Object.freeze(['battle', 'choice_event', 'loot', 'elite', 'boss']);

export const PET_ROGUELITE_REGIONS = Object.freeze({
  moon_alley: Object.freeze({
    region_id: 'moon_alley', name: 'Moon Alley', difficulty: 1,
    enemy_pool: Object.freeze(['alley_rat', 'scrap_drone']),
    event_pool: Object.freeze(['graffiti_cache']),
    boss_pool: Object.freeze(['alley_scrapper']),
    reward_pool: Object.freeze(['scrap_metal', 'moon_gold']),
  }),
  neon_district: Object.freeze({
    region_id: 'neon_district', name: 'Neon District', difficulty: 2,
    enemy_pool: Object.freeze(['neon_hound', 'signal_thief']),
    event_pool: Object.freeze(['holo_vendor']),
    boss_pool: Object.freeze(['neon_enforcer']),
    reward_pool: Object.freeze(['circuit_shard', 'style_tokens']),
  }),
  dark_chain_sector: Object.freeze({
    region_id: 'dark_chain_sector', name: 'Dark Chain Sector', difficulty: 3,
    enemy_pool: Object.freeze(['chain_wraith', 'void_miner']),
    event_pool: Object.freeze(['broken_validator']),
    boss_pool: Object.freeze(['chain_warden']),
    reward_pool: Object.freeze(['dark_alloy', 'moon_crystals']),
  }),
});

export const PET_ROGUELITE_BOSSES = Object.freeze({
  alley_scrapper: Object.freeze({
    boss_id: 'alley_scrapper', name: 'Alley Scrapper', difficulty: 1, health: 180,
    phases: Object.freeze([{ threshold: 1, pattern: 'scrap_swing' }, { threshold: 0.4, pattern: 'overclock' }]),
    rewards: Object.freeze({ pet_xp: 60, community_xp: 15, moon_gold: 90, materials: { scrap_metal: 2 } }),
  }),
});

export const PET_RUN_MODIFIERS = Object.freeze({
  moon_battery: Object.freeze({ modifier_id: 'moon_battery', name: 'Moon Battery', effects: { energy_recovery_pct: 20 } }),
  cyber_eyes: Object.freeze({ modifier_id: 'cyber_eyes', name: 'Cyber Eyes', effects: { critical_chance_pct: 15 } }),
  ghost_mode: Object.freeze({ modifier_id: 'ghost_mode', name: 'Ghost Mode', effects: { avoid_first_enemy: true } }),
});

const PERMANENT_REWARD_KEYS = new Set(['pet_xp', 'community_xp', 'moon_gold', 'moon_crystals', 'style_tokens', 'materials', 'items']);
const FORBIDDEN_MODIFIER_KEYS = new Set(['pet_xp', 'community_xp', 'xp', 'reward_cap', 'daily_cap', 'permanent_stats']);

function positiveInteger(value, ceiling = MAX_CURRENCY) {
  return Math.min(ceiling, Math.max(0, Math.floor(Number(value) || 0)));
}

function safeJson(value) {
  return JSON.stringify(value == null ? {} : value);
}

function normalizeCollection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([key, amount]) => [String(key).trim().toLowerCase().slice(0, 80), positiveInteger(amount)])
    .filter(([key, amount]) => /^[a-z0-9][a-z0-9_-]*$/.test(key) && amount > 0));
}

export function normalizePetReward(reward = {}) {
  return {
    pet_xp: positiveInteger(reward.pet_xp, DAILY_PET_XP_CAP),
    community_xp: positiveInteger(reward.community_xp, DAILY_COMMUNITY_XP_CAP),
    moon_gold: positiveInteger(reward.moon_gold),
    moon_crystals: positiveInteger(reward.moon_crystals),
    style_tokens: positiveInteger(reward.style_tokens),
    materials: normalizeCollection(reward.materials),
    items: normalizeCollection(reward.items),
  };
}

export function validatePetRunModifier(modifier) {
  const effects = modifier?.effects;
  if (!effects || typeof effects !== 'object' || Array.isArray(effects)) throw new Error('invalid_run_modifier_effects');
  const inspect = (value) => {
    for (const [rawKey, nested] of Object.entries(value || {})) {
      const key = String(rawKey).toLowerCase();
      if (FORBIDDEN_MODIFIER_KEYS.has(key) || key.includes('xp') || key.includes('reward') || key.includes('permanent') || key.includes('cap')) {
        throw new Error('run_modifier_cannot_change_permanent_rewards');
      }
      if (nested && typeof nested === 'object') inspect(nested);
    }
  };
  inspect(effects);
  return true;
}

export async function awardPetReward(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const source = String(request.source || '').trim().toLowerCase().slice(0, 80);
  const idempotencyKey = String(request.idempotency_key || '').trim().slice(0, 160);
  if (!telegramId || !/^[a-z0-9][a-z0-9:_-]*$/.test(source) || !idempotencyKey) throw new Error('invalid_pet_reward_request');
  const rewards = normalizePetReward(request.rewards);
  const now = request.now instanceof Date ? request.now : new Date(request.now || Date.now());
  const dayKey = now.toISOString().slice(0, 10);
  const weekDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekDay = weekDate.getUTCDay() || 7;
  weekDate.setUTCDate(weekDate.getUTCDate() + 4 - weekDay);
  const weekYearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((weekDate - weekYearStart) / 86400000) + 1) / 7);
  const weekKey = `${weekDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  const yearStart = Date.UTC(now.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - yearStart) / 86400000);
  const seasonKey = String(request.season_key || `pet-s${now.getUTCFullYear()}-${String(Math.floor(dayOfYear / 90) + 1).padStart(3, '0')}`);
  const claimId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const finalizationId = crypto.randomUUID();
  const eventKey = `pet_reward:${source}:${idempotencyKey}`.slice(0, 220);
  const metadata = safeJson({ finalization_id: finalizationId, source, idempotency_key: idempotencyKey, requested: rewards, context: request.context || {} });
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_reward_claims
      (claim_id, telegram_id, source, idempotency_key, status, requested_rewards, metadata)
      SELECT ?, ?, ?, ?, 'pending', ?, ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ?)`)
      .bind(claimId, telegramId, source, idempotencyKey, safeJson(rewards), safeJson(request.context || {}), telegramId),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_events
      (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      SELECT ?, ?, 'unified_reward', ?, 0, 0, ?, ?, ?, 'pending', 'reward_pending', ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')`)
      .bind(eventId, telegramId, eventKey, seasonKey, dayKey, weekKey, metadata, claimId),
    db.prepare(`UPDATE telegram_pet_events
      SET pet_xp_awarded = MIN(?, MAX(0, ? - (SELECT COALESCE(SUM(pet_xp_awarded), 0) FROM telegram_pet_events WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'))),
          xp_awarded = MIN(?, MAX(0, ? - (SELECT COALESCE(SUM(xp_awarded), 0) FROM telegram_pet_events WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'))),
          status = 'accepted', reason = 'reward_awarded', metadata = ?
      WHERE id = ? AND status = 'pending'
        AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')
      RETURNING pet_xp_awarded, xp_awarded`)
      .bind(rewards.pet_xp, DAILY_PET_XP_CAP, telegramId, dayKey, rewards.community_xp, DAILY_COMMUNITY_XP_CAP, telegramId, dayKey, metadata, eventId, claimId),
    db.prepare(`UPDATE telegram_pet_profiles SET
        pet_xp = pet_xp + COALESCE((SELECT pet_xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted'), 0),
        moon_gold = MIN(?, moon_gold + ?), moon_crystals = MIN(?, moon_crystals + ?), style_tokens = MIN(?, style_tokens + ?),
        level = CAST((pet_xp + COALESCE((SELECT pet_xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted'), 0)) / 100 AS INTEGER) + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
      .bind(eventId, metadata, MAX_CURRENCY, rewards.moon_gold, MAX_CURRENCY, rewards.moon_crystals, MAX_CURRENCY, rewards.style_tokens, eventId, metadata, telegramId, eventId, metadata),
    db.prepare(`INSERT INTO telegram_xp_log (telegram_id, action, xp_change, reference_id)
      SELECT ?, ?, xp_awarded, ? FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted' AND xp_awarded > 0`)
      .bind(telegramId, `pet_${source}`.slice(0, 80), eventKey, eventId, metadata),
    db.prepare(`UPDATE telegram_users SET
        xp = xp + COALESCE((SELECT xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted'), 0),
        level = CAST((xp + COALESCE((SELECT xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted'), 0)) / 100 AS INTEGER) + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
      .bind(eventId, metadata, eventId, metadata, telegramId, eventId, metadata),
    db.prepare(`INSERT INTO telegram_leaderboard (telegram_id, season_id, xp)
      SELECT ?, season.id, event.xp_awarded FROM telegram_seasons AS season, telegram_pet_events AS event
      WHERE season.is_active = 1 AND event.id = ? AND event.metadata = ? AND event.status = 'accepted' AND event.xp_awarded > 0
      ORDER BY season.start_date DESC LIMIT 1
      ON CONFLICT(telegram_id, season_id) DO UPDATE SET xp = xp + excluded.xp, updated_at = CURRENT_TIMESTAMP`)
      .bind(telegramId, eventId, metadata),
    db.prepare(`INSERT INTO telegram_pet_season_state (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
      SELECT ?, ?, pet_xp_awarded, pet_xp_awarded, pet_xp_awarded, ?, ? FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted'
      ON CONFLICT(telegram_id, season_key) DO UPDATE SET season_xp = season_xp + excluded.season_xp,
        weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
        daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
        daily_key = excluded.daily_key, weekly_key = excluded.weekly_key, updated_at = CURRENT_TIMESTAMP`)
      .bind(telegramId, seasonKey, dayKey, weekKey, eventId, metadata),
  ];
  for (const [kind, collection] of [['material', rewards.materials], ['item', rewards.items]]) {
    for (const [key, quantity] of Object.entries(collection)) {
      statements.push(db.prepare(`INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity, updated_at)
        SELECT ?, ?, ?, ?, CURRENT_TIMESTAMP WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')
        ON CONFLICT(telegram_id, asset_type, asset_key) DO UPDATE SET quantity = MIN(?, quantity + excluded.quantity), updated_at = CURRENT_TIMESTAMP`)
        .bind(telegramId, kind, key, quantity, eventId, metadata, MAX_CURRENCY));
    }
  }
  statements.push(db.prepare(`UPDATE telegram_pet_reward_claims SET status = 'awarded',
      applied_rewards = json_object('pet_xp', COALESCE((SELECT pet_xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ?), 0),
        'community_xp', COALESCE((SELECT xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ?), 0),
        'moon_gold', ?, 'moon_crystals', ?, 'style_tokens', ?, 'materials', json(?), 'items', json(?)), awarded_at = CURRENT_TIMESTAMP
      WHERE claim_id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
    .bind(eventId, metadata, eventId, metadata, rewards.moon_gold, rewards.moon_crystals, rewards.style_tokens, safeJson(rewards.materials), safeJson(rewards.items), claimId, eventId, metadata));
  const results = await db.batch(statements);
  const awarded = results?.[2]?.results?.[0];
  if (!awarded) return { accepted: true, duplicate: true, pet_xp_awarded: 0, xp_awarded: 0, rewards: normalizePetReward() };
  return { accepted: true, duplicate: false, pet_xp_awarded: positiveInteger(awarded.pet_xp_awarded), xp_awarded: positiveInteger(awarded.xp_awarded), rewards: { ...rewards, pet_xp: positiveInteger(awarded.pet_xp_awarded), community_xp: positiveInteger(awarded.xp_awarded) } };
}

export function generatePetRunRoom(run) {
  const room = Math.max(1, Number(run.current_room || 0) + 1);
  const maxRoom = Math.max(room, Number(run.max_room || 5));
  const roomType = room === maxRoom ? 'boss' : PET_ROOM_TYPES[(Number(run.seed || 0) + room - 1) % (PET_ROOM_TYPES.length - 1)];
  return { room_id: `${run.run_id}:${room}`, run_id: run.run_id, room, room_type: roomType, status: 'pending' };
}

export function resolvePetRunRoom(room, outcome = {}) {
  if (room?.status !== 'pending') return { ...room, duplicate: true };
  return { ...room, status: outcome.success === false ? 'failed' : 'resolved', outcome: { success: outcome.success !== false, ...outcome } };
}

export async function startPetRogueliteRun(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const region = PET_ROGUELITE_REGIONS[String(request.region || 'moon_alley')];
  if (!telegramId || !region) throw new Error('invalid_pet_roguelite_run');
  const runId = String(request.run_id || `rogue-${crypto.randomUUID()}`).slice(0, 120);
  const seed = Math.floor(Number(request.seed) || 0);
  const maxRoom = Math.max(1, Math.min(100, Math.floor(Number(request.max_room) || 5)));
  const seasonKey = String(request.season_key || `pet-s${new Date().getUTCFullYear()}-001`);
  const analyticsId = `${runId}:start`;
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_runs
      (id, telegram_id, run_id, season_key, region, difficulty, seed, status, current_room, max_room, depth, max_depth, risk_level)
      SELECT ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, 0, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ?)`)
      .bind(crypto.randomUUID(), telegramId, runId, seasonKey, region.region_id, region.difficulty, seed, maxRoom, maxRoom, region.difficulty, telegramId),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, run_id, telegram_id, event_type, event_data)
      SELECT ?, ?, ?, 'run_start', ? WHERE EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ?)`)
      .bind(analyticsId, runId, telegramId, safeJson({ region: region.region_id, difficulty: region.difficulty, seed }), runId, telegramId),
  ]);
  return { accepted: Boolean(results?.[0]?.meta?.changes), duplicate: !results?.[0]?.meta?.changes, run_id: runId, region: region.region_id, difficulty: region.difficulty, seed, max_room: maxRoom };
}

export async function createPetRunRoom(db, run) {
  const room = generatePetRunRoom(run);
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_rooms
      (room_id, run_id, telegram_id, room_number, room_type, status, generated_data)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)`)
      .bind(room.room_id, run.run_id, run.telegram_id, room.room, room.room_type, safeJson(room)),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, run_id, telegram_id, event_type, event_data)
      SELECT ?, ?, ?, 'room_generated', ? WHERE EXISTS (SELECT 1 FROM telegram_pet_run_rooms WHERE room_id = ?)`)
      .bind(`${room.room_id}:generated`, run.run_id, run.telegram_id, safeJson(room), room.room_id),
  ]);
  return { ...room, duplicate: !results?.[0]?.meta?.changes };
}

export async function persistPetRunRoomOutcome(db, run, room, outcome = {}) {
  const resolved = resolvePetRunRoom(room, outcome);
  const result = await db.prepare(`UPDATE telegram_pet_run_rooms SET status = ?, outcome_data = ?, resolved_at = CURRENT_TIMESTAMP
    WHERE room_id = ? AND run_id = ? AND status = 'pending' RETURNING room_id`).bind(resolved.status, safeJson(resolved.outcome), room.room_id, run.run_id).first();
  if (!result) return { ...resolved, duplicate: true };
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, run_id, telegram_id, event_type, event_data)
    VALUES (?, ?, ?, 'room_resolved', ?)`).bind(`${room.room_id}:resolved`, run.run_id, run.telegram_id, safeJson({ room: room.room, room_type: room.room_type, outcome: resolved.outcome })).run();
  return resolved;
}

export async function choosePetRunModifier(db, run, modifierId) {
  const modifier = PET_RUN_MODIFIERS[String(modifierId || '')];
  if (!modifier) throw new Error('unknown_pet_run_modifier');
  validatePetRunModifier(modifier);
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_modifiers (run_id, telegram_id, modifier_id, effects_json)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status IN ('active', 'extractable'))`)
      .bind(run.run_id, run.telegram_id, modifier.modifier_id, safeJson(modifier.effects), run.run_id, run.telegram_id),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, run_id, telegram_id, event_type, event_data)
      SELECT ?, ?, ?, 'modifier_chosen', ? WHERE EXISTS (SELECT 1 FROM telegram_pet_run_modifiers WHERE run_id = ? AND modifier_id = ?)`)
      .bind(`${run.run_id}:modifier:${modifier.modifier_id}`, run.run_id, run.telegram_id, safeJson(modifier), run.run_id, modifier.modifier_id),
  ]);
  return { accepted: Boolean(results?.[0]?.meta?.changes), duplicate: !results?.[0]?.meta?.changes, modifier };
}

export async function rewardPetRunRoom(db, run, room, rewards) {
  if (room?.status !== 'resolved') return { accepted: false, reason: 'room_not_resolved' };
  return awardPetReward(db, { telegram_id: run.telegram_id, source: 'roguelite_room', idempotency_key: room.room_id, rewards, context: { run_id: run.run_id, room: room.room, room_type: room.room_type } });
}

export async function rewardPetRogueliteBoss(db, run, bossId) {
  const boss = PET_ROGUELITE_BOSSES[bossId];
  if (!boss) throw new Error('unknown_pet_roguelite_boss');
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, run_id, telegram_id, event_type, event_data)
    VALUES (?, ?, ?, 'boss_fought', ?)`).bind(`${run.run_id}:boss:${bossId}`, run.run_id, run.telegram_id, safeJson({ boss_id: bossId, name: boss.name, difficulty: boss.difficulty })).run();
  return awardPetReward(db, { telegram_id: run.telegram_id, source: 'roguelite_boss', idempotency_key: `${run.run_id}:${bossId}`, rewards: boss.rewards, context: { run_id: run.run_id, boss_id: bossId } });
}

export async function finishPetRogueliteRun(db, run, status, analytics = {}) {
  if (!PET_RUN_STATUSES.includes(status) || status === 'active') throw new Error('invalid_terminal_run_status');
  const durationSeconds = Math.max(0, Math.floor((Date.now() - new Date(run.started_at || Date.now()).getTime()) / 1000));
  const finalizationId = `${run.run_id}:end`;
  const results = await db.batch([
    db.prepare(`UPDATE telegram_pet_runs SET status = ?, ended_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP,
        death_reason = ?, rewards_earned = ?, rooms_completed = ?, modifiers_chosen = ?, boss_fought = ?, updated_at = CURRENT_TIMESTAMP
        WHERE run_id = ? AND telegram_id = ? AND status IN ('active', 'extractable') RETURNING run_id`)
      .bind(status, analytics.death_reason || null, safeJson(analytics.rewards_earned || {}), positiveInteger(analytics.rooms_completed), safeJson(analytics.modifiers_chosen || []), analytics.boss_fought || null, run.run_id, run.telegram_id),
    db.prepare(`DELETE FROM telegram_pet_run_modifiers WHERE run_id = ?
      AND EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status = ?)`)
      .bind(run.run_id, run.run_id, run.telegram_id, status),
    db.prepare(`INSERT INTO telegram_pet_run_history
      (telegram_id, runs_completed, bosses_defeated, highest_room_reached, best_score, fastest_completion_seconds, rare_discoveries)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status = ?)
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_run_analytics WHERE analytics_id = ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        runs_completed = runs_completed + excluded.runs_completed,
        bosses_defeated = bosses_defeated + excluded.bosses_defeated,
        highest_room_reached = MAX(highest_room_reached, excluded.highest_room_reached),
        best_score = MAX(best_score, excluded.best_score),
        fastest_completion_seconds = CASE WHEN excluded.fastest_completion_seconds IS NULL THEN fastest_completion_seconds
          WHEN fastest_completion_seconds IS NULL THEN excluded.fastest_completion_seconds ELSE MIN(fastest_completion_seconds, excluded.fastest_completion_seconds) END,
        rare_discoveries = CASE WHEN excluded.rare_discoveries = '[]' THEN rare_discoveries ELSE excluded.rare_discoveries END,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(run.telegram_id, status === 'completed' ? 1 : 0, status === 'completed' && analytics.boss_fought ? 1 : 0,
        positiveInteger(analytics.rooms_completed ?? run.current_room), positiveInteger(run.score), status === 'completed' ? durationSeconds : null,
        safeJson(analytics.rare_discoveries || []), run.run_id, run.telegram_id, status, finalizationId),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, run_id, telegram_id, event_type, event_data)
      SELECT ?, ?, ?, 'run_end', ? WHERE EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status = ?)`)
      .bind(finalizationId, run.run_id, run.telegram_id, safeJson({ status, ...analytics }), run.run_id, run.telegram_id, status),
  ]);
  const terminal = results?.[0]?.results?.[0];
  if (!terminal) {
    const existing = await db.prepare('SELECT status FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ?').bind(run.run_id, run.telegram_id).first();
    return { accepted: true, duplicate: true, status: existing?.status || null };
  }
  return { accepted: true, duplicate: false, status };
}

export function advancePetRun(run, resolvedRoom) {
  if (resolvedRoom?.status !== 'resolved') throw new Error('room_not_resolved');
  const currentRoom = Math.max(Number(run.current_room || 0), Number(resolvedRoom.room || 0));
  return { ...run, current_room: currentRoom, score: positiveInteger(Number(run.score || 0) + Number(resolvedRoom.outcome?.score || 0)) };
}

export async function completePetRun(db, run, completionRewards = {}, analytics = {}) {
  const terminal = await finishPetRogueliteRun(db, run, 'completed', analytics);
  if (terminal.status !== 'completed') return { ...terminal, reward: null };
  const reward = await awardPetReward(db, {
    telegram_id: run.telegram_id,
    source: 'roguelite_completion',
    idempotency_key: run.run_id,
    rewards: completionRewards,
    context: { run_id: run.run_id, rooms_completed: analytics.rooms_completed ?? run.current_room },
  });
  return { ...terminal, reward };
}
export const failPetRun = (db, run, analytics = {}) => finishPetRogueliteRun(db, run, 'failed', analytics);

export const __rogueliteFoundationTestHooks = Object.freeze({ DAILY_PET_XP_CAP, DAILY_COMMUNITY_XP_CAP, PERMANENT_REWARD_KEYS });
