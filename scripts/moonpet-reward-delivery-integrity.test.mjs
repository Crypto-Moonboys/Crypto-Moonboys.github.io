import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { getActiveSeasonalBoss, processPetSeasonalBoss } from '../workers/moonboys-api/pets/live-systems.js';

const season = hooks.getPetSeasonInfo(new Date()).key;
const file = name => fs.readFileSync(new URL('../workers/moonboys-api/' + name, import.meta.url), 'utf8');
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(file('schema.sql'));
  for (const migration of ['048_telegram_pet_player_expansion.sql', '058_telegram_pet_season_completion.sql', '061_moonpet_season_economy_calibration.sql', '085_permanent_pet_weekly_evidence.sql']) sql.exec(file('migrations/' + migration));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { if (db.beforeFirst) await db.beforeFirst(this); return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      if (sql.prepare(this.query).columns().length && !/\bRETURNING\b/i.test(this.query)) return { results: sql.prepare(this.query).all(...this.args), meta: { changes: 0 } };
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) { const result = await db.beforeRun(this); if (result) return result; } return this.exec(); }
  }
  const db = { prepare: query => new Statement(query), async batch(statements) {
    if (db.beforeBatch) await db.beforeBatch(statements);
    sql.exec('BEGIN');
    try {
      const results = statements.map(s => s.exec());
      if (db.failRewardBatch && statements.some(s => s.query.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims'))) {
        const mode = db.failRewardBatch; db.failRewardBatch = null;
        const error = Error('whole_reward_batch_rolled_back'); error.resolved = mode === 'resolved'; throw error;
      }
      sql.exec('COMMIT'); return results;
    } catch (error) {
      sql.exec('ROLLBACK');
      if (error.resolved) return statements.map(() => ({success:false,error:'whole_reward_batch_rolled_back',results:[],meta:{changes:0}}));
      throw error;
    }
  } };
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, 'Test player');
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,energy) VALUES (?,200,100)').run(owner);
  function pet(id, slot = 1, sourceSeason = season, phase = 'young') {
    sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,?,'free')").run(id, owner, sourceSeason, slot);
    sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at) VALUES (?,?,?,?,200,100,'0001-01-01 00:00:00')").run(id, owner, sourceSeason, slot);
    sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,?,'vinyl_crab','{}','[]')").run(id, owner, id, phase);
    sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,'legendary_moon_guardian',5,'test')").run(id, owner);
  }
  const petId = `pet-${owner}`; pet(petId);
  sql.prepare('INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner, petId, season);
  const active = id => sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=? WHERE telegram_id=?').run(id, owner);
  return { sql, db, owner, petId, pet, active };
}


const balance = f => f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
const award = (f,key,rewards,extra={}) => hooks.awardPetReward(f.db, {telegram_id:f.owner,pet_id:f.petId,season_key:season,
  source:'pet_event',idempotency_key:key,event_key:key,rewards,...extra});
const paid = (f,key) => JSON.parse(f.sql.prepare('SELECT applied_rewards FROM telegram_pet_reward_claims WHERE idempotency_key=?').get(key).applied_rewards);

test('capped wallets, API deltas and immutable receipts agree; nominal requests remain preserved', async () => {
  const f=fixture('currency-caps');
  await hooks.getPetProfile(f.db,f.owner);
  f.sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=999990,moon_crystals=999997,style_tokens=999999 WHERE telegram_id=?').run(f.owner);
  const result=await award(f,'cap',{moon_gold:80,moon_crystals:6,style_tokens:5});
  assert.equal(result.accepted,true);
  assert.deepEqual({...balance(f)},{moon_gold:999999,moon_crystals:999999,style_tokens:999999});
  assert.deepEqual([result.rewards.moon_gold,result.rewards.moon_crystals,result.rewards.style_tokens],[9,2,0]);
  assert.deepEqual(paid(f,'cap'),result.rewards);
  assert.equal(JSON.parse(f.sql.prepare("SELECT requested_rewards FROM telegram_pet_reward_claims WHERE idempotency_key='cap'").get().requested_rewards).moon_gold,80);
  const retry=await award(f,'cap',{moon_gold:80,moon_crystals:6,style_tokens:5});
  assert.equal(retry.duplicate,true); assert.equal(retry.rewards.moon_gold,0); assert.deepEqual(retry.receipt_rewards,result.rewards);
  assert.deepEqual(paid(f,'cap'),result.rewards);
});

test('concurrent awards split only remaining wallet capacity and retain separate exact receipts', async () => {
  const f=fixture('currency-concurrent'); await hooks.getPetProfile(f.db,f.owner);
  f.sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=999974 WHERE telegram_id=?').run(f.owner);
  const results=await Promise.all([award(f,'one',{moon_gold:20}),award(f,'two',{moon_gold:20})]);
  assert.deepEqual(results.map(r=>r.rewards.moon_gold).sort((a,b)=>a-b),[5,20]);
  assert.equal(balance(f).moon_gold,999999); assert.equal(paid(f,'one').moon_gold+paid(f,'two').moon_gold,25);
  const duplicates=await Promise.all([award(f,'one',{moon_gold:20}),award(f,'two',{moon_gold:20})]);
  assert.ok(duplicates.every(r=>r.duplicate && r.rewards.moon_gold===0));
});

test('currency receipt separates delivered reward from a simultaneous wallet cost', async () => {
  const f=fixture('currency-cost'); await hooks.getPetProfile(f.db,f.owner);
  f.sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=999994 WHERE telegram_id=?').run(f.owner);
  const result=await award(f,'cost',{moon_gold:20},{currency_costs:{moon_gold:10}});
  assert.equal(result.rewards.moon_gold,15); assert.equal(result.currency_costs.moon_gold,10);
  assert.equal(balance(f).moon_gold,999999); assert.equal(paid(f,'cost').moon_gold,15);
});

for(const mode of ['thrown','resolved']) test(`${mode} whole reward batch failure commits no receipt or currency and retries once`, async () => {
  const f=fixture('currency-failure-'+mode); await hooks.getPetProfile(f.db,f.owner);
  f.db.failRewardBatch=mode;
  await assert.rejects(award(f,'fail',{moon_gold:30}),/whole_reward_batch_rolled_back|pet_state_write_unavailable/);
  assert.equal(balance(f).moon_gold,0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE idempotency_key='fail'").get().n,0);
  const result=await award(f,'fail',{moon_gold:30}); assert.equal(result.rewards.moon_gold,30);
  const retry=await award(f,'fail',{moon_gold:30}); assert.equal(retry.rewards.moon_gold,0); assert.equal(balance(f).moon_gold,30);
});

test('season retries return zero new delivery with the unchanged original season receipt', async () => {
  const f=fixture('season-retry');
  const oldSeason='pet-s2025-004';
  f.sql.prepare('INSERT INTO telegram_pet_season_state(telegram_id,season_key,season_xp) VALUES(?,?,250)').run(f.owner,oldSeason);
  const first=await hooks.claimPetSeasonReward(f.db,f.owner,'street','season-request',{season_key:oldSeason});
  assert.equal(first.accepted,true); assert.equal(first.rewards.moon_gold,80);
  const before=balance(f);
  const retry=await hooks.claimPetSeasonReward(f.db,f.owner,'street','season-request',{season_key:oldSeason});
  assert.equal(retry.duplicate,true); assert.equal(retry.rewards.moon_gold,0); assert.equal(retry.rewards.style_tokens,0);
  assert.deepEqual(retry.receipt_rewards,first.rewards); assert.deepEqual(balance(f),before);
  const publicResult=hooks.serializePetMiniAppActionResult(retry);
  assert.deepEqual(publicResult.rewards,{}); assert.deepEqual(publicResult.receipt_rewards,first.rewards);
});

test('consumable retries grant zero XP and capped Style Patch delivery matches its receipt', async () => {
  const f=fixture('item-retry'); await hooks.getPetProfile(f.db,f.owner);
  f.sql.prepare('UPDATE telegram_pet_profiles SET style_tokens=999998 WHERE telegram_id=?').run(f.owner);
  f.sql.prepare("INSERT INTO telegram_pet_inventory(telegram_id,asset_type,asset_key,quantity) VALUES(?,'item','style_patch',2)").run(f.owner);
  const first=await hooks.processPetUseItem(f.db,f.owner,'style_patch',{event_key:'item-one'});
  assert.equal(first.accepted,true); assert.equal(first.rewards.style_tokens,1); assert.equal(first.pet_xp_awarded,5);
  assert.equal(paid(f,'item_use:item-one').style_tokens,1); assert.equal(balance(f).style_tokens,999999);
  const retry=await hooks.processPetUseItem(f.db,f.owner,'style_patch',{event_key:'item-one'});
  assert.equal(retry.duplicate,true); assert.equal(retry.pet_xp_awarded,0); assert.equal(retry.xp_awarded,0);
  assert.deepEqual(retry.rewards,{}); assert.deepEqual(retry.receipt_rewards,first.rewards);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE asset_key='style_patch'").get().quantity,1);
});

for (const type of ['sleep','train','work','explore']) test(`${type} activity pays stat effects after saved elapsed decay, including retry after rollback`, async () => {
  const f=fixture('decay-'+type); await hooks.getPetProfile(f.db,f.owner);
  const now=new Date(), past=new Date(now.getTime()-7200_000).toISOString();
  for(const table of ['telegram_pet_profiles','telegram_pet_instances']) f.sql.prepare(`UPDATE ${table} SET hunger=20,happiness=80,cleanliness=80,energy=80,health=80,last_decay_at=? WHERE telegram_id=?`).run(past,f.owner);
  f.sql.prepare(`INSERT INTO telegram_pet_activity_sessions(id,telegram_id,activity_type,started_at,ends_at,status,metadata) VALUES(?,?,?,?,?,'active',?)`)
    .run('activity-'+type,f.owner,type,past,now.toISOString(),JSON.stringify({pet_id:f.petId,season_key:season}));
  const before=await hooks.getPetProfile(f.db,f.owner);
  f.db.failRewardBatch='resolved';
  await assert.rejects(hooks.claimPetActivitySession(f.db,f.owner,{now}),/pet_state_write_unavailable/);
  const afterFailure=f.sql.prepare('SELECT hunger,happiness,cleanliness,energy FROM telegram_pet_instances WHERE pet_id=?').get(f.petId);
  for(const key of ['hunger','happiness','cleanliness','energy']) assert.equal(afterFailure[key],before[key]);
  const result=await hooks.claimPetActivitySession(f.db,f.owner,{now}); assert.equal(result.accepted,true);
  const expected=hooks.computePetActivityRewards(type,7200).rewards;
  const after=f.sql.prepare('SELECT hunger,happiness,cleanliness,energy FROM telegram_pet_instances WHERE pet_id=?').get(f.petId);
  for(const key of ['hunger','happiness','cleanliness','energy']) assert.equal(after[key],Math.min(100,Math.max(0,before[key]+expected[key])),`${type} ${key}`);
  const retry=await hooks.claimPetActivitySession(f.db,f.owner,{now});
  assert.ok(!retry.accepted || retry.duplicate);
  assert.deepEqual(f.sql.prepare('SELECT hunger,happiness,cleanliness,energy FROM telegram_pet_instances WHERE pet_id=?').get(f.petId),after);
});

test('duplicate feedback never falls back to historical, computed, applied or scalar XP gains', () => {
  const client=fs.readFileSync(new URL('../js/moonpet-mini-app.js',import.meta.url),'utf8');
  const snippet=client.slice(client.indexOf('// TEST-EXPORT: actionResultFeedback:start'),client.indexOf('// TEST-EXPORT: actionResultFeedback:end'));
  for(const fields of [{rewards:{moon_gold:80,pet_xp:5}},{applied:{rewardsApplied:{moon_gold:80}}},{computed:{rewards:{moon_gold:80}}},{receipt_rewards:{moon_gold:80},pet_xp_awarded:5}]) {
    const context=vm.createContext({number:String,words:value=>String(value).replaceAll('_',' '),result:{accepted:true,reason:'duplicate',duplicate:true,...fields}});
    vm.runInContext(snippet+'; globalThis.feedback=resultMessage(result,null,null);',context);
    assert.doesNotMatch(context.feedback,/\+\d/); assert.match(context.feedback,/DUPLICATE BLOCKED/);
  }
});

for(const mode of ['thrown','resolved']) test(`${mode} decay failure prevents stat award and a healthy retry applies decay once`, async () => {
  const f=fixture('decay-write-'+mode); await hooks.getPetProfile(f.db,f.owner);
  const past=new Date(Date.now()-7200_000).toISOString();
  for(const table of ['telegram_pet_profiles','telegram_pet_instances']) f.sql.prepare(`UPDATE ${table} SET hunger=20,happiness=80,cleanliness=80,energy=80,health=80,last_decay_at=? WHERE telegram_id=?`).run(past,f.owner);
  f.db.beforeRun=statement=>{
    if(statement.query.includes('UPDATE telegram_pet_instances') && statement.query.includes('last_decay_at = ?')) {
      if(mode==='thrown') throw Error('decay_write_failed');
      return {success:false,results:[],meta:{changes:1}};
    }
  };
  await assert.rejects(award(f,'decay',{pet_xp:10},{profile_deltas:{energy:5},touch_streak:true}),/decay_write_failed|pet_state_write_unavailable/);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE idempotency_key='decay'").get().n,0);
  assert.equal(f.sql.prepare('SELECT hunger FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).hunger,20);
  f.db.beforeRun=null;
  assert.equal((await award(f,'decay',{pet_xp:10},{profile_deltas:{energy:5},touch_streak:true})).accepted,true);
  const after=f.sql.prepare('SELECT hunger,energy FROM telegram_pet_instances WHERE pet_id=?').get(f.petId);
  assert.equal(after.hunger,29); assert.equal(after.energy,81);
});

test('activity recovery after selection changes keeps decay, stat effects and XP with its saved pet', async () => {
  const f=fixture('activity-source'); await hooks.getPetProfile(f.db,f.owner);
  const now=new Date(), past=new Date(now.getTime()-7200_000).toISOString();
  for(const table of ['telegram_pet_profiles','telegram_pet_instances']) f.sql.prepare(`UPDATE ${table} SET hunger=20,happiness=80,cleanliness=80,energy=80,health=80,last_decay_at=? WHERE telegram_id=?`).run(past,f.owner);
  f.sql.prepare(`INSERT INTO telegram_pet_activity_sessions(id,telegram_id,activity_type,started_at,ends_at,status,metadata) VALUES('source-session',?,'train',?,?, 'active',?)`)
    .run(f.owner,past,now.toISOString(),JSON.stringify({pet_id:f.petId,season_key:season}));
  f.db.failRewardBatch='thrown';
  await assert.rejects(hooks.claimPetActivitySession(f.db,f.owner,{now}),/whole_reward_batch_rolled_back/);
  f.pet('other-source-pet',2); f.active('other-source-pet');
  const other=f.sql.prepare('SELECT hunger,happiness,energy,pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('other-source-pet');
  const result=await hooks.claimPetActivitySession(f.db,f.owner,{now}); assert.equal(result.accepted,true);
  assert.deepEqual(f.sql.prepare('SELECT hunger,happiness,energy,pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('other-source-pet'),other);
  const earned=f.sql.prepare('SELECT pet_id,pet_xp_awarded FROM telegram_pet_events WHERE event_type=?').get('activity_claim');
  assert.equal(earned.pet_id,f.petId); assert.ok(earned.pet_xp_awarded>0);
  assert.equal(f.sql.prepare('SELECT hunger FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).hunger,54);
});

for(const kind of ['daily_cache','care','trade_win','trade_loss']) test(`${kind} manual wallet writer records and returns the actual movement`, async () => {
  const f=fixture('manual-'+kind); await hooks.getPetProfile(f.db,f.owner);
  f.sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=999998,moon_crystals=999999,style_tokens=999999 WHERE telegram_id=?').run(f.owner);
  const before=balance(f), oldRandom=Math.random;
  let result;
  try {
    Math.random=()=>kind==='trade_loss'?0.1:0.9;
    result=kind==='daily_cache' ? await hooks.processPetDailyChest(f.db,f.owner,{event_key:'manual'})
      : kind==='care' ? await hooks.processPetAction(f.db,f.owner,'play',{event_key:'manual'})
      : await hooks.processPetGoldTrade(f.db,f.owner,'50',{event_key:'manual'});
  } finally { Math.random=oldRandom; }
  assert.equal(result.accepted,true);
  const after=balance(f);
  const event=f.sql.prepare("SELECT metadata FROM telegram_pet_events WHERE event_key='manual'").get();
  const metadata=JSON.parse(event.metadata);
  for(const key of ['moon_gold','moon_crystals','style_tokens']) {
    assert.equal(result.rewards[key],after[key]-before[key],`${kind} API ${key}`);
    assert.equal(metadata.applied_rewards[key],after[key]-before[key],`${kind} receipt ${key}`);
    assert.equal(metadata.rewards[key],after[key]-before[key],`${kind} source ${key}`);
  }
  if(kind.startsWith('trade')) { assert.equal(result.gold_delta,after.moon_gold-before.moon_gold); assert.equal(metadata.gold_delta,result.gold_delta); }
});

test('simultaneous retries advertise exactly one newly delivered award and retain the same receipt', async () => {
  const f=fixture('same-reward-concurrent'); await hooks.getPetProfile(f.db,f.owner);
  const results=await Promise.all([award(f,'same',{pet_xp:10,moon_gold:30}),award(f,'same',{pet_xp:10,moon_gold:30})]);
  assert.deepEqual(results.map(r=>r.rewards.moon_gold).sort((a,b)=>a-b),[0,30]);
  assert.deepEqual(results.map(r=>r.pet_xp_awarded).sort((a,b)=>a-b),[0,10]);
  assert.deepEqual(results.find(r=>r.duplicate).receipt_rewards,results.find(r=>!r.duplicate).rewards);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE idempotency_key='same'").get().n,1);
  assert.equal(balance(f).moon_gold,30);
});

test('a pending legacy claim is pending rather than falsely acknowledged as paid', async () => {
  const f=fixture('pending-reward'); await hooks.getPetProfile(f.db,f.owner);
  f.sql.prepare(`INSERT INTO telegram_pet_reward_claims(claim_id,pet_id,telegram_id,source,idempotency_key,day_key,status,requested_rewards)
    VALUES('unpaid',?,?,'pet_event','unpaid',?,'pending','{"moon_gold":30}')`).run(f.petId,f.owner,new Date().toISOString().slice(0,10));
  const result=await award(f,'unpaid',{moon_gold:30});
  assert.equal(result.accepted,false); assert.equal(result.duplicate,false); assert.equal(result.reason,'reward_pending');
  assert.equal(result.rewards.moon_gold,0); assert.equal(balance(f).moon_gold,0);
});

test('combat replay feedback distinguishes newly delivered viewer rewards from opponent and historical payouts', () => {
  const newlyPaid={accepted:true,duplicate:false,rewards:{moon_gold:20,pet_xp:34,community_xp:7}};
  const oldPaid={accepted:true,duplicate:true,rewards:{moon_gold:0,pet_xp:0,community_xp:0},receipt_rewards:{moon_gold:3,pet_xp:10,community_xp:0}};
  const arena={accepted:true,duplicate:true,reason:'already_completed',battle:{player1_telegram_id:'viewer',player2_telegram_id:'opponent'},rewards:{player1:newlyPaid,player2:oldPaid}};
  const first=hooks.serializePetMiniAppActionResult(arena,null,'viewer');
  assert.equal(first.duplicate,false); assert.equal(first.rewards.moon_gold,20); assert.equal(first.pet_xp_awarded,34);
  const other=hooks.serializePetMiniAppActionResult(arena,null,'opponent');
  assert.equal(other.duplicate,true); assert.deepEqual(other.rewards,{}); assert.equal(other.pet_xp_awarded,0); assert.deepEqual(other.receipt_rewards,oldPaid.receipt_rewards);
  const kaiju={accepted:true,duplicate:true,reason:'already_completed',reward_results:[{telegram_id:'viewer',result:newlyPaid},{telegram_id:'opponent',result:oldPaid}]};
  const kaijuViewer=hooks.serializePetMiniAppActionResult(kaiju,null,'viewer');
  assert.equal(kaijuViewer.duplicate,false); assert.equal(kaijuViewer.rewards.moon_gold,20); assert.equal(kaijuViewer.pet_xp_awarded,34);
  const kaijuOpponent=hooks.serializePetMiniAppActionResult(kaiju,null,'opponent');
  assert.equal(kaijuOpponent.duplicate,true); assert.deepEqual(kaijuOpponent.rewards,{}); assert.equal(kaijuOpponent.pet_xp_awarded,0);
});

for(const mode of ['thrown','resolved']) test(`Seasonal Raid ending replay announces its first payout after ${mode} whole rollback`, async () => {
  const f=fixture('raid-delivery-'+mode); await hooks.getPetProfile(f.db,f.owner);
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=500000 WHERE pet_id=?').run(f.petId);
  const now=new Date(), boss=getActiveSeasonalBoss(now);
  f.sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress(pet_id,telegram_id,pet_season_key,season_key,boss_key,damage)
    VALUES(?,?,?,?,?,?)`).run(f.petId,f.owner,season,boss.season_instance,boss.key,boss.hp-1);
  const awardReward=request=>hooks.awardPetReward(f.db,request);
  const original=await hooks.getPetProfile(f.db,f.owner);
  f.db.failRewardBatch=mode;
  const victory=await processPetSeasonalBoss(f.db,f.owner,original,awardReward,'strike',now);
  assert.equal(victory.accepted,true); assert.equal(victory.reward_pending,true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_seasonal_boss'").get().n,0);
  assert.ok(f.sql.prepare('SELECT defeated_at FROM telegram_pet_seasonal_boss_progress').get().defeated_at);
  const energy=f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).energy;
  const recovered=await processPetSeasonalBoss(f.db,f.owner,await hooks.getPetProfile(f.db,f.owner),awardReward,'strike',now);
  assert.equal(recovered.accepted,true); assert.equal(recovered.duplicate,false); assert.equal(recovered.attempt_replayed,true);
  const result=hooks.serializePetMiniAppActionResult(recovered,null,f.owner);
  assert.equal(result.rewards.moon_gold,250); assert.equal(result.pet_xp_awarded,150);
  const source=fs.readFileSync(new URL('../js/moonpet-mini-app.js',import.meta.url),'utf8');
  const snippet=source.slice(source.indexOf('// TEST-EXPORT: actionResultFeedback:start'),source.indexOf('// TEST-EXPORT: actionResultFeedback:end'));
  const context=vm.createContext({number:String,words:value=>String(value).replaceAll('_',' '),result});
  vm.runInContext(snippet+'; globalThis.feedback=resultMessage(result,null,null);',context);
  assert.match(context.feedback,/\+250 moon gold/); assert.match(context.feedback,/\+150 PET XP/); assert.doesNotMatch(context.feedback,/DUPLICATE BLOCKED/);
  await processPetSeasonalBoss(f.db,f.owner,await hooks.getPetProfile(f.db,f.owner),awardReward,'strike',now);
  assert.equal(balance(f).moon_gold,250); assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).energy,energy);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_seasonal_boss'").get().n,1);
});

test('nested boss/completion and extraction receipts expose first delivery without replaying old assets', () => {
  const old={accepted:true,duplicate:true,rewards:{pet_xp:0,moon_gold:0},receipt_rewards:{pet_xp:100,moon_gold:30}};
  const fresh={accepted:true,duplicate:false,pet_xp_awarded:50,rewards:{pet_xp:50,moon_gold:20,materials:{scrap_metal:2}}};
  const mixed=hooks.serializePetMiniAppActionResult({accepted:true,duplicate:true,boss_reward:fresh,completion:{reward:old}});
  assert.equal(mixed.duplicate,false); assert.equal(mixed.pet_xp_awarded,50); assert.equal(mixed.rewards.moon_gold,20);
  assert.equal(mixed.receipt_rewards.moon_gold,50); assert.equal(mixed.receipt_rewards.pet_xp,150);
  const extraction=hooks.serializePetMiniAppActionResult({accepted:true,duplicate:true,extraction:{reward:fresh}});
  assert.equal(extraction.duplicate,false); assert.equal(extraction.rewards.moon_gold,20);
  const retry=hooks.serializePetMiniAppActionResult({accepted:true,duplicate:false,reward:old});
  assert.equal(retry.duplicate,true); assert.equal(retry.pet_xp_awarded,0); assert.deepEqual(retry.rewards,{});
});

for(const mode of ['thrown','resolved']) test(`Weekly Boss attack replay announces its first payout after ${mode} whole rollback`, async () => {
  const f=fixture('weekly-delivery-'+mode); await hooks.getPetProfile(f.db,f.owner);
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=3240 WHERE pet_id=?').run(f.petId);
  const ready=(await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token')).guidance.weekly_boss;
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_progress(telegram_id,week_key,boss_id,damage,attempts) VALUES(?,?,?,?,1)`)
    .run(f.owner,ready.week_key,ready.boss_id,ready.hp-1);
  f.db.failRewardBatch=mode;
  const victory=await hooks.processPetWeeklyBoss(f.db,f.owner,'strike','winning-hit',f.petId);
  assert.equal(victory.accepted,true); assert.equal(victory.reward_pending,true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_weekly_boss'").get().n,0);
  const source=f.sql.prepare('SELECT pet_id,season_key,victory_event_key FROM telegram_pet_weekly_boss_victories_by_pet').get();
  const energy=f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).energy;
  const before=balance(f);
  const recovered=await hooks.processPetWeeklyBoss(f.db,f.owner,'strike','winning-hit',f.petId);
  assert.equal(recovered.accepted,true); assert.equal(recovered.duplicate,false); assert.equal(recovered.attempt_replayed,true);
  const result=hooks.serializePetMiniAppActionResult(recovered,null,f.owner);
  assert.equal(result.rewards.moon_gold,ready.reward.moon_gold); assert.equal(result.pet_xp_awarded,Number(ready.reward.pet_xp || 0));
  assert.equal(balance(f).moon_gold-before.moon_gold,result.rewards.moon_gold);
  const client=fs.readFileSync(new URL('../js/moonpet-mini-app.js',import.meta.url),'utf8');
  const snippet=client.slice(client.indexOf('// TEST-EXPORT: actionResultFeedback:start'),client.indexOf('// TEST-EXPORT: actionResultFeedback:end'));
  const context=vm.createContext({number:String,words:value=>String(value).replaceAll('_',' '),result});
  vm.runInContext(snippet+'; globalThis.feedback=resultMessage(result,null,null);',context);
  assert.ok(context.feedback.includes('+'+ready.reward.moon_gold+' moon gold')); assert.doesNotMatch(context.feedback,/DUPLICATE BLOCKED/);
  const retry=hooks.serializePetMiniAppActionResult(await hooks.processPetWeeklyBoss(f.db,f.owner,'strike','winning-hit',f.petId),null,f.owner);
  assert.equal(retry.duplicate,true); assert.deepEqual(retry.rewards,{}); assert.equal(retry.pet_xp_awarded,0);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).energy,energy);
  assert.deepEqual(f.sql.prepare('SELECT pet_id,season_key,victory_event_key FROM telegram_pet_weekly_boss_victories_by_pet').get(),source);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_boss_events').get().n,1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_weekly_boss'").get().n,1);
});

test('capped material/item and already-owned relic receipts report only delivered assets', async () => {
  const f=fixture('asset-receipts'); await hooks.getPetProfile(f.db,f.owner);
  f.sql.prepare("INSERT INTO telegram_pet_material_balances(telegram_id,material_key,quantity) VALUES(?,'scrap_metal',9998)").run(f.owner);
  f.sql.prepare("INSERT INTO telegram_pet_inventory(telegram_id,asset_type,asset_key,quantity) VALUES(?,'item','moon_snack',999998)").run(f.owner);
  const relic={bitcoin_heart:{rarity:'legendary',effects:{}}};
  const first=await award(f,'assets',{materials:{scrap_metal:5},items:{moon_snack:5},relics:relic});
  assert.deepEqual(first.rewards.materials,{scrap_metal:1}); assert.deepEqual(first.rewards.items,{moon_snack:1}); assert.deepEqual(first.rewards.relics,{bitcoin_heart:1});
  const second=await award(f,'assets-next',{materials:{scrap_metal:5},items:{moon_snack:5},relics:relic});
  assert.deepEqual(second.rewards.materials,{}); assert.deepEqual(second.rewards.items,{}); assert.deepEqual(second.rewards.relics,{});
  assert.deepEqual(paid(f,'assets'),first.rewards); assert.deepEqual(paid(f,'assets-next'),second.rewards);
});
