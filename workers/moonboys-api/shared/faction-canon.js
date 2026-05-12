const FACTION_UNALIGNED = 'unaligned';

const CANONICAL_FACTION_KEYS = Object.freeze([
  'hard-fork-rockers',
  'rugpull-miners',
  'graffpunks',
  'blockchain-furies',
  'crypto-moongirls',
  'blockstars',
  'all-city-bulls',
  'nomad-bears',
  'crypto-stoned-boys',
]);

const FACTION_ALIASES = Object.freeze({
  'diamond-hands': 'hard-fork-rockers',
  diamond_hands: 'hard-fork-rockers',
  diamondhands: 'hard-fork-rockers',
  'hodl-warriors': 'rugpull-miners',
  hodl_warriors: 'rugpull-miners',
  hodlwarriors: 'rugpull-miners',
  'rugpull-minors': 'rugpull-miners',
  rugpull_minors: 'rugpull-miners',
  rugpullminors: 'rugpull-miners',
  'graff-punks': 'graffpunks',
  graff_punks: 'graffpunks',
});

const FACTION_XP_MULTIPLIERS = Object.freeze({
  'hard-fork-rockers': 1.1,
  'rugpull-miners': 1.15,
  graffpunks: 1.12,
});

function normalizeFaction(value) {
  const cleaned = String(value || '').trim().toLowerCase();
  if (CANONICAL_FACTION_KEYS.includes(cleaned)) return cleaned;
  if (FACTION_ALIASES[cleaned]) return FACTION_ALIASES[cleaned];
  return FACTION_UNALIGNED;
}

function getFactionXpMultiplier(faction) {
  const key = normalizeFaction(faction);
  return FACTION_XP_MULTIPLIERS[key] || 1;
}

export {
  CANONICAL_FACTION_KEYS,
  FACTION_ALIASES,
  FACTION_UNALIGNED,
  FACTION_XP_MULTIPLIERS,
  normalizeFaction,
  getFactionXpMultiplier,
};
