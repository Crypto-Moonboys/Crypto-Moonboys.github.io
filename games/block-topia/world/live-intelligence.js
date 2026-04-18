import { createCanonSignalBridge } from './canon-signal-bridge.js';

const LIVE_SIGNAL_PATH = '/games/block-topia/data/live-signals.json';

function nowIso() {
  return new Date().toISOString();
}

function isSignalActive(signal, nowMs = Date.now()) {
  if (!signal?.expiresAt) return true;
  const expires = Date.parse(signal.expiresAt);
  if (!Number.isFinite(expires)) return true;
  return expires > nowMs;
}

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)] || null;
}

function normalizeSnapshot(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      schemaVersion: 1,
      generatedAt: nowIso(),
      mode: 'fallback',
      sourceHealth: {},
      signalCount: 0,
      signals: [],
    };
  }

  const signals = Array.isArray(payload.signals) ? payload.signals : [];
  return {
    schemaVersion: payload.schemaVersion || 1,
    generatedAt: payload.generatedAt || nowIso(),
    mode: payload.mode || 'fallback',
    sourceHealth: payload.sourceHealth || {},
    signalCount: signals.length,
    signals,
  };
}

function snapshotFingerprint(snapshot) {
  const generatedAt = String(snapshot?.generatedAt || '');
  const mode = String(snapshot?.mode || '');
  const signals = Array.isArray(snapshot?.signals) ? snapshot.signals : [];
  const ids = signals
    .map((signal) => `${signal?.id || ''}:${signal?.expiresAt || ''}:${signal?.lane || ''}:${signal?.worldFeed || ''}`)
    .join('|');
  return `${generatedAt}::${mode}::${signals.length}::${ids}`;
}

export function createLiveIntelligence(fetchImpl = fetch) {
  let snapshot = normalizeSnapshot(null);
  let fingerprint = snapshotFingerprint(snapshot);
  let canonSignalState = {
    activeCanonSignals: [],
    districtSignalState: {},
    factionSignalState: {},
    samNarrativeState: { pressure: 0, tone: [], warnings: [], eventTags: [] },
    worldBulletins: [],
    eventTags: [],
    wikiHooks: [],
  };
  let canonBridge = null;

  function configureCanonBridge(context = {}) {
    canonBridge = createCanonSignalBridge(context);
    canonSignalState = canonBridge.interpret(snapshot);
    return canonSignalState;
  }

  async function refresh() {
    try {
      const response = await fetchImpl(LIVE_SIGNAL_PATH, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Live signals unavailable: ${response.status}`);
      }
      const payload = await response.json();
      const nextSnapshot = normalizeSnapshot(payload);
      const nextFingerprint = snapshotFingerprint(nextSnapshot);
      const changed = nextFingerprint !== fingerprint;
      if (changed) {
        snapshot = nextSnapshot;
        fingerprint = nextFingerprint;
      }
      if (canonBridge) {
        canonSignalState = canonBridge.interpret(snapshot);
      }
      return {
        snapshot,
        canonSignalState,
        changed,
        error: null,
      };
    } catch (error) {
      return {
        snapshot,
        canonSignalState,
        changed: false,
        error: String(error?.message || error || 'refresh-failed'),
      };
    }
  }

  function getActiveSignals() {
    return snapshot.signals.filter((signal) => isSignalActive(signal));
  }

  function getSignalsByLane(lane) {
    return getActiveSignals().filter((signal) => signal.lane === lane);
  }

  function getWorldFeedLines(limit = 2) {
    const canonBulletins = Array.isArray(canonSignalState?.worldBulletins)
      ? canonSignalState.worldBulletins
      : [];
    if (canonBulletins.length) {
      return canonBulletins.slice(0, limit);
    }
    return getSignalsByLane('world')
      .concat(getSignalsByLane('ops'))
      .slice(0, limit)
      .map((signal) => signal.worldFeed)
      .filter(Boolean);
  }

  function getQuestPulses(limit = 3) {
    const canonSignals = Array.isArray(canonSignalState?.activeCanonSignals)
      ? canonSignalState.activeCanonSignals
      : [];
    const canonPulses = canonSignals
      .map((signal) => signal.questPulse)
      .filter(Boolean);
    if (canonPulses.length) {
      return canonPulses.slice(0, limit);
    }
    return getSignalsByLane('quest')
      .concat(getSignalsByLane('ops'))
      .slice(0, limit)
      .map((signal) => signal.questPulse)
      .filter(Boolean);
  }

  function pickNpcLine(npc) {
    const roleTag = String(npc?.role || '').toLowerCase();
    const districtId = String(npc?.districtId || '').toLowerCase();
    const canonSignals = Array.isArray(canonSignalState?.activeCanonSignals)
      ? canonSignalState.activeCanonSignals
      : [];
    const canonTagged = canonSignals.filter((signal) => {
      const tags = Array.isArray(signal?.eventTags) ? signal.eventTags : [];
      const inDistrict = districtId && String(signal?.districtId || '').toLowerCase() === districtId;
      return inDistrict || tags.includes(roleTag);
    });
    const canonLine = pickRandom(canonTagged)?.npcLine;
    if (canonLine) return canonLine;

    const districtWarnings = canonSignalState?.districtSignalState?.[districtId]?.warnings || [];
    const districtWarningLine = pickRandom(districtWarnings);
    if (districtWarningLine) return districtWarningLine;

    const roleSignals = getActiveSignals().filter((signal) => Array.isArray(signal.tags) && signal.tags.includes(roleTag));
    const pool = roleSignals.length ? roleSignals : getSignalsByLane('npc').concat(getSignalsByLane('ops'));
    return pickRandom(pool)?.npcLine || '';
  }

  function getClueEvents(limit = 2) {
    return getSignalsByLane('clue')
      .concat(getSignalsByLane('ops'))
      .slice(0, limit)
      .map((signal) => ({
        id: signal.id,
        text: signal.clueEvent,
        expiresAt: signal.expiresAt,
      }))
      .filter((entry) => entry.text);
  }

  function getSnapshot() {
    return snapshot;
  }

  function getCanonSignalState() {
    return canonSignalState;
  }

  return {
    refresh,
    getSnapshot,
    configureCanonBridge,
    getCanonSignalState,
    getActiveSignals,
    getSignalsByLane,
    getWorldFeedLines,
    getQuestPulses,
    pickNpcLine,
    getClueEvents,
  };
}
