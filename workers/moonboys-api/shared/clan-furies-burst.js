export const BLOCKCHAIN_FURIES = 'blockchain-furies';
export const BURST_RULES_VERSION = 7;
export const BURST_FEATURE = 'burst-v1';

const ROUTES = [
  {
    name: 'Neon Relay',
    clean: ['Neon Spark Emblem', 'Relay Arc Emblem', 'Neon Relay Crown'],
    comeback: ['Neon Reignite Emblem', 'Relay Rebound Emblem', 'Neon Revenge Crown'],
  },
  {
    name: 'Signal Yard',
    clean: ['Yard Spark Emblem', 'Antenna Arc Emblem', 'Signal Yard Crown'],
    comeback: ['Yard Reignite Emblem', 'Antenna Rebound Emblem', 'Signal Revenge Crown'],
  },
  {
    name: 'Transit Deck',
    clean: ['Deck Spark Emblem', 'Transit Arc Emblem', 'Transit Deck Crown'],
    comeback: ['Deck Reignite Emblem', 'Transit Rebound Emblem', 'Transit Revenge Crown'],
  },
];
const PADS = ['Flare', 'Arc', 'Pulse', 'Echo'];
const PAD_MOVES = PADS.map((label, index) => ({ id: 'pad-' + index, label }));
const MOVES = {
  idle: [{ id: 'prepare', label: 'Reveal burst sequence' }],
  preview: [{ id: 'start', label: 'Hide sequence and start' }],
  burst: PAD_MOVES,
  comeback: PAD_MOVES,
  bank: [{ id: 'bank', label: 'Bank Fury emblem' }],
  complete: [],
};
export const BURST_ACTIONS = ['prepare', 'start', ...PAD_MOVES.map(move => move.id), 'bank'];

export function burstFinds(routeIndex, grade) {
  const route = ROUTES[routeIndex];
  return grade === 'comeback' ? route.comeback : route.clean;
}

export function describeBurst(routeIndex, tier, saved = {}) {
  const route = ROUTES[routeIndex];
  const phase = tier === route.clean.length ? 'complete' : saved.phase ?? 'idle';
  const showCues = phase === 'preview' || phase === 'comeback';
  return {
    name: route.name,
    finds: route.clean.map((find, index) => find + ' / ' + route.comeback[index]),
    phase,
    step: saved.step ?? 0,
    length: saved.pattern?.length ?? 3 + tier,
    comeback: !!saved.comeback,
    cues: showCues ? saved.pattern.map(index => PADS[index]) : [],
    actions: MOVES[phase],
  };
}

export function advanceBurst(state, action) {
  const saved = state.operationState ?? {};
  const view = describeBurst(state.route_index, state.tier, saved);
  if (!view.actions.some(move => move.id === action)) return null;

  const next = { tier: state.tier, ore: 0, braced: 0, collapsed: 0 };
  if (action === 'bank') {
    return { ...next, tier: state.tier + 1, operationState: {}, outcome: 'burst_banked' };
  }
  if (action === 'prepare') {
    const pattern = Array.from(crypto.getRandomValues(new Uint8Array(view.length)), value => value % PADS.length);
    return { ...next, operationState: { phase: 'preview', pattern }, outcome: 'burst_prepared' };
  }
  if (action === 'start') {
    return { ...next, operationState: { ...saved, phase: 'burst' }, outcome: 'burst_started' };
  }
  if (action === PAD_MOVES[saved.pattern[view.step]].id) {
    const step = view.step + 1;
    const phase = step === view.length ? 'bank' : view.phase;
    return { ...next, operationState: { ...saved, phase, step }, outcome: 'burst_step' };
  }
  if (view.comeback) {
    return { ...next, operationState: { ...saved, step: 0 }, outcome: 'comeback_missed' };
  }
  const pattern = saved.pattern.slice(0, 3).reverse();
  const operationState = { phase: 'comeback', pattern, comeback: true };
  return { ...next, operationState, outcome: 'burst_missed' };
}
