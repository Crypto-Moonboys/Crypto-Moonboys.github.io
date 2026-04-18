function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toTitle(text) {
  const clean = String(text || 'Signal Operation').trim();
  if (!clean) return 'Signal Operation';
  const compact = clean.replace(/\s+/g, ' ');
  return compact.length > 38 ? `${compact.slice(0, 35)}...` : compact;
}

const BASE_SIGNAL_XP = 95;
const XP_PER_PRIORITY = 28;
const MIN_SIGNAL_XP = 95;
const MAX_SIGNAL_XP = 260;

function hashSeed(text) {
  const raw = String(text || '');
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function laneToOperationLabel(lane) {
  if (lane === 'world') return 'Investigate Instability';
  if (lane === 'ops') return 'Intercept / Secure / Trace';
  if (lane === 'clue') return 'Locate Hidden Relay';
  if (lane === 'quest') return 'Direct Mission Pulse';
  return 'Signal Operation';
}

function normalizeTagLabel(tag) {
  const raw = String(tag || '').replace(/[_-]+/g, ' ').trim();
  if (!raw) return '';
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

function deriveCanonTag(signal, canonSignalState) {
  const tags = Array.isArray(signal?.eventTags) ? signal.eventTags : [];
  if (tags.length) return tags[0];
  const globalTags = Array.isArray(canonSignalState?.eventTags) ? canonSignalState.eventTags : [];
  return globalTags[0] || '';
}

function laneToObjective(lane, districtHint, signal, canonicalTag = '') {
  const pulse = String(signal?.questPulse || '').trim();
  const canonicalTagLabel = normalizeTagLabel(canonicalTag);
  const hint = districtHint ? ` in ${districtHint}` : '';
  const canonSuffix = canonicalTagLabel ? ` · Canon tag: ${canonicalTagLabel}` : '';
  if (lane === 'world') return (pulse || `Investigate instability signatures${hint} and stabilize the lane`) + canonSuffix;
  if (lane === 'ops') return (pulse || `Intercept active route traffic${hint}, secure the node, then trace outbound relay`) + canonSuffix;
  if (lane === 'clue') return (pulse || `Locate the hidden relay${hint}, decode glyph fragments, and recover the route`) + canonSuffix;
  if (lane === 'quest') return (pulse || `Follow direct mission pulse${hint} and close the marked operation window`) + canonSuffix;
  return (pulse || `Track live signal pressure${hint} and clear the operation zone`) + canonSuffix;
}

export function createSignalQuestGenerator(state, liveIntelligence) {
  const districtNames = (state?.districtState || []).map((entry) => entry.name).filter(Boolean);

  function pickDistrictHint(signal, fallback = state.player.districtName) {
    const tags = Array.isArray(signal?.tags) ? signal.tags.map((tag) => String(tag || '').toLowerCase()) : [];
    const direct = districtNames.find((name) => tags.includes(String(name).toLowerCase()));
    if (direct) return direct;
    if (!districtNames.length) return fallback || '';
    const index = hashSeed(signal?.id || signal?.questPulse || signal?.worldFeed) % districtNames.length;
    return districtNames[index] || fallback || '';
  }

  function buildSignalQuestCards(limit = 2) {
    const canonSignalState = liveIntelligence?.getCanonSignalState?.() || {};
    const canonSignals = (canonSignalState.activeCanonSignals || [])
      .filter((signal) => ['world', 'ops', 'clue', 'quest'].includes(signal?.lane));
    const fallbackSignals = (liveIntelligence?.getActiveSignals?.() || [])
      .filter((signal) => ['world', 'ops', 'clue', 'quest'].includes(signal?.lane));
    const signals = (canonSignals.length ? canonSignals : fallbackSignals)
      .sort((a, b) => Number(b?.priority || 0) - Number(a?.priority || 0));

    return signals.slice(0, limit).map((signal, index) => {
      const lane = String(signal?.lane || 'world');
      const districtHint = pickDistrictHint(signal);
      const canonicalTag = deriveCanonTag(signal, canonSignalState);
      const canonicalTagLabel = normalizeTagLabel(canonicalTag);
      const xp = clamp(
        BASE_SIGNAL_XP + (Number(signal.priority || 3) * XP_PER_PRIORITY),
        MIN_SIGNAL_XP,
        MAX_SIGNAL_XP,
      );
      const laneLabel = laneToOperationLabel(lane);
      const pulseTitle = toTitle(signal.questPulse || signal.worldFeed || signal.clueEvent || laneLabel);
      const titleTag = canonicalTagLabel ? ` · ${canonicalTagLabel}` : '';
      return {
        id: `signal-quest-${signal.id || index}`,
        title: `${laneLabel} · ${pulseTitle}${titleTag}`,
        type: 'signal',
        xp,
        objective: laneToObjective(lane, districtHint, signal, canonicalTag),
        districtHint,
        expiresAt: signal?.expiresAt || null,
        eventTags: Array.isArray(signal?.eventTags) ? signal.eventTags : [],
      };
    });
  }

  return {
    buildSignalQuestCards,
  };
}
