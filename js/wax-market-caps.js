(() => {
  const panel = document.querySelector('#wax-market-caps');
  if (!panel) return;

  const rows = Array.from(panel.querySelectorAll('[data-collection]'), row => ({
    collection: row.dataset.collection,
    waxCell: row.querySelector('[data-wax]'),
    hiveUsdCell: row.querySelector('[data-hive-usd]'),
    usdCell: row.querySelector('[data-usd]'),
    marketCap: null
  }));
  const quote = panel.querySelector('[data-wax-quote]');
  const status = panel.querySelector('[data-quote-status]');
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const wax = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const rate = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 6, maximumFractionDigits: 8
  });
  let price = null;
  let socket;
  let retry;
  let retryDelay = 1000;
  let suspended = false;

  function render(row) {
    if (row.marketCap === null) return;
    row.waxCell.textContent = wax.format(row.marketCap);
    row.usdCell.textContent = price === null ? '—' : usd.format(row.marketCap * price);
  }

  async function loadMarketCap(row) {
    try {
      const response = await fetch(
        'https://wax-api.hivebp.io/v3/marketcap/' + encodeURIComponent(row.collection),
        { signal: AbortSignal.timeout(12000) }
      );
      if (!response.ok) throw new Error('Market cap request failed');
      const { waxMarketCap, usdMarketCap } = await response.json();
      row.hiveUsdCell.textContent = Number.isFinite(usdMarketCap) && usdMarketCap >= 0
        ? usd.format(usdMarketCap) : 'Unavailable';
      if (!Number.isFinite(waxMarketCap) || waxMarketCap < 0) throw new Error('Invalid WAX market cap');
      row.marketCap = waxMarketCap;
      render(row);
    } catch {
      row.waxCell.textContent = 'Unavailable';
      if (row.hiveUsdCell.textContent === '—') row.hiveUsdCell.textContent = 'Unavailable';
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
      price = nextPrice;
      quote.textContent = rate.format(price);
      status.textContent = 'Live quote from Crypto.com';
      rows.forEach(render);
    });
    connection.addEventListener('close', () => {
      if (suspended || socket !== connection) return;
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
