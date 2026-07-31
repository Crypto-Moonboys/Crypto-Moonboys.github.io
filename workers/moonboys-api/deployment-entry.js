import baseWorker from './worker-phase5-final.js';
import { withDeploymentProvenance } from '../shared/deployment-provenance.js';

async function enrichDailyLoopMissedXp(response, env, requestUrl) {
  if (!response || !response.ok || requestUrl.pathname !== '/daily-loop/state' || !env?.DB) {
    return response;
  }

  const fallback = response.clone();

  try {
    const payload = await response.json();
    const telegramId = String(payload?.identity?.telegram_id || '').trim();
    const missed = payload?.missed_opportunities;

    if (!/^\d{1,20}$/.test(telegramId) || !missed || missed.linked !== true) {
      return fallback;
    }

    const row = await env.DB.prepare(`
      SELECT COALESCE(SUM(missed_xp_value), 0) AS xp_total_all_time
      FROM daily_missed_perks
      WHERE telegram_id = ?
    `).bind(telegramId).first();

    missed.xp_total_all_time = Math.max(0, Math.floor(Number(row?.xp_total_all_time) || 0));

    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json');
    headers.delete('Content-Length');

    return new Response(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (_) {
    return fallback;
  }
}

const moonboysApiWorker = {
  async fetch(request, env, context) {
    const response = await baseWorker.fetch(request, env, context);
    return enrichDailyLoopMissedXp(response, env, new URL(request.url));
  },

  scheduled(controller, env, context) {
    return baseWorker.scheduled?.(controller, env, context);
  },
};

export { enrichDailyLoopMissedXp };
export default withDeploymentProvenance(moonboysApiWorker, 'moonboys-api');
