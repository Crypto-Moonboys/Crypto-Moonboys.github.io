import { awardCommunityXp } from '../community-xp-awards.js';
import { WTF_DAILY_SCHEDULE } from './daily-wtf-schedule.js';

export const CLAN_SIGNAL_XP = 100;
export const CLAN_SIGNAL_XP_ACTION = 'clan_daily_wtf_bank';

export function clanSignalXpStart(env) {
  const start = env.CLAN_SIGNAL_XP_FROM;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(start || '')) return null;
  const time = new Date(start);
  return Number.isFinite(+time) && time.toISOString() === start ? start : null;
}

// Each official window has one receipt key per player. Multiple banks within
// that window select the earliest receipt and cannot earn a second bonus.
export async function settleClanSignalXp(db, start, now) {
  const schedule = JSON.stringify(WTF_DAILY_SCHEDULE.map(({ event_id, startHour, durationMinutes }) => ({
    event_id, startMinute: startHour * 60, endMinute: startHour * 60 + durationMinutes,
  })));
  const result = await db.prepare(`
    WITH windows AS (
      SELECT json_extract(value, '$.event_id') AS event_id,
        json_extract(value, '$.startMinute') AS starts_at,
        json_extract(value, '$.endMinute') AS ends_at
      FROM json_each(?)
    ), eligible AS (
      SELECT bank.telegram_id, bank.utc_day || ':' || windows.event_id AS claim_key,
        MIN(bank.awarded_at) AS earned_at
      FROM clan_operation_awards AS bank
      JOIN windows ON (CAST(strftime('%H', bank.awarded_at) AS INTEGER) * 60 +
        CAST(strftime('%M', bank.awarded_at) AS INTEGER)) >= windows.starts_at
        AND (CAST(strftime('%H', bank.awarded_at) AS INTEGER) * 60 +
        CAST(strftime('%M', bank.awarded_at) AS INTEGER)) < windows.ends_at
      WHERE bank.awarded_at >= ? AND bank.awarded_at <= ?
      GROUP BY bank.telegram_id, claim_key
    )
    SELECT * FROM eligible WHERE NOT EXISTS (
      SELECT 1 FROM telegram_community_xp_awards AS receipt
      WHERE receipt.telegram_id=eligible.telegram_id AND receipt.action=? AND receipt.claim_key=eligible.claim_key
    )
    ORDER BY earned_at, telegram_id LIMIT 25
  `).bind(schedule, start, now.toISOString(), CLAN_SIGNAL_XP_ACTION).all();
  if (!result.success) throw new Error('clan_signal_xp_source_unavailable');
  let failed = false;
  for (const bank of result.results) {
    try {
      await awardCommunityXp(db, bank.telegram_id, CLAN_SIGNAL_XP, CLAN_SIGNAL_XP_ACTION, bank.claim_key, { now: bank.earned_at });
    } catch {
      failed = true;
    }
  }
  if (failed) throw new Error('clan_signal_xp_settlement_failed');
}
