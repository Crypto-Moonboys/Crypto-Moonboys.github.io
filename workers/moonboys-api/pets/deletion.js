import { requirePetFirstReadResult, requirePetMutationResult, requirePetReadResult } from './read-result.js';
import { buildPetOnboardingStatements } from './onboarding.js';
import { PET_RECOVERABLE_ACTIVITY_PREDICATE } from './sanctuary.js';

// Recheck in the transaction: work can start after the UI confirmation.
export const PET_DELETION_BLOCKERS_SQL = `
  EXISTS (SELECT 1 FROM telegram_pet_activity_sessions WHERE telegram_id=? AND (status='active' OR (${PET_RECOVERABLE_ACTIVITY_PREDICATE})))
  OR EXISTS (SELECT 1 FROM telegram_pet_runs WHERE telegram_id=? AND status IN ('active','extractable'))
  OR EXISTS (SELECT 1 FROM telegram_pet_arena_battles WHERE (player1_telegram_id=? OR player2_telegram_id=?) AND status NOT IN ('completed','cancelled','expired'))
  OR EXISTS (SELECT 1 FROM telegram_pet_kaiju_matches WHERE (player1_telegram_id=? OR player2_telegram_id=?) AND status NOT IN ('completed','cancelled','expired'))
  OR EXISTS (SELECT 1 FROM telegram_pet_arena_queue WHERE telegram_id=? AND status='waiting')
  OR EXISTS (SELECT 1 FROM telegram_pet_kaiju_queue WHERE telegram_id=? AND status='waiting')
  OR EXISTS (SELECT 1 FROM telegram_pet_contracts WHERE telegram_id=? AND pet_id=? AND (status='active' OR (status='completed' AND reward_xp>0 AND reward_settled=0)))
  OR EXISTS (SELECT 1 FROM telegram_pet_season_finales WHERE telegram_id=? AND pet_id=? AND (status='active' OR (status='won' AND claimed_at IS NULL)))
  OR EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE telegram_id=? AND pet_id=? AND status='pending')
  OR EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE telegram_id=? AND pet_id=? AND status IN ('pending','settling'))
  OR EXISTS (SELECT 1 FROM telegram_pet_weekly_boss_victories_by_pet v WHERE v.telegram_id=? AND v.pet_id=? AND NOT EXISTS (
    SELECT 1 FROM telegram_pet_system_events e WHERE e.telegram_id=v.telegram_id AND e.pet_id=v.pet_id AND e.season_key=v.season_key
      AND e.system_key='weekly_boss_finish' AND e.action_key=v.victory_event_key AND e.period_key=v.week_key AND e.status='completed'))
  OR EXISTS (SELECT 1 FROM telegram_pet_runs r WHERE r.telegram_id=? AND r.pet_id=? AND r.status IN ('completed','extracted') AND r.depth>0
    AND NOT EXISTS (SELECT 1 FROM telegram_pet_reward_claims c WHERE c.telegram_id=r.telegram_id AND c.pet_id=r.pet_id AND c.status='awarded'
      AND ((c.source='pet_run_legacy' AND c.idempotency_key=SUBSTR('pet_run_'||CASE WHEN r.status='extracted' THEN 'extract' ELSE 'complete' END||':'||r.telegram_id||':'||r.run_id,1,120))
        OR (c.source='roguelite_completion' AND c.idempotency_key=r.run_id||CASE WHEN r.status='extracted' THEN ':extract' ELSE '' END))))`;
const blockerArgs = (owner, petId) => [owner,owner,owner,owner,owner,owner,owner,owner,owner,petId,owner,petId,owner,petId,owner,petId,owner,petId,owner,petId];

export async function readDeletedPetHistory(db, owner) {
  const rows = await db.prepare(`SELECT d.pet_id,d.applied_at AS deleted_at,i.pet_xp,
      json_extract(d.payload,'$.replacement_pet_id') AS replacement_pet_id,
      (SELECT COUNT(*) FROM telegram_pet_reward_claims r WHERE r.telegram_id=d.telegram_id AND r.pet_id=d.pet_id AND r.status='awarded') AS awarded_receipts
    FROM telegram_pet_instances i JOIN telegram_pet_identity_events d ON i.pet_id=d.pet_id AND i.telegram_id=d.telegram_id AND i.season_key=d.season_key
    WHERE d.telegram_id=? AND d.event_kind='memory' AND d.applied_at IS NOT NULL
      AND d.event_key='pet:delete:'||d.pet_id AND json_extract(d.payload,'$.type')='pet_deleted'
    ORDER BY d.applied_at DESC,d.event_id DESC LIMIT 20`).bind(String(owner)).all().then(requirePetReadResult);
  return rows.results;
}

// Retain the old pet_id and every FK-linked receipt. A unique lifetime period
// lets the replacement reuse a purchased space without rewriting its history.
export async function deleteOwnedPet(db, telegramId, body, stateColumns) {
  const owner = String(telegramId), petId = String(body?.pet_id || '').trim();
  if (!petId || body?.confirmed !== true || body?.confirm_pet_id !== petId) return { accepted:false, reason:'pet_delete_confirmation_required' };
  const old = await db.prepare(`SELECT s.* FROM telegram_pet_season_slots s
    JOIN telegram_pet_instances i ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id AND i.season_key=s.season_key AND i.slot_number=s.slot_number
    WHERE s.pet_id=? AND s.telegram_id=? AND s.status='active' AND i.status='active'`)
    .bind(petId,owner).first().then(requirePetFirstReadResult);
  if (!old) return { accepted:false, reason:'pet_delete_not_available' };
  const token = crypto.randomUUID(), replacementId = `pet:${owner}:life:${token}`, period = `pet-life-${token}`;
  const claimId = crypto.randomUUID(), claimKey = `pet:delete:${petId}`;
  const claim = `EXISTS (SELECT 1 FROM telegram_pet_identity_events WHERE event_id=? AND pet_id=? AND telegram_id=? AND season_key=? AND applied_at IS NULL)`;
  const args = [claimId,petId,owner,old.season_key], columns = stateColumns.join(',');
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_identity_events
      (event_id,pet_id,telegram_id,season_key,event_key,event_kind,payload)
      SELECT ?,?,?,?,?,'memory',? WHERE EXISTS (
        SELECT 1 FROM telegram_pet_season_slots s JOIN telegram_pet_instances i
          ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id AND i.season_key=s.season_key AND i.slot_number=s.slot_number
        WHERE s.pet_id=? AND s.telegram_id=? AND s.status='active' AND i.status='active') AND NOT (${PET_DELETION_BLOCKERS_SQL})`)
      .bind(claimId,petId,owner,old.season_key,claimKey,JSON.stringify({type:'pet_deleted',replacement_pet_id:replacementId,replacement_period:period}),petId,owner,...blockerArgs(owner,petId)),
    db.prepare(`UPDATE telegram_pet_instances SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE pet_id=? AND telegram_id=? AND ${claim}`).bind(petId,owner,...args),
    db.prepare(`UPDATE telegram_pet_season_slots SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE pet_id=? AND telegram_id=? AND ${claim}`).bind(petId,owner,...args),
    db.prepare(`INSERT INTO telegram_pet_season_slots
      (pet_id,telegram_id,season_key,slot_number,acquisition_type,source_event_key,arcade_xp_spent,journey_clock)
      SELECT ?,telegram_id,?,slot_number,acquisition_type,?,0,'created_at' FROM telegram_pet_season_slots WHERE pet_id=? AND telegram_id=? AND ${claim}`)
      .bind(replacementId,period,claimKey,petId,owner,...args),
    db.prepare(`INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,source_profile_updated_at)
      SELECT pet_id,telegram_id,season_key,slot_number,CURRENT_TIMESTAMP FROM telegram_pet_season_slots WHERE pet_id=? AND ${claim}`).bind(replacementId,...args),
    ...buildPetOnboardingStatements(db,{pet_id:replacementId,telegram_id:owner,season_key:period}, {replacementOf:petId}),
    // Reset only pet state. Account currencies, XP, items and scoring stay put.
    // Deleting an inactive pet leaves the current selection alone.
    db.prepare(`UPDATE telegram_pet_profiles SET (${columns})=(SELECT ${columns} FROM telegram_pet_instances WHERE pet_id=?),updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=? AND EXISTS (SELECT 1 FROM telegram_pet_active_slots WHERE telegram_id=? AND pet_id=?) AND ${claim}`)
      .bind(replacementId,owner,owner,petId,...args),
    db.prepare(`UPDATE telegram_pet_active_slots SET pet_id=?,season_key=?,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND pet_id=? AND ${claim}`)
      .bind(replacementId,period,owner,petId,...args),
    db.prepare(`UPDATE telegram_pet_identity_events SET applied_at=CURRENT_TIMESTAMP WHERE event_id=? AND pet_id=? AND telegram_id=? AND season_key=? AND applied_at IS NULL`).bind(...args),
  ];
  const results = await db.batch(statements);
  if (!Array.isArray(results) || results.length!==statements.length) throw new Error('pet_state_write_unavailable');
  results.forEach(requirePetMutationResult);
  if (Number(results[0]?.meta?.changes || 0)!==1) return { accepted:false, reason:'pet_delete_blocked' };
  return { accepted:true, reason:'pet_deleted', deleted_pet_id:petId, replacement_pet_id:replacementId, reward_history_preserved:true };
}
