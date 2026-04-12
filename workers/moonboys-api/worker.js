/**
 * Moonboys API — Cloudflare Worker entrypoint
 *
 * Handles community engagement endpoints backed by a D1 database (binding: DB).
 * Configure the D1 database ID in wrangler.toml before deploying.
 *
 * Routes implemented (all match the frontend fetch calls in js/):
 *
 *   GET  /health                          — liveness check
 *
 *   GET  /comments?page_id=&limit=        — list approved comments for a page
 *   POST /comments                        — submit a new comment (queued for moderation)
 *                                           Required: page_id, name, email, text
 *                                           Optional: telegram_username, discord_username, avatar_url
 *   POST /comments/:id/vote               — cast up/down vote on a comment
 *   GET  /comments/recent?limit=          — latest approved comments across all pages
 *
 *   GET  /likes?page_id=                  — get like count for a page
 *   POST /likes                           — record a page like
 *
 *   GET  /citation-votes?page_id=&cite_id= — get net score for a citation
 *   POST /citation-votes                  — cast up/down vote on a citation
 *
 *   GET  /feed?limit=                     — recent site activity feed
 *   GET  /leaderboard?limit=              — top commenters by activity score
 *   GET  /activity/hot?limit=             — hottest pages by recent engagement
 *   GET  /sam/status                      — SAM agent status stub
 *
 *   POST /telegram/auth                   — validate Telegram Login Widget payload
 *                                           and return a normalised identity object
 *                                           Secrets required: TELEGRAM_BOT_TOKEN
 *   POST /telegram/webhook                — Telegram Bot API webhook endpoint
 *                                           (accepts updates, returns 200 OK)
 */

const MAX_NAME_LENGTH    = 60;
const MAX_COMMENT_LENGTH = 2000;
const MAX_TG_LENGTH      = 60;
const MAX_DISCORD_LENGTH = 60;
const MAX_AVATAR_URL_LEN = 500;

/** Maximum age (in seconds) of a Telegram Login Widget auth payload before it is rejected. */
const TELEGRAM_AUTH_MAX_AGE = 86400; // 24 hours

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

/** Compute a hex SHA-256 digest of a string (used as Gravatar-style hash). */
async function sha256Hex(str) {
  const data   = new TextEncoder().encode(String(str || '').trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a Telegram Login Widget auth payload against the bot token.
 * Algorithm: https://core.telegram.org/widgets/login#checking-authorization
 *   secret_key  = SHA256(bot_token)
 *   check_string = sorted "key=value" pairs (excl. hash) joined by "\n"
 *   expected_hash = HMAC-SHA256(check_string, secret_key)
 */
async function verifyTelegramAuth(data, botToken) {
  if (!botToken || !data || !data.hash) return false;
  const { hash, ...fields } = data;
  // Build sorted data-check-string, omitting null/undefined fields
  const checkString = Object.keys(fields)
    .filter(k => fields[k] != null)
    .sort()
    .map(k => `${k}=${fields[k]}`)
    .join('\n');
  // secret_key = SHA256(bot_token)
  const secretKeyBytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(botToken),
  );
  // Import as HMAC-SHA256 signing key
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    secretKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  // Sign the data-check-string
  const sigBytes = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(checkString));
  const sig = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  return sig === hash;
}

/** Format a SQLite datetime string to a human-readable "N time ago" label. */
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diffMs  = Date.now() - new Date(dateStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60)   return 'just now';
  if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
  if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
  return Math.floor(diffSec / 86400) + 'd ago';
}

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── GET /health ────────────────────────────────────────────────────────
    if (path === '/health' && request.method === 'GET') {
      return json({ ok: true });
    }

    // ── SAM status stub (no DB needed) ─────────────────────────────────────
    if (path === '/sam/status' && request.method === 'GET') {
      return json({ ok: true, message: 'SAM active and monitoring the wiki.' });
    }

    // ── GET /comments?page_id=&limit= ──────────────────────────────────────
    if (path === '/comments' && request.method === 'GET') {
      const pageId = url.searchParams.get('page_id');
      if (!pageId) return err('page_id required');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
      try {
        const rows = await env.DB.prepare(
          `SELECT c.id, c.page_id, c.name, c.email_hash, c.telegram_username,
                  c.discord_username, c.avatar_url,
                  c.text, c.created_at,
                  COALESCE(SUM(CASE WHEN v.vote='up'   THEN 1 ELSE 0 END),0) AS votes_up,
                  COALESCE(SUM(CASE WHEN v.vote='down' THEN 1 ELSE 0 END),0) AS votes_down
           FROM comments c
           LEFT JOIN votes v ON v.comment_id = c.id
           WHERE c.page_id = ? AND c.approved = 1
           GROUP BY c.id
           ORDER BY c.created_at DESC
           LIMIT ?`
        ).bind(pageId, limit).all();
        const comments = (rows.results || []).map(r => ({
          ...r,
          time_ago: timeAgo(r.created_at),
        }));
        return json({ comments });
      } catch {
        return err('Failed to load comments', 500);
      }
    }

    // ── POST /comments ─────────────────────────────────────────────────────
    if (path === '/comments' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { page_id, name, text, email, telegram_username, discord_username, avatar_url } = body || {};
      if (!page_id || !name || !text) return err('page_id, name, and text required');
      if (!email) return err('email is required');
      const id         = crypto.randomUUID();
      const safeName   = String(name).trim().slice(0, MAX_NAME_LENGTH);
      const safeText   = String(text).trim().slice(0, MAX_COMMENT_LENGTH);
      const safeTg     = String(telegram_username || '').trim().slice(0, MAX_TG_LENGTH);
      const safeDiscord = String(discord_username || '').trim().slice(0, MAX_DISCORD_LENGTH);
      const safeAvatar  = String(avatar_url || '').trim().slice(0, MAX_AVATAR_URL_LEN);
      const emailHash  = await sha256Hex(email);
      try {
        await env.DB.prepare(
          `INSERT INTO comments (id, page_id, name, email_hash, telegram_username, discord_username, avatar_url, text, approved)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
        ).bind(id, page_id, safeName, emailHash, safeTg, safeDiscord, safeAvatar, safeText).run();
      } catch {
        return err('Failed to save comment', 500);
      }
      return json({ id, status: 'pending_moderation' }, 201);
    }

    // ── POST /comments/:id/vote ────────────────────────────────────────────
    const commentVoteMatch = path.match(/^\/comments\/([^/]+)\/vote$/);
    if (commentVoteMatch && request.method === 'POST') {
      const commentId = commentVoteMatch[1];
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { vote } = body || {};
      if (!['up', 'down'].includes(vote)) return err('vote must be "up" or "down"');
      const id = crypto.randomUUID();
      try {
        await env.DB.prepare(
          'INSERT INTO votes (id, comment_id, vote) VALUES (?, ?, ?)'
        ).bind(id, commentId, vote).run();
      } catch {
        return err('Failed to record vote', 500);
      }
      return json({ id }, 201);
    }

    // ── GET /comments/recent?limit= ────────────────────────────────────────
    if (path === '/comments/recent' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '5', 10), 20);
      try {
        const rows = await env.DB.prepare(
          `SELECT id, page_id, name, email_hash, telegram_username, discord_username, avatar_url, text, created_at
           FROM comments
           WHERE approved = 1
           ORDER BY created_at DESC
           LIMIT ?`
        ).bind(limit).all();
        const comments = (rows.results || []).map(r => ({
          ...r,
          time_ago: timeAgo(r.created_at),
        }));
        return json({ comments });
      } catch {
        return err('Failed to load recent comments', 500);
      }
    }

    // ── GET /likes?page_id= ────────────────────────────────────────────────
    if (path === '/likes' && request.method === 'GET') {
      const pageId = url.searchParams.get('page_id');
      if (!pageId) return err('page_id required');
      try {
        const row = await env.DB.prepare(
          'SELECT COUNT(*) AS count FROM page_likes WHERE page_id = ?'
        ).bind(pageId).first();
        return json({ page_id: pageId, count: row ? (row.count || 0) : 0 });
      } catch {
        return err('Failed to load likes', 500);
      }
    }

    // ── POST /likes ────────────────────────────────────────────────────────
    if (path === '/likes' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { page_id } = body || {};
      if (!page_id) return err('page_id required');
      const id = crypto.randomUUID();
      try {
        await env.DB.prepare(
          'INSERT INTO page_likes (id, page_id) VALUES (?, ?)'
        ).bind(id, page_id).run();
        const row = await env.DB.prepare(
          'SELECT COUNT(*) AS count FROM page_likes WHERE page_id = ?'
        ).bind(page_id).first();
        return json({ id, count: row ? (row.count || 1) : 1 }, 201);
      } catch {
        return err('Failed to record like', 500);
      }
    }

    // ── GET /citation-votes?page_id=&cite_id= ─────────────────────────────
    if (path === '/citation-votes' && request.method === 'GET') {
      const pageId = url.searchParams.get('page_id');
      const citeId = url.searchParams.get('cite_id');
      if (!pageId || !citeId) return err('page_id and cite_id required');
      try {
        const row = await env.DB.prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN vote='up'   THEN 1 ELSE 0 END),0) -
             COALESCE(SUM(CASE WHEN vote='down' THEN 1 ELSE 0 END),0) AS score
           FROM citation_votes
           WHERE page_id = ? AND cite_id = ?`
        ).bind(pageId, citeId).first();
        return json({ page_id: pageId, cite_id: citeId, score: row ? (row.score || 0) : 0 });
      } catch {
        return err('Failed to load citation votes', 500);
      }
    }

    // ── POST /citation-votes ───────────────────────────────────────────────
    if (path === '/citation-votes' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { page_id, cite_id, vote } = body || {};
      if (!page_id || !cite_id || !['up', 'down'].includes(vote)) {
        return err('page_id, cite_id, and vote (up|down) required');
      }
      const id = crypto.randomUUID();
      try {
        await env.DB.prepare(
          'INSERT INTO citation_votes (id, page_id, cite_id, vote) VALUES (?, ?, ?, ?)'
        ).bind(id, page_id, String(cite_id), vote).run();
        const row = await env.DB.prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN vote='up'   THEN 1 ELSE 0 END),0) -
             COALESCE(SUM(CASE WHEN vote='down' THEN 1 ELSE 0 END),0) AS score
           FROM citation_votes
           WHERE page_id = ? AND cite_id = ?`
        ).bind(page_id, String(cite_id)).first();
        return json({ id, score: row ? (row.score || 0) : 0 }, 201);
      } catch {
        return err('Failed to record citation vote', 500);
      }
    }

    // ── GET /feed?limit= ──────────────────────────────────────────────────
    if (path === '/feed' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '5', 10), 20);
      try {
        // Blend recent comments and page likes into a unified activity feed
        const commentRows = await env.DB.prepare(
          `SELECT 'comment' AS type, name, page_id, created_at FROM comments
           WHERE approved = 1 ORDER BY created_at DESC LIMIT ?`
        ).bind(limit).all();
        const likeRows = await env.DB.prepare(
          `SELECT 'like' AS type, '' AS name, page_id, created_at FROM page_likes
           ORDER BY created_at DESC LIMIT ?`
        ).bind(limit).all();

        const combined = [
          ...(commentRows.results || []),
          ...(likeRows.results || []),
        ].sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        ).slice(0, limit);

        const items = combined.map(r => ({
          icon:     r.type === 'comment' ? '💬' : '❤️',
          text:     r.type === 'comment'
            ? `${r.name || 'Someone'} commented on ${r.page_id}`
            : `Someone liked ${r.page_id}`,
          time_ago: timeAgo(r.created_at),
        }));
        return json({ items });
      } catch {
        return err('Failed to load feed', 500);
      }
    }

    // ── GET /leaderboard?limit= ────────────────────────────────────────────
    // Ranks commenters by number of approved comments (engagement leaderboard).
    if (path === '/leaderboard' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);
      try {
        const rows = await env.DB.prepare(
          `SELECT name, email_hash, COUNT(*) AS score
           FROM comments
           WHERE approved = 1
           GROUP BY LOWER(name)
           ORDER BY score DESC
           LIMIT ?`
        ).bind(limit).all();
        const entries = (rows.results || []).map(r => ({
          name:       r.name,
          email_hash: r.email_hash || '',
          score:      r.score || 0,
        }));
        return json({ entries });
      } catch {
        return err('Failed to load leaderboard', 500);
      }
    }

    // ── GET /activity/hot?limit= ───────────────────────────────────────────
    // Returns pages with most recent engagement (comments + likes combined).
    if (path === '/activity/hot' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '5', 10), 20);
      try {
        const commentActivity = await env.DB.prepare(
          `SELECT page_id, COUNT(*) AS cnt, MAX(created_at) AS last_at
           FROM comments WHERE approved = 1
           GROUP BY page_id`
        ).all();
        const likeActivity = await env.DB.prepare(
          `SELECT page_id, COUNT(*) AS cnt, MAX(created_at) AS last_at
           FROM page_likes
           GROUP BY page_id`
        ).all();

        // Merge: sum counts per page_id
        const pageMap = {};
        for (const r of [...(commentActivity.results || []), ...(likeActivity.results || [])]) {
          if (!pageMap[r.page_id]) {
            pageMap[r.page_id] = { views: 0, last_at: r.last_at };
          }
          pageMap[r.page_id].views += r.cnt || 0;
          if (new Date(r.last_at) > new Date(pageMap[r.page_id].last_at)) {
            pageMap[r.page_id].last_at = r.last_at;
          }
        }

        const pages = Object.entries(pageMap)
          .sort((a, b) => b[1].views - a[1].views)
          .slice(0, limit)
          .map(([page_id, data]) => ({
            url:   `/wiki/${page_id}.html`,
            title: page_id.replace(/-/g, ' '),
            icon:  '🔥',
            views: data.views,
          }));
        return json({ pages });
      } catch {
        return err('Failed to load activity', 500);
      }
    }

    // ── POST /telegram/auth ────────────────────────────────────────────────
    // Accepts the Telegram Login Widget payload, verifies the HMAC signature,
    // and returns a normalised identity object (never exposes the bot token).
    if (path === '/telegram/auth' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { id, first_name, last_name, username, photo_url, auth_date, hash } = body || {};

      if (!id || !auth_date || !hash) {
        return err('Missing required Telegram auth fields');
      }

      // Reject stale payloads (older than TELEGRAM_AUTH_MAX_AGE)
      const now = Math.floor(Date.now() / 1000);
      if (now - parseInt(auth_date, 10) > TELEGRAM_AUTH_MAX_AGE) {
        return err('Telegram auth data has expired', 401);
      }

      // Verify HMAC signature using the secret bot token
      const valid = await verifyTelegramAuth(
        { id, first_name, last_name, username, photo_url, auth_date, hash },
        env.TELEGRAM_BOT_TOKEN,
      );
      if (!valid) {
        return err('Telegram auth verification failed', 401);
      }

      // Build normalised identity — safe to return to the frontend
      const displayName = [first_name, last_name].filter(Boolean).join(' ') || username || String(id);
      return json({
        ok: true,
        identity: {
          telegram_id:       String(id),
          telegram_username: username   || null,
          display_name:      displayName,
          avatar_url:        photo_url  || null,
        },
      });
    }

    // ── POST /telegram/webhook ─────────────────────────────────────────────
    // Endpoint for Telegram Bot API webhook delivery.
    // Consumes the update body and returns 200 OK so Telegram stops retrying.
    if (path === '/telegram/webhook' && request.method === 'POST') {
      const update = await request.json().catch(() => null);

      if (update?.message?.text === '/start') {
        const chatId = update.message.chat.id;

        await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: 'Welcome to WIKICOMS 🚀',
          }),
        });
      }

      return json({ ok: true });
    }

    return err('Not found', 404);
  },
};
