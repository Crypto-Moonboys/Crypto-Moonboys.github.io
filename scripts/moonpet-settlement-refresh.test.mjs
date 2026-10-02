import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { getActiveSeasonalBoss, recoverPetLiveSystemEndings } from '../workers/moonboys-api/pets/live-systems.js';

// Exercise the real dispatcher and real switch handler on either side of the
// durable mutation. A saved spend/evolution must never turn into a rejection.
function fixture(action) {
  const owner = 'settlement-' + action;
  const season = hooks.getPetSeasonInfo(new Date()).key;
  const source = owner + '-source', other = owner + '-other';
  const sql = new DatabaseSync(':memory:');
  for (const file of ['schema.sql', 'migrations/048_telegram_pet_player_expansion.sql',
    'migrations/058_telegram_pet_season_completion.sql', 'migrations/061_moonpet_season_economy_calibration.sql']) {
    sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/' + file, import.meta.url), 'utf8'));
  }
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      const prepared = sql.prepare(this.query);
      if (prepared.columns().length) {
        const results = prepared.all(...this.args);
        return { results, meta: { changes: /\bRETURNING\b/i.test(this.query) ? results.length : 0 } };
      }
      return { results: [], meta: { changes: Number(prepared.run(...this.args).changes) } };
    }
    async run() {
      if (db.beforeRun) await db.beforeRun(this);
      const result = this.exec();
      if (db.afterRun) await db.afterRun(this);
      return result;
    }
  }
  const db = { prepare(query) { return new Statement(query); }, async batch(statements) {
    if (this.beforeBatch) await this.beforeBatch(statements);
    sql.exec('BEGIN');
    let results;
    try { results = statements.map(statement => statement.exec()); sql.exec('COMMIT'); }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
    if (this.afterBatch) await this.afterBatch(statements);
    return results;
  } };
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, owner);
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,energy,moon_gold) VALUES (?,2000,100,1000)').run(owner);
  for (const [id, slot] of [[source, 1], [other, 2]]) {
    sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type,journey_clock) VALUES (?,?,?,?,'free','created_at')").run(id, owner, season, slot);
    sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at) VALUES (?,?,?,?,2000,100,'0001-01-01 00:00:00')").run(id, owner, season, slot);
    const phase = id === source && ['incubate', 'hatch'].includes(action) ? 'egg' : action === 'rare_morph' && id === source ? 'adult' : 'young';
    sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json,rare_route_index) VALUES (?,?,?,?,?,'{}','[]',0)").run(id, owner, id, phase, phase === 'egg' ? null : 'vinyl_crab');
  }
  sql.prepare('INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner, source, season);
  if (action === 'hatch') sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET created_at=datetime('now','-14 days') WHERE pet_id=?").run(source);
  if (action === 'rare_morph') {
    sql.prepare('INSERT INTO telegram_pet_memories (pet_id,telegram_id,season_key,exploration_actions,total_runs) VALUES (?,?,?,30,10)').run(source, owner, season);
    for (const trait of ['explorer', 'curious']) sql.prepare('INSERT INTO telegram_pet_personality_traits (pet_id,telegram_id,season_key,trait_id,unlocked_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)').run(source, owner, season, trait);
    sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,'legendary_moon_guardian',5,'qualified')").run(source, owner);
  }
  const body = { action, displayed_pet_id: source, pet_id: source, move: 'strike', care_type: 'warm',
    region_key: 'moon_alley', approach_key: 'careful', chain_key: 'lost_delivery_drone', request_id: 'settlement-request' };
  const act = () => hooks.processPetMiniAppAction(db, owner, { id: owner }, body, 'fixture-token');
  const isSettlement = statements => statements.some(statement => {
    if (action === 'weekly_boss') return statement.query.includes('INSERT OR IGNORE INTO telegram_pet_weekly_boss_events');
    return statement.query.includes('INSERT OR IGNORE INTO telegram_pet_lifecycle_events_by_pet')
      && (statement.args.includes(action === 'incubate' ? 'incubate_warm' : action) || statement.query.includes("'" + action + "'"));
  });
  const readOther = () => ({
    ...sql.prepare('SELECT pet_xp,energy,stage FROM telegram_pet_instances WHERE pet_id=?').get(other),
    ...sql.prepare('SELECT phase,incubation_progress,rare_morph_id FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?').get(other),
  });
  return { sql, db, owner, source, other, season, act, body, isSettlement, readOther };
}

for (const action of ['district_mission', 'event_chain']) {
  test(`${action}: a switch before its settlement claim rejects without a cost or award`, async () => {
    const f = fixture(action), beforeOther = f.readOther();
    let switched;
    f.db.beforeBatch = async statements => {
      if (!statements.some(s => s.query.includes("SET status='settling', payload_json=json_set"))) return;
      f.db.beforeBatch = null;
      switched = await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.other);
    };
    const result = await f.act();
    assert.equal(switched?.accepted, true);
    assert.equal(result.accepted, false); assert.equal(result.reason, 'displayed_pet_changed'); assert.equal(result.refresh_state, true);
    assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.source).energy, 100);
    assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.source).pet_xp, 2000);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE pet_id=?').get(f.source).n, 0);
    assert.deepEqual(f.readOther(), beforeOther);
  });

  test(`${action}: a switch after claiming the saved decision preserves source-bound recovery`, async () => {
    const f = fixture(action), beforeOther = f.readOther();
    let switched;
    const switchAfterClaim = async () => {
      f.db.afterBatch = null; f.db.afterRun = null;
      switched = await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.other);
    };
    if (action === 'district_mission') {
      f.db.afterBatch = async statements => {
        if (statements.some(s => s.query.includes('UPDATE telegram_pet_instances SET energy=energy-?'))) await switchAfterClaim();
      };
    } else {
      // The scoped no-cost claim commits in its guard transaction before the
      // next frozen-decision read.
      f.db.afterBatch = async statements => {
        if (statements.some(s => s.query.includes("SET status='settling', payload_json=json_set"))) await switchAfterClaim();
      };
    }
    const result = await f.act();
    assert.equal(switched?.accepted, true);
    assert.equal(result.accepted, true, JSON.stringify(result));
    assert.equal(result.refresh_state, true); assert.equal(result.reward_pending, true);
    const saved = f.sql.prepare('SELECT * FROM telegram_pet_system_events WHERE telegram_id=? AND system_key=?').get(f.owner, action === 'district_mission' ? 'district' : 'event_chain');
    assert.ok(JSON.parse(saved.payload_json).decision);
    const energy = action === 'district_mission' ? 90 : 100;
    assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.source).energy, energy);
    assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.source).pet_xp, 2000);
    assert.deepEqual(f.readOther(), beforeOther);
    f.sql.prepare("UPDATE telegram_pet_system_events SET updated_at='2000-01-01 00:00:00' WHERE id=?").run(saved.id);
    await recoverPetLiveSystemEndings(f.db, f.owner, args => hooks.awardPetReward(f.db, args));
    assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE id=?').get(saved.id).status, 'completed');
    assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.source).energy, energy);
    assert.ok(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.source).pet_xp > 2000);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE pet_id=?').get(f.source).n, 1);
    assert.deepEqual(f.readOther(), beforeOther);
  });

  test(`${action}: switching after payout retains the exact receipt and recovers original progress once`, async () => {
    const f = fixture(action), beforeOther = f.readOther();
    const source = action === 'district_mission' ? 'pet_district' : 'pet_event_chain';
    let switched;
    f.db.afterBatch = async statements => {
      if (!statements.some(s => s.query.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims') && s.args.includes(source))) return;
      f.db.afterBatch = null;
      switched = await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.other);
    };
    const result = await f.act();
    assert.equal(switched?.accepted, true);
    assert.equal(result.accepted, true, JSON.stringify(result));
    assert.equal(result.refresh_state, true);
    assert.equal(result.reward_pending, true, 'the receipt paid, while progress completion still needs repair');
    const receipt = f.sql.prepare('SELECT * FROM telegram_pet_reward_claims WHERE telegram_id=? AND source=?').get(f.owner, source);
    const paid = JSON.parse(receipt.applied_rewards);
    assert.equal(result.claim_id, receipt.claim_id);
    assert.equal(result.pet_xp_awarded, paid.pet_xp);
    assert.equal(result.rewards.pet_xp, paid.pet_xp);
    assert.equal(result.rewards.moon_gold, paid.moon_gold);
    const saved = f.sql.prepare('SELECT * FROM telegram_pet_system_events WHERE telegram_id=? AND system_key=?').get(f.owner, action === 'district_mission' ? 'district' : 'event_chain');
    const decision = JSON.parse(saved.payload_json).decision;
    assert.ok(decision, 'the exact decision remains available for source-bound recovery');
    const xp = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.source).pet_xp;
    const energy = action === 'district_mission' ? 90 : 100;
    assert.equal(xp, 2000 + paid.pet_xp);
    assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.source).energy, energy);
    assert.deepEqual(f.readOther(), beforeOther);
    f.sql.prepare("UPDATE telegram_pet_system_events SET updated_at='2000-01-01 00:00:00' WHERE id=?").run(saved.id);
    await recoverPetLiveSystemEndings(f.db, f.owner, args => hooks.awardPetReward(f.db, args));
    assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE id=?').get(saved.id).status, 'completed');
    if (action === 'district_mission') {
      const progress = f.sql.prepare('SELECT region_mastery_json FROM telegram_pet_live_progression_state WHERE pet_id=?').get(f.source);
      assert.equal(JSON.parse(progress.region_mastery_json).moon_alley, decision.masteryGain);
    } else assert.equal(f.sql.prepare('SELECT step_index FROM telegram_pet_event_chain_progress WHERE pet_id=?').get(f.source).step_index, 1);
    assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.source).pet_xp, xp);
    assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.source).energy, energy);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source=?').get(f.owner, source).n, 1);
    assert.deepEqual(f.readOther(), beforeOther);
    assert.equal((await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.source)).accepted, true);
    const retry = await f.act();
    assert.equal(retry.accepted, true); assert.equal(retry.duplicate, true);
    assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.source).pet_xp, xp);
  });

  test(`${action}: losing the completion claim after payout retains success and can recover`, async () => {
    const f = fixture(action);
    const source = action === 'district_mission' ? 'pet_district' : 'pet_event_chain';
    f.db.afterBatch = async statements => {
      if (!statements.some(s => s.query.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims') && s.args.includes(source))) return;
      f.db.afterBatch = null;
      f.sql.prepare("UPDATE telegram_pet_system_events SET status='rejected',payload_json=json_remove(payload_json,'$.claim_token') WHERE telegram_id=?").run(f.owner);
    };
    const result = await f.act();
    assert.equal(result.accepted, true, JSON.stringify(result));
    assert.equal(result.reward_pending, true); assert.equal(result.refresh_state, true);
    const xp = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.source).pet_xp;
    assert.equal(result.pet_xp_awarded, xp - 2000);
    f.sql.prepare("UPDATE telegram_pet_system_events SET updated_at='2000-01-01 00:00:00' WHERE telegram_id=?").run(f.owner);
    await recoverPetLiveSystemEndings(f.db, f.owner, args => hooks.awardPetReward(f.db, args));
    assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_system_events WHERE telegram_id=?').get(f.owner).status, 'completed');
    assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.source).pet_xp, xp);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE pet_id=?').get(f.source).n, 1);
  });
}

test('a charged seasonal raid decision recovers once after switching before its damage write', async () => {
  const f = fixture('seasonal_boss'), beforeOther = f.readOther(), boss = getActiveSeasonalBoss();
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=400000 WHERE pet_id=?').run(f.source);
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=400000 WHERE telegram_id=?').run(f.owner);
  f.sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress (pet_id,telegram_id,pet_season_key,season_key,boss_key,damage)
    VALUES (?,?,?,?,?,?)`).run(f.source, f.owner, f.season, boss.season_instance, boss.key, boss.hp - 1);
  let switched;
  f.db.afterBatch = async statements => {
    if (!statements.some(s => s.query.includes('UPDATE telegram_pet_instances SET energy=energy-?'))) return;
    f.db.afterBatch = null;
    switched = await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.other);
  };
  const result = await f.act();
  assert.equal(switched?.accepted, true);
  assert.equal(result.accepted, true, JSON.stringify(result));
  assert.equal(result.refresh_state, true); assert.equal(result.reward_pending, true);
  assert.equal(f.sql.prepare('SELECT damage FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get(f.source).damage, boss.hp - 1);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.source).energy, 82);
  assert.deepEqual(f.readOther(), beforeOther);
  f.sql.prepare("UPDATE telegram_pet_system_events SET updated_at='2000-01-01 00:00:00' WHERE telegram_id=?").run(f.owner);
  await recoverPetLiveSystemEndings(f.db, f.owner, args => hooks.awardPetReward(f.db, args));
  const saved = f.sql.prepare('SELECT damage,defeated_at,reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get(f.source);
  assert.equal(saved.damage, boss.hp); assert.ok(saved.defeated_at); assert.ok(saved.reward_claimed_at);
  const xp = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.source).pet_xp;
  assert.equal(xp, 400150);
  await recoverPetLiveSystemEndings(f.db, f.owner, args => hooks.awardPetReward(f.db, args));
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.source).pet_xp, xp);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.source).energy, 82);
  assert.deepEqual(f.readOther(), beforeOther);
});

test('a seasonal raid hit stays accepted after a switch and its original victory pays once', async () => {
  const f = fixture('seasonal_boss'), beforeOther = f.readOther(), boss = getActiveSeasonalBoss();
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=400000 WHERE pet_id=?').run(f.source);
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=400000 WHERE telegram_id=?').run(f.owner);
  f.sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress (pet_id,telegram_id,pet_season_key,season_key,boss_key,damage)
    VALUES (?,?,?,?,?,?)`).run(f.source, f.owner, f.season, boss.season_instance, boss.key, boss.hp - 1);
  let switched;
  f.db.afterBatch = async statements => {
    if (!statements.some(s => s.query.includes('INSERT INTO telegram_pet_seasonal_boss_progress'))) return;
    f.db.afterBatch = null;
    switched = await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.other);
  };
  const result = await f.act();
  assert.equal(switched?.accepted, true);
  assert.equal(result.accepted, true, JSON.stringify(result));
  assert.equal(result.refresh_state, true); assert.equal(result.reward_pending, true);
  const saved = f.sql.prepare('SELECT * FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get(f.source);
  assert.equal(saved.damage, boss.hp); assert.ok(saved.defeated_at); assert.equal(saved.reward_claimed_at, null);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.source).energy, 82);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE pet_id=? AND system_key='seasonal_boss' AND status='completed'").get(f.source).n, 1);
  assert.deepEqual(f.readOther(), beforeOther);
  const claimBody = { action: 'seasonal_boss_claim', pet_id: f.source, boss_key: boss.key, season_instance: boss.season_instance };
  const claim = await hooks.processPetMiniAppAction(f.db, f.owner, { id: f.owner }, claimBody, 'fixture-token');
  assert.equal(claim.accepted, true, JSON.stringify(claim));
  assert.equal(claim.pet_xp_awarded, 150);
  assert.ok(f.sql.prepare('SELECT reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get(f.source).reward_claimed_at);
  assert.equal((await hooks.processPetMiniAppAction(f.db, f.owner, { id: f.owner }, claimBody, 'fixture-token')).duplicate, true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE pet_id=? AND source='pet_seasonal_boss'").get(f.source).n, 1);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.source).pet_xp, 400150);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.source).energy, 82);
  assert.deepEqual(f.readOther(), beforeOther);
});

test('a seasonal boss claim acknowledgement outage retains its paid receipt and a safe retry', async () => {
  const f = fixture('seasonal_boss_claim'), boss = getActiveSeasonalBoss();
  f.sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress (pet_id,telegram_id,pet_season_key,season_key,boss_key,damage,defeated_at)
    VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(f.source, f.owner, f.season, boss.season_instance, boss.key, boss.hp);
  Object.assign(f.body, { boss_key: boss.key, season_instance: boss.season_instance });
  f.db.beforeRun = statement => {
    if (!statement.query.includes('SET reward_claimed_at=COALESCE')) return;
    f.db.beforeRun = null;
    throw Error('claim_acknowledgement_unavailable');
  };
  const result = await f.act();
  assert.equal(result.accepted, true, JSON.stringify(result));
  assert.equal(result.refresh_state, true); assert.equal(result.reward_pending, true);
  assert.equal(result.pet_xp_awarded, 150);
  assert.equal(f.sql.prepare('SELECT reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get(f.source).reward_claimed_at, null);
  const xp = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.source).pet_xp;
  const retry = await f.act();
  assert.equal(retry.accepted, true); assert.equal(retry.duplicate, true); assert.equal(retry.reward_pending, false);
  assert.ok(f.sql.prepare('SELECT reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE pet_id=?').get(f.source).reward_claimed_at);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.source).pet_xp, xp);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE pet_id=? AND source='pet_seasonal_boss'").get(f.source).n, 1);
});

for (const action of ['arena_matchmake', 'kaiju_matchmake']) {
  test(`${action}: a switch after joining the queue preserves the accepted queue entry`, async () => {
    const f = fixture(action), beforeOther = f.readOther();
    const table = action === 'arena_matchmake' ? 'telegram_pet_arena_queue' : 'telegram_pet_kaiju_queue';
    f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=10000 WHERE pet_id=?').run(f.source);
    f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=10000 WHERE telegram_id=?').run(f.owner);
    let switched;
    f.db.afterBatch = async statements => {
      if (!statements.some(statement => /INSERT(?: OR IGNORE)? INTO/.test(statement.query) && statement.query.includes(table))) return;
      f.db.afterBatch = null;
      switched = await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.other);
    };
    const result = await f.act();
    assert.equal(switched?.accepted, true);
    assert.equal(result.accepted, true, JSON.stringify(result));
    assert.equal(result.refresh_state, true);
    assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table} WHERE telegram_id=? AND status='waiting'`).get(f.owner).n, 1);
    assert.deepEqual(f.readOther(), beforeOther);
  });
  test(`${action}: a switch before joining the queue rejects without adding a queue entry`, async () => {
    const f = fixture(action);
    const table = action === 'arena_matchmake' ? 'telegram_pet_arena_queue' : 'telegram_pet_kaiju_queue';
    f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=10000 WHERE pet_id=?').run(f.source);
    f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=10000 WHERE telegram_id=?').run(f.owner);
    let switched;
    f.db.beforeBatch = async statements => {
      if (!statements.some(statement => /INSERT(?: OR IGNORE)? INTO/.test(statement.query) && statement.query.includes(table))) return;
      f.db.beforeBatch = null;
      switched = await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.other);
    };
    const result = await f.act();
    assert.equal(switched?.accepted, true);
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'displayed_pet_changed');
    assert.equal(result.refresh_state, true);
    assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table} WHERE telegram_id=?`).get(f.owner).n, 0);
  });
}

for (const action of ['weekly_boss', 'incubate', 'hatch', 'rare_morph']) {
  test(`${action}: switch after settlement preserves success and refreshes, with one saved mutation`, async () => {
    const f = fixture(action), beforeOther = f.readOther();
    let switched;
    f.db.afterBatch = async statements => {
      if (!f.isSettlement(statements)) return;
      f.db.afterBatch = null;
      switched = await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.other);
    };
    const result = await f.act();
    assert.equal(switched?.accepted, true, 'use a real accepted concurrent slot switch');
    assert.equal(result.accepted, true, JSON.stringify(result));
    assert.equal(result.refresh_state, true, 'replace the old pet projection before another click');
    assert.deepEqual(f.readOther(), beforeOther, 'the switch cannot redirect the saved action to the other pet');
    if (action === 'weekly_boss') {
      assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.source).energy, 88);
      assert.equal(f.sql.prepare('SELECT attempts FROM telegram_pet_weekly_boss_progress WHERE telegram_id=?').get(f.owner).attempts, 1);
      assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE pet_id=? AND event_type='weekly_boss' AND status='accepted'").get(f.source).n, 1);
    } else {
      const lifecycle = f.sql.prepare('SELECT phase,incubation_progress,rare_morph_id FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?').get(f.source);
      assert.equal(lifecycle.phase, action === 'incubate' ? 'egg' : action === 'hatch' ? 'young' : 'rare');
      if (action === 'incubate') {
        assert.equal(lifecycle.incubation_progress, 2);
        assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_growth_marks WHERE pet_id=? AND milestone_type='incubation_care'").get(f.source).n, 1,
          'the earned Mark commits with care before any follow-up or same-key replay');
        assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_growth_marks WHERE pet_id=?').get(f.other).n, 0);
      }
      if (action === 'rare_morph') assert.equal(lifecycle.rare_morph_id, 'celestial_serpent');
      assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_lifecycle_events_by_pet WHERE pet_id=? AND action=? AND applied_at IS NOT NULL').get(f.source, action === 'incubate' ? 'incubate_warm' : action).n, 1);
    }
    assert.equal((await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.source)).accepted, true);
    const retry = await f.act();
    assert.equal(retry.accepted, true, 'the saved request can recover its follow-up without another mutation');
    assert.equal(retry.duplicate, true);
    if (action === 'weekly_boss') assert.equal(f.sql.prepare('SELECT attempts FROM telegram_pet_weekly_boss_progress WHERE telegram_id=?').get(f.owner).attempts, 1);
    else assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_lifecycle_events_by_pet WHERE pet_id=? AND action=? AND applied_at IS NOT NULL').get(f.source, action === 'incubate' ? 'incubate_warm' : action).n, 1);
    if (action === 'incubate') {
      assert.equal(f.sql.prepare('SELECT incubation_progress FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?').get(f.source).incubation_progress, 2);
      assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_growth_marks WHERE pet_id=? AND milestone_type=\'incubation_care\'').get(f.source).n, 1);
    }
  });

  test(`${action}: switch before settlement rejects with no saved mutation or cost`, async () => {
    const f = fixture(action), beforeOther = f.readOther();
    let switched;
    f.db.beforeBatch = async statements => {
      if (!f.isSettlement(statements)) return;
      f.db.beforeBatch = null;
      switched = await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.other);
    };
    const result = await f.act();
    assert.equal(switched?.accepted, true);
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'displayed_pet_changed');
    assert.equal(result.refresh_state, true);
    assert.deepEqual(f.readOther(), beforeOther);
    assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(f.source).energy, 100);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_boss_events WHERE telegram_id=?').get(f.owner).n, 0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_lifecycle_events_by_pet WHERE pet_id=?').get(f.source).n, 0);
  });
}

for (const action of ['incubate', 'hatch', 'rare_morph']) {
  test(`${action}: a projection outage after commit preserves success and safe retry`, async () => {
    const f = fixture(action);
    let failed = false;
    f.db.afterBatch = async statements => {
      if (!f.isSettlement(statements)) return;
      f.db.afterBatch = null;
      f.db.beforeBatch = later => {
        if (!later.some(statement => /^\s*SELECT\b/i.test(statement.query))) return;
        f.db.beforeBatch = null;
        failed = true;
        throw Error('saved_lifecycle_projection_unavailable');
      };
    };
    const result = await f.act();
    assert.equal(failed, true, 'fail a follow-up read after the actual mutation commits');
    assert.equal(result.accepted, true);
    assert.equal(result.refresh_state, true);
    assert.equal(JSON.stringify(result).includes('identity_seed'), false);
    const retry = await f.act();
    assert.equal(retry.accepted, true);
    assert.equal(retry.duplicate, true);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_lifecycle_events_by_pet WHERE pet_id=? AND action=? AND applied_at IS NOT NULL').get(f.source, action === 'incubate' ? 'incubate_warm' : action).n, 1);
    if (action === 'incubate') assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_growth_marks WHERE pet_id=? AND milestone_type='incubation_care'").get(f.source).n, 1);
  });
}
