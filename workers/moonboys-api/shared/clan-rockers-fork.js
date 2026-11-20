export const HARD_FORK_ROCKERS = 'hard-fork-rockers';
export const FORK_RULES_VERSION = 6;
export const FORK_FEATURE = 'fork-v1';

const MAX_STABILITY = 4;
const BRACE_RESTORE = 2;
const STABLE_COSTS = [1, 1, 1];
const ROUTES = [
  {
    name: 'Switchyard',
    edgeCosts: [[1, 2, 3], [2, 3, 1], [3, 1, 2]],
    stable: ['Rail Anchor Fragment', 'Switch Plate Fragment', 'Yard Anchor Fragment'],
    edge: ['Rail Edge Fragment', 'Switch Rift Fragment', 'Yard Edge Fragment'],
  },
  {
    name: 'Overpass',
    edgeCosts: [[2, 1, 3], [3, 2, 1], [1, 3, 2]],
    stable: ['Ramp Anchor Fragment', 'Span Plate Fragment', 'Deck Anchor Fragment'],
    edge: ['Ramp Rift Fragment', 'Span Edge Fragment', 'Deck Rift Fragment'],
  },
  {
    name: 'Signal Works',
    edgeCosts: [[3, 1, 2], [1, 2, 3], [2, 3, 1]],
    stable: ['Relay Anchor Fragment', 'Grid Plate Fragment', 'Tower Anchor Fragment'],
    edge: ['Relay Edge Fragment', 'Grid Rift Fragment', 'Tower Edge Fragment'],
  },
];

export function forkFinds(routeIndex, grade) {
  const route = ROUTES[routeIndex];
  return grade === 'edge' ? route.edge : route.stable;
}

export function describeFork(routeIndex, tier, saved = {}) {
  const route = ROUTES[routeIndex];
  const finds = route.stable.map((fragment, index) => fragment + ' / ' + route.edge[index]);
  const view = { name: route.name, finds, paths: [], sections: [], actions: [] };
  if (tier >= STABLE_COSTS.length) return view;

  const { fork, section = 0, stability = MAX_STABILITY, braceUsed = false } = saved;
  const edgeCosts = route.edgeCosts[tier];
  const costs = fork === 'edge' ? edgeCosts : STABLE_COSTS;
  const ready = section === costs.length;
  const stalled = !ready && fork === 'edge' && braceUsed && stability < costs[section];
  const actions = view.actions;
  if (!fork) {
    actions.push(
      { id: 'choose-stable', label: 'Take Stable Fork' },
      { id: 'choose-edge', label: 'Take Edge Fork' },
    );
  } else if (ready) {
    actions.push({ id: 'bank', label: 'Bank fork fragment' });
  } else {
    if (stability >= costs[section]) {
      actions.push({ id: 'cross', label: 'Cross section · −' + costs[section] + ' stability' });
    }
    if (fork === 'edge') {
      if (!braceUsed && stability < MAX_STABILITY) {
        actions.push({ id: 'brace', label: 'Brace · +' + Math.min(BRACE_RESTORE, MAX_STABILITY - stability) + ' stability' });
      }
      actions.push({ id: 'choose-stable', label: 'Restart this run on Stable Fork' });
    }
  }

  return {
    ...view,
    fork: fork ?? null, stability, max_stability: MAX_STABILITY,
    brace_used: braceUsed, ready, stalled,
    paths: [
      { name: 'Stable Fork', costs: STABLE_COSTS, find: route.stable[tier] },
      { name: 'Edge Fork', costs: edgeCosts, find: route.edge[tier] },
    ],
    sections: fork ? costs.map((cost, index) => ({ cost, cleared: index < section, next: index === section })) : [],
  };
}

export function advanceFork(state, action) {
  const saved = state.operationState ?? {};
  const view = describeFork(state.route_index, state.tier, saved);
  if (!view.actions.some(move => move.id === action)) return null;

  const next = { tier: state.tier, ore: 0, braced: 0, collapsed: 0 };
  if (action === 'bank') return { ...next, tier: state.tier + 1, operationState: {}, outcome: 'fork_banked' };
  if (action === 'choose-stable' || action === 'choose-edge') {
    const fork = action === 'choose-edge' ? 'edge' : 'stable';
    return {
      ...next, operationState: { fork },
      outcome: saved.fork === 'edge' ? 'fork_recovered' : 'fork_chosen',
    };
  }
  if (action === 'brace') {
    return {
      ...next, operationState: { ...saved, stability: Math.min(MAX_STABILITY, view.stability + BRACE_RESTORE), braceUsed: true },
      outcome: 'fork_braced',
    };
  }
  const section = saved.section ?? 0;
  return {
    ...next, operationState: { ...saved, section: section + 1, stability: view.stability - view.sections[section].cost },
    outcome: 'fork_crossed',
  };
}
