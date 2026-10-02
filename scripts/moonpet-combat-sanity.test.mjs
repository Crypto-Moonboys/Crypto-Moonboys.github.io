import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
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
    async first() { db.statementCount++; if (db.beforeFirst) await db.beforeFirst(this); return sql.prepare(this.query).get(...this.args) || null; }
    async all() { db.statementCount++; if (db.beforeAll) await db.beforeAll(this); return { results: sql.prepare(this.query).all(...this.args) }; }
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

for (const system of ['arena','kaiju']) {
  const table = system === 'arena' ? 'telegram_pet_arena_battles' : 'telegram_pet_kaiju_matches';
  test(`${system}: a failed active-match read cannot start a second match`, async () => {
    const f = fixture(`guard-${system}`);
    const started = await f.act({action: `${system}_start`});
    assert.equal(started.accepted, true);
    f.db.beforeFirst = s => { if (s.query.includes(`SELECT * FROM ${table}`)) throw Error('match_read_unavailable'); };
    await assert.rejects(f.act({action: `${system}_start`}), /match_read_unavailable/);
    assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 1);
  });
  for (const kind of ['match','queue','result']) test(`${system}: ${kind} read failures preserve the previous Mini App snapshot`, async () => {
    const f = fixture(`snapshot-${system}-${kind}`);
    await f.state();
    const target = kind === 'queue' ? `telegram_pet_${system}_queue` : table;
    f.db.beforeFirst = s => {
      if (s.query.includes(target) && /SELECT/.test(s.query)
        && (kind !== 'result' || s.query.includes("status='completed'"))) throw Error('combat_board_unavailable');
    };
    await assert.rejects(f.state(), /combat_board_unavailable/);
    f.db.beforeFirst = null;
    assert.ok((await f.state()).pet);
  });
}

test('Kaiju queue write failure must not report that the player joined', async () => {
  const f = fixture('queue-write');
  f.db.beforeRun = s => { if (s.query.includes('INSERT OR IGNORE INTO telegram_pet_kaiju_queue')) throw Error('queue_write_unavailable'); };
  await assert.rejects(f.act({action:'kaiju_matchmake'}), /queue_write_unavailable/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_kaiju_queue').get().n, 0);
});

async function arenaFixture(owner) {
  const f = fixture(owner);
  const started = await f.act({action:'arena_start'});
  assert.equal(started.reason,'arena_started');
  f.id = started.battle.battle_id;
  f.move = () => f.act({action:'arena_move',battle_id:f.id,expected_round:1,move:'ab'});
  f.battle = () => f.sql.prepare('SELECT * FROM telegram_pet_arena_battles WHERE battle_id=?').get(f.id);
  f.round = () => f.sql.prepare('SELECT * FROM telegram_pet_arena_rounds WHERE battle_id=? AND round_number=1').get(f.id);
  return f;
}

for (const system of ['arena', 'kaiju']) for (const timing of ['waiting', 'claim', 'concurrent'])
test(`${system}: ${timing} matchmaking keeps its pet selected until the queue is cancelled`, async () => {
  const f = fixture(`switch-queue-${system}-${timing}`);
  f.pet('replacement-' + f.owner, currentSeason, 200, 2);
  const enqueue = async () => {
    assert.equal((await f.act({ action: `${system}_matchmake` })).reason, `${system}_queued`);
    if (timing === 'claim') f.sql.prepare(`UPDATE telegram_pet_${system}_queue SET status=?, updated_at='claim:test' WHERE telegram_id=?`)
      .run(system === 'arena' ? 'matched' : 'played', f.owner);
  };
  if (timing === 'concurrent') {
    f.db.beforeBatch = async statements => {
      if (!statements.some(s => s.query.includes('UPDATE telegram_pet_active_slots SET pet_id=?'))) return;
      f.db.beforeBatch = null;
      await enqueue();
    };
  } else await enqueue();
  const result = await hooks.switchActivePetSeasonSlot(f.db, f.owner, 'replacement-' + f.owner);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, `pet_${system}_queue_active`);
  assert.equal(f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner).pet_id, 'current-' + f.owner);
  const state = await f.state();
  assert.equal((system === 'arena' ? state.arena_queue : state.kaiju.queue).waiting, true, 'an interrupted claim remains visible with its cancellation control');
  assert.equal((await f.act({ action: `${system}_queue_cancel` })).accepted, true);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db, f.owner, 'replacement-' + f.owner)).accepted, true);
});

for (const system of ['arena', 'kaiju']) test(`${system}: cancelling a claimed opponent prevents a late match insert`, async () => {
  const f = fixture('claim-cancel-' + system), rival = 'rival-' + f.owner;
  f.sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(rival, 'Rival');
  f.sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,health,energy) VALUES (?,10000,100,100)').run(rival);
  await hooks.preparePetMiniAppState(f.db, rival, new Date());
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='young' WHERE telegram_id=?").run(rival);
  await dispatchRenderedPetAction(f.db, rival, { id: rival }, { action: `${system}_matchmake` }, 'fixture-token');
  const table = `telegram_pet_${system}_${system === 'arena' ? 'battles' : 'matches'}`;
  let cancelled = false;
  f.db.beforeRun = async s => {
    if (!s.query.includes(`INSERT INTO ${table}`)) return;
    f.db.beforeRun = null;
    const result = await dispatchRenderedPetAction(f.db, rival, { id: rival }, { action: `${system}_queue_cancel` }, 'fixture-token');
    assert.equal(result.accepted, true);
    cancelled = true;
  };
  const result = await f.act({ action: `${system}_matchmake` });
  assert.equal(cancelled, true);
  assert.equal(result.reason, `${system}_queued`);
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0, 'the cancelled claim cannot admit either pet to a match');
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM telegram_pet_${system}_queue WHERE telegram_id=? AND status='waiting'`).get(f.owner).n, 1);
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM telegram_pet_${system}_queue WHERE telegram_id=? AND (status='waiting' OR updated_at LIKE 'claim:%')`).get(rival).n, 0);
});

for (const missing of ['personality','biggest_reward']) test(`paid Arena ${missing} history recovers once for the original pet after confirmed deletion`, async () => {
  const f = await arenaFixture(`arena-paid-${missing}`);
  const sourcePet = `current-${f.owner}`;
  const identityWrite = missing === 'personality' ? 'INSERT OR IGNORE INTO telegram_pet_identity_events'
    : 'INSERT INTO telegram_pet_memories (pet_id, telegram_id, season_key, biggest_reward_amount, biggest_reward_currency)';
  f.db.beforeRun = statement => { if (statement.query.includes(identityWrite)) throw Error('arena_identity_outage'); };
  const result = await f.act({ action:'arena_forfeit', battle_id:f.id });
  assert.equal(result.accepted, true, 'a paid ending remains accepted when its history follow-up fails');
  assert.equal(result.refresh_state, true, 'the nested paid-history repair requirement reaches the action response');
  const paid = f.sql.prepare("SELECT * FROM telegram_pet_reward_claims WHERE source='pet_arena'").get();
  const receipt = f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='arena_battle'").get();
  assert.equal(paid.status, 'awarded');
  assert.equal(receipt.pet_id, sourcePet);
  const paidGold = JSON.parse(paid.applied_rewards).moon_gold;
  assert.ok(paidGold > 0);
  const sourceXp = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).pet_xp;
  f.db.beforeRun = null;
  const removed = await f.act({ action:'delete_pet_slot', pet_id:sourcePet, confirm_pet_id:sourcePet, confirmed:true });
  assert.equal(removed.accepted, true);
  assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).status, 'archived');
  const replacement = f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner).pet_id;
  assert.notEqual(replacement, sourcePet);
  await f.state();
  const memory = f.sql.prepare('SELECT * FROM telegram_pet_memories WHERE pet_id=?').get(sourcePet);
  assert.equal(memory.biggest_reward_amount, paidGold, 'a duplicate settlement uses its original applied assets');
  const personality = f.sql.prepare("SELECT * FROM telegram_pet_identity_events WHERE pet_id=? AND event_kind='personality' AND event_key=?").get(sourcePet, `${receipt.event_key}:personality`);
  assert.equal(personality.day_key, receipt.day_key);
  assert.ok(personality.applied_at);
  const progress = f.sql.prepare("SELECT progress FROM telegram_pet_personality_traits WHERE pet_id=? AND trait_id='street_fighter'").get(sourcePet).progress;
  let remainingCandidates = null;
  f.db.beforeAll = statement => {
    if (statement.query.includes('WITH candidates(kind,id,recovery_key)')) remainingCandidates = f.sql.prepare(statement.query).all(...statement.args);
  };
  await f.state();
  assert.deepEqual(remainingCandidates, [], 'a completely repaired paid source leaves the bounded queue');
  assert.equal(f.sql.prepare("SELECT progress FROM telegram_pet_personality_traits WHERE pet_id=? AND trait_id='street_fighter'").get(sourcePet).progress, progress);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_arena'").get().n, 1);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet).pet_xp, sourceXp);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(replacement).pet_xp, 0);
  for (const recoverSource of [false,true]) {
    const newHistory = await recordMoonpetBiggestReward(f.db, { telegram_id:f.owner, pet_id:sourcePet,
      season_key:currentSeason, reward_amount:999, reward_currency:'moon_gold', recover_source_event:recoverSource });
    assert.equal(newHistory.accepted, false, 'normal actions and a recovery flag without accepted source proof cannot authorize an archived pet');
  }
  assert.equal(f.sql.prepare('SELECT biggest_reward_amount FROM telegram_pet_memories WHERE pet_id=?').get(sourcePet).biggest_reward_amount, paidGold);
});

for (const invalid of ['null_receipt_pet','missing_battle_pet','malformed_paid_assets','unapplied_legacy_identity']) test(`paid Arena history recovery excludes ${invalid} source proof`, async () => {
  const f = await arenaFixture(`arena-history-${invalid}`);
  f.db.beforeRun = statement => { if (statement.query.includes('INSERT OR IGNORE INTO telegram_pet_identity_events')) throw Error('arena_identity_outage'); };
  assert.equal((await f.act({ action:'arena_forfeit', battle_id:f.id })).accepted, true);
  f.db.beforeRun = null;
  if (invalid === 'null_receipt_pet') f.sql.prepare("UPDATE telegram_pet_events SET pet_id=NULL WHERE event_type='arena_battle'").run();
  else if (invalid === 'missing_battle_pet') f.sql.prepare('UPDATE telegram_pet_arena_battles SET player1_pet_id=NULL WHERE battle_id=?').run(f.id);
  else if (invalid === 'malformed_paid_assets') f.sql.prepare("UPDATE telegram_pet_reward_claims SET applied_rewards='not-json' WHERE source='pet_arena'").run();
  else {
    const event = f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='arena_battle'").get();
    f.sql.prepare("INSERT INTO telegram_pet_identity_events (event_id,pet_id,telegram_id,season_key,event_key,event_kind) VALUES ('legacy-unapplied',?,?,?,?,'personality')")
      .run(event.pet_id,f.owner,event.season_key,`${event.event_key}:personality`);
  }
  const candidates = [];
  f.db.beforeAll = statement => {
    if (statement.query.includes('WITH candidates(kind,id,recovery_key)')) candidates.push(f.sql.prepare(statement.query).all(...statement.args));
  };
  await f.state(); await f.state();
  assert.deepEqual(candidates, [[],[]], 'an unprovable paid source cannot consume every refresh budget or guess the current pet');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_identity_events WHERE event_kind='personality' AND applied_at IS NOT NULL").get().n, 0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_arena'").get().n, 1);
});

test('Arena reports only its exact capped payout and zero new assets on a completed replay', async () => {
  const f = await arenaFixture('arena-exact-payout');
  const source = `current-${f.owner}`, today = new Date().toISOString().slice(0,10);
  f.sql.prepare(`INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status)
    VALUES ('cap-proof',?,?,'cap_fixture','cap-proof',1197,?,?,'cap-week','accepted')`).run(source,f.owner,currentSeason,today);
  const paid = await f.act({ action:'arena_forfeit', battle_id:f.id });
  assert.equal(paid.accepted, true);
  assert.equal(paid.rewards.player1.rewards.pet_xp, 3, 'the result must report the capped claim, not the configured ten XP');
  assert.equal(paid.rewards.player1.rewards.moon_gold, 3);
  const replay = await f.act({ action:'arena_forfeit', battle_id:f.id });
  assert.equal(replay.accepted, true);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.rewards.player1.rewards.pet_xp, 0);
  assert.equal(replay.rewards.player1.rewards.moon_gold, 0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_arena'").get().n, 1);
  assert.equal(f.sql.prepare('SELECT biggest_reward_amount FROM telegram_pet_memories WHERE pet_id=?').get(source).biggest_reward_amount, 3);
});

test('Arena retries a locked move after the CPU move write failed', async () => {
  const f = await arenaFixture('locked-cpu');
  f.db.beforeRun = s => { if(s.query.includes('SET player2_move=?')) throw Error('cpu_move_unavailable'); };
  await assert.rejects(f.move(), /cpu_move_unavailable/);
  assert.equal(f.round().player1_move,'ab');
  f.db.beforeRun = null;
  assert.equal((await f.move()).reason,'round_resolved');
  assert.equal(f.battle().current_round,2);
});

test('refresh repairs a locked Arena move so the UI can offer the next round', async () => {
  const f=await arenaFixture('locked-refresh');
  f.db.beforeRun=s=>{if(s.query.includes('SET player2_move=?'))throw Error('cpu_move_unavailable');};
  await assert.rejects(f.move(),/cpu_move_unavailable/);
  f.db.beforeRun=null;
  await f.state();
  assert.equal(f.battle().current_round,2);
  assert.equal(f.round().status,'resolved');
});

test('Arena round and battle progress commit together and retry exactly once', async () => {
  const f = await arenaFixture('atomic-round');
  f.sql.exec("CREATE TRIGGER fail_round_progress BEFORE UPDATE OF current_round ON telegram_pet_arena_battles BEGIN SELECT RAISE(ABORT,'round_progress_unavailable'); END");
  await assert.rejects(f.move(), /round_progress_unavailable/);
  assert.equal(f.round().status,'selecting','failed progress must not consume the round');
  assert.equal(f.battle().current_round,1);
  f.sql.exec('DROP TRIGGER fail_round_progress');
  assert.equal((await f.move()).reason,'round_resolved');
  const saved=f.battle();
  await f.move();
  assert.deepEqual(f.battle(),saved,'a replay cannot apply damage twice');
});

test('a delayed Arena round cannot overwrite a concurrently committed forfeit',async()=>{
  const f=await arenaFixture('arena-forfeit-race');
  f.db.beforeBatch=async statements=>{
    if(!statements.some(s=>s.query.includes('UPDATE telegram_pet_arena_rounds SET player1_damage')))return;
    f.db.beforeBatch=null;
    assert.equal((await f.act({action:'arena_forfeit',battle_id:f.id})).accepted,true);
  };
  await f.move();
  assert.equal(f.battle().status,'completed');
  assert.equal(f.battle().result,'player2_win');
  assert.equal(f.battle().player1_hp,0);
  const receipt=f.sql.prepare("SELECT reason FROM telegram_pet_events WHERE event_type='arena_battle'").get();
  assert.equal(receipt.reason,'arena_loss');
});

test('another owner cannot replay an Arena ending or receive its reward',async()=>{
  const f=await arenaFixture('arena-owner');
  const result=await dispatchRenderedPetAction(f.db,'intruder',{id:'intruder'},
    {action:'arena_forfeit',battle_id:f.id},'fixture-token');
  assert.equal(result.accepted,false);
  assert.equal(f.battle().status,'active');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='arena_battle'").get().n,0);
});

test('Arena completed-action retry repairs the primary reward without changing its source pet', async () => {
  const f = await arenaFixture('arena-reward');
  f.sql.prepare('UPDATE telegram_pet_arena_battles SET max_rounds=1 WHERE battle_id=?').run(f.id);
  f.sql.exec("CREATE TRIGGER fail_arena_reward BEFORE INSERT ON telegram_pet_reward_claims WHEN NEW.source='pet_arena' BEGIN SELECT RAISE(ABORT,'arena_reward_unavailable'); END");
  await assert.rejects(f.move(), /arena_reward_unavailable/);
  assert.equal(f.battle().status,'completed');
  f.sql.exec('DROP TRIGGER fail_arena_reward');
  f.pet('replacement',currentSeason,10000,2); f.active('replacement');
  assert.equal((await f.move()).accepted,true);
  const receipt=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='arena_battle'").get();
  assert.equal(receipt.pet_id,'current-'+f.owner);
  await f.move();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='arena_battle'").get().n,1);
});

test('refresh repairs an Arena payout and public leaderboard/activity reflect exactly one source receipt', async () => {
  const f = await arenaFixture('arena-refresh');
  f.sql.prepare('UPDATE telegram_pet_arena_battles SET max_rounds=1 WHERE battle_id=?').run(f.id);
  f.sql.exec("CREATE TRIGGER fail_arena_reward BEFORE INSERT ON telegram_pet_reward_claims WHEN NEW.source='pet_arena' BEGIN SELECT RAISE(ABORT,'arena_reward_unavailable'); END");
  await assert.rejects(f.move(), /arena_reward_unavailable/);
  f.sql.exec('DROP TRIGGER fail_arena_reward');
  f.pet('other-pet',currentSeason,200,2); f.active('other-pet');
  const before=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('current-'+f.owner).pet_xp;
  const state=await f.state();
  const source=f.sql.prepare("SELECT pet_id,pet_xp_awarded FROM telegram_pet_events WHERE event_type='arena_battle'").get();
  assert.equal(source.pet_id,'current-'+f.owner);
  assert.ok(source.pet_xp_awarded>0);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(source.pet_id).pet_xp,before+source.pet_xp_awarded);
  assert.equal(state.pet.pet_id,'other-pet');
  const publicBoard=await f.get('/telegram-pets/leaderboard?period=daily&limit=100');
  assert.equal(publicBoard.entries[0].pet_xp,source.pet_xp_awarded);
  const activity=await f.get('/telegram-pets/activity');
  assert.equal(activity.items.filter(row=>row.event_type==='arena_battle').length,1);
  assert.equal(activity.items.find(row=>row.event_type==='arena_battle').pet_xp_awarded,source.pet_xp_awarded);
  await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='arena_battle'").get().n,1);
});

test('Arena recovers a pre-upgrade resolved round from its saved outcome', async () => {
  const f=await arenaFixture('saved-round');
  const resolved={player1_damage:7,player2_damage:11,player1_hp:93,player2_hp:89,player1_special:1,player2_special:1,log:['saved outcome']};
  f.sql.prepare("UPDATE telegram_pet_arena_rounds SET status='resolved',player1_move='ab',player2_move='ab',result_json=? WHERE battle_id=?").run(JSON.stringify(resolved),f.id);
  assert.equal((await f.move()).reason,'round_resolved');
  assert.equal(f.battle().player1_hp,93);
  assert.equal(f.battle().player2_hp,89);
  await f.move();
  assert.equal(f.battle().player1_hp,93);
});

for (const system of ['arena','kaiju']) test(`${system}: a committed match survives a failed response without requeuing either player`,async()=>{
  const f=fixture(`match-${system}`),opponent=`rival-${system}`;
  f.sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(opponent,'Rival');
  f.sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,health,energy) VALUES (?,10000,100,100)').run(opponent);
  await hooks.preparePetMiniAppState(f.db,opponent,new Date());
  const pet=f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE telegram_id=?').get(opponent);
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='young' WHERE pet_id=?").run(pet.pet_id);
  await dispatchRenderedPetAction(f.db,opponent,{id:opponent},{action:`${system}_matchmake`},'fixture-token');
  const table=`telegram_pet_${system}_${system==='arena'?'battles':'matches'}`;
  f.db.beforeFirst=s=>{if(s.query.includes(`SELECT * FROM ${table}`)&&s.query.includes(system==='arena'?'battle_id = ?':'match_id = ?'))throw Error('created_match_read_unavailable');};
  const result = await f.act({action:`${system}_matchmake`});
  assert.equal(result.accepted,true,'the committed queue action survives a failed match projection');
  assert.equal(result.refresh_state,true);
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,1);
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM telegram_pet_${system}_queue WHERE status='waiting'`).get().n,0);
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table} WHERE player2_telegram_id IS NULL`).get().n,0);
  f.db.beforeFirst=null;
  assert.equal((await f.act({action:`${system}_matchmake`})).reason,`${system}_match_active`);
});

for(const system of ['arena','kaiju']) for(const failure of ['partial-claim','match-write'])
test(`${system}: ${failure} restores the Mini App queue despite an unrelated Telegram battle`,async()=>{
  const f=fixture(`cross-chat-${system}-${failure}`),rival='rival-'+f.owner;
  f.sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(rival,'Rival');
  f.sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,health,energy) VALUES (?,10000,100,100)').run(rival);
  await hooks.preparePetMiniAppState(f.db,rival,new Date());
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='young' WHERE telegram_id=?").run(rival);
  const queued=await dispatchRenderedPetAction(f.db,rival,{id:rival},{action:`${system}_matchmake`},'fixture-token');
  assert.equal(queued.reason,`${system}_queued`);
  const table=`telegram_pet_${system}_${system==='arena'?'battles':'matches'}`;
  if(system==='arena') f.sql.prepare(`INSERT INTO telegram_pet_arena_battles
    (id,battle_id,chat_id,player1_telegram_id,player1_pet_snapshot_json,player2_pet_snapshot_json,status,expires_at)
    VALUES ('other','other','unrelated-telegram-chat',?,'{}','{}','active','2999-01-01')`).run(f.owner);
  else f.sql.prepare(`INSERT INTO telegram_pet_kaiju_matches (id,match_id,chat_id,player1_telegram_id,status)
    VALUES ('other','other','unrelated-telegram-chat',?,'selecting')`).run(f.owner);
  const unrelated = f.sql.prepare(`SELECT * FROM ${table} WHERE id='other'`).get();
  let injected=false;
  f.db.beforeRun=s=>{
    if(failure==='partial-claim'&&!injected&&s.query.includes(`UPDATE telegram_pet_${system}_queue SET status=`)&&s.query.includes('telegram_id IN (?,?)')) {
      injected=true;
      f.sql.prepare(`UPDATE telegram_pet_${system}_queue SET status='expired' WHERE telegram_id=?`).run(rival);
    }
    if(failure==='match-write'&&s.query.includes(`INSERT INTO ${table}`)) {injected=true;throw Error('match_write_unavailable');}
  };
  if(failure==='partial-claim') {
    const result=await f.act({action:`${system}_matchmake`});
    assert.equal(result.reason,`${system}_queued`);
    assert.equal(result.queue?.waiting,true,'queued success must include the restored waiting row');
  } else {
    const result=await f.act({action:`${system}_matchmake`});
    assert.equal(result.accepted,true,'a later match-write failure cannot reject the saved queue entry');
    assert.equal(result.reason,`${system}_queued`);
    assert.equal(result.refresh_state,true);
    assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM telegram_pet_${system}_queue WHERE telegram_id IN (?,?) AND status='waiting'`).get(f.owner,rival).n,2,
      'both players return to the waiting queue when the match could not be written');
  }
  assert.equal(injected,true);
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM telegram_pet_${system}_queue WHERE telegram_id=? AND status='waiting'`).get(f.owner).n,1);
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,1,'unrelated match remains untouched');
  assert.deepEqual(f.sql.prepare(`SELECT * FROM ${table} WHERE id='other'`).get(),unrelated);
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM telegram_pet_${system}_queue WHERE updated_at LIKE 'claim:%'`).get().n,0,
    'failed matchmaking must not leave a dangling queue claim');
});

test('a broken historical Arena source cannot starve a later recoverable payout',async()=>{
  const f=await arenaFixture('arena-cursor');
  f.sql.prepare("UPDATE telegram_pet_arena_battles SET status='completed',result='player1_win' WHERE battle_id=?").run(f.id);
  f.sql.prepare(`INSERT INTO telegram_pet_arena_battles
    (id,battle_id,chat_id,player1_telegram_id,player1_pet_snapshot_json,player2_pet_snapshot_json,status,result)
    VALUES ('broken','0-broken','fixture',?,'{}','{}','completed','player1_win')`).run(f.owner);
  await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='arena_battle'").get().n,0);
  await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='arena_battle'").get().n,1);
});

for(const group of [false,true]) test(`Arena ${group?'two-player ending':'payout'} repair alongside a care backlog stays within the state SQL budget`,async()=>{
  const f=await arenaFixture('arena-budget');
  await f.state();
  f.sql.prepare("UPDATE telegram_pet_arena_battles SET status='completed',result='player1_win' WHERE battle_id=?").run(f.id);
  if(group) {
    const rival='budget-rival';
    f.sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(rival,'Rival');
    f.sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,health,energy) VALUES (?,10000,100,100)').run(rival);
    await hooks.preparePetMiniAppState(f.db,rival,new Date());
    const pet=await hooks.getPetProfile(f.db,rival);
    f.sql.prepare(`UPDATE telegram_pet_arena_battles SET status='active',result='group',max_rounds=1,player2_telegram_id=?,
      player2_pet_id=?,player2_season_key=?,player2_pet_snapshot_json=? WHERE battle_id=?`)
      .run(rival,pet.pet_id,pet.season_key,JSON.stringify(pet),f.id);
    f.sql.prepare("UPDATE telegram_pet_arena_rounds SET player1_move='ab',player2_move='ab' WHERE battle_id=?").run(f.id);
  }
  const day=new Date().toISOString().slice(0,10);
  for(let i=0;i<50;i++)f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata)
    VALUES (?,?,?,'feed',?,?,?,'fixture','accepted',?)`)
    .run('backlog-'+i,'current-'+f.owner,f.owner,'backlog-'+i,currentSeason,day,JSON.stringify({context:{source:'telegram_mini_app',equipment_snapshot:{}}}));
  f.db.statementCount=0;
  await f.state();
  assert.ok(f.db.statementCount<=600,`mixed repair used ${f.db.statementCount} statements`);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='arena_battle'").get().n,group?2:1);
  console.log('Combat and care recovery budget:',f.db.statementCount,'statements');
});

async function kaijuFixture(owner) {
  const f=fixture(owner);
  const started=await f.act({action:'kaiju_start'});
  assert.equal(started.reason,'kaiju_started');
  f.id=started.match.match_id;
  f.card=()=>f.act({action:'kaiju_card',match_id:f.id,card_key:hooks.PET_KAIJU_CARDS[0].id});
  f.match=()=>f.sql.prepare('SELECT * FROM telegram_pet_kaiju_matches WHERE match_id=?').get(f.id);
  return f;
}
for(const recovery of ['retry','refresh']) test(`Kaiju ${recovery} finishes a saved card after the ending write failed`,async()=>{
  const f=await kaijuFixture('kaiju-locked-'+recovery);
  f.sql.exec("CREATE TRIGGER fail_kaiju_ending BEFORE UPDATE OF status ON telegram_pet_kaiju_matches WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'ending_unavailable'); END");
  await assert.rejects(f.card(),/ending_unavailable/);
  const locked=f.match();
  assert.ok(locked.player1_card_key&&locked.cpu_card_key);
  f.sql.exec('DROP TRIGGER fail_kaiju_ending');
  if(recovery==='retry')assert.equal((await f.card()).accepted,true);
  else await f.state();
  assert.equal(f.match().status,'completed');
  assert.equal(f.match().cpu_card_key,locked.cpu_card_key);
  assert.equal(f.match().category_key,locked.category_key);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='kaiju_battle' AND status='accepted'").get().n,1);
});
test('Kaiju cannot award a match cancelled after the saved cards were read',async()=>{
  const f=await kaijuFixture('kaiju-cancel-race');
  f.db.beforeRun=s=>{
    if(!s.query.includes("SET status = 'completed'"))return;
    f.db.beforeRun=null;
    f.sql.prepare("UPDATE telegram_pet_kaiju_matches SET status='cancelled' WHERE match_id=?").run(f.id);
  };
  const result=await f.card();
  assert.equal(result.accepted,false);
  assert.equal(f.match().status,'cancelled');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='kaiju_battle'").get().n,0);
});
for(const recovery of ['retry','refresh']) test(`Kaiju ${recovery} pays the original pet after failure before reserving its reward`,async()=>{
  const f=await kaijuFixture('kaiju-source-'+recovery);
  f.sql.exec("CREATE TRIGGER fail_kaiju_reservation BEFORE INSERT ON telegram_pet_events WHEN NEW.event_type='kaiju_battle' BEGIN SELECT RAISE(ABORT,'reservation_unavailable'); END");
  await assert.rejects(f.card(),/reservation_unavailable/);
  assert.equal(f.match().status,'completed');
  f.sql.exec('DROP TRIGGER fail_kaiju_reservation');
  f.pet('replacement',currentSeason,200,2);f.active('replacement');
  if(recovery==='retry')assert.equal((await f.card()).accepted,true);
  else await f.state();
  const receipt=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='kaiju_battle' AND status='accepted'").get();
  assert.equal(receipt?.pet_id,'current-'+f.owner);
  assert.equal(f.sql.prepare("SELECT pet_xp,energy FROM telegram_pet_instances WHERE pet_id='replacement'").get().pet_xp,200);
  assert.equal(f.sql.prepare("SELECT energy FROM telegram_pet_instances WHERE pet_id='replacement'").get().energy,100);
  const energy=f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(receipt.pet_id).energy;
  assert.ok(energy<100);
  await f.card();await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='kaiju_battle'").get().n,1);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(receipt.pet_id).energy,energy);
  const publicBoard=await f.get('/telegram-pets/leaderboard?period=daily&limit=100');
  assert.equal(publicBoard.entries[0].pet_xp,receipt.pet_xp_awarded);
  const activity=await f.get('/telegram-pets/activity');
  assert.equal(activity.items.filter(row=>row.event_type==='kaiju_battle').length,1);
});

test('a fractional ISO pet version cannot let an older compatibility profile overwrite earned XP',async()=>{
  const f=fixture('fractional-state');
  await f.state();
  f.sql.prepare("UPDATE telegram_pet_profiles SET pet_xp=200,updated_at='2026-09-28 15:00:00' WHERE telegram_id=?").run(f.owner);
  f.sql.prepare("UPDATE telegram_pet_instances SET pet_xp=10000,source_profile_updated_at='2026-09-28T15:00:00.123Z',updated_at='2026-09-28T15:01:00.456Z' WHERE telegram_id=?").run(f.owner);
  assert.equal((await hooks.getPetProfile(f.db,f.owner)).pet_xp,10000);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).pet_xp,10000);
});

async function addRival(f) {
  const rival='rival-'+f.owner;
  f.sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(rival,'Rival');
  f.sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,health,energy) VALUES (?,10000,100,100)').run(rival);
  await hooks.preparePetMiniAppState(f.db,rival,new Date());
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='young' WHERE telegram_id=?").run(rival);
  return rival;
}

test('Kaiju group retries keep both immutable cards and settle each player once',async()=>{
  const f=fixture('kaiju-group'),rival=await addRival(f);
  const act=(owner,body)=>dispatchRenderedPetAction(f.db,owner,{id:owner},body,'fixture-token');
  assert.equal((await f.act({action:'kaiju_matchmake'})).reason,'kaiju_queued');
  const joined=await act(rival,{action:'kaiju_matchmake'}),id=joined.match.match_id;
  const pick=(owner,index)=>act(owner,{action:'kaiju_card',match_id:id,card_key:hooks.PET_KAIJU_CARDS[index].id});
  assert.equal((await pick(f.owner,0)).reason,'kaiju_card_waiting');
  assert.equal((await pick(f.owner,1)).reason,'kaiju_card_waiting');
  f.sql.exec("CREATE TRIGGER fail_group_ending BEFORE UPDATE OF status ON telegram_pet_kaiju_matches WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'group_ending_unavailable'); END");
  await assert.rejects(pick(rival,1),/group_ending_unavailable/);
  f.sql.exec('DROP TRIGGER fail_group_ending');
  await f.state();
  const match=f.sql.prepare('SELECT * FROM telegram_pet_kaiju_matches WHERE match_id=?').get(id);
  assert.equal(match.player1_card_key,hooks.PET_KAIJU_CARDS[0].id);
  assert.equal(match.player2_card_key,hooks.PET_KAIJU_CARDS[1].id);
  assert.equal(match.status,'completed');
  await pick(f.owner,2);await pick(rival,2);
  const receipts=f.sql.prepare("SELECT telegram_id,pet_id,status FROM telegram_pet_events WHERE event_type='kaiju_battle'").all();
  assert.equal(receipts.length,2);
  for(const row of receipts) {
    assert.equal(row.status,'accepted');
    assert.equal(f.sql.prepare('SELECT telegram_id FROM telegram_pet_instances WHERE pet_id=?').get(row.pet_id).telegram_id,row.telegram_id);
  }
});

test('Kaiju saved cards survive the lobby timeout until refresh settles them',async()=>{
  const f=await kaijuFixture('kaiju-ttl');
  f.sql.exec("CREATE TRIGGER fail_ttl_ending BEFORE UPDATE OF status ON telegram_pet_kaiju_matches WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'ending_unavailable'); END");
  await assert.rejects(f.card(),/ending_unavailable/);
  f.sql.exec('DROP TRIGGER fail_ttl_ending');
  f.sql.prepare("UPDATE telegram_pet_kaiju_matches SET updated_at='2000-01-01' WHERE match_id=?").run(f.id);
  assert.equal((await f.card()).accepted,true);
  assert.equal(f.match().status,'completed');
});

test('Kaiju card locking cannot capture a concurrently replaced active pet',async()=>{
  const f=await kaijuFixture('kaiju-lock-switch');f.pet('new-pet',currentSeason,200,2);
  f.db.beforeRun=s=>{
    if(!s.query.includes('SET player1_card_key='))return;
    f.db.beforeRun=null;f.active('new-pet');
  };
  const result=await f.card();
  assert.equal(result.accepted,false);
  assert.equal(f.match().player1_card_key,null);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='kaiju_battle'").get().n,0);
});

test('Kaiju payout consumes the saved equipment snapshot after a shop change',async()=>{
  const f=await kaijuFixture('kaiju-gear');
  assert.equal((await f.act({action:'buy',item_key:'moon_kibble'})).accepted,true);
  f.sql.exec("CREATE TRIGGER fail_gear_payout BEFORE INSERT ON telegram_pet_events WHEN NEW.event_type='kaiju_battle' BEGIN SELECT RAISE(ABORT,'payout_unavailable'); END");
  await assert.rejects(f.card(),/payout_unavailable/);
  const snapshot=JSON.parse(f.match().score_json).reward_sources[f.owner].equipment_snapshot;
  assert.ok(snapshot.moon_kibble);
  f.sql.exec('DROP TRIGGER fail_gear_payout');
  assert.equal((await f.act({action:'buy',item_key:'nebula_snack'})).accepted,true);
  await f.card();
  const receipt=f.sql.prepare("SELECT metadata FROM telegram_pet_events WHERE event_type='kaiju_battle'").get();
  assert.deepEqual(JSON.parse(receipt.metadata).context.equipment_snapshot,snapshot);
  const state=await f.state();
  assert.equal(state.kaiju.result.score_json.includes('reward_sources'),false,'public match output excludes internal source snapshots');
});

test('legacy Kaiju pending receipts recover without guessing the current pet',async()=>{
  const f=await kaijuFixture('kaiju-legacy');
  f.sql.exec("CREATE TRIGGER fail_legacy_payout BEFORE INSERT ON telegram_pet_reward_claims WHEN NEW.source='pet_kaiju' BEGIN SELECT RAISE(ABORT,'payout_unavailable'); END");
  await assert.rejects(f.card(),/payout_unavailable/);
  f.sql.exec('DROP TRIGGER fail_legacy_payout');
  f.sql.prepare("UPDATE telegram_pet_kaiju_matches SET score_json=json_remove(score_json,'$.reward_sources') WHERE match_id=?").run(f.id);
  f.pet('legacy-replacement',currentSeason,200,2);f.active('legacy-replacement');
  await f.state();
  const receipt=f.sql.prepare("SELECT pet_id,status FROM telegram_pet_events WHERE event_type='kaiju_battle'").get();
  assert.equal(receipt.status,'accepted');assert.equal(receipt.pet_id,'current-'+f.owner);
});

test('petless legacy Kaiju reservation retains its period, capped history and account rewards across a real switch',async()=>{
  const f=await kaijuFixture('kaiju-petless-history');
  const source='current-'+f.owner;
  f.sql.prepare("UPDATE telegram_pet_kaiju_matches SET category_key='pwr',roll=1,cpu_card_key='mc-rodan' WHERE match_id=?").run(f.id);
  f.sql.exec("CREATE TRIGGER hold_petless_reward BEFORE INSERT ON telegram_pet_reward_claims WHEN NEW.source='pet_kaiju' BEGIN SELECT RAISE(ABORT,'payout_unavailable'); END");
  await assert.rejects(f.card(),/payout_unavailable/);
  f.sql.exec('DROP TRIGGER hold_petless_reward');
  assert.equal(f.match().result,'draw');
  const reservation=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='kaiju_battle'").get();
  assert.equal(reservation.status,'pending');
  assert.equal(reservation.pet_id,source);
  // This is the persisted pre-upgrade shape: the earning window is known,
  // while the held receipt has no lifetime owner.
  f.sql.prepare("UPDATE telegram_pet_events SET pet_id=NULL,season_key='pet-s2026-003',day_key='2026-07-18',week_key='2026-W29' WHERE id=?").run(reservation.id);
  f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,telegram_id,event_type,event_key,pet_xp_awarded,xp_awarded,season_key,day_key,week_key,status)
    VALUES ('petless-cap',?,'cap_fixture','petless-cap',1190,248,'pet-s2026-003','2026-07-18','2026-W29','accepted')`).run(f.owner);
  f.pet('petless-replacement',currentSeason,200,2);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'petless-replacement')).accepted,true);
  const petColumns='pet_xp,health,hunger,cleanliness,energy,happiness,streak_days,last_active_day,stage,level';
  const owned=id=>f.sql.prepare(`SELECT ${petColumns} FROM telegram_pet_instances WHERE pet_id=?`).get(id);
  const mirror=()=>f.sql.prepare(`SELECT ${petColumns} FROM telegram_pet_profiles WHERE telegram_id=?`).get(f.owner);
  const sourceBefore=owned(source),replacementBefore=owned('petless-replacement'),profileBefore=mirror();
  const walletBefore=f.sql.prepare('SELECT moon_gold,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
  const communityBefore=f.sql.prepare('SELECT xp FROM telegram_users WHERE telegram_id=?').get(f.owner).xp;
  const result=await f.card();
  assert.equal(result.accepted,true);
  const reward=result.reward_results[0].result;
  assert.equal(reward.accepted,true);
  assert.equal(reward.pet_xp_awarded,10);
  assert.equal(reward.xp_awarded,2);
  const receipt=f.sql.prepare('SELECT pet_id,status,season_key,day_key,week_key,pet_xp_awarded,xp_awarded FROM telegram_pet_events WHERE id=?').get(reservation.id);
  assert.deepEqual({...receipt},{pet_id:null,status:'accepted',season_key:'pet-s2026-003',day_key:'2026-07-18',week_key:'2026-W29',pet_xp_awarded:10,xp_awarded:2});
  const claim=f.sql.prepare("SELECT pet_id,status,day_key,applied_rewards FROM telegram_pet_reward_claims WHERE source='pet_kaiju'").get();
  assert.equal(claim.pet_id,null);assert.equal(claim.status,'awarded');assert.equal(claim.day_key,'2026-07-18');
  const applied=JSON.parse(claim.applied_rewards);
  assert.equal(applied.pet_xp,10);assert.equal(applied.community_xp,2);
  assert.equal(applied.moon_gold,10);assert.equal(applied.style_tokens,1);
  const competition=f.sql.prepare("SELECT season_xp,daily_key,weekly_key FROM telegram_pet_season_state WHERE telegram_id=? AND season_key='pet-s2026-003'").get(f.owner);
  assert.deepEqual({...competition},{season_xp:10,daily_key:'2026-07-18',weekly_key:'2026-W29'});
  await hooks.getPetProfile(f.db,f.owner);
  await f.state();
  assert.deepEqual(owned(source),sourceBefore);assert.deepEqual(owned('petless-replacement'),replacementBefore);
  assert.deepEqual(mirror(),profileBefore);
  assert.equal(f.sql.prepare('SELECT xp FROM telegram_users WHERE telegram_id=?').get(f.owner).xp,communityBefore+2);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_xp_log WHERE telegram_id=? AND action='pet_kaiju_battle'").get(f.owner).n,1);
  assert.deepEqual({...f.sql.prepare('SELECT moon_gold,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner)},
    {moon_gold:walletBefore.moon_gold+10,style_tokens:walletBefore.style_tokens+1});
  assert.equal((await f.card()).reward_results[0].result.duplicate,true);
  await hooks.getPetProfile(f.db,f.owner);
  assert.deepEqual(owned(source),sourceBefore);assert.deepEqual(owned('petless-replacement'),replacementBefore);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_kaiju'").get().n,1);
  assert.equal(f.sql.prepare('SELECT xp FROM telegram_users WHERE telegram_id=?').get(f.owner).xp,communityBefore+2);
  assert.equal(f.sql.prepare("SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key='pet-s2026-003'").get(f.owner).season_xp,10);
  assert.deepEqual({...f.sql.prepare('SELECT moon_gold,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner)},
    {moon_gold:walletBefore.moon_gold+10,style_tokens:walletBefore.style_tokens+1});
});

test('legacy Kaiju without any source proof cannot award the currently selected pet',async()=>{
  const f=await kaijuFixture('kaiju-unproven');
  f.sql.prepare("UPDATE telegram_pet_kaiju_matches SET status='completed',player1_card_key=?,cpu_card_key=?,result='player1_win' WHERE match_id=?")
    .run(hooks.PET_KAIJU_CARDS[0].id,hooks.PET_KAIJU_CARDS[1].id,f.id);
  const result=await f.card();
  assert.equal(result.reward_results[0].result.reason,'source_pet_authority_required');
  await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='kaiju_battle'").get().n,0);
});

test('Telegram Kaiju repairs saved choices and propagates unavailable table reads',async()=>{
  const f=await kaijuFixture('kaiju-telegram');
  f.sql.prepare("UPDATE telegram_pet_kaiju_matches SET chat_id='fixture-chat' WHERE match_id=?").run(f.id);
  const originalFetch=globalThis.fetch;
  const sent=[];
  globalThis.fetch=async(url,options)=>{
    assert.ok(String(url).startsWith('https://api.telegram.org/'));
    sent.push(options?.body);
    return new Response(JSON.stringify({ok:true,result:{message_id:1}}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try {
    const choose=()=>hooks.cmdPetKaiju(f.db,'fixture-token','fixture-chat',f.owner,`card:${f.id}:${hooks.PET_KAIJU_CARDS[0].id}`,'private',{id:f.owner});
    f.sql.exec("CREATE TRIGGER fail_bot_ending BEFORE UPDATE OF status ON telegram_pet_kaiju_matches WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'bot_ending_unavailable'); END");
    await assert.rejects(choose(),/bot_ending_unavailable/);
    f.sql.exec('DROP TRIGGER fail_bot_ending');
    await choose();
    assert.equal(f.match().status,'completed');
    assert.ok(sent.length>0);
    f.db.beforeFirst=s=>{if(s.query.includes('SELECT * FROM telegram_pet_kaiju_matches'))throw Error('table_read_unavailable');};
    await assert.rejects(hooks.cmdPetKaiju(f.db,'fixture-token','fixture-chat',f.owner,'','private',{id:f.owner}),/table_read_unavailable/);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_kaiju_matches').get().n,1);
  } finally { globalThis.fetch=originalFetch; }
});

test('direct Telegram Kaiju uses the canonical hatch and lifecycle authority gate',async()=>{
  const f=fixture('kaiju-direct-gate');
  const originalFetch=globalThis.fetch;
  const sent=[];
  globalThis.fetch=async(url,options)=>{
    sent.push(String(options?.body?.get?.('text') || options?.body || ''));
    return new Response(JSON.stringify({ok:true,result:{message_id:1}}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try {
    f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE telegram_id=?").run(f.owner);
    await hooks.cmdPetKaiju(f.db,'fixture-token','fixture-chat',f.owner,'','private',{id:f.owner});
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_kaiju_matches').get().n,0,
      'an Egg cannot create a Kaiju match through the direct Telegram command');
    assert.ok(sent.at(-1).includes('must hatch'), 'the direct command must explain the hatch requirement');

    f.sql.prepare("INSERT INTO telegram_users (telegram_id,first_name) VALUES ('direct-rival','Rival')").run();
    f.sql.prepare("INSERT INTO telegram_pet_kaiju_matches (id,match_id,chat_id,mode,status,player1_telegram_id,category_key,roll) VALUES ('direct-join-row','direct-join','fixture-join','group','open','direct-rival','lgcy',10)").run();
    await hooks.cmdPetKaiju(f.db,'fixture-token','fixture-join',f.owner,'join:direct-join','group',{id:f.owner});
    assert.equal(f.sql.prepare("SELECT player2_telegram_id FROM telegram_pet_kaiju_matches WHERE match_id='direct-join'").get().player2_telegram_id,null,
      'an Egg cannot join an open direct Telegram Kaiju match');

    f.sql.prepare("INSERT INTO telegram_pet_kaiju_matches (id,match_id,chat_id,mode,status,player1_telegram_id,category_key,roll) VALUES ('direct-cpu-row','direct-cpu','fixture-cpu','group','open',?,'lgcy',10)").run(f.owner);
    await hooks.cmdPetKaiju(f.db,'fixture-token','fixture-cpu',f.owner,'cpu:direct-cpu','private',{id:f.owner});
    assert.equal(f.sql.prepare("SELECT status FROM telegram_pet_kaiju_matches WHERE match_id='direct-cpu'").get().status,'open',
      'an Egg cannot convert an open table into a direct app battle');

    f.sql.prepare("INSERT INTO telegram_pet_kaiju_matches (id,match_id,chat_id,mode,status,player1_telegram_id,category_key,roll) VALUES ('direct-card-row','direct-card','fixture-card','solo','selecting',?,'lgcy',10)").run(f.owner);
    await hooks.cmdPetKaiju(f.db,'fixture-token','fixture-card',f.owner,`card:direct-card:${hooks.PET_KAIJU_CARDS[0].id}`,'private',{id:f.owner});
    assert.equal(f.sql.prepare("SELECT player1_card_key FROM telegram_pet_kaiju_matches WHERE match_id='direct-card'").get().player1_card_key,null,
      'an Egg cannot lock a card through a direct Telegram callback');

    const matchesBeforeOutage=f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_kaiju_matches').get().n;
    f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='young' WHERE telegram_id=?").run(f.owner);
    f.db.beforeFirst=s=>{if(s.query.includes('telegram_pet_lifecycle_by_pet'))throw Error('lifecycle_read_unavailable');};
    await hooks.cmdPetKaiju(f.db,'fixture-token','fixture-chat',f.owner,'','private',{id:f.owner});
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_kaiju_matches').get().n,matchesBeforeOutage,
      'a lifecycle outage cannot create a Kaiju match');
    assert.ok(sent.at(-1).includes('temporarily unavailable'), 'the direct command must expose a retryable authority outage');
  } finally {
    globalThis.fetch=originalFetch;
  }
});

test('mixed Kaiju, Arena and care recovery stays bounded and makes progress in both modes',async()=>{
  const f=fixture('combined-budget'),rival=await addRival(f);
  await f.state();
  await f.act({action:'kaiju_matchmake'});
  const joined=await dispatchRenderedPetAction(f.db,rival,{id:rival},{action:'kaiju_matchmake'},'fixture-token');
  const id=joined.match.match_id;
  await f.act({action:'kaiju_card',match_id:id,card_key:hooks.PET_KAIJU_CARDS[0].id});
  f.sql.exec("CREATE TRIGGER fail_budget_ending BEFORE UPDATE OF status ON telegram_pet_kaiju_matches WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'ending_unavailable'); END");
  await assert.rejects(dispatchRenderedPetAction(f.db,rival,{id:rival},{action:'kaiju_card',match_id:id,card_key:hooks.PET_KAIJU_CARDS[1].id},'fixture-token'),/ending_unavailable/);
  f.sql.exec('DROP TRIGGER fail_budget_ending');
  f.sql.prepare(`INSERT INTO telegram_pet_arena_battles
    (id,battle_id,chat_id,player1_telegram_id,player1_pet_id,player1_season_key,player1_pet_snapshot_json,player2_pet_snapshot_json,status,result)
    VALUES ('budget-arena','budget-arena','fixture',?,?,?,'{}','{}','completed','player1_win')`).run(f.owner,'current-'+f.owner,currentSeason);
  const day=new Date().toISOString().slice(0,10);
  for(let i=0;i<50;i++)f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata)
    VALUES (?,?,?,'feed',?,?,?,'fixture','accepted',?)`)
    .run('mixed-'+i,'current-'+f.owner,f.owner,'mixed-'+i,currentSeason,day,JSON.stringify({context:{source:'telegram_mini_app',equipment_snapshot:{}}}));
  const costs=[];
  for(let i=0;i<2;i++) {f.db.statementCount=0;await f.state();costs.push(f.db.statementCount);}
  assert.ok(Math.max(...costs)<=600,`combined recovery costs ${costs}`);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='arena_battle' AND status='accepted'").get().n,1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='kaiju_battle' AND status='accepted'").get().n,2);
  console.log('Combined combat/care budget:',costs.join(', '),'statements');
});

test('Kaiju gets the next recovery turn despite new Arena arrivals, while Arena retains its own cursor',async()=>{
  const f=await kaijuFixture('combat-fairness');
  f.sql.exec("CREATE TRIGGER fail_fair_ending BEFORE UPDATE OF status ON telegram_pet_kaiju_matches WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'ending_unavailable'); END");
  await assert.rejects(f.card(),/ending_unavailable/);
  f.sql.exec('DROP TRIGGER fail_fair_ending');
  const arena=(id,petId=null)=>f.sql.prepare(`INSERT INTO telegram_pet_arena_battles
    (id,battle_id,chat_id,player1_telegram_id,player1_pet_id,player1_season_key,player1_pet_snapshot_json,player2_pet_snapshot_json,status,result)
    VALUES (?,?,?, ?,?,?,'{}','{}','completed','player1_win')`).run(id,id,'fixture',f.owner,petId,currentSeason);
  arena('a-broken');arena('b-broken');arena('z-valid','current-'+f.owner);
  await f.state();
  assert.equal(f.match().status,'selecting');
  arena('c-new-arrival');
  await f.state();
  assert.equal(f.match().status,'completed','Kaiju must get the next turn before the Arena backlog is exhausted');
  for(let i=0;i<3;i++)await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='arena_battle' AND status='accepted'").get().n,1,
    'returning to Arena must continue beyond its earlier broken scopes');
});
