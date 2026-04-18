const CLUE_PULSE_INTERVAL_SECONDS = 35;

export function createClueSignalSystem(liveIntelligence) {
  let timer = 0;
  let lastClueId = '';

  function tick(dt, hooks = {}) {
    timer += dt;
    if (timer < CLUE_PULSE_INTERVAL_SECONDS) return;
    timer = 0;

    const clues = liveIntelligence?.getClueEvents?.(3) || [];
    if (!clues.length) return;

    const next = clues.find((entry) => entry.id !== lastClueId) || clues[0];
    if (!next?.text) return;

    lastClueId = next.id || '';
    hooks.onCluePulse?.(next.text);
  }

  return {
    tick,
  };
}
