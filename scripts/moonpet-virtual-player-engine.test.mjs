#!/usr/bin/env node
/**
 * Moonpet virtual-player engine smoke/attendance harness.
 * Runs production Moonpet action dispatch through in-memory SQLite.
 * NEVER connects to production D1, Telegram, or real accounts.
 *
 * Usage: node --test scripts/moonpet-virtual-player-engine.test.mjs
 * Extend to full 365-day / 10k-player campaigns only after this real-action
 * fixture, clock parity, and throughput have been verified.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const UTC_BASE = Date.parse('2026-11-01T08:00:00.000Z');
const DAY_MS = 86_400_000;
const DAY = ['feed', 'play', 'clean'];
const SQL_FILES = [
  'schema.sql',
  'migrations/048_telegram_pet_player_expansion.sql',
  'migrations/058_telegram_pet_season_completion.sql',
  'migrations/061_moonpet_season_economy_calibration.sql',
];

function makeFixture(now) {
  const storage = new DatabaseSync(':memory:');
  const timestamp = () => new Date(now()).toISOString().replace('T',' ').slice(0,19);
  const clockSql = sql => sql
    .replace(/\bCURRENT_TIMESTAMP\b/g, "'" + timestamp() + "'")
    .replace(/'now'/g, "'" + timestamp() + "'");
  const sql = {
    prepare(query) { return storage.prepare(clockSql(query)); },
    exec(query) { return storage.exec(clockSql(query)); },
  };
  for (const file of SQL_FILES) sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/' + file, import.meta.url), 'utf8'));

  class Statement {
    constructor(query,args=[]) { this.query=query; this.args=args; }
    bind(...args) { return new Statement(this.query,args); }
    async first() { return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return {success:true,results:sql.prepare(this.query).all(...this.args)}; }
    exec() {
      const statement=sql.prepare(this.query);
      if (statement.columns().length) {
        const results=statement.all(...this.args);
        return {success:true,results,meta:{changes:/\bRETURNING\b/i.test(this.query)?results.length:0}};
      }
      const result=statement.run(...this.args);
      return {success:true,results:[],meta:{changes:Number(result.changes)}};
    }
    async run() { return this.exec(); }
  }
  const db={
    prepare(query){return new Statement(query);},
    async batch(statements){
      sql.exec('BEGIN IMMEDIATE');
      try{
        const result=statements.map(statement=>statement.exec());
        sql.exec('COMMIT');
        return result;
      }catch(error){sql.exec('ROLLBACK');throw error;}
    },
  };
  function createPlayer(owner){
    sql.prepare('INSERT INTO telegram_users(telegram_id,first_name,xp,level) VALUES (?,?,0,1)').run(owner,owner);
    sql.prepare('INSERT INTO telegram_pet_profiles(telegram_id,pet_xp,energy) VALUES (?,200,100)').run(owner);
    sql.prepare("INSERT OR IGNORE INTO telegram_seasons(name,start_date,end_date) VALUES ('Community','2000-01-01','2999-01-01')").run();
    const season=hooks.getPetSeasonInfo(new Date(now())).key,petId='virtual-'+owner;
    sql.prepare("INSERT INTO telegram_pet_season_slots(pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,1,'free')").run(petId,owner,season);
    sql.prepare("INSERT INTO telegram_pet_instances(pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at) VALUES (?,?,?,1,200,100,'0001-01-01 00:00:00')").run(petId,owner,season);
    sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet(pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,'young','vinyl_crab','{}','[]')").run(petId,owner,petId);
    sql.prepare("INSERT INTO telegram_pet_active_slots(telegram_id,pet_id,season_key) VALUES (?,?,?)").run(owner,petId,season);
    return {owner,petId};
  }
  const accepted = owner => sql.prepare("SELECT event_type, created_at, pet_xp_awarded FROM telegram_pet_events WHERE telegram_id=? AND status='accepted' ORDER BY created_at,id").all(owner);
  const action = (owner,kind) => hooks.processPetMiniAppAction(db,owner,{id:owner},{action:kind},'fixture-token');
  return {sql,db,storage,createPlayer,accepted,action,close:()=>storage.close()};
}

test('virtual UTC days execute real accepted care and cooldown enforcement',async t=>{
  // Use the same fake JS time for Worker timestamps and SQLite clock functions.
  t.mock.timers.enable({apis:['Date'],now:UTC_BASE});
  const f=makeFixture(()=>Date.now());
  try {
    const p=f.createPlayer('virtual-regular');
    const rows=[];
    for(let day=0;day<7;day++){
      t.mock.timers.setTime(UTC_BASE+day*DAY_MS);
      let completed=0;
      for(const care of DAY){
        const result=await f.action(p.owner,care);
        assert.equal(result.accepted,true,JSON.stringify({day,care,result}));
        completed++;
        // Human can complete a different action immediately, but a duplicate
        // of the SAME action inside its 45-second cooldown must be rejected.
        const repeat=await f.action(p.owner,care);
        assert.equal(repeat.accepted,false,'cooldown must reject duplicate same-action care');
      }
      rows.push({day:day+1,completed});
    }
    assert.equal(rows.length,7);
    assert.ok(rows.every(row=>row.completed===3));
    const accepted=f.accepted(p.owner).filter(row=>DAY.includes(row.event_type));
    assert.equal(accepted.length,21,'only accepted care receipts count, not button attempts');
    assert.equal(new Set(accepted.map(row=>row.created_at.slice(0,10))).size,7);
    const saved=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(p.petId);
    assert.ok(Number(saved.pet_xp)>200,'real Worker care actions must persist XP');
  } finally {f.close();t.mock.timers.reset();}
});

test('virtual absence never invents accepted care',async t=>{
  t.mock.timers.enable({apis:['Date'],now:UTC_BASE});
  const f=makeFixture(()=>Date.now());
  try {
    const p=f.createPlayer('virtual-absent');
    t.mock.timers.setTime(UTC_BASE);
    assert.equal((await f.action(p.owner,'feed')).accepted,true);
    t.mock.timers.setTime(UTC_BASE+7*DAY_MS);
    const accepted=f.accepted(p.owner).filter(row=>DAY.includes(row.event_type));
    assert.equal(accepted.length,1);
    assert.equal(new Set(accepted.map(row=>row.created_at.slice(0,10))).size,1);
    // Attaching a debt simulator to this evidence is deliberately future work:
    // no runtime neglect ledger or midnight settlement exists in this PR.
  } finally {f.close();t.mock.timers.reset();}
});
