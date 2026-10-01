import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { createDisplayedPetScope } from '../workers/moonboys-api/pets/displayed-pet-scope.js';

const now = new Date();
const currentSeason = hooks.getPetSeasonInfo(now).key;
const oldSeason = hooks.getPetSeasonInfo(new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 15))).key;
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
  for (const migration of ['058_telegram_pet_season_completion.sql','061_moonpet_season_economy_calibration.sql']) sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/'+migration, import.meta.url),'utf8'));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { if (db.beforeRead) await db.beforeRead(this); return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      if (sql.prepare(this.query).columns().length && !/\bRETURNING\b/i.test(this.query)) return { results: sql.prepare(this.query).all(...this.args), meta: { changes: 0 } };
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) await db.beforeRun(this); return this.exec(); }
  }
  const db = { beforeBatch: null, beforeRun: null, failReward: false, rejectReward: false, prepare(query) { return new Statement(query); }, async batch(statements) {
    if (this.failReward && statements.some(s => /INSERT OR IGNORE INTO telegram_pet_reward_claims/.test(s.query))) {
      this.failReward = false;
      throw Error('interrupted_terminal_reward');
    }
    if (this.rejectReward && statements.some(s => /INSERT OR IGNORE INTO telegram_pet_reward_claims/.test(s.query))) {
      this.rejectReward = false;
      return statements.map(() => ({ results: [], meta: { changes: 0 } }));
    }
    for (const statement of statements) if (this.beforeRead) await this.beforeRead(statement);
    if (this.beforeBatch) await this.beforeBatch(statements);
    sql.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(s.exec()); sql.exec('COMMIT'); if (this.afterBatch) await this.afterBatch(statements); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, 'Test player');
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,energy) VALUES (?,200,100)').run(owner);
  sql.prepare("INSERT INTO telegram_seasons (name,start_date,end_date) VALUES ('Community','2000-01-01','2999-01-01')").run();
  function pet(id, season = currentSeason, xp = 200, slot = 1) {
    sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,?,'free')").run(id, owner, season, slot);
    sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at) VALUES (?,?,?,?,?,100,'0001-01-01 00:00:00')").run(id, owner, season, slot, xp);
    sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,'young','vinyl_crab','{}','[]')").run(id, owner, id);
  }
  pet('current-' + owner);
  sql.prepare('INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner, 'current-' + owner, currentSeason);
  sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=1000,moon_crystals=100,style_tokens=100 WHERE telegram_id=?').run(owner);
  const active = (id, season = currentSeason) => {
    sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=?,season_key=? WHERE telegram_id=?').run(id, season, owner);
    const p = sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(id);
    sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=?,equipped_food=?,level=? WHERE telegram_id=?').run(p.pet_xp, p.equipped_food, p.level, owner);
  };
  const act = body => dispatchRenderedPetAction(db,owner,{id:owner},body,'fixture-token');
  const reveal = id => sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,'elite_moonpet',3,'reveal')").run(id,owner);
  const state = () => hooks.buildPetMiniAppState(db, owner, 'fixture-token');
  const get = async path => { const response = await worker.fetch(new Request('https://moonboys-api.test' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, pet, active, act, reveal, state, get };
}

test('shop and trade receipts identify the earning pet after switching, with consistent boards', async () => {
  const f = fixture('82001'), petId = 'current-' + f.owner;
  f.reveal(petId);
  const buy = await hooks.processPetShopPurchase(f.db, f.owner, 'moon_kibble', { event_key: 'buy-sync' });
  const trade = await hooks.processPetGoldTrade(f.db, f.owner, 10, { event_key: 'trade-sync' });
  assert.equal(buy.accepted, true); assert.equal(trade.accepted, true);
  for (const type of ['buy','trade']) {
    const e = f.sql.prepare('SELECT pet_id,season_key FROM telegram_pet_events WHERE event_type=?').get(type);
    assert.equal(e.pet_id, petId, type + ' must carry its source pet');
    assert.equal(e.season_key, currentSeason);
  }
  f.pet('second', currentSeason, 300, 2);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db, f.owner, 'second')).accepted, true);
  const activity = await f.get('/telegram-pets/activity');
  for (const type of ['buy','trade']) assert.equal(activity.items.find(e=>e.event_type===type).display_name, 'BOTTY');
  for (const period of ['daily','weekly','seasonal']) assert.equal((await f.get('/telegram-pets/leaderboard?period='+period)).entries[0].pet_xp,trade.pet_xp_awarded);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,500+trade.pet_xp_awarded);
  assert.equal((await f.state()).guidance.missions.find(m=>m.key.startsWith('pet-daily-trade:')).completed,true);
  assert.equal((await hooks.processPetGoldTrade(f.db,f.owner,10,{event_key:'trade-sync'})).duplicate,true);
  assert.equal((await hooks.processPetShopPurchase(f.db,f.owner,'moon_kibble',{event_key:'buy-sync'})).duplicate,true);
  assert.deepEqual((await f.get('/telegram/leaderboard')).entries,[],'zero Community XP actions leave the Community season empty, without all-time fallback');
});

test('cross-session stale care, callsign and item controls reject without mutation', async () => {
  const f=fixture('82011'), displayed='current-'+f.owner;
  f.pet('other-session-pet',currentSeason,300,2);
  f.sql.prepare("INSERT INTO telegram_pet_inventory (telegram_id,asset_type,asset_key,quantity) VALUES (?,'item','moon_snack',1)").run(f.owner);
  f.active('other-session-pet');
  const before=f.sql.prepare('SELECT pet_xp,pet_name FROM telegram_pet_instances WHERE pet_id=?').get('other-session-pet');
  for (const body of [
    {action:'feed'},
    {action:'rename',pet_name:'WRONG PET'},
    {action:'use_item',item_key:'moon_snack'},
  ]) {
    const result=await f.act({...body,displayed_pet_id:displayed,request_id:'stale-'+body.action});
    assert.equal(result.accepted,false); assert.equal(result.reason,'displayed_pet_changed');
  }
  assert.deepEqual(f.sql.prepare('SELECT pet_xp,pet_name FROM telegram_pet_instances WHERE pet_id=?').get('other-session-pet'),before);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_key='moon_snack'").get(f.owner).quantity,1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_events').get().n,0);
});

test('missing and empty displayed identity cannot bypass care, rename or item validation', async () => {
  const f=fixture('82012');
  f.sql.prepare("INSERT INTO telegram_pet_inventory (telegram_id,asset_type,asset_key,quantity) VALUES (?,'item','moon_snack',1)").run(f.owner);
  const before=f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE telegram_id=?').all(f.owner);
  for (const displayed of [{}, {displayed_pet_id:null}, {displayed_pet_id:''}, {displayed_pet_id:'   '}]) {
    for (const body of [{action:'feed'}, {action:'rename',pet_name:'WRONG'}, {action:'use_item',item_key:'moon_snack'}]) {
      const result=await hooks.processPetMiniAppAction(f.db,f.owner,{id:f.owner},{...body,...displayed,request_id:crypto.randomUUID()},'fixture-token');
      assert.equal(result.accepted,false);
      assert.equal(result.reason,'displayed_pet_required');
      assert.equal(result.refresh_state,true);
    }
  }
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE telegram_id=?').all(f.owner),before);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_key='moon_snack'").get(f.owner).quantity,1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_events').get().n,0);
  assert.equal((await f.act({action:'season_slots',displayed_pet_id:null})).accepted,true,'read-only roster remains available without displayed identity');
});

test('valid random-event challenge cannot redirect to a pet switched during its later profile read', async () => {
  const f = fixture('82013'), displayed = 'current-' + f.owner;
  f.reveal(displayed);
  f.pet('event-race-other', currentSeason, 300, 2);
  const encounter = (await f.state()).encounter;
  assert.ok(encounter?.challenge_token, 'exercise a valid server-issued event challenge');
  const before = f.sql.prepare("SELECT * FROM telegram_pet_instances WHERE pet_id='event-race-other'").get();
  let switched = false;
  f.db.beforeRead = async statement => {
    if (!/SELECT.*FROM telegram_pet_profiles/s.test(statement.query)) return;
    f.db.beforeRead = null;
    f.active('event-race-other');
    switched = true;
  };
  const result = await f.act({ action: 'random_event', displayed_pet_id: displayed,
    challenge_token: encounter.challenge_token, choice: encounter.choices[0].key });
  assert.equal(switched, true);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'displayed_pet_changed');
  assert.equal(result.refresh_state, true);
  assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_instances WHERE pet_id='event-race-other'").get(), before);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='random_event'").get().n, 0);
});

test('a switch immediately before the random-event reservation rejects without a cost or reward', async () => {
  const f = fixture('82014'), displayed = 'current-' + f.owner;
  f.reveal(displayed);
  f.pet('reservation-race-other', currentSeason, 300, 2);
  const encounter = (await f.state()).encounter;
  let switched = false;
  f.db.beforeBatch = async statements => {
    if (!statements.some(s => /INSERT.*telegram_pet_events/s.test(s.query) && s.args.includes('random_event'))) return;
    f.db.beforeBatch = null;
    f.active('reservation-race-other');
    switched = true;
  };
  const before = f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
  const result = await f.act({ action: 'random_event', displayed_pet_id: displayed,
    challenge_token: encounter.challenge_token, choice: encounter.choices[0].key });
  assert.equal(switched, true);
  assert.equal(result.accepted, false);
  assert.equal(result.refresh_state, true);
  assert.deepEqual(f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner), before);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='random_event'").get().n, 0);
});

test('every displayed-pet handler rejects a switch immediately after initial validation', async () => {
  const actions = ['incubate','hatch','rare_morph','feed','play','clean','sleep','train',
    'energy_drink','dance','cuddles','rename','buy','equip','use_item','trade','work',
    'daily_chest','random_event','adventure','run_start','daily_run_start','style_equip',
    'contract_start','activity_start','bounty_claim','expedition','market_buy',
    'district_mission','event_chain','seasonal_boss','gear_upgrade','craft','cosmetic_unlock',
    'weekly_boss','season_claim','evolve','arena_start','arena_matchmake','arena_ready',
    'arena_move','kaiju_start','kaiju_matchmake','kaiju_card','finale_start'];
  for (const action of actions) {
    const f = fixture('race-' + action), displayed = 'current-' + f.owner;
    f.pet('other', currentSeason, 300, 2);
    const before = f.sql.prepare("SELECT * FROM telegram_pet_instances WHERE pet_id='other'").get();
    let switched = false;
    f.db.afterBatch = statements => {
      if (!statements.some(s => /SELECT s.pet_id, s.telegram_id/.test(s.query))) return;
      f.db.afterBatch = null;
      f.active('other');
      switched = true;
    };
    const result = await f.act({ action, displayed_pet_id: displayed, care_type: 'warm' });
    assert.equal(switched, true, action);
    assert.equal(result.accepted, false, action);
    assert.equal(result.reason, 'displayed_pet_changed', action);
    assert.equal(result.refresh_state, true, action);
    assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_instances WHERE pet_id='other'").get(), before, action);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_events').get().n, 0, action);
  }
});

test('the transaction assertion rolls back all writes and keeps a stale scope closed after switching back', async () => {
  const f = fixture('scope-rollback'), displayed = 'current-' + f.owner;
  f.pet('other', currentSeason, 300, 2);
  const scope = createDisplayedPetScope(f.db, f.owner, displayed);
  assert.equal(await scope.db.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').bind(f.owner).first('pet_id'), displayed);
  f.active('other');
  await assert.rejects(scope.db.batch([
    scope.db.prepare('UPDATE telegram_pet_instances SET energy=0 WHERE telegram_id=?').bind(f.owner),
    scope.db.prepare('UPDATE telegram_pet_profiles SET moon_gold=0 WHERE telegram_id=?').bind(f.owner),
  ]), /moonpet_displayed_pet_changed/);
  assert.equal(scope.changed, true);
  assert.deepEqual(f.sql.prepare('SELECT energy FROM telegram_pet_instances ORDER BY pet_id').all().map(p => p.energy), [100,100]);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, 1000);
  f.active(displayed);
  await assert.rejects(scope.db.prepare('UPDATE telegram_pet_profiles SET moon_gold=0').run(), /moonpet_displayed_pet_changed/);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, 1000);
});

test('ordinary database failures propagate without becoming a stale-pet response', async () => {
  const f = fixture('scope-outage'), scope = createDisplayedPetScope(f.db, f.owner, 'current-' + f.owner);
  f.db.beforeBatch = () => { f.db.beforeBatch = null; throw Error('database_unavailable'); };
  await assert.rejects(scope.db.prepare('SELECT pet_id FROM telegram_pet_active_slots').first(), /database_unavailable/);
  assert.equal(scope.changed, false);
  assert.equal((await scope.db.prepare('SELECT pet_id FROM telegram_pet_active_slots').all()).results.length, 1);
});

test('overlapping purchases charge once for the same equipped item', async () => {
  const f=fixture('82002');
  const results=await Promise.all([1,2].map(i=>hooks.processPetShopPurchase(f.db,f.owner,'moon_kibble',{event_key:'buy-'+i})));
  assert.equal(results.filter(r=>r.accepted).length,1);
  assert.equal(results.find(r=>!r.accepted).reason,'already_equipped');
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,955);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='buy'").get().n,1);
});

test('a pet switch during checkout cannot equip or debit either pet', async () => {
  const f=fixture('82003'); f.pet('checkout-second',currentSeason,300,2);
  f.db.beforeBatch=async statements=>{
    if (!statements[0].query.includes('shop_purchase_pending')) return;
    f.db.beforeBatch=null;
    assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'checkout-second')).accepted,true);
  };
  const result=await hooks.processPetShopPurchase(f.db,f.owner,'moon_kibble',{event_key:'switch-checkout'});
  assert.equal(result.accepted,false); assert.equal(result.reason,'shop_state_changed');
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,1000);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_instances WHERE equipped_food='moon_kibble'").get().n,0);
});

test('timed claim and Growth Mark stay on the session pet across settlement and switching', async () => {
  const f=fixture('82004'), petId='current-'+f.owner;
  f.pet('activity-second',currentSeason,300,2); f.reveal(petId);
  assert.equal((await f.act({action:'activity_start',activity_type:'train'})).accepted,true);
  f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-30 minutes')").run();
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'activity-second')).reason,'pet_activity_active');
  let switched=false;
  f.db.beforeRun=async s=>{
    if (!s.query.includes('UPDATE telegram_pet_activity_sessions') || !s.query.includes('SET metadata = ?')) return;
    f.db.beforeRun=null;
    // Another request may switch immediately after the settled marker commits.
    s.exec();
    switched=(await hooks.switchActivePetSeasonSlot(f.db,f.owner,'activity-second')).accepted;
  };
  const result=await f.act({action:'activity_claim'});
  assert.equal(result.accepted,true,JSON.stringify(result)); assert.equal(switched,true);
  assert.equal(result.pet.pet_id,petId);
  const event=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='activity_claim'").get();
  assert.equal(event.pet_id,petId); assert.equal(event.season_key,currentSeason);
  assert.equal(f.sql.prepare('SELECT pet_id FROM telegram_pet_growth_marks').get().pet_id,petId);
  assert.equal((await f.get('/telegram-pets/activity')).items.find(e=>e.event_type==='activity_claim').display_name,'BOTTY');
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='activity-second'").get().pet_xp,300);
  assert.equal((await f.get('/telegram/leaderboard')).entries[0].xp,result.xp_awarded);
});

test('timed activity at its Pet XP cap still settles once without creating another XP allowance', async () => {
  const f=fixture('82005'), petId='current-'+f.owner;
  assert.equal((await f.act({action:'activity_start',activity_type:'train'})).accepted,true);
  f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-30 minutes')").run();
  f.sql.prepare("INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status) VALUES ('cap',?,?,'feed','cap',1200,?,?,?,'accepted')").run(petId,f.owner,currentSeason,now.toISOString().slice(0,10),'fixture');
  const result=await f.act({action:'activity_claim'});
  assert.equal(result.accepted,true,JSON.stringify(result)); assert.equal(result.pet_xp_awarded,0);
  assert.equal((await f.act({action:'activity_claim'})).accepted,false);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='activity_claim'").get().n,1);
});

test('bounty, market and season claims log the claiming pet without adding XP', async () => {
  const f=fixture('82006'), petId='current-'+f.owner; f.reveal(petId);
  // The daily rotation can contain only high-level offers on some dates.
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=50000 WHERE pet_id=?').run(petId);
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=50000 WHERE telegram_id=?').run(f.owner);
  const economy=await hooks.getPetEconomyState(f.db,f.owner);
  const bounty=economy.bounties[0];
  for(let i=0;i<bounty.required;i++) f.sql.prepare("INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status) VALUES (?,?,?,?,?,?,?,?,'accepted')").run('b'+i,petId,f.owner,bounty.event_types[0],'b'+i,currentSeason,economy.day_key,'fixture');
  assert.equal((await hooks.claimPetEconomyBounty(f.db,f.owner,bounty.key)).accepted,true);
  const offer=economy.market_offers.find(o=>o.available);
  assert.ok(offer);
  assert.equal((await hooks.buyPetMarketOffer(f.db,f.owner,offer.key)).accepted,true);
  f.sql.prepare('INSERT INTO telegram_pet_season_state (telegram_id,season_key,season_xp) VALUES (?,?,100000) ON CONFLICT(telegram_id,season_key) DO UPDATE SET season_xp=100000').run(f.owner,currentSeason);
  const tier=hooks.PET_SEASON_REWARD_TIERS[0];
  assert.equal((await hooks.claimPetSeasonReward(f.db,f.owner,tier.tier_id)).accepted,true);
  for(const type of ['economy_bounty','economy_market','season_reward']) {
    const e=f.sql.prepare('SELECT * FROM telegram_pet_events WHERE event_type=?').get(type);
    assert.equal(e.pet_id,petId,type); assert.equal(e.season_key,currentSeason); assert.equal(e.pet_xp_awarded,0);
    assert.equal((await f.get('/telegram-pets/activity')).items.find(e=>e.event_type===type).display_name,'BOTTY');
  }
});

test('a failed Growth Mark write keeps the paid activity recoverable without paying twice', async () => {
  const f=fixture('82007');
  await f.act({action:'activity_start',activity_type:'explore'});
  f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-2 hours')").run();
  f.db.beforeRun=async s=>{
    if (!s.query.includes('INSERT OR IGNORE INTO telegram_pet_growth_marks')) return;
    f.db.beforeRun=null; throw Error('interrupted_growth_mark');
  };
  const pending=await f.act({action:'activity_claim'});
  assert.equal(pending.reason,'activity_reward_recovery_pending');
  assert.equal(JSON.parse(f.sql.prepare('SELECT metadata FROM telegram_pet_activity_sessions').get().metadata).claim_state,'claiming');
  const paidXp=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp;
  const retry=await f.act({action:'activity_claim'});
  assert.equal(retry.accepted,true); assert.equal(retry.duplicate,true);
  assert.equal(retry.pet.pet_id,'current-'+f.owner);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp,paidXp);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE asset_key='adventure_map'").get().quantity,1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_growth_marks').get().n,1);
});

test('an old-season activity settles its saved source while another pet is current', async () => {
  const f=fixture('82008'); f.pet('old-activity',oldSeason,100); f.reveal('old-activity');
  await f.act({action:'activity_start',activity_type:'train'});
  f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-30 minutes'),metadata=json_set(metadata,'$.pet_id','old-activity','$.season_key',?)").run(oldSeason);
  const result=await f.act({action:'activity_claim'});
  assert.equal(result.accepted,true); assert.equal(result.pet.pet_id,'old-activity');
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?").get('current-'+f.owner).pet_xp,200);
  assert.equal(f.sql.prepare('SELECT season_key FROM telegram_pet_events').get().season_key,oldSeason);
  assert.equal(f.sql.prepare('SELECT pet_id,season_key FROM telegram_pet_growth_marks').get().pet_id,'old-activity');
  assert.equal((await f.get('/telegram-pets/leaderboard?period=seasonal')).entries[0].pet_xp,result.pet_xp_awarded);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=daily')).entries[0].pet_xp,result.pet_xp_awarded);
});

test('pre-upgrade paid receipts remain replayable without inventing historical attribution', async () => {
  const f=fixture('82009');
  await f.act({action:'activity_start',activity_type:'train'});
  f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-30 minutes'),metadata='{}'").run();
  f.db.beforeRun=async s=>{
    if (!s.query.includes('UPDATE telegram_pet_activity_sessions') || !s.query.includes('SET metadata = ?')) return;
    f.db.beforeRun=null; throw Error('interrupted_settlement');
  };
  await assert.rejects(f.act({action:'activity_claim'}),/interrupted_settlement/);
  // Match a receipt paid by the previous Worker: account receipt, no pet ID.
  f.sql.prepare('UPDATE telegram_pet_events SET pet_id=NULL').run();
  f.sql.prepare('UPDATE telegram_pet_reward_claims SET pet_id=NULL').run();
  f.sql.prepare("UPDATE telegram_pet_activity_sessions SET metadata=json_remove(metadata,'$.pet_id','$.season_key')").run();
  const before=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp;
  const result=await f.act({action:'activity_claim'});
  assert.equal(result.accepted,true); assert.equal(result.duplicate,true);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp,before);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_events').get().n,1);
  assert.equal(f.sql.prepare('SELECT pet_id FROM telegram_pet_events').get().pet_id,null);
  assert.equal(result.pet.pet_id,'current-'+f.owner);
});

test('Kaiju recovery keeps its reservation pet, original accounting and single energy debit', async () => {
  const f=fixture('82010'), petId='current-'+f.owner;
  f.pet('kaiju-second',currentSeason,300,2); f.reveal(petId);
  await f.state();
  const match={match_id:'kaiju-sync',mode:'solo',score_json:JSON.stringify({reward_sources:{[f.owner]:{pet_id:petId,season_key:currentSeason,equipment_snapshot:{}}}})};
  const rewards={pet_xp:38,community_xp:8,moon_gold:18,happiness:5,energy_cost:6};
  f.db.failReward=true;
  await assert.rejects(hooks.awardPetKaijuPlayerResult(f.db,f.owner,match,'kaiju_win',rewards),/interrupted_terminal_reward/);
  const held=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='kaiju_battle'").get();
  assert.equal(held.pet_id,petId); assert.equal(held.status,'pending');
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(petId).energy,94);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'kaiju-second')).accepted,true);
  const result=await hooks.awardPetKaijuPlayerResult(f.db,f.owner,match,'kaiju_win',rewards);
  assert.equal(result.accepted,true); assert.equal(result.pet.pet_id,petId);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(petId).pet_xp,238);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='kaiju-second'").get().pet_xp,300);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(petId).energy,94);
  const settled=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='kaiju_battle'").get();
  assert.equal(settled.day_key,held.day_key); assert.equal(settled.season_key,held.season_key);
  assert.equal((await f.get('/telegram-pets/activity')).items.find(e=>e.event_type==='kaiju_battle').display_name,'BOTTY');
  assert.equal((await f.get('/telegram/leaderboard')).entries[0].xp,8);
  assert.equal((await hooks.awardPetKaijuPlayerResult(f.db,f.owner,match,'kaiju_win',rewards)).duplicate,true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='kaiju_battle'").get().n,1);
});
