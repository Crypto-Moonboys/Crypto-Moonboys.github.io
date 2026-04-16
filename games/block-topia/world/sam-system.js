export function createSamSystem(state) {
  const PHASE_DURATION_SECONDS = 30;

  function getCurrentPhase() {
    return state.sam.phases[state.sam.currentIndex] || { id: 'signals', name: 'Signals' };
  }

  function tick(dt, hooks = {}) {
    if (!state.sam.phases.length) return;
    state.sam.timer += dt;
    if (state.sam.timer < PHASE_DURATION_SECONDS) return;

    state.sam.timer = 0;
    state.sam.currentIndex = (state.sam.currentIndex + 1) % state.sam.phases.length;
    const phase = getCurrentPhase();

    hooks.onPhaseChanged?.(phase);

    if (phase.id === 'sam-event') {
      // Do NOT push to state.memory.samEvents here — main.js's onPhaseChanged hook calls
      // memory.record() which is the single authoritative writer for samEvents.
      // Pushing here in addition would create a double entry with mixed types.
      hooks.onSignalRush?.();
    }
  }

  return { getCurrentPhase, tick };
}
