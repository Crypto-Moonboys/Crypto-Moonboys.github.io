function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function sanitizeTier(rawTier) {
  return clamp(Math.floor(Number(rawTier) || 1), 1, 50);
}

export function computeTierScale(rawTier) {
  const tier = sanitizeTier(rawTier);
  return 1 + (tier * 0.05);
}

export function computeTierDifficulty(rawTier) {
  const tier = sanitizeTier(rawTier);
  const scale = computeTierScale(tier);
  return { tier, scale };
}
