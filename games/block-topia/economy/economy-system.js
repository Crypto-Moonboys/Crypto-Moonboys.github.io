const MINE_DURATION_MS = 8 * 60 * 60 * 1000;
const DAILY_GEM_CAP = 20;

const TIER_MODEL = [
  { tier: 1, maxGems: 5, multiplier: 1.0, unlockXp: 0, unlockGems: 0 },
  { tier: 2, maxGems: 12, multiplier: 1.15, unlockXp: 1200, unlockGems: 12 },
  { tier: 3, maxGems: 20, multiplier: 1.3, unlockXp: 3600, unlockGems: 28 },
];

const RARITY = {
  common: { mult: 1.0 },
  rare: { mult: 1.2 },
  epic: { mult: 1.5 },
  glitch: { mult: 1.35 },
};

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value) || 0);
  return Math.max(min, Math.min(max, n));
}

function weightedMineBonusRoll(rng = Math.random) {
  const r = rng();
  if (r <= 0.01) return 3;
  if (r <= 0.06) return 1.5;
  if (r <= 0.21) return 1.2;
  return 1;
}

function getTierFromProgress(xp = 0, spentGems = 0) {
  let current = TIER_MODEL[0];
  for (const tier of TIER_MODEL) {
    if (xp >= tier.unlockXp && spentGems >= tier.unlockGems) current = tier;
  }
  return current;
}

export function createEconomySystem(state, hooks = {}) {
  const economy = state.economy || (state.economy = {});
  economy.xp = clampInt(economy.xp ?? state.player?.xp ?? 0);
  economy.gems = clampInt(economy.gems ?? 0);
  economy.spentGems = clampInt(economy.spentGems ?? 0);
  economy.dailyGemEarned = clampInt(economy.dailyGemEarned ?? 0);
  economy.dailyResetKey = economy.dailyResetKey || new Date().toISOString().slice(0, 10);
  economy.weapon = economy.weapon || { level: 1, rarity: 'common' };
  economy.mine = economy.mine || { active: false, gemsLoaded: 0, tier: 1, startedAt: 0, claimAt: 0 };

  function syncTier() {
    const nextTier = getTierFromProgress(economy.xp, economy.spentGems);
    economy.mine.tier = nextTier.tier;
    return nextTier;
  }

  function syncDay(now = new Date()) {
    const key = now.toISOString().slice(0, 10);
    if (key !== economy.dailyResetKey) {
      economy.dailyResetKey = key;
      economy.dailyGemEarned = 0;
    }
  }

  function grantXp(amount, source = 'system') {
    const delta = clampInt(amount);
    economy.xp += delta;
    if (state.player) state.player.xp = economy.xp;
    syncTier();
    hooks.onXp?.({ amount: delta, totalXp: economy.xp, source });
    return delta;
  }

  function grantGems(amount, source = 'system') {
    syncDay();
    const allowed = Math.max(0, DAILY_GEM_CAP - economy.dailyGemEarned);
    const delta = Math.min(clampInt(amount), allowed);
    if (!delta) return 0;
    economy.gems += delta;
    economy.dailyGemEarned += delta;
    hooks.onGems?.({ amount: delta, totalGems: economy.gems, source, capped: delta < amount });
    return delta;
  }

  function getWeaponUpgradeCost(level = economy.weapon.level) {
    const rarityKey = economy.weapon.rarity in RARITY ? economy.weapon.rarity : 'common';
    const rarityMult = RARITY[rarityKey].mult;
    return {
      xpCost: Math.ceil(100 * (level ** 1.4) * rarityMult),
      gemCost: Math.ceil(2 * level * rarityMult),
    };
  }

  function upgradeWeapon() {
    const cost = getWeaponUpgradeCost();
    if (economy.xp < cost.xpCost || economy.gems < cost.gemCost) return false;
    economy.xp -= cost.xpCost;
    economy.gems -= cost.gemCost;
    economy.spentGems += cost.gemCost;
    economy.weapon.level += 1;
    syncTier();
    hooks.onWeaponUpgrade?.({ level: economy.weapon.level, cost });
    return true;
  }

  function emergencyGemToXp(gems = 1) {
    const spend = clampInt(gems, 1, economy.gems);
    if (!spend) return 0;
    economy.gems -= spend;
    economy.spentGems += spend;
    const xp = spend * 25;
    grantXp(xp, 'gem-convert');
    return xp;
  }

  function startMine(gemsLoaded) {
    syncTier();
    const tierInfo = TIER_MODEL[economy.mine.tier - 1] || TIER_MODEL[0];
    const gems = clampInt(gemsLoaded, 1, Math.min(tierInfo.maxGems, economy.gems));
    if (!gems || economy.mine.active) return false;
    economy.gems -= gems;
    economy.spentGems += gems;
    economy.mine.active = true;
    economy.mine.gemsLoaded = gems;
    economy.mine.startedAt = Date.now();
    economy.mine.claimAt = economy.mine.startedAt + MINE_DURATION_MS;
    hooks.onMineStarted?.({ gemsLoaded: gems, claimAt: economy.mine.claimAt, tier: tierInfo.tier });
    return true;
  }

  function claimMine(rng = Math.random) {
    if (!economy.mine.active || Date.now() < economy.mine.claimAt) return null;
    const tierInfo = TIER_MODEL[economy.mine.tier - 1] || TIER_MODEL[0];
    const bonus = weightedMineBonusRoll(rng);
    const xp = Math.round(economy.mine.gemsLoaded * 40 * tierInfo.multiplier * bonus);
    economy.mine.active = false;
    const result = {
      xp,
      bonus,
      gemsLoaded: economy.mine.gemsLoaded,
      tier: tierInfo.tier,
    };
    economy.mine.gemsLoaded = 0;
    economy.mine.startedAt = 0;
    economy.mine.claimAt = 0;
    grantXp(xp, 'mine-claim');
    hooks.onMineClaimed?.(result);
    return result;
  }

  function applyDuelRewards({ win = false, damageDealt = 0, jackpot = false } = {}) {
    const baseXp = 100 + Math.round((Number(damageDealt) || 0) * 0.5);
    const xp = Math.round(baseXp * (win ? 2 : 1) * (jackpot ? 5 : 1));
    grantXp(xp, 'duel');
    const gemsFloat = win ? 0.75 : 0.35;
    const gems = Math.max(0, Math.round(gemsFloat));
    grantGems(gems, 'duel');
    return { xp, gems };
  }

  function getTicker() {
    syncTier();
    return {
      xp: economy.xp,
      gems: economy.gems,
      mineActive: economy.mine.active,
      mineClaimInMs: economy.mine.active ? Math.max(0, economy.mine.claimAt - Date.now()) : 0,
      mineTier: economy.mine.tier,
      weaponLevel: economy.weapon.level,
      weaponRarity: economy.weapon.rarity,
    };
  }

  return {
    grantXp,
    grantGems,
    getWeaponUpgradeCost,
    upgradeWeapon,
    emergencyGemToXp,
    startMine,
    claimMine,
    applyDuelRewards,
    getTicker,
    syncTier,
  };
}
