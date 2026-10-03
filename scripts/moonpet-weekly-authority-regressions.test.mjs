import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { PET_INSTANCE_AUTHORITY_VERSION } from '../workers/moonboys-api/pets/wallet-reconciliation.js';
import { mock } from 'node:test';
import { readPetWeeklyBossParticipation } from '../workers/moonboys-api/pets/weekly-boss-participation.js';
import { recoverPetWeeklyBossVictories } from '../workers/moonboys-api/pets/weekly-boss-recovery.js';
import { reconcileEvolutionGrowthMarks, awardPetWeeklyCrest } from '../workers/moonboys-api/pets/season-completion.js';
import { recordWeeklyJourneyObjectiveEvidence, finalizeWeeklyJourneyCrest } from '../workers/moonboys-api/pets/weekly-journey.js';

const sqlite = new DatabaseSync(':memory:');
for (const file of ['schema.sql', 'migrations/048_telegram_pet_player_expansion.sql', 'migrations/058_telegram_pet_season_completion.sql',
  'migrations/061_moonpet_season_economy_calibration.sql', 'migrations/085_permanent_pet_weekly_evidence.sql']) {
  sqlite.exec(fs.readFileSync(new URL('../workers/moonboys-api/' + file, import.meta.url), 'utf8'));
}
let beforeBatch = null, beforeFirst = null, beforeRun = null, tail = Promise.resolve();
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { if (beforeFirst) { const injected = await beforeFirst(this); if (injected !== undefined) return injected; } return sqlite.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() {
    if (beforeRun) await beforeRun(this);
    if (sqlite.prepare(this.sql).columns().length && !/\bRETURNING\b/i.test(this.sql)) return { results: sqlite.prepare(this.sql).all(...this.args), meta: { changes: 0 } };
    if (/\bRETURNING\b/i.test(this.sql)) { const results = sqlite.prepare(this.sql).all(...this.args); return { results, meta: { changes: results.length } }; }
    const result = sqlite.prepare(this.sql).run(...this.args); return { results: [], meta: { changes: Number(result.changes) } };
  }
}
const db = {
  prepare(sql) { return new Statement(sql); },
  batch(statements) {
    const task = tail.then(async () => {
      if (beforeBatch) { const injected = await beforeBatch(statements); if (injected !== undefined) return injected; }
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
    tail = task.catch(() => {}); return task;
  },
};
async function seed(id, xp = 3240, energy = 80) {
  sqlite.prepare('INSERT INTO telegram_users (telegram_id, first_name, xp, level) VALUES (?, ?, 0, 1)').run(id, id);
  sqlite.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_name, pet_xp, energy, moon_gold) VALUES (?, ?, ?, ?, 100)').run(id, id, xp, energy);
  await hooks.ensurePetStarterSeasonSlot(db, id);
  const pet = await hooks.ensureActivePetInstance(db, id);
  sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json)
    VALUES (?,?,?,'young','{}','[]')`).run(pet.pet_id, id, id);
  return pet;
}
function secondPet(owner, source) {
  const id = source.pet_id + '-other';
  sqlite.prepare(`INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type)
    VALUES (?,?,?,2,'arcade_xp')`).run(id, owner, source.season_key);
  sqlite.prepare(`INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at)
    VALUES (?,?,?,2,3240,80,?)`).run(id, owner, source.season_key, PET_INSTANCE_AUTHORITY_VERSION);
  sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json)
    VALUES (?,?,?,'young','{}','[]')`).run(id, owner, id);
  return id;
}
function switchTo(owner, petId) {
  sqlite.prepare('UPDATE telegram_pet_active_slots SET pet_id=? WHERE telegram_id=?').run(petId, owner);
  sqlite.prepare('UPDATE telegram_pet_profiles SET pet_xp=3240,energy=80 WHERE telegram_id=?').run(owner);
}

const count = (table, owner) => sqlite.prepare(`SELECT COUNT(*) n FROM ${table} WHERE telegram_id=?`).get(owner).n;
const energy = pet => sqlite.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(pet).energy;
const claims = owner => sqlite.prepare("SELECT * FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_weekly_boss' ORDER BY claim_id").all(owner);
const participationBatch = statements => statements[0].sql.includes("'weekly_boss_participation'");
mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-04T23:59:59.950Z') });
sqlite.function('current_timestamp', () => new Date().toISOString().replace('T', ' ').slice(0, 19));

// A naturally advancing clock crosses both midnight and the UTC week while
// committing the winning attack. Recovery preserves source dates and pays once.
for (const historical of [false, true]) {
  mock.timers.setTime(Date.parse('2026-10-04T23:59:59.950Z'));
  const owner = `midnight-${historical}`, pet = await seed(owner);
  sqlite.prepare("UPDATE telegram_pet_season_slots SET created_at='2026-09-28',journey_clock='created_at' WHERE pet_id=?").run(pet.pet_id);
  const ready = (await hooks.buildPetMiniAppState(db, owner, 'test')).guidance.weekly_boss;
  sqlite.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id,week_key,boss_id,damage,attempts)
    VALUES (?,?,?,?,1)`).run(owner, ready.week_key, ready.boss_id, ready.hp - 1);
  let interrupted = false;
  beforeBatch = statements => {
    if (!statements[0].sql.includes('INSERT OR IGNORE INTO telegram_pet_weekly_boss_events')) return;
    beforeBatch = null;
    mock.timers.setTime(Date.now() + 100);
    beforeFirst = statement => {
      if (!/SELECT e\.\* FROM telegram_pet_events e\s+JOIN telegram_pet_weekly_boss_victories_by_pet/.test(statement.sql)) return;
      beforeFirst = null; interrupted = true;
      throw new Error('interrupted_after_payment_before_progression');
    };
  };
  const attack = await hooks.processPetWeeklyBoss(db, owner, 'strike', `${owner}:win`, pet.pet_id);
  assert.equal(attack.accepted, true); assert.equal(interrupted, true);
  assert.equal(new Date().toISOString(), '2026-10-05T00:00:00.050Z');
  const source = sqlite.prepare("SELECT * FROM telegram_pet_events WHERE telegram_id=? AND event_type='weekly_boss'").get(owner);
  const victory = sqlite.prepare('SELECT * FROM telegram_pet_weekly_boss_victories_by_pet WHERE telegram_id=?').get(owner);
  assert.equal(source.day_key, '2026-10-04');
  assert.equal(source.created_at, '2026-10-04T23:59:59.950Z');
  assert.equal(victory.defeated_at, source.created_at);
  const payout = sqlite.prepare("SELECT day_key FROM telegram_pet_events WHERE telegram_id=? AND event_type='weekly_boss_reward'").get(owner);
  assert.equal(payout.day_key, source.day_key);
  assert.equal(count('telegram_pet_weekly_crests', owner), 0, 'fault occurs before the Crest');
  if (historical) {
    // Existing deployment evidence used commit time for defeat, with the
    // original day still retained on its immutable accepted attack event.
    sqlite.prepare("UPDATE telegram_pet_weekly_boss_victories_by_pet SET defeated_at='2026-10-05 00:00:00' WHERE telegram_id=?").run(owner);
    sqlite.prepare("UPDATE telegram_pet_weekly_boss_progress SET defeated_at='2026-10-05 00:00:00' WHERE telegram_id=?").run(owner);
    sqlite.prepare("UPDATE telegram_pet_events SET created_at='2026-10-05 00:00:00' WHERE telegram_id=? AND event_type='weekly_boss'").run(owner);
  }
  const retainedVictory = sqlite.prepare('SELECT * FROM telegram_pet_weekly_boss_victories_by_pet WHERE telegram_id=?').get(owner);
  const retainedSource = sqlite.prepare("SELECT * FROM telegram_pet_events WHERE telegram_id=? AND event_type='weekly_boss'").get(owner);
  const paid = claims(owner), beforeEnergy = energy(pet.pet_id);
  let eligible = 0;
  await recoverPetWeeklyBossVictories(db, owner, async () => { eligible++; }, 20);
  assert.equal(eligible, 1, 'both retained legacy and new midnight evidence enter recovery');
  for (let retry = 0; retry < 3; retry++) await hooks.buildPetMiniAppState(db, owner, 'test');
  const crest = sqlite.prepare('SELECT * FROM telegram_pet_weekly_crests WHERE telegram_id=?').get(owner);
  assert.equal(crest.qualification_week, 1, 'source Sunday belongs to the original ownership week');
  assert.equal(crest.earned_at.slice(0, 10), '2026-10-04');
  assert.equal(count('telegram_pet_weekly_crests', owner), 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE telegram_id=? AND system_key='weekly_boss_finish'").get(owner).n, 1);
  assert.deepEqual(claims(owner), paid, 'recovery must preserve paid receipts exactly');
  assert.deepEqual(sqlite.prepare('SELECT * FROM telegram_pet_weekly_boss_victories_by_pet WHERE telegram_id=?').get(owner), retainedVictory);
  assert.deepEqual(sqlite.prepare("SELECT * FROM telegram_pet_events WHERE telegram_id=? AND event_type='weekly_boss'").get(owner), retainedSource);
  assert.equal(energy(pet.pet_id), beforeEnergy);
  assert.equal(count('telegram_pet_weekly_boss_events', owner), 1);
}

mock.timers.setTime(Date.parse('2026-10-02T12:00:00Z'));
const owner = 'participation', winner = await seed(owner), later = secondPet(owner, winner);
sqlite.prepare("UPDATE telegram_pet_season_slots SET created_at='2026-09-26',journey_clock='created_at' WHERE telegram_id=?").run(owner);
const ready = (await hooks.buildPetMiniAppState(db, owner, 'test')).guidance.weekly_boss;
sqlite.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id,week_key,boss_id,damage,attempts)
  VALUES (?,?,?,?,1)`).run(owner, ready.week_key, ready.boss_id, ready.hp - 1);
const win = await hooks.processPetWeeklyBoss(db, owner, 'strike', 'shared-win', winner.pet_id);
assert.equal(win.reason, 'boss_defeated');
const winnerBoard = (await hooks.buildPetMiniAppState(db, owner, 'test')).guidance.weekly_boss;
assert.equal(winnerBoard.participation_available, false);
assert.equal(winnerBoard.participation_completed, true);
const shared = sqlite.prepare('SELECT * FROM telegram_pet_weekly_boss_progress WHERE telegram_id=?').get(owner);
const paid = claims(owner);
switchTo(owner, later);
let board = (await hooks.buildPetMiniAppState(db, owner, 'test')).guidance.weekly_boss;
assert.equal(board.available, true); assert.equal(board.participation_available, true);
assert.equal(board.participation_qualification_week, 1);
assert.equal(count('telegram_pet_weekly_crests', owner), 1, 'switching does not fabricate another pet’s evidence or Crest');

// Actual interactive choices remain authoritative, including unchanged gates
// and a whole-batch failure which cannot claim success or consume energy.
for (const failure of ['resolved', 'thrown']) {
  beforeBatch = statements => {
    if (!participationBatch(statements)) return;
    beforeBatch = null;
    if (failure === 'thrown') throw new Error('participation_rollback');
    return statements.map(() => ({ success: false, error: 'participation_rollback', results: [], meta: { changes: 0 } }));
  };
  await assert.rejects(hooks.processPetWeeklyBoss(db, owner, 'endure', `failure:${failure}`, later));
  assert.equal(energy(later), 80);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE telegram_id=? AND reason='weekly_boss_participation'").get(owner).n, 0);
}
beforeFirst = statement => statement.sql.includes('SELECT event_key,day_key,reason FROM telegram_pet_events')
  ? { success: false, error: 'unavailable' } : undefined;
await assert.rejects(hooks.processPetWeeklyBoss(db, owner, 'strike', 'read-outage', later), /pet_state_read_unavailable/);
beforeFirst = null;
assert.equal(energy(later), 80);

// Selection/deletion changes at the transactional boundary fail without
// borrowing the winner’s saved attempt or charging the newly selected pet.
beforeBatch = statements => {
  if (!participationBatch(statements)) return;
  beforeBatch = null; switchTo(owner, winner.pet_id);
};
assert.equal((await hooks.processPetWeeklyBoss(db, owner, 'strike', 'switch-race', later)).accepted, false);
assert.equal(energy(later), 80);
switchTo(owner, later);
for (const gate of ['egg', 'level', 'energy', 'deleted']) {
  beforeBatch = statements => {
    if (!participationBatch(statements)) return;
    beforeBatch = null;
    if (gate === 'egg') sqlite.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE pet_id=?").run(later);
    else sqlite.prepare(`UPDATE telegram_pet_instances SET ${({level:'pet_xp=0',energy:'energy=0',deleted:"status='archived'"})[gate]} WHERE pet_id=?`).run(later);
  };
  const pending = hooks.processPetWeeklyBoss(db, owner, 'strike', `gate:${gate}`, later);
  if (gate === 'deleted') await assert.rejects(pending, /weekly_boss_pet_authority_missing/);
  else assert.equal((await pending).accepted, false);
  sqlite.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='young' WHERE pet_id=?").run(later);
  sqlite.prepare("UPDATE telegram_pet_instances SET pet_xp=3240,energy=80,status='active' WHERE pet_id=?").run(later);
}
const attempts = await Promise.all(['strike', 'outsmart', 'endure'].map(move => hooks.processPetWeeklyBoss(db, owner, move, `challenge:${move}`, later)));
assert.equal(attempts.filter(result => result.accepted && !result.duplicate).length, 1);
assert.equal(energy(later), 68);
const participation = sqlite.prepare("SELECT * FROM telegram_pet_events WHERE telegram_id=? AND reason='weekly_boss_participation'").get(owner);
assert.equal(participation.pet_id, later); assert.equal(participation.day_key, '2026-10-02');
assert.equal(participation.pet_xp_awarded, 0); assert.equal(participation.xp_awarded, 0);
assert.deepEqual(sqlite.prepare('SELECT * FROM telegram_pet_weekly_boss_progress WHERE telegram_id=?').get(owner), shared);
assert.deepEqual(claims(owner), paid);
assert.equal(count('telegram_pet_weekly_boss_events', owner), 1);
assert.equal(count('telegram_pet_weekly_boss_victories_by_pet', owner), 1);
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_weekly_journey_objectives WHERE pet_id=? AND objective_id='weekly_boss_attempt'").get(later).n, 1);
assert.equal(count('telegram_pet_weekly_crests', owner), 1, 'participation alone does not waive the remaining Journey objectives');
board = (await hooks.buildPetMiniAppState(db, owner, 'test')).guidance.weekly_boss;
assert.equal(board.participation_available, false); assert.equal(board.participation_completed, true);
const duplicate = await hooks.processPetWeeklyBoss(db, owner, 'endure', participation.event_key, later);
assert.equal(duplicate.duplicate, true); assert.equal(duplicate.energy_cost, 0); assert.equal(duplicate.damage, 0);
assert.equal(energy(later), 68);
switchTo(owner, winner.pet_id);
assert.equal((await hooks.processPetWeeklyBoss(db, owner, 'endure', participation.event_key, winner.pet_id)).reason, 'weekly_boss_pet_changed');
switchTo(owner, later);

// The later pet earns its Crest only after all five objective requirements
// have their own accepted source evidence, including two distinct check-in days.
for (const [objective, type, amount] of [['weekly_care', 'feed', 5], ['weekly_training', 'train', 3], ['weekly_run', 'run_complete', 3], ['weekly_check_in', 'check_in', 2]]) {
  for (let index = 0; index < amount; index++) {
    const day = objective === 'weekly_check_in' && index === 0 ? '2026-10-01' : '2026-10-02';
    const eventKey = `source:${objective}:${index}`;
    sqlite.prepare(`INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,reason)
      VALUES (?,?,?,?,?,?,?,?,'accepted','fixture_accepted_action')`).run(eventKey, later, owner, type, eventKey, winner.season_key, day, ready.week_key);
    await recordWeeklyJourneyObjectiveEvidence(db, { pet_id: later, telegram_id: owner, season_key: winner.season_key,
      qualification_week: 1, objective_id: objective, source_event_key: eventKey, progress_value: 1, earned_at: `${day}T12:00:00Z` });
  }
}
await finalizeWeeklyJourneyCrest(db, { pet_id: later, telegram_id: owner, season_key: winner.season_key, qualification_week: 1 });
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_crests WHERE pet_id=?').get(later).n, 1);
await finalizeWeeklyJourneyCrest(db, { pet_id: later, telegram_id: owner, season_key: winner.season_key, qualification_week: 1 });
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_crests WHERE pet_id=?').get(later).n, 1);

// Ownership-week rollover precedes Monday: the same permanent pet can earn a
// fresh genuine attempt without repeating the shared victory or replaying a key.
mock.timers.setTime(Date.parse('2026-10-03T12:00:00Z'));
await hooks.processPetWeeklyBoss(db, owner, ''); // Persist elapsed care decay before comparing action costs.
const rolloverBoard = (await hooks.buildPetMiniAppState(db, owner, 'test')).guidance.weekly_boss;
assert.equal(rolloverBoard.week_key, ready.week_key);
assert.equal(rolloverBoard.participation_available, true);
assert.equal(rolloverBoard.participation_qualification_week, 2);
const rolloverEnergy = energy(later);
assert.equal((await hooks.processPetWeeklyBoss(db, owner, 'strike', participation.event_key, later)).duplicate, true);
assert.equal(energy(later), rolloverEnergy, 'an old request cannot buy the new Journey week’s attempt');
const current = await dispatchRenderedPetAction(db, owner, { id: owner }, { action: 'weekly_boss', move: 'outsmart', pet_id: later, request_id: 'new-journey-week' }, 'test');
assert.equal(current.accepted, true); assert.equal(current.participation_only, true);
assert.equal(current.participation_qualification_week, 2); assert.equal(current.energy_cost, 12);
assert.equal(energy(later), rolloverEnergy - 12);
assert.deepEqual(claims(owner), paid);
assert.equal(count('telegram_pet_weekly_boss_events', owner), 1);

// Source commit survives a follow-up outage. The existing bounded Journey
// recovery consumes that same saved attempt, without another challenge cost.
const interruptedOwner = 'participation-followup', interruptedPet = await seed(interruptedOwner);
const interruptedBoard = (await hooks.buildPetMiniAppState(db, interruptedOwner, 'test')).guidance.weekly_boss;
sqlite.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id,week_key,boss_id,damage,attempts,defeated_at,reward_claimed_at)
  VALUES (?,?,?,?,1,?,?)`).run(interruptedOwner, interruptedBoard.week_key, interruptedBoard.boss_id, interruptedBoard.hp,
    new Date().toISOString(), new Date().toISOString());
beforeRun = statement => {
  if (statement.sql.includes('INSERT OR IGNORE INTO telegram_pet_weekly_journey_objectives')) throw new Error('journey_followup_unavailable');
};
const interruptedChallenge = await hooks.processPetWeeklyBoss(db, interruptedOwner, 'outsmart', 'interrupted:challenge', interruptedPet.pet_id);
beforeRun = null;
assert.equal(interruptedChallenge.accepted, true); assert.equal(interruptedChallenge.duplicate, false);
assert.equal(energy(interruptedPet.pet_id), 68);
assert.equal(count('telegram_pet_weekly_journey_objectives', interruptedOwner), 0);
for (let retry = 0; retry < 3; retry++) await hooks.buildPetMiniAppState(db, interruptedOwner, 'test');
assert.equal(count('telegram_pet_weekly_journey_objectives', interruptedOwner), 1);
assert.equal(energy(interruptedPet.pet_id), 68);
assert.equal(count('telegram_pet_weekly_boss_victories_by_pet', interruptedOwner), 0);
assert.equal(claims(interruptedOwner).length, 0);

// Retained legacy attack+victory attribution can prove the winner already
// participated before the canonical pet-event backfill is available.
const legacyOwner = 'participation-retained-source', legacyPet = await seed(legacyOwner, 3240, 68);
const legacyBoard = (await hooks.buildPetMiniAppState(db, legacyOwner, 'test')).guidance.weekly_boss;
sqlite.prepare(`INSERT INTO telegram_pet_weekly_boss_events (event_id,telegram_id,week_key,day_key,boss_id,event_key,action,damage)
  VALUES ('legacy-attack',?,?,?,?,'legacy-winning-attack','strike',?)`)
  .run(legacyOwner, legacyBoard.week_key, '2026-10-03', legacyBoard.boss_id, legacyBoard.hp);
sqlite.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id,week_key,boss_id,damage,attempts,defeated_at,reward_claimed_at)
  VALUES (?,?,?,?,1,?,?)`).run(legacyOwner, legacyBoard.week_key, legacyBoard.boss_id, legacyBoard.hp,
    new Date().toISOString(), new Date().toISOString());
sqlite.prepare(`INSERT INTO telegram_pet_weekly_boss_victories_by_pet (telegram_id,week_key,boss_id,pet_id,season_key,victory_event_key,defeated_at)
  VALUES (?,?,?,?,?,'legacy-winning-attack',?)`).run(legacyOwner, legacyBoard.week_key, legacyBoard.boss_id,
    legacyPet.pet_id, legacyPet.season_key, new Date().toISOString());
const retained = await readPetWeeklyBossParticipation(db, legacyOwner, legacyPet);
assert.equal(retained.attempt.event_key, 'legacy-winning-attack');
const recoveredAttempt = await hooks.processPetWeeklyBoss(db, legacyOwner, 'strike', 'fresh-request-after-legacy-win', legacyPet.pet_id);
assert.equal(recoveredAttempt.reason, 'boss_already_defeated');
assert.equal(energy(legacyPet.pet_id), 68);
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE telegram_id=? AND reason='weekly_boss_participation'").get(legacyOwner).n, 0);
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE telegram_id=? AND event_key='legacy-winning-attack'").get(legacyOwner).n, 1);

// Historical evolution recovery keeps each old Mark date, while the lifetime
// completion marker records today's proven completion, never an earlier stage.
mock.timers.setTime(Date.parse('2026-10-02T16:00:00Z'));
const completeOwner = 'completion-date', permanent = await seed(completeOwner);
sqlite.prepare("UPDATE telegram_pet_season_slots SET created_at='2025-10-02',journey_clock='created_at' WHERE pet_id=?").run(permanent.pet_id);
for (let index = 0; index < 240; index++) {
  const earned = new Date(Date.parse('2025-11-01T00:00:00Z') + index * 86400000).toISOString();
  sqlite.prepare(`INSERT INTO telegram_pet_growth_marks (mark_id,pet_id,telegram_id,season_key,milestone_type,evidence_key,earned_day,earned_at)
    VALUES (?,?,?,?,'care_milestone',?,?,?)`).run(`mark:${index}`, permanent.pet_id, completeOwner, permanent.season_key, `care:${index}`, earned.slice(0, 10), earned);
}
for (let index = 1; index <= 44; index++) {
  sqlite.prepare(`INSERT INTO telegram_pet_weekly_crests (crest_id,pet_id,telegram_id,season_key,season_week,qualification_week,objective_id,evidence_key,earned_at)
    VALUES (?,?,?,?,?,?,'weekly_journey',?,'2026-09-01T00:00:00Z')`).run(`crest:${index}`, permanent.pet_id, completeOwner, permanent.season_key, index, index, `weekly-journey:${index}`);
}
for (const [evolution, stage, when] of [['street_moonpet', 1, '2025-10-09T12:00:00Z'], ['legendary_moon_guardian', 5, '2026-10-02T16:00:00Z']]) {
  sqlite.prepare(`INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key,unlocked_at)
    VALUES (?,?,?,?,?,?)`).run(permanent.pet_id, completeOwner, evolution, stage, `unlock:${evolution}`, when);
}
await reconcileEvolutionGrowthMarks(db, permanent.pet_id, permanent.season_key);
const completion = sqlite.prepare('SELECT * FROM telegram_pet_season_completions WHERE pet_id=?').get(permanent.pet_id);
assert.equal(completion.completed_at, '2026-10-02T16:00:00.000Z');
assert.equal(sqlite.prepare("SELECT earned_at FROM telegram_pet_growth_marks WHERE pet_id=? AND evidence_key LIKE 'evolution:street_moonpet:%'").get(permanent.pet_id).earned_at, '2025-10-09T12:00:00.000Z');
mock.timers.setTime(Date.parse('2026-10-03T16:00:00Z'));
await reconcileEvolutionGrowthMarks(db, permanent.pet_id, permanent.season_key);
await awardPetWeeklyCrest(db, { pet_id: permanent.pet_id, telegram_id: completeOwner, season_key: permanent.season_key,
  season_week: 45, objective: 'weekly_boss', evidence_key: 'weekly-boss:historical', earned_at: '2026-09-15T00:00:00Z' });
assert.deepEqual(sqlite.prepare('SELECT * FROM telegram_pet_season_completions WHERE pet_id=?').get(permanent.pet_id), completion);
assert.equal(count('telegram_pet_growth_marks', completeOwner), 242);
assert.equal((await readPetWeeklyBossParticipation(db, owner, { pet_id: later, season_key: winner.season_key })).qualification_week, 2);
mock.timers.reset();
console.log('Moonpet weekly source dates, per-pet participation and lifetime completion regressions passed.');
