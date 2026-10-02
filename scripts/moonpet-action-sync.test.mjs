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

test('action serialization uses the real projected identity and verified route owner', async () => {
  const f = fixture('82000'), petId = 'current-' + f.owner;
  f.reveal(petId);
  // Normal hatch settlement stores the species in both saved pet rows.
  f.sql.prepare("UPDATE telegram_pet_instances SET species='vinyl_crab' WHERE pet_id=?").run(petId);
  f.sql.prepare("UPDATE telegram_pet_profiles SET species='vinyl_crab' WHERE telegram_id=?").run(f.owner);
  const result = await f.act({ action: 'feed', displayed_pet_id: petId, request_id: 'real-identity-result' });
  assert.equal(result.accepted, true);
  const snapshot = await f.state(), identity = snapshot.guidance.identity;
  assert.equal(identity.scope.pet_id, petId);
  assert.equal(identity.scope.season_key, currentSeason);
  assert.equal(Object.hasOwn(identity.scope, 'telegram_id'), false, 'use the shipped identity shape, without inventing an owner field');
  const identityFields = ['name', 'pet_name', 'display_name', 'species', 'art_identity_id', 'stage', 'evolution_id', 'evolution_stage'];
  const fullResult = hooks.serializePetMiniAppActionResult(result, identity, f.owner).pet;
  assert.equal(fullResult.display_name, 'BOTTY', 'a matching real projection retains the revealed canonical name');
  assert.equal(fullResult.evolution_stage, 3);
  for (const field of identityFields) assert.equal(fullResult[field], snapshot.pet[field], 'matching projection retains ' + field);

  f.pet('other-projected-pet', currentSeason, 300, 2);
  f.reveal('other-projected-pet');
  f.active('other-projected-pet');
  const otherIdentity = (await f.state()).guidance.identity;
  for (const [label, actionResult, projection, owner] of [
    ['other selected pet', result, otherIdentity, f.owner],
    ['other source season', { ...result, pet: { ...result.pet, season_key: oldSeason } }, identity, f.owner],
    ['other action owner', { ...result, pet: { ...result.pet, telegram_id: 'different-owner' } }, identity, f.owner],
    ['other verified owner', result, identity, 'different-owner'],
    ['missing verified owner', result, identity, ''],
    ['result-only response', result, null, f.owner],
  ]) {
    const patch = hooks.serializePetMiniAppActionResult(actionResult, projection, owner).pet;
    for (const field of identityFields) assert.equal(Object.hasOwn(patch, field), false, label + ' cannot apply ' + field);
    assert.equal(patch.pet_id, petId, label + ' retains the action source');
    assert.equal(patch.pet_xp, result.pet.pet_xp, label + ' retains confirmed stats');
  }
  f.sql.close();
});

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

test('a switch after care settlement preserves the committed result and requests an immediate refresh', async () => {
  const f = fixture('82015'), displayed = 'current-' + f.owner;
  f.pet('care-race-other', currentSeason, 300, 2);
  let switched = false;
  f.db.afterBatch = statements => {
    if (!statements.some(s => /UPDATE telegram_pet_events SET status='accepted'/.test(s.query))) return;
    f.db.afterBatch = null;
    f.active('care-race-other');
    switched = true;
  };

  const result = await f.act({ action: 'feed', displayed_pet_id: displayed, request_id: 'care-race-after-commit' });
  assert.equal(switched, true);
  assert.equal(result.accepted, true);
  assert.equal(result.refresh_state, true);
  assert.equal(result.pet.pet_id, displayed);
  assert.equal(result.reason, 'accepted');
  assert.equal(f.sql.prepare("SELECT status FROM telegram_pet_events WHERE event_type='feed' AND pet_id=?").get(displayed).status, 'accepted');
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='care-race-other'").get().pet_xp, 300);
  await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE pet_id=? AND action='feed'").get(displayed).n, 1,
    'later source-bound recovery must award against the recorded pet');
});

test('a switch after item-use settlement preserves the spend and award with an immediate refresh', async () => {
  const f = fixture('82016'), displayed = 'current-' + f.owner;
  f.pet('item-use-race-other', currentSeason, 300, 2);
  f.sql.prepare("INSERT INTO telegram_pet_inventory (telegram_id,asset_type,asset_key,quantity) VALUES (?,'item','moon_snack',2)").run(f.owner);
  let switched = false;
  f.db.afterBatch = statements => {
    if (!statements.some(s => /UPDATE telegram_pet_events\s+SET status\s*=\s*'accepted'/i.test(s.query))) return;
    f.db.afterBatch = null;
    f.active('item-use-race-other');
    switched = true;
  };

  const result = await f.act({ action: 'use_item', item_key: 'moon_snack', displayed_pet_id: displayed, request_id: 'item-use-after-commit' });
  assert.equal(switched, true);
  assert.equal(result.accepted, true);
  assert.equal(result.refresh_state, true);
  assert.equal(result.pet.pet_id, displayed);
  assert.equal(result.pet_xp_awarded, 4);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_key='moon_snack'").get(f.owner).quantity, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='use_item' AND pet_id=? AND status='accepted'").get(displayed).n, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_item_use' AND status='awarded'").get().n, 1);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(displayed).pet_xp, 204);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='item-use-race-other'").get().pet_xp, 300);
});

test('a switch after shop settlement preserves the purchase and charge with an immediate refresh', async () => {
  const f = fixture('82017'), displayed = 'current-' + f.owner;
  f.pet('shop-race-other', currentSeason, 300, 2);
  let switched = false;
  f.db.afterBatch = statements => {
    if (!statements.some(s => /UPDATE telegram_pet_events\s+SET status\s*=\s*'accepted'/i.test(s.query))) return;
    f.db.afterBatch = null;
    f.active('shop-race-other');
    switched = true;
  };

  const result = await f.act({ action: 'buy', item_key: 'moon_kibble', displayed_pet_id: displayed, request_id: 'shop-after-commit' });
  assert.equal(switched, true);
  assert.equal(result.accepted, true);
  assert.equal(result.refresh_state, true);
  assert.equal(result.pet.pet_id, displayed);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold, 955);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='buy' AND pet_id=? AND status='accepted'").get(displayed).n, 1);
  assert.equal(f.sql.prepare("SELECT equipped_food FROM telegram_pet_instances WHERE pet_id=?").get(displayed).equipped_food, 'moon_kibble');
  assert.equal(f.sql.prepare("SELECT equipped_food FROM telegram_pet_instances WHERE pet_id='shop-race-other'").get().equipped_food, null);
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

for (const action of ['market_buy', 'bounty_claim', 'expedition', 'cosmetic_unlock']) {
  test(action + ' preserves a committed settlement after a real concurrent switch and retries once', async () => {
    const f = fixture('settled-' + action), displayed = 'current-' + f.owner;
    f.pet('other-' + action, currentSeason, 300, 2);
    f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=100000 WHERE pet_id=?').run(displayed);
    f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=100000 WHERE telegram_id=?').run(f.owner);
    const day = new Date().toISOString().slice(0, 10);
    for (const type of ['feed', 'play', 'clean', 'sleep', 'train', 'work', 'random_event', 'activity_claim', 'run_complete', 'daily_chest', 'kaiju_battle', 'use_item']) {
      for (let i = 0; i < 3; i++) f.sql.prepare(`INSERT INTO telegram_pet_events
        (id,pet_id,telegram_id,event_type,event_key,day_key,week_key,season_key,status)
        VALUES (?,?,?,?,?,?,?,?,'accepted')`).run(type+i, displayed, f.owner, type, type+i, day, 'fixture-week', currentSeason);
    }
    const economy = await hooks.getPetEconomyState(f.db, f.owner);
    const body = { action, displayed_pet_id: displayed, request_id: 'saved-' + action };
    if (action === 'market_buy') body.offer_key = economy.market_offers.find(offer => offer.available).key;
    if (action === 'bounty_claim') body.bounty_key = economy.bounties.find(bounty => bounty.complete).key;
    if (action === 'expedition') body.expedition_key = 'dust_tunnels';
    if (action === 'cosmetic_unlock') body.cosmetic_key = 'profile_frame';
    let switched = false;
    f.db.afterBatch = async statements => {
      const saved = action === 'cosmetic_unlock'
        ? statements.some(s => s.query.includes("UPDATE telegram_pet_system_events SET status='completed'"))
        : statements.some(s => s.query.includes("UPDATE telegram_pet_reward_claims SET status = 'awarded'"));
      if (!saved) return;
      f.db.afterBatch = null;
      assert.equal((await hooks.switchActivePetSeasonSlot(f.db, f.owner, 'other-' + action)).accepted, true);
      switched = true;
    };
    const result = await f.act(body);
    assert.equal(switched, true);
    assert.equal(result.accepted, true);
    assert.equal(result.refresh_state, true);
    assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('other-' + action).pet_xp, 300);
    const wallet = () => f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
    const beforeRetry = wallet();
    const source = { market_buy: 'pet_market', bounty_claim: 'pet_bounty', expedition: 'pet_expedition' }[action];
    if (source) {
      const receipt = f.sql.prepare('SELECT pet_id,status,applied_rewards FROM telegram_pet_reward_claims WHERE source=?').get(source);
      assert.equal(receipt.pet_id, displayed);
      assert.equal(receipt.status, 'awarded');
      assert.deepEqual(result.rewards, JSON.parse(receipt.applied_rewards));
    } else {
      assert.equal(beforeRetry.style_tokens, 20);
      assert.equal(beforeRetry.moon_crystals, 96);
      assert.equal(f.sql.prepare('SELECT quantity FROM telegram_pet_cosmetic_unlocks WHERE cosmetic_key=?').get('profile_frame').quantity, 1);
    }
    const retry = await f.act({ ...body, displayed_pet_id: 'other-' + action });
    assert.equal(retry.accepted, true);
    assert.equal(retry.duplicate, true);
    assert.deepEqual(wallet(), beforeRetry);
    if (action === 'expedition') {
      assert.equal(f.sql.prepare('SELECT energy,pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(displayed).energy, 88);
      assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source=?').get(source).n, 1);
    }
  });
}

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

for (const method of ['first', 'all', 'run', 'batch']) test(`displayed-pet ${method} cannot pass a resolved failed statement to its caller`, async () => {
  const f = fixture('scope-failed-' + method);
  const scope = createDisplayedPetScope(f.db, f.owner, 'current-' + f.owner);
  const originalBatch = f.db.batch.bind(f.db);
  f.db.batch = async statements => statements.map((s, i) => i === statements.length - 1
    ? { success: true, results: [{ displayed_pet_authority: null }], meta: { changes: 0 } }
    : { success: false, error: 'statement_unavailable', results: [{ pet_id: 'fabricated' }], meta: { changes: 1 } });
  const read = scope.db.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').bind(f.owner);
  await assert.rejects(method === 'batch' ? scope.db.batch([read]) : read[method](), /pet_state_read_unavailable/);
  assert.equal(scope.changed, false, 'an outage is not evidence of a pet switch');
  f.db.batch = originalBatch;
  assert.equal((await read.first()).pet_id, 'current-' + f.owner, 'a fresh read can recover after the outage');
});

test('failed Arena queue insertion cannot acknowledge an unsaved queue entry', async () => {
  const f = fixture('queue-resolved-failure');
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=10000 WHERE telegram_id=?').run(f.owner);
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=10000 WHERE telegram_id=?').run(f.owner);
  const originalBatch = f.db.batch.bind(f.db);
  f.db.batch = async statements => statements.some(s => s.query.includes('INSERT INTO telegram_pet_arena_queue'))
    ? statements.map((s, i) => i === statements.length - 1
      ? { success: true, results: [{}], meta: { changes: 0 } }
      : { success: false, error: 'queue_unavailable', results: [], meta: { changes: 0 } })
    : originalBatch(statements);
  await assert.rejects(f.act({ action: 'arena_matchmake' }), /pet_state_read_unavailable/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_arena_queue').get().n, 0);
  f.db.batch = originalBatch;
  assert.equal((await f.act({ action: 'arena_matchmake' })).reason, 'arena_queued');
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

for (const action of ['activity_claim', 'activity_cancel']) {
  test(`stale ${action} cannot close a newer activity session`, async () => {
    const f = fixture(`stale-${action}`);
    const first = await f.act({ action: 'activity_start', activity_type: 'train' });
    assert.equal(first.accepted, true);
    assert.equal((await hooks.cancelPetActivitySession(f.db, f.owner)).accepted, true);
    const second = await f.act({ action: 'activity_start', activity_type: 'work' });
    assert.equal(second.accepted, true);
    f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-30 minutes') WHERE id=?").run(second.session.id);
    const before = f.sql.prepare('SELECT pet_xp,moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
    const result = await hooks.processPetMiniAppAction(f.db, f.owner, { id: f.owner }, {
      action, session_id: first.session.id,
    }, 'fixture-token');
    assert.equal(result.accepted, false, 'a button rendered for the first session must not affect the second');
    assert.equal(result.reason, 'activity_state_changed');
    assert.equal(result.refresh_state, true);
    assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_activity_sessions WHERE id=?').get(second.session.id).status, 'active');
    assert.deepEqual(f.sql.prepare('SELECT pet_xp,moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner), before);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='activity_claim'").get().n, 0);
    const current = await f.act({ action, session_id: second.session.id });
    assert.equal(current.accepted, true, 'a fresh button still acts on its own session');
    assert.equal(current.session.id, second.session.id);
  });

  test(`${action} requires the rendered session ID`, async () => {
    const f = fixture(`missing-${action}`);
    const started = await f.act({ action: 'activity_start', activity_type: 'train' });
    f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-30 minutes') WHERE id=?").run(started.session.id);
    for (const sessionId of [undefined, null, '', '  ', { id: started.session.id }]) {
      const result = await hooks.processPetMiniAppAction(f.db, f.owner, { id: f.owner }, {
        action, ...(sessionId === undefined ? {} : { session_id: sessionId }),
      }, 'fixture-token');
      assert.equal(result.accepted, false);
      assert.equal(result.reason, 'activity_session_required');
      assert.equal(result.refresh_state, true);
      assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_activity_sessions WHERE id=?').get(started.session.id).status, 'active');
    }
  });
}

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
  const pending=await f.act({action:'activity_claim'});
  assert.equal(pending.accepted,true);assert.equal(pending.refresh_state,true);assert.equal(pending.recovery_pending,true);
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

test('care and jobs share the account XP allowance after a real pet switch', async () => {
  const f=fixture('account-cap-care-work'),source='current-'+f.owner;
  f.pet('account-cap-replacement',currentSeason,300,2);
  assert.equal((await hooks.awardPetReward(f.db,{telegram_id:f.owner,pet_id:source,season_key:currentSeason,
    source:'pet_action',idempotency_key:'account-cap-fill',event_key:'account-cap-fill',rewards:{pet_xp:1199}})).pet_xp_awarded,1199);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'account-cap-replacement')).accepted,true);
  const feed=await f.act({action:'feed',request_id:'cap-feed'});
  assert.equal(feed.accepted,true);assert.equal(feed.pet_xp_awarded,1);
  const work=await f.act({action:'work',job_key:'street_artist',request_id:'cap-work'});
  assert.equal(work.accepted,true);assert.equal(work.pet_xp_awarded,0);
  assert.equal(work.rewards.moon_gold,18,'an exhausted XP allowance does not discard another earned asset');
  assert.equal(f.sql.prepare("SELECT SUM(pet_xp_awarded) xp FROM telegram_pet_events WHERE telegram_id=? AND day_key=? AND status='accepted'")
    .get(f.owner,new Date().toISOString().slice(0,10)).xp,1200);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(source).pet_xp,1399);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='account-cap-replacement'").get().pet_xp,301);
  assert.equal(f.sql.prepare("SELECT pet_id FROM telegram_pet_events WHERE event_type='work'").get().pet_id,'account-cap-replacement');
});

test('an activity start remains accepted when its saved-session projection fails', async () => {
  const f=fixture('activity-start-refresh');let started=false;
  f.db.afterBatch=ss=>{if(ss.some(s=>s.query.includes('INSERT INTO telegram_pet_activity_sessions')))started=true;};
  f.db.beforeRead=s=>{if(started&&/SELECT \* FROM telegram_pet_activity_sessions/.test(s.query))throw Error('activity_projection_unavailable');};
  const result=await f.act({action:'activity_start',activity_type:'explore'});
  assert.equal(result.accepted,true);assert.equal(result.reason,'started');assert.equal(result.refresh_state,true);
  assert.equal(result.session.id,f.sql.prepare("SELECT id FROM telegram_pet_activity_sessions WHERE status='active'").get().id);
  f.db.beforeRead=null;f.db.afterBatch=null;
  assert.equal((await f.act({action:'activity_start',activity_type:'explore'})).reason,'already_busy');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_activity_sessions').get().n,1);
});

for(const fault of ['profile-read','settled-marker','settled-marker-resolved']) test(`a paid activity retains its exact reward and recovery after ${fault} fails`,async()=>{
  const f=fixture('activity-paid-'+fault),source='current-'+f.owner;
  assert.equal((await f.act({action:'activity_start',activity_type:'explore'})).accepted,true);
  f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-2 hours')").run();
  let paid=false;
  f.db.afterBatch=ss=>{if(ss.some(s=>/UPDATE telegram_pet_events\s+SET pet_xp_awarded = MIN/.test(s.query)))paid=true;};
  if(fault==='profile-read')f.db.beforeRead=s=>{if(paid&&/SELECT \* FROM telegram_pet_profiles/.test(s.query))throw Error('activity_postpaid_read_unavailable');};
  else f.db.beforeRun=s=>{
    if(!paid||!/UPDATE telegram_pet_activity_sessions\s+SET metadata =/.test(s.query))return;
    if(fault==='settled-marker-resolved')s.exec=()=>({success:false,error:'activity_marker_unavailable',meta:{changes:0}});
    else throw Error('activity_settled_marker_unavailable');
  };
  const result=await f.act({action:'activity_claim'});
  assert.equal(result.accepted,true);assert.equal(result.refresh_state,true);assert.equal(result.recovery_pending,true);
  assert.equal(result.pet_xp_awarded,36);assert.equal(result.rewards.moon_gold,32);
  const xp=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(source).pet_xp;
  const gold=f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold;
  assert.equal(xp,236);assert.equal(gold,1032);
  assert.equal(JSON.parse(f.sql.prepare('SELECT metadata FROM telegram_pet_activity_sessions').get().metadata).claim_state,'claiming');
  f.db.beforeRead=null;f.db.beforeRun=null;f.db.afterBatch=null;
  const retry=await f.act({action:'activity_claim'});
  assert.equal(retry.accepted,true);assert.equal(retry.duplicate,true);assert.equal(retry.pet_xp_awarded,36);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(source).pet_xp,xp);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold,gold);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE asset_key='adventure_map'").get().quantity,1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='activity_claim' AND status='accepted'").get().n,1);
  assert.equal(JSON.parse(f.sql.prepare('SELECT metadata FROM telegram_pet_activity_sessions').get().metadata).claim_state,'settled');
});

test('an activity reward transaction failure stays retryable before any payout',async()=>{
  const f=fixture('activity-prepaid-failure');
  assert.equal((await f.act({action:'activity_start',activity_type:'explore'})).accepted,true);
  f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-2 hours')").run();
  f.db.beforeBatch=ss=>{if(ss.some(s=>/UPDATE telegram_pet_events\s+SET pet_xp_awarded = MIN/.test(s.query)))throw Error('activity_reward_write_unavailable');};
  await assert.rejects(f.act({action:'activity_claim'}),/activity_reward_write_unavailable/);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='activity_claim'").get().n,0);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp,200);
  f.db.beforeBatch=null;
  assert.equal((await f.act({action:'activity_claim'})).accepted,true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='activity_claim'").get().n,1);
});

function evolutionFixture(owner) {
  const f = fixture(owner), source = 'current-' + owner;
  f.sql.prepare("UPDATE telegram_pet_instances SET pet_xp=16000,stage='young',species='vinyl_crab' WHERE pet_id=?").run(source);
  f.sql.prepare("UPDATE telegram_pet_profiles SET pet_xp=16000,stage='young',species='vinyl_crab' WHERE telegram_id=?").run(owner);
  f.sql.prepare("UPDATE telegram_pet_season_slots SET created_at=datetime('now','-35 days') WHERE pet_id=?").run(source);
  for (const [id, stage] of [['moon_egg',0], ['street_moonpet',1]]) f.sql.prepare(`INSERT INTO telegram_pet_evolutions_by_pet
    (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,?,?,?)`).run(source,owner,id,stage,'saved:'+id);
  for (let index=0;index<21;index++) {
    const day = new Date(now.getTime()-(index+1)*86400000).toISOString().slice(0,10);
    f.sql.prepare(`INSERT INTO telegram_pet_growth_marks
      (mark_id,pet_id,telegram_id,season_key,milestone_type,evidence_key,earned_day) VALUES (?,?,?,?,?,?,?)`)
      .run('growth:'+index,source,owner,currentSeason,'care_milestone','care:'+index,day);
  }
  for (let week=1;week<=3;week++) f.sql.prepare(`INSERT INTO telegram_pet_weekly_crests
    (crest_id,pet_id,telegram_id,season_key,season_week,qualification_week,objective_id,evidence_key)
    VALUES (?,?,?,?,?,?,'weekly_journey',?)`).run('crest:'+week,source,owner,currentSeason,week,week,'weekly-journey:'+week);
  f.sql.prepare(`INSERT INTO telegram_pet_boss_victories (pet_id,telegram_id,season_key,boss_id,victories)
    VALUES (?,?,?,'alley_king',3)`).run(source,owner,currentSeason);
  for (const key of ['alley_crown','neon_shard']) f.sql.prepare('INSERT INTO telegram_pet_relics (telegram_id,relic_id,rarity) VALUES (?,?,?)').run(owner,key,'rare');
  for (const [key, quantity] of [['scrap_metal',20],['evolution_fragment',10]]) f.sql.prepare(
    'INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,?,?)').run(owner,key,quantity);
  f.pet('evolution-b',currentSeason,200,2);
  f.sql.prepare("UPDATE telegram_pet_instances SET stage='young',species='vinyl_crab' WHERE pet_id='evolution-b'").run();
  f.sql.prepare(`INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key)
    VALUES ('evolution-b',?,'street_moonpet',1,'saved-b')`).run(owner);
  const api = async () => {
    const response = await worker.fetch(new Request('https://moonboys-api.test/telegram-pets/action', {
      method:'POST',headers:{'content-type':'application/json','x-pets-bot-secret':'evolve-test'},
      body:JSON.stringify({telegram_id:owner,action:'evolve',evolution_id:'cyber_moonpet',event_key:'evolve-source-a'}),
    }),{DB:f.db,TELEGRAM_PETS_BOT_SECRET:'evolve-test'});
    return {http_status:response.status,...await response.json()};
  };
  return {...f,source,api};
}

test('legacy evolution follow-up finishes its committed pet after selection switches', async () => {
  const f=evolutionFixture('82020');
  let switched=false;
  f.db.afterBatch=async statements=>{
    if (!statements[0].query.includes('INSERT OR IGNORE INTO telegram_pet_evolutions_by_pet')) return;
    f.db.afterBatch=null;
    assert.equal(f.sql.prepare("SELECT stage FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND evolution_id='cyber_moonpet'").get(f.source).stage,2);
    switched=(await hooks.switchActivePetSeasonSlot(f.db,f.owner,'evolution-b')).accepted;
  };
  const result=await f.api();
  assert.equal(result.accepted,true,JSON.stringify(result));
  assert.equal(switched,true,'B becomes selected after A commits and before its lifecycle follow-up');
  assert.equal(f.sql.prepare('SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?').get(f.source).phase,'adult',
    'the committed source must finish without selecting A again');
  assert.equal(f.sql.prepare("SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id='evolution-b'").get().phase,'young');
  assert.equal(f.sql.prepare("SELECT stage FROM telegram_pet_instances WHERE pet_id='evolution-b'").get().stage,'young');
  assert.equal(f.sql.prepare('SELECT stage FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).stage,'young');
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id=? AND material_key='scrap_metal'").get(f.owner).quantity,10);
});

test('a failed evolution lifecycle follow-up repairs on duplicate retry without spending twice', async () => {
  const f=evolutionFixture('82021');
  f.db.beforeBatch=statements=>{
    if (statements.some(statement=>statement.query.includes("SET phase='adult'"))) throw Error('interrupted_evolution_lifecycle');
  };
  const first=await f.api();
  assert.equal(first.accepted,true,JSON.stringify(first));
  assert.equal(first.refresh_state,true);
  assert.equal(f.sql.prepare('SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?').get(f.source).phase,'young');
  const paid=f.sql.prepare('SELECT material_key,quantity FROM telegram_pet_material_balances WHERE telegram_id=? ORDER BY material_key').all(f.owner);
  assert.deepEqual(paid.map(row=>row.quantity),[7,10]);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'evolution-b')).accepted,true);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,f.source)).accepted,true);
  f.db.beforeBatch=null;
  const retry=await f.api();
  assert.equal(retry.accepted,true,JSON.stringify(retry));assert.equal(retry.duplicate,true);
  assert.equal(f.sql.prepare('SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?').get(f.source).phase,'adult');
  assert.deepEqual(f.sql.prepare('SELECT material_key,quantity FROM telegram_pet_material_balances WHERE telegram_id=? ORDER BY material_key').all(f.owner),paid);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND evolution_id='cyber_moonpet'").get(f.source).n,1);
});

test('Mini App explicit final evolution retry reaches its saved lifecycle repair', async () => {
  const f=fixture('82022'),source='current-'+f.owner;
  f.sql.prepare(`INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key)
    VALUES (?,?,'legendary_moon_guardian',5,'saved-final')`).run(source,f.owner);
  const result=await f.act({action:'evolve',evolution_id:'legendary_moon_guardian',request_id:'retry-final'});
  assert.equal(result.accepted,true,JSON.stringify(result));assert.equal(result.duplicate,true);
  assert.equal(f.sql.prepare('SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?').get(source).phase,'adult');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_material_balances WHERE telegram_id=?').get(f.owner).n,0,
    'repair of a saved final evolution cannot charge materials again');
  const normalized=await f.act({action:'evolve',evolution_id:' LEGENDARY_MOON_GUARDIAN ',request_id:'retry-final-normalized'});
  assert.equal(normalized.accepted,true);assert.equal(normalized.duplicate,true);
});

test('a migrated final pet rejects unrelated evolution IDs without creating lower stages', async () => {
  const f=fixture('82024'),source='current-'+f.owner;
  f.sql.prepare(`INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key)
    VALUES (?,?,'legendary_moon_guardian',5,'migrated-final')`).run(source,f.owner);
  const saved=f.sql.prepare('SELECT * FROM telegram_pet_evolutions_by_pet WHERE pet_id=?').all(source);
  for (const evolutionId of ['moon_egg','street_moonpet','cyber_moonpet','moon_guardian','not_real','','   ',null,undefined]) {
    const result=await f.act({action:'evolve',...(evolutionId === undefined ? {} : {evolution_id:evolutionId}),request_id:'wrong-final-'+evolutionId});
    assert.equal(result.accepted,false,`${evolutionId} cannot become a new unlock on a final pet`);
    assert.equal(result.reason,'final_evolution_reached');
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_evolutions_by_pet WHERE pet_id=?').all(source),saved);
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_identity_analytics WHERE pet_id=?').get(source).n,0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_material_balances WHERE telegram_id=?').get(f.owner).n,0);
});

test('a scoped Mini App evolution repairs its original pet on core refresh after a selection change', async () => {
  const f=evolutionFixture('82023');
  let switched=false;
  f.db.afterBatch=async statements=>{
    if (!statements[0].query.includes('INSERT OR IGNORE INTO telegram_pet_evolutions_by_pet')) return;
    f.db.afterBatch=null;
    assert.equal(f.sql.prepare("SELECT stage FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND evolution_id='cyber_moonpet'").get(f.source).stage,2);
    switched=(await hooks.switchActivePetSeasonSlot(f.db,f.owner,'evolution-b')).accepted;
  };
  const result=await f.act({action:'evolve',evolution_id:'cyber_moonpet',request_id:'scoped-source-a'});
  assert.equal(result.accepted,true,JSON.stringify(result));
  assert.equal(result.refresh_state,true,'the committed action defers its closed-scope follow-up to refresh');
  assert.equal(switched,true);
  assert.equal(f.sql.prepare('SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?').get(f.source).phase,'young');
  const paid=f.sql.prepare('SELECT material_key,quantity FROM telegram_pet_material_balances WHERE telegram_id=? ORDER BY material_key').all(f.owner);
  assert.deepEqual(paid.map(row=>row.quantity),[7,10]);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,f.source)).accepted,true);
  assert.equal(f.sql.prepare('SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?').get(f.source).phase,'young',
    'selecting the pet alone leaves repair pending until the following core read');
  const refreshed=await hooks.buildPetMiniAppCoreState(f.db,f.owner);
  assert.equal(refreshed.pet.pet_id,f.source);
  assert.equal(refreshed.lifecycle.phase,'adult');
  assert.equal(refreshed.lifecycle.evolution_stage,2);
  assert.equal(f.sql.prepare('SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?').get(f.source).phase,'adult');
  assert.equal(f.sql.prepare('SELECT stage FROM telegram_pet_instances WHERE pet_id=?').get(f.source).stage,'adult');
  assert.equal(f.sql.prepare("SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id='evolution-b'").get().phase,'young');
  assert.equal(f.sql.prepare("SELECT stage FROM telegram_pet_instances WHERE pet_id='evolution-b'").get().stage,'young');
  assert.deepEqual(f.sql.prepare('SELECT material_key,quantity FROM telegram_pet_material_balances WHERE telegram_id=? ORDER BY material_key').all(f.owner),paid);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND evolution_id='cyber_moonpet'").get(f.source).n,1);
});
