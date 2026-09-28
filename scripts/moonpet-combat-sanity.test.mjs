import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

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
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) await db.beforeRun(this); return this.exec(); }
  }
  const db = { statementCount: 0, beforeBatch: null, beforeRun: null, prepare(query) { return new Statement(query); }, async batch(statements) {
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
  const act = body => hooks.processPetMiniAppAction(db,owner,{id:owner},body,'fixture-token');
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
  const result=await hooks.processPetMiniAppAction(f.db,'intruder',{id:'intruder'},
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
  await hooks.processPetMiniAppAction(f.db,opponent,{id:opponent},{action:`${system}_matchmake`},'fixture-token');
  const table=`telegram_pet_${system}_${system==='arena'?'battles':'matches'}`;
  f.db.beforeFirst=s=>{if(s.query.includes(`SELECT * FROM ${table}`)&&s.query.includes(system==='arena'?'battle_id = ?':'match_id = ?'))throw Error('created_match_read_unavailable');};
  await assert.rejects(f.act({action:`${system}_matchmake`}),/created_match_read_unavailable/);
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,1);
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM telegram_pet_${system}_queue WHERE status='waiting'`).get().n,0);
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table} WHERE player2_telegram_id IS NULL`).get().n,0);
  f.db.beforeFirst=null;
  assert.equal((await f.act({action:`${system}_matchmake`})).reason,`${system}_match_active`);
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
