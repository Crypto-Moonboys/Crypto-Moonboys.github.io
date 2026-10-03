import { requirePetFirstReadResult } from './read-result.js';

// Compare values and durable receipt counts, not a second-resolution timestamp.
// Capturing before the first economic read and validating after the last prevents
// header/shop/rankings from mixing snapshots, including another pet's payout.
export async function capturePetEconomy(db, owner) {
  const row = await db.prepare(`SELECT json_object(
    'wallet',json_array(p.moon_gold,p.moon_crystals,p.style_tokens),
    'pets',json((SELECT json_group_array(json_array(pet_id,pet_xp)) FROM
      (SELECT pet_id,pet_xp FROM telegram_pet_instances WHERE telegram_id=p.telegram_id ORDER BY pet_id))),
    'seasons',json((SELECT json_group_array(json_array(season_key,season_xp)) FROM
      (SELECT season_key,season_xp FROM telegram_pet_season_state WHERE telegram_id=p.telegram_id AND season_xp>0 ORDER BY season_key))),
    'items',json((SELECT json_group_array(json_array(asset_type,asset_key,quantity)) FROM
      (SELECT asset_type,asset_key,quantity FROM telegram_pet_inventory WHERE telegram_id=p.telegram_id AND quantity>0 ORDER BY asset_type,asset_key))),
    'materials',json((SELECT json_group_array(json_array(material_key,quantity)) FROM
      (SELECT material_key,quantity FROM telegram_pet_material_balances WHERE telegram_id=p.telegram_id AND quantity>0 ORDER BY material_key))),
    'events',(SELECT COUNT(*) FROM telegram_pet_events WHERE telegram_id=p.telegram_id AND status='accepted'),
    'claims',(SELECT COUNT(*) FROM telegram_pet_reward_claims WHERE telegram_id=p.telegram_id AND status='awarded' AND source<>'wallet_reconciliation'),
    'systems',(SELECT COUNT(*) FROM telegram_pet_system_events WHERE telegram_id=p.telegram_id AND status='completed')
    ) AS economic_snapshot FROM telegram_pet_profiles p WHERE p.telegram_id=?`)
    .bind(String(owner)).first().then(requirePetFirstReadResult);
  if (row && typeof row.economic_snapshot !== 'string') throw new Error('pet_state_read_unavailable');
  return row?.economic_snapshot ?? null;
}

export async function assertPetEconomy(db, owner, snapshot) {
  if (snapshot !== await capturePetEconomy(db, owner)) throw new Error('pet_state_source_changed');
}

// A partial caller may supply a pet it read before starting this projection.
// Reject that stale header even when the account stays quiet afterward.
export function assertPetEconomySource(snapshot, pet) {
  if (!snapshot || !pet) return;
  const saved = JSON.parse(snapshot);
  const xp = saved.pets.find(row => row[0] === pet.pet_id)?.[1];
  if (xp !== pet.pet_xp || ['moon_gold','moon_crystals','style_tokens'].some((key, index) =>
    Object.hasOwn(pet, key) && pet[key] !== saved.wallet[index])) throw new Error('pet_state_source_changed');
}
