export const ALL_CITY_BULLS = 'all-city-bulls';
export const DISTRICT_RULES_VERSION = 4;

const CONTROL_MAX = 3;
const SECURE_CONTROL = 2;
const DISTRICTS = [
  {
    name: 'Market District',
    lanes: ['Market Gate', 'Exchange Steps', 'Loading Court'],
    pressure: [0, 1, 2, 1],
    finds: ['Market Gate Mark', 'Exchange Mark', 'Market District Crest'],
  },
  {
    name: 'Rail District',
    lanes: ['Station Steps', 'Track Bridge', 'Freight Yard'],
    pressure: [2, 0, 2, 1],
    finds: ['Station Mark', 'Freight Mark', 'Rail District Crest'],
  },
  {
    name: 'Dock District',
    lanes: ['West Pier', 'Cargo Ramp', 'Flood Gate'],
    pressure: [1, 2, 0, 2, 0],
    finds: ['Pier Mark', 'Flood Gate Mark', 'Dock District Crest'],
  },
];

function districtState(routeIndex, tier, saved) {
  const district = DISTRICTS[routeIndex];
  if (tier >= 3) return { district, actions: [] };

  const control = saved?.control ?? [0, 0, 0];
  const beat = saved?.beat ?? 0;
  const held = saved?.held ?? false;
  const pressureLane = district.pressure[(beat + tier) % district.pressure.length];
  const ready = held && control.every(value => value >= SECURE_CONTROL);
  const actions = [];
  if (ready) {
    actions.push({ id: 'bank', label: 'Bank territory mark' });
  } else {
    district.lanes.forEach((name, lane) => {
      if (control[lane] < CONTROL_MAX) actions.push({ id: `push-${lane}`, label: `Push ${name}` });
    });
    // A hold answers the announced pressure on a point the player already controls.
    if (control[pressureLane] > 0) {
      actions.push({ id: `hold-${pressureLane}`, label: `Hold ${district.lanes[pressureLane]}` });
    }
  }
  return { district, control, beat, held, pressureLane, actions };
}

export function describeDistrict(routeIndex, tier, saved) {
  const { district, control, held, pressureLane, actions } = districtState(routeIndex, tier, saved);
  const summary = { name: district.name, finds: district.finds, actions };
  if (!control) return { ...summary, lanes: [] };
  return {
    ...summary,
    held,
    next_pressure: district.lanes[pressureLane],
    lanes: district.lanes.map((name, lane) => ({
      name, control: control[lane], max_control: CONTROL_MAX,
      secured: control[lane] >= SECURE_CONTROL, under_pressure: lane === pressureLane,
    })),
  };
}

export function advanceDistrict(state, action) {
  const { district, control, beat, held, pressureLane, actions } = districtState(
    state.route_index, state.tier, state.operationState,
  );
  if (!actions.some(move => move.id === action)) return null;
  const next = { tier: state.tier, ore: 0, braced: 0, collapsed: 0 };
  if (action === 'bank') {
    return { ...next, tier: state.tier + 1, operationState: {}, outcome: 'district_banked' };
  }
  const [move, index] = action.split('-');
  const lane = Number(index);
  const isHold = move === 'hold';
  const points = [...control];
  points[lane] = Math.min(CONTROL_MAX, points[lane] + (isHold ? 1 : 2));
  if (!isHold) points[pressureLane] = Math.max(0, points[pressureLane] - 1);
  return {
    ...next,
    operationState: { control: points, beat: (beat + 1) % district.pressure.length, held: held || isHold },
    outcome: isHold ? 'district_held' : 'district_pushed',
  };
}
