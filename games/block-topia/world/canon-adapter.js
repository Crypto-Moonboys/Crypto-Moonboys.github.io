const MAX_FACTS = 16;
const MAX_WORLD_FLAVOR = 18;
const MAX_RUMORS = 20;
const MAX_DISTRICT_FALLBACK_FLAVOR_LINES = 2;

function toLines(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function pickVerifiedFacts(canonBible) {
  const facts = Array.isArray(canonBible?.all_facts) ? canonBible.all_facts : [];
  return toLines(
    facts
      .filter((entry) => String(entry?.status || '').toLowerCase() === 'verified')
      .map((entry) => entry?.fact),
  );
}

function canonicalDistrictKeyList(district) {
  const parts = [
    district?.id,
    district?.name,
    ...(String(district?.legacySource || '').split('+').map((v) => v.trim())),
  ];
  return parts
    .map((value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'))
    .filter(Boolean);
}

function buildDistrictLoreById(districts, legacyLoreFeed, worldFlavorPool) {
  const legacyDistricts = Array.isArray(legacyLoreFeed?.districts) ? legacyLoreFeed.districts : [];
  const byId = {};
  for (const district of districts || []) {
    const keys = new Set(canonicalDistrictKeyList(district));
    const matchedLegacy = legacyDistricts.find((entry) => {
      const entryKeys = new Set([
        String(entry?.id || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        String(entry?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      ]);
      for (const key of entryKeys) {
        if (keys.has(key)) return true;
      }
      return false;
    });
    const districtFlavor = toLines(matchedLegacy?.flavor || []);
    byId[district.id] = {
      districtId: district.id,
      districtName: district.name,
      theme: String(matchedLegacy?.theme || '').trim(),
      flavor: districtFlavor.length ? districtFlavor : worldFlavorPool.slice(0, MAX_DISTRICT_FALLBACK_FLAVOR_LINES),
      source: districtFlavor.length ? 'legacy-lore-feed' : 'canon-facts',
    };
  }
  return byId;
}

/**
 * buildCanonState — spec-required entry point.
 * Accepts a single raw data object and delegates to buildCanonAdapter.
 * Returns { districtLoreById, factionTruth, samTruth, worldFlavorPool, npcRumorPool }.
 */
export function buildCanonState(rawCanonData = {}) {
  return buildCanonAdapter({
    canonBible: rawCanonData.canonBible || {},
    seasonModel: rawCanonData.seasonModel || {},
    legacyLoreFeed: rawCanonData.legacyLoreFeed || rawCanonData.legacyLore || {},
    districts: rawCanonData.districts || [],
    factions: rawCanonData.factions || {},
    samPhases: rawCanonData.samPhases || {},
  });
}

export function buildCanonAdapter({
  canonBible,
  seasonModel,
  legacyLoreFeed,
  districts,
  factions,
  samPhases,
}) {
  const canonFacts = pickVerifiedFacts(canonBible).slice(0, MAX_FACTS);
  const baselinePremise = String(legacyLoreFeed?.baseline_premise || '').trim();
  const worldFlavorPool = toLines([
    ...canonFacts,
    baselinePremise,
    ...(legacyLoreFeed?.market_terms || []),
    ...(legacyLoreFeed?.graffiti_terms || []),
  ]).slice(0, MAX_WORLD_FLAVOR);
  const npcRumorPool = toLines([
    ...(legacyLoreFeed?.npc_rumors || []),
    ...canonFacts,
  ]).slice(0, MAX_RUMORS);

  const districtLoreById = buildDistrictLoreById(districts, legacyLoreFeed, worldFlavorPool);

  const factionTruth = {
    primary: factions?.primary || {},
    secondary: factions?.secondary || {},
    switchRules: factions?.switchRules || {},
    source: 'games/block-topia/data/factions.json',
  };

  const samTruth = {
    phases: Array.isArray(samPhases?.phases) ? samPhases.phases : [],
    signalRushHook: samPhases?.signalRushHook || {},
    tone: toLines([
      ...worldFlavorPool.slice(0, 3),
      'SAM pressure is monitored server-side.',
    ]).slice(0, 4),
    source: 'games/block-topia/data/sam-phases.json',
  };

  const wikiHooks = toLines([
    ...(seasonModel?.wikiHooks || []),
    ...(seasonModel?.hooks || []),
    ...(samPhases?.postMutationHooks || []),
  ]);

  const blockTopiaFacts = canonFacts.length ? canonFacts : worldFlavorPool.slice(0, 6);
  const fallbackUsed = canonFacts.length === 0;

  return {
    source: fallbackUsed ? 'fallback' : 'canon',
    fallbackUsed,
    truthSource: fallbackUsed ? '/games/data/blocktopia-lore-feed.json' : '/wiki/bibles/block-topia.json',
    districtLoreById,
    factionTruth,
    samTruth,
    blockTopiaFacts,
    worldFlavorPool,
    npcRumorPool,
    wikiHooks,
    canonLore: {
      source: fallbackUsed ? 'fallback' : 'canon',
      fallbackUsed,
      truthSource: fallbackUsed ? '/games/data/blocktopia-lore-feed.json' : '/wiki/bibles/block-topia.json',
      feedLines: worldFlavorPool,
      npcRumors: npcRumorPool,
      districtLoreById,
      wikiHooks,
    },
  };
}
