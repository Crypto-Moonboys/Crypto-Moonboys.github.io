import { verifyTelegramIdentityFromBody } from '../blocktopia/auth.js';
import district from '../blocktopia/waterfront-district.js';
import { FACTION_ALIASES } from '../shared/faction-canon.js';
import { CANONICAL_FACTION_READ_SQL, canonicalFactionProjection } from '../shared/faction-projection.js';

const LEASE_SECONDS = 75;
const ACTIONS = new Set(['status', 'join', 'renew', 'leave']);
const LEASE_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export async function handleWaterfrontSeat(request, env, {
  respond, verifyTelegramAuth, rateLimit, logApiFailure, now = Date.now,
}) {
  if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
  const limited = rateLimit?.();
  if (limited) return limited;
  let body;
  try { body = await request.json(); } catch { return respond({ error: 'invalid_json' }, 400); }
  const { action, lease_id: lease } = body ?? {};
  if (!ACTIONS.has(action) || typeof lease !== 'string' || !LEASE_ID.test(lease)) {
    return respond({ error: 'invalid_seat_request' }, 400);
  }
  const identity = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
  if (identity.error) return respond({ error: 'connect_telegram' }, identity.status || 401);
  const owner = String(identity.telegramId);
  const ownerLimited = rateLimit?.(owner);
  if (ownerLimited) return ownerLimited;
  const db = env.DB;
  try {
    if (action === 'leave') {
      const result = await db.prepare('DELETE FROM waterfront_seats WHERE telegram_id = ? AND lease_id = ?')
        .bind(owner, lease).run();
      if (!result.success) throw new Error('waterfront_seat_write_failed');
      return respond({ ok: true });
    }

    const membership = canonicalFactionProjection(await db.prepare(CANONICAL_FACTION_READ_SQL).bind(owner).first());
    if (!membership.joined) return respond({ error: 'join_faction' }, 403);
    const faction = membership.faction_id;
    const aliases = [faction, ...Object.keys(FACTION_ALIASES).filter(key => FACTION_ALIASES[key] === faction)];
    const stillInFaction = `EXISTS (
      SELECT 1 FROM blocktopia_progression WHERE telegram_id = ? AND LOWER(TRIM(faction)) IN (${aliases.map(() => '?').join(', ')})
    )`;
    const at = Math.floor(now() / 1000);
    const expires = at + LEASE_SECONDS;
    if (action === 'status') {
      const seat = await db.prepare('SELECT telegram_id, lease_id, expires_at FROM waterfront_seats WHERE faction_id = ?')
        .bind(faction).first();
      return respond({
        ok: true, faction_id: faction,
        occupied: Boolean(seat && seat.expires_at > at && (seat.telegram_id !== owner || seat.lease_id !== lease)),
      });
    }

    if (action === 'renew') {
      const seat = await db.prepare(`
        UPDATE waterfront_seats SET expires_at = ?
        WHERE faction_id = ? AND telegram_id = ? AND lease_id = ? AND expires_at > ? AND ${stillInFaction}
        RETURNING expires_at
      `).bind(expires, faction, owner, lease, at, owner, ...aliases).first();
      if (!seat) return respond({ error: 'seat_lost' }, 409);
      return respond({ ok: true, faction_id: faction, expires_in: LEASE_SECONDS });
    }

    // Keep the seat swap and new claim atomic. The unique faction and owner
    // keys also prevent two concurrent claims from taking extra places.
    const [cleanup, claim] = await db.batch([
      db.prepare(`
        DELETE FROM waterfront_seats
        WHERE expires_at <= ? OR (telegram_id = ? AND faction_id <> ? AND ${stillInFaction})
      `).bind(at, owner, faction, owner, ...aliases),
      db.prepare(`
        INSERT INTO waterfront_seats (faction_id, telegram_id, lease_id, expires_at)
        SELECT ?, ?, ?, ? WHERE ${stillInFaction}
        ON CONFLICT (faction_id) DO UPDATE SET expires_at = excluded.expires_at
        WHERE waterfront_seats.telegram_id = excluded.telegram_id AND waterfront_seats.lease_id = excluded.lease_id
        RETURNING expires_at
      `).bind(faction, owner, lease, expires, owner, ...aliases),
    ]);
    if (!cleanup.success || !claim.success) throw new Error('waterfront_seat_write_failed');
    if (!claim.results?.length) return respond({ error: 'seat_occupied' }, 409);
    return respond({ ok: true, faction_id: faction, expires_in: LEASE_SECONDS, district });
  } catch {
    logApiFailure?.('waterfront_admission_unavailable', {});
    return respond({ error: 'admission_unavailable' }, 503);
  }
}
