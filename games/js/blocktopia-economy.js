const DEFAULT_STATE = {
  credits: 1200,
  spray: 8,
  batteries: 3,
  decoys: 1,
  signal: 0,
  positionSize: 0,
  avgEntry: 0,
  realizedPnL: 0,
  lastEvent: 'Economy booted.'
};

export function loadEconomyState() {
  try {
    const raw = localStorage.getItem('blocktopia_economy');
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveEconomyState(state) {
  try {
    localStorage.setItem('blocktopia_economy', JSON.stringify(state));
  } catch {}
}

export function rollMarketTick(marketMood = 'volatile') {
  const base = marketMood === 'volatile' ? 0.18 : 0.08;
  const drift = (Math.random() - 0.5) * (base * 2);
  const shock = Math.random() < 0.12 ? (Math.random() - 0.5) * 0.9 : 0;
  return Number((drift + shock).toFixed(4));
}

export function buyExposure(state, marketPrice, stake = 100) {
  if (state.credits < stake) {
    return { ...state, lastEvent: 'Not enough credits to enter trade.' };
  }
  const qty = stake / marketPrice;
  const totalCost = state.avgEntry * state.positionSize + marketPrice * qty;
  const totalQty = state.positionSize + qty;
  return {
    ...state,
    credits: Number((state.credits - stake).toFixed(2)),
    positionSize: Number(totalQty.toFixed(6)),
    avgEntry: Number((totalCost / totalQty).toFixed(6)),
    lastEvent: `Bought ${qty.toFixed(4)} MOON at ${marketPrice.toFixed(2)}`
  };
}

export function sellExposure(state, marketPrice, ratio = 0.5) {
  if (state.positionSize <= 0) {
    return { ...state, lastEvent: 'No open position to sell.' };
  }
  const qty = state.positionSize * ratio;
  const proceeds = qty * marketPrice;
  const costBasis = qty * state.avgEntry;
  const pnl = proceeds - costBasis;
  const remaining = state.positionSize - qty;
  return {
    ...state,
    credits: Number((state.credits + proceeds).toFixed(2)),
    positionSize: Number(remaining.toFixed(6)),
    avgEntry: remaining > 0 ? state.avgEntry : 0,
    realizedPnL: Number((state.realizedPnL + pnl).toFixed(2)),
    lastEvent: `Sold ${qty.toFixed(4)} MOON for ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} credits.`
  };
}

export function buyGear(state, item) {
  const catalog = {
    spray: { cost: 75, key: 'spray', amount: 3 },
    batteries: { cost: 140, key: 'batteries', amount: 1 },
    decoys: { cost: 220, key: 'decoys', amount: 1 }
  };
  const entry = catalog[item];
  if (!entry) return { ...state, lastEvent: 'Unknown item.' };
  if (state.credits < entry.cost) return { ...state, lastEvent: `Not enough credits for ${item}.` };
  return {
    ...state,
    credits: Number((state.credits - entry.cost).toFixed(2)),
    [entry.key]: state[entry.key] + entry.amount,
    lastEvent: `Bought ${item}.`
  };
}

export function scoreNightRun(state, districtControl, heatLevel, comboCount) {
  const districtBonus = Math.round((districtControl || 0) * 4);
  const heatBonus = Math.round(heatLevel * 35);
  const comboBonus = comboCount * 25;
  const signalGain = Math.max(1, Math.round((districtBonus + comboBonus) / 20));
  return {
    updatedEconomy: {
      ...state,
      signal: state.signal + signalGain,
      lastEvent: `Night run banked ${signalGain} signal fragments.`
    },
    metaScore: districtBonus + heatBonus + comboBonus,
    signalGain
  };
}
