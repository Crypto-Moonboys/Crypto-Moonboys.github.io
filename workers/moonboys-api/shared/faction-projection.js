import { CANONICAL_FACTION_KEYS, FACTION_ALIASES, FACTION_UNALIGNED, normalizeFaction } from './faction-canon.js';

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

/**
 * Metadata tables were seeded with pre-rename identifiers such as
 * diamond-hands/hodl-warriors. Keep the numeric community-faction IDs for
 * contribution lookups, but NEVER use that table to choose player membership.
 * Prefer the exact canonical row if both canonical and legacy aliases exist.
 */
export function canonicalFactionMetadataLookup(factionKey) {
  const canonical = normalizeFaction(factionKey);
  if (!CANONICAL_FACTION_KEYS.includes(canonical)) return null;
  const names = [canonical, ...Object.keys(FACTION_ALIASES)
    .filter((alias) => FACTION_ALIASES[alias] === canonical)];
  return Object.freeze({
    sql: 'SELECT id, name, description, icon FROM telegram_factions WHERE name IN (' +
      names.map(() => '?').join(', ') + ') ORDER BY CASE WHEN name = ? THEN 0 ELSE 1 END, id LIMIT 1',
    params: Object.freeze([...names, canonical]),
  });
}

/**
 * Read-only compatibility shape for existing Telegram profile/digest callers.
 * A legacy community membership row must never override the account's
 * current Battle Chamber faction. Numeric legacy metadata is optional.
 */
export async function readCanonicalFactionProfile(db, telegramId) {
  const row = await db.prepare(CANONICAL_FACTION_READ_SQL).bind(telegramId).first();
  const faction = canonicalFactionProjection(row);
  if (!faction.joined) return null;
  const lookup = canonicalFactionMetadataLookup(faction.name);
  const meta = lookup
    ? await db.prepare(lookup.sql).bind(...lookup.params).first().catch(() => null)
    : null;
  return Object.freeze({
    id: meta?.id ?? null,
    name: faction.name,
    description: meta?.description ?? null,
    icon: meta?.icon ?? null,
    role: null,
    faction_xp: faction.faction_xp,
  });
}
