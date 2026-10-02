import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { completePetOnboarding, repairPaidPetOnboarding } from '../workers/moonboys-api/pets/onboarding.js';
import { hatchMoonpet } from '../workers/moonboys-api/pets/species-lifecycle.js';
import { evolveMoonpet } from '../workers/moonboys-api/pets/moonpet-identity.js';
import { buildPetLifecycleProgress } from '../workers/moonboys-api/pets/season-completion.js';
import { PET_INSTANCE_AUTHORITY_VERSION } from '../workers/moonboys-api/pets/wallet-reconciliation.js';

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for (const file of ['schema.sql', 'migrations/048_telegram_pet_player_expansion.sql', 'migrations/058_telegram_pet_season_completion.sql', 'migrations/061_moonpet_season_economy_calibration.sql']) {
  sql.exec(await readFile(new URL('../workers/moonboys-api/' + file, import.meta.url), 'utf8'));
}
let beforeRepair, failAt;
class Statement {
  constructor(query, args = []) { Object.assign(this, { query, args }); }
  bind(...args) { return new Statement(this.query, args); }
  async first() { return sql.prepare(this.query).get(...this.args) || null; }
  async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
  async run() {
    if (failAt && this.query.includes(failAt)) throw new Error('D1 paid onboarding injected failure');
    if (/^\s*SELECT\b|\bRETURNING\b/i.test(this.query)) {
      const results = sql.prepare(this.query).all(...this.args);
      return { results, meta: { changes: sql.prepare('SELECT changes() AS n').get().n } };
    }
    return { meta: { changes: sql.prepare(this.query).run(...this.args).changes } };
  }
}
const db = {
  prepare: query => new Statement(query),
  async batch(statements) {
    if (beforeRepair && statements[0]?.query.includes('INSERT OR IGNORE INTO telegram_pet_identity_events')) {
      const callback = beforeRepair; beforeRepair = null; await callback();
    }
    sql.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sql.exec('COMMIT');
      return results;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
async function owner(id) {
  sql.prepare('INSERT INTO telegram_users(telegram_id) VALUES (?)').run(id);
  sql.prepare('INSERT INTO arcade_progression_state(telegram_id,arcade_xp_total) VALUES (?,5000)').run(id);
  sql.prepare('INSERT INTO arcade_xp_wallets(telegram_id,arcade_xp_earned,arcade_xp_spendable) VALUES (?,5000,5000)').run(id);
  assert.equal((await hooks.processPetAction(db, id, 'adopt', { event_key: id + ':adopt' })).accepted, true);
}
const tableRows = (table, id) => sql.prepare(`SELECT * FROM ${table} WHERE telegram_id=? ORDER BY rowid`).all(id);
const baseline = petId => sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND evolution_id='moon_egg'").get(petId).n;
const claimCount = petId => sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_identity_events WHERE pet_id=? AND event_key='pet:onboarding:'||pet_id AND applied_at IS NOT NULL").get(petId).n;

// Real purchases must atomically include the same first-evolution authority as
// the free starter, before any screen refresh or manual repair is necessary.
await owner('new-purchases');
for (const ordinal of [2, 3]) {
  const bought = await hooks.buyPetSeasonSlot(db, 'new-purchases', ordinal);
  assert.equal(bought.accepted, true);
  const pet = sql.prepare('SELECT * FROM telegram_pet_season_slots WHERE telegram_id=? AND slot_number=?').get('new-purchases', ordinal);
  assert.equal(baseline(pet.pet_id), 1);
  assert.equal(claimCount(pet.pet_id), 1);
  assert.equal(sql.prepare('SELECT first_adoption_at FROM telegram_pet_memories WHERE pet_id=?').get(pet.pet_id).first_adoption_at, pet.created_at);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_lifecycle_events_by_pet WHERE pet_id=? AND action='egg_created'").get(pet.pet_id).n, 1);
}
const purchaseWallet = sql.prepare("SELECT arcade_xp_spendable,arcade_xp_spent FROM arcade_xp_wallets WHERE telegram_id='new-purchases'").get();
assert.deepEqual({ ...purchaseWallet }, { arcade_xp_spendable: 3500, arcade_xp_spent: 1500 });

// Follow the actual paid pet hatch and evolve paths. All legitimate gates being
// satisfied must permit Street Moonpet, without a client-created baseline.
const paid = sql.prepare("SELECT * FROM telegram_pet_season_slots WHERE telegram_id='new-purchases' AND slot_number=2").get();
assert.equal((await hooks.switchActivePetSeasonSlot(db, 'new-purchases', paid.pet_id)).accepted, true);
const aged = new Date(Date.now() - 16 * 86400000).toISOString();
sql.prepare('UPDATE telegram_pet_season_slots SET created_at=? WHERE pet_id=?').run(aged, paid.pet_id);
sql.prepare('UPDATE telegram_pet_lifecycle_by_pet SET created_at=? WHERE pet_id=?').run(aged, paid.pet_id);
assert.equal((await hatchMoonpet(db, 'new-purchases', 'paid:hatch')).accepted, true);
sql.prepare('UPDATE telegram_pet_instances SET pet_xp=1000,level=6 WHERE pet_id=?').run(paid.pet_id);
await hooks.getPetProfile(db, 'new-purchases');
sql.prepare("INSERT INTO telegram_pet_material_balances(telegram_id,material_key,quantity) VALUES ('new-purchases','scrap_metal',50)").run();
for (let day = 0; day < 7; day += 1) {
  const earnedDay = new Date(Date.now() - (8 + day) * 86400000).toISOString().slice(0, 10);
  sql.prepare('INSERT INTO telegram_pet_growth_marks(mark_id,pet_id,telegram_id,season_key,milestone_type,evidence_key,earned_day) VALUES (?,?,?,?,?,?,?)')
    .run('paid-mark-' + day, paid.pet_id, 'new-purchases', paid.season_key, 'care', 'care:paid:' + day, earnedDay);
}
sql.prepare("INSERT INTO telegram_pet_weekly_crests(crest_id,pet_id,telegram_id,season_key,season_week,objective_id,evidence_key,qualification_week) VALUES (?,?,?, ?,1,'weekly_boss','weekly-boss:paid',1)")
  .run('paid-crest', paid.pet_id, 'new-purchases', paid.season_key);
assert.equal((await buildPetLifecycleProgress(db, paid.pet_id, paid.season_key)).evolution_ready, true);
assert.equal((await evolveMoonpet(db, { telegram_id: 'new-purchases', evolution_id: 'street_moonpet', event_key: 'paid:evolve' })).accepted, true);
assert.equal(sql.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id='new-purchases' AND material_key='scrap_metal'").get().quantity, 45);

function oldPaid(id, petId, options = {}) {
  const sourceSeason = 'pet-s2026-003', createdAt = '2026-08-15 12:34:56';
  sql.prepare(`INSERT INTO telegram_pet_season_slots(pet_id,telegram_id,season_key,slot_number,acquisition_type,arcade_xp_spent,created_at,status)
    VALUES (?,?,?,2,'arcade_xp',500,?,?)`).run(petId, id, sourceSeason, createdAt, options.archived ? 'archived' : 'active');
  if (options.missingInstance) return;
  sql.prepare(`INSERT INTO telegram_pet_instances(pet_id,telegram_id,season_key,slot_number,pet_name,pet_xp,level,source_profile_updated_at,status)
    VALUES (?,?,?,2,'Saved paid pet',2345,8,?,?)`).run(petId, id, sourceSeason, PET_INSTANCE_AUTHORITY_VERSION, options.archived ? 'archived' : 'active');
  sql.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet(pet_id,telegram_id,identity_seed,phase,species_id,incubation_progress,incubation_json,hatched_at,created_at)
    VALUES (?,?,?,'adult','moon_ferret',12,'{"warm":3,"music":2,"rest":1}','2026-08-30 12:34:56',?)`).run(petId, id, 'retained-' + petId, createdAt);
  sql.prepare(`INSERT INTO telegram_pet_memories(pet_id,telegram_id,season_key,total_runs,total_bosses_defeated,biggest_reward_amount,biggest_reward_currency,milestones)
    VALUES (?,?,?,8,3,400,'moon_gold','["saved_history"]')`).run(petId, id, sourceSeason);
  sql.prepare(`INSERT INTO telegram_pet_evolutions_by_pet(pet_id,telegram_id,evolution_id,stage,unlock_event_key,materials_consumed)
    VALUES (?,?,'street_moonpet',1,'saved-street-evolution',1)`).run(petId, id);
}

// Normal state preparation repairs an old inactive paid pet and keeps its
// exact lifetime, training, hatched identity, higher evolution and memories.
await owner('legacy-paid');
oldPaid('legacy-paid', 'legacy-paid-2');
const kept = new Map(['telegram_pet_instances', 'telegram_pet_lifecycle_by_pet', 'telegram_pet_season_slots', 'telegram_pet_active_slots', 'arcade_xp_wallets', 'arcade_progression_state']
  .map(table => [table, tableRows(table, 'legacy-paid')]));
const savedMemory = sql.prepare("SELECT * FROM telegram_pet_memories WHERE pet_id='legacy-paid-2'").get();
await hooks.preparePetMiniAppState(db, 'legacy-paid');
assert.equal(baseline('legacy-paid-2'), 1);
assert.equal(claimCount('legacy-paid-2'), 1);
for (const [table, rows] of kept) assert.deepEqual(tableRows(table, 'legacy-paid'), rows, table + ' remains unchanged by inactive paid repair');
const repairedMemory = sql.prepare("SELECT * FROM telegram_pet_memories WHERE pet_id='legacy-paid-2'").get();
for (const [field, value] of Object.entries(savedMemory)) {
  if (!['first_adoption_at', 'milestones', 'updated_at'].includes(field)) assert.equal(repairedMemory[field], value, 'retained memory ' + field);
}
assert.equal(repairedMemory.first_adoption_at, '2026-08-15 12:34:56');
assert.deepEqual(JSON.parse(repairedMemory.milestones), ['saved_history', 'first_adoption', 'evolution_moon_egg']);
assert.equal(sql.prepare("SELECT MAX(stage) AS stage FROM telegram_pet_evolutions_by_pet WHERE pet_id='legacy-paid-2'").get().stage, 1);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_lifecycle_events_by_pet WHERE pet_id='legacy-paid-2' AND action='egg_created'").get().n, 0, 'repair does not pretend a hatched pet became an egg');
const completedChanges = sql.prepare('SELECT total_changes() AS n').get().n;
assert.equal(await repairPaidPetOnboarding(db, 'legacy-paid'), 0);
assert.equal(sql.prepare('SELECT total_changes() AS n').get().n, completedChanges, 'complete paid pets need no further writes');

// Two old purchase repairs compete for one canonical claim and one set of
// analytics. Losing repair must observe the winner without duplicating history.
await owner('repair-race'); oldPaid('repair-race', 'repair-race-2');
let winner;
beforeRepair = async () => { winner = await repairPaidPetOnboarding(db, 'repair-race'); };
assert.equal(await repairPaidPetOnboarding(db, 'repair-race'), 0);
assert.equal(winner, 1);
assert.equal(baseline('repair-race-2'), 1);
assert.equal(claimCount('repair-race-2'), 1);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_identity_analytics WHERE pet_id='repair-race-2'").get().n, 3);

// Failure midway through either creation or repair rolls back its entire
// transaction. A retry can finish without a second charge or partial claim.
await owner('purchase-rollback');
const beforeWallet = tableRows('arcade_xp_wallets', 'purchase-rollback');
failAt = 'INSERT INTO telegram_pet_memories';
await assert.rejects(hooks.buyPetSeasonSlot(db, 'purchase-rollback', 2), /injected failure/);
failAt = null;
assert.deepEqual(tableRows('arcade_xp_wallets', 'purchase-rollback'), beforeWallet);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_season_slots WHERE telegram_id='purchase-rollback'").get().n, 1);
assert.equal((await hooks.buyPetSeasonSlot(db, 'purchase-rollback', 2)).accepted, true);
assert.equal(sql.prepare("SELECT arcade_xp_spent FROM arcade_xp_wallets WHERE telegram_id='purchase-rollback'").get().arcade_xp_spent, 500);
await owner('repair-rollback'); oldPaid('repair-rollback', 'repair-rollback-2');
const beforeMemory = sql.prepare("SELECT * FROM telegram_pet_memories WHERE pet_id='repair-rollback-2'").get();
failAt = 'INSERT OR IGNORE INTO telegram_pet_evolutions_by_pet';
await assert.rejects(repairPaidPetOnboarding(db, 'repair-rollback'), /injected failure/);
failAt = null;
assert.deepEqual(sql.prepare("SELECT * FROM telegram_pet_memories WHERE pet_id='repair-rollback-2'").get(), beforeMemory);
assert.equal(claimCount('repair-rollback-2'), 0);
assert.equal(baseline('repair-rollback-2'), 0);
assert.equal(await repairPaidPetOnboarding(db, 'repair-rollback'), 1);

// Ownership proof is mandatory. Deleted pets and missing paid instances remain
// untouched, and another account cannot initialize their identity records.
await owner('archived-paid'); oldPaid('archived-paid', 'archived-paid-2', { archived: true });
await owner('missing-paid'); oldPaid('missing-paid', 'missing-paid-2', { missingInstance: true });
assert.equal(await repairPaidPetOnboarding(db, 'archived-paid'), 0);
assert.equal(await repairPaidPetOnboarding(db, 'missing-paid'), 0);
assert.equal(await completePetOnboarding(db, 'legacy-paid', 'archived-paid-2', { paidOwnership: true }), false);
assert.equal(baseline('archived-paid-2'), 0);
assert.equal(sql.prepare("SELECT status FROM telegram_pet_instances WHERE pet_id='archived-paid-2'").get().status, 'archived');
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_instances WHERE pet_id='missing-paid-2'").get().n, 0);
assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length, 0);
console.log('Paid Moonpet atomic onboarding, evolution, retained repair, concurrency and rollback tests passed');
