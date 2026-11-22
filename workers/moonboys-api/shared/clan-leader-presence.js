import { CANONICAL_FACTION_KEYS, FACTION_ALIASES } from './faction-canon.js';
import { advanceMine, dailyRouteIndex, describeMine } from './clan-mining.js';

const SLOT_SECONDS = 300;
const DAY_SECONDS = 86400;
const HOME = 'https://cryptomoonboys.com';
const DEFAULT_ROUTES = ['/games/', '/community.html', '/battle-chamber/factions/'];
const QUESTIONS = [
  { id: 'territory', title: 'What is your faction working on today?', answer: 'We’re checking our crew’s progress and planning the next job.', minutes: 5 },
  { id: 'defences', title: 'Which part of the city would you defend first?', answer: 'The routes our crews use to move supplies. The whole district depends on keeping those lanes open.', minutes: 10 },
  { id: 'alliance', title: 'What would make your faction strike a deal with a rival?', answer: 'A deal needs terms both crews can verify. Bring a plan for the docks and we’ll talk through who does what.', minutes: 20 },
];
const PAID = [
  { id: 'hour', title: 'Pause for 1 hour', minutes: 60, recovery: 3600, xp: 100, gems: 5 },
  { id: 'day', title: 'Pause for 24 hours', minutes: 1440, recovery: 21600, xp: 1200, gems: 50 },
];

const utcSecond = date => Math.floor(date.getTime() / 1000);

export function clanLeaderStart(env) {
  const day = env.CLAN_LEADER_PLAY_FROM;
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const start = new Date(day + 'T00:00:00Z');
  return Number.isFinite(start.getTime()) && start.toISOString().slice(0, 10) === day ? utcSecond(start) : null;
}

function factionPath(faction) {
  return '/battle-chamber/factions/' + faction + '.html';
}

function checkedRows(result) {
  if (result.success !== true || !Array.isArray(result.results)) throw new Error('clan_leader_presence_unavailable');
  return result.results;
}

export function publicLeaderRoutes(xml) {
  const paths = new Set(DEFAULT_ROUTES);
  for (const [, uri] of xml.matchAll(/<loc>\s*(https:\/\/cryptomoonboys\.com\/[a-zA-Z0-9_/%.~-]*)\s*<\/loc>/g)) {
    const url = new URL(uri);
    if (!/^\/(?:api|admin|auth|account|wallet|telegram|cdn-cgi)(?:[\/.]|$)/i.test(url.pathname) &&
        !/(?:%2f|%5c|%2e)/i.test(url.pathname)) paths.add(url.pathname);
  }
  return Array.from(paths);
}

function completeTrainingRound(at) {
  let state = { route_index: dailyRouteIndex(at), tier: 0, ore: 0, braced: 0, collapsed: 0 };
  for (let move = 0; move < 8; move++) {
    const { actions } = describeMine(state.route_index, state);
    const next = advanceMine(state, actions.includes('bank') ? 'bank' : 'safe', 0);
    if (!next) return false;
    if (next.outcome === 'tier_banked') return true;
    state = { ...next, route_index: state.route_index };
  }
  return false;
}

// Every leader plays the same server-side training rules in a fresh, unranked
// round. No player profile, bank or Arcade result is created.
export async function runClanLeaderRounds(db, start, at, fetchPage = fetch) {
  const slot = Math.floor(utcSecond(at) / SLOT_SECONDS) * SLOT_SECONDS;
  if (slot < start) return;
  const roster = checkedRows(await db.prepare(`
    WITH occupied AS (
      SELECT target_faction AS faction_id FROM clan_leader_slowdowns WHERE starts_at <= ?1 AND ends_at > ?1
      UNION SELECT faction_id FROM clan_leader_rounds WHERE slot = ?1
    )
    SELECT value AS faction_id FROM json_each(?2)
    WHERE value NOT IN (SELECT faction_id FROM occupied)
  `).bind(slot, JSON.stringify(CANONICAL_FACTION_KEYS)).all());
  if (!roster.length) return;
  const sitemap = await fetchPage(HOME + '/sitemap.xml', { redirect: 'error', cf: { cacheEverything: true, cacheTtl: 3600 } });
  if (!sitemap.ok) throw new Error('clan_leader_site_catalog_unavailable');
  const routes = publicLeaderRoutes(await sitemap.text());
  const games = routes.filter(path => /^\/games\/[^/]+\/$/.test(path));
  const turn = Math.floor(slot / SLOT_SECONDS);
  const visits = await Promise.all(roster.map(async ({ faction_id }) => {
    const index = CANONICAL_FACTION_KEYS.indexOf(faction_id);
    const stop = (turn + index) % 6;
    const choices = stop < 4 && games.length ? games : routes;
    const path = stop === 0 ? factionPath(faction_id) : choices[(Math.floor(turn / 6) + 17 * index) % choices.length];
    const page = await fetchPage(HOME + path, { method: 'HEAD', redirect: 'manual' }).catch(() => null);
    const canonical = page?.headers.get('location');
    const internalRedirect = canonical?.startsWith('/') && !canonical.startsWith('//');
    const reachable = page?.ok || (page?.status >= 300 && page?.status < 400 && internalRedirect);
    return reachable && completeTrainingRound(at) ? { faction_id, path } : null;
  }));
  const writes = visits.filter(Boolean).map(({ faction_id, path }) => db.prepare(`
    INSERT INTO clan_leader_rounds (faction_id, slot, site_path)
    SELECT ?1, ?2, ?3 WHERE NOT EXISTS (
      SELECT 1 FROM clan_leader_slowdowns WHERE target_faction = ?1 AND starts_at <= ?2 AND ends_at > ?2
    )
    ON CONFLICT (faction_id, slot) DO NOTHING
  `).bind(faction_id, slot, path));
  if (writes.length) await db.batch(writes);
}

export async function readClanLeaderPresence(db, weekStart, at) {
  const time = utcSecond(at);
  const [rounds, slowdowns] = await Promise.all([
    db.prepare(`
      SELECT faction_id, COUNT(*) AS rounds,
        (SELECT site_path FROM clan_leader_rounds AS latest
         WHERE latest.faction_id = rounds.faction_id AND slot <= ?2 ORDER BY slot DESC LIMIT 1) AS site_path
      FROM clan_leader_rounds AS rounds WHERE slot >= ?1 AND slot <= ?2 GROUP BY faction_id
    `).bind(Date.parse(weekStart + 'T00:00:00Z') / 1000, time).all(),
    db.prepare(`
      SELECT target_faction, kind, option_id, starts_at, ends_at, available_at FROM clan_leader_slowdowns
      WHERE starts_at <= ?1 AND available_at > ?1
    `).bind(time).all(),
  ]);
  const byFaction = new Map(checkedRows(rounds).map(row => [row.faction_id, row]));
  const windows = new Map(checkedRows(slowdowns).map(row => [row.target_faction, row]));
  return {
    controls: {
      questions: QUESTIONS.map(({ id, title, minutes }) => ({ id, title, minutes })),
      paid: PAID.map(({ id, title, minutes, xp, gems }) => ({ id, title, minutes, xp, gems })),
    },
    byFaction: new Map(CANONICAL_FACTION_KEYS.map(faction => {
      const window = windows.get(faction);
      const active = window && window.ends_at > time;
      return [faction, {
        rounds: byFaction.get(faction)?.rounds ?? 0,
        site_path: byFaction.get(faction)?.site_path ?? factionPath(faction),
        faction_path: factionPath(faction),
        paused_until: active ? window.ends_at : null,
        available_at: window?.available_at ?? null,
        talking: Boolean(active && window.kind === 'talk'),
      }];
    })),
  };
}

function receipt(result) {
  const question = QUESTIONS.find(question => question.id === result.option_id);
  return { ok: true, target: result.target_faction, paused_until: result.ends_at, reply: result.kind === 'talk' ? question.answer : null };
}

export async function slowClanLeader(db, owner, faction, body, at) {
  const target = body.target;
  const requestId = body.request_id;
  const key = body.option;
  const currency = body.currency ?? null;
  const question = currency === null ? QUESTIONS.find(question => question.id === key) : null;
  const paid = currency === 'xp' || currency === 'gems' ? PAID.find(offer => offer.id === key) : null;
  if (!CANONICAL_FACTION_KEYS.includes(target) || typeof requestId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(requestId) || (!question && !paid)) {
    return { error: 'invalid_slowdown', status: 400 };
  }
  const prior = await db.prepare('SELECT * FROM clan_leader_slowdowns WHERE account_id = ? AND request_id = ?')
    .bind(owner, requestId).first();
  if (prior) {
    if (prior.target_faction !== target || prior.option_id !== key || prior.currency !== currency) {
      return { error: 'request_conflict', status: 409 };
    }
    return receipt(prior);
  }
  if (target === faction) return { error: 'rival_required', status: 403 };

  const time = utcSecond(at);
  const ends = time + (question ?? paid).minutes * 60;
  const day = question ? Math.floor(time / DAY_SECONDS) : null;
  const cooldown = ends + (paid?.recovery ?? 3600);
  const cost = paid?.[currency] ?? 0;
  const keys = [faction, ...Object.keys(FACTION_ALIASES).filter(key => FACTION_ALIASES[key] === faction)];
  const written = await db.prepare(`
    INSERT INTO clan_leader_slowdowns (
      account_id, request_id, target_faction, kind, option_id, starts_at, ends_at, available_at, talk_day, currency, cost
    )
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11 FROM blocktopia_progression
    WHERE telegram_id = ?1 AND LOWER(TRIM(faction)) IN (${keys.map(() => '?').join(', ')})
      AND (?10 IS NULL OR (
        ((?10 = 'xp' AND xp >= ?11) OR (?10 = 'gems' AND gems >= ?11))
        AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'clan_leader_slowdown_spend')
      ))
      AND NOT EXISTS (SELECT 1 FROM clan_leader_slowdowns WHERE target_faction = ?3 AND available_at > ?6)
    ON CONFLICT DO NOTHING RETURNING *
  `).bind(owner, requestId, target, question ? 'talk' : 'paid', key, time, ends, cooldown, day, currency, cost, ...keys).first();
  if (written) return receipt(written);

  const after = await db.prepare('SELECT * FROM clan_leader_slowdowns WHERE account_id = ? AND request_id = ?')
    .bind(owner, requestId).first();
  if (after) {
    if (after.target_faction === target && after.option_id === key && after.currency === currency) return receipt(after);
    return { error: 'request_conflict', status: 409 };
  }
  if (day !== null && await db.prepare('SELECT 1 FROM clan_leader_slowdowns WHERE account_id = ? AND talk_day = ?')
    .bind(owner, day).first()) return { error: 'daily_question_used', status: 409 };
  const balance = await db.prepare('SELECT xp, gems FROM blocktopia_progression WHERE telegram_id = ?').bind(owner).first();
  if (currency && (balance?.[currency] ?? 0) < cost) return { error: 'insufficient_balance', status: 402 };
  return { error: 'leader_unavailable', status: 409 };
}
