import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { getPetOwnershipPeriod, getPetJourneyWeek, getPetJourneyWeekBounds } from '../workers/moonboys-api/pets/ownership-period.js';
import { PET_INSTANCE_AUTHORITY_VERSION } from '../workers/moonboys-api/pets/wallet-reconciliation.js';

class Statement {
  constructor(db,sql,args=[]) { Object.assign(this,{db,sql,args}); }
  bind(...args) { return new Statement(this.db,this.sql,args); }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results:this.db.prepare(this.sql).all(...this.args) }; }
  async run() {
    if (/RETURNING/.test(this.sql)) return { results:this.db.prepare(this.sql).all(...this.args),meta:{changes:this.db.prepare('SELECT changes() AS n').get().n} };
    return { meta:{ changes:this.db.prepare(this.sql).run(...this.args).changes } };
  }
}
class D1 {
  constructor(sqlite) { this.sqlite=sqlite; }
  prepare(sql) { return new Statement(this.sqlite,sql); }
  async batch(statements) {
    if (this.beforePurchase && statements.some(s=>s.sql.includes('arcade_xp_spendable=arcade_xp_spendable-'))) {
      const before=this.beforePurchase; this.beforePurchase=null; before();
    }
    this.sqlite.exec('BEGIN');
    try { const results=[]; for (const s of statements) results.push(await s.run()); this.sqlite.exec('COMMIT'); return results; }
    catch (e) { this.sqlite.exec('ROLLBACK'); throw e; }
  }
}
const sql=new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
const read=path=>readFile(new URL('../workers/moonboys-api/'+path,import.meta.url),'utf8');
// Rehearse the old deployed CHECK constraints, then migrate real saved rows.
sql.exec((await read('schema.sql')).replaceAll('qualification_week >= 1','qualification_week BETWEEN 1 AND 13'));
sql.exec(await read('migrations/058_telegram_pet_season_completion.sql'));
sql.exec(await read('migrations/061_moonpet_season_economy_calibration.sql'));
const db=new D1(sql), now=new Date('2026-10-01T12:00:00Z');
function owner(id) {
  sql.prepare('INSERT INTO telegram_users (telegram_id) VALUES (?)').run(id);
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id) VALUES (?)').run(id);
  sql.prepare('INSERT INTO arcade_progression_state (telegram_id,arcade_xp_total) VALUES (?,5000)').run(id);
  sql.prepare('INSERT INTO arcade_xp_wallets (telegram_id,arcade_xp_earned,arcade_xp_spendable) VALUES (?,5000,5000)').run(id);
}
function pet(id,user,season,slot,created,xp=0) {
  sql.prepare(`INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type,arcade_xp_spent,created_at)
    VALUES (?,?,?,?,?,?,?)`).run(id,user,season,slot,slot===1?'free':'arcade_xp',slot===1?0:500,created);
  sql.prepare(`INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,source_profile_updated_at,last_decay_at)
    VALUES (?,?,?,?,?,?,?)`).run(id,user,season,slot,xp,PET_INSTANCE_AUTHORITY_VERSION,now.toISOString());
  sql.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase) VALUES (?,?,?,'egg')`).run(id,user,id);
}
owner('recovered');
pet('original','recovered','pet-s2026-003',1,'2026-07-01',4321);
pet('purchased','recovered','pet-s2026-003',2,'2026-08-15',9876);
pet('rollout-egg','recovered','pet-s2026-004',1,'2026-10-01',37);
sql.prepare(`INSERT INTO telegram_pet_active_slots VALUES ('recovered','rollout-egg','pet-s2026-004',CURRENT_TIMESTAMP)`).run();
sql.exec(`INSERT INTO telegram_pet_weekly_crests VALUES ('legacy-qualified','original','recovered','pet-s2026-003',12,'weekly_boss','weekly-boss:old','2026-09-20',12);
  INSERT INTO telegram_pet_weekly_crests VALUES ('legacy-unqualified','original','recovered','pet-s2026-003',12,'weekly_journey','weekly-journey:old','2026-09-21',NULL);
  INSERT INTO telegram_pet_weekly_journey_objectives VALUES ('saved-objective','recovered','original','pet-s2026-003',12,'weekly_care','source-receipt','feed',1,'accepted','{}','2026-09-20');
  INSERT INTO telegram_pet_weekly_journey_receipts VALUES ('saved-receipt','source-receipt','recovered','original','pet-s2026-003',12,1,'rejected','incomplete',NULL,'2026-09-20');`);
const leafTables=['telegram_pet_weekly_crests','telegram_pet_weekly_journey_objectives','telegram_pet_weekly_journey_receipts'];
const saved=new Map(leafTables.map(table=>[table,sql.prepare('SELECT * FROM '+table).all()]));
sql.exec(await read('migrations/085_permanent_pet_weekly_evidence.sql'));
for (const table of leafTables) assert.deepEqual(sql.prepare('SELECT * FROM '+table).all(),saved.get(table),'migration preserves every historical field and receipt');
assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
// Both qualified and unqualified beta evidence are preserved; new week 14 is valid.
sql.exec(`INSERT INTO telegram_pet_weekly_crests VALUES ('future','original','recovered','pet-s2026-003',14,'weekly_journey','weekly-journey:future','2026-10-06',14)`);
assert.throws(()=>sql.exec(`INSERT INTO telegram_pet_weekly_crests VALUES ('duplicate','original','recovered','pet-s2026-003',14,'weekly_boss','weekly-boss:future','2026-10-06',14)`),/UNIQUE/);
assert.throws(()=>sql.exec(`INSERT INTO telegram_pet_weekly_journey_receipts VALUES ('invalid','invalid','recovered','original','pet-s2026-003',0,0,'rejected','invalid',NULL,CURRENT_TIMESTAMP)`),/CHECK/);

const roster=await hooks.buildPetSeasonSlotSummary(db,'recovered',now);
assert.deepEqual(roster.slots.map(slot=>slot.pet_id),['original','purchased','rollout-egg'],'all old pets and the new egg are visible');
assert.equal(roster.active_pet_id,'rollout-egg');
assert.equal(roster.slots[1].pet.pet_xp,9876);
assert.equal(roster.can_buy_next_slot,false);
await hooks.preparePetMiniAppState(db,'recovered',new Date('2030-01-01'));
assert.equal(sql.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='recovered'").get().pet_id,'rollout-egg','valid selection survives years of calendar changes');
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_season_slots WHERE telegram_id='recovered'").get().n,3);
assert.equal((await hooks.switchActivePetSeasonSlot(db,'recovered','purchased',{now})).accepted,true,'paid pet from an earlier quarter is selectable');
assert.equal((await hooks.getPetProfile(db,'recovered')).pet_xp,9876,'switching uses the original saved progression');
assert.equal((await hooks.switchActivePetSeasonSlot(db,'recovered','original',{now})).accepted,true);
assert.equal((await hooks.buildPetSeasonSlotSummary(db,'recovered',now)).current_season_week,14);
assert.equal((await hooks.switchActivePetSeasonSlot(db,'recovered',0,{now})).reason,'invalid_pet_slot');

// Pointer repair must skip missing paid instances and prefer intact pets over
// missing free starters. Preserve every ownership row without inventing XP.
for (const pointer of ['absent','invalid']) {
  const user=`repair-${pointer}`;
  owner(user);
  sql.prepare(`INSERT INTO telegram_pet_season_slots
    (pet_id,telegram_id,season_key,slot_number,acquisition_type,arcade_xp_spent,created_at)
    VALUES (?,?,'pet-s2026-002',2,'arcade_xp',500,'2026-04-01')`).run(`${user}:missing-paid`,user);
  sql.prepare(`INSERT INTO telegram_pet_season_slots
    (pet_id,telegram_id,season_key,slot_number,acquisition_type,created_at)
    VALUES (?,?,'pet-s2026-002',1,'free','2026-04-02')`).run(`${user}:missing-free`,user);
  pet(`${user}:intact`,user,'pet-s2026-003',2,'2026-07-01',7654);
  if (pointer==='invalid') sql.prepare(`INSERT INTO telegram_pet_active_slots
    (telegram_id,pet_id,season_key) VALUES (?,?,'pet-s2026-002')`).run(user,`${user}:missing-paid`);
  assert.equal(await hooks.preparePetMiniAppState(db,user,now),true,'an intact owned pet remains accessible');
  assert.equal(sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(user).pet_id,`${user}:intact`);
  assert.equal((await hooks.getPetProfile(db,user)).pet_xp,7654);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_instances WHERE telegram_id=?').get(user).n,1,'no missing instance is synthesized when an intact pet exists');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_season_slots WHERE telegram_id=?').get(user).n,3,'paid ownership and free starter are retained');
  assert.equal(sql.prepare('SELECT arcade_xp_spendable FROM arcade_xp_wallets WHERE telegram_id=?').get(user).arcade_xp_spendable,5000);
}
owner('repair-free');
sql.exec(`INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type)
  VALUES ('repair-free:starter','repair-free','pet-s2026-002',1,'free')`);
assert.equal(await hooks.preparePetMiniAppState(db,'repair-free',now),true,'a missing free starter can still be repaired');
assert.equal(sql.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='repair-free'").get().pet_id,'repair-free:starter');
owner('repair-paid-only');
sql.exec(`INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type,arcade_xp_spent)
  VALUES ('repair-paid-only:paid','repair-paid-only','pet-s2026-002',2,'arcade_xp',500)`);
assert.equal(await hooks.preparePetMiniAppState(db,'repair-paid-only',now),false,'missing paid saves require recovery instead of a replacement egg');
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_season_slots WHERE telegram_id='repair-paid-only'").get().n,1);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_instances WHERE telegram_id='repair-paid-only'").get().n,0);
const missingWallet = sql.prepare("SELECT * FROM arcade_xp_wallets WHERE telegram_id='repair-paid-only'").get();
const missingOwnership = sql.prepare("SELECT * FROM telegram_pet_season_slots WHERE telegram_id='repair-paid-only'").all();
for (const slot of [2,3]) {
  const blocked = await hooks.buyPetSeasonSlot(db,'repair-paid-only',slot,{now});
  assert.equal(blocked.accepted,false);
  assert.equal(blocked.reason,'pet_ownership_recovery_required','missing paid ownership never causes another purchase charge');
}
assert.deepEqual(sql.prepare("SELECT * FROM arcade_xp_wallets WHERE telegram_id='repair-paid-only'").get(),missingWallet);
assert.deepEqual(sql.prepare("SELECT * FROM telegram_pet_season_slots WHERE telegram_id='repair-paid-only'").all(),missingOwnership);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_instances WHERE telegram_id='repair-paid-only'").get().n,0);
for (const summary of [await hooks.buildPetSeasonSlotSummary(db,'repair-paid-only',now), await hooks.buildPetSeasonSlotCoreSummary(db,'repair-paid-only',now)]) {
  const missing = summary.slots[0];
  assert.equal(missing.pet_id,'repair-paid-only:paid');
  assert.equal(missing.unlocked,true,'the purchased space remains owned');
  assert.equal(missing.arcade_xp_spent,500);
  assert.equal(missing.instance_present,false);
  assert.equal(missing.selectable,false);
  assert.equal(missing.selection_disabled_reason,'pet_instance_missing');
  assert.equal(missing.pet,null,'no default pet or XP is fabricated');
  assert.equal(missing.active,false);
  assert.equal(summary.active_pet_id,null);
  assert.equal(summary.can_buy_next_slot,false);
  assert.equal(summary.purchase_disabled_reason,'pet_ownership_recovery_required');
  assert.equal(summary.slots[1].purchase_enabled,false);
}

// Legacy recovery may reveal more saves than capacity. Preserve all; never sell more.
pet('extra-history','recovered','pet-s2026-002',1,'2026-04-01',17);
const overflow=await hooks.buildPetSeasonSlotSummary(db,'recovered',now);
assert.equal(overflow.slots.length,4); assert.equal(overflow.recovery_over_capacity,true); assert.equal(overflow.can_buy_next_slot,false);
assert.equal((await hooks.switchActivePetSeasonSlot(db,'recovered','extra-history',{now})).accepted,true);
const walletBefore=sql.prepare("SELECT * FROM arcade_xp_wallets WHERE telegram_id='recovered'").get();
assert.equal((await hooks.buyPetSeasonSlot(db,'recovered',3,{now})).reason,'pet_slot_already_owned');
assert.deepEqual(sql.prepare("SELECT * FROM arcade_xp_wallets WHERE telegram_id='recovered'").get(),walletBefore);

// Two requests may observe one space before another creation quarter allocates it.
owner('purchase-race'); pet('race-original','purchase-race','pet-s2026-003',1,'2026-07-01');
sql.prepare(`INSERT INTO telegram_pet_active_slots VALUES ('purchase-race','race-original','pet-s2026-003',CURRENT_TIMESTAMP)`).run();
db.beforePurchase=()=>pet('racing-purchase','purchase-race','pet-s2026-002',2,'2026-08-15');
const race=await hooks.buyPetSeasonSlot(db,'purchase-race',2,{now});
assert.equal(race.accepted,false,'atomic across-season capacity guard rejects a stale purchase');
assert.equal(sql.prepare("SELECT arcade_xp_spendable FROM arcade_xp_wallets WHERE telegram_id='purchase-race'").get().arcade_xp_spendable,5000,'conflicting purchase spends nothing');
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_season_slots WHERE telegram_id='purchase-race'").get().n,2);
assert.equal((await hooks.buyPetSeasonSlot(db,'purchase-race',3,{now})).accepted,true);
assert.equal((await hooks.buildPetSeasonSlotSummary(db,'purchase-race',new Date('2027-01-01'))).slots.filter(s=>s.unlocked).length,3);
assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);

// Calendar quarter boundaries keep historical week numbers and extend indefinitely.
for (const key of ['pet-s2026-003','2026-q3']) {
  const period=getPetOwnershipPeriod(key);
  assert.equal(getPetJourneyWeek(period,'2026-09-30T23:59:59Z'),13);
  assert.equal(getPetJourneyWeek(period,'2026-10-01T00:00:00Z'),14);
  assert.equal(getPetJourneyWeek(period,'2026-10-08T00:00:00Z'),15);
  assert.equal(getPetJourneyWeekBounds(period,13).end_at,'2026-10-01T00:00:00.000Z');
  assert.equal(getPetJourneyWeekBounds(period,14).start_at,'2026-10-01T00:00:00.000Z');
  assert.equal(period.end_at,null);
}
const legacy=getPetOwnershipPeriod('legacy', '2026-07-03T18:00:00Z');
assert.equal(getPetJourneyWeek(legacy,'2026-07-03'),1);
assert.equal(getPetJourneyWeek(legacy,'2027-07-03'),53);
console.log('permanent ownership, saved evidence migration and cross-season purchase race tests passed');
