import { PET_HOME_FURNITURE } from './home-furniture.js';
import { requirePetReadResult, requirePetMutationResult } from './read-result.js';

export const FURNITURE_ROOMS = Object.freeze(['main','kitchen','garden','gym']);
export const FREE_FURNITURE = Object.freeze({sleep_mat:{width:44,height:130},record_deck:{width:35,height:113},plant_pot:{width:74,height:86}});
export function validArrangement(room, items) {
  if(!FURNITURE_ROOMS.includes(room)||!Array.isArray(items)||items.length>8) return false;
  const keys=new Set();
  return items.every(item=>{
    if(!item||typeof item.key!=='string'||keys.has(item.key))return false;
    keys.add(item.key);
    const free=Object.hasOwn(FREE_FURNITURE,item.key)?FREE_FURNITURE[item.key]:null;
    const paid=Object.hasOwn(PET_HOME_FURNITURE,item.key)?PET_HOME_FURNITURE[item.key]:null;
    if(!free&&!paid||free&&room!=='main')return false;
    const size=free||{width:paid.slot==='wall'?75:50,height:49};
    return Number.isInteger(item.x)&&Number.isInteger(item.y)&&item.x>=0&&item.y>=20&&item.x<=320-size.width&&item.y<=220-size.height;
  });
}
export async function readRoomFurniture(db,owner,pet,owned) {
  const rows=requirePetReadResult(await db.prepare('SELECT room_key,items_json FROM telegram_pet_room_furniture WHERE telegram_id=? AND pet_id=? AND season_key=?').bind(String(owner),pet.pet_id,pet.season_key).all()).results;
  const arrangements={};
  for(const row of rows){
    const items=JSON.parse(row.items_json);
    if(!validArrangement(row.room_key,items)||items.some(item=>!Object.hasOwn(FREE_FURNITURE,item.key)&&!owned.includes(item.key)))throw new Error('pet_room_furniture_invalid');
    arrangements[row.room_key]=items;
  }
  return arrangements;
}
export async function saveRoomFurniture(db,owner,pet,room,items) {
  if(!pet?.pet_id||!pet?.season_key||!validArrangement(room,items))return {accepted:false,reason:'pet_room_furniture_invalid'};
  const json=JSON.stringify(items.map(({key,x,y})=>({key,x,y})));
  // One transaction guards active pet + ownership, writes at most eight items,
  // then reads the receipt. No balance, reward or legacy-placement writes.
  const [write,read]=await db.batch([
    db.prepare("INSERT INTO telegram_pet_room_furniture(pet_id,telegram_id,season_key,room_key,items_json) SELECT p.pet_id,p.telegram_id,p.season_key,?,? FROM telegram_pet_active_slots a JOIN telegram_pet_instances p ON p.pet_id=a.pet_id AND p.telegram_id=a.telegram_id AND p.season_key=a.season_key JOIN telegram_pet_season_slots s ON s.pet_id=p.pet_id AND s.telegram_id=p.telegram_id AND s.season_key=p.season_key WHERE a.telegram_id=? AND a.pet_id=? AND p.season_key=? AND p.status='active' AND s.status='active' AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.key') NOT IN ('sleep_mat','record_deck','plant_pot') AND NOT EXISTS(SELECT 1 FROM telegram_pet_furniture_unlocks u WHERE u.telegram_id=p.telegram_id AND u.item_key=json_extract(j.value,'$.key'))) ON CONFLICT(pet_id,room_key) DO UPDATE SET items_json=excluded.items_json,updated_at=CURRENT_TIMESTAMP WHERE telegram_pet_room_furniture.telegram_id=excluded.telegram_id AND telegram_pet_room_furniture.season_key=excluded.season_key")
      .bind(room,json,String(owner),pet.pet_id,pet.season_key,json),
    db.prepare('SELECT items_json FROM telegram_pet_room_furniture WHERE telegram_id=? AND pet_id=? AND season_key=? AND room_key=?').bind(String(owner),pet.pet_id,pet.season_key,room)
  ]);
  const receipt=requirePetReadResult(read).results[0];
  if(Number(requirePetMutationResult(write)?.meta?.changes)!==1||receipt?.items_json!==json)return {accepted:false,reason:'pet_room_furniture_not_owned',refresh_state:true};
  return {accepted:true,reason:'pet_room_furniture_saved',refresh_state:true,result_copy:'Room arrangement saved. No Gold spent.'};
}
