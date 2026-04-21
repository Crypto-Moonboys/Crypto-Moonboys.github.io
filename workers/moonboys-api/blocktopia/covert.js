import { CONTROL_LINKS, CONTROL_NODES } from '../../../games/block-topia/world/control-grid.js';
import {
  BLOCKTOPIA_COVERT_CREATE_COST,
  BLOCKTOPIA_COVERT_DEPLOY_COST,
  BLOCKTOPIA_COVERT_EMERGENCY_EXTRACT_COST,
  BLOCKTOPIA_COVERT_EXTRACT_COST,
  BLOCKTOPIA_COVERT_GEM_REWARD_CHANCE,
  BLOCKTOPIA_COVERT_HEAT_RELIEF_COST,
  BLOCKTOPIA_COVERT_MAX_ACTIVE_OPERATIONS,
  BLOCKTOPIA_COVERT_OPERATION_MS,
  BLOCKTOPIA_COVERT_RECOVERY_ACCELERATION_COST,
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
const NETWORK_HEAT_DECAY_INTERVAL_MS = 3 * 60 * 60 * 1000;
const NETWORK_HEAT_DECAY_PER_INTERVAL = 2;
const NETWORK_HEAT_RELIEF = 18;
const AGENT_HEAT_RELIEF = 12;
const EMERGENCY_EXTRACT_HEAT_RELIEF = 10;
const EMERGENCY_EXTRACT_NETWORK_RELIEF = 6;
const RECOVERY_ACCELERATION_MS = 20 * 60 * 1000;
const CAPTURE_BASE_MS = 20 * 60 * 1000;
const CAPTURE_HISTORY_MS = 12 * 60 * 1000;
const CAPTURE_AGENT_HEAT_MS = 25 * 1000;
const CAPTURE_NETWORK_HEAT_MS = 18 * 1000;
const CAPTURE_MAX_MS = 4 * 60 * 60 * 1000;
const NODE_SCAN_DURATION_MS = 18 * 60 * 1000;
const LOCAL_TRACE_DURATION_MS = 16 * 60 * 1000;
const ROUTE_DISRUPTION_DURATION_MS = 22 * 60 * 1000;
const HUNTER_GLOBAL_CAP = 4;
const HUNTER_DISTRICT_CAP = 2;
const HUNTER_AURA_MAX_STEPS = 2;
const HUNTER_IDLE_MIN_MS = 45 * 1000;
const HUNTER_IDLE_RANGE_MS = 70 * 1000;

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
const CONTROL_NODE_LINKS = CONTROL_LINKS.map((link) => ({
  from: link.from.id,
  to: link.to.id,
}));
const CONTROL_NODE_ADJACENCY = CONTROL_NODE_LINKS.reduce((map, link) => {
  if (!map.has(link.from)) map.set(link.from, []);
  if (!map.has(link.to)) map.set(link.to, []);
  map.get(link.from).push(link.to);
  map.get(link.to).push(link.from);
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

function isoTimestamp(ms) {
  return new Date(ms).toISOString();
}

function activeCounterWindow(lastActivityAt, durationMs, nowMs = Date.now()) {
  const lastActivityMs = parseSqliteTimestamp(lastActivityAt);
  if (!lastActivityMs || durationMs <= 0) return null;
  const expiresAtMs = lastActivityMs + durationMs;
  if (expiresAtMs <= nowMs) return null;
  return {
    activated_at: isoTimestamp(lastActivityMs),
    expires_at: isoTimestamp(expiresAtMs),
    remaining_ms: expiresAtMs - nowMs,
  };
}

function isBoostActive(agent, nowMs = Date.now()) {
  return parseSqliteTimestamp(agent?.stealth_boost_until) > nowMs;
}

function activeBoostBonus(agent, nowMs = Date.now()) {
  return isBoostActive(agent, nowMs) ? 10 : 0;
}

function pressureLabel(value) {
  const score = clamp(Number(value) || 0, 0, 100);
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'elevated';
  return 'low';
}

function counterActionSeverity(score) {
  const value = Number(score) || 0;
  if (value >= 28) return 'critical';
  if (value >= 20) return 'high';
  if (value >= 14) return 'elevated';
  return 'low';
}

function computeDecayedValue(rawValue, updatedAt, intervalMs, amountPerInterval, nowMs = Date.now()) {
  const value = clamp(Number(rawValue) || 0, 0, 100);
  const lastUpdated = parseSqliteTimestamp(updatedAt);
  if (!lastUpdated || intervalMs <= 0 || amountPerInterval <= 0) return value;
  const intervals = Math.floor((nowMs - lastUpdated) / intervalMs);
  if (intervals <= 0) return value;
  return clamp(value - (intervals * amountPerInterval), 0, 100);
}

function computeCaptureCooldownMs(agent, networkHeat) {
  const heat = clamp(Number(agent?.heat) || 0, 0, 100);
  const captureCount = Math.max(0, Number(agent?.capture_count) || 0);
  const cooldown =
    CAPTURE_BASE_MS
    + (heat * CAPTURE_AGENT_HEAT_MS)
    + (clamp(Number(networkHeat) || 0, 0, 100) * CAPTURE_NETWORK_HEAT_MS)
    + (captureCount * CAPTURE_HISTORY_MS);
  return Math.min(cooldown, CAPTURE_MAX_MS);
}

function sortByValueDescThenKey(a, b, valueKey, keyKey = 'id') {
  const valueDiff = (Number(b?.[valueKey]) || 0) - (Number(a?.[valueKey]) || 0);
  if (valueDiff !== 0) return valueDiff;
  return String(a?.[keyKey] || '').localeCompare(String(b?.[keyKey] || ''));
}

function shortestNodeDistance(fromNodeId, toNodeId, maxDepth = HUNTER_AURA_MAX_STEPS + 3) {
  if (!fromNodeId || !toNodeId) return Infinity;
  if (fromNodeId === toNodeId) return 0;
  const visited = new Set([fromNodeId]);
  const queue = [{ id: fromNodeId, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) continue;
    const neighbors = CONTROL_NODE_ADJACENCY.get(current.id) || [];
    for (const neighborId of neighbors) {
      if (neighborId === toNodeId) return current.depth + 1;
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      queue.push({ id: neighborId, depth: current.depth + 1 });
    }
  }
  return Infinity;
}

function shortestPathNodeIds(fromNodeId, toNodeId) {
  if (!fromNodeId || !toNodeId) return [];
  if (fromNodeId === toNodeId) return [fromNodeId];
  const visited = new Set([fromNodeId]);
  const queue = [[fromNodeId]];
  while (queue.length) {
    const path = queue.shift();
    const currentId = path[path.length - 1];
    const neighbors = CONTROL_NODE_ADJACENCY.get(currentId) || [];
    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;
      const nextPath = [...path, neighborId];
      if (neighborId === toNodeId) return nextPath;
      visited.add(neighborId);
      queue.push(nextPath);
    }
  }
  return [fromNodeId];
}

function uniqueNodeIds(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const nodeId = String(value || '').trim().toLowerCase();
    if (!nodeId || seen.has(nodeId) || !CONTROL_NODE_BY_ID.has(nodeId)) continue;
    seen.add(nodeId);
    result.push(nodeId);
  }
  return result;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function sampleHunterNodeIds(entry, districtSignal, cluster, options = {}) {
  const { widerRange = false } = options;
  const districtNodeIds = CONTROL_NODE_IDS_BY_DISTRICT.get(entry.district_id) || [entry.node_id];
  const districtPeers = districtNodeIds
    .filter((nodeId) => nodeId !== entry.node_id)
    .sort((leftId, rightId) => {
      const leftNode = CONTROL_NODE_BY_ID.get(leftId);
      const rightNode = CONTROL_NODE_BY_ID.get(rightId);
      const leftDistance = shortestNodeDistance(entry.node_id, leftId, 8);
      const rightDistance = shortestNodeDistance(entry.node_id, rightId, 8);
      const leftScore = (leftDistance * 10) + (leftNode?.nodeType === 'control' ? -2 : 0);
      const rightScore = (rightDistance * 10) + (rightNode?.nodeType === 'control' ? -2 : 0);
      return leftScore - rightScore || leftId.localeCompare(rightId);
    });
  const radiusBudget = widerRange ? 4 : 2;
  const localPeers = districtPeers.filter((nodeId) => shortestNodeDistance(entry.node_id, nodeId, 8) <= radiusBudget);
  const affectedNodes = uniqueNodeIds([
    ...(Array.isArray(cluster?.hottest_node_ids) ? cluster.hottest_node_ids : []),
    ...(Array.isArray(options?.traceNodes) ? options.traceNodes : []),
    ...(Array.isArray(options?.routeNodes) ? options.routeNodes : []),
  ]);
  return uniqueNodeIds([
    entry.node_id,
    ...affectedNodes,
    ...localPeers.slice(0, widerRange ? 4 : 2),
    ...(widerRange ? districtPeers.slice(0, 2) : []),
    ...(districtSignal?.sam_watch >= 3 ? districtPeers.slice(2, 4) : []),
  ]).slice(0, widerRange ? 6 : 4);
}

function buildHunterDetectionMap(hunterUnits = []) {
  const nodeEffects = new Map();
  for (const hunter of hunterUnits) {
    const routeNodeIds = uniqueNodeIds([
      hunter.current_node_id,
      hunter.next_node_id,
      ...(hunter.route_node_ids || []),
    ]);
    for (const node of CONTROL_NODES) {
      let minSteps = Infinity;
      for (const routeNodeId of routeNodeIds) {
        minSteps = Math.min(minSteps, shortestNodeDistance(routeNodeId, node.id, HUNTER_AURA_MAX_STEPS + 2));
      }
      if (!Number.isFinite(minSteps) || minSteps > Number(hunter.detection_radius_steps || HUNTER_AURA_MAX_STEPS)) {
        continue;
      }
      const intensity = clamp(
        (Number(hunter.intensity) || 0) - (minSteps * 2),
        0,
        12,
      );
      if (intensity <= 0) continue;
      const existing = nodeEffects.get(node.id) || {
        node_id: node.id,
        district_id: node.districtId,
        intensity: 0,
        nearest_steps: minSteps,
        hunter_ids: [],
        modifiers: {
          success_penalty: 0,
          detection_shift: 0,
          capture_shift: 0,
          extract_risk_shift: 0,
          operation_delay_ms: 0,
        },
      };
      existing.intensity = Math.max(existing.intensity, intensity);
      existing.nearest_steps = Math.min(existing.nearest_steps, minSteps);
      existing.hunter_ids = uniqueStrings([...existing.hunter_ids, hunter.id]);
      existing.modifiers.success_penalty = Math.max(existing.modifiers.success_penalty, clamp(Math.ceil(intensity / 2), 1, 6));
      existing.modifiers.detection_shift = Math.max(existing.modifiers.detection_shift, clamp(Math.ceil(intensity / 1.8), 1, 7));
      existing.modifiers.capture_shift = Math.max(existing.modifiers.capture_shift, clamp(Math.ceil(intensity / 2.4), 1, 5));
      existing.modifiers.extract_risk_shift = Math.max(existing.modifiers.extract_risk_shift, clamp(Math.ceil(intensity / 2.6), 1, 4));
      existing.modifiers.operation_delay_ms = Math.max(existing.modifiers.operation_delay_ms, clamp(intensity * 10000, 20000, 90000));
      nodeEffects.set(node.id, existing);
    }
  }
  return [...nodeEffects.values()]
    .sort((left, right) => sortByValueDescThenKey(left, right, 'intensity', 'node_id'));
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
    captured_until: row.captured_until || null,
    capture_count: Number(row.capture_count) || 0,
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

async function updateNetworkHeat(db, telegramId, options = {}) {
  const {
    progressionRow = null,
    delta = 0,
    minimum = 0,
    reason = 'covert_pressure',
    actionType = null,
    metadata = {},
    log = true,
    nowMs = Date.now(),
  } = options;
  const progression = progressionRow || await getOrCreateBlockTopiaProgression(db, telegramId);
  const storedHeat = clamp(Number(progression?.network_heat) || 0, 0, 100);
  const decayedHeat = computeDecayedValue(
    storedHeat,
    progression?.network_heat_updated_at,
    NETWORK_HEAT_DECAY_INTERVAL_MS,
    NETWORK_HEAT_DECAY_PER_INTERVAL,
    nowMs,
  );
  const nextHeat = clamp(Math.max(decayedHeat + delta, minimum), 0, 100);
  const needsWrite = nextHeat !== storedHeat || decayedHeat !== storedHeat;
  if (needsWrite) {
    await db.prepare(`
      UPDATE blocktopia_progression
      SET network_heat = ?, network_heat_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `).bind(nextHeat, telegramId).run();
  }
  if (log && nextHeat !== decayedHeat) {
    await logProgressionEvent(db, telegramId, 'covert_network_heat_change', actionType || reason, 0, 0, {
      reason,
      before: decayedHeat,
      after: nextHeat,
      delta,
      minimum,
      ...metadata,
    });
  }
  return { before: decayedHeat, after: nextHeat };
}

async function recoverReadyCapturedAgents(db, telegramId, nowMs = Date.now()) {
  const ready = await db.prepare(`
    SELECT *
    FROM blocktopia_covert_agents
    WHERE telegram_id = ?
      AND status = 'captured'
      AND captured_until IS NOT NULL
      AND captured_until <= CURRENT_TIMESTAMP
  `).bind(telegramId).all().catch(() => ({ results: [] }));

  for (const agent of ready.results || []) {
    const heatAfter = clamp(Math.max(Number(agent.heat) || 0, 26) - 12, 18, 100);
    await db.prepare(`
      UPDATE blocktopia_covert_agents
      SET status = 'idle', heat = ?, current_node_id = NULL, assigned_operation = NULL, assigned_until = NULL,
          stealth_boost_until = NULL, captured_until = NULL,
          recovery_count = COALESCE(recovery_count, 0) + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND telegram_id = ? AND status = 'captured'
    `).bind(heatAfter, agent.id, telegramId).run();
    await logProgressionEvent(db, telegramId, 'covert_recovery', agent.agent_type || 'infiltrator', 0, 0, {
      agent_id: agent.id,
      automatic: true,
      recovered_at: sqliteTimestamp(nowMs),
      previous_captured_until: agent.captured_until || null,
      capture_count: Number(agent.capture_count) || 0,
      heat_after: heatAfter,
    });
  }
}

async function applyCovertDecayForUser(db, telegramId, nowMs = Date.now()) {
  const progression = await getOrCreateBlockTopiaProgression(db, telegramId);
  await updateNetworkHeat(db, telegramId, {
    progressionRow: progression,
    reason: 'passive_decay',
    actionType: 'passive_decay',
    log: computeDecayedValue(
      progression?.network_heat,
      progression?.network_heat_updated_at,
      NETWORK_HEAT_DECAY_INTERVAL_MS,
      NETWORK_HEAT_DECAY_PER_INTERVAL,
      nowMs,
    ) !== clamp(Number(progression?.network_heat) || 0, 0, 100),
    nowMs,
  });

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

  await recoverReadyCapturedAgents(db, telegramId, nowMs);
}

function nodeRiskStatus(row) {
  const risk = clamp(Number(row?.risk) || 0, 0, 100);
  if (risk >= 16) return 'under_watch';
  if (risk >= 9) return 'elevated';
  if (risk >= 5) return 'noticed';
  return 'quiet';
}

async function loadCovertPressureSnapshot(db, telegramId, progressionRow = null, nowMs = Date.now()) {
  const progression = progressionRow || await getOrCreateBlockTopiaProgression(db, telegramId);
  const [agentSummary, recentOps, nodeRows, agentDistrictRows] = await Promise.all([
    db.prepare(`
      SELECT
        COUNT(*) AS total_agents,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_agents,
        SUM(CASE WHEN status = 'active' AND agent_type = 'saboteur' THEN 1 ELSE 0 END) AS active_saboteurs,
        SUM(CASE WHEN status = 'exposed' THEN 1 ELSE 0 END) AS exposed_agents,
        SUM(CASE WHEN status = 'captured' THEN 1 ELSE 0 END) AS captured_agents,
        COALESCE(SUM(CASE WHEN status != 'captured' THEN heat ELSE 0 END), 0) AS total_heat,
        COALESCE(AVG(CASE WHEN status != 'captured' THEN heat END), 0) AS avg_heat
      FROM blocktopia_covert_agents
      WHERE telegram_id = ?
    `).bind(telegramId).first().catch(() => ({})),
    db.prepare(`
      SELECT
        COUNT(*) AS total_ops,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_ops,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_ops,
        SUM(CASE WHEN status = 'critical_failure' THEN 1 ELSE 0 END) AS critical_failures,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_ops,
        SUM(CASE WHEN operation_type = 'sabotage' THEN 1 ELSE 0 END) AS sabotage_ops,
        SUM(CASE WHEN operation_type = 'sabotage' AND status = 'success' THEN 1 ELSE 0 END) AS sabotage_successes,
        SUM(CASE WHEN operation_type = 'recruit' AND status = 'success' THEN 1 ELSE 0 END) AS recruiter_successes
      FROM blocktopia_covert_operations
      WHERE telegram_id = ?
        AND created_at >= datetime('now', '-12 hours')
    `).bind(telegramId).first().catch(() => ({})),
    db.prepare(`
      SELECT
        target_node_id,
        COUNT(*) AS op_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failures,
        SUM(CASE WHEN status = 'critical_failure' THEN 1 ELSE 0 END) AS captures,
        SUM(CASE WHEN operation_type = 'sabotage' THEN 1 ELSE 0 END) AS sabotage_ops,
        SUM(CASE WHEN operation_type = 'recruit' AND status = 'success' THEN 1 ELSE 0 END) AS recruiter_successes,
        SUM(COALESCE(local_risk_delta, 0)) AS local_risk,
        SUM(COALESCE(district_pressure_delta, 0)) AS district_pressure,
        SUM(COALESCE(sam_pressure_delta, 0)) AS sam_pressure,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_ops,
        MAX(updated_at) AS last_activity_at
      FROM blocktopia_covert_operations
      WHERE telegram_id = ?
        AND updated_at >= datetime('now', '-12 hours')
      GROUP BY target_node_id
      ORDER BY MAX(updated_at) DESC
      LIMIT 12
    `).bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare(`
      SELECT current_node_id, home_district_id, status, heat, capture_count, captured_until
      FROM blocktopia_covert_agents
      WHERE telegram_id = ?
    `).bind(telegramId).all().catch(() => ({ results: [] })),
  ]);

  const repeatedDeployments = Math.max(0, (Number(recentOps?.total_ops) || 0) - 2);
  const repeatedTargeting = (nodeRows.results || []).reduce((sum, row) => sum + Math.max(0, (Number(row.op_count) || 0) - 1), 0);
  const derivedFloor = clamp(
    ((Number(agentSummary?.active_agents) || 0) * 4)
      + ((Number(agentSummary?.active_saboteurs) || 0) * 3)
      + Math.round((Number(agentSummary?.avg_heat) || 0) * 0.3)
      + ((Number(recentOps?.failed_ops) || 0) * 4)
      + ((Number(recentOps?.critical_failures) || 0) * 7)
      + ((Number(recentOps?.sabotage_ops) || 0) * 2)
      + ((Number(agentSummary?.exposed_agents) || 0) * 8)
      + ((Number(agentSummary?.captured_agents) || 0) * 5)
      + (repeatedDeployments * 2)
      + (repeatedTargeting * 3),
    0,
    95,
  );

  const syncedHeat = await updateNetworkHeat(db, telegramId, {
    progressionRow: progression,
    minimum: derivedFloor,
    reason: 'derived_floor_sync',
    actionType: 'derived_floor_sync',
    log: false,
    nowMs,
  });
  const networkHeat = syncedHeat.after;
  const sensitivity = clamp(
    Math.floor(networkHeat * 0.65)
      + ((Number(recentOps?.failed_ops) || 0) * 4)
      + ((Number(recentOps?.critical_failures) || 0) * 6)
      + ((Number(agentSummary?.exposed_agents) || 0) * 5)
      + (repeatedTargeting * 4),
    0,
    100,
  );

  const nodeRiskById = new Map();
  const districtRiskById = new Map();
  const localNodeRisk = (nodeRows.results || []).map((row) => {
    const node = CONTROL_NODE_BY_ID.get(row.target_node_id);
    const risk = clamp(
      ((Number(row.op_count) || 0) * 2)
      + ((Number(row.failures) || 0) * 3)
      + ((Number(row.captures) || 0) * 5)
      + ((Number(row.sabotage_ops) || 0) * 2)
      + (Number(row.local_risk) || 0)
      + (Number(row.sam_pressure) || 0),
      0,
      24,
    );
    const watchStatus = nodeRiskStatus({ risk });
    const entry = {
      node_id: row.target_node_id,
      district_id: node?.districtId || null,
      risk,
      watch_status: watchStatus,
      repeated_targeting: Math.max(0, (Number(row.op_count) || 0) - 1),
      recent_failures: Number(row.failures) || 0,
      recent_captures: Number(row.captures) || 0,
      sabotage_pressure: Number(row.sabotage_ops) || 0,
      sam_pressure: Number(row.sam_pressure) || 0,
      active_ops: Number(row.active_ops) || 0,
      last_activity_at: row.last_activity_at || null,
    };
    nodeRiskById.set(entry.node_id, entry);
    const districtExisting = districtRiskById.get(entry.district_id) || {
      district_id: entry.district_id,
      instability: 0,
      sabotage_pressure: 0,
      recruiter_relief: 0,
      sam_watch: 0,
      last_activity_at_ms: 0,
    };
    districtExisting.instability += risk + (Number(row.district_pressure) || 0);
    districtExisting.sabotage_pressure += Number(row.sabotage_ops) || 0;
    districtExisting.recruiter_relief += Number(row.recruiter_successes) || 0;
    districtExisting.sam_watch += Number(row.sam_pressure) || 0;
    districtExisting.last_activity_at_ms = Math.max(
      Number(districtExisting.last_activity_at_ms) || 0,
      parseSqliteTimestamp(row.last_activity_at),
    );
    districtRiskById.set(entry.district_id, districtExisting);
    return entry;
  }).sort((a, b) => b.risk - a.risk);

  const districtInstabilitySignals = [...districtRiskById.values()]
    .filter((entry) => entry.district_id)
    .map((entry) => {
      const instability = clamp(
        entry.instability
          + (entry.sabotage_pressure * 2)
          - (entry.recruiter_relief * 2),
        0,
        30,
      );
      const signal = {
        district_id: entry.district_id,
        instability,
        pressure_flag: instability >= 18 ? 'volatile' : instability >= 10 ? 'unstable' : instability >= 5 ? 'watched' : 'calm',
        sabotage_pressure: entry.sabotage_pressure,
        recruiter_relief: entry.recruiter_relief,
        sam_watch: entry.sam_watch,
        last_activity_at: entry.last_activity_at_ms ? isoTimestamp(entry.last_activity_at_ms) : null,
      };
      districtRiskById.set(entry.district_id, signal);
      return signal;
    })
    .sort((a, b) => b.instability - a.instability);

  const districtAgentClusters = new Map();
  for (const row of agentDistrictRows.results || []) {
    const nodeDistrictId = CONTROL_NODE_BY_ID.get(row.current_node_id)?.districtId || null;
    const districtId = nodeDistrictId || row.home_district_id || null;
    if (!districtId) continue;
    const cluster = districtAgentClusters.get(districtId) || {
      district_id: districtId,
      active_agents: 0,
      exposed_agents: 0,
      captured_agents: 0,
      total_heat: 0,
      agent_count: 0,
      repeated_targeting: 0,
      hottest_node_ids: [],
      last_activity_at: null,
    };
    cluster.agent_count += 1;
    cluster.total_heat += Math.max(0, Number(row.heat) || 0);
    if (row.status === 'active') cluster.active_agents += 1;
    if (row.status === 'exposed') cluster.exposed_agents += 1;
    if (row.status === 'captured') cluster.captured_agents += 1;
    if (row.current_node_id) {
      const nodeEntry = nodeRiskById.get(row.current_node_id);
      if (nodeEntry) {
        cluster.repeated_targeting += Math.max(0, Number(nodeEntry.repeated_targeting) || 0);
        if (!cluster.hottest_node_ids.includes(row.current_node_id)) {
          cluster.hottest_node_ids.push(row.current_node_id);
        }
        const nodeLastActivity = parseSqliteTimestamp(nodeEntry.last_activity_at);
        if (nodeLastActivity > 0) {
          cluster.last_activity_at = isoTimestamp(nodeLastActivity);
        }
      }
    }
    if (!cluster.last_activity_at && (row.status === 'active' || row.status === 'exposed' || row.status === 'captured')) {
      cluster.last_activity_at = isoTimestamp(nowMs);
    }
    districtAgentClusters.set(districtId, cluster);
  }
  for (const cluster of districtAgentClusters.values()) {
    cluster.avg_heat = cluster.agent_count > 0 ? Math.round(cluster.total_heat / cluster.agent_count) : 0;
  }

  const detectionModifier = clamp(Math.floor(sensitivity / 14), 0, 12);
  const captureModifier = clamp(Math.floor(sensitivity / 18), 0, 10);
  const successPenalty = clamp(Math.floor(sensitivity / 16), 0, 10);
  const pressureFlags = [];
  if (networkHeat >= 25) pressureFlags.push('sam_listening');
  if (repeatedTargeting > 0) pressureFlags.push('repeat_targeting_detected');
  if ((Number(agentSummary?.exposed_agents) || 0) > 0) pressureFlags.push('exposed_agents_tracked');
  if ((Number(recentOps?.critical_failures) || 0) > 0) pressureFlags.push('capture_pressure_rising');
  if ((Number(recentOps?.sabotage_ops) || 0) >= 3) pressureFlags.push('sabotage_pattern_detected');
  const counterActions = buildSamCounterActions({
    networkHeat,
    sensitivity,
    nodeEntries: localNodeRisk,
    districtSignals: districtInstabilitySignals,
    districtAgentClusters,
    nowMs,
  });
  if (counterActions.summary.node_scan_count > 0) pressureFlags.push('node_scans_live');
  if (counterActions.summary.local_trace_count > 0) pressureFlags.push('trace_lock_active');
  if (counterActions.summary.route_disruption_count > 0) pressureFlags.push('route_disruption_live');
  const hunterState = buildHunterUnits({
    networkHeat,
    sensitivity,
    nodeEntries: localNodeRisk,
    districtSignals: districtInstabilitySignals,
    districtAgentClusters,
    counterActions,
    nowMs,
  });
  if ((hunterState.summary?.active_count || 0) > 0) pressureFlags.push('hunter_units_deployed');

  return {
    network_heat: {
      value: networkHeat,
      tier: pressureLabel(networkHeat),
      decay_interval_ms: NETWORK_HEAT_DECAY_INTERVAL_MS,
      derived_floor: derivedFloor,
      factors: {
        active_agents: Number(agentSummary?.active_agents) || 0,
        avg_agent_heat: Math.round(Number(agentSummary?.avg_heat) || 0),
        failed_operations: Number(recentOps?.failed_ops) || 0,
        critical_failures: Number(recentOps?.critical_failures) || 0,
        sabotage_activity: Number(recentOps?.sabotage_ops) || 0,
        repeated_deployments: repeatedDeployments,
        exposed_agents: Number(agentSummary?.exposed_agents) || 0,
        captured_agents: Number(agentSummary?.captured_agents) || 0,
        repeated_targeting: repeatedTargeting,
      },
    },
    sam_awareness: {
      sensitivity,
      tier: pressureLabel(sensitivity),
      detection_modifier: detectionModifier,
      capture_modifier: captureModifier,
      success_penalty: successPenalty,
      pressure_flags: pressureFlags,
      elevated_zones: localNodeRisk
        .filter((entry) => entry.risk >= 7)
        .slice(0, 5)
        .map((entry) => ({
          node_id: entry.node_id,
          district_id: entry.district_id,
          risk: entry.risk,
          status: entry.watch_status,
        })),
    },
    local_node_risk: localNodeRisk,
    district_instability_signals: districtInstabilitySignals,
    counter_actions: counterActions,
    hunter_units: hunterState.hunter_units,
    hunter_detection_fields: hunterState.detection_fields,
    _internal: {
      detectionModifier,
      captureModifier,
      successPenalty,
      nodeRiskById,
      districtRiskById,
      hunterFieldByNodeId: new Map((hunterState.detection_fields || []).map((entry) => [entry.node_id, entry])),
      ...counterActions._internal,
    },
  };
}

function buildAgentRiskIndicators(agents, pressureSnapshot, nowMs = Date.now()) {
  const networkHeat = pressureSnapshot?.network_heat?.value || 0;
  const sam = pressureSnapshot?.sam_awareness || {};
  return (agents || []).map((agent) => {
    const recoveryLocked = agent.status === 'captured' && parseSqliteTimestamp(agent.captured_until) > nowMs;
    const currentDistrictId = CONTROL_NODE_BY_ID.get(agent.current_node_id)?.districtId || agent.home_district_id || '';
    const counterAction = resolveCounterActionContext(pressureSnapshot, agent.current_node_id, currentDistrictId);
    const risk = clamp(
      Math.round((Number(agent.heat) || 0) * 0.72)
        + (agent.status === 'exposed' ? 18 : 0)
        + (agent.status === 'captured' ? 28 : 0)
        + Math.round(networkHeat * 0.22)
        + ((Number(agent.capture_count) || 0) * 6),
      0,
      100,
    );
    return {
      agent_id: agent.id,
      status: agent.status,
      risk,
      pressure_label: pressureLabel(risk),
      detection_modifier: clamp(
        Math.floor((risk / 18) + (Number(sam.detection_modifier) || 0))
          + (Number(counterAction.nodeScan?.modifiers?.detection_shift) || 0),
        0,
        16,
      ),
      capture_modifier: clamp(
        Math.floor((risk / 20) + (Number(sam.capture_modifier) || 0))
          + (Number(counterAction.localTrace?.modifiers?.capture_shift) || 0),
        0,
        14,
      ),
      captured_until: agent.captured_until || null,
      recovery_locked: recoveryLocked,
      boost_active: isBoostActive(agent, nowMs),
      recovery_urgency: recoveryLocked && (counterAction.nodeScan || counterAction.localTrace || counterAction.routeDisruption || counterAction.hunterField) ? 'urgent' : 'normal',
      active_counter_actions: activeCounterActionIds(counterAction),
    };
  });
}

async function logSamPressureIfNeeded(db, telegramId, actionType, pressureSnapshot, metadata = {}) {
  const sensitivity = Number(pressureSnapshot?.sam_awareness?.sensitivity) || 0;
  if (sensitivity < 20 && !(pressureSnapshot?.sam_awareness?.pressure_flags || []).length) return;
  await logProgressionEvent(db, telegramId, 'covert_sam_pressure', actionType, 0, 0, {
    sensitivity,
    detection_modifier: pressureSnapshot?.sam_awareness?.detection_modifier || 0,
    capture_modifier: pressureSnapshot?.sam_awareness?.capture_modifier || 0,
    pressure_flags: pressureSnapshot?.sam_awareness?.pressure_flags || [],
    elevated_zones: pressureSnapshot?.sam_awareness?.elevated_zones || [],
    ...metadata,
  });
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

function buildSamCounterActions(options = {}) {
  const {
    networkHeat = 0,
    sensitivity = 0,
    nodeEntries = [],
    districtSignals = [],
    districtAgentClusters = new Map(),
    nowMs = Date.now(),
  } = options;

  const nodeScanByNodeId = new Map();
  const localTraceByDistrictId = new Map();
  const routeDisruptionByDistrictId = new Map();
  const nodeScans = [];
  const localTraces = [];
  const routeDisruptions = [];

  for (const entry of nodeEntries) {
    const scanScore = clamp(
      Number(entry.risk || 0)
        + (Number(entry.repeated_targeting || 0) * 4)
        + (Number(entry.sabotage_pressure || 0) * 3)
        + (Number(entry.sam_pressure || 0) * 2)
        + (networkHeat >= 45 ? 3 : 0)
        + (sensitivity >= 40 ? 3 : 0),
      0,
      40,
    );
    const window = activeCounterWindow(entry.last_activity_at, NODE_SCAN_DURATION_MS, nowMs);
    if (!window || scanScore < 14) continue;
    const action = {
      id: `node-scan:${entry.node_id}`,
      type: 'node_scan',
      severity: counterActionSeverity(scanScore),
      score: scanScore,
      node_id: entry.node_id,
      district_id: entry.district_id,
      warning: `Node ${String(entry.node_id || '').toUpperCase()} under SAM scan`,
      modifiers: {
        success_penalty: clamp(Math.floor(scanScore / 4), 2, 8),
        detection_shift: clamp(Math.floor(scanScore / 5), 2, 7),
        capture_shift: clamp(Math.floor(scanScore / 7), 1, 5),
        node_pressure_delta: scanScore >= 22 ? 2 : 1,
        stealth_tolerance_penalty: clamp(Math.floor(scanScore / 4), 2, 8),
      },
      ...window,
    };
    nodeScans.push(action);
    nodeScanByNodeId.set(action.node_id, action);
  }

  for (const district of districtSignals) {
    const cluster = districtAgentClusters.get(district.district_id) || {
      active_agents: 0,
      exposed_agents: 0,
      captured_agents: 0,
      avg_heat: 0,
      repeated_targeting: 0,
      hottest_node_ids: [],
      last_activity_at: district.last_activity_at || null,
    };
    const traceScore = clamp(
      Number(district.instability || 0)
        + (Number(district.sabotage_pressure || 0) * 3)
        + (Number(district.sam_watch || 0) * 2)
        + (Number(cluster.exposed_agents || 0) * 5)
        + (Number(cluster.captured_agents || 0) * 6)
        + Math.floor((Number(cluster.avg_heat) || 0) * 0.16)
        + (networkHeat >= 50 ? 4 : 0)
        + (sensitivity >= 45 ? 4 : 0),
      0,
      48,
    );
    const traceWindow = activeCounterWindow(
      cluster.last_activity_at || district.last_activity_at,
      LOCAL_TRACE_DURATION_MS,
      nowMs,
    );
    if (traceWindow && traceScore >= 18) {
      const action = {
        id: `local-trace:${district.district_id}`,
        type: 'local_trace',
        severity: counterActionSeverity(traceScore),
        score: traceScore,
        district_id: district.district_id,
        affected_node_ids: Array.isArray(cluster.hottest_node_ids) ? cluster.hottest_node_ids.slice(0, 4) : [],
        warning: `${String(district.district_id || '').replace(/-/g, ' ')} under trace`,
        modifiers: {
          success_penalty: clamp(Math.floor(traceScore / 6), 2, 7),
          detection_shift: clamp(Math.floor(traceScore / 4), 3, 9),
          capture_shift: clamp(Math.floor(traceScore / 5), 2, 8),
          exposed_capture_bonus: cluster.exposed_agents > 0 ? 4 : 2,
          district_pressure_delta: traceScore >= 28 ? 2 : 1,
        },
        ...traceWindow,
      };
      localTraces.push(action);
      localTraceByDistrictId.set(action.district_id, action);
    }

    const routeScore = clamp(
      Number(district.instability || 0)
        + (Number(district.sabotage_pressure || 0) * 4)
        + (Number(cluster.repeated_targeting || 0) * 4)
        + (Number(cluster.active_agents || 0) * 2)
        + (Number(cluster.captured_agents || 0) * 3)
        + (networkHeat >= 40 ? 3 : 0)
        + (sensitivity >= 38 ? 3 : 0),
      0,
      48,
    );
    const routeWindow = activeCounterWindow(
      cluster.last_activity_at || district.last_activity_at,
      ROUTE_DISRUPTION_DURATION_MS,
      nowMs,
    );
    if (!routeWindow || routeScore < 16) continue;
    const action = {
      id: `route-disruption:${district.district_id}`,
      type: 'route_disruption',
      severity: counterActionSeverity(routeScore),
      score: routeScore,
      district_id: district.district_id,
      affected_node_ids: Array.isArray(cluster.hottest_node_ids) ? cluster.hottest_node_ids.slice(0, 5) : [],
      warning: `Routes compromised in ${String(district.district_id || '').replace(/-/g, ' ')}`,
      modifiers: {
        deploy_delay_ms: clamp((routeScore - 12) * 15000, 60000, 240000),
        success_penalty: clamp(Math.floor(routeScore / 8), 1, 6),
        retask_heat_penalty: clamp(Math.floor(routeScore / 7), 1, 5),
        emergency_extract_heat_penalty: clamp(Math.floor(routeScore / 9), 1, 4),
        extract_heat_penalty: clamp(Math.floor(routeScore / 11), 1, 3),
      },
      ...routeWindow,
    };
    routeDisruptions.push(action);
    routeDisruptionByDistrictId.set(action.district_id, action);
  }

  const allActions = [...nodeScans, ...localTraces, ...routeDisruptions]
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  const primary = allActions[0] || null;

  return {
    node_scans: nodeScans,
    local_traces: localTraces,
    route_disruptions: routeDisruptions,
    summary: {
      active_count: allActions.length,
      node_scan_count: nodeScans.length,
      local_trace_count: localTraces.length,
      route_disruption_count: routeDisruptions.length,
      active_districts: [...new Set(allActions.map((action) => action.district_id).filter(Boolean))],
      primary_action_type: primary?.type || null,
      primary_action_label: primary?.warning || null,
    },
    _internal: {
      nodeScanByNodeId,
      localTraceByDistrictId,
      routeDisruptionByDistrictId,
    },
  };
}

function buildHunterUnits(options = {}) {
  const {
    networkHeat = 0,
    sensitivity = 0,
    nodeEntries = [],
    districtSignals = [],
    districtAgentClusters = new Map(),
    counterActions = {},
    nowMs = Date.now(),
  } = options;

  const nodeScans = Array.isArray(counterActions?.node_scans) ? counterActions.node_scans : [];
  const localTraces = Array.isArray(counterActions?.local_traces) ? counterActions.local_traces : [];
  const routeDisruptions = Array.isArray(counterActions?.route_disruptions) ? counterActions.route_disruptions : [];
  const traceByDistrictId = new Map(localTraces.map((entry) => [entry.district_id, entry]));
  const routeByDistrictId = new Map(routeDisruptions.map((entry) => [entry.district_id, entry]));
  const scanByNodeId = new Map(nodeScans.map((entry) => [entry.node_id, entry]));
  const districtSignalById = new Map((districtSignals || []).map((entry) => [entry.district_id, entry]));
  const districtCounts = new Map();

  const candidateEntries = (nodeEntries || [])
    .map((entry) => {
      const districtSignal = districtSignalById.get(entry.district_id) || null;
      const cluster = districtAgentClusters.get(entry.district_id) || {};
      const trace = traceByDistrictId.get(entry.district_id) || null;
      const route = routeByDistrictId.get(entry.district_id) || null;
      const scan = scanByNodeId.get(entry.node_id) || null;
      const score = clamp(
        Number(entry.risk || 0)
          + (Number(entry.repeated_targeting || 0) * 4)
          + (Number(entry.recent_failures || 0) * 3)
          + (Number(entry.recent_captures || 0) * 6)
          + (Number(entry.sabotage_pressure || 0) * 3)
          + (trace ? 8 : 0)
          + (route ? 6 : 0)
          + (scan ? 5 : 0)
          + Math.floor((Number(cluster.avg_heat) || 0) * 0.08)
          + (Number(cluster.active_agents) || 0)
          + (networkHeat >= 45 ? 4 : 0)
          + (sensitivity >= 40 ? 4 : 0),
        0,
        80,
      );
      return {
        ...entry,
        districtSignal,
        cluster,
        trace,
        route,
        scan,
        score,
      };
    })
    .filter((entry) => entry.score >= 16)
    .sort((left, right) => sortByValueDescThenKey(left, right, 'score', 'node_id'));

  const desiredCount = Math.min(
    HUNTER_GLOBAL_CAP,
    Math.max(
      0,
      Math.floor((networkHeat + sensitivity) / 55)
      + (localTraces.length > 0 ? 1 : 0)
      + (routeDisruptions.length > 1 ? 1 : 0)
      + (candidateEntries[0]?.score >= 28 ? 1 : 0),
    ),
  );

  if (!desiredCount) {
    return { hunter_units: [], detection_fields: [], summary: { active_count: 0, dangerous_node_ids: [], district_ids: [] } };
  }

  const hunterUnits = [];
  let slot = 0;
  for (const entry of candidateEntries) {
    if (hunterUnits.length >= desiredCount) break;
    const districtCount = districtCounts.get(entry.district_id) || 0;
    if (districtCount >= HUNTER_DISTRICT_CAP) continue;
    districtCounts.set(entry.district_id, districtCount + 1);

    const widerRange = networkHeat >= 65 || sensitivity >= 60;
    const routeNodeIds = sampleHunterNodeIds(entry, entry.districtSignal, entry.cluster, {
      widerRange,
      traceNodes: entry.trace?.affected_node_ids || [],
      routeNodes: entry.route?.affected_node_ids || [],
    });
    const routeSize = Math.max(1, routeNodeIds.length);
    const timeBucket = Math.floor(nowMs / (HUNTER_IDLE_MIN_MS + HUNTER_IDLE_RANGE_MS));
    const routeIndex = Math.abs(timeBucket + slot + String(entry.node_id || '').length) % routeSize;
    const currentNodeId = routeNodeIds[routeIndex] || entry.node_id;
    const nextNodeId = routeNodeIds[(routeIndex + 1) % routeSize] || currentNodeId;
    const pathNodeIds = shortestPathNodeIds(currentNodeId, nextNodeId);
    const idleEvery = entry.trace || entry.route ? 4 : 3;
    const idle = ((timeBucket + slot) % idleEvery) === 0;
    const intensity = clamp(
      Math.ceil(entry.score / 6)
        + (entry.trace ? 2 : 0)
        + (entry.scan ? 1 : 0),
      4,
      12,
    );
    hunterUnits.push({
      id: `hunter:${entry.district_id}:${slot + 1}`,
      label: 'SAM Hunter',
      district_id: entry.district_id,
      anchor_node_id: entry.node_id,
      current_node_id: currentNodeId,
      next_node_id: nextNodeId,
      path_node_ids: pathNodeIds,
      route_node_ids: routeNodeIds,
      patrol_style: entry.trace ? 'trace_loop' : entry.route ? 'disruption_hold' : widerRange ? 'wide_sweep' : 'tight_loop',
      source_flags: [
        entry.scan ? 'node_scan' : '',
        entry.trace ? 'local_trace' : '',
        entry.route ? 'route_disruption' : '',
        Number(entry.repeated_targeting || 0) > 0 ? 'repeat_targeting' : '',
      ].filter(Boolean),
      detection_radius_steps: widerRange ? 2 : 1,
      intensity,
      idle,
      idle_until: idle ? isoTimestamp(nowMs + HUNTER_IDLE_MIN_MS + ((slot % 3) * HUNTER_IDLE_RANGE_MS)) : null,
      glyph: entry.trace ? 'trace' : entry.route ? 'route' : 'scan',
      warning: `SAM patrol sweeping ${String(entry.district_id || '').replace(/-/g, ' ')}`,
    });
    slot += 1;
  }

  const detectionFields = buildHunterDetectionMap(hunterUnits);
  return {
    hunter_units: hunterUnits,
    detection_fields: detectionFields,
    summary: {
      active_count: hunterUnits.length,
      dangerous_node_ids: detectionFields.slice(0, 6).map((entry) => entry.node_id),
      district_ids: [...new Set(hunterUnits.map((entry) => entry.district_id).filter(Boolean))],
    },
  };
}

function resolveCounterActionContext(pressureSnapshot, nodeId, districtId) {
  const internal = pressureSnapshot?._internal || {};
  return {
    nodeScan: internal.nodeScanByNodeId?.get(nodeId) || null,
    localTrace: internal.localTraceByDistrictId?.get(districtId) || null,
    routeDisruption: internal.routeDisruptionByDistrictId?.get(districtId) || null,
    hunterField: internal.hunterFieldByNodeId?.get(nodeId) || null,
  };
}

function activeCounterActionIds(context = {}) {
  return [context.nodeScan, context.localTrace, context.routeDisruption, context.hunterField]
    .filter(Boolean)
    .map((action) => action.id || `hunter-field:${action.node_id}`);
}

function computeResolution(agent, operation, pressure, pressureSnapshot, nowMs = Date.now()) {
  const config = configForAgentType(agent.agent_type);
  const networkHeat = clamp(Number(pressureSnapshot?.network_heat?.value) || 0, 0, 100);
  const sam = pressureSnapshot?.sam_awareness || {};
  const nodeRisk = pressureSnapshot?._internal?.nodeRiskById?.get(operation.target_node_id)?.risk || 0;
  const node = CONTROL_NODE_BY_ID.get(operation.target_node_id);
  const districtInstability = pressureSnapshot?._internal?.districtRiskById?.get(node?.districtId)?.instability || 0;
  const counterAction = resolveCounterActionContext(pressureSnapshot, operation.target_node_id, node?.districtId || '');
  const nodeScanPenalty = Number(counterAction.nodeScan?.modifiers?.success_penalty) || 0;
  const tracePenalty = Number(counterAction.localTrace?.modifiers?.success_penalty) || 0;
  const routePenalty = Number(counterAction.routeDisruption?.modifiers?.success_penalty) || 0;
  const hunterPenalty = Number(counterAction.hunterField?.modifiers?.success_penalty) || 0;
  const detectionShift =
    (Number(counterAction.nodeScan?.modifiers?.detection_shift) || 0)
    + (Number(counterAction.localTrace?.modifiers?.detection_shift) || 0)
    + (Number(counterAction.hunterField?.modifiers?.detection_shift) || 0);
  const captureShift =
    (Number(counterAction.nodeScan?.modifiers?.capture_shift) || 0)
    + (Number(counterAction.localTrace?.modifiers?.capture_shift) || 0)
    + (Number(counterAction.hunterField?.modifiers?.capture_shift) || 0)
    + (agent.status === 'exposed' ? (Number(counterAction.localTrace?.modifiers?.exposed_capture_bonus) || 0) : 0);
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
      - Math.floor(networkHeat * 0.14)
      - (Number(sam.success_penalty) || 0)
      - nodeScanPenalty
      - tracePenalty
      - routePenalty
      - hunterPenalty
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
      + Math.floor(networkHeat * 0.12)
      + (Number(sam.detection_modifier) || 0)
      + Math.floor(nodeRisk * 0.35)
      - detectionShift
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
      + Math.floor(networkHeat * 0.09)
      + (Number(sam.capture_modifier) || 0)
      + Math.floor(nodeRisk * 0.25)
      + Math.floor(districtInstability * 0.15)
      - captureShift
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
  let capturedUntil = null;
  let captureDurationMs = 0;
  let captureExtended = false;

  if (captured) {
    status = 'critical_failure';
    agentStatus = 'captured';
    heatAfter = heatBefore + config.captureHeat;
    rewardXp = 0;
    rewardGems = 0;
    deltas.districtPressure = 1 + (networkHeat >= 60 ? 1 : 0) + (Number(counterAction.localTrace?.modifiers?.district_pressure_delta) || 0);
    deltas.samPressure = 2 + ((Number(sam.capture_modifier) || 0) >= 3 ? 1 : 0) + (counterAction.nodeScan ? 1 : 0);
    deltas.localRisk = 4;
    captureDurationMs = computeCaptureCooldownMs(agent, networkHeat);
    capturedUntil = sqliteTimestamp(nowMs + captureDurationMs);
    captureExtended = (Number(agent.capture_count) || 0) > 0 || networkHeat >= 45 || heatBefore >= 55;
  } else if (succeeded) {
    const sabotageEscalation = config.operationType === 'sabotage' && (nodeRisk >= 9 || networkHeat >= 55) ? 1 : 0;
    const recruiterRelief = config.operationType === 'recruit' ? 1 : 0;
    deltas.nodeInterference = config.world.nodeInterference + (networkHeat >= 60 ? 1 : 0) + sabotageEscalation;
    deltas.districtSupport = config.world.districtSupport + recruiterRelief;
    deltas.districtPressure =
      config.world.districtPressure
      + sabotageEscalation
      - recruiterRelief
      + (Number(counterAction.nodeScan?.modifiers?.node_pressure_delta) || 0);
    deltas.factionPressure = config.world.factionPressure;
    deltas.samPressure =
      config.world.samPressure
      + (networkHeat >= 50 ? 1 : 0)
      + (counterAction.localTrace ? 1 : 0);
    deltas.localRisk = config.operationType === 'sabotage' ? 2 : config.operationType === 'recruit' ? 0 : deltas.localRisk;
  } else {
    deltas.districtPressure = 1 + (networkHeat >= 50 ? 1 : 0) + (counterAction.localTrace ? 1 : 0);
    deltas.samPressure = 1 + ((Number(sam.detection_modifier) || 0) >= 3 ? 1 : 0) + (counterAction.nodeScan ? 1 : 0);
    deltas.localRisk = (exposed ? 3 : 2) + (counterAction.routeDisruption ? 1 : 0) + (counterAction.hunterField ? 1 : 0);
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
    capturedUntil,
    captureDurationMs,
    captureExtended,
    deltas,
    pressure,
    operationType: operation.operation_type || config.operationType,
  };
}

async function resolveDueCovertOperations(db, telegramId) {
  const active = await db.prepare(`
    SELECT o.*, a.agent_type, a.stealth, a.resilience, a.loyalty, a.heat, a.stealth_boost_until,
           a.capture_count, a.captured_until
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
    const progression = await getOrCreateBlockTopiaProgression(db, telegramId);
    const pressureSnapshot = await loadCovertPressureSnapshot(db, telegramId, progression);
    const pressure = await recentTargetPressure(db, node);
    const outcome = computeResolution(row, row, pressure, pressureSnapshot);
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
          assigned_operation = NULL, assigned_until = NULL, captured_until = ?,
          capture_count = CASE WHEN ? = 'captured' THEN COALESCE(capture_count, 0) + 1 ELSE COALESCE(capture_count, 0) END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND telegram_id = ?
    `).bind(
      outcome.heatAfter,
      outcome.agentStatus,
      outcome.agentStatus,
      outcome.capturedUntil,
      outcome.agentStatus,
      row.agent_id,
      telegramId,
    ).run();

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
      network_heat: pressureSnapshot?.network_heat?.value || 0,
      local_pressure: outcome.pressure,
      world_effect: worldEffect,
      captured_until: outcome.capturedUntil,
      capture_duration_ms: outcome.captureDurationMs,
    };
    await logProgressionEvent(db, telegramId, action, row.target_node_id, outcome.rewardXp, outcome.rewardGems, metadata);
    if (outcome.agentStatus === 'exposed') {
      await logProgressionEvent(db, telegramId, 'covert_exposed', row.target_node_id, 0, 0, metadata);
    }
    if (outcome.agentStatus === 'captured') {
      await logProgressionEvent(db, telegramId, 'covert_capture', row.target_node_id, 0, 0, metadata);
      if (outcome.captureExtended) {
        await logProgressionEvent(db, telegramId, 'covert_capture_extended', row.target_node_id, 0, 0, metadata);
      }
    }
    const networkHeatDelta = clamp(
      (outcome.status === 'critical_failure' ? 12 : outcome.status === 'failed' ? 6 : 3)
        + (row.agent_type === 'saboteur' ? 2 : 0)
        + (outcome.agentStatus === 'exposed' ? 3 : 0)
        - (row.agent_type === 'recruiter' && outcome.status === 'success' ? 2 : 0),
      -4,
      16,
    );
    await updateNetworkHeat(db, telegramId, {
      delta: networkHeatDelta,
      reason: `operation_${outcome.status}`,
      actionType: outcome.operationType,
      metadata: {
        operation_id: row.id,
        agent_id: row.agent_id,
        node_id: row.target_node_id,
        world_effect: worldEffect,
      },
    });
    await logSamPressureIfNeeded(db, telegramId, outcome.operationType, pressureSnapshot, {
      operation_id: row.id,
      node_id: row.target_node_id,
      outcome: outcome.status,
    });

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
      captured_until: outcome.capturedUntil,
    });
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
  const pressureSnapshot = await loadCovertPressureSnapshot(db, telegramId, progression);
  const publicAgents = (agents.results || []).map(publicAgent);
  return {
    agents: publicAgents,
    operations: (operations.results || []).map(publicOperation),
    network_heat: pressureSnapshot.network_heat,
    sam_awareness: pressureSnapshot.sam_awareness,
    local_node_risk: pressureSnapshot.local_node_risk,
    district_instability_signals: pressureSnapshot.district_instability_signals,
    counter_actions: {
      node_scans: pressureSnapshot.counter_actions?.node_scans || [],
      local_traces: pressureSnapshot.counter_actions?.local_traces || [],
      route_disruptions: pressureSnapshot.counter_actions?.route_disruptions || [],
      summary: pressureSnapshot.counter_actions?.summary || {},
    },
    hunter_units: pressureSnapshot.hunter_units || [],
    hunter_detection_fields: pressureSnapshot.hunter_detection_fields || [],
    agent_risk_indicators: buildAgentRiskIndicators(publicAgents, pressureSnapshot),
    local_risk_indicators: pressureSnapshot.local_node_risk.map((entry) => ({
      node_id: entry.node_id,
      district_id: entry.district_id,
      local_risk: entry.risk,
    })),
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

  if (path === '/blocktopia/covert/state' && request.method === 'POST') {
    const parsed = await readJsonBody(request, err);
    if (parsed.response) return parsed.response;
    const body = parsed.body;
    const verified = await verifyTelegramIdentityFromBody(body, env, helpers.verifyTelegramAuth);
    if (verified.error) return err(verified.error, verified.status || 401);
    await helpers.upsertTelegramUser(env.DB, verified.user).catch(() => {});
    await applyCovertDecayForUser(env.DB, verified.telegramId);
    const resolved = await resolveDueCovertOperations(env.DB, verified.telegramId);
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, costs: covertCosts(), resolved: resolved.map(publicOperation), ...state });
  }

  if (request.method !== 'POST') return err('Method not allowed', 405);
  const auth = await authenticateCovertRequest(request, env, helpers);
  if (auth.response) return auth.response;
  const { body, verified } = auth;
  await applyCovertDecayForUser(env.DB, verified.telegramId);
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
    await updateNetworkHeat(env.DB, verified.telegramId, {
      delta: agentType === 'saboteur' ? 3 : 1,
      reason: 'agent_created',
      actionType: agentType,
      metadata: { agent_id: agentId },
    });
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
    if (agent.status === 'captured') {
      const lockedUntil = parseSqliteTimestamp(agent.captured_until);
      if (lockedUntil > Date.now()) return err('Captured agents must wait out recovery or use a gem recovery action', 409);
      return err('Captured agents must be recovered before redeploying', 409);
    }
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
    const pressureBeforeDeploy = await loadCovertPressureSnapshot(env.DB, verified.telegramId);
    const counterAction = resolveCounterActionContext(pressureBeforeDeploy, node.id, node.districtId);
    const deployDelayMs =
      (Number(counterAction.routeDisruption?.modifiers?.deploy_delay_ms) || 0)
      + (Number(counterAction.hunterField?.modifiers?.operation_delay_ms) || 0);
    const spend = await spendGems(env.DB, verified.telegramId, config.deployCost, 'Progression changed. Please retry covert deploy.');
    if (!spend.ok) return err(spend.message === 'Not enough gems' ? `Not enough gems to deploy ${agent.agent_type}` : spend.message, spend.status);

    const operationId = crypto.randomUUID();
    const resolvesAt = sqliteTimestamp(Date.now() + BLOCKTOPIA_COVERT_OPERATION_MS + deployDelayMs);
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
      counter_actions: activeCounterActionIds(counterAction),
      route_delay_ms: deployDelayMs,
    });
    await updateNetworkHeat(env.DB, verified.telegramId, {
      delta: 4 + Number(activeCount?.n || 0) + (agent.agent_type === 'saboteur' ? 2 : 0),
      reason: 'deploy',
      actionType: config.operationType,
      metadata: {
        agent_id: agentId,
        operation_id: operationId,
        node_id: node.id,
      },
    });
    const pressureSnapshot = await loadCovertPressureSnapshot(env.DB, verified.telegramId);
    await logSamPressureIfNeeded(env.DB, verified.telegramId, config.operationType, pressureSnapshot, {
      agent_id: agentId,
      operation_id: operationId,
      node_id: node.id,
    });
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: config.deployCost, operation_id: operationId, resolves_at: resolvesAt, ...state });
  }

  if (path === '/blocktopia/covert/extract' || path === '/blocktopia/covert/emergency-extract') {
    const agentId = String(body?.agent_id || body?.agentId || '').trim();
    const emergency = path === '/blocktopia/covert/emergency-extract' || body?.emergency === true;
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
    const extractCost = !midOperation ? 0 : emergency ? BLOCKTOPIA_COVERT_EMERGENCY_EXTRACT_COST : BLOCKTOPIA_COVERT_EXTRACT_COST;
    if (extractCost > 0) {
      const spend = await spendGems(env.DB, verified.telegramId, extractCost, 'Progression changed. Please retry covert extract.');
      if (!spend.ok) return err(spend.message === 'Not enough gems' ? 'Not enough gems to extract agent' : spend.message, spend.status);
    }

    const config = configForAgentType(agent.agent_type);
    const targetNode = CONTROL_NODE_BY_ID.get(operation.target_node_id);
    const pressureForExtract = await loadCovertPressureSnapshot(env.DB, verified.telegramId);
    const counterAction = resolveCounterActionContext(
      pressureForExtract,
      operation.target_node_id,
      targetNode?.districtId || agent.home_district_id || '',
    );
    const routeHeatPenalty = emergency
      ? (Number(counterAction.routeDisruption?.modifiers?.emergency_extract_heat_penalty) || 0)
      : (Number(counterAction.routeDisruption?.modifiers?.extract_heat_penalty) || 0);
    const hunterExtractPenalty = Number(counterAction.hunterField?.modifiers?.extract_risk_shift) || 0;
    const heatAfter = clamp(
      (Number(agent.heat) || 0)
        + config.extractHeat
        + routeHeatPenalty
        + hunterExtractPenalty
        - (emergency ? EMERGENCY_EXTRACT_HEAT_RELIEF : 0),
      0,
      100,
    );
    const localRiskDelta = (emergency ? 0 : 1) + (counterAction.localTrace ? 1 : 0);
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE blocktopia_covert_operations
        SET status = 'failed', heat_after = ?, local_risk_delta = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_id = ? AND status = 'active'
      `).bind(heatAfter, localRiskDelta, operation.id, verified.telegramId),
      env.DB.prepare(`
        UPDATE blocktopia_covert_agents
        SET status = 'idle', current_node_id = NULL, assigned_operation = NULL,
            assigned_until = NULL, heat = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_id = ?
      `).bind(heatAfter, agentId, verified.telegramId),
    ]);
    await logProgressionEvent(env.DB, verified.telegramId, emergency ? 'covert_emergency_extract' : 'covert_extract', operation.target_node_id, 0, -extractCost, {
      agent_id: agentId,
      operation_id: operation.id,
      mid_operation: midOperation,
      heat_after: heatAfter,
      emergency,
      counter_actions: activeCounterActionIds(counterAction),
    });
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_failure', operation.target_node_id, 0, 0, {
      agent_id: agentId,
      operation_id: operation.id,
      reason: emergency ? 'emergency_extract' : 'manual_extract',
      local_risk_delta: localRiskDelta,
      counter_actions: activeCounterActionIds(counterAction),
    });
    await updateNetworkHeat(env.DB, verified.telegramId, {
      delta: emergency ? -EMERGENCY_EXTRACT_NETWORK_RELIEF : 2,
      reason: emergency ? 'emergency_extract' : 'extract',
      actionType: operation.operation_type,
      metadata: {
        agent_id: agentId,
        operation_id: operation.id,
        node_id: operation.target_node_id,
      },
    });
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: extractCost, emergency, ...state });
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
          stealth_boost_until = NULL, captured_until = NULL,
          recovery_count = COALESCE(recovery_count, 0) + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND telegram_id = ? AND status = 'captured'
    `).bind(agentId, verified.telegramId).run();
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_revive', agent.agent_type || 'infiltrator', 0, -BLOCKTOPIA_COVERT_REVIVE_COST, {
      agent_id: agentId,
      previous_node_id: agent.current_node_id || null,
      captured_until: agent.captured_until || null,
    });
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_recovery', agent.agent_type || 'infiltrator', 0, 0, {
      agent_id: agentId,
      manual: true,
      previous_captured_until: agent.captured_until || null,
    });
    await updateNetworkHeat(env.DB, verified.telegramId, {
      delta: -4,
      reason: 'manual_recovery',
      actionType: agent.agent_type || 'infiltrator',
      metadata: { agent_id: agentId },
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
    await updateNetworkHeat(env.DB, verified.telegramId, {
      delta: -2,
      reason: 'stealth_boost',
      actionType: agent.agent_type || 'infiltrator',
      metadata: { agent_id: agentId, boost_until: boostUntil },
    });
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: BLOCKTOPIA_COVERT_STEALTH_BOOST_COST, boost_until: boostUntil, ...state });
  }

  if (path === '/blocktopia/covert/reduce-heat') {
    const agentId = String(body?.agent_id || body?.agentId || '').trim();
    let agent = null;
    if (agentId) {
      agent = await env.DB.prepare(`
        SELECT *
        FROM blocktopia_covert_agents
        WHERE id = ? AND telegram_id = ?
        LIMIT 1
      `).bind(agentId, verified.telegramId).first();
      if (!agent) return err('Agent not found', 404);
      if (agent.status === 'captured') return err('Captured agents cannot use heat relief directly', 409);
    }
    const spend = await spendGems(env.DB, verified.telegramId, BLOCKTOPIA_COVERT_HEAT_RELIEF_COST, 'Progression changed. Please retry covert heat relief.');
    if (!spend.ok) return err(spend.message === 'Not enough gems' ? 'Not enough gems to reduce covert heat' : spend.message, spend.status);

    if (agent) {
      const heatAfter = clamp((Number(agent.heat) || 0) - AGENT_HEAT_RELIEF, 0, 100);
      const statusAfter = agent.status === 'exposed' && heatAfter < 50 ? 'idle' : agent.status;
      await env.DB.prepare(`
        UPDATE blocktopia_covert_agents
        SET heat = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_id = ?
      `).bind(heatAfter, statusAfter, agentId, verified.telegramId).run();
    }
    await updateNetworkHeat(env.DB, verified.telegramId, {
      delta: -NETWORK_HEAT_RELIEF,
      reason: 'gem_heat_relief',
      actionType: agent?.agent_type || 'network',
      metadata: { agent_id: agentId || null },
    });
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_reduce_heat', agent?.agent_type || 'network', 0, -BLOCKTOPIA_COVERT_HEAT_RELIEF_COST, {
      agent_id: agentId || null,
      network_heat_reduction: NETWORK_HEAT_RELIEF,
      agent_heat_reduction: agent ? AGENT_HEAT_RELIEF : 0,
    });
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: BLOCKTOPIA_COVERT_HEAT_RELIEF_COST, ...state });
  }

  if (path === '/blocktopia/covert/recovery-boost') {
    const agentId = String(body?.agent_id || body?.agentId || '').trim();
    if (!agentId) return err('agent_id required', 400);
    const agent = await env.DB.prepare(`
      SELECT *
      FROM blocktopia_covert_agents
      WHERE id = ? AND telegram_id = ?
      LIMIT 1
    `).bind(agentId, verified.telegramId).first();
    if (!agent) return err('Agent not found', 404);
    if (agent.status !== 'captured') return err('Only captured agents can reduce recovery timers', 409);

    const spend = await spendGems(env.DB, verified.telegramId, BLOCKTOPIA_COVERT_RECOVERY_ACCELERATION_COST, 'Progression changed. Please retry covert recovery boost.');
    if (!spend.ok) return err(spend.message === 'Not enough gems' ? 'Not enough gems to accelerate recovery' : spend.message, spend.status);

    const currentUntilMs = parseSqliteTimestamp(agent.captured_until);
    const nextUntilMs = currentUntilMs > 0 ? Math.max(Date.now(), currentUntilMs - RECOVERY_ACCELERATION_MS) : Date.now();
    const nextUntil = sqliteTimestamp(nextUntilMs);
    await env.DB.prepare(`
      UPDATE blocktopia_covert_agents
      SET captured_until = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND telegram_id = ? AND status = 'captured'
    `).bind(nextUntil, agentId, verified.telegramId).run();
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_recovery_boost', agent.agent_type || 'infiltrator', 0, -BLOCKTOPIA_COVERT_RECOVERY_ACCELERATION_COST, {
      agent_id: agentId,
      previous_captured_until: agent.captured_until || null,
      captured_until: nextUntil,
      acceleration_ms: RECOVERY_ACCELERATION_MS,
    });
    await updateNetworkHeat(env.DB, verified.telegramId, {
      delta: -5,
      reason: 'recovery_boost',
      actionType: agent.agent_type || 'infiltrator',
      metadata: { agent_id: agentId },
    });
    await recoverReadyCapturedAgents(env.DB, verified.telegramId);
    const state = await loadCovertState(env.DB, verified.telegramId);
    return json({ ok: true, cost_paid: BLOCKTOPIA_COVERT_RECOVERY_ACCELERATION_COST, captured_until: nextUntil, ...state });
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
    const pressureBeforeRetask = await loadCovertPressureSnapshot(env.DB, verified.telegramId);
    const counterAction = resolveCounterActionContext(pressureBeforeRetask, node.id, node.districtId);
    const retaskHeatPenalty = Number(counterAction.routeDisruption?.modifiers?.retask_heat_penalty) || 0;
    const retaskDelayMs =
      (Number(counterAction.routeDisruption?.modifiers?.deploy_delay_ms) || 0)
      + (Number(counterAction.hunterField?.modifiers?.operation_delay_ms) || 0);
    const nextResolveMs = Math.max(Date.now(), parseSqliteTimestamp(operation.resolves_at)) + retaskDelayMs;
    const nextResolveAt = sqliteTimestamp(nextResolveMs);
    const heatAfter = clamp(
      (Number(agent.heat) || 0)
        + config.retaskHeat
        + retaskHeatPenalty
        + (Number(counterAction.hunterField?.modifiers?.extract_risk_shift) || 0),
      0,
      100,
    );
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE blocktopia_covert_operations
        SET target_node_id = ?, heat_after = ?, resolves_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_id = ? AND status = 'active'
      `).bind(node.id, heatAfter, nextResolveAt, operation.id, verified.telegramId),
      env.DB.prepare(`
        UPDATE blocktopia_covert_agents
        SET heat = ?, current_node_id = ?, home_district_id = COALESCE(home_district_id, ?), assigned_until = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_id = ? AND status = 'active'
      `).bind(heatAfter, node.id, node.districtId, nextResolveAt, agentId, verified.telegramId),
    ]);
    await logProgressionEvent(env.DB, verified.telegramId, 'covert_retask', node.id, 0, -BLOCKTOPIA_COVERT_RETASK_COST, {
      agent_id: agentId,
      operation_id: operation.id,
      previous_node_id: operation.target_node_id,
      heat_after: heatAfter,
      resolves_at: nextResolveAt,
      counter_actions: activeCounterActionIds(counterAction),
    });
    await updateNetworkHeat(env.DB, verified.telegramId, {
      delta: 4 + (agent.agent_type === 'saboteur' ? 2 : 0),
      reason: 'retask',
      actionType: agent.agent_type || 'infiltrator',
      metadata: {
        agent_id: agentId,
        operation_id: operation.id,
        previous_node_id: operation.target_node_id,
        node_id: node.id,
      },
    });
    const pressureSnapshot = await loadCovertPressureSnapshot(env.DB, verified.telegramId);
    await logSamPressureIfNeeded(env.DB, verified.telegramId, 'retask', pressureSnapshot, {
      agent_id: agentId,
      operation_id: operation.id,
      previous_node_id: operation.target_node_id,
      node_id: node.id,
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
    emergency_extract: BLOCKTOPIA_COVERT_EMERGENCY_EXTRACT_COST,
    revive: BLOCKTOPIA_COVERT_REVIVE_COST,
    recover: BLOCKTOPIA_COVERT_REVIVE_COST,
    stealth_boost: BLOCKTOPIA_COVERT_STEALTH_BOOST_COST,
    reduce_heat: BLOCKTOPIA_COVERT_HEAT_RELIEF_COST,
    recovery_boost: BLOCKTOPIA_COVERT_RECOVERY_ACCELERATION_COST,
    retask: BLOCKTOPIA_COVERT_RETASK_COST,
    reroll: BLOCKTOPIA_COVERT_RETASK_COST,
    operation_ms: BLOCKTOPIA_COVERT_OPERATION_MS,
    heat_decay_interval_ms: HEAT_DECAY_INTERVAL_MS,
    network_heat_decay_interval_ms: NETWORK_HEAT_DECAY_INTERVAL_MS,
    stealth_boost_ms: BOOST_MS,
  };
}
