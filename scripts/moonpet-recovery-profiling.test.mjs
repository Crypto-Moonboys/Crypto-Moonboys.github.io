import test from 'node:test';
import assert from 'node:assert/strict';
import { createPetStateTimings, measurePetDatabaseStage } from '../workers/moonboys-api/pets/state-timings.js';
import { performanceFixture, seedRecoveryEvidence } from './moonpet-state-performance-fixture.mjs';

test('database spans count calls and statements once without exposing SQL, binds or errors', async () => {
  const events = [], trace = createPetStateTimings({ emit: e => events.push(e) });
  const raw = [];
  const db = { prepare(sql) { return { bind(...args) { this.args=args; return this; }, async first() { return 7; }, async all() { throw Error('private-error'); } }; }, async batch(items) { raw.push(...items); return items.map(() => ({ results: [] })); } };
  await measurePetDatabaseStage(trace, 'boss_victory_recovery', db, async measured => {
    const s = measured.prepare('private-sql').bind('private-owner');
    assert.equal(await s.first(), 7);
    await measured.batch([s,s]);
    await assert.rejects(s.all(), /private-error/);
  });
  assert.equal(events[0].sql_statements, 4);
  assert.equal(events[0].d1_calls, 3);
  assert.equal(JSON.stringify(events).includes('private-'), false);
  assert.deepEqual(raw[0].args, ['private-owner']);
  await assert.rejects(measurePetDatabaseStage(trace, 'journey_source_recovery', db, d => d.prepare('secret').all()));
  assert.equal(events[1].outcome, 'failed');
  assert.equal(events[1].d1_calls, 1);
});

for (const pets of [1,3]) test(`recovery profiling ${pets} pets preserves rewards on retry and includes all queues`, async () => {
  const f = await performanceFixture({ pets });
  try {
    seedRecoveryEvidence(f, 20);
    const first = await f.measureHttp();
    for (const stage of ['boss_victory_recovery','journey_source_recovery','daily_journey_award_recovery','weekly_journey_award_recovery','pet_state_projection']) {
      const event = first.events.find(e => e.stage === stage);
      assert.ok(event, stage);
      assert.ok(event.sql_statements >= event.d1_calls && event.d1_calls > 0);
    }
    const snapshot = () => ['telegram_pet_profiles','telegram_pet_weekly_journey_objectives','telegram_pet_growth_marks','telegram_pet_weekly_crests'].map(table => f.sql.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
    const before = snapshot();
    await f.measureHttp();
    assert.deepEqual(snapshot(), before);
  } finally { f.close(); }
});
