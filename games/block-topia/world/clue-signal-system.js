const CLUE_PULSE_INTERVAL_SECONDS = 35;
const CLUE_RECENT_MEMORY = 3;

export function createClueSignalSystem(liveIntelligence) {
  let timer = 0;
  let cluePool = [];
  const recentClues = [];

  function refreshFromSignals() {
    cluePool = liveIntelligence?.getClueEvents?.(6) || [];
  }

  function tick(dt, hooks = {}) {
    timer += dt;
    if (timer < CLUE_PULSE_INTERVAL_SECONDS) return;
    timer = 0;

    if (!cluePool.length) {
      refreshFromSignals();
    }
    const clues = cluePool;
    if (!clues.length) return;

    const next = clues.find((entry) => !recentClues.includes(entry.id)) || clues[0];
    if (!next?.text) return;

    const nextId = next.id || '';
    if (nextId) {
      recentClues.unshift(nextId);
      while (recentClues.length > CLUE_RECENT_MEMORY) {
        recentClues.pop();
      }
    }
    hooks.onCluePulse?.(next.text);
  }

  refreshFromSignals();

  return {
    tick,
    refreshFromSignals,
  };
}
