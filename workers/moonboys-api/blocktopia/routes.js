import {
  BLOCKTOPIA_ARCADE_MAX_XP_PER_MINUTE,
  BLOCKTOPIA_MAX_SCORE_SANITY,
  BLOCKTOPIA_SURVIVAL_XP_FLOOR,
  BLOCKTOPIA_UPGRADES,
  GEMS_MAX,
  GEMS_MIN,
  TELEGRAM_SYNC_XP_MULTIPLIER,
  TIER_MAX,
  TIER_MIN,
  UPGRADE_MAX_LEVEL,
  XP_MAX,
  XP_MIN,
  XP_SOFT_CAP_PER_HOUR,
  XP_HARD_CAP_PER_DAY,
  GEM_SOFT_CAP,
} from './config.js';
import {
  applyProgressionDrain,
  buildUpgradeEffects,
  clamp,
  computeBlockTopiaRewards,
  computeMiniGameCost,
  computeMiniGameLossPenalty,
  computeMiniGameSkipCost,
  computeRpgEntryCost,
  computeUpgradeCost,
  getUpgradeSnapshot,
} from './math.js';
import {
  enforceArcadeGameHourlyLimit,
  enforceProgressionRateLimit,
  getArcadeXpAwardedLastMinute,
  getOrCreateBlockTopiaProgression,
  hasArcadeScoreBeenRewarded,
} from './db.js';
import { verifyTelegramIdentityFromBody } from './auth.js';
import { fetchTrustedLeaderboardContext } from './leaderboard.js';
import { handleBlockTopiaCovertRoute } from './covert.js';
import {
  advanceMiniGameEntropy,
  applyPressureDelta,
  applyRewardCaps,
  buildEnforcementPayload,
  buildPressureSignals,
  computeMiniGameRewardMultiplier,
  enforceCooldown,
  getNetworkHeatTier,
  getPpsTier,
  incrementMiniGameSkipCounter,
  logProgressionEvent,
  resetMiniGameSkipCounter,
  syncPressureDecay,
} from './enforcement.js';

function logBlockTopiaFailure(event, context = {}) {
  console.log('[blocktopia][progression]', JSON.stringify({
    event,
    ...context,
    timestamp: new Date().toISOString(),
  }));
}

function isRpgModeActive(row) {
  return Number(row?.rpg_mode_active || 0) === 1;
}

function logProgressionResponse(route, progression = {}, meta = {}) {
  console.log('[blocktopia][progression_response]', JSON.stringify({
    route,
    telegram_id: progression?.telegram_id || meta?.telegramId || null,
    ok: meta?.ok ?? null,
    exited: meta?.exited ?? false,
    reason: meta?.reason || null,
    rpg_mode_active: progression?.rpg_mode_active ?? isRpgModeActive(progression),
    xp: Number(progression?.xp ?? 0),
    gems: Number(progression?.gems ?? 0),
    tier: Number(progression?.tier ?? 0),
    timestamp: new Date().toISOString(),
  }));
}

function normalizeFaction(value) {
  const cleaned = String(value || '').trim().toLowerCase();
  if (cleaned === 'diamond-hands' || cleaned === 'diamond_hands' || cleaned === 'diamondhands') return 'diamond-hands';
  if (cleaned === 'hodl-warriors' || cleaned === 'hodl_warriors' || cleaned === 'hodlwarriors') return 'hodl-warriors';
  if (cleaned === 'graffpunks' || cleaned === 'graff-punks' || cleaned === 'graff_punks') return 'graffpunks';
  return 'unaligned';
}

function factionXpMultiplier(faction) {
  const key = normalizeFaction(faction);
  if (key === 'diamond-hands') return 1.1;
  if (key === 'hodl-warriors') return 1.15;
  if (key === 'graffpunks') return 1.12;
  return 1;
}

function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function isValidMiniGameType(type) {
  return ['firewall', 'router', 'outbreak', 'circuit'].includes(String(type || '').trim().toLowerCase());
}

function isValidProgressionAction(action) {
  return ['mini_game_affordability', 'mini_game_skip', 'mini_game_win', 'mini_game_loss', 'arcade_score'].includes(action);
}

async function readProgressionRequestBody(request, err) {
  try {
    return { body: await request.json() };
  } catch {
    return { response: err('Invalid JSON') };
  }
}

function buildProgressionEnvelope(row, extras = {}) {
  const pressureTier = getPpsTier(row?.player_pressure_score);
  return {
    ...extras,
    debug_progression: {
      rpg_mode_active: isRpgModeActive(row),
    },
    enforcement: buildEnforcementPayload(row),
    pressure_tier: pressureTier.key,
    caps: {
      xp_soft_cap_per_hour: XP_SOFT_CAP_PER_HOUR,
      xp_hard_cap_per_day: XP_HARD_CAP_PER_DAY,
      gem_soft_cap: GEM_SOFT_CAP,
    },
  };
}

function cooldownBlockedResponse(json, row, message = 'Cooldown active. Let the pressure drop before acting.') {
  logProgressionResponse('/blocktopia/progression/cooldown', {
    telegram_id: row?.telegram_id,
    xp: Number(row?.xp ?? 0),
    gems: Number(row?.gems ?? 0),
    tier: Number(row?.tier ?? 0),
    rpg_mode_active: isRpgModeActive(row),
  }, {
    ok: false,
    reason: 'cooldown_active',
  });
  return json({
    error: message,
    ...buildProgressionEnvelope(row),
  }, 429);
}

export async function handleBlockTopiaProgressionRoute(request, env, url, helpers) {
  const { path } = helpers;
  const { json, err, upsertTelegramUser, verifyTelegramAuth } = helpers;

  const covertResponse = await handleBlockTopiaCovertRoute(request, env, url, helpers);
  if (covertResponse) return covertResponse;

  if (path === '/blocktopia/progression' && request.method === 'POST') {
    const parsed = await readProgressionRequestBody(request, err);
    if (parsed.response) return parsed.response;

    const verified = await verifyTelegramIdentityFromBody(parsed.body, env, verifyTelegramAuth);
    if (verified.error) return err(verified.error, verified.status || 401);

    try {
      await upsertTelegramUser(env.DB, verified.user).catch((error) => {
        logBlockTopiaFailure('upsert_user_failed', {
          path,
          telegramId: verified.telegramId,
          message: error?.message || String(error),
        });
      });
      const rawRow = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
      const row = await syncPressureDecay(env.DB, rawRow);
      const upgrades = getUpgradeSnapshot(row);
      const effects = buildUpgradeEffects(upgrades);
      const { drain, xpAfterDrain, drainPerMinute } = applyProgressionDrain(row, Date.now(), effects);
      const gems = clamp(Number(row.gems) || 0, GEMS_MIN, GEMS_MAX);
      const tierAfter = clamp(Number(row.tier) || 1, TIER_MIN, TIER_MAX);
      const winStreak = Math.max(0, Math.floor(Number(row.win_streak) || 0));
      const rpgModeActive = Number(row.rpg_mode_active) === 1;

      const updateResult = await env.DB.prepare(`
        UPDATE blocktopia_progression
        SET xp = ?, gems = ?, tier = ?, win_streak = ?, upgrade_efficiency = ?, upgrade_signal = ?,
            upgrade_defense = ?, upgrade_gem = ?, upgrade_npc = ?, rpg_mode_active = ?,
            last_active = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ?
      `).bind(
        xpAfterDrain, gems, tierAfter, winStreak,
        upgrades.efficiency, upgrades.signal, upgrades.defense, upgrades.gem, upgrades.npc,
        rpgModeActive ? 1 : 0,
        verified.telegramId,
      ).run();
      if (changedRows(updateResult) !== 1) {
        logBlockTopiaFailure('progression_drain_update_missed', { path, telegramId: verified.telegramId });
      }

      const progression = {
        telegram_id: verified.telegramId,
        xp: xpAfterDrain,
        gems,
        tier: tierAfter,
        win_streak: winStreak,
        drain_applied: drain,
        drain_per_minute: drainPerMinute,
        rpg_mode_active: rpgModeActive,
        rpg_entry_cost: computeRpgEntryCost(tierAfter),
        upgrades,
        effects,
        last_active: new Date().toISOString(),
        network_heat: clamp(Number(row.network_heat) || 0, 0, 100),
        heat_tier: getNetworkHeatTier(row.network_heat),
      };
      logProgressionResponse('/blocktopia/progression', progression, { ok: true });
      return json({
        ok: true,
        progression,
        ...buildProgressionEnvelope(row),
      });
    } catch (error) {
      logBlockTopiaFailure('load_progression_failed', {
        path,
        telegramId: verified.telegramId,
        message: error?.message || String(error),
      });
      return err('Failed to load Block Topia progression', 500);
    }
  }

  if (path === '/blocktopia/progression/entry' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return err('Invalid JSON'); }
    const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
    if (verified.error) return err(verified.error, verified.status || 401);
    try {
      const rawRow = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
      const guarded = await enforceCooldown(env.DB, rawRow, { actionType: 'entry', reason: 'entry_attempt' });
      if (guarded.blocked) return cooldownBlockedResponse(json, guarded.row, 'Cooldown active. Block Topia entry is locked.');
      const row = guarded.row;
      const tier = clamp(Math.floor(Number(row.tier) || 1), TIER_MIN, TIER_MAX);
      const entryCost = computeRpgEntryCost(tier);
      const miniGameCost = computeMiniGameCost(tier);
      const xp = clamp(Math.floor(Number(row.xp) || 0), XP_MIN, XP_MAX);
      const gems = clamp(Math.floor(Number(row.gems) || 0), GEMS_MIN, GEMS_MAX);
      if (xp < entryCost) return err('Not enough XP for Block Topia entry', 402);

      const xpAfterEntry = clamp(xp - entryCost, XP_MIN, XP_MAX);
      const seededXp = Math.max(xpAfterEntry, miniGameCost);
      const updateResult = await env.DB.prepare(`
        UPDATE blocktopia_progression
        SET xp = CASE WHEN xp - ? < ? THEN ? ELSE xp - ? END,
            gems = ?,
            rpg_mode_active = 1,
            last_active = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ? AND xp = ? AND gems = ? AND tier = ? AND xp >= ?
      `).bind(entryCost, miniGameCost, miniGameCost, entryCost, gems, verified.telegramId, row.xp, row.gems, row.tier, entryCost).run();
      if (changedRows(updateResult) !== 1) return err('Progression changed. Please retry entry.', 409);
      const progression = {
        telegram_id: verified.telegramId,
        xp: seededXp,
        gems,
        tier,
        rpg_mode_active: true,
        entry_cost_paid: entryCost,
        first_mini_game_cost: miniGameCost,
        first_mini_game_seed_xp: Math.max(0, seededXp - xpAfterEntry),
      };
      logProgressionResponse('/blocktopia/progression/entry', progression, { ok: true });
      return json({
        ok: true,
        progression,
        ...buildProgressionEnvelope({ ...row, rpg_mode_active: 1 }),
      });
    } catch (error) {
      logBlockTopiaFailure('entry_failed', {
        path,
        telegramId: verified.telegramId,
        message: error?.message || String(error),
      });
      return err('Failed to enter RPG mode', 500);
    }
  }

  if (path === '/blocktopia/progression/upgrade' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return err('Invalid JSON'); }
    const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
    if (verified.error) return err(verified.error, verified.status || 401);
    const upgradeId = String(body?.upgrade || '').trim().toLowerCase();
    const config = BLOCKTOPIA_UPGRADES[upgradeId];
    if (!config) return err('Invalid upgrade key', 400);
    try {
      const rawRow = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
      const guarded = await enforceCooldown(env.DB, rawRow, { actionType: 'upgrade', reason: 'upgrade_attempt', metadata: { upgradeId } });
      if (guarded.blocked) return cooldownBlockedResponse(json, guarded.row, 'Cooldown active. Upgrades are temporarily locked.');
      const row = guarded.row;
      const upgrades = getUpgradeSnapshot(row);
      const currentLevel = upgrades[upgradeId];
      if (currentLevel >= UPGRADE_MAX_LEVEL) return err('Upgrade already at max level', 409);
      const cost = computeUpgradeCost(config.baseCost, currentLevel);
      const gems = clamp(Math.floor(Number(row.gems) || 0), GEMS_MIN, GEMS_MAX);
      if (gems < cost) return err('Not enough gems for upgrade', 402);
      const nextLevel = clamp(currentLevel + 1, 0, UPGRADE_MAX_LEVEL);
      const updateResult = await env.DB.prepare(`
        UPDATE blocktopia_progression
        SET gems = gems - ?, ${config.column} = ${config.column} + 1, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ? AND gems >= ? AND ${config.column} = ? AND ${config.column} < ?
      `).bind(cost, verified.telegramId, cost, currentLevel, UPGRADE_MAX_LEVEL).run();
      if (changedRows(updateResult) !== 1) return err('Progression changed. Please retry the upgrade.', 409);
      const latest = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
      const nextUpgrades = getUpgradeSnapshot(latest);
      const progression = {
        telegram_id: verified.telegramId,
        gems: clamp(Math.floor(Number(latest.gems) || 0), GEMS_MIN, GEMS_MAX),
        upgrades: nextUpgrades,
        effects: buildUpgradeEffects(nextUpgrades),
        rpg_mode_active: isRpgModeActive(latest),
        xp: Number(latest?.xp || 0),
        tier: Number(latest?.tier || 1),
      };
      logProgressionResponse('/blocktopia/progression/upgrade', progression, { ok: true });
      return json({
        ok: true,
        progression,
        upgrade: {
          id: upgradeId,
          level: nextLevel,
          max_level: UPGRADE_MAX_LEVEL,
          cost_paid: cost,
          next_cost: nextLevel >= UPGRADE_MAX_LEVEL ? null : computeUpgradeCost(config.baseCost, nextLevel),
        },
        ...buildProgressionEnvelope(latest),
      });
    } catch (error) {
      logBlockTopiaFailure('upgrade_failed', {
        path,
        telegramId: verified.telegramId,
        upgradeId,
        message: error?.message || String(error),
      });
      return err('Failed to apply RPG upgrade', 500);
    }
  }

  if (path === '/blocktopia/progression/mini-game' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return err('Invalid JSON'); }

    const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
    if (verified.error) return err(verified.error, verified.status || 401);

    const action = String(body?.action || '').trim();
    const type = String(body?.type || '').trim().toLowerCase();
    const game = String(body?.game || '').trim().toLowerCase();
    const skipStreak = Math.min(100, Math.max(0, Math.floor(Number(body?.skip_streak) || 0)));
    const score = Math.floor(Number(body?.score) || 0);
    if (!isValidProgressionAction(action)) {
      return err('Invalid progression action', 400);
    }
    if (action !== 'arcade_score' && !isValidMiniGameType(type)) {
      return err('Invalid mini-game type for progression update', 400);
    }
    if (!Number.isFinite(score) || score < 0 || score > BLOCKTOPIA_MAX_SCORE_SANITY) {
      return err('Invalid score payload for progression update', 400);
    }
    if (action === 'arcade_score' && (!game || !/^[a-z0-9_-]{2,32}$/.test(game))) {
      return err('Invalid game key for arcade score update', 400);
    }
    let leaderboardCtx = null;
    if (action === 'arcade_score') {
      try {
        leaderboardCtx = await fetchTrustedLeaderboardContext(env, game, verified.telegramId, verified.user);
      } catch (error) {
        logBlockTopiaFailure('leaderboard_bridge_verification_failed', {
          path,
          telegramId: verified.telegramId,
          game,
          message: error?.message || String(error),
        });
        return err('Failed to verify trusted leaderboard context', 502);
      }
      if (!leaderboardCtx || leaderboardCtx.trustedBestScore <= 0) {
        return err('Score not found on trusted leaderboard', 409);
      }
      if (score > leaderboardCtx.trustedBestScore) {
        return err('Submitted score exceeds trusted leaderboard best', 409);
      }
      const alreadyRewardedScore = await hasArcadeScoreBeenRewarded(env.DB, verified.telegramId, game, score);
      leaderboardCtx.improvementEligible =
        score > 0 && score >= leaderboardCtx.trustedBestScore && !alreadyRewardedScore;
    }
    try {
      await upsertTelegramUser(env.DB, verified.user).catch((error) => {
        logBlockTopiaFailure('upsert_user_failed', {
          path,
          telegramId: verified.telegramId,
          action,
          game,
          message: error?.message || String(error),
        });
      });

      if (action !== 'mini_game_affordability') {
        const allowed = await enforceProgressionRateLimit(env.DB, verified.telegramId);
        if (!allowed) return err('Too many progression updates. Try again in a minute.', 429);
      }
      const rawRow = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
      const guarded = await enforceCooldown(env.DB, rawRow, {
        actionType: action === 'arcade_score' ? game : type,
        reason: action,
        metadata: { action, game, type },
      });
      if (action !== 'mini_game_affordability' && guarded.blocked) {
        return cooldownBlockedResponse(json, guarded.row, 'Cooldown active. Rewards and mini-games are temporarily locked.');
      }
      const row = guarded.row;
      const upgrades = getUpgradeSnapshot(row);
      const effects = buildUpgradeEffects(upgrades);
      if (action !== 'arcade_score' && Number(row?.rpg_mode_active || 0) !== 1) {
        return err('RPG mode entry required before mini-game rewards', 403);
      }
      const currentTier = clamp(Math.floor(Number(row.tier) || 1), TIER_MIN, TIER_MAX);
      const { drain, xpAfterDrain, drainPerMinute } = applyProgressionDrain(row, Date.now(), effects);
      const miniGameCost = action === 'arcade_score' ? 0 : computeMiniGameCost(currentTier);
      if (action === 'mini_game_affordability') {
        const progression = {
          telegram_id: verified.telegramId,
          xp: xpAfterDrain,
          gems: clamp((Number(row.gems) || 0), GEMS_MIN, GEMS_MAX),
          tier: currentTier,
          win_streak: Math.max(0, Math.floor(Number(row.win_streak) || 0)),
          rpg_mode_active: Number(row.rpg_mode_active || 0) === 1,
          mini_game_cost: miniGameCost,
          drain_applied: drain,
          drain_per_minute: drainPerMinute,
          upgrades,
          effects,
        };
        logProgressionResponse('/blocktopia/progression/mini-game', progression, {
          ok: true,
          reason: 'mini_game_affordability',
        });
        return json({
          ok: true,
          can_play: xpAfterDrain >= miniGameCost && !guarded.cooldown.active,
          progression,
          ...buildProgressionEnvelope(row),
        });
      }
      if (action === 'mini_game_skip') {
        const skipCost = computeMiniGameSkipCost(currentTier, skipStreak);
        let updatedRow = await incrementMiniGameSkipCounter(env.DB, row, type);
        const skipSignals = await buildPressureSignals(env.DB, updatedRow, { gameType: type });
        const skipPressure = 4 + skipSignals.skipCluster + Math.max(0, Math.floor(skipStreak / 2));
        const pressureResult = await applyPressureDelta(env.DB, updatedRow, skipPressure, {
          actionType: type,
          reason: 'mini_game_skip',
          metadata: {
            skip_streak: skipStreak,
            skip_cost: skipCost,
            skip_cluster: skipSignals.skipCluster,
          },
        });
        updatedRow = pressureResult.row;
        if (!pressureResult.cooldown.active && pressureResult.after >= 100) {
          const struck = await enforceCooldown(env.DB, updatedRow, {
            actionType: type,
            reason: 'mini_game_skip_cooldown',
            metadata: { skip_streak: skipStreak },
          });
          updatedRow = struck.row;
        }
        if (xpAfterDrain < skipCost) {
          const updateResult = await env.DB.prepare(`
            UPDATE blocktopia_progression
            SET xp = ?, win_streak = 0, last_active = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE telegram_id = ? AND xp = ? AND gems = ? AND tier = ? AND win_streak = ?
          `).bind(
            xpAfterDrain,
            verified.telegramId,
            row.xp,
            row.gems,
            row.tier,
            row.win_streak,
          ).run();
          if (changedRows(updateResult) !== 1) return err('Progression changed. Please retry.', 409);
          const progression = {
            telegram_id: verified.telegramId,
            xp: xpAfterDrain,
            gems: clamp((Number(updatedRow.gems) || 0), GEMS_MIN, GEMS_MAX),
            tier: currentTier,
            win_streak: 0,
            rpg_mode_active: true,
            mini_game_cost: miniGameCost,
            skip_cost: skipCost,
            drain_applied: drain,
            drain_per_minute: drainPerMinute,
            upgrades,
            effects,
          };
          logProgressionResponse('/blocktopia/progression/mini-game', progression, {
            ok: false,
            exited: false,
            reason: 'skip_unaffordable',
          });
          return json({
            ok: false,
            exited: false,
            reason: 'skip_unaffordable',
            progression,
            ...buildProgressionEnvelope({ ...updatedRow, rpg_mode_active: 1 }),
          }, 409);
        }
        const nextXp = clamp(xpAfterDrain - skipCost, XP_MIN, XP_MAX);
        const updateResult = await env.DB.prepare(`
          UPDATE blocktopia_progression
          SET xp = ?, win_streak = 0, last_active = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ? AND xp = ? AND gems = ? AND tier = ? AND win_streak = ?
        `).bind(
          nextXp,
          verified.telegramId,
          row.xp,
          row.gems,
          row.tier,
          row.win_streak,
        ).run();
        if (changedRows(updateResult) !== 1) return err('Progression changed. Please retry.', 409);
        await env.DB.prepare(`
          INSERT INTO blocktopia_progression_events
            (id, telegram_id, action, action_type, score, xp_change, gems_change)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          verified.telegramId,
          action,
          type,
          0,
          -skipCost,
          0,
        ).run();
        const progression = {
          telegram_id: verified.telegramId,
          xp: nextXp,
          gems: clamp((Number(updatedRow.gems) || 0), GEMS_MIN, GEMS_MAX),
          tier: currentTier,
          win_streak: 0,
          rpg_mode_active: true,
          mini_game_cost: miniGameCost,
          skip_cost: skipCost,
          drain_applied: drain,
          drain_per_minute: drainPerMinute,
          upgrades,
          effects,
          xp_cost: skipCost,
          xp_net: -skipCost,
          bonus_flags: ['paid_skip', ...(skipSignals.skipCluster ? ['skip_cluster_detected'] : [])],
          node_corruption_applied: false,
          sam_pressure_delta: 1,
        };
        logProgressionResponse('/blocktopia/progression/mini-game', progression, { ok: true });
        return json({
          ok: true,
          progression,
          ...buildProgressionEnvelope({ ...updatedRow, rpg_mode_active: 1 }),
        });
      }
      const rewards = computeBlockTopiaRewards(action, action === 'arcade_score' ? game : type, score, leaderboardCtx, row);
      if (!rewards) return err('Invalid action/type for progression update', 400);
      const rewardType = action === 'arcade_score' ? game : type;
      const hiddenMultiplier = computeMiniGameRewardMultiplier(row, rewardType, score);
      const sameGameSpam = rewardType && row?.mini_game_last_played === rewardType ? 1 : 0;
      if (action === 'mini_game_win') {
        rewards.xp = clamp(rewards.xp * hiddenMultiplier, XP_MIN, XP_MAX);
        if (hiddenMultiplier > 1) {
          rewards.bonus_flags = [...(rewards.bonus_flags || []), `hidden_${hiddenMultiplier}x`];
        }
        if (sameGameSpam) {
          rewards.xp = Math.floor(rewards.xp * 0.65);
          rewards.gems = Math.floor(rewards.gems * 0.5);
          rewards.bonus_flags = [...(rewards.bonus_flags || []), 'same_game_spam_penalty'];
        }
      }
      if (action === 'arcade_score') {
        rewards.xp = clamp(Math.floor(rewards.xp * TELEGRAM_SYNC_XP_MULTIPLIER), XP_MIN, XP_MAX);
        const factionMultiplier = factionXpMultiplier(row?.faction);
        rewards.xp = clamp(Math.floor(rewards.xp * factionMultiplier), XP_MIN, XP_MAX);
        rewards.faction_multiplier = factionMultiplier;
        const perGameAllowed = await enforceArcadeGameHourlyLimit(env.DB, verified.telegramId, game);
        if (!perGameAllowed) return err('Arcade rewards capped for this game this hour.', 429);
        const awardedLastMinute = await getArcadeXpAwardedLastMinute(env.DB, verified.telegramId);
        if (awardedLastMinute >= BLOCKTOPIA_ARCADE_MAX_XP_PER_MINUTE) {
          return err('Arcade XP minute cap reached. Try again shortly.', 429);
        }
        rewards.xp = clamp(
          rewards.xp,
          XP_MIN,
          Math.max(XP_MIN, BLOCKTOPIA_ARCADE_MAX_XP_PER_MINUTE - awardedLastMinute),
        );
      }
      if (action !== 'arcade_score' && xpAfterDrain < miniGameCost) {
        const updateResult = await env.DB.prepare(`
          UPDATE blocktopia_progression
          SET xp = ?, win_streak = 0, last_active = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ? AND xp = ? AND gems = ? AND tier = ? AND win_streak = ?
        `).bind(
          xpAfterDrain,
          verified.telegramId,
          row.xp,
          row.gems,
          row.tier,
          row.win_streak,
        ).run();
        if (changedRows(updateResult) !== 1) return err('Progression changed. Please retry.', 409);
        const progression = {
          telegram_id: verified.telegramId,
          xp: xpAfterDrain,
          gems: clamp((Number(row.gems) || 0), GEMS_MIN, GEMS_MAX),
          tier: currentTier,
          win_streak: 0,
          rpg_mode_active: true,
          mini_game_cost: miniGameCost,
          drain_applied: drain,
          drain_per_minute: drainPerMinute,
        };
        logProgressionResponse('/blocktopia/progression/mini-game', progression, {
          ok: false,
          exited: false,
          reason: 'mini_game_unaffordable',
        });
        return json({
          ok: false,
          exited: false,
          reason: 'mini_game_unaffordable',
          progression,
        }, 409);
      }
      const xpCost = miniGameCost;
      const xpLossPenalty = action === 'mini_game_loss' ? computeMiniGameLossPenalty(currentTier) : 0;
      let nextRow = row;
      if (action === 'mini_game_win' || action === 'mini_game_loss') {
        nextRow = await resetMiniGameSkipCounter(env.DB, row, type);
      } else if (action === 'arcade_score') {
        nextRow = await advanceMiniGameEntropy(env.DB, verified.telegramId, game).then((seed) => ({
          ...row,
          mini_game_last_played: game,
          mini_game_entropy_seed: seed,
        }));
      }
      const heatTier = getNetworkHeatTier(row.network_heat);
      const pressureSignals = await buildPressureSignals(env.DB, nextRow, {
        targetType: action === 'arcade_score' ? 'arcade_score' : action,
        targetId: rewardType,
        gameType: rewardType,
      });
      let pressureDelta = 0;
      if (action === 'arcade_score') pressureDelta += Math.max(0, pressureSignals.sameGameChain - 1);
      if (action === 'mini_game_loss') pressureDelta += 2;
      if (sameGameSpam) pressureDelta += 3;
      const pressureApplied = pressureDelta > 0
        ? await applyPressureDelta(env.DB, nextRow, pressureDelta, {
          actionType: rewardType,
          reason: action,
          metadata: { same_game_spam: sameGameSpam, pressureSignals },
        })
        : { row: nextRow, after: Number(nextRow.player_pressure_score) || 0, tier: getPpsTier(nextRow.player_pressure_score), cooldown: guarded.cooldown };
      nextRow = pressureApplied.row;
      rewards.xp = Math.floor(rewards.xp * pressureApplied.tier.xpMultiplier);
      if (heatTier > 0 && action !== 'mini_game_loss') {
        rewards.xp = Math.max(0, Math.floor(rewards.xp * Math.max(0.2, 1 - (heatTier * 0.08))));
      }
      const cappedRewards = await applyRewardCaps(env.DB, nextRow, rewards, {
        source: action,
        actionType: rewardType,
        rejectGemOverflow: action === 'arcade_score',
      });
      rewards.xp = cappedRewards.xp;
      rewards.gems = cappedRewards.gems;
      const xpBeforeOutcome = clamp(xpAfterDrain - xpCost, XP_MIN, XP_MAX);
      let tentativeXp = clamp(xpBeforeOutcome - xpLossPenalty + rewards.xp, XP_MIN, XP_MAX);
      if (action === 'mini_game_loss' && xpBeforeOutcome > BLOCKTOPIA_SURVIVAL_XP_FLOOR) {
        tentativeXp = Math.max(BLOCKTOPIA_SURVIVAL_XP_FLOOR, tentativeXp);
      }
      const nextXp = tentativeXp;
      const nextGems = clamp((Number(nextRow.gems) || 0) + rewards.gems, GEMS_MIN, GEMS_MAX);
      const currentStreak = Math.max(0, Math.floor(Number(nextRow.win_streak) || 0));
      let nextTier = currentTier;
      let nextWinStreak = currentStreak;
      if (action === 'mini_game_win') {
        nextWinStreak += 1;
        nextTier += 1;
        if (nextWinStreak >= 3) nextTier += 1;
      } else if (action === 'mini_game_loss') {
        nextTier -= 1;
        nextWinStreak = 0;
      }
      nextTier = clamp(nextTier, TIER_MIN, TIER_MAX);

      const updateResult = await env.DB.prepare(`
        UPDATE blocktopia_progression
        SET xp = ?, gems = ?, tier = ?, win_streak = ?, last_active = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ? AND xp = ? AND gems = ? AND tier = ? AND win_streak = ?
      `).bind(
        nextXp,
        nextGems,
        nextTier,
        nextWinStreak,
        verified.telegramId,
        row.xp,
        row.gems,
        row.tier,
        row.win_streak,
      ).run();
      if (changedRows(updateResult) !== 1) return err('Progression changed. Please retry.', 409);

      await env.DB.prepare(`
        INSERT INTO blocktopia_progression_events
          (id, telegram_id, action, action_type, score, xp_change, gems_change)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        verified.telegramId,
        action,
        action === 'arcade_score' ? game : type,
        rewards.score,
        rewards.xp - xpCost - xpLossPenalty,
        rewards.gems,
      ).run();

      const syncedMultiplierApplied = action === 'arcade_score' ? TELEGRAM_SYNC_XP_MULTIPLIER : 1;
      const progression = {
        telegram_id: verified.telegramId,
        xp: nextXp,
        gems: nextGems,
        tier: nextTier,
        win_streak: nextWinStreak,
        drain_applied: drain,
        drain_per_minute: drainPerMinute,
        rpg_mode_active: true,
        upgrades,
        effects,
        xp_awarded: rewards.xp,
        xp_cost: xpCost,
        xp_loss_penalty: xpLossPenalty,
        xp_net: rewards.xp - xpCost - xpLossPenalty,
        gems_awarded: rewards.gems,
        xp_base: rewards.base_xp || 0,
        xp_bonus: rewards.bonus_xp || 0,
        bonus_flags: rewards.bonus_flags || [],
        gem_chance: rewards.gem_chance || 0,
        node_corruption_applied: action === 'mini_game_loss',
        sam_pressure_delta: action === 'mini_game_loss' ? 7 : -3,
        leaderboard: rewards.leaderboard || null,
        synced_multiplier: syncedMultiplierApplied,
        faction: normalizeFaction(row?.faction),
        faction_multiplier: rewards.faction_multiplier || 1,
        heat_tier: heatTier,
        hidden_reward_multiplier: action === 'mini_game_win' ? hiddenMultiplier : 1,
        reward_cap_flags: cappedRewards.flags || [],
      };
      logProgressionResponse('/blocktopia/progression/mini-game', progression, { ok: true });
      return json({
        ok: true,
        progression,
        ...buildProgressionEnvelope({ ...nextRow, rpg_mode_active: 1 }),
      });
    } catch (error) {
      logBlockTopiaFailure('mini_game_sync_failed', {
        path,
        telegramId: verified.telegramId,
        action,
        type,
        game,
        score,
        message: error?.message || String(error),
      });
      return err('Failed to sync mini-game progression', 500);
    }
  }

  if (path === '/blocktopia/progression/reset' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return err('Invalid JSON'); }
    const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
    if (verified.error) return err(verified.error, verified.status || 401);

    try {
      await env.DB.batch([
        env.DB.prepare(
          `DELETE FROM blocktopia_progression_events WHERE telegram_id = ?`
        ).bind(verified.telegramId),
        env.DB.prepare(
          `DELETE FROM blocktopia_progression WHERE telegram_id = ?`
        ).bind(verified.telegramId),
        env.DB.prepare(
          `INSERT INTO blocktopia_progression (telegram_id, xp, gems, tier, win_streak, last_active, updated_at)
           VALUES (?, 0, 0, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT(telegram_id) DO UPDATE SET
             xp = 0, gems = 0, tier = 1, win_streak = 0,
             player_pressure_score = 0, pps_updated_at = CURRENT_TIMESTAMP,
             cooldown_strikes = 0, last_cooldown_at = NULL,
             mini_game_skip_count = 0, mini_game_last_played = NULL, mini_game_entropy_seed = 0,
             last_active = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`
        ).bind(verified.telegramId),
      ]);

      const progression = {
        telegram_id: verified.telegramId,
        xp: 0,
        gems: 0,
        tier: 1,
        win_streak: 0,
        rpg_mode_active: false,
        reset: true,
      };
      logProgressionResponse('/blocktopia/progression/reset', progression, { ok: true, reason: 'reset' });
      return json({
        ok: true,
        progression,
        ...buildProgressionEnvelope({ telegram_id: verified.telegramId, rpg_mode_active: 0 }),
      });
    } catch (error) {
      logBlockTopiaFailure('reset_failed', {
        path,
        telegramId: verified.telegramId,
        message: error?.message || String(error),
      });
      return err('Failed to reset Block Topia progression', 500);
    }
  }

  return null;
}
