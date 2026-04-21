const HUNTER_ACTIVITY_WINDOW_MS = 90 * 1000;
const HUNTER_ACTIVITY_LIMIT = 80;

export const HUNTER_MODE_CONFIG = Object.freeze({
  patrol: {
    detectionRadius: 1,
    intensity: 3,
    moveSpeed: 0.55,
    idleMs: 900,
    watchLabel: 'watched',
  },
  'scan-focus': {
    detectionRadius: 2,
    intensity: 5,
    moveSpeed: 0.68,
    idleMs: 650,
    watchLabel: 'swept',
  },
  'trace-response': {
    detectionRadius: 3,
    intensity: 7,
    moveSpeed: 0.82,
    idleMs: 450,
    watchLabel: 'traced',
  },
  'route-watch': {
    detectionRadius: 2,
    intensity: 6,
    moveSpeed: 0.72,
    idleMs: 520,
    watchLabel: 'watched',
  },
  'cool-down': {
    detectionRadius: 1,
    intensity: 2,
    moveSpeed: 0.42,
    idleMs: 1500,
    watchLabel: 'cooling',
  },
  idle: {
    detectionRadius: 1,
    intensity: 1,
    moveSpeed: 0.36,
    idleMs: 1800,
    watchLabel: 'cooling',
  },
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function recentActivities(activities = [], nowMs = Date.now()) {
  return activities
    .filter((entry) => entry && (nowMs - Number(entry.at || 0)) <= HUNTER_ACTIVITY_WINDOW_MS)
    .slice(-HUNTER_ACTIVITY_LIMIT);
}

function computeNodeRisk(node, activityHits = 0) {
  const interference = Number(node?.interference) || 0;
  const instability = Number(node?.samInstability) || 0;
  const conflict = Number(node?.conflictLevel) || 0;
  const recruitment = Number(node?.recruitmentLevel) || 0;
  const unstableBonus = node?.status === 'unstable' ? 16 : node?.status === 'contested' ? 8 : 0;
  const warBonus = node?.warState === 'fighting'
    ? 12
    : node?.warState === 'contesting'
      ? 8
      : node?.warState === 'retreating'
        ? 6
        : 0;
  return clamp(
    (interference * 0.42)
    + (instability * 0.58)
    + (conflict * 0.22)
    + (recruitment * 0.16)
    + unstableBonus
    + warBonus
    + (activityHits * 9),
    0,
    100,
  );
}

function patrolModeForDistrict(district, districtScore, hottestNodeHits, districtActivityWeight) {
  if ((hottestNodeHits >= 3 && districtActivityWeight >= 4) || districtScore >= 76) return 'trace-response';
  if (hottestNodeHits >= 2 || districtActivityWeight >= 5.5) return 'route-watch';
  if ((Number(district?.instability) || 0) >= 46 || districtScore >= 52) return 'scan-focus';
  if (districtScore <= 16) return 'cool-down';
  return 'patrol';
}

export function trimHunterActivities(activities = [], nowMs = Date.now()) {
  return recentActivities(activities, nowMs);
}

export function buildDistrictPatrolPlans({
  districts = [],
  controlNodes = [],
  activities = [],
  nowMs = Date.now(),
}) {
  const byDistrict = new Map();
  const nodeHits = new Map();
  const districtWeights = new Map();

  for (const district of districts) {
    byDistrict.set(district.id, []);
    districtWeights.set(district.id, 0);
  }
  for (const node of controlNodes) {
    const list = byDistrict.get(node.districtId) || [];
    list.push(node);
    byDistrict.set(node.districtId, list);
  }

  for (const entry of recentActivities(activities, nowMs)) {
    const districtId = String(entry?.districtId || '');
    const nodeId = String(entry?.nodeId || '');
    const weight = Math.max(0.5, Number(entry?.weight) || 1);
    if (districtId) districtWeights.set(districtId, (districtWeights.get(districtId) || 0) + weight);
    if (nodeId) nodeHits.set(nodeId, (nodeHits.get(nodeId) || 0) + weight);
  }

  return districts.map((district) => {
    const nodes = byDistrict.get(district.id) || [];
    const scoredNodes = nodes
      .map((node) => ({
        nodeId: node.id,
        districtId: district.id,
        riskScore: computeNodeRisk(node, nodeHits.get(node.id) || 0),
        recentHits: Number(nodeHits.get(node.id) || 0),
      }))
      .sort((left, right) => right.riskScore - left.riskScore || left.nodeId.localeCompare(right.nodeId));
    const focusNodeIds = unique(scoredNodes.slice(0, 4).map((entry) => entry.nodeId));
    const districtActivityWeight = districtWeights.get(district.id) || 0;
    const repeatedTarget = scoredNodes.find((entry) => entry.recentHits >= 2);
    const districtScore = clamp(
      ((Number(district?.instability) || 0) * 0.52)
      + ((Number(scoredNodes[0]?.riskScore) || 0) * 0.48)
      + (districtActivityWeight * 5.4)
      + (repeatedTarget ? 10 : 0)
      + (district?.controlState === 'collapsing' ? 14 : district?.controlState === 'unstable' ? 8 : 0),
      0,
      100,
    );
    const patrolMode = patrolModeForDistrict(
      district,
      districtScore,
      Number(repeatedTarget?.recentHits) || 0,
      districtActivityWeight,
    );
    return {
      districtId: district.id,
      districtName: district.name,
      patrolMode,
      pressureScore: districtScore,
      focusNodeId: focusNodeIds[0] || nodes[0]?.id || '',
      focusNodeIds,
      hottestNodeId: focusNodeIds[0] || '',
      repeatedTargetNodeId: repeatedTarget?.nodeId || '',
      activityWeight: Number(districtActivityWeight.toFixed(2)),
      instability: Number(district?.instability) || 0,
      watchLabel: HUNTER_MODE_CONFIG[patrolMode]?.watchLabel || patrolMode,
      activeHunters: 0,
    };
  }).sort((left, right) => right.pressureScore - left.pressureScore || left.districtId.localeCompare(right.districtId));
}

export function buildHunterAssignmentQueue(patrolPlans = [], hunterCount = 0) {
  const queue = [];
  const plans = patrolPlans.filter((entry) => entry?.districtId);
  if (!plans.length || hunterCount <= 0) return queue;

  for (const plan of plans) {
    if (plan.pressureScore >= 18 || queue.length === 0) queue.push(plan.districtId);
  }
  if ((plans[0]?.pressureScore || 0) >= 64) queue.push(plans[0].districtId);
  if ((plans[1]?.pressureScore || 0) >= 54) queue.push(plans[1].districtId);

  let cursor = 0;
  while (queue.length < hunterCount) {
    queue.push(plans[cursor % plans.length].districtId);
    cursor += 1;
  }
  return queue.slice(0, hunterCount);
}

export function buildHunterDetectionFields({ hunters = [], controlNodes = [], shortestNodeDistance }) {
  const byNodeId = new Map();
  for (const hunter of hunters) {
    if (!hunter?.active) continue;
    const routeNodeIds = unique([
      hunter.currentNodeId,
      hunter.targetNodeId,
      ...(Array.isArray(hunter.routeNodeIds) ? hunter.routeNodeIds : []),
    ]);
    const detectionRadius = Math.max(1, Number(hunter.detectionRadius) || 1);
    for (const node of controlNodes) {
      let nearest = Infinity;
      for (const routeNodeId of routeNodeIds) {
        nearest = Math.min(nearest, shortestNodeDistance(routeNodeId, node.id, detectionRadius + 2));
      }
      if (!Number.isFinite(nearest) || nearest > detectionRadius) continue;
      const intensity = clamp((Number(hunter.intensity) || 0) - (nearest * 1.4), 0, 9);
      if (intensity <= 0) continue;
      const existing = byNodeId.get(node.id) || {
        node_id: node.id,
        district_id: node.districtId,
        intensity: 0,
        patrol_mode: hunter.patrolMode,
        hunter_ids: [],
        nearest_steps: nearest,
      };
      existing.intensity = Math.max(existing.intensity, Number(intensity.toFixed(2)));
      existing.patrol_mode = intensity >= existing.intensity ? hunter.patrolMode : existing.patrol_mode;
      existing.nearest_steps = Math.min(existing.nearest_steps, nearest);
      existing.hunter_ids = unique([...existing.hunter_ids, hunter.id]);
      byNodeId.set(node.id, existing);
    }
  }
  return [...byNodeId.values()]
    .sort((left, right) => right.intensity - left.intensity || left.node_id.localeCompare(right.node_id));
}
