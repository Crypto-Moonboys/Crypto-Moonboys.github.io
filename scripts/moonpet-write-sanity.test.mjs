import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { awardPetReward } from '../workers/moonboys-api/pets/roguelite-foundation.js';
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
  const act = body => dispatchRenderedPetAction(db,owner,{id:owner},body,'fixture-token');
  const get = async path => { const response = await worker.fetch(new Request('https://moonboys-api.test' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, pet, active, act, get };
}

async function reward(f) {
  return awardPetReward(f.db,{telegram_id:f.owner,pet_id:'current-'+f.owner,season_key:currentSeason,source:'pet_action',event_type:'feed',event_key:'overlap:'+f.owner,idempotency_key:'overlap:'+f.owner,rewards:{pet_xp:6},context:{}});
}
function intercept(f, action, callback) {
  let ran = false;
  const inject = async () => { if (ran) return; ran = true; await callback(); };
  // Retain the legacy boundary so this regression also fails on pre-fix main.
  f.db.beforeRun = async s => {
    if (action === 'rename' && /UPDATE telegram_pet_profiles\s+SET pet_name/.test(s.query)) await inject();
  };
  f.db.beforeBatch = async statements => {
    if (statements.some(s => action === 'rename'
      ? /UPDATE telegram_pet_instances SET pet_name=/.test(s.query)
      : s.query.includes("'trade_pending'"))) await inject();
  };
  return () => assert.equal(ran, true, 'overlap must actually execute');
}
for (const action of ['rename', 'trade']) test(action + ' preserves a concurrent reward and every public XP period', async () => {
  const f = fixture('overlap-' + action);
  const injected = intercept(f, action, async () => assert.equal((await reward(f)).accepted, true));
  const body = { action, pet_name: 'NEW NAME', wager: 10, request_id: 'one-request' };
  let result = await f.act(body);
  injected();
  if (action === 'trade') {
    assert.equal(result.accepted, false, 'stale trade must stop before reserving or charging');
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='trade'").get().n, 0);
    result = await f.act(body);
  }
  assert.equal(result.accepted, true);
  const earned = 6 + Number(result.pet_xp_awarded || 0);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('current-' + f.owner).pet_xp, 10000 + earned);
  for (const period of ['daily', 'weekly', 'seasonal', 'all_time']) {
    const publicBoard = await f.get('/telegram-pets/leaderboard?period=' + period);
    assert.equal(publicBoard.entries[0].pet_xp, earned + (period === 'all_time' ? 10000 : 0));
    const mini = await hooks.buildPetMiniAppLeaderboard(f.db, f.owner, period, 25);
    assert.equal(mini.entries[0].pet_xp, publicBoard.entries[0].pet_xp);
  }
  await f.act(body);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('current-' + f.owner).pet_xp, 10000 + earned, 'retry must not duplicate XP');
});

test('rename preserves concurrent care stats and equipment and only changes the source callsign', async () => {
  const f = fixture('rename-care');
  const injected = intercept(f, 'rename', async () => {
    assert.equal((await f.act({ action: 'feed', request_id: 'care' })).accepted, true);
    f.sql.prepare("UPDATE telegram_pet_instances SET equipped_weapon='neon_bat',energy=91 WHERE pet_id=?").run('current-' + f.owner);
  });
  const before = () => f.sql.prepare('SELECT pet_xp,energy,equipped_weapon,hunger FROM telegram_pet_instances WHERE pet_id=?').get('current-' + f.owner);
  await f.act({ action: 'rename', pet_name: 'RENAMED' });
  injected();
  const saved = before();
  assert.ok(saved.pet_xp > 10000);
  assert.equal(saved.energy, 91);
  assert.equal(saved.equipped_weapon, 'neon_bat');
  assert.ok(saved.hunger < 25);
  assert.equal(f.sql.prepare('SELECT pet_name FROM telegram_pet_instances WHERE pet_id=?').get('current-' + f.owner).pet_name, 'RENAMED');
});

for (const action of ['rename', 'trade']) test(action + ' cannot mutate a replacement pet after a concurrent switch', async () => {
  const f = fixture('switch-' + action);
  f.pet('replacement', currentSeason, 500, 2);
  const injected = intercept(f, action, async () => f.active('replacement'));
  const before = f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold;
  assert.equal((await f.act({ action, pet_name: 'WRONG PET', wager: 10 })).accepted, false);
  injected();
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('replacement').pet_xp, 500);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('current-' + f.owner).pet_xp, 10000);
  assert.notEqual(f.sql.prepare('SELECT pet_name FROM telegram_pet_instances WHERE pet_id=?').get('replacement').pet_name, 'WRONG PET');
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold, before);
});

test('trade at the daily cap preserves a concurrent award without charging for rejected work', async () => {
  const f = fixture('trade-cap');
  const now = new Date();
  // A historical accepted receipt fills all but the six XP granted in the overlap.
  f.sql.prepare("INSERT INTO telegram_pet_events (id,telegram_id,pet_id,event_type,event_key,day_key,week_key,season_key,status,pet_xp_awarded) VALUES ('cap',?,?,'feed','cap',?,'week',?,'accepted',1194)")
    .run(f.owner, 'current-' + f.owner, now.toISOString().slice(0,10), currentSeason);
  const injected = intercept(f, 'trade', async () => assert.equal((await reward(f)).accepted, true));
  const before = f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold;
  assert.equal((await f.act({ action: 'trade', wager: 10 })).accepted, false);
  injected();
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold, before);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('current-' + f.owner).pet_xp, 10006);
});

test('rename rolls back its source change if the compatibility mirror fails', async () => {
  const f = fixture('rename-rollback');
  const before = f.sql.prepare('SELECT pet_name FROM telegram_pet_instances WHERE pet_id=?').get('current-' + f.owner).pet_name;
  f.sql.exec("CREATE TRIGGER fail_rename BEFORE UPDATE OF pet_name ON telegram_pet_profiles BEGIN SELECT RAISE(ABORT,'rename_mirror_failed'); END");
  await assert.rejects(f.act({ action: 'rename', pet_name: 'RETRY NAME' }), /rename_mirror_failed/);
  assert.equal(f.sql.prepare('SELECT pet_name FROM telegram_pet_instances WHERE pet_id=?').get('current-' + f.owner).pet_name, before);
  f.sql.exec('DROP TRIGGER fail_rename');
  assert.equal((await f.act({ action: 'rename', pet_name: 'RETRY NAME' })).accepted, true);
});


test('rename returns decayed care stats from the freshly committed source row', async () => {
  const f = fixture('rename-decay');
  const injected = intercept(f, 'rename', async () => {
    f.sql.prepare("UPDATE telegram_pet_instances SET energy=80,hunger=20,last_decay_at=datetime('now','-10 hours') WHERE pet_id=?").run('current-' + f.owner);
  });
  const result = await f.act({ action: 'rename', pet_name: 'DECAY TEST' });
  injected();
  assert.equal(result.accepted, true);
  assert.ok(result.pet.energy >= 57 && result.pet.energy <= 58);
  assert.ok(result.pet.hunger >= 65 && result.pet.hunger <= 66);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get('current-' + f.owner).energy, 80, 'rename must not persist a care snapshot');
});

test('Telegram rename reports a rejected concurrent switch without claiming success', async () => {
  const f = fixture('rename-command-switch');
  f.pet('replacement', currentSeason, 500, 2);
  const injected = intercept(f, 'rename', async () => f.active('replacement'));
  const originalFetch = globalThis.fetch;
  const messages = [];
  globalThis.fetch = async (url, init) => {
    messages.push(JSON.parse(init.body).text);
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  };
  try {
    await hooks.cmdPetRename(f.db, 'fixture-token', f.owner, f.owner, 'NEW NAME');
    injected();
    assert.equal(messages.length, 1);
    assert.match(messages[0], /not saved/);
    assert.doesNotMatch(messages[0], /Pet renamed|No pet found/);
  } finally { globalThis.fetch = originalFetch; }
});

for (const action of ['trade', 'buy', 'daily_chest']) test(action + ' does not erase elapsed care decay', async () => {
  const f = fixture('decay-' + action);
  f.sql.prepare("UPDATE telegram_pet_instances SET energy=80,hunger=20,happiness=80,cleanliness=80,last_decay_at=datetime('now','-10 hours') WHERE pet_id=?").run('current-' + f.owner);
  const result = action === 'trade' ? await hooks.processPetGoldTrade(f.db, f.owner, 10, { event_key: 'decay-trade' })
    : action === 'buy' ? await hooks.processPetShopPurchase(f.db, f.owner, 'moon_kibble', { event_key: 'decay-buy' })
    : await hooks.processPetDailyChest(f.db, f.owner, { event_key: 'decay-daily' });
  assert.equal(result.accepted, true);
  assert.ok(result.pet.energy >= 57 && result.pet.energy <= 58, `elapsed energy decay must survive ${action}; got ${result.pet.energy}`);
  assert.ok(result.pet.hunger >= 65 && result.pet.hunger <= 66, `elapsed hunger must survive ${action}; got ${result.pet.hunger}`);
  const refreshed = await hooks.getPetProfile(f.db, f.owner);
  assert.ok(refreshed.energy >= 57 && refreshed.energy <= 58, 'a fresh read must preserve the same elapsed decay');
  assert.ok(refreshed.hunger >= 65 && refreshed.hunger <= 66);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE status='accepted' AND event_type=?").get(action).n, 1);
});
