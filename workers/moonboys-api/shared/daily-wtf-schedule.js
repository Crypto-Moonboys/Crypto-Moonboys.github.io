export const WTF_DAILY_SCHEDULE = Object.freeze([
  { event_id: 'wtf-midnight-signal', title: 'Midnight WTF Signal', event_type: 'signal_window', startHour: 0, durationMinutes: 90, required_action: 'play_any_accepted_arcade_run', rewardSegment: 'midnight', theme: 'neon-midnight' },
  { event_id: 'wtf-early-chain-wake-up', title: 'Early Chain Wake-Up', event_type: 'chain_wake_up', startHour: 4, durationMinutes: 90, required_action: 'choose_and_complete_chaos_path', rewardSegment: 'early', theme: 'chain-wake-up' },
  { event_id: 'wtf-morning-signal', title: 'Morning WTF Signal', event_type: 'signal_window', startHour: 8, durationMinutes: 90, required_action: 'play_any_accepted_arcade_run', rewardSegment: 'morning', theme: 'neon-sunrise' },
  { event_id: 'wtf-midday-rush', title: 'Midday Faction Rush', event_type: 'faction_rush', startHour: 12, durationMinutes: 90, required_action: 'complete_faction_or_battle_action', rewardSegment: 'midday', theme: 'faction-overdrive' },
  { event_id: 'wtf-evening-burst', title: 'Evening Arcade Burst', event_type: 'arcade_burst', startHour: 16, durationMinutes: 90, required_action: 'score_target_any_game', rewardSegment: 'evening', theme: 'neon-jackpot' },
  { event_id: 'wtf-late-chaos', title: 'Late Night Chaos Window', event_type: 'chaos_window', startHour: 20, durationMinutes: 90, required_action: 'choose_and_complete_chaos_path', rewardSegment: 'late', theme: 'after-hours-chaos' },
]);

export function getWtfDailySchedule(utcDay) {
  return WTF_DAILY_SCHEDULE.map((event) => ({
    event_id: event.event_id,
    title: event.title,
    event_type: event.event_type,
    startHour: event.startHour,
    durationMinutes: event.durationMinutes,
    required_action: event.required_action,
    reward_key: `wtf:${utcDay}:${event.rewardSegment}`,
    theme: event.theme,
  }));
}

export function buildWtfIso(utcDay, hour, minute = 0) {
  return `${utcDay}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

export function getWtfEventStatus(nowMs, startsAt, endsAt, playerStatus = 'upcoming') {
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (Number.isFinite(endMs) && nowMs >= endMs) return playerStatus === 'completed' ? 'completed' : 'expired';
  if (Number.isFinite(startMs) && nowMs < startMs) return 'upcoming';
  if (playerStatus === 'completed') return 'completed';
  return 'active';
}

export function buildWtfPreviewSchedule(utcDay, nowMs) {
  if (!Number.isFinite(Number(nowMs))) {
    throw new Error('nowMs is required for deterministic Daily WTF preview schedule');
  }
  return getWtfDailySchedule(utcDay).map((event) => {
    const startsAt = buildWtfIso(utcDay, event.startHour, 0);
    const endsAt = new Date(Date.parse(startsAt) + event.durationMinutes * 60 * 1000).toISOString();
    return {
      event_id: event.event_id,
      utc_day: utcDay,
      title: event.title,
      event_type: event.event_type,
      starts_at: startsAt,
      ends_at: endsAt,
      required_action: event.required_action,
      reward_preview: event.reward_key,
      theme: event.theme,
      status: getWtfEventStatus(Number(nowMs), startsAt, endsAt, 'upcoming'),
      source_label: 'preview',
    };
  });
}
