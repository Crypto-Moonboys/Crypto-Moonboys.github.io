// Synthetic local records only. Reuse the production schema and existing recovery seeds.
import evolutions from '../workers/moonboys-api/pets/content/evolutions.json' with {type:'json'};
import {seedPr3Recovery} from './moonpet-pr3-fixture.mjs';
export const sandboxPlayers = {
  new: {pets:1,warm:false, prepare:async f=>{
    for(const table of ['telegram_pet_active_slots','telegram_pet_lifecycle_by_pet','telegram_pet_season_slots','telegram_pet_instances','telegram_pet_profiles']) f.sql.exec('DELETE FROM '+table);
  }},
  established: {pets:1},
  two: {pets:2},
  advanced: {pets:3,prepare:async f=>{for(const row of f.sql.prepare('SELECT pet_id FROM telegram_pet_instances').all()) f.reveal(row.pet_id);}},
  historical: {pets:3,prepare:async f=>seedPr3Recovery(f,{archived:true})},
};
// Seed saved unlock evidence, not a client-authoritative stage override.
for(const evolution of evolutions) sandboxPlayers['stage-'+evolution.stage]={pets:1,prepare:async f=>{
 const id='current-'+f.owner;
 f.sql.prepare('DELETE FROM telegram_pet_evolutions_by_pet WHERE pet_id=?').run(id);
 f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase=?,species_id=? WHERE pet_id=?").run(evolution.stage===0?'egg':evolution.stage===1?'young':'adult',evolution.stage===0?null:'vinyl_crab',id);
 for(const prior of evolutions.filter(e=>e.stage>0&&e.stage<=evolution.stage))f.sql.prepare('INSERT INTO telegram_pet_evolutions_by_pet(pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES(?,?,?,?,?)').run(id,f.owner,prior.evolution_id,prior.stage,'sandbox-evolution-'+prior.stage);
}};
export function savedProgress(f) {
  const tables=f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
  return Object.fromEntries(tables.map(table=>[table,f.sql.prepare('SELECT * FROM '+table+' ORDER BY 1').all().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
}
