function asTrimmedLines(values) {
  if (!Array.isArray(values)) return [];
  const unique = new Set();
  const lines = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    lines.push(text);
  }
  return lines;
}

function extractCanonFacts(canonBible) {
  const facts = Array.isArray(canonBible?.all_facts) ? canonBible.all_facts : [];
  return asTrimmedLines(
    facts
      .filter((entry) => entry?.status === 'VERIFIED' || entry?.status === 'verified')
      .map((entry) => entry?.fact),
  );
}

export function buildCanonLore({ canonBible, legacyLoreFeed }) {
  const canonFacts = extractCanonFacts(canonBible);
  if (canonFacts.length) {
    return {
      source: 'canon',
      truthSource: '/wiki/bibles/block-topia.json',
      fallbackUsed: false,
      feedLines: canonFacts.slice(0, 12),
      npcRumors: canonFacts.slice(0, 8),
    };
  }

  const fallbackRumors = asTrimmedLines(legacyLoreFeed?.npc_rumors || []).slice(0, 8);
  const fallbackDistrictFlavor = asTrimmedLines(
    (legacyLoreFeed?.districts || [])
      .flatMap((district) => district?.flavor || []),
  ).slice(0, 12);

  return {
    source: 'fallback',
    truthSource: '/games/data/blocktopia-lore-feed.json',
    fallbackUsed: true,
    feedLines: fallbackDistrictFlavor,
    npcRumors: fallbackRumors,
  };
}
