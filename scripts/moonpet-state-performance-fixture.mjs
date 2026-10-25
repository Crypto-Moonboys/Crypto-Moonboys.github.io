// Local SQLite only. The injected per-call delay models network round trips;
// these numbers are not measurements of Cloudflare production latency.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHmac } from 'node:crypto';

export async function performanceFixture({ root = process.cwd(), pets = 1, delayMs = 0, warm = true, owner = '980301', serializedWrites = false } = {}) {
  const { fixture, clockFixture, hooks, worker } = await import(pathToFileURL(path.join(root, 'scripts/moonpet-audit-regression-fixture.mjs')));
  const { createPetStateTimings } = await import(pathToFileURL(path.join(root, 'workers/moonboys-api/pets/state-timings.js')));
  const f = fixture(owner, 'pet-s2026-004');
  const clock = clockFixture(f, '2026-10-21T12:00:00.000Z');
  for (let slot = 2; slot <= pets; slot++) f.pet('fixture-space-' + slot, 'pet-s2026-004', 10000, slot);
  // The original pet is inserted before clockFixture installs SQLite's clock.
  // Pin every seed timestamp before any warm-up: these values drive lifecycle
  // age and ownership/reconciliation projections, not just hash metadata.
  const seedAt = clock.now().replace('T', ' ').slice(0, 19);
  for (const table of ['telegram_factions', 'telegram_seasons', 'telegram_users', 'telegram_pet_profiles', 'telegram_pet_instances',
    'telegram_pet_lifecycle_by_pet', 'telegram_pet_season_slots', 'telegram_pet_active_slots']) {
    const columns = f.sql.prepare('PRAGMA table_info(' + table + ')').all().map(column => column.name);
    const timestamps = ['created_at', 'updated_at', 'last_decay_at'].filter(name => columns.includes(name));
    f.sql.prepare('UPDATE ' + table + ' SET ' + timestamps.map(name => name + '=?').join(','))
      .run(...timestamps.map(() => seedAt));
  }
  if (warm) await f.state();
  const metrics = { calls: 0, guarded_batches: 0, ownership_assertions: 0 };
  const pause = () => delayMs ? new Promise(resolve => setTimeout(resolve, delayMs)) : Promise.resolve();
  // Optional conservative D1 model: each write occupies one queue slot for
  // its complete simulated round trip. Independent reads can overlap; writes
  // never receive an artificial parallel latency discount.
  let writeTail = Promise.resolve();
  const pending = new Set();
  const execute = (write, operation) => {
    const invoke = async () => { await pause(); return operation(); };
    const result = serializedWrites && write ? writeTail.then(invoke) : invoke();
    if (serializedWrites && write) writeTail = result.catch(() => {});
    pending.add(result);
    result.then(() => pending.delete(result), () => pending.delete(result));
    return result;
  };
  const isWrite = statement => !/^\s*SELECT\b/i.test(statement.query);
  const proto = Object.getPrototypeOf(f.db.prepare('SELECT 1'));
  for (const method of ['first', 'all', 'run']) {
    const original = proto[method];
    proto[method] = async function (...args) { metrics.calls++; return execute(isWrite(this), () => original.apply(this, args)); };
  }
  const originalBatch = f.db.batch.bind(f.db);
  f.db.batch = async statements => {
    metrics.calls++;
    const guards = statements.filter(s => s.query.includes('AS displayed_pet_authority')).length;
    metrics.ownership_assertions += guards;
    if (guards) metrics.guarded_batches++;
    return execute(statements.some(isWrite), () => originalBatch(statements));
  };
  async function measure(mode = 'full') {
    Object.keys(metrics).forEach(key => { metrics[key] = 0; });
    f.db.statementCount = 0;
    const stages = [];
    const events = [];
    const trace = createPetStateTimings({ mode, emit: event => events.push(event) });
    const timings = { async measure(stage, run, counts) {
      const statements = f.db.statementCount, calls = metrics.calls;
      try { return await trace.measure(stage, run, counts); }
      finally {
        const event = events.filter(e => e.stage === stage).at(-1);
        stages.push({ stage, duration_ms: event.duration_ms, statements: f.db.statementCount - statements, calls: metrics.calls - calls });
      }
    } };
    const started = performance.now();
    const state = mode === 'core' ? await hooks.buildPetMiniAppCoreState(f.db, f.owner, { timings })
      : await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token', { mode, timings });
    return { state, events, report: { mode, duration_ms: Math.round(performance.now() - started),
      statements: f.db.statementCount, ...metrics, stages } };
  }
  async function measureHttp(mode = 'full', { reset = true, captureTimings = true, status = 200 } = {}) {
    if (reset) { Object.keys(metrics).forEach(key => { metrics[key] = 0; }); f.db.statementCount = 0; }
    const events = [], originalInfo = console.info;
    if (captureTimings) console.info = value => {
      if (typeof value === 'string' && value.includes('moonpet_state_timing')) events.push(JSON.parse(value));
    };
    const token = '123456:performance-fixture-secret';
    const fields = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: Number(f.owner), first_name: 'Fixture player' }) });
    const check = [...fields].sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => key + '=' + value).join('\n');
    fields.set('hash', createHmac('sha256', createHmac('sha256','WebAppData').update(token).digest()).update(check).digest('hex'));
    const started = performance.now();
    try {
      const response = await worker.fetch(new Request('https://fixture.test/telegram-pets/app/state', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, init_data: fields.toString() }),
      }), { DB: f.db, TELEGRAM_BOT_TOKEN: token });
      if (response.status !== status) throw Error('performance_fixture_http_' + response.status);
      const body = await response.json();
      const state = status === 200 ? body.state : body;
      return { state, events, report: { mode, duration_ms: Math.round(performance.now() - started),
        statements: f.db.statementCount, ...metrics,
        stages: events.map(({ stage, duration_ms, sql_statements, d1_calls }) => ({ stage, duration_ms, ...(sql_statements === undefined ? {} : { sql_statements, d1_calls }) })) } };
    } finally { if (captureTimings) console.info = originalInfo; }
  }
  return { ...f, hooks, worker, measure, measureHttp, setDelayMs(value) { delayMs = Math.max(0, Number(value) || 0); }, async drain() {
    do { await Promise.allSettled([...pending]); await new Promise(resolve => setImmediate(resolve)); } while (pending.size);
  }, advance: clock.advance, close() { clock.restore(); f.sql.close(); } };
}

export function seedRecoveryEvidence(f, count = 5) {
  const pet = f.sql.prepare('SELECT pet_id,season_key FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner);
  for (let i = 0; i < count; i++) f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status,reason,metadata)
    VALUES (?,?,?,'feed',?,0,?,'2026-10-20','2026-W43','accepted','pet_feed',?)`)
    .run('performance-evidence-' + i, pet.pet_id, f.owner, 'performance-feed-' + i, pet.season_key,
      JSON.stringify({ context: { source: 'telegram_mini_app', equipment_snapshot: {} } }));
}
