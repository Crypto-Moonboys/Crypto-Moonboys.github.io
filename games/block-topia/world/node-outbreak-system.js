import { CONTROL_LINKS } from './control-grid.js';

const TRIGGER_MIN_DELAY_MS = 45000;
const TRIGGER_MAX_DELAY_MS = 90000;
const TRIGGER_ROLL_INTERVAL_MS = 12000;
const TRIGGER_CHANCE = 0.22;
const INITIAL_ALERT_MS = 3800;
const MAX_EVENT_MS = 3 * 60 * 1000;
const TAKEOVER_THRESHOLD = 0.45;
const TRAIT_INTERVAL_MS = 30000;

const ACTION_COST = {
  scan: 0,
  isolate: 8,
  delayLink: 10,
  purge: 14,
};

function choose(items = []) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildAdjacency(nodes) {
  const byId = new Map((nodes || []).map((node) => [node.id, node]));
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
  return adjacency;
}

export function createNodeOutbreakSystem(state) {
  const nodes = Array.isArray(state?.controlNodes) ? state.controlNodes : [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = buildAdjacency(nodes);

  const outbreak = {
    status: 'idle',
    active: false,
    startedAt: 0,
    alertUntil: 0,
    triggerCheckAt: Date.now() + TRIGGER_MIN_DELAY_MS,
    infected: new Map(),
    isolatedUntil: new Map(),
    linkBlocks: new Map(),
    scannedUntil: new Map(),
    unstableUntil: new Map(),
    riskyNodes: new Set(),
    traits: [],
    traitNextAt: 0,
    tokens: 16,
    earned: 0,
    spreadLevel: 0,
    events: 0,
    upgrades: {
      containment: 0,
      detection: 0,
      neutralization: 0,
    },
    selectedNodeId: '',
    logs: [],
  };
  state.nodeOutbreak = outbreak;

  const TRAIT_POOL = [
    { id: 'faster-spread', name: 'Faster Spread', counter: 'containment', level: 2 },
    { id: 'hidden-spread', name: 'Hidden Spread', counter: 'detection', level: 1 },
    { id: 'resistant-node', name: 'Resistant Node', counter: 'neutralization', level: 2 },
    { id: 'burst-spread', name: 'Burst Spread', counter: 'containment', level: 1 },
  ];

  function log(text) {
    outbreak.logs.unshift({ at: Date.now(), text });
    while (outbreak.logs.length > 8) outbreak.logs.pop();
  }

  function resetNodeFlags() {
    for (const node of nodes) {
      delete node.outbreak;
    }
  }

  function markNode(nodeId) {
    const node = byId.get(nodeId);
    if (!node) return;
    const infection = outbreak.infected.get(nodeId) || 0;
    node.outbreak = {
      infected: infection > 0,
      infection,
      isolated: (outbreak.isolatedUntil.get(nodeId) || 0) > Date.now(),
      scanned: (outbreak.scannedUntil.get(nodeId) || 0) > Date.now(),
      unstable: (outbreak.unstableUntil.get(nodeId) || 0) > Date.now(),
      risky: outbreak.riskyNodes.has(nodeId),
      selected: outbreak.selectedNodeId === nodeId,
    };
  }

  function refreshNodeOverlays() {
    for (const node of nodes) {
      markNode(node.id);
    }
  }

  function deriveStats() {
    const infectedCount = [...outbreak.infected.values()].filter((v) => v > 0).length;
    const takeoverRatio = nodes.length ? infectedCount / nodes.length : 0;
    const infectionLevel = nodes.length
      ? [...outbreak.infected.values()].reduce((acc, value) => acc + value, 0) / (nodes.length * 100)
      : 0;
    const containment = clamp(1 - takeoverRatio, 0, 1);
    return {
      infectedCount,
      takeoverRatio,
      infectionLevel,
      containment,
    };
  }

  function beginAt(nodeId, hooks = {}) {
    outbreak.status = 'alert';
    outbreak.active = true;
    outbreak.startedAt = Date.now();
    outbreak.alertUntil = Date.now() + INITIAL_ALERT_MS;
    outbreak.infected = new Map([[nodeId, 52]]);
    outbreak.isolatedUntil.clear();
    outbreak.linkBlocks.clear();
    outbreak.scannedUntil.clear();
    outbreak.unstableUntil.clear();
    outbreak.riskyNodes.clear();
    outbreak.tokens = 16;
    outbreak.earned = 0;
    outbreak.traits = [];
    outbreak.traitNextAt = Date.now() + TRAIT_INTERVAL_MS;
    outbreak.spreadLevel = 0;
    outbreak.events += 1;
    outbreak.selectedNodeId = nodeId;
    log(`VIRUS ALERT at node ${nodeId.toUpperCase()}`);
    refreshNodeOverlays();
    hooks.onStart?.({ nodeId, outbreakIndex: outbreak.events });
  }

  function canTrigger(now = Date.now(), hasDuel = false) {
    if (outbreak.active || hasDuel) return false;
    if (now < outbreak.triggerCheckAt) return false;
    return true;
  }

  function tryTrigger(now, hooks = {}, hasDuel = false) {
    if (!canTrigger(now, hasDuel)) return false;
    outbreak.triggerCheckAt = now + TRIGGER_ROLL_INTERVAL_MS;
    if (Math.random() > TRIGGER_CHANCE) return false;
    const seed = choose(nodes);
    if (!seed) return false;
    beginAt(seed.id, hooks);
    return true;
  }

  function activeTrait(id) {
    return outbreak.traits.find((trait) => trait.id === id && !trait.suppressed);
  }

  function spreadIntervalMs(now) {
    const elapsed = now - outbreak.startedAt;
    const ramp = clamp(elapsed / 100000, 0, 1);
    let interval = 7600 - ramp * 2800;
    if (activeTrait('faster-spread')) interval *= 0.68;
    interval *= 1 - (outbreak.upgrades.containment * 0.08);
    return Math.max(2000, interval);
  }

  function isLinkBlocked(aId, bId, now) {
    const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
    return (outbreak.linkBlocks.get(key) || 0) > now;
  }

  function pickSpreadTarget(fromId, now) {
    const neighbors = [...(adjacency.get(fromId) || [])];
    const candidates = neighbors.filter((neighborId) => (
      !isLinkBlocked(fromId, neighborId, now)
      && (outbreak.isolatedUntil.get(neighborId) || 0) <= now
      && (outbreak.infected.get(neighborId) || 0) <= 0
    ));
    if (!candidates.length) return null;
    return choose(candidates);
  }

  function addTokens(amount, why) {
    if (!amount) return;
    outbreak.tokens += amount;
    outbreak.earned += amount;
    log(`+${amount} tokens · ${why}`);
  }

  function evolveTrait(hooks = {}) {
    const available = TRAIT_POOL.filter((trait) => !outbreak.traits.some((t) => t.id === trait.id));
    const next = choose(available);
    if (!next) return;
    outbreak.traits.push({ ...next, suppressed: false });
    log(`Virus trait evolved: ${next.name}`);
    hooks.onTrait?.(next);
  }

  function applyCounters() {
    for (const trait of outbreak.traits) {
      const level = outbreak.upgrades[trait.counter] || 0;
      trait.suppressed = level >= trait.level;
    }
  }

  function clearOutbreakState() {
    outbreak.active = false;
    outbreak.status = 'idle';
    outbreak.infected.clear();
    outbreak.isolatedUntil.clear();
    outbreak.linkBlocks.clear();
    outbreak.scannedUntil.clear();
    outbreak.unstableUntil.clear();
    outbreak.riskyNodes.clear();
    outbreak.selectedNodeId = '';
    outbreak.triggerCheckAt = Date.now() + TRIGGER_MIN_DELAY_MS + Math.random() * (TRIGGER_MAX_DELAY_MS - TRIGGER_MIN_DELAY_MS);
    resetNodeFlags();
  }

  function resolveSuccess(hooks = {}) {
    const rewardXp = 42 + outbreak.earned;
    const rewardGems = 8 + Math.floor(outbreak.earned / 4);
    hooks.onResolve?.({
      outcome: 'success',
      rewardXp,
      rewardGems,
      tokensEarned: outbreak.earned,
      events: outbreak.events,
    });
    clearOutbreakState();
  }

  function resolveFailure(hooks = {}) {
    hooks.onResolve?.({
      outcome: 'failure',
      samPressureDelta: 12,
      districtControlPenalty: 8,
      events: outbreak.events,
    });
    clearOutbreakState();
  }

  function scanNode(nodeId) {
    if (!outbreak.active || !nodeId) return { ok: false, reason: 'No active outbreak.' };
    const now = Date.now();
    outbreak.scannedUntil.set(nodeId, now + 14000 + outbreak.upgrades.detection * 4000);
    if (outbreak.infected.get(nodeId) > 0) {
      addTokens(3 + outbreak.upgrades.detection, `infected scan ${nodeId.toUpperCase()}`);
    } else {
      addTokens(1, `clean scan ${nodeId.toUpperCase()}`);
      const nearInfected = [...(adjacency.get(nodeId) || [])].some((neighbor) => (outbreak.infected.get(neighbor) || 0) > 0);
      if (nearInfected) outbreak.riskyNodes.add(nodeId);
    }
    markNode(nodeId);
    return { ok: true };
  }

  function isolateNode(nodeId) {
    if (!outbreak.active || !nodeId) return { ok: false, reason: 'No active outbreak.' };
    if (outbreak.tokens < ACTION_COST.isolate) return { ok: false, reason: 'Not enough tokens.' };
    outbreak.tokens -= ACTION_COST.isolate;
    const now = Date.now();
    const duration = 12000 + outbreak.upgrades.containment * 5000;
    outbreak.isolatedUntil.set(nodeId, now + duration);
    log(`Node ${nodeId.toUpperCase()} isolated`);
    markNode(nodeId);
    return { ok: true };
  }

  function delayLink(nodeId) {
    if (!outbreak.active || !nodeId) return { ok: false, reason: 'No active outbreak.' };
    if (outbreak.tokens < ACTION_COST.delayLink) return { ok: false, reason: 'Not enough tokens.' };
    const neighbor = [...(adjacency.get(nodeId) || [])]
      .map((id) => ({ id, infection: outbreak.infected.get(id) || 0 }))
      .sort((a, b) => b.infection - a.infection)[0];
    if (!neighbor) return { ok: false, reason: 'No valid link from node.' };
    outbreak.tokens -= ACTION_COST.delayLink;
    const key = nodeId < neighbor.id ? `${nodeId}|${neighbor.id}` : `${neighbor.id}|${nodeId}`;
    outbreak.linkBlocks.set(key, Date.now() + 9000 + outbreak.upgrades.containment * 4000);
    log(`Link delayed ${nodeId.toUpperCase()} ↔ ${neighbor.id.toUpperCase()}`);
    return { ok: true };
  }

  function purgeNode(nodeId) {
    if (!outbreak.active || !nodeId) return { ok: false, reason: 'No active outbreak.' };
    if (outbreak.tokens < ACTION_COST.purge) return { ok: false, reason: 'Not enough tokens.' };
    const infection = outbreak.infected.get(nodeId) || 0;
    if (infection <= 0) return { ok: false, reason: 'Node is not infected.' };
    outbreak.tokens -= ACTION_COST.purge;
    let power = 44 + outbreak.upgrades.neutralization * 20;
    if (activeTrait('resistant-node')) power *= 0.7;
    const next = Math.max(0, infection - power);
    outbreak.infected.set(nodeId, next);
    if (next <= 0) {
      outbreak.infected.delete(nodeId);
      addTokens(6 + outbreak.upgrades.neutralization, `cleansed ${nodeId.toUpperCase()}`);
    }
    if (Math.random() < 0.22 && infection > 70) {
      outbreak.unstableUntil.set(nodeId, Date.now() + 7000);
      const node = byId.get(nodeId);
      if (node) node.status = 'unstable';
      log(`Node ${nodeId.toUpperCase()} instability after heavy purge`);
    }
    markNode(nodeId);
    return { ok: true };
  }

  function upgrade(tree) {
    const current = outbreak.upgrades[tree];
    if (current === undefined) return { ok: false, reason: 'Invalid tree.' };
    if (current >= 2) return { ok: false, reason: 'Tree maxed.' };
    const cost = 12 + current * 8;
    if (outbreak.tokens < cost) return { ok: false, reason: 'Not enough tokens.' };
    outbreak.tokens -= cost;
    outbreak.upgrades[tree] += 1;
    applyCounters();
    log(`${tree} upgraded to level ${outbreak.upgrades[tree]}`);
    return { ok: true };
  }

  function setSelectedNode(nodeId) {
    outbreak.selectedNodeId = nodeId || '';
    refreshNodeOverlays();
  }

  function tick(dt, hooks = {}, options = {}) {
    const now = Date.now();
    if (!outbreak.active) {
      tryTrigger(now, hooks, Boolean(options.duelActive));
      return;
    }

    if (outbreak.status === 'alert' && now >= outbreak.alertUntil) {
      outbreak.status = 'active';
      log('Operator engaged NODE OUTBREAK DEFENSE');
      hooks.onState?.('active');
    }

    if (now - outbreak.startedAt >= MAX_EVENT_MS) {
      resolveFailure(hooks);
      return;
    }

    applyCounters();
    if (now >= outbreak.traitNextAt) {
      evolveTrait(hooks);
      outbreak.traitNextAt = now + TRAIT_INTERVAL_MS;
    }

    const interval = spreadIntervalMs(now);
    outbreak.spreadLevel = clamp((now - outbreak.startedAt) / MAX_EVENT_MS, 0, 1);

    const infectedIds = [...outbreak.infected.keys()];
    for (const nodeId of infectedIds) {
      const infection = outbreak.infected.get(nodeId) || 0;
      if (infection <= 0) {
        outbreak.infected.delete(nodeId);
        continue;
      }
      const node = byId.get(nodeId);
      if (!node) continue;
      const isolated = (outbreak.isolatedUntil.get(nodeId) || 0) > now;
      if (!node._outbreakSpreadAt) node._outbreakSpreadAt = now + interval;
      if (now >= node._outbreakSpreadAt) {
        node._outbreakSpreadAt = now + interval;
        if (!isolated) {
          const target = pickSpreadTarget(nodeId, now);
          if (target) {
            outbreak.infected.set(target, 35 + Math.random() * 20);
            addTokens(2, `containment reaction at ${target.toUpperCase()}`);
            hooks.onSpread?.({ fromId: nodeId, toId: target });
            if (activeTrait('burst-spread') && Math.random() < 0.38) {
              const burst = pickSpreadTarget(target, now);
              if (burst) {
                outbreak.infected.set(burst, 28 + Math.random() * 18);
                hooks.onSpread?.({ fromId: target, toId: burst, burst: true });
              }
            }
          }
        }
      }

      const growthBase = 6 + outbreak.spreadLevel * 8;
      const growth = isolated ? growthBase * 0.36 : growthBase;
      outbreak.infected.set(nodeId, clamp(infection + growth * dt, 0, 100));
      markNode(nodeId);
    }

    const stats = deriveStats();
    if (stats.infectedCount === 0 && outbreak.status !== 'alert') {
      resolveSuccess(hooks);
      return;
    }
    if (stats.takeoverRatio >= TAKEOVER_THRESHOLD) {
      resolveFailure(hooks);
      return;
    }

    refreshNodeOverlays();
    hooks.onProgress?.({
      ...stats,
      pressure: stats.takeoverRatio,
      spreadLevel: outbreak.spreadLevel,
    });
  }

  function getPublicState() {
    const stats = deriveStats();
    return {
      ...stats,
      ...outbreak,
      traits: outbreak.traits.map((trait) => ({ ...trait })),
      logs: [...outbreak.logs],
      actionCost: { ...ACTION_COST },
      takeoverThreshold: TAKEOVER_THRESHOLD,
    };
  }

  return {
    tick,
    getPublicState,
    setSelectedNode,
    actions: {
      scanNode,
      isolateNode,
      delayLink,
      purgeNode,
      upgrade,
    },
  };
}
