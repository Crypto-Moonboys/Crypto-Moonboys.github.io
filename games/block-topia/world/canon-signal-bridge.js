function toKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function uniqLines(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

const TAG_DISTRICT_PRESSURE = 'district_under_pressure';
const TAG_NODE_INSTABILITY = 'node_instability';
const TAG_LORE_ALERT = 'lore_alert';
const TAG_WIKI_HOOK_EVENT = 'wiki_hook_event';
const TAG_SAM_SURGE = 'sam_surge';
const TAG_FACTION_IMBALANCE = 'faction_imbalance';
const SAM_PRESSURE_MULTIPLIER = 5;
const DISTRICT_PRESSURE_MULTIPLIER = 20;
const PRIMARY_FACTION_PRESSURE_MULTIPLIER = 6;
const SECONDARY_FACTION_PRESSURE_MULTIPLIER = 5;

function selectDistrictBySeed(signal, districtList) {
  if (!districtList.length) return null;
  const seed = Math.abs(
    String(signal?.id || '')
      .split('')
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0),
  );
  return districtList[seed % districtList.length];
}

function inferEventTags(signal, context = {}) {
  const tags = new Set((signal?.tags || []).map((tag) => toKey(tag)));
  const lane = String(signal?.lane || '').toLowerCase();
  const priority = Number(signal?.priority || 0);
  if (lane === 'world' && priority >= 4) tags.add(TAG_DISTRICT_PRESSURE);
  if (lane === 'ops') tags.add(TAG_NODE_INSTABILITY);
  if (lane === 'clue') tags.add(TAG_LORE_ALERT);
  if (lane === 'quest') tags.add(TAG_WIKI_HOOK_EVENT);
  if (context?.samSurge) tags.add(TAG_SAM_SURGE);
  if (context?.factionImbalance) tags.add(TAG_FACTION_IMBALANCE);
  return [...tags];
}

/**
 * buildCanonSignalState — spec-required pure function entry point.
 * Takes canonState (from buildCanonState/buildCanonAdapter) and liveSignals (array)
 * and returns { districtSignalState, factionSignalState, samNarrativeState, worldBulletins }.
 */
export function buildCanonSignalState(canonState = {}, liveSignals = []) {
  const districts = Object.values(canonState.districtLoreById || {}).map((district) => ({
    id: district.districtId,
    name: district.districtName,
  }));
  const bridge = createCanonSignalBridge({
    canon: canonState,
    districts,
    factions: canonState.factionTruth || {},
  });
  return bridge.interpret({ signals: Array.isArray(liveSignals) ? liveSignals : [] });
}

export function createCanonSignalBridge({ canon, districts, factions } = {}) {
  const districtList = Array.isArray(districts) ? districts : [];
  const districtByKey = new Map();
  for (const district of districtList) {
    districtByKey.set(toKey(district.id), district);
    districtByKey.set(toKey(district.name), district);
  }

  const primaryFaction = String(factions?.primary?.name || 'Liberators');
  const secondaryFaction = String(factions?.secondary?.name || 'Wardens');

  function districtFromSignal(signal) {
    const tags = Array.isArray(signal?.tags) ? signal.tags : [];
    for (const rawTag of tags) {
      const match = districtByKey.get(toKey(rawTag));
      if (match) return match;
    }
    return selectDistrictBySeed(signal, districtList);
  }

  function interpret(snapshot = {}) {
    const signals = Array.isArray(snapshot?.signals) ? snapshot.signals : [];
    const districtSignalState = {};
    const factionSignalState = {
      [primaryFaction]: { pressure: 0, notes: [] },
      [secondaryFaction]: { pressure: 0, notes: [] },
    };
    const activeCanonSignals = [];
    const bulletins = [];
    const allEventTags = new Set();
    let samPressure = 0;

    for (const signal of signals) {
      const district = districtFromSignal(signal);
      const districtId = district?.id || '';
      const districtName = district?.name || 'City Grid';
      const priority = Math.max(1, Math.min(5, Number(signal?.priority || 3)));
      const lane = String(signal?.lane || 'world');
      const samSurge = lane === 'world' && priority >= 4;
      const factionImbalance = lane === 'ops' && priority >= 3;
      const eventTags = inferEventTags(signal, { samSurge, factionImbalance });
      eventTags.forEach((tag) => allEventTags.add(tag));
      if (samSurge) samPressure += priority * SAM_PRESSURE_MULTIPLIER;

      if (districtId) {
        const current = districtSignalState[districtId] || {
          districtId,
          districtName,
          pressure: 0,
          warnings: [],
          notes: [],
          eventTags: [],
        };
        current.pressure = Math.max(current.pressure, priority * DISTRICT_PRESSURE_MULTIPLIER);
        if (signal?.worldFeed) current.notes.push(String(signal.worldFeed));
        if (signal?.clueEvent) current.warnings.push(String(signal.clueEvent));
        current.eventTags = uniqLines(current.eventTags.concat(eventTags));
        districtSignalState[districtId] = current;
      }
      // Signals without district affinity remain global canon pressure signals
      // and are still reflected through world bulletins / SAM narrative state.

      if (factionImbalance) {
        factionSignalState[primaryFaction].pressure += priority * PRIMARY_FACTION_PRESSURE_MULTIPLIER;
        factionSignalState[secondaryFaction].pressure += priority * SECONDARY_FACTION_PRESSURE_MULTIPLIER;
        if (signal?.worldFeed) {
          factionSignalState[primaryFaction].notes.push(signal.worldFeed);
          factionSignalState[secondaryFaction].notes.push(signal.worldFeed);
        }
      }

      activeCanonSignals.push({
        id: signal?.id || '',
        lane,
        priority,
        districtId,
        districtName,
        npcLine: String(signal?.npcLine || '').trim(),
        worldFeed: String(signal?.worldFeed || '').trim(),
        questPulse: String(signal?.questPulse || '').trim(),
        clueEvent: String(signal?.clueEvent || '').trim(),
        eventTags,
        expiresAt: signal?.expiresAt || null,
      });

      if (signal?.worldFeed) bulletins.push(signal.worldFeed);
      if (signal?.questPulse && lane === 'quest') bulletins.push(`Mission pulse: ${signal.questPulse}`);
    }

    const canonBulletins = uniqLines([
      ...bulletins,
      ...(canon?.worldFlavorPool || []).slice(0, 3),
    ]).slice(0, 6);

    const samNarrativeState = {
      pressure: Math.max(0, Math.min(100, samPressure)),
      tone: uniqLines([
        ...(canon?.samTruth?.tone || []),
        ...(canonBulletins[0] ? [canonBulletins[0]] : []),
      ]).slice(0, 3),
      warnings: uniqLines(
        activeCanonSignals
          .filter((signal) => signal.lane === 'world' || signal.lane === 'clue')
          .map((signal) => signal.clueEvent || signal.worldFeed),
      ).slice(0, 3),
      eventTags: [...allEventTags].filter((tag) => tag.includes('sam')),
    };

    return {
      activeCanonSignals,
      districtSignalState,
      factionSignalState: {
        [primaryFaction]: {
          pressure: Math.max(0, Math.min(100, factionSignalState[primaryFaction].pressure)),
          notes: uniqLines(factionSignalState[primaryFaction].notes).slice(0, 3),
        },
        [secondaryFaction]: {
          pressure: Math.max(0, Math.min(100, factionSignalState[secondaryFaction].pressure)),
          notes: uniqLines(factionSignalState[secondaryFaction].notes).slice(0, 3),
        },
      },
      samNarrativeState,
      worldBulletins: canonBulletins,
      eventTags: [...allEventTags],
      wikiHooks: canon?.wikiHooks || [],
    };
  }

  return {
    interpret,
  };
}
