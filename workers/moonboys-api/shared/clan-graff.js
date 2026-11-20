export const GRAFFPUNKS = 'graffpunks';
export const WALL_RULES_VERSION = 2;

const PANELS = ['Left', 'Centre', 'Right'];
const ROUTES = [
  {
    name: 'Signal Wall',
    paint: ['Outline', 'Chrome', 'Signal pink'],
    combos: [[0, 1], [1, 2]],
    stencils: [[0, 1, 2], [2, 1, 0], [1, 0, 2]],
    finds: ['Signal Outline', 'Chrome Joint', 'Pink Frequency'],
  },
  {
    name: 'Underpass Triptych',
    paint: ['Chalk', 'Ultraviolet', 'Acid lime'],
    combos: [[0, 2], [0, 1]],
    stencils: [[1, 2, 1], [0, 0, 2], [2, 0, 1]],
    finds: ['Chalk Rubbing', 'UV Throwie', 'Lime Overprint'],
  },
  {
    name: 'Rooftop Relay',
    paint: ['Primer', 'Copper', 'Sky blue'],
    combos: [[1, 2], [0, 2]],
    stencils: [[2, 0, 0], [1, 2, 0], [0, 2, 1]],
    finds: ['Roof Primer', 'Copper Relay', 'Skyline Finish'],
  },
];

const START_OFFSETS = [[1, 1, 2], [1, 2, 2], [2, 2, 2]];

export function describeWall(routeIndex, tier, savedPanels) {
  const route = ROUTES[routeIndex];
  const stencil = route.stencils[tier] ?? null;
  if (!stencil) return { name: route.name, finds: route.finds, panels: [], actions: [] };

  const panels = savedPanels ?? stencil.map((shade, index) => (shade + 3 - START_OFFSETS[tier][index]) % 3);
  const matched = stencil.every((shade, index) => shade === panels[index]);
  const actions = matched ? [{ id: 'bank', label: 'Bank mural layer' }] : [
    ...PANELS.map((name, index) => ({ id: `paint-${index}`, label: `Cycle ${name.toLowerCase()}` })),
    ...route.combos.map(([a, b], index) => ({
      id: `blend-${index}`, label: `Combo: ${PANELS[a]} + ${PANELS[b]}`,
    })),
  ];
  return {
    name: route.name,
    finds: route.finds,
    panels: panels.map((shade, index) => ({
      name: PANELS[index], shade, paint: route.paint[shade], target: route.paint[stencil[index]],
      matched: shade === stencil[index],
    })),
    actions,
  };
}

export function advanceWall(state, action) {
  const wall = describeWall(state.route_index, state.tier, state.operationState.panels);
  if (!wall.actions.some(move => move.id === action)) return null;
  const next = { tier: state.tier, ore: 0, braced: 0, collapsed: 0 };
  if (action === 'bank') {
    return { ...next, tier: state.tier + 1, operationState: {}, outcome: 'layer_banked' };
  }

  const route = ROUTES[state.route_index];
  const [kind, index] = action.split('-');
  const selected = kind === 'blend' ? route.combos[index] : [Number(index)];
  const panels = wall.panels.map(({ shade }, panel) => selected.includes(panel) ? (shade + 1) % 3 : shade);
  return { ...next, operationState: { panels }, outcome: kind === 'blend' ? 'combo_painted' : 'panel_painted' };
}
