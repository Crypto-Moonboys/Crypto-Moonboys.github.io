export const DAILY_COMPLETION_REWARD = Object.freeze({ pet_xp: 25, moon_gold: 50, style_tokens: 1 });
export const SEASON_FINALE_REWARD = Object.freeze({ pet_xp: 100, moon_gold: 200, style_tokens: 5 });
export const dailyCompletionKey = (owner, date) => `daily-completion:${owner}:${date}`;
export const seasonFinaleKey = (pet, season) => `season-finale-quarter:${pet}:${season}`;

// Used both before dispatch and inside the atomic reward transaction.
export function completionRewardAuthorization(source, owner, pet, context) {
  if (!pet || context.pet_id !== pet || !context.season_key) throw Error('invalid_pet_reward_context');
  const authority = `JOIN telegram_pet_instances i ON i.pet_id=r.pet_id AND i.telegram_id=r.telegram_id AND i.season_key=r.season_key
    JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key AND s.slot_number=i.slot_number`;
  if (source === 'pet_daily_completion') return {
    sql: `AND EXISTS (SELECT 1 FROM telegram_pet_daily_completion r ${authority}
      WHERE r.telegram_id=? AND r.utc_day=? AND r.pet_id=? AND r.season_key=? AND r.progress_bits=255)`,
    args: [owner, String(context.utc_day || ''), pet, context.season_key],
  };
  return {
    sql: `AND EXISTS (SELECT 1 FROM telegram_pet_season_finales r ${authority}
      WHERE r.telegram_id=? AND r.pet_id=? AND r.season_key=? AND r.competition_season_key=? AND r.reward_key=? AND r.status='won' AND r.defeated_at IS NOT NULL)`,
    args: [owner, pet, context.season_key, String(context.competition_season_key || ''), String(context.reward_key || '')],
  };
}
