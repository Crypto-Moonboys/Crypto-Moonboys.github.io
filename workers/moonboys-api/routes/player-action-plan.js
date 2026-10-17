import { createReadOnlyActionPlanDb } from '../player-action-plan/read-only-db.js';
import {
  ACTION_PLAN_SCHEMA_VERSION, isImmediateAction, paginateActionPlan,
  rankActionPlanTasks, summarizeActionPlan,
} from '../player-action-plan/schema.js';
import { ACTION_PLAN_SOURCE_REGISTRY, buildPlayerActionPlanSources } from '../player-action-plan/sources.js';

// Caller-selected owner/pet/scope is never an authority for this endpoint.
// Normalise camelCase and reject selector aliases before authentication.
const OWNER_SELECTOR = /^(?:(?:selected|source|original|active)_)?(?:telegram|owner|pet|scope|user)(?:_(?:id|ref|key))?$/u;
function isForbiddenOwnerSelector(field) {
  const normalized = String(field).replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/[- ]/gu, '_').toLowerCase();
  return OWNER_SELECTOR.test(normalized);
}

// The only credential-bearing subtree is the top-level telegram_auth value.
// Check all other nested objects/arrays for caller-controlled selectors; cap
// depth to fail closed on excessively nested request structures.
function containsForbiddenSelector(value, depth = 0) {
  if (!value || typeof value !== 'object') return false;
  if (depth > 12) return true;
  return Object.entries(value).some(([field, nested]) =>
    isForbiddenOwnerSelector(field) || containsForbiddenSelector(nested, depth + 1));
}

// Adapt just the website credential verifier's D1 first() call to the same
// read-only SQL gate, statement counter and absolute deadline as projection.
// No run(), batch(), or unrestricted database access is exposed to auth.
function boundedAuthDb(readDb) {
  return Object.freeze({
    prepare(sql) {
      return Object.freeze({
        bind(...params) {
          return Object.freeze({ first: () => readDb.first(sql, params) });
        },
      });
    },
  });
}

function withPrivateHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, private');
  headers.set('Pragma', 'no-cache');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function errorResponse(options, message, status) {
  return withPrivateHeaders(options.err(message, status));
}

export async function handlePlayerActionPlanRoute(request, env, options = {}) {
  if (new URL(request.url).pathname.replace(/\/$/u, '') !== '/player/action-plan') return null;
  if (request.method !== 'POST') {
    const response = errorResponse(options, 'Method not allowed', 405);
    response.headers.set('Allow', 'POST');
    return response;
  }

  const preAuthLimit = await options.enforceRateLimit?.(request, env, '/player/action-plan:preauth', null, {
    includeIp: true, includeTelegram: false, ipLimit: 30,
  });
  if (preAuthLimit) return withPrivateHeaders(preAuthLimit);

  let body;
  try { body = await request.json(); }
  catch { return errorResponse(options, 'Invalid JSON', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse(options, 'JSON object required', 400);
  if (Object.entries(body).some(([field, value]) => isForbiddenOwnerSelector(field)
    || field !== 'telegram_auth' && containsForbiddenSelector(value))) {
    return errorResponse(options, 'Owner and pet selectors are derived from verified identity', 400);
  }
  if (body.view != null && !['summary', 'tasks', 'all', 'actionable', 'history'].includes(String(body.view))) {
    return errorResponse(options, 'view must be summary, tasks, all, actionable, or history', 400);
  }
  if (body.limit != null && (!Number.isInteger(Number(body.limit)) || Number(body.limit) < 1 || Number(body.limit) > 100)) {
    return errorResponse(options, 'limit must be an integer from 1 to 100', 400);
  }

  // Allocate the query and timeout budget before website-session
  // authentication. Its one D1 lookup and all owner-scoped projections now
  // consume the same read-only budget and wall-clock deadline.
  const readDb = createReadOnlyActionPlanDb(env.DB, {
    maxStatements: 80,
    statementTimeoutMs: options.statementTimeoutMs || 1500,
    projectionTimeoutMs: options.projectionTimeoutMs || 5000,
  });
  let verified;
  try {
    verified = await options.verifyIdentity(body, { ...env, DB: boundedAuthDb(readDb) });
  } catch (error) {
    options.logApiFailure?.('player_action_plan_auth_read_failed', {
      error_code: error?.message || 'authentication_read_failed',
      query_count: readDb.stats().statement_count,
    });
    return errorResponse(options, 'Player action plan authentication temporarily unavailable', 503);
  }
  if (!verified || verified.error) return errorResponse(options, verified?.error || 'Authentication failed', verified?.status || 401);
  const ownerId = String(verified.telegramId);
  const ownerLimit = await options.enforceRateLimit?.(request, env, '/player/action-plan', null, {
    includeIp: false, telegramId: ownerId, telegramLimit: 20,
  });
  if (ownerLimit) return withPrivateHeaders(ownerLimit);

  const now = options.now ? new Date(options.now) : new Date();
  let projection;
  try {
    projection = await buildPlayerActionPlanSources(readDb, ownerId, { now });
  } catch (error) {
    options.logApiFailure?.('player_action_plan_projection_failed', {
      error_code: error?.message || 'projection_failed',
      query_count: readDb.stats().statement_count,
    });
    return errorResponse(options, 'Player action plan temporarily unavailable', 503);
  }

  const view = ['summary', 'tasks'].includes(String(body.view)) ? 'all' : body.view;
  let ranked = rankActionPlanTasks(projection.tasks, now);
  if (view === 'actionable') ranked = ranked.filter(isImmediateAction);
  if (view === 'history') ranked = ranked.filter((entry) => ['complete', 'claimed', 'expired'].includes(entry.status));
  let page;
  try { page = paginateActionPlan(ranked, body.cursor, body.limit); }
  catch { return errorResponse(options, 'Invalid pagination cursor', 400); }
  const immediate = ranked.filter(isImmediateAction).slice(0, 3);
  const response = options.json({
    ok: true,
    schema_version: ACTION_PLAN_SCHEMA_VERSION,
    generated_at: now.toISOString(),
    owner: { authenticated: true, pet_count: projection.read_context.pet_count },
    period: { utc_day: projection.read_context.utc_day, iso_week: projection.read_context.iso_week },
    summary: summarizeActionPlan(ranked, projection.source_status, now),
    top_actions: immediate,
    tasks: page.tasks,
    pagination: page.pagination,
    source_status: projection.source_status,
    source_coverage: {
      registered: ACTION_PLAN_SOURCE_REGISTRY.length,
      represented: new Set(projection.tasks.map((task) => task.source_key)).size,
    },
    read_only: true,
    query_budget: readDb.stats(),
  });
  return withPrivateHeaders(response);
}
