function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toTitle(text) {
  const clean = String(text || 'Signal Operation').trim();
  if (!clean) return 'Signal Operation';
  const compact = clean.replace(/\s+/g, ' ');
  return compact.length > 38 ? `${compact.slice(0, 35)}...` : compact;
}

export function createSignalQuestGenerator(state, liveIntelligence) {
  function buildSignalQuestCards(limit = 2) {
    const signals = liveIntelligence?.getSignalsByLane?.('quest') || [];
    return signals.slice(0, limit).map((signal, index) => {
      const xp = clamp(80 + (Number(signal.priority || 3) * 25), 90, 240);
      return {
        id: `signal-quest-${signal.id || index}`,
        title: toTitle(signal.questPulse),
        type: 'daily',
        xp,
        objective: String(signal.questPulse || `Track a live operation in ${state.player.districtName}`),
      };
    });
  }

  return {
    buildSignalQuestCards,
  };
}
