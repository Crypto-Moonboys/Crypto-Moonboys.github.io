import { verifyTelegramIdentityFromBody } from '../blocktopia/auth.js';
import { CANONICAL_FACTION_READ_SQL, canonicalFactionProjection } from '../shared/faction-projection.js';
import { FACTION_ALIASES } from '../shared/faction-canon.js';
import { MINERS, RULES_VERSION, advanceMine, dailyRouteIndex, describeMine } from '../shared/clan-mining.js';

const minerKeys = [MINERS, ...Object.keys(FACTION_ALIASES).filter(key => FACTION_ALIASES[key] === MINERS)];
const STILL_MINER = `EXISTS (
  SELECT 1 FROM blocktopia_progression
  WHERE telegram_id = ? AND LOWER(TRIM(faction)) IN (${minerKeys.map(() => '?').join(', ')})
)`;

export function clanOperationsEnabled(env) {
  return env.CLAN_OPERATIONS_ENABLED === 'true';
}

function selectDay(db, owner, day) {
  return db.prepare('SELECT * FROM clan_operation_days WHERE telegram_id = ? AND utc_day = ?')
    .bind(owner, day).first();
}

function utcDay(now) {
  return now.toISOString().slice(0, 10);
}

async function readMine(db, owner, now) {
  const day = utcDay(now);
  const row = await selectDay(db, owner, day);
  if (row && (row.faction_id !== MINERS || row.rules_version !== RULES_VERSION)) return null;
  const state = row ?? {
    route_index: dailyRouteIndex(now), tier: 0, ore: 0, braced: 0, collapsed: 0, revision: 0,
  };
  const mine = describeMine(state.route_index, state);
  const totals = await db.prepare(`
    SELECT COALESCE(SUM(renown), 0) AS total,
      COALESCE(SUM(CASE WHEN utc_day = ? THEN renown ELSE 0 END), 0) AS today
    FROM clan_operation_awards WHERE telegram_id = ? AND faction_id = ?
  `).bind(day, owner, MINERS).first();
  const crew = await db.prepare(`
    SELECT COUNT(*) AS banks FROM clan_operation_awards WHERE faction_id = ? AND utc_day = ?
  `).bind(MINERS, day).first();
  const collection = await db.prepare(`
    SELECT specimen_key, COUNT(*) AS collected
    FROM clan_operation_awards WHERE telegram_id = ? AND faction_id = ?
    GROUP BY specimen_key ORDER BY specimen_key
  `).bind(owner, MINERS).all();
  const reset = new Date(`${day}T00:00:00.000Z`);
  reset.setUTCDate(reset.getUTCDate() + 1);
  return {
    ok: true, status: state.tier === 3 ? 'complete' : 'ready',
    utc_day: day, resets_at: reset.toISOString(), faction_id: MINERS, mine,
    revision: state.revision, tier: state.tier, ore: state.ore,
    braced: Boolean(state.braced), collapsed: Boolean(state.collapsed),
    last_action: state.last_action ?? null, last_outcome: state.last_outcome ?? null,
    renown_today: totals.today, renown_total: totals.total, crew_banks: crew.banks,
    collection: collection.results.map(item => {
      const [, , routeIndex, tier] = item.specimen_key.split('-');
      return { ...item, name: describeMine(Number(routeIndex), { tier: 3 }).finds[Number(tier) - 1] };
    }),
  };
}

export async function handleClanOperations(request, env, helpers) {
  const {
    path, respond, verifyTelegramAuth, rateLimit, logApiFailure,
    now = () => new Date(),
    roll = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 * 100,
  } = helpers;
  const actionRequest = path === '/clan-operations/move';
  if (request.method === 'GET' && !actionRequest) {
    return respond({ ok: true, enabled: clanOperationsEnabled(env) });
  }
  if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
  if (!clanOperationsEnabled(env)) return respond({ error: 'pilot_closed' }, 404);
  const ipLimited = rateLimit?.();
  if (ipLimited) return ipLimited;
  let body;
  try { body = await request.json(); } catch { return respond({ error: 'invalid_json' }, 400); }
  const identity = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
  if (identity.error) return respond({ error: 'connect_telegram' }, identity.status || 401);
  const owner = String(identity.telegramId);
  const ownerLimited = rateLimit?.(owner);
  if (ownerLimited) return ownerLimited;
  try {
    const membership = canonicalFactionProjection(
      await env.DB.prepare(CANONICAL_FACTION_READ_SQL).bind(owner).first(),
    );
    if (!membership.joined) return respond({ error: 'join_faction' }, 403);
    if (membership.faction_id !== MINERS) return respond({ error: 'faction_not_in_pilot' }, 403);

    const requestTime = now();
    const day = utcDay(requestTime);
    if (actionRequest) {
      if (body.utc_day !== day || !Number.isSafeInteger(body.revision) || body.revision < 0) {
        return respond({ error: 'refresh_operation' }, 409);
      }
      if (!['safe', 'brace', 'deep', 'recover', 'bank'].includes(body.action)) {
        return respond({ error: 'invalid_move' }, 400);
      }
      const db = env.DB;
      const route = dailyRouteIndex(requestTime);
      const saved = await selectDay(db, owner, day);
      const state = saved ?? { route_index: route, revision: 0, tier: 0, ore: 0, braced: 0, collapsed: 0 };
      if (state.revision !== body.revision || (saved && (saved.faction_id !== MINERS || saved.rules_version !== RULES_VERSION))) {
        return respond({ error: 'refresh_operation' }, 409);
      }
      const next = advanceMine(state, body.action, roll());
      if (!next || utcDay(now()) !== day) return respond({ error: 'refresh_operation' }, 409);

      // D1 evaluates membership and revision in the same statement as the move.
      // The award trigger is part of this UPDATE, so a failed receipt rolls back the move.
      const result = saved
        ? await db.prepare(`
          UPDATE clan_operation_days SET tier = ?, ore = ?, braced = ?, collapsed = ?,
            last_action = ?, last_outcome = ?, revision = revision + 1, updated_at = ?
          WHERE telegram_id = ? AND utc_day = ? AND revision = ?
            AND faction_id = ? AND rules_version = ? AND ${STILL_MINER}
        `).bind(next.tier, next.ore, next.braced, next.collapsed, body.action, next.outcome,
          requestTime.toISOString(), owner, day, state.revision, MINERS, RULES_VERSION, owner, ...minerKeys).run()
        : await db.prepare(`
          INSERT INTO clan_operation_days (telegram_id, utc_day, faction_id, rules_version, route_index,
            revision, ore, braced, collapsed, last_action, last_outcome, updated_at)
          SELECT ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ? WHERE ${STILL_MINER}
          ON CONFLICT (telegram_id, utc_day) DO NOTHING
        `).bind(owner, day, MINERS, RULES_VERSION, route, next.ore, next.braced, next.collapsed,
          body.action, next.outcome, requestTime.toISOString(), owner, ...minerKeys).run();
      if (result.meta.changes !== 1) return respond({ error: 'refresh_operation' }, 409);
    }
    const mine = await readMine(env.DB, owner, requestTime);
    return mine ? respond(mine) : respond({ error: 'operation_unavailable' }, 409);
  } catch (error) {
    logApiFailure?.('clan_operations_unavailable', { message: error?.message });
    return respond({ error: 'operation_unavailable' }, 503);
  }
}
