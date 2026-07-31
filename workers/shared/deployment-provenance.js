const COMMIT_SHA_RE = /^[0-9a-f]{40}$/i;

function normalizeUtcTimestamp(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function readDeploymentProvenance(service, env) {
  const metadata = env?.CF_VERSION_METADATA || null;
  const rawCommit = String(metadata?.tag || '').trim();
  const commit = COMMIT_SHA_RE.test(rawCommit) ? rawCommit.toLowerCase() : null;
  const deployedAt = normalizeUtcTimestamp(metadata?.timestamp);

  return {
    valid: Boolean(commit && deployedAt),
    payload: {
      service,
      commit,
      deployed_at: deployedAt,
      environment: 'production',
    },
  };
}

function provenanceHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Allow': 'GET, HEAD, OPTIONS',
  };
}

function deploymentInfoResponse(request, service, env) {
  const method = String(request.method || 'GET').toUpperCase();
  const headers = provenanceHeaders();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers,
    });
  }

  const { valid, payload } = readDeploymentProvenance(service, env);
  return new Response(method === 'HEAD' ? null : JSON.stringify(payload), {
    status: valid ? 200 : 503,
    headers,
  });
}

export function withDeploymentProvenance(baseWorker, service) {
  if (!baseWorker || typeof baseWorker.fetch !== 'function') {
    throw new TypeError(`${service}: base Worker must expose fetch()`);
  }

  return {
    ...baseWorker,
    async fetch(request, env, ctx) {
      const path = new URL(request.url).pathname.replace(/\/$/, '') || '/';
      if (path === '/deployment-info') {
        return deploymentInfoResponse(request, service, env);
      }
      return baseWorker.fetch(request, env, ctx);
    },
  };
}
