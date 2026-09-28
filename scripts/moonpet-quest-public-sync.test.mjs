import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { PET_WEEKLY_JOURNEY_OBJECTIVES, recordWeeklyJourneyObjectiveEvidence, finalizeWeeklyJourneyCrest } from '../workers/moonboys-api/pets/weekly-journey.js';
import { recoverPetJourneyAwards } from '../workers/moonboys-api/pets/journey-recovery.js';
import { processPetCraftRecipe } from '../workers/moonboys-api/pets/live-systems.js';
import { PET_DAILY_CHALLENGES } from '../workers/moonboys-api/pets/daily-moon-run.js';

const day = '2026-07-05';
const seasonKey = 'pet-s2026-003';
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  for (const file of ['048_telegram_pet_player_expansion.sql', '058_telegram_pet_season_completion.sql', '061_moonpet_season_economy_calibration.sql']) {
    sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/' + file, import.meta.url), 'utf8'));
  }
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
    async run() { if (db.beforeRun) await db.beforeRun(this); return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } }; }
  }
  const db = { prepare: query => new Statement(query), async batch(statements) {
    sql.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(await s.run()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, 'Audit player');
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp) VALUES (?,20000)').run(owner);
  const petId = `pet-${owner}`;
  function pet(id, slot) {
    sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,?,'free')").run(id, owner, seasonKey, slot);
    sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,source_profile_updated_at) VALUES (?,?,?,?,20000,'0001-01-01 00:00:00')").run(id, owner, seasonKey, slot);
    sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,'young','vinyl_crab','{}','[]')").run(id, owner, id);
  }
  pet(petId, 1);
  sql.prepare('INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner, petId, seasonKey);
  const request = { telegram_id: owner, pet_id: petId, season_key: seasonKey, qualification_week: 1 };
  async function evidence(objective, key, sourceDay = day, defer = false) {
    const eventType = { weekly_care: 'feed', weekly_training: 'train', weekly_run: 'run_complete', weekly_boss_attempt: 'weekly_boss', weekly_check_in: 'daily_chest' }[objective];
    sql.prepare("INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status) VALUES (?,?,?,?,?,?,?,'2026-W27','accepted')")
      .run(key, petId, owner, eventType, key, seasonKey, sourceDay);
    return recordWeeklyJourneyObjectiveEvidence(db, { ...request, objective_id: objective, source_event_key: key }, { defer_award: defer });
  }
  async function otherObjectives() {
    for (const [id, definition] of Object.entries(PET_WEEKLY_JOURNEY_OBJECTIVES)) {
      if (id === 'weekly_check_in') continue;
      for (let i = 0; i < definition.target; i++) await evidence(id, `${id}:${i}`);
    }
  }
  const summary = () => hooks.buildPetMiniAppJourneySummary(db, owner, {
    season: hooks.getPetSeasonInfo(new Date(day)), current_season_week: 1,
    slots: [{ pet_id: petId, season_key: seasonKey, active: true }],
  }, new Date(`${day}T12:00:00Z`));
  const get = async path => {
    const response = await worker.fetch(new Request('https://audit.test' + path), { DB: db });
    assert.equal(response.status, 200); return response.json();
  };
  return { sql, db, owner, petId, pet, request, evidence, otherObjectives, summary, get };
}

test('account-owned crafting is logged once without borrowing a selected pet or changing XP', async () => {
  const f = fixture('83101');
  f.sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,'elite_moonpet',3,'revealed')").run(f.petId, f.owner);
  for (const material of ['scrap_metal', 'moon_fabric']) f.sql.prepare('INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,?,10)').run(f.owner, material);
  const before = (await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp;
  assert.equal((await processPetCraftRecipe(f.db, f.owner, 'street_rations', 'audit-craft')).accepted, true);
  assert.equal((await processPetCraftRecipe(f.db, f.owner, 'street_rations', 'audit-craft')).duplicate, true);
  assert.equal(f.sql.prepare("SELECT pet_id FROM telegram_pet_system_events WHERE system_key='crafting'").get().pet_id, '');
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp, before);
  f.pet('new-selected-pet', 2);
  f.sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=? WHERE telegram_id=?').run('new-selected-pet', f.owner);
  const activity = await f.get('/telegram-pets/activity');
  const rows = activity.items.filter(e => e.event_type === 'crafting');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].display_name, 'UNKNOWN', 'an account receipt cannot claim another pet\'s identity');
  assert.match(rows[0].text, /Audit player crafted Street Rations/);
  assert.equal(rows[0].pet_xp_awarded, 0);
  assert.ok(!JSON.stringify(activity).includes(f.owner));
});

function seedDailyJourney(f, date) {
  // Persisted accepted objective evidence is the award queue's input. Source
  // validation is covered separately; this fixture isolates award delivery.
  for (const [id, goal] of Object.entries(PET_DAILY_CHALLENGES).slice(0, 3)) {
    const key = `${date}:${id}`;
    f.sql.prepare(`INSERT INTO telegram_pet_daily_journey_objectives
      (event_id,telegram_id,pet_id,season_key,utc_day,challenge_id,event_key,progress_value,status)
      VALUES (?,?,?,?,?,?,?,?,'accepted')`).run(key,f.owner,f.petId,seasonKey,date,id,key,goal.target);
  }
}

for (const kind of ['daily', 'weekly']) test(`${kind} Journey recovery rotates past two persistently failing awards`, async () => {
  const f = fixture(`fair-${kind}`);
  for (let index = 0; index < 3; index++) {
    if (kind === 'daily') seedDailyJourney(f, `2026-07-0${index + 5}`);
    else {
      f.request.qualification_week = index + 1;
      for (const [id, goal] of Object.entries(PET_WEEKLY_JOURNEY_OBJECTIVES)) {
        for (let n = 0; n < goal.target; n++) {
          const date = new Date(Date.UTC(2026, 6, 5 + index * 7 + (id === 'weekly_check_in' ? n : 0))).toISOString().slice(0, 10);
          await f.evidence(id, `${index}:${id}:${n}`, date, true);
        }
      }
    }
  }
  f.pet('selected-new-pet', 2);
  f.sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=? WHERE telegram_id=?').run('selected-new-pet', f.owner);
  const table = kind === 'daily' ? 'telegram_pet_growth_marks' : 'telegram_pet_weekly_crests';
  f.db.beforeRun = statement => {
    if (statement.query.includes(`INSERT OR IGNORE INTO ${table}`)
      && (kind === 'daily' ? statement.args.some(arg => ['2026-07-05','2026-07-06'].includes(arg)) : Number(statement.args[4]) <= 2)) {
      throw Error('persistent_journey_award_failure');
    }
  };
  const recover = () => recoverPetJourneyAwards(f.db, f.owner, { award_limit: 2 });
  await recover();
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0);
  await recover();
  const rows = f.sql.prepare(`SELECT * FROM ${table}`).all();
  assert.equal(rows.length, 1, 'a later earned award must not remain blocked behind the failed batch');
  assert.equal(rows[0].pet_id, f.petId);
  assert.equal(rows[0].season_key, seasonKey);
  if (kind === 'daily') assert.equal(rows[0].earned_day, '2026-07-07');
  else { assert.equal(rows[0].qualification_week, 3); assert.equal(rows[0].earned_at.slice(0,10), '2026-07-20'); }
  f.db.beforeRun = null;
  await recover(); await recover();
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 3, 'rotation must return to the failed awards after repair');
  const saved = f.sql.prepare(`SELECT * FROM ${table} ORDER BY earned_at`).all();
  await recover();
  assert.deepEqual(f.sql.prepare(`SELECT * FROM ${table} ORDER BY earned_at`).all(), saved);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp, 40000, 'Marks and Crests do not create Pet XP');
});

test('Journey source recovery rotates past persistent evidence failures without changing accepted XP receipts', async () => {
  const f = fixture('fair-sources');
  for (const id of ['source-a','source-b','source-c']) f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status)
    VALUES (?,?,?,'feed',?,?,?,'2026-W27','accepted')`).run(id,f.petId,f.owner,id,seasonKey,day);
  const receipts = f.sql.prepare('SELECT * FROM telegram_pet_events ORDER BY id').all();
  f.db.beforeRun = statement => {
    if (statement.query.includes('INSERT OR IGNORE INTO telegram_pet_weekly_journey_objectives')
      && statement.args.some(arg => ['source-a','source-b'].includes(arg))) throw Error('persistent_source_failure');
  };
  const recover = () => recoverPetJourneyAwards(f.db, f.owner, { source_limit: 2 });
  await recover(); await recover();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_weekly_journey_objectives WHERE source_event_key='source-c'").get().n, 1);
  f.db.beforeRun = null;
  await recover(); await recover();
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_journey_objectives').get().n, 3);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_daily_journey_objectives').get().n, 3);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_events ORDER BY id').all(), receipts);
});

test('an overlapping Journey refresh cannot rewind the retry cursor or process a stale batch', async () => {
  const f = fixture('fair-overlap');
  for (const date of ['2026-07-05','2026-07-06','2026-07-07']) seedDailyJourney(f, date);
  const key = 'moonpet:journey-recovery:daily';
  const concurrentCursor = `${seasonKey}:2026-07-05:${f.petId}`;
  let raced = false;
  f.db.beforeRun = statement => {
    if (!raced && statement.query.includes('INSERT INTO telegram_settings') && statement.args[1] === key) {
      raced = true;
      // A different refresh claimed its turn after this request read the queue.
      f.sql.prepare('INSERT INTO telegram_settings (telegram_id,setting_key,setting_value) VALUES (?,?,?)')
        .run(f.owner, key, concurrentCursor);
    }
  };
  const recover = () => recoverPetJourneyAwards(f.db, f.owner, { award_limit: 2 });
  await recover();
  assert.equal(raced, true);
  assert.equal(f.sql.prepare('SELECT setting_value FROM telegram_settings WHERE setting_key=?').get(key).setting_value, concurrentCursor);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_growth_marks').get().n, 0);
  f.db.beforeRun = null;
  await recover();
  assert.deepEqual(f.sql.prepare('SELECT earned_day FROM telegram_pet_growth_marks ORDER BY earned_day').all().map(row => row.earned_day), ['2026-07-06','2026-07-07']);
  await recover();
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_growth_marks').get().n, 3);
});

test('Weekly check-in needs two source UTC days in both the UI and live Crest settlement', async () => {
  const f = fixture('83102');
  await f.otherObjectives();
  await f.evidence('weekly_check_in', 'cache:first');
  await f.evidence('weekly_check_in', 'cache:same-day-alias');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_crests').get().n, 0, 'two same-day events cannot award a Crest');
  let state = await f.summary();
  assert.equal(state.weekly.completed_objectives, 4);
  assert.equal(state.weekly.objectives.find(o => o.objective_id === 'weekly_check_in').progress, 1);
  assert.equal(state.weekly.weekly_crest_awarded, false);
  const earned = await f.evidence('weekly_check_in', 'cache:second-day', '2026-07-06');
  assert.equal(earned.weekly_journey.accepted, true);
  state = await f.summary();
  assert.equal(state.weekly.completed_objectives, 5);
  assert.equal(state.weekly.weekly_crest_awarded, true);
  const crest = f.sql.prepare('SELECT * FROM telegram_pet_weekly_crests').get();
  assert.equal(crest.earned_at.slice(0, 10), '2026-07-06');
  await finalizeWeeklyJourneyCrest(f.db, f.request);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_weekly_crests').get(), crest);
});

test('historical Weekly recovery counts distinct days and preserves the true qualification day', async () => {
  const f = fixture('83103');
  await f.otherObjectives();
  await f.evidence('weekly_check_in', 'backlog:first', day, true);
  await f.evidence('weekly_check_in', 'backlog:same-day', day, true);
  await recoverPetJourneyAwards(f.db, f.owner);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_crests').get().n, 0);
  await f.evidence('weekly_check_in', 'backlog:second-day', '2026-07-06', true);
  await f.evidence('weekly_check_in', 'backlog:later-day', '2026-07-07', true);
  await recoverPetJourneyAwards(f.db, f.owner);
  const crest = f.sql.prepare('SELECT * FROM telegram_pet_weekly_crests').get();
  assert.equal(crest.earned_at.slice(0, 10), '2026-07-06');
  await recoverPetJourneyAwards(f.db, f.owner);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_weekly_crests').get(), crest);
});

test('Weekly evidence rejects mismatched instance owner, season and slot authority', async () => {
  for (const column of ['telegram_id', 'season_key', 'slot_number']) {
    const f = fixture(`authority-${column}`);
    f.sql.prepare("INSERT INTO telegram_users (telegram_id) VALUES ('wrong')").run();
    f.sql.prepare("INSERT INTO telegram_pet_profiles (telegram_id) VALUES ('wrong')").run();
    // Simulate a pre-constraint legacy tuple; the current schema rejects new
    // inconsistent rows, and runtime evidence must reject old ones as well.
    f.sql.exec('PRAGMA foreign_keys=OFF');
    f.sql.prepare(`UPDATE telegram_pet_instances SET ${column}=? WHERE pet_id=?`).run(column === 'slot_number' ? 2 : 'wrong', f.petId);
    f.sql.exec('PRAGMA foreign_keys=ON');
    const result = await f.evidence('weekly_care', 'bad-authority');
    assert.equal(result.accepted, false, column);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_journey_objectives').get().n, 0);
  }
});
