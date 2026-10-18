import { CANONICAL_FACTION_KEYS, FACTION_UNALIGNED, normalizeFaction } from './faction-canon.js';

// POST /faction/status uses blocktopia_progression.faction as its account
// authority. Personal task/daily-loop reads MUST use the same stored field;
// telegram_faction_members is a different, legacy community-membership table.
export const CANONICAL_FACTION_READ_SQL =
  'SELECT faction, faction_xp FROM blocktopia_progression WHERE telegram_id=? LIMIT 1';

export function canonicalFactionProjection(row) {
  const raw = row?.faction;
  if (row && (typeof raw !== 'string' || !raw.trim())) {
    throw new Error('faction_source_invalid');
  }
  const key = row ? normalizeFaction(raw) : FACTION_UNALIGNED;
  if (row && key === FACTION_UNALIGNED && raw.trim().toLowerCase() !== FACTION_UNALIGNED) {
    throw new Error('faction_source_invalid');
  }
  return Object.freeze({
    joined: CANONICAL_FACTION_KEYS.includes(key),
    faction_id: key,
    name: CANONICAL_FACTION_KEYS.includes(key) ? key : null,
    faction_xp: row ? Math.max(0, Math.floor(Number(row.faction_xp) || 0)) : 0,
    source: 'blocktopia_progression',
  });
}
