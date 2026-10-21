import { performanceFixture, seedRecoveryEvidence } from './moonpet-state-performance-fixture.mjs';
const root = process.env.MOONPET_PERF_SOURCE_ROOT || process.cwd();
const delayMs = Number(process.env.MOONPET_PERF_DELAY_MS || 10);
if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 100) throw Error('fixture delay must be 0..100ms');
const results = [];
for (const path of ['builder', 'authenticated_http']) for (const scenario of ['warm', 'three_pets', 'recovery', 'core']) {
  const f = await performanceFixture({ root, pets: scenario === 'three_pets' ? 3 : 1, delayMs });
  try {
    if (scenario === 'recovery') seedRecoveryEvidence(f);
    const { report } = await f[path === 'builder' ? 'measure' : 'measureHttp'](scenario === 'core' ? 'core' : 'full');
    results.push({ path, scenario, ...report });
  } finally { f.close(); }
}
console.log(JSON.stringify({ fixture: 'SQLite/fixed-2026-10-21', modeled_call_delay_ms: delayMs,
  note: 'Stages are inclusive: settlement is inside recovery; verification is inside projection. Not production latency.', results }, null, 2));
