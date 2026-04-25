import { buildCanonState } from './canon-adapter.js';
const BASE = '/games/block-topia';

async function loadJson(path, fallback) {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed ${path}: ${response.status}`);
    }
    return await response.json();
  } catch {
    return fallback;
  }
}

export async function loadUnifiedData() {
  const [
    districts,
    factions,
    samPhases,
    npcArchetypes,
    questModel,
    seasonModel,
    roomModel,
    legacyMap,
    legacyNpcProfiles,
    legacySeason,
    legacyLore,
    canonBible,
    legacyAssets,
    assetManifest,
  ] = await Promise.all([
    loadJson(`${BASE}/data/districts.json`, { districts: [] }),
    loadJson(`${BASE}/data/factions.json`, { primary: {}, secondary: {} }),
    loadJson(`${BASE}/data/sam-phases.json`, { phases: [] }),
    loadJson(`${BASE}/data/npc-archetypes.json`, { split: {}, archetypes: [] }),
    loadJson(`${BASE}/data/quest-model.json`, { daily: [], weekly: [], seasonal: [], dynamicHooks: [] }),
    loadJson(`${BASE}/data/season-model.json`, { cycleDays: 90 }),
    loadJson(`${BASE}/data/room-model.json`, { id: 'city', maxPlayers: 2 }),
    loadJson('/games/data/blocktopia-map.json', {}),
    loadJson('/games/data/blocktopia-npc-profiles.json', { profiles: [] }),
    loadJson('/games/data/blocktopia-season.json', {}),
    loadJson('/games/data/blocktopia-lore-feed.json', {}),
    loadJson('/wiki/bibles/block-topia.json', {}),
    loadJson('/games/data/blocktopia-asset-pack.json', {}),
    loadJson(`${BASE}/assets/manifest.json`, {}),
  ]);

  let canonState;
  try {
    canonState = buildCanonState({
      canonBible,
      seasonModel,
      legacyLoreFeed: legacyLore,
      districts: districts?.districts || [],
      factions,
      samPhases,
    });
  } catch {
    canonState = buildCanonState({
      canonBible: {},
      seasonModel,
      legacyLoreFeed: legacyLore,
      districts: districts?.districts || [],
      factions,
      samPhases,
    });
  }

  return {
    districts,
    factions,
    samPhases,
    npcArchetypes,
    questModel,
    seasonModel,
    roomModel,
    canonBible,
    canon: canonState,
    canonAdapter: canonState,
    canonLore: canonState.canonLore,
    legacy: {
      map: legacyMap,
      npcProfiles: legacyNpcProfiles,
      season: legacySeason,
      lore: legacyLore,
      assets: legacyAssets,
      manifest: assetManifest,
      sourceFiles: [
        '/games/block-topia-street-signal-3008-monster.html',
        '/games/block-topia-street-signal-3008.html',
        '/games/block-topia-street-signal-3008-phaser.html',
        '/games/block-topia-revolt/network.js',
        '/games/block-topia-revolt/main.js',
        '/games/block-topia-iso/main.js',
      ],
    },
  };
}
