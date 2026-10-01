import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { readPetLeaderboard } from '../workers/moonboys-api/pets/leaderboard.js';
import { awardPetReward } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { PET_WEEKLY_BOSSES } from '../workers/moonboys-api/pets/player-expansion.js';
import { recoverPetWeeklyBossVictories } from '../workers/moonboys-api/pets/weekly-boss-recovery.js';

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for (const path of ['schema.sql','migrations/048_telegram_pet_player_expansion.sql','migrations/058_telegram_pet_season_completion.sql','migrations/061_moonpet_season_economy_calibration.sql']) {
  sql.exec(await readFile(new URL('../workers/moonboys-api/'+path,import.meta.url),'utf8'));
}
let beforeBatch, failAt, failRead;
class Statement {
  constructor(query,args=[]) { this.sql=query; this.args=args; }
  bind(...args) { return new Statement(this.sql,args); }
  async first() { if (failRead && this.sql.includes('SELECT s.*')) return {success:false}; return sql.prepare(this.sql).get(...this.args)||null; }
  async all() { return {results:sql.prepare(this.sql).all(...this.args)}; }
  async run() {
    if (failAt && this.sql.includes(failAt)) throw Error('D1 injected failure');
    if (/RETURNING/i.test(this.sql)) { const results=sql.prepare(this.sql).all(...this.args); return {results,meta:{changes:results.length}}; }
    return {meta:{changes:sql.prepare(this.sql).run(...this.args).changes}};
  }
}
const db = {
  prepare:query=>new Statement(query),
  async batch(statements) {
    if (beforeBatch && statements[0]?.args.includes('memory')===false && statements[0]?.args.some(arg=>String(arg).startsWith('pet:delete:'))) {
      const callback=beforeBatch; beforeBatch=null; await callback();
    }
    sql.exec('BEGIN');
    try { const results=[]; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results; }
    catch(error) { sql.exec('ROLLBACK'); throw error; }
  },
};
async function player(owner) {
  sql.prepare('INSERT INTO telegram_users(telegram_id) VALUES (?)').run(owner);
  sql.prepare('INSERT INTO arcade_progression_state(telegram_id,arcade_xp_total) VALUES (?,5000)').run(owner);
  sql.prepare('INSERT INTO arcade_xp_wallets(telegram_id,arcade_xp_earned,arcade_xp_spendable) VALUES (?,5000,5000)').run(owner);
  assert.equal((await hooks.processPetAction(db,owner,'adopt',{event_key:owner+':adopt'})).accepted,true);
  return sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(owner).pet_id;
}
const confirm=pet_id=>({action:'delete_pet_slot',pet_id,confirm_pet_id:pet_id,confirmed:true});
const oldId=await player('owner');
await player('stranger');
// Bank a real reward and snapshot its complete receipt, asset and account rows.
const source = sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(oldId);
assert.equal((await awardPetReward(db,{telegram_id:'owner',pet_id:oldId,season_key:source.season_key,source:'pet_event',idempotency_key:'kept-reward',rewards:{pet_xp:100,moon_gold:40,moon_crystals:2,style_tokens:3},context:{pet_id:oldId,season_key:source.season_key}})).accepted,true);
await hooks.getPetProfile(db,'owner');
const saved = new Map(['telegram_pet_reward_claims','telegram_pet_reward_assets','telegram_pet_events','telegram_pet_season_state','arcade_xp_wallets','arcade_progression_state','telegram_users'].map(table=>[table,sql.prepare('SELECT * FROM '+table).all()]));
const balances = sql.prepare("SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='owner'").get();
const allTimeBefore=(await readPetLeaderboard(db,{period:'all_time',owner:'owner'})).rows.find(row=>row.telegram_id==='owner').pet_xp;
assert.equal((await hooks.deletePetSlot(db,'owner',{pet_id:oldId})).reason,'pet_delete_confirmation_required');
assert.equal((await hooks.deletePetSlot(db,'owner',{...confirm(oldId),confirm_pet_id:'other'})).accepted,false);
assert.equal((await hooks.deletePetSlot(db,'stranger',confirm(oldId))).reason,'pet_delete_not_available');
assert.equal(sql.prepare('SELECT status FROM telegram_pet_instances WHERE pet_id=?').get(oldId).status,'active');
const deletion = await hooks.processPetMiniAppAction(db,'owner',{},confirm(oldId),'');
assert.equal(deletion.accepted,true,'egg deletion bypasses hatch requirements');
assert.equal(hooks.serializePetMiniAppActionResult(deletion).reward_history_preserved,true);
assert.equal(sql.prepare('SELECT status FROM telegram_pet_instances WHERE pet_id=?').get(oldId).status,'archived');
assert.equal(sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(oldId).pet_xp,100);
assert.equal(sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get('owner').pet_id,deletion.replacement_pet_id);
const replacement = await hooks.getPetProfile(db,'owner');
assert.equal(replacement.pet_id,deletion.replacement_pet_id);
assert.equal(replacement.pet_xp,0,'old training is never copied to the replacement');
assert.equal((await hooks.getMoonpetLifecycle(db,'owner')).phase,'egg');
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_evolutions_by_pet WHERE pet_id=?').get(replacement.pet_id).n,1);
assert.equal(deletion.season_slots.slots.find(slot=>slot.active).pet.lifetime_progression.current_week,1);
assert.equal(deletion.season_slots.deleted_pet_history[0].pet_id,oldId);
assert.equal(deletion.season_slots.deleted_pet_history[0].awarded_receipts,1);
for (const [table,rows] of saved) assert.deepEqual(sql.prepare('SELECT * FROM '+table).all(),rows,table+' stays byte-for-byte unchanged');
assert.deepEqual(sql.prepare("SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='owner'").get(),balances);
assert.equal((await readPetLeaderboard(db,{period:'all_time',owner:'owner'})).rows.find(row=>row.telegram_id==='owner').pet_xp,allTimeBefore);
assert.equal((await hooks.deletePetSlot(db,'owner',confirm(oldId))).accepted,false,'a retry cannot delete the replacement');
assert.equal((await hooks.switchActivePetSeasonSlot(db,'owner',oldId)).accepted,false);
await hooks.preparePetMiniAppState(db,'owner',new Date('2030-01-01'));
assert.equal(sql.prepare('SELECT status FROM telegram_pet_season_slots WHERE pet_id=?').get(oldId).status,'archived','repair cannot resurrect deleted pets');

// Paid replacement does not debit the wallet or change active-pet state.
assert.equal((await hooks.buyPetSeasonSlot(db,'owner',2)).accepted,true);
const paid=sql.prepare("SELECT pet_id FROM telegram_pet_season_slots WHERE telegram_id='owner' AND acquisition_type='arcade_xp' AND status='active'").get().pet_id;
const walletBefore=sql.prepare("SELECT * FROM arcade_xp_wallets WHERE telegram_id='owner'").get();
const selectionBefore=sql.prepare("SELECT * FROM telegram_pet_active_slots WHERE telegram_id='owner'").get();
const paidDeletion=await hooks.deletePetSlot(db,'owner',confirm(paid));
assert.equal(paidDeletion.accepted,true);
assert.deepEqual(sql.prepare("SELECT * FROM arcade_xp_wallets WHERE telegram_id='owner'").get(),walletBefore);
assert.deepEqual(sql.prepare("SELECT * FROM telegram_pet_active_slots WHERE telegram_id='owner'").get(),selectionBefore);
assert.equal(sql.prepare('SELECT acquisition_type FROM telegram_pet_season_slots WHERE pet_id=?').get(paidDeletion.replacement_pet_id).acquisition_type,'arcade_xp');
assert.equal((await hooks.buyPetSeasonSlot(db,'owner',3)).accepted,true);
assert.equal((await hooks.buyPetSeasonSlot(db,'owner',3)).accepted,false);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_season_slots WHERE telegram_id='owner' AND status='active'").get().n,3);

// Any failed statement rolls back the claim, archive, replacement and pointer.
const rollbackId=await player('rollback');
const priorInstance=sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(rollbackId);
failAt='INSERT INTO telegram_pet_memories';
await assert.rejects(hooks.deletePetSlot(db,'rollback',confirm(rollbackId)),/injected failure/);
failAt=null;
assert.deepEqual(sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(rollbackId),priorInstance);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_identity_events WHERE telegram_id='rollback' AND event_key LIKE 'pet:delete:%'").get().n,0);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_instances WHERE telegram_id='rollback'").get().n,1);
assert.equal((await hooks.deletePetSlot(db,'rollback',confirm(rollbackId))).accepted,true);

// Two requests read the old pet, then compete for the canonical delete claim.
const raceId=await player('race');
let winner;
beforeBatch=async()=>{ winner=await hooks.deletePetSlot(db,'race',confirm(raceId)); };
assert.equal((await hooks.deletePetSlot(db,'race',confirm(raceId))).accepted,false);
assert.equal(winner.accepted,true);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_instances WHERE telegram_id='race'").get().n,2);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_season_slots WHERE telegram_id='race' AND status='active'").get().n,1);

// A new session between the authority read and transaction prevents deletion.
const blockedId=await player('blocked');
beforeBatch=()=>sql.prepare("INSERT INTO telegram_pet_activity_sessions(id,telegram_id,activity_type,ends_at) VALUES ('pending','blocked','train','2030-01-01')").run();
assert.equal((await hooks.deletePetSlot(db,'blocked',confirm(blockedId))).reason,'pet_delete_blocked');
assert.equal(sql.prepare('SELECT status FROM telegram_pet_instances WHERE pet_id=?').get(blockedId).status,'active');
sql.exec("UPDATE telegram_pet_activity_sessions SET status='completed',metadata='{\"claim_state\":\"claiming\"}' WHERE id='pending'");
assert.equal((await hooks.deletePetSlot(db,'blocked',confirm(blockedId))).accepted,false,'interrupted timed reward remains claimable');
sql.exec("UPDATE telegram_pet_activity_sessions SET status='cancelled' WHERE id='pending'");
sql.prepare("INSERT INTO telegram_pet_contracts(contract_id,pet_id,telegram_id,season_key,sequence,status,state_json,reward_xp) VALUES ('unpaid',?,'blocked',?,1,'completed','{}',20)").run(blockedId,sql.prepare('SELECT season_key FROM telegram_pet_instances WHERE pet_id=?').get(blockedId).season_key);
assert.equal((await hooks.deletePetSlot(db,'blocked',confirm(blockedId))).accepted,false,'unclaimed contract XP blocks deletion');
sql.exec("UPDATE telegram_pet_contracts SET reward_settled=1 WHERE contract_id='unpaid'");
failRead=true;
await assert.rejects(hooks.deletePetSlot(db,'blocked',confirm(blockedId)),/read_unavailable/);
failRead=false;
assert.equal((await hooks.deletePetSlot(db,'blocked',confirm(blockedId))).accepted,true);
// Replacement lifetime periods still qualify saved weekly boss recovery.
const boss=PET_WEEKLY_BOSSES[0], now=new Date().toISOString(), day=now.slice(0,10), week='2026-W40';
const bossPet=sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(paidDeletion.replacement_pet_id);
sql.prepare(`INSERT INTO telegram_pet_events(id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,reason,metadata)
  VALUES ('replacement-victory',?,'owner','weekly_boss','replacement-victory',?,?,?,'accepted','weekly_boss_attempt',?)`).run(bossPet.pet_id,bossPet.season_key,day,week,JSON.stringify({source:'pet_weekly_boss',boss_id:boss.boss_id}));
sql.prepare(`INSERT INTO telegram_pet_weekly_boss_progress(telegram_id,week_key,boss_id,damage,defeated_at) VALUES ('owner',?,?,999999,?)`).run(week,boss.boss_id,now);
sql.prepare(`INSERT INTO telegram_pet_weekly_boss_victories_by_pet(telegram_id,week_key,boss_id,pet_id,season_key,victory_event_key,defeated_at)
  VALUES ('owner',?,?,?,?,'replacement-victory',?)`).run(week,boss.boss_id,bossPet.pet_id,bossPet.season_key,now);
let recovered=false;
await recoverPetWeeklyBossVictories(db,'owner',async(_db,_owner,_week,_boss,victory)=>{assert.equal(victory.pet_id,bossPet.pet_id);recovered=true;});
assert.equal(recovered,true,'saved source tuple, rather than a calendar-only key, authorizes recovery');
assert.equal((await hooks.deletePetSlot(db,'owner',confirm(bossPet.pet_id))).accepted,false,'a saved but unfinished boss award blocks deletion');

const terminalId=await player('terminal'), terminal=sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(terminalId);
sql.prepare(`INSERT INTO telegram_pet_runs(id,pet_id,telegram_id,run_id,season_key,status,depth,max_depth) VALUES ('terminal',?,'terminal','saved-terminal',?,'completed',1,1)`).run(terminalId,terminal.season_key);
assert.equal((await hooks.deletePetSlot(db,'terminal',confirm(terminalId))).accepted,false,'earned run rewards block deletion even before a claim row exists');
sql.prepare(`INSERT INTO telegram_pet_reward_claims(claim_id,pet_id,telegram_id,source,idempotency_key,day_key,status)
  VALUES ('settled-terminal',?,'terminal','pet_run_legacy','pet_run_complete:terminal:saved-terminal',?,'awarded')`).run(terminalId,day);
assert.equal((await hooks.deletePetSlot(db,'terminal',confirm(terminalId))).accepted,true);
assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
console.log('Confirmed Moonpet deletion, reward retention, replacement and concurrency tests passed');
