import { CONTROL_LINKS } from './control-grid.js';
import { computeTierDifficulty } from './tier-difficulty.js';

const TRIGGER_MIN_DELAY_MS = 75000;
const TRIGGER_MAX_DELAY_MS = 140000;
const TRIGGER_ROLL_INTERVAL_MS = 10000;
const TRIGGER_CHANCE = 0.26;
const ALERT_MS = 3200;
const EVENT_MIN_MS = 30000;
const EVENT_MAX_MS = 110000;
const NPC_ASSIGN_INTERVAL_MS = 2600;
const MIN_EVENT_MAX_MS = 55000;
const MAX_CORRUPTION_ROLL = 0.42;
const MAX_OBJECTIVES = 5;

const LINK_STATES = {
  normal: { id: 'normal', weight: 1, severity: 0, color: '#5ef2ff' },
  overloaded: { id: 'overloaded', weight: 2.2, severity: 1, color: '#ffb347' },
  corrupted: { id: 'corrupted', weight: 4.2, severity: 2, color: '#ff4fd8' },
  blocked: { id: 'blocked', weight: 999, severity: 3, color: '#ff5a6f' },
  stabilized: { id: 'stabilized', weight: 0.8, severity: -1, color: '#69f3ff' },
};

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
    if (!byId.has(a) || !byId.has(b) || !a || !b) continue;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
    edges.set(edgeKey(a, b), { id: edgeKey(a, b), aId: a, bId: b });
  }
  return { byId, adjacency, edges };
}

function weightedPath(adjacency, startId, endId, edgeMeta, options = {}) {
  if (!startId || !endId) return null;
  if (startId === endId) return [startId];
  const forcedVia = options.forcedViaId;
  if (forcedVia && forcedVia !== startId && forcedVia !== endId) {
    const first = weightedPath(adjacency, startId, forcedVia, edgeMeta, { ...options, forcedViaId: '' });
    const second = weightedPath(adjacency, forcedVia, endId, edgeMeta, { ...options, forcedViaId: '' });
    if (!first || !second) return null;
    return [...first, ...second.slice(1)];
  }

  const dist = new Map([[startId, 0]]);
  const prev = new Map();
  const open = new Set([startId]);

  while (open.size) {
    let current = '';
    let best = Infinity;
    for (const id of open) {
      const score = dist.get(id) ?? Infinity;
      if (score < best) {
        best = score;
        current = id;
      }
    }
    if (!current) break;
    if (current === endId) break;
    open.delete(current);

    for (const next of adjacency.get(current) || []) {
      const key = edgeKey(current, next);
      const edge = edgeMeta.get(key);
      if (!edge) continue;
      if (edge.state === 'blocked' && !edge.playerOverride) continue;
      const nextDist = (dist.get(current) || 0) + (edge.weight || 1);
      if (nextDist < (dist.get(next) ?? Infinity)) {
        dist.set(next, nextDist);
        prev.set(next, current);
        open.add(next);
      }
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

export function createSignalRouterSystem(state, options = {}) {
  const difficulty = computeTierDifficulty(options?.tier || 1);
  const defenseEaseBonus = Math.max(0, Math.min(0.5, Number(options?.progression?.defenseEaseBonus) || 0));
  const npcAssistBonus = Math.max(0, Math.min(0.5, Number(options?.progression?.npcAssistBonus) || 0));
  const timePressureScale = Math.min(difficulty.scale * (1 - (defenseEaseBonus * 0.35)), 2);
  const corruptionRoll = Math.min(0.15 * difficulty.scale * (1 - (defenseEaseBonus * 0.3)), MAX_CORRUPTION_ROLL);
  const nodes = Array.isArray(state?.controlNodes) ? state.controlNodes : [];
  const { byId, adjacency, edges } = buildGraph(nodes);
  const districtIds = [...new Set(nodes.map((node) => node.districtId).filter(Boolean))];

  const runtime = {
    active: false,
    status: 'idle',
    startedAt: 0,
    alertUntil: 0,
    endsAt: 0,
    triggerCheckAt: Date.now() + TRIGGER_MIN_DELAY_MS,
    selectedNodeId: '',
    selectedEdgeKey: '',
    priorityNodeId: '',
    routeBiasNodeId: '',
    routeBiasUntil: 0,
    eventIndex: 0,
    objectives: [],
    linkMeta: new Map(),
    nodeCongestion: new Map(),
    failedObjectives: 0,
    congestionPressure: 0,
    timeoutPressure: 0,
    tokens: 14,
    logs: [],
    npcActors: [],
    npcAssignAt: 0,
  };

  state.signalRouter = runtime;

  function log(text) {
    runtime.logs.unshift({ at: Date.now(), text });
    while (runtime.logs.length > 9) runtime.logs.pop();
  }

  function setNodeDecor(now = Date.now()) {
    for (const node of nodes) {
      const nodeCongestion = runtime.nodeCongestion.get(node.id) || 0;
      node.signalRouter = runtime.active
        ? {
          active: true,
          selected: runtime.selectedNodeId === node.id,
          priority: runtime.priorityNodeId === node.id,
          routeBias: runtime.routeBiasNodeId === node.id && runtime.routeBiasUntil > now,
          congestion: clamp(nodeCongestion / 100, 0, 1),
        }
        : null;
    }
  }

  function clearNodeDecor() {
    for (const node of nodes) {
      delete node.signalRouter;
    }
  }

  function getEdgeMeta(id) {
    if (!runtime.linkMeta.has(id)) {
      runtime.linkMeta.set(id, {
        id,
        state: 'normal',
        weight: LINK_STATES.normal.weight,
        until: 0,
        playerOverride: false,
      });
    }
    return runtime.linkMeta.get(id);
  }

  function setEdgeState(id, stateId, until = 0, playerOverride = false) {
    const meta = getEdgeMeta(id);
    const descriptor = LINK_STATES[stateId] || LINK_STATES.normal;
    meta.state = descriptor.id;
    meta.weight = descriptor.weight;
    meta.until = until;
    meta.playerOverride = Boolean(playerOverride);
  }

  function seedLinkStates(now) {
    runtime.linkMeta.clear();
    for (const id of edges.keys()) {
      const roll = Math.random();
      if (roll < 0.1) {
        setEdgeState(id, 'blocked', now + 9000 + Math.random() * 6000);
      } else if (roll < 0.28) {
        setEdgeState(id, 'corrupted', now + 12000 + Math.random() * 7000);
      } else if (roll < 0.5) {
        setEdgeState(id, 'overloaded', now + 9000 + Math.random() * 7000);
      } else {
        setEdgeState(id, 'normal', 0);
      }
    }
  }

  function districtNodes(districtId) {
    return nodes.filter((node) => node.districtId === districtId);
  }

  function buildObjectives(now) {
    const anchors = ['core', 'north', 'east', 'south', 'west'].filter((id) => byId.has(id));
    const districts = districtIds.slice();
    const primaryDistrict = choose(districts) || districtIds[0] || '';
    const secondaryDistrict = choose(districts.filter((id) => id !== primaryDistrict)) || primaryDistrict;
    const hub = choose(districtNodes(primaryDistrict)) || byId.get('core') || nodes[0];
    const relay = choose(districtNodes(secondaryDistrict).filter((n) => n.nodeType === 'relay'))
      || choose(nodes.filter((n) => n.nodeType === 'relay'))
      || byId.get('east')
      || nodes[0];
    const controlA = byId.get('north') || choose(anchors.map((id) => byId.get(id)).filter(Boolean)) || nodes[0];
    const controlB = byId.get('south') || choose(anchors.map((id) => byId.get(id)).filter((n) => n && n.id !== controlA?.id)) || nodes[1] || nodes[0];
    const clusterSource = choose(nodes.filter((n) => (adjacency.get(n.id)?.size || 0) <= 2)) || nodes[0];
    const clusterTarget = byId.get('core') || choose(anchors.map((id) => byId.get(id)).filter(Boolean)) || nodes[1] || nodes[0];

    runtime.objectives = [
      {
        id: 'hub-relay',
        type: 'hub_to_relay',
        label: `Connect ${hub?.id?.toUpperCase()} hub → ${relay?.id?.toUpperCase()} relay`,
        fromId: hub?.id,
        toId: relay?.id,
        deadlineAt: now + 30000,
        holdMs: 6000,
        heldMs: 0,
        complete: false,
      },
      {
        id: 'cluster-link',
        type: 'reconnect_cluster',
        label: `Reconnect ${clusterSource?.id?.toUpperCase()} cluster to ${clusterTarget?.id?.toUpperCase()}`,
        fromId: clusterSource?.id,
        toId: clusterTarget?.id,
        deadlineAt: now + 52000,
        holdMs: 5500,
        heldMs: 0,
        complete: false,
      },
      {
        id: 'control-maintain',
        type: 'maintain_control_path',
        label: `Maintain active path ${controlA?.id?.toUpperCase()} ↔ ${controlB?.id?.toUpperCase()}`,
        fromId: controlA?.id,
        toId: controlB?.id,
        deadlineAt: now + 70000,
        holdMs: 8000,
        heldMs: 0,
        complete: false,
      },
    ];
    const extraObjectives = clamp(Math.floor((difficulty.scale - 1) / 1.1), 0, MAX_OBJECTIVES - runtime.objectives.length);
    for (let i = 0; i < extraObjectives; i += 1) {
      const from = choose(nodes) || nodes[0];
      const to = choose(nodes.filter((node) => node.id !== from?.id)) || nodes[1] || nodes[0];
      runtime.objectives.push({
        id: `aux-${i + 1}`,
        type: 'aux_route_lock',
        label: `Stabilize auxiliary route ${from?.id?.toUpperCase()} ↔ ${to?.id?.toUpperCase()}`,
        fromId: from?.id,
        toId: to?.id,
        deadlineAt: now + (34000 + (i * 9000)),
        holdMs: 5000 + (i * 900),
        heldMs: 0,
        complete: false,
      });
    }
  }

  function beginEvent(hooks = {}) {
    const now = Date.now();
    runtime.active = true;
    runtime.status = 'alert';
    runtime.startedAt = now;
    runtime.alertUntil = now + ALERT_MS;
    runtime.endsAt = now + Math.max(
      MIN_EVENT_MAX_MS,
      Math.round((EVENT_MAX_MS / timePressureScale) * (1 + (defenseEaseBonus * 0.5))),
    );
    runtime.eventIndex += 1;
    runtime.selectedNodeId = nodes[0]?.id || '';
    runtime.selectedEdgeKey = '';
    runtime.priorityNodeId = '';
    runtime.routeBiasNodeId = '';
    runtime.routeBiasUntil = 0;
    runtime.failedObjectives = 0;
    runtime.congestionPressure = 0;
    runtime.timeoutPressure = 0;
    runtime.tokens = 14;
    runtime.logs = [];
    runtime.npcActors = [];
    runtime.npcAssignAt = now;
    runtime.nodeCongestion = new Map(nodes.map((node) => [node.id, 12 + Math.random() * 10]));

    seedLinkStates(now);
    buildObjectives(now);
    log('SIGNAL CONGESTION — REROUTE THE GRID');
    setNodeDecor(now);
    hooks.onStart?.({ message: 'SIGNAL CONGESTION — REROUTE THE GRID' });
  }

  function clearEvent() {
    runtime.active = false;
    runtime.status = 'idle';
    runtime.objectives = [];
    runtime.selectedNodeId = '';
    runtime.selectedEdgeKey = '';
    runtime.priorityNodeId = '';
    runtime.routeBiasNodeId = '';
    runtime.routeBiasUntil = 0;
    runtime.npcActors = [];
    runtime.linkMeta.clear();
    runtime.nodeCongestion.clear();
    runtime.triggerCheckAt = Date.now() + TRIGGER_MIN_DELAY_MS + Math.random() * (TRIGGER_MAX_DELAY_MS - TRIGGER_MIN_DELAY_MS);
    clearNodeDecor();
  }

  function evaluateObjective(objective, now, dtMs) {
    if (!objective || objective.complete) return;
    const path = weightedPath(adjacency, objective.fromId, objective.toId, runtime.linkMeta, {
      forcedViaId: runtime.routeBiasUntil > now ? runtime.routeBiasNodeId : '',
    });
    objective.path = path || [];
    objective.connected = Boolean(path && path.length > 1);

    if (objective.connected) {
      objective.heldMs += dtMs;
      objective.lastGoodAt = now;
      if (objective.heldMs >= objective.holdMs) {
        objective.complete = true;
        log(`Objective complete: ${objective.label}`);
      }
    } else {
      objective.heldMs = Math.max(0, objective.heldMs - dtMs * 0.35);
      runtime.congestionPressure += 0.0032;
    }

    if (!objective.complete && now > objective.deadlineAt) {
      runtime.failedObjectives += 1;
      runtime.timeoutPressure += 0.18;
      objective.deadlineAt = now + 18000;
      objective.heldMs = 0;
      log(`Route timeout: ${objective.label}`);
    }
  }

  function updateCongestion(dtMs) {
    const now = Date.now();
    const congestionDelta = dtMs / 1000;

    for (const [id, meta] of runtime.linkMeta.entries()) {
      if (meta.until > 0 && now >= meta.until) {
        if (meta.playerOverride) {
          setEdgeState(id, 'normal', 0, false);
        } else {
          setEdgeState(id, Math.random() < 0.45 ? 'overloaded' : 'normal', 0, false);
        }
      }
      if (meta.state === 'overloaded') runtime.congestionPressure += 0.0012 * congestionDelta;
      if (meta.state === 'corrupted') runtime.congestionPressure += 0.0022 * congestionDelta;
      if (meta.state === 'blocked') runtime.congestionPressure += 0.0028 * congestionDelta;
    }

    for (const [nodeId, value] of runtime.nodeCongestion.entries()) {
      const pull = runtime.priorityNodeId && runtime.priorityNodeId === nodeId ? -3.8 : -2.2;
      const next = clamp(value + (Math.random() * 6 - 1.2) + (pull * congestionDelta), 0, 120);
      runtime.nodeCongestion.set(nodeId, next);
      if (next > 82) runtime.congestionPressure += 0.0015;
    }

    if (Math.random() < corruptionRoll) {
      const edge = choose([...runtime.linkMeta.keys()]);
      if (edge) {
        const current = runtime.linkMeta.get(edge);
        if (current && !current.playerOverride) {
          if (current.state === 'normal') setEdgeState(edge, 'overloaded', now + 7000 + Math.random() * 5000);
          else if (current.state === 'overloaded' && Math.random() < 0.35) setEdgeState(edge, 'corrupted', now + 9000 + Math.random() * 5000);
        }
      }
    }
  }

  function findWorstAdjacent(nodeId, includeBlocked = true) {
    const neighbors = [...(adjacency.get(nodeId) || [])];
    const candidates = neighbors
      .map((id) => ({ id, key: edgeKey(nodeId, id), meta: runtime.linkMeta.get(edgeKey(nodeId, id)) }))
      .filter((entry) => entry.meta && (includeBlocked || entry.meta.state !== 'blocked'))
      .sort((a, b) => (b.meta?.weight || 1) - (a.meta?.weight || 1));
    return candidates[0] || null;
  }

  function ensureSelection(nodeId) {
    if (!nodeId || !byId.has(nodeId)) return { ok: false, reason: 'Select a valid node on the grid.' };
    runtime.selectedNodeId = nodeId;
    return { ok: true };
  }

  function playerPrioritize(nodeId) {
    const select = ensureSelection(nodeId);
    if (!select.ok) return select;
    runtime.priorityNodeId = nodeId;
    runtime.tokens = Math.max(0, runtime.tokens - 1);
    runtime.nodeCongestion.set(nodeId, Math.max(0, (runtime.nodeCongestion.get(nodeId) || 0) - 26));
    log(`Priority route enabled at ${nodeId.toUpperCase()}`);
    setNodeDecor();
    return { ok: true };
  }

  function playerAvoid(nodeId) {
    const select = ensureSelection(nodeId);
    if (!select.ok) return select;
    const target = findWorstAdjacent(nodeId, false);
    if (!target) return { ok: false, reason: 'No adjacent corridor to avoid.' };
    setEdgeState(target.key, 'blocked', Date.now() + 11000, true);
    runtime.selectedEdgeKey = target.key;
    log(`Danger link avoided: ${target.key.toUpperCase()}`);
    return { ok: true };
  }

  function playerReroute(nodeId) {
    const select = ensureSelection(nodeId);
    if (!select.ok) return select;
    runtime.routeBiasNodeId = nodeId;
    runtime.routeBiasUntil = Date.now() + 15000;
    log(`Traffic rerouted through ${nodeId.toUpperCase()}`);
    setNodeDecor();
    return { ok: true };
  }

  function playerStabilize(nodeId) {
    const select = ensureSelection(nodeId);
    if (!select.ok) return select;
    const target = findWorstAdjacent(nodeId, true);
    if (!target) return { ok: false, reason: 'No damaged link nearby.' };
    setEdgeState(target.key, 'stabilized', Date.now() + 13000, true);
    runtime.selectedEdgeKey = target.key;
    log(`Link stabilized: ${target.key.toUpperCase()}`);
    return { ok: true };
  }

  function playerClearCongestion(nodeId) {
    const select = ensureSelection(nodeId);
    if (!select.ok) return select;
    const current = runtime.nodeCongestion.get(nodeId) || 0;
    runtime.nodeCongestion.set(nodeId, Math.max(0, current - 36));
    runtime.congestionPressure = Math.max(0, runtime.congestionPressure - 0.06);
    log(`Congestion cleared at ${nodeId.toUpperCase()}`);
    setNodeDecor();
    return { ok: true };
  }

  function assignNpcActors(now) {
    if (now < runtime.npcAssignAt) return;
    runtime.npcAssignAt = now + (NPC_ASSIGN_INTERVAL_MS * (1 - (npcAssistBonus * 0.4)));
    const activeNpcs = (state?.npc?.entities || []).filter((npc) => npc?.mode === 'active');
    if (!activeNpcs.length) return;

    const roleMap = [
      { id: 'courier', roles: ['agent', 'vendor'] },
      { id: 'agent', roles: ['agent'] },
      { id: 'fighter', roles: ['fighter'] },
      { id: 'recruiter', roles: ['recruiter'] },
      { id: 'lore-keeper', roles: ['lore-keeper', 'drifter'] },
    ];

    runtime.npcActors = roleMap.map((roleDef) => {
      const npc = activeNpcs.find((entry) => roleDef.roles.includes(entry.role));
      if (!npc) return null;
      const obj = choose(runtime.objectives.filter((goal) => !goal.complete)) || runtime.objectives[0];
      if (!obj) return null;
      const fromId = obj.fromId;
      const toId = obj.toId;
      const path = weightedPath(adjacency, fromId, toId, runtime.linkMeta) || [fromId, toId].filter(Boolean);
      if (path.length < 2) return null;
      return {
        npcId: npc.id,
        role: roleDef.id,
        path,
        pathIndex: 0,
        edgeT: 0,
        cooldown: 0,
        targetObjectiveId: obj.id,
      };
    }).filter(Boolean);
  }

  function stepNpcActors(dt, hooks = {}) {
    const npcById = new Map((state?.npc?.entities || []).map((npc) => [npc.id, npc]));
    for (const actor of runtime.npcActors) {
      const npc = npcById.get(actor.npcId);
      if (!npc || actor.path.length < 2) continue;
      actor.edgeT += dt * 0.85;
      if (actor.edgeT >= 1) {
        actor.edgeT -= 1;
        actor.pathIndex = Math.min(actor.path.length - 2, actor.pathIndex + 1);
      }
      const fromId = actor.path[actor.pathIndex];
      const toId = actor.path[actor.pathIndex + 1] || fromId;
      const from = byId.get(fromId);
      const to = byId.get(toId) || from;
      if (!from || !to) continue;
      npc.col = from.x + ((to.x - from.x) * actor.edgeT);
      npc.row = from.y + ((to.y - from.y) * actor.edgeT);

      actor.cooldown -= dt;
      if (actor.cooldown > 0) continue;
      const edge = edgeKey(fromId, toId);
      if (actor.role === 'courier') {
        runtime.congestionPressure += 0.02;
        runtime.nodeCongestion.set(toId, clamp((runtime.nodeCongestion.get(toId) || 0) + 10, 0, 120));
        hooks.onNpc?.({ type: 'courier', text: `Courier demand spike on ${edge.toUpperCase()}` });
        actor.cooldown = 7.2;
      } else if (actor.role === 'agent') {
        setEdgeState(edge, 'stabilized', Date.now() + 10000, true);
        hooks.onNpc?.({ type: 'agent', text: `Agent exposed safe corridor ${edge.toUpperCase()}` });
        actor.cooldown = 8.4;
      } else if (actor.role === 'fighter') {
        const meta = runtime.linkMeta.get(edge);
        if (meta?.state === 'blocked' || meta?.state === 'corrupted') {
          setEdgeState(edge, 'overloaded', Date.now() + 6000, false);
        }
        hooks.onNpc?.({ type: 'fighter', text: `Fighter secured ${edge.toUpperCase()}` });
        actor.cooldown = 9;
      } else if (actor.role === 'recruiter') {
        runtime.tokens += 3;
        runtime.congestionPressure = Math.max(0, runtime.congestionPressure - 0.04);
        hooks.onNpc?.({ type: 'recruiter', text: 'Recruiter called support traffic relief' });
        actor.cooldown = 10;
      } else {
        runtime.timeoutPressure += 0.02;
        hooks.onNpc?.({ type: 'lore-keeper', text: 'Lore-keeper warning: district links unstable' });
        actor.cooldown = 11;
      }
    }
  }

  function resolve(hooks, outcome) {
    if (outcome === 'success') {
      hooks.onResolve?.({
        outcome,
        rewardXp: 54 + Math.round((1 - runtime.congestionPressure) * 24),
        rewardGems: 7 + Math.max(0, 3 - runtime.failedObjectives),
        stabilityBonusMs: 75 * 1000,
      });
    } else {
      hooks.onResolve?.({
        outcome,
        samPressureDelta: 10 + Math.round(runtime.timeoutPressure * 10),
        districtInstabilityPenalty: 6 + runtime.failedObjectives,
      });
    }
    clearEvent();
  }

  function tryTrigger(now, hooks = {}, blockers = {}) {
    if (runtime.active || blockers.duelActive || blockers.outbreakActive || blockers.firewallActive) return;
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
      log('Operator entered SIGNAL ROUTER overlay.');
    }

    const dtMs = dt * 1000;
    updateCongestion(dtMs);
    assignNpcActors(now);
    stepNpcActors(dt, hooks);

    for (const objective of runtime.objectives) {
      evaluateObjective(objective, now, dtMs);
    }

    const completed = runtime.objectives.filter((goal) => goal.complete).length;
    const allCompleted = completed === runtime.objectives.length && runtime.objectives.length >= 3;
    const elapsed = now - runtime.startedAt;
    const pressure = clamp(runtime.congestionPressure + runtime.timeoutPressure + runtime.failedObjectives * 0.16, 0, 1.4);

    setNodeDecor(now);

    if (allCompleted && elapsed >= EVENT_MIN_MS) {
      resolve(hooks, 'success');
      return;
    }

    const tooManyFails = runtime.failedObjectives >= 3;
    const tooMuchPressure = pressure >= 1;
    const timedOut = now >= runtime.endsAt;
    if (tooManyFails || tooMuchPressure || timedOut) {
      resolve(hooks, 'failure');
    }
  }

  function setSelectedNode(nodeId) {
    if (!nodeId || !byId.has(nodeId)) return false;
    runtime.selectedNodeId = nodeId;
    const target = findWorstAdjacent(nodeId, true);
    runtime.selectedEdgeKey = target?.key || '';
    setNodeDecor();
    return true;
  }

  function getPublicState() {
    const now = Date.now();
    const linkStateCounts = { normal: 0, overloaded: 0, corrupted: 0, blocked: 0, stabilized: 0 };
    const links = [];
    for (const edge of edges.values()) {
      const meta = runtime.linkMeta.get(edge.id) || { state: 'normal', weight: 1 };
      if (linkStateCounts[meta.state] !== undefined) linkStateCounts[meta.state] += 1;
      links.push({
        id: edge.id,
        fromId: edge.aId,
        toId: edge.bId,
        state: meta.state,
        weight: meta.weight,
        playerOverride: Boolean(meta.playerOverride),
      });
    }
    const objectiveData = runtime.objectives.map((objective) => ({
      ...objective,
      timeLeftMs: Math.max(0, objective.deadlineAt - now),
    }));
    const pressure = clamp(runtime.congestionPressure + runtime.timeoutPressure + runtime.failedObjectives * 0.16, 0, 1.4);

    return {
      ...runtime,
      linkStates: linkStateCounts,
      links,
      objectives: objectiveData,
      pressure,
      timeLeftMs: Math.max(0, runtime.endsAt - now),
      actionIds: ['prioritizeRoute', 'avoidLink', 'rerouteTraffic', 'stabilizeLink', 'clearCongestion'],
      objectiveTypes: ['hub_to_relay', 'reconnect_cluster', 'maintain_control_path'],
      npcInteractionTypes: ['courier-demand', 'agent-safe-corridor', 'fighter-secure-link', 'recruiter-relief', 'lorekeeper-warning'],
      linkStateIds: Object.keys(LINK_STATES),
      difficulty,
    };
  }

  return {
    tick,
    setSelectedNode,
    getPublicState,
    actions: {
      prioritizeRoute: (nodeId) => playerPrioritize(nodeId || runtime.selectedNodeId),
      avoidLink: (nodeId) => playerAvoid(nodeId || runtime.selectedNodeId),
      rerouteTraffic: (nodeId) => playerReroute(nodeId || runtime.selectedNodeId),
      stabilizeLink: (nodeId) => playerStabilize(nodeId || runtime.selectedNodeId),
      clearCongestion: (nodeId) => playerClearCongestion(nodeId || runtime.selectedNodeId),
    },
  };
}
