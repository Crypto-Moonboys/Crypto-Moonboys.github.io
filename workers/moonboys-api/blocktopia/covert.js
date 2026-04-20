import { CONTROL_NODES } from '../../../games/block-topia/world/control-grid.js';
import {
  BLOCKTOPIA_COVERT_CREATE_COST,
  BLOCKTOPIA_COVERT_DEPLOY_COST,
  BLOCKTOPIA_COVERT_EXTRACT_COST,
  BLOCKTOPIA_COVERT_GEM_REWARD_CHANCE,
  BLOCKTOPIA_COVERT_MAX_ACTIVE_OPERATIONS,
  BLOCKTOPIA_COVERT_OPERATION_MS,
  BLOCKTOPIA_COVERT_SUCCESS_XP,
  GEMS_MAX,
  GEMS_MIN,
  XP_MAX,
  XP_MIN,
} from './config.js';
import { getOrCreateBlockTopiaProgression } from './db.js';
import { verifyTelegramIdentityFromBody } from './auth.js';
import { clamp } from './math.js';

const AGENT_TYPE = 'infiltrator';
const OPERATION_TYPE = 'infiltrate';
const AGENT_STAT_DEFAULTS = Object.freeze({
  level: 1,
  stealth: 58,
  resilience: 46,
  loyalty: 62,
  heat: 0,
});

const CONTROL_NODE_BY_ID = new Map(CONTROL_NODES.map((node) => [node.id, node]));

function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function normalizeNodeId(rawNodeId) {
  return String(rawNodeId || '').trim().toLowerCase();
}

function serializeMetadata(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
}

function sqliteTimestamp(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

function parseSqliteTimestamp(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const normalized = text.includes('T') ? text : `${text.replace(' ', 'T')}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function publicAgent(row) {
  if (!row) return null;
  return {
    id: row.id,
    agent_type: row.agent_type,
    level: Number(row.level) || 1,
    stealth: Number(row.stealth) || 0,
    resilience: Number(row.resilience) || 0,
    loyalty: Number(row.loyalty) || 0,
    heat: Number(row.heat) || 0,
    status: row.status,
    current_node_id: row.current_node_id || null,
    home_district_id: row.home_district_id || null,
    assigned_operation: row.assigned_operation || null,
    assigned_until: row.assigned_until || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function publicOperation(row) {
  if (!row) return null;
  return {
    id: row.id,
    agent_id: row.agent_id,
    operation_type: row.operation_type,
    target_node_id: row.target_node_id,
    status: row.status,
    success_roll: row.success_roll == null ? null : Number(row.success_roll),
    detection_roll: row.detection_roll == null ? null : Number(row.detection_roll),
    reward_xp: Number(row.reward_xp) || 0,
    reward_gems: Number(row.reward_gems) || 0,
    started_at: row.started_at,
    resolves_at: row.resolves_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    world_effect: buildWorldEffect(row),
  };
}

function buildWorldEffect(operation) {
  if (!operation || operation.status !== 'success') return null;
  const node = CONTROL_NODE_BY_ID.get(operation.target_node_id);
  if (!node) return null;
  const successRoll = Number(operation.success_roll) || 0;
  const districtControlDelta = 1 + (successRoll >= 85 ? 1 : 0);
  const nodeControlDelta = 2 + (successRoll >= 90 ? 1 : 0);
  return {
    source: 'covert_infiltrator',
    node_id: node.id,
    district_id: node.districtId,
    node_control_delta: nodeControlDelta,
    district_control_delta: districtControlDelta,
    faction_pressure_delta: 1,
    sam_pressure_delta: 0,
  };
}

async function logProgressionEvent(db, telegramId, action, actionType, xpChange = 0, gemsChange = 0, metadata = {}) {
  try {
    await db.prepare(`
      INSERT INTO blocktopia_progression_events
        (id, telegram_id, action, action_type, score, xp_change, gems_change, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      telegramId,
      action,
      actionType,
      0,
      xpChange,
      gemsChange,
      serializeMetadata(metadata),
    ).run();
  } catch {
    await db.prepare(`
      INSERT INTO blocktopia_progression_events
        (id, telegram_id, action, action_type, score, xp_change, gems_change)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      telegramId,
      action,
      actionType,
      0,
      xpChange,
      gemsChange,
    ).run();
  }
}

async function readJsonBody(request, err) {
  try {
    return { body: await request.json() };
  } catch {
    return { response: err('Invalid JSON', 400) };
  }
}

async function authenticateCovertRequest(request, env, helpers) {
  const { err, upsertTelegramUser, verifyTelegramAuth } = helpers;
  const parsed = await readJsonBody(request, err);
  if (parsed.response) return parsed;
  const verified = await verifyTelegramIdentityFromBody(parsed.body, env, verifyTelegramAuth);
  if (verified.error) return { response: err(verified.error, verified.status || 401) };
  await upsertTelegramUser(env.DB, verified.user).catch(() => {});
  return { body: parsed.body, verified };
}

async function resolveDueCovertOperations(db, telegramId) {
  const active = await db.prepare(`
    SELECT o.*, a.stealth, a.resilience, a.loyalty, a.heat
    FROM blocktopia_covert_operations o
    JOIN blocktopia_covert_agents a ON a.id = o.agent_id
    WHERE o.telegram_id = ?
      AND o.status = 'active'
      AND o.resolves_at <= CURRENT_TIMESTAMP
    ORDER BY o.resolves_at ASC
    LIMIT 10
  `).bind(telegramId).all().catch(() => ({ results: [] }));

  const resolved = [];
  for (const row of active.results || []) {
    const stealth = clamp(Number(row.stealth) || 0, 1, 100);
    const resilience = clamp(Number(row.resilience) || 0, 1, 100);
    const loyalty = clamp(Number(row.loyalty) || 0, 1, 100);
    const heat = clamp(Number(row.heat) || 0, 0, 100);
    const successRoll = Math.floor(Math.random() * 101);
    const detectionRoll = Math.floor(Math.random() * 101);
    const successTarget = clamp(45 + Math.floor(stealth * 0.35) + Math.floor(loyalty * 0.08) - Math.floor(heat * 0.3), 20, 86);
    const criticalTarget = clamp(78 + Math.floor(resilience * 0.12) - Math.floor(heat * 0.25), 45, 92);

    let status = 'failed';
    let agentStatus = 'idle';
    let heatAfter = clamp(heat + 8, 0, 100);
    let rewardXp = 0;
    let rewardGems = 0;

    if (successRoll <= successTarget && detectionRoll < criticalTarget) {
      status = 'success';
      heatAfter = clamp(Math.max(0, heat - 4), 0, 100);
      rewardXp = BLOCKTOPIA_COVERT_SUCCESS_XP;
      rewardGems = Math.random() < BLOCKTOPIA_COVERT_GEM_REWARD_CHANCE ? 1 : 0;
    } else if (detectionRoll >= criticalTarget) {
      status = 'critical_failure';
      agentStatus = 'captured';
      heatAfter = 100;
    } else if (heatAfter >= 70) {
      agentStatus = 'exposed';
    }

    await db.prepare(`
      UPDATE blocktopia_covert_operations
      SET status = ?, success_roll = ?, detection_roll = ?, reward_xp = ?, reward_gems = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND telegram_id = ? AND status = 'active'
    `).bind(status, successRoll, detectionRoll, rewardXp, rewardGems, row.id, telegramId).run();

    await db.prepare(`
      UPDATE blocktopia_covert_agents
      SET heat = ?, status = ?, current_node_id = CASE WHEN ? = 'captured' THEN current_node_id ELSE NULL END,
          assigned_operation = NULL, assigned_until = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND telegram_id = ?
    `).bind(heatAfter, agentStatus, agentStatus, row.agent_id, telegramId).run();

    if (rewardXp > 0 || rewardGems > 0) {
      await db.prepare(`
        UPDATE blocktopia_progression
        SET xp = MIN(?, xp + ?), gems = MIN(?, gems + ?), updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ?
      `).bind(XP_MAX, rewardXp, GEMS_MAX, rewardGems, telegramId).run();
    }

    const auditAction = status === 'success' ? 'covert_success' : (status === 'critical_failure' ? 'covert_capture' : 'covert_failure');
    await logProgressionEvent(db, telegramId, auditAction, row.target_node_id, rewardXp, rewardGems, {
      operation_id: row.id,
      agent_id: row.agent_id,
      status,
      success_roll: successRoll,
      detection_roll: detectionRoll,
      world_effect: buildWorldEffect({ ...row, status, success_roll: successRoll }),
    });

    resolved.push({ ...row, status, success_roll: successRoll, detection_roll: detectionRoll, reward_xp: rewardXp, reward_gems: rewardGems });
  }
  return resolved;
}

async function loadCovertState(db, telegramId) {
  const [agents, operations, progression] = await Promise.all([
    db.prepare(`
      SELECT * FROM blocktopia_covert_agents
      WHERE telegram_id = ?
      ORDER BY created_at DESC
    `).bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare(`
      SELECT * FROM blocktopia_covert_operations
      WHERE telegram_id = ?
      ORDER BY created_at DESC
      LIMIT 25
    `).bind(telegramId).all().catch(() => ({ results: [] })),
    getOrCreateBlockTopiaProgression(db, telegramId),
  ]);
  return {
    agents: (agents.results || []).map(publicAgent),
    operations: (operations.results || []).map(publicOperation),
    progression: {
      telegram_id: telegramId,
      xp: clamp(Number(progression?.xp) || 0, XP_MIN, XP_MAX),
      gems: clamp(Number(progression?.gems) || 0, GEMS_MIN, GEMS_MAX),
      tier: Number(progression?.tier) || 1,
    },
  };
}

export async function handleBlockTopiaCovertRoute(request, env, url, helpers) {
  const { path, json, err } = helpers;
  if (!path.startsWith('/blocktopia/covert')) return null;

  if (path === '/blocktopia/covert/state' && request.method === 'GET') {
    const rawAuth = url.searchParams.get('telegram_auth');
    if (!rawAuth) return err('verified telegram_auth payload required', 401);
    let body;
    try {
      body = { telegram_auth: JSON.parse(rawAuth) };
    } catch {
      return err('Invalid telegram_auth payload', 400);
    }
    const verified = await verifyTelegramIdentityFromBody(body, env, helpers.verifyTelegramAuth);
    if (verified.error) return err(verified.error, verified.status || 401);
    await helpers.upsertTelegramUser(env.DB, verified.user).catch(() => {});
    const resolved = await resolveDueCovertOperations(env.DB, verified.telegramId);
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, costs: covertCosts(), resolved: resolved.map(publicOperation), ...state });
  }

  if (request.method !== 'POST') return err('Method not allowed', 405);
  const auth = await authenticateCovertRequest(request, env, helpers);
  if (auth.response) return auth.response;
  const { body, verified } = auth;
  await resolveDueCovertOperations(env.DB, verified.telegramId);

  if (path === '/blocktopia/covert/create') {
    const row = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
    const gems = clamp(Math.floor(Number(row.gems) || 0), GEMS_MIN, GEMS_MAX);
    if (gems < BLOCKTOPIA_COVERT_CREATE_COST) return err('Not enough gems to create infiltrator', 402);
    const agentId = crypto.randomUUID();
    const updateResult = await env.DB.prepare(`
      UPDATE blocktopia_progression
      SET gems = gems - ?, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND gems >= ?
    `).bind(BLOCKTOPIA_COVERT_CREATE_COST, verified.telegramId, BLOCKTOPIA_COVERT_CREATE_COST).run();
    if (changedRows(updateResult) !== 1) return err('Progression changed. Please retry covert create.', 409);
    await env.DB.prepare(`
      INSERT INTO blocktopia_covert_agents
        (id, telegram_id, agent_type, level, stealth, resilience, loyalty, heat, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle')
    `).bind(
      agentId,
      verified.telegramId,
      AGENT_TYPE,
      AGENT_STAT_DEFAULTS.level,
      AGENT_STAT_DEFAULTS.stealth,
      AGENT_STAT_DEFAULTS.resilience,
      AGENT_STAT_DEFAULTS.loyalty,
      AGENT_STAT_DEFAULTS.heat,
    ).run();
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_create', AGENT_TYPE, 0, -BLOCKTOPIA_COVERT_CREATE_COST, { agent_id: agentId });
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: BLOCKTOPIA_COVERT_CREATE_COST, ...state });
  }

  if (path === '/blocktopia/covert/deploy') {
    const agentId = String(body?.agent_id || body?.agentId || '').trim();
    const nodeId = normalizeNodeId(body?.target_node_id || body?.targetNodeId || body?.node_id || body?.nodeId);
    const node = CONTROL_NODE_BY_ID.get(nodeId);
    if (!agentId) return err('agent_id required', 400);
    if (!node) return err('Invalid target node ID', 400);

    const agent = await env.DB.prepare(`
      SELECT * FROM blocktopia_covert_agents
      WHERE id = ? AND telegram_id = ?
      LIMIT 1
    `).bind(agentId, verified.telegramId).first();
    if (!agent) return err('Agent not found', 404);
    if (agent.status !== 'idle' && agent.status !== 'exposed') return err('Agent cannot be deployed from current status', 409);
    if (agent.assigned_operation) return err('Agent already has an assigned operation', 409);

    const activeCount = await env.DB.prepare(`
      SELECT COUNT(*) AS n FROM blocktopia_covert_operations
      WHERE telegram_id = ? AND status = 'active'
    `).bind(verified.telegramId).first().catch(() => ({ n: 0 }));
    if (Number(activeCount?.n || 0) >= BLOCKTOPIA_COVERT_MAX_ACTIVE_OPERATIONS) {
      return err('Active covert operation limit reached', 429);
    }

    const progression = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
    const gems = clamp(Math.floor(Number(progression.gems) || 0), GEMS_MIN, GEMS_MAX);
    if (gems < BLOCKTOPIA_COVERT_DEPLOY_COST) return err('Not enough gems to deploy infiltrator', 402);

    const operationId = crypto.randomUUID();
    const resolvesAt = sqliteTimestamp(Date.now() + BLOCKTOPIA_COVERT_OPERATION_MS);
    const updateResult = await env.DB.prepare(`
      UPDATE blocktopia_progression
      SET gems = gems - ?, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND gems >= ?
    `).bind(BLOCKTOPIA_COVERT_DEPLOY_COST, verified.telegramId, BLOCKTOPIA_COVERT_DEPLOY_COST).run();
    if (changedRows(updateResult) !== 1) return err('Progression changed. Please retry covert deploy.', 409);

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO blocktopia_covert_operations
          (id, telegram_id, agent_id, operation_type, target_node_id, status, reward_xp, reward_gems, started_at, resolves_at)
        VALUES (?, ?, ?, ?, ?, 'active', 0, 0, CURRENT_TIMESTAMP, ?)
      `).bind(operationId, verified.telegramId, agentId, OPERATION_TYPE, node.id, resolvesAt),
      env.DB.prepare(`
        UPDATE blocktopia_covert_agents
        SET status = 'active', current_node_id = ?, home_district_id = COALESCE(home_district_id, ?),
            assigned_operation = ?, assigned_until = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_id = ? AND status IN ('idle', 'exposed')
      `).bind(node.id, node.districtId, operationId, resolvesAt, agentId, verified.telegramId),
    ]);
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_deploy', node.id, 0, -BLOCKTOPIA_COVERT_DEPLOY_COST, { agent_id: agentId, operation_id: operationId });
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: BLOCKTOPIA_COVERT_DEPLOY_COST, operation_id: operationId, resolves_at: resolvesAt, ...state });
  }

  if (path === '/blocktopia/covert/extract') {
    const agentId = String(body?.agent_id || body?.agentId || '').trim();
    if (!agentId) return err('agent_id required', 400);
    const agent = await env.DB.prepare(`
      SELECT * FROM blocktopia_covert_agents
      WHERE id = ? AND telegram_id = ?
      LIMIT 1
    `).bind(agentId, verified.telegramId).first();
    if (!agent) return err('Agent not found', 404);
    if (agent.status !== 'active' || !agent.assigned_operation) return err('Agent is not on an active operation', 409);
    const operation = await env.DB.prepare(`
      SELECT * FROM blocktopia_covert_operations
      WHERE id = ? AND telegram_id = ? AND agent_id = ? AND status = 'active'
      LIMIT 1
    `).bind(agent.assigned_operation, verified.telegramId, agentId).first();
    if (!operation) return err('Active operation not found', 404);

    const midOperation = parseSqliteTimestamp(operation.resolves_at) > Date.now();
    if (midOperation) {
      const progression = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
      const gems = clamp(Math.floor(Number(progression.gems) || 0), GEMS_MIN, GEMS_MAX);
      if (gems < BLOCKTOPIA_COVERT_EXTRACT_COST) return err('Not enough gems to extract infiltrator', 402);
      const updateResult = await env.DB.prepare(`
        UPDATE blocktopia_progression
        SET gems = gems - ?, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ? AND gems >= ?
      `).bind(BLOCKTOPIA_COVERT_EXTRACT_COST, verified.telegramId, BLOCKTOPIA_COVERT_EXTRACT_COST).run();
      if (changedRows(updateResult) !== 1) return err('Progression changed. Please retry covert extract.', 409);
    }

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE blocktopia_covert_operations
        SET status = 'failed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_id = ? AND status = 'active'
      `).bind(operation.id, verified.telegramId),
      env.DB.prepare(`
        UPDATE blocktopia_covert_agents
        SET status = 'idle', current_node_id = NULL, assigned_operation = NULL,
            assigned_until = NULL, heat = MIN(100, heat + 3), updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_id = ?
      `).bind(agentId, verified.telegramId),
    ]);
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_extract', operation.target_node_id, 0, midOperation ? -BLOCKTOPIA_COVERT_EXTRACT_COST : 0, {
      agent_id: agentId,
      operation_id: operation.id,
      mid_operation: midOperation,
    });
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: midOperation ? BLOCKTOPIA_COVERT_EXTRACT_COST : 0, ...state });
  }

  return err('Not found', 404);
}

function covertCosts() {
  return {
    create: BLOCKTOPIA_COVERT_CREATE_COST,
    deploy: BLOCKTOPIA_COVERT_DEPLOY_COST,
    extract: BLOCKTOPIA_COVERT_EXTRACT_COST,
    operation_ms: BLOCKTOPIA_COVERT_OPERATION_MS,
  };
}
