/**
 * Read-only scheduling after an official Moonpet Daily Run fails.
 * This never changes a run outcome, awards XP, grants Marks/Crests, or starts a run.
 * The live Worker remains responsible for verifying a new day's eligibility.
 */
const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function nextUtcDay(day) {
  if (!UTC_DAY.test(String(day || ''))) throw new Error('invalid_utc_day');
  const n = Date.parse(day + 'T00:00:00.000Z');
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0,10) !== day) throw new Error('invalid_utc_day');
  return new Date(n + DAY_MS).toISOString().slice(0,10);
}

export function nextFailedRunOpportunity({
  run, dayKey, now = new Date(), choiceKeys = [], lastChoiceKey = null,
} = {}) {
  if (!run || run.status !== 'failed') return null;
  if (!run.run_id || !run.pet_id || !run.telegram_id) throw new Error('failed_run_source_required');
  const nextDay = nextUtcDay(dayKey);
  const at = new Date(now);
  if (!Number.isFinite(at.getTime())) throw new Error('invalid_current_time');
  const due = nextDay + 'T00:00:00.000Z';
  const choices = [...new Set(choiceKeys.filter(key => typeof key === 'string' && key.trim()).map(key => key.trim()))];
  const lastIndex = choices.indexOf(lastChoiceKey);
  const suggestedChoice = choices.length ? choices[(lastIndex + 1) % choices.length] : null;
  return Object.freeze({
    sourceRunId: run.run_id,
    sourcePetId: run.pet_id,
    sourceTelegramId: run.telegram_id,
    terminalStatus: 'failed',
    terminalDepth: Number(run.depth ?? 0),
    terminalScore: Number(run.score ?? 0),
    nextEligibleUtcDay: nextDay,
    retryNotBefore: due,
    mayAttemptNewDay: at.getTime() >= Date.parse(due),
    suggestedChoice,
    // Advisory only. Neither another run nor a persisted outcome is generated.
    rewardsAwarded: 0,
    marksAwarded: 0,
    crestsAwarded: 0,
    authoritativeEligibilityVerified: false,
  });
}
