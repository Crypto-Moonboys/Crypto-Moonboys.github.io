const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd';
const DEFAULT_INTERVAL_MS = 90000;
const PUMP_THRESHOLD = 1.2;
const CRASH_THRESHOLD = -1.2;

function pctDelta(previous, next) {
  if (!Number.isFinite(previous) || !Number.isFinite(next) || previous <= 0) return 0;
  return ((next - previous) / previous) * 100;
}

export function createCryptoResonanceSystem({ fetchImpl = fetch, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  const state = {
    bitcoin: null,
    ethereum: null,
    lastUpdate: 0,
    started: false,
    timer: null,
  };

  async function fetchPrices() {
    const response = await fetchImpl(COINGECKO_URL, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`price feed ${response.status}`);
    const data = await response.json();
    return {
      bitcoin: Number(data?.bitcoin?.usd),
      ethereum: Number(data?.ethereum?.usd),
    };
  }

  function classifyEvent(asset, deltaPct) {
    if (deltaPct >= PUMP_THRESHOLD) {
      return {
        type: 'pump',
        asset,
        deltaPct,
        text: `📈 ${asset.toUpperCase()} pump ${deltaPct.toFixed(2)}% · SIGNAL BOOM`,
      };
    }
    if (deltaPct <= CRASH_THRESHOLD) {
      return {
        type: 'crash',
        asset,
        deltaPct,
        text: `📉 ${asset.toUpperCase()} crash ${Math.abs(deltaPct).toFixed(2)}% · SAM SURGE`,
      };
    }
    return null;
  }

  async function tick(hooks = {}) {
    const next = await fetchPrices();
    const events = [];

    if (Number.isFinite(state.bitcoin) && Number.isFinite(next.bitcoin)) {
      const delta = pctDelta(state.bitcoin, next.bitcoin);
      const event = classifyEvent('btc', delta);
      if (event) events.push(event);
    }

    if (Number.isFinite(state.ethereum) && Number.isFinite(next.ethereum)) {
      const delta = pctDelta(state.ethereum, next.ethereum);
      const event = classifyEvent('eth', delta);
      if (event) events.push(event);
    }

    state.bitcoin = next.bitcoin;
    state.ethereum = next.ethereum;
    state.lastUpdate = Date.now();

    hooks.onPrices?.({ ...next, lastUpdate: state.lastUpdate });
    events.forEach((event) => hooks.onEvent?.(event));
    return { prices: next, events };
  }

  function start(hooks = {}) {
    if (state.started) return;
    state.started = true;

    tick(hooks).catch(() => {});
    state.timer = setInterval(() => {
      tick(hooks).catch(() => {});
    }, intervalMs);
  }

  function stop() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    state.started = false;
  }

  return {
    start,
    stop,
    tick,
    getState: () => ({ ...state }),
  };
}
