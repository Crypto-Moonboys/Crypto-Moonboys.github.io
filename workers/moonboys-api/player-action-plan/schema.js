export const ACTION_PLAN_SCHEMA_VERSION = 1;

export const ACTION_PLAN_TASK_STATUSES = Object.freeze([
  'ready', 'active', 'in_progress', 'waiting', 'blocked', 'complete',
  'claim_ready', 'claimed', 'expired', 'sync_unavailable', 'preview',
]);

export const ACTION_PLAN_SOURCE_STATES = Object.freeze([
  'live', 'live_empty', 'preview', 'migration_pending', 'query_failed', 'unavailable',
]);

export const ACTION_PLAN_EVIDENCE_KINDS = Object.freeze([
  'server_receipt', 'server_projection', 'client_mirror', 'schedule_preview', 'advisory',
]);

const STATUS_SET = new Set(ACTION_PLAN_TASK_STATUSES);
const SOURCE_STATE_SET = new Set(ACTION_PLAN_SOURCE_STATES);
const EVIDENCE_SET = new Set(ACTION_PLAN_EVIDENCE_KINDS);
const PERIOD_SET = new Set([
  'once', 'utc_day', 'faction_week', 'faction_season', 'pet_day',
  'pet_journey_week', 'event_window', 'saved_timer', 'saved_claim',
  'run_session', 'saved_session', 'source_defined', 'utc_competition',
  'cooldown', 'pet_age', 'history', 'permanent', 'season_lock',
]);

const safeText = (value, maximum = 240) => String(value ?? '').trim().slice(0, maximum);
const finiteInteger = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Math.max(0, Math.floor(Number(value))) : fallback;

export function isoOrNull(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/u.test(raw)
    ? `${raw.replace(' ', 'T')}Z` : raw;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function utcDay(date = new Date()) {
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) throw new Error('player_action_plan_invalid_time');
  return parsed.toISOString().slice(0, 10);
}

export function nextUtcDay(date = new Date()) {
  const parsed = new Date(date);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate() + 1)).toISOString();
}

export function isoWeek(date = new Date()) {
  const parsed = new Date(date);
  const day = parsed.getUTCDay() || 7;
  const thursday = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate() + 4 - day));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((thursday - yearStart) / 86_400_000) + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function nextIsoWeek(date = new Date()) {
  const parsed = new Date(date);
  const day = parsed.getUTCDay() || 7;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate() + (8 - day))).toISOString();
}

export function sourceStatus(state, detail = {}) {
  const normalized = SOURCE_STATE_SET.has(state) ? state : 'unavailable';
  return { state: normalized, ...detail };
}

export function reward(items = [], confirmed = true) {
  const normalized = Array.isArray(items) ? items : [];
  return {
    confirmed: Boolean(confirmed),
    items: normalized.map((item) => ({
      type: safeText(item?.type || item?.kind, 64),
      amount: item?.amount == null ? null : finiteInteger(item.amount),
      unit: safeText(item?.unit || item?.type || item?.kind, 64),
      verification: safeText(item?.verification || (confirmed ? 'source_defined' : 'unconfirmed'), 64),
    })).filter((item) => item.type),
  };
}

export function cost(items = []) {
  const normalized = Array.isArray(items) ? items : [];
  return {
    items: normalized.map((item) => ({
      type: safeText(item?.type || item?.kind, 64),
      amount: finiteInteger(item?.amount),
      unit: safeText(item?.unit || item?.type || item?.kind, 64),
    })).filter((item) => item.type && item.amount > 0),
  };
}

export function actionPlanTask(input) {
  const sourceKey = safeText(input.source_key, 100);
  const status = STATUS_SET.has(input.status) ? input.status : 'sync_unavailable';
  const evidenceKind = EVIDENCE_SET.has(input.evidence?.kind) ? input.evidence.kind : 'advisory';
  const periodKind = PERIOD_SET.has(input.period?.kind) ? input.period.kind : 'source_defined';
  const expiresAt = isoOrNull(input.expires_at ?? input.deadline);
  const nextReadyAt = isoOrNull(input.next_ready_at ?? input.next_available);
  const sourceHealth = SOURCE_STATE_SET.has(input.source_health) ? input.source_health : 'unavailable';
  const progressTarget = input.progress?.target == null ? null : finiteInteger(input.progress.target);
  const progressCurrent = input.progress?.current == null ? null : finiteInteger(input.progress.current);
  const taskId = safeText(input.task_id, 220);
  if (!taskId || !sourceKey || !safeText(input.title, 120)) throw new Error('player_action_plan_task_invalid');

  return Object.freeze({
    task_id: taskId,
    source_key: sourceKey,
    source: safeText(input.source || sourceKey.split('.')[0], 64),
    owner_scope: safeText(input.owner_scope || 'account', 32),
    scope_ref: input.scope_ref ? safeText(input.scope_ref, 80) : null,
    source_pet_ref: input.source_pet_ref ? safeText(input.source_pet_ref, 80) : null,
    title: safeText(input.title, 120),
    description: safeText(input.description || input.what, 320),
    what: safeText(input.what || input.description, 320),
    why: safeText(input.why, 320),
    category: safeText(input.category || 'other', 40),
    optional: Boolean(input.optional),
    priority: finiteInteger(input.priority, 999),
    progress: {
      current: progressCurrent,
      target: progressTarget,
      unit: safeText(input.progress?.unit || 'actions', 48),
    },
    status,
    availability: status,
    blocking_reason_code: input.blocking_reason_code ? safeText(input.blocking_reason_code, 100) : null,
    period: {
      kind: periodKind,
      key: input.period?.key == null ? null : safeText(input.period.key, 100),
      origin_timezone: safeText(input.period?.origin_timezone || 'UTC', 64),
    },
    available_at: isoOrNull(input.available_at),
    expires_at: expiresAt,
    deadline: expiresAt,
    next_ready_at: nextReadyAt,
    next_available: nextReadyAt,
    reward: input.reward || reward([], false),
    cost: input.cost || cost([]),
    destination: {
      kind: safeText(input.destination?.kind || 'web', 48),
      path: safeText(input.destination?.path || '/', 180),
      screen: input.destination?.screen ? safeText(input.destination.screen, 80) : null,
      focus: input.destination?.focus ? safeText(input.destination.focus, 80) : null,
    },
    evidence: {
      kind: evidenceKind,
      verified_completion: evidenceKind === 'server_receipt' && input.evidence?.verified_completion === true,
      source_event_ref: input.evidence?.source_event_ref ? safeText(input.evidence.source_event_ref, 100) : null,
      accepted_at: isoOrNull(input.evidence?.accepted_at),
    },
    source_health: sourceHealth,
    counts_for: [...new Set((input.counts_for || []).map((entry) => safeText(entry, 100)).filter(Boolean))].slice(0, 20),
    read_at: isoOrNull(input.read_at) || new Date().toISOString(),
  });
}

function deadlineScore(task, nowMs) {
  const expiry = Date.parse(task.expires_at || '');
  if (!Number.isFinite(expiry)) return 86_400_000 * 365;
  return Math.max(0, expiry - nowMs);
}

export function rankActionPlanTasks(tasks, now = new Date()) {
  const nowMs = new Date(now).getTime();
  const statusRank = { claim_ready: 0, active: 1, ready: 2, in_progress: 3, waiting: 4, complete: 6, claimed: 7, blocked: 8, expired: 9, sync_unavailable: 10, preview: 11 };
  return [...tasks].sort((left, right) =>
    left.priority - right.priority ||
    (statusRank[left.status] ?? 99) - (statusRank[right.status] ?? 99) ||
    deadlineScore(left, nowMs) - deadlineScore(right, nowMs) ||
    left.task_id.localeCompare(right.task_id));
}

export function isImmediateAction(task) {
  if (!task || task.optional && task.category === 'cosmetic') return false;
  if (!['ready', 'claim_ready', 'active'].includes(task.status)) return false;
  if (!['server_receipt', 'server_projection'].includes(task.evidence?.kind)) return false;
  // A verified empty receipt read can prove an onboarding/check-in action remains.
  const validEmptyOpportunity = task.source_health === 'live_empty' &&
    ['telegram.daily-claim', 'onboarding.faction'].includes(task.source_key);
  return !task.blocking_reason_code && (task.source_health === 'live' || validEmptyOpportunity);
}

export function summarizeActionPlan(tasks, sourceStatuses) {
  const count = (statuses) => tasks.filter((task) => statuses.includes(task.status)).length;
  return {
    eligible_today: tasks.filter((task) => task.period.kind === 'utc_day' && !['blocked', 'preview', 'sync_unavailable'].includes(task.status)).length,
    completed_today: tasks.filter((task) => task.period.kind === 'utc_day' && ['complete', 'claimed'].includes(task.status)).length,
    claims_ready: count(['claim_ready']),
    ready_count: count(['ready']),
    active_count: count(['active']),
    urgent: tasks.filter((task) => task.priority < 300 && isImmediateAction(task)).length,
    completed_count: count(['complete', 'claimed']),
    available_count: tasks.filter((task) => !['blocked', 'expired', 'sync_unavailable', 'preview'].includes(task.status)).length,
    unavailable_sources: Object.values(sourceStatuses).filter((status) => ['migration_pending', 'query_failed', 'unavailable'].includes(status?.state)).length,
  };
}

function decodeCursor(cursor) {
  if (!cursor) return 0;
  const match = String(cursor).match(/^pap1-(\d{1,4})$/u);
  if (!match) throw new Error('player_action_plan_cursor_invalid');
  return Math.min(1000, Number(match[1]));
}

export function paginateActionPlan(tasks, cursor, requestedLimit) {
  const offset = decodeCursor(cursor);
  const limit = Math.max(1, Math.min(100, Math.floor(Number(requestedLimit) || 50)));
  const page = tasks.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    tasks: page,
    pagination: {
      limit,
      returned: page.length,
      total: tasks.length,
      next_cursor: nextOffset < tasks.length ? `pap1-${nextOffset}` : null,
    },
  };
}
