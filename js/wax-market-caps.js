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
  const status = panel.querySelector('[data-market-cap-status]');
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const pulses = new WeakMap();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const refreshInterval = 5 * 60 * 1000;
  let lastRefresh = null;

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

  async function loadMarketCap(row) {
    try {
      const response = await fetch(
        'https://wax-api.hivebp.io/v3/marketcap/' + encodeURIComponent(row.collection),
        { cache: 'no-store', signal: AbortSignal.timeout(12000) }
      );
      if (!response.ok) throw new Error('Market cap request failed');
      const { usdMarketCap } = await response.json();
      if (!Number.isFinite(usdMarketCap) || usdMarketCap < 0) throw new Error('Invalid USD market cap');

      const direction = row.marketCap === null ? 0 : Math.sign(usdMarketCap - row.marketCap);
      row.marketCap = usdMarketCap;
      const value = usd.format(usdMarketCap);
      row.prices.forEach(element => {
        element.removeAttribute('data-stale');
        element.removeAttribute('title');
        renderPrice(element, value, direction);
      });
      return true;
    } catch {
      row.prices.forEach(element => {
        element.setAttribute('data-stale', '');
        element.title = row.marketCap === null ? 'NFT Hive market cap unavailable' : 'Last available NFT Hive market cap';
      });
      return false;
    }
  }

  async function refreshMarketCaps() {
    const now = Date.now();
    if (document.hidden || (lastRefresh !== null && now - lastRefresh < refreshInterval)) return;
    lastRefresh = now;

    const results = await Promise.all(rows.map(loadMarketCap));
    const message = results.every(Boolean)
      ? 'Market caps from NFT Hive.'
      : 'Some NFT Hive market caps could not be refreshed.';
    if (status.textContent !== message) status.textContent = message;
  }

  refreshMarketCaps();
  setInterval(refreshMarketCaps, refreshInterval);
  document.addEventListener('visibilitychange', refreshMarketCaps);
})();
