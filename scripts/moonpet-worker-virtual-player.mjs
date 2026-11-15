/** Production Worker-backed in-memory SQLite test fixture, no network or production D1. */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';

const SQL_FILES = [
  'schema.sql',
  'migrations/048_telegram_pet_player_expansion.sql',
  'migrations/058_telegram_pet_season_completion.sql',
  'migrations/061_moonpet_season_economy_calibration.sql',
  'migrations/085_permanent_pet_weekly_evidence.sql',
];

export function makeFixture(now) {
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
  const action = (owner,kind,payload={}) => dispatchRenderedPetAction(db,owner,{id:owner},{action:kind,...payload},'fixture-token');
  return {sql,db,storage,createPlayer,accepted,action,close:()=>storage.close()};
}
