// One state response has a fixed allocation for each recovery queue. Reserving
// slots per queue keeps a care backlog from excluding runs or completed awards.
// These are source-record limits, not SQL limits: each repair finishes its
// existing atomic/idempotent operation before the next source is considered.
export const PET_STATE_RECOVERY_LIMITS = Object.freeze({
  standard_endings: 2,
  daily_endings: 1,
  daily_records: 1,
  runtime: 20,
  weekly_bosses: 2,
  journey_sources: 20,
  journey_awards: 2,
});

export function boundedRecoveryLimit(value, maximum) {
  return value == null || !Number.isFinite(Number(value))
    ? maximum : Math.max(1, Math.min(maximum, Math.floor(Number(value))));
}
