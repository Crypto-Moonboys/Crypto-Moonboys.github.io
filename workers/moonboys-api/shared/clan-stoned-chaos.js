export const CRYPTO_STONED_BOYS = 'crypto-stoned-boys';
export const CHAOS_RULES_VERSION = 9;
export const CHAOS_FEATURE = 'chaos-v1';

const SIGNALS = ['Amber', 'Violet', 'Mint'];
const STABLE_MOVES = SIGNALS.map((label, index) => ({ id: 'tune-' + index, label: 'Tune ' + label }));
const SHORTCUT_PERCENT = 50;
const ROUTES = [
  {
    name: 'Backstreet Relay',
    tones: [1, 0, 2],
    artifacts: ['Neon Coil', 'Echo Dial', 'Relay Core'],
    unlock: 'The relay flashes violet.',
    recovery: 'The alley lights settle into a steady pulse.',
  },
  {
    name: 'Tunnel Frequency',
    tones: [2, 1, 0],
    artifacts: ['Tunnel Shard', 'Signal Reel', 'Switch Core'],
    unlock: 'A ripple runs down the tunnel lights.',
    recovery: 'The tunnel hum drops to a steady tone.',
  },
  {
    name: 'Rooftop Static',
    tones: [0, 2, 1],
    artifacts: ['Static Prism', 'Ghost Antenna', 'Skyline Core'],
    unlock: 'The rooftop antenna lights up.',
    recovery: 'The rooftop static clears.',
  },
];
const MOVES = {
  scouting: [
    { id: 'scan', label: 'Scan the stable route' },
    { id: 'shortcut', label: 'Try the chaos shortcut' },
  ],
  tuning: STABLE_MOVES,
  vented: [{ id: 'salvage', label: 'Extract the salvage' }],
  ready: [{ id: 'bank', label: 'Bank chaos artifact' }],
  complete: [],
};
const VENT = { id: 'vent', label: 'Vent the jam' };
const REROLL = { id: 'reroll', label: 'Spend daily reroll' };
export const CHAOS_ACTIONS = [...Object.values(MOVES).flat().map(move => move.id), VENT.id, REROLL.id];

const GRADES = { stable: 'Tuned', glitch: 'Glitched', salvage: 'Recovered' };

export function chaosFinds(routeIndex, grade) {
  return ROUTES[routeIndex].artifacts.map(artifact => artifact + ' · ' + (GRADES[grade] ?? GRADES.stable));
}

export function describeChaos(routeIndex, tier, saved = {}) {
  const route = ROUTES[routeIndex];
  const phase = tier >= route.artifacts.length ? 'complete' : saved.phase ?? 'scouting';
  const rerollAvailable = !saved.rerollUsed;
  const actions = phase === 'jammed' ? (rerollAvailable ? [VENT, REROLL] : [VENT]) : MOVES[phase];
  const ready = phase === 'ready';
  return {
    name: route.name,
    finds: route.artifacts.map(artifact => artifact + ' · Tuned / Glitched / Recovered'),
    phase,
    grade: ready ? saved.grade : null,
    target_signal: phase === 'tuning' ? SIGNALS[route.tones[tier]] : null,
    success_percent: SHORTCUT_PERCENT,
    reroll_available: rerollAvailable,
    effect: ready ? (saved.grade === 'glitch' ? route.unlock : route.recovery) : null,
    actions,
  };
}

export function advanceChaos(state, action, roll) {
  const saved = state.operationState ?? {};
  if (!describeChaos(state.route_index, state.tier, saved).actions.some(move => move.id === action)) return null;

  const next = { tier: state.tier, ore: 0, braced: 0, collapsed: 0 };
  if (action === 'bank') {
    return { ...next, tier: state.tier + 1, operationState: { rerollUsed: !!saved.rerollUsed }, outcome: 'chaos_banked' };
  }
  if (action === 'shortcut' || action === 'reroll') {
    const cleared = roll < SHORTCUT_PERCENT;
    return {
      ...next,
      operationState: {
        rerollUsed: !!saved.rerollUsed || action === 'reroll',
        phase: cleared ? 'ready' : 'jammed',
        ...(cleared ? { grade: 'glitch' } : {}),
      },
      outcome: cleared ? 'chaos_unlocked' : action === 'reroll' ? 'chaos_reroll_jammed' : 'chaos_jammed',
    };
  }
  if (action === 'scan') {
    return { ...next, operationState: { ...saved, phase: 'tuning' }, outcome: 'chaos_scanned' };
  }
  if (action === 'vent') {
    return { ...next, operationState: { ...saved, phase: 'vented' }, outcome: 'chaos_vented' };
  }
  if (action === 'salvage') {
    return { ...next, operationState: { ...saved, phase: 'ready', grade: 'salvage' }, outcome: 'chaos_salvaged' };
  }
  const required = STABLE_MOVES[ROUTES[state.route_index].tones[state.tier]].id;
  if (action !== required) return { ...next, operationState: saved, outcome: 'chaos_wrong_signal' };
  return { ...next, operationState: { ...saved, phase: 'ready', grade: 'stable' }, outcome: 'chaos_tuned' };
}
