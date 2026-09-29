import { getPetVisibleLevelSql } from './progression-phase-2.js';
import { PET_INSTANCE_AUTHORITY_VERSION } from './wallet-reconciliation.js';

// These statements belong in the same D1 batch as a fresh pending event.
// Read the applied XP from that receipt; never apply an earlier JS snapshot.
export function petCareDeltaStatements(db, { eventId, dayKey, previousDayKey, now, deltas, stages, claimId = null }) {
  const claimGuard = claimId ? "AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id=? AND status='pending')" : '';
  const receipt = `SELECT * FROM telegram_pet_events WHERE id=? AND status='pending' ${claimGuard}`;
  const receiptArgs = [eventId, ...(claimId ? [claimId] : [])];
  const clamp = expression => `MIN(100,MAX(0,ROUND(${expression})))`;
  const elapsed = "MAX(0,COALESCE((julianday((SELECT now FROM clock))-julianday(last_decay_at))*24,0))";
  const stat = (column, rate) => `${clamp(`${clamp(`${column}+CASE WHEN ${elapsed}>=0.01 THEN ${elapsed}*${rate} ELSE 0 END`)}+?`)}`;
  const columns = 'pet_xp,level,stage,hunger,happiness,cleanliness,energy,health,streak_days,last_active_day,last_decay_at';
  return [
    db.prepare(`WITH receipt AS (${receipt}), clock AS (SELECT ? AS now)
      UPDATE telegram_pet_instances SET
        pet_xp=pet_xp+(SELECT pet_xp_awarded FROM receipt),
        hunger=${stat('hunger', 4.5)}, happiness=${stat('happiness', -2.8)},
        cleanliness=${stat('cleanliness', -3.2)}, energy=${stat('energy', -2.2)},
        streak_days=CASE WHEN last_active_day>? THEN streak_days WHEN last_active_day=? THEN MAX(1,streak_days)
          WHEN last_active_day=? THEN streak_days+1 ELSE 1 END,
        last_active_day=CASE WHEN last_active_day>? THEN last_active_day ELSE ? END,
        last_decay_at=CASE WHEN julianday(last_decay_at)>julianday((SELECT now FROM clock)) THEN last_decay_at ELSE (SELECT now FROM clock) END,
        source_profile_updated_at=?,updated_at=CURRENT_TIMESTAMP
      WHERE pet_id=(SELECT pet_id FROM receipt) AND telegram_id=(SELECT telegram_id FROM receipt)`)
      .bind(...receiptArgs, now.toISOString(), ...['hunger','happiness','cleanliness','energy'].map(key=>Number(deltas[key] || 0)),
        dayKey,dayKey,previousDayKey,dayKey,dayKey,PET_INSTANCE_AUTHORITY_VERSION),
    db.prepare(`WITH receipt AS (${receipt}) UPDATE telegram_pet_instances SET
        level=${getPetVisibleLevelSql('pet_xp')},
        stage=CASE ${stages.slice().reverse().map(s=>`WHEN pet_xp>=${s.min_xp} THEN '${s.stage}'`).join(' ')} END,
        health=${clamp('((100-hunger)+happiness+cleanliness+energy)/4.0')}
      WHERE pet_id=(SELECT pet_id FROM receipt) AND telegram_id=(SELECT telegram_id FROM receipt)`)
      .bind(...receiptArgs),
    db.prepare(`WITH receipt AS (${receipt}) UPDATE telegram_pet_profiles SET
        (${columns})=(SELECT ${columns} FROM telegram_pet_instances WHERE pet_id=(SELECT pet_id FROM receipt)),
        updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=(SELECT telegram_id FROM receipt)
        AND EXISTS (SELECT 1 FROM telegram_pet_active_slots a JOIN receipt r ON a.telegram_id=r.telegram_id
          AND a.pet_id=r.pet_id AND a.season_key=r.season_key)`)
      .bind(...receiptArgs),
  ];
}

export function petCareCommunityStatements(db, eventId) {
  const receipt = "SELECT * FROM telegram_pet_events WHERE id=? AND status='pending' AND xp_awarded>0";
  return [
    db.prepare(`INSERT INTO telegram_xp_log (telegram_id,action,xp_change,reference_id)
      SELECT telegram_id,'pet_'||event_type,xp_awarded,event_key FROM (${receipt})`).bind(eventId),
    db.prepare(`WITH receipt AS (${receipt}) UPDATE telegram_users
      SET xp=xp+(SELECT xp_awarded FROM receipt),
        level=CAST((xp+(SELECT xp_awarded FROM receipt))/100 AS INTEGER)+1,updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=(SELECT telegram_id FROM receipt)`).bind(eventId),
    // Select the active Community season for the receipt's authoritative day.
    // No active season means no new Community reward row; never write to an
    // expired or future period.
    db.prepare(`INSERT INTO telegram_leaderboard (telegram_id,season_id,xp)
      SELECT r.telegram_id,s.id,r.xp_awarded FROM (${receipt}) r
      JOIN telegram_seasons s ON s.is_active=1
        AND s.start_date <= COALESCE(r.day_key, date('now'))
        AND (s.end_date IS NULL OR s.end_date > COALESCE(r.day_key, date('now')))
      ORDER BY s.start_date DESC, s.id DESC LIMIT 1
      ON CONFLICT(telegram_id,season_id) DO UPDATE SET xp=xp+excluded.xp,updated_at=CURRENT_TIMESTAMP`).bind(eventId),
  ];
}
