import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHmac } from 'node:crypto';
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
    async first() { db.statementCount++; if (db.beforeFirst) { const response = await db.beforeFirst(this); if (response !== undefined) return response; } return sql.prepare(this.query).get(...this.args) || null; }
    async all() { db.statementCount++; if (db.beforeAll) { const response = await db.beforeAll(this); if (response !== undefined) return response; } return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      db.statementCount++;
      if (sql.prepare(this.query).columns().length && !/\bRETURNING\b/i.test(this.query)) return { results: sql.prepare(this.query).all(...this.args), meta: { changes: 0 } };
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) { const response = await db.beforeRun(this); if (response !== undefined) return response; } return this.exec(); }
  }
  const db = { statementCount: 0, beforeBatch: null, beforeRun: null, prepare(query) { return new Statement(query); }, async batch(statements) {
    for (const statement of statements) {
      if (/^\s*SELECT\b/i.test(statement.query)) {
        if (this.beforeFirst) { const reply = await this.beforeFirst(statement); if (reply?.success === false) throw Error('pet_state_read_unavailable'); }
        if (this.beforeAll) { const reply = await this.beforeAll(statement); if (reply?.success === false) throw Error('pet_state_read_unavailable'); }
      } else if (this.beforeRun) await this.beforeRun(statement);
    }
    if (this.beforeBatch) { const response = await this.beforeBatch(statements); if (response !== undefined) return response; }
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

// Real authenticated route, using only an isolated fixture bot token/account.
async function httpAction(f, body, owner = f.owner) {
  const token = '123456:arena-fixture-only-token';
  const fields = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: Number(owner), first_name: 'Fixture' }) });
  const check = [...fields.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  fields.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(token).digest()).update(check).digest('hex'));
  const selected = f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(owner);
  const response = await worker.fetch(new Request('https://moonboys-api.test/telegram-pets/app/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ init_data: fields.toString(), displayed_pet_id: selected.pet_id, response_mode: 'result_only', ...body }),
  }), { DB: f.db, TELEGRAM_BOT_TOKEN: token });
  return { status: response.status, body: await response.json() };
}
const battleRow = (f, id) => f.sql.prepare('SELECT * FROM telegram_pet_arena_battles WHERE battle_id=?').get(id);
const receipts = f => f.sql.prepare("SELECT telegram_id,pet_id,applied_rewards FROM telegram_pet_reward_claims WHERE source='pet_arena' AND status='awarded' ORDER BY telegram_id").all();
const expire = (f, id) => f.sql.prepare("UPDATE telegram_pet_arena_battles SET expires_at='2000-01-01T00:00:00.000Z' WHERE battle_id=?").run(id);
const payload = (action, id) => ({ action, battle_id: id, expected_round: 1, move: 'ab' });
const inputWrite = (action, query) => action === 'arena_move'
  ? query.includes('UPDATE telegram_pet_arena_rounds SET player1_move=') || query.includes('UPDATE telegram_pet_arena_rounds SET player2_move=')
  : action === 'arena_ready' ? /SET player[12]_ready_at=/.test(query) : query.includes('SET winner_telegram_id=?, result=?, player1_hp=?');

for (const action of ['arena_ready', 'arena_move', 'arena_forfeit']) for (const race of [false, true]) {
  test(`${action} rejects expired new input ${race ? 'at the mutation race' : 'without requiring a prior refresh'}`, async t => {
    const f = fixture(String(920000 + ['arena_ready', 'arena_move', 'arena_forfeit'].indexOf(action) * 2 + Number(race)));
    t.after(() => f.sql.close());
    const started = await f.act({ action: 'arena_start' }), id = started.battle.battle_id;
    f.sql.prepare('UPDATE telegram_pet_arena_battles SET max_rounds=1 WHERE battle_id=?').run(id);
    let raced = false;
    if (race) f.db.beforeRun = ({ query }) => { if (inputWrite(action, query)) { f.db.beforeRun = null; expire(f, id); raced = true; } };
    else expire(f, id);
    const result = await httpAction(f, payload(action, id));
    assert.equal(result.status, 409); assert.equal(result.body.result.accepted, false);
    assert.equal(result.body.result.reason, 'battle_not_active');
    assert.equal(battleRow(f, id).status, 'expired'); assert.equal(receipts(f).length, 0);
    const round = f.sql.prepare('SELECT player1_move,player2_move FROM telegram_pet_arena_rounds WHERE battle_id=?').get(id);
    assert.equal(round.player1_move, null); assert.equal(round.player2_move, null);
    if (race) assert.equal(raced, true);
  });
}

async function multiplayer(f, rival) {
  f.sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(rival, 'Rival');
  f.sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,health,energy) VALUES (?,10000,100,100)').run(rival);
  await hooks.preparePetMiniAppState(f.db, rival, new Date());
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='young' WHERE telegram_id=?").run(rival);
  const act = (owner, body) => dispatchRenderedPetAction(f.db, owner, { id: owner }, body, 'fixture-token');
  await f.act({ action: 'arena_matchmake' });
  const started = await act(rival, { action: 'arena_matchmake' });
  return { id: started.battle.battle_id, battle: started.battle, act };
}

test('multiplayer readiness cannot restart an expired readying battle', async t => {
  const f = fixture('920010'); t.after(() => f.sql.close());
  const { id, battle, act } = await multiplayer(f, '920011');
  await act(battle.player1_telegram_id, payload('arena_ready', id));
  expire(f, id);
  const result = await httpAction(f, payload('arena_ready', id), battle.player2_telegram_id);
  assert.equal(result.status, 409); assert.equal(battleRow(f, id).status, 'expired');
  assert.equal(battleRow(f, id).player2_ready_at, null); assert.equal(receipts(f).length, 0);
});

for (const role of ['locked', 'waiting']) test(`multiplayer ${role} player cannot revive an expired round still awaiting the other input`, async t => {
  const f = fixture(role === 'locked' ? '920012' : '920014'); t.after(() => f.sql.close());
  const { id, battle, act } = await multiplayer(f, role === 'locked' ? '920013' : '920015');
  for (const owner of [battle.player1_telegram_id, battle.player2_telegram_id]) await act(owner, payload('arena_ready', id));
  await act(battle.player1_telegram_id, payload('arena_move', id));
  expire(f, id);
  const owner = role === 'locked' ? battle.player1_telegram_id : battle.player2_telegram_id;
  const result = await httpAction(f, payload('arena_move', id), owner);
  assert.equal(result.status, 409); assert.equal(battleRow(f, id).status, 'expired');
  const round = f.sql.prepare('SELECT player1_move,player2_move FROM telegram_pet_arena_rounds WHERE battle_id=?').get(id);
  assert.equal(round.player1_move, 'ab'); assert.equal(round.player2_move, null); assert.equal(receipts(f).length, 0);
});

test('a saved solo move survives expiry and a late forfeit, then recovers its original ending once', async t => {
  const f = fixture('920020'); t.after(() => f.sql.close());
  const start = await f.act({ action: 'arena_start' }), id = start.battle.battle_id;
  f.sql.prepare('UPDATE telegram_pet_arena_battles SET max_rounds=1 WHERE battle_id=?').run(id);
  f.sql.exec("CREATE TRIGGER fail_saved_cpu BEFORE UPDATE OF player2_move ON telegram_pet_arena_rounds BEGIN SELECT RAISE(ABORT,'cpu_write_unavailable'); END");
  await assert.rejects(f.act(payload('arena_move', id)), /cpu_write_unavailable/);
  f.sql.exec('DROP TRIGGER fail_saved_cpu'); expire(f, id);
  const forfeit = await httpAction(f, payload('arena_forfeit', id));
  assert.equal(forfeit.status, 409); assert.equal(battleRow(f, id).status, 'active'); assert.equal(receipts(f).length, 0);
  const recovered = await httpAction(f, payload('arena_move', id));
  assert.equal(recovered.status, 200); assert.equal(recovered.body.result.duplicate, false);
  assert.equal(battleRow(f, id).status, 'completed'); assert.equal(receipts(f).length, 1);
  const paid = receipts(f), retry = await httpAction(f, payload('arena_move', id));
  assert.equal(retry.body.result.duplicate, true); assert.deepEqual(receipts(f), paid);
});

test('both multiplayer moves saved before expiry settle after a real rolled-back ending and pay each owner once', async t => {
  const f = fixture('920021'); t.after(() => f.sql.close());
  const { id, battle, act } = await multiplayer(f, '920022');
  f.sql.prepare('UPDATE telegram_pet_arena_battles SET max_rounds=1 WHERE battle_id=?').run(id);
  for (const owner of [battle.player1_telegram_id, battle.player2_telegram_id]) await act(owner, payload('arena_ready', id));
  await act(battle.player1_telegram_id, payload('arena_move', id));
  f.sql.exec("CREATE TRIGGER fail_saved_ending BEFORE UPDATE OF current_round ON telegram_pet_arena_battles BEGIN SELECT RAISE(ABORT,'ending_write_unavailable'); END");
  await assert.rejects(act(battle.player2_telegram_id, payload('arena_move', id)), /ending_write_unavailable/);
  f.sql.exec('DROP TRIGGER fail_saved_ending'); expire(f, id);
  const recovered = await httpAction(f, payload('arena_move', id), battle.player2_telegram_id);
  assert.equal(recovered.status, 200); assert.equal(battleRow(f, id).status, 'completed'); assert.equal(receipts(f).length, 2);
  const paid = receipts(f);
  for (const owner of [battle.player1_telegram_id, battle.player2_telegram_id]) assert.equal((await httpAction(f, payload('arena_move', id), owner)).body.result.duplicate, true);
  assert.deepEqual(receipts(f), paid);
});

for (const fault of ['resolved', 'thrown', 'missing_metadata', 'malformed_metadata', 'zero_changes']) test(`forfeit ${fault} result cannot acknowledge an unsaved ending`, async t => {
  const f = fixture(String(920030 + ['resolved', 'thrown', 'missing_metadata', 'malformed_metadata', 'zero_changes'].indexOf(fault))); t.after(() => f.sql.close());
  const start = await f.act({ action: 'arena_start' }), id = start.battle.battle_id;
  f.db.beforeRun = ({ query }) => {
    if (!inputWrite('arena_forfeit', query)) return;
    if (fault === 'thrown') throw Error('D1_ERROR: forfeit write unavailable');
    if (fault === 'resolved') return { success: false, error: 'D1_ERROR: forfeit write unavailable', meta: { changes: 0 } };
    if (fault === 'missing_metadata') return { success: true };
    return { success: true, meta: { changes: fault === 'zero_changes' ? 0 : '1' } };
  };
  const result = await httpAction(f, payload('arena_forfeit', id));
  assert.equal(result.status, fault === 'zero_changes' ? 409 : 503);
  assert.notEqual(result.body.result?.accepted, true);
  assert.equal(battleRow(f, id).status, 'active'); assert.equal(receipts(f).length, 0);
  f.db.beforeRun = null;
  const saved = await httpAction(f, payload('arena_forfeit', id));
  assert.equal(saved.status, 200); assert.equal(saved.body.result.duplicate, false); assert.equal(receipts(f).length, 1);
  const paid = receipts(f);
  assert.equal((await httpAction(f, payload('arena_forfeit', id))).body.result.duplicate, true);
  assert.deepEqual(receipts(f), paid);
});

test('forfeit losing a race to another committed forfeit reads the saved ending and does not pay twice', async t => {
  const f = fixture('920040'); t.after(() => f.sql.close());
  const start = await f.act({ action: 'arena_start' }), id = start.battle.battle_id;
  let raced = false;
  f.db.beforeRun = async ({ query }) => {
    if (!inputWrite('arena_forfeit', query)) return;
    f.db.beforeRun = null; raced = true;
    assert.equal((await f.act(payload('arena_forfeit', id))).accepted, true);
  };
  const result = await httpAction(f, payload('arena_forfeit', id));
  assert.equal(raced, true); assert.equal(result.status, 200); assert.equal(result.body.result.duplicate, true);
  assert.equal(battleRow(f, id).status, 'completed'); assert.equal(receipts(f).length, 1);
});

for (const action of ['arena_ready', 'arena_move', 'arena_forfeit']) test(`Telegram ${action} shares the mutation-time expiry guard`, async t => {
  const f = fixture(String(920050 + ['arena_ready', 'arena_move', 'arena_forfeit'].indexOf(action))); t.after(() => f.sql.close());
  const start = await f.act({ action: 'arena_start' }), id = start.battle.battle_id, chat = start.battle.chat_id;
  f.db.beforeRun = ({ query }) => { if (inputWrite(action, query)) { f.db.beforeRun = null; expire(f, id); } };
  const originalFetch = globalThis.fetch, sent = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith('https://api.telegram.org/'));
    sent.push(String(options?.body?.get?.('text') || options?.body || ''));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  };
  try {
    const command = action === 'arena_ready' ? `ready:${id}` : action === 'arena_move' ? `mv:${id}:1:ab` : `ff:${id}`;
    await hooks.cmdPetArena(f.db, 'fixture-token', chat, f.owner, command, 'private');
    assert.equal(battleRow(f, id).status, 'expired'); assert.equal(receipts(f).length, 0);
    assert.match(sent.at(-1), /not saved|Stale Pet Arena/); assert.doesNotMatch(sent.at(-1), /rewards|Winner/);
  } finally { globalThis.fetch = originalFetch; }
});

test('an already locked multiplayer input cannot extend the deadline after the final read/write race', async t => {
  const f = fixture('920060'); t.after(() => f.sql.close());
  const { id, battle, act } = await multiplayer(f, '920061');
  for (const owner of [battle.player1_telegram_id, battle.player2_telegram_id]) await act(owner, payload('arena_ready', id));
  await act(battle.player1_telegram_id, payload('arena_move', id));
  let raced = false;
  f.db.beforeRun = ({ query }) => {
    if (!query.includes('UPDATE telegram_pet_arena_battles SET expires_at=?')) return;
    f.db.beforeRun = null; raced = true; expire(f, id);
  };
  const result = await httpAction(f, payload('arena_move', id), battle.player1_telegram_id);
  assert.equal(raced, true); assert.equal(result.status, 409); assert.equal(battleRow(f, id).status, 'expired'); assert.equal(receipts(f).length, 0);
});

test('a recovered nonterminal round renews its deadline in the same transaction as advancement', async t => {
  const f = fixture('920062'); t.after(() => f.sql.close());
  const start = await f.act({ action: 'arena_start' }), id = start.battle.battle_id;
  f.sql.exec("CREATE TRIGGER fail_recovery_cpu BEFORE UPDATE OF player2_move ON telegram_pet_arena_rounds BEGIN SELECT RAISE(ABORT,'cpu_write_unavailable'); END");
  await assert.rejects(f.act(payload('arena_move', id)), /cpu_write_unavailable/);
  f.sql.exec('DROP TRIGGER fail_recovery_cpu'); expire(f, id);
  let checked = false;
  f.db.beforeRun = ({ query, args }) => {
    if (!query.includes('INSERT OR IGNORE INTO telegram_pet_arena_rounds') || Number(args[2]) !== 2) return;
    checked = true;
    const row = battleRow(f, id);
    assert.equal(row.current_round, 2); assert.ok(Date.parse(row.expires_at) > Date.now());
  };
  const result = await httpAction(f, payload('arena_move', id));
  assert.equal(result.status, 200); assert.equal(result.body.result.reason, 'round_resolved'); assert.equal(checked, true);
  assert.equal(battleRow(f, id).status, 'active'); assert.equal(receipts(f).length, 0);
});

for (const stage of ['cpu', 'settlement']) for (const failure of ['resolved', 'zero_changes']) test(`Telegram ${stage} ${failure} write cannot fabricate saved progress`, async t => {
  const f = fixture(String(920070 + ['cpu', 'settlement'].indexOf(stage) * 2 + Number(failure === 'zero_changes'))); t.after(() => f.sql.close());
  const start = await f.act({ action: 'arena_start' }), id = start.battle.battle_id, chat = start.battle.chat_id;
  const failed = failure === 'resolved' ? { success: false, meta: { changes: 0 } } : { success: true, meta: { changes: 0 } };
  if (stage === 'cpu') f.db.beforeRun = ({ query }) => query.includes('SET player2_move=?') ? failed : undefined;
  else f.db.beforeBatch = statements => statements.some(s => s.query.includes('UPDATE telegram_pet_arena_rounds SET player1_damage')) ? statements.map(() => failed) : undefined;
  const originalFetch = globalThis.fetch, sent = [];
  globalThis.fetch = async (url, options) => { sent.push(String(options?.body?.get?.('text') || options?.body || '')); return new Response(JSON.stringify({ ok:true,result:{message_id:1} }), {status:200}); };
  try {
    const command = () => hooks.cmdPetArena(f.db, 'fixture-token', chat, f.owner, `mv:${id}:1:ab`, 'private');
    if (failure === 'zero_changes' && stage === 'settlement') { await command(); assert.match(sent.at(-1), /Stale Pet Arena/); }
    else await assert.rejects(command(), /pet_state_write_unavailable/);
    assert.equal(battleRow(f, id).current_round, 1); assert.equal(receipts(f).length, 0);
    assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_arena_rounds WHERE battle_id=?').get(id).status, 'selecting');
    f.db.beforeRun = null; f.db.beforeBatch = null;
    await command(); assert.equal(battleRow(f, id).current_round, 2);
  } finally { globalThis.fetch = originalFetch; }
});
