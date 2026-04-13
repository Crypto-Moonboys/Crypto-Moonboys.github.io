/**
 * Block Topia: Street Signal 3008 — Realtime Event Feed Worker
 *
 * Provides a lightweight polling-based real-time event feed for
 * Battle Chambers and district activity in the Block Topia ecosystem.
 *
 * KV bindings (wrangler.toml):
 *   COMMUNITY_FEED — Battle Chambers event log
 *   CACHE          — short-lived read cache
 *
 * Routes:
 *   GET  /health
 *   GET  /realtime/feed          — poll for recent events (?since=<iso>&limit=<n>)
 *   POST /realtime/event         — emit a new event (admin)
 *   DELETE /realtime/event/:id   — remove a specific event (admin)
 *
 * Secrets:
 *   ADMIN_SECRET — required X-Admin-Secret header value for mutating admin routes
 */

const ALLOWED_METHODS = 'GET, POST, DELETE, OPTIONS';

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

/** Generate a time-ordered, lexicographically sortable event ID. */
function newEventId() {
  const ts = Date.now().toString(36).padStart(11, '0');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

/** Read the entire feed log from KV, always returning an array. */
async function readFeed(env) {
  const raw = await env.COMMUNITY_FEED.get('feed:log', { type: 'json' });
  return Array.isArray(raw) ? raw : [];
}

/** Write the feed log back to KV. */
async function writeFeed(env, events) {
  await env.COMMUNITY_FEED.put('feed:log', JSON.stringify(events));
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleGetFeed(request, env, origin) {
  const url   = new URL(request.url);
  const since = url.searchParams.get('since');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), Number(env.FEED_MAX_EVENTS) || 100);
  const ttl   = Number(env.CACHE_TTL_SECONDS) || 10;

  const cacheKey = `cache:feed:${since || ''}:${limit}`;
  const cached   = await env.CACHE.get(cacheKey, { type: 'json' });
  if (cached !== null) {
    return jsonOk(cached, origin);
  }

  let events = await readFeed(env);

  if (since) {
    const sinceMs = Date.parse(since);
    if (!Number.isNaN(sinceMs)) {
      events = events.filter((e) => Date.parse(e.timestamp) > sinceMs);
    }
  }

  // Most-recent first
  events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const page = events.slice(0, limit);
  const payload = { events: page, total: events.length };

  await env.CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: ttl });
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

  const maxEvents = Number(env.FEED_MAX_EVENTS) || 100;
  const events    = await readFeed(env);
  events.unshift(event);

  // Cap the log at maxEvents to keep KV value size bounded
  if (events.length > maxEvents) {
    events.splice(maxEvents);
  }

  await writeFeed(env, events);
  // Invalidate cached feed pages
  await env.CACHE.delete('cache:feed::20');

  return new Response(JSON.stringify({ event }), {
    status: 201,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

async function handleDeleteEvent(request, env, origin, id) {
  if (!isAdmin(request, env)) {
    return jsonError('Forbidden', 403, origin);
  }

  const events  = await readFeed(env);
  const before  = events.length;
  const updated = events.filter((e) => e.id !== id);

  if (updated.length === before) {
    return jsonError('Event not found', 404, origin);
  }

  await writeFeed(env, updated);
  return jsonOk({ deleted: id }, origin);
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
        return jsonOk({ status: 'ok', worker: 'blocktopia-realtime' }, origin);
      }

      if (path === '/realtime/feed' && request.method === 'GET') {
        return handleGetFeed(request, env, origin);
      }

      if (path === '/realtime/event' && request.method === 'POST') {
        return handlePostEvent(request, env, origin);
      }

      const deleteMatch = path.match(/^\/realtime\/event\/([^/]+)$/);
      if (deleteMatch && request.method === 'DELETE') {
        return handleDeleteEvent(request, env, origin, deleteMatch[1]);
      }

      return jsonError('Not Found', 404, origin);
    } catch (err) {
      return jsonError('Internal Server Error', 500, origin);
    }
  },
};
