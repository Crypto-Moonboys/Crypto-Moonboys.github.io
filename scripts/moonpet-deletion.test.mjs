import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { readPetLeaderboard } from '../workers/moonboys-api/pets/leaderboard.js';
import { awardPetReward } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { PET_REGION_CONTENT, PET_EVENT_CHAINS, PET_SEASONAL_BOSSES } from '../workers/moonboys-api/pets/content-phase-4.js';
import { PET_ROGUELITE_BOSSES } from '../workers/moonboys-api/pets/roguelite-foundation.js';
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
assert.equal((await awardPetReward(db,{telegram_id:'owner',pet_id:oldId,season_key:source.season_key,source:'pet_event',idempotency_key:'kept-reward',rewards:{pet_xp:100,community_xp:25,moon_gold:40,moon_crystals:2,style_tokens:3,items:{moon_kibble:2},materials:{moon_scrap:3},relics:{alley_crown:{rarity:'rare',effects:{health:2}}}},context:{pet_id:oldId,season_key:source.season_key}})).accepted,true);
await hooks.getPetProfile(db,'owner');
const saved = new Map(['telegram_pet_reward_claims','telegram_pet_reward_assets','telegram_pet_inventory','telegram_pet_relics','telegram_pet_material_balances','telegram_pet_events','telegram_pet_season_state','arcade_xp_wallets','arcade_progression_state','telegram_users'].map(table=>[table,sql.prepare('SELECT * FROM '+table).all()]));
assert.ok(sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_reward_assets WHERE amount>0").get().n>=3,'banked item, material and relic receipts are exercised');
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

// Preserve all three visible/numeric space positions through repeated deletion.
const spaceOwner='space-order', spaceIds=[await player(spaceOwner)];
for (const ordinal of [2,3]) {
  assert.equal((await hooks.buyPetSeasonSlot(db,spaceOwner,ordinal)).accepted,true);
  spaceIds.push((await hooks.buildPetSeasonSlotSummary(db,spaceOwner)).slots.find(s=>s.slot_number===ordinal).pet_id);
}
for (const [index,id] of spaceIds.entries()) {
  sql.prepare('UPDATE telegram_pet_season_slots SET created_at=? WHERE pet_id=?').run(`2025-01-0${index+1} 00:00:00`,id);
}
const spaceWallet=sql.prepare('SELECT * FROM arcade_xp_wallets WHERE telegram_id=?').get(spaceOwner);
for (const index of [0,1,2,0,2,1]) {
  const result=await hooks.deletePetSlot(db,spaceOwner,confirm(spaceIds[index]));
  assert.equal(result.accepted,true);
  spaceIds[index]=result.replacement_pet_id;
  assert.deepEqual(result.season_slots.slots.map(s=>s.pet_id),spaceIds,'full roster retains the original space order');
  assert.deepEqual((await hooks.buildPetSeasonSlotCoreSummary(db,spaceOwner)).slots.map(s=>s.pet_id),spaceIds,'core roster uses the same immutable order');
  assert.equal(result.season_slots.slots[index].pet.lifetime_progression.current_week,1,'new pet age does not inherit space age');
  for (const ordinal of [1,2,3]) {
    const switched=await hooks.switchActivePetSeasonSlot(db,spaceOwner,String(ordinal));
    assert.equal(switched.accepted,true);
    assert.equal(switched.pet.pet_id,spaceIds[ordinal-1],'numeric switching resolves the preserved space');
  }
}
assert.equal((await hooks.buyPetSeasonSlot(db,spaceOwner,3)).reason,'pet_slot_already_owned');
assert.deepEqual(sql.prepare('SELECT * FROM arcade_xp_wallets WHERE telegram_id=?').get(spaceOwner),spaceWallet);

const rowFor=id=>sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(id);
async function expectBlocked(owner,id,message) {
  assert.equal((await hooks.deletePetSlot(db,owner,confirm(id))).reason,'pet_delete_blocked',message);
  assert.equal(rowFor(id).status,'active');
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM telegram_pet_identity_events WHERE pet_id=? AND event_key='pet:delete:'||pet_id").get(id).n,0,'no deletion claim survives a blocker');
}
async function settle(owner,id,type,key,source=type) {
  const pet=rowFor(id),context={pet_id:id,season_key:pet.season_key,pet_season_key:pet.season_key};
  if (source==='pet_district' || source==='pet_event_chain') {
    context.system_event_id=owner;
    sql.prepare("UPDATE telegram_pet_system_events SET status='settling' WHERE id=?").run(owner);
  }
  if (source==='pet_seasonal_boss') {
    const boss=sql.prepare('SELECT * FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get(id);
    context.season_key=boss.season_key; context.boss_key=boss.boss_key;
  }
  if (source.startsWith('roguelite_')) {
    context.run_id=sql.prepare('SELECT run_id FROM telegram_pet_runs WHERE pet_id=?').get(id).run_id;
    if (source==='roguelite_boss') { context.room_id='daily-boss';context.boss_id=Object.keys(PET_ROGUELITE_BOSSES)[0]; }
  }
  assert.equal((await awardPetReward(db,{telegram_id:owner,pet_id:id,season_key:pet.season_key,source,idempotency_key:key,
    event_key:key,event_type:type,rewards:{pet_xp:12,moon_gold:7},context})).accepted,true);
}

// A rejected reservation is recoverable only with a saved charged/frozen decision.
for (const [system,content,payload] of [
  ['district',PET_REGION_CONTENT,{energy_charged:1,decision:{success:true}}],
  ['event_chain',PET_EVENT_CHAINS,{decision:{step:1}}],
  ['seasonal_boss',PET_SEASONAL_BOSSES,{energy_charged:1,decision:{attack:{damage:10}}}],
]) {
  const owner='rejected-'+system,id=await player(owner),pet=rowFor(id),action=Object.keys(content)[0];
  // Create the source after the pre-read, proving the guard is transactional.
  beforeBatch=()=>sql.prepare(`INSERT INTO telegram_pet_system_events(id,pet_id,telegram_id,season_key,system_key,action_key,period_key,status,payload_json)
    VALUES (?,?,?,?,?,?,?,'rejected',?)`).run(owner,id,owner,pet.season_key,system,action,day,JSON.stringify(payload));
  await expectBlocked(owner,id,'recoverable rejected '+system+' blocks without a claim row');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE pet_id=?').get(id).n,0);
  await settle(owner,id,system,owner+':reward',({district:'pet_district',event_chain:'pet_event_chain',seasonal_boss:'pet_event'})[system]);
  sql.prepare("UPDATE telegram_pet_system_events SET status='completed' WHERE id=?").run(owner);
  const result=await hooks.deletePetSlot(db,owner,confirm(id));
  assert.equal(result.accepted,true);
  assert.equal(rowFor(id).pet_xp,12,'settlement occurs before archiving');
}
for (const payload of [{}, {energy_charged:0,decision:{}}, 'malformed']) {
  const owner='uncharged-'+crypto.randomUUID(),id=await player(owner),pet=rowFor(id);
  sql.prepare(`INSERT INTO telegram_pet_system_events(id,pet_id,telegram_id,season_key,system_key,action_key,period_key,status,payload_json)
    VALUES (?,?,?,?, 'district',?,?,'rejected',?)`).run(owner,id,owner,pet.season_key,Object.keys(PET_REGION_CONTENT)[0],day,typeof payload==='string'?payload:JSON.stringify(payload));
  assert.equal((await hooks.deletePetSlot(db,owner,confirm(id))).accepted,true,'uncharged/malformed rejected reservations do not lock deletion forever');
}

// Completed system event, saved defeat, no claim: this is the pre-payout window.
const raidOwner='raid-preclaim',raidId=await player(raidOwner),raidPet=rowFor(raidId),raidKey=Object.keys(PET_SEASONAL_BOSSES)[0];
sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress(pet_id,telegram_id,pet_season_key,season_key,boss_key,defeated_at)
  VALUES (?,?,?,'saved-raid',?,CURRENT_TIMESTAMP)`).run(raidId,raidOwner,raidPet.season_key,raidKey);
sql.prepare(`INSERT INTO telegram_pet_system_events(id,pet_id,telegram_id,season_key,system_key,action_key,period_key,status)
  VALUES (?,?,?,?, 'seasonal_boss',?,'saved-raid','completed')`).run(raidOwner,raidId,raidOwner,raidPet.season_key,raidKey);
await expectBlocked(raidOwner,raidId,'defeated seasonal boss remains claimable');
await settle(raidOwner,raidId,'seasonal_boss',`seasonal:saved-raid:${raidOwner}:${raidId}`,'pet_seasonal_boss');
sql.prepare('UPDATE telegram_pet_seasonal_boss_progress SET reward_claimed_at=CURRENT_TIMESTAMP WHERE pet_id=?').run(raidId);
assert.equal((await hooks.deletePetSlot(db,raidOwner,confirm(raidId))).accepted,true);

// Each Arena participant's saved pet is independently protected before payout.
const arenaOwners=['arena-p1','arena-p2'],arenaIds=[];
for (const owner of arenaOwners) arenaIds.push(await player(owner));
sql.prepare(`INSERT INTO telegram_pet_arena_battles(id,battle_id,chat_id,player1_telegram_id,player2_telegram_id,
  player1_pet_id,player1_season_key,player2_pet_id,player2_season_key,player1_pet_snapshot_json,player2_pet_snapshot_json,status,result)
  VALUES ('arena-preclaim','arena-preclaim','test',?,?,?,?,?,?,'{}','{}','completed','draw')`)
  .run(arenaOwners[0],arenaOwners[1],arenaIds[0],rowFor(arenaIds[0]).season_key,arenaIds[1],rowFor(arenaIds[1]).season_key);
for (const [index,owner] of arenaOwners.entries()) {
  await expectBlocked(owner,arenaIds[index],'completed Arena source precedes participant award');
  await settle(owner,arenaIds[index],'arena_battle',`pet_arena:arena-preclaim:${owner}`,'pet_arena');
  assert.equal((await hooks.deletePetSlot(db,owner,confirm(arenaIds[index]))).accepted,true,'the other participant payout does not block a settled pet');
}

// Kaiju has JSON reward-source tuples rather than dedicated pet columns.
for (const mode of ['solo','group']) {
  const owners=mode==='solo'?['kaiju-solo']:['kaiju-p1','kaiju-p2'],ids=[];
  for (const owner of owners) ids.push(await player(owner));
  const sources=Object.fromEntries(owners.map((owner,index)=>[owner,{pet_id:ids[index],season_key:rowFor(ids[index]).season_key}]));
  const match='preclaim-'+mode;
  sql.prepare(`INSERT INTO telegram_pet_kaiju_matches(id,match_id,chat_id,mode,status,player1_telegram_id,player2_telegram_id,
    player1_card_key,player2_card_key,cpu_card_key,result,score_json) VALUES (?,?,?,?,'completed',?,?,'card','card','cpu','draw',?)`)
    .run(match,match,match,mode,owners[0],owners[1]||null,JSON.stringify({reward_sources:sources}));
  for (const [index,owner] of owners.entries()) {
    await expectBlocked(owner,ids[index],'completed '+mode+' Kaiju outcome cannot archive an unpaid source pet');
    await settle(owner,ids[index],'kaiju_battle',`pet_kaiju:${match}:${owner}`,'pet_kaiju');
    assert.equal((await hooks.deletePetSlot(db,owner,confirm(ids[index]))).accepted,true);
  }
}

// A pending event reservation alone also protects its original pet.
const pendingOwner='event-pending',pendingId=await player(pendingOwner),pendingPet=rowFor(pendingId);
sql.prepare(`INSERT INTO telegram_pet_events(id,pet_id,telegram_id,event_type,event_key,season_key,day_key,status)
  VALUES (?,?,?,'train','saved-pending',?,?,'pending')`).run(pendingOwner,pendingId,pendingOwner,pendingPet.season_key,day);
await expectBlocked(pendingOwner,pendingId,'pre-claim event reservations block deletion');
sql.prepare("UPDATE telegram_pet_events SET status='rejected' WHERE id=?").run(pendingOwner);
assert.equal((await hooks.deletePetSlot(db,pendingOwner,confirm(pendingId))).accepted,true);

// Even a settled terminal run may still have an unpaid won boss and daily records.
const dailyOwner='daily-preclaim',dailyId=await player(dailyOwner),dailyPet=rowFor(dailyId),bossKey=Object.keys(PET_ROGUELITE_BOSSES)[0];
sql.prepare(`INSERT INTO telegram_pet_runs(id,pet_id,telegram_id,run_id,season_key,status,depth,max_depth,current_room,max_room)
  VALUES ('daily-source',?,?,'daily-source',?,'completed',1,1,1,1)`).run(dailyId,dailyOwner,dailyPet.season_key);
sql.prepare(`INSERT INTO telegram_pet_daily_runs(telegram_id,pet_id,utc_day,seed,run_id,status) VALUES (?,?,?,'seed','daily-source','active')`).run(dailyOwner,dailyId,day);
sql.prepare(`INSERT INTO telegram_pet_run_rooms(room_id,pet_id,run_id,telegram_id,room_number,room_type,status,generated_data,outcome_data)
  VALUES ('daily-boss',?,'daily-source',?,1,'boss','resolved',?,'{"success":true}')`).run(dailyId,dailyOwner,JSON.stringify({boss_id:bossKey}));
await settle(dailyOwner,dailyId,'roguelite_completion','daily-source');
await expectBlocked(dailyOwner,dailyId,'settled completion does not hide an unpaid boss');
await settle(dailyOwner,dailyId,'roguelite_boss','daily-boss:'+bossKey);
await expectBlocked(dailyOwner,dailyId,'boss payout does not hide unapplied daily records');
sql.exec("UPDATE telegram_pet_daily_runs SET status='completed' WHERE run_id='daily-source'");
sql.prepare(`INSERT INTO telegram_pet_daily_analytics(analytics_id,pet_id,telegram_id,utc_day,run_id,event_type,event_data,applied_at)
  VALUES ('daily-source:daily:terminal',?,?,?,'daily-source','run_terminal','{"boss_defeated":true}',CURRENT_TIMESTAMP)`).run(dailyId,dailyOwner,day);
await settle(dailyOwner,dailyId,'daily_moon_run',`daily-moon-run:${dailyOwner}:daily-source:completed`,'pet_event');
assert.equal((await hooks.deletePetSlot(db,dailyOwner,confirm(dailyId))).accepted,true);
assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
console.log('Confirmed Moonpet deletion, reward retention, replacement and concurrency tests passed');
