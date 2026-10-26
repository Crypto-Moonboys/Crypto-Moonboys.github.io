// One bounded, request-local trace. No SQL text, bound values, results or errors.
const OPERATIONS = new Set(['projection', 'initial_economy', 'profile', 'entry',
  'inventory_bridge', 'identity', 'runtime', 'combat_eligibility', 'combat', 'roster',
  'gear', 'materials', 'live_systems', 'guidance', 'daily_run', 'notices', 'inventory',
  'relics', 'leaderboard', 'notifications', 'recent_actions', 'street_events', 'finales',
  'journey', 'style', 'house', 'furniture', 'garden', 'contracts', 'kaiju_category',
  'daily_modifiers', 'final_ownership', 'final_economy', 'guidance_activity', 'guidance_run',
  'missions', 'season_rewards', 'achievements', 'boss_progress', 'boss_attempt',
  'special_actions', 'pending_boss_rewards', 'daily_chest', 'window_totals',
  'boss_history', 'evolution', 'economy', 'boss_participation', 'guidance_ownership', 'shared_reads', 'presentation_join', 'guidance_join']);
const MAX_CALLS = 192, MAX_SPANS = 80;
const DEPENDENCIES = {
  initial_economy: [], profile: [],
  entry: ['profile', 'initial_economy'], inventory_bridge: ['profile', 'initial_economy'],
  identity: ['profile', 'initial_economy'], runtime: ['profile', 'initial_economy'],
  combat: ['profile', 'initial_economy'], roster: ['profile', 'initial_economy'],
  combat_eligibility: ['identity'], live_systems: ['identity', 'runtime', 'gear', 'materials'],
  journey: ['roster'], evolution: ['identity'], economy: ['identity', 'inventory_bridge'],
  inventory: ['inventory_bridge'], guidance: ['identity', 'runtime', 'guidance_activity',
    'guidance_run', 'missions', 'season_rewards', 'achievements', 'boss_progress',
    'boss_attempt', 'special_actions', 'pending_boss_rewards', 'daily_chest',
    'window_totals', 'boss_history', 'evolution', 'economy', 'combat_eligibility',
    'boss_participation', 'guidance_ownership'],
  final_economy: ['final_ownership'],
  kaiju_category: ['presentation_join'], final_ownership: ['presentation_join', 'kaiju_category'],
  guidance_ownership: ['guidance_join', 'combat_eligibility', 'boss_participation'],
};
const round = n => Math.round(Math.max(0, n) * 100) / 100;
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

// A server-controlled rate AND near-term expiry are required. Request headers,
// bodies and player IDs can never enable sampling. Maximum 10%, one hour left.
export function projectionSamplingEnabled(env, now = Date.now(), random = Math.random) {
  const rate = Number(env?.MOONPET_PROJECTION_SAMPLE_RATE);
  const until = Date.parse(env?.MOONPET_PROJECTION_SAMPLE_UNTIL || '');
  return Number.isFinite(rate) && rate > 0 && rate <= 0.1 && until > now
    && until - now <= 3600000 && random() < rate;
}

export function createProjectionDiagnostics({ requestId, colo, clock = () => performance.now(), emit }) {
  const started = clock(), calls = [], spans = [], originals = new WeakMap(), statementOperations = new WeakMap(), views = new WeakMap();
  let currentOperation = 'projection';
  let droppedCalls = 0, droppedSpans = 0, finished = false;
  const elapsed = () => round(clock() - started);
  const allowed = id => { if (!OPERATIONS.has(id)) throw Error('invalid_projection_operation'); return id; };
  const unwrap = s => { while (originals.has(s)) s = originals.get(s); return s; };
  function rootDatabase(db) {
    function invoke(operations, method, run) {
      const batchSize = Object.values(operations).reduce((a,b) => a+b, 0);
      const operation = Object.keys(operations).length === 1 ? Object.keys(operations)[0] : 'shared_reads';
      const record = { operation, operations, method, batch_size: batchSize, d1_calls: 1,
        sql_statements: batchSize, start_ms: elapsed() };
      const kept = calls.length < MAX_CALLS;
      if (kept) calls.push(record); else droppedCalls++;
      // The returned object/error is untouched, including synchronous failures.
      let result;
      try { result = run(); } catch (error) { complete(null, false); throw error; }
      return Promise.resolve(result).then(value => { complete(value, true); return value; },
        error => { complete(null, false); throw error; });
      function complete(value, ok) {
        if (!kept) return;
        record.end_ms = elapsed(); record.await_ms = round(record.end_ms - record.start_ms);
        record.outcome = ok ? 'returned' : 'threw';
        if (!['all', 'run', 'batch'].includes(method)) return;
        const rows = method === 'batch' ? value : [value];
        if (!Array.isArray(rows)) return;
        const durations = rows.map(r => r?.meta?.timings?.sql_duration_ms ?? r?.meta?.duration);
        // Partial coverage must never look like the SQL cost of the whole call.
        record.sql_timing_statements = durations.filter(finite).length;
        if (durations.length === batchSize && durations.every(finite)) {
          record.sql_reported_ms = round(durations.reduce((a, b) => a + b, 0));
        }
        if (rows.some(r => r?.success === false)) record.outcome = 'returned_failure';
      }
    }
    function statement(raw, operation) {
      const proxy = new Proxy(raw, { get(target, key) {
        if (key === 'bind') return (...args) => statement(target.bind(...args), operation);
        if (['first', 'all', 'run', 'raw'].includes(key)) return (...args) => invoke({[operation]: 1}, key, () => target[key](...args));
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      originals.set(proxy, raw); statementOperations.set(proxy, operation); return proxy;
    }
    return new Proxy(db, { get(target, key) {
      if (key === 'prepare') return (...args) => statement(target.prepare(...args), currentOperation);
      if (key === 'batch') return statements => {
        const operations = {};
        for (const s of statements) { const id = statementOperations.get(s) || currentOperation; operations[id] = (operations[id] || 0) + 1; }
        return invoke(operations, 'batch', () => target.batch(statements.map(unwrap)));
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  }
  return {
    rootDatabase,
    database(db, operation) {
      allowed(operation);
      while (views.has(db)) db = views.get(db);
      // A synchronous label scope, never retained across an await. Actual calls
      // are recorded only at rootDatabase, after coalescing/ownership queues.
      const tagged = run => { const previous = currentOperation; currentOperation = operation;
        try { return run(); } finally { currentOperation = previous; } };
      const viewStatements = new WeakMap();
      const viewStatement = raw => { const proxy = new Proxy(raw, { get(target, key) {
        if (key === 'bind') return (...args) => viewStatement(tagged(() => target.bind(...args)));
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? (...args) => tagged(() => value.apply(target, args)) : value;
      } }); originals.set(proxy, raw); viewStatements.set(proxy, raw); statementOperations.set(proxy, statementOperations.get(raw) || operation); return proxy; };
      const view = new Proxy(db, { get(target, key) {
        if (key === 'prepare') return (...args) => viewStatement(tagged(() => target.prepare(...args)));
        if (key === 'batch') return statements => tagged(() => target.batch(statements.map(s => viewStatements.get(s) || s)));
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? (...args) => tagged(() => value.apply(target, args)) : value;
      } }); views.set(view, db); return view;
    },
    run(operation, run, dependencies = DEPENDENCIES[operation] || ['profile', 'initial_economy']) {
      allowed(operation); dependencies.forEach(allowed);
      const span = { operation, dependencies, start_ms: elapsed() };
      const kept = spans.length < MAX_SPANS;
      if (kept) spans.push(span); else droppedSpans++;
      let result;
      try { result = run(); } catch (error) { complete(false); throw error; }
      return Promise.resolve(result).then(value => { complete(true); return value; },
        error => { complete(false); throw error; });
      function complete(ok) { if (kept) { span.end_ms = elapsed(); span.duration_ms = round(span.end_ms - span.start_ms); span.outcome = ok ? 'completed' : 'failed'; } }
    },
    finish(outcome) {
      if (finished) return; finished = true;
      try { emit({ event: 'moonpet_projection_trace', version: 1, request_id: requestId,
        colo: /^[A-Z]{3}$/.test(colo || '') ? colo : 'unknown', duration_ms: elapsed(),
        outcome: outcome === 'completed' ? 'completed' : 'failed',
        dropped_calls: droppedCalls, dropped_spans: droppedSpans, spans, calls }); } catch (_) {}
    },
  };
}

// Disabled tracing returns the original promise: no new scheduler barrier.
export function projectionOperation(trace, id, fn, db, ...args) {
  return trace ? trace.run(id, () => fn(trace.database(db, id), ...args)) : fn(db, ...args);
}
export function projectionSpan(trace, id, run, dependencies) {
  return trace ? trace.run(id, run, dependencies) : run();
}
