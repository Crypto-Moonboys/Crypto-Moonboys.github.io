import { CONTROL_LINKS } from './control-grid.js';

const EVENT_MIN_DELAY_MS = 65000;
const EVENT_MAX_DELAY_MS = 120000;
const TRIGGER_ROLL_MS = 12000;
const TRIGGER_CHANCE = 0.3;
const ALERT_MS = 3600;
const MAX_EVENT_MS = 95 * 1000;
const TOKEN_TICK_MS = 2600;
const NPC_ASSIGN_INTERVAL_MS = 1800;

const ENEMY_TYPES = {
  dart: { id: 'dart', label: 'Fast packet', speed: 1.85, hp: 22, damage: 9, reward: 2, color: '#ff4f9e' },
  tank: { id: 'tank', label: 'Heavy packet', speed: 0.85, hp: 72, damage: 18, reward: 4, color: '#ff7e6b' },
  splitter: { id: 'splitter', label: 'Splitter packet', speed: 1.15, hp: 40, damage: 12, reward: 3, color: '#ff4fcf', splitInto: 2 },
};

const DEFENSE_TYPES = {
  firewall: { id: 'firewall', label: 'Firewall Node', tokenCost: 8, range: 7.8, damage: 11, fireRate: 0.62, color: '#65efff' },
  disruptor: { id: 'disruptor', label: 'Pulse Disruptor', tokenCost: 10, range: 0, damage: 0, fireRate: 0, slow: 0.48, color: '#6bc5ff' },
  purge: { id: 'purge', label: 'Purge Beam', tokenCost: 14, range: 10.2, damage: 30, fireRate: 1.45, color: '#6a95ff' },
};

const NPC_SUPPORT_TYPES = {
  courier: { id: 'courier', role: 'repair', interval: 7.6, amount: 20 },
  fighter: { id: 'fighter', role: 'boost', interval: 8.5, amount: 0.5 },
  agent: { id: 'agent', role: 'reveal', interval: 9.5, amount: 0 },
  recruiter: { id: 'recruiter', role: 'helper', interval: 10.5, amount: 16 },
};

const WAVE_PLAN = [
  { atMs: 0, count: 8, mix: ['dart', 'dart', 'tank'] },
  { atMs: 19000, count: 10, mix: ['dart', 'splitter', 'tank'] },
  { atMs: 39000, count: 12, mix: ['splitter', 'tank', 'dart', 'tank'] },
];

function choose(items = []) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] || null;
}

function pairKey(aId, bId) {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distanceSq(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return (dx * dx) + (dy * dy);
}

function buildNetwork(nodes = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map();
  for (const link of CONTROL_LINKS) {
    const a = link.from.id;
    const b = link.to.id;
    if (!byId.has(a) || !byId.has(b)) continue;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  }
  return { byId, adjacency };
}

function bfsPath(adjacency, startId, endId) {
  if (!startId || !endId || startId === endId) return [startId];
  const q = [startId];
  const prev = new Map([[startId, '']]);
  for (let i = 0; i < q.length; i += 1) {
    const id = q[i];
    if (id === endId) break;
    for (const next of adjacency.get(id) || []) {
      if (prev.has(next)) continue;
      prev.set(next, id);
      q.push(next);
    }
  }
  if (!prev.has(endId)) return [startId];
  const path = [];
  let cur = endId;
  while (cur) {
    path.push(cur);
    cur = prev.get(cur);
  }
  path.reverse();
  return path;
}

export function createFirewallDefenseSystem(state) {
  const nodes = Array.isArray(state?.controlNodes) ? state.controlNodes : [];
  const { byId, adjacency } = buildNetwork(nodes);
  const keyNodeIds = ['core', 'north', 'east', 'south', 'west'].filter((id) => byId.has(id));
  const edgeNodes = nodes.filter((node) => (adjacency.get(node.id)?.size || 0) <= 2);

  const runtime = {
    active: false,
    status: 'idle',
    alertUntil: 0,
    startedAt: 0,
    triggerCheckAt: Date.now() + EVENT_MIN_DELAY_MS,
    selectedNodeId: '',
    tokens: 0,
    tokenTickAt: 0,
    tokensGenerated: 0,
    placementCap: 7,
    defenses: [],
    packets: [],
    waves: WAVE_PLAN.map((entry) => ({ ...entry, spawned: false })),
    waveIndex: 0,
    nodeIntegrity: new Map(),
    corruptedNodes: new Set(),
    supportNpc: [],
    npcAssignAt: 0,
    logs: [],
    linkFlashUntil: new Map(),
    revealUntil: 0,
    buffNodesUntil: new Map(),
    helperCooldownByNode: new Map(),
    heavyHitUntil: 0,
    eventSeed: 0,
  };
  state.firewallDefense = runtime;

  function log(text) {
    runtime.logs.unshift({ at: Date.now(), text });
    while (runtime.logs.length > 8) runtime.logs.pop();
  }

  function resetNodeDecor() {
    for (const node of nodes) {
      delete node.firewallDefense;
    }
  }

  function refreshNodeDecor(now = Date.now()) {
    for (const node of nodes) {
      const integrity = runtime.nodeIntegrity.get(node.id) || 100;
      const underAttack = runtime.packets.some((packet) => packet.toId === node.id || packet.fromId === node.id);
      node.firewallDefense = {
        active: runtime.active,
        key: keyNodeIds.includes(node.id),
        selected: runtime.selectedNodeId === node.id,
        defended: runtime.defenses.some((defense) => defense.nodeId === node.id),
        underAttack,
        corrupted: runtime.corruptedNodes.has(node.id),
        integrity,
        boosted: (runtime.buffNodesUntil.get(node.id) || 0) > now,
      };
    }
  }

  function clearState() {
    runtime.active = false;
    runtime.status = 'idle';
    runtime.alertUntil = 0;
    runtime.selectedNodeId = '';
    runtime.tokens = 0;
    runtime.tokensGenerated = 0;
    runtime.defenses = [];
    runtime.packets = [];
    runtime.waveIndex = 0;
    runtime.waves = WAVE_PLAN.map((entry) => ({ ...entry, spawned: false }));
    runtime.nodeIntegrity.clear();
    runtime.corruptedNodes.clear();
    runtime.supportNpc = [];
    runtime.npcAssignAt = 0;
    runtime.linkFlashUntil.clear();
    runtime.revealUntil = 0;
    runtime.buffNodesUntil.clear();
    runtime.helperCooldownByNode.clear();
    runtime.heavyHitUntil = 0;
    runtime.triggerCheckAt = Date.now() + EVENT_MIN_DELAY_MS + Math.random() * (EVENT_MAX_DELAY_MS - EVENT_MIN_DELAY_MS);
    resetNodeDecor();
  }

  function beginEvent(hooks = {}) {
    runtime.active = true;
    runtime.status = 'alert';
    runtime.alertUntil = Date.now() + ALERT_MS;
    runtime.startedAt = Date.now();
    runtime.tokens = 12;
    runtime.tokenTickAt = runtime.startedAt + TOKEN_TICK_MS;
    runtime.waveIndex = 0;
    runtime.waves = WAVE_PLAN.map((entry) => ({ ...entry, spawned: false }));
    runtime.nodeIntegrity = new Map(nodes.map((node) => [node.id, keyNodeIds.includes(node.id) ? 140 : 100]));
    runtime.corruptedNodes.clear();
    runtime.defenses = [];
    runtime.packets = [];
    runtime.logs = [];
    runtime.eventSeed += 1;
    runtime.placementCap = 6 + (runtime.eventSeed % 2);
    runtime.selectedNodeId = choose(keyNodeIds) || nodes[0]?.id || '';
    runtime.npcAssignAt = Date.now();
    log('FIREWALL BREACH — DEFEND THE NETWORK');
    refreshNodeDecor();
    hooks.onStart?.({ keyNodeIds: [...keyNodeIds], seed: runtime.eventSeed });
  }

  function canTrigger(now, { duelActive = false, outbreakActive = false } = {}) {
    if (runtime.active || duelActive || outbreakActive) return false;
    if (now < runtime.triggerCheckAt) return false;
    return true;
  }

  function tryTrigger(now, hooks = {}, blockers = {}) {
    if (!canTrigger(now, blockers)) return false;
    runtime.triggerCheckAt = now + TRIGGER_ROLL_MS;
    if (Math.random() > TRIGGER_CHANCE) return false;
    beginEvent(hooks);
    return true;
  }

  function ensurePathTarget(targetId) {
    return byId.has(targetId) ? targetId : (choose(keyNodeIds) || nodes[0]?.id || '');
  }

  function spawnPacket(typeId, spawnNodeId, targetNodeId) {
    const type = ENEMY_TYPES[typeId];
    if (!type) return;
    const sourceId = ensurePathTarget(spawnNodeId);
    const targetId = ensurePathTarget(targetNodeId);
    const path = bfsPath(adjacency, sourceId, targetId);
    if (path.length < 2) return;
    runtime.packets.push({
      id: `pkt-${Date.now()}-${Math.floor(Math.random() * 99999)}`,
      typeId,
      hp: type.hp,
      path,
      pathIndex: 0,
      edgeT: 0,
      fromId: path[0],
      toId: path[1],
      slowedBy: '',
      spawnedAt: Date.now(),
    });
  }

  function spawnWave(wave, hooks = {}) {
    const candidateTargets = keyNodeIds.length ? keyNodeIds : nodes.map((node) => node.id);
    const candidateSpawns = edgeNodes.length ? edgeNodes : nodes;
    for (let i = 0; i < wave.count; i += 1) {
      const spawn = choose(candidateSpawns);
      const target = choose(candidateTargets);
      const typeId = wave.mix[i % wave.mix.length];
      if (!spawn || !target) continue;
      spawnPacket(typeId, spawn.id, target);
    }
    wave.spawned = true;
    runtime.waveIndex += 1;
    log(`Wave ${runtime.waveIndex} breach packets detected (${wave.count})`);
    hooks.onWave?.({ waveIndex: runtime.waveIndex, count: wave.count });
  }

  function splitPacket(packet) {
    const type = ENEMY_TYPES[packet.typeId];
    const splits = type?.splitInto || 0;
    if (!splits) return;
    const spawnAt = packet.toId || packet.fromId;
    for (let i = 0; i < splits; i += 1) {
      const target = choose(keyNodeIds);
      if (!target) continue;
      spawnPacket('dart', spawnAt, target);
    }
  }

  function applyDefenseFire(dt, hooks = {}) {
    for (const defense of runtime.defenses) {
      const info = DEFENSE_TYPES[defense.typeId];
      if (!info) continue;
      defense.cooldown -= dt;
      if (defense.cooldown > 0 || info.damage <= 0) continue;
      const node = byId.get(defense.nodeId);
      if (!node) continue;
      const target = runtime.packets
        .filter((packet) => {
          const packetNode = byId.get(packet.toId) || byId.get(packet.fromId);
          if (!packetNode) return false;
          return distanceSq(node, packetNode) <= info.range * info.range;
        })
        .sort((a, b) => a.hp - b.hp)[0];
      if (!target) continue;
      const boosted = (runtime.buffNodesUntil.get(defense.nodeId) || 0) > Date.now();
      const damage = info.damage * (boosted ? 1.45 : 1);
      target.hp -= damage;
      defense.cooldown = info.fireRate;
      if (target.hp <= 0) {
        splitPacket(target);
        runtime.packets = runtime.packets.filter((packet) => packet.id !== target.id);
        runtime.tokens += ENEMY_TYPES[target.typeId]?.reward || 1;
        hooks.onPacketDestroyed?.({ typeId: target.typeId, nodeId: defense.nodeId });
      }
    }
  }

  function packetEdgeSlowFactor(packet) {
    const edgeKey = pairKey(packet.fromId, packet.toId);
    for (const defense of runtime.defenses) {
      if (defense.typeId !== 'disruptor') continue;
      if (defense.nodeId !== packet.fromId && defense.nodeId !== packet.toId) continue;
      packet.slowedBy = edgeKey;
      return DEFENSE_TYPES.disruptor.slow;
    }
    packet.slowedBy = '';
    return 1;
  }

  function stepPackets(dt, hooks = {}) {
    const now = Date.now();
    const hitNodes = [];

    for (const packet of runtime.packets) {
      const type = ENEMY_TYPES[packet.typeId];
      if (!type) continue;
      const slow = packetEdgeSlowFactor(packet);
      packet.edgeT += dt * type.speed * slow;
      runtime.linkFlashUntil.set(pairKey(packet.fromId, packet.toId), now + 260);

      while (packet.edgeT >= 1) {
        packet.edgeT -= 1;
        packet.pathIndex += 1;
        if (packet.pathIndex >= packet.path.length - 1) {
          const hitNodeId = packet.path[packet.path.length - 1];
          hitNodes.push({ nodeId: hitNodeId, damage: type.damage, typeId: packet.typeId });
          packet.hp = -1;
          break;
        }
        packet.fromId = packet.path[packet.pathIndex];
        packet.toId = packet.path[packet.pathIndex + 1];
      }
    }

    runtime.packets = runtime.packets.filter((packet) => packet.hp > 0);

    for (const hit of hitNodes) {
      const health = runtime.nodeIntegrity.get(hit.nodeId) || 100;
      const next = clamp(health - hit.damage, 0, 160);
      runtime.nodeIntegrity.set(hit.nodeId, next);
      if (next <= 0) runtime.corruptedNodes.add(hit.nodeId);
      if (hit.typeId === 'tank') runtime.heavyHitUntil = Date.now() + 320;
      hooks.onNodeHit?.(hit);
    }
  }

  function nodeUnderAttack(nodeId) {
    return runtime.packets.some((packet) => packet.toId === nodeId || packet.fromId === nodeId);
  }

  function assignNpcSupport(now) {
    if (now < runtime.npcAssignAt) return;
    runtime.npcAssignAt = now + NPC_ASSIGN_INTERVAL_MS;
    const activeNpcs = (state?.npc?.entities || []).filter((npc) => npc?.mode === 'active');
    if (!activeNpcs.length) return;

    const criticalNodeId = [...runtime.nodeIntegrity.entries()]
      .sort((a, b) => a[1] - b[1])[0]?.[0] || runtime.selectedNodeId;

    const assignments = [
      { support: 'courier', roles: ['vendor', 'drifter'] },
      { support: 'fighter', roles: ['fighter'] },
      { support: 'agent', roles: ['agent'] },
      { support: 'recruiter', roles: ['recruiter'] },
    ];

    runtime.supportNpc = assignments.map((assignment) => {
      const npc = activeNpcs.find((entry) => assignment.roles.includes(entry.role));
      if (!npc) return null;
      const from = choose(nodes) || nodes[0];
      const to = byId.get(criticalNodeId) || from;
      return {
        npcId: npc.id,
        supportId: assignment.support,
        path: bfsPath(adjacency, from.id, to.id),
        pathIndex: 0,
        edgeT: 0,
        targetNodeId: to.id,
        cooldown: 0,
      };
    }).filter(Boolean);
  }

  function stepNpcSupport(dt, hooks = {}) {
    const npcById = new Map((state?.npc?.entities || []).map((npc) => [npc.id, npc]));
    for (const support of runtime.supportNpc) {
      const npc = npcById.get(support.npcId);
      const supportMeta = NPC_SUPPORT_TYPES[support.supportId];
      if (!npc || !supportMeta || support.path.length < 2) continue;

      support.edgeT += dt * 0.95;
      if (support.edgeT >= 1) {
        support.edgeT -= 1;
        support.pathIndex = Math.min(support.path.length - 1, support.pathIndex + 1);
      }

      const currentId = support.path[Math.max(0, support.pathIndex)];
      const nextId = support.path[Math.min(support.path.length - 1, support.pathIndex + 1)];
      const from = byId.get(currentId);
      const to = byId.get(nextId) || from;
      if (!from || !to) continue;

      npc.col = from.x + ((to.x - from.x) * support.edgeT);
      npc.row = from.y + ((to.y - from.y) * support.edgeT);

      support.cooldown -= dt;
      if (support.cooldown > 0) continue;
      if (!nodeUnderAttack(support.targetNodeId)) continue;

      if (support.supportId === 'courier') {
        const hp = runtime.nodeIntegrity.get(support.targetNodeId) || 100;
        runtime.nodeIntegrity.set(support.targetNodeId, clamp(hp + supportMeta.amount, 0, 160));
        hooks.onNpcSupport?.({ type: 'courier', nodeId: support.targetNodeId });
      } else if (support.supportId === 'fighter') {
        runtime.buffNodesUntil.set(support.targetNodeId, Date.now() + 6800);
        hooks.onNpcSupport?.({ type: 'fighter', nodeId: support.targetNodeId });
      } else if (support.supportId === 'agent') {
        runtime.revealUntil = Date.now() + 9000;
        hooks.onNpcSupport?.({ type: 'agent', nodeId: support.targetNodeId });
      } else if (support.supportId === 'recruiter') {
        const packet = runtime.packets.find((entry) => entry.toId === support.targetNodeId || entry.fromId === support.targetNodeId);
        if (packet) {
          packet.hp -= supportMeta.amount;
          if (packet.hp <= 0) {
            splitPacket(packet);
            runtime.packets = runtime.packets.filter((entry) => entry.id !== packet.id);
          }
        }
        hooks.onNpcSupport?.({ type: 'recruiter', nodeId: support.targetNodeId });
      }

      support.cooldown = supportMeta.interval;
    }
  }

  function resolveOutcome(hooks = {}, outcome = 'success') {
    if (outcome === 'success') {
      const rewardXp = 58 + Math.round(runtime.tokensGenerated * 0.8) + (runtime.waveIndex * 9);
      const rewardGems = 10 + Math.floor(runtime.waveIndex * 1.5);
      hooks.onResolve?.({
        outcome,
        rewardXp,
        rewardGems,
        stabilityBuffMs: 90 * 1000,
      });
    } else {
      hooks.onResolve?.({
        outcome,
        districtInstabilityPenalty: 6,
        samPressureDelta: 9,
      });
    }
    clearState();
  }

  function deployDefense(typeId, nodeId) {
    if (!runtime.active) return { ok: false, reason: 'Firewall event is not active.' };
    const type = DEFENSE_TYPES[typeId];
    if (!type) return { ok: false, reason: 'Unknown defense type.' };
    if (!nodeId || !byId.has(nodeId)) return { ok: false, reason: 'Select a valid node first.' };
    if (runtime.defenses.length >= runtime.placementCap) return { ok: false, reason: 'Placement cap reached.' };
    if (runtime.defenses.some((defense) => defense.nodeId === nodeId)) return { ok: false, reason: 'Node already has a defense.' };
    if (runtime.tokens < type.tokenCost) return { ok: false, reason: 'Not enough Security Tokens.' };

    runtime.tokens -= type.tokenCost;
    runtime.defenses.push({ id: `def-${Date.now()}-${typeId}`, typeId, nodeId, cooldown: type.fireRate * 0.5 });
    log(`${type.label} deployed at ${nodeId.toUpperCase()}`);
    refreshNodeDecor();
    return { ok: true };
  }

  function tick(dt, hooks = {}, blockers = {}) {
    const now = Date.now();
    tryTrigger(now, hooks, blockers);
    if (!runtime.active) return;

    if (runtime.status === 'alert' && now >= runtime.alertUntil) {
      runtime.status = 'active';
    }

    if (now >= runtime.tokenTickAt) {
      runtime.tokens += 2;
      runtime.tokensGenerated += 2;
      runtime.tokenTickAt = now + TOKEN_TICK_MS;
    }

    const elapsed = now - runtime.startedAt;
    for (const wave of runtime.waves) {
      if (!wave.spawned && elapsed >= wave.atMs) {
        spawnWave(wave, hooks);
      }
    }

    assignNpcSupport(now);
    stepPackets(dt, hooks);
    applyDefenseFire(dt, hooks);
    stepNpcSupport(dt, hooks);
    refreshNodeDecor(now);

    const keyBreached = keyNodeIds.some((id) => (runtime.nodeIntegrity.get(id) || 100) <= 0);
    const corruptedTooMany = runtime.corruptedNodes.size >= Math.ceil(nodes.length * 0.28);
    const timeExceeded = elapsed > MAX_EVENT_MS;
    const allWavesSpawned = runtime.waves.every((wave) => wave.spawned);
    const noPacketsLeft = runtime.packets.length === 0;

    if (keyBreached || corruptedTooMany || timeExceeded) {
      resolveOutcome(hooks, 'failure');
      return;
    }

    if (allWavesSpawned && noPacketsLeft) {
      resolveOutcome(hooks, 'success');
    }
  }

  function setSelectedNode(nodeId) {
    if (!nodeId || !byId.has(nodeId)) return false;
    runtime.selectedNodeId = nodeId;
    refreshNodeDecor();
    return true;
  }

  function getPublicState() {
    const now = Date.now();
    const timeLeftMs = runtime.active ? Math.max(0, MAX_EVENT_MS - (now - runtime.startedAt)) : 0;
    return {
      active: runtime.active,
      status: runtime.status,
      selectedNodeId: runtime.selectedNodeId,
      tokens: runtime.tokens,
      placementCap: runtime.placementCap,
      placementsUsed: runtime.defenses.length,
      wavesCleared: runtime.waveIndex,
      totalWaves: runtime.waves.length,
      keyNodeIntegrity: keyNodeIds.map((id) => ({ id, integrity: runtime.nodeIntegrity.get(id) || 100 })),
      corruptedNodes: runtime.corruptedNodes.size,
      packetCount: runtime.packets.length,
      revealPaths: runtime.revealUntil > now,
      heavyHit: runtime.heavyHitUntil > now,
      timeLeftMs,
      logs: runtime.logs,
      enemyTypes: Object.values(ENEMY_TYPES),
      defenseTypes: Object.values(DEFENSE_TYPES),
      npcSupportTypes: Object.values(NPC_SUPPORT_TYPES),
      packets: runtime.packets.map((packet) => ({
        id: packet.id,
        typeId: packet.typeId,
        fromId: packet.fromId,
        toId: packet.toId,
        edgeT: packet.edgeT,
        hp: packet.hp,
      })),
      defenses: runtime.defenses.map((defense) => ({ ...defense, ...DEFENSE_TYPES[defense.typeId] })),
      linkFlashes: Array.from(runtime.linkFlashUntil.entries())
        .filter(([, until]) => until > now)
        .map(([id]) => id),
    };
  }

  return {
    tick,
    setSelectedNode,
    deployDefense,
    getPublicState,
    constants: {
      enemyTypeCount: Object.keys(ENEMY_TYPES).length,
      defenseTypeCount: Object.keys(DEFENSE_TYPES).length,
      npcSupportTypeCount: Object.keys(NPC_SUPPORT_TYPES).length,
      wavePlan: WAVE_PLAN,
    },
  };
}
