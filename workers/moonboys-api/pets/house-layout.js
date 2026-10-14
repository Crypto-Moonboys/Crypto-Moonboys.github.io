// Persistent, cost-free MoonPet House foundation (H11 / roadmap E1).
// Every layout is owned by one permanent pet. No XP, currency, inventory,
// purchases, passive rewards, or care events are created by decorating.
import { requirePetReadResult, requirePetMutationResult } from './read-result.js';

export const PET_HOUSE_CHOICES = Object.freeze({
  room: Object.freeze([
    Object.freeze({ key:'kitchen', label:'Kitchen' }),
    Object.freeze({ key:'garden', label:'Garden' }),
    Object.freeze({ key:'gym', label:'Gym' }),
  ]),
  wall: Object.freeze([
    Object.freeze({ key:'warehouse_brick', label:'Warehouse Brick' }),
    Object.freeze({ key:'night_wall', label:'Night Wall' }),
    Object.freeze({ key:'studio_white', label:'Studio White' }),
  ]),
  floor: Object.freeze([
    Object.freeze({ key:'concrete', label:'NEON MATT' }),
    Object.freeze({ key:'checkerboard', label:'GOLD MATT' }),
    Object.freeze({ key:'steel', label:'CAMO MATT' }),
  ]),
  furniture: Object.freeze([
    Object.freeze({ key:'sleep_mat', label:'Fish Tank' }),
    Object.freeze({ key:'record_deck', label:'Lava Lamp' }),
    Object.freeze({ key:'plant_pot', label:'Plant Pot' }),
  ]),
});

export const PET_HOUSE_DEFAULTS = Object.freeze({
  room:'main', wall:'warehouse_brick', floor:'concrete', furniture:'sleep_mat',
});

export function validPetHouseChoice(slotKey, itemKey) {
  if (slotKey==='room' && itemKey==='main') return true; // explicit reset, not a fourth replacement option
  return Object.hasOwn(PET_HOUSE_CHOICES, slotKey) &&
    PET_HOUSE_CHOICES[slotKey].some(entry=>entry.key===itemKey);
}

function petHouseLayoutRead(db, owner, pet) {
  return db.prepare(`SELECT slot_key,item_key FROM telegram_pet_house_layouts
    WHERE telegram_id=? AND pet_id=? AND season_key=?
    UNION ALL SELECT 'room' AS slot_key,room_key AS item_key FROM telegram_pet_house_rooms
    WHERE telegram_id=? AND pet_id=? AND season_key=?`)
    .bind(String(owner),pet.pet_id,pet.season_key,String(owner),pet.pet_id,pet.season_key);
}

function petHouseProjection(result, pet) {
  const rows = requirePetReadResult(result).results;
  const layout = { ...PET_HOUSE_DEFAULTS };
  for (const row of rows) {
    if (!validPetHouseChoice(row.slot_key,row.item_key)) throw new Error('pet_house_state_invalid');
    layout[row.slot_key] = row.item_key;
  }
  return { available:true,pet_id:pet.pet_id,season_key:pet.season_key,
    layout,floor_saved:rows.some(row=>row.slot_key==='floor'),choices:PET_HOUSE_CHOICES,cost:{},reward:{} };
}

export async function readPetHouseLayout(db, owner, pet) {
  if (!pet?.pet_id || !pet.season_key) return { available:false, reason:'pet_house_source_required' };
  return petHouseProjection(await petHouseLayoutRead(db,owner,pet).all(),pet);
}

export async function setPetHouseLayout(db, owner, pet, slotKey, itemKey) {
  if (!validPetHouseChoice(slotKey,itemKey))
    return {accepted:false,reason:'pet_house_choice_invalid'};
  if (!pet?.pet_id || !pet.season_key)
    return {accepted:false,reason:'pet_house_source_required',refresh_state:true};
  // A selected pet is checked before dispatch; this guarded INSERT checks it
  // again inside the mutation, so switching pets cannot write the old house.
  if (slotKey==='room') {
    const [writeResult,readResult] = await db.batch([db.prepare(`INSERT INTO telegram_pet_house_rooms
      (pet_id,telegram_id,season_key,room_key)
      SELECT i.pet_id,i.telegram_id,i.season_key,?
      FROM telegram_pet_active_slots a
      JOIN telegram_pet_instances i ON i.pet_id=a.pet_id
        AND i.telegram_id=a.telegram_id AND i.season_key=a.season_key
      WHERE a.telegram_id=? AND a.pet_id=? AND i.season_key=? AND i.status='active'
      ON CONFLICT(pet_id) DO UPDATE SET room_key=excluded.room_key,updated_at=CURRENT_TIMESTAMP
      WHERE telegram_pet_house_rooms.telegram_id=excluded.telegram_id
        AND telegram_pet_house_rooms.season_key=excluded.season_key`)
      .bind(itemKey,String(owner),pet.pet_id,pet.season_key),petHouseLayoutRead(db,owner,pet)]);
    const result=requirePetMutationResult(writeResult);
    if (!Number.isFinite(Number(result?.meta?.changes))) throw new Error('pet_state_write_unavailable');
    if (Number(result.meta.changes)!==1) return {accepted:false,reason:'displayed_pet_changed',refresh_state:true};
    return {accepted:true,reason:'pet_house_saved',pet_house:petHouseProjection(readResult,pet),refresh_state:true,
      result_copy:'Home room saved to this pet. No Gold or XP spent.'};
  }
  const arrangementGuard = slotKey==='furniture'
    ? `AND NOT EXISTS(SELECT 1 FROM telegram_pet_room_furniture r
        WHERE r.pet_id=i.pet_id AND r.telegram_id=i.telegram_id
          AND r.season_key=i.season_key AND r.room_key='main')`
    : '';
  const statements = [db.prepare(`INSERT INTO telegram_pet_house_layouts
    (pet_id,telegram_id,season_key,slot_key,item_key)
    SELECT i.pet_id,i.telegram_id,i.season_key,?,?
    FROM telegram_pet_active_slots a
    JOIN telegram_pet_instances i ON i.pet_id=a.pet_id
      AND i.telegram_id=a.telegram_id AND i.season_key=a.season_key
    WHERE a.telegram_id=? AND a.pet_id=? AND i.season_key=? AND i.status='active'
    ${arrangementGuard}
    ON CONFLICT(pet_id,slot_key) DO UPDATE SET
      item_key=excluded.item_key,updated_at=CURRENT_TIMESTAMP
    WHERE telegram_pet_house_layouts.telegram_id=excluded.telegram_id
      AND telegram_pet_house_layouts.season_key=excluded.season_key`)
    .bind(slotKey,itemKey,String(owner),pet.pet_id,pet.season_key),
    petHouseLayoutRead(db,owner,pet)];
  if(slotKey==='furniture') statements.push(db.prepare(`SELECT EXISTS(
    SELECT 1 FROM telegram_pet_room_furniture r
    JOIN telegram_pet_active_slots a
      ON a.telegram_id=r.telegram_id AND a.pet_id=r.pet_id AND a.season_key=r.season_key
    WHERE r.telegram_id=? AND r.pet_id=? AND r.season_key=? AND r.room_key='main') AS saved`)
    .bind(String(owner),pet.pet_id,pet.season_key));
  const [writeResult, readResult, arrangementResult] = await db.batch(statements);
  const result = requirePetMutationResult(writeResult);
  if (!Number.isFinite(Number(result?.meta?.changes))) throw new Error('pet_state_write_unavailable');
  const arrangementSaved=slotKey==='furniture'&&Number(requirePetReadResult(arrangementResult).results[0]?.saved)===1;
  if (Number(result.meta.changes)!==1) {
    return {accepted:false,reason:arrangementSaved?'pet_room_furniture_authoritative':'displayed_pet_changed',refresh_state:true};
  }
  const house=petHouseProjection(readResult,pet);
  return {accepted:true,reason:'pet_house_saved',pet_house:house,refresh_state:true,
    result_copy:'House appearance saved to this pet. No Gold or XP spent.'};
}
