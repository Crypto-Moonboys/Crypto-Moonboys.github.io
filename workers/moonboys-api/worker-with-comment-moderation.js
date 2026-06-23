import worker from './worker.js';

const DEFAULT_SWARMSY_MODERATION_URL = 'https://swarmsy.cryptomoonboys.com/api/swarmsy/internal/moderate-comment';
const WIKI_COMMENT_MODERATION_TIMEOUT_MS = 5000;
const WIKI_COMMENT_MODERATION_DECISIONS = new Set(['approved', 'rejected', 'pending']);

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...Object.fromEntries(headers || []),
      'Content-Type': 'application/json',
    },
  });
}

function clampText(value, max = 120) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizeModerationDecision(value) {
  const decision = String(value || '').trim().toLowerCase();
  return WIKI_COMMENT_MODERATION_DECISIONS.has(decision) ? decision : 'pending';
}

function extractTelegramId(body) {
  const auth = body && typeof body === 'object' ? body.telegram_auth : null;
  const id = auth && typeof auth === 'object' ? auth.id : null;
  return id == null ? null : String(id).trim().slice(0, 30);
}

async function callSwarmsyCommentModeration(env, comment) {
  const bridgeToken = String(env?.SWARMSY_BRIDGE_TOKEN || '').trim();
  const moderationUrl = String(env?.SWARMSY_MODERATION_URL || DEFAULT_SWARMSY_MODERATION_URL).trim();
  if (!bridgeToken || !moderationUrl) {
    return {
      decision: 'pending',
      source: 'unavailable',
      reason: bridgeToken ? 'moderation_url_missing' : 'bridge_token_missing',
    };
  }

  const timeoutMs = Math.max(
    1000,
    Math.min(Number(env?.SWARMSY_MODERATION_TIMEOUT_MS) || WIKI_COMMENT_MODERATION_TIMEOUT_MS, 10000),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(moderationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SWARMSY-BRIDGE-TOKEN': bridgeToken,
      },
      body: JSON.stringify({
        type: 'wiki_comment_moderation',
        site: 'cryptomoonboys.com',
        page_id: comment.pageId,
        comment_id: comment.commentId,
        name: comment.name,
        text: comment.text,
        telegram_id: comment.telegramId,
        telegram_username: comment.telegramUsername,
        discord_username: comment.discordUsername,
      }),
      signal: controller.signal,
    });

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || !payload || typeof payload !== 'object') {
      return {
        decision: 'pending',
        source: 'swarmsy',
        reason: `upstream_${response.status || 'invalid'}`,
      };
    }

    return {
      decision: normalizeModerationDecision(payload.decision || payload.status || payload.moderation),
      source: 'swarmsy',
      reason: clampText(payload.reason || 'swarmsy_decision', 160),
      confidence: Number.isFinite(Number(payload.confidence)) ? Number(payload.confidence) : null,
    };
  } catch (error) {
    return {
      decision: 'pending',
      source: 'swarmsy',
      reason: error?.name === 'AbortError' ? 'timeout' : 'fetch_failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function updateWikiCommentStatus(env, commentId, decision) {
  if (!env?.DB || !commentId || !WIKI_COMMENT_MODERATION_DECISIONS.has(decision)) return false;
  if (decision === 'pending') return true;
  await env.DB.prepare(`UPDATE wiki_comments SET status = ? WHERE id = ?`).bind(decision, commentId).run();
  return true;
}

async function moderateStoredWikiComment(request, env, response) {
  if (response.status !== 201) return response;

  const originalPayload = await response.clone().json().catch(() => null);
  if (!originalPayload?.ok || !originalPayload.comment_id || originalPayload.page_id == null) return response;

  const body = await request.clone().json().catch(() => ({}));
  const moderation = await callSwarmsyCommentModeration(env, {
    pageId: clampText(originalPayload.page_id, 120),
    commentId: clampText(originalPayload.comment_id, 120),
    name: clampText(body?.name, 60),
    text: clampText(body?.text, 1000),
    telegramId: extractTelegramId(body),
    telegramUsername: clampText(body?.telegram_username, 60),
    discordUsername: clampText(body?.discord_username, 60),
  });

  let finalDecision = normalizeModerationDecision(moderation.decision);
  try {
    await updateWikiCommentStatus(env, originalPayload.comment_id, finalDecision);
  } catch {
    finalDecision = 'pending';
  }

  const copy = finalDecision === 'approved'
    ? 'Comment posted.'
    : (finalDecision === 'rejected'
      ? 'Comment could not be published.'
      : 'Comment received and awaiting automated review.');

  return jsonResponse({
    ...originalPayload,
    status: finalDecision,
    moderation: finalDecision,
    moderation_source: moderation.source || 'swarmsy',
    moderation_reason: moderation.reason || null,
    message: copy,
  }, response.status, response.headers);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/comments' && request.method === 'POST') {
      const moderationRequest = request.clone();
      const response = await worker.fetch(request, env, ctx);
      return moderateStoredWikiComment(moderationRequest, env, response);
    }
    return worker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    return worker.scheduled(event, env, ctx);
  },
};
