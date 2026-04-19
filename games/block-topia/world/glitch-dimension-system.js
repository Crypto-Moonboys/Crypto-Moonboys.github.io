const DEFAULT_DURATION_MS = 60000;

export function createGlitchDimensionSystem() {
  const state = {
    active: false,
    endsAt: 0,
    reason: '',
  };

  function start(reason = 'mega_glitch', durationMs = DEFAULT_DURATION_MS) {
    state.active = true;
    state.reason = reason;
    state.endsAt = Date.now() + durationMs;
  }

  function stop() {
    state.active = false;
    state.reason = '';
    state.endsAt = 0;
  }

  function tick(now = Date.now(), hooks = {}) {
    if (!state.active) return;
    if (now >= state.endsAt) {
      stop();
      hooks.onEnded?.();
      return;
    }
    hooks.onTick?.({ remainingMs: Math.max(0, state.endsAt - now), reason: state.reason });
  }

  return {
    start,
    stop,
    tick,
    getState: () => ({ ...state }),
  };
}
