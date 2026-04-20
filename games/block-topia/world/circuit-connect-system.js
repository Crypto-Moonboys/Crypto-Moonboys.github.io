import { CONTROL_LINKS } from './control-grid.js';

const TRIGGER_MIN_DELAY_MS = 90000;
const TRIGGER_MAX_DELAY_MS = 170000;
const TRIGGER_ROLL_INTERVAL_MS = 12000;
const TRIGGER_CHANCE = 0.22;
const ALERT_MS = 3200;
const EVENT_MIN_MS = 30000;
const EVENT_MAX_MS = 120000;
const NPC_ASSIGN_INTERVAL_MS = 3200;
const NPC_EFFECT_COOLDOWN_MS = 7000;
const FRACTURE_SPREAD_INTERVAL_MS = 7000;
const MIN_WIN_INTEGRITY = 72;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function choose(items = []) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] || null;
}

function edgeKey(aId, bId) {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function buildGraph(nodes = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map();
  const edges = new Map();
  for (const link of CONTROL_LINKS) {
    const a = link?.from?.id;
    const b = link?.to?.id;
    if (!a || !b || !byId.has(a) || !byId.has(b)) continue;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
    edges.set(edgeKey(a, b), { id: edgeKey(a, b), aId: a, bId: b });
  }
  return { byId, adjacency, edges };
}

function connectedComponents(nodeIds, adjacency, edgeMeta) {
  const unvisited = new Set(nodeIds);
  const comps = [];
  while (unvisited.size) {
    const start = unvisited.values().next().value;
    const queue = [start];
    const nodes = [];
    unvisited.delete(start);
    while (queue.length) {
      const id = queue.shift();
      nodes.push(id);
      for (const next of adjacency.get(id) || []) {
        const meta = edgeMeta.get(edgeKey(id, next));
        if (!meta || meta.state === 'broken') continue;
        if (unvisited.has(next)) {
          unvisited.delete(next);
          queue.push(next);
        }
      }
    }
    comps.push(nodes);
  }
  return comps;
}

function shortestPath(adjacency, startId, endId, edgeMeta) {
  if (!startId || !endId) return null;
  if (startId === endId) return [startId];
  const queue = [startId];
  const prev = new Map();
  const seen = new Set([startId]);
  while (queue.length) {
    const id = queue.shift();
    if (id === endId) break;
    for (const next of adjacency.get(id) || []) {
      if (seen.has(next)) continue;
      const meta = edgeMeta.get(edgeKey(id, next));
      if (!meta || meta.state === 'broken') continue;
      seen.add(next);
      prev.set(next, id);
      queue.push(next);
    }
  }
  if (!prev.has(endId)) return null;
  const path = [endId];
  let cursor = endId;
  while (cursor !== startId) {
    cursor = prev.get(cursor);
    if (!cursor) return null;
    path.push(cursor);
  }
  return path.reverse();
}

export function createCircuitConnectSystem(state) {
  const nodes = Array.isArray(state?.controlNodes) ? state.controlNodes : [];
  const { byId, adjacency, edges } = buildGraph(nodes);

  const runtime = {
    active: false,
    status: 'idle',
    startedAt: 0,
    alertUntil: 0,
    endsAt: 0,
    triggerCheckAt: Date.now() + TRIGGER_MIN_DELAY_MS,
    eventIndex: 0,
    selectedNodeId: nodes[0]?.id || '',
    objectives: [],
    fractureTypes: [],
    linkMeta: new Map(),
    integrity: 100,
    instability: 0,
    spreadAt: 0,
    npcAssistAt: 0,
    npcActors: [],
    logs: [],
    supportCharges: 0,
  };

  state.circuitConnect = runtime;

  function log(text) {
    runtime.logs.unshift({ at: Date.now(), text });
    while (runtime.logs.length > 10) runtime.logs.pop();
  }

  function getEdgeMeta(id) {
    if (!runtime.linkMeta.has(id)) {
      runtime.linkMeta.set(id, { id, state: 'stable', until: 0, strength: 1, fragile: false });
    }
    return runtime.linkMeta.get(id);
  }

  function setEdgeState(id, stateId, until = 0) {
    const meta = getEdgeMeta(id);
    meta.state = stateId;
    meta.until = until;
    if (stateId === 'reinforced') {
      meta.strength = 2;
      meta.fragile = false;
    } else if (stateId === 'bridge') {
      meta.strength = 0.9;
      meta.fragile = true;
    } else if (stateId === 'unstable') {
      meta.strength = 0.7;
      meta.fragile = true;
    } else if (stateId === 'broken') {
      meta.strength = 0;
      meta.fragile = true;
    } else {
      meta.strength = 1;
      meta.fragile = false;
    }
  }

  function resetEdges() {
    runtime.linkMeta.clear();
    for (const id of edges.keys()) {
      setEdgeState(id, 'stable');
    }
  }

  function setNodeDecor() {
    if (!runtime.active) {
      for (const node of nodes) delete node.circuitConnect;
      return;
    }
    const components = connectedComponents(nodes.map((n) => n.id), adjacency, runtime.linkMeta);
    const main = components.sort((a, b) => b.length - a.length)[0] || [];
    const inMain = new Set(main);

    for (const node of nodes) {
      node.circuitConnect = {
        active: true,
        selected: runtime.selectedNodeId === node.id,
        isolated: !inMain.has(node.id),
        critical: runtime.objectives.some((obj) => obj.fromId === node.id || obj.toId === node.id),
      };
    }
  }

  function fractureAtStart() {
    runtime.fractureTypes = [];
    const districts = [...new Set(nodes.map((n) => n.districtId).filter(Boolean))];

    const isolatedDistrict = choose(districts) || districts[0] || '';
    const clusterNodes = nodes.filter((n) => n.districtId === isolatedDistrict).slice(0, 4);
    const clusterSet = new Set(clusterNodes.map((n) => n.id));
    const boundary = [];
    for (const node of clusterNodes) {
      for (const next of adjacency.get(node.id) || []) {
        if (!clusterSet.has(next)) boundary.push(edgeKey(node.id, next));
      }
    }
    for (const edgeId of boundary.slice(0, 3)) setEdgeState(edgeId, 'broken');
    if (boundary.length) runtime.fractureTypes.push('district_isolation');

    const keyNodes = ['core', 'north', 'south', 'east', 'west'].filter((id) => byId.has(id));
    const keyA = choose(keyNodes) || nodes[0]?.id;
    const keyB = choose(keyNodes.filter((id) => id !== keyA)) || nodes[1]?.id;
    const path = shortestPath(adjacency, keyA, keyB, runtime.linkMeta) || [];
    if (path.length > 2) {
      const breakIdx = Math.floor(path.length / 2) - 1;
      setEdgeState(edgeKey(path[breakIdx], path[breakIdx + 1]), 'broken');
      runtime.fractureTypes.push('backbone_cut');
    }

    const unstableSeed = choose([...edges.values()]);
    if (unstableSeed) {
      setEdgeState(unstableSeed.id, 'unstable');
      const neighbors = [...(adjacency.get(unstableSeed.aId) || [])].slice(0, 1);
      for (const next of neighbors) setEdgeState(edgeKey(unstableSeed.aId, next), 'unstable');
      runtime.fractureTypes.push('unstable_corridor');
    }
  }

  function buildObjectives(now) {
    const keyNodes = ['core', 'north', 'south', 'east', 'west'].filter((id) => byId.has(id));
    const pairA = choose(keyNodes) || nodes[0]?.id;
    const pairB = choose(keyNodes.filter((id) => id !== pairA)) || nodes[1]?.id;

    const comps = connectedComponents(nodes.map((n) => n.id), adjacency, runtime.linkMeta)
      .sort((a, b) => b.length - a.length);
    const isolatedCluster = comps[1] || comps[0] || [];
    const clusterNode = isolatedCluster[0] || nodes[0]?.id;
    const mainNode = (comps[0] || [])[0] || nodes[1]?.id;

    const unstableEdge = [...runtime.linkMeta.values()].find((meta) => meta.state === 'unstable');
    const unstable = edges.get(unstableEdge?.id || '') || [...edges.values()][0];

    runtime.objectives = [
      {
        id: 'reconnect_cluster',
        type: 'reconnect_cluster',
        label: `Reconnect isolated cluster ${String(clusterNode || '').toUpperCase()} → ${String(mainNode || '').toUpperCase()}`,
        fromId: clusterNode,
        toId: mainNode,
        complete: false,
        deadlineAt: now + 52000,
      },
      {
        id: 'critical_path',
        type: 'restore_critical_path',
        label: `Restore key path ${String(pairA || '').toUpperCase()} ↔ ${String(pairB || '').toUpperCase()}`,
        fromId: pairA,
        toId: pairB,
        complete: false,
        deadlineAt: now + 72000,
      },
      {
        id: 'stabilize_corridor',
        type: 'stabilize_corridor',
        label: `Stabilize corridor ${String(unstable?.aId || '').toUpperCase()} ↔ ${String(unstable?.bId || '').toUpperCase()}`,
        edgeId: unstable?.id,
        complete: false,
        deadlineAt: now + 62000,
      },
      {
        id: 'integrity_floor',
        type: 'minimum_integrity',
        label: `Maintain network integrity above ${MIN_WIN_INTEGRITY}%`,
        complete: false,
        deadlineAt: now + EVENT_MAX_MS,
      },
    ];
  }

  function beginEvent(hooks = {}) {
    const now = Date.now();
    runtime.active = true;
    runtime.status = 'alert';
    runtime.startedAt = now;
    runtime.alertUntil = now + ALERT_MS;
    runtime.endsAt = now + EVENT_MAX_MS;
    runtime.eventIndex += 1;
    runtime.selectedNodeId = nodes[0]?.id || '';
    runtime.logs = [];
    runtime.npcActors = [];
    runtime.supportCharges = 2;
    runtime.instability = 0;
    runtime.integrity = 100;
    runtime.spreadAt = now + FRACTURE_SPREAD_INTERVAL_MS;
    runtime.npcAssistAt = now;

    resetEdges();
    fractureAtStart();
    buildObjectives(now);
    setNodeDecor();
    log('CIRCUIT BREACH — RECONNECT THE NODES');
    hooks.onStart?.({ message: 'CIRCUIT BREACH — RECONNECT THE NODES' });
  }

  function clearNpcMissions() {
    const active = state?.npc?.entities || [];
    for (const npc of active) {
      if (npc?.networkMission?.event === 'circuit-connect') {
        delete npc.networkMission;
      }
    }
  }

  function clearEvent() {
    runtime.active = false;
    runtime.status = 'idle';
    runtime.objectives = [];
    runtime.linkMeta.clear();
    runtime.npcActors = [];
    runtime.fractureTypes = [];
    runtime.triggerCheckAt = Date.now() + TRIGGER_MIN_DELAY_MS + Math.random() * (TRIGGER_MAX_DELAY_MS - TRIGGER_MIN_DELAY_MS);
    clearNpcMissions();
    setNodeDecor();
  }

  function pathConnected(fromId, toId) {
    const path = shortestPath(adjacency, fromId, toId, runtime.linkMeta);
    return Boolean(path && path.length > 1);
  }

  function updateObjectives(now) {
    for (const obj of runtime.objectives) {
      if (obj.type === 'reconnect_cluster' || obj.type === 'restore_critical_path') {
        obj.complete = pathConnected(obj.fromId, obj.toId);
      } else if (obj.type === 'stabilize_corridor') {
        const meta = runtime.linkMeta.get(obj.edgeId);
        obj.complete = Boolean(meta && (meta.state === 'stable' || meta.state === 'reinforced'));
      } else if (obj.type === 'minimum_integrity') {
        obj.complete = runtime.integrity >= MIN_WIN_INTEGRITY;
      }
      obj.timeLeftMs = Math.max(0, obj.deadlineAt - now);
    }
  }

  function updateIntegrity() {
    const values = [...runtime.linkMeta.values()];
    const brokenCount = values.filter((m) => m.state === 'broken').length;
    const unstableCount = values.filter((m) => m.state === 'unstable').length;
    const fragileCount = values.filter((m) => m.fragile).length;
    const components = connectedComponents(nodes.map((n) => n.id), adjacency, runtime.linkMeta)
      .sort((a, b) => b.length - a.length);
    const isolatedNodes = components.slice(1).reduce((sum, comp) => sum + comp.length, 0);

    runtime.instability = clamp(
      (isolatedNodes * 0.12) + (brokenCount * 0.08) + (unstableCount * 0.06) + (fragileCount * 0.02),
      0,
      1.5,
    );
    runtime.integrity = clamp(100 - (runtime.instability * 52), 0, 100);

    return {
      brokenCount,
      unstableCount,
      isolatedNodes,
    };
  }

  function spreadFracture(now, hooks = {}) {
    if (now < runtime.spreadAt) return;
    runtime.spreadAt = now + FRACTURE_SPREAD_INTERVAL_MS;
    const unstableEdges = [...runtime.linkMeta.values()].filter((meta) => meta.state === 'unstable' || meta.state === 'broken');
    const seed = choose(unstableEdges);
    if (!seed) return;

    const candidate = edges.get(seed.id);
    if (!candidate) return;
    const neighborhood = [
      ...(adjacency.get(candidate.aId) || []),
      ...(adjacency.get(candidate.bId) || []),
    ].map((id) => edgeKey(candidate.aId, id)).concat(
      [...(adjacency.get(candidate.bId) || [])].map((id) => edgeKey(candidate.bId, id)),
    );
    const nextEdgeId = choose(neighborhood.filter((id) => runtime.linkMeta.get(id)?.state === 'stable'));
    if (!nextEdgeId) return;
    setEdgeState(nextEdgeId, Math.random() < 0.45 ? 'broken' : 'unstable');
    log(`Fracture spread to ${nextEdgeId.toUpperCase()}`);
    hooks.onPressure?.({ edgeId: nextEdgeId });
  }

  function findWorstAdjacent(nodeId, states = ['broken', 'unstable']) {
    const neighbors = [...(adjacency.get(nodeId) || [])];
    const candidates = neighbors
      .map((id) => ({ id, key: edgeKey(nodeId, id), meta: runtime.linkMeta.get(edgeKey(nodeId, id)) }))
      .filter((entry) => entry.meta && states.includes(entry.meta.state))
      .sort((a, b) => (a.meta.state === 'broken' ? -1 : 1));
    return candidates[0] || null;
  }

  function ensureSelected(nodeId) {
    if (!nodeId || !byId.has(nodeId)) return { ok: false, reason: 'Select a valid control node first.' };
    runtime.selectedNodeId = nodeId;
    return { ok: true };
  }

  function reconnectLink(nodeId) {
    const selected = ensureSelected(nodeId);
    if (!selected.ok) return selected;
    const target = findWorstAdjacent(nodeId, ['broken']);
    if (!target) return { ok: false, reason: 'No broken adjacent link to reconnect.' };
    setEdgeState(target.key, 'stable');
    log(`Link reconnected ${target.key.toUpperCase()}`);
    return { ok: true };
  }

  function stabilizeLink(nodeId) {
    const selected = ensureSelected(nodeId);
    if (!selected.ok) return selected;
    const target = findWorstAdjacent(nodeId, ['unstable', 'broken']);
    if (!target) return { ok: false, reason: 'No unstable corridor near selected node.' };
    setEdgeState(target.key, 'stable');
    log(`Link stabilized ${target.key.toUpperCase()}`);
    return { ok: true };
  }

  function reroute(nodeId) {
    const selected = ensureSelected(nodeId);
    if (!selected.ok) return selected;
    runtime.instability = Math.max(0, runtime.instability - 0.08);
    runtime.integrity = clamp(runtime.integrity + 4, 0, 100);
    log(`Reroute through ${nodeId.toUpperCase()} reduced spread pressure`);
    return { ok: true };
  }

  function deployBridge(nodeId) {
    const selected = ensureSelected(nodeId);
    if (!selected.ok) return selected;
    if (runtime.supportCharges <= 0) return { ok: false, reason: 'No bridge charges left. Wait for recruiter support.' };
    const target = findWorstAdjacent(nodeId, ['broken']);
    if (!target) return { ok: false, reason: 'No broken adjacent link to bridge.' };
    runtime.supportCharges -= 1;
    setEdgeState(target.key, 'bridge', Date.now() + 14000);
    log(`Temporary bridge active ${target.key.toUpperCase()}`);
    return { ok: true };
  }

  function reinforceLink(nodeId) {
    const selected = ensureSelected(nodeId);
    if (!selected.ok) return selected;
    const neighbors = [...(adjacency.get(nodeId) || [])]
      .map((id) => edgeKey(nodeId, id))
      .filter((id) => {
        const meta = runtime.linkMeta.get(id);
        return meta && (meta.state === 'stable' || meta.state === 'bridge');
      });
    const target = choose(neighbors);
    if (!target) return { ok: false, reason: 'No active adjacent link to reinforce.' };
    setEdgeState(target, 'reinforced');
    runtime.integrity = clamp(runtime.integrity + 2, 0, 100);
    log(`Connection reinforced ${target.toUpperCase()}`);
    return { ok: true };
  }

  function assignNpcActors(now) {
    if (now < runtime.npcAssistAt) return;
    runtime.npcAssistAt = now + NPC_ASSIGN_INTERVAL_MS;

    const activeNpcs = (state?.npc?.entities || []).filter((npc) => npc?.mode === 'active');
    if (!activeNpcs.length) return;

    const roles = [
      { role: 'courier', sourceRoles: ['agent', 'vendor'], effect: 'signal_shuttle' },
      { role: 'agent', sourceRoles: ['agent'], effect: 'route_reveal' },
      { role: 'fighter', sourceRoles: ['fighter'], effect: 'zone_secure' },
      { role: 'recruiter', sourceRoles: ['recruiter'], effect: 'repair_team' },
    ];

    runtime.npcActors = roles.map((entry) => {
      const npc = activeNpcs.find((n) => entry.sourceRoles.includes(n.role));
      const objective = choose(runtime.objectives.filter((obj) => !obj.complete && obj.fromId && obj.toId));
      if (!npc || !objective) return null;
      const path = shortestPath(adjacency, objective.fromId, objective.toId, runtime.linkMeta)
        || [objective.fromId, objective.toId].filter(Boolean);
      if (path.length < 2) return null;
      npc.networkMission = {
        event: 'circuit-connect',
        pathNodeIds: path,
        speed: 0.42,
        startedAt: now,
      };
      return {
        npcId: npc.id,
        role: entry.role,
        effect: entry.effect,
        path,
        objectiveId: objective.id,
        cooldownUntil: now + NPC_EFFECT_COOLDOWN_MS,
      };
    }).filter(Boolean);
  }

  function stepNpcSupport(now, hooks = {}) {
    const actorByNpc = new Map(runtime.npcActors.map((a) => [a.npcId, a]));
    const npcs = state?.npc?.entities || [];

    for (const npc of npcs) {
      const actor = actorByNpc.get(npc.id);
      if (!actor || now < actor.cooldownUntil) continue;
      actor.cooldownUntil = now + NPC_EFFECT_COOLDOWN_MS;

      if (actor.effect === 'signal_shuttle') {
        const broken = [...runtime.linkMeta.values()].find((m) => m.state === 'broken');
        if (broken) setEdgeState(broken.id, 'unstable');
        hooks.onNpc?.({ type: 'courier', text: 'Courier delivered reconnection payload' });
      } else if (actor.effect === 'route_reveal') {
        const unstable = [...runtime.linkMeta.values()].find((m) => m.state === 'unstable');
        if (unstable) setEdgeState(unstable.id, 'stable');
        hooks.onNpc?.({ type: 'agent', text: 'Agent revealed optimal recovery route' });
      } else if (actor.effect === 'zone_secure') {
        const unstableEdges = [...runtime.linkMeta.values()].filter((m) => m.state === 'unstable');
        const pick = choose(unstableEdges);
        if (pick) setEdgeState(pick.id, 'reinforced');
        hooks.onNpc?.({ type: 'fighter', text: 'Fighter secured unstable corridor' });
      } else if (actor.effect === 'repair_team') {
        runtime.supportCharges += 1;
        runtime.integrity = clamp(runtime.integrity + 3, 0, 100);
        hooks.onNpc?.({ type: 'recruiter', text: 'Recruiter deployed temporary repair team' });
      }
    }
  }

  function resolve(hooks, outcome) {
    if (outcome === 'success') {
      hooks.onResolve?.({
        outcome,
        rewardXp: 58 + Math.round(runtime.integrity * 0.18),
        rewardGems: 8,
        stabilityBuffMs: 80000,
      });
    } else {
      hooks.onResolve?.({
        outcome,
        districtInstabilityPenalty: 8,
        nodeStressPenalty: 10,
        samPressureDelta: 12,
      });
    }
    clearEvent();
  }

  function tickEdgeDurations(now) {
    for (const meta of runtime.linkMeta.values()) {
      if (meta.until > 0 && now >= meta.until) {
        if (meta.state === 'bridge') setEdgeState(meta.id, 'unstable');
        else setEdgeState(meta.id, 'stable');
      }
    }
  }

  function tryTrigger(now, hooks = {}, blockers = {}) {
    if (runtime.active || blockers.duelActive || blockers.outbreakActive || blockers.firewallActive || blockers.signalRouterActive) return;
    if (now < runtime.triggerCheckAt) return;
    runtime.triggerCheckAt = now + TRIGGER_ROLL_INTERVAL_MS;
    if (Math.random() > TRIGGER_CHANCE) return;
    beginEvent(hooks);
  }

  function tick(dt, hooks = {}, blockers = {}) {
    const now = Date.now();
    tryTrigger(now, hooks, blockers);
    if (!runtime.active) return;

    if (runtime.status === 'alert' && now >= runtime.alertUntil) {
      runtime.status = 'active';
      log('Recovery shell online. Reconnect live graph links.');
    }

    tickEdgeDurations(now);
    spreadFracture(now, hooks);
    assignNpcActors(now);
    stepNpcSupport(now, hooks);
    const pressure = updateIntegrity();
    updateObjectives(now);
    setNodeDecor();

    const completeCore = runtime.objectives.filter((o) => o.id !== 'integrity_floor').every((o) => o.complete);
    const objectiveExpired = runtime.objectives.some((o) => !o.complete && now > o.deadlineAt);
    const elapsed = now - runtime.startedAt;

    if (completeCore && runtime.integrity >= MIN_WIN_INTEGRITY && elapsed >= EVENT_MIN_MS) {
      resolve(hooks, 'success');
      return;
    }

    const tooManyIsolated = pressure.isolatedNodes >= Math.max(4, Math.round(nodes.length * 0.26));
    const integrityCollapsed = runtime.integrity <= 28;
    const timedOut = now >= runtime.endsAt;
    if (tooManyIsolated || integrityCollapsed || timedOut || objectiveExpired) {
      resolve(hooks, 'failure');
    }
  }

  function getPublicState() {
    const now = Date.now();
    const linkStates = { stable: 0, unstable: 0, broken: 0, bridge: 0, reinforced: 0 };
    const links = [];
    for (const edge of edges.values()) {
      const meta = runtime.linkMeta.get(edge.id) || { state: 'stable', strength: 1 };
      if (linkStates[meta.state] !== undefined) linkStates[meta.state] += 1;
      links.push({
        id: edge.id,
        fromId: edge.aId,
        toId: edge.bId,
        state: meta.state,
        fragile: Boolean(meta.fragile),
      });
    }

    return {
      ...runtime,
      timeLeftMs: Math.max(0, runtime.endsAt - now),
      objectives: runtime.objectives.map((obj) => ({ ...obj, timeLeftMs: Math.max(0, obj.deadlineAt - now) })),
      links,
      linkStates,
      actionIds: ['reconnectLink', 'stabilizeLink', 'rerouteNode', 'deployBridge', 'reinforceConnection'],
      objectiveTypes: ['reconnect_cluster', 'restore_critical_path', 'stabilize_corridor', 'minimum_integrity'],
      npcInteractionTypes: ['courier_signal_shuttle', 'agent_route_reveal', 'fighter_zone_secure', 'recruiter_repair_team'],
      repairActionCount: 5,
      fractureTypeCount: runtime.fractureTypes.length,
      objectiveTypeCount: 4,
      npcInteractionTypeCount: 4,
    };
  }

  function setSelectedNode(nodeId) {
    if (!nodeId || !byId.has(nodeId)) return false;
    runtime.selectedNodeId = nodeId;
    setNodeDecor();
    return true;
  }

  return {
    tick,
    setSelectedNode,
    getPublicState,
    actions: {
      reconnectLink: (nodeId) => reconnectLink(nodeId || runtime.selectedNodeId),
      stabilizeLink: (nodeId) => stabilizeLink(nodeId || runtime.selectedNodeId),
      rerouteNode: (nodeId) => reroute(nodeId || runtime.selectedNodeId),
      deployBridge: (nodeId) => deployBridge(nodeId || runtime.selectedNodeId),
      reinforceConnection: (nodeId) => reinforceLink(nodeId || runtime.selectedNodeId),
    },
  };
}
