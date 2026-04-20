import { CONTROL_NODES } from '../../../games/block-topia/world/control-grid.js';
import {
  BLOCKTOPIA_COVERT_CREATE_COST,
  BLOCKTOPIA_COVERT_DEPLOY_COST,
  BLOCKTOPIA_COVERT_EXTRACT_COST,
  BLOCKTOPIA_COVERT_GEM_REWARD_CHANCE,
  BLOCKTOPIA_COVERT_MAX_ACTIVE_OPERATIONS,
  BLOCKTOPIA_COVERT_OPERATION_MS,
  BLOCKTOPIA_COVERT_RETASK_COST,
  BLOCKTOPIA_COVERT_REVIVE_COST,
  BLOCKTOPIA_COVERT_STEALTH_BOOST_COST,
  BLOCKTOPIA_COVERT_SUCCESS_XP,
  GEMS_MAX,
  GEMS_MIN,
  XP_MAX,
  XP_MIN,
} from './config.js';
import { getOrCreateBlockTopiaProgression } from './db.js';
import { verifyTelegramIdentityFromBody } from './auth.js';
import { clamp } from './math.js';

const AGENT_TYPES = Object.freeze(['infiltrator', 'saboteur', 'recruiter']);
const BOOST_MS = 30 * 60 * 1000;
const HEAT_DECAY_INTERVAL_MS = 6 * 60 * 60 * 1000;

const AGENT_CONFIG = Object.freeze({
  infiltrator: {
    operationType: 'infiltrate',
    createCost: BLOCKTOPIA_COVERT_CREATE_COST,
    deployCost: BLOCKTOPIA_COVERT_DEPLOY_COST,
    stats: { level: 1, stealth: 58, resilience: 46, loyalty: 62, heat: 0 },
    deployHeat: 6,
    extractHeat: 3,
    retaskHeat: 5,
    successHeat: 2,
    failureHeat: 11,
    captureHeat: 35,
    successBase: 45,
    stealthWeight: 0.35,
    loyaltyWeight: 0.08,
    heatPenalty: 0.3,
    exposureBase: 64,
    captureBase: 88,
    typeExposureRisk: 0,
    typeCaptureRisk: 0,
    rewardXp: BLOCKTOPIA_COVERT_SUCCESS_XP,
    world: {
      nodeInterference: 2,
      districtSupport: 0,
      districtPressure: 1,
      factionPressure: 1,
      samPressure: 0,
    },
  },
  saboteur: {
    operationType: 'sabotage',
    createCost: BLOCKTOPIA_COVERT_CREATE_COST + 2,
    deployCost: BLOCKTOPIA_COVERT_DEPLOY_COST + 1,
    stats: { level: 1, stealth: 46, resilience: 42, loyalty: 58, heat: 8 },
    deployHeat: 13,
    extractHeat: 6,
    retaskHeat: 9,
    successHeat: 7,
    failureHeat: 18,
    captureHeat: 45,
    successBase: 41,
    stealthWeight: 0.27,
    loyaltyWeight: 0.07,
    heatPenalty: 0.42,
    exposureBase: 56,
    captureBase: 82,
    typeExposureRisk: 8,
    typeCaptureRisk: 6,
    rewardXp: BLOCKTOPIA_COVERT_SUCCESS_XP + 4,
    world: {
      nodeInterference: 5,
      districtSupport: 0,
      districtPressure: 2,
      factionPressure: 2,
      samPressure: 1,
    },
  },
  recruiter: {
    operationType: 'recruit',
    createCost: BLOCKTOPIA_COVERT_CREATE_COST + 1,
    deployCost: BLOCKTOPIA_COVERT_DEPLOY_COST,
    stats: { level: 1, stealth: 54, resilience: 50, loyalty: 70, heat: 2 },
    deployHeat: 5,
    extractHeat: 2,
    retaskHeat: 4,
    successHeat: 1,
    failureHeat: 8,
    captureHeat: 28,
    successBase: 44,
    stealthWeight: 0.24,
    loyaltyWeight: 0.16,
    heatPenalty: 0.24,
    exposureBase: 68,
    captureBase: 90,
    typeExposureRisk: -3,
    typeCaptureRisk: -2,
    rewardXp: BLOCKTOPIA_COVERT_SUCCESS_XP - 2,
    world: {
      nodeInterference: 0,
      districtSupport: 3,
      districtPressure: -1,
      factionPressure: 1,
      samPressure: 0,
    },
  },
});

const CONTROL_NODE_BY_ID = new Map(CONTROL_NODES.map((node) => [node.id, node]));
const CONTROL_NODE_IDS_BY_DISTRICT = CONTROL_NODES.reduce((map, node) => {
  const existing = map.get(node.districtId) || [];
  existing.push(node.id);
  map.set(node.districtId, existing);
  return map;
}, new Map());

function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function normalizeNodeId(rawNodeId) {
  return String(rawNodeId || '').trim().toLowerCase();
}

function normalizeAgentType(rawAgentType) {
  const type = String(rawAgentType || 'infiltrator').trim().toLowerCase();
  return AGENT_TYPES.includes(type) ? type : null;
}

function configForAgentType(agentType) {
  return AGENT_CONFIG[normalizeAgentType(agentType) || 'infiltrator'];
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

function isBoostActive(agent, nowMs = Date.now()) {
  return parseSqliteTimestamp(agent?.stealth_boost_until) > nowMs;
}

function activeBoostBonus(agent, nowMs = Date.now()) {
  return isBoostActive(agent, nowMs) ? 10 : 0;
}

function publicAgent(row) {
  if (!row) return null;
  return {
    id: row.id,
    agent_type: row.agent_type || 'infiltrator',
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
    stealth_boost_until: row.stealth_boost_until || null,
    recovery_count: Number(row.recovery_count) || 0,
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
    heat_before: Number(row.heat_before) || 0,
    heat_after: Number(row.heat_after) || 0,
    node_interference_delta: Number(row.node_interference_delta) || 0,
    district_support_delta: Number(row.district_support_delta) || 0,
    district_pressure_delta: Number(row.district_pressure_delta) || 0,
    faction_pressure_delta: Number(row.faction_pressure_delta) || 0,
    sam_pressure_delta: Number(row.sam_pressure_delta) || 0,
    local_risk_delta: Number(row.local_risk_delta) || 0,
    started_at: row.started_at,
    resolves_at: row.resolves_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    world_effect: buildWorldEffect(row),
  };
}

function buildWorldEffect(operation) {
  if (!operation || !operation.target_node_id || operation.status === 'active') return null;
  const node = CONTROL_NODE_BY_ID.get(operation.target_node_id);
  if (!node) return null;

  const legacySuccess = operation.status === 'success'
    && Number(operation.node_interference_delta ?? 0) === 0
    && Number(operation.district_support_delta ?? 0) === 0
    && Number(operation.district_pressure_delta ?? 0) === 0;
  const successRoll = Number(operation.success_roll) || 0;
  const fallbackNodeDelta = legacySuccess ? 2 + (successRoll >= 90 ? 1 : 0) : 0;
  const fallbackDistrictDelta = legacySuccess ? 1 + (successRoll >= 85 ? 1 : 0) : 0;

  return {
    source: `covert_${operation.operation_type || 'infiltrate'}`,
    node_id: node.id,
    district_id: node.districtId,
    node_interference_delta: Number(operation.node_interference_delta) || fallbackNodeDelta,
    node_control_delta: Number(operation.node_interference_delta) || fallbackNodeDelta,
    district_support_delta: Number(operation.district_support_delta) || 0,
    district_control_delta: fallbackDistrictDelta,
    district_pressure_delta: Number(operation.district_pressure_delta) || 0,
    faction_pressure_delta: Number(operation.faction_pressure_delta) || (legacySuccess ? 1 : 0),
    sam_pressure_delta: Number(operation.sam_pressure_delta) || 0,
    local_risk_delta: Number(operation.local_risk_delta) || 0,
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

async function applyHeatDecayForUser(db, telegramId, nowMs = Date.now()) {
  const agents = await db.prepare(`
    SELECT id, heat, status, updated_at
    FROM blocktopia_covert_agents
    WHERE telegram_id = ?
      AND heat > 0
      AND status IN ('idle', 'exposed')
  `).bind(telegramId).all().catch(() => ({ results: [] }));

  for (const agent of agents.results || []) {
    const lastUpdated = parseSqliteTimestamp(agent.updated_at);
    const intervals = lastUpdated > 0 ? Math.floor((nowMs - lastUpdated) / HEAT_DECAY_INTERVAL_MS) : 0;
    if (intervals <= 0) continue;
    const decay = intervals * (agent.status === 'exposed' ? 1 : 2);
    const heatAfter = clamp((Number(agent.heat) || 0) - decay, 0, 100);
    const nextStatus = agent.status === 'exposed' && heatAfter < 45 ? 'idle' : agent.status;
    await db.prepare(`
      UPDATE blocktopia_covert_agents
      SET heat = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND telegram_id = ? AND status IN ('idle', 'exposed')
    `).bind(heatAfter, nextStatus, agent.id, telegramId).run();
  }
}

async function recentTargetPressure(db, node) {
  const nodePressure = await db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failure_count,
      SUM(CASE WHEN status = 'critical_failure' THEN 1 ELSE 0 END) AS capture_count
    FROM blocktopia_covert_operations
    WHERE target_node_id = ?
      AND updated_at >= datetime('now', '-6 hours')
  `).bind(node.id).first().catch(() => ({}));

  const districtNodeIds = CONTROL_NODE_IDS_BY_DISTRICT.get(node.districtId) || [node.id];
  const placeholders = districtNodeIds.map(() => '?').join(', ');
  const districtPressure = await db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS district_failures,
      SUM(CASE WHEN status = 'critical_failure' THEN 1 ELSE 0 END) AS district_captures
    FROM blocktopia_covert_operations
    WHERE target_node_id IN (${placeholders})
      AND updated_at >= datetime('now', '-6 hours')
  `).bind(...districtNodeIds).first().catch(() => ({}));

  const hotness = clamp(
    (Number(nodePressure?.active_count) || 0) * 2
      + (Number(nodePressure?.failure_count) || 0) * 3
      + (Number(nodePressure?.capture_count) || 0) * 5
      + (Number(districtPressure?.district_failures) || 0)
      + (Number(districtPressure?.district_captures) || 0) * 2,
    0,
    16,
  );

  return {
    hotness,
    active_count: Number(nodePressure?.active_count) || 0,
    failure_count: Number(nodePressure?.failure_count) || 0,
    capture_count: Number(nodePressure?.capture_count) || 0,
    district_failures: Number(districtPressure?.district_failures) || 0,
    district_captures: Number(districtPressure?.district_captures) || 0,
  };
}

function computeResolution(agent, operation, pressure, nowMs = Date.now()) {
  const config = configForAgentType(agent.agent_type);
  const stealth = clamp((Number(agent.stealth) || 0) + activeBoostBonus(agent, nowMs), 1, 110);
  const resilience = clamp(Number(agent.resilience) || 0, 1, 100);
  const loyalty = clamp(Number(agent.loyalty) || 0, 1, 100);
  const heatBefore = clamp(Number(agent.heat) || 0, 0, 100);
  const successRoll = Math.floor(Math.random() * 101);
  const detectionRoll = Math.floor(Math.random() * 101);
  const exposedPressure = heatBefore >= 70 ? 7 : 0;
  const successTarget = clamp(
    config.successBase
      + Math.floor(stealth * config.stealthWeight)
      + Math.floor(loyalty * config.loyaltyWeight)
      - Math.floor(heatBefore * config.heatPenalty)
      - Math.floor(pressure.hotness * 0.8),
    18,
    88,
  );
  const exposureTarget = clamp(
    config.exposureBase
      - Math.floor(resilience * 0.08)
      + Math.floor(heatBefore * 0.22)
      + config.typeExposureRisk
      + exposedPressure
      + pressure.hotness,
    35,
    94,
  );
  const captureTarget = clamp(
    config.captureBase
      - Math.floor(resilience * 0.12)
      + Math.floor(heatBefore * 0.28)
      + config.typeCaptureRisk
      + exposedPressure
      + Math.floor(pressure.hotness * 0.7),
    55,
    98,
  );
  const captured = detectionRoll >= captureTarget;
  const exposed = !captured && detectionRoll >= exposureTarget;
  const succeeded = successRoll <= successTarget && !captured;

  let status = succeeded ? 'success' : 'failed';
  let agentStatus = exposed ? 'exposed' : 'idle';
  let heatAfter = heatBefore + (succeeded ? config.successHeat : config.failureHeat);
  let rewardXp = succeeded ? config.rewardXp : 0;
  let rewardGems = succeeded && Math.random() < BLOCKTOPIA_COVERT_GEM_REWARD_CHANCE ? 1 : 0;
  const deltas = {
    nodeInterference: 0,
    districtSupport: 0,
    districtPressure: 0,
    factionPressure: 0,
    samPressure: 0,
    localRisk: exposed ? 1 : 0,
  };

  if (captured) {
    status = 'critical_failure';
    agentStatus = 'captured';
    heatAfter = heatBefore + config.captureHeat;
    rewardXp = 0;
    rewardGems = 0;
    deltas.districtPressure = 1;
    deltas.samPressure = 2;
    deltas.localRisk = 4;
  } else if (succeeded) {
    deltas.nodeInterference = config.world.nodeInterference;
    deltas.districtSupport = config.world.districtSupport;
    deltas.districtPressure = config.world.districtPressure;
    deltas.factionPressure = config.world.factionPressure;
    deltas.samPressure = config.world.samPressure;
  } else {
    deltas.districtPressure = 1;
    deltas.samPressure = 1;
    deltas.localRisk = exposed ? 3 : 2;
  }

  return {
    status,
    agentStatus,
    successRoll,
    detectionRoll,
    successTarget,
    exposureTarget,
    captureTarget,
    heatBefore,
    heatAfter: clamp(heatAfter, 0, 100),
    rewardXp,
    rewardGems,
    deltas,
    pressure,
    operationType: operation.operation_type || config.operationType,
  };
}

async function resolveDueCovertOperations(db, telegramId) {
  const active = await db.prepare(`
    SELECT o.*, a.agent_type, a.stealth, a.resilience, a.loyalty, a.heat, a.stealth_boost_until
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
    const node = CONTROL_NODE_BY_ID.get(row.target_node_id);
    if (!node) continue;
    const pressure = await recentTargetPressure(db, node);
    const outcome = computeResolution(row, row, pressure);
    const worldEffect = buildWorldEffect({
      ...row,
      status: outcome.status,
      operation_type: outcome.operationType,
      success_roll: outcome.successRoll,
      node_interference_delta: outcome.deltas.nodeInterference,
      district_support_delta: outcome.deltas.districtSupport,
      district_pressure_delta: outcome.deltas.districtPressure,
      faction_pressure_delta: outcome.deltas.factionPressure,
      sam_pressure_delta: outcome.deltas.samPressure,
      local_risk_delta: outcome.deltas.localRisk,
    });

    await db.prepare(`
      UPDATE blocktopia_covert_operations
      SET status = ?, success_roll = ?, detection_roll = ?, reward_xp = ?, reward_gems = ?,
          heat_before = ?, heat_after = ?, node_interference_delta = ?, district_support_delta = ?,
          district_pressure_delta = ?, faction_pressure_delta = ?, sam_pressure_delta = ?,
          local_risk_delta = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND telegram_id = ? AND status = 'active'
    `).bind(
      outcome.status,
      outcome.successRoll,
      outcome.detectionRoll,
      outcome.rewardXp,
      outcome.rewardGems,
      outcome.heatBefore,
      outcome.heatAfter,
      outcome.deltas.nodeInterference,
      outcome.deltas.districtSupport,
      outcome.deltas.districtPressure,
      outcome.deltas.factionPressure,
      outcome.deltas.samPressure,
      outcome.deltas.localRisk,
      row.id,
      telegramId,
    ).run();

    await db.prepare(`
      UPDATE blocktopia_covert_agents
      SET heat = ?, status = ?, current_node_id = CASE WHEN ? = 'captured' THEN current_node_id ELSE NULL END,
          assigned_operation = NULL, assigned_until = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND telegram_id = ?
    `).bind(outcome.heatAfter, outcome.agentStatus, outcome.agentStatus, row.agent_id, telegramId).run();

    if (outcome.rewardXp > 0 || outcome.rewardGems > 0) {
      await db.prepare(`
        UPDATE blocktopia_progression
        SET xp = MIN(?, xp + ?), gems = MIN(?, gems + ?), updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ?
      `).bind(XP_MAX, outcome.rewardXp, GEMS_MAX, outcome.rewardGems, telegramId).run();
    }

    const action = outcome.status === 'success' ? 'covert_success' : 'covert_failure';
    const metadata = {
      operation_id: row.id,
      agent_id: row.agent_id,
      agent_type: row.agent_type || 'infiltrator',
      status: outcome.status,
      success_roll: outcome.successRoll,
      detection_roll: outcome.detectionRoll,
      success_target: outcome.successTarget,
      exposure_target: outcome.exposureTarget,
      capture_target: outcome.captureTarget,
      heat_before: outcome.heatBefore,
      heat_after: outcome.heatAfter,
      local_pressure: outcome.pressure,
      world_effect: worldEffect,
    };
    await logProgressionEvent(db, telegramId, action, row.target_node_id, outcome.rewardXp, outcome.rewardGems, metadata);
    if (outcome.agentStatus === 'exposed') {
      await logProgressionEvent(db, telegramId, 'covert_exposed', row.target_node_id, 0, 0, metadata);
    }
    if (outcome.agentStatus === 'captured') {
      await logProgressionEvent(db, telegramId, 'covert_capture', row.target_node_id, 0, 0, metadata);
    }

    resolved.push({
      ...row,
      operation_type: outcome.operationType,
      status: outcome.status,
      success_roll: outcome.successRoll,
      detection_roll: outcome.detectionRoll,
      reward_xp: outcome.rewardXp,
      reward_gems: outcome.rewardGems,
      heat_before: outcome.heatBefore,
      heat_after: outcome.heatAfter,
      node_interference_delta: outcome.deltas.nodeInterference,
      district_support_delta: outcome.deltas.districtSupport,
      district_pressure_delta: outcome.deltas.districtPressure,
      faction_pressure_delta: outcome.deltas.factionPressure,
      sam_pressure_delta: outcome.deltas.samPressure,
      local_risk_delta: outcome.deltas.localRisk,
    });
  }
  return resolved;
}

async function loadLocalRiskIndicators(db, telegramId) {
  const rows = await db.prepare(`
    SELECT target_node_id, SUM(local_risk_delta) AS risk
    FROM blocktopia_covert_operations
    WHERE telegram_id = ?
      AND local_risk_delta > 0
      AND updated_at >= datetime('now', '-12 hours')
    GROUP BY target_node_id
    ORDER BY risk DESC
    LIMIT 8
  `).bind(telegramId).all().catch(() => ({ results: [] }));

  return (rows.results || []).map((row) => {
    const node = CONTROL_NODE_BY_ID.get(row.target_node_id);
    return {
      node_id: row.target_node_id,
      district_id: node?.districtId || null,
      local_risk: clamp(Number(row.risk) || 0, 0, 20),
    };
  });
}

async function loadCovertState(db, telegramId) {
  const [agents, operations, progression, localRisk] = await Promise.all([
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
    loadLocalRiskIndicators(db, telegramId),
  ]);
  return {
    agents: (agents.results || []).map(publicAgent),
    operations: (operations.results || []).map(publicOperation),
    local_risk_indicators: localRisk,
    progression: {
      telegram_id: telegramId,
      xp: clamp(Number(progression?.xp) || 0, XP_MIN, XP_MAX),
      gems: clamp(Number(progression?.gems) || 0, GEMS_MIN, GEMS_MAX),
      tier: Number(progression?.tier) || 1,
    },
  };
}

async function spendGems(db, telegramId, cost, retryMessage) {
  const progression = await getOrCreateBlockTopiaProgression(db, telegramId);
  const gems = clamp(Math.floor(Number(progression.gems) || 0), GEMS_MIN, GEMS_MAX);
  if (gems < cost) return { ok: false, status: 402, message: 'Not enough gems' };
  const updateResult = await db.prepare(`
    UPDATE blocktopia_progression
    SET gems = gems - ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ? AND gems >= ?
  `).bind(cost, telegramId, cost).run();
  if (changedRows(updateResult) !== 1) return { ok: false, status: 409, message: retryMessage };
  return { ok: true };
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
    await applyHeatDecayForUser(env.DB, verified.telegramId);
    const resolved = await resolveDueCovertOperations(env.DB, verified.telegramId);
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, costs: covertCosts(), resolved: resolved.map(publicOperation), ...state });
  }

  if (request.method !== 'POST') return err('Method not allowed', 405);
  const auth = await authenticateCovertRequest(request, env, helpers);
  if (auth.response) return auth.response;
  const { body, verified } = auth;
  await applyHeatDecayForUser(env.DB, verified.telegramId);
  await resolveDueCovertOperations(env.DB, verified.telegramId);

  if (path === '/blocktopia/covert/create') {
    const agentType = normalizeAgentType(body?.agent_type || body?.agentType || body?.type);
    if (!agentType) return err('Invalid covert agent type', 400);
    const config = configForAgentType(agentType);
    const spend = await spendGems(env.DB, verified.telegramId, config.createCost, 'Progression changed. Please retry covert create.');
    if (!spend.ok) return err(spend.message === 'Not enough gems' ? `Not enough gems to create ${agentType}` : spend.message, spend.status);

    const agentId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO blocktopia_covert_agents
        (id, telegram_id, agent_type, level, stealth, resilience, loyalty, heat, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle')
    `).bind(
      agentId,
      verified.telegramId,
      agentType,
      config.stats.level,
      config.stats.stealth,
      config.stats.resilience,
      config.stats.loyalty,
      config.stats.heat,
    ).run();
    const auditAction = agentType === 'infiltrator' ? 'covert_create' : `covert_create_${agentType}`;
    await logProgressionEvent(env.DB, verified.telegramId, auditAction, agentType, 0, -config.createCost, { agent_id: agentId });
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: config.createCost, agent_type: agentType, ...state });
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
    if (!normalizeAgentType(agent.agent_type)) return err('Invalid covert agent type', 409);
    if (agent.status === 'captured') return err('Captured agents must be recovered before redeploying', 409);
    if (agent.status !== 'idle' && agent.status !== 'exposed') return err('Agent cannot be deployed from current status', 409);
    if (agent.assigned_operation) return err('Agent already has an assigned operation', 409);

    const activeCount = await env.DB.prepare(`
      SELECT COUNT(*) AS n FROM blocktopia_covert_operations
      WHERE telegram_id = ? AND status = 'active'
    `).bind(verified.telegramId).first().catch(() => ({ n: 0 }));
    if (Number(activeCount?.n || 0) >= BLOCKTOPIA_COVERT_MAX_ACTIVE_OPERATIONS) {
      return err('Active covert operation limit reached', 429);
    }

    const config = configForAgentType(agent.agent_type);
    const spend = await spendGems(env.DB, verified.telegramId, config.deployCost, 'Progression changed. Please retry covert deploy.');
    if (!spend.ok) return err(spend.message === 'Not enough gems' ? `Not enough gems to deploy ${agent.agent_type}` : spend.message, spend.status);

    const operationId = crypto.randomUUID();
    const resolvesAt = sqliteTimestamp(Date.now() + BLOCKTOPIA_COVERT_OPERATION_MS);
    const heatBefore = clamp(Number(agent.heat) || 0, 0, 100);
    const heatAfterDeploy = clamp(heatBefore + config.deployHeat + (agent.status === 'exposed' ? 6 : 0), 0, 100);

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO blocktopia_covert_operations
          (id, telegram_id, agent_id, operation_type, target_node_id, status, reward_xp, reward_gems,
           heat_before, heat_after, started_at, resolves_at)
        VALUES (?, ?, ?, ?, ?, 'active', 0, 0, ?, ?, CURRENT_TIMESTAMP, ?)
      `).bind(operationId, verified.telegramId, agentId, config.operationType, node.id, heatBefore, heatAfterDeploy, resolvesAt),
      env.DB.prepare(`
        UPDATE blocktopia_covert_agents
        SET status = 'active', heat = ?, current_node_id = ?, home_district_id = COALESCE(home_district_id, ?),
            assigned_operation = ?, assigned_until = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_id = ? AND status IN ('idle', 'exposed')
      `).bind(heatAfterDeploy, node.id, node.districtId, operationId, resolvesAt, agentId, verified.telegramId),
    ]);
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_deploy', node.id, 0, -config.deployCost, {
      agent_id: agentId,
      agent_type: agent.agent_type,
      operation_id: operationId,
      operation_type: config.operationType,
      heat_before: heatBefore,
      heat_after: heatAfterDeploy,
    });
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: config.deployCost, operation_id: operationId, resolves_at: resolvesAt, ...state });
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
    if (agent.status === 'captured') return err('Captured agents must be recovered before extraction', 409);
    if (agent.status !== 'active' || !agent.assigned_operation) return err('Agent is not on an active operation', 409);
    const operation = await env.DB.prepare(`
      SELECT * FROM blocktopia_covert_operations
      WHERE id = ? AND telegram_id = ? AND agent_id = ? AND status = 'active'
      LIMIT 1
    `).bind(agent.assigned_operation, verified.telegramId, agentId).first();
    if (!operation) return err('Active operation not found', 404);

    const midOperation = parseSqliteTimestamp(operation.resolves_at) > Date.now();
    if (midOperation) {
      const spend = await spendGems(env.DB, verified.telegramId, BLOCKTOPIA_COVERT_EXTRACT_COST, 'Progression changed. Please retry covert extract.');
      if (!spend.ok) return err(spend.message === 'Not enough gems' ? 'Not enough gems to extract agent' : spend.message, spend.status);
    }

    const config = configForAgentType(agent.agent_type);
    const heatAfter = clamp((Number(agent.heat) || 0) + config.extractHeat, 0, 100);
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE blocktopia_covert_operations
        SET status = 'failed', heat_after = ?, local_risk_delta = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_id = ? AND status = 'active'
      `).bind(heatAfter, operation.id, verified.telegramId),
      env.DB.prepare(`
        UPDATE blocktopia_covert_agents
        SET status = 'idle', current_node_id = NULL, assigned_operation = NULL,
            assigned_until = NULL, heat = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_id = ?
      `).bind(heatAfter, agentId, verified.telegramId),
    ]);
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_extract', operation.target_node_id, 0, midOperation ? -BLOCKTOPIA_COVERT_EXTRACT_COST : 0, {
      agent_id: agentId,
      operation_id: operation.id,
      mid_operation: midOperation,
      heat_after: heatAfter,
    });
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_failure', operation.target_node_id, 0, 0, {
      agent_id: agentId,
      operation_id: operation.id,
      reason: 'manual_extract',
      local_risk_delta: 1,
    });
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: midOperation ? BLOCKTOPIA_COVERT_EXTRACT_COST : 0, ...state });
  }

  if (path === '/blocktopia/covert/revive' || path === '/blocktopia/covert/recover') {
    const agentId = String(body?.agent_id || body?.agentId || '').trim();
    if (!agentId) return err('agent_id required', 400);
    const agent = await env.DB.prepare(`
      SELECT * FROM blocktopia_covert_agents
      WHERE id = ? AND telegram_id = ?
      LIMIT 1
    `).bind(agentId, verified.telegramId).first();
    if (!agent) return err('Agent not found', 404);
    if (agent.status !== 'captured') return err('Only captured agents can be recovered', 409);

    const spend = await spendGems(env.DB, verified.telegramId, BLOCKTOPIA_COVERT_REVIVE_COST, 'Progression changed. Please retry covert recover.');
    if (!spend.ok) return err(spend.message === 'Not enough gems' ? 'Not enough gems to recover captured agent' : spend.message, spend.status);
    await env.DB.prepare(`
      UPDATE blocktopia_covert_agents
      SET status = 'idle', heat = 35, current_node_id = NULL, assigned_operation = NULL, assigned_until = NULL,
          stealth_boost_until = NULL, recovery_count = COALESCE(recovery_count, 0) + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND telegram_id = ? AND status = 'captured'
    `).bind(agentId, verified.telegramId).run();
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_revive', agent.agent_type || 'infiltrator', 0, -BLOCKTOPIA_COVERT_REVIVE_COST, {
      agent_id: agentId,
      previous_node_id: agent.current_node_id || null,
    });
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: BLOCKTOPIA_COVERT_REVIVE_COST, ...state });
  }

  if (path === '/blocktopia/covert/boost') {
    const agentId = String(body?.agent_id || body?.agentId || '').trim();
    if (!agentId) return err('agent_id required', 400);
    const agent = await env.DB.prepare(`
      SELECT * FROM blocktopia_covert_agents
      WHERE id = ? AND telegram_id = ?
      LIMIT 1
    `).bind(agentId, verified.telegramId).first();
    if (!agent) return err('Agent not found', 404);
    if (agent.status === 'captured') return err('Captured agents must be recovered before boosting', 409);

    const spend = await spendGems(env.DB, verified.telegramId, BLOCKTOPIA_COVERT_STEALTH_BOOST_COST, 'Progression changed. Please retry covert boost.');
    if (!spend.ok) return err(spend.message === 'Not enough gems' ? 'Not enough gems to boost agent stealth' : spend.message, spend.status);
    const boostUntil = sqliteTimestamp(Date.now() + BOOST_MS);
    const heatAfter = clamp((Number(agent.heat) || 0) - 10, 0, 100);
    const statusAfter = agent.status === 'exposed' && heatAfter < 60 ? 'idle' : agent.status;
    await env.DB.prepare(`
      UPDATE blocktopia_covert_agents
      SET heat = ?, status = ?, stealth_boost_until = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND telegram_id = ? AND status != 'captured'
    `).bind(heatAfter, statusAfter, boostUntil, agentId, verified.telegramId).run();
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_boost', agent.agent_type || 'infiltrator', 0, -BLOCKTOPIA_COVERT_STEALTH_BOOST_COST, {
      agent_id: agentId,
      heat_before: Number(agent.heat) || 0,
      heat_after: heatAfter,
      boost_until: boostUntil,
    });
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: BLOCKTOPIA_COVERT_STEALTH_BOOST_COST, boost_until: boostUntil, ...state });
  }

  if (path === '/blocktopia/covert/retask' || path === '/blocktopia/covert/reroll') {
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
    if (agent.status !== 'active' || !agent.assigned_operation) return err('Only active agents can be retasked', 409);
    const operation = await env.DB.prepare(`
      SELECT * FROM blocktopia_covert_operations
      WHERE id = ? AND telegram_id = ? AND agent_id = ? AND status = 'active'
      LIMIT 1
    `).bind(agent.assigned_operation, verified.telegramId, agentId).first();
    if (!operation) return err('Active operation not found', 404);
    if (operation.target_node_id === node.id) return err('Agent is already assigned to that node', 409);

    const spend = await spendGems(env.DB, verified.telegramId, BLOCKTOPIA_COVERT_RETASK_COST, 'Progression changed. Please retry covert retask.');
    if (!spend.ok) return err(spend.message === 'Not enough gems' ? 'Not enough gems to retask agent' : spend.message, spend.status);
    const config = configForAgentType(agent.agent_type);
    const heatAfter = clamp((Number(agent.heat) || 0) + config.retaskHeat, 0, 100);
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE blocktopia_covert_operations
        SET target_node_id = ?, heat_after = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_id = ? AND status = 'active'
      `).bind(node.id, heatAfter, operation.id, verified.telegramId),
      env.DB.prepare(`
        UPDATE blocktopia_covert_agents
        SET heat = ?, current_node_id = ?, home_district_id = COALESCE(home_district_id, ?), updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_id = ? AND status = 'active'
      `).bind(heatAfter, node.id, node.districtId, agentId, verified.telegramId),
    ]);
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_retask', node.id, 0, -BLOCKTOPIA_COVERT_RETASK_COST, {
      agent_id: agentId,
      operation_id: operation.id,
      previous_node_id: operation.target_node_id,
      heat_after: heatAfter,
    });
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: BLOCKTOPIA_COVERT_RETASK_COST, operation_id: operation.id, ...state });
  }

  return err('Not found', 404);
}

function covertCosts() {
  return {
    create: BLOCKTOPIA_COVERT_CREATE_COST,
    create_by_type: Object.fromEntries(AGENT_TYPES.map((type) => [type, AGENT_CONFIG[type].createCost])),
    deploy: BLOCKTOPIA_COVERT_DEPLOY_COST,
    deploy_by_type: Object.fromEntries(AGENT_TYPES.map((type) => [type, AGENT_CONFIG[type].deployCost])),
    extract: BLOCKTOPIA_COVERT_EXTRACT_COST,
    revive: BLOCKTOPIA_COVERT_REVIVE_COST,
    recover: BLOCKTOPIA_COVERT_REVIVE_COST,
    stealth_boost: BLOCKTOPIA_COVERT_STEALTH_BOOST_COST,
    retask: BLOCKTOPIA_COVERT_RETASK_COST,
    reroll: BLOCKTOPIA_COVERT_RETASK_COST,
    operation_ms: BLOCKTOPIA_COVERT_OPERATION_MS,
    heat_decay_interval_ms: HEAT_DECAY_INTERVAL_MS,
    stealth_boost_ms: BOOST_MS,
  };
}
