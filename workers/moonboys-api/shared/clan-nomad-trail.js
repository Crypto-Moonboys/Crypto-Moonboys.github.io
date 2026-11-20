export const NOMAD_BEARS = 'nomad-bears';
export const TRAIL_RULES_VERSION = 3;
export const TRAIL_FEATURE = 'trail-v1';

const START_SUPPLIES = 2;

// Paths are bidirectional. Paid shortcuts skip part of the route, but
// every expedition can be finished without spending supplies.
const TRAILS = [
  {
    name: 'Frostline Traverse',
    stops: ['South Gate', 'Supply Depot', 'Frost Ridge', 'Relay Mast', 'Ice Pass', 'North Camp'],
    paths: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [0, 4], [0, 2, 1], [2, 4, 1], [1, 5, 2]],
    legs: [[0, [2, 3], 5], [5, [1, 4], 0], [0, [1, 3], 5]],
    finds: ['Frost Ridge Sketch', 'Ice Pass Chart', 'North Camp Map'],
  },
  {
    name: 'Canal Crossings',
    stops: ['Lock House', 'Towpath', 'Sunken Yard', 'Signal Bridge', 'Wetlands', 'Ferry Camp'],
    paths: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [0, 3, 1], [2, 4, 1], [3, 5, 2]],
    legs: [[0, [2, 3], 5], [5, [1, 4], 0], [0, [2, 4], 5]],
    finds: ['Yard Rubbing', 'Wetland Survey', 'Canal Crossings Map'],
  },
  {
    name: 'Rooftop Passage',
    stops: ['Loading Bay', 'Clock Steps', 'Rooftop Garden', 'Antenna Deck', 'Skywalk', 'Lookout Camp'],
    paths: [[0, 1], [1, 2], [2, 4], [4, 3], [3, 5], [1, 3], [0, 2, 1], [2, 3, 2], [4, 5, 1]],
    legs: [[0, [2, 4], 5], [5, [1, 3], 0], [0, [2, 3], 5]],
    finds: ['Garden Survey', 'Antenna Bearings', 'Skywalk Atlas'],
  },
];

function expedition(routeIndex, tier, saved) {
  const route = TRAILS[routeIndex];
  const leg = route.legs[tier];
  if (!leg) return { route, actions: [] };
  const [start, waypoints, camp] = leg;
  const position = saved?.position ?? start;
  const surveyed = saved?.surveyed ?? 0;
  const supplies = saved?.supplies ?? START_SUPPLIES;
  const neighbors = route.stops.map(() => []);
  for (const [a, b, cost = 0] of route.paths) {
    neighbors[a].push({ stop: b, cost });
    neighbors[b].push({ stop: a, cost });
  }
  const isSurveyed = stop => Boolean(surveyed & (1 << stop));
  const ready = position === camp && waypoints.every(isSurveyed);
  const actions = ready ? [{ id: 'bank', label: 'Bank route fragment' }] : neighbors[position]
    .filter(({ cost }) => cost <= supplies)
    .map(({ stop, cost }) => ({
      id: `travel-${stop}`,
      label: cost ? `Shortcut to ${route.stops[stop]} · ${cost} supply` : `Walk to ${route.stops[stop]}`,
    }));
  return { route, leg, position, surveyed, supplies, neighbors, isSurveyed, actions };
}

export function describeTrail(routeIndex, tier, saved) {
  const state = expedition(routeIndex, tier, saved);
  const { route, leg, position, supplies, neighbors, isSurveyed, actions } = state;
  if (!leg) return { name: route.name, finds: route.finds, locations: [], actions: [] };

  const [, waypoints, camp] = leg;
  return {
    name: route.name,
    finds: route.finds,
    position: route.stops[position],
    camp: route.stops[camp],
    supplies,
    objectives: waypoints.map(stop => ({ name: route.stops[stop], surveyed: isSurveyed(stop) })),
    locations: route.stops.map((name, stop) => ({
      name,
      current: stop === position,
      camp: stop === camp,
      waypoint: waypoints.includes(stop),
      surveyed: isSurveyed(stop),
      paths: neighbors[stop].map(path => ({ name: route.stops[path.stop], cost: path.cost })),
    })),
    actions,
  };
}

export function advanceTrail(state, action) {
  const current = expedition(state.route_index, state.tier, state.operationState);
  if (!current.actions.some(move => move.id === action)) return null;
  const next = { tier: state.tier, ore: 0, braced: 0, collapsed: 0 };
  if (action === 'bank') {
    return { ...next, tier: state.tier + 1, operationState: {}, outcome: 'trail_banked' };
  }
  const stop = Number(action.slice('travel-'.length));
  const { cost } = current.neighbors[current.position].find(path => path.stop === stop);
  const waypoint = current.leg[1].includes(stop) && !current.isSurveyed(stop);
  return {
    ...next,
    operationState: {
      position: stop,
      surveyed: waypoint ? current.surveyed | (1 << stop) : current.surveyed,
      supplies: current.supplies - cost,
    },
    outcome: waypoint ? 'trail_surveyed' : cost ? 'trail_shortcut' : 'trail_walked',
  };
}
