export const CRYPTO_MOONGIRLS = 'crypto-moongirls';
export const SIGNAL_RULES_VERSION = 5;
export const SIGNAL_FEATURE = 'signal-v1';

const FILTERS = [
  { id: 'band', label: 'Band', values: ['Low', 'High'] },
  { id: 'pulse', label: 'Pulse', values: ['Single', 'Double'] },
  { id: 'phase', label: 'Phase', values: ['Lead', 'Lag'] },
];
const CHANNEL_COUNT = 2 ** FILTERS.length;
const BANKS_PER_DAY = 3;
const ROUTES = [
  { name: 'Transit Relay', finds: ['Transit Trace', 'Relay Fingerprint', 'Transit Signal Dossier'] },
  { name: 'Rooftop Array', finds: ['Rooftop Trace', 'Array Fingerprint', 'Rooftop Signal Dossier'] },
  { name: 'Harbour Beacon', finds: ['Harbour Trace', 'Beacon Fingerprint', 'Harbour Signal Dossier'] },
];

function signalState(routeIndex, tier, utcDay, saved = {}) {
  const route = ROUTES[routeIndex];
  if (tier >= BANKS_PER_DAY) return { route, candidates: [], measurements: [], actions: [] };

  const patternOffset = routeIndex * 3 + tier * 5;
  const dayIndex = Math.floor(Date.parse(utcDay + 'T00:00:00Z') / 86_400_000);
  const targetIndex = (dayIndex + tier * (routeIndex + 1)) % CHANNEL_COUNT;
  const channels = Array.from({ length: CHANNEL_COUNT }, (_, index) => {
    const pattern = (index + patternOffset) % CHANNEL_COUNT;
    return {
      id: index,
      name: 'Channel ' + String.fromCharCode(65 + index),
      traits: FILTERS.map(({ label, values }, bit) => ({ label, value: values[(pattern >> bit) & 1] })),
    };
  });
  const target = channels[targetIndex];
  const scans = saved.scans ?? [];
  const measurements = FILTERS.flatMap(({ id }, bit) => scans.includes(id) ? [target.traits[bit]] : []);
  const candidates = saved.locked ? [target] : channels.filter(channel => measurements.every(trait =>
    channel.traits.some(candidate => candidate.label === trait.label && candidate.value === trait.value),
  ));

  let actions;
  if (saved.locked) actions = [{ id: 'bank', label: 'Bank signal intel' }];
  else if (saved.jammed) actions = [{ id: 'recalibrate', label: 'Recalibrate receiver' }];
  else {
    actions = FILTERS.filter(({ id }) => !scans.includes(id)).map(({ id, label }) => ({
      id: `scan-${id}`, label: `Scan ${label.toLowerCase()}`,
    }));
    const requiredScans = saved.misread ? FILTERS.length : FILTERS.length - 1;
    if (scans.length >= requiredScans) {
      actions.push(...candidates.map(channel => ({ id: `lock-${channel.id}`, label: `Lock ${channel.name}` })));
    }
  }
  return { route, candidates, measurements, actions, targetIndex };
}

export function describeSignal(routeIndex, tier, utcDay, saved = {}) {
  const { route, candidates, measurements, actions } = signalState(routeIndex, tier, utcDay, saved);
  return {
    name: route.name, finds: route.finds, candidates, measurements, actions,
    jammed: !!saved.jammed, misread: !!saved.misread, locked: !!saved.locked,
  };
}

export function advanceSignal(state, action) {
  const saved = state.operationState ?? {};
  const { actions, targetIndex } = signalState(state.route_index, state.tier, state.utc_day, saved);
  if (!actions.some(move => move.id === action)) return null;

  const next = { tier: state.tier, ore: 0, braced: 0, collapsed: 0 };
  if (action === 'bank') return { ...next, tier: state.tier + 1, operationState: {}, outcome: 'signal_banked' };
  if (action === 'recalibrate') {
    return { ...next, operationState: { ...saved, jammed: false }, outcome: 'signal_recalibrated' };
  }
  if (action.startsWith('scan-')) {
    return {
      ...next, operationState: { ...saved, scans: [...(saved.scans ?? []), action.slice(5)] },
      outcome: 'signal_scanned',
    };
  }
  const matched = Number(action.slice(5)) === targetIndex;
  return {
    ...next,
    operationState: matched ? { ...saved, locked: true } : { ...saved, jammed: true, misread: true },
    outcome: matched ? 'signal_locked' : 'signal_misread',
  };
}
