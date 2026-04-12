/**
 * Moonboys API — Cloudflare Worker entrypoint
 *
 * Handles community engagement endpoints backed by a D1 database (binding: DB).
 * Configure the D1 database ID in wrangler.toml before deploying.
 *
 * Routes:
 *   GET  /health                  — liveness check
 *   GET  /comments?page_id=&limit=  — list approved comments for a page
 *   POST /comments                — submit a new comment (queued for moderation)
 *   POST /votes                   — cast an up/down vote on a comment
 *   POST /page-likes              — record a page like
 *   POST /citation-votes          — cast an up/down vote on a citation
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

function randomId() {
  return crypto.randomUUID();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health check
    if (path === '/health' && request.method === 'GET') {
      return json({ ok: true });
    }

    // GET /comments
    if (path === '/comments' && request.method === 'GET') {
      const pageId = url.searchParams.get('page_id');
      if (!pageId) return err('page_id required');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
      try {
        const rows = await env.DB.prepare(
          'SELECT id, page_id, text, created_at FROM comments WHERE page_id = ? AND approved = 1 ORDER BY created_at DESC LIMIT ?'
        ).bind(pageId, limit).all();
        return json({ comments: rows.results });
      } catch {
        return err('Failed to load comments', 500);
      }
    }

    // POST /comments
    if (path === '/comments' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { page_id, user_id, text } = body || {};
      if (!page_id || !text) return err('page_id and text required');
      const id = randomId();
      const uid = user_id || 'anonymous';
      try {
        await env.DB.prepare(
          'INSERT INTO comments (id, page_id, user_id, text, approved) VALUES (?, ?, ?, ?, 0)'
        ).bind(id, page_id, uid, String(text).slice(0, 2000)).run();
      } catch {
        return err('Failed to save comment', 500);
      }
      return json({ id, status: 'pending_moderation' }, 201);
    }

    // POST /votes
    if (path === '/votes' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { comment_id, vote } = body || {};
      if (!comment_id || !['up', 'down'].includes(vote)) return err('comment_id and vote (up|down) required');
      const id = randomId();
      try {
        await env.DB.prepare(
          'INSERT INTO votes (id, comment_id, vote) VALUES (?, ?, ?)'
        ).bind(id, comment_id, vote).run();
      } catch {
        return err('Failed to record vote', 500);
      }
      return json({ id }, 201);
    }

    // POST /page-likes
    if (path === '/page-likes' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { page_id } = body || {};
      if (!page_id) return err('page_id required');
      const id = randomId();
      try {
        await env.DB.prepare(
          'INSERT INTO page_likes (id, page_id) VALUES (?, ?)'
        ).bind(id, page_id).run();
      } catch {
        return err('Failed to record like', 500);
      }
      return json({ id }, 201);
    }

    // POST /citation-votes
    if (path === '/citation-votes' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { page_id, cite_id, vote } = body || {};
      if (!page_id || !cite_id || !['up', 'down'].includes(vote)) {
        return err('page_id, cite_id, and vote (up|down) required');
      }
      const id = randomId();
      try {
        await env.DB.prepare(
          'INSERT INTO citation_votes (id, page_id, cite_id, vote) VALUES (?, ?, ?, ?)'
        ).bind(id, page_id, cite_id, vote).run();
      } catch {
        return err('Failed to record citation vote', 500);
      }
      return json({ id }, 201);
    }

    return err('Not found', 404);
  },
};
