import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { recordMoonpetBiggestReward } from '../workers/moonboys-api/pets/moonpet-identity.js';

const currentSeason = hooks.getPetSeasonInfo(new Date()).key;
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
  for (const migration of ['058_telegram_pet_season_completion.sql','061_moonpet_season_economy_calibration.sql']) sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/'+migration, import.meta.url),'utf8'));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { db.statementCount++; if (db.beforeFirst) { const response = await db.beforeFirst(this); if (response !== undefined) return response; } return sql.prepare(this.query).get(...this.args) || null; }
    async all() { db.statementCount++; if (db.beforeAll) { const response = await db.beforeAll(this); if (response !== undefined) return response; } return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      db.statementCount++;
      if (sql.prepare(this.query).columns().length && !/\bRETURNING\b/i.test(this.query)) return { results: sql.prepare(this.query).all(...this.args), meta: { changes: 0 } };
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) await db.beforeRun(this); return this.exec(); }
  }
  const db = { statementCount: 0, beforeBatch: null, beforeRun: null, prepare(query) { return new Statement(query); }, async batch(statements) {
    for (const statement of statements) {
      if (/^\s*SELECT\b/i.test(statement.query)) {
        if (this.beforeFirst) { const reply = await this.beforeFirst(statement); if (reply?.success === false) throw Error('pet_state_read_unavailable'); }
        if (this.beforeAll) { const reply = await this.beforeAll(statement); if (reply?.success === false) throw Error('pet_state_read_unavailable'); }
      } else if (this.beforeRun) await this.beforeRun(statement);
    }
    if (this.beforeBatch) await this.beforeBatch(statements);
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
  pet('current-' + owner, currentSeason, 10000);
  sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=10000 WHERE telegram_id=?').run(owner);
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

for (const system of ['arena', 'kaiju']) for (const kind of ['match', 'queue', 'position', 'result']) {
  for (const failure of ['thrown', 'resolved', 'malformed']) test(`${system} ${kind}: ${failure} read rejects incomplete state and healthy refresh restores it`, async () => {
    const f = fixture(`${system}-${kind}-${failure}`);
    const table = `telegram_pet_${system}_${system === 'arena' ? 'battles' : 'matches'}`;
    const queued = kind === 'queue' || kind === 'position';
    assert.equal((await f.act({ action: `${system}_${queued ? 'matchmake' : 'start'}` })).accepted, true);
    if (kind === 'result') f.sql.prepare(`UPDATE ${table} SET status='completed',result='draw',completed_at=CURRENT_TIMESTAMP`).run();
    const before = await f.state();
    const saved = f.sql.prepare(`SELECT * FROM ${queued ? `telegram_pet_${system}_queue` : table}`).get();
    let intercepted = 0;
    f.db.beforeFirst = ({ query }) => {
      const target = kind === 'match' ? query.includes(`SELECT * FROM ${table}`) && query.includes('ORDER BY created_at DESC')
        : kind === 'result' ? query.includes(`SELECT * FROM ${table} WHERE status='completed'`)
        : kind === 'position' ? query.includes(`SELECT COUNT(*) AS count FROM telegram_pet_${system}_queue`)
        : query.includes(system === 'arena' ? 'SELECT rank_bucket, accept_any_rank, created_at' : 'SELECT queued_at FROM telegram_pet_kaiju_queue');
      if (!target) return;
      intercepted++;
      if (failure === 'thrown') throw Error('combat_fixture_read_failed');
      return failure === 'resolved' ? { success: false, error: 'combat_fixture_read_failed' } : { success: true };
    };
    await assert.rejects(f.state(), /combat_fixture_read_failed|pet_state_read_unavailable/);
    assert.ok(intercepted > 0, 'the intended read failed');
    assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${queued ? `telegram_pet_${system}_queue` : table} WHERE id=?`).get(saved.id).n, 1);
    f.db.beforeFirst = null;
    const recovered = await f.state();
    const projection = (state) => system === 'arena'
      ? queued ? state.arena_queue : kind === 'result' ? state.arena_result : state.arena
      : queued ? state.kaiju.queue : kind === 'result' ? state.kaiju.result : state.kaiju.match;
    assert.deepEqual(projection(recovered), projection(before));
    f.sql.close();
  });
}

test('successful empty combat reads remain empty and do not invent a battle', async () => {
  const f = fixture('empty-combat');
  const state = await f.state();
  assert.equal(state.arena, null); assert.equal(state.arena_queue, null);
  assert.equal(state.kaiju.match, null); assert.equal(state.kaiju.queue, null);
  f.sql.close();
});

test('Arena failed direct action lookup leaves the saved battle and reward unchanged', async () => {
  const f = fixture('arena-action-read');
  const start = await f.act({ action: 'arena_start' });
  const id = start.battle.battle_id;
  f.db.beforeFirst = ({ query }) => query.includes('SELECT * FROM telegram_pet_arena_battles WHERE battle_id = ?')
    ? { success: false, error: 'battle_read_failed' } : undefined;
  await assert.rejects(f.act({ action: 'arena_forfeit', battle_id: id }), /pet_state_read_unavailable/);
  assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_arena_battles WHERE battle_id=?').get(id).status, 'active');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_arena'").get().n, 0);
  f.db.beforeFirst = null;
  assert.equal((await f.act({ action: 'arena_forfeit', battle_id: id })).accepted, true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_arena'").get().n, 1);
  f.sql.close();
});

test('Arena failed faction evidence cannot settle a reduced payout on recovery', async () => {
  const f = fixture('arena-faction-read');
  const start = await f.act({ action: 'arena_start' });
  f.sql.prepare("UPDATE telegram_pet_arena_battles SET status='completed',result='player1_win',completed_at=CURRENT_TIMESTAMP WHERE battle_id=?").run(start.battle.battle_id);
  f.db.beforeFirst = ({ query }) => query.includes('SELECT faction FROM blocktopia_progression')
    ? { success: false, error: 'faction_read_failed' } : undefined;
  await assert.rejects(f.act({ action: 'arena_forfeit', battle_id: start.battle.battle_id }), /pet_state_read_unavailable/);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_arena'").get().n, 0);
  f.db.beforeFirst = null;
  assert.equal((await f.act({ action: 'arena_forfeit', battle_id: start.battle.battle_id })).accepted, true);
  f.sql.close();
});

for (const system of ['arena', 'kaiju']) test(`${system}: interrupted Q3 ending pays Q3 competition XP once after rollover and keeps its existing cap window`, async () => {
  const f = fixture(`${system}-quarter-retry`);
  await f.state();
  const pet = await hooks.getPetProfile(f.db, f.owner);
  const now = new Date('2026-10-01T00:00:01.000Z');
  const completedAt = '2026-09-30 23:59:59';
  let match;
  if (system === 'arena') {
    const started = await f.act({ action: 'arena_start' });
    f.sql.prepare("UPDATE telegram_pet_arena_battles SET status='completed',result='player1_win',completed_at=? WHERE battle_id=?").run(completedAt, started.battle.battle_id);
    match = { ...f.sql.prepare('SELECT * FROM telegram_pet_arena_battles WHERE battle_id=?').get(started.battle.battle_id), match_id: started.battle.battle_id, mode: 'pet_arena' };
  } else {
    match = { match_id: 'kaiju-quarter-retry', mode: 'solo', completed_at: completedAt,
      score_json: JSON.stringify({ reward_sources: { [f.owner]: { pet_id: pet.pet_id, season_key: pet.season_key, equipment_snapshot: {} } } }) };
  }
  const source = `pet_${system}`, eventType = `${system}_battle`;
  f.sql.prepare(`INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status)
    VALUES (?,?,?,'care','cap-before-recovery',1195,?,'2026-10-01','2026-W40','accepted')`).run('cap-' + system, pet.pet_id, f.owner, pet.season_key);
  const args = [f.db, f.owner, match, `${system}_win`, { pet_xp: 34, community_xp: 7, moon_gold: 20 }, { now }];
  f.sql.exec(`CREATE TRIGGER fail_combat_payout BEFORE INSERT ON telegram_pet_reward_claims WHEN NEW.source='${source}' BEGIN SELECT RAISE(ABORT,'whole_payout_rollback'); END`);
  await assert.rejects(hooks.awardPetKaijuPlayerResult(...args), /whole_payout_rollback/);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(pet.pet_id).pet_xp, pet.pet_xp);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source=?').get(source).n, 0);
  f.sql.exec('DROP TRIGGER fail_combat_payout');
  f.pet('replacement-' + system, currentSeason, 200, 2);
  f.active('replacement-' + system);
  const concurrent = await Promise.all([hooks.awardPetKaijuPlayerResult(...args), hooks.awardPetKaijuPlayerResult(...args)]);
  const paid = concurrent.find((result) => !result.duplicate);
  assert.equal(paid.accepted, true);
  assert.equal(concurrent.filter((result) => result.duplicate).length, 1);
  const receipt = f.sql.prepare('SELECT * FROM telegram_pet_events WHERE event_type=? AND status=\'accepted\'').get(eventType);
  assert.equal(receipt.day_key, system === 'arena' ? '2026-10-01' : '2026-09-30');
  assert.equal(receipt.pet_xp_awarded, system === 'arena' ? 5 : 34);
  assert.equal(receipt.pet_id, pet.pet_id); assert.equal(receipt.season_key, pet.season_key);
  assert.equal(f.sql.prepare("SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key='pet-s2026-003'").get(f.owner).season_xp, receipt.pet_xp_awarded);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_season_state WHERE telegram_id=? AND season_key='pet-s2026-004' AND season_xp>0").get(f.owner).n, 0);
  const before = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(pet.pet_id).pet_xp;
  const replay = await hooks.awardPetKaijuPlayerResult(...args);
  assert.equal(replay.duplicate, true);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(pet.pet_id).pet_xp, before);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('replacement-' + system).pet_xp, 200);
  assert.equal(f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner).pet_id, 'replacement-' + system);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source=?').get(source).n, 1);
  f.sql.close();
});

test('Arena new attribution rule preserves an already paid historical settlement-quarter receipt', async () => {
  const f = fixture('arena-paid-history');
  const start = await f.act({ action: 'arena_start' });
  const pet = await hooks.getPetProfile(f.db, f.owner);
  const now = new Date('2026-10-01T00:00:01.000Z');
  f.sql.prepare("UPDATE telegram_pet_arena_battles SET status='completed',result='player1_win',completed_at='2026-09-30 23:59:59' WHERE battle_id=?").run(start.battle.battle_id);
  const eventKey = `pet_arena:${start.battle.battle_id}:${f.owner}`;
  const historical = await hooks.awardPetReward(f.db, { telegram_id: f.owner, pet_id: pet.pet_id, season_key: pet.season_key,
    source: 'pet_arena', idempotency_key: eventKey, event_key: eventKey, event_type: 'arena_battle', reason: 'arena_win',
    rewards: { pet_xp: 34, moon_gold: 20 }, now, context: { match_id: start.battle.battle_id } });
  assert.equal(historical.accepted, true);
  const saved = f.sql.prepare('SELECT * FROM telegram_pet_events WHERE event_key=?').get(eventKey);
  const match = { ...f.sql.prepare('SELECT * FROM telegram_pet_arena_battles WHERE battle_id=?').get(start.battle.battle_id), match_id: start.battle.battle_id, mode: 'pet_arena' };
  const result = await hooks.awardPetKaijuPlayerResult(f.db, f.owner, match, 'arena_win', { pet_xp: 34, moon_gold: 20 }, { now });
  assert.equal(result.accepted, true); assert.equal(result.duplicate, true);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_events WHERE event_key=?').get(eventKey), saved);
  assert.equal(f.sql.prepare("SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key='pet-s2026-004'").get(f.owner).season_xp, 34);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_season_state WHERE telegram_id=? AND season_key='pet-s2026-003'").get(f.owner).n, 0);
  f.sql.close();
});

test('Arena competition quarter override must match its saved ending and participant', async () => {
  const f = fixture('arena-quarter-tamper');
  const started = await f.act({ action: 'arena_start' });
  const pet = await hooks.getPetProfile(f.db, f.owner);
  f.sql.prepare("UPDATE telegram_pet_arena_battles SET status='completed',result='player1_win',completed_at='2026-09-30 23:59:59' WHERE battle_id=?").run(started.battle.battle_id);
  const result = await hooks.awardPetReward(f.db, {
    telegram_id: f.owner, pet_id: pet.pet_id, season_key: pet.season_key,
    source: 'pet_arena', idempotency_key: 'forged-quarter', event_key: 'forged-quarter',
    rewards: { pet_xp: 34 }, context: { match_id: started.battle.battle_id, competition_earned_at: '2026-10-01T00:00:01.000Z' },
  });
  assert.equal(result.accepted, false);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_arena'").get().n, 0);
  f.sql.close();
});

for (const system of ['arena', 'kaiju']) test(`${system}: first payout recovered from a replayed ending is displayed as new delivery, then a retry displays zero`, async () => {
  const f = fixture(`${system}-recovered-feedback`);
  const start = await f.act({ action: `${system}_start` });
  let request;
  if (system === 'arena') {
    f.sql.prepare('UPDATE telegram_pet_arena_battles SET max_rounds=1 WHERE battle_id=?').run(start.battle.battle_id);
    request = { action: 'arena_move', battle_id: start.battle.battle_id, expected_round: 1, move: 'ab' };
  } else request = { action: 'kaiju_card', match_id: start.match.match_id, card_key: hooks.PET_KAIJU_CARDS[0].id };
  f.sql.exec(`CREATE TRIGGER fail_feedback_payout BEFORE INSERT ON telegram_pet_reward_claims WHEN NEW.source='pet_${system}' BEGIN SELECT RAISE(ABORT,'feedback_payout_rollback'); END`);
  await assert.rejects(f.act(request), /feedback_payout_rollback/);
  assert.equal(f.sql.prepare(`SELECT status FROM telegram_pet_${system}_${system === 'arena' ? 'battles' : 'matches'}`).get().status, 'completed');
  const before = f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold;
  f.sql.exec('DROP TRIGGER fail_feedback_payout');
  const first = await f.act(request);
  assert.equal(first.ending_replayed, true);
  assert.equal(first.duplicate, false);
  const delivered = hooks.serializePetMiniAppActionResult(first, null, f.owner);
  const after = f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold;
  assert.ok(delivered.rewards.moon_gold > 0);
  assert.equal(delivered.rewards.moon_gold, after - before);
  assert.ok(delivered.pet_xp_awarded > 0);
  assert.equal(delivered.duplicate, false);
  const replay = hooks.serializePetMiniAppActionResult(await f.act(request), null, f.owner);
  assert.equal(replay.duplicate, true);
  assert.deepEqual(replay.rewards, {});
  assert.equal(replay.pet_xp_awarded, 0);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold, after);
  const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
  const snippet = client.slice(client.indexOf('// TEST-EXPORT: actionResultFeedback:start'), client.indexOf('// TEST-EXPORT: actionResultFeedback:end'));
  for (const result of [delivered, replay]) {
    const context = vm.createContext({ number: String, words: value => String(value).replaceAll('_', ' '), result });
    vm.runInContext(snippet + '; globalThis.feedback=resultMessage(result,null,null);', context);
    if (result.duplicate) { assert.match(context.feedback, /DUPLICATE BLOCKED/); assert.doesNotMatch(context.feedback, /\+\d/); }
    else { assert.match(context.feedback, /\+\d+ PET XP/); assert.match(context.feedback, /\+\d+ moon gold/i); assert.doesNotMatch(context.feedback, /DUPLICATE BLOCKED/); }
  }
  f.sql.close();
});
