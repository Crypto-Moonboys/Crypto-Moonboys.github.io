export const BLOCKSTARS = 'blockstars';
export const SPOTLIGHT_RULES_VERSION = 8;
export const SPOTLIGHT_FEATURE = 'spotlight-v1';

const ROUTES = [
  {
    title: 'Meme Swarm 3008', path: '/games/meme-swarm-3008/',
    moves: ['Bait', 'Sweep', 'Burst'],
    cues: [[0, 0, 1, 0], [1, 2, 1, 2], [2, 0, 0, 2]],
    headliner: ['Swarm Marquee', 'Swarm Main Stage', 'Swarm Grand Finale'],
    freestyle: ['Swarm Remix', 'Swarm Bootleg', 'Swarm Encore'],
  },
  {
    title: 'Invaders 3008', path: '/games/invaders-3008/',
    moves: ['Dodge', 'Volley', 'Strafe'],
    cues: [[1, 1, 2, 1], [2, 0, 2, 0], [0, 1, 1, 0]],
    headliner: ['Invaders Marquee', 'Invaders Main Stage', 'Invaders Grand Finale'],
    freestyle: ['Invaders Remix', 'Invaders Bootleg', 'Invaders Encore'],
  },
  {
    title: 'Pac Chain', path: '/games/pac-chain/',
    moves: ['Dash', 'Feint', 'Loop'],
    cues: [[2, 0, 0, 2], [0, 1, 0, 1], [1, 2, 1, 2]],
    headliner: ['Pac Chain Marquee', 'Pac Chain Main Stage', 'Pac Chain Grand Finale'],
    freestyle: ['Pac Chain Remix', 'Pac Chain Bootleg', 'Pac Chain Encore'],
  },
];
const STYLES = [
  { id: 'headliner', name: 'Headliner', targets: [4, 6, 8] },
  { id: 'freestyle', name: 'Freestyle', targets: [6, 8, 9] },
];
const MOVE_IDS = ['perform-0', 'perform-1', 'perform-2'];
export const SPOTLIGHT_ACTIONS = ['book-headliner', 'book-freestyle', ...MOVE_IDS, 'restart', 'bank'];

export function spotlightFinds(routeIndex, grade) {
  return ROUTES[routeIndex][grade === 'freestyle' ? 'freestyle' : 'headliner'];
}

function applauseFor(style, cue, played, move) {
  if (style === 'headliner') return move === cue ? 2 : 0;
  return (played.includes(move) ? 0 : 2) + (move === cue ? 1 : 0);
}

export function describeSpotlight(routeIndex, tier, saved = {}) {
  const route = ROUTES[routeIndex];
  const view = {
    name: route.title + ' Spotlight',
    featured: { title: route.title, path: route.path },
    finds: route.headliner.map((find, index) => find + ' / ' + route.freestyle[index]),
    actions: [], beats: [], styles: [],
  };
  if (tier >= route.cues.length) return view;

  const lineup = STYLES.map(style => ({
    id: style.id, name: style.name, target: style.targets[tier], find: route[style.id][tier],
  }));
  const style = lineup.find(entry => entry.id === saved.style);
  if (!style) {
    return {
      ...view, styles: lineup,
      actions: lineup.map(entry => ({ id: 'book-' + entry.id, label: 'Book ' + entry.name })),
    };
  }

  const calls = route.cues[tier];
  const played = saved.played ?? [];
  const applause = saved.applause ?? 0;
  const beat = played.length;
  const ready = beat === calls.length && applause >= style.target;
  let actions = [{ id: 'restart', label: 'Restart set' }];
  if (ready) {
    actions = [{ id: 'bank', label: 'Bank poster panel' }];
  } else if (beat < calls.length) {
    actions = MOVE_IDS.map((id, move) => ({ id, label: route.moves[move] }));
    if (beat) actions.push({ id: 'restart', label: 'Restart set' });
  }
  return {
    ...view, style, applause, ready, actions,
    beats: calls.map((call, index) => ({
      cue: route.moves[call],
      played: index < beat ? route.moves[played[index]] : null,
      next: index === beat,
    })),
  };
}

export function advanceSpotlight(state, action) {
  const saved = state.operationState ?? {};
  const view = describeSpotlight(state.route_index, state.tier, saved);
  if (!view.actions.some(move => move.id === action)) return null;

  const next = { tier: state.tier, ore: 0, braced: 0, collapsed: 0 };
  if (action === 'bank') {
    return { ...next, tier: state.tier + 1, operationState: {}, outcome: 'spotlight_banked' };
  }
  if (action === 'restart') return { ...next, operationState: {}, outcome: 'spotlight_restarted' };
  if (action.startsWith('book-')) {
    return { ...next, operationState: { style: action.slice(5) }, outcome: 'spotlight_booked' };
  }

  const played = saved.played ?? [];
  const move = MOVE_IDS.indexOf(action);
  const cue = ROUTES[state.route_index].cues[state.tier][played.length];
  const applause = view.applause + applauseFor(saved.style, cue, played, move);
  return {
    ...next,
    operationState: { ...saved, played: [...played, move], applause },
    outcome: 'spotlight_performed',
  };
}
