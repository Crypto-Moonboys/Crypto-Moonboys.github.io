import {
  BLOCKTOPIA_DRAIN_BASE_PER_MINUTE,
  BLOCKTOPIA_DRAIN_MAX_PER_MINUTE,
  BLOCKTOPIA_DRAIN_TIER_STEP,
  BLOCKTOPIA_ENTRY_BASE_COST,
  BLOCKTOPIA_ENTRY_TIER_STEP,
  BLOCKTOPIA_MINI_GAME_COST_BASE,
  BLOCKTOPIA_MINI_GAME_COST_TIER_STEP,
  BLOCKTOPIA_MINI_GAME_GEM_CHANCE_BASE,
  BLOCKTOPIA_MINI_GAME_GEM_CHANCE_CAP,
  BLOCKTOPIA_MINI_GAME_GEM_CHANCE_TIER_STEP,
  BLOCKTOPIA_MINI_GAME_LOSS_BASE,
  BLOCKTOPIA_MINI_GAME_LOSS_TIER_STEP,
  BLOCKTOPIA_MINI_GAME_REWARD_BASE,
  BLOCKTOPIA_MINI_GAME_REWARD_TIER_STEP,
  BLOCKTOPIA_SKIP_COST_MULTIPLIER,
  BLOCKTOPIA_SKIP_STREAK_STEP,
  GEMS_MAX,
  GEMS_MIN,
  TIER_MAX,
  TIER_MIN,
  UPGRADE_EFFECT_CAP,
  UPGRADE_MAX_LEVEL,
  XP_MAX,
  XP_MIN,
} from './config.js';

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeUpgradeLevel(rawLevel) {
  return clamp(Math.floor(Number(rawLevel) || 0), 0, UPGRADE_MAX_LEVEL);
}

export function getUpgradeSnapshot(row = {}) {
  return {
    efficiency: sanitizeUpgradeLevel(row?.upgrade_efficiency),
    signal: sanitizeUpgradeLevel(row?.upgrade_signal),
    defense: sanitizeUpgradeLevel(row?.upgrade_defense),
    gem: sanitizeUpgradeLevel(row?.upgrade_gem),
    npc: sanitizeUpgradeLevel(row?.upgrade_npc),
  };
}

export function buildUpgradeEffects(upgrades = {}) {
  const efficiencyDrainReduction = Math.min(UPGRADE_EFFECT_CAP, 0.05 * (upgrades.efficiency || 0));
  const signalXpBonus = Math.min(UPGRADE_EFFECT_CAP, 0.05 * (upgrades.signal || 0));
  const defenseEaseBonus = Math.min(UPGRADE_EFFECT_CAP, 0.05 * (upgrades.defense || 0));
  const gemDropBonus = Math.min(UPGRADE_EFFECT_CAP, 0.03 * (upgrades.gem || 0));
  const npcAssistBonus = Math.min(UPGRADE_EFFECT_CAP, 0.05 * (upgrades.npc || 0));
  return { efficiencyDrainReduction, signalXpBonus, defenseEaseBonus, gemDropBonus, npcAssistBonus };
}

export function computeUpgradeCost(base, currentLevel) {
  return Math.max(1, Math.floor(base * (currentLevel + 1) * 2));
}

export function computeRpgEntryCost(tier) {
  const safeTier = clamp(Math.floor(Number(tier) || 1), TIER_MIN, TIER_MAX);
  return BLOCKTOPIA_ENTRY_BASE_COST + (safeTier * BLOCKTOPIA_ENTRY_TIER_STEP);
}

export function computeDrainPerMinute(tier, effects = {}) {
  const safeTier = clamp(Math.floor(Number(tier) || 1), TIER_MIN, TIER_MAX);
  const base = Math.min(
    BLOCKTOPIA_DRAIN_MAX_PER_MINUTE,
    BLOCKTOPIA_DRAIN_BASE_PER_MINUTE + (safeTier * BLOCKTOPIA_DRAIN_TIER_STEP),
  );
  const efficiencyBonus = clamp(Number(effects?.efficiencyDrainReduction) || 0, 0, UPGRADE_EFFECT_CAP);
  return Math.max(0, base * (1 - efficiencyBonus));
}

export function computeMiniGameCost(tier) {
  const safeTier = clamp(Math.floor(Number(tier) || 1), TIER_MIN, TIER_MAX);
  return Math.max(1, Math.round(BLOCKTOPIA_MINI_GAME_COST_BASE + (safeTier * BLOCKTOPIA_MINI_GAME_COST_TIER_STEP)));
}

export function computeMiniGameBaseReward(tier) {
  const safeTier = clamp(Math.floor(Number(tier) || 1), TIER_MIN, TIER_MAX);
  return Math.max(0, Math.round(BLOCKTOPIA_MINI_GAME_REWARD_BASE + (safeTier * BLOCKTOPIA_MINI_GAME_REWARD_TIER_STEP)));
}

export function computeMiniGameLossPenalty(tier) {
  const safeTier = clamp(Math.floor(Number(tier) || 1), TIER_MIN, TIER_MAX);
  return Math.max(0, Math.round(BLOCKTOPIA_MINI_GAME_LOSS_BASE + (safeTier * BLOCKTOPIA_MINI_GAME_LOSS_TIER_STEP)));
}

export function computeMiniGameSkipCost(tier, skipStreak = 0) {
  const playCost = computeMiniGameCost(tier);
  const streak = Math.max(0, Math.floor(Number(skipStreak) || 0));
  const multiplier = BLOCKTOPIA_SKIP_COST_MULTIPLIER + (streak * BLOCKTOPIA_SKIP_STREAK_STEP);
  return Math.max(playCost + 1, Math.round(playCost * multiplier));
}

export function computeGemDropChance(tier, effects = {}) {
  const safeTier = clamp(Math.floor(Number(tier) || 1), TIER_MIN, TIER_MAX);
  const baseChance = Math.min(
    BLOCKTOPIA_MINI_GAME_GEM_CHANCE_CAP,
    BLOCKTOPIA_MINI_GAME_GEM_CHANCE_BASE + (safeTier * BLOCKTOPIA_MINI_GAME_GEM_CHANCE_TIER_STEP),
  );
  const bonus = (Number(effects?.gemDropBonus) || 0) * 0.2;
  return clamp(baseChance + bonus, 0, BLOCKTOPIA_MINI_GAME_GEM_CHANCE_CAP);
}

export function computeBlockTopiaRewards(action, type, score, leaderboardCtx = null, progression = {}) {
  const safeAction = String(action || '').trim();
  const safeType = String(type || '').trim().toLowerCase();
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  const upgrades = getUpgradeSnapshot(progression);
  const effects = buildUpgradeEffects(upgrades);
  const streak = Math.max(0, Math.floor(Number(progression?.win_streak) || 0));

  if (safeAction === 'arcade_score') {
    const baseXp = clamp(Math.min(Math.floor(safeScore / 1000), 100), XP_MIN, XP_MAX);
    const trustedRank = Number(leaderboardCtx?.rank || 0);
    const top10Score = Number(leaderboardCtx?.top10PercentScore || 0);
    const top1Score = Number(leaderboardCtx?.top1PercentScore || 0);
    const trustedBestScore = Number(leaderboardCtx?.trustedBestScore || 0);
    const improvementEligible = leaderboardCtx?.improvementEligible === true;
    let bonusXp = 0;
    if (improvementEligible) bonusXp += 10;
    if (top10Score > 0 && safeScore >= top10Score) bonusXp += 20;
    if (top1Score > 0 && safeScore >= top1Score) bonusXp += 50;
    if (trustedRank > 0 && trustedRank <= 100) bonusXp += 10;
    if (trustedRank > 0 && trustedRank <= 50) bonusXp += 20;
    if (trustedRank > 0 && trustedRank <= 10) bonusXp += 50;
    let totalXp = clamp(baseXp + bonusXp, XP_MIN, XP_MAX);
    totalXp = clamp(Math.floor(totalXp * (1 + effects.signalXpBonus)), XP_MIN, XP_MAX);
    return {
      xp: totalXp,
      base_xp: baseXp,
      bonus_xp: bonusXp,
      gems: 0,
      score: safeScore,
      reason: 'validated_arcade_score',
      bonus_flags: [],
      leaderboard: {
        rank: trustedRank,
        top_10_percent_score: top10Score,
        top_1_percent_score: top1Score,
        trusted_best_score: trustedBestScore,
      },
    };
  }
  if (safeAction === 'mini_game_win') {
    const allowedTypes = new Set(['firewall', 'router', 'outbreak', 'circuit']);
    if (!allowedTypes.has(safeType)) return null;
    const bonusFlags = [];
    const tier = clamp(Math.floor(Number(progression?.tier) || 1), TIER_MIN, TIER_MAX);
    let xp = computeMiniGameBaseReward(tier);
    let gems = 0;
    const gemChance = computeGemDropChance(tier, effects);

    const speedBonus = safeScore >= 250 || Math.random() < 0.2;
    const noDamageBonus = safeScore >= 450 || Math.random() < 0.12;
    if (speedBonus) {
      xp += Math.max(2, Math.round(xp * 0.2));
      bonusFlags.push('speed_bonus');
    }
    if (noDamageBonus) {
      xp += Math.max(3, Math.round(xp * 0.25));
      bonusFlags.push('no_damage_bonus');
    }
    if (streak >= 3) {
      xp += Math.max(2, streak);
      bonusFlags.push('streak_bonus');
    }
    xp = clamp(Math.floor(xp * (1 + effects.signalXpBonus)), XP_MIN, XP_MAX);

    if (Math.random() < gemChance) {
      gems += 1;
      bonusFlags.push('gem_drop');
    }
    return {
      xp: clamp(xp, XP_MIN, XP_MAX),
      gems: clamp(gems, GEMS_MIN, GEMS_MAX),
      score: 0,
      bonus_flags: bonusFlags,
      gem_chance: gemChance,
      reason: 'validated_mini_game_win',
    };
  }
  if (safeAction === 'mini_game_loss') {
    const allowedTypes = new Set(['firewall', 'router', 'outbreak', 'circuit']);
    if (!allowedTypes.has(safeType)) return null;
    return { xp: 0, gems: 0, score: 0, bonus_flags: [], reason: 'validated_mini_game_loss' };
  }
  return null;
}

export function applyProgressionDrain(row, now = Date.now(), effects = null) {
  if (Number(row?.rpg_mode_active || 0) !== 1) {
    return {
      drain: 0,
      xpAfterDrain: clamp(Number(row?.xp) || 0, XP_MIN, XP_MAX),
      drainPerMinute: 0,
    };
  }
  const lastMs = row?.last_active ? new Date(row.last_active).getTime() : now;
  const elapsedMs = Math.max(0, now - (Number.isFinite(lastMs) ? lastMs : now));
  const upgradeEffects = effects || buildUpgradeEffects(getUpgradeSnapshot(row));
  const tier = clamp(Math.floor(Number(row?.tier) || 1), TIER_MIN, TIER_MAX);
  const drainPerMinute = computeDrainPerMinute(tier, upgradeEffects);
  const drain = Math.floor((elapsedMs / 60000) * drainPerMinute);
  const xpAfterDrain = clamp((Number(row?.xp) || 0) - drain, XP_MIN, XP_MAX);
  return { drain, xpAfterDrain, drainPerMinute };
}
