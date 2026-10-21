// Request-local, allowlisted diagnostics. Never accept account data or errors as
// event fields; even mode and stage names must come from these fixed lists.
const STAGES = new Set(['request_parse', 'rate_limit', 'authentication', 'user_bootstrap',
  'd1_bootstrap', 'state_recovery', 'daily_settlement', 'weekly_settlement',
  'pet_state_projection', 'ownership_verification', 'response_serialization', 'total']);
const MODES = new Set(['core', 'live', 'missions', 'profile']);
export const NO_PET_STATE_TIMINGS = Object.freeze({ measure: async (_stage, run) => run() });

export function createPetStateTimings({ mode, clock = () => performance.now(),
  emit = event => console.info(JSON.stringify(event)) } = {}) {
  const started = clock();
  const requestId = crypto.randomUUID();
  let selectedMode = MODES.has(mode) ? mode : 'full';
  function record(stage, since, outcome) {
    // Logging must not turn a committed recovery or successful read into failure.
    try {
      emit({ event: 'moonpet_state_timing', request_id: requestId, mode: selectedMode,
        stage, outcome, duration_ms: Math.max(0, Math.round((clock() - since) * 100) / 100) });
    } catch (_) {}
  }
  return {
    setMode(value) { selectedMode = MODES.has(value) ? value : 'full'; },
    async measure(stage, run) {
      if (!STAGES.has(stage) || stage === 'total') throw new Error('invalid_state_timing_stage');
      const since = clock();
      try { const value = await run(); record(stage, since, 'completed'); return value; }
      catch (error) { record(stage, since, 'failed'); throw error; }
    },
    finish(outcome = 'failed') {
      record('total', started, ['completed', 'rejected'].includes(outcome) ? outcome : 'failed');
    },
  };
}
