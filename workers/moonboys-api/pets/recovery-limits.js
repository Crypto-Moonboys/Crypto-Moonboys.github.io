// One state response has a fixed allocation for each recovery queue. Reserving
// slots per queue keeps a care backlog from excluding runs or completed awards.
// These are source-record limits, not SQL limits: each repair finishes its
// existing atomic/idempotent operation before the next source is considered.
export const PET_STATE_RECOVERY_LIMITS = Object.freeze({
  standard_endings: 2,
  daily_endings: 1,
  daily_records: 1,
  live_endings: 2,
  runtime: 20,
  runtime_after_combat: 6, // A recovered group ending can settle both players.
  weekly_bosses: 2,
  journey_sources: 20,
  journey_awards: 2,
});

export function boundedRecoveryLimit(value, maximum) {
  return value == null || !Number.isFinite(Number(value))
    ? maximum : Math.max(1, Math.min(maximum, Math.floor(Number(value))));
}

// Scheduling only: the source record and existing settlement guards still
// decide eligibility and payment. Advance before work so rejected, interrupted
// and persistently failing batches yield to later sources, then wrap around.
// No read/write is added for an empty queue; stale readers cannot rewind it.
export async function claimPetRecoveryBatch(db, owner, queue, candidates) {
  if (!candidates.length) return false;
  const result = await db.prepare(`INSERT INTO telegram_settings (telegram_id,setting_key,setting_value)
    VALUES (?,?,?) ON CONFLICT(telegram_id,setting_key) DO UPDATE SET
      setting_value=excluded.setting_value, updated_at=CURRENT_TIMESTAMP
    WHERE telegram_settings.setting_value IS ?`)
    .bind(owner, `moonpet:recovery:${queue}`, candidates.at(-1).recovery_key, candidates[0].recovery_cursor ?? null).run();
  return Number(result?.meta?.changes || 0) > 0;
}
