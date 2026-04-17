export function createSamSystem(state) {

  function getCurrentPhase() {
    return state.sam.phases[state.sam.currentIndex] || { id: 'signals', name: 'Signals' };
  }

  function tick(dt, hooks = {}) {
    if (!state.sam.phases.length) return;

    // Timer runs for visual pacing only — phase index is server-authoritative.
    // Phase advancement is pushed by the server via samPhaseChanged / worldSnapshot.
    state.sam.timer += dt;

    const phase = getCurrentPhase();

    // Keep effect hooks so callers can drive visuals from the current phase.
    if (phase.id === 'sam-event') {
      hooks.onSignalRush?.();
    }
  }

  return { getCurrentPhase, tick };
}
