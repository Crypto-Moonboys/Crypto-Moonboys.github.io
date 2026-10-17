import { createReadOnlyActionPlanDb } from '../player-action-plan/read-only-db.js';
import {
  ACTION_PLAN_SCHEMA_VERSION, isImmediateAction, paginateActionPlan,
  rankActionPlanTasks, summarizeActionPlan,
} from '../player-action-plan/schema.js';
import { ACTION_PLAN_SOURCE_REGISTRY, buildPlayerActionPlanSources } from '../player-action-plan/sources.js';

const FORBIDDEN_OWNER_FIELDS = Object.freeze([
  'telegram_id', 'owner_id', 'pet_id', 'source_pet_id', 'source_pet_ref',
]);

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
  if (FORBIDDEN_OWNER_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
    return errorResponse(options, 'Owner and pet selectors are derived from verified identity', 400);
  }
  if (body.view != null && !['summary', 'tasks', 'all', 'actionable', 'history'].includes(String(body.view))) {
    return errorResponse(options, 'view must be summary, tasks, all, actionable, or history', 400);
  }
  if (body.limit != null && (!Number.isInteger(Number(body.limit)) || Number(body.limit) < 1 || Number(body.limit) > 100)) {
    return errorResponse(options, 'limit must be an integer from 1 to 100', 400);
  }

  const verified = await options.verifyIdentity(body, env);
  if (verified.error) return errorResponse(options, verified.error, verified.status || 401);
  const ownerId = String(verified.telegramId);
  const ownerLimit = await options.enforceRateLimit?.(request, env, '/player/action-plan', null, {
    includeIp: false, telegramId: ownerId, telegramLimit: 20,
  });
  if (ownerLimit) return withPrivateHeaders(ownerLimit);

  const now = options.now ? new Date(options.now) : new Date();
  const readDb = createReadOnlyActionPlanDb(env.DB, {
    maxStatements: 80,
    statementTimeoutMs: options.statementTimeoutMs || 1500,
    projectionTimeoutMs: options.projectionTimeoutMs || 5000,
  });
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
    summary: summarizeActionPlan(ranked, projection.source_status),
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
