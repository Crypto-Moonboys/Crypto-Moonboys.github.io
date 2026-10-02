import { requirePetMutationResult, requirePetFirstReadResult } from './read-result.js';

// The source tuple and selection must still be live in the INSERT itself.
// A preceding ownership read cannot serialize a run start with pet deletion.
export const SELECTED_RUN_PET_SQL = `EXISTS (SELECT 1 FROM telegram_pet_instances i
  JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
    AND s.season_key=i.season_key AND s.slot_number=i.slot_number
  JOIN telegram_pet_active_slots a ON a.pet_id=i.pet_id AND a.telegram_id=i.telegram_id AND a.season_key=i.season_key
  WHERE i.pet_id=? AND i.telegram_id=? AND i.season_key=? AND i.status='active' AND s.status='active')`;

export function requireRunMutationResults(results, expectedLength = null) {
  const rows = expectedLength === null ? [results] : results;
  if (!Array.isArray(rows) || (expectedLength !== null && rows.length !== expectedLength)) throw new Error('pet_state_write_unavailable');
  for (const row of rows) {
    requirePetMutationResult(row);
    if (!Number.isSafeInteger(row?.meta?.changes) || row.meta.changes < 0) throw new Error('pet_state_write_unavailable');
  }
  return results;
}

// Repair only a provably empty start admitted after an explicit deletion.
// Keep its source, start analytics, pending rooms and all retained history.
// Runs with progress or rewards remain unavailable for audit, never guessed.
export async function recoverDeletedPetRunStarts(db, owner) {
  const result = await db.prepare(`UPDATE telegram_pet_runs SET status='abandoned',
      death_reason='pet_deleted_before_run_start', ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
    WHERE telegram_id=? AND status IN ('active','extractable') AND depth=0 AND current_room=0 AND rooms_completed=0
      AND unbanked_pet_xp=0 AND unbanked_moon_gold=0 AND unbanked_moon_crystals=0 AND unbanked_style_tokens=0
      AND json_valid(unbanked_items) AND NOT EXISTS (SELECT 1 FROM json_each(unbanked_items))
      AND EXISTS (SELECT 1 FROM telegram_pet_identity_events d JOIN telegram_pet_instances i
        ON i.pet_id=d.pet_id AND i.telegram_id=d.telegram_id AND i.season_key=d.season_key
        WHERE d.pet_id=telegram_pet_runs.pet_id AND d.telegram_id=telegram_pet_runs.telegram_id AND d.season_key=telegram_pet_runs.season_key
          AND d.event_kind='memory' AND d.event_key='pet:delete:'||d.pet_id AND d.applied_at IS NOT NULL
          AND json_valid(d.payload) AND json_extract(d.payload,'$.type')='pet_deleted' AND i.status='archived')
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_run_steps s WHERE s.run_id=telegram_pet_runs.run_id)
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_run_rooms r WHERE r.run_id=telegram_pet_runs.run_id AND r.status<>'pending')
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_reward_claims c WHERE c.telegram_id=telegram_pet_runs.telegram_id
        AND (c.idempotency_key=telegram_pet_runs.run_id OR c.idempotency_key=telegram_pet_runs.run_id||':extract'
          OR json_valid(c.metadata) AND json_extract(c.metadata,'$.context.run_id')=telegram_pet_runs.run_id))`)
    .bind(String(owner)).run();
  requireRunMutationResults(result);
  return result.meta.changes;
}

export async function isDeletedRunPet(db, run) {
  const row = await db.prepare(`SELECT 1 AS deleted FROM telegram_pet_identity_events
    WHERE telegram_id=? AND pet_id=? AND season_key=? AND event_kind='memory'
      AND event_key='pet:delete:'||pet_id AND applied_at IS NOT NULL
      AND json_valid(payload) AND json_extract(payload,'$.type')='pet_deleted'`)
    .bind(run.telegram_id, run.pet_id, run.season_key).first().then(requirePetFirstReadResult);
  return Boolean(row);
}
