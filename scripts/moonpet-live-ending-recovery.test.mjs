import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { getActiveSeasonalBoss, recoverPetLiveSystemEndings, buildPetLiveSystemsState, processPetDistrictMission, processPetEventChain, processPetSeasonalBoss } from '../workers/moonboys-api/pets/live-systems.js';
import { PET_EVENT_CHAINS } from '../workers/moonboys-api/pets/content-phase-4.js';

const currentSeason = 'pet-s2026-003';
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
  for (const migration of ['058_telegram_pet_season_completion.sql','061_moonpet_season_economy_calibration.sql']) sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/'+migration, import.meta.url),'utf8'));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { db.statementCount++; if (db.beforeFirst) await db.beforeFirst(this); return sql.prepare(this.query).get(...this.args) || null; }
    async all() { db.statementCount++; if (db.beforeAll) await db.beforeAll(this); return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      db.statementCount++;
      if (sql.prepare(this.query).columns().length && !/\bRETURNING\b/i.test(this.query)) return { results: sql.prepare(this.query).all(...this.args), meta: { changes: 0 } };
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) { const override = await db.beforeRun(this); if (override !== undefined) return override; } return this.exec(); }
  }
  const db = { statementCount: 0, beforeBatch: null, beforeRun: null, prepare(query) { return new Statement(query); }, async batch(statements) {
    for (const statement of statements) {
      if (/^\s*SELECT\b/i.test(statement.query)) {
        if (this.beforeFirst) { const reply = await this.beforeFirst(statement); if (reply?.success === false) throw Error('pet_state_read_unavailable'); }
        if (this.beforeAll) { const reply = await this.beforeAll(statement); if (reply?.success === false) throw Error('pet_state_read_unavailable'); }
      } else if (this.beforeRun) await this.beforeRun(statement);
    }
    if (this.beforeBatch) { const override = await this.beforeBatch(statements); if (override !== undefined) return override; }
    sql.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(s.exec()); sql.exec('COMMIT'); return results; }
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

for (const action of ['district', 'event_chain', 'seasonal_boss']) test(`${action} requires verified settlement claims before acknowledging a saved action`, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 12) });
  const count = action === 'event_chain' ? 1 : 3;
  for (const [failure, failedResults] of [
    ...Array.from({ length: count }, (_, index) => [`failed-${index}`, () => Array.from({ length: count }, (_, position) => position === index
      ? { success: false, error: 'claim_write_failed', meta: { changes: 1 } } : { meta: { changes: 1 } })]),
    ['missing-metadata', () => Array.from({ length: count }, () => ({}))],
    ['string-count', () => Array.from({ length: count }, () => ({ meta: { changes: '1' } }))],
    ...(count > 1 ? [['short', () => Array.from({ length: count - 1 }, () => ({ meta: { changes: 1 } }))]] : []),
  ]) {
    const f = fixture(`claim-result-${action}-${failure}`), petId = 'current-' + f.owner;
    const pet = { pet_id: petId, season_key: currentSeason, pet_xp: action === 'seasonal_boss' ? 400000 : 200, energy: 100 };
    let injected = false;
    const match = statement => statement.query.includes("SET status='settling', payload_json=json_set");
    if (action === 'event_chain') f.db.beforeRun = statement => {
      if (match(statement)) { injected = true; return failedResults()[0]; }
    };
    else f.db.beforeBatch = statements => {
      if (match(statements[0])) {
        injected = true; const failures = failedResults(); let position = 0;
        return failures.length < count ? failures : statements.map(statement => statement.query.includes('AS mutation_committed') ? { success: true, results: [{}], meta: { changes: 0 } } : failures[position++]);
      }
    };
    const award = () => assert.fail('unverified action claim cannot reach payout');
    const act = () => action === 'district' ? processPetDistrictMission(f.db, f.owner, 'moon_alley', pet, {}, award, null, 'careful')
      : action === 'event_chain' ? processPetEventChain(f.db, f.owner, 'lost_delivery_drone', award, null, undefined, pet)
        : processPetSeasonalBoss(f.db, f.owner, pet, award, 'strike');
    await assert.rejects(act(), /pet_state_write_unavailable/, failure + ' must be retryable rather than a gameplay result');
    assert.equal(injected, true);
    assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(petId).energy, 100);
    assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE system_key=?').get(action).status, 'pending');
  }
});

for (const action of ['district', 'event_chain', 'seasonal_boss']) test(`${action} does not acknowledge failed or malformed ending writes`, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 12) });
  for (const [failure, failedResults] of [
    ...[0, 1].map(index => [`failed-${index}`, () => Array.from({ length: 2 }, (_, position) => position === index
      ? { success: false, error: 'ending_write_failed', meta: { changes: 1 } } : { meta: { changes: 1 } })]),
    ['missing-metadata', () => [{}, { meta: { changes: 1 } }]],
    ['string-count', () => [{ meta: { changes: '1' } }, { meta: { changes: 1 } }]],
    ['short', () => [{ meta: { changes: 1 } }]],
  ]) {
    const f = fixture(`ending-result-${action}-${failure}`), petId = 'current-' + f.owner;
    const xp = action === 'seasonal_boss' ? 400000 : 200;
    f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=? WHERE pet_id=?').run(xp, petId);
    const pet = { pet_id: petId, season_key: currentSeason, pet_xp: xp, energy: 100 };
    const award = args => hooks.awardPetReward(f.db, args);
    const act = () => action === 'district' ? processPetDistrictMission(f.db, f.owner, 'moon_alley', pet, {}, award, null, 'careful')
      : action === 'event_chain' ? processPetEventChain(f.db, f.owner, 'lost_delivery_drone', award, null, undefined, pet)
        : processPetSeasonalBoss(f.db, f.owner, pet, award, 'strike');
    let injected = false;
    f.db.beforeBatch = statements => {
      if (statements.some(statement => statement.query.includes("SET status='completed', payload_json=?"))) {
        injected = true; const failures = failedResults(); let position = 0;
        return failures.length < 2 ? failures : statements.map(statement => statement.query.includes('AS mutation_committed') ? { success: true, results: [{}], meta: { changes: 0 } } : failures[position++]);
      }
    };
    const pending = await act();
    assert.equal(injected, true);
    assert.equal(pending.accepted, true, 'the saved choice remains recoverable');
    assert.equal(pending.reward_pending, true, failure + ' must not report a completed ending');
    assert.equal(pending.refresh_state, true);
    const event = f.sql.prepare('SELECT * FROM telegram_pet_system_events WHERE system_key=?').get(action);
    assert.equal(event.status, 'settling');
    const snapshot = f.sql.prepare('SELECT pet_xp,energy FROM telegram_pet_instances WHERE pet_id=?').get(petId);
    f.db.beforeBatch = null;
    f.sql.prepare("UPDATE telegram_pet_system_events SET updated_at='2000-01-01 00:00:00' WHERE id=?").run(event.id);
    const recovered = await act();
    assert.equal(recovered.accepted, true);
    assert.equal(recovered.reward_pending, false);
    assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE id=?').get(event.id).status, 'completed');
    assert.deepEqual(f.sql.prepare('SELECT pet_xp,energy FROM telegram_pet_instances WHERE pet_id=?').get(petId), snapshot,
      'ending recovery cannot duplicate the saved reward or energy charge');
  }
});

for (const [label, match] of [
  ['story progress', q => q.startsWith('SELECT chain_key, step_index, completed_cycles')],
  ['raid progress', q => q.startsWith('SELECT season_key, boss_key, damage')],
  ['owned cosmetics', q => q.startsWith('SELECT cosmetic_key, quantity, unlocked_at')],
  ['used daily attempts', q => q.startsWith('SELECT system_key, action_key, period_key')],
  ['saved raid rewards', q => q.startsWith('SELECT b.pet_id,b.season_key,b.boss_key')],
]) test(`${label} read failures must not replace saved state with an empty board`, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 12) });
  const f=fixture('read-'+label.replaceAll(' ','-')), petId='current-'+f.owner;
  await f.act({action:'event_chain',chain_key:'lost_delivery_drone',request_id:'saved-story'});
  const boss=getActiveSeasonalBoss();
  f.sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress
    (pet_id,telegram_id,pet_season_key,season_key,boss_key,damage,defeated_at)
    VALUES (?,?,?,?,?,?,?)`).run(petId,f.owner,currentSeason,boss.season_instance,boss.key,boss.hp,new Date().toISOString());
  f.sql.prepare("INSERT INTO telegram_pet_cosmetic_unlocks (telegram_id,cosmetic_key,quantity) VALUES (?,'profile_frame',1)").run(f.owner);
  const before=(await f.state()).live_systems;
  assert.equal(before.chains.find(c=>c.key==='lost_delivery_drone').step_index,1);
  assert.equal(before.seasonal_boss.damage,boss.hp);
  assert.equal(before.seasonal_boss.pending_rewards.length,1);
  assert.equal(before.cosmetics.find(c=>c.key==='profile_frame').unlocked,true);
  f.db.beforeAll=statement=>{if(match(statement.query))throw Error('saved_state_read_failed');};
  await assert.rejects(f.state(),/saved_state_read_failed/,'a failed read must enter the retry path, not fabricate empty player state');
  f.db.beforeAll=null;
  const after=(await f.state()).live_systems;
  assert.deepEqual(after.chains.map(c=>[c.key,c.step_index,c.used_today]),before.chains.map(c=>[c.key,c.step_index,c.used_today]));
  assert.equal(after.seasonal_boss.damage,before.seasonal_boss.damage);
  assert.deepEqual(after.seasonal_boss.pending_rewards,before.seasonal_boss.pending_rewards);
  assert.deepEqual(after.cosmetics,before.cosmetics);
});

for (const [label, method, match] of [
  ['inventory','beforeAll',q=>q.includes('SELECT asset_key, quantity') && q.includes('telegram_pet_inventory')],
  ['materials','beforeAll',q=>q.includes('SELECT material_key, quantity') && q.includes('quantity > 0 ORDER BY material_key')],
  ['equipment','beforeAll',q=>q.includes('SELECT item_key, slot, item_level, item_xp, mastery_xp, mastery_tier')],
  ['special care cooldowns','beforeAll',q=>q.includes('MAX(created_at) AS last_created_at') && q.includes("'energy_drink','dance','cuddles'")],
  ['weekly boss progress','beforeFirst',q=>q.includes('SELECT boss_id, attempts, damage, defeated_at, reward_claimed_at')],
  ['weekly boss attempts','beforeFirst',q=>q.includes('SELECT action, damage, event_key FROM telegram_pet_weekly_boss_events')],
  ['season XP','beforeFirst',q=>q.startsWith('SELECT season_xp FROM telegram_pet_season_state')],
  ['season reward claims','beforeAll',q=>q.startsWith('SELECT idempotency_key, COALESCE(awarded_at,created_at) AS claimed_at')],
  ['economy objectives','beforeAll',q=>q.startsWith('SELECT event_type, COUNT(*) AS total FROM telegram_pet_events')],
  ['bounty and expedition receipts','beforeAll',q=>q.startsWith('SELECT source, idempotency_key, pet_id, metadata, applied_rewards')],
  ['daily and weekly XP totals','beforeFirst',q=>q.includes('SUM(xp_awarded)') && q.includes('AS community_xp') && q.includes('SUM(pet_xp_awarded)')],
  ['specialist progress','beforeFirst',q=>q.startsWith('SELECT * FROM telegram_pet_specialist_progression')],
  ['daily mission sources','beforeAll',q=>q.includes('SELECT event_type, COUNT(*) AS count') && q.includes('FROM telegram_pet_events')],
  ['active run','beforeFirst',q=>q.includes('SELECT * FROM telegram_pet_runs') && q.includes("status IN ('active', 'extractable')")],
  ['timed activity','beforeFirst',q=>q.includes('SELECT * FROM telegram_pet_activity_sessions') && q.includes("status = 'active'")],
]) test(`${label} outages must not advertise missing items or fresh action allowances`, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 12) });
  const f=fixture('state-'+label.replaceAll(' ','-'));
  await f.state();
  f.sql.prepare('UPDATE telegram_pet_instances SET happiness=40 WHERE telegram_id=?').run(f.owner);
  f.sql.prepare('UPDATE telegram_pet_profiles SET happiness=40 WHERE telegram_id=?').run(f.owner);
  assert.equal((await f.act({action:'dance',request_id:'saved-dance'})).accepted,true);
  f.sql.prepare("INSERT INTO telegram_pet_inventory (telegram_id,asset_type,asset_key,quantity) VALUES (?,'item','moon_kibble',2)").run(f.owner);
  const before=await f.state();
  assert.ok(before.cooldowns.entries.some(entry=>entry.key==='action:dance'));
  f.db[method]=statement=>{if(match(statement.query))throw Error('required_state_read_failed');};
  await assert.rejects(f.state(),/required_state_read_failed/);
  f.db[method]=null;
  const after=await f.state();
  assert.deepEqual(after.inventory,before.inventory);
  assert.ok(after.cooldowns.entries.some(entry=>entry.key==='action:dance'));
});


for (const fault of ['initialize', 'read', 'authority']) test(`district ${fault} failure cannot consume the attempt or lose mastery`, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 12) });
  const f = fixture('district-state-' + fault), petId = 'current-' + f.owner;
  const oldMastery = fault === 'initialize' ? 0 : 90;
  if (oldMastery) f.sql.prepare(`INSERT INTO telegram_pet_live_progression_state
    (pet_id,telegram_id,season_key,region_mastery_json) VALUES (?,?,?,?)`)
    .run(petId, f.owner, currentSeason, JSON.stringify({ moon_alley: oldMastery }));
  const fail = statement => {
    const matches = fault === 'authority'
      ? statement.query.startsWith('SELECT 1 AS ok FROM telegram_pet_instances')
      : statement.query.includes('telegram_pet_live_progression_state');
    if (matches) throw Error('district_state_unavailable');
  };
  if (fault === 'initialize') f.db.beforeRun = fail;
  else f.db.beforeFirst = fail;
  const body = { action: 'district_mission', region_key: 'moon_alley', approach_key: 'careful', request_id: 'state-failure' };
  await assert.rejects(f.state(), /district_state_unavailable/, 'state must not advertise a zero-mastery fallback');
  await assert.rejects(f.act(body), /district_state_unavailable/);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(petId).energy, 100);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='district'").get().n, 0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='district_mission'").get().n, 0);
  f.db.beforeRun = null; f.db.beforeFirst = null;
  const restored = (await f.state()).live_systems.regions.find(region => region.key === 'moon_alley');
  assert.equal(restored.mastery_xp, oldMastery);
  assert.equal(restored.mission.boss, oldMastery > 0);
  const result = await f.act(body);
  assert.equal(result.accepted, true);
  assert.equal(result.mission.boss, oldMastery > 0);
  const progress = f.sql.prepare('SELECT region_mastery_json FROM telegram_pet_live_progression_state WHERE pet_id=?').get(petId);
  assert.equal(JSON.parse(progress.region_mastery_json).moon_alley, oldMastery + result.outcome.mastery_gain);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(petId).energy, 90);
  const receipt = f.sql.prepare("SELECT pet_xp_awarded FROM telegram_pet_events WHERE event_type='district_mission'").all();
  assert.equal(receipt.length, 1);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=daily')).entries[0].pet_xp, receipt[0].pet_xp_awarded);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp, 200 + receipt[0].pet_xp_awarded);
  await f.act(body);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='district_mission'").get().n, 1);
  assert.equal(f.sql.prepare('SELECT region_mastery_json FROM telegram_pet_live_progression_state WHERE pet_id=?').get(petId).region_mastery_json, progress.region_mastery_json);
});

test('a successful missing-pet authority lookup remains a normal action rejection', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 12) });
  const f = fixture('missing-district-pet');
  const result = await processPetDistrictMission(f.db, f.owner, 'moon_alley',
    { pet_id: 'missing-pet', season_key: currentSeason, pet_xp: 200, energy: 100 }, {},
    () => assert.fail('a missing pet must not receive rewards'));
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'source_pet_authority_required');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_system_events').get().n, 0);
});

for (const action of ['district_mission', 'event_chain']) test(`${action} repairs a paid ending after midnight and a pet switch`, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 12) });
  const f = fixture('ending-' + action);
  const sourcePet = 'current-' + f.owner;
  const system = action === 'district_mission' ? 'district' : 'event_chain';
  const progressTable = action === 'district_mission' ? 'telegram_pet_live_progression_state' : 'telegram_pet_event_chain_progress';
  f.db.beforeBatch = statements => {
    if (statements.some(s => new RegExp('(?:UPDATE|INSERT INTO) ' + progressTable).test(s.query))) throw Error('interrupted_ending');
  };
  const pending = await f.act({ action, request_id: 'original-ending', region_key: 'moon_alley', chain_key: 'lost_delivery_drone' });
  assert.equal(pending.accepted, true); assert.equal(pending.reward_pending, true); assert.equal(pending.refresh_state, true);
  const saved = f.sql.prepare('SELECT * FROM telegram_pet_system_events WHERE system_key=?').get(system);
  const decision = JSON.parse(saved.payload_json).decision;
  assert.ok(decision, 'the original decision is persisted before payout');
  const xp = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).pet_xp;
  assert.ok(xp > 200, 'primary XP was committed before the ending failure');
  f.db.beforeBatch = null;
  f.sql.prepare("UPDATE telegram_pet_system_events SET updated_at='2000-01-01 00:00:00' WHERE id=?").run(saved.id);
  t.mock.timers.tick(86400000);
  f.pet('next-pet', currentSeason, 300, 2); f.active('next-pet');
  await f.state();
  assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE id=?').get(saved.id).status, 'completed');
  if (action === 'district_mission') {
    const row = f.sql.prepare('SELECT region_mastery_json FROM telegram_pet_live_progression_state WHERE pet_id=?').get(sourcePet);
    assert.equal(JSON.parse(row.region_mastery_json).moon_alley, decision.masteryGain);
    assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).energy, 90);
  } else assert.equal(f.sql.prepare('SELECT step_index FROM telegram_pet_event_chain_progress WHERE pet_id=?').get(sourcePet).step_index, 1);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).pet_xp, xp);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='next-pet'").get().pet_xp, 300);
  const events = f.sql.prepare('SELECT event_key,pet_id,season_key,day_key,pet_xp_awarded FROM telegram_pet_events WHERE event_type=?').all(action);
  assert.equal(events.length, 1); assert.equal(events[0].pet_id, sourcePet); assert.equal(events[0].day_key, '2026-09-26');
  const board = await f.get('/telegram-pets/leaderboard?period=all_time');
  assert.equal(board.entries[0].pet_xp, xp + 300);
  await f.state();
  assert.deepEqual(f.sql.prepare('SELECT event_key,pet_id,season_key,day_key,pet_xp_awarded FROM telegram_pet_events WHERE event_type=?').all(action), events);
});

test('a charged raid attack survives rotation and credits the original boss and pet once', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 19, 12) });
  const f = fixture('raid-ending'), sourcePet = 'current-' + f.owner;
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=400000 WHERE pet_id=?').run(sourcePet);
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=400000 WHERE telegram_id=?').run(f.owner);
  f.reveal(sourcePet);
  const boss = getActiveSeasonalBoss();
  f.sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress (pet_id,telegram_id,pet_season_key,season_key,boss_key,damage) VALUES (?,?,?,?,?,?)`).run(sourcePet,f.owner,currentSeason,boss.season_instance,boss.key,boss.hp - 1);
  f.db.beforeBatch = statements => {
    if (statements.some(s => s.query.includes('INSERT INTO telegram_pet_seasonal_boss_progress'))) throw Error('interrupted_raid');
  };
  const pending = await f.act({ action: 'seasonal_boss', move: 'strike', request_id: 'saved-raid' });
  assert.equal(pending.accepted, true); assert.equal(pending.reward_pending, true); assert.equal(pending.refresh_state, true);
  const saved = f.sql.prepare("SELECT * FROM telegram_pet_system_events WHERE system_key='seasonal_boss'").get();
  const attack = JSON.parse(saved.payload_json).attack;
  const energy = f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).energy;
  assert.equal(energy, 100 - attack.energy);
  f.db.beforeBatch = null;
  f.sql.prepare("UPDATE telegram_pet_system_events SET updated_at='2000-01-01 00:00:00' WHERE id=?").run(saved.id);
  t.mock.timers.tick(14 * 86400000);
  assert.notEqual(getActiveSeasonalBoss().season_instance, boss.season_instance);
  f.sql.prepare('UPDATE telegram_pet_instances SET last_decay_at=? WHERE pet_id=?').run(new Date().toISOString(), sourcePet);
  f.pet('new-raid-pet', 'pet-s2026-004', 300, 1); f.active('new-raid-pet', 'pet-s2026-004');
  await f.state();
  assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE id=?').get(saved.id).status, 'completed');
  const row = f.sql.prepare('SELECT * FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get(sourcePet);
  assert.equal(row.season_key, boss.season_instance); assert.equal(row.boss_key, boss.key); assert.equal(row.damage, boss.hp); assert.ok(row.defeated_at); assert.ok(row.reward_claimed_at);
  await f.state();
  assert.equal(f.sql.prepare('SELECT damage FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get(sourcePet).damage, boss.hp);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).energy, energy);
  const event = f.sql.prepare("SELECT pet_id,season_key,day_key,pet_xp_awarded FROM telegram_pet_events WHERE event_type='seasonal_boss'").all();
  assert.equal(event.length, 1); assert.equal(event[0].pet_id, sourcePet); assert.equal(event[0].season_key, currentSeason);
  assert.equal(event[0].day_key, '2026-10-03'); assert.equal(event[0].pet_xp_awarded, 150);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp, 400450);
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key=?').get(f.owner,'pet-s2026-003').season_xp, 150);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=seasonal')).entries[0]?.pet_xp || 0, 0);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='new-raid-pet'").get().pet_xp, 300);
});

test('a new-day story click finishes the saved step before starting another one', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 12) });
  const f = fixture('direct-story'), sourcePet = 'current-' + f.owner;
  f.db.beforeBatch = statements => {
    if (statements.some(s => s.query.includes('INSERT INTO telegram_pet_event_chain_progress'))) throw Error('saved_step_pending');
  };
  const body = { action: 'event_chain', chain_key: 'lost_delivery_drone', request_id: 'first-step' };
  const pending = await f.act(body);
  assert.equal(pending.accepted, true); assert.equal(pending.reward_pending, true); assert.equal(pending.refresh_state, true);
  const saved = f.sql.prepare("SELECT * FROM telegram_pet_system_events WHERE system_key='event_chain'").get();
  const choice = JSON.parse(saved.payload_json).choice_key;
  const paidXp = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).pet_xp;
  f.db.beforeBatch = null;
  f.sql.prepare("UPDATE telegram_pet_system_events SET updated_at='2000-01-01 00:00:00' WHERE id=?").run(saved.id);
  t.mock.timers.tick(86400000);
  const projected = await buildPetLiveSystemsState(f.db, f.owner, await hooks.getPetProfile(f.db, f.owner), {});
  assert.equal(projected.chains.find(c => c.key === body.chain_key).pending_choice_key, choice);
  const retry = await f.act({ ...body, request_id: 'new-day-retry' });
  assert.equal(retry.accepted, true); assert.equal(retry.choice.key, choice);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='event_chain'").get().n, 1);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).pet_xp, paidXp);
  const today = await f.act({ ...body, request_id: 'todays-next-step' });
  assert.equal(today.accepted, true); assert.equal(today.duplicate, false);
  assert.equal(f.sql.prepare('SELECT step_index FROM telegram_pet_event_chain_progress WHERE pet_id=?').get(sourcePet).step_index, 2);
});

test('recovery does not charge an unstarted district reservation, and its later retry keeps the frozen decision', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 12) });
  const f = fixture('uncharged-district'), sourcePet = 'current-' + f.owner;
  f.db.beforeBatch = statements => {
    if (statements.some(s => s.query.includes("SET status='settling', payload_json=json_set"))) throw Error('before_energy_charge');
  };
  const body = { action: 'district_mission', region_key: 'moon_alley', approach_key: 'careful', request_id: 'uncharged' };
  await assert.rejects(f.act(body), /before_energy_charge/);
  const saved = f.sql.prepare("SELECT * FROM telegram_pet_system_events WHERE system_key='district'").get();
  const decision = JSON.parse(saved.payload_json).decision;
  f.db.beforeBatch = null;
  f.sql.prepare("UPDATE telegram_pet_system_events SET updated_at='2000-01-01 00:00:00' WHERE id=?").run(saved.id);
  t.mock.timers.tick(86400000);
  await recoverPetLiveSystemEndings(f.db, f.owner, args => hooks.awardPetReward(f.db, args));
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).energy, 100);
  assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE id=?').get(saved.id).status, 'pending');
  const retry = await f.act({ ...body, approach_key: 'bold', request_id: 'new-day-charge' });
  assert.equal(retry.accepted, true); assert.equal(retry.choice.key, 'careful');
  assert.equal(retry.outcome.success, decision.succeeded);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).energy, 90);
});

for (const legacy of [false, true]) test(`an uncharged older ${legacy ? 'pre-tactics' : 'current'} raid cannot strand a later saved hit`, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 25, 12) });
  const f = fixture('raid-uncharged-predecessor-' + legacy), sourcePet = 'current-' + f.owner;
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=400000 WHERE pet_id=?').run(sourcePet);
  const pet = () => f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet);
  const award = args => hooks.awardPetReward(f.db, args);
  f.db.beforeBatch = statements => {
    if (statements.some(s => s.query.includes("SET status='settling', payload_json=json_set"))) throw Error('before_raid_charge');
  };
  await assert.rejects(processPetSeasonalBoss(f.db, f.owner, pet(), award, 'strike'), /before_raid_charge/);
  const older = f.sql.prepare("SELECT * FROM telegram_pet_system_events WHERE system_key='seasonal_boss'").get();
  assert.equal(JSON.parse(older.payload_json).energy_charged, undefined);
  if (legacy) {
    // Before raid tactics, the reservation saved its authority but no attack;
    // the old 18-energy strike was only created after the charge succeeded.
    f.sql.prepare('UPDATE telegram_pet_system_events SET payload_json=? WHERE id=?')
      .run(JSON.stringify({ pet_id: sourcePet, season_key: currentSeason }), older.id);
  }
  t.mock.timers.tick(86400000);
  f.db.beforeBatch = statements => {
    if (statements.some(s => s.query.includes('INSERT INTO telegram_pet_seasonal_boss_progress'))) throw Error('saved_raid_hit_pending');
  };
  const pending = await processPetSeasonalBoss(f.db, f.owner, pet(), award, 'conserve');
  assert.equal(pending.accepted, true); assert.equal(pending.reward_pending, true);
  const newer = f.sql.prepare("SELECT * FROM telegram_pet_system_events WHERE system_key='seasonal_boss' AND id<>?").get(older.id);
  assert.equal(newer.action_key, older.action_key, 'exercise independent daily attempts for the same boss');
  const savedAttack = JSON.parse(newer.payload_json).attack;
  const energy = pet().energy;
  f.db.beforeBatch = null;
  f.sql.prepare("UPDATE telegram_pet_system_events SET updated_at='2000-01-01 00:00:00'").run();
  f.pet('other-' + f.owner, currentSeason, 200, 2);
  f.active('other-' + f.owner);
  await recoverPetLiveSystemEndings(f.db, f.owner, award);
  assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE id=?').get(newer.id).status, 'completed',
    'the older uncharged row is not recoverable and must not exclude this paid hit');
  const expired = f.sql.prepare('SELECT status,payload_json FROM telegram_pet_system_events WHERE id=?').get(older.id);
  assert.equal(expired.status, 'rejected');
  assert.equal(JSON.parse(expired.payload_json).expired_uncharged, 1);
  assert.equal(f.sql.prepare('SELECT damage FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get(sourcePet).damage, savedAttack.damage);
  assert.equal(pet().energy, energy, 'recovery does not charge either daily attempt again');
  await recoverPetLiveSystemEndings(f.db, f.owner, award);
  assert.equal(f.sql.prepare('SELECT damage FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get(sourcePet).damage, savedAttack.damage);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get('other-' + f.owner).n, 0);
  const deleted = await hooks.deletePetSlot(f.db, f.owner, { pet_id: sourcePet, confirm_pet_id: sourcePet, confirmed: true });
  assert.equal(deleted.accepted, true, 'the expired unpaid reservation no longer blocks deletion');
});

test('an old paused raid cannot charge after expiry releases deletion', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 25, 12) });
  const f = fixture('raid-expiry-delete-race'), sourcePet = 'current-' + f.owner;
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=400000 WHERE pet_id=?').run(sourcePet);
  const source = f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet);
  let expired = false;
  f.db.beforeBatch = async statements => {
    if (expired || !statements.some(s => s.query.includes("SET status='settling', payload_json=json_set"))) return;
    expired = true;
    t.mock.timers.tick(86400000);
    await recoverPetLiveSystemEndings(f.db, f.owner, () => assert.fail('an uncharged raid cannot pay'));
    const deleted = await hooks.deletePetSlot(f.db, f.owner, { pet_id: sourcePet, confirm_pet_id: sourcePet, confirmed: true });
    assert.equal(deleted.accepted, true, 'expired uncharged raid no longer blocks deletion');
  };
  const result = await processPetSeasonalBoss(f.db, f.owner, source, () => assert.fail('expired raid cannot pay'), 'strike');
  assert.equal(expired, true);
  assert.equal(result.accepted, false);
  assert.equal(f.sql.prepare('SELECT energy,status FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).energy, source.energy);
  assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).status, 'archived');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_seasonal_boss_progress').get().n, 0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_seasonal_boss'").get(f.owner).n, 0);
});

test('bounded recovery skips a failing source on the next refresh and does not block other stories', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 12) });
  const f = fixture('bounded-stories');
  const chains = Object.keys(PET_EVENT_CHAINS).slice(0, 3);
  f.db.beforeBatch = statements => {
    if (statements.some(s => s.query.includes('INSERT INTO telegram_pet_event_chain_progress'))) throw Error('pending_stories');
  };
  for (const chain of chains) {
    const pending = await f.act({ action: 'event_chain', chain_key: chain, request_id: chain });
    assert.equal(pending.accepted, true); assert.equal(pending.reward_pending, true); assert.equal(pending.refresh_state, true);
  }
  chains.forEach((chain, i) => f.sql.prepare("UPDATE telegram_pet_system_events SET updated_at=? WHERE system_key='event_chain' AND action_key=?").run(`2000-01-0${i + 1} 00:00:00`, chain));
  t.mock.timers.tick(86400000);
  f.db.beforeBatch = statements => {
    if (statements.some(s => s.query.includes('INSERT INTO telegram_pet_event_chain_progress') && s.args.includes(chains[0]))) throw Error('persistent_story_failure');
  };
  const recover = limit => recoverPetLiveSystemEndings(f.db, f.owner, args => hooks.awardPetReward(f.db, args), limit);
  await recover(1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE status='completed'").get().n, 0);
  await recover(1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE status='completed'").get().n, 1);
  await recover(1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE status='completed'").get().n, 2);
  assert.notEqual(f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE action_key=?').get(chains[0]).status, 'completed');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='event_chain'").get().n, 3);
});

test('repairing an older paid story cannot rewind a later completed step', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 12) });
  const f = fixture('legacy-story-order'), petId = 'current-' + f.owner;
  f.db.beforeBatch = statements => {
    if (statements.some(s => s.query.includes('INSERT INTO telegram_pet_event_chain_progress'))) throw Error('old_step_pending');
  };
  const pending = await f.act({ action: 'event_chain', chain_key: 'lost_delivery_drone', request_id: 'old-step' });
  assert.equal(pending.accepted, true); assert.equal(pending.reward_pending, true); assert.equal(pending.refresh_state, true);
  f.db.beforeBatch = null;
  const saved = f.sql.prepare("SELECT * FROM telegram_pet_system_events WHERE system_key='event_chain'").get();
  // Model a pre-fix player who continued the chain on later days.
  f.sql.prepare(`INSERT INTO telegram_pet_event_chain_progress (pet_id,telegram_id,season_key,chain_key,step_index,completed_cycles)
    VALUES (?,?,?,'lost_delivery_drone',2,3)`).run(petId,f.owner,currentSeason);
  f.sql.prepare(`INSERT INTO telegram_pet_system_events (id,pet_id,telegram_id,season_key,system_key,action_key,period_key,status,payload_json)
    VALUES ('later-step',?,?,?,'event_chain','lost_delivery_drone','2026-09-27','completed','{}')`).run(petId,f.owner,currentSeason);
  f.sql.prepare("UPDATE telegram_pet_system_events SET updated_at='2000-01-01 00:00:00' WHERE id=?").run(saved.id);
  t.mock.timers.tick(2 * 86400000);
  await recoverPetLiveSystemEndings(f.db, f.owner, args => hooks.awardPetReward(f.db, args));
  assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE id=?').get(saved.id).status, 'completed');
  const progress = f.sql.prepare('SELECT step_index,completed_cycles FROM telegram_pet_event_chain_progress WHERE pet_id=?').get(petId);
  assert.equal(progress.step_index, 2); assert.equal(progress.completed_cycles, 3);
});

test('a story request delayed across midnight cannot pay a step already advanced by the next day', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 23, 59, 59) });
  const f = fixture('story-midnight-reservation-race'), petId = 'current-' + f.owner;
  let injected = false;
  f.db.beforeRun = async statement => {
    if (injected || !statement.query.includes('INSERT OR IGNORE INTO telegram_pet_system_events') || !statement.args.includes('event_chain')) return;
    injected = true;
    t.mock.timers.tick(2000);
    const nextDay = await f.act({ action: 'event_chain', chain_key: 'lost_delivery_drone', request_id: 'next-day-story-click' });
    assert.equal(nextDay.accepted, true);
    assert.equal(nextDay.reason, 'event_chain_advanced');
  };
  const delayed = await f.act({ action: 'event_chain', chain_key: 'lost_delivery_drone', request_id: 'previous-day-story-click' });
  assert.equal(injected, true);
  assert.equal(delayed.accepted, false, 'a stale unsaved choice must not become a second paid copy of the same scene');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_event_chain'").get(f.owner).n, 1);
  assert.equal(f.sql.prepare('SELECT step_index FROM telegram_pet_event_chain_progress WHERE pet_id=?').get(petId).step_index, 1);
});

test('a delayed District checkpoint cannot award the same boss twice across midnight', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 23, 59, 59) });
  const f = fixture('district-midnight-reservation-race-3'), petId = 'current-' + f.owner;
  f.sql.prepare(`INSERT INTO telegram_pet_live_progression_state (pet_id,telegram_id,season_key,region_mastery_json)
    VALUES (?,?,?,'{"moon_alley":90}')`).run(petId, f.owner, currentSeason);
  let injected = false;
  f.db.beforeRun = async statement => {
    if (injected || !statement.query.includes('INSERT OR IGNORE INTO telegram_pet_system_events') || !statement.args.includes('district')) return;
    injected = true;
    t.mock.timers.tick(2000);
    const nextDay = await f.act({ action: 'district_mission', region_key: 'moon_alley', approach_key: 'careful', request_id: 'next-day-checkpoint' });
    assert.equal(nextDay.reason, 'district_boss_defeated');
  };
  const delayed = await f.act({ action: 'district_mission', region_key: 'moon_alley', approach_key: 'careful', request_id: 'previous-day-checkpoint' });
  assert.equal(injected, true);
  assert.equal(delayed.accepted, false, 'the already crossed mastery checkpoint cannot pay another frozen boss reward');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_district'").get(f.owner).n, 1);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(petId).energy, 90);
  assert.equal(JSON.parse(f.sql.prepare('SELECT region_mastery_json FROM telegram_pet_live_progression_state WHERE pet_id=?').get(petId).region_mastery_json).moon_alley, 110);
});

for (const pending of [false, true]) test(`a next-day story reservation rechecks an earlier ${pending ? 'pending' : 'completed'} scene`, async t => {
  const oldNow = new Date(Date.UTC(2026, 8, 26, 23, 59, 59));
  t.mock.timers.enable({ apis: ['Date'], now: oldNow.getTime() + 2000 });
  const f = fixture('story-earlier-reservation-' + pending), petId = 'current-' + f.owner;
  const pet = f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(petId);
  let injected = false;
  f.db.beforeRun = async statement => {
    if (injected || !statement.query.includes('INSERT OR IGNORE INTO telegram_pet_system_events') || !statement.args.includes('event_chain')) return;
    injected = true;
    const earlier = await processPetEventChain(f.db, f.owner, 'lost_delivery_drone',
      pending ? () => ({ accepted: false, reason: 'reward_offline' }) : args => hooks.awardPetReward(f.db, args),
      null, undefined, pet, null, oldNow);
    assert.equal(earlier.accepted, true);
    assert.equal(Boolean(earlier.reward_pending), pending);
  };
  const later = await f.act({ action: 'event_chain', chain_key: 'lost_delivery_drone', request_id: 'next-day-choice' });
  assert.equal(injected, true);
  assert.equal(later.accepted, false, 'a fresh reservation must recheck saved source order and current scene');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='event_chain'").get().n, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_event_chain'").get(f.owner).n, pending ? 0 : 1);
});
