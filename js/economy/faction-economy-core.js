/**
 * FACTION ECONOMY CORE v1
 * Links XP, factions, territory, and seasons into a unified reward economy
 * Additive layer only — does not replace ranking rules or core XP logic
 */

(function () {

  const ECONOMY = {
    xpToPower: 0.02,
    territoryBonus: 0.5,
    seasonMultiplier: 1.0
  };

  function getSeasonMultiplier() {
    const s = window.SEASON_CYCLE?.get?.();
    if (!s) return 1;

    // simple scaling per season id
    return 1 + (s.id * 0.05);
  }

  function applyXPReward(xpAmount) {
    const factions = window.FACTIONS?.get?.();
    if (!factions) return;

    const multiplier = getSeasonMultiplier();

    // distribute influence across factions based on economy rules
    Object.keys(factions).forEach(key => {
      const gain = xpAmount * ECONOMY.xpToPower * multiplier;
      factions[key].power += gain;
    });

    window.FACTIONS.save?.(factions);

    window.GK_BUS?.emit('economy:xp_applied', {
      xpAmount,
      multiplier
    });
  }

  function applyTerritoryReward(zoneCount) {
    const factions = window.FACTIONS?.get?.();
    if (!factions) return;

    const bonus = zoneCount * ECONOMY.territoryBonus;

    // reward dominant faction slightly
    let top = Object.entries(factions)
      .sort((a,b) => b[1].power - a[1].power)[0];

    if (top) {
      factions[top[0]].power += bonus;
    }

    window.FACTIONS.save?.(factions);

    window.GK_BUS?.emit('economy:territory_applied', {
      zoneCount,
      bonus
    });
  }

  window.FACTION_ECONOMY = {
    applyXPReward,
    applyTerritoryReward
  };

})();