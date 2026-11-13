// Explicit schedule ownership for the phase-5 wrapper. Never infer reward
// eligibility or UTC attribution from a shifted execution timestamp.
// Base Worker still owns the original five-minute timed-event and 09:00 jobs.
export const MOONBOYS_CRON = Object.freeze({
  timed: '*/5 * * * *',
  automation: '*/30 * * * *',
  digest: '0 9 * * *',
  bulletin: '3 */4 * * *',
  participation: '12 0 * * *',
});

export function phase5CronTasks(event, env = {}) {
  const cron = String(event?.cron || '');
  // The recurring five-minute tick retains its existing schedule for base
  // Worker timed events. GPS cleanup only needs to run every ten minutes.
  // Use the cron's scheduled UTC instant, not the time Cloudflare dispatches
  // it, to avoid skipping a tick during runtime/event-loop delays.
  const planned = Number(event?.scheduledTime);
  const scheduledMinute = Number.isFinite(planned) && planned >= 0
    ? new Date(planned).getUTCMinutes() : null;
  const maintenance = cron === MOONBOYS_CRON.timed &&
    (scheduledMinute === null || scheduledMinute % 10 === 0);
  return Object.freeze({
    maintenance,
    rankNotices: cron === MOONBOYS_CRON.timed && env.TAG_RUN_ENABLED === 'true',
    // Automatic Community Pot state advances on its own lower-frequency cron.
    // The five-minute base tick remains dedicated to existing maintenance and notices.
    automationTick: cron === MOONBOYS_CRON.automation &&
      env.TAG_RUN_V2_AUTOMATION_ENABLED === 'true' &&
      env.TAG_RUN_V2_AUTOMATION_RELEASE_APPROVED === 'true',
    bulletin: cron === MOONBOYS_CRON.bulletin && env.TAG_RUN_ENABLED === 'true',
    participation: cron === MOONBOYS_CRON.participation &&
      (env.TAG_RUN_V2_POOL_ENABLED === 'true' ||
       env.TAG_RUN_V2_OBSERVATION_ENABLED === 'true'),
    // Existing weekly drafts are disabled in production. When separately
    // enabled, run them at a single daily boundary after UTC rollover rather
    // than re-querying D1 on every five-minute timed event check.
    weeklyDraft: cron === MOONBOYS_CRON.participation &&
      env.TAG_RUN_ENABLED === 'true' &&
      env.TAG_RUN_WEEKLY_REWARDS_ENABLED === 'true',
  });
}
