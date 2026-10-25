import { requirePetFirstReadResult } from './read-result.js';
import { PET_EQUIPMENT_UTILITY } from './equipment-progression.js';

// Request-local negative evidence, never a durable "already migrated" flag.
// These deliberately over-approximate each queue: a positive result still runs
// the existing source/ownership/receipt checks. No historical row is excluded.
export async function readPetRecoveryPresence(db, owner) {
  const row = await db.prepare(`SELECT
    EXISTS(SELECT 1 FROM telegram_pet_runs WHERE telegram_id=?1) AS runs,
    EXISTS(SELECT 1 FROM telegram_pet_daily_runs WHERE telegram_id=?1) AS daily,
    EXISTS(SELECT 1 FROM telegram_pet_system_events WHERE telegram_id=?1
      AND status IN ('pending','rejected','settling')) AS live,
    (EXISTS(SELECT 1 FROM telegram_pet_arena_battles WHERE player1_telegram_id=?1 OR player2_telegram_id=?1)
      OR EXISTS(SELECT 1 FROM telegram_pet_kaiju_matches WHERE player1_telegram_id=?1 OR player2_telegram_id=?1)) AS combat,
    EXISTS(SELECT 1 FROM telegram_pet_events WHERE telegram_id=?1 AND status='accepted') AS events,
    EXISTS(SELECT 1 FROM telegram_pet_weekly_boss_victories_by_pet WHERE telegram_id=?1) AS bosses,
    (EXISTS(SELECT 1 FROM telegram_pet_season_slots s JOIN telegram_pet_daily_journey_objectives o
        ON o.pet_id=s.pet_id AND o.season_key=s.season_key AND o.telegram_id=s.telegram_id WHERE s.telegram_id=?1)
      OR EXISTS(SELECT 1 FROM telegram_pet_season_slots s JOIN telegram_pet_weekly_journey_objectives o
        ON o.pet_id=s.pet_id AND o.season_key=s.season_key AND o.telegram_id=s.telegram_id WHERE s.telegram_id=?1)) AS objectives,
    EXISTS(WITH definitions(item_key) AS (VALUES ${Object.keys(PET_EQUIPMENT_UTILITY).map(key => `('${key}')`).join(',')}),
      owned_pets AS (SELECT i.* FROM telegram_pet_instances i JOIN telegram_pet_season_slots s
        ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key AND s.slot_number=i.slot_number
        WHERE i.telegram_id=?1), ownership AS (
      SELECT d.item_key FROM definitions d JOIN owned_pets p
        ON d.item_key IN (p.equipped_food,p.equipped_toy,p.equipped_outfit,p.equipped_armor,p.equipped_weapon,p.equipped_charm)
      UNION SELECT json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.item_key')
        FROM telegram_pet_events e WHERE e.telegram_id=?1 AND e.event_type='buy' AND e.status='accepted'
          AND (e.pet_id IS NULL OR EXISTS(SELECT 1 FROM owned_pets p WHERE p.pet_id=e.pet_id AND p.season_key=e.season_key)))
      SELECT 1 FROM definitions d JOIN ownership o ON o.item_key=d.item_key
      WHERE NOT EXISTS(SELECT 1 FROM telegram_pet_equipment_progression g WHERE g.telegram_id=?1 AND g.item_key=d.item_key)) AS equipment`)
    .bind(String(owner)).first().then(requirePetFirstReadResult).catch(error => {
      // Journey projections already expose a locked/unavailable module when its
      // optional migration is missing. Preserve that containment, but disable
      // this optimization entirely: a missing table never proves an empty queue.
      if (!/no such table: telegram_pet_(?:daily|weekly)_journey_objectives\b/i
        .test(String(error?.cause?.message || error?.message || error))) throw error;
      return { runs:1,daily:1,live:1,combat:1,events:1,bosses:1,objectives:1,equipment:1 };
    });
  if (!row || ['runs','daily','live','combat','events','bosses','objectives','equipment']
    .some(key => row[key] !== 0 && row[key] !== 1)) throw new Error('pet_state_read_unavailable');
  return row;
}
