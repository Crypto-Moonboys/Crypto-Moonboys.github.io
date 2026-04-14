/**
 * Crypto Moonboys Wiki — Live Price Ticker
 * =========================================
 * Fetches live price data from the CoinGecko public API (no key required).
 * Also fetches WAX DEX token prices from Alcor Exchange (wax.alcor.exchange).
 * Renders price cards with symbol, current price, 24h change, and SVG sparkline.
 * Fails gracefully if any data source is unavailable.
 *
 * Targets: any element with class .price-ticker-grid
 * Lazy-loads when the grid enters the viewport (IntersectionObserver).
 *
 * Config: see js/api-config.js
 */
(function () {
  'use strict';

  var cfg        = window.MOONBOYS_API || {};
  var BASE       = cfg.COINGECKO_BASE || 'https://api.coingecko.com/api/v3';
  var ALCOR_BASE = 'https://wax.alcor.exchange/api/v2';
  var ASSETS = cfg.TRACKED_ASSETS || [
    { id: 'wax',          symbol: 'WAXP', label: 'WAX',          icon: '💰' },
    { id: 'bitcoin',      symbol: 'BTC',  label: 'Bitcoin',      icon: '₿'  },
    { id: 'ethereum',     symbol: 'ETH',  label: 'Ethereum',     icon: 'Ξ'  },
    { id: 'bitcoin-cash', symbol: 'BCH',  label: 'Bitcoin Cash', icon: '₿C' },
    { id: 'ripple',       symbol: 'XRP',  label: 'XRP',          icon: '✕'  },
  ];
  var WAX_DEX_ASSETS = cfg.WAX_DEX_ASSETS || [
    { symbol: 'WAXCASH', label: 'WAXCASH', icon: '💵' },
    { symbol: 'NBG',     label: 'NBG',     icon: '🟢' },
    { symbol: 'WUFFI',   label: 'WUFFI',   icon: '🐾' },
    { symbol: 'PXJ',     label: 'PXJ',     icon: '🎮' },
    { symbol: 'WAXUSDC', label: 'WAXUSDC', icon: '💲' },
    { symbol: 'WAXUSDT', label: 'WAXUSDT', icon: '💱' },
    { symbol: 'LSWAX',   label: 'LSWAX',   icon: '🔒' },
    { symbol: 'CHEESE',  label: 'CHEESE',  icon: '🧀' },
    { symbol: 'KING',    label: 'KING',    icon: '👑' },
    { symbol: 'DMT',     label: 'DMT',     icon: '🌀' },
    { symbol: 'KEK',     label: 'KEK',     icon: '🐸' },
  ];

  // ── Formatting helpers ──────────────────────────────────────

  function formatPrice(price) {
    if (price >= 10000) return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (price >= 1)     return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 0.01)  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return '$' + price.toFixed(6);
  }

  function formatChange(change) {
    var sign = change >= 0 ? '+' : '';
    return sign + change.toFixed(2) + '%';
  }

  // ── SVG sparkline builder ───────────────────────────────────

  function buildSparklinePath(points) {
    if (!points || points.length < 2) return '';
    var prices = points.map(function (p) { return p[1]; });
    var min = Math.min.apply(null, prices);
    var max = Math.max.apply(null, prices);
    var range = max - min || 1;
    var W = 120, H = 40, PAD = 3;
    var pts = prices.map(function (p, i) {
      var x = (i / (prices.length - 1)) * W;
      var y = H - PAD - ((p - min) / range) * (H - PAD * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    return 'M' + pts.join(' L');
  }

  // ── Skeleton render ─────────────────────────────────────────

  function buildCardHtml(icon, symbol, label, id, isDex) {
    return '<div class="price-card price-card--loading' + (isDex ? ' price-card--wax-dex' : '') + '" data-asset-id="' + id + '">' +
      '<div class="price-card-header">' +
        '<span class="price-card-icon" aria-hidden="true">' + icon + '</span>' +
        '<div>' +
          '<div class="price-card-symbol">' + symbol + '</div>' +
          '<div class="price-card-label">' + label + (isDex ? ' <span class="price-card-dex-badge" title="WAX DEX">DEX</span>' : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="price-card-price" aria-live="polite">Loading…</div>' +
      '<div class="price-card-change">—</div>' +
      '<div class="price-card-chart">' +
        '<svg class="sparkline" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true">' +
          '<path class="sparkline-path" d="" fill="none" stroke-width="1.5"/>' +
        '</svg>' +
      '</div>' +
    '</div>';
  }

  function renderSkeletons(container) {
    var cg = ASSETS.map(function (a) {
      return buildCardHtml(a.icon, a.symbol, a.label, a.id, false);
    });
    var dex = WAX_DEX_ASSETS.map(function (a) {
      return buildCardHtml(a.icon, a.symbol, a.label, 'waxdex-' + a.symbol.toLowerCase(), true);
    });
    container.innerHTML = cg.concat(dex).join('');
  }

  // ── Card updater ────────────────────────────────────────────

  function updateCard(container, assetId, priceData, sparkData) {
    var card = container.querySelector('[data-asset-id="' + assetId + '"]');
    if (!card) return;
    var d = priceData[assetId];

    if (!d) {
      card.querySelector('.price-card-price').textContent = 'N/A';
      card.querySelector('.price-card-change').textContent = '—';
      card.classList.remove('price-card--loading');
      card.classList.add('price-card--unavailable');
      return;
    }

    var price  = d.usd;
    var change = d.usd_24h_change;
    var isPos  = change >= 0;

    card.querySelector('.price-card-price').textContent = formatPrice(price);

    var changeEl = card.querySelector('.price-card-change');
    changeEl.textContent = formatChange(change);
    changeEl.className = 'price-card-change ' + (isPos ? 'price-change-pos' : 'price-change-neg');

    if (sparkData && sparkData.prices) {
      var pathStr = buildSparklinePath(sparkData.prices);
      var pathEl  = card.querySelector('.sparkline-path');
      if (pathEl && pathStr) {
        pathEl.setAttribute('d', pathStr);
        pathEl.setAttribute('stroke', isPos ? '#3fb950' : '#ff7b72');
      }
    }

    card.classList.remove('price-card--loading');
  }

  function updateDexCard(container, symbol, usdPrice, change24h) {
    var id = 'waxdex-' + symbol.toLowerCase();
    var card = container.querySelector('[data-asset-id="' + id + '"]');
    if (!card) return;

    if (usdPrice == null) {
      card.querySelector('.price-card-price').textContent = 'N/A';
      card.querySelector('.price-card-change').textContent = '—';
      card.classList.remove('price-card--loading');
      card.classList.add('price-card--unavailable');
      return;
    }

    var isPos = (change24h || 0) >= 0;
    card.querySelector('.price-card-price').textContent = formatPrice(usdPrice);

    var changeEl = card.querySelector('.price-card-change');
    if (change24h != null) {
      changeEl.textContent = formatChange(change24h);
      changeEl.className = 'price-card-change ' + (isPos ? 'price-change-pos' : 'price-change-neg');
    } else {
      changeEl.textContent = '—';
    }
    card.classList.remove('price-card--loading');
  }

  // ── Fetch helpers ───────────────────────────────────────────

  function fetchPrices(ids) {
    return fetch(BASE + '/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true')
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function ()  { return {}; });
  }

  function fetchSparkline(id) {
    return fetch(BASE + '/coins/' + id + '/market_chart?vs_currency=usd&days=1')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function ()  { return null; });
  }

  // Fetch WAX DEX token prices from Alcor Exchange.
  // Returns a map of { SYMBOL_UPPER: { usd: number, change24h: number|null } }
  // Falls back to empty object on any error (graceful degradation).
  function fetchAlcorPrices() {
    return fetch(ALCOR_BASE + '/tokens?limit=300&network=wax', { mode: 'cors' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (tokens) {
        var map = {};
        if (!Array.isArray(tokens)) return map;
        tokens.forEach(function (t) {
          if (!t || !t.symbol) return;
          var sym = String(t.symbol).toUpperCase();
          var usd = (t.usdPrice != null) ? parseFloat(t.usdPrice) : null;
          map[sym] = { usd: (isNaN(usd) ? null : usd), change24h: null };
        });
        return map;
      })
      .catch(function () { return {}; });
  }

  // ── Main loader ─────────────────────────────────────────────

  function loadPrices(containers) {
    containers.forEach(function (c) { renderSkeletons(c); });

    var ids = ASSETS.map(function (a) { return a.id; }).join(',');

    // CoinGecko assets
    fetchPrices(ids).then(function (priceData) {
      // First pass: prices only (fast)
      containers.forEach(function (c) {
        ASSETS.forEach(function (a) { updateCard(c, a.id, priceData, null); });
      });

      // Second pass: sparklines (lazy, one per asset)
      var chain = Promise.resolve();
      ASSETS.forEach(function (asset) {
        chain = chain.then(function () {
          return fetchSparkline(asset.id).then(function (spark) {
            if (spark) {
              containers.forEach(function (c) {
                updateCard(c, asset.id, priceData, spark);
              });
            }
          });
        });
      });

      // Clear aria-busy once all updates are complete
      chain.then(function () {
        containers.forEach(function (c) { c.removeAttribute('aria-busy'); });
      });
    }).catch(function () {
      // On total failure, still clear aria-busy so screen readers don't hang
      containers.forEach(function (c) { c.removeAttribute('aria-busy'); });
    });

    // WAX DEX assets (Alcor) — fetched independently, failures are non-fatal
    if (WAX_DEX_ASSETS.length) {
      fetchAlcorPrices().then(function (alcorMap) {
        containers.forEach(function (container) {
          WAX_DEX_ASSETS.forEach(function (asset) {
            var entry = alcorMap[asset.symbol.toUpperCase()];
            if (entry) {
              updateDexCard(container, asset.symbol, entry.usd, entry.change24h);
            } else {
              // Mark as unavailable gracefully
              updateDexCard(container, asset.symbol, null, null);
            }
          });
        });
      }).catch(function () {
        // On Alcor failure, mark all DEX cards as unavailable
        containers.forEach(function (container) {
          WAX_DEX_ASSETS.forEach(function (asset) {
            updateDexCard(container, asset.symbol, null, null);
          });
        });
      });
    }
  }

  // ── Initialise with IntersectionObserver ────────────────────

  function init() {
    var containers = Array.prototype.slice.call(
      document.querySelectorAll('.price-ticker-grid')
    );
    if (!containers.length) return;

    if (typeof IntersectionObserver !== 'undefined') {
      var seen = false;
      var observer = new IntersectionObserver(function (entries) {
        if (seen) return;
        if (entries.some(function (e) { return e.isIntersecting; })) {
          seen = true;
          observer.disconnect();
          loadPrices(containers);
        }
      }, { rootMargin: '200px' });
      containers.forEach(function (c) { observer.observe(c); });
    } else {
      loadPrices(containers);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
