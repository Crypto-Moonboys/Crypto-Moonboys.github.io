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

function laneToObjective(lane, districtHint, signal) {
  const pulse = String(signal?.questPulse || '').trim();
  const hint = districtHint ? ` in ${districtHint}` : '';
  if (lane === 'world') return pulse || `Investigate instability signatures${hint} and stabilise the lane`;
  if (lane === 'ops') return pulse || `Intercept active route traffic${hint}, secure the node, then trace outbound relay`;
  if (lane === 'clue') return pulse || `Locate the hidden relay${hint}, decode glyph fragments, and recover the route`;
  if (lane === 'quest') return pulse || `Follow direct mission pulse${hint} and close the marked operation window`;
  return pulse || `Track live signal pressure${hint} and clear the operation zone`;
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
    const signals = (liveIntelligence?.getActiveSignals?.() || [])
      .filter((signal) => ['world', 'ops', 'clue', 'quest'].includes(signal?.lane))
      .sort((a, b) => Number(b?.priority || 0) - Number(a?.priority || 0));

    return signals.slice(0, limit).map((signal, index) => {
      const lane = String(signal?.lane || 'world');
      const districtHint = pickDistrictHint(signal);
      const xp = clamp(
        BASE_SIGNAL_XP + (Number(signal.priority || 3) * XP_PER_PRIORITY),
        MIN_SIGNAL_XP,
        MAX_SIGNAL_XP,
      );
      const laneLabel = laneToOperationLabel(lane);
      const pulseTitle = toTitle(signal.questPulse || signal.worldFeed || signal.clueEvent || laneLabel);
      return {
        id: `signal-quest-${signal.id || index}`,
        title: `${laneLabel} · ${pulseTitle}`,
        type: 'signal',
        xp,
        objective: laneToObjective(lane, districtHint, signal),
        districtHint,
        expiresAt: signal?.expiresAt || null,
      };
    });
  }

  return {
    buildSignalQuestCards,
  };
}
