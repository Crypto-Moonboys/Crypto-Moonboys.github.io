import { createProjectionDiagnostics, projectionSamplingEnabled } from './projection-diagnostics.js';
// Request-local, allowlisted diagnostics. Never accept account data or errors as
// event fields; even mode and stage names must come from these fixed lists.
const STAGES = new Set(['request_parse', 'rate_limit', 'authentication', 'user_bootstrap',
  'd1_bootstrap', 'state_recovery', 'daily_settlement', 'weekly_settlement',
  'boss_victory_recovery', 'journey_source_recovery', 'daily_journey_award_recovery', 'weekly_journey_award_recovery',
  'pet_state_projection', 'ownership_verification', 'response_serialization', 'total']);
const MODES = new Set(['core', 'live', 'missions', 'profile']);
export const NO_PET_STATE_TIMINGS = Object.freeze({ measure: async (_stage, run) => run() });

export function createPetStateTimings({ mode, env, colo, clock = () => performance.now(),
  emit = event => console.info(JSON.stringify(event)) } = {}) {
  const started = clock();
  const requestId = crypto.randomUUID();
  let selectedMode = MODES.has(mode) ? mode : 'full';
  function record(stage, since, outcome, counts) {
    // Logging must not turn a committed recovery or successful read into failure.
    try {
      emit({ event: 'moonpet_state_timing', request_id: requestId, mode: selectedMode,
        stage, outcome, ...(counts ? { sql_statements: counts.sql_statements, d1_calls: counts.d1_calls } : {}), duration_ms: Math.max(0, Math.round((clock() - since) * 100) / 100) });
    } catch (_) {}
  }
  return {
    startProjection() {
      // Reuse uniformly random server UUID bits; sampling must not consume the
      // gameplay Math.random stream or introduce another authentication token.
      if (selectedMode !== 'full' || !projectionSamplingEnabled(env, Date.now(),
        () => parseInt(requestId.slice(-8), 16) / 4294967296)) return null;
      return createProjectionDiagnostics({ requestId, colo, clock, emit });
    },
    setMode(value) { selectedMode = MODES.has(value) ? value : 'full'; },
    async measure(stage, run, counts) {
      if (!STAGES.has(stage) || stage === 'total') throw new Error('invalid_state_timing_stage');
      const since = clock();
      try { const value = await run(); record(stage, since, 'completed', counts); return value; }
      catch (error) { record(stage, since, 'failed', counts); throw error; }
    },
    finish(outcome = 'failed') {
      record('total', started, ['completed', 'rejected'].includes(outcome) ? outcome : 'failed');
    },
  };
}

// Count submitted statements and binding calls, including failed attempts. A
// batch is one D1 call; its statements are counted individually. These are
// application binding calls, not transport retries or SQLite execution time.
// The wrapper is local to one span and never caches data or changes ordering.
export function measurePetDatabaseStage(timings, stage, db, run) {
  if (timings === NO_PET_STATE_TIMINGS) return run(db);
  const counts = { sql_statements: 0, d1_calls: 0 };
  const originals = new WeakMap();
  function statement(raw) {
    const wrapped = new Proxy(raw, { get(target, key) {
      if (key === 'bind') return (...args) => statement(target.bind(...args));
      if (['first', 'all', 'run', 'raw'].includes(key)) return (...args) => {
        counts.sql_statements++; counts.d1_calls++;
        return target[key](...args);
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    originals.set(wrapped, raw);
    return wrapped;
  }
  const measured = new Proxy(db, { get(target, key) {
    if (key === 'prepare') return (...args) => statement(target.prepare(...args));
    if (key === 'batch') return (statements) => {
      counts.sql_statements += statements.length; counts.d1_calls++;
      return target.batch(statements.map(s => originals.get(s) || s));
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return timings.measure(stage, () => run(measured), counts);
}
