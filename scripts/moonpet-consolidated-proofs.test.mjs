// Consolidated regression: strict boss proofs, verified weekly progress and recoverable Crests.
// Uses only local SQLite and local Worker requests; no production access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture, clockFixture, hooks, httpAction } from './moonpet-audit-regression-fixture.mjs';
import { recordWeeklyJourneyObjectiveEvidence, PET_WEEKLY_JOURNEY_OBJECTIVES, finalizeWeeklyJourneyCrest } from '../workers/moonboys-api/pets/weekly-journey.js';

const observations = [];
let ownerSequence = 994000;
const print = console.log.bind(console);
console.log = (...args) => console.error(...args);
const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
const markupSource = client.slice(client.indexOf('// TEST-EXPORT: weeklyJourneyMarkup:start'), client.indexOf('// TEST-EXPORT: weeklyJourneyMarkup:end'));
function setup(count, time = '2026-10-06T12:00:00.000Z') {
  const f = fixture(String(++ownerSequence), 'pet-s2026-003'), clock = clockFixture(f, time);
  f.pet('other', 'pet-s2026-002', 10000, 2);
  if (count === 3) f.pet('third', 'pet-s2025-001', 10000, 3);
  f.sql.prepare('UPDATE telegram_pet_instances SET last_decay_at=?').run(clock.now());
  f.sql.prepare("UPDATE telegram_pet_season_slots SET created_at='2026-07-01T00:00:00.000Z'").run();
  return { f, clock, source: 'current-' + f.owner };
}
const otherXp = (f, source) => f.sql.prepare('SELECT pet_id,pet_xp FROM telegram_pet_instances WHERE pet_id<>? ORDER BY pet_id').all(source);
const assets = f => ({ wallet: f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get(),
  materials: f.sql.prepare('SELECT material_key,quantity FROM telegram_pet_material_balances ORDER BY material_key').all(),
  pets: f.sql.prepare('SELECT pet_id,pet_xp FROM telegram_pet_instances ORDER BY pet_id').all() });

// A10: resolved does not prove that a saved Daily boss outcome succeeded.
for (const count of [2, 3]) for (const path of ['action', 'refresh']) for (const mode of ['true', 'false', 'empty', 'null', 'malformed', 'string_false', 'numeric_zero']) {
  const { f, clock, source } = setup(count);
  try {
    const start = await httpAction(f, { action: 'daily_run_start' });
    assert.equal(start.body.result.accepted, true);
    const run = f.sql.prepare('SELECT * FROM telegram_pet_runs').get();
    f.sql.prepare('UPDATE telegram_pet_runs SET current_room=max_room,depth=max_room,rooms_completed=max_room WHERE run_id=?').run(run.run_id);
    const finalRun = f.sql.prepare('SELECT * FROM telegram_pet_runs').get();
    const room = hooks.generatePetRunRoom({ ...finalRun, current_room: finalRun.max_room - 1 });
    const canonical = { success: mode === 'true', choice_id: 'challenge_alley_king', score: 100, player_state: { pet_id: source } };
    const outcome = { true: JSON.stringify(canonical), false: JSON.stringify(canonical), empty: '{}', null: 'null', malformed: '{broken',
      string_false: JSON.stringify({ ...canonical, success: 'false' }), numeric_zero: JSON.stringify({ ...canonical, success: 0 }) }[mode];
    f.sql.prepare(`INSERT INTO telegram_pet_run_rooms(room_id,pet_id,run_id,telegram_id,room_number,room_type,status,generated_data,outcome_data)
      VALUES(?,?,?,?,?,'boss','resolved',?,?)`).run('saved-final', source, run.run_id, f.owner, run.max_room, JSON.stringify(room), outcome);
    const before = assets(f), otherBefore = otherXp(f, source), roomBefore = f.sql.prepare('SELECT * FROM telegram_pet_run_rooms').get();
    let accepted;
    if (path === 'action') {
      const response = await httpAction(f, { action: 'run_extract', run_id: run.run_id });
      accepted = response.body.result.accepted;
    } else {
      await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token');
      accepted = f.sql.prepare('SELECT status FROM telegram_pet_runs').get().status === 'completed';
    }
    const expected = mode === 'true';
    assert.equal(accepted, expected);
    const victories = f.sql.prepare('SELECT boss_id,victories FROM telegram_pet_boss_victories WHERE pet_id=?').all(source);
    const claims = f.sql.prepare("SELECT source,applied_rewards FROM telegram_pet_reward_claims WHERE status='awarded' AND source<>'wallet_reconciliation' ORDER BY source").all();
    if (expected) {
      assert.ok(victories.some(row => row.boss_id === 'alley_king' && row.victories === 1));
      assert.ok(claims.some(row => row.source === 'roguelite_boss'));
      assert.ok(f.sql.prepare('SELECT SUM(quantity) AS n FROM telegram_pet_material_balances').get().n > 0);
      const paid = assets(f);
      assert.equal((await httpAction(f, { action: 'run_extract', run_id: run.run_id })).body.result.accepted, true);
      await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token');
      assert.deepEqual(assets(f), paid);
      assert.equal(f.sql.prepare('SELECT victories FROM telegram_pet_boss_victories WHERE pet_id=? AND boss_id=?').get(source, 'alley_king').victories, 1);
    } else {
      assert.equal(claims.length, 0, JSON.stringify({ count, path, mode, claims }));
      assert.equal(victories.length, 0);
      assert.deepEqual(assets(f), before);
    }
    assert.deepEqual(otherXp(f, source), otherBefore);
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_run_rooms').get(), roomBefore);
    observations.push({ id: 'A10', pets: count, path, outcome: mode, accepted, victory_recorded: victories.length > 0,
      paid_sources: claims.map(row => row.source), growth_marks: f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_growth_marks').get().n });
  } finally { clock.restore(); f.sql.close(); }
}

// A11: rejected historic objective counts override revalidated live progress.
for (const count of [2, 3]) for (const projection of ['full', 'missions']) for (const mode of ['no_receipt', 'stale_rejected', 'wrong_scope', 'accepted_history']) {
  const { f, clock, source } = setup(count);
  try {
    const season = 'pet-s2026-003';
    f.sql.prepare("UPDATE telegram_pet_season_slots SET journey_clock='created_at',created_at='2026-10-05T00:00:00Z'").run();
    for (const [objective, goal] of Object.entries(PET_WEEKLY_JOURNEY_OBJECTIVES)) if (objective !== 'weekly_boss_attempt') {
      for (let index = 0; index < goal.target; index++) {
        const key = `${objective}:${index}`, type = { weekly_care: 'feed', weekly_training: 'train', weekly_run: 'run_extract', weekly_check_in: 'daily_chest' }[objective];
        const day = objective === 'weekly_check_in' && index > 0 ? '2026-10-06' : '2026-10-05';
        f.sql.prepare(`INSERT INTO telegram_pet_events(id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status)
          VALUES(?,?,?,?,?,?,?,'2026-W41','accepted')`).run(key, source, f.owner, type, key, season, day);
        await recordWeeklyJourneyObjectiveEvidence(f.db, { telegram_id: f.owner, pet_id: source, season_key: season,
          qualification_week: 1, objective_id: objective, source_event_key: key }, { defer_award: true });
      }
    }
    if (mode !== 'no_receipt') {
      const receiptPet = mode === 'wrong_scope' ? 'other' : source, receiptSeason = mode === 'wrong_scope' ? 'pet-s2026-002' : season;
      f.sql.prepare(`INSERT INTO telegram_pet_weekly_journey_receipts(receipt_id,event_key,telegram_id,pet_id,season_key,qualification_week,completed_objectives,status,reason,crest_id)
        VALUES('retained-receipt','retained-receipt',?,?,?,1,5,?,?,?)`).run(f.owner, receiptPet, receiptSeason,
          mode === 'accepted_history' ? 'accepted' : 'rejected', mode === 'accepted_history' ? 'weekly_journey_qualified' : 'weekly_journey_crest_rejected', mode === 'accepted_history' ? 'retained-crest' : null);
      if (mode === 'accepted_history') f.sql.prepare(`INSERT INTO telegram_pet_weekly_crests(crest_id,pet_id,telegram_id,season_key,season_week,qualification_week,objective_id,evidence_key,earned_at)
        VALUES('retained-crest',?,?,?,1,1,'weekly_journey','weekly-journey:retained','2026-10-06T00:00:00Z')`).run(source, f.owner, season);
    }
    if (mode === 'stale_rejected') {
      f.sql.prepare(`INSERT INTO telegram_pet_events(id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status)
        VALUES('old-payout',?,?,'weekly_boss_reward','old-payout',?,'2026-10-05','2026-W41','accepted')`).run(source, f.owner, season);
      f.sql.prepare(`INSERT INTO telegram_pet_weekly_journey_objectives(event_id,pet_id,telegram_id,season_key,qualification_week,objective_id,source_event_key,source_event_type,progress_value,status)
        VALUES('old-objective',?,?,?,1,'weekly_boss_attempt','old-payout','weekly_boss_reward',1,'accepted')`).run(source, f.owner, season);
    }
    const receipts = f.sql.prepare('SELECT * FROM telegram_pet_weekly_journey_receipts ORDER BY receipt_id').all();
    const others = otherXp(f, source), before = assets(f);
    const read = () => hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token', { mode: projection });
    const snapshot = await read(), weekly = snapshot.weekly_journey;
    assert.equal(weekly.objectives.filter(row => row.completed).length, 4);
    assert.equal(weekly.completed_objectives, mode === 'accepted_history' ? 5 : 4);
    assert.equal(weekly.weekly_crest_awarded, mode === 'accepted_history');
    const context = vm.createContext({ number: String, words: value => String(value).replaceAll('_', ' '), escapeHtml: String,
      countdownMarkup: () => 'later', meter: (label, percentage) => `${label}:${percentage}%`, objectiveRouteButton: id => `ROUTE:${id}`, weekly, snapshot });
    vm.runInContext(markupSource + '; globalThis.markup=weeklyJourneyMarkup(weekly,{},snapshot); globalThis.next=weeklyJourneyNextAction(weekly,{},snapshot);', context);
    if (mode === 'stale_rejected') {
      assert.match(context.markup, /4\/5 OBJECTIVES/);
      assert.doesNotMatch(context.markup, /WEEKLY CREST READY FOR SERVER SETTLEMENT/);
      assert.match(context.markup, /Weekly boss attempt \/\/ 0\/1 \/\/ INCOMPLETE/);
      assert.doesNotMatch(context.next, /Weekly Journey complete/);
      const attempt = await finalizeWeeklyJourneyCrest(f.db, { telegram_id: f.owner, pet_id: source, season_key: season, qualification_week: 1 });
      assert.equal(attempt.accepted, false);
      assert.equal(attempt.completed_objectives, 4);
    }
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_weekly_journey_receipts ORDER BY receipt_id').all(), receipts);
    assert.deepEqual(assets(f), before);
    assert.deepEqual(otherXp(f, source), others);
    assert.deepEqual((await read()).weekly_journey, weekly);
    if (mode === 'stale_rejected') {
      const nextPet = count === 3 ? 'third' : 'other', nextSeason = count === 3 ? 'pet-s2025-001' : 'pet-s2026-002';
      assert.equal((await httpAction(f, { action: 'switch_pet_slot', pet_id: nextPet })).body.result.accepted, true);
      assert.equal((await read()).weekly_journey.completed_objectives, 0);
      assert.equal((await httpAction(f, { action: 'switch_pet_slot', pet_id: source })).body.result.accepted, true);
      assert.equal((await read()).weekly_journey.completed_objectives, 4);
      // Real accepted missing-objective evidence can still finish normally.
      // The defect is false readiness, not a new eligibility/payment bypass.
      f.sql.prepare(`INSERT INTO telegram_pet_events(id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status)
        VALUES('valid-boss',?,?,'boss_fought','valid-boss',?,'2026-10-06','2026-W41','accepted')`).run(source, f.owner, season);
      await recordWeeklyJourneyObjectiveEvidence(f.db, { telegram_id: f.owner, pet_id: source, season_key: season,
        qualification_week: 1, objective_id: 'weekly_boss_attempt', source_event_key: 'valid-boss' });
      assert.equal((await read()).weekly_journey.weekly_crest_awarded, true);
      await finalizeWeeklyJourneyCrest(f.db, { telegram_id: f.owner, pet_id: source, season_key: season, qualification_week: 1 });
      assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_crests').get().n, 1);
      assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_weekly_journey_receipts WHERE receipt_id='retained-receipt'").get(), receipts[0]);
      assert.deepEqual(assets(f), before);
    }
    observations.push({ id: 'A11', pets: count, projection, mode, verified_complete: 4,
      displayed_complete: weekly.completed_objectives, crest_awarded: weekly.weekly_crest_awarded, next: context.next });
  } finally { clock.restore(); f.sql.close(); }
}

// A8 extension: the same unproven duplicate closes Weekly Boss Crest recovery.
for (const count of [2, 3]) for (const mode of ['healthy', 'ignore', 'abort', 'existing_crest']) {
  const { f, clock, source } = setup(count);
  try {
    const season = 'pet-s2026-003', week = '2026-W41', boss = hooks.getPetWeeklyBoss(week);
    f.sql.prepare("UPDATE telegram_pet_season_slots SET journey_clock='created_at',created_at='2026-09-28T00:00:00Z'").run();
    f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_events(event_id,telegram_id,week_key,day_key,boss_id,event_key,action,damage,created_at)
      VALUES('win',?,?,'2026-10-06',?,'exact-win','strike',?,'2026-10-06T11:59:00Z')`).run(f.owner, week, boss.boss_id, boss.hp);
    f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_progress(telegram_id,week_key,boss_id,damage,attempts,defeated_at)
      VALUES(?,?,?,?,1,'2026-10-06T11:59:00Z')`).run(f.owner, week, boss.boss_id, boss.hp);
    f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_victories_by_pet(telegram_id,week_key,boss_id,pet_id,season_key,victory_event_key,defeated_at)
      VALUES(?,?,?,?,?,'exact-win','2026-10-06T11:59:00Z')`).run(f.owner, week, boss.boss_id, source, season);
    if (mode === 'existing_crest') f.sql.prepare(`INSERT INTO telegram_pet_weekly_crests(crest_id,pet_id,telegram_id,season_key,season_week,qualification_week,objective_id,evidence_key,earned_at)
      VALUES('existing-crest',?,?,?,2,2,'weekly_journey','weekly-journey:existing','2026-10-06T00:00:00Z')`).run(source, f.owner, season);
    if (['ignore', 'abort'].includes(mode)) f.sql.exec(`CREATE TRIGGER audit_crest BEFORE INSERT ON telegram_pet_weekly_crests BEGIN SELECT RAISE(${mode === 'ignore' ? 'IGNORE' : "ABORT,'audit_crest_failure'"}); END`);
    const marks = () => f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_crests WHERE pet_id=?').get(source).n;
    const finished = () => f.sql.prepare("SELECT status FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").get()?.status || null;
    const beforeOthers = otherXp(f, source), request = { action: 'weekly_boss_claim', pet_id: source, boss_id: boss.boss_id, week_key: week };
    const claim = await httpAction(f, request);
    assert.equal(claim.body.result.accepted, true);
    assert.equal(marks(), ['ignore', 'abort'].includes(mode) ? 0 : 1);
    assert.equal(finished(), ['ignore', 'abort'].includes(mode) ? null : 'completed');
    const sourceFinished = finished(), paid = assets(f);
    if (['ignore', 'abort'].includes(mode)) f.sql.exec('DROP TRIGGER audit_crest');
    const other = count === 3 ? 'third' : 'other';
    assert.equal((await httpAction(f, { action: 'switch_pet_slot', pet_id: other })).body.result.accepted, true);
    await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token');
    await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token');
    assert.equal(marks(), 1);
    assert.deepEqual(assets(f), paid);
    assert.deepEqual(otherXp(f, source), beforeOthers);
    // An explicit paid-source retry repairs the mark, but refresh cannot find
    // the falsely completed source and no saved reward button remains.
    assert.equal((await httpAction(f, request)).body.result.duplicate, true);
    assert.equal(marks(), 1);
    assert.deepEqual(assets(f), paid);
    observations.push({ id: 'A8_extension', pets: count, mode, initial_finish: sourceFinished,
      crest_after_refresh: 1, crest_after_explicit_source_retry: marks() });
  } finally { clock.restore(); f.sql.close(); }
}
console.log = print;
print('Consolidated proofs: ' + observations.length + ' regression cases passed.');
