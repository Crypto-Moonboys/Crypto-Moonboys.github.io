import { PET_COSMETIC_SINKS } from './economy-phase-3.js';
import { requirePetFirstReadResult, requirePetReadResult } from './read-result.js';
export const STYLE_DETAILS = Object.freeze({
  profile_frame:'Neon border around your game canvas.',
  victory_pose:'Idle victory pose using your bot’s existing victory animation.',
  run_trail:'Pixel trail behind your bot on the Explore screen.',
});
export async function getStyleLoadout(db, owner, petId) {
  const rows = requirePetReadResult(await db.prepare(`SELECT s.cosmetic_key FROM telegram_pet_style_loadouts s
    JOIN telegram_pet_cosmetic_unlocks u ON u.telegram_id=s.telegram_id AND u.cosmetic_key=s.cosmetic_key AND u.quantity>0
    WHERE s.telegram_id=? AND s.pet_id=? AND s.enabled=1`).bind(owner,petId).all());
  return { available:true, equipped:rows.results.map(row=>row.cosmetic_key).filter(key=>Object.hasOwn(STYLE_DETAILS,key)), details:STYLE_DETAILS };
}
export async function equipPetStyle(db, owner, pet, request) {
  if (!pet?.pet_id || request.pet_id!==pet.pet_id || !Object.hasOwn(PET_COSMETIC_SINKS,request.cosmetic_key) || typeof request.enabled!=='boolean') return {accepted:false,reason:'style_invalid'};
  const row=await db.prepare(`INSERT INTO telegram_pet_style_loadouts (pet_id,telegram_id,cosmetic_key,enabled)
    SELECT p.pet_id,p.telegram_id,?,? FROM telegram_pet_instances p
    JOIN telegram_pet_active_slots a ON a.pet_id=p.pet_id AND a.telegram_id=p.telegram_id AND a.season_key=p.season_key
    JOIN telegram_pet_cosmetic_unlocks u ON u.telegram_id=p.telegram_id AND u.cosmetic_key=? AND u.quantity>0
    WHERE p.pet_id=? AND p.telegram_id=? AND p.status='active'
    ON CONFLICT(pet_id,cosmetic_key) DO UPDATE SET enabled=excluded.enabled
    RETURNING cosmetic_key`).bind(request.cosmetic_key,request.enabled?1:0,request.cosmetic_key,pet.pet_id,owner).first().then(requirePetFirstReadResult);
  return {accepted:!!row,reason:row?'style_equipped':'style_not_owned',result_copy:row?(request.enabled?'Style equipped.':'Style removed.')+' No currency cost.':undefined};
}
