// Home E3: one server-timed garden plot per persistent MoonPet.
// Kitchen and Gym deliberately reuse the existing crafting/Train authorities;
// this module introduces only the garden timer and harvest of the existing
// garden_veggies consumable. No XP, currency, mission credit or new token.
import { requirePetFirstReadResult, requirePetReadResult, requirePetMutationResult } from './read-result.js';

export const PET_HOME_GARDEN = Object.freeze({
  crop_key: 'garden_veggies',
  label: 'Garden Veggie Box',
  grow_seconds: 6 * 60 * 60,
  harvest_quantity: 1,
});

const owner = value => String(value || '').trim();

function projectGarden(row, pet, now = new Date()) {
  const base = {
    available: true,
    pet_id: pet.pet_id,
    season_key: pet.season_key,
    crop_key: PET_HOME_GARDEN.crop_key,
    label: PET_HOME_GARDEN.label,
    grow_seconds: PET_HOME_GARDEN.grow_seconds,
    harvest_quantity: PET_HOME_GARDEN.harvest_quantity,
  };
  if (!row) return { ...base, status: 'empty', planted_at: null, ready_at: null, remaining_seconds: 0 };
  if (row.crop_key !== PET_HOME_GARDEN.crop_key || !row.planted_at || !row.ready_at
      || !['growing','harvesting'].includes(String(row.status || ''))) {
    throw new Error('pet_garden_state_invalid');
  }
  const readyMs = Date.parse(row.ready_at);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(readyMs) || !Number.isFinite(nowMs)) throw new Error('pet_garden_state_invalid');
  const remaining = Math.max(0, Math.ceil((readyMs - nowMs) / 1000));
  return {
    ...base,
    status: row.status === 'harvesting' ? 'harvesting' : remaining > 0 ? 'growing' : 'ready',
    planted_at: row.planted_at,
    ready_at: row.ready_at,
    remaining_seconds: remaining,
  };
}

function gardenRead(db, telegramId, pet) {
  return db.prepare(`SELECT crop_key,status,planted_at,ready_at
    FROM telegram_pet_garden_plots
    WHERE pet_id=? AND telegram_id=? AND season_key=? LIMIT 1`)
    .bind(pet.pet_id, owner(telegramId), pet.season_key);
}

export async function readPetGardenState(db, telegramId, pet, now = new Date()) {
  if (!pet?.pet_id || !pet?.season_key) return { available: false, reason: 'pet_garden_source_required' };
  const row = await gardenRead(db, telegramId, pet).first().then(requirePetFirstReadResult);
  return projectGarden(row, pet, now);
}

export async function plantPetGarden(db, telegramId, pet, now = new Date()) {
  if (!pet?.pet_id || !pet?.season_key) return { accepted: false, reason: 'pet_garden_source_required' };
  const [inserted, read] = await db.batch([
    db.prepare(`INSERT INTO telegram_pet_garden_plots
      (pet_id,telegram_id,season_key,crop_key,status,planted_at,ready_at,updated_at)
      SELECT p.pet_id,p.telegram_id,p.season_key,?,'growing',
        strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        strftime('%Y-%m-%dT%H:%M:%fZ','now','+6 hours'),
        strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM telegram_pet_active_slots a
      JOIN telegram_pet_instances p
        ON p.pet_id=a.pet_id AND p.telegram_id=a.telegram_id AND p.season_key=a.season_key
      JOIN telegram_pet_season_slots s
        ON s.pet_id=p.pet_id AND s.telegram_id=p.telegram_id AND s.season_key=p.season_key
      WHERE a.telegram_id=? AND a.pet_id=? AND p.season_key=?
        AND p.status='active' AND s.status='active'
        AND NOT EXISTS(SELECT 1 FROM telegram_pet_garden_plots g WHERE g.pet_id=p.pet_id)`)
      .bind(PET_HOME_GARDEN.crop_key, owner(telegramId), pet.pet_id, pet.season_key),
    gardenRead(db, telegramId, pet),
  ]);
  const changed = Number(requirePetMutationResult(inserted)?.meta?.changes || 0);
  const row = requirePetReadResult(read).results[0] || null;
  const garden = projectGarden(row, pet, now);
  if (changed === 1) return {
    accepted: true, reason: 'pet_garden_planted', garden, refresh_state: true,
    result_copy: 'Garden planted. It will be ready to harvest in 6 hours.',
  };
  if (row) return {
    accepted: true, duplicate: true, reason: 'pet_garden_already_planted', garden, refresh_state: true,
    result_copy: garden.status === 'ready' ? 'Garden is already ready to harvest.' : 'Garden is already growing. No second timer was started.',
  };
  return { accepted: false, reason: 'displayed_pet_changed', refresh_state: true };
}

async function readHarvestReceipt(db, telegramId, eventKey) {
  return db.prepare(`SELECT pet_id,season_key,crop_key,crop_planted_at,quantity,status,harvested_at
    FROM telegram_pet_garden_harvests WHERE telegram_id=? AND event_key=? LIMIT 1`)
    .bind(owner(telegramId), eventKey).first().then(requirePetFirstReadResult);
}

export async function harvestPetGarden(db, telegramId, pet, eventKey, now = new Date()) {
  if (!pet?.pet_id || !pet?.season_key || typeof eventKey !== 'string' || !eventKey)
    return { accepted: false, reason: 'pet_garden_source_required' };

  const prior = await readHarvestReceipt(db, telegramId, eventKey);
  if (prior?.status === 'completed') return {
    accepted: true, duplicate: true, reason: 'pet_garden_harvested',
    garden: await readPetGardenState(db, telegramId, pet, now),
    rewards: { items: { [PET_HOME_GARDEN.crop_key]: Number(prior.quantity) || PET_HOME_GARDEN.harvest_quantity } },
    refresh_state: true,
    result_copy: 'Harvest already saved. No duplicate food was added.',
  };

  // Reserve only a crop that is already mature. Binding the receipt to its
  // planted_at timestamp means an old retry can never harvest a later crop.
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_garden_harvests
    (telegram_id,event_key,pet_id,season_key,crop_key,crop_planted_at,quantity,status)
    SELECT ?,?,g.pet_id,g.season_key,g.crop_key,g.planted_at,?,'pending'
    FROM telegram_pet_garden_plots g
    JOIN telegram_pet_active_slots a
      ON a.pet_id=g.pet_id AND a.telegram_id=g.telegram_id AND a.season_key=g.season_key
    WHERE g.pet_id=? AND g.telegram_id=? AND g.season_key=? AND g.status='growing'
      AND g.crop_key=? AND julianday(g.ready_at)<=julianday('now')
      AND a.telegram_id=? AND a.pet_id=?`)
    .bind(owner(telegramId),eventKey,PET_HOME_GARDEN.harvest_quantity,pet.pet_id,owner(telegramId),pet.season_key,
      PET_HOME_GARDEN.crop_key,owner(telegramId),pet.pet_id).run().then(requirePetMutationResult);

  const reserved = await readHarvestReceipt(db, telegramId, eventKey);
  if (!reserved) {
    const garden = await readPetGardenState(db, telegramId, pet, now);
    return {
      accepted: false,
      reason: garden.status === 'growing' ? 'pet_garden_not_ready' : garden.status === 'ready' ? 'pet_garden_harvest_conflict' : 'pet_garden_empty',
      garden, refresh_state: true,
    };
  }
  if (reserved.pet_id !== pet.pet_id || reserved.season_key !== pet.season_key
      || reserved.crop_key !== PET_HOME_GARDEN.crop_key) {
    return { accepted: false, reason: 'pet_garden_harvest_conflict', refresh_state: true };
  }

  const [locked, settling, inventory, cleared, completed, receiptRead, gardenReadResult] = await db.batch([
    db.prepare(`UPDATE telegram_pet_garden_plots SET status='harvesting',updated_at=CURRENT_TIMESTAMP
      WHERE pet_id=? AND telegram_id=? AND season_key=? AND status='growing' AND crop_key=?
        AND planted_at=(SELECT crop_planted_at FROM telegram_pet_garden_harvests WHERE telegram_id=? AND event_key=? AND status='pending')
        AND julianday(ready_at)<=julianday('now')
        AND (NOT EXISTS(SELECT 1 FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key=?)
          OR EXISTS(SELECT 1 FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key=? AND quantity<=999998))`)
      .bind(pet.pet_id,owner(telegramId),pet.season_key,PET_HOME_GARDEN.crop_key,owner(telegramId),eventKey,
        owner(telegramId),PET_HOME_GARDEN.crop_key,owner(telegramId),PET_HOME_GARDEN.crop_key),
    db.prepare(`UPDATE telegram_pet_garden_harvests SET status='settling'
      WHERE telegram_id=? AND event_key=? AND status='pending'
        AND EXISTS(SELECT 1 FROM telegram_pet_garden_plots g
          WHERE g.pet_id=telegram_pet_garden_harvests.pet_id AND g.status='harvesting'
            AND g.planted_at=telegram_pet_garden_harvests.crop_planted_at)`)
      .bind(owner(telegramId),eventKey),
    db.prepare(`INSERT INTO telegram_pet_inventory(telegram_id,asset_type,asset_key,quantity)
      SELECT telegram_id,'item',crop_key,quantity FROM telegram_pet_garden_harvests
      WHERE telegram_id=? AND event_key=? AND status='settling'
      ON CONFLICT(telegram_id,asset_type,asset_key) DO UPDATE SET quantity=quantity+excluded.quantity`)
      .bind(owner(telegramId),eventKey),
    db.prepare(`DELETE FROM telegram_pet_garden_plots
      WHERE pet_id=? AND telegram_id=? AND season_key=? AND status='harvesting'
        AND planted_at=(SELECT crop_planted_at FROM telegram_pet_garden_harvests
          WHERE telegram_id=? AND event_key=? AND status='settling')`)
      .bind(pet.pet_id,owner(telegramId),pet.season_key,owner(telegramId),eventKey),
    db.prepare(`UPDATE telegram_pet_garden_harvests SET status='completed',harvested_at=CURRENT_TIMESTAMP
      WHERE telegram_id=? AND event_key=? AND status='settling'
        AND NOT EXISTS(SELECT 1 FROM telegram_pet_garden_plots g
          WHERE g.pet_id=telegram_pet_garden_harvests.pet_id
            AND g.planted_at=telegram_pet_garden_harvests.crop_planted_at)`)
      .bind(owner(telegramId),eventKey),
    db.prepare(`SELECT pet_id,season_key,crop_key,crop_planted_at,quantity,status,harvested_at
      FROM telegram_pet_garden_harvests WHERE telegram_id=? AND event_key=?`).bind(owner(telegramId),eventKey),
    gardenRead(db, telegramId, pet),
  ]);
  [locked, settling, inventory, cleared, completed].forEach(requirePetMutationResult);
  const receipt = requirePetReadResult(receiptRead).results[0] || null;
  const garden = projectGarden(requirePetReadResult(gardenReadResult).results[0] || null, pet, now);
  if (receipt?.status === 'completed') return {
    accepted: true, reason: 'pet_garden_harvested', garden,
    rewards: { items: { [PET_HOME_GARDEN.crop_key]: PET_HOME_GARDEN.harvest_quantity } },
    refresh_state: true,
    result_copy: 'Harvest complete. +1 Garden Veggie Box added to your Bag and Food Counter.',
  };

  const bag = await db.prepare(`SELECT quantity FROM telegram_pet_inventory
    WHERE telegram_id=? AND asset_type='item' AND asset_key=?`)
    .bind(owner(telegramId),PET_HOME_GARDEN.crop_key).first().then(requirePetFirstReadResult);
  return {
    accepted: false,
    reason: Number(bag?.quantity || 0) >= 999999 ? 'pet_garden_inventory_full' : 'pet_garden_harvest_conflict',
    garden, refresh_state: true,
  };
}
