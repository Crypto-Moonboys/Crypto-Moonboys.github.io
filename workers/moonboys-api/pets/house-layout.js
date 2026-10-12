// Persistent, cost-free MoonPet House foundation (H11 / roadmap E1).
// Every layout is owned by one permanent pet. No XP, currency, inventory,
// purchases, passive rewards, or care events are created by decorating.
import { requirePetReadResult, requirePetMutationResult } from './read-result.js';

export const PET_HOUSE_CHOICES = Object.freeze({
  wall: Object.freeze([
    Object.freeze({ key:'warehouse_brick', label:'Warehouse Brick' }),
    Object.freeze({ key:'night_wall', label:'Night Wall' }),
    Object.freeze({ key:'studio_white', label:'Studio White' }),
  ]),
  floor: Object.freeze([
    Object.freeze({ key:'concrete', label:'Concrete' }),
    Object.freeze({ key:'checkerboard', label:'Checkerboard' }),
    Object.freeze({ key:'steel', label:'Steel' }),
  ]),
  furniture: Object.freeze([
    Object.freeze({ key:'sleep_mat', label:'Sleep Mat' }),
    Object.freeze({ key:'record_deck', label:'Record Deck' }),
    Object.freeze({ key:'plant_pot', label:'Plant Pot' }),
  ]),
});

export const PET_HOUSE_DEFAULTS = Object.freeze({
  wall:'warehouse_brick', floor:'concrete', furniture:'sleep_mat',
});

export function validPetHouseChoice(slotKey, itemKey) {
  return Object.hasOwn(PET_HOUSE_CHOICES, slotKey) &&
    PET_HOUSE_CHOICES[slotKey].some(entry=>entry.key===itemKey);
}

function petHouseLayoutRead(db, owner, pet) {
  return db.prepare(`SELECT slot_key,item_key FROM telegram_pet_house_layouts
    WHERE telegram_id=? AND pet_id=? AND season_key=?`)
    .bind(String(owner),pet.pet_id,pet.season_key);
}

function petHouseProjection(result, pet) {
  const rows = requirePetReadResult(result).results;
  const layout = { ...PET_HOUSE_DEFAULTS };
  for (const row of rows) {
    if (!validPetHouseChoice(row.slot_key,row.item_key)) throw new Error('pet_house_state_invalid');
    layout[row.slot_key] = row.item_key;
  }
  return { available:true,pet_id:pet.pet_id,season_key:pet.season_key,
    layout,choices:PET_HOUSE_CHOICES,cost:{},reward:{} };
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
  const [writeResult, readResult] = await db.batch([db.prepare(`INSERT INTO telegram_pet_house_layouts
    (pet_id,telegram_id,season_key,slot_key,item_key)
    SELECT i.pet_id,i.telegram_id,i.season_key,?,?
    FROM telegram_pet_active_slots a
    JOIN telegram_pet_instances i ON i.pet_id=a.pet_id
      AND i.telegram_id=a.telegram_id AND i.season_key=a.season_key
    WHERE a.telegram_id=? AND a.pet_id=? AND i.season_key=? AND i.status='active'
    ON CONFLICT(pet_id,slot_key) DO UPDATE SET
      item_key=excluded.item_key,updated_at=CURRENT_TIMESTAMP
    WHERE telegram_pet_house_layouts.telegram_id=excluded.telegram_id
      AND telegram_pet_house_layouts.season_key=excluded.season_key`)
    .bind(slotKey,itemKey,String(owner),pet.pet_id,pet.season_key),
    petHouseLayoutRead(db,owner,pet)]);
  const result = requirePetMutationResult(writeResult);
  if (!Number.isFinite(Number(result?.meta?.changes))) throw new Error('pet_state_write_unavailable');
  if (Number(result.meta.changes)!==1) return {accepted:false,reason:'displayed_pet_changed',refresh_state:true};
  const house=petHouseProjection(readResult,pet);
  return {accepted:true,reason:'pet_house_saved',pet_house:house,refresh_state:true,
    result_copy:'House appearance saved to this pet. No Gold or XP spent.'};
}
