import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { readPetLeaderboard } from '../workers/moonboys-api/pets/leaderboard.js';
import { getMoonpetSeasonInfo } from '../workers/moonboys-api/pets/season-authority.js';

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
const season = getMoonpetSeasonInfo().key;
for (const [owner, xp] of [['100',900],['200',700],['300',500]]) {
  sql.prepare('INSERT INTO telegram_users (telegram_id) VALUES (?)').run(owner);
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp) VALUES (?,?)').run(owner,xp);
  sql.prepare('INSERT INTO telegram_pet_season_state (telegram_id,season_key,season_xp) VALUES (?,?,?)').run(owner,season,xp);
}
function pet(owner,id,slot,xp,sourceSeason=season) {
  sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,?,'free')").run(id,owner,sourceSeason,slot);
  sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,source_profile_updated_at) VALUES (?,?,?,?,?,'0001-01-01 00:00:00')").run(id,owner,sourceSeason,slot,xp);
  sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,'adult','vinyl_crab','{}','[]')").run(id,owner,id);
}
pet('100','pet-100-active',1,900);pet('100','pet-100-old',1,100,'pet-s2025-001');
pet('200','pet-200-active',1,700);
for (const owner of ['100','200']) sql.prepare('INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner,`pet-${owner}-active`,season);
for (const [owner,id,stage,evolution] of [['100','pet-100-active',2,'cyber_moonpet'],['100','pet-100-old',5,'legendary_moon_guardian'],['200','pet-200-active',3,'elite_moonpet']]) {
  sql.prepare('INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,?,?,?)').run(id,owner,evolution,stage,'evo-'+id);
}
sql.prepare("INSERT INTO telegram_pet_evolutions (telegram_id,evolution_id,stage,unlock_event_key) VALUES ('300','street_moonpet',1,'legacy')").run();
sql.prepare("INSERT INTO telegram_pet_lifecycle (telegram_id,identity_seed,phase,species_id) VALUES ('300','legacy','young','bubble_ram')").run();
const db = {prepare(query) {return {bind(...args) {return {async all() {return {results:sql.prepare(query).all(...args)};}};}};}};
const changes=sql.prepare('SELECT total_changes() n').get().n;
const board=await readPetLeaderboard(db,{period:'seasonal',limit:10});
assert.deepEqual(board.rows.map((r)=>r.telegram_id),['100','200','300']);
assert.deepEqual(board.rows.map((r)=>r.evolution_stage),[2,3,1]);
assert.equal(board.rows[0].stage,'cyber_moonpet');
assert.equal(board.rows[0].lifecycle_species_id,'vinyl_crab');
assert.equal(board.rows[2].lifecycle_species_id,'bubble_ram','persisted legacy identity is read without creating a new pet');
assert.equal(sql.prepare('SELECT total_changes() n').get().n,changes);
// A per-pet account may not inherit its old account-wide evolution if the
// current pet has no evolution record, or if the pointer has a wrong season.
sql.prepare("DELETE FROM telegram_pet_evolutions_by_pet WHERE pet_id='pet-100-active'").run();
sql.prepare("INSERT INTO telegram_pet_evolutions (telegram_id,evolution_id,stage,unlock_event_key) VALUES ('100','legendary_moon_guardian',5,'legacy-100')").run();
assert.equal((await readPetLeaderboard(db)).rows[0].evolution_stage,0);
sql.prepare("UPDATE telegram_pet_active_slots SET season_key='wrong' WHERE telegram_id='200'").run();
assert.equal((await readPetLeaderboard(db)).rows[1].lifecycle_species_id,null);
console.log('Shared Moonpet ranking SQL passed: current-season initial scores, source ownership, legacy reads and hidden identity boundaries');
