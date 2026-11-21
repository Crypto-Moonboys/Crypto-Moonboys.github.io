(() => {
  const panel = document.querySelector('#wax-market-caps');
  if (!panel) return;

  const list = panel.querySelector('[data-ticker-list]');
  const copy = list.cloneNode(true);
  copy.classList.add('wax-ticker-copy');
  copy.setAttribute('aria-hidden', 'true');
  copy.querySelectorAll('a').forEach(link => { link.tabIndex = -1; });
  list.after(copy);

  const repeatedPrices = copy.querySelectorAll('[data-usd]');
  const rows = Array.from(list.querySelectorAll('[data-collection]'), (row, index) => ({
    collection: row.dataset.collection,
    prices: [row.querySelector('[data-usd]'), repeatedPrices[index]],
    marketCap: null
  }));
  const status = panel.querySelector('[data-quote-status]');
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const pulses = new WeakMap();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let price = null;
  let socket;
  let retry;
  let retryDelay = 1000;
  let suspended = false;

  const pause = panel.querySelector('[data-ticker-pause]');
  pause.hidden = false;
  pause.addEventListener('click', () => {
    const paused = panel.toggleAttribute('data-paused');
    pause.setAttribute('aria-pressed', String(paused));
    pause.firstElementChild.textContent = paused ? '▶' : 'Ⅱ';
  });
  // Keep a consistent speed at different viewport widths and font sizes.
  panel.setAttribute('data-scroll', '');
  new ResizeObserver(([entry]) => {
    panel.style.setProperty('--ticker-duration', `${entry.contentRect.width / 48}s`);
  }).observe(list);

  function renderPrice(element, value, direction) {
    if (element.textContent === value) return;
    element.textContent = value;
    if (!direction || typeof element.animate !== 'function') return;

    pulses.get(element)?.cancel();
    const color = direction > 0 ? '#59f59a' : '#ff727e';
    const keyframes = reducedMotion.matches
      ? [{ color }, { color }]
      : [{ color, textShadow: `0 0 12px ${color}` }, {}];
    pulses.set(element, element.animate(keyframes, { duration: 3000, easing: 'ease-out' }));
  }

  function render(row, direction = 0) {
    if (row.marketCap === null || price === null) return;
    const value = usd.format(row.marketCap * price);
    row.prices.forEach(element => renderPrice(element, value, direction));
  }

  async function loadMarketCap(row) {
    try {
      const response = await fetch(
        'https://wax-api.hivebp.io/v3/marketcap/' + encodeURIComponent(row.collection),
        { signal: AbortSignal.timeout(12000) }
      );
      if (!response.ok) throw new Error('Market cap request failed');
      const { waxMarketCap } = await response.json();
      if (!Number.isFinite(waxMarketCap) || waxMarketCap < 0) throw new Error('Invalid WAX market cap');
      row.marketCap = waxMarketCap;
      render(row);
    } catch {
      row.prices.forEach(element => { element.title = 'Market cap unavailable'; });
    }
  }

  function connect() {
    status.textContent = 'Connecting to the WAXP/USD feed…';
    const connection = new WebSocket('wss://stream.crypto.com/exchange/v1/market');
    socket = connection;
    connection.addEventListener('open', () => {
      connection.send(JSON.stringify({
        id: 1, method: 'subscribe', params: { channels: ['ticker.WAXP_USD'] }
      }));
    });
    connection.addEventListener('message', event => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.method === 'public/heartbeat') {
        connection.send(JSON.stringify({ id: message.id, method: 'public/respond-heartbeat' }));
        return;
      }
      if (message.result?.subscription !== 'ticker.WAXP_USD') return;
      const nextPrice = Number(message.result.data?.at(-1)?.a);
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) return;

      retryDelay = 1000;
      const direction = price === null ? 0 : Math.sign(nextPrice - price);
      price = nextPrice;
      panel.removeAttribute('data-stale');
      const liveStatus = 'Market caps converted at the live WAXP/USD quote.';
      if (status.textContent !== liveStatus) status.textContent = liveStatus;
      rows.forEach(row => render(row, direction));
    });
    connection.addEventListener('close', () => {
      if (suspended || socket !== connection) return;
      panel.setAttribute('data-stale', '');
      status.textContent = price === null
        ? 'WAXP/USD quote unavailable. Reconnecting…'
        : 'Showing last quote. Reconnecting…';
      retry = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    });
  }

  rows.forEach(loadMarketCap);
  connect();
  window.addEventListener('pagehide', () => {
    clearTimeout(retry);
    suspended = true;
    socket.close();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      suspended = false;
      connect();
    }
  });
})();
