const LOCAL_PULSE_MS = 850;
const SERVER_UPDATE_PULSE_MS = 550;
const DEFAULT_STATUS = 'stable';
const ACTIVE_STATUS = new Set(['contested', 'unstable', 'cooldown']);

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

function sanitizeStatus(value) {
  if (value === 'contested' || value === 'unstable' || value === 'cooldown') {
    return value;
  }
  return DEFAULT_STATUS;
}

export function createNodeInterferenceSystem(state) {
  const nodes = Array.isArray(state?.controlNodes) ? state.controlNodes : [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const activeNodeIds = new Set();

  function getNode(nodeId) {
    return nodesById.get(nodeId) || null;
  }

  function trackNodeActivity(node, now = Date.now()) {
    if (!node?.id) return;
    const pulseUntil = Number(node.pulseUntil) || 0;
    const cooldownUntil = Number(node.cooldownUntil) || 0;
    const status = sanitizeStatus(node.status);
    if (pulseUntil > now || cooldownUntil > now || ACTIVE_STATUS.has(status)) {
      activeNodeIds.add(node.id);
    } else {
      activeNodeIds.delete(node.id);
    }
  }

  function canInterfere(nodeId, now = Date.now()) {
    const node = getNode(nodeId);
    if (!node) return false;
    return (Number(node.cooldownUntil) || 0) <= now;
  }

  function beginLocalInterference(nodeId, playerId, now = Date.now()) {
    if (!canInterfere(nodeId, now)) return null;
    const node = getNode(nodeId);
    if (!node) return null;
    node.pulseUntil = now + LOCAL_PULSE_MS;
    node.lastInterferedBy = playerId || node.lastInterferedBy || null;
    if (node.status === DEFAULT_STATUS) node.status = 'contested';
    trackNodeActivity(node, now);
    return {
      nodeId: node.id,
      districtId: node.districtId || '',
      sourcePlayerId: playerId || '',
      localOnly: true,
      status: node.status,
      pulseUntil: node.pulseUntil,
      feedLines: [`⚡ NODE ${node.id.toUpperCase()} INTERFERENCE ATTEMPT`],
    };
  }

  function applyServerNodeUpdate(payload = {}, options = {}) {
    const node = getNode(payload.nodeId);
    if (!node) return null;
    const now = Date.now();

    if (payload.owner !== undefined) node.owner = payload.owner;
    if (payload.lastInterferedBy !== undefined) node.lastInterferedBy = payload.lastInterferedBy;
    if (payload.sourcePlayerId !== undefined) node.lastInterferedBy = payload.sourcePlayerId;
    if (payload.interference !== undefined) node.interference = clampPercent(payload.interference);
    if (payload.control !== undefined) node.control = clampPercent(payload.control);
    if (payload.status !== undefined) node.status = sanitizeStatus(payload.status);
    if (payload.cooldownUntil !== undefined) {
      node.cooldownUntil = Number(payload.cooldownUntil) || 0;
    }
    if (payload.pulseUntil !== undefined) {
      node.pulseUntil = Number(payload.pulseUntil) || 0;
    } else if (!options.silent) {
      node.pulseUntil = Math.max(Number(node.pulseUntil) || 0, now + SERVER_UPDATE_PULSE_MS);
    }

    trackNodeActivity(node, now);

    if (options.silent) return null;

    const eventPayload = {
      nodeId: node.id,
      districtId: payload.districtId || node.districtId || '',
      nodeX: Number.isFinite(payload.nodeX) ? Number(payload.nodeX) : node.x,
      nodeY: Number.isFinite(payload.nodeY) ? Number(payload.nodeY) : node.y,
      interference: node.interference,
      control: node.control,
      owner: node.owner,
      status: node.status,
      cooldownUntil: node.cooldownUntil,
      sourcePlayerId: payload.sourcePlayerId || node.lastInterferedBy || '',
      samPressureDelta: Number(payload.samPressureDelta) || 0,
      districtControl: Number(payload.districtControl),
      districtOwner: payload.districtOwner || '',
      samPressure: Number(payload.samPressure),
      localOnly: false,
      feedLines: [],
    };

    eventPayload.feedLines.push(`⚡ NODE ${node.id.toUpperCase()} INTERFERED`);
    if (eventPayload.status === 'unstable') {
      eventPayload.feedLines.push('📡 SIGNAL INSTABILITY DETECTED');
    } else if (eventPayload.status === 'cooldown') {
      eventPayload.feedLines.push('🧯 NODE COOLDOWN STABILISING');
    } else {
      eventPayload.feedLines.push('🏙️ DISTRICT PRESSURE SHIFTING');
    }
    if (eventPayload.samPressureDelta > 0) {
      eventPayload.feedLines.push('🧠 SAM NOISE RISING');
    }

    return eventPayload;
  }

  function getNodeState(nodeId) {
    return getNode(nodeId);
  }

  function tick(dt, hooks = {}) {
    if (!activeNodeIds.size) return;
    const now = Date.now();
    for (const nodeId of [...activeNodeIds]) {
      const node = getNode(nodeId);
      if (!node) {
        activeNodeIds.delete(nodeId);
        continue;
      }
      if (node.status === 'cooldown' && (Number(node.cooldownUntil) || 0) <= now) {
        node.status = DEFAULT_STATUS;
      }
      if ((Number(node.cooldownUntil) || 0) <= now && (Number(node.pulseUntil) || 0) <= now && !ACTIVE_STATUS.has(node.status)) {
        activeNodeIds.delete(nodeId);
        hooks.onNodeSettled?.(node);
      } else {
        trackNodeActivity(node, now);
      }
    }
  }

  return {
    canInterfere,
    beginLocalInterference,
    applyServerNodeUpdate,
    getNodeState,
    tick,
  };
}
