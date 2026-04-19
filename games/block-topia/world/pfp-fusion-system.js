const DEFAULT_ASSETS = {
  common: '/games/block-topia/assets/pfp-fighters/fighter-common.svg',
  rare: '/games/block-topia/assets/pfp-fighters/fighter-rare.svg',
  epic: '/games/block-topia/assets/pfp-fighters/fighter-epic.svg',
  glitch: '/games/block-topia/assets/pfp-fighters/fighter-glitch.svg',
};

const TRAIT_MODS = {
  moon_eyes: { samResist: 0.12, title: 'Night-Mode Shield' },
  visor: { timingBonus: 0.08, title: 'Precision Sync' },
  neon_hair: { energyRegenBonus: 6, title: 'Pulse Reactor' },
  mask: { dodgeBonus: 0.09, title: 'Ghost Packet' },
};

function normalizeRarity(rarity = 'common') {
  const key = String(rarity || 'common').toLowerCase();
  if (key === 'rare' || key === 'epic' || key === 'glitch') return key;
  return 'common';
}

function parseTraitMods(traits = []) {
  const mods = { timingBonus: 0, dodgeBonus: 0, energyRegenBonus: 0, samResist: 0 };
  const labels = [];

  for (const rawTrait of traits) {
    const trait = String(rawTrait || '').trim().toLowerCase();
    const data = TRAIT_MODS[trait];
    if (!data) continue;
    mods.timingBonus += data.timingBonus || 0;
    mods.dodgeBonus += data.dodgeBonus || 0;
    mods.energyRegenBonus += data.energyRegenBonus || 0;
    mods.samResist += data.samResist || 0;
    labels.push(data.title || trait);
  }

  return { mods, labels };
}

export function createPfpFusionSystem(config = {}) {
  const assets = { ...DEFAULT_ASSETS, ...(config.assets || {}) };

  function createProfile({ tokenId = 'LOCAL', traits = [], rarity = 'common' } = {}) {
    const normalizedRarity = normalizeRarity(rarity);
    const { mods, labels } = parseTraitMods(traits);
    return {
      tokenId,
      rarity: normalizedRarity,
      traits: [...traits],
      fighterAsset: assets[normalizedRarity] || assets.common,
      passives: labels,
      modifiers: mods,
    };
  }

  function getDisplay(profile = {}) {
    const rarityLabel = String(profile.rarity || 'common').toUpperCase();
    const passives = Array.isArray(profile.passives) && profile.passives.length
      ? profile.passives.join(', ')
      : 'none';
    return {
      fighter: `${rarityLabel}`,
      passives,
      asset: profile.fighterAsset || assets.common,
    };
  }

  function applyDuelRewardModifier(baseRewards = {}, profile = {}) {
    const timingBonus = Number(profile?.modifiers?.timingBonus) || 0;
    const xp = Math.round((Number(baseRewards.xp) || 0) * (1 + timingBonus));
    return {
      ...baseRewards,
      xp,
    };
  }

  return {
    createProfile,
    getDisplay,
    applyDuelRewardModifier,
  };
}
