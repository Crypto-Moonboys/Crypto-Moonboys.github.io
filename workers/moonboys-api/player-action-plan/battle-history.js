import { CLAN_SIGNAL_XP_ACTION } from '../shared/clan-signal-xp.js';
import { isoOrNull, utcDay } from './schema.js';

export const BATTLE_SIGNAL_WINDOWS_SQL = `
  SELECT e.event_id,e.title,e.starts_at,e.ends_at,e.required_action,p.status AS player_status,
    p.checked_in_at,p.completed_at,p.missed_at
  FROM daily_wtf_events e
  LEFT JOIN daily_wtf_player_events p ON p.event_id=e.event_id
    AND p.telegram_id=? AND p.utc_day=e.utc_day
  WHERE e.utc_day=? ORDER BY e.starts_at,e.event_id`;

export function classifyBattleSignal(row, now) {
  const starts_at = isoOrNull(row.starts_at);
  const ends_at = isoOrNull(row.ends_at);
  const completed_at = row.player_status === 'completed' ? isoOrNull(row.completed_at) : null;
  const missed_at = ['missed', 'expired'].includes(row.player_status) ? isoOrNull(row.missed_at) : null;
  const validStatus = [null, undefined, 'upcoming', 'not_checked_in', 'checked_in', 'completed',
    'missed', 'expired', 'in_progress', 'participating'].includes(row.player_status);
  const needsReceipt = ['completed', 'missed', 'expired'].includes(row.player_status);
  const clockValid = starts_at && ends_at && ends_at > starts_at;
  const at = now.toISOString();
  const status = completed_at ? 'completed'
    : missed_at ? 'missed'
      : !clockValid || !validStatus || needsReceipt ? 'unconfirmed'
        : at >= ends_at ? 'closed'
          : at < starts_at ? 'scheduled'
            : isoOrNull(row.checked_in_at) ? 'checked_in' : 'open';
  return { starts_at, ends_at, completed_at, status };
}

export function validBattleHistoryDay(day, now) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(day) &&
    isoOrNull(day)?.slice(0, 10) === day && day <= utcDay(now);
}

export async function readBattleHistory(db, ownerId, day, now) {
  const [windows, sent, missed, signalBankAwards] = await Promise.allSettled([
    db.all(BATTLE_SIGNAL_WINDOWS_SQL, [ownerId, day]),
    db.all(`SELECT event_id, sent_at,
        CASE WHEN json_valid(metadata_json) THEN json_extract(metadata_json,'$.title') END AS title
      FROM telegram_group_announcement_log
      WHERE utc_day=? AND announcement_type='wtf_pre_event_minus_10'
        AND status='sent' ORDER BY sent_at,announcement_key`, [day]),
    db.all(`SELECT title,missed_xp_value,missed_at
      FROM daily_missed_perks WHERE telegram_id=? AND utc_day=?
      ORDER BY missed_at DESC,id DESC`, [ownerId, day]),
    db.all(`SELECT substr(claim_key,12) AS event_id, xp_change FROM telegram_community_xp_awards
      WHERE telegram_id=? AND action=? AND claim_key GLOB ?`,
    [ownerId, CLAN_SIGNAL_XP_ACTION, day + ':*']),
  ]);
  const xpByEvent = new Map((signalBankAwards.value || []).map(row => [row.event_id, row.xp_change]));
  const deliveries = sent.value || [];
  const windowsByEvent = new Map((windows.value || []).map(row => [row.event_id, row]));
  const sentByEvent = new Map();
  const unlinked = [];
  for (const row of deliveries) {
    if (!row.event_id || !windowsByEvent.has(row.event_id)) {
      unlinked.push({ title: String(row.title || 'Daily WTF Signal'), status: 'unconfirmed',
        sent_at: isoOrNull(row.sent_at) });
    } else {
      sentByEvent.set(row.event_id, isoOrNull(row.sent_at));
    }
  }
  return {
    utc_day: day,
    signals: [...windowsByEvent.values()].map(row => ({
      title: row.title, required_action: row.required_action, ...classifyBattleSignal(row, now),
      sent_at: sentByEvent.get(row.event_id) ?? null, bank_community_xp: xpByEvent.get(row.event_id) ?? null,
    })).concat(unlinked),
    missed: (missed.value || []).map(row => ({
      title: row.title, xp: row.missed_xp_value, missed_at: isoOrNull(row.missed_at),
    })),
    available: { signals: windows.status === 'fulfilled', delivery: sent.status === 'fulfilled',
      missed: missed.status === 'fulfilled', bank_rewards: signalBankAwards.status === 'fulfilled' },
  };
}
