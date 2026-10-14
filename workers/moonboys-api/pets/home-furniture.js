// Home E2: server-priced, account-owned cosmetic furniture and per-pet placements.
// No XP, Pet lifecycle, missions, E1 free furnishing or reward ledger changes.
import { requirePetReadResult, requirePetMutationResult } from './read-result.js';
import { ensurePetAccountWalletReadyForMutation, accountWalletRecoveryResolvedSql } from './wallet-reconciliation.js';

export const PET_HOME_FURNITURE = Object.freeze({
  neon_lamp: Object.freeze({label:'Neon Lamp',slot:'left',price_gold:120}),
  speaker_stack: Object.freeze({label:'Speaker Stack',slot:'left',price_gold:240}),
  arcade_cabinet: Object.freeze({label:'Arcade Cabinet',slot:'left',price_gold:360}),
  tool_chest: Object.freeze({label:'Graffiti Tool Chest',slot:'left',price_gold:190}),
  street_sofa: Object.freeze({label:'Street Sofa',slot:'right',price_gold:390}),
  retro_tv: Object.freeze({label:'Retro Television',slot:'right',price_gold:290}),
  crystal_altar: Object.freeze({label:'Crystal Display',slot:'right',price_gold:610}),
  gold_throne: Object.freeze({label:'Gold Throne',slot:'right',price_gold:900}),
  graffiti_frame: Object.freeze({label:'Graffiti Frame',slot:'wall',price_gold:150}),
  moon_clock: Object.freeze({label:'Moon Clock',slot:'wall',price_gold:170}),
  neon_sign: Object.freeze({label:'Neon Sign',slot:'wall',price_gold:350}),
  trophy_shelf: Object.freeze({label:'Trophy Shelf',slot:'wall',price_gold:470}),
});
export const PET_FURNITURE_SLOTS = Object.freeze(['left','right','wall']);

function ownedAndPlacedQuery(db,owner,pet) {
  return db.prepare("SELECT 'owned' AS kind,item_key,NULL AS slot_key FROM telegram_pet_furniture_unlocks WHERE telegram_id=? " +
    "UNION ALL SELECT 'placed' AS kind,item_key,slot_key FROM telegram_pet_furniture_placements " +
    "WHERE telegram_id=? AND pet_id=? AND season_key=?")
    .bind(String(owner),String(owner),pet.pet_id,pet.season_key);
}
function mainRoomArrangementQuery(db,owner,pet) {
  return db.prepare("SELECT 1 AS saved FROM telegram_pet_room_furniture r " +
    "JOIN telegram_pet_active_slots a ON a.telegram_id=r.telegram_id " +
    "AND a.pet_id=r.pet_id AND a.season_key=r.season_key " +
    "WHERE r.telegram_id=? AND r.pet_id=? AND r.season_key=? AND r.room_key='main'")
    .bind(String(owner),pet.pet_id,pet.season_key);
}
function projectFurniture(result,pet) {
  const owned=new Set();
  const placements={left:null,right:null,wall:null};
  for(const row of requirePetReadResult(result).results) {
    const item=PET_HOME_FURNITURE[row.item_key];
    if(!item) throw new Error('pet_furniture_state_invalid');
    if(row.kind==='owned') owned.add(row.item_key);
    else if(row.kind==='placed' && PET_FURNITURE_SLOTS.includes(row.slot_key) && item.slot===row.slot_key)
      placements[row.slot_key]=row.item_key;
    else throw new Error('pet_furniture_state_invalid');
  }
  if(Object.values(placements).some(key=>key&&!owned.has(key))) throw new Error('pet_furniture_state_invalid');
  return {available:true,pet_id:pet.pet_id,season_key:pet.season_key,
    owned:[...owned],placements,catalog:PET_HOME_FURNITURE};
}
export async function readPetFurnitureState(db,owner,pet) {
  if(!pet?.pet_id||!pet?.season_key) return {available:false,reason:'pet_furniture_source_required'};
  return projectFurniture(await ownedAndPlacedQuery(db,owner,pet).all(),pet);
}
export async function buyPetFurniture(db,owner,pet,itemKey,eventKey) {
  const item=Object.hasOwn(PET_HOME_FURNITURE,itemKey)?PET_HOME_FURNITURE[itemKey]:null;
  if(!item||!pet?.pet_id||!pet?.season_key||typeof eventKey!=='string'||!eventKey)
    return {accepted:false,reason:'pet_furniture_invalid'};
  const price=item.price_gold;
  if (!(await ensurePetAccountWalletReadyForMutation(db,owner)))
    return {accepted:false,reason:'wallet_reconciliation_recovery_pending',refresh_state:true};
  // One D1 batch = one SQLite transaction. The receipt INSERT is contingent on
  // the previous conditional debit (changes()=1). Any SQL failure rolls back.
  const [debit,unlock,owned,wallet]=await db.batch([
    db.prepare("UPDATE telegram_pet_profiles SET moon_gold=moon_gold-?,updated_at=CURRENT_TIMESTAMP " +
      "WHERE telegram_id=? AND moon_gold>=? AND " + accountWalletRecoveryResolvedSql('telegram_pet_profiles.telegram_id') + " " +
      "AND NOT EXISTS(SELECT 1 FROM telegram_pet_furniture_unlocks WHERE telegram_id=? AND item_key=?) " +
      "AND EXISTS(SELECT 1 FROM telegram_pet_active_slots a " +
      "JOIN telegram_pet_instances p ON p.pet_id=a.pet_id AND p.telegram_id=a.telegram_id AND p.season_key=a.season_key " +
      "JOIN telegram_pet_season_slots s ON s.pet_id=p.pet_id AND s.telegram_id=p.telegram_id AND s.season_key=p.season_key " +
      "WHERE a.telegram_id=? AND a.pet_id=? AND p.season_key=? AND p.status='active' AND s.status='active')")
      .bind(price,String(owner),price,String(owner),itemKey,String(owner),pet.pet_id,pet.season_key),
    db.prepare("INSERT INTO telegram_pet_furniture_unlocks(telegram_id,item_key,price_gold,purchase_event_key) " +
      "SELECT ?,?,?,? WHERE changes()=1").bind(String(owner),itemKey,price,eventKey),
    db.prepare("SELECT item_key,price_gold,purchase_event_key FROM telegram_pet_furniture_unlocks " +
      "WHERE telegram_id=? AND item_key=?").bind(String(owner),itemKey),
    db.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?").bind(String(owner)),
  ]);
  const debited=Number(requirePetMutationResult(debit)?.meta?.changes);
  const unlocked=Number(requirePetMutationResult(unlock)?.meta?.changes);
  const receipt=requirePetReadResult(owned).results[0];
  const balance=requirePetReadResult(wallet).results[0];
  if(debited===1&&unlocked===1&&receipt?.price_gold===price)
    return {accepted:true,reason:'pet_furniture_purchased',item_key:itemKey,
      cost:{moon_gold:price},moon_gold_remaining:Number(balance?.moon_gold),refresh_state:true,
      result_copy:item.label+' purchased permanently. Place it in Home Customization.'};
  if(debited===0&&unlocked===0&&receipt)
    return {accepted:true,duplicate:true,reason:'pet_furniture_owned',item_key:itemKey,refresh_state:true,
      result_copy:'Already owned. No additional Gold charged.'};
  if(debited===0&&unlocked===0&&!receipt)
    return {accepted:false,reason:'pet_furniture_insufficient_gold',cost:{moon_gold:price},refresh_state:true};
  throw new Error('pet_furniture_purchase_inconsistent');
}
export async function placePetFurniture(db,owner,pet,itemKey,slotKey) {
  const item=Object.hasOwn(PET_HOME_FURNITURE,itemKey)?PET_HOME_FURNITURE[itemKey]:null;
  if(!item||item.slot!==slotKey||!pet?.pet_id||!pet?.season_key)
    return {accepted:false,reason:'pet_furniture_placement_invalid'};
  const [saved,read,arrangement]=await db.batch([
    db.prepare("INSERT INTO telegram_pet_furniture_placements(pet_id,telegram_id,season_key,slot_key,item_key) " +
      "SELECT p.pet_id,p.telegram_id,p.season_key,?,? FROM telegram_pet_active_slots a " +
      "JOIN telegram_pet_instances p ON p.pet_id=a.pet_id AND p.telegram_id=a.telegram_id AND p.season_key=a.season_key " +
      "JOIN telegram_pet_season_slots s ON s.pet_id=p.pet_id AND s.telegram_id=p.telegram_id AND s.season_key=p.season_key " +
      "JOIN telegram_pet_furniture_unlocks u ON u.telegram_id=p.telegram_id AND u.item_key=? " +
      "WHERE a.telegram_id=? AND a.pet_id=? AND p.season_key=? AND p.status='active' AND s.status='active' " +
      "AND NOT EXISTS(SELECT 1 FROM telegram_pet_room_furniture r " +
      "WHERE r.telegram_id=p.telegram_id AND r.pet_id=p.pet_id AND r.season_key=p.season_key AND r.room_key='main') " +
      "ON CONFLICT(pet_id,slot_key) DO UPDATE SET item_key=excluded.item_key,updated_at=CURRENT_TIMESTAMP " +
      "WHERE telegram_pet_furniture_placements.telegram_id=excluded.telegram_id " +
      "AND telegram_pet_furniture_placements.season_key=excluded.season_key")
      .bind(slotKey,itemKey,itemKey,String(owner),pet.pet_id,pet.season_key),
    ownedAndPlacedQuery(db,owner,pet),
    mainRoomArrangementQuery(db,owner,pet),
  ]);
  const changed=Number(requirePetMutationResult(saved)?.meta?.changes);
  const furniture=projectFurniture(read,pet);
  const hasMainArrangement=requirePetReadResult(arrangement).results.length>0;
  if(changed!==1) return {accepted:false,reason:hasMainArrangement?'pet_room_furniture_authoritative':'pet_furniture_not_owned',refresh_state:true};
  return {accepted:true,reason:'pet_furniture_placed',furniture,refresh_state:true,
    result_copy:'Placed in this pet’s main Home canvas. No Gold spent.'};
}
export async function removePetFurniture(db,owner,pet,slotKey) {
  if(!PET_FURNITURE_SLOTS.includes(slotKey)||!pet?.pet_id||!pet?.season_key)
    return {accepted:false,reason:'pet_furniture_placement_invalid'};
  const [removed,read,arrangement]=await db.batch([
    db.prepare("DELETE FROM telegram_pet_furniture_placements WHERE pet_id=? AND telegram_id=? AND season_key=? AND slot_key=? " +
      "AND EXISTS(SELECT 1 FROM telegram_pet_active_slots a " +
      "JOIN telegram_pet_instances p ON p.pet_id=a.pet_id AND p.telegram_id=a.telegram_id AND p.season_key=a.season_key " +
      "WHERE a.telegram_id=? AND a.pet_id=? AND p.season_key=? AND p.status='active') " +
      "AND NOT EXISTS(SELECT 1 FROM telegram_pet_room_furniture r " +
      "WHERE r.telegram_id=? AND r.pet_id=? AND r.season_key=? AND r.room_key='main')")
      .bind(pet.pet_id,String(owner),pet.season_key,slotKey,String(owner),pet.pet_id,pet.season_key,String(owner),pet.pet_id,pet.season_key),
    ownedAndPlacedQuery(db,owner,pet),
    mainRoomArrangementQuery(db,owner,pet),
  ]);
  requirePetMutationResult(removed);
  const furniture=projectFurniture(read,pet);
  if(requirePetReadResult(arrangement).results.length)
    return {accepted:false,reason:'pet_room_furniture_authoritative',refresh_state:true};
  return {accepted:true,reason:'pet_furniture_removed',furniture,refresh_state:true,
    result_copy:'Removed from this pet’s Home. Account ownership retained.'};
}
