const LOCAL_PULSE_MS = 850;
const SERVER_UPDATE_PULSE_MS = 550;
const DEFAULT_STATUS = 'stable';
const ACTIVE_STATUS = new Set(['contested', 'unstable', 'cooldown']);

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

function clampSignedPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-100, Math.min(100, number));
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

  // beginLocalPulse: purely visual optimistic feedback — sets only the pulse ring timer.
  // Node status, interference, control, cooldown, and ownership are server-authoritative
  // and must only be written via applyServerNodeUpdate (from nodeInterferenceChanged or
  // worldSnapshot). This function must NOT set any shared-state fields.
  function beginLocalPulse(nodeId, now = Date.now()) {
    if (!canInterfere(nodeId, now)) return null;
    const node = getNode(nodeId);
    if (!node) return null;
    node.pulseUntil = now + LOCAL_PULSE_MS;
    trackNodeActivity(node, now);
    return { nodeId: node.id, localOnly: true, pulseUntil: node.pulseUntil };
  }

  function applyServerNodeUpdate(payload = {}, options = {}) {
    const node = getNode(payload.nodeId);
    if (!node) return null;
    const now = Date.now();

    if (payload.owner !== undefined) node.owner = payload.owner;
    if (payload.lastInterferedBy !== undefined || payload.sourcePlayerId !== undefined) {
      node.lastInterferedBy = payload.sourcePlayerId ?? payload.lastInterferedBy ?? node.lastInterferedBy;
    }
    if (payload.interference !== undefined) node.interference = clampPercent(payload.interference);
    if (payload.control !== undefined) node.control = clampSignedPercent(payload.control);
    if (payload.status !== undefined) node.status = sanitizeStatus(payload.status);
    if (payload.warState !== undefined) node.warState = String(payload.warState || 'patrolling');
    if (payload.contestedBy !== undefined) node.contestedBy = payload.contestedBy;
    if (payload.conflictLevel !== undefined) node.conflictLevel = clampPercent(payload.conflictLevel);
    if (payload.recruitmentLevel !== undefined) node.recruitmentLevel = clampPercent(payload.recruitmentLevel);
    if (payload.samInstability !== undefined) node.samInstability = clampPercent(payload.samInstability);
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
      warState: node.warState || 'patrolling',
      contestedBy: node.contestedBy || null,
      conflictLevel: Number(node.conflictLevel) || 0,
      recruitmentLevel: Number(node.recruitmentLevel) || 0,
      samInstability: Number(node.samInstability) || 0,
      cooldownUntil: node.cooldownUntil,
      sourcePlayerId: payload.sourcePlayerId || node.lastInterferedBy || '',
      samPressureDelta: Number(payload.samPressureDelta) || 0,
      districtControl: Number(payload.districtControl),
      districtOwner: payload.districtOwner || '',
      samPressure: Number(payload.samPressure),
      localOnly: false,
      feedLines: [],
    };

    eventPayload.feedLines.push(`⚡ Node ${node.id.toUpperCase()} interference confirmed`);
    if (eventPayload.warState === 'fighting') {
      eventPayload.feedLines.push('⚔️ Active faction fighting registered at this node');
    } else if (eventPayload.warState === 'reinforcing') {
      eventPayload.feedLines.push('🚚 Reinforcement traffic detected on the corridor');
    } else if (eventPayload.status === 'unstable') {
      eventPayload.feedLines.push('📡 Network instability escalating around control lanes');
    } else if (eventPayload.status === 'cooldown') {
      eventPayload.feedLines.push('🧯 Node stabilization protocol active');
    } else {
      eventPayload.feedLines.push('🏙️ District pressure reroute in progress');
    }
    if (eventPayload.samPressureDelta > 0) {
      eventPayload.feedLines.push('🧠 SAM pressure index rising');
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
    beginLocalPulse,
    applyServerNodeUpdate,
    getNodeState,
    tick,
  };
}
