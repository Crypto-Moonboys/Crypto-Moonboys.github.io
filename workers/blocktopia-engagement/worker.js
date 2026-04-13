/**
 * Block Topia: Street Signal 3008 — Engagement Worker
 *
 * Manages Battle Chambers community engagement: event feed,
 * reactions, and participant activity metrics.
 *
 * KV bindings (wrangler.toml):
 *   COMMUNITY_FEED — Battle Chambers event log (shared with realtime worker)
 *   CACHE          — short-lived read cache
 *
 * Routes:
 *   GET  /health
 *   GET  /engagement/feed              — paginated event feed
 *   POST /engagement/reaction          — record a player reaction
 *   GET  /engagement/top               — top engaged players
 *   GET  /engagement/stats             — aggregate engagement stats
 *   POST /engagement/event             — publish a new engagement event (admin)
 *
 * Secrets:
 *   ADMIN_SECRET — required X-Admin-Secret header for admin routes
 */

const ALLOWED_METHODS = 'GET, POST, OPTIONS';

// ── CORS ─────────────────────────────────────────────────────────────────────

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonOk(data, origin) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function jsonError(message, status, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function isAdmin(request, env) {
  const secret = request.headers.get('X-Admin-Secret')
    || new URL(request.url).searchParams.get('admin_secret');
  return secret && secret === env.ADMIN_SECRET;
}

async function cachedGet(env, key, ttl, fetchFn) {
  const cached = await env.CACHE.get(key, { type: 'json' });
  if (cached !== null) return cached;
  const fresh = await fetchFn();
  if (fresh !== null && fresh !== undefined) {
    await env.CACHE.put(key, JSON.stringify(fresh), { expirationTtl: ttl });
  }
  return fresh;
}

async function readFeed(env) {
  const raw = await env.COMMUNITY_FEED.get('feed:log', { type: 'json' });
  return Array.isArray(raw) ? raw : [];
}

async function writeFeed(env, events) {
  await env.COMMUNITY_FEED.put('feed:log', JSON.stringify(events));
}

function newEventId() {
  const ts   = Date.now().toString(36).padStart(11, '0');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleGetFeed(request, env, origin) {
  const url    = new URL(request.url);
  const page   = Math.max(Number(url.searchParams.get('page')) || 1, 1);
  const limit  = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), Number(env.FEED_MAX_EVENTS) || 50);
  const ttl    = Number(env.CACHE_TTL_SECONDS) || 30;
  const offset = (page - 1) * limit;

  const payload = await cachedGet(env, `cache:engagement:feed:${page}:${limit}`, ttl, async () => {
    const events = await readFeed(env);
    events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return {
      events: events.slice(offset, offset + limit),
      total:  events.length,
      page,
      limit,
    };
  });

  return jsonOk(payload, origin);
}

async function handlePostReaction(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400, origin);
  }

  const { player_id, player_name, event_id, reaction } = body;

  const VALID_REACTIONS = ['fire', 'rocket', 'moon', 'diamond', 'skull'];

  if (!player_id || typeof player_id !== 'string' || player_id.trim().length < 1) {
    return jsonError('player_id is required', 400, origin);
  }
  if (!player_name || typeof player_name !== 'string' || player_name.trim().length < 2 || player_name.trim().length > 30) {
    return jsonError('player_name must be 2–30 characters', 400, origin);
  }
  if (!event_id || typeof event_id !== 'string') {
    return jsonError('event_id is required', 400, origin);
  }
  if (!reaction || !VALID_REACTIONS.includes(reaction)) {
    return jsonError(`reaction must be one of: ${VALID_REACTIONS.join(', ')}`, 400, origin);
  }

  // Rate-limit: one reaction per player per event (stored in KV)
  const rateLimitKey = `reaction:${player_id.trim()}:${event_id}`;
  const existing     = await env.COMMUNITY_FEED.get(rateLimitKey);
  if (existing) {
    return jsonError('You have already reacted to this event', 409, origin);
  }

  const record = {
    player_id:   player_id.trim(),
    player_name: player_name.trim(),
    event_id,
    reaction,
    recorded_at: new Date().toISOString(),
  };

  // Persist reaction and rate-limit marker (TTL = 30 days)
  const TTL_30D = 60 * 60 * 24 * 30;
  const reactionKey = `reactions:${event_id}:${player_id.trim()}`;
  await Promise.all([
    env.COMMUNITY_FEED.put(reactionKey, JSON.stringify(record), { expirationTtl: TTL_30D }),
    env.COMMUNITY_FEED.put(rateLimitKey, '1', { expirationTtl: TTL_30D }),
  ]);

  return new Response(JSON.stringify({ reaction: record }), {
    status: 201,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

async function handleGetTop(request, env, origin) {
  const url   = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 50);
  const ttl   = Number(env.CACHE_TTL_SECONDS) || 30;

  const payload = await cachedGet(env, `cache:engagement:top:${limit}`, ttl, async () => {
    const events = await readFeed(env);
    // Tally event counts per actor
    const counts = {};
    for (const ev of events) {
      if (!ev.actor) continue;
      counts[ev.actor] = (counts[ev.actor] || 0) + 1;
    }
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([actor, count], i) => ({ rank: i + 1, actor, event_count: count }));
    return { top };
  });

  return jsonOk(payload, origin);
}

async function handleGetStats(request, env, origin) {
  const ttl = Number(env.CACHE_TTL_SECONDS) || 30;

  const payload = await cachedGet(env, 'cache:engagement:stats', ttl, async () => {
    const events    = await readFeed(env);
    const typeMap   = {};
    let   lastEvent = null;
    for (const ev of events) {
      typeMap[ev.type] = (typeMap[ev.type] || 0) + 1;
      if (!lastEvent || Date.parse(ev.timestamp) > Date.parse(lastEvent)) {
        lastEvent = ev.timestamp;
      }
    }
    return {
      total_events: events.length,
      by_type:      typeMap,
      last_event:   lastEvent,
    };
  });

  return jsonOk(payload, origin);
}

async function handlePostEvent(request, env, origin) {
  if (!isAdmin(request, env)) {
    return jsonError('Forbidden', 403, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400, origin);
  }

  const { type, actor, district_id, data } = body;

  if (!type || typeof type !== 'string' || type.trim().length < 1) {
    return jsonError('type is required', 400, origin);
  }
  if (!actor || typeof actor !== 'string' || actor.trim().length < 1) {
    return jsonError('actor is required', 400, origin);
  }

  const event = {
    id:          newEventId(),
    type:        type.trim(),
    actor:       actor.trim(),
    district_id: district_id || null,
    data:        data || {},
    timestamp:   new Date().toISOString(),
  };

  const maxEvents = Number(env.FEED_MAX_EVENTS) || 50;
  const events    = await readFeed(env);
  events.unshift(event);
  if (events.length > maxEvents) events.splice(maxEvents);

  await writeFeed(env, events);
  // Invalidate cached pages
  await Promise.all([
    env.CACHE.delete('cache:engagement:feed:1:20'),
    env.CACHE.delete('cache:engagement:stats'),
  ]);

  return new Response(JSON.stringify({ event }), {
    status: 201,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || 'https://crypto-moonboys.github.io';
    const url    = new URL(request.url);
    const path   = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      if (path === '/health' && request.method === 'GET') {
        return jsonOk({ status: 'ok', worker: 'blocktopia-engagement' }, origin);
      }

      if (path === '/engagement/feed' && request.method === 'GET') {
        return handleGetFeed(request, env, origin);
      }

      if (path === '/engagement/reaction' && request.method === 'POST') {
        return handlePostReaction(request, env, origin);
      }

      if (path === '/engagement/top' && request.method === 'GET') {
        return handleGetTop(request, env, origin);
      }

      if (path === '/engagement/stats' && request.method === 'GET') {
        return handleGetStats(request, env, origin);
      }

      if (path === '/engagement/event' && request.method === 'POST') {
        return handlePostEvent(request, env, origin);
      }

      return jsonError('Not Found', 404, origin);
    } catch (err) {
      return jsonError('Internal Server Error', 500, origin);
    }
  },
};
