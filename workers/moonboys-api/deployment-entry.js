import baseWorker from './worker-phase5-final.js';
import { withDeploymentProvenance } from '../shared/deployment-provenance.js';
import { checkTelegramGroupMember } from './telegram-group-membership.js';
import { verifyTelegramWebhookSecret } from './telegram-webhook-auth.js';
import { handleSupportRequest, handleSupportUpdate } from './telegram/support-cases.js';

async function supportMember(env, id) {
  const membership = await checkTelegramGroupMember(env, id);
  return { ok: membership.ok && membership.member === true, status: membership.ok ? 403 : 503 };
}

export default withDeploymentProvenance({
  ...baseWorker,
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/internal/doctor-support') return await handleSupportRequest(request, env);
      if (env.SUPPORT_CASES_ENABLED === 'true' && path === '/telegram/webhook' && request.method === 'POST') {
        const verification = await verifyTelegramWebhookSecret(request, env);
        if (verification.ok) {
          const update = await request.clone().json().catch(() => null);
          if (update && await handleSupportUpdate(update, env, id => supportMember(env, id))) {
            return Response.json({ ok: true });
          }
        }
      }
    } catch {
      return Response.json({ error: 'support_unavailable' }, { status: 503 });
    }
    return baseWorker.fetch(request, env, ctx);
  }
}, 'moonboys-api');
