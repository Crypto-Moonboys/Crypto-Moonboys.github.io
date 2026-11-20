export const MINERS = 'rugpull-miners';
export const RULES_VERSION = 1;
export const RENOWN_PER_TIER = 10_000;

const ROUTES = [
  { name: 'Chrome Fault', finds: ['Chrome Flake', 'Mirror Ore', 'Fault Core'], targets: [4, 5, 6], collapse: 2 },
  { name: 'Static Vein', finds: ['Static Quartz', 'Live Wire Ore', 'Signal Core'], targets: [3, 5, 7], collapse: 3 },
  { name: 'Black Glass Shaft', finds: ['Black Glass', 'Obsidian Lattice', 'Glass Heart'], targets: [4, 4, 7], collapse: 4 },
];

const DAY_MS = 86_400_000;
export function dailyRouteIndex(now) {
  return Math.floor(now.getTime() / DAY_MS) % ROUTES.length;
}

export function describeMine(routeIndex, state) {
  const route = ROUTES[routeIndex];
  const target = route.targets[state.tier] ?? null;
  const actions = state.tier === 3 ? []
    : state.collapsed ? ['recover']
    : target <= state.ore ? ['bank']
    : state.braced ? ['deep', 'safe'] : ['safe', 'brace', 'deep'];
  return {
    name: route.name,
    targets: route.targets,
    finds: route.finds,
    collapse_percent: route.collapse * 10,
    target,
    actions,
    renown_per_tier: RENOWN_PER_TIER,
  };
}

// The browser supplies a move. The saved state and server roll determine the result.
export function advanceMine(state, action, roll) {
  const mine = describeMine(state.route_index, state);
  if (!mine.actions.includes(action)) return null;
  const next = { tier: state.tier, ore: state.ore, braced: state.braced, collapsed: state.collapsed };
  let outcome;
  switch (action) {
    case 'safe':
      next.ore += 1;
      outcome = 'safe_ore';
      break;
    case 'brace':
      next.braced = 1;
      outcome = 'shaft_braced';
      break;
    case 'deep':
      if (!state.braced && roll < mine.collapse_percent) {
        next.ore = Math.max(0, next.ore - 2);
        next.collapsed = 1;
        outcome = 'cave_in';
      } else {
        next.ore += 3;
        next.braced = 0;
        outcome = 'deep_ore';
      }
      break;
    case 'recover':
      next.collapsed = 0;
      next.braced = 1;
      outcome = 'recovered';
      break;
    case 'bank':
      next.tier += 1;
      next.ore = 0;
      next.braced = 0;
      outcome = 'tier_banked';
      break;
  }
  if (mine.target != null) next.ore = Math.min(mine.target, next.ore);
  return { ...next, outcome };
}
