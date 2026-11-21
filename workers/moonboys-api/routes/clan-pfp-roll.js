import { verifyTelegramIdentityFromBody } from '../blocktopia/auth.js';
import { awardCommunityXp } from '../community-xp-awards.js';
import { FACTION_ALIASES } from '../shared/faction-canon.js';
import { CANONICAL_FACTION_READ_SQL, canonicalFactionProjection } from '../shared/faction-projection.js';
import { buildPfpRound, drawPfpRoll } from '../shared/clan-pfp-roll.js';

const ROLL_ACTION = 'clan_pfp_roll';
const utcDay = date => date.toISOString().slice(0, 10);

async function readRound(db, day) {
  const lookup = () => db.prepare('SELECT round_json FROM clan_pfp_rounds WHERE utc_day = ?').bind(day).first();
  let row = await lookup();
  if (!row) {
    const round = await buildPfpRound(day);
    await db.prepare('INSERT INTO clan_pfp_rounds (utc_day, round_json) VALUES (?, ?) ON CONFLICT(utc_day) DO NOTHING')
      .bind(day, JSON.stringify(round)).run();
    row = await lookup();
  }
  return JSON.parse(row.round_json);
}

async function readRolls(db, owner, day) {
  const { results } = await db.prepare(`
    SELECT request_id, roll_number, result_json FROM clan_pfp_rolls
    WHERE telegram_id = ? AND utc_day = ? ORDER BY roll_number DESC
  `).bind(owner, day).all();
  return results.map(row => ({ request_id: row.request_id, roll_number: row.roll_number, ...JSON.parse(row.result_json) }));
}

function summary(day, round, rolls, replay) {
  const latest = rolls[0] ?? null;
  return {
    ok: true, utc_day: day, resets_at: new Date(Date.parse(day + 'T00:00:00Z') + 86_400_000).toISOString(),
    preset_id: round.presetId, target: round.target, pools: round.pools,
    rewards: round.rewards, limit: round.limit, rolls_left: Math.max(0, round.limit - rolls.length),
    latest, result: replay ?? latest,
    winner: rolls.find(roll => roll.matched.length === round.pools.length) ?? null,
  };
}

export async function handleClanPfpRoll(request, env, helpers) {
  const { path, respond, verifyTelegramAuth, rateLimit, logApiFailure, now = () => new Date(), pickIndex } = helpers;
  const isRoll = path.endsWith('/roll');
  const enabled = env.CLAN_OPERATIONS_ENABLED === 'true' && env.CLAN_PFP_ROLL_ENABLED === 'true';
  if (!isRoll && request.method === 'GET') return respond({ ok: true, enabled });
  if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
  if (!enabled) return respond({ error: 'pfp_roll_closed' }, 404);

  const ipLimited = rateLimit?.();
  if (ipLimited) return ipLimited;
  let body;
  try { body = await request.json(); } catch { return respond({ error: 'invalid_json' }, 400); }
  const identity = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
  if (identity.error) return respond({ error: 'connect_telegram' }, identity.status || 401);
  const owner = String(identity.telegramId);
  const ownerLimited = rateLimit?.(owner);
  if (ownerLimited) return ownerLimited;
  if (isRoll && (typeof body.request_id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(body.request_id))) {
    return respond({ error: 'invalid_request_id' }, 400);
  }

  try {
    const db = env.DB;
    const membership = canonicalFactionProjection(await db.prepare(CANONICAL_FACTION_READ_SQL).bind(owner).first());
    if (!membership.joined) return respond({ error: 'join_faction' }, 403);
    const at = now();
    const day = utcDay(at);
    if (isRoll) {
      const existing = await db.prepare(`
        SELECT utc_day FROM clan_pfp_rolls WHERE telegram_id = ? AND request_id = ?
      `).bind(owner, body.request_id).first();
      if (existing) {
        const replayDay = existing.utc_day;
        const [round, rolls] = await Promise.all([readRound(db, replayDay), readRolls(db, owner, replayDay)]);
        return respond(summary(replayDay, round, rolls, rolls.find(roll => roll.request_id === body.request_id)));
      }
      if (body.utc_day !== day) return respond({ error: 'pfp_day_changed' }, 409);
    }
    const [round, rolls] = await Promise.all([readRound(db, day), readRolls(db, owner, day)]);
    if (!isRoll) return respond(summary(day, round, rolls));
    const recovered = rolls.find(roll => roll.request_id === body.request_id);
    if (recovered) return respond(summary(day, round, rolls, recovered));
    if (rolls.length >= round.limit) return respond({ ...summary(day, round, rolls), ok: false, error: 'pfp_daily_limit' }, 409);
    if (utcDay(now()) !== day) return respond({ error: 'pfp_day_changed' }, 409);

    const result = drawPfpRoll(round, pickIndex);
    const faction = membership.faction_id;
    const keys = [faction, ...Object.keys(FACTION_ALIASES).filter(alias => FACTION_ALIASES[alias] === faction)];
    try {
      await awardCommunityXp(db, owner, result.xp, ROLL_ACTION, body.request_id, {
        now: at,
        sourcePredicate: {
          sql: `(SELECT COUNT(*) FROM clan_pfp_rolls WHERE telegram_id = ? AND utc_day = ?) < ?
            AND EXISTS (SELECT 1 FROM blocktopia_progression
              WHERE telegram_id = ? AND LOWER(TRIM(faction)) IN (${keys.map(() => '?').join(', ')}))`,
          args: [owner, day, round.limit, owner, ...keys],
        },
        sourceStatements: gate => [{
          statement: db.prepare(`
            INSERT INTO clan_pfp_rolls (telegram_id, request_id, utc_day, roll_number, result_json, created_at)
            SELECT ?, ?, ?, COALESCE((SELECT MAX(roll_number) FROM clan_pfp_rolls WHERE telegram_id = ? AND utc_day = ?), 0) + 1,
              ?, ? WHERE ${gate.sql}
          `).bind(owner, body.request_id, day, owner, day, JSON.stringify(result), at.toISOString(), ...gate.args),
        }],
      });
    } catch (error) {
      if (error?.message !== 'community_xp_source_changed') throw error;
      const settled = await readRolls(db, owner, day);
      if (settled.length >= round.limit) return respond({ ...summary(day, round, settled), ok: false, error: 'pfp_daily_limit' }, 409);
      throw error;
    }
    const settled = await readRolls(db, owner, day);
    const saved = settled.find(roll => roll.request_id === body.request_id);
    if (!saved) throw new Error('pfp_roll_receipt_unavailable');
    return respond(summary(day, round, settled, saved));
  } catch (error) {
    logApiFailure?.('clan_pfp_roll_unavailable', { message: error?.message });
    return respond({ error: 'pfp_roll_unavailable' }, 503);
  }
}
