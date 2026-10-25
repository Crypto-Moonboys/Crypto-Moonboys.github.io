import { requirePetFirstReadResult } from './read-result.js';

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
    (EXISTS(SELECT 1 FROM telegram_pet_instances WHERE telegram_id=?1 AND
      (equipped_food IS NOT NULL OR equipped_toy IS NOT NULL OR equipped_outfit IS NOT NULL
        OR equipped_armor IS NOT NULL OR equipped_weapon IS NOT NULL OR equipped_charm IS NOT NULL))
      OR EXISTS(SELECT 1 FROM telegram_pet_events WHERE telegram_id=?1 AND event_type='buy' AND status='accepted')) AS equipment`)
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
