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

export function createLiveIntelligence(fetchImpl = fetch) {
  let snapshot = normalizeSnapshot(null);

  async function refresh() {
    try {
      const response = await fetchImpl(LIVE_SIGNAL_PATH, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Live signals unavailable: ${response.status}`);
      }
      const payload = await response.json();
      snapshot = normalizeSnapshot(payload);
      return snapshot;
    } catch {
      return snapshot;
    }
  }

  function getActiveSignals() {
    return snapshot.signals.filter((signal) => isSignalActive(signal));
  }

  function getSignalsByLane(lane) {
    return getActiveSignals().filter((signal) => signal.lane === lane);
  }

  function getWorldFeedLines(limit = 2) {
    return getSignalsByLane('world')
      .concat(getSignalsByLane('ops'))
      .slice(0, limit)
      .map((signal) => signal.worldFeed)
      .filter(Boolean);
  }

  function getQuestPulses(limit = 3) {
    return getSignalsByLane('quest')
      .concat(getSignalsByLane('ops'))
      .slice(0, limit)
      .map((signal) => signal.questPulse)
      .filter(Boolean);
  }

  function pickNpcLine(npc) {
    const roleTag = String(npc?.role || '').toLowerCase();
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

  return {
    refresh,
    getSnapshot,
    getActiveSignals,
    getSignalsByLane,
    getWorldFeedLines,
    getQuestPulses,
    pickNpcLine,
    getClueEvents,
  };
}
